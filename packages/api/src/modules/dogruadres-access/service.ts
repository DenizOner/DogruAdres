/// <reference lib="es2022.intl" />
import { claimAuditDelivery, loadClaimedAuditEvent, acknowledgeAuditDelivery, deferAuditDelivery, quarantineAuditDelivery, type DeliveryManager } from "./audit-delivery"
import type { OutboxClaim, DeliveryErrorCode } from "./audit-delivery-policy"
import { hasRecentMfaProof } from "./mfa-management"
import {
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
  MedusaError,
  toHandle,
} from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import { canManageMembership, isOwnerDemotionAllowed, deriveInvitationToken, hashInvitationToken, invitationTokenMatches, normalizeEmail } from "./security"
import { ActorMapping, AuditEvent, AuditOutbox, Invitation, Membership, Organization, Person } from "./models"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { mayAcceptInvitation } from "./invitation-policy"
import { IdentitySessions, securitySql, isCurrentProtectedOwner, type BrowserMfaPurpose, IdentityAccessDenied, mfaRuntimeEnforced, type SecuritySql } from "./identity-session"
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
import { authorizedLegalSellerIds, authorizedProductEditScope, platformApprovedSellerIds, verifiedStoreProductEditGrant } from "./legal-store-ownership"
import {authorizedBuyerOrganization,verifiedBuyerPurchaseGrant} from "./buyer-permission"
import { organizationActionAllowed, ownerRoleAllows } from "./role-action-policy"
import { validStoreName, validStoreHandle, STORE_RENAME_RISK_VERSION } from "./store-name-policy"
import {eligibleOwner,readStoreApplications,storeRequestFingerprint,type StoreRequest} from "./store-application"
import {readStoreDrafts,authorizedStoreDraftActor,verifiedStoreDraftGrant,storeDraftPayload,type StoreDraftInput} from "./store-application-draft"
import {
  listOrganizationDrafts,
  saveOrganizationDraft,
  withdrawOrganizationDraft,
  saveOrganizationDocument,
  submitOrganizationApplication,
  readOrganizationApplicationDocument,
  readOrganizationApplicationReviewPreview,
  TaxCertificateReviewUnavailable,
  listSubmittedOrganizationApplications,
  reviewOrganizationApplication,
  type ReviewApplicationPayload,
  type DraftPayload,
  type WithdrawDraftPayload,
  type UploadDocumentPayload,
  type SubmitApplicationPayload,
  type OrganizationDraftCursor,
} from "./organization-application"

export type ActorReference = Readonly<{ actor_type: string; actor_id: string }>

type ProvisionOrganizationInput = Readonly<{
  name: string
  provisioned_by: ActorReference
  initial_owners: ActorReference[]
  staff_grant_id?: string
  staff_task?: "organization.provision"|"organization.review"
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

// Historical invitation contact may distinguish Members only if SQL
// accepts it as a conservative ASCII address. The database computes the
// single normalized value for BOTH Owner-visible contact and the cross-page
// grant/revoke collision comparisons; never run a second JS validator over
// the result. New invitations retain their native Medusa/Zod ingress check.
// The C collation gives POSIX ASCII ranges stable meaning across locales.
const acceptedInviteEmailPattern="^[A-Za-z0-9_+%-]+([.][A-Za-z0-9_+%-]+)*@[A-Za-z0-9]+([-][A-Za-z0-9]+)*([.][A-Za-z0-9]+([-][A-Za-z0-9]+)*)*[.][A-Za-z]{2,}$"
// Only literal, source-controlled SQL table aliases are accepted.
function acceptedInviteSqlLabel(alias:"inv"|"oinv"):string {
  return `case when length(btrim(${alias}.recipient_email))<=254
    and btrim(${alias}.recipient_email) collate "C" ~ '${acceptedInviteEmailPattern}'
    then lower(btrim(${alias}.recipient_email) collate "C") else '' end`
}

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
    // Match the active first-party login proof server-side, not a browser claim.
    // A primary Customer is a verified technical actor, never an unlinkable
    // secondary. Protect every active login actor of this Person.
    return sql.execute(`select b.id,b.actor_type,b.actor_id,b.revoked_at,
      exists(select 1 from da_login_binding l
        where l.person_id=b.person_id and l.auth_identity_id=b.auth_identity_id
          and l.actor_type=b.actor_type and l.actor_id=b.actor_id
          and l.verified_at is not null and l.revoked_at is null) as is_primary
      from da_verified_actor_binding b where b.person_id=?
      order by b.verified_at`,[s.person_id])
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
    const db=securitySql(context.transactionManager)
    const decision=await new IdentitySessions(db).organizations(token,org)
    if(!decision||decision.organizations.length!==1||
       !organizationActionAllowed(decision.organizations[0].role,"membership.list",
         decision.organizations[0].role==="owner" &&
           await isCurrentProtectedOwner(db,decision.person_id,org),false))
      throw new MedusaError(MedusaError.Types.FORBIDDEN,'Access denied')
    return this.listMemberships({organization_id:org,status:'active'},{select:['id','person_id','role','status','protected_owner']},context)
  }
  @InjectTransactionManager()
  async personalRevokeMembership(token:string,org:string,membership:string,@MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager)
    await sql.execute(`select pg_advisory_xact_lock(hashtext('dogruadres-owner-change'),hashtext(?))`,[org])
    const sessions=new IdentitySessions(sql),identity=await sessions.current(token,true)
    const decision=identity?await sessions.organizations(token,org):null
    if(!identity||!decision||decision.organizations.length!==1||
       !organizationActionAllowed(decision.organizations[0].role,"membership.manage",
         decision.organizations[0].role==="owner" &&
           await isCurrentProtectedOwner(sql,identity.person_id,org),false))
      throw new MedusaError(MedusaError.Types.FORBIDDEN,'Access denied')
    const result=await this.changeMembership({organization_id:org,membership_id:membership,actor_person_id:identity.person_id,actor_type:identity.actor_type,actor_id:identity.actor_id,status:'revoked'},context)
    return {id:result.id,status:result.status}
  }
  @InjectTransactionManager()
  async personalChangeMembershipRole(token:string,org:string,membership:string,role:'member'|'admin',@MedusaContext() context:Context={}) {
    // Direct service calls must also refuse retired Organization Admin.
    // Historical Admin rows may only be reduced to ordinary Member.
    if(role==='admin')throw new MedusaError(MedusaError.Types.FORBIDDEN,'Access denied')
    if(role!=='member')throw new MedusaError(MedusaError.Types.INVALID_DATA,'Invalid role')
    const sql=securitySql(context.transactionManager)
    await sql.execute(`select pg_advisory_xact_lock(hashtext('dogruadres-owner-change'),hashtext(?))`,[org])
    const sessions=new IdentitySessions(sql),identity=await sessions.current(token,true)
    const decision=identity?await sessions.organizations(token,org):null
    if(!identity||!decision||decision.organizations.length!==1||
       !organizationActionAllowed(decision.organizations[0].role,"membership.manage",
         decision.organizations[0].role==="owner" &&
           await isCurrentProtectedOwner(sql,identity.person_id,org),false))
      throw new MedusaError(MedusaError.Types.FORBIDDEN,'Access denied')
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

  /** B07 promotion uses the current protected membership and transaction.
   * Owner removal/downgrade must follow the separately approved strong
   * verification, notification and 10+20 day process (#39), not this old
   * immediate Owner->Admin action. */
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
    if (!identity || decision?.organizations[0]?.role !== 'owner' ||
        !organizationActionAllowed("owner","membership.manage",
          await isCurrentProtectedOwner(sql,identity.person_id,org),false)) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, 'Access denied')
    }
    // Do not let an old strong session bypass the approved Owner removal
    // workflow, even when another active protected Owner exists.
    if (role === 'admin') {
      throw new MedusaError(MedusaError.Types.FORBIDDEN,
        'Protected Owner reduction requires the approved safety workflow')
    }
    const target = await this.getMembershipInOrganization(membership, org, context)
    if (!target) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Membership not found in the selected Organization')
    }
    // Explicit B07 operation states, not a backdoor to revoked membership
    // reactivation or ordinary B06 role controls.
    if (target.status !== 'active' || target.protected_owner || target.role === 'owner') {
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
  async personalOrganizationApplicationDrafts(token:string,cursor?:OrganizationDraftCursor,@MedusaContext() context:Context={}) {
    return listOrganizationDrafts(securitySql(context.transactionManager),token,cursor)
  }

  @InjectTransactionManager()
  async personalSaveOrganizationApplicationDraft(token:string,input:DraftPayload,@MedusaContext() context:Context={}) {
    return saveOrganizationDraft(securitySql(context.transactionManager),token,input)
  }

  @InjectTransactionManager()
  async personalWithdrawOrganizationApplicationDraft(token:string,input:WithdrawDraftPayload,@MedusaContext() context:Context={}) {
    return withdrawOrganizationDraft(securitySql(context.transactionManager),token,input)
  }

  @InjectTransactionManager()
  async personalSaveOrganizationApplicationDocument(
    token:string,input:UploadDocumentPayload,overrideRoot?:string,@MedusaContext() context:Context={}
  ) {
    return saveOrganizationDocument(securitySql(context.transactionManager),token,input,overrideRoot)
  }

  @InjectTransactionManager()
  async personalSubmitOrganizationApplication(
    token:string,input:SubmitApplicationPayload,overrideRoot?:string,@MedusaContext() context:Context={}
  ) {
    return submitOrganizationApplication(securitySql(context.transactionManager),token,input,overrideRoot)
  }

  @InjectTransactionManager()
  async personalReadOrganizationApplicationDocument(
    token:string,applicationId:string,overrideRoot?:string,@MedusaContext() context:Context={}
  ) {
    return readOrganizationApplicationDocument(securitySql(context.transactionManager),token,applicationId,overrideRoot)
  }

  @InjectTransactionManager()
  async personalReadOrganizationApplicationReviewPreview(
    token:string,applicationId:string,@MedusaContext() context:Context={}
  ) {
    return readOrganizationApplicationReviewPreview(
      securitySql(context.transactionManager),token,applicationId)
  }

  @InjectTransactionManager()
  async personalSubmittedOrganizationApplications(
    token:string,cursor?:OrganizationDraftCursor,@MedusaContext() context:Context={}
  ) {
    return listSubmittedOrganizationApplications(securitySql(context.transactionManager),token,cursor)
  }

  @InjectTransactionManager()
  async personalReviewOrganizationApplication(
    token:string,input:ReviewApplicationPayload,@MedusaContext() context:Context={}
  ) {
    const sql=securitySql(context.transactionManager)
    return reviewOrganizationApplication(sql,token,input,async request=>{
      // Revalidate the exact current private file at the moment of approval.
      // An existing metadata row is not evidence of a still-readable document.
      // Never use the applicant's raw download as the review path.
      // Recheck file integrity and live ClamAV identity under the Foundation
      // transaction lock. Rescan or rebuild the isolated preview only when
      // the cached security evidence is stale or invalid.
      const preview=await readOrganizationApplicationReviewPreview(
        sql,token,request.applicationId)
      if(!preview?.content?.length)throw new TaxCertificateReviewUnavailable()

      // The applicant may be offline, but must still be an ACTIVE canonical
      // Person backed by a CURRENT verified native actor, not merely an ID.
      const candidates=await sql.execute(`select actor_type,actor_id
        from da_login_binding where person_id=?
        and verified_at is not null and revoked_at is null for share`,
        [request.applicantPersonId])
      if(candidates.length!==1)throw new IdentityAccessDenied()
      const ownerActor:ActorReference={
        actor_type:candidates[0].actor_type,actor_id:candidates[0].actor_id
      }
      const verified=await this.verifyProvisionOwnerActors_(sql,[ownerActor])
      if(verified.size!==1||!verified.has(request.applicantPersonId))
        throw new IdentityAccessDenied()

      // Use the same existing Foundation native Organization/Owner workflow
      // as ordinary platform provisioning. The scoped review permission is
      // valid ONLY for this already-submitted, independently approved record.
      const result=await this.provisionOrganization({
        name:request.legalName,
        initial_owners:[ownerActor],
        provisioned_by:{
          actor_type:request.reviewerActorType,actor_id:request.reviewerActorId
        },
        staff_grant_id:request.reviewerGrantId,
        staff_task:"organization.review",
      },context)
      const manager=context.transactionManager
      if(!manager||typeof manager!=="object"||!("flush" in manager)||
        typeof manager.flush!=="function")
        throw new Error("Foundation transaction manager unavailable")
      await manager.flush()
      const updated=await sql.execute(`update da_organization
        set tax_identifier=?,updated_at=clock_timestamp()
        where id=? and tax_identifier is null returning id`,
        [request.taxIdentifier,result.organization.id])
      if(updated.length!==1)throw new IdentityAccessDenied()

      // Preserve the canonical Foundation security delivery for native
      // Organization/Owner events in the SAME transaction.
      await sql.execute(`insert into da_security_outbox(id,audit_event_id,created_at)
        select 'security_'||id,id,clock_timestamp() from da_audit_event
        where organization_id=? and action in
        ('organization.provisioned','organization.owner_assigned')
        on conflict(audit_event_id) do nothing`,[result.organization.id])
      return {organizationId:result.organization.id}
    })
  }

  @InjectTransactionManager()
  async personalNotifications(token: string, offset: number, organization?: string, @MedusaContext() context: Context = {}) {
    return new PersonalNotifications(securitySql(context.transactionManager)).list(token, offset, organization)
  }

  @InjectTransactionManager()
  async readPersonalNotification(token: string, id: string, organization?: string, @MedusaContext() context: Context = {}) {
    return new PersonalNotifications(securitySql(context.transactionManager)).read(token, id, organization)
  }

  /**
   * First-party registration: native Customer is ONLY a technical actor.
   * Caller must independently authenticate the exact native actor/identity.
   * Foundation Person, mapping, binding and audit commit in one transaction.
   */
  @InjectTransactionManager()
  async personalRegisterCustomer(
    authIdentityId: string, customerId: string, mobile: string, displayName: string,
    @MedusaContext() context: Context = {}
  ) {
    if (!/^authid_[A-Za-z0-9_-]+$/.test(authIdentityId) ||
        !/^cus_[A-Za-z0-9_-]+$/.test(customerId) ||
        !/^\+?[0-9]{6,20}$/.test(mobile) ||
        typeof displayName !== "string" || displayName.length > 101)
      throw new IdentityAccessDenied()
    const sql = securitySql(context.transactionManager)
    await sql.execute(`select pg_advisory_xact_lock(hashtext('da-person-signup'),hashtext(?))`,[authIdentityId])
    const bindings = await sql.execute(`select person_id,actor_type,actor_id,revoked_at
      from da_login_binding where auth_identity_id=? for update`,[authIdentityId])
    const links = await this.listActorMappings(
      {actor_type:"customer",actor_id:customerId},{take:2},context)
    // Never overwrite another Person, resurrect a revoked binding, or link by email.
    if (bindings.length || links.length) {
      if (bindings.length===1 && links.length===1 && bindings[0].revoked_at===null &&
          bindings[0].actor_type==="customer" && bindings[0].actor_id===customerId &&
          bindings[0].person_id===links[0].person_id) {
        // A matching technical actor is not proof that the current Person is
        // active or already has the required registration contact. Never
        // accept a disabled/deleted/incomplete legacy Person as registered.
        const existing=await sql.execute(`select mobile_phone from da_person
          where id=? and disabled_at is null and deleted_at is null for update`,
          [bindings[0].person_id])
        if(existing.length===1 && typeof existing[0].mobile_phone==="string" &&
           /^\+?[0-9]{6,20}$/.test(existing[0].mobile_phone)) {
          // Primary Customer delegation must have its own active verified
          // binding. Never silently resurrect a missing or revoked proof.
          const proofs=await sql.execute(`select person_id,auth_identity_id,actor_id,revoked_at
            from da_verified_actor_binding where person_id=? and actor_type='customer'
            for update`,[bindings[0].person_id])
          if(proofs.length===1 && proofs[0].person_id===bindings[0].person_id &&
             proofs[0].auth_identity_id===authIdentityId &&
             proofs[0].actor_id===customerId && proofs[0].revoked_at===null)
            return {created:false as const}
        }
      }
      throw new IdentityAccessDenied()
    }
    const [person] = await this.createPeople([{
      display_name:displayName, mobile_phone:mobile, mobile_version:1,
    }],context)
    if (!person?.id) throw new IdentityAccessDenied()
    await this.createActorMappings([{
      actor_type:"customer", actor_id:customerId,person_id:person.id,
      created_by_actor_type:"customer", created_by_actor_id:customerId,
    }],context)
    // Native MedusaService writes may still be pending in the EntityManager.
    // Flush Person and mapping BEFORE inserting the raw SQL login-binding FK.
    // The same enclosing Foundation transaction owns commit or rollback.
    const manager=context.transactionManager
    if(!manager || typeof manager!=="object" || !("flush" in manager) || typeof manager.flush!=="function")
      throw new Error("Foundation transaction manager unavailable")
    await manager.flush()
    await sql.execute(`insert into da_login_binding
      (auth_identity_id,person_id,actor_type,actor_id,verified_at)
      values (?,?,'customer',?,clock_timestamp())`,
      [authIdentityId,person.id,customerId])
    // The first-party native password/MFA proof establishes this PRIMARY
    // technical Customer binding. Reuse the existing verified actor and
    // short-lived server-only credential mechanism; never infer buyer rights.
    // Both proofs share the same Foundation transaction and audit rollback.
    await sql.execute(`insert into da_verified_actor_binding
      (id,person_id,auth_identity_id,actor_type,actor_id,verified_at,proof_reference)
      values (?,?,?,'customer',?,clock_timestamp(),'primary-emailpass-registration')`,
      ["dabind_"+randomUUID(),person.id,authIdentityId,customerId])
    await this.persistAuditEventsWithOutbox_([{
      actor_person_id:person.id,actor_type:"customer",actor_id:customerId,
      action:"person.registered",module:DOGRUADRES_AUDIT_MODULE,
      resource:"person-contact",target_id:person.id,
      new_values:{contact_recorded:true,email_verification_claimed:false},
      occurred_at:new Date(),
    }],context)
    return {created:true as const}
  }

  /**
   * Canonical Person contact only. Never consult a native Customer by email:
   * an upstream actor is not proof of the Person who owns this session.
   */
  @InjectTransactionManager()
  async personalMobile(token: string, @MedusaContext() context: Context = {}) {
    const db = securitySql(context.transactionManager)
    const session = await new IdentitySessions(db).current(token, false, false)
    if (!session) return null
    const rows = await db.execute(`select mobile_phone,mobile_version from da_person
      where id=? and disabled_at is null and deleted_at is null`, [session.person_id])
    if (rows.length !== 1 || !Number.isSafeInteger(rows[0].mobile_version))
      throw new IdentityAccessDenied()
    return { mobile_phone: rows[0].mobile_phone as string|null,
      version: rows[0].mobile_version as number }
  }

  @InjectTransactionManager()
  async personalSaveMobile(
    token: string, mobile: string, expectedVersion: number,
    @MedusaContext() context: Context = {}
  ) {
    if (typeof mobile !== "string" || mobile.length < 6 || mobile.length > 20 ||
        !/^[+]?[0-9]+$/.test(mobile) ||
        !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 ||
        expectedVersion > 2147483646) throw new IdentityAccessDenied()
    const db = securitySql(context.transactionManager)
    // A fresh strong personal session is necessary to change this private
    // contact. Row and session locks protect the read / update / audit unit.
    const session = await new IdentitySessions(db).currentForPersonWrite(token)
    if (!session) return null
    const rows = await db.execute(`select mobile_phone,mobile_version from da_person
      where id=? and disabled_at is null and deleted_at is null for update`,
      [session.person_id])
    if (rows.length !== 1 || !Number.isSafeInteger(rows[0].mobile_version))
      throw new IdentityAccessDenied()
    if (rows[0].mobile_version !== expectedVersion) return { conflict: true as const }
    if (rows[0].mobile_phone === mobile)
      return { mobile_phone: mobile, version: expectedVersion }
    const changed = await db.execute(`update da_person set mobile_phone=?,
      mobile_version=mobile_version+1,updated_at=clock_timestamp()
      where id=? and disabled_at is null and deleted_at is null and mobile_version=?
      returning mobile_phone,mobile_version`,
      [mobile,session.person_id,expectedVersion])
    if (changed.length !== 1) throw new IdentityAccessDenied()
    await this.persistAuditEventsWithOutbox_([{
      actor_person_id: session.person_id,
      actor_type: session.actor_type,
      actor_id: session.actor_id,
      action: "person.mobile_updated",
      module: DOGRUADRES_AUDIT_MODULE,
      resource: "person-contact",
      target_id: session.person_id,
      // No phone number in audit, outbox, query string, or log payload.
      new_values: { contact_recorded: true },
      occurred_at: new Date(),
    }], context)
    return { mobile_phone: changed[0].mobile_phone as string,
      version: changed[0].mobile_version as number }
  }

  // Personal and observer reads must obey the same centrally adjustable
  // organization.read policy as requireOrganizationAccess. Never let a
  // narrowed Owner policy leak names or memberships through the launcher.
  private async readablePersonalOrganizations_(
    token:string,organizationId:string|undefined,touch:boolean,context:Context
  ){
    const db=securitySql(context.transactionManager)
    const result=await new IdentitySessions(db).organizations(token,organizationId,touch)
    if(!result)return null
    const visible: typeof result.organizations = []
    for(const item of result.organizations){
      if(item.role==="owner"){
        if(!organizationActionAllowed("owner","organization.read",
          await isCurrentProtectedOwner(db,result.person_id,item.id),false))continue
      }else if(item.role!=="admin"&&item.role!=="member")continue
      visible.push(item)
    }
    if(organizationId&&visible.length!==1)return null
    return {...result,organizations:visible}
  }

  @InjectTransactionManager()
  async personalOrganizations(token: string, organizationId?: string, @MedusaContext() context: Context = {}) {
    return this.readablePersonalOrganizations_(token,organizationId,true,context)
  }

  /** Current active Organization and protected Owner proof for privileged reads.
   * Ordinary Admin role alone is never a private management permission.
   */
  @InjectTransactionManager()
  async personalManagerOrganization(token:string,org:string,@MedusaContext() context:Context={}) {
    const db=securitySql(context.transactionManager)
    const decision=await new IdentitySessions(db).organizations(token,org)
    if(!decision||decision.organizations.length!==1)return null
    const role=decision.organizations[0].role
    if(role!=="owner" ||
       !await isCurrentProtectedOwner(db,decision.person_id,org))return null
    return decision
  }

  @InjectTransactionManager()
  async currentProtectedOwner(personId:string,org:string,@MedusaContext() context:Context={}) {
    return isCurrentProtectedOwner(securitySql(context.transactionManager),personId,org)
  }

  // Background privacy checks must not extend the user's idle session.
  @InjectTransactionManager()
  async observePersonalOrganizations(token: string, organizationId?: string, @MedusaContext() context: Context = {}) {
    return this.readablePersonalOrganizations_(token,organizationId,false,context)
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

  /** Recovery codes are audited in their Foundation transaction. Native
   * factor disable is only reachable after separate committed revocation. */
  @InjectTransactionManager()
  async personalManageNativeMfa(token:string,action:"recovery_codes"|"disable",operation:(identityId:string)=>Promise<unknown>,@MedusaContext() context:Context={}) {
    if(action!=="recovery_codes")return null // Closed obsolete pre-commit disable path.
    const sql=securitySql(context.transactionManager),sessions=new IdentitySessions(sql)
    const session=await sessions.current(token,true)
    if(!session)return null
    const [limits]=await sql.execute("select recent_auth_seconds from da_session_policy where id='current'")
    if(!hasRecentMfaProof(session,limits?.recent_auth_seconds))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    const store=new MfaPersistence(sql)
    await store.readPlatformPolicy()
    const actor={person_id:session.person_id,actor_type:session.actor_type as MfaAuditActor["actor_type"],actor_id:session.actor_id}
    const result=await operation(session.auth_identity_id)
    await store.recordNativeMfaAction(actor,"mfa.recovery_codes_generated")
    return {result,sessions_revoked:false}
  }

  /** Foundation revocation and mandatory audit/outbox COMMIT before native
   * factor disable. Failure leaves the native factor unchanged and the
   * strongly-authenticated browser session in its original state. */
  @InjectTransactionManager()
  async personalPrepareNativeMfaDisable(token:string,@MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager),sessions=new IdentitySessions(sql)
    const session=await sessions.current(token,true)
    if(!session)return null
    const [limits]=await sql.execute("select recent_auth_seconds from da_session_policy where id='current'")
    if(!hasRecentMfaProof(session,limits?.recent_auth_seconds))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    const store=new MfaPersistence(sql),policy=await store.readPlatformPolicy()
    if(policy.platform_mode==="required")return null
    const personal=await store.readPersonPreference(session.person_id)
    await sessions.logout(token,true)
    // Optional preference is a separate audited Foundation row in this same
    // precommit. In disabled mode the saved preference must be preserved.
    if(policy.platform_mode==="optional"&&personal.user_enabled)
      await store.setPersonPreference(session.person_id,false,personal.version,{
        person_id:session.person_id,actor_type:session.actor_type as MfaAuditActor["actor_type"],actor_id:session.actor_id
      })
    return {session_id:session.id,person_id:session.person_id,auth_identity_id:session.auth_identity_id,
      actor_type:session.actor_type as MfaAuditActor["actor_type"],actor_id:session.actor_id}
  }

  /** A second Foundation transaction holds the SAME policy advisory lock
   * as setPlatformPolicy across the native Medusa operation. The first
   * committed Person session/epoch revocation can never be rolled back
   * by a native write or completion-audit failure. */
  @InjectTransactionManager()
  async personalCompletePreparedNativeMfaDisable(
    prepared:Readonly<{session_id:string;person_id:string;auth_identity_id:string;actor_type:MfaAuditActor["actor_type"];actor_id:string}>,
    operation:(identityId:string)=>Promise<unknown>,
    @MedusaContext() context:Context={}
  ) {
    const sql=securitySql(context.transactionManager)
    // Lock the Person epoch BEFORE the shared policy lock, matching session
    // creation and staff policy updates. A concurrent full login may commit
    // after preparation but not during native completion.
    const security=await sql.execute(
      "select epoch from da_person_security where person_id=? for update",
      [prepared.person_id])
    if(security.length!==1)throw new IdentityAccessDenied()
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    const store=new MfaPersistence(sql),policy=await store.readPlatformPolicy()
    if(policy.platform_mode==="required")return null
    const rows=await sql.execute("select s.id from da_browser_session s join da_person_security e on e.person_id=s.person_id where s.id=? and s.person_id=? and s.auth_identity_id=? and s.actor_type=? and s.actor_id=? and s.status='revoked' and e.epoch>s.epoch",
      [prepared.session_id,prepared.person_id,prepared.auth_identity_id,prepared.actor_type,prepared.actor_id])
    if(rows.length!==1)throw new IdentityAccessDenied()
    // If another session was minted after precommit, do NOT disable the native
    // factor and leave that freshly authenticated browser alive. The Person
    // row lock above prevents a further session from racing past this check.
    const newer=await sql.execute(
      "select id from da_browser_session where person_id=? and status='active' and epoch=? limit 1",
      [prepared.person_id,security[0].epoch])
    if(newer.length)return null
    const result=await operation(prepared.auth_identity_id)
    await store.recordNativeMfaAction({
      person_id:prepared.person_id,actor_type:prepared.actor_type,actor_id:prepared.actor_id
    },"mfa.native_factor_disabled")
    return result
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

  /**
   * Existing native Owner evidence checks, shared by ordinary provisioning
   * and approved B22 applications. Never infer ownership from an email,
   * an applicant-submitted Person ID, or unverified actor mapping.
   */
  private async verifyProvisionOwnerActors_(
    sql:SecuritySql,owners:ActorReference[]
  ):Promise<Set<string>> {
    for (const owner of owners) {
      if (!supportedActorTypes.has(owner?.actor_type) || !owner?.actor_id) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
      }
    }

    // Deterministic advisory lock ordering matching AccountLinking (da-actor-link)
    // to serialize against concurrent linking/unlinking without deadlock.
    const actorLinkKeys = [...new Set(owners.map(o => `${o.actor_type}:${o.actor_id}`))].sort()
    for (const key of actorLinkKeys) {
      await sql.execute(`select pg_advisory_xact_lock(hashtext('da-actor-link'), hashtext(?))`, [key])
    }

    const ownerPersonIds = new Set<string>()
    for (const owner of owners) {
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

    if (ownerPersonIds.size !== owners.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Initial Owners must be distinct canonical Persons")
    }
    return ownerPersonIds
  }

  @InjectTransactionManager()
  async provisionPersonalOrganization(token: string, input: Omit<ProvisionOrganizationInput,"provisioned_by">, @MedusaContext() context:Context={}) {
    const sql=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(sql).staff(token,"organization.provision","platform")
    if(!staff)throw new MedusaError(MedusaError.Types.FORBIDDEN,"Platform staff grant and strong authentication required")

    await this.verifyProvisionOwnerActors_(sql,input.initial_owners)
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
        new_values: { name: organization.name, initial_owner_count: memberships.length, ...(input.staff_grant_id?{staff_grant_id:input.staff_grant_id,staff_task:(input.staff_task??"organization.provision"),staff_resource:"platform"}:{}) },
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
          ...(input.staff_grant_id?{staff_grant_id:input.staff_grant_id,staff_task:(input.staff_task??"organization.provision"),staff_resource:"platform"}:{}) },
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
    if (!actorMembership || !organizationActionAllowed(
          actorMembership.role,"membership.manage",
          actorMembership.role==="owner" && await isCurrentProtectedOwner(
            securitySql(sharedContext.transactionManager),input.actor_person_id,input.organization_id),false)) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Organization action permission is required")
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
      // Last-Owner protection alone is insufficient. The 30-day seniority and
      // 10+20 notice/appeal gates are not implemented on this ordinary
      // mutation route; reject before any role, audit or outbox write.
      throw new MedusaError(MedusaError.Types.FORBIDDEN,
        "Protected Owner reduction requires the approved safety workflow")
    }

    const nextRole = input.role ?? target.role
    const nextStatus = input.status ?? target.status
    const leavesOrdinaryMember=target.role==="member" &&
      (nextStatus!=="active" || nextRole!=="member")
    const membershipDb=securitySql(sharedContext.transactionManager)
    if(leavesOrdinaryMember){
      // A draft writer locks this membership FOR SHARE before acquiring its
      // per-Person grant lock. Lock the row first here (FOR UPDATE) to keep
      // concurrent Member-save / membership-revocation ordering acyclic.
      const locked=await membershipDb.execute(`select id from da_organization_membership
        where id=? and person_id=? and organization_id=? for update`,
        [target.id,target.person_id,input.organization_id])
      if(locked.length!==1)throw new IdentityAccessDenied()
      await membershipDb.execute(`select pg_advisory_xact_lock(
        hashtext('b22-store-draft-grant'),hashtext(?))`,
        [input.organization_id+":"+target.person_id])
    }
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
    if(leavesOrdinaryMember){
      // Revocation/role exit is a terminal authorization event, not a
      // temporary pause: a later invitation accepting the SAME membership ID
      // cannot resurrect an old Store draft permission.
      // Older authorized migration-ledger scopes may run membership changes
      // before this B22 optional draft-permission table is installed. No row
      // means no draft grant can exist or authorize an action. Preserve the
      // pre-existing membership route instead of throwing undefined_table.
      const installed=await membershipDb.execute(`select
        to_regclass('public.da_organization_store_draft_permission') is not null
        as present`)
      if(installed.length!==1||typeof installed[0].present!=="boolean")
        throw new IdentityAccessDenied()
      if(installed[0].present){
      const activeDraftGrant=await membershipDb.execute(`select id from da_organization_store_draft_permission
        where person_id=? and organization_id=? and membership_id=?
          and permission='store.application.draft.manage' and revoked_at is null
        for update`,[target.person_id,input.organization_id,target.id])
      if(activeDraftGrant.length>1)throw new IdentityAccessDenied()
      if(activeDraftGrant.length===1){
        const grantId=activeDraftGrant[0].id
        if(typeof grantId!=="string"||!/^dasdpg_[A-Za-z0-9_-]+$/.test(grantId)||
           !await verifiedStoreDraftGrant(
             membershipDb,target.person_id,input.organization_id,target.id))
          throw new IdentityAccessDenied()
        const [grantAudit]=await this.persistAuditEventsWithOutbox_([{
          actor_id:input.actor_id,actor_type:input.actor_type,
          actor_person_id:input.actor_person_id,role_context:actorMembership.role,
          organization_id:input.organization_id,
          action:"organization.store_draft_permission_revoked",
          module:DOGRUADRES_AUDIT_MODULE,resource:"store-draft-permission",
          target_id:target.person_id,
          previous_values:{grant_id:grantId,person_id:target.person_id,
            membership_id:target.id,permission:"store.application.draft.manage"},
          new_values:{grant_id:grantId,status:"revoked",source:"membership_exit"},
          occurred_at:new Date()
        }],sharedContext)
        if(!grantAudit?.id)throw new IdentityAccessDenied()
        await auditManager.flush()
        const retired=await membershipDb.execute(`update da_organization_store_draft_permission
          set revoked_at=clock_timestamp() where id=? and revoked_at is null
          returning id`,[grantId])
        if(retired.length!==1)throw new IdentityAccessDenied()
        await membershipDb.execute(`insert into da_notification_receipt
          (id,person_id,audit_event_id) values (?,?,?)`,
          ["danot_"+randomUUID(),target.person_id,grantAudit.id])
      }
      }
    }
    return updated
  }

  @InjectTransactionManager()
  async createOrganizationInvitation(
    input: Readonly<{ organization_id: string; actor_person_id: string; actor_type: string; actor_id: string; email: string; role: "admin" | "member" }>,
    @MedusaContext() sharedContext: Context = {}
  ) {
    // Workflow and direct module invocations cannot bypass the public
    // membership invitation schema to create a retired company Admin.
    if(input.role!=="member")
      throw new MedusaError(MedusaError.Types.FORBIDDEN,"Organization Admin invitations are not permitted")
    const actorMembership = await this.getActiveMembership(input.actor_person_id, input.organization_id, sharedContext)
    if (!actorMembership || !organizationActionAllowed(
          actorMembership.role,"invitation.manage",
          actorMembership.role==="owner" && await isCurrentProtectedOwner(
            securitySql(sharedContext.transactionManager),input.actor_person_id,input.organization_id),false)) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Organization action permission is required")
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
    if (!actorMembership || !organizationActionAllowed(
          actorMembership.role,"invitation.manage",
          actorMembership.role==="owner" && await isCurrentProtectedOwner(
            securitySql(sharedContext.transactionManager),input.actor_person_id,input.organization_id),false))
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Organization action permission is required")
    // Deny before reading a private invitation target.
    const invitation = await this.getInvitationInOrganization(input.invitation_id, input.organization_id, sharedContext)
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
    // Historical pending Admin invitations are kept for Owner inspection
    // and revocation, but must never activate an obsolete higher role.
    if(invitation.role!=="member")
      throw new MedusaError(MedusaError.Types.FORBIDDEN,"Legacy Organization Admin invitations cannot be accepted")
    // The Organization can be suspended or soft-deleted after invitation
    // issuance. Lock its live row in this SAME transaction before touching
    // Person/membership/invitation. A concurrent suspension must serialize.
    const available = await securitySql(sharedContext.transactionManager).execute(`select id
      from da_organization where id=? and status='active' and deleted_at is null
      for share`,[invitation.organization_id])
    if(available.length!==1 || available[0].id!==invitation.organization_id)
      throw new MedusaError(MedusaError.Types.FORBIDDEN,"Invitation Organization is unavailable")
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

  // B22 initial Store application: Organization Owner creates an application
  // and a direct Organization reference; only Mercur Admin approves Seller.
  @InjectTransactionManager()
  async personalStoreApplications(token:string,org:string,@MedusaContext() context:Context={}){
    const db=securitySql(context.transactionManager)
    const drafts=await readStoreDrafts(db,token,org)
    if(!drafts)return null
    // An explicitly authorized Member sees only unfinished Organization
    // drafts. Official Seller applications are an Owner-only resource.
    const applications=drafts.draft_role==="owner"?
      await readStoreApplications(db,token,org):[]
    if(!applications)return null
    const policy=await db.execute(`select store_application_enabled from da_organization
      where id=? and status='active' and deleted_at is null`,[org])
    if(policy.length!==1||typeof policy[0].store_application_enabled!=="boolean")
      return null
    return {applications,store_application_enabled:policy[0].store_application_enabled as boolean,
      draft_role:drafts.draft_role,drafts:drafts.drafts,
      has_more_drafts:drafts.has_more_drafts}
  }

  /** A save is only Organization-private input. No native Seller, irreversible
   * reservation, Store entitlement, or application submission is performed. */
  @InjectTransactionManager()
  async personalSaveStoreApplicationDraft(token:string,input:StoreDraftInput,
    @MedusaContext() context:Context={}){
    const parsed=storeDraftPayload.safeParse(input)
    if(!parsed.success)throw new IdentityAccessDenied()
    const value=parsed.data,db=securitySql(context.transactionManager)
    const actor=await authorizedStoreDraftActor(db,token,value.organization_id)
    if(!actor)return null
    await db.execute(`select pg_advisory_xact_lock(hashtext('b22-store-draft'),hashtext(?))`,
      [value.draft_id])
    const rows=await db.execute(`select organization_id,status,version
      from da_store_application_draft where id=? for update`,[value.draft_id])
    if(rows.length>1)throw new IdentityAccessDenied()
    if(rows.length&&rows[0].organization_id!==value.organization_id)return null
    if(rows.length&&rows[0].status!=="draft")return {conflict:true as const}
    const beforeVersion=rows.length?Number(rows[0].version):0
    if(!Number.isSafeInteger(beforeVersion)||beforeVersion!==value.expected_version)
      return {conflict:true as const}
    if(beforeVersion===0){
      await db.execute(`insert into da_store_application_draft
        (id,organization_id,created_by_person_id,updated_by_person_id,name,email,currency_code)
        values(?,?,?,?,?,?,?)`,
        [value.draft_id,value.organization_id,actor.person_id,actor.person_id,
          value.name,value.email,value.currency_code])
    }else{
      const updated=await db.execute(`update da_store_application_draft
        set name=?,email=?,currency_code=?,updated_by_person_id=?,
          version=version+1,updated_at=clock_timestamp()
        where id=? and organization_id=? and version=? and status='draft'
        returning id`,[value.name,value.email,value.currency_code,actor.person_id,
          value.draft_id,value.organization_id,beforeVersion])
      if(updated.length!==1)throw new IdentityAccessDenied()
    }
    // Canonical audit and outbox commit atomically with the draft. Never copy
    // name/email or free-text Store contact details to the Audit Index.
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:actor.person_id,actor_type:actor.actor_type,actor_id:actor.actor_id,
      role_context:actor.role_context,organization_id:value.organization_id,
      action:"organization.store_application_draft_saved",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-application-draft",
      target_id:value.draft_id,
      previous_values:{version:beforeVersion},
      new_values:{version:beforeVersion+1},
      occurred_at:new Date()
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    return {conflict:false as const,draft_id:value.draft_id,status:"draft" as const,
      version:beforeVersion+1}
  }

  /** Page through currently eligible Members without a company-size cap.
   * Grants are returned only for this exact page, never another Organization
   * or another Member. Native Seller/Member roles grant no draft authority.
   */
  @InjectTransactionManager()
  async personalListStoreDraftPermissions(token:string,org:string,after:string|null=null,
    @MedusaContext() context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(org)||
       (after!==null&&!/^[A-Za-z0-9_-]{1,128}$/.test(after)))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const actor=await sessions.organizations(token,org,false)
    if(!actor||actor.organizations.length!==1||actor.organizations[0].role!=="owner"||
       !organizationActionAllowed("owner","membership.list",
         await isCurrentProtectedOwner(db,actor.person_id,org),false))return null
    const cursor=after??""
    // Keyset pagination avoids an offset proportional to total company size.
    // Read one extra row for has_more, never refuse a larger organization.
    const rows=await db.execute(`select m.id as membership_id,m.person_id,
        p.display_name as member_name,${acceptedInviteSqlLabel("inv")} as invitation_email,
        case when p.mobile_phone ~ '^[+]{0,1}[0-9]{6,20}$' then p.mobile_phone else null end as mobile_phone,
        not exists (
          select 1 from da_organization_membership other
          join da_person op on op.id=other.person_id
            and op.disabled_at is null and op.deleted_at is null
          left join lateral (
            select oi.recipient_email from da_organization_invitation oi
            where oi.organization_id=other.organization_id
              and oi.accepted_by_person_id=other.person_id
              and oi.status='accepted' and oi.role='member'
              and oi.deleted_at is null
            order by oi.accepted_at desc nulls last,oi.id desc limit 1
          ) oinv on true
          where other.organization_id=m.organization_id and other.id<>m.id
            and other.role='member' and other.protected_owner=false
            and other.status='active' and other.revoked_at is null
            and other.deleted_at is null
            and lower(btrim(coalesce(op.display_name,'')))=
                lower(btrim(coalesce(p.display_name,'')))
            and ${acceptedInviteSqlLabel("oinv")}=
                ${acceptedInviteSqlLabel("inv")}
            and coalesce(case when op.mobile_phone ~ '^[+]{0,1}[0-9]{6,20}$' then op.mobile_phone end,'')=
                coalesce(case when p.mobile_phone ~ '^[+]{0,1}[0-9]{6,20}$' then p.mobile_phone end,'')
        ) as label_unique_in_organization,
        exists (
          select 1 from da_organization_store_draft_permission other_grant
          join da_organization_membership other
            on other.id=other_grant.membership_id
            and other.person_id=other_grant.person_id
            and other.organization_id=other_grant.organization_id
          join da_person op on op.id=other.person_id
            and op.disabled_at is null and op.deleted_at is null
          left join lateral (
            select oi.recipient_email from da_organization_invitation oi
            where oi.organization_id=other.organization_id
              and oi.accepted_by_person_id=other.person_id
              and oi.status='accepted' and oi.role='member'
              and oi.deleted_at is null
            order by oi.accepted_at desc nulls last,oi.id desc limit 1
          ) oinv on true
          where other.organization_id=m.organization_id and other.id<>m.id
            and other.role='member' and other.protected_owner=false
            and other.status='active' and other.revoked_at is null
            and other.deleted_at is null
            and other_grant.permission='store.application.draft.manage'
            and other_grant.revoked_at is null
            and lower(btrim(coalesce(op.display_name,'')))=
                lower(btrim(coalesce(p.display_name,'')))
            and ${acceptedInviteSqlLabel("oinv")}=
                ${acceptedInviteSqlLabel("inv")}
            and coalesce(case when op.mobile_phone ~ '^[+]{0,1}[0-9]{6,20}$' then op.mobile_phone end,'')=
                coalesce(case when p.mobile_phone ~ '^[+]{0,1}[0-9]{6,20}$' then p.mobile_phone end,'')
        ) as other_active_grant_same_label
      from da_organization_membership m
      join da_person p on p.id=m.person_id and p.disabled_at is null and p.deleted_at is null
      left join lateral (
        select i.recipient_email from da_organization_invitation i
        where i.organization_id=m.organization_id
          and i.accepted_by_person_id=m.person_id
          and i.status='accepted' and i.role='member'
          and i.deleted_at is null
        order by i.accepted_at desc nulls last,i.id desc limit 1
      ) inv on true
      where m.organization_id=? and m.role='member' and m.protected_owner=false
        and m.status='active' and m.revoked_at is null and m.deleted_at is null
        and (?='' or m.id>?)
      order by m.id limit 31`,[org,cursor,cursor])
    if(rows.length>31||rows.some(m=>typeof m.membership_id!=="string"||
       !/^[A-Za-z0-9_-]{1,128}$/.test(m.membership_id)||
       typeof m.person_id!=="string"||!/^daprs_[A-Za-z0-9_-]+$/.test(m.person_id)||
       typeof m.label_unique_in_organization!=="boolean"||
       typeof m.other_active_grant_same_label!=="boolean"))
      throw new IdentityAccessDenied()
    const has_more=rows.length>30
    // Only current Organization Members are visible to their protected Owner.
    // Use canonical phone and accepted company invitation email to distinguish
    // employees. Neither contact alone authenticates a Person, and no foreign
    // Organization or unlinked native actor contact may be disclosed.
    const members=rows.slice(0,30).map(m=>({
      membership_id:m.membership_id as string,person_id:m.person_id as string,
      // Derived solely from current eligible Members in the requested
      // Organization, including those on other pages. No Person ID is shown.
      label_unique_in_organization:m.label_unique_in_organization as boolean,
      // This flag is checked across every active member, not only this page.
      // A second indistinguishable active grant must never permit a
      // misleading person-specific revoke.
      other_active_grant_same_label:m.other_active_grant_same_label as boolean,
      member_name:typeof m.member_name==="string"&&m.member_name.trim().length>0&&
        m.member_name.trim().length<=160?m.member_name.trim():null,
      mobile_phone:typeof m.mobile_phone==="string"&&
        /^\+?[0-9]{6,20}$/.test(m.mobile_phone)?m.mobile_phone:null,
      invitation_email:typeof m.invitation_email==="string"&&
        m.invitation_email.length>0?m.invitation_email:null
    }))
    if(new Set(members.map(m=>m.membership_id)).size!==members.length||
       new Set(members.map(m=>m.person_id)).size!==members.length)
      throw new IdentityAccessDenied()
    const next_cursor=has_more?members[members.length-1].membership_id:null
    if(!members.length)return {members,grants:[],has_more:false,next_cursor:null}
    const ids=members.map(m=>m.membership_id)
    const grants=await db.execute(`select g.id,g.person_id,g.membership_id
      from da_organization_store_draft_permission g
      join da_audit_event e on e.id=g.source_audit_event_id and e.deleted_at is null
        and e.module='dogruadres-access' and e.actor_person_id=g.issued_by_person_id
        and e.organization_id=g.organization_id and e.target_id=g.person_id
        and e.action='organization.store_draft_permission_granted'
        and e.resource='store-draft-permission'
        and e.new_values->>'grant_id'=g.id
        and e.new_values->>'person_id'=g.person_id
        and e.new_values->>'membership_id'=g.membership_id
        and e.new_values->>'permission'=g.permission
      join da_audit_outbox x on x.source_audit_event_id=e.id
        and x.source_module='dogruadres-access' and x.deleted_at is null
      where g.organization_id=? and g.permission='store.application.draft.manage'
        and g.revoked_at is null and g.membership_id in (${ids.map(()=>"?").join(",")})
      order by g.id limit 31`,[org,...ids])
    if(grants.length>30||grants.some(g=>typeof g.id!=="string"||
       !/^dasdpg_[A-Za-z0-9_-]+$/.test(g.id)||
       typeof g.person_id!=="string"||!/^daprs_[A-Za-z0-9_-]+$/.test(g.person_id)||
       typeof g.membership_id!=="string"||
       !/^[A-Za-z0-9_-]{1,128}$/.test(g.membership_id)||
       !members.some(m=>m.membership_id===g.membership_id&&m.person_id===g.person_id))||
       new Set(grants.map(g=>g.person_id)).size!==grants.length)
      throw new IdentityAccessDenied()
    return {members,grants,has_more,next_cursor}
  }

  /** Same Foundation transaction, provenance, and Owner guard as the existing
   * buyer permission writer. The immutable Owner group itself is unchanged.
   */
  @InjectTransactionManager()
  async personalChangeStoreDraftPermission(
    token:string,input:{action:"grant"|"revoke";organization_id:string;membership_id:string},
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^[A-Za-z0-9_-]{1,128}$/.test(input.membership_id)||
       !["grant","revoke"].includes(input.action))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const actor=await sessions.current(token,true,false)
    if(!actor)return null
    const organization=await sessions.organizations(token,input.organization_id,false)
    if(!organization||organization.person_id!==actor.person_id||
       organization.organizations.length!==1||organization.organizations[0].role!=="owner"||
       !organizationActionAllowed("owner","membership.manage",
         await isCurrentProtectedOwner(db,actor.person_id,input.organization_id),false))
      return null
    const target=await db.execute(`select m.person_id from da_organization_membership m
      join da_person p on p.id=m.person_id
      join da_organization o on o.id=m.organization_id and o.status='active' and o.deleted_at is null
      where m.id=? and m.organization_id=? and m.role='member'
        and m.protected_owner=false and m.revoked_at is null and m.deleted_at is null
        ${input.action==="grant"?"and m.status='active' and p.disabled_at is null and p.deleted_at is null":""}
      for share of m,p,o`,[input.membership_id,input.organization_id])
    if(target.length!==1||typeof target[0].person_id!=="string"||
       !/^daprs_[A-Za-z0-9_-]+$/.test(target[0].person_id))return null
    // Membership identity and Owner authority are checked on the live records.
    // Personal phone changes alone never change which Member is the target.
    const personId=target[0].person_id as string
    // A revoked grant cannot authorize an in-flight draft: both paths take
    // the identical transaction-scoped lock before inspecting the grant.
    await db.execute(`select pg_advisory_xact_lock(
      hashtext('b22-store-draft-grant'),hashtext(?))`,
      [input.organization_id+":"+personId])
    const active=await db.execute(`select id,membership_id
      from da_organization_store_draft_permission
      where person_id=? and organization_id=?
        and permission='store.application.draft.manage' and revoked_at is null
      for update`,[personId,input.organization_id])
    if(active.length>1||active.some(g=>typeof g.id!=="string"||
        !/^dasdpg_[A-Za-z0-9_-]+$/.test(g.id)||
        typeof g.membership_id!=="string"))throw new IdentityAccessDenied()
    if(input.action==="grant"){
      // A current protected Owner cannot grant to an unidentifiable legacy
      // employee, even by a forged direct HTTP POST. Names alone are never
      // enough: at least a valid recorded phone or accepted invitation email
      // and a distinct visible label within this entire Organization are
      // required. The target Person row is already locked by the transaction.
      const readable=await db.execute(`select p.display_name,
          p.mobile_phone,${acceptedInviteSqlLabel("inv")} as recipient_email,
          exists(
            select 1 from da_organization_membership other
            join da_person op on op.id=other.person_id
              and op.disabled_at is null and op.deleted_at is null
            left join lateral (
              select oi.recipient_email from da_organization_invitation oi
              where oi.organization_id=other.organization_id
                and oi.accepted_by_person_id=other.person_id
                and oi.status='accepted' and oi.role='member'
                and oi.deleted_at is null
              order by oi.accepted_at desc nulls last,oi.id desc limit 1
            ) oinv on true
            where other.organization_id=m.organization_id and other.id<>m.id
              and other.role='member' and other.protected_owner=false
              and other.status='active' and other.revoked_at is null
              and other.deleted_at is null
              and lower(btrim(coalesce(op.display_name,'')))=
                  lower(btrim(coalesce(p.display_name,'')))
              and ${acceptedInviteSqlLabel("oinv")}=
                  ${acceptedInviteSqlLabel("inv")}
              and coalesce(case when op.mobile_phone ~ '^[+]{0,1}[0-9]{6,20}$'
                then op.mobile_phone end,'')=
                  coalesce(case when p.mobile_phone ~ '^[+]{0,1}[0-9]{6,20}$'
                    then p.mobile_phone end,'')
          ) as ambiguous
        from da_organization_membership m
        join da_person p on p.id=m.person_id
          and p.disabled_at is null and p.deleted_at is null
        left join lateral (
          select i.recipient_email from da_organization_invitation i
          where i.organization_id=m.organization_id
            and i.accepted_by_person_id=m.person_id
            and i.status='accepted' and i.role='member'
            and i.deleted_at is null
          order by i.accepted_at desc nulls last,i.id desc limit 1
        ) inv on true
        where m.id=? and m.organization_id=? and m.person_id=?
          and m.status='active' and m.revoked_at is null and m.deleted_at is null
        limit 2`,[input.membership_id,input.organization_id,personId])
      if(readable.length!==1||readable[0].ambiguous!==false||
         !(typeof readable[0].mobile_phone==="string"&&
           /^\+?[0-9]{6,20}$/.test(readable[0].mobile_phone))&&
         !(typeof readable[0].recipient_email==="string"&&
           readable[0].recipient_email.length>0))
        throw new IdentityAccessDenied()
      if(active.length){
        if(active[0].membership_id!==input.membership_id||
           !await verifiedStoreDraftGrant(db,personId,input.organization_id,input.membership_id))
          throw new IdentityAccessDenied()
        return {status:"active" as const,grant_id:active[0].id as string}
      }
      const grantId="dasdpg_"+randomUUID()
      const [audit]=await this.persistAuditEventsWithOutbox_([{
        actor_person_id:actor.person_id,actor_type:actor.actor_type,actor_id:actor.actor_id,
        role_context:"owner",organization_id:input.organization_id,
        action:"organization.store_draft_permission_granted",module:DOGRUADRES_AUDIT_MODULE,
        resource:"store-draft-permission",target_id:personId,
        new_values:{grant_id:grantId,person_id:personId,
          membership_id:input.membership_id,permission:"store.application.draft.manage"},
        occurred_at:new Date()
      }],context)
      if(!audit?.id)throw new IdentityAccessDenied()
      await (context.transactionManager as {flush():Promise<void>}).flush()
      await db.execute(`insert into da_organization_store_draft_permission
        (id,person_id,organization_id,membership_id,permission,
         issued_by_person_id,source_audit_event_id)
        values (?,?,?,?,'store.application.draft.manage',?,?)`,
        [grantId,personId,input.organization_id,input.membership_id,actor.person_id,audit.id])
      await db.execute(`insert into da_notification_receipt(id,person_id,audit_event_id)
        values (?,?,?)`,["danot_"+randomUUID(),personId,audit.id])
      return {status:"active" as const,grant_id:grantId}
    }
    if(!active.length)return {status:"revoked" as const,grant_id:null}
    // The Owner UI cannot distinguish two already-authorized people
    // sharing name, accepted invitation email and usable mobile. Reject direct
    // stale/forged individual revoke requests too; never pick a Person ID
    // silently. Only same-Organization active memberships are compared.
    const ambiguousRevocation=await db.execute(`select 1
      from da_organization_membership m
      join da_person p on p.id=m.person_id
      left join lateral (
        select i.recipient_email from da_organization_invitation i
        where i.organization_id=m.organization_id
          and i.accepted_by_person_id=m.person_id
          and i.status='accepted' and i.role='member'
          and i.deleted_at is null
        order by i.accepted_at desc nulls last,i.id desc limit 1
      ) inv on true
      join da_organization_store_draft_permission other_grant
        on other_grant.organization_id=m.organization_id
          and other_grant.permission='store.application.draft.manage'
          and other_grant.revoked_at is null
      join da_organization_membership other
        on other.id=other_grant.membership_id
          and other.person_id=other_grant.person_id
          and other.organization_id=other_grant.organization_id
      join da_person op on op.id=other.person_id
        and op.disabled_at is null and op.deleted_at is null
      left join lateral (
        select oi.recipient_email from da_organization_invitation oi
        where oi.organization_id=other.organization_id
          and oi.accepted_by_person_id=other.person_id
          and oi.status='accepted' and oi.role='member'
          and oi.deleted_at is null
        order by oi.accepted_at desc nulls last,oi.id desc limit 1
      ) oinv on true
      where m.id=? and m.organization_id=? and m.person_id=?
        and other.id<>m.id and other.role='member'
        and other.protected_owner=false and other.status='active'
        and other.revoked_at is null and other.deleted_at is null
        and lower(btrim(coalesce(op.display_name,'')))=
            lower(btrim(coalesce(p.display_name,'')))
        and ${acceptedInviteSqlLabel("oinv")}=
            ${acceptedInviteSqlLabel("inv")}
        and coalesce(case when op.mobile_phone ~ '^[+]{0,1}[0-9]{6,20}$' then op.mobile_phone end,'')=
            coalesce(case when p.mobile_phone ~ '^[+]{0,1}[0-9]{6,20}$' then p.mobile_phone end,'')
      limit 1`,[input.membership_id,input.organization_id,personId])
    if(ambiguousRevocation.length)throw new IdentityAccessDenied()
    const grantId=active[0].id as string
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:actor.person_id,actor_type:actor.actor_type,actor_id:actor.actor_id,
      role_context:"owner",organization_id:input.organization_id,
      action:"organization.store_draft_permission_revoked",module:DOGRUADRES_AUDIT_MODULE,
      resource:"store-draft-permission",target_id:personId,
      previous_values:{grant_id:grantId,person_id:personId,
        membership_id:active[0].membership_id,permission:"store.application.draft.manage"},
      new_values:{grant_id:grantId,status:"revoked"},occurred_at:new Date()
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const result=await db.execute(`update da_organization_store_draft_permission
      set revoked_at=clock_timestamp() where id=? and revoked_at is null returning id`,[grantId])
    if(result.length!==1)throw new IdentityAccessDenied()
    await db.execute(`insert into da_notification_receipt(id,person_id,audit_event_id)
      values (?,?,?)`,["danot_"+randomUUID(),personId,audit.id])
    return {status:"revoked" as const,grant_id:grantId}
  }

  // A dedicated platform task is required. Holding organization.provision or
  // store.approve must NEVER silently grant this independent company policy
  // authority. An explicit task grant with strong authentication is mandatory.
  @InjectTransactionManager()
  async personalPlatformStoreApplicationRight(token:string,org:string,
    @MedusaContext() context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(org))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.application.policy.manage","platform")
    if(!staff)return null
    const rows=await db.execute(`select id,name,store_application_enabled,store_application_version
      from da_organization where id=? and status='active' and deleted_at is null`,[org])
    if(rows.length!==1||typeof rows[0].store_application_enabled!=="boolean"||
       !Number.isSafeInteger(rows[0].store_application_version)||
       rows[0].store_application_version<0)return null
    return {organization_id:rows[0].id as string,
      name:rows[0].name as string,
      store_application_enabled:rows[0].store_application_enabled as boolean,
      store_application_version:rows[0].store_application_version as number}
  }

  @InjectTransactionManager()
  async personalSetStoreApplicationRight(token:string,input:{
    organization_id:string;expected_enabled:boolean;expected_version:number;enabled:boolean;reason:string
  },@MedusaContext() context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       typeof input.expected_enabled!=="boolean"||typeof input.enabled!=="boolean"||
       !Number.isSafeInteger(input.expected_version)||input.expected_version<0||
       input.expected_version>=2147483647||
       input.expected_enabled===input.enabled||
       typeof input.reason!=="string"||input.reason.trim()!==input.reason||
       input.reason.length<10||input.reason.length>500)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const staff=await sessions.staff(token,"store.application.policy.manage","platform")
    if(!staff)return null
    const grant=await db.execute(`select id from da_platform_staff_grant
      where id=? and person_id=? and task='store.application.policy.manage' and resource='platform'
      and revoked_at is null and (expires_at is null or expires_at>clock_timestamp())
      for share`,[staff.grant_id,staff.person_id])
    if(grant.length!==1)return null
    // Serializes against active native Store creation/approval, both of which
    // hold this same row FOR SHARE until their workflow has finished.
    const rows=await db.execute(`select store_application_enabled,store_application_version
      from da_organization where id=? and status='active' and deleted_at is null
      for update`,[input.organization_id])
    if(rows.length!==1||typeof rows[0].store_application_enabled!=="boolean"||
       !Number.isSafeInteger(rows[0].store_application_version)||
       rows[0].store_application_version<0)return null
    const prior=rows[0].store_application_enabled as boolean
    const version=rows[0].store_application_version as number
    // TRUE -> FALSE -> TRUE is NOT the same version as the first TRUE.
    // Reject stale tabs before writing any audit/outbox or notices.
    if(prior!==input.expected_enabled||version!==input.expected_version)
      return {status:"conflict" as const}
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:staff.person_id,actor_type:staff.actor_type,actor_id:staff.actor_id,
      role_context:"platform_staff",organization_id:input.organization_id,
      action:input.enabled?"organization.store_application_right_enabled":
        "organization.store_application_right_disabled",
      module:DOGRUADRES_AUDIT_MODULE,resource:"organization",
      target_id:input.organization_id,
      previous_values:{store_application_enabled:prior,store_application_version:version},
      new_values:{store_application_enabled:input.enabled,
        store_application_version:version+1,
        reason:input.reason,staff_grant_id:staff.grant_id},
      occurred_at:new Date()
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    const manager=context.transactionManager
    if(!manager||typeof manager!=="object"||!("flush" in manager)||
       typeof manager.flush!=="function")throw new Error("Foundation transaction unavailable")
    await manager.flush()
    const updated=await db.execute(`update da_organization
      set store_application_enabled=?,store_application_version=store_application_version+1,
        updated_at=clock_timestamp()
      where id=? and store_application_enabled=? and store_application_version=?
      returning id,store_application_version`,
      [input.enabled,input.organization_id,prior,version])
    if(updated.length!==1)throw new IdentityAccessDenied()
    // Existing Foundation in-app notification receipts: one private receipt for
    // each currently protected active Owner, all attached to this exact audit.
    // A failed insert rolls back both the company policy and its audit/outbox.
    await db.execute(`insert into da_notification_receipt(id,person_id,audit_event_id)
      select 'danot_'||gen_random_uuid()::text,m.person_id,?
      from da_organization_membership m join da_person p on p.id=m.person_id
      where m.organization_id=? and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.deleted_at is null
        and p.disabled_at is null and p.deleted_at is null
      on conflict(audit_event_id,person_id) do nothing`,[audit.id,input.organization_id])
    return {status:"updated" as const,
      organization_id:input.organization_id,
      store_application_enabled:input.enabled,
      store_application_version:updated[0].store_application_version as number}
  }

  /** Resolve ONLY the persisted draft for Owner's fresh-MFA approval. The
   * browser supplies its ID/version, never trusted Seller name/email values.
   * Reservation rechecks this same snapshot under the draft row lock.
   */
  @InjectTransactionManager()
  async personalPrepareStoreApplicationFromDraft(token:string,input:{
    organization_id:string;draft_id:string;expected_version:number;application_id:string
  },@MedusaContext() context:Context={}):Promise<StoreRequest|{conflict:true}|null>{
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^dasdraft_[0-9a-f]{32}$/.test(input.draft_id)||
       !/^daapp_[0-9a-f]{32}$/.test(input.application_id)||
       !Number.isSafeInteger(input.expected_version)||input.expected_version<1)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    if(!await eligibleOwner(db,token,input.organization_id))return null
    const rows=await db.execute(`select name,email,currency_code,status,version,submitted_application_id
      from da_store_application_draft where id=? and organization_id=? limit 2`,
      [input.draft_id,input.organization_id])
    if(rows.length!==1)return null
    const draft=rows[0]
    if(!Number.isSafeInteger(draft.version)||
       typeof draft.name!=="string"||typeof draft.email!=="string"||
       typeof draft.currency_code!=="string")throw new IdentityAccessDenied()
    if(draft.version!==input.expected_version||
       !(draft.status==="draft"&&draft.submitted_application_id===null||
         ["submitting","submitted"].includes(draft.status)&&
           draft.submitted_application_id===input.application_id))
      return {conflict:true}
    return {organization_id:input.organization_id,application_id:input.application_id,
      name:draft.name,email:draft.email,currency_code:draft.currency_code,
      draft_id:input.draft_id,draft_version:input.expected_version}
  }

  /** B22 Owner membership revoke vs native Mercur Seller creation.
   * The canonical protected Owner membership is held FOR SHARE for the entire
   * native workflow and Foundation audit completion. The existing separately
   * committed claim='creating' remains the durable idempotency barrier; do
   * NOT move it into this outer transaction (crash could allow duplicate Seller).
   */
  @InjectTransactionManager()
  async personalWithStoreApplicationOwnerLock<T>(
    token:string,input:StoreRequest,execute:(context:Context)=>Promise<T>,
    @MedusaContext() context:Context={}
  ):Promise<T|null>{
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^daapp_[0-9a-f]{32}$/.test(input.application_id)||
       typeof execute!=="function")throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const actor=await eligibleOwner(db,token,input.organization_id)
    if(!actor)return null
    // Verify the immutable committed claim, native Member and payload before
    // touching Mercur. Keep this row stable until the same Foundation manager
    // completes the Origin/Audit write after native creation.
    const rows=await db.execute(`select id from da_store_application
      where id=? and organization_id=? and person_id=?
        and member_actor_id=? and member_auth_identity_id=?
        and request_fingerprint=? and status='creating' and seller_id is null
        and store_name_hash is not null
      for share`,[input.application_id,input.organization_id,actor.person_id,
        actor.member_id,actor.member_auth_identity_id,storeRequestFingerprint(input)])
    if(rows.length!==1)return null
    return execute(context)
  }

  @InjectTransactionManager()
  async reserveStoreApplication(token:string,input:StoreRequest,@MedusaContext() context:Context={}){
    const db=securitySql(context.transactionManager),actor=await eligibleOwner(db,token,input.organization_id)
    if(!actor)return null
    if(input.draft_id!==undefined&&
       (!/^dasdraft_[0-9a-f]{32}$/.test(input.draft_id)||
        typeof input.draft_version!=="number"||
        !Number.isSafeInteger(input.draft_version)||input.draft_version<1))
      throw new IdentityAccessDenied()
    if(input.draft_id===undefined&&input.draft_version!==undefined)
      throw new IdentityAccessDenied()
    const fingerprint=storeRequestFingerprint(input)
    await db.execute(`select pg_advisory_xact_lock(hashtext('b22-store-application'),hashtext(?))`,
      [input.application_id])
    // Different request IDs must not turn one private draft into two Sellers.
    // Member saves also lock this row and require status='draft'.
    let draft:null|{status:string;submitted_application_id:string|null}=null
    if(input.draft_id!==undefined){
      const rows=await db.execute(`select name,email,currency_code,version,status,submitted_application_id
        from da_store_application_draft
        where id=? and organization_id=? for update`,
        [input.draft_id,input.organization_id])
      if(rows.length!==1)return {status:"conflict" as const}
      const d=rows[0]
      if(d.name!==input.name||d.email!==input.email||
         d.currency_code!==input.currency_code||d.version!==input.draft_version||
         !(d.status==="draft"&&d.submitted_application_id===null||
           ["submitting","submitted"].includes(d.status)&&
             d.submitted_application_id===input.application_id))
        return {status:"conflict" as const}
      draft={status:d.status,submitted_application_id:d.submitted_application_id}
    }
    const prior=await db.execute(`select * from da_store_application where id=? for update`,[input.application_id])
    if(prior.length>1)throw new IdentityAccessDenied()
    if(prior.length){
      const r=prior[0]
      if(r.organization_id!==input.organization_id||r.person_id!==actor.person_id||
         r.member_actor_id!==actor.member_id||r.request_fingerprint!==fingerprint||
         (draft!==null&&(draft.status==="draft"||
            draft.submitted_application_id!==input.application_id)))
        throw new IdentityAccessDenied()
      // Historical reserved/creating rows have no verified normalized name
      // claim. Fail closed before their legacy native creation can bypass a
      // newer Organization's global claim. Created rows remain readable.
      if(r.status!=="created"&&r.store_name_hash===null)
        return {status:"name_unverified" as const,seller_id:null}
      return {status:r.status as string,seller_id:r.seller_id as string|null}
    }
    if(draft!==null&&draft.status!=="draft")return {status:"conflict" as const}
    // PostgreSQL computes the *same* NFKC, whitespace and case-insensitive
    // name key for existing native Sellers and all new Organization claims.
    // Keep the irreversible claim before native Seller creation; never hold
    // this lock across separate transactions or guess an uncertain outcome.
    const names=await db.execute(`select encode(sha256(convert_to(
      lower(regexp_replace(btrim(normalize(?,NFKC)),'[[:space:]]+',' ','g')),
      'UTF8')),'hex') as store_name_hash`,[input.name])
    const nameHash=names[0]?.store_name_hash
    if(names.length!==1||typeof nameHash!=="string"||
       !/^[a-f0-9]{64}$/.test(nameHash))throw new IdentityAccessDenied()
    await db.execute(`select pg_advisory_xact_lock(
      hashtext('b22-global-store-name'),hashtext(?))`,[nameHash])
    const reserved=await db.execute(`select id from da_store_application
      where store_name_hash=? and
        (name_claim_released_at is null or name_claim_released_at>clock_timestamp())
      limit 1`,[nameHash])
    if(reserved.length)return {status:"name_taken" as const}
    // Mercur derives the handle from the new Seller name. Reserve BOTH the
    // original URL and any other Store's in-flight proposed URL for 30 days.
    const generatedHandle=toHandle(input.name)
    const hold=await db.execute(`select 1 from da_store_rename_request r
      where (r.status='approving' or
        (r.status='approved' and r.approved_at>
          clock_timestamp()-interval '30 days'))
      and (
        (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(r.old_name,NFKC)),
          '[[:space:]]+',' ','g')),'UTF8')),'hex')=? or r.old_handle=?)
        or (r.status='approving' and
          (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(r.proposed_name,NFKC)),
            '[[:space:]]+',' ','g')),'UTF8')),'hex')=? or r.proposed_handle=?))
      ) limit 1`,[nameHash,generatedHandle,nameHash,generatedHandle])
    if(hold.length)return {status:"name_taken" as const}
    // A legacy native Seller may predate DoğruAdres name claims. Read only
    // its name, with no cross-Organization details in the HTTP response.
    // A deleted Seller also keeps the name during the approved 30-day hold.
    const nativeExisting=await db.execute(`select id from seller
      where (deleted_at is null or
        deleted_at>clock_timestamp()-interval '30 days')
        and encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(name,NFKC)),
          '[[:space:]]+',' ','g')),
          'UTF8')),'hex')=? limit 1`,[nameHash])
    if(nativeExisting.length)return {status:"name_taken" as const}
    await db.execute(`insert into da_store_application
      (id,organization_id,person_id,member_actor_id,member_auth_identity_id,
       request_fingerprint,store_name_hash,status)
      values(?,?,?,?,?,?,?,'reserved')`,[input.application_id,input.organization_id,actor.person_id,
      actor.member_id,actor.member_auth_identity_id,fingerprint,nameHash])
    if(input.draft_id!==undefined){
      const bound=await db.execute(`update da_store_application_draft
        set status='submitting',submitted_application_id=?,updated_at=clock_timestamp()
        where id=? and organization_id=? and status='draft' and version=?
          and submitted_application_id is null returning id`,
        [input.application_id,input.draft_id,input.organization_id,input.draft_version])
      if(bound.length!==1)throw new IdentityAccessDenied()
    }
    return {status:"reserved" as const,seller_id:null}
  }

  @InjectTransactionManager()
  async claimStoreApplication(token:string,input:StoreRequest,@MedusaContext() context:Context={}){
    const db=securitySql(context.transactionManager),actor=await eligibleOwner(db,token,input.organization_id)
    if(!actor)return null
    const rows=await db.execute(`update da_store_application
      set status='creating',updated_at=clock_timestamp()
      where id=? and organization_id=? and person_id=? and member_actor_id=?
        and member_auth_identity_id=? and request_fingerprint=? and status='reserved'
      returning member_actor_id,member_auth_identity_id`,[
      input.application_id,input.organization_id,actor.person_id,actor.member_id,
      actor.member_auth_identity_id,storeRequestFingerprint(input)])
    if(rows.length!==1)return null
    return {member_id:rows[0].member_actor_id as string,
      member_auth_identity_id:rows[0].member_auth_identity_id as string}
  }

  @InjectTransactionManager()
  async finishStoreApplication(token:string,input:StoreRequest,sellerId:string,
    @MedusaContext() context:Context={}){
    const db=securitySql(context.transactionManager),actor=await eligibleOwner(db,token,input.organization_id)
    if(!actor||!/^sel_[A-Za-z0-9_-]+$/.test(sellerId))return null
    const pending=await db.execute(`select id from da_store_application
      where id=? and organization_id=? and person_id=? and member_actor_id=?
        and request_fingerprint=? and status='creating' for update`,[
      input.application_id,input.organization_id,actor.person_id,actor.member_id,
      storeRequestFingerprint(input)])
    if(pending.length!==1)return null
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:actor.person_id,actor_type:actor.actor_type,actor_id:actor.actor_id,
      role_context:"owner",organization_id:input.organization_id,
      action:"organization.store_application_created",module:DOGRUADRES_AUDIT_MODULE,
      resource:"store-application",target_id:sellerId,
      new_values:{application_id:input.application_id,status:"pending_approval",
        ...(input.draft_id?{draft_id:input.draft_id,draft_version:input.draft_version}:{})},
      occurred_at:new Date()
    }],context)
    // The Medusa createAuditEvents/createAuditOutboxes calls stage ORM writes.
    // Flush on this SAME transaction manager before the raw SQL FK insert;
    // do not commit or open an independent transaction.
    await (context.transactionManager as {flush():Promise<void>}).flush()
    await db.execute(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      values(?,?,?,?,clock_timestamp())`,[
      "daown_"+randomUUID(),input.organization_id,sellerId,audit.id])
    const finish=await db.execute(`update da_store_application set seller_id=?,
      status='created',updated_at=clock_timestamp()
      where id=? and status='creating' returning id`,[sellerId,input.application_id])
    if(finish.length!==1)throw new IdentityAccessDenied()
    if(input.draft_id!==undefined){
      const submitted=await db.execute(`update da_store_application_draft
        set status='submitted',updated_at=clock_timestamp()
        where id=? and organization_id=? and submitted_application_id=?
          and version=? and status='submitting'
        returning id`,[input.draft_id,input.organization_id,input.application_id,input.draft_version])
      if(submitted.length!==1)throw new IdentityAccessDenied()
    }
    return {seller_id:sellerId}
  }

  // B22: a separate and explicitly granted platform task reviews only
  // persisted Owner-submitted applications. This is not native User access,
  // not an Organization Owner entitlement and not a separate link approval.
  /** B22: Hold the actual Staff grant row across native Mercur approval.
   * The same PostgreSQL row is updated by grant revocation, so a committed
   * revoke cannot race ahead of the native Store opening.
   * No platform authority is derived from a business Owner role.
   * This is not a cross-module transaction or general crash-recovery claim.
   */
  @InjectTransactionManager()
  async personalWithStoreApprovalStaffLock<T>(
    token:string,target:{application_id:string;seller_id:string;decision?:"reject"},
    execute:(context:Context)=>Promise<T>,@MedusaContext() context:Context={}
  ):Promise<T|null>{
    if(!/^daapp_[0-9a-f]{32}$/.test(target.application_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(target.seller_id)||
       (target.decision!==undefined&&target.decision!=="reject")||
       typeof execute!=="function")throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const staff=await sessions.staff(token,"store.approve","platform")
    if(!staff)return null
    // Unlike an advisory-only lock, a row SHARE lock also serializes an
    // ordinary UPDATE ... revoked_at on the canonical staff-grant record.
    const locked=await db.execute(`select g.id from da_platform_staff_grant g
      where g.id=? and g.person_id=? and g.task='store.approve'
        and g.resource='platform' and g.revoked_at is null
        and (g.expires_at is null or g.expires_at>clock_timestamp())
      for share of g`,[staff.grant_id,staff.person_id])
    if(locked.length!==1||locked[0].id!==staff.grant_id)return null
    const fresh=await sessions.staff(token,"store.approve","platform")
    if(!fresh||fresh.grant_id!==staff.grant_id)return null
    // Both platform decisions share ONE per-Seller lock across their entire
    // native workflow and readback. Independent staff grants must not let an
    // approve and reject race to two conflicting terminal states.
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-platform-store-decision'),hashtext(?))",
      [target.seller_id])
    const candidate=await this.personalReviewableStoreApplications(token,target,context)
    if(!candidate||candidate.length!==1)return null
    // An already submitted application may be REJECTED even while the
    // company's new-application policy is paused. Only new native APPROVAL
    // remains blocked. Neither choice changes existing open Stores.
    if(target.decision!=="reject"){
      const policy=await db.execute(`select store_application_enabled
        from da_organization where id=? and status='active' and deleted_at is null
        for share`,[candidate[0].organization_id])
      if(policy.length!==1||policy[0].store_application_enabled!==true)return null
    }
    const latest=await this.personalReviewableStoreApplications(token,target,context)
    if(!latest||latest.length!==1||
       (target.decision!=="reject"&&latest[0].on_hold))return null
    return execute(context)
  }

  /** Auditable staff decision after Mercur has actually terminated a PENDING
   * Seller; store the reason privately, never in the derived public index.
   * Failure after the native step stays uncertain and is never auto-retried.
   */
  @InjectTransactionManager()
  async personalRecordStoreApplicationRejection(token:string,target:{
    application_id:string;seller_id:string;reason:string
  },@MedusaContext() context:Context={}){
    if(!/^daapp_[0-9a-f]{32}$/.test(target.application_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(target.seller_id)||
       typeof target.reason!=="string"||target.reason.trim()!==target.reason||
       target.reason.length<10||target.reason.length>500)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.approve","platform")
    if(!staff)return null
    const matching=await this.personalReviewableStoreApplications(token,target,context)
    if(!matching||matching.length!==1)return null
    const prior=await db.execute(`select id from da_audit_event
      where organization_id=? and resource='store-application'
        and action='organization.store_application_rejected'
        and target_id=? and deleted_at is null limit 2`,
      [matching[0].organization_id,target.seller_id])
    if(prior.length)return {status:"conflict" as const}
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:staff.person_id,actor_type:staff.actor_type,
      actor_id:staff.actor_id,role_context:"platform_staff",
      organization_id:matching[0].organization_id,
      action:"organization.store_application_rejected",
      module:DOGRUADRES_AUDIT_MODULE,
      resource:"store-application",target_id:target.seller_id,
      new_values:{application_id:target.application_id,status:"terminated",
        reason:target.reason,staff_grant_id:staff.grant_id},
      occurred_at:new Date()
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    const manager=context.transactionManager
    if(!manager||typeof manager!=="object"||!("flush" in manager)||
       typeof manager.flush!=="function")
      throw new Error("Foundation transaction unavailable")
    await manager.flush()
    // A private, redacted Owner notification: the precise free-text reason
    // stays in native Seller and canonical audit, not the notification list.
    await db.execute(`insert into da_notification_receipt(id,person_id,audit_event_id)
      select 'danot_'||gen_random_uuid()::text,m.person_id,?
      from da_organization_membership m join da_person p on p.id=m.person_id
      where m.organization_id=? and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.deleted_at is null
        and p.disabled_at is null and p.deleted_at is null
      on conflict(audit_event_id,person_id) do nothing`,
      [audit.id,matching[0].organization_id])
    return {status:"rejected" as const,organization_id:matching[0].organization_id}
  }

  @InjectTransactionManager()
  async personalReviewableStoreApplications(token:string,
    target?:{application_id:string;seller_id:string},
    @MedusaContext() context:Context={},
    page=0) {
    if(!Number.isSafeInteger(page)||page<0||page>1000)throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.approve","platform")
    if(!staff)return null
    const rows=await db.execute(`select a.id application_id,a.seller_id,
        a.organization_id,d.name organization_name,
        d.store_application_enabled
      from da_store_application a
      join da_organization d on d.id=a.organization_id
        and d.status='active' and d.deleted_at is null
      join da_organization_seller_ownership o on o.organization_id=a.organization_id
        and o.seller_id=a.seller_id and o.revoked_at is null
      join da_audit_event e on e.id=o.verification_audit_event_id
        and e.module='dogruadres-access'
        and e.action='organization.store_application_created'
        and e.resource='store-application'
        and e.actor_person_id=a.person_id
        and e.organization_id=a.organization_id
        and e.target_id=a.seller_id
        and e.new_values->>'application_id'=a.id and e.deleted_at is null
      where a.status='created' and a.seller_id is not null
        and exists(select 1 from da_audit_outbox x where
          x.source_audit_event_id=e.id and x.source_module='dogruadres-access'
          and x.deleted_at is null)
        ${target?"and a.id=? and a.seller_id=?":""}
      -- Stable id tie-break and bounded pages expose older pending records.
      -- Exact-target POST stays independent of list page.
      order by a.created_at desc,a.id desc limit ${target?1:31} offset ${target?0:page*30}`,
      target?[target.application_id,target.seller_id]:[])
    if(!Array.isArray(rows)||rows.length>(target?1:31) ||
       rows.some(r=>typeof r.application_id!=="string" ||
         !/^daapp_[0-9a-f]{32}$/.test(r.application_id) ||
         typeof r.seller_id!=="string" ||
         !/^sel_[A-Za-z0-9_-]+$/.test(r.seller_id) ||
         typeof r.organization_id!=="string" ||
         !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(r.organization_id) ||
         typeof r.organization_name!=="string" ||
         typeof r.store_application_enabled!=="boolean") ||
       new Set(rows.map(r=>r.seller_id)).size!==rows.length)
      throw new IdentityAccessDenied()
    return (target?rows:rows.slice(0,30)).map(r=>({
      application_id:r.application_id as string,
      seller_id:r.seller_id as string,
      organization_id:r.organization_id as string,
      organization_name:r.organization_name as string,
      on_hold:r.store_application_enabled===false
    }))
  }



  /** A read-only private queue for currently authorized platform Store staff.
   * Every candidate must be traceable to the original protected Owner request,
   * audit/outbox, verified immutable Store origin, and live approved Seller.
   * No pending approval or native Seller update is executed here.
   */
  @InjectTransactionManager()
  async personalReviewableStoreRenameRequests(token:string,page=0,
    @MedusaContext() context:Context={}){
    if(!Number.isSafeInteger(page)||page<0||page>1000)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.approve","platform")
    if(!staff)return null
    const rows=await db.execute(`select r.id request_id,r.organization_id,
      d.name organization_name,r.seller_id,r.old_name,r.old_handle,
      r.proposed_name,r.proposed_handle,r.created_at
      from da_store_rename_request r
      join da_organization d on d.id=r.organization_id
        and d.status='active' and d.deleted_at is null
      join seller s on s.id=r.seller_id and s.deleted_at is null
        and s.status='open' and s.approved_at is not null
        and s.name=r.old_name and s.handle=r.old_handle
      join da_organization_seller_ownership o on o.seller_id=r.seller_id
        and o.organization_id=r.organization_id and o.revoked_at is null
      join da_audit_event origin on origin.id=o.verification_audit_event_id
        and origin.deleted_at is null and origin.organization_id=r.organization_id
        and origin.target_id=r.seller_id
        and origin.module='dogruadres-access'
      join da_audit_event e on e.id=r.source_audit_event_id
        and e.deleted_at is null
        and e.module='dogruadres-access'
        and e.action='organization.store_rename_requested'
        and e.resource='store-rename-request'
        and e.organization_id=r.organization_id
        and e.target_id=r.seller_id
        and e.new_values->>'request_id'=r.id
        and e.new_values->>'risk_version'=r.risk_version
        and e.actor_person_id=r.requested_by_person_id
      where r.status='pending_review' and r.risk_version=?
        and r.risk_acknowledged_at is not null
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id
          and x.source_module='dogruadres-access' and x.deleted_at is null)
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=origin.id
          and x.source_module='dogruadres-access' and x.deleted_at is null)
      order by r.created_at desc,r.id desc
      limit 21 offset ${page*20}`,[STORE_RENAME_RISK_VERSION])
    if(!Array.isArray(rows)||rows.length>21||
       rows.some(row=>typeof row.request_id!=="string"||
         !/^dasrn_[a-f0-9]{32}$/.test(row.request_id)||
         typeof row.organization_id!=="string"||
         !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(row.organization_id)||
         typeof row.seller_id!=="string"||
         !/^sel_[A-Za-z0-9_-]+$/.test(row.seller_id)||
         typeof row.organization_name!=="string"||
         typeof row.old_name!=="string"||typeof row.old_handle!=="string"||
         typeof row.proposed_name!=="string"||
         !validStoreName(row.proposed_name)||
         typeof row.proposed_handle!=="string"||
         !validStoreHandle(row.proposed_handle))||
       new Set(rows.map(row=>row.request_id)).size!==rows.length)
      throw new IdentityAccessDenied()
    // Origin alone is never authority: the same canonical ownership proof
    // (including its original application/association event and outbox)
    // must still validate for EACH Store before returning private names.
    for(const row of rows){
      if(!(await platformApprovedSellerIds(db,row.organization_id)).includes(row.seller_id))
        throw new IdentityAccessDenied()
    }
    // A final grant recheck prevents a revoked/replaced staff principal from
    // receiving even private names if the read overlapped revocation.
    const fresh=await new IdentitySessions(db).staff(token,"store.approve","platform")
    if(!fresh||fresh.grant_id!==staff.grant_id)return null
    return {page,has_more:rows.length>20,pending:rows.slice(0,20).map(row=>({
      request_id:row.request_id as string,organization_id:row.organization_id as string,
      organization_name:row.organization_name as string,seller_id:row.seller_id as string,
      old_name:row.old_name as string,old_handle:row.old_handle as string,
      proposed_name:row.proposed_name as string,proposed_handle:row.proposed_handle as string,
      created_at:row.created_at
    }))}
  }

  /** A reasoned rejection is a complete review outcome: the current
   * Seller remains unchanged, the Owner can read the final request status,
   * and a canonical audit/outbox is written in the same transaction. This
   * grants no ability to approve or actually rename a native Seller.
   */
  @InjectTransactionManager()
  async personalRejectStoreRenameRequest(token:string,input:{
    request_id:string;seller_id:string;reason:string
  },@MedusaContext() context:Context={}){
    if(!/^dasrn_[a-f0-9]{32}$/.test(input.request_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       typeof input.reason!=="string"||input.reason.trim()!==input.reason||
       input.reason.length<10||input.reason.length>500)
      throw new IdentityAccessDenied()
    // Validate displayable characters without silently rewriting the audit reason.
    const readable=/[\p{L}\p{N}\p{Extended_Pictographic}]/u
    const ignorable=/\p{Default_Ignorable_Code_Point}/gu
    let readableCount=0
    for(const {segment} of new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(input.reason)){
      if(readable.test(segment.replace(ignorable,"")))readableCount++
    }
    if(readableCount<10)throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const sessions=new IdentitySessions(db)
    const staff=await sessions.staff(token,"store.approve","platform")
    if(!staff)return null
    const grant=await db.execute(`select g.id from da_platform_staff_grant g
      where g.id=? and g.person_id=? and g.task='store.approve'
        and g.resource='platform' and g.revoked_at is null
        and (g.expires_at is null or g.expires_at>clock_timestamp())
      for share of g`,[staff.grant_id,staff.person_id])
    if(grant.length!==1||grant[0].id!==staff.grant_id)return null
    const fresh=await sessions.staff(token,"store.approve","platform")
    if(!fresh||fresh.grant_id!==staff.grant_id)return null
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-store-rename'),hashtext(?))",
      [input.seller_id])
    const rows=await db.execute(`select r.organization_id,r.seller_id,
      r.status,r.old_name,r.old_handle,r.risk_version,r.source_audit_event_id
      from da_store_rename_request r
      join da_organization d on d.id=r.organization_id
        and d.status='active' and d.deleted_at is null
      join seller s on s.id=r.seller_id and s.deleted_at is null
        and s.status='open' and s.approved_at is not null
        and s.name=r.old_name and s.handle=r.old_handle
      join da_audit_event e on e.id=r.source_audit_event_id
        and e.deleted_at is null and e.module='dogruadres-access'
        and e.action='organization.store_rename_requested'
        and e.resource='store-rename-request'
        and e.organization_id=r.organization_id
        and e.target_id=r.seller_id
        and e.actor_person_id=r.requested_by_person_id
        and e.new_values->>'request_id'=r.id
      where r.id=? and r.seller_id=?
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id
            and x.source_module='dogruadres-access' and x.deleted_at is null)
      for update of r`,[input.request_id,input.seller_id])
    if(rows.length!==1||rows[0].status!=="pending_review"||
       rows[0].risk_version!==STORE_RENAME_RISK_VERSION)
      return {status:"conflict" as const}
    const org=rows[0].organization_id as string
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(org)||
       !(await platformApprovedSellerIds(db,org)).includes(input.seller_id))
      return null
    const updated=await db.execute(`update da_store_rename_request
      set status='rejected',updated_at=clock_timestamp()
      where id=? and seller_id=? and status='pending_review'
      returning id`,[input.request_id,input.seller_id])
    if(updated.length!==1||updated[0].id!==input.request_id)
      throw new IdentityAccessDenied()
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:staff.person_id,actor_type:staff.actor_type,
      actor_id:staff.actor_id,role_context:"platform_staff",
      organization_id:org,
      action:"organization.store_rename_rejected",
      module:DOGRUADRES_AUDIT_MODULE,
      resource:"store-rename-request",target_id:input.seller_id,
      new_values:{request_id:input.request_id,status:"rejected",
        reason:input.reason,staff_grant_id:staff.grant_id},
      occurred_at:new Date()
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    return {status:"rejected" as const,request_id:input.request_id,
      seller_id:input.seller_id}
  }


  /** Approval is a two-phase, fail-closed operation. Commit the intention
   * BEFORE Mercur's separate workflow, so a process crash never releases the
   * proposed name or the old URL for another Store. An uncertain operation
   * remains 'approving' and cannot be retried automatically.
   */
  @InjectTransactionManager()
  async personalClaimStoreRenameApproval(token:string,input:{
    request_id:string;seller_id:string
  },@MedusaContext() context:Context={}){
    if(!/^dasrn_[a-f0-9]{32}$/.test(input.request_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const sessions=new IdentitySessions(db)
    const staff=await sessions.staff(token,"store.approve","platform")
    if(!staff)return null
    const grant=await db.execute(`select g.id from da_platform_staff_grant g
      where g.id=? and g.person_id=? and g.task='store.approve'
        and g.resource='platform' and g.revoked_at is null
        and (g.expires_at is null or g.expires_at>clock_timestamp())
      for share of g`,[staff.grant_id,staff.person_id])
    if(grant.length!==1||grant[0].id!==staff.grant_id)return null
    const fresh=await sessions.staff(token,"store.approve","platform")
    if(!fresh||fresh.grant_id!==staff.grant_id)return null
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-store-rename'),hashtext(?))",
      [input.seller_id])
    const rows=await db.execute(`select r.organization_id,r.old_name,r.old_handle,
      r.proposed_name,r.proposed_handle,r.risk_version
      from da_store_rename_request r
      join da_organization d on d.id=r.organization_id
        and d.status='active' and d.deleted_at is null
      join seller s on s.id=r.seller_id and s.deleted_at is null
        and s.status='open' and s.approved_at is not null
        and s.name=r.old_name and s.handle=r.old_handle
      join da_organization_seller_ownership o on o.seller_id=r.seller_id
        and o.organization_id=r.organization_id and o.revoked_at is null
      join da_audit_event origin on origin.id=o.verification_audit_event_id
        and origin.deleted_at is null and origin.organization_id=r.organization_id
        and origin.target_id=r.seller_id and origin.module='dogruadres-access'
      join da_audit_event e on e.id=r.source_audit_event_id
        and e.deleted_at is null and e.module='dogruadres-access'
        and e.action='organization.store_rename_requested'
        and e.resource='store-rename-request'
        and e.organization_id=r.organization_id and e.target_id=r.seller_id
        and e.actor_person_id=r.requested_by_person_id
        and e.new_values->>'request_id'=r.id
        and e.new_values->>'risk_version'=r.risk_version
      where r.id=? and r.seller_id=? and r.status='pending_review'
        and r.risk_acknowledged_at is not null
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id
            and x.source_module='dogruadres-access' and x.deleted_at is null)
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=origin.id
            and x.source_module='dogruadres-access' and x.deleted_at is null)
      for update of r`,[input.request_id,input.seller_id])
    if(rows.length!==1)return {status:"conflict" as const}
    const r=rows[0]
    if(r.risk_version!==STORE_RENAME_RISK_VERSION||
       typeof r.proposed_name!=="string"||!validStoreName(r.proposed_name)||
       typeof r.proposed_handle!=="string"||!validStoreHandle(r.proposed_handle)||
       r.proposed_handle===r.old_handle||
       !(await platformApprovedSellerIds(db,r.organization_id)).includes(input.seller_id))
      return null
    const hashes=await db.execute(`select
      encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(?,NFKC)),
        '[[:space:]]+',' ','g')),'UTF8')),'hex') new_hash,
      encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(?,NFKC)),
        '[[:space:]]+',' ','g')),'UTF8')),'hex') old_hash`,
      [r.proposed_name,r.old_name])
    if(hashes.length!==1||typeof hashes[0].new_hash!=="string"||
       !/^[a-f0-9]{64}$/.test(hashes[0].new_hash)||
       hashes[0].new_hash===hashes[0].old_hash)
      return {status:"conflict" as const}
    const hash=hashes[0].new_hash as string,oldHash=hashes[0].old_hash as string
    if(typeof oldHash!=="string"||!/^[a-f0-9]{64}$/.test(oldHash))
      throw new IdentityAccessDenied()
    // Fail BEFORE any native Seller write if a historical/legacy Store lacks
    // a verifiable original active claim or previous approved rename.
    const originalClaim=await db.execute(`select id from da_store_application
      where seller_id=? and store_name_hash=? and name_claim_released_at is null
      limit 2`,[input.seller_id,oldHash])
    const priorClaim=await db.execute(`select id from da_store_rename_request
      where seller_id=? and id<>? and status='approved' and
      encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(proposed_name,NFKC)),
        '[[:space:]]+',' ','g')),'UTF8')),'hex')=?
      limit 2`,[input.seller_id,input.request_id,oldHash])
    if(originalClaim.length>1||priorClaim.length>1||
       !(originalClaim.length===1||priorClaim.length===1))
      return {status:"conflict" as const}
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-global-store-name'),hashtext(?))",
      [hash])
    const application=await db.execute(`select 1 from da_store_application
      where store_name_hash=?
        and (name_claim_released_at is null or name_claim_released_at>clock_timestamp())
      limit 1`,[hash])
    const native=await db.execute(`select 1 from seller where id<>?
      and (deleted_at is null or deleted_at>clock_timestamp()-interval '30 days')
      and (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(name,NFKC)),
        '[[:space:]]+',' ','g')),'UTF8')),'hex')=? or lower(handle)=?)
      limit 1`,[input.seller_id,hash,r.proposed_handle])
    // Approved old names/URLs hold exactly 30 calendar days. 'approving'
    // protects BOTH old and new values without expiration after a crash.
    const holds=await db.execute(`select 1 from da_store_rename_request h
      where h.id<>? and
        (h.status='approving' or
         (h.status='approved' and h.approved_at>
            clock_timestamp()-interval '30 days'))
        and (
          ((h.status='approving' or h.status='approved') and
           (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(h.old_name,NFKC)),
             '[[:space:]]+',' ','g')),'UTF8')),'hex')=? or h.old_handle=?))
          or (h.status='approving' and
            (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(h.proposed_name,NFKC)),
              '[[:space:]]+',' ','g')),'UTF8')),'hex')=? or h.proposed_handle=?))
        ) limit 1`,[input.request_id,hash,r.proposed_handle,hash,r.proposed_handle])
    if(application.length||native.length||holds.length)
      return {status:"unavailable" as const}
    const already=await db.execute(`select 1 from da_store_rename_request
      where seller_id=? and id<>? and status='approving' limit 1`,
      [input.seller_id,input.request_id])
    if(already.length)return {status:"conflict" as const}
    const claimed=await db.execute(`update da_store_rename_request
      set status='approving',updated_at=clock_timestamp()
      where id=? and seller_id=? and status='pending_review'
      returning id`,[input.request_id,input.seller_id])
    if(claimed.length!==1)throw new IdentityAccessDenied()
    return {status:"claimed" as const}
  }

  /** Hold the current Staff grant through the native Mercur workflow and
   * final readback. This separately committed phase deliberately cannot start
   * unless the preceding durable claim exists.
   */
  @InjectTransactionManager()
  async personalWithStoreRenameApprovalStaffLock<T>(token:string,input:{
    request_id:string;seller_id:string
  },execute:(data:{name:string;handle:string},context:Context)=>Promise<T>,
    @MedusaContext() context:Context={}):Promise<T|null>{
    if(!/^dasrn_[a-f0-9]{32}$/.test(input.request_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       typeof execute!=="function")throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const sessions=new IdentitySessions(db)
    const staff=await sessions.staff(token,"store.approve","platform")
    if(!staff)return null
    const grant=await db.execute(`select id from da_platform_staff_grant
      where id=? and person_id=? and task='store.approve' and resource='platform'
        and revoked_at is null
        and (expires_at is null or expires_at>clock_timestamp())
      for share`,[staff.grant_id,staff.person_id])
    if(grant.length!==1||grant[0].id!==staff.grant_id)return null
    const fresh=await sessions.staff(token,"store.approve","platform")
    if(!fresh||fresh.grant_id!==staff.grant_id)return null
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-store-rename'),hashtext(?))",
      [input.seller_id])
    const rows=await db.execute(`select r.organization_id,r.proposed_name,r.proposed_handle
      from da_store_rename_request r
      join da_organization d on d.id=r.organization_id
        and d.status='active' and d.deleted_at is null
      join seller s on s.id=r.seller_id and s.deleted_at is null
        and s.status='open' and s.approved_at is not null
        and s.name=r.old_name and s.handle=r.old_handle
      where r.id=? and r.seller_id=? and r.status='approving'
        and r.risk_version=? and r.risk_acknowledged_at is not null
      for share of r`,[input.request_id,input.seller_id,STORE_RENAME_RISK_VERSION])
    if(rows.length!==1||
       !(await platformApprovedSellerIds(db,rows[0].organization_id)).includes(input.seller_id)||
       !validStoreName(rows[0].proposed_name)||
       !validStoreHandle(rows[0].proposed_handle))return null
    return execute({name:rows[0].proposed_name as string,
      handle:rows[0].proposed_handle as string},context)
  }

  /** Finalize only after the native Seller already has BOTH approved values.
   * If finalization fails, the durable 'approving' claim remains locked rather
   * than silently releasing the vacated name, URL or proposed new name.
   */
  @InjectTransactionManager()
  async personalRecordStoreRenameApproval(token:string,input:{
    request_id:string;seller_id:string
  },@MedusaContext() context:Context={}){
    if(!/^dasrn_[a-f0-9]{32}$/.test(input.request_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const sessions=new IdentitySessions(db)
    const staff=await sessions.staff(token,"store.approve","platform")
    if(!staff)return null
    const grant=await db.execute(`select id from da_platform_staff_grant
      where id=? and person_id=? and task='store.approve' and resource='platform'
        and revoked_at is null and (expires_at is null or expires_at>clock_timestamp())
      for share`,[staff.grant_id,staff.person_id])
    if(grant.length!==1||grant[0].id!==staff.grant_id)return null
    const rows=await db.execute(`select r.organization_id,r.old_name,r.old_handle,
      r.proposed_name,r.proposed_handle
      from da_store_rename_request r
      join da_organization d on d.id=r.organization_id
        and d.status='active' and d.deleted_at is null
      join seller s on s.id=r.seller_id and s.deleted_at is null
        and s.status='open' and s.approved_at is not null
        and s.name=r.proposed_name and s.handle=r.proposed_handle
      join da_audit_event e on e.id=r.source_audit_event_id
        and e.deleted_at is null and e.module='dogruadres-access'
        and e.action='organization.store_rename_requested'
        and e.organization_id=r.organization_id and e.target_id=r.seller_id
        and e.actor_person_id=r.requested_by_person_id
      where r.id=? and r.seller_id=? and r.status='approving'
        and r.risk_version=? and r.risk_acknowledged_at is not null
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id
            and x.source_module='dogruadres-access' and x.deleted_at is null)
      for update of r`,[input.request_id,input.seller_id,STORE_RENAME_RISK_VERSION])
    if(rows.length!==1)return {status:"conflict" as const}
    const r=rows[0],org=r.organization_id as string
    if(!(await platformApprovedSellerIds(db,org)).includes(input.seller_id))
      return null
    const hashes=await db.execute(`select
      encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(?,NFKC)),
        '[[:space:]]+',' ','g')),'UTF8')),'hex') as old_hash`,[r.old_name])
    const oldHash=hashes[0]?.old_hash
    if(hashes.length!==1||typeof oldHash!=="string"||
       !/^[a-f0-9]{64}$/.test(oldHash))throw new IdentityAccessDenied()
    // Do not rewrite the original application name, ID or fingerprint:
    // only its time-bounded *claim* can expire. Subsequent renames rely
    // on the preceding approved request as their preserved name history.
    const original=await db.execute(`select id from da_store_application
      where seller_id=? and store_name_hash=? and name_claim_released_at is null
      for update`,[input.seller_id,oldHash])
    if(original.length>1)throw new IdentityAccessDenied()
    if(!original.length){
      const previous=await db.execute(`select id from da_store_rename_request
        where seller_id=? and id<>? and status='approved' and
        encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(proposed_name,NFKC)),
          '[[:space:]]+',' ','g')),'UTF8')),'hex')=?
        limit 2`,[input.seller_id,input.request_id,oldHash])
      if(previous.length!==1)return null
    }
    const approved=await db.execute(`update da_store_rename_request
      set status='approved',approved_at=clock_timestamp(),updated_at=clock_timestamp()
      where id=? and seller_id=? and status='approving'
      returning approved_at`,[input.request_id,input.seller_id])
    if(approved.length!==1||!approved[0].approved_at)throw new IdentityAccessDenied()
    if(original.length){
      // PostgreSQL retains sub-millisecond timestamp precision that a JS
      // Date round-trip can lose. Derive the exact 30-day boundary entirely
      // from the persisted approval timestamp in this same SQL transaction.
      const released=await db.execute(`update da_store_application
        set name_claim_released_at=(
          select approved_at + interval '30 days' from da_store_rename_request
          where id=? and seller_id=? and status='approved'),
          updated_at=clock_timestamp()
        where id=? and seller_id=? and name_claim_released_at is null
        returning id`,[input.request_id,input.seller_id,original[0].id,input.seller_id])
      if(released.length!==1)throw new IdentityAccessDenied()
    }
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:staff.person_id,actor_type:staff.actor_type,
      actor_id:staff.actor_id,role_context:"platform_staff",
      organization_id:org,
      action:"organization.store_rename_approved",
      module:DOGRUADRES_AUDIT_MODULE,
      resource:"store-rename-request",target_id:input.seller_id,
      new_values:{request_id:input.request_id,status:"approved",
        staff_grant_id:staff.grant_id},
      occurred_at:new Date()
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    return {status:"approved" as const,request_id:input.request_id,
      seller_id:input.seller_id}
  }

  /** A real Owner may submit a review request, NOT mutate Seller.name/handle.
   * No name is claimed here. Staff approval must recheck every uniqueness and
   * ownership invariant immediately before a separate native update workflow.
   */
  @InjectTransactionManager()
  async personalRequestStoreRename(token:string,input:{
    request_id:string;organization_id:string;seller_id:string;
    name:string;handle:string;risk_acknowledged:true;
    risk_version:typeof STORE_RENAME_RISK_VERSION
  },@MedusaContext() context:Context={}){
    if(!/^dasrn_[a-f0-9]{32}$/.test(input.request_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       typeof input.name!=="string"||!validStoreName(input.name)||
       typeof input.handle!=="string"||!validStoreHandle(input.handle)||
       input.risk_acknowledged!==true||
       input.risk_version!==STORE_RENAME_RISK_VERSION)throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const identity=await sessions.current(token,true,false)
    if(!identity)return null
    const company=await sessions.organizations(token,input.organization_id,false)
    if(!company||company.person_id!==identity.person_id||
       company.organizations.length!==1||
       company.organizations[0].role!=="owner"||
       !await isCurrentProtectedOwner(db,identity.person_id,input.organization_id))return null
    const stores=await platformApprovedSellerIds(db,input.organization_id)
    if(!stores.includes(input.seller_id))return null
    const binding=await new ActorDelegation(db).binding(token,"member")
    if(!binding||binding.binding.person_id!==identity.person_id||
       !binding.binding.actor_id)return null
    // Lock the named Seller's row and current Member link only for our local
    // request transaction. Native direct HTTP writes remain blocked at ingress.
    const native=await db.execute(`select s.name,s.handle from seller s
      join seller_member sm on sm.seller_id=s.id and sm.deleted_at is null
      join member m on m.id=sm.member_id and m.deleted_at is null and m.is_active=true
      where s.id=? and sm.member_id=? and s.deleted_at is null
        and s.status='open' and s.approved_at is not null
      for share of s,sm,m`,[input.seller_id,binding.binding.actor_id])
    if(native.length!==1||typeof native[0].name!=="string"||
       typeof native[0].handle!=="string")return null
    const oldName=native[0].name as string,oldHandle=native[0].handle as string
    // An idempotency key is scoped to the authorized Person, Organization and
    // exact payload. Replays do not duplicate audit/outbox or new requests.
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-store-rename'),hashtext(?))",
      [input.seller_id])
    const prior=await db.execute(`select organization_id,seller_id,requested_by_person_id,
      proposed_name,proposed_handle,risk_version,status
      from da_store_rename_request where id=? for update`,[input.request_id])
    if(prior.length>1)throw new IdentityAccessDenied()
    if(prior.length){
      const row=prior[0]
      if(row.organization_id!==input.organization_id||row.seller_id!==input.seller_id||
         row.requested_by_person_id!==identity.person_id||
         row.proposed_name!==input.name||row.proposed_handle!==input.handle||
         row.risk_version!==input.risk_version)throw new IdentityAccessDenied()
      return {status:row.status as string,request_id:input.request_id,replayed:true}
    }
    const pending=await db.execute(`select id from da_store_rename_request
      where seller_id=? and status in ('pending_review','approving') limit 1`,[input.seller_id])
    if(pending.length)return {status:"conflict" as const}
    const canonical=await db.execute(`select
      encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(?,NFKC)),
        '[[:space:]]+',' ','g')),'UTF8')),'hex') as requested_hash,
      encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(?,NFKC)),
        '[[:space:]]+',' ','g')),'UTF8')),'hex') as existing_hash`,
      [input.name,oldName])
    const hash=canonical[0]?.requested_hash
    if(canonical.length!==1||typeof hash!=="string"||
       !/^[a-f0-9]{64}$/.test(hash))throw new IdentityAccessDenied()
    // Name AND URL must change together; an unchanged pair is not a request.
    if(hash===canonical[0].existing_hash||input.handle===oldHandle)
      return {status:"invalid_change" as const}
    // Optimistic preflight only. It never reserves a name and the future staff
    // approval MUST repeat every check under its own mutually exclusive lock.
    const conflict=await db.execute(`select 1 from da_store_application
      where store_name_hash=? and
        (name_claim_released_at is null or name_claim_released_at>clock_timestamp())
        and (seller_id is null or seller_id<>?) limit 1`,
      [hash,input.seller_id])
    const nativeConflict=await db.execute(`select 1 from seller where id<>?
      and (deleted_at is null or deleted_at>clock_timestamp()-interval '30 days')
      and (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(name,NFKC)),
        '[[:space:]]+',' ','g')),'UTF8')),'hex')=? or lower(handle)=?)
      limit 1`,[input.seller_id,hash,input.handle])
    const held=await db.execute(`select 1 from da_store_rename_request r
      where (r.status='approving' or
        (r.status='approved' and r.approved_at>
          clock_timestamp()-interval '30 days'))
      and (
        (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(r.old_name,NFKC)),
          '[[:space:]]+',' ','g')),'UTF8')),'hex')=? or r.old_handle=?)
        or (r.status='approving' and
          (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(r.proposed_name,NFKC)),
            '[[:space:]]+',' ','g')),'UTF8')),'hex')=? or r.proposed_handle=?))
      ) limit 1`,[hash,input.handle,hash,input.handle])
    if(conflict.length||nativeConflict.length||held.length)
      return {status:"unavailable" as const}
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:identity.person_id,actor_type:identity.actor_type,actor_id:identity.actor_id,
      role_context:"owner",organization_id:input.organization_id,
      action:"organization.store_rename_requested",module:DOGRUADRES_AUDIT_MODULE,
      resource:"store-rename-request",target_id:input.seller_id,
      new_values:{request_id:input.request_id,risk_version:STORE_RENAME_RISK_VERSION,
        status:"pending_review"},occurred_at:new Date()
    }],context)
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const rows=await db.execute(`insert into da_store_rename_request
      (id,organization_id,seller_id,requested_by_person_id,old_name,old_handle,
       proposed_name,proposed_handle,risk_version,risk_acknowledged_at,
       source_audit_event_id,status)
      values(?,?,?,?,?,?,?,?,?,clock_timestamp(),?,'pending_review')
      returning id`,[input.request_id,input.organization_id,input.seller_id,
       identity.person_id,oldName,oldHandle,input.name,input.handle,
       STORE_RENAME_RISK_VERSION,audit.id])
    if(rows.length!==1)throw new IdentityAccessDenied()
    return {status:"pending_review" as const,request_id:input.request_id,replayed:false}
  }

  /** A current protected Owner may withdraw the organization's pending name/URL
   * change, without modifying the approved native Seller. Reuse the same
   * per-Seller transaction advisory lock as Staff approve/reject: once Staff
   * claims an approval, cancellation cannot silently override that decision.
   */
  @InjectTransactionManager()
  async personalWithdrawStoreRenameRequest(token:string,input:{
    request_id:string;organization_id:string;seller_id:string
  },@MedusaContext() context:Context={}){
    if(!/^dasrn_[a-f0-9]{32}$/.test(input.request_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const identity=await sessions.current(token,true,false)
    if(!identity)return null
    const company=await sessions.organizations(token,input.organization_id,false)
    if(!company||company.person_id!==identity.person_id||
       company.organizations.length!==1||
       company.organizations[0].role!=="owner"||
       !await isCurrentProtectedOwner(db,identity.person_id,input.organization_id))
      return null
    if(!(await platformApprovedSellerIds(db,input.organization_id)).includes(input.seller_id))
      return null
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-store-rename'),hashtext(?))",
      [input.seller_id])
    const rows=await db.execute(`select r.id,r.status,r.risk_version
      from da_store_rename_request r
      join da_organization d on d.id=r.organization_id
        and d.status='active' and d.deleted_at is null
      join seller s on s.id=r.seller_id and s.deleted_at is null
      join da_organization_seller_ownership o
        on o.seller_id=r.seller_id and o.organization_id=r.organization_id
        and o.revoked_at is null
      join da_audit_event origin on origin.id=o.verification_audit_event_id
        and origin.deleted_at is null and origin.organization_id=r.organization_id
        and origin.target_id=r.seller_id and origin.module='dogruadres-access'
      join da_audit_event e on e.id=r.source_audit_event_id
        and e.deleted_at is null and e.module='dogruadres-access'
        and e.action='organization.store_rename_requested'
        and e.resource='store-rename-request'
        and e.organization_id=r.organization_id and e.target_id=r.seller_id
        and e.actor_person_id=r.requested_by_person_id
        and e.new_values->>'request_id'=r.id
        and e.new_values->>'risk_version'=r.risk_version
      where r.id=? and r.organization_id=? and r.seller_id=?
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id and x.deleted_at is null
            and x.source_module='dogruadres-access')
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=origin.id and x.deleted_at is null
            and x.source_module='dogruadres-access')
      for update of r`,[input.request_id,input.organization_id,
      input.seller_id])
    if(rows.length!==1||rows[0].risk_version!==STORE_RENAME_RISK_VERSION||
       rows[0].status!=="pending_review")
      return {status:"conflict" as const}
    const updated=await db.execute(`update da_store_rename_request
      set status='withdrawn',updated_at=clock_timestamp()
      where id=? and organization_id=? and seller_id=?
        and status='pending_review'
      returning id`,[input.request_id,input.organization_id,
      input.seller_id]
    if(updated.length!==1||updated[0].id!==input.request_id)
      throw new IdentityAccessDenied()
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:identity.person_id,actor_type:identity.actor_type,
      actor_id:identity.actor_id,role_context:"owner",
      organization_id:input.organization_id,
      action:"organization.store_rename_withdrawn",
      module:DOGRUADRES_AUDIT_MODULE,
      resource:"store-rename-request",target_id:input.seller_id,
      new_values:{request_id:input.request_id,status:"withdrawn"},
      occurred_at:new Date()
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    return {status:"withdrawn" as const,request_id:input.request_id,
      seller_id:input.seller_id}
  }

  /** Private Owner readback for uncertain requests. No native rename or
   * approval outcome is inferred from a pending request.
   */
  @InjectTransactionManager()
  async personalStoreRenameRequests(token:string,organizationId:string,sellerId:string,
    @MedusaContext() context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)||
       !/^sel_[A-Za-z0-9_-]+$/.test(sellerId))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const identity=await sessions.current(token,true,false)
    if(!identity)return null
    const scope=await sessions.organizations(token,organizationId,false)
    if(!scope||scope.person_id!==identity.person_id||
       scope.organizations.length!==1||scope.organizations[0].role!=="owner"||
       !await isCurrentProtectedOwner(db,identity.person_id,organizationId))return null
    if(!(await platformApprovedSellerIds(db,organizationId)).includes(sellerId))return null
    const requests=await db.execute(`select id,status,proposed_name,proposed_handle,
      created_at from da_store_rename_request
      where organization_id=? and seller_id=?
      order by created_at desc,id desc limit 10`,[organizationId,sellerId])
    if(requests.length>10||requests.some(row=>typeof row.id!=="string"||
       !/^dasrn_[a-f0-9]{32}$/.test(row.id)||
       !["pending_review","approved","rejected","withdrawn"].includes(row.status)))
      throw new IdentityAccessDenied()
    return {organization_id:organizationId,seller_id:sellerId,
      requests:requests.map(row=>({id:row.id as string,status:row.status as string,
        proposed_name:row.proposed_name as string,
        proposed_handle:row.proposed_handle as string,
        created_at:row.created_at}))}
  }

  // B22: legal ownership candidates are NOT a grant, and never leave this
  // module without separately verified live native Seller/Member authority.
  @InjectTransactionManager()
  async personalLegalSellerIds(token: string, organizationId: string,
    @MedusaContext() context: Context = {}) {
    return authorizedLegalSellerIds(securitySql(context.transactionManager), token, organizationId)
  }


  // B22: Only a currently authenticated Organization Owner may change one
  // independently assigned products.edit grant for a member of THAT same Org.
  // Atomic Foundation audit/outbox is authoritative, not Mercur is_owner.
  // Native Seller status is additionally checked by the public POST adapter.
  @InjectTransactionManager()
  async personalChangeStoreProductPermission(
    token:string,input:{action:"grant"|"revoke";organization_id:string;seller_id:string;membership_id:string},
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !/^[A-Za-z0-9_-]{1,128}$/.test(input.membership_id)||
       !["grant","revoke"].includes(input.action))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const current=await sessions.current(token,true,false)
    if(!current)return null
    const owner=await sessions.organizations(token,input.organization_id,false)
    if(!owner||owner.person_id!==current.person_id||owner.organizations.length!==1||
       owner.organizations[0].role!=="owner")return null
    // Serialize with Foundation membership mutations and other grant requests.
    // The same central role policy that protects membership changes also
    // governs Owner management of a member's Store action permissions.
    // Keep the live protected-Owner row lock for these Foundation writes.
    if(!organizationActionAllowed("owner","membership.manage",
       await isCurrentProtectedOwner(db,current.person_id,input.organization_id),false))return null
    const target=await db.execute(`select m.person_id from da_organization_membership m
      join da_person p on p.id=m.person_id
      where m.id=? and m.organization_id=? and m.deleted_at is null
        and p.disabled_at is null and p.deleted_at is null
        -- Protected Owner permissions are not editable individual grants.
        -- Legacy admin may only have an older personal grant revoked.
        and m.role in ('member','admin') and m.protected_owner=false
        ${input.action==="grant"?"and m.role='member' and m.status='active'":""}
      for share of m,p`,[input.membership_id,input.organization_id])
    if(target.length!==1||typeof target[0].person_id!=="string"||
       !/^daprs_[A-Za-z0-9_-]+$/.test(target[0].person_id))return null
    const targetPerson=target[0].person_id as string
    await db.execute(`select pg_advisory_xact_lock(
      hashtext('b22-products-edit'),hashtext(?))`,
      [input.organization_id+":"+input.seller_id+":"+targetPerson])
    const active=await db.execute(`select id from da_store_product_permission
      where person_id=? and organization_id=? and seller_id=?
        and permission='products.edit' and revoked_at is null for update`,
      [targetPerson,input.organization_id,input.seller_id])
    if(active.length>1)throw new IdentityAccessDenied()
    if(input.action==="grant"){
      const authorized=await platformApprovedSellerIds(db,input.organization_id)
      if(!authorized.includes(input.seller_id))return null
      if(active.length){
        if(!await verifiedStoreProductEditGrant(db,targetPerson,input.organization_id,input.seller_id))
          throw new IdentityAccessDenied()
        return {status:"active" as const,grant_id:active[0].id as string}
      }
      const id="daspg_"+randomUUID()
      const [audit]=await this.persistAuditEventsWithOutbox_([{
        actor_person_id:current.person_id,actor_type:current.actor_type,actor_id:current.actor_id,
        role_context:"owner",organization_id:input.organization_id,
        action:"organization.store_product_permission_granted",module:DOGRUADRES_AUDIT_MODULE,
        resource:"store-product-permission",target_id:input.seller_id,
        new_values:{grant_id:id,person_id:targetPerson,permission:"products.edit"},
        occurred_at:new Date()
      }],context)
      await (context.transactionManager as {flush():Promise<void>}).flush()
      await db.execute(`insert into da_store_product_permission
        (id,person_id,organization_id,seller_id,permission,issued_by_person_id,source_audit_event_id)
        values (?,?,?,?,'products.edit',?,?)`,
        [id,targetPerson,input.organization_id,input.seller_id,current.person_id,audit.id])
      return {status:"active" as const,grant_id:id}
    }
    if(active.length===0)return {status:"revoked" as const,grant_id:null}
    const grantId=active[0].id as string
    const [event]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:current.person_id,actor_type:current.actor_type,actor_id:current.actor_id,
      role_context:"owner",organization_id:input.organization_id,
      action:"organization.store_product_permission_revoked",module:DOGRUADRES_AUDIT_MODULE,
      resource:"store-product-permission",target_id:input.seller_id,
      previous_values:{grant_id:grantId,person_id:targetPerson,permission:"products.edit"},
      new_values:{grant_id:grantId,status:"revoked"},occurred_at:new Date()
    }],context)
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const result=await db.execute(`update da_store_product_permission
      set revoked_at=clock_timestamp() where id=? and revoked_at is null
      returning id`,[grantId])
    if(result.length!==1||!event.id)throw new IdentityAccessDenied()
    return {status:"revoked" as const,grant_id:grantId}
  }


  /**
   * B22: the Owner activates an ALREADY AUDITED products.edit grant for an
   * ALREADY VERIFIED native Member. This is never identity registration,
   * Organization membership creation or an independent product permission.
   * The Store/Person grant lock is shared with Owner revoke and draft writes.
   * Native link creation emits Mercur's seller_member.created event; if its
   * outcome is uncertain the caller must read native membership, not replay
   * an assumed failure.
   */
  @InjectTransactionManager()
  async personalWithStoreMemberConnectionLock(
    token:string,
    input:{organization_id:string;seller_id:string;membership_id:string},
    execute:(memberId:string,context:Context)=>Promise<{created:boolean}>,
    @MedusaContext() context:Context={}
  ):Promise<{created:boolean}|null>{
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !/^[A-Za-z0-9_-]{1,128}$/.test(input.membership_id)||
       typeof execute!=="function")throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const sessions=new IdentitySessions(db)
    const current=await sessions.current(token,true,false)
    if(!current)return null
    const org=await sessions.organizations(token,input.organization_id,false)
    if(!org||org.person_id!==current.person_id||org.organizations.length!==1||
       org.organizations[0].role!=="owner"||
       !organizationActionAllowed("owner","membership.manage",
         await isCurrentProtectedOwner(db,current.person_id,input.organization_id),false))
      return null

    // Ordinary member ONLY: historical Organization admin and protected Owner
    // roles cannot become technical Store members through this narrow action.
    const targets=await db.execute(
      "select m.person_id from da_organization_membership m "+
      "join da_person p on p.id=m.person_id "+
      "where m.id=? and m.organization_id=? and m.role='member' "+
      "and m.protected_owner=false and m.status='active' "+
      "and m.deleted_at is null and m.revoked_at is null "+
      "and p.disabled_at is null and p.deleted_at is null for share of m,p",
      [input.membership_id,input.organization_id])
    if(targets.length!==1||typeof targets[0].person_id!=="string"||
       !/^daprs_[A-Za-z0-9_-]+$/.test(targets[0].person_id)||
       targets[0].person_id===current.person_id)return null
    const targetPerson=targets[0].person_id as string

    // Same lock as permission grant/revoke and native draft creation.
    await db.execute(
      "select pg_advisory_xact_lock(hashtext('b22-products-edit'),hashtext(?))",
      [input.organization_id+":"+input.seller_id+":"+targetPerson])
    if(!await verifiedStoreProductEditGrant(db,targetPerson,
         input.organization_id,input.seller_id))return null
    if(!(await platformApprovedSellerIds(db,input.organization_id))
       .includes(input.seller_id))return null
    const ownership=await db.execute(
      "select seller_id from da_organization_seller_ownership "+
      "where organization_id=? and seller_id=? and revoked_at is null for share",
      [input.organization_id,input.seller_id])
    if(ownership.length!==1)return null

    // A secondary Member must have completed the existing native password/MFA
    // proof. A primary Member is accepted only with its verified login binding.
    // Neither email equality nor a SellerMember flag binds two Persons.
    const secondary=await db.execute(
      "select b.actor_id,b.auth_identity_id from da_verified_actor_binding b "+
      "join da_actor_mapping a on a.person_id=b.person_id "+
      "and a.actor_type='member' and a.actor_id=b.actor_id and a.deleted_at is null "+
      "where b.person_id=? and b.actor_type='member' "+
      "and b.verified_at is not null and b.revoked_at is null for share of b,a",
      [targetPerson])
    const primary=await db.execute(
      "select l.actor_id,l.auth_identity_id from da_login_binding l "+
      "join da_actor_mapping a on a.person_id=l.person_id "+
      "and a.actor_type='member' and a.actor_id=l.actor_id and a.deleted_at is null "+
      "where l.person_id=? and l.actor_type='member' "+
      "and l.verified_at is not null and l.revoked_at is null for share of l,a",
      [targetPerson])
    const bindings=[...secondary,...primary]
    if(bindings.length!==1||typeof bindings[0].actor_id!=="string"||
       !/^mem_[A-Za-z0-9_-]+$/.test(bindings[0].actor_id)||
       typeof bindings[0].auth_identity_id!=="string"||
       !bindings[0].auth_identity_id)return null
    const nativeMemberId=bindings[0].actor_id as string
    const outcome=await execute(nativeMemberId,context)
    if(!outcome||typeof outcome.created!=="boolean")throw new IdentityAccessDenied()
    // Reconcile native success after an interrupted Foundation audit write:
    // an existing correctly-scoped native link may be confirmed, but not
    // duplicated, and it is never itself a products.edit permission.
    const audits=await db.execute(
      "select e.id,exists(select 1 from da_audit_outbox x "+
      "where x.source_audit_event_id=e.id and x.source_module='dogruadres-access' "+
      "and x.deleted_at is null) as proof from da_audit_event e "+
      "where e.action='organization.store_native_member_connection_confirmed' "+
      "and e.module='dogruadres-access' and e.resource='store-member-connection' "+
      "and e.organization_id=? and e.target_id=? "+
      "and e.new_values->>'person_id'=? and e.new_values->>'member_id'=? "+
      "and e.deleted_at is null limit 2",
      [input.organization_id,input.seller_id,targetPerson,nativeMemberId])
    if(audits.length>1||audits.some(r=>r.proof!==true))
      throw new IdentityAccessDenied()
    if(!audits.length){
      await this.persistAuditEventsWithOutbox_([{
        actor_person_id:current.person_id,actor_type:current.actor_type,
        actor_id:current.actor_id,role_context:"owner",
        organization_id:input.organization_id,
        action:"organization.store_native_member_connection_confirmed",
        module:DOGRUADRES_AUDIT_MODULE,resource:"store-member-connection",
        target_id:input.seller_id,
        new_values:{person_id:targetPerson,member_id:nativeMemberId,
          role_id:"role_seller_support",source_permission:"products.edit"},
        occurred_at:new Date()
      }],context)
      await (context.transactionManager as {flush():Promise<void>}).flush()
    }
    return outcome
  }

  @InjectTransactionManager()
  async personalListStoreProductPermissions(token:string,organizationId:string,
    @MedusaContext() context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),s=new IdentitySessions(db)
    const current=await s.organizations(token,organizationId,false)
    if(!current||current.organizations.length!==1||
       current.organizations[0].role!=="owner"||
       !organizationActionAllowed("owner","membership.list",
         await isCurrentProtectedOwner(db,current.person_id,organizationId),false))return null
    const rows=await db.execute(`select g.id,g.person_id,g.seller_id
      from da_store_product_permission g
      join da_audit_event e on e.id=g.source_audit_event_id
       and e.deleted_at is null and e.module='dogruadres-access'
       and e.actor_person_id=g.issued_by_person_id
       and e.organization_id=g.organization_id and e.target_id=g.seller_id
       and e.action='organization.store_product_permission_granted'
       and e.resource='store-product-permission'
       and e.new_values->>'grant_id'=g.id
       and e.new_values->>'person_id'=g.person_id
       and e.new_values->>'permission'=g.permission
      where g.organization_id=? and g.permission='products.edit'
       and g.revoked_at is null and (g.expires_at is null or g.expires_at>statement_timestamp())
       and exists(select 1 from da_audit_outbox x
         where x.source_audit_event_id=e.id and x.source_module='dogruadres-access'
         and x.deleted_at is null)
      order by g.id limit 101`,[organizationId])
    if(rows.length>100||rows.some(g=>typeof g.id!=="string"||
       !/^daspg_[A-Za-z0-9_-]+$/.test(g.id)||typeof g.person_id!=="string"||
       !/^daprs_[A-Za-z0-9_-]+$/.test(g.person_id)||
       typeof g.seller_id!=="string"||!/^sel_[A-Za-z0-9_-]+$/.test(g.seller_id)))
      throw new IdentityAccessDenied()
    return rows as Array<{id:string;person_id:string;seller_id:string}>
  }



  // B22: only active Organization Owner issues/revokes explicit buyer.purchase.
  // This does NOT authorize a Customer token or a cart/checkout operation.
  @InjectTransactionManager()
  async personalChangeBuyerPermission(
    token:string,input:{action:"grant"|"revoke";organization_id:string;membership_id:string},
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^[A-Za-z0-9_-]{1,128}$/.test(input.membership_id)||
       !["grant","revoke"].includes(input.action))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const current=await sessions.current(token,true,false)
    if(!current)return null
    const owner=await sessions.organizations(token,input.organization_id,false)
    if(!owner||owner.person_id!==current.person_id||owner.organizations.length!==1||
       owner.organizations[0].role!=="owner")return null
    // Role-only ownership never grants authority to edit member permissions.
    // A narrowed Owner role must also deny this buyer grant/revoke writer.
    if(!organizationActionAllowed("owner","membership.manage",
       await isCurrentProtectedOwner(db,current.person_id,input.organization_id),false))return null
    const target=await db.execute(`select m.person_id from da_organization_membership m
      join da_person p on p.id=m.person_id
      where m.id=? and m.organization_id=? and m.deleted_at is null
        and p.deleted_at is null and p.disabled_at is null
        ${input.action==="grant"?"and m.status='active'":""}
      for share of m,p`,[input.membership_id,input.organization_id])
    if(target.length!==1||typeof target[0].person_id!=="string"||
       !/^daprs_[A-Za-z0-9_-]+$/.test(target[0].person_id))return null
    const personId=target[0].person_id as string
    await db.execute(`select pg_advisory_xact_lock(
      hashtext('b22-buyer-purchase'),hashtext(?))`,
      [input.organization_id+":"+personId])
    // Recheck issuer after locks; never rely on an earlier UI role label.
    const currentOwner=await sessions.organizations(token,input.organization_id,false)
    if(!currentOwner||currentOwner.person_id!==current.person_id||
       currentOwner.organizations.length!==1||
       currentOwner.organizations[0].role!=="owner")return null
    const active=await db.execute(`select id from da_organization_buyer_permission
      where person_id=? and organization_id=? and permission='buyer.purchase'
        and revoked_at is null for update`,[personId,input.organization_id])
    if(active.length>1)throw new IdentityAccessDenied()
    if(input.action==="grant"){
      if(active.length){
        if(!await verifiedBuyerPurchaseGrant(db,personId,input.organization_id))
          throw new IdentityAccessDenied()
        return {status:"active" as const,grant_id:active[0].id as string}
      }
      const grantId="dabpg_"+randomUUID()
      const [audit]=await this.persistAuditEventsWithOutbox_([{
        actor_person_id:current.person_id,actor_type:current.actor_type,actor_id:current.actor_id,
        role_context:"owner",organization_id:input.organization_id,
        action:"organization.buyer_permission_granted",module:DOGRUADRES_AUDIT_MODULE,
        resource:"buyer-permission",target_id:personId,
        new_values:{grant_id:grantId,person_id:personId,permission:"buyer.purchase"},
        occurred_at:new Date()
      }],context)
      await (context.transactionManager as {flush():Promise<void>}).flush()
      await db.execute(`insert into da_organization_buyer_permission
        (id,person_id,organization_id,permission,issued_by_person_id,source_audit_event_id)
        values (?,?,?,'buyer.purchase',?,?)`,
        [grantId,personId,input.organization_id,current.person_id,audit.id])
      return {status:"active" as const,grant_id:grantId}
    }
    if(active.length===0)return {status:"revoked" as const,grant_id:null}
    const grantId=active[0].id as string
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:current.person_id,actor_type:current.actor_type,actor_id:current.actor_id,
      role_context:"owner",organization_id:input.organization_id,
      action:"organization.buyer_permission_revoked",module:DOGRUADRES_AUDIT_MODULE,
      resource:"buyer-permission",target_id:personId,
      previous_values:{grant_id:grantId,person_id:personId,permission:"buyer.purchase"},
      new_values:{grant_id:grantId,status:"revoked"},occurred_at:new Date()
    }],context)
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const changed=await db.execute(`update da_organization_buyer_permission
      set revoked_at=clock_timestamp()
      where id=? and revoked_at is null returning id`,[grantId])
    if(changed.length!==1||!audit.id)throw new IdentityAccessDenied()
    return {status:"revoked" as const,grant_id:grantId}
  }

  @InjectTransactionManager()
  async personalListBuyerPermissions(
    token:string,organizationId:string,@MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),session=new IdentitySessions(db)
    const current=await session.organizations(token,organizationId,false)
    if(!current||current.organizations.length!==1||
       current.organizations[0].role!=="owner"||
       !organizationActionAllowed("owner","membership.list",
         await isCurrentProtectedOwner(db,current.person_id,organizationId),false))return null
    const rows=await db.execute(`select g.id,g.person_id
      from da_organization_buyer_permission g
      join da_audit_event e on e.id=g.source_audit_event_id
        and e.deleted_at is null and e.module='dogruadres-access'
        and e.actor_person_id=g.issued_by_person_id
        and e.organization_id=g.organization_id and e.target_id=g.person_id
        and e.action='organization.buyer_permission_granted'
        and e.resource='buyer-permission'
        and e.new_values->>'grant_id'=g.id
        and e.new_values->>'person_id'=g.person_id
        and e.new_values->>'permission'=g.permission
      where g.organization_id=? and g.permission='buyer.purchase'
        and g.revoked_at is null
        and (g.expires_at is null or g.expires_at>statement_timestamp())
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id
            and x.source_module='dogruadres-access' and x.deleted_at is null)
      order by g.id limit 101`,[organizationId])
    if(rows.length>100||rows.some(g=>typeof g.id!=="string"||
       !/^dabpg_[A-Za-z0-9_-]+$/.test(g.id)||
       typeof g.person_id!=="string"||!/^daprs_[A-Za-z0-9_-]+$/.test(g.person_id)))
      throw new IdentityAccessDenied()
    return rows as Array<{id:string;person_id:string}>
  }

  /** B22: Store-scoped Buyer Organization block is a Seller policy, NOT a
   * user permission. Only a strong, live Foundation Organization Owner may
   * write it. Native Seller approval/member checks remain in the HTTP edge.
   * A block never cancels historical orders or enables checkout.
   */
  @InjectTransactionManager()
  async personalChangeStoreBuyerBlock(
    token:string,input:{action:"block"|"unblock";organization_id:string;
      seller_id:string;buyer_organization_id:string},
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.buyer_organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !["block","unblock"].includes(input.action))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const current=await sessions.current(token,true,false)
    if(!current)return null
    const owner=await sessions.organizations(token,input.organization_id,false)
    if(!owner||owner.person_id!==current.person_id||
       owner.organizations.length!==1||owner.organizations[0].role!=="owner")return null
    // Authoritative protected Owner check holds the live membership row lock
    // in the same Foundation transaction as the domain and audit writes.
    if(!await isCurrentProtectedOwner(db,current.person_id,input.organization_id))return null
    const target=await db.execute(`select id from da_organization
      where id=? and deleted_at is null for share`,[input.buyer_organization_id])
    if(target.length!==1)return null
    await db.execute(`select pg_advisory_xact_lock(
      hashtext('b22-store-buyer-block'),hashtext(?))`,
      [input.seller_id+":"+input.buyer_organization_id])
    const finalOwner=await sessions.organizations(token,input.organization_id,false)
    if(!finalOwner||finalOwner.person_id!==current.person_id||
       finalOwner.organizations.length!==1||
       finalOwner.organizations[0].role!=="owner")return null
    const sellers=await platformApprovedSellerIds(db,input.organization_id)
    if(!sellers.includes(input.seller_id))return null
    const rows=await db.execute(`select b.id,
      exists(select 1 from da_audit_event e
        where e.id=b.source_audit_event_id and e.deleted_at is null
          and e.module='dogruadres-access'
          and e.action='organization.store_buyer_blocked'
          and e.resource='store-buyer-block'
          and e.organization_id=b.owner_organization_id
          and e.actor_person_id=b.issued_by_person_id
          and e.target_id=b.seller_id
          and e.new_values->>'block_id'=b.id
          and e.new_values->>'buyer_organization_id'=b.buyer_organization_id
          and exists(select 1 from da_audit_outbox x
            where x.source_audit_event_id=e.id
              and x.source_module='dogruadres-access'
              and x.deleted_at is null)) as proof
      from da_store_buyer_organization_block b
      where b.owner_organization_id=? and b.seller_id=?
        and b.buyer_organization_id=? and b.revoked_at is null
      for update of b`,[input.organization_id,input.seller_id,input.buyer_organization_id])
    if(rows.length>1||rows.some(r=>r.proof!==true||typeof r.id!=="string"||
       !/^dasbb_[A-Za-z0-9_-]+$/.test(r.id)))throw new IdentityAccessDenied()
    if(input.action==="block"){
      if(rows.length===1)return {status:"blocked" as const}
      const id="dasbb_"+randomUUID()
      const [audit]=await this.persistAuditEventsWithOutbox_([{
        actor_person_id:current.person_id,actor_type:current.actor_type,
        actor_id:current.actor_id,role_context:"owner",
        organization_id:input.organization_id,
        action:"organization.store_buyer_blocked",module:DOGRUADRES_AUDIT_MODULE,
        resource:"store-buyer-block",target_id:input.seller_id,
        new_values:{block_id:id,buyer_organization_id:input.buyer_organization_id},
        occurred_at:new Date()
      }],context)
      await (context.transactionManager as {flush():Promise<void>}).flush()
      const inserted=await db.execute(`insert into da_store_buyer_organization_block
        (id,owner_organization_id,seller_id,buyer_organization_id,
         issued_by_person_id,source_audit_event_id)
        values (?,?,?,?,?,?) returning id`,
        [id,input.organization_id,input.seller_id,
         input.buyer_organization_id,current.person_id,audit.id])
      if(inserted.length!==1)throw new IdentityAccessDenied()
      return {status:"blocked" as const}
    }
    if(rows.length===0)return {status:"unblocked" as const}
    const id=rows[0].id as string
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:current.person_id,actor_type:current.actor_type,
      actor_id:current.actor_id,role_context:"owner",
      organization_id:input.organization_id,
      action:"organization.store_buyer_unblocked",module:DOGRUADRES_AUDIT_MODULE,
      resource:"store-buyer-block",target_id:input.seller_id,
      previous_values:{block_id:id,buyer_organization_id:input.buyer_organization_id},
      new_values:{block_id:id,status:"unblocked"},occurred_at:new Date()
    }],context)
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const changed=await db.execute(`update da_store_buyer_organization_block
      set revoked_at=clock_timestamp(),revoked_by_person_id=?,
        revocation_audit_event_id=?
      where id=? and revoked_at is null returning id`,
      [current.person_id,audit.id,id])
    if(changed.length!==1)throw new IdentityAccessDenied()
    return {status:"unblocked" as const}
  }


  /** Audited Buyer Organization admission into a native Seller-owned group.
   * Native Seller/Member/CustomerGroup link verified at the first-party edge;
   * no Person Customer membership, private price or checkout is enabled.
   */
  @InjectTransactionManager()
  async personalStorePriceGroupAccess(
    token:string,input:{action:"grant"|"revoke"|"read";organization_id:string;
      seller_id:string;buyer_organization_id:string;customer_group_id:string;
      member_binding_id:string;member_actor_id:string;member_person_id:string},
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.buyer_organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !/^cusgroup_[A-Za-z0-9_-]+$/.test(input.customer_group_id)||
       !/^dabind_[A-Za-z0-9_-]+$/.test(input.member_binding_id)||
       !/^[A-Za-z0-9_-]{1,160}$/.test(input.member_actor_id)||
       !/^daprs_[A-Za-z0-9_-]+$/.test(input.member_person_id)||
       !["grant","revoke","read"].includes(input.action))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const current=await sessions.current(token,true,false)
    if(!current||current.person_id!==input.member_person_id)return null

    // Serialize with supported AccountLinking.unlink() on the exact actor.
    // The primary session/Person epoch is already locked by current().
    await db.execute(`select pg_advisory_xact_lock(
      hashtext('da-actor-link'),hashtext(?))`,
      ["member:"+input.member_actor_id])
    const currentBindings=await db.execute(`select b.id from da_verified_actor_binding b
      join da_actor_mapping a on a.person_id=b.person_id
        and a.actor_type=b.actor_type and a.actor_id=b.actor_id
        and a.deleted_at is null
      where b.id=? and b.person_id=? and b.actor_type='member'
        and b.actor_id=? and b.verified_at is not null
        and b.revoked_at is null for share of b,a`,
      [input.member_binding_id,current.person_id,input.member_actor_id])
    if(currentBindings.length!==1||currentBindings[0].id!==input.member_binding_id)
      return null
    const allowed=async()=>{
      const member=await sessions.organizations(token,input.organization_id,false)
      if(!member||member.person_id!==current.person_id||
         member.organizations.length!==1||member.organizations[0].role!=="owner")return false
      if(!organizationActionAllowed("owner","price.group.manage",
           await isCurrentProtectedOwner(db,current.person_id,input.organization_id),false))return false
      return (await platformApprovedSellerIds(db,input.organization_id)).includes(input.seller_id)
    }
    if(!await allowed())return null
    await db.execute(`select pg_advisory_xact_lock(
      hashtext('b22-price-group'),hashtext(?))`,
      [input.seller_id+":"+input.buyer_organization_id+":"+input.customer_group_id])
    if(!await allowed())return null
    // A suspended Buyer cannot read even the existence of a former grant;
    // revocation remains available for safe administrative cleanup.
    if(input.action!=="revoke"){
      const target=await db.execute(`select id from da_organization
        where id=? and status='active' and deleted_at is null for share`,
        [input.buyer_organization_id])
      if(target.length!==1)return null
    }
    const rows=await db.execute(`select g.id,
      exists(select 1 from da_audit_event e
        where e.id=g.source_audit_event_id and e.deleted_at is null
          and e.module='dogruadres-access'
          and e.action='organization.store_price_group_granted'
          and e.resource='store-price-group'
          and e.organization_id=g.owner_organization_id
          and e.actor_person_id=g.issued_by_person_id
          and e.target_id=g.seller_id
          and e.new_values->>'grant_id'=g.id
          and e.new_values->>'customer_group_id'=g.customer_group_id
          and e.new_values->>'buyer_organization_id'=g.buyer_organization_id
          and exists(select 1 from da_audit_outbox o
            where o.source_audit_event_id=e.id
              and o.source_module='dogruadres-access' and o.deleted_at is null)
      ) as proof
      from da_store_buyer_price_group g
      where g.owner_organization_id=? and g.seller_id=?
        and g.buyer_organization_id=? and g.customer_group_id=?
        and g.revoked_at is null for update of g`,
      [input.organization_id,input.seller_id,input.buyer_organization_id,
       input.customer_group_id])
    if(rows.length>1||rows.some(row=>row.proof!==true||
       typeof row.id!=="string"||!/^dabpgm_[A-Za-z0-9_-]+$/.test(row.id)))
      throw new IdentityAccessDenied()
    if(input.action==="read")return {status:rows.length?"active" as const:"revoked" as const}
    if(input.action==="grant"){
      if(rows.length)return {status:"active" as const}
      const grantId="dabpgm_"+randomUUID()
      const [audit]=await this.persistAuditEventsWithOutbox_([{
        actor_person_id:current.person_id,actor_type:current.actor_type,
        actor_id:current.actor_id,role_context:"owner",
        organization_id:input.organization_id,
        action:"organization.store_price_group_granted",
        module:DOGRUADRES_AUDIT_MODULE,resource:"store-price-group",
        target_id:input.seller_id,
        new_values:{grant_id:grantId,customer_group_id:input.customer_group_id,
          buyer_organization_id:input.buyer_organization_id},occurred_at:new Date()
      }],context)
      await (context.transactionManager as {flush():Promise<void>}).flush()
      const inserted=await db.execute(`insert into da_store_buyer_price_group
        (id,owner_organization_id,seller_id,buyer_organization_id,
         customer_group_id,issued_by_person_id,source_audit_event_id)
        values (?,?,?,?,?,?,?) returning id`,
        [grantId,input.organization_id,input.seller_id,input.buyer_organization_id,
         input.customer_group_id,current.person_id,audit.id])
      if(inserted.length!==1)throw new IdentityAccessDenied()
      return {status:"active" as const}
    }
    if(!rows.length)return {status:"revoked" as const}
    const grantId=rows[0].id as string
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:current.person_id,actor_type:current.actor_type,
      actor_id:current.actor_id,role_context:"owner",
      organization_id:input.organization_id,
      action:"organization.store_price_group_revoked",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-price-group",
      target_id:input.seller_id,
      previous_values:{grant_id:grantId,customer_group_id:input.customer_group_id,
        buyer_organization_id:input.buyer_organization_id},
      new_values:{grant_id:grantId,status:"revoked"},occurred_at:new Date()
    }],context)
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const updated=await db.execute(`update da_store_buyer_price_group
      set revoked_at=clock_timestamp(),revoked_by_person_id=?,
        revocation_audit_event_id=?
      where id=? and revoked_at is null returning id`,
      [current.person_id,audit.id,grantId])
    if(updated.length!==1)throw new IdentityAccessDenied()
    return {status:"revoked" as const}
  }


  /**
   * Server-only active Buyer Organization's Store-specific price group IDs.
   * This is neither native Person/Customer group membership nor checkout
   * authority. The catalog checks current Store Buyer block and native scope
   * separately; each call verifies Foundation's current buyer + Store origin.
   */
  @InjectTransactionManager()
  async personalBuyerStorePriceGroupIds(
    token:string,buyerOrganizationId:string,sellerId:string,
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(buyerOrganizationId)||
       !/^sel_[A-Za-z0-9_-]+$/.test(sellerId))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const buyer=await authorizedBuyerOrganization(db,token,buyerOrganizationId)
    if(!buyer)return null
    const owners=await db.execute(`select organization_id from
      da_organization_seller_ownership where seller_id=? and revoked_at is null`,
      [sellerId])
    if(owners.length!==1||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(owners[0]?.organization_id))
      throw new IdentityAccessDenied()
    const ownerOrganizationId=owners[0].organization_id as string
    if(!(await platformApprovedSellerIds(db,ownerOrganizationId)).includes(sellerId))
      throw new IdentityAccessDenied()
    const rows=await db.execute(`select g.id,g.customer_group_id,
      g.owner_organization_id,
      exists(select 1 from da_audit_event e
        where e.id=g.source_audit_event_id and e.deleted_at is null
          and e.module='dogruadres-access'
          and e.resource='store-price-group'
          and e.action='organization.store_price_group_granted'
          and e.organization_id=g.owner_organization_id
          and e.actor_person_id=g.issued_by_person_id
          and e.target_id=g.seller_id
          and e.new_values->>'grant_id'=g.id
          and e.new_values->>'buyer_organization_id'=g.buyer_organization_id
          and e.new_values->>'customer_group_id'=g.customer_group_id
          and exists(select 1 from da_audit_outbox x
            where x.source_audit_event_id=e.id
              and x.source_module='dogruadres-access'
              and x.deleted_at is null)
      ) as proof
      from da_store_buyer_price_group g
      where g.seller_id=? and g.buyer_organization_id=?
        and g.revoked_at is null
      order by g.customer_group_id,g.id limit 21`,
      [sellerId,buyerOrganizationId])
    if(rows.length>20||
       new Set(rows.map(x=>x.customer_group_id)).size!==rows.length||
       rows.some(x=>x.proof!==true||
         typeof x.id!=="string"||!/^dabpgm_[A-Za-z0-9_-]+$/.test(x.id)||
         x.owner_organization_id!==ownerOrganizationId||
         typeof x.customer_group_id!=="string"||
         !/^cusgroup_[A-Za-z0-9_-]+$/.test(x.customer_group_id)))
      throw new IdentityAccessDenied()
    return {person_id:buyer.person_id,
      organization_id:buyerOrganizationId,seller_id:sellerId,
      customer_group_ids:rows.map(x=>x.customer_group_id as string)}
  }

  /** Read-only native Seller set against Foundation's authoritative Store
   * Buyer Organization block ledger. A missing or malformed audit/outbox
   * never becomes ALLOW; true means any Store denies this Buyer Organization.
   */
  @InjectTransactionManager()
  async personalStoreBuyerBlockDecision(
    token:string,buyerOrganizationId:string,sellerIds:string[],
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(buyerOrganizationId)||
       !Array.isArray(sellerIds)||sellerIds.length>50||
       new Set(sellerIds).size!==sellerIds.length||
       sellerIds.some(id=>typeof id!=="string"||
         !/^sel_[A-Za-z0-9_-]+$/.test(id)))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const buyer=await authorizedBuyerOrganization(db,token,buyerOrganizationId)
    if(!buyer)return null
    if(!sellerIds.length)return {blocked:false,ownership_verified:false}
    // Each participating Seller must have exactly one current platform
    // Organization origin before saying every Store policy was verified.
    // A native SellerMember alone is never legal Store ownership.
    const ownerRows=await db.execute(`select seller_id,organization_id
      from da_organization_seller_ownership where revoked_at is null
        and seller_id in (${sellerIds.map(()=>"?").join(",")})`,sellerIds)
    if(ownerRows.length>sellerIds.length||
       new Set(ownerRows.map(r=>r.seller_id)).size!==ownerRows.length||
       ownerRows.some(r=>typeof r.organization_id!=="string"||
         !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(r.organization_id)||
         !sellerIds.includes(r.seller_id)))throw new IdentityAccessDenied()
    for(const row of ownerRows){
      const confirmed=await platformApprovedSellerIds(db,row.organization_id)
      if(!confirmed.includes(row.seller_id))throw new IdentityAccessDenied()
    }
    const ownershipVerified=ownerRows.length===sellerIds.length
    const rows=await db.execute(`select b.id,b.owner_organization_id,b.seller_id,
      exists(select 1 from da_audit_event e
        where e.id=b.source_audit_event_id and e.deleted_at is null
          and e.module='dogruadres-access'
          and e.resource='store-buyer-block'
          and e.action='organization.store_buyer_blocked'
          and e.organization_id=b.owner_organization_id
          and e.actor_person_id=b.issued_by_person_id
          and e.target_id=b.seller_id
          and e.new_values->>'block_id'=b.id
          and e.new_values->>'buyer_organization_id'=b.buyer_organization_id
          and exists(select 1 from da_audit_outbox x
            where x.source_audit_event_id=e.id and x.source_module='dogruadres-access'
              and x.deleted_at is null)) as proof
      from da_store_buyer_organization_block b
      where b.buyer_organization_id=? and b.revoked_at is null
        and b.seller_id in (${sellerIds.map(()=>"?").join(",")})`,
      [buyerOrganizationId,...sellerIds])
    if(rows.length>sellerIds.length||rows.some(r=>r.proof!==true||
       typeof r.id!=="string"||!/^dasbb_[A-Za-z0-9_-]+$/.test(r.id)||
       typeof r.owner_organization_id!=="string"||
       typeof r.seller_id!=="string"))throw new IdentityAccessDenied()
    for(const row of rows){
      const confirmed=await platformApprovedSellerIds(db,row.owner_organization_id)
      if(!confirmed.includes(row.seller_id))throw new IdentityAccessDenied()
    }
    return {blocked:rows.length!==0,ownership_verified:ownershipVerified}
  }


  /** First B22 Store-follow slice. A follow is a Buyer Organization relation,
   * never a Person wishlist, native Seller grant or buyer price permission.
   * Member delegation awaits the separately approved action-grant UX.
   */
  private async currentStoreFollowOwner_(
    db:SecuritySql,token:string,organizationId:string
  ){
    const sessions=new IdentitySessions(db)
    const actor=await sessions.current(token,false,false)
    if(!actor)return null
    const member=await sessions.organizations(token,organizationId,false)
    if(!member||member.person_id!==actor.person_id||
       member.organizations.length!==1||
       member.organizations[0].role!=="owner")return null
    const owner=await isCurrentProtectedOwner(db,actor.person_id,organizationId)
    if(!organizationActionAllowed("owner","store.follow",owner,false))return null
    return actor
  }

  private async storeFollowRow_(db:SecuritySql,organizationId:string,sellerId:string){
    const rows=await db.execute(
      "select f.version,f.revoked_at,exists(select 1 from da_audit_event e "+
      "where e.id=f.source_audit_event_id and e.deleted_at is null "+
      "and e.organization_id=f.buyer_organization_id "+
      "and e.module='dogruadres-access' and e.resource='buyer-store-follow' "+
      "and e.target_id=f.seller_id and e.actor_person_id is not null "+
      "and e.action in ('organization.store_followed','organization.store_unfollowed') "+
      "and exists(select 1 from da_audit_outbox o "+
      "where o.source_audit_event_id=e.id and o.source_module='dogruadres-access' "+
      "and o.deleted_at is null)) as proof "+
      "from da_buyer_store_follow f "+
      "where f.buyer_organization_id=? and f.seller_id=?",
      [organizationId,sellerId])
    if(rows.length>1||rows.some(x=>x.proof!==true||
      !Number.isInteger(Number(x.version))||Number(x.version)<1))
      throw new IdentityAccessDenied()
    return rows.length?rows[0]:null
  }

  @InjectTransactionManager()
  async personalBuyerStoreFollowState(
    token:string,organizationId:string,sellerId:string,
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)||
       !/^sel_[A-Za-z0-9_-]+$/.test(sellerId))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    if(!await this.currentStoreFollowOwner_(db,token,organizationId))return null
    const row=await this.storeFollowRow_(db,organizationId,sellerId)
    return {organization_id:organizationId,seller_id:sellerId,
      following:!!row&&row.revoked_at===null,
      version:row?Number(row.version):0}
  }

  /** Only the current protected Owner may enumerate their own active follows.
   * Catalog visibility is deliberately irrelevant: suspended/blocked Stores
   * must remain removable. Return IDs only, not Store names or other Buyers.
   * The cursor is a validated Seller ID; the composite key bounds each page.
   */
  @InjectTransactionManager()
  async personalBuyerStoreFollows(
    token:string,organizationId:string,after:string|undefined,
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)||
       (after!==undefined&&!/^sel_[A-Za-z0-9_-]+$/.test(after)))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    if(!await this.currentStoreFollowOwner_(db,token,organizationId))return null
    const rows=await db.execute(
      "select seller_id from da_buyer_store_follow "+
      "where buyer_organization_id=? and revoked_at is null "+
      (after===undefined?"":"and seller_id>? ")+
      "order by seller_id limit 21",
      after===undefined?[organizationId]:[organizationId,after])
    if(!Array.isArray(rows)||rows.length>21||
       rows.some(r=>typeof r.seller_id!=="string"||
         !/^sel_[A-Za-z0-9_-]+$/.test(r.seller_id)))
      throw new IdentityAccessDenied()
    const stores:{seller_id:string;version:number}[]=[]
    for(const item of rows.slice(0,20)){
      const row=await this.storeFollowRow_(db,organizationId,item.seller_id)
      if(!row||row.revoked_at!==null||Number(row.version)>=2147483647)
        throw new IdentityAccessDenied()
      stores.push({seller_id:item.seller_id,version:Number(row.version)})
    }
    return {organization_id:organizationId,stores,
      next_cursor:rows.length>20?stores[stores.length-1].seller_id:null}
  }

  @InjectTransactionManager()
  async personalChangeBuyerStoreFollow(
    token:string,input:{action:"follow"|"unfollow";organization_id:string;
      seller_id:string;expected_version:number},
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !["follow","unfollow"].includes(input.action)||
       !Number.isInteger(input.expected_version)||
       input.expected_version<0||input.expected_version>=2147483647)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    // All Owner/Store policy writers lock Person/session/Owner first, then
    // Store×Buyer. Reversing this order deadlocks follow against Store block.
    const actor=await this.currentStoreFollowOwner_(db,token,input.organization_id)
    if(!actor)return null
    // Block and follow operations serialize on the same Store×Buyer pair.
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-store-buyer-block'),hashtext(?))",
      [input.seller_id+":"+input.organization_id])
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-buyer-store-follow'),hashtext(?))",
      [input.organization_id+":"+input.seller_id])
    if(input.action==="follow"){
      const origins=await db.execute(
        "select organization_id from da_organization_seller_ownership "+
        "where seller_id=? and revoked_at is null",[input.seller_id])
      if(origins.length!==1||
         typeof origins[0].organization_id!=="string"||
         !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(origins[0].organization_id))
        return null
      const approved=await platformApprovedSellerIds(db,origins[0].organization_id)
      if(!approved.includes(input.seller_id))return null
      const blocked=await db.execute(
        "select id from da_store_buyer_organization_block "+
        "where seller_id=? and buyer_organization_id=? and revoked_at is null limit 2",
        [input.seller_id,input.organization_id])
      if(blocked.length)return null
    }
    const row=await this.storeFollowRow_(db,input.organization_id,input.seller_id)
    const previousVersion=row?Number(row.version):0
    const wasFollowing=!!row&&row.revoked_at===null
    if(previousVersion!==input.expected_version||
       wasFollowing===(input.action==="follow"))
      return {conflict:true as const}
    const version=previousVersion+1
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:actor.person_id,actor_type:actor.actor_type,
      actor_id:actor.actor_id,role_context:"owner",
      organization_id:input.organization_id,
      action:input.action==="follow"?"organization.store_followed":
        "organization.store_unfollowed",
      module:DOGRUADRES_AUDIT_MODULE,resource:"buyer-store-follow",
      target_id:input.seller_id,
      previous_values:{following:wasFollowing,version:previousVersion},
      new_values:{following:input.action==="follow",version},
      occurred_at:new Date()
    }],context)
    await (context.transactionManager as {flush():Promise<void>}).flush()
    if(!row){
      const inserted=await db.execute(
        "insert into da_buyer_store_follow "+
        "(buyer_organization_id,seller_id,version,source_audit_event_id) "+
        "values (?,?,1,?) returning version",
        [input.organization_id,input.seller_id,audit.id])
      if(inserted.length!==1)throw new IdentityAccessDenied()
    }else{
      const updated=await db.execute(
        "update da_buyer_store_follow set version=?,source_audit_event_id=?, "+
        "updated_at=clock_timestamp(), "+
        "followed_at=case when ?='follow' then clock_timestamp() else followed_at end, "+
        "revoked_at=case when ?='unfollow' then clock_timestamp() else null end "+
        "where buyer_organization_id=? and seller_id=? and version=? returning version",
        [version,audit.id,input.action,input.action,input.organization_id,
          input.seller_id,previousVersion])
      if(updated.length!==1)throw new IdentityAccessDenied()
    }
    return {conflict:false as const,organization_id:input.organization_id,
      seller_id:input.seller_id,following:input.action==="follow",version}
  }

  @InjectTransactionManager()
  async personalBuyerOrganization(
    token:string,organizationId:string,@MedusaContext() context:Context={}
  ){
    return authorizedBuyerOrganization(securitySql(context.transactionManager),token,organizationId)
  }


  // Native Cart's customer_id is verified by the API against Medusa before
  // and after this Foundation-only transaction. Cross-module Cart mutation
  // cannot be locked here: this is NOT a checkout or commercial eligibility.
  // One Cart ID may never be silently reassigned to another legal Organization.
  @InjectTransactionManager()
  async personalClaimBuyerCart(
    token:string,organizationId:string,cartId:string,customerId:string,
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)||
       !/^cart_[A-Za-z0-9_-]{1,123}$/.test(cartId)||
       !/^cus_[A-Za-z0-9_-]+$/.test(customerId))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    await db.execute(`select pg_advisory_xact_lock(
      hashtext('b22-buyer-cart-attribution'),hashtext(?))`,[cartId])
    const identity=await new IdentitySessions(db).current(token,true,false)
    if(!identity)return null
    const buyer=await authorizedBuyerOrganization(db,token,organizationId)
    const linked=await new ActorDelegation(db).binding(token,"customer")
    if(!buyer||buyer.person_id!==identity.person_id||!linked||
       linked.session.person_id!==identity.person_id||
       linked.binding.person_id!==identity.person_id||
       linked.binding.revoked_at||linked.binding.actor_id!==customerId)
      return null
    const existing=await db.execute(`select a.cart_id,a.organization_id,a.person_id,
      a.customer_id,a.source_audit_event_id from da_buyer_cart_attribution a
      where a.cart_id=? for update`,[cartId])
    if(existing.length>1)throw new IdentityAccessDenied()
    if(existing.length===1){
      const row=existing[0]
      if(row.organization_id!==organizationId||row.person_id!==identity.person_id||
         row.customer_id!==customerId)throw new IdentityAccessDenied()
      const evidence=await db.execute(`select e.id from da_audit_event e
        where e.id=? and e.deleted_at is null
          and e.module='dogruadres-access'
          and e.resource='buyer-cart-attribution'
          and e.action='organization.buyer_cart_attributed'
          and e.actor_person_id=? and e.organization_id=?
          and e.target_id=? and e.new_values->>'cart_id'=?
          and e.new_values->>'customer_id'=?
          and exists(select 1 from da_audit_outbox o
            where o.source_audit_event_id=e.id
              and o.source_module='dogruadres-access' and o.deleted_at is null)`,
        [row.source_audit_event_id,identity.person_id,organizationId,cartId,cartId,customerId])
      if(evidence.length!==1)throw new IdentityAccessDenied()
      return {status:"attributed" as const,organization_id:organizationId}
    }
    // Refresh authority after obtaining the cart-scoped lock. Checkout must
    // still enforce final authorization and every Seller-specific block.
    const currentBuyer=await authorizedBuyerOrganization(db,token,organizationId)
    const currentLink=await new ActorDelegation(db).binding(token,"customer")
    if(!currentBuyer||currentBuyer.person_id!==identity.person_id||
       !currentLink||currentLink.session.person_id!==identity.person_id||
       currentLink.binding.person_id!==identity.person_id||
       currentLink.binding.actor_id!==customerId||
       currentLink.binding.revoked_at)return null
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:identity.person_id,actor_type:identity.actor_type,
      actor_id:identity.actor_id,organization_id:organizationId,
      action:"organization.buyer_cart_attributed",
      module:DOGRUADRES_AUDIT_MODULE,resource:"buyer-cart-attribution",
      target_id:cartId,
      new_values:{cart_id:cartId,customer_id:customerId},
      occurred_at:new Date()
    }],context)
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const inserted=await db.execute(`insert into da_buyer_cart_attribution
      (cart_id,organization_id,person_id,customer_id,source_audit_event_id)
      values (?,?,?,?,?) returning cart_id`,
      [cartId,organizationId,identity.person_id,customerId,audit.id])
    if(inserted.length!==1)throw new IdentityAccessDenied()
    return {status:"attributed" as const,organization_id:organizationId}
  }

  @InjectTransactionManager()
  async personalBuyerCartAttribution(
    token:string,organizationId:string,cartId:string,customerId:string,
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)||
       !/^cart_[A-Za-z0-9_-]{1,123}$/.test(cartId)||
       !/^cus_[A-Za-z0-9_-]+$/.test(customerId))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const buyer=await authorizedBuyerOrganization(db,token,organizationId)
    const linked=await new ActorDelegation(db).binding(token,"customer")
    if(!buyer||!linked||linked.session.person_id!==buyer.person_id||
       linked.binding.person_id!==buyer.person_id||linked.binding.revoked_at||
       linked.binding.actor_id!==customerId)return null
    const rows=await db.execute(`select a.source_audit_event_id from da_buyer_cart_attribution a
      join da_audit_event e on e.id=a.source_audit_event_id
        and e.deleted_at is null and e.module='dogruadres-access'
        and e.resource='buyer-cart-attribution'
        and e.action='organization.buyer_cart_attributed'
        and e.actor_person_id=a.person_id and e.organization_id=a.organization_id
        and e.target_id=a.cart_id
        and e.new_values->>'cart_id'=a.cart_id
        and e.new_values->>'customer_id'=a.customer_id
      where a.cart_id=? and a.organization_id=? and a.person_id=?
        and a.customer_id=?
        and exists(select 1 from da_audit_outbox o
          where o.source_audit_event_id=e.id
            and o.source_module='dogruadres-access' and o.deleted_at is null)`,
      [cartId,organizationId,buyer.person_id,customerId])
    if(rows.length>1)throw new IdentityAccessDenied()
    return rows.length===1
  }


  /**
   * B22 final checkout decision (L). Called only from Mercur's split-cart
   * validate hook, after the native Cart lock and native source reads but
   * before OrderGroup/order writes. One PostgreSQL statement gives all
   * Foundation-owned facts one READ COMMITTED snapshot: a revocation committed
   * before this SELECT is denied; a later revocation may overlap this checkout.
   *
   * The caller must validate the native Cart snapshot and current Mercur Seller
   * lifecycle before calling this method. No native module manager is passed
   * into Foundation and no cross-module transaction is claimed.
   */
  @InjectTransactionManager()
  async authorizeBuyerCheckout(
    cartId:string,
    customerId:string,
    sellerIds:string[],
    @MedusaContext() context:Context={}
  ):Promise<boolean>{
    if(!/^cart_[A-Za-z0-9_-]{1,123}$/.test(cartId)||
       !/^cus_[A-Za-z0-9_-]+$/.test(customerId)||
       !Array.isArray(sellerIds)||sellerIds.length<1||sellerIds.length>50||
       new Set(sellerIds).size!==sellerIds.length||
       sellerIds.some(id=>typeof id!=="string"||!/^sel_[A-Za-z0-9_-]+$/.test(id)))
      throw new IdentityAccessDenied()

    const db=securitySql(context.transactionManager)
    const sellerSlots=sellerIds.map(()=>"?").join(",")
    // IMPORTANT: This is the single final Foundation SELECT (L). Do not split
    // these predicates into sequential service reads or cached decisions.
    const rows=await db.execute(`
      select a.cart_id
      from da_buyer_cart_attribution a
      join da_person person
        on person.id=a.person_id
       and person.disabled_at is null
       and person.deleted_at is null
      join da_organization buyer
        on buyer.id=a.organization_id
       and buyer.status='active' and buyer.deleted_at is null
      join da_audit_event attribution_event
        on attribution_event.id=a.source_audit_event_id
       and attribution_event.deleted_at is null
       and attribution_event.module='dogruadres-access'
       and attribution_event.resource='buyer-cart-attribution'
       and attribution_event.action='organization.buyer_cart_attributed'
       and attribution_event.actor_person_id=a.person_id
       and attribution_event.organization_id=a.organization_id
       and attribution_event.target_id=a.cart_id
       and attribution_event.new_values->>'cart_id'=a.cart_id
       and attribution_event.new_values->>'customer_id'=a.customer_id
      where a.cart_id=? and a.customer_id=?
        and exists(
          select 1 from da_audit_outbox attribution_outbox
          where attribution_outbox.source_audit_event_id=attribution_event.id
            and attribution_outbox.source_module='dogruadres-access'
            and attribution_outbox.deleted_at is null
        )
        and (
          select count(*) from da_organization_membership m
          where m.organization_id=a.organization_id
            and m.person_id=a.person_id
            and m.status='active' and m.revoked_at is null
            and m.deleted_at is null
        )=1
        and (
          (? and exists(select 1 from da_organization_membership protected_owner
            where protected_owner.person_id=a.person_id
              and protected_owner.organization_id=a.organization_id
              and protected_owner.role='owner'
              and protected_owner.protected_owner=true
              and protected_owner.status='active'
              and protected_owner.revoked_at is null
              and protected_owner.deleted_at is null))
          or (not exists(select 1 from da_organization_membership owner_role
            where owner_role.person_id=a.person_id
              and owner_role.organization_id=a.organization_id
              and owner_role.role='owner'
              and owner_role.status='active'
              and owner_role.revoked_at is null
              and owner_role.deleted_at is null)
          and (select count(*) from da_organization_buyer_permission g
          join da_audit_event grant_event
            on grant_event.id=g.source_audit_event_id
           and grant_event.deleted_at is null
           and grant_event.module='dogruadres-access'
           and grant_event.resource='buyer-permission'
           and grant_event.action='organization.buyer_permission_granted'
           and grant_event.actor_person_id=g.issued_by_person_id
           and grant_event.organization_id=g.organization_id
           and grant_event.target_id=g.person_id
           and grant_event.new_values->>'grant_id'=g.id
           and grant_event.new_values->>'person_id'=g.person_id
           and grant_event.new_values->>'permission'=g.permission
          join da_audit_outbox grant_outbox
            on grant_outbox.source_audit_event_id=grant_event.id
           and grant_outbox.source_module='dogruadres-access'
           and grant_outbox.deleted_at is null
          where g.person_id=a.person_id
            and g.organization_id=a.organization_id
            and g.permission='buyer.purchase'
            and g.revoked_at is null
            and (g.expires_at is null or g.expires_at>statement_timestamp())
          )=1)
        )
        and (
          select count(*) from da_verified_actor_binding binding
          join da_actor_mapping actor
            on actor.person_id=binding.person_id
           and actor.actor_type=binding.actor_type
           and actor.actor_id=binding.actor_id
           and actor.deleted_at is null
          where binding.person_id=a.person_id
            and binding.actor_type='customer'
            and binding.actor_id=a.customer_id
            and binding.revoked_at is null
            and binding.verified_at is not null
        )=1
        and (
          select count(distinct ownership.seller_id)
          from da_organization_seller_ownership ownership
          join da_organization seller_organization
            on seller_organization.id=ownership.organization_id
           and seller_organization.status='active'
           and seller_organization.deleted_at is null
          join da_audit_event ownership_event
            on ownership_event.id=ownership.verification_audit_event_id
           and ownership_event.deleted_at is null
           and ownership_event.organization_id=ownership.organization_id
           and ownership_event.target_id=ownership.seller_id
           and ownership_event.module='dogruadres-access'
           and (
             (ownership_event.action='organization.store_application_created'
              and ownership_event.resource='store-application'
              and exists (
                select 1 from da_store_application application
                where application.id=(ownership_event.new_values->>'application_id')
                  and application.organization_id=ownership.organization_id
                  and application.seller_id=ownership.seller_id
                  and application.status='created'
                  and application.person_id=ownership_event.actor_person_id
              ))
             or
             (ownership_event.action='organization.store_association_approved'
              and ownership_event.resource='store-association')
           )
          join da_audit_outbox ownership_outbox
            on ownership_outbox.source_audit_event_id=ownership_event.id
           and ownership_outbox.source_module='dogruadres-access'
           and ownership_outbox.deleted_at is null
          where ownership.seller_id in (${sellerSlots})
            and ownership.revoked_at is null
        )=?
        and not exists(
          select 1 from da_store_buyer_organization_block block
          where block.buyer_organization_id=a.organization_id
            and block.seller_id in (${sellerSlots})
            and block.revoked_at is null
        )
      limit 2
    `,[cartId,customerId,ownerRoleAllows("buyer.purchase"),...sellerIds,sellerIds.length,...sellerIds])
    if(rows.length>1)throw new IdentityAccessDenied()
    return rows.length===1
  }

  // B22 product draft: Foundation-owned intent ledger, not another product
  // service. Never interpret a reserved/uncertain native outcome as retryable.
  @InjectTransactionManager()
  async personalProductDraftScope(
    token:string,organizationId:string,sellerId:string,
    @MedusaContext() context:Context={}
  ){
    const db=securitySql(context.transactionManager),s=new IdentitySessions(db)
    const current=await s.current(token,true,false)
    if(!current)return null
    const scope=await authorizedProductEditScope(db,token,organizationId,sellerId)
    return scope?.person_id===current.person_id?scope:null
  }

  @InjectTransactionManager()
  async personalProductDraftCandidates(
    token:string,organizationId:string,@MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const current=await sessions.current(token,true,false)
    if(!current)return null
    const member=await sessions.organizations(token,organizationId,false)
    if(!member||member.person_id!==current.person_id||
       member.organizations.length!==1)return null
    const stores=await platformApprovedSellerIds(db,organizationId)
    const role=member.organizations[0].role
    const owner=role==="owner" &&
      await isCurrentProtectedOwner(db,current.person_id,organizationId)
    const allowed:string[]=[]
    for(const id of stores){
      const grant=role==="owner"?false:
        await verifiedStoreProductEditGrant(db,current.person_id,organizationId,id)
      if(organizationActionAllowed(role,"products.edit",owner,grant))
        allowed.push(id)
    }
    return {person_id:current.person_id,organization_id:organizationId,seller_ids:allowed}
  }


  // Read-only receipt for an uncertain browser submission. A reserved intent
  // is NOT evidence that Mercur did or did not create a product. No retry and
  // no native workflow is triggered by this lookup.
  @InjectTransactionManager()
  async personalProductDraftReceipt(
    token:string,organizationId:string,sellerId:string,requestId:string,
    @MedusaContext() context:Context={}
  ){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)||
       !/^sel_[A-Za-z0-9_-]+$/.test(sellerId)||
       !/^dapd_[0-9a-f]{32}$/.test(requestId))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const current=await sessions.current(token,true,false)
    if(!current)return null
    const scope=await authorizedProductEditScope(db,token,organizationId,sellerId)
    if(!scope||scope.person_id!==current.person_id)return null
    const rows=await db.execute(`select status,product_id,completion_audit_event_id
      from da_product_draft_request
      where id=? and person_id=? and organization_id=? and seller_id=?`,
      [requestId,current.person_id,organizationId,sellerId])
    if(rows.length>1)throw new IdentityAccessDenied()
    if(rows.length===0)return {status:"unverified" as const}
    const row=rows[0]
    if(row.status==="reserved"&&row.product_id==null&&row.completion_audit_event_id==null)
      return {status:"review_required" as const}
    if(row.status!=="created"||typeof row.product_id!=="string"||
       !/^prod_[A-Za-z0-9_-]+$/.test(row.product_id)||
       typeof row.completion_audit_event_id!=="string")
      throw new IdentityAccessDenied()
    const proof=await db.execute(`select e.id from da_audit_event e
      where e.id=? and e.actor_person_id=? and e.organization_id=?
        and e.target_id=? and e.action='organization.product_draft_created'
        and e.module='dogruadres-access' and e.resource='product-draft'
        and e.new_values->>'request_id'=?
        and e.new_values->>'product_id'=?
        and e.deleted_at is null
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id and x.source_module='dogruadres-access'
            and x.deleted_at is null)`,
      [row.completion_audit_event_id,current.person_id,organizationId,
       sellerId,requestId,row.product_id])
    if(proof.length!==1)throw new IdentityAccessDenied()
    return {status:"created" as const,product_id:row.product_id as string}
  }

  /**
   * B22: keep the SAME Foundation products.edit advisory lock as the grant
   * writer for the full native product-create + Foundation completion window.
   * Revocation cannot COMMIT while the native workflow is in progress.
   *
   * This is a bounded, in-process transaction lock, NOT an atomic native /
   * Foundation transaction. Existing durable request keys and reconciliation
   * remain necessary for crash/uncertain native outcomes.
   */
  @InjectTransactionManager()
  async personalWithProductDraftPermissionLock<T>(
    token:string,input:{organization_id:string;seller_id:string},
    execute:(context:Context)=>Promise<T>,@MedusaContext() context:Context={}
  ):Promise<T|null>{
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       typeof execute!=="function")throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const current=await sessions.current(token,true,false)
    if(!current)return null
    // Same key as personalChangeStoreProductPermission. Acquire before the
    // fresh authorization read, so a committed earlier revocation denies
    // BEFORE native creation, and later revocation waits for completion.
    await db.execute(`select pg_advisory_xact_lock(
      hashtext('b22-products-edit'),hashtext(?))`,
      [input.organization_id+":"+input.seller_id+":"+current.person_id])
    const allowed=await authorizedProductEditScope(
      db,token,input.organization_id,input.seller_id)
    if(!allowed||allowed.person_id!==current.person_id)return null
    // Carry the same manager into nested Foundation reads/completion.
    // A second transaction would wait on this transaction's FOR UPDATE
    // session/person rows, creating a self-deadlock.
    return await execute(context)
  }

  @InjectTransactionManager()
  async personalReserveProductDraft(
    token:string,input:{request_id:string;organization_id:string;seller_id:string;title:string},
    @MedusaContext() context:Context={}
  ){
    if(!/^dapd_[0-9a-f]{32}$/.test(input.request_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       typeof input.title!=="string"||input.title.trim()!==input.title||
       input.title.length<2||input.title.length>120)throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const current=await sessions.current(token,true,false)
    if(!current)return null
    const decision=await authorizedProductEditScope(db,token,input.organization_id,input.seller_id)
    if(!decision||decision.person_id!==current.person_id)return null
    const fingerprint=createHash("sha256").update(JSON.stringify([
      input.organization_id,input.seller_id,input.title
    ])).digest("hex")
    // PK locks simultaneous attempts across processes. A second request
    // cannot proceed to Mercur, even if the first native result is uncertain.
    const added=await db.execute(`insert into da_product_draft_request
      (id,person_id,organization_id,seller_id,request_fingerprint)
      values (?,?,?,?,?) on conflict (id) do nothing returning id`,
      [input.request_id,current.person_id,input.organization_id,input.seller_id,fingerprint])
    if(added.length>1)throw new IdentityAccessDenied()
    if(added.length===1)return {status:"reserved" as const,person_id:current.person_id}
    const existing=await db.execute(`select person_id,organization_id,seller_id,
      request_fingerprint,status,product_id,completion_audit_event_id
      from da_product_draft_request where id=? for update`,[input.request_id])
    if(existing.length!==1)throw new IdentityAccessDenied()
    const row=existing[0]
    if(row.person_id!==current.person_id||
       row.organization_id!==input.organization_id||
       row.seller_id!==input.seller_id||
       row.request_fingerprint!==fingerprint)throw new IdentityAccessDenied()
    if(row.status==="reserved")return {status:"uncertain" as const,person_id:current.person_id}
    if(row.status!=="created"||typeof row.product_id!=="string")
      throw new IdentityAccessDenied()
    const proof=await db.execute(`select e.id from da_audit_event e
      where e.id=? and e.actor_person_id=? and e.organization_id=?
        and e.target_id=? and e.action='organization.product_draft_created'
        and e.module='dogruadres-access' and e.resource='product-draft'
        and e.new_values->>'request_id'=?
        and e.new_values->>'product_id'=?
        and e.deleted_at is null
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id and x.source_module='dogruadres-access'
            and x.deleted_at is null)`,
      [row.completion_audit_event_id,current.person_id,input.organization_id,
       input.seller_id,input.request_id,row.product_id])
    if(proof.length!==1)throw new IdentityAccessDenied()
    return {status:"created" as const,person_id:current.person_id,product_id:row.product_id as string}
  }

  @InjectTransactionManager()
  async personalCompleteProductDraft(
    token:string,input:{request_id:string;organization_id:string;seller_id:string;title:string},
    productId:string,@MedusaContext() context:Context={}
  ){
    if(!/^dapd_[0-9a-f]{32}$/.test(input.request_id)||
       !/^prod_[A-Za-z0-9_-]+$/.test(productId))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const current=await sessions.current(token,false,false)
    if(!current)return null
    const rows=await db.execute(`select person_id,organization_id,seller_id,
       request_fingerprint,status,product_id from da_product_draft_request
       where id=? for update`,[input.request_id])
    const fingerprint=createHash("sha256").update(JSON.stringify([
      input.organization_id,input.seller_id,input.title
    ])).digest("hex")
    if(rows.length!==1||rows[0].person_id!==current.person_id||
       rows[0].organization_id!==input.organization_id||
       rows[0].seller_id!==input.seller_id||
       rows[0].request_fingerprint!==fingerprint)throw new IdentityAccessDenied()
    if(rows[0].status==="created"){
      if(rows[0].product_id!==productId)throw new IdentityAccessDenied()
      return {status:"created" as const,product_id:productId}
    }
    if(rows[0].status!=="reserved")throw new IdentityAccessDenied()
    const [event]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:current.person_id,actor_type:current.actor_type,actor_id:current.actor_id,
      organization_id:input.organization_id,
      action:"organization.product_draft_created",module:DOGRUADRES_AUDIT_MODULE,
      resource:"product-draft",target_id:input.seller_id,
      new_values:{request_id:input.request_id,product_id:productId,status:"draft"},
      occurred_at:new Date()
    }],context)
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const changed=await db.execute(`update da_product_draft_request
      set status='created',product_id=?,completion_audit_event_id=?,
          completed_at=clock_timestamp()
      where id=? and status='reserved' returning id`,
      [productId,event.id,input.request_id])
    if(changed.length!==1)throw new IdentityAccessDenied()
    return {status:"created" as const,product_id:productId}
  }

  // ---------------------------------------------------------------------------
  // B20: per-Person persistent launcher preference
  // ---------------------------------------------------------------------------
  // Retain historic B20 app IDs non-destructively. B22 deprecates
  // the vendor app as a separate end-user commercial panel. Only public
  // catalog discovery is shown by launcher GET at present.
  // A stored preference is not a commercial permission or Store entitlement.
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