# DoğruAdres — GitHub Actions browser automation boundary

**Only GitHub Actions standard free runner; no paid model API, external E2E SaaS, local Agent requirement, real user credential, or production DB.**

`.github/workflows/governance-automation.yml` runs a real Playwright+Chromium **TOOLING SELF-TEST** for an in-memory synthetic HTML form on scoped PRs or manual dispatch. It deliberately does not assert **any** DoğruAdres feature, authentication, authorization, actual deployment, B01–B21 scenario, Medusa HTTP route, PostgreSQL, audit or outbox state.

## Product E2E acceptance: currently NOT TESTED by this workflow

Do not call this project user acceptance or add this job as an M0 release gate. A separate reviewed addition under the existing M0 #147 matrix is required, **without modifying application logic in this governance branch**:

1. Run under an ephemeral, GitHub-hosted **task-owned** app/UI/Medusa/PostgreSQL/Redis environment with exact PR HEAD and base SHA, pinned dependencies and disposable secrets. Never target the user's localhost, shared Docker volumes, production, actual accounts or Gmail.
2. Set up validated synthetic actor/role/organization/recipient fixtures and safe teardown; prove the DB and API target are the exact one launched by this run. Preserve negative cases for unauthorized org/role scope, replay, expiry, revocation and leak-safe errors.
3. Use Playwright to perform the **real frontend navigation and user interactions**, refresh/reopen checks and UI assertions, and cross-check real HTTP status and DB/audit/outbox state independently. Do not replace these with mocked routes, unit tests or the synthetic tooling test.
4. Tie each implemented journey directly to the existing canonical B01–B21 Issue; report PASS, FAIL, BLOCKED or NOT TESTED **per scenario** with run URL, exact SHA, isolated target and evidence origin. A global green workflow never turns 21 scenarios green automatically.
5. Upload only redacted non-sensitive artifacts where strictly needed; screenshots/traces/session storage may expose cookies, invitation tokens or private data and must **not** be automatically uploaded in the public repository.
6. SMTP-to-real-inbox or third-party integrations are separate acceptance dependencies: a stubbed/synthetic email transport cannot certify genuine end-to-end delivery. Escalate only that blocked check, not unrelated product work.

**Implementation dependency:** current `main` has no reproducible runner-side application bootstrap + role fixture + genuine browser acceptance contract. Active M0 delivery continues independently on PR #227 and #147. Once a *bounded* M0 vertical flow and suitable test fixture are accepted, add its genuine CI journey in a separately reviewed PR. Do not infer that the harness proves this today.

**GitHub Free safety:** this workflow uses standard `ubuntu-24.04`; avoid unnecessary artifacts, elevated tokens, `pull_request_target`, paid services, cross-branch writes or local cleanup. Observe Issue #211 and root AGENTS.md.
