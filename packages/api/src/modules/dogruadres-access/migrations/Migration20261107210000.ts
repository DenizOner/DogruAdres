import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: one monotonic revision per committed company Store-policy change.
 * Old Organizations preserve their existing eligibility at revision zero.
 */
export class Migration20261107210000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_organization
      add column store_application_version integer not null default 0;`)
    this.addSql(`alter table da_organization
      add constraint da_organization_store_application_version_nonnegative
      check (store_application_version >= 0);`)
  }
  override async down(): Promise<void> {
    throw new Error("Preserve company-policy revision and historical replay protection")
  }
}
