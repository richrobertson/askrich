# Content Schema (Milestone 1 Baseline)

This document defines the baseline metadata contract for corpus documents in `content/`.

## Design goals

- Keep schemas lightweight and human-authorable.
- Preserve retrieval quality through consistent metadata.
- Avoid provider-specific assumptions in corpus format.

## Common required frontmatter

All content files must include:

- `id` (stable unique identifier)
- `title` (human-readable title)
- `type` (`profile` | `resume` | `project` | `skill` | `faq`)
- `summary` (1–2 sentence retrieval-oriented summary)
- `tags` (string array)
- `updated` (ISO date: `YYYY-MM-DD`)

## Type-specific recommendations

### `project`

Recommended additional fields:
- `role`
- `technologies` (string array)

### `skill`

Recommended additional fields:
- `proficiency` (optional short text)
- `signals` (optional string array)

### `faq`

Recommended additional fields:
- `audience` (default: recruiter)

## Validation rules (initial)

- `id` must be non-empty and kebab-case.
- `tags` must include at least one value.
- `updated` must parse as ISO date.
- Body must include at least one markdown heading for chunk-friendly segmentation.

## Example schema instance

```yaml
id: project-oracle-cns-migration
title: Oracle CNS Migration to OCI
type: project
summary: Migration initiative focused on safe rollout and observable cutovers.
role: Senior Software Engineer
technologies: [Kubernetes, Istio, Prometheus, OCI]
tags: [migration, cloud, reliability]
updated: 2026-03-28
```

## Versioning note

Schema evolution should be incremental. Breaking changes must be documented in milestone notes and, once implementation starts, reflected in ingestion validation code.
