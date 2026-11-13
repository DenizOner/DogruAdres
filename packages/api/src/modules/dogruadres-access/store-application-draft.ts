import { z } from "@medusajs/framework/zod"
import { IdentityAccessDenied, IdentitySessions, isCurrentProtectedOwner, type SecuritySql } from "./identity-session"
import { organizationActionAllowed } from "./role-action-policy"

// Only unfinished Organization-private input. No native Seller, no Store
// entitlement and no irreversible native application reservation.
export const storeDraftPayload=z.object({
  action:z.literal("save_draft"),
  organization_id:z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/),
  draft_id:z.string().regex(/^dasdraft_[0-9a-f]{32}$/),
  expected_version:z.number().int().min(0).max(2147483646),
  name:z.string().trim().min(3).max(40)
    .refine(s=>!/[\x00-\x1f\x7f]/.test(s) && !/^\d+$/.test(s)),
  email:z.string().trim().email().max(254),
  currency_code:z.string().regex(/^[a-z]{3}$/),
}).strict()
export type StoreDraftInput=z.infer<typeof storeDraftPayload>

/** A grant is a person+Organization+exact membership privilege, NOT a
 * native SellerMember role. Verify canonical issuer audit AND outbox.
 */
export async function verifiedStoreDraftGrant(
  db:SecuritySql,personId:string,organizationId:string,membershipId:string
):Promise<boolean>{
  if(!/^daprs_[A-Za-z0-9_-]+$/.test(personId)||
     !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)||
     !/^[A-Za-z0-9_-]{1,128}$/.test(membershipId))throw new IdentityAccessDenied()
  const rows=await db.execute(`select g.id from da_organization_store_draft_permission g
    join da_audit_event e on e.id=g.source_audit_event_id
      and e.deleted_at is null and e.module='dogruadres-access'
      and e.actor_person_id=g.issued_by_person_id
      and e.organization_id=g.organization_id and e.target_id=g.person_id
      and e.action='organization.store_draft_permission_granted'
      and e.resource='store-draft-permission'
      and e.new_values->>'grant_id'=g.id
      and e.new_values->>'person_id'=g.person_id
      and e.new_values->>'membership_id'=g.membership_id
      and e.new_values->>'permission'=g.permission
    join da_audit_outbox x on x.source_audit_event_id=e.id
      and x.source_module='dogruadres-access' and x.deleted_at is null
    where g.person_id=? and g.organization_id=? and g.membership_id=?
      and g.permission='store.application.draft.manage'
      and g.revoked_at is null limit 2 for share of g`,
    [personId,organizationId,membershipId])
  if(rows.length>1||rows.some(x=>typeof x.id!=="string"||
      !/^dasdpg_[A-Za-z0-9_-]+$/.test(x.id)))throw new IdentityAccessDenied()
  return rows.length===1
}

export async function authorizedStoreDraftActor(db:SecuritySql,token:string,org:string) {
  if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(org))throw new IdentityAccessDenied()
  const identities=new IdentitySessions(db)
  // Phone writes already take Person before session/security. Keep the same
  // lock order for both draft GET and POST without requiring fresh MFA here.
  const person=await identities.currentWithPersonLock(token,false,false)
  if(!person)return null
  const scope=await identities.organizations(token,org,false)
  if(!scope||scope.person_id!==person.person_id||scope.organizations.length!==1)return null
  const membership=scope.organizations[0]
  if(membership.role==="owner"){
    const protectedOwner=await isCurrentProtectedOwner(db,person.person_id,org)
    if(!organizationActionAllowed("owner",
        "store.application.draft.manage",protectedOwner,false))return null
    return {...person,role_context:"owner" as const}
  }
  if(membership.role!=="member"||
     typeof membership.membership_id!=="string"||
     !/^[A-Za-z0-9_-]{1,128}$/.test(membership.membership_id))return null
  // Serialize a draft writer with an Owner's grant/revoke. The current
  // membership and Organization are locked through the transaction, too.
  const live=await db.execute(`select m.id from da_organization_membership m
    join da_person p on p.id=m.person_id and p.disabled_at is null and p.deleted_at is null
    join da_organization o on o.id=m.organization_id and o.status='active' and o.deleted_at is null
    where m.id=? and m.organization_id=? and m.person_id=?
      and m.role='member' and m.protected_owner=false
      and m.status='active' and m.revoked_at is null and m.deleted_at is null
    for share of m,p,o`,[membership.membership_id,org,person.person_id])
  if(live.length!==1)return null
  await db.execute(`select pg_advisory_xact_lock(
    hashtext('b22-store-draft-grant'),hashtext(?))`,[org+":"+person.person_id])
  const granted=await verifiedStoreDraftGrant(db,person.person_id,org,membership.membership_id)
  if(!organizationActionAllowed("member","store.application.draft.manage",false,granted))
    return null
  return {...person,role_context:"member" as const}
}

export async function readStoreDrafts(db:SecuritySql,token:string,org:string) {
  const actor=await authorizedStoreDraftActor(db,token,org)
  if(!actor)return null
  // Policy pauses do not erase or hide unfinished drafts; they only prevent
  // an Owner from submitting a NEW native Seller application.
  const rows=await db.execute(`select id,name,email,currency_code,version,
      created_at,updated_at from da_store_application_draft
    where organization_id=? and status='draft'
    order by updated_at desc,id desc limit 31`,[org])
  if(!Array.isArray(rows)||rows.length>31||
    rows.some(r=>typeof r.id!=="string"||!/^dasdraft_[0-9a-f]{32}$/.test(r.id)||
      typeof r.name!=="string"||typeof r.email!=="string"||
      typeof r.currency_code!=="string"||
      !Number.isSafeInteger(r.version)||r.version<1))throw new IdentityAccessDenied()
  return {drafts:rows.slice(0,30),has_more_drafts:rows.length>30,draft_role:actor.role_context}
}
