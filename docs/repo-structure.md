# Intended Repository Structure

## Overview

Ask Rich is organized as an implementation-focused monorepo with local runnable scaffolds and a Cloudflare production target.

```text
apps/
  web/
  api/
content/
docs/
scripts/
data/
```

## `apps/web`

Recruiter-facing chat UI scaffold with prompt starters, citation rendering, and local API integration.

## `apps/api`

FastAPI local runtime for ingestion and retrieval-backed chat (`/ingest`, `/api/chat`) using provider-agnostic adapters.

## `content`

Curated knowledge corpus used for ingestion:
- profile (bio/resume)
- projects
- skills
- recruiter FAQs

## `docs`

Project documentation:
- architecture
- deployment plans
- milestone plans
- ADRs
- prompt strategy
- evaluation methods

## `scripts`

Automation helpers for:
- ingestion pipeline tasks,
- smoke tests,
- eval execution,
- deployment support tasks (later expansion).

## `data`

Local development persistence, including Chroma vector data.
Production persistence targets Cloudflare-managed services.
