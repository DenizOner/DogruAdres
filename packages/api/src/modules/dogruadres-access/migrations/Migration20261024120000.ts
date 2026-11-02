import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * PO-APPROVAL-PLATFORM-SMTP-SETTINGS-20261024 (Issue #241)
 * Singleton platform-level SMTP configuration with CAS versioning, strict TLS
 * enforcement, encrypted credentials and audit linkage.
 */
export class Migration20261024120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists da_platform_smtp_settings (
        id                   text        primary key,
        enabled             boolean     not null default true,
        host                 text        not null,
        port                 integer     not null default 465 check(port > 0 and port <= 65535),
        security             text        not null default 'ssl' check(security in ('ssl', 'tls')),
        username             text,
        password_encrypted   text,
        from_email           text        not null,
        from_name            text,
        version              integer     not null default 0 check(version >= 0),
        updated_by_person_id text        references da_person(id),
        created_at           timestamptz not null default now(),
        updated_at           timestamptz not null default now(),
        constraint da_platform_smtp_settings_singleton check(id = 'current')
      );
    `)
  }

  async down(): Promise<void> {
    throw new Error("security migration rollback is destructive")
  }
}
