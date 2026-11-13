import type { Context } from "@medusajs/framework/types"
import Access from "../service"
import { IdentitySessions, digest } from "../identity-session"

describe("canonical Person mobile contact persistence (synthetic transaction)",()=>{
  const mobile="+905551234567"
  const session={person_id:"daprs_self",actor_type:"user",actor_id:"usr_self"}
  let current:jest.SpyInstance
  let currentForWrite:jest.SpyInstance
  let execute:jest.Mock
  let audit:jest.Mock
  let context:Context
  let service:Access
  let row:{mobile_phone:string|null,mobile_version:number}
  beforeEach(()=>{
    row={mobile_phone:null,mobile_version:0}
    execute=jest.fn(async(sql:string,args:unknown[]=[])=>{
      if(sql.includes("select mobile_phone,mobile_version from da_person"))
        return [{...row}]
      if(sql.includes("update da_person set mobile_phone")){
        expect(args[1]).toBe(session.person_id)
        expect(args[2]).toBe(row.mobile_version)
        row={mobile_phone:args[0] as string,mobile_version:row.mobile_version+1}
        return [{...row}]
      }
      throw new Error("Unexpected SQL: "+sql)
    })
    current=jest.spyOn(IdentitySessions.prototype,"current")
      .mockResolvedValue(session as any)
    currentForWrite=jest.spyOn(IdentitySessions.prototype,"currentForPersonWrite")
      .mockResolvedValue(session as any)
    audit=jest.fn().mockResolvedValue([])
    service=Object.create(Access.prototype) as Access
    Object.assign(service,{persistAuditEventsWithOutbox_:audit})
    context={transactionManager:{execute}} as unknown as Context
  })
  afterEach(()=>jest.restoreAllMocks())
  it("acquires the Person row before the security/session validation locks",async()=>{
    // Exercise the real method, not this suite's service-call spy.
    currentForWrite.mockRestore()
    const token="a".repeat(43)
    const db={execute:jest.fn(async(sql:string,args:unknown[]=[])=>{
      expect(sql).toContain("from da_browser_session s")
      expect(sql).toMatch(/for (update|share) of p/)
      expect(sql).toContain("s.status='active'")
      expect(args).toEqual([digest(token)])
      return [{id:session.person_id}]
    })}
    const checker=new IdentitySessions(db)
    const verify=jest.spyOn(checker as any,"currentHash")
      .mockResolvedValue(session as any)
    expect(await checker.currentForPersonWrite(token)).toEqual(session)
    expect(db.execute).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledWith(digest(token),true,true)
    verify.mockClear()
    expect(await checker.currentWithPersonLock(token,false,false)).toEqual(session)
    expect(verify).toHaveBeenCalledWith(digest(token),false,false)
    expect(db.execute).toHaveBeenCalledTimes(2)
    expect(db.execute.mock.calls[0][0]).toContain("for update of p")
    verify.mockClear()
    expect(await checker.currentWithPersonLock(token,false,false,true)).toEqual(session)
    expect(verify).toHaveBeenCalledWith(digest(token),false,false)
    expect(db.execute.mock.calls[2][0]).toContain("for share of p")
    expect(db.execute).toHaveBeenCalledTimes(3)
    verify.mockResolvedValue(null)
    expect(await checker.currentForPersonWrite(token)).toBeNull()
    expect(db.execute).toHaveBeenCalledTimes(4)
    await expect(checker.currentForPersonWrite("bad")).rejects.toThrow("Access denied")
    expect(db.execute).toHaveBeenCalledTimes(4)
  })
  it("reads a private Person contact using only server-verified session identity",async()=>{
    row={mobile_phone:mobile,mobile_version:9}
    const r=await service.personalMobile("opaque-session",context)
    expect(r).toEqual({mobile_phone:mobile,version:9})
    expect(current).toHaveBeenCalledWith("opaque-session",false,false)
    expect(execute.mock.calls[0][1]).toEqual(["daprs_self"])
    expect(audit).not.toHaveBeenCalled()
  })
  it("persists exactly one Person change and emits a private-number-free audit/outbox in the same transaction",async()=>{
    const r=await service.personalSaveMobile("opaque-session",mobile,0,context)
    expect(r).toEqual({mobile_phone:mobile,version:1})
    expect(currentForWrite).toHaveBeenCalledWith("opaque-session")
    expect(execute).toHaveBeenCalledTimes(2)
    expect(audit).toHaveBeenCalledTimes(1)
    const event=audit.mock.calls[0][0][0]
    expect(event).toEqual(expect.objectContaining({
      actor_person_id:"daprs_self",action:"person.mobile_updated",
      resource:"person-contact",target_id:"daprs_self",
    }))
    expect(JSON.stringify(audit.mock.calls)).not.toContain(mobile)
    expect(audit.mock.calls[0][1]).toBe(context)
  })
  it("does not duplicate a mutation or audit for the same already-saved value",async()=>{
    row={mobile_phone:mobile,mobile_version:3}
    const r=await service.personalSaveMobile("opaque-session",mobile,3,context)
    expect(r).toEqual({mobile_phone:mobile,version:3})
    expect(execute).toHaveBeenCalledTimes(1)
    expect(audit).not.toHaveBeenCalled()
  })
  it("refuses a stale version without overwriting newer contact",async()=>{
    row={mobile_phone:mobile,mobile_version:4}
    expect(await service.personalSaveMobile("opaque-session","+905551234568",3,context))
      .toEqual({conflict:true})
    expect(row.mobile_phone).toBe(mobile)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(audit).not.toHaveBeenCalled()
  })
  it("never reads or writes for an unbound, revoked or weak session",async()=>{
    current.mockResolvedValue(null)
    currentForWrite.mockResolvedValue(null)
    expect(await service.personalMobile("expired",context)).toBeNull()
    expect(await service.personalSaveMobile("expired",mobile,0,context)).toBeNull()
    expect(execute).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
})
