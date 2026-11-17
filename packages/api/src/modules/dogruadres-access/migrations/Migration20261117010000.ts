import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * B20: new Person x Organization preference namespace. Preserve every legacy
 * da_launcher_preference Person-only row bit for bit; no copy/backfill/delete.
 * A preference is NEVER an entitlement and is only reachable after live ACL.
 */
export class Migration20261117010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_company_launcher_preference (
      id text primary key,
      person_id text not null references da_person(id),
      organization_id text not null references da_organization(id),
      app_ids jsonb not null default '[]'::jsonb,
      collapsed_ids jsonb not null default '[]'::jsonb,
      version integer not null check (version between 1 and 2147483646),
      updated_at timestamptz not null default clock_timestamp(),
      unique (person_id, organization_id),
      check (jsonb_typeof(app_ids) = 'array'),
      check (jsonb_typeof(collapsed_ids) = 'array')
    );`)
  }
  override async down(): Promise<void> {
    throw new Error("Company launcher preferences require a separately approved lossless rollback")
  }
}
