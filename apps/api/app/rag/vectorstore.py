"""Vector store interface and local Chroma setup.

For now, provides a minimal wrapper around Chroma for local development.
Cloudflare Vectorize integration deferred to Milestone 2.
"""

import logging
from typing import Any, Dict, List, Optional
from abc import ABC, abstractmethod


logger = logging.getLogger(__name__)


class VectorStore(ABC):
    """Abstract vector store interface."""

    @abstractmethod
    def add_texts(
        self,
        texts: List[str],
        embeddings: Optional[List[List[float]]] = None,
        metadatas: Optional[List[Dict[str, Any]]] = None,
        ids: Optional[List[str]] = None,
    ) -> List[str]:
        """Add texts to the vector store.

        Args:
            texts: List of text strings
            embeddings: Optional list of embedding vectors (one per text)
            metadatas: Optional list of metadata dicts (one per text)
            ids: Optional list of unique IDs (one per text)

        Returns:
            List of added IDs
        """
        pass

    @abstractmethod
    def similarity_search(
        self, query: str, k: int = 5
    ) -> List[Dict[str, Any]]:
        """Search for similar texts.

        Args:
            query: Query text
            k: Number of results

        Returns:
            List of result dicts with 'text', 'metadata', and 'distance'
        """
        pass

    @abstractmethod
    def delete(self, ids: List[str]) -> bool:
        """Delete documents by ID.

        Args:
            ids: List of IDs to delete

        Returns:
            True if successful
        """
        pass


class ChromaVectorStore(VectorStore):
    """Local Chroma vector store wrapper for development.

    Production deployment will use Cloudflare Vectorize.
    """

    def __init__(self, persist_directory: str):
        """Initialize Chroma store.

        Args:
            persist_directory: Path to persist Chroma data
        """
        self.persist_directory = persist_directory
        self.collection = None
        self._init_client()

    def _init_client(self):
        """Initialize Chroma client and collection.

        Creates the client and gets or creates the default collection.
        """
        try:
            import chromadb
            self.client = chromadb.PersistentClient(path=self.persist_directory)
            self.collection = self.client.get_or_create_collection(
                name="askrich_chunks",
                metadata={"hnsw:space": "cosine"}
            )
        except ImportError:
            raise ImportError(
                "chromadb not installed. "
                "For local development, run: pip install chromadb"
            )

    def _require_collection(self):
        """Return the initialized Chroma collection.

        Raises:
            RuntimeError: If initialization failed and no collection is available.
        """
        if self.collection is None:
            raise RuntimeError("Chroma collection is not initialized")
        return self.collection

    def add_texts(
        self,
        texts: List[str],
        embeddings: Optional[List[List[float]]] = None,
        metadatas: Optional[List[Dict[str, Any]]] = None,
        ids: Optional[List[str]] = None,
    ) -> List[str]:
        """Add texts to Chroma collection.

        Args:
            texts: List of text strings
            embeddings: Optional list of embedding vectors
            metadatas: Optional list of metadata dicts
            ids: Optional list of unique IDs

        Returns:
            List of added IDs
        """
        if not texts:
            return []
        if ids is None:
            raise ValueError("ids must be provided and stable across ingestion runs")

        expected_length = len(texts)
        if embeddings is not None and len(embeddings) != expected_length:
            raise ValueError("embeddings must have the same length as texts")
        if metadatas is not None and len(metadatas) != expected_length:
            raise ValueError("metadatas must have the same length as texts")
        if ids is not None and len(ids) != expected_length:
            raise ValueError("ids must have the same length as texts")

        collection = self._require_collection()
        collection.add(
            documents=texts,
            embeddings=embeddings,
            ids=ids,
            metadatas=metadatas or [{} for _ in texts],
        )
        return ids

    def similarity_search(
        self, query: str, k: int = 5
    ) -> List[Dict[str, Any]]:
        """Search for similar documents in Chroma.

        Args:
            query: Query text
            k: Number of results

        Returns:
            List of result dicts with 'text', 'metadata', and 'distance'
        """
        collection = self._require_collection()
        results = collection.query(
            query_texts=[query],
            n_results=k,
            include=["documents", "metadatas", "distances"]
        )

        output = []
        if results["documents"] and len(results["documents"]) > 0:
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0]
            ):
                output.append({
                    "text": doc,
                    "metadata": meta,
                    "distance": dist,
                })
        return output

    def delete(self, ids: List[str]) -> bool:
        """Delete texts from Chroma by ID.

        Args:
            ids: List of IDs to delete

        Returns:
            True if successful
        """
        try:
            collection = self._require_collection()
            collection.delete(ids=ids)
            return True
        except Exception:
            logger.exception("Failed to delete ids from vector store")
            return False
