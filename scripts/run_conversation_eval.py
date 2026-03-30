#!/usr/bin/env python3
"""Run multi-turn recruiter/hiring-manager conversation QA against /api/chat.

Outputs:
- JSON run artifact with per-turn checks, answers, citations, and signal strengths
- CSV turn-level sheet for manual review
- CSV signal cross-reference report by desired signal
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
DEFAULT_BANK_PATH = REPO_ROOT / "docs" / "evals" / "recruiter_hiring_manager_conversation_bank_public.json"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "evals"


@dataclass
class EvalConfig:
    api_base: str
    conversation_bank: Path
    output_dir: Path
    top_k: int | None
    fail_fast: bool
    origin: str | None
    user_agent: str


def parse_args() -> EvalConfig:
    parser = argparse.ArgumentParser(description="Run conversation QA bank against Ask Rich /api/chat.")
    parser.add_argument(
        "--api-base",
        default="http://127.0.0.1:8000",
        help="Base URL for API host (default: %(default)s)",
    )
    parser.add_argument(
        "--conversation-bank",
        default=str(DEFAULT_BANK_PATH),
        help="Path to JSON conversation bank",
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
        help="Optional top_k override for all turns",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="Stop on first failed turn",
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
        conversation_bank=Path(args.conversation_bank),
        output_dir=Path(args.output_dir),
        top_k=args.top_k,
        fail_fast=bool(args.fail_fast),
        origin=str(args.origin).strip() if args.origin else None,
        user_agent=str(args.user_agent).strip(),
    )


def load_conversation_bank(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Conversation bank not found: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("Conversation bank root must be a JSON array")

    seen_ids: set[str] = set()
    validated: list[dict[str, Any]] = []
    for idx, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Conversation #{idx} is not an object")

        cid = str(item.get("id", "")).strip()
        category = str(item.get("category", "")).strip() or "uncategorized"
        source_url = str(item.get("source_url", "")).strip()
        source_note = str(item.get("source_note", "")).strip()
        turns = item.get("turns")

        if not cid:
            raise ValueError(f"Conversation #{idx} missing id")
        if cid in seen_ids:
            raise ValueError(f"Duplicate conversation id: {cid}")
        if not isinstance(turns, list) or len(turns) == 0:
            raise ValueError(f"Conversation '{cid}' must include at least one turn")

        checked_turns: list[dict[str, Any]] = []
        for turn_idx, turn in enumerate(turns, start=1):
            if not isinstance(turn, dict):
                raise ValueError(f"Conversation '{cid}' turn #{turn_idx} is not an object")

            user = str(turn.get("user", "")).strip()
            checks = turn.get("checks")
            if len(user) < 2:
                raise ValueError(f"Conversation '{cid}' turn #{turn_idx} has invalid user text")
            if checks is not None and not isinstance(checks, dict):
                raise ValueError(f"Conversation '{cid}' turn #{turn_idx} checks must be an object")

            checked_turns.append(
                {
                    "user": user,
                    "checks": checks or {},
                    "top_k": turn.get("top_k"),
                    "tone": turn.get("tone"),
                    "filters": turn.get("filters"),
                    "desired_signals": turn.get("desired_signals") or [],
                }
            )

        seen_ids.add(cid)
        validated.append(
            {
                "id": cid,
                "category": category,
                "source_url": source_url,
                "source_note": source_note,
                "turns": checked_turns,
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
        "User-Agent": user_agent or "askrich-conversation-eval/1.0",
    }
    if origin:
        headers["Origin"] = origin
        headers["Referer"] = f"{origin.rstrip('/')}/"

    req = request.Request(url=url, data=payload, headers=headers, method="POST")

    try:
        with request.urlopen(req, timeout=timeout_seconds) as resp:  # nosec B310
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


def normalize_top_k(raw_top_k: Any) -> int | None:
    if raw_top_k is None:
        return None
    try:
        value = int(raw_top_k)
    except (TypeError, ValueError):
        return None
    if not 1 <= value <= 20:
        return None
    return value


def text_contains_phrase(answer: str, phrase: str) -> bool:
    return phrase.lower() in answer.lower()


def evaluate_checks(answer: str, citations: list[Any], checks: dict[str, Any]) -> dict[str, Any]:
    answer = str(answer or "")
    citations = citations if isinstance(citations, list) else []

    should_contain_any = [str(x) for x in checks.get("should_contain_any", []) if str(x).strip()]
    should_contain_all = [str(x) for x in checks.get("should_contain_all", []) if str(x).strip()]
    should_not_contain = [str(x) for x in checks.get("should_not_contain", []) if str(x).strip()]
    max_chars = checks.get("max_chars")
    min_citation_count = checks.get("min_citation_count")
    max_citation_count = checks.get("max_citation_count")

    matched_any = [p for p in should_contain_any if text_contains_phrase(answer, p)]
    missing_all = [p for p in should_contain_all if not text_contains_phrase(answer, p)]
    found_forbidden = [p for p in should_not_contain if text_contains_phrase(answer, p)]

    rules: list[dict[str, Any]] = []

    if should_contain_any:
        rules.append(
            {
                "name": "should_contain_any",
                "pass": len(matched_any) > 0,
                "details": {"matched": matched_any, "expected": should_contain_any},
            }
        )

    if should_contain_all:
        rules.append(
            {
                "name": "should_contain_all",
                "pass": len(missing_all) == 0,
                "details": {"missing": missing_all, "expected": should_contain_all},
            }
        )

    if should_not_contain:
        rules.append(
            {
                "name": "should_not_contain",
                "pass": len(found_forbidden) == 0,
                "details": {"found": found_forbidden, "forbidden": should_not_contain},
            }
        )

    if isinstance(max_chars, int):
        rules.append(
            {
                "name": "max_chars",
                "pass": len(answer) <= max_chars,
                "details": {"actual": len(answer), "max": max_chars},
            }
        )

    if isinstance(min_citation_count, int):
        rules.append(
            {
                "name": "min_citation_count",
                "pass": len(citations) >= min_citation_count,
                "details": {"actual": len(citations), "min": min_citation_count},
            }
        )

    if isinstance(max_citation_count, int):
        rules.append(
            {
                "name": "max_citation_count",
                "pass": len(citations) <= max_citation_count,
                "details": {"actual": len(citations), "max": max_citation_count},
            }
        )

    passed = all(r.get("pass") for r in rules) if rules else True
    return {"passed": passed, "rules": rules}


def derive_desired_signals(conversation_id: str, turn_index: int, checks: dict[str, Any]) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for term in checks.get("should_contain_all", []) or []:
        t = str(term).strip()
        if t:
            signals.append({"name": f"required:{t.lower()}", "terms": [t]})

    for term in checks.get("should_contain_any", []) or []:
        t = str(term).strip()
        if t:
            signals.append({"name": f"desired:{t.lower()}", "terms": [t]})

    if signals:
        return signals

    return [
        {
            "name": f"conversation:{conversation_id}:turn:{turn_index}",
            "terms": [],
        }
    ]


def compute_signal_strengths(
    answer: str,
    desired_signals: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    strengths: list[dict[str, Any]] = []
    normalized_answer = str(answer or "").lower()

    for signal in desired_signals:
        name = str(signal.get("name", "")).strip() or "unnamed-signal"
        terms = [str(t).strip() for t in signal.get("terms", []) if str(t).strip()]

        if not terms:
            strength = 1.0 if normalized_answer else 0.0
            strengths.append(
                {
                    "name": name,
                    "terms": [],
                    "matched_terms": [],
                    "strength": strength,
                    "pass": strength >= 1.0,
                }
            )
            continue

        matched_terms = [t for t in terms if t.lower() in normalized_answer]
        strength = round(len(matched_terms) / len(terms), 3)
        strengths.append(
            {
                "name": name,
                "terms": terms,
                "matched_terms": matched_terms,
                "strength": strength,
                "pass": strength >= 1.0,
            }
        )

    return strengths


def run_eval(config: EvalConfig, conversations: list[dict[str, Any]]) -> dict[str, Any]:
    run_started = datetime.now(timezone.utc)
    turn_results: list[dict[str, Any]] = []

    for convo in conversations:
        conversation_id = convo["id"]
        history: list[dict[str, str]] = []

        for turn_index, turn in enumerate(convo["turns"], start=1):
            top_k = normalize_top_k(config.top_k if config.top_k is not None else turn.get("top_k"))

            body: dict[str, Any] = {
                "question": turn["user"],
                "history": history,
            }
            if top_k is not None:
                body["top_k"] = top_k
            if turn.get("tone"):
                body["tone"] = turn["tone"]
            if turn.get("filters"):
                body["filters"] = turn["filters"]

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
            answer = (data or {}).get("answer", "") if isinstance(data, dict) else ""
            citations = (data or {}).get("citations", []) if isinstance(data, dict) else []

            checks = evaluate_checks(answer, citations, turn.get("checks", {}))

            desired_signals = turn.get("desired_signals") or derive_desired_signals(
                conversation_id=conversation_id,
                turn_index=turn_index,
                checks=turn.get("checks", {}),
            )
            signal_strengths = compute_signal_strengths(answer, desired_signals)

            turn_passed = success and checks["passed"]

            turn_result = {
                "conversation_id": conversation_id,
                "category": convo["category"],
                "source_url": convo.get("source_url", ""),
                "source_note": convo.get("source_note", ""),
                "turn_index": turn_index,
                "question": turn["user"],
                "request": body,
                "status_code": status,
                "success": success,
                "error": None if success else extract_error_message(status, payload),
                "latency_ms": latency_ms,
                "answer": answer,
                "answer_chars": len(answer),
                "citations": citations if isinstance(citations, list) else [],
                "citation_count": len(citations) if isinstance(citations, list) else 0,
                "checks": checks,
                "signal_strengths": signal_strengths,
                "turn_passed": turn_passed,
            }
            turn_results.append(turn_result)

            history.append({"role": "user", "content": turn["user"]})
            if answer:
                history.append({"role": "assistant", "content": answer})

            state = "ok" if turn_passed else "error"
            print(f"[{state}] {conversation_id} turn {turn_index} {latency_ms}ms")
            if not turn_passed and config.fail_fast:
                break

        if config.fail_fast and turn_results and not turn_results[-1]["turn_passed"]:
            break

    signal_map: dict[str, dict[str, Any]] = {}
    for result in turn_results:
        key_prefix = f"{result['conversation_id']}#t{result['turn_index']}"
        for signal in result.get("signal_strengths", []):
            name = signal["name"]
            if name not in signal_map:
                signal_map[name] = {
                    "signal": name,
                    "occurrences": 0,
                    "avg_strength": 0.0,
                    "pass_count": 0,
                    "fail_count": 0,
                    "example_turns": [],
                }

            row = signal_map[name]
            row["occurrences"] += 1
            row["avg_strength"] += float(signal.get("strength", 0.0))
            if signal.get("pass"):
                row["pass_count"] += 1
            else:
                row["fail_count"] += 1
            if len(row["example_turns"]) < 5:
                row["example_turns"].append(key_prefix)

    signal_summary = []
    for _, row in sorted(signal_map.items(), key=lambda item: item[0]):
        occurrences = max(1, int(row["occurrences"]))
        avg_strength = round(float(row["avg_strength"]) / occurrences, 3)
        pass_rate = round(float(row["pass_count"]) / occurrences, 3)
        signal_summary.append(
            {
                "signal": row["signal"],
                "occurrences": row["occurrences"],
                "avg_strength": avg_strength,
                "pass_rate": pass_rate,
                "pass_count": row["pass_count"],
                "fail_count": row["fail_count"],
                "example_turns": row["example_turns"],
            }
        )

    successes = [r for r in turn_results if r["turn_passed"]]
    failures = [r for r in turn_results if not r["turn_passed"]]
    avg_latency = round(sum(r["latency_ms"] for r in turn_results) / len(turn_results)) if turn_results else 0

    return {
        "run_started_utc": run_started.isoformat(),
        "run_finished_utc": datetime.now(timezone.utc).isoformat(),
        "api_base": config.api_base,
        "origin": config.origin,
        "user_agent": config.user_agent,
        "conversation_bank": str(config.conversation_bank),
        "summary": {
            "total_turns": len(turn_results),
            "passed_turns": len(successes),
            "failed_turns": len(failures),
            "avg_latency_ms": avg_latency,
            "avg_citation_count": round(
                sum(r["citation_count"] for r in turn_results) / len(turn_results), 2
            )
            if turn_results
            else 0,
        },
        "signal_summary": signal_summary,
        "results": turn_results,
    }


def write_outputs(config: EvalConfig, report: dict[str, Any]) -> tuple[Path, Path, Path]:
    config.output_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    json_path = config.output_dir / f"conversation_eval_run_{stamp}.json"
    turns_csv_path = config.output_dir / f"conversation_eval_turns_{stamp}.csv"
    signals_csv_path = config.output_dir / f"conversation_eval_signal_strength_{stamp}.csv"

    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    with turns_csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "conversation_id",
                "category",
                "turn_index",
                "question",
                "status_code",
                "turn_passed",
                "latency_ms",
                "citation_count",
                "answer_chars",
                "answer",
                "checks_json",
                "signal_strengths_json",
                "source_url",
                "source_note",
            ],
        )
        writer.writeheader()
        for row in report.get("results", []):
            writer.writerow(
                {
                    "conversation_id": row.get("conversation_id"),
                    "category": row.get("category"),
                    "turn_index": row.get("turn_index"),
                    "question": row.get("question"),
                    "status_code": row.get("status_code"),
                    "turn_passed": row.get("turn_passed"),
                    "latency_ms": row.get("latency_ms"),
                    "citation_count": row.get("citation_count"),
                    "answer_chars": row.get("answer_chars"),
                    "answer": row.get("answer", ""),
                    "checks_json": json.dumps(row.get("checks", {}), ensure_ascii=False),
                    "signal_strengths_json": json.dumps(
                        row.get("signal_strengths", []), ensure_ascii=False
                    ),
                    "source_url": row.get("source_url", ""),
                    "source_note": row.get("source_note", ""),
                }
            )

    with signals_csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "signal",
                "occurrences",
                "avg_strength",
                "pass_rate",
                "pass_count",
                "fail_count",
                "example_turns",
            ],
        )
        writer.writeheader()
        for row in report.get("signal_summary", []):
            writer.writerow(
                {
                    "signal": row.get("signal"),
                    "occurrences": row.get("occurrences"),
                    "avg_strength": row.get("avg_strength"),
                    "pass_rate": row.get("pass_rate"),
                    "pass_count": row.get("pass_count"),
                    "fail_count": row.get("fail_count"),
                    "example_turns": " | ".join(row.get("example_turns", [])),
                }
            )

    return json_path, turns_csv_path, signals_csv_path


def main() -> int:
    config = parse_args()
    conversations = load_conversation_bank(config.conversation_bank)

    print("=" * 72)
    print("Ask Rich Conversation QA Runner")
    print("=" * 72)
    print(f"API base: {config.api_base}")
    if config.origin:
        print(f"Origin header: {config.origin}")
    print(f"Conversation bank: {config.conversation_bank}")
    print(f"Conversations: {len(conversations)}")

    report = run_eval(config, conversations)
    json_path, turns_csv_path, signals_csv_path = write_outputs(config, report)

    summary = report.get("summary", {})
    print("\nSummary")
    print(f"- total turns: {summary.get('total_turns', 0)}")
    print(f"- passed turns: {summary.get('passed_turns', 0)}")
    print(f"- failed turns: {summary.get('failed_turns', 0)}")
    print(f"- avg latency (ms): {summary.get('avg_latency_ms', 0)}")
    print(f"- avg citation count: {summary.get('avg_citation_count', 0)}")
    print("\nSignal cross-reference")
    for row in report.get("signal_summary", [])[:10]:
        print(
            f"- {row['signal']}: avg_strength={row['avg_strength']}, pass_rate={row['pass_rate']}, "
            f"occurrences={row['occurrences']}"
        )

    print(f"\nWrote: {json_path}")
    print(f"Wrote: {turns_csv_path}")
    print(f"Wrote: {signals_csv_path}")

    return 0 if summary.get("failed_turns", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
