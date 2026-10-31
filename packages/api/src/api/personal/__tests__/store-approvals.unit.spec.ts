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
  it("lists only native pending Stores to authorized reviewer",async()=>{
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({pending:[{...candidate,name:"Store"}],page:0,has_more:true})
  })
})
