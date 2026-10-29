import { access, enabled, sessionToken } from "../security"
import { GET } from "../organization-stores/route"

jest.mock("../security", () => ({
  access: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe("B22 platform-approved Organization Store read (route boundary, mock-only)", () => {
  const organization="daorg_A", token="fixture-opaque-session", person="daprs_A", member="mem_A"
  let req: any, res: any, svc: any, native: any
  const permit=(ids:string[])=>({person_id:person,organization_id:organization,seller_ids:ids})
  beforeEach(()=>{
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)
    svc={
      personalLegalSellerIds:jest.fn().mockResolvedValue(permit(["sel_A"])),
      personalActorBinding:jest.fn().mockResolvedValue({person_id:person,actor_id:member,revoked_at:null}),
    }
    native={
      listMembers:jest.fn().mockResolvedValue([{id:member,is_active:true}]),
      listSellerMembers:jest.fn().mockResolvedValue([{member_id:member,seller_id:"sel_A"}]),
      listSellers:jest.fn().mockResolvedValue([{id:"sel_A",name:"A Store",status:"open",approved_at:"2026-10-29T00:00:00Z",email:"private@example.invalid"}])
    }
    ;(access as jest.Mock).mockReturnValue(svc)
    req={query:{organization},headers:{},scope:{resolve:jest.fn((key:string)=>{
      if(key!=="seller")throw Error("unexpected module")
      return native
    })}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis()}
  })

  it("reads only platform-approved Store with live native Member and relation; omits private fields",async()=>{
    await GET(req,res)
    expect(svc.personalLegalSellerIds).toHaveBeenNthCalledWith(1,token,organization)
    expect(svc.personalLegalSellerIds).toHaveBeenCalledTimes(2)
    expect(native.listSellerMembers).toHaveBeenCalledWith({member_id:member,seller_id:"sel_A"})
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
    expect(res.json).toHaveBeenCalledWith({organization_id:organization,stores:[{id:"sel_A",name:"A Store"}]})
  })

  it.each([
    {query:{organization,extra:"true"},headers:{}},
    {query:{organization:"foreign"},headers:{}},
    {query:{organization},headers:{"x-seller-id":"sel_injected"}}
  ])("rejects client-supplied extra scope and forged Seller selection",async ({query,headers})=>{
    req.query=query;req.headers=headers
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(svc.personalLegalSellerIds).not.toHaveBeenCalled()
    expect(native.listSellers).not.toHaveBeenCalled()
  })

  it("rejects foreign/absent Organization authorization before native reads",async()=>{
    svc.personalLegalSellerIds.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(req.scope.resolve).not.toHaveBeenCalled()
  })

  it("rejects unverified or revoked native person binding",async()=>{
    svc.personalActorBinding.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(req.scope.resolve).not.toHaveBeenCalled()
  })

  it("never infers a Store from SellerMember without a platform association",async()=>{
    svc.personalLegalSellerIds.mockResolvedValue(permit([]))
    await GET(req,res)
    expect(native.listSellers).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({organization_id:organization,stores:[]})
  })

  it("excludes inactive/suspended or inaccessible Stores",async()=>{
    svc.personalLegalSellerIds.mockResolvedValue(permit(["sel_A","sel_B"]))
    native.listSellerMembers.mockImplementation(async ({seller_id}:any)=>seller_id==="sel_A"?[{member_id:member,seller_id}]:[])
    native.listSellers.mockImplementation(async ({id}:any)=>id==="sel_A"?[{id,name:"A",status:"open",approved_at:"2026-10-29T00:00:00Z"}]:[{id,name:"B",status:"suspended"}])
    await GET(req,res)
    expect(res.json).toHaveBeenCalledWith({organization_id:organization,stores:[{id:"sel_A",name:"A"}]})
  })

  it("never renders Store whose status is OPEN but native approval was never recorded",async()=>{
    native.listSellers.mockResolvedValue([{id:"sel_A",name:"Unapproved",status:"open",approved_at:null}])
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({organization_id:organization,stores:[]})
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("Unapproved")
  })

  it("rejects Store response if approval is cleared between initial and final native checks",async()=>{
    native.listSellers.mockResolvedValueOnce([{id:"sel_A",name:"A Store",status:"open",approved_at:"2026-10-29T00:00:00Z"}])
      .mockResolvedValueOnce([{id:"sel_A",name:"A Store",status:"open",approved_at:null}])
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({stores:expect.any(Array)}))
  })

  it("rejects when Organization association changes before final response",async()=>{
    svc.personalLegalSellerIds.mockResolvedValueOnce(permit(["sel_A"])).mockResolvedValueOnce(permit(["sel_B"]))
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({stores:expect.any(Array)}))
  })

  it("denies a Store read when native Member is revoked during final revalidation",async()=>{
    native.listMembers.mockResolvedValueOnce([{id:member,is_active:true}]).mockResolvedValueOnce([])
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({stores:expect.any(Array)}))
  })

  it("denies Store response when SellerMember relation is revoked after the initial read",async()=>{
    native.listSellerMembers.mockResolvedValueOnce([{member_id:member,seller_id:"sel_A"}]).mockResolvedValueOnce([])
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it("denies Store response when the native Seller is suspended after the initial read",async()=>{
    native.listSellers.mockResolvedValueOnce([{id:"sel_A",name:"A Store",status:"open",approved_at:"2026-10-29T00:00:00Z"}])
      .mockResolvedValueOnce([{id:"sel_A",name:"A Store",status:"suspended",approved_at:"2026-10-29T00:00:00Z"}])
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it("denies when the verified native Member binding is revoked during the read",async()=>{
    svc.personalActorBinding.mockResolvedValueOnce({person_id:person,actor_id:member,revoked_at:null})
      .mockResolvedValueOnce(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it("returns no Store data when native module cannot be queried",async()=>{
    native.listMembers.mockRejectedValue(new Error("backend unavailable"))
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({message:"Unavailable"})
  })
})
