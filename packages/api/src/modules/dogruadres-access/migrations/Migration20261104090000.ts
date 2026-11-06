import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Only Person-private, non-submitted drafts. No implicit Organization/Owner. */
export class Migration20261104090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table da_organization_application (
      id text primary key check(id ~ '^daorgapp_[0-9a-f]{32}$'),
      applicant_person_id text not null references da_person(id),
      business_kind text not null check(business_kind in ('individual_business','legal_company')),
      legal_name text not null check(char_length(legal_name) between 2 and 200),
      landline_phone text not null check(char_length(landline_phone) between 7 and 40),
      status text not null default 'draft' check(status='draft'),
      version integer not null default 1 check(version between 1 and 2147483647),
      created_at timestamptz not null default clock_timestamp(),
      updated_at timestamptz not null default clock_timestamp()
    );`)
    this.addSql(`create index da_org_application_applicant
      on da_organization_application(applicant_person_id,updated_at desc,id);`)
  }
  override async down(): Promise<void> {
    throw new Error("Private Organization drafts require reviewed data retention")
  }
}
