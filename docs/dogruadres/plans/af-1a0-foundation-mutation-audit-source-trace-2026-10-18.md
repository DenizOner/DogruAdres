# AF-1A0 — Foundation mutation, transaction, audit and race-condition source trace

- Review date: 2026-10-18
- Status: READ-ONLY source analysis COMPLETE for the five public security mutations in merged main; runtime failures/atomicity across every path NOT VERIFIED.
- Immutable source: [main d87ba52f99f74d7fec52af70a815fe91a989fc3f](https://github.com/DenizOner/DogruAdres/tree/d87ba52f99f74d7fec52af70a815fe91a989fc3f).
- Mercur 2.3.7 / Medusa 2.21.2; official Mercur source: https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/modules.mdx ; Medusa transaction contract: https://docs.medusajs.com/learn/fundamentals/modules/db-operations.
- No code, Git history, migration, protected database, server or deployment changes from this review. This is an AF-1A0 planning evidence record only.

## Five Foundation mutation paths

| # | API and workflow | Transactional domain operations in dogruadresAccess service | Source audit action(s) | Evidence and remaining gate |
| --- | --- | --- | --- | --- |
| A0-01 | POST /admin/dogruadres/organizations → provisionOrganizationWorkflow → service.provisionOrganization (service.ts 170–232) | Initial actor Person/ActorMapping creation if absent under deterministic advisory locks; createOrganization; createMemberships for protected Owners | organization.provisioned + one organization.owner_assigned per membership; createAuditEvents at service.ts 203 | @InjectTransactionManager and sharedContext used. Need injected audit failure, actor-mapping/membership failure and PostgreSQL persisted-row verification for ALL affected rows, plus duplicate/owner-list concurrency |
| A0-02 | POST /dogruadres/organizations/:id/memberships/:membership_id → changeMembershipWorkflow → service.changeMembership (234–299) | Organization advisory owner-change lock, membership tuple lock, re-read actual actor role and target, protect last active Owner, updateMemberships | organization.membership_changed (284) | Re-check under lock is good precedent. Test fault rollback, Owner demotion races, target-org isolation, revoked member denial after concurrent role transitions |
| A0-03 | POST /dogruadres/organizations/:id/invitations → createInvitationWorkflow → service.createOrganizationInvitation (301–343) | Check active Owner/Admin membership, Organization + Person, create pending hashed invitation, replace token hash with HMAC-derived token hash, create audit | organization.invitation_created (329) | Service checks membership inside transaction BEFORE write, but does not serialize/re-check authorization against CONCURRENT membership revocation. Risk TOCTOU, not exploit proven. Test this race and invitation-audit forced insert failure. No mail provider implemented |
| A0-04 | DELETE /dogruadres/organizations/:id/invitations/:invitation_id → revokeInvitationWorkflow → service.revokeOrganizationInvitation (345–373) | Check active Owner/Admin membership; lock target invitation; re-read invitation state; update to revoked; create audit | organization.invitation_revoked (358) | Invitation state re-check/lock present; actor membership NOT re-checked after locking invitation. Test revocation-vs-permission-removal and audit-insert rollback |
| A0-05 | POST /dogruadres/invitations/accept → acceptInvitationWorkflow → service.acceptOrganizationInvitation (375–445) | Route verifies authenticated email using Medusa auth identity/provider and verified email record; service validates token/invitation, locks invitation, creates actor Person/Mapping if absent, locks membership tuple, creates or reactivates membership, accepts invitation | organization.invitation_accepted (428) | Native HTTP file has targeted INSERT-failure rollback test for membership/invitation/audit (test starting ~434). Existing race/replay tests for concurrent acceptance (~354) and Person mapping. Email verification happens outside Foundation transaction by supported module isolation; verify external proof revocation scenarios without cross-module ORM hacks |

## Shared security/authorization boundaries

- Routes require Medusa actor auth middleware in `packages/api/src/api/middlewares.ts`. The `/admin` provisioning route requires platform `user`, not private Organization membership. Organization mutations use `requireOrganizationAccess` with canonical Person, active Organization membership, and policy resolution, plus service-level checks for active Owner/Admin before mutation.
- Organization/Membership/Invitation/Person/ActorMapping and `da_audit_event` all belong to one physical `dogruadresAccess` module. Methods pass `sharedContext` into generated repository/service methods; no cross-module audit manager must be introduced. Vehicle will own separate audit, per ADR-0006.
- `ensureActorPerson_` writes Person+ActorMapping within caller's transaction for provisioning and invitation acceptance. Those writes are covered by transaction rollback but are NOT separately emitted as a distinct `actor_mapping.created` audit action in reviewed source. Decide whether a specific actor mapping event is required, without changing canonical ownership silently.
- Existing audit event payloads contain actor reference and Organization, role, module, action, resource, target and allowlisted before/after fragments; no plaintext invitation token is written in inspected audit values. Audit/Invitation models still contain update/delete-capable columns: append-only policy remains a separate AF-1 technical design item.
- Existing source uses PostgreSQL advisory transaction locks for critical races and preserves last protected Owner; these must be tested under actual transaction/connection, not inferred from comments.

## Existing test evidence and limitations

- `packages/api/integration-tests/http/dogruadres-foundation.native.test.mjs` contains real database tests, including explicit `BEFORE INSERT` fault trigger for `organization.invitation_accepted` and assertions proving expected rollback of membership/invitation plus no audit (lines ~434–482), and concurrent Owner/invitation tests.
- This suite is bound to a HISTORICAL G1 isolated PostgreSQL container, port and name. Do NOT run it against any active original/G1 database or simply bypass its DB guard. Rehost/reparameterize and run only with an independently authorized, task-owned disposable target.
- The Foundation PR CI `.github/workflows/identity-organization-foundation.yml` only syntax-checks native HTTP; it does NOT execute the real database suite. The previous local proof (if preserved) does not substitute for reproducible current commit CI evidence.
- Current source trace identified five decorated mutation operations and their audit calls; it did NOT independently prove all five rollback branches, audit outbox (absent) or production append-only DB protection.

## Targeted review findings and classification

| Finding | Classification | Evidence / next step |
| --- | --- | --- |
| A0-R1: Invitation create/revoke authorization vs simultaneous membership revocation | UNVERIFIED CONCURRENCY SECURITY RISK; prioritize before expanding Foundation mutation surface | Create deterministic race test: authorize inviter, pause before DB invitation write or after invitation lock, revoke actor membership concurrently; ensure subsequent unauthorized mutation is DENIED/rolled back, no audit created. Then recommend version-supported lock/authorization sequencing with no deadlock |
| A0-R2: Only invitation-accept targeted audit failure injection is present in native test | CONFIRMED COVERAGE GAP | Fault-inject each of remaining Organization provisioning, membership change, invitation creation and invitation revocation actions. Verify domain+audit absence via independent connection |
| A0-R3: No Foundation transactionally durable outbox yet | APPROVED NEW CAPABILITY NOT IMPLEMENTED | Plan additive source-owned outbox in AF-1A2 and idempotent backfill; separate Audit Index in AF-2. No direct Vehicle write into Access |
| A0-R4: AuditEvent soft-delete/update fields and destructive initial down migration | CONFIRMED HARDENING / RECOVERY RISK | Design append-only evidence safeguards and safe forward-only recovery in AF-1A1; never execute existing CASCADE down on protected data |
| A0-R5: Medusa public service helper methods with sharedContext but no explicit @InjectManager | CONTRACT-COMPATIBILITY REVIEW, not proven bug | Check installed version's decorator/runtime behavior before changing helper decorators; current calls pass context through generated methods. Medusa docs recommend @InjectManager for public manager-consuming methods, but no blind code rewrite |
| A0-R6: Full native HTTP test target hardcodes G1 DB inventory | CONFIRMED TEST PORTABILITY / SAFETY GAP | Non-destructive isolate-aware test harness needed; before any disposable DB operations get exact task-scoped authorization |

## AF-1A0 sign-off / next checkpoint gates

1. **AF-1A0 source trace finished**: five paths identified, audit action map and specific risks recorded.
2. **Local checkout freshness NOT VERIFIED by GitHub inspection**. Before an engineering Agent runs ANY implementation or test command, execute the [non-destructive local Git preflight](local-repository-freshness-preflight-2026-10-18.md) and report READY/BLOCKED plus all SHA evidence. Don't assume the user-owned Windows worktree is clean or on the intended branch.
3. **AF-1A1/AF-1A2 not yet started**: exact schema/immutability/outbox, permission race resolution and scoped disposable proof require future bounded code proposal and independent review. Do not conflate documentation acceptance with migration or production authorization.
