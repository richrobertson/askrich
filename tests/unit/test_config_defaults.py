import importlib
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
API_ROOT = REPO_ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


MODULE_NAME = "app.config"


def _reload_config():
    if MODULE_NAME in sys.modules:
        return importlib.reload(sys.modules[MODULE_NAME])
    return importlib.import_module(MODULE_NAME)


def test_dev_defaults_do_not_force_openai(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LLM_API_BASE", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)

    config = _reload_config()
    s = config.Settings()
    assert s.app_env == "dev"
    assert s.llm_provider == ""
    assert s.llm_api_base == ""
    assert s.llm_model == ""


def test_prod_defaults_to_openai_gpt_5_4(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LLM_API_BASE", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)

    config = _reload_config()
    s = config.Settings()
    assert s.app_env == "prod"
    assert s.llm_provider == "openai"
    assert s.llm_api_base == "https://api.openai.com/v1"
    assert s.llm_model == "gpt-5.4"


def test_explicit_env_vars_override_prod_defaults(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("LLM_API_BASE", "http://localhost:11434/v1")
    monkeypatch.setenv("LLM_MODEL", "llama3")

    config = _reload_config()
    s = config.Settings()
    assert s.llm_provider == "ollama"
    assert s.llm_api_base == "http://localhost:11434/v1"
    assert s.llm_model == "llama3"
