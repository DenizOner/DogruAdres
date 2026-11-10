/**
 * #252/#244 — target-only historical order reader acceptance.
 * Reuses the existing disposable native Mercur zero-total OrderGroup and the
 * two already authenticated real Chrome Person/Customer sessions.
 * Never creates/completes an order, initiates payment or writes permissions.
 */
import assert from "node:assert/strict"
import type {B06Chrome} from "./b06-ui-browser"

type DbRows=(sql:string,values?:unknown[])=>Promise<any[]>
const readOnlyScript=
  "async function(org,id){"+
  "const p=new URLSearchParams({organization_id:org,order_group_id:id});"+
  "const r=await fetch('/personal/order-groups?'+p.toString(),{cache:'no-store'});"+
  "return {status:r.status,body:await r.json(),"+
  "cache:r.headers.get('cache-control'),vary:r.headers.get('vary'),"+
  "robots:r.headers.get('x-robots-tag')};}"

const countAudit=async(q:DbRows,org:string)=>{
  const rows=await q("select count(*)::int n from da_audit_event where organization_id=$1",[org])
  assert.equal(rows.length,1)
  return Number(rows[0].n)
}

export async function verifyB22OwnedHistoricalOrder(input:{
  buyer:B06Chrome;buyerOrg:{id:string;name:string};orderGroupId:string;
  nativeCustomerId:string;cartId:string;q:DbRows
}):Promise<void>{
  const {buyer,buyerOrg,orderGroupId,nativeCustomerId,cartId,q}=input
  assert.match(orderGroupId,/^og_[A-Za-z0-9_-]+$/)
  assert.match(nativeCustomerId,/^cus_[A-Za-z0-9_-]+$/)
  const before=await countAudit(q,buyerOrg.id)
  const result=await buyer.callFunction(readOnlyScript,buyerOrg.id,orderGroupId)
  assert.equal(result.status,200,"The real authorized Buyer must read own historical OrderGroup")
  assert.match(result.cache??"",/no-store/)
  assert.equal(result.vary,"Cookie")
  assert.equal(result.robots,"noindex, nofollow, noarchive")
  assert.equal(result.body?.organization_id,buyerOrg.id)
  const group=result.body?.order_group
  assert.equal(group?.id,orderGroupId)
  assert.ok(Number.isSafeInteger(group.display_id)&&group.display_id>0)
  assert.ok(Array.isArray(group.orders)&&group.orders.length===1)
  const order=group.orders[0]
  assert.match(order.id,/^order_[A-Za-z0-9_-]+$/)
  assert.ok(Number.isSafeInteger(order.display_id)&&order.display_id>0)
  assert.ok(Array.isArray(order.items)&&order.items.length===1)
  assert.ok(typeof order.items[0].title==="string"&&order.items[0].title.length>0)
  assert.equal(order.items[0].quantity,1)
  const raw=JSON.stringify(result.body)
  for(const privateValue of [nativeCustomerId,cartId,"payment_collection","shipping_address",
    "auth_identity_id","csrf_token","metadata","source_audit_event_id"])
    assert.equal(raw.includes(privateValue),false,
      "The reader must not expose a hidden Customer/Cart/payment/address field")
  assert.equal(await countAudit(q,buyerOrg.id),before,
    "Read-only order detail cannot write audit records")

  // A genuine browser interaction, not a mocked DOM event or direct API call.
  await buyer.send("Page.bringToFront")
  await buyer.wait("document.visibilityState==='visible'")
  await buyer.select(buyerOrg.name,"owner")
  await buyer.wait("!document.getElementById('buyer-context-panel').hidden")
  const control=await buyer.eval(`(()=>{
    const input=document.querySelector('#buyer-order-lookup input[name=order_group_id]');
    const form=document.getElementById('buyer-order-lookup');
    const status=document.getElementById('buyer-order-status');
    return {label:input?.labels?.[0]?.textContent?.trim()??'',
      required:input?.required===true,form:!!form,status:status?.getAttribute('role'),
      live:status?.getAttribute('aria-live')}
  })()`)
  assert.match(control.label,/Sipariş grubu kodu/)
  assert.equal(control.required,true)
  assert.equal(control.form,true)
  assert.equal(control.status,"status")
  assert.equal(control.live,"polite")
  const tree=await buyer.send("Accessibility.getFullAXTree")
  assert.ok(tree.nodes.some((node:any)=>
    String(node.name?.value??"").includes("Sipariş grubu kodu")),
    "Real Chrome accessibility tree must expose the order code label")
  await buyer.input("#buyer-order-lookup input[name=order_group_id]",orderGroupId)
  // Use the already proven Chrome CDP keyboard path: focus the native
  // submit button and activate it with Space. No synthetic .onsubmit() calls.
  const focused=await buyer.eval(`(()=>{
    const button=document.querySelector('#buyer-order-lookup button[type=submit]');
    if(!button)return false;button.focus();
    return document.activeElement===button;
  })()`)
  assert.equal(focused,true,"Real keyboard must focus the order submit button")
  await buyer.send("Input.dispatchKeyEvent",{
    type:"keyDown",key:" ",code:"Space",text:" ",windowsVirtualKeyCode:32
  })
  await buyer.send("Input.dispatchKeyEvent",{
    type:"keyUp",key:" ",code:"Space",windowsVirtualKeyCode:32
  })
  try{
    await buyer.wait("document.getElementById('buyer-order-status').textContent.includes('Bu kuruluşa ait geçmiş sipariş doğrulandı.')")
  }catch{
    const phase=await buyer.eval(`(()=>{
      const s=document.getElementById('buyer-order-status')?.textContent??'';
      const input=document.querySelector('#buyer-order-lookup input[name=order_group_id]');
      return {status:s.includes('doğrulandı')?'success':
        s.includes('Sipariş bulunamadı')?'denied':
        s.includes('denetleniyor')?'pending':s?'other':'empty',
        formValid:input?.checkValidity()===true,
        rendered:document.querySelectorAll('#buyer-order-items li').length>0};
    })()`)
    const httpStatuses=buyer.http.filter((r:any)=>r.path==="/personal/order-groups")
      .slice(-3).map((r:any)=>r.status)
    throw Error("B22 order UI did not show private result: "+
      JSON.stringify({status:phase.status,formValid:phase.formValid,
        rendered:phase.rendered,httpStatuses}))
  }
  const ui=await buyer.eval(`(()=>{
    const root=document.getElementById('buyer-order-items');
    const status=document.getElementById('buyer-order-status');
    return {status:status.textContent,items:root.querySelectorAll('li').length,
      text:root.textContent}
  })()`)
  assert.ok(ui.items>=2,"Visible order and its item must render")
  assert.ok(ui.text.includes(order.items[0].title))
  assert.ok(ui.text.includes("1 adet"))
  assert.ok(!ui.text.includes(nativeCustomerId)&&!ui.text.includes(cartId))
  assert.equal(await countAudit(q,buyerOrg.id),before)
  process.stdout.write("PASS B22 Chrome: OrderGroup history HTTPS/PG16 verified Buyer reads own zero-value completed OrderGroup, keyboard Space and accessible label/status render private minimal items; no audit writes\n")
}

export async function verifyB22ForeignHistoricalOrder(input:{
  other:B06Chrome;buyerOrgId:string;orderGroupId:string;
  otherCustomerId:string;ownerCustomerId:string;q:DbRows
}):Promise<void>{
  const {other,buyerOrgId,orderGroupId,otherCustomerId,ownerCustomerId,q}=input
  assert.match(otherCustomerId,/^cus_[A-Za-z0-9_-]+$/)
  assert.notEqual(otherCustomerId,ownerCustomerId,
    "This must be a genuinely distinct verified native Customer")
  const before=await countAudit(q,buyerOrgId)
  const result=await other.callFunction(readOnlyScript,buyerOrgId,orderGroupId)
  assert.equal(result.status,403,
    "Another real, verified Customer cannot read a foreign Buyer's OrderGroup")
  assert.deepEqual(result.body,{message:"Access denied"})
  assert.match(result.cache??"",/no-store/)
  assert.equal(result.vary,"Cookie")
  assert.equal(result.robots,"noindex, nofollow, noarchive")
  assert.equal(JSON.stringify(result.body).includes(orderGroupId),false)
  assert.equal(JSON.stringify(result.body).includes(ownerCustomerId),false)
  assert.equal(await countAudit(q,buyerOrgId),before)
  process.stdout.write("PASS B22 Chrome: OrderGroup history HTTPS/PG16 unrelated verified native Customer denied foreign Buyer OrderGroup 403, generic body, no audit writes\n")
}
