import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** One canonical company-policy audit may notify multiple current Owners.
 * Retain all historical one-recipient security notices without backfill.
 */
export class Migration20261107191000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_notification_receipt
      drop constraint da_notification_receipt_audit_event_id_key;`)
    this.addSql(`create unique index da_notification_receipt_event_person
      on da_notification_receipt(audit_event_id,person_id);`)
  }
  override async down(): Promise<void> {
    throw new Error("Preserve private notification recipients and read history")
  }
}
