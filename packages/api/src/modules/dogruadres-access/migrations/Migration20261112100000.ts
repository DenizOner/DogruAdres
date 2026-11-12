import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: second-stage Owner request during the remaining 20 calendar days.
 * The first appeal and canonical 10+20 clock are unchanged. No native
 * termination, Store name release, review decision or sale reopening.
 */
export class Migration20261112100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_store_platform_closing
      add column final_review_request_id text unique check
        (final_review_request_id ~ '^dasfr_[a-f0-9]{32}$'),
      add column final_review_reason text check
        (char_length(final_review_reason) between 10 and 500),
      add column final_review_audit_event_id text references da_audit_event(id),
      add column final_review_requested_by_person_id text references da_person(id),
      add column final_review_requested_at timestamptz,
      add constraint da_store_platform_final_review_complete check (
        (final_review_request_id is null and final_review_reason is null
          and final_review_audit_event_id is null
          and final_review_requested_by_person_id is null
          and final_review_requested_at is null)
        or
        (final_review_request_id is not null
          and final_review_reason is not null
          and final_review_audit_event_id is not null
          and final_review_requested_by_person_id is not null
          and final_review_requested_at is not null
          and state='notification_unverified' and version=1
          and deadline_started_at is not null
          and final_review_requested_at >=
            deadline_started_at + interval '240 hours'
          and final_review_requested_at <
            deadline_started_at + interval '720 hours')
      );`)
  }
  override async down(): Promise<void> {
    throw new Error("Second-stage review and canonical audit require preservation review")
  }
}
