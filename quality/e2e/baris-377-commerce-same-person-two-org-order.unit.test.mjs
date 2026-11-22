/**
 * #377 / r4: same Person + same native Customer, two independently authorized
 * Buyer Organizations, one Cart attributed to A. Run the real GET handler with
 * deterministic in-memory dependencies only; no Next/HTTP/PG/Chrome/cache test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const routePath = resolve(root, 'packages/api/src/api/personal/order-groups/route.ts');
const source = readFileSync(routePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

const orgA = 'daorg_owner_a';
const orgB = 'daorg_owner_b';
const person = 'daprs_one_person';
const customer = 'cus_one_customer';
const cart = 'cart_owner_a';
const group = 'og_owner_a';
const token = 'synthetic-session';

// Implement only the exact strict two-field query contract required by this test.
const z = {
  string: () => ({ regex: pattern => ({ check: value => typeof value === 'string' && pattern.test(value) }) }),
  object: shape => ({ strict: () => ({ safeParse: query => {
    if (!query || typeof query !== 'object' || Array.isArray(query)) return { success: false };
    const keys = Object.keys(query);
    if (keys.length !== Object.keys(shape).length ||
        !Object.entries(shape).every(([key, validator]) => validator.check(query[key])))
      return { success: false };
    return { success: true, data: query };
  } }) })
};

function makeRequest(selectedOrg) {
  const calls = { grants: [], graphs: [] };
  const foundation = {
    personalBuyerOrganization: async (_session, orgId) =>
      orgId === orgA || orgId === orgB ? { person_id: person, organization_id: orgId } : null,
    personalActorBinding: async () => ({ person_id: person, actor_id: customer, revoked_at: null }),
    personalBuyerCartAttribution: async (session, orgId, cartId, customerId) => {
      calls.grants.push({ session, orgId, cartId, customerId });
      return session === token && orgId === orgA && cartId === cart && customerId === customer;
    }
  };
  const groupRow = { id: group, cart_id: cart, customer_id: customer };
  const orderGroupGraph = {
    ...groupRow, display_id: 17, created_at: '2026-11-18T00:00:00Z',
    orders: [{ id: 'order_a', display_id: 42, status: 'pending',
      items: [{ id: 'item_a', title: 'Sentetik ürün', quantity: 1 }] }]
  };
  const services = {
    customer: { listCustomers: async () => [{ id: customer }] },
    seller: { listOrderGroups: async filter =>
      'id' in filter ? (filter.id === group ? [groupRow] : []) :
      (filter.cart_id === cart ? [groupRow] : []) },
    cart: { listCarts: async filter =>
      filter.id === cart && filter.customer_id === customer ?
      [{ id: cart, customer_id: customer, completed_at: '2026-11-18T00:00:00Z' }] : [] },
    query: { graph: async input => {
      calls.graphs.push(input.entity);
      if (input.entity === 'order_group') return { data: [orderGroupGraph] };
      if (input.entity === 'order_cart') return { data: [{ order_id: 'order_a', cart_id: cart }] };
      throw Error('Unexpected graph query');
    } }
  };
  const req = { query: { organization_id: selectedOrg, order_group_id: group }, headers: {},
    scope: { resolve: name => {
      if (!(name in services)) throw Error('Unexpected service');
      return services[name];
    } } };
  const result = { status: null, headers: {}, body: null };
  const res = {
    setHeader(key, value) { result.headers[key] = value; return res; },
    status(value) { result.status = value; return res; },
    json(body) { result.body = body; return res; }
  };
  const mod = { exports: {} };
  const dependencies = name => {
    if (name === '@medusajs/framework/zod') return { z };
    if (name === '../security') return {
      access: () => foundation, enabled: () => true, sessionToken: () => token
    };
    if (name.endsWith('/identity-session')) return { IdentityAccessDenied: class extends Error {} };
    throw Error('Unexpected runtime import: ' + name);
  };
  runInNewContext(transpiled, {
    module: mod, exports: mod.exports, require: dependencies, Date
  }, { timeout: 1000, filename: 'order-groups/route.ts' });
  assert.equal(typeof mod.exports.GET, 'function', 'Must execute the real OrderGroup GET handler');
  return { run: async () => { await mod.exports.GET(req, res); return { ...result, calls }; } };
}

test('same authorized Person/Customer reads Cart history under its owning Buyer Organization', async () => {
  const { status, headers, body, calls } = await makeRequest(orgA).run();
  assert.equal(status, 200);
  assert.equal(headers['Cache-Control'], 'private, no-store');
  assert.equal(headers.Vary, 'Cookie');
  assert.equal(body.organization_id, orgA);
  assert.equal(body.order_group.id, group);
  assert.equal(body.order_group.orders[0].items[0].quantity, 1);
  assert.equal(calls.grants.length, 2, 'Attribution must be verified before and after the native read');
  assert.ok(calls.grants.every(call => call.orgId === orgA && call.customerId === customer));
});

test('same Person/Customer cannot borrow Cart from A while selecting its other authorized Buyer Org B', async () => {
  const { status, headers, body, calls } = await makeRequest(orgB).run();
  assert.equal(status, 403);
  assert.equal(headers['Cache-Control'], 'private, no-store');
  assert.equal(headers.Vary, 'Cookie');
  assert.deepEqual(JSON.parse(JSON.stringify(body)), { message: 'Access denied' });
  assert.deepEqual(calls.graphs, [], 'Wrong-Org request must not reach private OrderGroup graph');
  assert.equal(calls.grants.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.grants[0])),
    { session: token, orgId: orgB, cartId: cart, customerId: customer });
  assert.ok(!JSON.stringify(body).includes(group), 'Denial must not leak OrderGroup identity');
});
