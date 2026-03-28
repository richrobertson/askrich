# Milestone Overview

## Milestone 1 — Content corpus + schemas + ingestion scaffold

**Scope**
- Define corpus structure and source document quality bar
- Establish metadata/frontmatter conventions
- Implement ingestion scaffold with runnable pipeline

**Deliverables**
- Baseline `content/` corpus documents
- Documentation for schemas and ingestion flow
- Working API with health and ingestion endpoints
- Helper scripts for corpus management

**Status**: In progress — core scaffold in place, refinements ongoing

**Non-goals**
- Production chat API
- Full frontend integration

## Milestone 2 — Retrieval + chat API

**Scope**
- Build retrieval layer and runtime prompt assembly
- Implement `/api/chat` endpoint
- Return grounded answers with citations

**Deliverables**
- Provider-agnostic model + embeddings adapters
- Citation-aware answer formatting
- Basic API tests and smoke checks

**Non-goals**
- Full agentic orchestration

## Milestone 3 — Website integration

**Scope**
- Integrate chat UI into personal website
- Improve recruiter UX and prompt starters

**Deliverables**
- Usable recruiter chat interface
- Citation rendering in UI
- Basic interaction telemetry

**Non-goals**
- Advanced workflow graphs

## Milestone 4 — Evals + polish

**Scope**
- Build question bank and rubric-driven evaluations
- Improve response quality and reliability

**Deliverables**
- Evaluation harness and score tracking
- Prompt/retrieval tuning based on failure modes

**Non-goals**
- Large-scale production traffic optimization

## Milestone 5 — Cloudflare deployment + production hardening

**Scope**
- Production deployment pipeline and environment hardening
- Security and reliability checks

**Deliverables**
- Dev/staging/prod deployment flow
- Operational runbook and incident basics

**Non-goals**
- Multi-region custom infrastructure beyond Cloudflare-native plan
