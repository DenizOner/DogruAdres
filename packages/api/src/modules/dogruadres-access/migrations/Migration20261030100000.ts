import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: independently assigned, person + Organization + Store product action.
 * No default grants, migration backfill, public issuance endpoint or native
 * SellerMember/is_owner inference. Any future issuer must atomically emit the
 * authoritative Foundation audit and outbox in the same transaction.
 */
export class Migration20261030100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_store_product_permission (
      id text primary key check(id ~ '^daspg_[A-Za-z0-9_-]+$'),
      person_id text not null references da_person(id),
      organization_id text not null references da_organization(id),
      seller_id text not null check(seller_id ~ '^sel_[A-Za-z0-9_-]+$'),
      permission text not null check(permission = 'products.edit'),
      issued_by_person_id text not null references da_person(id),
      source_audit_event_id text not null references da_audit_event(id),
      created_at timestamptz not null default clock_timestamp(),
      expires_at timestamptz,
      revoked_at timestamptz,
      check (expires_at is null or expires_at > created_at),
      check (revoked_at is null or revoked_at >= created_at)
    );`)
    this.addSql(`create unique index da_active_store_product_permission
      on da_store_product_permission(person_id,organization_id,seller_id,permission)
      where revoked_at is null;`)
    this.addSql(`create index da_store_product_permission_expiry
      on da_store_product_permission(person_id,organization_id,seller_id,expires_at)
      where revoked_at is null;`)
  }
  override async down(): Promise<void> {
    throw new Error("B22 product permission provenance and revocation history must be retained")
  }
}
