import { model } from "@medusajs/framework/utils"

// Derived/rebuildable projection. References are opaque values, not cross-module
// ORM relationships or evidence of current authorization to read an Organization.
export const AuditIndexEntry = model.define("da_audit_index_entry", {
  id: model.id({ prefix: "daidx" }).primaryKey(),
  source_module: model.enum(["dogruadres-access"]),
  source_event_id: model.text(),
  envelope_version: model.number().default(1),
  organization_id: model.text(),
  actor_person_id: model.text(),
  actor_type: model.enum(["user", "member", "customer"]),
  actor_id: model.text(),
  action: model.text(),
  resource: model.text(),
  target_id: model.text(),
  occurred_at: model.dateTime(),
  indexed_at: model.dateTime(),
  envelope: model.json(),
}).indexes([
  { name: "IDX_da_audit_index_source_identity_unique", on: ["source_module", "source_event_id"], unique: true, where: null },
  { name: "IDX_da_audit_index_org_time", on: ["organization_id", "occurred_at", "id"] },
  { name: "IDX_da_audit_index_org_resource", on: ["organization_id", "resource", "target_id"] },
])
