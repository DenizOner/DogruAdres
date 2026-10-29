import {createHash} from "node:crypto"
import {IdentityAccessDenied,IdentitySessions,type SecuritySql} from "./identity-session"
import {ActorDelegation} from "./actor-delegation"

export type StoreRequest = Readonly<{
  organization_id:string; application_id:string; name:string;
  email:string; currency_code:string
}>
export const storeRequestFingerprint=(request:StoreRequest)=>
  createHash("sha256").update(JSON.stringify([
    request.organization_id,request.name,request.email,request.currency_code
  ])).digest("hex")

export async function eligibleOwner(db:SecuritySql,token:string,org:string){
  if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(org))throw new IdentityAccessDenied()
  const s=await new IdentitySessions(db).current(token,true,false)
  if(!s)return null
  const scope=await new IdentitySessions(db).organizations(token,org,false)
  if(!scope||scope.person_id!==s.person_id||scope.organizations.length!==1||
     scope.organizations[0].role!=="owner")return null
  const bound=await new ActorDelegation(db).binding(token,"member")
  if(!bound || bound.binding.person_id!==s.person_id ||
     !bound.binding.auth_identity_id || !bound.binding.actor_id)return null
  return {person_id:s.person_id,actor_type:s.actor_type,actor_id:s.actor_id,
    member_id:bound.binding.actor_id as string,
    member_auth_identity_id:bound.binding.auth_identity_id as string}
}

export async function readStoreApplications(db:SecuritySql,token:string,org:string){
  const current=await new IdentitySessions(db).organizations(token,org,false)
  if(!current||current.organizations.length!==1||
    !["owner","admin"].includes(current.organizations[0].role))return null
  const rows=await db.execute(`select id,status,seller_id,created_at
    from da_store_application where organization_id=? and person_id=?
    order by created_at desc limit 30`,[org,current.person_id])
  if(!Array.isArray(rows)||rows.length>30)throw new IdentityAccessDenied()
  return rows.map(r=>({id:r.id,status:r.status,seller_id:r.seller_id,created_at:r.created_at}))
}
