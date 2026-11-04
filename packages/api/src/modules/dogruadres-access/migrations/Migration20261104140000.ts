import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Additive B22 application lifecycle: no rows erased, documents or rights created. */
export class Migration20261104140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_organization_application
      drop constraint da_organization_application_status_check;`)
    this.addSql(`alter table da_organization_application
      add constraint da_organization_application_status_check
      check (status in ('draft','withdrawn'));`)
  }
  override async down(): Promise<void> {
    throw new Error("Withdrawn private application history must not be silently erased")
  }
}
