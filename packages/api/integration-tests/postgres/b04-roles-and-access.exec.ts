/** B04 only. Real native providers, shipped HTTP middleware/routes and separate
 * PostgreSQL readback in the existing CLI harness's one disposable database.
 * Admin and Member role acceptance, revoked membership denial, suspended Organization denial.
 * No grants, MFA factors, invitations, external delivery or protected resources.
 */
import assert from "node:assert/strict"
import { randomBytes, createHash } from "node:crypto"
import type { ExecArgs, IAuthModuleService, IUserModuleService } from "@medusajs/framework/types"
import { Client } from "@medusajs/framework/pg"
import Foundation from "../../src/modules/dogruadres-access/service"
import { createPersonalHttpApp } from "../../src/scripts/personal-http-runtime"

export default async function({ container }: ExecArgs) {
  const u = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid")
  assert.ok(process.env.CI === "true" && process.env.PG_MFA_TEST_SENTINEL === "mfa-pg16-disposable-ci-v1" &&
    u.protocol === "postgres:" && u.hostname === "127.0.0.1" && u.port === "5432" && u.username === "mfa_test" &&
    u.password === "ci-disposable-only-not-a-real-secret" && /^\/mfa_cli_ci_[a-f0-9]{16}$/.test(u.pathname) &&
    process.env.PG_MFA_NATIVE_TEST_DATABASE === u.pathname.slice(1) && process.env.DOGRUADRES_IDENTITY_ENABLED === "true" &&
    process.env.DOGRUADRES_MFA_RUNTIME_ENABLED === "false", "REFUSED: wrong disposable B04 environment")
  const pg = new Client({ connectionString: u.toString() }); await pg.connect()
  const report: any = { scope: "B04 native HTTP/SQL only; no Chrome", http: [], checks: {}, acceptance: "OPEN" }
  let http: Awaited<ReturnType<typeof createPersonalHttpApp>> | undefined, server: any
  const rows = async (q: string, p: any[] = []) => (await pg.query(q, p)).rows
  const count = async (t: string) => Number((await rows(`select count(*)::int n from "${t}"`))[0].n)
  const snapshot = async () => {
    const result: Record<string, { count: number; hash: string }> = {}
    for (const { tablename } of await rows("select tablename from pg_tables where schemaname='public' order by tablename"))
      result[tablename] = (await rows(`select count(*)::int count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\\n' order by to_jsonb(r)::text),'')) hash from "${tablename}" r`))[0]
    return result
  }
  try {
    assert.equal((await rows("select current_database() db,current_setting('server_version_num') ver"))[0].db, u.pathname.slice(1))
    assert.match((await rows("show server_version_num"))[0].server_version_num, /^16\d{4}$/)
    const empty = ["da_person", "user", "customer", "auth_identity", "provider_identity", "da_actor_mapping", "da_login_binding",
      "da_browser_session", "da_actor_link_intent", "auth_mfa_factor", "da_organization", "da_organization_membership", "da_platform_staff_grant"]
    for (const t of empty) assert.equal(await count(t), 0, "Nonempty disposable fixture table: " + t)

    const auth: IAuthModuleService = container.resolve("auth")
    const users: IUserModuleService = container.resolve("user")
    const foundation: Foundation = container.resolve("dogruadresAccess")

    const suffix = randomBytes(8).toString("hex")
    const emailA = `b04-a-${suffix}@example.invalid`
    const emailB = `b04-b-${suffix}@example.invalid`
    const passwordA = randomBytes(32).toString("base64url")
    const passwordB = randomBytes(32).toString("base64url")

    // Fixtures: 2 native user actors, 2 credential identities
    const userA = await users.createUsers({ email: emailA })
    const userB = await users.createUsers({ email: emailB })
    const regA = await auth.register("emailpass", { body: { email: emailA, password: passwordA } })
    const regB = await auth.register("emailpass", { body: { email: emailB, password: passwordB } })
    assert.ok(regA.success && regA.authIdentity && regB.success && regB.authIdentity)
    const aidA = regA.authIdentity!.id, aidB = regB.authIdentity!.id
    await auth.updateAuthIdentities([
      { id: aidA, app_metadata: { user_id: userA.id } },
      { id: aidB, app_metadata: { user_id: userB.id } },
    ])

    // Fixtures: 2 synthetic Persons
    const persons = await foundation.createPeople([{}, {}])
    assert.equal(persons.length, 2)
    const personA = persons[0], personB = persons[1]

    await foundation.createActorMappings([
      { actor_type: "user", actor_id: userA.id, person_id: personA.id, created_by_actor_type: "user", created_by_actor_id: userA.id },
      { actor_type: "user", actor_id: userB.id, person_id: personB.id, created_by_actor_type: "user", created_by_actor_id: userB.id },
    ])

    await pg.query(
      "insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now()),($4,$5,'user',$6,now())",
      [aidA, personA.id, userA.id, aidB, personB.id, userB.id]
    )

    // Fixtures: 2 Organizations
    const orgs = await foundation.createOrganizations([
      { name: `Org 1 ${suffix}`, status: "active" },
      { name: `Org 2 ${suffix}`, status: "active" },
    ])
    assert.equal(orgs.length, 2)
    const org1 = orgs[0], org2 = orgs[1]

    // Fixtures: 4 memberships
    // Person A: protected Owner in both Organizations
    // Person B: Admin in Org 1, Member in Org 2
    const [mOwner1, mOwner2, mAdminB, mMemberB] = await foundation.createMemberships([
      { organization_id: org1.id, person_id: personA.id, role: "owner", status: "active", protected_owner: true },
      { organization_id: org2.id, person_id: personA.id, role: "owner", status: "active", protected_owner: true },
      { organization_id: org1.id, person_id: personB.id, role: "admin", status: "active", protected_owner: false },
      { organization_id: org2.id, person_id: personB.id, role: "member", status: "active", protected_owner: false },
    ])

    // Verify initial fixture counts
    assert.equal(await count("da_person"), 2)
    assert.equal(await count("user"), 2)
    assert.equal(await count("auth_identity"), 2)
    assert.equal(await count("da_actor_mapping"), 2)
    assert.equal(await count("da_login_binding"), 2)
    assert.equal(await count("da_organization"), 2)
    assert.equal(await count("da_organization_membership"), 4)

    const before = await snapshot()

    http = await createPersonalHttpApp(container)
    server = await new Promise<any>(resolve => { const s = http!.app.listen(0, "127.0.0.1", () => resolve(s)) })
    const origin = "http://127.0.0.1:" + server.address().port

    const call = async (label: string, path: string, options: { method?: string; body?: object; cookie?: string; csrf?: string } = {}) => {
      const response = await fetch(origin + path, {
        method: options.method ?? "GET",
        headers: {
          Origin: process.env.DOGRUADRES_PUBLIC_ORIGIN!,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.cookie ? { Cookie: options.cookie } : {}),
          ...(options.csrf ? { "x-csrf-token": options.csrf } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(15000),
      })
      report.http.push({ case: label, method: options.method ?? "GET", path, status: response.status })
      return response
    }

    // Step 1: Authenticate Person B through supported native path
    const loginB = await call("Person B native password login", "/personal/session", {
      method: "POST",
      body: { email: emailB, password: passwordB },
    })
    assert.equal(loginB.status, 200)
    const cookieHeader = loginB.headers.getSetCookie().find(c => c.startsWith("da_session=")) ?? ""
    const cookie = cookieHeader.split(";")[0]
    assert.ok(cookie.startsWith("da_session="))
    const { csrf_token } = await loginB.json() as any
    assert.ok(typeof csrf_token === "string")
    assert.equal(await count("da_browser_session"), 1)

    // Verify session belongs to Person B
    const sessionRes = await call("Person B session identity", "/personal/session", { cookie })
    assert.equal(sessionRes.status, 200)
    const sessionData = await sessionRes.json() as any
    assert.equal(sessionData.person_id, personB.id)

    // Unscoped chooser: Person B sees both Org 1 (admin) and Org 2 (member)
    const chooserInitial = await call("Person B unscoped chooser", "/personal/organizations", { cookie })
    assert.equal(chooserInitial.status, 200)
    const chooserData = await chooserInitial.json() as any
    assert.equal(chooserData.person_id, personB.id)
    assert.equal(chooserData.organizations.length, 2)
    const org1InChooser = chooserData.organizations.find((o: any) => o.id === org1.id)
    const org2InChooser = chooserData.organizations.find((o: any) => o.id === org2.id)
    assert.ok(org1InChooser && org1InChooser.role === "admin")
    assert.ok(org2InChooser && org2InChooser.role === "member")

    // Step 2: Verify Organization 1 (Admin)
    const org1Res = await call("Person B select Org 1 (Admin)", `/personal/organizations?id=${org1.id}`, { cookie })
    assert.equal(org1Res.status, 200)
    const org1Data = await org1Res.json() as any
    assert.equal(org1Data.person_id, personB.id)
    assert.equal(org1Data.organizations.length, 1)
    assert.deepEqual(org1Data.organizations[0], {
      id: org1.id,
      name: org1.name,
      membership_id: mAdminB.id,
      role: "admin",
    })

    // Permitted actions for Admin: Can read memberships in Org 1
    const org1Memberships = await call("Person B read Org 1 memberships as Admin", `/personal/memberships?organization=${org1.id}`, { cookie })
    assert.equal(org1Memberships.status, 200)
    const org1MembershipsData = await org1Memberships.json() as any
    assert.ok(Array.isArray(org1MembershipsData.memberships))
    assert.equal(org1MembershipsData.memberships.length, 2)

    // Step 3: Verify Organization 2 (Member)
    const org2Res = await call("Person B select Org 2 (Member)", `/personal/organizations?id=${org2.id}`, { cookie })
    assert.equal(org2Res.status, 200)
    const org2Data = await org2Res.json() as any
    assert.equal(org2Data.person_id, personB.id)
    assert.equal(org2Data.organizations.length, 1)
    assert.deepEqual(org2Data.organizations[0], {
      id: org2.id,
      name: org2.name,
      membership_id: mMemberB.id,
      role: "member",
    })

    // No Admin or Owner privilege in Org 2: Cannot read memberships in Org 2
    const org2Memberships = await call("Person B read Org 2 memberships as Member denied", `/personal/memberships?organization=${org2.id}`, { cookie })
    assert.equal(org2Memberships.status, 403)
    assert.equal((await org2Memberships.json() as any).message, "Access denied")

    // Refresh simulation: re-querying Org 2 succeeds with Member role
    const org2Refresh = await call("Person B refresh Org 2 scope", `/personal/organizations?id=${org2.id}`, { cookie })
    assert.equal(org2Refresh.status, 200)
    assert.equal((await org2Refresh.json() as any).organizations[0].role, "member")

    // Step 4: Revoke ONLY Person B's disposable Org 1 membership through supported native Foundation authorization/transaction path
    const revokedMembership = await foundation.changeMembership({
      organization_id: org1.id,
      membership_id: mAdminB.id,
      actor_person_id: personA.id,
      actor_type: "user",
      actor_id: userA.id,
      status: "revoked",
    })
    assert.equal(revokedMembership.status, "revoked")
    assert.equal(revokedMembership.protected_owner, false)
    assert.ok(revokedMembership.revoked_at instanceof Date)

    // Verify SQL revoked state
    const mAdminBRow = (await rows("select status, role, revoked_at is not null has_revoked_at, protected_owner from da_organization_membership where id=$1", [mAdminB.id]))[0]
    assert.deepEqual(mAdminBRow, { status: "revoked", role: "admin", has_revoked_at: true, protected_owner: false })

    // Verify Person A's Owner membership in Org 1 remains active and protected
    const mOwner1Row = (await rows("select status, role, protected_owner from da_organization_membership where id=$1", [mOwner1.id]))[0]
    assert.deepEqual(mOwner1Row, { status: "active", role: "owner", protected_owner: true })

    // Person B access to Org 1 is now DENIED (HTTP 403)
    const org1RevokedRes = await call("Person B select revoked Org 1 denied", `/personal/organizations?id=${org1.id}`, { cookie })
    assert.equal(org1RevokedRes.status, 403)
    assert.equal((await org1RevokedRes.json() as any).message, "Access denied")

    // Unscoped chooser does not leak Org 1; only Org 2 is returned
    const chooserAfterRevoke = await call("Person B chooser hides revoked Org 1", "/personal/organizations", { cookie })
    assert.equal(chooserAfterRevoke.status, 200)
    const chooserAfterRevokeData = await chooserAfterRevoke.json() as any
    assert.equal(chooserAfterRevokeData.organizations.length, 1)
    assert.equal(chooserAfterRevokeData.organizations[0].id, org2.id)
    assert.equal(chooserAfterRevokeData.organizations[0].role, "member")

    // Org 2 continues to work unaffected
    const org2Unaffected = await call("Person B Org 2 remains active after Org 1 revoke", `/personal/organizations?id=${org2.id}`, { cookie })
    assert.equal(org2Unaffected.status, 200)
    assert.equal((await org2Unaffected.json() as any).organizations[0].id, org2.id)

    // Step 5: Suspend ONLY disposable Organization 2 through supported native model/service path
    const [suspendedOrg2] = await foundation.updateOrganizations([{ id: org2.id, status: "suspended" }])
    assert.equal(suspendedOrg2.status, "suspended")

    // Verify SQL suspended state
    const org2Row = (await rows("select status from da_organization where id=$1", [org2.id]))[0]
    assert.equal(org2Row.status, "suspended")

    // Person B access to Org 2 is now DENIED (HTTP 403)
    const org2SuspendedRes = await call("Person B select suspended Org 2 denied", `/personal/organizations?id=${org2.id}`, { cookie })
    assert.equal(org2SuspendedRes.status, 403)
    assert.equal((await org2SuspendedRes.json() as any).message, "Access denied")

    // Unscoped chooser returns empty list (0 authorized Orgs); no leakage of Org 1 or Org 2
    const chooserAfterSuspend = await call("Person B chooser returns empty list with no active Orgs", "/personal/organizations", { cookie })
    assert.equal(chooserAfterSuspend.status, 200)
    const chooserAfterSuspendData = await chooserAfterSuspend.json() as any
    assert.deepEqual(chooserAfterSuspendData, { person_id: personB.id, organizations: [] })

    // Step 6: Verify invariants and fixture caps
    // Both protected Owners of Person A remain active and protected
    const ownersState = await rows("select organization_id, role, status, protected_owner from da_organization_membership where person_id=$1 order by organization_id", [personA.id])
    assert.deepEqual(ownersState, [
      { organization_id: org1.id, role: "owner", status: "active", protected_owner: true },
      { organization_id: org2.id, role: "owner", status: "active", protected_owner: true },
    ])

    // Canonical Person mappings remain unchanged
    const canonicalMappings = await rows("select person_id, actor_type, actor_id from da_actor_mapping order by person_id")
    assert.deepEqual(canonicalMappings, [
      { person_id: personA.id, actor_type: "user", actor_id: userA.id },
      { person_id: personB.id, actor_type: "user", actor_id: userB.id },
    ])

    // Exact fixture caps
    assert.equal(await count("da_person"), 2, "Exact 2 Persons")
    assert.equal(await count("user"), 2, "Exact 2 users")
    assert.equal(await count("auth_identity"), 2, "Exact 2 AuthIdentities")
    assert.equal(await count("da_organization"), 2, "Exact 2 Organizations")
    assert.equal(await count("da_organization_membership"), 4, "Exact 4 Memberships")
    assert.equal(await count("da_browser_session"), 1, "Exact 1 browser session")
    assert.equal(await count("da_platform_staff_grant"), 0, "Exact 0 staff grants")
    assert.equal(await count("da_machine_grant"), 0, "Exact 0 machine grants")
    assert.equal(await count("auth_mfa_factor"), 0, "Exact 0 MFA factors")

    // Audit and outbox integrity
    const membershipAudit = await rows(
      "select action, actor_person_id, organization_id, target_id from da_audit_event where action='organization.membership_changed'"
    )
    assert.equal(membershipAudit.length, 1)
    assert.deepEqual(membershipAudit[0], {
      action: "organization.membership_changed",
      actor_person_id: personA.id,
      organization_id: org1.id,
      target_id: mAdminB.id,
    })

    const outboxPointers = await rows(
      "select o.id from da_security_outbox o join da_audit_event a on a.id=o.audit_event_id where a.action='organization.membership_changed'"
    )
    assert.equal(outboxPointers.length, 1)

    const after = await snapshot()
    const allowed = new Set([
      "da_person", "da_person_security", "da_browser_session", "da_native_credential",
      "da_login_attempt", "da_audit_event", "da_audit_outbox", "da_security_outbox",
      "da_organization", "da_organization_membership",
    ])
    const changed = Object.keys(before).filter(t => JSON.stringify(before[t]) !== JSON.stringify(after[t]))
    assert.ok(changed.every(t => allowed.has(t)), "Unexpected table writes: " + changed.filter(t => !allowed.has(t)).join(","))

    report.checks = {
      adminAccessSuccess: true,
      adminMembershipReadSuccess: true,
      memberAccessSuccess: true,
      memberMembershipReadDenied: true,
      memberScopeSurvivedRefresh: true,
      adminRevocationSuccess: true,
      revokedAdminAccessDenied: true,
      unscopedChooserHidesRevokedOrg: true,
      unaffectedOrg2RemainsAccessible: true,
      org2SuspensionSuccess: true,
      suspendedOrgAccessDenied: true,
      unscopedChooserEmptyWhenAllDenied: true,
      protectedOwnersPreserved: true,
      canonicalMappingsUnchanged: true,
      fixtureCapsVerified: true,
      auditOutboxIntegrity: true,
    }
    report.tableReadback = { before, after }
    report.counts = Object.fromEntries(await Promise.all([
      "da_person", "user", "auth_identity", "da_actor_mapping", "da_login_binding",
      "da_organization", "da_organization_membership", "da_browser_session",
      "da_native_credential", "da_audit_event", "da_security_outbox",
    ].map(async t => [t, await count(t)])))

    console.log("B04_EVIDENCE " + JSON.stringify(report))
    console.log("PASS B04 bounded HTTP/SQL execution: Admin/Member role access and privilege boundaries; revoked membership 403 and chooser concealment; suspended Organization 403 and private context clearing; protected Owner conservation and audit/outbox integrity")
  } catch (error) {
    report.execution = "FAILED; no retry"
    report.errorType = error instanceof Error ? error.name : "UnknownError"
    report.errorMessage = error instanceof Error ? error.message : String(error)
    console.log("B04_EVIDENCE " + JSON.stringify(report))
    throw new Error("B04 native acceptance assertion failed; see sanitized evidence: " + (error instanceof Error ? error.stack : error))
  } finally {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await http?.close()
    await pg.end()
  }
}
