# Cost Estimate Notes

## Cost posture

Ask Rich is designed to keep fixed platform overhead modest in early stages.
For Cloudflare platform services alone, the likely baseline expectation is low.

## Early estimate (non-binding)

In low-traffic early usage, a practical estimate is **low single-digit USD per week** for core platform services.

This is an estimate, not a guarantee.

## What drives cost most

Costs are influenced more by:
- request volume,
- retrieval/query frequency,
- model inference runtime,
than by static web hosting itself.

## Model runtime scenarios

### Managed inference for open-source models

If open-source models are accessed through a managed inference provider,
Cloudflare platform costs can remain relatively low while model usage scales separately.

### Self-hosted model runtime

If inference is self-hosted on dedicated GPU infrastructure, GPU hosting becomes the dominant cost driver, typically outweighing Cloudflare platform charges.

## Practical guidance

- Start with modest traffic assumptions.
- Track usage metrics before optimizing prematurely.
- Revisit cost model after Milestone 2 and again before production launch.
