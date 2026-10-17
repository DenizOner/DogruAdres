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
