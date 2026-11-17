import test from "node:test";
import assert from "node:assert/strict";
import {
  REPOSITORY, MAX_CHANGED_FILES, isAllowedDocumentPath,
  classifyChangedFiles, classifyGithubPullRequest
} from "./docs-only-classifier.mjs";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const changed = (filename, status = "modified") =>
  ({ filename, status, changes: 1, additions: 1, deletions: 0,
     sha: "c".repeat(40),
     patch: "@@ -0,0 +1 @@\\n+synthetic markdown content" });

function event(files = [changed("AGENTS.md")]) {
  return {
    repository: { full_name: REPOSITORY },
    pull_request: {
      number: 414, changed_files: files.length,
      base: { ref: "main", sha: BASE },
      head: { sha: HEAD }
    }
  };
}

function stubApi(files, { mainSha = BASE, headSha = HEAD, fail = false,
  changeAfterFirstMeta = false, treeMode = "100644",
  treeTruncated = false, treeMissing = false, treeSha = "c".repeat(40) } = {}) {
  let metaCalls = 0;
  const seen = [];
  const request = async (url, options) => {
    seen.push({ url, headers: options.headers });
    if (fail) return { ok: false, status: 503 };
    const path = new URL(url).pathname;
    let data;
    if (path.endsWith("/pulls/414")) {
      metaCalls++;
      data = {
        number: 414, head: { sha: changeAfterFirstMeta && metaCalls > 1 ? "c".repeat(40) : headSha },
        base: { ref: "main", sha: BASE }, changed_files: files.length
      };
    } else if (path.endsWith("/git/ref/heads/main")) {
      data = { object: { sha: mainSha } };
    } else if (path.includes("/git/trees/")) {
      data = {
        truncated: treeTruncated,
        tree: (treeMissing ? files.slice(1) : files).map(f => ({
          path: f.filename, type: "blob", mode: treeMode, sha: treeSha
        }))
      };
    } else if (path.endsWith("/pulls/414/files")) {
      const page = Number(new URL(url).searchParams.get("page"));
      data = files.slice((page - 1) * 100, page * 100);
    } else {
      throw Error("unexpected URL: " + url);
    }
    return { ok: true, json: async () => data };
  };
  return { request, seen };
}

const args = request => ({
  eventName: "pull_request", repository: REPOSITORY,
  token: "synthetic-read-only-token", request
});

test("allowlist is intentionally narrow: ordinary Markdown only", () => {
  for (const path of ["AGENTS.md", "README.md", "docs/guide.md",
    "docs/ci/safety-notes.md", "docs/Deep Path/MODEL.md"]) {
    assert.equal(isAllowedDocumentPath(path), true, path);
  }
  for (const path of [".github/workflows/check.yml", "docs/runbook.mdx",
    "packages/api/README.md", "docs/../AGENTS.md", "docs/.hidden.md",
    "docs/guide.md/../other.md", "docs/policy.txt", "docs/readme.MD",
    "AGENTS.md/anything", "src/x.ts", "docs//a.md", "docs/hi\\evil.md"]) {
    assert.equal(isAllowedDocumentPath(path), false, path);
  }
});

test("AGENTS.md-only, README-only and nested docs Markdown are docs-only", () => {
  for (const filename of ["AGENTS.md", "README.md", "docs/ci/notes.md"]) {
    assert.equal(classifyChangedFiles([changed(filename)], 1).docsOnly, true);
  }
  assert.equal(classifyChangedFiles([changed("AGENTS.md"), changed("README.md")], 2).docsOnly, true);
});

test("any code, workflow, lockfile or mixed change forces full CI", () => {
  for (const filename of ["packages/api/src/api/route.ts",
    ".github/workflows/identity-organization-foundation.yml",
    "bun.lock", "packages/api/medusa-config.ts", "docs/case.mdx"]) {
    assert.equal(classifyChangedFiles([changed("AGENTS.md"), changed(filename)], 2).mode, "full");
  }
});

test("fail closed on deletion, rename, incomplete, duplicate, malformed or too many changes", () => {
  const candidates = [
    { files: [changed("AGENTS.md", "removed")], n: 1 },
    { files: [{ ...changed("AGENTS.md"), previous_filename: "OTHER.md" }], n: 1 },
    { files: [changed("AGENTS.md")], n: 2 },
    { files: [changed("AGENTS.md"), changed("AGENTS.md")], n: 2 },
    { files: [{ ...changed("AGENTS.md"), patch: undefined }], n: 1 },
    { files: [{ ...changed("AGENTS.md"), patch: "" }], n: 1 },
    { files: [{ ...changed("AGENTS.md"), changes: 0, additions: 0 }], n: 1 },
    { files: [{ ...changed("AGENTS.md"), additions: undefined }], n: 1 },
    { files: [{ ...changed("AGENTS.md"), deletions: -1 }], n: 1 },
    { files: [{ ...changed("AGENTS.md"), changes: 2 }], n: 1 },
    { files: [{ filename: "AGENTS.md", status: "modified" }], n: 1 },
    { files: [], n: 0 },
    { files: null, n: 1 },
    { files: [changed("AGENTS.md")], n: MAX_CHANGED_FILES + 1 }
  ];
  for (const { files, n } of candidates)
    assert.equal(classifyChangedFiles(files, n).docsOnly, false);
});

test("live GitHub PR files and both SHA snapshots permit docs-only", async () => {
  const files = [changed("AGENTS.md")];
  const api = stubApi(files);
  const result = await classifyGithubPullRequest(event(files), args(api.request));
  assert.equal(result.mode, "docs-only");
  assert.equal(api.seen.filter(s => s.url.endsWith("/pulls/414")).length, 2);
  assert.equal(api.seen.filter(s => s.url.endsWith("/git/ref/heads/main")).length, 2);
  assert.equal(api.seen.filter(s => s.url.includes("/git/trees/")).length, 1);
  assert.ok(api.seen.every(s => s.url.startsWith("https://api.github.com/repos/" + REPOSITORY)));
  assert.ok(api.seen.every(s => s.headers.Authorization.startsWith("Bearer ")));
});

test("API error, HEAD drift or main drift cannot disable full checks", async () => {
  const files = [changed("AGENTS.md")];
  const cases = [
    stubApi(files, { fail: true }),
    stubApi(files, { headSha: "c".repeat(40) }),
    stubApi(files, { changeAfterFirstMeta: true }),
    stubApi(files, { mainSha: "d".repeat(40) })
  ];
  for (const api of cases) {
    const result = await classifyGithubPullRequest(event(files), args(api.request));
    assert.equal(result.docsOnly, false, result.reason);
  }
});

test("missing token, wrong repo/event and invalid metadata force full CI without API request", async () => {
  const files = [changed("AGENTS.md")];
  const api = stubApi(files);
  const variants = [
    { ...args(api.request), token: "" },
    { ...args(api.request), repository: "other/repository" },
    { ...args(api.request), eventName: "workflow_dispatch" },
  ];
  for (const variant of variants)
    assert.equal((await classifyGithubPullRequest(event(files), variant)).mode, "full");
  const invalid = event(files);
  invalid.pull_request.head.sha = "not-a-sha";
  assert.equal((await classifyGithubPullRequest(invalid, args(api.request))).mode, "full");
  assert.equal(api.seen.length, 0);
});

test("GitHub file response with unknown status or incomplete list forces full CI", async () => {
  const files = [changed("README.md", "renamed")];
  const api = stubApi(files);
  assert.equal((await classifyGithubPullRequest(event(files), args(api.request))).mode, "full");
  const second = stubApi([changed("AGENTS.md")]);
  const e = event([changed("AGENTS.md"), changed("README.md")]);
  assert.equal((await classifyGithubPullRequest(e, args(second.request))).mode, "full");
});


test("GitHub pagination accounts for 101 distinct docs paths, not just first page", async () => {
  const files = Array.from({ length: 101 }, (_, i) =>
    changed("docs/ci/procedure-" + i + ".md"));
  const api = stubApi(files);
  const result = await classifyGithubPullRequest(event(files), args(api.request));
  assert.equal(result.docsOnly, true);
  assert.equal(result.count, 101);
  const listCalls = api.seen.filter(s => s.url.includes("/files?"));
  assert.equal(listCalls.length, 2);
  assert.ok(listCalls[0].url.includes("page=1"));
  assert.ok(listCalls[1].url.includes("page=2"));
});

test("a dangerous file on a second page must force the complete workflow", async () => {
  const files = Array.from({ length: 100 }, (_, i) =>
    changed("docs/policy-" + i + ".md"));
  files.push(changed(".github/workflows/identity-organization-foundation.yml"));
  const api = stubApi(files);
  const result = await classifyGithubPullRequest(event(files), args(api.request));
  assert.equal(result.mode, "full");
});

test("tampered event repository or a non-main PR base never enables docs-only", async () => {
  const files = [changed("AGENTS.md")];
  const api = stubApi(files);
  const wrongRepo = event(files);
  wrongRepo.repository.full_name = "attacker/repository";
  assert.equal((await classifyGithubPullRequest(wrongRepo, args(api.request))).mode, "full");
  const wrongBase = event(files);
  wrongBase.pull_request.base.ref = "feature/unsafe";
  assert.equal((await classifyGithubPullRequest(wrongBase, args(api.request))).mode, "full");
  assert.equal(api.seen.length, 0);
});


test("binary or truncated Markdown changes cannot trigger lightweight CI", async () => {
  for (const damaged of [{ ...changed("README.md"), patch: undefined },
    { ...changed("docs/manual.md"), patch: "" },
    { ...changed("AGENTS.md"), changes: 3 }]) {
    const api = stubApi([damaged]);
    assert.equal((await classifyGithubPullRequest(event([damaged]), args(api.request))).mode, "full");
  }
});


test("docs-only refuses symlinks, executable blobs, incomplete trees and mismatched SHA", async () => {
  const files = [changed("AGENTS.md")];
  for (const config of [
    { treeMode: "120000" }, // symlink
    { treeMode: "100755" }, // executable
    { treeTruncated: true },
    { treeMissing: true },
    { treeSha: "f".repeat(40) }
  ]) {
    const api = stubApi(files, config);
    const result = await classifyGithubPullRequest(event(files), args(api.request));
    assert.equal(result.mode, "full", JSON.stringify(config));
  }
});

test("code changes never require a Git tree read to decide full CI", async () => {
  const files = [changed("packages/api/src/api/personal/route.ts")];
  const api = stubApi(files);
  assert.equal((await classifyGithubPullRequest(event(files), args(api.request))).mode, "full");
  assert.equal(api.seen.filter(s => s.url.includes("/git/trees/")).length, 0);
});

test("actual Node CLI writes a safe full result for malformed event", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = mkdtempSync(join(tmpdir(), "da-ci416-"));
  try {
    const eventFile = join(dir, "event.json");
    const outputFile = join(dir, "github-output.txt");
    writeFileSync(eventFile, "{invalid JSON", "utf8");
    const cli = join(dirname(fileURLToPath(import.meta.url)), "docs-only-classifier.mjs");
    const env = { ...process.env,
      GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REPOSITORY: REPOSITORY, GITHUB_EVENT_PATH: eventFile,
      GITHUB_OUTPUT: outputFile, GITHUB_TOKEN: "" };
    const result = spawnSync(process.execPath, [cli], { env, encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /CI file-classification: full \(invalid_event\)/);
    assert.equal(readFileSync(outputFile, "utf8"),
      "docs_only=false\nclassification=full\n");

    delete env.GITHUB_OUTPUT;
    const noOutput = spawnSync(process.execPath, [cli], { env, encoding: "utf8" });
    assert.equal(noOutput.status, 1);
    assert.match(noOutput.stderr, /GITHUB_OUTPUT missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
