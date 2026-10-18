import { projectVehicleAudit, validateVehicleEnvelope } from "../audit-envelope"
const event = { id: "davaud_one", module: "dogruadres-vehicle", organization_id: "org_one", actor_person_id: "person_one",
  actor_type: "user", actor_id: "user_one", role_context: "admin", action: "vehicle.created", resource: "vehicle", target_id: "daveh_one",
  occurred_at: new Date("2026-10-19T00:00:00.000Z"), deleted_at: null }
describe("Vehicle source envelope v1", () => {
  it("projects explicit server attribution without descriptive or secret values", () => {
    const envelope = projectVehicleAudit({ ...event, plate: "excluded", vin: "excluded", label: "excluded", previous_values: { secret: "excluded" }, token: "excluded" })
    expect(envelope.source_event_id).toBe(event.id)
    expect(envelope.actor.person_id).toBe(event.actor_person_id)
    expect(envelope.organization_id).toBe(event.organization_id)
    expect(JSON.stringify(envelope)).not.toContain("excluded")
    expect(envelope.version).toBe(1)
  })
  it.each([ { module: "dogruadres-access" }, { deleted_at: new Date() }, { action: "organization.provisioned" }, { role_context: "platform_administrator" }, { resource: "membership" } ])("rejects foreign source or invalid contract %s", change => expect(() => projectVehicleAudit({ ...event, ...change })).toThrow())
  it("rejects unversioned/arbitrary wire content", () => {
    const value = projectVehicleAudit(event)
    expect(() => validateVehicleEnvelope({ ...value, version: 2 })).toThrow()
    expect(() => validateVehicleEnvelope({ ...value, plate: "unapproved" })).toThrow()
  })
})
