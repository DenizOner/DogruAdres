/// <reference lib="es2022.intl" />
import { ActorDelegation } from "./actor-delegation"
import { ownerRoleAllows } from "./role-action-policy"
import { randomUUID } from "node:crypto"
import type { Context } from "@medusajs/framework/types"
import {
  IdentitySessions,
  securitySql,
  isCurrentProtectedOwner,
  IdentityAccessDenied,
  type SecuritySql,
} from "./identity-session"
import { platformApprovedSellerIds } from "./legal-store-ownership"
import { authorizedBuyerOrganization, verifiedBuyerPurchaseGrant } from "./buyer-permission"
import { organizationActionAllowed } from "./role-action-policy"
import type { FoundationAuditInput } from "./service"
import { DOGRUADRES_AUDIT_MODULE } from "./service"

export class BuyerOperations {
  constructor(
    _db: SecuritySql,
    private persistAuditEventsWithOutbox: (input: FoundationAuditInput[], sharedContext: Context) => Promise<any[]>,
    _sharedContext: Context
  ) {}

  private persistAuditEventsWithOutbox_(input: FoundationAuditInput[], sharedContext: Context) {
    return this.persistAuditEventsWithOutbox(input, sharedContext)
  }

  async personalChangeBuyerPermission(
    token:string,input:{action:"grant"|"revoke";organization_id:string;membership_id:string},
    context:Context={}
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

  async personalListBuyerPermissions(
    token:string,organizationId:string,context:Context={}
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
  async personalChangeStoreBuyerBlock(
    token:string,input:{action:"block"|"unblock";organization_id:string;
      seller_id:string;buyer_organization_id:string},
    context:Context={}
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
  async personalStorePriceGroupAccess(
    token:string,input:{action:"grant"|"revoke"|"read";organization_id:string;
      seller_id:string;buyer_organization_id:string;customer_group_id:string;
      member_binding_id:string;member_actor_id:string;member_person_id:string},
    context:Context={}
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
  async personalBuyerStorePriceGroupIds(
    token:string,buyerOrganizationId:string,sellerId:string,
    context:Context={}
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
  async personalStoreBuyerBlockDecision(
    token:string,buyerOrganizationId:string,sellerIds:string[],
    context:Context={}
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

  async personalBuyerStoreFollowState(
    token:string,organizationId:string,sellerId:string,
    context:Context={}
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
  async personalBuyerStoreFollows(
    token:string,organizationId:string,after:string|undefined,
    context:Context={}
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

  async personalChangeBuyerStoreFollow(
    token:string,input:{action:"follow"|"unfollow";organization_id:string;
      seller_id:string;expected_version:number},
    context:Context={}
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

  async personalBuyerOrganization(
    token:string,organizationId:string,context:Context={}
  ){
    return authorizedBuyerOrganization(securitySql(context.transactionManager),token,organizationId)
  }


  // Native Cart's customer_id is verified by the API against Medusa before
  // and after this Foundation-only transaction. Cross-module Cart mutation
  // cannot be locked here: this is NOT a checkout or commercial eligibility.
  // One Cart ID may never be silently reassigned to another legal Organization.
  async personalClaimBuyerCart(
    token:string,organizationId:string,cartId:string,customerId:string,
    context:Context={}
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

  async personalBuyerCartAttribution(
    token:string,organizationId:string,cartId:string,customerId:string,
    context:Context={}
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
  async authorizeBuyerCheckout(
    cartId:string,
    customerId:string,
    sellerIds:string[],
    context:Context={}
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
        -- One paused or unverifiable Owner pause record denies the WHOLE
        -- multi-Seller cart. No partial order group may be written.
        and not exists(
          select 1 from da_store_owner_pause pause
          where pause.seller_id in (${sellerSlots})
            and (pause.paused=true or not exists(
              select 1 from da_audit_event proof
              where proof.id=pause.source_audit_event_id
                and proof.deleted_at is null
                and proof.module='dogruadres-access'
                and proof.resource='store-owner-pause'
                and proof.organization_id=pause.organization_id
                and proof.target_id=pause.seller_id
                and proof.action=(case when pause.paused then
                  'organization.store_owner_paused' else
                  'organization.store_owner_resumed' end)
                and proof.new_values->>'request_id'=pause.request_id
                and proof.new_values->>'version'=pause.version::text
                and proof.new_values->>'paused'=pause.paused::text
                and exists(select 1 from da_audit_outbox outbox
                  where outbox.source_audit_event_id=proof.id
                    and outbox.source_module='dogruadres-access'
                    and outbox.deleted_at is null)))
        )
        and not exists(
          select 1 from da_store_owner_closing c
          where c.seller_id in (${sellerSlots})
            and (c.state='closing' or not exists(
              select 1 from da_audit_event e
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
                and e.new_values->>'version'=c.version::text
                and e.new_values->>'request_id'=c.request_id
                and (e.new_values->>'started_at')::timestamptz=c.started_at
                and (e.new_values->>'due_at')::timestamptz=c.due_at))
        )
        -- A platform closure (including contested or unverified notification)
        -- immediately blocks the whole multi-Seller Cart; no partial checkout.
        and not exists(
          select 1 from da_store_platform_closing c
          where c.seller_id in (${sellerSlots})
        )
        and not exists(
          select 1 from da_store_buyer_organization_block block
          where block.buyer_organization_id=a.organization_id
            and block.seller_id in (${sellerSlots})
            and block.revoked_at is null
        )
      limit 2
    `,[cartId,customerId,ownerRoleAllows("buyer.purchase"),...sellerIds,sellerIds.length,...sellerIds,...sellerIds,...sellerIds,...sellerIds])
    if(rows.length>1)throw new IdentityAccessDenied()
    return rows.length===1
  }


}
