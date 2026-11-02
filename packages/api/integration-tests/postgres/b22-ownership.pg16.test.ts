/**
 * B22 physical platform-association constraints against the SAME native Medusa CLI
 * freshly migrated task-owned database. Caller verifies its CI identity and
 * handles all cleanup. No production or protected DB is ever touched.
 */
import assert from "node:assert/strict"
import { platformApprovedSellerIds, verifiedStoreProductEditGrant } from "../../src/modules/dogruadres-access/legal-store-ownership"

type Sql = { unsafe(statement: string, params?: readonly unknown[]): Promise<any[]> }

export async function verifyB22OwnedSellerConstraints(db: Sql, databaseName: string) {
  assert.match(databaseName, /^mfa_cli_ci_[0-9a-f]{16}$/, "B22 refuses unexpected database name")
  const identity = (await db.unsafe("select current_database() as n, current_setting('server_version_num') as v"))[0]
  assert.equal(identity.n, databaseName)
  assert.match(identity.v, /^16\d{4}$/)
  assert.equal((await db.unsafe("select to_regclass('da_organization_seller_ownership') as name"))[0].name,
    "da_organization_seller_ownership", "Native Medusa module migration must be present")
  // The canonical Foundation audit FK requires a real Person row; do not
  // bypass this integrity rule or point at another test principal.
  await db.unsafe("insert into da_person(id) values ('daprs_b22_fixture')")
  await db.unsafe("insert into da_organization(id,name,status) values ('daorg_b22_alpha','B22 fixture A','active'),('daorg_b22_beta','B22 fixture B','active')")
  // Every Store assignment requires its OWN platform-approved event, scoped
  // to the exact Store and Organization, plus the canonical atomic source outbox.
  await db.unsafe(`insert into da_audit_event
    (id,actor_person_id,actor_type,actor_id,organization_id,action,module,resource,target_id,occurred_at)
    values
      ('daaud_b22_a1','daprs_b22_fixture','user','synthetic_actor_b22','daorg_b22_alpha',
       'organization.store_association_approved','dogruadres-access','store-association','sel_b22_one',clock_timestamp()),
      ('daaud_b22_a2','daprs_b22_fixture','user','synthetic_actor_b22','daorg_b22_alpha',
       'organization.store_association_approved','dogruadres-access','store-association','sel_b22_two',clock_timestamp()),
      ('daaud_b22_b1','daprs_b22_fixture','user','synthetic_actor_b22','daorg_b22_beta',
       'organization.store_association_approved','dogruadres-access','store-association','sel_b22_one',clock_timestamp()),
      ('daaud_b22_unpublished','daprs_b22_fixture','user','synthetic_actor_b22','daorg_b22_alpha',
       'organization.store_association_approved','dogruadres-access','store-association','sel_b22_unpublished',clock_timestamp()),
      ('daaud_b22_wrong_action','daprs_b22_fixture','user','synthetic_actor_b22','daorg_b22_alpha',
       'organization.store_association_requested','dogruadres-access','store-association','sel_b22_pending',clock_timestamp())`)
  await db.unsafe(`insert into da_audit_outbox
    (id,source_audit_event_id,source_module,envelope)
    values
      ('daaob_b22_a1','daaud_b22_a1','dogruadres-access','{}'::jsonb),
      ('daaob_b22_a2','daaud_b22_a2','dogruadres-access','{}'::jsonb),
      ('daaob_b22_b1','daaud_b22_b1','dogruadres-access','{}'::jsonb),
      ('daaob_b22_wrong_action','daaud_b22_wrong_action','dogruadres-access','{}'::jsonb)`)
  await db.unsafe(`insert into da_organization_seller_ownership
    (id,organization_id,seller_id,verification_audit_event_id,verified_at)
    values ('daown_b22_a','daorg_b22_alpha','sel_b22_one','daaud_b22_a1',clock_timestamp()),
           ('daown_b22_b','daorg_b22_alpha','sel_b22_two','daaud_b22_a2',clock_timestamp())`)
  const owned = await db.unsafe("select seller_id from da_organization_seller_ownership where organization_id='daorg_b22_alpha' and revoked_at is null order by seller_id")
  assert.deepEqual(owned.map(r=>r.seller_id),["sel_b22_one","sel_b22_two"])
  const adapter={execute:async (sql:string,params:unknown[]=[])=>{
    let n=0;const query=sql.replace(/\?/g,()=>"$"+(++n))
    assert.equal(n,params.length)
    return db.unsafe(query,params)
  }}
  assert.deepEqual(await platformApprovedSellerIds(adapter,"daorg_b22_alpha"),["sel_b22_one","sel_b22_two"])
  // The FK alone cannot confer approval: mismatched Store or unpublished,
  // pending-request events must not yield any Store candidate.
  await db.unsafe(`insert into da_organization_seller_ownership
    (id,organization_id,seller_id,verification_audit_event_id,verified_at)
    values
      ('daown_b22_wrong_target','daorg_b22_alpha','sel_b22_foreign','daaud_b22_a1',clock_timestamp()),
      ('daown_b22_unpublished','daorg_b22_alpha','sel_b22_unpublished','daaud_b22_unpublished',clock_timestamp()),
      ('daown_b22_pending','daorg_b22_alpha','sel_b22_pending','daaud_b22_wrong_action',clock_timestamp())`)
  assert.deepEqual(await platformApprovedSellerIds(adapter,"daorg_b22_alpha"),["sel_b22_one","sel_b22_two"],
    "Unmatched, uncommitted or unapproved audit events must never grant Store visibility")
  await assert.rejects(
    db.unsafe(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      values ('daown_b22_conflict','daorg_b22_beta','sel_b22_one','daaud_b22_b1',clock_timestamp())`),
    /duplicate key|unique/i, "Concurrent Store assignments to different Organizations must be rejected")
  await assert.rejects(
    db.unsafe(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      values ('daown_b22_unproved','daorg_b22_beta','sel_b22_unproved','daaud_missing',clock_timestamp())`),
    /foreign key/i, "Missing canonical platform approval audit must be rejected")

  // A synthetic SQL history fixture tests the partial-unique index;
  // it does NOT approve or exercise real Store reassignment review workflows.
  await db.unsafe("update da_organization_seller_ownership set revoked_at=clock_timestamp() where id='daown_b22_a'")
  await db.unsafe(`insert into da_organization_seller_ownership
    (id,organization_id,seller_id,verification_audit_event_id,verified_at)
    values ('daown_b22_transfer_fixture','daorg_b22_beta','sel_b22_one','daaud_b22_b1',clock_timestamp())`)
  const current=await db.unsafe("select organization_id from da_organization_seller_ownership where seller_id='sel_b22_one' and revoked_at is null")
  assert.deepEqual(current.map(r=>r.organization_id),["daorg_b22_beta"])
  assert.deepEqual(await platformApprovedSellerIds(adapter,"daorg_b22_beta"),["sel_b22_one"],
    "Only the newly approved active Organization may see this Store")
  assert.deepEqual(await platformApprovedSellerIds(adapter,"daorg_b22_alpha"),["sel_b22_two"])

  // Explicit task-only Person/Organization/Store action grant is separate
  // from native SellerMember, protected Owner and the Store association.
  const canEdit=()=>verifiedStoreProductEditGrant(adapter,"daprs_b22_fixture","daorg_b22_beta","sel_b22_one")
  assert.equal(await canEdit(),false,"Owner/Store association alone cannot edit products")
  await db.unsafe(`insert into da_store_product_permission
    (id,person_id,organization_id,seller_id,permission,issued_by_person_id,source_audit_event_id)
    values ('daspg_b22_scope','daprs_b22_fixture','daorg_b22_beta','sel_b22_one',
      'products.edit','daprs_b22_fixture','daaud_b22_b1')`)
  assert.equal(await canEdit(),false,"An unrelated Store event cannot mint a product grant")
  await db.unsafe(`insert into da_audit_event
    (id,actor_person_id,actor_type,actor_id,organization_id,action,module,resource,target_id,new_values,occurred_at)
    values ('daaud_b22_product_grant','daprs_b22_fixture','user','synthetic_actor_b22',
      'daorg_b22_beta','organization.store_product_permission_granted',
      'dogruadres-access','store-product-permission','sel_b22_one',
      '{"grant_id":"daspg_b22_scope","person_id":"daprs_b22_fixture","permission":"products.edit"}'::jsonb,
      clock_timestamp())`)
  await db.unsafe(`update da_store_product_permission
    set source_audit_event_id='daaud_b22_product_grant' where id='daspg_b22_scope'`)
  assert.equal(await canEdit(),false,"Grant event without matching durable outbox cannot authorize")
  await db.unsafe(`insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope)
    values ('daaob_b22_product_grant','daaud_b22_product_grant','dogruadres-access','{}'::jsonb)`)
  assert.equal(await canEdit(),true,"Only an explicit grant with audit and outbox authorizes")
  assert.equal(await verifiedStoreProductEditGrant(adapter,"daprs_b22_fixture","daorg_b22_alpha","sel_b22_one"),false)
  assert.equal(await verifiedStoreProductEditGrant(adapter,"daprs_b22_fixture","daorg_b22_beta","sel_b22_two"),false)
  assert.equal(await verifiedStoreProductEditGrant(adapter,"daprs_foreign","daorg_b22_beta","sel_b22_one"),false)
  await db.unsafe("update da_store_product_permission set revoked_at=clock_timestamp() where id='daspg_b22_scope'")
  assert.equal(await canEdit(),false,"Revocation must take effect on the next read")
  process.stdout.write("PASS B22 Foundation PG16: explicit Store products.edit grant, audit+outbox, foreign scope and revoke; no visitor writer\\n")
  process.stdout.write("PASS B22 real Medusa CLI PG16: multiple Seller stores per Organization, unique current assignment, exact approval event/outbox, audit FK, retained history\n")
  process.stdout.write("NOT TESTED: real platform review/reassignment, browser Store scope, Buyer Organization checkout\n")
}
