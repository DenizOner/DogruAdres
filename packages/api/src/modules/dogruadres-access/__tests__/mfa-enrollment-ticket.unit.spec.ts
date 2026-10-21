import { MfaEnrollmentTickets } from "../mfa-enrollment-ticket"
import { IdentitySessions, digest } from "../identity-session"

describe("MFA purpose-bound enrollment tickets (source contract only)",()=>{
  const cookie="S".repeat(43), ticket="T".repeat(43)
  const session={id:digest(cookie),person_id:"daprs_self",auth_identity_id:"auth_self",actor_type:"user",actor_id:"user_self"}
  const execute=jest.fn(async(sql:string,_parameters?:unknown[]):Promise<any[]>=>{
    if(sql.includes("returning auth_identity_id,factor_id,attempts"))return [{auth_identity_id:"auth_self",factor_id:"mfa_pending",attempts:1}]
    if(sql.includes("returning id"))return [{id:digest(ticket)}]
    return []
  })
  const current=jest.spyOn(IdentitySessions.prototype,"current")
  const create=jest.spyOn(IdentitySessions.prototype,"create")
  beforeEach(()=>{
    execute.mockClear()
    current.mockResolvedValue(session as any)
    create.mockResolvedValue({token:"N".repeat(43),csrf:"C".repeat(43)})
  })
  afterAll(()=>{current.mockRestore();create.mockRestore()})
  const sut=()=>new MfaEnrollmentTickets({execute})

  it("rejects cross-AuthIdentity password proof before any mutation",async()=>{
    await expect(sut().beginAfterPasswordProof(cookie,"auth_another","mfa_pending")).resolves.toBeNull()
    expect(execute).not.toHaveBeenCalled()
  })
  it("creates one hashed, expiring ticket and audit/outbox under the caller transaction",async()=>{
    const result=await sut().beginAfterPasswordProof(cookie,"auth_self","mfa_pending")
    expect(result?.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const insertion=execute.mock.calls.find(x=>x[0].includes("insert into da_mfa_enrollment_intent"))
    expect(insertion?.[1]?.[0]).toBe(digest(result!.ticket))
    expect(insertion?.[1]).not.toContain(result!.ticket)
    expect(insertion?.[1]?.slice(1,5)).toEqual([session.id,session.person_id,session.auth_identity_id,"mfa_pending"])
    expect(execute.mock.calls.some(x=>x[0].includes("insert into da_audit_event"))).toBe(true)
    expect(execute.mock.calls.some(x=>x[0].includes("insert into da_security_outbox"))).toBe(true)
  })
  it("does not issue a challenge for absent active browser session",async()=>{
    current.mockResolvedValue(null)
    await expect(sut().beginAfterPasswordProof(cookie,"auth_self","mfa_pending")).resolves.toBeNull()
    expect(execute).not.toHaveBeenCalled()
  })
  it("requires exact browser session, Person and native identity for an attempt",async()=>{
    await expect(sut().claimVerificationAttempt(cookie,ticket)).resolves.toEqual({
      auth_identity_id:"auth_self",factor_id:"mfa_pending",
    })
    const stmt=execute.mock.calls.find(x=>x[0].includes("set attempts=attempts+1"))
    expect(stmt?.[0]).toContain("attempts<5")
    expect(stmt?.[0]).toContain("expires_at>clock_timestamp()")
    expect(stmt?.[1]).toEqual([digest(ticket),session.id,session.person_id,session.auth_identity_id])
  })
  it("rejects invalid or missing verification ticket without touching SQL",async()=>{
    for(const v of ["","wrong","z".repeat(44)]){
      await expect(sut().claimVerificationAttempt(cookie,v)).resolves.toBeNull()
    }
    expect(execute).not.toHaveBeenCalled()
  })
  it("consumes exact verified factor and rotates all older Person sessions",async()=>{
    const result=await sut().completeAfterNativeVerification(cookie,ticket,"mfa_pending",new Date(Date.now()-1000))
    expect(result?.token).toBe("N".repeat(43))
    expect(create).toHaveBeenCalledWith("auth_self",expect.any(Date))
    const consume=execute.mock.calls.find(x=>x[0].includes("set consumed_at=clock_timestamp()"))
    expect(consume?.[1]).toEqual([digest(ticket),session.id,session.person_id,session.auth_identity_id,"mfa_pending"])
    expect(execute.mock.calls.some(x=>x[0].includes("set status='revoked'"))).toBe(true)
  })
  it("never mints a strong session if ticket was revoked, used, expired or already consumed",async()=>{
    execute.mockImplementation(async(sql:string)=>{
      if(sql.includes("returning id"))return []
      return []
    })
    await expect(sut().completeAfterNativeVerification(cookie,ticket,"mfa_pending",new Date())).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
  it("never accepts future verification time or untrusted factor ID",async()=>{
    await expect(sut().completeAfterNativeVerification(cookie,ticket,"",new Date())).resolves.toBeNull()
    await expect(sut().completeAfterNativeVerification(cookie,ticket,"mfa_pending",new Date(Date.now()+60000))).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
})
