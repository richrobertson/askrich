# askrich

**Ask Rich** is a recruiter-facing, retrieval-first chatbot for Rich Robertson’s personal website.

## Why this project exists

Recruiters and hiring managers often need fast, specific answers about a candidate’s impact, technical depth, and role fit. Resume bullets alone are too compressed, while freeform chatbots can drift away from factual evidence.

Ask Rich is designed to answer with grounded, source-backed responses drawn from curated materials (bio, resume, project briefs, and skills content).

## Core use case

A recruiter asks practical questions such as:
- “What migration work has Rich led?”
- “How strong is he in Kubernetes and platform engineering?”
- “What outcomes came from the Oracle modernization effort?”

The system retrieves relevant documents, assembles context, and returns concise answers with citations.

## Who it is for

- Recruiters screening candidates quickly
- Hiring managers assessing technical fit
- Rich himself, to present consistent evidence-backed narratives

## Current status

Milestone status as of 2026-03-28:
- ✅ Milestone 1 completed (corpus + schemas + ingestion scaffold)
- ✅ Milestone 2 completed (MVP retrieval + `/api/chat` + citations)
- ✅ Milestone 3 completed (web chat integration + embeddable widget)
- ✅ Milestone 4 completed (eval harness + quality loop)
- ✅ Milestone 5 completed (Cloudflare deployment + production hardening docs and runbooks)

## Implementation status

Core deliverables now in place:
- ✅ Curated content corpus with consistent frontmatter ([content/](content/))
- ✅ Document and chunk schemas ([docs/schemas-content.md](docs/schemas-content.md))
- ✅ Ingestion scaffold ([apps/api/](apps/api/), [scripts/ingest_all.py](scripts/ingest_all.py), [scripts/smoke_test.py](scripts/smoke_test.py))
- ✅ Retrieval runtime with `/api/chat` and citation-aware responses
- ✅ API and eval smoke helpers ([scripts/chat_smoke_test.py](scripts/chat_smoke_test.py), [scripts/run_eval_bank.py](scripts/run_eval_bank.py))
- ✅ Architecture and deployment documentation
- ✅ Cloudflare deployment and integration runbooks
- ✅ Cloudflare deployable artifacts ([apps/api/worker/](apps/api/worker/), [apps/web/wrangler.toml](apps/web/wrangler.toml), [.github/workflows/deploy-cloudflare.yml](.github/workflows/deploy-cloudflare.yml))
- ✅ Website integration widget ([apps/web/embed/askrich-widget.js](apps/web/embed/askrich-widget.js))
- ✅ Canned response quality testing suite (Python + JavaScript test implementations)

## Quality Assurance

### Answer Quality Testing

The worker contains hardcoded response paths for specific question types (Oracle outcomes, profile queries, education, technology, sensitive contact, behavioral). These are extensively tested to ensure:
- **Focused answers** - Questions about outcomes get outcome-specific answers (not profile links)
- **No noisy mixing** - Profile queries don't include project details
- **PII safety** - Sensitive contact requests refuse private information appropriately
- **Conciseness** - All answers stay under reasonable length limits

**Test suites:**
- [scripts/test_canned_responses.py](scripts/test_canned_responses.py) - Specification validator (11 test cases, 7 categories)
- [scripts/test_canned_responses_integration.py](scripts/test_canned_responses_integration.py) - Live worker response validation
- [apps/api/worker/src/index.test.js](apps/api/worker/src/index.test.js) - JavaScript unit tests (40+ assertions, requires Node.js)

**Documentation:**
- [docs/testing/CANNED_RESPONSES.md](docs/testing/CANNED_RESPONSES.md) - Complete testing guide with examples and how to extend

**Run tests:**
```bash
python3 scripts/test_canned_responses.py          # Validate test spec
python3 scripts/test_canned_responses_integration.py --url http://localhost:8787  # Test live worker
```

See [docs/testing/CANNED_RESPONSES.md](docs/testing/CANNED_RESPONSES.md) for detailed testing approach and test coverage matrix.

## High-level architecture summary

Ask Rich is a **RAG application**, not a generic freeform chatbot:
1. Curated source content is authored in Markdown.
2. Ingestion prepares chunks and metadata.
3. Embeddings are generated via a provider-agnostic adapter.
4. Chunks are indexed in a vector store.
5. Runtime chat retrieves evidence and composes an answer prompt.
6. The LLM returns a recruiter-friendly answer with citations.

## Tech stack

- **Frontend:** Static web app ([apps/web](apps/web)) deployed as Cloudflare Worker assets
- **Backend API:** Cloudflare Worker API (`/api/chat` target)
- **Workers edge runtime constraints:** Prefer Edge-compatible APIs; avoid Node-only runtime assumptions
- **RAG framework:** LangChain first
- **Orchestration (later):** LangGraph when/if workflow complexity justifies it
- **Vector store:** Cloudflare Vectorize (production target), Chroma (local dev)
- **State/evals/app data:** Cloudflare D1
- **Artifact storage (optional later):** Cloudflare R2

## Cloudflare hosting plan

- Web app and API both hosted on Cloudflare Workers
- Cloudflare-native data services for low operational overhead
- Environment separation: dev, staging, prod

Current deploy artifacts:
- Web assets config: [apps/web/wrangler.toml](apps/web/wrangler.toml)
- API Worker config: [apps/api/worker/wrangler.toml](apps/api/worker/wrangler.toml)
- CI workflow: [.github/workflows/deploy-cloudflare.yml](.github/workflows/deploy-cloudflare.yml)

See [docs/deployment/cloudflare.md](docs/deployment/cloudflare.md) for details.

Additional deployment docs:
- [docs/deployment/cloudflare-config-and-deploy.md](docs/deployment/cloudflare-config-and-deploy.md)
- [docs/deployment/myrobertson-website-integration.md](docs/deployment/myrobertson-website-integration.md)
- [docs/deployment/costs.md](docs/deployment/costs.md)

## Repository structure

```text
apps/
  api/               # Local FastAPI runtime scaffold (retrieval + chat + ingestion)
  web/               # Recruiter chat UI + embeddable website widget + worker assets config
content/             # Curated recruiter-facing corpus
docs/                # Architecture, ADRs, milestones, deployment, prompts, evals
scripts/             # Ingestion, smoke, and eval helper scripts
data/
  chroma/            # Local vector persistence (dev only)
```

## Milestone overview

- **M1:** Corpus + schema + ingestion scaffold + docs
- **M2:** Retrieval layer + `/api/chat` + prompt assembly + citations
- **M3:** Website integration and recruiter UX
- **M4:** Evaluation harness and quality polish
- **M5:** Cloudflare deployment and production hardening

See [docs/milestones/overview.md](docs/milestones/overview.md).

Milestone detail pages:
- [docs/milestones/milestone-01.md](docs/milestones/milestone-01.md)
- [docs/milestones/milestone-02.md](docs/milestones/milestone-02.md)
- [docs/milestones/milestone-03.md](docs/milestones/milestone-03.md)
- [docs/milestones/milestone-04.md](docs/milestones/milestone-04.md)
- [docs/milestones/milestone-05.md](docs/milestones/milestone-05.md)

Milestone-1 planning details are expanded in:
- [docs/milestones/milestone-01.md](docs/milestones/milestone-01.md)
- [docs/schemas-content.md](docs/schemas-content.md)
- [docs/ingestion-scaffold-plan.md](docs/ingestion-scaffold-plan.md)

## Local development intention

Local development should remain lightweight:
- Chroma for local vector persistence
- Provider-agnostic model/embedding adapter contracts
- No vendor lock-in in core product logic

## Why retrieval-first instead of a freeform chatbot

Recruiter-facing credibility depends on traceable evidence. Retrieval-first design:
- keeps answers grounded in authored source content,
- improves consistency across model providers,
- makes citation quality measurable.

## Why this project intentionally avoids an OpenAI dependency

Ask Rich is explicitly designed to demonstrate practical open-source LLM integration capability. The architecture uses swappable provider adapters so inference and embeddings can run on open-source model infrastructure without changing product logic.

## Future roadmap

- Expand corpus breadth and depth (project briefs, blog summaries, role narratives)
- Production-grade ingestion and chunking pipeline
- API + UI integration with recruiter-focused interaction design
- Evaluation dashboards and regression checks
- Optional LangGraph-based orchestration for multi-step flows

## License

MIT. See [LICENSE](LICENSE).

## Security and Quality Automation

This repository includes automated static analysis and dependency checks for pull requests and main-branch pushes:

- CodeQL analysis for Python and JavaScript
- Dependency review for pull requests
- Secret scanning with Gitleaks
- Python lint/security checks (Ruff + Bandit)
- Dependabot updates for pip and GitHub Actions

Workflow files are in [.github/workflows/](.github/workflows/) and dependency update policy is in [.github/dependabot.yml](.github/dependabot.yml).

## Crosslinks

- [API README](apps/api/README.md)
- [Web README](apps/web/README.md)
- [Scripts README](scripts/README.md)
- [Architecture docs](docs/architecture.md)
- [Deployment docs](docs/deployment/cloudflare.md)
