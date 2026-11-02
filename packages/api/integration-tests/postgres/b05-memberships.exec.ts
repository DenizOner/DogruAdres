/** B05-only adaptation of B04 fixture setup; one existing PG16 harness DB.
 * Only one ordinary membership revoke; no other domain mutation. */
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import type { ExecArgs, IAuthModuleService, IUserModuleService } from "@medusajs/framework/types"
import { Client } from "@medusajs/framework/pg"
import Foundation from "../../src/modules/dogruadres-access/service"
import { createPersonalHttpApp } from "../../src/scripts/personal-http-runtime"
import { verifyB05Ui } from "./b05-ui-browser"

export default async function({ container }: ExecArgs) {
  assert.ok(process.env.PG_MFA_TEST_SCOPE === "b05-ui" && process.env.GITHUB_EVENT_NAME === "workflow_dispatch" && process.env.B05_UI_DISPATCH_SCOPE === "b05-ui", "REFUSED: explicit B05 dispatch required")
  const u = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid")
  assert.ok(process.env.CI === "true" && process.env.PG_MFA_TEST_SENTINEL === "mfa-pg16-disposable-ci-v1" &&
    u.protocol === "postgres:" && u.hostname === "127.0.0.1" && u.port === "5432" && u.username === "mfa_test" &&
    u.password === "ci-disposable-only-not-a-real-secret" && /^\/mfa_cli_ci_[a-f0-9]{16}$/.test(u.pathname) &&
    process.env.PG_MFA_NATIVE_TEST_DATABASE === u.pathname.slice(1) && process.env.DOGRUADRES_IDENTITY_ENABLED === "true" &&
    process.env.DOGRUADRES_MFA_RUNTIME_ENABLED === "false", "REFUSED: wrong disposable B05 environment")
  const pg = new Client({ connectionString: u.toString() }); await pg.connect()
  const report: any = { scope: "B05 real Chrome / native HTTP / PostgreSQL; simulations explicitly separate", browsers: [], sql: {}, acceptance: "OPEN pending independent review" }
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
    const emailA = `b05-a-${suffix}@example.invalid`
    const emailB = `b05-b-${suffix}@example.invalid`
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
    process.env.DOGRUADRES_PUBLIC_ORIGIN = origin
    let browserBCookie = "", revoked = false
    const readback = async (data: any[]) => {
      const active = await rows("select id,person_id,role,status,protected_owner from da_organization_membership where organization_id=$1 and status='active' and deleted_at is null order by id", [org1.id])
      assert.deepEqual([...data].sort((a, b) => a.id.localeCompare(b.id)), active, "Exact native DTO/active PostgreSQL correlation")
    }
    const revoke = async () => {
      assert.equal(revoked, false, "No repeated revoke"); revoked = true
      const result = await foundation.changeMembership({ organization_id: org1.id, membership_id: mAdminB.id,
        actor_person_id: personA.id, actor_type: "user", actor_id: userA.id, status: "revoked" })
      assert.equal(result.status, "revoked")
      assert.deepEqual((await rows("select role,status,protected_owner,revoked_at is not null has_revoked_at from da_organization_membership where id=$1", [mAdminB.id]))[0],
        { role: "admin", status: "revoked", protected_owner: false, has_revoked_at: true })
      assert.ok(browserBCookie)
      const denied = await fetch(origin + "/personal/organizations?id=" + encodeURIComponent(org1.id), { headers: { Cookie: browserBCookie }, signal: AbortSignal.timeout(10000) })
      assert.equal(denied.status, 403)
      report.postRevokeB = { evidence: "NATIVE HTTP ONLY with original Chrome B session", scope: "Org1", status: 403 }
    }
    await verifyB05Ui({ origin, email: emailB, password: passwordB, personId: personB.id, actor: "Admin", org1, org2, report, readback,
      revoke: async () => { throw Error("Admin journey cannot revoke") }, captureSession: cookie => { browserBCookie = cookie } })
    await verifyB05Ui({ origin, email: emailA, password: passwordA, personId: personA.id, actor: "Owner", org1, org2, report, readback, revoke })
    browserBCookie = ""
    assert.equal(revoked, true)
    const expectedOwners = [org1.id, org2.id].sort().map(organization_id => ({ organization_id, role: "owner", status: "active", protected_owner: true }))
    assert.deepEqual(await rows("select organization_id,role,status,protected_owner from da_organization_membership where person_id=$1 order by organization_id", [personA.id]), expectedOwners)
    assert.deepEqual((await rows("select role,status,protected_owner,revoked_at is null no_revoked_at from da_organization_membership where id=$1", [mMemberB.id]))[0],
      { role: "member", status: "active", protected_owner: false, no_revoked_at: true })
    assert.equal((await rows("select count(*)::int n from da_organization where status='active'"))[0].n, 2)
    assert.deepEqual(await rows("select person_id,actor_type,actor_id from da_actor_mapping order by person_id"), [
      { person_id: personA.id, actor_type: "user", actor_id: userA.id }, { person_id: personB.id, actor_type: "user", actor_id: userB.id },
    ].sort((a, b) => a.person_id.localeCompare(b.person_id)))
    const caps = { da_person: 2, user: 2, auth_identity: 2, provider_identity: 2, da_actor_mapping: 2, da_login_binding: 2,
      da_organization: 2, da_organization_membership: 4, da_browser_session: 2, da_native_credential: 2,
      da_platform_staff_grant: 0, da_machine_grant: 0, customer: 0, auth_mfa_factor: 0, auth_mfa_recovery_code: 0, da_organization_invitation: 0,
      da_audit_event: 3, da_security_outbox: 3 }
    for (const [table, n] of Object.entries(caps)) assert.equal(await count(table), n, "Exact fixture cap: " + table)
    assert.equal((await rows("select count(*)::int n from da_browser_session s join da_native_credential n on n.session_id=s.id where s.status='active' and n.retired_at is null and n.expires_at>now() and ((s.person_id=$1 and s.auth_identity_id=$2 and s.actor_id=$3) or (s.person_id=$4 and s.auth_identity_id=$5 and s.actor_id=$6))", [personA.id, aidA, userA.id, personB.id, aidB, userB.id]))[0].n, 2)
    assert.deepEqual(await rows("select action,actor_person_id,organization_id,target_id from da_audit_event where action='organization.membership_changed'"),
      [{ action: "organization.membership_changed", actor_person_id: personA.id, organization_id: org1.id, target_id: mAdminB.id }])
    assert.equal((await rows("select count(*)::int n from da_security_outbox o join da_audit_event a on a.id=o.audit_event_id"))[0].n, 3)
    assert.equal((await rows("select count(*)::int n from da_audit_event a join da_browser_session s on s.id=a.target_id and s.person_id=a.actor_person_id where a.action='session.created'"))[0].n, 2)
    const after = await snapshot(), allowed = new Set(["da_person_security", "da_browser_session", "da_native_credential", "da_login_attempt", "da_audit_event", "da_audit_outbox", "da_security_outbox", "da_organization_membership"])
    const changed = Object.keys(before).filter(t => JSON.stringify(before[t]) !== JSON.stringify(after[t]))
    assert.ok(changed.every(t => allowed.has(t)), "Unexpected database table changes")
    report.sql = { exactFixtureCaps: caps, revokedRowRetained: true, revokedAtPopulated: true, protectedOwnersPreserved: true,
      otherOrgMemberPreserved: true, organizationsActive: true, canonicalMappingsUnchanged: true, exactTwoActiveSessionsAndCredentials: true,
      exactRevokeAuditAndLinkedOutbox: true, exactSessionAudits: true, tableCount: Object.keys(after).length, changedTables: changed, before, after }
    console.log("B05_UI_EVIDENCE " + JSON.stringify(report))
    console.log("PASS B05-UI real Chrome membership listing/refresh; native DTO/no-store and PostgreSQL correlation; simulated states separately labeled")
  } catch (error) {
    report.execution = "FAILED; no retry"; report.errorType = error instanceof Error ? error.name : "UnknownError"
    console.log("B05_UI_EVIDENCE " + JSON.stringify(report))
    throw Error("B05-UI assertion failed; sanitized phases only; no retry")
  } finally {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await http?.close(); await pg.end()
  }
}
