---
name: browser-acceptance-evidence
description: Executes or plans isolated real-browser and server-state acceptance checks for approved DoğruAdres user journeys. Use for M0 B01–B21 acceptance and when distinguishing Playwright tooling smoke tests from product E2E evidence.
---

# Real browser acceptance evidence

Read root `AGENTS.md`, [#147](https://github.com/DenizOner/DogruAdres/issues/147), the exact B01–B21 scenario Issue and current environment ownership. A synthetic Chromium/Playwright tooling test is **NOT** a DoğruAdres user-journey PASS.

1. Verify exact source HEAD, running UI/API origin and service version, Chrome/Playwright context, trusted HTTPS/certificate, active process/port owner, synthetic actor/organization fixtures and *isolated* PG/Redis/database owner. If any resource or permission is unknown, stop mutating actions and report `ENVIRONMENT BLOCKED`.
2. Test only the authorized scenario: real browser click/input/navigation, permitted and forbidden actor/tenant cases, refresh/reopen/session boundaries, visible outcome plus server HTTP and persisted state evidence where required. Two independent people require independently isolated browser contexts, not a shared cookie jar.
3. Record sanitized screenshots/log references and exact fixture and database scope **outside public GitHub** when sensitive; publish only a redacted evidence summary, test commands, outcomes and relevant references. Do not leak tokens, credentials or personal data.
4. For each criterion record `PASS`, `FAIL`, `NOT TESTED` or `ENVIRONMENT BLOCKED`. Differentiate tooling health, pure unit mock, API, persistence and actual product E2E. A subset never makes the whole M0 module PASS.
5. Never overwrite a dirty worktree, silently create or delete a DB, run migrations/seeds in an unknown environment, prune Docker volumes or relax browser TLS checks. Coordinate one mutating owner per task DB.

If no approved, isolated, functioning environment is available, produce the smallest safe readiness plan and leave functional journeys NOT TESTED.
