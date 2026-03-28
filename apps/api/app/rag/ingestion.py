"""Ingestion orchestration: load, split, embed, and index documents."""

from typing import Tuple
import logging

from app.rag.loader import DocumentLoader
from app.rag.splitter import TextSplitter
from app.rag.embeddings import EmbeddingClient
from app.rag.vectorstore import VectorStore
from app.models.documents import Chunk


logger = logging.getLogger(__name__)


class IngestionPipeline:
    """Orchestrates the full ingestion pipeline."""

    def __init__(
        self,
        loader: DocumentLoader,
        splitter: TextSplitter,
        embedding_client: EmbeddingClient,
        vector_store: VectorStore,
    ):
        """Initialize pipeline.

        Args:
            loader: Document loader
            splitter: Text splitter
            embedding_client: Embedding client
            vector_store: Vector store
        """
        self.loader = loader
        self.splitter = splitter
        self.embedding_client = embedding_client
        self.vector_store = vector_store

    def run(self) -> Tuple[int, int]:
        """Run the full ingestion pipeline.

        Returns:
            Tuple of (document_count, chunk_count)
        """
        # Load documents
        logger.info("Loading documents...")
        documents = self.loader.load()
        doc_count = len(documents)
        logger.info(f"Loaded {doc_count} documents")

        if not documents:
            logger.warning("No documents loaded")
            return 0, 0

        # Validate documents
        is_valid, errors = self.loader.validate(documents)
        if not is_valid:
            logger.warning(f"Validation errors: {errors}")
            # Continue anyway for now

        # Split documents
        logger.info("Splitting documents...")
        chunks = self.splitter.split_documents(documents)
        chunk_count = len(chunks)
        logger.info(f"Created {chunk_count} chunks")

        if not chunks:
            logger.warning("No chunks created")
            return doc_count, 0

        # Embed and index chunks
        logger.info("Embedding and indexing chunks...")
        self._embed_and_index(chunks)
        logger.info("Ingestion complete")

        return doc_count, chunk_count

    def _embed_and_index(self, chunks: list[Chunk]) -> None:
        """Embed chunks and add to vector store.

        For Milestone 1, we skip actual embedding (placeholder vectors)
        and focus on the structure. Milestone 2 will wire real embeddings.

        Args:
            chunks: List of chunks to embed and index
        """
        batch_size = 256
        total_indexed = 0

        for start in range(0, len(chunks), batch_size):
            batch = chunks[start : start + batch_size]
            texts = [chunk.text for chunk in batch]
            metadatas = [chunk.metadata.to_dict() for chunk in batch]
            ids = [chunk.metadata.chunk_id for chunk in batch]

            # In Milestone 2, this will call actual provider embeddings.
            embeddings = self.embedding_client.embed_texts(texts)
            logger.info(
                "Generated %s embeddings for batch %s",
                len(embeddings),
                start // batch_size,
            )

            added_ids = self.vector_store.add_texts(
                texts=texts,
                embeddings=embeddings,
                metadatas=metadatas,
                ids=ids,
            )
            total_indexed += len(added_ids)

        logger.info(f"Indexed {total_indexed} chunks in vector store")
