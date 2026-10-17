import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { realpathSync } from "node:fs"
import { test } from "node:test"

const authorizedDatabase = "g10k_20261017125120_7d460ec3"
const apiUrl = process.env.DOGRUADRES_TEST_API_URL ?? "http://127.0.0.1:19040"
let ownerBearer
let inviteeBearer
const databaseUrl = process.env.DATABASE_URL
const missingInputs = [
  ["DATABASE_URL", databaseUrl],
  ["REDIS_URL", process.env.REDIS_URL],
].filter(([, value]) => !value).map(([name]) => name)

function verifyDockerTarget(expectedName, containerPort, expectedPort, expectedMountDestination) {
  const inspected = JSON.parse(execFileSync("docker", ["inspect", "--format", "{{json .}}", expectedName], { encoding: "utf8" }))
  assert.match(inspected.Id, /^[a-f0-9]{64}$/, "Docker container ID missing")
  assert.equal(inspected.Name, `/${expectedName}`, "Docker container name mismatch")
  assert.equal(inspected.State.Status, "running", "G1 test container must be running")
  assert.equal(inspected.Config.Labels?.["dogruadres.task"], "g1-0b", "G1 task label mismatch")
  const portBindings = Object.values(inspected.HostConfig.PortBindings ?? {}).flat()
  assert.equal(portBindings.length, 1, "Unexpected additional host bindings")
  assert.deepEqual(inspected.HostConfig.PortBindings[`${containerPort}/tcp`], [{ HostIp: "127.0.0.1", HostPort: String(expectedPort) }], "Loopback port binding mismatch")
  const mounts = inspected.Mounts ?? []
  assert.equal(mounts.length, 1, "Unexpected additional mounts")
  assert.ok(mounts.some((mount) => mount.Type === "volume" && mount.Destination === expectedMountDestination && mount.RW && /^[a-f0-9]{64}$/.test(mount.Name)), "Expected isolated volume mount is missing")
  assert.ok(mounts.every((mount) => mount.Name !== "dogruadres-postgres-data"), "Protected development volume must never be mounted")
}

function tokenClaims(bearer) {
  const parts = bearer.split(".")
  assert.equal(parts.length, 3, "Bearer must be a JWT")
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
}

function pgClient() {
  const requireFromApi = createRequire(resolve(process.cwd(), "package.json"))
  const frameworkEntry = realpathSync(requireFromApi.resolve("@medusajs/framework"))
  const pgEntry = requireFromApi.resolve("pg", { paths: [dirname(frameworkEntry)] })
  const { Client } = requireFromApi(pgEntry)
  return new Client({ connectionString: databaseUrl })
}

async function request(method, path, bearer, body) {
  const response = await fetch(new URL(path, apiUrl), {
    method,
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  let data = {}
  try { data = await response.json() } catch { /* body is intentionally omitted from diagnostics */ }
  return { status: response.status, data }
}

test("DogruAdres Organization authorization, invitation, and audit HTTP regressions", async (t) => {
  assert.equal(missingInputs.length, 0, `Missing test-only environment: ${missingInputs.join(", ")}`)
  assert.equal(process.env.NODE_ENV, "test")
  const database = new URL(databaseUrl)
  assert.equal(database.hostname, "127.0.0.1", "Test database must be loopback-only")
  assert.equal(database.port, "55437", "Test database must use the verified G1 port")
  assert.equal(database.pathname.slice(1), authorizedDatabase, "Test database must be the authorized G1 database")
  assert.equal(new URL(apiUrl).hostname, "127.0.0.1", "Test API must bind to loopback")
  assert.equal(new URL(apiUrl).port, "19040", "Test API must use the verified loopback port")
  verifyDockerTarget("dogruadres-g1-0b-postgres", 5432, 55437, "/var/lib/postgresql/data")
  verifyDockerTarget("dogruadres-g1-0b-redis", 6379, 56379, "/data")
  assert.equal(process.env.REDIS_URL, "redis://127.0.0.1:56379", "Redis target must be the isolated G1 instance")

  const credentials = [0, 1].map(() => ({ email: `g1-http-${randomUUID()}@example.invalid`, password: randomBytes(32).toString("base64url") }))
  try {
    execFileSync(process.execPath, ["node_modules/@medusajs/cli/cli.js", "exec", "integration-tests/fixtures/provision-native-users.ts"], {
      cwd: process.cwd(), env: { ...process.env, DOGRUADRES_TEST_USER_FIXTURES: JSON.stringify(credentials) },
      stdio: "pipe", timeout: 120_000,
    })
  } catch {
    throw new Error("Supported synthetic user provisioning failed; no credentials or child output are emitted")
  }
  const bearers = []
  for (const credential of credentials) {
    const login = await request("POST", "/auth/user/emailpass", undefined, credential)
    assert.equal(login.status, 200, "Normal Medusa authentication failed")
    assert.equal(typeof login.data.token, "string", "Normal login did not return an authenticated bearer")
    bearers.push(login.data.token)
    credential.password = ""
  }
  ;[ownerBearer, inviteeBearer] = bearers

  const owner = tokenClaims(ownerBearer)
  const invitee = tokenClaims(inviteeBearer)
  assert.equal(owner.actor_type, "user", "Provisioning identity must be an authenticated platform user")
  assert.equal(invitee.actor_type, "user", "Invitee must be an independently authenticated platform user")
  assert.ok(owner.actor_id && invitee.actor_id && owner.actor_id !== invitee.actor_id, "Two distinct authenticated users are required")
  assert.ok(invitee.auth_identity_id && invitee.auth_provider, "Invitee authentication identity/provider are required")
  const inviteeEmail = credentials[1].email

  const db = pgClient()
  await db.connect()
  let verificationFixtureId
  const organizations = []
  const invitations = []
  try {
    const dbIdentity = await db.query("select current_database() as name, inet_server_addr()::text as address")
    assert.equal(dbIdentity.rows[0].name, authorizedDatabase)
    assert.ok(dbIdentity.rows[0].address, "PostgreSQL must report an active server address")

    const health = await request("GET", "/health")
    assert.equal(health.status, 200, "Native API health request failed")
    for (const [index, bearer] of [ownerBearer, inviteeBearer].entries()) {
      const authCheck = await request("GET", "/admin/users/me", bearer)
      assert.equal(authCheck.status, 200, "A test bearer is not an authenticated platform user")
      assert.equal(authCheck.data.user.id, [owner, invitee][index].actor_id)
      assert.equal(authCheck.data.user.email, credentials[index].email)
    }

    const providerIdentity = await db.query(
      "select entity_id from provider_identity where auth_identity_id=$1 and provider=$2 and deleted_at is null",
      [invitee.auth_identity_id, invitee.auth_provider]
    )
    assert.equal(providerIdentity.rowCount, 1, "Invitee must have exactly one identity for the authenticated provider")
    assert.equal(providerIdentity.rows[0].entity_id.trim().toLowerCase(), inviteeEmail.trim().toLowerCase(), "Signed email must match the authenticated provider identity")

    const existingVerification = await db.query(
      "select id from auth_verification where auth_identity_id=$1 and entity_id=$2 and entity_type='email' and deleted_at is null",
      [invitee.auth_identity_id, providerIdentity.rows[0].entity_id]
    )
    assert.equal(existingVerification.rowCount, 0, "Use a fresh synthetic invitee auth identity without an existing email-verification fixture")
    verificationFixtureId = `authver_${randomUUID()}`
    await db.query(
      `insert into auth_verification
       (id, auth_identity_id, entity_id, entity_type, code_provider, verified_at, requested_at, created_at, updated_at)
       values ($1,$2,$3,'email','token',now(),now(),now(),now())`,
      [verificationFixtureId, invitee.auth_identity_id, providerIdentity.rows[0].entity_id]
    )

    const createOrganization = async (name, actors = [owner]) => {
      const response = await request("POST", "/admin/dogruadres/organizations", ownerBearer, {
        name: `${name}-${randomUUID()}`,
        initial_owners: actors.map((actor) => ({ actor_type: actor.actor_type, actor_id: actor.actor_id })),
      })
      assert.equal(response.status, 201, "Organization provisioning failed")
      organizations.push(response.data.organization.id)
      return response.data.organization.id
    }
    const createInvitation = async (organizationId, email = inviteeEmail, role = "member") => {
      const response = await request("POST", `/dogruadres/organizations/${organizationId}/invitations`, ownerBearer, { email, role })
      assert.equal(response.status, 201, "Invitation creation failed")
      assert.ok(response.data.invitation?.id && response.data.invitation_token, "Invitation response must contain the one-time link token")
      invitations.push(response.data.invitation.id)
      return { id: response.data.invitation.id, token: response.data.invitation_token }
    }
    const accept = (token) => request("POST", "/dogruadres/invitations/accept", inviteeBearer, { token })
    const change = (organizationId, membershipId, bearer, body) => request("POST", `/dogruadres/organizations/${organizationId}/memberships/${membershipId}`, bearer, body)
    const assertInviteeMembershipRevoked = async () => {
      const state = await db.query("select status from da_organization_membership where id=$1", [inviteeMembership.id])
      assert.equal(state.rows[0].status, "revoked", "Rejected invitation must not reactivate the membership")
    }

    await t.test("authentication is required and client verification flags grant no access", async () => {
      assert.equal((await request("POST", "/admin/dogruadres/organizations", undefined, { name: "denied", initial_owners: [] })).status, 401)
      assert.equal((await request("POST", "/dogruadres/invitations/accept", undefined, { token: "not-a-real-token", email: inviteeEmail, email_verified: true })).status, 401)
    })

    await t.test("concurrent first-use invitations create one canonical Person and ActorMapping", async () => {
      const organizationId = await createOrganization("g1-http-first-actor")
      const mappingsBefore = await db.query("select id from da_actor_mapping where actor_type=$1 and actor_id=$2 and deleted_at is null", [invitee.actor_type, invitee.actor_id])
      assert.equal(mappingsBefore.rowCount, 0, "The synthetic invitee must not have a DogruAdres mapping yet")
      const peopleBefore = new Set((await db.query("select id from da_person")).rows.map((row) => row.id))
      const competing = [await createInvitation(organizationId, inviteeEmail, "member"), await createInvitation(organizationId, inviteeEmail, "admin")]
      try {
        assert.notEqual(competing[0].id, competing[1].id)
        assert.ok(competing[0].token !== competing[1].token, "First-use requests require distinct tokens")
        const pending = await db.query("select status, recipient_email from da_organization_invitation where id=any($1::text[]) and organization_id=$2 and deleted_at is null", [competing.map((entry) => entry.id), organizationId])
        assert.equal(pending.rowCount, 2)
        assert.ok(pending.rows.every((row) => row.status === "pending" && row.recipient_email === inviteeEmail))
        const responses = await Promise.all(competing.map((entry) => accept(entry.token)))
        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 403])
        const winnerIndex = responses.findIndex((response) => response.status === 200)
        assert.equal(responses[1 - winnerIndex].data.type, "forbidden")
        assert.match(responses[1 - winnerIndex].data.message, /active membership.*already exists/i)
        const mapping = await db.query("select person_id from da_actor_mapping where actor_type=$1 and actor_id=$2 and deleted_at is null", [invitee.actor_type, invitee.actor_id])
        assert.equal(mapping.rowCount, 1)
        const personId = mapping.rows[0].person_id
        const newPeople = (await db.query("select id from da_person")).rows.filter((row) => !peopleBefore.has(row.id))
        assert.deepEqual(newPeople.map((row) => row.id), [personId], "No duplicate or orphan Person may be created by first-use requests")
        const membership = await db.query("select id, role, status from da_organization_membership where person_id=$1 and organization_id=$2 and deleted_at is null", [personId, organizationId])
        assert.equal(membership.rowCount, 1)
        assert.equal(membership.rows[0].status, "active")
        assert.equal(membership.rows[0].id, responses[winnerIndex].data.membership.id)
        assert.equal(membership.rows[0].role, winnerIndex === 0 ? "member" : "admin")
        const persisted = await db.query("select id, status, accepted_by_person_id, accepted_at from da_organization_invitation where id=any($1::text[]) and deleted_at is null", [competing.map((entry) => entry.id)])
        assert.equal(persisted.rowCount, 2)
        const winner = persisted.rows.find((row) => row.id === competing[winnerIndex].id)
        const loser = persisted.rows.find((row) => row.id === competing[1 - winnerIndex].id)
        assert.equal(winner.status, "accepted")
        assert.equal(winner.accepted_by_person_id, personId)
        assert.ok(winner.accepted_at)
        assert.equal(loser.status, "pending")
        assert.equal(loser.accepted_by_person_id, null)
        assert.equal(loser.accepted_at, null)
        const audit = await db.query("select target_id, actor_person_id, new_values from da_audit_event where action='organization.invitation_accepted' and target_id=any($1::text[]) and deleted_at is null", [competing.map((entry) => entry.id)])
        assert.equal(audit.rowCount, 1)
        assert.equal(audit.rows[0].target_id, winner.id)
        assert.equal(audit.rows[0].actor_person_id, personId)
        assert.equal(audit.rows[0].new_values.membership_id, membership.rows[0].id)
      } finally {
        for (const entry of competing) entry.token = ""
      }
    })

    await t.test("fresh verified invitation establishes a real HTTP membership", async () => {
      const organizationId = await createOrganization("g1-http-org-a")
      const invitation = await createInvitation(organizationId)
      const accepted = await accept(invitation.token)
      assert.equal(accepted.status, 200)
      assert.equal(accepted.data.membership.status, "active")
      assert.equal(accepted.data.membership.organization_id, organizationId)
      t.after(() => { invitation.token = "" })
    })

    const orgA = organizations.at(-1)
    let memberships = await request("GET", `/dogruadres/organizations/${orgA}/memberships`, ownerBearer)
    assert.equal(memberships.status, 200)
    const inviteeMembership = memberships.data.memberships.find((entry) => entry.status === "active" && entry.role === "member")
    assert.ok(inviteeMembership, "The invitee membership was not persisted")

    await t.test("Organization IDs do not grant cross-Organization reads", async () => {
      const organizationB = await createOrganization("g1-http-org-b")
      const denied = await request("GET", `/dogruadres/organizations/${organizationB}`, inviteeBearer)
      assert.equal(denied.status, 403)
      const deniedWrite = await change(organizationB, inviteeMembership.id, inviteeBearer, { role: "admin" })
      assert.equal(deniedWrite.status, 403)
    })

    await t.test("revocation removes access and ordinary membership changes cannot reactivate or role-edit", async () => {
      const revoked = await change(orgA, inviteeMembership.id, ownerBearer, { status: "revoked" })
      assert.equal(revoked.status, 200)
      const accessAfterRevocation = await request("GET", `/dogruadres/organizations/${orgA}`, inviteeBearer)
      assert.equal(accessAfterRevocation.status, 403)
      for (const body of [{ status: "active" }, { role: "admin" }]) {
        const denied = await change(orgA, inviteeMembership.id, ownerBearer, body)
        assert.equal(denied.status, 403)
        const persisted = await db.query("select status, role from da_organization_membership where id=$1", [inviteeMembership.id])
        assert.equal(persisted.rows[0].status, "revoked")
        assert.equal(persisted.rows[0].role, "member")
      }
    })

    await t.test("only a fresh valid invitation reactivates the existing membership; replay is denied", async () => {
      const fresh = await createInvitation(orgA)
      const accepted = await accept(fresh.token)
      assert.equal(accepted.status, 200)
      assert.equal(accepted.data.membership.id, inviteeMembership.id)
      assert.equal(accepted.data.membership.status, "active")
      const replay = await accept(fresh.token)
      assert.equal(replay.status, 403)
      fresh.token = ""
    })

    await t.test("wrong-recipient, expired, revoked, unverified, missing and unrelated-type verification cannot accept", async () => {
      assert.equal((await change(orgA, inviteeMembership.id, ownerBearer, { status: "revoked" })).status, 200)
      const wrongRecipient = await createInvitation(orgA, `wrong-${randomUUID()}@example.invalid`)
      assert.equal((await accept(wrongRecipient.token)).status, 403)
      await assertInviteeMembershipRevoked()
      wrongRecipient.token = ""

      const unrelated = await createInvitation(orgA)
      await db.query("update auth_verification set entity_type='invitation' where id=$1", [verificationFixtureId])
      assert.equal((await accept(unrelated.token)).status, 403)
      await assertInviteeMembershipRevoked()
      unrelated.token = ""
      await db.query("update auth_verification set entity_type='email' where id=$1", [verificationFixtureId])

      const mismatchedVerification = await createInvitation(orgA)
      await db.query("update auth_verification set entity_id=$2 where id=$1", [verificationFixtureId, `different-${randomUUID()}@example.invalid`])
      assert.equal((await accept(mismatchedVerification.token)).status, 403)
      await assertInviteeMembershipRevoked()
      mismatchedVerification.token = ""
      await db.query("update auth_verification set entity_id=$2 where id=$1", [verificationFixtureId, providerIdentity.rows[0].entity_id])

      const foreignVerification = await createInvitation(orgA)
      await db.query("update auth_verification set auth_identity_id=$2 where id=$1", [verificationFixtureId, owner.auth_identity_id])
      try {
        assert.equal((await accept(foreignVerification.token)).status, 403)
        await assertInviteeMembershipRevoked()
      } finally {
        await db.query("update auth_verification set auth_identity_id=$2 where id=$1", [verificationFixtureId, invitee.auth_identity_id])
        foreignVerification.token = ""
      }

      const ambiguousProvider = await createInvitation(orgA)
      const extraProviderId = `authprov_${randomUUID()}`
      await db.query("insert into provider_identity (id,auth_identity_id,entity_id,provider) values ($1,$2,$3,$4)",
        [extraProviderId, invitee.auth_identity_id, `ambiguous-${randomUUID()}@example.invalid`, invitee.auth_provider])
      try {
        assert.equal((await accept(ambiguousProvider.token)).status, 403)
        await assertInviteeMembershipRevoked()
      } finally {
        await db.query("delete from provider_identity where id=$1", [extraProviderId])
        ambiguousProvider.token = ""
      }

      const unverified = await createInvitation(orgA)
      await db.query("update auth_verification set verified_at=null where id=$1", [verificationFixtureId])
      assert.equal((await accept(unverified.token)).status, 403)
      const spoofedVerification = await request("POST", "/dogruadres/invitations/accept", inviteeBearer, {
        token: unverified.token,
        email: inviteeEmail,
        email_verified: true,
      })
      assert.equal(spoofedVerification.status, 400, "Client verification fields must be rejected by the strict request validator")
      assert.equal(spoofedVerification.data.type, "invalid_data")
      assert.match(spoofedVerification.data.message, /Unrecognized fields: 'email, email_verified'/)
      await assertInviteeMembershipRevoked()
      unverified.token = ""
      await db.query("update auth_verification set verified_at=now() where id=$1", [verificationFixtureId])

      const deleted = await createInvitation(orgA)
      await db.query("update auth_verification set deleted_at=now() where id=$1", [verificationFixtureId])
      assert.equal((await accept(deleted.token)).status, 403)
      await assertInviteeMembershipRevoked()
      deleted.token = ""
      await db.query("update auth_verification set deleted_at=null where id=$1", [verificationFixtureId])

      const missing = await createInvitation(orgA)
      await db.query("delete from auth_verification where id=$1", [verificationFixtureId])
      assert.equal((await accept(missing.token)).status, 403)
      await assertInviteeMembershipRevoked()
      missing.token = ""
      await db.query(`insert into auth_verification
        (id, auth_identity_id, entity_id, entity_type, code_provider, verified_at, requested_at, created_at, updated_at)
        values ($1,$2,$3,'email','token',now(),now(),now(),now())`,
        [verificationFixtureId, invitee.auth_identity_id, providerIdentity.rows[0].entity_id])

      const expired = await createInvitation(orgA)
      await db.query("update da_organization_invitation set expires_at=now()-interval '1 second' where id=$1", [expired.id])
      assert.equal((await accept(expired.token)).status, 403)
      await assertInviteeMembershipRevoked()
      expired.token = ""

      const revoked = await createInvitation(orgA)
      const revoke = await request("DELETE", `/dogruadres/organizations/${orgA}/invitations/${revoked.id}`, ownerBearer)
      assert.equal(revoke.status, 200)
      assert.equal((await accept(revoked.token)).status, 403)
      await assertInviteeMembershipRevoked()
      revoked.token = ""
    })

    await t.test("concurrent acceptance consumes one fresh invitation exactly once", async () => {
      await assertInviteeMembershipRevoked()
      const invitation = await createInvitation(orgA)
      const responses = await Promise.all([accept(invitation.token), accept(invitation.token)])
      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 403])
      const state = await db.query("select status from da_organization_membership where id=$1", [inviteeMembership.id])
      assert.equal(state.rows[0].status, "active")
      const accepted = await db.query("select status, accepted_by_person_id from da_organization_invitation where id=$1", [invitation.id])
      assert.equal(accepted.rows[0].status, "accepted")
      invitation.token = ""
    })

    await t.test("different invitations serialize reactivation of the same Person/Organization membership", async () => {
      assert.equal((await change(orgA, inviteeMembership.id, ownerBearer, { status: "revoked" })).status, 200)
      await assertInviteeMembershipRevoked()
      const competing = [await createInvitation(orgA, inviteeEmail, "member"), await createInvitation(orgA, inviteeEmail, "admin")]
      try {
        assert.notEqual(competing[0].id, competing[1].id, "Distinct invitation records are required")
        assert.ok(competing[0].token !== competing[1].token, "Distinct invitation tokens are required")
        const before = await db.query("select id, status, recipient_email from da_organization_invitation where id=any($1::text[]) and organization_id=$2 and deleted_at is null", [competing.map((entry) => entry.id), orgA])
        assert.equal(before.rowCount, 2)
        assert.ok(before.rows.every((row) => row.status === "pending" && row.recipient_email === inviteeEmail.trim().toLowerCase()))
        const responses = await Promise.all(competing.map((entry) => accept(entry.token)))
        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 403])
        const winnerIndex = responses.findIndex((response) => response.status === 200)
        const winner = competing[winnerIndex]
        const loser = competing[1 - winnerIndex]
        assert.equal(responses[1 - winnerIndex].data.type, "forbidden")
        assert.match(responses[1 - winnerIndex].data.message, /active membership.*already exists/i)
        assert.equal(responses[winnerIndex].data.membership.id, inviteeMembership.id)
        const state = await db.query("select id, person_id, role, status, protected_owner, revoked_at from da_organization_membership where person_id=$1 and organization_id=$2 and deleted_at is null", [inviteeMembership.person_id, orgA])
        assert.equal(state.rowCount, 1)
        assert.equal(state.rows[0].id, inviteeMembership.id)
        assert.equal(state.rows[0].status, "active")
        assert.equal(state.rows[0].role, winnerIndex === 0 ? "member" : "admin")
        assert.equal(state.rows[0].protected_owner, false)
        assert.equal(state.rows[0].revoked_at, null)
        const persisted = await db.query("select id, role, status, accepted_by_person_id, accepted_at from da_organization_invitation where id=any($1::text[]) and deleted_at is null", [competing.map((entry) => entry.id)])
        assert.equal(persisted.rowCount, 2)
        const accepted = persisted.rows.find((row) => row.id === winner.id)
        const pending = persisted.rows.find((row) => row.id === loser.id)
        assert.equal(accepted.status, "accepted")
        assert.equal(accepted.accepted_by_person_id, inviteeMembership.person_id)
        assert.ok(accepted.accepted_at)
        assert.equal(state.rows[0].role, accepted.role)
        assert.equal(pending.status, "pending")
        assert.equal(pending.accepted_by_person_id, null)
        assert.equal(pending.accepted_at, null)
        const audit = await db.query("select target_id, actor_person_id, module, new_values from da_audit_event where action='organization.invitation_accepted' and target_id=any($1::text[]) and organization_id=$2 and deleted_at is null", [competing.map((entry) => entry.id), orgA])
        assert.equal(audit.rowCount, 1, "Only one successful acceptance may be audited")
        assert.equal(audit.rows[0].target_id, winner.id)
        assert.equal(audit.rows[0].actor_person_id, inviteeMembership.person_id)
        assert.equal(audit.rows[0].module, "dogruadres-access")
        assert.equal(audit.rows[0].new_values.membership_id, inviteeMembership.id)
      } finally {
        for (const entry of competing) entry.token = ""
      }
    })

    await t.test("normalized email verification accepts raw case and whitespace differences", async () => {
      const organizationId = await createOrganization("g1-http-normalized-email")
      const invitation = await createInvitation(organizationId)
      const rawEmail = `  ${providerIdentity.rows[0].entity_id.toUpperCase()}  `
      assert.notEqual(rawEmail, providerIdentity.rows[0].entity_id)
      assert.equal(rawEmail.trim().toLowerCase(), inviteeEmail.trim().toLowerCase())
      try {
        await db.query("update auth_verification set entity_id=$2 where id=$1", [verificationFixtureId, rawEmail])
        const result = await accept(invitation.token)
        assert.equal(result.status, 200)
        const persisted = await db.query("select status, accepted_by_person_id from da_organization_invitation where id=$1", [invitation.id])
        assert.equal(persisted.rows[0].status, "accepted")
        assert.equal(persisted.rows[0].accepted_by_person_id, inviteeMembership.person_id)
        assert.equal(result.data.membership.organization_id, organizationId)
        assert.equal(result.data.membership.status, "active")
      } finally {
        await db.query("update auth_verification set entity_id=$2 where id=$1", [verificationFixtureId, providerIdentity.rows[0].entity_id])
        invitation.token = ""
      }
    })

    await t.test("targeted audit insert failure rolls back invitation acceptance and membership reactivation", async () => {
      assert.equal((await change(orgA, inviteeMembership.id, ownerBearer, { status: "revoked" })).status, 200)
      await assertInviteeMembershipRevoked()
      const before = await db.query("select role, protected_owner, revoked_at from da_organization_membership where id=$1", [inviteeMembership.id])
      const invitation = await createInvitation(orgA)
      const artifact = `da_test_audit_${randomBytes(12).toString("hex")}`
      assert.match(artifact, /^[a-z0-9_]+$/)
      assert.match(invitation.id, /^[a-zA-Z0-9_]+$/)
      try {
        try {
          await db.query(`CREATE FUNCTION public.${artifact}() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              IF NEW.action = 'organization.invitation_accepted' AND NEW.target_id = TG_ARGV[0] THEN
                RAISE EXCEPTION 'DogruAdres targeted audit fault';
              END IF;
              RETURN NEW;
            END $$`)
          await db.query(`CREATE TRIGGER ${artifact} BEFORE INSERT ON public.da_audit_event FOR EACH ROW EXECUTE FUNCTION public.${artifact}('${invitation.id}')`)
          const result = await accept(invitation.token)
          assert.equal(result.status, 500, "Targeted audit failure must fail the real HTTP request")
          const membership = await db.query("select status, role, protected_owner, revoked_at from da_organization_membership where id=$1", [inviteeMembership.id])
          assert.equal(membership.rows[0].status, "revoked")
          assert.equal(membership.rows[0].role, before.rows[0].role)
          assert.equal(membership.rows[0].protected_owner, before.rows[0].protected_owner)
          assert.deepEqual(membership.rows[0].revoked_at, before.rows[0].revoked_at)
          const pending = await db.query("select status, accepted_by_person_id, accepted_at from da_organization_invitation where id=$1", [invitation.id])
          assert.equal(pending.rows[0].status, "pending")
          assert.equal(pending.rows[0].accepted_by_person_id, null)
          assert.equal(pending.rows[0].accepted_at, null)
          const audit = await db.query("select id from da_audit_event where action='organization.invitation_accepted' and target_id=$1", [invitation.id])
          assert.equal(audit.rowCount, 0)
        } finally {
          try {
            await db.query(`DROP TRIGGER IF EXISTS ${artifact} ON public.da_audit_event`)
          } finally {
            await db.query(`DROP FUNCTION IF EXISTS public.${artifact}()`)
          }
        }
        const leftovers = await db.query("select (select count(*) from pg_trigger where tgname=$1)::int as triggers, (select count(*) from pg_proc where proname=$1)::int as functions", [artifact])
        assert.deepEqual(leftovers.rows[0], { triggers: 0, functions: 0 })
        const normal = await accept(invitation.token)
        assert.equal(normal.status, 200, "The same pending invitation must work after removing the injected fault")
        assert.equal(normal.data.membership.id, inviteeMembership.id)
        const audit = await db.query("select id from da_audit_event where action='organization.invitation_accepted' and target_id=$1", [invitation.id])
        assert.equal(audit.rowCount, 1)
      } finally {
        invitation.token = ""
      }
    })

    await t.test("concurrent last-protected-Owner revocation leaves one active protected Owner", async () => {
      const organizationId = await createOrganization("g1-http-org-concurrent-owner", [owner, invitee])
      const ownerRows = await request("GET", `/dogruadres/organizations/${organizationId}/memberships`, ownerBearer)
      const protectedOwners = ownerRows.data.memberships.filter((entry) => entry.protected_owner && entry.status === "active")
      assert.equal(protectedOwners.length, 2)
      const firstActor = protectedOwners.find((entry) => entry.person_id !== protectedOwners[0].person_id)
      assert.ok(firstActor)
      const first = change(organizationId, firstActor.id, ownerBearer, { status: "revoked" })
      const second = change(organizationId, protectedOwners[0].id, inviteeBearer, { status: "revoked" })
      const responses = await Promise.all([first, second])
      assert.equal(responses.filter((response) => response.status === 200).length, 1)
      assert.equal(responses.filter((response) => response.status === 403).length, 1)
      const state = await db.query("select count(*)::int as count from da_organization_membership where organization_id=$1 and status='active' and protected_owner=true", [organizationId])
      assert.equal(state.rows[0].count, 1)
    })

    await t.test("all foundation audit events persist the server-owned module value", async () => {
      const audit = await db.query(
        "select action, module from da_audit_event where organization_id = any($1::text[])",
        [organizations]
      )
      const actions = new Set(audit.rows.filter((row) => row.module === "dogruadres-access").map((row) => row.action))
      for (const action of ["organization.provisioned", "organization.owner_assigned", "organization.membership_changed", "organization.invitation_created", "organization.invitation_revoked", "organization.invitation_accepted"]) {
        assert.ok(actions.has(action), `Missing module-tagged audit event for ${action}`)
      }
      assert.ok(audit.rows.every((row) => row.module === "dogruadres-access"), "A foundation audit event has an unexpected module")
    })
  } finally {
    if (verificationFixtureId) {
      await db.query("delete from auth_verification where id=$1", [verificationFixtureId])
    }
    await db.end()
    // Organizations and their audit evidence are deliberately retained in the disposable G1 database.
    void invitations
  }
})
