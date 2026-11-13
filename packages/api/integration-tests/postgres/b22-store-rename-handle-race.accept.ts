/** Task-only real HTTPS/PG16 proof: two Stores, distinct proposed names,
 * identical proposed URL. Native Mercur is deliberately not called: this
 * isolates the durable Staff claim collision BEFORE any native side effect.
 */
import assert from "node:assert/strict"
import {randomBytes} from "node:crypto"
import {B06Chrome} from "./b06-ui-browser"

type Rows=(sql:string,args?:unknown[])=>Promise<any[]>
type Store={organizationId:string;organizationName:string;sellerId:string}

export async function verifyTwoStoreSameHandleApprovalRace(input:{
  owner:B06Chrome;staff:B06Chrome;foundation:any;q:Rows;
  stores:[Store,Store];rand:string
}):Promise<void>{
  const {owner,staff,foundation,q,stores,rand}=input
  assert.notEqual(stores[0].sellerId,stores[1].sellerId)
  assert.notEqual(stores[0].organizationId,stores[1].organizationId)
  const handle="b22-handle-race-"+rand.toLowerCase().replace(/[^a-z0-9-]/g,"")
  const requests=stores.map((store,i)=>({
    request_id:"dasrn_"+randomBytes(16).toString("hex"),
    organization_id:store.organizationId,seller_id:store.sellerId,
    name:"B22 Shared URL "+(i===0?"Alpha":"Gamma")+" "+rand,
    handle,risk_acknowledged:true,risk_version:"store-rename-risks-v2"
  }))
  assert.notEqual(requests[0].name,requests[1].name,
    "Shared URL must NOT be protected by same-name locking")
  const before=await Promise.all(stores.map(async store=>{
    const [native]=await q("select id,name,handle,status,approved_at from seller where id=$1",
      [store.sellerId])
    assert.ok(native&&["open","suspended"].includes(native.status)&&native.approved_at)
    const [pending]=await q("select count(*)::int n from da_store_rename_request where seller_id=$1 and status in ('pending_review','approving')",
      [store.sellerId])
    assert.equal(pending.n,0,"Each independent Store must start with no pending rename")
    return native
  }))
  const ownerPost=(body:object)=>owner.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/store-rename-requests',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return {status:r.status}}",JSON.stringify(body))
  // Both Store requests originate from a real logged-in protected Owner in
  // the correct distinct Organization, not direct SQL or a Staff bypass.
  for(let i=0;i<stores.length;i++){
    await owner.send("Page.bringToFront")
    await owner.wait("document.visibilityState==='visible'")
    await owner.select(stores[i].organizationName,"owner")
    assert.equal((await ownerPost(requests[i])).status,201)
    assert.equal((await q("select status from da_store_rename_request where id=$1",
      [requests[i].request_id]))[0].status,"pending_review")
  }
  const prototype=Object.getPrototypeOf(foundation) as any
  const original=prototype.personalWithStoreRenameApprovalStaffLock
  assert.equal(typeof original,"function")
  let suppressedNative=0
  // Only the *post-claim* native phase is withheld inside this disposable
  // real-HTTP test. The real SQL claim, locks and authorization run unchanged.
  // It models interruption, NOT a real SIGKILL or full native rename test.
  const staffPosts=(payloads:object[])=>staff.callFunction(
    "async function(items){const s=await(await fetch('/personal/session')).json();"+
    "return Promise.all(items.map(async item=>{"+
    "const r=await fetch('/personal/platform/store-renames',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:JSON.stringify(item),signal:AbortSignal.timeout(45000)});"+
    "return {status:r.status}}))}",
    requests.map(x=>({action:"approve",request_id:x.request_id,seller_id:x.seller_id})))
  const observedWaiters=async()=>Number((await q(`select count(*)::int n
    from pg_locks where locktype='advisory' and granted=false and objsubid=2
      and classid=hashtext('b22-global-store-handle')::oid
      and objid=hashtext($1)::oid`,[handle]))[0].n)
  let locked=false
  let result:Promise<{status:number}[]>|undefined
  let seenTwo=false
  try{
    await q("select pg_advisory_lock(hashtext('b22-global-store-handle'),hashtext($1))",
      [handle])
    locked=true
    prototype.personalWithStoreRenameApprovalStaffLock=async function(){
      suppressedNative++
      return null
    }
    await staff.send("Page.bringToFront")
    await staff.wait("document.visibilityState==='visible'")
    result=staffPosts(requests)
    // Observe actual PostgreSQL waiters before releasing the barrier.
    // A mere Promise.all is NOT proof that two HTTP requests serialized.
    for(let i=0;i<150;i++){
      if(await observedWaiters()>=2){seenTwo=true;break}
      await new Promise(resolve=>setTimeout(resolve,100))
    }
  }finally{
    if(locked){
      const [x]=await q("select pg_advisory_unlock(hashtext('b22-global-store-handle'),hashtext($1)) released",
        [handle])
      assert.equal(x.released,true,"Task-owned shared-handle barrier released")
    }
  }
  let responses:{status:number}[]=[]
  try{
    if(!result)throw Error("Real Staff requests did not start")
    responses=await result
    assert.equal(seenTwo,true,"Two real Staff HTTPS transactions must wait on ONE URL lock")
    assert.deepEqual(responses.map(x=>x.status).sort((a,b)=>a-b),[409,503],
      "One durable claim, one pre-native conflict; native phase intentionally withheld")
    assert.equal(suppressedNative,1,"Only the winning Staff claim reaches the native stage")
    const rows=await q("select id,seller_id,proposed_name,proposed_handle,status from da_store_rename_request where id in ($1,$2)",
      requests.map(r=>r.request_id))
    assert.equal(rows.length,2)
    assert.deepEqual(rows.map((x:any)=>x.status).sort(),["approving","pending_review"],
      "Same handle cannot be reserved by both Stores concurrently")
    assert.ok(rows.every((r:any)=>r.proposed_handle===handle))
    const decisions=await q(`select count(*)::int n from da_audit_event
      where action='organization.store_rename_approved' and
      new_values->>'request_id' in ($1,$2)`,
      requests.map(r=>r.request_id))
    assert.equal(decisions[0].n,0,"Interrupted pre-native approval creates no decision audit")
    for(let i=0;i<stores.length;i++){
      assert.deepEqual((await q("select id,name,handle,status,approved_at from seller where id=$1",
        [stores[i].sellerId]))[0],before[i],
        "Competing claims must not alter native Seller before Mercur")
    }
  }finally{
    // Restore the actual service implementation before any other task.
    prototype.personalWithStoreRenameApprovalStaffLock=original
    if(result)await result.catch(()=>{})
  }
  // Return the one task-owned simulated interrupted claim to pending, then
  // remove both test requests through the authorized real Owner withdrawal.
  // Do not leave a synthetic persistent claim in later B22 scenarios.
  for(const request of requests){
    await q("update da_store_rename_request set status='pending_review' where id=$1 and status='approving'",
      [request.request_id])
  }
  for(let i=0;i<stores.length;i++){
    await owner.send("Page.bringToFront")
    await owner.wait("document.visibilityState==='visible'")
    await owner.select(stores[i].organizationName,"owner")
    const withdrawal=await ownerPost({
      action:"withdraw",request_id:requests[i].request_id,
      organization_id:requests[i].organization_id,seller_id:requests[i].seller_id
    })
    assert.equal(withdrawal.status,200,"Authorized Owner cleans up only its task-owned request")
  }
  const finalized=await q("select status from da_store_rename_request where id in ($1,$2)",
    requests.map(r=>r.request_id))
  assert.deepEqual(finalized.map((r:any)=>r.status),["withdrawn","withdrawn"])
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: distinct Stores/different names same proposed handle, two observed shared URL lock waiters; one approving claim and one HTTP409, native suppressed on winner, no native Seller/audit change, Owner task requests withdrawn\n")
}
