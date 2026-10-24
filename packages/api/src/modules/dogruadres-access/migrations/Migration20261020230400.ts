import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261020230400 extends Migration {
  async up():Promise<void>{this.addSql(`create table da_machine_grant(id text primary key,api_key_id text not null,method text not null,resource text not null,revoked_at timestamptz); create unique index da_active_machine_scope on da_machine_grant(api_key_id,method,resource) where revoked_at is null;`)}
  async down():Promise<void>{throw new Error("Retain machine authorization state; explicit retention review required")}
}
