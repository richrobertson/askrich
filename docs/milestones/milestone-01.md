# Milestone 01: Corpus, Schemas, and Ingestion Scaffold

**Status: In Progress**

## Goals

- Establish high-quality recruiter-facing corpus content.
- Define consistent document schemas/frontmatter.
- Design ingestion workflow and script skeletons.
- Provide measurable acceptance criteria before runtime API build.

## Deliverables

- Initial corpus in:
  - `content/profile/`
  - `content/projects/`
  - `content/skills/`
  - `content/faq/`
- Content guide with section standards.
- Ingestion plan and placeholder script structure.
- Documentation for architecture, deployment intent, and milestones.

## Exact folders/files intended

- `content/**` documents with YAML frontmatter
- `docs/content-guide.md`
- `docs/schemas-content.md`
- `docs/ingestion-scaffold-plan.md`
- `scripts/README.md`
- `data/chroma/.gitkeep`

## Corpus plan

- Author concise, evidence-rich project briefs.
- Normalize terminology and technology names.
- Prefer concrete outcomes and constraints.
- Include leadership/ownership indicators where relevant.

## Schema plan

Each content doc should include frontmatter fields such as:
- `id`
- `title`
- `type`
- `summary`
- `tags`
- `updated`

Project docs may add:
- `role`, `domain`, `technologies`, `outcomes`.

## Ingestion plan

Planned scaffold responsibilities:
1. Parse markdown + frontmatter.
2. Validate required fields by `type`.
3. Chunk content with stable IDs.
4. Generate embeddings through provider-agnostic adapter.
5. Upsert vectors and metadata.
6. Emit ingestion report for QA.

## Test plan

- Frontmatter schema validation tests.
- Chunking determinism tests.
- Ingestion smoke test over sample corpus.
- Failure-path tests for malformed documents.

## Acceptance criteria

- All baseline content files exist with valid frontmatter.
- Content follows `docs/content-guide.md` quality standards.
- Ingestion design and script plan are documented and actionable.
- Milestone 2 can begin without restructuring repository foundations.

## Implementation Status

### ✅ Completed

- **Content corpus:** All base materials in place (profile, projects, skills, FAQs)
- **Schema documentation:** `docs/schemas-content.md` with frontmatter spec
- **Content guide:** `docs/content-guide.md` with quality bar
- **Ingestion scaffold:** FastAPI app with full load → split → embed → index pipeline
  - `apps/api/app/main.py` — FastAPI application with `/health` and `/ingest` endpoints
  - `apps/api/app/config.py` — Provider-agnostic settings 
  - `apps/api/app/models/` — API response types and document models
  - `apps/api/app/rag/` — Complete RAG layer (loader, splitter, embeddings, vectorstore, orchestration)
  - `apps/api/app/routes/` — Health and ingest handlers
- **Helper scripts:** 
  - `scripts/ingest_all.py` — Full ingestion with human-readable output
  - `scripts/smoke_test.py` — Quick validation of document load/chunk/vectorstore setup
- **Documentation:** Updated README and API docs to reflect scaffold

### ⏳ Next Steps (Milestone 2)

- Wire real embeddings (replace `PlaceholderEmbeddingClient`)
- Implement `ModelClient` adapter for retrieval-aware chat
- Add `/api/chat` endpoint with retrieval and prompt assembly
- Add citation formatting
- Begin Cloudflare Workers runtime integration
