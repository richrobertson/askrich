# Architecture Overview

## Project purpose

Ask Rich is a recruiter-facing RAG assistant that answers questions about Rich Robertson’s experience with grounded evidence from curated content.

The goal is trustworthy, role-relevant responses—not unconstrained conversation.

## Recruiter-facing journey

1. Recruiter opens website chat panel.
2. Asks a hiring-relevant question.
3. System retrieves top matching evidence chunks.
4. Prompt assembler combines instructions, structured context, and retrieved snippets.
5. LLM returns concise answer with citations and confidence-aware language.

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
   -> query preprocessing
   -> retriever (vector search)
   -> prompt assembly
      - natural-language rules
      - TOON-style structured context block (optional)
      - retrieved evidence
      - optional response schema
   -> model adapter
   -> response formatting + citations
   -> UI rendering
```

## Retrieval-first design

Ask Rich is intentionally retrieval-first to maximize:
- factual grounding,
- citation traceability,
- maintainability as source content evolves.

A freeform chatbot without retrieval would be harder to trust for hiring decisions.

## Prompt assembly and TOON

Natural-language system instructions remain the primary behavior layer.
TOON-style blocks are used for structured context/config where helpful (e.g., role, tone, output constraints), but TOON is **not** a replacement for nuanced instruction logic.

## LangChain first, LangGraph later

- **Now:** LangChain provides enough primitives for retrieval, prompt templates, and model abstraction.
- **Later:** LangGraph may be introduced when orchestration needs become stateful/multi-step (e.g., clarifications, tool routing, workflow retries).

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

## Future expansion points

- LangGraph workflow orchestration for advanced flows
- richer evaluator pipelines and regression checks
- session memory policies with strict citation controls
- optional artifact storage/export workflows with R2
