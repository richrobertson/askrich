# Worker `src/lib` Module Guide

This directory contains small, focused modules used by the Cloudflare Worker entrypoint.

**Breadcrumbs:** [Repository Home](../../../../../README.md) > [apps/api](../../../README.md) > [worker](../../README.md) > [src/lib](README.md)

## Design principles applied

- **Single responsibility:** each file has one primary concern.
- **Testability:** helpers are pure where possible and exported directly.
- **Defensive parsing:** env/config values are normalized before use.
- **Best-effort telemetry:** analytics should not block recruiter chat responses.

## Module responsibilities

- `event-identifiers.js`
  - Generates compact event ids.
  - Builds stable, anonymized client ids.
- `event-policy.js`
  - Parses environment variables into policy objects.
  - Holds reusable constants for window/TTL math.
- `event-store.js`
  - Shapes analytics events and appends NDJSON records to KV.
  - Exposes recorder helpers for question/answer/feedback.
- `event-logging.js`
  - Barrel export to keep import surface stable.
- `rate-limit.js`
  - Enforces hourly and burst policies backed by KV.
- `http-response.js`
  - JSON response helpers and CORS/origin policy handling.

## Extension tips

- Add new event fields in `event-store.js` shaping helpers, not at call sites.
- Add new env policy flags in `event-policy.js` first, then consume in feature modules.
- Keep endpoint orchestration in `src/index.js`; avoid putting request routing into `lib/`.

## Crosslinks

- [Worker README](../../README.md)
- [API README](../../../README.md)
- [Repository README](../../../../../README.md)
