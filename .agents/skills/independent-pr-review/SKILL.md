---
name: independent-pr-review
description: Conducts a strictly read-only, genuinely separate DoğruAdres pull-request source review and emits REVIEW-PROVENANCE-v1. Executed by the dedicated Denetçi Subagent in a separate read-only context before PR merge.
---

# Independent PR reviewer (Bağımsız Denetçi Alt Ajanı)

This skill **cannot create reviewer independence** in the PR author/fixer's execution. If you wrote or fixed any changed code, stop and require a different actual execution context. The primary author (Lead Agent or Worker Subagent) can never approve or review its own code. Shared GitHub credential `DenizOner` is transport only. Root `AGENTS.md` and [#208](https://github.com/DenizOner/DogruAdres/issues/208) control.

In the local **Lead Agent + Subagents** architecture, this skill is executed by the dedicated **Denetçi Subagent** (`denetci-reviewer`), invoked in a strictly separate, read-only context (`EnableWriteTools: false`).

## Review Protocol

1. **Target Freeze:** Refresh the target's repo/PR/branch, complete current HEAD and PR-recorded base SHA, live `main`, mergeable state and test-merge SHA with both parents. Historical base and live main are not interchangeable. Freeze the exact comparison you actually review.
2. **Complete Source Inspection:** Obtain the complete changed-file list, full git diff and relevant full source files at exact HEAD, approved Issue/ADR decisions, and security/architecture boundaries (Person-Organization-Store model, Policy A, extension-first rule). If key files or diff sections are inaccessible, mark `BLOCKED` rather than guessing.
3. **Behavioral & Security Analysis:** Inspect real positive, negative, fail-closed, and authorization behavior; check for regressions, dependencies, secrets, CI workflow permissions, and scope violations. Read actual exact-SHA CI jobs/log steps and distinguish unit/synthetic browser health from full user E2E evidence.
4. **Structured Report (`REVIEW-PROVENANCE-v1`):** Return one structured report with the following fields:
   - `target(repo, PR, HEAD SHA, base SHA, main, merge-ref)`
   - `writers(Lead Agent / Worker Subagent authoring context or UNVERIFIED)`
   - `reviewer(Denetçi Subagent, separate read-only execution context)`
   - `transport(shared GitHub credential / local agent relay)`
   - `inspected(complete files/diff and canonical decisions)`
   - `evidence(executed test commands, test counts, CI run IDs, or negative test limits)`
   - `findings/open risks(clear itemized findings or verified zero blockers)`
   - `verdict(PASS | CHANGES REQUIRED | BLOCKED)`
5. **Strict Read-Only Guardrail:** Do not edit repository files, commit, push, run mutating tests, trigger mutating CI, switch branches, alter databases, or merge code. The Denetçi Subagent outputs sanitized facts only. If source review requires mutation to proceed, report `REVIEW BLOCKED`. Public exploit details or private data must follow `.github/SECURITY.md`.

`PASS` applies solely to the reviewed exact source/integration context. Any subsequent commit or branch advance invalidates the review and requires a fresh check. Once independent `PASS`, real CI, and all technical gates are satisfied, the authorized maintainer can proceed with a squash merge into `main` without requiring a redundant per-PR Product Owner approval ([#208](https://github.com/DenizOner/DogruAdres/issues/208)).
