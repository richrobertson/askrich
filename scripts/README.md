# scripts

Automation helpers for ingestion, testing, and deployment.

## Milestone 1: Current Scripts

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

## Future Script Categories (Milestone 2+)

- **Evaluation helpers**
  - run question bank
  - record rubric scores and regression comparisons

- **Deployment helpers**
  - pre-deploy checks
  - post-deploy smoke validation
