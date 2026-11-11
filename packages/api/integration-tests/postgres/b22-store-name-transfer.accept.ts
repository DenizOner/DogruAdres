/** Task-only real HTTPS/Chrome/PG16 acceptance: no real commercial accounts. */
import assert from "node:assert/strict"
import {randomBytes} from "node:crypto"
import {B06Chrome} from "./b06-ui-browser"
type Rows=(sql:string,params?:any[])=>Promise<any[]>
type Store={application_id:string;seller_id:string;organization_id:string}
/** Exact pre-existing Medusa Cart/Offer ownership snapshot for B22 name right
 * assignment. Uses installed Mercur/Medusa native query graph, not a second
 * Cart model. A source Seller must have a real persisted offer in this Cart.
 * The fixture intentionally has NO historical Order: do not claim Order
 * retention acceptance from an empty OrderGroup / order_cart snapshot.
 */
export async function snapshotB22TransferredStoreCart(input:{
  q:Rows;query:any;cartId:string;sourceSellerId:string;
  organizationId:string;customerId:string
}):Promise<unknown>{
  const {q,query,cartId,sourceSellerId,organizationId,customerId}=input
  const [native]=await q(`select id,customer_id,completed_at
    from cart where id=$1`,[cartId])
  assert.equal(native?.id,cartId,"Pre-existing native Cart must exist")
  assert.equal(native.customer_id,customerId)
  assert.equal(native.completed_at,null,"Historical fixture remains uncompleted")
  const {data:carts}=await query.graph({entity:"cart",fields:[
    "id","customer.id","completed_at","items.id",
    "items.offer.id","items.offer.seller_id"
  ],filters:{id:cartId}})
  assert.equal(carts.length,1)
  assert.equal(carts[0].id,cartId)
  assert.equal(carts[0].customer?.id,customerId)
  const items=(carts[0].items??[]).map((line:any)=>({
    line_id:String(line.id),
    offer_id:String(line.offer?.id??""),
    seller_id:String(line.offer?.seller_id??"")
  })).sort((x:any,y:any)=>x.line_id.localeCompare(y.line_id))
  assert.equal(items.length,2,"Existing two-Seller native Cart required")
  assert.equal(new Set(items.map((x:any)=>x.line_id)).size,2)
  assert.ok(items.some((x:any)=>x.seller_id===sourceSellerId),
    "Source Store must have an actual native Cart item before assignment")
  assert.ok(items.every((x:any)=>x.offer_id&&x.seller_id))
  const attribution=await q(`select cart_id,organization_id,customer_id,
    person_id,source_audit_event_id from da_buyer_cart_attribution
    where cart_id=$1`,[cartId])
  assert.equal(attribution.length,1)
  assert.equal(attribution[0].organization_id,organizationId)
  assert.equal(attribution[0].customer_id,customerId)
  assert.ok(attribution[0].source_audit_event_id)
  const groups=await q(`select id from order_group where cart_id=$1 order by id`,
    [cartId])
  const {data:orderLinks}=await query.graph({entity:"order_cart",
    fields:["order_id"],filters:{cart_id:cartId}})
  assert.equal(groups.length,0,"Fixture has no historical OrderGroup")
  assert.equal(orderLinks.length,0,"Fixture has no historical native Order")
  return {
    cart:{id:native.id,customer_id:native.customer_id,
      completed_at:native.completed_at},
    items,
    attribution:{
      cart_id:attribution[0].cart_id,
      organization_id:attribution[0].organization_id,
      customer_id:attribution[0].customer_id,
      person_id:attribution[0].person_id,
      source_audit_event_id:attribution[0].source_audit_event_id
    },
    order_groups:groups.length,
    order_links:orderLinks.length
  }
}

export async function verifyB22ExceptionalNameRight(input:{
  owner:B06Chrome;reviewer:B06Chrome;
  source:Store;target:Store;q:Rows
}):Promise<{formerName:string;formerHandle:string}>{
  const {owner,reviewer,source,target,q}=input
  const [original]=await q("select id,name,handle,status,approved_at from seller where id=$1",
    [source.seller_id])
  const [recipient]=await q("select id,name,handle,status,approved_at from seller where id=$1",
    [target.seller_id])
  assert.equal(original?.id,source.seller_id)
  assert.equal(original.status,"suspended")
  assert.ok(original.approved_at)
  assert.equal(recipient?.id,target.seller_id)
  assert.equal(recipient.status,"open")
  assert.ok(recipient.approved_at)
  assert.notEqual(source.organization_id,target.organization_id)
  assert.notEqual(source.seller_id,target.seller_id)
  const values={source_application_id:source.application_id,
    source_seller_id:source.seller_id,
    target_application_id:target.application_id,
    target_seller_id:target.seller_id}
  const path="/personal/platform/store-name-transfers"
  const preview=async(browser:B06Chrome)=>browser.callFunction(
    "async function(payload){const params=new URLSearchParams(JSON.parse(payload));"+
    "const r=await fetch('/personal/platform/store-name-transfers?'+params.toString(),"+
    "{cache:'no-store'});return {status:r.status,body:await r.json()}}",
    JSON.stringify(values))
  const p=await preview(reviewer)
  assert.equal(p.status,200)
  assert.equal(p.body.source.seller_id,source.seller_id)
  assert.equal(p.body.source.status,"suspended")
  assert.equal(p.body.source.name,original.name)
  assert.equal(p.body.source.handle,original.handle)
  assert.equal(p.body.target.seller_id,target.seller_id)
  assert.equal(p.body.target.name,recipient.name)
  assert.equal(p.body.target.status,"open")
  assert.equal((await preview(owner)).status,403,
    "Business Owner cannot see confidential platform transfer candidates")
  const post=async(browser:B06Chrome,payload:object,csrfValid=true)=>
    browser.callFunction(
      "async function(path,payload,valid){const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json',"+
      "'x-csrf-token':valid==='yes'?s.csrf_token:'invalid'},body:payload});"+
      "return {status:r.status,body:await r.json()}}",
      path,JSON.stringify(payload),csrfValid?"yes":"no")
  const decisionReason="Verified exceptional platform decision for the Store name right"
  const attempt={...values,transfer_id:"dastr_"+"e".repeat(32),
    expected_name:original.name,expected_handle:original.handle,
    reason:decisionReason}
  // A previous Staff-approved native rename is a valid CURRENT name, not
  // the immutable initial application name. Missing durable audit/outbox
  // must reject BOTH Staff preview and transfer POST without recording a
  // decision. The disposable database is restored even on a failed assert.
  let originalClaimExpiry:unknown
  const historical=await q(`select x.id outbox_id
    from da_store_rename_request r
    join da_audit_event e on e.organization_id=r.organization_id
      and e.target_id=r.seller_id
      and e.action='organization.store_rename_approved'
      and e.module='dogruadres-access' and e.resource='store-rename-request'
      and e.new_values->>'request_id'=r.id and e.deleted_at is null
    join da_audit_outbox x on x.source_audit_event_id=e.id
      and x.source_module='dogruadres-access' and x.deleted_at is null
    where r.seller_id=$1 and r.organization_id=$2 and r.status='approved'
      and r.proposed_name=$3 and r.proposed_handle=$4`,
    [source.seller_id,source.organization_id,original.name,original.handle])
  if(historical.length){
    assert.equal(historical.length,1,"One audit-backed preceding rename required")
    const [initialClaim]=await q(`select store_name_hash,name_claim_released_at
      from da_store_application where id=$1 and seller_id=$2`,
      [source.application_id,source.seller_id])
    assert.ok(initialClaim?.name_claim_released_at,
      "The original application claim must retain its 30-day expiry")
    originalClaimExpiry=initialClaim.name_claim_released_at
    const [currentHash]=await q(`select encode(sha256(convert_to(lower(
      regexp_replace(btrim(normalize($1,NFKC)),'[[:space:]]+',' ','g')),
      'UTF8')),'hex') hash`,[original.name])
    assert.notEqual(currentHash.hash,initialClaim.store_name_hash)
    const removed=await q(`update da_audit_outbox
      set deleted_at=clock_timestamp() where id=$1 and deleted_at is null
      returning id`,[historical[0].outbox_id])
    assert.equal(removed.length,1)
    try{
      assert.equal((await preview(reviewer)).status,409,
        "Missing approved-rename outbox must deny Staff preview")
      assert.equal((await post(reviewer,attempt)).status,409,
        "Missing approved-rename outbox must deny transfer POST")
      assert.equal((await q(`select count(*)::int n from da_store_name_transfer
        where source_seller_id=$1`,[source.seller_id]))[0].n,0)
    }finally{
      const restored=await q(`update da_audit_outbox
        set deleted_at=null where id=$1 and deleted_at is not null
        returning id`,[historical[0].outbox_id])
      assert.equal(restored.length,1)
    }
    assert.equal((await preview(reviewer)).status,200,
      "Restored Staff-approved rename with durable audit is transferable")
  }
  assert.equal((await post(owner,attempt)).status,403)
  assert.equal((await post(reviewer,attempt,false)).status,403)
  assert.equal((await post(reviewer,{...attempt,target_seller_id:source.seller_id})).status,400)
  assert.equal((await q("select count(*)::int n from da_store_name_transfer where source_seller_id=$1",
    [source.seller_id]))[0].n,0)
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  await reviewer.click("#store-approval-refresh")
  // The panel can remain visible with STALE rows during a real HTTPS refresh.
  // Await the completed response, not merely the existing panel's visibility.
  await reviewer.wait("!document.getElementById('store-approval-panel').hidden && "+
    "!document.getElementById('store-approval-status').textContent.includes('kontrol ediliyor')")
  // Search only the Staff-paginated list; never fabricate a DOM approval.
  let found=false
  for(let page=0;page<6;page++){
    await reviewer.wait("!document.getElementById('store-approval-panel').hidden")
    found=await reviewer.eval("!!document.querySelector("+JSON.stringify(
      '[data-store-transfer-source="'+source.seller_id+'"]')+")")
    if(found)break
    const older=await reviewer.eval("!document.getElementById('store-approval-older').hidden")
    if(!older)break
    await reviewer.click("#store-approval-older")
    await reviewer.wait("document.getElementById('store-approval-status').textContent.includes("+
      JSON.stringify("sayfa "+(page+2))+")")
  }
  assert.equal(found,true,"Suspended original Seller must be in verified Staff queue")
  const control='[data-store-transfer-source="'+source.seller_id+'"]'
  await reviewer.click(control)
  const fields='[data-transfer-source="'+source.seller_id+'"] '
  await reviewer.wait("!document.querySelector("+JSON.stringify(
    '[data-transfer-source="'+source.seller_id+'"]')+").hidden")
  await reviewer.input(fields+'input[name=target_application_id]',target.application_id)
  await reviewer.input(fields+'input[name=target_seller_id]',target.seller_id)
  await reviewer.input(fields+'textarea[name=reason]',decisionReason)
  await reviewer.click('[data-transfer-preview="'+source.seller_id+'"]')
  // Wait for completion rather than a particular message. Categorize only
  // fixed UI states and HTTP status codes; never log Store/Person details.
  try{
    await reviewer.wait("!document.querySelector("+JSON.stringify(
      '[data-transfer-preview="'+source.seller_id+'"]')+").disabled")
  }catch{
    // Diagnose the actual browser/HTTPS outcome without retaining any Person,
    // cookie, Seller name, request body or private UI text.
    const state=await reviewer.callFunction(
      "function(id){const box=Array.from(document.querySelectorAll('[data-transfer-source]'))"+
      ".find(e=>e.dataset.transferSource===id);"+
      "const btn=Array.from(document.querySelectorAll('[data-transfer-preview]'))"+
      ".find(e=>e.dataset.transferPreview===id);"+
      "const txt=box?.querySelector('[role=status]')?.textContent??'';"+
      "return {visible:!!box&&!box.hidden,button:btn?.disabled?'busy':btn?'idle':'missing',"+
      "status:txt.startsWith('Kaynak:')?'ready':"+
      "txt.includes('doğrulanamadı')?'denied':"+
      "txt.includes('Geçerli ve farklı')?'invalid':'other'}}",
      source.seller_id)
    const http=reviewer.http.filter((e:any)=>
      e.path==="/personal/platform/store-name-transfers")
      .slice(-3).map((e:any)=>({method:e.method,status:e.status}))
    throw new Error("Transfer preview did not complete: "+JSON.stringify({state,http}))
  }
  const previewCategory=await reviewer.callFunction(
    "function(id){const box=Array.from(document.querySelectorAll('[data-transfer-source]'))"+
    ".find(e=>e.dataset.transferSource===id);"+
    "const text=box?.querySelector('[role=status]')?.textContent??'';"+
    "const btn=Array.from(document.querySelectorAll('[data-transfer-decide]'))"+
    ".find(e=>e.dataset.transferDecide===id);"+
    "return !btn?.disabled && text.startsWith('Kaynak:')?'ready':"+
    "text.includes('doğrulanamadı')?'denied':"+
    "text.includes('Geçerli ve farklı')?'invalid':"+
    "text.includes('yeniden doğrulayın')?'reset':'empty'}",
    source.seller_id)
  const metadata=reviewer.http.filter((x:any)=>
    x.path==="/personal/platform/store-name-transfers").slice(-3)
    .map((x:any)=>({method:x.method,status:x.status}))
  assert.equal(previewCategory,"ready","Staff preview category="+
    previewCategory+"; HTTP metadata="+JSON.stringify(metadata))
  const actualPreview=await reviewer.eval("document.querySelector("+
    JSON.stringify('[data-transfer-source="'+source.seller_id+'"] [role=status]')+
    ").textContent.includes("+JSON.stringify(recipient.name)+")")
  assert.equal(actualPreview,true,"Staff preview must display verified recipient")
  const readyToDecide=await reviewer.callFunction(
    "function(id){const box=Array.from(document.querySelectorAll('[data-transfer-source]'))"+
    ".find(x=>x.dataset.transferSource===id);"+
    "const reason=box?.querySelector('textarea[name=reason]')?.value??'';"+
    "const button=Array.from(document.querySelectorAll('[data-transfer-decide]'))"+
    ".find(x=>x.dataset.transferDecide===id);"+
    "return {reason_length:reason.trim().length,letters:[...reason.matchAll(/[\\p{L}\\p{N}]/gu)].length,"+
    "ready:!!button&&!button.disabled}}",
    source.seller_id)
  assert.deepEqual(readyToDecide,{
    reason_length:decisionReason.length,letters:decisionReason.replace(/[^A-Za-z0-9]/g,"").length,
    ready:true
  },"Real Staff reason and server-verified preview must remain in the same visible form")
  const click=await reviewer.callFunction(
    "function(id){const b=document.querySelector('[data-transfer-decide=\"'+id+'\"]');"+
    "if(!b||b.disabled)return false;const former=window.confirm;"+
    "window.confirm=()=>true;try{b.click()}finally{window.confirm=former}return true}",
    source.seller_id)
  assert.equal(click,true,"Real Staff UI submits only the verified decision")
  try{
    await reviewer.wait("document.getElementById('store-approval-status').textContent.includes('Ad hakkı kararı kaydedildi') || "+
      "document.querySelector("+JSON.stringify('[data-transfer-source="'+source.seller_id+'"] [role=status]')+
      ")?.textContent.includes('Devir sonucu belirsiz') || "+
      "document.querySelector("+JSON.stringify('[data-transfer-source="'+source.seller_id+'"] [role=status]')+
      ")?.textContent.includes('Önce hedefi doğrulayın')")
  }catch{
    const http=reviewer.http.filter((e:any)=>
      e.path==="/personal/platform/store-name-transfers")
      .slice(-5).map((e:any)=>({method:e.method,status:e.status}))
    const browserState=await reviewer.callFunction(
      "function(id){const box=Array.from(document.querySelectorAll('[data-transfer-source]'))"+
      ".find(x=>x.dataset.transferSource===id);"+
      "const msg=document.getElementById('store-approval-status')?.textContent??'';"+
      "const status=box?.querySelector('[role=status]')?.textContent??'';"+
      "return {visible:!!box&&!box.hidden,global:msg.includes('Ad hakkı kararı kaydedildi')?'saved':"+
      "msg.includes('gönderiliyor')?'sending':'other',"+
      "row:status.includes('Devir sonucu belirsiz')?'uncertain':"+
      "status.includes('Önce hedefi doğrulayın')?'guard-denied':"+
      "status.includes('Kaynak:')?'preview':'other'}}",
      source.seller_id)
    // PostgreSQL state classification ONLY: never select query, person, IDs,
    // server address, passwords or table/row contents into GitHub logs.
    const locks=await q(`select coalesce(wait_event_type,'running') kind,
      coalesce(wait_event,'none') event,count(*)::int n from pg_stat_activity
      where datname=current_database() and pid<>pg_backend_pid()
        and backend_type='client backend'
      group by 1,2 order by 1,2`)
    throw new Error("Staff transfer decision timed out: "+
      JSON.stringify({http,browserState,locks}))
  }
  const stage=await reviewer.callFunction(
    "function(id){const box=Array.from(document.querySelectorAll('[data-transfer-source]'))"+
    ".find(e=>e.dataset.transferSource===id);"+
    "const row=box?.querySelector('[role=status]')?.textContent??'';"+
    "const global=document.getElementById('store-approval-status')?.textContent??'';"+
    "return global.includes('Ad hakkı kararı kaydedildi')?'success':"+
    "row.includes('Devir sonucu belirsiz')?'uncertain':"+
    "row.includes('Önce hedefi doğrulayın')?'guard-denied':'other'}",
    source.seller_id)
  const transferHttp=reviewer.http.filter((e:any)=>
    e.path==="/personal/platform/store-name-transfers")
    .slice(-4).map((e:any)=>({method:e.method,status:e.status}))
  assert.equal(stage,"success","Real transfer POST outcome="+stage+
    "; HTTP metadata="+JSON.stringify(transferHttp))
  const decisions=await q("select id,source_seller_id,target_seller_id,old_name,old_handle,name_hash,reason,source_audit_event_id from da_store_name_transfer where source_seller_id=$1",
    [source.seller_id])
  assert.equal(decisions.length,1)
  const d=decisions[0]
  assert.match(d.id,/^dastr_[a-f0-9]{32}$/)
  assert.equal(d.source_seller_id,source.seller_id)
  assert.equal(d.target_seller_id,target.seller_id)
  assert.equal(d.old_name,original.name)
  assert.equal(d.old_handle,original.handle)
  assert.equal(d.reason,decisionReason)
  const audit=await q(
    "select e.action,x.id outbox_id from da_audit_event e join da_audit_outbox x"+
    " on x.source_audit_event_id=e.id where e.id=$1",
    [d.source_audit_event_id])
  assert.equal(audit.length,1)
  assert.equal(audit[0].action,"organization.store_name_right_assigned")
  assert.ok(audit[0].outbox_id)
  const claim=await q("select name_claim_released_at from da_store_application where id=$1",
    [source.application_id])
  assert.ok(claim[0]?.name_claim_released_at)
  if(originalClaimExpiry!==undefined)
    assert.equal(String(claim[0].name_claim_released_at),
      String(originalClaimExpiry),
      "Exceptional assignment must not shorten the original 30-day hold")
  assert.deepEqual((await q("select id,name,handle,status,approved_at from seller where id=$1",
    [source.seller_id]))[0],original,
    "Right assignment must NEVER mutate the suspended native Store")
  assert.deepEqual((await q("select id,name,handle,status,approved_at from seller where id=$1",
    [target.seller_id]))[0],recipient,
    "Recipient native Store, Cart and Order history must remain independent")
  const replay=await post(reviewer,{...attempt,transfer_id:d.id})
  assert.equal(replay.status,200)
  assert.equal((await post(reviewer,{...attempt,transfer_id:"dastr_"+"f".repeat(32)})).status,409)
  assert.equal((await q("select count(*)::int n from da_store_name_transfer where source_seller_id=$1",
    [source.seller_id]))[0].n,1)
  // The Staff Stores endpoint (different URL) must refuse the vacated right.
  const blocked=await reviewer.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/platform/stores',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return r.status}",
    JSON.stringify({action:"unsuspend",application_id:source.application_id,
      seller_id:source.seller_id}))
  assert.equal(blocked,409,"Transferred old right never reopens the original Store")
  assert.equal((await q("select status from seller where id=$1",
    [source.seller_id]))[0].status,"suspended")
  return {formerName:original.name,formerHandle:original.handle}
}


/** A real Owner may request the assigned name in target B only AFTER the
 * source has vacated both native name and URL. C never inherits that right.
 * All mutations run through existing Owner/Staff HTTPS endpoints. */
export async function verifyAssignedRecipientUse(input:{
  owner:B06Chrome;reviewer:B06Chrome;q:Rows;
  source:Store;target:Store;competitor:Pick<Store,'seller_id'|'organization_id'>;
  targetOrganizationName:string;competitorOrganizationName:string;
  formerName:string;formerHandle:string;sourceVacated:boolean
}):Promise<void>{
  const {owner,reviewer,q,source,target,competitor,formerName,
    formerHandle,sourceVacated,targetOrganizationName,
    competitorOrganizationName}=input
  const proposal=(store:Pick<Store,'seller_id'|'organization_id'>)=>({
    request_id:"dasrn_"+randomBytes(16).toString("hex"),
    organization_id:store.organization_id,seller_id:store.seller_id,
    name:formerName,handle:formerHandle,risk_acknowledged:true,
    risk_version:"store-rename-risks-v2"
  })
  const post=async(browser:B06Chrome,payload:object)=>browser.callFunction(
    "async function(json){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/store-rename-requests',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:json});return {status:r.status,body:await r.json()}}",
    JSON.stringify(payload))
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  await owner.select(competitorOrganizationName,"owner")
  const [competitorNative]=await q("select name,handle,status from seller where id=$1",
    [competitor.seller_id])
  assert.equal(competitorNative?.status,"open")
  assert.notEqual(competitorNative?.name,formerName)
  assert.equal((await q("select count(*)::int n from da_store_rename_request where seller_id=$1 and status in ('pending_review','approving')",
    [competitor.seller_id]))[0].n,0,
    "Third Store must have no unrelated pending request that could mask reservation denial")
  const c=proposal(competitor)
  assert.equal((await post(owner,c)).status,409,
    "Third Store C cannot claim another Store's assigned right")
  assert.equal((await q("select count(*)::int n from da_store_rename_request where id=$1",
    [c.request_id]))[0].n,0,"Denied C request must not persist")
  if(sourceVacated){
    // The transfer's permanent B-only reservation must still exclude C when
    // A's ordinary approved old-name hold has expired. Alter only the
    // isolated task-owned historical decision timestamp, then restore it.
    // At this point B has NOT acquired the native name, so C's 409 cannot
    // be explained by a collision with B's current Seller name/URL.
    const priorHold=await q(`select id,approved_at from da_store_rename_request
      where seller_id=$1 and old_name=$2 and old_handle=$3 and status='approved'`,
      [source.seller_id,formerName,formerHandle])
    assert.equal(priorHold.length,1,"One exact source old-name hold expected")
    assert.ok(priorHold[0].approved_at)
    const changed=await q(`update da_store_rename_request
      set approved_at=clock_timestamp()-interval '30 days 1 second'
      where id=$1 and status='approved' returning id`,[priorHold[0].id])
    assert.equal(changed.length,1)
    try{
      const [clock]=await q(`select (approved_at<=clock_timestamp()-interval '30 days')
        as expired from da_store_rename_request where id=$1`,[priorHold[0].id])
      assert.equal(clock.expired,true,"Source A's 30-day hold must actually be over")
      const cExpired=proposal(competitor)
      assert.equal((await post(owner,cExpired)).status,409,
        "C must not take the assigned name even after the normal 30-day hold")
      assert.equal((await q("select count(*)::int n from da_store_rename_request where id=$1",
        [cExpired.request_id]))[0].n,0)
      assert.equal((await q(`select count(*)::int n from da_audit_event
        where action='organization.store_rename_requested'
          and new_values->>'request_id'=$1`,[cExpired.request_id]))[0].n,0,
        "Post-hold denied C must not create a canonical request audit")
      assert.equal((await q(`select count(*)::int n from da_store_name_transfer
        where status='assigned' and source_seller_id=$1 and target_seller_id=$2`,
        [source.seller_id,target.seller_id]))[0].n,1,
        "B-only transfer reservation remains durable past day 30")
    }finally{
      const restored=await q(`update da_store_rename_request set approved_at=$2
        where id=$1 and status='approved' returning approved_at`,
        [priorHold[0].id,priorHold[0].approved_at])
      assert.equal(restored.length,1)
      assert.equal(String(restored[0].approved_at),String(priorHold[0].approved_at),
        "Isolated historical approval timestamp must be restored exactly")
    }
  }
  await owner.select(targetOrganizationName,"owner")
  const [before]=await q("select id,name,handle,status,approved_at from seller where id=$1",
    [target.seller_id])
  assert.equal(before?.id,target.seller_id)
  assert.equal(before.status,"open")
  const b=proposal(target)
  if(sourceVacated){
    // The exception requires the original transfer decision's durable
    // audit/outbox; corrupt only this task-owned disposable PostgreSQL row,
    // assert no Owner request survives, then restore it even on failure.
    const audited=await q(`select x.id from da_store_name_transfer t
      join da_audit_outbox x on x.source_audit_event_id=t.source_audit_event_id
        and x.source_module='dogruadres-access' and x.deleted_at is null
      where t.source_seller_id=$1 and t.target_seller_id=$2 and t.status='assigned'`,
      [source.seller_id,target.seller_id])
    assert.equal(audited.length,1)
    assert.equal((await q(`update da_audit_outbox
      set deleted_at=clock_timestamp() where id=$1 and deleted_at is null
      returning id`,[audited[0].id])).length,1)
    try{
      const tampered=proposal(target)
      assert.equal((await post(owner,tampered)).status,409,
        "Missing audited transfer must never waive a protected old name")
      assert.equal((await q("select count(*)::int n from da_store_rename_request where id=$1",
        [tampered.request_id]))[0].n,0)
    }finally{
      assert.equal((await q(`update da_audit_outbox
        set deleted_at=null where id=$1 and deleted_at is not null
        returning id`,[audited[0].id])).length,1)
    }
  }
  const result=await post(owner,b)
  if(!sourceVacated){
    assert.equal(result.status,409,
      "B cannot take the transferred name while A still uses it")
    assert.deepEqual((await q("select id,name,handle,status,approved_at from seller where id=$1",
      [target.seller_id]))[0],before)
    assert.equal((await q("select count(*)::int n from da_store_rename_request where id=$1",
      [b.request_id]))[0].n,0)
    return
  }
  const [oldSource]=await q("select name,handle from seller where id=$1",
    [source.seller_id])
  assert.notEqual(oldSource?.name,formerName)
  assert.notEqual(oldSource?.handle,formerHandle)
  assert.equal(result.status,201,
    "Assigned B must request the old name via existing Owner API")
  assert.equal(result.body?.status,"pending_review")
  const [pending]=await q("select id,status from da_store_rename_request where id=$1",
    [b.request_id])
  assert.equal(pending?.status,"pending_review")
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  await reviewer.click("#store-rename-review-refresh")
  await reviewer.wait("Array.from(document.querySelectorAll('#store-rename-review-list > div'))"+
    ".some(e=>e.textContent.includes("+JSON.stringify(formerName)+"))")
  const clicked=await reviewer.callFunction(
    "function(name){const row=Array.from(document.querySelectorAll("+
    "'#store-rename-review-list > div')).find(e=>e.textContent.includes(name));"+
    "const btn=Array.from(row?.querySelectorAll('button')??[])"+
    ".find(b=>b.textContent.includes('Yeni ad ve bağlantıyı onayla'));"+
    "if(!btn||btn.disabled)return false;const previous=window.confirm;"+
    "window.confirm=()=>true;try{btn.click()}finally{window.confirm=previous}return true}",
    formerName)
  assert.equal(clicked,true,"Real Staff approval button must decide B")
  await reviewer.wait("document.getElementById('store-rename-review-status').textContent.includes('etkinleşti')")
  const [after]=await q("select id,name,handle,status,approved_at from seller where id=$1",
    [target.seller_id])
  assert.equal(after.id,before.id,"B retains its native Seller ID")
  assert.equal(after.name,formerName)
  assert.equal(after.handle,formerHandle)
  assert.equal(after.status,before.status)
  assert.equal(String(after.approved_at),String(before.approved_at))
  const proof=await q(`select r.status,e.action,x.id outbox_id
    from da_store_rename_request r
    join da_audit_event e on e.organization_id=r.organization_id
      and e.target_id=r.seller_id
      and e.action='organization.store_rename_approved'
      and e.new_values->>'request_id'=r.id and e.deleted_at is null
    join da_audit_outbox x on x.source_audit_event_id=e.id and x.deleted_at is null
    where r.id=$1`,[b.request_id])
  assert.equal(proof.length,1)
  assert.equal(proof[0].status,"approved")
  assert.ok(proof[0].outbox_id)
  const [stillHeld]=await q(`select count(*)::int n from da_store_rename_request
    where seller_id=$1 and old_name=$2 and old_handle=$3 and status='approved'
      and approved_at>clock_timestamp()-interval '30 days'`,
    [source.seller_id,formerName,formerHandle])
  assert.equal(stillHeld.n,1,"A's normal 30-day hold stays active")
  const [assignment]=await q(`select source_seller_id,target_seller_id,status
    from da_store_name_transfer where source_seller_id=$1 and
      target_seller_id=$2 and old_name=$3 and old_handle=$4`,
    [source.seller_id,target.seller_id,formerName,formerHandle])
  assert.equal(assignment?.status,"assigned")
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  await owner.select(competitorOrganizationName,"owner")
  const cAfter=proposal(competitor)
  assert.equal((await post(owner,cAfter)).status,409,
    "C cannot take the transferred name after B adopts it")
  assert.equal((await q("select count(*)::int n from da_store_rename_request where id=$1",
    [cAfter.request_id]))[0].n,0)
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: recipient B native name and URL adopted after source A vacates, historical 30-day hold retained, unrelated Store C HTTP409 before/after, Staff approval and audit/outbox durable\n")
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: transferred old name remains reserved for B after source hold day 30, C HTTPS409 without request/audit, original timestamp restored, B native adoption succeeds\n")
}

/** Complete the previously assigned right with the existing real Owner-rename
 * and Staff-unsuspend journey; keep the unrelated checkout fixture isolated.
 */
export async function verifyB22TransferredRecovery(input:{
  owner:B06Chrome;reviewer:B06Chrome;q:Rows;
  source:Store;target:Store;targetExpectedName:string;
  competitor:Pick<Store,'seller_id'|'organization_id'>;targetOrganizationName:string;competitorOrganizationName:string;
  renameAndReopen:()=>Promise<void>;
  restoreFixture:()=>Promise<unknown>
}):Promise<{formerName:string;formerHandle:string}>{
  const {owner,reviewer,q,source,target,targetExpectedName}=input
  const before=(await q(
    "select id,name,handle,status,approved_at from seller where id=$1",
    [source.seller_id]))[0]
  assert.equal(before?.status,"suspended")
  const assignment=await verifyB22ExceptionalNameRight({
    owner,reviewer,q,source,target
  })
  assert.equal(assignment.formerName,before.name)
  const recipientScope={owner,reviewer,q,source,target,competitor:input.competitor,
    targetOrganizationName:input.targetOrganizationName,
    competitorOrganizationName:input.competitorOrganizationName,
    ...assignment}
  await verifyAssignedRecipientUse({...recipientScope,sourceVacated:false})
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  await input.renameAndReopen()
  const recovered=(await q(
    "select id,name,handle,status,approved_at from seller where id=$1",
    [source.seller_id]))[0]
  assert.equal(recovered.id,before.id)
  assert.equal(recovered.status,"open")
  assert.notEqual(recovered.name,assignment.formerName)
  assert.equal(String(recovered.approved_at),String(before.approved_at))
  const recipient=(await q("select name,status from seller where id=$1",
    [target.seller_id]))[0]
  assert.equal(recipient.name,targetExpectedName)
  assert.equal(recipient.status,"open")
  // B's native adoption runs AFTER the unrelated Gamma rename regression
  // tests, so their historical 'first rename' fixture is not invalidated.
  // Later independent Cart fixture expects the historical source suspended.
  await input.restoreFixture()
  assert.equal((await q("select status from seller where id=$1",
    [source.seller_id]))[0].status,"suspended")
  assert.equal((await q("select id from seller where id=$1",
    [source.seller_id]))[0].id,source.seller_id)
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: exceptional suspended Seller name-right assigned to approved separate Store; Owner new name and Staff reopen same ID, native/Order untouched before rename, foreign/CSRF/replay denied, audit/outbox and recipient reservation\n")
  return assignment
}
