import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: immutable first legal Organization attribution of a native Customer
 * Cart. Native Cart remains owned by Medusa; cart metadata is NOT trusted.
 * Never backfill or silently reassign a cart to a different Organization.
 */
export class Migration20261030140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_buyer_cart_attribution (
      cart_id text primary key check(cart_id ~ '^cart_[A-Za-z0-9_-]{1,123}$'),
      organization_id text not null references da_organization(id),
      person_id text not null references da_person(id),
      customer_id text not null check(customer_id ~ '^cus_[A-Za-z0-9_-]+$'),
      source_audit_event_id text not null unique references da_audit_event(id),
      created_at timestamptz not null default clock_timestamp()
    );`)
    this.addSql(`create index da_buyer_cart_attribution_organization
      on da_buyer_cart_attribution(organization_id,person_id,created_at);`)
  }
  override async down(): Promise<void> {
    throw new Error("B22 cart attribution and audit provenance must be retained")
  }
}
