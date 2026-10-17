import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261017150237 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "da_audit_event" add column if not exists "module" text not null default 'dogruadres-access';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "da_audit_event" drop column if exists "module";`);
  }

}
