/** Task-only real HTTPS/Chrome/PG16 acceptance: no real commercial accounts. */
import assert from "node:assert/strict"
import {B06Chrome} from "./b06-ui-browser"
type Rows=(sql:string,params?:any[])=>Promise<any[]>
type Store={application_id:string;seller_id:string;organization_id:string}
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
  const click=await reviewer.callFunction(
    "function(id){const b=document.querySelector('[data-transfer-decide=\"'+id+'\"]');"+
    "if(!b||b.disabled)return false;const former=window.confirm;"+
    "window.confirm=()=>true;try{b.click()}finally{window.confirm=former}return true}",
    source.seller_id)
  assert.equal(click,true,"Real Staff UI submits only the verified decision")
  await reviewer.wait("document.getElementById('store-approval-status').textContent.includes('Ad hakkı kararı kaydedildi') || "+
    "document.querySelector('[data-transfer-source="'+source.seller_id+'"] [role=status]')?.textContent.includes('Devir sonucu belirsiz')")
  const stage=await reviewer.callFunction(
    "function(id){const box=Array.from(document.querySelectorAll('[data-transfer-source]'))"+
    ".find(e=>e.dataset.transferSource===id);"+
    "const row=box?.querySelector('[role=status]')?.textContent??'';"+
    "const global=document.getElementById('store-approval-status')?.textContent??'';"+
    "return global.includes('Ad hakkı kararı kaydedildi')?'success':"+
    "row.includes('Devir sonucu belirsiz')?'uncertain':'other'}",
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

/** Complete the previously assigned right with the existing real Owner-rename
 * and Staff-unsuspend journey; keep the unrelated checkout fixture isolated.
 */
export async function verifyB22TransferredRecovery(input:{
  owner:B06Chrome;reviewer:B06Chrome;q:Rows;
  source:Store;target:Store;targetExpectedName:string;
  renameAndReopen:()=>Promise<void>;
  restoreFixture:()=>Promise<unknown>
}):Promise<void>{
  const {owner,reviewer,q,source,target,targetExpectedName}=input
  const before=(await q(
    "select id,name,handle,status,approved_at from seller where id=$1",
    [source.seller_id]))[0]
  assert.equal(before?.status,"suspended")
  const assignment=await verifyB22ExceptionalNameRight({
    owner,reviewer,q,source,target
  })
  assert.equal(assignment.formerName,before.name)
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
  // Later independent Cart fixture expects the historical source suspended.
  await input.restoreFixture()
  assert.equal((await q("select status from seller where id=$1",
    [source.seller_id]))[0].status,"suspended")
  assert.equal((await q("select id from seller where id=$1",
    [source.seller_id]))[0].id,source.seller_id)
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: exceptional suspended Seller name-right assigned to approved separate Store; Owner new name and Staff reopen same ID, native/Order untouched before rename, foreign/CSRF/replay denied, audit/outbox and recipient reservation\n")
}
