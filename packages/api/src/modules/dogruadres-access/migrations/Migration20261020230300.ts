import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261020230300 extends Migration {
  async up():Promise<void>{this.addSql(`create table da_native_credential(token_hash text primary key,session_id text not null references da_browser_session(id),ciphertext text not null,created_at timestamptz not null default now());`)}
  async down():Promise<void>{throw new Error("Retain credential-binding ledger; destructive rollback requires security review")}
}
