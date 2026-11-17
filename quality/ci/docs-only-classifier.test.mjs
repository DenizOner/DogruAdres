import test from "node:test";
import assert from "node:assert/strict";
import {
  REPOSITORY, MAX_CHANGED_FILES, isAllowedDocumentPath,
  classifyChangedFiles, classifyGithubPullRequest
} from "./docs-only-classifier.mjs";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const changed = (filename, status = "modified") =>
  ({ filename, status, changes: 1 });

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
  changeAfterFirstMeta = false } = {}) {
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
