import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261020230100 extends Migration {
  async up():Promise<void>{this.addSql(`create table da_login_challenge(id text primary key,auth_identity_id text not null,challenge_id text not null unique,expires_at timestamptz not null,consumed_at timestamptz);`)}
  async down():Promise<void>{throw new Error("Retain security-state tables; destructive rollback requires explicit retention review")}
}
