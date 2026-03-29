# Milestone 04: Evals and Quality Polish

**Status: Completed**

## Goals

- Build a repeatable evaluation loop for recruiter-facing chat quality.
- Track quality over time using rubric-based scoring.
- Use failures to drive prompt and retrieval improvements.

## Scope

### Evaluation harness

- Run a portable question bank against `POST /api/chat`.
- Capture answer text, citations, latency, and error details.
- Emit machine-readable run artifacts and reviewer-friendly scoring sheets.

### Rubric and scoring workflow

- Define manual scoring dimensions (accuracy, grounding, relevance, clarity, confidence handling).
- Track pass/fail and trend indicators across runs.
- Identify recurring failure modes for prioritization.

### Prompt and retrieval tuning

- Tune retrieval controls (`top_k`, filters, evidence bounds) based on eval outcomes.
- Refine instruction/prompt formatting for recruiter readability and citation fidelity.
- Re-run evals after each tuning cycle to measure impact.

## Non-goals

- Full production observability platform.
- Autonomous self-healing evaluation pipelines.
- Large-scale benchmarking across many model providers.

## Exit criteria

- Evaluation runs are repeatable and produce artifacts under `data/evals/`.
- Core recruiter question bank has rubric coverage and baseline scores.
- At least one full tuning cycle is completed and documented.
- Evidence-grounding failures are reduced compared to baseline.

## Implementation summary

- ✅ Added evaluation plan and question bank in `docs/evals/`.
- ✅ Added `scripts/run_eval_bank.py` to execute eval runs and emit JSON/CSV artifacts.
- ✅ Added script usage documentation in `scripts/README.md`.
- ✅ Added rubric-driven scoring workflow and failure-mode tracking checklist in deployment and eval docs.
- ✅ Established iterative retrieval/prompt tuning loop tied to eval runs.

## Navigation

- Overview: [Milestone Overview](overview.md)
- Previous: [Milestone 03](milestone-03.md)
- Next: [Milestone 05](milestone-05.md)
