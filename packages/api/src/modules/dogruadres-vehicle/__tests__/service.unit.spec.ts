import Service from "../service"
import { vehicleValues } from "../validation"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
// Mocked contracts ONLY. Not a PostgreSQL rollback/concurrency/trigger proof.
function fixture() {
  const service = Object.create(Service.prototype) as any
  const context = { transactionManager: { execute: jest.fn(async () => []) } }
  const existing = { id: "daveh_one", organization_id: "org_one", ...vehicleValues({ plate: "34 ABC" }), deleted_at: null }
  const actor = { organizationId: "org_one", personId: "person_one", actorType: "user", actorId: "user_one", role: "admin" }
  const doubles = { listVehicles: jest.fn(async () => [existing]), createVehicles: jest.fn(async v => ({ id: "daveh_new", ...v })),
    updateVehicles: jest.fn(async v => ({ ...existing, ...v })), softDeleteVehicles: jest.fn(async () => undefined),
    createVehicleAuditEvents: jest.fn(async v => ({ id: "davaud_one", ...v })),
    createVehicleAuditOutboxes: jest.fn(async v => ({ id: "davob_one", ...v })) }
  for (const [k,v] of Object.entries(doubles)) Object.defineProperty(service, k, { value: v })
  return { service, context, existing, actor, ...doubles }
}
describe("Closed Vehicle mutation foundation", () => {
  it("refuses operation until a reviewed current-identity authorization adapter exists", async () => {
    const f = fixture()
    await expect(f.service.mutateVehicle_("create", "org_one", { plate: "34" }, undefined, f.context)).rejects.toThrow("VEHICLE_AUTHORIZATION_ADAPTER_NOT_IMPLEMENTED")
    expect(f.createVehicles).not.toHaveBeenCalled()
  })
  it.each(["create", "update", "delete"])("%s persists one domain mutation, one audit and one source-linked outbox using identical context", async operation => {
    const f = fixture(); f.service.authorizeMutation_ = jest.fn(async () => f.actor)
    await f.service.mutateVehicle_(operation, "org_one", { label: "changed", plate: "35" }, operation === "create" ? undefined : f.existing.id, f.context)
    expect(f.createVehicleAuditEvents).toHaveBeenCalledTimes(1)
    expect(f.createVehicleAuditOutboxes).toHaveBeenCalledTimes(1)
    expect(f.createVehicleAuditEvents).toHaveBeenCalledWith(expect.objectContaining({ actor_person_id: "person_one", organization_id: "org_one", module: "dogruadres-vehicle" }), f.context)
    expect(f.createVehicleAuditOutboxes).toHaveBeenCalledWith(expect.objectContaining({ source_audit_event_id: "davaud_one", status: "pending" }), f.context)
    const write = operation === "create" ? f.createVehicles : operation === "update" ? f.updateVehicles : f.softDeleteVehicles
    const args = write.mock.calls[0] as unknown[]
    expect(args[args.length - 1]).toBe(f.context)
  })
  it.each(["createVehicleAuditEvents", "createVehicleAuditOutboxes"] as const)("propagates %s errors to owning transaction", async name => {
    const f = fixture(); f.service.authorizeMutation_ = jest.fn(async () => f.actor)
    f[name].mockRejectedValueOnce(new Error("synthetic failure") as never)
    await expect(f.service.mutateVehicle_("create", "org_one", { plate: "34" }, undefined, f.context)).rejects.toThrow("synthetic failure")
  })
  it("does not stage audit after domain failure or no-op", async () => {
    const f = fixture(); f.service.authorizeMutation_ = jest.fn(async () => f.actor)
    f.createVehicles.mockRejectedValueOnce(new Error("domain failure") as never)
    await expect(f.service.mutateVehicle_("create", "org_one", { plate: "34" }, undefined, f.context)).rejects.toThrow()
    await expect(f.service.mutateVehicle_("update", "org_one", { plate: "34 ABC" }, f.existing.id, f.context)).rejects.toThrow("VEHICLE_NO_CHANGE")
    expect(f.createVehicleAuditEvents).not.toHaveBeenCalled()
  })
  it("rejects deleted resources, Organization injection, and member deletion", async () => {
    const f = fixture(); f.service.authorizeMutation_ = jest.fn(async () => ({ ...f.actor, role: "member" }))
    await expect(f.service.mutateVehicle_("delete", "org_one", {}, f.existing.id, f.context)).rejects.toThrow("VEHICLE_ACCESS_DENIED")
    f.listVehicles.mockResolvedValueOnce([{ ...f.existing, deleted_at: new Date() }] as never)
    await expect(f.service.mutateVehicle_("update", "org_one", { label: "x" }, f.existing.id, f.context)).rejects.toThrow("VEHICLE_NOT_FOUND")
    await expect(f.service.mutateVehicle_("create", "org_one", { plate: "34", organization_id: "org_other" }, undefined, f.context)).rejects.toThrow()
  })
  it("records live-only uniqueness and permanent outbox identity in the migration source", () => {
    const sql = readFileSync(resolve(__dirname, "../migrations/Migration20261019000000.ts"), "utf8")
    expect(sql).toContain('WHERE deleted_at IS NULL AND plate_key IS NOT NULL')
    expect(sql).toContain('WHERE deleted_at IS NULL AND vin_key IS NOT NULL')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_da_vehicle_audit_outbox_source_identity_unique"')
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "da_vehicle_audit_event"')
    expect(sql).toContain('BEFORE TRUNCATE ON "da_vehicle_audit_event"')
  })
})
