import type { Context } from "@medusajs/framework/types"
import AccessService from "../service"
import { IdentitySessions } from "../identity-session"
import { MfaPersistence } from "../mfa-persistence"

describe("M0 MFA server-owned authorization boundary", () => {
  const token="current-opaque-session"
  const service=Object.create(AccessService.prototype) as AccessService
  const context={
    transactionManager:{execute:jest.fn(async()=>[]),flush:jest.fn(async()=>undefined)},
  } as unknown as Context
  const primary={person_id:"daprs_self",actor_type:"user",actor_id:"user_self",auth_identity_id:"auth_self"} as any
  const platform={platform_mode:"optional" as const,version:2}
  let current:jest.SpyInstance,staff:jest.SpyInstance,readPlatform:jest.SpyInstance,
    readPerson:jest.SpyInstance,setPerson:jest.SpyInstance,setPlatform:jest.SpyInstance

  beforeEach(()=>{
    current=jest.spyOn(IdentitySessions.prototype,"current").mockResolvedValue(primary)
    staff=jest.spyOn(IdentitySessions.prototype,"staff").mockResolvedValue(null)
    readPlatform=jest.spyOn(MfaPersistence.prototype,"readPlatformPolicy").mockResolvedValue(platform)
    readPerson=jest.spyOn(MfaPersistence.prototype,"readPersonPreference").mockResolvedValue({
      person_id:"daprs_self",user_enabled:false,version:1,
    })
    setPerson=jest.spyOn(MfaPersistence.prototype,"setPersonPreference").mockResolvedValue({
      person_id:"daprs_self",user_enabled:true,version:2,
    })
    setPlatform=jest.spyOn(MfaPersistence.prototype,"setPlatformPolicy").mockResolvedValue(platform)
  })
  afterEach(()=>jest.restoreAllMocks())

  it("GET reads only the current Person and exposes no platform management without exact grant",async()=>{
    const result=await service.personalMfaSettings(token,context)
    expect(current).toHaveBeenCalledWith(token)
    expect(readPerson).toHaveBeenCalledWith("daprs_self")
    expect(staff).toHaveBeenCalledWith(token,"security.mfa.manage","platform")
    expect(result).toEqual({
      platform,personal:{person_id:"daprs_self",user_enabled:false,version:1},
      can_manage_platform:false,native_factor_state:"unverified",
    })
  })
  it("GET does not access preferences when current Person session fails",async()=>{
    current.mockResolvedValue(null)
    await expect(service.personalMfaSettings(token,context)).resolves.toBeNull()
    expect(readPlatform).not.toHaveBeenCalled()
    expect(readPerson).not.toHaveBeenCalled()
  })
  it("self-service only writes the server-retrieved Person under recent strong auth",async()=>{
    await service.personalSetMfaPreference(token,true,1,context)
    expect(current).toHaveBeenCalledWith(token,true)
    expect(setPerson).toHaveBeenCalledWith("daprs_self",true,1,{
      person_id:"daprs_self",actor_type:"user",actor_id:"user_self",
    })
    expect(setPlatform).not.toHaveBeenCalled()
  })
  it.each(["required","disabled"])("blocks user preference updates when platform is %s",async mode=>{
    readPlatform.mockResolvedValue({platform_mode:mode,version:3})
    await expect(service.personalSetMfaPreference(token,true,1,context)).resolves.toBeNull()
    expect(setPerson).not.toHaveBeenCalled()
  })
  it("blocks personal mutation on expired or non-recent strong auth",async()=>{
    current.mockResolvedValue(null)
    await expect(service.personalSetMfaPreference(token,true,1,context)).resolves.toBeNull()
    expect(setPerson).not.toHaveBeenCalled()
  })
  it("denies platform mutation unless exact security.mfa.manage task grant is present",async()=>{
    await expect(service.personalSetPlatformMfaMode(token,"required",2,context)).resolves.toBeNull()
    expect(staff).toHaveBeenCalledWith(token,"security.mfa.manage","platform")
    expect(setPlatform).not.toHaveBeenCalled()
  })
  it("uses only a current platform-specific staff grant's native Person and actor",async()=>{
    staff.mockResolvedValue(primary)
    await service.personalSetPlatformMfaMode(token,"optional",1,context)
    expect(setPlatform).toHaveBeenCalledWith("optional",1,{
      person_id:"daprs_self",actor_type:"user",actor_id:"user_self",
    })
  })
  it("never treats an organization.provision grant as platform MFA permission",async()=>{
    staff.mockImplementation(async (_token:string,task:string)=>
      task==="organization.provision"?primary:null)
    await service.personalSetPlatformMfaMode(token,"disabled",1,context)
    expect(setPlatform).not.toHaveBeenCalled()
  })
})
