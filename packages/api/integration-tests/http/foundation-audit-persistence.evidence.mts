/** NOT TESTED. Separate disposable-runtime authorization is mandatory.
 * Future Node 24 command (not executed in AF-1A1/A2):
 * node --test integration-tests/http/foundation-audit-persistence.evidence.mts
 * Requires the unchanged AF-1C runtime authorization contract, both migrations
 * plus Migration20261018000000 already applied ONLY to the new disposable DB,
 * and two pre-provisioned synthetic emailpass users. This file starts nothing.
 * DOGRUADRES_AF1_AUDIT_USERS is transient JSON [{email,password},{email,password}].
 * No CLI bypass/provisioner is supplied here. The protected R3 CLI blocker remains.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { randomBytes, randomUUID } from "node:crypto"

test("Foundation append-only audit and transactional outbox PostgreSQL/HTTP evidence", { timeout: 240000 }, async t => {
  const h = await import("../helpers/isolated-foundation-runtime.mjs")
  const m = h.authorizeRuntime()
  const credentials = JSON.parse(process.env.DOGRUADRES_AF1_AUDIT_USERS ?? "[]")
  assert.equal(credentials.length, 2, "Two separately provisioned synthetic users required; never production credentials")
  assert.ok(credentials.every((c: {email: string; password: string}) => typeof c.email === "string" && c.email.startsWith(`af1-${m.runId}-`) && c.email.endsWith("@example.invalid") && typeof c.password === "string" && c.password.length >= 32))
  const db = await h.observer(m)
  const users: Array<{ actor_id: string; auth_identity_id: string; auth_provider: string; email: string; bearer: string }> = []
  const verifications: string[] = []
  const rows = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows
  const snapshot = async () => {
    const state: Record<string, unknown> = {}
    for (const table of ["da_person", "da_actor_mapping", "da_organization", "da_organization_membership", "da_organization_invitation", "da_audit_event", "da_audit_outbox"]) state[table] = await rows(`select * from ${table} order by id`)
    return state
  }
  await h.preserveFailure(async () => {
    t.diagnostic(JSON.stringify({ classification: "AUTHORIZED_RUNTIME", ...h.runtimeProvenance(m) }))
    try {
      for (const c of credentials) {
        const login = await h.request(m, "POST", "/auth/user/emailpass", undefined, c)
        assert.equal(login.status, 200)
        assert.equal(typeof login.data.token, "string")
        const identity = JSON.parse(Buffer.from(login.data.token.split(".")[1], "base64url").toString())
        const me = await h.request(m, "GET", "/admin/users/me", login.data.token)
        assert.equal(me.status, 200); assert.equal(me.data.user.id, identity.actor_id); assert.equal(me.data.user.email, c.email)
        assert.equal(identity.actor_type, "user"); assert.ok(identity.auth_identity_id && identity.auth_provider)
        users.push({ ...identity, email: c.email, bearer: login.data.token })
      }
    } finally { for (const c of credentials) c.password = "" }
    assert.notEqual(users[0].actor_id, users[1].actor_id)
    const [owner, invitee] = users
    const provider = await rows("select entity_id from provider_identity where auth_identity_id=$1 and provider=$2 and deleted_at is null", [invitee.auth_identity_id, invitee.auth_provider])
    assert.equal(provider.length, 1); assert.equal(provider[0].entity_id.trim().toLowerCase(), invitee.email)
    assert.equal((await rows("select id from auth_verification where auth_identity_id=$1", [invitee.auth_identity_id])).length, 0, "Fresh synthetic invitee required")
    const verification = `authver_${randomUUID()}`; verifications.push(verification)
    t.diagnostic(JSON.stringify({ classification: "VERIFICATION_FIXTURE", id: verification, actorId: invitee.actor_id }))
    await db.query(`insert into auth_verification(id,auth_identity_id,entity_id,entity_type,code_provider,verified_at,requested_at,created_at,updated_at)
      values($1,$2,$3,'email','token',now(),now(),now(),now())`, [verification, invitee.auth_identity_id, provider[0].entity_id])
    const actor = (u: typeof owner) => ({ actor_type: "user", actor_id: u.actor_id })
    const input = (name = `af1-audit-${m.runId}-${randomUUID()}`, owners = [owner, invitee]) => ({ name, initial_owners: owners.map(actor) })
    const provision = (body = input()) => h.request(m, "POST", "/admin/dogruadres/organizations", owner.bearer, body)
    const assertPairs = async (organization: string) => {
      const audit = await rows("select * from da_audit_event where organization_id=$1 order by id", [organization])
      const outbox = await rows("select o.* from da_audit_outbox o join da_audit_event a on a.id=o.source_audit_event_id where a.organization_id=$1 order by o.source_audit_event_id", [organization])
      assert.equal(outbox.length, audit.length)
      for (const a of audit) {
        const matching = outbox.filter((o: {source_audit_event_id: string}) => o.source_audit_event_id === a.id)
        assert.equal(matching.length, 1)
        const o = matching[0]
        assert.equal(o.source_module, "dogruadres-access"); assert.equal(o.envelope_version, 1); assert.equal(o.status, "pending")
        assert.deepEqual(o.envelope, { version: 1, source_module: a.module, source_audit_event_id: a.id, organization_id: a.organization_id,
          actor: { person_id: a.actor_person_id, type: a.actor_type, id: a.actor_id, role_context: a.role_context },
          action: a.action, resource: a.resource, target_id: a.target_id, occurred_at: a.occurred_at.toISOString() })
      }
      return { audit, outbox }
    }
    const response = await provision(); assert.equal(response.status, 201)
    const organization = response.data.organization.id

    await t.test("two-Owner provisioning inserts three canonical audits and three linked pending envelopes", async () => {
      const { audit, outbox } = await assertPairs(organization)
      assert.equal(audit.length, 3); assert.equal(outbox.length, 3)
      assert.deepEqual(audit.map((a: {action: string}) => a.action).sort(), ["organization.owner_assigned", "organization.owner_assigned", "organization.provisioned"])
    })

    await t.test("ordinary UPDATE, DELETE, soft-delete and TRUNCATE are rejected without losing evidence", async () => {
      const before = await snapshot(), id = (await assertPairs(organization)).audit[0].id
      // DO's subtransaction catches only the expected guard SQLSTATE. If a guard
      // is missing, PZ099 aborts the whole statement, rolling back even TRUNCATE.
      for (const sql of [
        `update da_audit_event set action='tampered' where id=${h.literal(id)}`,
        `update da_audit_event set deleted_at=now() where id=${h.literal(id)}`,
        `update da_audit_event set updated_at=updated_at where id=${h.literal(id)}`,
        `delete from da_audit_event where id=${h.literal(id)}`,
        "truncate da_audit_outbox, da_audit_event",
      ]) {
        await db.query(`DO $negative$ BEGIN BEGIN ${sql}; RAISE EXCEPTION USING ERRCODE='PZ099',MESSAGE='audit guard missing';
          EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END; END $negative$`)
        assert.deepEqual(await snapshot(), before)
      }
    })

    await t.test("source identity uniqueness remains global across soft deletion", async () => {
      const o = (await assertPairs(organization)).outbox[0]
      await h.preserveFailure(async () => {
        await db.query("update da_audit_outbox set deleted_at=now() where id=$1", [o.id])
        await db.query(`DO $duplicate$ BEGIN BEGIN
          insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope_version,envelope,status)
          select ${h.literal(`daaob_${randomUUID()}`)},source_audit_event_id,source_module,envelope_version,envelope,status from da_audit_outbox where id=${h.literal(o.id)};
          RAISE EXCEPTION USING ERRCODE='PZ099',MESSAGE='duplicate source identity accepted';
          EXCEPTION WHEN unique_violation THEN NULL; END; END $duplicate$`)
        assert.equal((await rows("select id from da_audit_outbox where source_module=$1 and source_audit_event_id=$2", [o.source_module, o.source_audit_event_id])).length, 1)
      }, [() => db.query("update da_audit_outbox set deleted_at=null where id=$1", [o.id])])
    })

    for (const kind of ["domain", "audit", "later-owner-audit"]) {
      await t.test(`targeted ${kind} SQL failure rolls back domain, audit and outbox`, async () => {
        const body = input(), before = await snapshot()
        const probe = await h.sqlProbe(db, {
          table: kind === "domain" ? "da_organization" : "da_audit_event",
          predicate: kind === "domain" ? `NEW.name=${h.literal(body.name)}` : `NEW.actor_id=${h.literal(owner.actor_id)} AND NEW.action=${h.literal(kind === "audit" ? "organization.provisioned" : "organization.owner_assigned")}`,
          hit: kind === "later-owner-audit" ? 2 : 1,
          onInventory: (inventory: object) => t.diagnostic(JSON.stringify({ classification: "FAULT_INVENTORY", ...inventory })),
        })
        await h.preserveFailure(async () => {
          const result = await h.correlateFault(probe, () => provision(body))
          assert.equal(result.response.status, 500); assert.equal(result.evidence.raised, true)
          assert.deepEqual(await snapshot(), before)
          t.diagnostic(JSON.stringify({ classification: "TARGETED_ROLLBACK_OBSERVED", kind, ...result.evidence }))
        }, [() => probe.cleanup()])
      })
    }

    await t.test("second Owner outbox INSERT failure rolls back all staged canonical audit and domain rows", async () => {
      // Narrow extra fixture: protected sqlProbe intentionally does NOT permit
      // da_audit_outbox. Do not extend/weaken that helper's historical allowlist.
      // Uses its already-authorized observer, exact new table, run-owned names,
      // ownership comments, nontransactional markers and primary-error preservation.
      const name = `af1ob_${m.runId}_${randomBytes(5).toString("hex")}`
      const names = [name + "_hits", name + "_raised", name + "_pid", name + "_tx"]
      const ownership = `AF-1D:${m.runId}:${name}`
      t.diagnostic(JSON.stringify({ classification: "OUTBOX_FAULT_INVENTORY", name, sequences: names, ownership }))
      const auditProbe = await h.sqlProbe(db, { table: "da_audit_event", predicate: `NEW.actor_id=${h.literal(owner.actor_id)}`, fail: false,
        onInventory: (inventory: object) => t.diagnostic(JSON.stringify({ classification: "AUDIT_STAGING_INVENTORY", ...inventory })) })
      const before = await snapshot(), body = input()
      const cleanup = async () => {
        const identities = [
          await rows("select obj_description(oid,'pg_trigger') as owner from pg_trigger where tgname=$1 and tgrelid='da_audit_outbox'::regclass", [name]),
          await rows("select obj_description(oid,'pg_proc') as owner from pg_proc where oid=to_regprocedure($1)", [`${name}()`]),
          ...await Promise.all(names.map(n => rows("select obj_description(oid,'pg_class') as owner from pg_class where oid=to_regclass($1)", [n]))),
        ]
        assert.ok(identities.flat().every(row => row.owner === ownership), "Unknown SQL object ownership; STOP cleanup")
        await h.preserveFailure(async () => undefined, [
          () => db.query(`drop trigger if exists "${name}" on da_audit_outbox`),
          () => db.query(`drop function if exists "${name}"()`),
          ...names.map(n => () => db.query(`drop sequence if exists "${n}"`)),
        ])
      }
      await h.preserveFailure(async () => {
        for (const n of names) {
          await db.query(`create sequence "${n}"`)
          await db.query(`comment on sequence "${n}" is ${h.literal(ownership)}`)
        }
        await db.query(`create function "${name}"() returns trigger language plpgsql as $fault$
          BEGIN IF NEW.envelope #>> '{actor,id}'=${h.literal(owner.actor_id)} AND NEW.envelope->>'action'='organization.owner_assigned' THEN
            PERFORM setval('${names[2]}',pg_backend_pid()); PERFORM setval('${names[3]}',txid_current());
            IF nextval('${names[0]}')=2 THEN BEGIN
              RAISE EXCEPTION USING ERRCODE='PZ002',MESSAGE='targeted outbox fault';
              EXCEPTION WHEN SQLSTATE 'PZ002' THEN PERFORM nextval('${names[1]}'); RAISE; END;
            END IF; END IF; RETURN NEW; END $fault$`)
        await db.query(`comment on function "${name}"() is ${h.literal(ownership)}`)
        await db.query(`create trigger "${name}" before insert on da_audit_outbox for each row execute function "${name}"()`)
        await db.query(`comment on trigger "${name}" on da_audit_outbox is ${h.literal(ownership)}`)
        const failed = await provision(body)
        assert.equal(failed.status, 500)
        const markers = await Promise.all(names.map(n => rows(`select last_value::text,is_called from "${n}"`)))
        assert.equal(markers[0][0].is_called, true); assert.equal(markers[0][0].last_value, "2")
        assert.equal(markers[1][0].is_called, true); assert.equal(markers[1][0].last_value, "1")
        const staged = await auditProbe.evidence()
        assert.equal(staged.hits, 3)
        assert.equal(staged.pid, Number(markers[2][0].last_value)); assert.equal(staged.txid, markers[3][0].last_value)
        assert.equal((await rows("select pid from pg_stat_activity where pid=$1 and datname=$2 and application_name=$3", [staged.pid, m.database, m.apiApplicationName])).length, 1)
        assert.deepEqual(await snapshot(), before)
        t.diagnostic(JSON.stringify({ classification: "OUTBOX_FAILURE_ROLLBACK_OBSERVED", auditHits: staged.hits, outboxOwnerHits: 2, backendPid: staged.pid, transactionId: staged.txid }))
      }, [cleanup, () => auditProbe.cleanup()])
    })

    await t.test("normal invitation/member changes keep matching envelopes and revoked-member denial", async () => {
      const created = await provision(input(undefined, [owner])); assert.equal(created.status, 201)
      const org = created.data.organization.id, path = `/dogruadres/organizations/${org}`
      let token = ""
      try {
        let invitation = await h.request(m, "POST", path + "/invitations", owner.bearer, { email: invitee.email, role: "member" })
        assert.equal(invitation.status, 201); token = invitation.data.invitation_token
        let accepted = await h.request(m, "POST", "/dogruadres/invitations/accept", invitee.bearer, { token })
        assert.equal(accepted.status, 200)
        const member = accepted.data.membership.id
        assert.equal((await h.request(m, "POST", `${path}/memberships/${member}`, owner.bearer, { status: "revoked" })).status, 200)
        const before = await snapshot()
        assert.equal((await h.request(m, "POST", `${path}/memberships/${member}`, owner.bearer, { status: "active" })).status, 403)
        assert.deepEqual(await snapshot(), before)
        invitation = await h.request(m, "POST", path + "/invitations", owner.bearer, { email: invitee.email, role: "admin" })
        assert.equal(invitation.status, 201); token = invitation.data.invitation_token
        accepted = await h.request(m, "POST", "/dogruadres/invitations/accept", invitee.bearer, { token }); assert.equal(accepted.status, 200)
        const replayBefore = await snapshot()
        assert.equal((await h.request(m, "POST", "/dogruadres/invitations/accept", invitee.bearer, { token })).status, 403)
        assert.deepEqual(await snapshot(), replayBefore)
        const unused = await h.request(m, "POST", path + "/invitations", owner.bearer, { email: `af1-${m.runId}-unused@example.invalid`, role: "member" })
        assert.equal(unused.status, 201)
        assert.equal((await h.request(m, "DELETE", `${path}/invitations/${unused.data.invitation.id}`, owner.bearer)).status, 200)
        await assertPairs(org)
      } finally { token = "" }
    })
  }, [
    async () => { const result = await Promise.allSettled(verifications.map(id => db.query("delete from auth_verification where id=$1", [id]))); assert.ok(result.every(r => r.status === "fulfilled"), "Verification cleanup unconfirmed") },
    async () => { for (const u of users) u.bearer = ""; for (const c of credentials) c.password = "" },
    () => db.end(),
  ])
})
