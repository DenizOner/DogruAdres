import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261019000000 extends Migration {
  override async up(): Promise<void> {
    // New Vehicle-owned tables only. No cross-module FK, history rewrite or backfill.
    this.addSql(`create table "da_vehicle" (
      "id" text not null,
      "organization_id" text not null,
      "plate" text,
      "plate_key" text,
      "vin" text,
      "vin_key" text,
      "label" text,
      "make" text,
      "model" text,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz,
      "model_year" integer,
      "normalization_version" integer not null default 1,
      constraint "da_vehicle_pkey" primary key ("id"),
      constraint "da_vehicle_identifier_required" check ("plate_key" IS NOT NULL OR "vin_key" IS NOT NULL),
      constraint "da_vehicle_normalization_version" check ("normalization_version" = 1),
      constraint "da_vehicle_year_range" check ("model_year" IS NULL OR "model_year" BETWEEN 1886 AND 2100),
      constraint "da_vehicle_identifier_pairs" check (("plate" IS NULL) = ("plate_key" IS NULL) AND ("vin" IS NULL) = ("vin_key" IS NULL))
    );`)
    this.addSql(`CREATE UNIQUE INDEX "IDX_da_vehicle_org_plate_live" ON "da_vehicle" ("organization_id", "plate_key") WHERE deleted_at IS NULL AND plate_key IS NOT NULL;`)
    this.addSql(`CREATE UNIQUE INDEX "IDX_da_vehicle_org_vin_live" ON "da_vehicle" ("organization_id", "vin_key") WHERE deleted_at IS NULL AND vin_key IS NOT NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_vehicle_deleted_at" ON "da_vehicle" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`create table "da_vehicle_audit_event" (
      "id" text not null,
      "organization_id" text not null,
      "actor_person_id" text not null,
      "actor_id" text not null,
      "target_id" text not null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz,
      "module" text check ("module" in ('dogruadres-vehicle')) not null default 'dogruadres-vehicle',
      "actor_type" text check ("actor_type" in ('user','member','customer')) not null,
      "role_context" text check ("role_context" in ('owner','admin','member')) not null,
      "action" text check ("action" in ('vehicle.created','vehicle.updated','vehicle.deleted')) not null,
      "resource" text check ("resource" in ('vehicle')) not null default 'vehicle',
      "occurred_at" timestamptz not null,
      "changed_fields" jsonb not null,
      constraint "da_vehicle_audit_event_pkey" primary key ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_vehicle_audit_event_deleted_at" ON "da_vehicle_audit_event" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`create table "da_vehicle_audit_outbox" (
      "id" text not null,
      "source_audit_event_id" text not null,
      "source_module" text check ("source_module" in ('dogruadres-vehicle')) not null default 'dogruadres-vehicle',
      "envelope_version" integer not null default 1,
      "envelope" jsonb not null,
      "status" text check ("status" in ('pending','delivered','quarantined')) not null default 'pending',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz,
      "attempt_count" integer not null default 0,
      "next_attempt_at" timestamptz,
      "lease_expires_at" timestamptz,
      "delivered_at" timestamptz,
      "lease_token" text,
      "last_error_code" text check ("last_error_code" in ('SOURCE_INVALID','ENVELOPE_INVALID','INDEX_CONFLICT','INDEX_UNAVAILABLE','ATTEMPTS_EXHAUSTED','RECONCILIATION_DEFERRED')),
      constraint "da_vehicle_audit_outbox_pkey" primary key ("id"),
      constraint "da_vehicle_audit_outbox_attempt_bounds" check ("attempt_count" between 0 and 5),
      constraint "da_vehicle_audit_outbox_delivery_state" check ((("lease_token" is null) = ("lease_expires_at" is null)) and ("lease_token" is null or ("status" = 'pending' and "attempt_count" >= 1)) and (("status" = 'delivered') = ("delivered_at" is not null)) and ("status" = 'pending' or ("lease_token" is null and "next_attempt_at" is null)) and ("status" <> 'quarantined' or "last_error_code" is not null) and ("status" <> 'delivered' or "last_error_code" is null) and ("attempt_count" >= 1 or ("status" = 'pending' and "lease_token" is null and "next_attempt_at" is null and "last_error_code" is null))),
      constraint "da_vehicle_audit_outbox_source_audit_event_id_foreign" foreign key ("source_audit_event_id") references "da_vehicle_audit_event" ("id") on update cascade
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_vehicle_audit_outbox_source_audit_event_id" ON "da_vehicle_audit_outbox" ("source_audit_event_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_vehicle_audit_outbox_deleted_at" ON "da_vehicle_audit_outbox" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_da_vehicle_audit_outbox_source_identity_unique" ON "da_vehicle_audit_outbox" ("source_module", "source_audit_event_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_vehicle_audit_outbox_delivery_due" ON "da_vehicle_audit_outbox" ("status", "next_attempt_at", "lease_expires_at", "created_at", "id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE FUNCTION "da_vehicle_guard_ownership"() RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Vehicle Organization is immutable';
  END IF;
  RETURN NEW;
END; $guard$;`)
    this.addSql(`CREATE TRIGGER "da_vehicle_immutable_organization" BEFORE UPDATE ON "da_vehicle"
FOR EACH ROW EXECUTE FUNCTION "da_vehicle_guard_ownership"();`)
    this.addSql(`CREATE FUNCTION "da_vehicle_audit_reject_mutation"() RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Vehicle canonical audit is append-only';
END; $guard$;`)
    this.addSql(`CREATE TRIGGER "da_vehicle_audit_append_only_rows" BEFORE UPDATE OR DELETE ON "da_vehicle_audit_event"
FOR EACH ROW EXECUTE FUNCTION "da_vehicle_audit_reject_mutation"();`)
    this.addSql(`CREATE TRIGGER "da_vehicle_audit_append_only_truncate" BEFORE TRUNCATE ON "da_vehicle_audit_event"
FOR EACH STATEMENT EXECUTE FUNCTION "da_vehicle_audit_reject_mutation"();`)
  }
  override async down(): Promise<void> {
    throw new Error("Vehicle evidence rollback requires a separately approved operational plan")
  }
}
// Trigger enforcement is ordinary DML protection; privileged DDL can disable it.
// Snapshot records schema metadata, not trigger/function definitions.
