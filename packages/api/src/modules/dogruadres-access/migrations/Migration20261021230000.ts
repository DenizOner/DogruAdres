import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261021230000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`alter table da_native_credential add column expires_at timestamptz, add column retired_at timestamptz;`)
    // Existing credentials have no attested expiry metadata; retain history,
    // fail closed, and renew only from a currently eligible opaque session.
    this.addSql(`update da_native_credential set expires_at=created_at+interval '15 minutes',retired_at=clock_timestamp();`)
    this.addSql(`alter table da_native_credential alter column expires_at set not null;`)
    this.addSql(`create unique index da_one_current_native_credential on da_native_credential(session_id) where retired_at is null;`)
  }
  async down(): Promise<void> { throw new Error("Retain credential revocation history; rollback requires security review") }
}
