import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * B22: a protected Owner who joins an already active closing receives their
 * own four-slot notice schedule. Historical recipients retain the existing
 * audit-event-anchored schedule. No closure clock, native Seller or audit is
 * rewritten, and the new timestamp never represents mailbox delivery.
 */
export class Migration20261115184500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_store_owner_closing_email
      add column if not exists late_schedule_at timestamptz;`)
  }

  override async down(): Promise<void> {
    throw new Error("Late Owner notice scheduling proof must not be discarded")
  }
}
