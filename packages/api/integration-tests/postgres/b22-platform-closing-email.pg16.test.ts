/**
 * B22 #252: real disposable PostgreSQL 16 acceptance of the EXISTING
 * scheduled email attempt worker and canonical admin-alert clock.
 * The native SMTP/Chrome journeys are separate required checks: this test
 * proves neither mailbox delivery nor a successful email transport.
 */
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { createServer } from "node:net"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import AccessService from "../../src/modules/dogruadres-access/service"
import { Migration20261111170000 } from "../../src/modules/dogruadres-access/migrations/Migration20261111170000"
import { Migration20261112100000 } from "../../src/modules/dogruadres-access/migrations/Migration20261112100000"
import { runPlatformClosingEmailTick } from "../../src/jobs/dogruadres-platform-closing-email"
import { canonicalEventForOutbox } from "../../src/modules/dogruadres-access/audit-delivery-policy"
import { projectFoundationAuditEvent } from "../../src/modules/dogruadres-audit-index/envelope"

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
// Bun's typed JSON parameter inference may wrap a JSON string as a JSONB
// scalar. Build the test-only canonical object in PostgreSQL explicitly, so
// the actual source proof and Index contract get the object they require.
async function insertOutbox(tx:Pg,id:string,item:any){
  const e=item.envelope,a=e.actor
  return bind(tx,"insert into da_audit_outbox "+
    "(id,source_audit_event_id,source_module,envelope_version,envelope,status) "+
    "values (?,?,?,?,"+
    "jsonb_build_object('version',?::integer,'source_module',?::text,"+
    "'source_audit_event_id',?::text,'organization_id',?::text,"+
    "'actor',jsonb_build_object('person_id',?::text,'type',?::text,'id',?::text,'role_context',?::text),"+
    "'action',?::text,'resource',?::text,'target_id',?::text,'occurred_at',?::text),?) returning *",[
    id,item.source_audit_event_id,item.source_module,item.envelope_version,
    e.version,e.source_module,e.source_audit_event_id,e.organization_id,
    a.person_id,a.type,a.id,a.role_context,
    e.action,e.resource,e.target_id,e.occurred_at,item.status
  ])
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
const syntheticEmail="owner@example.invalid"
const syntheticIdentity="auth_b22_mail_pg"
const syntheticActor="user_b22_mail_pg"
let testSmtp:{enabled:boolean;host:string;port:number;
  security:"none";from_email:string}|null=null
function serviceFor(tx:Pg){
  const service=Object.create(AccessService.prototype) as any
  const context:any={transactionManager:{
    execute:(statement:string,params:unknown[]=[])=>bind(tx,statement,params),
    flush:async()=>undefined
  }}
  service.createAuditEvents=async(events:any[],scope:any)=>{
    assert.equal(scope,context)
    const rows:any[]=[]
    for(const e of events){
      const id="daaud_"+uuid()
      const finalReview=e.action==="organization.store_platform_closing_final_review_requested"
      const values=finalReview?
        "jsonb_build_object('request_id',?::text,'stage',?::text,'reason_sha256',?::text)":
        "jsonb_build_object('basis',?::text,'deadline_started_at',?::text,'evidence',?::text)"
      const inserted=await bind(tx,"insert into da_audit_event "+
        "(id,actor_person_id,actor_type,actor_id,role_context,organization_id,"+
        "action,module,resource,target_id,new_values,occurred_at) "+
        "values (?,?,?,?,?,?,?,?,?,?,"+values+",?) returning *",[
        id,e.actor_person_id,e.actor_type,e.actor_id,e.role_context??null,
        e.organization_id??null,e.action,e.module,e.resource,e.target_id??null,
        finalReview?e.new_values.request_id:e.new_values.basis,
        finalReview?e.new_values.stage:e.new_values.deadline_started_at,
        finalReview?e.new_values.reason_sha256:e.new_values.evidence,
        e.occurred_at
      ])
      rows.push(inserted[0])
    }
    return rows
  }
  service.createAuditOutboxes=async(items:any[],scope:any)=>{
    assert.equal(scope,context)
    if(injectOutboxFailure)throw Error("INJECTED_B22_CANONICAL_OUTBOX_FAILURE")
    const rows:any[]=[]
    for(const item of items){
      const inserted=await insertOutbox(tx,"daaob_"+uuid(),item)
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
  if(name===ContainerRegistrationKeys.PG_CONNECTION)return {
    transaction:<T>(work:(t:{raw:(s:string,p:unknown[])=>Promise<{rows:any[]}>})=>Promise<T>)=>
      db.begin(async (tx:Pg)=>work({
        raw:async (s:string,p:unknown[]=[])=>({rows:await bind(tx,s,p)})
      }))
  }
  if(name===ContainerRegistrationKeys.QUERY)return {
    graph:async()=>({data:[{id:syntheticActor,email:syntheticEmail}]})
  }
  if(name===Modules.AUTH)return {
    listAuthIdentities:async()=>[{
      id:syntheticIdentity,
      provider_identities:[{provider:"emailpass",entity_id:syntheticEmail}]
    }],
    listAuthVerifications:async()=>[{
      entity_type:"email",entity_id:syntheticEmail,
      verified_at:new Date(),deleted_at:null
    }]
  }
  if(name==="dogruadresAccess")return {
    getActiveSmtpConfig:async()=>testSmtp,
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
  await migrate(Migration20261112100000)
  await q("insert into da_person(id) values ($1),($2)",[owner,staff])
  await q("insert into da_organization_membership"+
    "(id,organization_id,person_id,role,status,protected_owner)"+
    "values ($1,$2,$3,'owner','active',true)",
    ["daomem_b22_mail",org,owner])
  await q("insert into da_platform_staff_grant"+
    "(id,person_id,task,resource) values ($1,$2,'store.closing.manage','platform')",
    ["dastaff_b22_mail",staff])
}
async function seed(seller:string,attempts=0,state="pending",leaseExpired=false,
  occurredAt?:string){
  const reason="Sentetik B22 mağaza kapatma işlemi için güvenlik gerekçesi"
  const requestId="dascp_"+uuid()
  const eventId="daaud_"+uuid()
  const occurred=occurredAt??new Date(Date.now()-73*3600000).toISOString()
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
    "values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,"+
    "jsonb_build_object('request_id',$11::text,'state',$12::text,'reason_sha256',$13::text),$14)",
    [event.id,event.actor_person_id,event.actor_type,event.actor_id,event.role_context,
      event.organization_id,event.action,event.module,event.resource,event.target_id,
      event.new_values.request_id,event.new_values.state,
      event.new_values.reason_sha256,event.occurred_at])
  const envelope={version:1,source_module:"dogruadres-access",
    source_audit_event_id:eventId,organization_id:org,
    actor:{person_id:staff,type:"user",id:"user_b22_staff",role_context:"platform_staff"},
    action:event.action,resource:event.resource,target_id:seller,occurred_at:occurred}
  await insertOutbox(db as Pg,"daaob_"+uuid(),{
    source_audit_event_id:eventId,source_module:"dogruadres-access",
    envelope_version:1,envelope,status:"pending"
  })
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
/** Disposable fixture only; never changes the real clock or protected data. */
async function syntheticDeadline(seller:string,ageHours:number){
  const when=new Date(Date.now()-ageHours*3600000).toISOString()
  const eventId="daaud_"+uuid()
  await q("insert into da_audit_event "+
    "(id,actor_person_id,actor_type,actor_id,role_context,organization_id,"+
    "action,module,resource,target_id,new_values,occurred_at) "+
    "values ($1,$2,'user',$3,'owner',$4,"+
    "'organization.store_platform_closing_deadline_started',"+
    "'dogruadres-access','store-platform-closing',$5,"+
    "jsonb_build_object('basis','owner_delivery',"+
    "'deadline_started_at',$6::text),$6::timestamptz)",
    [eventId,owner,syntheticActor,org,seller,when])
  await insertOutbox(db as Pg,"daaob_"+uuid(),{
    source_audit_event_id:eventId,source_module:"dogruadres-access",
    envelope_version:1,status:"pending",envelope:{
      version:1,source_module:"dogruadres-access",
      source_audit_event_id:eventId,organization_id:org,
      actor:{person_id:owner,type:"user",id:syntheticActor,role_context:"owner"},
      action:"organization.store_platform_closing_deadline_started",
      resource:"store-platform-closing",target_id:seller,occurred_at:when
    }
  })
  await q("update da_store_platform_closing "+
    "set deadline_started_at=$2,deadline_basis='owner_delivery',"+
    "deadline_audit_event_id=$3 where seller_id=$1",[seller,when,eventId])
  return when
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
  const e={...rows[0],
    new_values:typeof rows[0].new_values==="string"?
      JSON.parse(rows[0].new_values):rows[0].new_values,
    envelope:typeof rows[0].envelope==="string"?
      JSON.parse(rows[0].envelope):rows[0].envelope
  },actual=await row(seller)
  assert.equal(e.action,"organization.store_platform_closing_deadline_started")
  assert.equal(e.role_context,"platform_automation")
  assert.equal(e.new_values.basis,basis)
  assert.equal(new Date(e.new_values.deadline_started_at).toISOString(),
    actual.deadline_started_at.toISOString())
  assert.ok(canonicalEventForOutbox(e,e),"Canonical Foundation envelope must verify")
  const indexed=projectFoundationAuditEvent(e)
  assert.equal(indexed.action,"organization.store_platform_closing_deadline_started")
  assert.equal(indexed.actor.role_context,"platform_automation")
  assert.equal(indexed.resource,"store-platform-closing")
  assert.throws(()=>projectFoundationAuditEvent({...e,role_context:"member"}),
    /INVALID_AUDIT_INDEX_ENVELOPE/,"Ordinary Member cannot impersonate automation")
  assert.throws(()=>projectFoundationAuditEvent({...e,action:"organization.store_platform_closing_started"}),
    /INVALID_AUDIT_INDEX_ENVELOPE/,"Automation may not fabricate a Staff decision")
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
    // The isolated fixture must satisfy the exact canonical source audit
    // predicates before we interpret any scheduler denial as a product defect.
    const sourceProof=await q("select c.state,c.version,c.request_id,"+
      "exists(select 1 from da_audit_event e join da_audit_outbox x "+
      "on x.source_audit_event_id=e.id and x.source_module='dogruadres-access' "+
      "and x.deleted_at is null where e.id=c.source_audit_event_id "+
      "and e.deleted_at is null and e.module='dogruadres-access' "+
      "and e.role_context='platform_staff' and e.resource='store-platform-closing' "+
      "and e.action='organization.store_platform_closing_started' "+
      "and e.organization_id=c.organization_id and e.target_id=c.seller_id "+
      "and e.new_values->>'request_id'=c.request_id "+
      "and e.new_values->>'state'='notification_unverified' "+
      "and e.new_values->>'reason_sha256'="+
      "encode(sha256(convert_to(c.reason,'UTF8')),'hex')) as start_proof,"+
      "(c.appeal_audit_event_id is null) as appeal_proof,"+
      "(c.deadline_started_at is null) as deadline_proof "+
      "from da_store_platform_closing c where c.seller_id=$1",[a])
    assert.equal(sourceProof.length,1,"One synthetic closure fixture")
    const auditParts=await q("select "+
      "(e.id=c.source_audit_event_id) as audit_link,"+
      "(e.deleted_at is null) as active_event,"+
      "(e.module='dogruadres-access') as module_ok,"+
      "(e.role_context='platform_staff') as role_ok,"+
      "(e.resource='store-platform-closing') as resource_ok,"+
      "(e.action='organization.store_platform_closing_started') as action_ok,"+
      "(e.organization_id=c.organization_id) as org_ok,"+
      "(e.target_id=c.seller_id) as seller_ok,"+
      "(e.new_values->>'request_id'=c.request_id) as request_ok,"+
      "(e.new_values->>'state'='notification_unverified') as state_ok,"+
      "(e.new_values->>'reason_sha256'="+
        "encode(sha256(convert_to(c.reason,'UTF8')),'hex')) as digest_ok,"+
      "(o.source_module='dogruadres-access' and o.deleted_at is null) as outbox_ok "+
      "from da_store_platform_closing c "+
      "join da_audit_event e on e.id=c.source_audit_event_id "+
      "join da_audit_outbox o on o.source_audit_event_id=e.id "+
      "where c.seller_id=$1",[a])
    assert.equal(auditParts.length,1,"One canonical fixture source and outbox")
    for(const [field,ok] of Object.entries(auditParts[0]))
      assert.equal(ok,true,"Synthetic source fixture predicate: "+field)
    assert.equal(sourceProof[0].start_proof,true,
      "Real canonical start audit and outbox must validate before the worker")
    assert.equal(sourceProof[0].appeal_proof,true)
    assert.equal(sourceProof[0].deadline_proof,true)
    assert.match(sourceProof[0].request_id,/^dascp_[a-f0-9]{32}$/)
    assert.equal(sourceProof[0].state,"notification_unverified")
    assert.equal(Number(sourceProof[0].version),1)
    // Two real independent transactions must claim only one first slot.
    await Promise.all([runPlatformClosingEmailTick(container),runPlatformClosingEmailTick(container)])
    let status=(await q("select attempts,last_result,delivered_at,lease_until,"+
      "last_attempt_at,next_attempt_at from da_store_platform_closing_email "+
      "where seller_id=$1",[a]))[0]
    assert.equal(status.attempts,1)
    assert.equal(status.last_result,"unverified_identity")
    assert.equal(status.delivered_at,null)
    assert.equal(status.lease_until,null)
    const startedAt=new Date((await row(a)).started_at).getTime()
    const firstSlot=new Date(status.next_attempt_at).getTime()
    assert.equal(firstSlot-startedAt,24*3600000,
      "First retry must be tied to immutable initial Staff closing +24h, not a late cron execution")
    assert.ok(firstSlot<Date.now(),
      "Deliberately delayed first cron must keep the original missed slot")
    assert.equal((await row(a)).deadline_started_at,null)
    for(let attempt=2;attempt<=4;attempt++){
      // Advance ONLY this task-owned queue's next due timestamp: no wall-clock wait.
      await q("update da_store_platform_closing_email "+
        "set next_attempt_at=clock_timestamp()-interval '1 second' where seller_id=$1",[a])
      await runPlatformClosingEmailTick(container)
      status=(await q("select attempts,last_result,next_attempt_at from da_store_platform_closing_email "+
        "where seller_id=$1",[a]))[0]
      assert.equal(status.attempts,attempt)
      assert.equal(status.last_result,"unverified_identity")
      assert.equal(new Date(status.next_attempt_at).getTime()-startedAt,
        attempt*24*3600000,
        "All planned slots remain anchored to the initial decision")
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
    process.stdout.write("PASS B22 PG16: concurrent cron one claim, late first tick preserves original +24/+48/+72h planned slots, one private Admin alert/audited 10+20 clock, replay safe; native SMTP delivery NOT TESTED\n")
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
    // Exercise the REAL job -> Medusa verified-email helper -> TLS SMTP
    // transport in its explicitly permitted loopback test mode. No external
    // provider, recipient, DNS, or production credentials are touched.
    const mailSeller="sel_b22_mail_pg_smtp_accepted"
    const rejectedSeller="sel_b22_mail_pg_smtp_rejected"
    await seed(mailSeller)
    await q("insert into da_login_binding "+
      "(person_id,actor_type,actor_id,auth_identity_id,verified_at) "+
      "values ($1,'user',$2,$3,clock_timestamp())",
      [owner,syntheticActor,syntheticIdentity])
    await q("insert into da_actor_mapping(id,person_id,actor_type,actor_id) "+
      "values ($1,$2,'user',$3)",["damap_b22_mail_pg",owner,syntheticActor])
    const observed={acceptedRecipient:false,secureLink:false,acceptedData:false}
    let refuseRecipient=false,dropAfterData=false
    const mock=createServer(socket=>{
      socket.setEncoding("utf8")
      socket.write("220 smtp.loopback.test ESMTP\r\n")
      let pending="",receivingData=false
      socket.on("data",(chunk:string)=>{
        pending+=chunk
        let end=-1
        while((end=pending.indexOf("\r\n"))>=0){
          const line=pending.slice(0,end)
          pending=pending.slice(end+2)
          if(receivingData){
            if(line==="."){
              receivingData=false
              if(dropAfterData){
                // The remote side can commit DATA and drop before its 250 ACK.
                socket.destroy()
              }else{
                observed.acceptedData=true
                socket.write("250 message queued on isolated loopback\r\n")
              }
            }else if(line.includes("/personal#closing_notice=")){
              observed.secureLink=true
            }
          }else if(line.startsWith("EHLO ")){
            socket.write("250 smtp.loopback.test\r\n")
          }else if(line.startsWith("MAIL FROM:")){
            socket.write("250 sender accepted\r\n")
          }else if(line.startsWith("RCPT TO:")){
            assert.equal(line,"RCPT TO:<"+syntheticEmail+">",
              "Test SMTP must never send to a real recipient")
            observed.acceptedRecipient=true
            socket.write(refuseRecipient?"550 recipient rejected\r\n":"250 recipient accepted\r\n")
          }else if(line==="DATA"){
            receivingData=true
            socket.write("354 send message data\r\n")
          }else if(line==="QUIT"){
            socket.write("221 goodbye\r\n")
            socket.end()
          }else{
            socket.destroy()
          }
        }
      })
    })
    const previousNodeEnv=process.env.NODE_ENV
    const previousOrigin=process.env.DOGRUADRES_PUBLIC_ORIGIN
    try{
      await new Promise<void>((resolve,reject)=>{
        mock.once("error",reject)
        mock.listen(0,"127.0.0.1",resolve)
      })
      const address=mock.address()
      assert.ok(address&&typeof address!=="string")
      // Production transport accepts plaintext only for test loopback.
      process.env.NODE_ENV="test"
      process.env.DOGRUADRES_PUBLIC_ORIGIN="https://example.invalid"
      testSmtp={enabled:true,host:"127.0.0.1",port:address.port,
        security:"none",from_email:"security@example.invalid"}
      await runPlatformClosingEmailTick(container)
      const accepted=(await q("select attempts,last_result,message_id,"+
        "delivered_at,delivery_source from da_store_platform_closing_email "+
        "where seller_id=$1",[mailSeller]))[0]
      assert.equal(accepted.attempts,1)
      assert.equal(accepted.last_result,"accepted")
      assert.ok(accepted.message_id,"SMTP 250 must persist a private Message-ID")
      assert.equal(accepted.delivered_at,null,
        "SMTP 250 is never mailbox-delivery proof")
      assert.equal(accepted.delivery_source,null)
      assert.equal((await row(mailSeller)).deadline_started_at,null,
        "SMTP acceptance must not start the 10+20 clock")
      assert.ok(observed.acceptedRecipient&&observed.acceptedData&&observed.secureLink,
        "Loopback SMTP must receive synthetic recipient, DATA and safe link")
      assert.equal(Number((await q("select count(*)::int n "+
        "from da_store_platform_closing_email_link "+
        "where seller_id=$1",[mailSeller]))[0].n),1)
      // The same job must handle a real SMTP 550 without delivery or a clock.
      refuseRecipient=true
      await seed(rejectedSeller)
      await runPlatformClosingEmailTick(container)
      const refused=(await q("select attempts,last_result,message_id,delivered_at "+
        "from da_store_platform_closing_email where seller_id=$1",
        [rejectedSeller]))[0]
      assert.equal(refused.attempts,1)
      assert.equal(refused.last_result,"failed")
      assert.equal(refused.message_id,null)
      assert.equal(refused.delivered_at,null)
      assert.equal((await row(rejectedSeller)).deadline_started_at,null)
      // A connection lost AFTER DATA may still have been accepted remotely.
      // It is neither proven delivered nor a definitive negative response.
      refuseRecipient=false
      dropAfterData=true
      const unknownSeller="sel_b22_mail_pg_smtp_unknown"
      await seed(unknownSeller)
      await runPlatformClosingEmailTick(container)
      const unknown=(await q("select attempts,last_result,message_id,delivered_at "+
        "from da_store_platform_closing_email where seller_id=$1",
        [unknownSeller]))[0]
      assert.equal(unknown.attempts,1)
      assert.equal(unknown.last_result,"uncertain",
        "Lost SMTP DATA ACK must never be reported as a definite rejection")
      assert.equal(unknown.message_id,null)
      assert.equal(unknown.delivered_at,null)
      assert.equal((await row(unknownSeller)).deadline_started_at,null)
      process.stdout.write(
        "PASS B22 PG16+loopback SMTP: 250 accepted, 550 refused, post-DATA "+
        "disconnect uncertain; none grants mailbox delivery or premature clock\n")
    // Focused real PG16 clock-negative: the first appeal is a different
    // action from a post-day-10 independent review. Reuse the existing
    // Foundation service directly, while the separate Chrome test exercises
    // real session/Owner authorization; only this synthetic isolation
    // replaces the authorization lookup to target the clock boundary.
    const expiredSeller="sel_b22_first_appeal_day11"
    const expiredStart=new Date(Date.now()-12*86400000).toISOString()
    const expiredDeadline=new Date(Date.now()-11*86400000).toISOString()
    await seed(expiredSeller,4,"failed",false,expiredStart)
    const expiredAuditId="daaud_"+uuid()
    await q("insert into da_audit_event "+
      "(id,actor_person_id,actor_type,actor_id,role_context,organization_id,"+
      "action,module,resource,target_id,new_values,occurred_at) "+
      "values ($1,$2,'user',$3,'owner',$4,"+
      "'organization.store_platform_closing_deadline_started',"+
      "'dogruadres-access','store-platform-closing',$5,"+
      "jsonb_build_object('basis','owner_delivery',"+
      "'deadline_started_at',$6::text),$6::timestamptz)",
      [expiredAuditId,owner,syntheticActor,org,expiredSeller,expiredDeadline])
    await insertOutbox(db as Pg,"daaob_"+uuid(),{
      source_audit_event_id:expiredAuditId,source_module:"dogruadres-access",
      envelope_version:1,status:"pending",envelope:{
        version:1,source_module:"dogruadres-access",
        source_audit_event_id:expiredAuditId,organization_id:org,
        actor:{person_id:owner,type:"user",id:syntheticActor,role_context:"owner"},
        action:"organization.store_platform_closing_deadline_started",
        resource:"store-platform-closing",target_id:expiredSeller,
        occurred_at:expiredDeadline
      }
    })
    await q("update da_store_platform_closing "+
      "set deadline_started_at=$2,deadline_basis='owner_delivery',"+
      "deadline_audit_event_id=$3 where seller_id=$1",
      [expiredSeller,expiredDeadline,expiredAuditId])
    const countBefore=(await q("select count(*)::int n from da_audit_event "+
      "where target_id=$1",[expiredSeller]))[0].n
    const outboxBefore=(await q("select count(*)::int n "+
      "from da_audit_outbox x join da_audit_event e "+
      "on e.id=x.source_audit_event_id where e.target_id=$1",
      [expiredSeller]))[0].n
    const lateResult=await db.begin(async (tx:Pg)=>{
      const {service,context}=serviceFor(tx)
      ;(service as any).ownerPauseScope_=async()=>({
        actor:{person_id:owner,actor_type:"user",actor_id:syntheticActor}
      })
      return service.personalAppealPlatformStoreClosing("synthetic-clock-only",{
        organization_id:org,seller_id:expiredSeller,
        request_id:"dapa_"+uuid(),expected_version:1,
        reason:"Sentetik on birinci günde geç ilk itiraz reddedilmeli"
      },context)
    })
    assert.deepEqual(lateResult,{status:"conflict"},
      "A new first appeal after ten server calendar days must be denied")
    const expiredAfter=await row(expiredSeller)
    assert.equal(expiredAfter.state,"notification_unverified")
    assert.equal(expiredAfter.version,1)
    assert.equal(expiredAfter.appeal_request_id,null)
    assert.equal(expiredAfter.deadline_started_at.toISOString(),expiredDeadline)
    assert.equal((await q("select count(*)::int n from da_audit_event "+
      "where target_id=$1",[expiredSeller]))[0].n,countBefore,
      "Late appeal may not write a new canonical event")
    assert.equal((await q("select count(*)::int n "+
      "from da_audit_outbox x join da_audit_event e "+
      "on e.id=x.source_audit_event_id where e.target_id=$1",
      [expiredSeller]))[0].n,outboxBefore,
      "Late appeal may not write a source outbox event")
    assert.equal((await q("select count(*)::int n "+
      "from da_notification_receipt n join da_audit_event e "+
      "on e.id=n.audit_event_id where e.target_id=$1 and "+
      "e.action='organization.store_platform_closing_appealed'",
      [expiredSeller]))[0].n,0,
      "Late appeal may not generate private Owner notices")
    process.stdout.write("PASS B22 PG16: expired day-11 first appeal denied with unchanged deadline, state, audit/outbox and private receipts\n")
    // New protected Owners get a separately timed current-state notice.
    // Their record must NOT backfill the original closure audit receipt.
    // A newly assigned Owner at T0+71h must not restart the initial
    // decision's 72-hour fallback. The new Owner still gets a private
    // notice and their own four slots, independently of the old clock.
    const nearDeadlineSeller="sel_b22_mail_pg_late_before_deadline"
    await seed(nearDeadlineSeller,4,"failed")
    const nearDeadlineAudit=(await row(nearDeadlineSeller)).source_audit_event_id
    await q("insert into da_notification_receipt(id,person_id,audit_event_id) "+
      "values ($1,$2,$3)",["danot_b22_initial_near_deadline",owner,nearDeadlineAudit])
    const lateOwner="dap_b22_mail_pg_late"
    await q("insert into da_person(id) values ($1)",[lateOwner])
    await q("insert into da_organization_membership"+
      "(id,organization_id,person_id,role,status,protected_owner)"+
      "values ($1,$2,$3,'owner','active',true)",
      ["daomem_b22_mail_late",org,lateOwner])
    // Test-only clock boundary: the source closure occurred T0=73 hours ago.
    // B acquired Owner status at T0+71h, BEFORE the +72h fallback. Its
    // separately sourced email receipt has no original-audit ancestry.
    // This insertion models already-committed history in disposable PG16;
    // refreshAudience is independently exercised by seller "a" below.
    await q("insert into da_store_platform_closing_email "+
      "(seller_id,person_id,late_notice_id,next_attempt_at,created_at) "+
      "select $1,$2,'danot_'||gen_random_uuid()::text,"+
      "c.started_at+interval '71 hours',c.started_at+interval '71 hours' "+
      "from da_store_platform_closing c where c.seller_id=$1",
      [nearDeadlineSeller,lateOwner])
    // The original decision has already exhausted its four slots.
    // A fresh late Owner has not completed their schedule; this must NOT
    // defer the original Admin notification or clock.
    await Promise.all([
      runPlatformClosingEmailTick(container),
      runPlatformClosingEmailTick(container)
    ])
    const initialClock=await row(nearDeadlineSeller)
    assert.equal(initialClock.deadline_basis,"admin_alert",
      "A late Owner must not defer the initial 72-hour clock")
    await assertAudit(nearDeadlineSeller,"admin_alert")
    const nearDeadlineLate=(await q("select attempts,late_notice_id,delivered_at,"+
      "created_at,next_attempt_at from da_store_platform_closing_email "+
      "where seller_id=$1 and person_id=$2",
      [nearDeadlineSeller,lateOwner]))[0]
    assert.equal(nearDeadlineLate.attempts,1,
      "Late Owner's four-slot schedule must stay independent")
    assert.ok(nearDeadlineLate.late_notice_id)
    assert.equal(nearDeadlineLate.delivered_at,null)
    assert.equal(new Date(nearDeadlineLate.created_at).getTime()-
      new Date(initialClock.started_at).getTime(),71*3600000,
      "Late Owner was assigned one hour before the original +72h boundary")
    assert.equal(new Date(nearDeadlineLate.next_attempt_at).getTime()-
      new Date(nearDeadlineLate.created_at).getTime(),24*3600000)
    assert.equal(Number((await q("select count(*)::int n "+
      "from da_audit_event where target_id=$1 "+
      "and action='organization.store_platform_closing_deadline_started'",
      [nearDeadlineSeller]))[0].n),1,
      "Concurrent worker replay must never create a second clock event")
    const originalAudit=(await row(a)).source_audit_event_id
    const oldRecipients=await q("select person_id from da_notification_receipt "+
      "where audit_event_id=$1",[originalAudit])
    await runPlatformClosingEmailTick(container)
    const late=(await q("select late_notice_id,late_notice_read_at,created_at,attempts,"+
      "next_attempt_at from da_store_platform_closing_email "+
      "where seller_id=$1 and person_id=$2",[a,lateOwner]))[0]
    assert.match(late.late_notice_id,/^danot_[0-9a-f-]+$/)
    assert.equal(late.late_notice_read_at,null)
    assert.equal(late.attempts,1)
    assert.equal(new Date(late.next_attempt_at).getTime()-
      new Date(late.created_at).getTime(),24*3600000,
      "A subsequently added Owner uses their own notification origin")
    const recipientsAfter=await q("select person_id from da_notification_receipt "+
      "where audit_event_id=$1",[originalAudit])
    assert.deepEqual(recipientsAfter,oldRecipients,
      "Later membership may never create a retroactive original-event receipt")
    assert.equal((await q("select count(*)::int n from da_notification_receipt "+
      "where person_id=$1 and audit_event_id=$2",[lateOwner,originalAudit]))[0].n,0)
    // Revoking the late protected Owner must halt future SMTP claims, even
    // when the existing per-recipient next_attempt_at becomes due.
    await q("update da_organization_membership "+
      "set status='revoked',revoked_at=clock_timestamp() "+
      "where organization_id=$1 and person_id=$2",[org,lateOwner])
    await q("update da_store_platform_closing_email "+
      "set next_attempt_at=clock_timestamp()-interval '1 second' "+
      "where seller_id=$1 and person_id=$2",[nearDeadlineSeller,lateOwner])
    await runPlatformClosingEmailTick(container)
    assert.equal(Number((await q("select attempts from da_store_platform_closing_email "+
      "where seller_id=$1 and person_id=$2",[nearDeadlineSeller,lateOwner]))[0].attempts),1,
      "Revoked late Owner must receive no additional email attempt")
    assert.equal((await row(nearDeadlineSeller)).deadline_started_at.toISOString(),
      initialClock.deadline_started_at.toISOString(),
      "Revocation and worker replay must not restart the deadline")
    process.stdout.write("PASS B22 PG16: T0+71h late Owner cannot defer original +72h Admin clock; concurrent workers produce one source audit/outbox, four-slot notice remains separate; revocation stops future attempts\n")
    process.stdout.write("PASS B22 PG16: post-closing Owner gets new dated private notice, original audit recipient history unchanged, separate +24h schedule\n")
    }finally{
      testSmtp=null
      if(previousNodeEnv===undefined)delete process.env.NODE_ENV
      else process.env.NODE_ENV=previousNodeEnv
      if(previousOrigin===undefined)delete process.env.DOGRUADRES_PUBLIC_ORIGIN
      else process.env.DOGRUADRES_PUBLIC_ORIGIN=previousOrigin
      if(mock.listening)await new Promise<void>(resolve=>mock.close(()=>resolve()))
    }

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
