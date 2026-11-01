/**
 * B22 isolated native audit-worker acceptance. Runs ONLY after the existing
 * Chrome user journey on the SAME random PostgreSQL 16 CI database.
 * Real Medusa Access, workflow and Index services; no private/prod data.
 */
import assert from "node:assert/strict"
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
      // Actual Medusa job module resolves real Access and Index services,
      // backed by the same disposable native PostgreSQL database.
      const batch=await runAuditRelayBatch(container,2)
      assert.equal(batch.delivered,2)
      assert.equal(batch.lastOutcome,"delivered")
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
      assert.equal((await q("select attempt_count from da_audit_outbox where id=$1",[crashedId]))[0].attempt_count,1)
      // Simulated lost ACK after a real Index commit: only outbox state is
      // reset in the disposable DB. Native Index must not insert again.
      assert.equal((await q("update da_audit_outbox set status='pending',delivered_at=null"+
        " where id=$1 and status='delivered' and attempt_count=1 returning id",[crashedId])).length,1)
      assert.equal((await runAuditRelayBatch(container,1)).delivered,1)
      assert.equal((await q("select attempt_count from da_audit_outbox where id=$1",[crashedId]))[0].attempt_count,2)
      assert.equal((await q("select count(*)::int n from da_audit_index_entry where source_event_id=$1",[staffEvents[0].id]))[0].n,1)
      assert.equal((await q("select count(*)::int n from da_audit_event where id=any($1::text[])",[staffEvents.map(e=>e.id)]))[0].n,2)
      process.stdout.write("PASS B22 audit worker: real Medusa Access/Index job delivered canonical Staff events, ACK and single Index entry on lost-ACK replay; crash recovery NOT TESTED\n")
    }finally{
      for(const row of originals)
        await q("update da_audit_outbox set created_at=$2 where id=$1",[row.id,row.created_at])
    }
  }finally{
    await pg.end()
  }
}
