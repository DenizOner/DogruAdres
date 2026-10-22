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
  return {member:members[0],audits,canonical,security}
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
