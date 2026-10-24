---
name: github-task-handoff
description: Prepares narrow, reproducible GitHub Issue/PR and local Agent handoffs for DoğruAdres. Use when delegating implementation, synchronizing branches, or resuming a paused development task.
---

# GitHub task handoff

Follow the binding repository `AGENTS.md` and canonical [#208](https://github.com/DenizOner/DogruAdres/issues/208), [#216](https://github.com/DenizOner/DogruAdres/issues/216) and the task Issue. This skill is a *procedure*, not a new policy or task authorization.

1. **Find the existing record.** Reuse the canonical Issue/PR and approved requirements. Do not create duplicate tasks, decisions, worktrees or databases just to issue a handoff.
2. **Refresh the live target.** Identify `DenizOner/DogruAdres`, current PR and branch, full HEAD/base and live `main` SHA, real authoring Agent and permitted changed paths. Check current blockers and relevant CI.
3. **Name the local context if local work is needed.** Include a verified absolute Windows directory, Git top level/common-dir, intended branch/upstream, remote, ownership, process/port/DB dependencies and the expected full remote SHA. If unknown, write `UNVERIFIED` and mandate a *read-only preflight*, not a guessed path.
4. **Produce one executable English task.** State the desired narrow outcome, current evidence, exact files/commands, negative/security cases, cost and data limits, forbidden operations, tests, normal non-force push boundary, and stop-on-SHA-drift behavior. GitHub Issue/report text for the owner is Turkish.
5. **Close the loop.** Require actual changed-path and test results, final local and remote full SHA, PR URL and CI links, `LOCAL COMMITTED / REMOTE NOT SYNCED` if applicable, preserved data and residual blockers. Never claim a successful push from a local commit alone.

Safety: Never reset, clean, rebase or force-push a dirty/unknown worktree; never touch secrets, real DBs, Docker volumes, protected `main` or another Agent's active resources without their own authorization. A generated assignment is not authorization to merge or deploy.
