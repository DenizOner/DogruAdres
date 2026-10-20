import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('./', import.meta.url);
// Publication guard: never read/write private fixture artifacts inside Git.
if (root.href !== 'file:///D:/DogruAdres-auth-poc-218-evidence-20261020/') throw new Error('Run only the preserved external task copy');
const f = JSON.parse(fs.readFileSync(new URL('fixtures.private.json', root)));
const base = 'http://127.0.0.1:9018';
const results = [];
const tokens = {};
async function request(path, { token, cookie, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(30000),
    headers: { ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function test(name, fn) {
  try { await fn(); results.push({ name, result: 'PASS' }); }
  catch (error) { results.push({ name, result: 'FAIL', detail: error instanceof assert.AssertionError ? error.message : error.name }); }
  fs.writeFileSync(new URL('http-results-sanitized.json', root), JSON.stringify(results, null, 2));
  console.log(name, results.at(-1).result);
}
for (const [name, identity] of Object.entries(f.identities)) {
  tokens[name] = {};
  for (const type of Object.keys(identity.actors)) await test(`login-${name}-${type}`, async () => {
    const r = await request(`/auth/${type}/emailpass`, { method: 'POST', body: { email: identity.email, password: identity.password } });
    assert.equal(r.status, 200); assert.equal(typeof r.data.token, 'string');
    const claims = JSON.parse(Buffer.from(r.data.token.split('.')[1], 'base64url'));
    assert.equal(claims.actor_type, type); assert.equal(claims.actor_id, identity.actors[type]);
    tokens[name][type] = r.data.token;
  });
}
if (results.some(x => x.result === 'FAIL')) {
  console.log('AUTH218 login prerequisite failed; dependent HTTP assertions NOT TESTED');
  process.exit(1);
}
await test('invalid-password-rejected', async () => assert.equal((await request('/auth/user/emailpass', {
  method: 'POST', body: { email: f.identities.primary.email, password: 'invalid-synthetic-password' } })).status, 401));
await test('same-email-registration-cannot-take-over-identity', async () => {
  const r = await request('/auth/customer/emailpass/register', { method: 'POST', body: {
    email: f.identities.primary.email, password: 'unrelated-adversarial-synthetic-password' } });
  assert.ok([400, 401, 422].includes(r.status), `registration status ${r.status}`);
});
const org = (name) => `/dogruadres/organizations/${f.organizations[name]}`;
await test('unauthenticated-organization-denied', async () => assert.equal((await request(org('XYZ'))).status, 401));
for (const type of ['user', 'member', 'customer']) await test(`explicit-canonical-binding-${type}-organization-read`, async () => {
  const r = await request(org('XYZ'), { token: tokens.primary[type] });
  assert.equal(r.status, 200); assert.equal(r.data.organization.id, f.organizations.XYZ);
});
await test('platform-staff-no-ABC-membership-no-bypass', async () => assert.equal((await request(org('ABC'), { token: tokens.staff.user })).status, 403));
await test('adversarial-person-no-organization-access', async () => assert.equal((await request(org('XYZ'), { token: tokens.adversary.customer })).status, 403));
await test('spoofed-actor-person-role-headers-do-not-grant', async () => assert.equal((await request(org('XYZ'), {
  token: tokens.adversary.customer, headers: { 'x-person-id': f.identities.primary.personId,
    'x-actor-id': f.identities.primary.actors.user, 'x-role': 'owner' } })).status, 403));
await test('XYZ-admin-can-list-memberships', async () => assert.equal((await request(org('XYZ') + '/memberships', { token: tokens.primary.customer })).status, 200));
await test('ABC-member-cannot-list-memberships', async () => assert.equal((await request(org('ABC') + '/memberships', { token: tokens.primary.customer })).status, 403));
for (const type of ['member', 'customer']) await test(`${type}-token-cannot-access-user-admin`, async () => assert.equal((await request('/admin/users/me', { token: tokens.primary[type] })).status, 401));
await test('user-token-cannot-access-member-vendor', async () => assert.equal((await request('/vendor/members/me', {
  token: tokens.primary.user, headers: { 'x-seller-id': f.sellers.XYZ } })).status, 401));
for (const name of ['XYZ', 'ABC']) await test(`authorized-seller-${name}`, async () => {
  const r = await request('/vendor/members/me', { token: tokens.primary.member, headers: { 'x-seller-id': f.sellers[name] } });
  assert.equal(r.status, 200); assert.equal(r.data.seller_member.seller_id, f.sellers[name]);
});
await test('adversarial-member-seller-selection-denied', async () => assert.ok([400, 403].includes((await request('/vendor/members/me', {
  token: tokens.adversary.member, headers: { 'x-seller-id': f.sellers.XYZ } })).status)));
await test('concurrent-request-org-selectors-do-not-cross', async () => {
  const responses = await Promise.all(['XYZ', 'ABC', 'XYZ', 'ABC'].map(async name => {
    const r = await request(org(name), { token: tokens.primary.customer });
    assert.equal(r.status, 200); assert.equal(r.data.organization.id, f.organizations[name]);
  }));
  assert.equal(responses.length, 4);
});
await test('concurrent-first-use-provisioning-single-actor', async () => {
  const responses = await Promise.all(['A', 'B'].map(suffix => request('/admin/dogruadres/organizations', {
    token: tokens.staff.user, method: 'POST', body: { name: `Synthetic auth218 concurrent ${suffix}`,
      initial_owners: [{ actor_type: 'customer', actor_id: f.identities.unmapped.actors.customer }] } })));
  for (const r of responses) assert.equal(r.status, 201);
  assert.notEqual(responses[0].data.organization.id, responses[1].data.organization.id);
  fs.writeFileSync(new URL('concurrent-organizations-sanitized.json', root), JSON.stringify(responses.map(r => r.data.organization.id)));
  // Canonical Person count is additionally checked against PostgreSQL, not inferred here.
});
await test('pending-invitation-created-without-membership-grant', async () => {
  const created = await request(org('XYZ') + '/invitations', { token: tokens.primary.customer, method: 'POST',
    body: { email: f.identities.pending.email, role: 'member' } });
  assert.equal(created.status, 201);
  assert.equal((await request(org('XYZ'), { token: tokens.pending.customer })).status, 403);
});
await test('refresh-retains-current-actor-type', async () => {
  const r = await request('/auth/token/refresh', { token: tokens.primary.customer, method: 'POST' });
  assert.equal(r.status, 200);
  const claims = JSON.parse(Buffer.from(r.data.token.split('.')[1], 'base64url'));
  assert.equal(claims.actor_type, 'customer'); assert.equal(claims.actor_id, f.identities.primary.actors.customer);
});
await test('session-logout-rejects-old-cookie', async () => {
  const established = await request('/auth/session', { token: tokens.primary.user, method: 'POST' });
  assert.equal(established.status, 200); assert.ok(established.cookie);
  assert.equal((await request('/admin/users/me', { cookie: established.cookie })).status, 200);
  assert.equal((await request('/auth/session', { cookie: established.cookie, method: 'DELETE' })).status, 200);
  assert.equal((await request('/admin/users/me', { cookie: established.cookie })).status, 401);
});
await test('documented-limitation-bearer-remains-valid-after-session-logout', async () => {
  assert.equal((await request('/admin/users/me', { token: tokens.primary.user })).status, 200);
});
await test('committed-membership-revocation-denies-previous-token', async () => {
  const revoked = await request(org('XYZ') + `/memberships/${f.memberships.XYZ}`, {
    token: tokens.staff.user, method: 'POST', body: { status: 'revoked' } });
  assert.equal(revoked.status, 200);
  assert.equal((await request(org('XYZ'), { token: tokens.primary.customer })).status, 403);
  assert.equal((await request(org('ABC'), { token: tokens.primary.customer })).status, 200);
});
const failed = results.filter(x => x.result === 'FAIL').length;
console.log(JSON.stringify({ tests: results.length, passed: results.length - failed, failed }));
process.exitCode = failed ? 1 : 0;
