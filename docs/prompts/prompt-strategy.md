# Prompt Strategy

## Principles

1. **Natural-language system instructions are primary.**
2. **Retrieved evidence is dynamic knowledge source.**
3. **TOON-style structured blocks are supportive, not dominant.**
4. **Prompt contracts should stay model-provider agnostic.**

## What TOON means in this repo

TOON is used here as a repository shorthand for a compact, structured context/config block embedded in prompts (JSON-like key/value payload).

- Expected syntax in this repo is a JSON-like object block with stable keys (for example: audience, tone, citation_style).
- It is not treated as a strict universal standard for all prompt logic.
- Parsing can be tolerant in early milestones (schema checks over strict parser coupling).

## Why a hybrid prompt design

Ask Rich needs both nuance and structure:
- Nuance comes from plain-language instructions (tone, evidence behavior, uncertainty handling).
- Structure comes from a compact TOON-like block for machine-readable context/config.
- Grounding comes from retrieved evidence chunks.

## Recommended assembly layers

1. Plain-language behavior rules
2. TOON config/context block
3. Retrieved evidence snippets
4. Optional output schema (for stable UI rendering)

## Retrieval guidance

Retrieved content should not be hardcoded into the base system prompt.
Knowledge should flow primarily from retrieval output so updates in `content/` are reflected without rewriting global instructions.

## Why TOON should not replace all instruction logic

TOON-style blocks are good for structured metadata, but they are not enough for nuanced requirements like:
- recruiter-friendly phrasing,
- confidence-aware handling of missing evidence,
- tradeoff explanations.

Plain-language rules remain the best layer for behavioral quality.

## Example hybrid prompt template

```text
[SYSTEM INSTRUCTIONS]
You are Ask Rich, a recruiter-facing assistant. Answer using retrieved evidence.
Be concise, specific, and honest about uncertainty. Do not invent facts.
If evidence is missing, say so and suggest a follow-up question.

[TOON_BLOCK]
{
  "assistant_role": "recruiter_support",
  "tone": ["professional", "clear", "concise"],
  "citation_style": "source-id-inline",
  "max_answer_bullets": 6
}

[RETRIEVED_EVIDENCE]
- [source:content/projects/oracle-cns-migration.md#outcomes] ...
- [source:content/profile/resume.md#experience] ...

[OPTIONAL_OUTPUT_SCHEMA]
{
  "summary": "string",
  "key_points": ["string"],
  "citations": ["source-id"]
}
```
