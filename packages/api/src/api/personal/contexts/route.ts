import type {MedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import type {IAuthModuleService} from '@medusajs/framework/types'
import {access,enabled,sessionToken} from '../security'
import {ingressConfig} from '../../../utils/ingress-config'
export const AUTHENTICATE=false
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader('Cache-Control','no-store')
  if(!enabled())return res.status(503).json({message:'Unavailable'})
  const type=req.query.type,seller=req.query.seller,organization=req.query.organization
  if(Object.keys(req.query).some(k=>!['type','seller','organization'].includes(k))||
    !['member','customer'].includes(type as string)||
    (type==='member'&&(typeof seller!=='string'||!/^sel_[A-Za-z0-9_-]+$/.test(seller)||
      typeof organization!=='string'||!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organization)))||
    (type==='customer'&&(seller!==undefined||organization!==undefined))||
    req.headers['x-seller-id'])return res.status(400).json({message:'Invalid context'})
  const token=sessionToken(req),service=access(req),binding=await service.personalActorBinding(token,type as string)
  if(!binding)return res.status(403).json({message:'Access denied'})
  if(type==='member'){
    // B22 legal commercial principal: a native Member/SellerMember never
    // establishes which active Organization is allowed to operate this Store.
    // Native credential minting is prohibited until BOTH chains agree.
    const legal=await service.personalLegalSellerIds(token,organization as string)
    if(!legal||legal.person_id!==binding.person_id||
       !legal.seller_ids.includes(seller as string))return res.status(403).json({message:'Access denied'})
    // Fresh module-owned reads supplement (never replace) native Mercur seller
    // middleware, whose Query path may use a warm cache.
    const sellers=req.scope.resolve<{listSellerMembers(f:object):Promise<any[]>;listMembers(f:object):Promise<any[]>;listSellers(f:object):Promise<any[]>}>('seller')
    const [memberships,members,accounts]=await Promise.all([sellers.listSellerMembers({seller_id:seller,member_id:binding.actor_id}),sellers.listMembers({id:binding.actor_id,is_active:true}),sellers.listSellers({id:seller})])
    if(memberships.length!==1||members.length!==1||accounts.length!==1||
      memberships[0].seller_id!==seller||memberships[0].member_id!==binding.actor_id||
      members[0].id!==binding.actor_id||accounts[0].id!==seller||
      accounts[0].status!=='open'||!accounts[0].approved_at)
      return res.status(403).json({message:'Access denied'})
  }
  const auth:IAuthModuleService=req.scope.resolve('auth'),identity=await auth.retrieveAuthIdentity(binding.auth_identity_id)
  const {projectConfig:{http}}=req.scope.resolve('configModule')
  const jwt=await service.personalActorCredential(token,type as string,identity,{secret:http.jwtSecret,jwtOptions:http.jwtOptions})
  const topology=ingressConfig(process.env)
  const headers:Record<string,string>={Authorization:'Bearer '+jwt}
  if(type==='member')headers['x-seller-id']=seller as string
  else {const key=process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY;if(!key)return res.status(503).json({message:'Unavailable'});headers['x-publishable-api-key']=key}
  const response=await fetch(topology.privateOrigin+(type==='member'?'/vendor/members/me':'/store/customers/me'),{headers,redirect:'manual',signal:AbortSignal.timeout(10000)})
  if(!response.ok)return res.status([401,403,404].includes(response.status)?403:503).json({message:'Access denied'})
  const data=await response.json()
  if(type==='member'){
    const m=data.seller_member
    if(m?.member?.id!==binding.actor_id||m?.seller?.id!==seller)return res.status(503).json({message:'Invalid native context'})
    // Read again at the response boundary: actor, membership, Store and
    // canonical Organization link can be revoked during private native HTTP.
    // This narrows disclosure; it is NOT cross-module atomic revocation.
    const [live,legalNow]=await Promise.all([
      service.personalActorBinding(token,'member'),
      service.personalLegalSellerIds(token,organization as string)
    ])
    if(!live||live.revoked_at||live.person_id!==binding.person_id||
       live.actor_id!==binding.actor_id||!legalNow||
       legalNow.person_id!==binding.person_id||
       !legalNow.seller_ids.includes(seller as string))
      return res.status(403).json({message:'Access denied'})
    const sellerModule=req.scope.resolve<{listSellerMembers(f:object):Promise<any[]>;
      listMembers(f:object):Promise<any[]>;listSellers(f:object):Promise<any[]>}>('seller')
    const [liveRel,liveMember,liveSeller]=await Promise.all([
      sellerModule.listSellerMembers({seller_id:seller,member_id:binding.actor_id}),
      sellerModule.listMembers({id:binding.actor_id,is_active:true}),
      sellerModule.listSellers({id:seller})
    ])
    if(liveRel.length!==1||liveMember.length!==1||liveSeller.length!==1||
       liveRel[0].seller_id!==seller||liveRel[0].member_id!==binding.actor_id||
       liveMember[0].id!==binding.actor_id||liveSeller[0].id!==seller||
       liveSeller[0].status!=='open'||!liveSeller[0].approved_at)
      return res.status(403).json({message:'Access denied'})
    return res.json({person_id:binding.person_id,organization_id:organization,
      context:'member',actor_id:m.member.id,seller:{id:m.seller.id,name:m.seller.name}})
  }
  if(data.customer?.id!==binding.actor_id)return res.status(503).json({message:'Invalid native context'})
  // F-02: Customer bindings may be unlinked while private native HTTP is
  // pending. Never return a previously verified actor after its revocation.
  // This closes the response boundary, not a cross-module transaction.
  const liveCustomer=await service.personalActorBinding(token,'customer')
  if(!liveCustomer||liveCustomer.revoked_at||
     liveCustomer.id!==binding.id||
     liveCustomer.person_id!==binding.person_id||
     liveCustomer.actor_id!==binding.actor_id||
     liveCustomer.auth_identity_id!==binding.auth_identity_id)
    return res.status(403).json({message:'Access denied'})
  return res.json({person_id:binding.person_id,context:'customer',actor_id:data.customer.id})
}
