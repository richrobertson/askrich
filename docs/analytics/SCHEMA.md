# Milestone 7: Analytics Schema and Event Model

## Overview

Analytics in Milestone 7 provides operational insights into:
- Question volume and patterns
- Answer quality and satisfaction
- Feedback-driven corpus improvements
- A/B testing and variant performance
- Domain-specific performance metrics

Data flows from M6 event capture → daily NDJSON KV storage → M7 analytics queries → insights and dashboards.

## Event Data Model

### Event Structure

All events are stored as NDJSON (newline-delimited JSON) with the key pattern `events:YYYY-MM-DD`.

#### Question Event

```json
{
  "eventId": "q_1711814400000_abc123",
  "type": "question",
  "timestamp": "2026-03-30T12:00:00Z",
  "clientId": "a1b2c3d4",
  "question": "How strong is Rich in Java?",
  "topK": 5,
  "humorMode": "clean_professional"
}
```

**Fields:**
- `eventId` (string): Unique event identifier, format `q_<timestampMs>_<random>`
- `type` (string): Always `"question"`
- `timestamp` (ISO 8601): Question submission time in UTC
- `clientId` (string): One-way hash of IP + origin + user-agent
- `question` (string): Question text, truncated to 2000 chars
- `topK` (number): Retrieval parameter (typically 5)
- `humorMode` (string): Response tone setting (e.g., "clean_professional")

#### Answer Event

```json
{
  "eventId": "a_1711814401000_def456",
  "type": "answer",
  "timestamp": "2026-03-30T12:00:01Z",
  "questionEventId": "q_1711814400000_abc123",
  "clientId": "a1b2c3d4",
  "answer": "Java is a core strength...",
  "citationCount": 3,
  "answerHash": "Java is a core st",
  "durationMs": 245,
  "backendMode": "local"
}
```

**Fields:**
- `eventId` (string): Unique answer event identifier
- `type` (string): Always `"answer"`
- `timestamp` (ISO 8601): Answer returned time
- `questionEventId` (string): Links to parent question event
- `clientId` (string): Inherited from question
- `answer` (string): Answer text, truncated to 4000 chars
- `citationCount` (number): Number of sources cited
- `answerHash` (string): First 20 chars of answer for deduplication
- `durationMs` (number): Latency from question to answer
- `backendMode` (string): Which backend answered (`"local"`, `"upstream"`, `"openai"`)

#### Feedback Event

```json
{
  "eventId": "f_1711814402000_ghi789",
  "type": "feedback",
  "timestamp": "2026-03-30T12:00:02Z",
  "questionEventId": "q_1711814400000_abc123",
  "answerEventId": "a_1711814401000_def456",
  "clientId": "a1b2c3d4",
  "sentiment": "helpful",
  "optionalNote": "This clarified my question about distributed systems."
}
```

**Fields:**
- `eventId` (string): Unique feedback event identifier
- `type` (string): Always `"feedback"`
- `timestamp` (ISO 8601): Feedback submission time
- `questionEventId` (string): Links to question
- `answerEventId` (string): Links to answer
- `clientId` (string): Inherited from question/answer
- `sentiment` (string): `"helpful"`, `"unhelpful"`, or `"neutral"`
- `optionalNote` (string): Optional user comment, max 500 chars

## Retention and Lifecycle

- **Storage**: Cloudflare KV with 90-day TTL (configurable via `EVENT_TTL_DAYS`)
- **Format**: NDJSON (newline-delimited JSON), one file per day
- **Key pattern**: `events:YYYY-MM-DD`
- **Auto-deletion**: Records expire 90 days after creation

## Derived Metrics and Aggregations

### Question-Level Metrics

- **Volume**: Total unique questions per day/week/month
- **Recurring patterns**: Questions asked multiple times (by content hash)
- **Intent distribution**: Questions categorized as technical, behavioral, career, profile-based
- **Response time**: Distribution of `durationMs` (p50, p95, p99)

### Answer-Level Metrics

- **Coverage**: Percentage of questions with answer vs. fallback
- **Citation depth**: Distribution of `citationCount` (average, percentiles)
- **Backend distribution**: Breakdown of answers by `backendMode`
- **Answer uniqueness**: Deduplication of answers using `answerHash`

### Feedback-Level Metrics

- **Satisfaction ratio**: Helpful vs. unhelpful feedback counts
- **Feedback volume**: Total feedback as percentage of answers
- **Sentiment trends**: Daily/weekly sentiment movement
- **Correlation**: Feedback sentiment tied to question intent, answer backend, or citation count

### Corpus Performance

- **Document hit rate**: How often each source document is cited
- **Content gaps**: Questions receiving negative feedback without good citations
- **Outdated content**: High frequency of questions on deprecated topics
- **Topic coverage**: Distribution of questions by inferred domain

## Analytics Query Interface

### Python Client (apps/api/analytics/)

```python
from analytics import AnalyticsClient

client = AnalyticsClient(kv_namespace="EVENTS_KV")

# Query aggregates
volume = client.question_volume(date_range=("2026-03-01", "2026-03-30"))
satisfaction = client.feedback_sentiment_ratio(date_range=...)
time_series = client.daily_question_count(start_date="2026-03-01", end_date="2026-03-30")

# Query events
negative_feedback = client.get_feedback_events(sentiment="unhelpful", limit=100)
unanswered = client.get_questions_without_feedback(limit=50)
slow_answers = client.get_slow_answers(threshold_ms=1000, limit=50)

# Export for analysis
events_export = client.export_events(date="2026-03-30", format="jsonl")
```

### Manual KV Export

```bash
# Fetch daily event file
wrangler kv:key get events:2026-03-30 > /tmp/events_2026-03-30.jsonl

# List all available event dates
wrangler kv:key list --namespace-id "<namespace-id>" --prefix "events:" --json
```

## Aggregation and Storage

### Lightweight Aggregation

Instead of storing precomputed aggregate tables, Milestone 7 uses on-demand queries:

1. **Real-time queries**: Python scripts read NDJSON directly from KV
2. **Caching**: Important aggregates cached in KV with 24-hour TTL (e.g., `analytics:daily_2026-03-30`)
3. **Batch operations**: Nightly scheduled aggregations for slow queries

### Aggregate Cache Keys

```
analytics:daily:<date>
  Stores: { volume, sentiment_ratio, avg_latency, feedback_count }

analytics:weekly:<year>-W<week>
  Stores: { total_volume, unique_questions, engagement_trend }

analytics:domain:<domain>:<date>
  Stores: { volume, feedback_ratio, avg_latency, top_unanswered }
```

## Privacy Considerations

- **Event queries**: Always respect clientId as opaque hash (never reverse-engineer IP/origin)
- **Aggregation scope**: Group by day or longer; avoid intra-hour tracking for privacy
- **Sensitive questions**: Redact question text in reports if it contains detected PII
- **Retention alignment**: Queries expire after 90 days, matching KV TTL

## Reporting and Exports

### Dashboard Reports

Real-time HTML dashboards display:
- Daily/weekly question volume
- Sentiment trend chart
- Top domains and recurring questions
- Citation depth distribution
- Feedback-negative questions (actionable list)

### Programmatic Exports

```python
# Quarterly business review
qbr_report = client.generate_qbr_report(quarter="Q1-2026")
# Output: Excel with volume trends, satisfaction, domain breakdown, top issues

# Feedback triage export
triage = client.export_negative_feedback(
    start_date="2026-03-01",
    end_date="2026-03-30",
    include_full_answer=True
)
# Output: CSV for manual review and corpus planning
```

## Next Steps

See:
- [Feedback Triage Workflow](FEEDBACK_TRIAGE.md)
- [Corpus Versioning](CORPUS_VERSIONING.md)
- [A/B Testing Framework](AB_TESTING.md)
- [Operational Alerts](ALERTS_AND_SLA.md)
- [Dashboard Usage Guide](DASHBOARDS.md)
