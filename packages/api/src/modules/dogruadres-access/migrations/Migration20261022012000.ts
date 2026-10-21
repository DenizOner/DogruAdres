import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Privileged deployment gate. This source migration defaults to NOT ARMED.
 * Activation must be a later separately authorized, audited transaction;
 * no API or job here flips the irreversible marker to true.
 */
export class Migration20261022012000 extends Migration {
  async up():Promise<void>{
    this.addSql(`alter table da_session_policy
      add column mfa_activated boolean not null default false;`)
    this.addSql(`create function da_mfa_activation_guard() returns trigger
      language plpgsql as $$
      begin
        if tg_op='DELETE' then
          if old.mfa_activated then
            raise exception 'Activated MFA rollout cannot be removed';
          end if;
          return old;
        end if;
        if old.mfa_activated and not new.mfa_activated then
          raise exception 'Activated MFA rollout cannot be disabled';
        end if;
        return new;
      end $$;`)
    this.addSql(`create trigger da_mfa_activation_guard_rows
      before update or delete on da_session_policy for each row
      execute function da_mfa_activation_guard();`)
    this.addSql(`create function da_mfa_activation_truncate_guard() returns trigger
      language plpgsql as $$
      begin
        raise exception 'MFA activation retention: session policy truncate is forbidden';
      end $$;`)
    this.addSql(`create trigger da_mfa_activation_guard_truncate
      before truncate on da_session_policy for each statement
      execute function da_mfa_activation_truncate_guard();`)
  }
  async down():Promise<void>{
    throw new Error("MFA activation latch is irreversible without explicit security review")
  }
}
