/** Task-only protected HTTP + disposable PG16 acceptance.
 * An unresolved native Store reopening must freeze BOTH a previously submitted
 * Staff rename approval and any new Owner rename until Staff reconciliation.
 * No native workflow is mocked or retried here.
 */
import assert from "node:assert/strict"
import {randomBytes} from "node:crypto"
import {B06Chrome} from "./b06-ui-browser"

type Query=(sql:string,args?:any[])=>Promise<any[]>
type Rename={request_id:string;organization_id:string;seller_id:string;
  name:string;handle:string;risk_acknowledged:true;risk_version:"store-rename-risks-v2"}

const ownerPost=(owner:B06Chrome,payload:object)=>owner.callFunction(
  "async function(body){const session=await(await fetch('/personal/session')).json();"+
  "const r=await fetch('/personal/store-rename-requests',{method:'POST',"+
  "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
  "body});return {status:r.status,body:await r.json()}}",JSON.stringify(payload))

/** Set up a genuine Owner-requested pending rename BEFORE the second
 * suspended Store reopening; no native Seller is changed by the request.
 */
export async function prepareRenameBeforeStoreReactivation(input:{
  owner:B06Chrome;organizationId:string;sellerId:string;q:Query
}):Promise<Rename>{
  const {owner,organizationId,sellerId,q}=input
  const before=(await q("select name,handle,status,approved_at from seller where id=$1",
    [sellerId]))[0]
  assert.equal(before?.status,"open")
  assert.ok(before.approved_at)
  const suffix=randomBytes(6).toString("hex")
  const payload:Rename={
    request_id:"dasrn_"+randomBytes(16).toString("hex"),
    organization_id:organizationId,seller_id:sellerId,
    name:"B22 Reopening Rename Guard "+suffix,
    handle:"b22-reopening-guard-"+suffix,
    risk_acknowledged:true,risk_version:"store-rename-risks-v2"
  }
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  assert.equal((await ownerPost(owner,payload)).status,201,
    "Authorized Owner must create a pending request before any reopening claim")
  const [row]=await q(`select status,old_name,old_handle from da_store_rename_request
    where id=$1 and organization_id=$2 and seller_id=$3`,
    [payload.request_id,organizationId,sellerId])
  assert.equal(row?.status,"pending_review")
  assert.equal(row?.old_name,before.name)
  assert.equal(row?.old_handle,before.handle)
  assert.deepEqual((await q(
    "select name,handle,status,approved_at from seller where id=$1",[sellerId]))[0],
    before,"Owner request itself must not mutate native Seller")
  return payload
}

/** Call only AFTER native unsuspend has opened the Seller but the separate
 * completion audit/outbox has failed, leaving its durable claim unresolved.
 * One pre-existing pending rename must not run; after withdrawing it, a
 * brand-new Owner rename must still be blocked solely by the reopening claim.
 */
export async function verifyReactivationClaimFreezesRenames(input:{
  owner:B06Chrome;staff:B06Chrome;q:Query;request:Rename
}):Promise<void>{
  const {owner,staff,q,request}=input
  const before=(await q("select id,name,handle,status,approved_at from seller where id=$1",
    [request.seller_id]))[0]
  assert.equal(before?.status,"open")
  assert.ok(before.approved_at)
  const claims=await q(`select c.id from da_audit_event c
    where c.target_id=$1 and c.organization_id=$2
      and c.action='organization.store_reactivation_claimed'
      and c.module='dogruadres-access' and c.deleted_at is null
      and not exists(select 1 from da_audit_event done
        where done.new_values->>'claim_audit_id'=c.id
          and done.target_id=c.target_id
          and done.action in ('organization.store_reactivated',
            'organization.store_reactivation_released')
          and done.deleted_at is null)`,
    [request.seller_id,request.organization_id])
  assert.equal(claims.length,1,"Exactly one committed, unclosed Store reactivation claim")
  const counts=async()=>Object.fromEntries((await q(`select action,count(*)::int n
    from da_audit_event where target_id=$1 and organization_id=$2
      and action in ('organization.store_rename_requested',
        'organization.store_rename_approved')
    group by action`,[request.seller_id,request.organization_id]))
    .map((r:any)=>[r.action,Number(r.n)]))
  const baseline=await counts()
  await staff.send("Page.bringToFront")
  await staff.wait("document.visibilityState==='visible'")
  const staffDecision=await staff.callFunction(
    "async function(body){const session=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/platform/store-renames',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
    "body});return r.status}",
    JSON.stringify({action:"approve",request_id:request.request_id,seller_id:request.seller_id}))
  assert.equal(staffDecision,409,"Unresolved reopening blocks an earlier pending Staff rename")
  assert.equal((await q("select status from da_store_rename_request where id=$1",
    [request.request_id]))[0]?.status,"pending_review")
  assert.deepEqual(await counts(),baseline,
    "Rejected Staff approval cannot append an approval audit")
  assert.deepEqual((await q(
    "select id,name,handle,status,approved_at from seller where id=$1",
    [request.seller_id]))[0],before,"Failed Staff approval cannot rename Seller")
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  const withdrawn=await ownerPost(owner,{action:"withdraw",
    request_id:request.request_id,organization_id:request.organization_id,
    seller_id:request.seller_id})
  assert.equal(withdrawn.status,200,
    "Authorized Owner may safely withdraw an unclaimed pending rename")
  assert.equal((await q("select status from da_store_rename_request where id=$1",
    [request.request_id]))[0]?.status,"withdrawn")
  const afterWithdrawal=await counts()
  const next={...request,request_id:"dasrn_"+randomBytes(16).toString("hex")}
  assert.equal((await ownerPost(owner,next)).status,409,
    "Owner's NEW rename must fail even with zero pending rename requests")
  assert.equal((await q("select count(*)::int n from da_store_rename_request where id=$1",
    [next.request_id]))[0].n,0,
    "Blocked request cannot leave a new pending row")
  assert.deepEqual(await counts(),afterWithdrawal,
    "Blocked Owner request cannot leave a new requested or approved audit")
  assert.deepEqual((await q(
    "select id,name,handle,status,approved_at from seller where id=$1",
    [request.seller_id]))[0],before)
  process.stdout.write(
    "PASS B22 Chrome/HTTPS/PG16: unresolved post-native Store reactivation claim blocks prior Staff rename HTTP409 and new Owner rename HTTP409; Owner withdraws old request, no extra rename audit or native Seller change, later reconciliation remains available\n")
}
