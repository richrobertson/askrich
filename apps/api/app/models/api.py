"""API response models."""

from typing import Optional
from pydantic import BaseModel, Field


class Citation:
    """A citation to a source document or chunk."""

    def __init__(
        self,
        id: str,
        title: str,
        source_url: Optional[str] = None,
        chunk_index: Optional[int] = None,
    ):
        self.id = id
        self.title = title
        self.source_url = source_url
        self.chunk_index = chunk_index

    def to_dict(self):
        """Convert to dictionary for JSON response."""
        return {
            "id": self.id,
            "title": self.title,
            "source_url": self.source_url,
            "chunk_index": self.chunk_index,
        }


class IngestResponse:
    """Response from ingestion endpoint."""

    def __init__(
        self,
        success: bool,
        documents_count: int,
        chunks_count: int,
        message: str = "",
        error: Optional[str] = None,
    ):
        self.success = success
        self.documents_count = documents_count
        self.chunks_count = chunks_count
        self.message = message
        self.error = error

    def to_dict(self):
        """Convert to dictionary for JSON response."""
        return {
            "success": self.success,
            "documents_count": self.documents_count,
            "chunks_count": self.chunks_count,
            "message": self.message,
            "error": self.error,
        }


class ChatFilters(BaseModel):
    """Optional retrieval filters for chat requests."""

    doc_types: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    """Validated payload for /api/chat requests."""

    question: str = Field(min_length=3, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)
    toon: Optional[str] = Field(default=None, max_length=3000)
    filters: Optional[ChatFilters] = None


class ChatCitation(BaseModel):
    """Citation payload item for chat responses."""

    id: str
    title: str
    source_url: Optional[str] = None
    chunk_index: Optional[int] = None


class ChatResponseData(BaseModel):
    """Success data envelope for /api/chat responses."""

    answer: str
    citations: list[ChatCitation]
    retrieved_chunks: int


class ChatResponseEnvelope(BaseModel):
    """Top-level response envelope for successful requests."""

    success: bool = True
    data: ChatResponseData


class ErrorResponseEnvelope(BaseModel):
    """Top-level response envelope for failed requests."""

    success: bool = False
    error: str
