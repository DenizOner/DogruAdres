// #416 PRE-TOKEN ONLY. NEVER MERGE. No API/token/secret, no workflow writes.
// This file is deliberately limited to local event/ref/permission validation.
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const TARGET = Object.freeze({
  repository: 'DenizOner/DogruAdres',
  pr: 433,
  queue: 216,
  main: '62e32d753864f564ac13aa16cbc0e9e7c6dad4b1',
  head: '9692f95a6af20458adfb29bdccdb570d488ae0c8',
  sourceBlob: 'b336f202a8f4d4021e712fc0bf307353f93d4276',
  testBlob: '0f094f624d4e8a5c05452d0ea2068b67d26800cc'
});

const sha = /^[a-f0-9]{40}$/;
export function guard(e, expectedHarnessPr) {
  if (!Number.isSafeInteger(expectedHarnessPr) || expectedHarnessPr <= 0) return false;
  if (e.event !== 'pull_request' || e.action !== 'ready_for_review') return false;
  if (e.attempt !== '1' || e.draft !== 'false') return false;
  if (e.pr !== String(expectedHarnessPr)) return false;
  if (e.baseRepo !== TARGET.repository || e.headRepo !== TARGET.repository) return false;
  if (e.baseRef !== 'main' || e.headRef !== 'test/hakan-416-pretoken-harness-20261118') return false;
  if (!sha.test(e.headSha ?? '') || !sha.test(e.baseSha ?? '')) return false;
  if (e.baseSha !== TARGET.main) return false;
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const pr = Number.parseInt(process.env.HAKAN_416_PR ?? '', 10);
  const e = {
    event: process.env.EVENT_NAME, action: process.env.EVENT_ACTION,
    attempt: process.env.RUN_ATTEMPT, draft: process.env.PR_DRAFT,
    pr: process.env.PR_NUMBER, baseRepo: process.env.BASE_REPO,
    headRepo: process.env.HEAD_REPO, baseRef: process.env.BASE_REF,
    headRef: process.env.HEAD_REF, headSha: process.env.HEAD_SHA,
    baseSha: process.env.BASE_SHA
  };
  assert(guard(e, pr), 'PRE-TOKEN STOP: unexpected event/fork/ref/retry/main; no executable checkout');
  console.log('PRE-TOKEN event/ref guard accepted (no token or network CLI invoked)');
}
