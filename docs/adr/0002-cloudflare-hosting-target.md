# ADR 0002: Cloudflare as hosting target

## Context

Ask Rich needs low-ops hosting for both frontend and API, with managed services for vectors and app data.

## Decision

Use Cloudflare as the default hosting target:
- Next.js frontend on Workers,
- Worker API backend,
- Vectorize + D1 (R2 optional later).

## Rationale

Cloudflare provides an aligned, Cloudflare-native stack with minimal infrastructure management burden and a practical path to production.

## Consequences

- Faster deployment path and reduced operational overhead.
- Architecture should stay compatible with Worker runtime constraints.
- Service integration decisions should prioritize Cloudflare-native patterns.
