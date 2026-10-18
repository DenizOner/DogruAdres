import { AUTHORIZATION_FIELDS, AUTHORIZATION_SQL, validateAuthorizationRequest, readAuthorizationProjection } from "../authorization-projection"
import Service from "../service"
const filters = { actor_type: "user", actor_id: "user_one", organization_id: "org_one", action: "vehicle.update" }
const options = { select: [...AUTHORIZATION_FIELDS], relations: [], take: 2, args: {} }
const allowed = { id: "daauth_observation", allowed: true, read_committed: true, authoritative_primary: true,
  actor_type: "user", actor_id: "user_one", organization_id: "org_one", person_id: "person_one", membership_id: "membership_one", role: "admin", action: "vehicle.update" }
// Source contracts with mocked SQL only. NOT snapshot/module/Query runtime proof.
describe("Foundation coherent authorization projection feasibility", () => {
  it("validates fixed Query filters/options, refusing context, arbitrary selection and actor types", () => {
    expect(validateAuthorizationRequest(filters, options)).toEqual(filters)
    for (const extra of [{ context: {} }, { withDeleted: true }, { skip: 0 }, { transactionManager: {} }]) expect(() => validateAuthorizationRequest(filters, { ...options, ...extra })).toThrow()
    expect(() => validateAuthorizationRequest({ ...filters, actor_type: "api-key" }, options)).toThrow()
    expect(() => validateAuthorizationRequest({ ...filters, role: "owner" }, options)).toThrow()
    expect(() => validateAuthorizationRequest(filters, { ...options, select: ["token_hash"] })).toThrow()
  })
  it("executes one fixed parameterized ordinary SELECT and returns minimal attribution", async () => {
    const execute = jest.fn(async () => [{ ...allowed, token_hash: "excluded", envelope: "excluded" }])
    const result = await readAuthorizationProjection({ execute }, filters)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(AUTHORIZATION_SQL, ["user", "user_one", "org_one", "vehicle.update"], "all")
    expect(JSON.stringify(result)).not.toContain("excluded")
    expect(result[0]).not.toHaveProperty("read_committed")
    expect(result[0].allowed).toBe(true)
  })
  it("encodes cardinality, enabled/active states and soft-delete checks in the same statement", () => {
    for (const fragment of ["count(*) FROM mappings) = 1", "count(*) FROM people) = 1", "count(*) FROM memberships) = 1", "disabled_at IS NULL", "status = 'active'", "m.deleted_at IS NULL", "p.deleted_at IS NULL", "o.deleted_at IS NULL", "s.deleted_at IS NULL"]) expect(AUTHORIZATION_SQL).toContain(fragment)
    expect(AUTHORIZATION_SQL).not.toMatch(/LIMIT\s+1|FOR UPDATE|INSERT|UPDATE\s+da_|DELETE FROM/i)
    expect(AUTHORIZATION_SQL.match(/\?/g)).toHaveLength(4)
  })
  it.each(["owner", "admin", "member"])("validates observed role %s and delete restriction", async role => {
    const result = await readAuthorizationProjection({ execute: async () => [{ ...allowed, role }] }, filters)
    expect(result[0].allowed).toBe(true)
    const deleted = await readAuthorizationProjection({ execute: async () => [{ ...allowed, role, action: "vehicle.delete" }] }, { ...filters, action: "vehicle.delete" })
    expect(deleted[0].allowed).toBe(role !== "member")
  })
  it("returns redacted denial for failed SQL decision and invalid attribution", async () => {
    for (const patch of [{ allowed: false }, { role: "platform_administrator" }, { person_id: null }, { organization_id: "foreign" }]) {
      expect((await readAuthorizationProjection({ execute: async () => [{ ...allowed, ...patch }] }, filters))[0]).toMatchObject({ allowed: false, person_id: null, actor_id: null })
    }
  })
  it("fails closed on SQL errors, malformed rows, duplicate rows and unsafe isolation/routing", async () => {
    for (const result of [null, [], [allowed, allowed], [{}], [{ ...allowed, read_committed: false }], [{ ...allowed, authoritative_primary: false }]]) await expect(readAuthorizationProjection({ execute: async () => result }, filters)).rejects.toThrow("FOUNDATION_AUTHORIZATION_PROJECTION_UNAVAILABLE")
    await expect(readAuthorizationProjection({ execute: async () => { throw new Error("private SQL") } }, filters)).rejects.toThrow("FOUNDATION_AUTHORIZATION_PROJECTION_UNAVAILABLE")
  })
  it("exposes only the two Query dispatch arguments, not external EntityManager forwarding", () => {
    expect(Service.prototype.listAuthorizationObservations.length).toBe(2)
  })
})
