---
name: security-source-review
description: Runs evidence-based, risk-proportionate source security checks of DoğruAdres changes against applicable OWASP ASVS requirements. Use before security-sensitive implementation or during technical security review.
---

# Focused Source Security Review (OWASP ASVS Güvenlik İncelemesi)

Follow root `AGENTS.md`, [#244](https://github.com/DenizOner/DogruAdres/issues/244), and the active task decision. OWASP ASVS is a risk-prioritized selection tool, not a blanket compliance claim.

In the **Lead Agent + Subagents** architecture, this skill is executed by the Lead Agent prior to finalizing implementation, or by the **Bağımsız Denetçi Subagent** during independent review.

## Review Protocol

1. **Map Data Flow & Authority:** Establish exact commit and changed paths, real execution flow through Medusa/Mercur middleware, actor identity, legal organization ownership, server-side authorization chain, and state mutations. Mark inaccessible source `NOT VERIFIED`.
2. **Select Relevant ASVS 5.0 Controls:** Check BOLA/IDOR and role/tenant boundaries; sessions and cookie flags, CSRF, XSS/HTML escaping, injection, SSRF, and external redirects; secrets and HTTP caching headers; privacy and non-enumeration; transaction/race/idempotency; dependencies and supply-chain integrity. Read affected whole files, including negative/error paths, not only diff excerpts.
3. **Flaw Classification & Responsible Disclosure:** For each concrete flaw, determine severity, actor/resource, exact file/line/revision, preconditions, minimal safe fix, and negative test. **Publish exact exploit-enabling paths or PoCs only in an authorized private advisory**, not public Issues/PRs; public notes receive only a redacted actionable blocker and safe acceptance criteria. Follow `.github/SECURITY.md`.
4. **Evidence Standard:** Distinguish `SOURCE VERIFIED`, `EXECUTED AND PASSED`, `FAILED`, `NOT TESTED`, and `ENVIRONMENT BLOCKED`. Existing CodeQL and unit tests are complementary, not proof of real browser/API/database behavior.
5. **Read-Only Independence:** When executed by the Bağımsız Denetçi Subagent, the reviewer outputs sanitized findings only, and never edits source code, runs mutating tests, creates resources, or bypasses review gates.

A security review cannot supersede the full `REVIEW-PROVENANCE-v1` independent review gate in [#208](https://github.com/DenizOner/DogruAdres/issues/208) or authorize deployment, destructive operations, or new architecture.
