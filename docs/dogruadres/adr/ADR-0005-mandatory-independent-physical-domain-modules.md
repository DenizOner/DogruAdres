# ADR-0005: mandatory independent physical domain modules

- Status: Accepted
- Date: 2026-10-18
- Authority: Explicit Product Owner reversal of the previously accepted ADR-0004 C co-location exception; the physical independence requirement is non-negotiable for all DoğruAdres domain modules.
- Scope: All project-owned domain capabilities, including Vehicle. Supersedes ADR-0004 but does not modify ADR-0002.

## Context

Vehicle-0C proposed registering Vehicle persistence physically inside the existing dogruadresAccess Medusa module to simplify shared audit atomicity. The Product Owner explicitly rejected this architecture and withdrew ALL approvals for that co-location. Vehicle-0B testing of a separate Vehicle module and Access module yielded an INCONCLUSIVE metadata error: passing Vehicle's transaction manager to Access failed to find DaAuditEvent entity metadata. That result invalidates the tested forwarding technique, not independent modules or every integration design.

## Decision

**Every DoğruAdres domain capability MUST be implemented as a separately registered, physically independent Medusa module**, owning its own module identity/registration, models, entity metadata, service, persistence and migration boundaries. Merely creating separate internal services inside another domain's Medusa module does NOT satisfy physical independence.

- Vehicle Management MUST use a project-owned, independently registered module (provisional name dogruadresVehicle); NEVER add Vehicle entity models or persistence to dogruadresAccess.
- Identity/Organization Foundation remains independent in dogruadresAccess, owning canonical Person, Organization, Membership, Invitation, ActorMapping and existing shared AuditEvent.
- Each future project domain capability MUST obey the same physical module separation rule. Internal helpers WITHIN one's own independent module are allowed.
- Integrate modules via supported, version-matched Mercur/Medusa extension points (workflows, Query, module links or other documented boundaries), without importing other modules' ORM entity metadata or directly patching upstream dependencies.
- Do not co-locate domains merely to bypass a transaction limitation. If the mandatory shared audit atomicity contract conflicts with physical module isolation, STOP the affected integration, research supported alternatives and escalate the precise security/design trade-off. Do NOT silently weaken audit requirements, represent workflow compensation as a physical SQL rollback, or substitute eventual consistency without express Product Owner approval.
- Preserve approved DA-AUTO-006, V-01–V-07, N-01/P1 and N-02/C1 domain and security requirements. Organization ownership stays with Organization; Person/creator is not vehicle owner.
- Accepted ADR-0002's domain separation from Mercur marketplace primitives remains in force.

**The earlier ADR-0004 C architecture approval is REVOKED and its status is Superseded. It MUST NOT be implemented or tested as the active design.**

## Alternatives considered

- C: co-locate Vehicle and Access inside one physical module with separate internal services. REJECTED explicitly by the Product Owner; does not satisfy this mandatory module independence policy.
- B1: separate modules with direct Vehicle EntityManager forwarded to Access. Tested; DaAuditEvent metadata not found; do not repeat as-is.
- B2: separate modules and a documented, supported common physical transaction facility. Unproven; may be researched only against concrete version-compatible APIs, without undocumented metadata patching.
- Independently committed workflow steps with compensation. May be supported for business workflows but is NOT proof of the existing single-PostgreSQL-transaction audit requirement.
- Alternate module-owned transactional audit/outbox plus projection: possible design research only, NOT approved as a change to canonical shared security audit/consistency/visibility requirements.

## Consequences

Vehicle Management must be designed and eventually built in its OWN Medusa module. Domain isolation is a hard acceptance criterion, not a preference. Shared audit integration is an unresolved technical gate, not permission to embed Vehicle into Access. Do not claim a completed implementation or runtime proof.

## Trade-offs

Supported inter-module audit coordination may require further research, a dedicated isolated proof, or an expressly approved alternate audit architecture. Both the physical module rule and the existing audit-security guarantee remain binding until the Product Owner specifically decides otherwise. No agent or consultant may silently trade one for the other.

## Mercur upgrade impact

Validate each independently registered domain module, owned metadata/data/migrations, supported links/Query/workflows and audit security on Mercur 2.3.7 / Medusa 2.21.2 and on later upgrades. No modifications to installed dependency source, no unsupported cross-module ORM entity-manager metadata merging.

Official reference: https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/modules.mdx

## Later approved audit architecture clarification

[Accepted ADR-0006](ADR-0006-module-owned-atomic-audit-central-index.md) establishes per-module canonical audit + outbox and a separately registered central derived index. This ends the earlier requirement that Vehicle write directly into Access's physical audit table; it does NOT weaken this ADR's mandatory independent-module boundary. B1 proof remains historically INCONCLUSIVE.

## Follow-up

1. Mark ADR-0004 Superseded, preserving its historical text. Update project constitution, architecture, requirements, plans and indexes.
2. Design a physically separate dogruadresVehicle module and independently verify version-matched integration possibilities for a trustworthy shared audit contract.
3. Treat the B1 metadata error as a narrow INCONCLUSIVE test, not proof that all cross-module designs are impossible.
4. Before an implementation or migration, resolve the security audit integration and define targeted isolated proof and acceptance criteria. Do not run disposable tests, Agent tasks, real DB writes, Vehicle-1 implementation, or merge as part of this documentation correction.
