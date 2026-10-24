import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// READ-ONLY local inventory. Never deletes, resets, prunes, fetches, or writes.
// Node must run on the actual owner's Windows computer, NOT on a GitHub runner.
export function classifyLocalEvidence(e) {
  const hard = [];
  if (e.trackedChanges > 0 || e.untracked > 0 || e.ignored > 0) hard.push("dirty, untracked or ignored content");
  if (e.stashes > 0 || e.localOnlyCommits > 0 || e.reflogEntries > 0) {
    hard.push("local-only Git or recovery evidence requires preservation");
  }
  if (e.linkedWorktrees > 0 || e.junctionOrSymlink) hard.push("linked worktrees or a reparse/realpath ambiguity");
  // No CLI output can certify process ownership, Docker binds, backup restore,
  // secret/evidence uniqueness, or task owner authorization.
  hard.push("task owners, active processes, Docker binds and private backup/restore NOT VERIFIED");
  hard.push("Issue #229 P0 database/volume recovery gate OPEN");
  return { deletion: "BLOCKED", reason: hard.join("; "), nextStep: "PRIVATE REVIEW ONLY" };
}

function git(root, ...args) {
  return execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    encoding: "utf8", timeout: 15000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" }
  }).trim();
}
const items = (v) => v ? v.split("\0").filter(Boolean).length : 0;
const lines = (v) => v ? v.split("\n").filter(Boolean).length : 0;

export function collectLocalEvidence(root, read = git) {
  if (!root || typeof root !== "string") throw new Error("One explicit existing --root is required");
  if (!isAbsolute(root)) throw new Error("Absolute canonical --root required: refusing implicit current-directory checkout");
  const target = resolve(root), physical = realpathSync(target);
  const topLevel = read(target, "rev-parse", "--show-toplevel");
  const gitCommon = read(target, "rev-parse", "--git-common-dir");
  const sha = read(target, "rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid local HEAD");
  const branch = read(target, "branch", "--show-current") || "DETACHED";
  const status = read(target, "status", "--porcelain=v1", "-z", "--untracked-files=all");
  const untracked = read(target, "ls-files", "--others", "--exclude-standard", "-z");
  // -o -i --exclude-standard lists ignored files, but may be very large. Limit
  // the command output and fail closed instead of deleting on overflow.
  const ignored = read(target, "ls-files", "--others", "--ignored", "--exclude-standard", "-z");
  const stash = read(target, "stash", "list", "--format=%H");
  const localOnly = read(target, "rev-list", "--count", "--branches", "--not", "--remotes");
  const reflog = read(target, "reflog", "show", "--format=%H", "-n", "100");
  const worktree = read(target, "worktree", "list", "--porcelain", "-z");
  const staleDryRun = read(target, "worktree", "prune", "--dry-run", "--verbose");
  const wtCount = worktree.split("\0").filter(a => a.startsWith("worktree ")).length;
  const linked = Math.max(0, wtCount - 1);
  const evidence = {
    headSha: sha, branch,
    // Private local directories are represented by nonreversible digests;
    // the CLI intentionally does not emit paths, remote URLs or file names.
    rootDigest: createHash("sha256").update(physical).digest("hex").slice(0, 20),
    commonDirDigest: createHash("sha256").update(gitCommon).digest("hex").slice(0, 20),
    trackedChanges: Math.max(0, items(status) - items(untracked)),
    untracked: items(untracked), ignored: items(ignored),
    stashes: lines(stash), localOnlyCommits: Number(localOnly),
    reflogEntries: lines(reflog), linkedWorktrees: linked,
    staleWorktreeEntries: lines(staleDryRun),
    junctionOrSymlink: target.toLowerCase() !== physical.toLowerCase(),
    rootMatchesGit: resolve(topLevel).toLowerCase() === physical.toLowerCase()
  };
  if (!Number.isSafeInteger(evidence.localOnlyCommits) || !evidence.rootMatchesGit) {
    throw new Error("Unknown checkout ownership or unbounded local-only commits");
  }
  return { ...evidence, ...classifyLocalEvidence(evidence),
    note: "Remote SHA/backup recovery, process and Docker usage not inspected. Nothing was deleted." };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== "--root" || !argv[1]) {
    throw new Error("Usage: node quality/automation/local-worktree-preflight.mjs --root <existing-canonical-checkout>");
  }
  if (process.env.GITHUB_ACTIONS === "true") {
    throw new Error("Windows-owner local inventory cannot be performed by CI");
  }
  const summary = collectLocalEvidence(argv[1]);
  console.log(JSON.stringify(summary, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (e) {
    // No paths, command outputs, secrets or source file names in error output.
    console.error("LOCAL_INVENTORY_BLOCKED: "+(/Usage:/.test(e.message) ? e.message : "read-only evidence incomplete"));
    process.exitCode = 2;
  }
}
