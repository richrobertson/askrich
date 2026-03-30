"""Configuration for Ask Rich API.

Provider-agnostic settings for model, embedding, and vector store backends.
"""

import os
from pathlib import Path
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[3]

# Load environment variables from .env.local (if exists) and .env
# .env.local takes precedence over .env
env_local_path = REPO_ROOT / ".env.local"
env_path = REPO_ROOT / ".env"

if env_local_path.exists():
    load_dotenv(env_local_path, override=True)
if env_path.exists():
    load_dotenv(env_path, override=False)


class Settings:
    """Application settings loaded from environment."""

    @staticmethod
    def _getenv_nonempty(name: str) -> str | None:
        value = os.getenv(name)
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    app_env: str = (_getenv_nonempty.__func__("APP_ENV") or _getenv_nonempty.__func__("ENVIRONMENT") or "dev").lower()
    _llm_api_key_nonempty: str | None = _getenv_nonempty.__func__("LLM_API_KEY")
    _enable_prod_openai_defaults: bool = app_env == "prod" and bool(_llm_api_key_nonempty)

    # LLM Provider (abstract)
    # Default to local extractive fallback; set LLM_PROVIDER + LLM_API_BASE + LLM_MODEL
    # to enable an external LLM (e.g. Ollama, OpenAI-compatible). See .env.example.
    # In prod, OpenAI defaults are only applied when a non-empty LLM_API_KEY is provided.
    llm_provider: str = _getenv_nonempty.__func__("LLM_PROVIDER") or ("openai" if _enable_prod_openai_defaults else "")
    llm_api_base: str = _getenv_nonempty.__func__("LLM_API_BASE") or (
        "https://api.openai.com/v1" if _enable_prod_openai_defaults else ""
    )
    llm_api_key: str = _llm_api_key_nonempty or ""
    llm_model: str = _getenv_nonempty.__func__("LLM_MODEL") or ("gpt-5.4" if _enable_prod_openai_defaults else "")
    llm_temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.0"))

    # Embedding Provider (abstract)
    # Default to local hash-based embeddings; set EMBEDDING_PROVIDER + EMBEDDING_API_BASE
    # + EMBEDDING_MODEL to enable an external embedding service. See .env.example.
    embedding_provider: str = os.getenv("EMBEDDING_PROVIDER", "")
    embedding_api_base: str = os.getenv("EMBEDDING_API_BASE", "")
    embedding_api_key: str = os.getenv("EMBEDDING_API_KEY", "")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "")
    embedding_dimension: int = int(os.getenv("EMBEDDING_DIMENSION", "1536"))

    # Chat Runtime
    chat_top_k: int = int(os.getenv("CHAT_TOP_K", "5"))
    chat_max_evidence_chars: int = int(os.getenv("CHAT_MAX_EVIDENCE_CHARS", "1800"))

    # Vector Store (local dev)
    chroma_persist_directory: str = os.getenv(
        "CHROMA_PERSIST_DIRECTORY", str(REPO_ROOT / "data" / "chroma")
    )

    # Content Root
    content_root: str = os.getenv("CONTENT_ROOT", str(REPO_ROOT / "content"))

    # FastAPI
    app_name: str = "Ask Rich API"
    app_version: str = "0.1.0"
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    enable_ingest_endpoint: bool = os.getenv(
        "ENABLE_INGEST_ENDPOINT", os.getenv("DEBUG", "false")
    ).lower() == "true"
    cors_allowed_origins: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ALLOWED_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000",
        ).split(",")
        if origin.strip()
    ]


settings = Settings()
