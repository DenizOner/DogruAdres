import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * B22: event/recipient-scoped mandatory Owner-closing email attempts.
 * SMTP acceptance is not recipient delivery. No native Seller lifecycle,
 * name claim, finance or irreversible finalization is changed.
 */
export class Migration20261112130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists da_store_owner_closing_email (
      audit_event_id text not null references da_audit_event(id),
      person_id text not null references da_person(id),
      attempts integer not null default 0 check (attempts between 0 and 4),
      next_attempt_at timestamptz not null,
      last_attempt_at timestamptz,
      last_result text not null default 'pending'
        check (last_result in ('pending','inflight','accepted',
          'failed','unverified_identity','uncertain','invalidated')),
      message_id text,
      claim_id uuid,
      lease_until timestamptz,
      -- An SMTP 250 is never recorded as proof of delivery.
      accepted_at timestamptz,
      created_at timestamptz not null default clock_timestamp(),
      updated_at timestamptz not null default clock_timestamp(),
      primary key (audit_event_id,person_id),
      constraint da_owner_closing_mail_claim check (
        (claim_id is null and lease_until is null)
        or (claim_id is not null and lease_until is not null)
      )
    );`)
    this.addSql(`create index if not exists da_owner_closing_mail_due
      on da_store_owner_closing_email(next_attempt_at)
      where attempts<4;`)
  }

  override async down(): Promise<void> {
    throw new Error("Owner closing email attempt evidence requires preserved audit history")
  }
}
