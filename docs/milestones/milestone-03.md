# Milestone 03: Website Integration

**Status: Completed**

## Goals

Integrate Ask Rich into the personal website with a recruiter-friendly chat experience.

## Scope

### Website chat UI

- Add chat entry point, conversation panel, and response rendering.
- Maintain fast, simple interactions suitable for recruiter workflows.

### Suggested prompts

- Provide targeted starter questions (impact, migration experience, role fit, stack depth).
- Keep prompts practical and hiring-relevant.

### Citation rendering

- Display source references inline or expandable.
- Make it easy to inspect evidence provenance.

### Recruiter-friendly UX

- Keep answers scannable.
- Avoid verbose generic text.
- Highlight outcomes, ownership, and technical decision quality.

## Non-goals

- Full analytics platform build-out.
- Advanced agentic orchestration.
- Multi-tenant productization.

## Exit criteria

- Website chat flow works end-to-end against API.
- Suggested prompts improve first-use experience.
- Citation rendering is clear enough for recruiter trust.

## Initial implementation progress

- ✅ Recruiter-focused static web chat shell added in `apps/web/`.
- ✅ Prompt starters and API base configuration UI added.
- ✅ Citation rendering implemented for assistant responses.
- ✅ Client-side interaction telemetry scaffold added.
- ✅ Embeddable website widget added in `apps/web/embed/askrich-widget.js`.
- ✅ Web deployment config added in `apps/web/wrangler.toml`.

## Navigation

- Overview: [Milestone Overview](overview.md)
- Previous: [Milestone 02](milestone-02.md)
- Next: [Milestone 04](milestone-04.md)
