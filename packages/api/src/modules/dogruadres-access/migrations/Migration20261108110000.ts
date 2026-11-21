import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22 Store application draft preparation belongs to the legal Organization.
 * Explicit, revocable Member permission, not a Seller or Owner entitlement.
 * Never backfill a privilege from legacy roles, group names or native RBAC.
 */
export class Migration20261108110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_organization_store_draft_permission (
      id text primary key check(id ~ '^dasdpg_[A-Za-z0-9_-]+$'),
      person_id text not null references da_person(id),
      organization_id text not null references da_organization(id),
      membership_id text not null references da_organization_membership(id),
      permission text not null check(permission='store.application.draft.manage'),
      issued_by_person_id text not null references da_person(id),
      source_audit_event_id text not null references da_audit_event(id),
      created_at timestamptz not null default clock_timestamp(),
      revoked_at timestamptz,
      check(revoked_at is null or revoked_at>=created_at)
    );`)
    this.addSql(`create unique index da_active_org_store_draft_permission
      on da_organization_store_draft_permission(person_id,organization_id,permission)
      where revoked_at is null;`)
  }
  override async down(): Promise<void> {
    throw new Error("Preserve Organization draft permissions, revocations and audit provenance")
  }
}
