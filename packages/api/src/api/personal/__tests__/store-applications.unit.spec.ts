import {POST} from "../store-applications/route"
import {GET as reviewStoreGET,POST as reviewStorePOST} from "../platform/stores/route"
import {access,csrf,enabled,sessionToken} from "../security"
import {createSellerAccountWorkflow,terminateSellerWorkflow,approveSellerWorkflow,unsuspendSellerWorkflow} from "@mercurjs/core/workflows"
jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
jest.mock("@mercurjs/core/workflows",()=>({
  createSellerAccountWorkflow:jest.fn(),
  terminateSellerWorkflow:jest.fn(),
  approveSellerWorkflow:jest.fn(),
  unsuspendSellerWorkflow:jest.fn()
}))
describe("B22 protected Owner Store application gate",()=>{
  const data={organization_id:"daorg_a",application_id:"daapp_"+"a".repeat(32),
    name:"Owner Store",email:"owner@example.invalid",currency_code:"try"}
  let req:any,res:any,svc:any,run:any,native:any
  beforeEach(()=>{
    jest.resetAllMocks()
    svc={
      personalPrepareStoreApplicationFromDraft:jest.fn().mockResolvedValue({
        ...data,draft_id:"dasdraft_"+"b".repeat(32),draft_version:2
      }),
      reserveStoreApplication:jest.fn().mockResolvedValue({status:"reserved"}),
      claimStoreApplication:jest.fn().mockResolvedValue({
        member_id:"mem_a",member_auth_identity_id:"auth_a"}),
      finishStoreApplication:jest.fn().mockResolvedValue({seller_id:"sel_a"}),
      personalWithStoreApplicationOwnerLock:jest.fn(async(_t:string,_d:any,
        action:(ctx:any)=>Promise<unknown>)=>action({}))
    }
    run=jest.fn().mockResolvedValue({result:{id:"sel_a",status:"pending_approval",approved_at:null}})
    native={listMembers:jest.fn().mockResolvedValue([{id:"mem_a",is_active:true}])}
    ;(createSellerAccountWorkflow as unknown as jest.Mock).mockReturnValue({run})
    ;(access as jest.Mock).mockReturnValue(svc)
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    req={body:{...data},headers:{},scope:{resolve:jest.fn(()=>native)}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis()}
  })
  it("creates one native pending Seller with same Foundation manager",async()=>{
    await POST(req,res)
    expect(svc.claimStoreApplication).toHaveBeenCalledWith("opaque",data)
    expect(svc.personalWithStoreApplicationOwnerLock).toHaveBeenCalledWith(
      "opaque",data,expect.any(Function))
    expect(run).toHaveBeenCalledWith({input:{
      auth_identity_id:"auth_a",member_id:"mem_a",
      seller:{name:data.name,email:data.email,currency_code:"try"}
    }})
    expect(svc.finishStoreApplication).toHaveBeenCalledWith("opaque",data,"sel_a",expect.any(Object))
    expect(res.status).toHaveBeenCalledWith(201)
  })
  it("rejects an already reserved normalized name before any native Seller write",async()=>{
    svc.reserveStoreApplication.mockResolvedValue({status:"name_taken"})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      message:"Store name unavailable; choose another name"
    })
    expect(svc.claimStoreApplication).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it.each(["ab","12345","123 456","Example.com","Example.io",
    "https://example.io","www.example.net","Alpha Ltd. Şti.","Example Şti.",
    "\u200B\u200B\u200B","\u00AD\u00AD\u00AD","Mar\u200Dket",
    "Market\u2060 Store","Ab\u034Fcd"])(
    "rejects objectively invalid Store name %s before reservation",async name=>{
      req.body.name=name
      await POST(req,res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(svc.reserveStoreApplication).not.toHaveBeenCalled()
      expect(run).not.toHaveBeenCalled()
    })
  it.each(["Çiçek Dükkânı","مكتبة عربية","👩‍💻 Shop","❤️ Shop"])(
    "keeps a visible multilingual or emoji Store name valid: %s",async name=>{
      req.body.name=name
      await POST(req,res)
      expect(res.status).toHaveBeenCalledWith(201)
      expect(run).toHaveBeenCalledTimes(1)
    })
  it("blocks historical unverified name claims before native Seller creation",async()=>{
    svc.reserveStoreApplication.mockResolvedValue({status:"name_unverified"})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(svc.claimStoreApplication).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it("does not invoke native workflow after protected Owner revoke wins the lock",async()=>{
    svc.personalWithStoreApplicationOwnerLock.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(run).not.toHaveBeenCalled()
    expect(svc.finishStoreApplication).not.toHaveBeenCalled()
  })
  it("does not open Seller when the native Member becomes inactive",async()=>{
    native.listMembers.mockResolvedValue([])
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(run).not.toHaveBeenCalled()
  })
  it("does not create a second Seller on replay of an already-created application",async()=>{
    svc.reserveStoreApplication.mockResolvedValue({status:"created",seller_id:"sel_old"})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(svc.claimStoreApplication).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it("treats a native success followed by Foundation failure as uncertain, never retries",async()=>{
    svc.finishStoreApplication.mockRejectedValue(new Error("DB failure"))
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({message:"Outcome uncertain; check application status"})
    expect(run).toHaveBeenCalledTimes(1)
  })
  it("uses ONLY persisted draft fields for the native Seller, not browser-supplied values",async()=>{
    const input={action:"submit_draft",organization_id:data.organization_id,
      application_id:data.application_id,draft_id:"dasdraft_"+"b".repeat(32),
      expected_version:2}
    req.body={...input}
    await POST(req,res)
    expect(svc.personalPrepareStoreApplicationFromDraft).toHaveBeenCalledWith("opaque",input)
    expect(svc.reserveStoreApplication).toHaveBeenCalledWith("opaque",{
      ...data,draft_id:input.draft_id,draft_version:2
    })
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({input:{
      auth_identity_id:"auth_a",member_id:"mem_a",
      seller:{name:data.name,email:data.email,currency_code:"try"}
    }})
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      application_id:data.application_id,draft_id:input.draft_id,
      status:"pending_approval"
    }))
  })
  it("rejects stale draft before reservation or native Seller workflow",async()=>{
    req.body={action:"submit_draft",organization_id:data.organization_id,
      application_id:data.application_id,draft_id:"dasdraft_"+"b".repeat(32),
      expected_version:1}
    svc.personalPrepareStoreApplicationFromDraft.mockResolvedValue({conflict:true})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(svc.reserveStoreApplication).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it("rejects non-Owner/expired MFA and foreign drafts without any native write",async()=>{
    req.body={action:"submit_draft",organization_id:data.organization_id,
      application_id:data.application_id,draft_id:"dasdraft_"+"b".repeat(32),
      expected_version:2}
    svc.personalPrepareStoreApplicationFromDraft.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(svc.reserveStoreApplication).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it("stops a different reservation for the same submitted draft",async()=>{
    req.body={action:"submit_draft",organization_id:data.organization_id,
      application_id:data.application_id,draft_id:"dasdraft_"+"b".repeat(32),
      expected_version:2}
    svc.reserveStoreApplication.mockResolvedValue({status:"conflict"})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(svc.claimStoreApplication).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

})

/** Native Mercur remains the Seller lifecycle authority. These are targeted
 * handler contracts; real HTTPS/native-PG16 proof is tracked separately.
 */
describe("B22 platform staff reasoned pending Store rejection",()=>{
  const target={application_id:"daapp_"+"a".repeat(32),seller_id:"sel_pending_a"}
  const reason="Synthetic policy rejection for this pending application"
  let req:any,res:any,svc:any,native:any,terminateRun:any,approveRun:any
  let seller:{id:string;status:string;approved_at:null|string;status_reason:null|string}
  beforeEach(()=>{
    jest.resetAllMocks()
    seller={id:target.seller_id,status:"pending_approval",approved_at:null,status_reason:null}
    svc={
      personalReviewableStoreApplications:jest.fn().mockResolvedValue([{
        ...target,organization_id:"daorg_a",organization_name:"Test Org",on_hold:true
      }]),
      personalWithStoreApprovalStaffLock:jest.fn(async(_t:string,_a:any,cb:(ctx:any)=>Promise<unknown>)=>cb({})),
      personalRecordStoreApplicationRejection:jest.fn().mockResolvedValue({status:"rejected"})
    }
    native={listSellers:jest.fn(async()=>[{...seller}])}
    terminateRun=jest.fn(async({input}:any)=>{
      seller.status="terminated";seller.status_reason=input.reason
    })
    approveRun=jest.fn()
    ;(terminateSellerWorkflow as unknown as jest.Mock).mockReturnValue({run:terminateRun})
    ;(approveSellerWorkflow as unknown as jest.Mock).mockReturnValue({run:approveRun})
    ;(access as jest.Mock).mockReturnValue(svc)
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    req={body:{...target,action:"reject",reason},headers:{},
      scope:{resolve:jest.fn(()=>native)}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis()}
  })
  it("rejects pending Seller with reason while application policy is paused",async()=>{
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({...target,status:"rejected"})
    expect(svc.personalWithStoreApprovalStaffLock).toHaveBeenCalledWith(
      "opaque",{...target,decision:"reject"},expect.any(Function))
    expect(terminateRun).toHaveBeenCalledTimes(1)
    expect(terminateRun).toHaveBeenCalledWith({input:{seller_id:target.seller_id,reason}})
    expect(svc.personalRecordStoreApplicationRejection).toHaveBeenCalledWith(
      "opaque",{...target,reason},expect.any(Object))
    expect(approveRun).not.toHaveBeenCalled()
  })
  it("does not approve while a company has paused new Store applications",async()=>{
    req.body={...target}
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(terminateRun).not.toHaveBeenCalled()
    expect(approveRun).not.toHaveBeenCalled()
  })
  it("denies revoked staff, wrong target and current open Seller before native workflow",async()=>{
    svc.personalReviewableStoreApplications.mockResolvedValueOnce(null)
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(terminateRun).not.toHaveBeenCalled()
    res.status.mockClear()
    svc.personalReviewableStoreApplications.mockResolvedValue([{
      ...target,organization_id:"daorg_a",on_hold:true
    }])
    seller.status="open"
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(terminateRun).not.toHaveBeenCalled()
  })
  it("denies invalid CSRF and missing reason with zero writes",async()=>{
    ;(csrf as jest.Mock).mockResolvedValueOnce(false)
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    res.status.mockClear()
    req.body.reason="too short"
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(terminateRun).not.toHaveBeenCalled()
    expect(svc.personalRecordStoreApplicationRejection).not.toHaveBeenCalled()
  })
  it("does not repeat native terminate after canonical Foundation failure",async()=>{
    svc.personalRecordStoreApplicationRejection.mockRejectedValue(new Error("synthetic DB rollback"))
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      message:"Outcome uncertain; check approval status"
    })
    expect(terminateRun).toHaveBeenCalledTimes(1)
    // A second direct request observes native TERMINATED before any workflow.
    res.status.mockClear()
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(terminateRun).toHaveBeenCalledTimes(1)
  })
})


/** New Store reactivation shares the existing private Staff/Owner-origin
 * contract, but must not elevate a native seller or reuse a transferred name.
 * Full Chrome/PG16 acceptance remains a separate gate.
 */
describe("B22 Staff reopens only a suspended Store with retained name rights",()=>{
  const target={application_id:"daapp_"+"a".repeat(32),seller_id:"sel_suspended_a"}
  const name="B22 Existing Store",handle="b22-existing-store"
  let req:any,res:any,svc:any,native:any,run:any
  let seller:{id:string;name:string;handle:string;status:string;
    status_reason:string|null;approved_at:string|null}
  beforeEach(()=>{
    jest.resetAllMocks()
    seller={id:target.seller_id,name,handle,status:"suspended",
      approved_at:"2026-11-01T00:00:00.000Z",status_reason:"Task-only suspension"}
    svc={
      personalReviewableStoreApplications:jest.fn().mockResolvedValue([{
        ...target,organization_id:"daorg_a",organization_name:"Org A",on_hold:true
      }]),
      personalWithStoreApprovalStaffLock:jest.fn(async(_token:string,_target:any,
        fn:(ctx:any)=>Promise<any>)=>fn({})),
      personalCurrentSuspendedStoreName:jest.fn().mockResolvedValue({
        status:"eligible",organization_id:"daorg_a",name,handle
      }),
      personalClaimStoreReactivation:jest.fn().mockResolvedValue({
        status:"claimed",claim_audit_id:"daaud_claim_one"
      }),
      personalUnresolvedStoreReactivationClaim:jest.fn().mockResolvedValue({
        status:"claimed",claim_audit_id:"daaud_claim_one",
        organization_id:"daorg_a",name,handle
      }),
      personalRecordStoreReactivation:jest.fn().mockResolvedValue({status:"recorded"}),
      personalReleaseSuspendedStoreReactivationClaim:jest.fn().mockResolvedValue({status:"released",claim_audit_id:"daaud_claim_one"})
    }
    native={listSellers:jest.fn(async()=>[{...seller}])}
    run=jest.fn(async()=>{
      seller.status="open";seller.status_reason=null
    })
    ;(unsuspendSellerWorkflow as unknown as jest.Mock).mockReturnValue({run})
    ;(access as jest.Mock).mockReturnValue(svc)
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    req={body:{...target,action:"unsuspend"},headers:{},
      query:{page:0},scope:{resolve:jest.fn(()=>native)}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis()}
  })
  it("reopens one native suspended Seller without changing identity, name, handle or approval",async()=>{
    const before={...seller}
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({...target,action:"unsuspend",status:"open"})
    expect(svc.personalWithStoreApprovalStaffLock).toHaveBeenCalledWith(
      "opaque",{...target,decision:"unsuspend"},expect.any(Function))
    expect(svc.personalCurrentSuspendedStoreName).toHaveBeenCalledWith(
      "opaque",target,expect.any(Object))
    expect(svc.personalClaimStoreReactivation).toHaveBeenCalledWith(
      "opaque",{...target,organization_id:"daorg_a",name,handle},expect.any(Object))
    expect(svc.personalUnresolvedStoreReactivationClaim).toHaveBeenCalledWith(
      "opaque",target,expect.any(Object))
    expect(svc.personalWithStoreApprovalStaffLock).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({input:{seller_id:target.seller_id}})
    expect(svc.personalRecordStoreReactivation).toHaveBeenCalledWith(
      "opaque",{...target,organization_id:"daorg_a",name,handle,
        claim_audit_id:"daaud_claim_one"},expect.any(Object))
    expect({...seller, status:"suspended",status_reason:before.status_reason}).toEqual(before)
    res.status.mockClear()
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(run).toHaveBeenCalledTimes(1)
  })
  it("denies revoked platform Staff before a native change",async()=>{
    svc.personalWithStoreApprovalStaffLock.mockResolvedValue(null)
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(run).not.toHaveBeenCalled()
  })
  it("denies a non-Staff or unlinked application before any native call",async()=>{
    svc.personalReviewableStoreApplications.mockResolvedValue(null)
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(run).not.toHaveBeenCalled()
  })
  it("blocks transferred/unverified name even for formerly approved Seller",async()=>{
    svc.personalCurrentSuspendedStoreName.mockResolvedValue({status:"conflict"})
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(run).not.toHaveBeenCalled()
    expect(svc.personalRecordStoreReactivation).not.toHaveBeenCalled()
  })
  it.each(["open","terminated","pending_approval"])(
    "refuses unsafe Seller status %s without reopening",async status=>{
      seller.status=status
      await reviewStorePOST(req,res)
      expect(res.status).toHaveBeenCalledWith(409)
      expect(run).not.toHaveBeenCalled()
    })
  it("requires strict action schema, CSRF and no native seller header",async()=>{
    ;(csrf as jest.Mock).mockResolvedValueOnce(false)
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    req.headers={"x-seller-id":target.seller_id}
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    req.headers={}
    req.body={...req.body,name:"Forged Seller Name"}
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(run).not.toHaveBeenCalled()
  })
  it("never reports success after a post-native Foundation audit failure",async()=>{
    svc.personalRecordStoreReactivation.mockRejectedValueOnce(Error("task DB rollback"))
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      message:"Outcome uncertain; check approval status"
    })
    expect(run).toHaveBeenCalledTimes(1)
    expect(svc.personalClaimStoreReactivation).toHaveBeenCalledTimes(1)
    res.status.mockClear()
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(run).toHaveBeenCalledTimes(1)
    // The authorized Staff can only complete the durable claim; no native
    // action is retried after a failed Foundation audit/outbox transaction.
    req.body={...target,action:"reconcile"}
    res.status.mockClear()
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({...target,action:"reconcile",status:"open"})
    expect(svc.personalCurrentSuspendedStoreName).toHaveBeenCalledWith(
      "opaque",{...target,expected_status:"open"},expect.any(Object))
    expect(run).toHaveBeenCalledTimes(1)
    expect(svc.personalClaimStoreReactivation).toHaveBeenCalledTimes(1)
    // A completed claim is no longer eligible.
    svc.personalUnresolvedStoreReactivationClaim.mockResolvedValue({status:"none"})
    res.status.mockClear()
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(run).toHaveBeenCalledTimes(1)
  })
  it("fails closed if the durable claim cannot be committed before native",async()=>{
    svc.personalClaimStoreReactivation.mockRejectedValue(Error("pre-native outbox failure"))
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(run).not.toHaveBeenCalled()
    expect(svc.personalRecordStoreReactivation).not.toHaveBeenCalled()
  })
  it("lists only source-proven incomplete open Store claims to authorized Staff",async()=>{
    seller.status="open"
    svc.personalReviewableStoreApplications.mockImplementation(async(_t:any,_x:any,_c:any,page=0)=>
      page>0?[]:[{...target,organization_id:"daorg_a",organization_name:"Org A",on_hold:false}])
    await reviewStoreGET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      pending:[],suspended:[],release_pending:[],reconciliation:[{...target,organization_id:"daorg_a",
        organization_name:"Org A",name,on_hold:false}],
      page:0,has_more:false
    })
    svc.personalUnresolvedStoreReactivationClaim.mockResolvedValue({status:"none"})
    res.status.mockClear()
    await reviewStoreGET(req,res)
    expect(res.json).toHaveBeenCalledWith({
      pending:[],suspended:[],release_pending:[],reconciliation:[],page:0,has_more:false
    })
  })
  it("offers a safe terminal release only for a source-proven suspended claim",async()=>{
    svc.personalReviewableStoreApplications.mockImplementation(async(_token:any,
      _target:any,_ctx:any,page=0)=>page>0?[]:[{
        ...target,organization_id:"daorg_a",organization_name:"Org A",on_hold:true
      }])
    await reviewStoreGET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      pending:[],suspended:[],reconciliation:[],
      release_pending:[{...target,organization_id:"daorg_a",
        organization_name:"Org A",name,on_hold:true}],
      page:0,has_more:false
    })
    res.status.mockClear()
    req.body={...target,action:"release"}
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({...target,status:"suspended",action:"release"})
    expect(svc.personalWithStoreApprovalStaffLock).toHaveBeenCalledWith(
      "opaque",{...target,decision:"release"},expect.any(Function))
    expect(svc.personalReleaseSuspendedStoreReactivationClaim).toHaveBeenCalledWith(
      "opaque",target,expect.any(Object))
    expect(run).not.toHaveBeenCalled()
    expect(svc.personalClaimStoreReactivation).not.toHaveBeenCalled()
    svc.personalReleaseSuspendedStoreReactivationClaim.mockResolvedValue({status:"conflict"})
    res.status.mockClear()
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(run).not.toHaveBeenCalled()
  })
  it("never releases a pending claim while native Seller is already open",async()=>{
    seller.status="open"
    req.body={...target,action:"release"}
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(svc.personalReleaseSuspendedStoreReactivationClaim).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it("forbids cross-Organization, missing Staff/CSRF or forged release",async()=>{
    req.body={...target,action:"release"}
    svc.personalReviewableStoreApplications.mockResolvedValueOnce(null)
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    res.status.mockClear()
    ;(csrf as jest.Mock).mockResolvedValueOnce(false)
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    res.status.mockClear()
    req.body={...req.body,organization_id:"daorg_foreign"}
    await reviewStorePOST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(run).not.toHaveBeenCalled()
    expect(svc.personalReleaseSuspendedStoreReactivationClaim).not.toHaveBeenCalled()
  })
  it("lists suspended and pending applications separately and privately",async()=>{
    svc.personalUnresolvedStoreReactivationClaim.mockResolvedValue({status:"none"})
    svc.personalReviewableStoreApplications.mockImplementation(async(_token:any,
      _target:any,_ctx:any,page=0)=>page>0?[]:[{
        ...target,organization_id:"daorg_a",organization_name:"Org A",on_hold:false
      }])
    await reviewStoreGET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      pending:[],reconciliation:[],release_pending:[],suspended:[{...target,organization_id:"daorg_a",
        organization_name:"Org A",name,on_hold:false}],
      page:0,has_more:false
    })
  })
})
