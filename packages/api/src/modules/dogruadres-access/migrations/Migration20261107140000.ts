import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Previously stored certificates have NULL scan evidence; the next authorized
 * access must scan them. No legacy record is automatically marked safe.
 * Preview bytes remain private in PostgreSQL, never public or browser-source.
 */
export class Migration20261107140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_organization_application_document
      add column scanned_clamav_identity text,
      add column preview_renderer_revision text,
      add column safe_preview_png bytea,
      add column safe_preview_sha256 text,
      add column scanned_at timestamptz;`)
    this.addSql(`alter table da_organization_application_document
      add constraint da_org_app_doc_scan_evidence
      check (
        (scanned_clamav_identity is null and preview_renderer_revision is null
         and safe_preview_png is null and safe_preview_sha256 is null and scanned_at is null)
        or
        (scanned_clamav_identity is not null and
         scanned_clamav_identity ~ '^[A-Za-z0-9_.+-]{1,40}/[1-9][0-9]*/[0-9]{13}$'
         and preview_renderer_revision is not null
         and length(preview_renderer_revision) between 1 and 80
         and safe_preview_png is not null
         and octet_length(safe_preview_png) between 64 and 4194304
         and safe_preview_sha256 ~ '^[0-9a-f]{64}$'
         and scanned_at is not null)
      );`)
  }

  override async down(): Promise<void> {
    throw new Error("Private scan evidence and retained safe previews require reviewed retention")
  }
}
