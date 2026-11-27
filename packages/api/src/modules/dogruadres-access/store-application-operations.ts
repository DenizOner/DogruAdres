/// <reference lib="es2022.intl" />
import { toHandle } from "@medusajs/framework/utils"
import { queueDigestIfEligible } from "./notification-preferences"
import { organizationActionAllowed } from "./role-action-policy"
import { platformApprovedSellerIds } from "./legal-store-ownership"
import { randomUUID } from "node:crypto"
import type { Context } from "@medusajs/framework/types"
import {
  IdentitySessions,
  securitySql,
  isCurrentProtectedOwner,
  IdentityAccessDenied,
  type SecuritySql,
} from "./identity-session"
import { eligibleOwner, readStoreApplications, storeRequestFingerprint, type StoreRequest } from "./store-application"
import {
  readStoreDrafts,
  authorizedStoreDraftActor,
  verifiedStoreDraftGrant,
  storeDraftPayload,
  type StoreDraftInput,
} from "./store-application-draft"
import type { FoundationAuditInput } from "./service"
import { DOGRUADRES_AUDIT_MODULE } from "./service"


const acceptedInviteEmailPattern = "^[A-Za-z0-9_+%-]+([.][A-Za-z0-9_+%-]+)*@[A-Za-z0-9]+([-][A-Za-z0-9]+)*([.][A-Za-z0-9]+([-][A-Za-z0-9]+)*)*[.][A-Za-z]{2,}$"
function acceptedInviteSqlLabel(alias: string) {
  return `case when length(btrim(${alias}.recipient_email))<=254
    and btrim(${alias}.recipient_email) collate "C" ~ '${acceptedInviteEmailPattern}'
    then lower(btrim(${alias}.recipient_email) collate "C") else '' end`
}

export class StoreApplicationOperations {
  constructor(
    _db: SecuritySql,
    private persistAuditEventsWithOutbox: (input: FoundationAuditInput[], sharedContext: Context) => Promise<any[]>,
    private reviewableStoreApplications: (token: string, target?: any, context?: Context) => Promise<any>,
    _sharedContext: Context
  ) {}

  private persistAuditEventsWithOutbox_(input: FoundationAuditInput[], sharedContext: Context) {
    return this.persistAuditEventsWithOutbox(input, sharedContext)
  }

  private personalReviewableStoreApplications(token: string, target?: any, context?: Context) {
    return this.reviewableStoreApplications(token, target, context)
  }

  async personalStoreApplications(token:string,org:string,context:Context={}){
    const db=securitySql(context.transactionManager)
    const drafts=await readStoreDrafts(db,token,org)
    if(!drafts)return null
    // An explicitly authorized Member sees only unfinished Organization
    // drafts. Official Seller applications are an Owner-only resource.
    const applications=drafts.draft_role==="owner"?
      await readStoreApplications(db,token,org):[]
    if(!applications)return null
    // Historical applications stay readable, but the native Seller's *live*
    // status and private rejection reason require today's verified, unrevoked
    // Organization↔Store association (including canonical audit/outbox).
    // This is a server-internal hint, never part of the public response.
    // Only currently displayed, structurally valid created-application
    // Sellers can need live native state. Other verified Stores in this
    // Organization must not exhaust a global 50-Store authorization cap.
    const sellerCandidates=[...new Set(applications
      .filter(app=>app.status==="created"&&typeof app.seller_id==="string"&&
        /^sel_[A-Za-z0-9_-]+$/.test(app.seller_id))
      .map(app=>app.seller_id as string))]
    const currentSellerIds=new Set(sellerCandidates.length?
      await platformApprovedSellerIds(db,org,sellerCandidates):[])
    const scopedApplications=applications.map(app=>({
      ...app,live_seller_authorized:app.status==="created" &&
        typeof app.seller_id==="string" && currentSellerIds.has(app.seller_id)
    }))
    const policy=await db.execute(`select store_application_enabled from da_organization
      where id=? and status='active' and deleted_at is null`,[org])
    if(policy.length!==1||typeof policy[0].store_application_enabled!=="boolean")
      return null
    return {applications:scopedApplications,store_application_enabled:policy[0].store_application_enabled as boolean,
      draft_role:drafts.draft_role,drafts:drafts.drafts,
      has_more_drafts:drafts.has_more_drafts}
  }

  /** A save is only Organization-private input. No native Seller, irreversible
   * reservation, Store entitlement, or application submission is performed. */
  async personalSaveStoreApplicationDraft(token:string,input:StoreDraftInput,
    context:Context={}){
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
  async personalListStoreDraftPermissions(token:string,org:string,after:string|null=null,
    context:Context={}){
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
  async personalChangeStoreDraftPermission(
    token:string,input:{action:"grant"|"revoke";organization_id:string;membership_id:string},
    context:Context={}
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
      await queueDigestIfEligible(db, {
        person_id: personId,
        organization_id: input.organization_id,
        category: "store_operations",
        event_action: audit.action,
        audit_event_id: audit.id,
        summary_key: "store_draft_permission",
      })
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
    await queueDigestIfEligible(db, {
      person_id: personId,
      organization_id: active[0].organization_id,
      category: "store_operations",
      event_action: audit.action,
      audit_event_id: audit.id,
      summary_key: "store_draft_permission",
    })
    return {status:"revoked" as const,grant_id:grantId}
  }

  // A dedicated platform task is required. Holding organization.provision or
  // store.approve must NEVER silently grant this independent company policy
  // authority. An explicit task grant with strong authentication is mandatory.
  async personalPlatformStoreApplicationRight(token:string,org:string,
    context:Context={}){
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

  async personalSetStoreApplicationRight(token:string,input:{
    organization_id:string;expected_enabled:boolean;expected_version:number;enabled:boolean;reason:string
  },context:Context={}){
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
  async personalPrepareStoreApplicationFromDraft(token:string,input:{
    organization_id:string;draft_id:string;expected_version:number;application_id:string
  },context:Context={}):Promise<StoreRequest|{conflict:true}|null>{
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
  async personalWithStoreApplicationOwnerLock<T>(
    token:string,input:StoreRequest,execute:(context:Context)=>Promise<T>,
    context:Context={}
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

  async reserveStoreApplication(token:string,input:StoreRequest,context:Context={}){
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
    // Lock the application row BEFORE its draft. The native Seller
    // completion transaction holds this application FOR SHARE and later
    // updates the draft. A second Owner must wait on the application, not
    // hold the draft while waiting: that would deadlock the first Owner.
    // The advisory lock still serializes identical application IDs; the
    // draft row still serializes distinct IDs and concurrent Member saves.
    const prior=await db.execute(`select * from da_store_application where id=? for update`,[input.application_id])
    if(prior.length>1)throw new IdentityAccessDenied()
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
    const assigned=await db.execute(`select 1 from da_store_name_transfer
      where status='assigned' and
        (name_hash=? or old_handle=?) limit 1`,[nameHash,toHandle(input.name)])
    if(assigned.length)return {status:"name_taken" as const}
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

  async claimStoreApplication(token:string,input:StoreRequest,context:Context={}){
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

  async finishStoreApplication(token:string,input:StoreRequest,sellerId:string,
    context:Context={}){
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
  async personalWithStoreApprovalStaffLock<T>(
    token:string,target:{application_id:string;seller_id:string;decision?:"reject"|"unsuspend"|"reconcile"|"release"},
    execute:(context:Context)=>Promise<T>,context:Context={}
  ):Promise<T|null>{
    if(!/^daapp_[0-9a-f]{32}$/.test(target.application_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(target.seller_id)||
       (target.decision!==undefined&&!["reject","unsuspend","reconcile","release"].includes(target.decision))||
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
    if(target.decision===undefined){
      const policy=await db.execute(`select store_application_enabled
        from da_organization where id=? and status='active' and deleted_at is null
        for share`,[candidate[0].organization_id])
      if(policy.length!==1||policy[0].store_application_enabled!==true)return null
    }
    const latest=await this.personalReviewableStoreApplications(token,target,context)
    if(!latest||latest.length!==1||
       (target.decision===undefined&&latest[0].on_hold))return null
    return execute(context)
  }


  /** B22: Existing Mercur unsuspend may run only for the same historical
   * approved Seller whose active normalized name/URL still belongs to it.
   * The caller holds the actual Staff grant and the shared Seller decision
   * lock; the global name lock serializes concurrent first-party claims.
   * No name reassignment, unilateral Owner approval or native core patch.
   */
  /**
   * Staff-only, reasoned transfer of one suspended Store's original name
   * RIGHT. Neither the source nor the recipient Seller is mutated or opened.
   * The source must later rename under its real Owner/Staff approval; the
   * recipient can only use the URL after that native rename has completed.
   */
  
}
