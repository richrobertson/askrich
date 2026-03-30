# Operational Alerts and SLAs

## Overview

Milestone 7 defines operational metrics, SLA targets, and automated alerts to ensure Ask Rich continues performing reliably and catches quality degradation early.

## Core SLA Metrics

### Availability

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Chat API uptime** | 99.5% (per month) | <99% measured hourly |
| **Response time (p95)** | <500ms | >750ms average over 1 hour |
| **Error rate** | <1% | >2% over 5 minute window |

### Quality

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Satisfaction ratio** | >80% (helpful vs unhelpful) | <75% over 7-day window |
| **Answer coverage** | >95% | <93% over 24 hours |
| **Citation depth avg** | >2.0 | <1.5 over 24 hours |

### Engagement

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Daily questions** | >10 | <5 indicates low usage |
| **Feedback collection rate** | >5% of answers | <2% indicates UX issue |
| **Unique daily clients** | >5 | Monitor for trends |

## Alert Configuration

### Alert Channels

Alerts are delivered via:
1. **GitHub Issues** (auto-created for P1/P2)
2. **Email** (for critical only)
3. **Slack** (future: requires workspace integration)

### Alert Severity

| Severity | Example | Response |
|----------|---------|----------|
| **CRITICAL (P0)** | API down for >15 min | Page on-call immediately |
| **HIGH (P1)** | Satisfaction drops to 60% | Investigate within 1 hour |
| **MEDIUM (P2)** | Citation depth dropping | Review within 24 hours |
| **LOW (P3)** | Unusual pattern detected | Review in next sprint |

### Alert Rules

#### A1: High Error Rate

```yaml
name: "API Error Rate High"
severity: "CRITICAL"
condition: |
  error_count / total_requests > 0.02 (over 5-min window)
actions:
  - create_github_issue(title: "API Error Rate Critical", label: "incident")
  - send_email(recipients: ["rich@example.com"])
resolution: "Investigate logs, check upstream dependencies"
```

#### A2: Response Latency Degradation

```yaml
name: "Chat Response Latency High"
severity: "HIGH"
condition: |
  p95(response_time_ms) > 750 (over 1-hour window)
actions:
  - create_github_issue(title: "Response Latency Degradation", label: "performance")
  - attach_metrics(grafana_dashboard_url)
resolution: |
  - Check retrieval performance (vector DB latency)
  - Check LLM provider latency
  - Review question complexity distribution
```

#### A3: Satisfaction Drop

```yaml
name: "Satisfaction Ratio Drop"
severity: "HIGH"
condition: |
  satisfaction_ratio < 0.75 (over 7-day window)
actions:
  - create_github_issue(title: "Answer Quality Degradation", label: "quality")
  - attach_metrics(negative_feedback_export)
resolution: |
  - Export recent negative feedback
  - Run triage analysis
  - Identify content gaps or retrieval issues
  - Plan corpus updates
```

#### A4: Coverage Drop

```yaml
name: "Answer Coverage Low"
severity: "MEDIUM"
condition: |
  answers_with_content / total_answers < 0.93
actions:
  - create_github_issue(title: "Low Answer Coverage", label: "quality")
  - attach_metrics(unanswered_questions_list)
severity: "MEDIUM"
resolution: |
  - Review unanswered question patterns
  - Check if they're out-of-scope vs. content gaps
  - Plan corpus expansion if needed
```

#### A5: Citation Depth Decline

```yaml
name: "Citation Depth Trending Down"
severity: "MEDIUM"
condition: |
  7_day_avg_citations < 1.5 (AND decreasing vs. previous week)
actions:
  - create_github_issue(title: "Citation Depth Declining", label: "quality")
resolution: |
  - Check retrieval parameters (are we fetching enough chunks?)
  - Review if questions are becoming simpler
  - Ensure embeddings are up to date
```

#### A6: Unusual Question Patterns

```yaml
name: "Anomalous Question Volume"
severity: "LOW"
condition: |
  daily_questions < 5 (3-day warning)
  OR daily_questions > 200 (spike detection)
actions:
  - create_github_issue(title: "Unusual Question Volume Pattern", label: "monitoring")
resolution: |
  - If low: Marketing campaign needed? Traffic issue?
  - If high: Viral spike expected? Check for bot traffic
```

#### A7: Feedback Collection Low

```yaml
name: "Feedback Collection Rate Low"
severity: "LOW"
condition: |
  feedback_count / answer_count < 0.02 (over 24 hours)
actions:
  - log_metric(level: "warning", message: "Low feedback engagement")
severity: "LOW"
resolution: |
  - Review UI: Are feedback buttons visible?
  - Check if feedback endpoint is working
  - Consider UX improvements to feedback flow
```

## Monitoring and Dashboards

### Operational Dashboard

Real-time dashboard available at `https://internal.myrobertson.com/analytics/ops` (M7 implementation):

Displays:
- Last 24h question volume + trend
- Current satisfaction ratio + 7-day trend
- API response time (p50, p95, p99) + alerts
- Error rate + spike detection
- Citation depth distribution
- Top question domains (pie chart)
- Negative feedback list (last 10, sortable)
- Active experiments + variant distribution

### Weekly Metrics Report

Automated email delivered every Monday 09:00 UTC with:

```
Ask Rich Operations Report — Week of 2026-03-24

📊 Volume
  Questions: 487 (-12% vs. prev week)
  Feedback collected: 31 (6.4% collection rate)
  Unique clients: 47

😊 Quality
  Satisfaction: 86% (↑2pp from last week)
  Coverage: 96.5%
  Avg citations: 2.8
  Avg latency: 238ms

⚠️ Alerts This Week
  None

📈 Top 5 Question Domains
  1. Technical (45%) — Kubernetes, Java, platform
  2. Career (28%) — Role transition, background
  3. Behavioral (15%) — Story/STAR examples
  4. Profile (12%) — Links, resume

📝 Feedback Highlights
  - 3 unhelpful on behavioral prompts (already in triage)
  - 1 unanswered: "Where did you study?" (content gap)
```

### Monthly Business Review

Quarterly comprehensive report with:
- Satisfaction trend line + comparison to target
- Volume trend + seasonal analysis
- Top content by citation frequency
- Corpus updates executed + impact measured
- A/B test results summary
- Incidents and resolutions
- Recommendations for next quarter

## Incident Response Playbook

### When an Alert Fires

**Step 1: Assess (0-5 minutes)**
- Check dashboard for metric context
- Verify alert is not a false positive (check logs)
- Determine severity (use SLA as guide)

**Step 2: Scope (5-15 minutes)**
- Is this affecting users? (check API response codes)
- Which component is affected? (retrieval, LLM, worker, DB)
- How many users affected?

**Step 3: Mitigate (if critical)**
- Upstream API down? Switch to local backend
- High error rate? Check rate limiter config
- Performance issue? Scale/restart component

**Step 4: Root Cause (15-60 minutes)**
- Review recent deployments
- Check provider status pages (Cloudflare, Pinecone, OpenAI)
- Analyze logs for error patterns
- Check if this is content- or system-related

**Step 5: Remediate (1-24 hours)**
- For content issues: Update corpus + ingest
- For system issues: Tune performance or increase capacity
- For provider issues: Implement failover or mitigation

**Step 6: Post-mortem (24-48 hours)**
- Document what happened
- Root cause analysis
- Prevent-similar-in-future actions
- Update runbooks/alerts

## Runbooks

See [docs/operations/](../operations/) for detailed runbooks:
- [INCIDENT_RESPONSE.md](../operations/INCIDENT_RESPONSE.md) — Full IR playbook
- [TROUBLESHOOTING.md](../operations/TROUBLESHOOTING.md) — Common issues and fixes
- [DEPLOYMENT.md](../operations/DEPLOYMENT.md) — Safe deployment procedures

## Quarterly Goals

### Q2 2026

- [ ] Maintain >85% satisfaction ratio
- [ ] Keep API latency p95 <500ms
- [ ] Complete 2-3 feedback-driven corpus updates
- [ ] Run 2 A/B test experiments (retrieval, prompt)
- [ ] Zero critical incidents

### Q3 2026

- [ ] Expand to 4-5 active experiments
- [ ] Improve answer coverage to 97%
- [ ] Implement predictive quality monitoring
- [ ] Support 1000+ monthly questions

## Alerting Implementation

### Local Development

Mock alerts to stdout:

```bash
python3 scripts/run_local_alerts.py --verbose
```

### Production Monitoring

Automated alert orchestration is planned but not yet implemented in this repository. Current M7 workflow uses manual/periodic reporting via CLI scripts and dashboard review.

Suggested cadence until automation is added:
- Every day: run `python3 scripts/analytics_daily_report.py --range 7`
- Every week: export triage data via `python3 scripts/analytics_export_feedback.py --weeks 1 --output /tmp/triage.csv`

## Configuration

Alert thresholds can be tuned via:
- Environment variables — overrides for deployment-specific behavior
- Documentation updates in this file for policy-level thresholds

## See Also

- [Analytics Schema](SCHEMA.md)
- [Feedback Triage](FEEDBACK_TRIAGE.md)
- [A/B Testing Framework](AB_TESTING.md)
- Operations: [Incident Response](../operations/INCIDENT_RESPONSE.md)
