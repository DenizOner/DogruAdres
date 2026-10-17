import { model } from "@medusajs/framework/utils"
import { Person } from "./person"

export const AuditEvent = model.define("da_audit_event", {
  id: model.id({ prefix: "daaud" }).primaryKey(),
  actor_person: model.belongsTo(() => Person),
  actor_type: model.text(),
  actor_id: model.text(),
  role_context: model.text().nullable(),
  organization_id: model.text().nullable(),
  action: model.text(),
  module: model.text().default("dogruadres-access"),
  resource: model.text(),
  target_id: model.text().nullable(),
  previous_values: model.json().nullable(),
  new_values: model.json().nullable(),
  occurred_at: model.dateTime(),
})
