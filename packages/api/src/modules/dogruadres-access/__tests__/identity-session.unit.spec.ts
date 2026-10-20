import { csrfToken, digest, IdentitySessions, opaque, securitySql } from "../identity-session"
import { DEFAULT_SESSION_POLICY } from "../session-policy"
import { createHash,createDecipheriv } from "node:crypto"
import { getAuthContextFromJwtToken } from "@medusajs/framework/http"

describe("persistent identity/session boundaries (SQL mocks, not PostgreSQL evidence)",()=>{
  const previous = process.env.COOKIE_SECRET
  beforeAll(()=>{process.env.COOKIE_SECRET="unit-only-"+"x".repeat(48)})
  afterAll(()=>{if(previous===undefined)delete process.env.COOKIE_SECRET;else process.env.COOKIE_SECRET=previous})
  const now = Date.now()
  function setup(overrides: Record<string,unknown> = {}) {
    const row = {id:"hash",person_id:"person",actor_type:"customer",actor_id:"customer",csrf_hash:"hash",epoch:0,current_epoch:0,
      created_at:new Date(now-1000),last_activity_at:new Date(now-1000),last_strong_auth_at:null,status:"active",now_ms:now,...overrides}
    const execute = jest.fn(async (sql:string)=>sql.startsWith("select s.")?[row]:sql.startsWith("select idle_")?[DEFAULT_SESSION_POLICY]:[])
    return {execute,service:new IdentitySessions({execute})}
  }
  it("generates 256-bit opaque values and hashes at rest",()=>{const a=opaque(),b=opaque();expect(a).toHaveLength(43);expect(a).not.toBe(b);expect(digest(a)).toHaveLength(64);expect(digest(a)).not.toContain(a)})
  it("CSRF is stable for one cookie and distinct across sessions",()=>{const a=opaque();expect(csrfToken(a)).toBe(csrfToken(a));expect(csrfToken(a)).not.toBe(csrfToken(opaque()))})
  it("rejects missing SQL authority",()=>expect(()=>securitySql({})).toThrow())
  it("permits general work without inventing strong authentication",async()=>{const {service}=setup();expect(await service.current(opaque())).toMatchObject({person_id:"person"})})
  it("denies sensitive work without completed strong authentication",async()=>{const {service}=setup();expect(await service.current(opaque(),true)).toBeNull()})
  it.each(["revoked","expired"])("does not resurrect %s sessions",async status=>{const {service,execute}=setup({status});expect(await service.current(opaque())).toBeNull();expect(execute.mock.calls.some(([s])=>s.includes("last_activity_at=clock_timestamp"))).toBe(false)})
  it.each([{disabled_at:new Date()},{current_epoch:1},{created_at:new Date(now-28800000)}])("persists fail-closed terminal state before returning denial: %j",async fields=>{const {service,execute}=setup(fields);expect(await service.current(opaque())).toBeNull();expect(execute.mock.calls.some(([s])=>s.startsWith("update da_browser_session set status="))).toBe(true)})
  it("does not first-match ambiguous identity bindings",async()=>{const service=new IdentitySessions({execute:jest.fn().mockResolvedValue([{},{}])});await expect(service.create("identity")).rejects.toThrow("Access denied")})
  it("database failures propagate rather than authorizing",async()=>{const service=new IdentitySessions({execute:jest.fn().mockRejectedValue(new Error("db offline"))});await expect(service.current(opaque())).rejects.toThrow("db offline")})
  function renewal(expiresIn:number,status="active"){
    const identity={id:"identity",app_metadata:{customer_id:"customer"}}
    const row={id:"hash",person_id:"person",auth_identity_id:identity.id,actor_type:"customer",actor_id:"customer",csrf_hash:"hash",epoch:0,current_epoch:0,
      created_at:new Date(now-1000),last_activity_at:new Date(now-1000),last_strong_auth_at:null,status,now_ms:now}
    const execute=jest.fn(async(sql:string,_parameters?:unknown[])=>sql.startsWith("select s.")?[row]:sql.startsWith("select idle_")?[DEFAULT_SESSION_POLICY]:sql.startsWith("select token_hash")?[{token_hash:"old",expires_at:new Date(now+expiresIn)}]:[])
    return {identity,execute,service:new IdentitySessions({execute})}
  }
  it("does not rotate a credential outside the renewal window",async()=>{const {service,identity,execute}=renewal(900000);expect(await service.renewNative(opaque(),identity,{secret:"test-key"})).toEqual({renewed:false});expect(execute.mock.calls.some(([q])=>q.startsWith("insert into da_native"))).toBe(false)})
  it.each([60000,0,-1])("rotates at or past the server renewal boundary %s without extending JWT lifetime",async remaining=>{
    const {service,identity,execute}=renewal(remaining)
    expect(await service.renewNative(opaque(),identity,{secret:"unit-only-secret"})).toEqual({renewed:true})
    expect(execute.mock.calls.some(([q])=>q.startsWith("update da_native_credential set retired_at"))).toBe(true)
    expect(execute.mock.calls.some(([q])=>q.includes("expires_at) values"))).toBe(true)
    const insert=execute.mock.calls.find(([q])=>q.startsWith("insert into da_native_credential"))![1]!
    const [iv,tag,value]=(insert[2] as string).split('.').map(p=>Buffer.from(p,'base64url'))
    const d=createDecipheriv('aes-256-gcm',createHash('sha256').update('native-credential:'+process.env.COOKIE_SECRET).digest(),iv);d.setAuthTag(tag)
    const jwt=Buffer.concat([d.update(value),d.final()]).toString()
    // Test-only time control in the real installed JWT validator. No production
    // clock or JWT expiry configuration is weakened.
    const issued=Math.floor(now/1000)
    expect(getAuthContextFromJwtToken('Bearer '+jwt,'unit-only-secret',['bearer'],['customer'],undefined,{clockTimestamp:issued+899})).toBeTruthy()
    expect(getAuthContextFromJwtToken('Bearer '+jwt,'unit-only-secret',['bearer'],['customer'],undefined,{clockTimestamp:issued+900})).toBeNull()
    expect(insert[3]).toEqual(new Date((issued+900)*1000))
  })
  it.each(["revoked","expired"])("never renews a %s session",async status=>{const {service,identity,execute}=renewal(0,status);expect(await service.renewNative(opaque(),identity,{secret:"test-key"})).toBeNull();expect(execute.mock.calls.some(([q])=>q.startsWith("insert into da_native"))).toBe(false)})
  it("rejects changed actor ownership before credential issuance",async()=>{const {service,identity}=renewal(0);await expect(service.renewNative(opaque(),{...identity,app_metadata:{customer_id:"attacker"}},{secret:"test-key"})).rejects.toThrow("Access denied")})
  it("rechecks retirement after waiting for the session lock",async()=>{
    const original=setup().execute.getMockImplementation()!
    const execute=jest.fn(async(sql:string):Promise<any[]>=>sql.startsWith("select session_id")?[{session_id:"hash"}]:sql.startsWith("select token_hash")?[]:original(sql))
    expect(await new IdentitySessions({execute}).native("a".repeat(64))).toBeNull()
    expect(execute.mock.calls.some(([q])=>q.startsWith("select token_hash"))).toBe(true)
  })
})
