import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cursorKey, encodeCursor, decodeCursor, pagination, timelinePage } from "../audit-timeline"
import { requireOrganizationAccess } from "../authorization"
import { GET as nativeOrganizationGet } from "../organizations/[id]/route"
import type { MedusaResponse } from "@medusajs/framework/http"
import Service from "../../../modules/dogruadres-audit-index/service"
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"

// Mocked source tests only: not physical isolation or live concurrency evidence.
const keyText = Buffer.alloc(32, 7).toString("base64"), key = cursorKey(keyText)
const identity = { organizationId: "org_a", personId: "person_a" }
const scope = { ...identity, limit: 1 }
const boundary = { occurred_at: "2026-10-18T00:00:00.000Z", id: "daidx_b" }
function authFixture(role: string | null = "owner", person: unknown = { id: "person_a" }, active = true, protectedOwner = true) {
  const service = {
    resolvePersonForActor: jest.fn(async () => person),
    getActiveMembership: jest.fn(async () => role ? ({ role, status: active ? "active" : "revoked", protected_owner: protectedOwner }) : null),
    currentProtectedOwner: jest.fn(async () => protectedOwner),
    getOrganization: jest.fn(async () => ({ id: "org_a", status: "active" })),
  }
  const req = { auth_context: { actor_id: "user_a", actor_type: "user" }, scope: { resolve: () => service } } as unknown as AuthenticatedMedusaRequest
  return { service, req, authorize: (action: Parameters<typeof requireOrganizationAccess>[2] = "audit.timeline.read") =>
    requireOrganizationAccess(req, "org_a", action) }
}
const row = { ...boundary, source_module: "dogruadres-access", source_event_id: "audit_a", indexed_at: boundary.occurred_at,
  action: "organization.provisioned", resource: "organization", target_id: "org_a", actor_person_id: "person_old", envelope: { secret: "excluded" }, actor_id: "excluded" }

describe("Audit timeline current authorization", () => {
  it.each(["owner", "admin"])("allows active %s including platform user only through membership", async role => {
    await expect(authFixture(role).authorize()).resolves.toMatchObject(identity)
  })
  it.each(["membership.list","membership.manage","invitation.manage","audit.timeline.read"] as const)(
    "denies role-only Owner and missing protected proof for native action %s while preserving Admin", async action => {
      const roleOnly=authFixture("owner",{id:"person_a"},true,false)
      await expect(roleOnly.authorize(action)).rejects.toThrow("Organization access denied")
      const unproved=authFixture()
      unproved.service.currentProtectedOwner.mockResolvedValue(false)
      await expect(unproved.authorize(action)).rejects.toThrow("Organization access denied")
      await expect(authFixture("admin").authorize(action)).resolves.toMatchObject(identity)
      await expect(authFixture("owner").authorize(action)).resolves.toMatchObject(identity)
    })
  it("enforces centrally narrowed organization.read for a current protected Owner, without private HTTP body; Member/Admin and restored Owner remain authorized",async()=>{
    const original=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    const f=authFixture()
    const response={json:jest.fn()} as unknown as MedusaResponse
    const req=Object.assign(f.req,{params:{id:"org_a"}})
    try{
      delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      await expect(f.authorize("organization.read")).resolves.toMatchObject(identity)
      const roleOnly=authFixture("owner",{id:"person_a"},true,false)
      await expect(roleOnly.authorize("organization.read")).rejects.toThrow("Organization access denied")
      const unproved=authFixture()
      unproved.service.currentProtectedOwner.mockResolvedValue(false)
      await expect(unproved.authorize("organization.read")).rejects.toThrow("Organization access denied")
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=
        "buyer.purchase,products.edit,invitation.manage,membership.manage,membership.list,audit.timeline.read"
      await expect(nativeOrganizationGet(req,response)).rejects.toThrow("Organization access denied")
      expect(response.json).not.toHaveBeenCalled()
      // Active Member and Admin require their own current membership,
      // not an Owner permission or a client-provided role selector.
      for(const role of ["member","admin"]){
        const allowed=authFixture(role)
        await expect(allowed.authorize("organization.read")).resolves.toMatchObject(identity)
      }
      const foreign=authFixture("member")
      foreign.service.getOrganization.mockResolvedValue({id:"org_foreign",status:"active"})
      await expect(foreign.authorize("organization.read")).rejects.toThrow("Organization access denied")
      const revoked=authFixture("admin",{id:"person_a"},false)
      await expect(revoked.authorize("organization.read")).rejects.toThrow("Organization access denied")
      const missing=authFixture(null)
      await expect(missing.authorize("organization.read")).rejects.toThrow("Organization access denied")
    }finally{
      if(original===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=original
    }
    await nativeOrganizationGet(req,response)
    expect(response.json).toHaveBeenCalledWith({
      organization:{id:"org_a",name:undefined,status:"active"}
    })
  })

  it("denies active role-only Owner even for private audit", async () => {
    const f=authFixture("owner",{id:"person_a"},true,false)
    await expect(f.authorize()).rejects.toMatchObject({message:"Organization access denied"})
    expect(f.service.currentProtectedOwner).not.toHaveBeenCalled()
    const withoutProof=authFixture()
    withoutProof.service.currentProtectedOwner.mockResolvedValue(false)
    await expect(withoutProof.authorize()).rejects.toThrow("Organization access denied")
  })
  it.each(["member", null])("denies member or platform user without membership: %s", async role => {
    await expect(authFixture(role).authorize()).rejects.toMatchObject({ message: "Organization access denied" })
  })
  it("denies revoked and missing/disabled/ambiguous Person resolution", async () => {
    await expect(authFixture("owner", { id: "person_a" }, false).authorize()).rejects.toThrow()
    // Foundation resolvePersonForActor returns null for all three identity failures.
    await expect(authFixture("owner", null).authorize()).rejects.toThrow()
  })
  it("rechecks current role every request, ignores historical role, and uniformly denies foreign/nonexistent Organizations", async () => {
    const f = authFixture(); await f.authorize()
    f.service.getActiveMembership.mockResolvedValue({ role: "member", status: "active", protected_owner: false })
    await expect(f.authorize()).rejects.toMatchObject({ message: "Organization access denied" })
    f.service.getActiveMembership.mockResolvedValue(null)
    await expect(f.authorize()).rejects.toMatchObject({ message: "Organization access denied" })
    const absent = authFixture(); absent.service.getOrganization.mockResolvedValue(null as never)
    await expect(absent.authorize()).rejects.toMatchObject({ message: "Organization access denied" })
  })
})
describe("Audit timeline pagination and response contract", () => {
  it("rejects unsupported parameters and invalid limits", () => {
    expect(pagination({})).toEqual({ limit: 25, cursor: undefined })
    for (const query of [{ limit: "0" }, { limit: "101" }, { limit: ["1"] }, { fields: "*" }, { cursor: "" }]) expect(() => pagination(query)).toThrow()
    expect(() => cursorKey(undefined)).toThrow()
  })
  it("binds encrypted cursors to Person, Organization, limit and key", () => {
    const token = encodeCursor(scope, boundary, key)
    expect(decodeCursor(token, scope, key)).toEqual(boundary)
    for (const other of [{ ...scope, personId: "person_b" }, { ...scope, organizationId: "org_b" }, { ...scope, limit: 2 }]) expect(() => decodeCursor(token, other, key)).toThrow()
    expect(() => decodeCursor("A" + token.slice(1, -1), scope, key)).toThrow()
    expect(() => decodeCursor(token, scope, Buffer.alloc(32, 8))).toThrow()
  })
  it("authorizes before query validation or Index access", async () => {
    const read = jest.fn()
    await expect(timelinePage({ fields: "*" }, async () => { throw new Error("denied") }, read, () => keyText)).rejects.toThrow("denied")
    expect(read).not.toHaveBeenCalled()
  })
  it("explicitly projects approved fields, scoped has_more and eventual consistency", async () => {
    const read = jest.fn(async () => [row, { ...row, id: "daidx_a" }])
    const result = await timelinePage({ limit: "1" }, async () => identity, read, () => keyText)
    expect(read).toHaveBeenCalledWith("org_a", 1, undefined)
    expect(Object.keys(result.items[0]).sort()).toEqual(["id", "source_module", "source_event_id", "occurred_at", "indexed_at", "action", "resource", "target_id", "actor"].sort())
    expect(result.items[0].actor).toEqual({ person_id: "person_old" })
    expect(JSON.stringify(result)).not.toContain("excluded")
    expect(result.projection).toEqual({ consistency: "eventual", completeness: "not_guaranteed" })
    expect(result.page.has_more).toBe(true)
    expect(decodeCursor(result.page.next_cursor!, scope, key)).toEqual(boundary)
  })
  it("returns 503 for Index outage, not fabricated empty success", async () => {
    await expect(timelinePage({}, async () => identity, async () => { throw new Error("private failure") }, () => keyText)).rejects.toMatchObject({ status: 503, message: "Audit timeline unavailable" })
  })
  it("allows an already authorized in-flight read, but denies the next request after committed revocation", async () => {
    let revoked = false
    const authorize = async () => { if (revoked) throw new Error("denied"); return identity }
    await expect(timelinePage({}, authorize, async () => { revoked = true; return [] }, () => keyText)).resolves.toMatchObject({ items: [] })
    await expect(timelinePage({}, authorize, async () => [], () => keyText)).rejects.toThrow("denied")
  })
  it("uses a compound equal-timestamp tie-breaker, Organization scope, no count and limit+1", async () => {
    const service = Object.create(Service.prototype) as Service
    const list = jest.fn(async () => [])
    Object.defineProperty(service, "listAuditIndexEntries", { value: list })
    await service.readOrganizationTimeline("org_a", 25, boundary)
    expect(list).toHaveBeenCalledWith({ organization_id: "org_a", $or: [
      { occurred_at: { $lt: new Date(boundary.occurred_at) } },
      { occurred_at: new Date(boundary.occurred_at), id: { $lt: "daidx_b" } },
    ] }, expect.objectContaining({ take: 26, order: { occurred_at: "DESC", id: "DESC" } }))
  })
})

