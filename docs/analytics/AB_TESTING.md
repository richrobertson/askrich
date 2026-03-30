# Milestone 7: A/B Testing Framework

## Overview

The A/B testing framework enables data-driven optimization of retrieval strategies, prompt templates, and corpus content by safely running variants and measuring their performance against control.

Design constraints:
- **Edge-safe**: Variant routing logic compatible with Cloudflare Workers
- **Privacy-first**: No change to data collection; client can't detect variant
- **Minimal overhead**: Routing decision < 1ms latency impact
- **Safe by default**: No variant harming user experience without detection

## Architecture

### Variant Definition

Each experiment defines:
- **Control variant** (baseline): current behavior
- **Test variant(s)** (1-2 per experiment): proposed changes
- **Allocation**: % of traffic per variant (e.g., 95% control, 5% test)
- **Duration**: Start date, end date, early stopping conditions
- **Metrics**: What to measure (answer satisfaction, latency, etc.)
- **Hypothesis**: What outcome do we expect to see?

### Variant Types

| Type | Change | Example | Difficulty |
|------|--------|---------|-----------|
| **Retrieval** | Adjust top_k, scoring, re-ranking | top_k: 5→10 | Low |
| **Prompt** | Modify LLM instruction template | "Be concise" → "Be detailed" | Low |
| **Content** | A/B test corpus content | Version A vs. Version B of answer | Medium |
| **Routing** | Route to different backend | local vs. upstream for tech questions | Medium |
| **Hybrid** | Combination of above | New retrieval + new prompt | High |

### Variant Routing

**In Worker** (`apps/api/worker/src/index.js`):

```javascript
// Deterministic variant assignment based on client hash
function assignVariant(clientId, experimentId, splitConfig) {
  // 0-100 range based on hash prefix
  const variantScore = hashVariant(clientId, experimentId) % 100;
  
  if (variantScore < splitConfig.controlPercent) {
    return "control";
  } else if (variantScore < splitConfig.controlPercent + splitConfig.testPercent) {
    return "test_1";
  } else {
    return "excluded"; // Outside of experiment allocation
  }
}

// In /api/chat handler:
const experimentsActive = ["exp_retrieval_top_k", "exp_prompt_conciseness"];
const assignment = {};

for (const expId of experimentsActive) {
  const config = env[`EXPERIMENT_${expId}`]; // JSON from env
  if (config) {
    assignment[expId] = assignVariant(clientId, expId, config);
  }
}

// Store variant assignment in event headers
response.headers.set("X-AB-Variant", JSON.stringify(assignment));

// Use variant to influence behavior
if (assignment.exp_retrieval_top_k === "test_1") {
  topKParam = 10; // Test higher k
} else {
  topKParam = 5; // Control
}
```

### Event Tracking

All events record variant assignment:

```json
{
  "eventId": "q_...",
  "type": "question",
  "variants": {
    "exp_retrieval_top_k": "test_1",
    "exp_prompt_conciseness": "control"
  },
  ...
}
```

## Experiment Configuration

### Configuration File Format

`docs/analytics/experiments.yaml`:

```yaml
experiments:
  - id: "exp_retrieval_top_k"
    description: "Test increasing retrieval top_k from 5 to 10"
    hypothesis: "Higher citation depth improves answer quality"
    owner: "richrobertson"
    status: "active"
    
    start_date: "2026-04-01"
    end_date: "2026-04-15"
    
    variants:
      - id: "control"
        label: "top_k = 5 (baseline)"
        allocation_percent: 95
      - id: "test_1"
        label: "top_k = 10 (increased depth)"
        allocation_percent: 5
    
    success_criteria:
      - metric: "satisfaction_ratio"
        direction: "increase"
        threshold: 0.05  # 5 percentage point improvement
      - metric: "avg_citations"
        direction: "increase"
        threshold: 0.5  # +0.5 average citations
      - metric: "avg_latency_ms"
        direction: "stay_same"
        threshold: 100  # Warn if latency increases by >100ms
    
    analysis:
      min_sample_size: 100  # Require >=100 questions per variant
      confidence_level: 0.95  # 95% statistical confidence
      min_effect_size: 0.03  # Detect 3% absolute effect

  - id: "exp_prompt_conciseness"
    description: "Test shorter, more concise answer format"
    hypothesis: "Short answers are rated more helpful by recruiters"
    owner: "richrobertson"
    status: "planning"
    
    start_date: "2026-04-15"
    end_date: "2026-04-30"
    
    variants:
      - id: "control"
        label: "Standard answer format (~300 words)"
        allocation_percent: 90
      - id: "test_1"
        label: "Concise format (~100 words)"
        allocation_percent: 10
    
    success_criteria:
      - metric: "satisfaction_ratio"
        direction: "increase"
        threshold: 0.02  # 2 point improvement acceptable
```

## Running an Experiment

### Step 1: Define Experiment

Create entry in `docs/analytics/experiments.yaml` and commit:

```bash
git add docs/analytics/experiments.yaml
git commit -m "docs(analytics): define exp_retrieval_top_k experiment"
```

### Step 2: Deploy Variant Logic

Add variant-aware logic to Worker or API:

```javascript
// In worker for retrieval variant:
const topK = assignment.exp_retrieval_top_k === "test_1" ? 10 : 5;
const queryResult = await chroma.query(
  embedding,
  { n_results: topK }
);
```

For prompt variants, update the prompt template:

```javascript
// In local chat handler
const promptTemplate = assignment.exp_prompt_conciseness === "test_1"
  ? CONCISE_SYSTEM_PROMPT
  : STANDARD_SYSTEM_PROMPT;
```

Commit with experiment reference:

```bash
git commit -m "feat(worker): add variant logic for exp_retrieval_top_k

- Implement top_k=10 for test_1 variant
- Deterministic assignment by clientId
- Store variant in event headers"
```

### Step 3: Deploy and Monitor

1. Deploy worker with variant logic
2. Update environment variable with experiment config:
   ```bash
   EXPERIMENT_exp_retrieval_top_k='{"controlPercent":95,"testPercent":5}'
   wrangler secret put EXPERIMENT_exp_retrieval_top_k
   ```
3. Monitor event logs for variant assignments
4. Verify events are being tagged correctly

### Step 4: Analyze Results

After experiment runs for 1-2 weeks (or hits min sample size):

```bash
python3 scripts/analytics_experiment_report.py \
  --experiment exp_retrieval_top_k \
  --start_date 2026-04-01 \
  --end_date 2026-04-15
```

Generates:

```
Experiment Report: exp_retrieval_top_k
====================================

Hypothesis: Higher citation depth improves answer quality

Sample Size:
  Control (top_k=5): 1,200 questions
  Test (top_k=10): 63 questions
  ✓ Minimum met (100 per variant)

Primary Metrics:
  Satisfaction Ratio
    Control:   85.3%
    Test:      88.1%
    Uplift:    +2.8 pp
    Confidence: 92% (needs p-value below 0.05)

  Average Citations
    Control:   2.8
    Test:      3.5
    Uplift:    +0.7 (✓ exceeds +0.5 threshold)

Secondary Metrics:
  Average Latency
    Control:   245 ms
    Test:      251 ms
    Increase:  +6 ms (✓ within +100 ms threshold)

Success Criteria:
  ✓ satisfaction_ratio: +2.8 pp (threshold +5 pp) — On track
  ✓ avg_citations: +0.7 (threshold +0.5) — PASS
  ✓ avg_latency_ms: +6 ms (threshold +100 ms) — PASS

Recommendation: EXTEND TEST
- Metrics trending positive
- Continue running for 1 more week to reach 95% confidence
- Plan for promotion to 100% if trend continues
```

### Step 5: Promotion or Rollback

**If positive**:

```bash
# Update experiments.yaml
# - Set control allocation to 100%
# - Update control description to reflect new behavior
# - Mark experiment as "completed"

git commit -m "feat: promote exp_retrieval_top_k to 100%

Experiment showed +2.8pp satisfaction improvement with +0.7 citations.
Migrating top_k=10 to all users effective 2026-04-16."
```

**If no difference**:

```bash
# Mark as completed with no action
git commit -m "docs(analytics): conclude exp_retrieval_top_k (no effect)

Experiment showed no statistical difference in metrics.
Keeping existing top_k=5 as baseline."
```

**If negative**:

```bash
# Immediately switch to 100% control
EXPERIMENT_exp_retrieval_top_k='{"controlPercent":100,"testPercent":0}'
wrangler secret put EXPERIMENT_exp_retrieval_top_k

# Investigate and document findings
git commit -m "docs(analytics): roll back exp_retrieval_top_k (negative effect)

Test variant showed -3.2pp satisfaction. Root cause investigation:
- High latency for top_k=10 on slow connections
- User feedback noted redundant citations

Next iteration: reduce test to top_k=7 with latency optimization"
```

## Concurrent Experiments

Up to 3 experiments can run simultaneously (to avoid interaction effects).

Variants are independent; same client can be in:
- Control for exp_retrieval_top_k
- Test for exp_prompt_conciseness

Always track interactions in post-experiment analysis.

## Long-Running Operations

For larger variants (e.g., prompt rewrites affecting many questions):

1. **Ramp-up phase** (Week 1): 1% → 5% allocation
2. **Measurement phase** (Week 2-3): Maintain allocation, collect data
3. **Decision phase** (Week 4): Analyze, decide, promote or roll back

## Guardrails and Safety

1. **No variant can exceed 50% allocation** (prevents major outages)
2. **Automatic rollback** if metrics degrade significantly (TBD threshold)
3. **Mutual exclusion**: Experiments on same component require explicit dependency declaration
4. **Timeout**: Auto-conclude experiments after 30 days (must be re-approved to extend)

## Tools and Scripts

```bash
# List active experiments
python3 scripts/analytics_list_experiments.py

# Run experiment analysis
python3 scripts/analytics_experiment_report.py --experiment <id>

# Summarize concurrent experiment interactions
python3 scripts/analytics_interaction_analysis.py
```

## Experiments Launch Calendar

| Experiment | Start | End | Priority |
|-----------|-------|-----|----------|
| exp_retrieval_top_k | 2026-04-01 | 2026-04-15 | P1 |
| exp_prompt_conciseness | 2026-04-15 | 2026-04-30 | P1 |
| exp_behavioral_detection | 2026-05-01 | 2026-05-15 | P2 |

## See Also

- [Analytics Schema](SCHEMA.md)
- [Operational Alerts](ALERTS_AND_SLA.md)
- Worker implementation: [apps/api/worker/src/index.js](../../apps/api/worker/src/index.js)
