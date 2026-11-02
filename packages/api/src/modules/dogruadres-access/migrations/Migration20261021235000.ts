import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * MFA persistence tables (#230).
 *
 * da_mfa_policy        — singleton platform-mode row, id='current'.
 * da_person_mfa_preference — one row per canonical Person.
 *
 * SOURCE-LEVEL ONLY: This migration has been authored and reviewed at source.
 * It has NOT been applied to the protected task database (m0ssi_a7f1).
 * Application requires explicit Technical Advisor authorization per the
 * approved delivery workflow.
 *
 * Migration ordering notes:
 *  - Depends on da_person (Migration20261017135550) and
 *    da_security_outbox (PR #227 migration chain).
 *  - Does NOT reference Medusa native MFA tables.
 *  - No rollback: preserves version history and audit evidence.
 */
export class Migration20261021235000 extends Migration {
  async up(): Promise<void> {
    // Singleton platform policy.
    // platform_mode check mirrors MFA_PLATFORM_MODES constant.
    this.addSql(`
      create table da_mfa_policy (
        id           text        primary key,
        platform_mode text       not null
                                 check(platform_mode in ('required','optional','disabled')),
        version      integer     not null default 0 check(version >= 0),
        created_at   timestamptz not null default now(),
        updated_at   timestamptz not null default now(),
        constraint da_mfa_policy_singleton check(id = 'current')
      );
    `)

    // Per-Person personal MFA preference.
    // user_enabled is a strict boolean; NOT NULL prevents NULL-bypass attacks.
    this.addSql(`
      create table da_person_mfa_preference (
        person_id    text        primary key references da_person(id),
        user_enabled boolean     not null default false,
        version      integer     not null default 0 check(version >= 0),
        created_at   timestamptz not null default now(),
        updated_at   timestamptz not null default now()
      );
    `)

    // Index for platform-level scans (e.g. reconciliation jobs).
    this.addSql(`
      create index da_person_mfa_pref_enabled
        on da_person_mfa_preference(user_enabled)
        where user_enabled = true;
    `)
  }

  async down(): Promise<void> {
    throw new Error(
      "Retain MFA policy and preference history; rollback requires security review and TA authorization"
    )
  }
}
