# ADR 0005: No required OpenAI dependency

## Context

Ask Rich is intended to demonstrate practical capability with open-source LLM infrastructure. A mandatory OpenAI dependency would conflict with that goal and reduce architectural portability.

## Decision

Do not require OpenAI for inference or embeddings.
Design core logic around provider-agnostic model and embedding adapters.

## Rationale

- Demonstrates real integration skills with open-source model ecosystems.
- Prevents proprietary vendor lock-in in core architecture.
- Makes backend/provider changes possible without rewriting product logic.

## Alternatives considered

1. OpenAI-first implementation with optional alternatives later
   - Rejected because early coupling often becomes permanent.
2. Single-provider hard-coding (any vendor)
   - Rejected due to poor portability and maintainability.

## Consequences

### Positive
- Stronger portfolio signal for practical open-source LLM engineering.
- Better long-term flexibility for cost/performance tuning.

### Tradeoffs
- Requires adapter abstraction and compatibility testing earlier.
- Slightly more upfront design effort versus one-provider shortcuts.
