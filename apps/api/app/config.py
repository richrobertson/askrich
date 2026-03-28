"""Configuration for Ask Rich API.

Provider-agnostic settings for model, embedding, and vector store backends.
"""

import os
from pathlib import Path


class Settings:
    """Application settings loaded from environment."""

    # LLM Provider (abstract)
    llm_provider: str = os.getenv("LLM_PROVIDER", "openai")
    llm_api_base: str = os.getenv("LLM_API_BASE", "")
    llm_api_key: str = os.getenv("LLM_API_KEY", "")
    llm_model: str = os.getenv("LLM_MODEL", "gpt-4")

    # Embedding Provider (abstract)
    embedding_provider: str = os.getenv("EMBEDDING_PROVIDER", "openai")
    embedding_api_base: str = os.getenv("EMBEDDING_API_BASE", "")
    embedding_api_key: str = os.getenv("EMBEDDING_API_KEY", "")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

    # Vector Store (local dev)
    chroma_persist_directory: str = os.getenv(
        "CHROMA_PERSIST_DIRECTORY", "data/chroma"
    )

    # Content Root
    content_root: str = os.getenv("CONTENT_ROOT", "content")

    # FastAPI
    app_name: str = "Ask Rich API"
    app_version: str = "0.1.0"
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"


settings = Settings()
