import { Migration } from '@medusajs/framework/mikro-orm/migrations'

/** B20: per-Person persistent launcher preference — additive, non-destructive. */
export class Migration20261028200000 extends Migration {
  override async up(): Promise<void> {
    // Stores ordered app-id list and section collapsed flags per Person.
    // No FK cascade beyond Person deletion (which requires full account removal).
    // app_ids: JSON array of approved known app identifiers in preferred order.
    // collapsed_ids: JSON array of app identifiers the Person collapsed.
    // version: optimistic lock — incremented on every save.
    this.addSql(`create table da_launcher_preference (
      id text primary key,
      person_id text not null unique references da_person(id),
      app_ids jsonb not null default '[]',
      collapsed_ids jsonb not null default '[]',
      version integer not null default 1,
      updated_at timestamptz not null default now()
    );`)
    this.addSql(`create index da_launcher_preference_person on da_launcher_preference(person_id);`)
  }

  override async down(): Promise<void> {
    throw new Error('Launcher preference rollback requires explicit data migration approval')
  }
}
