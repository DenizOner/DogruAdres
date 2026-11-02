import { model } from "@medusajs/framework/utils"
import { AuditEvent } from "./audit-event"

// Foundation source evidence and mutable delivery metadata; not a global index.
export const AuditOutbox = model
  .define("da_audit_outbox", {
    id: model.id({ prefix: "daaob" }).primaryKey(),
    source_audit_event: model.belongsTo(() => AuditEvent),
    source_module: model.enum(["dogruadres-access"]).default("dogruadres-access"),
    envelope_version: model.number().default(1),
    envelope: model.json(),
    status: model.enum(["pending", "delivered", "quarantined"]).default("pending"),
    attempt_count: model.number().default(0),
    next_attempt_at: model.dateTime().nullable(),
    lease_token: model.text().nullable(),
    lease_expires_at: model.dateTime().nullable(),
    delivered_at: model.dateTime().nullable(),
    last_error_code: model.enum(["SOURCE_INVALID", "ENVELOPE_INVALID", "INDEX_CONFLICT", "INDEX_UNAVAILABLE", "ATTEMPTS_EXHAUSTED", "RECONCILIATION_DEFERRED"]).nullable(),
  })
  // Never scope idempotency to deleted_at: even a soft-deleted source envelope
  // cannot be inserted a second time. Future backfill must reconcile explicitly.
  .indexes([{
    name: "IDX_da_audit_outbox_source_identity_unique",
    on: ["source_module", "source_audit_event_id"],
    unique: true,
    where: null,
  }, {
    name: "IDX_da_audit_outbox_delivery_due",
    on: ["status", "next_attempt_at", "lease_expires_at", "created_at", "id"],
  }])
  .checks([
    { name: "da_audit_outbox_attempt_bounds", expression: '"attempt_count" between 0 and 5' },
    { name: "da_audit_outbox_delivery_state", expression: "((\"lease_token\" is null) = (\"lease_expires_at\" is null)) and (\"lease_token\" is null or (\"status\" = 'pending' and \"attempt_count\" >= 1)) and ((\"status\" = 'delivered') = (\"delivered_at\" is not null)) and (\"status\" = 'pending' or (\"lease_token\" is null and \"next_attempt_at\" is null)) and (\"status\" <> 'quarantined' or \"last_error_code\" is not null) and (\"status\" <> 'delivered' or \"last_error_code\" is null) and (\"attempt_count\" >= 1 or (\"status\" = 'pending' and \"lease_token\" is null and \"next_attempt_at\" is null and \"last_error_code\" is null))" },
  ])
