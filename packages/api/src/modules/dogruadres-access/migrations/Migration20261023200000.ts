import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * PO-APPROVAL-FIRST-PLATFORM-MFA-GRANT-20261023 (Issue #230, comment 6370347326)
 * Backward-compatible schema adjustment to record canonical Product Owner
 * external authorization for initial platform administrator bootstrapping
 * without fabricating a fake Person grantor or bypassing existing checks.
 */
export class Migration20261023200000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`alter table da_platform_staff_grant
      alter column granted_by_person_id drop not null,
      add column external_authority text;`)
    this.addSql(`alter table da_platform_staff_grant
      add constraint da_staff_grant_authority_check
      check (granted_by_person_id is not null or external_authority is not null);`)
  }

  async down(): Promise<void> {
    throw new Error("Security migration rollback is destructive")
  }
}
