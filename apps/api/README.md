# apps/api

FastAPI-based local development API for Ask Rich. This repository includes Milestone 1 + Milestone 2 runtime capabilities locally, while Cloudflare Worker deployment remains the production target.

## Milestone status

### Milestone 1 (completed)

- Document loading and chunking (Markdown with YAML frontmatter)
- Vector store integration (Chroma for local dev, Vectorize production target)
- Health check endpoint (`/health`)
- Ingestion scaffold endpoint (`/ingest`)
- Provider-agnostic configuration for LLM and embeddings

### Milestone 2 (completed MVP)

- `/api/chat` retrieval-aware endpoint
- Retrieval with top-k and optional metadata filters
- Prompt assembly and citation formatting
- Provider-agnostic adapter factories for embeddings and model generation
- Local deterministic fallback adapters for smoke testing

## Current implementation

This API currently provides:
- Document loading and chunking (Markdown with YAML frontmatter)
- Vector store integration (Chroma for local dev, Vectorize production target)
- Health check endpoint (`/health`)
- Ingestion scaffold endpoint (`/ingest`)
- `/api/chat` retrieval-aware endpoint
- Retrieval over Chroma (`top_k` + optional metadata filters)
- Provider-agnostic embedding and model adapter contracts
- Local deterministic fallback adapters for smoke testing (`hash` embeddings + extractive answerer)
- Structured response envelope with citations
- Cloudflare Worker API edge entrypoint in `worker/src/index.js` with CORS/origin controls
- Environment-specific Worker deployment config in `worker/wrangler.toml`

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
    index.js        # Cloudflare Worker API entrypoint (/health, /api/chat proxy)
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

See `scripts/README.md` for ingestion and smoke testing guidance.

## Endpoints

- **GET** `/` — Welcome and endpoint listing
- **GET** `/health` — Health status (`{ "status": "ok" }`)
- **POST** `/ingest` — Run document ingestion pipeline (see `scripts/ingest_all.py`)
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

### Setting Up API Keys Securely

The `.env` file in the repository contains placeholder values and is tracked in git. To use real API keys locally:

1. **Create a local `.env.local` file** (not committed to git):
   ```bash
   cp .env .env.local
   ```

2. **Edit `.env.local` and replace placeholder values with actual API keys**:
   ```bash
   # Replace sk-... with your actual OpenAI API key
   LLM_API_KEY=sk-your-actual-key-here
   EMBEDDING_API_KEY=sk-your-actual-key-here
   ```

3. **Start the API** — environment variables from `.env.local` will be loaded automatically, overriding `.env`:
   ```bash
   source .venv/bin/activate
   PYTHONPATH=apps/api uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

`.env.local` is listed in `.gitignore` and will never be committed to the repository.

## Ongoing hardening path

1. Replace upstream dependency with direct Cloudflare-native retrieval/runtime path when ready.
2. Wire production Vectorize and D1 bindings for Worker-native operation.
3. Expand API-level tests and deployment smoke checks.

## Next Steps

- [Milestone 1 details](../../docs/milestones/milestone-01.md)
- [Milestone 2 details](../../docs/milestones/milestone-02.md)
- [Milestone 3 details](../../docs/milestones/milestone-03.md)
- [Milestone 5 details](../../docs/milestones/milestone-05.md)
- [Milestone overview](../../docs/milestones/overview.md)
- [Ingestion plan](../../docs/ingestion-scaffold-plan.md)
- [Content guide](../../docs/content-guide.md)
- [Architecture](../../docs/architecture.md)
