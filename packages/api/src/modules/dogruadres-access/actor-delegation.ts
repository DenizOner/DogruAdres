import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto'
import {generateJwtToken} from '@medusajs/framework/utils'
import {IdentitySessions,IdentityAccessDenied,digest,type SecuritySql} from './identity-session'

export class ActorDelegation {
  constructor(private readonly db:SecuritySql){}
  async binding(token:string,type:string){
    if(!['member','customer'].includes(type))throw new IdentityAccessDenied()
    const session=await new IdentitySessions(this.db).current(token,false,false)
    if(!session)return null
    const rows=await this.db.execute(`select b.* from da_verified_actor_binding b join da_actor_mapping a on a.person_id=b.person_id and a.actor_type=b.actor_type and a.actor_id=b.actor_id and a.deleted_at is null where b.person_id=? and b.actor_type=? and b.revoked_at is null and b.verified_at is not null`,[session.person_id,type])
    return rows.length===1?{session,binding:rows[0]}:null
  }
  async credential(token:string,type:string,identity:{id:string;app_metadata?:Record<string,unknown>},http:Parameters<typeof generateJwtToken>[1]){
    const state=await this.binding(token,type)
    if(!state)throw new IdentityAccessDenied()
    const {session:s,binding:b}=state
    if(identity.id!==b.auth_identity_id||identity.app_metadata?.[type+'_id']!==b.actor_id)throw new IdentityAccessDenied()
    const secret=process.env.COOKIE_SECRET;if(!secret||secret.length<32)throw new IdentityAccessDenied()
    const key=createHash('sha256').update('native-credential:'+secret).digest()
    const rows=await this.db.execute(`select ciphertext,expires_at from da_actor_credential where session_id=? and binding_id=? and retired_at is null`,[s.id,b.id])
    if(rows.length>1)throw new IdentityAccessDenied()
    if(rows.length===1&&new Date(rows[0].expires_at).getTime()>s.now_ms+60000){
      const [iv,tag,data]=rows[0].ciphertext.split('.').map((p:string)=>Buffer.from(p,'base64url'))
      const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8')
    }
    const iat=Math.floor(s.now_ms/1000)
    const jwt=generateJwtToken({jti:randomUUID(),iat,actor_id:b.actor_id,actor_type:type,auth_identity_id:identity.id,app_metadata:identity.app_metadata,
      auth_provider:'emailpass',mfa_enabled:!!s.last_strong_auth_at,mfa_challenge_completed_at:s.last_strong_auth_at?new Date(s.last_strong_auth_at).toISOString():null},
      {...http,expiresIn:900,jwtOptions:{...http.jwtOptions,expiresIn:900}})
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(jwt,'utf8'),cipher.final()])
    const ciphertext=[iv,cipher.getAuthTag(),data].map(b=>b.toString('base64url')).join('.')
    await this.db.execute(`update da_actor_credential set retired_at=clock_timestamp() where session_id=? and binding_id=? and retired_at is null`,[s.id,b.id])
    await this.db.execute(`insert into da_actor_credential(token_hash,session_id,binding_id,ciphertext,expires_at) values(?,?,?,?,?)`,[digest(jwt),s.id,b.id,ciphertext,new Date((iat+900)*1000)])
    return jwt // Trusted server caller only; never an HTTP response DTO.
  }
}
