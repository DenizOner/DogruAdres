import { InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import { Vehicle, VehicleAuditEvent, VehicleAuditOutbox } from "./models"
import { vehicleValues, changedFields, type VehicleValues } from "./validation"
import { projectVehicleAudit, VEHICLE_SOURCE } from "./audit-envelope"

type VerifiedMutation = { organizationId: string; personId: string; actorType: "user" | "member" | "customer";
  actorId: string; role: "owner" | "admin" | "member" }
type Operation = "create" | "update" | "delete"
export default class VehicleModuleService extends MedusaService({ Vehicle, VehicleAuditEvent, VehicleAuditOutbox }) {
  // CLOSED integration boundary: no public mutation entrypoint or caller-supplied
  // attribution is accepted. A later reviewed adapter must resolve verified auth
  // context/current Person/active Organization/membership here immediately before
  // mutation. Tests replace this seam ONLY with doubles. No cross-module manager.
  private async authorizeMutation_(_operation: Operation, _organizationId: string): Promise<VerifiedMutation> {
    throw new Error("VEHICLE_AUTHORIZATION_ADAPTER_NOT_IMPLEMENTED")
  }
  // Generated CRUD is internal persistence infrastructure, NOT an authorized API.
  // This private foundation must not be exposed as a workflow/route before the
  // closed authorization seam above is implemented and independently reviewed.
  @InjectTransactionManager()
  private async mutateVehicle_(operation: Operation, organizationId: string, input: unknown, vehicleId?: string,
    @MedusaContext() sharedContext: Context = {}) {
    if (!sharedContext.transactionManager) throw new Error("VEHICLE_TRANSACTION_REQUIRED")
    const manager = sharedContext.transactionManager as { execute(sql: string, params: unknown[]): Promise<unknown> }
    let existing: any
    if (operation !== "create") {
      if (!vehicleId) throw new Error("VEHICLE_NOT_FOUND")
      await manager.execute('SELECT id FROM da_vehicle WHERE id = ? AND organization_id = ? AND deleted_at IS NULL FOR UPDATE', [vehicleId, organizationId])
      const rows = await this.listVehicles({ id: vehicleId, organization_id: organizationId }, { take: 2 }, sharedContext)
      if (rows.length !== 1 || rows[0].deleted_at) throw new Error("VEHICLE_NOT_FOUND")
      existing = rows[0]
    }
    const values = operation === "delete" ? undefined : vehicleValues(input, existing ? this.values_(existing) : undefined)
    // Final current-permission check AFTER lock/validation, BEFORE domain write.
    const actor = await this.authorizeMutation_(operation, organizationId)
    if (actor.organizationId !== organizationId || !actor.personId || !actor.actorId ||
      !["user", "member", "customer"].includes(actor.actorType) || !["owner", "admin", "member"].includes(actor.role) ||
      (operation === "delete" && actor.role === "member")) throw new Error("VEHICLE_ACCESS_DENIED")
    let vehicle: any
    if (operation === "create") vehicle = await this.createVehicles({ ...values!, organization_id: organizationId }, sharedContext)
    else if (operation === "update") vehicle = await this.updateVehicles({ id: existing.id, ...values! }, sharedContext)
    else { await this.softDeleteVehicles(existing.id, {}, sharedContext); vehicle = existing }
    const action = operation === "create" ? "vehicle.created" : operation === "update" ? "vehicle.updated" : "vehicle.deleted"
    const audit = await this.createVehicleAuditEvents({ module: VEHICLE_SOURCE, organization_id: organizationId,
      actor_person_id: actor.personId, actor_type: actor.actorType, actor_id: actor.actorId, role_context: actor.role,
      action, resource: "vehicle", target_id: vehicle.id, occurred_at: new Date(),
      changed_fields: { fields: operation === "delete" ? ["deleted_at"] : changedFields(existing ? this.values_(existing) : undefined, values!) },
    }, sharedContext)
    if (!audit?.id || audit.target_id !== vehicle.id || audit.organization_id !== organizationId) throw new Error("VEHICLE_AUDIT_CARDINALITY")
    const outbox = await this.createVehicleAuditOutboxes({ source_audit_event_id: audit.id, source_module: VEHICLE_SOURCE,
      envelope_version: 1, envelope: projectVehicleAudit(audit), status: "pending" }, sharedContext)
    if (!outbox?.id || outbox.source_audit_event_id !== audit.id) throw new Error("VEHICLE_OUTBOX_CARDINALITY")
    return vehicle
  }
  private values_(row: any): VehicleValues {
    return { plate: row.plate, plate_key: row.plate_key, vin: row.vin, vin_key: row.vin_key, label: row.label, make: row.make,
      model: row.model, model_year: row.model_year, normalization_version: row.normalization_version }
  }
}
