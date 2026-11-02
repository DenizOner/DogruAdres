import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: explicit Organization-scoped procurement permission; not a native
 * Customer, cart or checkout entitlement. Never backfill by role or email.
 */
export class Migration20261030130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_organization_buyer_permission (
      id text primary key check(id ~ '^dabpg_[A-Za-z0-9_-]+$'),
      person_id text not null references da_person(id),
      organization_id text not null references da_organization(id),
      permission text not null check (permission='buyer.purchase'),
      issued_by_person_id text not null references da_person(id),
      source_audit_event_id text not null references da_audit_event(id),
      created_at timestamptz not null default clock_timestamp(),
      expires_at timestamptz,
      revoked_at timestamptz,
      check(expires_at is null or expires_at>created_at),
      check(revoked_at is null or revoked_at>=created_at)
    );`)
    this.addSql(`create unique index da_active_org_buyer_permission
      on da_organization_buyer_permission(person_id,organization_id,permission)
      where revoked_at is null;`)
  }
  override async down(): Promise<void> {
    throw new Error("B22 procurement permission provenance and revocation history must be retained")
  }
}
