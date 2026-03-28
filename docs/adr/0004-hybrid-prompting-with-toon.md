# ADR 0004: Hybrid prompting with TOON-style structured context

## Context

Ask Rich needs nuanced behavioral guidance plus structured runtime context.
Purely structured prompts can miss nuance; purely unstructured prompts can drift.

## Decision

Use a hybrid prompt strategy:
- natural-language instruction layer as primary behavior control,
- optional TOON-style structured context/config block,
- retrieved evidence as grounding layer.

## Alternatives considered

1. TOON-only prompting
   - Rejected because it underfits nuanced instruction requirements.
2. Natural-language-only prompting with no structured block
   - Rejected because it weakens predictable context injection.

## Consequences

- Better balance of control and flexibility.
- Requires disciplined prompt assembly contract.
- Keeps retrieval evidence central while supporting structured metadata.
