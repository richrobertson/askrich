# Contributing to askrich

Thanks for contributing. This repository is currently planning-focused, and high-quality documentation is a core deliverable.

## Workflow expectations

### 1) Issue-first development

Before opening a PR, create or reference an issue that defines:
- problem statement,
- proposed scope,
- explicit non-goals.

### 2) Branch naming suggestions

Use clear, scoped branch names:
- `docs/<topic>`
- `feat/<milestone>-<topic>`
- `fix/<area>-<bug>`
- `chore/<maintenance-task>`

Examples:
- `docs/m1-ingestion-plan`
- `feat/m2-chat-api-adapter`

### 3) Milestone-based delivery

Work should map to milestone scope in `docs/milestones/`.
Avoid mixing unrelated milestone concerns in one PR.

## Documentation standards

- Keep architecture, deployment assumptions, and prompt strategy up to date.
- If a design decision changes, add or update an ADR in `docs/adr/`.
- Update `README.md` and milestone docs when project direction changes.

## Coding standards philosophy (for implementation phases)

- Favor clarity and maintainability over cleverness.
- Keep modules focused and interface-driven.
- Prefer explicit contracts for retrieval, model, and embeddings layers.
- Include tests for critical logic and behavior regressions.

## Architecture governance expectations

- Significant decisions must be captured in ADRs.
- Retrieval and prompt behavior changes should include evaluation impact notes.
- New capabilities should identify tradeoffs and rollout strategy.

## Provider-agnostic model integration requirement

This project intentionally avoids hard-coded vendor assumptions in core logic.
Contributions that add model integrations must:
- use adapter interfaces,
- avoid vendor-specific API types leaking into domain layers,
- support replacing model/embedding backends with minimal changes.

Do not introduce dependencies that make OpenAI mandatory for inference or embeddings.
