import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Mercur 2.4.1 introduced a Seller migration named Migration20261103000000.
 * Our historical migration with that exact name created this audited B22 table.
 * Medusa/MikroORM tracks migration names in a shared public ledger: on a fresh
 * install the native Seller migration can win, silently skipping our table.
 *
 * Repair ONLY our own table with a uniquely named, additive, repeat-safe
 * migration. Retain the historical migration/ledger and every existing row.
 *
 * On an existing 2.4.0 database the reverse collision can silently skip
 * Mercur's invite-token hashing. Refuse to proceed rather than accept plaintext
 * invite tokens or rewrite Mercur's private migration state ourselves.
 */
export class Migration20261106090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`do $$
      begin
        if not exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'member_invite'
            and column_name = 'token_hash'
        ) then
          raise exception 'Mercur 2.4.1 invite token hashing is unverified; migration name collision requires controlled recovery';
        end if;
      end $$;`)

    this.addSql(`create table if not exists da_store_buyer_price_group (
      id text primary key check (id ~ '^dabpgm_[A-Za-z0-9_-]+$'),
      owner_organization_id text not null references da_organization(id),
      seller_id text not null check (seller_id ~ '^sel_[A-Za-z0-9_-]+$'),
      buyer_organization_id text not null references da_organization(id),
      customer_group_id text not null check (customer_group_id ~ '^cusgroup_[A-Za-z0-9_-]+$'),
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
    this.addSql(`create unique index if not exists da_store_buyer_price_group_active
      on da_store_buyer_price_group(seller_id,buyer_organization_id,customer_group_id)
      where revoked_at is null;`)
    this.addSql(`create index if not exists da_store_buyer_price_group_owner
      on da_store_buyer_price_group(owner_organization_id,seller_id)
      where revoked_at is null;`)
  }

  override async down(): Promise<void> {
    throw new Error("Audited B22 Store Buyer Price Group history must be retained")
  }
}
