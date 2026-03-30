# AskRich API Worker

This folder contains the Cloudflare Worker implementation that powers `/api/chat`, `/api/feedback`, rate limiting, and analytics event recording.

**Breadcrumbs:** [Repository Home](../../../README.md) > [apps/api](../README.md) > [worker](README.md)

## Goals of this Worker

- Keep recruiter answers fast and deterministic.
- Record non-blocking analytics events for question/answer/feedback workflows.
- Enforce traffic limits safely (fail-open if KV is unavailable).
- Keep logic modular and testable.

## Folder Layout

```text
worker/
  src/
    index.js                  # Request router and endpoint orchestration
    lib/
      event-identifiers.js    # Event/client identifiers and hashing
      event-policy.js         # Env parsing and policy defaults
      event-store.js          # Event shaping + NDJSON append repository
      event-logging.js        # Stable barrel exports for event modules
      rate-limit.js           # Rate-limit checks and KV persistence
      http-response.js        # JSON/CORS/origin helpers
  docs/
    diagrams/
      worker-coding-structure.txt
      worker-business-technical-flow.txt
```

## Architecture Diagrams

### 1) Coding Structure (temporary ASCII)

```text
┌────────────────────┐        ┌──────────────────────────┐
│ src/index.js       │ -----> │ src/lib/http-response.js │
│ Worker entrypoint  │        │ JSON/CORS helpers        │
└─────────┬──────────┘        └──────────────────────────┘
          │
          v
┌────────────────────┐
│ src/lib/event-     │
│ logging.js barrel  │
└──────┬─────┬───────┘
       │     │
       v     v
┌───────────────┐   ┌────────────────────┐
│ event-policy  │   │ event-identifiers  │
│ env parsing   │   │ event/client IDs   │
└──────┬────────┘   └────────────────────┘
       │
       v
┌────────────────────┐       ┌────────────────────┐
│ rate-limit.js      │ ----> │ event-store.js     │
│ hourly/burst rules │       │ NDJSON event store │
└────────────────────┘       └────────────────────┘
```

### 2) Business Logic + Technical Implementation (temporary ASCII)

```text
Recruiter Request (/api/chat)
          |
          v
  [Origin + Method Validation]
          |
          v
    [Rate Limit Check]
          |
          v
 [Business Logic + Retrieval]
          |
          v
 [Answer + Citations Response]
          |
          +--> [Best-effort event logging: question/answer/feedback]
          |
          +--> [KV persistence for limits + telemetry]
          |
          +--> [CI quality gates: ESLint + Prettier + Vitest]
```

## Request Flow (high-level)

1. `src/index.js` receives request and performs endpoint/origin checks.
2. `src/lib/rate-limit.js` validates hourly + burst limits with KV.
3. Chat/business logic returns response (local or upstream mode).
4. `src/lib/event-store.js` writes best-effort NDJSON analytics events.
5. `src/lib/http-response.js` standardizes JSON + CORS headers.

## Local Quality Commands

```bash
cd apps/api/worker
npm run static:analysis   # eslint + prettier --check
npm test                  # vitest
```

## Why so many comments?

The Worker is interview-facing infrastructure. The comments in `src/lib/*` are intentionally explanatory so future maintainers can quickly understand:

- Why certain defaults were chosen,
- Why some paths fail open,
- Which values are user-controlled and need normalization.

## Crosslinks

- [Repository README](../../../README.md)
- [API README](../README.md)
- [Web README](../../web/README.md)
- [Worker lib guide](src/lib/README.md)
- [Analytics module](../../../docs/analytics/README.md)
