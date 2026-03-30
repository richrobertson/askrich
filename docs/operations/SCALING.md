# Scaling Runbook

Operational runbook for handling increased chat traffic with quality and cost controls.

## Capacity Targets

- Sustained traffic: 10x current baseline without quality regression.
- Burst tolerance: short spikes handled without prolonged error-rate increase.
- Quality preservation: maintain answer relevance and citation quality during load.

## Pre-Scale Checklist

- Confirm current `p95` and error-rate baseline.
- Validate rate-limit settings are appropriate for expected usage.
- Validate events and feedback logging health.
- Run chat load test at target concurrency profile.

## Scale Test Workflow

1. Run baseline load test.
2. Increase concurrency in staged steps (10, 20, 40, 60).
3. Capture latency/error summaries per stage.
4. Compare against previous release baseline.
5. Document any regressions and rollback criteria.

## Runtime Controls

- `RATE_LIMIT_ENABLED`
- `RATE_LIMIT_QPS_HOUR`
- `RATE_LIMIT_BURST_SECONDS`
- `CHAT_CACHE_ENABLED`
- `CHAT_CACHE_TTL_SECONDS`

## Degradation Strategy

If latency or errors cross thresholds:

- Step 1: confirm upstream/provider health and network status.
- Step 2: reduce expensive retrieval depth (`top_k`) in controlled fashion.
- Step 3: tighten rate limits temporarily for abusive traffic patterns.
- Step 4: communicate incident status and recovery ETA.

## Post-Incident Review

- Record trigger, impact window, and user-visible effects.
- Capture which control changes were applied.
- Add action items for prevention and runbook refinement.
