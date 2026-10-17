# ADR-0002: automotive domain isolation

- Status: Accepted
- Date: 2026-10-07

## Context

DoğruAdres requires a product/domain model built around automotive concepts such as make, model, generation, engine, fitment, OE/OEM references, equivalence mapping, taxonomy, and enrichment. These concepts are not generic marketplace primitives.

## Decision

Automotive-domain concepts are DoğruAdres-owned and must remain logically isolated from Mercur marketplace primitives.

This does not mean autonomous code or a custom platform. It means the domain logic is project-owned, explicit, and shaped around supported extension points rather than embedded into arbitrary Mercur internals.

## Alternatives considered

- stuffing automotive state into generic metadata or untyped fields across the system
- modifying Mercur core for automotive semantics
- merging automotive logic into platform-owned data structures without separation

## Consequences

The project gains clearer ownership boundaries and reduces the risk of framework lock-in. The domain layer remains understandable and more upgrade-safe.

The trade-off is that the project must define clear adapters and domain contracts, and it cannot rely on ad hoc arbitrary field storage forever.

## Trade-offs

This requires deliberate modeling and future domain work, but it prevents accidental cross-domain coupling and keeps the architecture maintainable.

## Mercur upgrade impact

Mercur upgrades should not require reworking the automotive domain model if the integration boundaries stay clean. The main re-validation is around supported links, workflow hooks, and custom field or module contracts.

## Follow-up

- define concrete domain modules and link boundaries only when approved
- keep automotive domain logic separate from Mercur-owned primitives
- avoid premature final schema design before product decisions are approved
