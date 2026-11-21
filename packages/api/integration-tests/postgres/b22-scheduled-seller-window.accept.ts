/** Task-only real HTTPS/PG16 closure interval acceptance. No production DB. */
import assert from "node:assert/strict"
type Rows=(sql:string,params?:any[])=>Promise<any[]>

export async function verifyB22ScheduledSellerWindow(input:{
  q:Rows;get:(url:string)=>Promise<any>;
  catalogUrl:(org:string)=>string;
  organizationId:string;ownerStoreId:string;secondOwnerStoreId:string;
  auditBefore:number
}):Promise<void>{
  const {q,get,catalogUrl,organizationId,ownerStoreId,secondOwnerStoreId,
    auditBefore}=input
    // #296 P2: real authorized Buyer HTTPS catalogue and native PostgreSQL
    // Seller schedule agree before, during and after a bounded closure.
    // This is a disposable Store fixture; no public checkout is enabled.
    const [scheduleOriginal]=await q(
      "select closed_from,closed_to from seller where id=$1",[ownerStoreId])
    assert.ok(scheduleOriginal,"Task-owned Seller schedule required")
    const setSchedule=async(from:Date,to:Date)=>{
      const updated=await q(`update seller set closed_from=$2,closed_to=$3
        where id=$1 returning id`,[ownerStoreId,from,to])
      assert.equal(updated.length,1)
    }
    const readScheduled=async(shouldShow:boolean)=>{
      const response=await get(catalogUrl(organizationId))
      assert.equal(response.status,200,"Authorized Buyer scope stays valid")
      assert.equal(response.body.checkout_ready,false,
        "Scheduled visibility never enables public checkout")
      assert.equal(response.body.stores.some((x:any)=>x.id===ownerStoreId),
        shouldShow,"HTTPS Buyer catalogue must obey native closed interval")
      assert.equal(response.body.stores.some((x:any)=>x.id===secondOwnerStoreId),
        true,"Unrelated approved Seller must remain visible")
    }
    const scheduleNow=Date.now()
    const at=(offset:number)=>new Date(scheduleNow+offset)
    try{
      await setSchedule(at(1200000),at(2400000))
      await readScheduled(true)   // Before scheduled closure
      await setSchedule(at(-1200000),at(1200000))
      await readScheduled(false)  // During scheduled closure
      await setSchedule(at(-2400000),at(-1200000))
      await readScheduled(true)   // After scheduled reopening
      await setSchedule(at(1200000),at(-1200000))
      await readScheduled(false)  // Invalid reversed native schedule fails closed
    }finally{
      const restored=await q(`update seller
        set closed_from=$2,closed_to=$3 where id=$1
        returning closed_from,closed_to`,
        [ownerStoreId,scheduleOriginal.closed_from,scheduleOriginal.closed_to])
      assert.equal(restored.length,1)
      assert.deepEqual(restored[0],scheduleOriginal,
        "Restore exact task-only Seller closure timestamps")
    }
    assert.equal((await q(
      "select count(*)::int n from da_audit_event"))[0].n,auditBefore,
      "Schedule reads must never create an audit")
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: planned native Seller closure Buyer catalogue before=visible, during=hidden, after=visible, reversed=hidden; unrelated Store visible, original PG16 schedule restored, no audit or checkout\n")
}
