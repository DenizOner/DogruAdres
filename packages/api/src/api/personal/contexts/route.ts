import type {MedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import type {IAuthModuleService} from '@medusajs/framework/types'
import {access,enabled,sessionToken} from '../security'
export const AUTHENTICATE=false
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader('Cache-Control','no-store')
  if(!enabled())return res.status(503).json({message:'Unavailable'})
  const type=req.query.type,seller=req.query.seller
  if(Object.keys(req.query).some(k=>!['type','seller'].includes(k))||!['member','customer'].includes(type as string)||
    (type==='member'&&(typeof seller!=='string'||!/^sel_[A-Za-z0-9_-]+$/.test(seller)))||type==='customer'&&seller!==undefined||req.headers['x-seller-id'])return res.status(400).json({message:'Invalid context'})
  const token=sessionToken(req),service=access(req),binding=await service.personalActorBinding(token,type as string)
  if(!binding)return res.status(403).json({message:'Access denied'})
  if(type==='member'){
    // Fresh module-owned reads supplement (never replace) native Mercur seller
    // middleware, whose Query path may use a warm cache.
    const sellers=req.scope.resolve<{listSellerMembers(f:object):Promise<any[]>;listMembers(f:object):Promise<any[]>;listSellers(f:object):Promise<any[]>}>('seller')
    const [memberships,members,accounts]=await Promise.all([sellers.listSellerMembers({seller_id:seller,member_id:binding.actor_id}),sellers.listMembers({id:binding.actor_id,is_active:true}),sellers.listSellers({id:seller})])
    if(memberships.length!==1||members.length!==1||accounts.length!==1||!['open'].includes(accounts[0].status))return res.status(403).json({message:'Access denied'})
  }
  const auth:IAuthModuleService=req.scope.resolve('auth'),identity=await auth.retrieveAuthIdentity(binding.auth_identity_id)
  const {projectConfig:{http}}=req.scope.resolve('configModule')
  const jwt=await service.personalActorCredential(token,type as string,identity,{secret:http.jwtSecret,jwtOptions:http.jwtOptions})
  if(process.env.DOGRUADRES_PRIVATE_API!=='http://127.0.0.1:19100')return res.status(503).json({message:'Unavailable'})
  const headers:Record<string,string>={Authorization:'Bearer '+jwt}
  if(type==='member')headers['x-seller-id']=seller as string
  else {const key=process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY;if(!key)return res.status(503).json({message:'Unavailable'});headers['x-publishable-api-key']=key}
  const response=await fetch(process.env.DOGRUADRES_PRIVATE_API+(type==='member'?'/vendor/members/me':'/store/customers/me'),{headers,redirect:'manual',signal:AbortSignal.timeout(10000)})
  if(!response.ok)return res.status([401,403,404].includes(response.status)?403:503).json({message:'Access denied'})
  const data=await response.json()
  if(type==='member'){
    const m=data.seller_member
    if(m?.member?.id!==binding.actor_id||m?.seller?.id!==seller)return res.status(503).json({message:'Invalid native context'})
    return res.json({person_id:binding.person_id,context:'member',actor_id:m.member.id,seller:{id:m.seller.id,name:m.seller.name}})
  }
  if(data.customer?.id!==binding.actor_id)return res.status(503).json({message:'Invalid native context'})
  return res.json({person_id:binding.person_id,context:'customer',actor_id:data.customer.id})
}
