/// <reference lib="es2022.intl" />
import { createHash } from "node:crypto"
import type { Context } from "@medusajs/framework/types"
import {
  IdentitySessions,
  securitySql,
  isCurrentProtectedOwner,
  IdentityAccessDenied,
  type SecuritySql,
} from "./identity-session"
import { authorizedProductEditScope, platformApprovedSellerIds, verifiedStoreProductEditGrant } from "./legal-store-ownership"
import { organizationActionAllowed } from "./role-action-policy"
import type { FoundationAuditInput } from "./service"
import { DOGRUADRES_AUDIT_MODULE } from "./service"

export class ProductDraftOperations {
  constructor(
    _db: SecuritySql,
    private persistAuditEventsWithOutbox: (input: FoundationAuditInput[], sharedContext: Context) => Promise<any[]>,
    _readablePersonalOrganizations: (token: string, organizationId: string, managerOnly: boolean, context: Context) => Promise<any>,
    _sharedContext: Context
  ) {}

  private persistAuditEventsWithOutbox_(input: FoundationAuditInput[], sharedContext: Context) {
    return this.persistAuditEventsWithOutbox(input, sharedContext)
  }

    async personalProductDraftScope(
    token:string,organizationId:string,sellerId:string,
    context:Context={}
  ){
    const db=securitySql(context.transactionManager),s=new IdentitySessions(db)
    const current=await s.current(token,true,false)
    if(!current)return null
    const scope=await authorizedProductEditScope(db,token,organizationId,sellerId)
    return scope?.person_id===current.person_id?scope:null
  }

  async personalProductDraftCandidates(
    token:string,organizationId:string,context:Context={}
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
  async personalProductDraftReceipt(
    token:string,organizationId:string,sellerId:string,requestId:string,
    context:Context={}
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
  async personalWithProductDraftPermissionLock<T>(
    token:string,input:{organization_id:string;seller_id:string},
    execute:(context:Context)=>Promise<T>,context:Context={}
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

  async personalReserveProductDraft(
    token:string,input:{request_id:string;organization_id:string;seller_id:string;title:string},
    context:Context={}
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

  async personalCompleteProductDraft(
    token:string,input:{request_id:string;organization_id:string;seller_id:string;title:string},
    productId:string,context:Context={}
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
  // B20: explicit Company workspace navigation only; NOT a permission source.
  // Recheck session, active Organization and current protected Owner on every
  // read/write. The membership/Organization SHARE locks serialize with revoke.
  // ---------------------------------------------------------------------------
  }
