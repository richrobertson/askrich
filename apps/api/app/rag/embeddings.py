"""Provider-agnostic embedding interface.

This module defines the abstract interface for embeddings.
Concrete implementations will adapt specific providers (OpenAI, Hugging Face, Ollama, etc.)
to this contract.

Currently a placeholder; actual provider wiring deferred to Milestone 2.
"""

from abc import ABC, abstractmethod
from typing import List


class EmbeddingClient(ABC):
    """Abstract embedding client interface."""

    @abstractmethod
    def embed_text(self, text: str) -> List[float]:
        """Embed a single text string.

        Args:
            text: Text to embed

        Returns:
            Embedding vector as list of floats
        """
        pass

    @abstractmethod
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Embed multiple texts.

        Args:
            texts: List of text strings to embed

        Returns:
            List of embedding vectors
        """
        pass

    @abstractmethod
    def get_embedding_dimension(self) -> int:
        """Get the dimensionality of embeddings from this client.

        Returns:
            Integer dimension
        """
        pass


class PlaceholderEmbeddingClient(EmbeddingClient):
    """Placeholder embedding client for development.

    Returns dummy embeddings. Actual provider integration (OpenAI, Ollama, etc.)
    happens in Milestone 2.
    """

    def __init__(self, dimension: int = 1536):
        """Initialize placeholder client.

        Args:
            dimension: Vector dimension (default 1536 for OpenAI compatibility)
        """
        self.dimension = dimension

    def embed_text(self, text: str) -> List[float]:
        """Return placeholder vector (all zeros).

        Args:
            text: Text to embed (ignored for placeholder)

        Returns:
            Zero vector of configured dimension
        """
        return [0.0] * self.dimension

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Return placeholder vectors.

        Args:
            texts: List of texts (ignored for placeholder)

        Returns:
            List of zero vectors
        """
        return [[0.0] * self.dimension for _ in texts]

    def get_embedding_dimension(self) -> int:
        """Get embedding dimension.

        Returns:
            Configured dimension
        """
        return self.dimension
