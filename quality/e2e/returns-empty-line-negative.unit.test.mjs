/**
 * #377 test-first source-scoped negative cases. No real HTTP, browser, DB,
 * cache or Person/Organization authorization is exercised by this suite.
 * RED-to-GREEN source evidence is not runtime authorization or product acceptance.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const page = readFileSync(resolve(root, 'apps/storefront/src/app/[locale]/(main)/user/returns/page.tsx'), 'utf8');
const ingress = readFileSync(resolve(root, 'packages/api/src/api/personal/security.ts'), 'utf8');

// Extract the actual TSX comparator: never silently pass on a stale mock.
const match = page.match(/returns=\{order_return_requests\.sort\(\s*(\(a,\s*b\)\s*=>[\s\S]*?)\s*\)\s*\}/);
assert.ok(match, 'Cannot locate ReturnsPage sort comparator; inspect changed source');
const comparator = runInNewContext('(' + match[1] + ')', { Date }, { timeout: 1000 });
const sortRows = (rows) => [...rows].sort(comparator);
const valid = (id, date) => ({ id, line_items: [{ line_item_id: 'synthetic-' + id, created_at: date }] });
const rowA = valid('A', '2026-11-01T00:00:00Z');
const rowB = valid('B', '2026-11-02T00:00:00Z');

test('control: zero and one records avoid the comparator; valid records keep newest-first order', () => {
  assert.deepEqual(sortRows([rowA, rowB]).map(row => row.id), ['B', 'A']);
  assert.deepEqual(sortRows([]), []);
  assert.equal(sortRows([{ id: 'synthetic-empty', line_items: [] }]).length, 1);
});

test('regression: two records including empty line_items must not crash sorting', () => {
  const rows = [rowA, { id: 'synthetic-empty', line_items: [] }];
  assert.doesNotThrow(() => sortRows(rows));
  assert.equal(sortRows(rows)[1].id, 'synthetic-empty');
});

test('regression: undefined line_items must fail safely rather than throw', () => {
  const rows = [{ id: 'synthetic-missing' }, rowB];
  assert.doesNotThrow(() => sortRows(rows));
  assert.equal(sortRows(rows)[0].id, 'B');
});

test('regression: foreign Person/Organization retrieval cannot precede customer gate', () => {
  // Fake A/B identifiers only. Source call order is NOT actual tenant/no-leak proof.
  const actorA = { person: 'synthetic-person-A', organization: 'synthetic-org-A' };
  const actorB = { person: 'synthetic-person-B', organization: 'synthetic-org-B' };
  assert.notEqual(actorA.organization, actorB.organization);
  const gate = page.indexOf('await retrieveCustomer()');
  const fetch = page.indexOf('await getReturns()');
  assert.ok(gate >= 0 && fetch >= 0, 'Expected current identity and return calls');
  const denied = page.indexOf('if (!user) return <LoginForm />;');
  assert.ok(gate < denied && denied < fetch, 'Missing customer must return before fetching returns; runtime leak NOT TESTED');
});

test('source-only control: native return-request remains default-denied', () => {
  assert.doesNotMatch(ingress, /path\s*===?\s*["']\/store\/return-request["']/);
  assert.match(ingress, /return res\.status\(401\)\.json\(\{message:"Personal session ingress required"\}\)/);
});
