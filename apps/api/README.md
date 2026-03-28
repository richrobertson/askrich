# apps/api

FastAPI-based backend for Ask Rich. Deployed to Cloudflare Workers.

## Milestone 1: Current Implementation

This is the **Milestone 1** scaffold, providing:
- Document loading and chunking (Markdown with YAML frontmatter)
- Vector store integration (Chroma for local dev, Vectorize production target)
- Health check endpoint (`/health`)
- Ingestion scaffold endpoint (`/ingest`)
- Provider-agnostic configuration for LLM and embeddings

**Milestone 2** will add:
- `/api/chat` retrieval-aware endpoint
- Real embeddings wiring (OpenAI, Ollama, or other provider)
- Prompt assembly and citation formatting
- Model adapter implementations

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
```

## Running Locally (Development)

### Prerequisites

```bash
pip install fastapi uvicorn pyyaml chromadb
```

### Start the API

```bash
cd apps/api
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

### Run Ingestion

See `scripts/README.md` for ingestion and smoke testing guidance.

## Endpoints (Milestone 1)

- **GET** `/` — Welcome and endpoint listing
- **GET** `/health` — Health status (`{ "status": "ok" }`)
- **POST** `/ingest` — Run document ingestion pipeline (see `scripts/ingest_all.py`)

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
- `CHROMA_PERSIST_DIRECTORY` (default: repo-root `data/chroma`)
- `CONTENT_ROOT` (default: repo-root `content`)

## Migration Path

**Milestone 1 → Milestone 2:**
1. Wire real embeddings (replace `PlaceholderEmbeddingClient`)
2. Implement `ModelClient` adapter for LLM calls
3. Add `/api/chat` endpoint with retrieval and prompt assembly
4. Implement citation formatting

**Milestone 2 → Production:**
1. Replace Chroma with Cloudflare Vectorize
2. Wire D1 for session/evaluation metadata
3. Optimize for Worker runtime constraints
4. Add comprehensive eval suite

## Next Steps

- [Milestone 1 details](../../docs/milestones/milestone-01.md)
- [Ingestion plan](../../docs/ingestion-scaffold-plan.md)
- [Content guide](../../docs/content-guide.md)
- [Architecture](../../docs/architecture.md)
