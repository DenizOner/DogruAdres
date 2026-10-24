import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint, md, renderPulse } from "./repo-pulse.mjs";

test("untrusted GitHub text cannot inject lines or tables", () => {
  assert.equal(md("<token>|next\nline"), "&lt;token&gt;&#124;next line");
});

test("identical project state creates an identical update key", () => {
  const a = { mainProtected: false, openPullCount: 0, issues: [], pullRequests: [] };
  assert.equal(fingerprint(a), fingerprint(structuredClone(a)));
  assert.notEqual(fingerprint(a), fingerprint({ ...a, mainProtected: true }));
});

test("a check-run summary never reports product acceptance", () => {
  const content = renderPulse({
    mainProtected: false,
    openPullCount: 1,
    issues: [{ number: 147, state: "open", updated: "2026-10-24T10:00:00Z" }],
    pullRequests: [{ number: 227, draft: true, sha: "f2d947e2d578cecd0ea3dbf259bbf244fa2d1b4c", headChecks: "KONTROL BULUNAMADI" }],
  });
  assert.match(content, /ETKİN DEĞİL/);
  assert.match(content, /KONTROL BULUNAMADI/);
  assert.match(content, /gerçek tarayıcı\/HTTP\/PG kabulüyle eşdeğer değildir/);
});
