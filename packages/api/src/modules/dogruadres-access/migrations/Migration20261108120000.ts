import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Existing private Store drafts remain durable when an Owner submits one.
 * A draft is never deleted or silently converted into another Seller.
 */
export class Migration20261108120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_store_application_draft
      drop constraint da_store_application_draft_status_check;`)
    this.addSql(`alter table da_store_application_draft
      add column submitted_application_id text
      references da_store_application(id);`)
    this.addSql(`alter table da_store_application_draft
      add constraint da_store_application_draft_status_check
      check(status in ('draft','submitting','submitted'));`)
    this.addSql(`alter table da_store_application_draft
      add constraint da_store_application_draft_submission_check
      check((status='draft' and submitted_application_id is null) or
            (status in ('submitting','submitted') and submitted_application_id is not null));`)
    this.addSql(`create unique index da_store_application_draft_one_application
      on da_store_application_draft(submitted_application_id)
      where submitted_application_id is not null;`)
  }
  override async down(): Promise<void> {
    throw new Error("Preserve submitted Store drafts and native Seller application references")
  }
}
