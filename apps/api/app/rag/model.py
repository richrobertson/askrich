"""Provider-agnostic text generation model interface and local fallback."""

from abc import ABC, abstractmethod
from typing import Any


class ModelClient(ABC):
    """Abstract generation model client interface."""

    @abstractmethod
    def generate_answer(
        self,
        question: str,
        evidence_snippets: list[dict[str, Any]],
        instructions: str,
        toon: str | None = None,
    ) -> str:
        """Generate an answer from question + retrieved evidence."""
        raise NotImplementedError


class ExtractiveModelClient(ModelClient):
    """Local fallback model that produces evidence-grounded, concise output."""

    def generate_answer(
        self,
        question: str,
        evidence_snippets: list[dict[str, Any]],
        instructions: str,
        toon: str | None = None,
    ) -> str:
        del instructions

        if not evidence_snippets:
            return (
                "Summary: I do not have enough evidence in the indexed corpus to answer this confidently.\n"
                "- Unknown: No relevant source chunks were retrieved.\n"
                "- Next step: Rephrase the question or ingest additional source material."
            )

        summary_line = self._build_summary(evidence_snippets)

        bullets: list[str] = []
        for snippet in evidence_snippets[:4]:
            text = (snippet.get("text") or "").strip().replace("\n", " ")
            clipped = text[:220].rstrip()
            if clipped and clipped[-1] not in ".!?":
                clipped += "..."
            source_title = (
                (snippet.get("metadata") or {}).get("doc_title")
                or (snippet.get("metadata") or {}).get("doc_id")
                or "source"
            )
            bullets.append(f"- {clipped} ({source_title})")

        if toon:
            bullets.append(f"- Tone note applied: {toon[:140].strip()}")

        if not bullets:
            bullets.append("- Unknown: Retrieved content was empty after formatting.")

        return "\n".join([f"Summary: {summary_line}", *bullets])

    def _build_summary(self, evidence_snippets: list[dict[str, Any]]) -> str:
        top = evidence_snippets[0]
        title = (top.get("metadata") or {}).get("doc_title") or "retrieved sources"
        return f"Based on retrieved evidence, the strongest support comes from {title}."


def get_model_client(provider: str) -> ModelClient:
    """Factory for generation model clients.

    Provider-specific SDK clients are intentionally deferred; for Milestone 2,
    return a deterministic local extractive client to keep runtime functional.
    """
    del provider
    return ExtractiveModelClient()
