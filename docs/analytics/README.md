# Analytics Module

Milestone 7 analytics infrastructure for Ask Rich.

## components

- **[SCHEMA.md](SCHEMA.md)** — Event data model, metrics, and storage format
- **[FEEDBACK_TRIAGE.md](FEEDBACK_TRIAGE.md)** — Weekly workflow for corpus improvement
- **[CORPUS_VERSIONING.md](CORPUS_VERSIONING.md)** — Document versioning and audit trails
- **[AB_TESTING.md](AB_TESTING.md)** — Variant routing and experiment analysis
- **[ALERTS_AND_SLA.md](ALERTS_AND_SLA.md)** — Operational metrics and automated alerts

## Quick Start

### Query event data locally

```python
from analytics import AnalyticsClient

# Point to local NDJSON files
client = AnalyticsClient(local_events_dir="/tmp/events")

# Get last week's satisfaction
metrics = client.feedback_sentiment_ratio(
    start_date="2026-03-23",
    end_date="2026-03-30"
)
print(f"Satisfaction: {metrics['satisfaction_ratio']:.1%}")

# Get negative feedback for triage
items = client.get_negative_feedback_events(limit=20)
for item in items:
    print(f"Q: {item.question[:50]}")
    print(f"Sentiment: {item.sentiment}")
    print()
```

### Export feedback for review

```bash
python3 scripts/analytics_export_feedback.py --weeks 1 --output /tmp/triage.csv
```

### Run operational dashboard

```bash
# Soon: Web dashboard for real-time metrics
# For now: CLI reports
python3 scripts/analytics_daily_report.py
```

## Scripts

- `scripts/analytics_export_feedback.py` — Export feedback for triage
- `scripts/analytics_daily_report.py` — Daily metrics summary

Planned scripts (not yet implemented in this repository):
- `scripts/analytics_experiment_report.py` — Analyze A/B test results
- `scripts/run_triage_analysis.py` — Full weekly triage

## Database Schema (M7)

Event data stored in Cloudflare KV as daily NDJSON files:
- Key: `events:YYYY-MM-DD`
- Format: Newline-delimited JSON
- TTL: 90 days (configurable)
- Types: question, answer, feedback

See [SCHEMA.md](SCHEMA.md) for detailed format.

## Integration Points

- **Worker**: Records events in M6
- **Ingestion**: Corpus versioning metadata integration is planned ([CORPUS_VERSIONING.md](CORPUS_VERSIONING.md))
- **Operations**: SLA policy and manual runbook process are defined ([ALERTS_AND_SLA.md](ALERTS_AND_SLA.md))

## Future Enhancements (M8+)

- Real-time dashboard web UI
- Advanced cohort analysis
- Predictive quality monitoring
- Multi-variant sophisticated bandit testing
- User journey mapping
- Knowledge graph extraction from feedback
