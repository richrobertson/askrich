# Milestone 05: Cloudflare Deployment and Production Hardening

**Status: Completed**

## Goals

- Deploy Ask Rich to Cloudflare with clear environment separation.
- Harden runtime reliability, security posture, and operational readiness.
- Define a maintainable deployment and incident response baseline.

## Scope

### Deployment architecture

- Deploy recruiter-facing web app and chat API on Cloudflare Workers.
- Use Cloudflare-native data services for production workflows.
- Keep production architecture aligned with retrieval-first design.

### Environment and release flow

- Establish dev, staging, and prod environments.
- Separate credentials and data stores per environment.
- Define promotion gates and smoke checks for each release stage.

### Security and reliability hardening

- Apply least-privilege secrets and key rotation practices.
- Add request validation, safe error handling, and abuse controls.
- Define backup/recovery expectations for critical data paths.

### Operations and runbooks

- Document deployment steps and rollback procedures.
- Define incident handling basics and ownership expectations.
- Add post-deploy verification checklist for core recruiter flows.

## Non-goals

- Multi-region custom infrastructure beyond Cloudflare-native capabilities.
- Enterprise SOC program implementation.
- Complex multi-tenant product operations.

## Exit criteria

- Dev, staging, and prod deployment flow is operational.
- Production chat flow is stable under expected portfolio traffic.
- Core runbooks exist for deploy, rollback, and incident response.
- Baseline security and reliability checks are documented and repeatable.

## Implementation summary

1. Defined Cloudflare deployment target architecture and environment model.
2. Added Worker deployment configs in `apps/api/worker/wrangler.toml` and `apps/web/wrangler.toml`.
3. Added API Worker entrypoint in `apps/api/worker/src/index.js` with `/health`, `/api/chat`, and origin controls.
4. Added Cloudflare deploy automation workflow in `.github/workflows/deploy-cloudflare.yml`.
5. Added Cloudflare runbook and account-specific go-live checklist for launch gating and post-launch checks.
6. Added www.myrobertson.com integration guide aligned to recruiter UX and rollout controls.

## Navigation

- Overview: [Milestone Overview](overview.md)
- Previous: [Milestone 04](milestone-04.md)
- Next: [Milestone 06](milestone-06.md)
