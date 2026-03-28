# Ingestion Scaffold Plan (Milestone 1)

This plan documents the initial ingestion scaffold to be implemented in Milestone 1/2 handoff.

## Objectives

- Parse and validate markdown corpus documents.
- Produce chunked records with stable IDs and metadata.
- Generate embeddings through a provider-agnostic embeddings adapter.
- Upsert vectors into local Chroma (dev) or Cloudflare Vectorize (target production).

## Proposed script layout

```text
scripts/
  ingest/
    parse_content.py|ts
    validate_frontmatter.py|ts
    chunk_documents.py|ts
    embed_chunks.py|ts
    upsert_vectors.py|ts
    report_ingestion.py|ts
```

(Exact language/tooling is deferred; contract and sequence are stable.)

## Pipeline stages

1. **Discover files** in `content/**.md`.
2. **Parse frontmatter/body** and normalize metadata.
3. **Validate schema** (required + type-specific checks).
4. **Chunk body** into retrieval-friendly segments.
5. **Embed chunks** using adapter contract.
6. **Persist vectors** and metadata.
7. **Emit report**: docs processed, chunks generated, failures.

## Adapter contracts (conceptual)

- `EmbeddingClient.embed(texts: string[]) -> number[][]`
- `VectorStore.upsert(records) -> result`

Core ingestion logic must remain independent of specific model/vector SDK types.

## Output artifacts

- Ingestion report (JSON/Markdown)
- Optional failed-records file for triage
- Optional normalized chunk preview for QA

## Test scaffold (planned)

- frontmatter validation unit tests
- deterministic chunking tests
- adapter mocking tests
- end-to-end ingestion smoke test on sample corpus

## Non-goals

- full runtime retrieval API
- eval scoring automation
- agentic orchestration
