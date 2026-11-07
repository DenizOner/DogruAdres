/**
 * B22 isolated native audit-worker acceptance. Runs ONLY after the existing
 * Chrome user journey on the SAME random PostgreSQL 16 CI database.
 * Real Medusa Access, workflow and Index services; no private/prod data.
 */
import assert from "node:assert/strict"
import {Client} from "@medusajs/framework/pg"
import {runAuditRelayBatch} from "../../src/jobs/dogruadres-audit-relay"
import {relayOneFoundationAudit} from "../../src/workflows/dogruadres-audit-relay/relay"
import {once} from "node:events"

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
    if(process.env.B22_AUDIT_RECOVERY_CHILD==='claim-crash'){
      const target=process.env.B22_AUDIT_RECOVERY_TARGET
      assert.ok(typeof target==='string'&&/^daaob_[A-Za-z0-9_-]+$/.test(target))
      const svc=container.resolve('dogruadresAccess') as any
      const claim=await svc.claimFoundationAuditOutbox()
      assert.equal(claim?.id,target)
      const [persisted]=await q('select status,attempt_count,lease_token from da_audit_outbox where id=$1',[target])
      assert.equal(persisted?.status,'pending')
      assert.equal(persisted?.attempt_count,1)
      assert.equal(persisted?.lease_token,claim.leaseToken)
      await pg.end()
      process.kill(process.pid,'SIGKILL')
      throw Error('Dedicated worker crash did not terminate')
    }
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
      // Real Owner-created follow/unfollow events must reach Index as well.
      // Exercise the installed Access/Index relay on the same disposable DB.
      const followEvents=await q(
        "select e.id,e.organization_id,e.target_id,e.action,e.resource,"+
        " o.id as outbox_id,o.created_at,o.status"+
        " from da_audit_event e join da_audit_outbox o on o.source_audit_event_id=e.id"+
        " where e.module='dogruadres-access' and e.resource='buyer-store-follow'"+
        " and e.role_context='owner' and e.action in"+
        " ('organization.store_followed','organization.store_unfollowed')"+
        " and o.status='pending' order by e.occurred_at,e.id")
      const followed=followEvents.find(e=>e.action==='organization.store_followed')
      const unfollowed=followEvents.find(e=>
        e.action==='organization.store_unfollowed'&&
        e.organization_id===followed?.organization_id&&
        e.target_id===followed?.target_id)
      assert.ok(followed&&unfollowed,"Real B22 Buyer×Store follow/unfollow source pair required")
      const pair=[followed,unfollowed]
      const outboxOriginal=await q("select id,created_at from da_audit_outbox where id=any($1::text[])",
        [pair.map(x=>x.outbox_id)])
      assert.equal(outboxOriginal.length,2)
      try{
        const due=await q(
          "update da_audit_outbox set created_at=(select min(created_at) from da_audit_outbox)-interval '2 days'"+
          " + case when id=$1 then interval '0 seconds' else interval '1 second' end"+
          " where id in ($1,$2) and status='pending' returning id",
          pair.map(x=>x.outbox_id))
        assert.equal(due.length,2)
        const batch=await runAuditRelayBatch(container,2)
        assert.equal(batch.delivered,2)
        for(const event of pair){
          const rows=await q(
            "select o.status,i.source_event_id,i.organization_id,i.target_id,"+
            " i.action,i.resource,i.envelope from da_audit_outbox o"+
            " join da_audit_index_entry i on i.source_event_id=o.source_audit_event_id"+
            " where o.id=$1",[event.outbox_id])
          assert.equal(rows.length,1)
          assert.equal(rows[0].status,'delivered')
          assert.equal(rows[0].source_event_id,event.id)
          assert.equal(rows[0].organization_id,event.organization_id)
          assert.equal(rows[0].target_id,event.target_id)
          assert.equal(rows[0].action,event.action)
          assert.equal(rows[0].resource,'buyer-store-follow')
          const envelope=typeof rows[0].envelope==='string'?
            JSON.parse(rows[0].envelope):rows[0].envelope
          assert.equal(envelope.actor.role_context,'owner')
          assert.deepEqual(Object.keys(envelope).sort(),
            ['action','actor','occurred_at','organization_id','resource',
             'source_event_id','source_module','target_id','version'])
        }
        process.stdout.write("PASS B22 real audit relay: native Owner Store follow/unfollow delivered by Medusa worker to Buyer-only Audit Index, two matching envelopes and durable ACKs\n")
      }finally{
        for(const original of outboxOriginal)
          await q("update da_audit_outbox set created_at=$2 where id=$1",
            [original.id,original.created_at])
      }
      // The real B22 Chrome Staff POSTs persist company-policy changes in
      // canonical Access audit/outbox. Exercise the EXISTING native Medusa
      // Access -> Index relay on those exact two events (no synthetic producer).
      const policyReasons=[
        "B22 synthetic company application pause",
        "B22 synthetic company application reopen",
      ]
      const policyEvents=await q(
        "select e.id,e.organization_id,e.target_id,e.action,e.resource,"+
        " o.id as outbox_id,o.created_at,o.status"+
        " from da_audit_event e join da_audit_outbox o on o.source_audit_event_id=e.id"+
        " where e.module='dogruadres-access' and e.role_context='platform_staff'"+
        " and e.resource='organization' and e.target_id=e.organization_id"+
        " and e.action in ('organization.store_application_right_disabled',"+
        " 'organization.store_application_right_enabled')"+
        " and e.new_values->>'reason'=any($1::text[])"+
        " and o.status='pending' and o.attempt_count=0 and o.lease_token is null"+
        " order by e.action",[policyReasons])
      assert.deepEqual(policyEvents.map(e=>e.action),[
        "organization.store_application_right_disabled",
        "organization.store_application_right_enabled",
      ],"Both genuine, distinct company policy changes must be pending for relay")
      const policyOrg=policyEvents[0].organization_id
      assert.ok(policyEvents.every(e=>e.organization_id===policyOrg &&
        e.target_id===policyOrg && e.resource==="organization"))
      const policyOriginal=policyEvents.map(e=>({
        id:e.outbox_id,created_at:e.created_at,
      }))
      try{
        const due=await q(
          "update da_audit_outbox set"+
          " created_at=(select min(created_at) from da_audit_outbox)-interval '3 days'"+
          " + case when id=$1 then interval '0 seconds' else interval '1 second' end"+
          " where id in ($1,$2) and status='pending' and attempt_count=0"+
          " and lease_token is null returning id",
          policyEvents.map(e=>e.outbox_id))
        assert.equal(due.length,2)
        const delivered=await runAuditRelayBatch(container,2)
        assert.equal(delivered.delivered,2,
          "Real Medusa worker must deliver both Staff company policy events")
        for(const event of policyEvents){
          const rows=await q(
            "select o.status,o.delivered_at,o.lease_token,"+
            " i.organization_id,i.source_event_id,i.action,i.resource,i.target_id,i.envelope"+
            " from da_audit_outbox o join da_audit_index_entry i"+
            " on i.source_event_id=o.source_audit_event_id"+
            " where o.id=$1",[event.outbox_id])
          assert.equal(rows.length,1,"Canonical policy outbox must join one Index record")
          const row=rows[0]
          assert.equal(row.status,"delivered")
          assert.ok(row.delivered_at)
          assert.equal(row.lease_token,null)
          assert.equal(row.organization_id,policyOrg)
          assert.equal(row.source_event_id,event.id)
          assert.equal(row.action,event.action)
          assert.equal(row.resource,"organization")
          assert.equal(row.target_id,policyOrg)
          const envelope=typeof row.envelope==="string"?JSON.parse(row.envelope):row.envelope
          assert.equal(envelope.actor.role_context,"platform_staff")
          assert.equal(envelope.actor.type,"user")
          assert.deepEqual(Object.keys(envelope).sort(),[
            "action","actor","occurred_at","organization_id","resource",
            "source_event_id","source_module","target_id","version"])
          assert.equal(JSON.stringify(envelope).includes(policyReasons[0]),false)
          assert.equal(JSON.stringify(envelope).includes(policyReasons[1]),false)
          assert.equal(JSON.stringify(envelope).includes("staff_grant_id"),false)
          assert.equal(JSON.stringify(envelope).includes("reason"),false)
        }
        // This is the Index-backed path behind the Owner-authorized HTTP
        // timeline. The separate HTTP privacy test already checks denied roles.
        const auditIndex=container.resolve("dogruadresAuditIndex") as any
        const timeline=await auditIndex.readOrganizationTimeline(policyOrg,100)
        for(const event of policyEvents)
          assert.ok(timeline.some((e:any)=>e.source_event_id===event.id &&
            e.organization_id===policyOrg && e.action===event.action),
            "Company policy event must appear in the scoped Audit Index timeline")
        process.stdout.write("PASS B22 real audit relay: platform company policy disable/reopen delivered by native Medusa Access/Index, redacted envelopes, durable ACKs and scoped timeline\n")
      }finally{
        for(const row of policyOriginal)
          await q("update da_audit_outbox set created_at=$2 where id=$1",
            [row.id,row.created_at])
      }
      await realAuditRelayRecovery(container,q)
    }finally{
      for(const row of originals)
        await q("update da_audit_outbox set created_at=$2 where id=$1",[row.id,row.created_at])
    }
  }finally{
    await pg.end()
  }
}


// B22 real native recovery: genuine PG16 claims and installed Medusa cron,
// no mocked database writes, timestamp rewinds or replacement scheduler.
async function realAuditRelayRecovery(
  container:any,q:(sql:string,args?:unknown[])=>Promise<any[]>
) {
  const {spawn,spawnSync}=await import('node:child_process')
  const {setTimeout:sleep}=await import('node:timers/promises')
  const source=container.resolve('dogruadresAccess') as any
  const index=container.resolve('dogruadresAuditIndex') as any
  const actions=['organization.membership_changed','organization.invitation_created',
    'organization.invitation_revoked','organization.invitation_accepted']
  const eligible=await q(`select o.id,o.created_at,o.source_audit_event_id
    from da_audit_outbox o join da_audit_event e on e.id=o.source_audit_event_id
    where o.status='pending' and o.deleted_at is null and o.attempt_count=0
      and o.lease_token is null and (o.next_attempt_at is null or o.next_attempt_at<=clock_timestamp())
      and e.deleted_at is null and e.role_context in ('owner','admin','member')
      and e.action=any($1::text[])
    order by o.created_at,o.id limit 100`,[actions])
  assert.ok(eligible.length>=3,'BLOCKED: three genuine pending supported events required')
  const originals:Array<{id:string;created_at:Date}>=[]
  const prioritize=async(row:any)=>{
    originals.push({id:row.id,created_at:row.created_at})
    const updated=await q(`update da_audit_outbox set
      created_at=(select min(created_at) from da_audit_outbox)-interval '10 days'
      where id=$1 and status='pending' and attempt_count=0
        and lease_token is null returning id`,[row.id])
    assert.equal(updated.length,1)
  }
  const state=async(id:string)=>{
    const rows=await q(`select status,attempt_count,lease_token,lease_expires_at,
      source_audit_event_id,
      extract(epoch from (lease_expires_at-clock_timestamp()))::float8 as remaining
      from da_audit_outbox where id=$1`,[id])
    assert.equal(rows.length,1)
    return rows[0]
  }
  const indexCount=async(eventId:string)=>Number((await q(
    'select count(*)::int n from da_audit_index_entry where source_event_id=$1',[eventId]))[0].n)
  const awaitNaturalExpiry=async(id:string)=>{
    const limit=Date.now()+85000
    while(Date.now()<limit){
      const [s]=await q(`select lease_expires_at<=clock_timestamp() as expired
        from da_audit_outbox where id=$1`,[id])
      if(s?.expired===true)return
      await sleep(950)
    }
    throw Error('BLOCKED: real 60s PostgreSQL lease did not expire naturally')
  }
  const nativeClaim=source.claimFoundationAuditOutbox.bind(source)
  const nativeAck=source.acknowledgeFoundationAudit.bind(source)
  const ambiguous=async(row:any,commits:boolean)=>{
    await prioritize(row)
    let claim:any=null
    source.claimFoundationAuditOutbox=async()=>{claim=await nativeClaim();return claim}
    source.acknowledgeFoundationAudit=async(c:any)=>{
      if(commits)assert.equal(await nativeAck(c),true)
      // Test-only lost response; never alter a persisted delivered outbox row.
      throw Error('B22_TEST_ONLY_ACK_REPLY_LOST')
    }
    let outcome:string
    try{outcome=await relayOneFoundationAudit(source,index)}
    finally{
      source.claimFoundationAuditOutbox=nativeClaim
      source.acknowledgeFoundationAudit=nativeAck
    }
    assert.equal(claim?.id,row.id)
    assert.equal(outcome,'ack_unconfirmed')
    const persisted=await state(row.id)
    assert.equal(persisted.attempt_count,1)
    assert.equal(persisted.status,commits?'delivered':'pending')
    assert.equal(await indexCount(row.source_audit_event_id),1)
    if(commits)assert.equal(persisted.lease_token,null)
    else{
      assert.equal(persisted.lease_token,claim.leaseToken)
      assert.ok(persisted.remaining>0&&persisted.remaining<=60)
    }
    return claim
  }
  try{
    // D1: ACK committed, its response lost; read the DB independently.
    const committed=await ambiguous(eligible[0],true)
    assert.equal(await nativeAck(committed),false)
    process.stdout.write('PASS B22 audit real ACK: committed receipt lost, PG16 delivered, exactly one Index record, stale ACK rejected\n')

    // D2/B: Index committed, ACK absent; let the original lease really expire.
    const uncommitted=await ambiguous(eligible[1],false)
    await awaitNaturalExpiry(eligible[1].id)
    assert.equal(await nativeAck(uncommitted),false)
    const retry=await nativeClaim()
    assert.equal(retry?.id,eligible[1].id)
    assert.notEqual(retry.leaseToken,uncommitted.leaseToken)
    assert.equal(retry.attempt,2)
    const record=await source.readClaimedFoundationAudit(retry)
    assert.equal(record.state,'valid')
    assert.equal(await index.inspectFoundationAuditEvent(record.event),'matching')
    assert.equal(await nativeAck(retry),true)
    const settled=await state(eligible[1].id)
    assert.equal(settled.status,'delivered')
    assert.equal(settled.attempt_count,2)
    assert.equal(settled.lease_token,null)
    assert.equal(await indexCount(eligible[1].source_audit_event_id),1)
    process.stdout.write('PASS B22 audit natural lease: DB clock 60s, new token, attempt=2, stale denial, noncommitted ACK recovery and one Index record\n')

    // C: the dedicated child uses real Medusa and claim transaction, then
    // kills itself with SIGKILL. The parent never kills other CI processes.
    await prioritize(eligible[2])
    const killed=spawnSync('node',[require.resolve('@medusajs/cli/cli.js'),'exec',
      './integration-tests/postgres/b22-audit-worker.exec.ts'],{
      cwd:process.cwd(),encoding:'utf8',timeout:100000,maxBuffer:1024*1024,
      env:{...process.env,B22_AUDIT_RECOVERY_CHILD:'claim-crash',
        B22_AUDIT_RECOVERY_TARGET:eligible[2].id,MEDUSA_DISABLE_TELEMETRY:'true'},
    })
    assert.ok(killed.signal==='SIGKILL'||killed.status===137,
      'BLOCKED: dedicated worker did not end with SIGKILL')
    const abandoned=await state(eligible[2].id)
    assert.equal(abandoned.status,'pending')
    assert.equal(abandoned.attempt_count,1)
    assert.ok(typeof abandoned.lease_token==='string'&&abandoned.lease_token.length>10)
    assert.equal(await indexCount(eligible[2].source_audit_event_id),0)
    await awaitNaturalExpiry(eligible[2].id)

    // A/C: native Medusa job loader. No handler, direct batch or direct relay
    // invocation occurs during this interval; only normal cron can deliver.
    const worker=spawn('node',[require.resolve('@medusajs/cli/cli.js'),
      'start','--host','127.0.0.1','--port','19067'],{
      cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
      env:{...process.env,NODE_ENV:'test',MEDUSA_WORKER_MODE:'worker',
        MEDUSA_DISABLE_TELEMETRY:'true',MEDUSA_FF_ANALYTICS:'false',
        SMTP_ENABLED:'false',SMTP_PASSWORD:undefined,REDIS_URL:undefined,
        STOREFRONT_REVALIDATE_URL:undefined,STOREFRONT_REVALIDATE_SECRET:undefined},
    })
    // Never print native logs that might carry credentials or PII.
    let outputBytes=0
    for(const stream of [worker.stdout,worker.stderr])
      stream?.on('data',(chunk:Buffer)=>{outputBytes+=chunk.length})
    try{
      let delivered=false
      const until=Date.now()+115000
      while(Date.now()<until){
        if(worker.exitCode!==null||worker.signalCode!==null)
          throw Error('BLOCKED: native worker exited before one-minute scheduled dispatch')
        const persisted=await state(eligible[2].id)
        if(persisted.status==='delivered'){
          assert.equal(persisted.attempt_count,2)
          assert.equal(persisted.lease_token,null)
          assert.equal(await indexCount(eligible[2].source_audit_event_id),1)
          delivered=true
          break
        }
        await sleep(1000)
      }
      assert.equal(delivered,true,'BLOCKED: native scheduled audit delivery not observed')
      assert.ok(outputBytes<8*1024*1024,'BLOCKED: worker log growth exceeded bound')
    }finally{
      if(worker.exitCode===null&&worker.signalCode===null){
        worker.kill('SIGTERM')
        await Promise.race([once(worker,'exit'),sleep(12000)])
        if(worker.exitCode===null&&worker.signalCode===null){
          worker.kill('SIGKILL')
          await Promise.race([once(worker,'exit'),sleep(5000)])
        }
      }
    }
    process.stdout.write('PASS B22 audit native scheduler and crash restart: true Medusa cron, natural expired PG16 claim, persisted ACK, one Index record\n')
  }finally{
    source.claimFoundationAuditOutbox=nativeClaim
    source.acknowledgeFoundationAudit=nativeAck
    for(const row of originals)
      await q('update da_audit_outbox set created_at=$2 where id=$1',[row.id,row.created_at])
  }
}
