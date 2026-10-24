---
name: security-source-review
description: Runs evidence-based, risk-proportionate source security checks of DoğruAdres changes against applicable OWASP ASVS requirements. Use before security-sensitive implementation or during technical security review.
---

# Focused source security review

Follow root `AGENTS.md`, [#244](https://github.com/DenizOner/DogruAdres/issues/244) and the active scope/decision. OWASP is a selection tool, not a blanket compliance claim.

1. Establish exact commit and changed paths, real HTTP/Chrome/Medusa/Mercur execution flow, caller identity, organization ownership, server-side authority and mutations. Mark inaccessible source `NOT VERIFIED`.
2. Select only relevant ASVS 5.0 controls. Check BOLA/IDOR and role/tenant boundaries; sessions and cookies, CSRF, XSS/HTML escaping, injection, SSRF and external URLs; secrets and HTTP caching; privacy/non-enumeration; transaction/race/idempotency; dependencies and supply-chain integrity. Read affected full files, including negative/error paths, not only a diff excerpt.
3. For each concrete flaw provide severity, impacted actor/resource, exact file/line/revision, exploit preconditions without publishing secrets or unsafe payloads, minimal remediation and a discriminating negative test. Separate preexisting risks and changes introduced in the PR.
4. Distinguish `SOURCE VERIFIED`, `EXECUTED AND PASSED`, `FAILED`, `NOT TESTED`, `ENVIRONMENT BLOCKED`. Existing CodeQL and unit tests are complementary, not proof of real browser/API/database behavior.
5. Report unresolved HIGH/MEDIUM blockers on the existing Issue/PR; do not create duplicate governance registries or declare feature acceptance. Preserve private evidence locally. If tasked read-only, never edit sources, run mutating tests or issue GitHub approval.

A security review cannot supersede independent PR review provenance or authorize merge, deployment, user-data handling or a new architecture.
