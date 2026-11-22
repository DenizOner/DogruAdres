---
name: github-task-handoff
description: Prepares narrow, reproducible task delegations and GitHub Issue/PR synchronizations for DoğruAdres. Use when delegating work to specialized Subagents, synchronizing branches, or resuming an isolated development task.
---

# Task Delegation and GitHub Synchronization

Follow the binding repository `AGENTS.md`, canonical [#208](https://github.com/DenizOner/DogruAdres/issues/208), [#216](https://github.com/DenizOner/DogruAdres/issues/216), and the associated task Issue. This skill is an *operational procedure*, not a new policy or task authorization.

In the **Lead Agent + Subagents** architecture, direct local execution on `d:\DogruAdres` is the standard operating model. The Lead Agent handles end-to-end orchestration and delegates bounded tasks to specialized Subagents (Worker, Reviewer, Researcher, QA).

## Delegation & Synchronization Workflow

1. **Locate Canonical Record:** Reuse the canonical GitHub Issue/PR and approved requirements. Do not create duplicate tasks, decisions, worktrees, or databases without demonstrated need.
2. **Refresh Live Target:** Identify `DenizOner/DogruAdres`, current PR and feature branch, exact HEAD full SHA, target base ref, and permitted file paths. Check active blockers and relevant CI runs.
3. **Subagent Task Contract:** When delegating to a Worker Subagent (e.g. for parallel work in an isolated worktree or branch), the delegation prompt MUST specify:
   - Repository `DenizOner/DogruAdres` and canonical workspace path.
   - **Exact authorized branch and target ref.**
   - Approved user outcome, acceptance criteria, and negative paths.
   - Authorized file scope (and strictly forbidden paths such as `packages/api/medusa-config.ts` or core modules when out of scope).
   - Resource boundaries (isolated test port, task-owned DB name, no destructive volume removal).
   - Stopping conditions (stop on SHA drift, test failure, or ambiguity).
4. **Read-Only Target Preflight:** Before any file mutation, the executing subagent verifies:
   - `git status --porcelain=v1` (clean tree or expected changes).
   - Correct branch and remote tracking (`origin/<target-branch>`).
   - Active processes, ports, and test DB isolation.
   - Never overwrite dirty or untracked files without authorization.
5. **Close the Loop & Sync:**
   - Run focused local unit/contract/integration tests to verify the change.
   - Commit logically scoped changes with descriptive commit messages.
   - Non-force push commits to the authorized feature branch; verify with `git ls-remote`. Never push directly to `main` or force-push.
   - Report back to the Lead Agent with: verified starting/ending SHAs, changed file list, test commands & results, PR link, and residual risks.

Safety Guardrails: Never run destructive commands (`git reset --hard`, `git clean -fd`, `docker system prune`, volume drops) without explicit authorization ([#229](https://github.com/DenizOner/DogruAdres/issues/229)). A generated task delegation or passing local test is not authorization to merge or deploy.
