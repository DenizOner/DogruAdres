/**
 * #220: real AccessService.changeMembership + Foundation audit/outbox orchestration
 * on disposable PostgreSQL 16.15. MedusaService-generated CRUD is represented
 * by SQL-backed methods bound to the same transaction; this is NOT full native
 * Medusa module startup/ORM acceptance.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import AccessService from "../../src/modules/dogruadres-access/service"
import { Migration20261017135550 } from "../../src/modules/dogruadres-access/migrations/Migration20261017135550"
import { Migration20261017150237 } from "../../src/modules/dogruadres-access/migrations/Migration20261017150237"
import { Migration20261018000000 } from "../../src/modules/dogruadres-access/migrations/Migration20261018000000"
import { Migration20261018010000 } from "../../src/modules/dogruadres-audit-index/migrations/Migration20261018010000"
import { Migration20261025120000 } from "../../src/modules/dogruadres-access/migrations/Migration20261025120000"
import { claimAuditDelivery, loadClaimedAuditEvent, acknowledgeAuditDelivery, deferAuditDelivery, quarantineAuditDelivery } from "../../src/modules/dogruadres-access/audit-delivery"
import { projectFoundationAuditEvent, matchesAuditIndexProjection } from "../../src/modules/dogruadres-audit-index/envelope"
import { relayOneFoundationAudit } from "../../src/workflows/dogruadres-audit-relay/relay"
import { Migration20261020230000 } from "../../src/modules/dogruadres-access/migrations/Migration20261020230000"

const url=new URL(process.env.PG_MFA_TEST_URL??"postgres://bad/invalid")
if(process.env.CI!=="true" ||
  process.env.PG_MFA_TEST_SENTINEL!=="mfa-pg16-disposable-ci-v1" ||
  url.protocol!=="postgres:" || url.hostname!=="127.0.0.1" ||
  url.port!=="5432" || url.username!=="mfa_test" ||
  url.pathname!=="/mfa_ci_ephemeral")
  throw Error("REFUSED: only the task-owned disposable PG16 CI service is permitted")
const SQL=(globalThis as any).Bun?.SQL
if(typeof SQL!=="function")throw Error("Bun PostgreSQL driver unavailable")
const db=new SQL(url.toString())
type Query={unsafe(sql:string,params?:readonly unknown[]):Promise<any[]>}
const org="daorg_tx_220",owner="daprs_tx_owner",member="daprs_tx_member"
const ownerId="daomem_tx_owner",targetId="daomem_tx_member"
type Failure="none"|"canonical"|"security"
const sql=(tx:Query,text:string,params:unknown[]=[])=>{
  let n=0
  const statement=text.replace(/\?/g,()=>"$"+(++n))
  assert.equal(n,params.length,"SQL bind count")
  return tx.unsafe(statement,params)
}
async function migrate(tx:Query,Ctor:new(...args:any[])=>any){
  const m=new Ctor(),statements:string[]=[]
  m.addSql=(s:string)=>statements.push(s)
  await m.up()
  for(const s of statements)await tx.unsafe(s)
}
function serviceFor(tx:Query,fail:Failure){
  const service=Object.create(AccessService.prototype) as any
  const manager={
    execute:(query:string,params:unknown[]=[])=>{
      if(fail==="security"&&query.startsWith("insert into da_security_outbox"))
        throw Error("INJECTED_SECURITY_OUTBOX_FAILURE")
      return sql(tx,query,params)
    },
    flush:async()=>undefined, // SQL persistence has already flushed.
  }
  const context:any={transactionManager:manager}
  const membership=async(id:string,organization:string)=>{
    const rows=await tx.unsafe("select * from da_organization_membership where id=$1 and organization_id=$2 and deleted_at is null",[id,organization])
    return rows.length===1?rows[0]:null
  }
  Object.assign(service,{
    getMembershipInOrganization:membership,
    lockMembership_:async(person:string,organization:string)=>
      tx.unsafe("select id from da_organization_membership where person_id=$1 and organization_id=$2 for update",[person,organization]),
    getActiveMembership:async(person:string,organization:string)=>{
      const rows=await tx.unsafe("select * from da_organization_membership where person_id=$1 and organization_id=$2 and status='active' and deleted_at is null",[person,organization])
      return rows.length===1?rows[0]:null
    },
    listMemberships:async(f:any)=>tx.unsafe("select * from da_organization_membership where organization_id=$1 and status=$2 and role=$3 and protected_owner=$4 and deleted_at is null",[f.organization_id,f.status,f.role,f.protected_owner]),
    updateMemberships:async(input:any)=>{
      const rows=await tx.unsafe("update da_organization_membership set role=$2,status=$3,protected_owner=$4,revoked_at=$5,updated_at=now() where id=$1 returning *",[input.id,input.role,input.status,input.protected_owner,input.revoked_at])
      assert.equal(rows.length,1)
      return rows[0]
    },
    createAuditEvents:async(events:any[],ctx:any)=>{
      assert.equal(ctx,context)
      const out:any[]=[]
      for(const event of events){
        const id="daaud_"+randomUUID()
        const rows=await tx.unsafe(
          "insert into da_audit_event (id,actor_person_id,actor_type,actor_id,role_context,organization_id,action,module,resource,target_id,previous_values,new_values,occurred_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13) returning *",
          [id,event.actor_person_id,event.actor_type,event.actor_id,event.role_context??null,event.organization_id??null,event.action,event.module,event.resource,event.target_id??null,JSON.stringify(event.previous_values??null),JSON.stringify(event.new_values??null),event.occurred_at])
        out.push(rows[0])
      }
      return out
    },
    createAuditOutboxes:async(items:any[],ctx:any)=>{
      assert.equal(ctx,context)
      if(fail==="canonical")throw Error("INJECTED_CANONICAL_OUTBOX_FAILURE")
      const out:any[]=[]
      for(const item of items){
        const rows=await tx.unsafe("insert into da_audit_outbox (id,source_audit_event_id,source_module,envelope_version,envelope,status) values ($1,$2,$3,$4,$5::jsonb,$6) returning *",
          ["daaob_"+randomUUID(),item.source_audit_event_id,item.source_module,item.envelope_version,JSON.stringify(item.envelope),item.status])
        out.push(rows[0])
      }
      return out
    },
  })
  return {service,context}
}
async function observed(){
  const [members,audits,canonical,security]=await Promise.all([
    db.unsafe("select role,status from da_organization_membership where id=$1",[targetId]),
    db.unsafe("select id,action,target_id from da_audit_event where action='organization.membership_changed' order by occurred_at"),
    db.unsafe("select source_audit_event_id,envelope from da_audit_outbox order by created_at"),
    db.unsafe("select audit_event_id from da_security_outbox order by created_at"),
  ])
  // Bun SQL may return jsonb as its encoded string; normalize for observer checks.
  return {member:members[0],audits,
    canonical:canonical.map((row:any)=>({
      ...row,envelope:typeof row.envelope==="string"?JSON.parse(row.envelope):row.envelope,
    })),security}
}
const change=(svc:any,ctx:any,role:"admin"|"member")=>
  svc.changeMembership({organization_id:org,membership_id:targetId,actor_person_id:owner,actor_type:"user",actor_id:"user_tx_owner",role},ctx)
async function main(){
  let count=0
  const check=async(name:string,fn:()=>Promise<void>)=>{
    await fn()
    count++
    process.stdout.write("PASS real PG16 Foundation service: "+name+"\n")
  }
  try{
    const identity=(await db.unsafe("select current_database() as name,current_setting('server_version_num') as ver"))[0]
    assert.equal(identity.name,"mfa_ci_ephemeral")
    assert.match(identity.ver,/^16\d{4}$/)
    assert.equal((await db.unsafe("select to_regclass('da_person') as t"))[0].t,null)
    await db.begin(async(tx:Query)=>{
      await migrate(tx,Migration20261017135550)
      await migrate(tx,Migration20261017150237)
      await migrate(tx,Migration20261020230000)
      await migrate(tx,Migration20261018000000)
      await migrate(tx,Migration20261025120000)
      await migrate(tx,Migration20261018010000)
      await tx.unsafe("insert into da_person(id) values ($1),($2)",[owner,member])
      await tx.unsafe("insert into da_organization(id,name) values ($1,'Disposable Foundation test')",[org])
      await tx.unsafe("insert into da_organization_membership(id,organization_id,person_id,role,status,protected_owner) values ($1,$3,$4,'owner','active',true),($2,$3,$5,'member','active',false)",[ownerId,targetId,org,owner,member])
    })
    await check("independent observer sees only committed membership and one-to-one audit/outboxes",async()=>{
      let signal!:()=>void,release!:()=>void
      const ready=new Promise<void>(resolve=>{signal=resolve})
      const proceed=new Promise<void>(resolve=>{release=resolve})
      const writer=db.begin(async(tx:Query)=>{
        const {service,context}=serviceFor(tx,"none")
        const updated=await change(service,context,"admin")
        assert.equal(updated.role,"admin")
        signal()
        await proceed
      })
      try{
        await Promise.race([ready,writer.then(()=>{throw Error("Transaction finished early")},e=>{throw e})])
        const before=await observed()
        assert.equal(before.member.role,"member")
        assert.equal(before.audits.length,0)
        assert.equal(before.canonical.length,0)
        assert.equal(before.security.length,0)
      }finally{release()}
      await writer
      const after=await observed()
      assert.equal(after.member.role,"admin")
      assert.equal(after.audits.length,1)
      assert.equal(after.canonical.length,1)
      assert.equal(after.security.length,1)
      assert.equal(after.audits[0].target_id,targetId)
      assert.equal(after.canonical[0].source_audit_event_id,after.audits[0].id)
      assert.equal(after.security[0].audit_event_id,after.audits[0].id)
      assert.equal(after.canonical[0].envelope.target_id,targetId)
      assert.ok(!JSON.stringify(after.canonical[0].envelope).includes("previous_values"))
    })
    for(const fault of ["canonical","security"] as const){
      await check(fault+" outbox failure reverses business, audit and both outbox writes",async()=>{
        const prior=await observed()
        const pattern=fault==="canonical"?/INJECTED_CANONICAL_OUTBOX_FAILURE/:/INJECTED_SECURITY_OUTBOX_FAILURE/
        await assert.rejects(db.begin(async(tx:Query)=>{
          const {service,context}=serviceFor(tx,fault)
          await change(service,context,"member")
        }),pattern)
        assert.deepEqual(await observed(),prior)
      })
    }
    await check("last protected Owner cannot be revoked",async()=>{
      const prior=await observed()
      await assert.rejects(db.begin(async(tx:Query)=>{
        const {service,context}=serviceFor(tx,"none")
        await service.changeMembership({organization_id:org,membership_id:ownerId,actor_person_id:owner,actor_type:"user",actor_id:"user_tx_owner",status:"revoked"},context)
      }))
      assert.deepEqual(await observed(),prior)
      assert.equal((await db.unsafe("select status from da_organization_membership where id=$1",[ownerId]))[0].status,"active")
    })

    // CR-01: actual PostgreSQL claim -> source match -> strict role projection ->
    // independent Index write -> ACK, followed by duplicate reconciliation.
    // Source rows below are synthetic; this is NOT a native Staff provisioning,
    // multi-worker crash, or full Medusa module runtime acceptance.
    await check("authorized Platform Staff audit events relay to Index and ACK on real PG16",async()=>{
      const deliver=async()=>{
        const manager={execute:(query:string,parameters:unknown[]=[])=>sql(db,query,parameters)}
        const source={
          claimFoundationAuditOutbox:()=>claimAuditDelivery(manager),
          readClaimedFoundationAudit:(claim:any)=>loadClaimedAuditEvent(manager,claim),
          acknowledgeFoundationAudit:(claim:any)=>acknowledgeAuditDelivery(manager,claim),
          deferFoundationAudit:(claim:any,code:any)=>deferAuditDelivery(manager,claim,code),
          quarantineFoundationAudit:(claim:any,code:any)=>quarantineAuditDelivery(manager,claim,code),
        }
        const index={
          async inspectFoundationAuditEvent(value:unknown){
            const envelope=projectFoundationAuditEvent(value)
            const rows=await db.unsafe("select * from da_audit_index_entry where source_module=$1 and source_event_id=$2",
              [envelope.source_module,envelope.source_event_id])
            if(!rows.length)return "missing" as const
            const row={...rows[0],envelope:typeof rows[0].envelope==="string"?JSON.parse(rows[0].envelope):rows[0].envelope}
            return rows.length===1&&matchesAuditIndexProjection(row,envelope)?"matching" as const:"conflict" as const
          },
          async indexFoundationAuditEvent(value:unknown){
            const e=projectFoundationAuditEvent(value)
            await db.unsafe(`insert into da_audit_index_entry
              (id,source_module,source_event_id,envelope_version,organization_id,
               actor_person_id,actor_type,actor_id,action,resource,target_id,
               occurred_at,indexed_at,envelope)
              values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),$13::jsonb)`,
              ["daidx_"+randomUUID(),e.source_module,e.source_event_id,e.version,e.organization_id,
                e.actor.person_id,e.actor.type,e.actor.id,e.action,e.resource,e.target_id,
                e.occurred_at,JSON.stringify(e)])
            return {created:true}
          }
        }
        return relayOneFoundationAudit(source,index)
      }
      const staffEvents=[
        {action:"organization.provisioned",resource:"organization",target:org,role:"platform_staff"},
        {action:"organization.owner_assigned",resource:"membership",target:ownerId,role:"platform_staff"},
        {action:"organization.provisioned",resource:"organization",target:org,role:"forged_superuser"},
      ] as const
      const ids:string[]=[]
      for(const event of staffEvents){
        const id="daaud_"+randomUUID(),outbox="daaob_"+randomUUID(),at=new Date().toISOString()
        const envelope={version:1,source_module:"dogruadres-access",source_audit_event_id:id,
          organization_id:org,actor:{person_id:owner,type:"user",id:"user_tx_owner",role_context:event.role},
          action:event.action,resource:event.resource,target_id:event.target,occurred_at:at}
        await db.begin(async(tx:Query)=>{
          await tx.unsafe(`insert into da_audit_event
            (id,actor_person_id,actor_type,actor_id,role_context,organization_id,
             action,module,resource,target_id,occurred_at)
            values($1,$2,'user',$3,$4,$5,$6,'dogruadres-access',$7,$8,$9)`,
            [id,owner,"user_tx_owner",event.role,org,event.action,event.resource,event.target,at])
          await tx.unsafe(`insert into da_audit_outbox
            (id,source_audit_event_id,source_module,envelope_version,envelope,status)
            values($1,$2,'dogruadres-access',1,$3::jsonb,'pending')`,
            [outbox,id,JSON.stringify(envelope)])
        })
        ids.push(id)
      }
      const results:string[]=[]
      for(let n=0;n<8;n++){
        const result=await deliver()
        if(result==="idle")break
        results.push(result)
      }
      assert.equal(results.filter(x=>x==="delivered").length,3,
        "Previously committed Owner membership plus two valid Staff events must reach Index")
      assert.equal(results.filter(x=>x==="quarantined").length,1,
        "Unsupported role must fail closed")
      for(const [i,id] of ids.entries()){
        const out=(await db.unsafe("select status,delivered_at,last_error_code from da_audit_outbox where source_audit_event_id=$1",[id]))[0]
        const idx=await db.unsafe("select source_event_id,envelope from da_audit_index_entry where source_event_id=$1",[id])
        if(i<2){
          assert.equal(out.status,"delivered");assert.ok(out.delivered_at)
          assert.equal(idx.length,1)
          const projected=typeof idx[0].envelope==="string"?JSON.parse(idx[0].envelope):idx[0].envelope
          assert.equal(projected.actor.role_context,"platform_staff")
          assert.equal(projected.action,staffEvents[i].action)
        }else{
          assert.equal(out.status,"quarantined")
          assert.equal(out.last_error_code,"ENVELOPE_INVALID")
          assert.equal(idx.length,0)
        }
        const sourceRow=await db.unsafe("select role_context from da_audit_event where id=$1",[id])
        assert.equal(sourceRow.length,1,"Canonical source must remain append-only and present")
      }
      // A lost ACK is simulated only for one task-owned previously delivered
      // outbox row; Index source identity must not be inserted a second time.
      await db.unsafe(`update da_audit_outbox set status='pending',delivered_at=null
        where source_audit_event_id=$1 and status='delivered'
          and attempt_count=1 and lease_token is null`,[ids[0]])
      assert.equal(await deliver(),"delivered")
      assert.equal((await db.unsafe("select count(*)::int n from da_audit_index_entry where source_event_id=$1",[ids[0]]))[0].n,1)
      assert.equal((await db.unsafe("select attempt_count from da_audit_outbox where source_audit_event_id=$1",[ids[0]]))[0].attempt_count,2)
      assert.equal(await deliver(),"idle")
    })
    process.stdout.write("PG16 Foundation service checks: "+count+" passed\n")
  }finally{
    try{
      await db.unsafe("drop schema if exists public cascade")
      await db.unsafe("create schema public")
      process.stdout.write("CLEANUP: task-only Foundation service CI schema erased\n")
    }catch(e){
      process.stderr.write("CLEANUP ERROR: "+String(e)+"\n")
      process.exitCode=1
    }
    await db.close()
  }
}
main().catch(e=>{
  process.stderr.write("Foundation service PG16 FAILED: "+String(e)+"\n")
  process.exitCode=1
})
