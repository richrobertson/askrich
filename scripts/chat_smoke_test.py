#!/usr/bin/env python3
"""Smoke test for Milestone 2 chat runtime.

This script:
1. Runs ingestion to ensure chunks exist
2. Sends representative recruiter questions to ChatService
3. Prints answer previews and citations
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPO_ROOT / "apps" / "api"

sys.path.insert(0, str(API_ROOT))

from app.config import settings
from app.routes.ingest import ingest
from app.routes.chat import get_chat_service
from app.models.api import ChatFilters


QUESTIONS = [
    {
        "question": "What migration work has Rich led?",
        "top_k": 5,
        "filters": None,
    },
    {
        "question": "How strong is Rich in Kubernetes and platform engineering?",
        "top_k": 5,
        "filters": ChatFilters(tags=["kubernetes", "platform", "cloud"]),
    },
    {
        "question": "What outcomes came from the Oracle modernization effort?",
        "top_k": 5,
        "filters": ChatFilters(doc_types=["projects"]),
    },
]


def main() -> int:
    print("=" * 60)
    print("Ask Rich Chat Smoke Test")
    print("=" * 60)

    print("\nSTEP 1: Ingestion")
    ingest_result = ingest()
    if not ingest_result.get("success"):
        print("Ingestion failed:", ingest_result.get("error"))
        return 1
    print(
        f"Ingested {ingest_result.get('documents_count')} docs, "
        f"{ingest_result.get('chunks_count')} chunks"
    )

    print("\nSTEP 2: Chat questions")
    service = get_chat_service()

    for i, item in enumerate(QUESTIONS, start=1):
        print(f"\nQ{i}: {item['question']}")
        response = service.answer(
            question=item["question"],
            top_k=item["top_k"],
            filters=item["filters"],
            tone="clear and recruiter-friendly",
        )

        answer = response.get("answer", "")
        print("Answer preview:")
        print(answer[:500] + ("..." if len(answer) > 500 else ""))
        print("Citations:")
        for citation in response.get("citations", []):
            if hasattr(citation, "model_dump"):
                citation = citation.model_dump()
            print(
                f"- {citation.get('id')} | {citation.get('title')} "
                f"(chunk {citation.get('chunk_index')})"
            )

    print("\nSTEP 3: Settings used")
    print(f"EMBEDDING_PROVIDER={settings.embedding_provider or 'hash(local default)'}")
    print(f"LLM_PROVIDER={settings.llm_provider or 'extractive(local default)'}")

    print("\nChat smoke test complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
