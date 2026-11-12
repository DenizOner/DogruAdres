/**
 * M0 B22 — Real Chrome + native Medusa Auth MFA + real secondary Member
 * dual proof through /personal/links + same-origin Organization Store GET.
 * The Organization/Store approval rows are SYNTHETIC FIXTURES in a single
 * random task-only CI database; they are NOT a real platform approval service.
 * No protected writes, credentials or real documents are stored in evidence.
 */
import assert from "node:assert/strict"
import {randomBytes,createHash} from "node:crypto"
import {createServer as tlsServer,request as tlsRequest} from "node:https"
import {createServer as plainServer} from "node:http"
import {dirname} from "node:path"
import {createRequire} from "node:module"
import {ApiLoader,expressLoader} from "@medusajs/framework/http"
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync,cpSync,copyFileSync,symlinkSync,existsSync,openSync,closeSync} from "node:fs"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {spawn,spawnSync} from "node:child_process"
import {Client} from "@medusajs/framework/pg"
import {createPersonalHttpApp} from "../../src/scripts/personal-http-runtime"
import {ingressConfig} from "../../src/utils/ingress-config"
import {requireOrganizationAccess} from "../../src/api/dogruadres/authorization"
import {completeCartWithSplitOrdersWorkflow,approveSellerWorkflow,suspendSellerWorkflow,unsuspendSellerWorkflow,createProductsWorkflow,createOffersWorkflow,createSellerCustomerGroupsWorkflow,createSellerPriceListsWorkflow,linkSellerRegionsWorkflow} from "@mercurjs/core/workflows"
import {createShippingProfilesWorkflow,addToCartWorkflow,createApiKeysWorkflow,linkSalesChannelsToApiKeyWorkflow,createRegionsWorkflow,updateRegionsWorkflow,createPaymentCollectionForCartWorkflow,createPaymentSessionsWorkflow,capturePaymentWorkflow} from "@medusajs/medusa/core-flows"
import {B06Chrome} from "./b06-ui-browser"
import {verifyB22TransferredRecovery,verifyAssignedRecipientUse,createB22CompletedSourceOrderFixture} from "./b22-store-name-transfer.accept"
import {verifyB22PlatformClosingAppeal,
  verifyB22PlatformClosingSecondStageRequest,
  verifyB22IndependentStaffClosingDecision} from "./b22-platform-closing-appeal.accept"
import {verifyTwoIndependentStaffNameRightRace} from "./b22-store-name-transfer-staff-race.accept"
import {verifyB22OwnedHistoricalOrder,verifyB22ForeignHistoricalOrder,verifyB22AuthorizedForeignHistoricalOrder} from "./b22-order-history.accept"
import {SmtpResponsePrivacyGuard} from "./smtp-response-privacy-guard"
import {assertWcag22AxeInChrome} from "./wcag22-axe-chrome"
import {getFreePort,until as waitForLoopback,killProcess} from "./native-verification-browser"
import {otp,until} from "./b19-browser"
import {projectFoundationAuditEvent} from "../../src/modules/dogruadres-audit-index/envelope"
import taxCertificateInventory, {inspectTaxCertificateSnapshot} from "../../src/scripts/tax-certificate-inventory"



async function verifyOwnerClosingBrowser(input:{
  browser:B06Chrome;reviewer:B06Chrome;coOwnerPersonId:string;
  organizations:any[];ownerStoreId:string;secondOwnerStoreId:string;
  nativeCustomer:any;customerCart:any;cartStoreIds:string[];foundation:any;cartService:any;
  q:(sql:string,params?:any[])=>Promise<any[]>;
  get:(url:string)=>Promise<any>;catalogUrl:(org:string)=>string;
}):Promise<void>{
  const {browser,reviewer,coOwnerPersonId,organizations,ownerStoreId,secondOwnerStoreId,
    nativeCustomer,customerCart,cartStoreIds,foundation,cartService,q,get,catalogUrl}=input
  // Isolated synthetic Store. Never turn on public checkout or payments.
  const nativeBefore=(await q(
    "select id,name,handle,status,approved_at,closed_from,closed_to from seller where id=$1",
    [ownerStoreId]))[0]
  assert.equal(nativeBefore.status,"open")
  assert.equal(Number((await q("select count(*)::int n from da_store_owner_closing where seller_id=$1",
    [ownerStoreId]))[0].n),0)
  // The same two real, independently signed-in Persons are reused from the
  // existing B22 organization-policy notification test. Promote the second
  // fixture's membership only in this disposable task database and restore it
  // after closing acceptance; this does NOT introduce an Owner-promotion API.
  const [coOwnerBefore]=await q(`select id,role,status,protected_owner,revoked_at
    from da_organization_membership
    where organization_id=$1 and person_id=$2 and deleted_at is null`,
    [organizations[0].id,coOwnerPersonId])
  assert.ok(coOwnerBefore?.id)
  assert.equal(coOwnerBefore.role,"member")
  assert.equal(coOwnerBefore.protected_owner,false)
  assert.equal(coOwnerBefore.status,"active")
  assert.equal(coOwnerBefore.revoked_at,null)
  assert.equal((await q(`update da_organization_membership
    set role='owner',protected_owner=true,updated_at=clock_timestamp()
    where id=$1 and role='member' and protected_owner=false and status='active'
    returning id`,[coOwnerBefore.id])).length,1)
  const expectedOwners=await q(`select m.person_id from da_organization_membership m
    join da_person p on p.id=m.person_id
    where m.organization_id=$1 and m.role='owner' and m.protected_owner=true
      and m.status='active' and m.revoked_at is null and m.deleted_at is null
      and p.disabled_at is null and p.deleted_at is null order by m.person_id`,
    [organizations[0].id])
  assert.equal(expectedOwners.length,2,"Two distinct, live protected Owners required")
  assert.equal(new Set(expectedOwners.map(x=>x.person_id)).size,2)
  const assertNotifiedOwners=async(auditId:string,title:string)=>{
    const recipients=await q(`select person_id from da_notification_receipt
      where audit_event_id=$1 order by person_id`,[auditId])
    assert.deepEqual(recipients,expectedOwners,
      "Exactly one private closing notice for EACH active protected Owner")
    const route="/personal/notifications?organization="+encodeURIComponent(organizations[0].id)
    const readOwner=async(b:B06Chrome)=>b.callFunction(
      "async function(path){const r=await fetch(path,{cache:'no-store'});"+
      "return {status:r.status,body:await r.json()}}",route)
    for(const actor of [browser,reviewer]){
      const result=await readOwner(actor)
      assert.equal(result.status,200)
      assert.equal(result.body.notifications.filter((n:any)=>
        n.title===title&&n.context===organizations[0].name).length,1,
        "Both independently signed-in Owners must read the private event")
    }
  }
  await browser.send("Page.bringToFront")
  await browser.wait("document.visibilityState==='visible'")
  await browser.select(organizations[0].name,"owner")
  await browser.wait("!document.getElementById('store-owner-closing-panel').hidden && "+
    "Array.from(document.querySelectorAll('#store-owner-pause-form select option')).some(o=>o.value==="+
    JSON.stringify(ownerStoreId)+")")
  await browser.eval("(()=>{const choice=document.querySelector("+
    "'#store-owner-pause-form select[name=seller_id]');choice.value="+
    JSON.stringify(ownerStoreId)+";choice.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
  await browser.wait("document.getElementById('store-owner-closing-status').textContent.includes('Aktif 30 günlük') && "+
    "document.querySelector('#store-owner-closing-form button[value=start]').disabled")
  await browser.eval("(()=>{const a=document.querySelector("+
    "'#store-owner-closing-form input[name=consequences_acknowledged]');"+
    "a.checked=true;a.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
  await browser.wait("!document.querySelector('#store-owner-closing-form button[value=start]').disabled")
  await browser.eval("window.__b22ClosingConfirm=window.confirm;window.confirm=()=>true")
  assert.equal(await browser.eval("(()=>{const b=document.querySelector('#store-owner-closing-form button[value=start]');b.focus();return document.activeElement===b})()"),true)
  await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:" ",code:"Space",text:" ",windowsVirtualKeyCode:32})
  await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:" ",code:"Space",windowsVirtualKeyCode:32})
  await browser.eval("window.confirm=window.__b22ClosingConfirm;delete window.__b22ClosingConfirm")
  await browser.wait("document.getElementById('store-owner-closing-status').textContent.includes('Kalan süre (yenilendiğinde):') && "+
    "document.getElementById('store-owner-closing-status').getAttribute('role')==='status'")
  assert.ok(browser.http.some((x:any)=>x.path==="/personal/store-owner-closing"&&x.method==="POST"&&x.status===200))
  const [closed]=await q(
    "select c.organization_id,c.state,c.version,c.request_id,c.started_at,c.due_at,"+
    "e.id as audit_event_id,e.action,e.actor_person_id,e.new_values->>'state' as proof_state,"+
    "(select count(*)::int from da_audit_outbox x where x.source_audit_event_id=e.id) as outbox_count,"+
    "(select count(*)::int from da_notification_receipt n where n.audit_event_id=e.id) as notices "+
    "from da_store_owner_closing c join da_audit_event e on e.id=c.source_audit_event_id "+
    "where c.seller_id=$1",[ownerStoreId])
  assert.equal(closed.state,"closing")
  assert.equal(closed.version,1)
  assert.equal(closed.organization_id,organizations[0].id)
  assert.equal(closed.action,"organization.store_owner_closing_started")
  assert.equal(closed.proof_state,"closing")
  // The countdown is based on the authoritative server timestamp, not the
  // browser's easily changed local clock.
  const clockView=await browser.callFunction(
    "async function(org,seller){const r=await fetch('/personal/store-owner-closing?'+new URLSearchParams({organization_id:org,seller_id:seller}));return {status:r.status,body:await r.json()}}",
    organizations[0].id,ownerStoreId)
  assert.equal(clockView.status,200)
  assert.equal(clockView.body.state,"closing")
  assert.equal(clockView.body.permanent_finalization_enabled,false)
  assert.deepEqual(clockView.body.email_notice,{
    status:"queued",attempts:0,smtp_accepted:false,
    mailbox_delivery_verified:false
  },"The closing source's private Owner receipt is pending a real SMTP attempt")
  const readOwnClosing=async(b:B06Chrome,org:string,seller:string)=>
    b.callFunction("async function(org,seller){const r=await fetch("+
      "'/personal/store-owner-closing?'+new URLSearchParams("+
      "{organization_id:org,seller_id:seller}),{cache:'no-store'});"+
      "return {status:r.status,body:await r.json()}}",org,seller)
  const coInitial=await readOwnClosing(reviewer,organizations[0].id,ownerStoreId)
  // B's protected Organization Owner receipt is valid, but B has not yet
  // completed the separate native SellerMember link. That real user flow
  // occurs later in this same acceptance; it is NOT legal to bypass this
  // Store-scoped requirement merely to read the private SMTP status.
  assert.equal(coInitial.status,403)
  assert.deepEqual(coInitial.body,{message:"Access denied"},
    "Protected Organization membership alone never grants native Store access")
  assert.equal((await readOwnClosing(reviewer,
    organizations[1].id,ownerStoreId)).status,403,
    "Another Organization cannot access this Store's email state")
  // Synthetic task-only evidence for the UI: the real SMTP 250/550/ACK
  // behavior is separately proven by PR #317's PG16/loopback SMTP test.
  // This insert is not a delivery receipt or a live SMTP network request.
  const ownerMailRecord=await q(`insert into da_store_owner_closing_email
    (audit_event_id,person_id,attempts,next_attempt_at,
     last_attempt_at,last_result,accepted_at)
    values ($1,$2,1,clock_timestamp()+interval '24 hours',
      clock_timestamp(),'accepted',clock_timestamp())
    returning audit_event_id`,[closed.audit_event_id,closed.actor_person_id])
  assert.equal(ownerMailRecord.length,1)
  const selfAccepted=await readOwnClosing(browser,organizations[0].id,ownerStoreId)
  assert.equal(selfAccepted.status,200)
  assert.deepEqual(selfAccepted.body.email_notice,{
    status:"accepted",attempts:1,smtp_accepted:true,
    mailbox_delivery_verified:false
  },"SMTP acceptance must never be named delivery")
  assert.equal(JSON.stringify(selfAccepted.body).includes("message_id"),false)
  assert.equal(JSON.stringify(selfAccepted.body).includes("person_id"),false)
  const otherOwner=await readOwnClosing(reviewer,organizations[0].id,ownerStoreId)
  assert.equal(otherOwner.status,403,
    "An unlinked native Member must never borrow another Owner's SMTP result")
  assert.deepEqual(otherOwner.body,{message:"Access denied"})
  const [separateRecipients]=await q(`select
    (select count(*)::int from da_notification_receipt
      where audit_event_id=$1) as protected_owner_receipts,
    (select count(*)::int from da_store_owner_closing_email
      where audit_event_id=$1 and last_result='accepted') as accepted_people`,
    [closed.audit_event_id])
  assert.equal(separateRecipients.protected_owner_receipts,2)
  assert.equal(separateRecipients.accepted_people,1,
    "Only the current authorized Person's synthetic SMTP status was accepted")
  await browser.click('#store-owner-closing-refresh')
  await browser.wait("document.getElementById('store-owner-closing-status')."+
    "textContent.includes('SMTP sunucusu e-postayı kabul etti; posta kutusuna teslim doğrulanmadı.')")
  assert.equal(await browser.eval(
    "document.getElementById('store-owner-closing-status').getAttribute('role')"),"status")
  assert.ok(Number.isSafeInteger(clockView.body.remaining_seconds)&&
    clockView.body.remaining_seconds>0&&clockView.body.remaining_seconds<=2592000,
    "Owner's status includes a bounded canonical server-clock countdown")
  assert.equal(closed.outbox_count,1)
  assert.equal(closed.notices,2,"Every protected Owner must receive one closing notice")
  await assertNotifiedOwners(closed.audit_event_id,
    "Mağaza için 30 günlük kapatma süreci başladı")
  assert.equal(new Date(closed.due_at).getTime()-new Date(closed.started_at).getTime(),2592000000)
  assert.deepEqual((await q("select id,name,handle,status,approved_at,closed_from,closed_to from seller where id=$1",
    [ownerStoreId]))[0],nativeBefore)
  assert.equal(await foundation.authorizeBuyerCheckout(customerCart.id,nativeCustomer.id,cartStoreIds),false,
    "One closing Seller blocks entire multi-Store final L")
  const catalog=await get(catalogUrl(organizations[0].id))
  assert.equal(catalog.status,200)
  assert.equal(catalog.body.stores.some((x:any)=>x.id===ownerStoreId),false)
  assert.equal(catalog.body.stores.some((x:any)=>x.id===secondOwnerStoreId),true)
  const post=async(data:any,withCsrf=true)=>browser.callFunction(
    "async function(raw,sendToken){const payload=JSON.parse(raw);"+
    "const session=await(await fetch('/personal/session')).json();"+
    "const headers={'content-type':'application/json'};"+
    "if(sendToken==='true')headers['x-csrf-token']=session.csrf_token;"+
    "const res=await fetch('/personal/store-owner-closing',{method:'POST',headers,"+
    "body:JSON.stringify(payload)});return {status:res.status,body:await res.json()}}",
    JSON.stringify(data),String(withCsrf))
  const same={organization_id:organizations[0].id,seller_id:ownerStoreId,
    action:"start",request_id:closed.request_id,expected_version:0,
    consequences_acknowledged:true}
  assert.equal((await post(same)).status,200,"Exact request replay must be idempotent")
  assert.equal((await post({...same,request_id:"dasc_"+randomBytes(16).toString("hex")})).status,409)
  assert.equal((await post({...same,organization_id:organizations[1].id})).status,403)
  assert.equal((await post(same,false)).status,403)
  assert.equal((await post({...same,consequences_acknowledged:false})).status,400)
  assert.equal(Number((await q("select count(*)::int n from da_audit_event "+
    "where resource='store-owner-closing' and target_id=$1",[ownerStoreId]))[0].n),1)
  // Unlike initiating irreversible closure, withdrawal needs no repeated
  // consent checkbox; a live protected Owner and unexpired deadline remain
  // the mandatory server-side gates.
  assert.equal(await browser.eval("(()=>document.querySelector("+
    "'#store-owner-closing-form input[name=consequences_acknowledged]').checked)()"),false)
  await browser.wait("!document.querySelector('#store-owner-closing-form button[value=withdraw]').disabled")
  await browser.eval("window.__b22ClosingConfirm=window.confirm;window.confirm=()=>true")
  assert.equal(await browser.eval("(()=>{const b=document.querySelector('#store-owner-closing-form button[value=withdraw]');b.focus();return document.activeElement===b})()"),true)
  await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:" ",code:"Space",text:" ",windowsVirtualKeyCode:32})
  await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:" ",code:"Space",windowsVirtualKeyCode:32})
  await browser.eval("window.confirm=window.__b22ClosingConfirm;delete window.__b22ClosingConfirm")
  await browser.wait("document.getElementById('store-owner-closing-status').textContent.includes('geri çekildi')")
  const [withdrawn]=await q(
    "select c.state,c.version,c.started_at,c.due_at,e.id as audit_event_id,e.action,"+
    "(select count(*)::int from da_audit_outbox x where x.source_audit_event_id=e.id) as outbox_count,"+
    "(select count(*)::int from da_notification_receipt n where n.audit_event_id=e.id) as notices "+
    "from da_store_owner_closing c join da_audit_event e on e.id=c.source_audit_event_id "+
    "where c.seller_id=$1",[ownerStoreId])
  assert.equal(withdrawn.state,"withdrawn")
  assert.equal(withdrawn.version,2)
  assert.equal(withdrawn.action,"organization.store_owner_closing_withdrawn")
  assert.equal(new Date(withdrawn.due_at).getTime(),new Date(closed.due_at).getTime())
  assert.equal(withdrawn.outbox_count,1)
  assert.equal(withdrawn.notices,2)
  await assertNotifiedOwners(withdrawn.audit_event_id,
    "Mağaza kapatma talebi geri çekildi")
  const withdrawnView=await readOwnClosing(browser,organizations[0].id,ownerStoreId)
  assert.equal(withdrawnView.status,200)
  assert.deepEqual(withdrawnView.body.email_notice,{
    status:"queued",attempts:0,smtp_accepted:false,
    mailbox_delivery_verified:false
  },"Withdrawal's own source event cannot inherit the earlier accepted SMTP result")
  assert.ok(!JSON.stringify(withdrawnView.body).includes(closed.audit_event_id))
  assert.equal(await foundation.authorizeBuyerCheckout(customerCart.id,nativeCustomer.id,cartStoreIds),true)
  assert.equal((await cartService.retrieveCart(customerCart.id,{relations:["items"]})).items?.length,2)
  assert.deepEqual((await q("select id,name,handle,status,approved_at,closed_from,closed_to from seller where id=$1",
    [ownerStoreId]))[0],nativeBefore)
  assert.equal(Number((await q("select count(*)::int n from da_audit_event "+
    "where resource='store-owner-closing' and target_id=$1",[ownerStoreId]))[0].n),2)

  // NEW CLOSING-SPECIFIC NEGATIVE ACCEPTANCE. Previous voluntary-pause
  // concurrency/revocation proof is NOT interchangeable with this endpoint.
  const beforeRace=Number((await q("select count(*)::int n from da_audit_event"+
    " where resource='store-owner-closing' and target_id=$1",
    [ownerStoreId]))[0].n)
  assert.equal(beforeRace,2)
  const raceA={...same,expected_version:2,
    request_id:"dasc_"+randomBytes(16).toString("hex")}
  const raceB={...raceA,request_id:"dasc_"+randomBytes(16).toString("hex")}
  const contested=await browser.callFunction(
    "async function(a,b){const s=await(await fetch('/personal/session',"+
    "{cache:'no-store'})).json();"+
    "const headers={'content-type':'application/json','x-csrf-token':s.csrf_token};"+
    "return Promise.all([a,b].map(async raw=>"+
    "(await fetch('/personal/store-owner-closing',{method:'POST',headers,body:raw})).status))}",
    JSON.stringify(raceA),JSON.stringify(raceB))
  assert.deepEqual([...contested].sort((a:number,b:number)=>a-b),[200,409],
    "Two distinct same-version real HTTPS closing requests must serialize")
  const [raceRow]=await q(
    "select c.state,c.version,c.started_at,c.due_at,c.source_audit_event_id,"+
    " (select count(*)::int from da_notification_receipt n"+
    " where n.audit_event_id=c.source_audit_event_id) as notices"+
    " from da_store_owner_closing c where c.seller_id=$1",[ownerStoreId])
  assert.equal(raceRow.state,"closing")
  assert.equal(raceRow.version,3)
  assert.equal(raceRow.notices,2)
  const closingAuditCount=async()=>Number((await q(
    "select count(*)::int n from da_audit_event"+
    " where resource='store-owner-closing' and target_id=$1",[ownerStoreId]))[0].n)
  assert.equal(await closingAuditCount(),beforeRace+1,
    "Concurrent loser must create zero audit/outbox/notice effects")
  const countEffects=async()=>q(
    "select (select count(*)::int from da_audit_event e"+
    " where e.resource='store-owner-closing' and e.target_id=$1) as events,"+
    " (select count(*)::int from da_audit_outbox o join da_audit_event e"+
    " on e.id=o.source_audit_event_id where e.resource='store-owner-closing'"+
    " and e.target_id=$1) as outboxes,"+
    " (select count(*)::int from da_notification_receipt n join da_audit_event e"+
    " on e.id=n.audit_event_id where e.resource='store-owner-closing'"+
    " and e.target_id=$1) as receipts",[ownerStoreId])
  assert.deepEqual((await countEffects())[0],{events:3,outboxes:3,receipts:6})
  const denyWithdraw={organization_id:organizations[0].id,seller_id:ownerStoreId,
    action:"withdraw",expected_version:3,
    request_id:"dasc_"+randomBytes(16).toString("hex")}
  const ownerCookie=(await browser.send("Network.getCookies",
    {urls:[browser.origin]})).cookies.find((x:any)=>x.name==="da_session")
  assert.match(ownerCookie?.value??"",/^[A-Za-z0-9_-]{43}$/)
  const ownerSessionHash=createHash("sha256").update(ownerCookie.value).digest("hex")
  const [realSession]=await q(
    "select id,last_strong_auth_at,status from da_browser_session where id=$1",
    [ownerSessionHash])
  assert.equal(realSession?.status,"active")
  assert.ok(realSession.last_strong_auth_at)
  const [protectedMembership]=await q(
    "select id,status,revoked_at from da_organization_membership"+
    " where organization_id=$1 and person_id=$2 and role='owner'"+
    " and protected_owner=true and deleted_at is null",
    [organizations[0].id,closed.actor_person_id])
  assert.equal(protectedMembership?.status,"active")
  assert.equal(protectedMembership.revoked_at,null)
  const unchangedEffects=(expected:{events:number;outboxes:number;receipts:number})=>
    countEffects().then(rows=>assert.deepEqual(rows[0],expected))
  const snapshot={events:3,outboxes:3,receipts:6}
  try{
    assert.equal((await q("update da_organization_membership"+
      " set status='revoked',revoked_at=clock_timestamp()"+
      " where id=$1 and status='active' and revoked_at is null returning id",
      [protectedMembership.id])).length,1)
    assert.equal((await post(denyWithdraw)).status,403,
      "Revoked Owner cannot withdraw closing through real first-party HTTP")
    await unchangedEffects(snapshot)
  }finally{
    await q("update da_organization_membership set status=$2,revoked_at=$3"+
      " where id=$1",[protectedMembership.id,protectedMembership.status,
      protectedMembership.revoked_at])
  }
  try{
    assert.equal((await q("update da_browser_session"+
      " set last_strong_auth_at=clock_timestamp()-interval '2 days'"+
      " where id=$1 and status='active' returning id",
      [ownerSessionHash])).length,1)
    assert.equal((await post(denyWithdraw)).status,403,
      "Stale strong auth cannot withdraw an Owner closing intent")
    await unchangedEffects(snapshot)
  }finally{
    await q("update da_browser_session set last_strong_auth_at=$2"+
      " where id=$1",[ownerSessionHash,realSession.last_strong_auth_at])
  }
  assert.deepEqual((await q(
    "select state,version,source_audit_event_id from da_store_owner_closing"+
    " where seller_id=$1",[ownerStoreId]))[0],
    {state:"closing",version:3,source_audit_event_id:raceRow.source_audit_event_id})

  // EXPIRY FIXTURE: do not mutate the append-only canonical audit.
  // Create one entirely NEW historical closing record for a second already
  // approved synthetic Seller using the real Foundation audit/outbox schema.
  // The disposable task DB is destroyed by the enclosing PG16 job.
  const [{now_at:serverNow}]=await q("select clock_timestamp() as now_at")
  const justExpiredDue=new Date(new Date(serverNow).getTime()-100).toISOString()
  const justExpiredStart=new Date(
    new Date(justExpiredDue).getTime()-2592000000).toISOString()
  const expiredKey="dasc_"+randomBytes(16).toString("hex")
  let expiryFixtureAuditId=""
  await q("begin")
  try{
    const [fixtureEvent]=await q(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,organization_id,
       action,module,resource,target_id,role_context,new_values,occurred_at)
      select 'daaud_'||gen_random_uuid()::text,e.actor_person_id,
        e.actor_type,e.actor_id,e.organization_id,
        'organization.store_owner_closing_started','dogruadres-access',
        'store-owner-closing',$2,'owner',
        jsonb_build_object('state','closing','version',1,
          'request_id',$3::text,'started_at',$4::text,'due_at',$5::text,
          'fixture_source','b22_expiry_probe'),$4::timestamptz
      from da_audit_event e where e.id=$1 returning id`,
      [raceRow.source_audit_event_id,secondOwnerStoreId,expiredKey,
        justExpiredStart,justExpiredDue])
    assert.ok(fixtureEvent?.id)
    expiryFixtureAuditId=fixtureEvent.id
    const [realSource]=await q(
      "select envelope from da_audit_outbox"+
      " where source_audit_event_id=$1 and deleted_at is null",
      [raceRow.source_audit_event_id])
    assert.ok(realSource?.envelope)
    const fixtureEnvelope={...realSource.envelope,
      source_audit_event_id:expiryFixtureAuditId,
      target_id:secondOwnerStoreId,occurred_at:justExpiredStart}
    // CHECK da_audit_outbox_delivery_state permits a future retry only when
    // attempt_count>=1. This task-only synthetic history event is deliberately
    // excluded from today's relay; all FOUR actual Chrome events remain queued.
    assert.equal((await q(`insert into da_audit_outbox
      (id,source_audit_event_id,source_module,envelope,attempt_count,next_attempt_at)
      values('daaob_'||gen_random_uuid()::text,$1,'dogruadres-access',
        $2::jsonb,1,clock_timestamp()+interval '100 years')
      returning id`,[expiryFixtureAuditId,JSON.stringify(fixtureEnvelope)])).length,1)
    assert.equal((await q(`insert into da_store_owner_closing
      (seller_id,organization_id,state,version,request_id,
       source_audit_event_id,started_at,due_at)
      values($1,$2,'closing',1,$3,$4,$5,$6) returning seller_id`,
      [secondOwnerStoreId,organizations[0].id,expiredKey,
        expiryFixtureAuditId,justExpiredStart,justExpiredDue])).length,1)
    await q("commit")
  }catch(error){await q("rollback");throw error}
  try{
    const expired=await browser.callFunction(
      "async function(org,seller){const r=await fetch('/personal/store-owner-closing?'+new URLSearchParams({organization_id:org,seller_id:seller}));return {status:r.status,body:await r.json()}}",
      organizations[0].id,secondOwnerStoreId)
    assert.equal(expired.status,200)
    assert.equal(expired.body.state,"closing")
    assert.equal(expired.body.can_withdraw,false)
    assert.equal(expired.body.remaining_seconds,0)
    assert.equal(expired.body.permanent_finalization_enabled,false)
    // The actual authorized Owner screen must stop calling an expired
    // waiting period a countdown. Do not display a completed/terminated
    // Store, release its name, or enable a withdrawal after the deadline.
    const selectClosingStore=async(seller:string)=>browser.callFunction(
      "function(seller){const c=document.querySelector("+
      "'#store-owner-pause-form select[name=seller_id]');"+
      "if(!c||!Array.from(c.options).some(o=>o.value===seller))return false;"+
      "c.value=seller;c.dispatchEvent(new Event('change',{bubbles:true}));"+
      "return true}",seller)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    assert.equal(await selectClosingStore(secondOwnerStoreId),true,
      "Real Owner must be able to select the expired approved Store")
    await browser.wait("document.getElementById('store-owner-closing-status').textContent.includes('30 günlük bekleme süresi doldu')")
    const expiryScreen=await browser.eval("document.getElementById('store-owner-closing-status').textContent")
    for(const message of ["Yeni satışlar hâlâ kapalı",
      "geri dönüşsüz işlem yapılmıyor",
      "mağaza adını veya geçmiş siparişleri kendiliğinden değiştirmez",
      "Geri çekme süresi sona erdi"])
      assert.ok(expiryScreen.includes(message),
        "Real protected Owner must see a safe post-day-30 explanation: "+message)
    assert.equal(await browser.eval(
      "document.querySelector('#store-owner-closing-form button[value=withdraw]').disabled"),true,
      "The real UI cannot submit expired Owner withdrawal")
    assert.equal(await selectClosingStore(ownerStoreId),true)
    await browser.wait("document.getElementById('store-owner-closing-status').textContent.includes('Kalan süre (yenilendiğinde):')")
    const beforeExpirySideEffects=await q(
      "select count(*)::int n from da_audit_event e"+
      " where e.resource='store-owner-closing' and e.target_id=$1",
      [secondOwnerStoreId])
    assert.equal(beforeExpirySideEffects[0].n,1)
    const denied=await post({...denyWithdraw,seller_id:secondOwnerStoreId,
      expected_version:1,request_id:"dasc_"+randomBytes(16).toString("hex")})
    assert.equal(denied.status,409,
      "At/after 30 days the real HTTPS Owner withdrawal must return 409")
    assert.deepEqual(await q(
      "select seller_id,state,version,source_audit_event_id"+
      " from da_store_owner_closing where seller_id=$1",[secondOwnerStoreId]),
      [{seller_id:secondOwnerStoreId,state:"closing",version:1,
        source_audit_event_id:expiryFixtureAuditId}])
    assert.deepEqual(await q(
      "select count(*)::int n from da_audit_event"+
      " where resource='store-owner-closing' and target_id=$1",
      [secondOwnerStoreId]),beforeExpirySideEffects,
      "Deadline denial cannot produce any new audit event")
    assert.equal((await q("select count(*)::int n from da_notification_receipt"+
      " where audit_event_id=$1",[expiryFixtureAuditId]))[0].n,0,
      "No notification is manufactured for denied withdrawal")
    await unchangedEffects(snapshot)
  }finally{
    // The row is a test-only expired fixture, NOT a real HTTP Owner request.
    // Remove only its ephemeral ledger; never update/delete append-only audit.
    assert.equal((await q(
      "delete from da_store_owner_closing"+
      " where seller_id=$1 and source_audit_event_id=$2 returning seller_id",
      [secondOwnerStoreId,expiryFixtureAuditId])).length,1)
  }
  assert.deepEqual(await q(
    "select seller_id from da_store_owner_closing where seller_id=$1",
    [secondOwnerStoreId]),[])
  assert.equal(await foundation.authorizeBuyerCheckout(
    customerCart.id,nativeCustomer.id,cartStoreIds),false,
    "Original Owner's parallel closing still blocks the two-Store cart")
  const restored=await post(denyWithdraw)
  assert.equal(restored.status,200)
  assert.equal(restored.body.status,"withdrawn")
  assert.equal(restored.body.version,4)
  assert.equal(await closingAuditCount(),4)
  const endEffects=(await countEffects())[0]
  assert.deepEqual(endEffects,{events:4,outboxes:4,receipts:8})
  const finalRows=await q(
    "select e.id,e.action from da_audit_event e"+
    " where e.resource='store-owner-closing' and e.target_id=$1"+
    " order by e.occurred_at,e.id",[ownerStoreId])
  assert.deepEqual(finalRows.map(x=>x.action).sort(),[
    "organization.store_owner_closing_started",
    "organization.store_owner_closing_started",
    "organization.store_owner_closing_withdrawn",
    "organization.store_owner_closing_withdrawn"
  ])
  for(const event of finalRows){
    const recipients=await q(
      "select person_id from da_notification_receipt"+
      " where audit_event_id=$1 order by person_id",[event.id])
    assert.deepEqual(recipients,expectedOwners,
      "Every committed closing transition must notify both protected Owners")
  }
  assert.equal(await foundation.authorizeBuyerCheckout(
    customerCart.id,nativeCustomer.id,cartStoreIds),true)
  assert.deepEqual((await q(
    "select id,name,handle,status,approved_at,closed_from,closed_to"+
    " from seller where id=$1",[ownerStoreId]))[0],nativeBefore)
  // Restore exactly the original second-Person membership for later existing
  // Member and platform-role tests. No new Owner authority survives fixture.
  assert.equal((await q(
    "update da_organization_membership set role=$2,protected_owner=$3,"+
    " revoked_at=$4,updated_at=clock_timestamp() where id=$1 returning id",
    [coOwnerBefore.id,coOwnerBefore.role,coOwnerBefore.protected_owner,
      coOwnerBefore.revoked_at])).length,1)
  const [restoredCoOwner]=await q(
    "select role,status,protected_owner,revoked_at"+
    " from da_organization_membership where id=$1",[coOwnerBefore.id])
  assert.deepEqual(restoredCoOwner,{
    role:coOwnerBefore.role,status:coOwnerBefore.status,
    protected_owner:coOwnerBefore.protected_owner,revoked_at:coOwnerBefore.revoked_at
  })
  process.stdout.write("PASS B22 real closing security: concurrent HTTP 200+409 one commit; revoked Owner/stale session HTTP403 no writes; expired 30-day withdraw HTTP409 no writes; both active Owners read private notices, two receipts each; native Seller unchanged\n")
  process.stdout.write("PASS B22 real Owner 30-day closing intent/withdraw: Chrome/HTTPS/PG16, exact server deadline, protected Owner notices, whole-Cart L deny then restore, CSRF/foreign/replay denied; native Seller unchanged; irreversible finalization disabled\n")
}

async function verifyOwnerTemporaryPauseBrowser(input:{
  browser:B06Chrome;organizations:any[];ownerStoreId:string;
  secondOwnerStoreId:string;nativeCustomer:any;customerCart:any;
  cartStoreIds:string[];container:any;foundation:any;cartService:any;
  q:(sql:string,params?:any[])=>Promise<any[]>;
  get:(url:string)=>Promise<any>;
  catalogUrl:(organizationId:string)=>string;
}):Promise<void>{
  const {browser,organizations,ownerStoreId,secondOwnerStoreId,
    nativeCustomer,customerCart,cartStoreIds,container,foundation,
    cartService,q,get,catalogUrl}=input
    // B22 Owner temporary pause: real personal UI and first-party HTTPS
    // mutation, real canonical PostgreSQL audit/outbox, and an existing
    // two-Store Cart's final L sale decision. Native Vendor/admin and payment
    // remain closed; this test never enables checkout or writes a new Order.
    const pauseNativeBefore=(await q(
      "select id,name,handle,status,approved_at,closed_from,closed_to "+
      "from seller where id=$1",[ownerStoreId]))[0]
    assert.equal(pauseNativeBefore.status,"open")
    const pauseAuditStart=Number((await q(
      "select count(*)::int n from da_audit_event where target_id=$1 "+
      "and resource='store-owner-pause'",[ownerStoreId]))[0].n)
    assert.equal(pauseAuditStart,0,"Fresh Store has no previous Owner pause")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('store-owner-pause-panel').hidden && "+
      "Array.from(document.querySelectorAll('#store-owner-pause-form select option')).some(o=>o.value==="+
      JSON.stringify(ownerStoreId)+")")
    await browser.eval("(()=>{const choice=document.querySelector("+
      "'#store-owner-pause-form select[name=seller_id]');choice.value="+
      JSON.stringify(ownerStoreId)+";choice.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
    await browser.wait("document.getElementById('store-owner-pause-status').textContent.includes('satışa açık') && "+
      "!document.querySelector('#store-owner-pause-form button[value=pause]').disabled")
    await browser.eval("window.__b22PreviousConfirm=window.confirm;window.confirm=()=>true")
    assert.equal(await browser.eval("(()=>{const b=document.querySelector('#store-owner-pause-form button[value=pause]');b.focus();return document.activeElement===b})()"),true)
    await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:" ",code:"Space",text:" ",windowsVirtualKeyCode:32})
    await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:" ",code:"Space",windowsVirtualKeyCode:32})
    await browser.eval("window.confirm=window.__b22PreviousConfirm;delete window.__b22PreviousConfirm")
    await browser.wait("document.getElementById('store-owner-pause-status').textContent.includes('geçici arada')")
    assert.ok(browser.http.some((x:any)=>x.path==="/personal/store-owner-pause"&&
      x.method==="POST"&&x.status===200),"Visible Owner pause must send real HTTPS 200")
    const pausedRows=await q(
      "select p.paused,p.version,p.request_id,p.source_audit_event_id,"+
      "e.action,e.actor_person_id,e.organization_id,"+
      "(select count(*)::int from da_audit_outbox o "+
      "where o.source_audit_event_id=e.id and o.source_module='dogruadres-access') as outbox_count "+
      "from da_store_owner_pause p join da_audit_event e on e.id=p.source_audit_event_id "+
      "where p.seller_id=$1",[ownerStoreId])
    assert.equal(pausedRows.length,1)
    assert.equal(pausedRows[0].paused,true)
    assert.equal(pausedRows[0].version,1)
    assert.match(pausedRows[0].request_id,/^dasp_[a-f0-9]{32}$/)
    assert.equal(pausedRows[0].action,"organization.store_owner_paused")
    assert.equal(pausedRows[0].organization_id,organizations[0].id)
    assert.equal(pausedRows[0].outbox_count,1)
    const pauseNativeDuring=(await q(
      "select id,name,handle,status,approved_at,closed_from,closed_to "+
      "from seller where id=$1",[ownerStoreId]))[0]
    assert.deepEqual(pauseNativeDuring,pauseNativeBefore,
      "Owner temporary pause must not change native Seller lifecycle, ID or name")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds),false,
      "Pausing ONE of two Stores must deny the WHOLE final L checkout")
    assert.equal((await cartService.retrieveCart(customerCart.id,{relations:["items"]}))
      .items?.length,2,"Pause must preserve existing Cart")
    const pausedCatalogue=await get(catalogUrl(organizations[0].id))
    assert.equal(pausedCatalogue.status,200)
    assert.equal(pausedCatalogue.body.stores.some((s:any)=>s.id===ownerStoreId),false,
      "Paused Store must be hidden even though native status stays open")
    assert.equal(pausedCatalogue.body.stores.some((s:any)=>s.id===secondOwnerStoreId),true,
      "A separate open Store remains available")
    const ownerPauseHttp=async(data:any,includeCsrf=true)=>browser.callFunction(
      "async function(raw,flag){"+
      "const payload=JSON.parse(raw);"+
      "const s=await(await fetch('/personal/session')).json();"+
      "const headers={'content-type':'application/json'};"+
      "if(flag==='true')headers['x-csrf-token']=s.csrf_token;"+
      "const r=await fetch('/personal/store-owner-pause',{method:'POST',headers,"+
      "body:JSON.stringify(payload)});return {status:r.status,body:await r.json()}}",
      JSON.stringify(data),String(includeCsrf))
    const pausePayload={organization_id:organizations[0].id,seller_id:ownerStoreId,
      action:"pause",request_id:pausedRows[0].request_id,expected_version:0}
    assert.equal((await ownerPauseHttp(pausePayload)).status,200,
      "Replaying the same exact Owner pause must be idempotent")
    assert.equal((await ownerPauseHttp({...pausePayload,request_id:
      "dasp_"+randomBytes(16).toString("hex")})).status,409,
      "Different same-version request must not repeat the write")
    assert.equal((await ownerPauseHttp({...pausePayload,organization_id:organizations[1].id})).status,403,
      "Wrong Organization Owner must not change a foreign Store")
    assert.equal((await ownerPauseHttp(pausePayload,false)).status,403,
      "A browser without CSRF cannot change Owner pause")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event where target_id=$1 "+
      "and resource='store-owner-pause'",[ownerStoreId]))[0].n),pauseAuditStart+1,
      "Denied/replayed requests cannot duplicate audit events")

    // Platform suspension is a *separate* authority. Owner can never
    // resume while the platform-suspended native status is in force.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:ownerStoreId,reason:"B22 task-only platform suspension during Owner pause"
    }})
    assert.equal((await ownerPauseHttp({...pausePayload,action:"resume",
      request_id:"dasp_"+randomBytes(16).toString("hex"),expected_version:1})).status,403,
      "Owner resume cannot bypass an independent platform suspension")
    assert.equal((await q("select paused from da_store_owner_pause where seller_id=$1",
      [ownerStoreId]))[0].paused,true)
    await unsuspendSellerWorkflow(container).run({input:{seller_id:ownerStoreId}})
    await browser.click('#store-owner-pause-refresh')
    await browser.wait("document.getElementById('store-owner-pause-status').textContent.includes('geçici arada')&&"+
      "!document.querySelector('#store-owner-pause-form button[value=resume]').disabled")
    await browser.eval("window.__b22PreviousConfirm=window.confirm;window.confirm=()=>true")
    assert.equal(await browser.eval("(()=>{const b=document.querySelector('#store-owner-pause-form button[value=resume]');b.focus();return document.activeElement===b})()"),true)
    await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:" ",code:"Space",text:" ",windowsVirtualKeyCode:32})
    await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:" ",code:"Space",windowsVirtualKeyCode:32})
    await browser.eval("window.confirm=window.__b22PreviousConfirm;delete window.__b22PreviousConfirm")
    await browser.wait("document.getElementById('store-owner-pause-status').textContent.includes('satışa açık')")
    const resumedRows=await q(
      "select p.paused,p.version,e.action,"+
      "(select count(*)::int from da_audit_outbox o where o.source_audit_event_id=e.id) as outbox_count "+
      "from da_store_owner_pause p join da_audit_event e on e.id=p.source_audit_event_id "+
      "where p.seller_id=$1",[ownerStoreId])
    assert.deepEqual(resumedRows,[{paused:false,version:2,
      action:"organization.store_owner_resumed",outbox_count:1}])
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event where target_id=$1 "+
      "and resource='store-owner-pause'",[ownerStoreId]))[0].n),pauseAuditStart+2)
    const pauseNativeAfter=(await q(
      "select id,name,handle,status,approved_at,closed_from,closed_to "+
      "from seller where id=$1",[ownerStoreId]))[0]
    assert.deepEqual(pauseNativeAfter,pauseNativeBefore,
      "Owner resume preserves original Seller identity and other closure state")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds),true,
      "After Owner resume with native platform OPEN, final L authorization is restored")
    assert.equal((await cartService.retrieveCart(customerCart.id,{relations:["items"]}))
      .items?.length,2,"Neither pause nor resume changes preexisting cart lines")
    process.stdout.write("PASS B22 real Owner temporary pause/resume: Chrome/HTTPS/PG16 UI, same native Seller ID/name and existing Cart, two audit/outbox, CSRF/foreign/replay/platform-suspend denied, two-Store final L blocked then restored; checkout remains closed\n")

    // Bound accessibility check: real Chrome keyboard Enter activates both
    // transitions above; status/label must be exposed to its accessibility
    // tree. This is Chrome AX evidence, not a claim about every screen reader.
    const ownerAX=await browser.send("Accessibility.getFullAXTree")
    assert.ok(ownerAX.nodes.some((n:any)=>n.role?.value==="status"),
      "Chrome must expose at least one live status region")
    // A previous real Chrome run observed the immutable Seller resume PASS
    // before this asynchronous panel readback settled. Do not weaken any
    // WCAG assertion; wait until *all* existing visible/label/live-state
    // invariants hold, and still fail closed if they never become true.
    await browser.wait("(()=>{const panel=document.getElementById('store-owner-pause-panel');const status=document.getElementById('store-owner-pause-status');const select=panel?.querySelector('select[name=seller_id]');return !!panel&&!panel.hidden&&status?.getAttribute('role')==='status'&&status.getAttribute('aria-live')==='polite'&&!!select?.closest('label')?.textContent.includes('Mağaza')&&status.textContent.includes('satışa açık')})()")

    // Two distinct first-party HTTPS mutations using the SAME verified
    // version compete at the real PostgreSQL per-Seller transaction lock.
    const newPause1={organization_id:organizations[0].id,seller_id:ownerStoreId,
      action:"pause",expected_version:2,request_id:"dasp_"+randomBytes(16).toString("hex")}
    const newPause2={...newPause1,request_id:"dasp_"+randomBytes(16).toString("hex")}
    const contested=await browser.callFunction(
      "async function(a,b){"+
      "const session=await(await fetch('/personal/session',{cache:'no-store'})).json();"+
      "const headers={'content-type':'application/json','x-csrf-token':session.csrf_token};"+
      "return await Promise.all([a,b].map(async raw=>"+
      "(await fetch('/personal/store-owner-pause',{method:'POST',headers,body:raw})).status))}",
      JSON.stringify(newPause1),JSON.stringify(newPause2))
    assert.deepEqual([...contested].sort((a:number,b:number)=>a-b),[200,409],
      "Two distinct same-version Owner pause requests cannot both commit")
    const [raceRow]=await q("select paused,version from da_store_owner_pause where seller_id=$1",
      [ownerStoreId])
    assert.deepEqual(raceRow,{paused:true,version:3})
    assert.equal(Number((await q("select count(*)::int n from da_audit_event where target_id=$1 and resource='store-owner-pause'",
      [ownerStoreId]))[0].n),pauseAuditStart+3,
      "Concurrent loser creates no second audit")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds),false)
    const newResume=await ownerPauseHttp({...newPause1,action:"resume",
      request_id:"dasp_"+randomBytes(16).toString("hex"),expected_version:3})
    assert.equal(newResume.status,200)
    assert.equal(newResume.body.version,4)
    assert.equal(Number((await q("select count(*)::int n from da_audit_event where target_id=$1 and resource='store-owner-pause'",
      [ownerStoreId]))[0].n),pauseAuditStart+4)
    assert.equal((await q("select paused from da_store_owner_pause where seller_id=$1",
      [ownerStoreId]))[0].paused,false)
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds),true)

    // The test-only session and protected Owner membership are restored
    // exactly after each denied real HTTP request on this disposable DB.
    const cookieResult=await browser.send("Network.getCookies",{urls:[browser.origin]})
    const ownerCookie=cookieResult.cookies.find((c:any)=>c.name==="da_session")
    assert.ok(ownerCookie&&/^[A-Za-z0-9_-]{43}$/.test(ownerCookie.value))
    const sessionHash=createHash("sha256").update(ownerCookie.value).digest("hex")
    const sessionRows=await q("select id,status,last_strong_auth_at from da_browser_session where id=$1",
      [sessionHash])
    assert.equal(sessionRows.length,1)
    assert.equal(sessionRows[0].status,"active")
    assert.ok(sessionRows[0].last_strong_auth_at)
    const csrfRead=await browser.callFunction(
      "async function(){return (await(await fetch('/personal/session',{cache:'no-store'})).json()).csrf_token}")
    assert.ok(typeof csrfRead==="string"&&csrfRead.length===43)
    const deniedMutation={...newPause1,expected_version:4,
      request_id:"dasp_"+randomBytes(16).toString("hex")}
    const postWithOriginalCsrf=async()=>browser.callFunction(
      "async function(raw,token){const response=await fetch('/personal/store-owner-pause',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':token},body:raw});return response.status}",
      JSON.stringify(deniedMutation),csrfRead)
    const oldStrong=sessionRows[0].last_strong_auth_at
    try{
      assert.equal((await q("update da_browser_session set last_strong_auth_at=clock_timestamp()-interval '2 days' where id=$1 and status='active' returning id",
        [sessionHash])).length,1)
      assert.equal(await postWithOriginalCsrf(),403,
        "Expired strong proof must deny Owner pause at real HTTPS endpoint")
    }finally{
      await q("update da_browser_session set last_strong_auth_at=$2 where id=$1",
        [sessionHash,oldStrong])
    }
    const membershipRows=await q("select id,status,revoked_at from da_organization_membership where person_id=$1 and organization_id=$2 and role='owner' and protected_owner=true and deleted_at is null",
      [pausedRows[0].actor_person_id,organizations[0].id])
    assert.equal(membershipRows.length,1)
    assert.equal(membershipRows[0].status,"active")
    assert.equal(membershipRows[0].revoked_at,null)
    try{
      assert.equal((await q("update da_organization_membership set status='revoked',revoked_at=clock_timestamp() where id=$1 and status='active' and revoked_at is null returning id",
        [membershipRows[0].id])).length,1)
      assert.equal(await postWithOriginalCsrf(),403,
        "An Owner whose protected membership is revoked in the disposable DB cannot pause")
    }finally{
      await q("update da_organization_membership set status=$2,revoked_at=$3 where id=$1",
        [membershipRows[0].id,membershipRows[0].status,membershipRows[0].revoked_at])
    }
    assert.equal(Number((await q("select count(*)::int n from da_audit_event where target_id=$1 and resource='store-owner-pause'",
      [ownerStoreId]))[0].n),pauseAuditStart+4,
      "Revoked or stale Owner creates no canonical audit side effect")
    assert.deepEqual((await q("select paused,version from da_store_owner_pause where seller_id=$1",
      [ownerStoreId]))[0],{paused:false,version:4})
    assert.deepEqual((await q(
      "select id,name,handle,status,approved_at,closed_from,closed_to from seller where id=$1",
      [ownerStoreId]))[0],pauseNativeBefore)
    assert.equal((await cartService.retrieveCart(customerCart.id,{relations:["items"]})).items?.length,2)
    await browser.click('#store-owner-pause-refresh')
    await browser.wait("document.getElementById('store-owner-pause-status').textContent.includes('satışa açık')")
    process.stdout.write("PASS B22 real Owner pause concurrency/authorization: two HTTPS requests 200+409, one durable pause; revoked Owner and stale strong session denied without writes; resume restores unchanged Seller\n")



}

// Use the existing real CI Chrome and two native Vite dashboard apps. The only
// external URL is a synthetic .invalid name; browser CSP blocks it BEFORE DNS.
// This changes no application role, production setting or protected data.
async function verifyPanelCspModes(browser:B06Chrome, container:any):Promise<void> {
  assert.equal(container.resolve("vendor_ui").getServingMode(),"static")
  const probe=async(label:string,url:string,sameOriginPath:string,allowedBackend?:string)=>{
    browser.phase="b22-dashboard-csp-"+label
    await browser.send("Page.navigate",{url})
    const expectedOrigin=new URL(url).origin
    try {
      await browser.wait("location.origin==="+JSON.stringify(expectedOrigin)+
        "&&!!document.querySelector('meta[http-equiv=Content-Security-Policy]')")
    } catch(error) {
      // Only fixed navigation metadata, never source, cookies, response bodies.
      const page=await browser.eval("({onExpectedOrigin:location.origin==="+
        JSON.stringify(expectedOrigin)+",onVendorLogin:location.pathname==='/seller/login',"+
        "hasCsp:!!document.querySelector('meta[http-equiv=Content-Security-Policy]')})")
      const navigation=browser.http.filter(r=>r.path.startsWith("/seller"))
        .map(({path,status})=>({path,status})).slice(-5)
      throw new Error(label+" expected native policy not visible: "+
        JSON.stringify({page,navigation})+"; "+String(error).slice(0,130))
    }
    const result=await browser.eval("(async()=>{"+
      "const rule=document.querySelector('meta[http-equiv=Content-Security-Policy]')?.content||'';"+
      "const local=await fetch("+JSON.stringify(sameOriginPath)+",{cache:'no-store'}).then(r=>r.status).catch(()=>0);"+
      "const blocked=await new Promise(resolve=>{"+
      "const target='https://dogruadres-csp-check.invalid';"+
      "let seen=false;"+
      "const observe=e=>{if(e.effectiveDirective==='connect-src'&&e.blockedURI.startsWith(target)){"+
      "seen=true;document.removeEventListener('securitypolicyviolation',observe);resolve(true)}};"+
      "document.addEventListener('securitypolicyviolation',observe);"+
      "fetch(target+'/feedback',{method:'POST',body:'synthetic-only'}).catch(()=>{});"+
      "setTimeout(()=>{document.removeEventListener('securitypolicyviolation',observe);resolve(seen)},1000);"+
      "});return {rule,local,blocked};})()")
    assert.ok(result.rule.includes("connect-src 'self'"),label+" must restrict cross-origin requests")
    if(allowedBackend)
      assert.ok(result.rule.split(" ").includes(allowedBackend),
        label+" must retain the explicitly configured local backend origin")
    else
      assert.equal(result.rule,"connect-src 'self'",label+" production panel allowlist")
    assert.equal(result.local,200,label+" real same-origin HTTP asset/session")
    assert.equal(result.blocked,true,label+" real Chrome external POST must be denied")
    process.stdout.write("PASS B22 Chrome: "+label+
      " connect-src blocked synthetic external POST; same-origin HTTP200\n")
  }
  // Mercur native /seller routes legitimately return 401 for a Person-only
  // session. Do NOT disable that authority boundary to inspect a static file.
  // Vite's own preview serves the exact built Vendor dist for browser proof.
  for(const scenario of [
    {panel:"vendor" as const,mode:"preview" as const,label:"Vendor BUILD"},
    {panel:"admin" as const,mode:"dev" as const,label:"Admin DEV"},
    {panel:"vendor" as const,mode:"dev" as const,label:"Vendor DEV"},
  ]){
    const port=await getFreePort()
    const cwd=join(process.cwd(),"../../apps",scenario.panel)
    const basePath=scenario.panel==="admin"?"/dashboard/":"/seller/"
    const startUrl="http://127.0.0.1:"+port+basePath
    const child=spawn("bun",
      ["run",scenario.mode,"--host","127.0.0.1","--port",String(port),"--strictPort"],{
      cwd,stdio:"ignore",detached:process.platform!=="win32",
      env:{...process.env,VITE_MERCUR_BACKEND_URL:browser.origin,
        MERCUR_DISABLE_TELEMETRY:"true"},
    })
    try{
      await waitForLoopback(async()=>{
        const response=await fetch(startUrl,{signal:AbortSignal.timeout(1000)})
        return response.ok
      },45000,scenario.label+" existing native Vite server")
      await probe(scenario.label,startUrl,basePath,
        scenario.mode==="dev"?browser.origin:undefined)
    }finally{
      // Bun can spawn a Vite child. Terminate only our dedicated process group.
      if(process.platform!=="win32"&&child.pid){
        try{process.kill(-child.pid,"SIGKILL")}catch{killProcess(child)}
      }else killProcess(child)
      await waitForLoopback(async()=>
        child.exitCode!==null||child.signalCode!==null,
        10000,scenario.label+" Vite process shutdown")
    }
  }
}

// Uses only the existing Mercur module middleware and its real built dashboard.
// This dedicated child terminates after invalidating its two genuine MFA sessions.
async function verifyAdminSmtp(browser:B06Chrome, denied:B06Chrome, container:any,
  person:string, otherPerson:string, q:(sql:string,args?:unknown[])=>Promise<any[]>,guard:SmtpResponsePrivacyGuard) {
  assert.equal(container.resolve("admin_ui").getServingMode(),"static")
  const secret=process.env.B22_SMTP_CANARY!
  assert.match(secret,/^b22-smtp-[0-9a-f]{48}$/)
  browser.secretCanary=secret;denied.secretCanary=secret
  // Real HTTPS egress is the privacy authority; CDP body request IDs
  // can expire on navigation. Retain separate Chrome console leak checks.
  assert.equal(guard.secret,secret)
  const assertPrivateResponses=()=>guard.assertNoLeaks()
  const path="/dashboard/settings/smtp"
  const evidence=process.env.B06_EVIDENCE_DIR!
  assert.equal(evidence,join(process.env.RUNNER_TEMP!,"b22-admin-smtp-evidence"))
  mkdirSync(evidence,{recursive:true})
  const completed:string[]=[]
  const mark=(scenario:string)=>{
    completed.push(scenario)
    writeFileSync(join(evidence,"completed-scenarios.json"),JSON.stringify({source:process.env.GITHUB_SHA,completed},null,2))
  }
  const open=async(b:B06Chrome)=>{
    assertPrivateResponses()
    b.phase='native-admin-smtp-navigation'
    await b.send("Page.navigate",{url:b.origin+path})
    try {await b.wait("document.body.textContent.includes('Platform SMTP Ayarları')")}
    catch(error){
      // Before any SMTP secret input: bounded diagnostics of this one native
      // navigation. No cookies, headers, HTML source or input values retained.
      await b.screenshot(join(evidence,"native-navigation-failed.png"))
      writeFileSync(join(evidence,"native-navigation-failed.json"),JSON.stringify({
        source:process.env.GITHUB_SHA,
        document:await b.eval("({onExpectedPath:location.pathname==='/dashboard/settings/smtp',headingPresent:document.body.textContent.includes('Platform SMTP Ayarları')})"),
        errors:b.runtimeErrors,
        http:b.http.filter(r=>r.phase===b.phase).map(({method,path,status})=>({method,path,status})),
      },null,2))
      throw error
    }
    assert.equal(await b.eval("location.pathname"),path)
  }
  const read=async(b:B06Chrome)=>{
    const response=await b.eval(`(async()=>{const r=await fetch('/personal/platform/smtp');return {status:r.status,body:await r.json()}})()`)
    // Inspect while this document still owns the completed response body.
    assertPrivateResponses()
    return response
  }
  const hidden=async(b:B06Chrome)=>b.wait("!document.querySelector('#smtp-host') && !document.body.textContent.includes('Yapılandırma yükleniyor')")
  const reload=async(b:B06Chrome,status:number)=>{
    // Inspect response bodies before navigating away from their document.
    assertPrivateResponses()
    const start=b.http.length
    await b.send("Page.reload",{ignoreCache:true})
    await until(async()=>b.http.slice(start).some(r=>r.path==='/personal/platform/smtp'&&r.method==='GET'&&r.status===status),
      20000,'New document SMTP GET '+status)
  }
  const digest=()=>q("select id,enabled,host,port,security,username,password_encrypted,from_email,from_name,version from da_platform_smtp_settings order by id")
  const before=await digest()
  assert.deepEqual(before,[],"Fresh dedicated SMTP database")
  // Negative checks precede any valid settings write.
  await verifyPanelCspModes(denied,container)
  await open(denied);await hidden(denied)
  // Test the actual production dashboard document, not a mocked header.
  // Only a synthetic .invalid host is attempted; no private information is
  // submitted to Mercur or any real remote service during this check.
  const policy=await denied.eval("document.querySelector('meta[http-equiv=Content-Security-Policy]')?.content||''")
  assert.ok(policy.includes("connect-src 'self'"),"Admin panel CSP must restrict external connections")
  const externalDenied=await denied.eval(`(async()=>{
    const testOrigin='https://dogruadres-csp-check.invalid';
    return await new Promise(resolve=>{
      let observed=false;
      const onViolation=event=>{
        if(event.effectiveDirective==='connect-src' && event.blockedURI.startsWith(testOrigin)){
          observed=true;
          document.removeEventListener('securitypolicyviolation',onViolation);
          resolve(true);
        }
      };
      document.addEventListener('securitypolicyviolation',onViolation);
      fetch(testOrigin+'/feedback',{method:'POST',body:'synthetic-only'}).catch(()=>{});
      setTimeout(()=>{document.removeEventListener('securitypolicyviolation',onViolation);resolve(observed)},700);
    });
  })()`)
  assert.equal(externalDenied,true,
    'Real Chrome must deny synthetic external Feedback-like POST via CSP')
  assert.equal((await read(denied)).status,403)
  assert.deepEqual(await digest(),before)
  mark("Unauthorized real MFA session GET403; no SMTP rows")
  const grant="da_staff_smtp_"+randomBytes(12).toString("hex")
  await q(`insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason)
    values($1,$2,'platform.smtp.manage','platform',$2,'B22 disposable SMTP acceptance fixture')`,[grant,person])
  await open(browser)
  await browser.wait("!!document.querySelector('#smtp-host')")
  const first=await read(browser)
  assert.equal(first.status,200);assert.equal(first.body.can_manage,true)
  assert.equal(first.body.settings.version,0)
  assert.equal(await browser.eval("document.querySelector('#smtp-host').value"),first.body.settings.host)
  mark("Native Admin render and explicitly granted MFA session GET200")
  await browser.screenshot(join(evidence,"authorized-read.png"))
  writeFileSync(join(evidence,"authorized-read.json"),JSON.stringify({
    source:process.env.GITHUB_SHA,nativeModule:"admin_ui",sameOrigin:true,
    realMfa:true,unauthorizedStatus:403,authorizedStatus:first.status,version:first.body.settings.version,
  },null,2))
  // DOM inputs and submit use real Chrome input events. SMTP remains disabled;
  // neither the separate send-test control nor any provider is invoked.
  if(await browser.eval("document.querySelector('#smtp-toggle').getAttribute('aria-checked')==='true'"))
    await browser.click("#smtp-toggle")
  const replace=async(selector:string,value:string)=>{
    await browser.click(selector)
    await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65})
    await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65})
    await browser.send("Input.insertText",{text:value})
  }
  await replace("#smtp-host","smtp.b22.example.invalid")
  await replace("#smtp-from-email","b22@example.invalid")
  await replace("#smtp-pass",secret)
  assert.equal(await browser.eval("document.querySelector('#smtp-host').value==='smtp.b22.example.invalid'"),true)
  assert.equal(await browser.eval("document.querySelector('#smtp-from-email').value==='b22@example.invalid'"),true)
  assert.equal(await browser.eval("document.querySelector('form').checkValidity()"),true)
  const saveStart=browser.http.length
  await browser.click("form button[type=submit]")
  try {await browser.wait("document.body.textContent.includes('Ayar sürümü: 1')")}
  catch(error){
    // Read back this one ambiguous attempt before the dedicated DB is retired.
    // Never retry its submit; retain no request payload or password/ciphertext.
    const posts=browser.http.slice(saveStart).filter(r=>r.path==='/personal/platform/smtp'&&r.method==='POST')
    // Diagnostic metadata only: never depend on a stale CDP response body.
    const responses=posts.map(post=>({status:post.status}))
    const state=await browser.eval(`({
      versionRendered:document.body.textContent.includes('Ayar sürümü: 1'),
      hostMatches:document.querySelector('#smtp-host')?.value==='smtp.b22.example.invalid',
      senderMatches:document.querySelector('#smtp-from-email')?.value==='b22@example.invalid',
      validity:Array.from(document.querySelectorAll('form input')).map(e=>({id:e.id,valid:e.validity.valid})),
    })`)
    const rows=await q("select id,enabled,version,host from da_platform_smtp_settings order by id")
    writeFileSync(join(evidence,"save-failed.json"),JSON.stringify({source:process.env.GITHUB_SHA,
      responses,state,rows,consoleSecretLeaked:browser.secretLeaks},null,2).replaceAll(secret,'[redacted]'))
    throw error
  }
  assertPrivateResponses()
  const saved=await digest()
  assert.equal(saved.length,1);assert.equal(saved[0].enabled,false)
  assert.equal(saved[0].host,"smtp.b22.example.invalid");assert.equal(saved[0].version,1)
  assert.match(saved[0].password_encrypted,/^v1:/)
  guard.bindCiphertext(saved[0].password_encrypted)
  assert.ok(!JSON.stringify(saved).includes(secret),"No plaintext persisted")
  const safe=await read(browser)
  assert.equal(safe.status,200);assert.equal(safe.body.settings.has_password,true)
  assert.ok(!JSON.stringify(safe).includes(secret))
  assert.equal(safe.body.settings.password,null);assert.ok(!('password_encrypted' in safe.body.settings))
  mark("Real browser save HTTP200; PG16 version1, disabled, encrypted password; GET secret null")
  await reload(browser,200)
  await browser.wait("document.body.textContent.includes('Ayar sürümü: 1')")
  assert.equal(await browser.eval("document.querySelector('#smtp-host').value"),saved[0].host)
  assert.equal(await browser.eval("document.querySelector('#smtp-pass').value"),"")
  await browser.screenshot(join(evidence,"saved-refreshed.png"))
  mark("New document refresh GET200 and persisted settings rendered; password input empty")
  // A stale real HTTP writer must not overwrite the newer browser save.
  const stale=await browser.eval(`(async()=>{const s=await(await fetch('/personal/session')).json();
    const r=await fetch('/personal/platform/smtp',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
    body:JSON.stringify({action:'save',enabled:false,host:'stale.example.invalid',port:465,security:'ssl',from_email:'b22@example.invalid',expected_version:0})});
    return {status:r.status,body:await r.json()}})()`)
  assert.equal(stale.status,409);assertPrivateResponses();assert.deepEqual(await digest(),saved)
  mark("Stale HTTP409 with unchanged PG16 settings")
  // Real database read failure, not a mocked successful API or component.
  await q("alter table da_platform_smtp_settings rename to b22_smtp_settings_fault")
  try {
    await reload(browser,500);await hidden(browser)
    assert.equal((await read(browser)).status,500)
  } finally {await q("alter table b22_smtp_settings_fault rename to da_platform_smtp_settings")}
  const enabled=process.env.DOGRUADRES_IDENTITY_ENABLED
  try {
    process.env.DOGRUADRES_IDENTITY_ENABLED="false"
    await reload(browser,503);await hidden(browser)
    assert.equal((await read(browser)).status,503)
  } finally {process.env.DOGRUADRES_IDENTITY_ENABLED=enabled}
  mark("Real GET500 and GET503 keep configuration form hidden")
  // Revoked grant denies even the original strong, genuine session.
  await q("update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1",[grant])
  await reload(browser,403);await hidden(browser)
  assert.equal((await read(browser)).status,403)
  mark("Revoked platform grant GET403 and form hidden")
  // Give B an explicit grant, prove its real MFA session, then expire it.
  await q(`insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason)
    values($1,$2,'platform.smtp.manage','platform',$2,'B22 disposable expiry fixture')`,[grant+"_b",otherPerson])
  assert.equal((await read(denied)).status,200)
  const bHash=createHash('sha256').update(await denied.token()).digest('hex')
  await q("update da_browser_session set created_at=clock_timestamp()-interval '30 days' where id=$1",[bHash])
  assert.equal((await read(denied)).status,403)
  await reload(denied,403);await hidden(denied)
  mark("Expired real session GET403 and form hidden")
  // A receives a new explicit fixture grant; a terminal DB fixture then revokes
  // its genuine session. No session is fabricated or restored by the test.
  await q(`insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason)
    values($1,$2,'platform.smtp.manage','platform',$2,'B22 disposable revocation fixture')`,[grant+"_a",person])
  assert.equal((await read(browser)).status,200)
  const aHash=createHash('sha256').update(await browser.token()).digest('hex')
  await q("update da_browser_session set status='revoked' where id=$1",[aHash])
  assert.equal((await read(browser)).status,403)
  await reload(browser,403);await hidden(browser)
  mark("Revoked real session GET403 and form hidden")
  assert.deepEqual(await digest(),saved)
  await guard.assertComplete()
  for(const b of [browser,denied]){
    assertPrivateResponses()
    assert.equal(b.secretLeaks,false,"Secret in Chrome protocol/console")
  }
  assert.ok(browser.http.some(r=>r.path===path&&r.status===200&&r.tls))
  assert.ok(browser.http.some(r=>r.path==='/personal/platform/smtp'&&r.method==='POST'&&r.status===200))
  writeFileSync(join(evidence,"acceptance.json"),JSON.stringify({
    source:process.env.GITHUB_SHA,sameOrigin:true,nativeModule:"admin_ui",servingMode:"static",
    syntheticOnly:true,smtpEnabled:false,versionBefore:0,versionAfter:1,
    scenarios:["MFA and explicit grant GET200","browser save and PostgreSQL readback","refresh",
      "stale409 unchanged","unauthorized403","expired403","revoked403","GET500 form hidden","GET503 form hidden"],
    http:[...browser.http,...denied.http].map(({method,path,status,tls})=>({method,path,status,tls})),
  },null,2))
  process.stdout.write("PASS B22 Chrome: native Admin SMTP same-origin MFA/grant GET200, browser save/version/PG16/refresh, stale409 unchanged, unauthorized/expired/revoked403, real500/503 form hidden; disabled synthetic SMTP, no send\n")
}

async function verifyMembershipNonDisclosure({
  organizationId,activeId,foreignId,personId,browser,foundation,q
}:{
  organizationId:string;activeId:string;foreignId:string;personId:string
  browser:B06Chrome;foundation:any;q:(sql:string,args?:unknown[])=>Promise<any[]>
}):Promise<void>{
  // Extra synthetic target only in the existing task-owned CI database.
  // The real Owner and the authenticated unauthorized Member stay untouched.
  const [revokedPerson]=await foundation.createPeople([{}])
  const [revoked]=await foundation.createMemberships([{
    organization_id:organizationId,person_id:revokedPerson.id,role:"member",
    status:"revoked",protected_owner:false,revoked_at:new Date()
  }])
  const missingId="daomem_"+randomBytes(16).toString("hex")
  const targets=[{kind:"active",id:activeId},{kind:"missing",id:missingId},
    {kind:"foreign",id:foreignId},{kind:"revoked",id:revoked.id}]
  const rows=await q(`select id,organization_id,status,revoked_at
    from da_organization_membership where id=any($1::text[])`,[targets.map(t=>t.id)])
  assert.equal(rows.length,3,"Exactly three real targets and one nonexistent target")
  assert.ok(rows.some(r=>r.id===activeId&&r.organization_id===organizationId&&r.status==="active"))
  assert.ok(rows.some(r=>r.id===foreignId&&r.organization_id!==organizationId&&r.status==="active"))
  assert.ok(rows.some(r=>r.id===revoked.id&&r.organization_id===organizationId&&r.status==="revoked"&&r.revoked_at))
  await browser.send("Page.bringToFront")
  await browser.wait("document.visibilityState==='visible'")
  const token=await browser.token()
  assert.match(token??"",/^[A-Za-z0-9_-]{43}$/)
  const sessionRows=await q(`select s.person_id,s.status,s.last_strong_auth_at,s.csrf_hash,
    statement_timestamp()<s.last_strong_auth_at+p.recent_auth_seconds*interval '1 second' recent
    from da_browser_session s cross join da_session_policy p where s.id=$1 and p.id='current'`,
    [createHash("sha256").update(token!).digest("hex")])
  assert.equal(sessionRows.length,1)
  assert.equal(sessionRows[0].person_id,personId)
  assert.equal(sessionRows[0].status,"active")
  assert.ok(sessionRows[0].last_strong_auth_at,"Real native MFA-completed session required")
  assert.equal(sessionRows[0].recent,true,"Sensitive HTTP must have recent strong authentication")
  const actor=await q(`select role,status,protected_owner from da_organization_membership
    where organization_id=$1 and person_id=$2 and deleted_at is null`,[organizationId,personId])
  assert.deepEqual(actor,[{role:"member",status:"active",protected_owner:false}])
  // One current CSRF value, same cookie, Organization, operation and role;
  // only membership_id changes. Keep CSRF/cookie out of evidence.
  const session=await browser.eval(`(async()=>{
    const r=await fetch('/personal/session');return {status:r.status,body:await r.json()}
  })()`)
  assert.equal(session.status,200)
  assert.match(session.body.csrf_token,/^[A-Za-z0-9_-]{43}$/)
  assert.equal(createHash("sha256").update(session.body.csrf_token).digest("hex"),
    sessionRows[0].csrf_hash,"CSRF must match the persisted session, not cause a false 403")
  const snapshot=async()=>{
    const state:Record<string,unknown>={}
    for(const table of ["da_organization_membership","da_audit_event",
      "da_audit_outbox","da_security_outbox"])
      state[table]=await q(`select id,md5(to_jsonb(t)::text) fingerprint from ${table} t order by id`)
    return state
  }
  const before=await snapshot()
  for(const target of targets){
    const response=await browser.eval(`(async()=>{
      const r=await fetch('/personal/memberships',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':${JSON.stringify(session.body.csrf_token)}},
        body:JSON.stringify({action:'role',organization_id:${JSON.stringify(organizationId)},
          membership_id:${JSON.stringify(target.id)},role:'member'})})
      return {status:r.status,body:await r.json()}
    })()`)
    // Read back even on an unexpected response before stopping; no retry.
    assert.deepEqual(await snapshot(),before,
      "Unauthorized "+target.kind+" target must leave all membership/audit/outbox rows unchanged")
    assert.equal(response.status,403,"Non-disclosing HTTP denial for "+target.kind)
    assert.deepEqual(response.body,{message:"Access denied"},
      "All target states must return the same safe body: "+target.kind)
    assert.equal(await browser.token(),token,"All four requests must retain the same session")
    process.stdout.write("PASS B22 Chrome: membership non-disclosure "+target.kind+
      " target HTTP403 identical safe body; PG16 membership/canonical audit/audit outbox/security outbox unchanged\n")
  }
}

// Keep this bounded real Chrome/PG16 policy check independent of the already
// large native acceptance runner, without suppressing TypeScript checking.
async function verifyOwnerMembershipManagePolicy({
  organizationId,targetMembershipId,ownerPersonId,ownerActorId,browser,foundation,q
}:{
  organizationId:string;targetMembershipId:string;ownerPersonId:string;ownerActorId:string
  browser:B06Chrome;foundation:any;q:(sql:string,args?:unknown[])=>Promise<any[]>
}):Promise<void>{
    // The same task-owned ordinary Alpha membership must survive a centrally
    // narrowed Owner membership.manage policy, including direct native service
    // calls. Read-only member.list remains separate and available.
    const membershipPolicyRows=await q(`select id,person_id,role,status,protected_owner,revoked_at
      from da_organization_membership where organization_id=$1 order by id`,
      [organizationId])
    const membershipPolicyAudits=await q(`select id from da_audit_event
      where organization_id=$1 order by id`,[organizationId])
    const membershipPolicyOutboxes=await q(`select x.id from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.organization_id=$1 order by x.id`,[organizationId])
    const membershipChangedAuditBefore=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.organization_id=$1 and e.target_id=$2
        and e.action='organization.membership_changed'`,[organizationId,targetMembershipId])
    const oldMembershipActions=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="buyer.purchase,products.edit,invitation.manage,membership.list"
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const ownerList=await browser.eval(`(async()=>{
        const org=${JSON.stringify(organizationId)};
        return (await fetch('/personal/memberships?organization='+org)).status;
      })()`)
      assert.equal(ownerList,200,
        "Legacy settings cannot narrow current protected Owner membership access")
      assert.deepEqual(await q(`select id,person_id,role,status,protected_owner,revoked_at
        from da_organization_membership where organization_id=$1 order by id`,
        [organizationId]),membershipPolicyRows,
        "Denied membership.manage must not change membership or protected Owner state")
      assert.deepEqual(await q(`select id from da_audit_event
        where organization_id=$1 order by id`,[organizationId]),
        membershipPolicyAudits,"Denied membership.manage cannot append audit")
      assert.deepEqual(await q(`select x.id from da_audit_outbox x
        join da_audit_event e on e.id=x.source_audit_event_id
        where e.organization_id=$1 order by x.id`,[organizationId]),
        membershipPolicyOutboxes,"Denied membership.manage cannot append audit outbox")
    }finally{
      if(oldMembershipActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=oldMembershipActions
    }
    // Preserve the approved no-Admin rule in real HTTP. Only a historical
    // Admin may be reduced to Member. The disposable test-only legacy fixture
    // is prepared with SQL, never through a visitor-facing Admin promotion.
    const legacyFixture=await q(`update da_organization_membership
      set role='admin',protected_owner=false,updated_at=clock_timestamp()
      where id=$1 and role='member' and protected_owner=false and status='active'
      returning id`,[targetMembershipId])
    assert.equal(legacyFixture.length,1,
      "Task-only existing Member can represent an old Admin for non-escalating acceptance")
    const restoredMembership=await browser.eval(`(async()=>{
      const org=${JSON.stringify(organizationId)}
      const member=${JSON.stringify(targetMembershipId)}
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/memberships',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify({action:'role',organization_id:org,membership_id:member,role:'member'})})
      return {status:response.status,
        role:response.status===200?(await response.json()).membership?.role:null}
    })()`)
    assert.deepEqual(restoredMembership,{status:200,role:"member"},
      "Protected Owner must be able to reduce a historical Admin to ordinary Member")
    const finalMembershipState=await q(`select role,status,protected_owner,revoked_at
      from da_organization_membership where id=$1`,[targetMembershipId])
    assert.deepEqual(finalMembershipState,[{role:"member",status:"active",
      protected_owner:false,revoked_at:null}],
      "Owner role acceptance must restore the test Member's exact state")
    const membershipChangedAudit=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.organization_id=$1 and e.target_id=$2
        and e.action='organization.membership_changed'`,
      [organizationId,targetMembershipId])
    assert.equal(membershipChangedAudit[0].n,membershipChangedAuditBefore[0].n+1,
      "The one real legacy Admin -> Member transition needs one canonical audit/outbox")
    process.stdout.write("PASS B22 Owner role policy: fixed membership.manage under legacy setting; real Owner HTTP legacy Admin reduction audited\n")
}
 
// Dedicated real Chrome/PG16 audit timeline read-policy verification.
// Keeps strict source/audit observation independent of the large B22 body.
async function verifyOwnerAuditTimelinePolicy({
  organizationId,adminMembershipId,browser,reviewer,q
}:{
  organizationId:string;adminMembershipId:string
  browser:B06Chrome;reviewer:B06Chrome
  q:(sql:string,args?:unknown[])=>Promise<any[]>
}):Promise<void>{
  const originalOwnerActions=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
  const originalCursorKey=process.env.DOGRUADRES_AUDIT_CURSOR_KEY
  const membershipBefore=await q(`select id,role,status,protected_owner,revoked_at
    from da_organization_membership where organization_id=$1 order by id`,[organizationId])
  const eventsBefore=await q(`select id from da_audit_event
    where organization_id=$1 order by id`,[organizationId])
  const outboxBefore=await q(`select x.id from da_audit_outbox x
    join da_audit_event e on e.id=x.source_audit_event_id
    where e.organization_id=$1 order by x.id`,[organizationId])
  try{
    // Task-only fresh cursor signing key; never print it or persist in GitHub.
    process.env.DOGRUADRES_AUDIT_CURSOR_KEY=randomBytes(32).toString("base64")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    const ownerDefault=await browser.eval(`(async()=>{
      const r=await fetch('/personal/audit-timeline?organization='+${JSON.stringify(organizationId)})
      return r.status
    })()`)
    assert.equal(ownerDefault,200,"Default protected Owner can read scoped audit timeline")
    // This is a disposable ordinary Member, never a protected Owner.
    await q("update da_organization_membership set role='admin',protected_owner=false,updated_at=clock_timestamp() where id=$1",[adminMembershipId])
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=
        "buyer.purchase,products.edit,invitation.manage,membership.manage,membership.list"
      const deniedOwner=await browser.eval(`(async()=>{
        const r=await fetch('/personal/audit-timeline?organization='+${JSON.stringify(organizationId)})
        const body=await r.json()
        return {status:r.status,privateItems:Object.hasOwn(body,'items'),message:body.message}
      })()`)
      assert.equal(deniedOwner.status,200,"Protected Owner audit permission cannot be reduced by legacy setting")
      assert.equal(deniedOwner.privateItems,true,"Protected Owner retains scoped private audit items")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      const adminRead=await reviewer.eval(`(async()=>{
        const r=await fetch('/personal/audit-timeline?organization='+${JSON.stringify(organizationId)})
        const body=await r.json()
        return {status:r.status,privateItems:Object.hasOwn(body,'items')}
      })()`)
      assert.deepEqual(adminRead,{status:403,privateItems:false},
        "Role-only Admin must never receive private audit timeline items")
    }finally{
      if(originalOwnerActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=originalOwnerActions
      await q("update da_organization_membership set role='member',protected_owner=false,updated_at=clock_timestamp() where id=$1",[adminMembershipId])
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
    }
    const restoredOwner=await browser.eval(`(async()=>{
      return (await fetch('/personal/audit-timeline?organization='+${JSON.stringify(organizationId)})).status
    })()`)
    assert.equal(restoredOwner,200,"Restored Owner role can again read audit timeline")
    assert.deepEqual(await q(`select id,role,status,protected_owner,revoked_at
      from da_organization_membership where organization_id=$1 order by id`,[organizationId]),
      membershipBefore,"Audit read permission denial must not mutate memberships")
    assert.deepEqual(await q(`select id from da_audit_event
      where organization_id=$1 order by id`,[organizationId]),
      eventsBefore,"Audit read permission denial must not write source audit")
    assert.deepEqual(await q(`select x.id from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.organization_id=$1 order by x.id`,[organizationId]),
      outboxBefore,"Audit read permission denial must not write outbox")
    process.stdout.write("PASS B22 Owner role policy: fixed audit.timeline.read keeps Owner HTTPS200 and Admin403; PG16 membership/audit/outbox unchanged\n")
  }finally{
    if(originalOwnerActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=originalOwnerActions
    if(originalCursorKey===undefined)delete process.env.DOGRUADRES_AUDIT_CURSOR_KEY
    else process.env.DOGRUADRES_AUDIT_CURSOR_KEY=originalCursorKey
  }
}

// Existing native Organization route is deliberately gated by nativeIngress:
// this checks real Foundation/PG16 authorization without pretending a direct
// resolver call is an authenticated HTTP request. Do NOT open the native route.
async function verifyNativeOrganizationReadPolicy({
  container,ownerActor,memberActor,memberPersonId,alphaOrg,betaOrg,foreignOrg,browser,q
}:{
  container:any;ownerActor:string;memberActor:string;memberPersonId:string
  alphaOrg:string;betaOrg:string;foreignOrg:string
  browser:B06Chrome;q:(sql:string,args?:unknown[])=>Promise<any[]>
}):Promise<void>{
  const requestFor=(actor_id:string)=>({
    auth_context:{actor_id,actor_type:"user"},
    scope:container.createScope()
  }) as any
  const A=requestFor(ownerActor),B=requestFor(memberActor)
  const old=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
  const before=await q(`select id,role,status,protected_owner,revoked_at
    from da_organization_membership where organization_id=$1 order by id`,[alphaOrg])
  const beforeAudit=await q(`select id from da_audit_event
    where organization_id=$1 order by id`,[alphaOrg])
  const beforeOutbox=await q(`select x.id from da_audit_outbox x
    join da_audit_event e on e.id=x.source_audit_event_id
    where e.organization_id=$1 order by x.id`,[alphaOrg])
  const nativeGet=async(actor:any,org:string)=>
    requireOrganizationAccess(actor,org,"organization.read")
  try{
    delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    await nativeGet(A,alphaOrg)
    // The current scoped Medusa native read path remains ingress-closed.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    const nativeHttp=await browser.eval(`(async()=>{
      const response=await fetch('/dogruadres/organizations/'+${JSON.stringify(alphaOrg)})
      return {status:response.status,body:await response.json()}
    })()`)
    assert.deepEqual(nativeHttp,{status:401,
      body:{message:"Personal session ingress required"}},
      "Do not authorize the native HTTP namespace without an approved actor credential adapter")
    process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=
      "buyer.purchase,products.edit,invitation.manage,membership.manage,membership.list,audit.timeline.read"
    assert.equal((await nativeGet(A,alphaOrg)).organizationId,alphaOrg,
      "Protected Owner native read remains allowed despite legacy setting")
    const member=await nativeGet(B,alphaOrg)
    assert.equal(member.organizationId,alphaOrg,"Actual active Member retains scoped Organization read")
    const admin=await nativeGet(A,betaOrg)
    assert.equal(admin.organizationId,betaOrg,"Actual active Admin retains scoped Organization read")
    await assert.rejects(nativeGet(B,foreignOrg),/Organization access denied/,
      "Foreign Organization remains denied regardless of Owner role policy")
    const roleOnly=await q(`select id from da_organization_membership
      where organization_id=$1 and person_id=$2 and status='active'`,[alphaOrg,memberPersonId])
    assert.equal(roleOnly.length,1)
    // The previous role is restored exactly; no protected Owner is mutated.
    await q("update da_organization_membership set role='owner',protected_owner=false,updated_at=clock_timestamp() where id=$1",[roleOnly[0].id])
    try{
      await assert.rejects(nativeGet(B,alphaOrg),/Organization access denied/,
        "An unprotected Owner role must not read the Organization")
    }finally{
      await q("update da_organization_membership set role='member',protected_owner=false,updated_at=clock_timestamp() where id=$1",[roleOnly[0].id])
    }
  }finally{
    if(old===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=old
  }
  assert.equal((await nativeGet(A,alphaOrg)).organizationId,alphaOrg,
    "Restored current protected Owner can again read Organization")
  assert.deepEqual(await q(`select id,role,status,protected_owner,revoked_at
    from da_organization_membership where organization_id=$1 order by id`,[alphaOrg]),
    before,"Denied read must not persist membership state")
  assert.deepEqual(await q(`select id from da_audit_event
    where organization_id=$1 order by id`,[alphaOrg]),
    beforeAudit,"Denied native Organization read must not append canonical audit")
  assert.deepEqual(await q(`select x.id from da_audit_outbox x
    join da_audit_event e on e.id=x.source_audit_event_id
    where e.organization_id=$1 order by x.id`,[alphaOrg]),
    beforeOutbox,"Denied native Organization read must not append audit outbox")
  process.stdout.write("PASS B22 native organization.read role policy: protected Owner remains allowed with legacy setting; Admin/Member unchanged, foreign/role-only Owner denied, native ingress401\n")
}

/** Real B22 Store rename REQUEST only: no native name/handle mutation or
 * 30-day release is claimed. Uses current disposable Chrome and PG16 Owner.
 */
async function verifyOwnerStoreRenameRequest(
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
      "const r=await fetch('/personal/store-rename-requests',{method:'POST',"+
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
         input.startsWith('/personal/organization-stores?')){
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
    "async function(org,id){const r=await fetch('/personal/store-rename-requests?'+new URLSearchParams({"+
    "organization_id:org,seller_id:id}));return r.status}",org,storeId)
  assert.equal(privateRead,403,"Foreign Owner cannot see proposed private name")
  process.stdout.write("PASS B22 Chrome/PG16: Owner Store name+URL change request with explicit risk acknowledgement, one private pending record and audit/outbox; foreign/CSRF/invalid/duplicate denied; native Seller unchanged\n")
  // Platform Store approver is a distinct current Person. An ordinary Owner
  // may not even see the pending name-change queue.
  assert.equal(await browser.eval("(async()=>{return (await fetch('/personal/platform/store-renames')).status})()"),
    403,"Organization Owner may not inspect platform rename queue")
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible' && "+
    "!document.getElementById('workspace').hidden")
  // Distinguish a server-side authorization/SQL error from asynchronous
  // visibility-driven refresh. Never treat a hidden panel as proof of 403.
  const reviewQueue=await reviewer.eval("(async()=>{const r=await fetch('/personal/platform/store-renames?page=0');"+
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
         input.startsWith('/personal/platform/store-renames?')){
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
      const r=await fetch('/personal/platform/store-renames',{method:'POST',
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
    const r=await fetch('/personal/platform/store-renames',{method:'POST',
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
    const r=await fetch('/personal/platform/store-renames',{
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
    "async function(org,seller){const r=await fetch('/personal/store-rename-requests?'+new URLSearchParams({"+
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
async function verifyConcurrentOwnerStoreRenameRequests(
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
      const r=await fetch('/personal/store-rename-requests',{
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
async function verifyPlatformStoreRenameApproval(
  owner:B06Chrome,reviewer:B06Chrome,org:string,storeId:string,
  q:(sql:string,params?:any[])=>Promise<any[]>
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
    const r=await fetch('/personal/platform/store-renames',{
      method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
      body:JSON.stringify(${JSON.stringify(proposal)})
    });return r.status
  })()`)
  assert.equal(ownerDenied,403)
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  const csrfDenied=await reviewer.eval(`(async()=>{
    const r=await fetch('/personal/platform/store-renames',{
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
  await reviewer.wait("document.getElementById('store-rename-review-status').textContent.includes('etkinleşti')")
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
    const r=await fetch('/personal/store-applications',{
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
    const r=await fetch('/personal/platform/store-renames',{
      method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
      body:JSON.stringify(${JSON.stringify(proposal)})
    });return r.status
  })()`)
  assert.equal(again,409,"Second approval must not repeat native name change")
  const ret=await reviewer.eval(`(async()=>{
    const s=await(await fetch('/personal/session')).json()
    const r=await fetch('/personal/platform/store-renames',{
      method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
      body:JSON.stringify(${JSON.stringify({...proposal,action:"reject",
        reason:"Previously approved Store cannot also be rejected"})})
    });return r.status
  })()`)
  assert.equal(ret,409,"An approved rename may not be rejected")
  await owner.send("Page.bringToFront")
  await owner.wait("document.visibilityState==='visible'")
  const history=await owner.callFunction(
    "async function(org,seller){const r=await fetch('/personal/store-rename-requests?'+new URLSearchParams({organization_id:org,seller_id:seller}));return {status:r.status,body:await r.json()}}",
    org,storeId)
  assert.equal(history.status,200)
  assert.equal(history.body.requests.find((x:any)=>x.id===request.id)?.status,"approved")
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: Staff approves native Seller name+handle via real UI; same Store identity, Owner private readback, original name+URL held 30 days, Owner/CSRF/repeat/conflicting reject denied, one durable audit/outbox\n")
}




/** B22 task-only fixture: a real approved native rename precedes the
 * exceptional name-right assignment. Kept outside the main acceptance body
 * so the oversized full-platform script stays within TypeScript CFA limits.
 */
async function preparePreviouslyRenamedStoreForTransfer(input:{
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
async function verifySuspendedStoreRenameBeforeReopen(
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
    const http=owner.http.filter((x:any)=>x.path==="/personal/store-rename-requests")
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
    "const r=await fetch('/personal/platform/store-renames',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return r.status}",JSON.stringify(decision))
  assert.equal(unauthorized,403,"An Owner cannot approve even a suspended Store rename")
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  const invalidCsrf=await reviewer.callFunction(
    "async function(payload){const r=await fetch('/personal/platform/store-renames',"+
    "{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'invalid'},"+
    "body:payload});return r.status}",JSON.stringify(decision))
  assert.equal(invalidCsrf,403)
  const forged=await reviewer.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/platform/store-renames',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return r.status}",JSON.stringify({...decision,organization_id:organizationId}))
  assert.equal(forged,400,"Staff request may not fabricate Organization authority")
  await reviewer.click("#store-rename-review-refresh")
  await reviewer.wait("Array.from(document.querySelectorAll('#store-rename-review-list > div')).some("+
    "e=>e.textContent.includes("+JSON.stringify(name)+") && e.textContent.includes('Askıda'))")
  const queue=await reviewer.callFunction(
    "async function(id){const r=await fetch('/personal/platform/store-renames?page=0');"+
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
    "const r=await fetch('/personal/platform/store-renames',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return r.status}",JSON.stringify(decision)),409,
    "The same approval cannot be replayed")
  const application=(await q("select id from da_store_application where seller_id=$1",[sellerId]))[0]
  assert.ok(application?.id)
  const openAction={action:"unsuspend",application_id:application.id,seller_id:sellerId}
  const ownerOpen=await owner.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/platform/stores',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return r.status}",JSON.stringify(openAction))
  assert.equal(ownerOpen,403,"Owner still cannot self-approve an open Store")
  const staffOpened=await reviewer.callFunction(
    "async function(payload){const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/platform/stores',{method:'POST',"+
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
    "const r=await fetch('/personal/platform/stores',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
    "body:payload});return r.status}",JSON.stringify(openAction))),409)
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: suspended Store Owner requests new name, Staff approves unchanged Store ID and suspended status with one audit/outbox, explicit later Staff unsuspend succeeds; Owner/CSRF/forged/replay denied\n")
}

/** Disposable real Staff/Owner UI + PostgreSQL: only a previously approved
 * suspended Store retaining its verified name/handle may be reopened. */
async function verifyStaffReopensSuspendedStore(
  owner:B06Chrome,reviewer:B06Chrome,organizationId:string,organizationName:string,
  sellerId:string,container:any,q:(sql:string,params?:any[])=>Promise<any[]>
):Promise<void>{
  const before=(await q("select id,name,handle,status,approved_at from seller where id=$1",
    [sellerId]))[0]
  assert.equal(before.status,"open")
  assert.ok(before.approved_at)
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
      const r=await fetch('/personal/platform/stores',{
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
      r.path==="/personal/platform/stores" && r.method==="GET").length
    await reviewer.eval("document.getElementById('store-approval-refresh').focus()")
    assert.equal(await reviewer.eval(
      "document.activeElement?.id==='store-approval-refresh'"),true,
      "Staff refresh must be keyboard-focusable")
    await reviewer.send("Input.dispatchKeyEvent",{
      type:"keyDown",key:" ",code:"Space",text:" ",windowsVirtualKeyCode:32})
    await reviewer.send("Input.dispatchKeyEvent",{
      type:"keyUp",key:" ",code:"Space",windowsVirtualKeyCode:32})
    await until(async()=>reviewer.http.filter(r=>
      r.path==="/personal/platform/stores" && r.method==="GET").length>
      wcagKeyboardBefore,12000,"real Space refresh GET")
    await reviewer.wait("Array.from(document.querySelectorAll('#store-reactivation-list p'))"+
      ".some(e=>e.textContent.includes("+JSON.stringify(sellerId)+") && "+
      "e.textContent.includes('Ad/URL hakkı doğrulanamadı') && "+
      "e.querySelector('button')?.disabled===true)")
    process.stdout.write("PASS WCAG 2.2 partial keyboard: live Staff refresh Space invokes authorized GET, unsafe reopen remains disabled\n")
    const preflight=await reviewer.callFunction(
      "async function(id){const r=await fetch('/personal/platform/stores?page=0');"+
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
        and e.organization_id=$1 and e.target_id=$2`,[organizationId,sellerId])
    assert.equal(audited.length,1,"Exactly one completed canonical audit/outbox")
    assert.equal(audited[0].new_values.application_id,target.application_id)
    assert.equal(audited[0].new_values.resolution_confirmed,true)
    assert.ok(audited[0].outbox_id)
    const notices=await q(`select count(*)::int n from da_notification_receipt n
      where n.audit_event_id=$1`,[audited[0].id])
    assert.ok(notices[0].n>=1,"The current Owner has a private receipt")
    assert.equal((await post(reviewer,target)).status,409,"Replay must not open a second time")
    assert.equal((await q(`select count(*)::int n from da_audit_event
      where action='organization.store_reactivated' and target_id=$1`,
      [sellerId]))[0].n,1)
    await owner.send("Page.bringToFront")
    await owner.wait("document.visibilityState==='visible'")
    await owner.select(organizationName,"owner")
    await owner.wait("document.getElementById('org-stores').textContent.includes("+
      JSON.stringify(before.name)+")")
    const notification=await owner.callFunction(
      "async function(org){const r=await fetch('/personal/notifications?organization='+encodeURIComponent(org));return {status:r.status,body:await r.json()}}",
      organizationId)
    assert.equal(notification.status,200,"The current protected Owner may read private reactivation notice")
    assert.ok(notification.body.notifications.some((n:any)=>
      n.title==="Mağaza yeniden açıldı" && n.context===organizationName),
      "The native Store reactivation audit receipt must appear in the actual Owner notification UI")
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: Staff safely unsuspends same approved Store via real UI; current name/handle/ID preserved, paused new applications allowed, forged/CSRF/Owner/name-conflict/replay denied, one durable audit/outbox and Owner readback\n")

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
      assert.equal(claims.length,2,
        "Both native opening cycles must have an independently committed claim")
      assert.ok(claims[1].outbox_id)
      const completed=await q(`select id from da_audit_event
        where action='organization.store_reactivated'
          and organization_id=$1 and target_id=$2`,[organizationId,sellerId])
      assert.equal(completed.length,1,
        "The injected second completion transaction must not partially commit")
      assert.equal((await post(reviewer,target)).status,409,
        "Do not unsuspend an already open native Seller again")
    }finally{
      await q("drop trigger if exists b22_reactivation_audit_fault on da_audit_outbox")
      await q("drop function if exists b22_reactivation_audit_fault()")
    }
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
    assert.equal(finished.length,2,"One completed event per suspension/claim")
    assert.notEqual(finished[0].claim_id,finished[1].claim_id)
    assert.ok(finished.every((v:any)=>v.outbox_id))
    const notices2=await q(`select count(*)::int n
      from da_notification_receipt where audit_event_id in
        (select id from da_audit_event
          where action='organization.store_reactivated'
            and organization_id=$1 and target_id=$2)`,[organizationId,sellerId])
    assert.ok(notices2[0].n>=2,"Current Owner gets one private completion receipt per cycle")
    assert.equal((await post(reviewer,{...target,action:"reconcile"})).status,409)
    assert.equal((await post(reviewer,target)).status,409)
    assert.equal((await q(`select count(*)::int n from da_audit_event
      where action='organization.store_reactivated'
        and organization_id=$1 and target_id=$2`,[organizationId,sellerId]))[0].n,2)
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
    assert.equal(completions[0].n,3,
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
async function verifyOwnerWithdrawPendingStoreRename(
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
    const r=await fetch('/personal/store-rename-requests',{
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
    const r=await fetch('/personal/platform/store-renames',{
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
async function verifyRealNextStorefrontRenameUrls(
  container:any,blockedOrigin:string,publishableKey:string,
  storeId:string,temporaryDirectory:string,
  q:(sql:string,params?:any[])=>Promise<any[]>
):Promise<void>{
  const rows=await q("select old_name,old_handle,proposed_name,proposed_handle "+
    "from da_store_rename_request where seller_id=$1 and status='approved' "+
    "order by approved_at desc limit 3",[storeId])
  assert.equal(rows.length,2,
    "One earlier approved rename and one subsequent suspended rename must remain historical")
  assert.equal(rows[0].old_name,rows[1].proposed_name,
    "The newer name must be connected to the immutable preceding name history")
  assert.equal(rows[0].old_handle,rows[1].proposed_handle,
    "The newer URL must descend from the previous approved Store URL")
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
async function verifyOwnerSubmittedMemberDraft(
  reviewer:B06Chrome,browser:B06Chrome,
  organizations:{id:string;name:string}[],rand:string,
  ownerPersonId:string,native:any,
  q:(sql:string,params?:any[])=>Promise<any[]>
):Promise<void>{
      // An earlier Member prepared a durable Beta draft; their explicit draft
      // permission was revoked. Only Beta's independently authenticated,
      // protected Owner can now submit that SAME saved version. Reuse Mercur
      // native Seller workflow; no second Seller mechanism or private payload.
      const submittedDraftName="B22 delegate "+rand
      const [ownerReviewedDraft]=await q(`select id,name,email,version,status
        from da_store_application_draft where organization_id=$1 and name=$2`,
        [organizations[1].id,submittedDraftName])
      assert.ok(ownerReviewedDraft)
      assert.equal(ownerReviewedDraft.status,"draft")
      assert.equal(ownerReviewedDraft.version,1)
      await reviewer.select(organizations[1].name,"owner")
      await reviewer.wait("Array.from(document.querySelectorAll('#store-application-list p')).some("+
        "p=>p.textContent.includes("+JSON.stringify(submittedDraftName)+") && "+
        "Array.from(p.querySelectorAll('button')).some(b=>b.textContent==='Bu taslağı resmî başvuruya gönder'))")
      const unauthorizedDraftSubmit=await browser.callFunction(
        "async function(org,id){const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/store-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify({action:'submit_draft',organization_id:org,draft_id:id,"+
        "expected_version:1,application_id:'daapp_'+'b'.repeat(32)})});return r.status}",
        organizations[1].id,ownerReviewedDraft.id)
      assert.equal(unauthorizedDraftSubmit,403,
        "Revoked Member cannot convert a retained company draft into Seller")
      const deniedSubmitCsrf=await reviewer.callFunction(
        "async function(org,id){const r=await fetch('/personal/store-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':'invalid'},"+
        "body:JSON.stringify({action:'submit_draft',organization_id:org,draft_id:id,"+
        "expected_version:1,application_id:'daapp_'+'c'.repeat(32)})});return r.status}",
        organizations[1].id,ownerReviewedDraft.id)
      assert.equal(deniedSubmitCsrf,403,"Owner draft submission requires first-party CSRF")
      await reviewer.click("#store-application-list p button:nth-of-type(2)")
      await reviewer.wait("document.getElementById('store-application-status').textContent.includes('Taslak başvuruya gönderildi')")
      const [sentDraft]=await q(`select status,version,name,email,submitted_application_id
        from da_store_application_draft where id=$1`,[ownerReviewedDraft.id])
      assert.equal(sentDraft.status,"submitted")
      assert.equal(sentDraft.version,1)
      assert.equal(sentDraft.name,submittedDraftName)
      assert.equal(sentDraft.email,ownerReviewedDraft.email)
      assert.match(sentDraft.submitted_application_id,/^daapp_[0-9a-f]{32}$/)
      const [submittedApplication]=await q(`select id,status,seller_id,person_id
        from da_store_application where id=$1`,[sentDraft.submitted_application_id])
      assert.equal(submittedApplication.id,sentDraft.submitted_application_id)
      assert.equal(submittedApplication.status,"created")
      assert.equal(submittedApplication.person_id,ownerPersonId)
      assert.match(submittedApplication.seller_id,/^sel_[A-Za-z0-9_-]+$/)
      const [sellerFromDraft]=await native.listSellers({id:submittedApplication.seller_id})
      assert.equal(sellerFromDraft.name,ownerReviewedDraft.name)
      assert.equal(sellerFromDraft.status,"pending_approval")
      assert.equal(sellerFromDraft.approved_at,null)
      const submittedAudit=await q(`select e.actor_person_id,e.new_values,x.id as outbox_id
        from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
        where e.action='organization.store_application_created'
          and e.organization_id=$1 and e.target_id=$2`,
        [organizations[1].id,submittedApplication.seller_id])
      assert.equal(submittedAudit.length,1)
      assert.equal(submittedAudit[0].actor_person_id,ownerPersonId)
      assert.equal(submittedAudit[0].new_values.draft_id,ownerReviewedDraft.id)
      assert.equal(submittedAudit[0].new_values.draft_version,1)
      const ownerDraftPost=async(id:string,version:number)=>
        reviewer.callFunction("async function(org,draft,app,ver){"+
          "const s=await(await fetch('/personal/session')).json();"+
          "const r=await fetch('/personal/store-applications',{method:'POST',"+
          "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
          "body:JSON.stringify({action:'submit_draft',organization_id:org,draft_id:draft,"+
          "expected_version:Number(ver),application_id:app})});"+
          "return {status:r.status,body:await r.json()}}",
          organizations[1].id,ownerReviewedDraft.id,id,String(version))
      const repeatDraft=await ownerDraftPost(submittedApplication.id,1)
      assert.equal(repeatDraft.status,200)
      assert.equal(repeatDraft.body.seller_id,submittedApplication.seller_id)
      assert.equal((await ownerDraftPost("daapp_"+randomBytes(16).toString("hex"),1)).status,409,
        "A different request ID cannot create a second Seller from one draft")
      assert.equal((await ownerDraftPost(submittedApplication.id,2)).status,409,
        "Stale draft version may not reuse a successful submission")
      assert.equal((await q(`select count(*)::int n from da_store_application
        where organization_id=$1`,[organizations[1].id]))[0].n,1)
      assert.equal((await q(`select count(*)::int n from da_organization_seller_ownership
        where organization_id=$1 and seller_id=$2 and revoked_at is null`,
        [organizations[1].id,submittedApplication.seller_id]))[0].n,1)
      process.stdout.write("PASS B22 Chrome: revoked Member's preserved Store draft submitted once by fresh-MFA protected Owner through native Mercur; duplicate/stale/CSRF/Member denied, PG16 draft/app/ownership/audit/outbox persisted, Seller pending only\n")
      await verifyStoreDraftSubmissionNegativePaths(reviewer,organizations[1].id,ownerPersonId,q)
      await reviewer.select(organizations[0].name,"member")

 }
 

/** Exact new Store-draft path, live same-origin HTTPS + task-owned PG16.
 * Only disposable CI fixtures may change, and all fault injection is removed.
 * No free-text personal data or bearer/session secrets enter the logs.
 */
async function verifyStoreDraftSubmissionNegativePaths(
  reviewer:B06Chrome,organizationId:string,ownerId:string,
  q:(sql:string,params?:unknown[])=>Promise<any[]>
):Promise<void>{
  assert.match(organizationId,/^daorg_[A-Za-z0-9_-]{1,80}$/)
  const stamp=randomBytes(7).toString("hex")
  const post=async(payload:Record<string,unknown>)=>
    reviewer.callFunction("async function(json){"+
      "const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/store-applications',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:json});return {status:r.status,body:await r.json()}}",
      JSON.stringify(payload))
  const createDraft=async(label:string)=>{
    const draftId="dasdraft_"+randomBytes(16).toString("hex")
    const name="B22 "+label+" "+stamp
    const email="b22-"+label+"-"+stamp+"@example.invalid"
    const saved=await post({action:"save_draft",organization_id:organizationId,
      draft_id:draftId,expected_version:0,name,email,currency_code:"try"})
    assert.equal(saved.status,201,"Real HTTPS draft save for "+label)
    assert.equal(saved.body.draft_id,draftId)
    assert.equal(saved.body.version,1)
    return {draftId,name,email}
  }
  const submit=(draftId:string,version:number,applicationId:string)=>({
    action:"submit_draft",organization_id:organizationId,
    draft_id:draftId,expected_version:version,application_id:applicationId
  })
  const nativeCount=async(email:string)=>Number((await q(
    "select count(*)::int n from seller where email=$1",[email]))[0].n)

  // A real draft update wins BEFORE an old Owner form is submitted.
  const contested=await createDraft("stale")
  const latestName="B22 updated "+stamp
  const update=await post({action:"save_draft",organization_id:organizationId,
    draft_id:contested.draftId,expected_version:1,
    name:latestName,email:contested.email,currency_code:"try"})
  assert.equal(update.status,200)
  assert.equal(update.body.version,2)
  const staleApplication="daapp_"+randomBytes(16).toString("hex")
  const stale=await post(submit(contested.draftId,1,staleApplication))
  assert.equal(stale.status,409,"Updated draft must reject stale Owner snapshot")
  assert.equal((await q("select count(*)::int n from da_store_application where id=$1",
    [staleApplication]))[0].n,0)
  assert.equal(await nativeCount(contested.email),0)
  assert.deepEqual(await q(
    "select name,version,status from da_store_application_draft where id=$1",
    [contested.draftId]),[{name:latestName,version:2,status:"draft"}])
  assert.equal((await q("select count(*)::int n from da_audit_event where action='organization.store_application_created' and new_values->>'draft_id'=$1",
    [contested.draftId]))[0].n,0)

  // Two distinct one-time application IDs are dispatched concurrently in
  // separate native HTTPS fetch operations; the draft is not pre-claimed.
  const appOne="daapp_"+randomBytes(16).toString("hex")
  const appTwo="daapp_"+randomBytes(16).toString("hex")
  const attempts=await reviewer.callFunction(
    "async function(left,right){const s=await(await fetch('/personal/session')).json();"+
    "const send=async body=>{const r=await fetch('/personal/store-applications',"+
    "{method:'POST',headers:{'content-type':'application/json',"+
    "'x-csrf-token':s.csrf_token},body});return {status:r.status,body:await r.json()}};"+
    "return Promise.all([send(left),send(right)])}",
    JSON.stringify(submit(contested.draftId,2,appOne)),
    JSON.stringify(submit(contested.draftId,2,appTwo)))
  assert.deepEqual(attempts.map((v:any)=>v.status).sort((a:number,b:number)=>a-b),
    [201,409],"Concurrent distinct application keys must produce only one success")
  const winner=attempts.find((v:any)=>v.status===201)
  assert.ok(winner&&[appOne,appTwo].includes(winner.body.application_id))
  assert.equal(winner.body.status,"pending_approval")
  const applications=await q("select id,status,seller_id from da_store_application where id=$1 or id=$2",
    [appOne,appTwo])
  assert.equal(applications.length,1)
  assert.equal(applications[0].id,winner.body.application_id)
  assert.equal(applications[0].status,"created")
  assert.equal(await nativeCount(contested.email),1)
  assert.deepEqual(await q("select status,version,submitted_application_id from da_store_application_draft where id=$1",
    [contested.draftId]),[{
    status:"submitted",version:2,submitted_application_id:winner.body.application_id
  }])
  const [seller]=await q("select status,approved_at from seller where id=$1",
    [applications[0].seller_id])
  assert.equal(seller.status,"pending_approval")
  assert.equal(seller.approved_at,null)
  assert.equal((await q("select count(*)::int n from da_organization_seller_ownership where organization_id=$1 and seller_id=$2 and revoked_at is null",
    [organizationId,applications[0].seller_id]))[0].n,1)
  assert.equal((await q("select count(*)::int n from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id where e.action='organization.store_application_created' and e.new_values->>'draft_id'=$1",
    [contested.draftId]))[0].n,1)
  process.stdout.write("PASS B22 Chrome/PG16: before-submit stale draft409/zero Seller; concurrent distinct application keys 201+409, one native pending Seller and one durable Origin/audit/outbox\n")

  // Expire only this genuine Owner's second-factor proof. Restore precisely
  // the original stored timestamp after the negative request; no fake login.
  const expiredDraft=await createDraft("expired")
  const deniedApp="daapp_"+randomBytes(16).toString("hex")
  const token=await reviewer.token()
  assert.match(token??"",/^[A-Za-z0-9_-]{43}$/)
  const sessionId=createHash("sha256").update(token!).digest("hex")
  const [session]=await q(
    "select person_id,status,mfa_purpose,last_strong_auth_at from da_browser_session where id=$1",
    [sessionId])
  assert.ok(session)
  assert.equal(session.person_id,ownerId)
  assert.equal(session.status,"active")
  assert.equal(session.mfa_purpose,"full")
  assert.ok(session.last_strong_auth_at)
  try{
    await q("update da_browser_session set last_strong_auth_at=clock_timestamp()-interval '20 minutes' where id=$1",
      [sessionId])
    const noMfa=await post(submit(expiredDraft.draftId,1,deniedApp))
    assert.equal(noMfa.status,403,"Owner with expired strong proof cannot send draft")
    assert.equal((await q("select count(*)::int n from da_store_application where id=$1",
      [deniedApp]))[0].n,0)
    assert.equal(await nativeCount(expiredDraft.email),0)
  }finally{
    await q("update da_browser_session set last_strong_auth_at=$2 where id=$1",
      [sessionId,session.last_strong_auth_at])
  }
  const [policy]=await q("select store_application_enabled from da_organization where id=$1",
    [organizationId])
  assert.equal(policy.store_application_enabled,true)
  try{
    await q("update da_organization set store_application_enabled=false where id=$1",
      [organizationId])
    const deniedPolicy=await post(submit(expiredDraft.draftId,1,deniedApp))
    assert.equal(deniedPolicy.status,403,
      "Company policy suspension must bar this exact saved-draft endpoint")
  }finally{
    await q("update da_organization set store_application_enabled=$2 where id=$1",
      [organizationId,policy.store_application_enabled])
  }
  assert.equal((await q("select count(*)::int n from da_store_application where id=$1",
    [deniedApp]))[0].n,0)
  assert.equal(await nativeCount(expiredDraft.email),0)
  assert.deepEqual(await q("select status,version from da_store_application_draft where id=$1",
    [expiredDraft.draftId]),[{status:"draft",version:1}])
  process.stdout.write("PASS B22 Chrome/PG16: genuine Owner's expired strong proof and temporarily disabled company policy deny same draft with 403, zero native Seller and unchanged private draft\n")

  // Force failure AFTER the existing Mercur native Seller workflow reaches
  // Foundation's ownership finalization. The committed 'creating' claim must
  // survive even when native Seller rollback/commit outcome is uncertain.
  const uncertainDraft=await createDraft("uncertain")
  const uncertainApp="daapp_"+randomBytes(16).toString("hex")
  const faultFunction="b22_owner_draft_finish_fault_v1"
  let functionInstalled=false,triggerInstalled=false
  try{
    await q("create function "+faultFunction+
      "() returns trigger language plpgsql as $b22$ begin "+
      "if NEW.organization_id='"+organizationId+"' then "+
      "raise exception 'B22 isolated native Seller finalization interruption'; "+
      "end if; return NEW; end $b22$")
    functionInstalled=true
    await q("create trigger "+faultFunction+
      " before insert on da_organization_seller_ownership for each row execute function "+
      faultFunction+"()")
    triggerInstalled=true
    const interrupted=await post(submit(uncertainDraft.draftId,1,uncertainApp))
    assert.equal(interrupted.status,503,
      "Native Seller completion interrupted after creating claim must be uncertain")
    assert.equal(interrupted.body.message,"Outcome uncertain; check application status")
  }finally{
    if(triggerInstalled)await q("drop trigger if exists "+faultFunction+
      " on da_organization_seller_ownership")
    if(functionInstalled)await q("drop function if exists "+faultFunction+"()")
  }
  assert.deepEqual(await q("select status,seller_id from da_store_application where id=$1",
    [uncertainApp]),[{status:"creating",seller_id:null}])
  assert.deepEqual(await q("select status,submitted_application_id from da_store_application_draft where id=$1",
    [uncertainDraft.draftId]),[{status:"submitting",submitted_application_id:uncertainApp}])
  const uncertainNativeCount=await nativeCount(uncertainDraft.email)
  assert.ok(uncertainNativeCount<=1,"Interrupted native Seller has no duplicates")
  const sameRetry=await post(submit(uncertainDraft.draftId,1,uncertainApp))
  const alternateRetry=await post(submit(uncertainDraft.draftId,1,
    "daapp_"+randomBytes(16).toString("hex")))
  assert.equal(sameRetry.status,409,"Committed creating claim must block blind retry")
  assert.equal(alternateRetry.status,409,"Uncertain draft cannot create Seller from alternate ID")
  assert.equal(await nativeCount(uncertainDraft.email),uncertainNativeCount)
  assert.equal((await q("select count(*)::int n from da_store_application where organization_id=$1 and id=$2",
    [organizationId,uncertainApp]))[0].n,1)
  assert.equal((await q("select count(*)::int n from da_audit_event where action='organization.store_application_created' and new_values->>'draft_id'=$1",
    [uncertainDraft.draftId]))[0].n,0)
  process.stdout.write("PASS B22 Chrome/PG16: injected native Seller finalization interruption 503, durable creating/submitting, same/different retry409, no duplicate Seller, fault trigger removed\n")
}

/** Only disposable B22 CI fixtures: native Mercur Seller, existing Foundation
 * Origin chain and real Chrome first-party Staff/Owner sessions. No production
 * Seller or protected data is touched.
 */
async function verifyReasonedStoreRejectionDuringPause(x:{
  reviewer:B06Chrome;browser:B06Chrome;native:any;
  q:(sql:string,params?:any[])=>Promise<any[]>;
  org:string;orgName:string;ownerId:string;ownerActor:string;
  memberId:string;authIdentityId:string;rand:string
}){
  const {reviewer,browser,native,q}=x
  const reason="B22 synthetic rejected pending Store: required details are incomplete"
  const [seller]=await native.createSellers([{
    name:"B22 reasoned rejection "+x.rand,
    email:"b22-reject-"+x.rand+"@example.invalid",currency_code:"try"
  }])
  assert.ok(seller?.id)
  assert.equal(seller.status,"pending_approval")
  const app="daapp_"+randomBytes(16).toString("hex")
  await q(`insert into da_store_application
    (id,organization_id,person_id,member_actor_id,member_auth_identity_id,
     request_fingerprint,status,seller_id)
    values($1,$2,$3,$4,$5,repeat('a',64),'created',$6)`,
    [app,x.org,x.ownerId,x.memberId,x.authIdentityId,seller.id])
  const [origin]=await q(`insert into da_audit_event
    (id,actor_person_id,actor_type,actor_id,organization_id,action,module,
     resource,target_id,role_context,new_values,occurred_at)
    values('daaud_'||gen_random_uuid()::text,$1,'user',$2,$3,
      'organization.store_application_created','dogruadres-access',
      'store-application',$4,'owner',
      jsonb_build_object('application_id',$5::text,'status','pending_approval'),
      clock_timestamp()) returning id`,
    [x.ownerId,x.ownerActor,x.org,seller.id,app])
  assert.ok(origin?.id)
  await q(`insert into da_audit_outbox
    (id,source_audit_event_id,source_module,envelope)
    values('daaob_'||gen_random_uuid()::text,$1,'dogruadres-access','{}'::jsonb)`,
    [origin.id])
  await q(`insert into da_organization_seller_ownership
    (id,organization_id,seller_id,verification_audit_event_id,verified_at)
    values('daown_'||gen_random_uuid()::text,$1,$2,$3,clock_timestamp())`,
    [x.org,seller.id,origin.id])

  const direct=async(client:B06Chrome,body:object,invalidCsrf=false)=>
    client.callFunction("async function(body,invalid){"+
      "const session=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/platform/stores',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':"+
      "(invalid==='true'?'invalid':session.csrf_token)},body:body});"+
      "return {status:r.status,body:await r.json()}}",
      JSON.stringify(body),invalidCsrf?"true":"false")
  const target={application_id:app,seller_id:seller.id}
  assert.equal((await direct(browser,{...target,action:"reject",reason})).status,403,
    "Organization Owner cannot review or reject its own Store")
  assert.equal((await direct(reviewer,{...target,action:"reject",reason:"short"})).status,400)
  assert.equal((await direct(reviewer,{...target,action:"reject",reason},true)).status,403)
  assert.equal((await native.listSellers({id:seller.id}))[0].status,"pending_approval")
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  await reviewer.click("#store-approval-refresh")
  await reviewer.wait("document.querySelector('#store-approval-list p')?.textContent.includes("+JSON.stringify(seller.name)+")")
  assert.equal(await reviewer.eval("document.querySelector('#store-approval-list p button')?.disabled"),true,
    "Approval is paused even though reasoned rejection is permitted")
  assert.equal(await reviewer.eval("document.querySelector('#store-approval-list p button[data-store-reject]')?.disabled"),false)
  // Let the real POST complete, then corrupt only its browser-visible 200
  // body. This proves the native decision persists while the UI refuses a
  // blind second write. The disposable CI page is the only interception scope.
  await reviewer.eval(`(()=>{
    const original=window.fetch;
    window.__b22RejectOriginalFetch=original;
    window.__b22RejectPostCount=0;
    window.fetch=async(...args)=>{
      const url=String(args[0]),method=args[1]?.method;
      if(url!=='/personal/platform/stores'||method!=='POST')
        return original(...args);
      window.__b22RejectPostCount++;
      const response=await original(...args);
      if(response.status!==200)return response;
      return new Response('{broken JSON',{
        status:200,headers:{'content-type':'application/json'}
      });
    };
  })()`)
  await reviewer.input("#store-approval-list p textarea",reason)
  await reviewer.click("#store-approval-list p button[data-store-reject]")
  await reviewer.wait("document.getElementById('store-approval-status').textContent.includes('Ret sonucu belirsiz')")
  assert.equal(await reviewer.eval("window.__b22RejectPostCount"),1)
  assert.equal(await reviewer.eval("document.querySelector('#store-approval-list p button[data-store-reject]').disabled"),true,
    "Malformed success response must keep the rejection action disabled")
  assert.equal(await reviewer.eval("document.querySelector('#store-approval-list p button').disabled"),true,
    "Malformed success response must keep approval disabled too")
  assert.equal(await reviewer.eval("window.__b22RejectPostCount"),1,
    "Chrome must not issue a second Store decision")
  // The injection is disposable: restore the genuine browser transport
  // before subsequent unrelated platform decision scenarios execute.
  await reviewer.eval("(()=>{window.fetch=window.__b22RejectOriginalFetch;"+
    "delete window.__b22RejectOriginalFetch;return true})()")
  const [terminated]=await native.listSellers({id:seller.id})
  assert.equal(terminated.status,"terminated")
  assert.equal(terminated.status_reason,reason)
  assert.equal(terminated.approved_at,null)
  assert.equal((await native.listSellers({id:seller.id}))[0].status,"terminated")
  assert.equal((await direct(reviewer,{...target,action:"reject",reason})).status,409,
    "A terminally rejected Seller cannot be rejected a second time")
  assert.equal((await direct(reviewer,target)).status,409,
    "The same rejected Seller cannot later be approved")
  const audits=await q(`select e.actor_person_id,e.new_values,x.id as outbox_id
    from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
    where e.action='organization.store_application_rejected'
      and e.organization_id=$1 and e.target_id=$2`,[x.org,seller.id])
  assert.equal(audits.length,1)
  assert.notEqual(audits[0].actor_person_id,x.ownerId,"Staff is not Organization Owner")
  assert.equal(audits[0].new_values.reason,reason)
  assert.equal(audits[0].new_values.status,"terminated")
  assert.ok(audits[0].outbox_id)
  const [recipientCount]=await q(`select count(*)::int n from da_notification_receipt n
    join da_audit_event e on e.id=n.audit_event_id
    where e.action='organization.store_application_rejected'
      and e.organization_id=$1 and e.target_id=$2`,[x.org,seller.id])
  const [eligibleOwners]=await q(`select count(*)::int n from da_organization_membership m
    join da_person p on p.id=m.person_id
    where m.organization_id=$1 and m.role='owner' and m.protected_owner=true
      and m.status='active' and m.deleted_at is null
      and p.disabled_at is null and p.deleted_at is null`,[x.org])
  assert.equal(recipientCount.n,eligibleOwners.n,
    "One private receipt for each active protected Owner, none for other Members")
  await browser.send("Page.bringToFront")
  const owner=await browser.callFunction("async function(org){"+
    "const r=await fetch('/personal/store-applications?organization_id='+encodeURIComponent(org));"+
    "return {status:r.status,body:await r.json()}}",x.org)
  assert.equal(owner.status,200)
  const match=owner.body.applications.find((a:any)=>a.id===app)
  assert.ok(match)
  assert.equal(match.seller_status,"terminated")
  assert.equal(match.rejection_reason,reason)
  const notice=await browser.callFunction("async function(org){"+
    "const r=await fetch('/personal/notifications?organization='+encodeURIComponent(org));"+
    "return {status:r.status,body:await r.json()}}",x.org)
  assert.equal(notice.status,200)
  assert.equal(notice.body.notifications.filter((n:any)=>
    n.title==="Mağaza başvurusu reddedildi"&&n.context===x.orgName).length,1)
  assert.equal(JSON.stringify(notice.body).includes(reason),false,
    "A private alert must not copy arbitrary staff reason text")
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  // An uncertain successful write must be reconciled with a fresh
  // authorized GET. Its terminated Seller must disappear from the
  // pending-review UI; there must be no retry of the write.
  await reviewer.click("#store-approval-refresh")
  await reviewer.wait("!document.getElementById('store-approval-list').textContent.includes("+JSON.stringify(seller.id)+")")
  assert.equal(await reviewer.eval("window.__b22RejectPostCount"),1,
    "Readback must not issue another platform Store decision")
  process.stdout.write("PASS B22 Chrome/PG16: protected platform Staff reasoned pending Seller rejection during company pause, native terminated without approval, private Owner status and redacted notice, one audit/outbox, Owner/CSRF/short reason/replay denied\n")
}

/** Separate test helper avoids TypeScript's huge-main control-flow limit.
 * Both HTTPS requests use the existing real Owner session and isolated PG16.
 */
async function verifyConcurrentCrossOrganizationStoreNames(
  browser:B06Chrome,alphaOrgId:string,gammaOrgId:string,stamp:string,
  q:(sql:string,params?:unknown[])=>Promise<any[]>
):Promise<void>{
  // Two legitimate Owner-controlled legal Organizations race one unused name
  // using genuinely concurrent first-party HTTPS POSTs and distinct keys.
  const raceName="B22 crossorg name "+stamp
  const raceApplications=[
    {organization_id:alphaOrgId,
      application_id:"daapp_"+randomBytes(16).toString("hex"),
      name:raceName,email:"b22-race-alpha-"+stamp+"@example.invalid",
      currency_code:"try"},
    {organization_id:gammaOrgId,
      application_id:"daapp_"+randomBytes(16).toString("hex"),
      name:raceName.toUpperCase(),email:"b22-race-gamma-"+stamp+"@example.invalid",
      currency_code:"try"}
  ]
  const raceOutcomes=await browser.eval(`(async()=>{
    const session=await(await fetch('/personal/session')).json()
    return Promise.all(${JSON.stringify(raceApplications)}.map(async input=>{
      const response=await fetch('/personal/store-applications',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(input)
      })
      const body=await response.json()
      return {status:response.status,
        seller_id:typeof body.seller_id==='string'?body.seller_id:null}
    }))
  })()`)
  assert.deepEqual(raceOutcomes.map((x:any)=>x.status).sort((a:number,b:number)=>a-b),
    [201,409],"Only one competing cross-Organization POST may win")
  const winnerIndex=raceOutcomes.findIndex((x:any)=>x.status===201)
  assert.ok(winnerIndex===0||winnerIndex===1)
  const raceWinner=raceApplications[winnerIndex]
  const raceLoser=raceApplications[1-winnerIndex]
  const raceSellerId=raceOutcomes[winnerIndex].seller_id as string
  assert.match(raceSellerId,/^sel_[A-Za-z0-9_-]+$/)
  assert.equal(raceOutcomes[1-winnerIndex].seller_id,null)
  const raceClaims=await q(`select id,organization_id,status,seller_id
    from da_store_application where id=any($1::text[])`,
    [raceApplications.map(x=>x.application_id)])
  assert.equal(raceClaims.length,1,"Losing request cannot reserve a second application")
  assert.deepEqual(raceClaims[0],{
    id:raceWinner.application_id,organization_id:raceWinner.organization_id,
    status:"created",seller_id:raceSellerId
  })
  const raceNative=await q(`select id,status from seller where email=any($1::text[])`,
    [raceApplications.map(x=>x.email)])
  assert.equal(raceNative.length,1,"Exactly one native Mercur Seller must exist")
  assert.equal(raceNative[0].id,raceSellerId)
  assert.equal(raceNative[0].status,"pending_approval")
  const raceEvents=await q(`select e.id as audit_id,x.id as outbox_id,
    o.organization_id,o.seller_id
    from da_audit_event e
    join da_audit_outbox x on x.source_audit_event_id=e.id
    join da_organization_seller_ownership o on o.verification_audit_event_id=e.id
    where e.action='organization.store_application_created'
    and e.new_values->>'application_id'=any($1::text[])`,
    [raceApplications.map(x=>x.application_id)])
  assert.equal(raceEvents.length,1,
    "Only the winning Organization may have an Origin, audit and outbox")
  assert.equal(raceEvents[0].organization_id,raceWinner.organization_id)
  assert.equal(raceEvents[0].seller_id,raceSellerId)
  assert.ok(raceEvents[0].audit_id&&raceEvents[0].outbox_id)
  assert.equal((await q(`select count(*)::int n from da_audit_event
    where action='organization.store_application_created'
    and new_values->>'application_id'=$1`,[raceLoser.application_id]))[0].n,0,
    "Losing Organization must have zero successful Store creation audits")
  process.stdout.write("PASS B22 Chrome/PG16: simultaneous Alpha/Gamma normalized Store name 201+409; one native Seller, one durable application, Origin/audit/outbox, loser zero side effects\n")

}

/** Real authenticated HTTPS negative proof; test data is disposable PG16 only.
 * Kept outside the long main scenario to avoid TypeScript flow-size limits.
 */
async function verifyInvisibleStoreNameRejection(
  browser:B06Chrome,org:string,stamp:string,
  q:(sql:string,params?:unknown[])=>Promise<any[]>
):Promise<void>{
  const invalidNames=["\u200B\u200B\u200B","\u00AD\u00AD\u00AD",
    "B22\u200B Store "+stamp,"B22\u2060 Store "+stamp,
    "B22\u200D Store "+stamp]
  for(const [index,name] of invalidNames.entries()){
    const id="daapp_"+randomBytes(16).toString("hex")
    const email="b22-invisible-"+index+"-"+stamp+"@example.invalid"
    const result=await browser.callFunction("async function(json){"+
      "const session=await(await fetch('/personal/session')).json();"+
      "const response=await fetch('/personal/store-applications',{"+
      "method:'POST',headers:{'content-type':'application/json',"+
      "'x-csrf-token':session.csrf_token},body:json});"+
      "return response.status}",JSON.stringify({
        organization_id:org,application_id:id,name,email,currency_code:"try"
      }))
    assert.equal(result,400,"Invisible name must fail before reservation")
    const rows=await q(`select
      (select count(*)::int from da_store_application where id=$1) as applications,
      (select count(*)::int from seller where email=$2) as sellers,
      (select count(*)::int from da_audit_event
        where new_values->>'application_id'=$1) as audits,
      (select count(*)::int from da_audit_outbox x
        join da_audit_event e on e.id=x.source_audit_event_id
        where e.new_values->>'application_id'=$1) as outboxes`,
      [id,email])
    assert.deepEqual(rows,[{applications:0,sellers:0,audits:0,outboxes:0}],
      "Rejected invisible name may not create durable side effects")
  }
  process.stdout.write("PASS B22 PG16/Chrome: invisible Store names HTTP400; zero application, native Seller, audit/outbox effects\n")
}

export default async function({container}:any){
  const u=new URL(process.env.DATABASE_URL??"postgres://invalid/invalid")
  const preparing=process.env.B22_UI_PREPARE==="true"
  assert.ok(process.env.GITHUB_ACTIONS==="true"&&process.env.CI==="true"&&
    process.env.GITHUB_EVENT_NAME==="pull_request"&&process.env.B22_UI_AUTO_SCOPE==="b22-ui"&&
    process.env.PG_MFA_TEST_SCOPE==="b22-ui"&&
    process.env.PG_MFA_TEST_SENTINEL==="mfa-pg16-disposable-ci-v1"&&
    process.env.PG_MFA_NATIVE_TEST_DATABASE===u.pathname.slice(1)&&
    u.protocol==="postgres:"&&u.hostname==="127.0.0.1"&&u.port==="5432"&&
    u.username==="mfa_test"&&u.password==="ci-disposable-only-not-a-real-secret"&&
    /^\/mfa_cli_ci_[0-9a-f]{16}$/.test(u.pathname)&&
    (preparing?process.env.DOGRUADRES_MFA_RUNTIME_ENABLED==="false":
      ["DOGRUADRES_IDENTITY_ENABLED","DOGRUADRES_MFA_RUNTIME_ENABLED",
       "DOGRUADRES_MFA_SETTINGS_ENABLED","DOGRUADRES_MFA_ENROLLMENT_ENABLED"]
      .every(k=>process.env[k]==="true")),"REFUSED: B22 browser scope only disposable native CI")
  // An independent real Medusa process uses the same task-owned Cart
  // while the primary process is past L and paused before OrderGroup INSERT.
  // Reject any attempt to run this mode outside the strict CI sentinel above.
  // This extra native child acquires a disposable lock then exits abruptly;
  // the parent checks whether an abandoned row blocks future acquisitions.
  const abruptExitKey=process.env.B22_ABRUPT_LOCK_TEST_KEY
  if(abruptExitKey){
    assert.equal(preparing,false)
    assert.equal(process.env.DOGRUADRES_B22_PG_LOCK_TEST,"true")
    assert.match(abruptExitKey,/^b22-pg-process-exit:[0-9a-f]{16}$/)
    await container.resolve("locking").acquire(abruptExitKey,{expire:1})
    // Flush a fixed marker, then bypass normal container release. No raw logs.
    process.stdout.write("B22_TASK_PROVIDER_LOCK_BEFORE_ABRUPT_EXIT\n",
      ()=>process.exit(86))
    await new Promise<void>(()=>{})
    return
  }
  // Genuine Medusa Redis provider, isolated from PostgreSQL checkout.
  const redisProbeKey=process.env.B22_REDIS_PROBE_KEY
  if(redisProbeKey){
    assert.equal(preparing,false)
    assert.equal(process.env.DOGRUADRES_B22_PG_LOCK_TEST,"false")
    assert.equal(process.env.DOGRUADRES_B22_REDIS_LOCK_TEST,"true")
    assert.equal(process.env.LOCKING_REDIS_URL,"redis://127.0.0.1:6379")
    assert.match(redisProbeKey,/^b22-redis-process-exit:[0-9a-f]{16}$/)
    const mode=process.env.B22_REDIS_PROBE_MODE
    assert.ok(mode==="crash"||mode==="recover")
    const redisLock=container.resolve("locking")
    if(mode==="crash"){
      await redisLock.acquire(redisProbeKey,{expire:25})
      process.stdout.write("B22_REDIS_NATIVE_LOCK_BEFORE_EXIT\n",()=>process.exit(86))
      await new Promise<void>(()=>{})
      return
    }
    let initiallyAcquired=false
    try{
      await redisLock.acquire(redisProbeKey,{expire:2})
      initiallyAcquired=true
    }catch(error){
      assert.match(String(error),/Failed to acquire lock/i)
    }finally{
      if(initiallyAcquired)await redisLock.release(redisProbeKey)
    }
    assert.equal(initiallyAcquired,false,"Second process must deny active Redis lock")
    let recovered=false
    await until(async()=>{
      try{
        await redisLock.acquire(redisProbeKey,{expire:3})
        recovered=true
        return true
      }catch(error){
        assert.match(String(error),/Failed to acquire lock/i)
        return false
      }
    },35000,"B22 Redis lock recovery after process exit and TTL")
    assert.equal(recovered,true)
    assert.equal(await redisLock.release(redisProbeKey),true)
    process.stdout.write("B22_REDIS_NATIVE_LOCK_RECOVERED_AFTER_TTL\n")
    return
  }
  const secondaryCartId=process.env.B22_SECOND_PROCESS_CART_ID
  if(secondaryCartId){
    assert.equal(preparing,false)
    assert.equal(process.env.DOGRUADRES_B22_PG_LOCK_TEST,"true")
    assert.match(secondaryCartId,/^cart_[A-Za-z0-9_-]+$/)
    process.stdout.write("B22_SECONDARY_SCOPE_READY\\n")
    const locking=container.resolve("locking")
    process.stdout.write("B22_SECONDARY_PROVIDER_READY\\n")
    let acquired=false
    try{
      await locking.acquire(secondaryCartId)
      acquired=true
    }catch(error){
      assert.match(String(error),/Failed to acquire lock/i,
        "Independent Medusa process must observe the primary's real PG lock")
    }finally{
      if(acquired)await locking.release(secondaryCartId)
    }
    assert.equal(acquired,false,
      "Independent process cannot acquire a Cart lock held by another process")
    process.stdout.write("B22_SECONDARY_PG_LOCK_CONFLICT\n")
    const secondWorkflow=completeCartWithSplitOrdersWorkflow(container).run({
      input:{cart_id:secondaryCartId},throwOnError:false
    })
    process.stdout.write("B22_SECONDARY_NATIVE_INVOKED\n")
    const result=await secondWorkflow
    const errors=(result.errors??[]).map((entry:any)=>
      String(entry.error?.message??entry.error??entry.message??"")).join("\n")
    if(errors){
      assert.match(errors,
        /B22_CHECKOUT_AUTHORIZATION_DENIED|cart.*(already|completed)|Failed to acquire lock|lock.*(acquire|timeout|busy)/i,
        "Second native checkout must fail with a recognized safe reason")
      process.stdout.write("B22_SECONDARY_NATIVE_DENIED\n")
    }else{
      assert.match(String(result.result?.order_group_id??""),/^og_[A-Za-z0-9_-]+$/)
      process.stdout.write("B22_SECONDARY_NATIVE_SUCCESS\n")
    }
    return
  }
    const pg=new Client({connectionString:u.toString()});await pg.connect()
  const q=async(sql:string,args:unknown[]=[]) => (await pg.query(sql,args)).rows
  let smtpGuard:SmtpResponsePrivacyGuard|undefined
  let app:Awaited<ReturnType<typeof createPersonalHttpApp>>|undefined
  let server:ReturnType<typeof tlsServer>|undefined
  let privateServer:ReturnType<typeof plainServer>|undefined
  const previousPrivateOrigin=process.env.DOGRUADRES_PRIVATE_API
  const previousTlsCert=process.env.DOGRUADRES_TLS_CERT
  const previousTlsKey=process.env.DOGRUADRES_TLS_KEY
  const previousListenerPort=process.env.DOGRUADRES_FRONTDOOR_PORT
  const browsers:B06Chrome[]=[]
  const temp=mkdtempSync(join(tmpdir(),"b22-task-ca-"))
  const taxDir=join(temp,"private-tax-certificates")
  mkdirSync(taxDir,{recursive:true,mode:0o700})
  const previousTaxDir=process.env.DOGRUADRES_TAX_CERTIFICATE_DIR
  process.env.DOGRUADRES_TAX_CERTIFICATE_DIR=taxDir
  let originalB22Error:unknown
  try{
    assert.equal((await q("select current_database() db"))[0].db,u.pathname.slice(1))
    assert.equal((await q("select mfa_activated from da_session_policy where id='current'"))[0].mfa_activated,!preparing)
    const rand=randomBytes(8).toString("hex"),auth=container.resolve("auth")
    const users=container.resolve("user"),foundation=container.resolve("dogruadresAccess")
    const native=container.resolve("seller")
    const primary=async(label:"A"|"B")=>{
      const email=process.env["B22_UI_EMAIL_"+label]!,password=process.env["B22_UI_PASSWORD_"+label]!
      assert.match(email,/^b22-[ab]-[0-9a-f]{16}@example.invalid$/)
      assert.ok(password.length>=40)
      const user=await users.createUsers({email})
      const reg=await auth.register("emailpass",{body:{email,password}})
      assert.ok(reg.success&&reg.authIdentity?.id)
      await auth.updateAuthIdentities({id:reg.authIdentity.id,app_metadata:{user_id:user.id}})
      const [person]=await foundation.createPeople([{}])
      await foundation.createActorMappings([{actor_type:"user",actor_id:user.id,
        person_id:person.id,created_by_actor_type:"user",created_by_actor_id:user.id}])
      // Primary synthetic enrollment fixture from existing Foundation B06;
      // NOT a shortcut for the secondary Member ownership proof.
      await q("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",
        [reg.authIdentity.id,person.id,user.id])
      return {email,password,person:person.id,actor:user.id}
    }
    if(preparing){
      for(const table of ["public.user","auth_identity","da_person","da_actor_mapping","da_login_binding","auth_mfa_factor"])
        assert.equal((await q("select count(*)::int n from "+table))[0].n,0,"R1 clean fixture "+table)
      await primary("A");await primary("B")
      for(const table of ["public.user","auth_identity","da_person","da_actor_mapping","da_login_binding"])
        assert.equal((await q("select count(*)::int n from "+table))[0].n,2,"R1 prepared "+table)
      assert.equal((await q("select count(*)::int n from auth_mfa_factor"))[0].n,0)
      process.stdout.write("PASS B22 test fixture: two native primary identities prepared for existing signed R1 preflight\n")
      return
    }
    const readActor=async(label:"A"|"B")=>{
      const email=process.env["B22_UI_EMAIL_"+label]!,password=process.env["B22_UI_PASSWORD_"+label]!
      const result=await q(`select u.id actor,b.person_id person from public.user u
        join da_login_binding b on b.actor_id=u.id and b.actor_type='user'
        where u.email=$1 and b.verified_at is not null and b.revoked_at is null`,[email])
      assert.equal(result.length,1)
      return {email,password,person:result[0].person as string,actor:result[0].actor as string}
    }
    const A=await readActor("A"),B=await readActor("B")
    const organizations=await foundation.createOrganizations([
      {name:"B22 Alpha "+rand,status:"active"},{name:"B22 Beta "+rand,status:"active"},
      {name:"B22 Foreign "+rand,status:"active"},
    ])
    const memberships=await foundation.createMemberships([
      {organization_id:organizations[0].id,person_id:A.person,role:"owner",status:"active",protected_owner:true},
      {organization_id:organizations[1].id,person_id:B.person,role:"owner",status:"active",protected_owner:true},
      {organization_id:organizations[1].id,person_id:A.person,role:"admin",status:"active",protected_owner:false},
      {organization_id:organizations[2].id,person_id:B.person,role:"owner",status:"active",protected_owner:true},
    ])
    // A single canonical Person may independently own two seller legal
    // Organizations. Gamma is a separate seller Organization, not a new
    // Person, a second login or a fabricated Seller ownership association.
    const [sellerGamma]=await foundation.createOrganizations([{
      name:"B22 Gamma Seller "+rand,status:"active"
    }])
    const [gammaOwnerMembership]=await foundation.createMemberships([{
      organization_id:sellerGamma.id,person_id:A.person,role:"owner",
      status:"active",protected_owner:true
    }])
    assert.match(gammaOwnerMembership.id,/^[A-Za-z0-9_-]+$/)
    const betaAdminMembership=memberships[2]
    const memberEmail="b22-secondary-"+rand+"@example.invalid"
    const [member]=await native.createMembers([{email:memberEmail,is_active:true}])
    const memberPassword=randomBytes(32).toString("base64url")
    const reg=await auth.register("emailpass",{body:{email:memberEmail,password:memberPassword}})
    assert.ok(reg.success&&reg.authIdentity?.id)
    await auth.updateAuthIdentities({id:reg.authIdentity.id,app_metadata:{member_id:member.id}})
    const secondaryMfa=await auth.startAuthMfa({auth_identity_id:reg.authIdentity.id,
      provider:"totp",issuer:"B22 isolated verified Member"})
    const secondaryEnrolledCounter=Math.floor(Date.now()/30000)
    await auth.verifyAuthMfa({id:secondaryMfa.mfa.id,auth_identity_id:reg.authIdentity.id,
      code:otp(secondaryMfa.secret)})
    // A second native Member is an isolated B22 fixture. It conveys no
    // DoğruAdres Person or Seller authority until B proves the secondary
    // identity with the existing personal dual-MFA account-linking UI.
    const bMemberEmail="b22-member-b-"+rand+"@example.invalid"
    const [bNativeMember]=await native.createMembers([{email:bMemberEmail,is_active:true}])
    const bMemberPassword=randomBytes(32).toString("base64url")
    const bRegistration=await auth.register("emailpass",{
      body:{email:bMemberEmail,password:bMemberPassword}
    })
    assert.ok(bRegistration.success&&bRegistration.authIdentity?.id)
    await auth.updateAuthIdentities({id:bRegistration.authIdentity.id,
      app_metadata:{member_id:bNativeMember.id}})
    const bMemberMfa=await auth.startAuthMfa({
      auth_identity_id:bRegistration.authIdentity.id,
      provider:"totp",issuer:"B22 isolated verified Member B"
    })
    const bMemberEnrollCounter=Math.floor(Date.now()/30000)
    await auth.verifyAuthMfa({id:bMemberMfa.mfa.id,
      auth_identity_id:bRegistration.authIdentity.id,code:otp(bMemberMfa.secret)})
    // Medusa's installed Customer Module creates this task-only native actor.
    // This Customer is NOT itself a legal Organization or purchase grant.
    const customerEmail="b22-customer-"+rand+"@example.invalid"
    const customerService=container.resolve("customer")
    const [nativeCustomer]=await customerService.createCustomers([{
      email:customerEmail
    }])
    assert.match(nativeCustomer.id,/^cus_[A-Za-z0-9_-]+$/)
    // Task-only native Medusa Cart fixtures. No line item, payment or order.
    const cartService=container.resolve("cart")
    const customerCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    assert.match(customerCart.id,/^cart_[A-Za-z0-9_-]+$/)
    const [foreignNativeCustomer]=await customerService.createCustomers([{
      email:"b22-foreign-cart-"+rand+"@example.invalid"
    }])
    const foreignCart=await cartService.createCarts({
      currency_code:"eur",customer_id:foreignNativeCustomer.id
    })
    assert.match(foreignCart.id,/^cart_[A-Za-z0-9_-]+$/)

    const customerPassword=randomBytes(32).toString("base64url")
    const customerReg=await auth.register("emailpass",{
      body:{email:customerEmail,password:customerPassword}
    })
    assert.ok(customerReg.success&&customerReg.authIdentity?.id)
    await auth.updateAuthIdentities({
      id:customerReg.authIdentity.id,
      app_metadata:{customer_id:nativeCustomer.id}
    })
    const customerMfa=await auth.startAuthMfa({
      auth_identity_id:customerReg.authIdentity.id,
      provider:"totp",issuer:"B22 isolated verified Customer"
    })
    const customerEnrollCounter=Math.floor(Date.now()/30000)
    await auth.verifyAuthMfa({
      id:customerMfa.mfa.id,
      auth_identity_id:customerReg.authIdentity.id,
      code:otp(customerMfa.secret)
    })
    const stores: Array<{id:string;name:string}>=[]
    for(let n=0;n<3;n++){
      // Mercur's own Store workflow is authoritative for its native approval.
      // Never forge status=open or approved_at with a direct service write.
      const [store]=await native.createSellers([{name:"B22 Store "+(n+1)+" "+rand,
        email:"b22-store-"+n+"-"+rand+"@example.invalid",currency_code:"eur"}])
      const before=await native.listSellers({id:store.id})
      assert.equal(before.length,1);assert.equal(before[0].status,"pending_approval")
      assert.equal(before[0].approved_at,null)
      await approveSellerWorkflow(container).run({input:{seller_id:store.id}})
      const after=await native.listSellers({id:store.id})
      assert.equal(after.length,1);assert.equal(after[0].status,"open")
      assert.ok(after[0].approved_at,"Mercur native approval timestamp required")
      await native.createSellerMembers([{seller_id:store.id,member_id:member.id,is_owner:true}])
      stores.push(store)
    }
    // Deliberately inconsistent TEST-ONLY Seller: status OPEN was written
    // without Mercur approveSellerWorkflow, so approved_at remains absent.
    // Even a platform association + verified Member must never expose it.
    const [unapprovedStore]=await native.createSellers([{name:"B22 approval-negative "+rand,
      email:"b22-unapproved-"+rand+"@example.invalid",currency_code:"eur",status:"open"}])
    const unapprovedNative=await native.listSellers({id:unapprovedStore.id})
    assert.equal(unapprovedNative.length,1)
    assert.equal(unapprovedNative[0].status,"open")
    assert.equal(unapprovedNative[0].approved_at,null)
    await native.createSellerMembers([{seller_id:unapprovedStore.id,member_id:member.id,is_owner:true}])

    const crt=join(temp,"ca.pem"),key=join(temp,"key.pem")
    const certificate=spawnSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes",
      "-keyout",key,"-out",crt,"-days","1","-subj","/CN=B22 task CA",
      "-addext","subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-addext","basicConstraints=critical,CA:TRUE"],{stdio:"ignore",timeout:20000})
    assert.equal(certificate.status,0,"Task-only CA generation")
    // B22 now also validates the server-only native Member context. Use
    // the already-supported real Mercur loader from B20's runtime, and an
    // ephemeral HTTP listener bound strictly to loopback. No external API,
    // no mock route or browser-visible native credential is introduced.
    const mercurApi=join(dirname(require.resolve("@mercurjs/core")),"api")
    app=await createPersonalHttpApp(container,[mercurApi])
    privateServer=plainServer(app.app)
    await new Promise<void>((resolve,reject)=>{
      privateServer!.once("error",reject)
      privateServer!.listen(0,"127.0.0.1",resolve)
    })
    const nativePort=(privateServer.address() as {port:number}).port
    process.env.DOGRUADRES_PRIVATE_API="http://127.0.0.1:"+nativePort
    if(process.env.B22_ADMIN_SMTP==="true")
      smtpGuard=new SmtpResponsePrivacyGuard(process.env.B22_SMTP_CANARY??"")
    server=tlsServer({cert:readFileSync(crt),key:readFileSync(key),minVersion:"TLSv1.2"},
      (req,res)=>{smtpGuard?.observe(req,res);app!.app(req,res)})
    await new Promise<void>((resolve,reject)=>{server!.once("error",reject);server!.listen(0,"127.0.0.1",resolve)})
    const host="https://127.0.0.1:"+(server.address() as any).port
    process.env.DOGRUADRES_PUBLIC_ORIGIN=host
    process.env.DOGRUADRES_TLS_CERT=crt
    process.env.DOGRUADRES_TLS_KEY=key
    process.env.DOGRUADRES_FRONTDOOR_PORT=(server.address() as {port:number}).port.toString()
    const topology=ingressConfig(process.env)
    assert.equal(topology.privateOrigin,process.env.DOGRUADRES_PRIVATE_API)
    assert.equal(topology.publicOrigin,host)
    const browser=new B06Chrome(host,"A");browsers.push(browser)
    // Real GitHub runner at 30s: Chrome process alive but CDP still unavailable.
    // Allow one bounded 45s startup for this disposable first browser only.
    // Do not retry/disable TLS, MFA, authorization or browser proof on failure.
    await browser.start(crt,45000)
    // Reuse the existing trusted HTTPS/real Chrome login, no separate scan job.
    await assertWcag22AxeInChrome(browser,"#login","anonymous-login")
    await browser.login(A.email,A.password,A.person)
    if(process.env.B22_ADMIN_SMTP==="true"){
      const other=new B06Chrome(host,"B");browsers.push(other)
      await other.start(crt);await other.login(B.email,B.password,B.person)
      await verifyAdminSmtp(browser,other,container,A.person,B.person,q,smtpGuard!)
      return
    }
    // M0 private contact slice uses the already strongly authenticated Person.
    // It does not create a second Customer, Person, Owner or Organization.
    const mobileBrowser=browser
    await mobileBrowser.wait("!document.getElementById('person-mobile-form').hidden")
    await assertWcag22AxeInChrome(mobileBrowser,"#person-mobile-form","authenticated-mobile-form")
    const firstMobile=await mobileBrowser.eval("(async()=>{"+
      "const r=await fetch('/personal/profile');"+
      "return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}})()")
    assert.equal(firstMobile.status,200)
    assert.equal(firstMobile.body.mobile_phone,null)
    assert.equal(firstMobile.body.version,0)
    assert.equal(firstMobile.body.phone_verified,false)
    assert.match(firstMobile.cache,/no-store/)
    const mobileAuditBefore=Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='person.mobile_updated'",
      [A.person]))[0].n)
    const personalPhone="+905551234567" // synthetic-only CI number
    await mobileBrowser.input("#person-mobile-form input[name=mobile_phone]",personalPhone)
    await mobileBrowser.click("#person-mobile-form button[type=submit]")
    await mobileBrowser.wait("document.getElementById('person-mobile-status').textContent.includes('kayıtlı')")
    const afterMobile=await mobileBrowser.eval("(async()=>{"+
      "const r=await fetch('/personal/profile');return {status:r.status,body:await r.json()}})()")
    assert.deepEqual(afterMobile,{status:200,body:{
      mobile_phone:personalPhone,version:1,phone_verified:false
    }})
    const personMobileRows=await q("select mobile_phone,mobile_version from da_person where id=$1",[A.person])
    assert.deepEqual(personMobileRows,[{mobile_phone:personalPhone,mobile_version:1}])
    assert.equal((await q("select mobile_phone from da_person where id=$1",[B.person]))[0].mobile_phone,null)
    const contactEvents=await q(
      "select e.new_values,o.envelope from da_audit_event e "+
      "join da_audit_outbox o on o.source_audit_event_id=e.id "+
      "where e.actor_person_id=$1 and e.action='person.mobile_updated'",
      [A.person])
    assert.equal(contactEvents.length,mobileAuditBefore+1)
    assert.ok(!JSON.stringify(contactEvents).includes(personalPhone),
      "Neither audit nor outbox may contain private phone")
    const deniedForeign=await mobileBrowser.eval("(async()=>{"+
      "const r=await fetch('/personal/profile?person_id=daprs_foreign');return r.status})()")
    assert.equal(deniedForeign,400)
    const blockedPost=await mobileBrowser.eval("(async()=>{"+
      "const r=await fetch('/personal/profile',{method:'POST',"+
      "headers:{'content-type':'application/json'},body:JSON.stringify({"+
      "mobile_phone:'+905551234568',expected_version:1})});return r.status})()")
    assert.equal(blockedPost,403,"Missing same-origin CSRF must deny a write")
    const staleMobile=await mobileBrowser.eval("(async()=>{"+
      "const s=await (await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/profile',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({mobile_phone:'+905551234568',expected_version:0})});"+
      "return r.status})()")
    assert.equal(staleMobile,409)
    assert.deepEqual(await q("select mobile_phone,mobile_version from da_person where id=$1",[A.person]),
      [{mobile_phone:personalPhone,mobile_version:1}])
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='person.mobile_updated'",
      [A.person]))[0].n),mobileAuditBefore+1)
    process.stdout.write("PASS B22 Chrome: M0 canonical Person private mobile GET, real UI save and PG16 readback, audit/outbox privacy, foreign query400, CSRF403, stale409, no duplicate mutation\\n")

    // Real PG16 row-lock ordering: pause the Person row while a profile POST
    // and an independent internal enrollment-session creation contend.
    // The profile must WAIT for Person BEFORE taking the security epoch lock.
    // This uses real Foundation transactions, not a mocked SQL scheduler.
    const binding=await q(`select auth_identity_id from da_login_binding
      where person_id=$1 and revoked_at is null and verified_at is not null`,[A.person])
    assert.equal(binding.length,1)
    const mobileBarrier=new Client({connectionString:u.toString()})
    const mobileProbe=new Client({connectionString:u.toString()})
    await mobileBarrier.connect();await mobileProbe.connect()
    let mobileBarrierHeld=false
    let mobileProbeHeld=false
    let concurrentMobile:Promise<any>|undefined
    let concurrentSession:Promise<any>|undefined
    try {
      await mobileBarrier.query("BEGIN");mobileBarrierHeld=true
      await mobileBarrier.query("select id from da_person where id=$1 for update",[A.person])
      concurrentMobile=mobileBrowser.eval(`(async()=>{
        const s=await(await fetch('/personal/session')).json();
        const r=await fetch('/personal/profile',{method:'POST',
          headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
          body:JSON.stringify({mobile_phone:'+905551234567',expected_version:1})});
        return {status:r.status,body:await r.json()};
      })()`).then(value=>({value}),error=>({error:String(error)}))
      await until(async()=>{
        const rows=await q(`select count(*)::int n from pg_stat_activity
          where datname=current_database() and wait_event_type='Lock'
            and query ilike '%from da_browser_session s%'
            and query ilike '%for update of p%'`)
        return rows[0].n>=1
      },15000,"M0 mobile POST waits on Person BEFORE session/security")
      // NOWAIT would fail if the profile already held the epoch lock.
      await mobileProbe.query("BEGIN");mobileProbeHeld=true
      await mobileProbe.query("select epoch from da_person_security where person_id=$1 for update nowait",[A.person])
      await mobileProbe.query("ROLLBACK");mobileProbeHeld=false
      // Same Person sign-in uses IdentitySessions.create() with Person→epoch
      // locking; a task-only enrollment session exercises that exact native
      // creation method without bypassing real visitor MFA credentials.
      concurrentSession=foundation.openPersonalSession(
        binding[0].auth_identity_id,"mfa_enroll"
      ).then(value=>({value}),error=>({error:String(error)}))
      await until(async()=>{
        const rows=await q(`select count(*)::int n from pg_stat_activity
          where datname=current_database() and wait_event_type='Lock'
            and query ilike '%from da_login_binding b%'
            and query ilike '%for update of b,p%'`)
        return rows[0].n>=1
      },15000,"M0 new Person session waits on same Person row")
      await mobileBarrier.query("COMMIT");mobileBarrierHeld=false
      const [mobileResult,createdResult]=await Promise.all([concurrentMobile,concurrentSession])
      assert.equal(mobileResult.value?.status,200,mobileResult.error||"Mobile update must complete")
      assert.equal(mobileResult.value?.body?.version,1,"Identical mobile write is no-op")
      assert.match(createdResult.value?.token??"",/^[A-Za-z0-9_-]{43}$/,
        createdResult.error||"Second native Person session must complete without deadlock")
      await foundation.closePersonalSession(createdResult.value.token,false)
      assert.deepEqual(await q("select mobile_phone,mobile_version from da_person where id=$1",[A.person]),
        [{mobile_phone:personalPhone,mobile_version:1}])
      process.stdout.write("PASS B22 PG16: concurrent Person session creation and mobile POST obey Person-first lock; one no-op write, no deadlock\\n")
    }finally {
      if(mobileProbeHeld)await mobileProbe.query("ROLLBACK")
      if(mobileBarrierHeld)await mobileBarrier.query("ROLLBACK")
      await Promise.allSettled([concurrentMobile,concurrentSession].filter(Boolean) as Promise<any>[])
      await mobileProbe.end();await mobileBarrier.end()
    }

    // Real Chrome verifies CSRF403 and profile privacy above. The shipped
    // UI's definite 403 recovery guidance is exercised by the browser-script
    // VM test without changing protected session timestamps.

    // Approved personal workspace has no editable launcher. Its retired
    // Person-only API must not read or write historical preference rows.
    const legacyPrefsBefore=await q("select id,person_id,app_ids,collapsed_ids,version from da_launcher_preference order by id")
    const retiredLauncher=await browser.eval(`(async()=>{
      const get=await fetch('/personal/launcher',{credentials:'same-origin'})
      const post=await fetch('/personal/launcher',{method:'POST',
        credentials:'same-origin',headers:{'content-type':'application/json'},
        body:JSON.stringify({app_ids:['storefront'],collapsed_ids:[],version:0})})
      return {present:!!document.getElementById('launcher-section'),
        get:get.status,post:post.status}
    })()`)
    assert.deepEqual(retiredLauncher,{present:false,get:403,post:403})
    assert.deepEqual(await q("select id,person_id,app_ids,collapsed_ids,version from da_launcher_preference order by id"),legacyPrefsBefore)
    process.stdout.write("PASS B22 Chrome: no personal launcher; old GET/POST 403, historic preference rows untouched\n")
    const cookie=await browser.token()
    assert.match(cookie??"",/^[A-Za-z0-9_-]{43}$/)
    // Execute the INSTALLED native Mercur product workflow on the existing
    // disposable CI DB, before creating any new personal commerce writer.
    // Workflow input is INTERNAL ONLY: it is not a visitor authorization.
    const nativeProductTitle="B22 native draft "+rand
    const {result:products}=await createProductsWorkflow(container).run({
      input:{products:[{title:nativeProductTitle,status:"draft",seller_ids:[stores[0].id]}],
        created_by:stores[0].id}
    })
    assert.equal(products.length,1)
    const draft=products[0]
    assert.ok(/^prod_[A-Za-z0-9_-]+$/.test(draft.id))
    const [actualProduct]=await q("select id,title,status from product where id=$1",[draft.id])
    assert.equal(actualProduct?.title,nativeProductTitle)
    assert.equal(actualProduct?.status,"draft")
    const actualLinks=await q("select seller_id from product_seller where product_id=$1",[draft.id])
    assert.deepEqual(actualLinks.map(x=>x.seller_id),[stores[0].id])
    // A native product workflow does not by itself prove a human's product
    // permission, nor grant the other Seller/Organization access.
    assert.ok(!actualLinks.some(x=>x.seller_id===stores[1].id))
    process.stdout.write("PASS B22 native Mercur product workflow: draft persisted, only selected Seller linked; no visitor writer/permission claim\n")
    const get=async(path:string,additional:Record<string,string>={})=>{
      return browser.eval(`(async()=>{
        const r=await fetch(${JSON.stringify(path)},{headers:${JSON.stringify(additional)}})
        return {status:r.status,body:await r.json(),cache:r.headers.get("cache-control"),
          robots:r.headers.get("x-robots-tag"),vary:r.headers.get("vary")}
      })()`)
    }
    const selected=(org:string)=>"/personal/organization-stores?organization="+encodeURIComponent(org)
    // Native SellerMember is NOT a verified human association. Nothing visible.
    await browser.eval("window.__b22_ui_error='';window.addEventListener('error',event=>{window.__b22_ui_error=String(event.message).slice(0,90)});window.__b22_events=[];['pagehide','visibilitychange','popstate'].forEach(name=>window.addEventListener(name,()=>window.__b22_events.push({type:name,hidden:document.hidden})))")
    // A headless Chrome tab is not entitled to a visible workspace while
    // backgrounded. Bring the actual tab forward; do not bypass its privacy
    // event handlers or fake an active session.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    try {
      await browser.select(organizations[0].name,"owner")
    } catch (error) {
      const info=await browser.eval(`({
        detailValid:(()=>{try{return !!JSON.parse(document.getElementById('detail').textContent).role}catch{return false}})(),
        workspaceVisible:!document.getElementById('workspace').hidden,
        applicationFormExists:!!document.getElementById('store-application-form'),
        applicationRequestReady:typeof applicationRequest==='number',
        sessionStatus:document.getElementById('status').textContent.slice(0,70),
        uiError:String(window.__b22_ui_error||'').replace(/[A-Za-z0-9_-]{20,}/g,'[masked]'),
        visibility:document.visibilityState,
        events:(window.__b22_events||[]).slice(-8),
        selectionForm:(document.querySelector('#organizations button')?.closest('form')?.id||null),
        pathIsPersonal:location.pathname==='/personal'
      })`)
      throw Error("B22 Organization select contract failed: "+JSON.stringify(info))
    }
    await browser.wait("document.getElementById('org-stores-status').textContent.includes('erişim izniniz yok')")
    assert.equal((await get(selected(organizations[0].id))).status,403)
    assert.equal((await q("select count(*)::int n from da_verified_actor_binding where person_id=$1",[A.person]))[0].n,0)
    // Exercise supported real secondary password and native TOTP via UI.
    await browser.input("#link-account input[name=email]",memberEmail)
    await browser.input("#link-account input[name=password]",memberPassword)
    await browser.click("#link-account button")
    await browser.wait("!document.getElementById('link-confirm').hidden")
    // Primary Chrome MFA login has advanced the TOTP counter. Never reuse
    // the just-consumed secondary enrollment code within the same window.
    assert.ok(Math.floor(Date.now()/30000)>secondaryEnrolledCounter,
      "Secondary TOTP challenge must not reuse its enrollment window")
    await browser.input("#link-confirm input[name=code]",otp(secondaryMfa.secret))
    await browser.click("#link-confirm button")
    await browser.wait("document.getElementById('status').textContent==='Hesap bağlantısı tamamlandı'")
    const verified=await q("select proof_reference from da_verified_actor_binding where person_id=$1 and actor_type='member' and revoked_at is null",[A.person])
    assert.equal(verified.length,1);assert.match(verified[0].proof_reference,/^dual-proof:/)
    // The real Owner UI submits via native Mercur createSellerAccountWorkflow.
    // No extra Store-to-Organization approval or native dashboard login.
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('store-application-form').hidden")
    // An Owner can create/reopen/edit a PRIVATE Organization Store draft
    // without creating any native Seller or irreversible application claim.
    await browser.wait("!document.getElementById('store-draft-form').hidden")
    // B06Chrome.input inserts at caret; replace existing text via real CDP
    // Ctrl+A key events as the user would, never direct DOM value mutation.
    const replaceStoreDraftText=async(selector:string,value:string)=>{
      await browser.click(selector)
      await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:"a",code:"KeyA",
        modifiers:2,windowsVirtualKeyCode:65})
      await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",
        modifiers:2,windowsVirtualKeyCode:65})
      await browser.send("Input.insertText",{text:value})
    }
    const draftName="B22 draft "+rand,draftEdited="B22 revised draft "+rand
    const draftEmail="draft-"+rand+"@example.invalid"
    await browser.input("#store-draft-form input[name=name]",draftName)
    await browser.input("#store-draft-form input[name=email]",draftEmail)
    await browser.click("#store-draft-form button[type=submit]")
    await browser.wait("document.getElementById('store-application-status').textContent.includes('Taslak kaydedildi')")
    const draftUrl="/personal/store-applications?organization_id="+encodeURIComponent(organizations[0].id)
    const storedDrafts=await get(draftUrl)
    assert.equal(storedDrafts.status,200)
    assert.equal(storedDrafts.body.drafts.length,1)
    const storeDraftId=storedDrafts.body.drafts[0].id
    assert.match(storeDraftId,/^dasdraft_[0-9a-f]{32}$/)
    assert.equal(storedDrafts.body.drafts[0].name,draftName)
    assert.equal(storedDrafts.body.drafts[0].version,1)
    assert.equal((await q("select count(*)::int n from da_store_application where organization_id=$1",
      [organizations[0].id]))[0].n,0,"Saving drafts may not create a Seller claim")
    await browser.wait("document.querySelector('#store-application-list button')?.textContent==='Taslağı düzenle'")
    await browser.click("#store-application-list button")
    await replaceStoreDraftText("#store-draft-form input[name=name]",draftEdited)
    await browser.click("#store-draft-form button[type=submit]")
    await browser.wait("document.getElementById('store-application-status').textContent.includes('Taslak kaydedildi')")
    const editedDrafts=await get(draftUrl)
    assert.equal(editedDrafts.body.drafts.length,1)
    assert.equal(editedDrafts.body.drafts[0].id,storeDraftId)
    assert.equal(editedDrafts.body.drafts[0].name,draftEdited)
    assert.equal(editedDrafts.body.drafts[0].version,2)
    const saveDraft=async(payload:Record<string,unknown>,validCsrf=true)=>browser.eval(`(async()=>{
      const s=await (await fetch('/personal/session')).json()
      const r=await fetch('/personal/store-applications',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':${validCsrf?"s.csrf_token":"'invalid'"}},
        body:JSON.stringify(${JSON.stringify(payload)})})
      return {status:r.status,body:await r.json()}
    })()`)
    const draftRequest={action:"save_draft",organization_id:organizations[0].id,
      draft_id:storeDraftId,expected_version:1,name:"Stale draft",email:draftEmail,currency_code:"try"}
    assert.equal((await saveDraft(draftRequest)).status,409,
      "A stale form may not overwrite the latest Organization draft")
    assert.equal((await saveDraft({...draftRequest,expected_version:2},false)).status,403,
      "Native session Owner draft writes still require valid CSRF")
    assert.equal((await saveDraft({...draftRequest,organization_id:organizations[2].id,
      expected_version:2})).status,403,
      "An unrelated Organization cannot read or alter another Store draft")
    assert.equal((await get("/personal/store-applications?organization_id="+
      encodeURIComponent(organizations[2].id))).status,403)
    assert.deepEqual(await q(`select version,name from da_store_application_draft where id=$1`,
      [storeDraftId]),[{version:2,name:draftEdited}],
      "Stale and foreign writes may not change durable draft input")
    const draftAudit=await q(`select e.action,e.target_id,x.id as outbox_id
      from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.organization_id=$1 and e.action='organization.store_application_draft_saved'
        and e.target_id=$2 order by e.occurred_at`,[organizations[0].id,storeDraftId])
    assert.equal(draftAudit.length,2)
    assert.ok(draftAudit.every((x:any)=>x.action==="organization.store_application_draft_saved"&&
      x.target_id===storeDraftId&&typeof x.outbox_id==="string"))
    assert.equal((await q("select count(*)::int n from da_store_application where organization_id=$1",
      [organizations[0].id]))[0].n,0,
      "Two successful drafts and rejected retries create zero native Store applications")
    process.stdout.write("PASS B22 Chrome: Owner Store draft saved, edited, reloaded with version and audit/outbox; stale409, CSRF403, foreign403; zero native Seller applications\n")
    const applicationName="B22 Owner application "+rand
    const applicationEmail="b22-owner-app-"+rand+"@example.invalid"
    await browser.input("#store-application-form input[name=name]",applicationName)
    await browser.input("#store-application-form input[name=email]",applicationEmail)
    await browser.click("#store-application-form button")
    let observed=""
    await until(async()=>{
      observed=String(await browser.eval("document.getElementById('store-application-status').textContent"))
      return observed.includes("Başvuru kaydedildi") ||
        observed.includes("Başvuru reddedildi") || observed.includes("Sonuç belirsiz")
    },19000,"B22 Owner Store application outcome")
    if(!observed.includes("Başvuru kaydedildi")){
      const state=await q(`select status,seller_id is not null as seller_created
        from da_store_application where organization_id=$1 and person_id=$2`,
        [organizations[0].id,A.person])
      // Never log credentials, Member IDs, application keys or Seller details.
      throw Error("B22 application incomplete: ui_category="+
        (observed.includes("Sonuç belirsiz")?"uncertain":"denied")+
        ",rows="+state.length+",state="+state.map((row:any)=>row.status).join(",")+
        ",seller_written="+state.some((row:any)=>row.seller_created))
    }
    const createdList=await get("/personal/store-applications?organization_id="+encodeURIComponent(organizations[0].id))
    assert.equal(createdList.status,200)
    const ownApplications=createdList.body.applications
    assert.equal(ownApplications.length,1)
    assert.equal(ownApplications[0].status,"created")
    const applicationId=ownApplications[0].id,ownerStoreId=ownApplications[0].seller_id
    assert.match(applicationId,/^daapp_[0-9a-f]{32}$/)
    assert.match(ownerStoreId,/^sel_[A-Za-z0-9_-]+$/)
    const newNative=await native.listSellers({id:ownerStoreId})
    assert.equal(newNative.length,1)
    assert.equal(newNative[0].status,"pending_approval")
    assert.equal(newNative[0].approved_at,null)
    const linked=await q(`select o.organization_id,e.action,e.actor_person_id,
      x.id outbox_id from da_organization_seller_ownership o
      join da_audit_event e on e.id=o.verification_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where o.seller_id=$1`,[ownerStoreId])
    assert.equal(linked.length,1)
    assert.equal(linked[0].organization_id,organizations[0].id)
    assert.equal(linked[0].actor_person_id,A.person)
    assert.equal(linked[0].action,"organization.store_application_created")
    const submit=async(payload:Record<string,string>)=>browser.eval(`(async()=>{
      const csrf=await (await fetch('/personal/session')).json()
      const response=await fetch('/personal/store-applications',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf.csrf_token},
        body:JSON.stringify(${JSON.stringify(payload)})})
      return {status:response.status,body:await response.json()}
    })()`)
    const data={organization_id:organizations[0].id,application_id:applicationId,
      name:applicationName,email:applicationEmail,currency_code:"try"}
    const replay=await submit(data)
    assert.equal(replay.status,200);assert.equal(replay.body.seller_id,ownerStoreId)
    await verifyInvisibleStoreNameRejection(browser,organizations[0].id,rand,q)
    // A newly submitted name must not impersonate an existing Seller:
    // same Organization, Unicode NFKC equivalent or a legacy native Seller.
    // Each 409 must happen BEFORE creating a second Foundation application.
    const newCollisionApplicationId=()=>("daapp_"+randomBytes(16).toString("hex"))
    const collisionEmail="b22-collision-"+rand+"@example.invalid"
    assert.equal((await submit({...data,
      application_id:newCollisionApplicationId(),email:collisionEmail,
      name:applicationName.toUpperCase()})).status,409)
    assert.equal((await submit({...data,
      application_id:newCollisionApplicationId(),email:collisionEmail,
      name:"Ｂ２２"+applicationName.slice(3)})).status,409,
      "NFKC-compatible fullwidth characters reserve the same Store name")
    assert.equal((await submit({...data,
      application_id:newCollisionApplicationId(),email:collisionEmail,
      name:applicationName.replace("Owner application","Owner\u00a0\u00a0application")})).status,409,
      "Unicode compatibility spaces and repeated blanks cannot bypass the reservation")
    assert.equal((await submit({...data,
      application_id:newCollisionApplicationId(),email:collisionEmail,
      name:stores[0].name.toUpperCase()})).status,409,
      "A legacy native Seller's name cannot be claimed by a new application")
    assert.deepEqual(await q(`select count(*)::int n from da_store_application
      where organization_id=$1`,[organizations[0].id]),[{n:1}],
      "Every equivalent-name conflict must leave no second application or Seller claim")
    const [nameClaim]=await q(`select store_name_hash from da_store_application
      where id=$1`,[applicationId])
    assert.match(nameClaim.store_name_hash,/^[a-f0-9]{64}$/)
    process.stdout.write("PASS B22 PG16/Chrome: global normalized Store name claim; case/NFKC/native legacy conflicts409, no second application or Seller\n")
    assert.equal((await submit({...data,name:applicationName.replace("Owner","Other")})).status,403)
    assert.equal((await submit({...data,organization_id:organizations[2].id,
      application_id:"daapp_"+randomBytes(16).toString("hex")})).status,403)
    assert.equal((await q("select count(*)::int n from da_store_application where person_id=$1",[A.person]))[0].n,1)
    // The Origin link is created at Owner submission, but Seller approval is
    // STILL mandatory. A pending Seller must never enter the active Store list.
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores,[])
    // The Owner cannot impersonate a platform reviewer, even though the
    // workflow created SellerMember.is_owner for this Store.
    const ownerApprovalDenied=await browser.eval(`(async()=>{
      const session=await (await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({application_id:applicationId,seller_id:ownerStoreId})})})
      return response.status
    })()`)
    assert.equal(ownerApprovalDenied,403)
    assert.equal((await get("/personal/platform/stores")).status,403)
    assert.equal((await native.listSellers({id:ownerStoreId}))[0].status,"pending_approval")
    // One isolated historical Origin fixture has a real native pending
    // Seller; 30 older records have no native Seller and convey no access.
    // This tests approval of an older page without a second linkage approval.
    const [olderPending]=await native.createSellers([{
      name:"B22 older pending "+rand,
      email:"b22-older-pending-"+rand+"@example.invalid",currency_code:"try"
    }])
    const nativeBeforeOlder=await native.listSellers({id:olderPending.id})
    assert.equal(nativeBeforeOlder.length,1)
    assert.equal(nativeBeforeOlder[0].status,"pending_approval")
    assert.equal(nativeBeforeOlder[0].approved_at,null)
    await native.createSellerMembers([{seller_id:olderPending.id,
      member_id:member.id,is_owner:true}])
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores,[])
    await q(`insert into da_store_application
      (id,organization_id,person_id,member_actor_id,member_auth_identity_id,
       request_fingerprint,status,seller_id,created_at)
      select 'daapp_'||md5('b22-history-'||$1||':'||g.n::text),
        $2,$3,$4,$5,repeat('b',64),'created',
        case when g.n=0 then $7 else 'sel_b22_history_'||g.n::text||'_'||$1 end,
        (select created_at from da_store_application where id=$6)-interval '1 hour'
          +g.n*interval '1 millisecond'
      from generate_series(0,30) g(n)`,
      [rand,organizations[0].id,A.person,member.id,reg.authIdentity.id,applicationId,olderPending.id])
    await q(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,organization_id,action,module,
       resource,target_id,new_values,occurred_at)
      select 'daaud_b22_history_'||g.n::text||'_'||$1,
        $2,'user',$3,$4,'organization.store_application_created',
        'dogruadres-access','store-application',
        case when g.n=0 then $5 else 'sel_b22_history_'||g.n::text||'_'||$1 end,
        jsonb_build_object('application_id',
          'daapp_'||md5('b22-history-'||$1||':'||g.n::text),
          'status','pending_approval'),clock_timestamp()
      from generate_series(0,30) g(n)`,
      [rand,A.person,A.actor,organizations[0].id,olderPending.id])
    await q(`insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope)
      select 'daaob_b22_history_'||g.n::text||'_'||$1,
        'daaud_b22_history_'||g.n::text||'_'||$1,
        'dogruadres-access','{}'::jsonb from generate_series(0,30) g(n)`,[rand])
    await q(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      select 'daown_b22_history_'||g.n::text||'_'||$1,$2,
        case when g.n=0 then $3 else 'sel_b22_history_'||g.n::text||'_'||$1 end,
        'daaud_b22_history_'||g.n::text||'_'||$1,clock_timestamp()
      from generate_series(0,30) g(n)`,[rand,organizations[0].id,olderPending.id])
    assert.equal((await q("select count(*)::int n from da_store_application where organization_id=$1",
      [organizations[0].id]))[0].n,32)
    // TEST-ONLY disposable scope: an explicit store.approve grant belongs to
    // another Person. It is never inferred from B's native User/Org roles.
    const grantId="da_staff_b22_"+rand
    await q(`insert into da_platform_staff_grant
      (id,person_id,task,resource,granted_by_person_id,reason)
      values($1,$2,'store.approve','platform',$2,'B22 disposable CI platform reviewer fixture')`,[grantId,B.person])
    const reviewer=new B06Chrome(host,"B");browsers.push(reviewer)
    await reviewer.start(crt)
    await reviewer.login(B.email,B.password,B.person)
    // CR-01: a real strongly authenticated Staff browser provisions a new
    // Organization using the installed personal HTTP route and native Medusa
    // user/Person binding. Its canonical audit/outbox producer must emit the
    // exact Staff role accepted by the strict Index projection contract.
    // This is task-owned CI data; no real company approval is performed.
    assert.equal(await reviewer.eval("(async()=> (await fetch('/personal/platform')).status)()"),403,
      "Native sign-in and Store approval grant do not confer Organization provisioning")
    const staffOrgGrantId="da_staff_org_"+rand
    await q(`insert into da_platform_staff_grant
      (id,person_id,task,resource,granted_by_person_id,reason)
      values($1,$2,'organization.provision','platform',$2,'B22 isolated Staff provision fixture')`,
      [staffOrgGrantId,B.person])
    assert.equal(await reviewer.eval("(async()=> (await fetch('/personal/platform')).status)()"),200)
    assert.equal((await get("/personal/platform")).status,403,
      "Organization Owner cannot acquire separate Staff provision permission")
    const provisionName="B22 Staff provision "+rand
    const provisionBody={name:provisionName,initial_owners:[{actor_type:"user",actor_id:B.actor}]}
    const provision=async(body:unknown, csrfOverride?:string)=>reviewer.eval(`(async()=>{
      const s=await (await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':${JSON.stringify(csrfOverride??"")}||s.csrf_token},
        body:JSON.stringify(${JSON.stringify(body)})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    const forbiddenCsrf=await provision(provisionBody,"invalid-task-csrf")
    assert.equal(forbiddenCsrf.status,403)
    assert.equal((await q("select count(*)::int n from da_organization where name=$1",
      [provisionName]))[0].n,0,"CSRF denial must not write an Organization")
    const forgedOwner=await provision({...provisionBody,
      initial_owners:[{actor_type:"user",actor_id:"usr_foreign_b22_"+rand}]})
    assert.equal(forgedOwner.status,400,
      "Unknown native actor cannot be assigned protected Owner")
    assert.equal((await q("select count(*)::int n from da_organization where name=$1",
      [provisionName]))[0].n,0)
    const created=await provision(provisionBody)
    assert.equal(created.status,201,"Strong Staff grant + verified Owner may provision")
    assert.match(created.body.organization.id,/^daorg_[A-Za-z0-9_-]+$/)
    assert.equal(created.body.organization.name,provisionName)
    assert.equal(created.body.initial_owner_count,1)
    const staffOrgId=created.body.organization.id
    const staffOwner=await q(`select person_id,role,status,protected_owner from
      da_organization_membership where organization_id=$1 and deleted_at is null`,
      [staffOrgId])
    assert.equal(staffOwner.length,1)
    assert.equal(staffOwner[0].person_id,B.person)
    assert.equal(staffOwner[0].role,"owner")
    assert.equal(staffOwner[0].status,"active")
    assert.equal(staffOwner[0].protected_owner,true)
    const staffEvents=await q(`select e.*,x.id as outbox_id,x.envelope
      from da_audit_event e join da_audit_outbox x
      on x.source_audit_event_id=e.id
      where e.organization_id=$1 and
        e.action in ('organization.provisioned','organization.owner_assigned')
      order by e.action`,[staffOrgId])
    assert.deepEqual(staffEvents.map(e=>e.action),
      ["organization.owner_assigned","organization.provisioned"])
    for(const e of staffEvents){
      assert.equal(e.actor_person_id,B.person)
      assert.equal(e.actor_type,"user")
      assert.equal(e.actor_id,B.actor)
      assert.equal(e.role_context,"platform_staff")
      assert.ok(/^daaob_[A-Za-z0-9_-]+$/.test(e.outbox_id))
      const projected=projectFoundationAuditEvent(e)
      assert.equal(projected.actor.role_context,"platform_staff")
      assert.equal(projected.action,e.action)
      assert.equal(projected.organization_id,staffOrgId)
      assert.equal(projected.source_event_id,e.id)
      const envelope=typeof e.envelope==="string"?JSON.parse(e.envelope):e.envelope
      assert.equal(envelope.actor.role_context,"platform_staff")
      assert.equal(envelope.source_audit_event_id,e.id)
      assert.equal((await q("select count(*)::int n from da_security_outbox where audit_event_id=$1",
        [e.id]))[0].n,1,
        "Staff provisioning canonical/security audit must commit together")
    }
    // Existing organization-provision and store-approve grants confer no
    // company application-policy authority without an additional explicit grant.
    const companyPolicyPath='/personal/platform/store-application-policy?organization_id='+
      encodeURIComponent(organizations[0].id)
    assert.equal(await reviewer.callFunction("async function(path){return (await fetch(path)).status}",companyPolicyPath),403,
      "Organization provision and Store approve grants must not authorize policy changes")
    // A platform reviewer with no membership in Alpha cannot read its private
    // notifications, even if they hold organization.provision/store.approve.
    const noticePath="/personal/notifications?organization="+encodeURIComponent(organizations[0].id)
    assert.equal(await reviewer.callFunction(
      "async function(path){return (await fetch(path)).status}",noticePath),403,
      "Platform Staff grant alone must not reveal a company's private notices")
    // Add another real, signed-in Person as a protected Owner of this same
    // company. The reversible task-only membership tests per-Owner delivery;
    // no native Seller right or platform task is inferred from this membership.
    const [temporaryNotificationCoOwner]=await foundation.createMemberships([{
      organization_id:organizations[0].id,person_id:B.person,role:"owner",
      status:"active",protected_owner:true
    }])
    const policyGrantId="da_staff_policy_"+rand
    await q(`insert into da_platform_staff_grant
      (id,person_id,task,resource,granted_by_person_id,reason)
      values($1,$2,'store.application.policy.manage','platform',$2,
        'B22 isolated company policy gate')`,[policyGrantId,B.person])
    // B22 approved independent company policy: an administrator can pause
    // NEW Store requests without suspending an existing native Mercur Store.
    // The pending Seller remains pending and must not be auto-approved on reopen.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    await reviewer.click("#platform-store-policy-open")
    await reviewer.wait("!document.getElementById('platform-store-policy-panel').hidden")
    await reviewer.input("#platform-store-policy-form input[name=organization_id]",
      organizations[0].id)
    await reviewer.click("#platform-store-policy-read")
    await reviewer.wait("document.getElementById('platform-store-policy-status').textContent.includes('açık.')")
    assert.equal(await reviewer.eval("document.getElementById('platform-store-policy-apply').disabled"),false)
    const companyRight=async(enabled:boolean,expected:boolean,reason:string,
      validCsrf=true,organizationId=organizations[0].id,
      actingBrowser:B06Chrome=reviewer,expectedVersion?:number)=>{
      // Test-only snapshot of current committed revision. Historical replay
      // tests pass an explicit older version; product UI always uses HTTP GET.
      const [current]=await q("select store_application_version from da_organization where id=$1",
        [organizationId])
      assert.ok(current)
      const version=expectedVersion??current.store_application_version
      assert.ok(Number.isSafeInteger(version)&&version>=0&&version<2147483647)
      return actingBrowser.callFunction(
        "async function(org,e,x,reason,valid,version){"+
          "const s=await(await fetch('/personal/session')).json();"+
          "const r=await fetch('/personal/platform/store-application-policy',{method:'POST',"+
            "headers:{'content-type':'application/json','x-csrf-token':valid==='true'?s.csrf_token:'bad'},"+
            "body:JSON.stringify({organization_id:org,expected_enabled:x==='true',expected_version:Number(version),enabled:e==='true',reason})});"+
          "return {status:r.status,body:await r.json()};}",
        organizationId,String(enabled),String(expected),reason,String(validCsrf),String(version))
    }
    const initialCompanyState=await q("select store_application_enabled from da_organization where id=$1",
      [organizations[0].id])
    assert.deepEqual(initialCompanyState,[{store_application_enabled:true}])
    const [initialPolicyRevision]=await q(
      "select store_application_version from da_organization where id=$1",
      [organizations[0].id])
    assert.equal(initialPolicyRevision.store_application_version,0)
    assert.equal((await get("/personal/platform/store-application-policy?organization_id="+
      encodeURIComponent(organizations[0].id))).status,403,
      "Owner cannot read platform-only policy administration")
    assert.equal((await companyRight(false,true,"B22 synthetic suspension",false)).status,403)
    assert.deepEqual(await q("select store_application_enabled from da_organization where id=$1",
      [organizations[0].id]),initialCompanyState,
      "CSRF failure must not mutate policy")
    await reviewer.input("#platform-store-policy-form input[name=reason]",
      "B22 synthetic company application pause")
    await reviewer.click("#platform-store-policy-apply")
    await reviewer.wait("document.getElementById('platform-store-policy-status').textContent.includes('kapatıldı')")
    assert.deepEqual(await q("select store_application_enabled from da_organization where id=$1",
      [organizations[0].id]),[{store_application_enabled:false}])
    const stoppedAudit=await q("select e.id,e.action,e.actor_person_id,x.id outbox_id,"+
      "e.new_values->>'reason' reason from da_audit_event e"+
      " join da_audit_outbox x on x.source_audit_event_id=e.id"+
      " where e.organization_id=$1 and e.action='organization.store_application_right_disabled'",
      [organizations[0].id])
    assert.equal(stoppedAudit.length,1)
    assert.equal(stoppedAudit[0].actor_person_id,B.person)
    assert.equal(stoppedAudit[0].reason,"B22 synthetic company application pause")
    const receiptOwners=await q(`select m.person_id from da_organization_membership m
      join da_person p on p.id=m.person_id
      where m.organization_id=$1 and m.role='owner' and m.protected_owner=true
      and m.status='active' and m.deleted_at is null and p.disabled_at is null
      and p.deleted_at is null order by m.person_id`,[organizations[0].id])
    const companyNotices=await q(`select n.person_id from da_notification_receipt n
      where n.audit_event_id=$1 order by n.person_id`,[stoppedAudit[0].id])
    assert.equal(receiptOwners.length,2,
      "Two independently signed-in protected Owners must each receive the policy event")
    assert.deepEqual(companyNotices,receiptOwners,
      "One private policy notice per current protected Owner, no foreign recipient")
    const closedNotices=await get(noticePath)
    assert.equal(closedNotices.status,200)
    assert.equal(closedNotices.body.notifications.filter((n:any)=>
      n.title==="Yeni mağaza başvuru hakkı durduruldu" &&
      n.context===organizations[0].name).length,1)
    const secondOwnerNotices=await reviewer.callFunction(
      "async function(path){const r=await fetch(path);return {status:r.status,body:await r.json()}}",
      noticePath)
    assert.equal(secondOwnerNotices.status,200)
    assert.equal(secondOwnerNotices.body.notifications.filter((n:any)=>
      n.title==="Yeni mağaza başvuru hakkı durduruldu" &&
      n.context===organizations[0].name).length,1,
      "The other current protected Owner must see exactly one private pause notice")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.click("#notification-bell")
    await browser.wait("document.getElementById('notification-list').textContent.includes('Yeni mağaza başvuru hakkı durduruldu')")
    await browser.click("#notification-bell")
    const appCountBefore=Number((await q(
      "select count(*)::int n from da_store_application where organization_id=$1",
      [organizations[0].id]))[0].n)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.click("#store-applications-refresh")
    await browser.wait("document.getElementById('store-application-status').textContent.includes('durduruldu')")
    assert.equal(await browser.eval("document.getElementById('store-application-form').hidden"),true)
    // Pausing new Store applications must not destroy/hide an unfinished
    // Organization draft. Its edit is still Owner-authorized but NOT submit.
    await browser.wait("!document.getElementById('store-draft-form').hidden")
    await browser.wait("document.querySelector('#store-application-list button')?.textContent==='Taslağı düzenle'")
    await browser.click("#store-application-list button")
    const pausedDraftName="B22 paused edit "+rand
    await replaceStoreDraftText("#store-draft-form input[name=name]",pausedDraftName)
    await browser.click("#store-draft-form button[type=submit]")
    await browser.wait("document.getElementById('store-application-status').textContent.includes('Taslak kaydedildi')")
    const [pausedDraft]=await q("select name,version from da_store_application_draft where id=$1",[storeDraftId])
    assert.deepEqual(pausedDraft,{name:pausedDraftName,version:3})
    assert.equal((await q("select count(*)::int n from da_store_application where organization_id=$1",
      [organizations[0].id]))[0].n,appCountBefore)
    process.stdout.write("PASS B22 Chrome: paused company Store draft remains editable but native Owner submit is denied\n")
    // The native HTTPS request for draft A commits to the disposable PG16 DB,
    // but its browser-visible response arrives after the Owner creates draft B.
    // Keep the authorized request real: hold only the response at window.fetch.
    await browser.wait("!document.getElementById('store-draft-form').hidden")
    await browser.wait("document.querySelector('#store-application-list button')?.textContent==='Taslağı düzenle'")
    await browser.click("#store-application-list button")
    const lateDraftName="B22 late reply "+rand
    await replaceStoreDraftText("#store-draft-form input[name=name]",lateDraftName)
    await browser.eval("(()=>{"+
      "const original=window.fetch.bind(window);window.__daDraftRaceFetch=window.fetch;"+
      "window.__daDraftRaceHeld=false;"+
      "window.fetch=(resource,options)=>{"+
      "const url=typeof resource==='string'?resource:resource?.url;"+
      "if(url==='/personal/store-applications'&&options?.method==='POST'&&"+
      "!window.__daDraftRaceHeld){"+
      "window.__daDraftRaceHeld=true;"+
      "return original(resource,options).then(response=>new Promise(resolve=>{"+
      "window.__daDraftRaceRelease=()=>resolve(response)"+
      "}))}return original(resource,options)"+
      "};return true})()")
    await browser.click("#store-draft-form button[type=submit]")
    await browser.wait("typeof window.__daDraftRaceRelease==='function'")
    assert.deepEqual(await q("select name,version from da_store_application_draft where id=$1",
      [storeDraftId]),[{name:lateDraftName,version:4}],
      "The native draft A write must commit before the held browser response")
    await browser.click("#store-draft-new")
    const secondDraftName="B22 second draft "+rand
    const secondDraftEmail="second-draft-"+rand+"@example.invalid"
    await browser.input("#store-draft-form input[name=name]",secondDraftName)
    await browser.input("#store-draft-form input[name=email]",secondDraftEmail)
    await browser.click("#store-draft-form button[type=submit]")
    await browser.wait("document.getElementById('store-application-status').textContent.includes('Taslak kaydedildi')")
    const [secondDraft]=((await get(draftUrl)).body.drafts as any[]).filter(d=>d.name===secondDraftName)
    assert.ok(secondDraft&&/^dasdraft_[0-9a-f]{32}$/.test(secondDraft.id))
    assert.notEqual(secondDraft.id,storeDraftId)
    assert.equal(secondDraft.version,1)
    await browser.eval("(()=>{"+
      "window.__daDraftRaceRelease();window.fetch=window.__daDraftRaceFetch;"+
      "delete window.__daDraftRaceRelease;delete window.__daDraftRaceFetch;return true})()")
    await browser.wait("!document.getElementById('store-draft-form').hidden")
    // Reuse the same B editor after A's late reply. If A has overwritten B's
    // version, the next real HTTPS update gets 409 instead of committing.
    const corruptDraftName="B22 corrupt reply "+rand
    await replaceStoreDraftText("#store-draft-form input[name=name]",corruptDraftName)
    await browser.eval("(()=>{"+
      "const original=window.fetch.bind(window);window.__daDraftMalformedFetch=window.fetch;"+
      "window.__daDraftMalformedPosts=0;"+
      "window.fetch=(resource,options)=>{"+
      "const url=typeof resource==='string'?resource:resource?.url;"+
      "if(url==='/personal/store-applications'&&options?.method==='POST'){"+
      "window.__daDraftMalformedPosts++;"+
      "return original(resource,options).then(response=>"+
      "response.status===200?new Response('{',{status:200,"+
      "headers:{'Content-Type':'application/json'}}):response)"+
      "}return original(resource,options)"+
      "};return true})()")
    await browser.click("#store-draft-form button[type=submit]")
    await browser.wait("window.__daDraftMalformedPosts===1&&"+
      "document.getElementById('store-application-status').textContent.includes('Taslak sonucu belirsiz')")
    assert.deepEqual(await q("select name,version from da_store_application_draft where id=$1",
      [secondDraft.id]),[{name:corruptDraftName,version:2}],
      "A real successful B update must remain durable despite corrupted browser JSON")
    assert.equal(await browser.eval("document.querySelector('#store-draft-form button[type=submit]').disabled"),
      true,"Unknown HTTP outcome must prevent blind retry")
    await browser.click("#store-draft-form button[type=submit]")
    assert.equal(await browser.eval("window.__daDraftMalformedPosts"),1,
      "Clicking a disabled form must never send a duplicate Store draft write")
    await browser.eval("(()=>{window.fetch=window.__daDraftMalformedFetch;"+
      "delete window.__daDraftMalformedFetch;return true})()")
    await browser.click("#store-applications-refresh")
    await browser.wait("document.getElementById('store-application-list').textContent.includes("+
      JSON.stringify("Kaydedilmiş mağaza taslağı (gönderilmedi) — "+corruptDraftName)+")")
    assert.equal((await q("select count(*)::int n from da_store_application_draft where organization_id=$1",
      [organizations[0].id]))[0].n,2,
      "Two distinct private drafts, no duplicate after ambiguous HTTP response")
    assert.equal((await q("select count(*)::int n from da_store_application where organization_id=$1",
      [organizations[0].id]))[0].n,appCountBefore,
      "Draft race and corrupt reply must not create a native Seller application")
    process.stdout.write("PASS B22 Chrome: delayed native A draft reply cannot corrupt new B version; B durable update with browser-only malformed 200 remains uncertain, duplicate blocked, two private drafts, no Seller created\n")
    // A valid JSON object with a mismatched draft ID still cannot prove the
    // result of a real committed HTTPS POST. Corrupt only the Chrome-visible
    // response; keep the native service and PostgreSQL writes untouched.
    await browser.wait("document.querySelector('#store-application-list button')?.closest('p')?.textContent.includes("+
      JSON.stringify(corruptDraftName)+")")
    await browser.click("#store-application-list button")
    const semanticDraftEmail="semantic-draft-"+rand+"@example.invalid"
    await replaceStoreDraftText("#store-draft-form input[name=email]",semanticDraftEmail)
    const auditBeforeSemantic=Number((await q(
      "select count(*)::int n from da_audit_event where target_id=$1 and action='organization.store_application_draft_saved'",
      [secondDraft.id]))[0].n)
    assert.equal(auditBeforeSemantic,2,
      "Only the B draft's original create and malformed-response update exist")
    await browser.eval("(()=>{"+
      "const original=window.fetch.bind(window);window.__daDraftSemanticFetch=window.fetch;"+
      "window.__daDraftSemanticPosts=0;"+
      "window.fetch=(resource,options)=>{"+
      "const url=typeof resource==='string'?resource:resource?.url;"+
      "if(url==='/personal/store-applications'&&options?.method==='POST'){"+
      "window.__daDraftSemanticPosts++;"+
      "return original(resource,options).then(async response=>{"+
      "if(response.status!==200)return response;"+
      "const data=await response.clone().json();"+
      "if(data.status!=='draft'||data.version!==3)return response;"+
      "return new Response(JSON.stringify({...data,draft_id:'dasdraft_'+'0'.repeat(32)}),"+
      "{status:200,headers:{'Content-Type':'application/json'}})"+
      "})}return original(resource,options)"+
      "};return true})()")
    await browser.click("#store-draft-form button[type=submit]")
    await browser.wait("window.__daDraftSemanticPosts===1&&"+
      "document.getElementById('store-application-status').textContent.includes('Taslak sonucu belirsiz')")
    assert.deepEqual(await q(
      "select name,email,version from da_store_application_draft where id=$1",
      [secondDraft.id]),[{name:corruptDraftName,email:semanticDraftEmail,version:3}],
      "A valid but mismatched success JSON must not undo the real DB commit")
    assert.equal(await browser.eval("document.querySelector('#store-draft-form button[type=submit]').disabled"),
      true,"A semantically mismatched successful reply must block blind retry")
    await browser.click("#store-draft-form button[type=submit]")
    assert.equal(await browser.eval("window.__daDraftSemanticPosts"),1,
      "A failed contract check must not generate a duplicate HTTPS POST")
    await browser.eval("(()=>{window.fetch=window.__daDraftSemanticFetch;"+
      "delete window.__daDraftSemanticFetch;return true})()")
    const semanticDrafts=(await get(draftUrl)).body.drafts
    assert.equal(semanticDrafts.find((d:any)=>d.id===secondDraft.id)?.version,3,
      "Owner's authorized read can reconcile the durable B draft version")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event where target_id=$1 and action='organization.store_application_draft_saved'",
      [secondDraft.id]))[0].n),auditBeforeSemantic+1,
      "One committed B update must create exactly one canonical audit")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_outbox o join da_audit_event e on e.id=o.source_audit_event_id where e.target_id=$1 and e.action='organization.store_application_draft_saved'",
      [secondDraft.id]))[0].n),auditBeforeSemantic+1,
      "A duplicate click cannot create an extra outbox")
    assert.equal(Number((await q(
      "select count(*)::int n from da_store_application where organization_id=$1",
      [organizations[0].id]))[0].n),appCountBefore,
      "A mismatched success reply must never create a native Seller application")
    process.stdout.write("PASS B22 Chrome: native successful Store draft POST with parseable mismatched 200 JSON remains uncertain; single persistent B v3, one audit/outbox, no duplicate request or Seller application\n")
    const deniedAppId="daapp_"+randomBytes(16).toString("hex")
    const deniedWhilePaused=await browser.callFunction(
      "async function(org,id){"+
      "const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/store-applications',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({organization_id:org,application_id:id,name:'B22 blocked new Store',"+
      "email:'b22-blocked-new-store@example.invalid',currency_code:'try'})});"+
      "return r.status;}",organizations[0].id,deniedAppId)
    assert.equal(deniedWhilePaused,403,"Active protected Owner cannot bypass platform pause")
    assert.equal(Number((await q("select count(*)::int n from da_store_application where id=$1",
      [deniedAppId]))[0].n),0)
    assert.equal(Number((await q(
      "select count(*)::int n from da_store_application where organization_id=$1",
      [organizations[0].id]))[0].n),appCountBefore)
    assert.equal((await native.listSellers({id:ownerStoreId}))[0].status,"pending_approval")
    assert.equal((await native.listSellers({id:stores[0].id}))[0].status,"open",
      "Company application pause cannot suspend a previously approved Seller")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    // The secure workspace conceals private Staff panels in background tabs.
    // Wait for its live, authorized re-render; if still hidden, navigate
    // afresh through the actual session and Store Staff HTTP checks.
    if(!await reviewer.eval("!document.getElementById('workspace').hidden && !document.getElementById('store-approval-panel').hidden")){
      await reviewer.send("Page.reload",{ignoreCache:true})
      await reviewer.wait("document.visibilityState==='visible' && !document.getElementById('workspace').hidden && !document.getElementById('store-approval-panel').hidden")
    }
    await reviewer.click("#store-approval-refresh")
    await reviewer.wait("document.getElementById('store-approval-list').textContent.includes('inceleme bekletiliyor')")
    assert.equal(await reviewer.eval("document.querySelector('#store-approval-list button').disabled"),true)
    const blockedApproval=await reviewer.callFunction(
      "async function(id,seller){const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/platform/stores',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({application_id:id,seller_id:seller})});return r.status;}",
      applicationId,ownerStoreId)
    assert.equal(blockedApproval,409)
    assert.equal((await native.listSellers({id:ownerStoreId}))[0].status,"pending_approval")
    await verifyReasonedStoreRejectionDuringPause({
      reviewer,browser,native,q,org:organizations[0].id,
      orgName:organizations[0].name,ownerId:A.person,ownerActor:A.actor,
      memberId:member.id,authIdentityId:reg.authIdentity.id,rand
    })
    assert.equal((await companyRight(false,true,"B22 stale policy switch")).status,409,
      "Stale switch must be rejected while company is already disabled")
    await reviewer.click("#platform-store-policy-read")
    await reviewer.wait("document.getElementById('platform-store-policy-apply').textContent.includes('aç')")
    await reviewer.input("#platform-store-policy-form input[name=reason]",
      "B22 synthetic company application reopen")
    await reviewer.click("#platform-store-policy-apply")
    await reviewer.wait("document.getElementById('platform-store-policy-status').textContent.includes('açıldı')")
    assert.deepEqual(await q("select store_application_enabled from da_organization where id=$1",
      [organizations[0].id]),[{store_application_enabled:true}])
    const [afterReopenRevision]=await q(
      "select store_application_version from da_organization where id=$1",
      [organizations[0].id])
    assert.equal(afterReopenRevision.store_application_version,2)
    const policyAuditBeforeReplay=await q(`select count(*)::int n from da_audit_event
      where organization_id=$1 and action in
      ('organization.store_application_right_disabled','organization.store_application_right_enabled')`,
      [organizations[0].id])
    // Actual ABA replay: TRUE -> FALSE -> TRUE cannot reuse revision zero.
    assert.equal((await companyRight(false,true,"B22 stale pause replay after reopen",
      true,organizations[0].id,reviewer,
      initialPolicyRevision.store_application_version)).status,409)
    assert.deepEqual(await q(
      "select store_application_enabled,store_application_version from da_organization where id=$1",
      [organizations[0].id]),
      [{store_application_enabled:true,store_application_version:2}])
    assert.deepEqual(await q(`select count(*)::int n from da_audit_event
      where organization_id=$1 and action in
      ('organization.store_application_right_disabled','organization.store_application_right_enabled')`,
      [organizations[0].id]),policyAuditBeforeReplay,
      "Stale replay cannot write audit, outbox or private notices")
    assert.equal((await native.listSellers({id:ownerStoreId}))[0].status,"pending_approval",
      "Reopen only returns prior application to review queue, never auto-approves")
    const enabledEvents=await q("select e.actor_person_id,x.id outbox_id from da_audit_event e"+
      " join da_audit_outbox x on x.source_audit_event_id=e.id"+
      " where e.organization_id=$1 and e.action='organization.store_application_right_enabled'",
      [organizations[0].id])
    assert.equal(enabledEvents.length,1)
    assert.equal(enabledEvents[0].actor_person_id,B.person)
    const reopenedNotices=await get(noticePath)
    assert.equal(reopenedNotices.status,200)
    assert.equal(reopenedNotices.body.notifications.filter((n:any)=>
      n.title==="Yeni mağaza başvuru hakkı açıldı" &&
      n.context===organizations[0].name).length,1)
    const companyTotal=await q(`select count(*)::int n from da_notification_receipt n
      join da_audit_event e on e.id=n.audit_event_id
      where e.organization_id=$1 and e.action in
      ('organization.store_application_right_enabled','organization.store_application_right_disabled')`,
      [organizations[0].id])
    assert.equal(companyTotal[0].n,receiptOwners.length*2)
    const reopenedForSecondOwner=await reviewer.callFunction(
      "async function(path){const r=await fetch(path);return {status:r.status,body:await r.json()}}",
      noticePath)
    assert.equal(reopenedForSecondOwner.status,200)
    assert.equal(reopenedForSecondOwner.body.notifications.filter((n:any)=>
      n.title==="Yeni mağaza başvuru hakkı açıldı" &&
      n.context===organizations[0].name).length,1,
      "Both protected Owners receive the reopen event without duplicate notices")
    // In this disposable fixture only, change the same real Person's
    // protected Owner membership to an ordinary active Member. The current
    // server authorization must immediately hide old Owner-only notices,
    // while the established B22 Member tests reuse the SAME membership id.
    // This is not the product's protected Owner demotion procedure.
    const formerOwnerMember=await q(`update da_organization_membership
      set role='member',protected_owner=false,updated_at=clock_timestamp()
      where id=$1 and organization_id=$2 and person_id=$3
        and role='owner' and protected_owner=true and status='active'
      returning id`,[temporaryNotificationCoOwner.id,organizations[0].id,B.person])
    assert.equal(formerOwnerMember.length,1)
    const privateAfterRevoke=await reviewer.callFunction(
      "async function(){const r=await fetch('/personal/notifications');"+
      "return {status:r.status,body:await r.json()}}")
    assert.equal(privateAfterRevoke.status,200)
    assert.equal(privateAfterRevoke.body.notifications.some((n:any)=>
      n.context===organizations[0].name),false,
      "Former Owner now ordinary Member may not view previous Owner-only notices")
    const [staleCompanyNotice]=await q(`select id from da_notification_receipt
      where audit_event_id=$1 and person_id=$2`,[stoppedAudit[0].id,B.person])
    assert.ok(staleCompanyNotice?.id)
    assert.equal(await reviewer.callFunction(
      "async function(id){const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/notifications',{method:'POST',headers:{"+
      "'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({id})});return r.status}",staleCompanyNotice.id),403,
      "Former Owner now ordinary Member cannot mark an old Owner-only notice read")
    assert.equal((await companyRight(true,false,"B22 stale policy switch")).status,409)
    // Changing this real Person's Owner membership invalidates the page's
    // loaded organization scope. Its existing visibility/focus observer
    // correctly conceals the old private workspace. Reopen with the live
    // session and newly verified scope, never force hidden=false.
    await reviewer.send("Page.bringToFront")
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("document.visibilityState==='visible'&&!document.getElementById('workspace').hidden")
    await reviewer.wait("!document.getElementById('store-approval-panel').hidden")
    await reviewer.wait("document.querySelector('#store-approval-list button:not([data-store-reject])')?.disabled===false")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.click("#store-applications-refresh")
    await browser.wait("!document.getElementById('store-application-form').hidden")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    process.stdout.write("PASS B22 Chrome/HTTP/PG16: platform company Store application pause/reopen, private Owner 403, CSRF 403, native pending on hold, old Store open, audit/outbox and no auto-approval\n")

    await q("update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1",
      [staffOrgGrantId])
    assert.equal(await reviewer.eval("(async()=> (await fetch('/personal/platform')).status)()"),403)
    assert.equal((await provision({...provisionBody,name:provisionName+" revoked"})).status,403)
    assert.equal((await q("select count(*)::int n from da_organization where name=$1",
      [provisionName+" revoked"]))[0].n,0)
    // Separate store.approve grant remains valid; Staff and Owner roles
    // cannot silently inherit each other's permissions.
    process.stdout.write("PASS B22 Chrome: real Staff Organization provision HTTP201 and protected Owner persisted, two canonical platform_staff audit/outboxes project safely; CSRF/foreign actor/revoked grant denied\n")
    reviewer.phase="platform-store-review"
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    await reviewer.wait("!document.getElementById('store-approval-panel').hidden")
    await reviewer.wait("document.querySelectorAll('#store-approval-list button:not([data-store-reject])').length===1")
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(applicationName)})`),true)
    // Real staff Chrome can approve a native pending Seller on page 2;
    // the remaining 30 fake Seller IDs confer no lifecycle or authority.
    assert.equal(await reviewer.eval("document.getElementById('store-approval-older').hidden"),false)
    await reviewer.click("#store-approval-older")
    await reviewer.wait("document.getElementById('store-approval-status').textContent.includes('sayfa 2') || document.getElementById('store-approval-status').textContent.includes('Bu sayfada')")
    assert.equal(await reviewer.eval("document.getElementById('store-approval-newer').hidden"),false)
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(applicationName)})`),false)
    await reviewer.wait("document.querySelectorAll('#store-approval-list button:not([data-store-reject])').length===1")
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(olderPending.name)})`),true)
    await reviewer.click("#store-approval-list button")
    await until(async()=>{
      const rows=await native.listSellers({id:olderPending.id})
      return rows.length===1&&rows[0].status==="open"&&!!rows[0].approved_at
    },19000,"B22 older native pending Seller approval from page 2")
    // Suspend only this older task-owned Seller so the pre-existing Owner
    // and new Seller positive/negative expectations remain independent.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:olderPending.id,reason:"B22 task-only older Store suspension"
    }})
    assert.equal((await native.listSellers({id:olderPending.id}))[0].status,"suspended")
    // The other Chrome window may have taken focus while the *native*
    // suspension workflow ran. Never bypass visibility-based privacy;
    // restore this real reviewer tab before invoking its visible page button.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    // Hidden-tab privacy can conceal the entire workspace. A normal reload
    // must re-authorize the real Staff session; never force hidden=false.
    if(await reviewer.eval("document.getElementById('workspace').hidden")){
      await reviewer.send("Page.reload",{ignoreCache:true})
      await reviewer.send("Page.bringToFront")
    }
    await reviewer.wait("!document.getElementById('store-approval-panel').hidden")
    // Privacy-preserving tab restoration may re-run the Staff list from page
    // zero. Do not click a newly hidden page-2 navigation control; use the
    // actual visible refresh action when the browser already reset to page 0.
    if(await reviewer.eval("document.getElementById('store-approval-newer').hidden"))
      await reviewer.click("#store-approval-refresh")
    else
      await reviewer.click("#store-approval-newer")
    // Both pages expose one button: only page-1 Store identity proves the
    // asynchronous page switch completed before approval.
    const pageOneReviewVisible=`document.visibilityState==='visible' &&
      !document.getElementById('workspace').hidden &&
      document.querySelectorAll('#store-approval-list button:not([data-store-reject])').length===1 &&
      document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(applicationName)})`
    try{
      await until(async()=>await reviewer.eval(pageOneReviewVisible)===true,
        8000,"B22 Staff approval first-page navigation")
    }catch{
      // Page focus may re-trigger a stale page-2 request after a prior
      // suspended Seller changes the list. A single normal reload rechecks
      // the same authenticated Staff task; no DOM privacy guard is bypassed.
      await reviewer.send("Page.bringToFront")
      await reviewer.send("Page.reload",{ignoreCache:true})
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible' && "+
        "!document.getElementById('workspace').hidden && "+
        "!document.getElementById('store-approval-panel').hidden")
      await reviewer.click("#store-approval-refresh")
      try{
        await reviewer.wait(pageOneReviewVisible)
      }catch{
        // Never serialize Store names, Session values or private payloads.
        const safeState=await reviewer.eval(
          "({visible:document.visibilityState==='visible',"+
          "workspaceHidden:document.getElementById('workspace').hidden,"+
          "panelHidden:document.getElementById('store-approval-panel').hidden,"+
          "listCount:document.querySelectorAll('#store-approval-list button').length,"+
          "olderHidden:document.getElementById('store-approval-older').hidden,"+
          "newerHidden:document.getElementById('store-approval-newer').hidden})")
        const statuses=reviewer.http.filter((h:any)=>
          ['/personal','/personal/session','/personal/platform/stores'].includes(h.path))
          .slice(-10).map((h:any)=>({path:h.path,status:h.status}))
        throw Error("B22 Store first page could not revalidate: "+
          JSON.stringify({safeState,statuses}))
      }
    }
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(applicationName)})`),true)
    // The real browser button invokes Mercur's native approval. Hold the
    // task-only seller status UPDATE with an independent PG16 advisory lock,
    // then revoke the current platform Staff task from a second connection.
    // The staff-grant row lock must keep revoke UNCOMMITTED until the native
    // approval and its Foundation authorization completion have finished.
    const staffBarrier=new Client({connectionString:u.toString()})
    const staffRevoker=new Client({connectionString:u.toString()})
    await staffBarrier.connect()
    await staffRevoker.connect()
    let sellerPauseFn=false,sellerPauseTrigger=false,staffBarrierHeld=false
    let staffRevokeDone=false
    let companyPolicySwitchDone=false
    let companyPolicySwitch:Promise<{value?:{status:number};error?:string}>|undefined
    const beforeStoreApprovals=reviewer.http.filter(
      (x:any)=>x.path==="/personal/platform/stores"&&x.method==="POST").length
    try{
      const tables=await q("select count(*)::int n from pg_class where oid=to_regclass('public.seller') and relkind='r'")
      assert.equal(tables[0].n,1,"Installed Mercur native Seller persistence must be a real PG16 relation")
      await q("create function b22_staff_native_seller_pause_v1() returns trigger language plpgsql as $b22$ begin if NEW.id='"+ownerStoreId+"' and NEW.status='open' then perform pg_advisory_xact_lock(hashtext('b22-seller-open-pause'),hashtext('"+ownerStoreId+"')); end if; return NEW; end $b22$")
      sellerPauseFn=true
      await q("create trigger b22_staff_native_seller_pause_v1 after update on seller for each row execute function b22_staff_native_seller_pause_v1()")
      sellerPauseTrigger=true
      await staffBarrier.query("BEGIN")
      staffBarrierHeld=true
      const holderPid=(await staffBarrier.query("select pg_backend_pid()::int pid")).rows[0].pid as number
      const revokePid=(await staffRevoker.query("select pg_backend_pid()::int pid")).rows[0].pid as number
      await staffBarrier.query("select pg_advisory_xact_lock(hashtext('b22-seller-open-pause'),hashtext($1))",[ownerStoreId])
      // Creating the independent PG16 barrier can leave this authenticated
      // Chrome tab in the background. Restore the real tab (never override
      // document.hidden or workspace.hidden), then require the actual
      // authorized Store action to be visible before dispatching its click.
      await reviewer.send("Page.bringToFront")
      // A hidden tab clears its private workspace. Restore only through a
      // real authenticated page reload, never by changing DOM hidden flags.
      if(await reviewer.eval("document.getElementById('workspace').hidden")){
        await reviewer.send("Page.reload",{ignoreCache:true})
        await reviewer.send("Page.bringToFront")
      }
      try{
        await reviewer.wait("document.visibilityState==='visible' && !document.getElementById('workspace').hidden && !!document.querySelector('#store-approval-list button')?.getClientRects().length")
      }catch{
        const state=await reviewer.eval("({documentHidden:document.hidden,workspaceHidden:document.getElementById('workspace').hidden,loginHidden:document.getElementById('login').hidden,panelHidden:document.getElementById('store-approval-panel').hidden,visibleButton:!!document.querySelector('#store-approval-list button')?.getClientRects().length})")
        const http=reviewer.http.filter((h:any)=>
          ['/personal','/personal/session','/personal/platform/stores'].includes(h.path))
          .slice(-10).map((h:any)=>({path:h.path,status:h.status}))
        throw Error("B22 Staff Store approval UI restore failed: "+
          JSON.stringify({state,http}))
      }
      await reviewer.click("#store-approval-list button")
      await until(async()=>{
        const [w]=await q("select count(*)::int n from pg_locks h join pg_locks w on w.locktype=h.locktype and w.database=h.database and w.classid=h.classid and w.objid=h.objid and w.objsubid=h.objsubid and w.pid<>h.pid and w.granted=false where h.locktype='advisory' and h.pid=$1 and h.granted=true",[holderPid])
        return w.n===1
      },19000,"Actual Mercur Seller UPDATE waits on independent PG16 barrier")
      assert.equal(reviewer.http.filter(
        (x:any)=>x.path==="/personal/platform/stores"&&x.method==="POST").length,
        beforeStoreApprovals,"Staff approval HTTP has not returned before native write")
      const revokePending=staffRevoker.query(
        "update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1 and revoked_at is null returning revoked_at",
        [grantId]).then((v:any)=>{staffRevokeDone=true;return v},
          (e:unknown)=>{staffRevokeDone=true;throw e})
      await until(async()=>{
        const [w]=await q("select count(*)::int n from pg_locks where pid=$1 and granted=false and locktype='transactionid'",[revokePid])
        return w.n>=1
      },19000,"Real PG16 Staff grant revoke waits on approval's locked grant row")
      assert.equal(staffRevokeDone,false,"Permission revoke cannot commit before approved Store write finishes")
      // The approved company policy must serialize against the REAL native
      // Mercur Seller approval, not only a synthetic SELECT or a revoked grant.
      // Seller's task-only UPDATE is still blocked by our advisory barrier;
      // approval holds the canonical Organization row FOR SHARE in its
      // Foundation transaction until native workflow + readback complete.
      // The approval's Staff session locks its own Person/session epoch.
      // A second request using that same Person would wait on an unrelated
      // session row and could give false race evidence. Give the OTHER actual
      // signed-in Person A an explicitly scoped, synthetic platform task
      // grant for this one test, then revoke that grant in finally.
      const policyCollisionGrantId="da_staff_policy_race_"+rand
      await q(`insert into da_platform_staff_grant
        (id,person_id,task,resource,granted_by_person_id,reason)
        values($1,$2,'store.application.policy.manage','platform',$2,
        'B22 task-only independent platform policy race')`,
        [policyCollisionGrantId,A.person])
      const policyCollisionReason="B22 concurrent native approval policy pause"
      const beforePolicyCollision=await q(`select count(*)::int n from
        da_audit_event where organization_id=$1 and
        action='organization.store_application_right_disabled'
        and new_values->>'reason'=$2`,[organizations[0].id,policyCollisionReason])
      assert.equal(beforePolicyCollision[0].n,0)
      companyPolicySwitch=companyRight(false,true,policyCollisionReason,
        true,organizations[0].id,browser).then(
        value=>{companyPolicySwitchDone=true;return {value}},
        error=>{companyPolicySwitchDone=true;return {error:String(error)}})
      await until(async()=>{
        // The policy request must reach the real PostgreSQL FOR UPDATE and
        // WAIT for the approval transaction's Organization SHARE row lock.
        const [w]=await q(`select count(*)::int n from pg_stat_activity
          where datname=current_database() and wait_event_type='Lock'
            and query ilike '%store_application_enabled%'
            and query ilike '%da_organization%'
            and query ilike '%for update%'`)
        return w.n>=1
      },19000,"Policy disable waits on native Seller approval Organization lock")
      assert.equal(companyPolicySwitchDone,false,"Company cannot close before native approval commits")
      assert.deepEqual(await q("select store_application_enabled from da_organization where id=$1",
        [organizations[0].id]),[{store_application_enabled:true}],
        "The uncommitted platform pause must not be visible to other readers")
      assert.equal((await q(`select count(*)::int n from da_audit_event
        where organization_id=$1 and action='organization.store_application_right_disabled'
        and new_values->>'reason'=$2`,[organizations[0].id,policyCollisionReason]))[0].n,0,
        "No policy audit/outbox before the canonical company row lock is acquired")
      assert.equal((await q("select count(*)::int n from da_platform_staff_grant where id=$1 and revoked_at is null",[grantId]))[0].n,1)
      assert.equal((await native.listSellers({id:ownerStoreId}))[0].status,"pending_approval",
        "The uncommitted native Seller UPDATE is not visible to outside readers")
      await staffBarrier.query("ROLLBACK")
      staffBarrierHeld=false
      await until(async()=>{
        const http=reviewer.http.filter(
          (x:any)=>x.path==="/personal/platform/stores"&&x.method==="POST")
        const rows=await native.listSellers({id:ownerStoreId})
        return http.length===beforeStoreApprovals+1&&http[http.length-1].status===200&&
          rows.length===1&&rows[0].status==="open"&&!!rows[0].approved_at
      },19000,"Real Chrome Staff approval HTTP200 with committed native Seller open")
      const blockedPolicyResult=await companyPolicySwitch
      assert.equal(blockedPolicyResult?.value?.status,200,
        blockedPolicyResult?.error||"Policy pause must commit only after native approval")
      assert.deepEqual(await q("select store_application_enabled from da_organization where id=$1",
        [organizations[0].id]),[{store_application_enabled:false}],
        "A committed policy pause prevents later new Store actions")
      assert.equal((await native.listSellers({id:ownerStoreId}))[0].status,"open",
        "Native approval committed before policy pause; existing Seller stays open")
      const policyCollisionAudit=await q(`select e.id,x.id as outbox_id from da_audit_event e
        join da_audit_outbox x on x.source_audit_event_id=e.id
        where e.organization_id=$1 and e.action='organization.store_application_right_disabled'
          and e.new_values->>'reason'=$2`,[organizations[0].id,policyCollisionReason])
      assert.equal(policyCollisionAudit.length,1,"Exactly one canonical pause audit/outbox after racing approval")
      const policyCollisionReceipts=await q(`select n.person_id from da_notification_receipt n
        where n.audit_event_id=$1`,[policyCollisionAudit[0].id])
      assert.deepEqual(policyCollisionReceipts,[{person_id:A.person}],
        "Only the remaining current protected Owner gets the private race notice")
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const blockedSubsequent=await browser.callFunction(
        "async function(org,id){const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/store-applications',{method:'POST',headers:{"+
        "'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify({organization_id:org,application_id:id,"+
        "name:'B22 concurrent pause post check',"+
        "email:'b22-after-policy-pause@example.invalid',currency_code:'try'})});"+
        "return r.status;}",organizations[0].id,"daapp_"+randomBytes(16).toString("hex"))
      assert.equal(blockedSubsequent,403,
        "New Owner submission must fail after the concurrent pause commits")
      assert.equal((await companyRight(true,false,"B22 post race company resume",
        true,organizations[0].id,browser)).status,200)
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      assert.deepEqual(await q("select store_application_enabled from da_organization where id=$1",
        [organizations[0].id]),[{store_application_enabled:true}],
        "Restore the test-only company policy without changing Seller history")
      const revoked=await revokePending
      assert.equal(revoked.rows.length,1)
      assert.ok(revoked.rows[0].revoked_at)
      assert.equal((await q("select count(*)::int n from da_platform_staff_grant where id=$1 and revoked_at is not null",[grantId]))[0].n,1)
      assert.equal(await reviewer.eval("(async()=> (await fetch('/personal/platform/stores')).status)()"),403,
        "Current platform Staff revoke must deny all subsequent Store approvals")
      assert.equal((await q("select count(*)::int n from da_store_application where id=$1 and seller_id=$2 and status='created'",[applicationId,ownerStoreId]))[0].n,1)
      assert.equal((await q("select count(*)::int n from da_organization_seller_ownership where organization_id=$1 and seller_id=$2 and revoked_at is null",[organizations[0].id,ownerStoreId]))[0].n,1)
      process.stdout.write("PASS B22 Chrome/HTTP/PG16: native Mercur Seller approval holds company policy SHARE lock, concurrent platform disable waits then commits, one audit/outbox and current Owner notice; post-disable Owner application403; existing Store open; policy reopened\n")
      process.stdout.write("PASS B22 Chrome: Staff grant revoke waits during real native Seller approval; HTTP200 and Seller open before revoke commit, later Staff HTTP403; authoritative origin retained\n")
    }finally{
      if(staffBarrierHeld)await staffBarrier.query("ROLLBACK")
      if(companyPolicySwitch)await Promise.allSettled([companyPolicySwitch])
      await q("update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1",
        ["da_staff_policy_race_"+rand])
      await staffRevoker.end()
      await staffBarrier.end()
      if(sellerPauseTrigger)await q("drop trigger if exists b22_staff_native_seller_pause_v1 on seller")
      if(sellerPauseFn)await q("drop function if exists b22_staff_native_seller_pause_v1()")
      // Restore only this task-created grant to preserve the remaining
      // B22 UI tests; the existing final revoke test still runs below.
      await q("update da_platform_staff_grant set revoked_at=null where id=$1",[grantId])
      await reviewer.send("Page.bringToFront")
    }
    // Verify the real browser network action AND native committed Seller state.
    // A temporary status message is not a durable success contract: the
    // privacy epoch may conceal an inactive browser while the POST completes.
    await until(async()=>{
      const http=reviewer.http.filter((x:any)=>x.path==="/personal/platform/stores"&&x.method==="POST")
      const current=await native.listSellers({id:ownerStoreId})
      return http.some((x:any)=>x.status===200)&&current.length===1&&
        current[0].status==="open"&&!!current[0].approved_at
    },19000,"B22 reviewer HTTP200 and native approval")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("!document.getElementById('workspace').hidden")
    await reviewer.wait("!document.getElementById('store-approval-panel').hidden")
    // Owner Store was approved, but the 31 historical Origin rows still
    // exist on older pages. Empty CURRENT page must offer older navigation,
    // not falsely imply the whole review backlog is empty.
    await reviewer.wait("document.querySelectorAll('#store-approval-list button').length===0 && document.getElementById('store-approval-status').textContent.includes('önceki başvurulara bakın.') && !document.getElementById('store-approval-older').hidden")
    assert.equal(await reviewer.eval("document.querySelectorAll('#store-approval-list button').length"),0,
      "Approved Store must disappear from the reviewer pending list on reload")
    const afterReview=await native.listSellers({id:ownerStoreId})
    assert.equal(afterReview.length,1)
    assert.equal(afterReview[0].status,"open")
    assert.ok(afterReview[0].approved_at)

    // Store draft delegation uses a real Owner browser and a distinct
    // real Member browser against the SAME disposable HTTPS/PG16 state.
    // A's historical Beta Admin role is temporarily an ordinary Member in
    // this synthetic fixture only; restore it after the narrow acceptance.
    const betaScope=organizations[1].id
    // Synthetic legacy Member originally lacked a human-readable Person
    // label. The Owner may grant only to an identifiable company employee.
    await q("update da_person set display_name=$1 where id=$2",
      ["B22 Yetkili Test Çalışanı",A.person])
    const [legacyBeta]=await q(`select role,protected_owner from da_organization_membership
      where id=$1`,[betaAdminMembership.id])
    assert.deepEqual(legacyBeta,{role:"admin",protected_owner:false})
    const [memberFixture]=await q(`update da_organization_membership
      set role='member',updated_at=clock_timestamp()
      where id=$1 and role='admin' and protected_owner=false
      returning id`,[betaAdminMembership.id])
    assert.equal(memberFixture?.id,betaAdminMembership.id)
    try{
      await browser.send("Page.bringToFront")
      // The real signed-in browser populated its Organization menu before
      // this disposable membership changed. Reload to observe fresh role
      // metadata instead of asking a stale menu to contain "Member".
      await browser.send("Page.reload",{ignoreCache:true})
      await browser.wait("Array.from(document.querySelectorAll('#organizations button')).some(b=>b.textContent==="+
        JSON.stringify(organizations[1].name+" — member")+")")
      await browser.select(organizations[1].name,"member")
      assert.equal(await browser.callFunction("async function(org){return (await fetch('/personal/store-applications?organization_id='+encodeURIComponent(org))).status}",betaScope),403,
        "An ungranted Member cannot read another private Organization draft")
      await reviewer.send("Page.bringToFront")
      await reviewer.select(organizations[1].name,"owner")
      const grantScope=await reviewer.callFunction(
        "async function(org){const r=await fetch('/personal/store-draft-permissions?organization_id='+encodeURIComponent(org));"+
        "const body=await r.json();return {status:r.status,memberCount:Array.isArray(body.members)?body.members.length:-1,"+
        "grantCount:Array.isArray(body.grants)?body.grants.length:-1}}",
        betaScope)
      assert.deepEqual(grantScope,{status:200,memberCount:1,grantCount:0},
        "Owner native Store draft grant API must return exactly one active Member")
      await reviewer.wait("!document.getElementById('store-draft-grants-panel').hidden")
      assert.equal(await reviewer.eval("document.querySelector('#store-draft-grants-form select[name=membership_id]').value"),
        betaAdminMembership.id)
      assert.equal(await reviewer.callFunction("async function(org,id){const s=await(await fetch('/personal/session')).json();const r=await fetch('/personal/store-draft-permissions',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'invalid'},body:JSON.stringify({action:'grant',organization_id:org,membership_id:id})});return r.status}",betaScope,betaAdminMembership.id),403,
        "A missing valid CSRF cannot issue draft permission")
      const beforeGrantUi=await reviewer.eval("({hidden:document.hidden,workspaceHidden:document.getElementById('workspace').hidden,formReady:typeof document.getElementById('store-draft-grants-form').onsubmit==='function',buttonDisabled:document.querySelector('#store-draft-grants-form button[value=grant]').disabled})")
      assert.deepEqual(beforeGrantUi,{hidden:false,workspaceHidden:false,formReady:true,buttonDisabled:false},
        "Visible Owner must have an enabled, wired draft grant control")
      await reviewer.eval("(()=>{const prior=window.fetch.bind(window);window.__daGrantProbe={starts:0,done:0,status:null};window.__daGrantPriorFetch=window.fetch;window.fetch=(resource,options)=>{const url=typeof resource==='string'?resource:resource?.url;if(url==='/personal/store-draft-permissions'&&options?.method==='POST'){window.__daGrantProbe.starts++;return prior(resource,options).then(response=>{window.__daGrantProbe.done++;window.__daGrantProbe.status=response.status;return response})}return prior(resource,options)};return true})()")
      await reviewer.click("#store-draft-grants-form button[value=grant]")
      const grantProbe=await reviewer.eval("({starts:window.__daGrantProbe.starts,done:window.__daGrantProbe.done,status:window.__daGrantProbe.status})")
      assert.equal(grantProbe.starts,1,
        "Visible Owner grant submit must dispatch exactly one real HTTPS POST")
      await reviewer.wait("window.__daGrantProbe.done===1")
      const grantFeedback=String(await reviewer.eval("document.getElementById('store-draft-grants-status').textContent"))
      const grantHttpStatus=Number(await reviewer.eval("window.__daGrantProbe.status"))
      await reviewer.eval("(()=>{window.fetch=window.__daGrantPriorFetch;delete window.__daGrantPriorFetch;delete window.__daGrantProbe;return true})()")
      assert.equal(grantHttpStatus,200,"Native Owner grant POST status; UI="+grantFeedback)
      assert.ok(grantFeedback.includes('izni verildi'),
        "Owner draft grant outcome must be confirmed: "+grantFeedback)
      const [activeGrant]=await q(`select id,membership_id,revoked_at from da_organization_store_draft_permission
        where person_id=$1 and organization_id=$2 and revoked_at is null`,[A.person,betaScope])
      assert.ok(activeGrant&&/^dasdpg_[A-Za-z0-9_-]+$/.test(activeGrant.id))
      assert.equal(activeGrant.membership_id,betaAdminMembership.id)
      assert.equal(activeGrant.revoked_at,null)
      await browser.send("Page.bringToFront")
      await browser.select(organizations[1].name,"member")
      await browser.wait("!document.getElementById('store-draft-form').hidden")
      assert.equal(await browser.eval("document.getElementById('store-application-form').hidden"),true,
        "An authorized Member gets ONLY the draft form, never official submit")
      assert.equal(await browser.callFunction("async function(org){return (await fetch('/personal/store-draft-permissions?organization_id='+encodeURIComponent(org))).status}",betaScope),403,
        "A delegated Member cannot inspect Owner-only grant management")
      const memberAttempt=await browser.callFunction(
        "async function(org,id){const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/store-draft-permissions',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify({action:'grant',organization_id:org,membership_id:id})});return r.status}",
        betaScope,betaAdminMembership.id)
      assert.equal(memberAttempt,403,"A Member cannot delegate this permission")
      const forgedStoreId="daapp_"+randomBytes(16).toString("hex")
      const forgedOfficial=await browser.callFunction(
        "async function(org,id){const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/store-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify({organization_id:org,application_id:id,name:'Forged Member Store',"+
        "email:'member-forged@example.invalid',currency_code:'try'})});return r.status}",
        betaScope,forgedStoreId)
      assert.equal(forgedOfficial,403,"Member draft permission cannot submit native Seller")
      const delegatedName="B22 delegate "+rand
      const delegatedEmail="delegated-"+rand+"@example.invalid"
      await browser.input("#store-draft-form input[name=name]",delegatedName)
      await browser.input("#store-draft-form input[name=email]",delegatedEmail)
      await browser.click("#store-draft-form button[type=submit]")
      await browser.wait("document.getElementById('store-application-status').textContent.includes('Taslak kaydedildi')")
      const [delegatedDraft]=await q(`select id,version,created_by_person_id,
        updated_by_person_id,name from da_store_application_draft
        where organization_id=$1 and name=$2`,[betaScope,delegatedName])
      assert.equal(delegatedDraft.version,1)
      assert.equal(delegatedDraft.created_by_person_id,A.person)
      assert.equal(delegatedDraft.updated_by_person_id,A.person)
      assert.equal((await q(`select count(*)::int n from da_audit_event e
        join da_audit_outbox x on x.source_audit_event_id=e.id
        where e.target_id=$1 and e.action='organization.store_application_draft_saved'
          and e.role_context='member'`,[delegatedDraft.id]))[0].n,1,
        "Exactly one auditable delegated Member draft creation")
      const memberNotices=await browser.callFunction(
        "async function(org){const r=await fetch('/personal/notifications?organization='+encodeURIComponent(org));"+
        "return {status:r.status,body:await r.json()}}",betaScope)
      assert.equal(memberNotices.status,200)
      assert.ok(memberNotices.body.notifications.some((n:any)=>
        n.title==='Mağaza taslağı hazırlama izni verildi'))
      // P2: preserve a genuinely indistinguishable employee, not just the
      // same name: copy the original synthetic Member's visible contact too.
      // With different phones the Owner must instead be able to pick one.
      const [originalContact]=await q(
        "select mobile_phone from da_person where id=$1",[A.person])
      const [lateTwin]=await foundation.createPeople([{
        display_name:"B22 Yetkili Test Çalışanı",
        ...(typeof originalContact?.mobile_phone==="string"?
          {mobile_phone:originalContact.mobile_phone}:{})
      }])
      const [lateTwinMembership]=await foundation.createMemberships([{
        organization_id:betaScope,person_id:lateTwin.id,
        role:"member",status:"active",protected_owner:false
      }])
      assert.ok(lateTwinMembership.id!==betaAdminMembership.id)
      await reviewer.send("Page.bringToFront")
      await reviewer.select(organizations[1].name,"owner")
      await reviewer.wait("document.getElementById('store-application-list').textContent.includes("+
        JSON.stringify(delegatedName)+")")
      // Organization selection resolves before its separate protected grant
      // list finishes loading. Wait for the real panel, not just the role.
      await reviewer.wait("!document.getElementById('store-draft-grants-panel').hidden")
      await reviewer.click("#store-draft-grants-refresh")
      await reviewer.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
        "document.querySelector('#store-draft-grants-form select[name=membership_id]').options.length===2")
      const optionsAfterCollision=await reviewer.eval(
        "Array.from(document.querySelector('#store-draft-grants-form select[name=membership_id]').options,"+
        "o=>({value:o.value,disabled:o.disabled,text:o.textContent}))")
      assert.equal(optionsAfterCollision.find((o:any)=>
        o.value===betaAdminMembership.id)?.disabled,false,
        "Existing active grant remains selectable only for revocation")
      assert.equal(optionsAfterCollision.find((o:any)=>
        o.value===lateTwinMembership.id)?.disabled,true,
        "New indistinguishable Member cannot receive a grant")
      assert.ok(optionsAfterCollision.every((o:any)=>
        !o.text.includes("daprs_")&&!o.text.includes("daomem_")),
        "Never show technical IDs to distinguish employees")
      await reviewer.eval("(()=>{const s=document.querySelector('#store-draft-grants-form select[name=membership_id]');"+
        "s.value="+JSON.stringify(betaAdminMembership.id)+";"+
        "s.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
      await reviewer.wait("document.querySelector('#store-draft-grants-form button[value=grant]').disabled && "+
        "!document.querySelector('#store-draft-grants-form button[value=revoke]').disabled")
      const postCount=reviewer.http.filter((h:any)=>
        h.path==="/personal/store-draft-permissions"&&h.method==="POST").length
      await reviewer.click("#store-draft-grants-form button[value=grant]")
      assert.equal(reviewer.http.filter((h:any)=>
        h.path==="/personal/store-draft-permissions"&&h.method==="POST").length,
        postCount,"Ambiguous new grant must not dispatch an HTTP request")
      assert.equal((await q(`select count(*)::int n
        from da_organization_store_draft_permission
        where person_id=$1 and organization_id=$2 and revoked_at is null`,
        [A.person,betaScope]))[0].n,1,
        "Original grant survives the name collision until revoked")
      assert.equal((await q(`select count(*)::int n
        from da_organization_store_draft_permission
        where person_id=$1 and organization_id=$2`,
        [lateTwin.id,betaScope]))[0].n,0,
        "Late identical-name Member must never receive a grant")
      await reviewer.click("#store-draft-grants-form button[value=revoke]")
      await reviewer.wait("document.getElementById('store-draft-grants-status').textContent.includes('izni kaldırıldı')")
      assert.equal((await q(`select count(*)::int n from da_organization_store_draft_permission
        where id=$1 and revoked_at is not null`,[activeGrant.id]))[0].n,1)
      const lateTwinAudits=await q(`select e.action,x.id as outbox_id
        from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
        where e.organization_id=$1 and e.target_id=$2
          and e.resource='store-draft-permission'
        order by e.action`,[betaScope,A.person])
      assert.deepEqual(lateTwinAudits.map((e:any)=>e.action),[
        "organization.store_draft_permission_granted",
        "organization.store_draft_permission_revoked"
      ],"One canonical grant and revoke outbox after same-name late joiner")
      assert.equal((await q(`select count(*)::int n from da_audit_event e
        join da_audit_outbox x on x.source_audit_event_id=e.id
        where e.organization_id=$1 and e.target_id=$2
          and e.resource='store-draft-permission'`,
        [betaScope,lateTwin.id]))[0].n,0,
        "Late identical-name Member has zero grant/revoke audit/outbox")
      await browser.send("Page.bringToFront")
      await browser.select(organizations[1].name,"member")
      assert.equal(await browser.callFunction(
        "async function(org){return (await fetch('/personal/store-applications?organization_id='+encodeURIComponent(org))).status}",betaScope),403)
      const deniedAfterRevoke=await browser.callFunction(
        "async function(org,id){const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/store-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify({action:'save_draft',organization_id:org,draft_id:id,expected_version:1,"+
        "name:'Unauthorized edit',email:'revoke@example.invalid',currency_code:'try'})});return r.status}",
        betaScope,delegatedDraft.id)
      assert.equal(deniedAfterRevoke,403,"Revocation blocks stale HTTP draft writer")
      assert.deepEqual(await q(`select name,version from da_store_application_draft where id=$1`,
        [delegatedDraft.id]),[{name:delegatedName,version:1}],
        "Revocation must retain unchanged Organization draft")
      const revokedNotice=await browser.callFunction(
        "async function(org){const r=await fetch('/personal/notifications?organization='+encodeURIComponent(org));"+
        "return {status:r.status,body:await r.json()}}",betaScope)
      assert.equal(revokedNotice.status,200)
      assert.ok(revokedNotice.body.notifications.some((n:any)=>
        n.title==='Mağaza taslağı hazırlama izni kaldırıldı'))
      assert.equal((await q(`select count(*)::int n from da_store_application where organization_id=$1`,
        [betaScope]))[0].n,0,
        "Owner grants and Member draft edits must never create native Seller")
      process.stdout.write("PASS B22 Chrome: Owner grants and revokes private Member Store draft access; separate signed-in Member saves durable Organization draft, cannot submit/grant, revocation blocks stale GET/POST, audit/outbox/notifications retained, zero Seller\n")
    }finally{
      // Restore only this synthetic legacy role fixture; no protected Owner,
      // Store, or production membership is modified by the test.
      await q(`update da_organization_membership set role='admin',
        updated_at=clock_timestamp() where id=$1 and role='member' and protected_owner=false`,
        [betaAdminMembership.id])
      await browser.send("Page.bringToFront")
      await browser.select(organizations[0].name,"owner")
    }

    // P2 regression: 101 real synthetic active Members in one disposable
    // Organization. Owner must page every Member without leaking other
    // Organizations, granting Seller rights or bypassing live authorization.
    const [largeMemberOrg]=await foundation.createOrganizations([{
      name:"B22 Member pages "+rand,status:"active"
    }])
    const syntheticPeople=await foundation.createPeople(
      Array.from({length:101},(_,index)=>({
        display_name:index===0?null:
          "B22 Sentetik Çalışan "+String(index+1).padStart(3,"0")
      })))
    assert.equal(syntheticPeople.length,101)
    const largeMemberships=await foundation.createMemberships([
      {organization_id:largeMemberOrg.id,person_id:A.person,role:"owner",
       status:"active",protected_owner:true},
      ...syntheticPeople.map(person=>({
        organization_id:largeMemberOrg.id,person_id:person.id,
        role:"member",status:"active",protected_owner:false
      }))
    ])
    assert.equal(largeMemberships.length,102)
    const orderedMembers=await q(`select id,person_id
      from da_organization_membership where organization_id=$1
        and role='member' and status='active' order by id`,[largeMemberOrg.id])
    assert.equal(orderedMembers.length,101)
    const lastMember=orderedMembers[100]
    // Modern registration has a phone. These synthetic membership fixtures
    // deliberately bypassed that route, so equip eligible employees with
    // distinct recorded phones while retaining three legacy no-contact cases.
    const legacyNoContact=orderedMembers[2]
    for(let i=0;i<orderedMembers.length;i++){
      if([0,2,90].includes(i))continue
      await q("update da_person set mobile_phone=$1,mobile_version=1 where id=$2",
        ["+905551"+String(i+1).padStart(6,"0"),orderedMembers[i].person_id])
    }
    // P2: two active Members on DIFFERENT 30-row pages have identical
    // names and no accepted invitation email. Neither may be grantable.
    const nameTwins=[orderedMembers[0],orderedMembers[90]]
    await q("update da_person set display_name=$1 where id=any($2::text[])",
      ["B22 Aynı İsimli Çalışan",nameTwins.map(m=>m.person_id)])
    // A matching name in an unrelated Organization MUST NOT affect this
    // company's unambiguous last Member; synthetic data only.
    const [unrelatedOrg]=await foundation.createOrganizations([{
      name:"B22 Unrelated Member names "+rand,status:"active"
    }])
    const [unrelatedPerson]=await foundation.createPeople([{
      display_name:"B22 Son Sayfa Çalışanı"
    }])
    await foundation.createMemberships([{
      organization_id:unrelatedOrg.id,person_id:unrelatedPerson.id,
      role:"member",status:"active",protected_owner:false
    }])
    // Keep a checkable display label on the exact last Member even when
    // generated membership IDs sort in a different order from creation.
    await q("update da_person set display_name=$1 where id=$2",
      ["B22 Son Sayfa Çalışanı",lastMember.person_id])
    await browser.send("Page.bringToFront")
    await browser.send("Page.reload",{ignoreCache:true})
    await browser.wait("Array.from(document.querySelectorAll('#organizations button')).some(b=>b.textContent==="+
      JSON.stringify(largeMemberOrg.name+" — owner")+")")
    await browser.select(largeMemberOrg.name,"owner")
    const pages=await browser.callFunction(
      "async function(org){let after='',out=[];for(let i=0;i<5;i++){"+
      "const r=await fetch('/personal/store-draft-permissions?organization_id='+"+
      "encodeURIComponent(org)+(after?'&after='+encodeURIComponent(after):''));"+
      "const d=await r.json();out.push({status:r.status,count:d.members?.length,"+
      "grantCount:d.grants?.length,more:d.has_more,cursor:!!d.next_cursor,"+
      "ambiguous:d.members?.filter(m=>!m.label_unique_in_organization).length,"+
      "lastUnique:d.members?.find(m=>m.member_name==='B22 Son Sayfa Çalışanı')?.label_unique_in_organization??null});"+
      "if(!d.has_more)break;after=d.next_cursor;}return out}",largeMemberOrg.id)
    assert.deepEqual(pages,[
      {status:200,count:30,grantCount:0,more:true,cursor:true,ambiguous:1,lastUnique:null},
      {status:200,count:30,grantCount:0,more:true,cursor:true,ambiguous:0,lastUnique:null},
      {status:200,count:30,grantCount:0,more:true,cursor:true,ambiguous:0,lastUnique:null},
      {status:200,count:11,grantCount:0,more:false,cursor:false,ambiguous:1,lastUnique:true}
    ],"101 Members: cross-page name twins ambiguous, foreign Company ignored, last unique")
    // Unique name is NOT sufficient for a new grant when this older
    // Member has neither phone nor accepted company invitation email.
    const emptyLegacySelection=await browser.callFunction(
      "async function(org,id){const r=await fetch('/personal/store-draft-permissions?organization_id='+"+
      "encodeURIComponent(org));const d=await r.json();"+
      "const member=d.members.find(m=>m.membership_id===id);"+
      "return {status:r.status,phone:member?.mobile_phone,email:member?.invitation_email,"+
      "name:member?.member_name,unique:member?.label_unique_in_organization}}",
      largeMemberOrg.id,legacyNoContact.id)
    assert.equal(emptyLegacySelection.status,200)
    assert.equal(emptyLegacySelection.phone,null)
    assert.equal(emptyLegacySelection.email,null)
    assert.equal(emptyLegacySelection.unique,true,
      "Unique name alone is not adequate proof of intended grant target")
    const missingContactPost=await browser.callFunction(
      "async function(org,id){const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/store-draft-permissions',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({action:'grant',organization_id:org,membership_id:id})});return r.status}",
      largeMemberOrg.id,legacyNoContact.id)
    assert.equal(missingContactPost,403,
      "Forged direct Owner POST must deny otherwise unique name with no contact")
    // A real invitation is created with a valid address, then ONLY this
    // isolated PostgreSQL fixture corrupts that historical value to "invalid@".
    // No real user, external SMTP or production record is involved.
    const legacyBadInvite=await foundation.createOrganizationInvitation({
      organization_id:largeMemberOrg.id,
      actor_person_id:A.person,actor_type:"user",actor_id:A.actor,
      email:"b22-legacy-"+rand+"@example.invalid",role:"member"
    })
    await q(`update da_organization_invitation
      set status='accepted',accepted_by_person_id=$1,
          accepted_at=clock_timestamp(),recipient_email='invalid@'
      where id=$2 and organization_id=$3`,
      [legacyNoContact.person_id,legacyBadInvite.id,largeMemberOrg.id])
    const invalidAddressList=await browser.callFunction(
      "async function(org,id){const r=await fetch('/personal/store-draft-permissions?organization_id='+"+
      "encodeURIComponent(org));const d=await r.json();"+
      "const member=d.members.find(m=>m.membership_id===id);"+
      "return {status:r.status,phone:member?.mobile_phone,email:member?.invitation_email}}",
      largeMemberOrg.id,legacyNoContact.id)
    assert.deepEqual(invalidAddressList,{status:200,phone:null,email:null},
      "Malformed accepted invitation email must not be exposed as usable contact")
    const badEmailDirectPost=await browser.callFunction(
      "async function(org,id){const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/store-draft-permissions',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({action:'grant',organization_id:org,"+
      "membership_id:id})});return r.status}",
      largeMemberOrg.id,legacyNoContact.id)
    assert.equal(badEmailDirectPost,403,
      "Owner direct grant cannot treat invalid@ as a contact")
    assert.equal((await q(`select count(*)::int n
      from da_organization_store_draft_permission
      where organization_id=$1 and person_id=$2`,
      [largeMemberOrg.id,legacyNoContact.person_id]))[0].n,0)
    assert.equal((await q(`select count(*)::int n from da_audit_event
      where organization_id=$1 and target_id=$2
        and resource='store-draft-permission'`,
      [largeMemberOrg.id,legacyNoContact.person_id]))[0].n,0,
      "Denied invalid invitation must not produce grant or audit")
    // Also reject a forged grant with a *valid-looking* but identical mobile
    // for two same-name Members. This proves the server's collision check is
    // independent of the missing-contact check and of the disabled UI.
    await q("update da_person set mobile_phone=$1 where id=any($2::text[])",
      ["+905550001777",nameTwins.map(m=>m.person_id)])
    // A truncated address and a numeric-TLD address rejected by the UI
    // must not become two distinct SQL identities (previous P2 regression).
    // Two different corrupt invited addresses are *not* two visible labels.
    // Cross-page checks and POST must normalize both to the same absent email,
    // even though raw database strings differ. Only disposable test data.
    for(let i=0;i<nameTwins.length;i++){
      const invite=await foundation.createOrganizationInvitation({
        organization_id:largeMemberOrg.id,
        actor_person_id:A.person,actor_type:"user",actor_id:A.actor,
        email:"b22-corrupt-label-"+rand+"-"+i+"@example.invalid",role:"member"
      })
      await q(`update da_organization_invitation
        set status='accepted',accepted_by_person_id=$1,accepted_at=clock_timestamp(),
            recipient_email=$2
        where id=$3 and organization_id=$4`,
        [nameTwins[i].person_id,i===0?"invalid@":"broken@host.123",invite.id,largeMemberOrg.id])
    }
    const corruptLabels=await browser.callFunction(
      "async function(org,jsonIds){const ids=JSON.parse(jsonIds);"+
      "let after='',found=[];for(let i=0;i<5;i++){"+
      "const r=await fetch('/personal/store-draft-permissions?organization_id='+"+
      "encodeURIComponent(org)+(after?'&after='+encodeURIComponent(after):''));"+
      "const data=await r.json();if(r.status!==200)throw Error('permissions GET denied');"+
      "for(const m of data.members){if(ids.includes(m.membership_id))"+
      "found.push({id:m.membership_id,email:m.invitation_email,"+
      "phone:m.mobile_phone,unique:m.label_unique_in_organization});"+
      "}if(!data.has_more)break;after=data.next_cursor;}return found}",
      largeMemberOrg.id,JSON.stringify(nameTwins.map(m=>m.id)))
    assert.equal(corruptLabels.length,2)
    assert.ok(corruptLabels.every((m:any)=>m.email===null&&
      m.phone==="+905550001777"&&m.unique===false),
      "Two malformed invites must be indistinguishable in both Owner GET and server label checks")
    const ambiguousContactPost=await browser.callFunction(
      "async function(org,id){const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/store-draft-permissions',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({action:'grant',organization_id:org,membership_id:id})});return r.status}",
      largeMemberOrg.id,nameTwins[0].id)
    assert.equal(ambiguousContactPost,403,
      "Owner direct grant must reject two visible identical name+mobile recipients")
    await q("update da_person set mobile_phone=null where id=any($1::text[])",
      [nameTwins.map(m=>m.person_id)])
    assert.equal((await q(`select count(*)::int n from da_organization_store_draft_permission
      where organization_id=$1 and person_id=$2`,
      [largeMemberOrg.id,legacyNoContact.person_id]))[0].n,0)
    assert.equal((await q(`select count(*)::int n from da_audit_event
      where organization_id=$1 and target_id=$2 and resource='store-draft-permission'`,
      [largeMemberOrg.id,legacyNoContact.person_id]))[0].n,0,
      "Denied unknown contact must leave no audit record")
    await browser.wait("!document.getElementById('store-draft-grants-panel').hidden")
    const noContactOption=await browser.eval(
      "Array.from(document.querySelector('#store-draft-grants-form select[name=membership_id]').options,"+
      "o=>({value:o.value,disabled:o.disabled}))")
    assert.equal(noContactOption.find((o:any)=>o.value===legacyNoContact.id)?.disabled,true,
      "Owner UI must also disable granting to a unique-name no-contact legacy employee")
    assert.equal(await reviewer.callFunction(
      "async function(org){return (await fetch('/personal/store-draft-permissions?organization_id='+"+
      "encodeURIComponent(org))).status}",largeMemberOrg.id),403,
      "A different Person without this Organization may not list its Members")
    assert.equal(await browser.callFunction(
      "async function(org){return (await fetch('/personal/store-draft-permissions?organization_id='+"+
      "encodeURIComponent(org)+'&after=../foreign')).status}",largeMemberOrg.id),400,
      "Forged pagination cursor must be rejected before a database read")
    const pageSizes=[30,30,30,11]
    for(let index=0;index<pageSizes.length;index++){
      await browser.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
        "document.querySelector('#store-draft-grants-form select[name=membership_id]').options.length==="+pageSizes[index])
      const nav=await browser.eval(
        "({next:!document.getElementById('store-draft-grants-older').hidden,"+
        "prev:!document.getElementById('store-draft-grants-newer').hidden})")
      const visibleMembershipLabels=await browser.eval(
        "Array.from(document.querySelector('#store-draft-grants-form select[name=membership_id]').options,"+
        "o=>({value:o.value,text:o.textContent,disabled:o.disabled}))")
      assert.ok(visibleMembershipLabels.every((o:any)=>
        !o.text.includes("daprs_")&&!o.text.includes("daomem_")),
        "Owner must not see internal Person/Membership IDs as staff names")
      if(index===0||index===3){
        const twin=index===0?nameTwins[0]:nameTwins[1]
        const option=visibleMembershipLabels.find((o:any)=>o.value===twin.id)
        assert.equal(option?.disabled,true,
          "Cross-page identical Member name with no invitation must be disabled")
        const postBefore=browser.http.filter((h:any)=>
          h.path==="/personal/store-draft-permissions"&&h.method==="POST").length
        await browser.eval("document.querySelector('#store-draft-grants-form select[name=membership_id]').value="+
          JSON.stringify(twin.id))
        await browser.click("#store-draft-grants-form button[value=grant]")
        assert.equal(browser.http.filter((h:any)=>
          h.path==="/personal/store-draft-permissions"&&h.method==="POST").length,
          postBefore,"Disabled name twin must not send any grant POST")
        assert.equal((await q(`select count(*)::int n
          from da_organization_store_draft_permission
          where organization_id=$1 and person_id=$2`,
          [largeMemberOrg.id,twin.person_id]))[0].n,0,
          "Cross-page ambiguous identity cannot gain a Store draft grant")
        assert.equal((await q(`select count(*)::int n from da_audit_event e
          join da_audit_outbox x on x.source_audit_event_id=e.id
          where e.organization_id=$1 and e.target_id=$2
            and e.resource='store-draft-permission'`,
          [largeMemberOrg.id,twin.person_id]))[0].n,0,
          "No audit/outbox must be created for an ambiguous grant")
        // The defensive submit handler may disable both form actions.
        // Recover by re-reading permissions through the real Owner UI,
        // never by overriding the disabled state in the DOM.
        await browser.click("#store-draft-grants-refresh")
        await browser.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
          "document.querySelector('#store-draft-grants-form select[name=membership_id]').options.length==="+pageSizes[index]+
          " && !document.querySelector('#store-draft-grants-form button[value=grant]').disabled")
      }
      assert.deepEqual(nav,{next:index<3,prev:index>0},
        "Visible Owner pagination controls must reflect each real page")
      if(index<3)await browser.click("#store-draft-grants-older")
    }
    const memberOnFinalPage=await browser.eval(
      "Array.from(document.querySelector('#store-draft-grants-form select[name=membership_id]').options)"+
      ".some(o=>o.value==="+JSON.stringify(lastMember.id)+")")
    assert.equal(memberOnFinalPage,true,"101st Member must be selectable in Owner UI")
    await browser.eval(
      "document.querySelector('#store-draft-grants-form select[name=membership_id]').value="+
      JSON.stringify(lastMember.id))
    assert.ok(String(await browser.eval(
      "document.querySelector('#store-draft-grants-form select[name=membership_id]').selectedOptions[0].textContent"))
      .includes("B22 Son Sayfa Çalışanı"),
      "Owner selects a named Member rather than an opaque internal code")
    // The Owner has already selected the exact Member in this Organization.
    // Their own mobile edit must NOT force reselecting or deny the grant.
    // The subsequent real POST (with a deliberately truncated browser-only
    // response) proves the grant persists for this Member, not a namesake.
    const shownPhone=(await q("select mobile_phone from da_person where id=$1",
      [lastMember.person_id]))[0].mobile_phone
    assert.equal(await browser.eval(
      "document.querySelector('#store-draft-grants-form select[name=membership_id]').selectedOptions[0].textContent.includes("+
      JSON.stringify(shownPhone)+")"),true)
    await q("update da_person set mobile_phone=$1,mobile_version=mobile_version+1 where id=$2",
      ["+905551777777",lastMember.person_id])
    assert.equal(await browser.eval(
      "document.querySelector('#store-draft-grants-form select[name=membership_id]').value"),
      lastMember.id,"Phone update must never change the selected Membership target")
    assert.equal((await q(`select count(*)::int n from da_organization_store_draft_permission
      where organization_id=$1 and person_id=$2 and revoked_at is null`,
      [largeMemberOrg.id,lastMember.person_id]))[0].n,0,
      "Phone edit alone never creates a grant")
    // The authorized POST commits, but only this browser's response body
    // is synthetically broken. The UI must say UNCERTAIN rather than DENIED.
    await browser.eval("(()=>{const original=window.fetch.bind(window);"+
      "window.__b22GrantOriginalFetch=window.fetch;"+
      "window.fetch=(resource,options)=>{const path=typeof resource==='string'?resource:resource?.url;"+
      "if(path==='/personal/store-draft-permissions'&&options?.method==='POST')"+
      "return original(resource,options).then(r=>r.status===200?"+
      "new Response('{\\\"status\\\":',{status:200,headers:{'content-type':'application/json'}}):r);"+
      "return original(resource,options)};return true})()")
    await browser.click("#store-draft-grants-form button[value=grant]")
    await until(async()=>(await q(`select count(*)::int n
      from da_organization_store_draft_permission
      where organization_id=$1 and person_id=$2 and membership_id=$3
        and revoked_at is null`,
      [largeMemberOrg.id,lastMember.person_id,lastMember.id]))[0].n===1,
      19000,"101st Member grant persists despite a mobile update after Owner selection")
    await browser.wait("document.getElementById('store-draft-grants-status').textContent.includes('sonucu belirsiz')")
    assert.equal(await browser.eval(
      "document.querySelector('#store-draft-grants-form button[value=grant]').disabled && "+
      "document.querySelector('#store-draft-grants-form button[value=revoke]').disabled"),true,
      "Truncated successful POST must leave duplicate grants/revokes disabled")
    await browser.eval("(()=>{window.fetch=window.__b22GrantOriginalFetch;delete window.__b22GrantOriginalFetch})()")
    await browser.click("#store-draft-grants-refresh")
    await browser.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
      "document.getElementById('store-draft-grants-list').textContent.includes('B22 Son Sayfa Çalışanı') && "+
      "document.getElementById('store-draft-grants-list').textContent.includes('taslak: Yetkili')")
    await browser.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
      "document.querySelector('#store-draft-grants-form button[value=revoke]').disabled===false")
    assert.equal(await browser.eval(
      "document.querySelector('#store-draft-grants-form select[name=membership_id]').value"),
      lastMember.id,"Refresh must preserve the selected Member on page four")
    await browser.click("#store-draft-grants-form button[value=revoke]")
    await until(async()=>(await q(`select count(*)::int n
      from da_organization_store_draft_permission
      where organization_id=$1 and person_id=$2 and membership_id=$3
        and revoked_at is not null`,
      [largeMemberOrg.id,lastMember.person_id,lastMember.id]))[0].n===1,
      19000,"101st Member's revocation persisted")
    const largeAudits=await q(`select e.action,x.id as outbox_id
      from da_audit_event e join da_audit_outbox x
        on x.source_audit_event_id=e.id
      where e.organization_id=$1 and e.target_id=$2
        and e.action in ('organization.store_draft_permission_granted',
                         'organization.store_draft_permission_revoked')
      order by e.action`,[largeMemberOrg.id,lastMember.person_id])
    assert.deepEqual(largeAudits.map(e=>e.action),[
      "organization.store_draft_permission_granted",
      "organization.store_draft_permission_revoked"
    ],"Owner grant and revoke from page four must each have canonical outbox")
    assert.equal((await q(`select count(*)::int n
      from da_store_application where organization_id=$1`,
      [largeMemberOrg.id]))[0].n,0,
      "Employee-list pagination must never create a native Seller")
    await browser.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
      "!document.getElementById('store-draft-grants-newer').hidden")
    await browser.click("#store-draft-grants-newer")
    await browser.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
      "document.querySelector('#store-draft-grants-form select[name=membership_id]').options.length===30")

    // P2: two different Members across page 1/page 4 each get a valid grant
    // while distinguishable, then acquire the same visible name. Neither
    // individual revoke may be offered or accepted. No silent all-revoke.
    const twoGrantedNamesakes=[orderedMembers[1],orderedMembers[91]]
    assert.equal(twoGrantedNamesakes.length,2)
    const grantBoth=await browser.callFunction(
      "async function(org,jsonIds){const ids=JSON.parse(jsonIds);"+
      "const session=await(await fetch('/personal/session')).json();"+
      "const statuses=[];for(const id of ids){const r=await fetch('/personal/store-draft-permissions',"+
      "{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({action:'grant',organization_id:org,membership_id:id})});"+
      "statuses.push(r.status)}return statuses}",largeMemberOrg.id,
      JSON.stringify(twoGrantedNamesakes.map(m=>m.id)))
    assert.deepEqual(grantBoth,[200,200],
      "Both distinct Members originally receive individually authorized grants")
    // After granting, emulate a legacy data regression where both contacts
    // become absent. Together with the same name they are truly ambiguous.
    await q("update da_person set mobile_phone=null where id=any($1::text[])",
      [twoGrantedNamesakes.map(m=>m.person_id)])
    await q("update da_person set display_name=$1 where id=any($2::text[])",
      ["B22 İki Önceden Yetkili Adaş",twoGrantedNamesakes.map(m=>m.person_id)])
    const collisionPages=await browser.callFunction(
      "async function(org,jsonIds){const ids=JSON.parse(jsonIds);"+
      "let after='',found=[],pages=[];for(let i=0;i<5;i++){"+
      "const r=await fetch('/personal/store-draft-permissions?organization_id='+"+
      "encodeURIComponent(org)+(after?'&after='+encodeURIComponent(after):''));"+
      "const data=await r.json();pages.push(r.status);"+
      "for(const m of data.members){if(ids.includes(m.membership_id))"+
      "found.push({id:m.membership_id,flag:m.other_active_grant_same_label,"+
      "unique:m.label_unique_in_organization,granted:data.grants.some(g=>g.membership_id===m.membership_id)});"+
      "}if(!data.has_more)break;after=data.next_cursor;}return {found,pages}}",
      largeMemberOrg.id,JSON.stringify(twoGrantedNamesakes.map(m=>m.id)))
    assert.deepEqual(collisionPages.pages,[200,200,200,200],
      "Owner protected GET must read all four pages after label collision")
    assert.deepEqual(collisionPages.found.map((m:any)=>[m.flag,m.unique,m.granted]),
      [[true,false,true],[true,false,true]],
      "Two active same-label grants must be marked ambiguous across all pages")
    // Navigate page 3 -> 2 -> 1, test the first Member; page 1 -> 4
    // for the other. Do not alter DOM option disabled status in tests.
    for(let i=0;i<2;i++){
      await browser.click("#store-draft-grants-newer")
      await browser.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
        "document.querySelector('#store-draft-grants-form select[name=membership_id]').options.length===30")
    }
    for(let index=0;index<4;index++){
      if(index===3){
        await browser.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
          "document.querySelector('#store-draft-grants-form select[name=membership_id]').options.length===11")
      }
      if(index===0||index===3){
        await browser.click("#store-draft-grants-refresh")
        await browser.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
          "document.querySelector('#store-draft-grants-form select[name=membership_id]').options.length==="+
          (index===3?11:30))
        const selected=index===0?twoGrantedNamesakes[0]:twoGrantedNamesakes[1]
        const decision=await browser.eval(
          "Array.from(document.querySelector('#store-draft-grants-form select[name=membership_id]').options,"+
          "o=>({value:o.value,disabled:o.disabled,text:o.textContent}))")
        const option=decision.find((o:any)=>o.value===selected.id)
        assert.equal(option?.disabled,true,
          "Wrong-person individual revoke must be disabled on every page")
        assert.ok(option.text.includes("birden fazla etkin izin"),
          "Owner must see why conflicting grants are not individually revocable")
        const before=browser.http.filter((h:any)=>
          h.path==="/personal/store-draft-permissions"&&h.method==="POST").length
        await browser.eval("(()=>{const select=document.querySelector("+
          "'#store-draft-grants-form select[name=membership_id]');"+
          "select.value="+JSON.stringify(selected.id)+";"+
          "select.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
        assert.equal(await browser.eval(
          "document.querySelector('#store-draft-grants-form button[value=revoke]').disabled"),
          true,"User cannot submit ambiguous individual revoke")
        await browser.click("#store-draft-grants-form button[value=revoke]")
        assert.equal(browser.http.filter((h:any)=>
          h.path==="/personal/store-draft-permissions"&&h.method==="POST").length,before,
          "Disabled ambiguous revoke must send zero POST requests")
      }
      if(index<3){
        await browser.click("#store-draft-grants-older")
        await browser.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
          "document.querySelector('#store-draft-grants-form select[name=membership_id]').options.length==="+
          (index===2?11:30))
      }
    }
    const deniedAmbiguous=await browser.callFunction(
      "async function(org,jsonIds){const ids=JSON.parse(jsonIds);"+
      "const session=await(await fetch('/personal/session')).json();"+
      "const result=[];for(const id of ids){const r=await fetch('/personal/store-draft-permissions',"+
      "{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({action:'revoke',organization_id:org,membership_id:id})});"+
      "result.push(r.status)}return result}",largeMemberOrg.id,
      JSON.stringify(twoGrantedNamesakes.map(m=>m.id)))
    assert.deepEqual(deniedAmbiguous,[403,403],
      "Even a direct Owner POST may not silently revoke the wrong namesake")
    const surviving=await q(`select person_id,count(*)::int n
      from da_organization_store_draft_permission
      where organization_id=$1 and person_id=any($2::text[])
        and revoked_at is null group by person_id order by person_id`,
      [largeMemberOrg.id,twoGrantedNamesakes.map(m=>m.person_id)])
    assert.equal(surviving.length,2)
    assert.ok(surviving.every((m:any)=>m.n===1),
      "Rejected ambiguous revocations must leave both original grants intact")
    const onlyGrantAudits=await q(`select e.action,count(*)::int n
      from da_audit_event e join da_audit_outbox x
        on x.source_audit_event_id=e.id
      where e.organization_id=$1 and e.target_id=any($2::text[])
        and e.resource='store-draft-permission'
      group by e.action order by e.action`,
      [largeMemberOrg.id,twoGrantedNamesakes.map(m=>m.person_id)])
    assert.deepEqual(onlyGrantAudits,[{
      action:"organization.store_draft_permission_granted",n:2
    }],"Two original grants but zero erroneous revoke audit/outbox")
    assert.equal((await q(`select count(*)::int n
      from da_store_application where organization_id=$1`,
      [largeMemberOrg.id]))[0].n,0,
      "Ambiguous permission handling must never create a Seller")

    // Real registration requires a mobile phone and invitation requires email.
    // Earlier fixtures deliberately lacked BOTH contacts; prove that an
    // existing distinct Person mobile restores a single Member's revoke,
    // without adding another table, granting anyone access, or mass-revoking.
    const employeeMobiles=["+905550010001","+905550010002"]
    for(let i=0;i<2;i++)await q(
      "update da_person set mobile_phone=$1,mobile_version=1 where id=$2",
      [employeeMobiles[i],twoGrantedNamesakes[i].person_id])
    const restoredContacts=await browser.callFunction(
      "async function(org,jsonIds){const ids=JSON.parse(jsonIds);"+
      "let after='',found=[],pages=[];for(let i=0;i<5;i++){"+
      "const r=await fetch('/personal/store-draft-permissions?organization_id='+"+
      "encodeURIComponent(org)+(after?'&after='+encodeURIComponent(after):''));"+
      "const data=await r.json();pages.push(r.status);"+
      "for(const m of data.members){if(ids.includes(m.membership_id))"+
      "found.push({id:m.membership_id,phone:m.mobile_phone,"+
      "flag:m.other_active_grant_same_label,unique:m.label_unique_in_organization,"+
      "granted:data.grants.some(g=>g.membership_id===m.membership_id)});"+
      "}if(!data.has_more)break;after=data.next_cursor;}return {found,pages}}",
      largeMemberOrg.id,JSON.stringify(twoGrantedNamesakes.map(m=>m.id)))
    assert.deepEqual(restoredContacts.pages,[200,200,200,200])
    assert.deepEqual(restoredContacts.found.map((m:any)=>
      [m.phone,m.flag,m.unique,m.granted]),[
      [employeeMobiles[0],false,true,true],
      [employeeMobiles[1],false,true,true]
    ],"Two same-name Members with distinct recorded mobile numbers are individually selectable")

    // On page four the Owner intentionally selects only the second Member.
    await browser.click("#store-draft-grants-refresh")
    await browser.wait("!document.getElementById('store-draft-grants-panel').hidden && "+
      "document.querySelector('#store-draft-grants-form select[name=membership_id]').options.length===11")
    const targetEmployee=twoGrantedNamesakes[1]
    const candidates=await browser.eval(
      "Array.from(document.querySelector('#store-draft-grants-form select[name=membership_id]').options,"+
      "o=>({value:o.value,text:o.textContent,disabled:o.disabled}))")
    const candidate=candidates.find((c:any)=>c.value===targetEmployee.id)
    assert.equal(candidate?.disabled,false,
      "The intended same-name Member is individually selectable with a different mobile")
    assert.ok(candidate?.text.includes(employeeMobiles[1]),
      "The Owner sees the intended Member's phone before the single-person revoke")
    await browser.eval("(()=>{const select=document.querySelector("+
      "'#store-draft-grants-form select[name=membership_id]');"+
      "select.value="+JSON.stringify(targetEmployee.id)+";"+
      "select.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
    await browser.wait("!document.querySelector('#store-draft-grants-form button[value=revoke]').disabled")
    await browser.click("#store-draft-grants-form button[value=revoke]")
    await until(async()=>(await q(`select count(*)::int n
      from da_organization_store_draft_permission
      where organization_id=$1 and person_id=$2 and revoked_at is not null`,
      [largeMemberOrg.id,targetEmployee.person_id]))[0].n===1,
      19000,"Only the selected same-name Member's grant is revoked")
    const finalGrants=await q(`select person_id,
      count(*) filter(where revoked_at is null)::int active,
      count(*) filter(where revoked_at is not null)::int revoked
      from da_organization_store_draft_permission
      where organization_id=$1 and person_id=any($2::text[])
      group by person_id`,
      [largeMemberOrg.id,twoGrantedNamesakes.map(m=>m.person_id)])
    assert.deepEqual(
      finalGrants.map((g:any)=>[g.person_id,g.active,g.revoked]).sort((a:any,b:any)=>a[0].localeCompare(b[0])),
      [[twoGrantedNamesakes[0].person_id,1,0],[twoGrantedNamesakes[1].person_id,0,1]]
        .sort((a:any,b:any)=>a[0].localeCompare(b[0])),
      "The other same-name Member must retain the original active grant")
    const revokeAudits=await q(`select e.target_id
      from da_audit_event e join da_audit_outbox x
        on x.source_audit_event_id=e.id
      where e.organization_id=$1 and e.action='organization.store_draft_permission_revoked'
        and e.target_id=any($2::text[])`,
      [largeMemberOrg.id,twoGrantedNamesakes.map(m=>m.person_id)])
    assert.deepEqual(revokeAudits,[{target_id:targetEmployee.person_id}],
      "Only the intended Person has a canonical revoke audit/outbox")
    assert.equal((await q("select count(*)::int n from da_store_application where organization_id=$1",
      [largeMemberOrg.id]))[0].n,0,"A contact-based revoke never starts native Seller submission")
    process.stdout.write(
      "PASS B22 Chrome: same-name active Members with distinct canonical mobiles on pages 1 and 4: Owner revokes only selected page-4 member, other grant remains; exactly one revoke audit/outbox, zero Seller\\n")

    await browser.select(organizations[0].name,"owner")
    process.stdout.write("PASS B22 Chrome: two existing active grants with identical later name across page 1 and 4: no ambiguous individual revoke UI/HTTP/audit, both grants intact, zero Seller\\n")
    process.stdout.write("PASS B22 Chrome: 101 active Members; cross-page identical no-invite names disabled, zero unauthorized grants/audit/outbox, unrelated Organization ignored; last identifiable Member grant/revoke and uncertain POST recovery, audit/outbox, foreign Person 403, invalid cursor 400, zero Seller\\n")

    // B was originally an isolated no-phone fixture. Restore a standard
    // current contact for the distinct existing Member rejoin test.
    await q("update da_person set mobile_phone=$1,mobile_version=1 where id=$2",
      ["+905551888888",B.person])
    // Distinct disposable Organization: a grant from an ended membership
    // cannot revive when the same Person rejoins; the Owner must explicitly
    // authorize the NEW membership. Preserve both source audits and history.
    const [rejoinOrg]=await foundation.createOrganizations([{
      name:"B22 Rejoin "+rand,status:"active"
    }])
    const [rejoinOwner,rejoinOld]=await foundation.createMemberships([
      {organization_id:rejoinOrg.id,person_id:A.person,role:"owner",
       status:"active",protected_owner:true},
      {organization_id:rejoinOrg.id,person_id:B.person,role:"member",
       status:"active",protected_owner:false}
    ])
    assert.ok(rejoinOwner.id&&rejoinOld.id)
    await browser.send("Page.bringToFront")
    await browser.send("Page.reload",{ignoreCache:true})
    await browser.wait("Array.from(document.querySelectorAll('#organizations button')).some(b=>b.textContent==="+
      JSON.stringify(rejoinOrg.name+" — owner")+")")
    await browser.select(rejoinOrg.name,"owner")
    const grantRejoin=async(membershipId:string)=>browser.callFunction(
      "async function(org,id){const session=await(await fetch('/personal/session')).json();"+
      "const response=await fetch('/personal/store-draft-permissions',"+
      "{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({action:'grant',organization_id:org,membership_id:id})});"+
      "return {status:response.status,body:await response.json()}}",
      rejoinOrg.id,membershipId)
    const firstRejoinGrant=await grantRejoin(rejoinOld.id)
    assert.equal(firstRejoinGrant.status,200)
    assert.equal(firstRejoinGrant.body.status,"active")
    const ended=await browser.callFunction(
      "async function(org,id){const session=await(await fetch('/personal/session')).json();"+
      "const response=await fetch('/personal/memberships',"+
      "{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({organization_id:org,membership_id:id})});"+
      "return {status:response.status,body:await response.json()}}",
      rejoinOrg.id,rejoinOld.id)
    assert.equal(ended.status,200,"Real Owner revokes the Member using existing membership API")
    const endedRows=await q(`select status,revoked_at from da_organization_membership
      where id=$1`,[rejoinOld.id])
    assert.equal(endedRows.length,1)
    assert.equal(endedRows[0].status,"revoked")
    assert.ok(endedRows[0].revoked_at)
    // An ended membership must still receive its own private revocation
    // receipt. It must NOT regain company access or expose its former name.
    const exitNoticeRecords=await q(`select n.id from da_notification_receipt n
      join da_audit_event a on a.id=n.audit_event_id
      where n.person_id=$1 and a.organization_id=$2
        and a.action='organization.store_draft_permission_revoked'
        and a.new_values->>'source'='membership_exit'`,[B.person,rejoinOrg.id])
    assert.equal(exitNoticeRecords.length,1,
      "Membership exit must persist one personal revocation receipt")
    const exitNoticeId=exitNoticeRecords[0].id
    await reviewer.send("Page.bringToFront")
    reviewer.phase="member-exit-personal-notice"
    const personalSessionAfterExit=await reviewer.callFunction(
      "async function(){return (await fetch('/personal/session')).status}")
    assert.equal(personalSessionAfterExit,200,
      "Organization membership revocation must not silently erase the Person sign-in")
    // Reload the real former Member on a stale Organization-specific URL.
    // Company authorization must still fail, but the personal bell must
    // return as an unscoped Person resource, not require the old membership.
    await reviewer.eval(`history.replaceState(null,'','/personal?organization='+encodeURIComponent(${JSON.stringify(rejoinOrg.id)}))`)
    await reviewer.send("Page.reload",{ignoreCache:true})
    try{
      await reviewer.wait("location.pathname==='/personal' && location.search==='' && !document.getElementById('notification-bell').hidden")
    }catch{
      // Diagnostic is intentionally bounded to booleans and HTTP status codes:
      // no Person, Organization identifiers, page text, tokens or credentials.
      const safeState=await reviewer.eval("({queryPresent:!!location.search,documentHidden:document.hidden,loginHidden:document.getElementById('login').hidden,workspaceHidden:document.getElementById('workspace').hidden,bellHidden:document.getElementById('notification-bell').hidden})")
      const safeHttp=reviewer.http.filter((h:any)=>
        ['/personal','/personal/session','/personal/organizations',
         '/personal/notifications','/personal/links'].includes(h.path))
        .slice(-12).map((h:any)=>({path:h.path,status:h.status}))
      throw Error("B22 member exit personal inbox UI not ready: "+
        JSON.stringify({safeState,safeHttp}))
    }
    await reviewer.click("#notification-bell")
    await reviewer.wait("document.getElementById('notification-list').textContent.includes('Mağaza taslağı hazırlama izni kaldırıldı')")
    const exitedInboxText=String(await reviewer.eval("document.getElementById('notification-list').textContent"))
    assert.equal(exitedInboxText.includes(rejoinOrg.name),false,
      "Former Member's private bell must not reveal exited Organization name")
    const exitFeed=await reviewer.callFunction(
      "async function(){const r=await fetch('/personal/notifications');return {status:r.status,body:await r.json()}}")
    assert.equal(exitFeed.status,200)
    const exitNotice=exitFeed.body.notifications.find((n:any)=>n.id===exitNoticeId)
    assert.ok(exitNotice,"Former Member must see personal exit notification")
    assert.equal(exitNotice.title,"Mağaza taslağı hazırlama izni kaldırıldı")
    assert.equal(exitNotice.context,null,
      "Former Organization identity must not cross exited membership boundary")
    assert.equal(await reviewer.callFunction(
      "async function(org){return (await fetch('/personal/notifications?organization='+encodeURIComponent(org))).status}",
      rejoinOrg.id),403,
      "Former Member must not recover scoped Organization notifications")
    await browser.send("Page.bringToFront")
    assert.equal(await browser.callFunction(
      "async function(id){const s=await(await fetch('/personal/session')).json();const r=await fetch('/personal/notifications',"+
      "{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({id})});return r.status}",exitNoticeId),403,
      "Even a protected Owner must not read another Person's private receipt")
    await reviewer.send("Page.bringToFront")
    const exitRead=await reviewer.callFunction(
      "async function(id){const s=await(await fetch('/personal/session')).json();const r=await fetch('/personal/notifications',"+
      "{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({id})});return r.status}",exitNoticeId)
    assert.equal(exitRead,200,"Recipient can mark ended-membership notice as read")
    const [exitReadRow]=await q(`select read_at from da_notification_receipt where id=$1`,[exitNoticeId])
    assert.ok(exitReadRow.read_at,"Private notification read must persist")
    await browser.send("Page.bringToFront")
    // Synthetic isolated reactivation mirrors the existing unique
    // Person/Organization membership identity. The re-acceptance workflow
    // itself is outside this focused authorization regression.
    const restored=await q(`update da_organization_membership
      set status='active',revoked_at=null,updated_at=clock_timestamp()
      where id=$1 and status='revoked' and protected_owner=false
      returning id`,[rejoinOld.id])
    assert.equal(restored.length,1)
    assert.equal((await q(`select count(*)::int n from da_organization_store_draft_permission
      where membership_id=$1 and revoked_at is null`,[rejoinOld.id]))[0].n,0,
      "An invitation restoring the same membership ID cannot revive stale draft authority")
    const secondRejoinGrant=await grantRejoin(rejoinOld.id)
    assert.equal(secondRejoinGrant.status,200,
      "Owner must explicitly grant a reactivated membership new Store draft permission")
    assert.equal(secondRejoinGrant.body.status,"active")
    assert.notEqual(secondRejoinGrant.body.grant_id,firstRejoinGrant.body.grant_id)
    const rejoinRows=await q(`select id,membership_id,revoked_at
      from da_organization_store_draft_permission
      where organization_id=$1 and person_id=$2 order by created_at,id`,
      [rejoinOrg.id,B.person])
    assert.equal(rejoinRows.length,2)
    assert.equal(rejoinRows.filter((row:any)=>row.revoked_at===null).length,1)
    assert.equal(rejoinRows.find((row:any)=>row.id===firstRejoinGrant.body.grant_id)?.revoked_at!==null,true)
    assert.equal(rejoinRows.find((row:any)=>row.id===secondRejoinGrant.body.grant_id)?.revoked_at,null)
    assert.ok(rejoinRows.every((row:any)=>row.membership_id===rejoinOld.id),
      "The canonical Organization membership ID is reused; the authority grant ID is not")
    const rejoinAudits=await q(`select e.action from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.organization_id=$1 and e.target_id=$2
      and e.resource='store-draft-permission'
      order by e.occurred_at,e.id`,[rejoinOrg.id,B.person])
    assert.deepEqual(rejoinAudits.map((row:any)=>row.action).sort(),[
      "organization.store_draft_permission_granted",
      "organization.store_draft_permission_granted",
      "organization.store_draft_permission_revoked"
    ])
    await browser.select(organizations[0].name,"owner")
    process.stdout.write("PASS B22 Chrome/PG16: revoked Member loses draft grant atomically; synthetic same-membership reactivation grants no automatic right; fresh Owner grant and canonical audit/outbox verified\n")

    // This is the very same task-created membership whose Owner authority
    // was removed above; do not create a duplicate Person/Organization row.
    const alphaMember=temporaryNotificationCoOwner
    await verifyMembershipNonDisclosure({organizationId:organizations[0].id,
      activeId:alphaMember.id,foreignId:betaAdminMembership.id,personId:B.person,
      browser:reviewer,foundation,q})
    // B22 buyer.purchase is Organization-scoped and NEVER inferred from
    // Owner/Member roles, native Customer or Store product permission.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('buyer-grants-panel').hidden")
    const buyerBefore=await get('/personal/buyer-permissions?organization_id='+organizations[0].id)
    assert.equal(buyerBefore.status,200)
    assert.deepEqual(buyerBefore.body.grants,[],"Inherent Owner authority is not an issued grant")
    // Protected Owner is allowed to purchase without any separate grant.
    const ownerBuyerContext=await get('/personal/buyer-context?organization_id='+
      encodeURIComponent(organizations[0].id))
    assert.equal(ownerBuyerContext.status,200)

    assert.equal((await q(`select count(*)::int n from da_organization_buyer_permission
      where organization_id=$1`,[organizations[0].id]))[0].n,0)
    await browser.eval(`document.querySelector('#buyer-grants-form select[name=membership_id]').value=${JSON.stringify(alphaMember.id)}`)
    await browser.click('#buyer-grants-form button[value="grant"]')
    await until(async()=>{
      const rows=await q(`select id from da_organization_buyer_permission
        where person_id=$1 and organization_id=$2 and permission='buyer.purchase'
          and revoked_at is null`,[B.person,organizations[0].id])
      return rows.length===1
    },19000,"B22 real Chrome buyer permission issued")
    const [buyerGrant]=await q(`select id,source_audit_event_id,issued_by_person_id
      from da_organization_buyer_permission where person_id=$1
        and organization_id=$2 and revoked_at is null`,
      [B.person,organizations[0].id])
    assert.equal(buyerGrant.issued_by_person_id,A.person)
    assert.match(buyerGrant.id,/^dabpg_[A-Za-z0-9_-]+$/)
    const buyerProof=await q(`select e.action,e.actor_person_id,e.organization_id,
      e.target_id,x.id as outbox_id from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.new_values->>'grant_id'=$2
        and e.new_values->>'person_id'=$3
        and e.new_values->>'permission'='buyer.purchase'`,
      [buyerGrant.source_audit_event_id,buyerGrant.id,B.person])
    assert.equal(buyerProof.length,1)
    assert.equal(buyerProof[0].action,"organization.buyer_permission_granted")
    assert.equal(buyerProof[0].actor_person_id,A.person)
    assert.equal(buyerProof[0].organization_id,organizations[0].id)
    assert.equal(buyerProof[0].target_id,B.person)
    const buyerRequest={action:"grant",organization_id:organizations[0].id,
      membership_id:alphaMember.id}
    const repeatBuyer=await browser.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/buyer-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(buyerRequest)})
      });return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(repeatBuyer.status,200)
    assert.equal(repeatBuyer.body.grant_id,buyerGrant.id)
    assert.equal((await q(`select count(*)::int n from da_organization_buyer_permission
      where person_id=$1 and organization_id=$2`,
      [B.person,organizations[0].id]))[0].n,1)
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const rejectedBuyer=await reviewer.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/buyer-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(buyerRequest)})
      });return response.status
    })()`)
    assert.equal(rejectedBuyer,403,
      "Other Org Owner / platform staff cannot issue buyer.purchase in Alpha")
    const foreignBuyer=await reviewer.eval(`(async()=>{
      const response=await fetch('/personal/buyer-permissions?organization_id=${encodeURIComponent(organizations[0].id)}')
      return response.status
    })()`)
    assert.equal(foreignBuyer,403,"Non-Owner cannot enumerate buyer grants")
    // Before secondary dual proof the Alpha buyer grant is not sufficient
    // to establish which current native Customer belongs to Person B.
    const customerContext=(org:string)=>'/personal/buyer-context?organization_id='+
      encodeURIComponent(org)+'&customer=verified'
    const unlinkedCustomer=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id))})
      return r.status
    })()`)
    assert.equal(unlinkedCustomer,403,
      "buyer.purchase must not infer Customer from email, native registration or role")
    // Real primary Chrome session + real native secondary password/TOTP
    // via the existing supported dual-proof personal account link.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    await reviewer.eval("document.querySelector('#link-account select[name=actor_type]').value='customer'")
    await reviewer.input("#link-account input[name=email]",customerEmail)
    await reviewer.input("#link-account input[name=password]",customerPassword)
    await reviewer.click("#link-account button")
    await reviewer.wait("!document.getElementById('link-confirm').hidden")
    await until(async()=>Math.floor(Date.now()/30000)>customerEnrollCounter,
      45000,"Customer TOTP challenge must not reuse enrollment window")
    await reviewer.input("#link-confirm input[name=code]",otp(customerMfa.secret))
    await reviewer.click("#link-confirm button")
    await reviewer.wait("document.getElementById('status').textContent==='Hesap bağlantısı tamamlandı'")
    const verifiedCustomerBinding=await q(`select actor_id,proof_reference
      from da_verified_actor_binding
      where person_id=$1 and actor_type='customer' and revoked_at is null`,
      [B.person])
    assert.equal(verifiedCustomerBinding.length,1)
    assert.equal(verifiedCustomerBinding[0].actor_id,nativeCustomer.id)
    assert.match(verifiedCustomerBinding[0].proof_reference,/^dual-proof:/)
    const secondaryLinks=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/links');
      const body=await r.json();
      return {status:r.status,bindings:body.bindings};
    })()`)
    assert.equal(secondaryLinks.status,200)
    assert.equal(secondaryLinks.bindings.filter((b:any)=>
      b.actor_type==='customer'&&b.actor_id===nativeCustomer.id&&
      b.is_primary===false&&b.revoked_at===null).length,1,
      "Independently linked Customer must remain a removable secondary")
    await reviewer.wait("document.querySelector('#bindings p')?.textContent.includes('Doğrulanmış ek müşteri hesabı') && document.querySelector('#bindings button')?.disabled===false")
    const readyCustomer=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id))})
      return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}
    })()`)
    assert.equal(readyCustomer.status,200)
    assert.deepEqual(readyCustomer.body,{
      organization_id:organizations[0].id,
      status:"buyer_customer_verified",checkout_ready:false
    })
    assert.match(readyCustomer.cache,/no-store/)
    // The native Cart Module only proves Customer↔Cart; the legal Buyer
    // Organization↔Cart association and per-Store blocks remain unverified.
    const buyerCart=(org:string,cart:string)=>
      customerContext(org)+'&cart_id='+encodeURIComponent(cart)
    const readNativeCart=async(url:string)=>reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(url)})
      return {status:r.status,body:await r.json()}
    })()`)
    const validCart=await readNativeCart(buyerCart(organizations[0].id,customerCart.id))
    assert.equal(validCart.status,200)
    assert.deepEqual(validCart.body,{
      organization_id:organizations[0].id,status:"native_customer_cart_verified",
      checkout_ready:false,organization_attributed:false
    })
    const foreignCartCheck=await readNativeCart(buyerCart(organizations[0].id,foreignCart.id))
    assert.equal(foreignCartCheck.status,403)
    assert.deepEqual(foreignCartCheck.body,{message:"Access denied"})
    const absentCartCheck=await readNativeCart(buyerCart(organizations[0].id,
      "cart_absent_"+rand))
    assert.equal(absentCartCheck.status,403)
    const noCustomerProof=await readNativeCart("/personal/buyer-context?organization_id="+
      encodeURIComponent(organizations[0].id)+"&cart_id="+encodeURIComponent(customerCart.id))
    assert.equal(noCustomerProof.status,400)
    const foreignOrganizationCart=await readNativeCart(
      buyerCart(sellerGamma.id,customerCart.id))
    assert.equal(foreignOrganizationCart.status,403,
      "Another Person's unrelated Organization must not inherit this Customer or purchase rights")
    assert.equal((await cartService.listCarts({
      id:customerCart.id,customer_id:nativeCustomer.id
    })).length,1,"Read-only preflight must not mutate cart")
    process.stdout.write("PASS B22 native cart ownership: real Medusa Cart belongs to verified Customer, foreign and missing carts denied, Org not attributed, no payment or checkout\\n")

    // Bind this real native Customer Cart once to legal Organization Alpha.
    // This is a Foundation audit transaction, NOT native cart metadata.
    const claimCart=async(organization_id:string,cart_id:string)=>{
      return reviewer.eval(`(async()=>{
        const s=await(await fetch('/personal/session')).json()
        const r=await fetch('/personal/buyer-context',{
          method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
          body:JSON.stringify(${JSON.stringify({action:"attribute",organization_id,cart_id})})
        })
        return {status:r.status,body:await r.json()}
      })()`)
    }
    const attributionBefore=await q(`select count(*)::int n
      from da_buyer_cart_attribution where cart_id=$1`,[customerCart.id])
    assert.equal(attributionBefore[0].n,0)
    const foreignClaim=await claimCart(organizations[0].id,foreignCart.id)
    assert.equal(foreignClaim.status,403)
    const claimed=await claimCart(organizations[0].id,customerCart.id)
    assert.equal(claimed.status,200)
    assert.deepEqual(claimed.body,{status:"attributed",
      organization_id:organizations[0].id,checkout_ready:false})
    const sameClaim=await claimCart(organizations[0].id,customerCart.id)
    assert.equal(sameClaim.status,200)
    assert.deepEqual(sameClaim.body,claimed.body)
    const [attributed]=await q(`select a.person_id,a.customer_id,a.organization_id,
      a.source_audit_event_id,e.action,e.actor_person_id,e.new_values,
      x.id as outbox_id from da_buyer_cart_attribution a
      join da_audit_event e on e.id=a.source_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where a.cart_id=$1`,[customerCart.id])
    assert.equal(attributed.person_id,B.person)
    assert.equal(attributed.customer_id,nativeCustomer.id)
    assert.equal(attributed.organization_id,organizations[0].id)
    assert.equal(attributed.actor_person_id,B.person)
    assert.equal(attributed.action,"organization.buyer_cart_attributed")
    assert.equal(attributed.new_values.cart_id,customerCart.id)
    assert.equal(attributed.new_values.customer_id,nativeCustomer.id)
    assert.equal((await q(`select count(*)::int n
      from da_buyer_cart_attribution where cart_id=$1`,[customerCart.id]))[0].n,1)
    const afterClaim=await readNativeCart(buyerCart(organizations[0].id,customerCart.id))
    assert.equal(afterClaim.status,200)
    assert.deepEqual(afterClaim.body,{organization_id:organizations[0].id,
      status:"native_customer_cart_verified",
      checkout_ready:false,organization_attributed:true})
    const otherOrgClaim=await claimCart(organizations[1].id,customerCart.id)
    assert.equal(otherOrgClaim.status,403)
    assert.equal((await q(`select count(*)::int n from da_buyer_cart_attribution
      where cart_id=$1 and organization_id=$2`,
      [customerCart.id,organizations[0].id]))[0].n,1)
    const noCsrf=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(${JSON.stringify({action:"attribute",
          organization_id:organizations[0].id,cart_id:customerCart.id})})
      });return r.status
    })()`)
    assert.equal(noCsrf,403)
    assert.equal((await cartService.listCarts({
      id:customerCart.id,customer_id:nativeCustomer.id
    })).length,1,"Attribution must not modify native Cart")
    // Real empty Cart cannot prove sellable Store coverage or buyer block.
    const inspected=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(inspected.status,200)
    assert.deepEqual(inspected.body,{
      organization_id:organizations[0].id,status:"seller_scope_empty",
      seller_count:0,seller_block_verified:false,checkout_ready:false
    })
    assert.equal((await readNativeCart(buyerCart(organizations[1].id,
      customerCart.id)+"&seller_scope=inspect")).status,403)
    assert.equal((await readNativeCart(
      "/personal/buyer-context?organization_id="+
      encodeURIComponent(organizations[0].id)+"&seller_scope=inspect")).status,400)

    // The second participating Store uses the SAME real Owner application
    // and independent platform native approval pathway, not synthetic links.
    // One Organization may own multiple individually approved Stores (#37).
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    const secondApplicationId="daapp_"+randomBytes(16).toString("hex")
    const secondApplication={
      organization_id:organizations[0].id,application_id:secondApplicationId,
      name:"B22 second Owner Store "+rand,
      email:"b22-second-owner-store-"+rand+"@example.invalid",currency_code:"try"
    }
    const secondSubmission=await submit(secondApplication)
    assert.equal(secondSubmission.status,201,
      "Second Store must use authenticated Owner application path")
    const secondOwnerStoreId=secondSubmission.body.seller_id as string
    assert.match(secondOwnerStoreId,/^sel_[A-Za-z0-9_-]+$/)
    assert.notEqual(secondOwnerStoreId,ownerStoreId)
    const preApproval=await native.listSellers({id:secondOwnerStoreId})
    assert.equal(preApproval.length,1)
    assert.equal(preApproval[0].status,"pending_approval")
    assert.equal(preApproval[0].approved_at,null)
    const secondOrigin=await q(`select o.organization_id,e.action,
      x.id as outbox_id from da_organization_seller_ownership o
      join da_audit_event e on e.id=o.verification_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where o.seller_id=$1 and o.revoked_at is null`,[secondOwnerStoreId])
    assert.equal(secondOrigin.length,1)
    assert.equal(secondOrigin[0].organization_id,organizations[0].id)
    assert.equal(secondOrigin[0].action,"organization.store_application_created")
    assert.equal((await get(selected(organizations[0].id))).body.stores
      .some((store:any)=>store.id===secondOwnerStoreId),false,
      "Pending second Store cannot be used for commerce")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const secondApproval=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          application_id:secondApplicationId,seller_id:secondOwnerStoreId
        })})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(secondApproval.status,200,
      "Only explicit platform staff can approve the second Owner Store")
    assert.equal(secondApproval.body.status,"open")
    const secondApproved=await native.listSellers({id:secondOwnerStoreId})
    assert.equal(secondApproved.length,1)
    assert.equal(secondApproved[0].status,"open")
    assert.ok(secondApproved[0].approved_at)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    assert.deepEqual(new Set((await get(selected(organizations[0].id)))
      .body.stores.map((store:any)=>store.id)),
      new Set([ownerStoreId,secondOwnerStoreId]),
      "Both platform-linked native approved Stores belong to Alpha only")
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores,[])
    process.stdout.write("PASS B22 second Owner Store: real application and separate platform approval, two audited Org→Store links, native pending denied then approved; no automatic permission\\n")

    // Positive REAL native multi-Store Cart, no synthetic Graph mocks:
    // Medusa published master variant, Mercur's per-Seller Offer workflow,
    // and Medusa's native addToCartWorkflow with Mercur's Offer hooks.
    // All resources exist solely in this guarded disposable PG16 CI database.
    // Mercur 2.4.0 needs explicit Seller–Region assignments. These
    // resources are created only inside the disposable B22 PG16 fixture.
    const regions=container.resolve("region")
    const region=await regions.createRegions({
      name:"B22 two-Store region "+rand,currency_code:"eur",countries:[]
    })
    const {result:[b22Profile]}=await createShippingProfilesWorkflow(container).run({
      input:{data:[{name:"B22 two-Store Offer profile "+rand,type:"default"}]}
    })
    assert.match(b22Profile.id,/^sp_[A-Za-z0-9_-]+$/)
    const {result:[sellableProduct]}=await createProductsWorkflow(container).run({
      input:{created_by:stores[0].id,products:[{
        title:"B22 two-Store shared master "+rand,status:"published",
        // Mercur 2.4.1 permits one Seller Offer per variant per Cart.
        // Keep one shared master Product, with distinct native variants for
        // the two-Store positive Cart; never disable the native Offer guard.
        attributes:[{title:"B22 Size",is_variant_axis:true,
          values:["Primary","Secondary"]}],
        variants:[
          {title:"Primary",sku:"B22-NATIVE-A-"+rand,
            options:{"B22 Size":"Primary"}},
          {title:"Secondary",sku:"B22-NATIVE-B-"+rand,
            options:{"B22 Size":"Secondary"}}
        ]
      }]}
    })
    // Mercur's product workflow result is the master product projection;
    // variants are not guaranteed populated. Read the ACTUAL persisted
    // native Medusa Product module, never infer a variant from output shape.
    const persistedVariants=await container.resolve("product").listProductVariants({
      product_id:sellableProduct.id
    })
    assert.equal(persistedVariants.length,2)
    const variant=persistedVariants.find((v:any)=>v.sku==="B22-NATIVE-A-"+rand)
    const secondaryVariant=persistedVariants.find((v:any)=>
      v.sku==="B22-NATIVE-B-"+rand)
    assert.ok(variant&&secondaryVariant)
    assert.match(variant.id,/^variant_[A-Za-z0-9_-]+$/)
    assert.match(secondaryVariant.id,/^variant_[A-Za-z0-9_-]+$/)
    assert.notEqual(secondaryVariant.id,variant.id)
    // Mercur 2.4.0 createOffersWorkflow's seller-inventory step obtains
    // its Seller from offers[0], so use one run per Seller, not a mixed batch.
    const offerRows:Array<{id:string;seller_id:string;variant_id:string}>=[]
    // Both participating native Stores used real Owner application and
    // independent platform approval. Other Sellers are not silently included.
    const cartStoreIds=[ownerStoreId,secondOwnerStoreId]
    await linkSellerRegionsWorkflow(container).run({input:{
      add:cartStoreIds.map(seller_id=>({seller_id,region_id:region.id}))
    }})
    const {data:ownedRegions}=await container.resolve("query").graph({
      entity:"region_seller",fields:["seller_id","region_id"],
      filters:{seller_id:[...cartStoreIds,unapprovedStore.id],region_id:region.id}
    })
    assert.deepEqual(ownedRegions.map((row:any)=>row.seller_id).sort(),
      [...cartStoreIds].sort(),
      "Mercur 2.4 Store regions must include only explicitly linked approved Sellers")
    process.stdout.write("PASS B22 Mercur 2.4 Store regions: two approved task-only Sellers explicitly linked to native Region; unapproved Seller excluded\n")
    for(let i=0;i<2;i++){
      const sku="B22-TWO-STORE-"+i+"-"+rand
      const offerVariant=i===0?variant:secondaryVariant
      const {result:[offer]}=await createOffersWorkflow(container).run({
        input:{offers:[{
          seller_id:cartStoreIds[i],created_by:member.id,
          sku,variant_id:offerVariant.id,shipping_profile_id:b22Profile.id,
          inventory_items:[{sku,stock_levels:[]}],
          prices:[{amount:1000+i*100,currency_code:"eur"}],
          manage_inventory:false,allow_backorder:true
        }]}
      })
      assert.match(offer.id,/^offer_[A-Za-z0-9_-]+$/)
      assert.equal(offer.seller_id,cartStoreIds[i])
      offerRows.push({id:offer.id,seller_id:offer.seller_id,
        variant_id:offerVariant.id})
    }
    // A SECOND published master Product uses the SAME variant-backed native
    // Mercur workflow but direct TRY Offer prices. Different sellers own
    // different Price rows in this shared variant PriceSet. EUR price rows
    // above must NOT be converted into an invented TRY reference amount.
    const {result:[tryProduct]}=await createProductsWorkflow(container).run({
      input:{created_by:stores[0].id,products:[{
        title:"B22 native TRY reference "+rand,status:"published",
        variants:[{title:"One TRY size",sku:"B22-TRY-NATIVE-"+rand}]
      }]}
    })
    const tryVariants=await container.resolve("product").listProductVariants({
      product_id:tryProduct.id
    })
    assert.equal(tryVariants.length,1)
    const tryVariant=tryVariants[0]
    const directTryOffers:Array<{id:string;seller_id:string;amount:number}>=[]
    for(let i=0;i<2;i++){
      const sku="B22-TRY-OFFER-"+i+"-"+rand
      const amount=i===0?1250.5:2000
      const {result:[offer]}=await createOffersWorkflow(container).run({
        input:{offers:[{
          seller_id:cartStoreIds[i],created_by:member.id,
          sku,variant_id:tryVariant.id,shipping_profile_id:b22Profile.id,
          inventory_items:[{sku,stock_levels:[]}],
          prices:[{amount,currency_code:"try"}],
          manage_inventory:false,allow_backorder:true
        }]}
      })
      assert.equal(offer.seller_id,cartStoreIds[i])
      directTryOffers.push({id:offer.id,seller_id:offer.seller_id,amount})
    }
    // Read-only positive B22 discovery: native Mercur Offers (never a public
    // /store route), a published shared master Product and two independently
    // approved Organization-owned Sellers. No prices or checkout enabled.

    // B22 only: native Seller-owned CustomerGroup plus audited legal Buyer Org.
    const {result:[priceGroup]}=await createSellerCustomerGroupsWorkflow(container).run({
      input:{seller_id:ownerStoreId,
        customer_groups:[{name:"B22 Store buyer group "+rand}]}
    })
    assert.match(priceGroup.id,/^cusgroup_[A-Za-z0-9_-]+$/)
    const {data:groupLink}=await container.resolve("query").graph({
      entity:"customer_group_seller",fields:["seller_id","customer_group_id"],
      filters:{seller_id:ownerStoreId,customer_group_id:priceGroup.id}
    })
    assert.equal(groupLink.length,1)
    // Native capability proof for the next Buyer Organization slice. The
    // price list is owned by Seller A and uses a Medusa group rule plus an
    // exact Mercur Offer price rule; it must NEVER affect Seller B's Offer.
    // No Person/Medusa Customer is enrolled in the group in this fixture.
    const groupSpecialAmount=950.25
    const {result:[storeGroupPriceList]}=await createSellerPriceListsWorkflow(container).run({
      input:{seller_id:ownerStoreId,price_lists_data:[{
        title:"B22 Store/Buyer private TRY "+rand,
        description:"Task-only native group price selection proof",
        status:"active",
        rules:{"customer.groups.id":[priceGroup.id]},
        prices:[{variant_id:tryVariant.id,currency_code:"try",
          amount:groupSpecialAmount,rules:{offer_id:directTryOffers[0].id}}]
      }]}
    })
    assert.match(storeGroupPriceList.id,/^plist_[A-Za-z0-9_-]+$/)
    const {data:privateListOwners}=await container.resolve("query").graph({
      entity:"price_list_seller",fields:["seller_id","price_list_id"],
      filters:{price_list_id:storeGroupPriceList.id}
    })
    assert.deepEqual(privateListOwners.map((x:any)=>x.seller_id),[ownerStoreId])
    const {data:privateVariant}=await container.resolve("query").graph({
      entity:"product_variant",fields:["id","price_set.id"],
      filters:{id:tryVariant.id}
    })
    assert.equal(privateVariant.length,1)
    const nativePriceSetId=privateVariant[0]?.price_set?.id
    assert.match(nativePriceSetId,/^pset_[A-Za-z0-9_-]+$/)
    const nativePricing=container.resolve("pricing")
    const calcGroupTry=async(offer_id:string,groupId?:string)=>{
      const [value]=await nativePricing.calculatePrices({id:[nativePriceSetId]},{
        context:{currency_code:"try",offer_id,quantity:1,
          ...(groupId?{"customer.groups.id":groupId}:{})}
      })
      assert.equal(value?.id,nativePriceSetId)
      return value
    }
    const groupSelected=await calcGroupTry(directTryOffers[0].id,priceGroup.id)
    assert.equal(groupSelected.calculated_amount,groupSpecialAmount,
      "Native pricing should select ONLY Seller A group-authorized PriceList")
    assert.equal(groupSelected.calculated_price?.price_list_id,storeGroupPriceList.id)
    assert.equal(groupSelected.is_calculated_price_price_list,true)
    const anonymousPrice=await calcGroupTry(directTryOffers[0].id)
    assert.equal(anonymousPrice.calculated_amount,directTryOffers[0].amount)
    assert.equal(anonymousPrice.is_calculated_price_price_list,false)
    const wrongGroupPrice=await calcGroupTry(directTryOffers[0].id,"cusgroup_foreign")
    assert.equal(wrongGroupPrice.calculated_amount,directTryOffers[0].amount)
    const crossStorePrice=await calcGroupTry(directTryOffers[1].id,priceGroup.id)
    assert.equal(crossStorePrice.calculated_amount,directTryOffers[1].amount)
    assert.equal(crossStorePrice.is_calculated_price_price_list,false)
    process.stdout.write("PASS B22 native Store BuyerOrg group PriceList capability: native group+Offer-scoped TRY override selected only for matching Store/group; anonymous, foreign group and second Store kept base price; no Person Customer enrollment\n")
    const groupInput={organization_id:organizations[0].id,
      seller_id:ownerStoreId,buyer_organization_id:organizations[1].id,
      customer_group_id:priceGroup.id}
    const groupChange=async(action:"grant"|"revoke"|"read",
      input:Record<string,unknown>=groupInput,b=browser)=>{
      return b.eval("(async()=>{"+
        "const s=await(await fetch('/personal/session')).json();"+
        "const action="+JSON.stringify(action)+";"+
        "const input="+JSON.stringify(input)+";"+
        "const method=action==='read'?'GET':'POST';"+
        "const url='/personal/store-price-groups'+(method==='GET'?'?'+new URLSearchParams(input).toString():'');"+
        "const res=await fetch(url,{method,headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "...(method==='POST'?{body:JSON.stringify({...input,action})}:{})});"+
        "return {status:res.status,body:await res.json()};})()")
    }
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    // The earlier independent Member/Owner acceptance uses two task-owned
    // Chrome processes. Refresh this real authenticated document before
    // opening the existing price-group workspace; no DOM role spoofing.
    await browser.send("Page.reload",{ignoreCache:true})
    await browser.wait("Array.from(document.querySelectorAll('#organizations button')).some(b=>b.textContent==="+
      JSON.stringify(organizations[0].name+" — owner")+")")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('store-price-group-panel').hidden")
    const groupListAuditStart=Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n)
    const nativeGroupList=async(b:any,orgId:string,sellerId:string)=>b.eval("(async()=>{"+
      "const p=new URLSearchParams({view:'list',"+
      "organization_id:"+JSON.stringify(orgId)+","+
      "seller_id:"+JSON.stringify(sellerId)+"});"+
      "const r=await fetch('/personal/store-price-groups?'+p.toString());"+
      "return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};})()")
    const ownedGroupList=await nativeGroupList(browser,organizations[0].id,ownerStoreId)
    assert.equal(ownedGroupList.status,200)
    assert.equal(ownedGroupList.body.organization_id,organizations[0].id)
    assert.equal(ownedGroupList.body.seller_id,ownerStoreId)
    assert.match(ownedGroupList.cache,/no-store/)
    assert.ok(ownedGroupList.body.groups.some((g:any)=>g.id===priceGroup.id),
      "Owned native CustomerGroup must be discoverable without typing its ID")
    const secondGroupList=await nativeGroupList(browser,organizations[0].id,secondOwnerStoreId)
    assert.equal(secondGroupList.status,200)
    assert.ok(secondGroupList.body.groups.every((g:any)=>g.id!==priceGroup.id),
      "Another Store may not discover this Store's native group")
    assert.equal((await nativeGroupList(reviewer,organizations[0].id,ownerStoreId)).status,403,
      "Foreign Person may not enumerate native Store CustomerGroups")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),groupListAuditStart,
      "Read-only Store group choices must not write canonical audit")
    await browser.wait("Array.from(document.querySelectorAll('#store-price-group-choice option'))"+
      ".some(o=>o.value==="+JSON.stringify(priceGroup.id)+")")
    const choice=await browser.eval("(()=>{"+
      "const field=document.getElementById('store-price-group-choice');"+
      "field.value="+JSON.stringify(priceGroup.id)+";"+
      "field.dispatchEvent(new Event('change',{bubbles:true}));"+
      "return document.querySelector('#store-price-group-form input[name=customer_group_id]').value;})()")
    assert.equal(choice,priceGroup.id,
      "Real Owner Chrome picker must populate only its selected Store's native group ID")
    await browser.input("#store-price-group-form input[name=buyer_organization_id]",organizations[1].id)
    const groupAuditStart=(await q("select count(*)::int n from da_audit_event"))[0].n
    // Hold the FIRST real signed HTTPS POST response after PostgreSQL has
    // committed. The request, authorization, grant and audit are not mocked.
    // A->B->A while that reply is held must preserve the uncertainty notice,
    // and an authorized subsequent GET must reconcile the durable result.
    await browser.eval("(()=>{"+
      "const original=window.fetch.bind(window);"+
      "window.__daWriteRaceFetch=window.fetch;"+
      "window.__daWriteRaceHeld=false;"+
      "window.fetch=(resource,options)=>{"+
        "const url=typeof resource==='string'?resource:resource?.url;"+
        "if(url==='/personal/store-price-groups'&&options?.method==='POST'&&"+
           "!window.__daWriteRaceHeld){"+
          "window.__daWriteRaceHeld=true;"+
          "return original(resource,options).then(response=>new Promise(resolve=>{"+
            "window.__daWriteRaceRelease=()=>resolve(response)"+
          "}))"+
        "}"+
        "return original(resource,options)"+
      "};return true})()")
    await browser.click('#store-price-group-form button[value="grant"]')
    await browser.wait("typeof window.__daWriteRaceRelease==='function'")
    assert.equal(Number((await q(
      "select count(*)::int n from da_store_buyer_price_group where seller_id=$1 and buyer_organization_id=$2 and customer_group_id=$3 and revoked_at is null",
      [ownerStoreId,organizations[1].id,priceGroup.id]))[0].n),1,
      "Pending Chrome grant must really commit an authorized PG16 BuyerOrg record")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),Number(groupAuditStart)+1,
      "Pending real grant must create one canonical audit before its reply is released")
    const doubleSwitch=await browser.eval("(()=>{"+
      "const form=document.getElementById('store-price-group-form');"+
      "const store=form.elements.namedItem('seller_id');"+
      "store.value="+JSON.stringify(secondOwnerStoreId)+";"+
      "store.dispatchEvent(new Event('change',{bubbles:true}));"+
      "const first=document.getElementById('store-price-group-status').textContent;"+
      "store.value="+JSON.stringify(ownerStoreId)+";"+
      "store.dispatchEvent(new Event('change',{bubbles:true}));"+
      "return {first,second:document.getElementById('store-price-group-status').textContent,"+
        "group:form.elements.namedItem('customer_group_id').value,"+
        "buttons:Array.from(form.querySelectorAll('button'),b=>b.disabled)}"+
      "})()")
    assert.match(doubleSwitch.first,/Önceki mağazadaki işlem/,
      "First Store switch must report unresolved native grant")
    assert.match(doubleSwitch.second,/Önceki mağazadaki işlem/,
      "A->B->A cannot discard an unresolved native grant warning")
    assert.equal(doubleSwitch.group,"",
      "Returning to the first Store must not automatically reuse its stale group selection")
    assert.ok(doubleSwitch.buttons.every((value:boolean)=>value===false),
      "Multiple Store switches cannot strand group action buttons")
    // A real authorized GET can finish while the original successful
    // native POST response is still withheld by Chrome. This early read
    // MUST NOT settle the write; another A->B->A must retain its warning.
    await browser.wait("Array.from(document.querySelectorAll('#store-price-group-choice option'))"+
      ".some(o=>o.value==="+JSON.stringify(priceGroup.id)+")")
    assert.equal(await browser.eval("(()=>{"+
      "const choice=document.getElementById('store-price-group-choice');"+
      "choice.value="+JSON.stringify(priceGroup.id)+";"+
      "choice.dispatchEvent(new Event('change',{bubbles:true}));"+
      "return document.querySelector('#store-price-group-form input[name=customer_group_id]').value"+
      "})()"),priceGroup.id)
    await browser.click('#store-price-group-form button[value="read"]')
    await browser.wait("document.getElementById('store-price-group-status').textContent.includes('kabul edilmiş')&&"+
      "document.getElementById('store-price-group-status').textContent.includes('Önceki mağazadaki işlem')")
    const earlyReadSecondSwitch=await browser.eval("(()=>{"+
      "const s=document.querySelector('#store-price-group-form select[name=seller_id]');"+
      "s.value="+JSON.stringify(secondOwnerStoreId)+";"+
      "s.dispatchEvent(new Event('change',{bubbles:true}));"+
      "s.value="+JSON.stringify(ownerStoreId)+";"+
      "s.dispatchEvent(new Event('change',{bubbles:true}));"+
      "return {status:document.getElementById('store-price-group-status').textContent,"+
      "enabled:Array.from(document.querySelectorAll('#store-price-group-form button'),b=>!b.disabled)}"+
      "})()")
    assert.match(earlyReadSecondSwitch.status,/Önceki mağazadaki işlem/,
      "Early authorized GET and another Store switch cannot erase a pending native POST")
    assert.ok(earlyReadSecondSwitch.enabled.every(Boolean),
      "Another Store switch must keep the controls usable")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),Number(groupAuditStart)+1,
      "Early read and repeated Store switches may not create a second audit")
    process.stdout.write("PASS B22 Chrome: early authorized HTTPS GET plus repeated Store switches cannot clear a still-pending native grant; PG16 one write/one audit\n")
    await browser.eval("(()=>{"+
      "window.__daWriteRaceRelease();"+
      "window.fetch=window.__daWriteRaceFetch;"+
      "delete window.__daWriteRaceRelease;delete window.__daWriteRaceFetch;"+
      "return true})()")
    await browser.wait("priceGroupUncertain.size>0&&"+
      "Array.from(priceGroupUncertain.values()).every(v=>v.settled)")
    assert.match(await browser.eval(
      "document.getElementById('store-price-group-status').textContent"),
      /Önceki mağazadaki işlem/,
      "Late native POST reply must not falsely clear the unresolved notice")
    await browser.wait("Array.from(document.querySelectorAll('#store-price-group-choice option'))"+
      ".some(o=>o.value==="+JSON.stringify(priceGroup.id)+")")
    assert.equal(await browser.eval("(()=>{"+
      "const choice=document.getElementById('store-price-group-choice');"+
      "choice.value="+JSON.stringify(priceGroup.id)+";"+
      "choice.dispatchEvent(new Event('change',{bubbles:true}));"+
      "return document.querySelector('#store-price-group-form input[name=customer_group_id]').value"+
      "})()"),priceGroup.id)
    await browser.click('#store-price-group-form button[value="read"]')
    await browser.wait("document.getElementById('store-price-group-status').textContent.includes('kabul edilmiş')&&"+
      "!document.getElementById('store-price-group-status').textContent.includes('Önceki mağazadaki işlem')")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),Number(groupAuditStart)+1,
      "Authorized recheck after a committed grant must not write another audit")
    process.stdout.write("PASS B22 Chrome: pending native grant POST A-B-A retains warning and unlocked controls; authorized HTTPS record recheck clears only after PG16 grant and single audit are confirmed\n")
    assert.equal((await groupChange("read")).body.status,"active")
    // Deterministic real-Chrome UI scheduling: the authenticated HTTPS GET
    // still reaches Medusa, but its response is held only in this test page
    // until the Store selector changes. No private API or DB is mocked.
    await browser.eval("(()=>{"+
      "const original=window.fetch.bind(window);"+
      "window.__daGroupRaceFetch=window.fetch;"+
      "window.__daGroupRaceHeld=false;"+
      "window.fetch=(resource,options)=>{"+
        "const url=typeof resource==='string'?resource:resource?.url;"+
        "if(typeof url==='string'&&url.startsWith('/personal/store-price-groups?')&&"+
           "url.includes('buyer_organization_id=')&&!window.__daGroupRaceHeld){"+
          "window.__daGroupRaceHeld=true;"+
          "return original(resource,options).then(response=>new Promise(resolve=>{"+
            "window.__daGroupRaceRelease=()=>resolve(response)"+
          "}))"+
        "}"+
        "return original(resource,options)"+
      "};return true})()")
    await browser.click('#store-price-group-form button[value="read"]')
    await browser.wait("typeof window.__daGroupRaceRelease==='function'")
    const switchedGroup=await browser.eval("(()=>{"+
      "const form=document.getElementById('store-price-group-form');"+
      "const store=form.elements.namedItem('seller_id');"+
      "store.value="+JSON.stringify(secondOwnerStoreId)+";"+
      "store.dispatchEvent(new Event('change',{bubbles:true}));"+
      "return {store:store.value,group:form.elements.namedItem('customer_group_id').value,"+
        "disabled:Array.from(form.querySelectorAll('button'),b=>b.disabled),"+
        "status:document.getElementById('store-price-group-status').textContent}"+
    "})()")
    assert.equal(switchedGroup.store,secondOwnerStoreId)
    assert.equal(switchedGroup.group,"",
      "Store switch must erase first Store's group selection")
    assert.ok(switchedGroup.disabled.every((value:boolean)=>value===false),
      "Buttons cannot remain locked while old Store read response is pending")
    assert.match(switchedGroup.status,/Önceki mağazadaki işlem/,
      "Unknown result of old Store action must not be represented as cancelled")
    await browser.eval("(()=>{"+
      "window.__daGroupRaceRelease();"+
      "window.fetch=window.__daGroupRaceFetch;"+
      "delete window.__daGroupRaceRelease;delete window.__daGroupRaceFetch;"+
      "return true})()")
    await browser.wait("document.getElementById('store-price-group-status').textContent"+
      ".includes('Önceki mağazadaki işlem')")
    assert.equal(await browser.eval(
      "Array.from(document.querySelectorAll('#store-price-group-form button'))"+
      ".every(b=>!b.disabled)"),true,
      "Old completed read must not permanently disable next Store controls")
    await browser.eval("(()=>{"+
      "const s=document.querySelector('#store-price-group-form select[name=seller_id]');"+
      "s.value="+JSON.stringify(ownerStoreId)+";"+
      "s.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
    await browser.wait("Array.from(document.querySelectorAll('#store-price-group-choice option'))"+
      ".some(o=>o.value==="+JSON.stringify(priceGroup.id)+")")
    assert.equal(await browser.eval("(()=>{"+
      "const choice=document.getElementById('store-price-group-choice');"+
      "choice.value="+JSON.stringify(priceGroup.id)+";"+
      "choice.dispatchEvent(new Event('change',{bubbles:true}));"+
      "return document.querySelector('#store-price-group-form input[name=customer_group_id]').value"+
      "})()"),priceGroup.id)
    process.stdout.write("PASS B22 Chrome: group-picker Store-switch race: pending native HTTPS GET cannot lock new Store controls, previous result remains uncertain, selection resets; original Store works again\n")
    assert.equal((await groupChange("grant")).status,200)
    assert.equal((await q("select count(*)::int n from da_store_buyer_price_group where seller_id=$1 and buyer_organization_id=$2 and customer_group_id=$3 and revoked_at is null",
      [ownerStoreId,organizations[1].id,priceGroup.id]))[0].n,1)
    assert.equal((await q("select count(*)::int n from da_audit_event"))[0].n,
      groupAuditStart+1,"Idempotent grant writes only one canonical audit")
    // F-01: an actual authenticated HTTPS idempotent grant commits before
    // Chrome sees its response. Editing the Buyer input while it is delayed
    // must not apply the OLD scope's success to the NEW visible Buyer.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'&&"+
      "document.querySelector('#store-price-group-form input[name=buyer_organization_id]').value==="+
      JSON.stringify(organizations[1].id))
    await browser.eval("(()=>{"+
      "const original=window.fetch.bind(window);"+
      "window.__daF01Fetch=window.fetch;"+
      "window.fetch=(resource,options)=>{"+
        "const url=typeof resource==='string'?resource:resource?.url;"+
        "if(url==='/personal/store-price-groups'&&options?.method==='POST'&&"+
          "JSON.parse(options.body||'{}').action==='grant'&&!window.__daF01Held){"+
          "window.__daF01Held=true;"+
          "return original(resource,options).then(response=>new Promise(resolve=>{"+
            "window.__daF01Release=()=>resolve(response)"+
          "}))"+
        "}return original(resource,options)"+
      "};return true})()")
    await browser.click('#store-price-group-form button[value="grant"]')
    await browser.wait("typeof window.__daF01Release==='function'")
    assert.equal(Number((await q(
      "select count(*)::int n from da_store_buyer_price_group where seller_id=$1 and buyer_organization_id=$2 and customer_group_id=$3 and revoked_at is null",
      [ownerStoreId,organizations[1].id,priceGroup.id]))[0].n),1,
      "Real original-scope grant remains persisted during delayed browser reply")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),Number(groupAuditStart)+1,
      "Idempotent grant cannot create an extra audit")
    // B06Chrome.input appends text, so clear the prior field first.
    await browser.eval("document.querySelector('#store-price-group-form input[name=buyer_organization_id]').value=''")
    await browser.input("#store-price-group-form input[name=buyer_organization_id]",organizations[0].id)
    assert.equal(await browser.eval(
      "document.querySelector('#store-price-group-form input[name=buyer_organization_id]').value"),
      organizations[0].id)
    await browser.eval("(()=>{"+
      "window.__daF01Release();"+
      "window.fetch=window.__daF01Fetch;"+
      "delete window.__daF01Release;delete window.__daF01Fetch;"+
      "return true})()")
    await browser.wait("priceGroupUncertain.has(JSON.stringify(["+
      JSON.stringify(organizations[0].id)+","+
      JSON.stringify(ownerStoreId)+","+
      JSON.stringify(priceGroup.id)+","+
      JSON.stringify(organizations[1].id)+"]))&&"+
      "document.getElementById('store-price-group-status').textContent.includes('Önceki mağazadaki işlem')")
    assert.equal(await browser.eval(
      "document.getElementById('store-price-group-status').textContent.includes('kabul edilmiş')"),
      false,"Late grant success must not be shown against the edited Buyer")
    // B06Chrome.input appends text, so clear the prior field first.
    await browser.eval("document.querySelector('#store-price-group-form input[name=buyer_organization_id]').value=''")
    await browser.input("#store-price-group-form input[name=buyer_organization_id]",organizations[1].id)
    await browser.click('#store-price-group-form button[value="read"]')
    await browser.wait("document.getElementById('store-price-group-status').textContent.includes('kabul edilmiş')&&"+
      "!document.getElementById('store-price-group-status').textContent.includes('Önceki mağazadaki işlem')")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),Number(groupAuditStart)+1,
      "F-01 scoped authorized GET cannot trigger another POST/audit")
    process.stdout.write("PASS B22 Chrome: F-01 real idempotent native grant + PG16, delayed 200 after same-Store Buyer edit cannot claim success for new Buyer; exact original-scope read reconciles, no extra audit\n")
    assert.equal((await groupChange("grant",{...groupInput,seller_id:secondOwnerStoreId})).status,403)
    assert.equal((await groupChange("grant",groupInput,reviewer)).status,403)
    const missingCsrf=await browser.eval("(async()=>{const r=await fetch('/personal/store-price-groups',{method:'POST',headers:{'content-type':'application/json'},body:"+JSON.stringify(JSON.stringify({...groupInput,action:"grant"}))+"});return r.status})()")
    assert.equal(missingCsrf,403)
    // First real private reference price: only the independently authorized
    // Buyer Organization Beta was granted Seller Alpha's native CustomerGroup.
    // Same native Customer and same shared variant never imply entitlement.
    const privateCatalogBeta=async()=>reviewer.eval("(async()=>{"+
      "const r=await fetch('/personal/catalog?organization_id="+encodeURIComponent(organizations[1].id)+"');"+
      "return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};})()")
    const privateReadAuditStart=Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n)
    const beforeRevoke=await privateCatalogBeta()
    assert.equal(beforeRevoke.status,200)
    assert.match(beforeRevoke.cache,/no-store/)
    const approvedStorePrivate=beforeRevoke.body.stores.find((st:any)=>st.id===ownerStoreId)
    const otherStorePrivate=beforeRevoke.body.stores.find((st:any)=>st.id===secondOwnerStoreId)
    const alphaOffer=approvedStorePrivate?.products.find((x:any)=>x.offer_id===directTryOffers[0].id)
    const otherStoreTryReference=otherStorePrivate?.products.find((x:any)=>x.offer_id===directTryOffers[1].id)
    assert.deepEqual(alphaOffer?.buyer_reference_try,{
      amount:groupSpecialAmount,currency_code:"try"
    },"Beta BuyerOrg's active Seller A group must select native private TRY reference")
    assert.deepEqual(alphaOffer?.list_price_try,{amount:1250.5,currency_code:"try"})
    assert.equal(otherStoreTryReference?.buyer_reference_try,undefined,
      "Other Store's same native variant never inherits Seller A's group price")
    assert.deepEqual(otherStoreTryReference?.list_price_try,{amount:2000,currency_code:"try"})
    assert.equal(beforeRevoke.body.checkout_ready,false)
    assert.equal(beforeRevoke.body.prices_available,false)
    const buyerAWithoutGroup=await get(
      "/personal/catalog?organization_id="+encodeURIComponent(organizations[0].id))
    assert.equal(buyerAWithoutGroup.status,200)
    const noGroupAlpha=buyerAWithoutGroup.body.stores.find((st:any)=>st.id===ownerStoreId)
      ?.products.find((x:any)=>x.offer_id===directTryOffers[0].id)
    assert.equal(noGroupAlpha?.buyer_reference_try,undefined,
      "Same Seller's separate buyer Organization must not inherit Beta's group")
    assert.equal((await q("select count(*)::int n from da_audit_event"))[0].n,
      privateReadAuditStart,"Real private catalogue read cannot mutate audit")
    // A background tab deliberately conceals private Buyer content.
    // Re-enter the real HTTPS page with the authorized Organization.
    await reviewer.send("Page.bringToFront")
    const buyerPersonalUrl=reviewer.origin+"/personal?organization="+
      encodeURIComponent(organizations[1].id)
    await reviewer.send("Page.navigate",{url:buyerPersonalUrl})
    await reviewer.wait("document.visibilityState==='visible'&&"+
      "!document.getElementById('workspace').hidden&&"+
      "JSON.parse(document.getElementById('detail').textContent||'{}').role==='owner'")
    await reviewer.wait("!document.getElementById('buyer-catalog-panel').hidden")
    await reviewer.click("#buyer-catalog-refresh")
    await reviewer.wait("document.getElementById('buyer-catalog-items').textContent.includes('Bu işletmeye özel TRY referans fiyatı:')")
    const buyerPrivateDom=await reviewer.eval(
      "Array.from(document.querySelectorAll('#buyer-catalog-items li'),el=>el.textContent)")
    assert.ok(buyerPrivateDom.some((line:string)=>
      line.includes(tryProduct.title)&&line.includes('950,25')&&
      line.includes('Bu işletmeye özel TRY referans fiyatı:')&&
      line.includes('(ödenecek tutar değil)')),
      "Real Chrome Beta Owner must display 950,25 TRY as non-payable group reference")
    assert.equal(buyerPrivateDom.filter((line:string)=>
      line.includes('Bu işletmeye özel TRY referans fiyatı:')).length,1,
      "Only Seller Alpha's approved group price may appear")

    // B22 bounded native Seller-window navigation: no Seller IDs/counts are
    // exposed to the Buyer merely because a later page was queried.
    // This real Chrome/HTTPS test checks page switching with disposable PG16.
    // The separate deterministic service test covers the twenty-first Store.
    const buyerPageUrl="/personal/catalog?organization_id="+
      encodeURIComponent(organizations[1].id)
    const laterWindow=await reviewer.eval("(async()=>{"+
      "const r=await fetch("+JSON.stringify(buyerPageUrl+"&page=1")+");"+
      "return {status:r.status,body:await r.json()}})()")
    assert.equal(laterWindow.status,200)
    assert.equal(laterWindow.body.organization_id,organizations[1].id)
    assert.equal(laterWindow.body.page,1)
    assert.ok(Array.isArray(laterWindow.body.stores)&&laterWindow.body.stores.length<=20)
    assert.equal(laterWindow.body.checkout_ready,false)
    assert.equal(laterWindow.body.prices_available,false)
    assert.ok(!Object.prototype.hasOwnProperty.call(laterWindow.body,"count")&&
      !Object.prototype.hasOwnProperty.call(laterWindow.body,"has_more"),
      "A page must not expose the count of unrelated native Sellers")
    assert.equal(await reviewer.eval("(async()=>{"+
      "const r=await fetch("+JSON.stringify(buyerPageUrl+"&page=5")+");"+
      "return r.status})()"),400)
    await reviewer.click('#buyer-catalog-next')
    await reviewer.wait("!document.getElementById('buyer-catalog-panel').hidden&&"+
      "document.getElementById('buyer-catalog-status').textContent.includes('2/5')")
    assert.equal(await reviewer.eval(
      "document.getElementById('buyer-catalog-prev').disabled"),false)
    await reviewer.click('#buyer-catalog-prev')
    await reviewer.wait("!document.getElementById('buyer-catalog-panel').hidden&&"+
      "document.getElementById('buyer-catalog-status').textContent.includes('1/5')&&"+
      "document.getElementById('buyer-catalog-items').textContent.includes('Bu işletmeye özel TRY referans fiyatı:')")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),privateReadAuditStart,
      "Native catalogue page navigation must be read-only")
    process.stdout.write("PASS B22 Chrome: Buyer catalogue native Seller page 1 and back to 0, bounded no-count HTTP and page 5 rejected, private TRY remains scoped, PG16 audit unchanged\\n")

    // F-01: a suspended or de-approved Seller must not disclose whether
    // a Buyer Organization has an active membership. Cleanup revoke remains
    // intentionally independent of the Seller's current open state.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:ownerStoreId,reason:"B22 isolated price-group GET suspension negative"
    }})
    try{
      assert.equal((await groupChange("read")).status,403,
        "Suspended Seller must not expose even active group membership")
      const suspendedCatalog=await privateCatalogBeta()
      assert.equal(suspendedCatalog.status,200)
      assert.equal(suspendedCatalog.body.stores.some((x:any)=>x.id===ownerStoreId),false,
        "Suspended Seller must not reveal its formerly eligible BuyerOrg price")
    }finally{
      await unsuspendSellerWorkflow(container).run({input:{seller_id:ownerStoreId}})
    }
    const sellerAfterUnsuspend=(await native.listSellers({id:ownerStoreId}))[0]
    assert.equal(sellerAfterUnsuspend?.status,"open")
    assert.ok(sellerAfterUnsuspend?.approved_at)
    assert.equal((await groupChange("read")).body.status,"active",
      "Authorized Owner read must recover only after Seller is open again")
    const approvalBefore=sellerAfterUnsuspend.approved_at
    await q("update seller set approved_at=null where id=$1",[ownerStoreId])
    try{
      assert.equal((await groupChange("read")).status,403,
        "Open Seller with removed platform approval must also deny membership read")
    }finally{
      await q("update seller set approved_at=$2 where id=$1",
        [ownerStoreId,approvalBefore])
    }
    assert.equal((await groupChange("read")).body.status,"active")
    await q("update da_organization set status='suspended' where id=$1",
      [organizations[1].id])
    try{
      assert.equal((await groupChange("read")).status,403,
        "Suspended Buyer Organization cannot read its former group membership")
    }finally{
      await q("update da_organization set status='active' where id=$1",
        [organizations[1].id])
    }
    assert.equal((await groupChange("read")).body.status,"active")
    // The real authorized native revoke reaches Medusa HTTPS, persists in
    // PostgreSQL and writes the canonical audit first. In this browser only,
    // change its already-successful response to the exact terminal native 503
    // payload. This tests the UI's 503 recovery, NOT an actual server 503.
    const auditBeforeRevoke503=Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n)
    // The preceding Buyer catalogue flow uses a different Chrome window.
    // Re-enter the real Owner page and reselect the exact Store/Group/Buyer.
    // A stale hidden tab cannot count as an active authorization UI test.
    await restoreStorePriceGroupOwnerBrowser({
      browser,organizationName:organizations[0].name,storeId:ownerStoreId,
      groupId:priceGroup.id,buyerOrganizationId:organizations[1].id
    })
    // Intercept only AFTER the helper's possible real Page.reload.
    await browser.eval("(()=>{"+
      "const original=window.fetch.bind(window);"+
      "window.__daRevokeActualFetch=window.fetch;"+
      "window.__daRevokeSynthetic503=false;"+
      "window.fetch=(resource,options)=>{"+
        "const url=typeof resource==='string'?resource:resource?.url;"+
        "if(url==='/personal/store-price-groups'&&options?.method==='POST'&&"+
          "JSON.parse(options.body||'{}').action==='revoke'&&!window.__daRevokeSynthetic503){"+
          "return original(resource,options).then(async response=>{"+
            "const body=await response.clone().json();"+
            "if(response.status!==200||body.status!=='revoked')return response;"+
            "window.__daRevokeSynthetic503=true;"+
            "return new Response(JSON.stringify({message:'Outcome uncertain; recheck group'}),"+
              "{status:503,headers:{'Content-Type':'application/json'}})"+
          "})"+
        "}return original(resource,options)"+
      "};return true})()")
    // Wait for the previously authorized visible control; never bypass UI.
    await browser.wait("(()=>{const e=document.querySelector('#store-price-group-form button[value=\\\"revoke\\\"]');"+
      "return !!e && !!e.getClientRects().length && !e.disabled})()")
    await browser.click('#store-price-group-form button[value="revoke"]')
    await browser.wait("window.__daRevokeSynthetic503&&"+
      "document.getElementById('store-price-group-status').textContent.includes('Sonuç belirsiz')")
    assert.equal(Number((await q(
      "select count(*)::int n from da_store_buyer_price_group where seller_id=$1 and buyer_organization_id=$2 and customer_group_id=$3 and revoked_at is not null",
      [ownerStoreId,organizations[1].id,priceGroup.id]))[0].n),1,
      "The native HTTPS revoke must commit before the synthetic browser 503")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),auditBeforeRevoke503+1,
      "A disguised 503 must not mask a second audit or duplicated write")
    await browser.eval("(()=>{"+
      "window.fetch=window.__daRevokeActualFetch;"+
      "delete window.__daRevokeActualFetch;"+
      "return true})()")
    const revoke503Switch=await browser.eval("(()=>{"+
      "const s=document.querySelector('#store-price-group-form select[name=seller_id]');"+
      "s.value="+JSON.stringify(secondOwnerStoreId)+";"+
      "s.dispatchEvent(new Event('change',{bubbles:true}));"+
      "s.value="+JSON.stringify(ownerStoreId)+";"+
      "s.dispatchEvent(new Event('change',{bubbles:true}));"+
      "return document.getElementById('store-price-group-status').textContent"+
      "})()")
    assert.match(revoke503Switch,/Önceki mağazadaki işlem/,
      "An uncertain native revoke result must survive Store A-B-A")
    await browser.wait("Array.from(document.querySelectorAll('#store-price-group-choice option'))"+
      ".some(o=>o.value==="+JSON.stringify(priceGroup.id)+")")
    await browser.eval("(()=>{"+
      "const choice=document.getElementById('store-price-group-choice');"+
      "choice.value="+JSON.stringify(priceGroup.id)+";"+
      "choice.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
    await browser.click('#store-price-group-form button[value="read"]')
    await browser.wait("document.getElementById('store-price-group-status').textContent.includes('üyeliği yok')&&"+
      "!document.getElementById('store-price-group-status').textContent.includes('Önceki mağazadaki işlem')")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),auditBeforeRevoke503+1,
      "Authorized recheck after terminal synthetic 503 is read-only")
    process.stdout.write("PASS B22 Chrome: real native HTTPS revoke/PG16 single audit with browser-only synthetic terminal 503; A-B-A warning and authorized subsequent GET recovery, no second write\n")
    assert.equal((await groupChange("read")).body.status,"revoked")
    const afterRevoke=await privateCatalogBeta()
    assert.equal(afterRevoke.status,200)
    const revokedOffer=afterRevoke.body.stores.find((x:any)=>x.id===ownerStoreId)
      ?.products.find((x:any)=>x.offer_id===directTryOffers[0].id)
    assert.equal(revokedOffer?.buyer_reference_try,undefined,
      "Committed Store BuyerOrg group revoke must immediately remove private reference")
    assert.deepEqual(revokedOffer?.list_price_try,{amount:1250.5,currency_code:"try"})
    // Retest after Seller's revoke through a fresh HTTPS Buyer navigation,
    // never by manually undoing the privacy-concealed DOM.
    await reviewer.send("Page.bringToFront")
    await reviewer.send("Page.navigate",{url:buyerPersonalUrl})
    await reviewer.wait("document.visibilityState==='visible'&&"+
      "!document.getElementById('workspace').hidden&&"+
      "JSON.parse(document.getElementById('detail').textContent||'{}').role==='owner'")
    await reviewer.wait("!document.getElementById('buyer-catalog-panel').hidden")
    await reviewer.click("#buyer-catalog-refresh")
    await reviewer.wait("!document.getElementById('buyer-catalog-items').textContent.includes('Bu işletmeye özel TRY referans fiyatı:')")
    process.stdout.write("PASS B22 BuyerOrg native private TRY reference: real Chrome/HTTPS/PG16 active Store group grants only 950.25 TRY to Beta, other Store and Buyer base TRY; revoke and Seller suspension hide price, no checkout or audit writes\n")
    assert.equal((await q("select count(*)::int n from da_store_buyer_price_group where seller_id=$1 and buyer_organization_id=$2 and customer_group_id=$3 and revoked_at is not null",
      [ownerStoreId,organizations[1].id,priceGroup.id]))[0].n,1)
    assert.equal((await q("select count(*)::int n from da_audit_event"))[0].n,
      groupAuditStart+2,"Revocation retains auditable membership history")
    process.stdout.write("PASS B22 audited Store price group: real Owner Chrome grant/revoke, Mercur SellerCustomerGroup link, Buyer Org PG16 audit/outbox, foreign Person/Store/CSRF denied; no checkout\n")

    // F-02: the real native HTTPS revoke returns 200 after a previously
    // committed revoke. Corrupt ONLY the browser-visible body afterward.
    // This does not claim Medusa itself sent corrupt JSON.
    await browser.send("Page.bringToFront")
    await browser.eval("(()=>{"+
      "const original=window.fetch.bind(window);"+
      "window.__daF02Fetch=window.fetch;"+
      "window.__daF02Posts=0;"+
      "window.fetch=(resource,options)=>{"+
        "const url=typeof resource==='string'?resource:resource?.url;"+
        "if(url==='/personal/store-price-groups'&&options?.method==='POST'&&"+
          "JSON.parse(options.body||'{}').action==='revoke'){"+
          "window.__daF02Posts++;"+
          "return original(resource,options).then(async response=>{"+
            "const data=await response.clone().json();"+
            "if(response.status!==200||data.status!=='revoked')return response;"+
            "return new Response('{',{status:200,headers:{'Content-Type':'application/json'}})"+
          "})"+
        "}return original(resource,options)"+
      "};return true})()")
    await browser.click('#store-price-group-form button[value="revoke"]')
    await browser.wait("window.__daF02Posts===1&&"+
      "document.getElementById('store-price-group-status').textContent.includes('Sonuç belirsiz')")
    assert.equal(await browser.eval(
      "document.getElementById('store-price-group-status').textContent.includes('İşlem reddedildi')"),
      false,"Corrupt successful POST response must not falsely claim rejection")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),Number(groupAuditStart)+2,
      "F-02 idempotent native revoke plus malformed browser response creates no new audit")
    await browser.click('#store-price-group-form button[value="revoke"]')
    assert.equal(await browser.eval("window.__daF02Posts"),1,
      "F-02 duplicate write guard must prevent a second HTTPS POST")
    await browser.click('#store-price-group-form button[value="read"]')
    await browser.wait("document.getElementById('store-price-group-status').textContent.includes('Önceki mağazadaki işlem')")
    assert.equal(await browser.eval(
      "priceGroupUncertain.size>0&&Array.from(priceGroupUncertain.values()).some(v=>v.outcomeUnverified===true)"),
      true,"A post-corruption GET alone cannot prove the original POST ended")
    await browser.eval("(()=>{"+
      "window.fetch=window.__daF02Fetch;delete window.__daF02Fetch;"+
      "return true})()")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),Number(groupAuditStart)+2,
      "Malformed browser reply, duplicate guard and read cannot create an extra audit")
    process.stdout.write("PASS B22 Chrome: F-02 native HTTPS/PG16 idempotent revoke, browser-only malformed 200 JSON remains uncertain; same-key POST blocked and authorized GET does not guess settlement; no extra audit\n")

    const catalogUrl=(org:string)=>"/personal/catalog?organization_id="+
      encodeURIComponent(org)
    const catalogAuditBefore=await q("select count(*)::int n from da_audit_event")
    const scopedCatalog=await get(catalogUrl(organizations[0].id))
    assert.equal(scopedCatalog.status,200,"Protected Buyer Owner sees approved Store product titles")
    assert.match(scopedCatalog.cache,/no-store/)
    assert.equal(scopedCatalog.robots,"noindex, nofollow, noarchive",
      "B22 HTTPS public ingress must not allow private catalogue SEO indexing")
    assert.equal(scopedCatalog.vary,"Cookie",
      "B22 HTTPS public ingress must preserve session-dependent cache partitioning")
    assert.equal(scopedCatalog.body.organization_id,organizations[0].id)
    assert.equal(scopedCatalog.body.prices_available,false)
    assert.equal(scopedCatalog.body.checkout_ready,false)
    assert.deepEqual(new Set(scopedCatalog.body.stores.map((x:any)=>x.id)),new Set(cartStoreIds),
      "Unlinked, pending or non-approved Stores must not enter a Buyer catalogue")
    for(const store of scopedCatalog.body.stores){
      assert.ok(store.products.some((item:any)=>item.product_id===sellableProduct.id&&
        item.title===sellableProduct.title&&
        offerRows.some(o=>o.id===item.offer_id&&o.seller_id===store.id)))
      const euroOnly=store.products.find((p:any)=>
        p.product_id===sellableProduct.id&&offerRows.some(o=>o.id===p.offer_id&&
          o.seller_id===store.id))
      assert.equal(euroOnly?.list_price_try,undefined,
        "Foreign Offer source cannot become an invented TRY price")
      const expectedTry=directTryOffers.find(o=>o.seller_id===store.id)
      assert.ok(expectedTry)
      const direct=store.products.find((p:any)=>
        p.product_id===tryProduct.id&&p.offer_id===expectedTry!.id)
      assert.deepEqual(direct?.list_price_try,{
        amount:expectedTry!.amount,currency_code:"try"
      },"Native Medusa PriceSet must select only the exact Seller Offer's TRY price")
      assert.equal(JSON.stringify(store).includes("calculated_price"),false)
      assert.equal(JSON.stringify(store).includes("inventory_quantity"),false)
    }
    const foreignCatalog=await get(catalogUrl(organizations[2].id))
    assert.equal(foreignCatalog.status,403,
      "Foreign Organization cannot be selected to read private catalogue")
    assert.match(foreignCatalog.cache,/no-store/)
    assert.equal(foreignCatalog.robots,"noindex, nofollow, noarchive",
      "Denied Buyer catalogue must not become indexable at public HTTPS")
    assert.equal(foreignCatalog.vary,"Cookie",
      "Denied Buyer catalogue must keep exact Vary at public HTTPS")
    assert.equal((await get(catalogUrl(organizations[0].id)+"&seller_id="+ownerStoreId)).status,400,
      "Browser cannot forge native Seller scope")
    assert.equal((await get(catalogUrl(organizations[0].id),
      {"x-seller-id":ownerStoreId})).status,400)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.click("#buyer-catalog-refresh")
    await browser.wait("!document.getElementById('buyer-catalog-panel').hidden && document.getElementById('buyer-catalog-items').children.length>=2")
    assert.equal(await browser.eval("document.getElementById('buyer-catalog-items').textContent.includes("+
      JSON.stringify(sellableProduct.title)+")"),true)
    assert.equal(await browser.eval("document.getElementById('buyer-catalog-items').textContent.includes('TRY referans liste fiyatı:')"),true,
      "Browser must label the native direct TRY price as a reference, not payable")
    // Real Chrome must render both a fractional TRY amount and another Store's
    // distinct integer price, bound to the right Store/Offer product label.
    // This checks the actual generated HTML and browser DOM (not a mocked unit).
    const displayedTryLines=await browser.eval(
      "Array.from(document.querySelectorAll('#buyer-catalog-items li'), li=>li.textContent)")
    assert.ok(Array.isArray(displayedTryLines))
    for(const store of scopedCatalog.body.stores){
      const expected=directTryOffers.find(o=>o.seller_id===store.id)
      assert.ok(expected,"Each approved Store must retain its own native Offer")
      const rows=displayedTryLines.filter((line:string)=>
        line.startsWith(store.name+" — "+tryProduct.title+" — TRY referans liste fiyatı: "))
      assert.equal(rows.length,1,"Chrome must show exactly this Store's TRY Offer")
      assert.ok(rows[0].includes(expected!.amount===1250.5?"1.250,50":"2.000,00"),
        "Chrome tr-TR DOM must show the correct fractional/integer TRY amount")
      assert.ok(rows[0].includes("(ödenecek tutar değil)"),
        "A list price must not be presented as payable")
    }
    assert.deepEqual(await q("select count(*)::int n from da_audit_event"),catalogAuditBefore,
      "Read-only Buyer catalogue cannot write canonical audit")
    process.stdout.write("PASS B22 Buyer catalogue: real Chrome HTTPS and PG16 two published Mercur Offers under approved Buyer Org, foreign and forged scopes 403/400, no private inventory leakage and no audit writes\n")
    process.stdout.write("PASS B22 native TRY Offer list price: two seller-scoped Medusa prices on a shared native variant, EUR-only excluded, browser reference display, no checkout\n")

    // B22 follow is a Buyer Organization-owned relationship (not a Person
    // wishlist, native Customer permission, group price or checkout grant).
    const followSeller=ownerStoreId,followBuyer=organizations[0].id
    assert.ok(scopedCatalog.body.stores.some((s:any)=>s.id===followSeller),
      "The followed native Store must be visible in the authorized catalogue")
    const followRowsBefore=await q(
      "select version from da_buyer_store_follow where buyer_organization_id=$1 and seller_id=$2",
      [followBuyer,followSeller])
    assert.deepEqual(followRowsBefore,[],"Fixture starts without an automatic follow")
    const followSelector="#buyer-catalog-items button[data-follow-seller-id='"+followSeller+"']"
    await browser.wait("Array.from(document.querySelectorAll('#buyer-catalog-items button'))"+
      ".some(b=>b.dataset.followSellerId==="+JSON.stringify(followSeller)+
      " && !b.disabled && b.textContent.includes('takip et'))")
    const foreignFollowGet=await reviewer.eval("(async()=>{"+
      "const r=await fetch('/personal/store-follows?organization_id="+
      encodeURIComponent(followBuyer)+"&seller_id="+encodeURIComponent(followSeller)+"');"+
      "return {status:r.status,body:await r.json()};})()")
    assert.equal(foreignFollowGet.status,403,"Another Person cannot inspect a foreign Buyer follow")
    const wrongCsrfFollow=await browser.eval("(async()=>{"+
      "const r=await fetch('/personal/store-follows',{method:'POST',"+
      "headers:{'content-type':'application/json'},"+
      "body:JSON.stringify({action:'follow',organization_id:"+JSON.stringify(followBuyer)+
      ",seller_id:"+JSON.stringify(followSeller)+",expected_version:0})});return r.status;})()")
    assert.equal(wrongCsrfFollow,403)
    await browser.click(followSelector)
    await browser.wait("Array.from(document.querySelectorAll('#buyer-catalog-items button'))"+
      ".some(b=>b.dataset.followSellerId==="+JSON.stringify(followSeller)+
      " && !b.disabled && b.textContent.includes('takipten çık'))")
    const followedRows=await q("select version,revoked_at,source_audit_event_id "+
      "from da_buyer_store_follow where buyer_organization_id=$1 and seller_id=$2",
      [followBuyer,followSeller])
    assert.equal(followedRows.length,1)
    assert.equal(followedRows[0].version,1)
    assert.equal(followedRows[0].revoked_at,null)
    const replayFollow=await browser.eval("(async()=>{"+
      "const s=await (await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/store-follows',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({action:'follow',organization_id:"+JSON.stringify(followBuyer)+
      ",seller_id:"+JSON.stringify(followSeller)+",expected_version:0})});return r.status;})()")
    assert.equal(replayFollow,409,"A stale follow cannot create a second audit or record")
    const foreignMutation=await reviewer.eval("(async()=>{"+
      "const s=await (await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/store-follows',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({action:'unfollow',organization_id:"+JSON.stringify(followBuyer)+
      ",seller_id:"+JSON.stringify(followSeller)+",expected_version:1})});return r.status;})()")
    assert.equal(foreignMutation,403)
    await browser.click(followSelector)
    await browser.wait("Array.from(document.querySelectorAll('#buyer-catalog-items button'))"+
      ".some(b=>b.dataset.followSellerId==="+JSON.stringify(followSeller)+
      " && !b.disabled && b.textContent.includes('takip et'))")
    const unfollowedRows=await q("select version,revoked_at from da_buyer_store_follow "+
      "where buyer_organization_id=$1 and seller_id=$2",[followBuyer,followSeller])
    assert.equal(unfollowedRows.length,1)
    assert.equal(unfollowedRows[0].version,2)
    assert.ok(unfollowedRows[0].revoked_at,"Unfollow retains the private history row")
    const followAudit=await q("select e.action from da_audit_event e "+
      "join da_audit_outbox o on o.source_audit_event_id=e.id "+
      "where e.organization_id=$1 and e.target_id=$2 and e.resource='buyer-store-follow' "+
      "order by e.occurred_at,e.id",[followBuyer,followSeller])
    assert.deepEqual(new Set(followAudit.map((x:any)=>x.action)),
      new Set(["organization.store_followed","organization.store_unfollowed"]))
    assert.equal(followAudit.length,2,"Follow and unfollow each require one canonical audit")
    assert.deepEqual(await q("select version from da_buyer_store_follow "+
      "where buyer_organization_id=$1 and seller_id=$2",[followBuyer,followSeller]),
      [{version:2}])
    process.stdout.write("PASS B22 Chrome: Buyer Organization Owner follows and unfollows approved Store; foreign/CSRF/replay denied, PG16 v1-v2 and two outboxed audits, no checkout\n")

    // Separate legal Seller Organization is part of the current entitlement,
    // not just the native Seller's open flag. Beta remains an active Buyer.
    // Test-only PG16 suspension/restoration never touches production.
    const betaPrivateCatalog=()=>reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(catalogUrl(organizations[1].id))})
      return {status:r.status,body:await r.json()}
    })()`)
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const betaCatalogBefore=await betaPrivateCatalog()
    assert.equal(betaCatalogBefore.status,200)
    assert.deepEqual(new Set(betaCatalogBefore.body.stores.map((s:any)=>s.id)),
      new Set(cartStoreIds),"Independent Buyer Beta can see two active legal Store offers")
    // An approved Store may disappear from the Buyer's catalogue while
    // its Buyer Organization follow remains. Use the real protected Beta
    // Owner UI to unfollow without a product or Seller catalog row.
    const betaFollowBuyer=organizations[1].id
    const betaFollowBefore=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/store-follows?organization_id='+
        ${JSON.stringify(organizations[1].id)}+'&seller_id='+
        ${JSON.stringify(ownerStoreId)})
      return {status:r.status,body:await r.json()}
    })()`)
    assert.equal(betaFollowBefore.status,200)
    assert.deepEqual(betaFollowBefore.body,{
      organization_id:betaFollowBuyer,seller_id:ownerStoreId,following:false,version:0
    })
    const betaFollow=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const r=await fetch('/personal/store-follows',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify({action:'follow',
          organization_id:${JSON.stringify(organizations[1].id)},
          seller_id:${JSON.stringify(ownerStoreId)},expected_version:0})})
      return {status:r.status,body:await r.json()}
    })()`)
    assert.equal(betaFollow.status,200)
    assert.equal(betaFollow.body.following,true)
    assert.equal(betaFollow.body.version,1)
    await q("update da_organization set status='suspended' where id=$1",
      [organizations[0].id])
    try{
      const deniedSuspendedSeller=await betaPrivateCatalog()
      assert.equal(deniedSuspendedSeller.status,200,
        "Suspended Seller must not close another active Buyer's own context")
      assert.equal(deniedSuspendedSeller.body.organization_id,organizations[1].id)
      assert.deepEqual(deniedSuspendedSeller.body.stores,[],
        "Every Store of a suspended seller legal Organization must disappear")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      await reviewer.click("#buyer-catalog-refresh")
      await reviewer.wait("!document.getElementById('buyer-catalog-panel').hidden&&"+
        "document.getElementById('buyer-catalog-items').children.length===0")
      await reviewer.click("#buyer-follow-refresh")
      await reviewer.wait("!document.getElementById('buyer-follow-panel').hidden&&"+
        "Array.from(document.querySelectorAll('#buyer-follow-items button'))"+
        ".some(b=>b.dataset.unfollowSellerId==="+JSON.stringify(ownerStoreId)+
        "&&!b.disabled)")
      const betaFollowList=await reviewer.eval(`(async()=>{
        const r=await fetch('/personal/store-follows?organization_id='+
          ${JSON.stringify(organizations[1].id)})
        return {status:r.status,body:await r.json()}
      })()`)
      assert.equal(betaFollowList.status,200)
      const nativeFollowSeller=(await native.listSellers({id:ownerStoreId}))[0]
      assert.ok(nativeFollowSeller?.name)
      assert.deepEqual(betaFollowList.body,{
        organization_id:betaFollowBuyer,
        stores:[{seller_id:ownerStoreId,version:1,
          name:nativeFollowSeller.name,handle:nativeFollowSeller.handle}],next_cursor:null
      })
      const followLabel=await reviewer.eval(
        "document.querySelector('#buyer-follow-items button').textContent")
      assert.ok(followLabel.includes(nativeFollowSeller.name),
        "Suspended native Seller name must remain recognizable in authorized Buyer follow list")
      assert.ok(!followLabel.includes(ownerStoreId),
        "Visible unfollow button must not show raw native Seller ID")
      await reviewer.click("#buyer-follow-items button[data-unfollow-seller-id='"+
        ownerStoreId+"']")
      await reviewer.wait("!document.getElementById('buyer-follow-panel').hidden&&"+
        "document.getElementById('buyer-follow-status').textContent.includes('bulunmuyor')")
      assert.deepEqual(await q("select version,revoked_at is not null as revoked "+
        "from da_buyer_store_follow where buyer_organization_id=$1 and seller_id=$2",
        [betaFollowBuyer,ownerStoreId]),[{version:2,revoked:true}],
        "Suspended Seller unfollow retains correct Buyer Organization history")
      const betaFollowAudit=await q(
        "select e.action from da_audit_event e "+
        "join da_audit_outbox o on o.source_audit_event_id=e.id "+
        "where e.organization_id=$1 and e.target_id=$2 and e.resource='buyer-store-follow' "+
        "order by e.occurred_at,e.id",[betaFollowBuyer,ownerStoreId])
      assert.deepEqual(new Set(betaFollowAudit.map((x:any)=>x.action)),
        new Set(["organization.store_followed","organization.store_unfollowed"]))
      assert.equal(betaFollowAudit.length,2)
      process.stdout.write("PASS B22 Chrome: active Beta Owner follows Store then unfollows after Seller Organization suspension removes all catalogue rows; selected Buyer-only list, PG16 v2 and two audits/outboxes, no checkout\n")
    }finally{
      await q("update da_organization set status='active' where id=$1",
        [organizations[0].id])
    }
    const betaRestored=await betaPrivateCatalog()
    assert.equal(betaRestored.status,200)
    assert.deepEqual(new Set(betaRestored.body.stores.map((s:any)=>s.id)),
      new Set(cartStoreIds),"Active legal Seller origin can restore only approved Stores")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    process.stdout.write("PASS B22 suspended Seller Organization: real PG16 legal Owner status hides both approved Offers from active Buyer Beta; reactivation restores, no buyer bypass\n")
    // Use a task-only sales channel and region for native cart pricing.
    const sales=container.resolve("sales_channel")
    const market=await sales.createSalesChannels({name:"B22 two-Store channel "+rand})
    await cartService.updateCarts(customerCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    for(const offer of offerRows){
      await addToCartWorkflow(container).run({input:{
        cart_id:customerCart.id,items:[{
          variant_id:offer.variant_id,offer_id:offer.id,
          quantity:1,requires_shipping:true,metadata:{offer_id:offer.id}
        } as any] // Mercur's installed Offer augmentation is runtime-registered.
        // The downstream Medusa DTO alone lacks this Mercur-specific field.
      }})
    }
    const nativeTwoStore=await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })
    assert.equal(nativeTwoStore.items?.length,2)
    assert.equal(nativeTwoStore.customer_id,nativeCustomer.id)
    assert.equal(nativeTwoStore.completed_at,null)
    const query=container.resolve("query")
    const {data:graphTwoStore}=await query.graph({entity:"cart",fields:[
      "id","items.id","items.offer.id","items.offer.seller_id"
    ],filters:{id:customerCart.id}})
    assert.equal(graphTwoStore.length,1)
    assert.equal(graphTwoStore[0].items.length,2)
    assert.deepEqual(
      new Set(graphTwoStore[0].items.map((line:any)=>line.offer?.seller_id)),
      new Set(cartStoreIds)
    )
    assert.deepEqual(
      new Set(graphTwoStore[0].items.map((line:any)=>line.offer?.id)),
      new Set(offerRows.map(o=>o.id))
    )
    const twoStoreScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(twoStoreScope.status,200)
    assert.deepEqual(twoStoreScope.body,{
      organization_id:organizations[0].id,status:"seller_scope_mapped",
      seller_count:2,seller_block_verified:true,checkout_ready:false
    })
    assert.equal((await readNativeCart(buyerCart(organizations[1].id,
      customerCart.id)+"&seller_scope=inspect")).status,403)
    // B22 #76: strong Foundation Owner A has the actual platform-approved
    // Store association. B is only Alpha buyer/member and cannot issue Store
    // policy. Native Member/SellerMember alone is not the issuer grant.
    const changeStoreBlock=async(action:"block"|"unblock")=>browser.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const r=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify({action,organization_id:organizations[0].id,
          seller_id:ownerStoreId,buyer_organization_id:organizations[0].id})})
      })
      return {status:r.status,body:await r.json()}
    })()`)
    // Native Chrome Owner control, not merely an HTTP request through CDP.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.send("Page.reload",{ignoreCache:true})
    await browser.wait("!document.getElementById('workspace').hidden")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('store-block-panel').hidden")
    await browser.eval(`document.querySelector('#store-block-form select[name=seller_id]').value=${JSON.stringify(ownerStoreId)}`)
    await browser.input('#store-block-form input[name=buyer_organization_id]',
      organizations[0].id)
    await browser.click('#store-block-form button[value="block"]')
    await browser.wait("document.getElementById('store-block-status').textContent.includes('engellendi')")
    assert.ok(browser.http.some((x:any)=>x.path==="/personal/store-buyer-blocks"&&
      x.method==="POST"&&x.status===200),"Owner's visible policy form must POST 200")
    assert.equal((await changeStoreBlock("block")).status,200,
      "Replay must not write another active block")
    const blockedCatalog=await get(catalogUrl(organizations[0].id))
    assert.equal(blockedCatalog.status,200)
    assert.equal(blockedCatalog.body.stores.some((x:any)=>x.id===ownerStoreId),false,
      "Store block must hide its offers from exactly this Buyer Organization")
    assert.equal(blockedCatalog.body.stores.some((x:any)=>x.id===secondOwnerStoreId),true,
      "Another Store must retain its independent Buyer visibility")
    // Admin of the other Organization cannot use the same native member
    // association to manage Alpha's Store, nor can SellerMember alone.
    const wrongOwner=await browser.eval(`(async()=>{
      const token=(await(await fetch('/personal/session')).json()).csrf_token
      const r=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':token},
        body:JSON.stringify(${JSON.stringify({action:"block",
          organization_id:organizations[1].id,seller_id:ownerStoreId,
          buyer_organization_id:organizations[0].id})})
      });return r.status
    })()`)
    assert.equal(wrongOwner,403)
    const noBlockCsrf=await browser.eval(`(async()=>{
      const r=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(${JSON.stringify({action:"unblock",
          organization_id:organizations[0].id,seller_id:ownerStoreId,
          buyer_organization_id:organizations[0].id})})
      });return r.status
    })()`)
    assert.equal(noBlockCsrf,403)
    assert.equal((await q(`select count(*)::int n from da_store_buyer_organization_block
      where seller_id=$1 and buyer_organization_id=$2 and revoked_at is null`,
      [ownerStoreId,organizations[0].id]))[0].n,1)
    const blockedScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(blockedScope.status,403)
    assert.deepEqual(blockedScope.body,{message:"Access denied"})
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A Store Buyer Organization block committed before L must deny checkout")
    assert.equal((await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })).items?.length,2)
    await browser.click('#store-block-form button[value="unblock"]')
    await browser.wait("document.getElementById('store-block-status').textContent.includes('kaldırıldı')")
    assert.equal((await changeStoreBlock("unblock")).status,200,
      "Replay must not erase revocation history")
    assert.equal((await q(`select count(*)::int n from da_store_buyer_organization_block
      where seller_id=$1 and buyer_organization_id=$2 and revoked_at is null`,
      [ownerStoreId,organizations[0].id]))[0].n,0)
    assert.deepEqual((await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")).body,
      twoStoreScope.body)
    const restoredCatalog=await get(catalogUrl(organizations[0].id))
    assert.equal(restoredCatalog.status,200)
    assert.equal(restoredCatalog.body.stores.some((x:any)=>x.id===ownerStoreId),true,
      "Unblock restores only this Store's read access; no checkout activation")
    // Each Store has an independent Buyer Organization policy. B-only block
    // must never be read as an Alpha global organization suspension.
    const changeSecondBlock=async(action:"block"|"unblock")=>browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          action,organization_id:organizations[0].id,
          seller_id:secondOwnerStoreId,
          buyer_organization_id:organizations[0].id
        })})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    assert.equal((await changeSecondBlock("block")).status,200)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,1)
    const onlySecondBlocked=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(onlySecondBlocked.status,403)
    assert.deepEqual(onlySecondBlocked.body,{message:"Access denied"})
    // Unblocking A must not undo B's block. Re-block A, then unblock it
    // independently while B stays active: full scope remains denied.
    assert.equal((await changeStoreBlock("block")).status,200)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,2)
    assert.equal((await changeStoreBlock("unblock")).status,200)
    assert.equal((await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")).status,403)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,1)
    assert.equal((await changeSecondBlock("unblock")).status,200)
    const allUnblocked=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(allUnblocked.status,200)
    assert.deepEqual(allUnblocked.body,twoStoreScope.body)
    assert.equal(allUnblocked.body.seller_block_verified,true)
    // The single Foundation decision is positive only for the exact immutable
    // Alpha attribution, verified Customer and both currently unblocked Stores.
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),true,"B22 final checkout snapshot must allow the exact current legal Buyer scope")

    // A current grant and active membership do not revive a disabled or
    // soft-deleted canonical Person. Exercise both guards against real PG16.
    await q("update da_person set disabled_at=clock_timestamp() where id=$1",[B.person])
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A disabled canonical Person must be denied at checkout L")
    await q("update da_person set disabled_at=null where id=$1",[B.person])
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),true,"Re-enabled synthetic Person restores only its otherwise-current valid scope")

    await q("update da_person set deleted_at=clock_timestamp() where id=$1",[B.person])
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A soft-deleted canonical Person must be denied at checkout L")
    await q("update da_person set deleted_at=null where id=$1",[B.person])
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),true,"Restored synthetic Person still requires the same live grant and Store scope")

    assert.equal(await foundation.authorizeBuyerCheckout(
      foreignCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A foreign native Cart has no Alpha legal attribution")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,foreignNativeCustomer.id,cartStoreIds
    ),false,"A different native Customer cannot borrow the immutable attribution")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,[...cartStoreIds,"sel_missing_checkout"]
    ),false,"Every native Offer Seller must have a matching approved Organization origin")
    assert.equal((await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })).items?.length,2)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is not null`,
      [organizations[0].id]))[0].n,3,
      "Both independent Store block revocation histories must persist")
    process.stdout.write("PASS B22 two platform-approved Stores: each Store's buyer block separately denies whole multi-Store scope; unblock A cannot lift B; both unblocked restores 200, no cart writes\n")
    process.stdout.write("PASS B22 audited Owner Store Buyer Organization block: two-Store scope 403 if one blocked, idempotent unblock restores 200; no checkout\n")

    const completedOrder=await createB22CompletedSourceOrderFixture({
      container,rand,sourceSellerId:secondOwnerStoreId,
      productCreatorSellerId:stores[0].id,memberId:member.id,
      shippingProfileId:b22Profile.id,customerId:nativeCustomer.id,
      regionId:region.id,salesChannelId:market.id,buyerOrgId:organizations[0].id,
      q,query,claim:cartId=>claimCart(organizations[0].id,cartId),
      authorize:cartId=>foundation.authorizeBuyerCheckout(
        cartId,nativeCustomer.id,[secondOwnerStoreId])
    })

    await verifyOwnerTemporaryPauseBrowser({browser,organizations,ownerStoreId,
      secondOwnerStoreId,nativeCustomer,customerCart,cartStoreIds,container,
      foundation,cartService,q,get,catalogUrl})
    await verifyOwnerClosingBrowser({browser,reviewer,coOwnerPersonId:B.person,
      organizations,ownerStoreId,secondOwnerStoreId,nativeCustomer,
      customerCart,cartStoreIds,foundation,cartService,q,get,catalogUrl})
    // One native Seller suspended means NO partially authorized two-Store
    // scope. The native workflow restores the task's prior approved state.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:secondOwnerStoreId,reason:"B22 task-only cart Seller suspension negative"
    }})
    assert.equal((await native.listSellers({id:secondOwnerStoreId}))[0].status,"suspended")
    const suspendedScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(suspendedScope.status,403)
    assert.deepEqual(suspendedScope.body,{message:"Access denied"})
    assert.equal((await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })).items?.length,2,"Suspension must not silently mutate cart")
    await unsuspendSellerWorkflow(container).run({input:{seller_id:secondOwnerStoreId}})
    const restoredScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(restoredScope.status,200)
    assert.deepEqual(restoredScope.body,twoStoreScope.body)
    // Later historical fixtures expect only the original Owner Store
    // enabled. Retain the second Store's audited link and history, but
    // suspend only this disposable native Store before old list assertions.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:secondOwnerStoreId,
      reason:"B22 task-only second Store isolated from later fixture"
    }})
    process.stdout.write("PASS B22 native Seller suspension: one Store suspends -> entire two-Store scope 403, native reopen -> 200; no checkout\\n")
    process.stdout.write("PASS B22 real two-Store Offer Cart: native Mercur Offers and Medusa addToCartWorkflow persist 2 separate Seller links; Chrome read-only scope counts 2 with both Store origin links verified and checkout closed\\n")


    process.stdout.write("PASS B22 audited Buyer Organization Cart attribution: real Chrome POST + Foundation PG16 audit/outbox, exact replay, foreign Customer/Organization denied, no Medusa cart mutation or checkout\\n")

    const wrongCustomerOrg=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(sellerGamma.id))})
      return r.status
    })()`)
    assert.equal(wrongCustomerOrg,403)
    const forgedCustomer=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id)+"&customer_id=cus_foreign")})
      return r.status
    })()`)
    assert.equal(forgedCustomer,400)
    // Dual-proof linking updates the active privacy epoch. If the Organization
    // workspace was concealed, restore it via a real Chrome navigation and
    // server-validated Organization selection. Never fake document.hidden.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    if(!await reviewer.eval("!document.getElementById('workspace').hidden && !document.getElementById('buyer-context-panel').hidden")){
      await reviewer.send("Page.reload",{ignoreCache:true})
      await reviewer.wait("document.getElementById('workspace').hidden===false")
      await reviewer.select(organizations[0].name,"member")
      await reviewer.wait("!document.getElementById('buyer-context-panel').hidden")
    }
    await reviewer.click('#buyer-customer-check')
    await reviewer.wait("document.getElementById('buyer-customer-status').textContent.includes('Kuruluş izni ve mevcut müşteri bağınız doğrulandı')")
    process.stdout.write("PASS B22 linked Customer profile reload and buyer Organization privacy-safe UI check\\n")
    assert.equal((await q(`select count(*)::int n from da_verified_actor_binding
      where person_id=$1 and actor_type='customer' and revoked_at is null`,
      [B.person]))[0].n,1)
    process.stdout.write("PASS B22 Chrome: native Customer dual-proof, Alpha Member grant and independent Beta Owner eligibility; forged Customer 400, immutable Buyer attribution\\n")
    // B is Alpha Member with a scoped explicit grant and independently Beta
    // protected Owner. Both may be eligible; an attributed Cart cannot switch.
    const verifiedBuyer=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[0].id)}')
      return {status:r.status,body:await r.json()}
    })()`)
    assert.equal(verifiedBuyer.status,200)
    assert.deepEqual(verifiedBuyer.body,{
      organization_id:organizations[0].id,
      status:"buyer_permission_verified",checkout_ready:false
    })
    const wrongBuyer=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[1].id)}')
      return r.status
    })()`)
    assert.equal(wrongBuyer,200,
      "Protected Beta Owner has inherent buyer eligibility without any explicit grant")

    // Even when B explicitly gains buyer.purchase in TWO Organizations, the
    // same native Cart cannot be silently reassigned from Alpha to Beta.
    // This tests the unique immutable attribution, not only missing permission.
    const ownBetaMembership=memberships[1]
    const betaPermission=async(action:"grant"|"revoke")=>reviewer.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const r=await fetch('/personal/buyer-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          action,organization_id:organizations[1].id,
          membership_id:ownBetaMembership.id
        })})
      });return {status:r.status,body:await r.json()}
    })()`)
    assert.equal((await betaPermission("grant")).status,200)
    const betaCartEligible=await readNativeCart(buyerCart(organizations[1].id,customerCart.id))
    assert.equal(betaCartEligible.status,200)
    assert.equal(betaCartEligible.body.organization_attributed,false,
      "Native Customer is valid for Beta, but Alpha's attribution must remain exclusive")
    assert.equal((await claimCart(organizations[1].id,customerCart.id)).status,403,
      "Authorized Beta buyer cannot steal Cart already attributed to Alpha")
    const unchangedCart=await q(`select organization_id,source_audit_event_id
      from da_buyer_cart_attribution where cart_id=$1`,[customerCart.id])
    assert.equal(unchangedCart.length,1)
    assert.equal(unchangedCart[0].organization_id,organizations[0].id)
    assert.equal(unchangedCart[0].source_audit_event_id,attributed.source_audit_event_id)

    // B22 cross-Organization commercial scope: independent seller companies
    // Alpha and Gamma, third independent legal Buyer Beta. Person A is a
    // real protected Owner of BOTH seller Orgs via separate memberships.
    // B is Beta Owner and the same dual-proof Customer, without a separate
    // buyer login or any automatic buyer.purchase permission.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    // The same signed-in Owner's workspace can be stale after prior
    // dual-proof/Buyer switches. Refresh the real Chrome document at most
    // once, without spoofing session, Person or Organization membership.
    const gammaButtonReady="!document.getElementById('workspace').hidden && "+
      "Array.from(document.querySelectorAll('#organizations button')).some("+
      "b=>b.textContent==="+JSON.stringify(sellerGamma.name+" — owner")+")"
    if(!await browser.eval(gammaButtonReady)){
      await browser.send("Page.reload",{ignoreCache:true})
    }
    // A still-missing real membership or expired session must fail closed.
    try{
      await browser.wait(gammaButtonReady)
    }catch{
      const state=await browser.callFunction(
        "function(){return {workspace:!document.getElementById('workspace')?.hidden,"+
        "login:!document.getElementById('login')?.hidden,"+
        "challenge:!document.getElementById('challenge')?.hidden,"+
        "organizations:document.querySelectorAll('#organizations button').length}}")
      const recent=browser.http.filter((x:any)=>
        x.path==="/personal/organizations"||x.path==="/personal/session")
        .slice(-5).map((x:any)=>({path:x.path,status:x.status}))
      throw new Error("Gamma Staff/Owner selection unavailable: "+
        JSON.stringify({state,recent}))
    }
    await browser.select(sellerGamma.name,"owner")
    const gammaApplication={
      organization_id:sellerGamma.id,
      application_id:"daapp_"+randomBytes(16).toString("hex"),
      name:"B22 Gamma Store "+rand,
      email:"b22-gamma-store-"+rand+"@example.invalid",currency_code:"try"
    }
    const gammaSubmitted=await submit(gammaApplication)
    assert.equal(gammaSubmitted.status,201)
    // Person A is a genuine Owner of Alpha and Gamma. A second distinct
    // Organization cannot acquire Alpha's reserved name even when its
    // own new Store application would otherwise be authorized.
    const crossOrgName=await submit({...gammaApplication,
      application_id:"daapp_"+randomBytes(16).toString("hex"),
      email:"b22-gamma-name-collision-"+rand+"@example.invalid",
      name:applicationName.toUpperCase()})
    assert.equal(crossOrgName.status,409,
      "Global Store name reservation applies across legal Organizations")
    assert.equal((await q(`select count(*)::int n from da_store_application
      where organization_id=$1`,[sellerGamma.id]))[0].n,1,
      "Name conflict may not create another Gamma application")
    process.stdout.write("PASS B22 Chrome/PG16: separate legal Organization Owner cannot reuse Alpha normalized Store name; Gamma original Seller retained\n")
    const gammaSellerId=gammaSubmitted.body.seller_id as string
    assert.match(gammaSellerId,/^sel_[A-Za-z0-9_-]+$/)
    assert.notEqual(gammaSellerId,ownerStoreId)
    assert.equal((await native.listSellers({id:gammaSellerId}))[0].status,
      "pending_approval")
    const gammaLink=await q(`select o.organization_id,e.action,x.id as outbox_id
      from da_organization_seller_ownership o
      join da_audit_event e on e.id=o.verification_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where o.seller_id=$1 and o.revoked_at is null`,[gammaSellerId])
    assert.equal(gammaLink.length,1)
    assert.equal(gammaLink[0].organization_id,sellerGamma.id)
    assert.equal(gammaLink[0].action,"organization.store_application_created")
    assert.deepEqual((await get(selected(sellerGamma.id))).body.stores,[],
      "Gamma Store must be denied before separate platform approval")
    const wrongGammaApproval=await browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      return (await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          application_id:gammaApplication.application_id,
          seller_id:gammaSellerId
        })})
      })).status
    })()`)
    assert.equal(wrongGammaApproval,403,
      "Gamma Owner cannot grant themselves the platform approver task")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const gammaApproved=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          application_id:gammaApplication.application_id,
          seller_id:gammaSellerId
        })})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(gammaApproved.status,200)
    assert.equal(gammaApproved.body.status,"open")
    assert.equal((await native.listSellers({id:gammaSellerId}))[0].status,"open")
    assert.equal((await get(selected(sellerGamma.id))).body.stores[0].id,
      gammaSellerId)
    const alphaAfterGamma=(await get(selected(organizations[0].id))).body.stores
    assert.deepEqual(alphaAfterGamma.map((store:any)=>store.id),
      [ownerStoreId],
      "Gamma must not enter Alpha; previously suspended second Alpha Store stays excluded")
    assert.equal(alphaAfterGamma.some((store:any)=>store.id===gammaSellerId),false)

    await preparePreviouslyRenamedStoreForTransfer({
      owner:browser,reviewer,organizationId:organizations[0].id,
      organizationName:organizations[0].name,sellerId:secondOwnerStoreId,
      rand,container,q
    })
    const transferAssignment=await verifyB22TransferredRecovery({
      owner:browser,reviewer,q,query,completedOrder,
      cartId:customerCart.id,customerId:nativeCustomer.id,
      source:{application_id:secondApplicationId,seller_id:secondOwnerStoreId,
        organization_id:organizations[0].id},
      target:{application_id:gammaApplication.application_id,seller_id:gammaSellerId,
        organization_id:sellerGamma.id},
      targetExpectedName:gammaApplication.name,
      targetOrganizationName:sellerGamma.name,
      competitorOrganizationName:organizations[0].name,
      competitor:{seller_id:ownerStoreId,
        organization_id:organizations[0].id},
      renameAndReopen:()=>verifySuspendedStoreRenameBeforeReopen(
        browser,reviewer,organizations[0].id,organizations[0].name,
        secondOwnerStoreId,rand+"-b",container,q,true),
      restoreFixture:async()=>suspendSellerWorkflow(container).run({input:{
        seller_id:secondOwnerStoreId,reason:"Task-only Store isolated after name recovery"
      }})
    })

    await verifyConcurrentCrossOrganizationStoreNames(
      browser,organizations[0].id,sellerGamma.id,rand,q)

    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    await verifyOwnerStoreRenameRequest(
      browser,reviewer,organizations[0].id,sellerGamma.id,ownerStoreId,A.person,rand,q)
    // Gamma is a separate already-approved task-only Seller, so this race
    // does not overwrite Alpha's earlier UI-submitted pending request.
    await browser.select(sellerGamma.name,"owner")
    await browser.wait("!document.getElementById('store-rename-panel').hidden && "+
      "Array.from(document.getElementById('store-rename-form').elements.namedItem('seller_id').options).some(o=>o.value==="+
      JSON.stringify(gammaSellerId)+")")
    await verifyConcurrentOwnerStoreRenameRequests(
      browser,sellerGamma.id,gammaSellerId,A.person,rand,q)
    await verifyPlatformStoreRenameApproval(
      browser,reviewer,sellerGamma.id,gammaSellerId,q)
    await verifyStaffReopensSuspendedStore(
      browser,reviewer,sellerGamma.id,sellerGamma.name,gammaSellerId,container,q)
    await verifySuspendedStoreRenameBeforeReopen(
      browser,reviewer,sellerGamma.id,sellerGamma.name,gammaSellerId,rand,container,q)
    await browser.select(organizations[0].name,"owner")
    const gammaSku="B22-GAMMA-BETA-"+rand
    const {result:[gammaOffer]}=await createOffersWorkflow(container).run({
      input:{offers:[{
        seller_id:gammaSellerId,created_by:member.id,
        sku:gammaSku,variant_id:secondaryVariant.id,
        shipping_profile_id:b22Profile.id,
        inventory_items:[{sku:gammaSku,stock_levels:[]}],
        prices:[{amount:1200,currency_code:"eur"}],
        manage_inventory:false,allow_backorder:true
      }]}
    })
    assert.equal(gammaOffer.seller_id,gammaSellerId)
    const betaTwoSellerCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(betaTwoSellerCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    // Two Stores, two variants. Mercur 2.4.1 rejects competing Offers
    // for the SAME variant within one Cart; retain that native protection.
    for(const offer of [offerRows[0],
      {id:gammaOffer.id,variant_id:secondaryVariant.id}]){
      await addToCartWorkflow(container).run({input:{
        cart_id:betaTwoSellerCart.id,
        items:[{variant_id:offer.variant_id,offer_id:offer.id,
          quantity:1,requires_shipping:true,
          metadata:{offer_id:offer.id}} as any]
      }})
    }
    const betaNative=await cartService.retrieveCart(betaTwoSellerCart.id,{
      relations:["items"]
    })
    assert.equal(betaNative.items?.length,2)
    assert.equal(betaNative.customer_id,nativeCustomer.id)
    assert.equal(betaNative.completed_at,null)
    const {data:betaGraph}=await query.graph({
      entity:"cart",fields:["id","items.id","items.offer.id",
        "items.offer.seller_id"],
      filters:{id:betaTwoSellerCart.id}
    })
    assert.equal(betaGraph.length,1)
    assert.deepEqual(new Set(betaGraph[0].items.map((line:any)=>
      line.offer?.seller_id)),new Set([ownerStoreId,gammaSellerId]))
    const betaClaim=await claimCart(organizations[1].id,betaTwoSellerCart.id)
    assert.equal(betaClaim.status,200)
    assert.equal(betaClaim.body.organization_id,organizations[1].id)
    assert.equal(betaClaim.body.checkout_ready,false)
    const betaAttribution=await q(`select a.organization_id,e.action,
      x.id as outbox_id from da_buyer_cart_attribution a
      join da_audit_event e on e.id=a.source_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where a.cart_id=$1`,[betaTwoSellerCart.id])
    assert.equal(betaAttribution.length,1)
    assert.equal(betaAttribution[0].organization_id,organizations[1].id)
    assert.equal(betaAttribution[0].action,"organization.buyer_cart_attributed")
    const alphaPreflight=await readNativeCart(
      buyerCart(organizations[0].id,betaTwoSellerCart.id))
    assert.equal(alphaPreflight.status,200,
      "Native Customer preflight is not a Cart ownership or checkout grant")
    assert.equal(alphaPreflight.body.organization_attributed,false)
    assert.equal((await readNativeCart(
      buyerCart(organizations[0].id,betaTwoSellerCart.id)+
      "&seller_scope=inspect")).status,403,
      "Explicit Alpha buyer grant cannot inspect Beta's attributed Seller Cart")
    const betaScopeUrl=buyerCart(organizations[1].id,betaTwoSellerCart.id)+
      "&seller_scope=inspect"
    const betaOpenScope=await readNativeCart(betaScopeUrl)
    assert.equal(betaOpenScope.status,200)
    assert.deepEqual(betaOpenScope.body,{
      organization_id:organizations[1].id,status:"seller_scope_mapped",
      seller_count:2,seller_block_verified:true,checkout_ready:false
    })
    // B22 native checkout ingress boundary: Mercur 2.3.7 overrides
    // POST /store/carts/:id/complete with its split-order writer. Before
    // any financial/provider or order flow is authorized, the existing
    // personal ingress must reject this native route, even for a valid
    // signed-in Buyer, a Store Owner and a forged native Bearer.
    // No payment session is created; a nonzero two-Offer Cart remains open.
    const nativeCompletePath="/store/carts/"+
      encodeURIComponent(betaTwoSellerCart.id)+"/complete"
    // Without an API key, Medusa rejects the request before the DoğruAdres
    // ingress can run. Use its supported native workflow and a disposable
    // test-only publishable key to prove the INNER security boundary too.
    const {result:[b22PublishableKey]}=await createApiKeysWorkflow(container).run({
      input:{api_keys:[{title:"B22 isolated native checkout denial "+rand,
        type:"publishable",created_by:""}]}
    })
    assert.equal(typeof b22PublishableKey.id,"string")
    assert.equal(typeof b22PublishableKey.token,"string")
    assert.ok(b22PublishableKey.token.length>20)
    await linkSalesChannelsToApiKeyWorkflow(container).run({input:{
      id:b22PublishableKey.id,add:[market.id]
    }})
    // Medusa's API Key module distinguishes the internal apk_ ID from the
    // public pk_ token used in the Store HTTP header. Never log the token.
    await verifyRealNextStorefrontRenameUrls(container,
      process.env.DOGRUADRES_PRIVATE_API!,b22PublishableKey.token,
      gammaSellerId,temp,q)
    // The new withdrawal test has its own audit/state writes. Run it only
    // AFTER the previously accepted isolated Next HTTP proof so its fixture
    // cannot affect the unchanged old/new Seller URL acceptance.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(sellerGamma.name,"owner")
    await browser.wait("!document.getElementById('store-rename-panel').hidden")
    await verifyOwnerWithdrawPendingStoreRename(
      browser,reviewer,sellerGamma.id,gammaSellerId,A.person,rand,q)
    // Existing Gamma first/second rename, old/new URL and withdrawal tests
    // have now finished; only now consume B's exceptional native name right.
    // Preserve all earlier first-rename and concurrent request tests before
    // B acquires the transferred native name in this same disposable DB.
    await verifyAssignedRecipientUse({owner:browser,reviewer,q,
      source:{application_id:secondApplicationId,seller_id:secondOwnerStoreId,
        organization_id:organizations[0].id},
      target:{application_id:gammaApplication.application_id,seller_id:gammaSellerId,
        organization_id:sellerGamma.id},
      competitor:{seller_id:ownerStoreId,organization_id:organizations[0].id},
      targetOrganizationName:sellerGamma.name,
      competitorOrganizationName:organizations[0].name,
      ...transferAssignment,sourceVacated:true})
    await verifyTwoIndependentStaffNameRightRace({
      owner:browser,reviewer,reviewerPersonId:B.person,origin:host,ca:crt,
      rand,organizationName:sellerGamma.name,organizationId:sellerGamma.id,
      target:{application_id:applicationId,seller_id:ownerStoreId,
        organization_id:organizations[0].id},
      users,auth,foundation,browsers,q,
      suspend:async seller_id=>{await suspendSellerWorkflow(container).run({
        input:{seller_id,reason:"B22 isolated simultaneous Staff name-right decision"}
      })}
    })
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    const keyHeaders={"x-publishable-api-key":b22PublishableKey.token}
    assert.equal((await q(`select count(*)::int n from order_group
      where cart_id=$1`,[betaTwoSellerCart.id]))[0].n,0)
    const tryNativeCompletion=async(actor:B06Chrome,
      additionalHeaders:Record<string,string>={})=>actor.eval(`(async()=>{
      const response=await fetch(${JSON.stringify(nativeCompletePath)},{
        method:"POST",headers:${JSON.stringify(additionalHeaders)}
      })
      return {status:response.status,body:await response.json()}
    })()`)
    const missingKey=await tryNativeCompletion(reviewer)
    assert.equal(missingKey.status,400,
      "No-key request should fail Medusa's publishable-key preflight")
    assert.equal(missingKey.body?.type,"not_allowed")
    assert.match(missingKey.body?.message??"",/Publishable API key required/)
    for(const actor of [reviewer,browser]){
      const denied=await tryNativeCompletion(actor,keyHeaders)
      assert.equal(denied.status,401,
        "Native checkout with valid Store key returned "+denied.status+
        "; body="+JSON.stringify(denied.body).slice(0,380)+
        "; only the personal ingress denial proves checkout is closed")
      assert.deepEqual(denied.body,{
        message:"Personal session ingress required"
      })
    }
    const forgedNative=await tryNativeCompletion(reviewer,{
      ...keyHeaders,authorization:"Bearer b22-untrusted-not-a-token"
    })
    assert.equal(forgedNative.status,401,
      "An unverified native credential cannot enter the order writer")
    assert.deepEqual(forgedNative.body,{
      message:"Personal session ingress required"
    })
    assert.equal((await q(`select count(*)::int n from order_group
      where cart_id=$1`,[betaTwoSellerCart.id]))[0].n,0,
      "No OrderGroup is created by a denied checkout attempt")
    const afterDenied=await cartService.retrieveCart(betaTwoSellerCart.id,{
      relations:["items"]
    })
    assert.equal(afterDenied.completed_at,null)
    assert.equal(afterDenied.items?.length,2)
    assert.equal((await readNativeCart(betaScopeUrl)).status,200,
      "A denied native checkout must not damage valid read-only Buyer scope")
    process.stdout.write("PASS B22 Mercur native split-order POST ingress: real Buyer/Owner/forged Bearer 401, zero OrderGroups, unchanged two-item Cart; no payment or checkout writer\\n")

    // Mercur 2.3.7 processPaymentWorkflow can capture BEFORE the split-order
    // validate hook. Verify the active native HTTP callback boundary itself
    // (not only the public frontdoor), without a provider session or money.
    const callbackPath="/hooks/payment/pp_system_default"
    const callbackOrigin="http://127.0.0.1:"+nativePort
    for(const authorization of [undefined,"Bearer b22-untrusted-not-a-token"]){
      const callbackResponse=await fetch(callbackOrigin+callbackPath,{
        method:"POST",headers:{"content-type":"application/json",
          ...(authorization?{authorization}:{})},
        body:JSON.stringify({b22_disposable_probe:true}),
        signal:AbortSignal.timeout(15000)
      })
      assert.equal(callbackResponse.status,403,
        "Native payment callback must fail closed before provider/workflow dispatch")
      assert.deepEqual(await callbackResponse.json(),
        {message:"Payment callback is not enabled"})
    }
    const chromeCallback=await reviewer.eval(`(async()=>{
      const response=await fetch('/hooks/payment/pp_system_default',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({b22_disposable_probe:true})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(chromeCallback.status,403,
      "Signed-in Chrome must not enable the native payment callback")
    assert.deepEqual(chromeCallback.body,
      {message:"Payment callback is not enabled"})
    assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
      [betaTwoSellerCart.id]))[0].n,0,
      "Denied callback cannot create an OrderGroup")
    const {data:callbackPaymentLinks}=await query.graph({
      entity:"cart_payment_collection",fields:["payment_collection_id"],
      filters:{cart_id:betaTwoSellerCart.id}
    })
    assert.equal(callbackPaymentLinks.length,0,
      "Denied callback cannot attach a Cart payment collection")
    assert.equal((await cartService.retrieveCart(betaTwoSellerCart.id)).completed_at,
      null,"Denied callback must preserve the native open Cart")
    process.stdout.write("\nPASS B22 Chrome: native private HTTP and signed-in HTTPS payment callbacks return 403; Cart open, zero OrderGroup and payment links; no provider/capture\n")


    const betaSellerBlock=async(action:"block"|"unblock",
      sellerOrg:string,sellerId:string)=>browser.eval(`(async()=>{
        const session=await(await fetch('/personal/session')).json()
        const response=await fetch('/personal/store-buyer-blocks',{
          method:'POST',headers:{'content-type':'application/json',
            'x-csrf-token':session.csrf_token},
          body:JSON.stringify(${JSON.stringify({
            action,organization_id:sellerOrg,seller_id:sellerId,
            buyer_organization_id:organizations[1].id
          })})
        })
        return {status:response.status,body:await response.json()}
      })()`)
    assert.equal((await betaSellerBlock("block",organizations[0].id,
      gammaSellerId)).status,403,
      "Alpha Owner scope cannot issue Gamma Store's policy")
    const wrongBetaIssuer=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      return (await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          action:"block",organization_id:sellerGamma.id,
          seller_id:gammaSellerId,
          buyer_organization_id:organizations[1].id
        })})
      })).status
    })()`)
    assert.equal(wrongBetaIssuer,403,
      "Buyer Organization Owner and staff may not control Gamma Seller policy")
    const activeBetaBlocks=async()=>{
      const [row]=await q(`select count(*)::int n
        from da_store_buyer_organization_block
        where buyer_organization_id=$1 and revoked_at is null`,
        [organizations[1].id])
      return row.n as number
    }
    assert.equal(await activeBetaBlocks(),0)
    assert.equal((await betaSellerBlock("block",organizations[0].id,
      ownerStoreId)).status,200)
    assert.equal(await activeBetaBlocks(),1)
    assert.equal((await readNativeCart(betaScopeUrl)).status,403)
    // Alpha's earlier two-Store cart has its second Seller deliberately
    // suspended. Its native Customer/Organization ownership preflight still
    // works; do NOT expect sellable Seller scope from a suspended Store.
    const alphaBuyerPreflight=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id))
    assert.equal(alphaBuyerPreflight.status,200)
    assert.equal(alphaBuyerPreflight.body.organization_attributed,true)
    assert.equal((await q(`select count(*)::int n from
      da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,0,
      "Beta-only Store policy must not create a block on Buyer Alpha")
    assert.equal((await betaSellerBlock("block",sellerGamma.id,
      gammaSellerId)).status,200)
    assert.equal(await activeBetaBlocks(),2)
    assert.equal((await betaSellerBlock("unblock",organizations[0].id,
      ownerStoreId)).status,200)
    assert.equal(await activeBetaBlocks(),1)
    assert.equal((await readNativeCart(betaScopeUrl)).status,403,
      "Gamma Store's Beta block survives Alpha Store's independent unblock")
    assert.equal((await betaSellerBlock("unblock",sellerGamma.id,
      gammaSellerId)).status,200)
    assert.equal(await activeBetaBlocks(),0)
    assert.deepEqual((await readNativeCart(betaScopeUrl)).body,
      betaOpenScope.body)
    assert.equal((await cartService.retrieveCart(betaTwoSellerCart.id,{
      relations:["items"]
    })).items?.length,2,
      "No partial Cart mutation across separate seller companies")
    const [history]=await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is not null`,
      [organizations[1].id])
    assert.equal(history.n,2)
    assert.equal((await q(`select organization_id from
      da_buyer_cart_attribution where cart_id=$1`,
      [betaTwoSellerCart.id]))[0].organization_id,organizations[1].id)
    process.stdout.write("PASS B22 Alpha/Gamma separate legal Seller Organizations and Beta legal Buyer: two native Offers/Cart, two platform-approved Owner-origin links, wrong issuer 403, each Store block denies full scope, cross-Buyer isolation, independent unblock and audit history, checkout closed\\n")
    // Prepare a real, fully authorized Beta cart against Gamma while Beta buyer.purchase is still active.
    // The same cart will be completed only after the subsequent real Owner revocation.
    const hookProbeSku="B22-HOOK-REVOKED-GRANT-"+rand
    const {result:[hookProbeOffer]}=await createOffersWorkflow(container).run({
      input:{offers:[{
        seller_id:gammaSellerId,created_by:member.id,sku:hookProbeSku,
        variant_id:variant.id,shipping_profile_id:b22Profile.id,
        inventory_items:[{sku:hookProbeSku,stock_levels:[]}],
        prices:[{amount:0,currency_code:"eur"}],
        manage_inventory:false,allow_backorder:true
      }]}
    })
    assert.match(hookProbeOffer.id,/^offer_[A-Za-z0-9_-]+$/)
    assert.equal(hookProbeOffer.seller_id,gammaSellerId)
    const hookProbeSeller=await native.listSellers({id:gammaSellerId})
    assert.equal(hookProbeSeller.length,1)
    assert.equal(hookProbeSeller[0].status,"open")
    assert.ok(hookProbeSeller[0].approved_at)
    const hookProbeCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(hookProbeCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:hookProbeCart.id,
      items:[{variant_id:variant.id,offer_id:hookProbeOffer.id,quantity:1,
        requires_shipping:true,metadata:{offer_id:hookProbeOffer.id}} as any]
    }})
    const {data:hookProbeBefore}=await query.graph({
      entity:"cart",fields:["id","total","completed_at","customer.id",
        "items.id","items.offer.id","items.offer.seller_id"],
      filters:{id:hookProbeCart.id}
    })
    assert.equal(hookProbeBefore.length,1)
    assert.equal(hookProbeBefore[0].customer?.id,nativeCustomer.id)
    assert.equal(Number(hookProbeBefore[0].total),0)
    assert.equal(hookProbeBefore[0].completed_at,null)
    assert.equal(hookProbeBefore[0].items.length,1)
    assert.equal(hookProbeBefore[0].items[0].offer?.id,hookProbeOffer.id)
    assert.equal(hookProbeBefore[0].items[0].offer?.seller_id,gammaSellerId)
    const hookProbeClaim=await claimCart(organizations[1].id,hookProbeCart.id)
    assert.equal(hookProbeClaim.status,200)
    assert.equal(hookProbeClaim.body.organization_id,organizations[1].id)
    assert.equal(hookProbeClaim.body.checkout_ready,false)
    const hookProbeAttribution=await q(`select a.person_id,a.customer_id,a.organization_id,
      e.action,x.id as outbox_id from da_buyer_cart_attribution a
      join da_audit_event e on e.id=a.source_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where a.cart_id=$1`,[hookProbeCart.id])
    assert.equal(hookProbeAttribution.length,1)
    assert.equal(hookProbeAttribution[0].person_id,B.person)
    assert.equal(hookProbeAttribution[0].customer_id,nativeCustomer.id)
    assert.equal(hookProbeAttribution[0].organization_id,organizations[1].id)
    assert.equal(hookProbeAttribution[0].action,"organization.buyer_cart_attributed")
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Before revocation L must allow the exact attributed Beta→Gamma cart")
    // On THIS disposable Medusa/PG16 execution only, narrow the trusted
    // default Owner role policy, without altering Member grants or DB data.
    // HTTP and final one-statement checkout L must both deny the same
    // otherwise-eligible Cart; the old policy is restored in finally.
    const priorBuyerOwnerActions=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="products.edit"
      const narrowed=await readNativeCart(buyerCart(organizations[1].id,hookProbeCart.id))
      assert.equal(narrowed.status,200,"Protected Owner purchase cannot be narrowed by deployment")
      assert.equal(await foundation.authorizeBuyerCheckout(
        hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
      ),true,"Final checkout L retains fixed protected Owner entitlement")
      assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
        [hookProbeCart.id]))[0].n,0)
    }finally{
      if(priorBuyerOwnerActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=priorBuyerOwnerActions
    }
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Restored approved role default must allow the same attributed Cart")
    process.stdout.write("PASS B22 Owner role policy: fixed buyer.purchase keeps eligible HTTPS and PG16 checkout L despite legacy setting; zero OrderGroup\n")
    process.stdout.write("PASS B22 pre-revocation control: real Customer + immutable Beta Cart attribution + approved Gamma Store + active buyer.purchase passes Foundation L; zero-value Cart remains open\n")
    // A real Owner's Store-specific Buyer Organization block must deny the
    // native Mercur completion at L, not only the read-only Seller scope.
    // Restore only this task-owned block before the separate permission race.
    const gammaBlock=await betaSellerBlock("block",sellerGamma.id,gammaSellerId)
    assert.equal(gammaBlock.status,200,"Gamma Owner Store block via authenticated Chrome")
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),false,"Store Buyer Organization block committed before L must deny")
    const storeBlockRun=await completeCartWithSplitOrdersWorkflow(container).run({
      input:{cart_id:hookProbeCart.id},throwOnError:false
    })
    const storeBlockError=(storeBlockRun.errors??[]).map((entry:any)=>
      String(entry.error?.message??entry.error??entry.message??"")).join("\n")
    assert.match(storeBlockError,/B22_CHECKOUT_AUTHORIZATION_DENIED/,
      "Native Mercur validate must reject blocked Buyer before OrderGroup creation")
    assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
      [hookProbeCart.id]))[0].n,0)
    const {data:blockOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],filters:{cart_id:hookProbeCart.id}
    })
    const {data:blockPaymentLinks}=await query.graph({
      entity:"cart_payment_collection",fields:["payment_collection_id"],
      filters:{cart_id:hookProbeCart.id}
    })
    assert.equal(blockOrderLinks.length,0)
    assert.equal(blockPaymentLinks.length,0)
    assert.equal((await cartService.retrieveCart(hookProbeCart.id)).completed_at,
      null,"Blocked Store cannot complete previously valid Cart")
    assert.equal((await betaSellerBlock("unblock",sellerGamma.id,gammaSellerId)).status,200)
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Unblock restores L eligibility only while buyer.purchase remains valid")
    process.stdout.write("\nPASS B22 real Mercur validate: real Chrome Gamma Store Buyer block denies attributed Beta Cart before OrderGroup/Order/payment writes; unblock restores L without completing Cart\n")

    // Positive native split-order proof ONLY inside this pre-authorized
    // disposable CI database. Zero-value, non-shipping, no provider or payment
    // collection. Do not expose the native checkout writer to a visitor.
    const zeroOrderCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(zeroOrderCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:zeroOrderCart.id,
      items:[{variant_id:variant.id,offer_id:hookProbeOffer.id,
        quantity:1,requires_shipping:false,
        metadata:{offer_id:hookProbeOffer.id}} as any]
    }})
    const {data:zeroCartBefore}=await query.graph({
      entity:"cart",fields:["id","total","completed_at","customer.id",
        "items.id","items.requires_shipping","items.offer.id",
        "items.offer.seller_id"],
      filters:{id:zeroOrderCart.id}
    })
    assert.equal(zeroCartBefore.length,1)
    assert.equal(Number(zeroCartBefore[0].total),0)
    assert.equal(zeroCartBefore[0].completed_at,null)
    assert.equal(zeroCartBefore[0].customer?.id,nativeCustomer.id)
    assert.equal(zeroCartBefore[0].items.length,1)
    assert.equal(zeroCartBefore[0].items[0].requires_shipping,false,
      "Task-only no-shipping Cart cannot silently require shipping")
    assert.equal(zeroCartBefore[0].items[0].offer?.id,hookProbeOffer.id)
    assert.equal(zeroCartBefore[0].items[0].offer?.seller_id,gammaSellerId)
    const zeroClaim=await claimCart(organizations[1].id,zeroOrderCart.id)
    assert.equal(zeroClaim.status,200)
    assert.equal(zeroClaim.body.checkout_ready,false,
      "This internal proof never authorizes visitor checkout")
    assert.equal(await foundation.authorizeBuyerCheckout(
      zeroOrderCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Real Foundation L must authorize the positive synthetic Cart")
    const zeroGroupResult=await completeCartWithSplitOrdersWorkflow(container).run({
      input:{cart_id:zeroOrderCart.id},throwOnError:false
    })
    assert.equal(zeroGroupResult.errors?.length??0,0,
      "Native split-order must complete the authorized zero-total Cart")
    const zeroOrderGroupId=zeroGroupResult.result?.order_group_id
    assert.equal(typeof zeroOrderGroupId,"string")
    const zeroGroupRows=await q("select id from order_group where cart_id=$1",
      [zeroOrderCart.id])
    assert.equal(zeroGroupRows.length,1)
    assert.equal(zeroGroupRows[0].id,zeroOrderGroupId)
    const {data:zeroOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],
      filters:{cart_id:zeroOrderCart.id}
    })
    assert.equal(zeroOrderLinks.length,1,
      "One approved Gamma Seller creates exactly one native Order")
    assert.match(zeroOrderLinks[0].order_id,/^order_[A-Za-z0-9_-]+$/)
    const {data:zeroPaymentLinks}=await query.graph({
      entity:"cart_payment_collection",fields:["payment_collection_id"],
      filters:{cart_id:zeroOrderCart.id}
    })
    assert.equal(zeroPaymentLinks.length,0,
      "Zero-total proof must not create payment collection or capture")
    const completedZeroCart=await cartService.retrieveCart(zeroOrderCart.id)
    assert.ok(completedZeroCart.completed_at,
      "Native Cart completion must persist after successful OrderGroup")
    assert.equal(completedZeroCart.customer_id,nativeCustomer.id)
    const zeroAttribution=await q("select organization_id,customer_id from da_buyer_cart_attribution where cart_id=$1",
      [zeroOrderCart.id])
    assert.equal(zeroAttribution.length,1)
    assert.equal(zeroAttribution[0].organization_id,organizations[1].id)
    assert.equal(zeroAttribution[0].customer_id,nativeCustomer.id)
    process.stdout.write("PASS B22 Chrome: authorized zero-value native Mercur split-order persisted one OrderGroup/Order and completed Cart with immutable Beta attribution; no payment or visitor checkout\\n")

    // Reuse this one already completed, attributed zero-amount OrderGroup.
    // New historical-reader acceptance performs only HTTPS GET and real
    // Chrome keyboard navigation; no second checkout, capture or SQL write.
    await verifyB22OwnedHistoricalOrder({
      buyer:reviewer,buyerOrg:{id:organizations[1].id,name:organizations[1].name},
      orderGroupId:zeroOrderGroupId as string,cartId:zeroOrderCart.id,
      nativeCustomerId:nativeCustomer.id,q
    })
    // Native Medusa system provider is an in-memory simulator. All writes
    // are in this preauthorized random disposable CI database; no external
    // payment, HTTP checkout route, provider configuration or payout.
    const paymentService=container.resolve("payment")
    const systemProviders=await paymentService.listPaymentProviders({
      id:"pp_system_default",is_enabled:true
    })
    assert.equal(systemProviders.length,1,
      "Only the built-in system simulator is allowed in this acceptance")
    await updateRegionsWorkflow(container).run({input:{
      selector:{id:region.id},
      update:{payment_providers:["pp_system_default"]}
    }})
    const paidCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(paidCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:paidCart.id,
      items:[{variant_id:secondaryVariant.id,offer_id:gammaOffer.id,
        quantity:1,requires_shipping:false,
        metadata:{offer_id:gammaOffer.id}} as any]
    }})
    const {data:[paidCartGraph]}=await query.graph({
      entity:"cart",fields:["id","total","completed_at","customer.id",
        "items.id","items.requires_shipping","items.offer.id",
        "items.offer.seller_id"],filters:{id:paidCart.id}
    })
    assert.ok(Number(paidCartGraph.total)>0,"Simulator must exercise payable Cart")
    assert.equal(paidCartGraph.completed_at,null)
    assert.equal(paidCartGraph.customer?.id,nativeCustomer.id)
    assert.equal(paidCartGraph.items.length,1)
    assert.equal(paidCartGraph.items[0].requires_shipping,false)
    assert.equal(paidCartGraph.items[0].offer?.seller_id,gammaSellerId)
    const paidClaim=await claimCart(organizations[1].id,paidCart.id)
    assert.equal(paidClaim.status,200)
    assert.equal(paidClaim.body.checkout_ready,false,
      "No visitor checkout authority is granted by the simulator")
    assert.equal(await foundation.authorizeBuyerCheckout(
      paidCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Payable Cart must pass the real fresh Foundation decision")
    const {result:payCollection}=await createPaymentCollectionForCartWorkflow(
      container).run({input:{cart_id:paidCart.id}})
    assert.ok(payCollection.id)
    const {result:paySession}=await createPaymentSessionsWorkflow(
      container).run({input:{
        payment_collection_id:payCollection.id,
        provider_id:"pp_system_default"
      }})
    assert.equal(paySession.provider_id,"pp_system_default")
    const simulatedAuthorization=await paymentService.authorizePaymentSession(
      paySession.id,{})
    assert.ok(simulatedAuthorization?.id,
      "Existing payment module must produce pre-order authorization")
    const authorizedSession=await paymentService.retrievePaymentSession(
      paySession.id,{relations:["payment","payment.captures"]}
    )
    assert.equal(authorizedSession.status,"authorized")
    assert.equal(authorizedSession.payment?.id,simulatedAuthorization.id)
    assert.equal(authorizedSession.payment?.captures?.length??0,0,
      "Authorization must not automatically capture before B22 L")
    const payableOrderRun=await completeCartWithSplitOrdersWorkflow(
      container).run({input:{cart_id:paidCart.id},throwOnError:false})
    assert.equal(payableOrderRun.errors?.length??0,0,
      "Native Mercur must accept an already-authorized simulated session")
    const payableGroups=await q(
      "select id from order_group where cart_id=$1",[paidCart.id])
    assert.equal(payableGroups.length,1)
    assert.equal(payableGroups[0].id,payableOrderRun.result?.order_group_id)
    const {data:payableOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],filters:{cart_id:paidCart.id}
    })
    assert.equal(payableOrderLinks.length,1)
    const beforeCapture=await paymentService.retrievePayment(
      simulatedAuthorization.id,{relations:["captures"]}
    )
    assert.equal(beforeCapture.captures?.length??0,0,
      "Native order acceptance must precede any simulated capture")
    assert.ok((await cartService.retrieveCart(paidCart.id)).completed_at,
      "Payable Cart must be completed before capture")
    const {result:capturedSimulation}=await capturePaymentWorkflow(
      container).run({input:{payment_id:simulatedAuthorization.id}})
    assert.equal(capturedSimulation.id,simulatedAuthorization.id)
    const afterCapture=await paymentService.retrievePayment(
      simulatedAuthorization.id,{relations:["captures"]}
    )
    assert.equal(afterCapture.captures?.length,1,
      "Only one system-provider capture is recorded after Order")
    assert.ok(afterCapture.captured_at)
    const paidAttribution=await q(
      "select organization_id,customer_id from da_buyer_cart_attribution where cart_id=$1",
      [paidCart.id])
    assert.equal(paidAttribution.length,1)
    assert.equal(paidAttribution[0].organization_id,organizations[1].id)
    assert.equal(paidAttribution[0].customer_id,nativeCustomer.id)
    process.stdout.write("\nPASS B22 native payment simulation: system provider authorized before L/order; native Mercur persisted single OrderGroup/Order; only then system capture recorded; no external payment, callback or visitor checkout\n")

    // Mercur stores the split-cart workflow with idempotent:false. Prove that
    // another native invocation cannot create a second order or charge an
    // already-completed Cart. This is serial retry, not concurrent callback
    // replay; the simulated provider has no external financial side effect.
    const replayCompletedPaidCart=await completeCartWithSplitOrdersWorkflow(
      container).run({input:{cart_id:paidCart.id},throwOnError:false})
    const replayCompletedErrors=(replayCompletedPaidCart.errors??[]).map(
      (entry:any)=>String(entry.error?.message??entry.error??entry.message??"")
    ).join("\n")
    assert.match(replayCompletedErrors,/B22_CHECKOUT_AUTHORIZATION_DENIED/,
      "Completed Cart must be rejected by the native B22 validate hook")
    const repeatedGroups=await q(
      "select id from order_group where cart_id=$1",[paidCart.id])
    assert.equal(repeatedGroups.length,1,"Completed Cart replay cannot add Group")
    assert.equal(repeatedGroups[0].id,payableGroups[0].id)
    const {data:repeatedOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],filters:{cart_id:paidCart.id}
    })
    assert.equal(repeatedOrderLinks.length,1,
      "Completed Cart replay cannot add a duplicate native Order")
    assert.equal(repeatedOrderLinks[0].order_id,payableOrderLinks[0].order_id)
    const replayedPayment=await paymentService.retrievePayment(
      simulatedAuthorization.id,{relations:["captures"]}
    )
    assert.equal(replayedPayment.captures?.length,1,
      "Completed Cart retry must leave exactly one prior capture")
    assert.equal(replayedPayment.captured_at?.valueOf(),
      afterCapture.captured_at?.valueOf())
    assert.ok((await cartService.retrieveCart(paidCart.id)).completed_at)
    process.stdout.write("\nPASS B22 native completed Cart retry: second Mercur split-order invocation denied; original OrderGroup/Order and single system-provider capture unchanged\n")


    // Pre-authorized but NOT capturable: the real Chrome Gamma Owner blocks
    // Beta before Mercur's L. The system provider has no external effects.
    // This is the paid-cart negative counterpart of the positive sequence.
    const deniedPaidCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(deniedPaidCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:deniedPaidCart.id,
      items:[{variant_id:secondaryVariant.id,offer_id:gammaOffer.id,
        quantity:1,requires_shipping:false,
        metadata:{offer_id:gammaOffer.id}} as any]
    }})
    const {data:[deniedPaidGraph]}=await query.graph({
      entity:"cart",fields:["id","total","customer.id","items.id",
        "items.offer.seller_id"],filters:{id:deniedPaidCart.id}
    })
    assert.ok(Number(deniedPaidGraph.total)>0)
    assert.equal(deniedPaidGraph.customer?.id,nativeCustomer.id)
    assert.equal(deniedPaidGraph.items.length,1)
    assert.equal(deniedPaidGraph.items[0].offer?.seller_id,gammaSellerId)
    const deniedPaidClaim=await claimCart(organizations[1].id,deniedPaidCart.id)
    assert.equal(deniedPaidClaim.status,200)
    assert.equal(deniedPaidClaim.body.checkout_ready,false)
    assert.equal(await foundation.authorizeBuyerCheckout(
      deniedPaidCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Paid-cart negative control must start with valid L")
    const {result:deniedPaymentCollection}=
      await createPaymentCollectionForCartWorkflow(container).run({
        input:{cart_id:deniedPaidCart.id}
      })
    const {result:deniedPaymentSession}=
      await createPaymentSessionsWorkflow(container).run({input:{
        payment_collection_id:deniedPaymentCollection.id,
        provider_id:"pp_system_default"
      }})
    const deniedAuthorization=await paymentService.authorizePaymentSession(
      deniedPaymentSession.id,{})
    assert.ok(deniedAuthorization?.id)
    assert.equal((await paymentService.retrievePayment(
      deniedAuthorization.id,{relations:["captures"]}
    )).captures?.length??0,0)
    assert.equal((await betaSellerBlock("block",sellerGamma.id,gammaSellerId)).status,200)
    try{
      assert.equal(await foundation.authorizeBuyerCheckout(
        deniedPaidCart.id,nativeCustomer.id,[gammaSellerId]
      ),false,"Owner Store block committed before L must reject authorized Cart")
      const rejectedPaidRun=await completeCartWithSplitOrdersWorkflow(
        container).run({input:{cart_id:deniedPaidCart.id},throwOnError:false})
      const rejectedPaidMessage=(rejectedPaidRun.errors??[]).map((entry:any)=>
        String(entry.error?.message??entry.error??entry.message??"")).join("\n")
      assert.match(rejectedPaidMessage,/B22_CHECKOUT_AUTHORIZATION_DENIED/,
        "Native Mercur L must reject a pre-authorized blocked Buyer")
      assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
        [deniedPaidCart.id]))[0].n,0)
      const {data:deniedOrderLinks}=await query.graph({
        entity:"order_cart",fields:["order_id"],filters:{cart_id:deniedPaidCart.id}
      })
      assert.equal(deniedOrderLinks.length,0)
      const unchangedPayment=await paymentService.retrievePayment(
        deniedAuthorization.id,{relations:["captures"]}
      )
      assert.equal(unchangedPayment.captures?.length??0,0,
        "No capture before or after failed B22 native checkout")
      assert.equal(unchangedPayment.captured_at??null,null)
      assert.equal((await cartService.retrieveCart(deniedPaidCart.id)).completed_at,
        null,"Failed paid Cart must remain open")
      const deniedAttribution=await q(
        "select organization_id,customer_id from da_buyer_cart_attribution where cart_id=$1",
        [deniedPaidCart.id])
      assert.equal(deniedAttribution.length,1)
      assert.equal(deniedAttribution[0].organization_id,organizations[1].id)
      assert.equal(deniedAttribution[0].customer_id,nativeCustomer.id)
    }finally{
      assert.equal((await betaSellerBlock("unblock",sellerGamma.id,gammaSellerId)).status,200)
    }
    process.stdout.write("\nPASS B22 native payment denial: pre-authorized system-provider Cart blocked by real Store Owner before L; Mercur rejected with zero OrderGroup/Order/capture and preserved immutable Buyer attribution\n")

    // POST-L cutoff: the native Mercur order-group INSERT can be paused by
    // a task-owned PostgreSQL SHARE table lock without blocking earlier
    // SELECTs. A WAITING RowExclusiveLock proves validate/L has finished.
    // Real Chrome Owner commits Store block during that pause; checkout
    // must finish because the Product Owner's L cutoff was already crossed.
    // Zero-value cart only; no payment session, capture, provider or payout.
    const postLCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(postLCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:postLCart.id,
      items:[{variant_id:variant.id,offer_id:hookProbeOffer.id,
        quantity:1,requires_shipping:false,
        metadata:{offer_id:hookProbeOffer.id}} as any]
    }})
    const {data:[postLGraph]}=await query.graph({
      entity:"cart",fields:["id","total","customer.id","completed_at",
        "items.id","items.offer.seller_id"],filters:{id:postLCart.id}
    })
    assert.equal(Number(postLGraph.total),0)
    assert.equal(postLGraph.customer?.id,nativeCustomer.id)
    assert.equal(postLGraph.completed_at,null)
    assert.equal(postLGraph.items.length,1)
    assert.equal(postLGraph.items[0].offer?.seller_id,gammaSellerId)
    const postLClaim=await claimCart(organizations[1].id,postLCart.id)
    assert.equal(postLClaim.status,200)
    assert.equal(postLClaim.body.checkout_ready,false)
    assert.equal(await foundation.authorizeBuyerCheckout(
      postLCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Post-L cutoff control must start with a valid Buyer")
    const postLBarrier=new Client({connectionString:u.toString()})
    await postLBarrier.connect()
    let postLBarrierHeld=false
    let postLStoreBlocked=false
    let pendingPostLCheckout:Promise<{run?:any;error?:string}>|undefined
    try{
      await postLBarrier.query("BEGIN")
      postLBarrierHeld=true
      const postLBarrierPid=(await postLBarrier.query(
        "select pg_backend_pid()::int as pid"
      )).rows[0].pid as number
      await postLBarrier.query("LOCK TABLE order_group IN SHARE MODE")
      pendingPostLCheckout=completeCartWithSplitOrdersWorkflow(
        container).run({input:{cart_id:postLCart.id},throwOnError:false}).then(
          (run:any)=>({run}),(error:unknown)=>({error:String(error)})
        )
      await until(async()=>{
        const rows=await q(`select count(*)::int n from pg_locks l
          where l.locktype='relation' and l.relation='order_group'::regclass
            and l.mode='RowExclusiveLock' and l.granted=false
            and l.pid<>$1`,[postLBarrierPid])
        return rows[0].n===1
      },19000,"B22 native OrderGroup INSERT waits AFTER real validate L")
      assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
        [postLCart.id]))[0].n,0,
        "Paused post-L workflow must not yet have an OrderGroup")
      const postLBlock=await betaSellerBlock("block",sellerGamma.id,gammaSellerId)
      assert.equal(postLBlock.status,200,"Real Chrome Owner block after L")
      postLStoreBlocked=true
      assert.equal(await foundation.authorizeBuyerCheckout(
        postLCart.id,nativeCustomer.id,[gammaSellerId]
      ),false,"Next L must see the later committed Store block")
      await postLBarrier.query("ROLLBACK")
      postLBarrierHeld=false
      const completedPostL=await pendingPostLCheckout
      assert.equal(completedPostL.error,undefined)
      assert.equal(completedPostL.run?.errors?.length??0,0,
        "Native checkout already past L must not be retroactively denied")
      const postLGroups=await q("select id from order_group where cart_id=$1",
        [postLCart.id])
      assert.equal(postLGroups.length,1)
      assert.equal(postLGroups[0].id,completedPostL.run?.result?.order_group_id)
      const {data:postLOrderLinks}=await query.graph({
        entity:"order_cart",fields:["order_id"],filters:{cart_id:postLCart.id}
      })
      assert.equal(postLOrderLinks.length,1)
      assert.ok((await cartService.retrieveCart(postLCart.id)).completed_at)
      const {data:postLPaymentLinks}=await query.graph({
        entity:"cart_payment_collection",fields:["payment_collection_id"],
        filters:{cart_id:postLCart.id}
      })
      assert.equal(postLPaymentLinks.length,0,
        "Post-L zero-value checkout must not create a payment collection")
      const postLAttribution=await q(
        "select organization_id,customer_id from da_buyer_cart_attribution where cart_id=$1",
        [postLCart.id])
      assert.equal(postLAttribution.length,1)
      assert.equal(postLAttribution[0].organization_id,organizations[1].id)
      assert.equal(postLAttribution[0].customer_id,nativeCustomer.id)
    }finally{
      if(postLBarrierHeld)await postLBarrier.query("ROLLBACK")
      await postLBarrier.end()
      if(pendingPostLCheckout)await pendingPostLCheckout
      if(postLStoreBlocked)
        assert.equal((await betaSellerBlock("unblock",sellerGamma.id,gammaSellerId)).status,200)
    }
    process.stdout.write("\nPASS B22 post-L cutoff: native OrderGroup INSERT waited after validate L, real Chrome Store block committed during wait; checkout persisted one OrderGroup/Order with unchanged Buyer and zero payment; later L denied\n")

    // Native Mercur already acquires a per-Cart lock and checks the existing
    // OrderGroup. Two independent workflow invocations must not create two
    // orders even when the first is demonstrably past L and waiting to INSERT.
    // Only task-owned zero-total Cart/PG16 are used; no provider or capture.
    const concurrentCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(concurrentCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:concurrentCart.id,
      items:[{variant_id:variant.id,offer_id:hookProbeOffer.id,
        quantity:1,requires_shipping:false,
        metadata:{offer_id:hookProbeOffer.id}} as any]
    }})
    const {data:[concurrentCartGraph]}=await query.graph({
      entity:"cart",fields:["id","total","completed_at","customer.id",
        "items.id","items.offer.seller_id"],filters:{id:concurrentCart.id}
    })
    assert.equal(Number(concurrentCartGraph.total),0)
    assert.equal(concurrentCartGraph.completed_at,null)
    assert.equal(concurrentCartGraph.customer?.id,nativeCustomer.id)
    assert.equal(concurrentCartGraph.items.length,1)
    assert.equal(concurrentCartGraph.items[0].offer?.seller_id,gammaSellerId)
    const concurrentClaim=await claimCart(organizations[1].id,concurrentCart.id)
    assert.equal(concurrentClaim.status,200)
    assert.equal(concurrentClaim.body.checkout_ready,false)
    assert.equal(await foundation.authorizeBuyerCheckout(
      concurrentCart.id,nativeCustomer.id,[gammaSellerId]
    ),true)
    assert.equal(process.env.DOGRUADRES_B22_PG_LOCK_TEST,"true")
    const locking=container.resolve("locking")
    const probeKey="b22-pg-lock-probe:"+rand
    await locking.acquire(probeKey)
    assert.equal((await q("select count(*)::int n from locking where id=$1",
      [probeKey]))[0].n,1,"Native Medusa must use persisted Postgres locking")
    assert.equal(await locking.release(probeKey),true)
    assert.equal((await q("select count(*)::int n from locking where id=$1",
      [probeKey]))[0].n,0,"Task-only provider probe lock must be released")
    // The installed official PG provider persists acquire() locks in a table.
    // Test a short *expired* task-owned key, without a Cart, real worker crash,
    // or protected data. Expiry must not be mistaken for automatic recovery.
    const expiredProbeKey="b22-pg-expiry-probe:"+rand
    await locking.acquire(expiredProbeKey,{expire:1})
    try{
      const activeProbe=await q(
        "select owner_id,expiration>now() as active from locking where id=$1",
        [expiredProbeKey])
      assert.equal(activeProbe.length,1)
      assert.equal(activeProbe[0].owner_id,null)
      assert.equal(activeProbe[0].active,true)
      await until(async()=>{
        const expired=await q(
          "select expiration<=now() as expired from locking where id=$1",
          [expiredProbeKey])
        return expired.length===1 && expired[0].expired===true
      },5000,"B22 task-owned PostgreSQL lock TTL expiration")
      let attemptedReacquire=false
      try{
        await locking.acquire(expiredProbeKey,{expire:1})
        attemptedReacquire=true
      }catch(error){
        assert.match(String(error),/Failed to acquire lock/i,
          "Official Postgres provider must report expired-row conflict")
      }
      assert.equal(attemptedReacquire,false,
        "An expired provider row cannot currently be reacquired automatically")
      assert.equal((await q("select count(*)::int n from locking where id=$1",
        [expiredProbeKey]))[0].n,1,
        "Expired provider row persists without an explicit release")
    }finally{
      // In Medusa 2.21.2 release() deletes an expired row but returns false
      // because its TTL has elapsed. Verify actual deletion below instead.
      assert.equal(await locking.release(expiredProbeKey),false,
        "Expired scoped lock release reports elapsed lease")
    }
    assert.equal((await q("select count(*)::int n from locking where id=$1",
      [expiredProbeKey]))[0].n,0,
      "Only the task-owned expired probe row is deleted")
    process.stdout.write("\nPASS B22 PostgreSQL expired lock behavior: task-owned one-second lock remained after expiration and rejected reacquisition; only explicit scoped release cleared it; crash recovery is NOT proven\n")
    // Independent native Medusa process exits abnormally after acquire().
    // Never terminate a host process, protected worker or Cart transaction.
    const abandonedKey="b22-pg-process-exit:"+rand
    const exitedProvider=spawnSync("bun",[
      "run","medusa","exec","./integration-tests/postgres/b22-store-ui.exec.ts"
    ],{
      cwd:process.cwd(),env:{...process.env,B22_ABRUPT_LOCK_TEST_KEY:abandonedKey},
      encoding:"utf8",timeout:45000,maxBuffer:1024*1024,stdio:["ignore","pipe","pipe"]
    })
    assert.ok(!exitedProvider.error && exitedProvider.status===86 &&
      String(exitedProvider.stdout??"").includes("B22_TASK_PROVIDER_LOCK_BEFORE_ABRUPT_EXIT"),
      "Independent disposable Medusa provider must acquire and exit 86; logs retained only in memory")
    try{
      assert.equal((await q("select count(*)::int n from locking where id=$1",
        [abandonedKey]))[0].n,1,"Exited provider left exact task-owned lock row")
      await until(async()=>{
        const row=await q("select expiration<=now() as expired from locking where id=$1",
          [abandonedKey])
        return row.length===1 && row[0].expired===true
      },5000,"B22 expired provider lock after abrupt process exit")
      let recovered=false
      try{
        await locking.acquire(abandonedKey,{expire:1})
        recovered=true
      }catch(error){
        assert.match(String(error),/Failed to acquire lock/i)
      }
      assert.equal(recovered,false,"Expired lock may not be assumed recoverable")
      assert.equal((await q("select count(*)::int n from locking where id=$1",
        [abandonedKey]))[0].n,1)
    }finally{
      // No Cart key and no global releaseAll: exact synthetic probe key only.
      await locking.release(abandonedKey)
    }
    assert.equal((await q("select count(*)::int n from locking where id=$1",
      [abandonedKey]))[0].n,0,"Synthetic lock cleanup scoped by exact key")
    process.stdout.write("\nOBSERVED B22 abrupt Medusa process exit: expired provider lock persists and rejects reacquisition; exact task-only cleanup; checkout recovery BLOCKED\n")
    // Only installed official Redis is tested: two isolated native processes,
    // no real Cart, order, payment, or production service.
    const redisKey="b22-redis-process-exit:"+rand
    const redisEnv:NodeJS.ProcessEnv={
      ...process.env,
      DOGRUADRES_B22_PG_LOCK_TEST:"false",
      DOGRUADRES_B22_REDIS_LOCK_TEST:"true",
      LOCKING_REDIS_URL:"redis://127.0.0.1:6379",
      B22_REDIS_PROBE_KEY:redisKey,
    }
    const cmd=["run","medusa","exec","./integration-tests/postgres/b22-store-ui.exec.ts"]
    const firstRedis=spawnSync("bun",cmd,{
      cwd:process.cwd(),env:{...redisEnv,B22_REDIS_PROBE_MODE:"crash"},
      encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:45000,maxBuffer:1024*1024
    })
    assert.ok(!firstRedis.error&&firstRedis.status===86&&
      String(firstRedis.stdout??"").includes("B22_REDIS_NATIVE_LOCK_BEFORE_EXIT"),
      "B22 disposable Redis lock acquire and abrupt exit required")
    const secondRedis=spawnSync("bun",cmd,{
      cwd:process.cwd(),env:{...redisEnv,B22_REDIS_PROBE_MODE:"recover"},
      encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:65000,maxBuffer:1024*1024
    })
    assert.ok(!secondRedis.error&&secondRedis.status===0&&
      String(secondRedis.stdout??"").includes("B22_REDIS_NATIVE_LOCK_RECOVERED_AFTER_TTL"),
      "B22 native Redis must deny active key, then recover after expiry")
    process.stdout.write("\nPASS B22 official Redis provider: independent process exit, live-lock denial, automatic TTL recovery; native Mercur Cart checkout NOT TESTED on Redis\n")


    type NativeCartAttempt={run?:any;error?:string}
    const startCartAttempt=():Promise<NativeCartAttempt>=>
      completeCartWithSplitOrdersWorkflow(container).run({
        input:{cart_id:concurrentCart.id},throwOnError:false
      }).then((run:any)=>({run}),(error:unknown)=>({error:String(error)}))
    const concurrentBarrier=new Client({connectionString:u.toString()})
    await concurrentBarrier.connect()
    let concurrentBarrierHeld=false
    let firstConcurrentAttempt:Promise<NativeCartAttempt>|undefined
    let secondaryProcessDone:Promise<{code:number|null;output:string}>|undefined
    let primaryAttempt:NativeCartAttempt|undefined
    let secondaryOutcome:{code:number|null;output:string}|undefined
    try{
      await concurrentBarrier.query("BEGIN")
      concurrentBarrierHeld=true
      const concurrentBarrierPid=(await concurrentBarrier.query(
        "select pg_backend_pid()::int as pid"
      )).rows[0].pid as number
      await concurrentBarrier.query("LOCK TABLE order_group IN SHARE MODE")
      firstConcurrentAttempt=startCartAttempt()
      await until(async()=>{
        const rows=await q(`select count(*)::int n from pg_locks l
          where l.locktype='relation' and l.relation='order_group'::regclass
            and l.mode='RowExclusiveLock' and l.granted=false
            and l.pid<>$1`,[concurrentBarrierPid])
        return rows[0].n===1
      },19000,"B22 first native process passed L and waits on OrderGroup INSERT")
      assert.equal((await q("select count(*)::int n from locking where id=$1",
        [concurrentCart.id]))[0].n,1,
        "First Medusa process must own the PostgreSQL Cart lock at L")
      // Mercur 2.4.0 fixes #1677: lock TTL is now SECONDS, not milliseconds.
      // Assert the real persisted Cart lease while waiting at the PG barrier.
      const nativeLease=await q(
        "select owner_id, extract(epoch from (expiration - now()))::double precision as seconds_left from locking where id=$1",
        [concurrentCart.id])
      assert.equal(nativeLease.length,1,
        "Task-owned native Cart must have exactly one persisted lease")
      assert.equal(nativeLease[0].owner_id,null)
      const nativeLeaseSeconds=Number(nativeLease[0].seconds_left)
      assert.ok(Number.isFinite(nativeLeaseSeconds) &&
        nativeLeaseSeconds>90 && nativeLeaseSeconds<=120,
        "Native Mercur 2.4 Cart lease must be bounded by roughly 120 seconds")
      process.stdout.write("\nPASS B22 native Cart TTL units: actual PostgreSQL Cart lease bounded by 120 seconds on Mercur 2.4; checkout/payment still disabled\n")
      let output=""
      let stderr=""
      let started=false
      const classifiedStartupFailure=()=>{
        // Logs can contain secrets; never echo them to CI or GitHub. Report
        // only a bounded, predefined diagnostic label and process phase.
        const source=(output+"\\n"+stderr).toLowerCase()
        const phase=output.includes("B22_SECONDARY_NATIVE_INVOKED")
          ?"native-invoked":output.includes("B22_SECONDARY_PG_LOCK_CONFLICT")
          ?"lock-confirmed":output.includes("B22_SECONDARY_PROVIDER_READY")
          ?"provider-ready":output.includes("B22_SECONDARY_SCOPE_READY")
          ?"scope-ready":"before-script"
        const cause=/eaddrinuse|address already in use/i.test(source)
          ?"port-conflict":/cannot find module|module not found|module resolution/i.test(source)
          ?"module-resolution":/permission denied|eacces/i.test(source)
          ?"process-permission":/relation .*does not exist|migration/i.test(source)
          ?"database-schema":/failed to acquire lock|already locked/i.test(source)
          ?"lock-conflict":/connection refused|econnrefused/i.test(source)
          ?"connection-refused":/error running script|assertionerror/i.test(source)
          ?"script-error":"unclassified"
        return "phase="+phase+"; category="+cause
      }
      let resolveStarted!:()=>void
      let rejectStarted!:(reason:Error)=>void
      const secondInvoked=new Promise<void>((resolve,reject)=>{
        resolveStarted=resolve;rejectStarted=reject
      })
      // medusa exec may run under Node even when the CI parent is Bun.
      // Use the existing installed Bun CLI explicitly for its `run` command.
      const secondary=spawn("bun",[
        "run","medusa","exec","./integration-tests/postgres/b22-store-ui.exec.ts"
      ],{
        cwd:process.cwd(),
        env:{...process.env,B22_SECOND_PROCESS_CART_ID:concurrentCart.id},
        stdio:["ignore","pipe","pipe"],
        signal:AbortSignal.timeout(60000)
      })
      secondaryProcessDone=new Promise(resolve=>{
        secondary.stdout?.on("data",(chunk:Buffer)=>{
          output=(output+String(chunk)).slice(-16000)
          if(!started && output.includes("B22_SECONDARY_PG_LOCK_CONFLICT") &&
              output.includes("B22_SECONDARY_NATIVE_INVOKED")){
            started=true
            resolveStarted()
          }
        })
        // Keep any native Medusa diagnostics only in process-local memory.
        // Report a fixed classification, never raw logs or environment.
        secondary.stderr?.on("data",(chunk:Buffer)=>{
          stderr=(stderr+String(chunk)).slice(-16000)
        })
        secondary.on("error",(error:Error)=>{
          if(!started)rejectStarted(Error("B22 secondary Medusa process could not start"))
          resolve({code:null,output})
        })
        secondary.on("close",(code:number|null)=>{
          if(!started)rejectStarted(Error(
            "B22 secondary process did not reach native workflow; exit="+
            String(code)+"; "+classifiedStartupFailure()
          ))
          resolve({code,output})
        })
      })
      await secondInvoked
      assert.equal((await q(
        "select count(*)::int n from order_group where cart_id=$1",
        [concurrentCart.id]
      ))[0].n,0,"Both processes must overlap before the first OrderGroup write")
      await concurrentBarrier.query("ROLLBACK")
      concurrentBarrierHeld=false
      primaryAttempt=await firstConcurrentAttempt
      secondaryOutcome=await secondaryProcessDone
    }finally{
      if(concurrentBarrierHeld)await concurrentBarrier.query("ROLLBACK")
      await concurrentBarrier.end()
      if(firstConcurrentAttempt)await firstConcurrentAttempt
      if(secondaryProcessDone)await secondaryProcessDone
    }
    assert.equal(primaryAttempt?.error,undefined)
    assert.equal(primaryAttempt?.run?.errors?.length??0,0,
      "First native process must complete its authorized Cart")
    assert.equal(secondaryOutcome?.code,0,
      "Independent native Medusa process must complete its safe retry")
    assert.ok(secondaryOutcome?.output.includes("B22_SECONDARY_NATIVE_DENIED")||
      secondaryOutcome?.output.includes("B22_SECONDARY_NATIVE_SUCCESS"),
      "Independent native process must return a classified safe result")
    const concurrentGroups=await q(
      "select id from order_group where cart_id=$1",[concurrentCart.id])
    assert.equal(concurrentGroups.length,1,
      "Independent native Medusa processes must persist exactly one OrderGroup")
    assert.equal(primaryAttempt?.run?.result?.order_group_id,concurrentGroups[0].id)
    const {data:concurrentOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],filters:{cart_id:concurrentCart.id}
    })
    assert.equal(concurrentOrderLinks.length,1,
      "Independent processes must persist exactly one Order")
    assert.ok((await cartService.retrieveCart(concurrentCart.id)).completed_at)
    const {data:concurrentPaymentLinks}=await query.graph({
      entity:"cart_payment_collection",fields:["payment_collection_id"],
      filters:{cart_id:concurrentCart.id}
    })
    assert.equal(concurrentPaymentLinks.length,0)
    const concurrentAttribution=await q(
      "select organization_id,customer_id from da_buyer_cart_attribution where cart_id=$1",
      [concurrentCart.id])
    assert.equal(concurrentAttribution.length,1)
    assert.equal(concurrentAttribution[0].organization_id,organizations[1].id)
    assert.equal(concurrentAttribution[0].customer_id,nativeCustomer.id)
    process.stdout.write("\nPASS B22 concurrent native Cart checkout: two separate Medusa processes observed shared PostgreSQL Cart lock after L at PG16 OrderGroup INSERT barrier; one completed Cart, one OrderGroup/Order, zero payment, unchanged Buyer attribution\n")

    // Deterministic L/commit race using the production buyer-permission
    // advisory lock and the real Chrome Owner mutation. No successful Cart
    // completion, OrderGroup or payment is exercised in this test.
    const buyerRevokeBarrier=new Client({connectionString:u.toString()})
    await buyerRevokeBarrier.connect()
    let pendingBuyerRevoke:Promise<{status:number;error?:string}>|undefined
    try{
      await buyerRevokeBarrier.query("BEGIN")
      const barrierPid=(await buyerRevokeBarrier.query(
        "select pg_backend_pid()::int as pid"
      )).rows[0].pid as number
      await buyerRevokeBarrier.query(
        "select pg_advisory_xact_lock(hashtext('b22-buyer-purchase'),hashtext($1))",
        [organizations[1].id+":"+B.person]
      )
      pendingBuyerRevoke=betaPermission("revoke").then(
        (response:any)=>({status:response.status as number}),
        (error:unknown)=>({status:0,error:String(error)})
      )
      // Prove that the actual browser-driven mutation is already waiting on
      // this exact lock; merely starting a Promise would not prove overlap.
      await until(async()=>{
        const waiting=await q(`select count(*)::int n from pg_locks held
          join pg_locks waiting
            on waiting.locktype='advisory'
           and waiting.database=held.database
           and waiting.classid=held.classid
           and waiting.objid=held.objid
           and waiting.objsubid=held.objsubid
           and waiting.pid<>held.pid
           and waiting.granted=false
          where held.pid=$1 and held.locktype='advisory'
            and held.granted=true`,[barrierPid])
        return waiting[0].n===1
      },19000,"B22 real Chrome Owner revoke waits on existing grant lock")
      assert.equal(await foundation.authorizeBuyerCheckout(
        hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
      ),true,"L before the concurrent Owner revoke commits must see the prior grant")
    } finally {
      try{await buyerRevokeBarrier.query("ROLLBACK")}
      finally{await buyerRevokeBarrier.end()}
    }
    assert.ok(pendingBuyerRevoke,"Expected a real in-flight browser revocation")
    assert.equal((await pendingBuyerRevoke).status,200)
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"An independent Beta protected Owner retains authority after self-grant revoke")
    process.stdout.write("PASS B22 Owner authority: advisory barrier proved a real grant revocation commit; native Buyer scope remains authorized by protected Owner, not an obsolete self-grant\n")
    assert.equal((await readNativeCart(betaScopeUrl)).status,200,
      "Protected Beta Owner's own Cart stays readable after self-grant revocation")
    assert.equal((await claimCart(organizations[1].id,customerCart.id)).status,403,
      "Even an Owner cannot replace an existing Alpha immutable Cart attribution")
    // Keep this test a safe native checkout DENIAL: a fresh Owner Store block
    // (not self-grant revocation) causes the actual Mercur hook to refuse.
    assert.equal((await betaSellerBlock("block",sellerGamma.id,gammaSellerId)).status,200)
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),false,"Store Buyer Organization block overrides even protected Owner authority")
    const hookRun=await completeCartWithSplitOrdersWorkflow(container).run({
      input:{cart_id:hookProbeCart.id},throwOnError:false
    })
    const hookErrorText=(hookRun.errors??[]).map((entry:any)=>
      String(entry.error?.message??entry.error??entry.message??"")).join("\n")
    assert.match(hookErrorText,/B22_CHECKOUT_AUTHORIZATION_DENIED/,
      "Mercur validate must deny the protected Owner's Cart because its Store buyer block is active")
    assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",[hookProbeCart.id]))[0].n,0)
    const {data:hookOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],filters:{cart_id:hookProbeCart.id}
    })
    assert.equal(hookOrderLinks.length,0)
    const {data:hookPaymentLinks}=await query.graph({
      entity:"cart_payment_collection",fields:["payment_collection_id"],
      filters:{cart_id:hookProbeCart.id}
    })
    assert.equal(hookPaymentLinks.length,0)
    const {data:hookCartAfter}=await query.graph({
      entity:"cart",fields:["id","total","completed_at","customer.id","items.id",
        "items.offer.id","items.offer.seller_id"],filters:{id:hookProbeCart.id}
    })
    assert.equal(hookCartAfter.length,1)
    assert.equal(Number(hookCartAfter[0].total),0)
    assert.equal(hookCartAfter[0].completed_at,null)
    assert.equal(hookCartAfter[0].customer?.id,nativeCustomer.id)
    assert.equal(hookCartAfter[0].items.length,1)
    assert.equal(hookCartAfter[0].items[0].offer?.id,hookProbeOffer.id)
    assert.equal(hookCartAfter[0].items[0].offer?.seller_id,gammaSellerId)
    assert.equal((await betaSellerBlock("unblock",sellerGamma.id,gammaSellerId)).status,200)
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Unblocking restores inherited Owner authority independently of an explicit grant")
    process.stdout.write("PASS B22 real Mercur validate: protected Owner still authorized after self-grant revoke, but Store Buyer Organization block denies native checkout with zero OrderGroup/Order/payment; unblock restores L\n")
    process.stdout.write("NOT TESTED B22: successful order placement, authorization/capture with a real payment provider, post-L overlap orchestration, independent exact-PR acceptance\n")

    // Exercise the genuine Beta Customer before the later F-02 security test
    // intentionally revokes that Customer binding. All initial foreign Staff
    // checks run before the helper adds B as the second protected Gamma Owner.
    // Reuse that same Owner membership in the later native Owner race.
    const secondGammaOwnerId=await verifyB22PlatformClosingAppeal({
      browser,staff:reviewer,q,foundation,
      ownerPersonId:A.person,staffPersonId:B.person,
      ownerOrgId:sellerGamma.id,ownerOrgName:sellerGamma.name,
      sellerId:gammaSellerId,buyer:reviewer,
      buyerScopePath:betaScopeUrl,buyerOrganizationId:organizations[1].id,
      checkoutCartId:hookProbeCart.id,customerId:nativeCustomer.id,query,
      auth,ownerEmail:A.email,container
    })
    await verifyB22PlatformClosingSecondStageRequest({
      browser,staff:reviewer,q,foundation,sourceSellerId:gammaSellerId,
      reviewSellerId:secondOwnerStoreId,
      ownerPersonId:A.person,staffPersonId:B.person,
      organizationId:organizations[0].id,
      organizationName:organizations[0].name
    })
    await verifyB22IndependentStaffClosingDecision({
      host,crt,browsers,ownerBrowser:browser,initialStaff:reviewer,
      q,foundation,organizationId:organizations[0].id,
      reviewSellerId:secondOwnerStoreId,initialSellerId:gammaSellerId,
      ownerPersonId:A.person,originalStaffPersonId:B.person
    })
    // Continue the Alpha Buyer/permission tests from the real Owner workspace.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('buyer-grants-panel').hidden")

    const forgedBuyer=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[0].id)}&actor_id=cus_forged')
      return r.status
    })()`)
    assert.equal(forgedBuyer,400,"Forged Customer context rejected")
    // Actual browser selection, not only an HTTP request: B's newly-active
    // Alpha membership is refreshed before selecting that Organization.
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("document.getElementById('workspace').hidden===false")
    await reviewer.select(organizations[0].name,"member")
    await reviewer.wait("!document.getElementById('buyer-context-panel').hidden")
    assert.equal(await reviewer.eval(`document.getElementById('buyer-context-status').textContent.includes('Sepet ve ödeme henüz kullanıma açık değil')`),true)

    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.wait("!document.getElementById('buyer-grants-panel').hidden")
    await browser.eval(`document.querySelector('#buyer-grants-form select[name=membership_id]').value=${JSON.stringify(alphaMember.id)}`)
    await browser.click('#buyer-grants-form button[value="revoke"]')
    await until(async()=>{
      const rows=await q(`select revoked_at from da_organization_buyer_permission
        where id=$1`,[buyerGrant.id])
      return rows.length===1&&!!rows[0].revoked_at
    },19000,"B22 Chrome Owner revokes explicit buyer.purchase")
    const buyerRevoked=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.action='organization.buyer_permission_revoked'
        and e.actor_person_id=$1 and e.organization_id=$2
        and e.target_id=$3 and e.previous_values->>'grant_id'=$4`,
      [A.person,organizations[0].id,B.person,buyerGrant.id])
    assert.equal(buyerRevoked[0].n,1,"Revocation must emit canonical outbox")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A buyer.purchase revocation committed before L must deny checkout")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const deniedAfterRevoke=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[0].id)}')
      return r.status
    })()`)
    assert.equal(deniedAfterRevoke,403,"Server rechecks revoked buyer.purchase")
    assert.equal((await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id))).status,403,
      "Revoked buyer.purchase cannot read even its own native Cart")
    assert.equal((await claimCart(organizations[0].id,customerCart.id)).status,403,
      "Revoked buyer.purchase must not renew an earlier immutable Cart attribution")

    assert.equal(await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id))})
      return r.status
    })()`),403,"Revoked buyer.purchase denies even a valid native Customer")

    await reviewer.click('#buyer-context-refresh')
    await reviewer.wait("document.getElementById('buyer-context-panel').hidden===true")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    process.stdout.write("PASS B22 Chrome: explicit buyer.purchase remains mandatory for Alpha Member; cross-Organization, forged actor and revoked Member denied; protected Owner independent\\n")

    assert.equal((await q(`select count(*)::int n from da_organization_buyer_permission
      where person_id=$1 and organization_id=$2 and revoked_at is null`,
      [B.person,organizations[0].id]))[0].n,0)
    process.stdout.write("PASS B22 Chrome: Owner grants and revokes Alpha Member buyer.purchase with real audit/outbox, idempotent replay; independent protected Owner authority creates no self-grant\\n")
    // F-02: an actual native Medusa Customer GET completes, but its HTTP
    // response is held while a supported Customer unlink commits to PG16.
    // No fake upstream actor response, production hook or external service.
    // The native Store Customer endpoint requires Medusa's publishable token.
    // Reuse the existing disposable B22 key; never log or persist it.
    const previousCustomerPublishable=process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY
    process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY=b22PublishableKey.token
    const customerBeforeRace=await reviewer.eval("(async()=>{const r=await fetch('/personal/contexts?type=customer');return r.status})()")
    assert.equal(customerBeforeRace,200,"Valid Customer stays available before unlink")
    const customerBindingRows=await q(
      "select id from da_verified_actor_binding where person_id=$1 and actor_type='customer' and revoked_at is null",
      [B.person])
    assert.equal(customerBindingRows.length,1)
    const raceCookie=await reviewer.token()
    assert.match(raceCookie??"",/^[A-Za-z0-9_-]{43}$/)
    const nativeCustomerTarget=topology.privateOrigin+"/store/customers/me"
    const realNodeFetch=globalThis.fetch
    let nativeResponseReceived=false,gateReleased=false
    let releaseNative!:()=>void
    const nativeGate=new Promise<void>(resolve=>{releaseNative=()=>{gateReleased=true;resolve()}})
    let intercepted=false
    globalThis.fetch=async(...args:Parameters<typeof fetch>):Promise<Response>=>{
      const response=await realNodeFetch(...args)
      const target=typeof args[0]==="string"?args[0]:
        args[0] instanceof URL?args[0].toString():args[0].url
      if(!intercepted&&target===nativeCustomerTarget&&response.status===200){
        intercepted=true
        // Read the real native body before waiting. Only delivery to the
        // public response is paused; the upstream Customer GET already passed.
        await response.clone().arrayBuffer()
        nativeResponseReceived=true
        await nativeGate
      }
      return response
    }
    let inFlightCustomer:Promise<{status:number;body:any}>|undefined
    try{
      inFlightCustomer=new Promise((resolve,reject)=>{
        const request=tlsRequest(host+"/personal/contexts?type=customer",{
          method:"GET",ca:readFileSync(crt),
          headers:{Cookie:"da_session="+raceCookie}
        },response=>{
          let body=""
          response.setEncoding("utf8")
          response.on("data",chunk=>{body+=chunk})
          response.on("end",()=>{
            try{resolve({status:response.statusCode??0,body:JSON.parse(body)})}
            catch(error){reject(error)}
          })
        })
        request.on("error",reject)
        request.setTimeout(14000,()=>request.destroy(Error("F-02 Customer GET timed out")))
        request.end()
      })
      await until(async()=>nativeResponseReceived,10000,
        "F-02 actual Medusa Customer HTTP response held before public reply")
      const unlinkCode="(async()=>{"+
        "const sr=await fetch('/personal/session');"+
        "if(sr.status!==200)return {status:sr.status};"+
        "const session=await sr.json();"+
        "const r=await fetch('/personal/links',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
        "body:JSON.stringify({action:'unlink',binding_id:"+
        JSON.stringify(customerBindingRows[0].id)+"})});"+
        "return {status:r.status}})()"
      const unlinkOutcome=await reviewer.eval(unlinkCode)
      assert.equal(unlinkOutcome.status,200,
        "Supported CSRF-protected Customer unlink must commit while native GET is held")
      const revokedBinding=await q(
        "select revoked_at from da_verified_actor_binding where id=$1",
        [customerBindingRows[0].id])
      assert.equal(revokedBinding.length,1)
      assert.ok(revokedBinding[0].revoked_at,
        "Independent PG16 readback confirms Customer unlink was committed")
      assert.equal((await q(
        "select count(*)::int n from da_actor_credential where binding_id=$1 and retired_at is null",
        [customerBindingRows[0].id]))[0].n,0,
        "Revoked Customer leaves no live native credential")
      releaseNative()
      const outcome=await inFlightCustomer
      assert.equal(outcome.status,403,
        "F-02: a native response completed before committed unlink must not expose stale Customer context")
      assert.deepEqual(outcome.body,{message:"Access denied"})
      process.stdout.write("PASS F-02 actual native Customer GET held: supported unlink committed PG16; stale public context denied and credentials retired\n")
    }finally{
      if(!gateReleased)releaseNative()
      globalThis.fetch=realNodeFetch
      if(previousCustomerPublishable===undefined)delete process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY
      else process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY=previousCustomerPublishable
      if(inFlightCustomer)await inFlightCustomer.catch(()=>{})
    }

    // The Organization Owner may explicitly grant AND revoke products.edit
    // for an active member; platform staff status is not sufficient.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    // A matching role is not a sufficient signal if the previous selected
    // Organization also had an Owner role. Wait for exact Organization scope
    // and freshly loaded Store/member options before the real Chrome click.
    await browser.wait(`new URLSearchParams(location.search).get('organization')===${JSON.stringify(organizations[0].id)} && JSON.parse(document.getElementById('detail').textContent||'{}').id===${JSON.stringify(organizations[0].id)}`)
    const adminMemberBefore=await q(`select role,status,protected_owner from da_organization_membership where id=$1`,[alphaMember.id])
    const adminAuditBefore=await q(`select id from da_audit_event where organization_id=$1 order by id`,[organizations[0].id])
    const attemptedAdmin=await browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/memberships',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify({action:'role',organization_id:${JSON.stringify(organizations[0].id)},
          membership_id:${JSON.stringify(alphaMember.id)},role:'admin'})})
      return response.status
    })()`)
    assert.equal(attemptedAdmin,400,"Owner cannot assign retired Organization Admin")
    assert.deepEqual(await q(`select role,status,protected_owner from da_organization_membership where id=$1`,[alphaMember.id]),adminMemberBefore)
    assert.deepEqual(await q(`select id from da_audit_event where organization_id=$1 order by id`,[organizations[0].id]),adminAuditBefore)
    process.stdout.write("\nPASS B22 Chrome: no new Organization Admin assignment; Owner HTTP400, membership/audit unchanged\n")
    // A second ingress must not recreate company Admin via a pending invite.
    const formerInvites=await q(`select id,role,status from da_organization_invitation
      where organization_id=$1 order by id`,[organizations[0].id])
    const formerInviteAudits=await q(`select id from da_audit_event where
      organization_id=$1 and resource='invitation' order by id`,[organizations[0].id])
    const forbiddenInvite=await browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/invitations',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify({action:'create',organization_id:${JSON.stringify(organizations[0].id)},
          email:'retired-admin-invite@example.invalid',role:'admin'})})
      return response.status
    })()`)
    assert.equal(forbiddenInvite,400,"Owner cannot invite a retired Organization Admin")
    assert.deepEqual(await q(`select id,role,status from da_organization_invitation
      where organization_id=$1 order by id`,[organizations[0].id]),formerInvites)
    assert.deepEqual(await q(`select id from da_audit_event where
      organization_id=$1 and resource='invitation' order by id`,[organizations[0].id]),formerInviteAudits)
    process.stdout.write("\nPASS B22 Chrome: retired company Admin invitation Owner HTTP400; no invitation or audit write\n")
    await browser.wait(`!document.getElementById('product-grants-panel').hidden && Array.from(document.querySelector('#product-grants-form select[name=seller_id]').options).some(o=>o.value===${JSON.stringify(ownerStoreId)}) && Array.from(document.querySelector('#product-grants-form select[name=membership_id]').options).some(o=>o.value===${JSON.stringify(alphaMember.id)}) && !document.querySelector('#product-grants-form button[value=grant]').disabled`)
    const editableMembers=await browser.eval("Array.from(document.querySelector('#product-grants-form select[name=membership_id]').options).map(o=>o.value)")
    assert.deepEqual(editableMembers,[alphaMember.id],
      "Protected Owner and legacy Admin cannot be edited through an ordinary personal-grant selector")
    const protectedGrantBefore=await q(`select id,revoked_at from da_store_product_permission
      where person_id=$1 and organization_id=$2 and seller_id=$3 order by id`,
      [A.person,organizations[0].id,ownerStoreId])
    const auditBefore=await q(`select id from da_audit_event where organization_id=$1
      and resource='store-product-permission' and target_id=$2 order by id`,
      [organizations[0].id,ownerStoreId])
    for(const action of ["grant","revoke"]){
      const denied=await browser.eval(`(async()=>{
        const session=await(await fetch('/personal/session')).json()
        const r=await fetch('/personal/store-product-permissions',{
          method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
          body:JSON.stringify(${JSON.stringify({action,organization_id:organizations[0].id,
            seller_id:ownerStoreId,membership_id:memberships[0].id})})
        })
        return r.status
      })()`)
      assert.equal(denied,403,"Protected Owner's fixed permission group denies normal personal "+action)
    }
    assert.deepEqual(await q(`select id,revoked_at from da_store_product_permission
      where person_id=$1 and organization_id=$2 and seller_id=$3 order by id`,
      [A.person,organizations[0].id,ownerStoreId]),protectedGrantBefore)
    assert.deepEqual(await q(`select id from da_audit_event where organization_id=$1
      and resource='store-product-permission' and target_id=$2 order by id`,
      [organizations[0].id,ownerStoreId]),auditBefore,
      "Rejected Owner grant/revoke has no audit or permission side effects")
    assert.equal(await browser.eval("document.getElementById('product-grants-effective').textContent.includes('Yetkisiz')"),true)
    process.stdout.write("\nPASS B22 Chrome: protected Owner excluded from individual products.edit; forged grant/revoke HTTP403, PG16 grant/audit unchanged\n")
    await browser.eval(`(()=>{
      const f=document.getElementById('product-grants-form');
      f.elements.namedItem('seller_id').value=${JSON.stringify(ownerStoreId)};
      f.elements.namedItem('membership_id').value=${JSON.stringify(alphaMember.id)};
    })()`)
    const priorProductGrantPosts=browser.http.filter((x:any)=>
      x.path==="/personal/store-product-permissions"&&x.method==="POST").length
    await browser.click('#product-grants-form button[value="grant"]')
    await until(async()=>browser.http.filter((x:any)=>
      x.path==="/personal/store-product-permissions"&&x.method==="POST"
    ).length>priorProductGrantPosts,19000,
      "B22 Chrome Owner products.edit POST reaches first-party HTTP")
    const productGrantPosts=browser.http.filter((x:any)=>
      x.path==="/personal/store-product-permissions"&&x.method==="POST")
    assert.equal(productGrantPosts[productGrantPosts.length-1].status,200,
      "Actual Chrome Owner products.edit POST must be accepted")
    await until(async()=>{
      const rows=await q(`select g.id from da_store_product_permission g
        where g.person_id=$1 and g.organization_id=$2 and g.seller_id=$3
          and g.permission='products.edit' and g.revoked_at is null`,
        [B.person,organizations[0].id,ownerStoreId])
      return rows.length===1
    },19000,"B22 Chrome Owner actual products.edit permission")
    await browser.wait("document.getElementById('product-grants-effective').textContent.includes('Yetkili')")
    const [issued]=await q(`select g.id,g.source_audit_event_id from da_store_product_permission g
      where g.person_id=$1 and g.organization_id=$2 and g.seller_id=$3
        and g.revoked_at is null`,[B.person,organizations[0].id,ownerStoreId])
    const auditGrant=await q(`select e.action,e.actor_person_id,e.organization_id,e.target_id,x.id outbox_id
      from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.new_values->>'grant_id'=$2`,[issued.source_audit_event_id,issued.id])
    assert.equal(auditGrant.length,1)
    assert.equal(auditGrant[0].action,"organization.store_product_permission_granted")
    assert.equal(auditGrant[0].actor_person_id,A.person)
    assert.equal(auditGrant[0].organization_id,organizations[0].id)
    assert.equal(auditGrant[0].target_id,ownerStoreId)
    // Repeating the exact grant cannot create a second event or grant.
    const sameRequest={action:"grant",organization_id:organizations[0].id,
      seller_id:ownerStoreId,membership_id:alphaMember.id}
    const replayGrant=await browser.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/store-product-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(sameRequest)})
      });return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(replayGrant.status,200)
    assert.equal(replayGrant.body.grant_id,issued.id)
    assert.equal((await q(`select count(*)::int n from da_store_product_permission
      where person_id=$1 and organization_id=$2 and seller_id=$3`,
      [B.person,organizations[0].id,ownerStoreId]))[0].n,1)
    // A Person who is only a MEMBER of Alpha cannot grant products.edit,
    // even if that Person has an unrelated Beta Owner and platform staff role.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const forbiddenGrant=await reviewer.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/store-product-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(sameRequest)})
      });return response.status
    })()`)
    assert.equal(forbiddenGrant,403,"Other Organization Owner / platform staff cannot grant Alpha")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.wait("!document.getElementById('product-grants-panel').hidden")
    await browser.eval(`(()=>{
      const f=document.getElementById('product-grants-form');
      f.elements.namedItem('seller_id').value=${JSON.stringify(ownerStoreId)};
      f.elements.namedItem('membership_id').value=${JSON.stringify(alphaMember.id)};
    })()`)
    await browser.click('#product-grants-form button[value="revoke"]')
    await until(async()=>{
      const rows=await q(`select revoked_at from da_store_product_permission where id=$1`,[issued.id])
      return rows.length===1&&!!rows[0].revoked_at
    },19000,"B22 Chrome Owner actual products.edit revocation")
    await browser.wait("document.getElementById('product-grants-effective').textContent.includes('Yetkisiz')")
    const revokeAudit=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.action='organization.store_product_permission_revoked'
        and e.actor_person_id=$1 and e.organization_id=$2 and e.target_id=$3`,
      [A.person,organizations[0].id,ownerStoreId])
    assert.equal(revokeAudit[0].n,1,"Revocation requires canonical outbox")
    process.stdout.write("PASS B22 Chrome: Owner grants active Member scoped products.edit, retry idempotent, foreign Member/staff 403, Owner revokes with PG16 audit/outbox\n")

    // A legacy Admin may retain a product grant even though new Admin grants
    // are forbidden. Use the Owner's actual browser to revoke that one grant.
    const legacyRegrant=await browser.eval("(async()=>{"+
      "const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/store-product-permissions',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify("+JSON.stringify(sameRequest)+")});"+
      "return {status:r.status,body:await r.json()}})()")
    assert.equal(legacyRegrant.status,200)
    assert.equal(legacyRegrant.body.status,'active')
    const legacyGrantId=legacyRegrant.body.grant_id
    await q("update da_organization_membership set role='admin',protected_owner=false,updated_at=clock_timestamp() where id=$1",
      [alphaMember.id])
    try{
      await browser.click('#memberships-refresh')
      await browser.wait("Array.from(document.querySelectorAll('#product-grants-list button')).some(b=>b.textContent==='Eski Admin ürün iznini iptal et')")
      const ordinaryOptions=await browser.eval(
        "Array.from(document.querySelector('#product-grants-form select[name=membership_id]').options).map(o=>o.value)")
      assert.equal(ordinaryOptions.includes(alphaMember.id),false,
        "Legacy Admin must not become eligible for a new personal product grant")
      await browser.eval("Array.from(document.querySelectorAll('#product-grants-list button')).find(b=>b.textContent==='Eski Admin ürün iznini iptal et').click()")
      await until(async()=> (await q("select revoked_at from da_store_product_permission where id=$1",
        [legacyGrantId]))[0]?.revoked_at!=null,19000,
        "Owner must revoke the historical Admin grant through real Chrome")
      await browser.wait("document.getElementById('product-grants-status').textContent.includes('Eski Admin ürün izni iptal edildi')")
      assert.deepEqual(await q("select role,status,protected_owner from da_organization_membership where id=$1",
        [alphaMember.id]),[{role:'admin',status:'active',protected_owner:false}])
      process.stdout.write("PASS B22 Chrome/HTTP/PG16: Owner revokes legacy Admin products.edit through existing API without restoring Admin grants\n")
    }finally{
      await q("update da_organization_membership set role='member',protected_owner=false,updated_at=clock_timestamp() where id=$1",
        [alphaMember.id])
      await browser.click('#memberships-refresh')
      await browser.wait("Array.from(document.querySelector('#product-grants-form select[name=membership_id]').options).some(o=>o.value==="+JSON.stringify(alphaMember.id)+")")
    }

    // Verify the PR #256 policy boundary with this SAME active protected Owner:
    // actual Chrome/HTTPS endpoints, task-only PG16 rows and audit/outbox.
    const previousPermissionPolicy=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    const policyHttp=async(operations:Array<"list"|"grant"|"revoke">)=>
      browser.eval(`(async()=>{
        const org=${JSON.stringify(organizations[0].id)}
        const member=${JSON.stringify(alphaMember.id)}
        const seller=${JSON.stringify(ownerStoreId)}
        const sessionResponse=await fetch('/personal/session')
        const session=await sessionResponse.json()
        const result={session:sessionResponse.status}
        const targets=[
          ['Buyer','/personal/buyer-permissions',{organization_id:org,membership_id:member}],
          ['Product','/personal/store-product-permissions',
            {organization_id:org,membership_id:member,seller_id:seller}]
        ]
        for(const action of ${JSON.stringify(operations)}){
          for(const [kind,path,scope] of targets){
            const response=action==='list'
              ? await fetch(path+'?organization_id='+encodeURIComponent(org))
              : await fetch(path,{method:'POST',
                  headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
                  body:JSON.stringify({...scope,action})})
            result[action+kind]=response.status
            if(action==='list')
              result[kind+'PrivateRows']=Object.hasOwn(await response.json(),'grants')
          }
        }
        return result
      })()`)
    const policyRows=async()=>({
      buyer:await q(`select id,person_id,organization_id,permission,issued_by_person_id,
        source_audit_event_id,revoked_at from da_organization_buyer_permission
        where organization_id=$1 order by id`,[organizations[0].id]),
      product:await q(`select id,person_id,organization_id,seller_id,permission,
        issued_by_person_id,source_audit_event_id,revoked_at
        from da_store_product_permission where organization_id=$1 order by id`,[organizations[0].id]),
      memberships:await q(`select id,person_id,role,status,protected_owner,revoked_at
        from da_organization_membership where organization_id=$1 order by id`,[organizations[0].id]),
      audit:await q(`select id,action,actor_person_id,organization_id,target_id
        from da_audit_event where organization_id=$1 order by id`,[organizations[0].id]),
      outbox:await q(`select x.id,x.source_audit_event_id from da_audit_outbox x
        join da_audit_event e on e.id=x.source_audit_event_id
        where e.organization_id=$1 order by x.id`,[organizations[0].id])
    })
    try{
      delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      // Earlier B22 positive tests revoked both grants. Create fresh grants
      // with real CSRF so denial later tests revoking genuinely ACTIVE rows.
      const positive=await policyHttp(["list","grant"])
      for(const name of ["session","listBuyer","listProduct","grantBuyer","grantProduct"])
        assert.equal(positive[name],200,"Protected Owner positive "+name)
      const buyerActive=await q(`select g.id,g.issued_by_person_id,e.id audit_id,x.id outbox_id
        from da_organization_buyer_permission g
        join da_audit_event e on e.id=g.source_audit_event_id
          and e.action='organization.buyer_permission_granted'
          and e.organization_id=g.organization_id
        join da_audit_outbox x on x.source_audit_event_id=e.id
        where g.person_id=$1 and g.organization_id=$2
          and g.permission='buyer.purchase' and g.revoked_at is null`,
        [B.person,organizations[0].id])
      const productActive=await q(`select g.id,g.issued_by_person_id,e.id audit_id,x.id outbox_id
        from da_store_product_permission g
        join da_audit_event e on e.id=g.source_audit_event_id
          and e.action='organization.store_product_permission_granted'
          and e.organization_id=g.organization_id and e.target_id=g.seller_id
        join da_audit_outbox x on x.source_audit_event_id=e.id
        where g.person_id=$1 and g.organization_id=$2 and g.seller_id=$3
          and g.permission='products.edit' and g.revoked_at is null`,
        [B.person,organizations[0].id,ownerStoreId])
      assert.equal(buyerActive.length,1)
      assert.equal(productActive.length,1)
      assert.equal(buyerActive[0].issued_by_person_id,A.person)
      assert.equal(productActive[0].issued_by_person_id,A.person)
      const beforeDenied=await policyRows()
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="buyer.purchase,products.edit"
      const stillAllowed=await policyHttp(["list"])
      assert.deepEqual(stillAllowed,{
        session:200,listBuyer:200,BuyerPrivateRows:true,
        listProduct:200,ProductPrivateRows:true
      },"Protected Owner retains permission management under deprecated deployment setting")
      assert.deepEqual(await policyRows(),beforeDenied,
        "Denied list/grant/revoke must not mutate permissions, membership, audit or outbox")
      delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      const restored=await policyHttp(["list","revoke"])
      for(const name of ["session","listBuyer","listProduct","revokeBuyer","revokeProduct"])
        assert.equal(restored[name],200,"Restored Owner positive "+name)
      assert.equal(restored.BuyerPrivateRows,true)
      assert.equal(restored.ProductPrivateRows,true)
      const endedBuyer=await q(`select revoked_at from da_organization_buyer_permission where id=$1`,
        [buyerActive[0].id])
      const endedProduct=await q(`select revoked_at from da_store_product_permission where id=$1`,
        [productActive[0].id])
      assert.equal(endedBuyer.length,1);assert.ok(endedBuyer[0].revoked_at)
      assert.equal(endedProduct.length,1);assert.ok(endedProduct[0].revoked_at)
      const revokeProof=await q(`select e.action,e.new_values->>'grant_id' grant_id,x.id
        from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
        where e.organization_id=$1 and e.actor_person_id=$2
          and e.action in ('organization.buyer_permission_revoked',
                           'organization.store_product_permission_revoked')
          and e.new_values->>'grant_id' in ($3,$4)`,
        [organizations[0].id,A.person,buyerActive[0].id,productActive[0].id])
      assert.equal(revokeProof.length,2,
        "Restored Owner revocations require two canonical audit/outbox records")
      assert.deepEqual((await policyRows()).memberships,beforeDenied.memberships,
        "Protected Owner state must not be changed by permission-policy tests")
      process.stdout.write("PASS B22 Owner member-permission policy: protected Owner grant/list 200 despite legacy setting; revoke 200 with audit/outbox\n")
    }finally{
      if(previousPermissionPolicy===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=previousPermissionPolicy
    }

    // CR-03: An active role-only "owner" without protected_owner cannot
    // change permissions or Store policy. Only task-owned PG16 rows are
    // temporarily changed; the real protected Alpha Owner stays active.
    const preRole=await q("select role,protected_owner,status from da_organization_membership where id=$1",[alphaMember.id])
    assert.equal(preRole.length,1)
    assert.equal(preRole[0].role,"member")
    assert.equal(preRole[0].protected_owner,false)
    assert.equal(preRole[0].status,"active")
    // Real pending invitation through the installed Medusa/DoğruAdres
    // transaction-aware service. This avoids direct SQL fabrication and
    // never sends an external SMTP message from the test.
    const pendingInvite=await foundation.createOrganizationInvitation({
      organization_id:organizations[0].id,
      actor_person_id:A.person,actor_type:"user",actor_id:A.actor,
      email:"b22-pending-revoke-"+rand+"@example.invalid",role:"member"
    })
    assert.match(pendingInvite.id,/^dainv_[A-Za-z0-9_-]+$/)
    const pendingBefore=await q(`select id,status,revoked_at,expires_at
      from da_organization_invitation
      where id=$1 and organization_id=$2`,
      [pendingInvite.id,organizations[0].id])
    assert.equal(pendingBefore.length,1,"Native invitation must persist")
    assert.equal(pendingBefore[0].status,"pending")
    assert.equal(pendingBefore[0].revoked_at,null)
    assert.ok(new Date(pendingBefore[0].expires_at).getTime()>Date.now(),
      "The target must be a REAL nonexpired pending invitation")
    await q("update da_organization_membership set role='owner',protected_owner=false,updated_at=clock_timestamp() where id=$1",[alphaMember.id])
    try{
      const roleOnly=await q("select role,protected_owner,status from da_organization_membership where id=$1",[alphaMember.id])
      assert.equal(roleOnly.length,1)
      assert.equal(roleOnly[0].role,"owner")
      assert.equal(roleOnly[0].protected_owner,false)
      assert.equal(roleOnly[0].status,"active")
      const realOwner=await q("select role,protected_owner,status from da_organization_membership where id=$1",[memberships[0].id])
      assert.equal(realOwner.length,1)
      assert.equal(realOwner[0].role,"owner")
      assert.equal(realOwner[0].protected_owner,true)
      const snapshot=async()=> (await q(
        "select (select count(*)::int from da_organization_buyer_permission where organization_id=$1) buyer,"+
        "(select count(*)::int from da_store_product_permission where organization_id=$1) products,"+
        "(select count(*)::int from da_store_buyer_organization_block where owner_organization_id=$1) blocks,"+
        "(select count(*)::int from da_audit_event where organization_id=$1) audits,"+
        "(select count(*)::int from da_audit_outbox x join da_audit_event e on e.id=x.source_audit_event_id where e.organization_id=$1) outboxes",
        [organizations[0].id]))[0]
      const before=await snapshot()
      const beforeManager=await q(`select
        (select count(*)::int from da_organization_invitation where organization_id=$1) invitations,
        (select count(*)::int from da_organization_membership where organization_id=$1) memberships,
        (select status from da_organization_membership where id=$2) as target_status`,
        [organizations[0].id,alphaMember.id])
      assert.equal(beforeManager.length,1)
      const beforeInvitations=await q(`select id,status,revoked_at
        from da_organization_invitation where organization_id=$1 order by id`,
        [organizations[0].id])
      // Fixed, real pending target; never replace it with a missing ID.
      const invitationTarget=pendingInvite.id
      assert.ok(beforeInvitations.some((x:any)=>x.id===invitationTarget &&
        x.status==="pending" && x.revoked_at===null),
        "The exact existing pending invitation must be targeted")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      const token=await reviewer.token()
      assert.match(token??"",/^[A-Za-z0-9_-]{43}$/)
      const script="(async()=>{"+
        "const session=await (await fetch('/personal/session')).json();"+
        "const send=async(path,value)=>{const r=await fetch(path,{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
        "body:JSON.stringify(value)});return r.status};"+
        "const org="+JSON.stringify(organizations[0].id)+";"+
        "const member="+JSON.stringify(alphaMember.id)+";"+
        "const seller="+JSON.stringify(ownerStoreId)+";"+
        "return {buyerList:(await fetch('/personal/buyer-permissions?organization_id='+org)).status,"+
        "productList:(await fetch('/personal/store-product-permissions?organization_id='+org)).status,"+
        "buyerGrant:await send('/personal/buyer-permissions',{action:'grant',organization_id:org,membership_id:member}),"+
        "buyerRevoke:await send('/personal/buyer-permissions',{action:'revoke',organization_id:org,membership_id:member}),"+
        "productGrant:await send('/personal/store-product-permissions',{action:'grant',organization_id:org,seller_id:seller,membership_id:member}),"+
        "productRevoke:await send('/personal/store-product-permissions',{action:'revoke',organization_id:org,seller_id:seller,membership_id:member})"+
        "}})()"
      // Same active but deliberately UNPROTECTED Owner fixture: no native
      // role-only reader or management endpoint may accept its title.
      // Use only this disposable PG16 database, existing authenticated Chrome,
      // and the current server CSRF. Never echo invitation/session secrets.
      const managerDenied=await reviewer.eval(`(async()=>{
        const org=${JSON.stringify(organizations[0].id)}
        const membership=${JSON.stringify(alphaMember.id)}
        const invitation=${JSON.stringify(invitationTarget)}
        const session=await(await fetch('/personal/session')).json()
        const post=async(path,value)=>{
          const response=await fetch(path,{method:'POST',
            headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
            body:JSON.stringify(value)})
          return response.status
        }
        return {
          memberships:(await fetch('/personal/memberships?organization='+org)).status,
          invitations:(await fetch('/personal/invitations?organization='+org)).status,
          audit:(await fetch('/personal/audit-timeline?organization='+org)).status,
          stores:(await fetch('/personal/organization-stores?organization='+org)).status,
          createInvite:await post('/personal/invitations',{action:'create',
            organization_id:org,email:'unprotected-owner@example.invalid',role:'member'}),
          revokeMember:await post('/personal/memberships',{action:'revoke',
            organization_id:org,membership_id:membership}),
          changeRole:await post('/personal/memberships',{action:'role',
            organization_id:org,membership_id:membership,role:'member'}),
          revokeInvite:await post('/personal/invitations',{action:'revoke',
            organization_id:org,invitation_id:invitation})
        }
      })()`)
      for(const [name,status] of Object.entries(managerDenied))
        assert.equal(status,403,"Role-only Owner management/private read denied: "+name)
      assert.deepEqual(await snapshot(),before,
        "Unprotected Owner must not append any domain or audit/outbox writes")
      const afterManager=await q(`select
        (select count(*)::int from da_organization_invitation where organization_id=$1) invitations,
        (select count(*)::int from da_organization_membership where organization_id=$1) memberships,
        (select status from da_organization_membership where id=$2) as target_status`,
        [organizations[0].id,alphaMember.id])
      assert.deepEqual(afterManager,beforeManager,
        "Denied role-only Owner cannot change invitations or membership status")
      // An invitation can be revoked in-place without changing row count.
      // Compare each invitation's status/revocation timestamp as well.
      const afterInvitations=await q(`select id,status,revoked_at
        from da_organization_invitation where organization_id=$1 order by id`,
        [organizations[0].id])
      assert.deepEqual(afterInvitations,beforeInvitations,
        "Role-only Owner must not revoke an invitation or change its state")
      assert.deepEqual(await q(`select id,status,revoked_at,expires_at
        from da_organization_invitation where id=$1 and organization_id=$2`,
        [invitationTarget,organizations[0].id]),pendingBefore,
        "Denied revoke must leave the exact real pending invitation unchanged")
      assert.deepEqual(await snapshot(),before,
        "Denied role-change/invitation-revoke cannot write domain audit/outbox")
      process.stdout.write("PASS B22 protected Owner mutation negatives: role-only Owner HTTP 403 on membership role-change and invitation revoke; membership/invitation states and canonical audit/outbox unchanged\n")
      const denied=await reviewer.eval(script)
      for(const [name,status] of Object.entries(denied))
        assert.equal(status,403,"Role-only Owner denied: "+name)
      // Service-level denial is checked directly: a native Seller edge must
      // not accidentally mask a missing Foundation authorization check.
      for(const action of ["grant","revoke"] as const){
        assert.equal(await foundation.personalChangeBuyerPermission(token,{
          action,organization_id:organizations[0].id,membership_id:alphaMember.id}),null)
        assert.equal(await foundation.personalChangeStoreProductPermission(token,{
          action,organization_id:organizations[0].id,seller_id:ownerStoreId,
          membership_id:alphaMember.id}),null)
      }
      for(const action of ["block","unblock"] as const)
        assert.equal(await foundation.personalChangeStoreBuyerBlock(token,{
          action,organization_id:organizations[0].id,seller_id:ownerStoreId,
          buyer_organization_id:organizations[1].id}),null)
      assert.deepEqual(await snapshot(),before,
        "Role-only Owner must not persist permissions, block policy, audit or outboxes")
      process.stdout.write("PASS B22 protected Owner management: active role-only Owner 403 membership/invitation/audit/Store reads, invitation create and membership revoke; no invitations, membership or audit/outbox writes\n")
      process.stdout.write("PASS B22 CR-03 real Chrome/HTTP/PG16: active unprotected Owner 403 for grants and listings; service denies block and revoke, zero audit/outbox writes\n")
    }finally{
      await q("update da_organization_membership set role='member',protected_owner=false,updated_at=clock_timestamp() where id=$1",[alphaMember.id])
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
    }

    // Narrow only the trusted Owner invitation action while retaining the
    // same real pending invitation for restored-policy positive acceptance.
    const policyInvitations=await q(`select id,status,revoked_at,expires_at
      from da_organization_invitation where organization_id=$1 order by id`,
      [organizations[0].id])
    const policyAudits=await q(`select id from da_audit_event
      where organization_id=$1 order by id`,[organizations[0].id])
    const policyOutboxes=await q(`select x.id from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.organization_id=$1 order by x.id`,[organizations[0].id])
    const oldInvitationActions=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="buyer.purchase,products.edit"
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const ownerInvitationList=await browser.eval(`(async()=>{
        return (await fetch('/personal/invitations?organization='+${JSON.stringify(organizations[0].id)})).status;
      })()`)
      assert.equal(ownerInvitationList,200,
        "Legacy settings cannot remove protected Owner invitation access")
      assert.deepEqual(await q(`select id,status,revoked_at,expires_at
        from da_organization_invitation where organization_id=$1 order by id`,
        [organizations[0].id]),policyInvitations,"Denied invitation must not change any state")
      assert.deepEqual(await q(`select id from da_audit_event
        where organization_id=$1 order by id`,[organizations[0].id]),
        policyAudits,"Denied invitation must not append audit")
      assert.deepEqual(await q(`select x.id from da_audit_outbox x
        join da_audit_event e on e.id=x.source_audit_event_id
        where e.organization_id=$1 order by x.id`,[organizations[0].id]),
        policyOutboxes,"Denied invitation must not append outbox")
    }finally{
      if(oldInvitationActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=oldInvitationActions
    }
    const policyRestored=await browser.eval(`(async()=>{
      return (await fetch('/personal/invitations?organization='+${JSON.stringify(organizations[0].id)})).status
    })()`)
    assert.equal(policyRestored,200,"Restored policy permits Owner invitation read")
    // Positive authorization for the *same* pending invitation. The real
    // protected Alpha Owner now revokes it through browser HTTPS/CSRF and
    // the existing Medusa workflow. No test-only SQL mutation of the invite.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    const authorizedRevoke=await browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/invitations',{
        method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          action:"revoke",organization_id:organizations[0].id,
          invitation_id:pendingInvite.id
        })})
      })
      if(response.status!==200)return {status:response.status}
      const data=await response.json()
      return {status:response.status,id:data.invitation?.id,
        state:data.invitation?.status,revoked:!!data.invitation?.revoked_at}
    })()`)
    assert.deepEqual(authorizedRevoke,{
      status:200,id:pendingInvite.id,state:"revoked",revoked:true
    },"Protected Owner must revoke the same real pending invitation via HTTPS")
    const revokedInvite=await q(`select id,status,revoked_at
      from da_organization_invitation where id=$1 and organization_id=$2`,
      [pendingInvite.id,organizations[0].id])
    assert.equal(revokedInvite.length,1)
    assert.equal(revokedInvite[0].status,"revoked")
    assert.ok(revokedInvite[0].revoked_at)
    const revokeEvents=await q(`select e.action,e.actor_person_id,e.organization_id,
      e.target_id,x.id outbox_id from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.organization_id=$1 and e.target_id=$2
        and e.action='organization.invitation_revoked'`,
      [organizations[0].id,pendingInvite.id])
    assert.equal(revokeEvents.length,1,
      "Exactly one canonical invitation revocation audit/outbox is required")
    assert.equal(revokeEvents[0].actor_person_id,A.person)
    assert.equal(revokeEvents[0].organization_id,organizations[0].id)
    assert.equal(revokeEvents[0].target_id,pendingInvite.id)
    process.stdout.write("PASS B22 protected Owner management: real pending invitation HTTP 403 for role-only Owner with no DB/audit mutation; same invitation HTTPS 200 revoked by protected Owner with single audit/outbox\n")
    process.stdout.write("PASS B22 Owner role policy: fixed invitation.manage keeps Owner HTTPS list200; protected Owner revokes with audit/outbox\n")

    // Positive read-back for the SAME scoped endpoints: a genuine protected
    // Alpha Owner and a current ordinary Alpha Admin remain allowed. Use only
    // task-owned memberships; restore temporary Admin role in every outcome.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    const protectedReads=await browser.eval(`(async()=>{
      const org=${JSON.stringify(organizations[0].id)}
      return {
        memberships:(await fetch('/personal/memberships?organization='+org)).status,
        invitations:(await fetch('/personal/invitations?organization='+org)).status
      }
    })()`)
    assert.deepEqual(protectedReads,{memberships:200,invitations:200},
      "Real protected Alpha Owner keeps approved membership/invitation read access")
    const listPolicyMembershipBefore=await q(`select id,role,status,protected_owner,revoked_at
      from da_organization_membership where organization_id=$1 order by id`,[organizations[0].id])
    const listPolicyInvitationsBefore=await q(`select id,status,revoked_at from da_organization_invitation
      where organization_id=$1 order by id`,[organizations[0].id])
    const listPolicyAuditBefore=await q(`select id from da_audit_event
      where organization_id=$1 order by id`,[organizations[0].id])
    const listPolicyOutboxBefore=await q(`select x.id from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.organization_id=$1 order by x.id`,[organizations[0].id])
    const previousListPolicy=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    await q("update da_organization_membership set role='admin',protected_owner=false,updated_at=clock_timestamp() where id=$1",[alphaMember.id])
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="buyer.purchase,products.edit,invitation.manage,membership.manage"
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const protectedList=await browser.eval(`(async()=>{
        const response=await fetch('/personal/memberships?organization='+${JSON.stringify(organizations[0].id)})
        const body=await response.json()
        return {status:response.status,privateRows:Object.hasOwn(body,'memberships')}
      })()`)
      assert.deepEqual(protectedList,{status:200,privateRows:true},
        "Protected Owner membership list is fixed despite the legacy setting")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      const adminReads=await reviewer.eval(`(async()=>{
        const org=${JSON.stringify(organizations[0].id)}
        const session=await(await fetch('/personal/session')).json()
        const post=async(path,payload)=>{
          const r=await fetch(path,{method:'POST',
            headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
            body:JSON.stringify(payload)})
          return r.status
        }
        const memberships=await fetch('/personal/memberships?organization='+org)
        const invitations=await fetch('/personal/invitations?organization='+org)
        return {
          memberships:memberships.status,
          memberRows:Object.hasOwn(await memberships.json(),'memberships'),
          invitations:invitations.status,
          invitationRows:Object.hasOwn(await invitations.json(),'invitations'),
          roleChange:await post('/personal/memberships',{
            action:'role',organization_id:org,membership_id:${JSON.stringify(alphaMember.id)},role:'member'}),
          inviteCreate:await post('/personal/invitations',{
            action:'create',organization_id:org,email:'admin-role-only@example.invalid',role:'member'})
        }
      })()`)
      assert.deepEqual(adminReads,{
        memberships:403,memberRows:false,invitations:403,invitationRows:false,
        roleChange:403,inviteCreate:403,
      },"Role-only Admin must not read private records or change members/invitations")
    }finally{
      if(previousListPolicy===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=previousListPolicy
      await q("update da_organization_membership set role='member',protected_owner=false,updated_at=clock_timestamp() where id=$1",[alphaMember.id])
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
    }
    process.stdout.write("PASS B22 explicit permission: protected Owner reads 200; role-only Admin private reads, role edit and invitation create 403; no PG16 writes\n")

    const listPolicyRestored=await browser.eval(`(async()=>{
      return (await fetch('/personal/memberships?organization='+${JSON.stringify(organizations[0].id)})).status
    })()`)
    assert.equal(listPolicyRestored,200,"Owner membership.list returns after role policy restoration")
    assert.deepEqual(await q(`select id,status,revoked_at from da_organization_invitation
      where organization_id=$1 order by id`,[organizations[0].id]),
      listPolicyInvitationsBefore,"Admin denial cannot create or revoke invitations")
    assert.deepEqual(await q(`select id,role,status,protected_owner,revoked_at
      from da_organization_membership where organization_id=$1 order by id`,
      [organizations[0].id]),listPolicyMembershipBefore,
      "Denied membership read cannot change membership state")
    assert.deepEqual(await q(`select id from da_audit_event
      where organization_id=$1 order by id`,[organizations[0].id]),
      listPolicyAuditBefore,"Denied read cannot append audit")
    assert.deepEqual(await q(`select x.id from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.organization_id=$1 order by x.id`,[organizations[0].id]),
      listPolicyOutboxBefore,"Denied read cannot append outbox")
    process.stdout.write("PASS B22 Owner role policy: fixed membership.list keeps Owner HTTPS GET200; Admin403; PG16 data unchanged\n")

    // B is now a genuinely protected Gamma Owner for appeal notifications.
    // Use the already-existing independent large Member Organization, where
    // B has no membership, for the unchanged foreign read-denial condition.
    await verifyNativeOrganizationReadPolicy({
      container,ownerActor:A.actor,memberActor:B.actor,memberPersonId:B.person,
      alphaOrg:organizations[0].id,betaOrg:organizations[1].id,
      foreignOrg:largeMemberOrg.id,browser,q,
    })
    await verifyOwnerAuditTimelinePolicy({
      organizationId:organizations[0].id,adminMembershipId:alphaMember.id,
      browser,reviewer,q,
    })
    await verifyOwnerMembershipManagePolicy({
      organizationId:organizations[0].id,targetMembershipId:alphaMember.id,
      ownerPersonId:A.person,ownerActorId:A.actor,browser,foundation,q,
    })
    // Protected Owner writes a draft for their approved Store without grant.
    const ownerDraftAccess=await get('/personal/product-drafts?organization_id='+organizations[0].id)
    assert.equal(ownerDraftAccess.status,200)
    assert.ok(ownerDraftAccess.body.stores.some((row:any)=>row.id===ownerStoreId))
    assert.equal((await q("select count(*)::int n from da_store_product_permission where person_id=$1 and organization_id=$2 and seller_id=$3",[A.person,organizations[0].id,ownerStoreId]))[0].n,0)
    const priorProductOwnerActions=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="buyer.purchase"
      const deniedRead=await get('/personal/product-drafts?organization_id='+organizations[0].id)
      assert.equal(deniedRead.status,200)
      assert.ok(deniedRead.body.stores.some((row:any)=>row.id===ownerStoreId),
        "Immutable protected Owner products.edit keeps its approved Store visible")
    }finally{
      if(priorProductOwnerActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=priorProductOwnerActions
    }
    const restoredOwnerDraft=await get('/personal/product-drafts?organization_id='+organizations[0].id)
    assert.equal(restoredOwnerDraft.status,200)
    assert.ok(restoredOwnerDraft.body.stores.some((row:any)=>row.id===ownerStoreId))
    process.stdout.write("PASS B22 Owner role policy: fixed products.edit keeps approved Store visible via HTTP with legacy setting; no product intent write\n")
    // The role-policy change is server-side. Reopen the current real personal
    // document so its authorized Organization/Store read refreshes the hidden
    // draft panel; a server GET alone cannot update the already rendered DOM.
    await browser.send("Page.reload",{ignoreCache:true})
    await browser.wait("!document.getElementById('product-draft-panel').hidden")
    const draftTitle="B22 browser product draft "+rand
    await browser.input("#product-draft-form input[name=title]",draftTitle)
    await browser.eval(`document.querySelector('#product-draft-form select[name=seller_id]').value=${JSON.stringify(ownerStoreId)}`)
    await browser.click("#product-draft-form button[type=submit]")
    await until(async()=>{
      const result=await q("select id,status from product where title=$1",[draftTitle])
      return result.length===1&&result[0].status==="draft"
    },19000,"B22 actual personal draft native PG16 persistence")
    await browser.wait("document.getElementById('product-draft-status').textContent.includes('Ürün taslağı kaydedildi')")
    const [written]=await q("select id,status,metadata from product where title=$1",[draftTitle])
    assert.match(written.id,/^prod_[A-Za-z0-9_-]+$/)
    assert.equal(written.status,"draft")
    const requestId=written.metadata?.dogruadres_draft_request_id
    assert.match(requestId,/^dapd_[0-9a-f]{32}$/)
    assert.deepEqual((await q("select seller_id from product_seller where product_id=$1",[written.id]))
      .map((row:any)=>row.seller_id),[ownerStoreId])
    const [intent]=await q(`select status,person_id,organization_id,seller_id,product_id,
      completion_audit_event_id from da_product_draft_request where id=$1`,[requestId])
    assert.equal(intent.status,"created")
    assert.equal(intent.person_id,A.person)
    assert.equal(intent.organization_id,organizations[0].id)
    assert.equal(intent.seller_id,ownerStoreId)
    assert.equal(intent.product_id,written.id)
    const audit=await q(`select e.id from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.action='organization.product_draft_created'
        and e.actor_person_id=$2 and e.organization_id=$3 and e.target_id=$4
        and e.new_values->>'request_id'=$5 and e.new_values->>'product_id'=$6`,
      [intent.completion_audit_event_id,A.person,organizations[0].id,ownerStoreId,requestId,written.id])
    assert.equal(audit.length,1,"Real product draft and canonical outbox must correspond")
    const productRequest={request_id:requestId,organization_id:organizations[0].id,
      seller_id:ownerStoreId,title:draftTitle}
    const draftPost=async(payload:Record<string,string>)=>browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/product-drafts',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify(payload)})
      });return {status:response.status,body:await response.json()}
    })()`)
    const replayProduct=await draftPost(productRequest)
    assert.equal(replayProduct.status,200)
    assert.equal(replayProduct.body.product_id,written.id)
    const receiptProduct=await get('/personal/product-drafts?organization_id='+
      encodeURIComponent(organizations[0].id)+'&seller_id='+
      encodeURIComponent(ownerStoreId)+'&request_id='+encodeURIComponent(requestId))
    assert.equal(receiptProduct.status,200)
    assert.equal(receiptProduct.body.status,"created")
    assert.equal(receiptProduct.body.product_id,written.id)
    // Real CI PG16 "native committed, Foundation outcome lost" fixture:
    // reserve once, run the *actual Mercur* workflow with deterministic ID,
    // intentionally omit the Foundation completion, then recover through
    // the authenticated browser without a second native create.
    const recoveryKey="dapd_"+randomBytes(16).toString("hex")
    const recoveryId="prod_"+recoveryKey.slice(5)
    const recoveryTitle="B22 interrupted native draft "+rand
    const fingerprint=createHash("sha256").update(JSON.stringify([
      organizations[0].id,ownerStoreId,recoveryTitle
    ])).digest("hex")
    await q(`insert into da_product_draft_request
      (id,person_id,organization_id,seller_id,request_fingerprint)
      values ($1,$2,$3,$4,$5)`,[recoveryKey,A.person,organizations[0].id,ownerStoreId,fingerprint])
    const {result:recoveredNative}=await createProductsWorkflow(container).run({
      input:{products:[{
        id:recoveryId,title:recoveryTitle,status:"draft",seller_ids:[ownerStoreId],
        metadata:{dogruadres_draft_request_id:recoveryKey}
      }],created_by:ownerStoreId}
    })
    assert.equal(recoveredNative.length,1)
    assert.equal(recoveredNative[0].id,recoveryId,"Installed Mercur must preserve caller ID")
    const recoveryBefore=await get('/personal/product-drafts?organization_id='+
      encodeURIComponent(organizations[0].id)+'&seller_id='+
      encodeURIComponent(ownerStoreId)+'&request_id='+encodeURIComponent(recoveryKey))
    assert.equal(recoveryBefore.status,200)
    assert.equal(recoveryBefore.body.status,"review_required",
      "Native draft alone must not fabricate Foundation completion")
    const reconcile=async(payload:Record<string,string>)=>browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const r=await fetch('/personal/product-drafts',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify(payload)})
      });return {status:r.status,body:await r.json()}
    })()`)
    const reconcilePayload={...productRequest,request_id:recoveryKey,
      title:recoveryTitle,action:"reconcile"}
    const recoveredOnce=await reconcile(reconcilePayload)
    assert.equal(recoveredOnce.status,200)
    assert.deepEqual(recoveredOnce.body,{status:"created",product_id:recoveryId})
    const recoveredAgain=await reconcile(reconcilePayload)
    assert.equal(recoveredAgain.status,200)
    assert.deepEqual(recoveredAgain.body,{status:"created",product_id:recoveryId})
    const [recoveredLedger]=await q(`select status,product_id,completion_audit_event_id
      from da_product_draft_request where id=$1`,[recoveryKey])
    assert.equal(recoveredLedger.status,"created")
    assert.equal(recoveredLedger.product_id,recoveryId)
    const nativeCount=await q(`select count(*)::int n from product
      where id=$1 and title=$2 and metadata->>'dogruadres_draft_request_id'=$3`,
      [recoveryId,recoveryTitle,recoveryKey])
    assert.equal(nativeCount[0].n,1,"Reconcile must not create another product")
    assert.deepEqual((await q("select seller_id from product_seller where product_id=$1",[recoveryId]))
      .map((x:any)=>x.seller_id),[ownerStoreId])
    const proofCount=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.action='organization.product_draft_created'
        and e.new_values->>'request_id'=$2 and e.new_values->>'product_id'=$3`,
      [recoveredLedger.completion_audit_event_id,recoveryKey,recoveryId])
    assert.equal(proofCount[0].n,1,"Reconciled outcome needs canonical audit/outbox")
    // A reserved request with no native product must NOT be turned into a
    // false success or trigger a product create on a reconcile-only request.
    const absentKey="dapd_"+randomBytes(16).toString("hex")
    await q(`insert into da_product_draft_request
      (id,person_id,organization_id,seller_id,request_fingerprint)
      values($1,$2,$3,$4,$5)`,[absentKey,A.person,organizations[0].id,ownerStoreId,
      createHash("sha256").update(JSON.stringify([organizations[0].id,ownerStoreId,recoveryTitle])).digest("hex")])
    const absent=await reconcile({...reconcilePayload,request_id:absentKey})
    assert.equal(absent.status,200)
    assert.equal(absent.body.status,"review_required")
    assert.equal((await q("select status from da_product_draft_request where id=$1",[absentKey]))[0].status,"reserved")
    assert.equal((await q("select count(*)::int n from product where id=$1",
      ["prod_"+absentKey.slice(5)]))[0].n,0)
    process.stdout.write("PASS B22 native reconciliation confirmed: real Mercur draft already committed, Foundation reserved, authenticated Chrome repair with canonical audit/outbox and zero duplicate products; absent native record stays reserved\\n")
    assert.equal((await draftPost({...productRequest,title:draftTitle+" changed"})).status,403)
    assert.equal((await draftPost({...productRequest,organization_id:organizations[1].id})).status,403)
    assert.equal((await q("select count(*)::int n from product where title=$1",[draftTitle]))[0].n,1)
    assert.equal((await q("select count(*)::int n from da_product_draft_request where id=$1",[requestId]))[0].n,1)
    // A different Alpha Member, even a Beta Owner/platform reviewer, cannot
    // use A's intent or product without the independent products.edit grant.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const memberCannotWrite=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/product-drafts',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({...productRequest,request_id:"dapd_"+randomBytes(16).toString("hex")})})
      });return response.status
    })()`)
    assert.equal(memberCannotWrite,403)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    assert.equal((await q("select count(*)::int n from da_store_product_permission where person_id=$1 and organization_id=$2 and seller_id=$3 and revoked_at is null",[A.person,organizations[0].id,ownerStoreId]))[0].n,0)
    assert.equal((await draftPost(productRequest)).status,200,
      "Protected Owner's completed draft remains available without an explicit grant")
    assert.equal((await get('/personal/product-drafts?organization_id='+
      encodeURIComponent(organizations[0].id)+'&seller_id='+
      encodeURIComponent(ownerStoreId)+'&request_id='+encodeURIComponent(requestId))).status,200)
    assert.equal((await q("select count(*)::int n from product where title=$1",[draftTitle]))[0].n,1)
    process.stdout.write("PASS B22 Chrome: protected Owner native draft without self grant, PG16 product_seller/audit/outbox, exact replay no duplicate, conflicting key/foreign Member denied\\n")

    // B22 PG16 negative race: the native INSERT is held while a current
    // protected Owner revokes a different ordinary Member's products.edit.
    // The real Chrome requests and native Mercur workflow run unmocked.
    let raceFn=false,raceTrigger=false
    const raceBarrier=new Client({connectionString:u.toString()})
    await raceBarrier.connect()
    let raceBarrierHeld=false
    const raceKey="dapd_"+randomBytes(16).toString("hex")
    const raceProductId="prod_"+raceKey.slice("dapd_".length)
    const raceTitle="B22 native products edit race "+rand
    try{
      const [roles]=await q("select count(*)::int n from da_organization_membership where organization_id=$1 and protected_owner=true and status='active'",[organizations[0].id])
      assert.equal(roles.n,1)
      const ownerEdit=async(action:"grant"|"revoke")=>{
        const intent={action,organization_id:organizations[0].id,
          seller_id:ownerStoreId,membership_id:alphaMember.id}
        return browser.eval("(async()=>{const s=await(await fetch('/personal/session')).json();"+
          "const r=await fetch('/personal/store-product-permissions',{method:'POST',"+
          "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
          "body:JSON.stringify("+JSON.stringify(intent)+")});"+
          "return {status:r.status,body:await r.json()}})()")
      }
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const grant=await ownerEdit("grant")
      assert.equal(grant.status,200)
      const grantRow=await q("select id from da_store_product_permission where person_id=$1 and organization_id=$2 and seller_id=$3 and revoked_at is null",[B.person,organizations[0].id,ownerStoreId])
      assert.equal(grantRow.length,1)
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      // The test changed the platform company policy while this second
      // browser was elsewhere. Rebuild the authenticated Organization list
      // through the same real Page.reload path used by earlier B22 scenarios.
      // This must not grant authority or manufacture a Member option.
      await reviewer.send("Page.reload",{ignoreCache:true})
      await reviewer.wait("document.getElementById('workspace').hidden===false")
      await reviewer.select(organizations[0].name,"member")
      const memberDraftStores=()=>reviewer.eval(`(async()=>{
        const r=await fetch('/personal/product-drafts?organization_id='+${JSON.stringify(organizations[0].id)})
        if(r.status!==200)return {status:r.status,stores:[]}
        const body=await r.json()
        return {status:r.status,stores:(body.stores||[]).map(x=>x.id)}
      })()`)
      assert.equal((await memberDraftStores()).status,403,
        "A Foundation products.edit grant alone is not native Member identity proof")
      // The real personal UI must show an actionable explanation but cannot
      // expose a product form or re-enable its submit button after 403.
      await reviewer.wait("!document.getElementById('product-draft-panel').hidden && !document.getElementById('product-draft-guidance').hidden && document.getElementById('product-draft-form').hidden && document.querySelector('#product-draft-form button').disabled")
      assert.equal(Number((await q(`select count(*)::int n from da_verified_actor_binding
        where person_id=$1 and actor_type='member' and revoked_at is null`,
        [B.person]))[0].n),0)
      // Use the same real secondary password + native MFA verified account
      // linking UI as A. Do not fake the Person binding or accept email alone.
      assert.ok(Math.floor(Date.now()/30000)>bMemberEnrollCounter,
        "Secondary B challenge must not replay the enrollment TOTP window")
      await reviewer.input("#link-account input[name=email]",bMemberEmail)
      await reviewer.input("#link-account input[name=password]",bMemberPassword)
      await reviewer.click("#link-account button")
      await reviewer.wait("!document.getElementById('link-confirm').hidden")
      await reviewer.input("#link-confirm input[name=code]",otp(bMemberMfa.secret))
      await reviewer.click("#link-confirm button")
      await reviewer.wait("document.getElementById('status').textContent==='Hesap bağlantısı tamamlandı'")
      const bMemberBindings=await q(`select actor_id from da_verified_actor_binding
        where person_id=$1 and actor_type='member' and revoked_at is null`,[B.person])
      assert.equal(bMemberBindings.length,1)
      assert.equal(bMemberBindings[0].actor_id,bNativeMember.id)

      await verifyOwnerSubmittedMemberDraft(reviewer,browser,organizations,rand,B.person,native,q)

      const withoutStore=await memberDraftStores()
      assert.deepEqual(withoutStore,{status:200,stores:[]},
        "A verified Member without a native SellerMember association has no Store")
      await reviewer.click("#product-draft-refresh")
      await reviewer.wait("document.getElementById('product-draft-form').hidden && !document.getElementById('product-draft-guidance').hidden && document.getElementById('product-draft-status').textContent.includes('bulunamadı')")
      const intendedConnection={organization_id:organizations[0].id,
        seller_id:ownerStoreId,membership_id:alphaMember.id}
      const connectionResponse=async(actor:B06Chrome,input:Record<string,string>,
        withCsrf=true)=>actor.eval(`(async()=>{
          const sr=await fetch('/personal/session')
          if(sr.status!==200)return sr.status
          const current=await sr.json()
          const r=await fetch('/personal/store-member-connections',{
            method:'POST',headers:{'content-type':'application/json',
              ...( ${JSON.stringify(withCsrf)} ? {'x-csrf-token':current.csrf_token} : {})},
            body:JSON.stringify(${JSON.stringify(input)})
          })
          return r.status
        })()`)
      assert.equal(await connectionResponse(reviewer,intendedConnection),403,
        "Ordinary Organization Member cannot connect their own native Seller role")
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      assert.equal(await connectionResponse(browser,intendedConnection,false),403,
        "Owner cannot omit first-party CSRF")
      assert.equal(await connectionResponse(browser,{...intendedConnection,
        organization_id:organizations[1].id}),403,
        "Owner cannot use an unrelated Organization to activate an Alpha Member")
      assert.equal(await connectionResponse(browser,{...intendedConnection,
        membership_id:"damem_foreign"}),403,
        "Only the Owner's current active Organization membership is valid")
      assert.equal(await connectionResponse(browser,{...intendedConnection,
        member_id:bNativeMember.id}),400,
        "Browser must never choose the native Member identity")
      assert.equal((await native.listSellerMembers({
        seller_id:ownerStoreId,member_id:bNativeMember.id
      })).length,0,"All pre-activation negative checks leave native SellerMember absent")
      assert.equal((await q(`select count(*)::int n from da_audit_event
        where action='organization.store_native_member_connection_confirmed'
          and organization_id=$1 and target_id=$2`,
        [organizations[0].id,ownerStoreId]))[0].n,0)
      process.stdout.write("\nPASS B22 Chrome: native Store member connection unauthorized/foreign/CSRF/forged denied, no SellerMember or audit\n")
      // Complete the EXISTING native Member association through the real
      // Owner browser UI; never let a test-only service call stand in for
      // a user-facing product operation.
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      await browser.click("#product-grants-refresh")
      await browser.wait("!!document.querySelector('#product-grants-list button.store-member-connect')")
      await browser.click("#product-grants-list button.store-member-connect")
      await browser.wait("document.getElementById('product-grants-status').textContent.includes('Mağaza çalışanı bağlantısı tamamlandı')")
      const nativeLinks=await native.listSellerMembers({
        seller_id:ownerStoreId,member_id:bNativeMember.id
      })
      assert.equal(nativeLinks.length,1)
      assert.equal(nativeLinks[0].is_owner,false)
      assert.equal(nativeLinks[0].role_id,"role_seller_support")
      const confirmed=await q(`select e.id from da_audit_event e
        join da_audit_outbox x on x.source_audit_event_id=e.id
        where e.action='organization.store_native_member_connection_confirmed'
          and e.organization_id=$1 and e.target_id=$2
          and e.new_values->>'person_id'=$3
          and e.new_values->>'member_id'=$4`,
        [organizations[0].id,ownerStoreId,B.person,bNativeMember.id])
      assert.equal(confirmed.length,1,"Owner native membership requires canonical Foundation audit/outbox")
      const replayConnected=await browser.eval("(async()=>{"+
        "const s=await (await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/store-member-connections',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify("+JSON.stringify({
          organization_id:organizations[0].id,seller_id:ownerStoreId,membership_id:alphaMember.id
        })+")});return {status:r.status,body:await r.json()}})()")
      assert.equal(replayConnected.status,200)
      assert.equal(replayConnected.body.status,"connected")
      assert.equal((await native.listSellerMembers({
        seller_id:ownerStoreId,member_id:bNativeMember.id
      })).length,1)
      assert.equal((await q(`select count(*)::int n from da_audit_event
        where action='organization.store_native_member_connection_confirmed'
        and organization_id=$1 and target_id=$2
        and new_values->>'person_id'=$3`,
        [organizations[0].id,ownerStoreId,B.person]))[0].n,1,
        "Idempotent native link must not duplicate canonical audit")
      process.stdout.write("PASS B22 Chrome: native Store member connection via Owner UI persisted one SellerMember and one canonical audit; replay unchanged\n")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      await reviewer.click("#product-draft-refresh")
      await reviewer.wait("!document.getElementById('product-draft-panel').hidden && document.getElementById('product-draft-guidance').hidden && !document.getElementById('product-draft-form').hidden && !document.querySelector('#product-draft-form button').disabled && [...document.querySelector('#product-draft-form select[name=seller_id]').options].some(o=>o.value==="+JSON.stringify(ownerStoreId)+")")
      process.stdout.write("PASS B22 Chrome: denied native Member/Store UI stays visible without product submit; verified association enables product form\n")
      // B06Chrome.ready() waits for the Owner-only membership panel.
      // This actor is an ordinary Member; verify the actual product scope instead.
      const memberScope=await reviewer.eval(`(async()=>{
        const r=await fetch('/personal/product-drafts?organization_id='+${JSON.stringify(organizations[0].id)})
        if(r.status!==200)return {status:r.status,stores:[]}
        const body=await r.json()
        return {status:r.status,stores:(body.stores||[]).map(x=>x.id)}
      })()`)
      assert.equal(memberScope.status,200,"Real Member must reach private draft API with approved grant")
      assert.ok(memberScope.stores.includes(ownerStoreId),
        "Actual Member must see only their Organization's approved Store")
      // Task-owned disposable PG16 only. ID is generated hex, not user input.
      await q("create function b22_native_product_pause_v1() returns trigger language plpgsql as $b22$ begin if NEW.id='"+raceProductId+"' then perform pg_advisory_xact_lock(hashtext('b22-native-draft-pause'),hashtext('"+raceProductId+"')); end if; return NEW; end $b22$")
      raceFn=true
      await q("create trigger b22_native_product_pause_v1 after insert on product for each row execute function b22_native_product_pause_v1()")
      raceTrigger=true
      await raceBarrier.query("BEGIN")
      raceBarrierHeld=true
      const barrierPid=(await raceBarrier.query("select pg_backend_pid()::int pid")).rows[0].pid as number
      await raceBarrier.query("select pg_advisory_xact_lock(hashtext('b22-native-draft-pause'),hashtext($1))",[raceProductId])
      const racePayload={request_id:raceKey,organization_id:organizations[0].id,
        seller_id:ownerStoreId,title:raceTitle}
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      let createDone=false
      const createPending=reviewer.eval("(async()=>{const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/product-drafts',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify("+JSON.stringify(racePayload)+")});"+
        "return {status:r.status,body:await r.json()}})()"
      ).then((result:any)=>{createDone=true;return result},(err:unknown)=>{createDone=true;throw err})
      const waiters=async(pid:number)=>Number((await q(
        "select count(*)::int n from pg_locks h join pg_locks w "+
        "on w.locktype=h.locktype and w.database=h.database and w.classid=h.classid "+
        "and w.objid=h.objid and w.objsubid=h.objsubid and w.pid<>h.pid "+
        "and w.granted=false where h.pid=$1 and h.locktype='advisory' and h.granted=true",
        [pid]))[0].n)
      await until(async()=>await waiters(barrierPid)===1||createDone,19000,
        "B22 native Member product INSERT waits on task-only PG16 transaction barrier")
      if(createDone){
        const early=await createPending
        assert.fail("Member product draft exited before native INSERT: HTTP "+early.status)
      }
      assert.equal(createDone,false)
      assert.equal((await q("select status from da_product_draft_request where id=$1",[raceKey]))[0].status,"reserved")
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      let revokeDone=false
      const revokePending=ownerEdit("revoke").then(
        (x:any)=>{revokeDone=true;return x},(e:unknown)=>{revokeDone=true;throw e})
      await until(async()=>{
        const [row]=await q(
          "select count(*)::int n from pg_locks h join pg_locks w "+
          "on w.locktype=h.locktype and w.database=h.database and w.classid=h.classid "+
          "and w.objid=h.objid and w.objsubid=h.objsubid and w.pid<>h.pid "+
          "and w.granted=false where h.pid<>$1 and h.locktype='advisory' and h.granted=true",
          [barrierPid])
        return row.n>=1
      },19000,"B22 real Owner revoke waits on product creation authorization lock")
      assert.equal(revokeDone,false)
      assert.equal(createDone,false)
      assert.equal((await q("select count(*)::int n from da_store_product_permission where id=$1 and revoked_at is null",[grantRow[0].id]))[0].n,1)
      assert.equal((await q("select count(*)::int n from product where id=$1",[raceProductId]))[0].n,0)
      await raceBarrier.query("ROLLBACK")
      raceBarrierHeld=false
      const created=await createPending,revoked=await revokePending
      assert.ok([201,403].includes(created.status),
        "HTTP may observe revocation after the prior authorized native commit")
      assert.equal(revoked.status,200)
      assert.equal(revoked.body.status,"revoked")
      const [ledger]=await q("select status,product_id,completion_audit_event_id,completed_at from da_product_draft_request where id=$1",[raceKey])
      const [revocation]=await q("select revoked_at from da_store_product_permission where id=$1",[grantRow[0].id])
      assert.equal(ledger.status,"created")
      assert.equal(ledger.product_id,raceProductId)
      assert.ok(revocation.revoked_at)
      assert.ok(new Date(ledger.completed_at).getTime()<new Date(revocation.revoked_at).getTime(),
        "The native and Foundation product completion must precede revoke")
      assert.equal((await q("select count(*)::int n from product where id=$1",[raceProductId]))[0].n,1)
      assert.deepEqual((await q("select seller_id from product_seller where product_id=$1",[raceProductId])).map((v:any)=>v.seller_id),[ownerStoreId])
      assert.equal((await q("select count(*)::int n from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id where e.id=$1 and e.action='organization.product_draft_created' and e.actor_person_id=$2 and e.organization_id=$3 and e.new_values->>'request_id'=$4 and e.new_values->>'product_id'=$5",[ledger.completion_audit_event_id,B.person,organizations[0].id,raceKey,raceProductId]))[0].n,1)
      const deniedPayload={...racePayload,request_id:"dapd_"+randomBytes(16).toString("hex"),title:"B22 denied after revoke "+rand}
      const memberDraftPost=async(payload:Record<string,string>)=>reviewer.eval(`(async()=>{
        const session=await(await fetch('/personal/session')).json()
        const r=await fetch('/personal/product-drafts',{method:'POST',
          headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
          body:JSON.stringify(${JSON.stringify(payload)})})
        return {status:r.status}
      })()`)
      const denied=await memberDraftPost(deniedPayload)
      assert.equal(denied.status,403)
      assert.equal((await q("select count(*)::int n from product where title=$1",[deniedPayload.title]))[0].n,0)
      assert.equal((await memberDraftPost(racePayload)).status,403,"Revoke must block replay of the earlier product")
      // A persistent Mercur SellerMember is no longer sufficient after Owner
      // revokes the independent, audited DoğruAdres products.edit permission.
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      assert.equal(await connectionResponse(browser,intendedConnection),403,
        "Revoked products.edit denies even an existing native Store link")
      const nativeAfterRevoke=await native.listSellerMembers({
        seller_id:ownerStoreId,member_id:bNativeMember.id
      })
      assert.equal(nativeAfterRevoke.length,1)
      assert.equal(nativeAfterRevoke[0].is_owner,false)
      assert.equal((await q(`select count(*)::int n from da_audit_event
        where action='organization.store_native_member_connection_confirmed'
          and organization_id=$1 and target_id=$2
          and new_values->>'person_id'=$3`,
        [organizations[0].id,ownerStoreId,B.person]))[0].n,1,
        "Denied reconnection must not add a second Foundation audit")
      process.stdout.write("\nPASS B22 Chrome: revoked products.edit prevents native Store connection via Owner HTTP; SellerMember and canonical audit unchanged\n")
      process.stdout.write("PASS B22 Chrome: real native Member product INSERT and Owner products.edit revoke serialized on PG16; committed product/audit predates revoke; next Member HTTP 403 and zero new product\n")
    }finally{
      if(raceBarrierHeld)await raceBarrier.query("ROLLBACK")
      await raceBarrier.end()
      if(raceTrigger)await q("drop trigger if exists b22_native_product_pause_v1 on product")
      if(raceFn)await q("drop function if exists b22_native_product_pause_v1()")
      // Ordinary Member permission race requires no protected Owner role mutation.
      await browser.send("Page.bringToFront")
      await browser.send("Page.reload",{ignoreCache:true})
      await reviewer.send("Page.reload",{ignoreCache:true})
    }


    // B22 protected Owner removal denial vs real native Seller creation.
    // The same second Gamma Owner membership was already issued for the real
    // two-Owner notification acceptance before Customer unlink.
    const secondGammaOwner={id:secondGammaOwnerId}
    assert.match(secondGammaOwner.id,/^[A-Za-z0-9_-]+$/)
    // The second Owner may not bypass #39 notice/appeal gate in flight.
    const ownerRaceEmail="b22-owner-revoke-race-"+rand+"@example.invalid"
    const ownerRaceName="B22 Owner race Store "+rand
    const ownerRaceRequest={organization_id:sellerGamma.id,
      application_id:"daapp_"+randomBytes(16).toString("hex"),
      name:ownerRaceName,email:ownerRaceEmail,currency_code:"try"}
    const ownerRaceBarrier=new Client({connectionString:u.toString()})
    await ownerRaceBarrier.connect()
    let ownerBarrierHeld=false,ownerPauseFn=false,ownerPauseTrigger=false
    let gammaPolicyFinished=false
    let gammaPolicyPending:Promise<{value?:{status:number};error?:string}>|undefined
    try{
      const [gammaMembershipBeforeRace]=await q(
        "select status,protected_owner from da_organization_membership where id=$1",
        [gammaOwnerMembership.id])
      assert.equal(gammaMembershipBeforeRace.status,"active")
      assert.equal(gammaMembershipBeforeRace.protected_owner,true)
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      // The prior product-race test reloads the Chrome page. Wait for the
      // async Organization list, not merely for the workspace shell.
      await browser.wait(`!document.getElementById('workspace').hidden &&
        Array.from(document.querySelectorAll('#organizations button')).some(
          b=>b.textContent===${JSON.stringify(sellerGamma.name+" — owner")})`)
      await browser.select(sellerGamma.name,"owner")
      await q("create function b22_native_seller_owner_pause_v1() returns trigger language plpgsql as $b22$ begin if NEW.email='"+ownerRaceEmail+"' then perform pg_advisory_xact_lock(hashtext('b22-native-owner-create-pause'),hashtext('"+ownerRaceEmail+"')); end if; return NEW; end $b22$")
      ownerPauseFn=true
      await q("create trigger b22_native_seller_owner_pause_v1 after insert on seller for each row execute function b22_native_seller_owner_pause_v1()")
      ownerPauseTrigger=true
      await ownerRaceBarrier.query("BEGIN")
      ownerBarrierHeld=true
      const ownerBarrierPid=(await ownerRaceBarrier.query("select pg_backend_pid()::int pid")).rows[0].pid as number
      await ownerRaceBarrier.query("select pg_advisory_xact_lock(hashtext('b22-native-owner-create-pause'),hashtext($1))",[ownerRaceEmail])
      let ownerCreateFinished=false
      const ownerCreatePending=browser.eval("(async()=>{const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/store-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify("+JSON.stringify(ownerRaceRequest)+")});"+
        "return {status:r.status,body:await r.json()}})()"
      ).then((v:any)=>{ownerCreateFinished=true;return v},
        (e:unknown)=>{ownerCreateFinished=true;throw e})
      await until(async()=>{
        const [w]=await q("select count(*)::int n from pg_locks h join pg_locks w on w.locktype=h.locktype and w.database=h.database and w.classid=h.classid and w.objid=h.objid and w.objsubid=h.objsubid and w.pid<>h.pid and w.granted=false where h.pid=$1 and h.locktype='advisory' and h.granted=true",[ownerBarrierPid])
        return w.n===1
      },19000,"Actual Mercur Seller INSERT blocked by task-owned PG16 advisory barrier")
      assert.equal(ownerCreateFinished,false)
      assert.equal((await q("select status from da_store_application where id=$1",[ownerRaceRequest.application_id]))[0].status,"creating",
        "Native Store creation must follow an independently COMMITTED idempotency claim")
      assert.equal((await q("select count(*)::int n from seller where email=$1",[ownerRaceEmail]))[0].n,0,
        "Native Seller insertion is uncommitted while its transaction waits")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      // This same real native Seller creation holds the legal Organization
      // row FOR SHARE across its Foundation authorization + native Mercur
      // create workflow. A separate platform policy POST must wait on UPDATE.
      // No second fixture Seller or mocked transaction is introduced.
      const gammaPolicyReason="B22 concurrent native creation policy pause"
      gammaPolicyPending=companyRight(false,true,gammaPolicyReason,true,sellerGamma.id).then(
        value=>{gammaPolicyFinished=true;return {value}},
        error=>{gammaPolicyFinished=true;return {error:String(error)}})
      await until(async()=>{
        const [w]=await q(`select count(*)::int n from pg_stat_activity
          where datname=current_database() and wait_event_type='Lock'
            and query ilike '%store_application_enabled%'
            and query ilike '%da_organization%'
            and query ilike '%for update%'`)
        return w.n>=1
      },19000,"Gamma policy disable waits on real native Mercur Seller INSERT")
      assert.equal(gammaPolicyFinished,false,
        "Platform company pause cannot commit while native Store creation is in flight")
      assert.equal(ownerCreateFinished,false,
        "Native creation is genuinely in flight while company policy waits")
      assert.deepEqual(await q("select store_application_enabled from da_organization where id=$1",
        [sellerGamma.id]),[{store_application_enabled:true}])
      assert.equal((await q(`select count(*)::int n from da_audit_event
        where organization_id=$1 and action='organization.store_application_right_disabled'
          and new_values->>'reason'=$2`,[sellerGamma.id,gammaPolicyReason]))[0].n,0,
        "Concurrent company close must not write canonical audit before its row lock")
      // Launch the pre-existing protected Owner-removal negative while the
      // Seller INSERT is still in-flight. Crucially, start the POLICY request
      // first: both use Person B, whose Foundation session row is locked per
      // request. Otherwise the policy would wait on the session rather than
      // on the Organization row, creating false concurrency evidence.
      const ownerRevokeRequest={
        action:"revoke",organization_id:sellerGamma.id,
        membership_id:gammaOwnerMembership.id
      }
      let ownerRevokeFinished=false
      const ownerRevokePending=reviewer.eval("(async()=>{const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/memberships',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify("+JSON.stringify(ownerRevokeRequest)+")});"+
        "return {status:r.status,body:await r.json()}})()"
      ).then((v:any)=>{ownerRevokeFinished=true;return v},
        (e:unknown)=>{ownerRevokeFinished=true;throw e})
      // The Owner-revoke call is now in flight while native Seller INSERT
      // remains blocked, and B's policy request holds its session lock.
      // The revocation must still fail without touching the protected Owner.
      const [stillOwner]=await q("select status,protected_owner from da_organization_membership where id=$1",[gammaOwnerMembership.id])
      assert.equal(stillOwner.status,"active")
      assert.equal(stillOwner.protected_owner,true)
      await ownerRaceBarrier.query("ROLLBACK")
      ownerBarrierHeld=false
      const [submitted,revoked,gammaPolicyResult]=await Promise.all([
        ownerCreatePending,ownerRevokePending,gammaPolicyPending])
      assert.equal(gammaPolicyResult?.value?.status,200,
        gammaPolicyResult?.error||"Platform pause must serialize AFTER real native creation")
      assert.deepEqual(await q("select store_application_enabled from da_organization where id=$1",
        [sellerGamma.id]),[{store_application_enabled:false}])
      assert.equal(revoked.status,403,
        "A second Owner cannot bypass the 10+20 guarded removal process")
      assert.equal(ownerRevokeFinished,true)
      assert.equal(submitted.status,201,
        "Committed native Seller must survive attempted unauthorized Owner removal")
      assert.equal(submitted.body.status,"pending_approval")
      assert.match(submitted.body.seller_id,/^sel_[A-Za-z0-9_-]+$/)
      const [preservedOwner]=await q("select status,protected_owner,revoked_at from da_organization_membership where id=$1",[gammaOwnerMembership.id])
      assert.equal(preservedOwner.status,"active")
      assert.equal(preservedOwner.protected_owner,true)
      assert.equal(preservedOwner.revoked_at,null)
      assert.equal((await q("select count(*)::int n from da_audit_event where target_id=$1 and action='organization.membership_changed'",[gammaOwnerMembership.id]))[0].n,0,
        "Denied Owner revocation must not append membership audit")
      const [ownerRaceLedger]=await q("select status,seller_id from da_store_application where id=$1",[ownerRaceRequest.application_id])
      assert.equal(ownerRaceLedger.status,"created")
      assert.equal(ownerRaceLedger.seller_id,submitted.body.seller_id)
      const nativeSeller=await native.listSellers({id:submitted.body.seller_id})
      assert.equal(nativeSeller.length,1)
      assert.equal(nativeSeller[0].status,"pending_approval")
      assert.equal(nativeSeller[0].approved_at,null,
        "Owner submission must never itself approve Store sales")
      assert.equal((await q("select count(*)::int n from seller where email=$1",[ownerRaceEmail]))[0].n,1)
      assert.equal((await q("select count(*)::int n from da_organization_seller_ownership o join da_audit_event e on e.id=o.verification_audit_event_id join da_audit_outbox x on x.source_audit_event_id=e.id where o.organization_id=$1 and o.seller_id=$2 and o.revoked_at is null and e.action='organization.store_application_created' and e.new_values->>'application_id'=$3",[sellerGamma.id,submitted.body.seller_id,ownerRaceRequest.application_id]))[0].n,1,
        "Owner native Seller requires exactly one authoritative Org link and audit/outbox")
      // A single authorized policy change after a real native Seller INSERT
      // has one audit/outbox and one receipt per CURRENT protected Owner.
      const gammaPolicyAudit=await q(`select e.id,x.id as outbox_id
        from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
        where e.organization_id=$1 and e.action='organization.store_application_right_disabled'
          and e.new_values->>'reason'=$2`,[sellerGamma.id,gammaPolicyReason])
      assert.equal(gammaPolicyAudit.length,1,"Exactly one company policy audit/outbox for racing native creation")
      const gammaOwners=await q(`select m.person_id from da_organization_membership m
        join da_person p on p.id=m.person_id
        where m.organization_id=$1 and m.role='owner' and m.protected_owner=true
          and m.status='active' and m.deleted_at is null and p.disabled_at is null
          and p.deleted_at is null order by m.person_id`,[sellerGamma.id])
      assert.equal(gammaOwners.length,2,"Two protected Gamma Owners remain after denied Owner removal")
      const gammaReceipts=await q(`select person_id from da_notification_receipt
        where audit_event_id=$1 order by person_id`,[gammaPolicyAudit[0].id])
      assert.deepEqual(gammaReceipts,gammaOwners,"Only current Gamma Owners receive the private policy notice")
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const deniedGammaId="daapp_"+randomBytes(16).toString("hex")
      const gammaSubmitDenied=await browser.callFunction(
        "async function(org,id){const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/store-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify({organization_id:org,application_id:id,"+
        "name:'B22 Gamma post race denied',"+
        "email:'b22-gamma-policy-denied@example.invalid',currency_code:'try'})});"+
        "return r.status;}",sellerGamma.id,deniedGammaId)
      assert.equal(gammaSubmitDenied,403,
        "After racing native creation, Gamma policy must deny subsequent Owner requests")
      assert.equal((await q("select count(*)::int n from da_store_application where id=$1",
        [deniedGammaId]))[0].n,0,"Policy denial must not reserve a new Seller claim")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      assert.equal((await companyRight(true,false,
        "B22 post creation race company resume",true,sellerGamma.id)).status,200)
      assert.deepEqual(await q("select store_application_enabled from da_organization where id=$1",
        [sellerGamma.id]),[{store_application_enabled:true}])
      assert.equal((await native.listSellers({id:submitted.body.seller_id}))[0].status,
        "pending_approval","Reopening only restores the queue; no automatic Seller approval")
      process.stdout.write("PASS B22 Chrome/HTTP/PG16: native Mercur Seller creation holds company policy SHARE lock, concurrent platform disable waits then commits, single audit/outbox and two Owner notices; later creation403; pending Seller preserved on reopen\n")
      process.stdout.write("PASS B22 Chrome: native Seller creation serialized before denied protected Owner removal; Seller pending, Owner remains active, no unauthorized membership audit\n")
    }finally{
      if(ownerBarrierHeld)await ownerRaceBarrier.query("ROLLBACK")
      if(gammaPolicyPending)await Promise.allSettled([gammaPolicyPending])
      await ownerRaceBarrier.end()
      if(ownerPauseTrigger)await q("drop trigger if exists b22_native_seller_owner_pause_v1 on seller")
      if(ownerPauseFn)await q("drop function if exists b22_native_seller_owner_pause_v1()")
      // The denied Gamma Owner removal leaves A's protected membership intact.
      // Restore Alpha workspace for the following independent browser cases.
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const stillPersonal=await get("/personal/session")
      assert.equal(stillPersonal.status,200,
        "Denied Gamma Owner removal must not terminate A's Alpha Person session")
      await browser.select(organizations[0].name,"owner")
      // Reload only after switching back to Alpha; the Organization list
      // remains authoritative, and no permission observer is bypassed.
      await browser.send("Page.reload",{ignoreCache:true})
      await browser.wait(`(()=>{
        if(document.getElementById('workspace').hidden)return false
        const detail=JSON.parse(document.getElementById('detail').textContent||'{}')
        return detail.id===${JSON.stringify(organizations[0].id)} && detail.role==='owner'
      })()`)
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
    }

    // Native Member context now requires the SAME live legal Organization
    // used by the personal Store list; SellerMember alone is insufficient.
    const storeContext=(org:string,seller:string)=>
      '/personal/contexts?type=member&organization='+encodeURIComponent(org)+
      '&seller='+encodeURIComponent(seller)
    const authorizedContext=await get(storeContext(organizations[0].id,ownerStoreId))
    assert.equal(authorizedContext.status,200,
      "B22 native Member context response category: "+
      (typeof authorizedContext.body?.message==="string"?
        authorizedContext.body.message.slice(0,50):"unavailable"))
    assert.equal(authorizedContext.body.organization_id,organizations[0].id)
    assert.equal(authorizedContext.body.seller.id,ownerStoreId)
    assert.equal((await get(storeContext(organizations[1].id,ownerStoreId))).status,403)
    assert.equal((await get('/personal/contexts?type=member&seller='+ownerStoreId)).status,400)
    const replayApprove=await reviewer.eval(`(async()=>{
      const session=await (await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({application_id:applicationId,seller_id:ownerStoreId})})})
      return response.status
    })()`)
    assert.equal(replayApprove,409,"Native approval must not execute twice")
    // Revoking a staff task immediately denies further platform approval
    // access; an Organization Owner cannot gain this permission implicitly.
    await q("update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1",[grantId])
    assert.equal(await reviewer.eval(`(async()=> (await fetch('/personal/platform/stores')).status)()`),403)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.wait("!document.getElementById('workspace').hidden")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===1")
    // The visible Seller-context form must send the selected Organization.
    await browser.input('#seller input[name=seller]',ownerStoreId)
    await browser.click('#seller button')
    await browser.wait(`(()=>{try{
      return JSON.parse(document.getElementById('actor-result').textContent).seller.id===
        ${JSON.stringify(ownerStoreId)}
    }catch{return false}})()`)
    const sellerUiContext=await browser.eval("JSON.parse(document.getElementById('actor-result').textContent)")
    assert.equal(sellerUiContext.organization_id,organizations[0].id)
    assert.equal(sellerUiContext.seller.id,ownerStoreId)
    process.stdout.write("PASS B22 Chrome: Seller context UI includes selected Organization and authorized native Seller; missing-Organization HTTP 400 retained\n")
    assert.equal((await get(selected(organizations[0].id))).body.stores[0].id,ownerStoreId)
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(applicationName)})`),true)
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores,[])
    // Keep the later existing fixture expectations intact: native suspension
    // hides this reviewed Store without altering the Owner→Org link.
    await suspendSellerWorkflow(container).run({input:{seller_id:ownerStoreId,reason:"B22 task-only native suspend"}})
    assert.equal((await get(storeContext(organizations[0].id,ownerStoreId))).status,403)
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores,[])
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.getElementById('org-stores-status').textContent.includes('görüntülenebilir onaylı mağaza bulunmuyor')")
    // ONLY SYNTHETIC isolated fixture records: approved action + matching
    // Organization/Store + canonical source outbox. No production reviewer,
    // document decision, operator grant or actual Store ownership is inferred.
    for(let n=0;n<3;n++){
      const org=organizations[n===2?1:0],event="daaud_b22_ui_"+n+"_"+rand
      await q(`insert into da_audit_event
        (id,actor_person_id,actor_type,actor_id,organization_id,action,module,resource,target_id,occurred_at)
        values($1,$2,'user',$3,$4,'organization.store_association_approved',
          'dogruadres-access','store-association',$5,now())`,
        [event,A.person,A.actor,org.id,stores[n].id])
      await q(`insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope)
        values($1,$2,'dogruadres-access','{}'::jsonb)`,["daaob_b22_ui_"+n+"_"+rand,event])
      await q(`insert into da_organization_seller_ownership
        (id,organization_id,seller_id,verification_audit_event_id,verified_at)
        values($1,$2,$3,$4,now())`,
        ["daown_b22_ui_"+n+"_"+rand,org.id,stores[n].id,event])
    }
    // A platform association does not replace the separate native approval.
    const unapprovedAudit="daaud_b22_unapproved_"+rand
    await q(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,organization_id,action,module,resource,target_id,occurred_at)
      values($1,$2,'user',$3,$4,'organization.store_association_approved',
        'dogruadres-access','store-association',$5,now())`,
      [unapprovedAudit,A.person,A.actor,organizations[0].id,unapprovedStore.id])
    await q(`insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope)
      values($1,$2,'dogruadres-access','{}'::jsonb)`,
      ["daaob_b22_unapproved_"+rand,unapprovedAudit])
    await q(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      values($1,$2,$3,$4,now())`,
      ["daown_b22_unapproved_"+rand,organizations[0].id,unapprovedStore.id,unapprovedAudit])
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===2")
    const alpha=await get(selected(organizations[0].id))
    assert.equal(alpha.status,200)
    assert.deepEqual(alpha.body.stores.map((s:any)=>s.id).sort(),stores.slice(0,2).map(s=>s.id).sort())
    assert.equal(alpha.body.stores.some((store:any)=>store.id===unapprovedStore.id),false,
      "Unapproved Seller must stay hidden even with platform association and Member link")
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(unapprovedStore.name)})`),false)
    // Native Store suspension must independently remove ONLY its own Store
    // without revoking Person, Organization membership or platform association.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:stores[0].id,reason:"B22 task-only suspension negative"
    }})
    const suspended=await native.listSellers({id:stores[0].id})
    assert.equal(suspended.length,1)
    assert.equal(suspended[0].status,"suspended")
    assert.ok(suspended[0].approved_at,"Suspension must retain historical native approval")
    const alphaSuspended=await get(selected(organizations[0].id))
    assert.equal(alphaSuspended.status,200)
    assert.deepEqual(alphaSuspended.body.stores.map((x:any)=>x.id),[stores[1].id])
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores.map((x:any)=>x.id),[stores[2].id],
      "Independent Organization Store visibility must survive Alpha suspension")
    // A native Store suspend can trigger the privacy observer while the
    // Organization choice list is reloading. Wait for the SAME authorized
    // Owner button; do not fabricate a selection or relax the later denial.
    await browser.wait(`Array.from(document.querySelectorAll('#organizations button')).some(
      b=>b.textContent===${JSON.stringify(organizations[0].name+" — owner")})`)
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===1")
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(stores[0].name)})`),false)
    await unsuspendSellerWorkflow(container).run({input:{seller_id:stores[0].id}})
    const reopened=await native.listSellers({id:stores[0].id})
    assert.equal(reopened.length,1);assert.equal(reopened[0].status,"open")
    assert.ok(reopened[0].approved_at)
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===2")
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores.map((x:any)=>x.id).sort(),
      stores.slice(0,2).map(x=>x.id).sort())
    await browser.select(organizations[1].name,"admin")
    await browser.wait("document.querySelectorAll('#org-stores p').length===1")
    const beta=await get(selected(organizations[1].id))
    assert.equal(beta.status,200);assert.deepEqual(beta.body.stores.map((s:any)=>s.id),[stores[2].id])
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(stores[0].name)})`),false)
    assert.equal((await get(selected(organizations[2].id))).status,403)
    assert.equal((await get(selected(organizations[1].id),{"x-seller-id":stores[0].id})).status,400)
    // Revoke the platform association without disturbing protected owner.
    await q("update da_organization_seller_ownership set revoked_at=now() where seller_id=$1",[stores[2].id])
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores,[])
    await native.updateMembers([{id:member.id,is_active:false}])
    assert.equal((await get(selected(organizations[0].id))).status,403)
    await native.updateMembers([{id:member.id,is_active:true}])
    // An authorized protected Owner revokes only A's unprotected Admin
    // membership in Beta via the supported Foundation service. Native
    // SellerMember and Person's active session remain intact.
    const revoked=await foundation.changeMembership({
      organization_id:organizations[1].id,membership_id:betaAdminMembership.id,
      actor_person_id:B.person,actor_type:"user",actor_id:B.actor,status:"revoked",
    })
    assert.equal(revoked.status,"revoked")
    assert.equal((await get(selected(organizations[1].id))).status,403,
      "Revoked Organization Admin cannot retain Store access")
    assert.equal((await q("select status from da_organization_membership where id=$1",
      [betaAdminMembership.id]))[0].status,"revoked")
    assert.equal((await get(selected(organizations[0].id))).status,200,
      "Unrelated active Organization must survive Beta revocation")
    // No actor-native JWT or personal details should reach the page.
    const privateView=await browser.eval("({jwt:/eyJ[A-Za-z0-9_-]+\\.eyJ/.test(document.body.innerText),local:Object.keys(localStorage),session:Object.keys(sessionStorage)})")
    assert.equal(privateView.jwt,false);assert.deepEqual(privateView.local,[]);assert.deepEqual(privateView.session,[])
    // Organization membership revocation may make the privacy observer hide
    // the old workspace immediately. Do NOT fake visible state, disable the
    // observer, or assume that a stale Owner button must remain clickable.
    // Both supported user actions share the exact same CSRF-protected lock.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    const ownerButton=await browser.eval(`Array.from(document.querySelectorAll('#organizations button')).some(b=>b.textContent===${JSON.stringify(organizations[0].name+" — owner")})`)
    let clickedLock=false
    if(ownerButton){
      // The visible UI path is preferred, but the privacy observer may
      // conceal it BETWEEN the Owner selection and actual button click.
      try{
        await browser.select(organizations[0].name,"owner")
      }catch(error){
        // The observer can conceal the button after ownerButton was read.
        // Never ignore a failed selection while the workspace stays visible.
        const concealed=await browser.eval(
          "document.getElementById('workspace').hidden===true")
        if(!concealed)throw error
      }
      // A real privacy observer may clear the panel after membership revoke.
      // Accept concealment ONLY when the entire workspace is genuinely
      // hidden. Otherwise insist on the correct Organization and both stores.
      await browser.wait(`(()=>{
        if(document.getElementById('workspace').hidden)return true
        const detail=JSON.parse(document.getElementById('detail').textContent||'{}')
        return detail.id===${JSON.stringify(organizations[0].id)}
          &&document.querySelectorAll('#org-stores p').length===2
      })()`)
      assert.equal((await get(selected(organizations[0].id))).status,200)
      if(!(await browser.eval("document.getElementById('workspace').hidden"))){
        assert.equal(await browser.eval(`JSON.parse(document.getElementById('detail').textContent||'{}').id===${JSON.stringify(organizations[0].id)}&&document.querySelectorAll('#org-stores p').length===2`),true,
          "Visible workspace must show both authorized Owner stores")
      }
      const visible=await browser.eval(`(()=>{
        const button=document.getElementById('session-lock')
        return button&&!button.hidden&&!button.disabled&&
          !document.getElementById('workspace').hidden&&
          document.visibilityState==='visible'
      })()`)
      if(visible){
        try{
          await browser.click("#session-lock")
          clickedLock=true
        }catch(error){
          // Only a genuinely concealed page may take the existing real
          // HTTP/CSRF lock route. Never ignore an ordinary failed click.
          const concealed=await browser.eval(`(()=>{
            const button=document.getElementById('session-lock')
            return !button||button.hidden||button.disabled||
              document.getElementById('workspace').hidden
          })()`)
          if(!concealed)throw error
        }
      }
    }
    if(clickedLock){
      await browser.wait("document.getElementById('login').hidden===false && document.getElementById('workspace').hidden===true && document.getElementById('org-stores-panel').hidden===true && document.getElementById('org-stores').children.length===0")
      await browser.wait("document.getElementById('status').textContent.includes('Oturum kilitlendi')")
    }else{
      // A genuinely concealed page cannot click a hidden button. Use the
      // same real public session-lock contract with the authenticated browser,
      // the current session's anti-CSRF proof and actual server transaction.
      const lock=await browser.eval(`(async()=>{
        const response=await fetch('/personal/session')
        if(response.status!==200)return {session_status:response.status,lock_status:null}
        const session=await response.json()
        const outcome=await fetch('/personal/session?action=lock',{
          method:'DELETE',headers:{'x-csrf-token':session.csrf_token}
        })
        return {session_status:response.status,lock_status:outcome.status}
      })()`)
      assert.equal(lock.session_status,200,"Private UI conceal is not a logout bypass")
      assert.equal(lock.lock_status,200,"Real same-origin CSRF-protected lock must succeed")
      await browser.send("Page.reload",{ignoreCache:true})
      await browser.wait("document.getElementById('login').hidden===false && document.getElementById('workspace').hidden===true && document.getElementById('org-stores-panel').hidden===true && document.getElementById('org-stores').children.length===0")
      process.stdout.write("PASS B22 Chrome: observer concealed stale Organization UI; same session explicitly locked over CSRF-protected HTTP and fresh Chrome reload\\n")
    }
    // The cookie is no longer set in Chrome. Probe the OLD exact opaque
    // credential explicitly over task-owned HTTPS to rule out UI-only hiding.
    const denied=await new Promise<number>((resolve,reject)=>{
      const req=tlsRequest(host+selected(organizations[0].id),{
        method:"GET",ca:readFileSync(crt),headers:{cookie:"da_session="+cookie}
      },res=>{res.resume();res.on("end",()=>resolve(res.statusCode??0))})
      req.on("error",reject);req.setTimeout(10000,()=>req.destroy(Error("B22 locked replay timeout")));req.end()
    })
    assert.ok([401,403].includes(denied),"Locked session's old cookie must never read Store data")
    const sessionHash=createHash("sha256").update(cookie).digest("hex")
    const locked=await q("select status from da_browser_session where id=$1",[sessionHash])
    assert.equal(locked.length,1)
    assert.equal(locked[0].status,"revoked","Real PG16 confirms session lock")
    const hidden=await browser.eval("({store:document.getElementById('org-stores').textContent,selection:document.getElementById('detail').textContent,local:Object.keys(localStorage),session:Object.keys(sessionStorage)})")
    assert.equal(hidden.store,"");assert.equal(hidden.selection,"")
    assert.deepEqual(hidden.local,[]);assert.deepEqual(hidden.session,[])
    process.stdout.write("PASS B22 Chrome: native pending Seller on page 2 approved, newer Owner Store separately approved, 30 older non-native records fail closed\n")
    process.stdout.write("PASS B22 Chrome: two Person browsers, platform staff-approved native Seller, Owner sees only approved Store; revoked staff denied\n")
    process.stdout.write("PASS B22 Chrome: Owner Store application creates pending native Seller and direct Organization link, replay deduped and foreign Organization denied\n")
    process.stdout.write("PASS B22 Chrome: native suspension hides only affected Store; unrelated Organization unaffected; approved Store reopens through native workflow\n")
    process.stdout.write("PASS B22 Chrome: native OPEN Seller with no approved_at remains hidden despite platform association and Member link\n")
    process.stdout.write("PASS B22 Chrome: locked personal session clears Store UI, old opaque cookie rejected and PG16 session revoked\n")
    process.stdout.write("PASS B22 Chrome: real MFA and dual-proof Member link with two Organization scopes; approved synthetic Store fixtures read and revoked access denied\n")
    // B-01: real native MFA recovery versus a failed Foundation outbox.
    // Only isolated random disposable B22 CI PG16; no real user or prod path.
    const recoveryIdentity=await q(
      "select auth_identity_id from da_login_binding where person_id=$1 and actor_type='user' and revoked_at is null",
      [B.person])
    assert.equal(recoveryIdentity.length,1)
    const enabledFactors=await auth.listAuthMfa(
      {auth_identity_id:recoveryIdentity[0].auth_identity_id,status:"enabled"},{take:2})
    assert.equal(enabledFactors.length,1,"B22 Person B must have one live TOTP factor")
    const nativeRecoveryPost=async()=>reviewer.eval(
      "(async()=>{const sr=await fetch('/personal/session');"+
      "if(sr.status!==200)return {status:sr.status,body:{}};"+
      "const session=await sr.json();"+
      "const response=await fetch('/personal/mfa/manage',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({action:'recovery_codes'})});"+
      "return {status:response.status,body:await response.json()}})()")
    const recoveryAuditCount=async()=>Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='mfa.recovery_codes_generated'",
      [B.person]))[0].n)
    const recoveryOutboxCount=async()=>Number((await q(
      "select count(*)::int n from da_security_outbox x join da_audit_event e on e.id=x.audit_event_id where e.actor_person_id=$1 and e.action='mfa.recovery_codes_generated'",
      [B.person]))[0].n)
    const beforeRecovery=await recoveryAuditCount()
    assert.equal(await recoveryOutboxCount(),beforeRecovery)
    const positiveRecovery=await nativeRecoveryPost()
    assert.equal(positiveRecovery.status,200,"Actual Medusa recovery generation must succeed")
    assert.equal(positiveRecovery.body.sessions_revoked,false)
    assert.equal(positiveRecovery.body.recovery_codes?.length,10)
    assert.equal(new Set(positiveRecovery.body.recovery_codes).size,10)
    assert.equal(await recoveryAuditCount(),beforeRecovery+1)
    assert.equal(await recoveryOutboxCount(),beforeRecovery+1)
    // Test-only PG DDL forces only the MFA recovery audit outbox insert to fail.
    // Real native Auth operation runs first in its own module transaction.
    await q("create function b22_mfa_outbox_fault_v1() returns trigger language plpgsql as $b22$ begin if exists(select 1 from da_audit_event e where e.id=NEW.audit_event_id and e.action='mfa.recovery_codes_generated') then raise exception 'B22 forced recovery outbox failure'; end if; return NEW; end $b22$")
    let installedRecoveryFault=false
    try{
      await q("create trigger b22_mfa_outbox_fault_v1 before insert on da_security_outbox for each row execute function b22_mfa_outbox_fault_v1()")
      installedRecoveryFault=true
      const uncertainRecovery=await nativeRecoveryPost()
      assert.equal(uncertainRecovery.status,503,
        "No HTTP success when the native operation precedes a failed Foundation audit")
      assert.match(uncertainRecovery.body?.message??"",/INDETERMINATE/)
      assert.equal(Object.prototype.hasOwnProperty.call(uncertainRecovery.body,"recovery_codes"),false)
      assert.equal(await recoveryAuditCount(),beforeRecovery+1,
        "Audit write must roll back when its security outbox insert fails")
      assert.equal(await recoveryOutboxCount(),beforeRecovery+1)
      assert.equal(await reviewer.eval(
        "(async()=> (await fetch('/personal/session')).status)()"),200,
        "Recovery generation is not factor disable; full session remains valid")
      process.stdout.write("PASS B-01 native MFA recovery: real Medusa success writes Foundation audit/outbox; forced post-native outbox failure returns INDETERMINATE 503, no code disclosure or false audit\n")
    }finally{
      if(installedRecoveryFault)
        await q("drop trigger b22_mfa_outbox_fault_v1 on da_security_outbox")
      await q("drop function b22_mfa_outbox_fault_v1()")
    }

    // B-01 MFA disable: use only an existing B22 CI synthetic browser and PG16.
    // Supported platform policy and recovery-code HTTP flows create a real
    // current full session; no direct synthetic epoch/version manipulation.
    const freshDisableCodes=await nativeRecoveryPost()
    assert.equal(freshDisableCodes.status,200,
      "Real recovery API must refresh B's codes after the earlier fault")
    assert.equal(freshDisableCodes.body.recovery_codes?.length,10)
    const disableCodes=freshDisableCodes.body.recovery_codes as string[]
    const reloginWithRecovery=async(code:string)=>{
      // Lock a still-active old browser session via the real CSRF route, if any.
      const lock=await reviewer.eval("(async()=>{"+
        "const session=await fetch('/personal/session');"+
        "if(session.status!==200)return session.status;"+
        "const value=await session.json();"+
        "const response=await fetch('/personal/session?action=lock',{method:'DELETE',"+
        "headers:{'x-csrf-token':value.csrf_token}});return response.status})()")
      assert.ok([200,401,403].includes(lock),"Only actual expired or explicitly locked prior session")
      await reviewer.send("Page.reload",{ignoreCache:true})
      await reviewer.wait("document.getElementById('login').hidden===false")
      await reviewer.input("#login input[name=email]",B.email)
      await reviewer.input("#login input[name=password]",B.password)
      await reviewer.click("#login button")
      await reviewer.wait("document.getElementById('challenge').hidden===false")
      assert.equal(await reviewer.eval("(()=>{const select=document.querySelector('#challenge select[name=method]');select.value='recovery_code';select.dispatchEvent(new Event('change',{bubbles:true}));return select.value})()"),"recovery_code")
      await reviewer.input("#challenge input[name=code]",code)
      await reviewer.click("#challenge button")
      await reviewer.wait("document.getElementById('workspace').hidden===false")
      assert.equal(await reviewer.eval("(async()=> (await fetch('/personal/session')).status)()"),200)
    }
    // Reauthenticate just before the true platform-mode transition to
    // avoid claiming an old stale strong-proof as current authority.
    await reloginWithRecovery(disableCodes[0])
    const [existingMfaPolicy]=await q(
      "select version,platform_mode from da_mfa_policy where id='current'")
    assert.ok(!existingMfaPolicy||existingMfaPolicy.platform_mode==="required",
      "B22 default policy must not silently change before this probe")
    const staffMfaId="da_staff_mfa_"+rand
    await q("insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason) values($1,$2,'security.mfa.manage','platform',$2,'B22 disposable native MFA policy fixture')",[staffMfaId,B.person])
    const policyVersion=Number(existingMfaPolicy?.version??0)
    const policyResponse=await reviewer.eval(
      "(async()=>{const sr=await fetch('/personal/session');"+
      "if(sr.status!==200)return {status:sr.status};"+
      "const session=await sr.json();"+
      "const response=await fetch('/personal/mfa',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({action:'platform',platform_mode:'optional',expected_version:"+policyVersion+"})});"+
      "return {status:response.status}})()")
    assert.equal(policyResponse.status,200,
      "Real task-only staff grant + authenticated MFA mode transition required")
    const [optionalPolicy]=await q(
      "select version,platform_mode from da_mfa_policy where id='current'")
    assert.equal(optionalPolicy.platform_mode,"optional")
    assert.equal(Number(optionalPolicy.version),policyVersion+1)
    // A changed platform MFA revision must invalidate the previous session.
    assert.equal(await reviewer.eval(
      "(async()=> (await fetch('/personal/session')).status)()"),401)
    await reloginWithRecovery(disableCodes[1])
    let preDisableCookie=await reviewer.token()
    assert.match(preDisableCookie??"",/^[A-Za-z0-9_-]{43}$/)
    const disableBeforeAudit=Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='mfa.native_factor_disabled'",
      [B.person]))[0].n)
    // B-01 double fault: BOTH the native-disable and all-session-revocation
    // outbox writes are rejected by a test-only PG16 trigger. A secure flow
    // must abort BEFORE mutating the actual native MFA factor.
    let epochBeforeDisable=Number((await q(
      "select epoch from da_person_security where person_id=$1",[B.person]))[0].epoch)
    const countLogoutAudit=async()=>Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='session.all_revoked'",[B.person]))[0].n)
    const countLogoutOutbox=async()=>Number((await q(
      "select count(*)::int n from da_security_outbox x join da_audit_event e on e.id=x.audit_event_id where e.actor_person_id=$1 and e.action='session.all_revoked'",[B.person]))[0].n)
    let logoutAuditBefore=await countLogoutAudit()
    let logoutOutboxBefore=await countLogoutOutbox()
    assert.equal(logoutAuditBefore,logoutOutboxBefore)
    const oldCookieStatus=async()=>new Promise<number>((resolve,reject)=>{
      const request=tlsRequest(host+"/personal/session",{
        method:"GET",ca:readFileSync(crt),
        headers:{cookie:"da_session="+preDisableCookie}
      },response=>{response.resume();response.on("end",()=>resolve(response.statusCode??0))})
      request.on("error",reject)
      request.setTimeout(10000,()=>request.destroy(Error("MFA disable old cookie timed out")))
      request.end()
    })
    assert.equal(await oldCookieStatus(),200)
    const enabledFactorList=async()=>auth.listAuthMfa(
      {auth_identity_id:recoveryIdentity[0].auth_identity_id,status:"enabled"},{take:2})
    const nativeDisablePost=async()=>reviewer.eval(
      "(async()=>{const sr=await fetch('/personal/session');"+
      "if(sr.status!==200)return {status:sr.status,body:{}};"+
      "const session=await sr.json();"+
      "const response=await fetch('/personal/mfa/manage',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({action:'disable',method:'recovery_code',code:"+JSON.stringify(disableCodes[2])+"})});"+
      "return {status:response.status,body:await response.json()}})()")
    let disableFunctionInstalled=false,disableTriggerInstalled=false
    try{
      await q("create function b22_mfa_disable_outbox_fault_v1() returns trigger language plpgsql as $b22$ begin if exists(select 1 from da_audit_event e where e.id=NEW.audit_event_id and e.action in ('mfa.native_factor_disabled','session.all_revoked')) then raise exception 'B22 forced MFA disable and revocation outbox failures'; end if; return NEW; end $b22$")
      disableFunctionInstalled=true
      await q("create trigger b22_mfa_disable_outbox_fault_v1 before insert on da_security_outbox for each row execute function b22_mfa_disable_outbox_fault_v1()")
      disableTriggerInstalled=true
      const denied=await nativeDisablePost()
      assert.equal(denied.status,503,
        "Broken Foundation precommit must not allow the native factor operation")
      assert.equal(denied.body?.message,"Service unavailable",
        "Native MFA was never attempted, so this is not a native INDETERMINATE outcome")
      assert.equal((await enabledFactorList()).length,1,
        "The original native factor MUST remain enabled after both outbox failures")
      assert.equal(await oldCookieStatus(),200,
        "Precommit failure preserves only the original MFA-protected session")
      assert.equal(await reviewer.eval(
        "(async()=> (await fetch('/personal/session')).status)()"),200)
      assert.equal(Number((await q(
        "select epoch from da_person_security where person_id=$1",[B.person]))[0].epoch),epochBeforeDisable)
      assert.equal(await countLogoutAudit(),logoutAuditBefore)
      assert.equal(await countLogoutOutbox(),logoutOutboxBefore)
      assert.equal(Number((await q(
        "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='mfa.native_factor_disabled'",
        [B.person]))[0].n),disableBeforeAudit)
      process.stdout.write("PASS B-01 MFA double-outbox failure: no native disable, original TOTP/session intact, no partial Foundation audit or epoch change\n")
      // Second boundary: a successful precommit, true Medusa native disable,
      // then a failing COMPLETION audit. Revocation must remain committed.
      await q("drop trigger b22_mfa_disable_outbox_fault_v1 on da_security_outbox")
      disableTriggerInstalled=false
      await q("drop function b22_mfa_disable_outbox_fault_v1()")
      disableFunctionInstalled=false
      // B-01 real policy race: an authorized independent A staff login sets
      // platform MFA to REQUIRED only AFTER B's audited revoke precommit,
      // while B's original HTTPS disable request is still in flight.
      // No direct database policy update or mocked native MFA response.
      const [staffAIdentity]=await q(
        "select auth_identity_id from da_login_binding where person_id=$1 and actor_type='user' and revoked_at is null",
        [A.person])
      assert.ok(staffAIdentity?.auth_identity_id)
      const {codes:staffCodes}=await auth.generateAuthMfaRecoveryCodes({
        auth_identity_id:staffAIdentity.auth_identity_id,count:10})
      assert.equal(staffCodes?.length,10)
      const staffGrantId="da_staff_mfa_race_"+rand
      await q("insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason) values($1,$2,'security.mfa.manage','platform',$2,'B22 disposable independent MFA policy race actor')",
        [staffGrantId,A.person])
      // Only classify observed Chrome requests in this disposable A recovery
      // path. The Browser never writes Cookie, token or digest into the log.
      browser.captureSessionProof=true
      const loginStaffA=async(recoveryCode:string)=>{
        // These are repeated independent strong logins in a single real CI
        // suite. Respect the SERVER's existing per-minute 10/60 abuse caps:
        // never bypass, reset or directly write their persisted counters.
        const subject="subject:"+createHash("sha256").update(A.email.toLowerCase()).digest("hex")
        await until(async()=>{
          const [budget]=await q(
            "select coalesce((select attempts from da_login_attempt where bucket=$1 and minute=floor(extract(epoch from clock_timestamp())/60)),0)::int subject_attempts, coalesce((select max(attempts) from da_login_attempt where bucket like 'address:%' and minute=floor(extract(epoch from clock_timestamp())/60)),0)::int address_attempts",
            [subject])
          if(Number(budget.subject_attempts)>=9||Number(budget.address_attempts)>=58){
            await new Promise<void>(resolve=>setTimeout(resolve,900))
            return false
          }
          return true
        },70000,"B22 task-only Staff A genuine login rate window")
        // load() intentionally conceals personal data in a hidden tab.
        // Native Staff recovery login is a *visible* Chrome user journey,
        // independent of the earlier Gamma Owner revocation browser focus.
        await browser.send("Page.bringToFront")
        await browser.wait("document.visibilityState==='visible'")
        await browser.send("Page.reload",{ignoreCache:true})
        // Page.reload may return before the inline submit handler is installed.
        // A native HTML submit could otherwise bypass the intended POST/CDP
        // observation (and disclose credentials in URL query parameters).
        await browser.wait(`document.readyState==='complete' &&
          document.getElementById('login').hidden===false &&
          typeof document.getElementById('login').onsubmit==='function' &&
          document.querySelector('#login button').disabled===false`)
        // Repeated same-profile logins must not append to browser-restored
        // form values. This is the browser's ordinary "clear form" action.
        await browser.eval("document.getElementById('login').reset()")
        await browser.input("#login input[name=email]",A.email)
        await browser.input("#login input[name=password]",A.password)
        const beforeLogin=browser.http.filter((row:any)=>
          row.method==="POST"&&row.path==="/personal/session").length
        await browser.click("#login button")
        try{
          await until(async()=>browser.http.filter((row:any)=>
            row.method==="POST"&&row.path==="/personal/session").length>beforeLogin,
            10000,"Real Staff A /personal/session HTTP result")
        }catch{
          // Status-only investigation: never publish input values, tokens,
          // cookies, recovery codes, bodies, origins or full request URLs.
          const dom=await browser.eval(`(()=>{
            const form=document.getElementById('login')
            return {ready:document.readyState,visible:!form.hidden,
              bound:typeof form.onsubmit==='function',
              valid:form.checkValidity(),
              disabled:form.querySelector('button').disabled,
              pageVisible:document.visibilityState==='visible'}
          })()`)
          const recent=browser.http.filter((row:any)=>
            ["/personal/session","/personal/challenge"].includes(row.path))
            .slice(-5).map((row:any)=>({method:row.method,path:row.path,status:row.status}))
          throw Error("B22 Staff A login response not observed: "+JSON.stringify({dom,recent}))
        }
        const loginResponse=browser.http.filter((row:any)=>
          row.method==="POST"&&row.path==="/personal/session").at(-1)
        assert.equal(loginResponse?.status,202,
          "Real strong-MFA challenge must begin with HTTP 202, not throttled or bypassed")
        await browser.wait("document.getElementById('challenge').hidden===false")
        assert.equal(await browser.eval("(()=>{const s=document.querySelector('#challenge select[name=method]');s.value='recovery_code';s.dispatchEvent(new Event('change',{bubbles:true}));return s.value})()"),"recovery_code")
        await browser.input("#challenge input[name=code]",recoveryCode)
        const recoveryHttpBefore=browser.http.filter((row:any)=>
          row.method==="POST"&&row.path==="/personal/challenge").length
        await browser.click("#challenge button")
        // An unrelated test Chrome tab can gain foreground during MFA
        // recovery. Re-focus the real signed-in tab and let the shipped
        // visibilitychange handler reload its private scope; never set
        // document.hidden or workspace.hidden directly.
        await browser.send("Page.bringToFront")
        await browser.wait("document.visibilityState==='visible'")
        // Distinguish actual native recovery rejection from subsequent UI
        // rendering/session failures. Never log or return a recovery code.
        await until(async()=>browser.http.filter((row:any)=>
          row.method==="POST"&&row.path==="/personal/challenge").length>recoveryHttpBefore,
          10000,"B22 Staff A native recovery POST settled")
        const recoveryHttp=browser.http.filter((row:any)=>
          row.method==="POST"&&row.path==="/personal/challenge").at(-1)
        assert.equal(recoveryHttp?.status,200,
          "B22 Staff A native MFA recovery HTTP must succeed before showing workspace")
        try{
          await browser.wait("document.getElementById('workspace').hidden===false")
        }catch{
          // Safe diagnosis: HTTP statuses and visibility ONLY. No Person
          // identifier, cookie, password, recovery code, or response body.
          const safe=browser.http.filter((row:any)=>
            ["/personal/challenge","/personal/session","/personal/organizations"]
              .includes(row.path)).slice(-8).map((row:any)=>
                ({method:row.method,path:row.path,status:row.status}))
          const visibility=await browser.eval("document.visibilityState")
          // Only fixed boolean/status categories; never output private Person,
          // Organization, cookies, MFA material or response bodies.
          const ui=await browser.eval(`({
            loginVisible:!document.getElementById('login').hidden,
            workspaceVisible:!document.getElementById('workspace').hidden,
            scopeLoaded:loadedScope!=='',
            observing:observing,
            selectedOrganization:!!new URLSearchParams(location.search).get('organization'),
            statusKind:document.getElementById('status').textContent.includes('Erişim yeniden doğrulanmalı')
              ?'observer-denied':document.getElementById('status').textContent.includes('Giriş gerekli')
              ?'load-failed':document.getElementById('status').textContent.includes('Erişim değişti')
              ?'scope-changed':'other'
          })`)
          const sessionState=await q(`select s.status,
              (s.epoch=e.epoch) as current_epoch,
              (s.mfa_platform_version=(select version from da_mfa_policy where id='current')) as platform_revision,
              (s.mfa_person_version=coalesce((select version from da_person_mfa_preference where person_id=s.person_id),0)) as person_revision
            from da_browser_session s join da_person_security e on e.person_id=s.person_id
            where s.person_id=$1 order by s.created_at desc limit 2`,[A.person])
          // A 403 for a revoked prior cookie is correct; a 403 for the
          // post-recovery active current session would be a real auth defect.
          // Chrome CDP request IDs are joined to transient hashes in memory.
          // Do not print request IDs, hashes, cookies, tokens or Person IDs.
          // Failure-only, disposable-DB diagnostic. Never emit session
          // cookies, digests, identity values, request headers or document data.
          const currentCookie=await browser.token()
          const currentDigest=typeof currentCookie==="string" &&
            /^[A-Za-z0-9_-]{43}$/.test(currentCookie)
            ? createHash("sha256").update(currentCookie).digest("hex") : null
          const sessionEligibility=currentDigest?await q(`select
              s.mfa_purpose='full' as full_scope,
              p.disabled_at is null and p.deleted_at is null as person_enabled,
              statement_timestamp()<s.created_at+q.absolute_lifetime_seconds*interval '1 second' as absolute_valid,
              statement_timestamp()<s.last_activity_at+q.idle_timeout_seconds*interval '1 second' as idle_valid,
              (select count(*)::int from da_login_binding b
                where b.auth_identity_id=s.auth_identity_id and b.person_id=s.person_id
                and b.actor_type=s.actor_type and b.actor_id=s.actor_id
                and b.verified_at is not null and b.revoked_at is null) as active_login_bindings,
              (select count(*)::int from da_actor_mapping m
                where m.person_id=s.person_id and m.actor_type=s.actor_type
                and m.actor_id=s.actor_id and m.deleted_at is null) as active_actor_mappings,
              (select count(*)::int from da_organization_membership m
                where m.person_id=s.person_id and m.status='active'
                and m.deleted_at is null) as active_memberships
            from da_browser_session s join da_person p on p.id=s.person_id
            join da_session_policy q on q.id='current' where s.id=$1`,
            [currentDigest]):[]
          const browserProbe=await browser.eval(`(async()=>{
            const session=await fetch('/personal/session');
            const organizations=await fetch('/personal/organizations');
            return {session:session.status,organizations:organizations.status};
          })()`)
          const scoped=browser.http.filter((row:any)=>
            row.method==="GET"&&row.path==="/personal/organizations").slice(-8)
          const organizationRequests=await Promise.all(scoped.map(async(row:any)=>{
            const proof=browser.requestSessionProof(row.requestId)
            const [state]=proof.digest?await q(`select s.status,
                (s.epoch=e.epoch) as epoch_matches,
                (s.mfa_platform_version=(select version from da_mfa_policy where id='current')) as platform_matches,
                (s.mfa_person_version=coalesce((select version from da_person_mfa_preference where person_id=s.person_id),0)) as person_matches
              from da_browser_session s join da_person_security e on e.person_id=s.person_id
              where s.id=$1`,[proof.digest]):[]
            const sessionClass=!state?"unclassified":
              state.status==="revoked"?"revoked":
              state.status==="active"&&state.epoch_matches&&
                state.platform_matches&&state.person_matches?"active-current":
              "other"
            return {status:row.status,observer:proof.observer,
              sessionClass}
          }))
          throw new Error("B22 Staff A post-recovery UI did not open: "+
            JSON.stringify({visibility,http:safe,ui,sessionState,sessionEligibility,browserProbe,organizationRequests}))
        }
        assert.equal(await browser.eval("(async()=> (await fetch('/personal/session')).status)()"),200)
      }
      const staffSetPlatform=async(mode:"required"|"optional",version:number)=>browser.eval(
        "(async()=>{const sr=await fetch('/personal/session');"+
        "if(sr.status!==200)return {status:sr.status};"+
        "const session=await sr.json();"+
        "const r=await fetch('/personal/mfa',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
        "body:JSON.stringify({action:'platform',platform_mode:"+JSON.stringify(mode)+
        ",expected_version:"+version+"})});return {status:r.status}})()")
      await loginStaffA(staffCodes[0])
      const foundationPrototype=Object.getPrototypeOf(foundation)
      const originalPrepare=foundationPrototype.personalPrepareNativeMfaDisable
      let reachedPrecommit=false,gateReleased=false
      let releasePrecommit!:()=>void
      const precommitGate=new Promise<void>(resolve=>{releasePrecommit=()=>{gateReleased=true;resolve()}})
      foundationPrototype.personalPrepareNativeMfaDisable=async function(this:any,...args:any[]){
        const prepared=await originalPrepare.apply(this,args)
        if(prepared?.person_id===B.person){
          reachedPrecommit=true
          await precommitGate
        }
        return prepared
      }
      let inFlightPolicyRace:Promise<any>|undefined
      try{
        inFlightPolicyRace=nativeDisablePost()
        await until(async()=>reachedPrecommit,10000,
          "MFA platform policy switch after B's committed session revoke")
        assert.equal(await oldCookieStatus(),401,
          "B session revocation must commit before policy writer changes required mode")
        const [beforeRequired]=await q("select version,platform_mode from da_mfa_policy where id='current'")
        assert.equal(beforeRequired.platform_mode,"optional")
        const toRequired=await staffSetPlatform("required",Number(beforeRequired.version))
        assert.equal(toRequired.status,200,
          "Real independently authenticated Staff A must commit required policy via HTTP")
        const [requiredPolicy]=await q("select version,platform_mode from da_mfa_policy where id='current'")
        assert.equal(requiredPolicy.platform_mode,"required")
        releasePrecommit()
        const raced=await inFlightPolicyRace
        assert.equal(raced.status,409,
          "Required policy committed before native completion must block factor disable")
        assert.equal((await enabledFactorList()).length,1,
          "Verified native Medusa TOTP must remain enabled under newly required MFA")
        assert.equal(await oldCookieStatus(),401)
        process.stdout.write("PASS B-01 MFA policy race: separate Staff A HTTP required transition committed between B precommit and native operation; native factor remained enabled, old B session denied\n")
      }finally{
        if(!gateReleased)releasePrecommit()
        foundationPrototype.personalPrepareNativeMfaDisable=originalPrepare
        if(inFlightPolicyRace)await inFlightPolicyRace.catch(()=>{})
      }
      // Restore optional only through the same real MFA challenge + authorized
      // platform staff API. This permits the pre-existing post-native fault
      // regression to run with a fresh B session and its original invariants.
      await loginStaffA(staffCodes[1])
      // The historical 403 had two possible sessions but no request-to-cookie
      // binding. Control both sides using ONLY native, genuinely issued Staff A
      // recovery sessions in the existing disposable HTTPS/PG16 fixture.
      const revokedStaffCookie=await browser.token()
      assert.ok(typeof revokedStaffCookie==="string"&&
        /^[A-Za-z0-9_-]{43}$/.test(revokedStaffCookie),
        "Staff A must have a genuine full MFA session before revocation")
      const revokedStaffId=createHash("sha256").update(revokedStaffCookie).digest("hex")
      const lockStaff=await browser.eval(`(async()=>{
        const response=await fetch('/personal/session')
        if(response.status!==200)return response.status
        const session=await response.json()
        const locked=await fetch('/personal/session?action=lock',{
          method:'DELETE',headers:{'x-csrf-token':session.csrf_token}
        })
        return locked.status
      })()`)
      assert.equal(lockStaff,200,"Real CSRF-protected Staff A session lock must succeed")
      const revokedStaff=await q(
        "select status from da_browser_session where id=$1 and person_id=$2",
        [revokedStaffId,A.person])
      assert.equal(revokedStaff.length,1)
      assert.equal(revokedStaff[0].status,"revoked")
      const oldOrganizationStatus=async(observe:boolean)=>new Promise<number>((resolve,reject)=>{
        const req=tlsRequest(host+"/personal/organizations",{
          method:"GET",ca:readFileSync(crt),headers:{
            cookie:"da_session="+revokedStaffCookie,
            ...(observe?{"x-da-observe":"1"}:{})
          }
        },res=>{res.resume();res.on("end",()=>resolve(res.statusCode??0))})
        req.on("error",reject)
        req.setTimeout(10000,()=>req.destroy(Error("B22 revoked Staff A probe timed out")))
        req.end()
      })
      assert.equal(await oldOrganizationStatus(false),403,
        "Real revoked Staff A cookie must be denied on ordinary Organization GET")
      assert.equal(await oldOrganizationStatus(true),403,
        "Real revoked Staff A cookie must be denied on observer Organization GET")
      // Unused recovery code, same real Chrome profile, no fake auth/session
      // writes, no rate-limit bypass. loginStaffA retains the normal caps.
      await loginStaffA(staffCodes[6])
      const currentStaffCookie=await browser.token()
      assert.ok(typeof currentStaffCookie==="string"&&
        /^[A-Za-z0-9_-]{43}$/.test(currentStaffCookie)&&
        currentStaffCookie!==revokedStaffCookie,
        "Post-recovery cookie must be a distinct real native MFA session")
      const currentStaffId=createHash("sha256").update(currentStaffCookie).digest("hex")
      const [currentStaff]=await q(`select s.status,
          s.person_id=$2 as same_person,
          s.epoch=e.epoch as current_epoch,
          s.mfa_platform_version=(select version from da_mfa_policy where id='current') as current_platform,
          s.mfa_person_version=coalesce((select version from da_person_mfa_preference where person_id=s.person_id),0) as current_person
        from da_browser_session s join da_person_security e on e.person_id=s.person_id
        where s.id=$1`,[currentStaffId,A.person])
      assert.ok(currentStaff?.status==="active"&&currentStaff.same_person&&
        currentStaff.current_epoch&&currentStaff.current_platform&&currentStaff.current_person,
        "Post-recovery Staff A cookie must be active and current in actual PG16")
      const organizationProbeStart=browser.http.length
      const currentNormal=await browser.eval(
        "(async()=> (await fetch('/personal/organizations',{cache:'no-store'})).status)()")
      const currentObserver=await browser.eval(
        "(async()=> (await fetch('/personal/organizations',{cache:'no-store',headers:{'x-da-observe':'1'}})).status)()")
      assert.equal(currentNormal,200,"Current Staff A ordinary Organization GET must succeed")
      assert.equal(currentObserver,200,"Current Staff A observer Organization GET must succeed")
      await until(async()=>{
        const observed=browser.http.slice(organizationProbeStart).filter((row:any)=>
          row.method==="GET"&&row.path==="/personal/organizations"&&row.status===200)
        return [false,true].every(observer=>observed.some((row:any)=>{
          const proof=browser.requestSessionProof(row.requestId)
          return proof.digest===currentStaffId&&proof.observer===observer
        }))
      },10000,"B22 real CDP exact-request fresh Staff A cookie/observer correlation")
      assert.equal((await q("select status from da_browser_session where id=$1",
        [revokedStaffId]))[0]?.status,"revoked",
        "Old Staff A session must remain revoked after genuine new recovery")
      process.stdout.write("PASS B22 Chrome: MFA session differential, real revoked Staff A cookie ordinary/observer Organization GET403; distinct active-current post-recovery Chrome cookie ordinary/observer GET200, CDP requestId correlated and PG16 verified; no secrets logged\n")
      const [requiredPolicy]=await q("select version,platform_mode from da_mfa_policy where id='current'")
      assert.equal(requiredPolicy.platform_mode,"required")
      assert.equal((await staffSetPlatform("optional",Number(requiredPolicy.version))).status,200)
      await reloginWithRecovery(disableCodes[3])
      // B-01: a second genuinely independent Chrome profile completes a NEW
      // native MFA login after the first Person-wide revocation commits, but
      // before native factor disable begins. A secure implementation refuses
      // the disable (409) rather than leaving that session trusted after the
      // native factor disappears. Existing audit/epoch and native factor stay.
      const newSessionBrowser=new B06Chrome(host,"B")
      browsers.push(newSessionBrowser)
      await newSessionBrowser.start(crt)
      preDisableCookie=await reviewer.token()
      assert.match(preDisableCookie??"",/^[A-Za-z0-9_-]{43}$/)
      assert.equal(await oldCookieStatus(),200)
      const raceAuditBefore=await countLogoutAudit()
      const raceNativeBefore=await enabledFactorList()
      assert.equal(raceNativeBefore.length,1)
      let newSessionGateReached=false,newSessionGateReleased=false
      let releaseNewSessionGate!:()=>void
      const newSessionGate=new Promise<void>(resolve=>{
        releaseNewSessionGate=()=>{newSessionGateReleased=true;resolve()}
      })
      const originalPrepareNewSession=foundationPrototype.personalPrepareNativeMfaDisable
      foundationPrototype.personalPrepareNativeMfaDisable=async function(this:any,...args:any[]){
        const prepared=await originalPrepareNewSession.apply(this,args)
        if(prepared?.person_id===B.person){
          newSessionGateReached=true
          await newSessionGate
        }
        return prepared
      }
      let newSessionRace:Promise<any>|undefined
      try{
        newSessionRace=nativeDisablePost()
        await until(async()=>newSessionGateReached,10000,
          "MFA disable precommit before another Person B full login")
        assert.equal(await oldCookieStatus(),401)
        // Real second profile, password and a previously unused native recovery
        // code; neither native Auth nor the HTTP session endpoint is mocked.
        await newSessionBrowser.input("#login input[name=email]",B.email)
        await newSessionBrowser.input("#login input[name=password]",B.password)
        await newSessionBrowser.click("#login button")
        await newSessionBrowser.wait("document.getElementById('challenge').hidden===false")
        assert.equal(await newSessionBrowser.eval(
          "(()=>{const s=document.querySelector('#challenge select[name=method]');s.value='recovery_code';s.dispatchEvent(new Event('change',{bubbles:true}));return s.value})()"),
          "recovery_code")
        await newSessionBrowser.input("#challenge input[name=code]",disableCodes[4])
        await newSessionBrowser.click("#challenge button")
        await newSessionBrowser.wait("document.getElementById('workspace').hidden===false")
        const freshCookie=await newSessionBrowser.token()
        assert.match(freshCookie??"",/^[A-Za-z0-9_-]{43}$/)
        const newRows=await q(
          "select s.status,s.epoch,e.epoch current_epoch from da_browser_session s join da_person_security e on e.person_id=s.person_id where s.id=$1 and s.person_id=$2",
          [createHash("sha256").update(freshCookie!).digest("hex"),B.person])
        assert.equal(newRows.length,1)
        assert.equal(newRows[0].status,"active")
        assert.equal(String(newRows[0].epoch),String(newRows[0].current_epoch))
        assert.equal(await newSessionBrowser.eval(
          "(async()=> (await fetch('/personal/session')).status)()"),200)
        releaseNewSessionGate()
        const result=await newSessionRace
        assert.equal(result.status,409,
          "A newly authenticated full Person session must prevent native factor disable")
        assert.equal((await enabledFactorList()).length,1,
          "A refused disable must preserve the native factor for the new session")
        assert.equal(await oldCookieStatus(),401)
        assert.equal(await newSessionBrowser.eval(
          "(async()=> (await fetch('/personal/session')).status)()"),200)
        assert.equal(await countLogoutAudit(),raceAuditBefore+1,
          "Successful first revocation must keep its canonical audit/outbox")
        assert.equal(await countLogoutOutbox(),await countLogoutAudit())
        process.stdout.write("PASS B-01 MFA new-login race: independent Chrome B login committed between pre-native revocation and completion; native disable denied 409, factor and new session preserved, old cookie 401\n")
      }finally{
        if(!newSessionGateReleased)releaseNewSessionGate()
        foundationPrototype.personalPrepareNativeMfaDisable=originalPrepareNewSession
        if(newSessionRace)await newSessionRace.catch(()=>{})
      }
      // The original browser was correctly revoked in the aborted attempt.
      // Regain fresh MFA proof for the existing post-native fault regression.
      await reloginWithRecovery(disableCodes[5])
      // B-01 native-lock-first case: after the native callback is reached,
      // the Foundation advisory lock must hold an independent Staff A policy
      // writer until the callback finishes. The native Medusa operation is
      // genuinely called with an invalid proof after the controlled pause,
      // preserving the factor for the pre-existing post-native fault test.
      const concurrencyBLock=await newSessionBrowser.eval(
        "(async()=>{const sr=await fetch('/personal/session');"+
        "if(sr.status!==200)return sr.status;"+
        "const s=await sr.json();"+
        "const r=await fetch('/personal/session?action=lock',{method:'DELETE',"+
        "headers:{'x-csrf-token':s.csrf_token}});return r.status})()")
      assert.equal(concurrencyBLock,200,
        "Close the concurrent B session before the native-first control")
      await loginStaffA(staffCodes[4])
      const nativeFirstPolicy=(await q(
        "select version,platform_mode from da_mfa_policy where id='current'"))[0]
      assert.equal(nativeFirstPolicy.platform_mode,"optional")
      preDisableCookie=await reviewer.token()
      assert.equal(await oldCookieStatus(),200)
      const originalNativeFirst=foundationPrototype.personalCompletePreparedNativeMfaDisable
      let nativeCallbackEntered=false,nativeFirstGateReleased=false
      let releaseNativeFirst!:()=>void
      const nativeFirstGate=new Promise<void>(resolve=>{
        releaseNativeFirst=()=>{nativeFirstGateReleased=true;resolve()}
      })
      foundationPrototype.personalCompletePreparedNativeMfaDisable=
        async function(this:any,prepared:any,operation:(identityId:string)=>Promise<unknown>,...rest:any[]){
          return originalNativeFirst.apply(this,[prepared,async(identityId:string)=>{
            if(prepared?.person_id===B.person){
              nativeCallbackEntered=true
              await nativeFirstGate
            }
            return operation(identityId)
          },...rest])
        }
      const invalidNativeDisablePost=async()=>reviewer.eval(
        "(async()=>{const sr=await fetch('/personal/session');"+
        "if(sr.status!==200)return {status:sr.status,body:{}};"+
        "const session=await sr.json();"+
        "const r=await fetch('/personal/mfa/manage',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
        "body:JSON.stringify({action:'disable',method:'recovery_code',code:'invalid-native-proof'})});"+
        "return {status:r.status,body:await r.json()}})()")
      let nativeFirstPending:Promise<any>|undefined
      let staffPolicyPending:Promise<any>|undefined
      let staffPolicySettled=false
      try{
        nativeFirstPending=invalidNativeDisablePost()
        await until(async()=>nativeCallbackEntered,10000,
          "Native MFA callback entered under real Foundation transaction lock")
        // Do not call /personal/session here: its Person row read correctly
        // waits for this native completion transaction's security row lock.
        staffPolicyPending=staffSetPlatform("required",Number(nativeFirstPolicy.version))
          .then(v=>{staffPolicySettled=true;return v},e=>{
            staffPolicySettled=true;return {status:-1,error:String(e)}
          })
        await until(async()=>{
          const [waiters]=await q(
            "select count(*)::int n from pg_locks l join pg_stat_activity a on a.pid=l.pid where l.locktype='advisory' and l.granted=false and a.datname=current_database()")
          return Number(waiters.n)>0
        },10000,"Independent Staff A policy writer waits on native MFA lock")
        assert.equal(staffPolicySettled,false,
          "Staff policy HTTP must NOT return while native callback holds the lock")
        const [stillOptional]=await q(
          "select platform_mode from da_mfa_policy where id='current'")
        assert.equal(stillOptional.platform_mode,"optional")
        releaseNativeFirst()
        const failedNative=await nativeFirstPending
        assert.equal(failedNative.status,503,
          "Actual native invalid proof must not successfully disable MFA")
        assert.match(failedNative.body?.message??"",/INDETERMINATE/)
        const wroteRequired=await staffPolicyPending
        assert.equal(wroteRequired.status,200,
          "Real Staff A policy writer must complete after native lock releases")
        const [requiredAfterLock]=await q(
          "select version,platform_mode from da_mfa_policy where id='current'")
        assert.equal(requiredAfterLock.platform_mode,"required")
        assert.ok(Number(requiredAfterLock.version)>Number(nativeFirstPolicy.version))
        assert.equal((await enabledFactorList()).length,1)
        assert.equal(await oldCookieStatus(),401)
        process.stdout.write("PASS B-01 MFA native-first policy race: real Staff A HTTP policy writer waited on PostgreSQL advisory lock through actual native Auth failed proof; required committed after release, native factor intact, old cookie 401\n")
      }finally{
        if(!nativeFirstGateReleased)releaseNativeFirst()
        foundationPrototype.personalCompletePreparedNativeMfaDisable=originalNativeFirst
        if(nativeFirstPending)await nativeFirstPending.catch(()=>{})
        if(staffPolicyPending)await staffPolicyPending.catch(()=>{})
      }
      await loginStaffA(staffCodes[5])
      const [policyAfterNativeFirst]=await q(
        "select version,platform_mode from da_mfa_policy where id='current'")
      assert.equal(policyAfterNativeFirst.platform_mode,"required")
      assert.equal((await staffSetPlatform("optional",Number(policyAfterNativeFirst.version))).status,200)
      await reloginWithRecovery(disableCodes[6])
      preDisableCookie=await reviewer.token()
      assert.match(preDisableCookie??"",/^[A-Za-z0-9_-]{43}$/)
      assert.equal(await oldCookieStatus(),200)
      epochBeforeDisable=Number((await q(
        "select epoch from da_person_security where person_id=$1",[B.person]))[0].epoch)
      logoutAuditBefore=await countLogoutAudit()
      logoutOutboxBefore=await countLogoutOutbox()
      assert.equal(logoutAuditBefore,logoutOutboxBefore)
      await q("create function b22_mfa_disable_outbox_fault_v1() returns trigger language plpgsql as $b22$ begin if exists(select 1 from da_audit_event e where e.id=NEW.audit_event_id and e.action='mfa.native_factor_disabled') then raise exception 'B22 forced post-native MFA completion audit failure'; end if; return NEW; end $b22$")
      disableFunctionInstalled=true
      await q("create trigger b22_mfa_disable_outbox_fault_v1 before insert on da_security_outbox for each row execute function b22_mfa_disable_outbox_fault_v1()")
      disableTriggerInstalled=true
      const uncertain=await nativeDisablePost()
      assert.equal(uncertain.status,503)
      assert.match(uncertain.body?.message??"",/INDETERMINATE/)
      assert.equal(await reviewer.eval(
        "(async()=> (await fetch('/personal/session')).status)()"),401,
        "Committed pre-native revocation denies the old browser")
      assert.equal(await oldCookieStatus(),401,
        "The exact old HTTPS cookie must fail even though post-native audit rolled back")
      assert.equal((await enabledFactorList()).length,0)
      const [nativeDisabled]=await auth.listAuthMfa(
        {auth_identity_id:recoveryIdentity[0].auth_identity_id,status:"disabled"},{take:2})
      assert.equal(nativeDisabled?.id,enabledFactors[0].id)
      assert.ok(Number((await q(
        "select epoch from da_person_security where person_id=$1",[B.person]))[0].epoch)>epochBeforeDisable)
      const allSessions=await q("select status from da_browser_session where person_id=$1",[B.person])
      assert.ok(allSessions.length>=2)
      assert.ok(allSessions.every((row:any)=>row.status!=="active"))
      assert.equal(await countLogoutAudit(),logoutAuditBefore+1)
      assert.equal(await countLogoutOutbox(),logoutOutboxBefore+1)
      assert.equal(Number((await q(
        "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='mfa.native_factor_disabled'",
        [B.person]))[0].n),disableBeforeAudit,
        "Failed post-native audit cannot be reported as committed")
      process.stdout.write("PASS B-01 MFA completion audit failure: native factor disabled, independent precommitted session revocation/audit survives, old HTTPS cookie denied\n")
      // Positive control for the NEW precommitted workflow: the other
      // already-enrolled synthetic Person A disables through the real
      // same-origin MFA route with a fresh native recovery proof. No
      // PostgreSQL trigger remains during this normal success path.
      await q("drop trigger b22_mfa_disable_outbox_fault_v1 on da_security_outbox")
      disableTriggerInstalled=false
      await q("drop function b22_mfa_disable_outbox_fault_v1()")
      disableFunctionInstalled=false
      await loginStaffA(staffCodes[2])
      // A prior native suspension test intentionally left THIS Seller
      // suspended. Reactivate it only in the disposable PG16 fixture;
      // otherwise the request correctly stops before the unlink race seam.
      const priceRaceStore=(await native.listSellers({id:ownerStoreId}))[0]
      assert.equal(priceRaceStore?.status,"suspended")
      await unsuspendSellerWorkflow(container).run({input:{seller_id:ownerStoreId}})
      try{
        assert.equal((await native.listSellers({id:ownerStoreId}))[0]?.status,"open")
        const priceRacePrecheck=await groupChange("read")
        assert.equal(priceRacePrecheck.status,200,
          "A genuinely authorized active Seller/Member is needed before the unlink race")
        assert.equal(priceRacePrecheck.body.status,"revoked")
      // F-02: first-party HTTP has already checked the real native Seller,
      // but the Foundation method is paused BEFORE acquiring its actor lock.
      // Complete the supported Person->Member unlink while it is paused.
      // The resumed real HTTP call must commit NO group grant/audit/outbox.
      const priceGroupBefore=(await q(
        "select count(*)::int n from da_store_buyer_price_group where seller_id=$1 and buyer_organization_id=$2 and customer_group_id=$3 and revoked_at is null",
        [ownerStoreId,organizations[1].id,priceGroup.id]))[0].n
      assert.equal(priceGroupBefore,0,"Earlier Owner revoke must stay persisted")
      const groupActionCount=async()=>Number((await q(
        "select count(*)::int n from da_audit_event where module='dogruadres-access' and action in ('organization.store_price_group_granted','organization.store_price_group_revoked')"
      ))[0].n)
      const groupActionBefore=await groupActionCount()
      const memberBindings=await q(
        "select id,actor_id from da_verified_actor_binding where person_id=$1 and actor_type='member' and revoked_at is null",
        [A.person])
      assert.equal(memberBindings.length,1)
      const initialGroupCookie=await browser.token()
      const initialGroupCsrf=await browser.eval(
        "(async()=>{const r=await fetch('/personal/session');return r.status===200?(await r.json()).csrf_token:null})()")
      assert.match(initialGroupCookie??"",/^[A-Za-z0-9_-]{43}$/)
      assert.equal(typeof initialGroupCsrf,"string")
      const originalGroupMethod=foundationPrototype.personalStorePriceGroupAccess
      let groupEntered=false,groupGateReleased=false
      let releaseGroupGate!:()=>void
      const groupGate=new Promise<void>(resolve=>{
        releaseGroupGate=()=>{groupGateReleased=true;resolve()}
      })
      foundationPrototype.personalStorePriceGroupAccess=async function(this:any,...args:any[]){
        if(args[1]?.action==="grant"&&args[1]?.customer_group_id===priceGroup.id){
          groupEntered=true
          await groupGate
        }
        return originalGroupMethod.apply(this,args)
      }
      let pendingGroupPost:Promise<{status:number;body:any}>|undefined
      try{
        pendingGroupPost=new Promise((resolve,reject)=>{
          const request=tlsRequest(host+"/personal/store-price-groups",{
            method:"POST",ca:readFileSync(crt),headers:{
              Cookie:"da_session="+initialGroupCookie,
              Origin:host,"Content-Type":"application/json",
              "x-csrf-token":initialGroupCsrf
            }
          },response=>{
            let body=""
            response.setEncoding("utf8")
            response.on("data",chunk=>{body+=chunk})
            response.on("end",()=>{
              try{resolve({status:response.statusCode??0,body:JSON.parse(body)})}
              catch(error){reject(error)}
            })
          })
          request.on("error",reject)
          request.setTimeout(16000,()=>request.destroy(Error("F-02 price group POST timeout")))
          request.end(JSON.stringify({...groupInput,action:"grant"}))
        })
        await until(async()=>groupEntered,10000,
          "F-02 exact real Store grant HTTP passed native authority before Foundation write")
        const unlinked=await browser.eval("(async()=>{"+
          "const sr=await fetch('/personal/session');"+
          "if(sr.status!==200)return {status:sr.status};"+
          "const session=await sr.json();"+
          "const res=await fetch('/personal/links',{method:'POST',"+
          "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
          "body:JSON.stringify({action:'unlink',binding_id:"+
          JSON.stringify(memberBindings[0].id)+"})});return {status:res.status}})()")
        assert.equal(unlinked.status,200,
          "Supported Member unlink must commit after initial Store HTTP check")
        const revoked=await q(
          "select revoked_at from da_verified_actor_binding where id=$1",
          [memberBindings[0].id])
        assert.equal(revoked.length,1)
        assert.ok(revoked[0].revoked_at,"Member unlink committed to real PG16")
        releaseGroupGate()
        const result=await pendingGroupPost
        assert.equal(result.status,403,
          "In-flight grant resumed after committed Member unlink must be denied")
        assert.deepEqual(result.body,{message:"Access denied"})
        assert.equal((await q(
          "select count(*)::int n from da_store_buyer_price_group where seller_id=$1 and buyer_organization_id=$2 and customer_group_id=$3 and revoked_at is null",
          [ownerStoreId,organizations[1].id,priceGroup.id]))[0].n,0)
        assert.equal(await groupActionCount(),groupActionBefore,
          "Revoked Member must produce zero price-group audit/outbox writes")
        assert.equal((await groupChange("read")).status,403,
          "Subsequent Member group read cannot regain access after unlink")
        process.stdout.write("PASS B22 Store price group F-01/F-02: suspended/de-approved Seller and suspended Buyer GET403; real first-party Member unlink between native HTTP scope and Foundation write denies grant403, zero group/audit mutation\n")
      }finally{
        if(!groupGateReleased)releaseGroupGate()
        foundationPrototype.personalStorePriceGroupAccess=originalGroupMethod
        if(pendingGroupPost)await pendingGroupPost.catch(()=>{})
      }
      }finally{
        await suspendSellerWorkflow(container).run({input:{
          seller_id:ownerStoreId,reason:"B22 restore earlier native Seller suspension"
        }})
      }
      const positiveNativeBefore=await auth.listAuthMfa(
        {auth_identity_id:staffAIdentity.auth_identity_id,status:"enabled"},{take:2})
      assert.equal(positiveNativeBefore.length,1)
      const aCookieBeforeDisable=await browser.token()
      assert.match(aCookieBeforeDisable??"",/^[A-Za-z0-9_-]{43}$/)
      const [aEpochBefore]=await q("select epoch from da_person_security where person_id=$1",[A.person])
      const aAuditCount=async(action:string)=>Number((await q(
        "select count(*)::int n from da_audit_event where actor_person_id=$1 and action=$2",
        [A.person,action]))[0].n)
      const beforeAllRevoked=await aAuditCount("session.all_revoked")
      const beforeFactorDisabled=await aAuditCount("mfa.native_factor_disabled")
      const positiveDisable=await browser.eval(
        "(async()=>{const sr=await fetch('/personal/session');"+
        "if(sr.status!==200)return {status:sr.status,body:{}};"+
        "const session=await sr.json();"+
        "const r=await fetch('/personal/mfa/manage',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
        "body:JSON.stringify({action:'disable',method:'recovery_code',code:"+JSON.stringify(staffCodes[3])+"})});"+
        "return {status:r.status,body:await r.json()}})()")
      assert.equal(positiveDisable.status,200,
        "Native MFA factor disable must succeed under the optional platform mode")
      assert.deepEqual(positiveDisable.body,{disabled:true,sessions_revoked:true})
      assert.equal((await auth.listAuthMfa(
        {auth_identity_id:staffAIdentity.auth_identity_id,status:"enabled"},{take:2})).length,0)
      const [aDisabledFactor]=await auth.listAuthMfa(
        {auth_identity_id:staffAIdentity.auth_identity_id,status:"disabled"},{take:2})
      assert.equal(aDisabledFactor?.id,positiveNativeBefore[0].id)
      assert.ok(Number((await q(
        "select epoch from da_person_security where person_id=$1",[A.person]))[0].epoch)>Number(aEpochBefore.epoch))
      assert.ok((await q(
        "select status from da_browser_session where person_id=$1",[A.person])).every((row:any)=>row.status!=="active"))
      assert.equal(await aAuditCount("session.all_revoked"),beforeAllRevoked+1)
      assert.equal(await aAuditCount("mfa.native_factor_disabled"),beforeFactorDisabled+1)
      const aCompletionOutbox=await q(
        "select e.action from da_audit_event e join da_security_outbox x on x.audit_event_id=e.id where e.actor_person_id=$1 and e.action in ('session.all_revoked','mfa.native_factor_disabled')",
        [A.person])
      assert.ok(aCompletionOutbox.some((row:any)=>row.action==="session.all_revoked"))
      assert.ok(aCompletionOutbox.some((row:any)=>row.action==="mfa.native_factor_disabled"))
      const replayA=await new Promise<number>((resolve,reject)=>{
        const req=tlsRequest(host+"/personal/session",{method:"GET",ca:readFileSync(crt),
          headers:{cookie:"da_session="+aCookieBeforeDisable}},res=>{
            res.resume();res.on("end",()=>resolve(res.statusCode??0))})
        req.on("error",reject)
        req.setTimeout(10000,()=>req.destroy(Error("Positive MFA old-cookie replay timeout")))
        req.end()
      })
      assert.equal(replayA,401,
        "Previously issued full browser cookie must be denied after normal native MFA disable")
      process.stdout.write("PASS B-01 MFA positive disable: real native factor disabled via HTTP; Foundation precommit epoch/session audit and completion audit/outbox persisted; original opaque cookie 401\n")
    }finally{
      if(disableTriggerInstalled)
        await q("drop trigger b22_mfa_disable_outbox_fault_v1 on da_security_outbox")
      if(disableFunctionInstalled)
        await q("drop function b22_mfa_disable_outbox_fault_v1()")
    }

    // First Person self-registration on the same real Chrome HTTPS and
    // isolated PG16 boundary. Native Customer is only an Auth adapter,
    // not an Organization, Buyer entitlement, Staff or Store owner.
    const signupChrome=new B06Chrome(host,"B");browsers.push(signupChrome)
    await signupChrome.start(crt)
    const signupEmail="b22-signup-"+randomBytes(10).toString("hex")+"@example.invalid"
    const signupPassword="Task-Strong-"+randomBytes(18).toString("hex")
    const signupPhone="+905551234569"
    const beforePeople=Number((await q("select count(*)::int n from da_person"))[0].n)
    const badSignup=await signupChrome.eval(`(async()=>{
      const r=await fetch('/personal/register',{method:'POST',credentials:'omit',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({first_name:'Synthetic',last_name:'Person',
          email:'no-person@example.invalid',password:'Strong-test-password-123'})});
      return {status:r.status};
    })()`)
    assert.equal(badSignup.status,400,"Missing mobile must not create an account")
    assert.equal(Number((await q("select count(*)::int n from da_person"))[0].n),beforePeople)
    // P2: +12345 has six characters but only five digits. It must be
    // rejected before native AuthIdentity/Customer or Person writes.
    const shortPhoneEmail="b22-short-mobile-"+randomBytes(10).toString("hex")+"@example.invalid"
    const shortPhone=await signupChrome.eval(`(async()=>{
      const r=await fetch('/personal/register',{method:'POST',credentials:'omit',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({first_name:'Synthetic',last_name:'Rejected',
          email:${JSON.stringify(shortPhoneEmail)},password:'Strong-test-password-123',
          mobile_phone:'+12345'})});
      return {status:r.status};
    })()`)
    assert.equal(shortPhone.status,400,"Five-digit mobile must fail before native registration")
    assert.equal(Number((await q("select count(*)::int n from da_person"))[0].n),beforePeople)
    assert.equal(Number((await q(
      "select count(*)::int n from public.customer where email=$1",
      [shortPhoneEmail]))[0].n),0,"Invalid mobile must leave no native Customer")
    await signupChrome.click("#register-details summary")
    await signupChrome.input("#register input[name=first_name]","Synthetic")
    await signupChrome.input("#register input[name=last_name]","Registrant")
    await signupChrome.input("#register input[name=email]",signupEmail)
    await signupChrome.input("#register input[name=mobile_phone]",signupPhone)
    await signupChrome.input("#register input[name=password]",signupPassword)
    await signupChrome.click("#register button")
    try {
      await signupChrome.wait("document.getElementById('status').textContent.includes('Kişi hesabı kaydedildi')")
    } catch {
      const ui=await signupChrome.eval(`(()=>{
        const form=document.getElementById('register');
        const t=document.getElementById('register-status').textContent;
        return {visible:!form.hidden,
          fieldsInvalid:Array.from(form.elements).filter(e=>e.name && !e.checkValidity()).map(e=>e.name),
          submitDisabled:form.querySelector('button').disabled,
          statusKind:t.includes('Kayıt bilgileri geçersiz')?'input-rejected':
            t.includes('bu hesapla tamamlanamadı')?'identity-rejected':
            t.includes('Çok fazla')?'rate-limited':
            t.includes('Kayıt sonucu doğrulanamadı')?'server-uncertain':
            t.includes('Bağlantı koptu')?'network-uncertain':'other',
          successNotice:document.getElementById('status').textContent.includes('Kişi hesabı kaydedildi')};
      })()`)
      const requests=signupChrome.http.filter(r=>r.path==="/personal/register")
        .map(({method,path,status})=>({method,path,status}))
      const postPeople=Number((await q("select count(*)::int n from da_person"))[0].n)
      let nativeCustomerCreated:boolean|null=null
      try{
        const customerRows=await q("select count(*)::int n from public.customer where email=$1",[signupEmail])
        nativeCustomerCreated=Number(customerRows[0].n)>0
      }catch{}
      // Read only a fixed, whitelisted server stage from the completed
      // HTTPS response. Never put raw request/response bodies or PII in CI logs.
      let serverStage="response-unavailable"
      try{
        const last=signupChrome.http.filter(r=>r.path==="/personal/register").slice(-1)[0]
        if(last?.requestId){
          const raw=await signupChrome.send("Network.getResponseBody",{requestId:last.requestId})
          const parsed=JSON.parse(raw.body)
          const stageCodes:Record<string,string>={
            "Registration is not yet complete; sign in to resume":"native-workflow",
            "Native account binding unavailable":"native-actor-binding",
            "Registration result could not be confirmed; sign in to check":"foundation-commit-or-customer-read",
            "Registration verification unavailable":"native-verification",
            "Registration could not be confirmed":"native-authentication",
            "Access denied":"identity-ownership",
          }
          serverStage=stageCodes[parsed.message]??"unclassified-denial"
        }
      }catch{}
      throw Error("B22 first Person signup failed: "+JSON.stringify({
        ui,requests,serverStage,personCountChange:postPeople-beforePeople,
        nativeCustomerCreated,registrationRequestCount:requests.length
      }))
    }
    const registered=await q(`select b.person_id,p.mobile_phone,p.mobile_version,
        b.actor_type,b.actor_id,b.auth_identity_id
      from da_login_binding b join da_person p on p.id=b.person_id
      join public.customer c on c.id=b.actor_id
      where b.actor_type='customer' and c.email=$1 and
        b.revoked_at is null and b.verified_at is not null`,[signupEmail])
    assert.equal(registered.length,1)
    assert.equal(registered[0].mobile_phone,signupPhone)
    assert.equal(registered[0].mobile_version,1)
    const signupPerson=registered[0].person_id
    assert.equal((await q("select count(*)::int n from da_organization_membership where person_id=$1",[signupPerson]))[0].n,0)
    assert.equal((await q("select count(*)::int n from da_platform_staff_grant where person_id=$1",[signupPerson]))[0].n,0)
    const primaryCustomerProof=await q(`select id,auth_identity_id,actor_id,revoked_at,proof_reference
      from da_verified_actor_binding where person_id=$1 and actor_type='customer'`,[signupPerson])
    assert.equal(primaryCustomerProof.length,1)
    assert.equal(primaryCustomerProof[0].auth_identity_id,registered[0].auth_identity_id)
    assert.equal(primaryCustomerProof[0].actor_id,registered[0].actor_id)
    assert.equal(primaryCustomerProof[0].revoked_at,null)
    assert.equal(primaryCustomerProof[0].proof_reference,"primary-emailpass-registration")
    assert.equal(Number((await q("select count(*)::int n from da_person"))[0].n),beforePeople+1)
    const signupAudits=await q(`select new_values::text as value from da_audit_event
      where actor_person_id=$1 and action='person.registered'`,[signupPerson])
    assert.equal(signupAudits.length,1)
    assert.ok(!JSON.stringify(signupAudits).includes(signupPhone))
    const countBeforeRetry=Number((await q("select count(*)::int n from da_person"))[0].n)
    const repeated=await signupChrome.eval(`(async()=>{
      const r=await fetch('/personal/register',{method:'POST',credentials:'omit',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          first_name:'Synthetic',last_name:'Registrant',
          email:${JSON.stringify(signupEmail)},
          password:${JSON.stringify(signupPassword)},
          mobile_phone:'+905551234568'
        })});
      return {status:r.status,registered:(await r.json()).registered};
    })()`)
    assert.equal(repeated.status,200,"Verified same-identity retry must not create Person")
    assert.equal(repeated.registered,true)
    assert.equal(Number((await q("select count(*)::int n from da_person"))[0].n),countBeforeRetry)
    assert.equal((await q("select mobile_phone from da_person where id=$1",[signupPerson]))[0].mobile_phone,signupPhone,
      "Retry must not silently overwrite canonical Person contact")
    await signupChrome.input("#login input[name=email]",signupEmail)
    await signupChrome.input("#login input[name=password]",signupPassword)
    await signupChrome.click("#login button")
    await signupChrome.wait("!document.getElementById('workspace').hidden || !document.getElementById('mfa-enrollment').hidden")
    const needMfa=await signupChrome.eval("!document.getElementById('mfa-enrollment').hidden")
    let signupSeed:string|null=null
    let signupEnrollmentCounter:number|null=null
    if(needMfa){
      await signupChrome.input("#mfa-enroll-start input[name=email]",signupEmail)
      await signupChrome.input("#mfa-enroll-start input[name=password]",signupPassword)
      await signupChrome.click("#mfa-enroll-start button")
      await signupChrome.wait("!document.getElementById('mfa-enroll-verify').hidden&&document.getElementById('mfa-seed').value.length>0")
      const seedUrl=await signupChrome.eval("document.getElementById('mfa-seed').value")
      const seed=seedUrl.startsWith("otpauth:")?new URL(seedUrl).searchParams.get("secret"):seedUrl
      assert.ok(seed)
      signupSeed=seed
      signupEnrollmentCounter=Math.floor(Date.now()/30000)
      await signupChrome.input("#mfa-enroll-verify input[name=code]",otp(seed!))
      await signupChrome.click("#mfa-enroll-verify button")
    }else{
      // Optional platform MFA does not force the enrollment UI. This task
      // creates a genuine native Medusa TOTP factor on its already verified,
      // disposable PRIMARY Customer identity; it does not forge Person login,
      // Staff authority or strong session. Actual Chrome password/TOTP follows.
      const enrolled=await auth.listAuthMfa(
        {auth_identity_id:registered[0].auth_identity_id,status:"enabled"},{take:2})
      assert.equal(enrolled.length,0,"Optional Customer should not have a factor")
      const native=await auth.startAuthMfa({
        auth_identity_id:registered[0].auth_identity_id,
        provider:"totp",issuer:"B22 registered primary Customer"})
      assert.ok(native?.mfa?.id&&native.secret)
      signupSeed=native.secret
      signupEnrollmentCounter=Math.floor(Date.now()/30000)
      await auth.verifyAuthMfa({
        id:native.mfa.id,auth_identity_id:registered[0].auth_identity_id,
        code:otp(native.secret)})
      assert.equal((await auth.listAuthMfa(
        {auth_identity_id:registered[0].auth_identity_id,status:"enabled"},{take:2})).length,1)
    }
    await signupChrome.wait(`!document.getElementById('workspace').hidden&&
      document.getElementById('person').textContent===${JSON.stringify('Person: '+signupPerson)}`)
    // Enrollment-only scope cannot exercise a sensitive Staff mutation.
    // Complete the real Medusa password+TOTP challenge on this exact native
    // primary Customer before claiming a strong browser session.
    assert.ok(signupSeed&&signupEnrollmentCounter!==null,
      "Real native MFA factor must exist before Customer Staff login")
    await until(async()=>Math.floor(Date.now()/30000)>signupEnrollmentCounter!,
      45000,"First Customer full login must use a fresh native TOTP counter")
    await signupChrome.send("Page.bringToFront")
    await signupChrome.wait("document.visibilityState==='visible'")
    // A real visitor logs out before logging back in for strong native MFA.
    // Do not fake the UI state by toggling DOM.hidden from the test.
    const preLogoutCookie=await signupChrome.token()
    assert.match(preLogoutCookie??"",/^[A-Za-z0-9_-]{43}$/)
    await signupChrome.click("#logout")
    await signupChrome.wait("!document.getElementById('login').hidden&&"+
      "document.getElementById('workspace').hidden")
    const [revokedFirstCustomerSession]=await q(
      "select status from da_browser_session where id=$1",
      [createHash("sha256").update(preLogoutCookie!).digest("hex")])
    assert.equal(revokedFirstCustomerSession?.status,"revoked",
      "Real browser logout must revoke first Customer session before re-login")
    await signupChrome.input("#login input[name=email]",signupEmail)
    await signupChrome.input("#login input[name=password]",signupPassword)
    await signupChrome.click("#login button")
    await signupChrome.wait("!document.getElementById('challenge').hidden")
    await signupChrome.input("#challenge input[name=code]",otp(signupSeed!))
    signupSeed=null
    await signupChrome.click("#challenge button")
    await signupChrome.wait(`!document.getElementById('workspace').hidden&&
      document.getElementById('person').textContent===${JSON.stringify('Person: '+signupPerson)}`)
    const ownPhone=await signupChrome.eval(`(async()=>{
      const r=await fetch('/personal/profile');
      const data=await r.json();
      return {status:r.status,mobile:data.mobile_phone,
        version:data.version,verified:data.phone_verified};
    })()`)
    assert.deepEqual(ownPhone,{status:200,mobile:signupPhone,version:1,verified:false})

    // This registered Person's PRIMARY native Customer is the authorized
    // first-party sign-in identity. Merely linked secondary Customers must NOT
    // gain a second login binding or a separate buyer/Staff account.
    const primaryCustomerToken=await signupChrome.token()
    assert.match(primaryCustomerToken??"",/^[A-Za-z0-9_-]{43}$/)
    const primaryCustomerSessions=await q(
      "select person_id,actor_type,actor_id,mfa_purpose,last_strong_auth_at"+
      " from da_browser_session where id=$1 and status='active'",
      [createHash("sha256").update(primaryCustomerToken!).digest("hex")])
    assert.equal(primaryCustomerSessions.length,1)
    assert.equal(primaryCustomerSessions[0].person_id,signupPerson)
    assert.equal(primaryCustomerSessions[0].actor_type,"customer")
    assert.equal(primaryCustomerSessions[0].actor_id,registered[0].actor_id)
    assert.equal(primaryCustomerSessions[0].mfa_purpose,"full")
    assert.ok(primaryCustomerSessions[0].last_strong_auth_at)
    // This second Person has a separate, real PRIMARY Medusa Customer,
    // native password + TOTP session, and NO Buyer Beta membership.
    // It must not read the earlier completed Beta history by guessing its ID.
    await verifyB22ForeignHistoricalOrder({
      other:signupChrome,buyerOrgId:organizations[1].id,
      orderGroupId:zeroOrderGroupId as string,
      otherCustomerId:registered[0].actor_id,
      ownerCustomerId:nativeCustomer.id,q
    })
    const primaryPolicyUrl="/personal/platform/store-application-policy?organization_id="+
      encodeURIComponent(organizations[0].id)
    const customerReadPolicy=()=>signupChrome.callFunction(
      "async function(url){return (await fetch(url)).status}",primaryPolicyUrl)
    const customerPauseReason="B22 primary Customer Staff policy pause"
    const customerReopenReason="B22 primary Customer Staff policy reopen"
    assert.equal(await customerReadPolicy(),403,
      "A newly registered Customer must not inherit platform task authority")
    assert.equal((await companyRight(false,true,customerPauseReason,true,
      organizations[0].id,signupChrome)).status,403)
    const primaryPolicyGrantId="da_staff_customer_policy_"+rand
    // The fixture explicitly grants this ONE platform task to the canonical
    // Person in the disposable CI DB; native Customer does not confer it.
    await q(`insert into da_platform_staff_grant
      (id,person_id,task,resource,granted_by_person_id,reason)
      values($1,$2,'store.application.policy.manage','platform',$2,
      'B22 isolated registered Customer policy actor')`,
      [primaryPolicyGrantId,signupPerson])
    try{
      assert.equal(await customerReadPolicy(),200,
        "Explicit task plus real strong Customer session may read platform policy")
      assert.equal(await signupChrome.callFunction(
        "async function(org){return (await fetch('/personal/audit-timeline?organization='+encodeURIComponent(org))).status}",
        organizations[0].id),403,
        "Unrelated Person cannot read company audit despite a platform Staff task")
      assert.deepEqual(await q(
        "select store_application_enabled from da_organization where id=$1",
        [organizations[0].id]),[{store_application_enabled:true}])
      assert.equal((await companyRight(false,true,customerPauseReason,false,
        organizations[0].id,signupChrome)).status,403,
        "A valid Staff Customer session cannot bypass same-origin CSRF")
      assert.equal((await companyRight(false,true,customerPauseReason,true,
        organizations[0].id,signupChrome)).status,200)
      assert.equal((await companyRight(true,false,customerReopenReason,true,
        organizations[0].id,signupChrome)).status,200)
      assert.deepEqual(await q(
        "select store_application_enabled from da_organization where id=$1",
        [organizations[0].id]),[{store_application_enabled:true}],
        "Customer Staff policy pair must restore Company state")
      const customerPolicyEvents=await q(
        "select e.id,e.action,e.actor_type,e.actor_id,e.actor_person_id,e.role_context,"+
        " x.id as outbox_id from da_audit_event e"+
        " join da_audit_outbox x on x.source_audit_event_id=e.id"+
        " where e.organization_id=$1 and e.new_values->>'reason'=any($2::text[])"+
        " and e.action in ('organization.store_application_right_disabled',"+
        " 'organization.store_application_right_enabled') order by e.action",
        [organizations[0].id,[customerPauseReason,customerReopenReason]])
      assert.deepEqual(customerPolicyEvents.map(e=>e.action),[
        "organization.store_application_right_disabled",
        "organization.store_application_right_enabled",
      ],"Both live primary Customer Staff HTTP changes need canonical audit/outbox")
      for(const event of customerPolicyEvents){
        assert.equal(event.actor_type,"customer")
        assert.equal(event.actor_id,registered[0].actor_id)
        assert.equal(event.actor_person_id,signupPerson)
        assert.equal(event.role_context,"platform_staff")
        assert.deepEqual(await q(
          "select person_id from da_notification_receipt where audit_event_id=$1",
          [event.id]),[{person_id:A.person}],
          "Only current Company protected Owner receives a policy receipt")
      }
    }finally{
      await q("update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1",
        [primaryPolicyGrantId])
    }
    assert.equal(await customerReadPolicy(),403,
      "Customer's platform task revoke must deny future reads immediately")
    assert.equal((await companyRight(false,true,"B22 Customer grant revoked",
      true,organizations[0].id,signupChrome)).status,403)
    assert.deepEqual(await q(
      "select store_application_enabled from da_organization where id=$1",
      [organizations[0].id]),[{store_application_enabled:true}])
    process.stdout.write("PASS B22 Chrome: primary Customer native MFA Person session and explicit Staff grant changed company policy through HTTPS, CSRF denied, two canonical Customer audit/outboxes and Owner-only notices; foreign audit denied, revoked task 403\n")

    // One Person starts and reopens an Organization application DRAFT only.
    // No tax document, legal approval, protected Owner or commerce right yet.
    const draftOrganizationsBefore=Number((await q(
      "select count(*)::int n from da_organization"))[0].n)
    const draftMembershipsBefore=Number((await q(
      "select count(*)::int n from da_organization_membership"))[0].n)
    const draftLegalName="B22 Sentetik İşletme Taslağı"
    const draftLandline="+90 212 555 00 00"
    await signupChrome.click('#organization-draft-form input[value=service_repair]')
    await signupChrome.click('#organization-draft-form input[value=insurance_claims]')
    await signupChrome.click('#organization-draft-form select[name=primary_activity]')
    for(const key of ["End","Enter"]){
      for(const type of ["keyDown","keyUp"])
        await signupChrome.send("Input.dispatchKeyEvent",{type,key,code:key})
    }
    assert.equal(await signupChrome.eval(
      "document.querySelector('#organization-draft-form select[name=primary_activity]').value"),
      "insurance_claims","Chrome must choose a non-default primary activity")
    await signupChrome.input("#organization-draft-form input[name=legal_name]",draftLegalName)
    await signupChrome.input("#organization-draft-form input[name=landline_phone]",draftLandline)
    await signupChrome.click("#organization-draft-form button[type=submit]")
    await signupChrome.wait("document.querySelector('#organization-draft-status').textContent.includes('Taslak kaydedildi')")
    const firstDraft=await q(`select id,applicant_person_id,business_kind,legal_name,landline_phone,
       declared_activities,primary_activity,status,version
      from da_organization_application where applicant_person_id=$1`,[signupPerson])
    assert.equal(firstDraft.length,1)
    assert.equal(firstDraft[0].applicant_person_id,signupPerson)
    assert.equal(firstDraft[0].business_kind,"individual_business")
    assert.deepEqual(firstDraft[0].declared_activities,
      ["service_repair","insurance_claims"])
    assert.equal(firstDraft[0].primary_activity,"insurance_claims")
    assert.equal(firstDraft[0].legal_name,draftLegalName)
    assert.equal(firstDraft[0].landline_phone,draftLandline)
    assert.equal(firstDraft[0].status,"draft")
    assert.equal(firstDraft[0].version,1)
    const draftId=firstDraft[0].id
    // This must be rejected by the PG16 CHECK itself, not just by HTTP/Zod.
    // A failed statement uses the existing disposable CI database only.
    await assert.rejects(
      q(`update da_organization_application
        set declared_activities=$2::jsonb,primary_activity='service_repair'
        where id=$1`,[draftId,JSON.stringify(["service_repair","service_repair"])]),
      (error:any)=>error?.code==="23514" &&
        error?.constraint==="da_org_application_activities_check",
      "PG16 must reject duplicate approved activity codes directly"
    )
    const afterDuplicate=await q(`select declared_activities,primary_activity,version
      from da_organization_application where id=$1`,[draftId])
    assert.equal(afterDuplicate.length,1)
    assert.deepEqual(afterDuplicate[0].declared_activities,
      ["service_repair","insurance_claims"])
    assert.equal(afterDuplicate[0].primary_activity,"insurance_claims")
    assert.equal(afterDuplicate[0].version,1)
    process.stdout.write("PASS B22 PG16: duplicate activity direct SQL 23514; original private draft unchanged\n")
    await signupChrome.wait("document.querySelector('#organization-draft-list button')?.textContent.includes('Taslağı düzenle')")
    await signupChrome.click("#organization-draft-list button")
    // B06Chrome.input appends text; select the existing form value first,
    // then send actual Chromium input (not a synthetic DOM/server mutation).
    await signupChrome.click("#organization-draft-form input[name=legal_name]")
    await signupChrome.eval("document.querySelector('#organization-draft-form input[name=legal_name]').select()")
    await signupChrome.send("Input.insertText",{text:"B22 Düzenlenmiş Sentetik İşletme"})
    // Choose the NON-default business kind with native Chromium keyboard input.
    // Reuse the proven B06Chrome.role() select interaction, not a DOM mutation.
    await signupChrome.click("#organization-draft-form select[name=business_kind]")
    for(const key of ["End","Enter"]){
      for(const type of ["keyDown","keyUp"])
        await signupChrome.send("Input.dispatchKeyEvent",{type,key,code:key})
    }
    assert.equal(await signupChrome.eval(
      "document.querySelector('#organization-draft-form select[name=business_kind]').value"),
      "legal_company","The real Chrome edit must choose the non-default legal-company kind")
    await signupChrome.click("#organization-draft-form button[type=submit]")
    await signupChrome.wait("document.querySelector('#organization-draft-status').textContent.includes('Taslak kaydedildi')")
    const revisedDraft=await q(`select version,legal_name,business_kind,declared_activities,primary_activity from da_organization_application
      where id=$1 and applicant_person_id=$2`,[draftId,signupPerson])
    assert.equal(revisedDraft.length,1)
    assert.equal(revisedDraft[0].version,2)
    assert.equal(revisedDraft[0].legal_name,"B22 Düzenlenmiş Sentetik İşletme")
    assert.deepEqual(revisedDraft[0].declared_activities,
      ["service_repair","insurance_claims"])
    assert.equal(revisedDraft[0].primary_activity,"insurance_claims")
    assert.equal(revisedDraft[0].business_kind,"legal_company",
      "PG16 must persist the non-default legal-company kind at version 2")
    const draftReplay=await signupChrome.eval(`(async()=>{
      const s=await (await fetch('/personal/session')).json();
      const body={application_id:${JSON.stringify(draftId)},expected_version:1,
        business_kind:'legal_company',
        declared_activities:['service_repair','insurance_claims'],
        primary_activity:'insurance_claims',legal_name:'Should not overwrite',
        landline_phone:'+90 212 555 00 00'};
      const stale=await fetch('/personal/organization-applications',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(body)});
      const badCsrf=await fetch('/personal/organization-applications',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':'forged'},
        body:JSON.stringify({...body,expected_version:2})});
      const badPhone=await fetch('/personal/organization-applications',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify({...body,landline_phone:'12',expected_version:2})});
      const badActivity=await fetch('/personal/organization-applications',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify({...body,expected_version:2,
          primary_activity:'manufacturing'})});
      const noCookie=await fetch('/personal/organization-applications',{credentials:'omit'});
      return {stale:stale.status,badCsrf:badCsrf.status,
        badPhone:badPhone.status,badActivity:badActivity.status,noCookie:noCookie.status};
    })()`)
    assert.deepEqual(draftReplay,{stale:409,badCsrf:403,badPhone:400,badActivity:400,noCookie:403})
    // Earlier B22 MFA-disabling tests deliberately REVOKED both A and B.
    // A revoked browser must not be used as proof of cross-Person isolation.
    // Register a genuinely distinct second Person over the same real HTTPS
    // route and native MFA flow, not a fabricated browser cookie or actor.
    const foreignDraftChrome=new B06Chrome(host,"B");browsers.push(foreignDraftChrome)
    await foreignDraftChrome.start(crt)
    const foreignEmail="b22-foreign-draft-"+randomBytes(10).toString("hex")+"@example.invalid"
    const foreignPassword="Task-Strong-"+randomBytes(18).toString("hex")
    await foreignDraftChrome.click("#register-details summary")
    await foreignDraftChrome.input("#register input[name=first_name]","Synthetic")
    await foreignDraftChrome.input("#register input[name=last_name]","Other")
    await foreignDraftChrome.input("#register input[name=email]",foreignEmail)
    await foreignDraftChrome.input("#register input[name=mobile_phone]","+905551234578")
    await foreignDraftChrome.input("#register input[name=password]",foreignPassword)
    await foreignDraftChrome.click("#register button")
    await foreignDraftChrome.wait("document.getElementById('status').textContent.includes('Kişi hesabı kaydedildi')")
    await foreignDraftChrome.input("#login input[name=email]",foreignEmail)
    await foreignDraftChrome.input("#login input[name=password]",foreignPassword)
    await foreignDraftChrome.click("#login button")
    await foreignDraftChrome.wait("!document.getElementById('workspace').hidden || !document.getElementById('mfa-enrollment').hidden")
    if(await foreignDraftChrome.eval("!document.getElementById('mfa-enrollment').hidden")){
      await foreignDraftChrome.input("#mfa-enroll-start input[name=email]",foreignEmail)
      await foreignDraftChrome.input("#mfa-enroll-start input[name=password]",foreignPassword)
      await foreignDraftChrome.click("#mfa-enroll-start button")
      await foreignDraftChrome.wait("!document.getElementById('mfa-enroll-verify').hidden&&document.getElementById('mfa-seed').value.length>0")
      const seedUrl=await foreignDraftChrome.eval("document.getElementById('mfa-seed').value")
      const seed=seedUrl.startsWith("otpauth:")?new URL(seedUrl).searchParams.get("secret"):seedUrl
      assert.ok(seed)
      await foreignDraftChrome.input("#mfa-enroll-verify input[name=code]",otp(seed!))
      await foreignDraftChrome.click("#mfa-enroll-verify button")
    }
    await foreignDraftChrome.wait("!document.getElementById('workspace').hidden")
    assert.equal(await foreignDraftChrome.eval(
      "(async()=> (await fetch('/personal/session')).status)()"),200,
      "Cross-Person denial must be tested from a real active second session")
    const otherDrafts=await foreignDraftChrome.eval(`(async()=>{
      const r=await fetch('/personal/organization-applications');
      const s=await (await fetch('/personal/session')).json();
      const edit=await fetch('/personal/organization-applications',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify({application_id:${JSON.stringify(draftId)},
          expected_version:2,business_kind:'legal_company',
           declared_activities:['service_repair','insurance_claims'],
           primary_activity:'insurance_claims',
          legal_name:'Foreign rewrite forbidden',landline_phone:'+90 212 555 00 00'})});
      const data=await r.json();
      return {status:r.status,items:data.drafts,foreignEdit:edit.status};
    })()`)
    assert.equal(otherDrafts.status,200)
    assert.ok(Array.isArray(otherDrafts.items))
    assert.ok(!otherDrafts.items.some((x:any)=>x.id===draftId))
    assert.equal(otherDrafts.foreignEdit,403)
    const draftAudits=await q(`select e.new_values::text as details
      from da_audit_event e join da_security_outbox o on o.audit_event_id=e.id
      where e.target_id=$1 and e.action='organization.application_draft_saved'`,[draftId])
    assert.equal(draftAudits.length,2)
    assert.ok(!JSON.stringify(draftAudits).includes(draftLandline))
    assert.ok(!JSON.stringify(draftAudits).includes(draftLegalName))
    assert.equal(Number((await q("select count(*)::int n from da_organization"))[0].n),
      draftOrganizationsBefore,"Draft cannot create legal Organization")
    assert.equal(Number((await q("select count(*)::int n from da_organization_membership"))[0].n),
      draftMembershipsBefore,"Draft cannot assign first Owner")
    assert.equal((await q("select version from da_organization_application where id=$1",[draftId]))[0].version,2)

    // --- B22 RELOAD PROOF ---
    // The same authenticated Person reloads the page with cache bypass.
    // The previously saved draft (version 2) must reappear in the draft list
    // exactly as persisted -- no new draft, Organization, Owner or audit write.
    const reloadDraftCountBefore=Number((await q(
      "select count(*)::int n from da_organization_application where applicant_person_id=$1",[signupPerson]))[0].n)
    const reloadOrgsBefore=Number((await q("select count(*)::int n from da_organization"))[0].n)
    const reloadMembsBefore=Number((await q("select count(*)::int n from da_organization_membership"))[0].n)
    const reloadAuditsBefore=Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1",[signupPerson]))[0].n)
    const reloadHttpStart=signupChrome.http.length
    await signupChrome.send("Page.reload",{ignoreCache:true})
    // Wait for the fresh authenticated workspace (not the login screen).
    await signupChrome.wait(`!document.getElementById('workspace').hidden&&document.getElementById('person').textContent==='Person: '+${JSON.stringify(signupPerson)}`)
    // Wait for the private draft list to render the persisted draft entry.
    await signupChrome.wait("document.querySelector('#organization-draft-list button')?.textContent.includes('Taslağı düzenle')")
    // Verify: same draft appears (version 2) in the UI list via the GET endpoint.
    const reloadListResponse=await signupChrome.eval(`(async()=>{
      const r=await fetch('/personal/organization-applications');
      const data=await r.json();
      return {status:r.status,drafts:data.drafts};
    })()`)
    assert.equal(reloadListResponse.status,200,"Fresh reload must return 200 for draft list")
    assert.ok(Array.isArray(reloadListResponse.drafts),"Draft list must be an array after reload")
    const reloadedDraft=reloadListResponse.drafts.find((x:any)=>x.id===draftId)
    assert.ok(reloadedDraft,"Same draft id must survive a full page reload")
    assert.equal(reloadedDraft.version,2,"Draft version must remain 2 after reload (no new write)")
    assert.deepEqual(reloadedDraft.declared_activities,
      ["service_repair","insurance_claims"])
    assert.equal(reloadedDraft.primary_activity,"insurance_claims")
    // After a full reload the untouched form starts at its original default.
    // Removing the UI's item.business_kind restoration must now FAIL this test.
    assert.equal(await signupChrome.eval(
      "document.querySelector('#organization-draft-form select[name=business_kind]').value"),
      "individual_business","Fresh form must begin on its default kind before edit")
    // Click the visible "Taslağı düzenle" control -- a real Chromium user action.
    await signupChrome.click("#organization-draft-list button")
    // After clicking, the form must populate with the persisted values.
    await signupChrome.wait("document.querySelector('#organization-draft-form input[name=legal_name]')?.value.length>0")
    const reloadFormValues=await signupChrome.eval(`(()=>{
      const form=document.getElementById('organization-draft-form');
      return {
        declared_activities:Array.from(form.querySelectorAll(
          'input[name=declared_activities]:checked'),x=>x.value),
        primary_activity:form.elements.primary_activity.value,
        business_kind:form?.querySelector('select[name=business_kind]')?.value??
                      form?.querySelector('input[name=business_kind]')?.value??null,
        legal_name:form?.querySelector('input[name=legal_name]')?.value??null,
        landline_phone:form?.querySelector('input[name=landline_phone]')?.value??null,
      };
    })()`)
    // The form must reflect the version-2 legal_name (edited value), not the original draft.
    assert.equal(reloadFormValues.legal_name,"B22 Düzenlenmiş Sentetik İşletme",
      "Reload must populate form with persisted version-2 legal name")
    assert.equal(reloadFormValues.landline_phone,draftLandline,
      "Reload must populate form with persisted landline")
    assert.equal(reloadedDraft.business_kind,"legal_company",
      "Reload GET must preserve the persisted NON-default legal-company kind")
    assert.deepEqual(reloadFormValues.declared_activities,
      reloadedDraft.declared_activities,
      "Reloaded edit form must restore declared activity selections")
    assert.equal(reloadFormValues.primary_activity,reloadedDraft.primary_activity,
      "Reloaded edit form must restore the primary activity")
    assert.equal(reloadFormValues.business_kind,reloadedDraft.business_kind,
      "Reloaded edit form must restore the exact persisted business kind")
    process.stdout.write("PASS B22 Chrome: declared activities and primary activity saved in PG16; foreign and invalid primary denied; reload restores selection\n")
    // PG16 invariants: reload must not create any new rows.
    assert.equal(Number((await q(
      "select count(*)::int n from da_organization_application where applicant_person_id=$1",[signupPerson]))[0].n),
      reloadDraftCountBefore,"Reload must not create a second draft row")
    assert.equal(Number((await q("select count(*)::int n from da_organization"))[0].n),
      reloadOrgsBefore,"Reload must not create a legal Organization")
    assert.equal(Number((await q("select count(*)::int n from da_organization_membership"))[0].n),
      reloadMembsBefore,"Reload must not assign an Owner membership")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1",[signupPerson]))[0].n),
      reloadAuditsBefore,"Reload must not emit a new audit write")
    // Confirm: no POST to organization-applications was issued during reload.
    const reloadPosts=signupChrome.http.slice(reloadHttpStart).filter(
      (r:any)=>r.method==="POST"&&r.path==="/personal/organization-applications")
    assert.equal(reloadPosts.length,0,"Page reload must issue zero POSTs to organization-applications")
    process.stdout.write("PASS B22 Chrome: Person private Organization draft reload; version-2 reappears in list; Taslağı düzenle opens populated form; zero new draft/Organization/Owner/audit write\n")
    // --- END B22 RELOAD PROOF ---
    process.stdout.write("PASS B22 Chrome: Person private Organization draft save/edit, foreign/unauthenticated/CSRF/replay denies, PG16 audit without Organization or Owner\n")

    // Legacy-shaped draft: omit BOTH columns added by the activity migration.
    // PG16 must supply []/NULL, preserve the original Person, ID and version,
    // allow a private read, and let Chrome upgrade the same row via normal POST.
    // This is a post-migration compatibility fixture, not an asserted
    // pre-migration database upgrade simulation.
    const legacyDraftId="daorgapp_"+randomBytes(16).toString("hex")
    await q(`insert into da_organization_application
      (id,applicant_person_id,business_kind,legal_name,landline_phone,status,version)
      values($1,$2,'individual_business','B22 Önceki Taslak',$3,'draft',1)`,
      [legacyDraftId,signupPerson,draftLandline])
    const legacyBefore=await q(`select id,applicant_person_id,
      declared_activities,primary_activity,status,version
      from da_organization_application where id=$1`,[legacyDraftId])
    assert.equal(legacyBefore.length,1)
    assert.equal(legacyBefore[0].id,legacyDraftId)
    assert.equal(legacyBefore[0].applicant_person_id,signupPerson)
    assert.deepEqual(legacyBefore[0].declared_activities,[])
    assert.equal(legacyBefore[0].primary_activity,null)
    assert.equal(legacyBefore[0].status,"draft")
    assert.equal(legacyBefore[0].version,1)
    const legacyVisible=await signupChrome.eval(`(async()=>{
      const r=await fetch('/personal/organization-applications');
      const data=await r.json();
      return {status:r.status,draft:data.drafts?.find(
        x=>x.id===${JSON.stringify(legacyDraftId)})};
    })()`)
    assert.equal(legacyVisible.status,200)
    assert.deepEqual(legacyVisible.draft.declared_activities,[])
    assert.equal(legacyVisible.draft.primary_activity,null)
    assert.equal(legacyVisible.draft.version,1)
    await signupChrome.click("#organization-draft-refresh")
    await signupChrome.wait("document.querySelector('#organization-draft-list p:first-child')?.textContent.includes('B22 Önceki Taslak')")
    await signupChrome.click("#organization-draft-list p:first-child button")
    const legacyFormBefore=await signupChrome.eval(`(()=>{
      const form=document.getElementById('organization-draft-form');
      return {name:form.elements.legal_name.value,
        selected:form.querySelectorAll('input[name=declared_activities]:checked').length,
        primary:form.elements.primary_activity.value};
    })()`)
    assert.deepEqual(legacyFormBefore,{name:"B22 Önceki Taslak",selected:0,primary:""})
    await signupChrome.click('#organization-draft-form input[value=insurance_claims]')
    await signupChrome.click('#organization-draft-form select[name=primary_activity]')
    for(const key of ["End","Enter"]){
      for(const type of ["keyDown","keyUp"])
        await signupChrome.send("Input.dispatchKeyEvent",{type,key,code:key})
    }
    await signupChrome.click("#organization-draft-form button[type=submit]")
    await signupChrome.wait("document.querySelector('#organization-draft-status').textContent.includes('Taslak kaydedildi')")
    const legacyAfter=await q(`select id,applicant_person_id,declared_activities,
      primary_activity,status,version from da_organization_application
      where id=$1`,[legacyDraftId])
    assert.equal(legacyAfter.length,1)
    assert.equal(legacyAfter[0].id,legacyDraftId)
    assert.equal(legacyAfter[0].applicant_person_id,signupPerson)
    assert.deepEqual(legacyAfter[0].declared_activities,["insurance_claims"])
    assert.equal(legacyAfter[0].primary_activity,"insurance_claims")
    assert.equal(legacyAfter[0].status,"draft")
    assert.equal(legacyAfter[0].version,2)
    assert.equal(Number((await q("select count(*)::int n from da_organization"))[0].n),
      draftOrganizationsBefore,"Legacy draft edit cannot create Organization")
    assert.equal(Number((await q("select count(*)::int n from da_organization_membership"))[0].n),
      draftMembershipsBefore,"Legacy draft edit cannot create Owner")
    process.stdout.write("PASS B22 PG16/Chrome: legacy-shaped empty activity draft []/NULL, private GET and visible edit persist same id/person to v2; no Organization/Owner\n")

    // Codex #269 P2: hold a REAL committed POST response while the browser
    // remains in saving state. A second draft selection/new action must not
    // consume the old form with the newer server version.
    await signupChrome.click("#organization-draft-form input[name=legal_name]")
    await signupChrome.eval("document.querySelector('#organization-draft-form input[name=legal_name]').select()")
    await signupChrome.send("Input.insertText",{text:"B22 Gecikmeli Kaydedilen Taslak"})
    await signupChrome.eval(`(()=>{
      const original=window.fetch.bind(window);
      const hold={original,used:false,release:null};
      window.__daDraftHold=hold;
      window.fetch=(...args)=>{
        const path=String(args[0]);
        if(!hold.used && path.includes('/personal/organization-applications') &&
          args[1]?.method==='POST'){
          hold.used=true;
          return original(...args).then(response=>new Promise(resolve=>{
            hold.release=()=>resolve(response);
          }));
        }
        return original(...args);
      };
    })()`)
    try{
      await signupChrome.click("#organization-draft-form button[type=submit]")
      await signupChrome.wait("!!window.__daDraftHold?.release")
      const committed=await q("select version,legal_name from da_organization_application where id=$1",[legacyDraftId])
      assert.deepEqual(committed,[{version:3,legal_name:"B22 Gecikmeli Kaydedilen Taslak"}])
      const protectedForm=await signupChrome.eval(`(()=>{
        const f=document.getElementById('organization-draft-form');
        const current={id:f.elements.legal_name.value,
          newDisabled:document.getElementById('organization-draft-new').disabled,
          refreshDisabled:document.getElementById('organization-draft-refresh').disabled,
          editDisabled:Array.from(document.querySelectorAll('#organization-draft-list button'))
            .every(x=>x.disabled),
          inputsDisabled:Array.from(f.querySelectorAll('input,select,button'))
            .every(x=>x.disabled)};
        document.getElementById('organization-draft-new').click();
        document.querySelector('#organization-draft-list button')?.click();
        return {...current,after:f.elements.legal_name.value};
      })()`)
      assert.equal(protectedForm.id,"B22 Gecikmeli Kaydedilen Taslak")
      assert.equal(protectedForm.after,protectedForm.id,"Blocked selection may not restore stale form")
      for(const key of ["newDisabled","refreshDisabled","editDisabled","inputsDisabled"])
        assert.equal(protectedForm[key],true,"Pending draft save must lock "+key)
      await signupChrome.eval("window.__daDraftHold.release()")
      await signupChrome.wait("document.querySelector('#organization-draft-status').textContent.includes('Taslak kaydedildi')")
      assert.deepEqual(await q("select version,legal_name from da_organization_application where id=$1",[legacyDraftId]),
        committed,"Delayed HTTP response cannot undo a committed draft")
      assert.equal(await signupChrome.eval("document.querySelector('#organization-draft-form input[name=legal_name]').value"),
        committed[0].legal_name)
      process.stdout.write("PASS B22 Chrome: delayed real draft POST locks selection/form; no stale-value rewrite or silent version overwrite\n")
    }finally{
      await signupChrome.eval(`(()=>{
        const hold=window.__daDraftHold;
        if(hold?.release)hold.release();
        if(hold?.original)window.fetch=hold.original;
        delete window.__daDraftHold;
      })()`)
    }

    // Codex #269 P2: 101 older task-owned drafts must remain reachable in
    // actual Chrome. Seed private disposable PG16 rows only; no production
    // data, migration or real user records. Delete exactly these fixture IDs.
    const overflowIds=Array.from({length:101},()=> "daorgapp_"+randomBytes(16).toString("hex"))
    try{
      await q(`insert into da_organization_application
        (id,applicant_person_id,business_kind,legal_name,landline_phone,status,version,updated_at)
        select x.id,$2,'individual_business','B22 Eski Sentetik Taslak',$3,'draft',1,
          clock_timestamp()-interval '30 days'-(x.ordinality*interval '1 second')
        from unnest($1::text[]) with ordinality as x(id,ordinality)`,
        [overflowIds,signupPerson,draftLandline])
      const pages=await signupChrome.eval(`(async()=>{
        const first=await (await fetch('/personal/organization-applications')).json();
        const second=await (await fetch('/personal/organization-applications?cursor='+
          encodeURIComponent(first.next_cursor))).json();
        return {firstCount:first.drafts.length,secondCount:second.drafts.length,
          unique:new Set([...first.drafts,...second.drafts].map(x=>x.id)).size,
          firstCursor:!!first.next_cursor,lastCursor:second.next_cursor,
          secondIds:second.drafts.map(x=>x.id)};
      })()`)
      assert.deepEqual({firstCount:pages.firstCount,secondCount:pages.secondCount,
        unique:pages.unique,firstCursor:pages.firstCursor,lastCursor:pages.lastCursor},
        {firstCount:100,secondCount:3,unique:103,firstCursor:true,lastCursor:null})
      assert.ok(pages.secondIds.some((id:string)=>overflowIds.includes(id)))
      const foreignPage=await foreignDraftChrome.eval(`(async()=>{
        const first=await (await fetch('/personal/organization-applications')).json();
        return {count:first.drafts.length,more:first.next_cursor};
      })()`)
      assert.deepEqual(foreignPage,{count:0,more:null},
        "Another genuine Person may not read the original Person's pagination")
      await signupChrome.click("#organization-draft-refresh")
      await signupChrome.wait("document.querySelectorAll('#organization-draft-list button').length===100 && !document.querySelector('#organization-draft-more').hidden")
      await signupChrome.click("#organization-draft-more")
      await signupChrome.wait("document.querySelectorAll('#organization-draft-list button').length===103 && document.querySelector('#organization-draft-more').hidden")
      await signupChrome.click("#organization-draft-list p:last-child button")
      assert.equal(await signupChrome.eval("document.querySelector('#organization-draft-form input[name=legal_name]').value"),
        "B22 Eski Sentetik Taslak")
      assert.equal(Number((await q("select count(*)::int n from da_organization"))[0].n),
        draftOrganizationsBefore)
      assert.equal(Number((await q("select count(*)::int n from da_organization_membership"))[0].n),
        draftMembershipsBefore)
      process.stdout.write("PASS B22 Chrome: 103 private drafts across keyset pages; oldest opened via visible button; foreign Person empty; no Organization/Owner\n")
    }finally{
      await q("delete from da_organization_application where applicant_person_id=$1 and id=any($2::text[])",
        [signupPerson,overflowIds])
      await signupChrome.click("#organization-draft-new")
      await signupChrome.click("#organization-draft-refresh")
    }



    // B22 approved, non-deleting applicant draft withdrawal; no documents or privileges.
    await signupChrome.click("#organization-draft-refresh")
    await signupChrome.wait("document.querySelector('#organization-draft-list p:first-child')?.textContent.includes('B22 Gecikmeli Kaydedilen Taslak')")
    const withdrawBefore=await q("select status,version from da_organization_application where id=$1",[legacyDraftId])
    assert.deepEqual(withdrawBefore,[{status:"draft",version:3}])
    const withdrawal={action:"withdraw",application_id:legacyDraftId,expected_version:3}
    const payloadLiteral=JSON.stringify(withdrawal)
    const foreignWithdrawal=await foreignDraftChrome.eval("(async()=>{"+
      "const s=await (await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/organization-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify("+payloadLiteral+")});"+
      "return {status:r.status,body:await r.json()};})()")
    assert.equal(foreignWithdrawal.status,403)
    assert.equal(JSON.stringify(foreignWithdrawal.body).includes("B22 Gecikmeli"),false)
    const rejectedWithdrawal=await signupChrome.eval("(async()=>{"+
      "const payload="+payloadLiteral+";"+
      "const s=await (await fetch('/personal/session')).json();"+
      "const missing=await fetch('/personal/organization-applications',{method:'POST',"+
        "headers:{'content-type':'application/json'},body:JSON.stringify(payload)});"+
      "const stale=await fetch('/personal/organization-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify({...payload,expected_version:2})});"+
      "return {csrf:missing.status,stale:stale.status};})()")
    assert.deepEqual(rejectedWithdrawal,{csrf:403,stale:409})
    assert.deepEqual(await q("select status,version from da_organization_application where id=$1",[legacyDraftId]),
      withdrawBefore,"Denials may not mutate the private application")
    await signupChrome.click("#organization-draft-list p:first-child button")
    await signupChrome.wait("!document.querySelector('#organization-draft-withdraw').hidden")
    await signupChrome.click("#organization-draft-withdraw")
    await signupChrome.wait("document.querySelector('#organization-draft-status').textContent.includes('Başvuru/taslak geri çekildi')")
    assert.deepEqual(await q("select status,version from da_organization_application where id=$1",[legacyDraftId]),
      [{status:"withdrawn",version:4}])
    const afterWithdrawal=await signupChrome.eval("(async()=>{"+
      "const r=await fetch('/personal/organization-applications');"+
      "const d=await r.json();"+
      "const row=Array.from(document.querySelectorAll('#organization-draft-list p'))"+
        ".find(x=>x.textContent.includes('B22 Gecikmeli Kaydedilen Taslak'));"+
      "return {status:r.status,saved:d.drafts?.find(x=>x.id==="+JSON.stringify(legacyDraftId)+")?.status,"+
        "visible:row?.textContent.includes('Geri çekildi'),"+
        "editButtons:row?.querySelectorAll('button').length};})()")
    assert.deepEqual(afterWithdrawal,{status:200,saved:"withdrawn",visible:true,editButtons:0})
    const replayWithdrawal=await signupChrome.eval("(async()=>{"+
      "const s=await (await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/organization-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify("+payloadLiteral+")});return r.status;})()")
    assert.equal(replayWithdrawal,409)
    const withdrawalAudit=await q("select action,target_id from da_audit_event "+
      "where target_id=$1 and action='organization.application_draft_withdrawn'",[legacyDraftId])
    assert.deepEqual(withdrawalAudit,[{action:"organization.application_draft_withdrawn",target_id:legacyDraftId}])
    assert.equal(Number((await q("select count(*)::int n from da_organization"))[0].n),draftOrganizationsBefore)
    assert.equal(Number((await q("select count(*)::int n from da_organization_membership"))[0].n),draftMembershipsBefore)
    process.stdout.write("PASS B22 Chrome: private applicant withdraws draft; foreign/CSRF/stale/replay denied; persisted audit, no Organization/Owner\n")

    // =========================================================================
    // B22 REAL HTTP / CHROME / PG16 TAX CERTIFICATE & SUBMISSION ACCEPTANCE JOURNEY
    // =========================================================================
    const b22TaxAppId="daorgapp_"+randomBytes(16).toString("hex")
    const b22TaxId="1234567890"

    // 1. Create fresh draft for tax certificate upload journey
    const draftCreateRes=await signupChrome.eval(`(async()=>{`+
      `const s=await (await fetch('/personal/session')).json();`+
      `const r=await fetch('/personal/organization-applications',{`+
        `method:'POST',`+
        `headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},`+
        `body:JSON.stringify({`+
          `application_id:${JSON.stringify(b22TaxAppId)},`+
          `expected_version:0,`+
          `business_kind:'legal_company',`+
          `legal_name:'B22 Vergi Levhası Test Şirketi',`+
          `landline_phone:'+90 212 555 12 34',`+
          `tax_identifier:${JSON.stringify(b22TaxId)},`+
          `declared_activities:['service_repair'],`+
          `primary_activity:'service_repair'`+
        `})`+
      `});`+
      `return {status:r.status,body:await r.json()};`+
    `})()`)
    assert.equal(draftCreateRes.status,201)
    assert.equal(draftCreateRes.body.version,1)

    // 2. Reject 10 MiB + 1 byte upload (10485761 bytes)
    const oversizeBase64 = Buffer.alloc(10485761, 65).toString("base64")
    const oversizeUploadRes = await signupChrome.eval(`(async()=>{`+
      `const s=await (await fetch('/personal/session')).json();`+
      `const r=await fetch('/personal/organization-applications',{`+
        `method:'POST',`+
        `headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},`+
        `body:JSON.stringify({`+
          `action:'upload_document',`+
          `application_id:${JSON.stringify(b22TaxAppId)},`+
          `expected_version:1,`+
          `filename:'tax-certificate.pdf',`+
          `file_base64:${JSON.stringify(oversizeBase64)}`+
        `})`+
      `});`+
      `return r.status;`+
    `})()`)
    assert.equal(oversizeUploadRes, 400, "10 MiB + 1 byte document must be rejected with 400")

    // 3. Foreign Person cannot upload to another Person's draft
    const foreignUploadRes = await foreignDraftChrome.eval(`(async()=>{`+
      `const s=await (await fetch('/personal/session')).json();`+
      `const r=await fetch('/personal/organization-applications',{`+
        `method:'POST',`+
        `headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},`+
        `body:JSON.stringify({`+
          `action:'upload_document',`+
          `application_id:${JSON.stringify(b22TaxAppId)},`+
          `expected_version:1,`+
          `filename:'tax-certificate.pdf',`+
          `file_base64:'JVBERi0xLjQKJcTl8uXrCgoxIDAgb2JqCjw8L1R5cGUvQ2F0YWxvZwovUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzCi9LaWRzWzMgMCBSXQovQ291bnQgMQo+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3hbMCAwIDYxMiA3OTJdCi9SZXNvdXJjZXM8PD4+Cj4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2OCAwMDAwMCBuIAowMDAwMDAwMTI1IDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA0Ci9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjIxMwprfUVPZgo='`+
        `})`+
      `});`+
      `return r.status;`+
    `})()`)
    assert.equal(foreignUploadRes, 403, "Foreign Person must be denied document upload")

    // 4. Upload an actual structurally readable PDF at exactly 10 MiB.
    // The earlier header + spaces + %%EOF fixture was not a parseable PDF.
    // Generate one-page PDF objects/xref with a harmless padded content
    // stream; this remains an entirely synthetic, private CI-only document.
    const exact10MibPdf=(()=>{
      const target=10485760
      const build=(streamLength:number)=>{
        const parts:Buffer[]=[]
        const offsets:number[]=[0]
        let length=0
        const add=(value:Buffer|string)=>{
          const bytes=typeof value==="string"?Buffer.from(value,"ascii"):value
          parts.push(bytes);length+=bytes.length
        }
        const obj=(n:number,body:string)=>{
          offsets.push(length)
          add(n+" 0 obj\n"+body+"\nendobj\n")
        }
        add("%PDF-1.4\n%Synthetic certificate for isolated B22 tests\n")
        obj(1,"<< /Type /Catalog /Pages 2 0 R >>")
        obj(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
        obj(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>")
        obj(4,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
        const content=Buffer.from("BT /F1 12 Tf 36 700 Td (Synthetic certificate) Tj ET\n","ascii")
        assert.ok(streamLength>=content.length)
        offsets.push(length)
        add("5 0 obj\n<< /Length "+streamLength+" >>\nstream\n")
        add(content)
        add(Buffer.alloc(streamLength-content.length,0x20))
        add("\nendstream\nendobj\n")
        const xref=length
        add("xref\n0 6\n0000000000 65535 f \n")
        for(const off of offsets.slice(1))
          add(String(off).padStart(10,"0")+" 00000 n \n")
        add("trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n"+xref+"\n%%EOF\n")
        return Buffer.concat(parts)
      }
      let streamLength=target-600
      for(let attempt=0;attempt<8;attempt++){
        const bytes=build(streamLength)
        if(bytes.length===target)return bytes
        streamLength+=target-bytes.length
      }
      throw Error("Unable to construct exact-size valid synthetic PDF")
    })()
    assert.equal(exact10MibPdf.length,10485760,"Exact 10 MiB real-structure PDF test asset")
    const exact10MibBase64 = exact10MibPdf.toString("base64")
    // A separate two-page synthetic document tests full-page staff review.
    const twoPagePdfBase64="JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDggMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9Db250ZW50cyA5IDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdIC9QYXJlbnQgNyAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNSAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDcgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MTEwNzA5NDM1MSswMCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MTEwNzA5NDM1MSswMCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9Db3VudCAyIC9LaWRzIFsgMyAwIFIgNCAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjggMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMTA5Cj4+CnN0cmVhbQpHYXBRaDBFPUYsMFVcSDNUXHBOWVReUUtrP3RjPklQLDtXI1UxXjIzaWhQRU1fP0NXNEtJU2k8OmJYYWE6XkcwQ2N1QVJiJDRdbz1FLS07KG5GdU8yZTVRXnE7QChZT1dFOCFaIShGNC0mSH4+ZW5kc3RyZWFtCmVuZG9iago5IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDExMgo+PgpzdHJlYW0KR2FwUWgwRT1GLDBVXEgzVFxwTllUXlFLaz90Yz5JUCw7VyNVMV4yM2loUEVNXz9DVzRLSVNpPDpiWGFhOl5HMENjajRmO3BAaVcqI11PbTA8PSY5aCRrLjovPCFeVEQjZ2ldZjs7X0tVSmttJzZ+PmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDEwCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMDkyIDAwMDAwIG4gCjAwMDAwMDAxOTkgMDAwMDAgbiAKMDAwMDAwMDM5MiAwMDAwMCBuIAowMDAwMDAwNTg1IDAwMDAwIG4gCjAwMDAwMDA2NTMgMDAwMDAgbiAKMDAwMDAwMDkxNCAwMDAwMCBuIAowMDAwMDAwOTc5IDAwMDAwIG4gCjAwMDAwMDExNzggMDAwMDAgbiAKMDAwMDAwMDk3OSAwMDAwMCBuIAowMDAwMDAxMTc4IDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIFs8NzZjYzE0NWFkY2E1NTJhOWM5MzRmMzllNDFiMTJlZDQ+PDc2Y2MxNDVhZGNhNTUyYTljOTM0ZjM5ZTQxYjEyZWQ0Pl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA2IDAgUgovUm9vdCA1IDAgUgovU2l6ZSAxMAo+PgpzdGFydHhyZWYKMTM4MAolJUVPRgo="

    const uploadRes = await signupChrome.eval(`(async()=>{`+
      `const s=await (await fetch('/personal/session')).json();`+
      `const r=await fetch('/personal/organization-applications',{`+
        `method:'POST',`+
        `headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},`+
        `body:JSON.stringify({`+
          `action:'upload_document',`+
          `application_id:${JSON.stringify(b22TaxAppId)},`+
          `expected_version:1,`+
          `filename:'tax-certificate.pdf',`+
          `file_base64:${JSON.stringify(exact10MibBase64)}`+
        `})`+
      `});`+
      `return {status:r.status,body:await r.json()};`+
    `})()`)
    assert.equal(uploadRes.status, 200, "10 MiB upload must succeed via real HTTP")
    assert.equal(uploadRes.body.version, 2)
    assert.equal(uploadRes.body.document.original_byte_length, 10485760)
    // A successful HTTP upload must persist real ClamAV + protected PNG
    // evidence. This is NOT a time-based or browser supplied clean flag.
    const initialScanEvidence = await q(
      "select scanned_clamav_identity,preview_renderer_revision,safe_preview_sha256,octet_length(safe_preview_png)::int as png_bytes,scanned_at::text as scanned_at from da_organization_application_document where application_id=$1 and is_current=true",
      [b22TaxAppId])
    assert.equal(initialScanEvidence.length,1)
    assert.match(initialScanEvidence[0].scanned_clamav_identity,
      /^[A-Za-z0-9_.+-]+\/[0-9]+\/[0-9]{13}$/)
    assert.equal(initialScanEvidence[0].preview_renderer_revision,"all-pages-png-20261107-v1")
    assert.match(initialScanEvidence[0].safe_preview_sha256,/^[0-9a-f]{64}$/)
    assert.ok(initialScanEvidence[0].png_bytes>64&&initialScanEvidence[0].png_bytes<=4*1024*1024)
    assert.ok(initialScanEvidence[0].scanned_at)

    // 5. Authorized download by applicant
    const downloadRes = await signupChrome.eval(`(async()=>{`+
      `const r=await fetch('/personal/organization-applications?action=document&application_id='+encodeURIComponent(${JSON.stringify(b22TaxAppId)}));`+
      `const blob=await r.blob();`+
      `return {status:r.status,type:r.headers.get('content-type'),size:blob.size};`+
    `})()`)
    assert.equal(downloadRes.status, 200)
    assert.equal(downloadRes.type, "application/pdf")
    assert.equal(downloadRes.size, 10485760)

    // 6. Foreign download denied
    const foreignDownloadRes = await foreignDraftChrome.eval(`(async()=>{`+
      `const r=await fetch('/personal/organization-applications?action=document&application_id='+encodeURIComponent(${JSON.stringify(b22TaxAppId)}));`+
      `return r.status;`+
    `})()`)
    assert.equal(foreignDownloadRes, 403, "Foreign Person must not download applicant document")

    // 7. Submit verification fail-closed: corrupt stored file on disk
    const storedDoc = (await q("select storage_key,internal_name from da_organization_application_document where application_id=$1 and is_current=true",[b22TaxAppId]))[0]
    const storedPath = join(taxDir, storedDoc.storage_key)
    const backupBytes = readFileSync(storedPath)
    try {
      writeFileSync(storedPath, Buffer.from("corrupted file bytes"))
      const failClosedSubmit = await signupChrome.eval(`(async()=>{`+
        `const s=await (await fetch('/personal/session')).json();`+
        `const r=await fetch('/personal/organization-applications',{`+
          `method:'POST',`+
          `headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},`+
          `body:JSON.stringify({`+
            `action:'submit',`+
            `application_id:${JSON.stringify(b22TaxAppId)},`+
            `expected_version:2`+
          `})`+
        `});`+
        `return r.status;`+
      `})()`)
      assert.equal(failClosedSubmit, 400, "Submission with corrupted private file must fail closed (400)")
      assert.equal((await q("select status from da_organization_application where id=$1",[b22TaxAppId]))[0].status, "draft")
    } finally {
      writeFileSync(storedPath, backupBytes)
    }

    // 8. Submit successfully with intact file
    const validSubmitRes = await signupChrome.eval(`(async()=>{`+
      `const s=await (await fetch('/personal/session')).json();`+
      `const r=await fetch('/personal/organization-applications',{`+
        `method:'POST',`+
        `headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},`+
        `body:JSON.stringify({`+
          `action:'submit',`+
          `application_id:${JSON.stringify(b22TaxAppId)},`+
          `expected_version:2`+
        `})`+
      `});`+
      `return {status:r.status,body:await r.json()};`+
    `})()`)
    assert.equal(validSubmitRes.status, 200)
    assert.equal(validSubmitRes.body.status, "submitted")
    assert.equal(validSubmitRes.body.version, 3)

    // 9. Confidential duplicate tax-identifier check:
    const foreignAppId="daorgapp_"+randomBytes(16).toString("hex")
    // Inject fixture data as CDP values, not executable source. Keep every
    // request inside the foreign applicant's real Chrome/HTTPS/CSRF session.
    const foreignSetup=await foreignDraftChrome.callFunction(
      `async function(applicationId,taxIdentifier,pdfBase64){
        const s=await (await fetch('/personal/session')).json();
        const headers={'content-type':'application/json','x-csrf-token':s.csrf_token};
        const create=await fetch('/personal/organization-applications',{
          method:'POST',headers,
          body:JSON.stringify({
            application_id:applicationId,
            expected_version:0,
            business_kind:'legal_company',
            legal_name:'Foreign Duplicate Company',
            landline_phone:'+90 212 555 99 99',
            tax_identifier:taxIdentifier,
            declared_activities:['service_repair','insurance_claims'],
            primary_activity:'service_repair'
          })
        });
        const upload=await fetch('/personal/organization-applications',{
          method:'POST',headers,
          body:JSON.stringify({
            action:'upload_document',
            application_id:applicationId,
            expected_version:1,
            filename:'tax-certificate.pdf',
            file_base64:pdfBase64
          })
        });
        return {createStatus:create.status,uploadStatus:upload.status};
      }`,
      foreignAppId,b22TaxId,twoPagePdfBase64)
    assert.deepEqual(foreignSetup,{createStatus:201,uploadStatus:200},
      "Foreign applicant must save draft and upload through real HTTPS")
    const duplicateSubmitRes=await foreignDraftChrome.callFunction(
      `async function(applicationId){
        const s=await (await fetch('/personal/session')).json();
        const r=await fetch('/personal/organization-applications',{
          method:'POST',
          headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
          body:JSON.stringify({
            action:'submit',application_id:applicationId,expected_version:2
          })
        });
        return {status:r.status,body:await r.json()};
      }`,
      foreignAppId)
    assert.equal(duplicateSubmitRes.status, 200)
    assert.equal(duplicateSubmitRes.body.status, "submitted")
    const app1Row=(await q("select duplicate_review_required from da_organization_application where id=$1",[b22TaxAppId]))[0]
    const app2Row=(await q("select duplicate_review_required from da_organization_application where id=$1",[foreignAppId]))[0]
    assert.equal(app1Row.duplicate_review_required, false)
    assert.equal(app2Row.duplicate_review_required, true, "Duplicate VKN must set confidential review flag in PG16")
    await foreignDraftChrome.click("#organization-draft-refresh")
    await foreignDraftChrome.wait("Array.from(document.querySelectorAll('#organization-draft-list p')).some(p=>p.textContent.includes('Foreign Duplicate Company')&&p.textContent.includes('Başvuru gönderildi'))")
    const submittedCanWithdraw=await foreignDraftChrome.eval("Array.from(document.querySelectorAll('#organization-draft-list p')).some(p=>p.textContent.includes('Foreign Duplicate Company')&&Array.from(p.querySelectorAll('button')).some(b=>b.textContent==='Başvuruyu geri çek'))")
    assert.equal(submittedCanWithdraw,true,"A submitted application must offer applicant cancellation before staff approval")

    // 10. Platform Staff Review Journey:
    // The two applicants cannot review their own applications. Register a
    // genuinely independent THIRD Person via real HTTPS, native Customer
    // registration and strong MFA. A grant alone never creates a valid session.
    const reviewChrome=new B06Chrome(host,"B");browsers.push(reviewChrome)
    await reviewChrome.start(crt)
    const reviewEmail="b22-review-"+randomBytes(10).toString("hex")+"@example.invalid"
    const reviewPassword="Task-Strong-"+randomBytes(18).toString("hex")
    await reviewChrome.click("#register-details summary")
    await reviewChrome.input("#register input[name=first_name]","Synthetic")
    await reviewChrome.input("#register input[name=last_name]","Reviewer")
    await reviewChrome.input("#register input[name=email]",reviewEmail)
    await reviewChrome.input("#register input[name=mobile_phone]","+905551234579")
    await reviewChrome.input("#register input[name=password]",reviewPassword)
    await reviewChrome.click("#register button")
    await reviewChrome.wait("document.getElementById('status').textContent.includes('Kişi hesabı kaydedildi')")
    await reviewChrome.input("#login input[name=email]",reviewEmail)
    await reviewChrome.input("#login input[name=password]",reviewPassword)
    await reviewChrome.click("#login button")
    await reviewChrome.wait("!document.getElementById('workspace').hidden || !document.getElementById('mfa-enrollment').hidden")
    if(await reviewChrome.eval("!document.getElementById('mfa-enrollment').hidden")){
      await reviewChrome.input("#mfa-enroll-start input[name=email]",reviewEmail)
      await reviewChrome.input("#mfa-enroll-start input[name=password]",reviewPassword)
      await reviewChrome.click("#mfa-enroll-start button")
      await reviewChrome.wait("!document.getElementById('mfa-enroll-verify').hidden&&document.getElementById('mfa-seed').value.length>0")
      const url=await reviewChrome.eval("document.getElementById('mfa-seed').value")
      const secret=url.startsWith("otpauth:")?new URL(url).searchParams.get("secret"):url
      assert.ok(secret)
      await reviewChrome.input("#mfa-enroll-verify input[name=code]",otp(secret!))
      await reviewChrome.click("#mfa-enroll-verify button")
    }
    await reviewChrome.wait("!document.getElementById('workspace').hidden")
    // Optional platform MFA can open a normal, non-strong Person session.
    // A reviewer must voluntarily complete real native TOTP enrollment before
    // the platform staff grant can authorize sensitive review work. Never
    // insert last_strong_auth_at directly or relax IdentitySessions.staff().
    const beforeStrong=await reviewChrome.token()
    assert.match(beforeStrong??"",/^[A-Za-z0-9_-]{43}$/)
    const [strongProof]=await q(`select last_strong_auth_at from da_browser_session
      where id=$1`,[createHash("sha256").update(beforeStrong!).digest("hex")])
    if(!strongProof?.last_strong_auth_at){
      // The workspace becomes visible BEFORE load() awaits refreshMfa().
      // Wait for the real authenticated MFA policy response; never make an
      // enrolment button visible when policy genuinely forbids it.
      const mfaPolicy=await reviewChrome.eval(`(async()=>{
        const r=await fetch('/personal/mfa');
        const body=r.status===200?await r.json():{};
        return {status:r.status,mode:body.platform?.platform_mode};
      })()`)
      assert.equal(mfaPolicy.status,200,"Native MFA policy must remain readable")
      assert.ok(["required","optional"].includes(mfaPolicy.mode),
        "Independent reviewer must not bypass a disabled platform MFA policy")
      await reviewChrome.wait(
        "!document.getElementById('workspace').hidden && !document.getElementById('mfa-person').hidden")
      assert.equal(await reviewChrome.eval(
        "!document.getElementById('mfa-enroll-launch').hidden"),true,
        "Reviewer requires an enabled, user-visible native MFA enrollment path")
      await reviewChrome.click("#mfa-enroll-launch")
      await reviewChrome.input("#mfa-enroll-start input[name=email]",reviewEmail)
      await reviewChrome.input("#mfa-enroll-start input[name=password]",reviewPassword)
      await reviewChrome.click("#mfa-enroll-start button")
      await reviewChrome.wait("!document.getElementById('mfa-enroll-verify').hidden&&document.getElementById('mfa-seed').value.length>0")
      const enrolled=await reviewChrome.eval("document.getElementById('mfa-seed').value")
      const enrolledSecret=enrolled.startsWith("otpauth:")
        ?new URL(enrolled).searchParams.get("secret"):enrolled
      assert.ok(enrolledSecret)
      await reviewChrome.input("#mfa-enroll-verify input[name=code]",otp(enrolledSecret!))
      await reviewChrome.click("#mfa-enroll-verify button")
      await reviewChrome.wait("!document.getElementById('workspace').hidden")
    }
    const reviewerRows=await q(`select b.person_id from da_login_binding b
      join public.customer c on c.id=b.actor_id
      where b.actor_type='customer' and c.email=$1
        and b.revoked_at is null and b.verified_at is not null`,[reviewEmail])
    assert.equal(reviewerRows.length,1)
    const reviewerPersonId=reviewerRows[0].person_id
    const foreignPersonId=(await q("select applicant_person_id from da_organization_application where id=$1",[foreignAppId]))[0].applicant_person_id
    assert.notEqual(reviewerPersonId,signupPerson,"Review staff cannot be the first applicant")
    assert.notEqual(reviewerPersonId,foreignPersonId,"Review staff cannot be the second applicant")
    const reviewerToken=await reviewChrome.token()
    assert.match(reviewerToken??"",/^[A-Za-z0-9_-]{43}$/)
    const reviewerProof=await q(`select s.status,s.last_strong_auth_at,s.mfa_purpose,
       statement_timestamp()<s.last_strong_auth_at+p.recent_auth_seconds*interval '1 second' as recent
       from da_browser_session s cross join da_session_policy p
       where s.id=$1 and p.id='current'`,
       [createHash("sha256").update(reviewerToken!).digest("hex")])
    assert.equal(reviewerProof.length,1)
    assert.equal(reviewerProof[0].status,"active")
    assert.ok(reviewerProof[0].last_strong_auth_at,"Real reviewer strong login required")
    assert.equal(reviewerProof[0].recent,true,"Reviewer must have fresh MFA")
    const reviewGrantId="da_staff_review_"+randomBytes(8).toString("hex")
    await q(`insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason)
      values($1,$2,'organization.review','platform',$2,'B22 independent real reviewer acceptance fixture')`,
      [reviewGrantId,reviewerPersonId])

    try {
      const reviewQueue = await reviewChrome.eval(`(async()=>{`+
        `const r=await fetch('/personal/organization-applications?action=review_queue');`+
        `return {status:r.status,body:await r.json()};`+
      `})()`)
      assert.equal(reviewQueue.status, 200)
      assert.ok(Array.isArray(reviewQueue.body.applications))
      const qApp1 = reviewQueue.body.applications.find((a:any)=>a.id===b22TaxAppId)
      const qApp2 = reviewQueue.body.applications.find((a:any)=>a.id===foreignAppId)
      assert.ok(qApp1, "Queue must contain submitted app 1")
      assert.ok(qApp2, "Queue must contain submitted app 2")
      assert.equal(qApp1.duplicate_review_required, false)
      assert.equal(qApp2.duplicate_review_required, true)

      // A real privileged queue response arrives after privacy concealment.
      // The refresh button starts hidden until the new staff grant is observed.
      // Trigger its actual handler once; subsequent clicks use the visible UI.
      await reviewChrome.eval("document.getElementById('organization-review-refresh').onclick()")
      await reviewChrome.wait("document.getElementById('organization-review-list').textContent.includes('B22 Vergi Levhası Test Şirketi')")
      const delayedReviewReady=await reviewChrome.eval(`(()=>{
        const original=window.fetch;
        window.__b22ReviewLag={waiting:false,release:null,original};
        window.fetch=(...args)=>{
          const gate=window.__b22ReviewLag;
          if(gate && !gate.waiting && String(args[0]).includes('organization-applications?action=review_queue')){
            gate.waiting=true;
            return original(...args).then(response=>new Promise(resolve=>{gate.release=()=>resolve(response)}));
          }
          return original(...args);
        };
        return true;
      })()`)
      assert.equal(delayedReviewReady,true)
      try{
        await reviewChrome.click("#organization-review-refresh")
        await reviewChrome.wait("!!window.__b22ReviewLag?.release")
        await reviewChrome.eval("window.dispatchEvent(new Event('pagehide'))")
        assert.equal(await reviewChrome.eval("document.getElementById('organization-review-list').textContent"),"")
        assert.equal(await reviewChrome.eval("document.getElementById('organization-review-panel').hidden"),true)
        await reviewChrome.eval("window.__b22ReviewLag.release()")
        await reviewChrome.eval("(async()=>{await new Promise(r=>setTimeout(r,250));return true})()")
        assert.equal(await reviewChrome.eval("document.getElementById('organization-review-list').textContent"),"",
          "Delayed former privileged review response must not restore private tax identifiers")
        assert.equal(await reviewChrome.eval("document.getElementById('organization-review-panel').hidden"),true)
      }finally{
        await reviewChrome.eval("(()=>{if(window.__b22ReviewLag){window.fetch=window.__b22ReviewLag.original;delete window.__b22ReviewLag}return true})()")
      }
      await reviewChrome.send("Page.reload",{ignoreCache:true})
      await reviewChrome.wait("!document.getElementById('workspace').hidden")
      process.stdout.write("PASS B22 Chrome: delayed reviewer response after pagehide cannot repopulate private application DOM\n")

      // The submitted PDF is private but has no genuine server-side malware
      // verdict or proven safe staff viewer. The staff route must fail closed.
      const staffDocDownload = await reviewChrome.eval(`(async()=>{`+
        `const r=await fetch('/personal/organization-applications?action=document&application_id='+encodeURIComponent(${JSON.stringify(b22TaxAppId)}));`+
        `return {status:r.status,contentType:r.headers.get('content-type'),cache:r.headers.get('cache-control')};`+
      `})()`)
      assert.equal(staffDocDownload.status,503,"Reviewer must not download unscanned original document")
      assert.equal(staffDocDownload.cache,"no-store")
      assert.ok(!['application/pdf','image/png','image/jpeg'].includes(staffDocDownload.contentType),
        "Unscanned original media must not reach staff HTTP response")

      // Preview must be the server-generated PNG. Positive CI mode uses an
      // official free ClamAV database and real OS namespace isolation;
      // without either, the same real HTTP request MUST fail closed.
      const scanEnabled=process.env.DOGRUADRES_B22_SAFE_REVIEW_TEST==="true"
      const reviewPreview = await reviewChrome.eval(`(async()=>{
        const r=await fetch('/personal/organization-applications?action=review_preview&application_id='+
          encodeURIComponent(${JSON.stringify(b22TaxAppId)}));
        const raw=new Uint8Array(await r.arrayBuffer());
        return {status:r.status,type:r.headers.get('content-type'),
          cache:r.headers.get('cache-control'),length:raw.length,
          header:Array.from(raw.slice(0,8))};
      })()`)
      assert.equal(reviewPreview.cache,"no-store")
      if(scanEnabled){
        assert.equal(reviewPreview.status,200,"Signed local ClamAV and sandbox must provide safe PNG")
        assert.equal(reviewPreview.type,"image/png")
        assert.ok(reviewPreview.length>64&&reviewPreview.length<=4*1024*1024)
        assert.deepEqual(reviewPreview.header,[137,80,78,71,13,10,26,10])
      const evidenceAfterReview=await q(
        "select scanned_clamav_identity,preview_renderer_revision,safe_preview_sha256,octet_length(safe_preview_png)::int as png_bytes,scanned_at::text as scanned_at from da_organization_application_document where application_id=$1 and is_current=true",
        [b22TaxAppId])
      assert.deepEqual(evidenceAfterReview,initialScanEvidence,
        "Matching ClamAV identity and exact immutable file must reuse the first scan/PNG without a cache rewrite")
      process.stdout.write("PASS B22 Chrome/HTTP/PG16: upload scans once and same-signature private preview remains unchanged\n")
      }else{
        assert.equal(reviewPreview.status,503)
        assert.ok(!reviewPreview.type?.startsWith("image/"),
          "Staff must never receive a fake or raw preview on unavailable scan")
      }
      await reviewChrome.eval("document.getElementById('organization-review-refresh').onclick()")
      await reviewChrome.wait("document.getElementById('organization-review-list').textContent.includes('B22 Vergi Levhası Test Şirketi')")
      const openUnsafePreview = await reviewChrome.eval(`(()=>{
        const row=Array.from(document.querySelectorAll('#organization-review-list p'))
          .find(p=>p.textContent.includes('B22 Vergi Levhası Test Şirketi'));
        const button=Array.from(row?.querySelectorAll('button')||[])
          .find(b=>b.textContent==='Belgeyi Güvenli Önizle');
        if(!button)throw Error('Missing reviewed document preview action');
        button.click();return row.textContent.includes('ClamAV güncelliği kontrol ediliyor');
      })()`)
      assert.equal(openUnsafePreview,true)
      // Distinguish a real fail-closed image error from an HTTP/DOM stall.
      // A failed image must not masquerade as a generic 20-second timeout.
      const previewStatusExpr=scanEnabled?
        "document.getElementById('organization-review-list').textContent.includes('Güvenli görselin tamamı gösterildi') || document.getElementById('organization-review-list').textContent.includes('Tarama veya güvenli önizleme kullanılamıyor')":
        "document.getElementById('organization-review-list').textContent.includes('Tarama veya güvenli önizleme kullanılamıyor')"
      try{
        await reviewChrome.wait(previewStatusExpr)
      }catch(error){
        const snapshot=await reviewChrome.eval(`(()=>{
          const row=Array.from(document.querySelectorAll('#organization-review-list p'))
            .find(p=>p.textContent.includes('B22 Vergi Levhası Test Şirketi'));
          const preview=Array.from(row?.querySelectorAll('button')||[])
            .find(b=>b.textContent==='Belgeyi Güvenli Önizle');
          const approval=Array.from(row?.querySelectorAll('button')||[])
            .find(b=>b.textContent==='İşletmeyi Onayla');
          const image=row?.querySelector('img');
          return {rowPresent:!!row,previewDisabled:!!preview?.disabled,
            approvalReady:!!approval&&!approval.hidden&&!approval.disabled,
            imageComplete:!!image?.complete,imageWidth:image?.naturalWidth||0,
            note:row?.textContent?.includes('hazırlanıyor')?'loading':
              row?.textContent?.includes('kullanılamıyor')?'unavailable':
              row?.textContent?.includes('tamamı gösterildi')?'ready':'other'};
        })()`)
        throw Error("B22 preview browser state not settled: "+JSON.stringify(snapshot)+"; "+String(error))
      }
      const approvalState=await reviewChrome.eval(`(()=>{
        const row=Array.from(document.querySelectorAll('#organization-review-list p'))
          .find(p=>p.textContent.includes('B22 Vergi Levhası Test Şirketi'));
        const button=Array.from(row?.querySelectorAll('button')||[])
          .find(b=>b.textContent==='İşletmeyi Onayla');
        const image=row?.querySelector('img');
        const label=row?.textContent||'';
        return {ready:!!button&&!button.hidden&&!button.disabled,
          rasterVisible:!!image&&!image.hidden&&image.naturalWidth>0,
          scanComplete:label.includes('Virüs taramasından geçirilmiştir'),
          scanUnverified:label.includes('Virüs taraması doğrulanamadı')};
      })()`)
      assert.equal(approvalState.ready,scanEnabled,
        "Only a genuinely scanned and rendered preview may unlock review UI; preview must fail closed when scan or browser decode fails")
      assert.equal(approvalState.rasterVisible,scanEnabled)
      assert.equal(approvalState.scanComplete,scanEnabled,
        "Only a real successful safe preview may display completed antivirus scan")
      assert.equal(approvalState.scanUnverified,!scanEnabled,
        "Unavailable scanner or preview must display unsuccessful verification")
      if(scanEnabled)process.stdout.write("PASS B22 Chrome/HTTP/PG16: scanned PNG preview loaded and reviewer approval UI gated\n")
      if(scanEnabled){
        // Both pages must reach the actual browser from the protected, scanned
        // HTTP endpoint. Approval UI stays disabled until the reviewer can
        // scroll through the complete tall PNG, not just its first page.
        await reviewChrome.eval("document.getElementById('organization-review-refresh').onclick()");
        await reviewChrome.wait("Array.from(document.querySelectorAll('#organization-review-list p')).some(p=>p.textContent.includes('Foreign Duplicate Company'))");
        await reviewChrome.eval("(()=>{const row=Array.from(document.querySelectorAll('#organization-review-list p')).find(p=>p.textContent.includes('Foreign Duplicate Company'));const button=Array.from(row?.querySelectorAll('button')||[]).find(b=>b.textContent==='Belgeyi Güvenli Önizle');if(!button)throw Error('Missing private review button');button.click();return true})()");
        await reviewChrome.wait("Array.from(document.querySelectorAll('#organization-review-list p')).some(p=>p.textContent.includes('Foreign Duplicate Company')&&p.querySelector('img')?.naturalHeight>=1700)");
        const multiPageBefore=await reviewChrome.eval("(()=>{const row=Array.from(document.querySelectorAll('#organization-review-list p')).find(p=>p.textContent.includes('Foreign Duplicate Company'));const image=row?.querySelector('img');const box=row?.querySelector('[role=region]');const approval=Array.from(row?.querySelectorAll('button')||[]).find(b=>b.textContent==='İşletmeyi Onayla');return {height:image?.naturalHeight||0,scrollable:!!box&&box.scrollHeight>box.clientHeight+16,ready:!!approval&&!approval.hidden&&!approval.disabled};})()");
        assert.ok(multiPageBefore.height>=1700,"The browser must receive every PDF page");
        assert.equal(multiPageBefore.scrollable,true,"Multi-page preview must remain legible and scrollable");
        assert.equal(multiPageBefore.ready,false,"Approval must stay disabled before reaching the second page");
        await reviewChrome.eval("(()=>{const row=Array.from(document.querySelectorAll('#organization-review-list p')).find(p=>p.textContent.includes('Foreign Duplicate Company'));const box=row?.querySelector('[role=region]');if(!box)throw Error('Missing accessible page scroll');box.scrollTop=box.scrollHeight;return true})()");
        await reviewChrome.wait("Array.from(document.querySelectorAll('#organization-review-list p')).some(p=>p.textContent.includes('Foreign Duplicate Company')&&Array.from(p.querySelectorAll('button')).some(b=>b.textContent==='İşletmeyi Onayla'&&!b.hidden&&!b.disabled))");
        process.stdout.write("PASS B22 Chrome/HTTP/PG16: full two-page PDF preview, approval disabled until final page scrolled\n");

        // The daemon stays genuine. Only this disposable task-only PostgreSQL
        // row simulates evidence previously recorded under an old signature.
        const signedPreviewUrl='/personal/organization-applications?action=review_preview&application_id='+encodeURIComponent(foreignAppId);
        const fetchSignedPreview=()=>reviewChrome.eval(
          "(async()=>{const r=await fetch("+JSON.stringify(signedPreviewUrl)+");return {status:r.status,type:r.headers.get('content-type')}})()");
        const beforeRenewal=(await q(
          "select scanned_clamav_identity,safe_preview_sha256,scanned_at::text scanned_at from da_organization_application_document where application_id=$1 and is_current=true",
          [foreignAppId]))[0];
        assert.ok(beforeRenewal?.scanned_clamav_identity);
        const identityParts=beforeRenewal.scanned_clamav_identity.split("/");
        assert.equal(identityParts.length,3);
        assert.ok(Number(identityParts[1])>1);
        const staleIdentity=identityParts[0]+"/"+(Number(identityParts[1])-1)+"/"+identityParts[2];
        await q("update da_organization_application_document set scanned_clamav_identity=$1 where application_id=$2 and is_current=true",
          [staleIdentity,foreignAppId]);
        const freshPreview=await fetchSignedPreview();
        assert.equal(freshPreview.status,200,"Signature change requires successful real ClamAV renewal");
        assert.equal(freshPreview.type,"image/png");
        const afterRenewal=(await q(
          "select scanned_clamav_identity,safe_preview_sha256,scanned_at::text scanned_at from da_organization_application_document where application_id=$1 and is_current=true",
          [foreignAppId]))[0];
        assert.equal(afterRenewal.scanned_clamav_identity,beforeRenewal.scanned_clamav_identity);
        assert.equal(afterRenewal.safe_preview_sha256,beforeRenewal.safe_preview_sha256,
          "Signature-only renewal must preserve identical PNG rather than re-rendering");
        assert.notEqual(afterRenewal.scanned_at,beforeRenewal.scanned_at);
        assert.equal((await fetchSignedPreview()).status,200);
        const afterSecond=(await q(
          "select scanned_clamav_identity,safe_preview_sha256,scanned_at::text scanned_at from da_organization_application_document where application_id=$1 and is_current=true",
          [foreignAppId]))[0];
        assert.deepEqual(afterSecond,afterRenewal,
          "Repeated same-signature review must not rewrite scan evidence");

        // A damaged PNG hash cannot authorize a cached image; regenerate
        // under the real sandbox and scanner (no disabled safety checks).
        await q("update da_organization_application_document set safe_preview_sha256=$1 where application_id=$2 and is_current=true",
          ["0".repeat(64),foreignAppId]);
        const repairedPreview=await fetchSignedPreview();
        assert.equal(repairedPreview.status,200,"Damaged cached PNG must be regenerated safely");
        assert.equal(repairedPreview.type,"image/png");
        const afterRepair=(await q(
          "select scanned_clamav_identity,safe_preview_sha256,scanned_at::text scanned_at from da_organization_application_document where application_id=$1 and is_current=true",
          [foreignAppId]))[0];
        assert.equal(afterRepair.scanned_clamav_identity,beforeRenewal.scanned_clamav_identity);
        assert.match(afterRepair.safe_preview_sha256,/^[0-9a-f]{64}$/);
        assert.notEqual(afterRepair.safe_preview_sha256,"0".repeat(64));
        assert.notEqual(afterRepair.scanned_at,afterSecond.scanned_at);
        process.stdout.write("PASS B22 Chrome/HTTP/PG16: changed signature triggers genuine re-scan; unchanged reuse; damaged PNG regenerated\n");

      }

      process.stdout.write("PASS B22 Chrome/HTTP/PG16: staff unscanned document denied, applicant original retained, foreign denied\n")

      const correctionRes = await reviewChrome.eval(`(async()=>{`+
        `const s=await (await fetch('/personal/session')).json();`+
        `const r=await fetch('/personal/organization-applications',{`+
          `method:'POST',`+
          `headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},`+
          `body:JSON.stringify({`+
            `action:'review_decision',`+
            `application_id:${JSON.stringify(foreignAppId)},`+
            `expected_version:3,`+
            `decision:'request_correction',`+
            `notes:'Lütfen vergi levhanızı güncel tarihli olarak tekrar yükleyiniz.'`+
          `})`+
        `});`+
        `return {status:r.status,body:await r.json()};`+
      `})()`)
      assert.equal(correctionRes.status, 200)
      assert.equal(correctionRes.body.status, "correction_requested")
      const correctionDocumentDenied=await reviewChrome.eval(`(async()=>{
        const r=await fetch('/personal/organization-applications?action=document&application_id='+encodeURIComponent(${JSON.stringify(foreignAppId)}));return r.status
      })()`)
      assert.equal(correctionDocumentDenied,403,"Review staff may not read correction-requested private documents")

      assert.equal((await q("select status,review_notes from da_organization_application where id=$1",[foreignAppId]))[0].status, "correction_requested")
      await foreignDraftChrome.click("#organization-draft-refresh")
      await foreignDraftChrome.wait("Array.from(document.querySelectorAll('#organization-draft-list p')).some(p=>p.textContent.includes('Foreign Duplicate Company')&&p.textContent.includes('Düzeltme istendi'))")
      await foreignDraftChrome.eval("(()=>{const row=Array.from(document.querySelectorAll('#organization-draft-list p')).find(p=>p.textContent.includes('Foreign Duplicate Company'));const button=Array.from(row?.querySelectorAll('button')||[]).find(b=>b.textContent==='Düzelt ve yeniden gönder');if(!button)throw Error('Missing correction selector');button.click();return true})()")
      await foreignDraftChrome.wait("!document.getElementById('organization-draft-withdraw').hidden")

      // Requesting correction cannot be bypassed by replaying the unchanged
      // submission. The genuine applicant must use the visible upload button.
      assert.equal(await foreignDraftChrome.eval("document.getElementById('organization-application-submit').hidden"),true)
      const unchangedSubmit=await foreignDraftChrome.eval(`(async()=>{
        const csrf=(await(await fetch('/personal/session')).json()).csrf_token;
        const r=await fetch('/personal/organization-applications',{method:'POST',
          headers:{'content-type':'application/json','x-csrf-token':csrf},
          body:JSON.stringify({action:'submit',application_id:${JSON.stringify(foreignAppId)},expected_version:4})});
        return r.status;
      })()`)
      assert.equal(unchangedSubmit,409,"Correction must not permit unchanged resubmission")

      const noChangeSave=await foreignDraftChrome.eval(`(async()=>{
        const form=document.getElementById('organization-draft-form');
        const selected=Array.from(form.querySelectorAll('input[name=declared_activities]:checked'),x=>x.value);
        const body={...Object.fromEntries(new FormData(form)),
          declared_activities:selected,primary_activity:form.elements.primary_activity.value,
          application_id:${JSON.stringify(foreignAppId)},expected_version:4};
        const csrf=(await(await fetch('/personal/session')).json()).csrf_token;
        const r=await fetch('/personal/organization-applications',{method:'POST',
          headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
        return r.status;
      })()`)
      assert.equal(noChangeSave,409,"Unmodified correction form must not reopen application")
      assert.deepEqual(await q("select status,version from da_organization_application where id=$1",[foreignAppId]),
        [{status:"correction_requested",version:4}])

      const priorDraftAuditCount=Number((await q(
        "select count(*)::int n from da_audit_event where target_id=$1 and action='organization.application_draft_saved'",
        [foreignAppId]))[0].n)
      const reorderedOnlySave=await foreignDraftChrome.eval(`(async()=>{
        const form=document.getElementById('organization-draft-form');
        const selected=Array.from(form.querySelectorAll('input[name=declared_activities]:checked'),x=>x.value).reverse();
        const body={...Object.fromEntries(new FormData(form)),
          declared_activities:selected,primary_activity:form.elements.primary_activity.value,
          application_id:${JSON.stringify(foreignAppId)},expected_version:4};
        const csrf=(await(await fetch('/personal/session')).json()).csrf_token;
        const r=await fetch('/personal/organization-applications',{method:'POST',
          headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
        return r.status;
      })()`)
      assert.equal(reorderedOnlySave,409,"Reordering declared activities must not count as a correction")
      assert.equal(Number((await q(
        "select count(*)::int n from da_audit_event where target_id=$1 and action='organization.application_draft_saved'",
        [foreignAppId]))[0].n),priorDraftAuditCount,"Order-only retry must not add audit")
      assert.deepEqual(await q("select status,version from da_organization_application where id=$1",[foreignAppId]),
        [{status:"correction_requested",version:4}])
      const priorRevisions=await q(
        "select version,storage_key,original_sha256,is_current from da_organization_application_document where application_id=$1 order by version",
        [foreignAppId])
      assert.equal(priorRevisions.length,1)
      // Replace the former EOF-shaped PDF stub: upload now requires a genuine
      // ClamAV scan AND sandbox rendering before marking a correction saved.
      // Change exactly eight metadata bytes so PDF xref offsets and both pages
      // remain valid, while the immutable original SHA-256 really changes.
      const correctedPdf=Buffer.from(twoPagePdfBase64,"base64")
      const previousTitle=Buffer.from("/Title (untitled)","ascii")
      const correctedTitle=Buffer.from("/Title (changed!)","ascii")
      assert.equal(previousTitle.length,correctedTitle.length)
      const titleOffset=correctedPdf.indexOf(previousTitle)
      assert.ok(titleOffset>0,"Expected known two-page PDF metadata")
      correctedTitle.copy(correctedPdf,titleOffset)
      assert.notEqual(createHash("sha256").update(correctedPdf).digest("hex"),
        createHash("sha256").update(Buffer.from(twoPagePdfBase64,"base64")).digest("hex"))
      const correctionSelection=await foreignDraftChrome.eval(`(()=>{
        const raw=atob(${JSON.stringify(correctedPdf.toString("base64"))});
        const file=new File([Uint8Array.from(raw,c=>c.charCodeAt(0))],
          "duzeltilmis-vergi-levhasi.pdf",{type:"application/pdf"});
        const input=document.getElementById('organization-document-file');
        const transfer=new DataTransfer();transfer.items.add(file);
        input.files=transfer.files;
        input.dispatchEvent(new Event('change',{bubbles:true}));
        return {status:document.getElementById('organization-document-status').textContent,
          submitHidden:document.getElementById('organization-application-submit').hidden};
      })()`)
      assert.ok(correctionSelection.status.includes("Dosya seçildi:"))
      assert.ok(correctionSelection.status.includes("Henüz virüs taramasından geçirilmedi"),
        "Selecting a file must not claim successful antivirus scanning")
      assert.equal(correctionSelection.submitHidden,true)
      assert.equal(Number((await q("select count(*)::int n from da_organization_application_document where application_id=$1",[foreignAppId]))[0].n),1,
        "Selecting a file must not upload it")
      await foreignDraftChrome.click("#organization-document-upload")
      try {
        await foreignDraftChrome.wait("document.getElementById('organization-document-status').textContent.includes('başarıyla yüklendi') || document.getElementById('organization-document-status').textContent.includes('başarısız oldu')")
      }catch(error){
        const state=await foreignDraftChrome.eval("document.getElementById('organization-document-status').textContent")
        throw Error("B22 correction upload remained unresolved: "+state+"; "+String(error))
      }
      assert.equal(await foreignDraftChrome.eval("document.getElementById('organization-document-status').textContent.includes('başarıyla yüklendi')"),true,
        "Updated real PDF must pass ClamAV and isolated preview during corrected upload")
      assert.equal(await foreignDraftChrome.eval("document.getElementById('organization-document-status').textContent.includes('virüs taramasından geçirildi')"),true,
        "Only a successfully scanned and persistently stored upload may claim clean ClamAV status")
      await foreignDraftChrome.wait("!document.getElementById('organization-application-submit').hidden && !document.getElementById('organization-application-submit').disabled")
      assert.deepEqual(await q("select status,version from da_organization_application where id=$1",[foreignAppId]),
        [{status:"draft",version:5}])
      const revised=await q(
        "select version,storage_key,original_sha256,is_current from da_organization_application_document where application_id=$1 order by version",
        [foreignAppId])
      assert.equal(revised.length,2)
      assert.equal(revised[0].storage_key,priorRevisions[0].storage_key)
      assert.equal(revised[0].original_sha256,priorRevisions[0].original_sha256)
      assert.equal(revised[0].is_current,false)
      assert.equal(revised[1].version,2)
      assert.equal(revised[1].is_current,true)
      assert.equal(revised[1].original_sha256,createHash("sha256").update(correctedPdf).digest("hex"))
      for(const doc of revised)assert.ok(readFileSync(join(taxDir,doc.storage_key)).length>8)
      // Observe only the synthetic submission's HTTP status. The existing
      // real UI button remains the actor; never replace it with a direct POST.
      await foreignDraftChrome.eval(`(()=>{
        const original=window.fetch,trace={original,seen:false,http:null};
        window.__b22SubmitTrace=trace;
        window.fetch=(...args)=>{
          const opts=args[1]||{};
          if(opts.method==='POST'&&String(opts.body||'').includes('"action":"submit"')){
            trace.seen=true;
            return original(...args).then(r=>{trace.http=r.status;return r;},
              e=>{trace.http=-1;throw e;});
          }
          return original(...args);
        };
        return true;
      })()`)
      try{
        await foreignDraftChrome.click("#organization-application-submit")
        await foreignDraftChrome.wait("document.getElementById('organization-draft-status').textContent.includes('Başvuru platform incelemesine başarıyla gönderildi')")
      }catch(error){
        const actual=await q("select status,version from da_organization_application where id=$1",[foreignAppId])
        const browser=await foreignDraftChrome.eval(`(()=>{
          const note=document.getElementById('organization-draft-status')?.textContent||'';
          const button=document.getElementById('organization-application-submit');
          return {requestSeen:!!window.__b22SubmitTrace?.seen,
            httpStatus:window.__b22SubmitTrace?.http??null,
            uiState:note.includes('Başvuru sonucu belirsiz')?'uncertain':
              note.includes('Taslak değişmiş')?'conflict':
              note.includes('Başvuru gönderilemedi')?'failed':
              note.includes('Başvuru platform incelemesine başarıyla gönderildi')?'success':'other',
            buttonDisabled:!!button?.disabled};
        })()`)
        throw Error("B22 real corrected resubmission did not confirm: "+
          JSON.stringify({applicationState:actual,browser})+"; "+String(error))
      }finally{
        await foreignDraftChrome.eval(`(()=>{
          const t=window.__b22SubmitTrace;
          if(t){window.fetch=t.original;delete window.__b22SubmitTrace;}
          return true;
        })()`)
      }
      assert.deepEqual(await q("select status,version from da_organization_application where id=$1",[foreignAppId]),
        [{status:"submitted",version:6}])
      // Withdraw the resubmitted application through its actual submitted-row
      // action; document versions must remain after the withdrawal.
      await foreignDraftChrome.wait("Array.from(document.querySelectorAll('#organization-draft-list p')).some(p=>p.textContent.includes('Foreign Duplicate Company')&&p.textContent.includes('Başvuru gönderildi'))")
      await foreignDraftChrome.eval(`(()=>{
        const row=Array.from(document.querySelectorAll('#organization-draft-list p'))
          .find(p=>p.textContent.includes('Foreign Duplicate Company')&&p.textContent.includes('Başvuru gönderildi'));
        const button=Array.from(row?.querySelectorAll('button')||[])
          .find(b=>b.textContent==='Başvuruyu geri çek');
        if(!button)throw Error('Missing submitted withdrawal action');
        button.click();return true;
      })()`)

      await foreignDraftChrome.wait("document.getElementById('organization-draft-status').textContent.includes('geri çekildi')")
      const withdrawn=await q("select status,version from da_organization_application where id=$1",[foreignAppId])
      assert.deepEqual(withdrawn,[{status:"withdrawn",version:7}])
      assert.equal(Number((await q("select count(*)::int n from da_organization_application_document where application_id=$1",[foreignAppId]))[0].n),2,"Withdraw must retain both private tax certificate revisions")
      const withdrawOutbox=await q("select x.id from da_audit_event a join da_security_outbox x on x.audit_event_id=a.id where a.target_id=$1 and a.action='organization.application_withdrawn'",[foreignAppId])
      assert.equal(withdrawOutbox.length,1,"Withdraw requires one durable outboxed audit")
      // CodeQL #25 (original line 7503): use CDP value arguments rather than
      // building executable JavaScript from the withdrawn application ID.
      const deniedAfterWithdraw=await reviewChrome.callFunction(
        `async function(applicationId){
          const s=await (await fetch('/personal/session')).json();
          const r=await fetch('/personal/organization-applications',{
            method:'POST',
            headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
            body:JSON.stringify({
              action:'review_decision',application_id:applicationId,
              expected_version:7,decision:'approve'
            })
          });
          return r.status;
        }`,
        foreignAppId)
      assert.equal(deniedAfterWithdraw,409,"Staff may not approve an applicant-withdrawn application")
      process.stdout.write("PASS B22 Chrome/HTTP/PG16: corrected tax certificate resubmission required new upload; two versions retained; withdrawn approval denied\n")

      const orgsCountBefore = Number((await q("select count(*)::int n from da_organization"))[0].n)
      const membsCountBefore = Number((await q("select count(*)::int n from da_organization_membership"))[0].n)

      // Two concurrent, identical authorized approval requests must not create
      // two Organizations or two protected Owners. The loser gets stale-version
      // 409; no direct DB write, user impersonation or privileged shortcut.
      const approveRace = await reviewChrome.eval(`(async()=>{`+
        `const s=await (await fetch('/personal/session')).json();`+
        `const body=JSON.stringify({action:'review_decision',`+
          `application_id:${JSON.stringify(b22TaxAppId)},`+
          `expected_version:3,decision:'approve',`+
          `notes:'Vergi levhası doğrulandı, kuruluş onaylandı.'});`+
        `const responses=await Promise.all([0,1].map(()=>fetch('/personal/organization-applications',{`+
          `method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},body})));`+
        `return Promise.all(responses.map(async r=>({status:r.status,body:await r.json()})));`+
      `})()`)
      assert.deepEqual(approveRace.map((r:any)=>r.status).sort((a:number,b:number)=>a-b),[200,409],
        "Two concurrent review approvals must have exactly one winner")
      const approveRes=approveRace.find((r:any)=>r.status===200)
      assert.ok(approveRes)
      assert.equal(approveRes.status, 200)
      assert.equal(approveRes.body.status, "approved")
      const approvedOrgId = approveRes.body.organization_id
      assert.ok(approvedOrgId, "Approval must return created organization_id")

      const orgRow = (await q("select id,name,tax_identifier,status from da_organization where id=$1",[approvedOrgId]))[0]
      assert.equal(orgRow.name, "B22 Vergi Levhası Test Şirketi")
      assert.equal(orgRow.tax_identifier, b22TaxId)
      assert.equal(orgRow.status, "active")

      const membRow = (await q("select person_id,role,status,protected_owner from da_organization_membership where organization_id=$1",[approvedOrgId]))[0]
      assert.equal(membRow.person_id, signupPerson)
      assert.equal(membRow.role, "owner")
      assert.equal(membRow.protected_owner, true)

      const reviewAudits = await q("select action,target_id from da_audit_event where target_id=$1 or target_id=$2", [b22TaxAppId, approvedOrgId])
      assert.ok(reviewAudits.some((a:any)=>a.action==="organization.application_approved"))
      assert.ok(reviewAudits.some((a:any)=>a.action==="organization.provisioned"))
      assert.equal(reviewAudits.filter((a:any)=>a.action==="organization.application_approved").length,1,
        "Only the winning approval can write the application approval audit")
      assert.equal(reviewAudits.filter((a:any)=>a.action==="organization.provisioned").length,1,
        "Only one canonical Organization provisioning audit")
      const persistedApprovalOutbox=await q(
        "select count(*)::int n from da_security_outbox x join da_audit_event a on a.id=x.audit_event_id where a.target_id=$1 and a.action='organization.application_approved'",
        [b22TaxAppId])
      assert.equal(Number(persistedApprovalOutbox[0].n),1,"One durable approval outbox event")
      const applicantOrganization=await signupChrome.eval("(async()=>{const r=await fetch('/personal/organizations');return {status:r.status,body:await r.json()}})()")
      assert.equal(applicantOrganization.status,200)
      assert.ok(applicantOrganization.body.organizations.some((o:any)=>o.id===approvedOrgId&&o.role==="owner"),
        "Applicant must see their newly approved Organization as Owner in actual browser session")
      const foreignOrganization=await foreignDraftChrome.eval("(async()=>{const r=await fetch('/personal/organizations');return {status:r.status,body:await r.json()}})()")
      assert.equal(foreignOrganization.status,200)
      assert.equal(foreignOrganization.body.organizations.some((o:any)=>o.id===approvedOrgId),false,
        "A foreign Person cannot see the newly approved Organization")

      assert.equal(Number((await q("select count(*)::int n from da_organization"))[0].n), orgsCountBefore + 1)

      assert.equal(Number((await q("select count(*)::int n from da_organization_membership"))[0].n), membsCountBefore + 1)

      // One canonical Person may apply for a SECOND, individual commercial
      // business without becoming a second Person or acquiring foreign rights.
      // Exercise two private PNG versions and actual review/owner provisioning.
      const individualAppId="daorgapp_"+randomBytes(16).toString("hex")
      const individualTaxId="12345678901" // isolated synthetic 11-digit identity
      const onePixelPng="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC"
      const individualFlow=await signupChrome.eval(`(async()=>{
        const csrf=(await (await fetch('/personal/session')).json()).csrf_token;
        const send=async body=>{
          const r=await fetch('/personal/organization-applications',{method:'POST',
            headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
          return {status:r.status,body:await r.json()};
        };
        const app=${JSON.stringify(individualAppId)};
        const created=await send({application_id:app,expected_version:0,
          business_kind:'individual_business',legal_name:'B22 Sahis Isletmesi',
          tax_identifier:${JSON.stringify(individualTaxId)},
          landline_phone:'+90 212 555 13 57',
          declared_activities:['service_repair'],primary_activity:'service_repair'});
        const upload1=await send({action:'upload_document',application_id:app,
          expected_version:1,filename:'levha.png',file_base64:${JSON.stringify(onePixelPng)}});
        const upload2=await send({action:'upload_document',application_id:app,
          expected_version:2,filename:'levha.png',file_base64:${JSON.stringify(onePixelPng)}});
        const submitted=await send({action:'submit',application_id:app,expected_version:3});
        return {created,upload1,upload2,submitted};
      })()`)
      assert.deepEqual(
        [individualFlow.created.status,individualFlow.upload1.status,
         individualFlow.upload2.status,individualFlow.submitted.status],
        [201,200,200,200],
        "Individual commercial business must save, replace private document and submit"
      )
      assert.equal(individualFlow.submitted.body.status,"submitted")
      assert.equal(individualFlow.submitted.body.version,4)
      assert.equal(individualFlow.upload2.body.document.mime_type,"image/png")
      assert.equal(individualFlow.upload2.body.document.version,2)
      const documentHistory=await q(
        "select version,is_current,storage_key from da_organization_application_document where application_id=$1 order by version",
        [individualAppId])
      assert.deepEqual(documentHistory.map((d:any)=>[Number(d.version),d.is_current]),
        [[1,false],[2,true]],"Both tax certificate revisions must remain durable")
      assert.notEqual(documentHistory[0].storage_key,documentHistory[1].storage_key)
      for(const doc of documentHistory)
        assert.ok(readFileSync(join(taxDir,doc.storage_key)).length>8,
          "Each historical private document file must still exist")
      const individualBefore=Number((await q("select count(*)::int n from da_organization"))[0].n)
      const individualDecision=await reviewChrome.eval(`(async()=>{
        const csrf=(await (await fetch('/personal/session')).json()).csrf_token;
        const r=await fetch('/personal/organization-applications',{method:'POST',
          headers:{'content-type':'application/json','x-csrf-token':csrf},
          body:JSON.stringify({action:'review_decision',
            application_id:${JSON.stringify(individualAppId)},expected_version:4,decision:'approve'})});
        return {status:r.status,body:await r.json()};
      })()`)
      assert.equal(individualDecision.status,200)
      assert.equal(individualDecision.body.status,"approved")
      const individualOrg=individualDecision.body.organization_id
      assert.ok(individualOrg&&individualOrg!==approvedOrgId)
      const individualOrgRow=await q("select name,tax_identifier,status from da_organization where id=$1",[individualOrg])
      assert.deepEqual(individualOrgRow,[{name:"B22 Sahis Isletmesi",tax_identifier:individualTaxId,status:"active"}])
      const individualOwner=await q(
        "select person_id,role,status,protected_owner from da_organization_membership where organization_id=$1",
        [individualOrg])
      assert.deepEqual(individualOwner,[{
        person_id:signupPerson,role:"owner",status:"active",protected_owner:true
      }])
      assert.equal(Number((await q("select count(*)::int n from da_organization"))[0].n),
        individualBefore+1,"Individual business must add exactly one Organization")
      const individualApprovalAudit=await q(
        "select a.id from da_audit_event a join da_security_outbox o on o.audit_event_id=a.id where a.target_id=$1 and a.action='organization.application_approved'",
        [individualAppId])
      assert.equal(individualApprovalAudit.length,1,"Independent individual approval must persist one audit/outbox")
      const applicantTwoOrganizations=await signupChrome.eval(
        "(async()=>{const r=await fetch('/personal/organizations');return {status:r.status,body:await r.json()}})()")
      assert.equal(applicantTwoOrganizations.status,200)
      for(const id of [approvedOrgId,individualOrg])
        assert.ok(applicantTwoOrganizations.body.organizations.some((o:any)=>o.id===id&&o.role==="owner"),
          "One Person must see both independently approved businesses")
      await verifyB22AuthorizedForeignHistoricalOrder({other:signupChrome,
        otherOrgId:approvedOrgId,ownerOrgId:organizations[1].id,
        orderGroupId:zeroOrderGroupId as string,
        otherCustomerId:registered[0].actor_id,
        ownerCustomerId:nativeCustomer.id,personId:signupPerson,
        buyerToken:primaryCustomerToken!,foundation,q})
      const foreignSecondOrganization=await foreignDraftChrome.eval(
        "(async()=>{const r=await fetch('/personal/organizations');return {status:r.status,body:await r.json()}})()")
      assert.equal(foreignSecondOrganization.status,200)
      assert.equal(foreignSecondOrganization.body.organizations.some((o:any)=>o.id===individualOrg),false)
      // Adding a second approved Organization changes the canonical scope.
      // The real UI intentionally conceals stale private views on the observer
      // mismatch; the Person must reload and pass live session/authority checks
      // before the newly approved application becomes visible again.
      await signupChrome.send("Page.reload",{ignoreCache:true})
      await signupChrome.wait("!document.getElementById('workspace').hidden")
      await signupChrome.click("#organization-draft-refresh")
      await signupChrome.wait(
        "Array.from(document.querySelectorAll('#organization-draft-list p')).some(p=>p.textContent.includes('B22 Sahis Isletmesi')&&p.textContent.includes('Başvuru onaylandı'))")

      // Approved drag-and-drop path: Chrome DOM drop event + actual visible
      // upload click, using the existing private HTTP/PG16 document service.
      // A drop alone must not write anything, and a withdrawn draft retains it.
      const dragApplicationId="daorgapp_"+randomBytes(16).toString("hex")
      const dragDraft=await signupChrome.eval(`(async()=>{
        const s=await (await fetch('/personal/session')).json();
        const r=await fetch('/personal/organization-applications',{
          method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
          body:JSON.stringify({
            application_id:${JSON.stringify(dragApplicationId)},expected_version:0,
            business_kind:'individual_business',legal_name:'B22 Drag Drop Fixture',
            landline_phone:'+90 212 555 23 89',
            declared_activities:['service_repair'],primary_activity:'service_repair'
          })
        });return {status:r.status,body:await r.json()};
      })()`)
      assert.equal(dragDraft.status,201)
      assert.equal(dragDraft.body.version,1)
      const dragOrgCount=Number((await q("select count(*)::int n from da_organization"))[0].n)
      await signupChrome.click("#organization-draft-refresh")
      await signupChrome.wait("Array.from(document.querySelectorAll('#organization-draft-list p')).some(p=>p.textContent.includes('B22 Drag Drop Fixture'))")
      assert.equal(await signupChrome.eval(`(()=>{
        const row=Array.from(document.querySelectorAll('#organization-draft-list p'))
          .find(p=>p.textContent.includes('B22 Drag Drop Fixture'));
        const edit=Array.from(row?.querySelectorAll('button')||[])
          .find(b=>b.textContent.includes('Taslağı düzenle'));
        if(!edit)return false;
        edit.click();return true;
      })()`),true)
      await signupChrome.wait("!document.getElementById('organization-document-section').hidden")
      const badDrop=await signupChrome.eval(`(()=>{
        const transfer=new DataTransfer();
        for(const name of ['one.png','two.png'])
          transfer.items.add(new File([new Uint8Array([1])],name,{type:'image/png'}));
        const zone=document.getElementById('organization-document-dropzone');
        const accepted=!zone.dispatchEvent(new DragEvent('drop',
          {bubbles:true,cancelable:true,dataTransfer:transfer}));
        return {accepted,message:document.getElementById('organization-document-status').textContent};
      })()`)
      assert.deepEqual(badDrop,{
        accepted:true,message:'Lütfen aynı anda yalnız bir belge bırakın.'
      },"Multiple dropped files must not be silently accepted")
      const goodDrop=await signupChrome.eval(`(()=>{
        const bytes=Uint8Array.from(atob(${JSON.stringify(onePixelPng)}),c=>c.charCodeAt(0));
        const transfer=new DataTransfer();
        transfer.items.add(new File([bytes],'levha.png',{type:'image/png'}));
        const zone=document.getElementById('organization-document-dropzone');
        const accepted=!zone.dispatchEvent(new DragEvent('drop',
          {bubbles:true,cancelable:true,dataTransfer:transfer}));
        return {accepted,selected:document.getElementById('organization-document-status')
          .textContent.includes('Dosya seçildi: levha.png.'),
          submitHidden:document.getElementById('organization-application-submit').hidden};
      })()`)
      assert.deepEqual(goodDrop,{accepted:true,selected:true,submitHidden:true})
      assert.equal(Number((await q(
        "select count(*)::int n from da_organization_application_document where application_id=$1",
        [dragApplicationId]))[0].n),0,"A dropped file alone must not start a document write")
      await signupChrome.click("#organization-document-upload")
      await signupChrome.wait("document.getElementById('organization-document-status').textContent.includes('başarıyla yüklendi')")
      const dragDocument=await q(`select version,mime_type,original_byte_length,original_sha256
        from da_organization_application_document where application_id=$1 and is_current=true`,
        [dragApplicationId])
      assert.equal(dragDocument.length,1)
      assert.equal(Number(dragDocument[0].version),1)
      assert.equal(dragDocument[0].mime_type,'image/png')
      assert.equal(Number(dragDocument[0].original_byte_length),Buffer.from(onePixelPng,'base64').length)
      assert.equal(dragDocument[0].original_sha256,
        createHash('sha256').update(Buffer.from(onePixelPng,'base64')).digest('hex'))
      const dragWithdrawal=await signupChrome.eval(`(async()=>{
        const s=await (await fetch('/personal/session')).json();
        const r=await fetch('/personal/organization-applications',{
          method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
          body:JSON.stringify({action:'withdraw',application_id:${JSON.stringify(dragApplicationId)},
            expected_version:2})
        });return {status:r.status,body:await r.json()};
      })()`)
      assert.equal(dragWithdrawal.status,200)
      assert.equal(dragWithdrawal.body.status,'withdrawn')
      assert.equal((await q("select status from da_organization_application where id=$1",
        [dragApplicationId]))[0].status,'withdrawn')
      assert.equal(Number((await q("select count(*)::int n from da_organization"))[0].n),dragOrgCount,
        "Uploading and withdrawing a private draft must not provision an Organization")
      process.stdout.write("PASS B22 Chrome/HTTP/PG16: PNG drag drop requires visible upload, private hash persisted, multi-drop denied, withdrawn without Organization\n")

      // Read-only verification against every persisted private revision.
      // No cleanup, no paths/keys/Person data in the audit output.
      const inventory=await inspectTaxCertificateSnapshot(pg,taxDir)
      assert.ok(inventory.referenced>=4,"Both original and replaced private document revisions must exist")
      assert.deepEqual(inventory,{
        referenced:inventory.referenced,intact:inventory.referenced,
        missingOrCorrupted:0,unreferenced:0,unexpectedEntries:0
      },"Read-only PostgreSQL transaction and private disk must reconcile all revisions")
      // Run the real Medusa CLI entry function with a fresh SQL client while
      // the B22 sentinel guarantees a task-owned disposable DB and private dir.
      await taxCertificateInventory({container} as any)

      // The review API already pages by 100. Verify the actual staff UI can
      // traverse page two on disposable PostgreSQL, not just fetch page one.
      const reviewOverflowIds=Array.from({length:101},()=>
        "daorgapp_"+randomBytes(16).toString("hex"))
      // Exactly one of 101 queue rows is created, scanned and submitted through
      // a real applicant browser. The other 100 are disposable pagination rows.
      const documentedReviewId=reviewOverflowIds[1]
      const paginationOnlyIds=reviewOverflowIds.filter(id=>id!==documentedReviewId)
      try{
        await q(`insert into da_organization_application
          (id,applicant_person_id,business_kind,legal_name,landline_phone,
           tax_identifier,declared_activities,primary_activity,status,version,updated_at)
          select x.id,$2,'legal_company',
            'B22 Pagination Fixture '||x.ordinality::text,$3,
            lpad(x.ordinality::text,10,'0'),jsonb_build_array('service_repair'),
            'service_repair','submitted',1,
            clock_timestamp()-(x.ordinality*interval '1 second')
          from unnest($1::text[]) with ordinality as x(id,ordinality)`,
          [paginationOnlyIds,signupPerson,draftLandline])
        const documentedCreate=await signupChrome.callFunction(
          `async function(id){
            const s=await (await fetch('/personal/session')).json();
            const r=await fetch('/personal/organization-applications',{
              method:'POST',
              headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
              body:JSON.stringify({application_id:id,expected_version:0,
                business_kind:'legal_company',legal_name:'B22 Pagination Document Fixture',
                landline_phone:'+90 212 555 00 00',tax_identifier:'1087654321',
                declared_activities:['service_repair'],primary_activity:'service_repair'})
            });
            return {status:r.status,body:await r.json()};
          }`,documentedReviewId)
        assert.equal(documentedCreate.status,201)
        assert.equal(documentedCreate.body.version,1)
        const documentedUpload=await signupChrome.callFunction(
          `async function(id,png){
            const s=await (await fetch('/personal/session')).json();
            const r=await fetch('/personal/organization-applications',{
              method:'POST',
              headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
              body:JSON.stringify({action:'upload_document',application_id:id,
                expected_version:1,filename:'pagination-certificate.png',file_base64:png})
            });
            return {status:r.status,body:await r.json()};
          }`,documentedReviewId,onePixelPng)
        assert.equal(documentedUpload.status,200)
        assert.equal(documentedUpload.body.version,2)
        await signupChrome.click('#organization-draft-refresh')
        await signupChrome.wait("Array.from(document.querySelectorAll('#organization-draft-list p')).some(p=>p.textContent.includes('B22 Pagination Document Fixture'))")
        await signupChrome.eval("(()=>{const row=Array.from(document.querySelectorAll('#organization-draft-list p')).find(p=>p.textContent.includes('B22 Pagination Document Fixture'));const button=Array.from(row?.querySelectorAll('button')||[]).find(b=>b.textContent==='Taslağı düzenle');if(!button)throw Error('Documented draft edit missing');button.click();return true})()")
        await signupChrome.click('#organization-draft-form input[name=legal_name]')
        await signupChrome.eval("document.querySelector('#organization-draft-form input[name=legal_name]').select()")
        await signupChrome.send('Input.insertText',{text:'B22 Pagination Edited Document'})
        await signupChrome.click('#organization-draft-form button[type=submit]')
        await signupChrome.wait("document.getElementById('organization-draft-status').textContent.includes('Yüklü vergi levhası korundu')")
        const persistedDocumentUi=await signupChrome.eval("({info:document.getElementById('organization-document-info').textContent,submitHidden:document.getElementById('organization-application-submit').hidden})")
        assert.match(persistedDocumentUi.info,/Yüklü vergi levhası: v1/)
        assert.equal(persistedDocumentUi.submitHidden,false,
          'Changing only application details must preserve submit with existing scanned document')
        assert.deepEqual(await q('select status,version from da_organization_application where id=$1',[documentedReviewId]),
          [{status:'draft',version:3}])
        assert.equal(Number((await q('select count(*)::int n from da_organization_application_document where application_id=$1',[documentedReviewId]))[0].n),1,
          'Details-only edit must not re-upload or replace the document')
        await signupChrome.click('#organization-application-submit')
        await signupChrome.wait("document.getElementById('organization-draft-status').textContent.includes('Başvuru platform incelemesine başarıyla gönderildi')")
        assert.deepEqual(await q('select status,version from da_organization_application where id=$1',[documentedReviewId]),
          [{status:'submitted',version:4}])
        process.stdout.write("PASS B22 Chrome/HTTP/PG16: details-only edit preserves scanned document, submit UI and one private revision\\n")
        const firstReviewPage=await reviewChrome.eval(`(async()=>{
          const r=await fetch('/personal/organization-applications?action=review_queue');
          const body=await r.json();
          return {status:r.status,count:body.applications?.length,more:!!body.next_cursor};
        })()`)
        assert.deepEqual(firstReviewPage,{status:200,count:100,more:true},
          "Authorized reviewer must get a real bounded first page and cursor")
        const unauthorizedReview=await signupChrome.eval(`(async()=>{
          const r=await fetch('/personal/organization-applications?action=review_queue');
          return r.status;
        })()`)
        assert.equal(unauthorizedReview,403,
          "Applicant cannot read the platform-wide submitted queue")
        await reviewChrome.send("Page.bringToFront")
        await reviewChrome.wait("document.visibilityState==='visible'")
        await reviewChrome.send("Page.reload",{ignoreCache:true})
        await reviewChrome.wait("!document.getElementById('workspace').hidden")
        await reviewChrome.eval("document.getElementById('organization-review-refresh').onclick()")
        await reviewChrome.wait("!document.getElementById('organization-review-panel').hidden && "+
          "!document.getElementById('organization-review-more').hidden && "+
          "(()=>{const r=document.getElementById('organization-review-more').getBoundingClientRect();"+
          "return r.width>0&&r.height>0})()")
        assert.equal(await reviewChrome.eval(
          "document.querySelectorAll('#organization-review-list p').length"),100)
        await reviewChrome.click("#organization-review-more")
        await reviewChrome.wait(
          "document.querySelectorAll('#organization-review-list p').length===101")
        const secondPageUi=await reviewChrome.eval(`(()=>({
          count:document.querySelectorAll('#organization-review-list p').length,
          moreHidden:document.getElementById('organization-review-more').hidden,
          unique:new Set(Array.from(document.querySelectorAll('#organization-review-list p')).map(
            p=>p.textContent)).size
        }))()`)
        assert.deepEqual(secondPageUi,{count:101,moreHidden:true,unique:101},
          "Real Chrome must append exactly 1 remaining distinct submitted application")
        // A document row on the first page must stay interactive after page 2
        // loads. The request sequence protects HTTP responses, not live rows.
        await reviewChrome.eval("(()=>{const row=Array.from(document.querySelectorAll('#organization-review-list p')).find(p=>p.textContent.includes('B22 Pagination Edited Document'));const button=Array.from(row?.querySelectorAll('button')||[]).find(b=>b.textContent==='Belgeyi Güvenli Önizle');if(!button)throw Error('Missing page-1 safe preview');button.click();return true})()")
        await reviewChrome.wait("Array.from(document.querySelectorAll('#organization-review-list p')).some(p=>p.textContent.includes('B22 Pagination Edited Document')&&p.querySelector('img')?.naturalWidth>0)")
        const previewAfterMore=await reviewChrome.eval("(()=>{const row=Array.from(document.querySelectorAll('#organization-review-list p')).find(p=>p.textContent.includes('B22 Pagination Edited Document'));const image=row?.querySelector('img');const button=Array.from(row?.querySelectorAll('button')||[]).find(b=>b.textContent==='İşletmeyi Onayla');return {imageVisible:!!image&&!image.hidden,approveReady:!!button&&!button.disabled&&!button.hidden};})()")
        assert.deepEqual(previewAfterMore,{imageVisible:true,approveReady:true},
          'Page-1 scanned preview and gated approval must work after appending page 2')
        process.stdout.write("PASS B22 Chrome/HTTP/PG16: page-1 safe document preview still works after page-2 pagination\\n")

        // Real authorized staff button starts review, never provisions an Org.
        // Use only an isolated task-owned application and no protected data.
        const stagedId=reviewOverflowIds[0]
        // Do not alter the first applicant's session or source-owned
        // registration proof acceptance later in this journey. Use the
        // already authenticated SECOND applicant and a disposable row.
        await q("update da_organization_application set applicant_person_id=$1 where id=$2",
          [foreignPersonId,stagedId])
        const organizationCountBeforeReview=Number((await q(
          "select count(*)::int n from da_organization"))[0].n)
        const clickReview=await reviewChrome.eval(
          "(()=>{const row=Array.from(document.querySelectorAll('#organization-review-list p'))"+
          ".find(p=>p.textContent.startsWith('B22 Pagination Fixture 1 ('));"+
          "const button=Array.from(row?.querySelectorAll('button')||[]).find(b=>b.textContent==='İncelemeye Al');"+
          "if(!button)throw Error('Missing staff in-review action');button.click();return true})()")
        assert.equal(clickReview,true)
        await reviewChrome.wait("Array.from(document.querySelectorAll('#organization-review-list p')).some(p=>p.textContent.startsWith('B22 Pagination Fixture 1 (')&&p.textContent.includes('İncelemede'))")
        assert.deepEqual(await q(
          "select status,version from da_organization_application where id=$1",[stagedId]),
          [{status:"in_review",version:2}])
        const inReviewAudit=await q(
          "select count(*)::int n from da_audit_event where action='organization.application_in_review' and target_id=$1",
          [stagedId])
        assert.equal(Number(inReviewAudit[0].n),1,"Review start must be auditable exactly once")
        assert.equal(Number((await q("select count(*)::int n from da_organization"))[0].n),
          organizationCountBeforeReview,"Starting review must not create a business")

        const applicantStage=await foreignDraftChrome.eval(
          "(async()=>{const r=await fetch('/personal/organization-applications');"+
          "const body=await r.json();return {status:r.status,items:body.drafts||[]}})()")
        assert.equal(applicantStage.status,200)
        assert.ok(applicantStage.items.some((x:any)=>x.id===stagedId&&x.status==="in_review"),
          "Applicant must see only their own current in-review application")

        const replayReview=await reviewChrome.eval(
          "(async()=>{const s=await(await fetch('/personal/session')).json();"+
          "const r=await fetch('/personal/organization-applications',{method:'POST',"+
          "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
          "body:JSON.stringify({action:'review_decision',application_id:"+JSON.stringify(stagedId)+
          ",expected_version:2,decision:'start_review'})});return r.status})()")
        assert.equal(replayReview,409,"Already in review cannot be started twice")
        const foreignReview=await foreignDraftChrome.eval(
          "(async()=>{const s=await(await fetch('/personal/session')).json();"+
          "const r=await fetch('/personal/organization-applications',{method:'POST',"+
          "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
          "body:JSON.stringify({action:'review_decision',application_id:"+JSON.stringify(stagedId)+
          ",expected_version:2,decision:'reject',notes:'not authorized'})});return r.status})()")
        assert.equal(foreignReview,403,"Applicant cannot issue platform review decisions")
        const ownerWithdraw=await foreignDraftChrome.eval(
          "(async()=>{const s=await(await fetch('/personal/session')).json();"+
          "const r=await fetch('/personal/organization-applications',{method:'POST',"+
          "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
          "body:JSON.stringify({action:'withdraw',application_id:"+JSON.stringify(stagedId)+
          ",expected_version:2})});return {status:r.status,body:await r.json()}})()")
        assert.equal(ownerWithdraw.status,200,"Applicant can withdraw an undecided in-review application")
        assert.equal(ownerWithdraw.body.status,"withdrawn")
        assert.deepEqual(await q(
          "select status,version from da_organization_application where id=$1",[stagedId]),
          [{status:"withdrawn",version:3}])
        // The old staff row is still connected, but the applicant has
        // withdrawn. A real reviewer reject click must show a visible 409
        // rather than silently swallowing an unhandled rejected promise.
        const staleReviewIndex=await reviewChrome.eval(
          "Array.from(document.querySelectorAll('#organization-review-list p')).findIndex(p=>p.textContent.startsWith('B22 Pagination Fixture 1 ('))")
        assert.ok(staleReviewIndex>=0)
        await reviewChrome.input('#organization-review-list p:nth-child('+
          (staleReviewIndex+1)+') input','Synthetic stale decision note')
        await reviewChrome.eval("(()=>{const row=Array.from(document.querySelectorAll('#organization-review-list p')).find(p=>p.textContent.startsWith('B22 Pagination Fixture 1 ('));const button=Array.from(row?.querySelectorAll('button')||[]).find(b=>b.textContent==='Reddet');if(!button)throw Error('Missing staff reject');button.click();return true})()")
        await reviewChrome.wait("document.getElementById('organization-review-status').textContent.includes('Başvuru başka işlemle değişti')")
        assert.deepEqual(await q(
          "select status,version from da_organization_application where id=$1",[stagedId]),
          [{status:"withdrawn",version:3}])
        process.stdout.write("PASS B22 Chrome/HTTP/PG16: stale staff reject HTTP409 shows visible conflict and never overwrites withdrawn application\\n")
        const documentedWithdraw=await signupChrome.callFunction(
          `async function(id){
            const s=await (await fetch('/personal/session')).json();
            const r=await fetch('/personal/organization-applications',{
              method:'POST',
              headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
              body:JSON.stringify({action:'withdraw',application_id:id,expected_version:4})
            });
            return {status:r.status,body:await r.json()};
          }`,documentedReviewId)
        assert.equal(documentedWithdraw.status,200)
        assert.equal(documentedWithdraw.body.status,'withdrawn')
        assert.equal(Number((await q('select count(*)::int n from da_organization_application_document where application_id=$1',[documentedReviewId]))[0].n),1)
        process.stdout.write("PASS B22 Chrome/HTTP/PG16: staff starts in_review, applicant sees stage and withdraws; forged and replayed decisions denied, audit preserved\n")

        await reviewChrome.eval("window.dispatchEvent(new Event('pagehide'))")
        assert.equal(await reviewChrome.eval(
          "document.getElementById('organization-review-list').textContent"),"",
          "Private queue must clear on pagehide after second page")
        assert.equal(await reviewChrome.eval(
          "document.getElementById('organization-review-more').hidden"),true)
        process.stdout.write("PASS B22 Chrome/HTTP/PG16: reviewer 101 submitted queue pages, unauthorized denied, stale view cleared\n")
      }finally{
        await q("delete from da_organization_application where id=any($1::text[])",
          [paginationOnlyIds])
      }
      process.stdout.write("PASS B22 Chrome/HTTP/PG16: individual business PNG two retained versions, independent staff approval, one Person two protected Owner Organizations, foreign denied\n")
    } finally {
      await q("update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1",[reviewGrantId])
    }

    process.stdout.write("PASS B22 Chrome/HTTP/PG16: 10 MiB tax cert upload, 10 MiB+1 rejection, private download, corrupt-file submit denial, duplicate-tax confidential flag, staff correction, applicant withdrawal, staff approval/protected Owner\n")


    // The earlier primary Customer browser is deliberately untouched by the
    // independent review-status acceptance above.
    await signupChrome.wait("document.querySelector('#bindings p')?.textContent.includes('Giriş hesabına bağlı müşteri kaydı')")
    assert.equal(await signupChrome.eval("document.querySelectorAll('#bindings button').length"),0,
      "Primary Customer cannot offer an unlink button")
    const signupLinks=await signupChrome.eval(`(async()=>{
      const r=await fetch('/personal/links');
      const body=await r.json();
      return {status:r.status,bindings:body.bindings};
    })()`)
    assert.equal(signupLinks.status,200)
    assert.equal(signupLinks.bindings.length,1)
    assert.equal(signupLinks.bindings[0].id,primaryCustomerProof[0].id)
    assert.equal(signupLinks.bindings[0].actor_id,registered[0].actor_id)
    assert.equal(signupLinks.bindings[0].is_primary,true)
    const primaryAuditBefore=Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1",[signupPerson]))[0].n)
    const primaryProofBefore=await q(
      "select id,revoked_at from da_verified_actor_binding where person_id=$1",[signupPerson])
    const deniedPrimaryUnlink=await signupChrome.eval(`(async()=>{
      const response=await fetch('/personal/session');
      const session=await response.json();
      const r=await fetch('/personal/links',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify({action:'unlink',binding_id:${JSON.stringify(primaryCustomerProof[0].id)}})});
      return r.status;
    })()`)
    assert.equal(deniedPrimaryUnlink,403,"Primary unlink must fail server-side")
    assert.deepEqual(await q(
      "select id,revoked_at from da_verified_actor_binding where person_id=$1",[signupPerson]),
      primaryProofBefore)
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1",[signupPerson]))[0].n),
      primaryAuditBefore,"Primary unlink cannot emit audit or mutate identity")
    assert.equal((await q(
      "select count(*)::int n from da_login_binding where person_id=$1 and revoked_at is null",
      [signupPerson]))[0].n,1)
    process.stdout.write("PASS B22 Chrome: primary Customer protected in UI, no unlink control, forged unlink403 and unchanged PG16 login/proof/audit\n")
    // Reuse the same task-only native Medusa Store publishable token used
    // by earlier B22 customer-context tests. It was restored after F-02.
    const priorSignupPublishable=process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY
    process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY=b22PublishableKey.token
    let nativeCustomerContext
    try{
      nativeCustomerContext=await signupChrome.eval(`(async()=>{
        const r=await fetch('/personal/contexts?type=customer');
        const body=await r.json();
        return {status:r.status,person_id:body.person_id,
          actor_id:body.actor_id,context:body.context};
      })()`)
    }finally{
      if(priorSignupPublishable===undefined)
        delete process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY
      else process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY=priorSignupPublishable
    }
    assert.deepEqual(nativeCustomerContext,{status:200,person_id:signupPerson,
      actor_id:registered[0].actor_id,context:"customer"},
      "First-party primary Customer proof must authorize native self-context without second login")
    process.stdout.write("PASS B22 Chrome: first Person signup HTTPS/PG16, mandatory mobile400, native Customer to one Person, persistent private self-read, no Organization/Staff grant, safe retry and audit privacy\n")

    // Isolated fault AFTER inserting the primary verified proof: fail the
    // canonical audit insert and independently observe complete PG16 rollback.
    // Native Medusa AuthIdentity/Customer creation is not in this transaction.
    const faultIdentity="authid_b22rollback_"+rand
    const faultCustomer="cus_b22rollback_"+rand
    const countRegistrationRows=async()=> (await q(`select
      (select count(*)::int from da_person) as persons,
      (select count(*)::int from da_actor_mapping) as mappings,
      (select count(*)::int from da_login_binding) as logins,
      (select count(*)::int from da_verified_actor_binding) as proofs,
      (select count(*)::int from da_audit_event) as audits,
      (select count(*)::int from da_audit_outbox) as outboxes`))[0]
    const beforeFaultCounts=await countRegistrationRows()
    let faultFnInstalled=false,faultTriggerInstalled=false
    try{
      await q(`create function b22_signup_post_proof_fault_v1() returns trigger
        language plpgsql as $b22$
        begin
          if NEW.action='person.registered' and NEW.actor_type='customer'
            and NEW.actor_id='${faultCustomer}' then
            if not exists(select 1 from da_verified_actor_binding
              where auth_identity_id='${faultIdentity}' and actor_id='${faultCustomer}'
                and revoked_at is null) then
              raise exception 'B22_SIGNUP_PRIMARY_PROOF_NOT_INSERTED';
            end if;
            raise exception 'B22_SIGNUP_POST_PROOF_FORCED_ROLLBACK';
          end if;
          return NEW;
        end $b22$`)
      faultFnInstalled=true
      await q("create trigger b22_signup_post_proof_fault_v1 before insert on da_audit_event for each row execute function b22_signup_post_proof_fault_v1()")
      faultTriggerInstalled=true
      await assert.rejects(
        ()=>foundation.personalRegisterCustomer(
          faultIdentity,faultCustomer,"+905551234570","Synthetic rollback"),
        /B22_SIGNUP_POST_PROOF_FORCED_ROLLBACK/,
        "Post-primary-proof failure must abort the Foundation transaction")
    }finally{
      if(faultTriggerInstalled)
        await q("drop trigger b22_signup_post_proof_fault_v1 on da_audit_event")
      if(faultFnInstalled)
        await q("drop function b22_signup_post_proof_fault_v1()")
    }
    assert.deepEqual(await countRegistrationRows(),beforeFaultCounts,
      "Forced post-proof failure must roll back Person/mapping/login/proof/audit/outbox")
    assert.equal((await q(
      "select count(*)::int n from da_login_binding where auth_identity_id=$1",
      [faultIdentity]))[0].n,0)
    assert.equal((await q(
      "select count(*)::int n from da_verified_actor_binding where auth_identity_id=$1",
      [faultIdentity]))[0].n,0)
    process.stdout.write("PASS B22 real PG16: post-primary-proof forced audit failure rolls back six Foundation tables\n")

    // P2 regression: TWO real HTTPS socket origins reach the actual
    // first-party front door (not a mocked X-Forwarded-For header).
    // Each password attempt uses a distinct nonexistent identity, so the
    // subject 10/minute budget cannot obscure the source 60/minute budget.
    // This runs only against the disposable task-owned PG16 database.
    const availablePort=plainServer()
    await new Promise<void>((resolve,reject)=>{
      availablePort.once("error",reject)
      availablePort.listen(0,"127.0.0.1",resolve)
    })
    const visitorPort=(availablePort.address() as {port:number}).port
    await new Promise<void>(resolve=>availablePort.close(()=>resolve()))
    const visitorOrigin="https://127.0.0.1:"+visitorPort
    const originalPublicOrigin=process.env.DOGRUADRES_PUBLIC_ORIGIN
    process.env.DOGRUADRES_PUBLIC_ORIGIN=visitorOrigin
    const visitorFrontdoor=spawn("node",["scripts/personal-frontdoor.mjs"],{
      cwd:process.cwd(),env:{...process.env,
        DOGRUADRES_PUBLIC_ORIGIN:visitorOrigin,
        DOGRUADRES_FRONTDOOR_HOST:"127.0.0.1",
        DOGRUADRES_FRONTDOOR_PORT:String(visitorPort)},
      stdio:["ignore","ignore","pipe"],
    })
    // Never log raw child stderr: it can contain local paths or secrets.
    let startupClass="none",probeStatus=0,probeErrorClass="none"
    visitorFrontdoor.stderr?.on("data",(buf:Buffer)=>{
      const message=String(buf)
      if(message.includes("ERR_UNKNOWN_FILE_EXTENSION"))startupClass="typescript-loader"
      else if(message.includes("ERR_MODULE_NOT_FOUND"))startupClass="module-resolution"
      else if(message.includes("EADDRINUSE"))startupClass="port-collision"
      else if(message.includes("ENOENT"))startupClass="missing-resource"
      else if(message.includes("Invalid ingress")||message.includes("Missing ingress"))startupClass="ingress-config"
    })
    visitorFrontdoor.on("error",()=>{startupClass="spawn-error"})
    try{
      const visitorHttp=(source:string,path:string,body:unknown,spoof=false):Promise<number>=>
        new Promise((resolve,reject)=>{
          const request=tlsRequest(visitorOrigin+path,{
            method:"POST",ca:readFileSync(crt),localAddress:source,agent:false,
            headers:{"origin":visitorOrigin,"content-type":"application/json",
              ...(spoof?{"x-forwarded-for":"127.0.0.3","x-da-visitor-rate-v1":"forged"}:{})},
          },response=>{
            response.resume()
            response.on("end",()=>resolve(response.statusCode??0))
          })
          request.on("error",reject)
          request.setTimeout(12000,()=>request.destroy(Error("Visitor quota HTTPS timeout")))
          request.end(JSON.stringify(body))
        })
      try{
        await until(async()=>{
          if(visitorFrontdoor.exitCode!==null)return false
          try{
            const response=await new Promise<number>((resolve,reject)=>{
              const request=tlsRequest(visitorOrigin+"/personal",{
                method:"GET",ca:readFileSync(crt),agent:false,
              },res=>{res.resume();res.on("end",()=>resolve(res.statusCode??0))})
              request.on("error",reject);request.end()
            })
            probeStatus=response
            return response===200
          }catch(error){
            const c=(error as {code?:unknown})?.code
            probeErrorClass=typeof c==="string"&&["ECONNREFUSED","ECONNRESET","EPROTO","ETIMEDOUT"].includes(c)?c:"transport-error"
            return false
          }
        },16000,"first-party signed rate-source HTTPS frontdoor")
      }catch{
        throw Error("Visitor rate HTTPS frontdoor unavailable: "+JSON.stringify({
          childExited:visitorFrontdoor.exitCode!==null,exitCode:visitorFrontdoor.exitCode,
          startupClass,probeStatus,probeErrorClass
        }))
      }
      const countBefore=Number((await q(
        "select count(*)::int n from da_person"))[0].n)
      // Rate quotas use PostgreSQL clock minutes, not elapsed 60-second TTL.
      // A rollover among 60 HTTPS probes can legitimately return 401 again.
      // Retry at most once with a FRESH real loopback source, so partial
      // requests from the crossed minute cannot contaminate the new pass.
      const quotaMinute=async()=>Number((await q(
        "select floor(extract(epoch from clock_timestamp())/60)::bigint as bucket"
      ))[0].bucket)
      const fakeRegistration=(source:string,spoof=false)=>visitorHttp(source,
        "/personal/register",{first_name:"Synthetic",last_name:"Rejected",
          email:signupEmail,password:"intentionally-wrong-password-123",
          mobile_phone:signupPhone},spoof)
      let quotaVerified=false
      for(let pass=0;pass<2&&!quotaVerified;pass++){
        const sourceA=pass===0?"127.0.0.2":"127.0.0.4"
        const startMinute=await quotaMinute()
        const failedLogins:number[]=[]
        for(let i=0;i<60;i++){
          failedLogins.push(await visitorHttp(sourceA,"/personal/session",{
            email:"visitor-throttle-"+randomBytes(8).toString("hex")+"@example.invalid",
            password:"deliberately-not-a-real-password",
          }))
        }
        const deniedLogin=await visitorHttp(sourceA,"/personal/session",{
          email:"visitor-throttle-"+randomBytes(8).toString("hex")+"@example.invalid",
          password:"deliberately-not-a-real-password",
        })
        const deniedSignup=await fakeRegistration(sourceA)
        const deniedSpoof=await fakeRegistration(sourceA,true)
        const sourceBLogin=await visitorHttp("127.0.0.3","/personal/session",{
          email:"visitor-independent-"+randomBytes(8).toString("hex")+"@example.invalid",
          password:"deliberately-not-a-real-password",
        })
        const sourceBSignup=await fakeRegistration("127.0.0.3")
        if(await quotaMinute()!==startMinute){
          if(pass===1)throw Error(
            "B22 HTTPS quota check crossed two database-minute windows; inconclusive")
          // Not a rate-limit failure: a new clock minute resets the quota.
          // Source 127.0.0.4 has no prior counter in the replacement window.
          continue
        }
        assert.ok(failedLogins.every(code=>code===401),
          "Source A must have 60 independent failed logins in one PG minute")
        assert.equal(deniedLogin,429,"Source A's 61st login must be throttled")
        assert.equal(deniedSignup,429,
          "Source A must not bypass the shared login/register source quota")
        assert.equal(deniedSpoof,429,
          "Public spoofed forwarding and rate-source headers must be ignored")
        assert.equal(sourceBLogin,401,"Source B login must not inherit A's 429")
        assert.equal(sourceBSignup,409,
          "Source B signup reaches native credential check, not A's 429")
        quotaVerified=true
      }
      assert.ok(quotaVerified,"No complete PostgreSQL-minute quota evidence")
      assert.equal(Number((await q(
        "select count(*)::int n from da_person"))[0].n),countBefore,
        "Failed quota probes must not register a Person")
      process.stdout.write("PASS B22 Chrome: distinct real TLS client IPs share login/signup budget per source only; 61st login 429, forged headers ignored, independent source 401/409, no Person mutation\n")
    }finally{
      visitorFrontdoor.kill("SIGTERM")
      if(visitorFrontdoor.exitCode===null)
        await new Promise<void>(resolve=>visitorFrontdoor.once("exit",()=>resolve()))
      if(originalPublicOrigin===undefined)delete process.env.DOGRUADRES_PUBLIC_ORIGIN
      else process.env.DOGRUADRES_PUBLIC_ORIGIN=originalPublicOrigin
    }

    process.stdout.write("NOT TESTED B22 Chrome: actual platform document reviewer/writer, buyer checkout, independent acceptance and atomic cross-module revocation\n")

  }catch(error){
    // Preserve the first failed browser/HTTP assertion, rather than replacing
    // it with a secondary privacy failure observed during Chrome cleanup.
    originalB22Error=error
    throw error
  }finally{
    for(const b of browsers)await b.close()
    if(server)await new Promise<void>(r=>server!.close(()=>r()))
    if(privateServer)await new Promise<void>(r=>privateServer!.close(()=>r()))
    if(previousPrivateOrigin===undefined)delete process.env.DOGRUADRES_PRIVATE_API
    else process.env.DOGRUADRES_PRIVATE_API=previousPrivateOrigin
    if(previousTlsCert===undefined)delete process.env.DOGRUADRES_TLS_CERT
    else process.env.DOGRUADRES_TLS_CERT=previousTlsCert
    if(previousTlsKey===undefined)delete process.env.DOGRUADRES_TLS_KEY
    else process.env.DOGRUADRES_TLS_KEY=previousTlsKey
    if(previousListenerPort===undefined)delete process.env.DOGRUADRES_FRONTDOOR_PORT
    else process.env.DOGRUADRES_FRONTDOOR_PORT=previousListenerPort
    if(previousTaxDir===undefined)delete process.env.DOGRUADRES_TAX_CERTIFICATE_DIR
    else process.env.DOGRUADRES_TAX_CERTIFICATE_DIR=previousTaxDir
    if(app)await app.close()
    await pg.end()
    rmSync(temp,{recursive:true,force:true})
    // Verify responses that closed during Chrome/server cleanup as well.
    // If another test already failed, preserve that primary diagnostic; the
    // entire job remains FAIL and this secondary error is still reported.
    if(originalB22Error===undefined)smtpGuard?.assertNoLeaks()
    else try {smtpGuard?.assertNoLeaks()}
      catch {process.stderr.write("SECONDARY SMTP privacy failure during cleanup; primary error preserved\n")}
  }
}

/**
 * Re-enter the first-party Owner UI after visiting the separate Buyer Chrome.
 * A hidden tab may conceal all private controls; refresh by actual user
 * selection, not by editing DOM.hidden or disabling authorization.
 */
async function restoreStorePriceGroupOwnerBrowser(input:{
  browser:B06Chrome;organizationName:string;storeId:string;
  groupId:string;buyerOrganizationId:string
}):Promise<void>{
  const {browser,organizationName,storeId,groupId,buyerOrganizationId}=input
  await browser.send("Page.bringToFront")
  await browser.wait("document.visibilityState==='visible'")
  // The Buyer Chrome may invalidate the previously displayed private scope.
  // Re-enter through a real reload and server-owned session validation; never
  // toggle hidden flags or fake credentials in the DOM.
  if(await browser.eval("document.getElementById('workspace').hidden")){
    await browser.send("Page.reload",{ignoreCache:true})
    await browser.wait("document.readyState==='complete' && "+
      "document.visibilityState==='visible'")
  }
  await browser.wait("!document.getElementById('workspace').hidden")
  await browser.select(organizationName,"owner")
  await browser.wait("!document.getElementById('store-price-group-panel').hidden")
  const store=await browser.eval("(()=>{"+
    "const e=document.querySelector('#store-price-group-form select[name=seller_id]');"+
    "if(!e||!Array.from(e.options).some(o=>o.value==="+JSON.stringify(storeId)+"))return false;"+
    "e.value="+JSON.stringify(storeId)+";"+
    "e.dispatchEvent(new Event('change',{bubbles:true}));"+
    "return e.value==="+JSON.stringify(storeId)+"})()")
  assert.equal(store,true,"Real Owner UI must offer this exact authorized Store")
  await browser.wait("Array.from(document.querySelectorAll('#store-price-group-choice option'))"+
    ".some(o=>o.value==="+JSON.stringify(groupId)+")")
  const group=await browser.eval("(()=>{"+
    "const e=document.getElementById('store-price-group-choice');"+
    "e.value="+JSON.stringify(groupId)+";"+
    "e.dispatchEvent(new Event('change',{bubbles:true}));"+
    "return document.querySelector('#store-price-group-form input[name=customer_group_id]').value})()")
  assert.equal(group,groupId,"Owner must select the exact native CustomerGroup")
  await browser.eval("document.querySelector('#store-price-group-form input[name=buyer_organization_id]').value=''")
  await browser.input("#store-price-group-form input[name=buyer_organization_id]",
    buyerOrganizationId)
  assert.equal(await browser.eval(
    "document.querySelector('#store-price-group-form input[name=buyer_organization_id]').value"),
    buyerOrganizationId)
}
