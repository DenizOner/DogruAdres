import { model } from "@medusajs/framework/utils"
import { AuditEvent } from "./audit-event"

// Foundation source evidence only. This is not a global index or a relay.
export const AuditOutbox = model
  .define("da_audit_outbox", {
    id: model.id({ prefix: "daaob" }).primaryKey(),
    source_audit_event: model.belongsTo(() => AuditEvent),
    source_module: model.enum(["dogruadres-access"]).default("dogruadres-access"),
    envelope_version: model.number().default(1),
    envelope: model.json(),
    status: model.enum(["pending"]).default("pending"),
  })
  // Never scope idempotency to deleted_at: even a soft-deleted source envelope
  // cannot be inserted a second time. Future backfill must reconcile explicitly.
  .indexes([{
    name: "IDX_da_audit_outbox_source_identity_unique",
    on: ["source_module", "source_audit_event_id"],
    unique: true,
    where: null,
  }])
