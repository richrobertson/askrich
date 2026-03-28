"""API response models."""

from typing import Optional


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
