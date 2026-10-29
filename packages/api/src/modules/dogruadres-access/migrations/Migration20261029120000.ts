import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * B22: authoritative legal Organization -> marketplace Seller ownership evidence.
 * Native Mercur SellerMember.is_owner is NOT legal ownership.
 * No rows are seeded or inferred from legacy Seller/Member records.
 * This table deliberately has no cross-module Seller FK or automatic grant path.
 */
export class Migration20261029120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_organization_seller_ownership (
      id text primary key,
      organization_id text not null references da_organization(id),
      seller_id text not null check (seller_id ~ '^sel_[A-Za-z0-9_-]+$'),
      verification_audit_event_id text not null references da_audit_event(id),
      verified_at timestamptz not null,
      revoked_at timestamptz,
      created_at timestamptz not null default now(),
      check (revoked_at is null or revoked_at >= verified_at)
    );`)
    // PostgreSQL arbitrates concurrent claims: never two current legal owners.
    this.addSql(`create unique index da_one_active_legal_owner_per_seller
      on da_organization_seller_ownership(seller_id)
      where revoked_at is null;`)
    this.addSql(`create index da_owned_sellers_by_organization
      on da_organization_seller_ownership(organization_id,seller_id)
      where revoked_at is null;`)
  }

  override async down(): Promise<void> {
    throw new Error("B22 legal ownership history is retained; destructive rollback requires separate authorization")
  }
}
