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

## Existing architecture

- Mercur 2.3.7 / Medusa 2.21.2 are the installed baseline declared by ARCHITECTURE.md and pinned in API package manifests.
- The existing dogruadresAccess service holds Person/ActorMapping/Organization/Membership/Invitation/shared AuditEvent, with fail-closed project authorization.
- Its request helper currently accepts only organization.read, membership.list, membership.manage and invitation.manage; it DOES NOT implement any vehicle action. Extending the policy requires explicit action definitions and regression tests; never assume existing membership.manage grants Vehicle write rights.
- SECURITY.md explicitly warns that future Vehicle routes are not currently covered by Foundation request scopes.
- The accepted ADR-0002 reserves automotive domain records for DoğruAdres project modules and discourages arbitrary Mercur metadata or changes to upstream internals.

## Proposed design (not yet authorized implementation)

### Module and physical ownership

A dedicated project-owned Vehicle domain module is the recommended logical home for Vehicle state, for example dogruadresVehicle (final identifier is a technical design choice). Keep Organization/Person/Membership and the existing audit model under dogruadresAccess; do not duplicate identity or permission authority inside Vehicle.

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

Because the existing Organization module and a dedicated Vehicle module are distinct boundaries, do not assume that a direct ORM relation, physical cross-module FK, module link or transaction sharing is supported. Inspect the installed version-matched Mercur documentation and Medusa 2.21.2 source/contracts, then choose a supported reference-integrity and module-integration strategy. Never weaken the domain's Organization ownership because of a framework convenience limitation.

### Required resolution before backend implementation: V-02 canonicalization

Approval of canonicalization DIRECTION is not approval of an arbitrary implementation algorithm. Record a separate exact test-case table for: Turkish/other locale casing, Unicode normalization, whitespace types, dash and separator character set, leading/trailing spaces, case-folding, blank inputs, invalid control characters, VIN character policy, and persisted normalization-version stability.

Examples to evaluate: plate "34 ABC 123" vs "34ABC123"; VIN "wvwzzz1jzxw000001" vs "WVWZZZ1JZXW000001". These illustrate intended equivalence, not authorization to discard every punctuation or impose a universal 17-character VIN validation. Distinguish known formatting equivalences from collisions caused by overly aggressive normalization. Implement only after the final algorithm is explicitly approved.

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

The shared audit trail remains in dogruadresAccess. Proposed event actions: vehicle.created, vehicle.updated, vehicle.deleted; exact names and allowed before/after fields are technical design choices.

CRITICAL GATE: Do not assume a Medusa workflow compensation, cross-module call, or two service transactions equals a single PostgreSQL commit. Before selecting an architecture, verify version-matched module and transaction behavior and prove that a targeted audit insert failure leaves no committed Vehicle mutation. If supported single-transaction atomicity is impossible with isolated Vehicle and Access modules, present alternatives and trade-offs for Product Owner/Technical Consultant approval BEFORE implementing an eventually consistent substitute. Avoid secrets, identifiers that reveal other Organizations, and unnecessary personal data in audit values.

## Mercur extension points involved

Proposed project-owned modules, explicit HTTP routes and request middleware, Medusa workflows, supported query or module-link facilities where required. Specific Mercur/Medusa extension API names and cross-module transaction facilities are not accepted until validated against installed 2.3.7 / 2.21.2 documentation and source. Consult installed node_modules/@mercurjs/docs/llms.txt and relevant MDX files before writing code.

## Files and components affected (prospective only)

- packages/api/src/modules/ — new project-owned Vehicle module and model(s), subject to approval.
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

1. **BLOCKING technical gate:** shared cross-module audit atomicity and version-matched transaction support, including deterministic audit-failure rollback.
2. **BLOCKING product/validation detail:** exact normalized plate/VIN input and key algorithm; invalid/blank/Unicode behavior; length and year constraints.
3. **Implementation contract to finalize:** pagination, deleted-record HTTP responses, update/empty-value semantics, error codes and any Organization inactive handling.
4. **Future deferred:** restore, retention, Organization transfer, attachments, branch-level access, Quotations, OEM providers, automatic fitment and integrations.
5. **Evidence:** untested Vehicle authorization, database concurrency and authenticated UI remain NOT ASSESSED until actually executed.

## Implementation steps (prospective, separate approval gates)

1. **Vehicle-0:** Record V-01–V-07 product decisions and this proposed design plan; Technical Consultant validates documentation, remaining gates and branch diff. No code, migration or runtime work.
2. **Vehicle-0B (if needed):** Resolve exact normalization and cross-module audit strategy using version-matched official documentation and a strictly bounded non-production design/feasibility approval. Do not claim approved architecture when only options have been discussed.
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
| VEH-27 | Unicode and separator canonicalization cases | Exactly match separately approved algorithm |
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

V-01–V-07 and the manual Vehicle MVP product boundaries: APPROVED by explicit Product Owner acceptance in the current conversation. Exact schema/API/runtime implementation, module transaction architecture, validation parameters, migrations, CI, UI and deployment: NOT YET AUTHORIZED for coding or execution. This plan is a proposal for Technical Consultant and Product Owner review; it does not itself grant implementation permission.

