import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
API_ROOT = REPO_ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.models.api import ChatFilters
from app.rag.chat import ChatService


class FakeEmbeddingClient:
    def __init__(self):
        self.queries = []

    def embed_text(self, text: str):
        self.queries.append(text)
        return [0.1, 0.2, 0.3]


class FakeVectorStore:
    def __init__(self, results):
        self.results = results
        self.calls = []

    def similarity_search(self, embedding, k: int):
        self.calls.append((embedding, k))
        return list(self.results)


class FakeModelClient:
    def __init__(self, answer: str = "Certainly, default answer."):
        self.answer = answer
        self.calls = []

    def generate_answer(self, question, evidence_snippets, instructions, tone=None):
        self.calls.append(
            {
                "question": question,
                "evidence": evidence_snippets,
                "instructions": instructions,
                "tone": tone,
            }
        )
        return self.answer


def _mk_result(text, chunk_id, title="Doc", source_url="https://example.com", chunk_index=0, doc_type="project", tags=None):
    return {
        "text": text,
        "distance": 0.01,
        "metadata": {
            "chunk_id": chunk_id,
            "doc_id": f"{chunk_id}-doc",
            "doc_title": title,
            "source_url": source_url,
            "chunk_index": chunk_index,
            "doc_type": doc_type,
            "tags": tags or [],
        },
    }


def test_answer_runs_langgraph_pipeline_and_returns_contract():
    results = [
        _mk_result("first evidence", "c1", title="First", tags=["cloud"]),
        _mk_result("second evidence", "c2", title="Second", tags=["cloud"]),
    ]
    embed = FakeEmbeddingClient()
    store = FakeVectorStore(results)
    model = FakeModelClient("Sure, final answer")
    service = ChatService(embed, store, model, max_evidence_chars=500)

    out = service.answer(
        question="What has Rich delivered?",
        top_k=1,
        filters=ChatFilters(tags=["cloud"]),
        tone="concise",
    )

    assert out["answer"] == "final answer"
    assert out["retrieved_chunks"] == 1
    assert len(out["citations"]) == 1
    assert embed.queries == ["What has Rich delivered?"]
    assert store.calls[0][1] == 3  # max(top_k * 3, top_k)
    assert model.calls[0]["tone"] == "concise"
    assert len(model.calls[0]["evidence"]) == 1


def test_apply_filters_supports_doc_type_normalization_and_tags():
    service = ChatService(FakeEmbeddingClient(), FakeVectorStore([]), FakeModelClient())
    results = [
        _mk_result("a", "1", doc_type="projects", tags=["kubernetes"]),
        _mk_result("b", "2", doc_type="faq", tags=["interview"]),
    ]
    filtered = service._apply_filters(
        results,
        ChatFilters(doc_types=["project"], tags=["kubernetes"]),
    )
    assert [item["metadata"]["chunk_id"] for item in filtered] == ["1"]


def test_bound_evidence_respects_character_budget():
    service = ChatService(FakeEmbeddingClient(), FakeVectorStore([]), FakeModelClient(), max_evidence_chars=405)
    bounded = service._bound_evidence([
        _mk_result("a" * 300, "1"),
        _mk_result("b" * 300, "2"),
    ])
    assert len(bounded) == 2
    assert len(bounded[0]["text"]) == 300
    assert len(bounded[1]["text"]) == 105


def test_build_citations_deduplicates_ids():
    service = ChatService(FakeEmbeddingClient(), FakeVectorStore([]), FakeModelClient())
    citations = service._build_citations([
        _mk_result("a", "dup", chunk_index=1),
        _mk_result("b", "dup", chunk_index=2),
        _mk_result("c", "uniq", chunk_index=3),
    ])
    assert [c.id for c in citations] == ["dup", "uniq"]


def test_clean_and_strip_helpers():
    service = ChatService(FakeEmbeddingClient(), FakeVectorStore([]), FakeModelClient())
    assert service._strip_chat_preamble("Certainly, Sure! answer") == "answer"
    cleaned = service._clean_general_answer("**x**\n\n\n" + ("y" * 900))
    assert "**" not in cleaned
    assert cleaned.endswith("...")
    assert len(cleaned) <= 800


def test_behavioral_detection_explicit_and_topic_intent_paths():
    service = ChatService(FakeEmbeddingClient(), FakeVectorStore([]), FakeModelClient())
    assert service._is_behavioral_question("Tell me about a time you handled conflict")
    assert service._is_behavioral_question("How did you handle stakeholder conflict in that situation?")
    assert not service._is_behavioral_question("What cloud technologies do you use?")


def test_compact_behavioral_answer_uses_reflection_only_for_detailed_prompt():
    service = ChatService(FakeEmbeddingClient(), FakeVectorStore([]), FakeModelClient())
    answer = (
        "Situation: We had migration risk.\n"
        "Task: Keep release date.\n"
        "Action: I phased rollout and added checkpoints.\n"
        "Result: We shipped safely.\n"
        "Reflection: Visibility and checkpoints reduced risk."
    )
    compact = service._compact_behavioral_answer("Give a detailed answer", answer)
    lines = compact.splitlines()
    assert lines[0].startswith("S/T:")
    assert lines[1].startswith("A:")
    assert lines[2].startswith("R:")
    assert any(line.startswith("Why it worked:") for line in lines)


def test_compact_behavioral_answer_fallbacks_when_sections_missing():
    service = ChatService(FakeEmbeddingClient(), FakeVectorStore([]), FakeModelClient())
    compact = service._compact_behavioral_answer(
        "tell me about a time",
        "One. Two. Three.",
    )
    assert compact.count("\n") == 2
    assert compact.startswith("S/T:")


def test_extract_star_sections_and_sentence_split():
    service = ChatService(FakeEmbeddingClient(), FakeVectorStore([]), FakeModelClient())
    sections = service._extract_star_sections("S/T: Context.\nA: Action here.\nR: Result there.")
    assert sections["s/t"] == "Context"
    assert sections["a"] == "Action here"
    assert sections["r"] == "Result there"

    assert service._split_sentences("A. B? C!") == ["A.", "B?", "C!"]
    assert service._split_sentences("   ") == []
