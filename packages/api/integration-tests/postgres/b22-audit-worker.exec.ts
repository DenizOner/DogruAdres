/**
 * B22 isolated native audit-worker acceptance. Runs ONLY after the existing
 * Chrome user journey on the SAME random PostgreSQL 16 CI database.
 * Real Medusa Access, workflow and Index services; no private/prod data.
 */
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {Client} from "@medusajs/framework/pg"
import {runAuditRelayBatch} from "../../src/jobs/dogruadres-audit-relay"

export default async function({container}:any){
  const u=new URL(process.env.DATABASE_URL??"postgres://invalid/invalid")
  assert.ok(process.env.GITHUB_ACTIONS==="true"&&process.env.CI==="true"&&
    process.env.GITHUB_EVENT_NAME==="pull_request"&&
    process.env.B22_UI_AUTO_SCOPE==="b22-ui"&&
    process.env.PG_MFA_TEST_SCOPE==="b22-ui"&&
    process.env.PG_MFA_TEST_SENTINEL==="mfa-pg16-disposable-ci-v1"&&
    process.env.PG_MFA_NATIVE_TEST_DATABASE===u.pathname.slice(1)&&
    process.env.DOGRUADRES_B22_PG_LOCK_TEST==="true"&&
    process.env.DOGRUADRES_IDENTITY_ENABLED==="true"&&
    u.protocol==="postgres:"&&u.hostname==="127.0.0.1"&&
    u.port==="5432"&&u.username==="mfa_test"&&
    u.password==="ci-disposable-only-not-a-real-secret"&&
    /^\/mfa_cli_ci_[0-9a-f]{16}$/.test(u.pathname),
    "REFUSED: native audit worker test requires exact disposable B22 CI database")
  // Task-owned native Medusa child: commit claim then exit without ACK.
  const auditCrash=process.env.B22_AUDIT_CRASH_OUTBOX_ID
  if(auditCrash){
    assert.notEqual(process.env.B22_UI_PREPARE,"true")
    assert.match(auditCrash,/^daaob_[A-Za-z0-9_-]{1,120}$/)
    const claim=await container.resolve("dogruadresAccess").claimFoundationAuditOutbox()
    assert.equal(claim?.id,auditCrash)
    process.stdout.write("B22_AUDIT_CLAIM_BEFORE_CRASH\n",()=>process.exit(86))
    await new Promise<void>(()=>{})
    return
  }
  const pg=new Client({connectionString:u.toString()})
  await pg.connect()
  const q=async(sql:string,args:unknown[]=[]) => (await pg.query(sql,args)).rows
  try{
    const staffEvents=await q(
      "select e.id,e.organization_id,e.action,e.resource,o.id as outbox_id"+
      " from da_audit_event e join da_audit_outbox o on o.source_audit_event_id=e.id"+
      " join da_organization org on org.id=e.organization_id"+
      " where org.name like 'B22 Staff provision %' and e.role_context='platform_staff'"+
      " and e.action in ('organization.provisioned','organization.owner_assigned')"+
      " order by e.action")
    assert.deepEqual(staffEvents.map(e=>e.action),
      ["organization.owner_assigned","organization.provisioned"])
    const staffOrgId=staffEvents[0].organization_id
    assert.ok(staffEvents.every(e=>e.organization_id===staffOrgId))
    // Real Medusa Access/Index job: the two Staff HTTP audit events are
    // the only queue items reprioritized within this disposable database.
    const originals=await q("select id,created_at,status from da_audit_outbox where source_audit_event_id=any($1::text[])",
      [staffEvents.map(e=>e.id)])
    assert.equal(originals.length,2)
    assert.ok(originals.every(e=>e.status==="pending"))
    const crashedId=staffEvents[0].outbox_id
    try{
      const due=await q("update da_audit_outbox set created_at=(select min(created_at) from da_audit_outbox)-interval '1 day'"+
        " + case when id=$1 then interval '0 seconds' else interval '1 second' end"+
        " where id in ($1,$2) and status='pending' returning id",
        [crashedId,staffEvents[1].outbox_id])
      assert.equal(due.length,2)
      const child=spawnSync("bun",["run","medusa","exec","./integration-tests/postgres/b22-store-ui.exec.ts"],{
        cwd:process.cwd(),env:{...process.env,B22_AUDIT_CRASH_OUTBOX_ID:crashedId},
        encoding:"utf8",timeout:45000,maxBuffer:1024*1024,stdio:["ignore","pipe","pipe"]})
      assert.ok(!child.error&&child.status===86&&
        String(child.stdout??"").includes("B22_AUDIT_CLAIM_BEFORE_CRASH"),
        "Separate Medusa process must commit real claim and exit 86")
      const abandoned=(await q("select status,attempt_count,lease_token,lease_expires_at from da_audit_outbox where id=$1",[crashedId]))[0]
      assert.equal(abandoned.status,"pending")
      assert.equal(abandoned.attempt_count,1)
      assert.ok(abandoned.lease_token)
      assert.ok(new Date(abandoned.lease_expires_at).getTime()>Date.now())
      assert.equal((await q("select count(*)::int n from da_audit_index_entry where source_event_id=$1",[staffEvents[0].id]))[0].n,0)
      // The leased source event is skipped; the next event is delivered.
      assert.equal((await runAuditRelayBatch(container,1)).delivered,1)
      assert.equal((await q("select status from da_audit_outbox where id=$1",[staffEvents[1].outbox_id]))[0].status,"delivered")
      // Only this task-owned crash lease is moved past expiry. This is not
      // evidence of natural 60s wall-clock TTL.
      const expire=await q("update da_audit_outbox set lease_expires_at=now()-interval '1 second'"+
        " where id=$1 and lease_token=$2 and status='pending' and lease_expires_at>now() returning id",
        [crashedId,abandoned.lease_token])
      assert.equal(expire.length,1)
      assert.equal((await runAuditRelayBatch(container,1)).delivered,1)
      for(const e of staffEvents){
        const rows=await q("select o.status,o.delivered_at,o.lease_token,o.attempt_count,"+
          " i.source_module,i.organization_id,i.action,i.resource,i.envelope"+
          " from da_audit_outbox o join da_audit_index_entry i on i.source_event_id=o.source_audit_event_id"+
          " where o.id=$1",[e.outbox_id])
        assert.equal(rows.length,1)
        const row=rows[0]
        assert.equal(row.status,"delivered")
        assert.ok(row.delivered_at)
        assert.equal(row.lease_token,null)
        assert.equal(row.source_module,"dogruadres-access")
        assert.equal(row.organization_id,staffOrgId)
        assert.equal(row.action,e.action)
        assert.equal(row.resource,e.resource)
        const envelope=typeof row.envelope==="string"?JSON.parse(row.envelope):row.envelope
        assert.equal(envelope.actor.role_context,"platform_staff")
        assert.equal((await q("select count(*)::int n from da_audit_index_entry where source_event_id=$1",[e.id]))[0].n,1)
      }
      assert.equal((await q("select attempt_count from da_audit_outbox where id=$1",[crashedId]))[0].attempt_count,2)
      // Simulated lost ACK after a real Index commit: only outbox state is
      // reset in the disposable DB. Native Index must not insert again.
      assert.equal((await q("update da_audit_outbox set status='pending',delivered_at=null"+
        " where id=$1 and status='delivered' and attempt_count=2 returning id",[crashedId])).length,1)
      assert.equal((await runAuditRelayBatch(container,1)).delivered,1)
      assert.equal((await q("select attempt_count from da_audit_outbox where id=$1",[crashedId]))[0].attempt_count,3)
      assert.equal((await q("select count(*)::int n from da_audit_index_entry where source_event_id=$1",[staffEvents[0].id]))[0].n,1)
      assert.equal((await q("select count(*)::int n from da_audit_event where id=any($1::text[])",[staffEvents.map(e=>e.id)]))[0].n,2)
      process.stdout.write("PASS B22 audit worker: real Medusa Access/Index job after isolated process crash and forced lease expiry; Staff events ACK and single Index entry on lost-ACK replay; natural TTL NOT TESTED\n")
    }finally{
      for(const row of originals)
        await q("update da_audit_outbox set created_at=$2 where id=$1",[row.id,row.created_at])
    }
  }finally{
    await pg.end()
  }
}
