import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * B22 Tax certificate metadata & application submission status.
 * Actual document bytes live outside PostgreSQL in a private filesystem root.
 * Accepted document versions are preserved indefinitely.
 */
export class Migration20261105090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_organization_application
      drop constraint da_organization_application_status_check;`)
    this.addSql(`alter table da_organization_application
      add constraint da_organization_application_status_check
      check (status in ('draft','withdrawn','submitted'));`)

    this.addSql(`create table da_organization_application_document (
      id text primary key check(id ~ '^da_doc_[0-9a-f]{32}$'),
      application_id text not null references da_organization_application(id),
      applicant_person_id text not null references da_person(id),
      storage_key text not null check(storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
      internal_name text not null check(internal_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(?:pdf|jpg|png)$'),
      mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
      compression text not null check(compression in ('gzip','none')),
      original_byte_length integer not null check(original_byte_length between 8 and 10485760),
      original_sha256 text not null check(original_sha256 ~ '^[0-9a-f]{64}$'),
      stored_byte_length integer not null check(stored_byte_length between 8 and 10485760),
      version integer not null check(version between 1 and 2147483647),
      is_current boolean not null default true,
      created_at timestamptz not null default clock_timestamp(),
      updated_at timestamptz not null default clock_timestamp(),
      constraint da_org_app_doc_unique_key unique (storage_key),
      constraint da_org_app_doc_unique_app_ver unique (application_id, version)
    );`)

    this.addSql(`create index da_org_app_doc_app_current
      on da_organization_application_document(application_id, is_current);`)
    this.addSql(`create index da_org_app_doc_applicant
      on da_organization_application_document(applicant_person_id);`)
  }

  override async down(): Promise<void> {
    throw new Error("Tax certificate metadata and application submissions require reviewed retention")
  }
}
