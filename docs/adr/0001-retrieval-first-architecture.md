# ADR 0001: Retrieval-first architecture before agentic flow

## Context

Ask Rich must provide trustworthy answers about Rich Robertson’s experience.
The knowledge base changes as content evolves, so static prompt-only approaches are brittle.

## Decision

Adopt a retrieval-first RAG architecture as the foundational design before implementing any agentic orchestration.

## Alternatives considered

1. Prompt-only chatbot with minimal retrieval
   - Rejected due to weak grounding and high hallucination risk.
2. Agentic workflow first (graph orchestration from day one)
   - Rejected as premature complexity before baseline retrieval quality is proven.

## Consequences

### Positive
- Better factual grounding and citation traceability.
- Easier corpus updates without rewriting core prompts.
- Clear quality measurement path via retrieval and citation metrics.

### Tradeoffs
- Requires ingestion pipeline and schema discipline early.
- Retrieval tuning becomes a core engineering task.
