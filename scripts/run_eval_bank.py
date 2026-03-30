#!/usr/bin/env python3
"""Run a portable recruiter QA question bank against /api/chat.

Outputs:
- JSON run artifact with question, answer, citations, latency, and error details
- CSV rubric sheet template for manual scoring (1-5 across core dimensions)
"""

from __future__ import annotations

import argparse
import csv
import json
import socket
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BANK_PATH = REPO_ROOT / "docs" / "evals" / "question_bank.json"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "evals"


@dataclass
class EvalConfig:
    api_base: str
    question_bank: Path
    output_dir: Path
    top_k: int | None
    fail_fast: bool
    origin: str | None
    user_agent: str


def parse_args() -> EvalConfig:
    parser = argparse.ArgumentParser(description="Run Ask Rich eval question bank.")
    parser.add_argument(
        "--api-base",
        default="http://127.0.0.1:8000",
        help="Base URL for API host (default: %(default)s)",
    )
    parser.add_argument(
        "--question-bank",
        default=str(DEFAULT_BANK_PATH),
        help="Path to JSON question bank",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory for JSON/CSV run artifacts",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=None,
        help="Optional top_k override for all questions",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="Stop on first request failure",
    )
    parser.add_argument(
        "--origin",
        default=None,
        help="Optional Origin header for edge/CORS protected prod endpoints",
    )
    parser.add_argument(
        "--user-agent",
        default=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
        help="User-Agent header used for requests",
    )

    args = parser.parse_args()
    return EvalConfig(
        api_base=args.api_base.rstrip("/"),
        question_bank=Path(args.question_bank),
        output_dir=Path(args.output_dir),
        top_k=args.top_k,
        fail_fast=bool(args.fail_fast),
        origin=str(args.origin).strip() if args.origin else None,
        user_agent=str(args.user_agent).strip(),
    )


def load_question_bank(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Question bank not found: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("Question bank root must be a JSON array")

    validated: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for i, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Question #{i} is not a JSON object")

        qid = str(item.get("id", "")).strip()
        question = str(item.get("question", "")).strip()
        category = str(item.get("category", "")).strip() or "uncategorized"

        if not qid:
            raise ValueError(f"Question #{i} missing 'id'")
        if qid in seen_ids:
            raise ValueError(f"Duplicate question id: {qid}")
        if len(question) < 3:
            raise ValueError(f"Question '{qid}' has invalid question text")

        seen_ids.add(qid)
        validated.append(
            {
                "id": qid,
                "category": category,
                "question": question,
                "filters": item.get("filters") or None,
                "tone": item.get("tone") or None,
                "top_k": item.get("top_k"),
            }
        )

    return validated


def post_json(
    url: str,
    body: dict[str, Any],
    timeout_seconds: float = 30.0,
    origin: str | None = None,
    user_agent: str | None = None,
) -> tuple[int, dict[str, Any]]:
    payload = json.dumps(body).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": user_agent or "askrich-eval-runner/1.0",
    }
    if origin:
        headers["Origin"] = origin
        headers["Referer"] = f"{origin.rstrip('/')}/"

    req = request.Request(
        url=url,
        data=payload,
        headers=headers,
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=timeout_seconds) as resp:  # nosec B310 -- URL is developer-supplied in eval tooling
            status = resp.getcode() or 0
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw:
                return status, {}
            try:
                return status, json.loads(raw)
            except json.JSONDecodeError:
                return status, {"error": f"Non-JSON response body: {raw}"}
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"error": raw}
        return exc.code, parsed
    except (error.URLError, TimeoutError, socket.timeout) as exc:
        reason = getattr(exc, "reason", None)
        detail = str(reason if reason is not None else exc)
        return 0, {"error": f"Transport error: {detail}"}


def extract_error_message(status: int, payload: dict[str, Any]) -> str:
    err = payload.get("error")
    if isinstance(err, str) and err.strip():
        return err

    detail = payload.get("detail")
    if isinstance(detail, str) and detail.strip():
        return detail
    if detail is not None:
        return json.dumps(detail, ensure_ascii=False)

    return f"Request failed with status {status} and body: {json.dumps(payload, ensure_ascii=False)}"


def normalize_top_k(raw_top_k: Any, question_id: str) -> tuple[int | None, str | None]:
    if raw_top_k is None:
        return None, None

    try:
        value = int(raw_top_k)
    except (TypeError, ValueError):
        return (
            None,
            f"Invalid top_k value {raw_top_k!r} for question {question_id}; must be an integer between 1 and 20.",
        )

    if not 1 <= value <= 20:
        return (
            None,
            f"Invalid top_k value {value} for question {question_id}; must be between 1 and 20.",
        )

    return value, None


def run_eval(config: EvalConfig, questions: list[dict[str, Any]]) -> dict[str, Any]:
    run_started = datetime.now(timezone.utc)
    results: list[dict[str, Any]] = []

    for item in questions:
        top_k_source = config.top_k if config.top_k is not None else item.get("top_k")
        normalized_top_k, top_k_error = normalize_top_k(top_k_source, item["id"])
        body: dict[str, Any] = {
            "question": item["question"],
        }
        if top_k_source is not None:
            body["top_k"] = top_k_source
        if item.get("filters"):
            body["filters"] = item["filters"]
        if item.get("tone"):
            body["tone"] = item["tone"]

        if top_k_error is not None:
            result = {
                "id": item["id"],
                "category": item["category"],
                "question": item["question"],
                "request": body,
                "status_code": 0,
                "success": False,
                "error": top_k_error,
                "latency_ms": 0,
                "answer": "",
                "answer_chars": 0,
                "citations": [],
                "citation_count": 0,
                "retrieved_chunks": 0,
            }
            results.append(result)

            print(f"[error] {item['id']} ({item['category']}) 0ms")
            print(f"  -> {result['error']}")
            if config.fail_fast:
                break
            continue

        if normalized_top_k is not None:
            body["top_k"] = normalized_top_k

        started = time.perf_counter()
        status, payload = post_json(
            f"{config.api_base}/api/chat",
            body,
            origin=config.origin,
            user_agent=config.user_agent,
        )
        latency_ms = round((time.perf_counter() - started) * 1000)

        success = bool(payload.get("success")) and status == 200
        data = payload.get("data") if isinstance(payload, dict) else None
        citations = (data or {}).get("citations", []) if isinstance(data, dict) else []
        answer = (data or {}).get("answer", "") if isinstance(data, dict) else ""

        result = {
            "id": item["id"],
            "category": item["category"],
            "question": item["question"],
            "request": body,
            "status_code": status,
            "success": success,
            "error": None if success else extract_error_message(status, payload),
            "latency_ms": latency_ms,
            "answer": answer,
            "answer_chars": len(answer),
            "citations": citations if isinstance(citations, list) else [],
            "citation_count": len(citations) if isinstance(citations, list) else 0,
            "retrieved_chunks": (data or {}).get("retrieved_chunks", 0)
            if isinstance(data, dict)
            else 0,
        }
        results.append(result)

        state = "ok" if success else "error"
        print(f"[{state}] {item['id']} ({item['category']}) {latency_ms}ms")
        if not success:
            print(f"  -> {result['error']}")
            if config.fail_fast:
                break

    successes = [r for r in results if r["success"]]
    failures = [r for r in results if not r["success"]]
    avg_latency = round(sum(r["latency_ms"] for r in results) / len(results)) if results else 0

    return {
        "run_started_utc": run_started.isoformat(),
        "run_finished_utc": datetime.now(timezone.utc).isoformat(),
        "api_base": config.api_base,
        "origin": config.origin,
        "user_agent": config.user_agent,
        "question_bank": str(config.question_bank),
        "summary": {
            "total": len(results),
            "successes": len(successes),
            "failures": len(failures),
            "avg_latency_ms": avg_latency,
            "avg_citation_count": round(
                sum(r["citation_count"] for r in results) / len(results), 2
            )
            if results
            else 0,
        },
        "results": results,
    }


def write_outputs(config: EvalConfig, report: dict[str, Any]) -> tuple[Path, Path]:
    config.output_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    json_path = config.output_dir / f"eval_run_{stamp}.json"
    csv_path = config.output_dir / f"eval_rubric_{stamp}.csv"

    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "id",
                "category",
                "question",
                "status_code",
                "latency_ms",
                "citation_count",
                "answer",
                "citations_json",
                "correctness_1_to_5",
                "relevance_1_to_5",
                "recruiter_usefulness_1_to_5",
                "citation_quality_1_to_5",
                "conciseness_1_to_5",
                "failure_modes",
                "notes",
            ],
        )
        writer.writeheader()

        for row in report.get("results", []):
            writer.writerow(
                {
                    "id": row.get("id"),
                    "category": row.get("category"),
                    "question": row.get("question"),
                    "status_code": row.get("status_code"),
                    "latency_ms": row.get("latency_ms"),
                    "citation_count": row.get("citation_count"),
                    "answer": row.get("answer", ""),
                    "citations_json": json.dumps(row.get("citations", []), ensure_ascii=False),
                    "correctness_1_to_5": "",
                    "relevance_1_to_5": "",
                    "recruiter_usefulness_1_to_5": "",
                    "citation_quality_1_to_5": "",
                    "conciseness_1_to_5": "",
                    "failure_modes": "",
                    "notes": "",
                }
            )

    return json_path, csv_path


def main() -> int:
    config = parse_args()
    questions = load_question_bank(config.question_bank)

    print("=" * 68)
    print("Ask Rich Evaluation Runner")
    print("=" * 68)
    print(f"API base: {config.api_base}")
    if config.origin:
        print(f"Origin header: {config.origin}")
    print(f"Question bank: {config.question_bank}")
    print(f"Questions: {len(questions)}")

    report = run_eval(config, questions)
    json_path, csv_path = write_outputs(config, report)

    summary = report.get("summary", {})
    print("\nSummary")
    print(f"- total: {summary.get('total', 0)}")
    print(f"- successes: {summary.get('successes', 0)}")
    print(f"- failures: {summary.get('failures', 0)}")
    print(f"- avg latency (ms): {summary.get('avg_latency_ms', 0)}")
    print(f"- avg citation count: {summary.get('avg_citation_count', 0)}")
    print(f"\nWrote: {json_path}")
    print(f"Wrote: {csv_path}")

    return 0 if summary.get("failures", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
