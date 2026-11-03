import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Private, self-declared canonical Person contact. Existing Persons are NOT
 * retroactively treated as registered mobile contacts; no native Customer
 * number is copied, and no verification/ownership is inferred from equality.
 */
export class Migration20261103200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_person
      add column mobile_phone text null,
      add column mobile_version integer not null default 0;`)
    this.addSql(`alter table da_person
      add constraint da_person_mobile_shape
      check (mobile_phone is null or
        (char_length(mobile_phone) between 6 and 20 and
         mobile_phone ~ '^[+]?[0-9]+$'));`)
    this.addSql(`alter table da_person
      add constraint da_person_mobile_version
      check (mobile_version between 0 and 2147483647);`)
  }

  override async down(): Promise<void> {
    throw new Error("Private Person contact cannot be discarded by automatic downgrade")
  }
}
