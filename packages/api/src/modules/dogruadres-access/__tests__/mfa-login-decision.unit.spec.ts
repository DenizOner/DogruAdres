import type { Context } from "@medusajs/framework/types"
import AccessService from "../service"
import { MfaPersistence } from "../mfa-persistence"

// Real Foundation decision function under its existing Medusa context decorator.
// Persistence and binding reads are bounded mocks, not database acceptance.
describe("Foundation MFA login decision — native pending vs platform disabled",()=>{
  const service=Object.create(AccessService.prototype) as AccessService
  const execute=jest.fn()
  const context={transactionManager:{execute,flush:jest.fn()}} as unknown as Context
  let readPlatform:jest.SpyInstance
  let readPerson:jest.SpyInstance
  const previous={
    identity:process.env.DOGRUADRES_IDENTITY_ENABLED,
    settings:process.env.DOGRUADRES_MFA_SETTINGS_ENABLED,
    enrollment:process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED,
    runtime:process.env.DOGRUADRES_MFA_RUNTIME_ENABLED,
  }
  beforeEach(()=>{
    jest.resetAllMocks()
    process.env.DOGRUADRES_IDENTITY_ENABLED="true"
    process.env.DOGRUADRES_MFA_SETTINGS_ENABLED="true"
    process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED="true"
    process.env.DOGRUADRES_MFA_RUNTIME_ENABLED="true"
    execute.mockResolvedValue([{person_id:"person_synthetic"}])
    readPlatform=jest.spyOn(MfaPersistence.prototype,"readPlatformPolicy")
      .mockResolvedValue({platform_mode:"required",version:4})
    readPerson=jest.spyOn(MfaPersistence.prototype,"readPersonPreference")
      .mockResolvedValue({person_id:"person_synthetic",user_enabled:false,version:2})
  })
  afterEach(()=>{
    jest.restoreAllMocks()
    const restore=(key:string,value:string|undefined)=>{
      if(value===undefined)delete process.env[key]
      else process.env[key]=value
    }
    restore("DOGRUADRES_IDENTITY_ENABLED",previous.identity)
    restore("DOGRUADRES_MFA_SETTINGS_ENABLED",previous.settings)
    restore("DOGRUADRES_MFA_ENROLLMENT_ENABLED",previous.enrollment)
    restore("DOGRUADRES_MFA_RUNTIME_ENABLED",previous.runtime)
  })
  it("denies pending native factor when platform MFA is disabled",async()=>{
    readPlatform.mockResolvedValue({platform_mode:"disabled",version:4})
    await expect(service.personalLoginMfaDecision("auth_synthetic","pending",context))
      .rejects.toThrow("Access denied")
    expect(execute).toHaveBeenCalledTimes(1)
    expect(readPerson).toHaveBeenCalledWith("person_synthetic")
  })
  it.each(["required","optional"] as const)(
    "grants setup-only, never full, to pending factor under %s",async mode=>{
      readPlatform.mockResolvedValue({platform_mode:mode,version:4})
      await expect(service.personalLoginMfaDecision("auth_synthetic","pending",context))
        .resolves.toEqual({purpose:"mfa_enroll",expectedRevision:{platform:4,person:2}})
    })
  it("allows policy-bound primary login only without any native factor when disabled",async()=>{
    readPlatform.mockResolvedValue({platform_mode:"disabled",version:4})
    await expect(service.personalLoginMfaDecision("auth_synthetic","not_enrolled",context))
      .resolves.toEqual({purpose:"full",expectedRevision:{platform:4,person:2}})
  })
  it("cannot promote enabled native factor without a completed Medusa challenge",async()=>{
    readPlatform.mockResolvedValue({platform_mode:"disabled",version:4})
    await expect(service.personalLoginMfaDecision("auth_synthetic","enabled",context))
      .rejects.toThrow("Access denied")
  })
  it("denies ambiguous or missing identity-to-Person binding",async()=>{
    execute.mockResolvedValue([{person_id:"p1"},{person_id:"p2"}])
    await expect(service.personalLoginMfaDecision("auth_synthetic","pending",context))
      .rejects.toThrow("Access denied")
    expect(readPlatform).not.toHaveBeenCalled()
  })
  it("denies when the MFA runtime gate is not enabled",async()=>{
    delete process.env.DOGRUADRES_MFA_RUNTIME_ENABLED
    await expect(service.personalLoginMfaDecision("auth_synthetic","pending",context))
      .rejects.toThrow("Access denied")
    expect(execute).not.toHaveBeenCalled()
  })
})
