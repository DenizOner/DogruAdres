/// <reference lib="es2022.intl" />
import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { Context } from "@medusajs/framework/types"
import {
  IdentitySessions,
  securitySql,
  isCurrentProtectedOwner,
  IdentityAccessDenied,
  type SecuritySql,
} from "./identity-session"
import { platformApprovedSellerIds } from "./legal-store-ownership"
import { ActorDelegation } from "./actor-delegation"
import { sendSmtpEmail } from "./smtp-client"
import type { FoundationAuditInput } from "./service"
import { DOGRUADRES_AUDIT_MODULE } from "./service"

export class StoreLifecycleOperations {
  constructor(
    private db: SecuritySql,
    private persistAuditEventsWithOutbox: (input: FoundationAuditInput[], sharedContext: Context) => Promise<unknown>,
    private sharedContext: Context
  ) {}

  private persistAuditEventsWithOutbox_(input: FoundationAuditInput[], sharedContext: Context) {
    return this.persistAuditEventsWithOutbox(input, sharedContext)
  }

  // B22 Owner temporary break. The Foundation pause record, not a mutable
  // native Seller closure date, is the authoritative sale-denial switch.
  // Native Seller lifecycle remains controlled by the platform. Mercur's
  // built-in closure fields are intentionally left untouched: they can also
  // be written from native vendor routes and do not guard checkout.
  private async ownerPauseRow_(db:SecuritySql,sellerId:string,lock=false){
    const rows=await db.execute(`select p.organization_id,p.seller_id,p.paused,
      p.version,p.request_id,
      exists(select 1 from da_audit_event e where e.id=p.source_audit_event_id
        and e.deleted_at is null and e.module='dogruadres-access'
        and e.organization_id=p.organization_id and e.target_id=p.seller_id
        and e.resource='store-owner-pause'
        and e.action=(case when p.paused then
          'organization.store_owner_paused' else
          'organization.store_owner_resumed' end)
        and e.new_values->>'request_id'=p.request_id
        and e.new_values->>'version'=p.version::text
        and e.new_values->>'paused'=p.paused::text
        and exists(select 1 from da_audit_outbox o where
          o.source_audit_event_id=e.id and o.source_module='dogruadres-access'
          and o.deleted_at is null)) as proof
      from da_store_owner_pause p where p.seller_id=? ${lock?'for update':''}`,
      [sellerId])
    if(rows.length>1||rows.some(row=>
      row.seller_id!==sellerId||row.proof!==true||
      !Number.isSafeInteger(Number(row.version))||Number(row.version)<1||
      typeof row.paused!=="boolean"||
      typeof row.organization_id!=="string"||
      !/^dasp_[a-f0-9]{32}$/.test(String(row.request_id))))
      throw new IdentityAccessDenied()
    return rows.length?rows[0]:null
  }

  /** #307 P2: one real Person-first lock shared by protected Owner writers.
   * Not an authorization grant: ownerPauseScope_ still checks live scope.
   * Separated only so pure clock-fixture tests can mock this narrow gateway,
   * without bypassing native session validation on any real HTTP request.
   */
  private async ownerPauseSessionPrelock_(db:SecuritySql,token:string){
    return new IdentitySessions(db).currentWithPersonLock(token,true,false,true)
  }

  private async ownerPauseScope_(db:SecuritySql,token:string,organizationId:string,sellerId:string,
    personFirst=false){
    const sessions=new IdentitySessions(db)
    // Closing-state GET later takes Person FOR SHARE. Acquire the compatible
    // shared Person row lock before session/epoch; audit FK KEY SHARE remains
    // permitted while the separate advisory-locked closing writer commits.
    // Other Seller write paths retain their original ordering.
    const actor=personFirst?
      await sessions.currentWithPersonLock(token,true,false,true):
      await sessions.current(token,true,false)
    if(!actor)return null
    const scope=await sessions.organizations(token,organizationId,false)
    if(!scope||scope.person_id!==actor.person_id||
       scope.organizations.length!==1||scope.organizations[0].role!=="owner"||
       !await isCurrentProtectedOwner(db,actor.person_id,organizationId))
      return null
    if(!(await platformApprovedSellerIds(db,organizationId)).includes(sellerId))return null
    const linked=await new ActorDelegation(db).binding(token,"member")
    if(!linked||linked.binding.person_id!==actor.person_id||
       linked.binding.revoked_at||!linked.binding.actor_id)return null
    const rows=await db.execute(`select s.status,s.approved_at from seller s
      join seller_member sm on sm.seller_id=s.id and sm.deleted_at is null
      join member m on m.id=sm.member_id and m.deleted_at is null
        and m.is_active=true
      where s.id=? and s.deleted_at is null and sm.member_id=?
      for share of s,sm,m`,[sellerId,linked.binding.actor_id])
    if(rows.length!==1||!rows[0].approved_at||
       !["open","suspended","terminated"].includes(rows[0].status))return null
    return {actor,store_status:rows[0].status as string}
  }

  async personalOwnerStorePauseState(token:string,organizationId:string,sellerId:string,
    context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)||
       !/^sel_[A-Za-z0-9_-]+$/.test(sellerId))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const authority=await this.ownerPauseScope_(db,token,organizationId,sellerId)
    if(!authority)return null
    const row=await this.ownerPauseRow_(db,sellerId)
    if(row&&row.organization_id!==organizationId)throw new IdentityAccessDenied()
    // Reuse the exact audited Foundation closing proof. Native Seller 'open'
    // does not mean sales are open after a stronger platform closure.
    const platformClosed=(await this.platformClosingRow_(db,sellerId))!==null
    return {organization_id:organizationId,seller_id:sellerId,
      paused:row?.paused===true,version:row?Number(row.version):0,
      store_status:authority.store_status,platform_closed:platformClosed}
  }

  async personalOwnerStorePauseChange(token:string,input:{
    organization_id:string;seller_id:string;action:"pause"|"resume";
    request_id:string;expected_version:number
  },context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !/^dasp_[a-f0-9]{32}$/.test(input.request_id)||
       !["pause","resume"].includes(input.action)||
       !Number.isSafeInteger(input.expected_version)||
       input.expected_version<0||input.expected_version>2147483646)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    // #307 P2: Person SHARE -> live session/security -> Seller advisory.
    // Preliminary identity is NOT Owner authority; ownerPauseScope_ rechecks
    // protected Owner, Organization, native Member/Seller and current origin
    // under the serialized Seller lock before any write.
    if(!await this.ownerPauseSessionPrelock_(db,token))
      return null
    // Same per-Seller lock serializes parallel pause, resume, read-modify-
    // write and the live native Seller row SHARE lock with platform updates.
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-owner-pause'),hashtext(?))",
      [input.seller_id])
    const scope=await this.ownerPauseScope_(db,token,input.organization_id,input.seller_id)
    if(!scope||scope.store_status!=="open")return null
    // Closing is stronger than a voluntary pause; a resume must never
    // appear to reopen Store sales while the Owner closing case is pending.
    if((await this.ownerClosingRow_(db,input.seller_id))?.state==="closing")
      return null
    if(await this.platformClosingRow_(db,input.seller_id))return null
    const existing=await this.ownerPauseRow_(db,input.seller_id,true)
    if(existing&&existing.organization_id!==input.organization_id)
      throw new IdentityAccessDenied()
    const paused=input.action==="pause",version=existing?Number(existing.version):0
    if(existing?.request_id===input.request_id){
      if(version!==input.expected_version+1||existing.paused!==paused)
        throw new IdentityAccessDenied()
      return {status:paused?"paused" as const:"resumed" as const,
        version,replayed:true}
    }
    if(version!==input.expected_version)return {status:"conflict" as const,version}
    if((existing?.paused===true)===paused)
      return {status:paused?"paused" as const:"resumed" as const,
        version,replayed:true}
    const next=version+1
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:scope.actor.person_id,actor_type:scope.actor.actor_type,
      actor_id:scope.actor.actor_id,role_context:"owner",
      organization_id:input.organization_id,
      action:paused?"organization.store_owner_paused":"organization.store_owner_resumed",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-owner-pause",
      target_id:input.seller_id,
      new_values:{request_id:input.request_id,version:next,paused},
      occurred_at:new Date()
    }],context)
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const changed=existing?await db.execute(`update da_store_owner_pause
      set paused=?,version=?,request_id=?,source_audit_event_id=?,
        updated_at=clock_timestamp()
      where seller_id=? and organization_id=? and version=?
      returning seller_id`,[paused,next,input.request_id,audit.id,
        input.seller_id,input.organization_id,version]):
      await db.execute(`insert into da_store_owner_pause
      (seller_id,organization_id,paused,version,request_id,source_audit_event_id)
      values (?,?,?,?,?,?) returning seller_id`,
        [input.seller_id,input.organization_id,paused,next,input.request_id,audit.id])
    if(changed.length!==1)throw new IdentityAccessDenied()
    return {status:paused?"paused" as const:"resumed" as const,version:next,
      replayed:false}
  }

  /** Internal sale/read gate, never a browser authorization grant. An
   * unknown or damaged audit lineage denies trading instead of bypassing it.
   * The checkout's final L rechecks this in its own single SQL snapshot.
   */
  async storeOwnerPauseAcceptingOrders(sellerIds:string[],
    context:Context={}):Promise<boolean>{
    if(!Array.isArray(sellerIds)||sellerIds.length>50||
       new Set(sellerIds).size!==sellerIds.length||
       sellerIds.some(id=>typeof id!=="string"||!/^sel_[A-Za-z0-9_-]+$/.test(id)))
      throw new IdentityAccessDenied()
    if(!sellerIds.length)return false
    const db=securitySql(context.transactionManager)
    for(const id of sellerIds){
      const row=await this.ownerPauseRow_(db,id)
      if(row&&row.paused!==false)return false
      const closing=await this.ownerClosingRow_(db,id)
      if(closing&&closing.state!=="withdrawn")return false
      if(await this.platformClosingRow_(db,id))return false
    }
    return true
  }


  /** Private, Foundation-owned Owner closing state; never infer closure from
   * Mercur's reversible native terminate status. Missing/broken audit linkage
   * fails closed instead of presenting the Store as safe to trade.
   */
  private async ownerClosingRow_(db:SecuritySql,sellerId:string,lock=false){
    const rows=await db.execute(`select c.organization_id,c.seller_id,c.state,
      c.version,c.request_id,c.started_at,c.due_at,c.source_audit_event_id,
      exists(select 1 from da_audit_event e
        join da_audit_outbox x on x.source_audit_event_id=e.id
          and x.source_module='dogruadres-access' and x.deleted_at is null
        where e.id=c.source_audit_event_id and e.deleted_at is null
          and e.module='dogruadres-access'
          and e.organization_id=c.organization_id and e.target_id=c.seller_id
          and e.resource='store-owner-closing'
          and e.action=(case when c.state='closing'
            then 'organization.store_owner_closing_started'
            else 'organization.store_owner_closing_withdrawn' end)
          and e.new_values->>'state'=c.state
          and e.new_values->>'request_id'=c.request_id
          and e.new_values->>'version'=c.version::text
          and (e.new_values->>'started_at')::timestamptz=c.started_at
          and (e.new_values->>'due_at')::timestamptz=c.due_at) as proof
      from da_store_owner_closing c where c.seller_id=? ${lock?'for update':''}`,
      [sellerId])
    if(rows.length>1||rows.some(row=>
       row.seller_id!==sellerId||row.proof!==true||
       !["closing","withdrawn"].includes(row.state)||
       !Number.isSafeInteger(Number(row.version))||Number(row.version)<1||
       !/^dasc_[a-f0-9]{32}$/.test(String(row.request_id))||
       !Number.isFinite(new Date(row.started_at).getTime())||
       !Number.isFinite(new Date(row.due_at).getTime())||
       new Date(row.due_at).getTime()-new Date(row.started_at).getTime()!==2592000000))
      throw new IdentityAccessDenied()
    return rows.length===1?rows[0]:null
  }

  async personalOwnerClosingState(token:string,organizationId:string,sellerId:string,
    context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)||
       !/^sel_[A-Za-z0-9_-]+$/.test(sellerId))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const scope=await this.ownerPauseScope_(db,token,organizationId,sellerId,true)
    if(!scope)return null
    const row=await this.ownerClosingRow_(db,sellerId)
    if(row&&row.organization_id!==organizationId)throw new IdentityAccessDenied()
    const clock=await db.execute("select clock_timestamp() as now_at")
    if(clock.length!==1)throw new IdentityAccessDenied()
    const now=new Date(clock[0].now_at)
    // Only the currently signed-in canonical Person's recipient record,
    // scoped to the LATEST canonical closing audit event, is visible. No
    // address, message ID, other Owner's attempts, or delivery claim leaks.
    let noticeStatus="not_applicable",noticeAttempts=0
    let smtpAccepted=false
    if(row){
      const own=await db.execute(`select n.id as receipt_id,
        d.attempts,d.last_result,d.accepted_at
        from da_notification_receipt n
        left join da_store_owner_closing_email d
          on d.audit_event_id=n.audit_event_id and d.person_id=n.person_id
        where n.audit_event_id=? and n.person_id=?
        limit 2`,[row.source_audit_event_id,scope.actor.person_id])
      if(own.length>1)throw new IdentityAccessDenied()
      if(own.length===1){
        if(own[0].last_result===null){
          noticeStatus="queued"
        }else{
          const status=String(own[0].last_result)
          const attempts=Number(own[0].attempts)
          if(!["pending","inflight","accepted","failed",
              "unverified_identity","uncertain","invalidated"].includes(status)||
             !Number.isSafeInteger(attempts)||attempts<0||attempts>4||
             (status==="accepted"&&own[0].accepted_at===null))
            throw new IdentityAccessDenied()
          noticeStatus=status
          noticeAttempts=attempts
          smtpAccepted=own[0].accepted_at!==null
        }
      }
    }
    // Hold the current protected Owner grant until the read transaction
    // commits; a concurrently committed revocation cannot return a private
    // per-recipient status after authorization disappears.
    const currentOwner=await db.execute(`select m.id
      from da_organization_membership m
      join da_person p on p.id=m.person_id
      where m.person_id=? and m.organization_id=?
        and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.revoked_at is null
        and m.deleted_at is null and p.disabled_at is null
        and p.deleted_at is null
      limit 2 for share of m,p`,[scope.actor.person_id,organizationId])
    if(currentOwner.length!==1)return null
    // Only an aggregate count of current protected Owners and canonical
    // in-account receipts. Do NOT expose another Owner's SMTP attempts,
    // Person ID, address or read status. This is informational, NEVER an
    // irreversible-finalization decision or mailbox-delivery proof.
    const noticeCoverage={protected_owners:0,personal_receipts:0,
      mailbox_delivery_verified:false}
    if(row){
      const coverage=await db.execute(`select
        count(distinct m.person_id)::int as protected_owners,
        count(distinct n.person_id)::int as personal_receipts
        from da_organization_membership m
        join da_person p on p.id=m.person_id and p.deleted_at is null
          and p.disabled_at is null
        left join da_notification_receipt n
          on n.audit_event_id=? and n.person_id=m.person_id
        where m.organization_id=? and m.role='owner'
          and m.protected_owner=true and m.status='active'
          and m.revoked_at is null and m.deleted_at is null`,
        [row.source_audit_event_id,organizationId])
      const owners=Number(coverage[0]?.protected_owners)
      const receipts=Number(coverage[0]?.personal_receipts)
      if(coverage.length!==1||!Number.isSafeInteger(owners)||
         owners<1||owners>100||!Number.isSafeInteger(receipts)||
         receipts<0||receipts>owners)throw new IdentityAccessDenied()
      noticeCoverage.protected_owners=owners
      noticeCoverage.personal_receipts=receipts
    }
    return {organization_id:organizationId,seller_id:sellerId,
      notification_coverage:noticeCoverage,
      email_notice:{status:noticeStatus,attempts:noticeAttempts,
        smtp_accepted:smtpAccepted,mailbox_delivery_verified:false},
      state:row?.state??"none",version:row?Number(row.version):0,
      started_at:row?new Date(row.started_at).toISOString():null,
      due_at:row?new Date(row.due_at).toISOString():null,
      can_withdraw:row?.state==="closing"&&now.getTime()<new Date(row.due_at).getTime(),
      // Read-only server-clock countdown; clients never control the deadline
      // or the authorization to withdraw.
      remaining_seconds:row?.state==="closing"?
        Math.max(0,Math.ceil((new Date(row.due_at).getTime()-now.getTime())/1000)):0,
      store_status:scope.store_status,
      // No irreversible transition while verified mandatory delivery is absent.
      permanent_finalization_enabled:false}
  }

  async personalOwnerClosingChange(token:string,input:{
    organization_id:string;seller_id:string;action:"start"|"withdraw";
    request_id:string;expected_version:number;consequences_acknowledged?:boolean
  },context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !/^dasc_[a-f0-9]{32}$/.test(input.request_id)||
       !["start","withdraw"].includes(input.action)||
       (input.action==="start"&&input.consequences_acknowledged!==true)||
       !Number.isSafeInteger(input.expected_version)||
       input.expected_version<0||input.expected_version>2147483646)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    // #307 P2: Person SHARE -> live session/security -> Seller advisory.
    // Preliminary identity is NOT Owner authority; ownerPauseScope_ rechecks
    // protected Owner, Organization, native Member/Seller and current origin
    // under the serialized Seller lock before any write.
    if(!await this.ownerPauseSessionPrelock_(db,token))
      return null
    // Reuse the existing per-Seller lock, without changing the native Seller.
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-owner-pause'),hashtext(?))",
      [input.seller_id])
    const scope=await this.ownerPauseScope_(db,token,input.organization_id,input.seller_id)
    if(!scope||scope.store_status==="terminated"||
       (input.action==="start"&&scope.store_status!=="open"))
      return null
    // A platform-initiated closure is a separate, stronger active process.
    // Owner cannot start a parallel clock or bypass its appeal/notice gate.
    if(input.action==="start"&&await this.platformClosingRow_(db,input.seller_id))
      return {status:"conflict" as const}
    const existing=await this.ownerClosingRow_(db,input.seller_id,true)
    if(existing&&existing.organization_id!==input.organization_id)
      throw new IdentityAccessDenied()
    const version=existing?Number(existing.version):0
    const state=input.action==="start"?"closing":"withdrawn"
    if(existing?.request_id===input.request_id){
      if(version!==input.expected_version+1||existing.state!==state)
        throw new IdentityAccessDenied()
      return {status:state,version,replayed:true,
        due_at:new Date(existing.due_at).toISOString()}
    }
    if(version!==input.expected_version||
       (input.action==="start"&&existing?.state==="closing")||
       (input.action==="withdraw"&&existing?.state!=="closing"))
      return {status:"conflict" as const,version}
    const history=await db.execute(`select id from da_audit_event
      where module='dogruadres-access' and resource='store-owner-closing'
        and target_id=? and new_values->>'request_id'=? and deleted_at is null limit 2`,
      [input.seller_id,input.request_id])
    if(history.length)throw new IdentityAccessDenied()
    const clock=await db.execute("select clock_timestamp() as now_at")
    if(clock.length!==1)throw new IdentityAccessDenied()
    const now=new Date(clock[0].now_at)
    if(!Number.isFinite(now.getTime()))throw new IdentityAccessDenied()
    const start=input.action==="start"?now:new Date(existing.started_at)
    const due=input.action==="start"?new Date(now.getTime()+2592000000):
      new Date(existing.due_at)
    if(input.action==="withdraw"&&now.getTime()>=due.getTime())
      return {status:"conflict" as const,version}
    const next=version+1
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:scope.actor.person_id,actor_type:scope.actor.actor_type,
      actor_id:scope.actor.actor_id,role_context:"owner",
      organization_id:input.organization_id,
      action:input.action==="start"?
        "organization.store_owner_closing_started":
        "organization.store_owner_closing_withdrawn",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-owner-closing",
      target_id:input.seller_id,
      new_values:{request_id:input.request_id,version:next,state,
        started_at:start.toISOString(),due_at:due.toISOString()},
      occurred_at:now
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const changed=existing?await db.execute(`update da_store_owner_closing
      set state=?,version=?,request_id=?,source_audit_event_id=?,
        started_at=?,due_at=?,updated_at=clock_timestamp()
      where seller_id=? and organization_id=? and version=?
      returning seller_id`,[state,next,input.request_id,audit.id,start.toISOString(),
        due.toISOString(),input.seller_id,input.organization_id,version]):
      await db.execute(`insert into da_store_owner_closing
        (seller_id,organization_id,state,version,request_id,
         source_audit_event_id,started_at,due_at)
        values (?,?,?,?,?,?,?,?) returning seller_id`,
        [input.seller_id,input.organization_id,state,next,input.request_id,
         audit.id,start.toISOString(),due.toISOString()])
    if(changed.length!==1)throw new IdentityAccessDenied()
    // Personal security receipts are durable in the SAME transaction for ALL
    // currently protected Owners. SMTP delivery is not claimed by this path.
    await db.execute(`insert into da_notification_receipt(id,person_id,audit_event_id)
      select 'danot_'||gen_random_uuid()::text,m.person_id,?
      from da_organization_membership m join da_person p on p.id=m.person_id
      where m.organization_id=? and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.deleted_at is null
        and p.disabled_at is null and p.deleted_at is null
      on conflict(audit_event_id,person_id) do nothing`,
      [audit.id,input.organization_id])
    return {status:state,version:next,replayed:false,due_at:due.toISOString()}
  }


  /**
   * B22 platform-initiated closure, phase 1. No irreversible termination or
   * deadline until independently verified mandatory security-email delivery.
   * The existing Seller/Order/Store IDs and native Mercur lifecycle stay intact.
   */
  private async platformClosingRow_(db:SecuritySql,sellerId:string,lock=false){
    const rows=await db.execute(`select c.*,
      exists(select 1 from da_audit_event e
        join da_audit_outbox x on x.source_audit_event_id=e.id
          and x.source_module='dogruadres-access' and x.deleted_at is null
        where e.id=c.source_audit_event_id and e.deleted_at is null
          and e.module='dogruadres-access' and e.role_context='platform_staff'
          and e.resource='store-platform-closing'
          and e.action='organization.store_platform_closing_started'
          and e.organization_id=c.organization_id and e.target_id=c.seller_id
          and e.new_values->>'request_id'=c.request_id
          and e.new_values->>'state'='notification_unverified'
          and e.new_values->>'reason_sha256'=
            encode(sha256(convert_to(c.reason,'UTF8')),'hex')) as start_proof,
      (c.appeal_audit_event_id is null or exists(
        select 1 from da_audit_event a
        join da_audit_outbox x on x.source_audit_event_id=a.id
          and x.source_module='dogruadres-access' and x.deleted_at is null
        where a.id=c.appeal_audit_event_id and a.deleted_at is null
          and a.module='dogruadres-access' and a.role_context='owner'
          and a.resource='store-platform-closing'
          and a.action='organization.store_platform_closing_appealed'
          and a.organization_id=c.organization_id and a.target_id=c.seller_id
          and a.new_values->>'request_id'=c.appeal_request_id
          and a.new_values->>'appeal_reason_sha256'=
            encode(sha256(convert_to(c.appeal_reason,'UTF8')),'hex')
      )) as appeal_proof,
      (c.final_review_audit_event_id is null or exists (
        select 1 from da_audit_event a
        join da_audit_outbox x on x.source_audit_event_id=a.id
          and x.source_module='dogruadres-access' and x.deleted_at is null
        where a.id=c.final_review_audit_event_id and a.deleted_at is null
          and a.module='dogruadres-access' and a.role_context='owner'
          and a.actor_person_id=c.final_review_requested_by_person_id
          and a.resource='store-platform-closing'
          and a.action='organization.store_platform_closing_final_review_requested'
          and a.organization_id=c.organization_id and a.target_id=c.seller_id
          and a.new_values->>'request_id'=c.final_review_request_id
          and a.new_values->>'stage'='second_review'
          and a.new_values->>'reason_sha256'=
            encode(sha256(convert_to(c.final_review_reason,'UTF8')),'hex')
      )) as final_review_proof,
      (c.review_decision_audit_event_id is null or exists (
        select 1 from da_audit_event a
        join da_audit_outbox x on x.source_audit_event_id=a.id
          and x.source_module='dogruadres-access' and x.deleted_at is null
        where a.id=c.review_decision_audit_event_id and a.deleted_at is null
          and a.module='dogruadres-access' and a.role_context='platform_staff'
          and a.actor_person_id=c.review_decided_by_person_id
          and a.resource='store-platform-closing'
          and a.action='organization.store_platform_closing_review_decided'
          and a.organization_id=c.organization_id and a.target_id=c.seller_id
          and a.new_values->>'request_id'=c.review_decision_request_id
          and a.new_values->>'source_request_id'=c.review_decision_source_request_id
          and a.new_values->>'decision'=c.review_decision
          and a.new_values->>'reason_sha256'=
            encode(sha256(convert_to(c.review_decision_reason,'UTF8')),'hex')
      )) as review_decision_proof,
      (c.deadline_started_at is null or exists (
        select 1 from da_audit_event e
        join da_audit_outbox x on x.source_audit_event_id=e.id
          and x.source_module='dogruadres-access' and x.deleted_at is null
        where e.id=c.deadline_audit_event_id and e.deleted_at is null
          and e.module='dogruadres-access' and e.organization_id=c.organization_id
          and e.target_id=c.seller_id and e.resource='store-platform-closing'
          and e.action='organization.store_platform_closing_deadline_started'
          and e.role_context=(case when c.deadline_basis='owner_delivery'
            then 'owner' else 'platform_automation' end)
          and e.new_values->>'basis'=c.deadline_basis
          and (e.new_values->>'deadline_started_at')::timestamptz=c.deadline_started_at
      )) as deadline_proof
      from da_store_platform_closing c where c.seller_id=?
      ${lock?'for update of c':''}`,[sellerId])
    if(rows.length>1||rows.some(row=>
      row.seller_id!==sellerId||row.start_proof!==true||
      row.appeal_proof!==true||row.deadline_proof!==true||
      row.final_review_proof!==true||row.review_decision_proof!==true||
      (row.review_decision_request_id===null?
        row.review_decision!==null||row.review_decision_reason!==null||
        row.review_decision_source_request_id!==null||
        row.review_decision_audit_event_id!==null||
        row.review_decided_by_person_id!==null||row.review_decided_at!==null:
        !/^dasdr_[a-f0-9]{32}$/.test(String(row.review_decision_request_id))||
        !["accepted","rejected"].includes(row.review_decision)||
        typeof row.review_decision_reason!=="string"||
        row.review_decision_reason.length<10||row.review_decision_reason.length>500||
        row.review_decision_source_request_id!==
          (row.appeal_request_id??row.final_review_request_id)||
        !Number.isFinite(new Date(row.review_decided_at).getTime()))||
      (row.final_review_request_id===null?
        row.final_review_reason!==null||
        row.final_review_audit_event_id!==null||
        row.final_review_requested_by_person_id!==null||
        row.final_review_requested_at!==null:
        !/^dasfr_[a-f0-9]{32}$/.test(String(row.final_review_request_id))||
        typeof row.final_review_reason!=="string"||
        row.final_review_reason.length<10||
        row.final_review_reason.length>500||
        !/^daprs_[A-Za-z0-9_-]+$/.test(String(row.final_review_requested_by_person_id))||
        !Number.isFinite(new Date(row.final_review_requested_at).getTime())||
        row.state!=="notification_unverified")||
      !["notification_unverified","appealed"].includes(row.state)||
      !/^dascp_[a-f0-9]{32}$/.test(String(row.request_id))||
      !Number.isFinite(new Date(row.started_at).getTime())||
      (row.state==="notification_unverified"?
        Number(row.version)!==1||row.appeal_audit_event_id!==null:
        Number(row.version)!==2||
        !/^dapa_[a-f0-9]{32}$/.test(String(row.appeal_request_id))||
        !Number.isFinite(new Date(row.appealed_at).getTime()))))
      throw new IdentityAccessDenied()
    return rows.length===1?rows[0]:null
  }

  /** Dedicated platform task; store.approve MUST NOT imply closing power. */
  async personalReviewablePlatformStoreClosings(token:string,page=0,
    context:Context={},
    target?:{organization_id:string;seller_id:string}){
    if(!Number.isSafeInteger(page)||page<0||page>1000)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.closing.manage","platform")
    if(!staff)return null
    // Both current audited Store Origins are valid: a new application or a
    // historically approved association. Never infer ownership from Seller
    // status alone; require the unrevoked Origin and canonical audit/outbox.
    const rows=await db.execute(`select o.organization_id,o.seller_id,
      d.name organization_name,s.name store_name,s.status store_status
      from da_organization_seller_ownership o
      join da_organization d on d.id=o.organization_id
        and d.status='active' and d.deleted_at is null
      join da_audit_event e on e.id=o.verification_audit_event_id
        and e.deleted_at is null and e.module='dogruadres-access'
        and e.organization_id=o.organization_id and e.target_id=o.seller_id
        and (
          (e.action='organization.store_application_created'
           and e.resource='store-application'
           and exists(select 1 from da_store_application a
             where a.id=(e.new_values->>'application_id')
               and a.organization_id=o.organization_id
               and a.seller_id=o.seller_id and a.status='created'
               and a.person_id=e.actor_person_id))
          or (e.action='organization.store_association_approved'
              and e.resource='store-association')
        )
      join seller s on s.id=o.seller_id and s.deleted_at is null
        and s.approved_at is not null and s.status in ('open','suspended')
      where o.revoked_at is null and o.verified_at is not null
        and exists(select 1 from da_audit_outbox x
          where x.source_audit_event_id=e.id and x.source_module='dogruadres-access'
            and x.deleted_at is null)
        ${target?'and o.organization_id=? and o.seller_id=?':''}
        and not exists(select 1 from da_store_owner_closing c
          where c.seller_id=s.id and c.state='closing')
      order by o.verified_at desc,o.id desc
      limit ${target?2:31} offset ${target?0:page*30}`,
      target?[target.organization_id,target.seller_id]:[])
    if(!Array.isArray(rows)||rows.length>(target?1:31)||
       rows.some(x=>!/^sel_[A-Za-z0-9_-]+$/.test(x.seller_id)||
         !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(x.organization_id)))
      throw new IdentityAccessDenied()
    return (target?rows:rows.slice(0,30)).map(x=>({
      organization_id:x.organization_id as string,seller_id:x.seller_id as string,
      organization_name:x.organization_name as string,
      store_name:x.store_name as string,store_status:x.store_status as string
    }))
  }

  async personalStartPlatformStoreClosing(token:string,input:{
    organization_id:string;seller_id:string;request_id:string;reason:string
  },context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !/^dascp_[a-f0-9]{32}$/.test(input.request_id)||
       typeof input.reason!=="string"||input.reason.trim()!==input.reason||
       input.reason.length<10||input.reason.length>500)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager),sessions=new IdentitySessions(db)
    const staff=await sessions.staff(token,"store.closing.manage","platform")
    if(!staff)return null
    const grant=await db.execute(`select id from da_platform_staff_grant
      where id=? and person_id=? and task='store.closing.manage'
        and resource='platform' and revoked_at is null
        and (expires_at is null or expires_at>clock_timestamp())
      for share`,[staff.grant_id,staff.person_id])
    if(grant.length!==1)return null
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-owner-pause'),hashtext(?))",
      [input.seller_id])
    const targets=await this.personalReviewablePlatformStoreClosings(
      token,0,context,{organization_id:input.organization_id,seller_id:input.seller_id})
    if(!targets||targets.length!==1)return null
    const current=await this.platformClosingRow_(db,input.seller_id,true)
    if(current){
      if(current.organization_id!==input.organization_id)
        throw new IdentityAccessDenied()
      if(current.request_id===input.request_id&&current.reason===input.reason)
        return {status:current.state,version:Number(current.version),replayed:true}
      return {status:"conflict" as const}
    }
    const reasonSha=createHash("sha256").update(input.reason).digest("hex")
    const clock=await db.execute("select clock_timestamp() as now_at")
    if(clock.length!==1)throw new IdentityAccessDenied()
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:staff.person_id,actor_type:staff.actor_type,
      actor_id:staff.actor_id,role_context:"platform_staff",
      organization_id:input.organization_id,
      action:"organization.store_platform_closing_started",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-platform-closing",
      target_id:input.seller_id,
      new_values:{request_id:input.request_id,
        state:"notification_unverified",reason_sha256:reasonSha},
      occurred_at:new Date(clock[0].now_at)
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const inserted=await db.execute(`insert into da_store_platform_closing
      (seller_id,organization_id,state,version,request_id,reason,
       source_audit_event_id,started_at)
      values (?,?,'notification_unverified',1,?,?,?,?) returning seller_id`,
      [input.seller_id,input.organization_id,input.request_id,input.reason,
       audit.id,new Date(clock[0].now_at).toISOString()])
    if(inserted.length!==1)throw new IdentityAccessDenied()
    await db.execute(`insert into da_notification_receipt(id,person_id,audit_event_id)
      select 'danot_'||gen_random_uuid()::text,m.person_id,?
      from da_organization_membership m join da_person p on p.id=m.person_id
      where m.organization_id=? and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.revoked_at is null and m.deleted_at is null
        and p.disabled_at is null and p.deleted_at is null
      on conflict (audit_event_id,person_id) do nothing`,
      [audit.id,input.organization_id])
    // Durable first-attempt queue is born with the sale-blocking decision.
    // One per current protected Owner; no e-mail is sent inside the transaction.
    await db.execute(`insert into da_store_platform_closing_email
      (seller_id,person_id,next_attempt_at)
      select ?,m.person_id,?
      from da_organization_membership m join da_person p on p.id=m.person_id
      where m.organization_id=? and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.revoked_at is null and m.deleted_at is null
        and p.disabled_at is null and p.deleted_at is null
      on conflict (seller_id,person_id) do nothing`,
      [input.seller_id,new Date(clock[0].now_at).toISOString(),input.organization_id])
    return {status:"notification_unverified" as const,version:1,replayed:false}
  }


  /**
   * Scheduled B22 fallback. Admin notification and 10+20 clock are one
   * atomic Foundation operation with a canonical audit/outbox. An SMTP
   * acceptance or expired lease NEVER counts as delivery proof. The initial
   * authorized Staff is the audit attribution; the deadline is explicitly
   * marked as platform automation, not a new Staff decision.
   */
  async settlePlatformClosingAdminFallback(context:Context={}){
    const db=securitySql(context.transactionManager)
    const candidates=await db.execute(`select c.seller_id,c.organization_id,
      c.source_audit_event_id
      from da_store_platform_closing c
      where c.deadline_started_at is null
        and c.started_at<=clock_timestamp()-interval '72 hours'
        and exists (
          select 1 from da_organization_membership m
          join da_person p on p.id=m.person_id and p.deleted_at is null
            and p.disabled_at is null
          where m.organization_id=c.organization_id and m.role='owner'
            and m.protected_owner=true and m.status='active'
            and m.revoked_at is null and m.deleted_at is null
        )
        and not exists (
          select 1 from da_store_platform_closing_email d
          join da_organization_membership m on m.person_id=d.person_id
            and m.organization_id=c.organization_id and m.status='active'
            and m.role='owner' and m.protected_owner=true
            and m.revoked_at is null and m.deleted_at is null
          join da_person p on p.id=m.person_id and p.deleted_at is null
            and p.disabled_at is null
          where d.seller_id=c.seller_id
            -- Only recipients of the original closure may hold its 72h
            -- fallback clock. Later Owners keep their own separate notice.
            and d.late_notice_id is null and (
            d.attempts<4 or d.lease_until is not null
            or d.last_result='inflight' or d.delivered_at is not null)
        )
        and not exists (
          select 1 from da_organization_membership m
          join da_person p on p.id=m.person_id
            and p.disabled_at is null and p.deleted_at is null
          where m.organization_id=c.organization_id and m.status='active'
            and m.role='owner' and m.protected_owner=true
            and m.revoked_at is null and m.deleted_at is null
            and exists(select 1 from da_notification_receipt n
              where n.audit_event_id=c.source_audit_event_id
                and n.person_id=m.person_id)
            and not exists(select 1 from da_store_platform_closing_email d
              where d.seller_id=c.seller_id and d.person_id=m.person_id
                and d.late_notice_id is null)
        )
      order by c.started_at,c.seller_id
      for update of c skip locked limit 5`)
    let started=0
    for(const candidate of candidates){
      const sellerId=String(candidate.seller_id)
      const organizationId=String(candidate.organization_id)
      const closure=await this.platformClosingRow_(db,sellerId,true)
      if(!closure||closure.organization_id!==organizationId||
         closure.deadline_started_at!==null||
         closure.source_audit_event_id!==candidate.source_audit_event_id)
        throw new IdentityAccessDenied()
      const recipients=await db.execute(`select distinct g.person_id
        from da_platform_staff_grant g
        join da_person p on p.id=g.person_id and p.disabled_at is null
          and p.deleted_at is null
        where g.task='store.closing.manage' and g.resource='platform'
          and g.revoked_at is null
          and (g.expires_at is null or g.expires_at>clock_timestamp())
        limit 101`)
      if(!recipients.length)continue
      if(recipients.length>100)throw new IdentityAccessDenied()
      await db.execute(`insert into da_store_platform_closing_admin_notice
        (id,seller_id,person_id)
        select 'danal_'||replace(gen_random_uuid()::text,'-',''),?,g.person_id
        from da_platform_staff_grant g
        join da_person p on p.id=g.person_id and p.disabled_at is null
          and p.deleted_at is null
        where g.task='store.closing.manage' and g.resource='platform'
          and g.revoked_at is null
          and (g.expires_at is null or g.expires_at>clock_timestamp())
        on conflict (seller_id,person_id) do nothing`,[sellerId])
      const noticed=await db.execute(`select count(*)::int as n
        from da_store_platform_closing_admin_notice n
        join da_platform_staff_grant g on g.person_id=n.person_id
          and g.task='store.closing.manage' and g.resource='platform'
          and g.revoked_at is null
          and (g.expires_at is null or g.expires_at>clock_timestamp())
        join da_person p on p.id=g.person_id and p.disabled_at is null
          and p.deleted_at is null where n.seller_id=?`,[sellerId])
      if(!Number(noticed[0]?.n))throw new IdentityAccessDenied()
      const actor=await db.execute(`select e.actor_person_id,e.actor_type,e.actor_id
        from da_audit_event e where e.id=? and e.module='dogruadres-access'
          and e.action='organization.store_platform_closing_started'
          and e.resource='store-platform-closing' and e.role_context='platform_staff'
          and e.organization_id=? and e.target_id=? and e.deleted_at is null
        limit 2`,[closure.source_audit_event_id,organizationId,sellerId])
      if(actor.length!==1)throw new IdentityAccessDenied()
      const clock=await db.execute("select clock_timestamp() as at")
      if(clock.length!==1)throw new IdentityAccessDenied()
      const at=new Date(clock[0].at).toISOString()
      const [deadlineAudit]=await this.persistAuditEventsWithOutbox_([{
        actor_person_id:actor[0].actor_person_id,
        actor_type:actor[0].actor_type,actor_id:actor[0].actor_id,
        role_context:"platform_automation",organization_id:organizationId,
        action:"organization.store_platform_closing_deadline_started",
        module:DOGRUADRES_AUDIT_MODULE,resource:"store-platform-closing",
        target_id:sellerId,
        new_values:{basis:"admin_alert",deadline_started_at:at,
          evidence:"four_scheduled_attempts_without_verified_delivery"},
        occurred_at:new Date(at)
      }],context)
      if(!deadlineAudit?.id)throw new IdentityAccessDenied()
      await (context.transactionManager as {flush():Promise<void>}).flush()
      const updated=await db.execute(`update da_store_platform_closing
        set deadline_started_at=?::timestamptz,deadline_basis='admin_alert',
          admin_alert_at=?::timestamptz,deadline_audit_event_id=?,
          updated_at=clock_timestamp()
        where seller_id=? and organization_id=? and deadline_started_at is null
        returning seller_id`,[at,at,deadlineAudit.id,sellerId,organizationId])
      if(updated.length!==1)throw new IdentityAccessDenied()
      started++
    }
    return started
  }

  /**
   * B22 mandatory Owner mail preflight (read only).
   * Resolves current protected Owner Persons against the canonical initial
   * closure audit event and its private receipts, not a caller-supplied email.
   * Actual SMTP dispatch and mailbox delivery are NOT authorized by this
   * check and may never start the 10+20-day clock.
   */
  async personalPlatformStoreClosingEmailAudience(token:string,organizationId:string,
    sellerId:string,context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)||
       !/^sel_[A-Za-z0-9_-]+$/.test(sellerId))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.closing.manage","platform")
    if(!staff)return null
    const grant=await db.execute(`select id from da_platform_staff_grant
      where id=? and person_id=? and task='store.closing.manage'
        and resource='platform' and revoked_at is null
        and (expires_at is null or expires_at>clock_timestamp())
      for share`,[staff.grant_id,staff.person_id])
    if(grant.length!==1)return null
    const closure=await this.platformClosingRow_(db,sellerId)
    if(!closure||closure.organization_id!==organizationId)return null
    const owners=await db.execute(`select m.person_id,n.id as receipt_id,
      case when map.person_id is not null then b.auth_identity_id end as auth_identity_id,
      case when map.person_id is not null then b.actor_type end as actor_type,
      case when map.person_id is not null then b.actor_id end as actor_id
      from da_organization_membership m
      join da_person p on p.id=m.person_id and p.disabled_at is null
        and p.deleted_at is null
      left join da_notification_receipt n on n.person_id=m.person_id
        and n.audit_event_id=?
      left join da_login_binding b on b.person_id=m.person_id
        and b.revoked_at is null and b.verified_at is not null
      left join da_actor_mapping map on map.person_id=m.person_id
        and map.actor_type=b.actor_type and map.actor_id=b.actor_id
        and map.deleted_at is null
      where m.organization_id=? and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.revoked_at is null
        and m.deleted_at is null order by m.person_id`,
      [closure.source_audit_event_id,organizationId])
    if(!Array.isArray(owners)||owners.length>100||
       owners.some(row=>typeof row.person_id!=="string"||
         (row.receipt_id!==null&&typeof row.receipt_id!=="string")))
      throw new IdentityAccessDenied()
    return owners.map(row=>({
      person_id:row.person_id as string,
      receipt_id:row.receipt_id as string|null,
      actor_type:row.actor_type as string|null,
      actor_id:row.actor_id as string|null,
      auth_identity_id:row.auth_identity_id as string|null
    }))
  }

  /** Scoped staff-only progress. The output is status metadata only; email,
   * Person ID, private reason and native auth IDs stay server-side. */
  async personalPlatformStoreClosingEmailProgress(token:string,organizationId:string,
    sellerId:string,context:Context={}){
    const audience=await this.personalPlatformStoreClosingEmailAudience(
      token,organizationId,sellerId,context)
    if(!audience)return null
    const db=securitySql(context.transactionManager)
    const closure=await this.platformClosingRow_(db,sellerId)
    if(!closure||closure.organization_id!==organizationId)return null
    const rows=await db.execute(`select d.person_id,d.attempts,d.last_result,
      d.message_id,d.last_attempt_at,d.next_attempt_at,d.delivered_at,
      d.delivery_source,d.email_link_visited_at,d.account_viewed_at
      from da_store_platform_closing_email d
      where d.seller_id=? order by d.person_id`,[sellerId])
    const byPerson=new Map(rows.map(row=>[row.person_id as string,row]))
    const unique=[...new Set(audience.map(row=>row.person_id))].sort()
    const owners=unique.map((personId,index)=>{
      const row=byPerson.get(personId)
      return {
        label:`Owner ${index+1}`,attempts:row?Number(row.attempts):0,
        // A proven SMTP 250 is independent from later link delivery.
        // The message ID itself remains private to the server.
        smtp_accepted:typeof row?.message_id==="string"&&row.message_id.length>0,
        status:row?.delivered_at?'delivered':row?.last_result??'pending',
        last_attempt_at:row?.last_attempt_at?
          new Date(row.last_attempt_at).toISOString():null,
        next_attempt_at:row&&Number(row.attempts)<4&& !row.delivered_at?
          new Date(row.next_attempt_at).toISOString():null,
        delivered_at:row?.delivered_at?
          new Date(row.delivered_at).toISOString():null,
        link_visited_at:row?.email_link_visited_at?
          new Date(row.email_link_visited_at).toISOString():null,
        account_viewed_at:row?.account_viewed_at?
          new Date(row.account_viewed_at).toISOString():null
      }
    })
    const started=closure.deadline_started_at?
      new Date(closure.deadline_started_at).toISOString():null
    // Advisory-only closure blockers for the authorized Staff view. The
    // canonical PostgreSQL clock controls the appeal-window calculation;
    // none of these flags authorizes a native Seller termination or name
    // release. Finance/legal verification is not integrated and must be
    // represented as unknown rather than inferred from absence of orders.
    const ticks=await db.execute("select clock_timestamp() as now_at")
    if(ticks.length!==1)throw new IdentityAccessDenied()
    const now=new Date(ticks[0].now_at).getTime()
    if(!Number.isFinite(now))throw new IdentityAccessDenied()
    const appealWindowElapsed=started!==null&&
      now>=new Date(started).getTime()+2592000000
    const appealReviewPending=closure.review_decision===null&&
      (closure.appeal_request_id!==null||
       closure.final_review_request_id!==null)
    return {
      owners,deadline_started_at:started,
      terminal_preflight:{
        appeal_window_elapsed:appealWindowElapsed,
        appeal_review_pending:appealReviewPending,
        appeal_accepted:closure.review_decision==="accepted",
        notification_exception_review_required:
          closure.deadline_basis==="admin_alert",
        financial_legal_clearance_verified:false,
        permanent_finalization_enabled:false
      },
      deadline_basis:closure.deadline_basis??null,
      admin_alert_at:closure.admin_alert_at?
        new Date(closure.admin_alert_at).toISOString():null,
      // No mailbox verification is inferred from SMTP acceptance.
      delivery_verified_count:owners.filter(o=>o.delivered_at!==null).length,
      delivered_evidence_available:owners.some(o=>o.delivered_at!==null)
    }
  }

  /** A deliberate authenticated Owner visit to a link from their mail.
   * Link fetches and scanner GETs must NEVER mutate the clock. A SHA-256
   * digest and exact current protected-Owner authority are both required. */
  async personalPlatformStoreClosingEmailLinkVisit(
    token:string,linkToken:string,context:Context={}
  ){
    if(!/^[a-f0-9]{64}$/.test(linkToken))throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const current=await new IdentitySessions(db).current(token,true,false)
    if(!current)return null
    const digest=createHash("sha256").update(linkToken).digest("hex")
    const choices=await db.execute(`select l.seller_id,l.person_id,c.organization_id
      from da_store_platform_closing_email_link l
      join da_store_platform_closing c on c.seller_id=l.seller_id
      where l.token_sha256=? and l.issued_at>
        clock_timestamp()-interval '30 days'
      limit 2`,[digest])
    if(choices.length!==1||choices[0].person_id!==current.person_id)
      return null
    const {seller_id:sellerId,organization_id:orgId}=choices[0]
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-owner-pause'),hashtext(?))",
      [sellerId])
    const owner=await this.ownerPauseScope_(db,token,orgId,sellerId)
    if(!owner||owner.actor.person_id!==current.person_id)return null
    const locks=await db.execute(`select l.seller_id,l.person_id,l.issued_at,
      d.delivered_at,c.deadline_started_at,c.reason
      from da_store_platform_closing_email_link l
      join da_store_platform_closing_email d on d.seller_id=l.seller_id
        and d.person_id=l.person_id
      join da_store_platform_closing c on c.seller_id=l.seller_id
        and c.organization_id=?
      where l.token_sha256=? and l.person_id=?
        and l.issued_at>clock_timestamp()-interval '30 days'
      for update of l,d,c`,[orgId,digest,current.person_id])
    if(locks.length!==1||locks[0].seller_id!==sellerId)return null
    // Single server-clock event; a repeated click never resets any timestamp.
    const tick=await db.execute("select clock_timestamp() as at")
    if(tick.length!==1)throw new IdentityAccessDenied()
    const at=new Date(tick[0].at).toISOString()
    await db.execute(`update da_store_platform_closing_email_link
      set visited_at=coalesce(visited_at,?::timestamptz)
      where token_sha256=? and person_id=?`,[at,digest,current.person_id])
    await db.execute(`update da_store_platform_closing_email
      set delivered_at=coalesce(delivered_at,?::timestamptz),
        delivery_source='authenticated_owner',
        email_link_visited_at=coalesce(email_link_visited_at,?::timestamptz),
        account_viewed_at=coalesce(account_viewed_at,?::timestamptz),
        last_result='delivered',claim_id=null,lease_until=null,
        updated_at=clock_timestamp()
      where seller_id=? and person_id=?`,
      [at,at,at,sellerId,current.person_id])
    // Audit and clock share the same physical Foundation transaction. A
    // repeated Owner visit must not create a second deadline audit/outbox.
    if(locks[0].deadline_started_at===null){
      const [deadlineAudit]=await this.persistAuditEventsWithOutbox_([{
        actor_person_id:owner.actor.person_id,
        actor_type:owner.actor.actor_type,actor_id:owner.actor.actor_id,
        role_context:"owner",organization_id:orgId,
        action:"organization.store_platform_closing_deadline_started",
        module:DOGRUADRES_AUDIT_MODULE,
        resource:"store-platform-closing",target_id:sellerId,
        new_values:{basis:"owner_delivery",deadline_started_at:at,
          evidence:"authenticated_owner_link"},
        occurred_at:new Date(at)
      }],context)
      if(!deadlineAudit?.id)throw new IdentityAccessDenied()
      await (context.transactionManager as {flush():Promise<void>}).flush()
      const started=await db.execute(`update da_store_platform_closing
        set deadline_started_at=?::timestamptz,deadline_basis='owner_delivery',
          deadline_audit_event_id=?,updated_at=clock_timestamp()
        where seller_id=? and organization_id=? and deadline_started_at is null
        returning seller_id`,[at,deadlineAudit.id,sellerId,orgId])
      if(started.length!==1)throw new IdentityAccessDenied()
    }
    return {viewed:true,reason:String(locks[0].reason),
      deadline_started:true}
  }

  async personalPlatformStoreClosingState(token:string,organizationId:string,
    sellerId:string,context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)||
       !/^sel_[A-Za-z0-9_-]+$/.test(sellerId))
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const owner=await this.ownerPauseScope_(db,token,organizationId,sellerId)
    if(!owner)return null
    const row=await this.platformClosingRow_(db,sellerId)
    if(row&&row.organization_id!==organizationId)throw new IdentityAccessDenied()
    const windows=await db.execute(`select
      (x.started_at is null or x.now_at <
        x.started_at + interval '240 hours') as first_window,
      (x.started_at is not null and x.now_at >=
        x.started_at + interval '240 hours' and x.now_at <
        x.started_at + interval '720 hours') as second_window
      from (select ?::timestamptz as started_at,
        clock_timestamp() as now_at) x`,[row?.deadline_started_at??null])
    if(windows.length!==1||
       typeof windows[0].first_window!=="boolean"||
       typeof windows[0].second_window!=="boolean")
      throw new IdentityAccessDenied()
    return {organization_id:organizationId,seller_id:sellerId,
      state:row?.state??"none",version:row?Number(row.version):0,
      first_appeal_open:row?.state==="notification_unverified"&&
        windows[0].first_window&&row?.final_review_request_id==null,
      final_review_open:row?.state==="notification_unverified"&&
        windows[0].second_window&&row?.final_review_request_id==null,
      final_review_requested:row?.final_review_request_id!=null,
      final_review_requested_at:row?.final_review_requested_at?
        new Date(row.final_review_requested_at).toISOString():null,
      final_review_reason:row?.final_review_reason??null,
      review_decision:row?.review_decision??null,
      review_decision_reason:row?.review_decision_reason??null,
      review_decided_at:row?.review_decided_at?
        new Date(row.review_decided_at).toISOString():null,
      reason:row?.reason??null,started_at:row?
        new Date(row.started_at).toISOString():null,
      appeal_reason:row?.appeal_reason??null,
      // Owner sees the real server-owned 10+20 clock, never a browser clock
      // used as authority. Sale denial was effective at initial Staff decision.
      mandatory_email_verified:row?.deadline_basis==="owner_delivery",
      deadline_started:!!row?.deadline_started_at,
      deadline_started_at:row?.deadline_started_at?
        new Date(row.deadline_started_at).toISOString():null,
      first_appeal_until:row?.deadline_started_at?
        new Date(new Date(row.deadline_started_at).getTime()+864000000).toISOString():null,
      final_review_until:row?.deadline_started_at?
        new Date(new Date(row.deadline_started_at).getTime()+2592000000).toISOString():null,
      deadline_basis:row?.deadline_basis??null,
      permanent_finalization_enabled:false}
  }

  async personalAppealPlatformStoreClosing(token:string,input:{
    organization_id:string;seller_id:string;request_id:string;
    expected_version:number;reason:string
  },context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !/^dapa_[a-f0-9]{32}$/.test(input.request_id)||
       input.expected_version!==1||
       typeof input.reason!=="string"||input.reason.trim()!==input.reason||
       input.reason.length<10||input.reason.length>500)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    // #307 P2: Person SHARE -> live session/security -> Seller advisory.
    // Preliminary identity is NOT Owner authority; ownerPauseScope_ rechecks
    // protected Owner, Organization, native Member/Seller and current origin
    // under the serialized Seller lock before any write.
    if(!await this.ownerPauseSessionPrelock_(db,token))
      return null
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-owner-pause'),hashtext(?))",
      [input.seller_id])
    const owner=await this.ownerPauseScope_(db,token,input.organization_id,input.seller_id)
    if(!owner)return null
    const row=await this.platformClosingRow_(db,input.seller_id,true)
    if(!row||row.organization_id!==input.organization_id)
      return {status:"conflict" as const}
    if(row.state==="appealed"){
      if(row.appeal_request_id===input.request_id&&row.appeal_reason===input.reason)
        return {status:"appealed" as const,version:2,replayed:true}
      return {status:"conflict" as const}
    }
    if(row.state!=="notification_unverified"||Number(row.version)!==1)
      return {status:"conflict" as const}
    // Existing accepted appeal replays are handled above. For a new first
    // appeal, the canonical 10-day window is enforced by the PG16 clock,
    // never by the browser. A pre-clock appeal remains allowed.
    // Compare native timestamptz values in PostgreSQL at microsecond
    // precision. 240 hours matches the existing UTC 10*24h contract;
    // converting the cutoff to JS milliseconds could shift its last instant.
    const clock=await db.execute(`select t.now_at,
      coalesce(t.now_at >= (?::timestamptz + interval '240 hours'),false)
        as first_appeal_expired
      from (select clock_timestamp() as now_at) t`,[row.deadline_started_at])
    if(clock.length!==1||
       !Number.isFinite(new Date(clock[0].now_at).getTime())||
       typeof clock[0].first_appeal_expired!=="boolean")
      throw new IdentityAccessDenied()
    if(clock[0].first_appeal_expired)
      return {status:"conflict" as const}
    const history=await db.execute(`select id from da_audit_event
      where module='dogruadres-access' and resource='store-platform-closing'
        and target_id=? and new_values->>'request_id'=?
        and deleted_at is null limit 2`,[input.seller_id,input.request_id])
    if(history.length)throw new IdentityAccessDenied()
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:owner.actor.person_id,actor_type:owner.actor.actor_type,
      actor_id:owner.actor.actor_id,role_context:"owner",
      organization_id:input.organization_id,
      action:"organization.store_platform_closing_appealed",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-platform-closing",
      target_id:input.seller_id,
      new_values:{request_id:input.request_id,
        appeal_reason_sha256:createHash("sha256").update(input.reason).digest("hex")},
      occurred_at:new Date(clock[0].now_at)
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const changed=await db.execute(`update da_store_platform_closing
      set state='appealed',version=2,appeal_request_id=?,appeal_reason=?,
        appeal_audit_event_id=?,appealed_at=?,updated_at=clock_timestamp()
      where seller_id=? and organization_id=? and version=1
        and state='notification_unverified' returning seller_id`,
      [input.request_id,input.reason,audit.id,new Date(clock[0].now_at).toISOString(),
       input.seller_id,input.organization_id])
    if(changed.length!==1)throw new IdentityAccessDenied()
    await db.execute(`insert into da_notification_receipt(id,person_id,audit_event_id)
      select 'danot_'||gen_random_uuid()::text,m.person_id,?
      from da_organization_membership m join da_person p on p.id=m.person_id
      where m.organization_id=? and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.revoked_at is null and m.deleted_at is null
        and p.disabled_at is null and p.deleted_at is null
      on conflict (audit_event_id,person_id) do nothing`,
      [audit.id,input.organization_id])
    return {status:"appealed" as const,version:2,replayed:false}
  }

  /** A protected Owner may request independent platform review only
   * in the second (10–30 day) window when no first appeal was filed.
   * This is a durable pending request, NOT a Staff decision or finalizer.
   */
  async personalRequestPlatformStoreClosingFinalReview(token:string,input:{
    organization_id:string;seller_id:string;request_id:string;
    expected_version:number;reason:string
  },context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !/^dasfr_[a-f0-9]{32}$/.test(input.request_id)||
       input.expected_version!==1||
       typeof input.reason!=="string"||input.reason.trim()!==input.reason||
       input.reason.length<10||input.reason.length>500)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    // #307 P2: Person SHARE -> live session/security -> Seller advisory.
    // Preliminary identity is NOT Owner authority; ownerPauseScope_ rechecks
    // protected Owner, Organization, native Member/Seller and current origin
    // under the serialized Seller lock before any write.
    if(!await this.ownerPauseSessionPrelock_(db,token))
      return null
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-owner-pause'),hashtext(?))",
      [input.seller_id])
    const owner=await this.ownerPauseScope_(db,token,input.organization_id,input.seller_id)
    if(!owner)return null
    const row=await this.platformClosingRow_(db,input.seller_id,true)
    if(!row||row.organization_id!==input.organization_id)
      return {status:"conflict" as const}
    // Replay is limited to the same currently authorized Owner and content.
    if(row.final_review_request_id!==null){
      if(row.final_review_request_id===input.request_id&&
         row.final_review_reason===input.reason&&
         row.final_review_requested_by_person_id===owner.actor.person_id)
        return {status:"review_requested" as const,replayed:true}
      return {status:"conflict" as const}
    }
    if(row.state!=="notification_unverified"||Number(row.version)!==1||
       row.deadline_started_at===null)
      return {status:"conflict" as const}
    const clock=await db.execute(`select x.now_at,
      (x.now_at >= (?::timestamptz + interval '240 hours') and
       x.now_at < (?::timestamptz + interval '720 hours'))
        as second_window
      from (select clock_timestamp() as now_at) x`,
      [row.deadline_started_at,row.deadline_started_at])
    if(clock.length!==1||
       !Number.isFinite(new Date(clock[0].now_at).getTime())||
       typeof clock[0].second_window!=="boolean")
      throw new IdentityAccessDenied()
    if(!clock[0].second_window)return {status:"conflict" as const}
    const duplicate=await db.execute(`select id from da_audit_event
      where module='dogruadres-access' and resource='store-platform-closing'
        and target_id=? and new_values->>'request_id'=?
        and deleted_at is null limit 2`,
      [input.seller_id,input.request_id])
    if(duplicate.length)throw new IdentityAccessDenied()
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:owner.actor.person_id,actor_type:owner.actor.actor_type,
      actor_id:owner.actor.actor_id,role_context:"owner",
      organization_id:input.organization_id,
      action:"organization.store_platform_closing_final_review_requested",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-platform-closing",
      target_id:input.seller_id,
      new_values:{request_id:input.request_id,stage:"second_review",
        reason_sha256:createHash("sha256").update(input.reason).digest("hex")},
      occurred_at:new Date(clock[0].now_at)
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const changed=await db.execute(`update da_store_platform_closing
      set final_review_request_id=?,final_review_reason=?,
        final_review_audit_event_id=?,
        final_review_requested_by_person_id=?,
        -- Keep the persisted cutoff timestamp at PostgreSQL microsecond
        -- precision, not a lossy JavaScript Date millisecond conversion.
        final_review_requested_at=clock_timestamp(),
        updated_at=clock_timestamp()
      where seller_id=? and organization_id=? and version=1
        and state='notification_unverified'
        and final_review_request_id is null
      returning seller_id`,[
      input.request_id,input.reason,audit.id,owner.actor.person_id,
      input.seller_id,input.organization_id])
    if(changed.length!==1)throw new IdentityAccessDenied()
    await db.execute(`insert into da_notification_receipt(id,person_id,audit_event_id)
      select 'danot_'||gen_random_uuid()::text,m.person_id,?
      from da_organization_membership m join da_person p on p.id=m.person_id
      where m.organization_id=? and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.revoked_at is null and m.deleted_at is null
        and p.disabled_at is null and p.deleted_at is null
      on conflict (audit_event_id,person_id) do nothing`,
      [audit.id,input.organization_id])
    return {status:"review_requested" as const,replayed:false}
  }

  /**
   * Independent Staff queue. The initiating closing Staff has NO implicit
   * review authority. A separate explicit strong platform grant is required.
   * Only verified source-backed Owner submissions are displayed.
   */
  async personalReviewablePlatformClosingAppeals(token:string,page=0,
    context:Context={}){
    if(!Number.isSafeInteger(page)||page<0||page>1000)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.closing.review","platform")
    if(!staff)return null
    const rows=await db.execute(`select c.seller_id,c.organization_id,
      d.name organization_name,s.name store_name,
      src.actor_person_id closing_staff_person_id
      from da_store_platform_closing c
      join da_organization d on d.id=c.organization_id
        and d.status='active' and d.deleted_at is null
      join seller s on s.id=c.seller_id and s.deleted_at is null
        and s.approved_at is not null
      join da_organization_seller_ownership o
        on o.organization_id=c.organization_id and o.seller_id=c.seller_id
        and o.revoked_at is null
      join da_audit_event src on src.id=c.source_audit_event_id
        and src.deleted_at is null and src.module='dogruadres-access'
        and src.action='organization.store_platform_closing_started'
        and src.resource='store-platform-closing'
        and src.organization_id=c.organization_id and src.target_id=c.seller_id
      where (c.appeal_request_id is not null or
             c.final_review_request_id is not null)
        and c.review_decision_request_id is null
        and src.actor_person_id<>?
      order by coalesce(c.final_review_requested_at,c.appealed_at),c.seller_id
      limit 31 offset ?`,[staff.person_id,page*30])
    if(rows.length>31)throw new IdentityAccessDenied()
    const result:Array<{
      seller_id:string;organization_id:string;organization_name:string;
      store_name:string;stage:string;source_request_id:string;request_reason:string
    }>=[]
    for(const item of rows.slice(0,30)){
      if(!(await platformApprovedSellerIds(db,item.organization_id)).includes(item.seller_id))
        throw new IdentityAccessDenied()
      const row=await this.platformClosingRow_(db,item.seller_id)
      if(!row||row.organization_id!==item.organization_id||
         row.review_decision_request_id!==null||
         (row.appeal_request_id===null&&row.final_review_request_id===null))
        throw new IdentityAccessDenied()
      result.push({
        seller_id:item.seller_id as string,
        organization_id:item.organization_id as string,
        organization_name:item.organization_name as string,
        store_name:item.store_name as string,
        stage:row.appeal_request_id!==null?"first_appeal":"second_review",
        source_request_id:(row.appeal_request_id??row.final_review_request_id) as string,
        request_reason:(row.appeal_reason??row.final_review_reason) as string
      })
    }
    // Source reads can span many statements: a Staff task may be revoked
    // while this private queue is assembled. Revalidate the same session,
    // Person and grant immediately before release, then hold the live grant
    // FOR SHARE until the read transaction commits. Concurrent revocation
    // must commit before this check (403), or wait for this read to finish.
    const fresh=await new IdentitySessions(db).staff(token,"store.closing.review","platform")
    if(!fresh||fresh.person_id!==staff.person_id||
       fresh.grant_id!==staff.grant_id)return null
    const grant=await db.execute(`select g.id from da_platform_staff_grant g
      where g.id=? and g.person_id=? and g.task='store.closing.review'
        and g.resource='platform' and g.revoked_at is null
        and (g.expires_at is null or g.expires_at>clock_timestamp())
      for share`,[fresh.grant_id,fresh.person_id])
    if(grant.length!==1)return null
    return {candidates:result,page,has_more:rows.length>30}
  }

  /**
   * Single, reasoned review decision, NOT the irreversible finalizer.
   * Accepted requests preserve the closure sale block pending a separate
   * authorized reopening; rejected requests preserve it likewise.
   */
  async personalDecidePlatformClosingAppeal(token:string,input:{
    organization_id:string;seller_id:string;source_request_id:string;
    request_id:string;decision:"accepted"|"rejected";reason:string
  },context:Context={}){
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(input.organization_id)||
       !/^sel_[A-Za-z0-9_-]+$/.test(input.seller_id)||
       !/^(dapa_|dasfr_)[a-f0-9]{32}$/.test(input.source_request_id)||
       !/^dasdr_[a-f0-9]{32}$/.test(input.request_id)||
       !["accepted","rejected"].includes(input.decision)||
       typeof input.reason!=="string"||input.reason.trim()!==input.reason||
       input.reason.length<10||input.reason.length>500)
      throw new IdentityAccessDenied()
    const db=securitySql(context.transactionManager)
    const staff=await new IdentitySessions(db).staff(token,"store.closing.review","platform")
    if(!staff)return null
    const grant=await db.execute(`select g.id from da_platform_staff_grant g
      where g.id=? and g.person_id=? and g.task='store.closing.review'
        and g.resource='platform' and g.revoked_at is null
        and (g.expires_at is null or g.expires_at>clock_timestamp())
      for share`,[staff.grant_id,staff.person_id])
    if(grant.length!==1)return null
    await db.execute("select pg_advisory_xact_lock(hashtext('b22-owner-pause'),hashtext(?))",
      [input.seller_id])
    const row=await this.platformClosingRow_(db,input.seller_id,true)
    if(!row||row.organization_id!==input.organization_id)
      return {status:"conflict" as const}
    // A historical closure audit is not a current Organization/Store grant.
    // Revalidate the canonical approved native Seller relationship at write.
    if(!(await platformApprovedSellerIds(db,input.organization_id)).includes(input.seller_id))
      return null
    const sourceId=row.appeal_request_id??row.final_review_request_id
    if(sourceId!==input.source_request_id||sourceId===null)
      return {status:"conflict" as const}
    const initial=await db.execute(`select actor_person_id from da_audit_event
      where id=? and action='organization.store_platform_closing_started'
        and role_context='platform_staff' and organization_id=?
        and target_id=? and deleted_at is null limit 2`,
      [row.source_audit_event_id,input.organization_id,input.seller_id])
    if(initial.length!==1||initial[0].actor_person_id===staff.person_id||
       await isCurrentProtectedOwner(db,staff.person_id,input.organization_id))
      return null
    if(row.review_decision_request_id!==null){
      if(row.review_decision_request_id===input.request_id&&
         row.review_decision===input.decision&&
         row.review_decision_reason===input.reason&&
         row.review_decided_by_person_id===staff.person_id)
        return {status:"decided" as const,replayed:true,
          decision:row.review_decision as "accepted"|"rejected"}
      return {status:"conflict" as const}
    }
    const duplicate=await db.execute(`select id from da_audit_event
      where module='dogruadres-access' and resource='store-platform-closing'
        and target_id=? and new_values->>'request_id'=?
        and deleted_at is null limit 2`,[input.seller_id,input.request_id])
    if(duplicate.length)throw new IdentityAccessDenied()
    const clock=await db.execute("select clock_timestamp() as at")
    if(clock.length!==1||
       !Number.isFinite(new Date(clock[0].at).getTime()))
      throw new IdentityAccessDenied()
    const [audit]=await this.persistAuditEventsWithOutbox_([{
      actor_person_id:staff.person_id,actor_type:staff.actor_type,
      actor_id:staff.actor_id,role_context:"platform_staff",
      organization_id:input.organization_id,
      action:"organization.store_platform_closing_review_decided",
      module:DOGRUADRES_AUDIT_MODULE,resource:"store-platform-closing",
      target_id:input.seller_id,
      new_values:{request_id:input.request_id,
        source_request_id:sourceId,decision:input.decision,
        reason_sha256:createHash("sha256").update(input.reason).digest("hex")},
      occurred_at:new Date(clock[0].at)
    }],context)
    if(!audit?.id)throw new IdentityAccessDenied()
    await (context.transactionManager as {flush():Promise<void>}).flush()
    const changed=await db.execute(`update da_store_platform_closing
      set review_decision_request_id=?,review_decision=?,
        review_decision_reason=?,review_decision_source_request_id=?,
        review_decision_audit_event_id=?,review_decided_by_person_id=?,
        review_decided_at=clock_timestamp(),updated_at=clock_timestamp()
      where seller_id=? and organization_id=?
        and review_decision_request_id is null
      returning seller_id`,[
      input.request_id,input.decision,input.reason,sourceId,
      audit.id,staff.person_id,input.seller_id,input.organization_id])
    if(changed.length!==1)throw new IdentityAccessDenied()
    await db.execute(`insert into da_notification_receipt(id,person_id,audit_event_id)
      select 'danot_'||gen_random_uuid()::text,m.person_id,?
      from da_organization_membership m join da_person p on p.id=m.person_id
      where m.organization_id=? and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.revoked_at is null and m.deleted_at is null
        and p.disabled_at is null and p.deleted_at is null
      on conflict(audit_event_id,person_id) do nothing`,
      [audit.id,input.organization_id])
    return {status:"decided" as const,replayed:false,
      decision:input.decision}
  }

  // B22 product draft: Foundation-owned intent ledger, not another product
  // service. Never interpret a reserved/uncertain native outcome as retryable.
  
}
