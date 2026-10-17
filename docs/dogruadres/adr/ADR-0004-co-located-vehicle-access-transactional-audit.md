# ADR-0004: co-located Vehicle and Access persistence for transactional audit

- Status: Superseded
- Superseded by: [ADR-0005](ADR-0005-mandatory-independent-physical-domain-modules.md), following explicit Product Owner withdrawal on 2026-10-18.
- Date: 2026-10-18
- Scope: DogruAdres manual Vehicle Management MVP ONLY
- Decision authority: Product Owner explicitly approved the controlled C architecture exception in the current conversation; 2026-10-18 is this documentation record date, not a fabricated earlier approval timestamp or permalink.
- Proof and delivery state: NOT PROVEN / NOT IMPLEMENTED. Accepted architecture DOES NOT authorize the disposable proof, Vehicle-1, migrations, deployment or merge.

## Current authority notice

**REVOKED — NOT AN AUTHORIZED DESIGN.** The Product Owner explicitly rejected physical Vehicle/Access co-location and requires all domain modules to be independently registered. This decision is retained solely as historical evidence; its design instructions MUST NOT be implemented. [ADR-0005](ADR-0005-mandatory-independent-physical-domain-modules.md) is authoritative.

## Context

Every Vehicle belongs to one Organization and not to its creating Person. Mutations require actor attribution in the existing canonical shared dogruadresAccess AuditEvent. The mandatory security invariant is that each Vehicle mutation and its required audit entry commit or roll back within ONE physical PostgreSQL transaction.

Vehicle-0B tested a separate Vehicle module and existing Access module using MedusaService / InjectTransactionManager and a forwarded Vehicle transaction context. The attempted shared AuditEvent write failed with Metadata for entity DaAuditEvent not found BEFORE the intended audit INSERT. Actual audit-insert-failure rollback was NOT tested. Vehicle-0B is therefore INCONCLUSIVE: the tested B1 manager-forwarding pattern failed, but this does not prove every cross-module mechanism impossible.

Official Mercur v2.3.7 and Medusa v2.21.2 review did not identify a proven stable public B2 API guaranteeing that independent module metadata graphs can make a joint physical commit. Medusa documents multiple internal services within ONE module, providing a supportable design candidate, not an automatic atomicity proof.

Evidence and contracts:
- [Vehicle-0C independent review](../plans/vehicle-0c-atomicity-architecture-review-2026-10-18.md)
- [Mercur v2.3.7 modules](https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/modules.mdx)
- [Mercur v2.3.7 workflows](https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/workflows.mdx)
- [Medusa v2.21.2 transaction decorator](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/utils/src/modules-sdk/decorators/inject-transaction-manager.ts)
- [Medusa multiple services in one module](https://docs.medusajs.com/learn/fundamentals/modules/multiple-services)

## Decision

**Accept C as a strictly bounded architecture exception for manual Vehicle MVP:** The EXISTING project-owned physical dogruadresAccess Medusa module may own Vehicle persistence and the existing canonical shared AuditEvent in the same module metadata/persistence boundary. Vehicle policy and business logic MUST remain logically separated in dedicated internal service(s), model/validator files, and bounded workflow/API adapters.

- Keep the current module registration/ID. Do NOT rename or duplicate Access tables, or introduce a separately bootstrapped Vehicle module for the MVP.
- Register prospective Vehicle metadata within the same physical Medusa module as the existing AuditEvent. One module metadata boundary is expected, but NOT YET PROVEN to imply atomic SQL behavior.
- An orchestrating workflow may call a single atomic mutation boundary for Vehicle plus mandatory AuditEvent. DO NOT split the security-critical pair into independently committed workflow steps and call compensation a SQL rollback.
- Use supported Medusa/Mercur extension points only. Do not patch dependency sources, merge automotive state into Mercur Seller/Store/Product/Member data, duplicate audit events, or bypass module authorization.
- Keep Organization as immutable Vehicle owner and all approved DA-AUTO-006, V-01–V-07, N-01/P1, N-02/C1 permissions/soft-delete/live-unique rules unchanged. Keep actor attribution in the canonical audit, not in Vehicle creator-ownership metadata.
- Scope this exception to FIRST manual Vehicle MVP ONLY. No implicit approval for other automotive domains, unrelated Access refactors or future modules.
- Preserve Accepted ADR-0002 automotive-domain isolation from MERCUR marketplace primitives. This is a controlled exception to Mercur's recommended physical one-domain-thin module convention, not a revision of ADR-0002.

**Only the design boundary is Accepted. SQL atomicity remains UNPROVEN and Vehicle-1 is NOT AUTHORIZED.**

## Alternatives considered

- B1: separate Vehicle module with directly forwarded Vehicle EntityManager. Actual proof encountered missing DaAuditEvent metadata; REJECT this specific tested pattern.
- B2: separate modules using a supported cross-module physical transaction coordinator. No suitable verified stable version-matched public contract identified. NOT PROVEN, not categorically impossible.
- A: distinct workflow writes and compensation. INSUFFICIENT as the only guarantee of a physical transaction.
- D: PostgreSQL audit trigger/raw cross-module persistence. Could be transactional, but creates extra schema/actor-context and upgrade coupling. NOT SELECTED.
- C: one project-owned physical module with separate internal Vehicle service(s). SELECTED as the narrowly scoped architecture exception, conditional on the later real proof.

## Consequences

Existing Foundation and future Vehicle model will be coupled through module startup, metadata, dependency injection and migration surface. Logical Vehicle code separation and canonical shared security audit remain mandatory. Framework-owned marketplace primitives remain independent. No Vehicle source code, new migration, database mutation or UI is created by this ADR.

## Trade-offs

1. Deliberate physical module-domain co-location departs from Mercur's one-domain thin-module guidance. Mitigate through strictly separated internal domain services and review boundaries.
2. Changes to module models and migrations have a wider Foundation regression blast radius. Require targeted security, invite, membership, audit and new Vehicle regression evidence in later approved development.
3. Future extraction into a standalone Vehicle module may require explicit migration and redesign of audit atomics; there is no promised easy migration path.
4. Existing Foundation down migration uses destructive table removal. This ADR is not production schema/rollback approval.
5. Co-location does not automatically guarantee same physical transaction; C-01–C-10 are mandatory independent runtime evidence gates.

## Mercur upgrade impact

Revalidate v2.21.2 module internal-service registration, shared module metadata, decorated transaction context and fault-injected audit rollback against every future Mercur/Medusa version. Do not rely on internal framework hacks or modify upstream dependencies.

## Mandatory C proof — SEPARATE AUTHORIZATION REQUIRED

This Product Owner instruction EXPLICITLY prohibits executing, commissioning, or delegating this proof now. A later separately authorized task must use a NEW, disposable, isolated PostgreSQL target and an external temporary snapshot/harness, without changing user-owned Git worktrees, original/G1 DB/volumes, production, staging or deployed infrastructure.

| Test | Mandatory real observation |
| --- | --- |
| C-01 | Vehicle-like model and existing AuditEvent resolve in same physical module metadata/manager |
| C-02 | Successful Vehicle-like CREATE and existing AuditEvent persist together |
| C-03 | Fault injected at actual audit INSERT rolls back Vehicle CREATE |
| C-04 | Actual audit INSERT failure rolls back Vehicle UPDATE |
| C-05 | Actual audit INSERT failure rolls back Vehicle SOFT DELETE |
| C-06 | Failure after successful audit insert rolls back BOTH audit and Vehicle mutation |
| C-07 | Transaction/connection identity shows both writes share one physical PostgreSQL transaction |
| C-08 | Independent DB session observes no intermediate committed partial state and confirms final/rollback rows |
| C-09 | Existing Access audit and core model/service behavior remain intact; no second audit trail |
| C-10 | Exact Git versions, isolated target and artifact hashes/logs prove protected environments unchanged and task cleanup scoped |

PASS requires authentic framework-level execution, deterministic actual INSERT fault, SQL transaction/connection evidence and persisted-state queries. An exit code, sharedContext reference, early metadata error, or compensation is NOT PASS. Return FAIL/INCONCLUSIVE/BLOCKED when warranted and stop; never weaken audit requirements.

## Follow-up

1. Record Accepted ADR-0004 in architecture, requirements and Vehicle plans. Do not rewrite earlier accepted ADRs, baseline histories or proof results.
2. Seek separate express Product Owner permission before any disposable C proof or Agent task.
3. Independently review authentic C-01–C-10 evidence and accept implementation architecture only after proven PASS.
4. Then seek separate Vehicle-1 scope/schema/API/test authorization. Migrations, UI, main merge and deployment remain separately controlled.
