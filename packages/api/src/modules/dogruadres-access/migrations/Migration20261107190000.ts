import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * B22: independent Store application eligibility, not legal Organization or
 * native Mercur Seller suspension. Old Organizations retain current access.
 * An explicit platform Staff action changes the setting and writes audit/outbox.
 */
export class Migration20261107190000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_organization
      add column store_application_enabled boolean not null default true;`)
  }

  override async down(): Promise<void> {
    throw new Error("Store application eligibility and its history require reviewed preservation")
  }
}
