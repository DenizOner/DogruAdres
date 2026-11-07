import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Adds an auditable review stage without rewriting historical applications. */
export class Migration20261107170000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_organization_application
      drop constraint da_organization_application_status_check;`)
    this.addSql(`alter table da_organization_application
      add constraint da_organization_application_status_check
      check (status in ('draft','withdrawn','submitted','in_review',
                       'correction_requested','rejected','approved'));`)
    this.addSql(`drop index if exists da_org_application_submitted;`)
    this.addSql(`create index da_org_application_submitted
      on da_organization_application(updated_at desc,id desc)
      where status in ('submitted','in_review');`)
  }

  override async down(): Promise<void> {
    throw new Error("Cannot revert in_review without verifying retained application records")
  }
}
