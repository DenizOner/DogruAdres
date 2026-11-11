/** B22 #252: real first-party Chrome/HTTPS/PG16 platform closing and Owner
 * appeal. Task-only actors and database. No SMTP success, timer or finalizer.
 */
import assert from "node:assert/strict"
import {randomBytes} from "node:crypto"
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
  checkoutCartId:string;customerId:string;query:any
}):Promise<string>{
  const {browser,staff,q,foundation,ownerPersonId,staffPersonId,
    ownerOrgId,ownerOrgName,sellerId,buyer,buyerScopePath,
    buyerOrganizationId,checkoutCartId,customerId,query}=input
  const path="/personal/platform/store-closings"
  const privatePath="/personal/store-platform-closing"
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
  const requestId="dascp_"+randomBytes(16).toString("hex")
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
  let found=false
  for(let page=0;page<50;page++){
    const list=await read(staff,path+"?page="+page)
    assert.equal(list.status,200,"Strong independently authorized Staff lists Stores")
    assert.ok(Array.isArray(list.body?.candidates))
    if(list.body.candidates.some((x:any)=>
      x.organization_id===ownerOrgId&&x.seller_id===sellerId)){found=true;break}
    if(list.body.has_more!==true)break
  }
  assert.equal(found,true,"Existing approved source Store must remain accessible in Staff pagination")
  const count=async()=>Number((await q(`select count(*)::int n from da_audit_event
    where resource='store-platform-closing' and target_id=$1`,[sellerId]))[0].n)
  const auditBefore=await count()
  assert.equal((await write(staff,path,{
    organization_id:ownerOrgId,seller_id:sellerId,request_id:requestId,reason},true)).status,403,
    "Forged CSRF must not create a closure")
  assert.equal(await count(),auditBefore)
  const created=await write(staff,path,{
    organization_id:ownerOrgId,seller_id:sellerId,request_id:requestId,reason})
  assert.equal(created.status,200)
  assert.equal(created.body?.status,"notification_unverified")
  assert.equal(created.body?.deadline_started,false)
  assert.equal(created.body?.mandatory_email_verified,false)
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
  assert.match(closureNotice.description,/süre henüz başlamadı/)
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
  assert.match(appealNotice.description,/Şirketinizin mağazası için bir kapatma itirazı kaydedildi/)
  assert.equal(appealNotice.description.includes("itirazınız kaydedildi"),false,
    "The actor-neutral message must not tell a co-Owner they made the appeal")
  assert.match(appealNotice.description,/yeni satışlar kapalıdır/)
  assert.match(appealNotice.description,/süre henüz başlamadı/)
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
    "document.getElementById('notification-list').textContent.includes('yeni satışlar kapalıdır')")
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
    "document.getElementById('notification-list').textContent.includes('Şirketinizin mağazası için bir kapatma itirazı kaydedildi')")
  const secondOwnerUi=await staff.eval(`(()=>{
    const item=Array.from(document.querySelectorAll('#notification-list li'))
      .find(li=>li.querySelector('h3')?.textContent==='Mağaza kapatma itirazı kaydedildi');
    return item?{text:item.textContent,description:item.querySelector('p')?.textContent}:null;
  })()`)
  assert.ok(secondOwnerUi)
  assert.match(secondOwnerUi.description,/Şirketinizin mağazası için bir kapatma itirazı kaydedildi/)
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
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: independent strong platform closing Staff stops sales, protected Owner sees private reason and submits real UI appeal; wrong Staff/Owner/CSRF/replay rejected, audit/outbox and Owner receipt durable, no timer/email/finalization/native Order changes; Beta Buyer HTTPS catalogue Gamma visible-to-hidden, read-only Cart mapping unchanged, final L false, no OrderGroup/Order/payment; closing and appeal notification texts verified; two separate protected Owner Person sessions show actor-neutral appeal receipts in HTTPS/Chrome, no private reason\n")
  return secondOwnerMembership.id
}
