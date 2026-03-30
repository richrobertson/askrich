# Corpus Versioning and Evolution

## Overview

Milestone 7 introduces lightweight versioning for corpus documents to track meaningful edits, enable audit trails, and support corpus evolution based on feedback signals.

## Design Principles

1. **Minimal overhead**: Use git history + frontmatter annotations, not complex versioning tables
2. **Audit trail**: Every meaningful change tracked with date, reason, and impact
3. **Semantic versioning**: Version documents by change significance, not frequency
4. **Backwards compatible**: Existing ingestion pipeline requires no changes
5. **Privacy-aware**: No persisted revision diffs containing sensitive feedback

## Versioning Metadata

### Frontmatter Format

Add or update `---` frontmatter block at the top of each corpus Markdown file:

```markdown
---
title: "Oracle Customer Notification Service Migration"
description: "Rich led migration of Oracle's CNS to OCI-native architecture"
source_url: "https://www.myrobertson.com/case-studies/oracle-cns-oci-migration/"
content_version: "1.2"
last_updated: "2026-03-30"
deprecated: false
changelog:
  - version: "1.2"
    date: "2026-03-30"
    changes: "Expanded scalability outcomes, added timeline details"
    reason: "corpus-gap-oracle-outcomes"
    impact: "high"
  - version: "1.1"
    date: "2026-02-15"
    changes: "Added OCI architecture diagram reference"
    reason: "retrieval-improvement"
    impact: "medium"
  - version: "1.0"
    date: "2026-01-15"
    changes: "Initial corpus import"
    reason: "initial-content"
    impact: "baseline"
---

# Oracle Customer Notification Service Migration

Content here...
```

### Versioning Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `content_version` | string | Semantic version (major.minor) | `"1.2"` |
| `last_updated` | date | ISO 8601 date of last change | `"2026-03-30"` |
| `deprecated` | bool | Mark content as deprecated but retained | `false` |
| `deprecation_date` | date (optional) | When content was deprecated | `"2026-04-15"` |
| `successor_ref` | string (optional) | Path to replacement document | `"content/profile/updated-tech-stack.md"` |
| `changelog` | array | History of significant changes | (see below) |

### Changelog Entry Format

```yaml
- version: "1.2"
    date: "2026-03-30"
    changes: "Expanded scalability outcomes, added timeline details"
    reason: "corpus-gap-oracle-outcomes"  # Reference to feedback/issue
    impact: "high"  # high/medium/low based on query frequency
```

**Reason codes** (for tracking improvement source):
- `initial-content` - Content created for initial corpus
- `corpus-gap-<issue-id>` - Addresses identified gap from feedback triage
- `retrieval-improvement` - Improves retrieval/ranking performance
- `content-refresh` - Regular update for accuracy/freshness
- `domain-expansion` - Covers new topic or role
- `user-request` - Direct feedback or request
- `competitive-context` - Added context for hiring/positioning

**Impact levels**:
- `high` - Affects multiple question domains (~10+ Q&A pairs)
- `medium` - Affects specific domain (3-10 Q&A pairs)
- `low` - Affects single question type or minor details
- `baseline` - Initial content (version 1.0)

## Workflow: Adding Versioning

### For New Documents

1. Create document with frontmatter
2. Set `content_version: "1.0"` 
3. Initialize changelog with single entry (initial-content)
4. Commit normally

Example:

```bash
# Create new file with frontmatter template
cat > content/projects/new-project.md << 'EOF'
---
title: "Project Name"
description: "..."
source_url: "..."
content_version: "1.0"
last_updated: "2026-03-30"
deprecated: false
changelog:
  - version: "1.0"
    date: "2026-03-30"
    changes: "Initial content"
    reason: "initial-content"
    impact: "baseline"
---

# Content here
EOF

git add content/projects/new-project.md
git commit -m "docs(content): add new project document"
```

### For Updating Existing Documents

1. Edit document content as normal
2. Increment `content_version` (bump minor if changes are additive/fixes; bump major for restructuring)
3. Update `last_updated` to today's date
4. Add entry to `changelog` array at the top (newest first)
5. Commit with reference to triage issue

Example:

```bash
# Edit file
vim content/profile/technologies.md

# Update frontmatter version and changelog
# BEFORE:
# content_version: "1.0"
# last_updated: "2026-01-15"
# changelog:
#   - version: "1.0"
#     ...

# AFTER:
# content_version: "1.1"
# last_updated: "2026-03-30"
# changelog:
#   - version: "1.1"
#     date: "2026-03-30"
#     changes: "Added recent Kubernetes and Terraform experience"
#     reason: "corpus-gap-platform-depth"
#     impact: "medium"
#   - version: "1.0"
#     ...

git add content/profile/technologies.md
git commit -m "docs(content): expand platform technologies

- Added Kubernetes/Terraform depth
- Updated for 2025-2026 project work
- Addresses corpus-gap-platform-depth"
```

### For Deprecating Content

Mark a document as deprecated when information becomes obsolete but you want to preserve history:

```markdown
---
title: "Legacy Project (Archived)"
...
content_version: "2.0"
last_updated: "2026-03-30"
deprecated: true
deprecation_date: "2026-03-30"
successor_ref: "content/projects/oracle-replacement.md"
changelog:
  - version: "2.0"
    date: "2026-03-30"
    changes: "Marked deprecated; see oracle-replacement.md for current context"
    reason: "content-refresh"
    impact: "high"
  ...
---

**DEPRECATED**: This content is no longer maintained. See [current version](../projects/oracle-replacement.md).

Original content...
```

The ingestion pipeline will:
- Flag deprecated documents
- Note successor reference in metadata
- Still index content (for historical searches)
- Add deprecation marker to retrieval results

## Audit and Querying

### Git Log Queries

Track corpus changes by commit message:

```bash
# All corpus updates with triage references
git log --grep="corpus-gap-" --oneline content/

# Changes to specific document
git log --oneline content/profile/technologies.md

# Summary of corpus changes in date range
git log --since="2026-03-01" --until="2026-03-31" --oneline -- content/
```

### Versioning Query Script

(To be implemented in M7 analytics)

```python
from analytics import CorpusVersionClient

client = CorpusVersionClient()

# List all documents with versions
docs = client.list_all_documents()
# Output: [{"path": "content/profile/...", "version": "1.2", "last_updated": "...", ...}, ...]

# Track updates by triage issue
updates = client.get_updates_by_reason("corpus-gap-oracle-outcomes")
# Output: [{"document": "...", "version_from": "1.0", "version_to": "1.1", ...}, ...]

# Documents modified in date range
recent = client.get_recent_updates(start_date="2026-03-01", end_date="2026-03-30")
```

## Retention and Cleanup

### Keeping Old Versions

- Keep all versions in git history (never rewrite/force-push)
- Frontmatter changelog includes 5-10 most recent entries (truncate older)
- For very old documents: move detailed changelog to separate `CHANGELOG.md` in directory

Example extended changelog:

```markdown
# Changelog — Starbucks Project Details

## Version History

### v1.5 (2026-03-30)
- Expanded reward platform outcomes
- reason: corpus-gap-starbucks-impact

### v1.4 (2026-02-15)
...

### v1.0 (2026-01-15)
- Initial content
```

### Archival

Documents that are completely superseded can be moved to `content/archive/` but retain git history:

```bash
git mv content/outdated-project.md content/archive/outdated-project.md
git commit -m "docs: archive outdated-project.md

Document completely replaced by newer-project.md.
Retained in archive for reference and historical context."
```

## Integration with Ingestion

The ingestion pipeline (`scripts/ingest_all.py`) will:

1. Read frontmatter metadata including versioning info
2. Parse `deprecated` flag and `successor_ref`
3. Store metadata in chunk embeddings
4. Tag deprecated documents in vector store
5. Score retrieval to prefer newer versions (if multiple versions exist)
6. Generate version audit report

## Operational Reports

### Monthly Corpus Health Report

```markdown
# Corpus Health — March 2026

## Summary
- Total documents: 25
- Average version: 1.3
- Q1 update intensity: 12 updates
- Documents marked deprecated: 0

## Most Active Documents
1. content/profile/technologies.md (v1.5) — updated 4 times
2. content/projects/oracle-cns.md (v1.3) — updated 2 times
3. content/skills/cloud-platform.md (v1.2) — updated 2 times

## Recent Deprecations
None this month

## Unversioned Documents
- content/faq/behavioral-interview-strategic-answers.md (no frontmatter)

## Action Items
- [ ] Add versioning frontmatter to 3 unversioned docs
- [ ] Review documents with version >= 3.0 for consolidation
```

### Feedback Impact Assessment

Track whether corpus updates improve satisfaction:

```markdown
# Corpus Update Impact

## Oracle Scalability Update (corpus-gap-oracle-outcomes)

**Date**: 2026-03-30  
**Document**: content/projects/oracle-cns.md  
**Change**: Expanded scalability and performance outcomes

**Before Update**: 4 unhelpful ratings on oracle/scalability questions  
**After Update (7-day)**: 1 unhelpful rating (75% improvement)  
**Satisfaction Trend**: 60% → 87% helpful
```

## See Also

- [Feedback Triage Workflow](FEEDBACK_TRIAGE.md)
- [Analytics Schema](SCHEMA.md)
- [Ingestion Pipeline](../../apps/api/app/routes/ingest.py)
