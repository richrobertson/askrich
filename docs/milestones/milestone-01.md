# Milestone 01: Corpus, Schemas, and Ingestion Scaffold

## Goals

- Establish high-quality recruiter-facing corpus content.
- Define consistent document schemas/frontmatter.
- Design ingestion workflow and script skeletons.
- Provide measurable acceptance criteria before runtime API build.

## Deliverables

- Initial corpus in:
  - `content/profile/`
  - `content/projects/`
  - `content/skills/`
  - `content/faq/`
- Content guide with section standards.
- Ingestion plan and placeholder script structure.
- Documentation for architecture, deployment intent, and milestones.

## Exact folders/files intended

- `content/**` documents with YAML frontmatter
- `docs/content-guide.md`
- `docs/schemas-content.md`
- `docs/ingestion-scaffold-plan.md`
- `scripts/README.md`
- `data/chroma/.gitkeep`

## Corpus plan

- Author concise, evidence-rich project briefs.
- Normalize terminology and technology names.
- Prefer concrete outcomes and constraints.
- Include leadership/ownership indicators where relevant.

## Schema plan

Each content doc should include frontmatter fields such as:
- `id`
- `title`
- `type`
- `summary`
- `tags`
- `updated`

Project docs may add:
- `role`, `domain`, `technologies`, `outcomes`.

## Ingestion plan

Planned scaffold responsibilities:
1. Parse markdown + frontmatter.
2. Validate required fields by `type`.
3. Chunk content with stable IDs.
4. Generate embeddings through provider-agnostic adapter.
5. Upsert vectors and metadata.
6. Emit ingestion report for QA.

## Test plan

- Frontmatter schema validation tests.
- Chunking determinism tests.
- Ingestion smoke test over sample corpus.
- Failure-path tests for malformed documents.

## Acceptance criteria

- All baseline content files exist with valid frontmatter.
- Content follows `docs/content-guide.md` quality standards.
- Ingestion design and script plan are documented and actionable.
- Milestone 2 can begin without restructuring repository foundations.
