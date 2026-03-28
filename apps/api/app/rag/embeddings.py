"""Provider-agnostic embedding interface.

This module defines the abstract interface for embeddings.
Concrete implementations will adapt specific providers (OpenAI, Hugging Face, Ollama, etc.)
to this contract.

Currently a placeholder; actual provider wiring deferred to Milestone 2.
"""

from abc import ABC, abstractmethod
from typing import List
import hashlib
import math
import re


def get_embedding_client(provider: str, dimension: int) -> "EmbeddingClient":
    """Factory for embedding clients.

    For Milestone 2 local development, use a deterministic hash embedding by
    default so retrieval behaves meaningfully without external dependencies.
    """
    normalized = (provider or "hash").strip().lower()
    if normalized in {"", "hash", "local"}:
        return HashEmbeddingClient(dimension=dimension)
    if normalized == "placeholder":
        return PlaceholderEmbeddingClient(dimension=dimension)

    # Keep the runtime resilient until provider-specific clients are added.
    return HashEmbeddingClient(dimension=dimension)


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


class HashEmbeddingClient(EmbeddingClient):
    """Deterministic local embedding client based on hashed tokens.

    This avoids external model dependencies while still enabling meaningful
    similarity search for Milestone 2 integration and smoke testing.
    """

    TOKEN_PATTERN = re.compile(r"[a-zA-Z0-9_\-]+")

    def __init__(self, dimension: int = 384):
        self.dimension = max(8, dimension)

    def embed_text(self, text: str) -> List[float]:
        vector = [0.0] * self.dimension
        tokens = self._tokenize(text)
        if not tokens:
            return vector

        for token in tokens:
            idx, sign = self._token_bucket(token)
            vector[idx] += sign

        return self._l2_normalize(vector)

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return [self.embed_text(text) for text in texts]

    def get_embedding_dimension(self) -> int:
        return self.dimension

    def _tokenize(self, text: str) -> List[str]:
        return [token.lower() for token in self.TOKEN_PATTERN.findall(text or "")]

    def _token_bucket(self, token: str) -> tuple[int, float]:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        raw = int.from_bytes(digest[:4], byteorder="big", signed=False)
        idx = raw % self.dimension
        sign = 1.0 if (digest[4] & 1) == 0 else -1.0
        return idx, sign

    def _l2_normalize(self, vector: List[float]) -> List[float]:
        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0.0:
            return vector
        return [value / norm for value in vector]
