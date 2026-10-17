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

## Approval rule

Any architecture change affecting auth, authorization, payment behavior, seller isolation, or security boundaries requires external approval before implementation.
