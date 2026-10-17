import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261017135550 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "da_actor_mapping" drop constraint if exists "da_actor_mapping_actor_type_actor_id_unique";`);
    this.addSql(`alter table if exists "da_organization_invitation" drop constraint if exists "da_organization_invitation_token_hash_unique";`);
    this.addSql(`alter table if exists "da_organization_membership" drop constraint if exists "da_organization_membership_person_id_organization_id_unique";`);
    this.addSql(`create table if not exists "da_organization" ("id" text not null, "name" text not null, "status" text check ("status" in ('active', 'suspended')) not null default 'active', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "da_organization_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_organization_deleted_at" ON "da_organization" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "da_person" ("id" text not null, "display_name" text null, "disabled_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "da_person_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_person_deleted_at" ON "da_person" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "da_organization_membership" ("id" text not null, "organization_id" text not null, "person_id" text not null, "role" text check ("role" in ('owner', 'admin', 'member')) not null, "status" text check ("status" in ('active', 'revoked')) not null default 'active', "protected_owner" boolean not null default false, "revoked_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "da_organization_membership_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_organization_membership_organization_id" ON "da_organization_membership" ("organization_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_organization_membership_person_id" ON "da_organization_membership" ("person_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_organization_membership_deleted_at" ON "da_organization_membership" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_da_organization_membership_person_id_organization_id_unique" ON "da_organization_membership" ("person_id", "organization_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "da_organization_invitation" ("id" text not null, "organization_id" text not null, "created_by_person_id" text not null, "recipient_email" text not null, "role" text check ("role" in ('admin', 'member')) not null, "token_hash" text not null, "status" text check ("status" in ('pending', 'accepted', 'revoked')) not null default 'pending', "expires_at" timestamptz not null, "accepted_at" timestamptz null, "revoked_at" timestamptz null, "accepted_by_person_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "da_organization_invitation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_organization_invitation_organization_id" ON "da_organization_invitation" ("organization_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_organization_invitation_created_by_person_id" ON "da_organization_invitation" ("created_by_person_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_organization_invitation_deleted_at" ON "da_organization_invitation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_da_organization_invitation_token_hash_unique" ON "da_organization_invitation" ("token_hash") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "da_audit_event" ("id" text not null, "actor_person_id" text not null, "actor_type" text not null, "actor_id" text not null, "role_context" text null, "organization_id" text null, "action" text not null, "resource" text not null, "target_id" text null, "previous_values" jsonb null, "new_values" jsonb null, "occurred_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "da_audit_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_audit_event_actor_person_id" ON "da_audit_event" ("actor_person_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_audit_event_deleted_at" ON "da_audit_event" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "da_actor_mapping" ("id" text not null, "actor_type" text not null, "actor_id" text not null, "person_id" text not null, "created_by_actor_type" text not null, "created_by_actor_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "da_actor_mapping_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_actor_mapping_person_id" ON "da_actor_mapping" ("person_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_da_actor_mapping_deleted_at" ON "da_actor_mapping" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_da_actor_mapping_actor_type_actor_id_unique" ON "da_actor_mapping" ("actor_type", "actor_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "da_organization_membership" add constraint "da_organization_membership_organization_id_foreign" foreign key ("organization_id") references "da_organization" ("id") on update cascade;`);
    this.addSql(`alter table if exists "da_organization_membership" add constraint "da_organization_membership_person_id_foreign" foreign key ("person_id") references "da_person" ("id") on update cascade;`);

    this.addSql(`alter table if exists "da_organization_invitation" add constraint "da_organization_invitation_organization_id_foreign" foreign key ("organization_id") references "da_organization" ("id") on update cascade;`);
    this.addSql(`alter table if exists "da_organization_invitation" add constraint "da_organization_invitation_created_by_person_id_foreign" foreign key ("created_by_person_id") references "da_person" ("id") on update cascade;`);

    this.addSql(`alter table if exists "da_audit_event" add constraint "da_audit_event_actor_person_id_foreign" foreign key ("actor_person_id") references "da_person" ("id") on update cascade;`);

    this.addSql(`alter table if exists "da_actor_mapping" add constraint "da_actor_mapping_person_id_foreign" foreign key ("person_id") references "da_person" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "da_organization_membership" drop constraint if exists "da_organization_membership_organization_id_foreign";`);

    this.addSql(`alter table if exists "da_organization_invitation" drop constraint if exists "da_organization_invitation_organization_id_foreign";`);

    this.addSql(`alter table if exists "da_organization_membership" drop constraint if exists "da_organization_membership_person_id_foreign";`);

    this.addSql(`alter table if exists "da_organization_invitation" drop constraint if exists "da_organization_invitation_created_by_person_id_foreign";`);

    this.addSql(`alter table if exists "da_audit_event" drop constraint if exists "da_audit_event_actor_person_id_foreign";`);

    this.addSql(`alter table if exists "da_actor_mapping" drop constraint if exists "da_actor_mapping_person_id_foreign";`);

    this.addSql(`drop table if exists "da_organization" cascade;`);

    this.addSql(`drop table if exists "da_person" cascade;`);

    this.addSql(`drop table if exists "da_organization_membership" cascade;`);

    this.addSql(`drop table if exists "da_organization_invitation" cascade;`);

    this.addSql(`drop table if exists "da_audit_event" cascade;`);

    this.addSql(`drop table if exists "da_actor_mapping" cascade;`);
  }

}
