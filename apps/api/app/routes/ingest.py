"""Ingestion endpoint."""

import logging

from app.models.api import IngestResponse
from app.rag.ingestion import IngestionPipeline
from app.rag.loader import DocumentLoader
from app.rag.splitter import TextSplitter
from app.rag.embeddings import PlaceholderEmbeddingClient
from app.rag.vectorstore import ChromaVectorStore
from app.config import settings


logger = logging.getLogger(__name__)


def ingest() -> dict:
    """Run ingestion pipeline and return results.

    Returns:
        IngestResponse as dictionary
    """
    try:
        # Initialize components
        loader = DocumentLoader(content_root=settings.content_root)
        splitter = TextSplitter(chunk_size=512, chunk_overlap=128)
        embedding_client = PlaceholderEmbeddingClient(dimension=1536)
        vector_store = ChromaVectorStore(
            persist_directory=settings.chroma_persist_directory
        )

        # Create pipeline
        pipeline = IngestionPipeline(
            loader=loader,
            splitter=splitter,
            embedding_client=embedding_client,
            vector_store=vector_store,
        )

        # Run ingestion
        doc_count, chunk_count = pipeline.run()

        response = IngestResponse(
            success=True,
            documents_count=doc_count,
            chunks_count=chunk_count,
            message=f"Successfully ingested {doc_count} documents into {chunk_count} chunks",
        )

        return response.to_dict()

    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        response = IngestResponse(
            success=False,
            documents_count=0,
            chunks_count=0,
            error=str(e),
        )
        return response.to_dict()
