import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** B22: reversible Owner 30-day closing intent, NOT a native Seller termination.
 * The eventual irreversible transition is deliberately a separate gated step.
 * No existing Stores are modified or auto-closed by this migration.
 */
export class Migration20261110120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists da_store_owner_closing (
      seller_id text primary key,
      organization_id text not null references da_organization(id),
      state text not null check(state in ('closing','withdrawn')),
      version integer not null check(version between 1 and 2147483647),
      request_id text not null check(request_id ~ '^dasc_[a-f0-9]{32}$'),
      source_audit_event_id text not null references da_audit_event(id),
      started_at timestamptz not null,
      due_at timestamptz not null,
      updated_at timestamptz not null default clock_timestamp(),
      constraint da_store_owner_closing_30_days
        check(due_at=started_at + interval '30 days')
    );`)
    this.addSql(`create index if not exists da_store_owner_closing_org
      on da_store_owner_closing(organization_id,seller_id);`)
  }
  override async down(): Promise<void> {
    throw new Error("Owner closing and canonical audit history require reviewed preservation")
  }
}
