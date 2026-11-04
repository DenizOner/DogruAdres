import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22 Buyer Organization × approved Store follow. Never a Person-specific
 * commercial/customer relation or an implicit private-price entitlement.
 * Soft-unfollow preserves audit lineage; no destructive cleanup is authorized.
 */
export class Migration20261104150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_buyer_store_follow (
      buyer_organization_id text not null references da_organization(id),
      seller_id text not null check(seller_id ~ '^sel_[A-Za-z0-9_-]+$'),
      version integer not null check(version between 1 and 2147483647),
      followed_at timestamptz not null default clock_timestamp(),
      revoked_at timestamptz,
      source_audit_event_id text not null unique references da_audit_event(id),
      created_at timestamptz not null default clock_timestamp(),
      updated_at timestamptz not null default clock_timestamp(),
      primary key(buyer_organization_id,seller_id),
      constraint da_buyer_store_follow_dates
        check(revoked_at is null or revoked_at >= followed_at)
    );`)
    this.addSql(`create index da_buyer_store_follow_active
      on da_buyer_store_follow(buyer_organization_id,seller_id)
      where revoked_at is null;`)
  }
  override async down(): Promise<void> {
    throw new Error("B22 Store follow and audit history require reviewed data retention")
  }
}
