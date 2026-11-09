import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: keep original application and rename history immutable. An original
 * name claim becomes reusable only after an approved rename plus the internal
 * 30-calendar-day hold. Pending/in-flight applications remain exclusive.
 * The native Seller and approved rename history are independently checked
 * under the existing per-name advisory lock before every new claim.
 */
export class Migration20261109170000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_store_application
      add column name_claim_released_at timestamptz;`)
    this.addSql(`drop index da_store_application_global_store_name;`)
    this.addSql(`create unique index da_store_application_global_store_name
      on da_store_application(store_name_hash)
      where store_name_hash is not null and name_claim_released_at is null;`)
    this.addSql(`alter table da_store_rename_request
      add column approved_at timestamptz;`)
    this.addSql(`alter table da_store_rename_request
      drop constraint da_store_rename_request_status_check;`)
    this.addSql(`alter table da_store_rename_request
      add constraint da_store_rename_request_status_check
      check (status in ('pending_review','approving','approved','rejected','withdrawn'));`)
    this.addSql(`alter table da_store_rename_request
      add constraint da_store_rename_request_approved_time_check
      check (status <> 'approved' or approved_at is not null);`)
  }
  override async down(): Promise<void> {
    throw new Error("Approved Store rename claims and historical records must be retained")
  }
}
