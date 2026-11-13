/** Real Owner/Staff HTTPS + disposable PostgreSQL 16 acceptance for the
 * #289 P2 A->B->C->B->D name-history bug. Native Mercur is NOT mocked.
 * Only the 30-day passage on one task-owned previous decision is simulated.
 */
import assert from "node:assert/strict"
import {randomBytes} from "node:crypto"
import {B06Chrome} from "./b06-ui-browser"

type Rows=(sql:string,params?:unknown[])=>Promise<any[]>

export async function verifyRepeatedApprovedStoreRenameHistory(input:{
  owner:B06Chrome;reviewer:B06Chrome;organizationId:string;
  organizationName:string;sellerId:string;q:Rows
}):Promise<void>{
  const {owner,reviewer,organizationId,organizationName,sellerId,q}=input
  const [nativeBefore]=await q("select id,name,handle,status,approved_at from seller where id=$1",
    [sellerId])
  assert.ok(nativeBefore?.id===sellerId&&nativeBefore.status==="open"&&nativeBefore.approved_at)
  // The preceding B22 test has already performed a genuine A->B approval.
  const originalB={name:nativeBefore.name as string,handle:nativeBefore.handle as string}
  const first=await q(`select id,status,approved_at from da_store_rename_request
    where seller_id=$1 and status='approved' and proposed_name=$2
      and proposed_handle=$3 order by approved_at desc`,
    [sellerId,originalB.name,originalB.handle])
  assert.equal(first.length,1,"One real initial A->B approved history row")
  assert.ok(first[0].approved_at)
  const suffix=randomBytes(6).toString("hex")
  const c={name:"B22 Return C "+suffix,handle:"b22-return-c-"+suffix}
  const d={name:"B22 Return D "+suffix,handle:"b22-return-d-"+suffix}
  const ownerPost=async(payload:object)=>owner.callFunction(
    "async function(json){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/store-rename-requests',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:json});return {status:r.status,body:await r.json()}}",
    JSON.stringify(payload))
  const staffPost=async(requestId:string)=>reviewer.callFunction(
    "async function(json){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/platform/store-renames',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:json});return {status:r.status,body:await r.json()}}",
    JSON.stringify({action:"approve",request_id:requestId,seller_id:sellerId}))
  const submit=async(next:{name:string;handle:string})=>{
    await owner.send("Page.bringToFront")
    await owner.wait("document.visibilityState==='visible'")
    await owner.select(organizationName,"owner")
    const requestId="dasrn_"+randomBytes(16).toString("hex")
    const saved=await ownerPost({
      request_id:requestId,organization_id:organizationId,seller_id:sellerId,
      name:next.name,handle:next.handle,risk_acknowledged:true,
      risk_version:"store-rename-risks-v2"
    })
    assert.equal(saved.status,201,"Protected Owner must submit one new name+URL")
    const [pending]=await q("select status from da_store_rename_request where id=$1",
      [requestId])
    assert.equal(pending?.status,"pending_review")
    return requestId
  }
  const approve=async(requestId:string,next:{name:string;handle:string})=>{
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const reply=await staffPost(requestId)
    assert.equal(reply.status,200,"Real protected Staff HTTPS approval must complete")
    const [after]=await q("select id,name,handle,status,approved_at from seller where id=$1",
      [sellerId])
    assert.deepEqual(after,{...nativeBefore,name:next.name,handle:next.handle},
      "Native Mercur must preserve Seller ID, status and approved_at")
    const audit=await q(`select e.id,x.id outbox_id from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
        and x.source_module='dogruadres-access' and x.deleted_at is null
      where e.action='organization.store_rename_approved'
        and e.organization_id=$1 and e.target_id=$2
        and e.new_values->>'request_id'=$3 and e.deleted_at is null`,
      [organizationId,sellerId,requestId])
    assert.equal(audit.length,1,"Each native approval has one canonical audit/outbox")
    const [completed]=await q("select status,approved_at from da_store_rename_request where id=$1",
      [requestId])
    assert.equal(completed?.status,"approved")
    assert.ok(completed.approved_at)
    return completed
  }
  // B -> C is a genuinely approved native rename; after 30 days the Store
  // may reclaim B. Only this isolated historical timestamp is advanced.
  const bToC=await submit(c)
  const bToCApproved=await approve(bToC,c)
  let aged=false
  try{
    const [changed]=await q(`update da_store_rename_request
      set approved_at=clock_timestamp()-interval '30 days 1 second'
      where id=$1 and status='approved' returning id`,[bToC])
    assert.equal(changed?.id,bToC)
    aged=true
    // C -> B is a second real approval of the original B name+URL.
    const cToB=await submit(originalB)
    await approve(cToB,originalB)
    const repeat=await q(`select id,approved_at from da_store_rename_request
      where seller_id=$1 and status='approved'
        and proposed_name=$2 and proposed_handle=$3
      order by approved_at desc,id desc`,
      [sellerId,originalB.name,originalB.handle])
    assert.equal(repeat.length,2,"Two historical B approvals are normal, not a conflict")
    assert.equal(repeat[0].id,cToB,"Latest approved B must be canonical")
    // B -> D must not reject merely because BOTH A->B and C->B are retained.
    const bToD=await submit(d)
    const [beforeRejected]=await q("select status from da_store_rename_request where id=$1",
      [bToD])
    assert.equal(beforeRejected.status,"pending_review")
    // Negative: the newest history record must still match the real native
    // old name+handle. A forged URL cannot borrow an older A->B approval.
    assert.equal((await q(`update da_store_rename_request
      set proposed_handle=$1 where id=$2 and status='approved' returning id`,
      ["b22-forged-last-handle",cToB])).length,1)
    try{
      const forged=await staffPost(bToD)
      assert.equal(forged.status,409,"Stale/mismatched newest name right must fail closed")
      assert.equal((await q("select status from da_store_rename_request where id=$1",
        [bToD]))[0].status,"pending_review","Rejected decision must preserve request")
      assert.equal((await q(`select count(*)::int n from da_audit_event
        where action='organization.store_rename_approved'
          and new_values->>'request_id'=$1`,[bToD]))[0].n,0)
      assert.equal((await q("select name,handle from seller where id=$1",
        [sellerId]))[0].handle,originalB.handle,
        "Invalid history must never launch native Mercur")
    }finally{
      assert.equal((await q(`update da_store_rename_request
        set proposed_handle=$1 where id=$2 and status='approved' returning id`,
        [originalB.handle,cToB])).length,1,
        "Task-only previous approved handle must be restored")
    }
    await approve(bToD,d)
    const approved=await q(`select id,approved_at,status from da_store_rename_request
      where seller_id=$1 and status='approved' and approved_at is not null`,
      [sellerId])
    assert.ok(approved.some((r:any)=>r.id===first[0].id))
    assert.ok(approved.some((r:any)=>r.id===cToB))
    assert.ok(approved.some((r:any)=>r.id===bToD))
    // New and old historical approvals must coexist; no history deletion.
    const view=await owner.callFunction(
      "async function(org,seller){const r=await fetch('/personal/store-rename-requests?'+"+
      "new URLSearchParams({organization_id:org,seller_id:seller}));"+
      "return {status:r.status,body:await r.json()}}",organizationId,sellerId)
    assert.equal(view.status,200,"Only live protected Owner reads private rename history")
    assert.ok(view.body?.requests?.some((r:any)=>r.id===bToD&&r.status==="approved"))
  }finally{
    if(aged){
      assert.equal((await q(`update da_store_rename_request set approved_at=$2
        where id=$1 and status='approved' returning id`,
        [bToC,bToCApproved.approved_at])).length,1,
        "Task-only 30-day time simulation must restore original precision")
    }
  }
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: real A-B-C-B-D native Seller rename history, two lawful B approvals, latest name+URL provenance, forged newest handle HTTP409, final Staff HTTP200, unique audits/outbox and Owner private readback; historical timestamp restored\n")
}
