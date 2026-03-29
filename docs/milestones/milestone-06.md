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
- Establish an abuse-resistant client identification strategy for edge enforcement.
- Return clear `429` responses with retry guidance when limits are exceeded.

### Client identity and abuse controls

- Define whether limits are keyed by IP, forwarded IP, origin, session identifier, or a hybrid model.
- Make the chosen client identity model explicit in deployment and operational documentation.
- Prevent trivial bypasses that would undermine rate limiting in front of the public website.

### Question event recording

- Record incoming questions and basic request metadata for analysis.
- Assign stable event IDs to questions and generated answers so later feedback can be tied to the exact interaction.
- Store timestamps, normalized request context, and response outcome signals.
- Exclude sensitive personal contact details and avoid storing unnecessary PII.

### Privacy and retention

- Define redaction expectations for stored question and feedback events.
- Document retention periods, review access boundaries, and deletion expectations.
- Keep recorded recruiter interactions useful for product learning without creating unnecessary privacy risk.

### Feedback capture

- Add recruiter-facing thumbs up/down feedback controls on answers.
- Persist feedback events with answer context and source question reference.
- Support simple reporting on helpful vs unhelpful answer patterns.

### Feedback review workflow

- Define how negative feedback is reviewed and triaged into corpus, prompt, retrieval, or UX work.
- Track feedback against stable question and answer event IDs.
- Ensure thumbs up/down signals are actionable rather than only decorative telemetry.

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
- The rate limiter uses a documented client identification strategy suitable for public web traffic.
- Question events are recorded in a durable store suitable for product review.
- Question, answer, and feedback records use stable event identifiers.
- Users can submit thumbs up/down feedback for individual answers.
- Retention, redaction, and access boundaries are documented for stored interaction data.
- A lightweight operational workflow exists for reviewing negative feedback and prioritizing follow-up fixes.
- Basic operational reporting exists for rate-limit events, top question themes, and feedback distribution.

## Planned implementation outline

1. Add an edge rate-limiting layer in the Cloudflare Worker before local or upstream chat execution.
2. Define the client identity key and rate-limit policy that will be enforced in public environments.
3. Persist question and feedback events in a production data store aligned with the Cloudflare hosting model.
4. Add stable event IDs for questions, answers, and feedback submissions.
5. Add a feedback API contract and web UI controls for thumbs up/down submission.
6. Document retention boundaries, privacy constraints, and operational review workflow.

## Navigation

- Overview: [Milestone Overview](overview.md)
- Previous: [Milestone 05](milestone-05.md)