# Milestone 6 Implementation Plan

## Architecture Overview

### Data Model

Each event record shares a base structure optimized for edge storage and lightweight querying:

```
Event ID: Prefix + timestamp + random suffix (e.g., q_1711800000000_ab12cd)
Timestamp: ISO 8601 UTC
Client Identity: One-way hash of IP + origin + user-agent
```

#### Question Event Schema
```json
{
  "eventId": "q_1711800000000_ab12cd",
  "type": "question",
  "timestamp": "2026-03-30T12:34:56Z",
  "clientId": "f1a2b3c4",
  "question": "sanitized question text (max 2000 chars)",
  "questionHash": "sha256(normalized_question)",
  "topK": 5,
  "toneNote": "optional tone guidance",
  "humorMode": "clean_professional|standard"
}
```

#### Answer Event Schema
```json
{
  "eventId": "a_1711800000250_e3f456",
  "type": "answer",
  "timestamp": "2026-03-30T12:34:56Z",
  "questionEventId": "q_1711800000000_ab12cd",
  "clientId": "f1a2b3c4",
  "answer": "response text",
  "citationCount": 3,
  "retrievedChunks": 5,
  "answerHash": "sha256(answer_text)",
  "durationMs": 245,
  "backendMode": "local|upstream|openai"
}
```

#### Feedback Event Schema
```json
{
  "eventId": "f_1711800000300_987abc",
  "type": "feedback",
  "timestamp": "2026-03-30T12:34:56Z",
  "questionEventId": "q_1711800000000_ab12cd",
  "answerEventId": "a_1711800000250_e3f456",
  "clientId": "f1a2b3c4",
  "sentiment": "helpful|unhelpful",
  "optionalNote": "max 500 chars"
}
```

### Rate Limiting Strategy

**Client Identity Model**: Hybrid approach suitable for recruiting bot
- Primary: `X-Forwarded-For` IP (respects Cloudflare CF-Connecting-IP)
- Secondary: Origin header for same-IP filtering
- Fallback: Client IP + User-Agent hash

**Rate Limit Policy**:
- 30 questions per hour per client
- 1 second minimum between submissions per client
- 429 response with `Retry-After: 60` header
- Enforced block on limit breach: return 429 with Retry-After

### Storage

**Cloudflare Workers KV** for event logging:
- Key: `events:${YYYY-MM-DD}` (daily partitioned)
- Value: Newline-delimited JSON (NDJSON) for append-only writes
- TTL: 90 days (configurable retention)
- Retention policy documented in operational runbook

**Cloudflare Durable Objects (future enhancement)**:
- Real-time feedback aggregation and alerting
- Query interface for operational dashboards

## Implementation Phases

### Phase 1: Worker-side Rate Limiting & Event Recording (Priority 1)
1. Add rate limiting middleware to Worker (IP + time-based)
2. Generate stable format event IDs (prefix + timestamp + random)
3. Record question events to KV
4. Record answer events with question reference
5. Return event IDs in response headers
6. Document rate limit policy and client identity model

### Phase 2: Feedback API & Web UI (Priority 2)
1. Add `/api/feedback` POST endpoint in Worker
2. Implement feedback recording to KV
3. Add thumbs up/down buttons to web UI (adjacent to citations)
4. Post feedback to backend with question/answer event IDs
5. Provide immediate UI feedback (button state change)

### Phase 3: Privacy & Operational Documentation (Priority 3)
1. Document retention boundaries and data access policies
2. Add PII redaction for stored questions
3. Create operational runbook for review workflows
4. Define SLA metrics and alerting conditions

### Phase 4: Operational Reporting (Future)
1. Query interface for feedback distribution
2. Dashboard for top questions and sentiment trends
3. Escalation workflow for persistent quality issues

## Exit Criteria Mapping

| Criterion | Component | Status |
|-----------|-----------|--------|
| Rate limit protected /api/chat | Rate limiter middleware | Phase 1 |
| Documented client identity strategy | Docs + code comments | Phase 1 |
| Question events recorded | KV logging + event ID | Phase 1 |
| Stable event identifiers | UUID + header response | Phase 1 |
| Feedback submission | `/api/feedback` endpoint | Phase 2 |
| Feedback UI controls | Thumbs up/down buttons | Phase 2 |
| Privacy/retention documented | Operational runbook | Phase 3 |
| Feedback review workflow | Documented triage template | Phase 3 |
| Operational reporting | Query helpers (Phase 4) | Phase 4 |

## Dependencies & Constraints

- Cloudflare Workers KV must be available (standard across all plans)
- No database migrations needed (append-only design)
- Client-side feedback submission requires browser fetch (no third-party service)
- Rate limiting should degrade gracefully (count but don't block)

## Deployment Checklist

- [ ] wrangler.toml updated with KV binding
- [ ] Feature flag for rate limiting (canary mode)
- [ ] Event recording togglable via environment variable
- [ ] Web UI buttons behind feature flag initially
- [ ] Monitoring dashboard for event volume and errors
- [ ] Privacy policy updated with data collection notice
- [ ] Incident response runbook for data breaches

