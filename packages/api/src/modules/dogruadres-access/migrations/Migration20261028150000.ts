import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20261028150000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table da_notification_receipt (
      id text primary key,
      person_id text not null references da_person(id),
      audit_event_id text not null unique references da_audit_event(id),
      read_at timestamptz,
      created_at timestamptz not null default now()
    );`)
    this.addSql(`create index da_notification_recipient on da_notification_receipt(person_id,created_at desc,id);`)
  }
  async down(): Promise<void> { throw Error('Retain notification read history') }
}
