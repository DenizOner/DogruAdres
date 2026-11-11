import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: per-recipient delivery attempts and audited clock evidence.
 * Native Seller termination, name claims and money are untouched.
 */
export class Migration20261111170000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_store_platform_closing
      add column deadline_started_at timestamptz,
      add column deadline_basis text check
        (deadline_basis in ('owner_delivery','admin_alert')),
      add column admin_alert_at timestamptz,
      add constraint da_store_platform_closing_deadline_proof check (
        (deadline_started_at is null and deadline_basis is null
          and admin_alert_at is null)
        or (deadline_started_at is not null and deadline_basis='owner_delivery'
          and admin_alert_at is null)
        or (deadline_started_at is not null and deadline_basis='admin_alert'
          and admin_alert_at=deadline_started_at)
      );`)
    this.addSql(`create table da_store_platform_closing_email (
      seller_id text not null references da_store_platform_closing(seller_id),
      person_id text not null references da_person(id),
      attempts integer not null default 0 check (attempts between 0 and 4),
      next_attempt_at timestamptz not null,
      last_attempt_at timestamptz,
      last_result text not null default 'pending'
        check (last_result in ('pending','inflight','accepted',
          'failed','unverified_identity','uncertain','delivered')),
      message_id text,
      claim_id uuid,
      lease_until timestamptz,
      delivered_at timestamptz,
      delivery_source text
        check (delivery_source in ('verified_provider','authenticated_owner')),
      email_link_visited_at timestamptz,
      account_viewed_at timestamptz,
      created_at timestamptz not null default clock_timestamp(),
      updated_at timestamptz not null default clock_timestamp(),
      primary key (seller_id,person_id),
      constraint da_store_platform_closing_email_delivery_proof check (
        (delivered_at is null and delivery_source is null)
        or (delivered_at is not null and delivery_source is not null)
      ),
      constraint da_store_platform_closing_email_lease check (
        (claim_id is null and lease_until is null)
        or (claim_id is not null and lease_until is not null)
      )
    );`)
    this.addSql(`create index da_store_platform_closing_email_due
      on da_store_platform_closing_email (next_attempt_at)
      where attempts < 4 and delivered_at is null;`)
    this.addSql(`create table da_store_platform_closing_email_link (
      seller_id text not null,
      person_id text not null,
      attempt integer not null check (attempt between 1 and 4),
      token_sha256 text not null unique check
        (token_sha256 ~ '^[a-f0-9]{64}$'),
      issued_at timestamptz not null default clock_timestamp(),
      visited_at timestamptz,
      primary key (seller_id,person_id,attempt),
      foreign key (seller_id,person_id)
        references da_store_platform_closing_email (seller_id,person_id)
    );`)
    this.addSql(`create table da_store_platform_closing_admin_notice (
      id text primary key check (id ~ '^danal_[a-f0-9]{32}$'),
      seller_id text not null references da_store_platform_closing(seller_id),
      person_id text not null references da_person(id),
      created_at timestamptz not null default clock_timestamp(),
      read_at timestamptz,
      unique (seller_id,person_id)
    );`)
    this.addSql(`create index da_store_platform_closing_admin_notice_person
      on da_store_platform_closing_admin_notice (person_id,created_at desc);`)
  }

  override async down(): Promise<void> {
    throw new Error("Closing delivery, deadline and notification evidence require preservation review")
  }
}
