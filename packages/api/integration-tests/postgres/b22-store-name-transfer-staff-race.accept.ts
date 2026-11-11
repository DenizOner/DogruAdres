/** Task-only two-Staff concurrency proof over real HTTPS/PG16. No production writes. */
import assert from "node:assert/strict"
import {randomBytes} from "node:crypto"
import {B06Chrome} from "./b06-ui-browser"

type Rows=(sql:string,params?:unknown[])=>Promise<any[]>
type Target={application_id:string;seller_id:string;organization_id:string}

export async function verifyTwoIndependentStaffNameRightRace(input:{
  owner:B06Chrome;reviewer:B06Chrome;reviewerPersonId:string;
  origin:string;ca:string;rand:string;organizationName:string;
  organizationId:string;target:Target;
  users:any;auth:any;foundation:any;
  browsers:B06Chrome[];q:Rows;
  suspend:(sellerId:string)=>Promise<void>
}):Promise<void>{
  const {owner,reviewer,reviewerPersonId,origin,ca,rand,organizationName,
    organizationId,target,users,auth,foundation,browsers,q,suspend}=input
  const name="B22 independently decided Store "+rand
  const application_id="daapp_"+randomBytes(16).toString("hex")
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  await owner.select(organizationName,"owner")
  const submitted=await owner.callFunction(
    "async function(body){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/store-applications',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body});return {status:r.status,body:await r.json()}}",
    JSON.stringify({organization_id:organizationId,application_id,name,
      email:"b22-staff-race-store-"+rand+"@example.invalid",currency_code:"try"}))
  assert.equal(submitted.status,201,"Source must originate in real Owner HTTPS")
  const sourceSeller=String(submitted.body?.seller_id??"")
  assert.match(sourceSeller,/^sel_[A-Za-z0-9_-]+$/)
  await reviewer.send("Page.bringToFront")
  const approved=await reviewer.callFunction(
    "async function(body){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/platform/stores',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body});return {status:r.status,body:await r.json()}}",
    JSON.stringify({application_id,seller_id:sourceSeller}))
  assert.equal(approved.status,200)
  assert.equal(approved.body?.status,"open")
  await suspend(sourceSeller)
  const [nativeBefore]=await q(
    "select id,name,handle,status,approved_at from seller where id=$1",
    [sourceSeller])
  const [targetBefore]=await q(
    "select id,name,handle,status,approved_at from seller where id=$1",
    [target.seller_id])
  assert.equal(nativeBefore?.status,"suspended")
  assert.ok(nativeBefore.approved_at)
  assert.equal(nativeBefore.name,name)
  assert.equal(targetBefore?.status,"open")
  assert.ok(targetBefore.approved_at)
  assert.notEqual(target.organization_id,organizationId)
  assert.equal((await q("select count(*)::int n from da_store_name_transfer where source_seller_id=$1",
    [sourceSeller]))[0].n,0)
  // A third native User and Person, not a second cookie for reviewer B.
  // Platform Staff is explicitly scoped; no Organization Owner/Member role.
  const email="b22-independent-staff-"+rand+"@example.invalid"
  const password="Task-Strong-"+randomBytes(25).toString("hex")
  const user=await users.createUsers({email})
  const registration=await auth.register("emailpass",{body:{email,password}})
  assert.ok(registration.success&&registration.authIdentity?.id)
  await auth.updateAuthIdentities({id:registration.authIdentity.id,
    app_metadata:{user_id:user.id}})
  const [person]=await foundation.createPeople([{}])
  assert.ok(person?.id&&person.id!==reviewerPersonId)
  await foundation.createActorMappings([{actor_type:"user",actor_id:user.id,
    person_id:person.id,created_by_actor_type:"user",created_by_actor_id:user.id}])
  await q("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,clock_timestamp())",
    [registration.authIdentity.id,person.id,user.id])
  assert.equal((await q("select count(*)::int n from da_organization_membership where person_id=$1",
    [person.id]))[0].n,0,"Second Staff must not inherit Organization access")
  const granted=await q("insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason) values($1,$2,'store.approve','platform',$3,$4) returning id",
    ["da_staff_race_"+rand,person.id,reviewerPersonId,
      "Synthetic isolated two-Staff name-right race"])
  assert.equal(granted.length,1)
  const other=new B06Chrome(origin,"B")
  browsers.push(other)
  await other.start(ca)
  await other.login(email,password,person.id)
  const tokenA=await reviewer.token(),tokenB=await other.token()
  assert.ok(tokenA&&tokenB&&tokenA!==tokenB,
    "Two distinct real strong Chrome cookies are required")
  const values={source_application_id:application_id,
    source_seller_id:sourceSeller,
    target_application_id:target.application_id,
    target_seller_id:target.seller_id}
  const preview=async(b:B06Chrome)=>b.callFunction(
    "async function(payload){const r=await fetch('/personal/platform/store-name-transfers?'+"+
    "new URLSearchParams(JSON.parse(payload)),{cache:'no-store'});return r.status}",
    JSON.stringify(values))
  assert.equal(await preview(reviewer),200)
  assert.equal(await preview(other),200)
  const payload=(id:string)=>({...values,transfer_id:id,
    expected_name:nativeBefore.name,expected_handle:nativeBefore.handle,
    reason:"Verified simultaneous independent platform Staff decision"})
  const a=payload("dastr_"+randomBytes(16).toString("hex"))
  const b=payload("dastr_"+randomBytes(16).toString("hex"))
  const post=(staff:B06Chrome,body:object)=>staff.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/platform/store-name-transfers',"+
    "{method:'POST',headers:{'content-type':'application/json',"+
    "'x-csrf-token':s.csrf_token},body:payload});return {status:r.status}}",
    JSON.stringify(body))
  // Hold the SAME PostgreSQL advisory key used by production service.
  // Observe TWO blocked native HTTPS transactions (not sequential replies),
  // then release the test connection's session lock in finally.
  const first=[sourceSeller,target.seller_id].sort()[0]
  await q("select pg_advisory_lock(hashtext('b22-store-rename'),hashtext($1))",
    [first])
  let joined:Promise<PromiseSettledResult<{status:number}>[]>
  let sawTwo=false
  try{
    joined=Promise.allSettled([post(reviewer,a),post(other,b)])
    for(let i=0;i<120;i++){
      const [lockWaiters]=await q(`select count(*)::int n from pg_locks
        where locktype='advisory' and granted=false
          and classid=hashtext('b22-store-rename')::oid
          and objid=hashtext($1)::oid`,[first])
      if(lockWaiters.n>=2){sawTwo=true;break}
      await new Promise(resolve=>setTimeout(resolve,100))
    }
  }finally{
    const [unlock]=await q("select pg_advisory_unlock(hashtext('b22-store-rename'),hashtext($1)) as released",
      [first])
    assert.equal(unlock?.released,true,"Task-only advisory lock must be released")
  }
  const settled=await joined!
  assert.equal(sawTwo,true,
    "Both independent real Staff HTTPS transactions must overlap on the same PG16 lock")
  assert.ok(settled.every(x=>x.status==="fulfilled"),
    "Both real Staff HTTPS responses must complete")
  const codes=settled.map(x=>x.status==="fulfilled"?x.value.status:null).sort()
  assert.deepEqual(codes,[201,409],
    "One first Staff 201, other Staff 409; no ambiguous second commit")
  const winner=settled[0].status==="fulfilled"&&settled[0].value.status===201?a:b
  const winnerPerson=winner===a?reviewerPersonId:person.id
  const [saved]=await q(`select id,source_seller_id,target_seller_id,
      decided_by_person_id,source_audit_event_id,status from da_store_name_transfer
      where source_seller_id=$1`,[sourceSeller])
  assert.equal((await q("select count(*)::int n from da_store_name_transfer where source_seller_id=$1",
    [sourceSeller]))[0].n,1)
  assert.equal(saved?.id,winner.transfer_id)
  assert.equal(saved.source_seller_id,sourceSeller)
  assert.equal(saved.target_seller_id,target.seller_id)
  assert.equal(saved.decided_by_person_id,winnerPerson)
  assert.equal(saved.status,"assigned")
  const events=await q(`select e.id,e.actor_person_id,
      e.new_values->>'transfer_id' transfer_id,x.id outbox_id
    from da_audit_event e
    join da_audit_outbox x on x.source_audit_event_id=e.id
      and x.source_module='dogruadres-access' and x.deleted_at is null
    where e.action='organization.store_name_right_assigned'
      and e.module='dogruadres-access' and e.resource='store-name-transfer'
      and e.target_id=$1 and e.deleted_at is null`,[sourceSeller])
  assert.equal(events.length,1,"Exactly one durable audit and outbox")
  assert.equal(events[0].id,saved.source_audit_event_id)
  assert.equal(events[0].actor_person_id,winnerPerson)
  assert.equal(events[0].transfer_id,winner.transfer_id)
  const winnerBrowser=winner===a?reviewer:other
  assert.equal((await post(winnerBrowser,winner)).status,200,
    "Same decision replay returns 200 without duplicate audit")
  const loser=winner===a?b:a
  assert.equal((await post(winner===a?other:reviewer,loser)).status,409)
  assert.equal((await q("select count(*)::int n from da_store_name_transfer where source_seller_id=$1",
    [sourceSeller]))[0].n,1)
  assert.equal((await q(`select count(*)::int n from da_audit_event
    where action='organization.store_name_right_assigned' and target_id=$1`,
    [sourceSeller]))[0].n,1)
  assert.deepEqual((await q(
    "select id,name,handle,status,approved_at from seller where id=$1",
    [sourceSeller]))[0],nativeBefore,"Source native Store must remain suspended and identical")
  assert.deepEqual((await q(
    "select id,name,handle,status,approved_at from seller where id=$1",
    [target.seller_id]))[0],targetBefore,
    "Recipient native Store must not change on a RIGHT assignment")
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: two independent strong Staff Persons race same first Store name-right transfer on observed PG advisory lock; HTTP201+409, one transfer/audit/outbox, replay200, both native Seller IDs unchanged\n")
}
