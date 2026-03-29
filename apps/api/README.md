# apps/api

FastAPI-based local development API for Ask Rich, plus a Cloudflare Worker edge entrypoint under [worker/](worker/).

## Current implementation

This API currently provides:
- Document loading and chunking (Markdown with YAML frontmatter)
- Local vector store integration via Chroma
- Health check endpoint (`/health`)
- Ingestion endpoint (`/ingest`) with environment gate
- `/api/chat` retrieval-aware endpoint
- Retrieval over Chroma (`top_k` + optional metadata filters)
- Provider-agnostic embedding and model adapter contracts
- Local deterministic fallback adapters for smoke testing (`hash` embeddings + extractive answerer)
- Structured response envelope with citations
- Cloudflare Worker API edge entrypoint in [worker/src/index.js](worker/src/index.js) with CORS/origin controls and two backend modes:
  - `CHAT_BACKEND_MODE=upstream`: proxy to a configured upstream API (`UPSTREAM_API_BASE`)
  - `CHAT_BACKEND_MODE=local`: serve responses from the worker's built-in corpus
- Environment-specific Worker deployment config in [worker/wrangler.toml](worker/wrangler.toml)

## Project Structure

```
app/
  main.py           # FastAPI application
  config.py         # Provider-agnostic settings
  models/
    api.py          # Response types (Citation, IngestResponse)
    documents.py    # Document and chunk models
  routes/
    health.py       # Health check handler
    ingest.py       # Ingestion handler
  rag/
    loader.py       # Markdown loader with frontmatter parsing
    splitter.py     # Text chunking with metadata preservation
    embeddings.py   # Provider-agnostic embedding interface
    vectorstore.py  # Chroma integration for local dev
    ingestion.py    # Orchestration pipeline
worker/
  src/
    index.js        # Cloudflare Worker API entrypoint (/health, /api/chat; upstream or local mode)
  wrangler.toml     # Environment-aware Worker deployment configuration
```

## Running Locally (Development)

### Prerequisites

```bash
pip install -r requirements.txt
```

### Start the API

```bash
cd apps/api
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

### Run Ingestion

See [scripts/README.md](../../scripts/README.md) for ingestion and smoke testing guidance.

## Endpoints

- **GET** `/` — Welcome and endpoint listing
- **GET** `/health` — Health status (`{ "status": "ok" }`)
- **POST** `/ingest` — Run document ingestion pipeline (returns `403` unless `ENABLE_INGEST_ENDPOINT=true`)
- **POST** `/api/chat` — Retrieval-backed recruiter answers with citations

### `/api/chat` request example

```json
{
  "question": "What migration work has Rich led?",
  "top_k": 5,
  "tone": "clear and recruiter-friendly",
  "filters": {
    "doc_types": ["projects"],
    "tags": ["migration", "kubernetes"]
  }
}
```

## Configuration

Settings are loaded from environment variables (with defaults):

- `LLM_PROVIDER` (default: `""`)
- `LLM_API_BASE` (default: `""`)
- `LLM_API_KEY` (default: `""`)
- `LLM_MODEL` (default: `""`)
- `EMBEDDING_PROVIDER` (default: `""`)
- `EMBEDDING_API_BASE` (default: `""`)
- `EMBEDDING_API_KEY` (default: `""`)
- `EMBEDDING_MODEL` (default: `""`)
- `EMBEDDING_DIMENSION` (default: `1536`)
- `CHROMA_PERSIST_DIRECTORY` (default: repo-root `data/chroma`)
- `CONTENT_ROOT` (default: repo-root `content`)
- `CHAT_TOP_K` (default: `5`)
- `CHAT_MAX_EVIDENCE_CHARS` (default: `1800`)
- `ENABLE_INGEST_ENDPOINT` (default: inherits `DEBUG`; endpoint disabled when false)

### Setting Up API Keys Securely

[.env.example](../../.env.example) is the tracked template. To set up locally:

1. **Create a local `.env.local` file** (not committed to git):
   ```bash
   cp .env.example .env.local
   ```

2. **Edit `.env.local` and replace placeholder values with your provider credentials**:
   ```bash
   # Replace placeholder values with the API key(s) for your configured LLM/embedding provider
   LLM_API_KEY=your-llm-provider-api-key
   EMBEDDING_API_KEY=your-embedding-provider-api-key
   ```

3. **Start the API** — environment variables from `.env.local` will be loaded automatically, overriding `.env`:
   ```bash
   source .venv/bin/activate
   PYTHONPATH=apps/api uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

`.env.local` is listed in [.gitignore](../../.gitignore) and will never be committed to the repository.

## Worker edge configuration ([worker/wrangler.toml](worker/wrangler.toml))

- `ALLOWED_ORIGINS`: comma-separated allowed web origins
- `CHAT_BACKEND_MODE`: `upstream` or `local`
- `UPSTREAM_API_BASE`: required when `CHAT_BACKEND_MODE=upstream`
- `UPSTREAM_CHAT_PATH`: optional override for upstream route (default `/api/chat`)
- `UPSTREAM_AUTH_TOKEN`: optional bearer token for upstream calls

## Ongoing hardening path

1. Replace worker local corpus with production retrieval/index integration.
2. Wire production Vectorize and D1 bindings for Worker-native operation.
3. Expand API-level tests and deployment smoke checks.

## Related docs

- [Repository README](../../README.md)
- [Web README](../web/README.md)
- [Scripts README](../../scripts/README.md)
- [Ingestion plan](../../docs/ingestion-scaffold-plan.md)
- [Content guide](../../docs/content-guide.md)
- [Architecture](../../docs/architecture.md)
- [Cloudflare deployment plan](../../docs/deployment/cloudflare.md)
