// #416 PRE-TOKEN / NEVER-MERGE. LOCAL SHAPE TEST ONLY.
// There is no independently trusted, protected reviewed-HEAD allowlist yet.
// Never use this PR-owned file or a self-supplied SHA as authorization to run PR code.
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const TARGET = Object.freeze({
  repository: 'DenizOner/DogruAdres',
  harnessPr: 435,
  pr: 433,
  queue: 216,
  main: 'fec9dafdb20c68aadaab5b8b552b21f428ac14a9',
  head: '215d9d9779ae6a7a2ccac281f13aac36447d0fe1',
  sourceBlob: 'dca161d05a25cb59fcae3845c9a0d7e90892d8ee',
  testBlob: '7a15214da9bc850638336cb7115a24b755e898ee'
});

const sha = /^[a-f0-9]{40}$/;

// Pure, offline predicate. 'independentlyReviewedHead' is only an input;
// this function cannot prove its provenance. Its true result is NOT permission.
export function contextMatches(e, expectedHarnessPr, independentlyReviewedHead) {
  if (!e || expectedHarnessPr !== TARGET.harnessPr ||
      !sha.test(independentlyReviewedHead ?? '')) return false;
  if (e.event !== 'pull_request' || e.action !== 'ready_for_review') return false;
  if (e.attempt !== '1' || e.draft !== 'false') return false;
  if (e.pr !== String(expectedHarnessPr)) return false;
  if (e.baseRepo !== TARGET.repository || e.headRepo !== TARGET.repository) return false;
  if (e.baseRef !== 'main' ||
      e.headRef !== 'test/hakan-416-pretoken-harness-20261118') return false;
  if (!sha.test(e.headSha ?? '') || !sha.test(e.baseSha ?? '')) return false;
  if (e.headSha !== independentlyReviewedHead || e.baseSha !== TARGET.main) return false;
  return true;
}

// HARD STOP: a PR-controlled argument, env var, comment or file is not a
// protected external reviewer/ref attestation. Until that independent gate
// is approved and installed outside PR #435, no PR event may be authorized.
export function guard() {
  return false;
}

// Direct use must fail, including with a syntactically perfect event.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  assert(guard() === true,
    'PRE-TOKEN BLOCKED: no trusted external immutable reviewed-HEAD gate; do not checkout or execute PR code');
}
