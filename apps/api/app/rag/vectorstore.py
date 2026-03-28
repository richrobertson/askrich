"""Vector store interface and local Chroma setup.

For now, provides a minimal wrapper around Chroma for local development.
Cloudflare Vectorize integration deferred to Milestone 2.
"""

from typing import List, Optional, Dict, Any
from abc import ABC, abstractmethod


class VectorStore(ABC):
    """Abstract vector store interface."""

    @abstractmethod
    def add_texts(
        self,
        texts: List[str],
        metadatas: Optional[List[Dict[str, Any]]] = None,
        ids: Optional[List[str]] = None,
    ) -> List[str]:
        """Add texts to the vector store.

        Args:
            texts: List of text strings
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

    def add_texts(
        self,
        texts: List[str],
        metadatas: Optional[List[Dict[str, Any]]] = None,
        ids: Optional[List[str]] = None,
    ) -> List[str]:
        """Add texts to Chroma collection.

        Args:
            texts: List of text strings
            metadatas: Optional list of metadata dicts
            ids: Optional list of unique IDs

        Returns:
            List of added IDs
        """
        if not texts:
            return []

        self.collection.add(
            documents=texts,
            ids=ids or [f"id_{i}" for i in range(len(texts))],
            metadatas=metadatas or [{} for _ in texts],
        )
        return ids or [f"id_{i}" for i in range(len(texts))]

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
        results = self.collection.query(
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
            self.collection.delete(ids=ids)
            return True
        except Exception:
            return False
