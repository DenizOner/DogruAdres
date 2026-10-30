import {GET} from "../buyer-context/route"
import {access,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"
jest.mock("../security",()=>({
  access:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
describe("B22 selected buyer Organization is not Customer checkout authority",()=>{
  let req:any,res:any,svc:any
  beforeEach(()=>{
    jest.resetAllMocks()
    svc={personalBuyerOrganization:jest.fn().mockResolvedValue({
      person_id:"daprs_a",organization_id:"daorg_a"
    })}
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    ;(access as jest.Mock).mockReturnValue(svc)
    req={query:{organization_id:"daorg_a"},headers:{}}
    res={status:jest.fn(),json:jest.fn(),setHeader:jest.fn()}
    res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  })
  it("verifies selected Organization twice and never returns native Customer or checkout credentials",async()=>{
    await GET(req,res)
    expect(svc.personalBuyerOrganization).toHaveBeenNthCalledWith(1,"opaque","daorg_a")
    expect(svc.personalBuyerOrganization).toHaveBeenCalledTimes(2)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({organization_id:"daorg_a",
      status:"buyer_permission_verified",checkout_ready:false})
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
  })
  it("denies revoked or absent buyer.purchase and foreign organization",async()=>{
    svc.personalBuyerOrganization.mockResolvedValue(null)
    await GET(req,res);expect(res.status).toHaveBeenCalledWith(403)
    svc.personalBuyerOrganization.mockResolvedValue({person_id:"daprs_a",organization_id:"daorg_b"})
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
  })
  it("denies revocation between both live reads",async()=>{
    svc.personalBuyerOrganization.mockResolvedValueOnce({
      person_id:"daprs_a",organization_id:"daorg_a"
    }).mockResolvedValueOnce(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it("rejects spoofed seller, extra query and malformed IDs",async()=>{
    req.query.organization_id="daorg_a";req.query.actor_id="cus_a"
    await GET(req,res);expect(res.status).toHaveBeenCalledWith(400)
    delete req.query.actor_id;req.headers["x-seller-id"]="sel_b"
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    delete req.headers["x-seller-id"];req.query.organization_id="different"
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    expect(svc.personalBuyerOrganization).not.toHaveBeenCalled()
  })
  it("denies malformed audit and fails closed on unavailable Foundation",async()=>{
    svc.personalBuyerOrganization.mockRejectedValue(new IdentityAccessDenied())
    await GET(req,res);expect(res.status).toHaveBeenCalledWith(403)
    svc.personalBuyerOrganization.mockRejectedValue(new Error("database offline"))
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(503)
  })
})
