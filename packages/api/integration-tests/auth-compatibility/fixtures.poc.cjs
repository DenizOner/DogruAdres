// Synthetic-only #218 fixture. No production routes or authentication patches.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const req = createRequire('D:/DogruAdres-auth-poc-218-20261020/packages/api/package.json');
const { createStep, createWorkflow, StepResponse, WorkflowResponse } = req('@medusajs/framework/workflows-sdk');
const { Modules } = req('@medusajs/framework/utils');
const { createSellerAccountWorkflow } = req('@mercurjs/core/workflows');
const root = __dirname;
// Publication guard: execution copies belong outside Git, beside private fixtures.
if (path.resolve(root) !== path.resolve('D:/DogruAdres-auth-poc-218-evidence-20261020')) throw new Error('Run only the preserved external task copy');
const db = new URL(process.env.DATABASE_URL || 'http://invalid');
if (db.hostname !== '127.0.0.1' || db.port !== '55618' || db.pathname !== '/auth218_20261020' || db.username !== 'auth218_test') throw new Error('Not the authorized disposable database');
const methods = {
  user: ['user', 'createUsers'], customer: ['customer', 'createCustomers'],
  member: ['seller', 'createMembers'], seller: ['seller', 'createSellers'],
  sellerMember: ['seller', 'createSellerMembers'], person: ['dogruadresAccess', 'createPeople'],
  mapping: ['dogruadresAccess', 'createActorMappings'], organization: ['dogruadresAccess', 'createOrganizations'],
  membership: ['dogruadresAccess', 'createMemberships'],
};
const write = createStep('auth218-synthetic-fixture-write', async (input, { container }) => {
  const target = methods[input.kind];
  if (!target) throw new Error('Unsupported fixture operation');
  const result = await container.resolve(target[0])[target[1]]([input.data]);
  return new StepResponse(result[0]);
});
const fixtureWrite = createWorkflow('auth218-synthetic-fixture-write-workflow', function(input) {
  return new WorkflowResponse(write(input));
});
exports.default = async ({ container }) => {
  if (fs.existsSync(path.join(root, 'fixtures.private.json'))) throw new Error('Fixture already exists; do not rerun');
  const access = container.resolve('dogruadresAccess');
  if ((await access.listPeople({})).length || (await access.listOrganizations({})).length) {
    throw new Error('Nonempty Foundation fixture database; stop');
  }
  const create = async (kind, data) => (await fixtureWrite(container).run({ input: { kind, data } })).result;
  const auth = container.resolve(Modules.AUTH);
  const identities = {};
  for (const name of ['primary', 'staff', 'adversary', 'pending']) {
    const email = `auth218-${name}@example.invalid`;
    const password = crypto.randomBytes(32).toString('hex');
    const registered = await auth.register('emailpass', { body: { email, password } });
    if (!registered.success || !registered.authIdentity) throw new Error('Synthetic registration rejected');
    const actors = {};
    if (['primary', 'staff'].includes(name)) actors.user = (await create('user', { email })).id;
    if (['primary', 'adversary'].includes(name)) actors.member = (await create('member', { email })).id;
    actors.customer = (await create('customer', { email, has_account: true })).id;
    await auth.updateAuthIdentities({ id: registered.authIdentity.id,
      app_metadata: Object.fromEntries(Object.entries(actors).map(([type, id]) => [`${type}_id`, id])) });
    const person = await create('person', { display_name: `Synthetic auth218 ${name}` });
    for (const [type, id] of Object.entries(actors)) await create('mapping', {
      actor_type: type, actor_id: id, person_id: person.id,
      created_by_actor_type: type, created_by_actor_id: id,
    });
    identities[name] = { email, password, authIdentityId: registered.authIdentity.id, personId: person.id, actors };
    // Persist partial setup privately, permitting diagnosis without duplicate reruns.
    fs.writeFileSync(path.join(root, 'fixtures-in-progress.private.json'), JSON.stringify(identities));
  }
  const organizations = {};
  const memberships = {};
  const sellers = {};
  for (const name of ['XYZ', 'ABC']) {
    organizations[name] = (await create('organization', { name: `Synthetic auth218 ${name}`, status: 'active' })).id;
    memberships[name] = (await create('membership', { person_id: identities.primary.personId,
      organization_id: organizations[name], role: name === 'XYZ' ? 'admin' : 'member', status: 'active', protected_owner: false })).id;
    sellers[name] = (await createSellerAccountWorkflow(container).run({ input: {
      member_id: identities.primary.actors.member, auth_identity_id: identities.primary.authIdentityId,
      seller: { name: `Synthetic auth218 ${name}`, handle: `auth218-${name.toLowerCase()}`,
        email: `auth218-${name.toLowerCase()}@example.invalid`, currency_code: 'usd' },
    } })).result.id;
  }
  await create('membership', { person_id: identities.staff.personId, organization_id: organizations.XYZ,
    role: 'owner', status: 'active', protected_owner: false });
  const email = 'auth218-unmapped@example.invalid';
  const password = crypto.randomBytes(32).toString('hex');
  const registration = await auth.register('emailpass', { body: { email, password } });
  if (!registration.success || !registration.authIdentity) throw new Error('Unmapped fixture registration rejected');
  const customer = await create('customer', { email, has_account: true });
  await auth.updateAuthIdentities({ id: registration.authIdentity.id, app_metadata: { customer_id: customer.id } });
  identities.unmapped = { email, password, authIdentityId: registration.authIdentity.id, actors: { customer: customer.id } };
  const data = { identities, organizations, memberships, sellers };
  fs.writeFileSync(path.join(root, 'fixtures.private.json'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(root, 'fixtures-sanitized.json'), JSON.stringify({
    identities: Object.fromEntries(Object.entries(identities).map(([name, i]) => [name, { personId: i.personId, actors: i.actors }])),
    organizations, memberships, sellers,
  }, null, 2));
  console.log('AUTH218_FIXTURE_READY synthetic authIdentities=5 mappedPeople=4 organizations=2 sellerScopes=2');
};
