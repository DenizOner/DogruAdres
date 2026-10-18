# Vehicle Management MVP — Vehicle-0 Decision and Design Plan

- **Status:** Approved product scope V-01–V-07; proposed technical design; implementation NOT AUTHORIZED.
- **Recorded:** 2026-10-18. This is the documentation date for the current explicit Product Owner approval, not a claim about an unavailable historical message permalink.
- **Baseline:** main at d87ba52f99f74d7fec52af70a815fe91a989fc3f, merged PR #1 (Identity/Organization Foundation).
- **Authority:** REQUIREMENTS.md DA-AUTO-001 and DA-AUTO-006; SECURITY.md; accepted ADR-0002; PRINCIPLES.md §§10–11. DA-AUTO-002 and DA-AUTO-005 remain PROPOSED; DA-AUTO-004 remains DEFERRED.
- **Delivery horizon:** H-DOMAIN. The older controlled baseline implementation status remains NOT_ASSESSED; this design document is not evidence of implementation.

## Objective

Deliver an independent, manual, Organization-owned Vehicle Management capability on top of the merged Person/Organization/Membership authorization foundation, without requiring AI, OEM, marketplace Seller/Store linkage, quotation workflows or external suppliers. A real end-user MVP comprises both a backend and an authenticated Organization-facing UI, subject to separately reviewed checkpoints.

## User-visible outcome

Authorized active Organization members can list, view, create and update that Organization's own Vehicle records; active Owner/Admin users can also delete (soft-delete). Revoking an individual's Organization membership immediately denies later protected Vehicle requests without deleting the Organization's historical vehicles. Vehicle has no personal creator ownership.

## Scope and normative approved rules

- **DA-AUTO-001 / DA-AUTO-006:** Every Vehicle belongs to exactly one Organization and not to the creating Person. Authorization is evaluated against current mapped Person, active membership, Organization scope, action policy and the actual Vehicle resource owner resolved on the server.
- **DA-AUTO-006:** Active Owner/Admin/Member can read/create/update. Only Owner/Admin can delete. A platform operator has no automatic private Vehicle access.
- **DA-AUTO-006:** Supplied normalized, non-empty plate and VIN keys are independently unique among live records within one Organization, at both application and database levels. The same keys may exist in separate Organizations. Concurrent conflicting writes must not create duplicates.
- **DA-AUTO-006:** Mutations attribute the actual authenticated actor in the shared transactional security audit; do not add creator-owner properties or creator-ownership metadata to Vehicle.
- **V-01 APPROVED:** Require at least one non-empty plate OR VIN, including after PATCH/update. Neither is individually required.
- **V-02 APPROVED DIRECTION:** Preserve display values and separate normalized keys. Treat specified plate spacing/separators as equivalent and VIN text case-insensitively. See the explicit OPEN algorithm gate below.
- **V-03 APPROVED:** Use soft delete, preserve audit and history. No hard-delete Vehicle operation in MVP.
- **V-04 APPROVED:** Unique indexes apply to live/non-deleted rows only; a deleted row does not reserve its former key forever. Restoration is OUT OF SCOPE.
- **V-05 APPROVED:** An optional user-provided short label; optional free-text make and model; optional manually entered model year. No automatic canonical make/model/generation taxonomy or validation by OEM.
- **V-06 APPROVED:** The Organization owner of Vehicle is immutable during MVP. No inter-Organization transfer API.
- **V-07 APPROVED:** Backend/API/security and authenticated manual UI are distinct reviewable delivery checkpoints. Backend-only is not complete user-facing MVP.

## Non-goals

No VIN decoder, vehicle identification/lookup service, OEM or LexCom connection, automated fitment or compatibility guarantee, Product/Inventory/Quotation integration, Seller/Store ownership, financial flows, files/photos, bulk import/export, global vehicle search, application-wide new RBAC, privileged platform bypass, organization transfer, undelete, hard-delete, vehicle sharing, user-to-user ownership, or external paid service.

Existing unrelated Storefront, dashboard, Mercur upgrade and production-deployment limitations are not implicitly resolved by Vehicle development. Do not alter Mercur/Medusa source.

## Binding physical-module rule — Accepted ADR-0005

The Product Owner rejected C co-location and withdrew ALL such approvals. [ADR-0004](../adr/ADR-0004-co-located-vehicle-access-transactional-audit.md) is Superseded by [Accepted ADR-0005](../adr/ADR-0005-mandatory-independent-physical-domain-modules.md). Vehicle MUST be a separately registered physical dogruadresVehicle module; dogruadresAccess remains separate and owns canonical Foundation data and AuditEvent. Shared audit atomicity across the modules remains OPEN/BLOCKING after INCONCLUSIVE B1. Solve or escalate the integration issue without co-location or silent security downgrade. No implementation is claimed.

## Approved audit-first architecture and index from first release

[Accepted ADR-0006](../adr/ADR-0006-module-owned-atomic-audit-central-index.md) changes the previously assumed physical shared audit write: dogruadresVehicle must own its own VehicleAuditEvent + VehicleAuditOutbox in ONE transaction with each Vehicle mutation. Foundation's da_audit_event remains Foundation-owned and must not be a Vehicle write target. Separate dogruadresAuditIndex is an INITIAL, required, rebuildable unified index; reliable post-commit relay, deduplication, replay and current-permission authorization are mandatory. See the [audit-first implementation plan](audit-first-architecture-and-delivery-2026-10-18.md) and [Foundation source findings](foundation-baseline-review-2026-10-18.md). Historical B1 INCONCLUSIVE result remains as research, not current architecture. Code not yet implemented.

## Existing architecture

- Mercur 2.3.7 / Medusa 2.21.2 are the installed baseline declared by ARCHITECTURE.md and pinned in API package manifests.
- The existing dogruadresAccess service holds Person/ActorMapping/Organization/Membership/Invitation/shared AuditEvent, with fail-closed project authorization.
- Its request helper currently accepts only organization.read, membership.list, membership.manage and invitation.manage; it DOES NOT implement any vehicle action. Extending the policy requires explicit action definitions and regression tests; never assume existing membership.manage grants Vehicle write rights.
- SECURITY.md explicitly warns that future Vehicle routes are not currently covered by Foundation request scopes.
- The accepted ADR-0002 reserves automotive domain records for DoğruAdres project modules and discourages arbitrary Mercur metadata or changes to upstream internals.

## Proposed design (not yet authorized implementation)

### Module and physical ownership

**ADR-0005 mandatory standalone module:** Vehicle domain persistence, models, service and migrations belong in separately registered dogruadresVehicle. Identity/Organization, Membership/Invitation and canonical AuditEvent remain in dogruadresAccess. Vehicle may NOT be registered inside the Access module merely as an internal service. Keep marketplace Mercur primitives separate.

Proposed logical Vehicle attributes:

| Attribute | Semantics | Approval boundary |
| --- | --- | --- |
| id | Stable Vehicle ID | Implementation design |
| organization_id | Single immutable Organization ownership reference | APPROVED DA-AUTO-006 / V-06 |
| plate_display, plate_key | Visible plate and normalized uniqueness key | APPROVED principle; exact algorithm OPEN |
| vin_display, vin_key | Visible VIN/chassis and normalized uniqueness key | APPROVED principle; exact algorithm OPEN |
| label | Optional user-facing short name | APPROVED V-05 |
| make, model, model_year | Optional manual descriptive data; no canonical catalog assumption | APPROVED V-05, exact validation OPEN |
| created_at, updated_at, deleted_at | Lifecycle fields | Implementation proposal / V-03 soft delete |

No creator ownership field, no creator attribution in arbitrary Vehicle metadata, and no Organization transfer field/action. Display fields never replace canonical uniqueness keys.

Propose two distinct partial unique constraints for (organization_id, plate_key) and (organization_id, vin_key), restricted to non-deleted rows and non-empty normalized values. Also enforce V-01 through consistent application validation and an appropriate database-level invariant when feasible; decide the concrete null/empty representation and generated normalized key population together. Verify behavior during concurrent create AND concurrent update, not only sequential requests.

**Reference/transaction boundary:** Vehicle and Organization are distinct physical modules. Vehicle.organization_id references the server-validated immutable Organization identifier, not a cross-module ORM relationship by assumption. Use officially supported links, Query, workflows and explicit permissions. The direct B1 Vehicle EntityManager forwarding method failed with DaAuditEvent metadata error and is NOT approved; physical cross-module audit consistency is still an unresolved security/design gate.

### N-01/N-02 approved P1 and C1 canonicalization profiles — 2026-10-18

**Decision status:** P1 plate and C1 VIN/chassis input/equality profiles APPROVED for the *first* manual Vehicle MVP. International plates, broader alphabets and external VIN validation are excluded, not silently supported. An identifier equality key proves neither legal plate validity nor physical vehicle identity.

**P1 plate pipeline:** Validate original code points against ASCII A-Z/a-z/0-9, ordinary ASCII space U+0020, NBSP U+00A0 and ASCII hyphen-minus U+002D ONLY. Reject unsupported Unicode (including Turkish dotted/dotless I, fullwidth forms, zero-width/bidi/control characters), slash, dot, underscore, newline/tab, en-dash and non-approved spaces; NEVER transliterate, locale-fold or NFKC-transform. Retain accepted meaningful display text separately. Form canonical plate_key with ASCII-only uppercasing and deletion of ONLY U+0020, U+00A0 and U+002D. A separator-only plate gives a missing/null key, not an empty index string. No plate registration pattern or province code validation.

| Plate input | P1 result |
| --- | --- |
| 34 ABC 123, 34ABC123, 34-ABC-123, 34 abc 123 | SAME key 34ABC123 |
| 34 + U+00A0 + ABC + U+00A0 + 123 | SAME key 34ABC123 |
| only approved spaces/NBSP/hyphens | missing/null key |
| 34/ABC/123, 34 + en-dash + ABC123 | REJECT |
| 34İBC123, 34ıBC123, fullwidth ABC, embedded U+200B | REJECT |
| tab/newline inside, unsupported whitespace | REJECT |
| 34 | key 34; no official plate validity asserted |

**C1 VIN/chassis pipeline:** Remove ONLY leading/trailing ASCII U+0020 spaces. After trimming, accept ASCII letters/digits and literal ASCII hyphen-minus U+002D, dot U+002E and slash U+002F. Uppercase ASCII letters only, PRESERVE those punctuation marks. Reject *internal* ASCII spaces, NBSP, tabs/newlines, Unicode lookalikes, other punctuation or invisible characters. No 17-character mandatory length, no VIN check digit, no OEM lookup, no I/O/Q ban and no legal/authenticity assertion.

| VIN/chassis input | C1 result |
| --- | --- |
| wvwzzz1jzxw000001, WVWZZZ1JZXW000001 | SAME key WVWZZZ1JZXW000001 |
| leading/trailing ASCII spaces around value | same trimmed key |
| AB-123, AB.123, AB/123, AB123 | FOUR DIFFERENT keys, punctuation preserved |
| AB 123, AB + NBSP + 123, fullwidth letters, U+200B inside | REJECT |
| ASCII-space-only input | missing/null key |
| I0OQ1 | key I0OQ1; no modern-VIN validity assertion |

The test fixtures must use REAL Unicode code points matching the U+XXXX representations, not the literal five-character text. For both profiles: effective missing values are stored as NULL, and BOTH identifiers missing violates V-01. Live partial unique indexes on (organization_id, plate_key) and separately (organization_id, vin_key) must enforce concurrent writes with deleted_at IS NULL. Soft-deleted identifiers may be reused. Keep normalization contracts versioned; future broader profiles require migration and collision review.

**Implementation technical details still OPEN:** maximum string lengths, optional label/make/model/model-year validation limits, handling of malformed separator-only supplied fields when VIN exists, PATCH null/empty behavior, API errors/pagination/deleted-resource responses and migration mechanics. No product-meaningful equivalence can be changed without approval.

### Deletion/reuse boundary

Soft delete removes Vehicle from ordinary list/detail and from LIVE uniqueness constraints, but preserves historical audit and record identity. A newly registered Vehicle may reuse the deleted row's normalized identifier. This MUST NOT grant automatic restore or mutate history; restore, retention duration, legal deletion, and conflict resolution for any future undelete are future decisions. Define read-after-delete response semantics before implementation.

### Proposed API contract (review before coding)

| Operation | Suggested route | Approved role behavior |
| --- | --- | --- |
| List | GET /dogruadres/organizations/:id/vehicles | Active Owner/Admin/Member |
| Create | POST /dogruadres/organizations/:id/vehicles | Active Owner/Admin/Member |
| Detail | GET /dogruadres/organizations/:id/vehicles/:vehicle_id | Active Owner/Admin/Member |
| Update | PATCH /dogruadres/organizations/:id/vehicles/:vehicle_id | Active Owner/Admin/Member |
| Soft-delete | DELETE /dogruadres/organizations/:id/vehicles/:vehicle_id | Active Owner/Admin ONLY |

All routes authenticate real Medusa actor context, map it to Person and active Organization membership, resolve policy at request time, and use the server-resolved Organization scope. Detail/update/delete MUST resolve the stored Vehicle's actual Organization ownership, not trust the route parameter. Reject client-supplied owner/organization changes and creator fields through strict validators. No platform-user bypass of private Organization access. Policy and routes are proposed physical structure, not permission to code yet.

### Transactional audit architecture gate

**Current ADR-0006:** The canonical Vehicle audit trail MUST be inside the independently registered dogruadresVehicle module, using a VehicleAuditEvent and durable VehicleAuditOutbox committed atomically with each Vehicle mutation. Foundation's da_audit_event remains Foundation-owned ONLY. The independent dogruadresAuditIndex presents the authorized combined timeline. Vehicle action labels such as vehicle.created/updated/deleted are proposed event contract details subject to technical review.

CRITICAL GATE NOW ADR-0006: independent Vehicle mutation + its OWN VehicleAuditEvent + its OWN durable VehicleAuditOutbox MUST be proven atomic locally. Direct Vehicle writes into Access AuditEvent are no longer required. Independently registered central AuditIndex must accept only authorized redacted projections via reliable idempotent delivery, with proof of retries, failures and replay. Existing B1 remained INCONCLUSIVE; it is no longer the selected integration.

### Historical Vehicle-0B shared-Access-audit proof (INCONCLUSIVE; no longer an active implementation gate)

The earlier Product Owner approved a narrow disposable B1 feasibility test. It was run and classified INCONCLUSIVE due to missing DaAuditEvent metadata. This historical cross-module shared-Access-table approach has been replaced by ADR-0006: source-local audit/outbox with reliable projection. The B1 proof is retained for evidence only; it is NOT required or authorized to be rerun as part of the new plan.

Verified version-matched sources:
- Mercur v2.3.7 thin-modules rule: https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/modules.mdx — module owns its own tables, no cross-module service dependency.
- Mercur v2.3.7 module links: https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/module-links.mdx — links and Query are not raw same-transaction promises.
- Mercur v2.3.7 workflows: https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/workflows.mdx — compensation of completed steps is not an atomic PostgreSQL rollback.
- Medusa v2.21.2 @InjectTransactionManager: https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/utils/src/modules-sdk/decorators/inject-transaction-manager.ts — reuses an existing context.transactionManager or starts its own repository transaction. This alone does not show that two independent module repositories share the same connection.
- Medusa v2.21.2 @InjectManager: https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/utils/src/modules-sdk/decorators/inject-manager.ts — forwarded context also is not cross-module atomicity proof.

**Historical alternatives, NOT current instructions:** B1 directly forwarded Vehicle's manager to Access and failed at entity metadata; B2 remained unproven; C physical co-location was expressly revoked and ADR-0004 Superseded; D trigger coupling was not selected. ADR-0005 standalone modules and ADR-0006 local audit/outbox + independent central index are CURRENT accepted instructions.

**Historical B1 proof protocol:** The earlier isolated proof recorded physical transaction identity and rollback attempts, but audit INSERT failures were masked by ORM metadata error. No B1 PASS was proven. Future proof guardrails are AUD-01–AUD-16 in the current [audit-first plan](audit-first-architecture-and-delivery-2026-10-18.md), testing source-local audit and outbox atomicity, independent index idempotency, outage recovery and authorization on a separately authorized disposable database.

**Current proof gate:** Future Vehicle development must pass Vehicle-local mutation + VehicleAuditEvent + VehicleAuditOutbox atomic rollback, and source-to-index durable/idempotent/replayable delivery plus current-policy authorization. Physical Vehicle-to-Access audit insert or B1 rerun is not required under ADR-0006; no blanket Vehicle-1/production approval is implied.

## Vehicle-0C — B1 Evidence, B2 Contract Review and C Candidate

[Vehicle-0C research](vehicle-0c-atomicity-architecture-review-2026-10-18.md) is historical and preserves the INCONCLUSIVE B1 proof. Its C recommendation was expressly rejected, ADR-0004 is Superseded, and [ADR-0005](../adr/ADR-0005-mandatory-independent-physical-domain-modules.md) controls. Future Vehicle work MUST use a standalone physical module. The historical cross-module Access-audit blocker is bypassed by ADR-0006 local audit ownership; SOURCE-LOCAL atomicity and the independent central index transport/security remain the current implementation/acceptance gates.

## Mercur extension points involved

Proposed project-owned modules, explicit HTTP routes and request middleware, Medusa workflows, supported query or module-link facilities where required. Specific Mercur/Medusa extension API names and cross-module transaction facilities are not accepted until validated against installed 2.3.7 / 2.21.2 documentation and source. Consult installed node_modules/@mercurjs/docs/llms.txt and relevant MDX files before writing code.

## Files and components affected (prospective only)

- packages/api/src/modules/dogruadres-vehicle/ — NEW independent physical Vehicle Medusa module owning Vehicle, VehicleAuditEvent and VehicleAuditOutbox, with its own service/metadata/migrations.
- packages/api/src/modules/dogruadres-audit-index/ — NEW independent infrastructure/read-model module for derived audit index, checkpoints and replay; initial delivery dependency.
- packages/api/src/api/dogruadres/ — Organization-scoped Vehicle routes and explicit authentication middleware.
- packages/api/src/utils/ or project access layer — explicit vehicle.read/create/update/delete policy extension.
- packages/api/src/workflows/ — bounded mutations and audit orchestration.
- packages/api/integration-tests/ — isolated native authenticated HTTP, persistence and concurrency regressions.
- Organization-facing UI in an approved dashboard/workspace — separate checkpoint after backend acceptance.
- Versioned project migrations and bounded CI checks — separate authorized tasks.

No files in this plan are already implemented.

## Data and migration impact

New Vehicle persistence and separate live partial unique indexes are expected to require a new project-owned migration. No migration or schema changes are authorized by this document. Before Vehicle-1, approve an exact schema, deletion/index semantics, input policy and safe disposable test database. No original development DB, protected volume, staging or production DB may be mutated without explicit target-specific authorization.

## Security impact

- Active membership is checked every request with the actual Organization resource owner verified server-side.
- Member can read/create/update but cannot delete; revoked actor, unrelated Organization actor, unmapped identity and platform-only user are denied.
- Never use email matching to merge People or silently permit a Store role to grant Organization access.
- Recheck membership and scope at the transaction's meaningful authorization point to address revoke-vs-mutation races; document the intended linearization semantics.
- Audit actor attribution is server-owned, confidential, persisted consistently with domain mutation and covered by a forced-failure rollback test.
- No file/search/export surfaces exist in MVP, so they must not be represented as already protected.

## Upgradeability impact

Automotive domain code must remain in project-owned boundaries and use installed supported Mercur/Medusa extension points. Do not change upstream Mercur/Medusa or introduce a new provider/framework by default. Revalidate module links, workflow and transaction contracts during upgrades according to UPGRADE-POLICY.md.

## Risks and open questions

1. **BLOCKING technical acceptance gate (ADR-0006):** Vehicle-local audit/outbox and domain mutation must prove atomicity; source-to-central-index delivery/replay/idempotency and authorization require real isolated persistence tests. Cross-module physical Access audit write is not the selected design.
2. **APPROVED N-01/N-02 scope; remaining validation details:** P1/C1 algorithms and Unicode refusal are approved. Max lengths, auxiliary/year bounds, PATCH/error semantics and normalization-version migration still require precise design.
3. **Implementation contract to finalize:** pagination, deleted-record HTTP responses, update/empty-value semantics, error codes and any Organization inactive handling.
4. **Future deferred:** restore, retention, Organization transfer, attachments, branch-level access, Quotations, OEM providers, automatic fitment and integrations.
5. **Evidence:** untested Vehicle authorization, database concurrency and authenticated UI remain NOT ASSESSED until actually executed.

## Implementation steps (prospective, separate approval gates)

1. **Vehicle-0:** Record V-01–V-07 product decisions and this proposed design plan; Technical Consultant validates documentation, remaining gates and branch diff. No code, migration or runtime work.
2. **Vehicle-0B (N-01/N-02 approved; audit proof pending):** Record P1/C1 example vectors, consult exact Mercur/Medusa source, then run only approved disposable isolated transaction feasibility probe if safe. Preserve raw DB evidence and stop for consultant evaluation; do not infer architecture acceptance.
3. **Vehicle-1:** Upon separate approval, implement Vehicle backend model, migrations, scoped API and policy, database uniqueness, transactionally atomic audit and targeted unit/native HTTP regression tests in a dedicated feature branch/review checkpoint.
4. **Vehicle-2:** Upon separate approval, implement the authenticated Organization-facing manual UI and real-browser E2E regression evidence.
5. **Vehicle-3:** Consolidate CI, integration/security evidence and risk review; obtain explicit Product Owner merge approval. Deployment, production migrations and Vehicle scope expansion remain separate.

## Acceptance test matrix (prospective, not yet executed)

| ID | Scenario | Expected persisted/HTTP result |
| --- | --- | --- |
| VEH-01 | Active member creates a Vehicle in Org A | Owned by A, actor-specific shared audit |
| VEH-02 | Newly active member reads earlier Org vehicles | Succeeds if current policy allows |
| VEH-03 | Creator leaves/revoked | Vehicle retained; subsequent access denied |
| VEH-04 | A member lists B vehicles | Denied; no cross-Org count leak |
| VEH-05 | A member requests B's Vehicle ID | Denied without disclosing private metadata |
| VEH-06 | A member updates/deletes B Vehicle | Rejected and persisted B state unchanged |
| VEH-07 | Active Member creates/updates own Org Vehicle | Succeeds and audited |
| VEH-08 | Active Member attempts delete | Rejected |
| VEH-09 | Owner/Admin deletes | Soft-deleted; historical audit preserved |
| VEH-10 | Sequential duplicate normalized plate in same Org | Rejected |
| VEH-11 | Sequential duplicate normalized VIN in same Org | Rejected |
| VEH-12 | Same normalized plate/VIN in different Orgs | Both succeed |
| VEH-13 | Concurrent create using same Org+plate | At most one live row; DB constraint proven |
| VEH-14 | Concurrent update of different vehicles to same Org+VIN | Conflict safely rejected; existing data unchanged |
| VEH-15 | Update frees normalized key, then reuse | Succeeds according to live-only rule |
| VEH-16 | Client supplies different Organization/owner/creator field | Schema rejects; server ownership unchanged |
| VEH-17 | Unmapped actor or revoked membership | Fail closed |
| VEH-18 | Platform user lacking Organization membership | No private Vehicle access |
| VEH-19 | Targeted audit write failure | Vehicle mutation rolled back; no misleading persisted audit |
| VEH-20 | Inspect successful audit records | Correct actor, Org, resource, action, permitted values |
| VEH-21 | Disable/omit OEM and AI | Manual CRUD remains functional |
| VEH-22 | Deleted Vehicle identity and identifier reuse | Hidden from active reads; key reusable per approved rule |
| VEH-23 | Both plate and VIN empty | Rejected on create/update |
| VEH-24 | Same Person, different roles in Orgs A/B | Independent resource permissions |
| VEH-25 | Revocation races with mutation | Approved linearization/transaction rule enforced |
| VEH-26 | Authentication absent/client context spoofed | Rejected; no mutation |
| VEH-27 | P1/C1 Unicode, separators and canonicalization | PASS only on exact approved vectors above, including Unicode rejection |
| VEH-28 | Authenticated Organization UI browser flow | Create/list/detail/edit/delete permissions demonstrable |

Require HTTP response assertions AND persistent DB evidence for security/concurrency/rollback cases. Do not use test skips as passing evidence. CI static/build success does not imply native HTTP or browser/E2E completion.

## Verification of this documentation checkpoint

- Compare V-01–V-07 against the explicit Product Owner approval and preserve original DA-AUTO-006 invariants.
- Confirm original controlled baseline decision categories, requirement IDs and historical implementation markers are unchanged.
- Ensure the plan is labelled proposed/implementation not authorized and that open technical gates remain visible.
- Check only REQUIREMENTS.md, this plan and the plans index changed; review diff and whitespace.
- Do not execute tests, migrations, builds, or start services for documentation-only updates.

## Rollback

For documentation-only errors, use a reviewed forward correction on the review branch; do not force-push or rewrite history. Application rollback is not applicable because this checkpoint changes no code or data. Later migrations require a separately authorized recovery and backup plan; do not treat destructive down migrations as safe automatic rollback.

## Approval status

V-01–V-07 and N-01/P1/N-02/C1 remain APPROVED; ADR-0005 mandates a standalone Vehicle module, while ADR-0006 accepts Vehicle-owned atomic audit/outbox and independent central index from first release. Foundation history is preserved. Actual code, data migrations, proof and CI/index integrations have NOT been implemented by this documentation step; separate bounded checkpoints and merge/deployment approvals apply.

