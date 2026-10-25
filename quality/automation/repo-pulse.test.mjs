import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  fingerprint, latestTrustedPulseComment, md, publishPulse, renderPulse, validateTrustedExecution,
} from "./repo-pulse.mjs";

const state = (date = "2026-10-24T10:00:00Z", headChecks = "2 HEAD kontrolü") => ({
  mainProtected: false, openPullCount: 1,
  issues: [{ number: 147, state: "open", updated: date }],
  pullRequests: [{ number: 227, draft: true, sha: "f2d947e2d578cecd0ea3dbf259bbf244fa2d1b4c", headChecks }],
});
const bot = (body) => ({ user: { login: "github-actions[bot]", type: "Bot" }, body });
const user = (body) => ({ user: { login: "DenizOner", type: "User" }, body });
const managed = (content) => `<!-- DA-GOVERNANCE-PULSE-245:v1:${fingerprint(content)} -->\n${content}`;

function fixture(pages, fail = null) {
  const posts = [], paths = [];
  const api = async (path, opts = {}) => {
    paths.push(path);
    if (fail === "read" && !opts.method) throw Error("Synthetic HTTP 503");
    if (opts.method === "POST") {
      if (fail === "post") throw Error("Synthetic HTTP 500");
      posts.push(JSON.parse(opts.body)); return { id: 1 };
    }
    const page = +new URL("https://example.test" + path).searchParams.get("page");
    return pages[page - 1] ?? [];
  };
  return { api, posts, paths };
}

test("Markdown escaping and no product-acceptance masquerade", () => {
  assert.equal(md("<token>|next\nline"), "&lt;token&gt;&#124;next line");
  const s = renderPulse(state());
  assert.match(s, /ETKİN DEĞİL/);
  assert.match(s, /gerçek tarayıcı\/HTTP\/PG kabulüyle eşdeğer değildir/);
});

test("fingerprint hashes only meaningfully visible report", () => {
  const a = renderPulse(state());
  assert.equal(a, renderPulse(state("2026-10-24T23:59:00Z")));
  assert.equal(fingerprint(a), fingerprint(renderPulse(state("2026-10-24T23:59:00Z"))));
  assert.notEqual(fingerprint(a), fingerprint(renderPulse(state("2026-10-25T10:00:00Z"))));
  assert.notEqual(fingerprint(a), fingerprint(renderPulse(state(undefined, "1 başarısız kontrol"))));
});

test("fake bot identity or malformed marker does not suppress a comment", async () => {
  const s = renderPulse(state());
  assert.equal(latestTrustedPulseComment([user(managed(s))]), undefined);
  assert.equal(latestTrustedPulseComment([bot("<!-- DA-GOVERNANCE-PULSE-245:v1:notahash -->\nhello")]), undefined);
  const f = fixture([[user(managed(s))]]);
  assert.equal(await publishPulse(f.api, 245, s), "posted");
  assert.deepEqual(f.posts, [{ body: managed(s) }]);
});

test("pagination reads later bot comment and deduplicates without POST", async () => {
  const s = renderPulse(state());
  const hundred = Array.from({ length: 100 }, () => user("irrelevant"));
  const f = fixture([hundred, [bot(managed(s))]]);
  assert.equal(await publishPulse(f.api, 245, s), "unchanged");
  assert.equal(f.paths.length, 2);
  assert.equal(f.posts.length, 0);
});

test("same visible report after a hidden timestamp change emits no comment", async () => {
  const s = renderPulse(state());
  const f = fixture([[bot(managed(s))]]);
  assert.equal(await publishPulse(f.api, 245, renderPulse(state("2026-10-24T23:10:00Z"))), "unchanged");
  assert.equal(f.posts.length, 0);
});

test("new visible state posts once, only to canonical Issue #245", async () => {
  const s = renderPulse(state());
  const f = fixture([[]]);
  assert.equal(await publishPulse(f.api, 245, s), "posted");
  assert.equal(f.posts.length, 1);
  assert.equal(f.paths.at(-1), "/issues/245/comments");
  await assert.rejects(publishPulse(f.api, 208, s), /Unexpected target Issue/);
  assert.equal(f.posts.length, 1);
});

test("read failures, write failures and 100 full pages fail closed", async () => {
  const s = renderPulse(state());
  const failedRead = fixture([], "read");
  await assert.rejects(publishPulse(failedRead.api, 245, s), /HTTP 503/);
  assert.equal(failedRead.posts.length, 0);
  await assert.rejects(publishPulse(fixture([[]], "post").api, 245, s), /HTTP 500/);
  const pages = Array.from({ length: 100 }, () => Array.from({ length: 100 }, () => user("x")));
  const cap = fixture(pages);
  await assert.rejects(publishPulse(cap.api, 245, s), /pagination safety limit/);
  assert.equal(cap.posts.length, 0);
});

test("write-capable runner must come from trusted default branch and event", () => {
  const good = {
    repository: "DenizOner/DogruAdres", issueNumber: 245, ref: "refs/heads/main",
    workflowRef: "DenizOner/DogruAdres/.github/workflows/governance-automation.yml@refs/heads/main",
    eventName: "workflow_dispatch",
  };
  assert.doesNotThrow(() => validateTrustedExecution(good));
  assert.doesNotThrow(() => validateTrustedExecution({ ...good, eventName: "schedule" }));
  for (const variant of [
    { ref: "refs/heads/feature" },
    { eventName: "pull_request" },
    { issueNumber: 208 },
    { repository: "attacker/fork" },
    { workflowRef: "DenizOner/DogruAdres/.github/workflows/governance-automation.yml@refs/heads/dev" },
  ]) assert.throws(() => validateTrustedExecution({ ...good, ...variant }), /Untrusted/);
});

test("privileged workflow source is explicitly locked to main", () => {
  const y = readFileSync(new URL("../../.github/workflows/governance-automation.yml", import.meta.url), "utf8");
  assert.match(y, /github\.ref == 'refs\/heads\/main'/);
  assert.match(y, /github\.repository == 'DenizOner\/DogruAdres'/);
  assert.match(y, /Checkout trusted default-branch source[\s\S]*?ref: main/);
  assert.doesNotMatch(y, /pull_request_target/);
});
