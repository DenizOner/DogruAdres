import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261025120000 extends Migration {
  override async up(): Promise<void> {
    // Additive: retain source IDs, canonical FK, envelopes and every existing row.
    this.addSql(`alter table "da_audit_outbox"
      drop constraint "da_audit_outbox_status_check",
      add column "attempt_count" integer not null default 0,
      add column "next_attempt_at" timestamptz null,
      add column "lease_token" text null,
      add column "lease_expires_at" timestamptz null,
      add column "delivered_at" timestamptz null,
      add column "last_error_code" text null,
      add constraint "da_audit_outbox_status_check" check ("status" in ('pending','delivered','quarantined')),
      add constraint "da_audit_outbox_last_error_code_check" check ("last_error_code" in ('SOURCE_INVALID','ENVELOPE_INVALID','INDEX_CONFLICT','INDEX_UNAVAILABLE','ATTEMPTS_EXHAUSTED','RECONCILIATION_DEFERRED')),
      add constraint "da_audit_outbox_attempt_bounds" check ("attempt_count" between 0 and 5),
      add constraint "da_audit_outbox_delivery_state" check ((("lease_token" is null) = ("lease_expires_at" is null)) and ("lease_token" is null or ("status" = 'pending' and "attempt_count" >= 1)) and (("status" = 'delivered') = ("delivered_at" is not null)) and ("status" = 'pending' or ("lease_token" is null and "next_attempt_at" is null)) and ("status" <> 'quarantined' or "last_error_code" is not null) and ("status" <> 'delivered' or "last_error_code" is null) and ("attempt_count" >= 1 or ("status" = 'pending' and "lease_token" is null and "next_attempt_at" is null and "last_error_code" is null)));`)
    this.addSql(`CREATE INDEX "IDX_da_audit_outbox_delivery_due" ON "da_audit_outbox" ("status", "next_attempt_at", "lease_expires_at", "created_at", "id") WHERE deleted_at IS NULL;`)
  }
  override async down(): Promise<void> {
    throw new Error("Audit delivery state rollback requires a separately approved operational plan")
  }
}
