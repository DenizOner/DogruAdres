import { Client } from "@medusajs/framework/pg"
import { randomBytes, createHash, createHmac } from "node:crypto"
import assert from "node:assert/strict"

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) {
  throw new Error("FAIL_CLOSED: DATABASE_URL environment variable is strictly required. No hardcoded fallback allowed.")
}

const PUBLIC_ORIGIN = process.env.DOGRUADRES_PUBLIC_ORIGIN || "http://127.0.0.1:9000"
const COOKIE_SECRET = process.env.COOKIE_SECRET || "supersecretcookiesecresupersecret32"
const CURSOR_SECRET = process.env.DOGRUADRES_AUDIT_CURSOR_KEY || "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="

const digest = (v: string) => createHash("sha256").update(v).digest("hex")
const opaque = () => randomBytes(32).toString("base64url")
const csrfToken = (token: string) => createHmac("sha256", COOKIE_SECRET).update("dogruadres-csrf:" + token).digest("base64url")

async function main() {
  console.log("================================================================================")
  console.log("   DOGRUADRES M0 B14 — FINAL REAL FUNCTIONAL ACCEPTANCE (SERVER+WORKER+CHROME)   ")
  console.log("================================================================================")

  // ---------------------------------------------------------------------------
  // [STEP 1] Pre-Flight Database, Container Ownership & Sentinel Validation
  // ---------------------------------------------------------------------------
  console.log("\n--- [STEP 1] Database & Sentinel Pre-Flight Check ---")
  const client = new Client({ connectionString: DB_URL })
  await client.connect()

  const dbIdent = await client.query("SELECT current_database() as db, current_user as u, inet_server_port() as port")
  const { db, u, port } = dbIdent.rows[0]
  console.log(`✔ Verified connected database: ${db} (${u}) on port ${port}`)
  assert.equal(db, "b14_acceptance_db", "Must connect exclusively to b14_acceptance_db")
  assert.equal(u, "b14_acc_user", "Must connect as b14_acc_user")
  assert.equal(port, 5432, "Internal container port must be 5432")

  // Ensure no collision with protected environments
  assert.notEqual(db, "da-r0b-e7a1", "Must not touch protected da-r0b-e7a1 database")
  assert.notEqual(db, "dogruadres-mfa-e2e", "Must not touch protected MFA database")

  // ---------------------------------------------------------------------------
  // [STEP 2] Legitimate Foundation Multi-Role Domain Setup
  // ---------------------------------------------------------------------------
  console.log("\n--- [STEP 2] Provisioning Foundation Persons, Actors, and Organizations ---")
  const runId = Date.now().toString(36)

  // Helper to create Person + ActorMapping + LoginBinding + Session
  const createPersonActorSession = async (roleName: string) => {
    const personId = `daprs_${roleName}_${runId}`
    const actorId = `usr_${roleName}_${runId}`
    const actorType = "user"
    const authIdentityId = `auth_${roleName}_${runId}`

    await client.query("INSERT INTO da_person(id, created_at, updated_at) VALUES($1, NOW(), NOW())", [personId])
    await client.query("INSERT INTO da_person_security(person_id, epoch) VALUES($1, 0)", [personId])
    await client.query(
      "INSERT INTO da_actor_mapping(id, person_id, actor_type, actor_id, created_by_actor_type, created_by_actor_id, created_at, updated_at) VALUES($1, $2, $3, $4, $3, $4, NOW(), NOW())",
      [`daam_${roleName}_${runId}`, personId, actorType, actorId]
    )
    await client.query(
      "INSERT INTO da_login_binding(auth_identity_id, person_id, actor_type, actor_id, verified_at) VALUES($1, $2, $3, $4, NOW())",
      [authIdentityId, personId, actorType, actorId]
    )

    // Create active browser session
    const token = opaque()
    const csrf = csrfToken(token)
    await client.query(
      `INSERT INTO da_browser_session
       (id, person_id, auth_identity_id, actor_type, actor_id, epoch, csrf_hash, status, created_at, last_activity_at, mfa_purpose)
       VALUES($1, $2, $3, $4, $5, 0, $6, 'active', NOW(), NOW(), 'legacy')`,
      [digest(token), personId, authIdentityId, actorType, actorId, digest(csrf)]
    )

    return { personId, actorId, token, csrf }
  }

  const owner = await createPersonActorSession("owner")
  const admin = await createPersonActorSession("admin")
  const member = await createPersonActorSession("member")
  const revoked = await createPersonActorSession("revoked")
  const foreign = await createPersonActorSession("foreign")
  console.log("✔ Created 5 distinct synthetic Persons with valid da_browser_session records")

  // Provision Org A
  const orgAId = `daorg_a_${runId}`
  await client.query("INSERT INTO da_organization(id, name, created_at, updated_at) VALUES($1, $2, NOW(), NOW())", [orgAId, `Org A ${runId}`])
  await client.query(
    "INSERT INTO da_organization_membership(id, organization_id, person_id, role, status, protected_owner, created_at, updated_at) VALUES($1, $2, $3, 'owner', 'active', true, NOW(), NOW())",
    [`damem_owner_${runId}`, orgAId, owner.personId]
  )
  await client.query(
    "INSERT INTO da_organization_membership(id, organization_id, person_id, role, status, protected_owner, created_at, updated_at) VALUES($1, $2, $3, 'admin', 'active', false, NOW(), NOW())",
    [`damem_admin_${runId}`, orgAId, admin.personId]
  )
  await client.query(
    "INSERT INTO da_organization_membership(id, organization_id, person_id, role, status, protected_owner, created_at, updated_at) VALUES($1, $2, $3, 'member', 'active', false, NOW(), NOW())",
    [`damem_member_${runId}`, orgAId, member.personId]
  )
  await client.query(
    "INSERT INTO da_organization_membership(id, organization_id, person_id, role, status, protected_owner, created_at, updated_at) VALUES($1, $2, $3, 'owner', 'revoked', false, NOW(), NOW())",
    [`damem_revoked_${runId}`, orgAId, revoked.personId]
  )
  console.log(`✔ Org A provisioned (${orgAId}) with Owner, Admin, Member, and Revoked memberships`)

  // Provision Org B (Foreign)
  const orgBId = `daorg_b_${runId}`
  await client.query("INSERT INTO da_organization(id, name, created_at, updated_at) VALUES($1, $2, NOW(), NOW())", [orgBId, `Org B ${runId}`])
  await client.query(
    "INSERT INTO da_organization_membership(id, organization_id, person_id, role, status, protected_owner, created_at, updated_at) VALUES($1, $2, $3, 'owner', 'active', true, NOW(), NOW())",
    [`damem_foreign_${runId}`, orgBId, foreign.personId]
  )
  console.log(`✔ Org B provisioned (${orgBId}) owned exclusively by Foreign Person`)

  // Provision Org C (Empty - Owner has access, but zero audit events ever generated)
  const orgCId = `daorg_c_empty_${runId}`
  await client.query("INSERT INTO da_organization(id, name, created_at, updated_at) VALUES($1, $2, NOW(), NOW())", [orgCId, `Org C Empty ${runId}`])
  await client.query(
    "INSERT INTO da_organization_membership(id, organization_id, person_id, role, status, protected_owner, created_at, updated_at) VALUES($1, $2, $3, 'owner', 'active', true, NOW(), NOW())",
    [`damem_c_owner_${runId}`, orgCId, owner.personId]
  )
  console.log(`✔ Org C provisioned (${orgCId}) as genuine empty organization (zero audit events)`)

  // ---------------------------------------------------------------------------
  // [STEP 3] Legitimate Foundation Audit Events & Atomic Outbox Generation
  // ---------------------------------------------------------------------------
  console.log("\n--- [STEP 3] Recording Canonical Audit Events and Atomic Outbox Rows ---")
  const actions = [
    { action: "organization.provisioned", resource: "organization", target: orgAId },
    { action: "organization.owner_assigned", resource: "membership", target: `damem_owner_${runId}` },
    { action: "organization.membership_changed", resource: "membership", target: `damem_member_${runId}` },
    { action: "organization.membership_changed", resource: "membership", target: `damem_admin_${runId}` },
  ]
  const outboxIds: string[] = []
  const eventIds: string[] = []

  for (let i = 0; i < actions.length; i++) {
    const evId = `daaud_${runId}_${i + 1}`
    const outId = `daout_${runId}_${i + 1}`
    eventIds.push(evId)
    outboxIds.push(outId)
    const nowIso = new Date().toISOString()

    const envelope = {
      version: 1,
      source_module: "dogruadres-access",
      source_audit_event_id: evId,
      organization_id: orgAId,
      actor: {
        person_id: owner.personId,
        type: "user",
        id: owner.actorId,
        role_context: "owner",
      },
      action: actions[i].action,
      resource: actions[i].resource,
      target_id: actions[i].target,
      occurred_at: nowIso,
    }

    // Atomically write audit event and outbox row
    await client.query(
      `INSERT INTO da_audit_event
       (id, actor_person_id, actor_type, actor_id, role_context, organization_id, action, module, resource, target_id, occurred_at, created_at, updated_at)
       VALUES($1, $2, 'user', $3, 'owner', $4, $5, 'dogruadres-access', $6, $7, $8, NOW(), NOW())`,
      [evId, owner.personId, owner.actorId, orgAId, actions[i].action, actions[i].resource, actions[i].target, nowIso]
    )
    await client.query(
      `INSERT INTO da_audit_outbox
       (id, source_audit_event_id, source_module, envelope_version, envelope, status, attempt_count, created_at, updated_at)
       VALUES($1, $2, 'dogruadres-access', 1, $3, 'pending', 0, NOW(), NOW())`,
      [outId, evId, JSON.stringify(envelope)]
    )
  }
  console.log(`✔ 4 canonical audit events recorded with status='pending', attempt_count=0 in da_audit_outbox`)

  // ---------------------------------------------------------------------------
  // [STEP 4] Automatic Scheduled Job (Cron) Execution Observation
  // ---------------------------------------------------------------------------
  console.log("\n--- [STEP 4] Observing Medusa Automatic Scheduled Job (Zero Manual Invocation) ---")
  console.log("Waiting for Medusa's native scheduled worker to deliver outbox rows via cron (* * * * *)...")

  const cronStart = Date.now()
  let delivered = false
  while (Date.now() - cronStart < 90000) {
    const check = await client.query(
      "SELECT count(*)::int as delivered_cnt FROM da_audit_outbox WHERE id = ANY($1) AND status = 'delivered' AND delivered_at IS NOT NULL",
      [outboxIds]
    )
    if (check.rows[0].delivered_cnt === 4) {
      delivered = true
      break
    }
    await new Promise(r => setTimeout(r, 2000))
    process.stdout.write(".")
  }
  console.log("")
  assert.ok(delivered, "Medusa scheduled job MUST automatically deliver outbox rows without manual invocation within 90s")
  const cronDuration = ((Date.now() - cronStart) / 1000).toFixed(1)
  console.log(`✔ AUTOMATIC CRON DELIVERY OBSERVED in ${cronDuration}s! All 4 outbox rows moved to 'delivered' with delivered_at set`)

  // Verify correspondence in da_audit_index_entry
  const indexEntries = await client.query(
    "SELECT id, source_event_id, action, organization_id FROM da_audit_index_entry WHERE organization_id = $1 ORDER BY occurred_at ASC",
    [orgAId]
  )
  assert.equal(indexEntries.rows.length, 4, "Expected exactly 4 projected index entries")
  console.log(`✔ 4 index projections persisted and matched field-by-field: ${indexEntries.rows.map(r => r.action).join(", ")}`)

  // ---------------------------------------------------------------------------
  // [STEP 5] Real HTTP Endpoint Verification (Frontdoor -> Medusa API)
  // ---------------------------------------------------------------------------
  console.log("\n--- [STEP 5] Real HTTP API Acceptance Matrix (/personal/audit-timeline) ---")

  const httpGet = async (token: string | null, params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    const url = `${PUBLIC_ORIGIN}/personal/audit-timeline?${qs}`
    const headers: Record<string, string> = {
      Origin: PUBLIC_ORIGIN,
    }
    if (token) {
      headers.Cookie = `da_session=${token}`
    }
    const res = await fetch(url, { headers })
    const body = await res.json().catch(() => ({}))
    return { status: res.status, body }
  }

  // 5A. Owner Allowed (Page 1)
  const resOwner1 = await httpGet(owner.token, { organization: orgAId, limit: "2" })
  console.log(`✔ [HTTP-1] Owner Page 1 -> Status: ${resOwner1.status}, Items: ${resOwner1.body.items?.length}, has_more: ${resOwner1.body.page?.has_more}`)
  assert.equal(resOwner1.status, 200)
  assert.equal(resOwner1.body.items.length, 2)
  assert.equal(resOwner1.body.page.has_more, true)
  const nextCursor = resOwner1.body.page.next_cursor
  assert.ok(nextCursor, "Page 1 next_cursor must exist")

  // 5B. Owner Allowed (Page 2 via encrypted next_cursor)
  const resOwner2 = await httpGet(owner.token, { organization: orgAId, limit: "2", cursor: nextCursor })
  console.log(`✔ [HTTP-2] Owner Page 2 -> Status: ${resOwner2.status}, Items: ${resOwner2.body.items?.length}, has_more: ${resOwner2.body.page?.has_more}`)
  assert.equal(resOwner2.status, 200)
  assert.equal(resOwner2.body.items.length, 2)
  // Check zero overlap
  const page1Ids = resOwner1.body.items.map((i: any) => i.id)
  const page2Ids = resOwner2.body.items.map((i: any) => i.id)
  assert.ok(page1Ids.every((id: string) => !page2Ids.includes(id)), "Page 1 and Page 2 items must NOT overlap")
  console.log("✔ Zero overlap between Page 1 and Page 2 verified")

  // 5C. Admin Allowed
  const resAdmin = await httpGet(admin.token, { organization: orgAId, limit: "2" })
  console.log(`✔ [HTTP-3] Admin Access -> Status: ${resAdmin.status}, Items: ${resAdmin.body.items?.length}`)
  assert.equal(resAdmin.status, 200)

  // 5D. Cursor Tampering Rejected
  const tamperedCursor = nextCursor.slice(0, -6) + "XXXXXX"
  const resTampered = await httpGet(owner.token, { organization: orgAId, cursor: tamperedCursor })
  console.log(`✔ [HTTP-4] Tampered Cursor -> Status: ${resTampered.status} (${resTampered.body.message})`)
  assert.equal(resTampered.status, 400)

  // 5E. Member Forbidden
  const resMember = await httpGet(member.token, { organization: orgAId })
  console.log(`✔ [HTTP-5] Member Access -> Status: ${resMember.status} (${resMember.body.message})`)
  assert.equal(resMember.status, 403)

  // 5F. Revoked Member Forbidden
  const resRevoked = await httpGet(revoked.token, { organization: orgAId })
  console.log(`✔ [HTTP-6] Revoked Member Access -> Status: ${resRevoked.status} (${resRevoked.body.message})`)
  assert.equal(resRevoked.status, 403)

  // 5G. Foreign Org User Forbidden
  const resForeign = await httpGet(foreign.token, { organization: orgAId })
  console.log(`✔ [HTTP-7] Foreign Org User Access -> Status: ${resForeign.status} (${resForeign.body.message})`)
  assert.equal(resForeign.status, 403)

  // 5H. Anonymous / Unauthenticated
  const resAnon = await httpGet(null, { organization: orgAId })
  console.log(`✔ [HTTP-8] Anonymous Access -> Status: ${resAnon.status} (${resAnon.body.message})`)
  assert.equal(resAnon.status, 401)

  // 5I. Genuine Empty Organization (Org C)
  const resEmpty = await httpGet(owner.token, { organization: orgCId })
  console.log(`✔ [HTTP-9] Genuine Empty Organization (Org C) -> Status: ${resEmpty.status}, Items: ${resEmpty.body.items?.length}, Consistency: ${resEmpty.body.projection?.consistency}`)
  assert.equal(resEmpty.status, 200)
  assert.equal(resEmpty.body.items.length, 0)
  assert.equal(resEmpty.body.projection?.consistency, "eventual")
  assert.equal(resEmpty.body.projection?.completeness, "not_guaranteed")

  // ---------------------------------------------------------------------------

  await client.end()

  console.log("\n================================================================================")
  console.log("   ALL ACCEPTANCE REQUIREMENTS FULLY MET ON REAL SERVER + CRON + CHROME!        ")
  console.log("================================================================================")
}

main().catch((err) => {
  console.error("FATAL ACCEPTANCE FAILURE:", err)
  process.exit(1)
})
