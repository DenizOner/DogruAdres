/**
 * #220: real installed Medusa 2.21.2 MikroORM Migrator history checks.
 * CI-only disposable PostgreSQL 16.15; reuse the existing MFA CI service.
 * This exercises MikroORM's actual ledger, NOT Medusa CLI's full module loader.
 * It never touches a protected task DB, real actors, fixtures or rollout flags.
 */
import assert from "node:assert/strict"
import { MikroORM } from "@medusajs/framework/mikro-orm/postgresql"
import { Migrator } from "@medusajs/framework/mikro-orm/migrations"
import { Migration20261017135550 } from "../../src/modules/dogruadres-access/migrations/Migration20261017135550"
import { Migration20261017150237 } from "../../src/modules/dogruadres-access/migrations/Migration20261017150237"
import { Migration20261018000000 } from "../../src/modules/dogruadres-access/migrations/Migration20261018000000"
import { Migration20261020230000 } from "../../src/modules/dogruadres-access/migrations/Migration20261020230000"
import { Migration20261020230100 } from "../../src/modules/dogruadres-access/migrations/Migration20261020230100"
import { Migration20261020230200 } from "../../src/modules/dogruadres-access/migrations/Migration20261020230200"
import { Migration20261020230300 } from "../../src/modules/dogruadres-access/migrations/Migration20261020230300"
import { Migration20261020230400 } from "../../src/modules/dogruadres-access/migrations/Migration20261020230400"
import { Migration20261021230000 } from "../../src/modules/dogruadres-access/migrations/Migration20261021230000"
import { Migration20261021231000 } from "../../src/modules/dogruadres-access/migrations/Migration20261021231000"
import { Migration20261021233000 } from "../../src/modules/dogruadres-access/migrations/Migration20261021233000"
import { Migration20261021233100 } from "../../src/modules/dogruadres-access/migrations/Migration20261021233100"
import { Migration20261021235000 } from "../../src/modules/dogruadres-access/migrations/Migration20261021235000"
import { Migration20261022010000 } from "../../src/modules/dogruadres-access/migrations/Migration20261022010000"
import { Migration20261022011000 } from "../../src/modules/dogruadres-access/migrations/Migration20261022011000"
import { Migration20261022012000 } from "../../src/modules/dogruadres-access/migrations/Migration20261022012000"

const all = [
  Migration20261017135550,Migration20261017150237,Migration20261018000000,
  Migration20261020230000,Migration20261020230100,Migration20261020230200,
  Migration20261020230300,Migration20261020230400,Migration20261021230000,
  Migration20261021231000,Migration20261021233000,Migration20261021233100,
  Migration20261021235000,Migration20261022010000,Migration20261022011000,
  Migration20261022012000,
]
const legacy = all.filter(c => c.name !== "Migration20261018000000" &&
  c.name < "Migration20261021000000")
const url = new URL(process.env.PG_MFA_TEST_URL ?? "postgres://bad/invalid")
if(process.env.CI!=="true" ||
   process.env.PG_MFA_TEST_SENTINEL!=="mfa-pg16-disposable-ci-v1" ||
   url.protocol!=="postgres:" || url.hostname!=="127.0.0.1" ||
   url.port!=="5432" || url.username!=="mfa_test" ||
   url.pathname!=="/mfa_ci_ephemeral")
  throw new Error("REFUSED: not the uniquely approved disposable MFA CI database")
if(legacy.length!==7 || all.length!==16 ||
   new Set(all.map(c=>c.name)).size!==all.length)
  throw new Error("Unexpected migration source set; review the test's scope")

const SQL=(globalThis as any).Bun?.SQL
if(typeof SQL!=="function")throw new Error("Bun PostgreSQL driver unavailable")
const db=new SQL(url.toString())
const log=(msg:string)=>process.stdout.write("PASS real MikroORM migrator PG16: "+msg+"\n")
async function migrate(classes:typeof all) {
  const orm=await MikroORM.init({
    clientUrl:url.toString(),
    entities:[],
    discovery:{warnWhenNoEntities:false},
    extensions:[Migrator],
    migrations:{
      migrationsList:classes.map(c=>({name:c.name,class:c})),
      tableName:"mikro_orm_migrations",snapshot:false,
      transactional:true,allOrNothing:true,silent:true,
    },
  } as any)
  try{
    return await orm.getMigrator().up()
  }finally{await orm.close(true)}
}
async function ledger() {
  const rows=await db.unsafe("select name from mikro_orm_migrations order by name")
  const names=rows.map((r:any)=>String(r.name).replace(/\.(?:js|ts)$/,""))
  assert.equal(names.length,new Set(names).size,"Duplicate ledger migration")
  return names
}
async function resetDisposableSchema() {
  await db.unsafe("drop schema if exists public cascade")
  await db.unsafe("create schema public")
}
async function main() {
  try{
  const identity=(await db.unsafe("select current_database() as name, current_setting('server_version_num') as ver"))[0]
  assert.equal(identity.name,"mfa_ci_ephemeral")
  assert.match(identity.ver,/^16\d{4}$/)
  assert.equal((await db.unsafe("select to_regclass('mikro_orm_migrations') as t"))[0].t,null)

  // Simulate a prior deployed M0 security schema, BEFORE Foundation's
  // older-dated 20261018 audit/outbox migration arrived.
  await migrate(legacy)
  assert.deepEqual(await ledger(),legacy.map(c=>c.name).sort())
  assert.equal((await db.unsafe("select to_regclass('da_audit_outbox') as t"))[0].t,null)
  log("pre-existing seven-migration M0 ledger confirmed")

  const late=await migrate(all)
  assert.equal(late.length,all.length-legacy.length,"Backdated migration unexpectedly skipped")
  assert.deepEqual(await ledger(),all.map(c=>c.name).sort())
  assert.ok((await db.unsafe("select to_regclass('da_audit_outbox') as t"))[0].t)
  assert.equal((await db.unsafe("select count(*)::int as n from pg_trigger where tgname='da_audit_event_append_only_rows'"))[0].n,1)
  log("late-added Foundation outbox plus subsequent MFA migrations applied once")

  assert.equal((await migrate(all)).length,0,"Idempotent rerun must be no-op")
  assert.deepEqual(await ledger(),all.map(c=>c.name).sort())
  log("rerun has zero pending migrations and unchanged ledger")

  await resetDisposableSchema()
  assert.equal((await db.unsafe("select to_regclass('mikro_orm_migrations') as t"))[0].t,null)
  const fresh=await migrate(all)
  assert.equal(fresh.length,all.length)
  assert.deepEqual(await ledger(),all.map(c=>c.name).sort())
  log("fresh full chain via real installed migrator, chronological ordering and ledger")
}finally{
  try{
    await resetDisposableSchema()
    process.stdout.write("CLEANUP: task-only migration ledger CI schema erased\n")
  }catch(e){
    process.stderr.write("CLEANUP ERROR: "+String(e)+"\n")
    process.exitCode=1
  }
  await db.close()
  }
}
main().catch(error=>{
  process.stderr.write("MFA migrator ledger PG16 FAILED: "+String(error)+"\n")
  process.exitCode=1
})
