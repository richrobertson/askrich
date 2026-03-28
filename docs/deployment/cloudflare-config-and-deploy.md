# Cloudflare Configuration and Deployment Runbook

## Purpose

This runbook describes a practical path to configure and deploy Ask Rich on Cloudflare across dev, staging, and production environments.

## Deployment targets

- Web app: Cloudflare Workers (Next.js runtime target)
- API: Cloudflare Worker route for `/api/chat`
- Vector storage: Cloudflare Vectorize
- Relational metadata: Cloudflare D1
- Optional artifacts: Cloudflare R2

## Prerequisites

- Cloudflare account with Workers enabled
- Domain access in Cloudflare DNS
- Local tooling installed:
  - Node.js LTS
  - `wrangler` CLI
- Environment secrets available for model and embedding providers

## Environment model

Use isolated resources per environment:

- `dev`
- `staging`
- `prod`

For each environment, provision separate:
- Worker deployment target
- Vectorize index
- D1 database
- Secret set

Suggested default naming convention:

- Worker names: `askrich-dev-api`, `askrich-staging-api`, `askrich-prod-api`
- Vectorize indexes: `askrich-dev-index`, `askrich-staging-index`, `askrich-prod-index`
- D1 databases: `askrich-dev-db`, `askrich-staging-db`, `askrich-prod-db`

## Initial Cloudflare setup

1. Authenticate CLI:

```bash
npx wrangler login
```

2. Confirm account context:

```bash
npx wrangler whoami
```

3. Create environment-scoped resources (example names):

- `askrich-dev-index`, `askrich-staging-index`, `askrich-prod-index`
- `askrich-dev-db`, `askrich-staging-db`, `askrich-prod-db`

4. Store runtime secrets per environment:

```bash
npx wrangler secret put LLM_API_KEY --env dev
npx wrangler secret put EMBEDDING_API_KEY --env dev
```

Repeat for `staging` and `prod`.

### Environment command snippets

Use these as launch-day templates (update names if you choose a different convention).

Dev:

```bash
npx wrangler secret put LLM_API_KEY --env dev
npx wrangler secret put EMBEDDING_API_KEY --env dev
npx wrangler deploy --env dev
```

Staging:

```bash
npx wrangler secret put LLM_API_KEY --env staging
npx wrangler secret put EMBEDDING_API_KEY --env staging
npx wrangler deploy --env staging
```

Prod:

```bash
npx wrangler secret put LLM_API_KEY --env prod
npx wrangler secret put EMBEDDING_API_KEY --env prod
npx wrangler deploy --env prod
```

## Configuration guidance

Keep deployment config explicit and environment-scoped.

Implemented config artifacts:
- API Worker config: `apps/api/worker/wrangler.toml`
- API Worker entrypoint: `apps/api/worker/src/index.js`
- Web asset config: `apps/web/wrangler.toml`
- CI deploy workflow: `.github/workflows/deploy-cloudflare.yml`

Typical settings to map per environment:
- API base URL
- provider identifiers (`LLM_PROVIDER`, `EMBEDDING_PROVIDER`)
- model names (`LLM_MODEL`, `EMBEDDING_MODEL`)
- retrieval defaults (`CHAT_TOP_K`, `CHAT_MAX_EVIDENCE_CHARS`)
- Vectorize and D1 binding names

## Build and deploy workflow

1. Run local checks before deployment:

```bash
python scripts/smoke_test.py
python scripts/chat_smoke_test.py
python scripts/run_eval_bank.py --api-base http://127.0.0.1:8000
```

2. Deploy to `dev` first.
3. Run post-deploy smoke checks against deployed URL.
4. Promote to `staging` and rerun checks.
5. Promote to `prod` only after eval sanity and manual review pass.

Manual CI trigger option:

- Run GitHub Actions workflow `Deploy Cloudflare` and choose `dev`, `staging`, or `prod`.

## Post-deploy verification checklist

- `/health` endpoint responds successfully.
- `/api/chat` returns grounded response and citations.
- Citation links and source labels are valid.
- Expected latency is within acceptable portfolio thresholds.
- No missing secret or binding errors in Worker logs.

## Rollback strategy

- Keep last known good Worker deployment available.
- Roll back by redeploying previous release artifact.
- Re-run smoke checks immediately after rollback.

## Security baseline

- Use `wrangler secret` for sensitive values.
- Never commit plaintext credentials.
- Use least-privilege API keys.
- Rotate keys on schedule and after any suspected exposure.

## Operational cadence

- Run question-bank evals before each production promotion.
- Track drift in quality across milestone changes.
- Keep deployment notes in pull requests for traceability.

## Related docs

- [Cloudflare deployment plan](cloudflare.md)
- [Cloudflare cost notes](costs.md)
- [Milestone 05](../milestones/milestone-05.md)

## Account-specific go-live checklist

Fill this section with your real Cloudflare account values before production cutover.

### Environment values

- Account ID: `<fill-me>`
- Zone ID: `<fill-me>`
- Primary domain: `www.myrobertson.com`
- API domain or route: `<fill-me>`

### Resource names by environment

| Environment | Worker name | Vectorize index | D1 database | API base URL |
| --- | --- | --- | --- | --- |
| dev | `askrich-dev-api` | `askrich-dev-index` | `askrich-dev-db` | `<fill-me>` |
| staging | `askrich-staging-api` | `askrich-staging-index` | `askrich-staging-db` | `<fill-me>` |
| prod | `askrich-prod-api` | `askrich-prod-index` | `askrich-prod-db` | `<fill-me>` |

### Production secrets checklist

- [ ] `LLM_API_KEY` configured in `prod`
- [ ] `EMBEDDING_API_KEY` configured in `prod`
- [ ] `LLM_PROVIDER` and `LLM_MODEL` validated in `prod`
- [ ] `EMBEDDING_PROVIDER` and `EMBEDDING_MODEL` validated in `prod`
- [ ] Retrieval defaults (`CHAT_TOP_K`, `CHAT_MAX_EVIDENCE_CHARS`) set for `prod`

### Routing and security checklist

- [ ] DNS records for production hostname are correct
- [ ] Worker route bindings point to production Worker
- [ ] CORS restricted to trusted site origins
- [ ] CSP updated for API origin usage
- [ ] Rate limiting and abuse controls enabled

### Launch gate checklist

- [ ] Latest commit deployed to `staging` and smoke checks passed
- [ ] Eval bank run completed against `staging`
- [ ] Manual recruiter-flow QA completed (prompt starters, citations, fallback behavior)
- [ ] Production deployment completed
- [ ] Post-deploy smoke checks passed on `prod`
- [ ] Rollback command and previous deployment reference recorded

### Post-launch checks (first 24h)

- [ ] Monitor Worker error logs and latency
- [ ] Confirm citation rendering and source links on live traffic samples
- [ ] Track response quality notes from recruiter-style test prompts
- [ ] Record any incidents and follow-up fixes in deployment notes
