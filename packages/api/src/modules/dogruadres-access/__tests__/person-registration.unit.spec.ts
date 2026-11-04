import type { Context } from "@medusajs/framework/types"
import Access from "../service"

describe("M0 canonical Person first registration — Foundation transaction",()=>{
  const phone="+905551234567",identity="authid_new",customer="cus_new"
  let service:Access,execute:jest.Mock,flush:jest.Mock,mappings:jest.Mock,people:jest.Mock,audit:jest.Mock,context:Context
  let mappingRows:any[],bindingRows:any[],verifiedRows:any[],existingPhone:string|null,existingActive:boolean
  beforeEach(()=>{
    mappingRows=[];bindingRows=[];verifiedRows=[];existingPhone=phone;existingActive=true
    execute=jest.fn(async(sql:string,args:unknown[]=[])=>{
      if(sql.includes("pg_advisory_xact_lock")){
        expect(args).toEqual([identity]);return [{}]
      }
      if(sql.includes("from da_login_binding where auth_identity_id")){
        expect(args).toEqual([identity]);return bindingRows
      }
      if(sql.includes("from da_verified_actor_binding where person_id=")){
        expect(args).toEqual(["daprs_new"]);return verifiedRows
      }
      if(sql.includes("insert into da_verified_actor_binding")){
        expect(args[0]).toMatch(/^dabind_/)
        expect(args.slice(1)).toEqual(["daprs_new",identity,customer])
        expect(flush).toHaveBeenCalledTimes(1)
        return []
      }
      if(sql.includes("select mobile_phone from da_person")){
        expect(args).toEqual(["daprs_new"])
        return existingActive?[{mobile_phone:existingPhone}]:[]
      }
      if(sql.includes("insert into da_login_binding")){
        expect(flush).toHaveBeenCalledTimes(1)
        expect(args).toEqual([identity,"daprs_new",customer]);return []
      }
      throw Error("Unexpected SQL: "+sql)
    })
    mappings=jest.fn().mockImplementation(async()=>mappingRows)
    people=jest.fn().mockResolvedValue([{id:"daprs_new"}])
    audit=jest.fn().mockResolvedValue([])
    service=Object.create(Access.prototype) as Access
    Object.assign(service,{
      listActorMappings:mappings,createPeople:people,
      createActorMappings:jest.fn().mockResolvedValue([{id:"daact_new"}]),
      persistAuditEventsWithOutbox_:audit,
    })
    flush=jest.fn().mockResolvedValue(undefined)
    context={transactionManager:{execute,flush}} as unknown as Context
  })
  it("creates exactly one own Person with mandatory private mobile and no Organization/Staff grant",async()=>{
    expect(await service.personalRegisterCustomer(identity,customer,phone,"Test Kişi",context))
      .toEqual({created:true})
    expect(people).toHaveBeenCalledWith([{display_name:"Test Kişi",
      mobile_phone:phone,mobile_version:1}],context)
    expect(mappings).toHaveBeenCalledWith({actor_type:"customer",actor_id:customer},
      {take:2},context)
    expect((service as any).createActorMappings).toHaveBeenCalledWith([{
      actor_type:"customer",actor_id:customer,person_id:"daprs_new",
      created_by_actor_type:"customer",created_by_actor_id:customer,
    }],context)
    expect(execute.mock.calls.map(x=>x[0])).toEqual([
      expect.stringContaining("pg_advisory_xact_lock"),
      expect.stringContaining("from da_login_binding where auth_identity_id"),
      expect.stringContaining("insert into da_login_binding"),
      expect.stringContaining("insert into da_verified_actor_binding"),
    ])
    expect(flush).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledTimes(1)
    const event=audit.mock.calls[0][0][0]
    expect(event).toMatchObject({
      actor_person_id:"daprs_new",actor_type:"customer",actor_id:customer,
      action:"person.registered",resource:"person-contact",
      new_values:{contact_recorded:true,email_verification_claimed:false}
    })
    expect(JSON.stringify(audit.mock.calls)).not.toContain(phone)
    expect(JSON.stringify(audit.mock.calls)).not.toContain("Test Kişi")
    expect(audit.mock.calls[0][1]).toBe(context)
  })
  it("allows idempotent same-identity readback but never overwrites saved mobile",async()=>{
    mappingRows=[{person_id:"daprs_new"}]
    bindingRows=[{person_id:"daprs_new",actor_type:"customer",
      actor_id:customer,revoked_at:null}]
    verifiedRows=[{person_id:"daprs_new",auth_identity_id:identity,
      actor_id:customer,revoked_at:null}]
    expect(await service.personalRegisterCustomer(identity,customer,"+905551234568","Other",context))
      .toEqual({created:false})
    expect(people).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
  it("does not silently re-create a missing or revoked primary Customer proof",async()=>{
    mappingRows=[{person_id:"daprs_new"}]
    bindingRows=[{person_id:"daprs_new",actor_type:"customer",
      actor_id:customer,revoked_at:null}]
    await expect(service.personalRegisterCustomer(identity,customer,phone,"Test",context))
      .rejects.toThrow()
    verifiedRows=[{person_id:"daprs_new",auth_identity_id:identity,
      actor_id:customer,revoked_at:new Date()}]
    await expect(service.personalRegisterCustomer(identity,customer,phone,"Test",context))
      .rejects.toThrow()
    expect(people).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
  it("never treats a disabled or mobile-less legacy Person as registered",async()=>{
    bindingRows=[{person_id:"daprs_new",actor_type:"customer",
      actor_id:customer,revoked_at:null}]
    mappingRows=[{person_id:"daprs_new"}]
    existingPhone=null
    await expect(service.personalRegisterCustomer(identity,customer,phone,"Test",context))
      .rejects.toThrow()
    existingPhone=phone;existingActive=false
    await expect(service.personalRegisterCustomer(identity,customer,phone,"Test",context))
      .rejects.toThrow()
    expect(people).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
  it("denies foreign Person mapping, revoked binding or actor takeover",async()=>{
    mappingRows=[{person_id:"daprs_foreign"}]
    await expect(service.personalRegisterCustomer(identity,customer,phone,"Test",context))
      .rejects.toThrow()
    bindingRows=[{person_id:"daprs_new",actor_type:"customer",
      actor_id:customer,revoked_at:new Date()}]
    mappingRows=[{person_id:"daprs_new"}]
    await expect(service.personalRegisterCustomer(identity,customer,phone,"Test",context))
      .rejects.toThrow()
    expect(people).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
  it("does not make database calls for malformed actor ID or absent mobile",async()=>{
    for(const [authId,customerId,num] of [
      [identity,customer,""],
      [identity,customer,"+90-555"],
      ["other",customer,phone],
      [identity,"usr_foreign",phone],
    ]){
      await expect(service.personalRegisterCustomer(authId,customerId,num,"Test",context))
        .rejects.toThrow()
    }
    expect(execute).not.toHaveBeenCalled()
    expect(people).not.toHaveBeenCalled()
  })
  it("refuses to insert login binding if the enclosing EntityManager cannot flush",async()=>{
    context={transactionManager:{execute}} as unknown as Context
    await expect(service.personalRegisterCustomer(identity,customer,phone,"Test",context))
      .rejects.toThrow("Foundation transaction manager unavailable")
    expect(execute.mock.calls.some(([sql])=>String(sql).includes("insert into da_login_binding")))
      .toBe(false)
    expect(audit).not.toHaveBeenCalled()
  })
  it("surfaces audit failure so the enclosing Foundation transaction can roll back",async()=>{
    audit.mockRejectedValue(Error("Outbox unavailable"))
    await expect(service.personalRegisterCustomer(identity,customer,phone,"Test",context))
      .rejects.toThrow("Outbox unavailable")
    expect(people).toHaveBeenCalledTimes(1)
  })
})
