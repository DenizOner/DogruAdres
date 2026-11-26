import { verifyStoreDraftClosingPersonLockRace } from "./b22-store-draft-lifecycle.accept"
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


export async function verifyOwnerClosingBrowser(input:{
  browser:B06Chrome;reviewer:B06Chrome;coOwnerPersonId:string;
  ownerPersonId:string;connectionString:string;
  organizations:any[];ownerStoreId:string;secondOwnerStoreId:string;
  nativeCustomer:any;customerCart:any;cartStoreIds:string[];foundation:any;cartService:any;
  q:(sql:string,params?:any[])=>Promise<any[]>;
  get:(url:string)=>Promise<any>;catalogUrl:(org:string)=>string;
  container:any;firstEmail:string;secondEmail:string;
}):Promise<void>{
  const {browser,reviewer,coOwnerPersonId,ownerPersonId,connectionString,
    organizations,ownerStoreId,secondOwnerStoreId,
    nativeCustomer,customerCart,cartStoreIds,foundation,cartService,q,get,catalogUrl,
    container,firstEmail,secondEmail}=input
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
    const route="/organization/notifications?organization="+encodeURIComponent(organizations[0].id)
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
  await verifyStoreDraftClosingPersonLockRace({browser,q,connectionString,
    personId:ownerPersonId,organizationId:organizations[0].id,sellerId:ownerStoreId})
  await browser.eval("window.__b22ClosingConfirm=window.confirm;window.confirm=()=>true")
  assert.equal(await browser.eval("(()=>{const b=document.querySelector('#store-owner-closing-form button[value=start]');b.focus();return document.activeElement===b})()"),true)
  await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:" ",code:"Space",text:" ",windowsVirtualKeyCode:32})
  await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:" ",code:"Space",windowsVirtualKeyCode:32})
  await browser.eval("window.confirm=window.__b22ClosingConfirm;delete window.__b22ClosingConfirm")
  await browser.wait("document.getElementById('store-owner-closing-status').textContent.includes('Kalan süre (yenilendiğinde):') && "+
    "document.getElementById('store-owner-closing-status').getAttribute('role')==='status'")
  assert.ok(browser.http.some((x:any)=>x.path==="/organization/store-owner-closing"&&x.method==="POST"&&x.status===200))
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
    "async function(org,seller){const r=await fetch('/organization/store-owner-closing?'+new URLSearchParams({organization_id:org,seller_id:seller}));return {status:r.status,body:await r.json()}}",
    organizations[0].id,ownerStoreId)
  assert.equal(clockView.status,200)
  assert.equal(clockView.body.state,"closing")
  assert.equal(clockView.body.permanent_finalization_enabled,false)
  assert.deepEqual(clockView.body.notification_coverage,{
    protected_owners:2,personal_receipts:2,mailbox_delivery_verified:false
  },"Both active protected Owners have a private in-account receipt, not email delivery")
  assert.deepEqual(clockView.body.email_notice,{
    status:"queued",attempts:0,smtp_accepted:false,
    mailbox_delivery_verified:false
  },"The closing source's private Owner receipt is pending a real SMTP attempt")
  const readOwnClosing=async(b:B06Chrome,org:string,seller:string)=>
    b.callFunction("async function(org,seller){const r=await fetch("+
      "'/organization/store-owner-closing?'+new URLSearchParams("+
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
  assert.deepEqual(selfAccepted.body.notification_coverage,{
    protected_owners:2,personal_receipts:2,mailbox_delivery_verified:false
  },"One Owner's SMTP acceptance cannot alter another Owner's private coverage")
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
    "textContent.includes('SMTP sunucusu e-postayı kabul etti; posta kutusuna teslim doğrulanmadı.') && "+
    "document.getElementById('store-owner-closing-status').textContent.includes('Korunan Owner bildirim kayıtları: 2/2')")
  assert.ok((await browser.eval(
    "document.getElementById('store-owner-closing-status').textContent")).includes(
      'E-posta teslimi veya okunma bu sayılardan doğrulanmaz.'))
  assert.equal(await browser.eval(
    "document.getElementById('store-owner-closing-status').getAttribute('role')"),"status")
  assert.ok(Number.isSafeInteger(clockView.body.remaining_seconds)&&
    clockView.body.remaining_seconds>0&&clockView.body.remaining_seconds<=2592000,
    "Owner's status includes a bounded canonical server-clock countdown")
  await verifyB22NativeOwnerMailRetry({
    browser,coOwner:reviewer,container,q,firstPersonId:ownerPersonId,
    secondPersonId:coOwnerPersonId,eventId:closed.audit_event_id,
    firstEmail,secondEmail
  })
  // #252 post-real-SMTP readback: the first Owner's private UI previously
  // used a synthetic accepted row. After the other Owner's ACTUAL loopback
  // SMTP 250, the server and UI must still show ONLY this Owner's own state.
  const postNativeSmtpOwner=await readOwnClosing(
    browser,organizations[0].id,ownerStoreId)
  assert.equal(postNativeSmtpOwner.status,200)
  assert.deepEqual(postNativeSmtpOwner.body.email_notice,{
    status:"accepted",attempts:1,smtp_accepted:true,
    mailbox_delivery_verified:false
  },"Another Owner's real SMTP 250 must not replace this Person's private status")
  assert.deepEqual(postNativeSmtpOwner.body.notification_coverage,{
    protected_owners:2,personal_receipts:2,mailbox_delivery_verified:false
  },"Both separate private receipts persist; SMTP acceptance is not mailbox delivery")
  assert.equal(postNativeSmtpOwner.body.permanent_finalization_enabled,false)
  assert.equal(postNativeSmtpOwner.body.state,"closing")
  assert.equal(JSON.stringify(postNativeSmtpOwner.body).includes(secondEmail),false,
    "A's owner-scoped response must never contain B's private email")
  const postNativeSmtpOther=await readOwnClosing(
    reviewer,organizations[0].id,ownerStoreId)
  assert.equal(postNativeSmtpOther.status,403,
    "Second protected Organization Owner is NOT native Seller-linked yet")
  assert.deepEqual(postNativeSmtpOther.body,{message:"Access denied"})
  assert.equal((await readOwnClosing(reviewer,
    organizations[1].id,ownerStoreId)).status,403,
    "Another Organization must not read either Owner's SMTP result")
  await browser.send("Page.bringToFront")
  await browser.wait("document.visibilityState==='visible'")
  const oldReadCount=browser.http.filter((x:any)=>
    x.path==="/organization/store-owner-closing"&&x.method==="GET"&&x.status===200).length
  await browser.click("#store-owner-closing-refresh")
  await until(async()=>browser.http.filter((x:any)=>
    x.path==="/organization/store-owner-closing"&&x.method==="GET"&&x.status===200
  ).length>oldReadCount,19000,"B22 Owner real SMTP post-result HTTPS GET")
  await browser.wait("document.getElementById('store-owner-closing-status')."+
    "textContent.includes('SMTP sunucusu e-postayı kabul etti; posta kutusuna teslim doğrulanmadı.') && "+
    "document.getElementById('store-owner-closing-status').textContent.includes('Korunan Owner bildirim kayıtları: 2/2')")
  const afterRealSmtpText=await browser.eval(
    "document.getElementById('store-owner-closing-status').textContent")
  assert.equal(afterRealSmtpText.includes(secondEmail),false)
  assert.equal(afterRealSmtpText.includes("Message-ID"),false)
  assert.equal(await browser.eval(
    "document.getElementById('store-owner-closing-status').getAttribute('role')"),"status")
  assert.deepEqual((await q("select id,name,handle,status,approved_at,"+
    "closed_from,closed_to from seller where id=$1",[ownerStoreId]))[0],
    nativeBefore,"A second SMTP acceptance cannot close or rename a Seller")
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: after second Owner native SMTP 250, first Owner HTTPS/UI keeps own accepted-not-delivered status; unlinked second Owner and foreign Org HTTP403; canonical receipts remain 2, no terminal finalization\n")

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
    "const res=await fetch('/organization/store-owner-closing',{method:'POST',headers,"+
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
  await browser.wait("document.getElementById('store-owner-closing-status').textContent.includes('geri çekildi') && "+
    "document.getElementById('store-owner-closing-status').textContent.includes('Korunan Owner bildirim kayıtları: 2/2')")
  assert.ok((await browser.eval(
    "document.getElementById('store-owner-closing-status').textContent")).includes(
      'E-posta teslimi veya okunma bu sayılardan doğrulanmaz.'),
    "Real withdrawn Owner screen must not claim mailbox delivery or reading")
  assert.equal(await browser.eval(
    "document.getElementById('store-owner-closing-status').getAttribute('role')"),"status")
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
  assert.deepEqual(withdrawnView.body.notification_coverage,{
    protected_owners:2,personal_receipts:2,mailbox_delivery_verified:false
  },"Withdrawal must use its own new event receipts")
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
    "(await fetch('/organization/store-owner-closing',{method:'POST',headers,body:raw})).status))}",
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

  // DAY-30 BOUNDARY FIXTURE: never change an append-only audit timestamp.
  // A fresh, isolated closing starts almost 30 days ago and expires in 22s.
  // The SAME source/Store is read by Chrome HTTPS before AND after the real
  // PostgreSQL wall-clock boundary. No synthetic time or finalizer is used.
  const [{now_at:serverNow}]=await q("select clock_timestamp() as now_at")
  const boundaryDue=new Date(new Date(serverNow).getTime()+22000).toISOString()
  const boundaryStart=new Date(
    new Date(boundaryDue).getTime()-2592000000).toISOString()
  const expiredKey="dasc_"+randomBytes(16).toString("hex")
  // Record the real approved Seller and name claim before the synthetic
  // expired Owner intent. Elapsed time alone must never release either.
  const expiredNativeBefore=(await q(
    "select id,name,handle,status,approved_at,closed_from,closed_to from seller where id=$1",
    [secondOwnerStoreId]))[0]
  assert.ok(expiredNativeBefore?.id)
  const expiredClaimQuery=`select id,organization_id,seller_id,status,
    store_name_hash,name_claim_released_at from da_store_application
    where seller_id=$1 and organization_id=$2 and status='created' order by id`
  const expiredClaimBefore=await q(expiredClaimQuery,
    [secondOwnerStoreId,organizations[0].id])
  assert.equal(expiredClaimBefore.length,1,
    "The second approved Store needs one canonical original name claim")
  assert.ok(expiredClaimBefore[0].store_name_hash)
  assert.equal(expiredClaimBefore[0].name_claim_released_at,null,
    "The Store must still own its original name before Owner expiry")
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
        boundaryStart,boundaryDue])
    assert.ok(fixtureEvent?.id)
    expiryFixtureAuditId=fixtureEvent.id
    const [realSource]=await q(
      "select envelope from da_audit_outbox"+
      " where source_audit_event_id=$1 and deleted_at is null",
      [raceRow.source_audit_event_id])
    assert.ok(realSource?.envelope)
    const fixtureEnvelope={...realSource.envelope,
      source_audit_event_id:expiryFixtureAuditId,
      target_id:secondOwnerStoreId,occurred_at:boundaryStart}
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
        expiryFixtureAuditId,boundaryStart,boundaryDue])).length,1)
    await q("commit")
  }catch(error){await q("rollback");throw error}
  try{
    // Observe the real first-party HTTP response just BEFORE this same
    // audited closing's 30-day deadline, with an unchanged PG16 source.
    const preBoundary=await browser.callFunction(
      "async function(org,seller){const r=await fetch('/organization/store-owner-closing?'+new URLSearchParams({organization_id:org,seller_id:seller}),{cache:'no-store'});return {status:r.status,body:await r.json()}}",
      organizations[0].id,secondOwnerStoreId)
    const [preClock]=await q("select clock_timestamp() as now_at")
    assert.equal(preBoundary.status,200)
    assert.equal(preBoundary.body.state,"closing")
    assert.equal(preBoundary.body.can_withdraw,true,
      "Current authorized Owner can withdraw before the exact day-30 cutoff")
    assert.ok(preBoundary.body.remaining_seconds>0&&
      preBoundary.body.remaining_seconds<=22,
      "Server countdown stays positive just before day 30")
    assert.equal(preBoundary.body.permanent_finalization_enabled,false)
    assert.ok(new Date(preClock.now_at).getTime()<new Date(boundaryDue).getTime(),
      "The actual PostgreSQL clock has not crossed the deadline yet")
    assert.equal((await q("select count(*)::int n from da_notification_receipt "+
      "where audit_event_id=$1",[expiryFixtureAuditId]))[0].n,0)
    // Wait for real PostgreSQL time to cross day 30, not a mocked clock
    // or mutating the append-only source. The post-expiry HTTP409 and
    // Seller/name/Cart/audit negative checks below use the SAME closure.
    await until(async()=>{
      const [time]=await q("select clock_timestamp() >= $1::timestamptz as reached",
        [boundaryDue])
      return time?.reached===true
    },30000,"real PostgreSQL Owner 30-day deadline crossing")
    const expired=await browser.callFunction(
      "async function(org,seller){const r=await fetch('/organization/store-owner-closing?'+new URLSearchParams({organization_id:org,seller_id:seller}),{cache:'no-store'});return {status:r.status,body:await r.json()}}",
      organizations[0].id,secondOwnerStoreId)
    assert.equal(expired.status,200)
    assert.equal(expired.body.state,"closing")
    assert.equal(expired.body.can_withdraw,false)
    assert.equal(expired.body.remaining_seconds,0)
    assert.equal(expired.body.permanent_finalization_enabled,false)
    assert.deepEqual(expired.body.notification_coverage,{
      protected_owners:2,personal_receipts:0,mailbox_delivery_verified:false
    },"Synthetic expired event has no mandatory in-account delivery records")
    // The actual authorized Owner screen must stop calling an expired
    // waiting period a countdown. Do not display a completed/terminated
    // Store, release its name, or enable a withdrawal after the deadline.
    const selectClosingStore=async(seller:string)=>browser.callFunction(
      "function(seller){const c=document.querySelector("+
      "'#store-owner-pause-form select[name=seller_id]');"+
      "if(!c||!Array.from(c.options).some(o=>o.value===seller))return false;"+
      "c.value=seller;c.dispatchEvent(new Event('change',{bubbles:true}));"+
      "return true}",seller)
    // A preceding real Owner/Store action can leave the Organization
    // selector mid-refresh. Re-enter through a genuine current native
    // session and wait for the server-owned Store option; never inject
    // a synthetic option or bypass protected Owner authorization.
    await browser.send("Page.bringToFront")
    await browser.send("Page.reload",{ignoreCache:true})
    await browser.wait("document.readyState==='complete' && "+
      "document.visibilityState==='visible' && "+
      "!document.getElementById('workspace').hidden")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('store-owner-pause-panel').hidden && "+
      "Array.from(document.querySelectorAll("+
      "'#store-owner-pause-form select[name=seller_id] option')).some("+
      "o=>o.value==="+JSON.stringify(secondOwnerStoreId)+")")
    assert.equal(await selectClosingStore(secondOwnerStoreId),true,
      "Real Owner must be able to select the expired approved Store")
    await browser.wait("document.getElementById('store-owner-closing-status').textContent.includes('30 günlük bekleme süresi doldu')")
    const expiryScreen=await browser.eval("document.getElementById('store-owner-closing-status').textContent")
    for(const message of ["Yeni satışlar hâlâ kapalı",
      "geri dönüşsüz işlem yapılmıyor",
      "mağaza adını veya geçmiş siparişleri kendiliğinden değiştirmez",
      "Geri çekme süresi sona erdi",
      "Korunan Owner bildirim kayıtları: 0/2"])
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
    assert.deepEqual((await q(
      "select id,name,handle,status,approved_at,closed_from,closed_to from seller where id=$1",
      [secondOwnerStoreId]))[0],expiredNativeBefore,
      "Expired Owner waiting period must not mutate native Seller identity or status")
    assert.deepEqual(await q(expiredClaimQuery,
      [secondOwnerStoreId,organizations[0].id]),expiredClaimBefore,
      "Expired Owner waiting period must preserve the exclusive name claim")
    const expiredCatalogue=await get(catalogUrl(organizations[0].id))
    assert.equal(expiredCatalogue.status,200)
    assert.equal(expiredCatalogue.body.stores.some(
      (x:any)=>x.id===secondOwnerStoreId),false,
      "Expired but unfinalized Store must remain blocked from new sales")
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

export async function verifyOwnerTemporaryPauseBrowser(input:{
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
    // Put the selected Store second in the task-only chooser so a
    // programmatic list rebuild selecting index 0 would expose the bug.
    assert.equal(await browser.eval("(()=>{const c=document.querySelector("+
      "'#store-owner-pause-form select[name=seller_id]');"+
      "const other=Array.from(c.options).find(o=>o.value==="+
      JSON.stringify(secondOwnerStoreId)+");"+
      "if(!other)return false;c.prepend(other);c.value="+
      JSON.stringify(ownerStoreId)+";return c.selectedIndex>0})()"),true,
      "Owner's second Store choice must not fall back to the first option")
    await browser.wait("!document.getElementById('org-stores-refresh').disabled")
    // Real HTTPS POST must execute and persist; only its *browser-visible*
    // HTTP 200 response body is corrupted in this disposable Chrome profile.
    // Never proxy a synthetic response in place of the actual server write.
    const corruptOwnerPauseReadback=async(body:string,holdResponse=false)=>{
      assert.equal(await browser.eval("(()=>{"+
        "if(window.__b22PauseWire)return false;"+
        "window.__b22PauseWire={original:window.fetch,count:0,getCount:0,"+
        "holdPost:"+String(holdResponse)+"};"+
        "const wire=window.__b22PauseWire;"+
        "window.fetch=async(...args)=>{"+
        "const raw=args[0];"+
        "const method=String(args[1]?.method||raw?.method||'GET').toUpperCase();"+
        "const path=new URL(typeof raw==='string'?raw:raw?.url,location.href).pathname;"+
        "if(path==='/organization/store-owner-pause'&&method==='GET')wire.getCount++;"+
        "const actual=await wire.original.apply(window,args);"+
        "if(wire.count===0&&path==='/organization/store-owner-pause'&&"+
        "method==='POST'){wire.count++;wire.status=actual.status;"+
        "if(wire.holdPost){wire.postHeld=true;"+
        "await new Promise(resolve=>{wire.releasePost=resolve})}"+
        "return new Response("+JSON.stringify(body)+",{status:actual.status,"+
        "headers:{'content-type':'application/json'}})}return actual};"+
        "return true})()"),true)
    }
    const releaseOwnerPauseReadback=async()=>browser.eval(
      "(()=>{const wire=window.__b22PauseWire;"+
      "if(!wire||typeof wire.releasePost!=='function')return false;"+
      "wire.releasePost();wire.releasePost=null;return true})()")
    const restoreOwnerPauseReadback=async()=>{
      const result=await browser.eval("({count:window.__b22PauseWire?.count,"+
        "status:window.__b22PauseWire?.status??null})")
      assert.equal(await browser.eval("(()=>{if(!window.__b22PauseWire)return false;"+
        "window.fetch=window.__b22PauseWire.original;"+
        "delete window.__b22PauseWire;return true})()"),true)
      return result
    }
    const ownerPausePostCount=()=>browser.http.filter((item:any)=>
      item.path==="/organization/store-owner-pause"&&item.method==="POST").length
    await browser.eval("window.__b22PreviousConfirm=window.confirm;window.confirm=()=>true")
    assert.equal(await browser.eval("(()=>{const b=document.querySelector('#store-owner-pause-form button[value=pause]');b.focus();return document.activeElement===b})()"),true)
    const firstPosts=ownerPausePostCount()
    await corruptOwnerPauseReadback("{",true)
    try{
      await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:" ",code:"Space",text:" ",windowsVirtualKeyCode:32})
      await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:" ",code:"Space",windowsVirtualKeyCode:32})
      // The real server has committed, but the caller is still waiting for
      // HTTP200. A user refresh during this window MUST NOT start another GET.
      await browser.wait("window.__b22PauseWire?.postHeld===true")
      assert.equal(await browser.eval("document.querySelector("+
        "'#store-owner-pause-form select[name=seller_id]').disabled"),true,
        "Switching to a second Store must be disabled while Owner pause is pending")
      assert.equal(await browser.eval("window.__b22PauseWire?.getCount"),0)
      await browser.click('#store-owner-pause-refresh')
      assert.equal(await browser.eval("window.__b22PauseWire?.getCount"),0,
        "A GET started during POST could later erase the uncertain-result lock")
      assert.equal(await browser.eval("Array.from(document.querySelectorAll("+
        "'#store-owner-pause-form button[type=submit]')).every(b=>b.disabled)"),true)
      // A *different* control may refresh the entire Store list during POST.
      // It must not reset the disabled chooser to the first Store.
      await browser.click('#org-stores-refresh')
      await browser.wait("!document.getElementById('org-stores-refresh').disabled && "+
        "document.getElementById('org-stores-status').textContent.includes('güncellendi')")
      assert.equal(await browser.eval("document.querySelector("+
        "'#store-owner-pause-form select[name=seller_id]').value"),ownerStoreId,
        "A concurrent full Store list refresh must not rebind the Owner's pending pause")
      assert.equal(await browser.eval("window.__b22PauseWire?.getCount"),0,
        "Store list refresh must not start a stale Owner pause GET mid-write")
      assert.equal(await browser.eval("document.querySelector("+
        "'#store-owner-pause-form select[name=seller_id]').disabled"),true)
      assert.equal(await releaseOwnerPauseReadback(),true)
      await browser.wait("(()=>{const p=document.getElementById('store-owner-pause-status');"+
        "const f=document.getElementById('store-owner-pause-form');"+
        "return p.textContent.includes('Sonuç belirsiz')&&p.getAttribute('role')==='status'&&"+
        "Array.from(f.querySelectorAll('button[type=submit]')).every(b=>b.disabled)})()")
    }finally{
      // Avoid stranding a browser fetch promise if any race assertion fails.
      await releaseOwnerPauseReadback()
      await browser.eval("window.confirm=window.__b22PreviousConfirm;delete window.__b22PreviousConfirm")
      assert.deepEqual(await restoreOwnerPauseReadback(),{count:1,status:200},
        "One real HTTP200 pause must commit before its body is truncated")
    }
    await browser.wait("document.querySelector("+
      "'#store-owner-pause-form select[name=seller_id]').disabled===false")
    assert.equal(await browser.eval("document.querySelector("+
      "'#store-owner-pause-form select[name=seller_id]').value"),ownerStoreId,
      "Store selection remains stable until the Owner pause result settles")
    assert.equal(ownerPausePostCount(),firstPosts+1,
      "Unknown HTTP200 response must not automatically replay Owner pause")
    const firstSaved=(await q(
      "select paused,version from da_store_owner_pause where seller_id=$1",[ownerStoreId]))[0]
    assert.deepEqual(firstSaved,{paused:true,version:1},
      "Server committed pause despite unreadable HTTP200 body")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event where target_id=$1 "+
      "and resource='store-owner-pause'",[ownerStoreId]))[0].n),pauseAuditStart+1,
      "Uncertain response must never duplicate a committed pause audit")
    await browser.click('#store-owner-pause-refresh')
    await browser.wait("document.getElementById('store-owner-pause-status').textContent.includes('geçici arada')&&"+
      "!document.querySelector('#store-owner-pause-form button[value=resume]').disabled")
    assert.equal(ownerPausePostCount(),firstPosts+1,
      "Authoritative refresh must only GET, never repeat the write")
    assert.ok(browser.http.some((x:any)=>x.path==="/organization/store-owner-pause"&&
      x.method==="POST"&&x.status===200),"Owner pause must reach actual HTTPS server")
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
      "const r=await fetch('/organization/store-owner-pause',{method:'POST',headers,"+
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
    const resumePosts=ownerPausePostCount()
    await corruptOwnerPauseReadback(JSON.stringify({
      organization_id:"daorg_wrong",seller_id:ownerStoreId,
      status:"resumed",version:2,replayed:false
    }))
    try{
      await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:" ",code:"Space",text:" ",windowsVirtualKeyCode:32})
      await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:" ",code:"Space",windowsVirtualKeyCode:32})
      await browser.wait("(()=>{const p=document.getElementById('store-owner-pause-status');"+
        "const f=document.getElementById('store-owner-pause-form');"+
        "return p.textContent.includes('Sonuç belirsiz')&&"+
        "Array.from(f.querySelectorAll('button[type=submit]')).every(b=>b.disabled)})()")
    }finally{
      await browser.eval("window.confirm=window.__b22PreviousConfirm;delete window.__b22PreviousConfirm")
      assert.deepEqual(await restoreOwnerPauseReadback(),{count:1,status:200},
        "One real HTTP200 resume must commit before its invalid response schema")
    }
    assert.equal(ownerPausePostCount(),resumePosts+1)
    assert.deepEqual((await q(
      "select paused,version from da_store_owner_pause where seller_id=$1",[ownerStoreId]))[0],
      {paused:false,version:2},"Invalid HTTP200 body must not disguise committed resume")
    await browser.click('#store-owner-pause-refresh')
    await browser.wait("document.getElementById('store-owner-pause-status').textContent.includes('satışa açık')&&"+
      "!document.querySelector('#store-owner-pause-form button[value=pause]').disabled")
    assert.equal(ownerPausePostCount(),resumePosts+1,
      "Owner must reconcile invalid response by GET, never by a second mutation")
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
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: concurrent full Store-list refresh during committed pending Owner pause preserves second selected Seller and starts zero premature pause GET; uncertain response keeps both actions locked until authorized readback\n")
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: Owner refresh during real committed pause POST with HTTP200 response held starts zero premature GET, keeps Store selector and both buttons locked; release gives uncertain, only post-settle authorized GET reopens controls\n")
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: actual Owner pause/resume each persisted once but client HTTP200 truncated JSON or mismatched Organization response remained uncertain; both buttons disabled until fresh authorized GET, no replay and two durable audit/outbox\n")
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
      "(await fetch('/organization/store-owner-pause',{method:'POST',headers,body:raw})).status))}",
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
      "async function(raw,token){const response=await fetch('/organization/store-owner-pause',{method:'POST',"+
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
