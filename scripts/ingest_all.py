#!/usr/bin/env python3
"""Ingest all documents and prepare vector store.

This script:
1. Loads all markdown documents from content/
2. Splits them into chunks
3. Embeds chunks (currently placeholder; Milestone 2 adds real embeddings)
4. Indexes them in local Chroma vector store

Usage:
    python scripts/ingest_all.py
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPO_ROOT / "apps" / "api"

# Add the API package root so scripts work from the repository root.
sys.path.insert(0, str(API_ROOT))

from app.rag.loader import DocumentLoader
from app.rag.splitter import TextSplitter
from app.rag.embeddings import PlaceholderEmbeddingClient
from app.rag.vectorstore import ChromaVectorStore
from app.rag.ingestion import IngestionPipeline
from app.config import settings


def main():
    """Run ingestion pipeline and print summary."""
    print("=" * 60)
    print("Ask Rich Ingestion Pipeline")
    print("=" * 60)
    print()

    print(f"Content root: {settings.content_root}")
    print(f"Vector store: {settings.chroma_persist_directory}")
    print()

    try:
        # Initialize components
        print("Initializing components...")
        loader = DocumentLoader(content_root=settings.content_root)
        splitter = TextSplitter(chunk_size=512, chunk_overlap=128)
        embedding_client = PlaceholderEmbeddingClient(dimension=1536)
        vector_store = ChromaVectorStore(
            persist_directory=settings.chroma_persist_directory
        )

        # Create and run pipeline
        print("Creating ingestion pipeline...")
        pipeline = IngestionPipeline(
            loader=loader,
            splitter=splitter,
            embedding_client=embedding_client,
            vector_store=vector_store,
        )

        print("Running ingestion...")
        print()

        doc_count, chunk_count = pipeline.run()

        # Print summary
        print()
        print("=" * 60)
        print("Ingestion Complete")
        print("=" * 60)
        print(f"Documents loaded: {doc_count}")
        print(f"Chunks created: {chunk_count}")
        print()

        if chunk_count > 0:
            avg_chunk_per_doc = chunk_count / doc_count if doc_count > 0 else 0
            print(f"Average chunks per document: {avg_chunk_per_doc:.1f}")
        print()

        print(f"Vector store persisted to: {settings.chroma_persist_directory}")
        print()

        return 0

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
