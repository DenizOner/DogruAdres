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
