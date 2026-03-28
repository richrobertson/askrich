# PR Review Responses: Initial Project Scaffold

This file captures explicit replies to review comments for the initial scaffold PR and the concrete resolution made in-repo.

## Comment 1: “Milestone 1 needs a concrete schema contract, not only narrative docs.”

**Reply:** Agreed. We added a dedicated schema contract doc with required fields, type-specific guidance, and validation rules.

**Resolution:** Added `docs/schemas-content.md` and linked it from Milestone 1 and README.

## Comment 2: “Ingestion planning should include pipeline stages and adapter boundaries.”

**Reply:** Agreed. We documented a stage-by-stage ingestion scaffold and adapter contracts.

**Resolution:** Added `docs/ingestion-scaffold-plan.md` with objectives, stages, outputs, tests, and non-goals.

## Comment 3: “README should point directly to detailed Milestone 1 artifacts.”

**Reply:** Agreed. Top-level navigation now links to specific Milestone 1 execution docs.

**Resolution:** Updated `README.md` Milestone section with links to schema and ingestion planning docs.

## Comment 4: “Milestone doc should list exact artifacts expected for completion.”

**Reply:** Agreed. We expanded the explicit file list to include schema and ingestion plan docs.

**Resolution:** Updated `docs/milestones/milestone-01.md` intended files list.

## Comment 5: “Keep provider assumptions portable across model backends.”

**Reply:** Agreed. This remains an explicit project guardrail and review criterion.

**Resolution:** Confirmed and retained provider-agnostic adapter requirements in architecture, deployment, milestone, and ADR docs.

## Comment 6: “Track review replies in-repo so future contributors understand rationale.”

**Reply:** Agreed. This document serves as traceable response history for this PR.

**Resolution:** Added `docs/pr-review-responses.md` and referenced it in contributor guidance.
