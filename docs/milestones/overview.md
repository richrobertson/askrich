# Milestone Overview

Last updated: 2026-03-30

## Milestone 1 — Content corpus + schemas + ingestion scaffold

[Details](milestone-01.md)

**Scope**
- Define corpus structure and source document quality bar
- Establish metadata/frontmatter conventions
- Implement ingestion scaffold with runnable pipeline

**Deliverables**
- Baseline `content/` corpus documents
- Documentation for schemas and ingestion flow
- Working API with health and ingestion endpoints
- Helper scripts for corpus management

**Status**: Completed

**Non-goals**
- Production chat API
- Full frontend integration

## Milestone 2 — Retrieval and chat API

[Details](milestone-02.md)

**Scope**
- Build retrieval layer and runtime prompt assembly
- Implement `/api/chat` endpoint
- Return grounded answers with citations

**Deliverables**
- Provider-agnostic model + embeddings adapters
- Citation-aware answer formatting
- Basic API tests and smoke checks

**Status**: Completed (MVP)

**Non-goals**
- Full agentic orchestration

## Milestone 3 — Website integration

[Details](milestone-03.md)

**Scope**
- Integrate chat UI into personal website
- Improve recruiter UX and prompt starters

**Deliverables**
- Usable recruiter chat interface
- Citation rendering in UI
- Basic interaction telemetry

**Status**: Completed

**Non-goals**
- Advanced workflow graphs

## Milestone 4 — Evals and quality polish

[Details](milestone-04.md)

**Scope**
- Build question bank and rubric-driven evaluations
- Improve response quality and reliability

**Deliverables**
- Evaluation harness and score tracking
- Prompt/retrieval tuning based on failure modes

**Status**: Completed

**Non-goals**
- Large-scale production traffic optimization

## Milestone 5 — Cloudflare deployment + production hardening

[Details](milestone-05.md)

**Scope**
- Production deployment pipeline and environment hardening
- Security and reliability checks

**Deliverables**
- Dev/staging/prod deployment flow
- Operational runbook and incident basics

**Status**: Completed

**Non-goals**
- Multi-region custom infrastructure beyond Cloudflare-native plan

## Milestone 6 — Usage controls + feedback signals

[Details](milestone-06.md)

**Scope**
- Add chat rate limiting and abuse controls at the edge
- Record incoming questions for product and support analysis
- Capture user thumbs up/down feedback on answer quality
- Define privacy, retention, and event identity rules for captured interaction data

**Deliverables**
- Documented rate-limit policy for `POST /api/chat`
- Durable question event recording
- Feedback submission flow and stored feedback events
- Review workflow for negative feedback and follow-up improvements

**Status**: Implemented

**Non-goals**
- Full analytics platform or user account system

## Milestone 7 — Analytics, insights, and corpus evolution

[Details](milestone-07.md)

**Scope**
- Transform captured feedback signals into actionable insights
- Enable data-driven corpus and prompt improvements
- Support A/B testing and hypothesis-driven optimization

**Deliverables**
- Operational dashboards for question volume and answer quality
- Feedback-driven content planning process
- Lightweight corpus versioning and evolution tracking
- A/B testing framework for retrieval strategies
- Domain-specific insights and performance reporting

**Status**: Planned

**Non-goals**
- Real-time predictive modeling
- User profiling or personalized answers
- Complex multi-armed bandit testing
