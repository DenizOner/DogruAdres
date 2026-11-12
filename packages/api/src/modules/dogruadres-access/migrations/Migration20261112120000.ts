import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: reasoned Staff decision on exactly one already filed appeal or
 * second-stage review. Does NOT reopen sales or finalize Seller/name rights.
 */
export class Migration20261112120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_store_platform_closing
      add column review_decision_request_id text unique check
        (review_decision_request_id ~ '^dasdr_[a-f0-9]{32}$'),
      add column review_decision text check (review_decision in ('accepted','rejected')),
      add column review_decision_reason text check
        (char_length(review_decision_reason) between 10 and 500),
      add column review_decision_source_request_id text,
      add column review_decision_audit_event_id text references da_audit_event(id),
      add column review_decided_by_person_id text references da_person(id),
      add column review_decided_at timestamptz,
      add constraint da_store_platform_review_decision_complete check (
        (review_decision_request_id is null and review_decision is null
          and review_decision_reason is null
          and review_decision_source_request_id is null
          and review_decision_audit_event_id is null
          and review_decided_by_person_id is null
          and review_decided_at is null)
        or
        (review_decision_request_id is not null
          and review_decision is not null
          and review_decision_reason is not null
          and review_decision_source_request_id is not null
          and review_decision_audit_event_id is not null
          and review_decided_by_person_id is not null
          and review_decided_at is not null
          and review_decision_source_request_id =
            coalesce(appeal_request_id,final_review_request_id)
          and review_decided_at >=
            coalesce(appealed_at,final_review_requested_at))
      );`)
  }
  override async down(): Promise<void> {
    throw new Error("Staff review decisions are canonical and require preservation")
  }
}
