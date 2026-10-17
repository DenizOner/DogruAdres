# ADR-0003: Mercur core modification policy

- Status: Accepted
- Date: 2026-10-07

## Context

The project depends on Mercur as the platform baseline. Direct modification of Mercur core would increase upgrade risk, reduce maintainability, and make the project harder to reason about.

## Decision

Direct Mercur core modification is prohibited by default.

If a required behavior cannot be implemented through supported extension points, use the following escalation:

1. official Mercur extension point
2. project module, provider, workflow hook, subscriber, or adapter
3. upstream contribution
4. minimal isolated compatibility patch
5. fork

Steps 3 through 5 require explicit external approval before implementation.

## Alternatives considered

- patch Mercur directly in the installed codebase
- fork Mercur for local project-specific behavior
- re-implement the missing capability outside the framework without respecting the platform boundary

## Consequences

The project remains aligned with Mercur's supported extension model and keeps upgrade and maintenance cost lower.

The trade-off is that some missing behaviors may require stronger design work, a clear adapter layer, or stakeholder approval before a higher-risk path is chosen.

## Trade-offs

This policy preserves upgradeability and reduces hidden framework drift, but it may require more disciplined design work to solve a problem within the supported architecture.

## Mercur upgrade impact

A core-modification policy keeps future upgrades simpler because the project is less likely to depend on private framework internals. The project still must verify that every supported extension path remains valid across Mercur releases.

## Follow-up

- enforce the extension-first rule in project docs and AGENTS.md
- require explicit approval for any upstream patch or fork plan
- re-review compatibility patches on each Mercur upgrade
