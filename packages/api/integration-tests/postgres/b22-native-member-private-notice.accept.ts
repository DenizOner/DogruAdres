/** B22 #252: Owner-B private notice after real native SellerMember UI link.
 * Reuse existing B22 native Member/Owner browser and disposable PG16.
 * Synthetic protected-Owner fixture is NOT a real Owner promotion API.
 * Exported from a narrow test-only helper to keep the established B22
 * full runner under TypeScript's control-flow source-size limit.
 */
import assert from "node:assert/strict"
import type {B06Chrome} from "./b06-ui-browser"

export async function verifyB22CoownerNativeMemberReadback(input:{
  browser:B06Chrome;reviewer:B06Chrome;
  q:(sql:string,params?:any[])=>Promise<any[]>;
  personA:string;personB:string;memberMembershipId:string;
  orgA:string;orgB:string;orgName:string;ownerStoreId:string;emailA:string;
}):Promise<void>{
  const {browser,reviewer,q,personA,personB,memberMembershipId,
    orgA,orgB,orgName,ownerStoreId,emailA}=input
  // #252 second Owner after REAL native SellerMember association:
  // the approved Owner UI above established B's actual Member/Seller
  // link. At this point B remains an ordinary Organization Member. This
  // task-owned PG16 role fixture is NOT an Owner-promotion product API.
  const privateClosing=async(actor:B06Chrome,orgId:string)=>
    actor.callFunction("async function(org,seller){"+
      "const r=await fetch('/personal/store-owner-closing?'+new URLSearchParams("+
      "{organization_id:org,seller_id:seller}),{cache:'no-store'});"+
      "return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}}",
      orgId,ownerStoreId)
  const ownerMembership=await q("select id,role,status,protected_owner,revoked_at "+
    "from da_organization_membership where id=$1 and person_id=$2 "+
    "and organization_id=$3 and deleted_at is null",
    [memberMembershipId,personB,orgA])
  assert.equal(ownerMembership.length,1)
  assert.equal(ownerMembership[0].role,"member")
  assert.equal(ownerMembership[0].protected_owner,false)
  assert.equal(ownerMembership[0].status,"active")
  assert.equal(ownerMembership[0].revoked_at,null)
  const firstNotice=await privateClosing(browser,orgA)
  assert.equal(firstNotice.status,200)
  assert.equal(firstNotice.body.state,"withdrawn",
    "Read the latest canonical withdrawal, not the older SMTP-accepted event")
  assert.equal(firstNotice.body.permanent_finalization_enabled,false)
  const latestEvent=await q("select source_audit_event_id from da_store_owner_closing "+
    "where seller_id=$1 and organization_id=$2 and state='withdrawn'",
    [ownerStoreId,orgA])
  assert.equal(latestEvent.length,1)
  const receipts=await q("select person_id from da_notification_receipt "+
    "where audit_event_id=$1 order by person_id",[latestEvent[0].source_audit_event_id])
  assert.deepEqual(receipts.map((r:any)=>r.person_id).sort(),
    [personA,personB].sort())
  // Native SellerMember alone never grants Owner-private notification access.
  const memberOnly=await privateClosing(reviewer,orgA)
  assert.deepEqual({status:memberOnly.status,body:memberOnly.body},
    {status:403,body:{message:"Access denied"}})
  assert.equal((await privateClosing(reviewer,orgB)).status,403)
  const elevated=await q("update da_organization_membership "+
    "set role='owner',protected_owner=true,updated_at=clock_timestamp() "+
    "where id=$1 and person_id=$2 and role='member' "+
    "and protected_owner=false and status='active' and revoked_at is null "+
    "returning id",[memberMembershipId,personB])
  assert.deepEqual(elevated,[{id:memberMembershipId}])
  try{
    const own=await privateClosing(reviewer,orgA)
    assert.equal(own.status,200,
      "Live protected Owner AND real native SellerMember must authorize own state")
    assert.deepEqual(own.body.email_notice,{
      status:"queued",attempts:0,smtp_accepted:false,
      mailbox_delivery_verified:false
    },"B must see only the latest own queued receipt, not A's older synthetic accepted SMTP result")
    assert.deepEqual(own.body.notification_coverage,{
      protected_owners:2,personal_receipts:2,mailbox_delivery_verified:false
    })
    assert.equal(own.body.state,"withdrawn")
    assert.equal(own.body.permanent_finalization_enabled,false)
    assert.equal(own.body.can_withdraw,false)
    assert.ok(String(own.cache).includes("no-store"))
    assert.equal(JSON.stringify(own.body).includes(emailA),false)
    assert.equal(JSON.stringify(own.body).includes("message_id"),false)
    assert.equal(JSON.stringify(own.body).includes("person_id"),false)
    assert.equal((await privateClosing(reviewer,orgB)).status,403,
      "Cross-Organization Store-private result must stay denied after promotion")
    // Real authenticated Chrome UI, not a helper-forged Owner response.
    await reviewer.send("Page.bringToFront")
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("!document.getElementById('workspace').hidden")
    await reviewer.select(orgName,"owner")
    await reviewer.wait("!document.getElementById('store-owner-closing-panel').hidden && "+
      "Array.from(document.querySelectorAll("+
      "'#store-owner-pause-form select[name=seller_id] option')).some("+
      "o=>o.value==="+JSON.stringify(ownerStoreId)+")")
    await reviewer.eval("(()=>{const s=document.querySelector("+
      "'#store-owner-pause-form select[name=seller_id]');s.value="+
      JSON.stringify(ownerStoreId)+";s.dispatchEvent(new Event('change',"+
      "{bubbles:true}));return true})()")
    await reviewer.wait("document.getElementById('store-owner-closing-status')."+
      "textContent.includes('Kapatma talebi geri çekildi.') && "+
      "document.getElementById('store-owner-closing-status')."+
      "textContent.includes('Korunan Owner bildirim kayıtları: 2/2') && "+
      "document.getElementById('store-owner-closing-status')."+
      "textContent.includes('Kişisel bildirim kaydedildi; e-posta denemesi sırada.')")
    const textShown=await reviewer.eval(
      "document.getElementById('store-owner-closing-status').textContent")
    assert.equal(textShown.includes(emailA),false)
    assert.equal(textShown.includes("Message-ID"),false)
    assert.equal(await reviewer.eval(
      "document.getElementById('store-owner-closing-status').getAttribute('role')"),
      "status")
    const firstAfter=await privateClosing(browser,orgA)
    assert.equal(firstAfter.status,200)
    assert.deepEqual(firstAfter.body.email_notice,firstNotice.body.email_notice,
      "A's individual SMTP status/attempts remain unchanged by B's Owner read")
    assert.equal(firstAfter.body.state,firstNotice.body.state)
    assert.equal(firstAfter.body.seller_id,firstNotice.body.seller_id)
    assert.equal(firstAfter.body.permanent_finalization_enabled,false)
    assert.deepEqual(firstAfter.body.notification_coverage,{
      protected_owners:2,personal_receipts:2,mailbox_delivery_verified:false
    },"Aggregate count must reflect newly protected B, never reveal B's private attempts")
    assert.equal(JSON.stringify(firstAfter.body).includes(emailA),false)
    assert.equal(JSON.stringify(firstAfter.body).includes("message_id"),false)
  }finally{
    const restoredRole=await q("update da_organization_membership "+
      "set role=$2,protected_owner=$3,revoked_at=$4,"+
      "updated_at=clock_timestamp() where id=$1 returning id",
      [memberMembershipId,ownerMembership[0].role,
        ownerMembership[0].protected_owner,ownerMembership[0].revoked_at])
    assert.deepEqual(restoredRole,[{id:memberMembershipId}])
    const revokedRead=await privateClosing(reviewer,orgA)
    assert.deepEqual({status:revokedRead.status,body:revokedRead.body},
      {status:403,body:{message:"Access denied"}},
      "Loss of protected Owner membership instantly denies a live SellerMember")
    await reviewer.send("Page.bringToFront")
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("!document.getElementById('workspace').hidden")
    await reviewer.select(orgName,"member")
    // Restore the visible ordinary-Member product workspace before the
    // existing downstream UI acceptance clicks its native draft refresh.
    // A role label alone does not establish that the real panel has rendered.
    await reviewer.wait("!document.getElementById('product-draft-panel').hidden && "+
      "(()=>{const b=document.getElementById('product-draft-refresh');"+
      "if(!b)return false;const r=b.getBoundingClientRect();"+
      "return r.width>0&&r.height>0})()")
  }
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: second Person native SellerMember linked through Owner UI; member GET403, test-only protected Owner GET200 own queued receipt and 2/2 coverage, foreign Org403, reversible role removal GET403 and no mailbox delivery/finalizer\n")
}
