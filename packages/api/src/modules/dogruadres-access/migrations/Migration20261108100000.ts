import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22 unfinished Store draft: independent of native Seller reservations.
 * No existing data is backfilled, no Store rights or grants are created.
 */
export class Migration20261108100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_store_application_draft (
      id text primary key check(id ~ '^dasdraft_[0-9a-f]{32}$'),
      organization_id text not null references da_organization(id),
      created_by_person_id text not null references da_person(id),
      updated_by_person_id text not null references da_person(id),
      name text not null check(char_length(name) between 3 and 40),
      email text not null check(char_length(email) between 3 and 254),
      currency_code text not null check(currency_code ~ '^[a-z]{3}$'),
      status text not null default 'draft' check(status='draft'),
      version integer not null default 1 check(version between 1 and 2147483647),
      created_at timestamptz not null default clock_timestamp(),
      updated_at timestamptz not null default clock_timestamp()
    );`)
    this.addSql(`create index da_store_application_draft_org
      on da_store_application_draft(organization_id,updated_at desc,id desc);`)
  }
  override async down(): Promise<void> {
    throw new Error("Preserve private Organization Store drafts and audit history")
  }
}
