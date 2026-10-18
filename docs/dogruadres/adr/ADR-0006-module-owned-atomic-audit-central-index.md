# ADR-0006: domain-owned atomic audit and unified derived index

- Status: Accepted
- Date: 2026-10-18 (documentation/decision record)
- Scope: All independent DoğruAdres domain modules and a separately registered Audit Index infrastructure module.
- Authority: Current explicit Product Owner acceptance of local module-owned audit, central index from initial coding, and evidence-based Foundation/earlier-code repairs.
- Implementation: NOT YET IMPLEMENTED; source/runtime/data changes require bounded checkpoints. ADR-0002 and ADR-0005 remain Accepted; co-location ADR-0004 remains Superseded.

## Context

Previously DA-AUTO-006 referenced one "shared audit trail" in the Foundation Access module. Vehicle-0B showed a metadata failure when trying to write DaAuditEvent with the separate Vehicle EntityManager; result was INCONCLUSIVE, not proof that all independent module integration is impossible.

A centrally searchable audit timeline does NOT require one physically centralized write table. The Product Owner now approves independent source audit per domain plus a derived central audit index. This changes only the earlier interpretation requiring future Vehicle writes directly into Foundation's da_audit_event. Foundation's same-transaction security audit guarantee is preserved.

Official reference contracts: [Mercur v2.3.7 modules](https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/modules.mdx), [Medusa module isolation](https://docs.medusajs.com/learn/fundamentals/modules/isolation), [Medusa database operations](https://docs.medusajs.com/learn/fundamentals/modules/db-operations), [Medusa events/subscribers](https://docs.medusajs.com/learn/fundamentals/events-and-subscribers). An async event/subscriber is NOT by itself a proven durable outbox.

## Decision

1. Each separately registered domain module owns its canonical local audit model/evidence, its own service/metadata/migration boundary and a durable source outbox. Business mutation + mandatory local audit + source outbox MUST commit or roll back in ONE source-module PostgreSQL transaction; prove with real fault injection. Actor identity/Organization/role/context must be server-derived and permitted/redacted.
2. Existing dogruadresAccess keeps historical da_audit_event as the canonical FOUNDATION audit. Do not delete, bulk-migrate, copy into Vehicle ownership, or rewrite Foundation security/audit history. Future dogruadresVehicle owns VehicleAuditEvent and VehicleAuditOutbox inside its own separately registered module; no write to Access's da_audit_event.
3. Establish dogruadresAuditIndex as a separately registered, project-owned infrastructure/read-model Medusa module. It stores derived, rebuildable search/timeline entries and checkpoint/lag/replay diagnostics, not primary source audit. It MUST be designed and included in INITIAL implementation checkpoints, not deferred.
4. Source outbox persisted with its audit ensures index outages do not lose source evidence. After commit, a supported application-level relay delivers envelopes at least once with bounded retries, quarantine, reconciliation and replay. Index consumer idempotently de-duplicates by (source_module, source_event_id). Actual delivery guarantee, lease semantics and checkpoint correctness require tests; do not mistake generic event emission for proven durable capture.
5. Secure current Organization/resource membership and role checks at QUERY TIME for index, source and UI. Revocation blocks later reads regardless of index lag. Never reveal unauthorized records through counts, pagination, facets, errors, search or exports. Historical event-time actor/role attribution is not authorization to read now.
6. Index only explicitly allowlisted, redacted event fields: source+event IDs, version, Organization, actor reference, action, resource/target, timestamp, safe display metadata and indexed_at. No secrets, invitation tokens, uncontrolled personal data, financial records or full arbitrary before/after values.
7. Expose index freshness/lag/incompleteness and source reconciliation. There is no claimed single global ordering of independent sources. The authoritative evidence remains in each module. A central projection delay is allowed; local audit cannot be delayed or lost.
8. Minimal secured audit index query/view for Foundation and Vehicle is required from first release. Exact reader roles/fields, retention/legal holds, export policy and lag SLO remain bounded OPEN decisions; DA-SEC-009 broad CSV/Excel export and DA-APP-009 global business-data search remain PROPOSED, not implicitly approved.
9. All other current/future domain modules adopt the same independent model when introduced. This ADR does not authorize arbitrary replacement of unrelated finance ledgers or operational logs.

## Alternatives and tradeoffs

- Central Foundation audit physical write for Vehicle: rejected as domain ownership coupling.
- Local audit only without index: insufficient for initial unified index requirement.
- Fire-and-forget asynchronous events: insufficient for commit-correlated reliable replay.
- Central index as canonical ledger: rejected; source evidence must persist if index fails.
- Independent domain audit + durable outbox + independently registered derived index: selected, with added relay, replay, fault injection and security operational burden.

## Acceptance and upgrade impact

Required test classes: local audit/outbox failures roll back source mutation; successful commits leave source+audit+outbox; index offline/online retries without loss or duplicates; replay/rebuild reproduces projection; revocation and cross-Organization reads fail closed; allowed field redaction; migration/backfill preserve all historical Foundation rows; real PostgreSQL/HTTP tests execute in CI; no production shortcuts. Version-match Mercur 2.3.7/Medusa 2.21.2 and re-test contracts on upgrade. No framework source patch.

## Follow-up

Implement through separately authorized [audit-first development checkpoints](../plans/audit-first-architecture-and-delivery-2026-10-18.md). Review [Foundation/legacy findings](../plans/foundation-baseline-review-2026-10-18.md) before modifying past code. No blanket claim of all bugs fixed, no protected DB work or branch merge by this ADR.
