import { csrfToken, digest, IdentitySessions, opaque, securitySql } from "../identity-session"
import { DEFAULT_SESSION_POLICY } from "../session-policy"

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
})
