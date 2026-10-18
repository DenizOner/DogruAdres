# Audit-first coding plan — source audit, outbox and unified index

- Status: ADR-0006 PRODUCT ARCHITECTURE APPROVED; execution and exact schema/testing checkpoints require review.
- Baseline: merged main d87ba52f99f74d7fec52af70a815fe91a989fc3f.
- Non-negotiable: independent physical dogruadresAccess, dogruadresVehicle and dogruadresAuditIndex modules (ADR-0005). First implementation program includes central index; it must not be postponed.

## Initial target

Foundation owns existing da_audit_event plus additive Foundation outbox; Vehicle owns its own VehicleAuditEvent + VehicleAuditOutbox; independent dogruadresAuditIndex owns only derived AuditIndexEntry/checkpoint/retry state. No Vehicle model or audit inside Access. Audit index is not a global business search engine or a second canonical audit store.

## Atomic source write and reliable projection

A validated, authorized domain mutation, append-only source audit and local durable outbox envelope commit within one module-owned SQL transaction (all-or-nothing). After commit, an application-owned relay reads pending outbox and delivers minimal safe envelopes to the independent Index module using supported Medusa/Mercur contracts. Consumer uses unique source_module+source_event_id for idempotent upsert, tracks per-source progress, lag/gaps, retry and dead-letter reasons. Failure to publish does NOT undo a successfully committed source operation, but outbox survives so projection can recover. Relay crash, duplicate/out-of-order delivery and index rebuild are explicitly tested. Generic Medusa subscribers/eventBus do not automatically provide this strong guarantee.

Source schema proposals (not yet final): SourceAuditEvent {event_id, actor_person_id, actor_type/id, organization_id, role_context_at_event, action, resource, target_id, occurred_at, schema_version, allowlisted redacted values}; SourceOutbox {id, event_id, envelope_version, pending/delivery state, attempts, next_retry_at, lease, last_error}. Foundation retains historical da_audit_event, adding ONLY safe forward migrations.

Index schema proposal: AuditIndexEntry unique (source_module,source_event_id), org_id, actor reference, action/resource/target, source timestamp, indexed_at, schema version, safe filter fields. IndexCheckpoint/reconciliation/deadletter support. No cross-module ORM relation or direct foreign key by assumption. Source remains authoritative.

## Bounded development sequence

**AF-0 — Docs/review (current):** ADR-0006, security/requirements/Vehicle plan, defect register and this roadmap; preserve old requirements, ADR-0004 history, historical status counts.

**AF-1 — Foundation repair + source audit/outbox:** Separately reviewed implementation checkpoint for append-only/tamper-resistant source audit contract, forced rollback tests for audit and outbox, additive outbox, safe historical backfill, production secret fail-fast, nondestructive migration/rollback plan, native HTTP CI. Never run destructive Foundation down migration against protected DB. Preserve already working Organization/membership invitation flows.

**AF-2 — Audit Index initial implementation:** Separately registered dogruadresAuditIndex with own models/service/migrations, source relay and event contract, idempotent ingestion, retries/replay/repair, lag status, secured minimal Foundation index search/read and operator UI. Its first-release integration is REQUIRED before Vehicle acceptance. Exact reader roles/privacy limits require bounded approval before exposing routes.

**AF-3 — Standalone Vehicle module:** dogruadresVehicle own model/services/migrations, Organization/Person authorization via supported interfaces, approved P1/C1, per-Org live partial uniques, local VehicleAuditEvent + VehicleAuditOutbox atomic with create/update/soft-delete, secure Index integration. Native HTTP and concurrency/fault tests. Then independently accepted Organization-facing UI.

**AF-4 — Full regression/operational acceptance:** Real DB native authenticated HTTP + migration dry-run/restore, original Foundation regression, missing/duplicate/reordered event cases, index outage and replay, revocation-based index authorization, no cross-Organization counts leakage, authenticated browser E2E, CI production bundle check and readiness. Production deploy/merge always separate.

**AF-5 — Other previous custom code:** Broad audit across routes, jobs, subscribers, dashboards, config and platform adapters to find actual defects; maintain file-specific evidence, risks and targeted repairs rather than unbounded changes.

## Initial acceptance matrix

| ID | Proof target | Pass requirement |
| --- | --- | --- |
| AUD-01 | Foundation mutation/local audit | Same SQL transaction |
| AUD-02 | Foundation audit INSERT failure | No committed mutation |
| AUD-03 | Foundation outbox INSERT failure | No committed mutation OR audit |
| AUD-04 | Vehicle create/update/soft-delete audit failure | Vehicle mutation fully rolled back |
| AUD-05 | Vehicle outbox failure | Vehicle and audit fully rolled back |
| AUD-06 | Index offline after source commit | Source audit safe, outbox pending for retry |
| AUD-07 | Duplicate delivery and consumer retries | One unique index event |
| AUD-08 | Relay crash/out-of-order events | Reconciliation repairs gaps, no loss |
| AUD-09 | Backfill and full index rebuild | Preserve original audit, no duplicates |
| AUD-10 | Membership revoked | Subsequent source+index reads denied |
| AUD-11 | Org A queries Org B | No records/count/facet/cursor leak |
| AUD-12 | Disallowed sensitive field | Never copied into index |
| AUD-13 | Index lag/partial outage | Staleness clearly indicated |
| AUD-14 | Append-only audit tampering | Denied/logged; no silent modification |
| AUD-15 | CI native HTTP/PostgreSQL | Real tests actually executed, not syntax-only |
| AUD-16 | Nonprod migration and recovery | Protected source intact; no destructive cascade rollback |

## Open detailed policy/implementation contracts

Exact audit readers (Org Owner/Admin vs authorized delegates/platform auditors), field allowlist, accessible before/after values, retention/legal holds, export formats, central index SLA, reconciliation/watermark semantics, event-order policy, version-matched relay mechanism, background process resource budget and failure telemetry. Do not accidentally upgrade DA-SEC-009 broad exports or DA-APP-009 global search from PROPOSED status.

## Implementation authorization and safety

Product Owner approves principles and initial inclusion. This document is NOT blanket authorization to modify all past code, deploy, migrate protected original/G1/production DBs, reset user-owned dirty worktrees or merge. Convert each finding into a focused proposed repair with exact tests and explicit checkpoint approval. Proof results, not assertions, close defects.
