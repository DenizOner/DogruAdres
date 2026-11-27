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
import { StoreLifecycleOperations } from './store-lifecycle'
import { StoreRenameOperations } from './store-rename'
import { StoreApplicationOperations } from './store-application-operations'
import { StoreProductPermissionOperations } from './store-product-permissions'
import { BuyerOperations } from './buyer-operations'
import { ProductDraftOperations } from './product-draft-operations'
import { LauncherOperations } from './launcher-operations'
import { NativeMfaOperations } from './native-mfa-operations'
import { SmtpOperations } from './smtp-operations'
import {AccountLinking,type VerifiedSecondary} from './account-linking'
import {
  PlatformSmtpPersistence,
  assertSmtpCredentialReuse,
  type UpdateSmtpSettingsInput,
  type SmtpAuditActor,
} from "./smtp-settings"
import { sendSmtpEmail } from "./smtp-client"
import { PersonalNotifications } from "./personal-notifications"
import { PersonalNotificationPreferences, queueDigestIfEligible } from "./notification-preferences"
import { CompanyLauncherConflict, companyLauncherAvailable, companyLauncherProject, companyLauncherValidate } from "./company-launcher"
import { PlatformLauncherConflict, platformLauncherAvailable, platformLauncherProject, platformLauncherValidate } from "./platform-launcher"
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

export type FoundationAuditInput = {
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

// An exceptional name RIGHT can override only its source Store's approved
// OLD-name hold. It never waives an in-flight approval, unrelated Store hold,
// native collision, application claim or the recipient's current authorization.
// The source must have physically vacated BOTH native name and URL and the
// assigned-right decision must have its intact canonical audit/outbox.
const authorizedTransferredOldNameHoldExclusion = `
        and not exists(select 1 from da_store_name_transfer t
          join seller source_s on source_s.id=t.source_seller_id
            and source_s.deleted_at is null and source_s.approved_at is not null
            and source_s.status in ('open','suspended')
            and encode(sha256(convert_to(lower(regexp_replace(
              btrim(normalize(source_s.name,NFKC)),'[[:space:]]+',' ','g')),
              'UTF8')),'hex')<>t.name_hash
            and lower(source_s.handle)<>lower(t.old_handle)
          join da_audit_event e on e.id=t.source_audit_event_id
            and e.deleted_at is null and e.module='dogruadres-access'
            and e.action='organization.store_name_right_assigned'
            and e.organization_id=t.source_organization_id
            and e.target_id=t.source_seller_id
            and e.new_values->>'transfer_id'=t.id
            and e.new_values->>'target_seller_id'=t.target_seller_id
          join da_audit_outbox x on x.source_audit_event_id=e.id
            and x.source_module='dogruadres-access' and x.deleted_at is null
          where h.status='approved' and h.seller_id=t.source_seller_id
            and h.old_name=t.old_name and h.old_handle=t.old_handle
            and t.status='assigned' and t.target_seller_id=?
            and t.target_organization_id=? and t.name_hash=? and t.old_handle=?)
`

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

  @InjectTransactionManager()
  async personalNotificationPreferences(token: string, @MedusaContext() context: Context = {}) {
    return new PersonalNotificationPreferences(securitySql(context.transactionManager)).get(token)
  }

  @InjectTransactionManager()
  async savePersonalNotificationPreferences(
    token: string,
    input: { action: "update"; preferences: unknown; expected_version: number } | { action: "reset_defaults"; expected_version: number },
    @MedusaContext() context: Context = {}
  ) {
    return new PersonalNotificationPreferences(securitySql(context.transactionManager)).update(
      token,
      input,
      async (events) => { await this.persistAuditEventsWithOutbox_(events, context) },
      DOGRUADRES_AUDIT_MODULE
    )
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
  // @ts-ignore MedusaService template literal method clash
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

  private nativeMfa_(context: Context) {
    return new NativeMfaOperations(
      securitySql(context.transactionManager),
      context
    )
  }

  private smtpOperations_(context: Context) {
    return new SmtpOperations(
      securitySql(context.transactionManager),
      context
    )
  }

  private storeApplication_(context: Context) {
    return new StoreApplicationOperations(
      securitySql(context.transactionManager),
      this.persistAuditEventsWithOutbox_.bind(this),
      this.personalReviewableStoreApplications.bind(this),
      context
    )
  }

  private storeProductPermissions_(context: Context) {
    return new StoreProductPermissionOperations(
      securitySql(context.transactionManager),
      this.persistAuditEventsWithOutbox_.bind(this),
      context
    )
  }

  private buyerOperations_(context: Context) {
    return new BuyerOperations(
      securitySql(context.transactionManager),
      this.persistAuditEventsWithOutbox_.bind(this),
      context
    )
  }

  private storeRename_(context: Context) {
    return new StoreRenameOperations(
      securitySql(context.transactionManager),
      this.persistAuditEventsWithOutbox_.bind(this),
      context
    )
  }

  private storeLifecycle_(context: Context) {
    return new StoreLifecycleOperations(
      securitySql(context.transactionManager),
      this.persistAuditEventsWithOutbox_.bind(this),
      context
    )
  }

  private productDrafts_(context: Context) {
    return new ProductDraftOperations(
      securitySql(context.transactionManager),
      this.persistAuditEventsWithOutbox_.bind(this),
      this.readablePersonalOrganizations_.bind(this),
      context
    )
  }

  private launchers_(context: Context) {
    return new LauncherOperations(
      securitySql(context.transactionManager),
      this.readablePersonalOrganizations_.bind(this),
      context
    )
  }

  @InjectTransactionManager()
  async personalOwnerStorePauseState(token:string,organizationId:string,sellerId:string,
    @MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalOwnerStorePauseState(token, organizationId, sellerId, context)
  }

  @InjectTransactionManager()
  async personalOwnerStorePauseChange(token:string,input:{
    organization_id:string;seller_id:string;action:"pause"|"resume";
    request_id:string;expected_version:number
  },@MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalOwnerStorePauseChange(token, input, context)
  }

  @InjectTransactionManager()
  async storeOwnerPauseAcceptingOrders(sellerIds:string[],
    @MedusaContext() context:Context={}):Promise<boolean> {
    return this.storeLifecycle_(context).storeOwnerPauseAcceptingOrders(sellerIds, context)
  }

  @InjectTransactionManager()
  async personalOwnerClosingState(token:string,organizationId:string,sellerId:string,
    @MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalOwnerClosingState(token, organizationId, sellerId, context)
  }

  @InjectTransactionManager()
  async personalOwnerClosingChange(token:string,input:{
    organization_id:string;seller_id:string;action:"start"|"withdraw";
    request_id:string;expected_version:number;consequences_acknowledged?:boolean
  },@MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalOwnerClosingChange(token, input, context)
  }

  @InjectTransactionManager()
  async personalReviewablePlatformStoreClosings(token:string,page=0,
    @MedusaContext() context:Context={},
    target?:{organization_id:string;seller_id:string}) {
    return this.storeLifecycle_(context).personalReviewablePlatformStoreClosings(token, page, context, target)
  }

  @InjectTransactionManager()
  async personalStartPlatformStoreClosing(token:string,input:{
    organization_id:string;seller_id:string;request_id:string;reason:string
  },@MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalStartPlatformStoreClosing(token, input, context)
  }

  @InjectTransactionManager()
  async settlePlatformClosingAdminFallback(@MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).settlePlatformClosingAdminFallback(context)
  }

  @InjectTransactionManager()
  async personalPlatformStoreClosingEmailAudience(token:string,organizationId:string,
    sellerId:string,@MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalPlatformStoreClosingEmailAudience(token, organizationId, sellerId, context)
  }

  @InjectTransactionManager()
  async personalPlatformStoreClosingEmailProgress(token:string,organizationId:string,
    sellerId:string,@MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalPlatformStoreClosingEmailProgress(token, organizationId, sellerId, context)
  }

  @InjectTransactionManager()
  async personalPlatformStoreClosingEmailLinkVisit(
    token:string,linkToken:string,@MedusaContext() context:Context={}
  ) {
    return this.storeLifecycle_(context).personalPlatformStoreClosingEmailLinkVisit(token, linkToken, context)
  }

  @InjectTransactionManager()
  async personalPlatformStoreClosingState(token:string,organizationId:string,
    sellerId:string,@MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalPlatformStoreClosingState(token, organizationId, sellerId, context)
  }

  @InjectTransactionManager()
  async personalAppealPlatformStoreClosing(token:string,input:{
    organization_id:string;seller_id:string;request_id:string;
    expected_version:number;reason:string
  },@MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalAppealPlatformStoreClosing(token, input, context)
  }

  @InjectTransactionManager()
  async personalRequestPlatformStoreClosingFinalReview(token:string,input:{
    organization_id:string;seller_id:string;request_id:string;
    expected_version:number;reason:string
  },@MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalRequestPlatformStoreClosingFinalReview(token, input, context)
  }

  @InjectTransactionManager()
  async personalReviewablePlatformClosingAppeals(token:string,page=0,
    @MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalReviewablePlatformClosingAppeals(token, page, context)
  }

  @InjectTransactionManager()
  async personalDecidePlatformClosingAppeal(token:string,input:{
    organization_id:string;seller_id:string;source_request_id:string;
    request_id:string;decision:"accepted"|"rejected";reason:string
  },@MedusaContext() context:Context={}) {
    return this.storeLifecycle_(context).personalDecidePlatformClosingAppeal(token, input, context)
  }

  @InjectTransactionManager()
  async personalAssignSuspendedStoreNameRight(token:string,input:{
    transfer_id:string;source_application_id:string;source_seller_id:string;
    target_application_id:string;target_seller_id:string;
    expected_name:string;expected_handle:string;reason:string
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalAssignSuspendedStoreNameRight(token, input, context)
  }

  @InjectTransactionManager()
  async personalCurrentSuspendedStoreName(token:string,target:{
    application_id:string;seller_id:string;expected_status?:"open"
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalCurrentSuspendedStoreName(token, target, context)
  }

  @InjectTransactionManager()
  async personalClaimStoreReactivation(token:string,input:{
    application_id:string;seller_id:string;organization_id:string;
    name:string;handle:string
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalClaimStoreReactivation(token, input, context)
  }

  @InjectTransactionManager()
  async personalUnresolvedStoreReactivationClaim(token:string,target:{
    application_id:string;seller_id:string
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalUnresolvedStoreReactivationClaim(token, target, context)
  }

  @InjectTransactionManager()
  async personalReleaseSuspendedStoreReactivationClaim(token:string,target:{
    application_id:string;seller_id:string
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalReleaseSuspendedStoreReactivationClaim(token, target, context)
  }

  @InjectTransactionManager()
  async personalRecordStoreReactivation(token:string,target:{
    application_id:string;seller_id:string;organization_id:string;
    name:string;handle:string;claim_audit_id:string
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalRecordStoreReactivation(token, target, context)
  }

  @InjectTransactionManager()
  async personalRecordStoreApplicationRejection(token:string,target:{
    application_id:string;seller_id:string;reason:string
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalRecordStoreApplicationRejection(token, target, context)
  }

  @InjectTransactionManager()
  async personalReviewableStoreApplications(token:string,
    target?:{application_id:string;seller_id:string},
    @MedusaContext() context:Context={},
    page=0) {
    return this.storeRename_(context).personalReviewableStoreApplications(token, target, context, page)
  }

  @InjectTransactionManager()
  async personalReviewableStoreRenameRequests(token:string,page=0,
    @MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalReviewableStoreRenameRequests(token, page, context)
  }

  @InjectTransactionManager()
  async personalRejectStoreRenameRequest(token:string,input:{
    request_id:string;seller_id:string;reason:string
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalRejectStoreRenameRequest(token, input, context)
  }

  @InjectTransactionManager()
  async personalClaimStoreRenameApproval(token:string,input:{
    request_id:string;seller_id:string
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalClaimStoreRenameApproval(token, input, context)
  }

  @InjectTransactionManager()
  async personalWithStoreRenameApprovalStaffLock<T>(token:string,input:{
    request_id:string;seller_id:string
  },execute:(data:{name:string;handle:string},context:Context)=>Promise<T>,
    @MedusaContext() context:Context={}):Promise<T|null> {
    return this.storeRename_(context).personalWithStoreRenameApprovalStaffLock(token, input, execute, context)
  }

  @InjectTransactionManager()
  async personalRecordStoreRenameApproval(token:string,input:{
    request_id:string;seller_id:string
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalRecordStoreRenameApproval(token, input, context)
  }

  @InjectTransactionManager()
  async personalRequestStoreRename(token:string,input:{
    request_id:string;organization_id:string;seller_id:string;
    name:string;handle:string;risk_acknowledged:true;
    risk_version:typeof STORE_RENAME_RISK_VERSION
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalRequestStoreRename(token, input, context)
  }

  @InjectTransactionManager()
  async personalWithdrawStoreRenameRequest(token:string,input:{
    request_id:string;organization_id:string;seller_id:string
  },@MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalWithdrawStoreRenameRequest(token, input, context)
  }

  @InjectTransactionManager()
  async personalStoreRenameCandidateIds(token:string,organizationId:string,
    @MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalStoreRenameCandidateIds(token, organizationId, context)
  }

  @InjectTransactionManager()
  async personalStoreRenameRequests(token:string,organizationId:string,sellerId:string,
    @MedusaContext() context:Context={}) {
    return this.storeRename_(context).personalStoreRenameRequests(token, organizationId, sellerId, context)
  }

  @InjectTransactionManager()
  async personalStoreApplications(token:string,org:string,@MedusaContext() context:Context={}) {
    return this.storeApplication_(context).personalStoreApplications(token, org, context)
  }

  @InjectTransactionManager()
  async personalSaveStoreApplicationDraft(token:string,input:StoreDraftInput,
    @MedusaContext() context:Context={}) {
    return this.storeApplication_(context).personalSaveStoreApplicationDraft(token, input, context)
  }

  @InjectTransactionManager()
  async personalListStoreDraftPermissions(token:string,org:string,after:string|null=null,
    @MedusaContext() context:Context={}) {
    return this.storeApplication_(context).personalListStoreDraftPermissions(token, org, after, context)
  }

  @InjectTransactionManager()
  async personalChangeStoreDraftPermission(
    token:string,input:{action:"grant"|"revoke";organization_id:string;membership_id:string},
    @MedusaContext() context:Context={}
  ) {
    return this.storeApplication_(context).personalChangeStoreDraftPermission(token, input, context)
  }

  @InjectTransactionManager()
  async personalPlatformStoreApplicationRight(token:string,org:string,
    @MedusaContext() context:Context={}) {
    return this.storeApplication_(context).personalPlatformStoreApplicationRight(token, org, context)
  }

  @InjectTransactionManager()
  async personalSetStoreApplicationRight(token:string,input:{
    organization_id:string;expected_enabled:boolean;expected_version:number;enabled:boolean;reason:string
  },@MedusaContext() context:Context={}) {
    return this.storeApplication_(context).personalSetStoreApplicationRight(token, input, context)
  }

  @InjectTransactionManager()
  async personalPrepareStoreApplicationFromDraft(token:string,input:{
    organization_id:string;draft_id:string;expected_version:number;application_id:string
  },@MedusaContext() context:Context={}):Promise<StoreRequest|{conflict:true}|null> {
    return this.storeApplication_(context).personalPrepareStoreApplicationFromDraft(token, input, context)
  }

  @InjectTransactionManager()
  async personalWithStoreApplicationOwnerLock<T>(
    token:string,input:StoreRequest,execute:(context:Context)=>Promise<T>,
    @MedusaContext() context:Context={}
  ):Promise<T|null> {
    return this.storeApplication_(context).personalWithStoreApplicationOwnerLock(token, input, execute, context)
  }

  @InjectTransactionManager()
  async reserveStoreApplication(token:string,input:StoreRequest,@MedusaContext() context:Context={}) {
    return this.storeApplication_(context).reserveStoreApplication(token, input, context)
  }

  @InjectTransactionManager()
  async claimStoreApplication(token:string,input:StoreRequest,@MedusaContext() context:Context={}) {
    return this.storeApplication_(context).claimStoreApplication(token, input, context)
  }

  @InjectTransactionManager()
  async finishStoreApplication(token:string,input:StoreRequest,sellerId:string,
    @MedusaContext() context:Context={}) {
    return this.storeApplication_(context).finishStoreApplication(token, input, sellerId, context)
  }

  @InjectTransactionManager()
  async personalWithStoreApprovalStaffLock<T>(
    token:string,target:{application_id:string;seller_id:string;decision?:"reject"|"unsuspend"|"reconcile"|"release"},
    execute:(context:Context)=>Promise<T>,@MedusaContext() context:Context={}
  ):Promise<T|null> {
    return this.storeApplication_(context).personalWithStoreApprovalStaffLock(token, target, execute, context)
  }

  @InjectTransactionManager()
  async personalLegalSellerIds(token: string, organizationId: string,
    @MedusaContext() context: Context = {}) {
    return this.storeProductPermissions_(context).personalLegalSellerIds(token, organizationId, context)
  }

  @InjectTransactionManager()
  async personalChangeStoreProductPermission(
    token:string,input:{action:"grant"|"revoke";organization_id:string;seller_id:string;membership_id:string},
    @MedusaContext() context:Context={}
  ) {
    return this.storeProductPermissions_(context).personalChangeStoreProductPermission(token, input, context)
  }

  @InjectTransactionManager()
  async personalWithStoreMemberConnectionLock(
    token:string,
    input:{organization_id:string;seller_id:string;membership_id:string},
    execute:(memberId:string,context:Context)=>Promise<{created:boolean}>,
    @MedusaContext() context:Context={}
  ):Promise<{created:boolean}|null> {
    return this.storeProductPermissions_(context).personalWithStoreMemberConnectionLock(token, input, execute, context)
  }

  @InjectTransactionManager()
  async personalListStoreProductPermissions(token:string,organizationId:string,
    @MedusaContext() context:Context={}) {
    return this.storeProductPermissions_(context).personalListStoreProductPermissions(token, organizationId, context)
  }

  @InjectTransactionManager()
  async personalChangeBuyerPermission(
    token:string,input:{action:"grant"|"revoke";organization_id:string;membership_id:string},
    @MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalChangeBuyerPermission(token, input, context)
  }

  @InjectTransactionManager()
  async personalListBuyerPermissions(
    token:string,organizationId:string,@MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalListBuyerPermissions(token, organizationId, context)
  }

  @InjectTransactionManager()
  async personalChangeStoreBuyerBlock(
    token:string,input:{action:"block"|"unblock";organization_id:string;
      seller_id:string;buyer_organization_id:string},
    @MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalChangeStoreBuyerBlock(token, input, context)
  }

  @InjectTransactionManager()
  async personalStorePriceGroupAccess(
    token:string,input:{action:"grant"|"revoke"|"read";organization_id:string;
      seller_id:string;buyer_organization_id:string;customer_group_id:string;
      member_binding_id:string;member_actor_id:string;member_person_id:string},
    @MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalStorePriceGroupAccess(token, input, context)
  }

  @InjectTransactionManager()
  async personalBuyerStorePriceGroupIds(
    token:string,buyerOrganizationId:string,sellerId:string,
    @MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalBuyerStorePriceGroupIds(token, buyerOrganizationId, sellerId, context)
  }

  @InjectTransactionManager()
  async personalStoreBuyerBlockDecision(
    token:string,buyerOrganizationId:string,sellerIds:string[],
    @MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalStoreBuyerBlockDecision(token, buyerOrganizationId, sellerIds, context)
  }

  @InjectTransactionManager()
  async personalBuyerStoreFollowState(
    token:string,organizationId:string,sellerId:string,
    @MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalBuyerStoreFollowState(token, organizationId, sellerId, context)
  }

  @InjectTransactionManager()
  async personalBuyerStoreFollows(
    token:string,organizationId:string,after:string|undefined,
    @MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalBuyerStoreFollows(token, organizationId, after, context)
  }

  @InjectTransactionManager()
  async personalChangeBuyerStoreFollow(
    token:string,input:{action:"follow"|"unfollow";organization_id:string;
      seller_id:string;expected_version:number},
    @MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalChangeBuyerStoreFollow(token, input, context)
  }

  @InjectTransactionManager()
  async personalBuyerOrganization(
    token:string,organizationId:string,@MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalBuyerOrganization(token, organizationId, context)
  }

  @InjectTransactionManager()
  async personalClaimBuyerCart(
    token:string,organizationId:string,cartId:string,customerId:string,
    @MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalClaimBuyerCart(token, organizationId, cartId, customerId, context)
  }

  @InjectTransactionManager()
  async personalBuyerCartAttribution(
    token:string,organizationId:string,cartId:string,customerId:string,
    @MedusaContext() context:Context={}
  ) {
    return this.buyerOperations_(context).personalBuyerCartAttribution(token, organizationId, cartId, customerId, context)
  }

  @InjectTransactionManager()
  async authorizeBuyerCheckout(
    cartId:string,
    customerId:string,
    sellerIds:string[],
    @MedusaContext() context:Context={}
  ):Promise<boolean> {
    return this.buyerOperations_(context).authorizeBuyerCheckout(cartId, customerId, sellerIds, context)
  }

  @InjectTransactionManager()
  async personalProductDraftScope(
    token:string,organizationId:string,sellerId:string,
    @MedusaContext() context:Context={}
  ) {
    return this.productDrafts_(context).personalProductDraftScope(token, organizationId, sellerId, context)
  }

  @InjectTransactionManager()
  async personalProductDraftCandidates(
    token:string,organizationId:string,@MedusaContext() context:Context={}
  ) {
    return this.productDrafts_(context).personalProductDraftCandidates(token, organizationId, context)
  }

  @InjectTransactionManager()
  async personalProductDraftReceipt(
    token:string,organizationId:string,sellerId:string,requestId:string,
    @MedusaContext() context:Context={}
  ) {
    return this.productDrafts_(context).personalProductDraftReceipt(token, organizationId, sellerId, requestId, context)
  }

  @InjectTransactionManager()
  async personalWithProductDraftPermissionLock<T>(
    token:string,input:{organization_id:string;seller_id:string},
    execute:(context:Context)=>Promise<T>,@MedusaContext() context:Context={}
  ):Promise<T|null> {
    return this.productDrafts_(context).personalWithProductDraftPermissionLock(token, input, execute, context)
  }

  @InjectTransactionManager()
  async personalReserveProductDraft(
    token:string,input:{request_id:string;organization_id:string;seller_id:string;title:string},
    @MedusaContext() context:Context={}
  ) {
    return this.productDrafts_(context).personalReserveProductDraft(token, input, context)
  }

  @InjectTransactionManager()
  async personalCompleteProductDraft(
    token:string,input:{request_id:string;organization_id:string;seller_id:string;title:string},
    productId:string,@MedusaContext() context:Context={}
  ) {
    return this.productDrafts_(context).personalCompleteProductDraft(token, input, productId, context)
  }

  @InjectTransactionManager()
  async personalCompanyLauncher(
    token:string,org:string,@MedusaContext() context:Context={}
  ) {
    return this.launchers_(context).personalCompanyLauncher(token, org, context)
  }

  @InjectTransactionManager()
  async personalSaveCompanyLauncher(
    token:string,input:{organization:string;app_ids:string[];
      collapsed_ids:string[];expected_version:number},
    @MedusaContext() context:Context={}
  ) {
    return this.launchers_(context).personalSaveCompanyLauncher(token, input, context)
  }

  @InjectTransactionManager()
  async personalPlatformLauncher(
    token: string, @MedusaContext() context: Context = {}
  ) {
    return this.launchers_(context).personalPlatformLauncher(token, context)
  }

  @InjectTransactionManager()
  async personalSavePlatformLauncher(
    token: string, input: { app_ids: string[]; collapsed_ids: string[]; expected_version: number },
    @MedusaContext() context: Context = {}
  ) {
    return this.launchers_(context).personalSavePlatformLauncher(token, input, context)
  }

  @InjectTransactionManager()
  async getLauncherPreference(token: string, @MedusaContext() context: Context = {}) {
    return this.launchers_(context).getLauncherPreference(token, context)
  }

  @InjectTransactionManager()
  async saveLauncherPreference(
    token: string,
    rawAppIds: string[],
    rawCollapsedIds: string[],
    expectedVersion: number,
    @MedusaContext() context: Context = {}
  ) {
    return this.launchers_(context).saveLauncherPreference(token, rawAppIds, rawCollapsedIds, expectedVersion, context)
  }

  @InjectTransactionManager()
  async personalBeginMfaEnrollment(token:string,authIdentityId:string,factorId:string,@MedusaContext() context:Context={}) {
    return this.nativeMfa_(context).personalBeginMfaEnrollment(token, authIdentityId, factorId, context)
  }

  @InjectTransactionManager()
  async personalRevokePendingMfaEnrollment(token:string,factorId:string,@MedusaContext() context:Context={}) {
    return this.nativeMfa_(context).personalRevokePendingMfaEnrollment(token, factorId, context)
  }

  @InjectTransactionManager()
  async personalClaimMfaVerification(token:string,ticket:string,@MedusaContext() context:Context={}) {
    return this.nativeMfa_(context).personalClaimMfaVerification(token, ticket, context)
  }

  @InjectTransactionManager()
  async personalCompleteMfaEnrollment(token:string,ticket:string,factorId:string,@MedusaContext() context:Context={}) {
    return this.nativeMfa_(context).personalCompleteMfaEnrollment(token, ticket, factorId, context)
  }

  @InjectTransactionManager()
  async personalMfaSettings(token: string, @MedusaContext() context: Context = {}) {
    return this.nativeMfa_(context).personalMfaSettings(token, context)
  }

  @InjectTransactionManager()
  async personalSetMfaPreference(token: string, enabled: boolean, expectedVersion: number, @MedusaContext() context: Context = {}) {
    return this.nativeMfa_(context).personalSetMfaPreference(token, enabled, expectedVersion, context)
  }

  @InjectTransactionManager()
  async personalManageNativeMfa(token:string,action:"recovery_codes"|"disable",operation:(identityId:string)=>Promise<unknown>,@MedusaContext() context:Context={}) {
    return this.nativeMfa_(context).personalManageNativeMfa(token, action, operation, context)
  }

  @InjectTransactionManager()
  async personalPrepareNativeMfaDisable(token:string,@MedusaContext() context:Context={}) {
    return this.nativeMfa_(context).personalPrepareNativeMfaDisable(token, context)
  }

  @InjectTransactionManager()
  async personalCompletePreparedNativeMfaDisable(
    prepared:Readonly<{session_id:string;person_id:string;auth_identity_id:string;actor_type:MfaAuditActor["actor_type"];actor_id:string}>,
    operation:(identityId:string)=>Promise<unknown>,
    @MedusaContext() context:Context={}
  ) {
    return this.nativeMfa_(context).personalCompletePreparedNativeMfaDisable(prepared, operation, context)
  }

  @InjectTransactionManager()
  async personalSetPlatformMfaMode(token: string, mode: MfaPlatformMode, expectedVersion: number, @MedusaContext() context: Context = {}) {
    return this.nativeMfa_(context).personalSetPlatformMfaMode(token, mode, expectedVersion, context)
  }

  @InjectTransactionManager()
  async getActiveSmtpConfig(@MedusaContext() context: Context = {}) {
    return this.smtpOperations_(context).getActiveSmtpConfig(context)
  }

  @InjectTransactionManager()
  async personalPlatformSmtpSettings(token: string, @MedusaContext() context: Context = {}) {
    return this.smtpOperations_(context).personalPlatformSmtpSettings(token, context)
  }

  @InjectTransactionManager()
  async personalUpdatePlatformSmtpSettings(
    token: string,
    input: UpdateSmtpSettingsInput,
    @MedusaContext() context: Context = {}
  ) {
    return this.smtpOperations_(context).personalUpdatePlatformSmtpSettings(token, input, context)
  }

  @InjectTransactionManager()
  async personalTestPlatformSmtpSettings(
    token: string,
    targetRecipient: string,
    candidateSettings?: Partial<UpdateSmtpSettingsInput>,
    @MedusaContext() context: Context = {}
  ) {
    return this.smtpOperations_(context).personalTestPlatformSmtpSettings(token, targetRecipient, candidateSettings, context)
  }
}
