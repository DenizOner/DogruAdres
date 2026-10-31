import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: permanent deduplication of an authenticated product draft intent.
 * Reserved outcomes are deliberately NOT retried after an uncertain native
 * write. Never touch upstream product tables or an unrelated database.
 */
export class Migration20261030120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_product_draft_request (
      id text primary key check (id ~ '^dapd_[0-9a-f]{32}$'),
      person_id text not null references da_person(id),
      organization_id text not null references da_organization(id),
      seller_id text not null check (seller_id ~ '^sel_[A-Za-z0-9_-]+$'),
      request_fingerprint char(64) not null,
      status text not null default 'reserved'
        check (status in ('reserved','created')),
      product_id text unique,
      completion_audit_event_id text references da_audit_event(id),
      created_at timestamptz not null default clock_timestamp(),
      completed_at timestamptz,
      check ((status='reserved' and product_id is null and
                completion_audit_event_id is null and completed_at is null)
          or (status='created' and product_id ~ '^prod_[A-Za-z0-9_-]+$'
                and completion_audit_event_id is not null and completed_at is not null))
    );`)
    this.addSql(`create index da_product_draft_request_principal
      on da_product_draft_request(person_id,organization_id,seller_id,created_at);`)
  }
  override async down(): Promise<void> {
    throw new Error("B22 product draft intents are immutable deduplication evidence")
  }
}
