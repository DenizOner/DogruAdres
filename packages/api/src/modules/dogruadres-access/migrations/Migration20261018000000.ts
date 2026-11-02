import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261018000000 extends Migration {
  override async up(): Promise<void> {
    // Deliberately fail on an unexpected pre-existing object; do not silently
    // accept a differently shaped table or replace a pre-existing guard function.
    this.addSql(`create table "da_audit_outbox" (
      "id" text not null,
      "source_audit_event_id" text not null,
      "source_module" text check ("source_module" in ('dogruadres-access')) not null default 'dogruadres-access',
      "envelope_version" integer not null default 1,
      "envelope" jsonb not null,
      "status" text check ("status" in ('pending')) not null default 'pending',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "da_audit_outbox_pkey" primary key ("id"),
      constraint "da_audit_outbox_source_audit_event_id_foreign" foreign key ("source_audit_event_id") references "da_audit_event" ("id") on update cascade
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_audit_outbox_source_audit_event_id" ON "da_audit_outbox" ("source_audit_event_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_audit_outbox_deleted_at" ON "da_audit_outbox" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE UNIQUE INDEX "IDX_da_audit_outbox_source_identity_unique" ON "da_audit_outbox" ("source_module", "source_audit_event_id");`)

    // Canonical Foundation evidence is append-only, including framework-managed
    // updated_at/deleted_at. INSERT is not intercepted. This also rejects no-op
    // UPDATEs; generated ORM mutation methods cannot bypass the database guard.
    this.addSql(`CREATE FUNCTION "da_audit_event_reject_mutation"() RETURNS trigger
      LANGUAGE plpgsql AS $guard$
      BEGIN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Foundation canonical audit is append-only';
      END;
      $guard$;`)
    this.addSql(`CREATE TRIGGER "da_audit_event_append_only_rows"
      BEFORE UPDATE OR DELETE ON "da_audit_event"
      FOR EACH ROW EXECUTE FUNCTION "da_audit_event_reject_mutation"();`)
    this.addSql(`CREATE TRIGGER "da_audit_event_append_only_truncate"
      BEFORE TRUNCATE ON "da_audit_event"
      FOR EACH STATEMENT EXECUTE FUNCTION "da_audit_event_reject_mutation"();`)
    // No historical rows are updated/backfilled. Trigger ownership/DDL privileges
    // must remain restricted operationally: PostgreSQL superusers/table owners can
    // disable/drop guards. This is ordinary DML protection, not DBA tamper resistance.
  }

  override async down(): Promise<void> {
    // Automatic rollback would remove canonical protections and could destroy
    // undelivered source evidence. Require a separately reviewed operational plan.
    throw new Error("Foundation audit/outbox rollback requires explicit operational approval")
  }
}
