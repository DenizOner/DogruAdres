/**
 * #230: Only for a fresh, ephemeral, CI-owned PostgreSQL 16 service.
 * Exercises the committed MFA migration and MfaPersistence against real SQL,
 * FK/CHECK constraints, advisory transaction locks, CAS, and rollback.
 *
 * The task M0 PostgreSQL database and Docker volumes MUST NEVER be targeted.
 * Prerequisite Foundation schema is sourced from the committed 20261017
 * migrations. da_security_outbox is an explicit minimal, test-only stand-in,
 * not evidence that PR #222's canonical audit/outbox is integrated.
 */
import assert from "node:assert/strict"
import pg from "pg"
import { Migration20261017135550 } from "../../src/modules/dogruadres-access/migrations/Migration20261017135550"
import { Migration20261017150237 } from "../../src/modules/dogruadres-access/migrations/Migration20261017150237"
import { Migration20261021235000 } from "../../src/modules/dogruadres-access/migrations/Migration20261021235000"
import {
  MfaPersistence, MfaConcurrentUpdateError, MfaOutboxFailure,
  type MfaAuditActor,
} from "../../src/modules/dogruadres-access/mfa-persistence"
import type { SecuritySql } from "../../src/modules/dogruadres-access/identity-session"

const url = new URL(process.env.PG_MFA_TEST_URL ?? "postgres://invalid/invalid")
const safeTarget = process.env.CI === "true" &&
  process.env.PG_MFA_TEST_SENTINEL === "mfa-pg16-disposable-ci-v1" &&
  url.hostname === "127.0.0.1" && url.port === "5432" &&
  url.pathname === "/mfa_ci_ephemeral" && url.username === "mfa_test" &&
  url.protocol === "postgres:"
if (!safeTarget) throw new Error("REFUSED: PG target is not the isolated CI PostgreSQL service")

const { Client } = pg
const connections: InstanceType<typeof Client>[] = []
const connect = async () => {
  const c = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 4000 })
  await c.connect()
  connections.push(c)
  const r = await c.query("select current_database() as name, current_setting('server_version_num') as ver")
  assert.equal(r.rows[0].name, "mfa_ci_ephemeral")
  assert.match(r.rows[0].ver, /^16\d{4}$/)
  return c
}
const adapter = (client: InstanceType<typeof Client>): SecuritySql => ({
  async execute(sql, params = []) {
    let index = 0
    const pgSql = sql.replace(/\?/g, () => "\$" + ++index)
    assert.equal(index, params.length, "SQL placeholder/parameter count mismatch")
    const result = await client.query(pgSql, params)
    return result.rows
  },
})
const migrationStatements = async (type: new (...args: any[]) => any): Promise<string[]> => {
  const instance = new type()
  const statements: string[] = []
  instance.addSql = (sql: string) => statements.push(sql)
  await instance.up()
  return statements
}
const sqlMigration = async (client: InstanceType<typeof Client>, type: new (...args: any[]) => any) => {
  for (const statement of await migrationStatements(type)) await client.query(statement)
}
const testActor: MfaAuditActor = {
  person_id: "daprs_mfa_ci_1", actor_type: "user", actor_id: "user_mfa_ci_1",
}
const samples = { checks: 0, stage: "" }
const check = async (label: string, fn: () => Promise<void>) => {
  samples.stage = label
  await fn()
  samples.checks++
  process.stdout.write("PASS PG16: " + label + "\n")
}
const expectSqlFailure = async (c: InstanceType<typeof Client>, statement: string, params: unknown[] = []) => {
  await c.query("BEGIN")
  try {
    await assert.rejects(c.query(statement, params))
  } finally {
    await c.query("ROLLBACK")
  }
}
const count = async (c: InstanceType<typeof Client>, table: string) => {
  if (!["da_audit_event", "da_security_outbox"].includes(table)) throw new Error("Invalid count target")
  return Number((await c.query(`select count(*)::int as n from ${table}`)).rows[0].n)
}

let primary: InstanceType<typeof Client> | undefined
try {
  primary = await connect()
  // The fresh service has no other clients or user data; this schema is
  // discarded only after checking the exact ephemeral DB identity above.
  await primary.query("BEGIN")
  await sqlMigration(primary, Migration20261017135550)
  await sqlMigration(primary, Migration20261017150237)
  await primary.query("COMMIT")
  await primary.query(`create table da_security_outbox (
    id text primary key, audit_event_id text not null unique references da_audit_event(id),
    created_at timestamptz not null default now()
  )`)

  await check("DDL transaction rollback leaves neither MFA table behind", async () => {
    await primary!.query("BEGIN")
    await sqlMigration(primary!, Migration20261021235000)
    assert.equal((await primary!.query("select to_regclass('da_mfa_policy') as t")).rows[0].t, "da_mfa_policy")
    await primary!.query("ROLLBACK")
    assert.equal((await primary!.query("select to_regclass('da_mfa_policy') as t")).rows[0].t, null)
    assert.equal((await primary!.query("select to_regclass('da_person_mfa_preference') as t")).rows[0].t, null)
  })
  await check("actual MFA migration applies on a fresh PG16 database", async () => {
    await primary!.query("BEGIN")
    await sqlMigration(primary!, Migration20261021235000)
    await primary!.query("COMMIT")
    for (const table of ["da_mfa_policy", "da_person_mfa_preference"]) {
      assert.notEqual((await primary!.query("select to_regclass($1) as t", [table])).rows[0].t, null)
    }
  })
  await check("database enforces singleton, enum, non-null and Person FK", async () => {
    await expectSqlFailure(primary!, "insert into da_mfa_policy(id,platform_mode) values('other','optional')")
    await expectSqlFailure(primary!, "insert into da_mfa_policy(id,platform_mode) values('current','invalid')")
    await expectSqlFailure(primary!, "insert into da_mfa_policy(id,platform_mode) values('current',null)")
    await expectSqlFailure(primary!, "insert into da_person_mfa_preference(person_id,user_enabled) values('absent',true)")
    await primary!.query("insert into da_person(id) values($1)", [testActor.person_id])
    await expectSqlFailure(primary!, "insert into da_person_mfa_preference(person_id,user_enabled) values($1,null)", [testActor.person_id])
  })

  await check("real persistence reads defaults and writes attributable audit/outbox", async () => {
    const p = new MfaPersistence(adapter(primary!))
    assert.deepEqual(await p.readPlatformPolicy(), { platform_mode: "required", version: 0 })
    assert.deepEqual(await p.readPersonPreference(testActor.person_id), {
      person_id: testActor.person_id, user_enabled: false, version: 0,
    })
    await primary!.query("BEGIN")
    assert.deepEqual(await p.setPlatformPolicy("optional", 0, testActor), { platform_mode: "optional", version: 1 })
    assert.deepEqual(await p.setPersonPreference(testActor.person_id, true, 0, testActor), {
      person_id: testActor.person_id, user_enabled: true, version: 1,
    })
    await primary!.query("COMMIT")
    const history = (await primary!.query(`select a.actor_person_id,a.actor_type,a.actor_id,
      a.action,a.previous_values,a.new_values,o.audit_event_id
      from da_audit_event a join da_security_outbox o on o.audit_event_id=a.id
      where a.resource='mfa-policy' order by a.action`)).rows
    assert.equal(history.length, 2)
    for (const h of history) {
      assert.equal(h.actor_person_id, testActor.person_id)
      assert.equal(h.actor_type, testActor.actor_type)
      assert.equal(h.actor_id, testActor.actor_id)
      assert.ok(["mfa.platform_policy.set", "mfa.person_preference.set"].includes(h.action))
      for (const field of Object.keys(h.new_values)) assert.ok(["platform_mode", "user_enabled"].includes(field))
    }
    assert.equal(await count(primary!, "da_security_outbox"), 2)
  })

  await check("advisory xact lock serializes concurrent platform writes and rejects stale version", async () => {
    const writer1 = await connect(), writer2 = await connect()
    await writer1.query("BEGIN")
    await writer2.query("BEGIN")
    await writer2.query("set local lock_timeout = '5s'")
    await new MfaPersistence(adapter(writer1)).setPlatformPolicy("disabled", 1, testActor)
    let settled = false
    const pending = new MfaPersistence(adapter(writer2))
      .setPlatformPolicy("required", 1, testActor)
      .then(() => ({ ok: true as const }), error => ({ ok: false as const, error }))
      .finally(() => { settled = true })
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.equal(settled, false, "Concurrent writer did not wait for advisory lock")
    await writer1.query("COMMIT")
    const result = await pending
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.error instanceof MfaConcurrentUpdateError)
    await writer2.query("ROLLBACK")
    assert.deepEqual(await new MfaPersistence(adapter(primary!)).readPlatformPolicy(),
      { platform_mode: "disabled", version: 2 })
    assert.equal(await count(primary!, "da_security_outbox"), 3)
  })

  await check("outbox failure rolls back the policy, audit and event together", async () => {
    const beforeAudit = await count(primary!, "da_audit_event")
    const beforeOutbox = await count(primary!, "da_security_outbox")
    const c = await connect()
    const base = adapter(c)
    const fault: SecuritySql = {
      execute: async (statement, params) => {
        if (statement.startsWith("insert into da_security_outbox")) throw Error("INJECTED_OUTBOX_FAULT")
        return base.execute(statement, params)
      },
    }
    await c.query("BEGIN")
    await assert.rejects(new MfaPersistence(fault).setPersonPreference(
      testActor.person_id, false, 1, testActor,
    ), MfaOutboxFailure)
    await c.query("ROLLBACK")
    assert.deepEqual(await new MfaPersistence(adapter(primary!)).readPersonPreference(testActor.person_id), {
      person_id: testActor.person_id, user_enabled: true, version: 1,
    })
    assert.equal(await count(primary!, "da_audit_event"), beforeAudit)
    assert.equal(await count(primary!, "da_security_outbox"), beforeOutbox)
  })

  await check("out-of-date Person CAS fails without audit or policy writes", async () => {
    const beforeAudit = await count(primary!, "da_audit_event")
    const p = new MfaPersistence(adapter(primary!))
    await primary!.query("BEGIN")
    await assert.rejects(p.setPersonPreference(testActor.person_id, false, 0, testActor),
      MfaConcurrentUpdateError)
    await primary!.query("ROLLBACK")
    assert.equal(await count(primary!, "da_audit_event"), beforeAudit)
  })

  process.stdout.write("PG16 M0 MFA checks: " + samples.checks + " PASSED (real PostgreSQL, ephemeral only)\n")
} finally {
  // Close secondary sessions first. Only the test-owned schema/database may
  // be reset; the GitHub runner tears down this disposable service container.
  for (const c of connections.slice(1).reverse()) {
    try { await c.query("ROLLBACK") } catch {}
    try { await c.end() } catch {}
  }
  if (primary) {
    try {
      await primary.query("ROLLBACK")
      await primary.query("drop schema if exists public cascade")
      await primary.query("create schema public")
      process.stdout.write("CLEANUP: ephemeral mfa_ci_ephemeral schema reset\n")
    } catch (err) {
      process.stderr.write("CLEANUP WARNING: " + String(err) + "\n")
      process.exitCode = 1
    }
    try { await primary.end() } catch {}
  }
}
