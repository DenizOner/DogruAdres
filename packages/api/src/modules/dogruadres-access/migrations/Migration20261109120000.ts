import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: a committed official application reserves its normalized Store name
 * across all Organizations. Existing application history is not rewritten.
 * Older native Sellers are checked live before each new reservation.
 * This intentionally does NOT implement Store renaming/name release yet.
 */
export class Migration20261109120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_store_application
      add column store_name_hash text,
      add constraint da_store_application_name_hash_check
        check (store_name_hash is null or store_name_hash ~ '^[a-f0-9]{64}$');`)
    this.addSql(`create unique index da_store_application_global_store_name
      on da_store_application(store_name_hash)
      where store_name_hash is not null;`)
  }
  override async down(): Promise<void> {
    throw new Error("Do not discard reserved names or existing Store application history")
  }
}
