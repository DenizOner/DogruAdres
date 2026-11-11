/** B22 #252: real first-party Chrome/HTTPS/PG16 platform closing and Owner
 * appeal. Task-only actors and database. Timer and dispatch require independent
 * real scheduled-job evidence; finalizer is always disabled.
 */
import assert from "node:assert/strict"
import {createHash,randomBytes} from "node:crypto"
import type {B06Chrome} from "./b06-ui-browser"

type Db=(sql:string,params?:unknown[])=>Promise<any[]>
const read=async(browser:B06Chrome,path:string)=>browser.callFunction(
  "async function(path){const r=await fetch(path,{cache:'no-store'});return {status:r.status,body:await r.json()}}",
  path)
const write=async(browser:B06Chrome,path:string,payload:unknown,badCsrf=false)=>
  browser.callFunction("async function(args){const v=JSON.parse(args);"+
  "const s=await(await fetch('/personal/session')).json();"+
  "const r=await fetch(v.path,{method:'POST',headers:{'content-type':'application/json',"+
  "'x-csrf-token':v.bad?'wrong':s.csrf_token},body:JSON.stringify(v.payload)});"+
  "return {status:r.status,body:await r.json()}}",
  JSON.stringify({path,payload,bad:badCsrf}))

export async function verifyB22PlatformClosingAppeal(input:{
  browser:B06Chrome;staff:B06Chrome;q:Db;foundation:any;
  ownerPersonId:string;staffPersonId:string;
  ownerOrgId:string;ownerOrgName:string;sellerId:string;
  buyer:B06Chrome;buyerScopePath:string;buyerOrganizationId:string;
  checkoutCartId:string;customerId:string;query:any;auth:any;ownerEmail:string
}):Promise<string>{
  const {browser,staff,q,foundation,ownerPersonId,staffPersonId,
    ownerOrgId,ownerOrgName,sellerId,buyer,buyerScopePath,
    buyerOrganizationId,checkoutCartId,customerId,query,auth,ownerEmail}=input
  const path="/personal/platform/store-closings"
  const privatePath="/personal/store-platform-closing"
  const mailPath="/personal/platform/store-closing-email-readiness?"+
    new URLSearchParams({organization_id:ownerOrgId,seller_id:sellerId}).toString()
  const readPath=privatePath+"?"+new URLSearchParams({
    organization_id:ownerOrgId,seller_id:sellerId}).toString()
  const before=(await q("select id,status,name,handle from seller where id=$1",[sellerId]))[0]
  assert.equal(before?.id,sellerId)
  assert.equal(before?.status,"open","Source Store must be trading before Staff closes")
  assert.equal(await foundation.storeOwnerPauseAcceptingOrders([sellerId]),true)
  assert.equal((await q("select count(*)::int n from da_store_platform_closing where seller_id=$1",
    [sellerId]))[0].n,0)
  // A currently authorized real Beta Buyer can inspect an attributed
  // Alpha/Gamma Cart and has a separate eligible native Gamma-only Cart.
  const availableBuyer=await read(buyer,buyerScopePath)
  assert.equal(availableBuyer.status,200,
    "Authorized Buyer scope must be visible over HTTPS before Staff closes Gamma")
  assert.equal(availableBuyer.body?.seller_count,2)
  // seller_scope=inspect is read-only Cart-to-Seller mapping, never an
  // availability or checkout grant. Prove real Buyer catalogue visibility
  // independently BEFORE closing, on the exact native Seller page.
  const catalogBase="/personal/catalog?organization_id="+
    encodeURIComponent(buyerOrganizationId)
  let sellerPage=-1
  for(let page=0;page<5;page++){
    const candidate=await read(buyer,catalogBase+"&page="+page)
    assert.equal(candidate.status,200)
    assert.ok(Array.isArray(candidate.body?.stores))
    if(candidate.body.stores.some((store:any)=>store.id===sellerId)){
      sellerPage=page
      break
    }
  }
  assert.notEqual(sellerPage,-1,
    "Gamma Store must be visible to the real Buyer before platform closure")
  const catalogPage=catalogBase+"&page="+sellerPage
  assert.equal(await foundation.authorizeBuyerCheckout(
    checkoutCartId,customerId,[sellerId]),true,
    "Exact current Buyer Cart must pass the final L before platform closure")
  assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
    [checkoutCartId]))[0].n,0)
  const orderBefore=Number((await q('select count(*)::int n from "order"'))[0].n)
  // Having store.approve or a native member does NOT authorize platform closure.
  assert.equal((await read(staff,path)).status,403)
  assert.equal((await read(staff,mailPath)).status,403,
    "Foreign Staff cannot enumerate protected Owner email readiness")
  let requestId="dascp_"+randomBytes(16).toString("hex")
  const reason="B22 sentetik mağaza için gerekçeli platform kapatma denetimi"
  assert.equal((await write(browser,path,{
    organization_id:ownerOrgId,seller_id:sellerId,request_id:requestId,reason})).status,403)
  const grantId="da_staff_closing_"+randomBytes(8).toString("hex")
  await q(`insert into da_platform_staff_grant
    (id,person_id,task,resource,granted_by_person_id,reason)
    values ($1,$2,'store.closing.manage','platform',$2,
      'B22 disposable platform closing security fixture')`,[grantId,staffPersonId])
  // Native Store fixture has >30 earlier applications. Inspect the existing
  // bounded Staff queue across actual server pages, not only the newest 30.
  let found=false,foundPage=-1
  for(let page=0;page<50;page++){
    const list=await read(staff,path+"?page="+page)
    assert.equal(list.status,200,"Strong independently authorized Staff lists Stores")
    assert.ok(Array.isArray(list.body?.candidates))
    if(list.body.candidates.some((x:any)=>
      x.organization_id===ownerOrgId&&x.seller_id===sellerId)){found=true;foundPage=page;break}
    if(list.body.has_more!==true)break
  }
  assert.equal(found,true,"Existing approved source Store must remain accessible in Staff pagination")
  assert.equal((await read(staff,mailPath)).status,403,
    "Staff cannot inspect email readiness before the verified closure exists")
  const count=async()=>Number((await q(`select count(*)::int n from da_audit_event
    where resource='store-platform-closing' and target_id=$1`,[sellerId]))[0].n)
  const auditBefore=await count()
  assert.equal((await write(staff,path,{
    organization_id:ownerOrgId,seller_id:sellerId,request_id:requestId,reason},true)).status,403,
    "Forged CSRF must not create a closure")
  assert.equal(await count(),auditBefore)
  // Real native Medusa verification precedes the first real Staff Chrome
  // form submit. The UI itself must show the server-derived count of ONE.
  // Only this disposable Medusa 2.22.3 AuthVerification record is created
  // and confirmed. No browser-claimed email and no production verification
  // shortcuts: the native Auth module issues and consumes its own code.
  const ownerBindings=await q("select auth_identity_id from da_login_binding where person_id=$1 and actor_type='user' and revoked_at is null and verified_at is not null",[ownerPersonId])
  assert.equal(ownerBindings.length,1)
  const authId=ownerBindings[0].auth_identity_id
  const challenge=await auth.requestAuthVerification({
    auth_identity_id:authId,entity_id:ownerEmail,entity_type:"email",code_provider:"token"
  })
  assert.ok(typeof challenge.code==="string"&&challenge.code.length>=16)
  const pending=await auth.listAuthVerifications({
    auth_identity_id:authId,entity_type:"email"
  },{take:null})
  assert.equal(pending.some((v:any)=>v.id===challenge.id&&!v.verified_at),true)
  await auth.confirmAuthVerification({auth_identity_id:authId,code:challenge.code,
    code_provider:"token"})
  const nativeProof=await auth.listAuthVerifications({
    auth_identity_id:authId,entity_type:"email"
  },{take:null})
  assert.equal(nativeProof.some((v:any)=>v.id===challenge.id&&v.verified_at),true)
  await staff.send("Page.bringToFront")
  await staff.send("Page.reload",{ignoreCache:true})
  await staff.wait("document.readyState==='complete' && "+
    "!document.getElementById('workspace').hidden && "+
    "!document.getElementById('platform-closing-panel').hidden")
  for(let page=0;page<foundPage;page++){
    assert.equal(await staff.eval("!document.getElementById('platform-closing-more').hidden"),true)
    await staff.click("#platform-closing-more")
    await staff.wait("document.getElementById('platform-closing-status').textContent!=='Yetkili mağazalar doğrulanıyor…'")
  }
  const canSelect=await staff.eval("(()=>{const e=document.querySelector('#platform-closing-form select[name=seller_id]');"+
    "if(!e||!Array.from(e.options).some(o=>o.value==="+JSON.stringify(sellerId)+"))return false;"+
    "e.value="+JSON.stringify(sellerId)+";e.dispatchEvent(new Event('change',{bubbles:true}));return e.value==="+JSON.stringify(sellerId)+"})()")
  assert.equal(canSelect,true,"Real Staff UI must offer the same paginated Seller")
  await staff.input("#platform-closing-form textarea[name=reason]",reason)
  await staff.click("#platform-closing-form input[name=confirmed]")
  await staff.click("#platform-closing-form button[type=submit]")
  await staff.wait("document.getElementById('platform-closing-mail-status').textContent.includes('doğrulanmış e-posta kimliği 1')")
  const mailUi=await staff.eval("(()=>{const e=document.getElementById('platform-closing-mail-status');return {text:e.textContent,role:e.getAttribute('role'),live:e.getAttribute('aria-live')}})()")
  assert.match(mailUi.text,/Korunan Owner 1, doğrulanmış e-posta kimliği 1/)
  assert.match(mailUi.text,/Owner 1: .*deneme [0-4]\/4/)
  assert.match(mailUi.text,/itiraz saati henüz başlamadı/)
  assert.equal(mailUi.role,"status")
  assert.equal(mailUi.live,"polite")
  const createdRows=await q("select request_id,state,version from da_store_platform_closing where seller_id=$1 and organization_id=$2",[sellerId,ownerOrgId])
  assert.equal(createdRows.length,1)
  assert.equal(createdRows[0].state,"notification_unverified")
  assert.equal(Number(createdRows[0].version),1)
  assert.match(createdRows[0].request_id,/^dascp_[a-f0-9]{32}$/)
  requestId=createdRows[0].request_id
  const mailReadiness=await read(staff,mailPath)
  assert.equal(mailReadiness.status,200)
  assert.equal(mailReadiness.body?.status,"not_ready")
  assert.equal(mailReadiness.body?.protected_owner_count,1)
  assert.equal(mailReadiness.body?.private_receipt_count,1)
  assert.equal(mailReadiness.body?.verified_email_identity_count,1,
    "Native-confirmed Owner email is visible to the real Staff HTTPS route")
  assert.equal(mailReadiness.body?.mailbox_delivery_verified_count,0)
  assert.equal(mailReadiness.body?.deadline_started,false)
  assert.equal(mailReadiness.body?.permanent_finalization_enabled,false)
  assert.equal(JSON.stringify(mailReadiness.body).includes("@example.invalid"),false)
  assert.equal(JSON.stringify(mailReadiness.body).includes(reason),false)

  const verifiedReadiness=await read(staff,mailPath)
  assert.equal(verifiedReadiness.status,200)
  assert.equal(verifiedReadiness.body?.protected_owner_count,1)
  assert.equal(verifiedReadiness.body?.verified_email_identity_count,1,
    "One genuinely native-confirmed protected Owner email must count as 1")
  assert.equal(verifiedReadiness.body?.mailbox_delivery_verified_count,0)
  assert.equal(verifiedReadiness.body?.mandatory_email_verified,false)
  assert.equal(verifiedReadiness.body?.deadline_started,false)
  assert.equal(JSON.stringify(verifiedReadiness.body).includes(ownerEmail),false)
  assert.equal(JSON.stringify(verifiedReadiness.body).includes(reason),false)
  // A real verified proof without its canonical Person→Actor mapping is
  // ambiguous and must not be counted. The mutation is limited to the task's
  // disposable native mapping row, restored before any Owner operation.
  const ownerMappings=await q("select id from da_actor_mapping where person_id=$1 and actor_type='user' and deleted_at is null",[ownerPersonId])
  assert.equal(ownerMappings.length,1)
  await q("update da_actor_mapping set deleted_at=clock_timestamp() where id=$1",[ownerMappings[0].id])
  try{
    const unresolved=await read(staff,mailPath)
    assert.equal(unresolved.status,200)
    assert.equal(unresolved.body?.verified_email_identity_count,0)
    assert.equal(unresolved.body?.unresolved_identity_count,1)
    assert.equal(unresolved.body?.deadline_started,false)
  }finally{
    await q("update da_actor_mapping set deleted_at=null where id=$1",[ownerMappings[0].id])
  }
  const mappingRestored=await read(staff,mailPath)
  assert.equal(mappingRestored.status,200)
  assert.equal(mappingRestored.body?.verified_email_identity_count,1,
    "Canonical mapping restoration must restore positive native proof counting")
  // Native soft-delete simulates only this test-owned proof's revocation.
  // The Owner's actual login, MFA and Store authorization stay untouched.
  await q("update auth_verification set deleted_at=clock_timestamp() where id=$1 and auth_identity_id=$2",[challenge.id,authId])
  const revokedReadiness=await read(staff,mailPath)
  assert.equal(revokedReadiness.status,200)
  assert.equal(revokedReadiness.body?.verified_email_identity_count,0,
    "Soft-deleted native email proof must not be treated as verified")
  assert.equal(revokedReadiness.body?.mandatory_email_verified,false)
  assert.equal(revokedReadiness.body?.deadline_started,false)
  assert.equal((await read(browser,mailPath)).status,403,
    "Protected Owner cannot use independent platform Staff preflight")
  assert.equal((await read(staff,mailPath+"&unknown=1")).status,400)
  const state=await read(browser,readPath)
  assert.equal(state.status,200)
  assert.equal(state.body?.reason,reason)
  assert.equal(state.body?.state,"notification_unverified")
  assert.equal(state.body?.deadline_started,false)
  assert.equal(state.body?.permanent_finalization_enabled,false)
  assert.equal((await read(staff,readPath)).status,403,
    "Staff task cannot read an unrelated Owner's private reason screen")
  const replay=await write(staff,path,{
    organization_id:ownerOrgId,seller_id:sellerId,request_id:requestId,reason})
  assert.equal(replay.status,200)
  assert.equal(replay.body?.replayed,true)
  assert.equal(await count(),auditBefore+1)
  assert.equal((await write(staff,path,{
    organization_id:ownerOrgId,seller_id:sellerId,
    request_id:"dascp_"+randomBytes(16).toString("hex"),reason})).status,409)
  assert.equal(await foundation.storeOwnerPauseAcceptingOrders([sellerId]),false,
    "Platform closure blocks Store sales even though native Seller is still open")
  assert.deepEqual((await q("select id,status,name,handle from seller where id=$1",
    [sellerId]))[0],before,"Closure must not rewrite native Seller/name/URL")
  // A real HTTPS Buyer catalogue must stop advertising Gamma's existing
  // Offer immediately. The mapped historical Cart stays readable but its
  // read-only seller-scope is NOT permission to buy or start checkout.
  const closedCatalog=await read(buyer,catalogPage)
  assert.equal(closedCatalog.status,200)
  assert.ok(Array.isArray(closedCatalog.body?.stores))
  assert.equal(closedCatalog.body.stores.some((store:any)=>store.id===sellerId),false,
    "Platform-closed Gamma must disappear from the real Buyer HTTPS catalogue")
  assert.equal(closedCatalog.body?.checkout_ready,false)
  const mappedCart=await read(buyer,buyerScopePath)
  assert.equal(mappedCart.status,200,
    "Read-only attribution mapping does not bypass sale/checkout restrictions")
  assert.equal(mappedCart.body?.checkout_ready,false)
  assert.equal(await foundation.authorizeBuyerCheckout(
    checkoutCartId,customerId,[sellerId]),false,
    "Platform closure must independently deny final L for the previously authorized Cart")
  const [attribution]=await q(`select organization_id,customer_id
    from da_buyer_cart_attribution where cart_id=$1`,[checkoutCartId])
  assert.equal(attribution.organization_id,buyerOrganizationId)
  assert.equal(attribution.customer_id,customerId)
  assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
    [checkoutCartId]))[0].n,0,
    "Denied checkout may not create an OrderGroup")
  const {data:orderLinks}=await query.graph({
    entity:"order_cart",fields:["order_id"],filters:{cart_id:checkoutCartId}
  })
  assert.equal(orderLinks.length,0,"Denied Cart may not create any Order link")
  const {data:paymentLinks}=await query.graph({
    entity:"cart_payment_collection",fields:["payment_collection_id"],
    filters:{cart_id:checkoutCartId}
  })
  assert.equal(paymentLinks.length,0,
    "Denied Cart may not attach a native payment collection")
  const notifications=await q(`select count(*)::int n from da_notification_receipt n
    join da_audit_event e on e.id=n.audit_event_id
    where e.target_id=$1 and e.action='organization.store_platform_closing_started'
      and n.person_id=$2`,[sellerId,ownerPersonId])
  assert.equal(notifications[0].n,1,"Every active protected Owner receives durable private receipt")
  const notices=await read(browser,"/personal/notifications?organization="+
    encodeURIComponent(ownerOrgId))
  assert.equal(notices.status,200)
  const closureNotice=notices.body.notifications?.find((x:any)=>
    x.title==="Platform mağaza kapatma incelemesi başladı")
  assert.ok(closureNotice,
    "The real current protected Owner must read the closure security receipt")
  assert.match(closureNotice.description,/platform kararıyla yeni satışlar durduruldu/)
  assert.match(closureNotice.description,/güvenli şirket alanınızda/)
  assert.match(closureNotice.description,/İtiraz saatini ve gerekçeyi/)
  assert.equal(closureNotice.description.includes("Mevcut faal mağazalar etkilenmez"),false)
  assert.equal(JSON.stringify(notices.body).includes(reason),false,
    "Private closure explanation never enters a generic notification payload")
  const foreignNotices=await read(staff,"/personal/notifications?organization="+
    encodeURIComponent(ownerOrgId))
  assert.ok(foreignNotices.status===200||foreignNotices.status===403)
  assert.equal(JSON.stringify(foreignNotices.body).includes(
    "Platform mağaza kapatma incelemesi başladı"),false,
    "An unrelated Staff/Organization role must not read Owner-only receipts")
  // Real browser Owner UI: normal HTTPS reload, Organization selection and
  // CDP mouse/keyboard submit. No synthetic .onsubmit() or hidden DOM override.
  await browser.send("Page.bringToFront")
  await browser.send("Page.reload",{ignoreCache:true})
  await browser.wait("document.readyState==='complete'&&!document.getElementById('workspace').hidden")
  await browser.select(ownerOrgName,"owner")
  await browser.wait("!document.getElementById('store-owner-pause-panel').hidden")
  await browser.click("#notification-bell")
  await browser.wait("!document.getElementById('notification-panel').hidden && "+
    "document.getElementById('notification-list').textContent.includes('platform kararıyla yeni satışlar durduruldu')")
  assert.equal(await browser.eval(
    "Array.from(document.querySelectorAll('#notification-list li')).some("+
    "li=>li.querySelector('h3')?.textContent==='Platform mağaza kapatma incelemesi başladı' && "+
    "li.querySelector('p')?.textContent.includes('Mevcut faal mağazalar etkilenmez'))"),false)
  await browser.click("#notification-close")
  const selected=await browser.eval(`(()=>{
    const x=document.querySelector('#store-owner-pause-form select[name=seller_id]');
    if(!x||!Array.from(x.options).some(o=>o.value===${JSON.stringify(sellerId)}))return false;
    x.value=${JSON.stringify(sellerId)};x.dispatchEvent(new Event('change',{bubbles:true}));
    return x.value===${JSON.stringify(sellerId)};
  })()`)
  assert.equal(selected,true)
  await browser.wait("!document.getElementById('store-platform-appeal-panel').hidden")
  const ui=await browser.eval(`({
    reason:document.getElementById('store-platform-appeal-reason').textContent,
    status:document.getElementById('store-platform-appeal-status').getAttribute('role'),
    live:document.getElementById('store-platform-appeal-status').getAttribute('aria-live'),
    enabled:!document.querySelector('#store-platform-appeal-form button').disabled
  })`)
  assert.equal(ui.reason,"Platform karar gerekçesi: "+reason)
  assert.equal(ui.status,"status")
  assert.equal(ui.live,"polite")
  assert.equal(ui.enabled,true)
  // Add B as the genuine second protected Gamma Owner only AFTER all foreign
  // Staff/Owner denial checks. This reuses the later fixture's same membership
  // and never relaxes any production Owner-protection or Staff permission.
  const [secondOwnerMembership]=await foundation.createMemberships([{
    organization_id:ownerOrgId,person_id:staffPersonId,
    role:"owner",status:"active",protected_owner:true
  }])
  assert.match(secondOwnerMembership.id,/^[A-Za-z0-9_-]+$/)
  assert.notEqual(staffPersonId,ownerPersonId)
  const newlyProtected=await read(staff,mailPath)
  assert.equal(newlyProtected.status,200)
  assert.equal(newlyProtected.body?.protected_owner_count,2)
  assert.ok([1,2].includes(newlyProtected.body?.private_receipt_count),
    "Promoted protected Owner must never receive a forged original receipt; scheduled reconciliation may add a legitimate one")
  assert.equal(newlyProtected.body?.mandatory_email_verified,false)
  assert.equal(newlyProtected.body?.deadline_started,false)
  const appealReason="B22 sentetik yetkili Owner kapatma kararına itiraz ediyor"
  await browser.input("#store-platform-appeal-form textarea[name=reason]",appealReason)
  await browser.click("#store-platform-appeal-form button")
  await browser.wait("document.getElementById('store-platform-appeal-status').textContent.includes('İtiraz kaydedildi')")
  const appealed=await read(browser,readPath)
  assert.equal(appealed.status,200)
  assert.equal(appealed.body?.state,"appealed")
  assert.equal(appealed.body?.appeal_reason,appealReason)
  assert.equal(appealed.body?.deadline_started,false)
  assert.equal(appealed.body?.permanent_finalization_enabled,false)
  const appealNotices=await read(browser,"/personal/notifications?organization="+
    encodeURIComponent(ownerOrgId))
  assert.equal(appealNotices.status,200)
  const appealNotice=appealNotices.body.notifications?.find((x:any)=>
    x.title==="Mağaza kapatma itirazı kaydedildi")
  assert.ok(appealNotice,"Owner must receive a real private appeal receipt")
  assert.match(appealNotice.description,/Şirketinizin mağazası için itiraz kaydedildi/)
  assert.equal(appealNotice.description.includes("itirazınız kaydedildi"),false,
    "The actor-neutral message must not tell a co-Owner they made the appeal")
  assert.match(appealNotice.description,/yeni satışlar kapalı kalır/)
  assert.equal(appealNotice.description.includes("Mevcut faal mağazalar etkilenmez"),false)
  assert.equal(JSON.stringify(appealNotices.body).includes(appealReason),false)
  const appealRecipients=await q(`select n.person_id,n.id
    from da_notification_receipt n
    join da_audit_event e on e.id=n.audit_event_id
    where e.organization_id=$1 and e.target_id=$2
      and e.action='organization.store_platform_closing_appealed'
    order by n.person_id`,[ownerOrgId,sellerId])
  assert.equal(appealRecipients.length,2,
    "One genuine appeal must create exactly two private protected-Owner receipts")
  assert.deepEqual(new Set(appealRecipients.map((row:any)=>row.person_id)),
    new Set([ownerPersonId,staffPersonId]))
  assert.equal(appealRecipients.some((row:any)=>
    row.person_id===ownerPersonId&&row.id===appealNotice.id),true)
  const otherOwnerNotices=await read(staff,"/personal/notifications?organization="+
    encodeURIComponent(ownerOrgId))
  assert.equal(otherOwnerNotices.status,200,
    "Second protected Owner must read their own private appeal receipt over HTTPS")
  const otherOwnerAppeal=otherOwnerNotices.body.notifications?.find((x:any)=>
    x.title==="Mağaza kapatma itirazı kaydedildi")
  assert.ok(otherOwnerAppeal,"Non-appealing Owner must receive the same neutral notice")
  assert.equal(otherOwnerAppeal.description,appealNotice.description)
  assert.notEqual(otherOwnerAppeal.id,appealNotice.id,
    "Owners receive separate private receipts for the same canonical event")
  assert.equal(appealRecipients.some((row:any)=>
    row.person_id===staffPersonId&&row.id===otherOwnerAppeal.id),true)
  assert.equal(JSON.stringify(otherOwnerNotices.body).includes(appealReason),false)
  assert.equal(JSON.stringify(otherOwnerNotices.body).includes(reason),false)
  await browser.click("#notification-bell")
  await browser.wait("!document.getElementById('notification-panel').hidden && "+
    "document.getElementById('notification-list').textContent.includes('yeni satışlar kapalı kalır')")
  assert.equal(await browser.eval(
    "Array.from(document.querySelectorAll('#notification-list li')).some("+
    "li=>li.querySelector('h3')?.textContent==='Mağaza kapatma itirazı kaydedildi' && "+
    "li.querySelector('p')?.textContent.includes('Mevcut faal mağazalar etkilenmez'))"),false)
  await browser.click("#notification-close")
  // A's real Chrome UI has just displayed the notice. B did not submit
  // the appeal: their separate authenticated Chrome must display the SAME
  // impersonal description, never a forged action attribution or reason.
  await staff.send("Page.bringToFront")
  await staff.send("Page.reload",{ignoreCache:true})
  await staff.wait("document.readyState==='complete'&&!document.getElementById('workspace').hidden")
  await staff.select(ownerOrgName,"owner")
  await staff.click("#notification-bell")
  await staff.wait("!document.getElementById('notification-panel').hidden && "+
    "document.getElementById('notification-list').textContent.includes('Şirketinizin mağazası için itiraz kaydedildi')")
  const secondOwnerUi=await staff.eval(`(()=>{
    const item=Array.from(document.querySelectorAll('#notification-list li'))
      .find(li=>li.querySelector('h3')?.textContent==='Mağaza kapatma itirazı kaydedildi');
    return item?{text:item.textContent,description:item.querySelector('p')?.textContent}:null;
  })()`)
  assert.ok(secondOwnerUi)
  assert.match(secondOwnerUi.description,/Şirketinizin mağazası için itiraz kaydedildi/)
  assert.equal(secondOwnerUi.description.includes("itirazınız kaydedildi"),false)
  assert.equal(secondOwnerUi.text.includes(appealReason),false)
  assert.equal(secondOwnerUi.text.includes(reason),false)
  await staff.click("#notification-close")
  await browser.send("Page.bringToFront")
  await browser.wait("document.visibilityState==='visible'")
  assert.equal(await count(),auditBefore+2)
  const [ledger]=await q(`select version,request_id,appeal_request_id,
    started_at,appealed_at from da_store_platform_closing where seller_id=$1`,[sellerId])
  assert.equal(ledger.version,2)
  assert.equal(ledger.request_id,requestId)
  assert.match(ledger.appeal_request_id,/^dapa_[a-f0-9]{32}$/)
  assert.ok(ledger.appealed_at&&ledger.started_at)
  const appealReplay=await write(browser,privatePath,{
    organization_id:ownerOrgId,seller_id:sellerId,
    request_id:ledger.appeal_request_id,expected_version:1,reason:appealReason})
  assert.equal(appealReplay.status,200)
  assert.equal(appealReplay.body.replayed,true)
  assert.equal((await write(browser,privatePath,{
    organization_id:ownerOrgId,seller_id:sellerId,
    request_id:"dapa_"+randomBytes(16).toString("hex"),
    expected_version:1,reason:appealReason})).status,409)
  assert.equal((await q("select count(*)::int n from da_store_platform_closing where seller_id=$1",
    [sellerId]))[0].n,1)
  assert.equal(await count(),auditBefore+2)
  assert.equal(await foundation.storeOwnerPauseAcceptingOrders([sellerId]),false,
    "Appeal does not re-enable sales or release the Store name")
  const appealedCatalog=await read(buyer,catalogPage)
  assert.equal(appealedCatalog.status,200)
  assert.equal(appealedCatalog.body?.stores?.some((store:any)=>store.id===sellerId),false,
    "Owner appeal must not restore Gamma to the real Buyer HTTPS catalogue")
  assert.equal(await foundation.authorizeBuyerCheckout(
    checkoutCartId,customerId,[sellerId]),false,
    "Owner appeal must not re-enable the final Buyer L")
  assert.equal(Number((await q('select count(*)::int n from "order"'))[0].n),orderBefore)
  assert.deepEqual((await q("select id,status,name,handle from seller where id=$1",
    [sellerId]))[0],before)
  // Isolated synthetic sent-link record: this proves the real Owner HTTPS
  // callback, NOT SMTP transport or mailbox delivery. Scheduled job and
  // four-send retry require their own actual execution evidence.
  const emailToken=randomBytes(32).toString("hex")
  const tokenDigest=createHash("sha256").update(emailToken).digest("hex")
  const visitPath="/personal/store-platform-closing-email-visit"
  const queue=await q(`select person_id,attempts from da_store_platform_closing_email
    where seller_id=$1 and person_id=$2`,[sellerId,ownerPersonId])
  assert.equal(queue.length,1,"Closing must create exactly one Owner mail queue row")
  await q(`insert into da_store_platform_closing_email_link
    (seller_id,person_id,attempt,token_sha256) values ($1,$2,4,$3)`,
    [sellerId,ownerPersonId,tokenDigest])
  assert.equal((await read(browser,visitPath)).status,401,
    "GET scanner cannot activate or disclose the email link")
  assert.equal((await write(staff,visitPath,{token:emailToken})).status,403,
    "Another protected Owner must not use the first Owner's link")
  assert.equal((await write(browser,visitPath,{token:emailToken},true)).status,403,
    "Forged CSRF cannot confirm notification")
  assert.equal((await write(browser,visitPath,{token:randomBytes(32).toString("hex")})).status,403,
    "Unrecognized random link must reveal no closure")
  const proof=await write(browser,visitPath,{token:emailToken})
  assert.equal(proof.status,200)
  assert.equal(proof.body?.viewed,true)
  assert.equal(proof.body?.reason,reason)
  assert.equal(proof.body?.deadline_started,true)
  const clockRows=await q(`select deadline_started_at,deadline_basis,
    admin_alert_at from da_store_platform_closing where seller_id=$1`,[sellerId])
  assert.equal(clockRows.length,1)
  assert.equal(clockRows[0].deadline_basis,"owner_delivery")
  assert.equal(clockRows[0].admin_alert_at,null)
  assert.ok(clockRows[0].deadline_started_at)
  const originalStart=new Date(clockRows[0].deadline_started_at).toISOString()
  const deadlineAudit=await q(`select e.id,e.new_values
    from da_audit_event e join da_audit_outbox x
      on x.source_audit_event_id=e.id
      and x.source_module='dogruadres-access' and x.deleted_at is null
    where e.organization_id=$1 and e.target_id=$2
      and e.action='organization.store_platform_closing_deadline_started'
      and e.resource='store-platform-closing'
      and e.role_context='owner' and e.deleted_at is null
      and e.new_values->>'basis'='owner_delivery'
      and (e.new_values->>'deadline_started_at')::timestamptz=$3::timestamptz`,
      [ownerOrgId,sellerId,originalStart])
  assert.equal(deadlineAudit.length,1,
    "Owner delivery clock and one canonical Foundation audit/outbox must commit together")
  assert.equal(JSON.stringify(deadlineAudit).includes(emailToken),false,
    "Email link secret must not be copied to Foundation audit")
  assert.equal(JSON.stringify(deadlineAudit).includes(reason),false,
    "Private closing reason must not be copied to Foundation audit")
  const secondVisit=await write(browser,visitPath,{token:emailToken})
  assert.equal(secondVisit.status,200,"Same authorized Owner may reread notice")
  assert.equal((await q(`select deadline_started_at from da_store_platform_closing
    where seller_id=$1`,[sellerId]))[0].deadline_started_at.toISOString(),originalStart,
    "Revisiting must not restart 10+20 appeal time")
  const auditedReplays=await q(`select count(*)::int as n
    from da_audit_event where organization_id=$1 and target_id=$2
      and action='organization.store_platform_closing_deadline_started'
      and deleted_at is null`,[ownerOrgId,sellerId])
  assert.equal(Number(auditedReplays[0].n),1,
    "Replaying the Owner link must not create a duplicate deadline audit")
  const during=await read(browser,readPath)
  assert.equal(during.status,200)
  assert.equal(during.body.deadline_started,true)
  assert.equal(during.body.deadline_basis,"owner_delivery")
  assert.equal(new Date(during.body.first_appeal_until).getTime()-
    new Date(during.body.deadline_started_at).getTime(),10*86400000)
  assert.equal(new Date(during.body.final_review_until).getTime()-
    new Date(during.body.deadline_started_at).getTime(),30*86400000)
  assert.equal(during.body.permanent_finalization_enabled,false)
  const deliveryStatus=await read(staff,mailPath)
  assert.equal(deliveryStatus.status,200)
  assert.equal(deliveryStatus.body.mailbox_delivery_verified_count,1)
  assert.equal(deliveryStatus.body.deadline_started,true)
  assert.equal(deliveryStatus.body.deadline_basis,"owner_delivery")
  assert.equal(deliveryStatus.body.smtp_accepted_count,
    deliveryStatus.body.email_statuses.filter((x:any)=>x.smtp_accepted===true).length,
    "An Owner link visit must not erase an earlier SMTP acceptance or fabricate one")
  assert.equal(deliveryStatus.body.email_statuses.some((x:any)=>x.link_visited_at),true)
  assert.equal(JSON.stringify(deliveryStatus.body).includes(emailToken),false)
  assert.equal(JSON.stringify(deliveryStatus.body).includes(reason),false)
  // A delayed fourth email-slot result must not add an admin alert or
  // restart an already-proved Owner-delivery clock.
  await q(`update da_store_platform_closing_email
    set attempts=4,last_result='delivered',claim_id=null,lease_until=null,
      next_attempt_at=clock_timestamp()-interval '1 hour'
    where seller_id=$1 and person_id=$2 and delivered_at is not null`,
    [sellerId,ownerPersonId])
  assert.equal(await foundation.settlePlatformClosingAdminFallback(),0,
    "Exhaustion must not override a previously started Owner-delivery clock")
  const lateAdminNotices=await q(`select count(*)::int as n
    from da_store_platform_closing_admin_notice where seller_id=$1`,[sellerId])
  assert.equal(Number(lateAdminNotices[0].n),0,
    "No bogus admin failure notification after verified Owner delivery")
  assert.equal((await q(`select deadline_started_at from da_store_platform_closing
    where seller_id=$1`,[sellerId]))[0].deadline_started_at.toISOString(),originalStart,
    "Delayed email worker must never reset the canonical appeal clock")
  assert.equal(await foundation.storeOwnerPauseAcceptingOrders([sellerId]),false)
  assert.equal(await foundation.authorizeBuyerCheckout(checkoutCartId,customerId,[sellerId]),false)
  assert.equal(Number((await q('select count(*)::int n from "order"'))[0].n),orderBefore)
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: synthetic hashed email link strong Owner POST, foreign/forged CSRF/scanner GET denied, 10+20 server clock starts once, no finalizer or sales reopening\n")
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: independent strong platform closing Staff stops sales, protected Owner sees private reason and submits real UI appeal; wrong Staff/Owner/CSRF/replay rejected, audit/outbox and Owner receipt durable, no timer/mail delivery proven at this checkpoint and no finalization/native Order changes; Beta Buyer HTTPS catalogue Gamma visible-to-hidden, read-only Cart mapping unchanged, final L false, no OrderGroup/Order/payment; closing and appeal notification texts verified; two separate protected Owner Person sessions show actor-neutral appeal receipts in HTTPS/Chrome, no private reason; platform Staff Chrome verified Owner email 1, native ambiguous mapping 0/restored 1/revoked proof 0, 1-to-2 Owners during scheduled receipt reconciliation, no delivery/timer at this checkpoint, foreign denied\n")
  return secondOwnerMembership.id
}
