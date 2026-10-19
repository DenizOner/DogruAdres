# Architecture decision records

This directory stores the major project decisions that affect architecture, ownership, provider boundaries, or upgrade safety.

## What an ADR is

An ADR is a short, reviewable record of:

- the context
- the decision taken
- the alternatives considered
- the consequences and trade-offs
- the Mercur upgrade impact

## When an ADR is required

Create an ADR when a decision affects:

- architecture boundaries
- dependency strategy
- Mercur integration policy
- product/domain ownership
- security/privacy boundaries
- payment behavior
- schema or data ownership
- long-lived upgrade or migration choices

## When an ADR is unnecessary

Do not create ADRs for small local implementations, formatting changes, or routine refactors that do not change architecture or ownership.

## Status lifecycle

Use one of the following statuses:

- Proposed
- Accepted
- Superseded
- Deprecated

## ADR index

- `ADR-0001-mercur-as-marketplace-engine.md`
- `ADR-0002-automotive-domain-isolation.md`
- `ADR-0003-mercur-core-modification-policy.md`

## Consolidation and provenance

- [ADR-0007: coherent authorization and runtime evidence](ADR-0007-coherent-authorization-and-runtime-evidence.md) — accepted R0 policy, with authentic Git provenance for ADR-0005/0006 absent from this branch. Historical ADR-0004 co-location is not the selected architecture. No historical ADR file has been fabricated or renumbered.
