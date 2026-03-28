# Cloudflare Deployment Plan

## Why Cloudflare

Cloudflare is the primary hosting target because it provides a cohesive edge runtime and managed services aligned with Ask Rich’s architecture.

Benefits for this project:
- single platform for web + API,
- globally distributed runtime,
- low operational burden for a portfolio-grade MVP.

## Target deployment model

### Frontend: Next.js on Workers

- Host recruiter-facing site as a Next.js application packaged for Cloudflare Pages/Workers runtime (for example via `@cloudflare/next-on-pages` or an OpenNext-style build), not a traditional Node.js server.
- Assume Cloudflare Workers edge runtime constraints (Edge APIs only; avoid direct Node.js-specific APIs, native modules, or full Node process assumptions).
- Keep UI latency low and deployment pipeline straightforward.

### Backend: Worker API

- Expose chat endpoint from Worker API (`/api/chat`).
- API handles retrieval, prompt assembly, provider-agnostic model calls, and response formatting.

## Data service mapping

- **Vectorize:** primary production vector store for retrieved chunks.
- **D1:** app/session/evaluation metadata and lightweight relational state.
- **R2 (optional later):** raw artifact storage and export files.

## Monorepo shape (intended)

```text
apps/web   -> Next.js recruiter interface
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

1. Merge to main branch.
2. CI validates docs/tests/lint and packaging.
3. Deploy API and web artifacts to Cloudflare.
4. Run post-deploy smoke checks.
5. Execute retrieval/eval sanity tests against current corpus.

## Local development notes

- Local vector persistence may use Chroma (`data/chroma`) for fast iteration.
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
