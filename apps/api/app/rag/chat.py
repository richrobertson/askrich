"""Retrieval-aware chat service for the /api/chat endpoint."""

import re
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
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
    "Keep responses concise and well-organized for chat: default to 3-6 short lines and avoid long paragraphs. "
    "Do not include preambles like 'Certainly', 'Sure', or 'Absolutely'. "
    "Do not use markdown headings or bold formatting in the answer body. "
    "For contact questions, provide specific contact guidance instead of generic profile lists. "
    "Treat LinkedIn as the primary contact point when the user asks how to reach you, "
    "and only provide additional profile links (such as GitHub or Facebook) when explicitly requested. "
    "If asked for private contact details (for example phone number, personal email, or home address), "
    "politely decline to share PII and redirect to LinkedIn as the appropriate contact path. "
    "For behavioral interview-style questions (for example: 'tell me about a time', "
    "leadership/conflict/failure prompts), structure the answer for chat using compact STAR lines: "
    "S/T:, A:, R:. Only include Reflection when explicitly asked for more detail. "
    "If evidence is insufficient, explicitly state what you can't directly answer and suggest a follow-up question. "
    "Never invent specific facts (dates, numbers, company names, project details) not present in the evidence. "
    "You can reference these external links:\n"
    "- GitHub: https://github.com/richrobertson\n"
    "- LinkedIn: https://www.linkedin.com/in/royrobertson"
)


class ChatService:
    """Coordinates retrieval, prompt assembly, answering, and citations."""

    class ChatGraphState(TypedDict, total=False):
        question: str
        top_k: int
        filters: ChatFilters | None
        tone: str | None
        query_embedding: list[float]
        raw_results: list[dict[str, Any]]
        filtered_results: list[dict[str, Any]]
        selected_results: list[dict[str, Any]]
        bounded_evidence: list[dict[str, Any]]
        answer_text: str
        citations: list[ChatCitation]
        retrieved_chunks: int

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
        self._graph = self._build_graph()

    def answer(
        self,
        question: str,
        top_k: int,
        filters: ChatFilters | None = None,
        tone: str | None = None,
    ) -> dict[str, Any]:
        state: ChatService.ChatGraphState = {
            "question": question,
            "top_k": top_k,
            "filters": filters,
            "tone": tone,
        }
        output = self._graph.invoke(state)

        return {
            "answer": output.get("answer_text", ""),
            "citations": output.get("citations", []),
            "retrieved_chunks": output.get("retrieved_chunks", 0),
        }

    def _build_graph(self):
        builder = StateGraph(ChatService.ChatGraphState)
        builder.add_node("retrieve", self._retrieve_node)
        builder.add_node("filter_and_select", self._filter_and_select_node)
        builder.add_node("bound_evidence", self._bound_evidence_node)
        builder.add_node("generate", self._generate_node)
        builder.add_node("postprocess", self._postprocess_node)
        builder.add_node("build_citations", self._build_citations_node)

        builder.add_edge(START, "retrieve")
        builder.add_edge("retrieve", "filter_and_select")
        builder.add_edge("filter_and_select", "bound_evidence")
        builder.add_edge("bound_evidence", "generate")
        builder.add_edge("generate", "postprocess")
        builder.add_edge("postprocess", "build_citations")
        builder.add_edge("build_citations", END)
        return builder.compile()

    def _retrieve_node(self, state: ChatGraphState) -> ChatGraphState:
        query_embedding = self.embedding_client.embed_text(state.get("question", ""))
        top_k = max(int(state.get("top_k", 3)), 1)
        raw_results = self.vector_store.similarity_search(query_embedding, k=max(top_k * 3, top_k))
        return {
            "query_embedding": query_embedding,
            "raw_results": raw_results,
        }

    def _filter_and_select_node(self, state: ChatGraphState) -> ChatGraphState:
        raw_results = state.get("raw_results", [])
        filters = state.get("filters")
        top_k = max(int(state.get("top_k", 3)), 1)

        filtered_results = self._apply_filters(raw_results, filters)
        selected = filtered_results[:top_k]
        return {
            "filtered_results": filtered_results,
            "selected_results": selected,
            "retrieved_chunks": len(selected),
        }

    def _bound_evidence_node(self, state: ChatGraphState) -> ChatGraphState:
        selected = state.get("selected_results", [])
        return {"bounded_evidence": self._bound_evidence(selected)}

    def _generate_node(self, state: ChatGraphState) -> ChatGraphState:
        answer_text = self.model_client.generate_answer(
            question=state.get("question", ""),
            evidence_snippets=state.get("bounded_evidence", []),
            instructions=DEFAULT_INSTRUCTIONS,
            tone=state.get("tone"),
        )
        return {"answer_text": answer_text}

    def _postprocess_node(self, state: ChatGraphState) -> ChatGraphState:
        return {
            "answer_text": self._postprocess_answer(
                state.get("question", ""),
                state.get("answer_text", ""),
            )
        }

    def _build_citations_node(self, state: ChatGraphState) -> ChatGraphState:
        return {"citations": self._build_citations(state.get("bounded_evidence", []))}

    def _postprocess_answer(self, question: str, answer_text: str) -> str:
        normalized = self._strip_chat_preamble(answer_text)
        if self._is_behavioral_question(question):
            return self._compact_behavioral_answer(question, normalized)
        return self._clean_general_answer(normalized)

    def _clean_general_answer(self, answer_text: str) -> str:
        cleaned = answer_text.replace("**", "")
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
        if len(cleaned) > 800:
            return f"{cleaned[:797].rstrip()}..."
        return cleaned

    def _strip_chat_preamble(self, answer_text: str) -> str:
        text = answer_text.strip()
        preamble_re = re.compile(
            r"^(certainly|sure|absolutely|of course|definitely|great question)[,!\.\s:\-–—]+",
            re.IGNORECASE,
        )
        while True:
            updated = preamble_re.sub("", text, count=1).strip()
            if updated == text:
                break
            text = updated
        return text

    def _is_behavioral_question(self, question: str) -> bool:
        question_lower = (question or "").lower()
        explicit_prompts = [
            "tell me about a time",
            "give me an example",
            "describe a time",
            "time when",
            "walk me through",
        ]
        if any(token in question_lower for token in explicit_prompts):
            return True

        behavioral_topics = [
            "conflict",
            "failure",
            "mistake",
            "challenge",
            "adversity",
            "leadership",
            "stakeholder",
        ]

        story_intent_phrases = [
            "how did you handle",
            "how did you deal",
            "how you handled",
            "how you dealt",
            "how did you resolve",
            "how you resolved",
            "what did you do",
            "what was your approach",
            "how did you approach",
            "how you approached",
            "how did you respond",
            "how you responded",
            "how did you react",
            "how you reacted",
            "what happened when",
            "in that situation",
            "in this situation",
        ]

        has_topic = any(token in question_lower for token in behavioral_topics)
        has_story_intent = any(phrase in question_lower for phrase in story_intent_phrases)
        return has_topic and has_story_intent

    def _clip_sentence(self, text: str, max_chars: int) -> str:
        compact = re.sub(r"\s+", " ", text or "").strip()
        if len(compact) <= max_chars:
            return compact
        clipped = compact[: max(0, max_chars - 3)].rstrip()
        return f"{clipped}..."

    def _extract_star_sections(self, answer_text: str) -> dict[str, str]:
        cleaned = re.sub(r"\*+", "", answer_text)
        marker_pattern = re.compile(
            r"^[ \t]*(Situation|Task|Action|Result|Reflection|S/T|A|R)\s*:",
            re.IGNORECASE | re.MULTILINE,
        )
        matches = list(marker_pattern.finditer(cleaned))
        if not matches:
            return {}

        sections: dict[str, str] = {}
        for i, match in enumerate(matches):
            label = match.group(1).lower()
            start = match.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(cleaned)
            content = re.sub(r"\s+", " ", cleaned[start:end]).strip(" .\n\t")
            if content and label not in sections:
                sections[label] = content
        return sections

    def _split_sentences(self, text: str) -> list[str]:
        compact = re.sub(r"\s+", " ", text or "").strip()
        if not compact:
            return []
        parts = re.split(r"(?<=[.!?])\s+", compact)
        return [part.strip() for part in parts if part.strip()]

    def _compact_behavioral_answer(self, question: str, answer_text: str) -> str:
        cleaned = self._clean_general_answer(answer_text)
        sections = self._extract_star_sections(cleaned)
        sentences = self._split_sentences(cleaned)

        combined_st = sections.get("s/t", "")
        situation = sections.get("situation", "")
        task = sections.get("task", "")
        action = sections.get("action", sections.get("a", ""))
        result = sections.get("result", sections.get("r", ""))

        if not situation and not action and not result:
            if sentences:
                situation = sentences[0]
            if len(sentences) > 1:
                action = sentences[1]
            if len(sentences) > 2:
                result = sentences[2]
        else:
            if not situation and sentences:
                situation = sentences[0]
            if not action and len(sentences) > 1:
                action = sentences[1]
            if not result and len(sentences) > 2:
                result = sentences[2]

        st_combined = " ".join(part for part in [combined_st, situation, task] if part).strip()
        if not st_combined:
            st_combined = "I handled a high-impact engineering challenge with clear alignment and execution discipline."
        if not action:
            action = "I aligned stakeholders, set clear checkpoints, and executed in staged increments to reduce risk."
        if not result:
            result = "The outcome improved delivery confidence, reliability, and team alignment."

        lines = [
            f"S/T: {self._clip_sentence(st_combined, 220)}",
            f"A: {self._clip_sentence(action, 190)}",
            f"R: {self._clip_sentence(result, 170)}",
        ]

        if any(token in (question or "").lower() for token in ["detailed", "deep dive", "in detail", "full answer"]):
            reflection = sections.get("reflection", "")
            if reflection:
                lines.append(f"Why it worked: {self._clip_sentence(reflection, 180)}")

        return "\n".join(lines)

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
