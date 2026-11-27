/// <reference lib="es2022.intl" />
import { verifiedStoreProductEditGrant } from "./legal-store-ownership"
import { organizationActionAllowed } from "./role-action-policy"
import { randomUUID } from "node:crypto"
import type { Context } from "@medusajs/framework/types"
import {
  IdentitySessions,
  securitySql,
  isCurrentProtectedOwner,
  IdentityAccessDenied,
  type SecuritySql,
} from "./identity-session"
import { authorizedLegalSellerIds, platformApprovedSellerIds } from "./legal-store-ownership"
import type { FoundationAuditInput } from "./service"
import { DOGRUADRES_AUDIT_MODULE } from "./service"

export class StoreProductPermissionOperations {
  constructor(
    private db: SecuritySql,
    private persistAuditEventsWithOutbox: (input: FoundationAuditInput[], sharedContext: Context) => Promise<any[]>,
    private sharedContext: Context
  ) {}

  private persistAuditEventsWithOutbox_(input: FoundationAuditInput[], sharedContext: Context) {
    return this.persistAuditEventsWithOutbox(input, sharedContext)
  }

    async personalLegalSellerIds(token: string, organizationId: string,
    context: Context = {}) {
    return authorizedLegalSellerIds(securitySql(context.transactionManager), token, organizationId)
  }


  // B22: Only a currently authenticated Organization Owner may change one
  // independently assigned products.edit grant for a member of THAT same Org.
  // Atomic Foundation audit/outbox is authoritative, not Mercur is_owner.
  // Native Seller status is additionally checked by the public POST adapter.
  async personalChangeStoreProductPermission(
    token:string,input:{action:"grant"|"revoke";organization_id:string;seller_id:string;membership_id:string},
    context:Context={}
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
  async personalWithStoreMemberConnectionLock(
    token:string,
    input:{organization_id:string;seller_id:string;membership_id:string},
    execute:(memberId:string,context:Context)=>Promise<{created:boolean}>,
    context:Context={}
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

  async personalListStoreProductPermissions(token:string,organizationId:string,
    context:Context={}){
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
  
}
