# www.myrobertson.com Integration Guide

## Purpose

This guide describes how to integrate Ask Rich into www.myrobertson.com with a recruiter-friendly experience and a safe rollout path.

## Integration goals

- Add an obvious Ask Rich entry point on the site.
- Keep recruiter interactions fast and citation-backed.
- Preserve existing site branding and navigation patterns.
- Roll out with low risk and easy rollback.

## Recommended integration architecture

- Frontend host: www.myrobertson.com
- Chat UI: embedded panel or dedicated route (for example `/ask-rich`)
- API target: Cloudflare Worker endpoint (`/api/chat`)
- Data flow: question -> API -> retrieved evidence -> answer + citations

## Placement options

### Option A: Dedicated page

- Add a first-class route (`/ask-rich`).
- Best for rich chat interactions and recruiter workflows.
- Easiest to track quality and iterate UI.

### Option B: Embedded widget

- Add a compact launcher in global site shell.
- Opens side panel or modal chat experience.
- Best for broad discoverability across pages.

Recommendation: start with Option A, then add a widget once content and quality are stable.

Implemented integration artifact:
- Embeddable widget script: `apps/web/embed/askrich-widget.js`

## UI and content requirements

- Include recruiter-focused prompt starters.
- Render citations per assistant response.
- Show explicit fallback when evidence is insufficient.
- Keep response blocks scannable (summary + bullets).
- Provide clear loading and error states.

## API integration contract

- Endpoint: `POST /api/chat`
- Required request field: `question`
- Optional request controls: `top_k`, `tone`, `filters`
- Expected response: answer text plus citation list

Before production, validate compatibility against:
- local web scaffold behavior in `apps/web/`
- current API request/response shape in `apps/api/`

## Environment and domain mapping

Suggested mapping:

- `dev`: local or preview environment
- `staging`: non-public pre-production domain
- `prod`: `www.myrobertson.com`

For production routing, ensure:
- DNS and route rules forward chat API requests correctly
- CORS allows only trusted origins
- CSP rules allow required API endpoints

## Rollout plan

1. Build and validate integration in `dev`.
2. Release to `staging` for recruiter scenario testing.
3. Run eval bank and manual rubric scoring.
4. Release to production behind a controlled entry point.
5. Monitor logs and recruiter feedback, then expand visibility.

## Observability and QA checklist

- Interaction telemetry: request count, error count, latency
- Citation integrity checks on representative questions
- Recruiter prompt-starter click-through behavior
- Regression checks after corpus updates and prompt changes

## Accessibility and UX baseline

- Keyboard navigation for full chat flow
- Focus management in modal/panel experiences
- Sufficient color contrast and readable type sizing
- Mobile-friendly interaction layout

## Security checklist

- Do not expose provider secrets in client-side code.
- Route all model and retrieval calls through server-side API.
- Apply rate limits and abuse protections at edge routes.

## Related docs

- [Milestone 03](../milestones/milestone-03.md)
- [Milestone 04](../milestones/milestone-04.md)
- [Milestone 05](../milestones/milestone-05.md)
- [Cloudflare configuration runbook](cloudflare-config-and-deploy.md)
- [Web app notes](../../apps/web/README.md)
