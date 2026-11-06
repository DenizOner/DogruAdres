import {
  decodeOrganizationDraftCursor,
  listOrganizationDrafts,
  saveOrganizationDraft,
  withdrawOrganizationDraft,
  saveOrganizationDocument,
  submitOrganizationApplication,
  readOrganizationApplicationDocument,
  TaxCertificateReviewUnavailable,
  listSubmittedOrganizationApplications,
  reviewOrganizationApplication
} from "../../../modules/dogruadres-access/organization-application"
import { IdentitySessions } from "../../../modules/dogruadres-access/identity-session"
import {
  inspectPrivateTaxCertificateInventory,
  writePrivateTaxCertificate,
  readPrivateTaxCertificate,
} from "../../../modules/dogruadres-access/private-tax-certificate-store"
import { prepareTaxCertificate } from "../../../modules/dogruadres-access/tax-certificate-policy"
import { inspectTaxCertificateSnapshot, PRIVATE_TAX_DOCUMENT_READ_SQL } from "../../../scripts/tax-certificate-inventory"
import {GET,POST} from "../organization-applications/route"
import {access,csrf,enabled,sessionToken} from "../security"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))

describe("B22 private business application DRAFT — never an Organization",()=>{
  const payload={
    application_id:"daorgapp_"+"a".repeat(32),expected_version:0,
    business_kind:"individual_business",legal_name:"Sentetik Ticari İşletme",
    declared_activities:["service_repair","insurance_claims"],
    primary_activity:"insurance_claims",
    landline_phone:"+90 212 555 00 00",
    tax_identifier:"12345678901",
  }
  let req:any,res:any,service:any
  beforeEach(()=>{
    jest.resetAllMocks()
    service={
      personalOrganizationApplicationDrafts:jest.fn().mockResolvedValue({drafts:[],next_cursor:null}),
      personalSubmittedOrganizationApplications:jest.fn().mockResolvedValue({applications:[],next_cursor:null}),
      personalSaveOrganizationApplicationDraft:jest.fn().mockResolvedValue({
        conflict:false,application_id:payload.application_id,status:"draft",version:1
      }),
      personalWithdrawOrganizationApplicationDraft:jest.fn().mockResolvedValue({
        conflict:false,application_id:payload.application_id,status:"withdrawn",version:2
      }),
      personalSaveOrganizationApplicationDocument:jest.fn().mockResolvedValue({
        conflict:false,application_id:payload.application_id,status:"draft",version:2,
        document:{mime_type:"application/pdf",original_byte_length:1000,original_sha256:"a".repeat(64),version:1}
      }),
      personalSubmitOrganizationApplication:jest.fn().mockResolvedValue({
        conflict:false,missing_document:false,application_id:payload.application_id,status:"submitted",version:3
      }),
      personalReadOrganizationApplicationDocument:jest.fn().mockResolvedValue({
        content:Buffer.from("%PDF-1.7..."),mimeType:"application/pdf",filename:"vergi-levhasi-1.pdf",version:1
      }),
      personalReadOrganizationApplicationReviewPreview:jest.fn().mockResolvedValue(null),
    }
    ;(access as jest.Mock).mockReturnValue(service)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    req={body:{...payload},query:{},headers:{}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis(),send:jest.fn().mockReturnThis()}
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

  it("requires a material field change before a correction can become a draft",async()=>{
    const spy=jest.spyOn(IdentitySessions.prototype,"current").mockResolvedValue({
      person_id:"daprs_applicant",actor_type:"customer",actor_id:"cus_app"
    } as any)
    const state={...payload,expected_version:4}
    const exec=jest.fn(async(sql:string,params?:any[])=>{
      if(sql.includes("from da_organization_application where id=? for update"))
        return [{applicant_person_id:"daprs_applicant",status:"correction_requested",version:4}]
      if(sql.startsWith("update da_organization_application")){
        expect(sql).toContain("IS DISTINCT FROM ROW")
        expect(sql).toContain("status='draft' or")
        expect(sql).toContain("declared_activities @> ?::jsonb and declared_activities <@ ?::jsonb")
        expect(params?.length).toBe(16)
        // Model the previously persisted activity set, not the submitted order.
        const selected=JSON.parse(String(params?.[4])) as string[]
        const sameActivities=JSON.stringify([...selected].sort())===
          JSON.stringify([...payload.declared_activities].sort())
        return params?.[1]===payload.legal_name && sameActivities
          ? []:[{id:payload.application_id}]
      }
      return []
    })
    const db:any={execute:exec}
    try{
      const same=await saveOrganizationDraft(db,"opaque",state)
      expect(same).toEqual({conflict:true})
      const reordered=await saveOrganizationDraft(db,"opaque",{
        ...state,declared_activities:[...state.declared_activities].reverse()
      })
      expect(reordered).toEqual({conflict:true})
      expect(exec.mock.calls.some(([sql])=>String(sql).includes("insert into da_audit_event"))).toBe(false)
      expect(exec.mock.calls.some(([sql])=>String(sql).includes("insert into da_security_outbox"))).toBe(false)
      const changed=await saveOrganizationDraft(db,"opaque",{
        ...state,legal_name:"Updated Synthetic Business"
      })
      expect(changed).toEqual({
        conflict:false,application_id:payload.application_id,status:"draft",version:5
      })
      expect(exec.mock.calls.filter(([sql])=>String(sql).includes("insert into da_audit_event"))).toHaveLength(1)
      expect(exec.mock.calls.filter(([sql])=>String(sql).includes("insert into da_security_outbox"))).toHaveLength(1)
      expect(exec.mock.calls.some(([sql])=>/createOrganizations|insert into da_organization_membership/.test(String(sql)))).toBe(false)
    }finally{spy.mockRestore()}
  })

  it("denies missing safe preview, then serves only an authorized raster without raw bytes",async()=>{
    req.query={action:"review_preview",application_id:payload.application_id}
    await GET(req,res)
    expect(service.personalReadOrganizationApplicationReviewPreview).toHaveBeenCalledWith(
      "opaque",payload.application_id)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.send).not.toHaveBeenCalled()

    const pixels=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])
    service.personalReadOrganizationApplicationReviewPreview.mockResolvedValueOnce({
      content:pixels,mimeType:"image/png",applicationVersion:3,documentVersion:1
    })
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.send).toHaveBeenLastCalledWith(pixels)
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type","image/png")
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options","nosniff")
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("%PDF")

    service.personalReadOrganizationApplicationReviewPreview.mockRejectedValueOnce(
      new Error("scanner unavailable"))
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(res.send).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("scanner unavailable")

    req.query={action:"review_preview",application_id:"daorg_other"}
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    req.query={action:"review_preview",application_id:payload.application_id}
    req.headers.authorization="Bearer forged"
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    expect(service.personalReadOrganizationApplicationReviewPreview).toHaveBeenCalledTimes(3)
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
      {declared_activities:[]},
      {declared_activities:["service_repair","service_repair"]},
      {declared_activities:["invented_activity"]},
      {primary_activity:"wholesale_distribution"},
      {primary_activity:"unapproved"},
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
    service.personalOrganizationApplicationDrafts.mockResolvedValue({drafts:[{
      id:payload.application_id,status:"draft",version:1,
      business_kind:payload.business_kind,legal_name:payload.legal_name,
      landline_phone:payload.landline_phone,
      declared_activities:payload.declared_activities,
      primary_activity:payload.primary_activity
    }],next_cursor:null})
    await GET(req,res)
    expect(service.personalOrganizationApplicationDrafts).toHaveBeenCalledWith("opaque",undefined)
    expect(res.status).toHaveBeenLastCalledWith(200)
    req.query={organization_id:"daorg_other"}
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    req.query={};req.headers.authorization="Bearer cross-person"
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
  })
  it("validates cursor and rejects forged Organization selectors before private reads",async()=>{
    const decoded={t:"2026-11-04T11:34:56.123456Z",id:payload.application_id}
    const cursor=Buffer.from(JSON.stringify(decoded)).toString("base64url")
    req.query={cursor}
    await GET(req,res)
    expect(service.personalOrganizationApplicationDrafts).toHaveBeenCalledWith(
      "opaque",{updatedAt:decoded.t,id:decoded.id})
    expect(res.status).toHaveBeenLastCalledWith(200)
    const old=service.personalOrganizationApplicationDrafts.mock.calls.length
    for(const invalid of ["garbage","%",
      Buffer.from(JSON.stringify({...decoded,id:"daorg_other"})).toString("base64url"),
      "A".repeat(300)]){
      req.query={cursor:invalid}
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(400)
    }
    req.query={cursor,organization_id:"daorg_other"}
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    expect(service.personalOrganizationApplicationDrafts).toHaveBeenCalledTimes(old)
  })
  it("returns a second private page after 100 drafts with exact microsecond cursor",async()=>{
    const original=jest.spyOn(IdentitySessions.prototype,"current")
      .mockResolvedValue({person_id:"daprs_owner"} as any)
    const stamp="2026-11-04T11:34:56.123456Z"
    const rows=Array.from({length:101},(_,i)=>({
      id:"daorgapp_"+(i+1).toString(16).padStart(32,"0"),
      legal_name:"Synthetic "+i,landline_phone:"+90 212 555 00 00",
      business_kind:"individual_business",declared_activities:["service_repair"],
      primary_activity:"service_repair",status:"draft",version:1,
      cursor_time:stamp,created_at:new Date(),updated_at:new Date()
    }))
    const sql={execute:jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([rows[100]])}
    try{
      const first=await listOrganizationDrafts(sql,"opaque")
      expect(first?.drafts).toHaveLength(100)
      expect(first?.next_cursor).toMatch(/^[A-Za-z0-9_-]+$/)
      const cursor=decodeOrganizationDraftCursor(first?.next_cursor)
      expect(cursor).toEqual({updatedAt:stamp,id:rows[99].id})
      const second=await listOrganizationDrafts(sql,"opaque",cursor!)
      expect(second?.drafts).toHaveLength(1)
      expect(second?.next_cursor).toBeNull()
      expect(sql.execute).toHaveBeenCalledTimes(2)
      expect(sql.execute.mock.calls[0][1]).toEqual(["daprs_owner"])
      expect(sql.execute.mock.calls[1][1]).toEqual(
        ["daprs_owner",stamp,stamp,rows[99].id])
      expect(sql.execute.mock.calls[1][0]).toContain("and id > ?")
      expect(sql.execute.mock.calls[1][0]).toContain("limit 101")
      expect(sql.execute.mock.calls[1][0]).toContain("applicant_person_id=?")
    }finally{original.mockRestore()}
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
  it("withdraws only the selected Person's draft through the same CSRF-protected POST",async()=>{
    req.body={action:"withdraw",application_id:payload.application_id,expected_version:1}
    await POST(req,res)
    expect(service.personalWithdrawOrganizationApplicationDraft).toHaveBeenCalledWith(
      "opaque",req.body)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      application_id:payload.application_id,status:"withdrawn",version:2
    })
    expect(service.personalSaveOrganizationApplicationDraft).not.toHaveBeenCalled()
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(payload.landline_phone)
  })
  it("rejects malformed withdrawal, missing CSRF, foreign Person and stale version",async()=>{
    req.body={action:"withdraw",application_id:payload.application_id,expected_version:1}
    for(const bad of [
      {expected_version:0},{expected_version:-1},{person_id:"daprs_other"},
      {application_id:"daorg_invalid"},{status:"approved"}
    ]){
      req.body={action:"withdraw",application_id:payload.application_id,
        expected_version:1,...bad}
      await POST(req,res)
      expect(res.status).toHaveBeenLastCalledWith(400)
    }
    expect(service.personalWithdrawOrganizationApplicationDraft).not.toHaveBeenCalled()
    req.body={action:"withdraw",application_id:payload.application_id,expected_version:1}
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    service.personalWithdrawOrganizationApplicationDraft.mockResolvedValueOnce(null)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    service.personalWithdrawOrganizationApplicationDraft.mockResolvedValueOnce({conflict:true})
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(409)
  })
  it("serializes withdrawal with draft writes; one private audit/outbox, no privilege changes",async()=>{
    const spy=jest.spyOn(IdentitySessions.prototype,"current").mockResolvedValue({
      person_id:"daprs_owner",actor_type:"customer",actor_id:"cus_owner"
    } as any)
    const id=payload.application_id
    const input={action:"withdraw",application_id:id,expected_version:3}
    let owner="daprs_owner",state="draft",version=3
    const exec=jest.fn(async(sql:string,_params?:any[])=>{
      if(sql.includes("from da_organization_application where id=? for update"))
        return [{applicant_person_id:owner,status:state,version}]
      if(sql.includes("update da_organization_application"))
        return [{version:4}]
      return []
    })
    try{
      const db:any={execute:exec}
      owner="daprs_foreign"
      expect(await withdrawOrganizationDraft(db,"opaque",input)).toBeNull()
      expect(exec.mock.calls.every(args=>!String(args[0]).includes("update da_organization_application"))).toBe(true)
      owner="daprs_owner";version=4
      expect(await withdrawOrganizationDraft(db,"opaque",input)).toEqual({conflict:true})
      version=3;state="withdrawn"
      expect(await withdrawOrganizationDraft(db,"opaque",input)).toEqual({conflict:true})
      for(const terminal of ["approved","rejected"]){
        state=terminal
        expect(await withdrawOrganizationDraft(db,"opaque",input)).toEqual({conflict:true})
      }
      for(const permitted of ["submitted","correction_requested"]){
        state=permitted
        const granted=await withdrawOrganizationDraft(db,"opaque",input)
        expect(granted).toEqual({conflict:false,application_id:id,status:"withdrawn",version:4})
      }
      state="draft"
      const result=await withdrawOrganizationDraft(db,"opaque",input)
      expect(result).toEqual({conflict:false,application_id:id,status:"withdrawn",version:4})
      const statements=exec.mock.calls.map(args=>String(args[0]))
      expect(statements.filter(sql=>sql.includes("pg_advisory_xact_lock"))).toHaveLength(8)
      expect(statements.filter(sql=>sql.includes("update da_organization_application"))).toHaveLength(3)
      expect(statements.filter(sql=>sql.includes("insert into da_audit_event"))).toHaveLength(3)
      expect(statements.filter(sql=>sql.includes("insert into da_security_outbox"))).toHaveLength(3)
      const actions=exec.mock.calls.filter(([sql])=>sql.includes("insert into da_audit_event")).map(([,params])=>params?.[4])
      expect(actions).toEqual(["organization.application_withdrawn","organization.application_withdrawn","organization.application_draft_withdrawn"])
      expect(statements.join(" ")).not.toContain("createOrganizations")
      expect(statements.join(" ")).not.toContain("createMemberships")
    }finally{spy.mockRestore()}
  })


  it("uploads a valid tax certificate through CSRF-protected POST action upload_document", async () => {
    const validPdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<<>>\nstartxref\n9\n%%EOF\n", "ascii")
    req.body = {
      action: "upload_document",
      application_id: payload.application_id,
      expected_version: 1,
      filename: "vergi_levhasi.pdf",
      file_base64: validPdf.toString("base64")
    }
    await POST(req, res)
    expect(service.personalSaveOrganizationApplicationDocument).toHaveBeenCalledWith("opaque", req.body)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      conflict: false,
      application_id: payload.application_id,
      status: "draft",
      version: 2,
      document: expect.objectContaining({ mime_type: "application/pdf", version: 1 })
    })
  })

  it("submits the application only when document is present and locks status to submitted", async () => {
    req.body = {
      action: "submit",
      application_id: payload.application_id,
      expected_version: 2
    }
    await POST(req, res)
    expect(service.personalSubmitOrganizationApplication).toHaveBeenCalledWith("opaque", req.body)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      application_id: payload.application_id,
      status: "submitted",
      version: 3
    })

    // Missing document rejects with 400
    service.personalSubmitOrganizationApplication.mockResolvedValueOnce({
      conflict: false, missing_document: true
    })
    await POST(req, res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    expect(res.json).toHaveBeenLastCalledWith({
      message: "Tax certificate required before submission"
    })

    // Missing tax identifier rejects with 400
    service.personalSubmitOrganizationApplication.mockResolvedValueOnce({
      conflict: false, missing_document: false, missing_tax_identifier: true
    })
    await POST(req, res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    expect(res.json).toHaveBeenLastCalledWith({
      message: "Tax identifier (VKN/TCKN) required before submission"
    })

    // Upload with oversize Content-Length returns 413
    req.headers["content-length"] = String(16 * 1024 * 1024)
    req.body = { action: "upload_document" }
    await POST(req, res)
    expect(res.status).toHaveBeenLastCalledWith(413)
    expect(res.json).toHaveBeenLastCalledWith({ message: "Payload too large" })
    delete req.headers["content-length"]
  })

  it("retrieves document with secure binary attachment headers for authorized caller and denies invalid requests", async () => {
    req.query = { action: "document", application_id: payload.application_id }
    await GET(req, res)
    expect(service.personalReadOrganizationApplicationDocument).toHaveBeenCalledWith("opaque", payload.application_id)
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf")
    expect(res.setHeader).toHaveBeenCalledWith("Content-Disposition", 'attachment; filename="vergi-levhasi-1.pdf"')
    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff")
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.send).toHaveBeenCalled()

    // The API must never return a staff document when safety review is unavailable.
    service.personalReadOrganizationApplicationDocument.mockRejectedValueOnce(
      new TaxCertificateReviewUnavailable())
    res.send.mockClear()
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(res.json).toHaveBeenLastCalledWith({ message:"Document review unavailable" })
    expect(res.send).not.toHaveBeenCalled()

    // Denied caller
    service.personalReadOrganizationApplicationDocument.mockResolvedValueOnce(null)
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(403)

    // Invalid appId format
    req.query = { action: "document", application_id: "invalid_id" }
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(400)
  })

  it("fails closed on approval while verified staff document safety is unavailable", async () => {
    req.body={action:"review_decision",application_id:payload.application_id,
      expected_version:3,decision:"approve"}
    service.personalReviewOrganizationApplication=jest.fn()
      .mockRejectedValue(new TaxCertificateReviewUnavailable())
    await POST(req,res)
    expect(service.personalReviewOrganizationApplication)
      .toHaveBeenCalledWith("opaque",req.body)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(res.json).toHaveBeenLastCalledWith({message:"Document review unavailable"})
    expect(res.send).not.toHaveBeenCalled()
  })

  it("allows platform review staff to list submitted applications and denies unauthorized callers", async () => {
    req.query = { action: "review_queue" }
    service.personalSubmittedOrganizationApplications.mockResolvedValueOnce({
      applications: [{ id: payload.application_id, status: "submitted", tax_identifier: "12345678901", duplicate_review_required: true }],
      next_cursor: null
    })
    await GET(req, res)
    expect(service.personalSubmittedOrganizationApplications).toHaveBeenCalledWith("opaque", undefined)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      applications: [{ id: payload.application_id, status: "submitted", tax_identifier: "12345678901", duplicate_review_required: true }],
      next_cursor: null
    })

    // Denied caller
    service.personalSubmittedOrganizationApplications.mockResolvedValueOnce(null)
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })

  it("saveOrganizationDocument persists to private storage outside checkout and links metadata with max version", async () => {
    const os = require("node:os")
    const path = require("node:path")
    const fsp = require("node:fs/promises")
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "da-b22-test-doc-"))
    const spy = jest.spyOn(IdentitySessions.prototype, "current").mockResolvedValue({
      person_id: "daprs_applicant", actor_type: "customer", actor_id: "cus_app"
    } as any)
    const validPdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<<>>\nstartxref\n9\n%%EOF\n", "ascii")

    const input = {
      action: "upload_document" as const,
      application_id: payload.application_id,
      expected_version: 1,
      filename: "levha.pdf",
      file_base64: validPdf.toString("base64")
    }

    const exec = jest.fn(async (sql: string, params?: any[]) => {
      if (sql.includes("from da_organization_application where id=? for update")) {
        return [{ applicant_person_id: "daprs_applicant", status: "draft", version: 1 }]
      }
      if (sql.includes("max(version)")) {
        return [{ max_v: 0 }]
      }
      if (sql.includes("update da_organization_application")) {
        return [{ version: 2 }]
      }
      return []
    })
    const db: any = { execute: exec }

    try {
      const res = await saveOrganizationDocument(db, "opaque", input, root)
      expect(res).toEqual({
        conflict: false,
        application_id: payload.application_id,
        status: "draft",
        version: 2,
        document: expect.objectContaining({
          mime_type: "application/pdf",
          version: 1,
          original_byte_length: validPdf.length
        })
      })
      const files = await fsp.readdir(root)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    } finally {
      spy.mockRestore()
      await fsp.rm(root, { recursive: true, force: true })
    }
  })


  it("reopens a correction only after a new private document revision, preserving the earlier file",async()=>{
    const os=require("node:os"),path=require("node:path"),fsp=require("node:fs/promises")
    const root=await fsp.mkdtemp(path.join(os.tmpdir(),"da-b22-correction-"))
    const pdf=Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<<>>\nstartxref\n9\n%%EOF\n","ascii")
    const changed=Buffer.from(pdf.toString("ascii").replace("trailer","% revised document\ntrailer"),"ascii")
    const spy=jest.spyOn(IdentitySessions.prototype,"current").mockResolvedValue({
      person_id:"daprs_applicant",actor_type:"customer",actor_id:"cus_app"
    } as any)
    let status="correction_requested",person="daprs_applicant",priorSha=""
    const exec=jest.fn(async(sql:string,params?:any[])=>{
      if(sql.includes("from da_organization_application where id=? for update"))
        return [{applicant_person_id:person,status,version:4}]
      if(sql.includes("max(version)"))return [{max_v:1}]
      if(sql.includes("select original_sha256 from da_organization_application_document"))
        return [{original_sha256:priorSha}]
      if(sql.includes("update da_organization_application")&&sql.includes("set status='draft'"))
        return [{version:5}]
      return []
    })
    const db:any={execute:exec}
    const input={action:"upload_document" as const,application_id:payload.application_id,
      expected_version:4,filename:"corrected.pdf",file_base64:changed.toString("base64")}
    try{
      const prior=await writePrivateTaxCertificate(root,prepareTaxCertificate("original.pdf",pdf))
      priorSha=prior.originalSha256
      const unchanged=await saveOrganizationDocument(db,"opaque",{
        ...input,filename:"renamed.pdf",file_base64:pdf.toString("base64")
      },root)
      expect(unchanged).toEqual({conflict:true})
      expect(await fsp.readdir(root)).toHaveLength(1)
      expect(exec.mock.calls.some(([sql])=>String(sql).includes("insert into da_organization_application_document"))).toBe(false)
      const result=await saveOrganizationDocument(db,"opaque",input,root)
      expect(result).toMatchObject({conflict:false,status:"draft",version:5,
        document:{version:2,original_byte_length:changed.length}})
      const statusUpdate=exec.mock.calls.find(([sql])=>String(sql).includes("set status='draft'"))
      expect(String(statusUpdate?.[0])).toContain("status in ('draft','correction_requested')")
      const inserted=exec.mock.calls.find(([sql])=>String(sql).includes("insert into da_organization_application_document"))
      const fields=inserted?.[1] as any[]
      expect(fields[10]).toBe(2)
      expect(await readPrivateTaxCertificate(root,{
        storageKey:fields[3],internalName:fields[4],mimeType:fields[5],
        compression:fields[6],originalByteLength:fields[7],
        originalSha256:fields[8],storedByteLength:fields[9]
      })).toEqual(changed)
      expect(await readPrivateTaxCertificate(root,prior)).toEqual(pdf)
      expect(await fsp.readdir(root)).toHaveLength(2)
      expect(exec.mock.calls.filter(([sql])=>String(sql).includes("insert into da_audit_event"))).toHaveLength(1)
      expect(exec.mock.calls.filter(([sql])=>String(sql).includes("insert into da_security_outbox"))).toHaveLength(1)
      expect(exec.mock.calls.some(([sql])=>/createOrganizations|insert into da_organization_membership/.test(String(sql)))).toBe(false)
      for(const forbidden of ["submitted","withdrawn","rejected","approved"]){
        status=forbidden
        const before=exec.mock.calls.length
        expect(await saveOrganizationDocument(db,"opaque",input,root)).toEqual({conflict:true})
        expect(exec.mock.calls.slice(before).some(([sql])=>/insert into |update da_/.test(String(sql)))).toBe(false)
      }
      status="correction_requested";person="daprs_other"
      const before=exec.mock.calls.length
      expect(await saveOrganizationDocument(db,"opaque",input,root)).toBeNull()
      expect(exec.mock.calls.slice(before).some(([sql])=>/insert into |update da_/.test(String(sql)))).toBe(false)
      expect(await fsp.readdir(root)).toHaveLength(2)
    }finally{spy.mockRestore();await fsp.rm(root,{recursive:true,force:true})}
  })

  it("submitOrganizationApplication verifies tax identifier, private file integrity and confidential duplicates", async () => {
    const os = require("node:os")
    const path = require("node:path")
    const fsp = require("node:fs/promises")
    const crypto = require("node:crypto")
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "da-b22-test-submit-"))
    const validPdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<<>>\nstartxref\n9\n%%EOF\n", "ascii")
    const storageKey = crypto.randomUUID()
    const filePath = path.join(root, storageKey)
    await fsp.writeFile(filePath, validPdf)
    const sha = crypto.createHash("sha256").update(validPdf).digest("hex")

    const spy = jest.spyOn(IdentitySessions.prototype, "current").mockResolvedValue({
      person_id: "daprs_applicant", actor_type: "customer", actor_id: "cus_app"
    } as any)

    const input = {
      action: "submit" as const,
      application_id: payload.application_id,
      expected_version: 2
    }

    let taxId: string | null = "12345678901"
    let hasDoc = false
    let hasDuplicates = false
    let hasOrgDuplicates = false
    let currentStatus = "draft"

    const exec = jest.fn(async (sql: string) => {
      if (sql.includes("from da_organization_application where id=? for update")) {
        return [{
          applicant_person_id: "daprs_applicant", status: currentStatus, version: 2,
          business_kind: "individual_business", legal_name: "Test Ltd",
          landline_phone: "+90 212 555 00 00", tax_identifier: taxId,
          declared_activities: ["service_repair"], primary_activity: "service_repair"
        }]
      }
      if (sql.includes("from da_organization_application_document where application_id=? and is_current=true")) {
        return hasDoc ? [{
          storage_key: storageKey,
          internal_name: `${storageKey}.pdf`,
          mime_type: "application/pdf",
          compression: "none",
          original_byte_length: validPdf.length,
          original_sha256: sha,
          stored_byte_length: validPdf.length,
          version: 1
        }] : []
      }
      if (sql.includes("where tax_identifier=? and status in ('submitted','approved') and id<>?")) {
        return hasDuplicates ? [{ id: "daorgapp_other123" }] : []
      }
      if (sql.includes("from da_organization") && sql.includes("where tax_identifier=? and status='active'")) {
        return hasOrgDuplicates ? [{ id: "daorg_existing" }] : []
      }
      if (sql.includes("update da_organization_application")) {
        return [{ version: 3 }]
      }
      return []
    })
    const db: any = { execute: exec }

    try {
      // 1. Missing tax identifier -> missing_tax_identifier: true
      taxId = null
      const missingTax = await submitOrganizationApplication(db, "opaque", input, root)
      expect(missingTax).toEqual({ missing_tax_identifier: true, missing_document: false, conflict: false })

      // 2. Missing document in DB -> missing_document: true
      taxId = "12345678901"
      hasDoc = false
      const missingDoc = await submitOrganizationApplication(db, "opaque", input, root)
      expect(missingDoc).toEqual({ missing_document: true, missing_tax_identifier: false, conflict: false })

      // 3. Document in DB, but file corrupted on disk -> missing_document: true (fail closed)
      hasDoc = true
      await fsp.writeFile(filePath, Buffer.from("corrupted bytes"))
      const corruptedDoc = await submitOrganizationApplication(db, "opaque", input, root)
      expect(corruptedDoc).toEqual({ missing_document: true, missing_tax_identifier: false, conflict: false })

      // Restore valid file
      await fsp.writeFile(filePath, validPdf)

      // 4. Document in DB, valid file, no duplicates -> submitted, version 3
      const accepted = await submitOrganizationApplication(db, "opaque", input, root)
      expect(accepted).toEqual({
        conflict: false,
        missing_document: false,
        missing_tax_identifier: false,
        application_id: payload.application_id,
        status: "submitted",
        version: 3
      })

      // 5. Document in DB, valid file, duplicate tax identifier exists -> submitted without leaking duplicate
      hasDuplicates = true
      const duplicateAccepted = await submitOrganizationApplication(db, "opaque", input, root)
      expect(duplicateAccepted).toEqual({
        conflict: false,
        missing_document: false,
        missing_tax_identifier: false,
        application_id: payload.application_id,
        status: "submitted",
        version: 3
      })

      // Verify that duplicate_review_required was recorded in da_organization_application
      const updateCalls = exec.mock.calls.filter(c => String(c[0]).includes("update da_organization_application"))
      expect(updateCalls.some((c: any) => c[1]?.[0] === true)).toBe(true)

      // Verify serialization against concurrent submissions via pg_advisory_xact_lock on da-org-tax-id
      expect(exec.mock.calls.some(c => String(c[0]).includes("da-org-tax-id"))).toBe(true)

      // 6. Document in DB, valid file, duplicate exists in active da_organization -> sets duplicate review
      hasDuplicates = false
      hasOrgDuplicates = true
      const orgDuplicateAccepted = await submitOrganizationApplication(db, "opaque", input, root)
      expect(orgDuplicateAccepted).toEqual({
        conflict: false,
        missing_document: false,
        missing_tax_identifier: false,
        application_id: payload.application_id,
        status: "submitted",
        version: 3
      })
      const updateCalls2 = exec.mock.calls.filter(c => String(c[0]).includes("update da_organization_application"))
      expect(updateCalls2.some((c: any) => c[1]?.[0] === true)).toBe(true)

      // A correction cannot be resubmitted unchanged and a terminal record
      // cannot be replayed. These denials create no audit or Organization.
      for(const state of ["correction_requested","submitted","withdrawn","rejected","approved"]){
        currentStatus=state
        const writes=()=>exec.mock.calls.filter(([sql])=>
          /update da_organization_application|insert into da_audit_event|insert into da_security_outbox/.test(String(sql))).length
        const before=writes()
        expect(await submitOrganizationApplication(db,"opaque",input,root))
          .toEqual({conflict:true,missing_document:false,missing_tax_identifier:false})
        expect(writes()).toBe(before)
      }
    } finally {
      spy.mockRestore()
      await fsp.rm(root, { recursive: true, force: true })
    }
  })

  it("listSubmittedOrganizationApplications allows organization.review staff and denies unauthorized users", async () => {
    const spyStaff = jest.spyOn(IdentitySessions.prototype, "staff")
    const exec = jest.fn(async (sql: string) => {
      if (sql.includes("from da_organization_application") && sql.includes("where status = 'submitted'")) {
        return [{
          id: payload.application_id,
          applicant_person_id: "daprs_applicant",
          business_kind: "individual_business",
          legal_name: "Test Ltd",
          landline_phone: "+90 212 555 00 00",
          tax_identifier: "12345678901",
          declared_activities: ["service_repair"],
          primary_activity: "service_repair",
          status: "submitted",
          version: 3,
          duplicate_review_required: true,
          created_at: new Date(),
          updated_at: new Date(),
          cursor_time: "2026-11-05T12:00:00.000000Z",
          doc_mime: "application/pdf",
          doc_bytes: 1000,
          doc_sha256: "a".repeat(64),
          doc_version: 1
        }]
      }
      return []
    })
    const db: any = { execute: exec }

    try {
      // 1. Authorized platform staff with organization.review grant
      spyStaff.mockResolvedValueOnce({ grant_id: "stg_1", grant_name: "organization.review" } as any)
      const queue = await listSubmittedOrganizationApplications(db, "opaque")
      expect(queue).not.toBeNull()
      expect(queue?.applications).toHaveLength(1)
      expect(queue?.applications[0].tax_identifier).toBe("12345678901")
      expect(queue?.applications[0].duplicate_review_required).toBe(true)
      expect(queue?.applications[0].has_document).toBe(true)

      // 2. Staff without organization.review (returns null)
      spyStaff.mockResolvedValueOnce(null)
      const denied = await listSubmittedOrganizationApplications(db, "opaque")
      expect(denied).toBeNull()
    } finally {
      spyStaff.mockRestore()
    }
  })

  it("readOrganizationApplicationDocument preserves applicant read and blocks unscanned platform staff", async () => {
    const os = require("node:os")
    const path = require("node:path")
    const fsp = require("node:fs/promises")
    const crypto = require("node:crypto")
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "da-b22-test-read-"))
    const validPdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<<>>\nstartxref\n9\n%%EOF\n", "ascii")
    const storageKey = crypto.randomUUID()
    await fsp.writeFile(path.join(root, storageKey), validPdf)
    const sha = crypto.createHash("sha256").update(validPdf).digest("hex")

    const spyCurrent = jest.spyOn(IdentitySessions.prototype, "current")
    const spyStaff = jest.spyOn(IdentitySessions.prototype, "staff")
    let appStatus="submitted"

    const exec = jest.fn(async (sql: string, params?: any[]) => {
      if (sql.includes("from da_organization_application where id=?")) {
        return [{ applicant_person_id: "daprs_applicant", status: appStatus }]
      }
      if (sql.includes("from da_organization_application_document where application_id=? and is_current=true")) {
        return [{
          storage_key: storageKey,
          internal_name: `${storageKey}.pdf`,
          mime_type: "application/pdf",
          compression: "none",
          original_byte_length: validPdf.length,
          original_sha256: sha,
          stored_byte_length: validPdf.length,
          version: 1
        }]
      }
      return []
    })
    const db: any = { execute: exec }

    try {
      // 1. Applicant can read
      spyCurrent.mockResolvedValueOnce({
        person_id: "daprs_applicant", actor_type: "customer", actor_id: "cus_app"
      } as any)
      const asApplicant = await readOrganizationApplicationDocument(db, "opaque", payload.application_id, root)
      expect(asApplicant).not.toBeNull()
      expect(asApplicant?.filename).toBe("vergi-levhasi-1.pdf")
      expect(asApplicant?.mimeType).toBe("application/pdf")
      expect(asApplicant?.content).toEqual(validPdf)

      // 2. Foreign person without staff grant is denied (returns null)
      spyCurrent.mockResolvedValueOnce({
        person_id: "daprs_other", actor_type: "customer", actor_id: "cus_other"
      } as any)
      spyStaff.mockResolvedValueOnce(null)
      const asStranger = await readOrganizationApplicationDocument(db, "opaque", payload.application_id, root)
      expect(asStranger).toBeNull()

      // 3. Even a granted platform reviewer must not receive an unscanned
      // original PDF/JPEG/PNG. The private file is not opened for this actor.
      spyCurrent.mockResolvedValueOnce({
        person_id: "daprs_staff", actor_type: "user", actor_id: "usr_admin"
      } as any)
      spyStaff.mockResolvedValueOnce({
        grant_id: "stg_1", grant_name: "organization.review"
      } as any)
      const beforeStaffQueries=exec.mock.calls.length
      await expect(readOrganizationApplicationDocument(db, "opaque", payload.application_id, root))
        .rejects.toBeInstanceOf(TaxCertificateReviewUnavailable)
      expect(exec.mock.calls.slice(beforeStaffQueries).some(([sql])=>
        String(sql).includes("da_organization_application_document"))).toBe(false)

      for(const disallowed of ["draft","correction_requested","withdrawn","rejected","approved"]){
        appStatus=disallowed
        spyCurrent.mockResolvedValueOnce({
          person_id:"daprs_staff",actor_type:"user",actor_id:"usr_admin"
        } as any)
        const denied=await readOrganizationApplicationDocument(db,"opaque",payload.application_id,root)
        expect(denied).toBeNull()
      }
      appStatus="draft"
      spyCurrent.mockResolvedValueOnce({
        person_id:"daprs_applicant",actor_type:"customer",actor_id:"cus_app"
      } as any)
      expect((await readOrganizationApplicationDocument(db,"opaque",payload.application_id,root))?.content)
        .toEqual(validPdf)
    } finally {
      spyCurrent.mockRestore()
      spyStaff.mockRestore()
      await fsp.rm(root, { recursive: true, force: true })
    }
  })


  it("detects orphan, missing, corrupt and restored tax files without deletion or leaking identities",async()=>{
    const os=require("node:os")
    const path=require("node:path")
    const fs=require("node:fs/promises")
    // Two isolated, freshly created synthetic private roots; no real data.
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"da-b22-tax-reconcile-"))
    const restoreRoot=await fs.mkdtemp(path.join(os.tmpdir(),"da-b22-tax-restore-"))
    const png=Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
      "base64"
    )
    try{
      const linked=await writePrivateTaxCertificate(root,prepareTaxCertificate("levha.png",png))
      const unlinked=await writePrivateTaxCertificate(root,prepareTaxCertificate("levha.png",png))
      const check=()=>inspectPrivateTaxCertificateInventory(root,[linked])
      expect(await check()).toEqual({
        referenced:1,intact:1,missingOrCorrupted:0,unreferenced:1,unexpectedEntries:0
      })
      // Read-only inspection MUST preserve unknown files and valid history.
      expect(await fs.readFile(path.join(root,unlinked.storageKey))).toBeDefined()
      // The same code path used by the authorized operator CLI: only
      // read-only PostgreSQL snapshot plus private filesystem reads.
      const queries:string[]=[]
      const reader:any={query:async (sql:string)=>{
        queries.push(sql)
        if(sql==="SHOW transaction_read_only")
          return {rows:[{transaction_read_only:"on"}]}
        if(sql===PRIVATE_TAX_DOCUMENT_READ_SQL)
          return {rows:[linked]}
        return {rows:[]}
      }}
      expect(await inspectTaxCertificateSnapshot(reader,root)).toEqual({
        referenced:1,intact:1,missingOrCorrupted:0,unreferenced:1,unexpectedEntries:0
      })
      expect(queries).toEqual([
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        "SHOW transaction_read_only",PRIVATE_TAX_DOCUMENT_READ_SQL,"ROLLBACK"
      ])
      const originalBytes=await fs.readFile(path.join(root,linked.storageKey))
      const copied=path.join(restoreRoot,linked.storageKey)
      await fs.writeFile(copied,originalBytes,{mode:0o600})
      expect(await inspectPrivateTaxCertificateInventory(restoreRoot,[linked])).toEqual({
        referenced:1,intact:1,missingOrCorrupted:0,unreferenced:0,unexpectedEntries:0
      })
      expect(await readPrivateTaxCertificate(restoreRoot,linked)).toEqual(png)
      await fs.writeFile(path.join(root,linked.storageKey),Buffer.from("broken"))
      expect(await check()).toEqual({
        referenced:1,intact:0,missingOrCorrupted:1,unreferenced:1,unexpectedEntries:0
      })
      await fs.writeFile(path.join(root,linked.storageKey),originalBytes)
      await fs.rename(path.join(root,linked.storageKey),path.join(root,"unrecognized.entry"))
      expect(await check()).toEqual({
        referenced:1,intact:0,missingOrCorrupted:1,unreferenced:1,unexpectedEntries:1
      })
      // No inventory call removed a private file or repaired it without consent.
      expect(await fs.readFile(path.join(root,"unrecognized.entry"))).toEqual(originalBytes)
      expect(await fs.readFile(path.join(root,unlinked.storageKey))).toBeDefined()
      const safeReport=JSON.stringify(await check())
      expect(safeReport).not.toContain(linked.storageKey)
      expect(safeReport).not.toContain(unlinked.storageKey)
      expect(safeReport).not.toContain(root)
    }finally{
      // ONLY our disposable test directories are destroyed.
      await fs.rm(root,{recursive:true,force:true})
      await fs.rm(restoreRoot,{recursive:true,force:true})
    }
  })

  it("refuses an unverified read-only transaction and rolls back without inspecting files",async()=>{
    const statements:string[]=[]
    const fake:any={query:async (sql:string)=>{
      statements.push(sql)
      if(sql==="SHOW transaction_read_only")return {rows:[{transaction_read_only:"off"}]}
      return {rows:[]}
    }}
    await expect(inspectTaxCertificateSnapshot(fake,"/not-a-real-private-root"))
      .rejects.toThrow("Read-only database transaction not verified")
    expect(statements).toEqual([
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "SHOW transaction_read_only","ROLLBACK"
    ])
    const tooMany:any={query:async(sql:string)=>{
      statements.push(sql)
      if(sql==="SHOW transaction_read_only")return {rows:[{transaction_read_only:"on"}]}
      if(sql===PRIVATE_TAX_DOCUMENT_READ_SQL)return {rows:Array(100001).fill({})}
      return {rows:[]}
    }}
    await expect(inspectTaxCertificateSnapshot(tooMany,"/not-a-real-private-root"))
      .rejects.toThrow("Complete private-document inventory unavailable")
    expect(statements.at(-1)).toBe("ROLLBACK")
  })

  it("reviewOrganizationApplication handles correction_requested, rejection and approval with audit", async () => {
    const spyStaff = jest.spyOn(IdentitySessions.prototype, "staff")
    const spyCurrent = jest.spyOn(IdentitySessions.prototype, "current")

    let appStatus = "submitted"
    let appVersion = 3
    let activeTaxDuplicate = false

    const exec = jest.fn(async (sql: string) => {
      if (sql.includes("from da_organization_application where id=? for update")) {
        return [{
          id: payload.application_id,
          applicant_person_id: "daprs_applicant",
          business_kind: "individual_business",
          legal_name: "Test Ltd",
          landline_phone: "+90 212 555 00 00",
          tax_identifier: "12345678901",
          declared_activities: ["service_repair"],
          primary_activity: "service_repair",
          status: appStatus,
          version: appVersion,
          duplicate_review_required: false
        }]
      }
      if (sql.includes("update da_organization_application")) {
        return [{ version: appVersion + 1 }]
      }
      if (sql.includes("from da_organization where tax_identifier=?")) {
        return activeTaxDuplicate ? [{ id: "daorg_another" }] : []
      }
      return []
    })
    const db: any = { execute: exec }
    // The Foundation service supplies the ONLY real native provisioning callback.
    const provisionNative = jest.fn(async () => ({ organizationId: "daorg_nativefixture" }))

    try {
      // 1. Non-staff is denied (returns null)
      spyStaff.mockResolvedValueOnce(null)
      const nonStaff = await reviewOrganizationApplication(db, "opaque", {
        action: "review_decision",
        application_id: payload.application_id,
        expected_version: 3,
        decision: "request_correction",
        notes: "Lütfen vergi levhanızı güncelleyin"
      })
      expect(nonStaff).toBeNull()

      // Review staff must never decide their own application, even with a grant.
      const callsBeforeOwnReview = exec.mock.calls.length
      spyStaff.mockResolvedValueOnce({ grant_id: "stg_self", grant_name: "organization.review" } as any)
      spyCurrent.mockResolvedValueOnce({ person_id: "daprs_applicant", actor_type: "user", actor_id: "usr_applicant" } as any)
      const ownReview = await reviewOrganizationApplication(db, "opaque", {
        action: "review_decision",
        application_id: payload.application_id,
        expected_version: 3,
        decision: "approve",
        notes: "This must be denied"
      })
      expect(ownReview).toBeNull()
      expect(exec.mock.calls.slice(callsBeforeOwnReview).some(
        ([sql]) => String(sql).includes("insert into da_organization")
      )).toBe(false)

      // 2. Staff requests correction -> status becomes correction_requested, audit logged
      spyStaff.mockResolvedValueOnce({ grant_id: "stg_1", grant_name: "organization.review" } as any)
      spyCurrent.mockResolvedValueOnce({ person_id: "daprs_admin", actor_type: "user", actor_id: "usr_admin" } as any)
      const correctionResult = await reviewOrganizationApplication(db, "opaque", {
        action: "review_decision",
        application_id: payload.application_id,
        expected_version: 3,
        decision: "request_correction",
        notes: "Lütfen vergi levhasını yeniden yükleyin"
      })
      expect(correctionResult).toEqual({
        conflict: false,
        application_id: payload.application_id,
        status: "correction_requested",
        version: 4
      })
      expect(exec.mock.calls.some(c => String(c[0]).includes("organization.application_correction_requested"))).toBe(true)

      // 3. Stale version returns conflict: true
      spyStaff.mockResolvedValueOnce({ grant_id: "stg_1", grant_name: "organization.review" } as any)
      const staleResult = await reviewOrganizationApplication(db, "opaque", {
        action: "review_decision",
        application_id: payload.application_id,
        expected_version: 1,
        decision: "reject",
        notes: "Reddedildi"
      })
      expect(staleResult).toEqual({ conflict: true })

      // 4. Staff rejects application -> status becomes rejected, audit logged
      appVersion = 4
      spyStaff.mockResolvedValueOnce({ grant_id: "stg_1", grant_name: "organization.review" } as any)
      spyCurrent.mockResolvedValueOnce({ person_id: "daprs_admin", actor_type: "user", actor_id: "usr_admin" } as any)
      const rejectResult = await reviewOrganizationApplication(db, "opaque", {
        action: "review_decision",
        application_id: payload.application_id,
        expected_version: 4,
        decision: "reject",
        notes: "Faaliyet belgesi uyumsuz"
      })
      expect(rejectResult).toEqual({
        conflict: false,
        application_id: payload.application_id,
        status: "rejected",
        version: 5
      })
      expect(exec.mock.calls.some(c => String(c[0]).includes("organization.application_rejected"))).toBe(true)

      // 5. Active duplicate blocks native provisioning, even with review rights.
      appVersion = 5
      activeTaxDuplicate = true
      spyStaff.mockResolvedValueOnce({ grant_id: "stg_1", grant_name: "organization.review" } as any)
      spyCurrent.mockResolvedValueOnce({ person_id: "daprs_admin", actor_type: "user", actor_id: "usr_admin" } as any)
      const deniedDuplicate = await reviewOrganizationApplication(db, "opaque", {
        action: "review_decision",
        application_id: payload.application_id,
        expected_version: 5,
        decision: "approve",
      }, provisionNative)
      expect(deniedDuplicate).toEqual({ conflict: true })
      expect(provisionNative).not.toHaveBeenCalled()

      // 6. A unique, verified application calls native Foundation provisioning
      // exactly once. This module itself must NEVER INSERT an active Owner.
      activeTaxDuplicate = false
      spyStaff.mockResolvedValueOnce({ grant_id: "stg_1", grant_name: "organization.review" } as any)
      spyCurrent.mockResolvedValueOnce({ person_id: "daprs_admin", actor_type: "user", actor_id: "usr_admin" } as any)
      const approveResult = await reviewOrganizationApplication(db, "opaque", {
        action: "review_decision",
        application_id: payload.application_id,
        expected_version: 5,
        decision: "approve",
        notes: "Tüm belgeler onaylandı"
      }, provisionNative)
      expect(approveResult).toMatchObject({
        conflict: false,
        application_id: payload.application_id,
        status: "approved",
        version: 6,
        organization_id: "daorg_nativefixture"
      })
      expect(provisionNative).toHaveBeenCalledTimes(1)
      expect(provisionNative).toHaveBeenCalledWith(expect.objectContaining({
        applicationId: payload.application_id,
        applicantPersonId: "daprs_applicant",
        taxIdentifier: "12345678901",
        reviewerPersonId: "daprs_admin",
        reviewerGrantId: "stg_1"
      }))
      expect(exec.mock.calls.some(c => String(c[0]).includes("insert into da_organization("))).toBe(false)
      expect(exec.mock.calls.some(c => String(c[0]).includes("insert into da_organization_membership"))).toBe(false)
      // Canonical Organization/Owner audit is produced by native service;
      // this module records only the application decision and its outbox.
      expect(exec.mock.calls.some(c => String(c[0]).includes("organization.application_approved"))).toBe(true)
    } finally {
      spyStaff.mockRestore()
      spyCurrent.mockRestore()
    }
  })

})
