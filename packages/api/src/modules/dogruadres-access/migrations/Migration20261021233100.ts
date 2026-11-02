import {Migration} from '@medusajs/framework/mikro-orm/migrations'
export class Migration20261021233100 extends Migration{
  async up():Promise<void>{this.addSql(`alter table da_actor_link_intent add column proof_fingerprint text;`)}
  async down():Promise<void>{throw Error('Retain provider proof version evidence')}
}
