import { IdentitySessions, mfaRuntimeEnforced, digest } from "../identity-session"
describe("MFA version-bound session scope",()=>{
  const token="S".repeat(43),now=Date.now()
  const record={id:digest(token),person_id:"daprs_1",auth_identity_id:"auth_1",actor_type:"user",
    actor_id:"user_1",status:"active",epoch:0,current_epoch:0,disabled_at:null,
    created_at:new Date(now-1000),last_activity_at:new Date(now-1000),last_strong_auth_at:null,
    csrf_hash:"csrf",now_ms:now,mfa_purpose:"mfa_enroll",mfa_platform_version:0,mfa_person_version:0}
  const queries:string[]=[]
  const session=(row:any=record,versions={platform:0,person:0})=>new IdentitySessions({
    async execute(sql:string,_params?:unknown[]):Promise<any[]>{
      queries.push(sql)
      if(sql.includes("from da_browser_session s join da_person"))return [row]
      if(sql.includes("as platform,")&&sql.includes("as person"))
        return [{...versions,mfa_activated:"true"}]
      if(sql.includes("from da_session_policy"))return [{
        idle_timeout_seconds:1800,absolute_lifetime_seconds:28800,recent_auth_seconds:300,
        mfa_activated:"true",
      }]
      return []
    },
  })
  beforeEach(()=>{
    queries.length=0
    process.env.DOGRUADRES_IDENTITY_ENABLED="true"
    process.env.DOGRUADRES_MFA_SETTINGS_ENABLED="true"
    process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED="true"
    process.env.DOGRUADRES_MFA_RUNTIME_ENABLED="true"
  })
  afterEach(()=>{
    for(const name of ["DOGRUADRES_IDENTITY_ENABLED","DOGRUADRES_MFA_SETTINGS_ENABLED",
      "DOGRUADRES_MFA_ENROLLMENT_ENABLED","DOGRUADRES_MFA_RUNTIME_ENABLED"])delete process.env[name]
  })
  it("requires every rollout flag",()=>{
    expect(mfaRuntimeEnforced()).toBe(true)
    delete process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED
    expect(mfaRuntimeEnforced()).toBe(false)
  })
  it.each(["legacy","mfa_enroll","unknown"])("denies ordinary work with %s scope",async scope=>{
    await expect(session({...record,mfa_purpose:scope}).current(token)).resolves.toBeNull()
    expect(queries.some(q=>q.includes("last_activity_at=clock_timestamp()"))).toBe(false)
  })
  it("full sessions may enter setup path with fresh password proof, without downgrading Person/Org authority",async()=>{
    const s=session({...record,mfa_purpose:"full"})
    await expect(s.enrollment(token)).resolves.toMatchObject({
      person_id:"daprs_1",mfa_purpose:"full",
    })
    await expect(s.current(token)).resolves.toMatchObject({mfa_purpose:"full"})
  })
  it("enrollment-only scope is permitted solely in setup path",async()=>{
    const s=session()
    expect(await s.current(token)).toBeNull()
    expect(await s.enrollment(token)).toMatchObject({person_id:"daprs_1",mfa_purpose:"mfa_enroll"})
  })
  it("rejects old legacy cookies after runtime gate starts",async()=>{
    await expect(session({...record,mfa_purpose:"legacy",mfa_platform_version:null,mfa_person_version:null})
      .current(token)).resolves.toBeNull()
  })
  it("rejects stale platform or Person revision even with full scope",async()=>{
    for(const revisions of [{platform:1,person:0},{platform:0,person:1}]){
      await expect(session({...record,mfa_purpose:"full"},revisions).current(token))
        .resolves.toBeNull()
    }
  })
  it("only matching full scope grants general (not sensitive) work",async()=>{
    const s=session({...record,mfa_purpose:"full"})
    expect(await s.current(token)).toMatchObject({person_id:"daprs_1",mfa_purpose:"full"})
    await expect(s.current(token,true)).resolves.toBeNull()
  })
  it("rejects corrupt stored policy stamps",async()=>{
    await expect(session({...record,mfa_purpose:"full",mfa_platform_version:null}).current(token))
      .rejects.toThrow("Access denied")
  })
  it("a once-armed persisted rollout DENIES legacy or full session on env rollback",async()=>{
    delete process.env.DOGRUADRES_MFA_RUNTIME_ENABLED
    await expect(session({...record,mfa_purpose:"full"}).current(token)).resolves.toBeNull()
    await expect(session().enrollment(token)).resolves.toBeNull()
  })
  it("refuses session promotion when runtime flag is true but the database latch is not armed",async()=>{
    const s=new IdentitySessions({
      execute:jest.fn(async(sql:string):Promise<any[]>=>{
        if(sql.includes("as mfa_activated"))return [{platform:0,person:0,mfa_activated:"false"}]
        return []
      }),
    })
    await expect(s.create("auth_1",new Date(),"full")).rejects.toThrow("Access denied")
  })
})
