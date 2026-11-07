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

export async function authorizedStoreDraftOwner(db:SecuritySql,token:string,org:string) {
  if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(org))throw new IdentityAccessDenied()
  const identities=new IdentitySessions(db)
  const person=await identities.current(token,false,false)
  if(!person)return null
  const scope=await identities.organizations(token,org,false)
  if(!scope||scope.person_id!==person.person_id||scope.organizations.length!==1)return null
  const protectedOwner=await isCurrentProtectedOwner(db,person.person_id,org)
  if(!organizationActionAllowed(scope.organizations[0].role,
      "store.application.draft.manage",protectedOwner,false))return null
  return person
}

export async function readStoreDrafts(db:SecuritySql,token:string,org:string) {
  const owner=await authorizedStoreDraftOwner(db,token,org)
  if(!owner)return null
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
  return {drafts:rows.slice(0,30),has_more_drafts:rows.length>30}
}
