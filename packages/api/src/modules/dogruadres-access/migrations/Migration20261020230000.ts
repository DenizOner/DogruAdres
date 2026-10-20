import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Internal security tables are intentionally not Query-discoverable DML entities. */
export class Migration20261020230000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table da_login_binding (
      auth_identity_id text primary key, person_id text not null references da_person(id),
      actor_type text not null check(actor_type in ('user','member','customer')),actor_id text not null,
      verified_at timestamptz not null,revoked_at timestamptz,
      unique(actor_type,actor_id));`)
    this.addSql(`create table da_person_security(person_id text primary key references da_person(id),epoch bigint not null default 0 check(epoch>=0));`)
    this.addSql(`create table da_browser_session (
      id text primary key,person_id text not null references da_person(id),auth_identity_id text not null references da_login_binding(auth_identity_id),
      actor_type text not null,actor_id text not null,epoch bigint not null,csrf_hash text not null,
      status text not null check(status in ('active','revoked','expired')),
      created_at timestamptz not null,last_activity_at timestamptz not null,last_strong_auth_at timestamptz);`)
    this.addSql(`create table da_platform_staff_grant (
      id text primary key,person_id text not null references da_person(id),task text not null,resource text not null,
      granted_by_person_id text not null references da_person(id),reason text not null,
      created_at timestamptz not null default now(),revoked_at timestamptz,expires_at timestamptz);`)
    this.addSql(`create unique index da_active_staff_scope on da_platform_staff_grant(person_id,task,resource) where revoked_at is null;`)
    this.addSql(`create table da_session_policy(id text primary key check(id='current'),version bigint not null,
      idle_timeout_seconds integer not null,absolute_lifetime_seconds integer not null,recent_auth_seconds integer not null,
      check(idle_timeout_seconds between 300 and 3600 and idle_timeout_seconds%60=0),
      check(absolute_lifetime_seconds between 3600 and 43200 and absolute_lifetime_seconds%60=0),
      check(recent_auth_seconds between 60 and 600 and recent_auth_seconds%60=0),
      check(recent_auth_seconds<=idle_timeout_seconds and idle_timeout_seconds<=absolute_lifetime_seconds));`)
    this.addSql(`insert into da_session_policy values ('current',1,1800,28800,300);`)
    this.addSql(`create table da_security_outbox(id text primary key,audit_event_id text not null unique references da_audit_event(id),created_at timestamptz not null);`)
  }
  async down(): Promise<void> {
    throw new Error("Security-state rollback is destructive. Disable ingress and retain tables; explicit data-retention review required.")
  }
}
