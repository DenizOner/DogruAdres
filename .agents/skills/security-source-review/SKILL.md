---
name: security-source-review
description: Runs evidence-based, risk-proportionate source security checks of DoğruAdres changes against applicable OWASP ASVS requirements. Use before security-sensitive implementation or during technical security review.
---

# Focused source security review

Follow root `AGENTS.md`, [#244](https://github.com/DenizOner/DogruAdres/issues/244) and the active scope/decision. OWASP is a selection tool, not a blanket compliance claim.

1. Establish exact commit and changed paths, real HTTP/Chrome/Medusa/Mercur execution flow, caller identity, organization ownership, server-side authority and mutations. Mark inaccessible source `NOT VERIFIED`.
2. Select only relevant ASVS 5.0 controls. Check BOLA/IDOR and role/tenant boundaries; sessions and cookies, CSRF, XSS/HTML escaping, injection, SSRF and external URLs; secrets and HTTP caching; privacy/non-enumeration; transaction/race/idempotency; dependencies and supply-chain integrity. Read affected full files, including negative/error paths, not only a diff excerpt.
3. For each concrete flaw determine severity, actor/resource, exact file/line/revision, preconditions, minimal fix and negative test. **Publish exact exploit-enabling paths or preconditions only in an authorized private advisory**, not public Issues/PRs; public coordination gets a redacted actionable blocker, owner and safe acceptance condition. Follow `.github/SECURITY.md`. Distinguish preexisting issues from PR-introduced risks.
4. Distinguish `SOURCE VERIFIED`, `EXECUTED AND PASSED`, `FAILED`, `NOT TESTED`, `ENVIRONMENT BLOCKED`. Existing CodeQL and unit tests are complementary, not proof of real browser/API/database behavior.
5. Report only sanitized unresolved HIGH/MEDIUM blocker summaries on the existing Issue/PR, with private advisory details when required. Do not create duplicate governance registries or declare product acceptance. Preserve protected evidence only in its approved restricted location. A read-only reviewer may post assigned review and deduplicated coordination comments but may never edit code, run mutating tests, create resources or issue GitHub native approval.

A security review cannot supersede independent PR review provenance or authorize merge, deployment, user-data handling or a new architecture.
