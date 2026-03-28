# Intended Repository Structure

## Overview

Ask Rich is organized as a planning-first monorepo that will evolve into an implementation monorepo.

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

Future Next.js frontend for recruiter-facing chat UI, prompt starters, and citation rendering.

## `apps/api`

Future Cloudflare Worker API for retrieval, prompt assembly, model/embedding adapters, and response formatting.

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

Automation helpers planned for:
- ingestion pipeline tasks,
- smoke tests,
- eval execution,
- deployment support tasks.

## `data`

Local development persistence, including Chroma vector data.
Production persistence targets Cloudflare-managed services.
