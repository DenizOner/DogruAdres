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
import { Migration20261021231000 } from "../migrations/Migration20261021231000"
import { Migration20261021233000 } from "../migrations/Migration20261021233000"
import { digest } from "../identity-session"
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
      await ensureSecurityTables()

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
    it("serializes two concurrent invitation revocations with exactly one audit/outbox",async()=>{
      const provisioned=await service.provisionOrganization(operation)
      const person=await service.resolvePersonForActor(actor)
      expect(person?.id).toBeTruthy()
      const scope={
        organization_id:provisioned.organization.id,actor_person_id:person!.id,
        actor_type:"user",actor_id:actor.actor_id,
      }
      const invite=await service.createOrganizationInvitation({
        ...scope,email:"race-revoke@example.invalid",role:"member",
      })
      const request={...scope,invitation_id:invite.id}
      const outcomes=await Promise.allSettled([
        service.revokeOrganizationInvitation(request),
        service.revokeOrganizationInvitation(request),
      ])
      expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1)
      expect(outcomes.filter(r=>r.status==="rejected")).toHaveLength(1)
      const after=await q("select status from da_organization_invitation where id=?",[invite.id])
      expect(after[0].status).toBe("revoked")
      const audits=await q("select id from da_audit_event where target_id=? and action='organization.invitation_revoked'",[invite.id])
      expect(audits).toHaveLength(1)
      expect(await q("select source_audit_event_id from da_audit_outbox where source_audit_event_id=?",[audits[0].id])).toHaveLength(1)
    })
    it("serializes duplicate concurrent invitation acceptance into one membership and audit",async()=>{
      const provisioned=await service.provisionOrganization(operation)
      const person=await service.resolvePersonForActor(actor)
      expect(person?.id).toBeTruthy()
      const email="race-accept@example.invalid"
      const invite=await service.createOrganizationInvitation({
        organization_id:provisioned.organization.id,actor_person_id:person!.id,
        actor_type:"user",actor_id:actor.actor_id,email,role:"member",
      })
      const acceptedActor={actor_type:"user",actor_id:"synthetic_race_invitee_foundation_220"}
      const request={token:deriveInvitationToken(invite.id),email,email_verified:true,actor:acceptedActor}
      // Caller-asserted proof only. #191 still blocks actual email ownership acceptance.
      const outcomes=await Promise.allSettled([
        service.acceptOrganizationInvitation(request),
        service.acceptOrganizationInvitation(request),
      ])
      expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1)
      expect(outcomes.filter(r=>r.status==="rejected")).toHaveLength(1)
      const memberships=await q("select id,role from da_organization_membership where organization_id=? and role='member'",[provisioned.organization.id])
      expect(memberships).toHaveLength(1)
      const status=await q("select status from da_organization_invitation where id=?",[invite.id])
      expect(status[0].status).toBe("accepted")
      const audits=await q("select id from da_audit_event where target_id=? and action='organization.invitation_accepted'",[invite.id])
      expect(audits).toHaveLength(1)
      expect(await q("select source_audit_event_id from da_audit_outbox where source_audit_event_id=?",[audits[0].id])).toHaveLength(1)
    })

    let securityTablesMigrated = false
    async function ensureSecurityTables() {
      if (securityTablesMigrated) return
      const tables = await q("select to_regclass('da_login_binding') as b")
      if (tables[0]?.b) {
        securityTablesMigrated = true
        return
      }
      for (const MigrationCtor of [Migration20261020230000, Migration20261021231000, Migration20261021233000]) {
        const migration = Reflect.construct(MigrationCtor, []) as any
        const statements: string[] = []
        migration.addSql = (sql: string) => statements.push(sql)
        await migration.up()
        for (const statement of statements) await q(statement)
      }
      securityTablesMigrated = true
    }

    async function setupStaffSession() {
      await ensureSecurityTables()
      const staffToken = "staff_token_" + randomBytes(16).toString("hex").padEnd(43, "x").slice(0, 43)
      const staffHash = digest(staffToken)
      const staffPersonId = "daprs_staff_" + randomBytes(6).toString("hex")
      const staffUserId = "usr_staff_" + randomBytes(6).toString("hex")
      const staffAuthId = "auth_staff_" + randomBytes(6).toString("hex")
      const staffGrantId = "grant_staff_" + randomBytes(6).toString("hex")

      await q("insert into da_person(id, disabled_at, deleted_at) values (?, null, null) on conflict (id) do nothing", [staffPersonId])
      await q("insert into da_person_security(person_id, epoch) values (?, 0) on conflict (person_id) do nothing", [staffPersonId])
      await q("insert into da_actor_mapping(id, actor_type, actor_id, person_id, created_by_actor_type, created_by_actor_id) values (?, 'user', ?, ?, 'user', ?) on conflict (actor_type, actor_id) do nothing",
        ["map_" + staffUserId, staffUserId, staffPersonId, staffUserId])
      await q("insert into da_login_binding(auth_identity_id, person_id, actor_type, actor_id, verified_at, revoked_at) values (?, ?, 'user', ?, now(), null) on conflict (actor_type, actor_id) do nothing",
        [staffAuthId, staffPersonId, staffUserId])
      await q(`insert into da_browser_session(id, person_id, auth_identity_id, actor_type, actor_id, epoch, csrf_hash, status, created_at, last_activity_at, last_strong_auth_at)
               values (?, ?, ?, 'user', ?, 0, 'test_csrf', 'active', now(), now(), now())`,
        [staffHash, staffPersonId, staffAuthId, staffUserId])
      await q("insert into da_platform_staff_grant(id, person_id, task, resource, granted_by_person_id, reason, created_at, revoked_at, expires_at) values (?, ?, 'organization.provision', 'platform', ?, 'test', now(), null, null)",
        [staffGrantId, staffPersonId, staffPersonId])

      return { staffToken, staffPersonId, staffUserId }
    }

    async function createVerifiedActor(actorType: "user" | "member" | "customer", actorId: string, personId: string) {
      await ensureSecurityTables()
      const authId = "auth_" + actorId
      await q("insert into da_person(id, disabled_at, deleted_at) values (?, null, null) on conflict (id) do nothing", [personId])
      await q("insert into da_person_security(person_id, epoch) values (?, 0) on conflict (person_id) do nothing", [personId])
      await q("insert into da_actor_mapping(id, actor_type, actor_id, person_id, created_by_actor_type, created_by_actor_id) values (?, ?, ?, ?, 'system', 'root') on conflict (actor_type, actor_id) do nothing",
        ["map_" + actorId, actorType, actorId, personId])
      await q("insert into da_login_binding(auth_identity_id, person_id, actor_type, actor_id, verified_at, revoked_at) values (?, ?, ?, ?, now(), null) on conflict (actor_type, actor_id) do nothing",
        [authId, personId, actorType, actorId])
    }

    it("B03: accepts two active verification proofs belonging to the same Person through real service transaction", async () => {
      const { staffToken } = await setupStaffSession()
      const personDual = "daprs_dual_" + randomBytes(6).toString("hex")
      const personOther = "daprs_other_" + randomBytes(6).toString("hex")
      const dualMember = "mem_dual_" + randomBytes(6).toString("hex")
      const otherUser = "usr_other_" + randomBytes(6).toString("hex")

      await createVerifiedActor("member", dualMember, personDual)
      await q(`insert into da_verified_actor_binding(id, person_id, auth_identity_id, actor_type, actor_id, verified_at, proof_reference, revoked_at)
               values (?, ?, ?, 'member', ?, now(), 'proof-secondary', null)`,
        ["bind_sec_" + dualMember, personDual, "sec_auth_" + dualMember, dualMember])

      await createVerifiedActor("user", otherUser, personOther)

      const input = {
        name: "Dual Proof Same Person Org",
        initial_owners: [
          { actor_type: "member" as const, actor_id: dualMember },
          { actor_type: "user" as const, actor_id: otherUser },
        ],
      }

      const result = await service.provisionPersonalOrganization(staffToken, input)
      expect(result.organization.id).toBeTruthy()
      expect(result.memberships).toHaveLength(2)

      const orgRows = await q("select id, status from da_organization where id=?", [result.organization.id])
      expect(orgRows).toHaveLength(1)
      expect(orgRows[0].status).toBe("active")

      const memberships = await q("select person_id, role, status, protected_owner from da_organization_membership where organization_id=?", [result.organization.id])
      expect(memberships).toHaveLength(2)
      expect(memberships.every((m: any) => m.role === "owner" && m.status === "active" && m.protected_owner === true)).toBe(true)
      expect(new Set(memberships.map((m: any) => m.person_id))).toEqual(new Set([personDual, personOther]))
    })

    it("B03: denies conflicting active proof ownership with zero partial business writes", async () => {
      const { staffToken } = await setupStaffSession()
      const personConflictA = "daprs_conf_a_" + randomBytes(6).toString("hex")
      const personConflictB = "daprs_conf_b_" + randomBytes(6).toString("hex")
      const personOther = "daprs_other_" + randomBytes(6).toString("hex")
      const conflictMember = "mem_conf_" + randomBytes(6).toString("hex")
      const otherUser = "usr_other_" + randomBytes(6).toString("hex")

      await createVerifiedActor("member", conflictMember, personConflictA)
      await q(`insert into da_verified_actor_binding(id, person_id, auth_identity_id, actor_type, actor_id, verified_at, proof_reference, revoked_at)
               values (?, ?, ?, 'member', ?, now(), 'proof-conflict', null)`,
        ["bind_conf_" + conflictMember, personConflictB, "sec_auth_" + conflictMember, conflictMember])

      await createVerifiedActor("user", otherUser, personOther)

      const tables = ["da_organization", "da_organization_membership", "da_audit_event", "da_audit_outbox", "da_security_outbox"]
      const beforeCounts = await Promise.all(tables.map(t => q("select count(*)::int as n from " + t).then(r => Number(r[0].n))))

      const input = {
        name: "Conflicting Proof Org",
        initial_owners: [
          { actor_type: "member" as const, actor_id: conflictMember },
          { actor_type: "user" as const, actor_id: otherUser },
        ],
      }

      await expect(service.provisionPersonalOrganization(staffToken, input)).rejects.toThrow(/Invalid initial Owner/)

      const afterCounts = await Promise.all(tables.map(t => q("select count(*)::int as n from " + t).then(r => Number(r[0].n))))
      expect(afterCounts).toEqual(beforeCounts)
    })

    it("B03: accepts two distinct verified initial Owners through real service transaction with audit and security outbox", async () => {
      const { staffToken } = await setupStaffSession()
      const person1 = "daprs_v1_" + randomBytes(6).toString("hex")
      const person2 = "daprs_v2_" + randomBytes(6).toString("hex")
      const user1 = "usr_v1_" + randomBytes(6).toString("hex")
      const user2 = "usr_v2_" + randomBytes(6).toString("hex")

      await createVerifiedActor("user", user1, person1)
      await createVerifiedActor("user", user2, person2)

      const input = {
        name: "Two Distinct Verified Owners Org",
        initial_owners: [
          { actor_type: "user" as const, actor_id: user1 },
          { actor_type: "user" as const, actor_id: user2 },
        ],
      }

      const result = await service.provisionPersonalOrganization(staffToken, input)
      expect(result.organization.id).toBeTruthy()
      expect(result.memberships).toHaveLength(2)

      const orgRows = await q("select id, status from da_organization where id=?", [result.organization.id])
      expect(orgRows).toHaveLength(1)

      const audits = await q("select id, action from da_audit_event where organization_id=? order by action, id", [result.organization.id])
      expect(audits).toHaveLength(3)
      expect(audits.map((a: any) => a.action).sort()).toEqual([
        "organization.owner_assigned", "organization.owner_assigned", "organization.provisioned"
      ])

      const outbox = await q("select source_audit_event_id from da_audit_outbox where source_audit_event_id in (?,?,?)",
        [audits[0].id, audits[1].id, audits[2].id])
      expect(outbox).toHaveLength(3)

      const secOutbox = await q("select audit_event_id from da_security_outbox where audit_event_id in (?,?,?)",
        [audits[0].id, audits[1].id, audits[2].id])
      expect(secOutbox).toHaveLength(3)
    })

    it("B03: serializes concurrent verification-binding revocation and provisioning without stale proof authorization", async () => {
      const { staffToken } = await setupStaffSession()
      const personOwner = "daprs_race_" + randomBytes(6).toString("hex")
      const personPartner = "daprs_partner_" + randomBytes(6).toString("hex")
      const raceMember = "mem_race_" + randomBytes(6).toString("hex")
      const partnerUser = "usr_partner_" + randomBytes(6).toString("hex")

      await createVerifiedActor("user", partnerUser, personPartner)

      const loginAuthId = "auth_login_" + raceMember
      await q("insert into da_person(id, disabled_at, deleted_at) values (?, null, null) on conflict (id) do nothing", [personOwner])
      await q("insert into da_person_security(person_id, epoch) values (?, 0) on conflict (person_id) do nothing", [personOwner])
      await q("insert into da_login_binding(auth_identity_id, person_id, actor_type, actor_id, verified_at, revoked_at) values (?, ?, 'user', 'usr_dummy_'||?, now(), null)",
        [loginAuthId, personOwner, raceMember])
      await q("insert into da_actor_mapping(id, actor_type, actor_id, person_id, created_by_actor_type, created_by_actor_id) values (?, 'user', 'usr_dummy_'||?, ?, 'system', 'root')",
        ["map_usr_dummy_" + raceMember, raceMember, personOwner])

      const bindingId = "dabind_race_" + randomBytes(6).toString("hex")
      const secondaryAuthId = "auth_sec_" + raceMember
      await q(`insert into da_verified_actor_binding(id, person_id, auth_identity_id, actor_type, actor_id, verified_at, proof_reference, revoked_at)
               values (?, ?, ?, 'member', ?, now(), 'dual-proof-race', null)`,
        [bindingId, personOwner, secondaryAuthId, raceMember])
      await q("insert into da_actor_mapping(id, actor_type, actor_id, person_id, created_by_actor_type, created_by_actor_id) values (?, 'member', ?, ?, 'system', 'root')",
        ["map_mem_" + raceMember, raceMember, personOwner])

      const unlinkToken = "unlink_token_" + randomBytes(16).toString("hex").padEnd(43, "y").slice(0, 43)
      const unlinkHash = digest(unlinkToken)
      await q(`insert into da_browser_session(id, person_id, auth_identity_id, actor_type, actor_id, epoch, csrf_hash, status, created_at, last_activity_at, last_strong_auth_at)
               values (?, ?, ?, 'user', 'usr_dummy_'||?, 0, 'test_csrf', 'active', now(), now(), now())`,
        [unlinkHash, personOwner, loginAuthId, raceMember])

      const provInput = {
        name: "Race Serialization Org",
        initial_owners: [
          { actor_type: "member" as const, actor_id: raceMember },
          { actor_type: "user" as const, actor_id: partnerUser },
        ],
      }

      const [provResult, unlinkResult] = await Promise.allSettled([
        service.provisionPersonalOrganization(staffToken, provInput),
        service.unlinkActor(unlinkToken, bindingId),
      ])

      expect(unlinkResult.status).toBe("fulfilled")

      const bindingRows = await q("select revoked_at from da_verified_actor_binding where id=?", [bindingId])
      expect(bindingRows[0].revoked_at).not.toBeNull()

      if (provResult.status === "rejected") {
        expect((provResult as PromiseRejectedResult).reason.message).toContain("Invalid initial Owner")
      } else {
        expect(provResult.status).toBe("fulfilled")
      }

      await expect(service.provisionPersonalOrganization(staffToken, provInput)).rejects.toThrow(/Invalid initial Owner/)
    })
  },
})
