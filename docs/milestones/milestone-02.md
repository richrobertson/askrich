# Milestone 02: Retrieval and Chat API

## Objectives

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

## Explicit non-goals

- No full agent orchestration graph yet.
- No autonomous tool-use workflows.
- No complex memory strategy beyond minimal session context.

## Provider-agnostic adapter requirements

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
