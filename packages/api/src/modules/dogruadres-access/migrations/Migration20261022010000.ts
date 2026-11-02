import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Purpose-limited MFA enrollment: never a login, staff grant or bearer token. */
export class Migration20261022010000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table da_mfa_enrollment_intent (
      id text primary key check(length(id)=64),
      session_id text not null references da_browser_session(id),
      person_id text not null references da_person(id),
      auth_identity_id text not null references da_login_binding(auth_identity_id),
      factor_id text not null check(length(factor_id) between 1 and 128),
      attempts integer not null default 0 check(attempts between 0 and 5),
      created_at timestamptz not null default clock_timestamp(),
      expires_at timestamptz not null,
      consumed_at timestamptz,
      revoked_at timestamptz,
      check(expires_at > created_at),
      check(consumed_at is null or revoked_at is null)
    );`)
    this.addSql(`create unique index da_one_pending_mfa_enrollment
      on da_mfa_enrollment_intent(session_id)
      where consumed_at is null and revoked_at is null;`)
  }
  async down(): Promise<void> {
    throw new Error("Retain MFA enrollment evidence; destructive rollback needs explicit retention review")
  }
}
