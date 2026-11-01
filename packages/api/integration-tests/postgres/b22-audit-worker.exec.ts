/**
 * B22 isolated native audit-worker acceptance. Runs ONLY after the existing
 * Chrome user journey on the SAME random PostgreSQL 16 CI database.
 * Real Medusa Access, workflow and Index services; no private/prod data.
 */
import assert from "node:assert/strict"
import {spawn,spawnSync} from "node:child_process"
import {setTimeout as sleep} from "node:timers/promises"
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
      // Reuse the already proven B22 native abrupt-exit entrypoint.
      // It runs AFTER Chrome now, avoiding the historic browser timeout.
      // The newly separated exec entrypoint did not prove a crash; its failed
      // run remains in history. Verify the durable lease independently.
      const crash=spawnSync(process.execPath,
        ["run","medusa","exec","./integration-tests/postgres/b22-store-ui.exec.ts"],{
          cwd:process.cwd(),
          env:{...process.env,B22_AUDIT_CRASH_OUTBOX_ID:crashedId},
          encoding:"utf8",timeout:75000,maxBuffer:1024*1024,
        })
      assert.ok(!crash.error&&crash.status===86&&
        String(crash.stdout??"").includes("B22_AUDIT_CLAIM_BEFORE_CRASH"),
        "Separate native Medusa process must claim first outbox and abruptly exit before Index/ACK")
      const abandoned=(await q(
        "select status,attempt_count,lease_token,lease_expires_at,now() as server_now"+
        " from da_audit_outbox where id=$1",[crashedId]))[0]
      assert.equal(abandoned.status,"pending")
      assert.equal(abandoned.attempt_count,1)
      assert.ok(abandoned.lease_token)
      const expiryMs=new Date(abandoned.lease_expires_at).getTime()
      assert.ok(expiryMs>new Date(abandoned.server_now).getTime()+
        30000,"A genuine 60-second PostgreSQL lease must still be unexpired after the crash")
      assert.equal((await q(
        "select count(*)::int n from da_audit_index_entry where source_event_id=$1",
        [staffEvents[0].id]))[0].n,0)
      // While the crashed claim is locked, an actual native workflow may
      // deliver only the other canonical Staff event. No forced lease expiry.
      assert.equal((await runAuditRelayBatch(container,1)).delivered,1)
      assert.equal((await q(
        "select status from da_audit_outbox where id=$1",
        [staffEvents[1].outbox_id]))[0].status,"delivered")
      assert.equal((await q(
        "select status from da_audit_outbox where id=$1",[crashedId]))[0].status,"pending")

      // Official Medusa scheduled-job loader, not a manual workflow call:
      // worker mode on the SAME disposable DB; loopback-only dev endpoint.
      // Real cron is "* * * * *" and lease TTL must elapse naturally.
      const worker=spawn(process.execPath,
        ["run","medusa","develop","--host","127.0.0.1","--port","19623"],{
          cwd:process.cwd(),detached:true,stdio:"ignore",
          env:{...process.env,MEDUSA_WORKER_MODE:"worker",REDIS_URL:undefined,
            B22_AUDIT_CRASH_OUTBOX_ID:undefined},
        })
      let workerStopped=false,workerError=false
      worker.on("exit",()=>{workerStopped=true})
      worker.on("error",()=>{workerError=true})
      try{
        let restored=false
        const deadline=Date.now()+155000
        while(Date.now()<deadline){
          const row=(await q(
            "select status,attempt_count,delivered_at,lease_token from da_audit_outbox where id=$1",
            [crashedId]))[0]
          if(row.status==="delivered"){
            assert.ok(new Date(row.delivered_at).getTime()>=expiryMs,
              "Delivery was acknowledged before the actual crashed lease expired")
            assert.equal(row.attempt_count,2)
            assert.equal(row.lease_token,null)
            restored=true
            break
          }
          if(workerStopped||workerError)
            throw Error("Native Medusa scheduled worker stopped before audit recovery")
          await sleep(1000)
        }
        assert.ok(restored,
          "Native scheduled Medusa worker did not recover the expired crash lease and ACK within the bounded window")
      }finally{
        // Only the process group created by THIS test is terminated.
        if(worker.pid){
          try{process.kill(-worker.pid,"SIGTERM")}catch{}
          await sleep(1500)
          try{process.kill(-worker.pid,"SIGKILL")}catch{}
        }
      }
      assert.equal((await q("select count(*)::int n from da_audit_index_entry where source_event_id=$1",
        [staffEvents[0].id]))[0].n,1,
        "Real scheduled recovery must commit exactly one Index identity")
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
      process.stdout.write("PASS B22 audit worker: native Medusa child crash after PG claim, natural 60s lease expiry, scheduled worker Index ACK and single identity; lost ACK retry single Index entry\n")
    }finally{
      for(const row of originals)
        await q("update da_audit_outbox set created_at=$2 where id=$1",[row.id,row.created_at])
    }
  }finally{
    await pg.end()
  }
}
