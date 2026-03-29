# Milestone 06: Usage Controls and Feedback Signals

**Status: Planned**

## Goals

- Protect Ask Rich from abusive or excessive question volume.
- Record recruiter questions for product learning and support analysis.
- Capture lightweight end-user feedback signals on answer quality.

## Scope

### Request rate limiting

- Add edge-side rate limiting for `POST /api/chat`.
- Define per-client limits that protect the service without blocking normal recruiter usage.
- Return clear `429` responses with retry guidance when limits are exceeded.

### Question event recording

- Record incoming questions and basic request metadata for analysis.
- Store timestamps, normalized request context, and response outcome signals.
- Exclude sensitive personal contact details and avoid storing unnecessary PII.

### Feedback capture

- Add recruiter-facing thumbs up/down feedback controls on answers.
- Persist feedback events with answer context and source question reference.
- Support simple reporting on helpful vs unhelpful answer patterns.

### Operational reporting

- Define baseline dashboards or queryable reports for traffic, throttling, and feedback trends.
- Track which questions are asked most often and which answers receive negative feedback.
- Use captured signals to prioritize corpus, prompt, and UX improvements.

## Non-goals

- Full analytics warehouse implementation.
- Complex moderation workflows or user account systems.
- Multi-dimensional abuse scoring beyond practical first-party rate limiting.

## Exit criteria

- `POST /api/chat` is protected by documented rate limits in deployed environments.
- Question events are recorded in a durable store suitable for product review.
- Users can submit thumbs up/down feedback for individual answers.
- Basic operational reporting exists for rate-limit events, top question themes, and feedback distribution.

## Planned implementation outline

1. Add an edge rate-limiting layer in the Cloudflare Worker before local or upstream chat execution.
2. Persist question and feedback events in a production data store aligned with the Cloudflare hosting model.
3. Add a feedback API contract and web UI controls for thumbs up/down submission.
4. Document retention boundaries, privacy constraints, and operational review workflow.

## Navigation

- Overview: [Milestone Overview](overview.md)
- Previous: [Milestone 05](milestone-05.md)