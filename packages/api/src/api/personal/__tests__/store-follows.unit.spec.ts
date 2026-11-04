import {GET,POST} from "../store-follows/route"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"
jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))

describe("B22 Buyer Organization × Store follow private ingress",()=>{
  const organization_id="daorg_buyer",seller_id="sel_approved"
  let req:any,res:any,service:any,native:any
  beforeEach(()=>{
    jest.resetAllMocks()
    service={
      personalBuyerStoreFollowState:jest.fn().mockResolvedValue({
        organization_id,seller_id,following:false,version:0
      }),
      personalChangeBuyerStoreFollow:jest.fn().mockResolvedValue({
        conflict:false,organization_id,seller_id,following:true,version:1
      })
    }
    native={listSellers:jest.fn().mockResolvedValue([{
      id:seller_id,status:"open",approved_at:new Date().toISOString()
    }])}
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    ;(access as jest.Mock).mockReturnValue(service)
    req={query:{},headers:{},body:{
      action:"follow",organization_id,seller_id,expected_version:0
    },scope:{resolve:jest.fn().mockReturnValue(native)}}
    res={status:jest.fn(),json:jest.fn(),setHeader:jest.fn()}
    res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  })
  it("reads only current protected Owner's Organization relationship",async()=>{
    req.query={organization_id,seller_id}
    await GET(req,res)
    expect(service.personalBuyerStoreFollowState)
      .toHaveBeenCalledWith("opaque",organization_id,seller_id)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id,seller_id,following:false,version:0
    })
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","private, no-store")
    expect(service.personalChangeBuyerStoreFollow).not.toHaveBeenCalled()
    service.personalBuyerStoreFollowState.mockResolvedValueOnce(null)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })
  it("rejects forged query, Bearer, Seller selector and unknown scope",async()=>{
    req.query={organization_id,seller_id,owner:"true"}
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    req.query={}
    req.headers.authorization="Bearer synthetic"
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
    delete req.headers.authorization
    req.headers["x-seller-id"]="sel_foreign"
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
    delete req.headers["x-seller-id"]
    req.body.owner_person_id="daprs_foreign"
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    delete req.body.owner_person_id
    expect(service.personalChangeBuyerStoreFollow).not.toHaveBeenCalled()
  })
  it("checks same-origin CSRF and exactly approved/open native Store",async()=>{
    ;(csrf as jest.Mock).mockResolvedValueOnce(false)
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
    expect(native.listSellers).not.toHaveBeenCalled()
    for(const seller of [[],[{id:seller_id,status:"suspended",approved_at:"x"}],
      [{id:seller_id,status:"open",approved_at:null}],
      [{id:"sel_different",status:"open",approved_at:"x"}]]){
      native.listSellers.mockResolvedValueOnce(seller)
      await POST(req,res)
      expect(res.status).toHaveBeenLastCalledWith(403)
    }
    expect(service.personalChangeBuyerStoreFollow).not.toHaveBeenCalled()
  })
  it("follows once, unfollows without native lookup, rejects stale replay",async()=>{
    await POST(req,res)
    expect(native.listSellers).toHaveBeenCalledTimes(1)
    expect(service.personalChangeBuyerStoreFollow).toHaveBeenCalledWith("opaque",req.body)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id,seller_id,following:true,version:1
    })
    req.body={action:"unfollow",organization_id,seller_id,expected_version:1}
    service.personalChangeBuyerStoreFollow.mockResolvedValueOnce({
      conflict:false,organization_id,seller_id,following:false,version:2
    })
    await POST(req,res)
    expect(native.listSellers).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenLastCalledWith(200)
    service.personalChangeBuyerStoreFollow.mockResolvedValueOnce({conflict:true})
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(409)
  })
  it("fails closed for foreign Owner, invalid payload and uncertain failure",async()=>{
    service.personalChangeBuyerStoreFollow.mockResolvedValueOnce(null)
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
    req.body.expected_version=-1
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    req.body.expected_version=0
    service.personalChangeBuyerStoreFollow.mockRejectedValueOnce(new IdentityAccessDenied())
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
    service.personalChangeBuyerStoreFollow.mockRejectedValueOnce(new Error("db"))
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(503)
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("db")
  })
})
