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
  sellerId:string;q:Rows;suspend:()=>Promise<void>
}):Promise<void>{
  const {owner,reviewer,organizationId,sellerId,q,suspend}=input
  const [company]=await q("select name from da_organization where id=$1 and status='active'",
    [organizationId])
  assert.ok(typeof company?.name==="string"&&company.name.length>0)
  const organizationName=company.name as string
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
  // B -> C is genuinely approved. Simulate >30 elapsed days while keeping
  // both task-owned historic decisions in their actual chronological order.
  // Restore both exact timestamps even when the new acceptance fails.
  const bToC=await submit(c)
  await approve(bToC,c)
  const historic=await q("select id,approved_at::text as stamp from da_store_rename_request where id in ($1,$2) and status='approved'",
    [first[0].id,bToC])
  assert.equal(historic.length,2)
  assert.ok(historic.every((r:any)=>typeof r.stamp==="string"))
  const firstStamp=historic.find((r:any)=>r.id===first[0].id)?.stamp
  const secondStamp=historic.find((r:any)=>r.id===bToC)?.stamp
  assert.ok(firstStamp&&secondStamp)
  let agedFirst=false,agedSecond=false
  try{
    const [earlier]=await q(`update da_store_rename_request
      set approved_at=clock_timestamp()-interval '31 days'
      where id=$1 and status='approved' returning id`,[first[0].id])
    assert.equal(earlier?.id,first[0].id)
    agedFirst=true
    const [later]=await q(`update da_store_rename_request
      set approved_at=clock_timestamp()-interval '30 days 1 second'
      where id=$1 and status='approved' returning id`,[bToC])
    assert.equal(later?.id,bToC)
    agedSecond=true
    const [latestProof]=await q(`select (approved_at>(
      select approved_at from da_store_rename_request where id=$2)) as newer
      from da_store_rename_request where id=$1`,[bToC,first[0].id])
    assert.equal(latestProof.newer,true,
      "Simulated day-30 B->C must remain newer than the original A->B")
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
    // The real native Store has two lawful B approvals. A later forged
    // approval must not borrow the earlier B record to authorize reopening.
    await suspend()
    const [suspended]=await q(
      "select id,name,handle,status,approved_at from seller where id=$1",[sellerId])
    assert.deepEqual(suspended,{...nativeBefore,name:originalB.name,
      handle:originalB.handle,status:"suspended"},
      "Native suspension must preserve identity, name and URL")
    const applications=await q(
      "select id from da_store_application where seller_id=$1 and status='created'",
      [sellerId])
    assert.equal(applications.length,1)
    const reopenTarget={action:"unsuspend",application_id:applications[0].id,seller_id:sellerId}
    const reopen=async(actor:B06Chrome)=>actor.callFunction(
      "async function(json){const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/platform/stores',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:json});return {status:r.status,body:await r.json()}}",
      JSON.stringify(reopenTarget))
    const proofCount=async()=>Number((await q(
      "select count(*)::int n from da_audit_event where target_id=$1 "+
      "and organization_id=$2 and action in "+
      "('organization.store_reactivation_claimed','organization.store_reactivated')",
      [sellerId,organizationId]))[0].n)
    const auditBefore=await proofCount()
    await owner.send("Page.bringToFront")
    await owner.wait("document.visibilityState==='visible'")
    assert.equal((await reopen(owner)).status,403,
      "Business Owner must not gain the platform Store reopen privilege")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    assert.equal((await q("update da_store_rename_request set proposed_handle=$1 "+
      "where id=$2 and status='approved' returning id",
      ["b22-forged-reopening-handle",cToB])).length,1)
    try{
      assert.equal((await reopen(reviewer)).status,409,
        "An unproven latest handle must prevent any native reopening")
      const blocked=await reviewer.callFunction(
        "async function(id){const r=await fetch('/personal/platform/stores?page=0');"+
        "const b=await r.json();return {status:r.status,"+
        "row:b.suspended?.find(x=>x.seller_id===id)}}",sellerId)
      assert.equal(blocked.status,200)
      assert.equal(blocked.row?.name_review_required,true,
        "Staff must see review-only status for an invalid latest approval")
      assert.deepEqual((await q(
        "select id,name,handle,status,approved_at from seller where id=$1",
        [sellerId]))[0],suspended,"Denied reopening must leave Seller unchanged")
      assert.equal(await proofCount(),auditBefore,
        "Rejected proof cannot create a reactivation claim or completion")
    }finally{
      assert.equal((await q("update da_store_rename_request set proposed_handle=$1 "+
        "where id=$2 and status='approved' returning id",
        [originalB.handle,cToB])).length,1,
        "Restore the task-owned latest approval without deleting history")
    }
    const available=await reviewer.callFunction(
      "async function(id){const r=await fetch('/personal/platform/stores?page=0');"+
      "const b=await r.json();return {status:r.status,"+
      "row:b.suspended?.find(x=>x.seller_id===id)}}",sellerId)
    assert.equal(available.status,200)
    assert.equal(available.row?.name_review_required,false,
      "Last source-proven B approval must restore reopen eligibility")
    const opened=await reopen(reviewer)
    assert.equal(opened.status,200,
      "Two lawful B approvals must permit one real native Mercur unsuspend")
    assert.equal(opened.body?.status,"open")
    assert.deepEqual((await q(
      "select id,name,handle,status,approved_at from seller where id=$1",
      [sellerId]))[0],{...nativeBefore,name:originalB.name,handle:originalB.handle},
      "Reopened Seller must retain same ID, latest B name/URL and approved_at")
    assert.equal(await proofCount(),auditBefore+2,
      "One native reopen must create one claim and one completion")
    const recorded=await q(
      "select e.action,x.id outbox_id from da_audit_event e "+
      "join da_audit_outbox x on x.source_audit_event_id=e.id "+
      "and x.source_module='dogruadres-access' and x.deleted_at is null "+
      "where e.target_id=$1 and e.organization_id=$2 "+
      "and e.action in ('organization.store_reactivation_claimed',"+
      "'organization.store_reactivated') and e.deleted_at is null "+
      "order by e.occurred_at desc,e.id desc limit 2",
      [sellerId,organizationId])
    assert.equal(recorded.length,2)
    assert.ok(recorded.every((r:any)=>r.outbox_id),
      "Each new native reopening phase must have durable source outbox")
    assert.equal((await reopen(reviewer)).status,409,
      "Replaying a completed reopening must not rerun native Mercur")
    assert.equal(await proofCount(),auditBefore+2)
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: repeated B name with two lawful approvals reopens same native Seller once using newest proven name+URL; forged newest handle returns 409 and no reactivation audit; Owner denied, Staff HTTP200, replay409\n")
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
    // Restore both existing historical decisions independently; no test may
    // leave a reordered synthetic approved_at in the disposable database.
    if(agedSecond){
      const [restored]=await q(`update da_store_rename_request
        set approved_at=$2::timestamptz
        where id=$1 and status='approved' returning approved_at::text as stamp`,
        [bToC,secondStamp])
      assert.equal(restored?.stamp,secondStamp,
        "B->C timestamp must be restored with exact PostgreSQL precision")
    }
    if(agedFirst){
      const [restored]=await q(`update da_store_rename_request
        set approved_at=$2::timestamptz
        where id=$1 and status='approved' returning approved_at::text as stamp`,
        [first[0].id,firstStamp])
      assert.equal(restored?.stamp,firstStamp,
        "A->B timestamp must be restored with exact PostgreSQL precision")
    }
  }
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: real A-B-C-B-D native Seller rename history, two lawful B approvals, latest name+URL provenance, forged newest handle HTTP409, final Staff HTTP200, unique audits/outbox and Owner private readback; historical timestamp restored\n")
}
