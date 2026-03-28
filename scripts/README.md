# scripts

Automation helpers for ingestion, testing, and deployment.

## Implemented Scripts

### `ingest_all.py`

Run the full ingestion pipeline: load → split → embed → index.

```bash
python scripts/ingest_all.py
```

Produces a summary of documents loaded and chunks created, and persists the vector store to `data/chroma/`.

### `smoke_test.py`

Quick validation of document loading, chunking, and vector store setup.

```bash
python scripts/smoke_test.py
```

Tests:
1. Load documents from `content/`
2. Validate document metadata
3. Split into chunks
4. Print sample chunk metadata and content
5. Initialize vector store

Useful for:
- Pre-ingestion validation
- Debugging document structure
- Confirming content is parsed correctly

### `chat_smoke_test.py`

Quick Milestone 2 runtime check for retrieval-backed chat output.

```bash
python scripts/chat_smoke_test.py
```

Tests:
1. Run ingestion
2. Ask representative recruiter questions
3. Print answer previews and citation mappings

Useful for:
- Verifying retrieval behavior of the chat service used by `/api/chat` (service wiring, not HTTP schema)
- Checking citation formatting
- Sanity-checking prompt/answer structure and runtime pipeline without external model dependencies

## Milestone 4: Evaluation Helpers

### `run_eval_bank.py`

Run the recruiter question bank against `POST /api/chat` and emit review artifacts.

```bash
python scripts/run_eval_bank.py
```

Optional flags:

```bash
python scripts/run_eval_bank.py \
  --api-base http://127.0.0.1:8000 \
  --question-bank docs/evals/question_bank.json \
  --output-dir data/evals \
  --top-k 5
```

Outputs:

- `data/evals/eval_run_<timestamp>.json` with full responses and citations
- `data/evals/eval_rubric_<timestamp>.csv` with blank rubric columns for scoring

The question bank is stored at `docs/evals/question_bank.json` and is designed to be portable across model providers.

## Future Script Categories

- **Deployment helpers**
  - pre-deploy checks
  - post-deploy smoke validation

## Repository Security Rollout

### `rollout_security_baseline.sh`

Roll out this repository's GitHub security workflow baseline to other repositories.

Default behavior is dry-run. Add `--execute` to apply changes.

```bash
scripts/rollout_security_baseline.sh --owner richrobertson --repos askrich
scripts/rollout_security_baseline.sh --owner richrobertson --repos askrich --execute
```

Apply to all public repos for an owner:

```bash
scripts/rollout_security_baseline.sh --owner richrobertson --all-public --execute
```

This copies:
- `.github/workflows/codeql.yml`
- `.github/workflows/dependency-review.yml`
- `.github/workflows/secret-scan.yml`
- `.github/workflows/static-analysis.yml`
- `.github/dependabot.yml`

Then commits, pushes a branch, and opens a PR per repository.
