---
name: browser-acceptance-evidence
description: Executes or plans isolated real-browser and server-state acceptance checks for approved DoğruAdres user journeys. Use for M0 B01–B21 acceptance and when distinguishing Playwright tooling smoke tests from product E2E evidence.
---

# Real browser acceptance evidence (DoğruAdres E2E Doğrulama)

Read root `AGENTS.md` (§13), [#147](https://github.com/DenizOner/DogruAdres/issues/147), the exact B01–B21 scenario Issue, and current environment ownership. A synthetic Chromium/Playwright smoke test is **NOT** a DoğruAdres user-journey PASS.

In the **Lead Agent + Subagents** architecture, mutating real-browser interactions and E2E acceptance suites are executed by the **Test ve Doğrulama Alt Ajanı (QA & Verification Subagent)** on isolated resources. The **Bağımsız Denetçi Subagent** remains strictly read-only and verifies the recorded test evidence.

## Verification Protocol

1. **Environment & Resource Isolation:** Verify exact source HEAD, running UI/API origin and service version, Chrome/Playwright context, trusted HTTPS/certificate, active process/port owner, synthetic actor/organization fixtures, and *isolated* task-owned PostgreSQL/Redis database ([#229](https://github.com/DenizOner/DogruAdres/issues/229)). If any resource or permission is unverified, stop mutating actions and report `ENVIRONMENT BLOCKED`.
2. **Authorized Scenarios Only:** Test only the authorized scenario: real browser click/input/navigation, permitted and forbidden actor/tenant cases, refresh/reopen/session boundaries, visible UI outcome plus server HTTP and database persistence evidence. Two independent personas require independently isolated browser contexts, not a shared cookie jar.
3. **Data Protection & Sanitization:** Record sanitized screenshots/log references and exact fixture/database scope **outside public GitHub** when sensitive; publish only a redacted evidence summary, test commands, outcomes, and relevant references. Never leak tokens, credentials, or personal data.
4. **Evidence Standard:** For each criterion record `PASS`, `FAIL`, `NOT TESTED`, or `ENVIRONMENT BLOCKED`. Clearly differentiate tooling startup health, pure unit mocks, API contracts, persistence, and actual product E2E. A subset of passing checks never constitutes a whole M0 module PASS.
5. **Resource Hygiene:** Never overwrite a dirty worktree, silently create or drop databases, run migrations/seeds in an unknown environment, prune Docker volumes, or relax browser TLS checks. Enforce one mutating owner per task DB.

If no approved, isolated, functioning environment is available, produce the smallest safe readiness plan and mark functional journeys `NOT TESTED / ENVIRONMENT BLOCKED`.
