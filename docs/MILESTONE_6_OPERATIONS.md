# Milestone 6: Operations, Privacy, and Feedback Management

## Data Collection and Privacy

### Collected Data

**Question Events**
- Timestamp (ISO 8601 UTC)
- Question text truncated to max 2000 characters
- Client identifier (one-way hash of IP + origin + user-agent)
- Request parameters: top_k, humor_mode, tone note

**Answer Events**
- Timestamp
- Generated answer text (first 4000 characters)
- Citation count and retrieved chunk count
- Response latency (milliseconds)
- Backend mode used (local, upstream, or OpenAI)
- Linked to question via stable event ID

**Feedback Events**
- Timestamp
- Feedback sentiment (helpful, unhelpful, neutral)
- Optional user note (max 500 characters, user-provided)
- Linked to question and answer via event IDs
- Client identifier (same hash as question/answer events)

### What We Don't Store

- Raw IP addresses (only a one-way hash is stored)
- User authentication credentials
- Personal contact information (emails, phone numbers)
- Conversation user agents or detailed browser fingerprints
- Large PII patterns (SSNs, credit cards, etc.)

## Retention and Expiration

### Default Retention Period: 90 Days

All event records are stored in Cloudflare KV with a TTL (time-to-live) set to 90 days from the date of creation. After 90 days, records are automatically deleted.

### Basis for 90-Day Retention

- Sufficient for identifying short-term quality trends
- Adequate for analyzing seasonal question patterns
- Allows 2-3 feedback cycles before auto-deletion
- Avoids long-term liability from stored conversations
- Complies with privacy-minimization principles

### Configuration and Override

The TTL is configurable via environment variable `EVENT_TTL_DAYS` (default: 90):

```bash
# Set custom retention: 30 days
wrangler deploy --secret EVENT_TTL_DAYS=30

# 180-day retention for business archive (rare)
wrangler deploy --secret EVENT_TTL_DAYS=180
```

**Override Requires**:
1. Explicit approval via PR comment from maintainer
2. Documentation of business justification
3. Privacy review if exceeding 180 days

## Access Control and Boundaries

### Event Store Access

**Who can access event data:**
- Deployed Worker (automatic on each request)
- Cloudflare Dashboard (via KV browser, maintainer-only)
- Local development (via `wrangler kv:key list` during testing)

**Who cannot access:**
- End users (no public query endpoints)
- External analytics services (no export by default)
- Third-party integrations (requires explicit feature flag)

### Query and Export Boundaries

- No direct internet-facing query API (M6 endpoint is write-only for feedback)
- Exports must be ad-hoc via `wrangler kv:key list` followed by local parsing
- No SQLite/database interface (append-only NDJSON prevents complex queries)
- Reporting happens offline via scripts or dashboards (not user-facing)

## Redaction and Deletion

### PII Redaction at Write Time (Planned)

As of Milestone 6, the Worker truncates question text but does not yet apply pattern-based redaction in the write path. The following illustrates planned redaction rules:

```javascript
// Question redaction rules:
// - Remove email addresses: name@domain.com → [EMAIL]
// - Remove phone patterns: (555) 123-4567 → [PHONE]
// - Remove URLs for profile sites (unless whitelisted)

function redactQuestion(text) {
  let redacted = text
    .replace(/[\w\.-]+@[\w\.-]+\.\w+/g, "[EMAIL]")
    .replace(/\(?[0-9]{3}\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}/g, "[PHONE]")
    // More patterns as discovered
  return redacted;
}
```

**Future Improvement**: Wire pattern-based and ML-assisted PII detection into runtime writes (M7 analytics phase).

### Manual Deletion

For compliance with data subject requests or breach response:

```bash
# Delete all events for a specific date
wrangler kv:key delete events:2026-03-30

# Purge all events (use with extreme caution)
wrangler kv:key delete "events:*" --namespace-id <namespace-id>
```

**Deletion Audit**:
- Log deletion requests with timestamp and requester
- Require approval from at least two maintainers
- Document business reason in DELETION_LOG.txt

## Feedback Review Workflow

### Triage Template

When negative feedback is submitted, follow this workflow:

```
1. Review Question + Answer
   - Was the question clear?
   - Did the answer match the question intent?
   - Were citations relevant?

2. Root Cause Analysis
   - [ ] Information gap (answer missing content)
   - [ ] Retrieval failure (wrong sources returned)
   - [ ] Prompt/phrasing issue (answer unclear)
   - [ ] Corpus outdated (information has changed)
   - [ ] User expectation mismatch (question out of scope)

3. Action Items
   - [ ] Corpus update (add/update relevant document)
   - [ ] Retrieval tuning (adjust scoring, add synonyms)
   - [ ] Prompt adjustment (reword generation)
   - [ ] FAQ clarification (set user expectations)
   - [ ] No action (acceptable limitation)

4. Track to Completion
   - Link to issue or PR
   - Document fix deployed
   - Re-run eval if corpus changed
```

### Weekly Feedback Review Checklist

Every Monday, maintainer reviews:

1. Count unhelpful feedback since last week
2. Identify top 3 question themes with negative sentiment
3. Triage to corpus/prompt/retrieval/UX work
4. Assign severity: low/medium/high (impacts follow-up timeline)
5. Create issues for high-severity items

### Escalation Triggers

**Investigate if:**
- >20% of feedback in a category is unhelpful
- Same question asked repeatedly with negative feedback both times
- Technical question about a domain getting >3 unhelpful responses

**Escalation Action:**
1. Discuss in sync meeting
2. Decide: urgent fix vs. backlog vs. out-of-scope
3. Document decision in issue

## Rate Limiting

### Policy Enforcement

**Per-Client Rate Limits:**
- 30 questions per hour
- 1-second minimum between submissions
- Client identified by: one-way hash of IP + origin + user-agent

**Rate Limit Response:**

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
Content-Type: application/json

{
  "success": false,
  "error": "Rate limit exceeded. Please try again soon.",
  "eventId": "q_uuid_..."
}
```

### Enforcement Behavior

- Limits are enforced: requests over threshold return `429`
- `Retry-After` indicates when the client can retry
- Requests are still recorded for operational visibility

### Monitoring and Alerts

Alert conditions:

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Rate limit hits | >100/hour from single IP | Review logs for bot pattern |
| Burst rate | >5 questions in 10 seconds from single client | Check for legitimate tool usage |
| Origin abuse | >500 hits/hour from single origin | Block origin (future M6 enhancement) |

## Operational SLAs

### Baseline Service Levels

| Metric | Target | Measurement |
|--------|--------|-------------|
| Event recording latency | <100ms | Full request time (not async) |
| Feedback submission success | >99% | Weekly rolling average |
| KV write failures | <1% | Count of retries needed |
| Data availability | >99.9% | Query success rate |

### Incident Response

If event recording or feedback collection fails:

1. **Service degradation** (logs but no action): Continue serving chat, re-check KV in next request
2. **Partial failure** (some events lost): Alert on dashboard, triage in next sprint
3. **Complete failure** (KV down): Fall back to memory-only mode, disable feedback UI, alert on-call

## Configuration Reference

### wrangler.toml Defaults

```toml
[vars]
RATE_LIMIT_ENABLED = "true"
RATE_LIMIT_QPS_HOUR = "30"
RATE_LIMIT_BURST_SECONDS = "1"
EVENT_LOGGING_ENABLED = "true"
EVENT_TTL_DAYS = "90"

[[kv_namespaces]]
binding = "EVENTS_KV"
id = "<REAL_KV_NAMESPACE_ID>"
preview_id = "<REAL_PREVIEW_NAMESPACE_ID>"
```

### Environment-Specific Overrides

```bash
# Staging: higher threshold for load testing
wrangler deploy --env staging -c <(echo 'RATE_LIMIT_QPS_HOUR = "100"')

# Testing: Disable event logging to avoid pollution
wrangler deploy --env test -c <(echo 'EVENT_LOGGING_ENABLED = "false"')
```

## Compliance Notes

### GDPR / Privacy Regulations

- Minimal data collection (questions + answers only, no user profiling)
- Automatic deletion after 90 days (right to be forgotten)
- No third-party sharing (internal analytics only)
- User can decline feedback submission (not required)
- Hashed client ID (IP not stored in clear)

### Future Enhancements (M7)

- Data export request API (allow users to request their data dump)
- PII detection and automatic redaction (ML-based)
- Query audit log (who accessed what, when)
- Differential privacy for aggregate reporting

## Testing and Validation

### Local Development

```bash
# Clear local KV store
rm -rf .wrangler/

# Deploy with event logging disabled (dev mode)
wrangler deploy --env dev

# Send test question (should see event recording succeed)
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"question": "Test question"}' \
  -i  # Show headers including X-Question-Event-ID
```

### Staging Validation

Before prod deployment:

1. Send 50+ test questions
2. Submit feedback votes on several
3. Verify KV store has expected event counts
4. Check that rate limiting kicks in after 30 in 1 hour
5. Confirm all events auto-expire after configured TTL

