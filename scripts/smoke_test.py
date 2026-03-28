#!/usr/bin/env python3
"""Smoke test for document loading and chunking.

This script:
1. Loads documents from content/
2. Splits into chunks
3. Prints sample metadata and chunk output
4. Optionally tests vector store initialization

Usage:
    python scripts/smoke_test.py
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPO_ROOT / "apps" / "api"

# Add the API package root so scripts work from the repository root.
sys.path.insert(0, str(API_ROOT))

from app.rag.loader import DocumentLoader
from app.rag.splitter import TextSplitter
from app.rag.vectorstore import ChromaVectorStore
from app.config import settings


def main():
    """Run smoke tests and print results."""
    print("=" * 60)
    print("Ask Rich Smoke Test")
    print("=" * 60)
    print()

    try:
        # Test 1: Load documents
        print("TEST 1: Loading documents...")
        loader = DocumentLoader(content_root=settings.content_root)
        documents = loader.load()
        print(f"✓ Loaded {len(documents)} documents")
        print()

        if not documents:
            print("⚠ No documents found. Skipping further tests.")
            return 0

        # Test 2: Validate documents
        print("TEST 2: Validating documents...")
        is_valid, errors = loader.validate(documents)
        if is_valid:
            print(f"✓ All {len(documents)} documents are valid")
        else:
            print(f"⚠ Found {len(errors)} validation errors:")
            for error in errors[:5]:  # Show first 5 errors
                print(f"  - {error}")
        print()

        # Test 3: Split documents
        print("TEST 3: Splitting documents into chunks...")
        splitter = TextSplitter(chunk_size=512, chunk_overlap=128)
        chunks = splitter.split_documents(documents)
        print(f"✓ Created {len(chunks)} chunks")
        print()

        # Test 4: Print sample output
        print("TEST 4: Sample chunk metadata (first 3 chunks)...")
        for i, chunk in enumerate(chunks[:3]):
            print()
            print(f"  Chunk {i+1}:")
            print(f"    ID: {chunk.metadata.chunk_id}")
            print(f"    Doc: {chunk.metadata.doc_title}")
            print(f"    Type: {chunk.metadata.doc_type}")
            print(f"    Size: {chunk.metadata.chunk_size} chars")
            print(f"    Tags: {chunk.metadata.tags}")
            print(f"    Text preview: {chunk.text[:80]}...")
        print()

        # Test 5: Vector store initialization
        print("TEST 5: Testing vector store initialization...")
        try:
            vector_store = ChromaVectorStore(
                persist_directory=settings.chroma_persist_directory
            )
            print(f"✓ Vector store initialized at {settings.chroma_persist_directory}")
        except ImportError as e:
            print(f"⚠ Chroma not installed: {e}")
            print("  Run: pip install chromadb")
        except Exception as e:
            print(f"⚠ Vector store error: {e}")
        print()

        print("=" * 60)
        print("Smoke Test Complete")
        print("=" * 60)
        print()

        return 0

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
