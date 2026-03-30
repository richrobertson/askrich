# Performance Profiling Guide

This guide standardizes profiling for `POST /api/chat` across local and deployed environments.

## Objectives

- Measure end-to-end latency (`p50`, `p95`, `p99`) by backend mode.
- Detect regressions after retrieval/ranking/cache changes.
- Quantify cache effectiveness for repeat questions.

## Key Metrics

- Request latency: `p50`, `p95`, `p99`
- Error rate: non-2xx responses
- Fallback response rate: responses with no citations
- Retrieved chunk count distribution
- Cache hit ratio (where enabled)

## Baseline Procedure

1. Select representative question set (profile, technical, behavioral, career transition).
2. Run single-user warmup traffic.
3. Run concurrent traffic profile with fixed duration.
4. Export summary and compare against previous baseline.

## Local Profiling Command

Run from repository root:

```bash
bash scripts/load_test_chat.sh \
  --url http://127.0.0.1:8787/api/chat \
  --requests 200 \
  --concurrency 20 \
  --top-k 5
```

## Production Profiling Command

```bash
bash scripts/load_test_chat.sh \
  --url https://api.myrobertson.com/api/chat \
  --requests 300 \
  --concurrency 30 \
  --top-k 5
```

## Interpretation Guidance

- High `p95` with low error rate: investigate retrieval/ranking CPU and cache hit ratio.
- Rising error rate with higher concurrency: inspect upstream/network limits and rate limiting behavior.
- High fallback rate: prioritize corpus coverage and ranking quality.

## Guardrails

- Do not run aggressive load tests against production during peak periods.
- Keep synthetic traffic recruiter-safe and avoid storing sensitive input data.
- Record baseline snapshots before and after major retrieval/routing changes.
