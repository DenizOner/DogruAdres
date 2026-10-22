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
import { randomBytes } from "node:crypto"
import { deriveInvitationToken } from "../security"
import { DOGRUADRES_ACCESS_MODULE } from "../index"
import AccessService from "../service"
import { Migration20261020230000 } from "../migrations/Migration20261020230000"
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
    let originalInvitationSecret: string | undefined
    beforeEach(()=>{
      originalInvitationSecret=process.env.DOGRUADRES_INVITATION_SECRET
      process.env.DOGRUADRES_INVITATION_SECRET=randomBytes(48).toString("hex")
    })
    afterEach(()=>{
      if(originalInvitationSecret===undefined)delete process.env.DOGRUADRES_INVITATION_SECRET
      else process.env.DOGRUADRES_INVITATION_SECRET=originalInvitationSecret
    })
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
    it("commits real ORM membership and both outbox pointers, then rolls back a security-outbox fault",async()=>{
      // Install the actual committed security-state migration on this fresh,
      // runner-generated module schema; no mock outbox or extra infrastructure.
      const migration=Reflect.construct(Migration20261020230000,[]) as Migration20261020230000
      const statements:string[]=[]
      migration.addSql=(sql:string)=>statements.push(sql)
      await migration.up()
      for(const statement of statements)await q(statement)

      const organization=await service.provisionOrganization(operation)
      const admin=await service.resolvePersonForActor(actor)
      expect(admin?.id).toBeTruthy()
      const [ordinary]=await service.createPeople([{}])
      const [membership]=await service.createMemberships([{
        organization_id:organization.organization.id,person_id:ordinary.id,
        role:"member",status:"active",protected_owner:false,
      }])
      const input={
        organization_id:organization.organization.id,membership_id:membership.id,
        actor_person_id:admin!.id,actor_type:"user",actor_id:actor.actor_id,
      }
      const changed=await service.changeMembership({...input,role:"admin"})
      expect(changed.role).toBe("admin")
      const audits=await q("select id from da_audit_event where action='organization.membership_changed' and target_id=?",[membership.id])
      expect(audits).toHaveLength(1)
      const canon=await q("select source_audit_event_id from da_audit_outbox where source_audit_event_id=?",[audits[0].id])
      const security=await q("select audit_event_id from da_security_outbox where audit_event_id=?",[audits[0].id])
      expect(canon).toHaveLength(1)
      expect(security).toHaveLength(1)
      const beforeRows=await Promise.all(["da_audit_event","da_audit_outbox","da_security_outbox"].map(
        table=>q("select count(*)::int as n from "+table).then((rows:any[])=>Number(rows[0].n))))
      await q("create function da_test_reject_security() returns trigger language plpgsql as $$ begin raise exception 'CI_INJECTED_SECURITY_OUTBOX_FAULT'; end; $$")
      await q("create trigger da_test_reject_security before insert on da_security_outbox for each row execute function da_test_reject_security()")
      await expect(service.changeMembership({...input,role:"member"}))
        .rejects.toThrow(/CI_INJECTED_SECURITY_OUTBOX_FAULT/)
      const afterRole=await q("select role from da_organization_membership where id=?",[membership.id])
      expect(afterRole[0].role).toBe("admin")
      const afterRows=await Promise.all(["da_audit_event","da_audit_outbox","da_security_outbox"].map(
        table=>q("select count(*)::int as n from "+table).then((rows:any[])=>Number(rows[0].n))))
      expect(afterRows).toEqual(beforeRows)
    })
    it("persists native invitation creation and revocation with distinct canonical audit/outbox entries",async()=>{
      const provisioned=await service.provisionOrganization(operation)
      const current=await service.resolvePersonForActor(actor)
      expect(current?.id).toBeTruthy()
      const context={
        organization_id:provisioned.organization.id,actor_person_id:current!.id,
        actor_type:"user",actor_id:actor.actor_id,
      }
      const invitation=await service.createOrganizationInvitation({
        ...context,email:"invitee@example.invalid",role:"member",
      })
      expect(invitation.status).toBe("pending")
      const revoked=await service.revokeOrganizationInvitation({
        ...context,invitation_id:invitation.id,
      })
      expect(revoked.status).toBe("revoked")
      const stored=await q("select status from da_organization_invitation where id=?",[invitation.id])
      expect(stored[0].status).toBe("revoked")
      const audits=await q("select id,action from da_audit_event where target_id=? and action in ('organization.invitation_created','organization.invitation_revoked') order by action",[invitation.id])
      expect(audits.map((x:any)=>x.action)).toEqual([
        "organization.invitation_created","organization.invitation_revoked"])
      const sourceIds=audits.map((x:any)=>x.id)
      const outbox=await q("select source_audit_event_id from da_audit_outbox where source_audit_event_id in (?,?)",[sourceIds[0],sourceIds[1]])
      expect(outbox.map((x:any)=>x.source_audit_event_id).sort()).toEqual(sourceIds.sort())
      await expect(service.revokeOrganizationInvitation({...context,invitation_id:invitation.id})).rejects.toThrow()
      const unchanged=await q("select count(*)::int as n from da_audit_event where target_id=? and action='organization.invitation_revoked'",[invitation.id])
      expect(Number(unchanged[0].n)).toBe(1)
    })
    it("accepts one invited membership only with caller-asserted email proof, denies mismatch and replay",async()=>{
      const provisioned=await service.provisionOrganization(operation)
      const current=await service.resolvePersonForActor(actor)
      expect(current?.id).toBeTruthy()
      const email="recipient@example.invalid"
      const created=await service.createOrganizationInvitation({
        organization_id:provisioned.organization.id,actor_person_id:current!.id,
        actor_type:"user",actor_id:actor.actor_id,email,role:"member",
      })
      // Derived only within isolated test; token and secret are never logged.
      const token=deriveInvitationToken(created.id)
      const invitedActor={actor_type:"user",actor_id:"synthetic_invitee_foundation_220"}
      const base={token,email,actor:invitedActor}
      await expect(service.acceptOrganizationInvitation({...base,email_verified:false})).rejects.toThrow()
      await expect(service.acceptOrganizationInvitation({...base,email:"other@example.invalid",email_verified:true})).rejects.toThrow()
      expect(await q("select id from da_organization_membership where organization_id=? and role='member'",[provisioned.organization.id])).toHaveLength(0)

      // This proves service-side constraints with a synthetic trusted flag;
      // actual ownership verification upstream remains blocked by #191.
      const accepted=await service.acceptOrganizationInvitation({...base,email_verified:true})
      expect(accepted.invitation.status).toBe("accepted")
      expect(accepted.membership.role).toBe("member")
      expect(accepted.membership.protected_owner).toBe(false)
      const audits=await q("select id from da_audit_event where action='organization.invitation_accepted' and target_id=?",[created.id])
      expect(audits).toHaveLength(1)
      expect(await q("select source_audit_event_id from da_audit_outbox where source_audit_event_id=?",[audits[0].id])).toHaveLength(1)
      await expect(service.acceptOrganizationInvitation({...base,email_verified:true})).rejects.toThrow()
      const replayAudit=await q("select count(*)::int as n from da_audit_event where action='organization.invitation_accepted' and target_id=?",[created.id])
      expect(Number(replayAudit[0].n)).toBe(1)
    })
  },
})
