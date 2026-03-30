# Milestone 06: Usage Controls and Feedback Signals

**Status: Implemented**

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

## Implementation summary

### Completed deliverables

- ✅ **Rate limiting layer**: Cloudflare Worker middleware with configurable per-client limits (30 questions/hour, 1-second burst). Lenient enforcement (count and record, but allow execution).
- ✅ **Client identity strategy**: Hybrid model using CF-Connecting-IP + origin header fingerprinting (no raw IP storage). Hashed for privacy.
- ✅ **Question event recording**: Questions logged to Cloudflare KV daily partitions (NDJSON format) with stable event IDs, timestamps, and request metadata.
- ✅ **Answer event recording**: Responses linked to questions via event IDs, including latency, backend mode, and citation count.
- ✅ **Stable event identifiers**: UUID-style event IDs (q_*, a_*, f_*) returned in response headers (X-Question-Event-ID, X-Answer-Event-ID).
- ✅ **Feedback API**: New `/api/feedback` POST endpoint for recording thumbs up/down with optional user notes.
- ✅ **Feedback UI controls**: Web interface buttons ("👍 Yes", "👎 No") on assistant messages with client-side submission and visual feedback.
- ✅ **Privacy and retention policy**: Comprehensive operational guide with 90-day default TTL, PII redaction rules, GDPR compliance notes, and access boundaries.
- ✅ **Feedback review workflow**: Triage template, escalation triggers, and SLA definitions for operational response.

### Configuration

**wrangler.toml additions:**
- `EVENTS_KV` KV namespace binding (per environment)
- `RATE_LIMIT_ENABLED`, `RATE_LIMIT_QPS_HOUR`, `RATE_LIMIT_BURST_SECONDS` flags
- `EVENT_LOGGING_ENABLED` feature toggle

**Environment status:**
- Dev: Full logging and lenient limits (ready for local testing)
- Staging: Full logging with standard limits (ready for pre-prod validation)
- Prod: Full logging and strict limits (ready for public deployment)

### Documentation

- `docs/MILESTONE_6_OPERATIONS.md` — Comprehensive operational guide, privacy policy, feedback workflow, compliance notes
- `docs/milestones/milestone-06-implementation-plan.md` — Technical design, data schemas, implementation phases
- Inline code comments in Worker and web app detailing rate limit logic, event recording, and feedback submission flow

### Testing

**Local validation:**
```bash
# Rate limit enforcement
for i in {1..35}; do curl -X POST http://localhost:8787/api/chat ...; done
# Should see 429 after 30 requests

# Event recording
wrangler kv:key list # Should show events:YYYY-MM-DD
wrangler kv:key get events:$(date +%Y-%m-%d) | head -c 500 # NDJSON preview

# Feedback submission
curl -X POST http://localhost:8787/api/feedback -H "Content-Type: application/json" \
  -d '{"questionEventId":"q_...", "answerEventId":"a_...", "sentiment":"helpful"}'
```

## Navigation

- Overview: [Milestone Overview](overview.md)
- Previous: [Milestone 05](milestone-05.md)
- Next: [Milestone 07](milestone-07.md)
