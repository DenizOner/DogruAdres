/** AF-1C: source-only harness; runtime execution requires separate AF-1D approval.
 * From packages/api, ONLY after provisioning the manifest described in the helper:
 * NODE_ENV=test + DATABASE_URL + REDIS_URL + DOGRUADRES_TEST_API_URL +
 * DOGRUADRES_AF1_AUTHORIZATION_FILE, then:
 * node --test integration-tests/http/dogruadres-foundation.atomicity.native.test.mjs
 * No defaults, skip flags, G1 fallback, migrations, container creation or startup.
 * DO NOT import this suite for discovery: node:test may execute its registered
 * callback, which validates authorization and can then connect/initialize fixtures.
 * Only node --check is permitted during source-only checkpoints.
 * Domain evidence is retained ONLY in the disposable target. Temporary SQL probes,
 * barriers, verification fixtures and in-memory credentials are cleaned in finally.
 * A failing SQL marker is required before rollback can be labelled proven.
 * All test scenarios remain NOT TESTED until separately authorized AF-1D execution.
 * Domain BEFORE-write faults below do NOT prove commit-time failure after audit
 * staging. Separate NOT IMPLEMENTED case: install a task-owned DEFERRABLE INITIALLY
 * DEFERRED constraint trigger on a uniquely targeted domain write, mark audit staging
 * with a second probe, force the deferred error at commit, correlate both physical
 * txids, then verify full rollback and clean exact objects. Requires AF-1D review;
 * no deferred test, runtime result, or production hook is introduced here.
 * Future AuditOutbox tests are NOT IMPLEMENTED and cannot be claimed as passed.
 */
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {randomBytes, randomUUID} from 'node:crypto'
import {authorizeRuntime,runtimeProvenance,observer,request,sqlProbe,waitForBlocked,correlateFault,parallelRequests,runIsolatedUserFixture,preserveFailure,settleRequests,literal as L} from '../helpers/isolated-foundation-runtime.mjs'

const claims=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString())
const orgPath=id=>`/dogruadres/organizations/${id}`
const acceptPath='/dogruadres/invitations/accept'
const rows=async(db,sql,values=[]) => (await db.query(sql,values)).rows
const live='deleted_at is null'

// Observer snapshots deliberately include all rows in the NEW disposable DB,
// including first-use Persons/mappings and audit rows. Tests are serial. Dedicated
// AF-1D runtime must have no other writers; global assertions detect contamination.
async function snapshot(db) {
  const result={}
  for(const table of ['da_person','da_actor_mapping','da_organization','da_organization_membership','da_organization_invitation','da_audit_event']) {
    result[table]=await rows(db,`select * from ${table} order by id`)
  }
  return result
}
async function faultRollback(t,db,options,operation) {
  const before=await snapshot(db)
  const probe=await sqlProbe(db,{...options,onInventory:inventory=>t.diagnostic(JSON.stringify({classification:'SQL_PROBE_INVENTORY',...inventory}))})
  await preserveFailure(async()=>{
    const {response,evidence}=await correlateFault(probe,operation)
    assert.ok(evidence.reached && evidence.hits >= (options.hit??1),'INCONCLUSIVE_SQL_NOT_REACHED: HTTP error is not rollback proof')
    assert.equal(response.status,500,'Targeted SQL failure must fail the HTTP mutation')
    assert.deepEqual(await snapshot(db),before,'FAILED: committed partial state after targeted SQL failure')
    // Header/request window + unique target predicate + live API backend attribution
    // correlate this fault. They do not propagate request IDs into SQL or prove
    // exhaustive schedules. Transport failures never enter rollback-success logic.
    t.diagnostic(JSON.stringify({classification:'TARGETED_ROLLBACK_OBSERVED',table:options.table,...evidence}))
  },[()=>probe.cleanup()])
}

test('AF-1 Foundation isolated atomicity and revocation evidence', {timeout:240000}, async t=>{
  const m=authorizeRuntime() // Must finish Docker/target checks before any DB/API request.
  t.diagnostic(JSON.stringify({classification:'AUTHORIZED_RUNTIME_PROVENANCE',...runtimeProvenance(m)}))
  const db=await observer(m)
  const users=[]; const verificationIds=[]
  await preserveFailure(async()=>{
    const health=await request(m,'GET','/health')
    assert.equal(health.status,200)
    const credentials=Array.from({length:4},(_,i)=>({email:`af1-${m.runId}-${i}-${randomUUID()}@example.invalid`,password:randomBytes(32).toString('base64url')}))
    try {
      // Parent validates resources, hashes, expiry, physical DB identity and the
      // reviewed CLI initialization scope before starting any Medusa process.
      t.diagnostic(JSON.stringify({classification:'SYNTHETIC_FIXTURE_PLANNED',runId:m.runId,emails:credentials.map(c=>c.email)}))
      await runIsolatedUserFixture(m,credentials)
      for(const credential of credentials) {
        const login=await request(m,'POST','/auth/user/emailpass',null,credential)
        assert.equal(login.status,200,'Real Medusa login required')
        assert.equal(typeof login.data.token,'string')
        const identity=claims(login.data.token)
        assert.equal(identity.actor_type,'user'); assert.ok(identity.actor_id&&identity.auth_identity_id&&identity.auth_provider)
        const me=await request(m,'GET','/admin/users/me',login.data.token)
        assert.equal(me.status,200); assert.equal(me.data.user.id,identity.actor_id); assert.equal(me.data.user.email,credential.email)
        users.push({...identity,email:credential.email,bearer:login.data.token})
        credential.password=''
      }
    } finally { for(const c of credentials)c.password='' }
    assert.equal(new Set(users.map(u=>u.actor_id)).size,4)
    for(const u of users) {
      const provider=await rows(db,`select entity_id from provider_identity where auth_identity_id=$1 and provider=$2 and ${live}`,[u.auth_identity_id,u.auth_provider])
      assert.equal(provider.length,1); assert.equal(provider[0].entity_id.trim().toLowerCase(),u.email)
      assert.equal((await rows(db,'select id from auth_verification where auth_identity_id=$1',[u.auth_identity_id])).length,0)
      const id=`authver_${randomUUID()}`
      verificationIds.push(id)
      t.diagnostic(JSON.stringify({classification:'VERIFICATION_FIXTURE_INVENTORY',id,actorId:u.actor_id}))
      await db.query(`insert into auth_verification(id,auth_identity_id,entity_id,entity_type,code_provider,verified_at,requested_at,created_at,updated_at) values($1,$2,$3,'email','token',now(),now(),now(),now())`,[id,u.auth_identity_id,provider[0].entity_id])
    }
    const [owner,admin,recipient,fresh]=users
    const actor=u=>({actor_type:'user',actor_id:u.actor_id})
    const person=async u=>{
      const r=await rows(db,`select person_id from da_actor_mapping where actor_type='user' and actor_id=$1 and ${live}`,[u.actor_id])
      assert.equal(r.length,1); return r[0].person_id
    }
    const membership=async(org,u)=>{
      const r=await rows(db,`select * from da_organization_membership where organization_id=$1 and person_id=$2 and ${live}`,[org,await person(u)])
      assert.equal(r.length,1); return r[0]
    }
    const provision=async(initial=[owner])=>{
      const r=await request(m,'POST','/admin/dogruadres/organizations',owner.bearer,{name:`af1-${m.runId}-${randomUUID()}`,initial_owners:initial.map(actor)})
      assert.equal(r.status,201); return r.data.organization.id
    }
    const invite=async(org,u=recipient,role='member',by=owner)=>{
      const r=await request(m,'POST',`${orgPath(org)}/invitations`,by.bearer,{email:u.email,role})
      assert.equal(r.status,201); assert.ok(r.data.invitation.id&&r.data.invitation_token)
      return {id:r.data.invitation.id,token:r.data.invitation_token,role}
    }
    const accept=(inv,u=recipient)=>request(m,'POST',acceptPath,u.bearer,{token:inv.token})
    const change=(org,target,body,by=owner)=>request(m,'POST',`${orgPath(org)}/memberships/${target}`,by.bearer,body)
    const enroll=async(org,u,role='member')=>{
      const inv=await invite(org,u,role)
      try {assert.equal((await accept(inv,u)).status,200)}finally{inv.token=''}
      return membership(org,u)
    }
    const auditOptions=(action,org,by=owner,extra='true')=>({table:'da_audit_event',predicate:`NEW.action=${L(action)} AND NEW.actor_id=${L(by.actor_id)} AND ${org?`NEW.organization_id=${L(org)}`:'true'} AND (${extra})`})

    await t.test('provisioning rollback on first and later Owner-assignment audit INSERT',async t=>{
      // fresh actor has no mapping; failure must roll back its Person too.
      assert.equal((await rows(db,`select id from da_actor_mapping where actor_id=$1 and ${live}`,[fresh.actor_id])).length,0)
      for(const [action,hit] of [['organization.provisioned',1],['organization.owner_assigned',2]]) {
        await faultRollback(t,db,{...auditOptions(action,null),hit},()=>request(m,'POST','/admin/dogruadres/organizations',owner.bearer,{name:`af1-${m.runId}-${randomUUID()}`,initial_owners:[actor(owner),actor(fresh)]}))
      }
    })
    await t.test('membership mutation rolls back on audit INSERT failure',async t=>{
      const org=await provision(), target=await enroll(org,admin,'admin')
      await faultRollback(t,db,auditOptions('organization.membership_changed',org),()=>change(org,target.id,{status:'revoked'}))
    })
    await t.test('invitation creation rolls back on audit INSERT failure',async t=>{
      const org=await provision()
      await faultRollback(t,db,auditOptions('organization.invitation_created',org),()=>request(m,'POST',`${orgPath(org)}/invitations`,owner.bearer,{email:recipient.email,role:'member'}))
    })
    await t.test('invitation revocation rolls back on audit INSERT failure',async t=>{
      const org=await provision(), inv=await invite(org)
      try {await faultRollback(t,db,auditOptions('organization.invitation_revoked',org),()=>request(m,'DELETE',`${orgPath(org)}/invitations/${inv.id}`,owner.bearer))}finally{inv.token=''}
    })
    await t.test('acceptance audit failure rolls back first-use Person/ActorMapping and membership',async t=>{
      const org=await provision(), inv=await invite(org,fresh)
      try {
        assert.equal((await rows(db,`select id from da_actor_mapping where actor_id=$1 and ${live}`,[fresh.actor_id])).length,0)
        await faultRollback(t,db,auditOptions('organization.invitation_accepted',org,fresh),()=>accept(inv,fresh))
        assert.equal((await rows(db,`select id from da_actor_mapping where actor_id=$1 and ${live}`,[fresh.actor_id])).length,0)
        assert.equal((await accept(inv,fresh)).status,200,'Normal acceptance must work after fault cleanup')
      }finally{inv.token=''}
    })
    await t.test('acceptance audit failure preserves revoked membership and pending invitation',async t=>{
      const org=await provision(), target=await enroll(org,recipient)
      assert.equal((await change(org,target.id,{status:'revoked'})).status,200)
      const inv=await invite(org)
      try {
        await faultRollback(t,db,auditOptions('organization.invitation_accepted',org,recipient),()=>accept(inv))
        assert.equal((await membership(org,recipient)).status,'revoked')
        assert.equal((await rows(db,'select status from da_organization_invitation where id=$1',[inv.id]))[0].status,'pending')
        assert.equal((await accept(inv)).status,200)
      }finally{inv.token=''}
    })
    await t.test('domain write failures preserve full pre-operation state for all five paths',async t=>{
      const org=await provision(), target=await enroll(org,admin,'admin'), inv=await invite(org)
      const operations=[
        [{table:'da_organization',predicate:`NEW.name LIKE ${L(`af1-${m.runId}-%`)}`},()=>request(m,'POST','/admin/dogruadres/organizations',owner.bearer,{name:`af1-${m.runId}-${randomUUID()}`,initial_owners:[actor(owner)]})],
        [{table:'da_organization_membership',event:'UPDATE',predicate:`NEW.id=${L(target.id)}`},()=>change(org,target.id,{status:'revoked'})],
        [{table:'da_organization_invitation',predicate:`NEW.organization_id=${L(org)}`},()=>request(m,'POST',`${orgPath(org)}/invitations`,owner.bearer,{email:recipient.email,role:'member'})],
        [{table:'da_organization_invitation',event:'UPDATE',predicate:`NEW.id=${L(inv.id)}`},()=>request(m,'DELETE',`${orgPath(org)}/invitations/${inv.id}`,owner.bearer)],
        [{table:'da_organization_membership',predicate:`NEW.organization_id=${L(org)}`},()=>accept(inv)],
      ]
      try {for(const [options,operation]of operations)await faultRollback(t,db,options,operation)}finally{inv.token=''}
    })

    await t.test('committed administrator revocation denies new invitation and membership mutations',async()=>{
      const org=await provision(), a=await enroll(org,admin,'admin'), target=await enroll(org,recipient)
      const inv=await invite(org,fresh)
      try {
        assert.equal((await change(org,a.id,{status:'revoked'})).status,200)
        const before=await snapshot(db)
        const attempts=[
          await request(m,'POST',`${orgPath(org)}/invitations`,admin.bearer,{email:fresh.email,role:'member'}),
          await request(m,'DELETE',`${orgPath(org)}/invitations/${inv.id}`,admin.bearer),
          await change(org,target.id,{role:'admin'},admin),
        ]
        for(const r of attempts)assert.equal(r.status,403)
        assert.deepEqual(await snapshot(db),before)
      }finally{inv.token=''}
    })

    // Deliberate SQL barriers, not sleeps: pause AFTER mutation authorization at
    // its first domain write. This exposes stale-context schedules, but the exact
    // overlapping-request linearization policy still requires independent review.
    // A 200 here is recorded as an observation, never labelled a proven bypass.
    for(const kind of ['create invitation','revoke invitation','manage membership']) {
      await t.test(`overlap observation: administrator revocation versus ${kind}`,async t=>{
        const org=await provision(), a=await enroll(org,admin,'admin'), target=await enroll(org,recipient)
        const inv=await invite(org,fresh)
        const gate=BigInt('0x'+randomBytes(6).toString('hex')).toString()
        const gateDb=await observer(m)
        let probe,pending,revokePending,locked=false,settled=false
        await preserveFailure(async()=>{
          const gatePid=(await rows(gateDb,'select pg_backend_pid() as pid'))[0].pid
          await gateDb.query('select pg_advisory_lock($1::bigint)',[gate]); locked=true
          const options=kind==='manage membership'?{table:'da_organization_membership',event:'UPDATE',predicate:`NEW.id=${L(target.id)}`}:
            {table:'da_organization_invitation',event:kind==='create invitation'?'INSERT':'UPDATE',predicate:kind==='create invitation'?`NEW.organization_id=${L(org)}`:`NEW.id=${L(inv.id)}`}
          probe=await sqlProbe(db,{...options,fail:false,gate,onInventory:inventory=>t.diagnostic(JSON.stringify({classification:'SQL_BARRIER_INVENTORY',...inventory}))})
          pending=kind==='create invitation'?request(m,'POST',`${orgPath(org)}/invitations`,admin.bearer,{email:fresh.email,role:'admin'}):
            kind==='revoke invitation'?request(m,'DELETE',`${orgPath(org)}/invitations/${inv.id}`,admin.bearer):change(org,target.id,{role:'admin'},admin)
          // Attach rejection handlers immediately; no unhandled in-flight promises.
          const mutationResult=Promise.allSettled([pending])
          const reached=await waitForBlocked(db,probe,gatePid)
          revokePending=change(org,a.id,{status:'revoked'})
          const revocationResult=Promise.allSettled([revokePending])
          if(kind!=='manage membership')assert.equal((await revokePending).status,200)
          // Membership operations share the Organization lock: awaiting revocation
          // before releasing the gate would deadlock the test itself.
          await gateDb.query('select pg_advisory_unlock($1::bigint)',[gate]); locked=false
          const [mr]=await mutationResult, [rr]=await revocationResult
          assert.equal(mr.status,'fulfilled'); assert.equal(rr.status,'fulfilled')
          assert.ok([kind==='create invitation'?201:200,403].includes(mr.value.status)); assert.equal(rr.value.status,200)
          assert.equal((await membership(org,admin)).status,'revoked')
          const succeeded=mr.value.status!==403
          if(kind==='manage membership')assert.equal((await membership(org,recipient)).role,succeeded?'admin':'member')
          else if(kind==='revoke invitation')assert.equal((await rows(db,'select status from da_organization_invitation where id=$1',[inv.id]))[0].status,succeeded?'revoked':'pending')
          else {
            const created=await rows(db,`select id from da_organization_invitation where organization_id=$1 and recipient_email=$2 and role='admin' and ${live}`,[org,fresh.email])
            assert.equal(created.length,succeeded?1:0)
          }
          const action=kind==='create invitation'?'organization.invitation_created':kind==='revoke invitation'?'organization.invitation_revoked':'organization.membership_changed'
          const mutationAudits=await rows(db,'select id from da_audit_event where organization_id=$1 and actor_id=$2 and action=$3',[org,admin.actor_id,action])
          assert.equal(mutationAudits.length,succeeded?1:0,'HTTP result must agree with persisted audit outcome')
          const audits=await rows(db,'select action,module from da_audit_event where organization_id=$1',[org])
          assert.ok(audits.every(e=>e.module==='dogruadres-access'))
          const after=await snapshot(db)
          assert.equal((await request(m,'POST',`${orgPath(org)}/invitations`,admin.bearer,{email:fresh.email,role:'member'})).status,403)
          assert.deepEqual(await snapshot(db),after)
          t.diagnostic(JSON.stringify({classification:'OVERLAP_OBSERVED_NOT_POLICY_APPROVAL',operation:kind,httpStatus:mr.value.status,backendPid:reached.pid,transactionId:reached.txid,linearizationPolicy:'REQUIRES_REVIEW'}))
        },[
          async()=>{if(locked)await gateDb.query('select pg_advisory_unlock($1::bigint)',[gate])},
          async()=>{await settleRequests([pending,revokePending]);settled=true},
          async()=>{if(probe&&settled)await probe.cleanup()},
          ()=>gateDb.end(),
          async()=>{inv.token=''},
        ])
      })
    }
    await t.test('administrator revocation serialized first denies a waiting membership change',async t=>{
      const org=await provision(), a=await enroll(org,admin,'admin'), target=await enroll(org,recipient)
      const gate=BigInt('0x'+randomBytes(6).toString('hex')).toString()
      const gateDb=await observer(m)
      let probe,revoking,changing,locked=false,settled=false
      await preserveFailure(async()=>{
        const pid=(await rows(gateDb,'select pg_backend_pid() as pid'))[0].pid
        await gateDb.query('select pg_advisory_lock($1::bigint)',[gate]); locked=true
        probe=await sqlProbe(db,{table:'da_organization_membership',event:'UPDATE',predicate:`NEW.id=${L(a.id)}`,fail:false,gate,onInventory:inventory=>t.diagnostic(JSON.stringify({classification:'SQL_BARRIER_INVENTORY',...inventory}))})
        revoking=change(org,a.id,{status:'revoked'})
        const revokedResult=Promise.allSettled([revoking])
        const reached=await waitForBlocked(db,probe,pid)
        changing=change(org,target.id,{role:'admin'},admin)
        const changedResult=Promise.allSettled([changing])
        const deadline=Date.now()+4000
        let blocked=false
        while(Date.now()<deadline) {
          const r=await rows(db,'select pid from pg_stat_activity where datname=$1 and application_name=$2 and $3::int=ANY(pg_blocking_pids(pid))',[m.database,m.apiApplicationName,reached.pid])
          if(r.length){blocked=true;break}
          await new Promise(resolve=>setTimeout(resolve,25))
        }
        assert.ok(blocked,'INCONCLUSIVE: competing membership operation did not reach the expected lock wait')
        await gateDb.query('select pg_advisory_unlock($1::bigint)',[gate]);locked=false
        const [revoked]=await revokedResult, [changed]=await changedResult
        assert.equal(revoked.status,'fulfilled'); assert.equal(changed.status,'fulfilled')
        assert.equal(revoked.value.status,200); assert.equal(changed.value.status,403)
        assert.equal((await membership(org,admin)).status,'revoked')
        assert.equal((await membership(org,recipient)).role,'member')
        const audit=await rows(db,"select target_id from da_audit_event where organization_id=$1 and action='organization.membership_changed'",[org])
        assert.deepEqual(audit.map(r=>r.target_id),[a.id])
        t.diagnostic('SERIAL_ORDER_OBSERVED: revocation committed before waiting actor membership re-check')
      },[
        async()=>{if(locked)await gateDb.query('select pg_advisory_unlock($1::bigint)',[gate])},
        async()=>{await settleRequests([revoking,changing]);settled=true},
        async()=>{if(probe&&settled)await probe.cleanup()},
        ()=>gateDb.end(),
      ])
    })
    await t.test('same invitation and different-invitation acceptance races preserve persisted state',async()=>{
      for(const same of [true,false]) {
        const org=await provision(), target=await enroll(org,recipient)
        assert.equal((await change(org,target.id,{status:'revoked'})).status,200)
        const one=await invite(org,recipient,'member'), two=same?one:await invite(org,recipient,'admin')
        try {
          if(!same) {assert.notEqual(one.id,two.id); assert.notEqual(one.token,two.token)}
          const responses=await parallelRequests(m,[()=>accept(one),()=>accept(two)])
          assert.deepEqual(responses.map(r=>r.status).sort(),[200,403])
          const winner=[one,two][responses.findIndex(r=>r.status===200)]
          const persisted=await membership(org,recipient)
          assert.equal(persisted.status,'active'); assert.equal(persisted.role,winner.role)
          const invitations=await rows(db,'select id,status,accepted_by_person_id,accepted_at from da_organization_invitation where id=ANY($1::text[])',[[...new Set([one.id,two.id])]])
          for(const i of invitations) {
            assert.equal(i.status,i.id===winner.id?'accepted':'pending')
            if(i.id===winner.id){assert.equal(i.accepted_by_person_id,persisted.person_id); assert.ok(i.accepted_at)}
          }
          const audit=await rows(db,"select id from da_audit_event where organization_id=$1 and action='organization.invitation_accepted'",[org])
          assert.equal(audit.length,2,'Initial enrollment plus exactly one race acceptance')
        }finally{one.token='';two.token=''}
      }
    })
    await t.test('concurrent protected Owner changes retain one active protected Owner',async()=>{
      const org=await provision([owner,admin]), first=await membership(org,owner), second=await membership(org,admin)
      const responses=await parallelRequests(m,[()=>change(org,first.id,{status:'revoked'},owner),()=>change(org,second.id,{status:'revoked'},admin)])
      assert.deepEqual(responses.map(r=>r.status).sort(),[200,403])
      const remaining=await rows(db,`select id from da_organization_membership where organization_id=$1 and role='owner' and protected_owner=true and status='active' and ${live}`,[org])
      assert.equal(remaining.length,1)
    })
    t.diagnostic('NOT_IMPLEMENTED: deferred commit-time failure after audit staging; local AuditOutbox transaction cases await a separately approved schema/service checkpoint. Overlap observations require policy review; harness exit alone is not atomicity acceptance.')
  },[
    async()=>{
      // Exact task-owned IDs only, registered before INSERT so uncertain insert
      // outcomes are still considered for cleanup. No broad identity deletion.
      const results=await Promise.allSettled(verificationIds.map(id=>db.query('delete from auth_verification where id=$1',[id])))
      assert.ok(results.every(r=>r.status==='fulfilled'),'Verification cleanup incomplete; retain inventory for isolated runtime reconciliation')
    },
    async()=>{for(const u of users)u.bearer=''},
    ()=>db.end(),
  ])
})
