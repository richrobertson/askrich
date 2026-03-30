# Architecture Overview

## Project purpose

Ask Rich is a recruiter-facing RAG assistant that answers questions about Rich Robertson’s experience with grounded evidence from curated content.

The goal is trustworthy, role-relevant responses—not unconstrained conversation.

## Recruiter-facing journey

1. Recruiter opens website chat panel.
2. Asks a hiring-relevant question.
3. Worker `/api/chat` handles the request in one of two modes:
   - upstream proxy mode to a retrieval-backed API, or
   - local corpus mode in the Worker.
4. Runtime returns concise answers with citations and confidence-aware language.

## System boundaries

- **Content corpus (offline):** durable source of truth in `content/`
- **Runtime context (online):** selected subset of chunks + session metadata

This separation keeps changing knowledge in retrievable documents rather than bloating the system prompt.

## Offline ingestion path

```text
content/*.md
   -> parsing + frontmatter validation
   -> chunking + metadata normalization
   -> embedding adapter
   -> vector index (Vectorize in prod, Chroma locally)
   -> optional summary rows in D1 for observability/evals
```

## Runtime answer path

```text
Recruiter UI (web)
   -> /api/chat (Worker)
   -> backend mode switch
      - upstream mode: proxy to retrieval-backed FastAPI runtime
      - local mode: keyword ranking over worker corpus
   -> response formatting + citations envelope
   -> UI rendering
```

## Retrieval-first design

Ask Rich is intentionally retrieval-first to maximize:
- factual grounding,
- citation traceability,
- maintainability as source content evolves.

Current implementation note:
- Local FastAPI runtime implements retrieval over Chroma.
- Cloudflare Worker currently supports both upstream proxy mode and local corpus mode.

A freeform chatbot without retrieval would be harder to trust for hiring decisions.

## Prompt assembly and TOON

Natural-language system instructions remain the primary behavior layer.
TOON-style blocks are used for structured context/config where helpful (e.g., role, tone, output constraints), but TOON is **not** a replacement for nuanced instruction logic.

## LangGraph orchestration for chat workflow

- **Now:** `/api/chat` uses a LangGraph `StateGraph` to orchestrate retrieval, filtering, evidence bounding, generation, post-processing, and citation construction as explicit nodes.
- **Why:** This keeps the request lifecycle inspectable and extensible while preserving retrieval-first grounding and existing adapter contracts.

## Why Cloudflare as hosting target

- Unified edge platform for frontend + API
- Native services aligned with architecture (Workers, Vectorize, D1, optional R2)
- Low ops overhead for an MVP portfolio project

## Provider-agnostic model and embedding adapters

Core product logic uses interfaces such as:
- `ModelClient` for generation
- `EmbeddingClient` for vectorization

Adapters isolate provider-specific SDK/API differences so model backends can be swapped without rewriting retrieval or prompt layers.

## Why avoid an OpenAI dependency

The project is meant to demonstrate practical open-source LLM integration capability.
Making OpenAI optional (not required) keeps architecture portable and avoids proprietary lock-in.

## Answer Quality Assurance

The local worker mode contains hardcoded response paths for specific question types:
- Oracle CNS outcomes → focused metrics (timeline, scalability, readiness)
- Profile queries → profile links only
- Education queries → degree/university info
- Technology queries → tech stack summary
- Sensitive contact → refuse PII, redirect to LinkedIn
- Behavioral questions → STAR-formatted answers

These responses are extensively tested to ensure:
- **Appropriate routing** - Questions match their intended answer paths
- **No mixing** - Profile queries don't include unrelated project details
- **Safety** - Sensitive contact requests properly refuse private information
- **Conciseness** - All answers stay under 600-800 character limits

**Test coverage:**
- `scripts/test_canned_responses.py` - Specification validator (11 test cases)
- `scripts/test_canned_responses_integration.py` - Live worker response validation (6 tests)
- `apps/api/worker/src/index.test.js` - JavaScript unit tests (40+ assertions)

See [docs/testing/CANNED_RESPONSES.md](testing/CANNED_RESPONSES.md) for complete testing approach.

## Future expansion points

- LangGraph workflow orchestration for advanced flows
- richer evaluator pipelines and regression checks
- session memory policies with strict citation controls
- optional artifact storage/export workflows with R2
