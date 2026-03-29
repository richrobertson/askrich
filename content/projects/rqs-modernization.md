---
id: project-rqs-modernization
title: Oracle RQS Modernization
type: project
summary: Modernization initiative spanning runtime upgrades, architecture simplification, and security/compliance improvements.
role: Senior Software Engineer
technologies: [Java, ARM, dependency-management, cloud-infrastructure]
tags: [modernization, performance, compliance, platform]
updated: 2026-03-28
---

## Recruiter Summary

Contributed to a broad modernization effort that upgraded runtime foundations, simplified dependencies, and improved security/compliance posture while reducing long-term maintenance complexity.

## Problem

The system carried technical debt across runtime versions, architecture choices, and external provider dependencies, making change management slower and riskier.

## Scope

- Java 8 to Java 17 modernization
- AMD to ARM platform transition work
- Dependency cleanup and consolidation
- Provider consolidation and security/compliance hardening

## My Role

Helped execute and validate modernization changes with attention to compatibility, performance characteristics, and operational risk.

## Key Design Decisions

- Prioritized incremental modernization over risky all-at-once rewrites.
- Reduced dependency surface area to lower vulnerability and maintenance burden.
- Coordinated platform transitions with validation checkpoints.

## Technologies

Java upgrade path (8→17), platform architecture updates (including ARM targets), dependency management tooling, and security/compliance controls.

## Outcomes

- Modernized runtime baseline enabling future development velocity.
- Lowered operational and security risk through cleanup and standardization.
- Improved platform efficiency and maintainability.

## Leadership Signals

- Balanced modernization ambition with production stability.
- Helped sequence changes to avoid avoidable regressions.
- Communicated implementation tradeoffs across teams.

## My Story
I was brought in to help Resource Query Service migrate 15 libraries and services from Java 8 to Java 17, and then transition from AMD to ARM compute under tight deadlines. As I worked through compatibility issues, I identified deeper systemic problems — inconsistent dependency versioning, ad hoc dependency injection patterns, and duplicated client providers, especially around mTLS certificate handling.
Rather than apply isolated fixes just to get the migration over the line, I took the initiative to standardize the dependency model using OCI BOM governance and consolidate client instantiation into unit-tested Guice providers within a shared library. This allowed us to centralize certificate and CA bundle auto-reloading logic and eliminate duplicated infrastructure code.
The result was not only a successful Java 17 and ARM migration, but a significantly more maintainable and secure codebase. We reduced security compliance issues by about 60% and made future upgrades materially easier.
