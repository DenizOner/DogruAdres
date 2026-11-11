/**
 * B22 #252: real disposable PostgreSQL 16 acceptance of the EXISTING
 * scheduled email attempt worker and canonical admin-alert clock.
 * The native SMTP/Chrome journeys are separate required checks: this test
 * proves neither mailbox delivery nor a successful email transport.
 */
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import AccessService from "../../src/modules/dogruadres-access/service"
import { Migration20261111170000 } from "../../src/modules/dogruadres-access/migrations/Migration20261111170000"
import { runPlatformClosingEmailTick } from "../../src/jobs/dogruadres-platform-closing-email"
import { canonicalEventForOutbox } from "../../src/modules/dogruadres-access/audit-delivery-policy"

type Pg = { unsafe(query:string,params?:readonly unknown[]):Promise<any[]> }
const url=new URL(process.env.PG_MFA_TEST_URL??"postgres://invalid/invalid")
if(process.env.CI!=="true" || process.env.GITHUB_ACTIONS!=="true" ||
  process.env.GITHUB_EVENT_NAME!=="pull_request" ||
  process.env.PG_MFA_TEST_SENTINEL!=="mfa-pg16-disposable-ci-v1" ||
  url.protocol!=="postgres:" || url.hostname!=="127.0.0.1" ||
  url.port!=="5432" || url.username!=="mfa_test" ||
  url.password!=="ci-disposable-only-not-a-real-secret" ||
  url.pathname!=="/mfa_ci_ephemeral")
  throw Error("REFUSED: B22 closing-email test requires task-only disposable PG16")
const SQL=(globalThis as any).Bun?.SQL
if(typeof SQL!=="function")throw Error("Bun native PG driver unavailable")
const db=new SQL(url.toString())
const q=(statement:string,params:unknown[]=[])=>db.unsafe(statement,params)
function bind(tx:Pg,statement:string,params:unknown[]=[]){
  let n=0
  const sql=statement.replace(/\?/g,()=>"$"+(++n))
  assert.equal(n,params.length,"Bound SQL parameters")
  return tx.unsafe(sql,params)
}
async function migrate(Ctor:new (...args:any[])=>any){
  const m=new Ctor()
  const statements:string[]=[]
  m.addSql=(s:string)=>statements.push(s)
  await m.up()
  for(const sql of statements)await q(sql)
}
const org="daorg_b22_email_pg16",owner="daprs_b22_mail_owner",staff="daprs_b22_mail_staff"
const sha=(s:string)=>createHash("sha256").update(s).digest("hex")
const uuid=()=>randomUUID().replace(/-/g,"")
let injectOutboxFailure=false
function serviceFor(tx:Pg){
  const service=Object.create(AccessService.prototype) as any
  const context:any={transactionManager:{
    execute:(statement:string,params:unknown[]=[])=>bind(tx,statement,params),
    flush:async()=>undefined
  }}
  service.createAuditEvents=async(events:any[],scope:any)=>{
    assert.equal(scope,context)
    const rows=[]
    for(const e of events){
      const id="daaud_"+uuid()
      const inserted=await bind(tx,"insert into da_audit_event "+
        "(id,actor_person_id,actor_type,actor_id,role_context,organization_id,"+
        "action,module,resource,target_id,new_values,occurred_at) "+
        "values (?,?,?,?,?,?,?,?,?,?,?::jsonb,?) returning *",[
        id,e.actor_person_id,e.actor_type,e.actor_id,e.role_context??null,
        e.organization_id??null,e.action,e.module,e.resource,e.target_id??null,
        JSON.stringify(e.new_values??null),e.occurred_at
      ])
      rows.push(inserted[0])
    }
    return rows
  }
  service.createAuditOutboxes=async(items:any[],scope:any)=>{
    assert.equal(scope,context)
    if(injectOutboxFailure)throw Error("INJECTED_B22_CANONICAL_OUTBOX_FAILURE")
    const rows=[]
    for(const item of items){
      const inserted=await bind(tx,"insert into da_audit_outbox "+
        "(id,source_audit_event_id,source_module,envelope_version,envelope,status) "+
        "values (?,?,?,?,?::jsonb,?) returning *",[
        "daaob_"+uuid(),item.source_audit_event_id,item.source_module,
        item.envelope_version,JSON.stringify(item.envelope),item.status
      ])
      rows.push(inserted[0])
    }
    return rows
  }
  return {service,context}
}
const manager={
  transactional:<T>(work:(em:{execute:(s:string,p?:unknown[])=>Promise<any[]>})=>Promise<T>)=>
    db.begin(async (tx:Pg)=>work({execute:(s:string,p:unknown[]=[])=>bind(tx,s,p)}))
}
const container:any={resolve:(name:string)=>{
  if(name==="dogruadresAccess")return {
    settlePlatformClosingAdminFallback:()=>db.begin(async(tx:Pg)=>{
      const {service,context}=serviceFor(tx)
      return service.settlePlatformClosingAdminFallback(context)
    })
  }
  return manager
}}
async function setup(){
  // Nothing from this isolated test touches real/production data.
  await q("drop schema if exists public cascade")
  await q("create schema public")
  await q("create table da_person (id text primary key,disabled_at timestamptz,deleted_at timestamptz)")
  await q("create table da_organization_membership (id text primary key,"+
    "organization_id text,person_id text,role text,status text,"+
    "protected_owner boolean,revoked_at timestamptz,deleted_at timestamptz)")
  await q("create table da_audit_event (id text primary key,"+
    "actor_person_id text,actor_type text,actor_id text,role_context text,"+
    "organization_id text,action text,module text,resource text,target_id text,"+
    "new_values jsonb,occurred_at timestamptz,deleted_at timestamptz)")
  await q("create table da_audit_outbox (id text primary key,"+
    "source_audit_event_id text references da_audit_event(id),"+
    "source_module text,envelope_version int not null default 1,"+
    "envelope jsonb,status text,deleted_at timestamptz,"+
    "unique(source_module,source_audit_event_id))")
  await q("create table da_store_platform_closing (seller_id text primary key,"+
    "organization_id text not null,source_audit_event_id text references da_audit_event(id),"+
    "state text not null,version integer not null,request_id text not null,"+
    "reason text not null,started_at timestamptz not null,"+
    "appeal_audit_event_id text,appeal_request_id text,appeal_reason text,"+
    "appealed_at timestamptz,updated_at timestamptz)")
  await q("create table da_platform_staff_grant (id text primary key,"+
    "person_id text,task text,resource text,revoked_at timestamptz,expires_at timestamptz)")
  await q("create table da_notification_receipt (id text primary key,"+
    "person_id text,audit_event_id text,read_at timestamptz,"+
    "unique(audit_event_id,person_id))")
  await q("create table da_login_binding (person_id text,actor_type text,"+
    "actor_id text,auth_identity_id text,revoked_at timestamptz,verified_at timestamptz)")
  await q("create table da_actor_mapping (id text,person_id text,actor_type text,"+
    "actor_id text,deleted_at timestamptz)")
  await migrate(Migration20261111170000)
  await q("insert into da_person(id) values ($1),($2)",[owner,staff])
  await q("insert into da_organization_membership"+
    "(id,organization_id,person_id,role,status,protected_owner)"+
    "values ($1,$2,$3,'owner','active',true)",
    ["daomem_b22_mail",org,owner])
  await q("insert into da_platform_staff_grant"+
    "(id,person_id,task,resource) values ($1,$2,'store.closing.manage','platform')",
    ["dastaff_b22_mail",staff])
}
async function seed(seller:string,attempts=0,state="pending",leaseExpired=false){
  const reason="Sentetik B22 mağaza kapatma işlemi için güvenlik gerekçesi"
  const requestId="dascp_"+uuid()
  const eventId="daaud_"+uuid()
  const occurred=new Date(Date.now()-73*3600000).toISOString()
  const event={
    id:eventId,actor_person_id:staff,actor_type:"user",actor_id:"user_b22_staff",
    role_context:"platform_staff",organization_id:org,
    action:"organization.store_platform_closing_started",
    module:"dogruadres-access",resource:"store-platform-closing",
    target_id:seller,occurred_at:occurred,
    new_values:{request_id:requestId,state:"notification_unverified",reason_sha256:sha(reason)}
  }
  await q("insert into da_audit_event (id,actor_person_id,actor_type,actor_id,"+
    "role_context,organization_id,action,module,resource,target_id,new_values,occurred_at) "+
    "values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)",
    [event.id,event.actor_person_id,event.actor_type,event.actor_id,event.role_context,
      event.organization_id,event.action,event.module,event.resource,event.target_id,
      JSON.stringify(event.new_values),event.occurred_at])
  const envelope={version:1,source_module:"dogruadres-access",
    source_audit_event_id:eventId,organization_id:org,
    actor:{person_id:staff,type:"user",id:"user_b22_staff",role_context:"platform_staff"},
    action:event.action,resource:event.resource,target_id:seller,occurred_at:occurred}
  await q("insert into da_audit_outbox "+
    "(id,source_audit_event_id,source_module,envelope_version,envelope,status) "+
    "values ($1,$2,'dogruadres-access',1,$3::jsonb,'pending')",
    ["daaob_"+uuid(),eventId,JSON.stringify(envelope)])
  await q("insert into da_store_platform_closing "+
    "(seller_id,organization_id,source_audit_event_id,state,version,request_id,"+
    "reason,started_at) values ($1,$2,$3,'notification_unverified',1,$4,$5,$6)",
    [seller,org,eventId,requestId,reason,occurred])
  const claim=leaseExpired?randomUUID():null
  await q("insert into da_store_platform_closing_email "+
    "(seller_id,person_id,next_attempt_at,attempts,last_result,claim_id,lease_until) "+
    "values ($1,$2,clock_timestamp()-interval '1 second',$3,$4,$5,"+
    "case when $5::uuid is null then null else clock_timestamp()-interval '1 second' end)",
    [seller,owner,attempts,state,claim])
}
async function row(seller:string){
  const rows=await q("select * from da_store_platform_closing where seller_id=$1",[seller])
  assert.equal(rows.length,1)
  return rows[0]
}
async function assertAudit(seller:string,basis:string){
  const rows=await q("select e.*,o.source_audit_event_id,o.source_module,o.envelope_version,o.envelope "+
    "from da_store_platform_closing c "+
    "join da_audit_event e on e.id=c.deadline_audit_event_id "+
    "join da_audit_outbox o on o.source_audit_event_id=e.id "+
    "where c.seller_id=$1",[seller])
  assert.equal(rows.length,1,"Exactly one committed source audit and outbox")
  const e=rows[0],actual=await row(seller)
  assert.equal(e.action,"organization.store_platform_closing_deadline_started")
  assert.equal(e.role_context,"platform_automation")
  assert.equal(e.new_values.basis,basis)
  assert.equal(new Date(e.new_values.deadline_started_at).toISOString(),
    actual.deadline_started_at.toISOString())
  assert.ok(canonicalEventForOutbox(e,e),"Canonical Foundation envelope must verify")
  assert.equal(JSON.stringify(e).includes("closing_notice="),false)
  assert.equal(JSON.stringify(e).includes("Sentetik B22 mağaza"),false)
  assert.equal((await q("select count(*)::int as n from da_store_platform_closing_admin_notice "+
    "where seller_id=$1",[seller]))[0].n,1)
}
async function main(){
  try{
    await setup()
    const a="sel_b22_mail_pg_a"
    await seed(a)
    // Two real independent transactions must claim only one first slot.
    await Promise.all([runPlatformClosingEmailTick(container),runPlatformClosingEmailTick(container)])
    let status=(await q("select attempts,last_result,delivered_at,lease_until,"+
      "last_attempt_at,next_attempt_at from da_store_platform_closing_email "+
      "where seller_id=$1",[a]))[0]
    assert.equal(status.attempts,1)
    assert.equal(status.last_result,"unverified_identity")
    assert.equal(status.delivered_at,null)
    assert.equal(status.lease_until,null)
    const interval=new Date(status.next_attempt_at).getTime()-
      new Date(status.last_attempt_at).getTime()
    assert.ok(interval>=23.99*3600000&&interval<=24.01*3600000,
      "The next retry must be scheduled at +24 hours")
    assert.equal((await row(a)).deadline_started_at,null)
    for(let attempt=2;attempt<=4;attempt++){
      // Advance ONLY this task-owned queue's next due timestamp: no wall-clock wait.
      await q("update da_store_platform_closing_email "+
        "set next_attempt_at=clock_timestamp()-interval '1 second' where seller_id=$1",[a])
      await runPlatformClosingEmailTick(container)
      status=(await q("select attempts,last_result from da_store_platform_closing_email "+
        "where seller_id=$1",[a]))[0]
      assert.equal(status.attempts,attempt)
      assert.equal(status.last_result,"unverified_identity")
      if(attempt<4)assert.equal((await row(a)).deadline_started_at,null)
    }
    const aClock=await row(a)
    assert.equal(aClock.deadline_basis,"admin_alert")
    assert.ok(aClock.deadline_started_at)
    assert.equal(aClock.admin_alert_at.toISOString(),aClock.deadline_started_at.toISOString())
    await assertAudit(a,"admin_alert")
    const firstStart=aClock.deadline_started_at.toISOString()
    await runPlatformClosingEmailTick(container)
    assert.equal((await row(a)).deadline_started_at.toISOString(),firstStart)
    assert.equal((await q("select count(*)::int as n from da_audit_event "+
      "where action='organization.store_platform_closing_deadline_started' "+
      "and target_id=$1",[a]))[0].n,1)
    process.stdout.write("PASS B22 PG16: concurrent cron one claim, 4 bounded slots +24h, one private Admin alert/audited 10+20 clock, replay safe; native SMTP delivery NOT TESTED\n")
    const crash="sel_b22_mail_pg_crash"
    await seed(crash,4,"inflight",true)
    await runPlatformClosingEmailTick(container)
    const crashed=(await q("select attempts,last_result,claim_id,lease_until,delivered_at "+
      "from da_store_platform_closing_email where seller_id=$1",[crash]))[0]
    assert.equal(crashed.attempts,4)
    assert.equal(crashed.last_result,"uncertain")
    assert.equal(crashed.claim_id,null)
    assert.equal(crashed.lease_until,null)
    assert.equal(crashed.delivered_at,null)
    assert.equal((await row(crash)).deadline_basis,"admin_alert")
    await assertAudit(crash,"admin_alert")
    process.stdout.write("PASS B22 PG16: expired last-claim crash is uncertain not delivered; recorded Admin fallback never deadlocks\n")
    const rollback="sel_b22_mail_pg_rollback"
    await seed(rollback,4,"failed")
    injectOutboxFailure=true
    await assert.rejects(runPlatformClosingEmailTick(container),/INJECTED_B22_CANONICAL_OUTBOX_FAILURE/)
    injectOutboxFailure=false
    assert.equal((await row(rollback)).deadline_started_at,null,
      "Outbox failure must roll back deadline")
    assert.equal((await q("select count(*)::int as n from da_store_platform_closing_admin_notice "+
      "where seller_id=$1",[rollback]))[0].n,0,"No orphaned Admin receipt")
    assert.equal((await q("select count(*)::int as n from da_audit_event "+
      "where action='organization.store_platform_closing_deadline_started' "+
      "and target_id=$1",[rollback]))[0].n,0,"No orphaned clock audit")
    await runPlatformClosingEmailTick(container)
    await assertAudit(rollback,"admin_alert")
    process.stdout.write("PASS B22 PG16: forced audit/outbox error rolls back Admin notification and clock; safe next tick recovers\n")
  }finally{
    injectOutboxFailure=false
    try{
      await q("drop schema if exists public cascade")
      await q("create schema public")
      process.stdout.write("CLEANUP: isolated B22 mail PG16 fixture erased\n")
    }catch(e){
      process.stderr.write("CLEANUP ERROR: "+String(e)+"\n")
      process.exitCode=1
    }
    await db.close()
  }
}
main().catch(e=>{
  process.stderr.write("B22 email PostgreSQL acceptance FAILED: "+(e instanceof Error?e.stack:String(e))+"\n")
  process.exitCode=1
})
