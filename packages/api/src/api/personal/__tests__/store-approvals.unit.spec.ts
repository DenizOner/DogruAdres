import {GET,POST} from "../platform/stores/route"
import {access,csrf,enabled,sessionToken} from "../security"
import {approveSellerWorkflow} from "@mercurjs/core/workflows"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
jest.mock("@mercurjs/core/workflows",()=>({approveSellerWorkflow:jest.fn()}))

describe("B22 platform Store approval guard",()=>{
  const candidate={application_id:"daapp_"+"a".repeat(32),
    seller_id:"sel_example",organization_id:"daorg_example",organization_name:"Organization"}
  let service:any,native:any,req:any,res:any,run:any
  beforeEach(()=>{
    jest.resetAllMocks()
    service={
      personalReviewableStoreApplications:jest.fn().mockResolvedValue([candidate]),
      personalUnresolvedStoreReactivationClaim:jest.fn().mockResolvedValue({status:"none"}),
      personalCurrentSuspendedStoreName:jest.fn().mockResolvedValue({status:"eligible"}),
      personalWithStoreApprovalStaffLock:jest.fn(async(_token:string,_target:any,
        operation:(context:any)=>Promise<unknown>)=>operation({}))
    }
    native={listSellers:jest.fn().mockResolvedValue([{
      id:candidate.seller_id,name:"Store",status:"pending_approval",approved_at:null
    }])}
    run=jest.fn().mockResolvedValue({})
    ;(approveSellerWorkflow as unknown as jest.Mock).mockReturnValue({run})
    ;(access as jest.Mock).mockReturnValue(service)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    req={body:{application_id:candidate.application_id,seller_id:candidate.seller_id},
      query:{},headers:{},scope:{resolve:(key:string)=>key==="seller"?native:null}}
    res={setHeader:jest.fn(),status:jest.fn(),json:jest.fn()}
    res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  })
  it("forbids a Person with no explicit staff grant before native reads",async()=>{
    service.personalReviewableStoreApplications.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(native.listSellers).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it("rejects missing CSRF even for staff",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.personalReviewableStoreApplications).not.toHaveBeenCalled()
  })
  it("cannot approve a Store with an unapproved native status",async()=>{
    native.listSellers.mockResolvedValue([{id:candidate.seller_id,status:"open",approved_at:null}])
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(run).not.toHaveBeenCalled()
  })
  it("calls native Mercur approval only for matching persisted application",async()=>{
    native.listSellers.mockResolvedValueOnce([{id:candidate.seller_id,status:"pending_approval",approved_at:null}])
      .mockResolvedValueOnce([{id:candidate.seller_id,status:"pending_approval",approved_at:null}])
      .mockResolvedValueOnce([{id:candidate.seller_id,status:"open",approved_at:new Date()}])
    await POST(req,res)
    expect(service.personalReviewableStoreApplications).toHaveBeenCalledWith("opaque",req.body)
    expect(service.personalWithStoreApprovalStaffLock).toHaveBeenCalledWith(
      "opaque",req.body,expect.any(Function))
    expect(run).toHaveBeenCalledWith({input:{seller_id:candidate.seller_id}})
    expect(res.status).toHaveBeenCalledWith(200)
  })
  it("requires a separate Staff approval for each of two Stores of the same Organization",async()=>{
    const second={...candidate,application_id:"daapp_"+"b".repeat(32),seller_id:"sel_other"}
    const applicants=[candidate,second]
    const sellers=new Map([
      [candidate.seller_id,{id:candidate.seller_id,name:"First Store",status:"pending_approval",approved_at:null as Date|null}],
      [second.seller_id,{id:second.seller_id,name:"Second Store",status:"pending_approval",approved_at:null as Date|null}]
    ])
    service.personalReviewableStoreApplications.mockImplementation(async(_token:string,target:any)=>
      applicants.filter(app=>app.application_id===target.application_id&&app.seller_id===target.seller_id))
    native.listSellers.mockImplementation(async({id}:{id:string})=>{
      const seller=sellers.get(id)
      return seller?[{...seller}]:[]
    })
    run.mockImplementation(async({input}:{input:{seller_id:string}})=>{
      const seller=sellers.get(input.seller_id)
      if(!seller)throw new Error("Unexpected Seller")
      seller.status="open"
      seller.approved_at=new Date("2026-11-17T00:00:00.000Z")
      return {}
    })

    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      application_id:candidate.application_id,seller_id:candidate.seller_id,status:"open"
    })
    expect(sellers.get(candidate.seller_id)?.status).toBe("open")
    expect(sellers.get(second.seller_id)?.status).toBe("pending_approval")
    expect(sellers.get(second.seller_id)?.approved_at).toBeNull()
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenNthCalledWith(1,{input:{seller_id:candidate.seller_id}})

    res.status.mockClear();res.json.mockClear()
    req.body={application_id:second.application_id,seller_id:second.seller_id}
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      application_id:second.application_id,seller_id:second.seller_id,status:"open"
    })
    expect(sellers.get(candidate.seller_id)?.status).toBe("open")
    expect(sellers.get(second.seller_id)?.status).toBe("open")
    expect(sellers.get(second.seller_id)?.approved_at).toBeInstanceOf(Date)
    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenNthCalledWith(2,{input:{seller_id:second.seller_id}})
    expect(service.personalWithStoreApprovalStaffLock).toHaveBeenNthCalledWith(
      1,"opaque",{application_id:candidate.application_id,seller_id:candidate.seller_id},expect.any(Function))
    expect(service.personalWithStoreApprovalStaffLock).toHaveBeenNthCalledWith(
      2,"opaque",{application_id:second.application_id,seller_id:second.seller_id},expect.any(Function))
  })
  it("rejects a swapped application/Seller pair and second Staff revocation before either native approval",async()=>{
    const second={...candidate,application_id:"daapp_"+"b".repeat(32),seller_id:"sel_other"}
    service.personalReviewableStoreApplications.mockImplementation(async(_token:string,target:any)=>
      target.application_id===second.application_id&&target.seller_id===second.seller_id?[second]:
      target.application_id===candidate.application_id&&target.seller_id===candidate.seller_id?[candidate]:null)
    req.body={application_id:candidate.application_id,seller_id:second.seller_id}
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(native.listSellers).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()

    res.status.mockClear();res.json.mockClear()
    req.body={application_id:second.application_id,seller_id:second.seller_id}
    native.listSellers.mockResolvedValue([{
      id:second.seller_id,name:"Second Store",status:"pending_approval",approved_at:null
    }])
    service.personalWithStoreApprovalStaffLock.mockResolvedValueOnce(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({message:"Access denied"})
    expect(run).not.toHaveBeenCalled()
  })
  it("does not call native Mercur when Staff revoke wins before locked final check",async()=>{
    service.personalWithStoreApprovalStaffLock.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(run).not.toHaveBeenCalled()
  })
  it("hides pending Store identities without staff and never queries native",async()=>{
    service.personalReviewableStoreApplications.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(native.listSellers).not.toHaveBeenCalled()
  })
  it("rejects invalid page before staff and native reads",async()=>{
    req.query={page:"-1"}
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalReviewableStoreApplications).not.toHaveBeenCalled()
  })
  it("marks a suspended Store whose name/URL entitlement is no longer provable as review-only",async()=>{
    native.listSellers.mockResolvedValue([{id:candidate.seller_id,name:"Suspended Store",
      status:"suspended",approved_at:new Date()}])
    service.personalCurrentSuspendedStoreName.mockResolvedValue({status:"conflict"})
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(service.personalCurrentSuspendedStoreName).toHaveBeenCalledWith(
      "opaque",{application_id:candidate.application_id,seller_id:candidate.seller_id})
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      suspended:[{...candidate,name:"Suspended Store",name_review_required:true}]
    }))
    expect(run).not.toHaveBeenCalled()
  })
  it("lists suspended Store as reopenable only after its current name and URL are verified",async()=>{
    native.listSellers.mockResolvedValue([{id:candidate.seller_id,name:"Suspended Store",
      status:"suspended",approved_at:new Date()}])
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      suspended:[{...candidate,name:"Suspended Store",name_review_required:false}]
    }))
    expect(run).not.toHaveBeenCalled()
  })
  it("omits suspended Store details when the staff entitlement check loses authorization",async()=>{
    native.listSellers.mockResolvedValue([{id:candidate.seller_id,name:"Suspended Store",
      status:"suspended",approved_at:new Date()}])
    service.personalCurrentSuspendedStoreName.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({suspended:[]}))
    expect(run).not.toHaveBeenCalled()
  })
  it("lists only native pending Stores to authorized reviewer",async()=>{
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({pending:[{...candidate,name:"Store"}],suspended:[],reconciliation:[],release_pending:[],page:0,has_more:true})
  })
})
