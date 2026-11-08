import {POST} from "../store-applications/route"
import {access,csrf,enabled,sessionToken} from "../security"
import {createSellerAccountWorkflow} from "@mercurjs/core/workflows"
jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
jest.mock("@mercurjs/core/workflows",()=>({createSellerAccountWorkflow:jest.fn()}))
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
