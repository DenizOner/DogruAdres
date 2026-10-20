// Disposable HTTP test harness, not a production authentication architecture.
// One credential submission performs separate supported actor-specific logins.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('./', import.meta.url);
// Publication guard: never read/write private fixture artifacts inside Git.
if (root.href !== 'file:///D:/DogruAdres-auth-poc-218-evidence-20261020/') throw new Error('Run only the preserved external task copy');
const fixtures = JSON.parse(fs.readFileSync(new URL('fixtures.private.json', root)));
const sessions = new Map();
const backend = 'http://127.0.0.1:9018';
const events = [];
async function api(path, token, body) {
  const r = await fetch(backend + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(30000),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}
const server = http.createServer(async (req, res) => {
  const reply = (status, data) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
  try {
    if (req.method === 'POST' && req.url === '/login') {
      let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 4096) return reply(400, { error: 'invalid' }); }
      const body = JSON.parse(text);
      if (Object.keys(body).sort().join(',') !== 'email,password') return reply(400, { error: 'invalid' });
      // This immutable synthetic allowlist stands in for an approved verified-linking resolver.
      // It is NOT an email-to-Person merge algorithm or deployable resolver.
      const identity = Object.values(fixtures.identities).find(i => i.email === body.email && i.personId);
      if (!identity) return reply(401, { error: 'unauthorized' });
      const tokens = {};
      for (const [type, id] of Object.entries(identity.actors)) {
        const r = await api(`/auth/${type}/emailpass`, null, body);
        if (r.status !== 200 || typeof r.data.token !== 'string') return reply(401, { error: 'unauthorized' });
        const claims = JSON.parse(Buffer.from(r.data.token.split('.')[1], 'base64url'));
        if (claims.actor_id !== id || claims.actor_type !== type || claims.auth_identity_id !== identity.authIdentityId) {
          return reply(403, { error: 'binding rejected' });
        }
        tokens[type] = r.data.token;
      }
      const sid = crypto.randomBytes(32).toString('hex');
      sessions.set(sid, { tokens, personId: identity.personId });
      res.setHeader('set-cookie', `auth218=${sid}; HttpOnly; SameSite=Strict; Path=/`);
      return reply(200, { signedIn: true });
    }
    const sid = /(?:^|;\s*)auth218=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const session = sessions.get(sid);
    if (!session) return reply(401, { error: 'unauthorized' });
    if (req.method === 'POST' && req.url === '/logout') { sessions.delete(sid); return reply(200, { signedOut: true }); }
    if (req.method !== 'GET') return reply(404, { error: 'not found' });
    if (req.url === '/person') return reply(200, { personId: session.personId });
    if (req.url === '/platform') {
      if (!session.tokens.user) return reply(403, { error: 'denied' });
      const r = await api('/admin/users/me', session.tokens.user); return reply(r.status, { allowed: r.status === 200 });
    }
    const match = /^\/(organizations|sellers)\/(XYZ|ABC)$/.exec(req.url);
    if (!match || !session.tokens.customer) return reply(403, { error: 'denied' });
    const [_, surface, name] = match;
    // Every operation rechecks the actual Foundation endpoint; no cached allow result.
    const org = await api(`/dogruadres/organizations/${fixtures.organizations[name]}`, session.tokens.customer);
    if (org.status !== 200) return reply(403, { error: 'denied' });
    if (surface === 'organizations') return reply(200, { organizationId: org.data.organization.id });
    if (!session.tokens.member) return reply(403, { error: 'denied' });
    const seller = await fetch(backend + '/vendor/members/me', { signal: AbortSignal.timeout(30000),
      headers: { authorization: `Bearer ${session.tokens.member}`, 'x-seller-id': fixtures.sellers[name] } });
    return reply(seller.status, { allowed: seller.status === 200 });
  } catch { return reply(503, { error: 'dependency unavailable' }); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(9019, '127.0.0.1', resolve); });
async function call(path, cookie, body) {
  const r = await fetch('http://127.0.0.1:9019' + path, { method: body ? 'POST' : 'GET',
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
async function test(name, fn) {
  try { await fn(); events.push({ name, result: 'PASS' }); }
  catch (e) { events.push({ name, result: 'FAIL', detail: e instanceof assert.AssertionError ? e.message : e.name }); }
  console.log(name, events.at(-1).result);
}
try {
  let primaryCookie, adversaryCookie;
  await test('one-frontdoor-submission-separate-supported-actor-logins', async () => {
    const i = fixtures.identities.primary;
    const r = await call('/login', null, { email: i.email, password: i.password });
    assert.equal(r.status, 200); assert.deepEqual(r.data, { signedIn: true }); primaryCookie = r.cookie; assert.ok(primaryCookie);
  });
  if (!primaryCookie) throw new Error('Login prerequisite failed');
  await test('frontdoor-canonical-person', async () => assert.deepEqual((await call('/person', primaryCookie)).data, { personId: fixtures.identities.primary.personId }));
  await test('frontdoor-current-ABC-access', async () => assert.equal((await call('/organizations/ABC', primaryCookie)).status, 200));
  await test('frontdoor-revoked-XYZ-access-denied', async () => assert.equal((await call('/organizations/XYZ', primaryCookie)).status, 403));
  await test('frontdoor-authorized-seller-context', async () => assert.equal((await call('/sellers/ABC', primaryCookie)).status, 200));
  await test('frontdoor-revoked-org-cannot-use-separate-seller-grant', async () => assert.equal((await call('/sellers/XYZ', primaryCookie)).status, 403));
  await test('frontdoor-explicit-platform-staff-grant', async () => assert.equal((await call('/platform', primaryCookie)).status, 200));
  await test('frontdoor-ordinary-person-no-platform-grant', async () => {
    const i = fixtures.identities.adversary;
    const r = await call('/login', null, { email: i.email, password: i.password });
    assert.equal(r.status, 200); adversaryCookie = r.cookie;
    assert.equal((await call('/platform', adversaryCookie)).status, 403);
  });
  await test('frontdoor-client-cannot-submit-actor-or-role-grant', async () => {
    const i = fixtures.identities.adversary;
    assert.equal((await call('/login', null, { email: i.email, password: i.password, role: 'owner' })).status, 400);
  });
  await test('frontdoor-concurrent-per-request-context-isolation', async () => {
    const r = await Promise.all([call('/organizations/ABC', primaryCookie), call('/organizations/XYZ', primaryCookie), call('/organizations/ABC', adversaryCookie)]);
    assert.deepEqual(r.map(x => x.status), [200, 403, 403]);
  });
  await test('frontdoor-logout-prevents-opaque-session-replay', async () => {
    assert.equal((await call('/logout', primaryCookie, {})).status, 200);
    assert.equal((await call('/person', primaryCookie)).status, 401);
  });
} finally { sessions.clear(); await new Promise(resolve => server.close(resolve)); }
fs.writeFileSync(new URL('frontdoor-results-sanitized.json', root), JSON.stringify(events, null, 2));
const failed = events.filter(x => x.result === 'FAIL').length;
console.log(JSON.stringify({ tests: events.length, passed: events.length - failed, failed }));
process.exitCode = failed ? 1 : 0;
