"""Chat endpoint runtime service wiring."""

from functools import lru_cache

from app.config import settings
from app.rag.chat import ChatService
from app.rag.embeddings import get_embedding_client
from app.rag.model import get_model_client
from app.rag.vectorstore import ChromaVectorStore


@lru_cache(maxsize=1)
def get_chat_service() -> ChatService:
    """Build and cache chat service dependencies for request reuse."""
    embedding_client = get_embedding_client(
        provider=settings.embedding_provider,
        dimension=settings.embedding_dimension,
    )
    model_client = get_model_client(provider=settings.llm_provider)
    vector_store = ChromaVectorStore(
        persist_directory=settings.chroma_persist_directory
    )

    return ChatService(
        embedding_client=embedding_client,
        vector_store=vector_store,
        model_client=model_client,
        max_evidence_chars=settings.chat_max_evidence_chars,
    )
