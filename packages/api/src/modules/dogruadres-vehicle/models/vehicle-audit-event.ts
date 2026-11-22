import { model } from "@medusajs/framework/utils"
export const VehicleAuditEvent = model.define("da_vehicle_audit_event", {
  id: model.id({ prefix: "davaud" }).primaryKey(), module: model.enum(["dogruadres-vehicle"]).default("dogruadres-vehicle"),
  organization_id: model.text(), actor_person_id: model.text(), actor_type: model.enum(["user", "member", "customer"]),
  actor_id: model.text(), role_context: model.enum(["owner", "admin", "member"]),
  action: model.enum(["vehicle.created", "vehicle.updated", "vehicle.deleted"]), resource: model.enum(["vehicle"]).default("vehicle"),
  target_id: model.text(), occurred_at: model.dateTime(), changed_fields: model.json(),
})
