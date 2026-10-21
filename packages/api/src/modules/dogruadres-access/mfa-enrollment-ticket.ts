import { randomUUID } from "node:crypto"
import { IdentityAccessDenied, IdentitySessions, digest, opaque, type SecuritySql } from "./identity-session"

/**
 * Server-owned, short-lived setup ticket. NOT a native MFA credential, login
 * session, authentication bypass, or grant to Person/Organization/Platform.
 * All methods must run inside ONE Foundation transaction manager.
 *
 * Only invoke beginAfterPasswordProof AFTER a fresh, real Medusa emailpass
 * verification for this exact current session's AuthIdentity.
 * Only invoke completeAfterNativeVerification AFTER Medusa verifyAuthMfa
 * returned an ENABLED factor for that same AuthIdentity and ticket.factor_id.
 * These proofs are the responsibility of the route/service orchestration.
 */
export class MfaEnrollmentTickets {
  constructor(private readonly db: SecuritySql) {}

  private async audit(session: {person_id:string;actor_type:string;actor_id:string}, action:string, target:string) {
    const id="daaud_"+randomUUID()
    await this.db.execute(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,action,module,resource,target_id,occurred_at,created_at,updated_at)
      values (?,?,?,?,?,'dogruadres-access','mfa-enrollment',?,clock_timestamp(),now(),now())`,
      [id,session.person_id,session.actor_type,session.actor_id,action,target])
    await this.db.execute("insert into da_security_outbox(id,audit_event_id,created_at) values (?,?,now())",
      [randomUUID(),id])
  }

  async beginAfterPasswordProof(browserToken:string, authIdentityId:string, factorId:string) {
    if(typeof factorId!=="string"||factorId.length<1||factorId.length>128||
       typeof authIdentityId!=="string"||!authIdentityId)throw new IdentityAccessDenied()
    const session=await new IdentitySessions(this.db).enrollment(browserToken)
    if(!session||session.auth_identity_id!==authIdentityId)return null
    // current() locked this browser session and Person epoch for the transaction.
    // Replacement is atomic; at most one unconsumed intent per browser session.
    await this.db.execute(`update da_mfa_enrollment_intent set revoked_at=clock_timestamp()
      where session_id=? and consumed_at is null and revoked_at is null`,[session.id])
    const ticket=opaque()
    await this.db.execute(`insert into da_mfa_enrollment_intent
      (id,session_id,person_id,auth_identity_id,factor_id,expires_at)
      values (?,?,?,?,?,clock_timestamp()+interval '5 minutes')`,
      [digest(ticket),session.id,session.person_id,authIdentityId,factorId])
    await this.audit(session,"mfa.enrollment.started",session.id)
    return {ticket}
  }

  /** One attempt is charged even when the native TOTP verification fails. */
  async claimVerificationAttempt(browserToken:string, ticket:string) {
    if(!/^[A-Za-z0-9_-]{43}$/.test(ticket))return null
    const session=await new IdentitySessions(this.db).enrollment(browserToken)
    if(!session)return null
    const rows=await this.db.execute(`update da_mfa_enrollment_intent
      set attempts=attempts+1 where id=? and session_id=? and person_id=?
      and auth_identity_id=? and consumed_at is null and revoked_at is null
      and expires_at>clock_timestamp() and attempts<5
      returning auth_identity_id,factor_id,attempts`,
      [digest(ticket),session.id,session.person_id,session.auth_identity_id])
    if(rows.length!==1)return null
    return {auth_identity_id:session.auth_identity_id,factor_id:rows[0].factor_id}
  }

  async completeAfterNativeVerification(browserToken:string,ticket:string,factorId:string,verifiedAt:Date) {
    if(!/^[A-Za-z0-9_-]{43}$/.test(ticket)||typeof factorId!=="string"||!factorId||
       !(verifiedAt instanceof Date)||!Number.isFinite(verifiedAt.getTime())||
       verifiedAt.getTime()>Date.now())return null
    const sessions=new IdentitySessions(this.db)
    const session=await sessions.enrollment(browserToken)
    if(!session)return null
    const rows=await this.db.execute(`update da_mfa_enrollment_intent
      set consumed_at=clock_timestamp() where id=? and session_id=? and person_id=?
      and auth_identity_id=? and factor_id=? and consumed_at is null
      and revoked_at is null and expires_at>clock_timestamp() and attempts between 1 and 5
      returning id`,
      [digest(ticket),session.id,session.person_id,session.auth_identity_id,factorId])
    if(rows.length!==1)return null
    const fresh=await sessions.create(session.auth_identity_id,verifiedAt,"full")
    await this.db.execute(`update da_browser_session set status='revoked'
      where person_id=? and id<>? and status='active'`,[session.person_id,digest(fresh.token)])
    await this.audit(session,"mfa.enrollment.completed",session.id)
    return fresh
  }
}
