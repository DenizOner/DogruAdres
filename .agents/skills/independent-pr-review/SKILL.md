---
name: independent-pr-review
description: Conducts a strictly read-only, genuinely separate DoğruAdres pull-request source review and emits REVIEW-PROVENANCE-v1. Use when an Agent other than the author is assigned to review an exact PR revision before merge.
---

# Independent PR reviewer

This skill **cannot create reviewer independence** in the PR author/fixer's execution. If you wrote or fixed any changed code, stop and require a different actual execution. Shared GitHub credential `DenizOner` is transport only. Root `AGENTS.md` and [#208](https://github.com/DenizOner/DogruAdres/issues/208) control.

1. Refresh the target's repo/PR/branch, complete current HEAD and PR-recorded base SHA, live `main`, mergeable state and test-merge SHA with both parents. Historical base and live main are not interchangeable. Freeze the exact comparison you actually review.
2. Obtain the complete changed-file list, full diff and relevant full source at exact HEAD, approved Issue/ADR and security/architecture constraints. If key files or portions are truncated/inaccessible, `BLOCKED` rather than guessing.
3. Inspect real positive, negative, fail-closed and authorization behavior; check regressions, dependencies, secrets, CI workflow permissions and scope. Read actual exact-SHA CI jobs/log steps and distinguish unit/synthetic browser health from full user E2E.
4. Return one `REVIEW-PROVENANCE-v1` report: `target(repo, PR, HEAD, base, main, merge-ref)`, `writers(actual author/fixer or UNVERIFIED)`, `reviewer(actual separate task/execution and assignment origin)`, `transport(shared credential and report relay)`, `inspected(full files/diff)`, `evidence(CI and test limits)`, `findings/risks`, `verdict(PASS|CHANGES REQUIRED|BLOCKED)`. Unknown platform session IDs are `UNVERIFIED`; never invent them.
5. **No writes in review:** do not edit, commit, push, run mutating tests, approve, comment on GitHub or merge. Give the actual report to the authorized merger. A pasted/relayed report must be labelled `AGENT-REPORTED / USER-PROVIDED / RELAYED`, not authenticated GitHub `APPROVED`.

PASS only applies to the reviewed exact source/integration context; changes require risk-proportionate re-review. The authorized merger separately performs fresh SHA/CI/ruleset checks under #208; no extra per-PR Product Owner approval is required *after* all real gates.
