# Local worktree freshness and first engineering Agent preflight

- Date: 2026-10-18
- Status: MANDATORY PRECONDITION before first Agent code task or native tests.
- Product Owner concern: direct remote GitHub edits have advanced branches while one historical Windows workspace had uncommitted changes and another checkout was on an older Foundation commit. **GitHub connector cannot inspect Windows local disk.** Current remote refs therefore do NOT prove local working files are current.
- Read-only/non-destructive by default. The ONLY permitted local metadata action in initial preflight is `git fetch --no-tags origin` after verifying origin identity (fetch updates remote-tracking refs and .git metadata, never the active working files). No other write operations.
- Expected remote refs at record time, ALWAYS confirm live before comparing:
  - main `d87ba52f99f74d7fec52af70a815fe91a989fc3f`
  - feature/safe-0a-production-checks `0639603a2d90ec2c48ba8f5c4a6f3028c84c45fa` (draft PR #3, not merged)
  - feature/vehicle-management-mvp `27965b00cacfd33fb51646bf7255eeeefc4a7734` (architecture/plans review docs)

## Required local checks (all worktrees, no assumptions)

1. Discover every known DogruAdres checkout/worktree, including the user-owned `D:\DogruAdres` and publication workspace if present; check `git rev-parse --show-toplevel` and `git worktree list --porcelain`. Never blindly trust the current shell directory.
2. Inspect repository `origin` ownership/ref names and remote HEAD via `git ls-remote --heads origin main feature/safe-0a-production-checks feature/vehicle-management-mvp`. Never print URL credential tokens.
3. For EACH checkout/worktree record `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain=v1 -uall` and `git status -sb`. Keep user uncommitted and untracked files safe, INCLUDING .env and developer backups; don't open or publish secrets.
4. After confirming `origin` is the intended DenizOner/DogruAdres repository, run `git fetch --no-tags origin` (no pull, no prune, no force). Recheck tracked refs and `git rev-list --left-right --count HEAD...origin/<current-branch>` only when a matching upstream branch exists. Compare exact SHAs; do not assume a feature checkout must equal main.
5. Verify target task: AF-1A0/source baseline uses current remote `main` SHA; SAFE-0A PR evidence uses SAFE branch exact SHA; approved vehicle plans use Vehicle branch SHA. Local `main` may be ahead/behind: STOP and report rather than reset or check out on top of dirty state.
6. If a clean, **separately owned worktree** from the verified `origin/main` is required, propose its non-conflicting path and command but DO NOT create it in this first preflight. Do not assume the old publication checkout or the user's `D:\DogruAdres` can be switched safely.
7. Produce evidence table: worktree path (non-sensitive label if necessary), branch, local SHA, exact remote SHA, status clean/dirty, ahead/behind or diverged, untracked count and protected resources untouched. Mark **READY** only if a verified clean task checkout exists at the required immutable commit; otherwise **BLOCKED** with safe non-destructive next action. No code edit, install, DB, containers, migration, commit or push.

## Explicitly forbidden

`git reset --hard`, `git clean`, `git checkout -f`, `git switch -f`, force pull, `git pull --rebase` on a dirty checkout, deleting/moving untracked user files, dropping stashes, auto-merging, changing branch under uncommitted files, touching original/G1 PostgreSQL/Redis, or changing GitHub main/PR state. No automatic `stash` either. If mismatch or secret-bearing remote URL, STOP and report minimally.

## LOCAL-0 Agent report received — BLOCKED (2026-10-18)

The Agent completed the instructed, non-destructive local review. This record is based on the Agent's report, NOT on independent access to the Windows local filesystem. Remote branch references were independently rechecked on GitHub by Technical Advisor and still matched at the time of this documentation update.

| Checkout | Local HEAD and branch | Changes / remote comparison | AF-1 readiness |
| --- | --- | --- | --- |
| `D:\DogruAdres` | `chore/mercur-2.3.7-security-upgrade` / `97d6111eca5970b39b16bfecc229b2a20b62e6fe` | 9 tracked unstaged + 33 untracked; no origin/upstream; no common ancestor with authoritative main reported | **NOT SAFE**. User-owned data and history must not be modified |
| `D:\DogruAdres-publication-20261017-145345` | `feature/identity-organization-foundation` / `39e014abeed71c9a23b06b0c5f23255c7f631d26` | Clean. Equal to corresponding remote feature; 0 ahead / 1 behind current main. Its local main is `50a82a490cd1d054c94cf6f03980b6141ed13633`, 0 ahead / 8 behind origin/main | **NOT AT CURRENT MAIN**; suitable as a Git metadata source for a new detached linked worktree only |

Publication `origin` fetch refspec originally covered main only; Agent fetched needed remote references explicitly without modifying the refspec, active checkout, working files, databases or volumes. SAFE and Vehicle remote branches have no local branch.

Current authoritative refs checked: `main=d87ba52f99f74d7fec52af70a815fe91a989fc3f`; SAFE-0A `0639603a2d90ec2c48ba8f5c4a6f3028c84c45fa`; Vehicle review `ef0e127affb37f9a343591a44e847e4e8918adc3`. Draft PR #3 remains distinct; no main merge.

**Result: BLOCKED.** No verified clean, isolated worktree at current main exists. **Next scoped checkpoint LOCAL-1, subject to explicit task approval:** create only one detached linked worktree at `D:\DogruAdres-af1a` from the VERIFIED immutable main SHA via the publication checkout. Confirm the path is absent, SHA exists locally and publication checkout is unchanged; then check the new worktree HEAD, clean status and registry. Do not make a feature branch, install dependencies, write code, run test/migration or touch protected resources. Report READY only after verifying exact HEAD and zero changes.

Proposed command (PowerShell, to be executed only in approved LOCAL-1; not executed by Technical Advisor):

```powershell
git -C "D:\DogruAdres-publication-20261017-145345" `
  -c safe.directory="D:/DogruAdres-publication-20261017-145345" `
  worktree add --detach "D:\DogruAdres-af1a" `
  d87ba52f99f74d7fec52af70a815fe91a989fc3f
```

Official Git worktree contract: https://git-scm.com/docs/git-worktree.html — linked checkout shares repository objects/refs and creates Git administrative worktree metadata; does NOT independently clone the repository. Do not use `--force`, hard reset or clean for this task. A failed/preexisting destination requires STOP/report, not overwrite.

## LOCAL-1 execution result reported — READY (2026-10-18)

The Agent reported executing exactly the approved detached worktree creation. The Technical Advisor has NOT independently inspected the Windows filesystem; statements about local state below are based on the Agent's before/after checks and SHA-256 evidence. GitHub remote main, SAFE-0A and Vehicle branch heads were independently rechecked and matched at this review.

- New linked worktree: \`D:\DogruAdres-af1a\`, detached HEAD \`d87ba52f99f74d7fec52af70a815fe91a989fc3f\`, zero Git status entries, registered in \`git worktree list\`, create command exit 0. This is an isolated worktree but shares underlying Git object/metadata storage with the publication repository; it is not a separate clone.
- Publication checkout remained clean on \`feature/identity-organization-foundation\` at \`39e014abeed71c9a23b06b0c5f23255c7f631d26\`.
- The user-owned \`D:\DogruAdres\` remained on \`chore/mercur-2.3.7-security-upgrade\` at \`97d6111eca5970b39b16bfecc229b2a20b62e6fe\`. Its 42 prior status entries (9 tracked unstaged and 33 untracked) were preserved; the Agent reports matching SHA-256 hashes for all 42 protected files before/after.
- Agent reports no dependency install, code edits, feature-branch creation, tests, service/container launch, database access, migration, commit, push, merge or deployment.
- **LOCAL-1 READY** for a *separately scoped* AF-1 branch preparation checkpoint. This does NOT authorize implementation, existing DB changes, migration or production deployment.

### Next task: AF-1 branch staging and test readiness, no implementation yet

At the start of a separately authorized local Agent task, revalidate exact remote \`main\` and clean \`D:\DogruAdres-af1a\`. Only if both match immutable \`d87ba52f99f74d7fec52af70a815fe91a989fc3f\`, check that proposed branch \`feature/af-1-foundation-audit-outbox\` does not already exist locally or remotely, then create that named local feature branch using ordinary \`git switch -c\` in **only** the isolated AF-1 worktree. Do NOT push or change \`main\`.

Next, READ and trace the approved [AF-1A0](af-1a0-foundation-mutation-audit-source-trace-2026-10-18.md) and [AF-1A](af-1a-foundation-audit-outbox-implementation-readiness-2026-10-18.md) specifications against installed code and version-matched Mercur/Medusa documentation; return an exact test-file/method matrix for the five mutation paths. Do not install dependencies, write test files or modify schemas until that evidence is reviewed and bounded coding authorization is given. Confirm \`git status --porcelain=v1 -uall\` remains empty and protected checkouts untouched. Report READY/BLOCKED and any discrepancies.

