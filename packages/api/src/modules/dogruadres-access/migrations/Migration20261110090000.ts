import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: canonical Organization-owned voluntary pause. This is deliberately
 * separate from native Seller.status and mutable scheduled closure dates.
 * Existing Shops are not paused by migration or backfilled from native fields.
 */
export class Migration20261110090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists da_store_owner_pause (
      seller_id text primary key,
      organization_id text not null references da_organization(id),
      paused boolean not null,
      version integer not null check(version between 1 and 2147483647),
      request_id text not null check(request_id ~ '^dasp_[a-f0-9]{32}$'),
      source_audit_event_id text not null references da_audit_event(id),
      updated_at timestamptz not null default clock_timestamp()
    );`)
    this.addSql(`create index if not exists da_store_owner_pause_organization
      on da_store_owner_pause (organization_id,seller_id);`)
  }
  override async down(): Promise<void> {
    throw new Error("Owner pause and canonical audit history require reviewed preservation")
  }
}
