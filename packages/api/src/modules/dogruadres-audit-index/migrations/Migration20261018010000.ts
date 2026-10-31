import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261018010000 extends Migration {
  override async up(): Promise<void> {
    // Own projection table only. No FK to Foundation and no historical backfill.
    this.addSql(`create table "da_audit_index_entry" (
      "id" text not null,
      "source_module" text check ("source_module" in ('dogruadres-access')) not null,
      "source_event_id" text not null,
      "envelope_version" integer not null default 1,
      "organization_id" text not null,
      "actor_person_id" text not null,
      "actor_type" text check ("actor_type" in ('user','member','customer')) not null,
      "actor_id" text not null,
      "action" text not null, "resource" text not null, "target_id" text not null,
      "occurred_at" timestamptz not null, "indexed_at" timestamptz not null,
      "envelope" jsonb not null,
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null,
      constraint "da_audit_index_entry_pkey" primary key ("id")
    );`)
    // Nonpartial identity uniqueness also covers soft-deleted projection rows.
    this.addSql(`CREATE UNIQUE INDEX "IDX_da_audit_index_source_identity_unique" ON "da_audit_index_entry" ("source_module", "source_event_id");`)
    this.addSql(`CREATE INDEX "IDX_da_audit_index_entry_deleted_at" ON "da_audit_index_entry" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX "IDX_da_audit_index_org_time" ON "da_audit_index_entry" ("organization_id", "occurred_at", "id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX "IDX_da_audit_index_org_resource" ON "da_audit_index_entry" ("organization_id", "resource", "target_id") WHERE deleted_at IS NULL;`)
  }
  override async down(): Promise<void> {
    throw new Error("Audit Index disposal/rebuild requires a separately approved operational plan")
  }
}
