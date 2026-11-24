import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Platform Admin Launcher:
 * Person-scoped launcher preference namespace for platform staff functions.
 * Stored preference is purely navigation order and collapse state; it never
 * grants platform authority, roles or entitlements.
 */
export class Migration20261124120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_platform_launcher_preference (
      id text primary key,
      person_id text not null references da_person(id),
      app_ids jsonb not null default '[]'::jsonb,
      collapsed_ids jsonb not null default '[]'::jsonb,
      version integer not null check (version between 1 and 2147483646),
      updated_at timestamptz not null default clock_timestamp(),
      unique (person_id),
      check (jsonb_typeof(app_ids) = 'array'),
      check (jsonb_typeof(collapsed_ids) = 'array')
    );`)
  }

  override async down(): Promise<void> {
    throw new Error("Platform launcher preferences require a separately approved lossless rollback")
  }
}
