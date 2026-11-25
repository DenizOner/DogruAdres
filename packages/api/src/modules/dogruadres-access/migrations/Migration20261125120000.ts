import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Personal Notification Preferences (#275):
 * Canonical Person-scoped notification channel preferences and daily digest queue.
 * Preferences belong to da_person and never grant organization/store authority.
 */
export class Migration20261125120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_person_notification_preference (
      id text primary key,
      person_id text not null references da_person(id),
      preferences jsonb not null,
      version integer not null check (version between 1 and 2147483646),
      updated_at timestamptz not null default clock_timestamp(),
      unique (person_id),
      check (jsonb_typeof(preferences) = 'object')
    );`)

    this.addSql(`create table da_notification_digest_queue (
      id text primary key,
      person_id text not null references da_person(id),
      organization_id text null,
      category text not null,
      event_action text not null,
      audit_event_id text null,
      summary_key text not null,
      digest_date date not null default (clock_timestamp() at time zone 'UTC')::date,
      created_at timestamptz not null default clock_timestamp(),
      claimed_at timestamptz null,
      claim_id text null,
      sent_at timestamptz null,
      failed_at timestamptz null,
      attempts integer not null default 0,
      unique (person_id, audit_event_id)
    );`)

    this.addSql(`create index da_notification_digest_queue_due_idx
      on da_notification_digest_queue (sent_at, failed_at, digest_date, created_at)
      where sent_at is null and failed_at is null;`)
  }

  override async down(): Promise<void> {
    throw new Error("Personal notification preferences require a separately approved lossless rollback")
  }
}
