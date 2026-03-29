# Cloudflare Deployment Plan

## Why Cloudflare

Cloudflare is the primary hosting target because it provides a cohesive edge runtime and managed services aligned with Ask Rich’s architecture.

Benefits for this project:
- single platform for web + API,
- globally distributed runtime,
- low operational burden for a portfolio-grade MVP.

## Target deployment model

### Frontend: static assets on Workers

- Host recruiter-facing site from `apps/web` as Worker assets.
- Keep frontend runtime simple (HTML/CSS/JS assets), with API calls to `/api/chat`.
- Keep UI latency low and deployment pipeline straightforward.

### Backend: Worker API

- Expose chat endpoint from Worker API (`/api/chat`).
- Current worker supports:
  - `CHAT_BACKEND_MODE=upstream`: proxy to a FastAPI-compatible upstream service
  - `CHAT_BACKEND_MODE=local`: serve from a built-in corpus
- CORS/origin allowlists are controlled by `ALLOWED_ORIGINS`.

## Data service mapping

- **Vectorize:** primary production vector store for retrieved chunks.
- **D1:** app/session/evaluation metadata and lightweight relational state.
- **R2 (optional later):** raw artifact storage and export files.

## Monorepo shape (intended)

```text
apps/web   -> static recruiter interface + embeddable widget
apps/api   -> Worker API (chat/retrieval/prompt assembly)
content    -> source corpus used for ingestion
docs       -> architecture and process documentation
scripts    -> ingestion/eval/deploy helpers
data       -> local development storage (e.g., Chroma)
```

## Environment separation

Plan for three environments:
- **dev:** local + rapid iteration, lower data sensitivity
- **staging:** pre-production validation and regression checks
- **prod:** public recruiter experience with stable configuration

Use environment-scoped credentials and indexes/databases per environment.

## Likely deployment workflow

1. Deploy from GitHub Actions workflow `Deploy Cloudflare` (manual dispatch or push to `main` for worker/web paths).
2. Workflow verifies required Cloudflare secrets and deploys API Worker and web assets using wrangler configs.
3. Run post-deploy smoke checks.
4. Execute retrieval/eval sanity tests against current corpus.

## Local development notes

- Local vector persistence may use Chroma (`data/chroma`) for fast iteration.
- The local FastAPI `/ingest` route is environment-gated (`ENABLE_INGEST_ENDPOINT`).
- Local runs should still follow provider-agnostic adapter interfaces.
- Keep `.env` values environment-specific; never commit secrets.

## Python-on-Workers note

Python-on-Workers is possible, but it is not the default recommendation for Ask Rich’s MVP. The project should stay simple and Cloudflare-native first, prioritizing operational clarity over early polyglot complexity.

## Keep MVP simple and Cloudflare-native

For milestone execution:
- avoid over-abstracted infra early,
- deploy minimal viable API + retrieval path,
- add advanced orchestration only when quality metrics justify it.

## Provider-agnostic model access strategy

Model and embedding calls will go through adapter interfaces. Cloudflare-hosted API code should depend on internal contracts, not provider SDK internals, so backends can be swapped with minimal impact.

## Open-source model infrastructure position

Ask Rich intends to use open-source model infrastructure for inference and embeddings and must not depend on OpenAI to function.

## Related deployment guides

- [Cloudflare configuration and deployment runbook](cloudflare-config-and-deploy.md)
- [www.myrobertson.com integration guide](myrobertson-website-integration.md)
- [Cloudflare cost estimate notes](costs.md)
