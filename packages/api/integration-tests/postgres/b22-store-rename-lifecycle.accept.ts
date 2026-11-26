import assert from "node:assert/strict"
import {randomBytes,createHash} from "node:crypto"
import {createServer as tlsServer,request as tlsRequest} from "node:https"
import {createServer as plainServer} from "node:http"
import {dirname,join} from "node:path"
import {createRequire} from "node:module"
import {ApiLoader,expressLoader} from "@medusajs/framework/http"
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync,cpSync,copyFileSync,symlinkSync,existsSync,openSync,closeSync} from "node:fs"
import {tmpdir} from "node:os"
import {spawn,spawnSync} from "node:child_process"
import {Client} from "@medusajs/framework/pg"
import {createPersonalHttpApp} from "../../src/scripts/personal-http-runtime"
import {ingressConfig} from "../../src/utils/ingress-config"
import {requireOrganizationAccess} from "../../src/api/dogruadres/authorization"
import {completeCartWithSplitOrdersWorkflow,approveSellerWorkflow,suspendSellerWorkflow,unsuspendSellerWorkflow,createProductsWorkflow,createOffersWorkflow,createSellerCustomerGroupsWorkflow,createSellerPriceListsWorkflow,linkSellerRegionsWorkflow} from "@mercurjs/core/workflows"
import {createShippingProfilesWorkflow,addToCartWorkflow,createApiKeysWorkflow,linkSalesChannelsToApiKeyWorkflow,createRegionsWorkflow,updateRegionsWorkflow,createPaymentCollectionForCartWorkflow,createPaymentSessionsWorkflow,capturePaymentWorkflow} from "@medusajs/medusa/core-flows"
import {B06Chrome} from "./b06-ui-browser"
import {verifyB22MultiOrgStaleStoreResponse} from "./b22-multiorg-stale-store-response.accept"
import {verifyB22TransferredRecovery,verifyAssignedRecipientUse,createB22CompletedSourceOrderFixture} from "./b22-store-name-transfer.accept"
import {verifyB22ScheduledSellerWindow} from "./b22-scheduled-seller-window.accept"
import {verifyRepeatedApprovedStoreRenameHistory} from "./b22-repeated-rename-history.accept"
import {prepareRenameBeforeStoreReactivation,verifyReactivationClaimFreezesRenames} from "./b22-reactivation-rename-claim.accept"
import {verifyB22PlatformClosingAppeal,
  verifyB22PlatformClosingSecondStageRequest,
  verifyB22RealOrderedSellerDay31WithGrant,
  verifyB22IndependentStaffClosingDecision} from "./b22-platform-closing-appeal.accept"
import {verifyTwoIndependentStaffNameRightRace} from "./b22-store-name-transfer-staff-race.accept"
import {verifyB22OwnedHistoricalOrder,verifyB22ForeignHistoricalOrder,verifyB22AuthorizedForeignHistoricalOrder} from "./b22-order-history.accept"
import {verifyB22NativeOwnerMailRetry} from "./b22-native-owner-mail-retry.accept"
import {verifyB22CoownerNativeMemberReadback,verifyB22LateProtectedOwnerClosingNotice} from "./b22-native-member-private-notice.accept"
import {SmtpResponsePrivacyGuard} from "./smtp-response-privacy-guard"
import {assertWcag22AxeInChrome} from "./wcag22-axe-chrome"
import {getFreePort,until as waitForLoopback,killProcess} from "./native-verification-browser"
import {otp,until} from "./b19-browser"
import {projectFoundationAuditEvent} from "../../src/modules/dogruadres-audit-index/envelope"
import {platformApprovedSellerIds} from "../../src/modules/dogruadres-access/legal-store-ownership"
import {IdentityAccessDenied} from "../../src/modules/dogruadres-access/identity-session"
import taxCertificateInventory, {inspectTaxCertificateSnapshot} from "../../src/scripts/tax-certificate-inventory"


export async function verifyOwnerRenameTargetRefresh(
  browser:B06Chrome,org:string,storeA:string,storeB:string,
  q:(sql:string,params?:any[])=>Promise<any[]>
):Promise<void>{
  const authorized=await browser.callFunction(
    "async function(org){const r=await fetch('/organization/stores?organization='+"+
    "encodeURIComponent(org)+'&purpose=rename',{cache:'no-store'});"+
    "return {status:r.status,body:await r.json()}}",org)
  assert.equal(authorized.status,200)
  assert.equal(authorized.body.organization_id,org)
  assert.equal(authorized.body.stores.filter((s:any)=>[storeA,storeB].includes(s.id)).length,2,
    "The two native Stores must share actual current approved Owner rename scope")
  const snapshot=async()=>q("select seller_id,count(*)::int n from da_store_rename_request "+
    "where seller_id in ($1,$2) group by seller_id order by seller_id",[storeA,storeB])
  const before=await snapshot()
  await browser.wait("!document.getElementById('store-rename-panel').hidden")
  await browser.eval("(()=>{const f=document.getElementById('store-rename-form');"+
    "f.elements.namedItem('seller_id').value="+JSON.stringify(storeB)+";"+
    "f.elements.namedItem('seller_id').dispatchEvent(new Event('change',{bubbles:true}))})()")
  await browser.wait("document.querySelector('#store-rename-form select[name=seller_id]').value==="+
    JSON.stringify(storeB)+" && !document.querySelector('#store-rename-form button[type=submit]').disabled && "+
    "!document.getElementById('org-stores-refresh').disabled")
  await browser.eval("(()=>{const f=document.getElementById('store-rename-form');"+
    "f.elements.namedItem('name').value='Prepared second Store name';"+
    "f.elements.namedItem('handle').value='prepared-second-store';"+
    "f.elements.namedItem('risk_acknowledged').checked=true})()")
  await browser.click("#org-stores-refresh")
  await browser.wait("document.getElementById('org-stores-status').textContent.includes('Yetkili mağazalar güncellendi') && "+
    "document.querySelector('#store-rename-form select[name=seller_id]').value==="+JSON.stringify(storeB)+
    " && !document.getElementById('store-rename-panel').hidden")
  const state=()=>browser.callFunction(
    "function(){const f=document.getElementById('store-rename-form');return {"+
    "seller:f.elements.namedItem('seller_id').value,"+
    "name:f.elements.namedItem('name').value,"+
    "handle:f.elements.namedItem('handle').value,"+
    "risk:f.elements.namedItem('risk_acknowledged').checked,"+
    "disabled:f.querySelector('button[type=submit]').disabled}}")
  const preserved=await state()
  assert.equal(preserved.seller,storeB)
  assert.equal(preserved.name,"Prepared second Store name")
  assert.equal(preserved.handle,"prepared-second-store")
  assert.equal(preserved.risk,true)
  // P2 overlapping refresh: delay ONLY the one rename-only response in this
  // genuine Chrome tab. Second click while loading must be deduplicated;
  // the prepared B name/URL/risk must survive without any retargeting.
  const cycleBefore=await browser.eval("storeRequest")
  await browser.eval("(()=>{const original=window.fetch;let unblock=null;"+
    "const state={count:0,release:()=>{if(unblock){unblock();unblock=null}},"+
    "restore:()=>{window.fetch=original}};window.__b22RenameHold=state;"+
    "window.fetch=(...args)=>{const path=String(args[0]);"+
    "if(path.startsWith('/organization/stores?')&&path.includes('purpose=rename')){"+
    "state.count++;const pending=original(...args);"+
    "if(state.count===1)return new Promise((resolve,reject)=>{unblock=()=>pending.then(resolve,reject)});"+
    "return pending;}return original(...args)}})()")
  try{
    await browser.click("#org-stores-refresh")
    await browser.wait("window.__b22RenameHold.count===1 && "+
      "document.getElementById('org-stores-refresh').disabled")
    await browser.eval("document.getElementById('org-stores-refresh').click()")
    assert.equal(await browser.eval("storeRequest"),cycleBefore+1,
      "Overlapping Owner refresh must not start a second GET cycle")
    assert.equal(await browser.eval("window.__b22RenameHold.count"),1)
    await browser.eval("window.__b22RenameHold.release()")
    await browser.wait("!document.getElementById('org-stores-refresh').disabled && "+
      "document.querySelector('#store-rename-form select[name=seller_id]').value==="+
      JSON.stringify(storeB))
    assert.equal((await state()).name,"Prepared second Store name")
    assert.equal((await state()).handle,"prepared-second-store")
    assert.equal((await state()).risk,true,
      "Repeated click while pending must not discard explicit risk consent")
  }finally{
    await browser.eval("(()=>{const hold=window.__b22RenameHold;"+
      "if(hold){hold.release();hold.restore();delete window.__b22RenameHold}})()")
  }
  // The sole fake element is the revoked Seller's omission from one browser
  // response. The initial two-Seller scope, HTTP, and database are all real.
  await browser.eval("(()=>{const original=window.fetch;let once=true;"+
    "window.fetch=async(...args)=>{const response=await original(...args);"+
    "const path=String(args[0]);"+
    "if(!once||!path.startsWith('/organization/stores?')||"+
    "!path.includes('purpose=rename'))return response;"+
    "once=false;window.fetch=original;"+
    "const data=await response.json();"+
    "data.stores=data.stores.filter(s=>s.id!=="+JSON.stringify(storeB)+");"+
    "return new Response(JSON.stringify(data),{status:response.status,"+
    "headers:{'content-type':'application/json','cache-control':'no-store'}})}})()")
  await browser.click("#org-stores-refresh")
  await browser.wait("document.getElementById('store-rename-status').textContent.includes('Önceki mağaza artık yetkili listede yok') && "+
    "document.querySelector('#store-rename-form select[name=seller_id]').value==='' && "+
    "!document.getElementById('org-stores-refresh').disabled")
  assert.deepEqual(await state(),{seller:"",name:"",handle:"",risk:false,disabled:true},
    "Former target must force new Store selection/name/URL and fresh consent")
  // Even if the Owner types while no target is selected, a later refresh may
  // not silently bind that draft to the first returned Store.
  await browser.eval("(()=>{const f=document.getElementById('store-rename-form');"+
    "f.elements.namedItem('name').value='Unbound prepared Store';"+
    "f.elements.namedItem('handle').value='unbound-prepared-store';"+
    "f.elements.namedItem('risk_acknowledged').checked=true})()")
  await browser.click("#org-stores-refresh")
  await browser.wait("document.querySelector('#store-rename-form select[name=seller_id]').value==='' && "+
    "document.getElementById('store-rename-form').elements.namedItem('name').value==='' && "+
    "document.getElementById('store-rename-form').elements.namedItem('handle').value==='' && "+
    "!document.getElementById('org-stores-refresh').disabled")
  assert.deepEqual(await state(),{seller:"",name:"",handle:"",risk:false,disabled:true},
    "Unbound stale values require a fresh Store selection and explicit risk consent")
  assert.deepEqual(await snapshot(),before,"Refresh must create no rename or audit writes")
  // Restore live authorized picker, not a simulated session or Seller grant.
  // A later refresh must STILL demand a manual Store choice; no first-option
  // fallback after revocation, even after all prepared fields were cleared.
  const finalCycle=await browser.eval("storeRequest")
  await browser.click("#org-stores-refresh")
  await browser.wait("storeRequest>"+finalCycle+" && "+
    "!document.getElementById('org-stores-refresh').disabled && "+
    "!document.getElementById('store-rename-panel').hidden && "+
    "Array.from(document.querySelector('#store-rename-form select[name=seller_id]').options).some(o=>o.value==="+
    JSON.stringify(storeB)+") && "+
    "document.querySelector('#store-rename-form select[name=seller_id]').value===''")
  assert.deepEqual(await state(),{seller:"",name:"",handle:"",risk:false,disabled:true},
    "Further refresh cannot silently select first Store after a lost target")
  // Explicit Owner re-selection restores access to private history, without
  // inheriting any prepared name, URL or consent from the prior Seller.
  await browser.eval("(()=>{const f=document.getElementById('store-rename-form');"+
    "f.elements.namedItem('seller_id').value="+JSON.stringify(storeA)+";"+
    "f.elements.namedItem('seller_id').dispatchEvent(new Event('change',{bubbles:true}))})()")
  await browser.wait("document.querySelector('#store-rename-form select[name=seller_id]').value==="+
    JSON.stringify(storeA)+" && !document.querySelector('#store-rename-form button[type=submit]').disabled")
  assert.deepEqual(await state(),{seller:storeA,name:"",handle:"",risk:false,disabled:false},
    "Explicit new Store selection cannot carry the old Store risk consent")
  assert.deepEqual(await snapshot(),before,"Only GET and UI selection; zero rename writes")
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: two authorized Stores; overlapping refresh dedup, second target and consent preserved, removed target resets name/URL/risk across repeat refresh; manual Store selection restores blank safe form, zero writes\n")
}

/** Real B22 Store rename REQUEST only: no native name/handle mutation or
 * 30-day release is claimed. Uses current disposable Chrome and PG16 Owner.
 */
export async function verifyOwnerStoreRenameRequest(
  browser:B06Chrome,reviewer:B06Chrome,org:string,foreignOrg:string,
  storeId:string,person:string,rand:string,
  q:(sql:string,params?:any[])=>Promise<any[]>
):Promise<void>{
  const before=(await q("select name,handle,status,approved_at from seller where id=$1",[storeId]))[0]
  assert.equal(before.status,"open")
  assert.ok(before.approved_at)
  assert.equal(typeof before.handle,"string")
  const name="B22 Request "+rand
  const handle=("b22-request-"+rand).toLowerCase().replace(/[^a-z0-9-]/g,"")
  const id="dasrn_"+randomBytes(16).toString("hex")
  const input={request_id:id,organization_id:org,seller_id:storeId,
    name,handle,risk_acknowledged:true,risk_version:"store-rename-risks-v2"}
  const post=async(actor:B06Chrome,payload:Record<string,unknown>,invalidCsrf=false)=>
    actor.callFunction("async function(json,bad){"+
      "const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/organization/store-rename-requests',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':bad?'bad':s.csrf_token},"+
      "body:json});return {status:r.status,body:await r.json()}}",
      JSON.stringify(payload),invalidCsrf?'true':'')
  // An Owner outside the selected Store's legal Organization has no scope.
  assert.equal((await post(browser,{...input,organization_id:foreignOrg})).status,403)
  assert.equal((await post(reviewer,input)).status,403)
  assert.equal((await post(browser,input,true)).status,403)
  assert.equal((await post(browser,{...input,risk_acknowledged:false})).status,400)
  assert.equal((await post(browser,{...input,name:"Mar\u200Dket"})).status,400)
  assert.equal((await q("select count(*)::int n from da_store_rename_request where seller_id=$1",
    [storeId]))[0].n,0,"Denied requests leave zero private write effects")
  await browser.wait("!document.getElementById('store-rename-panel').hidden && "+
    "Array.from(document.getElementById('store-rename-form').elements.namedItem('seller_id').options).some(o=>o.value==="+
    JSON.stringify(storeId)+") && !document.querySelector('#store-rename-form button[type=submit]').disabled")
  // Reproduce a transient list-response failure in genuine Chrome without
  // mutating the protected backend or network. The second click uses real HTTPS.
  const once=await browser.eval(`(()=>{
    const original=globalThis.fetch;let failOnce=true;
    globalThis.fetch=function(input,options){
      if(failOnce&&typeof input==='string'&&
         input.startsWith('/organization/stores?')){
        failOnce=false;globalThis.fetch=original;
        return Promise.resolve(new Response(
          JSON.stringify({message:'Disposable browser-only Store list fault'}),
          {status:503,headers:{'content-type':'application/json'}}));
      }
      return original.call(this,input,options);
    };
    return true;
  })()`)
  assert.equal(once,true)
  await browser.click("#org-stores-refresh")
  await browser.wait("document.getElementById('org-stores-status').textContent.includes('Mağazalar doğrulanamadı')")
  assert.equal(await browser.eval("selectedStoreOwner"),true,
    "A failed Store list must not erase the previously verified Owner scope")
  assert.equal(await browser.eval("document.getElementById('store-rename-panel').hidden"),true,
    "Failed list cannot expose stale Store details")
  await browser.click("#org-stores-refresh")
  await browser.wait("!document.getElementById('store-rename-panel').hidden && "+
    "document.getElementById('org-stores-status').textContent.includes('Yetkili mağazalar güncellendi') && "+
    "Array.from(document.getElementById('store-rename-form').elements.namedItem('seller_id').options).some(o=>o.value==="+
    JSON.stringify(storeId)+") && !document.querySelector('#store-rename-form button[type=submit]').disabled")
  assert.equal(await browser.eval("selectedStoreOwner"),true)
  process.stdout.write("PASS B22 Chrome/HTTPS: temporary Store list 503 hides private rename panel, same Owner refresh restores request form from fresh real authorized GET\n")
  const riskText=await browser.eval("document.getElementById('store-rename-panel').textContent")
  for(const phrase of [
    "Mağaza adı değişikliği hakkında önemli uyarı",
    "Mağaza adınızı değiştirdiğinizde mağaza bağlantınız da değişecektir. Eski bağlantınız yeni bağlantınıza yönlendirilmeyecektir.",
    "Eski mağaza adınız ve bağlantınız ileride başka bir mağaza tarafından kullanılabilir. Bu durumda daha önce paylaştığınız eski bağlantıyı kullanan kişiler farklı bir mağazaya ulaşabilir.",
    "Bu sonuçları okudum, anladım ve mağaza adımı değiştirmeyi kabul ediyorum."
  ])assert.ok(riskText.includes(phrase),"Owner must see approved risk: "+phrase)
  assert.ok(!/30\s*(?:takvim\s*)?gün/i.test(riskText),
    "User-facing risk consent must not promise a 30-day reuse date")
  // Actual visible HTML form rather than direct framework or service writes.
  const submitted=await browser.callFunction(
    "async function(id,label,key){const f=document.getElementById('store-rename-form');"+
    "f.elements.namedItem('seller_id').value=id;"+
    "f.elements.namedItem('name').value=label;"+
    "f.elements.namedItem('handle').value=key;"+
    "f.elements.namedItem('risk_acknowledged').checked=true;"+
    "f.requestSubmit();return true}",storeId,name,handle)
  assert.equal(submitted,true)
  await browser.wait("Array.from(document.querySelectorAll('#store-rename-history p')).some("+
    "p=>p.textContent.includes("+JSON.stringify(name)+") && "+
    "p.textContent.includes('Platform incelemesinde'))")
  const pending=await q(`select r.id,r.organization_id,r.seller_id,
    r.requested_by_person_id,r.old_name,r.old_handle,r.proposed_name,r.proposed_handle,
    r.risk_version,r.risk_acknowledged_at,r.status,e.action,e.actor_person_id,
    x.id outbox_id from da_store_rename_request r
    join da_audit_event e on e.id=r.source_audit_event_id
    join da_audit_outbox x on x.source_audit_event_id=e.id
    where r.organization_id=$1 and r.seller_id=$2`,[org,storeId])
  assert.equal(pending.length,1)
  const saved=pending[0]
  assert.match(saved.id,/^dasrn_[a-f0-9]{32}$/)
  assert.equal(saved.organization_id,org)
  assert.equal(saved.seller_id,storeId)
  assert.equal(saved.requested_by_person_id,person)
  assert.equal(saved.old_name,before.name)
  assert.equal(saved.old_handle,before.handle)
  assert.equal(saved.proposed_name,name)
  assert.equal(saved.proposed_handle,handle)
  assert.equal(saved.risk_version,"store-rename-risks-v2")
  assert.ok(saved.risk_acknowledged_at)
  assert.equal(saved.status,"pending_review")
  assert.equal(saved.action,"organization.store_rename_requested")
  assert.equal(saved.actor_person_id,person)
  assert.ok(saved.outbox_id)
  assert.deepEqual((await q("select name,handle,status,approved_at from seller where id=$1",
    [storeId]))[0],before,"Submitting must not mutate approved native Seller")
  const replay=await post(browser,{...input,request_id:saved.id})
  assert.equal(replay.status,200,"Exact retry must return one existing request")
  assert.equal(replay.body.request_id,saved.id)
  assert.equal((await post(browser,{...input,request_id:"dasrn_"+randomBytes(16).toString("hex")})).status,409,
    "One pending change per Seller")
  assert.equal((await q("select count(*)::int n from da_store_rename_request where seller_id=$1",
    [storeId]))[0].n,1)
  assert.equal((await q(`select count(*)::int n from da_audit_event
    where organization_id=$1 and target_id=$2
      and action='organization.store_rename_requested'`,[org,storeId]))[0].n,1)
  const privateRead=await reviewer.callFunction(
    "async function(org,id){const r=await fetch('/organization/store-rename-requests?'+new URLSearchParams({"+
    "organization_id:org,seller_id:id}));return r.status}",org,storeId)
  assert.equal(privateRead,403,"Foreign Owner cannot see proposed private name")
  // Actual protected GET must lose access if native Seller status ceases to
  // authorize Store name management, even if Owner/Origin stays valid.
  const ownerHistory=async()=>browser.callFunction(
    "async function(org,id){const r=await fetch('/organization/store-rename-requests?'+new URLSearchParams({"+
    "organization_id:org,seller_id:id}));return {status:r.status,body:await r.json()}}",
    org,storeId)
  assert.equal((await ownerHistory()).status,200,"Current approved Owner sees its private history")
  try{
    await q("update seller set status='terminated' where id=$1",[storeId])
    const denied=await ownerHistory()
    assert.equal(denied.status,403,"Terminated native Seller must deny private rename history")
    assert.deepEqual(denied.body,{message:"Access denied"})
    // Suspension is a specific approved Owner name-management exception.
    await q("update seller set status='suspended' where id=$1",[storeId])
    assert.equal((await ownerHistory()).status,200,
      "Protected Owner may manage the rename of an approved suspended Store")
  }finally{
    await q("update seller set status=$1 where id=$2",[before.status,storeId])
  }
  assert.equal((await ownerHistory()).status,200,
    "Restored approved Seller must regain authorized historical read")
  process.stdout.write("PASS B22 Chrome: #286 private Store rename history denied for terminated Seller 403, approved suspended Owner 200, restored open Owner 200, foreign Owner 403\n")
  process.stdout.write("PASS B22 Chrome/PG16: Owner Store name+URL change request with explicit risk acknowledgement, one private pending record and audit/outbox; foreign/CSRF/invalid/duplicate denied; native Seller unchanged\n")
  // Platform Store approver is a distinct current Person. An ordinary Owner
  // may not even see the pending name-change queue.
  assert.equal(await browser.eval("(async()=>{return (await fetch('/platform/store-renames')).status})()"),
    403,"Organization Owner may not inspect platform rename queue")
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible' && "+
    "!document.getElementById('workspace').hidden")
  // Distinguish a server-side authorization/SQL error from asynchronous
  // visibility-driven refresh. Never treat a hidden panel as proof of 403.
  const reviewQueue=await reviewer.eval("(async()=>{const r=await fetch('/platform/store-renames?page=0');"+
    "return {status:r.status,body:await r.json()}})()")
  assert.equal(reviewQueue.status,200,"Current Store approver GET must succeed")
  assert.equal(reviewQueue.body.page,0)
  assert.equal(reviewQueue.body.has_more!==undefined,true)
  await reviewer.click("#store-rename-review-refresh")
  await reviewer.wait("!document.getElementById('store-rename-review-panel').hidden && "+
    "Array.from(document.querySelectorAll('#store-rename-review-list > div'))"+
    ".some(e=>e.textContent.includes("+JSON.stringify(name)+"))")
  const target=reviewQueue.body.pending.find((entry:any)=>entry.request_id===saved.id)
  assert.ok(target,"Staff sees only genuine pending Store rename request")
  assert.equal(target.organization_id,org)
  assert.equal(target.seller_id,storeId)
  assert.equal(target.old_name,before.name)
  assert.equal(target.old_handle,before.handle)
  assert.equal(target.proposed_name,name)
  assert.equal(target.proposed_handle,handle)
  // Disposable browser-only 503; next refresh uses real authorized HTTPS.
  const onceReview=await reviewer.eval(`(()=>{
    const original=globalThis.fetch;let failOnce=true;
    globalThis.fetch=function(input,options){
      if(failOnce&&typeof input==='string'&&
         input.startsWith('/platform/store-renames?')){
        failOnce=false;globalThis.fetch=original;
        return Promise.resolve(new Response(
          JSON.stringify({message:'Disposable staff queue fault'}),
          {status:503,headers:{'content-type':'application/json'}}));
      }
      return original.call(this,input,options);
    };return true;
  })()`)
  assert.equal(onceReview,true)
  await reviewer.click("#store-rename-review-refresh")
  await reviewer.wait("document.getElementById('store-rename-review-status').textContent.includes('Yeniden deneyin')")
  assert.equal(await reviewer.eval("document.getElementById('store-rename-review-panel').hidden"),false)
  assert.equal(await reviewer.eval("document.querySelectorAll('#store-rename-review-list > div').length"),0,
    "Private details must remain erased during temporary fault")
  await reviewer.click("#store-rename-review-refresh")
  await reviewer.wait("!document.getElementById('store-rename-review-panel').hidden && "+
    "Array.from(document.querySelectorAll('#store-rename-review-list > div'))"+
    ".some(e=>e.textContent.includes("+JSON.stringify(name)+"))")
  process.stdout.write("PASS B22 Chrome/HTTPS: transient staff queue 503 clears private rows, visible retry and fresh authorized GET restores list\n")
  for(const invalidReason of [
    String.fromCodePoint(0x200B).repeat(10),
    String.fromCodePoint(0x3164).repeat(10),
    "R"+String.fromCodePoint(0x200B).repeat(9),
    "R"+String.fromCodePoint(0x3164).repeat(9),
    "R"+String.fromCodePoint(0x0301).repeat(9),
    "R"+" ".repeat(20)+"E"
  ]){
    const deniedInvisible=await reviewer.eval(`(async()=>{
      const sess=await(await fetch('/personal/session')).json();
      const r=await fetch('/platform/store-renames',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':sess.csrf_token},
        body:JSON.stringify(${JSON.stringify({action:"reject",request_id:id,seller_id:storeId,reason:invalidReason})})
      });return r.status;
    })()`)
    assert.equal(deniedInvisible,400,"Invisible/padded ret reason must fail HTTP validation")
    assert.equal((await q("select status from da_store_rename_request where id=$1",[saved.id]))[0].status,
      "pending_review","Invisible/padded reason cannot decide request")
    assert.equal((await q(`select count(*)::int n from da_audit_event
      where action='organization.store_rename_rejected'
        and new_values->>'request_id'=$1`,[saved.id]))[0].n,0,
      "Invisible/padded reason must leave zero decision audits")
    process.stdout.write("PASS B22 Chrome/PG16: invisible or padded reason HTTP 400, pending request intact, zero rejection audit\n")
  }
  // Real visible form must reject an invisible-only explanation before POST.
  const clientDenied=await reviewer.eval(`(()=>{
    const row=Array.from(document.querySelectorAll('#store-rename-review-list > div'))
      .find(e=>e.textContent.includes(${JSON.stringify(name)}));
    if(!row)return false;
    const textarea=row.querySelector('textarea'),button=row.querySelector('button');
    if(!textarea||!button||button.disabled)return false;
    textarea.value=${JSON.stringify("R"+String.fromCodePoint(0x200B).repeat(9))};
    button.click();
    return document.getElementById('store-rename-review-status').textContent.includes('okunabilir');
  })()`)
  assert.equal(clientDenied,true,"Real Staff UI must reject invisible-only reason")
  assert.equal((await q("select status from da_store_rename_request where id=$1",[saved.id]))[0].status,
    "pending_review","UI-invalid reason cannot decide pending request")
  process.stdout.write("PASS B22 Chrome/PG16: visible Staff form rejects readable-letter + nine invisible padding without changing pending decision\n")
  const refusalReason="B22 disposable platform review rejected a proposed public Store name"
  const csrfDenied=await reviewer.eval(`(async()=>{
    const r=await fetch('/platform/store-renames',{method:'POST',
      headers:{'content-type':'application/json','x-csrf-token':'bad'},
      body:JSON.stringify(${JSON.stringify({
        action:"reject",request_id:id,seller_id:storeId,
        reason:refusalReason
      })})
    });return r.status
  })()`)
  assert.equal(csrfDenied,403)
  const beforeDecision=(await q("select status from da_store_rename_request where id=$1",
    [saved.id]))[0]
  assert.equal(beforeDecision.status,"pending_review")
  const rejectedUi=await reviewer.eval(`(()=>{
    const row=Array.from(document.querySelectorAll('#store-rename-review-list > div'))
      .find(e=>e.textContent.includes(${JSON.stringify(name)}))
    if(!row)return false
    const reason=row.querySelector('textarea'),button=row.querySelector('button')
    if(!reason||!button||button.disabled)return false
    reason.value=${JSON.stringify(refusalReason)}
    button.click();return true
  })()`)
  assert.equal(rejectedUi,true,"Staff must submit actual visible rejection UI")
  await reviewer.wait("document.getElementById('store-rename-review-status').textContent.includes('reddedildi')")
  const decision=await q(`select r.status,r.updated_at,
    e.action,e.actor_person_id,e.new_values->>'reason' reason,
    x.id outbox_id from da_store_rename_request r
    join da_audit_event e on e.organization_id=r.organization_id
      and e.resource='store-rename-request'
      and e.target_id=r.seller_id
      and e.action='organization.store_rename_rejected'
      and e.new_values->>'request_id'=r.id
    join da_audit_outbox x on x.source_audit_event_id=e.id
    where r.id=$1`,[saved.id])
  assert.equal(decision.length,1,"Exactly one durable decision + audit/outbox")
  assert.equal(decision[0].status,"rejected")
  assert.equal(decision[0].action,"organization.store_rename_rejected")
  assert.equal(decision[0].reason,refusalReason)
  assert.ok(decision[0].updated_at&&decision[0].outbox_id)
  const repeat=await reviewer.eval(`(async()=>{
    const s=await(await fetch('/personal/session')).json()
    const r=await fetch('/platform/store-renames',{
      method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
      body:JSON.stringify(${JSON.stringify({
        action:"reject",request_id:id,seller_id:storeId,reason:refusalReason
      })})
    });return r.status
  })()`)
  assert.equal(repeat,409,"Repeated staff decision cannot write another audit")
  assert.equal((await q(`select count(*)::int n from da_audit_event
    where action='organization.store_rename_rejected'
      and new_values->>'request_id'=$1`,[saved.id]))[0].n,1)
  assert.deepEqual((await q("select name,handle,status,approved_at from seller where id=$1",
    [storeId]))[0],before,"Platform rejection must not mutate native Mercur Seller")
  await browser.send("Page.bringToFront")
  await browser.wait("document.visibilityState==='visible'")
  const ownerOutcome=await browser.callFunction(
    "async function(org,seller){const r=await fetch('/organization/store-rename-requests?'+new URLSearchParams({"+
      "organization_id:org,seller_id:seller}));return {status:r.status,body:await r.json()}}",
    org,storeId)
  assert.equal(ownerOutcome.status,200)
  assert.equal(ownerOutcome.body.requests.find((v:any)=>v.id===saved.id)?.status,"rejected")
  process.stdout.write("PASS B22 Chrome/PG16: authorized Store staff sees private pending name-change, rejects with reason using real UI; Owner reads final rejection; foreign Owner/CSRF/replay denied, single audit/outbox and native Seller unchanged\n")
}

/** Competing different-id rename requests against the SAME approved Seller.
 * Two real HTTPS POSTs start before either result is awaited, then only the
 * winning request may have a durable row and audit/outbox pair.
 */
export async function verifyConcurrentOwnerStoreRenameRequests(
  browser:B06Chrome,org:string,storeId:string,person:string,rand:string,
  q:(sql:string,params?:any[])=>Promise<any[]>
):Promise<void>{
  const before=(await q("select name,handle,status,approved_at from seller where id=$1",
    [storeId]))[0]
  assert.equal(before.status,"open")
  assert.ok(before.approved_at)
  const items=["a","b"].map(letter=>({
    request_id:"dasrn_"+randomBytes(16).toString("hex"),
    organization_id:org,seller_id:storeId,
    name:"B22 Rename Race "+letter.toUpperCase()+" "+rand,
    handle:"b22-rename-race-"+letter+"-"+rand.toLowerCase().replace(/[^a-z0-9-]/g,""),
    risk_acknowledged:true,risk_version:"store-rename-risks-v2"
  }))
  assert.notEqual(items[0].request_id,items[1].request_id)
  const responses=await browser.eval(`(async()=>{
    const session=await(await fetch('/personal/session')).json()
    return Promise.all(${JSON.stringify(items)}.map(async item=>{
      const r=await fetch('/organization/store-rename-requests',{
        method:'POST',headers:{'content-type':'application/json',
        'x-csrf-token':session.csrf_token},body:JSON.stringify(item)
      })
      return {status:r.status,body:await r.json()}
    }))
  })()`)
  assert.deepEqual(responses.map((result:any)=>result.status).sort((a:number,b:number)=>a-b),
    [201,409],"Only one same-Seller distinct-id request may win")
  const winnerIndex=responses.findIndex((result:any)=>result.status===201)
  const winner=items[winnerIndex],loser=items[1-winnerIndex]
  assert.equal(responses[winnerIndex].body.request_id,winner.request_id)
  const rows=await q(`select r.id,r.organization_id,r.seller_id,r.requested_by_person_id,
    r.old_name,r.old_handle,r.proposed_name,r.proposed_handle,r.status,
    r.source_audit_event_id,e.action,e.actor_person_id,
    x.id outbox_id from da_store_rename_request r
    join da_audit_event e on e.id=r.source_audit_event_id
    join da_audit_outbox x on x.source_audit_event_id=e.id
    where r.seller_id=$1`,[storeId])
  assert.equal(rows.length,1,"Only one durable pending Store rename request")
  assert.equal(rows[0].id,winner.request_id)
  assert.equal(rows[0].organization_id,org)
  assert.equal(rows[0].seller_id,storeId)
  assert.equal(rows[0].requested_by_person_id,person)
  assert.equal(rows[0].old_name,before.name)
  assert.equal(rows[0].old_handle,before.handle)
  assert.equal(rows[0].proposed_name,winner.name)
  assert.equal(rows[0].proposed_handle,winner.handle)
  assert.equal(rows[0].status,"pending_review")
  assert.equal(rows[0].action,"organization.store_rename_requested")
  assert.equal(rows[0].actor_person_id,person)
  assert.ok(rows[0].outbox_id&&rows[0].source_audit_event_id)
  const loserEffects=await q(`select
    (select count(*)::int from da_store_rename_request where id=$1) requests,
    (select count(*)::int from da_audit_event
      where action='organization.store_rename_requested'
        and new_values->>'request_id'=$1) audits,
    (select count(*)::int from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.action='organization.store_rename_requested'
        and e.new_values->>'request_id'=$1) outboxes`,[loser.request_id])
  assert.deepEqual(loserEffects,[{requests:0,audits:0,outboxes:0}],
    "Losing concurrent request cannot persist request/audit/outbox")
  assert.deepEqual((await q("select name,handle,status,approved_at from seller where id=$1",
    [storeId]))[0],before,"Concurrent pending requests cannot mutate native Seller")
  process.stdout.write("PASS B22 Chrome/PG16: simultaneous distinct-id Store rename requests 201+409, one pending PG row and audit/outbox, loser zero effects and native Seller unchanged\n")
}


/** The approved B22 rename changes the native name AND URL under the existing
 * Seller identity, with immutable history and a 30-calendar-day former-name
 * claim. Only disposable Chrome and PG16 resources are used.
 */
export async function verifyPlatformStoreRenameApproval(
  owner:B06Chrome,reviewer:B06Chrome,org:string,storeId:string,
  q:(sql:string,params?:any[])=>Promise<any[]>,
  databaseUrl:string,container:any
):Promise<void>{
  const pending=await q(`select id,old_name,old_handle,proposed_name,proposed_handle
    from da_store_rename_request where organization_id=$1 and seller_id=$2
      and status='pending_review'`,[org,storeId])
  assert.equal(pending.length,1)
  const request=pending[0]
  const before=(await q("select id,name,handle,status,approved_at from seller where id=$1",
    [storeId]))[0]
  assert.equal(before.id,storeId)
  assert.equal(before.name,request.old_name)
  assert.equal(before.handle,request.old_handle)
  const proposal={action:"approve",request_id:request.id,seller_id:storeId}
  // A business Owner never inherits platform Store approval authority.
  const ownerDenied=await owner.eval(`(async()=>{
    const s=await(await fetch('/personal/session')).json()
    const r=await fetch('/platform/store-renames',{
      method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
      body:JSON.stringify(${JSON.stringify(proposal)})
    });return r.status
  })()`)
  assert.equal(ownerDenied,403)
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  const csrfDenied=await reviewer.eval(`(async()=>{
    const r=await fetch('/platform/store-renames',{
      method:'POST',headers:{'content-type':'application/json','x-csrf-token':'wrong'},
      body:JSON.stringify(${JSON.stringify(proposal)})
    });return r.status
  })()`)
  assert.equal(csrfDenied,403)
  assert.equal((await q("select status from da_store_rename_request where id=$1",
    [request.id]))[0].status,"pending_review")
  await reviewer.click("#store-rename-review-refresh")
  await reviewer.wait("!document.getElementById('store-rename-review-panel').hidden && "+
    "Array.from(document.querySelectorAll('#store-rename-review-list > div'))"+
    ".some(e=>e.textContent.includes("+JSON.stringify(request.proposed_name)+"))")
  // #289: Two independently authenticated Chrome actors must really WAIT
  // on the SAME Seller advisory lock. Do not infer concurrency from promises.
  const barrier=new Client({connectionString:databaseUrl})
  const probe=new Client({connectionString:databaseUrl})
  await barrier.connect();await probe.connect()
  let barrierHeld=false,probeHeld=false
  let ownerRace:Promise<{value?:{status:number};error?:string}>|undefined
  const competing={request_id:"dasrn_"+randomBytes(16).toString("hex"),
    organization_id:org,seller_id:storeId,name:request.proposed_name,
    handle:request.proposed_handle,risk_acknowledged:true,
    risk_version:"store-rename-risks-v2"}
  const waiters=async()=>Number((await q(`select count(*)::int n from pg_locks
    where locktype='advisory' and not granted and objsubid=2
    and classid=hashtext('b22-store-rename')::oid
    and objid=hashtext($1)::oid`,[storeId]))[0].n)
  try{
    await barrier.query("BEGIN");barrierHeld=true
    await barrier.query("select pg_advisory_xact_lock(hashtext('b22-store-rename'),hashtext($1))",
      [storeId])
    ownerRace=owner.callFunction(
      "async function(payload){const sess=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/organization/store-rename-requests',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':sess.csrf_token},"+
      "body:payload,signal:AbortSignal.timeout(30000)});return {status:r.status}}",
      JSON.stringify(competing)).then(value=>({value}),error=>({error:String(error)}))
    await until(async()=>await waiters()>=1,15000,
      "#289 real Owner POST must wait for its Seller advisory lock")
    // Original P1 had Owner Seller FOR SHARE before advisory. NOWAIT proves
    // Seller is still unlocked while the Owner is waiting for advisory.
    await probe.query("BEGIN");probeHeld=true
    await probe.query("select id from seller where id=$1 for update nowait",[storeId])
    await probe.query("ROLLBACK");probeHeld=false
    // Staff approves via its existing REAL browser form, not an internal API.
    // Real Staff decision button; accept only the browser confirm prompt in the
    // disposable test, without changing production permissions or cookie state.
    const clicked=await reviewer.eval(`(()=>{
      const row=Array.from(document.querySelectorAll('#store-rename-review-list > div'))
        .find(e=>e.textContent.includes(${JSON.stringify(request.proposed_name)}))
      const button=Array.from(row?.querySelectorAll('button')??[])
        .find(b=>b.textContent.includes('Yeni ad ve bağlantıyı onayla'))
      if(!button||button.disabled)return false
      const original=window.confirm
      window.confirm=()=>true
      try{button.click()}finally{window.confirm=original}
      return true
    })()`)
    assert.equal(clicked,true,"Visible Staff approval UI must submit once")
    await until(async()=>await waiters()>=2,15000,
      "#289 two real Owner/Staff HTTP operations must wait on the same PG16 lock")
    await barrier.query("COMMIT");barrierHeld=false
    const ownerResult=await ownerRace
    assert.equal(ownerResult.error,undefined,ownerResult.error||"Owner response must finish")
    assert.ok([400,409].includes(ownerResult.value?.status??-1),
      "Competing Owner POST must reject pending request or unchanged approved name")
    await reviewer.wait("document.getElementById('store-rename-review-status').textContent.includes('etkinleşti')")
    assert.ok(reviewer.http.some((x:any)=>x.method==='POST'&&
      x.path==='/platform/store-renames'&&x.status===200),
      "Staff native approval must produce real HTTPS 200")
    const [extraRequest]=await q("select count(*)::int n from da_store_rename_request where id=$1",
      [competing.request_id])
    assert.equal(extraRequest.n,0,"Losing Owner request must write no second pending row")
    const [extraAudit]=await q(`select count(*)::int n from da_audit_event
      where action='organization.store_rename_requested'
      and new_values->>'request_id'=$1`,[competing.request_id])
    assert.equal(extraAudit.n,0,"Losing Owner request must write no audit")
  }finally{
    if(probeHeld)await probe.query("ROLLBACK")
    if(barrierHeld)await barrier.query("ROLLBACK")
    await Promise.allSettled([ownerRace].filter(Boolean) as Promise<any>[])
    await probe.end();await barrier.end()
  }
  process.stdout.write("PASS B22 Chrome: #289 Owner versus Staff rename same PG16 lock, 2 observed advisory waiters, Seller NOWAIT free, HTTP200 Staff and Owner400/409, zero losing writes\n")

  const after=(await q("select id,name,handle,status,approved_at from seller where id=$1",
    [storeId]))[0]
  assert.equal(after.id,before.id,"Rename must not create or replace Store")
  assert.equal(after.name,request.proposed_name)
  assert.equal(after.handle,request.proposed_handle)
  assert.equal(after.status,"open")
  assert.equal(String(after.approved_at),String(before.approved_at))
  const proof=await q(`select r.status,r.approved_at,a.name_claim_released_at,
    (a.name_claim_released_at=r.approved_at+interval '30 days') as hold_exact,
    e.action,x.id outbox_id
    from da_store_rename_request r
    join da_store_application a on a.seller_id=r.seller_id
    join da_audit_event e on e.organization_id=r.organization_id
      and e.target_id=r.seller_id and e.action='organization.store_rename_approved'
      and e.new_values->>'request_id'=r.id
    join da_audit_outbox x on x.source_audit_event_id=e.id
    where r.id=$1`,[request.id])
  assert.equal(proof.length,1,"Exactly one canonical rename decision and audit/outbox")
  assert.equal(proof[0].status,"approved")
  assert.ok(proof[0].approved_at&&proof[0].name_claim_released_at&&proof[0].outbox_id)
  assert.equal(proof[0].hold_exact,true,"Database-calculated 30-day boundary must be exact")
  // Future name claims must still see the original name as held before day 30.
  const blocked=await q(`select count(*)::int n from da_store_application
    where seller_id=$1 and store_name_hash is not null
      and name_claim_released_at>clock_timestamp()`,[storeId])
  assert.equal(blocked[0].n,1)
  // Exercise the real Owner Store application HTTP path at day 29 and after
  // day 30. Advance only task-owned disposable rows (never a production clock).
  const reuseId="daapp_"+randomBytes(16).toString("hex")
  const reuse={application_id:reuseId,organization_id:org,name:request.old_name,
    email:"b22-reuse-"+randomBytes(9).toString("hex")+"@example.invalid",
    currency_code:"eur"}
  const submitReuse=()=>owner.eval(`(async()=>{
    const s=await(await fetch('/personal/session')).json()
    const r=await fetch('/organization/store-applications',{
      method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
      body:JSON.stringify(${JSON.stringify(reuse)})
    });return {status:r.status,body:await r.json()}
  })()`)
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  assert.equal((await submitReuse()).status,409,"The vacated name is still held")
  await q(`update da_store_rename_request set approved_at=clock_timestamp()-interval '29 days'
    where id=$1`,[request.id])
  await q(`update da_store_application set name_claim_released_at=
    clock_timestamp()+interval '1 day' where seller_id=$1`,[storeId])
  assert.equal((await submitReuse()).status,409,"Day 29 must reject a second Store")
  assert.equal((await q("select count(*)::int n from da_store_application where id=$1",
    [reuseId]))[0].n,0,"Denied application leaves no committed claim")
  await q(`update da_store_rename_request set approved_at=clock_timestamp()-interval '30 days 1 second'
    where id=$1`,[request.id])
  await q(`update da_store_application set name_claim_released_at=
    clock_timestamp()-interval '1 second' where seller_id=$1`,[storeId])
  const afterExpiry=await submitReuse()
  assert.equal(afterExpiry.status,201,
    "After the 30-day hold the new *application* is possible, not auto-approved")
  assert.notEqual(afterExpiry.body.seller_id,storeId,"Historical Store identity never transfers")
  const reused=(await q("select name,handle,status,approved_at from seller where id=$1",
    [afterExpiry.body.seller_id]))[0]
  assert.equal(reused.name,request.old_name)
  assert.equal(reused.handle,request.old_handle)
  assert.equal(reused.status,"pending_approval")
  assert.equal(reused.approved_at,null)
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  const again=await reviewer.eval(`(async()=>{
    const s=await(await fetch('/personal/session')).json()
    const r=await fetch('/platform/store-renames',{
      method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
      body:JSON.stringify(${JSON.stringify(proposal)})
    });return r.status
  })()`)
  assert.equal(again,409,"Second approval must not repeat native name change")
  const ret=await reviewer.eval(`(async()=>{
    const s=await(await fetch('/personal/session')).json()
    const r=await fetch('/platform/store-renames',{
      method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
      body:JSON.stringify(${JSON.stringify({...proposal,action:"reject",
        reason:"Previously approved Store cannot also be rejected"})})
    });return r.status
  })()`)
  assert.equal(ret,409,"An approved rename may not be rejected")
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  const history=await owner.callFunction(
    "async function(org,seller){const r=await fetch('/organization/store-rename-requests?'+new URLSearchParams({organization_id:org,seller_id:seller}));return {status:r.status,body:await r.json()}}",
    org,storeId)
  assert.equal(history.status,200)
  assert.equal(history.body.requests.find((x:any)=>x.id===request.id)?.status,"approved")
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: Staff approves native Seller name+handle via real UI; same Store identity, Owner private readback, original name+URL held 30 days, Owner/CSRF/repeat/conflicting reject denied, one durable audit/outbox\n")
  // Continue from the real A->B native approval with repeated lawful B
  // history. Keep this out of the huge top-level B22 TypeScript function.
  await verifyRepeatedApprovedStoreRenameHistory({
    owner,reviewer,organizationId:org,sellerId:storeId,q,
    suspend:async()=>{await suspendSellerWorkflow(container).run({input:{
      seller_id:storeId,reason:"B22 disposable repeated-name native reactivation"
    }})}
  })
}




/** B22 task-only fixture: a real approved native rename precedes the
 * exceptional name-right assignment. Kept outside the main acceptance body
 * so the oversized full-platform script stays within TypeScript CFA limits.
 */
export async function preparePreviouslyRenamedStoreForTransfer(input:{
  owner:B06Chrome;reviewer:B06Chrome;organizationId:string;
  organizationName:string;sellerId:string;rand:string;container:any;
  q:(sql:string,params?:any[])=>Promise<any[]>
}):Promise<void>{
  const {owner,reviewer,organizationId,organizationName,sellerId,rand,container,q}=input
  await verifySuspendedStoreRenameBeforeReopen(
    owner,reviewer,organizationId,organizationName,sellerId,
    rand+"-prior",container,q,true)
  await suspendSellerWorkflow(container).run({input:{
    seller_id:sellerId,reason:"B22 disposable previously-renamed transfer proof"
  }})
  assert.equal((await q("select status from seller where id=$1",
    [sellerId]))[0].status,"suspended")
}

/** The currently approved but suspended native Seller can receive a distinct
 * Owner-requested, Staff-approved name without being silently activated.
 * A separate, explicit Staff unsuspend is required; all operations use real
 * Chrome/HTTPS/PG16 against the disposable task-owned Store.
 */
export async function verifySuspendedStoreRenameBeforeReopen(
  owner:B06Chrome,reviewer:B06Chrome,organizationId:string,
  organizationName:string,sellerId:string,rand:string,
  container:any,q:(sql:string,params?:any[])=>Promise<any[]>,
  alreadySuspended=false
):Promise<void>{
  const before=(await q("select id,name,handle,status,approved_at from seller where id=$1",
    [sellerId]))[0]
  assert.equal(before.status,alreadySuspended?"suspended":"open")
  assert.ok(before.approved_at)
  const name="B22 Askıdan Sonra "+rand
  const handle=("b22-aski-"+rand).toLowerCase().replace(/[^a-z0-9-]/g,"")
  if(!alreadySuspended)await suspendSellerWorkflow(container).run({input:{
    seller_id:sellerId,reason:"B22 task-only suspended name change"
  }})
  assert.equal((await q("select status from seller where id=$1",[sellerId]))[0].status,
    "suspended")
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  await owner.select(organizationName,"owner")
  await owner.wait("!document.getElementById('store-rename-panel').hidden && "+
    "Array.from(document.getElementById('store-rename-form').elements.namedItem('seller_id').options).some(o=>o.value==="+
    JSON.stringify(sellerId)+") && !document.querySelector('#store-rename-form button[type=submit]').disabled")
  const requested=await owner.callFunction(
    "async function(id,name,handle){const f=document.getElementById('store-rename-form');"+
    "f.elements.namedItem('seller_id').value=id;"+
    "f.elements.namedItem('name').value=name;"+
    "f.elements.namedItem('handle').value=handle;"+
    "f.elements.namedItem('risk_acknowledged').checked=true;"+
    "const valid=f.checkValidity();if(valid)f.requestSubmit();return valid}",
    sellerId,name,handle)
  assert.equal(requested,true,"Owner native HTML form validity must hold before submission")
  try{
    await owner.wait("Array.from(document.querySelectorAll('#store-rename-history p')).some("+
      "p=>p.textContent.includes("+JSON.stringify(name)+") && p.textContent.includes('Platform incelemesinde'))")
  }catch(error){
    // Log bounded status categories ONLY, never Store names, request bodies,
    // private Person details, cookies, error text or identifiers.
    const http=owner.http.filter((x:any)=>x.path==="/organization/store-rename-requests")
      .slice(-4).map((x:any)=>({method:x.method,status:x.status}))
    const ui=await owner.callFunction(
      "function(){const f=document.getElementById('store-rename-form');"+
      "const x=document.getElementById('store-rename-status')?.textContent??'';"+
      "return {valid:!!f?.checkValidity(),disabled:!!f?.querySelector('button[type=submit]')?.disabled,"+
      "state:x.includes('Başvuru reddedildi')?'rejected':"+
      "x.includes('Sonuç belirsiz')?'uncertain':"+
      "x.includes('Talep kaydedildi')?'saved':"+
      "x.includes('Mevcut talep incelemede')?'pending':"+
      "x.includes('doğrulanamadı')?'unverified':'other'}}")
    const rows=await q(`select status from da_store_rename_request
      where organization_id=$1 and seller_id=$2 and proposed_name=$3
        and proposed_handle=$4`,[organizationId,sellerId,name,handle])
    const [candidate]=await q(`select encode(sha256(convert_to(lower(
      regexp_replace(btrim(normalize($1,NFKC)),'[[:space:]]+',' ','g')),
      'UTF8')),'hex') as hash`,[name])
    const hash=candidate.hash as string
    const n=async(sql:string,values:any[])=>Number((await q(sql,values))[0].n)
    const conflicts={
      pending:await n("select count(*)::int n from da_store_rename_request where seller_id=$1 and status in ('pending_review','approving')",[sellerId]),
      application:await n(`select count(*)::int n from da_store_application
        where store_name_hash=$1 and
          (name_claim_released_at is null or name_claim_released_at>clock_timestamp())
          and (seller_id is null or seller_id<>$2)`,[hash,sellerId]),
      native:await n(`select count(*)::int n from seller where id<>$1
        and (deleted_at is null or deleted_at>clock_timestamp()-interval '30 days')
        and (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(name,NFKC)),
        '[[:space:]]+',' ','g')),'UTF8')),'hex')=$2 or lower(handle)=$3)`,
        [sellerId,hash,handle]),
      renameHold:await n(`select count(*)::int n from da_store_rename_request r
        where (r.status='approving' or (r.status='approved' and
          r.approved_at>clock_timestamp()-interval '30 days'))
        and ((encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(r.old_name,NFKC)),
          '[[:space:]]+',' ','g')),'UTF8')),'hex')=$1 or r.old_handle=$2)
          or (r.status='approving' and
          (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(r.proposed_name,NFKC)),
          '[[:space:]]+',' ','g')),'UTF8')),'hex')=$1 or r.proposed_handle=$2)))`,
        [hash,handle]),
      transferReservation:await n(`select count(*)::int n from da_store_name_transfer
        where status='assigned' and target_seller_id<>$1
          and (name_hash=$2 or old_handle=$3)`,[sellerId,hash,handle])
    }
    // Only numeric conflict classes; never expose identifiers, names or
    // reasons in a public CI log.
    throw new Error("B22 Owner transferred-Store rename did not become pending: "+
      JSON.stringify({http,ui,durable:{count:rows.length,
        statuses:rows.map((x:any)=>x.status)},conflicts}))
  }
  // The real Owner form generates the opaque id in the browser. Query
  // the exact new, source-owned request rather than fabricating its id.
  const pending=await q(`select id,status from da_store_rename_request
    where organization_id=$1 and seller_id=$2 and proposed_name=$3
      and proposed_handle=$4 and status='pending_review'`,
    [organizationId,sellerId,name,handle])
  assert.equal(pending.length,1)
  assert.match(pending[0].id,/^dasrn_[a-f0-9]{32}$/)
  assert.equal(pending[0].status,"pending_review")
  const requestId=pending[0].id as string
  const afterRequest=(await q("select id,name,handle,status,approved_at from seller where id=$1",
    [sellerId]))[0]
  assert.equal(afterRequest.status,"suspended")
  assert.equal(afterRequest.name,before.name)
  assert.equal(afterRequest.handle,before.handle)
  const decision={action:"approve",request_id:requestId,seller_id:sellerId}
  const unauthorized=await owner.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/platform/store-renames',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return r.status}",JSON.stringify(decision))
  assert.equal(unauthorized,403,"An Owner cannot approve even a suspended Store rename")
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  const invalidCsrf=await reviewer.callFunction(
    "async function(payload){const r=await fetch('/platform/store-renames',"+
    "{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'invalid'},"+
    "body:payload});return r.status}",JSON.stringify(decision))
  assert.equal(invalidCsrf,403)
  const forged=await reviewer.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/platform/store-renames',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return r.status}",JSON.stringify({...decision,organization_id:organizationId}))
  assert.equal(forged,400,"Staff request may not fabricate Organization authority")
  await reviewer.click("#store-rename-review-refresh")
  await reviewer.wait("Array.from(document.querySelectorAll('#store-rename-review-list > div')).some("+
    "e=>e.textContent.includes("+JSON.stringify(name)+") && e.textContent.includes('Askıda'))")
  const queue=await reviewer.callFunction(
    "async function(id){const r=await fetch('/platform/store-renames?page=0');"+
    "const b=await r.json();return {status:r.status,row:b.pending?.find(x=>x.request_id===id)}}",
    requestId)
  assert.equal(queue.status,200)
  assert.equal(queue.row?.seller_status,"suspended",
    "Private Staff queue must identify that approval cannot open the Store")
  const clicked=await reviewer.callFunction(
    "function(name){const row=Array.from(document.querySelectorAll('#store-rename-review-list > div'))"+
    ".find(e=>e.textContent.includes(name));const b=Array.from(row?.querySelectorAll('button')??[])"+
    ".find(x=>x.textContent.includes('Yeni ad ve bağlantıyı onayla'));"+
    "if(!b||b.disabled)return false;const original=window.confirm;window.confirm=()=>true;"+
    "try{b.click()}finally{window.confirm=original}return true}",name)
  assert.equal(clicked,true)
  await reviewer.wait("document.getElementById('store-rename-review-status').textContent.includes('Mağaza hâlâ askıda')")
  const changed=(await q("select id,name,handle,status,approved_at from seller where id=$1",
    [sellerId]))[0]
  assert.equal(changed.id,before.id)
  assert.equal(changed.name,name)
  assert.equal(changed.handle,handle)
  assert.equal(changed.status,"suspended","Approval must never silently unsuspend")
  assert.equal(String(changed.approved_at),String(before.approved_at))
  const proof=await q(`select r.status,r.approved_at,e.id audit_id,x.id outbox_id
    from da_store_rename_request r
    join da_audit_event e on e.organization_id=r.organization_id
      and e.target_id=r.seller_id and e.action='organization.store_rename_approved'
      and e.new_values->>'request_id'=r.id
    join da_audit_outbox x on x.source_audit_event_id=e.id
    where r.id=$1`,[requestId])
  assert.equal(proof.length,1)
  assert.equal(proof[0].status,"approved")
  assert.ok(proof[0].approved_at&&proof[0].audit_id&&proof[0].outbox_id)
  assert.equal(await reviewer.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/platform/store-renames',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return r.status}",JSON.stringify(decision)),409,
    "The same approval cannot be replayed")
  const application=(await q("select id from da_store_application where seller_id=$1",[sellerId]))[0]
  assert.ok(application?.id)
  const openAction={action:"unsuspend",application_id:application.id,seller_id:sellerId}
  const ownerOpen=await owner.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/platform/stores',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return r.status}",JSON.stringify(openAction))
  assert.equal(ownerOpen,403,"Owner still cannot self-approve an open Store")
  const staffOpened=await reviewer.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/platform/stores',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return {status:r.status,body:await r.json()}}",
    JSON.stringify(openAction))
  assert.equal(staffOpened.status,200,"A separate authorized Staff decision opens the Seller")
  assert.equal(staffOpened.body?.status,"open")
  const reopened=(await q("select id,name,handle,status,approved_at from seller where id=$1",
    [sellerId]))[0]
  assert.equal(reopened.id,before.id)
  assert.equal(reopened.name,name)
  assert.equal(reopened.handle,handle)
  assert.equal(reopened.status,"open")
  assert.equal(String(reopened.approved_at),String(before.approved_at))
  assert.equal((await reviewer.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/platform/stores',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return r.status}",JSON.stringify(openAction))),409)
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: suspended Store Owner requests new name, Staff approves unchanged Store ID and suspended status with one audit/outbox, explicit later Staff unsuspend succeeds; Owner/CSRF/forged/replay denied\n")
}

/** Disposable real Staff/Owner UI + PostgreSQL: only a previously approved
 * suspended Store retaining its verified name/handle may be reopened. */
export async function verifyStaffReopensSuspendedStore(
  owner:B06Chrome,reviewer:B06Chrome,organizationId:string,organizationName:string,
  sellerId:string,container:any,q:(sql:string,params?:any[])=>Promise<any[]>
):Promise<void>{
  const before=(await q("select id,name,handle,status,approved_at from seller where id=$1",
    [sellerId]))[0]
  assert.equal(before.status,"open")
  assert.ok(before.approved_at)
  // Earlier real A-B-C-B reactivation is retained as canonical history.
  // Validate exactly ONE new record per decision relative to that baseline.
  const [baseline]=await q(`select
    (select count(*)::int from da_audit_event
      where action='organization.store_reactivation_claimed'
        and organization_id=$1 and target_id=$2) as claims,
    (select count(*)::int from da_audit_event
      where action='organization.store_reactivated'
        and organization_id=$1 and target_id=$2) as completed`,
    [organizationId,sellerId])
  assert.ok(baseline&&Number.isInteger(baseline.claims)&&
    Number.isInteger(baseline.completed))
  const initialClaims=baseline.claims as number
  const initialCompleted=baseline.completed as number
  const original=(await q(`select id from da_store_application where seller_id=$1
    and organization_id=$2 and status='created'`,[sellerId,organizationId]))
  assert.equal(original.length,1)
  const target={action:"unsuspend" as const,application_id:original[0].id,seller_id:sellerId}
  const approvedRename=(await q(`select id,proposed_handle from da_store_rename_request
    where seller_id=$1 and status='approved' and proposed_name=$2
      and proposed_handle=$3`,[sellerId,before.name,before.handle]))[0]
  assert.ok(approvedRename?.id,"The current name must have an actual approved rename origin")
  await suspendSellerWorkflow(container).run({input:{
    seller_id:sellerId,reason:"B22 disposable Staff reactivation acceptance"
  }})
  assert.equal((await q("select status from seller where id=$1",[sellerId]))[0].status,
    "suspended")
  const post=async(actor:B06Chrome,payload:Record<string,unknown>,csrfValid=true,
    forgedHeader=false)=>actor.eval(`(async()=>{
      const sess=await(await fetch('/personal/session')).json()
      const r=await fetch('/platform/stores',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':${csrfValid?"sess.csrf_token":"'forged'"},
          ${forgedHeader?"'x-seller-id':'"+sellerId+"',":""}},
        body:JSON.stringify(${JSON.stringify(payload)})
      });return {status:r.status,body:await r.json()}
    })()`)
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  assert.equal((await post(owner,target)).status,403,"Company Owner cannot act as platform Staff")
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  assert.equal((await post(reviewer,target,false)).status,403)
  assert.equal((await post(reviewer,target,true,true)).status,403)
  assert.equal((await post(reviewer,{...target,organization_id:organizationId})).status,400,
    "A forged Organization field cannot supply Staff resource authority")
  assert.equal((await post(reviewer,{...target,application_id:"daapp_"+"f".repeat(32)})).status,403,
    "A different application cannot reactivate this Seller")
  // Simulate a missing historical name entitlement in this disposable DB.
  // Do NOT write a second live Seller name that violates native uniqueness.
  try{
    await q("update da_store_rename_request set proposed_handle=$1 where id=$2",
      ["b22-invalid-name-provenance",approvedRename.id])
    assert.equal((await post(reviewer,target)).status,409,
      "A Seller with unverified/reassigned name history must stay suspended")
    // Existing Chrome/HTTPS/PG16 negative, NOT a real name-right transfer:
    // the deliberately corrupted source audit must mark the Staff UI as
    // review-only; a button which could trigger native reopen is forbidden.
    await reviewer.click("#store-approval-refresh")
    await reviewer.wait("Array.from(document.querySelectorAll('#store-reactivation-list p'))"+
      ".some(e=>e.textContent.includes("+JSON.stringify(sellerId)+") && "+
      "e.textContent.includes('Ad/URL hakkı doğrulanamadı') && "+
      "e.querySelector('button')?.disabled===true)")
    // Real accessible live panel state (invalid name-right, action disabled).
    // Axe never reads/logs private DOM nodes outside this authenticated Chrome.
    await assertWcag22AxeInChrome(reviewer,"#store-approval-panel",
      "staff-reactivation-review-only")
    const wcagKeyboardBefore=reviewer.http.filter(r=>
      r.path==="/platform/stores" && r.method==="GET").length
    await reviewer.eval("document.getElementById('store-approval-refresh').focus()")
    assert.equal(await reviewer.eval(
      "document.activeElement?.id==='store-approval-refresh'"),true,
      "Staff refresh must be keyboard-focusable")
    await reviewer.send("Input.dispatchKeyEvent",{
      type:"keyDown",key:" ",code:"Space",text:" ",windowsVirtualKeyCode:32})
    await reviewer.send("Input.dispatchKeyEvent",{
      type:"keyUp",key:" ",code:"Space",windowsVirtualKeyCode:32})
    await until(async()=>reviewer.http.filter(r=>
      r.path==="/platform/stores" && r.method==="GET").length>
      wcagKeyboardBefore,12000,"real Space refresh GET")
    await reviewer.wait("Array.from(document.querySelectorAll('#store-reactivation-list p'))"+
      ".some(e=>e.textContent.includes("+JSON.stringify(sellerId)+") && "+
      "e.textContent.includes('Ad/URL hakkı doğrulanamadı') && "+
      "e.querySelector('button')?.disabled===true)")
    process.stdout.write("PASS WCAG 2.2 partial keyboard: live Staff refresh Space invokes authorized GET, unsafe reopen remains disabled\n")
    const preflight=await reviewer.callFunction(
      "async function(id){const r=await fetch('/platform/stores?page=0');"+
      "return {status:r.status,body:await r.json(),id}}",sellerId)
    assert.equal(preflight.status,200)
    assert.equal(preflight.body.suspended.find((s:any)=>s.seller_id===sellerId)
      ?.name_review_required,true,
      "A suspended Store with unverified name-right proof must be review-only")
    assert.equal((await q("select status from seller where id=$1",[sellerId]))[0].status,
      "suspended")
  }finally{
    await q("update da_store_rename_request set proposed_handle=$1 where id=$2",
      [approvedRename.proposed_handle,approvedRename.id])
  }
  // Closing NEW applications must not silently close already approved Stores.
  await q("update da_organization set store_application_enabled=false where id=$1",
    [organizationId])
  try{
    await reviewer.click("#store-approval-refresh")
    // A prior invalid-name response still has a visible *disabled* button.
    // A mere button-exists check can race the fresh GET and use that stale row.
    // Wait for the verified eligible state before the actual native opening.
    await reviewer.wait("Array.from(document.querySelectorAll('#store-reactivation-list p'))"+
      ".some(e=>e.textContent.includes("+JSON.stringify(sellerId)+") && "+
      "!e.textContent.includes('Ad/URL hakkı doğrulanamadı') && "+
      "e.querySelector('button')?.disabled===false)")
    const clicked=await reviewer.eval(`(()=>{
      const line=Array.from(document.querySelectorAll('#store-reactivation-list p'))
        .find(e=>e.textContent.includes(${JSON.stringify(sellerId)}))
      const button=line?.querySelector('button')
      if(!button||button.disabled)return false
      const previous=window.confirm
      window.confirm=()=>true
      try{button.click()}finally{window.confirm=previous}
      return true
    })()`)
    assert.equal(clicked,true,"The actual visible Staff button must submit the unsuspend decision")
    await reviewer.wait("document.getElementById('store-approval-status').textContent.includes('aynı kimlikle yeniden açıldı')")
    const after=(await q("select id,name,handle,status,status_reason,approved_at from seller where id=$1",
      [sellerId]))[0]
    assert.equal(after.id,before.id)
    assert.equal(after.name,before.name)
    assert.equal(after.handle,before.handle)
    assert.equal(after.status,"open")
    assert.equal(after.status_reason,null)
    assert.equal(String(after.approved_at),String(before.approved_at))
    const audited=await q(`select e.id,x.id as outbox_id,e.actor_person_id,e.new_values
      from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.action='organization.store_reactivated'
        and e.organization_id=$1 and e.target_id=$2
      order by e.occurred_at,e.id`,[organizationId,sellerId])
    assert.equal(audited.length,initialCompleted+1,
      "Exactly one new completed canonical audit/outbox")
    const lastAudit=audited[audited.length-1]
    assert.equal(lastAudit.new_values.application_id,target.application_id)
    assert.equal(lastAudit.new_values.resolution_confirmed,true)
    assert.ok(lastAudit.outbox_id)
    const notices=await q(`select count(*)::int n from da_notification_receipt n
      where n.audit_event_id=$1`,[lastAudit.id])
    assert.ok(notices[0].n>=1,"The current Owner has a private receipt")
    assert.equal((await post(reviewer,target)).status,409,"Replay must not open a second time")
    assert.equal((await q(`select count(*)::int n from da_audit_event
      where action='organization.store_reactivated' and target_id=$1`,
      [sellerId]))[0].n,initialCompleted+1)
    await owner.send("Page.bringToFront")
    await owner.wait("document.visibilityState==='visible'")
    await owner.select(organizationName,"owner")
    await owner.wait("document.getElementById('org-stores').textContent.includes("+
      JSON.stringify(before.name)+")")
    const notification=await owner.callFunction(
      "async function(org){const r=await fetch('/organization/notifications?organization='+encodeURIComponent(org));return {status:r.status,body:await r.json()}}",
      organizationId)
    assert.equal(notification.status,200,"The current protected Owner may read private reactivation notice")
    assert.ok(notification.body.notifications.some((n:any)=>
      n.title==="Mağaza yeniden açıldı" && n.context===organizationName),
      "The native Store reactivation audit receipt must appear in the actual Owner notification UI")
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: Staff safely unsuspends same approved Store via real UI; current name/handle/ID preserved, paused new applications allowed, forged/CSRF/Owner/name-conflict/replay denied, one durable audit/outbox and Owner readback\n")

    // A real Owner's already-pending rename is an additional competing
    // operation. It must NOT run while the next native opening is uncertain.
    const preReopenRename=await prepareRenameBeforeStoreReactivation({
      owner,organizationId,sellerId,q
    })
    // The next disposable suspension forces an audit/outbox failure AFTER
    // the native Seller becomes open. Its durable intent must survive so a
    // different authorized Staff may reconcile without native replay.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:sellerId,reason:"B22 task-only post-native completion fault"
    }})
    assert.equal((await q("select status from seller where id=$1",[sellerId]))[0].status,
      "suspended")
    await q(`create function b22_reactivation_audit_fault() returns trigger
      language plpgsql as $$
      begin
        if exists(select 1 from da_audit_event e
          where e.id=new.source_audit_event_id
            and e.action='organization.store_reactivated') then
          raise exception 'B22 isolated post-native reactivation audit failure';
        end if;
        return new;
      end;$$`)
    await q(`create trigger b22_reactivation_audit_fault
      before insert on da_audit_outbox for each row
      execute function b22_reactivation_audit_fault()`)
    try{
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      assert.equal((await post(reviewer,target)).status,503)
      assert.equal((await q("select status from seller where id=$1",[sellerId]))[0].status,
        "open","Never assume a native workflow rolled back after an audit failure")
      const claims=await q(`select e.id,x.id as outbox_id
        from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
        where e.action='organization.store_reactivation_claimed'
          and e.organization_id=$1 and e.target_id=$2
        order by e.occurred_at,e.id`,[organizationId,sellerId])
      assert.equal(claims.length,initialClaims+2,
        "Two more native opening attempts each require a durable claim")
      assert.ok(claims[claims.length-1].outbox_id)
      const completed=await q(`select id from da_audit_event
        where action='organization.store_reactivated'
          and organization_id=$1 and target_id=$2`,[organizationId,sellerId])
      assert.equal(completed.length,initialCompleted+1,
        "The injected second completion transaction must not partially commit")
      assert.equal((await post(reviewer,target)).status,409,
        "Do not unsuspend an already open native Seller again")
    }finally{
      await q("drop trigger if exists b22_reactivation_audit_fault on da_audit_outbox")
      await q("drop function if exists b22_reactivation_audit_fault()")
    }
    await verifyReactivationClaimFreezesRenames({
      owner,staff:reviewer,q,request:preReopenRename
    })
    await reviewer.click("#store-approval-refresh")
    await reviewer.wait("Array.from(document.querySelectorAll('#store-reactivation-list p'))"+
      ".some(e=>e.textContent.includes('denetim kaydı eksik') && !!e.querySelector('button'))")
    const reconciled=await reviewer.eval(`(()=>{
      const line=Array.from(document.querySelectorAll('#store-reactivation-list p'))
        .find(e=>e.textContent.includes('denetim kaydı eksik'))
      const button=line?.querySelector('button')
      if(!button||button.disabled)return false
      const previous=window.confirm
      window.confirm=()=>true
      try{button.click()}finally{window.confirm=previous}
      return true
    })()`)
    assert.equal(reconciled,true,"Real Staff UI should expose reconciliation, not native replay")
    await reviewer.wait("document.getElementById('store-approval-status').textContent.includes('karar kaydı ve Owner bildirimi tamamlandı')")
    const finished=await q(`select e.id,e.new_values->>'claim_audit_id' as claim_id,
        x.id as outbox_id
      from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.action='organization.store_reactivated'
        and e.organization_id=$1 and e.target_id=$2
      order by e.occurred_at,e.id`,[organizationId,sellerId])
    assert.equal(finished.length,initialCompleted+2,
      "Reconciled claim must add exactly one completed event")
    assert.notEqual(finished[finished.length-2].claim_id,
      finished[finished.length-1].claim_id)
    assert.ok(finished.every((v:any)=>v.outbox_id))
    const notices2=await q(`select count(*)::int n
      from da_notification_receipt where audit_event_id in
        (select id from da_audit_event
          where action='organization.store_reactivated'
            and organization_id=$1 and target_id=$2)`,[organizationId,sellerId])
    assert.ok(notices2[0].n>=initialCompleted+2,
      "Current Owner gets one private completion receipt per cycle")
    assert.equal((await post(reviewer,{...target,action:"reconcile"})).status,409)
    assert.equal((await post(reviewer,target)).status,409)
    assert.equal((await q(`select count(*)::int n from da_audit_event
      where action='organization.store_reactivated'
        and organization_id=$1 and target_id=$2`,[organizationId,sellerId]))[0].n,
      initialCompleted+2)
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: post-native reactivation audit failure preserves durable claim/outbox, Store open and HTTP503; real Staff UI reconciles with no second native opening, Owner notice persists once, replay denied\n")

    // Exact pre-native crash interval: commit the source-proven intent and
    // its outbox, but intentionally DO NOT invoke the Mercur workflow.
    // This simulates process termination between the existing committed
    // claim and the separate native run without a test-only production hook.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:sellerId,reason:"B22 task-only pre-native crash recovery"
    }})
    assert.equal((await q("select status from seller where id=$1",[sellerId]))[0].status,
      "suspended")
    const [stuck]=await q(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,organization_id,action,module,
       resource,target_id,role_context,new_values,occurred_at)
      select 'daaud_'||gen_random_uuid()::text,
        e.actor_person_id,e.actor_type,e.actor_id,e.organization_id,
        'organization.store_reactivation_claimed','dogruadres-access',
        'store-application',e.target_id,'platform_staff',
        jsonb_build_object('application_id',$1::text,'status','pending_native',
          'name',$2::text,'handle',$3::text,
          'staff_grant_id',e.new_values->>'staff_grant_id'),
        clock_timestamp()
      from da_audit_event e
      where e.action='organization.store_reactivation_claimed'
        and e.organization_id=$4 and e.target_id=$5
      order by e.occurred_at desc,e.id desc limit 1 returning id`,
      [target.application_id,before.name,before.handle,organizationId,sellerId])
    assert.ok(stuck?.id,"The last committed claim can be reproduced from a real authorized Staff claim")
    await q(`insert into da_audit_outbox
      (id,source_audit_event_id,source_module,envelope)
      values('daaob_'||gen_random_uuid()::text,$1,'dogruadres-access','{}'::jsonb)`,
      [stuck.id])
    const stuckRecord=await q(`select e.id,x.id outbox_id
      from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.action='organization.store_reactivation_claimed'`,
      [stuck.id])
    assert.equal(stuckRecord.length,1,"Pre-native claim and outbox are durably committed")
    assert.ok(stuckRecord[0].outbox_id)
    assert.equal((await q("select status from seller where id=$1",[sellerId]))[0].status,
      "suspended","No native Seller opening happened")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    assert.equal((await post(reviewer,target)).status,409,
      "A new unsuspend cannot bypass the earlier unresolved intent")
    assert.equal((await post(owner,{...target,action:"release"})).status,403,
      "Organization Owner cannot cancel a platform Staff decision")
    assert.equal((await post(reviewer,{...target,action:"release"},false)).status,403,
      "Release requires a valid CSRF token")
    assert.equal((await post(reviewer,{...target,action:"release",organization_id:organizationId})).status,400,
      "Release must never accept forged Organization fields")
    assert.equal((await post(reviewer,{...target,action:"release",
      application_id:"daapp_"+"f".repeat(32)})).status,403,
      "A foreign application cannot release a different Seller claim")
    assert.equal((await q("select status from seller where id=$1",[sellerId]))[0].status,
      "suspended")
    await reviewer.click("#store-approval-refresh")
    await reviewer.wait("Array.from(document.querySelectorAll('#store-reactivation-list p'))"+
      ".some(e=>e.textContent.includes('önceki açılma denemesi belirsiz') && !!e.querySelector('button'))")
    const released=await reviewer.eval(`(()=>{
      const row=Array.from(document.querySelectorAll('#store-reactivation-list p'))
        .find(e=>e.textContent.includes('önceki açılma denemesi belirsiz'))
      const button=row?.querySelector('button')
      if(!button||button.disabled)return false
      const original=window.confirm
      window.confirm=()=>true
      try{button.click()}finally{window.confirm=original}
      return true
    })()`)
    assert.equal(released,true,"Actual Staff UI offers the pre-native recovery action")
    await reviewer.wait("document.getElementById('store-approval-status').textContent.includes('deneme kayda geçirilerek kapatıldı')")
    assert.equal((await q("select status from seller where id=$1",[sellerId]))[0].status,
      "suspended","Releasing a committed intent cannot open or mutate the Seller")
    const releasedRows=await q(`select e.id,e.new_values->>'claim_audit_id' claim_id,
        x.id outbox_id
      from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.action='organization.store_reactivation_released'
        and e.organization_id=$1 and e.target_id=$2`,
      [organizationId,sellerId])
    assert.equal(releasedRows.length,1,"Release must preserve exactly one terminal audit/outbox")
    assert.equal(releasedRows[0].claim_id,stuck.id)
    assert.ok(releasedRows[0].outbox_id)
    assert.equal((await post(reviewer,{...target,action:"release"})).status,409,
      "A released pre-native claim cannot be released twice")
    assert.equal((await post(reviewer,{...target,action:"reconcile"})).status,409,
      "A Seller that remains suspended cannot be falsely reconciled as open")
    await reviewer.click("#store-approval-refresh")
    await reviewer.wait("Array.from(document.querySelectorAll('#store-reactivation-list p'))"+
      ".some(e=>e.textContent.includes("+JSON.stringify(sellerId)+") && "+
      "!!e.querySelector('button') && e.querySelector('button').textContent.includes('yeniden aç'))")
    // A distinct, newly authorized Staff decision can now reopen the Store.
    const newAttempt=await post(reviewer,target)
    assert.equal(newAttempt.status,200,
      "A different attempt can succeed after the source-proven suspended claim was released")
    assert.equal((await q("select status from seller where id=$1",[sellerId]))[0].status,
      "open")
    assert.equal((await post(reviewer,{...target,action:"release"})).status,409,
      "An already open Seller cannot release a prior claim")
    const releases=await q(`select count(*)::int n from da_audit_event
      where action='organization.store_reactivation_released'
        and organization_id=$1 and target_id=$2`,[organizationId,sellerId])
    assert.equal(releases[0].n,1)
    const completions=await q(`select count(*)::int n from da_audit_event
      where action='organization.store_reactivated'
        and organization_id=$1 and target_id=$2`,[organizationId,sellerId])
    assert.equal(completions[0].n,initialCompleted+3,
      "A released pre-native claim has no fake completion; new native opening has one")
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: pre-native crash retains suspended Seller and committed claim/outbox; real Staff UI releases intent with one terminal audit, Owner/CSRF/forgery/replay denied, no blind native retry; new authorized attempt succeeds\n")

  }finally{
    await q("update da_organization set store_application_enabled=true where id=$1",
      [organizationId])
  }
}

/** Real Owner HTTP/UI withdrawal of a pending change after the approved
 * rename journey. All data is task-owned; the actual Seller is unchanged.
 */
export async function verifyOwnerWithdrawPendingStoreRename(
  owner:B06Chrome,reviewer:B06Chrome,org:string,storeId:string,
  person:string,rand:string,q:(sql:string,params?:any[])=>Promise<any[]>
):Promise<void>{
  const before=(await q("select id,name,handle,status,approved_at from seller where id=$1",
    [storeId]))[0]
  assert.equal(before.status,"open")
  const requestId="dasrn_"+randomBytes(16).toString("hex")
  const name="B22 Withdraw "+rand
  const handle=("b22-withdraw-"+rand).toLowerCase().replace(/[^a-z0-9-]/g,"")
  const pending={request_id:requestId,organization_id:org,seller_id:storeId,
    name,handle,risk_acknowledged:true,risk_version:"store-rename-risks-v2"}
  const withdraw={action:"withdraw",request_id:requestId,
    organization_id:org,seller_id:storeId}
  const post=async(actor:B06Chrome,payload:Record<string,unknown>,
    badCsrf=false)=>actor.eval(`(async()=>{
    const sess=await(await fetch('/personal/session')).json()
    const r=await fetch('/organization/store-rename-requests',{
      method:'POST',headers:{'content-type':'application/json',
        'x-csrf-token':${badCsrf?"'wrong'":"sess.csrf_token"}},
      body:JSON.stringify(${JSON.stringify(payload)})
    })
    return {status:r.status,body:await r.json()}
  })()`)
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible' && "+
    "!document.getElementById('store-rename-panel').hidden")
  assert.equal((await post(owner,pending)).status,201)
  assert.equal((await q("select status from da_store_rename_request where id=$1",
    [requestId]))[0].status,"pending_review")
  assert.equal((await post(owner,withdraw,true)).status,403,
    "CSRF must block withdrawal before any write")
  assert.equal((await post(reviewer,withdraw)).status,403,
    "Platform Staff is not the requesting Owner")
  assert.equal((await post(owner,{...withdraw,organization_id:"daorg_foreign"})).status,403)
  assert.equal((await post(owner,{...withdraw,unexpected_field:true})).status,400)
  await owner.click("#store-rename-refresh")
  await owner.wait("Array.from(document.querySelectorAll('#store-rename-history div'))"+
    ".some(row=>row.textContent.includes("+JSON.stringify(name)+") && "+
    "row.querySelector('button')?.textContent.includes('Bekleyen talebi geri çek'))")
  const clicked=await owner.eval(`(()=>{
    const row=Array.from(document.querySelectorAll('#store-rename-history div'))
      .find(node=>node.textContent.includes(${JSON.stringify(name)}))
    const button=row?.querySelector('button')
    if(!button||button.disabled)return false
    const previous=window.confirm
    window.confirm=()=>true
    try{button.click()}finally{window.confirm=previous}
    return true
  })()`)
  assert.equal(clicked,true,"Real visible Owner control must submit withdrawal")
  await owner.wait("Array.from(document.querySelectorAll('#store-rename-history p'))"+
    ".some(p=>p.textContent.includes("+JSON.stringify(name)+") && "+
    "p.textContent.includes('Geri çekildi'))")
  const result=await q(`select r.status,r.requested_by_person_id,
    e.action,e.actor_person_id,x.id outbox_id
    from da_store_rename_request r
    join da_audit_event e on e.organization_id=r.organization_id
      and e.resource='store-rename-request'
      and e.target_id=r.seller_id
      and e.action='organization.store_rename_withdrawn'
      and e.new_values->>'request_id'=r.id
    join da_audit_outbox x on x.source_audit_event_id=e.id
    where r.id=$1`,[requestId])
  assert.equal(result.length,1,"One withdrawn status and canonical audit/outbox")
  assert.equal(result[0].status,"withdrawn")
  assert.equal(result[0].requested_by_person_id,person)
  assert.equal(result[0].actor_person_id,person)
  assert.ok(result[0].outbox_id)
  assert.deepEqual((await q("select id,name,handle,status,approved_at from seller where id=$1",
    [storeId]))[0],before,"Withdrawal must not update native Seller")
  assert.equal((await post(owner,withdraw)).status,409,"Withdrawal cannot repeat")
  assert.equal((await post(owner,{...pending,request_id:requestId})).status,409,
    "Old request key cannot reopen withdrawn decision")
  await reviewer.send("Page.bringToFront")
  const approval=await reviewer.eval(`(async()=>{
    const sess=await(await fetch('/personal/session')).json()
    const r=await fetch('/platform/store-renames',{
      method:'POST',headers:{'content-type':'application/json',
        'x-csrf-token':sess.csrf_token},
      body:JSON.stringify(${JSON.stringify({
        action:"approve",request_id:requestId,seller_id:storeId
      })})
    })
    return r.status
  })()`)
  assert.equal(approval,409,"A withdrawn request may never receive Staff approval")
  assert.equal((await q(`select count(*)::int n from da_audit_event
    where action='organization.store_rename_withdrawn'
      and new_values->>'request_id'=$1`,[requestId]))[0].n,1)
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  process.stdout.write("PASS B22 Chrome/PG16: requesting Owner withdraws pending Store rename via real UI; foreign/CSRF/forgery/replay and Staff approval denied, native Seller unchanged, one audit/outbox\n")
}

/** Actual Next.js 15 page and unmodified native Mercur Seller read on the
 * same disposable PG16 data after Staff approval. The PRODUCTION ingress is
 * intentionally closed to native public catalog (#217); assert that 401, then
 * use a restricted, task-only, loopback native GET loader. This tests Next
 * HTTP status without widening any real public API or claiming deployment.
 */
export async function verifyRealNextStorefrontRenameUrls(
  container:any,blockedOrigin:string,publishableKey:string,
  storeId:string,temporaryDirectory:string,
  q:(sql:string,params?:any[])=>Promise<any[]>
):Promise<void>{
  const rows=await q("select old_name,old_handle,proposed_name,proposed_handle "+
    "from da_store_rename_request where seller_id=$1 and status='approved' "+
    "order by approved_at desc,id desc",[storeId])
  assert.ok(rows.length>=2,
    "Native Storefront proof requires at least two preserved approved renames")
  // Repeated A->B->C->B->D is valid history, not a provenance conflict.
  // The entire ordered chain must still be contiguous and immutable; never
  // force a fixed total or hide older rows to make the native URL test pass.
  for(let i=0;i<rows.length-1;i++){
    assert.equal(rows[i].old_name,rows[i+1].proposed_name,
      "Every newer approved name must descend from the preceding historical name")
    assert.equal(rows[i].old_handle,rows[i+1].proposed_handle,
      "Every newer approved URL must descend from the preceding historical URL")
  }
  const rename=rows[0]
  const original=(await container.resolve("seller").listSellers({id:storeId}))[0]
  assert.equal(original.id,storeId)
  assert.equal(original.handle,rename.proposed_handle)
  assert.equal(original.name,rename.proposed_name)
  assert.notEqual(rename.old_handle,rename.proposed_handle)
  // The actual Storefront main layout checks country-to-Region mapping
  // before rendering any Seller page. Create a disposable supported Medusa
  // Region only if this isolated PG16 run does not already contain Germany.
  const regionService=container.resolve("region")
  const regions=await regionService.listRegions({},{relations:["countries"]})
  if(!regions.some((r:any)=>r.countries?.some((c:any)=>c.iso_2==="de"))){
    const {result:[testRegion]}=await createRegionsWorkflow(container).run({
      input:{regions:[{name:"B22 task-only Next HTTP locale",
        currency_code:"eur",countries:["de"],
        payment_providers:["pp_system_default"]}]}
    })
    assert.ok(testRegion?.id)
  }
  assert.match(rename.old_handle,/^[a-z0-9][a-z0-9-]*$/)
  assert.match(rename.proposed_handle,/^[a-z0-9][a-z0-9-]*$/)
  assert.match(blockedOrigin,/^http:\/\/127\.0\.0\.1:\d+$/)
  assert.ok(publishableKey.length>20)
  const liveIngress=await fetch(blockedOrigin+"/store/sellers?handle="+
    encodeURIComponent(rename.proposed_handle),{
    headers:{"x-publishable-api-key":publishableKey},
    redirect:"manual",signal:AbortSignal.timeout(15000)
  })
  assert.equal(liveIngress.status,401,
    "DoğruAdres native public Seller ingress stays denied by approved policy")

  // A private, disposable read-only native API proves the genuine Mercur
  // route and Next renderer without changing the product's 401 boundary.
  // Only public Seller/Offer/Region/Category GET routes may reach the disposable native loader; every other method/path is denied.
  const requireFramework=createRequire(require.resolve("@medusajs/framework"))
  const express=requireFramework("express")
  const nativeApp=express()
  nativeApp.disable("x-powered-by")
  nativeApp.use((req:any,res:any,next:any)=>{
    if(req.method!=="GET"||
       !/^\/store\/(sellers|offers|regions|product-categories)(?:\/|$)/.test(req.path)){
      res.status(404).end();return
    }
    req.scope=container.createScope()
    next()
  })
  const nativeRuntime=await expressLoader({app:nativeApp,container})
  const nativeServer=plainServer(nativeApp)
  try{
    await new ApiLoader({app:nativeApp,container,sourceDir:[
      join(dirname(require.resolve("@medusajs/medusa")),"api"),
      join(dirname(require.resolve("@mercurjs/core")),"api")
    ]}).load()
    await new Promise<void>((resolve,reject)=>{
      nativeServer.once("error",reject)
      nativeServer.listen(0,"127.0.0.1",resolve)
    })
    const backendOrigin="http://127.0.0.1:"+
      (nativeServer.address() as {port:number}).port
    const nativeSeller=async(handle:string)=>{
    const url=backendOrigin+"/store/sellers?"+new URLSearchParams({
      handle,fields:"id,name,handle"
    })
    const response=await fetch(url,{redirect:"manual",
      headers:{"x-publishable-api-key":publishableKey},
      signal:AbortSignal.timeout(15000)})
    assert.equal(response.status,200,"Native public Seller query must succeed")
    const data=await response.json() as {sellers?:Array<{
      id:string;name:string;handle:string
    }>}
    assert.ok(Array.isArray(data.sellers),"Native Seller list response")
    return data.sellers!
  }
  assert.equal((await nativeSeller(rename.old_handle)).length,0,
    "The former Seller.handle may not resolve to a live Seller")
  const nativeNew=await nativeSeller(rename.proposed_handle)
  assert.equal(nativeNew.length,1)
  assert.equal(nativeNew[0].id,storeId)
  assert.equal(nativeNew[0].name,rename.proposed_name)

  // Next's first real Seller request initializes its country/Region middleware.
  // A favicon-only readiness probe does not exercise this actual dependency.
  // Verify the real installed Medusa GET and German country mapping before
  // attributing a transient 500 to Seller rename or weakening HTTP assertions.
  const nativeRegions=await fetch(backendOrigin+"/store/regions",{
    headers:{"x-publishable-api-key":publishableKey},
    signal:AbortSignal.timeout(15000)
  })
  assert.equal(nativeRegions.status,200,
    "Disposable native Medusa Regions GET must work before Next's first page")
  const regionBody=await nativeRegions.json() as {regions?:Array<{
    countries?:Array<{iso_2?:string}>
  }>}
  assert.ok(regionBody.regions?.some(region=>
    region.countries?.some(country=>country.iso_2==="de")),
    "Disposable native Medusa Regions GET must expose the real de locale")

  const root=join(process.cwd(),"../../apps/storefront")
  const snapshot=join(temporaryDirectory,"b22-real-next-storefront")
  mkdirSync(snapshot,{recursive:false,mode:0o700})
  cpSync(join(root,"src"),join(snapshot,"src"),{recursive:true})
  for(const name of ["package.json","tsconfig.json","postcss.config.mjs",
    "tailwind.config.ts","next.config.ts"])
    copyFileSync(join(root,name),join(snapshot,name))
  if(existsSync(join(root,"public")))
    symlinkSync(join(root,"public"),join(snapshot,"public"),"dir")
  const workspaceModules=join(root,"node_modules")
  const rootModules=join(process.cwd(),"../../node_modules")
  const installed=existsSync(workspaceModules)?workspaceModules:rootModules
  assert.ok(existsSync(installed),"Existing frozen-lockfile Next dependencies")
  symlinkSync(installed,join(snapshot,"node_modules"),"dir")

  const port=await getFreePort()
  const origin="http://127.0.0.1:"+port
  const logPath=join(temporaryDirectory,"b22-next-storefront.log")
  const fd=openSync(logPath,"wx",0o600)
  // Reuse B20's proven programmatic Next.js server setup rather than
  // launching the app's Turbopack development script from a scratch tree.
  const childScript=join(temporaryDirectory,"b22-next-server.cjs")
  writeFileSync(childScript,[
    "const fs=require('node:fs'),http=require('node:http'),path=require('node:path');",
    "const {createRequire}=require('node:module');",
    "const requireNext=createRequire(path.join(process.cwd(),'package.json'));",
    "const next=requireNext('next');",
    "const port=Number(process.env.B22_NEXT_PORT);",
    "const app=next({dev:true,dir:process.cwd(),hostname:'127.0.0.1',port});",
    "(async()=>{",
    "await app.prepare();",
    "const server=http.createServer(app.getRequestHandler());",
    "server.listen(port,'127.0.0.1');",
    "const close=async()=>{server.close();await app.close();process.exit(0)};",
    "process.on('SIGTERM',close);",
    "})().catch(error=>{console.error(error);process.exit(1)});"
  ].join("\n"),{flag:"wx",mode:0o600})
  const child=spawn("node",[childScript],{
    cwd:snapshot,
    stdio:["ignore",fd,fd],
    detached:process.platform!=="win32",
    // No auth cookie, Staff credential, DB URL, application secret, or
    // production configuration is forwarded to the public Next runtime.
    env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",
      NODE_ENV:"development",CI:"true",NEXT_TELEMETRY_DISABLED:"1",
      B22_NEXT_PORT:String(port),
      MEDUSA_BACKEND_URL:backendOrigin,
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:publishableKey,
      NEXT_PUBLIC_DEFAULT_REGION:"de",
      NEXT_PUBLIC_SITE_NAME:"B22 disposable Storefront"}
  })
  try{
    try{
      await waitForLoopback(async()=>{
        if(child.exitCode!==null||child.signalCode!==null)
          throw new Error("Real Next.js process exited before startup")
        try{
          const response=await fetch(origin+"/favicon.ico",{
            redirect:"manual",signal:AbortSignal.timeout(2000)})
          await response.arrayBuffer()
          return response.status>=200
        }catch{return false}
      },90000,"B22 task-only actual Next.js startup")
    }catch(error){
      // Only a fixed non-sensitive error category is allowed out of this
      // ephemeral log. Do not expose request URLs, env, token or HTML.
      const log=readFileSync(logPath,"utf8")
      const cause=/Cannot find module|Module not found/i.test(log)?
        "dependency-resolution":/EADDRINUSE/i.test(log)?
        "port-conflict":/next\.config|config.*error/i.test(log)?
        "next-config":/Turbopack|swc/i.test(log)?
        "next-native-compiler":"startup-error"
      throw new Error("Isolated Next.js startup "+cause+"; "+String(error).slice(0,160))
    }
    const requestPage=async(handle:string)=>{
      const response=await fetch(origin+"/de/sellers/"+encodeURIComponent(handle),{
        redirect:"manual",
        headers:{accept:"text/html",
          "user-agent":"Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36"},
        signal:AbortSignal.timeout(120000)
      })
      const html=await response.text()
      return {status:response.status,location:response.headers.get("location"),
        contentType:response.headers.get("content-type"),html}
    }
    const former=await requestPage(rename.old_handle)
    if(former.status!==404){
      // This is a read-only diagnostic of a disposable test process. Never
      // publish raw Next output, HTTP bodies, paths, tokens, or environment.
      const lines=readFileSync(logPath,"utf8")
      const reason=/Module not found|Cannot find module/i.test(lines)?
        "dependency-resolution":/Failed to compile|Compilation failed|Turbopack|swc/i.test(lines)?
        "next-compilation":/ECONNREFUSED|fetch failed|ETIMEDOUT/i.test(lines)?
        "backend-read":/TypeError|ReferenceError/i.test(lines)?
        "runtime-error":/region|locale/i.test(lines)?
        "region-resolution":"unclassified"
      // If the first Next page fails, distinguish its middleware/renderer
      // from the direct native Medusa Regions response, without logging PII.
      const probe=await fetch(backendOrigin+"/store/regions",{
        headers:{"x-publishable-api-key":publishableKey},
        signal:AbortSignal.timeout(15000)
      }).then(response=>response.status).catch(()=>0)
      throw new Error("Isolated legacy Store HTTP status "+former.status+
        " (expected 404, no redirect); diagnostic="+reason+
        "; native_regions_status="+probe)
    }
    assert.equal(former.location,null,"Former Store URL may not redirect")
    assert.equal(former.status,404,
      "Real Next.js HTTP must return 404, not streamed not-found HTTP 200")
    const current=await requestPage(rename.proposed_handle)
    assert.equal(current.location,null,"New Store URL may not redirect")
    assert.equal(current.status,200,"New Store URL must render HTTP 200")
    assert.match(current.contentType??"",/^text\/html/)
    assert.ok(current.html.includes(rename.proposed_name),
      "The currently approved Seller must render its actual name")
    const persisted=(await container.resolve("seller").listSellers({id:storeId}))[0]
    assert.equal(persisted.id,nativeNew[0].id)
    assert.equal(persisted.handle,rename.proposed_handle)
    process.stdout.write("PASS B22 isolated Next.js/native Mercur HTTP/PG16: ingress 401 preserved; old handle 404 no redirect; new handle 200 same Seller ID\n")
  }finally{
    if(child.pid){
      if(process.platform!=="win32"){
        try{process.kill(-child.pid,"SIGTERM")}catch{killProcess(child)}
      }else killProcess(child)
      await waitForLoopback(async()=>
        child.exitCode!==null||child.signalCode!==null,
        10000,"B22 isolated Next.js process shutdown")
    }
    closeSync(fd)
  }
  }finally{
    if(nativeServer.listening)
      await new Promise<void>(resolve=>nativeServer.close(()=>resolve()))
    await nativeRuntime.shutdown()
  }
}

/** Final-head real Chrome + native Medusa + isolated PG16 acceptance of the
 * previously saved Member draft. A separate helper keeps the existing large
 * B22 program inside TypeScript's per-function control-flow analysis limit.
 */
