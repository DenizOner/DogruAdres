import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22 #76: per-native-Store Buyer Organization blocks, never Customer
 * email/CustomerGroup linkage. Only Foundation canonical audit/outbox proves
 * changes; revoked rows remain immutable history. No automatic backfill.
 */
export class Migration20261030150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_store_buyer_organization_block (
      id text primary key check(id ~ '^dasbb_[A-Za-z0-9_-]+$'),
      owner_organization_id text not null references da_organization(id),
      seller_id text not null check(seller_id ~ '^sel_[A-Za-z0-9_-]+$'),
      buyer_organization_id text not null references da_organization(id),
      issued_by_person_id text not null references da_person(id),
      source_audit_event_id text not null unique references da_audit_event(id),
      created_at timestamptz not null default clock_timestamp(),
      revoked_at timestamptz,
      revoked_by_person_id text references da_person(id),
      revocation_audit_event_id text unique references da_audit_event(id),
      check ((revoked_at is null and revoked_by_person_id is null
        and revocation_audit_event_id is null) or
        (revoked_at is not null and revoked_by_person_id is not null
        and revocation_audit_event_id is not null)),
      check (revoked_at is null or revoked_at >= created_at)
    );`)
    this.addSql(`create unique index da_active_store_buyer_organization_block
      on da_store_buyer_organization_block(seller_id,buyer_organization_id)
      where revoked_at is null;`)
    this.addSql(`create index da_store_buyer_block_owner
      on da_store_buyer_organization_block(owner_organization_id,seller_id)
      where revoked_at is null;`)
  }
  override async down(): Promise<void> {
    throw new Error("B22 Store Buyer Organization blocking audit history must be retained")
  }
}
