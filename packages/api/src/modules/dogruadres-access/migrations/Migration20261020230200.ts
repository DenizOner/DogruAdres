import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261020230200 extends Migration {
  async up():Promise<void>{this.addSql(`create table da_login_attempt(bucket text not null,minute bigint not null,attempts integer not null,primary key(bucket,minute));`)}
  async down():Promise<void>{throw new Error("Retain security-state tables; explicit retention review required")}
}
