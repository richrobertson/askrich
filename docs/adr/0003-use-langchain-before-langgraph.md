# ADR 0003: Use LangChain before LangGraph

> Status update (March 30, 2026): The chat runtime has since been migrated to LangGraph orchestration. This ADR remains as historical context for the earlier milestone decision.

## Context

Initial milestone focus is reliable retrieval and answer generation with citations.
Advanced workflow orchestration is not yet required.

## Decision

Start with LangChain as the primary RAG framework.
Reserve LangGraph for future milestones when stateful orchestration complexity justifies it.

## Alternatives considered

1. Start with LangGraph immediately
   - Rejected as unnecessary complexity in early milestones.
2. Build custom orchestration from scratch
   - Rejected due to avoidable maintenance overhead.

## Consequences

- Faster MVP delivery for retrieval/chat use case.
- Lower cognitive load during initial implementation.
- Clear upgrade path to LangGraph when orchestration needs emerge.
