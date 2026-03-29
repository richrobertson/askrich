"""Retrieval-aware chat service for the /api/chat endpoint."""

from typing import Any

from app.models.api import ChatCitation, ChatFilters
from app.rag.embeddings import EmbeddingClient
from app.rag.model import ModelClient
from app.rag.vectorstore import VectorStore


DEFAULT_INSTRUCTIONS = (
    "You are Rich Robertson responding to a recruiter's question. Respond in first person (I/me), "
    "speaking directly as Rich. You are a Senior Software Engineer with 15+ years of experience in backend systems, "
    "cloud platforms, and modernization programs. "
    "\n"
    "Use the retrieved evidence below as your primary source for factual details about your experience, projects, and skills. "
    "You may draw reasonable inferences and synthesize facts across multiple sources, "
    "but clearly signal when you are inferring (e.g., 'Based on X and Y, I infer that...') "
    "rather than directly quoting. "
    "\n"
    "Respond naturally and conversationally in your own voice. "
    "Keep responses concise and well-organized. "
    "For behavioral interview-style questions (for example: 'tell me about a time', "
    "leadership/conflict/failure prompts), structure the answer using STAR: "
    "Situation, Task, Action, Result, and end with a brief Reflection when possible. "
    "If evidence is insufficient, explicitly state what you can't directly answer and suggest a follow-up question. "
    "Never invent specific facts (dates, numbers, company names, project details) not present in the evidence. "
    "You can reference these external links:\n"
    "- GitHub: https://github.com/richrobertson\n"
    "- LinkedIn: https://www.linkedin.com/in/royrobertson"
)


class ChatService:
    """Coordinates retrieval, prompt assembly, answering, and citations."""

    def __init__(
        self,
        embedding_client: EmbeddingClient,
        vector_store: VectorStore,
        model_client: ModelClient,
        max_evidence_chars: int = 1800,
    ):
        self.embedding_client = embedding_client
        self.vector_store = vector_store
        self.model_client = model_client
        self.max_evidence_chars = max(400, max_evidence_chars)

    def answer(
        self,
        question: str,
        top_k: int,
        filters: ChatFilters | None = None,
        tone: str | None = None,
    ) -> dict[str, Any]:
        query_embedding = self.embedding_client.embed_text(question)
        raw_results = self.vector_store.similarity_search(query_embedding, k=max(top_k * 3, top_k))
        filtered_results = self._apply_filters(raw_results, filters)
        selected = filtered_results[:top_k]
        bounded_evidence = self._bound_evidence(selected)

        answer_text = self.model_client.generate_answer(
            question=question,
            evidence_snippets=bounded_evidence,
            instructions=DEFAULT_INSTRUCTIONS,
            tone=tone,
        )

        citations = self._build_citations(bounded_evidence)

        return {
            "answer": answer_text,
            "citations": citations,
            "retrieved_chunks": len(selected),
        }

    def _apply_filters(
        self, results: list[dict[str, Any]], filters: ChatFilters | None
    ) -> list[dict[str, Any]]:
        if not filters:
            return results

        doc_types = {self._normalize_doc_type(value) for value in filters.doc_types}
        tags = {value.lower() for value in filters.tags}

        output: list[dict[str, Any]] = []
        for item in results:
            metadata = item.get("metadata") or {}
            item_doc_type = self._normalize_doc_type(str(metadata.get("doc_type", "")))
            item_tags = {str(tag).lower() for tag in (metadata.get("tags") or [])}

            if doc_types and item_doc_type not in doc_types:
                continue
            if tags and not item_tags.intersection(tags):
                continue

            output.append(item)
        return output

    def _normalize_doc_type(self, value: str) -> str:
        normalized = (value or "").strip().lower()
        if normalized.endswith("s"):
            return normalized[:-1]
        return normalized

    def _bound_evidence(self, results: list[dict[str, Any]]) -> list[dict[str, Any]]:
        bounded: list[dict[str, Any]] = []
        used = 0
        for item in results:
            text = (item.get("text") or "").strip()
            if not text:
                continue

            remaining = self.max_evidence_chars - used
            if remaining <= 0:
                break

            clipped = text[:remaining]
            bounded.append({
                "text": clipped,
                "metadata": item.get("metadata") or {},
                "distance": item.get("distance"),
            })
            used += len(clipped)

        return bounded

    def _build_citations(self, results: list[dict[str, Any]]) -> list[ChatCitation]:
        citations: list[ChatCitation] = []
        seen: set[str] = set()

        for item in results:
            metadata = item.get("metadata") or {}
            citation_id = str(metadata.get("chunk_id") or metadata.get("doc_id") or "")
            if not citation_id or citation_id in seen:
                continue

            seen.add(citation_id)
            citations.append(
                ChatCitation(
                    id=citation_id,
                    title=str(metadata.get("doc_title") or metadata.get("doc_id") or "source"),
                    source_url=metadata.get("source_url"),
                    chunk_index=metadata.get("chunk_index"),
                )
            )

        return citations
