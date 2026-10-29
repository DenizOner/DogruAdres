/**
 * B22 physical ownership constraints against the SAME native Medusa CLI
 * freshly migrated task-owned database. Caller verifies its CI identity and
 * handles all cleanup. No production or protected DB is ever touched.
 */
import assert from "node:assert/strict"

type Sql = { unsafe(statement: string, params?: readonly unknown[]): Promise<any[]> }

export async function verifyB22OwnedSellerConstraints(db: Sql, databaseName: string) {
  assert.match(databaseName, /^mfa_cli_ci_[0-9a-f]{16}$/, "B22 refuses unexpected database name")
  const identity = (await db.unsafe("select current_database() as n, current_setting('server_version_num') as v"))[0]
  assert.equal(identity.n, databaseName)
  assert.match(identity.v, /^16\d{4}$/)
  assert.equal((await db.unsafe("select to_regclass('da_organization_seller_ownership') as name"))[0].name,
    "da_organization_seller_ownership", "Native Medusa module migration must be present")
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
  assert.deepEqual(owned.map(r=>r.seller_id),["sel_b22_one","sel_b22_two"])
  await assert.rejects(
    db.unsafe(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      values ('daown_b22_conflict','daorg_b22_beta','sel_b22_one','daaud_b22_owner_b',clock_timestamp())`),
    /duplicate key|unique/i, "Concurrent legal owners must be rejected")
  await assert.rejects(
    db.unsafe(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      values ('daown_b22_unproved','daorg_b22_beta','sel_b22_unproved','daaud_missing',clock_timestamp())`),
    /foreign key/i, "Missing canonical ownership evidence must be rejected")

  // A synthetic SQL history fixture tests the partial-unique index;
  // it does NOT approve or exercise real legal-ownership transfer workflows.
  await db.unsafe("update da_organization_seller_ownership set revoked_at=clock_timestamp() where id='daown_b22_a'")
  await db.unsafe(`insert into da_organization_seller_ownership
    (id,organization_id,seller_id,verification_audit_event_id,verified_at)
    values ('daown_b22_transfer_fixture','daorg_b22_beta','sel_b22_one','daaud_b22_owner_b',clock_timestamp())`)
  const current=await db.unsafe("select organization_id from da_organization_seller_ownership where seller_id='sel_b22_one' and revoked_at is null")
  assert.deepEqual(current.map(r=>r.organization_id),["daorg_b22_beta"])
  process.stdout.write("PASS B22 real Medusa CLI PG16: multiple Seller stores per legal Org, unique current owner, evidence FK, retained history\n")
  process.stdout.write("NOT TESTED: real ownership verification/transfer, browser Store scope, Buyer Organization checkout\n")
}
