import { Migration } from "@medusajs/framework/mikro-orm/migrations"
/** Old cookies are legacy, never promoted by a rollout flag alone. */
export class Migration20261022011000 extends Migration {
  async up():Promise<void>{
    this.addSql(`alter table da_browser_session add column mfa_purpose text
      not null default 'legacy' check(mfa_purpose in ('legacy','mfa_enroll','full'));`)
    this.addSql(`alter table da_browser_session add column mfa_platform_version integer;`)
    this.addSql(`alter table da_browser_session add column mfa_person_version integer;`)
    this.addSql(`alter table da_browser_session add constraint da_browser_mfa_scope_versions
      check (
        (mfa_purpose='legacy' and mfa_platform_version is null and mfa_person_version is null)
        or
        (mfa_purpose in ('mfa_enroll','full') and
         mfa_platform_version is not null and mfa_person_version is not null and
         mfa_platform_version between 0 and 2147483647 and
         mfa_person_version between 0 and 2147483647)
      );`)
  }
  async down():Promise<void>{
    throw new Error("Retain browser authentication scope evidence pending explicit retention review")
  }
}
