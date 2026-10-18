# AF-1B independent review and AF-1C proposed test-only checkpoint

- Date: 2026-10-18
- Status: **AF-1B local branch preparation READY per Agent evidence**; **AF-1C proposed for separate bounded coding authorization**, not executed or automatically approved.
- Immutable source baseline: `main=d87ba52f99f74d7fec52af70a815fe91a989fc3f`.
- Local-only branch: `feature/af-1-foundation-audit-outbox` in `D:\DogruAdres-af1a`, HEAD equals base; no push. GitHub cannot independently inspect local Windows disk; this is Agent-reported evidence.
- Protected `D:\DogruAdres` with 42 preserved items and Foundation publication worktree: Agent reports unchanged.
- Review docs on `feature/vehicle-management-mvp` are read-only reference sources, not part of local AF-1 `main` baseline. No merge/cherry-pick or change to User-owned data.

## Independent findings from version-matched source and existing tests

Medusa 2.21.2 `InjectTransactionManager` source at `packages/core/utils/src/modules-sdk/decorators/inject-transaction-manager.ts` creates a repository transaction if no existing `transactionManager` is supplied; it reuses the active supplied context otherwise. Mercur 2.3.7 official module guidance supports `@InjectTransactionManager` for project-owned domain mutation, a Medusa shared context and independent module ownership. Neither source contract proves physical PostgreSQL rollback in every failure path without runtime evidence. Existing Foundation `dogruadresAccess` is physically independent; this work does not revive Vehicle-to-Access audit writes.

Five inspected service methods and audit events:
1. `provisionOrganization`: `organization.provisioned`, plus one `organization.owner_assigned` per initial Owner.
2. `changeMembership`: `organization.membership_changed`.
3. `createOrganizationInvitation`: `organization.invitation_created`.
4. `revokeOrganizationInvitation`: `organization.invitation_revoked`.
5. `acceptOrganizationInvitation`: `organization.invitation_accepted`.

Native `dogruadres-foundation.native.test.mjs` has one targeted audit INSERT fault for invitation acceptance and other concurrency tests, but hardcodes the historical G1 port `55437`, DB `g10k_20261017125120_7d460ec3`, PostgreSQL container `dogruadres-g1-0b-postgres`, API port `19040`, Redis port `56379`. `provision-native-users.ts` separately hardcodes that database and Redis. They MUST NOT be run on G1 during this checkpoint or simply have safety checks removed. Their prior successful local proof is not proof for a new isolated environment; current CI syntax-only is not execution.

## Required concurrency semantics — recommendation, NOT new approved product policy

An already committed membership revocation MUST block *newly authorized* mutations (existing approved rule). For overlapping requests there must be a **documented linearization point** under compatible source-module locking: if revocation commits before the mutation's effective authorization/lock ordering point, the mutation must deny; if the mutation serializes and commits before revocation, its earlier authorized outcome may stand. Do **not** claim revocation unconditionally wins against a transaction that has already legitimately serialized and committed. Preserve historical mutations/audit and deny subsequent access.

The implementation must prove or challenge that contract with deterministic ordering tests, including both orders and independent persisted-state checks. The final locking/linearization mechanism is technical design, not yet proven. Avoid fixed sleeps as sole evidence.

- `createOrganizationInvitation`: actor membership is checked inside transaction but without a membership lock/revalidation before writes; test against simultaneous actor revocation.
- `revokeOrganizationInvitation`: invitation lock/revalidation exists; actor authorization read precedes invitation lock and is not rechecked after that lock; test against actor revocation and ordering.
- `changeMembership`: organization/target membership locks and actor authorization re-read exist, but actor may be a DIFFERENT membership row; test actor-revocation race in addition to last-Owner target races. Do not represent the presence of a target lock as automatically serializing actor membership.
- `acceptOrganizationInvitation`: keeps existing single-use, invitation/actor/membership locking and real verified-email policy; replay/concurrent races must stay green.
- `provisionOrganization`: actor lock order and all-or-nothing multi-audit write remain regression targets; proof must target both `organization.provisioned` and a later `organization.owner_assigned` insert, with exact fault reached.

If the racing requests can create an unauthorized persisted mutation, propose the smallest same-module service/locking repair as a **separate bounded production-code checkpoint**. Do NOT modify the service within AF-1C test-only scope.

## AF-1C recommended first implementation scope: tests/harness ONLY, no execution

Permitted files in the NEXT separately approved checkpoint:
- `packages/api/integration-tests/helpers/isolated-foundation-runtime.mjs` — new fail-closed isolated-target validation; real target must be explicitly task-owned, disposable and distinct from original/G1/prod before any DB/API access.
- `packages/api/integration-tests/http/dogruadres-foundation.atomicity.native.test.mjs` — new targeted fault matrix covering provisioning, membership, invitation create/revoke/accept and concurrency races. Descriptive tests may be staged but MUST NOT be reported PASS if runtime cannot execute.
- `packages/api/integration-tests/http/dogruadres-foundation.native.test.mjs` — minimal migration to share proven target-validation helper WITHOUT weakening historical G1 fail-closed guard; if safety cannot be preserved without broad rewrite, leave unchanged and report separate plan.
- `packages/api/integration-tests/fixtures/provision-native-users.ts` — isolated-profile variant only with exact negative target checks; leave historical G1 safeguards intact until replacement is verified. Do not grant open-ended arbitrary DATABASE_URL access.
- `packages/api/integration-tests/http/README.md` — instructions and explicit NOT RUN/authorization conditions.

No new module, audit/outbox model, production service change, migration, dependency upgrade, CI green-claim, database or Docker provisioning; no invitation behavior fix or speculative upstream modification in this test-only stage.

## Harness fail-closed design and proof requirements

- Explicit allowlisted task-scoped run ID/owner, unique container/DB, host/port, labels, mounts, resource ownership; never trust an env var or loopback port by itself. Verify container ID/name, bound port, volume/tmpfs, labels and **negative original/G1 allowlist** before any authenticated API/DB request or destructive cleanup.
- No default DB/Redis/API fallbacks; fail if missing, mismatched, or unrecognized, if Docker inventory is ambiguous or credentials refer to protected resources. No `NODE_ENV=production`.
- Any fixture DDL/function/trigger is unique and conditioned on synthetic target records. Failure must visibly reach intended audit/domain INSERT/UPDATE, not just return HTTP 500. Clean only task-owned artifacts with `finally`, verify artifact absence, retain logs/hashes.
- Persisted state before/after must be independently queried from a second SQL connection. Validate zero rows for new synthetic Person/ActorMapping/Organization/Membership/Invitation/Audit on rollback, and retention of pre-existing row state as applicable. Provisioning second-audit targeted failure is important.
- Concurrency proof must coordinate separate transaction/session execution deterministically, record event/lock order, test both ordering directions, avoid relying on `setTimeout` alone, and detect deadlock/timeout without masking a violation.
- Future outbox case IDs may be written as NOT IMPLEMENTED/SKIPPED explicitly (not fake PASS); no outbox exists yet.
- Tests requiring native Medusa auth/API need task-owned Redis and process too. These are NOT authorized just by the test-source checkpoint.

## Next gates after AF-1C

**AF-1D runtime authorization**: separate Product Owner scope for disposable PostgreSQL/Redis/API, dependency installation in AF-1 only, approved process/resource cleanup, optional test-only migration/schema bootstrap, and evidence preservation; NO original/G1/production writes. Do not start runtime before explicit approval.

**AF-1E independent review**: classify each of five paths and races with PASS / FAIL / INCONCLUSIVE / NOT TESTED and physical transaction evidence. Authorize any minimal permission-race service repair separately.

**AF-1A1/A2**: append-only model and module-owned durable AuditOutbox require reviewed schema/retention/event cardinality decisions and additive migration plan. AF-2 independent Audit Index remains mandatory for initial implementation but is not implemented by AF-1C.

## Git and local safety

Keep `feature/af-1-foundation-audit-outbox` only on the clean `D:\DogruAdres-af1a` worktree, unchanged immutable base before first test-only code change. Never alter `D:\DogruAdres`, publication, SAFE-0A PR #3, Vehicle plans, or remote main. Recheck exact live remote main/branch identity and local clean state at start. Commit/push/PR requires explicit stage authorization, not assumed from `READY`.
