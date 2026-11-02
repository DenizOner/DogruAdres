import {Migration} from '@medusajs/framework/mikro-orm/migrations'
export class Migration20261021233000 extends Migration{
  async up():Promise<void>{
    this.addSql(`create table da_actor_link_intent(id text primary key,session_id text not null references da_browser_session(id),person_id text not null references da_person(id),auth_identity_id text not null,actor_type text not null check(actor_type in ('member','customer')),actor_id text not null,challenge_id text,verified_at timestamptz,expires_at timestamptz not null,attempts integer not null default 0,consumed_at timestamptz,created_at timestamptz not null default now());`)
    // Preserve every tombstone. Fresh dual proof may create a new binding for
    // its SAME canonical owner; ActorMapping remains the unique owner authority.
    this.addSql(`create unique index da_active_verified_actor on da_verified_actor_binding(actor_type,actor_id) where revoked_at is null;`)
    this.addSql(`alter table da_verified_actor_binding drop constraint da_verified_actor_binding_actor_type_actor_id_key;`)
  }
  async down():Promise<void>{throw Error('Retain linking proof and revocation history')}
}
