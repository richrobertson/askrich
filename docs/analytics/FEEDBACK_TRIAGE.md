# Feedback Triage Workflow

## Overview

The feedback triage workflow transforms raw negative feedback from M6 into actionable corpus and prompt improvements. This process occurs in regular cycles (weekly recommended) and feeds directly into corpus planning.

## Workflow Steps

### Step 1: Collect Negative Feedback

Run the analytics script weekly to export unhelpful feedback:

```bash
python3 scripts/analytics_export_feedback.py --weeks 1 --output /tmp/triage_weekly.csv
```

This exports:
- Question text
- Answer provided
- User's optional note
- Timestamp and citation count
- Backend mode used

### Step 2: Initial Triage Classification

For each negative feedback entry, classify the root cause:

| Category | Definition | Action |
|----------|-----------|---------|
| **Information Gap** | Answer was incomplete or missing key details | Corpus update required |
| **Retrieval Failure** | Wrong sources were retrieved | Review retrieval config/synonyms |
| **Outdated Content** | Cited sources contain stale information | Update/deprecate document |
| **Prompt/Phrasing** | Answer was accurate but unclear or poorly formatted | Prompt template tuning |
| **Out of Scope** | User asked something beyond Rich's profile | Document as non-goal/limitation |
| **False Negative** | Actually a good answer; user expectation mismatch | Skip action; update guidance |

### Step 3: Extract Patterns

Group feedback by:
- **Domain** (technical, behavioral, career, profile)
- **Recurring theme** (e.g., "Java experience", "work gap context")
- **Root cause type** (see Step 2)

Look for clusters:
- 3+ negative ratings on similar questions → high-priority gap
- Specific document cited in multiple negative ratings → content is outdated
- Same user asking variations → single knowledge gap worth addressing

### Step 4: Prioritize Actions

Prioritize updates based on:

1. **Impact**: How many questions are affected?
   - 10+ negative ratings on a topic → P0 (implement immediately)
   - 3-9 negative ratings → P1 (implement this week)
   - 1-2 negative ratings → P2 (consider next cycle)

2. **Effort**: How much corpus work is required?
   - Add/update 1-2 documents → Low effort
   - Rewrite entire section → Medium effort
   - New content area needed → High effort

3. **User Intent**: What's most valuable to recruiters?
   - Career transition questions → High value
   - Technical role fit questions → High value
   - Niche questions → Lower value

### Step 5: Plan Corpus Updates

For each P0 or P1 item, create a corpus update task:

```markdown
## Issue: Insufficient Context on Work Gap

**Negative Feedback Count**: 7
**Root Cause**: Information Gap
**Questions Affected**:
- "Tell me about the gap between your last role and now"
- "Why were you at Oracle and now...?"
- "What did you do after Oracle?"

**Proposed Solution**:
- Enhance `content/profile/career-transition.md` with:
  - Expanded timeline of 2024 RIF context
  - Family focus narrative
  - Technology continuation during gap
  - Timeline to next role search

**Estimated Effort**: 2 hours content creation + 30 min testing
```

### Step 6: Implement Updates

Update corpus documents following [Corpus Versioning](CORPUS_VERSIONING.md) process:

```bash
# Edit the document
vim content/something.md

# Commit with versioning annotation
git commit -m "docs(content): expand work-gap context

- Add timeline and detail to career transition narrative
- Addresses 7 negative feedback signals on gap questions
- Closes corpus-gap-001"
```

### Step 7: Test and Validate

1. Regenerate embeddings and index:
   ```bash
   python3 scripts/ingest_all.py
   ```

2. Run smoke tests on affected question domain:
   ```bash
   python3 scripts/test_canned_responses.py --domain career_transition
   python3 scripts/test_canned_responses_integration.py --filter "*gap*" --url http://localhost:8787
   ```

3. Manual testing in local mode:
   ```bash
   # In separate terminal:
   npm start  # in apps/web
   wrangler dev  # in apps/api/worker
   
   # Ask questions that generated negative feedback
   # Verify answer quality improved
   ```

### Step 8: Release and Monitor

1. Push changes to feature branch
2. Open PR with triage summary
3. Deploy to staging
4. Monitor for feedback on same questions in production
5. If satisfaction improves, close the issue; otherwise iterate

## Triage Templates

### Information Gap Template

```
**Analysis**
- Question: [user's exact question]
- Current answer: [what we returned]
- User feedback: [their note, if provided]

**Root Cause**
Information about [topic] is missing or incomplete in our corpus.

**Proposed Fix**
1. Update or create corpus document: content/[category]/[file].md
2. Add content: [bullet points of what to add]
3. Related documents to review: [docs that should link to this]

**Success Criteria**
- Document indexed and searchable
- Smoke test passes
- [Related questions] now return contextual answers
```

### Retrieval Failure Template

```
**Analysis**
- Question: [user's question]
- Expected source documents: [what should have been retrieved]
- Actual sources retrieved: [what was returned]

**Root Cause**
Current embedding/retrieval strategy doesn't connect "[user phrase]"
with "[document concept]".

**Proposed Fix**
- Option A: Add synonyms/keywords to source document metadata
- Option B: Adjust retrieval scoring or reranking
- Option C: Add FAQ section with common phrasings

**Testing**
- Re-index after keyword updates
- Verify retrieval of expected documents for this query
```

### Outdated Content Template

```
**Analysis**
- Question: [user's question]
- Source cited: content/[file].md
- Problem: [what's outdated]

**Root Cause**
Information changed as of [date]; corpus reflects [old information].

**Proposed Fix**
1. Update content/[file].md with current information
2. Add deprecation note if content is no longer relevant
3. Link to timeline/changelog if available

**Verification**
- Re-read updated section for accuracy
- Test questions that cite this document
```

## Regular Rhythm

### Weekly Triage (15-30 minutes)

1. Export feedback from past 7 days
2. Quick scan for obvious patterns
3. File any P0 issues immediately

### Bi-weekly Deep Review (1-2 hours)

1. Comprehensive triage of all feedback
2. Clustering and pattern identification
3. Prioritization and task creation
4. Capacity planning for next sprint

### Monthly Release Cycle

1. Implement top 3-5 P1 items
2. Test and validate
3. Release corpus updates
4. Monitor satisfaction trend

## Tools and Scripts

See [scripts/analytics_export_feedback.py](../../scripts/analytics_export_feedback.py)
and [scripts/run_triage_analysis.py](../../scripts/run_triage_analysis.py).

## Feedback Loop Metrics

Track improvement over time:

- **Before**: X% satisfaction ratio on [topic]
- **Update**: [Corpus change summary]
- **After**: Y% satisfaction ratio on [topic]
- **Net impact**: (Y - X) percentage point improvement

Maintain a [TRIAGE_LOG.md](TRIAGE_LOG.md) for historical record.

## See Also

- [Corpus Versioning](CORPUS_VERSIONING.md)
- [Analytics Schema](SCHEMA.md)
- [Operational Alerts](ALERTS_AND_SLA.md)
