import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** An initial Store application belongs to its selected Organization at creation.
 * Native Seller's independently approved/open state remains the commerce gate.
 * The reservation is irreversible and preserves ambiguous partial failures.
 */
export class Migration20261029130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_store_application (
      id text primary key check(id ~ '^daapp_[0-9a-f]{32}$'),
      organization_id text not null references da_organization(id),
      person_id text not null references da_person(id),
      member_actor_id text not null,
      member_auth_identity_id text not null,
      request_fingerprint text not null check(length(request_fingerprint)=64),
      status text not null check(status in ('reserved','creating','created')),
      seller_id text unique,
      created_at timestamptz not null default clock_timestamp(),
      updated_at timestamptz not null default clock_timestamp(),
      check ((status='created' and seller_id is not null) or
             (status<>'created' and seller_id is null))
    );`)
    this.addSql(`create index da_store_application_org on da_store_application
      (organization_id,created_at desc);`)
  }
  override async down(): Promise<void> {
    throw new Error("B22 Store application and audit history must be retained")
  }
}
