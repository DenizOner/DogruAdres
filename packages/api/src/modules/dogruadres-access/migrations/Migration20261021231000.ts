import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261021231000 extends Migration {
  async up():Promise<void>{
    this.addSql(`create table da_verified_actor_binding(id text primary key,person_id text not null references da_person(id),auth_identity_id text not null,actor_type text not null check(actor_type in ('member','customer')),actor_id text not null,verified_at timestamptz not null,proof_reference text not null check(length(proof_reference)>0),revoked_at timestamptz,unique(actor_type,actor_id));`)
    this.addSql(`create unique index da_one_verified_actor_type on da_verified_actor_binding(person_id,actor_type) where revoked_at is null;`)
    this.addSql(`create table da_actor_credential(token_hash text primary key,session_id text not null references da_browser_session(id),binding_id text not null references da_verified_actor_binding(id),ciphertext text not null,expires_at timestamptz not null,retired_at timestamptz,created_at timestamptz not null default now());`)
    this.addSql(`create unique index da_one_active_actor_credential on da_actor_credential(session_id,binding_id) where retired_at is null;`)
  }
  async down():Promise<void>{throw new Error('Retain verified bindings and credential revocation history')}
}
