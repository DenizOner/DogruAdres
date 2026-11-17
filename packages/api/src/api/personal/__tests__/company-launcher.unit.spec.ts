import { GET, POST } from "../company-launcher/route"
import { access, csrf, enabled, sessionToken } from "../security"
import { CompanyLauncherConflict, CompanyLauncherInvalid } from "../../../modules/dogruadres-access/company-launcher"

jest.mock("../security", () => ({
  access: jest.fn(), csrf: jest.fn(), enabled: jest.fn(), sessionToken: jest.fn(),
}))

describe("B20 company launcher current Person x Organization HTTP contract", () => {
  const service = {
    personalCompanyLauncher: jest.fn(),
    personalSaveCompanyLauncher: jest.fn(),
  }
  const org = "daorg_TEST_A"
  const entry = { organization_id: org, app_ids: ["organization","store-applications","memberships"],
    available_ids: ["organization","store-applications","memberships"], collapsed_ids: [], version: 1 }
  const request = (query: unknown = {organization:org},body: unknown = {}) => ({
    query,body,headers:{},scope:{resolve:jest.fn()},
  }) as any
  const response = () => {
    const res: any = {}
    res.setHeader=jest.fn().mockReturnValue(res)
    res.status=jest.fn().mockReturnValue(res)
    res.json=jest.fn().mockReturnValue(res)
    return res
  }
  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("t".repeat(43))
    ;(access as jest.Mock).mockReturnValue(service)
    service.personalCompanyLauncher.mockResolvedValue(entry)
    service.personalSaveCompanyLauncher.mockResolvedValue({...entry,version:2})
  })

  it("rejects a forged Organization selector or Seller selector without touching persistence",async()=>{
    const invalid = request({organization:"../../foreign"})
    const res=response()
    await GET(invalid,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalCompanyLauncher).not.toHaveBeenCalled()
    const seller=request()
    seller.headers["x-seller-id"]="sel_foreign"
    await GET(seller,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalCompanyLauncher).not.toHaveBeenCalled()
  })

  it("GET returns scoped existing functions from the verified service, no-store",async()=>{
    const res=response()
    await GET(request(),res)
    expect(service.personalCompanyLauncher).toHaveBeenCalledWith("t".repeat(43),org)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(entry)
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({password:"secret"}))
  })

  it("does not disclose any private navigation to a revoked or foreign Person",async()=>{
    const res=response()
    service.personalCompanyLauncher.mockResolvedValue(null)
    await GET(request(),res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({message:"Access denied"})
  })

  it("CSRF and unknown apps fail without entering a writable service",async()=>{
    const data={organization:org,app_ids:entry.app_ids,collapsed_ids:[],expected_version:0}
    const res=response()
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(request({},data),res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.personalSaveCompanyLauncher).not.toHaveBeenCalled()
    ;(csrf as jest.Mock).mockResolvedValue(true)
    await POST(request({}, {...data,app_ids:["organization","vendor"]}),res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalSaveCompanyLauncher).not.toHaveBeenCalled()
  })

  it("saves only explicit typed Person x Organization preference and returns the new version",async()=>{
    const data={organization:org,app_ids:entry.app_ids,collapsed_ids:["organization"],expected_version:1}
    const res=response()
    await POST(request({},data),res)
    expect(service.personalSaveCompanyLauncher).toHaveBeenCalledWith("t".repeat(43),data)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({...entry,version:2})
  })

  it("CAS conflict 409 and disallowed live role 400 are safe and never return secrets",async()=>{
    const data={organization:org,app_ids:entry.app_ids,collapsed_ids:[],expected_version:1}
    const res=response()
    service.personalSaveCompanyLauncher.mockRejectedValueOnce(new CompanyLauncherConflict())
    await POST(request({},data),res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({message:"Launcher changed; reload before saving"})
    service.personalSaveCompanyLauncher.mockRejectedValueOnce(new CompanyLauncherInvalid())
    await POST(request({},data),res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({message:"Invalid preference"})
  })

  it("unavailable service never claims a successful save",async()=>{
    const res=response()
    const data={organization:org,app_ids:entry.app_ids,collapsed_ids:[],expected_version:0}
    service.personalSaveCompanyLauncher.mockRejectedValueOnce(new Error("private-database-error"))
    await POST(request({},data),res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      message:"Outcome uncertain; read current launcher before retrying",
    })
  })
})
