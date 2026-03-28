# askrich

**Ask Rich** is a recruiter-facing, retrieval-first chatbot for Rich Robertson’s personal website.

## Why this project exists

Recruiters and hiring managers often need fast, specific answers about a candidate’s impact, technical depth, and role fit. Resume bullets alone are too compressed, while freeform chatbots can drift away from factual evidence.

Ask Rich is designed to answer with grounded, source-backed responses drawn from curated materials (bio, resume, project briefs, and skills content).

## Core use case

A recruiter asks practical questions such as:
- “What migration work has Rich led?”
- “How strong is he in Kubernetes and platform engineering?”
- “What outcomes came from the Oracle modernization effort?”

The system retrieves relevant documents, assembles context, and returns concise answers with citations.

## Who it is for

- Recruiters screening candidates quickly
- Hiring managers assessing technical fit
- Rich himself, to present consistent evidence-backed narratives

## Current status

**Milestone 1 in progress**: Documentation complete, corpus established, ingestion scaffold added.

## Implementation status

Milestone 1 deliverables now in place:
- ✅ Curated content corpus with consistent frontmatter (`content/`)
- ✅ Document and chunk schemas (`docs/schemas-content.md`)
- ✅ Ingestion scaffold (`apps/api/`, `scripts/ingest_all.py`, `scripts/smoke_test.py`)
- ✅ Architecture and deployment documentation
- ⏳ **Milestone 2 coming:** Chat retrieval runtime and prompt assembly

## High-level architecture summary

Ask Rich is a **RAG application**, not a generic freeform chatbot:
1. Curated source content is authored in Markdown.
2. Ingestion prepares chunks and metadata.
3. Embeddings are generated via a provider-agnostic adapter.
4. Chunks are indexed in a vector store.
5. Runtime chat retrieves evidence and composes an answer prompt.
6. The LLM returns a recruiter-friendly answer with citations.

## Planned tech stack

- **Frontend:** Next.js deployed to Cloudflare Workers
- **Backend API:** Cloudflare Worker API (`/api/chat` target)
- **Workers edge runtime constraints:** Prefer Edge-compatible APIs; avoid Node-only runtime assumptions
- **RAG framework:** LangChain first
- **Orchestration (later):** LangGraph when/if workflow complexity justifies it
- **Vector store:** Cloudflare Vectorize (production target), Chroma (local dev)
- **State/evals/app data:** Cloudflare D1
- **Artifact storage (optional later):** Cloudflare R2

## Cloudflare hosting plan

- Web app and API both hosted on Cloudflare Workers
- Cloudflare-native data services for low operational overhead
- Environment separation: dev, staging, prod

See `docs/deployment/cloudflare.md` for details.

## Repository structure

```text
apps/
  api/               # Future Worker API implementation
  web/               # Future Next.js frontend
content/             # Curated recruiter-facing corpus
docs/                # Architecture, ADRs, milestones, deployment, prompts, evals
scripts/             # Future ingestion/eval/deploy helper scripts
data/
  chroma/            # Local vector persistence (dev only)
```

## Milestone overview

- **M1:** Corpus + schema + ingestion scaffold + docs
- **M2:** Retrieval layer + `/api/chat` + prompt assembly + citations
- **M3:** Website integration and recruiter UX
- **M4:** Evaluation harness and quality polish
- **M5:** Cloudflare deployment and production hardening

See `docs/milestones/overview.md`.

Milestone-1 planning details are expanded in:
- `docs/milestones/milestone-01.md`
- `docs/schemas-content.md`
- `docs/ingestion-scaffold-plan.md`

## Local development intention

Local development should remain lightweight:
- Chroma for local vector persistence
- Provider-agnostic model/embedding adapter contracts
- No vendor lock-in in core product logic

## Why retrieval-first instead of a freeform chatbot

Recruiter-facing credibility depends on traceable evidence. Retrieval-first design:
- keeps answers grounded in authored source content,
- improves consistency across model providers,
- makes citation quality measurable.

## Why this project intentionally avoids an OpenAI dependency

Ask Rich is explicitly designed to demonstrate practical open-source LLM integration capability. The architecture uses swappable provider adapters so inference and embeddings can run on open-source model infrastructure without changing product logic.

## Future roadmap

- Expand corpus breadth and depth (project briefs, blog summaries, role narratives)
- Production-grade ingestion and chunking pipeline
- API + UI integration with recruiter-focused interaction design
- Evaluation dashboards and regression checks
- Optional LangGraph-based orchestration for multi-step flows

## License

MIT. See `LICENSE`.
