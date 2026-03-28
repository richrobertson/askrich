"""Text chunking utilities with metadata preservation."""

from typing import List

from app.models.documents import Document, Chunk, ChunkMetadata


class TextSplitter:
    """Split documents into chunks with preserved metadata."""

    def __init__(
        self,
        chunk_size: int = 512,
        chunk_overlap: int = 128,
    ):
        """Initialize splitter.

        Args:
            chunk_size: Target chunk size in characters
            chunk_overlap: Character overlap between adjacent chunks
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split_documents(self, documents: List[Document]) -> List[Chunk]:
        """Split multiple documents into chunks.

        Args:
            documents: List of Document objects

        Returns:
            List of Chunk objects
        """
        chunks = []
        for doc in documents:
            doc_chunks = self.split_document(doc)
            chunks.extend(doc_chunks)
        return chunks

    def split_document(self, document: Document) -> List[Chunk]:
        """Split a single document into chunks.

        Args:
            document: Document object to split

        Returns:
            List of Chunk objects
        """
        text = document.content
        chunks = []

        if not text or not text.strip():
            return chunks

        # Simple character-based splitting with overlap
        chunk_index = 0
        start = 0

        while start < len(text):
            end = min(start + self.chunk_size, len(text))

            # Try to break at a sentence boundary if possible
            if end < len(text):
                # Look back for a period or newline
                for i in range(end, max(start, end - 100), -1):
                    if i < len(text) and text[i] in ".?!\n":
                        end = i + 1
                        break

            chunk_text = text[start:end].strip()

            if chunk_text:  # Only add non-empty chunks
                chunk_id = self._generate_chunk_id(
                    document.metadata.id, chunk_index
                )

                metadata = ChunkMetadata(
                    doc_id=document.metadata.id,
                    doc_title=document.metadata.title,
                    chunk_index=chunk_index,
                    chunk_id=chunk_id,
                    chunk_size=len(chunk_text),
                    doc_type=document.metadata.doc_type,
                    tags=document.metadata.tags,
                    source_url=document.metadata.source_url,
                )

                chunk = Chunk(text=chunk_text, metadata=metadata)
                chunks.append(chunk)
                chunk_index += 1

            if end >= len(text):
                break

            # Guarantee forward progress even with pathological overlap values.
            next_start = max(end - self.chunk_overlap, start + 1)
            if next_start <= start:
                break
            start = next_start

        return chunks

    def _generate_chunk_id(self, doc_id: str, chunk_index: int) -> str:
        """Generate a deterministic chunk ID.

        Args:
            doc_id: Document ID
            chunk_index: Index of chunk within document

        Returns:
            Unique chunk ID
        """
        id_str = f"{doc_id}#{chunk_index}"
        return id_str
