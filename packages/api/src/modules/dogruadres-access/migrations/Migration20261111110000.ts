import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: platform starts a reasoned, sale-blocking closure and Owner may appeal.
 * No 10/30-day clock, name release, native termination or finalization here.
 * Verified mandatory-email delivery and independent review are later gates.
 */
export class Migration20261111110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists da_store_platform_closing (
      seller_id text primary key,
      organization_id text not null references da_organization(id),
      state text not null check (state in ('notification_unverified','appealed')),
      version integer not null check (version in (1,2)),
      request_id text not null unique check (request_id ~ '^dascp_[a-f0-9]{32}$'),
      reason text not null check (char_length(reason) between 10 and 500),
      source_audit_event_id text not null references da_audit_event(id),
      started_at timestamptz not null,
      appeal_request_id text unique check (appeal_request_id ~ '^dapa_[a-f0-9]{32}$'),
      appeal_reason text check (char_length(appeal_reason) between 10 and 500),
      appeal_audit_event_id text references da_audit_event(id),
      appealed_at timestamptz,
      updated_at timestamptz not null default clock_timestamp(),
      constraint da_store_platform_closing_appeal_complete check (
        (state='notification_unverified' and version=1
          and appeal_request_id is null and appeal_reason is null
          and appeal_audit_event_id is null and appealed_at is null)
        or
        (state='appealed' and version=2
          and appeal_request_id is not null and appeal_reason is not null
          and appeal_audit_event_id is not null and appealed_at is not null)
      )
    );`)
    this.addSql(`create index if not exists da_store_platform_closing_org
      on da_store_platform_closing (organization_id,seller_id);`)
  }
  override async down(): Promise<void> {
    throw new Error("Platform closure, appeals and audit require preservation review")
  }
}
