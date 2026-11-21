import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22 exceptional administrative Store name-right assignment.
 * Historical Seller, Organization, Order, audit and native identity are kept.
 * A source Seller must remain suspended until separately approved rename.
 */
export class Migration20261110170000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_store_name_transfer (
      id text primary key check(id ~ '^dastr_[a-f0-9]{32}$'),
      source_application_id text not null references da_store_application(id),
      source_seller_id text not null check(source_seller_id ~ '^sel_[A-Za-z0-9_-]+$'),
      source_organization_id text not null references da_organization(id),
      target_application_id text not null references da_store_application(id),
      target_seller_id text not null check(target_seller_id ~ '^sel_[A-Za-z0-9_-]+$'),
      target_organization_id text not null references da_organization(id),
      old_name text not null,
      old_handle text not null check(old_handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
      name_hash text not null check(name_hash ~ '^[a-f0-9]{64}$'),
      reason text not null check(length(reason) between 10 and 500),
      decided_by_person_id text not null references da_person(id),
      source_audit_event_id text not null unique references da_audit_event(id),
      status text not null check(status in ('assigned','superseded')),
      decided_at timestamptz not null default clock_timestamp(),
      check(source_seller_id <> target_seller_id)
    );`)
    this.addSql(`create unique index da_store_name_transfer_one_name
      on da_store_name_transfer(name_hash) where status='assigned';`)
    this.addSql(`create unique index da_store_name_transfer_one_handle
      on da_store_name_transfer(old_handle) where status='assigned';`)
    this.addSql(`create index da_store_name_transfer_source
      on da_store_name_transfer(source_seller_id,decided_at desc);`)
  }
  override async down(): Promise<void> {
    throw new Error("Audited Store name-right decisions require reviewed retention")
  }
}
