import {POST} from "../store-member-connections/route"
import {addSellerMemberWorkflow} from "@mercurjs/core/workflows"
import {SellerRole} from "@mercurjs/types"
import {access,csrf,enabled,sessionToken} from "../security"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
jest.mock("@mercurjs/core/workflows",()=>({addSellerMemberWorkflow:jest.fn()}))
describe("B22 Owner-scoped native Store membership activation",()=>{
  const data={organization_id:"daorg_a",seller_id:"sel_a",membership_id:"damem_a"}
  let svc:any,native:any,req:any,res:any,run:any
  beforeEach(()=>{
    jest.resetAllMocks()
    svc={personalWithStoreMemberConnectionLock:jest.fn(async(_t:string,_d:any,fn:any)=>
      fn("mem_a",{}))}
    native={
      listMembers:jest.fn().mockResolvedValue([{id:"mem_a",is_active:true}]),
      listSellers:jest.fn().mockResolvedValue([{id:"sel_a",status:"open",approved_at:"2026-11-06"}]),
      listSellerMembers:jest.fn().mockResolvedValue([])
    }
    run=jest.fn().mockResolvedValue({result:{
      seller_id:"sel_a",member_id:"mem_a",is_owner:false,role_id:SellerRole.SUPPORT
    }})
    ;(addSellerMemberWorkflow as unknown as jest.Mock).mockReturnValue({run})
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(access as jest.Mock).mockReturnValue(svc)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    req={body:{...data},query:{},headers:{},scope:{resolve:jest.fn(()=>native)}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis()}
  })
  it("denies unauthenticated or forged native context before workflow",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    req.headers["x-seller-id"]="sel_foreign"
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(svc.personalWithStoreMemberConnectionLock).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it("rejects foreign context and actor injected in the browser",async()=>{
    req.body.actor_id="mem_foreign"
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    expect(run).not.toHaveBeenCalled()
  })
  it("does not call native workflow if Foundation Owner/grant/binding gate denies",async()=>{
    svc.personalWithStoreMemberConnectionLock.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(run).not.toHaveBeenCalled()
  })
  it("rejects inactive native Member and unapproved Store",async()=>{
    native.listMembers.mockResolvedValue([])
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    native.listMembers.mockResolvedValue([{id:"mem_a",is_active:true}])
    native.listSellers.mockResolvedValue([{id:"sel_a",status:"suspended",approved_at:"2026-11-06"}])
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(run).not.toHaveBeenCalled()
  })
  it("uses native workflow once and confirms exact persisted non-owner link",async()=>{
    native.listSellerMembers.mockResolvedValueOnce([]).mockResolvedValueOnce([{
      seller_id:"sel_a",member_id:"mem_a",is_owner:false,role_id:SellerRole.SUPPORT
    }])
    await POST(req,res)
    expect(svc.personalWithStoreMemberConnectionLock).toHaveBeenCalledWith(
      "opaque",data,expect.any(Function))
    expect(run).toHaveBeenCalledWith({input:{
      seller_id:"sel_a",member_id:"mem_a",role_id:SellerRole.SUPPORT
    }})
    expect(res.status).toHaveBeenLastCalledWith(201)
    expect(res.json).toHaveBeenLastCalledWith({status:"connected"})
  })
  it("idempotent existing correct link never invokes a second native write",async()=>{
    native.listSellerMembers.mockResolvedValue([{
      seller_id:"sel_a",member_id:"mem_a",is_owner:false,role_id:SellerRole.SUPPORT
    }])
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(run).not.toHaveBeenCalled()
  })
  it("refuses an elevated or owner native role rather than silently replacing it",async()=>{
    native.listSellerMembers.mockResolvedValue([{
      seller_id:"sel_a",member_id:"mem_a",is_owner:true,role_id:SellerRole.SELLER_ADMINISTRATION
    }])
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(run).not.toHaveBeenCalled()
  })
  it("native workflow uncertainty is 503, no automatic retry",async()=>{
    run.mockRejectedValue(new Error("uncertain"))
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
