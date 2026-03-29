---
id: project-oracle-cns-migration
title: Oracle CNS Migration to OCI
type: project
summary: Migration initiative to move CNS workloads to OCI with Kubernetes, Istio routing, and safety-focused migration controls.
role: Senior Software Engineer
technologies: [Kubernetes, Istio, Prometheus, Oracle GoldenGate, OCI]
tags: [migration, cloud, distributed-systems, reliability]
updated: 2026-03-28
---

## Recruiter Summary

Supported a high-stakes migration of CNS services to OCI, helping design and execute a rollout path that prioritized service continuity, observability, and migration safety.

## Problem

Existing service footprint needed modernization and cloud alignment while minimizing risk to production traffic and downstream consumers.

## Scope

- Kubernetes-based deployment patterns
- Istio L7 routing for controlled traffic behavior
- Metrics and observability to monitor migration health
- Data migration safety considerations tied to GoldenGate workflows

## My Role

As a senior engineer, I helped implement and operationalize migration patterns, including traffic control and monitoring practices used to reduce rollout risk.

## Key Design Decisions

- Used progressive traffic routing strategies to limit blast radius.
- Treated observability as a release gate, not an afterthought.
- Combined service-level telemetry with migration-state awareness.

## Technologies

Kubernetes, Istio service mesh, Prometheus metrics stack, OCI platform components, and GoldenGate-informed migration safeguards.

## Outcomes

- Improved confidence in phased migration execution.
- Reduced risk exposure during cutovers through controlled routing and monitoring.
- Established reusable migration patterns for future services.

## Leadership Signals

- Drove practical reliability tradeoffs in a migration setting.
- Collaborated across platform, service, and operations stakeholders.
- Focused team execution on measurable safety criteria.

## My Story
I led the full migration of Oracle’s Customer Notification Service from a legacy WebLogic VM-based deployment to an OCI-native architecture. This service was critical to Oracle Fusion Applications and was required to close a $2M enterprise deal. When I was assigned the project, the only directive was “move CNS to OCI” — there was no defined plan.
The existing system was tightly coupled to WebLogic and deployed manually on VMs, which made it difficult to scale, observe, or automate. I owned defining the migration strategy end-to-end — architecture, database transition, traffic cutover, and cross-team coordination.
Architecturally, I designed a Kubernetes-based deployment running WebLogic in containers, introduced Istio for L7 routing and observability, and migrated the database from Exadata to Autonomous DB. To ensure zero data loss during cutover, I led the setup of bidirectional replication using Oracle GoldenGate and identified which tables could safely replicate versus partition.
One of the biggest risks was customer traffic migration. Many dependent services were calling CNS over internal IPs and plain HTTP. I designed a cohort-based migration strategy using Istio routing and controlled 307→308 redirects, allowing incremental traffic migration with immediate rollback capability.
I also implemented custom Prometheus metrics and dashboards to monitor endpoint-level SLAs, latency, and failure rates before, during, and after cutover. This gave leadership real-time visibility into risk.
The result was a successful production cutover after ~1 year, with zero data loss and no major service disruptions. The same architecture was later used to migrate 16 additional legacy datacenters. We achieved FedRAMP certification and fully transitioned CNS to OCI-native infrastructure — without forking the codebase.
