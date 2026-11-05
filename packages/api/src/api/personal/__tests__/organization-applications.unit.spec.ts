import {
  decodeOrganizationDraftCursor,
  listOrganizationDrafts,
  withdrawOrganizationDraft,
  saveOrganizationDocument,
  submitOrganizationApplication,
  readOrganizationApplicationDocument
} from "../../../modules/dogruadres-access/organization-application"
import { IdentitySessions } from "../../../modules/dogruadres-access/identity-session"
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
  }
  let req:any,res:any,service:any
  beforeEach(()=>{
    jest.resetAllMocks()
    service={
      personalOrganizationApplicationDrafts:jest.fn().mockResolvedValue({drafts:[],next_cursor:null}),
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
    const exec=jest.fn(async(sql:string)=>{
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
      state="draft"
      const result=await withdrawOrganizationDraft(db,"opaque",input)
      expect(result).toEqual({conflict:false,application_id:id,status:"withdrawn",version:4})
      const statements=exec.mock.calls.map(args=>String(args[0]))
      expect(statements.filter(sql=>sql.includes("pg_advisory_xact_lock"))).toHaveLength(4)
      expect(statements.filter(sql=>sql.includes("update da_organization_application"))).toHaveLength(1)
      expect(statements.filter(sql=>sql.includes("insert into da_audit_event"))).toHaveLength(1)
      expect(statements.filter(sql=>sql.includes("insert into da_security_outbox"))).toHaveLength(1)
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

    // Denied caller
    service.personalReadOrganizationApplicationDocument.mockResolvedValueOnce(null)
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(403)

    // Invalid appId format
    req.query = { action: "document", application_id: "invalid_id" }
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(400)
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

  it("submitOrganizationApplication verifies presence of current document before status transition", async () => {
    const spy = jest.spyOn(IdentitySessions.prototype, "current").mockResolvedValue({
      person_id: "daprs_applicant", actor_type: "customer", actor_id: "cus_app"
    } as any)

    const input = {
      action: "submit" as const,
      application_id: payload.application_id,
      expected_version: 2
    }

    let hasDoc = false
    const exec = jest.fn(async (sql: string) => {
      if (sql.includes("from da_organization_application where id=? for update")) {
        return [{
          applicant_person_id: "daprs_applicant", status: "draft", version: 2,
          business_kind: "individual_business", legal_name: "Test Ltd",
          landline_phone: "+90 212 555 00 00", declared_activities: ["service_repair"],
          primary_activity: "service_repair"
        }]
      }
      if (sql.includes("from da_organization_application_document where application_id=? and is_current=true")) {
        return hasDoc ? [{ id: "da_doc_1" }] : []
      }
      if (sql.includes("update da_organization_application")) {
        return [{ version: 3 }]
      }
      return []
    })
    const db: any = { execute: exec }

    try {
      // 1. Without document -> missing_document: true
      const denied = await submitOrganizationApplication(db, "opaque", input)
      expect(denied).toEqual({ missing_document: true, conflict: false })

      // 2. With document -> status: 'submitted'
      hasDoc = true
      const accepted = await submitOrganizationApplication(db, "opaque", input)
      expect(accepted).toEqual({
        conflict: false,
        missing_document: false,
        application_id: payload.application_id,
        status: "submitted",
        version: 3
      })
      const statements = exec.mock.calls.map(c => String(c[0]))
      expect(statements.filter(s => s.includes("organization.application_submitted"))).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })

  it("readOrganizationApplicationDocument allows applicant and authorized platform staff, but denies unauthorized third-party", async () => {
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

    const exec = jest.fn(async (sql: string, params?: any[]) => {
      if (sql.includes("from da_organization_application where id=?")) {
        return [{ applicant_person_id: "daprs_applicant", status: "submitted" }]
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
      spyStaff.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      const asStranger = await readOrganizationApplicationDocument(db, "opaque", payload.application_id, root)
      expect(asStranger).toBeNull()

      // 3. Platform staff with organization.review can read
      spyCurrent.mockResolvedValueOnce({
        person_id: "daprs_staff", actor_type: "user", actor_id: "usr_admin"
      } as any)
      spyStaff.mockResolvedValueOnce({
        staff_grant_id: "stg_1", grant_name: "organization.review"
      } as any)
      const asStaff = await readOrganizationApplicationDocument(db, "opaque", payload.application_id, root)
      expect(asStaff).not.toBeNull()
      expect(asStaff?.content).toEqual(validPdf)
    } finally {
      spyCurrent.mockRestore()
      spyStaff.mockRestore()
      await fsp.rm(root, { recursive: true, force: true })
    }
  })

})
