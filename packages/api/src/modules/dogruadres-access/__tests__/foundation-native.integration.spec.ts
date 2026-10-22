/**
 * #220 — REAL Medusa 2.21.2 module + generated ORM on CI-only PG16.
 * Unlike the SQL-backed service orchestration tests, this uses the actual
 * Medusa module and generated CRUD/decorated transaction implementation.
 * Module test runner creates an explicitly named, disposable database on the
 * CI-only PostgreSQL service. No task or user database is reachable.
 *
 * The module runner tests generated DML schema; versioned migrations and
 * legacy upgrade are verified in separate real migrator/PG16 acceptance tests.
 */
import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { DOGRUADRES_ACCESS_MODULE } from "../index"
import AccessService from "../service"
import {
  ActorMapping, AuditEvent, AuditOutbox, Invitation,
  Membership, Organization, Person,
} from "../models"

if (process.env.CI !== "true" ||
    process.env.PG_MFA_TEST_SENTINEL !== "mfa-pg16-disposable-ci-v1" ||
    process.env.DB_HOST !== "127.0.0.1" ||
    process.env.DB_PORT !== "5432" ||
    process.env.DB_USERNAME !== "mfa_test" ||
    process.env.DB_PASSWORD !== "ci-disposable-only-not-a-real-secret") {
  throw Error("REFUSED: Foundation native module test requires the disposable PG16 CI service")
}
const testDbName="mfa_foundation_native_ci_only"
const actor = {actor_type:"user",actor_id:"synthetic_owner_foundation_220"}
const otherOwner = {actor_type:"user",actor_id:"synthetic_second_owner_foundation_220"}
const operation = {
  name:"Disposable Foundation organization",
  provisioned_by:actor,
  initial_owners:[actor,otherOwner],
}

moduleIntegrationTestRunner<AccessService>({
  moduleName:DOGRUADRES_ACCESS_MODULE,
  resolve:"./src/modules/dogruadres-access",
  moduleModels:[Person,ActorMapping,Organization,Membership,Invitation,AuditEvent,AuditOutbox],
  dbName:testDbName,
  testSuite:({service,MikroOrmWrapper,dbConfig})=>{
    const q=(sql:string,params:unknown[]=[])=>MikroOrmWrapper.forkManager().execute(sql,params)
    it("commits real ORM Organization, two protected Owners, 3 audit and 3 unique canonical outboxes",async()=>{
      expect(dbConfig.clientUrl).toContain("/"+testDbName)
      const result=await service.provisionOrganization(operation)
      expect(result.memberships).toHaveLength(2)
      const organizations=await q("select id,name from da_organization where id=?", [result.organization.id])
      const memberships=await q(
        "select id,role,status,protected_owner from da_organization_membership where organization_id=? order by id",
        [result.organization.id])
      const audit=await q(
        "select id,action,target_id from da_audit_event where organization_id=? order by action,id",
        [result.organization.id])
      const outbox=await q(
        "select source_audit_event_id,envelope from da_audit_outbox order by source_audit_event_id")
      expect(organizations).toHaveLength(1)
      expect(memberships).toHaveLength(2)
      expect(memberships.every((r:any)=>r.role==="owner"&&r.status==="active"&&r.protected_owner===true)).toBe(true)
      expect(audit.map((r:any)=>r.action).sort()).toEqual([
        "organization.owner_assigned","organization.owner_assigned","organization.provisioned"])
      expect(outbox).toHaveLength(3)
      const ids=audit.map((r:any)=>r.id)
      expect(outbox.map((r:any)=>r.source_audit_event_id).sort()).toEqual(ids.sort())
      for(const entry of outbox){
        const envelope=typeof entry.envelope==="string"?JSON.parse(entry.envelope):entry.envelope
        expect(envelope.source_audit_event_id).toBe(entry.source_audit_event_id)
        expect(JSON.stringify(envelope)).not.toContain("previous_values")
        expect(JSON.stringify(envelope)).not.toContain("new_values")
      }
    })
    it("rolls back ORM Person, Organization and audit if canonical outbox INSERT fails",async()=>{
      const before=await Promise.all(["da_person","da_actor_mapping","da_organization",
        "da_organization_membership","da_audit_event","da_audit_outbox"].map(
          table=>q("select count(*)::int as n from "+table).then((rows:any[])=>Number(rows[0].n))))
      await q("create function da_test_reject_outbox() returns trigger language plpgsql as $$ begin raise exception 'CI_INJECTED_CANONICAL_OUTBOX_FAULT'; end; $$")
      await q("create trigger da_test_reject_outbox before insert on da_audit_outbox for each row execute function da_test_reject_outbox()")
      await expect(service.provisionOrganization(operation)).rejects.toThrow(/CI_INJECTED_CANONICAL_OUTBOX_FAULT/)
      const after=await Promise.all(["da_person","da_actor_mapping","da_organization",
        "da_organization_membership","da_audit_event","da_audit_outbox"].map(
          table=>q("select count(*)::int as n from "+table).then((rows:any[])=>Number(rows[0].n))))
      expect(after).toEqual(before)
    })
  },
})
