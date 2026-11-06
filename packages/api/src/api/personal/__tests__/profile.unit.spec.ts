import { GET, POST } from "../profile/route"
import { access, csrf, enabled, sessionToken } from "../security"

jest.mock("../security", () => ({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn(),
}))

describe("M0 canonical Person private mobile contact ingress", () => {
  let req:any,res:any
  const service={personalMobile:jest.fn(),personalSaveMobile:jest.fn()}
  beforeEach(()=>{
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("own-opaque-cookie")
    ;(access as jest.Mock).mockReturnValue(service)
    service.personalMobile.mockResolvedValue({mobile_phone:"+905551234567",version:4})
    service.personalSaveMobile.mockResolvedValue({mobile_phone:"+905551234568",version:5})
    req={query:{},body:{mobile_phone:"+905551234568",expected_version:4}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis()}
  })
  it("reads only the authenticated Person without a caller-supplied Person, email or Organization",async()=>{
    await GET(req,res)
    expect(service.personalMobile).toHaveBeenCalledWith("own-opaque-cookie")
    expect(res.json).toHaveBeenCalledWith({
      mobile_phone:"+905551234567",version:4,phone_verified:false,
    })
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
    req.query={person_id:"daprs_foreign"}
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalMobile).toHaveBeenCalledTimes(1)
  })
  it("refuses anonymous, revoked or strong-auth-ineligible Person contact changes",async()=>{
    service.personalSaveMobile.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    service.personalMobile.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it("requires exact-origin CSRF and never writes on invalid request",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.personalSaveMobile).not.toHaveBeenCalled()
  })
  it.each([
    {mobile_phone:"",expected_version:0},
    {mobile_phone:"02121234567 ext 5",expected_version:0},
    {mobile_phone:"+905551234567",expected_version:-1},
    {mobile_phone:"+905551234567",expected_version:"0"},
    {mobile_phone:"+905551234567",expected_version:1,person_id:"daprs_foreign"},
    {mobile_phone:"+905551234567",expected_version:1,organization_id:"daorg_foreign"},
  ])("rejects unsupported Person or phone data before DB write: %o",async body=>{
    req.body=body
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalSaveMobile).not.toHaveBeenCalled()
  })
  it("updates only the session Person and never claims number possession verification",async()=>{
    await POST(req,res)
    expect(service.personalSaveMobile).toHaveBeenCalledWith(
      "own-opaque-cookie","+905551234568",4
    )
    expect(res.json).toHaveBeenCalledWith({
      mobile_phone:"+905551234568",version:5,phone_verified:false,
    })
  })
  it("returns conflict for a concurrent change without overwriting or leaking it",async()=>{
    service.personalSaveMobile.mockResolvedValue({conflict:true})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      message:"Contact changed; refresh before retry",
    })
  })
  it("fails closed on persistence errors and disabled feature",async()=>{
    service.personalSaveMobile.mockRejectedValue(new Error("raw private phone in SQL"))
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(JSON.stringify(res.json.mock.lastCall?.[0])).not.toContain("private phone")
    ;(enabled as jest.Mock).mockReturnValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(service.personalSaveMobile).toHaveBeenCalledTimes(1)
  })
})
