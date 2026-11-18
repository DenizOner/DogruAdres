// #416 offline-only negative contract; no CI runner, API or token needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { contextMatches, guard, TARGET } from './hakan-416-pretoken.mjs';

const pr = TARGET.harnessPr;
const reviewed = 'a'.repeat(40); // synthetic external claim, NOT an attestation
const ok = {
  event: 'pull_request', action: 'ready_for_review', attempt: '1', draft: 'false',
  pr: String(pr), baseRepo: TARGET.repository, headRepo: TARGET.repository,
  baseRef: 'main', headRef: 'test/hakan-416-pretoken-harness-20261118',
  headSha: reviewed, baseSha: TARGET.main
};

test('syntactic context may match but does NOT authorize execution', () => {
  assert.equal(contextMatches(ok, pr, reviewed), true);
  assert.equal(guard(ok, pr, reviewed), false);
});
for (const [label, delta] of [
  ['opened event', {action:'opened'}],
  ['synchronize event', {action:'synchronize'}],
  ['fork source', {headRepo:'foreign/fork'}],
  ['fork target', {baseRepo:'foreign/fork'}],
  ['retry', {attempt:'2'}],
  ['draft', {draft:'true'}],
  ['other PR', {pr:'433'}],
  ['wrong current main', {baseSha:'b'.repeat(40)}],
  ['wrong base branch', {baseRef:'other'}],
  ['wrong head branch', {headRef:'main'}],
  ['malformed HEAD', {headSha:'not-a-sha'}],
  ['different unreviewed HEAD', {headSha:'b'.repeat(40)}]
]) test('refuse '+label, () => {
  assert.equal(contextMatches({...ok,...delta}, pr, reviewed), false);
  assert.equal(guard({...ok,...delta}, pr, reviewed), false);
});
test('missing reviewed-HEAD claim fails closed', () => {
  assert.equal(contextMatches(ok, pr, undefined), false);
  assert.equal(guard(ok, pr, undefined), false);
});
test('malformed reviewed-HEAD claim fails closed', () => {
  assert.equal(contextMatches(ok, pr, 'not-a-sha'), false);
  assert.equal(guard(ok, pr, 'not-a-sha'), false);
});
test('wrong independently claimed HEAD fails closed', () => {
  assert.equal(contextMatches(ok, pr, 'b'.repeat(40)), false);
  assert.equal(guard(ok, pr, 'b'.repeat(40)), false);
});
test('unrecognized PR number and missing context fail closed', () => {
  assert.equal(contextMatches(ok, 436, reviewed), false);
  assert.equal(contextMatches(null, pr, reviewed), false);
  assert.equal(guard(ok, 436, reviewed), false);
});
