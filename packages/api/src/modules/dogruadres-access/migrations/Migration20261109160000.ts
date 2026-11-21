import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22 additive, private rename-request history. It does not change a native
 * Seller, free a name, move an URL, approve a request or create a Store.
 * A separately approved and verified path must implement those transitions.
 */
export class Migration20261109160000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_store_rename_request (
      id text primary key check (id ~ '^dasrn_[a-f0-9]{32}$'),
      organization_id text not null references da_organization(id),
      seller_id text not null check (seller_id ~ '^sel_[A-Za-z0-9_-]+$'),
      requested_by_person_id text not null references da_person(id),
      old_name text not null,
      old_handle text not null,
      proposed_name text not null,
      proposed_handle text not null check (proposed_handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
      risk_version text not null check (risk_version = 'store-rename-risks-v2'),
      risk_acknowledged_at timestamptz not null,
      source_audit_event_id text not null unique references da_audit_event(id),
      status text not null default 'pending_review'
        check (status in ('pending_review','approved','rejected','withdrawn')),
      created_at timestamptz not null default clock_timestamp(),
      updated_at timestamptz not null default clock_timestamp()
    );`)
    this.addSql(`create unique index da_store_rename_one_pending
      on da_store_rename_request(seller_id) where status='pending_review';`)
    this.addSql(`create index da_store_rename_org_history
      on da_store_rename_request(organization_id,seller_id,created_at desc);`)
  }
  override async down(): Promise<void> {
    throw new Error("Store rename requests, acknowledged risk and their audit links must be preserved")
  }
}
