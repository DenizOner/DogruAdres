/// <reference lib="es2022.intl" />
import type { Context } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { hasRecentMfaProof } from "./mfa-management"
import {
  IdentitySessions,
  securitySql,
  type SecuritySql,
  IdentityAccessDenied,
} from "./identity-session"
import { MfaPersistence, type MfaAuditActor } from "./mfa-persistence"
import { MfaEnrollmentTickets } from "./mfa-enrollment-ticket"
import { resolveMfaPolicy, type MfaPlatformMode } from "./mfa-policy"

export class NativeMfaOperations {
  constructor(
    private db: SecuritySql,
    private sharedContext: Context
  ) {}

  async personalBeginMfaEnrollment(token:string,authIdentityId:string,factorId:string,context:Context={}) {
    const sql=securitySql(context.transactionManager)
    // Session/Person lock comes FIRST, matching staff policy-change lock order.
    // Taking the platform advisory lock first could deadlock against a staff
    // update that already holds this same browser session lock.
    if(!await new IdentitySessions(sql).enrollment(token))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    if((await new MfaPersistence(sql).readPlatformPolicy()).platform_mode==="disabled")return null
    return new MfaEnrollmentTickets(sql).beginAfterPasswordProof(token,authIdentityId,factorId)
  }

  async personalRevokePendingMfaEnrollment(token:string,factorId:string,context:Context={}) {
    const sql=securitySql(context.transactionManager)
    if(!await new IdentitySessions(sql).enrollment(token))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    if((await new MfaPersistence(sql).readPlatformPolicy()).platform_mode==="disabled")return null
    return new MfaEnrollmentTickets(sql).revokePendingFactor(token,factorId)
  }

  async personalClaimMfaVerification(token:string,ticket:string,context:Context={}) {
    const sql=securitySql(context.transactionManager)
    // Session/Person lock comes FIRST, matching staff policy-change lock order.
    // Taking the platform advisory lock first could deadlock against a staff
    // update that already holds this same browser session lock.
    if(!await new IdentitySessions(sql).enrollment(token))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    if((await new MfaPersistence(sql).readPlatformPolicy()).platform_mode==="disabled")return null
    return new MfaEnrollmentTickets(sql).claimVerificationAttempt(token,ticket)
  }

  async personalCompleteMfaEnrollment(token:string,ticket:string,factorId:string,context:Context={}) {
    const sql=securitySql(context.transactionManager)
    // Session/Person lock comes FIRST, matching staff policy-change lock order.
    // Taking the platform advisory lock first could deadlock against a staff
    // update that already holds this same browser session lock.
    if(!await new IdentitySessions(sql).enrollment(token))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    if((await new MfaPersistence(sql).readPlatformPolicy()).platform_mode==="disabled")return null
    return new MfaEnrollmentTickets(sql).completeAfterNativeVerification(token,ticket,factorId,new Date())
  }

  async personalMfaSettings(token: string, context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    const sessions = new IdentitySessions(sql)
    const session = await sessions.current(token)
    if (!session) return null
    const store = new MfaPersistence(sql)
    const platform = await store.readPlatformPolicy()
    const personal = await store.readPersonPreference(session.person_id)
    const platformGrant = await sessions.staff(token, "security.mfa.manage", "platform")
    return {
      platform, personal,
      can_manage_platform: !!platformGrant,
      // Exact AuthIdentity native factor status is NOT inferred from preference.
      native_factor_state: "unverified" as const,
    }
  }

  async personalSetMfaPreference(token: string, enabled: boolean, expectedVersion: number, context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    const sessions = new IdentitySessions(sql)
    const session = await sessions.current(token, true)
    if (!session) return null
    const store = new MfaPersistence(sql)
    const policy = await store.readPlatformPolicy()
    if (policy.platform_mode !== "optional") return null
    const actor: MfaAuditActor = {
      person_id: session.person_id,
      actor_type: session.actor_type as MfaAuditActor["actor_type"],
      actor_id: session.actor_id,
    }
    return store.setPersonPreference(session.person_id, enabled, expectedVersion, actor)
  }

  /** Recovery codes are audited in their Foundation transaction. Native
   * factor disable is only reachable after separate committed revocation. */
  async personalManageNativeMfa(token:string,action:"recovery_codes"|"disable",operation:(identityId:string)=>Promise<unknown>,context:Context={}) {
    if(action!=="recovery_codes")return null // Closed obsolete pre-commit disable path.
    const sql=securitySql(context.transactionManager),sessions=new IdentitySessions(sql)
    const session=await sessions.current(token,true)
    if(!session)return null
    const [limits]=await sql.execute("select recent_auth_seconds from da_session_policy where id='current'")
    if(!hasRecentMfaProof(session,limits?.recent_auth_seconds))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    const store=new MfaPersistence(sql)
    await store.readPlatformPolicy()
    const actor={person_id:session.person_id,actor_type:session.actor_type as MfaAuditActor["actor_type"],actor_id:session.actor_id}
    const result=await operation(session.auth_identity_id)
    await store.recordNativeMfaAction(actor,"mfa.recovery_codes_generated")
    return {result,sessions_revoked:false}
  }

  /** Foundation revocation and mandatory audit/outbox COMMIT before native
   * factor disable. Failure leaves the native factor unchanged and the
   * strongly-authenticated browser session in its original state. */
  async personalPrepareNativeMfaDisable(token:string,context:Context={}) {
    const sql=securitySql(context.transactionManager),sessions=new IdentitySessions(sql)
    const session=await sessions.current(token,true)
    if(!session)return null
    const [limits]=await sql.execute("select recent_auth_seconds from da_session_policy where id='current'")
    if(!hasRecentMfaProof(session,limits?.recent_auth_seconds))return null
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    const store=new MfaPersistence(sql),policy=await store.readPlatformPolicy()
    if(policy.platform_mode==="required")return null
    const personal=await store.readPersonPreference(session.person_id)
    await sessions.logout(token,true)
    // Optional preference is a separate audited Foundation row in this same
    // precommit. In disabled mode the saved preference must be preserved.
    if(policy.platform_mode==="optional"&&personal.user_enabled)
      await store.setPersonPreference(session.person_id,false,personal.version,{
        person_id:session.person_id,actor_type:session.actor_type as MfaAuditActor["actor_type"],actor_id:session.actor_id
      })
    return {session_id:session.id,person_id:session.person_id,auth_identity_id:session.auth_identity_id,
      actor_type:session.actor_type as MfaAuditActor["actor_type"],actor_id:session.actor_id}
  }

  /** A second Foundation transaction holds the SAME policy advisory lock
   * as setPlatformPolicy across the native Medusa operation. The first
   * committed Person session/epoch revocation can never be rolled back
   * by a native write or completion-audit failure. */
  async personalCompletePreparedNativeMfaDisable(
    prepared:Readonly<{session_id:string;person_id:string;auth_identity_id:string;actor_type:MfaAuditActor["actor_type"];actor_id:string}>,
    operation:(identityId:string)=>Promise<unknown>,
    context:Context={}
  ) {
    const sql=securitySql(context.transactionManager)
    // Lock the Person epoch BEFORE the shared policy lock, matching session
    // creation and staff policy updates. A concurrent full login may commit
    // after preparation but not during native completion.
    const security=await sql.execute(
      "select epoch from da_person_security where person_id=? for update",
      [prepared.person_id])
    if(security.length!==1)throw new IdentityAccessDenied()
    await sql.execute("select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
    const store=new MfaPersistence(sql),policy=await store.readPlatformPolicy()
    if(policy.platform_mode==="required")return null
    const rows=await sql.execute("select s.id from da_browser_session s join da_person_security e on e.person_id=s.person_id where s.id=? and s.person_id=? and s.auth_identity_id=? and s.actor_type=? and s.actor_id=? and s.status='revoked' and e.epoch>s.epoch",
      [prepared.session_id,prepared.person_id,prepared.auth_identity_id,prepared.actor_type,prepared.actor_id])
    if(rows.length!==1)throw new IdentityAccessDenied()
    // If another session was minted after precommit, do NOT disable the native
    // factor and leave that freshly authenticated browser alive. The Person
    // row lock above prevents a further session from racing past this check.
    const newer=await sql.execute(
      "select id from da_browser_session where person_id=? and status='active' and epoch=? limit 1",
      [prepared.person_id,security[0].epoch])
    if(newer.length)return null
    const result=await operation(prepared.auth_identity_id)
    await store.recordNativeMfaAction({
      person_id:prepared.person_id,actor_type:prepared.actor_type,actor_id:prepared.actor_id
    },"mfa.native_factor_disabled")
    return result
  }

  async personalSetPlatformMfaMode(token: string, mode: MfaPlatformMode, expectedVersion: number, context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    const staff = await new IdentitySessions(sql).staff(token, "security.mfa.manage", "platform")
    if (!staff) return null
    const actor: MfaAuditActor = {
      person_id: staff.person_id,
      actor_type: staff.actor_type as MfaAuditActor["actor_type"],
      actor_id: staff.actor_id,
    }
    return new MfaPersistence(sql).setPlatformPolicy(mode, expectedVersion, actor)
  }

}
