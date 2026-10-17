# ADR-0001: Mercur as the marketplace engine

- Status: Accepted
- Date: 2026-10-07

## Context

DoğruAdres requires a marketplace platform with seller support, product catalog governance, workflows, dashboard tooling, and a working extension model. The project must remain upgrade-safe and should not become a fork of the core platform.

## Decision

Mercur is the marketplace engine and platform for DoğruAdres.

DoğruAdres is built as project-owned extensions and domain logic layered on top of Mercur rather than as a forked Mercur product.

## Alternatives considered

- build a custom marketplace engine from scratch
- fork Mercur and carry a private platform codebase
- treat Mercur as a library rather than as the platform boundary

## Consequences

The project benefits from Mercur's marketplace primitives, extension model, and versioned platform architecture. The project must preserve integration boundaries and avoid core modifications.

The cost is dependency on Mercur's upgrade lifecycle and the need to maintain project-owned adapters and domain logic around it.

## Trade-offs

This keeps the project more maintainable and upgradeable, but it requires the project team to respect Mercur's extension boundaries and architecture.

## Mercur upgrade impact

Every Mercur upgrade must re-check API behavior, extension points, dashboard contract changes, and compatibility adjustments. The project must not assume prior integration behavior persists automatically.

## Follow-up

- continue to document domain ownership in project docs
- keep extension-first patterns as the default development approach
- review temporary compatibility adjustments on every upgrade
