/// <reference lib="es2022.intl" />
import { toHandle } from "@medusajs/framework/utils"
import { ActorDelegation } from "./actor-delegation"
import type { Context } from "@medusajs/framework/types"
import {
  IdentitySessions,
  securitySql,
  isCurrentProtectedOwner,
  IdentityAccessDenied,
  type SecuritySql,
} from "./identity-session"
import { platformApprovedSellerIds } from "./legal-store-ownership"
import { validStoreName, validStoreHandle, STORE_RENAME_RISK_VERSION } from "./store-name-policy"
import type { FoundationAuditInput } from "./service"
import { DOGRUADRES_AUDIT_MODULE } from "./service"


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


export class StoreRenameOperations {
  constructor(
    _db: SecuritySql,
    private persistAuditEventsWithOutbox: (input: FoundationAuditInput[], sharedContext: Context) => Promise<any[]>,
    _sharedContext: Context
  ) {}

  private persistAuditEventsWithOutbox_(input: FoundationAuditInput[], sharedContext: Context) {
    return this.persistAuditEventsWithOutbox(input, sharedContext)
  }

  async personalAssignSuspendedStoreNameRight(token:string,input:{
    transfer_id:string;source_application_id:string;source_seller_id:string;
    target_application_id:string;target_seller_id:string;
    expected_name:string;expected_handle:string;reason:string
  },context:Context={}){
    if(!/^dastr_[a-f0-9]{32}$/.test(input.transfer_id)||
       !/^daapp_[a-f0-9]{32}$/.test(input.source_application_id)||
       !/^daapp_[a-f0-9]{32}$/.test(input.target_application_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.source_seller_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.target_seller_id)||
       input.source_seller_id===input.target_seller_id||
       typeof input.expected_name!=="string"||!validStoreName(input.expected_name)||
       typeof input.expected_handle!=="string"||!validStoreHandle(input.expected_handle)||
       typeof input.reason!=="string"||input.reason.trim()!==input.reason||
       input.reason.length<10||input.reason.length>500||
       [...input.reason.matchAll(/[\p{L}\p{N}]/gu)].length<10)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const staff=await sessions.staff(token,"store.approve","platform")
    if(!staff)return null
    const grant=await db.execute(`select id from da_platform_staff_grant
      where id=? and person_id=? and task='store.approve' and resource='platform'
        and revoked_at is null
        and (expires_at is null or expires_at>clock_timestamp())
      for share`,[staff.grant_id,staff.person_id])
    if(grant.length!==1||grant[0].id!==staff.grant_id)return null
    // Always acquire BOTH Store locks in deterministic order.
    for(const sellerId of [input.source_seller_id,input.target_seller_id].sort())
      await db.execute("select pg_advisory_xact_lock(hashtext('b22-store-rename'),hashtext(?))",
        [sellerId])
    const past=await db.execute(`select source_application_id,source_seller_id,
      target_application_id,target_seller_id,old_name,old_handle,reason
      from da_store_name_transfer where id=? for update`,[input.transfer_id])
    if(past.length>1)throw new IdentityAccessDenied()
    if(past.length){
      const x=past[0]
      if(x.source_application_id!==input.source_application_id||
         x.source_seller_id!==input.source_seller_id||
         x.target_application_id!==input.target_application_id||
         x.target_seller_id!==input.target_seller_id||
         x.old_name!==input.expected_name||x.old_handle!==input.expected_handle||
         x.reason!==input.reason)throw new IdentityAccessDenied()
      return {status:"assigned" as const,replayed:true}
    }
    const source=await db.execute(`select a.organization_id,s.name,s.handle,a.store_name_hash,
        a.name_claim_released_at
      from da_store_application a
      join da_organization d on d.id=a.organization_id
        and d.status='active' and d.deleted_at is null
      join da_organization_seller_ownership o on o.organization_id=a.organization_id
        and o.seller_id=a.seller_id and o.revoked_at is null
      join seller s on s.id=a.seller_id and s.deleted_at is null
        and s.status='suspended' and s.approved_at is not null
      join da_audit_event e on e.id=o.verification_audit_event_id
        and e.action='organization.store_application_created'
        and e.resource='store-application' and e.module='dogruadres-access'
        and e.deleted_at is null and e.organization_id=a.organization_id
        and e.target_id=a.seller_id and e.new_values->>'application_id'=a.id
      where a.id=? and a.seller_id=? and a.status='created'
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id and x.source_module='dogruadres-access'
            and x.deleted_at is null)
      for share of a,d,o,s`,[input.source_application_id,input.source_seller_id])
    if(source.length!==1||source[0].name!==input.expected_name||
       source[0].handle!==input.expected_handle)return {status:"conflict" as const}
    const target=await db.execute(`select a.organization_id
      from da_store_application a
      join da_organization d on d.id=a.organization_id
        and d.status='active' and d.deleted_at is null
      join da_organization_seller_ownership o on o.organization_id=a.organization_id
        and o.seller_id=a.seller_id and o.revoked_at is null
      join seller s on s.id=a.seller_id and s.deleted_at is null
        and s.status in ('open','suspended') and s.approved_at is not null
      join da_audit_event e on e.id=o.verification_audit_event_id
        and e.action='organization.store_application_created'
        and e.resource='store-application' and e.module='dogruadres-access'
        and e.deleted_at is null and e.organization_id=a.organization_id
        and e.target_id=a.seller_id and e.new_values->>'application_id'=a.id
      where a.id=? and a.seller_id=? and a.status='created'
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id and x.source_module='dogruadres-access'
            and x.deleted_at is null)
      for share of a,d,o,s`,[input.target_application_id,input.target_seller_id])
    if(target.length!==1)return {status:"conflict" as const}
    if(!(await platformApprovedSellerIds(db,source[0].organization_id)).includes(input.source_seller_id)||
       !(await platformApprovedSellerIds(db,target[0].organization_id)).includes(input.target_seller_id))
      return null
    const hashes=await db.execute(`select encode(sha256(convert_to(lower(
      regexp_replace(btrim(normalize(?,NFKC)),'[[:space:]]+',' ','g')),
      'UTF8')),'hex') as hash`,[input.expected_name])
    const hash=hashes[0]?.hash
    if(hashes.length!==1||typeof hash!=="string"||!/^[a-f0-9]{64}$/.test(hash))
      return {status:"conflict" as const}
    // The application fingerprint is immutable. A subsequent native name is
    // legitimate only with its matching Staff approval AND durable audit/outbox.
    const originalName=hash===source[0].store_name_hash &&
      source[0].name_claim_released_at===null &&
      toHandle(input.expected_name)===input.expected_handle
    const renamed=originalName?[]:await db.execute(`select r.id
      from da_store_rename_request r
      where r.seller_id=? and r.organization_id=? and r.status='approved'
        and r.proposed_name=? and r.proposed_handle=?
        and exists(select 1 from da_audit_event e
          join da_audit_outbox x on x.source_audit_event_id=e.id
          where e.organization_id=? and e.target_id=?
            and e.action='organization.store_rename_approved'
            and e.module='dogruadres-access'
            and e.resource='store-rename-request'
            and e.new_values->>'request_id'=r.id
            and e.deleted_at is null and x.deleted_at is null
            and x.source_module='dogruadres-access')
      limit 2`,[input.source_seller_id,source[0].organization_id,
        input.expected_name,input.expected_handle,
        source[0].organization_id,input.source_seller_id])
    if(!originalName&&renamed.length!==1)return {status:"conflict" as const}
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-global-store-name'),hashtext(?))",
      [hash])
    const reserved=await db.execute(`select 1 from da_store_name_transfer
      where status='assigned' and (name_hash=? or old_handle=?) limit 1`,
      [hash,input.expected_handle])
    const otherClaim=await db.execute(`select 1 from da_store_application
      where id<>? and store_name_hash=? and
        (name_claim_released_at is null or name_claim_released_at>clock_timestamp())
      limit 1`,[input.source_application_id,hash])
    const pending=await db.execute(`select 1 from da_store_rename_request
      where seller_id=? and status in ('pending_review','approving') limit 1`,
      [input.source_seller_id])
    if(reserved.length||otherClaim.length||pending.length)return {status:"conflict" as const}
    const fresh=await sessions.staff(token,"store.approve","platform")
    if(!fresh||fresh.grant_id!==staff.grant_id)return null
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:staff.person_id,actor_type:staff.actor_type,
      actor_id:staff.actor_id,role_context:"platform_staff",
      organization_id:source[0].organization_id,
      action:"organization.store_name_right_assigned",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-name-transfer",
      target_id:input.source_seller_id,
      new_values:{transfer_id:input.transfer_id,
        source_application_id:input.source_application_id,
        target_application_id:input.target_application_id,
        target_seller_id:input.target_seller_id,status:"assigned"},
      occurred_at:new Date()
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const saved=await db.execute(`insert into da_store_name_transfer
      (id,source_application_id,source_seller_id,source_organization_id,
       target_application_id,target_seller_id,target_organization_id,
       old_name,old_handle,name_hash,reason,decided_by_person_id,
       source_audit_event_id,status)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?,'assigned') returning id`,[
      input.transfer_id,input.source_application_id,input.source_seller_id,
      source[0].organization_id,input.target_application_id,input.target_seller_id,
      target[0].organization_id,input.expected_name,input.expected_handle,
      hash,input.reason,staff.person_id,audit.id])
    if(saved.length!==1)throw new IdentityAccessDenied()
    // Only an original still-active application claim is released here.
    // A Staff-approved preceding rename already set its original 30-day
    // expiry: preserve that history and never shorten the old-name hold.
    if(originalName){
      const released=await db.execute(`update da_store_application
        set name_claim_released_at=clock_timestamp(),updated_at=clock_timestamp()
        where id=? and seller_id=? and name_claim_released_at is null
        returning id`,[input.source_application_id,input.source_seller_id])
      if(released.length!==1)throw new IdentityAccessDenied()
    }
    return {status:"assigned" as const,replayed:false}
  }

  /** A native unsuspend may have committed while the separate canonical
   * completion failed. Under the existing per-Seller advisory lock, any
   * unclosed reactivation claim blocks a new rename request or Staff claim.
   * A malformed/incomplete claim also fails closed; a terminal decision must
   * have its own durable outbox proof. This query grants NO authority.
   */
  private async hasUnresolvedStoreReactivationClaim_(
    db:SecuritySql,sellerId:string
  ):Promise<boolean>{
    const rows=await db.execute(`select 1 from da_audit_event c
      where c.target_id=? and c.module='dogruadres-access'
        and c.resource='store-application'
        and c.action='organization.store_reactivation_claimed'
        and c.deleted_at is null
        and not exists(select 1 from da_audit_event done
          join da_audit_outbox x on x.source_audit_event_id=done.id
            and x.source_module='dogruadres-access' and x.deleted_at is null
          where done.module='dogruadres-access'
            and done.resource='store-application'
            and done.action in ('organization.store_reactivated',
              'organization.store_reactivation_released')
            and done.organization_id=c.organization_id
            and done.target_id=c.target_id and done.deleted_at is null
            and done.new_values->>'claim_audit_id'=c.id)
      limit 1`,[sellerId])
    return rows.length>0
  }

  async personalCurrentSuspendedStoreName(token:string,target:{
    application_id:string;seller_id:string;expected_status?:"open"
  },context:Context={}){
    if(target.expected_status!==undefined&&target.expected_status!=="open")
      throw new IdentityAccessDenied()
    if(!/^daapp_[a-f0-9]{32}$/.test(target.application_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(target.seller_id))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.approve","platform")
    if(!staff)return null
    // Serializes with an already pending native name/URL decision as well as
    // the platform's ordinary Store approval/rejection lock.
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-store-rename'),hashtext(?))",
      [target.seller_id])
    const rows=await db.execute(`select a.organization_id,s.name,s.handle
      from da_store_application a
      join da_organization d on d.id=a.organization_id
        and d.status='active' and d.deleted_at is null
      join da_organization_seller_ownership o on o.organization_id=a.organization_id
        and o.seller_id=a.seller_id and o.revoked_at is null
      join da_audit_event origin on origin.id=o.verification_audit_event_id
        and origin.module='dogruadres-access' and origin.deleted_at is null
        and origin.organization_id=a.organization_id and origin.target_id=a.seller_id
        and origin.actor_person_id=a.person_id
        and origin.action='organization.store_application_created'
        and origin.new_values->>'application_id'=a.id
      join seller s on s.id=a.seller_id and s.deleted_at is null
        and s.status=? and s.approved_at is not null
      where a.id=? and a.seller_id=? and a.status='created'
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=origin.id
            and x.source_module='dogruadres-access' and x.deleted_at is null)
      for share of a,d,o`,[target.expected_status==="open"?"open":"suspended",
        target.application_id,target.seller_id])
    if(rows.length!==1)return {status:"conflict" as const}
    const r=rows[0]
    if(typeof r.name!=="string"||!validStoreName(r.name)||
       typeof r.handle!=="string"||!validStoreHandle(r.handle))
      return {status:"conflict" as const}
    const hashes=await db.execute(`select encode(sha256(convert_to(
      lower(regexp_replace(btrim(normalize(?,NFKC)),'[[:space:]]+',' ','g')),
      'UTF8')),'hex') as hash`,[r.name])
    const hash=hashes[0]?.hash
    if(hashes.length!==1||typeof hash!=="string"||!/^[a-f0-9]{64}$/.test(hash))
      throw new IdentityAccessDenied()
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-global-store-name'),hashtext(?))",[hash])
    const original=await db.execute(`select id from da_store_application
      where id=? and seller_id=? and store_name_hash=?
        and name_claim_released_at is null limit 2`,
      [target.application_id,target.seller_id,hash])
    // A -> B -> C -> B is lawful history, not two competing rights.
    // The LAST completed approval must itself prove the native name + URL.
    // Never borrow an older matching audit if the newest approval differs.
    const renamed=await db.execute(`select r.proposed_name,r.proposed_handle,
        exists(select 1 from da_audit_event e
          join da_audit_outbox x on x.source_audit_event_id=e.id
            and x.source_module='dogruadres-access' and x.deleted_at is null
          where e.organization_id=r.organization_id and e.target_id=r.seller_id
            and e.action='organization.store_rename_approved'
            and e.module='dogruadres-access'
            and e.resource='store-rename-request'
            and e.new_values->>'request_id'=r.id and e.deleted_at is null)
          as source_proven
      from da_store_rename_request r
      where r.seller_id=? and r.organization_id=?
        and r.status='approved' and r.approved_at is not null
      order by r.approved_at desc,r.id desc limit 1`,
      [target.seller_id,r.organization_id])
    // An original application proves only its name-derived native URL.
    const originalHandleMatches=original.length===1&&toHandle(r.name)===r.handle
    const latestRenameMatches=renamed.length===1&&
      renamed[0].source_proven===true&&
      renamed[0].proposed_name===r.name&&renamed[0].proposed_handle===r.handle
    if((!originalHandleMatches&&!latestRenameMatches)||original.length>1)
      return {status:"conflict" as const}
    const transferred=await db.execute(`select 1 from da_store_name_transfer
      where source_seller_id=? and status='assigned' and
        name_hash=? and old_handle=? limit 1`,[target.seller_id,hash,r.handle])
    if(transferred.length)return {status:"conflict" as const}
    const conflicts=await db.execute(`select 1 from da_store_application
      where (seller_id is null or seller_id<>?) and store_name_hash=?
        and (name_claim_released_at is null or name_claim_released_at>clock_timestamp())
      limit 1`,[target.seller_id,hash])
    const native=await db.execute(`select 1 from seller where id<>? and deleted_at is null
      and (encode(sha256(convert_to(lower(regexp_replace(
        btrim(normalize(name,NFKC)),'[[:space:]]+',' ','g')),'UTF8')),'hex')=?
        or lower(handle)=lower(?)) limit 1`,
      [target.seller_id,hash,r.handle])
    const held=await db.execute(`select 1 from da_store_rename_request h
      where (h.seller_id<>? or h.status='approving') and
        (h.status='approving' or
          (h.status='approved' and h.approved_at>
             clock_timestamp()-interval '30 days'))
        and (encode(sha256(convert_to(lower(regexp_replace(
              btrim(normalize(h.old_name,NFKC)),'[[:space:]]+',' ','g')),'UTF8')),'hex')=?
          or lower(h.old_handle)=lower(?)
          or (h.status='approving' and
            (encode(sha256(convert_to(lower(regexp_replace(
              btrim(normalize(h.proposed_name,NFKC)),'[[:space:]]+',' ','g')),'UTF8')),'hex')=?
             or lower(h.proposed_handle)=lower(?))))
        ${authorizedTransferredOldNameHoldExclusion}
      limit 1`,[target.seller_id,hash,r.handle,hash,r.handle,
        target.seller_id,r.organization_id,hash,r.handle])
    if(conflicts.length||native.length||held.length)
      return {status:"conflict" as const}
    return {status:"eligible" as const,organization_id:r.organization_id as string,
      name:r.name as string,handle:r.handle as string}
  }


  /** Commit this private canonical intent BEFORE a separate native Mercur
   * workflow starts. A crash can leave a claim without completion, but never
   * an untraceable Seller opening. Called under the existing Staff/Seller/
   * current-name locks and a distinct first transaction.
   */
  async personalClaimStoreReactivation(token:string,input:{
    application_id:string;seller_id:string;organization_id:string;
    name:string;handle:string
  },context:Context={}){
    if(!/^daapp_[a-f0-9]{32}$/.test(input.application_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !validStoreName(input.name)||!validStoreHandle(input.handle))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.approve","platform")
    if(!staff)return null
    const unresolved=await this.personalUnresolvedStoreReactivationClaim(token,{
      application_id:input.application_id,seller_id:input.seller_id
    },context)
    if(!unresolved)return {status:"conflict" as const}
    if(unresolved.status==="claimed"||unresolved.status==="ambiguous")
      return {status:"conflict" as const}
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:staff.person_id,actor_type:staff.actor_type,
      actor_id:staff.actor_id,role_context:"platform_staff",
      organization_id:input.organization_id,
      action:"organization.store_reactivation_claimed",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-application",
      target_id:input.seller_id,
      new_values:{application_id:input.application_id,status:"pending_native",
        name:input.name,handle:input.handle,staff_grant_id:staff.grant_id},
      occurred_at:new Date()
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    return {status:"claimed" as const,claim_audit_id:audit.id as string}
  }

  /** Read only the pending, source-proven claim for an authorized Staff
   * member. A separate Staff member can reconcile a crash without calling
   * native unsuspend again; ambiguous claims fail closed.
   */
  async personalUnresolvedStoreReactivationClaim(token:string,target:{
    application_id:string;seller_id:string
  },context:Context={}){
    if(!/^daapp_[a-f0-9]{32}$/.test(target.application_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(target.seller_id))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.approve","platform")
    if(!staff)return null
    const rows=await db.execute(`select e.id claim_audit_id,e.organization_id,
        e.new_values->>'name' name,e.new_values->>'handle' handle
      from da_audit_event e
      join da_store_application a on a.id=e.new_values->>'application_id'
        and a.seller_id=e.target_id and a.status='created'
      join da_organization d on d.id=a.organization_id
        and d.status='active' and d.deleted_at is null
      join da_organization_seller_ownership o on o.organization_id=a.organization_id
        and o.seller_id=a.seller_id and o.revoked_at is null
      where e.action='organization.store_reactivation_claimed'
        and e.module='dogruadres-access' and e.resource='store-application'
        and e.role_context='platform_staff' and e.deleted_at is null
        and e.organization_id=a.organization_id
        and e.target_id=? and a.id=?
        and e.new_values->>'status'='pending_native'
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id and x.source_module='dogruadres-access'
            and x.deleted_at is null)
        and not exists(select 1 from da_audit_event complete
          where complete.action in ('organization.store_reactivated',
              'organization.store_reactivation_released')
            and complete.module='dogruadres-access' and complete.deleted_at is null
            and complete.organization_id=e.organization_id
            and complete.target_id=e.target_id
            and complete.new_values->>'claim_audit_id'=e.id)
      order by e.occurred_at desc,e.id desc limit 2`,
      [target.seller_id,target.application_id])
    if(rows.length>1)return {status:"ambiguous" as const}
    if(!rows.length)return {status:"none" as const}
    const r=rows[0]
    if(typeof r.claim_audit_id!=="string"||
       !/^daaud_[A-Za-z0-9_-]+$/.test(r.claim_audit_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(r.organization_id)||
       typeof r.name!=="string"||!validStoreName(r.name)||
       typeof r.handle!=="string"||!validStoreHandle(r.handle))
      return {status:"ambiguous" as const}
    return {status:"claimed" as const,claim_audit_id:r.claim_audit_id as string,
      organization_id:r.organization_id as string,
      name:r.name as string,handle:r.handle as string}
  }


  /** A committed intent may precede a process crash or a failed native
   * workflow. Resolve the uncertain attempt only while the exact Seller is
   * STILL suspended, under the same Staff/Seller transaction lock that the
   * original request holds throughout its native workflow. This operation
   * never invokes Mercur or changes a Store. If native opens, this read must
   * fail closed; the Staff should use the OPEN-Store reconciliation instead.
   * The first-party native opener rechecks this claim under the same lock
   * immediately before calling unsuspend, so a released claim cannot run.
   */
  async personalReleaseSuspendedStoreReactivationClaim(token:string,target:{
    application_id:string;seller_id:string
  },context:Context={}){
    if(!/^daapp_[a-f0-9]{32}$/.test(target.application_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(target.seller_id))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.approve","platform")
    if(!staff)return null
    // Lock the real native Seller row against a concurrent status UPDATE,
    // and verify that this is still a currently owned/approved Store.
    const rows=await db.execute(`select a.organization_id,s.id
      from da_store_application a
      join da_organization d on d.id=a.organization_id
        and d.status='active' and d.deleted_at is null
      join da_organization_seller_ownership o on o.organization_id=a.organization_id
        and o.seller_id=a.seller_id and o.revoked_at is null
      join da_audit_event origin on origin.id=o.verification_audit_event_id
        and origin.organization_id=a.organization_id
        and origin.target_id=a.seller_id
        and origin.actor_person_id=a.person_id
        and origin.action='organization.store_application_created'
        and origin.module='dogruadres-access'
        and origin.deleted_at is null
        and origin.new_values->>'application_id'=a.id
      join seller s on s.id=a.seller_id and s.deleted_at is null
        and s.status='suspended' and s.approved_at is not null
      where a.id=? and a.seller_id=? and a.status='created'
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=origin.id
            and x.source_module='dogruadres-access'
            and x.deleted_at is null)
      for update of s`,[target.application_id,target.seller_id])
    if(rows.length!==1)return {status:"conflict" as const}
    const claim=await this.personalUnresolvedStoreReactivationClaim(token,target,context)
    if(!claim||claim.status!=="claimed"||
       claim.organization_id!==rows[0].organization_id)
      return {status:"conflict" as const}
    // The native Seller is unchanged. Preserve original provenance and
    // append a terminal audit/outbox so no one silently removes the claim.
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:staff.person_id,actor_type:staff.actor_type,
      actor_id:staff.actor_id,role_context:"platform_staff",
      organization_id:claim.organization_id,
      action:"organization.store_reactivation_released",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-application",
      target_id:target.seller_id,
      new_values:{application_id:target.application_id,
        claim_audit_id:claim.claim_audit_id,status:"suspended",
        reason:"native_open_not_confirmed",staff_grant_id:staff.grant_id},
      occurred_at:new Date()
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    return {status:"released" as const,claim_audit_id:claim.claim_audit_id}
  }

  /** Persist a private, single canonical completed decision after the native
   * Seller has actually reopened. An uncertain native result is never retried.
   */
  async personalRecordStoreReactivation(token:string,target:{
    application_id:string;seller_id:string;organization_id:string;
    name:string;handle:string;claim_audit_id:string
  },context:Context={}){
    if(!/^daaud_[A-Za-z0-9_-]+$/.test(target.claim_audit_id)||
       !/^daapp_[a-f0-9]{32}$/.test(target.application_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(target.seller_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(target.organization_id))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.approve","platform")
    if(!staff)return null
    const valid=await db.execute(`select a.id from da_store_application a
      join da_organization d on d.id=a.organization_id
        and d.status='active' and d.deleted_at is null
      join da_organization_seller_ownership o on o.organization_id=a.organization_id
        and o.seller_id=a.seller_id and o.revoked_at is null
      join seller s on s.id=a.seller_id and s.deleted_at is null
        and s.status='open' and s.approved_at is not null
      where a.id=? and a.seller_id=? and a.organization_id=?
        and a.status='created' and s.name=? and s.handle=?`,
      [target.application_id,target.seller_id,target.organization_id,target.name,target.handle])
    if(valid.length!==1)return null
    const claim=await this.personalUnresolvedStoreReactivationClaim(token,{
      application_id:target.application_id,seller_id:target.seller_id
    },context)
    if(!claim||claim.status!=="claimed"||
       claim.claim_audit_id!==target.claim_audit_id||
       claim.organization_id!==target.organization_id||
       claim.name!==target.name||claim.handle!==target.handle)
      return {status:"conflict" as const}
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:staff.person_id,actor_type:staff.actor_type,
      actor_id:staff.actor_id,role_context:"platform_staff",
      organization_id:target.organization_id,
      action:"organization.store_reactivated",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-application",
      target_id:target.seller_id,
      new_values:{application_id:target.application_id,status:"open",
        claim_audit_id:target.claim_audit_id,resolution_confirmed:true,
        staff_grant_id:staff.grant_id},
      occurred_at:new Date()
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    await db.execute(`insert into da_notification_receipt(id,person_id,audit_event_id)
      select 'danot_'||gen_random_uuid()::text,m.person_id,?
      from da_organization_membership m join da_person p on p.id=m.person_id
      where m.organization_id=? and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.deleted_at is null
        and p.disabled_at is null and p.deleted_at is null
      on conflict(audit_event_id,person_id) do nothing`,
      [audit.id,target.organization_id])
    return {status:"recorded" as const}
  }

  /** Auditable staff decision after Mercur has actually terminated a PENDING
   * Seller; store the reason privately, never in the derived public index.
   * Failure after the native step stays uncertain and is never auto-retried.
   */
  async personalRecordStoreApplicationRejection(token:string,target:{
    application_id:string;seller_id:string;reason:string
  },context:Context={}){
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

  async personalReviewableStoreApplications(token:string,
    target?:{application_id:string;seller_id:string},
    context:Context={},
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
  async personalReviewableStoreRenameRequests(token:string,page=0,
    context:Context={}){
    if(!Number.isSafeInteger(page)||page<0||page>1000)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.approve","platform")
    if(!staff)return null
    const rows=await db.execute(`select r.id request_id,r.organization_id,
      d.name organization_name,r.seller_id,r.old_name,r.old_handle,
      r.proposed_name,r.proposed_handle,r.created_at,s.status seller_status,
      r.status request_status
      from da_store_rename_request r
      join da_organization d on d.id=r.organization_id
        and d.status='active' and d.deleted_at is null
      join seller s on s.id=r.seller_id and s.deleted_at is null
        and s.status in ('open','suspended') and s.approved_at is not null
        and ((r.status='pending_review' and s.name=r.old_name and s.handle=r.old_handle)
          or (r.status='approving' and
             ((s.name=r.old_name and s.handle=r.old_handle) or
              (s.name=r.proposed_name and s.handle=r.proposed_handle))))
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
      where r.status in ('pending_review','approving') and r.risk_version=?
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
         !["open","suspended"].includes(row.seller_status)||
         !["pending_review","approving"].includes(row.request_status)||
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
      created_at:row.created_at,seller_status:row.seller_status as "open"|"suspended",
      status:row.request_status as "pending_review"|"approving"
    }))}
  }

  /** A reasoned rejection is a complete review outcome: the current
   * Seller remains unchanged, the Owner can read the final request status,
   * and a canonical audit/outbox is written in the same transaction. This
   * grants no ability to approve or actually rename a native Seller.
   */
  async personalRejectStoreRenameRequest(token:string,input:{
    request_id:string;seller_id:string;reason:string
  },context:Context={}){
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
        and s.status in ('open','suspended') and s.approved_at is not null
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
  async personalClaimStoreRenameApproval(token:string,input:{
    request_id:string;seller_id:string
  },context:Context={}){
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
    // An OPEN Seller whose unsuspend completion is still unresolved must
    // retain the exact name+URL needed for canonical Staff reconciliation.
    if(await this.hasUnresolvedStoreReactivationClaim_(db,input.seller_id))
      return {status:"conflict" as const}
    const rows=await db.execute(`select r.organization_id,r.old_name,r.old_handle,
      r.proposed_name,r.proposed_handle,r.risk_version
      from da_store_rename_request r
      join da_organization d on d.id=r.organization_id
        and d.status='active' and d.deleted_at is null
      join seller s on s.id=r.seller_id and s.deleted_at is null
        and s.status in ('open','suspended') and s.approved_at is not null
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
    // History may legitimately contain A -> B -> C -> B. Only the MOST
    // RECENT completed rename proves the currently active native name+URL;
    // older matching rows are retained as immutable history, not ambiguity.
    const priorClaim=await db.execute(`select proposed_handle,
      encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(proposed_name,NFKC)),
        '[[:space:]]+',' ','g')),'UTF8')),'hex') as approved_name_hash
      from da_store_rename_request
      where seller_id=? and id<>? and status='approved'
        and approved_at is not null
      order by approved_at desc,id desc limit 1`,
      [input.seller_id,input.request_id])
    const currentPrior=priorClaim.length===1&&
      priorClaim[0].approved_name_hash===oldHash&&
      priorClaim[0].proposed_handle===r.old_handle
    const transferredSource=await db.execute(`select 1 from da_store_name_transfer
      where status='assigned' and source_seller_id=? and old_handle=?
        and name_hash=? and source_organization_id=?
        and exists(select 1 from da_audit_event e
          join da_audit_outbox x on x.source_audit_event_id=e.id
          where e.id=da_store_name_transfer.source_audit_event_id
            and e.action='organization.store_name_right_assigned'
            and e.module='dogruadres-access'
            and e.deleted_at is null and x.deleted_at is null)
      limit 2`,[input.seller_id,r.old_handle,oldHash,r.organization_id])
    if(originalClaim.length>1||transferredSource.length>1||
       !(originalClaim.length===1||currentPrior||transferredSource.length===1))
      return {status:"conflict" as const}
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-global-store-name'),hashtext(?))",
      [hash])
    // Different proposed names may still target ONE native Seller URL.
    // Always lock name first, then URL, BEFORE reading shared reservations.
    // The URL advisory is transaction-scoped: the second Store can observe
    // the first committed 'approving' hold and fail closed before Mercur.
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-global-store-handle'),hashtext(?))",
      [r.proposed_handle])
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
        ) ${authorizedTransferredOldNameHoldExclusion}
        limit 1`,[input.request_id,hash,r.proposed_handle,hash,r.proposed_handle,
          input.seller_id,r.organization_id,hash,r.proposed_handle])
    const transferReservation=await db.execute(`select 1 from da_store_name_transfer
      where status='assigned' and target_seller_id<>? and
        (name_hash=? or old_handle=?) limit 1`,
      [input.seller_id,hash,r.proposed_handle])
    if(application.length||native.length||holds.length||transferReservation.length)
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
  async personalWithStoreRenameApprovalStaffLock<T>(token:string,input:{
    request_id:string;seller_id:string
  },execute:(data:{name:string;handle:string},context:Context)=>Promise<T>,
    context:Context={}):Promise<T|null>{
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
        and s.status in ('open','suspended') and s.approved_at is not null
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
  async personalRecordStoreRenameApproval(token:string,input:{
    request_id:string;seller_id:string
  },context:Context={}){
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
        and s.status in ('open','suspended') and s.approved_at is not null
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
      // The same prior name can appear in several valid historical cycles.
      // Check the last COMPLETED name+URL, not the number of matching rows.
      const previous=await db.execute(`select proposed_handle,
        encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(proposed_name,NFKC)),
          '[[:space:]]+',' ','g')),'UTF8')),'hex') as approved_name_hash
        from da_store_rename_request
        where seller_id=? and id<>? and status='approved'
          and approved_at is not null
        order by approved_at desc,id desc limit 1`,
        [input.seller_id,input.request_id])
      if(previous.length!==1||previous[0].approved_name_hash!==oldHash||
         previous[0].proposed_handle!==r.old_handle){
        const assigned=await db.execute(`select 1 from da_store_name_transfer
          where source_seller_id=? and source_organization_id=? and
            old_handle=? and name_hash=? and status='assigned' limit 2`,
          [input.seller_id,org,r.old_handle,oldHash])
        if(assigned.length!==1)return null
      }
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
  async personalRequestStoreRename(token:string,input:{
    request_id:string;organization_id:string;seller_id:string;
    name:string;handle:string;risk_acknowledged:true;
    risk_version:typeof STORE_RENAME_RISK_VERSION
  },context:Context={}){
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
    // Staff approval and suspended Store reactivation already take this
    // per-Seller advisory lock before accessing native Seller rows. Match
    // their lock order to avoid a mutual wait (Owner SHARE -> Staff lock,
    // Staff lock -> Seller UPDATE) during a concurrent suspend/rename.
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-store-rename'),hashtext(?))",
      [input.seller_id])
    // Lock the named Seller's row and current Member link only for our local
    // request transaction. Native direct HTTP writes remain blocked at ingress.
    const native=await db.execute(`select s.name,s.handle from seller s
      join seller_member sm on sm.seller_id=s.id and sm.deleted_at is null
      join member m on m.id=sm.member_id and m.deleted_at is null and m.is_active=true
      where s.id=? and sm.member_id=? and s.deleted_at is null
        and s.status in ('open','suspended') and s.approved_at is not null
      for share of s,sm,m`,[input.seller_id,binding.binding.actor_id])
    if(native.length!==1||typeof native[0].name!=="string"||
       typeof native[0].handle!=="string")return null
    const oldName=native[0].name as string,oldHandle=native[0].handle as string
    // An idempotency key is scoped to the authorized Person, Organization and
    // exact payload. Replays do not duplicate audit/outbox or new requests.
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
    // Staff may still be completing an earlier native Store unsuspend.
    // No NEW Owner rename is allowed until its claim has a terminal receipt.
    if(await this.hasUnresolvedStoreReactivationClaim_(db,input.seller_id))
      return {status:"conflict" as const}
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
    const held=await db.execute(`select 1 from da_store_rename_request h
      where (h.status='approving' or
        (h.status='approved' and h.approved_at>
          clock_timestamp()-interval '30 days'))
      and (
        (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(h.old_name,NFKC)),
          '[[:space:]]+',' ','g')),'UTF8')),'hex')=? or h.old_handle=?)
        or (h.status='approving' and
          (encode(sha256(convert_to(lower(regexp_replace(btrim(normalize(h.proposed_name,NFKC)),
            '[[:space:]]+',' ','g')),'UTF8')),'hex')=? or h.proposed_handle=?))
      ) ${authorizedTransferredOldNameHoldExclusion}
      limit 1`,[hash,input.handle,hash,input.handle,
        input.seller_id,input.organization_id,hash,input.handle])
    const otherTransfer=await db.execute(`select 1 from da_store_name_transfer
      where status='assigned' and target_seller_id<>? and
        (name_hash=? or old_handle=?) limit 1`,
      [input.seller_id,hash,input.handle])
    if(conflict.length||nativeConflict.length||held.length||otherTransfer.length)
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
  async personalWithdrawStoreRenameRequest(token:string,input:{
    request_id:string;organization_id:string;seller_id:string
  },context:Context={}){
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
      input.seller_id])
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

  /** Private list scope for Owner Store-name management ONLY. Unlike the
   * ordinary commercial Store picker it may include approved suspended
   * Sellers, but never grants selling, products.edit or platform authority.
   * Native membership and status are independently verified by the GET
   * adapter; no native Seller IDs are inferred from a browser-selected URL.
   */
  async personalStoreRenameCandidateIds(token:string,organizationId:string,
    context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const session=new IdentitySessions(db)
    const current=await session.current(token,true,false)
    if(!current)return null
    const scope=await session.organizations(token,organizationId,false)
    if(!scope||scope.person_id!==current.person_id||
       scope.organizations.length!==1||scope.organizations[0].role!=="owner"||
       !await isCurrentProtectedOwner(db,current.person_id,organizationId))return null
    const sellerIds=await platformApprovedSellerIds(db,organizationId)
    return {person_id:current.person_id,organization_id:organizationId,
      seller_ids:sellerIds}
  }

  /** Private Owner readback for uncertain requests. No native rename or
   * approval outcome is inferred from a pending request.
   */
  async personalStoreRenameRequests(token:string,organizationId:string,sellerId:string,
    context:Context={}){
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
       !["pending_review","approving","approved","rejected","withdrawn"].includes(row.status)))
      throw new IdentityAccessDenied()
    return {organization_id:organizationId,seller_id:sellerId,
      requests:requests.map(row=>({id:row.id as string,status:row.status as string,
        proposed_name:row.proposed_name as string,
        proposed_handle:row.proposed_handle as string,
        created_at:row.created_at}))}
  }

  // B22: legal ownership candidates are NOT a grant, and never leave this
  // module without separately verified live native Seller/Member authority.
  
}
