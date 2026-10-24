import {randomUUID} from 'node:crypto'
import {IdentitySessions,IdentityAccessDenied,digest,opaque,type SecuritySql} from './identity-session'
export type VerifiedSecondary=Readonly<{auth_identity_id:string;actor_type:'member'|'customer';actor_id:string;proof_fingerprint:string}>
export class AccountLinking{
  constructor(private db:SecuritySql){}
  async primary(token:string){return new IdentitySessions(this.db).current(token,true,false)}
  async begin(token:string,proof:VerifiedSecondary,challengeId:string|null){
    const s=await this.primary(token);if(!s)return null
    if(proof.auth_identity_id===s.auth_identity_id)throw new IdentityAccessDenied()
    if(!['member','customer'].includes(proof.actor_type)||!proof.actor_id||!proof.auth_identity_id)throw new IdentityAccessDenied()
    const intent=opaque()
    await this.db.execute(`insert into da_actor_link_intent(id,session_id,person_id,auth_identity_id,actor_type,actor_id,challenge_id,proof_fingerprint,verified_at,expires_at) values(?,?,?,?,?,?,?,?,${challengeId?'null':'clock_timestamp()'},clock_timestamp()+interval '5 minutes')`,[digest(intent),s.id,s.person_id,proof.auth_identity_id,proof.actor_type,proof.actor_id,challengeId,proof.proof_fingerprint])
    return {intent,challenge_required:!!challengeId}
  }
  async read(token:string,intent:string){
    const s=await this.primary(token);if(!s)return null
    if(!/^[A-Za-z0-9_-]{43}$/.test(intent))throw new IdentityAccessDenied()
    const rows=await this.db.execute(`update da_actor_link_intent set attempts=attempts+1 where id=? and session_id=? and person_id=? and consumed_at is null and expires_at>clock_timestamp() and attempts<5 returning *`,[digest(intent),s.id,s.person_id])
    if(rows.length!==1)throw new IdentityAccessDenied();return rows[0]
  }
  private async audit(s:any,action:string,target:string,values:object){
    const id='daaud_'+randomUUID()
    await this.db.execute(`insert into da_audit_event(id,actor_person_id,actor_type,actor_id,action,module,resource,target_id,new_values,occurred_at,created_at,updated_at) values(?,?,?,?,?,'dogruadres-access','actor-binding',?,?::jsonb,now(),now(),now())`,[id,s.person_id,s.actor_type,s.actor_id,action,target,JSON.stringify(values)])
    await this.db.execute(`insert into da_security_outbox(id,audit_event_id,created_at) values(?,?,now())`,[randomUUID(),id])
  }
  async complete(token:string,intent:string,proof:VerifiedSecondary,challengeId:string|null){
    const s=await this.primary(token);if(!s)return null
    // Common lock order: session/Person epoch, actor, intent. Both link and
    // unlink take this actor lock; separate Persons racing one actor serialize.
    await this.db.execute(`select pg_advisory_xact_lock(hashtext('da-actor-link'),hashtext(?))`,[proof.actor_type+':'+proof.actor_id])
    const rows=await this.db.execute(`select * from da_actor_link_intent where id=? and session_id=? and person_id=? and consumed_at is null and expires_at>clock_timestamp() and attempts between 1 and 5 for update`,[digest(intent),s.id,s.person_id])
    if(rows.length!==1)throw new IdentityAccessDenied();const p=rows[0]
    if(!p.proof_fingerprint||p.proof_fingerprint!==proof.proof_fingerprint||p.auth_identity_id!==proof.auth_identity_id||p.actor_type!==proof.actor_type||p.actor_id!==proof.actor_id||p.challenge_id!==challengeId||(!p.challenge_id&&!p.verified_at)||proof.auth_identity_id===s.auth_identity_id)throw new IdentityAccessDenied()
    const mappings=await this.db.execute(`select * from da_actor_mapping where actor_type=? and actor_id=?`,[p.actor_type,p.actor_id])
    const owners=await this.db.execute(`select person_id from da_login_binding where auth_identity_id=? or (actor_type=? and actor_id=?) union select person_id from da_verified_actor_binding where auth_identity_id=? or (actor_type=? and actor_id=?)`,[p.auth_identity_id,p.actor_type,p.actor_id,p.auth_identity_id,p.actor_type,p.actor_id])
    if(mappings.length>1||mappings.some(a=>a.person_id!==s.person_id||a.deleted_at)||owners.some(a=>a.person_id!==s.person_id))throw new IdentityAccessDenied()
    const active=await this.db.execute(`select id from da_verified_actor_binding where revoked_at is null and ((person_id=? and actor_type=?) or (actor_type=? and actor_id=?))`,[s.person_id,p.actor_type,p.actor_type,p.actor_id])
    if(active.length)throw new IdentityAccessDenied()
    if(!mappings.length)await this.db.execute(`insert into da_actor_mapping(id,actor_type,actor_id,person_id,created_by_actor_type,created_by_actor_id,created_at,updated_at) values(?,?,?,?,?,?,now(),now())`,['daact_'+randomUUID(),p.actor_type,p.actor_id,s.person_id,s.actor_type,s.actor_id])
    const id='dabind_'+randomUUID()
    await this.db.execute(`insert into da_verified_actor_binding(id,person_id,auth_identity_id,actor_type,actor_id,verified_at,proof_reference) values(?,?,?,?,?,clock_timestamp(),?)`,[id,s.person_id,p.auth_identity_id,p.actor_type,p.actor_id,'dual-proof:'+p.id])
    await this.db.execute(`update da_actor_link_intent set consumed_at=clock_timestamp(),verified_at=coalesce(verified_at,clock_timestamp()) where id=?`,[p.id])
    await this.audit(s,'identity.actor_linked',id,{actor_type:p.actor_type,actor_id:p.actor_id,proof_reference:'dual-proof:'+p.id})
    return {binding:{id,actor_type:p.actor_type,actor_id:p.actor_id}}
  }
  async unlink(token:string,id:string){
    const s=await this.primary(token);if(!s)return null
    const initial=await this.db.execute(`select actor_type,actor_id from da_verified_actor_binding where id=? and person_id=?`,[id,s.person_id]);if(initial.length!==1)throw new IdentityAccessDenied()
    await this.db.execute(`select pg_advisory_xact_lock(hashtext('da-actor-link'),hashtext(?))`,[initial[0].actor_type+':'+initial[0].actor_id])
    const rows=await this.db.execute(`select * from da_verified_actor_binding where id=? and person_id=? and revoked_at is null for update`,[id,s.person_id]);if(rows.length!==1)throw new IdentityAccessDenied();const b=rows[0]
    const logins=await this.db.execute(`select auth_identity_id from da_login_binding where person_id=? and revoked_at is null and (auth_identity_id=? or (actor_type=? and actor_id=?))`,[s.person_id,b.auth_identity_id,b.actor_type,b.actor_id])
    // This slice never unlinks a sign-in identity (including the last one).
    if(logins.length||b.auth_identity_id===s.auth_identity_id)throw new IdentityAccessDenied()
    await this.db.execute(`update da_verified_actor_binding set revoked_at=clock_timestamp() where id=?`,[id])
    await this.db.execute(`update da_actor_credential set retired_at=clock_timestamp() where binding_id=? and retired_at is null`,[id])
    await this.audit(s,'identity.actor_unlinked',id,{actor_type:b.actor_type,actor_id:b.actor_id})
    return {unlinked:true}
  }
}
