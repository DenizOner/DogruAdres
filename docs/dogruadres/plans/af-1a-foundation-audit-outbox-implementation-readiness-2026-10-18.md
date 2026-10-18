# AF-1A — Foundation audit/outbox implementation readiness and safe proof contract

- Date: 2026-10-18. Status: **DESIGN / REVIEW CHECKPOINT, NOT IMPLEMENTATION OR PRODUCTION MIGRATION PASS**.
- Immutable implementation baseline: main `d87ba52f99f74d7fec52af70a815fe91a989fc3f` (Mercur 2.3.7 / Medusa 2.21.2). The independent SAFE-0A production-secret fix remains on `feature/safe-0a-production-checks`; never rewrite it inside AF-1.
- Authority: accepted ADR-0002, ADR-0005 physical domain boundaries, ADR-0006 local atomic audit + durable outbox, DA-SEC-007/009 scoped decisions and DA-APP-007 staged review. [Audit-first roadmap](audit-first-architecture-and-delivery-2026-10-18.md).
- Safety: no original/G1/production DB connection, DDL, migration execution, disposable runtime or Git merge by this design assessment.

## Source observations to preserve

- `packages/api/src/modules/dogruadres-access/index.ts` registers standalone `dogruadresAccess` service using a stable module constant.
- `models/audit-event.ts` defines `da_audit_event` with canonical Foundation actor identity, role and Organization/action context. Existing audit table/migration includes `created_at`, `updated_at`, `deleted_at`; automatic ORM soft-delete/update must NOT silently erase security evidence.
- `service.ts` uses `@InjectTransactionManager()` around Organization provisioning, membership and invitation mutations, and `createAuditEvents(..., sharedContext)` inside the same service methods. Treat actual same-physical-transaction and fault rollback as requirements to TEST, not inferred proof from decorator syntax.
- `migrations/Migration20261017135550.ts` has destructive `down()` with `DROP ... CASCADE`; MUST NOT run on protected historical data.
- `migrations/Migration20261017150237.ts` adds default canonical source module `dogruadres-access`.
- Existing CI is unit+API TS and *HTTP syntax*, not a real database HTTP execution. The original Foundation API and protected-Owner flows must remain regression targets.
- AuditIndex and Vehicle do not yet exist in merged main. NO shared new physical audit table: AF-1 outbox belongs ONLY to `dogruadresAccess`.

## AF-1A0 evidence update (2026-10-18)

The [AF-1A0 full source trace](af-1a0-foundation-mutation-audit-source-trace-2026-10-18.md) has now mapped five write paths, their canonical audit actions, prior native targeted invitation-acceptance audit failure test and gaps. In particular, create/revoke invitation membership-revocation races need independent tests, while audit failures on other paths and local outbox remain unproven. The [mandatory first Agent local Git preflight](local-repository-freshness-preflight-2026-10-18.md) precedes any local engineering. No local Windows worktree, DB or runtime was inspected in this GitHub-only review.

## AF-1 implementation milestones — exact independent gates

**AF-1A0 — Source proof + transaction boundary inventory (READ-ONLY or isolated test planning).**
Document every audited Foundation write path: Organization provisioning, membership role/status changes, invitation creation/revocation/acceptance and any actor-mapping mutation. Trace guards, transaction decorators, notification/event side effects and context propagation. Enumerate original audit rows and prohibited payload fields without querying protected DB. Research installed Medusa 2.21.2 transaction API and migrations, and plan isolated failure injection. No rewrite of accepted permissions.

**AF-1A1 — Append-only source audit contract (future bounded code checkpoint).**
Decide DB-level immutability vs supported service-only enforcement after evaluating actual Medusa migration/model behavior, retention/legal-hold and operational ownership. An append-only audit may have internal control metadata requiring separate management; forbid deleting/modifying canonical business event fields and retain source rows. Test direct service update/delete and authorized/unprivileged SQL attempts, migration/backfill, and recovery. Do not auto-run destructive old `down()`; no assumption an arbitrary PostgreSQL trigger is a supported Medusa default.

**AF-1A2 — Foundation-local durable AuditOutbox (future bounded schema/code checkpoint).**
New model and additive migration OWNED by `dogruadresAccess`; no cross-module ORM FK. Proposed fields: canonical source_audit_event_id, versioned event envelope/idempotency key, Organization/actor/action safe projection, state/attempts/retry_time/lease/checkpoint refs and minimal error class. Exact security allowlist and claim/retry semantics need review first. Insert audit + outbox + business mutation in ONE source-local SQL transaction; if audit/outbox insert fails all fail. Do not add Vehicle models to Access.

**AF-1A3 — Source-only isolated PostgreSQL proof (requires separate disposable target authorization).**
Execute on a task-owned isolated disposable PostgreSQL and temporary API/proof harness with explicit original/G1 blocklist, exact process/DB/connection/transaction logging and restore invariants. Scenarios: success commit, direct audit insert failure, outbox insert failure, business-write failure, read uncommitted from independent connection, duplicate idempotency key and replay cursor. Validate persisted rows via separate SQL session. PASS only if every mandatory fault actually reaches injection point and rollback is proven; harness exit code 0 alone never proves atomicity.

**AF-1A4 — Backfill/reconciliation contract with AF-2 Index (future scoped checkpoint).**
Existing `da_audit_event` history must NOT be rewritten. Choose safe bounded chronological ID/occurred_at cursor plus collision/timestamp-order handling, backfill idempotency, partial failure rollback, checksums/count parity, missing event alert and non-destructive resume. Index consumer is independent `dogruadresAuditIndex`, not Foundation's own DB table; source outbox may be populated from historical entries only with a proven dedup policy.

**AF-1A5 — CI native authenticated HTTP and regression gate (future checkpoint).**
Run existing realistic Foundation HTTP tests with isolated DB, permission denied and revoked-user cases, invitation security, protected Owner race, audit/outbox failure injections and logged proof. CI MUST distinguish syntax checks from executed tests, and protect original/G1 databases. Merge, migration and deployment stay separate. No enabled test may be silently skipped.

## Proposed acceptance matrix

| ID | Failure/success case | PASS evidence |
| --- | --- | --- |
| F1-01 | Existing Organization provision / membership / invitation | Valid actor, unchanged authorization + durable audit |
| F1-02 | Canonical audit insert fails | No committed domain mutation |
| F1-03 | Outbox insert fails | Neither mutation nor audit committed |
| F1-04 | Domain mutation fails after audit staging | Audit/outbox not committed |
| F1-05 | Independent SQL connection checks uncommitted work | No partial visibility or residual rows |
| F1-06 | Same audit source ID relayed twice | Idempotent outbox, no unintended duplicate |
| F1-07 | Current membership revoked | Subsequent mutations denied; historical Org audit retained |
| F1-08 | Actor change/created-by field | Audit attribution accurate; Person does not own Vehicle |
| F1-09 | Source audit tamper/update/delete/soft-delete | Rejected or explicit governed immutable contract; no silent purge |
| F1-10 | Historical backfill/reconciliation | No destroyed/changed rows, no duplicates or unbounded startup delay |
| F1-11 | Replay/retry/poison envelope | No secret leak, observable failure and recovery |
| F1-12 | CI and migrations | Real executed isolated tests; no protected DB; forward-safe migration only |

## Unresolved engineering / Product Owner gates

- Exact protected audit fields; administrative metadata/retention/legal-hold and permitted read roles remain OPEN. No generalized audit CSV export permission.
- Source outbox event schema allowlist + actor reference, bounded claim/lease concurrency, retry policy, observed time/ordering. Do not invent a transport delivery SLO.
- Whether DB-level trigger, selective privileges or another compatible mechanism enforces append-only on Medusa's generated model; require proof, not undocumented manipulation.
- Historical audit backfill deployment safety, batch size, indexing, source DB migration history and recovery.
- Disposable database provisioning and test harness require separate task-scoped permission; existing original/G1 never used.
- New user-facing UI remains UI-0 scope, not a side effect of adding outbox.

**Technical recommendation:** Begin AF-1 with A0 read-only write-path/transaction trace and exact test matrix; implement additive database model only after a version-matched, independently reviewed solution and approved disposable proof scope. SAFETY-0A production-secret code remains a separate PR; do not cherry-pick undocumented code across feature branches.
