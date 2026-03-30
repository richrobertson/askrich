# scripts

Automation helpers for ingestion, testing, and deployment.

**Breadcrumbs:** [Repository Home](../README.md) > [scripts](README.md)

## Implemented Scripts

### [ingest_all.py](ingest_all.py)

Run the full ingestion pipeline: load → split → embed → index.

```bash
python scripts/ingest_all.py
```

Produces a summary of documents loaded and chunks created, and persists the vector store to [data/chroma/](../data/chroma/).

### [smoke_test.py](smoke_test.py)

Quick validation of document loading, chunking, and vector store setup.

```bash
python scripts/smoke_test.py
```

Tests:
1. Load documents from [content/](../content/)
2. Validate document metadata
3. Split into chunks
4. Print sample chunk metadata and content
5. Initialize vector store

Useful for:
- Pre-ingestion validation
- Debugging document structure
- Confirming content is parsed correctly

### [chat_smoke_test.py](chat_smoke_test.py)

Quick runtime check for retrieval-backed chat output.

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

## Evaluation Helpers

### [run_eval_bank.py](run_eval_bank.py)

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

The question bank is stored at [docs/evals/question_bank.json](../docs/evals/question_bank.json) and is designed to be portable across model providers.

### [run_conversation_eval.py](run_conversation_eval.py)

Run a multi-turn recruiter and hiring-manager conversation QA suite against `POST /api/chat`.

```bash
python scripts/run_conversation_eval.py
```

Optional flags:

```bash
python scripts/run_conversation_eval.py \
  --api-base http://127.0.0.1:8000 \
  --conversation-bank docs/evals/recruiter_hiring_manager_conversation_bank_public.json \
  --output-dir data/evals \
  --top-k 5
```

Outputs:

- `data/evals/conversation_eval_run_<timestamp>.json` full per-turn results
- `data/evals/conversation_eval_turns_<timestamp>.csv` turn-level review sheet
- `data/evals/conversation_eval_signal_strength_<timestamp>.csv` cross-reference of signal strengths by desired signal

Conversation bank:

- [docs/evals/recruiter_hiring_manager_conversation_bank_public.json](../docs/evals/recruiter_hiring_manager_conversation_bank_public.json)
- Includes sourced, paraphrased public recruiter/interview conversation themes with per-turn checks and source URLs.

## Future Script Categories

- **Deployment helpers**
  - pre-deploy checks
  - post-deploy smoke validation

## Performance and Scaling

### [load_test_chat.sh](load_test_chat.sh)

Run a lightweight concurrent load test against `POST /api/chat` and print latency/error summary metrics.

```bash
bash scripts/load_test_chat.sh \
  --url http://127.0.0.1:8787/api/chat \
  --requests 200 \
  --concurrency 20 \
  --top-k 5
```

Outputs:

- total requests, 2xx count, non-2xx count
- average latency
- p50/p95/p99 latency estimates

## Repository Security Rollout

### [rollout_security_baseline.sh](rollout_security_baseline.sh)

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
- [.github/workflows/codeql.yml](../.github/workflows/codeql.yml)
- [.github/workflows/dependency-review.yml](../.github/workflows/dependency-review.yml)
- [.github/workflows/secret-scan.yml](../.github/workflows/secret-scan.yml)
- [.github/workflows/static-analysis.yml](../.github/workflows/static-analysis.yml)
- [.github/dependabot.yml](../.github/dependabot.yml)

Then commits, pushes a branch, and opens a PR per repository.

## Crosslinks

- [Repository README](../README.md)
- [API README](../apps/api/README.md)
- [Worker README](../apps/api/worker/README.md)
- [Web README](../apps/web/README.md)
- [Analytics README](../docs/analytics/README.md)
- [Testing docs](../docs/testing/CANNED_RESPONSES.md)
