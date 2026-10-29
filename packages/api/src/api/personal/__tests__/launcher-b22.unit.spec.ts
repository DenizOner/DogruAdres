import { access, sessionToken } from "../security"
import { GET } from "../launcher/route"

jest.mock("../security", () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  sessionToken: jest.fn(),
}))

describe("B22 launcher keeps historic B20 preferences, but no separate Vendor panel",()=>{
  const token="opaque-personal-token"
  const pref={person_id:"daprs_test",app_ids:["vendor","storefront"],
    collapsed_ids:["vendor","storefront"],version:7}
  let req:any,res:any,svc:any
  beforeEach(()=>{
    jest.resetAllMocks()
    ;(sessionToken as jest.Mock).mockReturnValue(token)
    svc={getLauncherPreference:jest.fn().mockResolvedValue(pref),personalActorBinding:jest.fn()}
    ;(access as jest.Mock).mockReturnValue(svc)
    req={scope:{resolve:jest.fn(()=>{throw Error("native Vendor must not be launched")})}}
    res={status:jest.fn().mockReturnThis(),setHeader:jest.fn(),json:jest.fn().mockReturnThis()}
  })
  it("shows public catalog, not SellerMember-derived commercial permission",async()=>{
    await GET(req,res)
    expect(svc.getLauncherPreference).toHaveBeenCalledWith(token)
    expect(req.scope.resolve).not.toHaveBeenCalled()
    expect(svc.personalActorBinding).not.toHaveBeenCalled()
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
    expect(res.json).toHaveBeenCalledWith({
      app_ids:["storefront"],collapsed_ids:["storefront"],available_ids:["storefront"],version:7,
    })
    expect(pref.app_ids).toEqual(["vendor","storefront"])
  })
  it("denies when the Person has no active session",async()=>{
    svc.getLauncherPreference.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(req.scope.resolve).not.toHaveBeenCalled()
  })
  it("fails closed if preference storage is unavailable",async()=>{
    svc.getLauncherPreference.mockRejectedValue(new Error("database offline"))
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(req.scope.resolve).not.toHaveBeenCalled()
  })
})
