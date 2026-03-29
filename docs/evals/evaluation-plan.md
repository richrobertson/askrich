# Evaluation Plan

## Purpose

Define a practical evaluation process to measure answer quality for recruiter-facing use.

## Test question bank

Create a curated bank across categories:
- project impact and outcomes,
- technical depth (backend/distributed/cloud),
- role fit and leadership signals,
- timeline/experience clarifications.

Include both straightforward and adversarial prompts.

Behavioral interview track:
- Test plan: `docs/evals/behavioral-interview-test-plan.md`
- Public-source bank (63 questions): `docs/evals/behavioral_question_bank_public.json`

## Manual rubric

Score each answer on a 1–5 scale:

1. **Correctness** — factual alignment with source material.
2. **Relevance** — directness to recruiter question.
3. **Recruiter usefulness** — practical hiring signal quality.
4. **Citation quality** — presence, precision, and traceability.
5. **Conciseness** — signal density without fluff.

## Common failure modes to track

- Hallucinated facts
- Generic AI-style fluff without evidence
- Missing or vague citations
- Overly long responses with weak signal
- Misinterpretation of role or project scope

## Evaluation workflow

1. Run question bank against current build.
2. Record answers + citations.
3. Score with rubric.
4. Annotate failure reasons.
5. Apply targeted prompt/retrieval/content fixes.
6. Re-run regression subset.

## Provider portability requirement

Evaluation format must be portable across model providers:
- same question bank,
- same rubric,
- comparable prompt contract,
- no provider-specific grading assumptions.

This allows fair quality comparisons as model backends change.
