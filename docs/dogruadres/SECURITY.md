# DoğruAdres security policy

This document is intentionally project-specific. It does not duplicate generic OWASP guidance.

## Mandatory rules

- keep secrets and environment values local; never commit `.env` files or credentials
- treat authentication and authorization as explicit architecture decisions
- enforce seller isolation and offer ownership boundaries in code and workflows
- enforce price integrity and prevent unauthorized pricing behavior
- treat user-controlled pricing as a security and business-rule boundary, not a trivial input issue
- protect payment and payout logic behind explicit approval gates
- validate external integrations and isolate failures from critical core flows
- restrict file uploads and external content handling to approved flows
- track dependency vulnerabilities and review them during upgrades
- avoid sensitive logging of secrets, payment data, or personal customer information
- maintain enough auditability for security-sensitive actions and data mutations
- handle destructive operations with explicit approval and rollback planning

## DoğruAdres identity and Organization foundation

- Map a verified Medusa actor to one project-owned canonical Person by an explicit unique actor-type/actor-ID mapping; email equality never links identities.
- Treat Organization, membership, Mercur Seller, Store and Mercur Member as distinct records. Resolve active membership and required policy on every request; use the Organization ID resolved by the server to scope access.
- Fail closed if actor mapping, Organization, membership, policy or resource scope is missing, ambiguous or unavailable. Revoked membership takes effect on the next authorization request; the foundation does not cache authorization decisions.
- Organization provisioning and initial protected Owner assignment require the authenticated platform `user` route. Ordinary membership changes cannot demote or revoke the last active protected Owner.
- Invitation tokens are single-use, expire after seven days, can be revoked before acceptance and are persisted only as a cryptographic hash. Acceptance requires an authenticated actor and an existing verified Medusa email record matching the invitation recipient. The plaintext link is returned only once from the protected create-invitation response; it is not written to audit values.
- A revoked membership cannot be reactivated or role-managed through the ordinary membership endpoint. Only successful acceptance of a fresh valid invitation can reactivate it. Invitation email verification checks an authenticated email-type verification for the same authenticated identity; client-supplied email or verification flags are never authoritative.
- Invitation acceptance requires an existing non-deleted Medusa `email` verification with `verified_at` and an entity ID matching both the authenticated email and the single matching provider identity. This route-level proof is independent of the global `authVerificationsPerActor` login-enforcement policy; the foundation does not enable a global verification requirement or email delivery flow.
- Persist Organization, protected Owner, invitation and membership/role audit events in the same database transaction as the corresponding mutation. Audit values must not contain credentials or plaintext invitation tokens.
- These controls cover the Organization routes implemented in this checkpoint. They do not imply that background jobs, files, exports, search or future Vehicle routes are already scoped; those surfaces must use the same server-side policy before release.

## Approval rule

Any architecture change affecting auth, authorization, payment behavior, seller isolation, or security boundaries requires external approval before implementation.

## Binding Vehicle authorization Policy A

Authority: Product Owner Architecture Consolidation R0; see ADR-0007. **L is the MVCC snapshot acquisition point of the final Foundation-owned coherent authorization SELECT, after the required Organization-scoped Vehicle lock/read and before the first Vehicle mutation.** For a successfully validated READ COMMITTED statement on the authoritative primary, revocation committed before L must be observed and deny access. Revocation committed after L may overlap the already-authorized operation and does not retroactively cancel it. This is snapshot-based ordering, not commit-time fencing.

Each operation requires a fresh final decision. Cached decisions, the Q2 non-atomic observer, a prior request, workflow retry/replay or a serialized attribution object cannot substitute. The decision must coherently validate exactly one actor mapping, enabled Person, active Organization, exactly one active membership and the current action/role; no platform-operator bypass. Authoritative actor, Person and role attribution must come from this same decision.

The trusted application/workflow sequence is: verified authentication → Vehicle-owned scoped lock/read → fresh Foundation coherent decision at L → resource-dependent evaluation → Vehicle mutation plus one canonical Vehicle audit and one durable outbox in one Vehicle transaction → commit/rollback → asynchronous derived Index delivery. Do not disclose resource-dependent missing/no-op/validation results before final authorization. No Foundation manager enters Vehicle; no Vehicle manager/context enters Foundation. No cross-module shared transaction or hidden module callback dependency.

The existing Vehicle mutation gate remains closed until real framework, persistence and security tests pass independent review. Query caching, primary routing, ambient context separation, statement isolation, cancellation and request/replay boundaries require explicit evidence. Fail closed on uncertainty. Preserve existing Organization isolation, actor validation, role restrictions and source audit attribution. Never accept an HTTP-supplied authorization decision, manager or role as authority.
