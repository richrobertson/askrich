"""Document and chunk data models."""

from typing import Any, Dict, List, Optional


class DocumentMetadata:
    """Metadata for a source document."""

    def __init__(
        self,
        id: str,
        title: str,
        doc_type: str,
        source_url: Optional[str] = None,
        tags: Optional[List[str]] = None,
        summary: Optional[str] = None,
        updated: Optional[str] = None,
        priority: int = 1,
        **extra: Any,
    ):
        self.id = id
        self.title = title
        self.doc_type = doc_type
        self.source_url = source_url
        self.tags = tags or []
        self.summary = summary
        self.updated = updated
        self.priority = priority
        self.extra = extra

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "doc_type": self.doc_type,
            "source_url": self.source_url,
            "tags": self.tags,
            "summary": self.summary,
            "updated": self.updated,
            "priority": self.priority,
            **self.extra,
        }


class ChunkMetadata:
    """Metadata for a document chunk."""

    def __init__(
        self,
        doc_id: str,
        doc_title: str,
        chunk_index: int,
        chunk_id: str,
        chunk_size: int,
        doc_type: str,
        tags: Optional[List[str]] = None,
        source_url: Optional[str] = None,
        **extra: Any,
    ):
        self.doc_id = doc_id
        self.doc_title = doc_title
        self.chunk_index = chunk_index
        self.chunk_id = chunk_id
        self.chunk_size = chunk_size
        self.doc_type = doc_type
        self.tags = tags or []
        self.source_url = source_url
        self.extra = extra

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "doc_id": self.doc_id,
            "doc_title": self.doc_title,
            "chunk_index": self.chunk_index,
            "chunk_id": self.chunk_id,
            "chunk_size": self.chunk_size,
            "doc_type": self.doc_type,
            "tags": self.tags,
            "source_url": self.source_url,
            **self.extra,
        }


class Document:
    """Normalized document with metadata and content."""

    def __init__(
        self,
        metadata: DocumentMetadata,
        content: str,
    ):
        self.metadata = metadata
        self.content = content

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "metadata": self.metadata.to_dict(),
            "content": self.content,
        }


class Chunk:
    """A text chunk from a document with preserved metadata."""

    def __init__(
        self,
        text: str,
        metadata: ChunkMetadata,
    ):
        self.text = text
        self.metadata = metadata

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "text": self.text,
            "metadata": self.metadata.to_dict(),
        }
