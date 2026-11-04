import {GET,POST} from "../organization-applications/route"
import {access,csrf,enabled,sessionToken} from "../security"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))

describe("B22 private business application DRAFT — never an Organization",()=>{
  const payload={
    application_id:"daorgapp_"+"a".repeat(32),expected_version:0,
    business_kind:"individual_business",legal_name:"Sentetik Ticari İşletme",
    landline_phone:"+90 212 555 00 00",
  }
  let req:any,res:any,service:any
  beforeEach(()=>{
    jest.resetAllMocks()
    service={
      personalOrganizationApplicationDrafts:jest.fn().mockResolvedValue([]),
      personalSaveOrganizationApplicationDraft:jest.fn().mockResolvedValue({
        conflict:false,application_id:payload.application_id,status:"draft",version:1
      }),
    }
    ;(access as jest.Mock).mockReturnValue(service)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    req={body:{...payload},query:{},headers:{}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis()}
  })
  it("accepts one private draft, without direct Organization or owner provisioning",async()=>{
    await POST(req,res)
    expect(service.personalSaveOrganizationApplicationDraft).toHaveBeenCalledWith(
      "opaque",payload)
    expect(res.status).toHaveBeenLastCalledWith(201)
    expect(res.json).toHaveBeenLastCalledWith({
      application_id:payload.application_id,status:"draft",version:1
    })
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(payload.landline_phone)
  })
  it("requires CSRF and denies browser-supplied native actor credentials",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    req.headers.authorization="Bearer native-token"
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(service.personalSaveOrganizationApplicationDraft).not.toHaveBeenCalled()
  })
  it("rejects incomplete landline, unsupported kind, actor injection and version tricks",async()=>{
    for(const changed of [
      {landline_phone:""},
      {landline_phone:"123456"},
      {business_kind:"store"},
      {person_id:"daprs_forged"},
      {expected_version:-1},
      {application_id:"daorg_forged"},
    ]){
      req.body={...payload,...changed}
      await POST(req,res)
      expect(res.status).toHaveBeenLastCalledWith(400)
    }
    expect(service.personalSaveOrganizationApplicationDraft).not.toHaveBeenCalled()
  })
  it("reads only through server-held person session",async()=>{
    service.personalOrganizationApplicationDrafts.mockResolvedValue([{
      id:payload.application_id,status:"draft",version:1,
      business_kind:payload.business_kind,legal_name:payload.legal_name,
      landline_phone:payload.landline_phone
    }])
    await GET(req,res)
    expect(service.personalOrganizationApplicationDrafts).toHaveBeenCalledWith("opaque")
    expect(res.status).toHaveBeenLastCalledWith(200)
    req.query={organization_id:"daorg_other"}
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    req.query={};req.headers.authorization="Bearer cross-person"
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
  })
  it("never discloses another person's draft or hidden server faults",async()=>{
    service.personalOrganizationApplicationDrafts.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    service.personalSaveOrganizationApplicationDraft.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    service.personalSaveOrganizationApplicationDraft.mockRejectedValue(
      Error("private DB detail +90 212 555 00 00"))
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("private DB detail")
  })
  it("reports stale revision instead of replaying a draft edit",async()=>{
    req.body={...payload,expected_version:1}
    service.personalSaveOrganizationApplicationDraft.mockResolvedValue({conflict:true})
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(409)
    expect(res.json).toHaveBeenLastCalledWith({
      message:"Draft changed; read the current version"
    })
  })
})
