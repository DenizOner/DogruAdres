import { claimAuditDelivery, loadClaimedAuditEvent, acknowledgeAuditDelivery, deferAuditDelivery, quarantineAuditDelivery, type DeliveryManager } from "./audit-delivery"
import type { OutboxClaim, DeliveryErrorCode } from "./audit-delivery-policy"
import { hasRecentMfaProof } from "./mfa-management"
import {
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
  MedusaError,
} from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import { canManageMembership, isOwnerDemotionAllowed, deriveInvitationToken, hashInvitationToken, invitationTokenMatches, normalizeEmail } from "./security"
import { ActorMapping, AuditEvent, AuditOutbox, Invitation, Membership, Organization, Person } from "./models"
import { randomBytes, randomUUID } from "node:crypto"
import { mayAcceptInvitation } from "./invitation-policy"
import { IdentitySessions, securitySql, type BrowserMfaPurpose, IdentityAccessDenied, mfaRuntimeEnforced } from "./identity-session"
import { MfaPersistence, type MfaAuditActor } from "./mfa-persistence"
import { MfaEnrollmentTickets } from "./mfa-enrollment-ticket"
import { resolveMfaPolicy, type MfaPlatformMode } from "./mfa-policy"
import { generateJwtToken } from "@medusajs/framework/utils"
import { ActorDelegation } from './actor-delegation'
import {AccountLinking,type VerifiedSecondary} from './account-linking'
import {
  PlatformSmtpPersistence,
  type UpdateSmtpSettingsInput,
  type SmtpAuditActor,
} from "./smtp-settings"
import { sendSmtpEmail } from "./smtp-client"
import { PersonalNotifications } from "./personal-notifications"
import { authorizedLegalSellerIds } from "./legal-store-ownership"

export type ActorReference = Readonly<{ actor_type: string; actor_id: string }>

type ProvisionOrganizationInput = Readonly<{
  name: string
  provisioned_by: ActorReference
  initial_owners: ActorReference[]
  staff_grant_id?: string
}>

type ChangeMembershipInput = Readonly<{
  organization_id: string
  membership_id: string
  actor_person_id: string
  role?: "owner" | "admin" | "member"
  status?: "active" | "revoked"
  actor_type: string
  actor_id: string
}>

type FoundationAuditInput = {
  actor_person_id: string
  actor_type: string
  actor_id: string
  role_context?: string | null
  organization_id?: string | null
  action: string
  module: string
  resource: string
  target_id?: string | null
  previous_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
  occurred_at: Date
}

type AdvisoryLockManager = Readonly<{
  execute: (query: string, parameters: string[]) => Promise<unknown>
}>

const activeStatus = "active"
const supportedActorTypes = new Set(["user", "member", "customer"])
export const DOGRUADRES_AUDIT_MODULE: "dogruadres-access" = "dogruadres-access"

export default class DogruAdresAccessModuleService extends MedusaService({
  Person,
  ActorMapping,
  Organization,
  Membership,
  Invitation,
  AuditEvent,
  AuditOutbox,
}) {
  private async persistAuditEventsWithOutbox_(input: FoundationAuditInput[], sharedContext: Context) {
    // No decorator here: the five mutation entrypoints already own the physical
    // module transaction. Refuse accidental use without that active manager.
    if (!sharedContext.transactionManager || !input.length || input.some(event => event.module !== DOGRUADRES_AUDIT_MODULE)) {
      throw new Error("Foundation audit/outbox persistence requires an active transaction and Foundation events")
    }
    const events = await this.createAuditEvents(input, sharedContext)
    if (events.length !== input.length || new Set(events.map(event => event.id)).size !== input.length) {
      throw new Error("Canonical audit cardinality mismatch")
    }
    const outbox = await this.createAuditOutboxes(events.map(event => {
      if (!event.id || event.module !== DOGRUADRES_AUDIT_MODULE) throw new Error("Invalid canonical Foundation audit identity")
      return {
        source_audit_event_id: event.id,
        source_module: DOGRUADRES_AUDIT_MODULE,
        envelope_version: 1,
        status: "pending" as const,
        // Explicit allowlist. No before/after payload, recipient email, token or
        // credentials; use only the actual persisted canonical audit identifiers.
        envelope: {
          version: 1,
          source_module: DOGRUADRES_AUDIT_MODULE,
          source_audit_event_id: event.id,
          organization_id: event.organization_id ?? null,
          actor: {
            person_id: event.actor_person_id,
            type: event.actor_type,
            id: event.actor_id,
            role_context: event.role_context ?? null,
          },
          action: event.action,
          resource: event.resource,
          target_id: event.target_id ?? null,
          occurred_at: new Date(event.occurred_at).toISOString(),
        },
      }
    }), sharedContext)
    const sourceIds = new Set(events.map(event => event.id))
    if (outbox.length !== events.length || new Set(outbox.map(row => row.source_audit_event_id)).size !== events.length ||
        outbox.some(row => row.source_module !== DOGRUADRES_AUDIT_MODULE || !sourceIds.has(row.source_audit_event_id))) {
      throw new Error("Foundation audit/outbox cardinality mismatch")
    }
    // All errors escape the enclosing transaction; no network publish, independent
    // transaction or workflow compensation substitutes for rollback here.
    return events
  }

  // Every operation owns a short Foundation transaction. No Index call occurs
  // while a Foundation row lock/EntityManager is held across module boundaries.
  @InjectTransactionManager()
  async claimFoundationAuditOutbox(@MedusaContext() context: Context = {}) {
    return claimAuditDelivery(this.auditDeliveryManager_(context))
  }
  @InjectTransactionManager()
  async readClaimedFoundationAudit(claim: OutboxClaim, @MedusaContext() context: Context = {}) {
    return loadClaimedAuditEvent(this.auditDeliveryManager_(context), claim)
  }
  @InjectTransactionManager()
  async acknowledgeFoundationAudit(claim: OutboxClaim, @MedusaContext() context: Context = {}) {
    return acknowledgeAuditDelivery(this.auditDeliveryManager_(context), claim)
  }
  @InjectTransactionManager()
  async deferFoundationAudit(claim: OutboxClaim, code: DeliveryErrorCode, @MedusaContext() context: Context = {}) {
    return deferAuditDelivery(this.auditDeliveryManager_(context), claim, code)
  }
  @InjectTransactionManager()
  async quarantineFoundationAudit(claim: OutboxClaim, code: DeliveryErrorCode, @MedusaContext() context: Context = {}) {
    return quarantineAuditDelivery(this.auditDeliveryManager_(context), claim, code)
  }
  private auditDeliveryManager_(context: Context): DeliveryManager {
    if (!context.transactionManager) throw new Error("FOUNDATION_DELIVERY_TRANSACTION_REQUIRED")
    return context.transactionManager as unknown as DeliveryManager
  }


  @InjectTransactionManager()
  async personalLinkPrimary(token:string,@MedusaContext() context:Context={}) {return new AccountLinking(securitySql(context.transactionManager)).primary(token)}
  @InjectTransactionManager()
  async beginActorLink(token:string,proof:VerifiedSecondary,challenge:string|null,@MedusaContext() context:Context={}) {return new AccountLinking(securitySql(context.transactionManager)).begin(token,proof,challenge)}
  @InjectTransactionManager()
  async readActorLink(token:string,intent:string,@MedusaContext() context:Context={}) {return new AccountLinking(securitySql(context.transactionManager)).read(token,intent)}
  @InjectTransactionManager()
  async completeActorLink(token:string,intent:string,proof:VerifiedSecondary,challenge:string|null,@MedusaContext() context:Context={}) {return new AccountLinking(securitySql(context.transactionManager)).complete(token,intent,proof,challenge)}
  @InjectTransactionManager()
  async unlinkActor(token:string,id:string,@MedusaContext() context:Context={}) {return new AccountLinking(securitySql(context.transactionManager)).unlink(token,id)}
  @InjectTransactionManager()
  async personalActorLinks(token:string,@MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager),s=await new IdentitySessions(sql).current(token)
    if(!s)return null // Preserve terminal expiry when returning denial.
    return sql.execute(`select id,actor_type,actor_id,revoked_at from da_verified_actor_binding where person_id=? order by verified_at`,[s.person_id])
  }
  @InjectTransactionManager()
  async personalActorBinding(token:string,type:string,@MedusaContext() context:Context={}) {
    const result=await new ActorDelegation(securitySql(context.transactionManager)).binding(token,type)
    return result?.binding??null
  }
  @InjectTransactionManager()
  async personalActorCredential(token:string,type:string,identity:{id:string;app_metadata?:Record<string,unknown>},http:Parameters<typeof generateJwtToken>[1],@MedusaContext() context:Context={}) {
    return new ActorDelegation(securitySql(context.transactionManager)).credential(token,type,identity,http)
  }
  @InjectTransactionManager()
  async personalMemberships(token:string,org:string,@MedusaContext() context:Context={}) {
    const decision=await new IdentitySessions(securitySql(context.transactionManager)).organizations(token,org)
    if(!decision||!['owner','admin'].includes(decision.organizations[0].role))throw new MedusaError(MedusaError.Types.FORBIDDEN,'Access denied')
    return this.listMemberships({organization_id:org,status:'active'},{select:['id','person_id','role','status','protected_owner']},context)
  }
  @InjectTransactionManager()
  async personalRevokeMembership(token:string,org:string,membership:string,@MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager)
    await sql.execute(`select pg_advisory_xact_lock(hashtext('dogruadres-owner-change'),hashtext(?))`,[org])
    const sessions=new IdentitySessions(sql),identity=await sessions.current(token,true)
    const decision=identity?await sessions.organizations(token,org):null
    if(!identity||!decision||!['owner','admin'].includes(decision.organizations[0].role))throw new MedusaError(MedusaError.Types.FORBIDDEN,'Access denied')
    const result=await this.changeMembership({organization_id:org,membership_id:membership,actor_person_id:identity.person_id,actor_type:identity.actor_type,actor_id:identity.actor_id,status:'revoked'},context)
    return {id:result.id,status:result.status}
  }
  @InjectTransactionManager()
  async personalChangeMembershipRole(token:string,org:string,membership:string,role:'member'|'admin',@MedusaContext() context:Context={}) {
    if(role!=='member'&&role!=='admin')throw new MedusaError(MedusaError.Types.INVALID_DATA,'Invalid role')
    const sql=securitySql(context.transactionManager)
    await sql.execute(`select pg_advisory_xact_lock(hashtext('dogruadres-owner-change'),hashtext(?))`,[org])
    const sessions=new IdentitySessions(sql),identity=await sessions.current(token,true)
    const decision=identity?await sessions.organizations(token,org):null
    if(!identity||!decision||!['owner','admin'].includes(decision.organizations[0].role))throw new MedusaError(MedusaError.Types.FORBIDDEN,'Access denied')
    const target=await this.getMembershipInOrganization(membership,org,context)
    if(!target)throw new MedusaError(MedusaError.Types.NOT_FOUND,'Membership not found in the selected Organization')
    if(target.protected_owner||target.role==='owner')throw new MedusaError(MedusaError.Types.FORBIDDEN,'Protected Owner cannot be changed through ordinary role controls')
    const result=await this.changeMembership({
      organization_id:org,
      membership_id:membership,
      actor_person_id:identity.person_id,
      actor_type:identity.actor_type,
      actor_id:identity.actor_id,
      role
    },context)
    return {id:result.id,role:result.role,status:result.status}
  }

  /**
   * B07: an existing active member can become a protected Owner, and an
   * existing protected Owner can return to Admin only when another protected
   * Owner remains. All invariant checks and audit/outbox writes remain in the
   * existing transaction-bound changeMembership implementation.
   */
  @InjectTransactionManager()
  async personalManageProtectedOwner(
    token: string,
    org: string,
    membership: string,
    role: 'owner' | 'admin',
    @MedusaContext() context: Context = {}
  ) {
    if (role !== 'owner' && role !== 'admin') {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Invalid Owner operation')
    }
    const sql = securitySql(context.transactionManager)
    await sql.execute(`select pg_advisory_xact_lock(hashtext('dogruadres-owner-change'),hashtext(?))`, [org])
    const sessions = new IdentitySessions(sql)
    const identity = await sessions.current(token, true)
    const decision = identity ? await sessions.organizations(token, org) : null
    if (!identity || decision?.organizations[0]?.role !== 'owner') {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, 'Access denied')
    }
    const target = await this.getMembershipInOrganization(membership, org, context)
    if (!target) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Membership not found in the selected Organization')
    }
    // Explicit B07 operation states, not a backdoor to revoked membership
    // reactivation or ordinary B06 role controls.
    if (target.status !== 'active' ||
        (role === 'owner' && (target.protected_owner || target.role === 'owner')) ||
        (role === 'admin' && (!target.protected_owner || target.role !== 'owner'))) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, 'Owner operation denied')
    }
    const result = await this.changeMembership({
      organization_id: org,
      membership_id: membership,
      actor_person_id: identity.person_id,
      actor_type: identity.actor_type,
      actor_id: identity.actor_id,
      role,
    }, context)
    return { id: result.id, role: result.role, status: result.status, protected_owner: result.protected_owner }
  }

  @InjectTransactionManager()
  async personalMachineGrant(apiKeyId:string,method:string,resource:string,@MedusaContext() context:Context={}) {
    const rows=await securitySql(context.transactionManager).execute(`select id from da_machine_grant where api_key_id=? and method=? and resource=? and revoked_at is null`,[apiKeyId,method,resource])
    return rows.length===1
  }
  @InjectTransactionManager()
  async renewPersonalNativeCredential(token:string,identity:{id:string;app_metadata?:Record<string,unknown>},http:Parameters<typeof generateJwtToken>[1],@MedusaContext() context:Context={}) {
    return new IdentitySessions(securitySql(context.transactionManager)).renewNative(token,identity,http)
  }
  @InjectTransactionManager()
  async personalNativeCredential(hash:string,@MedusaContext() context:Context={}) {
    return new IdentitySessions(securitySql(context.transactionManager)).native(hash)
  }
  @InjectTransactionManager()
  async personalLoginAttempt(subjectHash:string, addressHash:string, @MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager)
    // Fixed server-owned engineering abuse limits, never an authorization grant.
    for(const [bucket,maximum] of [["subject:"+subjectHash,10],["address:"+addressHash,60]] as const){
      const [row]=await sql.execute(`insert into da_login_attempt(bucket,minute,attempts)
        values (?,floor(extract(epoch from clock_timestamp())/60),1)
        on conflict(bucket,minute) do update set attempts=da_login_attempt.attempts+1 returning attempts`,[bucket])
      if(!row || row.attempts>maximum)return false
    }
    return true
  }
  @InjectTransactionManager()
  async pendingPersonalChallenge(authId:string, challengeId:string, @MedusaContext() context:Context={}) {
    return new IdentitySessions(securitySql(context.transactionManager)).pending(authId,challengeId)
  }
  @InjectTransactionManager()
  async readPersonalChallenge(token:string, @MedusaContext() context:Context={}) {
    return new IdentitySessions(securitySql(context.transactionManager)).challenge(token)
  }
  @InjectTransactionManager()
  async completePersonalChallenge(token:string, completedAt:Date, @MedusaContext() context:Context={}) {
    return new IdentitySessions(securitySql(context.transactionManager)).complete(token,completedAt)
  }
  @InjectTransactionManager()
  async openPersonalSession(
    authIdentityId: string,
    purpose:BrowserMfaPurpose="legacy",
    expectedRevision?:Readonly<{platform:number;person:number}>,
    @MedusaContext() context: Context = {}
  ) {
    return new IdentitySessions(securitySql(context.transactionManager))
      .create(authIdentityId,null,purpose,expectedRevision)
  }
  @InjectTransactionManager()
  async personalMfaRuntimeActivation(@MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager)
    const rows=await sql.execute(`select
      coalesce(to_jsonb(q)->>'mfa_activated','false') as mfa_activated
      from da_session_policy q where q.id='current' for share`)
    if(rows.length!==1||!["true","false"].includes(rows[0].mfa_activated))
      throw new IdentityAccessDenied()
    return rows[0].mfa_activated==="true"
  }

  @InjectTransactionManager()
  async personalLoginMfaDecision(
    authIdentityId:string,
    nativeFactorState:"enabled"|"pending"|"not_enrolled",
    @MedusaContext() context: Context = {}) {
    if(!mfaRuntimeEnforced())throw new IdentityAccessDenied()
    const sql=securitySql(context.transactionManager)
    const bindings=await sql.execute(`select b.person_id from da_login_binding b
      join da_person p on p.id=b.person_id and p.disabled_at is null and p.deleted_at is null
      join da_actor_mapping a on a.person_id=p.id and a.actor_type=b.actor_type
        and a.actor_id=b.actor_id and a.deleted_at is null
      where b.auth_identity_id=? and b.revoked_at is null and b.verified_at is not null`,
      [authIdentityId])
    if(bindings.length!==1)throw new IdentityAccessDenied()
    const persistence=new MfaPersistence(sql)
    const [policy,personal]=await Promise.all([
      persistence.readPlatformPolicy(),persistence.readPersonPreference(bindings[0].person_id),
    ])
    if(!["enabled","pending","not_enrolled"].includes(nativeFactorState))
      throw new IdentityAccessDenied()
    const decision=resolveMfaPolicy(policy.platform_mode,personal.user_enabled,
      nativeFactorState==="enabled")
    // Enabled always needs a completed native challenge, never password-only.
    if(nativeFactorState==="enabled")throw new IdentityAccessDenied()
    // Pending factors are not usable for authentication. Give only setup access
    // so the owner can resume with fresh password proof and existing secret.
    // Never treat "pending" as a completed, full-strength MFA factor.
    if(nativeFactorState==="pending" && policy.platform_mode==="disabled")
      throw new IdentityAccessDenied()
    return {
      purpose:(nativeFactorState==="pending"||decision.required?"mfa_enroll":"full") as BrowserMfaPurpose,
      expectedRevision:{platform:policy.version,person:personal.version},
    }
  }
  @InjectTransactionManager()
  async personalEnrollmentSession(token:string,@MedusaContext() context:Context={}) {
    return new IdentitySessions(securitySql(context.transactionManager)).enrollment(token)
  }
  @InjectTransactionManager()
  async personalEnrollmentMfaSettings(token:string,@MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager)
    const s=await new IdentitySessions(sql).enrollment(token)
    if(!s)return null
    const store=new MfaPersistence(sql)
    return {
      platform:await store.readPlatformPolicy(),
      personal:await store.readPersonPreference(s.person_id),
    }
  }

  @InjectTransactionManager()
  async personalSession(token: string, @MedusaContext() context: Context = {}) {
    return new IdentitySessions(securitySql(context.transactionManager)).current(token)
  }

  @InjectTransactionManager()
  async closePersonalSession(token: string, all: boolean, @MedusaContext() context: Context = {}) {
    return new IdentitySessions(securitySql(context.transactionManager)).logout(token, all)
  }

  @InjectTransactionManager()
  async lockPersonalSession(token: string, @MedusaContext() context: Context = {}) {
    return new IdentitySessions(securitySql(context.transactionManager)).logout(token, false, true)
  }

  @InjectTransactionManager()
  async personalNotifications(token: string, offset: number, organization?: string, @MedusaContext() context: Context = {}) {
    return new PersonalNotifications(securitySql(context.transactionManager)).list(token, offset, organization)
  }

  @InjectTransactionManager()
  async readPersonalNotification(token: string, id: string, organization?: string, @MedusaContext() context: Context = {}) {
    return new PersonalNotifications(securitySql(context.transactionManager)).read(token, id, organization)
  }

  @InjectTransactionManager()
  async personalOrganizations(token: string, organizationId?: string, @MedusaContext() context: Context = {}) {
    return new IdentitySessions(securitySql(context.transactionManager)).organizations(token, organizationId)
  }

  // Background privacy checks must not extend the user's idle session.
  @InjectTransactionManager()
  async observePersonalOrganizations(token: string, organizationId?: string, @MedusaContext() context: Context = {}) {
    return new IdentitySessions(securitySql(context.transactionManager)).organizations(token, organizationId, false)
  }

  @InjectTransactionManager()
  async personalStaff(token: string, task: string, resource: string, @MedusaContext() context: Context = {}) {
    return new IdentitySessions(securitySql(context.transactionManager)).staff(token, task, resource)
  }

  /**
   * Settings are always scoped to the current canonical Person. No Person or
   * native actor selector is accepted from the client.
   * This source path remains unreachable until MFA settings ingress is enabled.
   */
  /** These internal helpers never accept client Person or actor selectors. */
  @InjectTransactionManager()
  async personalBeginMfaEnrollment(token:string,authIdentityId:string,factorId:string,@MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager)
    // Session/Person lock comes FIRST, matching staff policy-change lock order.
    // Taking the platform advisory lock first could deadlock against a staff
    // update that already holds this same browser session lock.
    if(!await new IdentitySessions(sql).enrollment(token))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    if((await new MfaPersistence(sql).readPlatformPolicy()).platform_mode==="disabled")return null
    return new MfaEnrollmentTickets(sql).beginAfterPasswordProof(token,authIdentityId,factorId)
  }

  @InjectTransactionManager()
  async personalRevokePendingMfaEnrollment(token:string,factorId:string,@MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager)
    if(!await new IdentitySessions(sql).enrollment(token))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    if((await new MfaPersistence(sql).readPlatformPolicy()).platform_mode==="disabled")return null
    return new MfaEnrollmentTickets(sql).revokePendingFactor(token,factorId)
  }

  @InjectTransactionManager()
  async personalClaimMfaVerification(token:string,ticket:string,@MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager)
    // Session/Person lock comes FIRST, matching staff policy-change lock order.
    // Taking the platform advisory lock first could deadlock against a staff
    // update that already holds this same browser session lock.
    if(!await new IdentitySessions(sql).enrollment(token))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    if((await new MfaPersistence(sql).readPlatformPolicy()).platform_mode==="disabled")return null
    return new MfaEnrollmentTickets(sql).claimVerificationAttempt(token,ticket)
  }

  @InjectTransactionManager()
  async personalCompleteMfaEnrollment(token:string,ticket:string,factorId:string,@MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager)
    // Session/Person lock comes FIRST, matching staff policy-change lock order.
    // Taking the platform advisory lock first could deadlock against a staff
    // update that already holds this same browser session lock.
    if(!await new IdentitySessions(sql).enrollment(token))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    if((await new MfaPersistence(sql).readPlatformPolicy()).platform_mode==="disabled")return null
    return new MfaEnrollmentTickets(sql).completeAfterNativeVerification(token,ticket,factorId,new Date())
  }

  @InjectTransactionManager()
  async personalMfaSettings(token: string, @MedusaContext() context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    const sessions = new IdentitySessions(sql)
    const session = await sessions.current(token)
    if (!session) return null
    const store = new MfaPersistence(sql)
    const platform = await store.readPlatformPolicy()
    const personal = await store.readPersonPreference(session.person_id)
    const platformGrant = await sessions.staff(token, "security.mfa.manage", "platform")
    return {
      platform, personal,
      can_manage_platform: !!platformGrant,
      // Exact AuthIdentity native factor status is NOT inferred from preference.
      native_factor_state: "unverified" as const,
    }
  }

  @InjectTransactionManager()
  async personalSetMfaPreference(token: string, enabled: boolean, expectedVersion: number, @MedusaContext() context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    const sessions = new IdentitySessions(sql)
    const session = await sessions.current(token, true)
    if (!session) return null
    const store = new MfaPersistence(sql)
    const policy = await store.readPlatformPolicy()
    if (policy.platform_mode !== "optional") return null
    const actor: MfaAuditActor = {
      person_id: session.person_id,
      actor_type: session.actor_type as MfaAuditActor["actor_type"],
      actor_id: session.actor_id,
    }
    return store.setPersonPreference(session.person_id, enabled, expectedVersion, actor)
  }

  /** Holds session/epoch then platform lock across the native operation.
   * Native Auth and Foundation are separate transactions: any failure after
   * native invocation is INDETERMINATE, never compensated or retried here.
   */
  @InjectTransactionManager()
  async personalManageNativeMfa(token:string, action:"recovery_codes"|"disable", operation:(identityId:string)=>Promise<unknown>, @MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager),sessions=new IdentitySessions(sql)
    const session=await sessions.current(token,true)
    if(!session)return null
    const [limits]=await sql.execute("select recent_auth_seconds from da_session_policy where id='current'")
    if(!hasRecentMfaProof(session,limits?.recent_auth_seconds))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    const store=new MfaPersistence(sql),policy=await store.readPlatformPolicy()
    if(action==="disable"&&policy.platform_mode==="required")return null
    const personal=await store.readPersonPreference(session.person_id)
    const actor={person_id:session.person_id,actor_type:session.actor_type as MfaAuditActor["actor_type"],actor_id:session.actor_id}
    const result=await operation(session.auth_identity_id)
    await store.recordNativeMfaAction(actor,action==="disable"?"mfa.native_factor_disabled":"mfa.recovery_codes_generated")
    if(action==="disable") {
      await sessions.logout(token,true)
      // Disabled platform preserves the preference; optional self-disable turns it off.
      if(policy.platform_mode==="optional"&&personal.user_enabled)
        await store.setPersonPreference(session.person_id,false,personal.version,actor)
    }
    return {result,sessions_revoked:action==="disable"}
  }
  @InjectTransactionManager()
  async personalSetPlatformMfaMode(token: string, mode: MfaPlatformMode, expectedVersion: number, @MedusaContext() context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    const staff = await new IdentitySessions(sql).staff(token, "security.mfa.manage", "platform")
    if (!staff) return null
    const actor: MfaAuditActor = {
      person_id: staff.person_id,
      actor_type: staff.actor_type as MfaAuditActor["actor_type"],
      actor_id: staff.actor_id,
    }
    return new MfaPersistence(sql).setPlatformPolicy(mode, expectedVersion, actor)
  }

  @InjectTransactionManager()
  async provisionPersonalOrganization(token: string, input: Omit<ProvisionOrganizationInput,"provisioned_by">, @MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(sql).staff(token,"organization.provision","platform")
    if(!staff)throw new MedusaError(MedusaError.Types.FORBIDDEN,"Platform staff grant and strong authentication required")

    for (const owner of input.initial_owners) {
      if (!supportedActorTypes.has(owner?.actor_type) || !owner?.actor_id) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
      }
    }

    // Deterministic advisory lock ordering matching AccountLinking (da-actor-link)
    // to serialize against concurrent linking/unlinking without deadlock.
    const actorLinkKeys = [...new Set(input.initial_owners.map(o => `${o.actor_type}:${o.actor_id}`))].sort()
    for (const key of actorLinkKeys) {
      await sql.execute(`select pg_advisory_xact_lock(hashtext('da-actor-link'), hashtext(?))`, [key])
    }

    const ownerPersonIds = new Set<string>()
    for (const owner of input.initial_owners) {
      // Step A: Inspect all active verified proofs with row-level shared locks.
      // Do not join with da_actor_mapping or da_person yet to avoid masking conflicting proofs.
      const loginProofs = await sql.execute(
        `select person_id from da_login_binding
         where actor_type=? and actor_id=? and verified_at is not null and revoked_at is null
         for share`,
        [owner.actor_type, owner.actor_id]
      )
      const secondaryProofs = await sql.execute(
        `select person_id from da_verified_actor_binding
         where actor_type=? and actor_id=? and verified_at is not null and revoked_at is null
         for share`,
        [owner.actor_type, owner.actor_id]
      )

      const proofRows = [...loginProofs, ...secondaryProofs]
      if (proofRows.length === 0) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
      }

      const distinctProofPersonIds = [...new Set(proofRows.map((r: any) => r.person_id))]
      if (distinctProofPersonIds.length !== 1) {
        // Conflicting active proofs pointing to multiple distinct Persons
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
      }
      const verifiedPersonId = distinctProofPersonIds[0]

      // Step B: Ensure active actor mapping exists and agrees with the verified Person.
      const mappings = await sql.execute(
        `select person_id, deleted_at from da_actor_mapping
         where actor_type=? and actor_id=?
         for share`,
        [owner.actor_type, owner.actor_id]
      )
      if (mappings.length !== 1 || mappings[0].deleted_at !== null || mappings[0].person_id !== verifiedPersonId) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
      }

      // Step C: Ensure the canonical Person is active (not disabled or deleted).
      const people = await sql.execute(
        `select id, disabled_at, deleted_at from da_person
         where id=?
         for share`,
        [verifiedPersonId]
      )
      if (people.length !== 1 || people[0].disabled_at !== null || people[0].deleted_at !== null) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
      }

      ownerPersonIds.add(verifiedPersonId)
    }

    if (ownerPersonIds.size !== input.initial_owners.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Initial Owners must be distinct canonical Persons")
    }
    const result=await this.provisionOrganization({...input,staff_grant_id:staff.grant_id,provisioned_by:{actor_type:staff.actor_type,actor_id:staff.actor_id}},context)
    // Generated MedusaService writes may still be pending in this transaction's
    // identity map. Flush before the raw SELECT/FK insert; commit stays owned here.
    const manager=context.transactionManager
    if(!manager || typeof manager!=="object" || !("flush" in manager) || typeof manager.flush!=="function")throw new Error("Foundation transaction manager unavailable")
    await manager.flush()
    await sql.execute(`insert into da_security_outbox(id,audit_event_id,created_at)
      select 'security_'||id,id,clock_timestamp() from da_audit_event where organization_id=?
      and action in ('organization.provisioned','organization.owner_assigned') on conflict(audit_event_id) do nothing`,[result.organization.id])
    return result
  }

  private async ensureActorPerson_(
    actor: ActorReference,
    createdBy: ActorReference,
    sharedContext: Context
  ) {
    if (!supportedActorTypes.has(actor.actor_type) || !actor.actor_id) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Unsupported authenticated actor")
    }
    // First-use mapping and Person creation are one transaction. Serialize before
    // reading so a competing first use returns the committed canonical Person.
    await this.lockActor_(actor, sharedContext)
    const mappings = await this.listActorMappings(
      { actor_type: actor.actor_type, actor_id: actor.actor_id },
      { take: 2 },
      sharedContext
    )
    if (mappings.length > 1) throw new Error("Ambiguous actor mapping")
    if (mappings[0]) {
      const people = await this.listPeople({ id: mappings[0].person_id }, { take: 2 }, sharedContext)
      if (people.length !== 1 || people[0].disabled_at) throw new MedusaError(MedusaError.Types.FORBIDDEN, "Actor identity is unavailable")
      return people[0]
    }

    const [person] = await this.createPeople([{}], sharedContext)
    await this.createActorMappings([{
      actor_type: actor.actor_type,
      actor_id: actor.actor_id,
      person_id: person.id,
      created_by_actor_type: createdBy.actor_type,
      created_by_actor_id: createdBy.actor_id,
    }], sharedContext)
    return person
  }

  async resolvePersonForActor(actor: ActorReference) {
    if (!supportedActorTypes.has(actor.actor_type) || !actor.actor_id) return null
    const mappings = await this.listActorMappings(
      { actor_type: actor.actor_type, actor_id: actor.actor_id },
      { take: 2 }
    )
    if (mappings.length !== 1) return null
    const people = await this.listPeople({ id: mappings[0].person_id }, { take: 2 })
    if (people.length !== 1 || people[0].disabled_at) return null
    return people[0]
  }

  async getActiveMembership(personId: string, organizationId: string, sharedContext?: Context) {
    const memberships = await this.listMemberships(
      { person_id: personId, organization_id: organizationId, status: activeStatus },
      { take: 2 },
      sharedContext
    )
    return memberships.length === 1 ? memberships[0] : null
  }

  async getOrganization(organizationId: string, sharedContext?: Context) {
    const organizations = await this.listOrganizations({ id: organizationId }, { take: 2 }, sharedContext)
    return organizations.length === 1 ? organizations[0] : null
  }

  async getMembershipInOrganization(membershipId: string, organizationId: string, sharedContext?: Context) {
    const memberships = await this.listMemberships(
      { id: membershipId, organization_id: organizationId },
      { take: 2 },
      sharedContext
    )
    return memberships.length === 1 ? memberships[0] : null
  }

  async listOrganizationMemberships(organizationId: string) {
    return this.listMemberships({ organization_id: organizationId, status: "active" })
  }

  async getInvitationInOrganization(invitationId: string, organizationId: string, _sharedContext?: Context) {
    const invitations = await this.listInvitations(
      { id: invitationId, organization_id: organizationId },
      { take: 2 },
      _sharedContext
    )
    return invitations.length === 1 ? invitations[0] : null
  }

  private actorLockKey_(actor: ActorReference) {
    return JSON.stringify([actor.actor_type, actor.actor_id])
  }

  private async lockActor_(actor: ActorReference, sharedContext: Context) {
    const transactionManager = sharedContext.transactionManager as AdvisoryLockManager | undefined
    if (!transactionManager) throw new Error("Actor mapping changes require an active database transaction")
    await transactionManager.execute(
      "SELECT pg_advisory_xact_lock(hashtext('dogruadres-actor'), hashtext(?))",
      [this.actorLockKey_(actor)]
    )
  }

  private async lockInvitation_(invitationId: string, sharedContext: Context) {
    const transactionManager = sharedContext.transactionManager as AdvisoryLockManager | undefined
    if (!transactionManager) throw new Error("Invitation changes require an active database transaction")
    // EntityManager.execute forwards the active transaction context. Calling
    // getConnection().execute directly acquires a lock in autocommit instead.
    await transactionManager.execute(
      "SELECT pg_advisory_xact_lock(hashtext('dogruadres-invitation'), hashtext(?))",
      [invitationId]
    )
  }

  private async lockMembership_(personId: string, organizationId: string, sharedContext: Context) {
    const transactionManager = sharedContext.transactionManager as AdvisoryLockManager | undefined
    if (!transactionManager) throw new Error("Membership changes require an active database transaction")
    // Different invitations for one Person/Organization must serialize with each
    // other and ordinary membership changes. JSON tuple encoding avoids ambiguous
    // concatenation; hash collisions can only serialize otherwise unrelated pairs.
    // EntityManager.execute must use the active transaction, never autocommit.
    // Advisory order: acceptance takes invitation -> actor -> membership;
    // ordinary changes take Organization -> membership. Provisioning prelocks all
    // actors in sorted order, then takes no invitation/Organization/membership locks.
    // No path takes an earlier lock class after membership, avoiding a cycle.
    await transactionManager.execute(
      "SELECT pg_advisory_xact_lock(hashtext('dogruadres-membership'), hashtext(?))",
      [JSON.stringify([personId, organizationId])]
    )
  }

  @InjectTransactionManager()
  async provisionOrganization(
    input: ProvisionOrganizationInput,
    @MedusaContext() sharedContext: Context = {}
  ) {
    const name = input.name.trim()
    if (!name || !input.initial_owners.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Organization name and at least one initial Owner are required")
    // Provisioning may resolve several actors. Acquire the complete set in one
    // deterministic order before ensureActorPerson_ re-enters those same locks,
    // including the provisioner: different Owner lists must not invert the order.
    const actorsToLock = new Map([input.provisioned_by, ...input.initial_owners].map((actor) => [this.actorLockKey_(actor), actor]))
    for (const key of [...actorsToLock.keys()].sort()) {
      await this.lockActor_(actorsToLock.get(key)!, sharedContext)
    }
    const provisioner = await this.ensureActorPerson_(input.provisioned_by, input.provisioned_by, sharedContext)
    const owners: Array<{ id: string }> = []
    for (const actor of input.initial_owners) {
      owners.push(await this.ensureActorPerson_(actor, input.provisioned_by, sharedContext))
    }
    const uniqueOwnerIds = new Set(owners.map((person) => person.id))
    if (uniqueOwnerIds.size !== owners.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Initial Owners must be distinct canonical Persons")

    const [organization] = await this.createOrganizations([{ name, status: "active" }], sharedContext)
    const memberships = await this.createMemberships(
      owners.map((person) => ({
        organization_id: organization.id,
        person_id: person.id,
        role: "owner" as const,
        status: "active" as const,
        protected_owner: true,
      })),
      sharedContext
    )
    await this.persistAuditEventsWithOutbox_([
      {
        actor_id: input.provisioned_by.actor_id,
        actor_type: input.provisioned_by.actor_type,
        actor_person_id: provisioner.id,
        role_context: input.staff_grant_id ? "platform_staff" : "platform_administrator",
        organization_id: organization.id,
        action: "organization.provisioned",
        module: DOGRUADRES_AUDIT_MODULE,
        resource: "organization",
        target_id: organization.id,
        new_values: { name: organization.name, initial_owner_count: memberships.length, ...(input.staff_grant_id?{staff_grant_id:input.staff_grant_id,staff_task:"organization.provision",staff_resource:"platform"}:{}) },
        occurred_at: new Date(),
      },
      ...memberships.map((membership, index) => ({
        actor_id: input.provisioned_by.actor_id,
        actor_type: input.provisioned_by.actor_type,
        actor_person_id: provisioner.id,
        role_context: input.staff_grant_id ? "platform_staff" : "platform_administrator",
        organization_id: organization.id,
        action: "organization.owner_assigned",
        module: DOGRUADRES_AUDIT_MODULE,
        resource: "membership",
        target_id: membership.id,
        new_values: { role: "owner", protected_owner: true, person_id: owners[index].id,
          ...(input.staff_grant_id?{staff_grant_id:input.staff_grant_id,staff_task:"organization.provision",staff_resource:"platform"}:{}) },
        occurred_at: new Date(),
      })),
    ], sharedContext)
    return { organization, memberships }
  }

  @InjectTransactionManager()
  async changeMembership(
    input: ChangeMembershipInput,
    @MedusaContext() sharedContext: Context = {}
  ) {
    const transactionManager = sharedContext.transactionManager as AdvisoryLockManager | undefined
    if (!transactionManager) throw new Error("Membership changes require an active database transaction")
    await transactionManager.execute(
      "SELECT pg_advisory_xact_lock(hashtext('dogruadres-owner-change'), hashtext(?))",
      [input.organization_id]
    )
    const initialTarget = await this.getMembershipInOrganization(input.membership_id, input.organization_id, sharedContext)
    if (!initialTarget) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Membership not found in the selected Organization")
    await this.lockMembership_(initialTarget.person_id, input.organization_id, sharedContext)
    // Waiting may have allowed an invitation to reactivate this membership.
    // Re-read persisted target and actor authorization before transition decisions.
    const actorMembership = await this.getActiveMembership(input.actor_person_id, input.organization_id, sharedContext)
    if (!actorMembership || !["owner", "admin"].includes(actorMembership.role)) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Active Owner or Admin membership is required")
    }
    const target = await this.getMembershipInOrganization(input.membership_id, input.organization_id, sharedContext)
    if (!target || target.person_id !== initialTarget.person_id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Membership not found in the selected Organization")
    if (!canManageMembership(target.status)) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Revoked membership can only be reactivated by accepting a fresh valid invitation")
    }

    const changesProtectedOwner = target.protected_owner || target.role === "owner" || input.role === "owner"
    if (changesProtectedOwner && !actorMembership.protected_owner) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Only a protected Owner can manage Owner status")
    }

    if (target.protected_owner && (input.role && input.role !== "owner" || input.status === "revoked")) {
      const ownerCount = await this.listMemberships({
        organization_id: input.organization_id,
        status: "active",
        role: "owner",
        protected_owner: true,
      }, {}, sharedContext)
      if (!isOwnerDemotionAllowed(ownerCount.length)) throw new MedusaError(MedusaError.Types.FORBIDDEN, "The last active protected Owner cannot be demoted or revoked")
    }

    const nextRole = input.role ?? target.role
    const nextStatus = input.status ?? target.status
    const updated = await this.updateMemberships({
      id: target.id,
      role: nextRole,
      status: nextStatus,
      protected_owner: nextRole === "owner" && nextStatus === "active",
      revoked_at: nextStatus === "revoked" ? new Date() : null,
    }, sharedContext)
    const [membershipAudit] = await this.persistAuditEventsWithOutbox_([{
      actor_id: input.actor_id,
      actor_type: input.actor_type,
      actor_person_id: input.actor_person_id,
      role_context: actorMembership.role,
      organization_id: input.organization_id,
      action: "organization.membership_changed",
      module: DOGRUADRES_AUDIT_MODULE,
      resource: "membership",
      target_id: target.id,
      previous_values: { role: target.role, status: target.status, protected_owner: target.protected_owner },
      new_values: { role: nextRole, status: nextStatus, protected_owner: nextRole === "owner" && nextStatus === "active" },
      occurred_at: new Date(),
    }], sharedContext)
    const auditManager=sharedContext.transactionManager as {flush():Promise<void>}
    await auditManager.flush()
    await securitySql(sharedContext.transactionManager).execute(`insert into da_security_outbox(id,audit_event_id,created_at) values(?,?,clock_timestamp())`,['security_'+membershipAudit.id,membershipAudit.id])
    return updated
  }

  @InjectTransactionManager()
  async createOrganizationInvitation(
    input: Readonly<{ organization_id: string; actor_person_id: string; actor_type: string; actor_id: string; email: string; role: "admin" | "member" }>,
    @MedusaContext() sharedContext: Context = {}
  ) {
    const actorMembership = await this.getActiveMembership(input.actor_person_id, input.organization_id, sharedContext)
    if (!actorMembership || !["owner", "admin"].includes(actorMembership.role)) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Active Owner or Admin membership is required")
    }
    const organization = await this.getOrganization(input.organization_id, sharedContext)
    const people = await this.listPeople({ id: input.actor_person_id }, { take: 2 }, sharedContext)
    if (!organization || people.length !== 1) throw new MedusaError(MedusaError.Types.FORBIDDEN, "Invitation context could not be resolved")
    const recipient = normalizeEmail(input.email)
    if (!recipient || !recipient.includes("@")) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A valid recipient email is required")

    // Serialize invitations for the same recipient/organization within this transaction.
    // Reuse a valid pending invitation on resend: revoking it before a new record or
    // email exists can strand the intended recipient when either operation fails.
    const transactionManager = sharedContext.transactionManager as AdvisoryLockManager | undefined
    if (!transactionManager) throw new Error("Invitation creation requires an active database transaction")
    await transactionManager.execute(
      "SELECT pg_advisory_xact_lock(hashtext('dogruadres-invite-recipient'), hashtext(?))",
      [JSON.stringify([organization.id, recipient])]
    )
    const pending = await this.listInvitations({
      organization_id: organization.id,
      recipient_email: recipient,
      status: "pending",
    }, { take: 100 }, sharedContext)
    if (pending.length >= 100) throw new Error("Invitation state requires authorized review")
    const active = pending.filter((item) => item.expires_at.getTime() > Date.now())
    if (active.length > 1) throw new Error("Multiple active invitations require authorized review")
    if (active.length === 1) {
      const existing = active[0]
      // A secret rotation may have invalidated this deterministic link.
      // Never report a resend as sent when the stored hash does not match.
      if (existing.role !== input.role ||
          !invitationTokenMatches(deriveInvitationToken(existing.id), existing.token_hash)) {
        throw new Error("Existing invitation cannot be safely resent")
      }
      return existing
    }

    // The placeholder is replaced inside this transaction. The plaintext token is
    // derived from the invitation id and is never returned by the workflow step.
    const [invitation] = await this.createInvitations([{
      organization_id: organization.id,
      created_by_person_id: people[0].id,
      recipient_email: recipient,
      role: input.role,
      token_hash: hashInvitationToken(randomBytes(32).toString("hex")),
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }], sharedContext)
    const token = deriveInvitationToken(invitation.id)
    const updated = await this.updateInvitations({ id: invitation.id, token_hash: hashInvitationToken(token) }, sharedContext)
    await this.persistAuditEventsWithOutbox_([{
      actor_id: input.actor_id,
      actor_type: input.actor_type,
      actor_person_id: input.actor_person_id,
      role_context: actorMembership.role,
      organization_id: organization.id,
      action: "organization.invitation_created",
      module: DOGRUADRES_AUDIT_MODULE,
      resource: "invitation",
      target_id: invitation.id,
      new_values: { role: input.role, expires_at: updated.expires_at },
      occurred_at: new Date(),
    }], sharedContext)
    return updated
  }

  @InjectTransactionManager()
  async revokeOrganizationInvitation(
    input: Readonly<{ organization_id: string; invitation_id: string; actor_person_id: string; actor_type: string; actor_id: string }>,
    @MedusaContext() sharedContext: Context = {}
  ) {
    const actorMembership = await this.getActiveMembership(input.actor_person_id, input.organization_id, sharedContext)
    const invitation = await this.getInvitationInOrganization(input.invitation_id, input.organization_id, sharedContext)
    if (!actorMembership || !["owner", "admin"].includes(actorMembership.role)) throw new MedusaError(MedusaError.Types.FORBIDDEN, "Active Owner or Admin membership is required")
    if (!invitation) throw new Error("Pending invitation not found")
    await this.lockInvitation_(invitation.id, sharedContext)
    const current = await this.getInvitationInOrganization(invitation.id, input.organization_id, sharedContext)
    if (!current || current.status !== "pending" || current.expires_at.getTime() <= Date.now()) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pending invitation not found")
    const updated = await this.updateInvitations({ id: current.id, status: "revoked", revoked_at: new Date() }, sharedContext)
    await this.persistAuditEventsWithOutbox_([{
      actor_id: input.actor_id,
      actor_type: input.actor_type,
      actor_person_id: input.actor_person_id,
      role_context: actorMembership.role,
      organization_id: input.organization_id,
      action: "organization.invitation_revoked",
      module: DOGRUADRES_AUDIT_MODULE,
      resource: "invitation",
      target_id: invitation.id,
      previous_values: { status: current.status },
      new_values: { status: "revoked" },
      occurred_at: new Date(),
    }], sharedContext)
    return updated
  }

  @InjectTransactionManager()
  async acceptOrganizationInvitation(
    input: Readonly<{ token: string; email: string; email_verified: boolean; actor: ActorReference }>,
    @MedusaContext() sharedContext: Context = {}
  ) {
    if (!input.email_verified) throw new MedusaError(MedusaError.Types.FORBIDDEN, "A verified recipient email is required")
    const email = normalizeEmail(input.email)
    const tokenHash = hashInvitationToken(input.token)
    const initialMatches = await this.listInvitations({ token_hash: tokenHash }, { take: 2 }, sharedContext)
    const initialInvitation = initialMatches.length === 1 ? initialMatches[0] : null
    if (!initialInvitation) throw new MedusaError(MedusaError.Types.FORBIDDEN, "Invitation is invalid, expired, revoked, or already used")
    await this.lockInvitation_(initialInvitation.id, sharedContext)
    const invitations = await this.listInvitations({ id: initialInvitation.id, token_hash: tokenHash }, { take: 2 }, sharedContext)
    const invitation = invitations.length === 1 ? invitations[0] : null
    if (!invitation || !mayAcceptInvitation({
      status: invitation.status,
      expiresAt: invitation.expires_at,
      recipientEmail: invitation.recipient_email,
      verifiedEmail: input.email_verified ? email : null,
      tokenMatches: invitationTokenMatches(input.token, invitation.token_hash),
      now: new Date(),
    })) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Invitation is invalid, expired, revoked, or already used")
    }
    const person = await this.ensureActorPerson_(input.actor, input.actor, sharedContext)
    await this.lockMembership_(person.id, invitation.organization_id, sharedContext)
    // Read after the shared lock: a different invitation may have activated the
    // same membership while we waited. Reject it before any membership/audit write.
    const existing = await this.listMemberships({ person_id: person.id, organization_id: invitation.organization_id }, { take: 2 }, sharedContext)
    if (existing.length > 1 || existing[0]?.status === "active") {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "An active membership for this Person and Organization already exists")
    }
    const [membership] = existing.length
      ? [await this.updateMemberships({
          id: existing[0].id,
          role: invitation.role,
          status: "active",
          protected_owner: false,
          revoked_at: null,
        }, sharedContext)]
      : await this.createMemberships([{
          person_id: person.id,
          organization_id: invitation.organization_id,
          role: invitation.role,
          status: "active",
          protected_owner: false,
        }], sharedContext)
    const accepted = await this.updateInvitations({
      id: invitation.id,
      status: "accepted",
      accepted_at: new Date(),
      accepted_by_person_id: person.id,
    }, sharedContext)
    await this.persistAuditEventsWithOutbox_([{
      actor_id: input.actor.actor_id,
      actor_type: input.actor.actor_type,
      actor_person_id: person.id,
      role_context: invitation.role,
      organization_id: invitation.organization_id,
      action: "organization.invitation_accepted",
      module: DOGRUADRES_AUDIT_MODULE,
      resource: "invitation",
      target_id: invitation.id,
      new_values: { status: accepted.status, membership_id: membership.id },
      occurred_at: new Date(),
    }], sharedContext)
    return { membership, invitation: accepted }
  }

  @InjectTransactionManager()
  async getActiveSmtpConfig(@MedusaContext() context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    return new PlatformSmtpPersistence(sql).readSettings(true)
  }

  @InjectTransactionManager()
  async personalPlatformSmtpSettings(token: string, @MedusaContext() context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    const sessions = new IdentitySessions(sql)
    const staff = await sessions.staff(token, "platform.smtp.manage", "platform")
    if (!staff) return null
    const persistence = new PlatformSmtpPersistence(sql)
    const settings = await persistence.readSettings(false)
    return {
      settings,
      can_manage: true,
    }
  }

  @InjectTransactionManager()
  async personalUpdatePlatformSmtpSettings(
    token: string,
    input: UpdateSmtpSettingsInput,
    @MedusaContext() context: Context = {}
  ) {
    const sql = securitySql(context.transactionManager)
    const sessions = new IdentitySessions(sql)
    const staff = await sessions.staff(token, "platform.smtp.manage", "platform")
    if (!staff) return null
    const actor: SmtpAuditActor = {
      person_id: staff.person_id,
      actor_type: staff.actor_type as SmtpAuditActor["actor_type"],
      actor_id: staff.actor_id,
    }
    const persistence = new PlatformSmtpPersistence(sql)
    return persistence.updateSettings(input, actor)
  }

  @InjectTransactionManager()
  async personalTestPlatformSmtpSettings(
    token: string,
    targetRecipient: string,
    candidateSettings?: Partial<UpdateSmtpSettingsInput>,
    @MedusaContext() context: Context = {}
  ) {
    const sql = securitySql(context.transactionManager)
    const sessions = new IdentitySessions(sql)
    const staff = await sessions.staff(token, "platform.smtp.manage", "platform")
    if (!staff) return null

    const persistence = new PlatformSmtpPersistence(sql)
    const current = await persistence.readSettings(true)

    const testHost = candidateSettings?.host || current.host
    const testPort = candidateSettings?.port || current.port
    const testSecurity = candidateSettings?.security || current.security
    const testUsername = candidateSettings?.username !== undefined ? candidateSettings.username : current.username
    const testPassword = candidateSettings?.password !== undefined ? candidateSettings.password : current.password
    const testFromEmail = candidateSettings?.from_email || current.from_email
    const testFromName = candidateSettings?.from_name !== undefined ? candidateSettings.from_name : current.from_name

    return sendSmtpEmail(
      {
        to: targetRecipient,
        subject: "DogruAdres Platform SMTP Test Mesaji",
        text: `DogruAdres Platform SMTP Yapilandirma Testi basariyla tamamlandi.\n\nZaman: ${new Date().toISOString()}\nSunucu: ${testHost}:${testPort}`,
        html: `<div style="font-family:sans-serif;padding:20px;border:1px solid #ddd;border-radius:6px;"><h3>DogruAdres Platform SMTP Test</h3><p>SMTP Yapilandirma Testi basariyla tamamlandi.</p><p><strong>Sunucu:</strong> ${testHost}:${testPort}</p><p><strong>Zaman:</strong> ${new Date().toISOString()}</p></div>`,
      },
      {
        enabled: true,
        host: testHost,
        port: testPort,
        security: testSecurity,
        username: testUsername || undefined,
        password: testPassword || undefined,
        fromEmail: testFromEmail,
        fromName: testFromName || undefined,
      }
    )
  }

  // B22: legal ownership candidates are NOT a grant, and never leave this
  // module without separately verified live native Seller/Member authority.
  @InjectTransactionManager()
  async personalLegalSellerIds(token: string, organizationId: string,
    @MedusaContext() context: Context = {}) {
    return authorizedLegalSellerIds(securitySql(context.transactionManager), token, organizationId)
  }

  // ---------------------------------------------------------------------------
  // B20: per-Person persistent launcher preference
  // ---------------------------------------------------------------------------
  // KNOWN_APP_IDS: closed server allowlist of the two launcher targets approved
  // under B20 PO decision (issue #203 comment 6470700012).
  // Storefront is always present. Vendor Panel shown only for verified Sellers.
  // Unknown IDs are silently dropped; no entitlement is ever produced.
  static readonly KNOWN_APP_IDS: ReadonlySet<string> = new Set(['storefront', 'vendor'])

  @InjectTransactionManager()
  async getLauncherPreference(token: string, @MedusaContext() context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    const session = await new IdentitySessions(sql).current(token)
    if (!session) return null
    const rows = await sql.execute(
      `select app_ids,collapsed_ids,version from da_launcher_preference where person_id=?`,
      [session.person_id]
    ) as Array<{app_ids: unknown; collapsed_ids: unknown; version: number}>
    const row = rows[0]
    const parseJsonb = (v: unknown): string[] => {
      if (Array.isArray(v)) return v as string[]
      if (typeof v === 'string') { try { return JSON.parse(v) } catch { return [] } }
      return []
    }
    return {
      person_id: session.person_id,
      app_ids: row ? parseJsonb(row.app_ids) : [],
      collapsed_ids: row ? parseJsonb(row.collapsed_ids) : [],
      version: row ? row.version : 0,
    }
  }

  @InjectTransactionManager()
  async saveLauncherPreference(
    token: string,
    rawAppIds: string[],
    rawCollapsedIds: string[],
    expectedVersion: number,
    @MedusaContext() context: Context = {}
  ) {
    const sql = securitySql(context.transactionManager)
    const session = await new IdentitySessions(sql).current(token, true)
    if (!session) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, 'Session required')
    const known = DogruAdresAccessModuleService.KNOWN_APP_IDS
    const seen = new Set<string>()
    const appIds = rawAppIds.filter(id => {
      if (typeof id !== 'string' || !known.has(id) || seen.has(id)) return false
      seen.add(id); return true
    })
    const collSeen = new Set<string>()
    const collapsedIds = rawCollapsedIds.filter(id => {
      if (typeof id !== 'string' || !known.has(id) || collSeen.has(id)) return false
      collSeen.add(id); return true
    })
    if (expectedVersion < 0 || !Number.isInteger(expectedVersion)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Invalid version')
    }
    const personId = session.person_id
    if (expectedVersion === 0) {
      await sql.execute(
        `insert into da_launcher_preference(id,person_id,app_ids,collapsed_ids,version,updated_at)
         values(?,?,?,?,1,now())
         on conflict(person_id) do nothing`,
        [randomUUID(), personId, JSON.stringify(appIds), JSON.stringify(collapsedIds)]
      )
      const stored = await sql.execute(
        `select app_ids,collapsed_ids,version from da_launcher_preference where person_id=?`,
        [personId]
      ) as Array<{app_ids: unknown; collapsed_ids: unknown; version: number}>
      const pa = (v: unknown): string[] => Array.isArray(v) ? v as string[] : typeof v==='string' ? (() => { try { return JSON.parse(v) } catch { return [] } })() : []
      return { app_ids: pa(stored[0].app_ids), collapsed_ids: pa(stored[0].collapsed_ids), version: stored[0].version }
    }
    const updated = await sql.execute(
      `update da_launcher_preference
         set app_ids=?,collapsed_ids=?,version=version+1,updated_at=now()
         where person_id=? and version=?
         returning app_ids,collapsed_ids,version`,
      [JSON.stringify(appIds), JSON.stringify(collapsedIds), personId, expectedVersion]
    ) as Array<{app_ids: unknown; collapsed_ids: unknown; version: number}>
    if (!updated.length) {
      throw new MedusaError(MedusaError.Types.CONFLICT, 'Launcher preference version conflict — reload and retry')
    }
    const pu2 = (v: unknown): string[] => Array.isArray(v) ? v as string[] : typeof v==='string' ? (() => { try { return JSON.parse(v) } catch { return [] } })() : []
    return { app_ids: pu2(updated[0].app_ids), collapsed_ids: pu2(updated[0].collapsed_ids), version: updated[0].version }
  }
}