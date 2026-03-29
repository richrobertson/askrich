"""Provider-agnostic text generation model interface and local fallback."""

from abc import ABC, abstractmethod
import json
import logging
from typing import Any

import httpx


logger = logging.getLogger(__name__)


class ModelClient(ABC):
    """Abstract generation model client interface."""

    @abstractmethod
    def generate_answer(
        self,
        question: str,
        evidence_snippets: list[dict[str, Any]],
        instructions: str,
        tone: str | None = None,
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
        tone: str | None = None,
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

        if tone:
            bullets.append(f"- Tone note applied: {tone[:140].strip()}")

        if not bullets:
            bullets.append("- Unknown: Retrieved content was empty after formatting.")

        return "\n".join([f"Summary: {summary_line}", *bullets])

    def _build_summary(self, evidence_snippets: list[dict[str, Any]]) -> str:
        top = evidence_snippets[0]
        title = (top.get("metadata") or {}).get("doc_title") or "retrieved sources"
        return f"Based on retrieved evidence, the strongest support comes from {title}."


class OpenAICompatibleModelClient(ModelClient):
    """Model client for any OpenAI-compatible chat completions API.

    Works with OpenAI, Together AI, Groq, Ollama, vLLM, LM Studio, and any
    service that implements the /chat/completions endpoint contract.
    Falls back to ExtractiveModelClient on transport or API errors so the
    service degrades gracefully rather than returning 500s.
    """

    _TIMEOUT = 60.0

    def __init__(
        self,
        api_base: str,
        api_key: str,
        model: str,
        temperature: float = 0.0,
    ) -> None:
        if not api_base:
            raise ValueError("api_base is required for OpenAICompatibleModelClient")
        if not model:
            raise ValueError("model is required for OpenAICompatibleModelClient")
        self._api_base = api_base.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._temperature = max(0.0, min(float(temperature), 2.0))

    def generate_answer(
        self,
        question: str,
        evidence_snippets: list[dict[str, Any]],
        instructions: str,
        tone: str | None = None,
    ) -> str:
        logger.info("OpenAICompatibleModelClient.generate_answer called with model=%s, api_base=%s", self._model, self._api_base)
        system_content = self._build_system_prompt(instructions, evidence_snippets, tone)
        payload = {
            "model": self._model,
            "temperature": self._temperature,
            "messages": [
                {"role": "system", "content": system_content},
                {"role": "user", "content": question},
            ],
        }
        headers = {
            "Content-Type": "application/json",
        }
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        try:
            with httpx.Client(timeout=self._TIMEOUT) as client:
                response = client.post(
                    f"{self._api_base}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                answer = data["choices"][0]["message"]["content"]
                logger.info("OpenAI API returned successfully")
                return answer
        except (httpx.HTTPError, KeyError, json.JSONDecodeError, IndexError) as exc:
            logger.error(
                "LLM inference call failed (%s): %s; falling back to extractive mode.",
                type(exc).__name__,
                exc,
            )
            return ExtractiveModelClient().generate_answer(
                question=question,
                evidence_snippets=evidence_snippets,
                instructions=instructions,
                tone=tone,
            )

    def _build_system_prompt(
        self,
        instructions: str,
        evidence_snippets: list[dict[str, Any]],
        tone: str | None,
    ) -> str:
        parts: list[str] = [instructions]

        if tone:
            parts.append(f"Tone guidance: {tone}")

        if evidence_snippets:
            parts.append("## Retrieved Evidence\n")
            for i, snippet in enumerate(evidence_snippets, 1):
                text = (snippet.get("text") or "").strip()
                meta = snippet.get("metadata") or {}
                source = meta.get("doc_title") or meta.get("doc_id") or f"source-{i}"
                source_url = str(meta.get("source_url") or "")
                ref = f"[{i}] {source}"
                if source_url:
                    ref += f" — {source_url}"
                parts.append(f"{ref}\n{text}")
        else:
            parts.append("## Retrieved Evidence\nNo relevant evidence was retrieved.")

        return "\n\n".join(parts)


def get_model_client(
    provider: str,
    api_base: str = "",
    api_key: str = "",
    model: str = "",
    temperature: float = 0.0,
) -> ModelClient:
    """Factory for generation model clients.

    Returns an OpenAICompatibleModelClient when provider is "openai" or
    "openai-compatible" and the required api_base/model are configured.
    Falls back to ExtractiveModelClient for local/stub operation.
    """
    normalized = (provider or "").strip().lower()
    logger.info(
        "get_model_client: provider=%s (normalized=%s), api_base=%s, model=%s, api_key_configured=%s",
        provider,
        normalized,
        api_base,
        model,
        bool(api_key),
    )
    
    if normalized in {"openai", "openai-compatible", "together", "groq", "ollama"} and api_base and model:
        logger.info("Instantiating OpenAICompatibleModelClient")
        return OpenAICompatibleModelClient(
            api_base=api_base,
            api_key=api_key,
            model=model,
            temperature=temperature,
        )
    logger.info("Falling back to ExtractiveModelClient")
    return ExtractiveModelClient()
