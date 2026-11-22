import { observeVehicleAuthorization, FOUNDATION_AUTHORIZATION_INTEGRATION, type FoundationQueryInput, type VehicleAction, type VerifiedVehiclePrincipal } from "../authorization"
const principal = { actorType: "user" as const, actorId: "user_one" }
const rows = (): Record<string, unknown>[] => [
  { id: "mapping_one", actor_type: "user", actor_id: "user_one", person_id: "person_one" },
  { id: "person_one", disabled_at: null },
  { id: "org_one", status: "active" },
  { id: "membership_one", person_id: "person_one", organization_id: "org_one", status: "active", role: "admin" },
]
function fixture(data: unknown[] = rows()) {
  let index = 0
  const graph = jest.fn(async () => ({ data: [data[index++]] }))
  return { graph }
}
const actions: VehicleAction[] = ["vehicle.read", "vehicle.create", "vehicle.update", "vehicle.delete"]
describe("Sequential Foundation Query authorization observations (not a final mutation grant)", () => {
  it.each(["owner", "admin", "member"])("applies current %s role without platform bypass", async role => {
    for (const action of actions) {
      const data = rows(); data[3] = { ...data[3], role }
      const result = await observeVehicleAuthorization(fixture(data), principal, "org_one", action)
      expect(result.status).toBe(role === "member" && action === "vehicle.delete" ? "denied" : "allowed")
      if (result.status === "allowed") expect(result.attribution).toEqual({ organizationId: "org_one", personId: "person_one", membershipId: "membership_one", actorType: "user", actorId: "user_one", role, action })
    }
  })
  it.each(["api-key", "platform_administrator", "", "USER"])("rejects unsupported actor type %s before Query", async actorType => {
    const q = fixture()
    expect(await observeVehicleAuthorization(q, { actorType, actorId: "user_one" } as VerifiedVehiclePrincipal, "org_one", "vehicle.read")).toEqual({ status: "denied" })
    expect(q.graph).not.toHaveBeenCalled()
  })
  it("rejects malformed identifiers and unsupported actions", async () => {
    const q = fixture()
    for (const id of ["", "bad/id", "bad\n", "a".repeat(256)]) expect(await observeVehicleAuthorization(q, { ...principal, actorId: id }, "org_one", "vehicle.read")).toEqual({ status: "denied" })
    expect(await observeVehicleAuthorization(q, principal, "bad/org", "vehicle.read")).toEqual({ status: "denied" })
    expect(await observeVehicleAuthorization(q, principal, "org_one", "organization.read" as VehicleAction)).toEqual({ status: "denied" })
    expect(q.graph).not.toHaveBeenCalled()
  })
  it("uses exact fixed fields/filters, take two, cache false and only two Query arguments", async () => {
    const data = rows(); let index = 0
    const graph = jest.fn(async (_input: FoundationQueryInput, _options: unknown) => ({ data: [data[index++]] }))
    await observeVehicleAuthorization({ graph }, principal, "org_one", "vehicle.update")
    const expected = [
      ["da_actor_mapping", ["id", "actor_type", "actor_id", "person_id"], { actor_type: "user", actor_id: "user_one" }],
      ["da_person", ["id", "disabled_at"], { id: "person_one" }],
      ["da_organization", ["id", "status"], { id: "org_one" }],
      ["da_organization_membership", ["id", "person_id", "organization_id", "status", "role"], { person_id: "person_one", organization_id: "org_one", status: "active" }],
    ]
    expected.forEach(([entity, fields, filters], i) => expect(graph.mock.calls[i]).toEqual([
      { entity, fields, filters, pagination: { take: 2 } }, { cache: { enable: false } },
    ]))
  })
  it("denies disabled/suspended/revoked and inconsistent references", async () => {
    for (const [index, patch] of [[0, { actor_id: "foreign" }], [0, { person_id: null }], [1, { id: "foreign" }], [1, { disabled_at: "2026-10-19" }],
      [2, { status: "suspended" }], [2, { id: "foreign" }], [3, { status: "revoked" }], [3, { person_id: "foreign" }],
      [3, { organization_id: "foreign" }], [3, { role: "platform_administrator" }]] as const) {
      const data = rows(); data[index] = { ...data[index], ...patch } as typeof data[number]
      expect(await observeVehicleAuthorization(fixture(data), principal, "org_one", "vehicle.read")).toEqual({ status: "denied" })
    }
  })
  it("denies missing, duplicate and malformed Query results at every stage", async () => {
    for (let stage = 0; stage < 4; stage++) {
      for (const bad of [null, {}, { data: null }, { data: [] }, { data: [rows()[stage], rows()[stage]] }, { data: [{}] }, { data: [null] }]) {
        let i = 0
        const graph = jest.fn(async () => { const n = i++; return n === stage ? bad : { data: [rows()[n]] } })
        expect(await observeVehicleAuthorization({ graph }, principal, "org_one", "vehicle.read")).toEqual({ status: "denied" })
        expect(graph).toHaveBeenCalledTimes(stage + 1)
      }
    }
  })
  it("distinguishes Query outages without exposing raw error details", async () => {
    for (let stage = 0; stage < 4; stage++) {
      let i = 0
      const graph = jest.fn(async () => { const n = i++; if (n === stage) throw new Error("sensitive SQL detail"); return { data: [rows()[n]] } })
      expect(await observeVehicleAuthorization({ graph }, principal, "org_one", "vehicle.read")).toEqual({ status: "unavailable" })
    }
  })
  it("denies revocation observed at the membership read", async () => {
    const data = rows(); let i = 0
    const graph = async () => { const n = i++; if (n === 3) data[3].status = "revoked"; return { data: [{ ...data[n] }] } }
    expect(await observeVehicleAuthorization({ graph }, principal, "org_one", "vehicle.update")).toEqual({ status: "denied" })
  })
  it("demonstrates non-atomic Person disable/Organization suspension between reads", async () => {
    for (const change of ["person", "organization"]) {
      const data = rows(); let i = 0
      const graph = async () => {
        const n = i++
        if (n === 3) { if (change === "person") data[1].disabled_at = "disabled"; else data[2].status = "suspended" }
        return { data: [{ ...data[n] }] }
      }
      expect(await observeVehicleAuthorization({ graph }, principal, "org_one", "vehicle.update")).toMatchObject({ status: "allowed", consistency: "non_atomic" })
    }
    expect(FOUNDATION_AUTHORIZATION_INTEGRATION).toBe("BLOCKED_NON_ATOMIC_FOUNDATION_OBSERVATIONS")
  })
  it("demonstrates revocation after membership snapshot but before Query promise resolution is not detected", async () => {
    const data = rows(); let i = 0
    const graph = async () => {
      const n = i++, snapshot = { ...data[n] }
      if (n === 3) { data[3].status = "revoked"; await Promise.resolve() }
      return { data: [snapshot] }
    }
    expect(await observeVehicleAuthorization({ graph }, principal, "org_one", "vehicle.delete")).toMatchObject({ status: "allowed", consistency: "non_atomic" })
    expect(data[3].status).toBe("revoked")
  })
})
