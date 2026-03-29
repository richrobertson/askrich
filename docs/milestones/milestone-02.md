# Milestone 02: Retrieval and Chat API

**Status: Completed (MVP)**

## Goals

Implement the first end-to-end runtime answer path with evidence-based output.

## Scope

### Retrieval layer

- Query embeddings via provider-agnostic embeddings adapter.
- Retrieve top-k chunks from vector store.
- Apply basic metadata filtering when useful.

### `/api/chat`

- Worker API endpoint for recruiter queries.
- Input validation and structured response envelope.
- Error handling with safe, non-leaky messages.

### Prompt assembly

- Combine natural-language instructions, optional TOON block, and retrieved evidence.
- Keep retrieval snippets bounded and relevant.

### Citations

- Return source IDs/paths attached to answer claims.
- Ensure citation list maps to retrieved chunk metadata.

### Answer formatting

- Short summary + bullet points for recruiter readability.
- Explicit unknowns when evidence is insufficient.

## Non-goals

- No full agent orchestration graph yet.
- No autonomous tool-use workflows.
- No complex memory strategy beyond minimal session context.

## Implementation requirements

### Model adapter layer

Define a contract for text generation independent of provider SDKs.
Core runtime should call the contract only.

### Embeddings adapter layer

Define a contract for embedding generation with consistent output shape.
Vector store logic should remain unchanged when swapping providers.

## Exit criteria

- `/api/chat` returns grounded answers with citations.
- Model and embedding providers are configurable through adapters.
- Basic smoke/evaluation checks pass for representative recruiter questions.

## Implementation summary

- ✅ Added `/api/chat` endpoint with validated request payload and structured response envelope.
- ✅ Added retrieval runtime service with top-k search and optional metadata filters (`doc_types`, `tags`).
- ✅ Added citation mapping from retrieved chunk metadata (`chunk_id`, `doc_title`, `source_url`, `chunk_index`).
- ✅ Added provider-agnostic adapter factories for embeddings and model generation.
- ✅ Added deterministic local defaults for Milestone 2 smoke testing (hash embeddings + extractive answer generator).
- ✅ Added `scripts/chat_smoke_test.py` for representative recruiter question checks.

## Next steps

- Continue Milestone 3 website integration against the current `/api/chat` response contract.
- Maintain eval regression cadence and tune retrieval/prompt behavior as new corpus updates land.

## Navigation

- Overview: [Milestone Overview](overview.md)
- Previous: [Milestone 01](milestone-01.md)
- Next: [Milestone 03](milestone-03.md)
