/**
 * #230: isolated PostgreSQL 16 contract/transaction acceptance, CI ONLY.
 *
 * Uses Bun 1.4's built-in Postgres driver (no new packages or lockfile edit).
 * Runs the actual 20261017 Foundation + 20261021 MFA migration sources.
 * PR #222 canonical da_audit_outbox migration and append-only audit guard
 * are tested alongside actual M0 session/outbox DDL. Installed Medusa
 * migrator history / snapshot upgrades are NOT proven here.
 *
 * Every operation is gated to the exact disposable mfa_ci_ephemeral service.
 * No production, preserved M0 task database, Docker volume or user fixture.
 */
import assert from "node:assert/strict"
import { Migration20261017135550 } from "../../src/modules/dogruadres-access/migrations/Migration20261017135550"
import { Migration20261017150237 } from "../../src/modules/dogruadres-access/migrations/Migration20261017150237"
import { Migration20261018000000 } from "../../src/modules/dogruadres-access/migrations/Migration20261018000000"
import { Migration20261020230000 } from "../../src/modules/dogruadres-access/migrations/Migration20261020230000"
import { Migration20261022010000 } from "../../src/modules/dogruadres-access/migrations/Migration20261022010000"
import { Migration20261022011000 } from "../../src/modules/dogruadres-access/migrations/Migration20261022011000"
import { Migration20261021235000 } from "../../src/modules/dogruadres-access/migrations/Migration20261021235000"
import {
  MfaPersistence, MfaConcurrentUpdateError, MfaOutboxFailure,
  type MfaAuditActor,
} from "../../src/modules/dogruadres-access/mfa-persistence"
import type { SecuritySql } from "../../src/modules/dogruadres-access/identity-session"

type QueryClient = {
  unsafe(sql: string, params?: readonly unknown[]): Promise<any[]>
}
const actor: MfaAuditActor = {
  person_id: "daprs_mfa_ci_1", actor_type: "user", actor_id: "user_mfa_ci_1",
}
const sqlAdapter = (client: QueryClient): SecuritySql => ({
  async execute(statement, params = []) {
    let index = 0
    const pgStatement = statement.replace(/\?/g, () => "$" + ++index)
    assert.equal(index, params.length, "SecuritySql parameters and PostgreSQL placeholders differ")
    return client.unsafe(pgStatement, params)
  },
})
const migrationSql = async (ctor: new (...args: any[]) => any): Promise<string[]> => {
  const migration = new ctor()
  const statements: string[] = []
  migration.addSql = (s: string) => statements.push(s)
  await migration.up()
  return statements
}
const apply = async (client: QueryClient, ctor: new (...args: any[]) => any) => {
  for (const statement of await migrationSql(ctor)) await client.unsafe(statement)
}
const rowCount = async (db: QueryClient, table: "da_audit_event"|"da_security_outbox") =>
  Number((await db.unsafe(`select count(*)::int as n from ${table}`))[0].n)

async function main() {
  // A task DB could have identically named tables: connection target is
  // verified BEFORE running DDL, and no arbitrary DB URL is ever accepted.
  const url = new URL(process.env.PG_MFA_TEST_URL ?? "postgres://bad/invalid")
  if (process.env.CI !== "true" ||
      process.env.PG_MFA_TEST_SENTINEL !== "mfa-pg16-disposable-ci-v1" ||
      url.protocol !== "postgres:" || url.hostname !== "127.0.0.1" ||
      url.port !== "5432" || url.username !== "mfa_test" ||
      url.pathname !== "/mfa_ci_ephemeral") {
    throw new Error("REFUSED: target is not the unique disposable MFA PostgreSQL CI service")
  }
  const SQL = (globalThis as any).Bun?.SQL
  if (typeof SQL !== "function") throw new Error("Bun built-in PostgreSQL SQL is not available")
  const db: QueryClient & {begin<T>(fn:(tx:QueryClient)=>Promise<T>):Promise<T>;close():Promise<void>} = new SQL(url.toString())
  let checks=0
  const check = async (title: string, fn: () => Promise<void>) => {
    await fn()
    checks++
    process.stdout.write("PASS real PG16: " + title + "\n")
  }
  try {
    const identity = (await db.unsafe("select current_database() as name,current_setting('server_version_num') as ver"))[0]
    assert.equal(identity.name, "mfa_ci_ephemeral")
    assert.match(identity.ver, /^16\d{4}$/)

    await db.begin(async tx => {
      await apply(tx, Migration20261017135550)
      await apply(tx, Migration20261017150237)
      // Use the ACTUAL security-state DDL, no fabricated outbox table.
      await apply(tx, Migration20261020230000)
    })

    await check("canonical Foundation outbox and append-only audit migration applies", async () => {
      await db.begin(tx => apply(tx, Migration20261018000000))
      assert.ok((await db.unsafe("select to_regclass('da_audit_outbox') as tbl"))[0].tbl)
      const triggers=await db.unsafe(`select tgname from pg_trigger
        where tgrelid='da_audit_event'::regclass and not tgisinternal`)
      assert.deepEqual(triggers.map(row=>row.tgname).sort(),[
        "da_audit_event_append_only_rows","da_audit_event_append_only_truncate",
      ])
    })
    await check("DDL rollback leaves no MFA tables", async () => {
      await assert.rejects(db.begin(async tx => {
        await apply(tx, Migration20261021235000)
        const rows = await tx.unsafe("select to_regclass('da_mfa_policy') as tbl")
        assert.ok(rows[0].tbl)
        throw new Error("ROLLBACK_DDL_TEST")
      }), /ROLLBACK_DDL_TEST/)
      assert.equal((await db.unsafe("select to_regclass('da_mfa_policy') as tbl"))[0].tbl,null)
      assert.equal((await db.unsafe("select to_regclass('da_person_mfa_preference') as tbl"))[0].tbl,null)
    })
    await check("real MFA migration source applies on PostgreSQL 16", async () => {
      await db.begin(tx => apply(tx, Migration20261021235000))
      for (const table of ["da_mfa_policy","da_person_mfa_preference"]) {
        assert.ok((await db.unsafe("select to_regclass($1) as tbl",[table]))[0].tbl)
      }
    })
    const invalidInsert = async (statement:string, params:unknown[]=[]) => {
      await assert.rejects(db.begin(async tx => {
        await tx.unsafe(statement,params)
      }))
    }
    await check("FK, singleton, mode and NOT NULL constraints reject invalid data", async () => {
      await invalidInsert("insert into da_mfa_policy(id,platform_mode) values('wrong','required')")
      await invalidInsert("insert into da_mfa_policy(id,platform_mode) values('current','INVALID')")
      await invalidInsert("insert into da_mfa_policy(id,platform_mode) values('current',null)")
      await invalidInsert("insert into da_person_mfa_preference(person_id,user_enabled) values('missing',true)")
      await db.unsafe("insert into da_person(id) values($1)",[actor.person_id])
      await invalidInsert("insert into da_person_mfa_preference(person_id,user_enabled) values($1,null)",[actor.person_id])
    })
    await check("browser-scope migration applies and rejects old-session implicit promotion",async()=>{
      await assert.rejects(db.begin(async tx=>{
        await apply(tx,Migration20261022011000)
        throw Error("ROLLBACK_MFA_SESSION_SCOPE_DDL")
      }),/ROLLBACK_MFA_SESSION_SCOPE_DDL/)
      const before=await db.unsafe(`select count(*)::int as n from information_schema.columns
        where table_name='da_browser_session' and column_name='mfa_purpose'`)
      assert.equal(before[0].n,0)
      await db.begin(tx=>apply(tx,Migration20261022011000))
      assert.equal((await db.unsafe(`select count(*)::int as n from information_schema.columns
        where table_name='da_browser_session' and column_name='mfa_purpose'`))[0].n,1)
    })
    await check("MFA enrollment intent DDL rolls back, then applies with exact FK/uniqueness",async()=>{
      await assert.rejects(db.begin(async tx=>{
        await apply(tx,Migration20261022010000)
        throw Error("ROLLBACK_MFA_ENROLLMENT_DDL")
      }),/ROLLBACK_MFA_ENROLLMENT_DDL/)
      assert.equal((await db.unsafe("select to_regclass('da_mfa_enrollment_intent') as tbl"))[0].tbl,null)
      await db.begin(tx=>apply(tx,Migration20261022010000))
      assert.ok((await db.unsafe("select to_regclass('da_mfa_enrollment_intent') as tbl"))[0].tbl)
      await invalidInsert(`insert into da_mfa_enrollment_intent
        (id,session_id,person_id,auth_identity_id,factor_id,expires_at)
        values ($1,'missing','missing','missing','mfa_1',now()+interval '5 minutes')`,["x".repeat(64)])
    })
    await check("enrollment ticket single-active, five attempts, expiry and atomic replay rejection",async()=>{
      const browserId="s".repeat(64), authId="auth_ci_1"
      await db.unsafe(`insert into da_login_binding
        (auth_identity_id,person_id,actor_type,actor_id,verified_at)
        values ($1,$2,'user',$3,now())`,[authId,actor.person_id,actor.actor_id])
      await db.unsafe(`insert into da_browser_session
        (id,person_id,auth_identity_id,actor_type,actor_id,epoch,csrf_hash,status,created_at,last_activity_at)
        values ($1,$2,$3,'user',$4,0,$5,'active',now(),now())`,
        [browserId,actor.person_id,authId,actor.actor_id,"placeholder_csrf"])
      assert.equal((await db.unsafe("select mfa_purpose from da_browser_session where id=$1",[browserId]))[0].mfa_purpose,"legacy")
      await invalidInsert("update da_browser_session set mfa_purpose='full' where id=$1",[browserId])
      await invalidInsert("update da_browser_session set mfa_purpose='mfa_enroll',mfa_platform_version=0 where id=$1",[browserId])
      await invalidInsert("update da_browser_session set mfa_purpose='UNKNOWN' where id=$1",[browserId])
      await db.unsafe(`update da_browser_session set mfa_purpose='full',
        mfa_platform_version=0,mfa_person_version=0 where id=$1`,[browserId])
      assert.equal((await db.unsafe("select mfa_purpose from da_browser_session where id=$1",[browserId]))[0].mfa_purpose,"full")
      await invalidInsert(`update da_browser_session set mfa_purpose='legacy' where id=$1`,[browserId])
      const ticketId="t".repeat(64)
      await db.unsafe(`insert into da_mfa_enrollment_intent
        (id,session_id,person_id,auth_identity_id,factor_id,expires_at)
        values ($1,$2,$3,$4,'mfa_ci_pending',clock_timestamp()+interval '5 minutes')`,
        [ticketId,browserId,actor.person_id,authId])
      await invalidInsert(`insert into da_mfa_enrollment_intent
        (id,session_id,person_id,auth_identity_id,factor_id,expires_at)
        values ($1,$2,$3,$4,'mfa_second',clock_timestamp()+interval '5 minutes')`,
        ["u".repeat(64),browserId,actor.person_id,authId])
      for(let n=1;n<=5;n++){
        const rows=await db.unsafe(`update da_mfa_enrollment_intent set attempts=attempts+1
          where id=$1 and attempts<5 and expires_at>clock_timestamp()
          and consumed_at is null and revoked_at is null returning attempts`,[ticketId])
        assert.equal(rows.length,1)
        assert.equal(rows[0].attempts,n)
      }
      assert.equal((await db.unsafe(`update da_mfa_enrollment_intent set attempts=attempts+1
        where id=$1 and attempts<5 returning id`,[ticketId])).length,0)
      const once=await db.unsafe(`update da_mfa_enrollment_intent
        set consumed_at=clock_timestamp()
        where id=$1 and factor_id='mfa_ci_pending' and attempts between 1 and 5
        and consumed_at is null and revoked_at is null
        and expires_at>clock_timestamp() returning id`,[ticketId])
      assert.equal(once.length,1)
      const replay=await db.unsafe(`update da_mfa_enrollment_intent
        set consumed_at=clock_timestamp() where id=$1 and consumed_at is null
        returning id`,[ticketId])
      assert.equal(replay.length,0)
      await db.unsafe(`insert into da_mfa_enrollment_intent
        (id,session_id,person_id,auth_identity_id,factor_id,expires_at)
        values ($1,$2,$3,$4,'mfa_next',clock_timestamp()+interval '5 minutes')`,
        ["u".repeat(64),browserId,actor.person_id,authId])
      assert.equal((await db.unsafe(`select count(*)::int as n from da_mfa_enrollment_intent
        where session_id=$1 and consumed_at is null and revoked_at is null`,[browserId]))[0].n,1)
    })
    await check("pending-factor reset revokes tickets across two independent browser sessions",async()=>{
      const authId="auth_ci_1",secondBrowserId="z".repeat(64)
      const secondTicketId="w".repeat(64),firstTicketId="u".repeat(64)
      await db.unsafe(`insert into da_browser_session
        (id,person_id,auth_identity_id,actor_type,actor_id,epoch,csrf_hash,status,
          created_at,last_activity_at,mfa_purpose,mfa_platform_version,mfa_person_version)
        values ($1,$2,$3,'user',$4,0,$5,'active',now(),now(),'mfa_enroll',0,0)`,
        [secondBrowserId,actor.person_id,authId,actor.actor_id,"placeholder_csrf_2"])
      await db.unsafe(`insert into da_mfa_enrollment_intent
        (id,session_id,person_id,auth_identity_id,factor_id,expires_at)
        values ($1,$2,$3,$4,'mfa_next',clock_timestamp()+interval '5 minutes')`,
        [secondTicketId,secondBrowserId,actor.person_id,authId])
      const revocations=await db.unsafe(`update da_mfa_enrollment_intent set
        revoked_at=clock_timestamp() where person_id=$1 and auth_identity_id=$2
        and factor_id='mfa_next' and consumed_at is null and revoked_at is null
        returning id`,[actor.person_id,authId])
      assert.equal(revocations.length,2)
      assert.deepEqual(revocations.map(r=>r.id).sort(),[firstTicketId,secondTicketId].sort())
      const revoked=await db.unsafe(`update da_mfa_enrollment_intent
        set consumed_at=clock_timestamp() where id=$1 and revoked_at is null
        returning id`,[secondTicketId])
      assert.equal(revoked.length,0,"Revoked recovery ticket must not be reused")
      assert.equal((await db.unsafe(`select count(*)::int as n from da_mfa_enrollment_intent
        where factor_id='mfa_next' and revoked_at is null`))[0].n,0)
    })
    await check("canonical audit is append-only; outbox has unique source and foreign key", async () => {
      const sourceId="daaud_pg16_canonical_fixture"
      await db.begin(async tx=>{
        await tx.unsafe(`insert into da_audit_event
          (id,actor_person_id,actor_type,actor_id,action,module,resource,target_id,occurred_at,created_at,updated_at)
          values ($1,$2,$3,$4,'organization.membership_changed','dogruadres-access','membership',
                  'damem_ephemeral',now(),now(),now())`,
          [sourceId,actor.person_id,actor.actor_type,actor.actor_id])
        await tx.unsafe(`insert into da_audit_outbox
          (id,source_audit_event_id,source_module,envelope_version,envelope,status)
          values ('daaob_ci_1',$1,'dogruadres-access',1,$2::jsonb,'pending')`,
          [sourceId,JSON.stringify({version:1,source_module:"dogruadres-access",
            source_audit_event_id:sourceId,action:"organization.membership_changed"})])
      })
      await invalidInsert("update da_audit_event set updated_at=now() where id=$1",[sourceId])
      await invalidInsert("delete from da_audit_event where id=$1",[sourceId])
      await invalidInsert("truncate da_audit_event")
      await invalidInsert(`insert into da_audit_outbox
        (id,source_audit_event_id,envelope) values ('daaob_ci_2',$1,'{}'::jsonb)`,[sourceId])
      await invalidInsert(`insert into da_audit_outbox
        (id,source_audit_event_id,envelope) values ('daaob_ci_orphan','absent','{}'::jsonb)`)
      assert.equal((await db.unsafe("select count(*)::int as n from da_audit_outbox"))[0].n,1)
      assert.equal((await db.unsafe("select count(*)::int as n from da_audit_event where id=$1",[sourceId]))[0].n,1)
    })
    await check("actual MfaPersistence writes default, policy, preference and attributable outbox", async () => {
      const p=new MfaPersistence(sqlAdapter(db))
      assert.deepEqual(await p.readPlatformPolicy(),{platform_mode:"required",version:0})
      assert.deepEqual(await p.readPersonPreference(actor.person_id),{
        person_id:actor.person_id,user_enabled:false,version:0,
      })
      await db.begin(async tx => {
        const writer=new MfaPersistence(sqlAdapter(tx))
        assert.deepEqual(await writer.setPlatformPolicy("optional",0,actor),
          {platform_mode:"optional",version:1})
        assert.deepEqual(await writer.setPersonPreference(actor.person_id,true,0,actor),
          {person_id:actor.person_id,user_enabled:true,version:1})
      })
      const audit=await db.unsafe(`select a.actor_person_id,a.actor_type,a.actor_id,
        a.action,a.new_values,o.audit_event_id
        from da_audit_event a join da_security_outbox o on o.audit_event_id=a.id
        where a.resource='mfa-policy' order by a.action`)
      assert.equal(audit.length,2)
      for(const event of audit){
        assert.equal(event.actor_person_id,actor.person_id)
        assert.equal(event.actor_type,actor.actor_type)
        assert.equal(event.actor_id,actor.actor_id)
        assert.ok(["mfa.platform_policy.set","mfa.person_preference.set"].includes(event.action))
        const payload=typeof event.new_values==="string"?JSON.parse(event.new_values):event.new_values
        for(const key of Object.keys(payload)) assert.ok(["platform_mode","user_enabled"].includes(key))
      }
      assert.equal(await rowCount(db,"da_security_outbox"),2)
    })
    await check("two concurrent writers serialize and one stale version fails", async () => {
      let markReady!:()=>void
      const ready=new Promise<void>(resolve=>{markReady=resolve})
      let release!:()=>void
      const released=new Promise<void>(resolve=>{release=resolve})
      const first=db.begin(async tx=>{
        await new MfaPersistence(sqlAdapter(tx)).setPlatformPolicy("disabled",1,actor)
        markReady()
        await released
      })
      await ready
      let settled=false
      const second=db.begin(async tx=>{
        await tx.unsafe("set local lock_timeout='5s'")
        return new MfaPersistence(sqlAdapter(tx)).setPlatformPolicy("required",1,actor)
      }).then(()=>({ok:true as const}),error=>({ok:false as const,error}))
        .finally(()=>{settled=true})
      try{
        await new Promise(resolve=>setTimeout(resolve,150))
        assert.equal(settled,false,"Second writer bypassed advisory lock")
      }finally{
        release()
      }
      await first
      const result=await second
      assert.equal(result.ok,false)
      if(!result.ok)assert.ok(result.error instanceof MfaConcurrentUpdateError)
      assert.deepEqual(await new MfaPersistence(sqlAdapter(db)).readPlatformPolicy(),
        {platform_mode:"disabled",version:2})
      assert.equal(await rowCount(db,"da_security_outbox"),3)
    })
    await check("forced outbox failure rolls back policy, audit and outbox atomically", async () => {
      const a0=await rowCount(db,"da_audit_event"),o0=await rowCount(db,"da_security_outbox")
      await assert.rejects(db.begin(async tx=>{
        const real=sqlAdapter(tx)
        const fault:SecuritySql={execute:(statement,params)=>{
          if(statement.startsWith("insert into da_security_outbox"))throw Error("INJECTED_OUTBOX_FAULT")
          return real.execute(statement,params)
        }}
        await new MfaPersistence(fault).setPersonPreference(actor.person_id,false,1,actor)
      }),MfaOutboxFailure)
      assert.deepEqual(await new MfaPersistence(sqlAdapter(db)).readPersonPreference(actor.person_id),{
        person_id:actor.person_id,user_enabled:true,version:1,
      })
      assert.equal(await rowCount(db,"da_audit_event"),a0)
      assert.equal(await rowCount(db,"da_security_outbox"),o0)
    })
    await check("stale person preference version is rejected without mutations",async()=>{
      const a0=await rowCount(db,"da_audit_event")
      await assert.rejects(db.begin(async tx=>{
        await new MfaPersistence(sqlAdapter(tx)).setPersonPreference(actor.person_id,false,0,actor)
      }),MfaConcurrentUpdateError)
      assert.equal(await rowCount(db,"da_audit_event"),a0)
    })
    process.stdout.write("PG16 MFA acceptance checks: "+checks+" passed\n")
  }finally{
    // Run on the uniquely named CI database only; Github Actions cleans the
    // service container and private network when the job ends, even on failure.
    try{
      await db.unsafe("drop schema if exists public cascade")
      await db.unsafe("create schema public")
      process.stdout.write("CLEANUP: task-only MFA CI schema erased\n")
    }catch(error){
      process.stderr.write("CLEANUP ERROR: "+String(error)+"\n")
      process.exitCode=1
    }
    await db.close()
  }
}
main().catch(error=>{
  process.stderr.write("PG16 MFA acceptance FAILED: "+String(error)+"\n")
  process.exitCode=1
})
