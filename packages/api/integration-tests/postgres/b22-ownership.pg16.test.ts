/**
 * B22: verify actual legal-owner physical constraints on the already existing
 * task-only PostgreSQL16 GitHub Actions service. No production/fixture DB.
 * This is schema acceptance, NOT browser legal registration or commerce PASS.
 */
import assert from "node:assert/strict"
import { Migration20261029120000 } from "../../src/modules/dogruadres-access/migrations/Migration20261029120000"

const url = new URL(process.env.PG_MFA_TEST_URL ?? "postgres://bad/invalid")
if (process.env.CI !== "true" ||
    process.env.PG_MFA_TEST_SENTINEL !== "mfa-pg16-disposable-ci-v1" ||
    url.protocol !== "postgres:" || url.hostname !== "127.0.0.1" ||
    url.port !== "5432" || url.username !== "mfa_test" ||
    url.pathname !== "/mfa_ci_ephemeral")
  throw Error("REFUSED: B22 fixture requires existing task-only CI PostgreSQL16")
const SQL = (globalThis as any).Bun?.SQL
if (typeof SQL !== "function") throw Error("Bun PostgreSQL unavailable")
const db = new SQL(url.toString())

async function main() {
  try {
    const info = (await db.unsafe("select current_database() as n, current_setting('server_version_num') as v"))[0]
    assert.equal(info.n, "mfa_ci_ephemeral")
    assert.match(info.v, /^16\d{4}$/)
    // The CLI's earlier Medusa migration test uses another disposable child DB,
    // which is retired after its native checks. Test DDL here on this scoped CI DB.
    assert.equal((await db.unsafe("select to_regclass('da_organization_seller_ownership') as name"))[0].name,null)
    const migration = new Migration20261029120000(), statements: string[] = []
    ;(migration as any).addSql = (statement: string) => statements.push(statement)
    await migration.up()
    assert.equal(statements.length,3,"Unexpected B22 schema expansion")
    for (const statement of statements) await db.unsafe(statement)
    assert.equal((await db.unsafe("select to_regclass('da_organization_seller_ownership') as name"))[0].name,
      "da_organization_seller_ownership")

    // Synthetic identities, intentionally never corresponding to actual Mercur Sellers.
    await db.unsafe("insert into da_organization(id,name,status) values ('daorg_b22_alpha','B22 fixture A','active'),('daorg_b22_beta','B22 fixture B','active')")
    await db.unsafe(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,module,action,resource,occurred_at)
      values ('daaud_b22_owner_a','synthetic_person_b22','user','synthetic_actor_b22',
              'dogruadres-access','organization.store_ownership_verified','legal_ownership',clock_timestamp()),
             ('daaud_b22_owner_b','synthetic_person_b22','user','synthetic_actor_b22',
              'dogruadres-access','organization.store_ownership_verified','legal_ownership',clock_timestamp())`)
    await db.unsafe(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      values ('daown_b22_a','daorg_b22_alpha','sel_b22_one','daaud_b22_owner_a',clock_timestamp()),
             ('daown_b22_b','daorg_b22_alpha','sel_b22_two','daaud_b22_owner_a',clock_timestamp())`)
    const owned = await db.unsafe("select seller_id from da_organization_seller_ownership where organization_id='daorg_b22_alpha' and revoked_at is null order by seller_id")
    assert.deepEqual(owned.map((r:any)=>r.seller_id),["sel_b22_one","sel_b22_two"],"one Organization may own multiple separate stores")

    await assert.rejects(
      db.unsafe(`insert into da_organization_seller_ownership
        (id,organization_id,seller_id,verification_audit_event_id,verified_at)
        values ('daown_b22_conflict','daorg_b22_beta','sel_b22_one','daaud_b22_owner_b',clock_timestamp())`),
      /duplicate key|unique/i,
      "a competing legal Organization must not claim the same active Seller")
    await assert.rejects(
      db.unsafe(`insert into da_organization_seller_ownership
        (id,organization_id,seller_id,verification_audit_event_id,verified_at)
        values ('daown_b22_unproved','daorg_b22_beta','sel_b22_unproved','daaud_missing',clock_timestamp())`),
      /foreign key/i,
      "no ownership may exist without a canonical audit event")

    await db.unsafe("update da_organization_seller_ownership set revoked_at=clock_timestamp() where id='daown_b22_a'")
    await db.unsafe(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      values ('daown_b22_transfer_fixture','daorg_b22_beta','sel_b22_one','daaud_b22_owner_b',clock_timestamp())`)
    const current = await db.unsafe("select organization_id from da_organization_seller_ownership where seller_id='sel_b22_one' and revoked_at is null")
    assert.deepEqual(current.map((r:any)=>r.organization_id),["daorg_b22_beta"])
    console.log("PASS B22 isolated PG16: multi-store, unique live owner, audit FK, historical revocation")
    console.log("NOT TESTED: approved legal transfer procedure, native Seller existence, browser, checkout")
  } finally {
    await db.close()
  }
}
// Explicit process exit status without CommonJS-forbidden top-level await.
void main().catch(error => { console.error(error); process.exitCode = 1 })
