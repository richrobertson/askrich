"""Provider-agnostic embedding interface.

This module defines the abstract interface for embeddings.
Concrete implementations will adapt specific providers (OpenAI, Hugging Face, Ollama, etc.)
to this contract.
"""

from abc import ABC, abstractmethod
from typing import List
import hashlib
import json
import logging
import math
import re

import httpx


logger = logging.getLogger(__name__)


def get_embedding_client(
    provider: str,
    dimension: int,
    api_base: str = "",
    api_key: str = "",
    model: str = "",
) -> "EmbeddingClient":
    """Factory for embedding clients.

    Returns an OpenAICompatibleEmbeddingClient when provider is "openai" or
    compatible and the required api_base/model are set.
    Falls back to HashEmbeddingClient for local/stub operation.
    """
    normalized = (provider or "hash").strip().lower()
    if normalized in {"openai", "openai-compatible", "together", "groq", "ollama"} and api_base and model:
        return OpenAICompatibleEmbeddingClient(
            api_base=api_base,
            api_key=api_key,
            model=model,
            dimension=dimension,
        )
    if normalized in {"", "hash", "local"}:
        return HashEmbeddingClient(dimension=dimension)
    if normalized == "placeholder":
        return PlaceholderEmbeddingClient(dimension=dimension)

    message = f"Unsupported embedding provider: {provider}"
    logger.error(message)
    raise ValueError(message)


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


class OpenAICompatibleEmbeddingClient(EmbeddingClient):
    """Embedding client for any OpenAI-compatible embeddings API.

    Works with OpenAI, Together AI, Ollama, vLLM, LM Studio, and any service
    that implements the /embeddings endpoint contract.
    """

    _TIMEOUT = 30.0

    def __init__(
        self,
        api_base: str,
        api_key: str,
        model: str,
        dimension: int = 1536,
    ) -> None:
        if not api_base:
            raise ValueError("api_base is required for OpenAICompatibleEmbeddingClient")
        if not model:
            raise ValueError("model is required for OpenAICompatibleEmbeddingClient")
        self._api_base = api_base.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._dimension = dimension

    def embed_text(self, text: str) -> List[float]:
        return self.embed_texts([text])[0]

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        headers = {
            "Content-Type": "application/json",
        }
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        payload = {"model": self._model, "input": texts}
        try:
            with httpx.Client(timeout=self._TIMEOUT) as client:
                response = client.post(
                    f"{self._api_base}/embeddings",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                items = sorted(data["data"], key=lambda d: d["index"])
                embeddings: List[List[float]] = []
                for item in items:
                    embedding = item["embedding"]
                    if len(embedding) != self._dimension:
                        raise ValueError(
                            f"Embedding dimension mismatch: expected {self._dimension}, "
                            f"got {len(embedding)} for index {item.get('index')!r}"
                        )
                    embeddings.append(embedding)
                return embeddings
        except (httpx.HTTPError, KeyError, json.JSONDecodeError, IndexError) as exc:
            if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None:
                body_snippet = exc.response.text[:500]
                logger.error(
                    "Embedding API call failed with HTTP %s: %s; response body snippet: %r",
                    exc.response.status_code,
                    exc,
                    body_snippet,
                )
            else:
                logger.error("Embedding API call failed (%s): %s", type(exc).__name__, exc)
            raise RuntimeError("Embedding API call failed") from exc

    def get_embedding_dimension(self) -> int:
        return self._dimension
