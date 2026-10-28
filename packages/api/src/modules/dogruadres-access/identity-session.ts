import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto"
import { generateJwtToken } from "@medusajs/framework/utils"
import { DEFAULT_SESSION_POLICY, evaluateSessionEligibility, parseSessionPolicy } from "./session-policy"

export type SecuritySql = { execute(sql: string, parameters?: unknown[]): Promise<any[]> }
export function securitySql(manager: unknown): SecuritySql {
  if (!manager || typeof manager !== "object" || !("execute" in manager) || typeof manager.execute !== "function") throw new IdentityAccessDenied()
  const execute = manager.execute.bind(manager)
  return { execute: async (sql, parameters) => {
    const rows = await execute(sql,parameters)
    if (!Array.isArray(rows)) throw new IdentityAccessDenied()
    return rows
  } }
}
export const digest = (value: string) => createHash("sha256").update(value).digest("hex")
export const opaque = () => randomBytes(32).toString("base64url")
export function csrfToken(token: string): string {
  const key = process.env.COOKIE_SECRET
  if (!key || Buffer.byteLength(key)<32) throw new IdentityAccessDenied()
  return createHmac("sha256",key).update("dogruadres-csrf:"+token).digest("base64url")
}
export class IdentityAccessDenied extends Error { constructor() { super("Access denied");this.name="IdentityAccessDenied" } }

export const mfaRuntimeEnforced = () =>
  process.env.DOGRUADRES_IDENTITY_ENABLED === "true" &&
  process.env.DOGRUADRES_MFA_SETTINGS_ENABLED === "true" &&
  process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED === "true" &&
  process.env.DOGRUADRES_MFA_RUNTIME_ENABLED === "true"
export type BrowserMfaPurpose = "legacy" | "mfa_enroll" | "full"
type MfaRevision = Readonly<{platform:number;person:number}>
function revision(value:unknown):number {
  if(!Number.isSafeInteger(value) || (value as number)<0 || (value as number)>2147483647)
    throw new IdentityAccessDenied()
  return value as number
}


/** Foundation-owned tables only. Caller MUST supply this module's transaction manager.
 * No email lookup, ambient browser identity, cross-module manager or cached grant.
 */
export class IdentitySessions {
  constructor(private readonly db: SecuritySql) {}

  private async audit(person: string, actorType: string, actorId: string, action: string, target: string) {
    const id = `daaud_${randomUUID()}`
    await this.db.execute(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,action,module,resource,target_id,occurred_at,created_at,updated_at)
      values (?,?,?,?,?,'dogruadres-access','identity-session',?,clock_timestamp(),now(),now())`,
    [id, person, actorType, actorId, action, target])
    await this.db.execute(`insert into da_security_outbox(id,audit_event_id,created_at) values (?,?,now())`, [randomUUID(), id])
    return id
  }

  async create(
    authIdentityId: string,
    strongAt: Date | null = null,
    purpose: BrowserMfaPurpose = "legacy",
    expectedRevision?: MfaRevision
  ) {
    if(mfaRuntimeEnforced() && purpose==="legacy")throw new IdentityAccessDenied()
    if(!["legacy","mfa_enroll","full"].includes(purpose) ||
       (purpose==="legacy" && expectedRevision) ||
       (purpose==="mfa_enroll" && strongAt))throw new IdentityAccessDenied()
    const rows = await this.db.execute(`select b.*,p.disabled_at from da_login_binding b
      join da_person p on p.id=b.person_id and p.deleted_at is null
      join da_actor_mapping a on a.person_id=p.id and a.actor_type=b.actor_type and a.actor_id=b.actor_id and a.deleted_at is null
      where b.auth_identity_id=? and b.revoked_at is null and b.verified_at is not null for update of b,p`, [authIdentityId])
    if (rows.length !== 1 || rows[0].disabled_at) throw new IdentityAccessDenied()
    const b = rows[0]
    await this.db.execute(`insert into da_person_security(person_id,epoch) values (?,0) on conflict do nothing`, [b.person_id])
    const [security] = await this.db.execute(`select epoch from da_person_security where person_id=? for update`, [b.person_id])
    let stamp:MfaRevision|null=null
    if(purpose!=="legacy"){
      stamp=await this.mfaRevision(b.person_id)
      if(expectedRevision && (stamp.platform!==expectedRevision.platform ||
         stamp.person!==expectedRevision.person))throw new IdentityAccessDenied()
    }
    const token = opaque(), csrf = csrfToken(token)
    await this.db.execute(`insert into da_browser_session
      (id,person_id,auth_identity_id,actor_type,actor_id,epoch,csrf_hash,status,created_at,last_activity_at,last_strong_auth_at,mfa_purpose,mfa_platform_version,mfa_person_version)
      values (?,?,?,?,?,?,?,'active',?,?,?,?,?,?)`,
    [digest(token), b.person_id, authIdentityId, b.actor_type, b.actor_id, security.epoch, digest(csrf),
      strongAt??new Date(),strongAt??new Date(),strongAt,purpose,stamp?.platform??null,stamp?.person??null])
    await this.audit(b.person_id,b.actor_type,b.actor_id,"session.created",digest(token))
    return { token, csrf }
  }

  private async mfaRevision(personId:string):Promise<MfaRevision>{
    const rows=await this.db.execute(`select
      coalesce((select version from da_mfa_policy where id='current'),0) as platform,
      coalesce((select version from da_person_mfa_preference where person_id=?),0) as person,
      coalesce((select to_jsonb(q)->>'mfa_activated' from da_session_policy q where q.id='current'),'false') as mfa_activated`,
      [personId])
    // No full / enrollment-only sessions before the DBA-owned immutable
    // activation latch has been explicitly armed in a reviewed rollout.
    if(rows.length!==1 || rows[0].mfa_activated!=="true")throw new IdentityAccessDenied()
    return {platform:revision(rows[0].platform),person:revision(rows[0].person)}
  }
  async current(token: string, sensitive = false, touch = true) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new IdentityAccessDenied()
    return this.currentHash(digest(token),sensitive,touch)
  }
  /**
   * Strict setup-only accessor: never grants Person/Organization/Staff access
   * to mfa_enroll. A normal full session may also enroll another factor
   * after fresh password proof and exact CSRF, without downgrading scope.
   */
  async enrollment(token:string){
    if(!mfaRuntimeEnforced())return null
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new IdentityAccessDenied()
    return this.currentHash(digest(token),false,false,true)
  }
  private async currentHash(hash:string,sensitive=false,touch=true,allowEnrollment=false) {
    const rows = await this.db.execute(`select s.*, p.disabled_at, e.epoch as current_epoch,
      extract(epoch from clock_timestamp())*1000 as now_ms
      from da_browser_session s join da_person p on p.id=s.person_id and p.deleted_at is null
      join da_person_security e on e.person_id=p.id
      join da_login_binding b on b.auth_identity_id=s.auth_identity_id and b.person_id=s.person_id
        and b.actor_type=s.actor_type and b.actor_id=s.actor_id and b.revoked_at is null and b.verified_at is not null
      join da_actor_mapping a on a.person_id=s.person_id and a.actor_type=s.actor_type and a.actor_id=s.actor_id and a.deleted_at is null
      where s.id=? for update of s,e`, [hash])
    if (rows.length !== 1) throw new IdentityAccessDenied()
    const s = rows[0]
    // to_jsonb(q) permits existing protected M0 databases to keep working
    // BEFORE Migration20261022012000 is applied. Once activated, a flag
    // rollback cannot bypass MFA; instead no browser scope is authorized.
    const policies = await this.db.execute(`select q.idle_timeout_seconds,q.absolute_lifetime_seconds,q.recent_auth_seconds,
      coalesce(to_jsonb(q)->>'mfa_activated','false') as mfa_activated
      from da_session_policy q where q.id='current' for share`)
    if (policies.length !== 1) throw new IdentityAccessDenied()
    // Session-policy parser has an intentionally exact three-field contract.
    // The independent, irreversible MFA latch must NEVER be fed into it.
    const policy = parseSessionPolicy({
      idle_timeout_seconds:policies[0].idle_timeout_seconds,
      absolute_lifetime_seconds:policies[0].absolute_lifetime_seconds,
      recent_auth_seconds:policies[0].recent_auth_seconds,
    })
    const result = evaluateSessionEligibility({
      created_at_ms: new Date(s.created_at).getTime(), last_activity_at_ms: new Date(s.last_activity_at).getTime(),
      last_strong_auth_at_ms: s.last_strong_auth_at ? new Date(s.last_strong_auth_at).getTime() : null,
      status: s.status,
    }, policy, Math.floor(Number(s.now_ms)), sensitive)
    if (s.disabled_at || String(s.epoch) !== String(s.current_epoch) || result.session_status === "expired") {
      await this.db.execute(`update da_browser_session set status=case when status='active' then ? else status end where id=?`,
        [result.session_status === "expired" ? "expired" : "revoked",s.id])
      return null // Commit terminal state; throwing would roll it back.
    }
    if (!result.permitted) return null
    const marker=policies[0].mfa_activated
    if(marker!=="true" && marker!=="false")throw new IdentityAccessDenied()
    const activated=marker==="true"
    // Irreversible DB latch and process rollout config must agree. Any
    // downgrade, partial rollout or missing migration DENIES access.
    if(mfaRuntimeEnforced()!==activated)return null
    if(activated){
      if(s.mfa_purpose!=="full" && !(allowEnrollment && s.mfa_purpose==="mfa_enroll"))
        return null
      const now=await this.mfaRevision(s.person_id)
      if(revision(s.mfa_platform_version)!==now.platform ||
         revision(s.mfa_person_version)!==now.person)return null
    }else if(allowEnrollment)return null
    if (touch) await this.db.execute(`update da_browser_session set last_activity_at=clock_timestamp() where id=? and status='active'`, [s.id])
    return { id:s.id, person_id:s.person_id, auth_identity_id:s.auth_identity_id, actor_type:s.actor_type, actor_id:s.actor_id, csrf_hash:s.csrf_hash,
      last_strong_auth_at:s.last_strong_auth_at, now_ms:Math.floor(Number(s.now_ms)),
      mfa_purpose:s.mfa_purpose }
  }

  async logout(token: string, all: boolean, lock = false) {
    if (lock && all) throw new IdentityAccessDenied()
    const s = mfaRuntimeEnforced()
      ? (await this.current(token,false,false)) ?? (await this.enrollment(token))
      : await this.current(token,false,false)
    if (!s) return
    if (all) await this.db.execute(`update da_person_security set epoch=epoch+1 where person_id=?`,[s.person_id])
    await this.db.execute(`update da_browser_session set status='revoked' where status='active' and ${all ? "person_id" : "id"}=?`,[all?s.person_id:s.id])
    const event = await this.audit(s.person_id,s.actor_type,s.actor_id,lock?"session.locked":all?"session.all_revoked":"session.revoked",s.id)
    if (lock) await this.db.execute(`insert into da_notification_receipt(id,person_id,audit_event_id) values (?,?,?)`,
      [`danot_${randomUUID()}`,s.person_id,event])
  }

  async organizations(token: string, organizationId?: string, touch = true) {
    const s = await this.current(token, false, touch)
    if (!s) return null
    // One statement is the observation point L for these Foundation-owned reads.
    const rows = await this.db.execute(`select o.id,o.name,m.id as membership_id,m.role from da_organization o
      join da_organization_membership m on m.organization_id=o.id
      join da_person p on p.id=m.person_id
      join da_browser_session s on s.person_id=p.id and s.id=? and s.status='active'
      join da_person_security e on e.person_id=p.id and e.epoch=s.epoch
      join da_login_binding b on b.auth_identity_id=s.auth_identity_id and b.person_id=p.id and b.actor_type=s.actor_type and b.actor_id=s.actor_id and b.revoked_at is null and b.verified_at is not null
      join da_actor_mapping a on a.person_id=p.id and a.actor_type=s.actor_type and a.actor_id=s.actor_id and a.deleted_at is null
      join da_session_policy q on q.id='current'
      where p.id=? and p.disabled_at is null and p.deleted_at is null and o.status='active' and o.deleted_at is null
      and statement_timestamp()<s.created_at+q.absolute_lifetime_seconds*interval '1 second'
      and statement_timestamp()<s.last_activity_at+q.idle_timeout_seconds*interval '1 second'
      and m.status='active' and m.deleted_at is null ${organizationId ? "and o.id=?" : ""} order by o.id`,
    organizationId ? [s.id,s.person_id,organizationId] : [s.id,s.person_id])
    if (new Set(rows.map(r=>r.id)).size !== rows.length || (organizationId && rows.length !== 1)) return null
    return { person_id:s.person_id, organizations: rows }
  }

  async staff(token: string, task: string, resource: string) {
    const s = await this.current(token, true)
    if (!s) return null
    const rows = await this.db.execute(`select g.id from da_platform_staff_grant g join da_person p on p.id=g.person_id
      join da_browser_session s on s.person_id=p.id and s.id=? and s.status='active'
      join da_person_security e on e.person_id=p.id and e.epoch=s.epoch
      join da_login_binding b on b.auth_identity_id=s.auth_identity_id and b.person_id=p.id and b.actor_type=s.actor_type and b.actor_id=s.actor_id and b.revoked_at is null and b.verified_at is not null
      join da_actor_mapping a on a.person_id=p.id and a.actor_type=s.actor_type and a.actor_id=s.actor_id and a.deleted_at is null
      join da_session_policy q on q.id='current'
      where g.person_id=? and g.task=? and g.resource=? and g.revoked_at is null
      and statement_timestamp()<s.created_at+q.absolute_lifetime_seconds*interval '1 second'
      and statement_timestamp()<s.last_activity_at+q.idle_timeout_seconds*interval '1 second'
      and s.last_strong_auth_at is not null and statement_timestamp()<s.last_strong_auth_at+q.recent_auth_seconds*interval '1 second'
      and p.disabled_at is null and p.deleted_at is null and (g.expires_at is null or g.expires_at>clock_timestamp())`,
    [s.id,s.person_id,task,resource])
    return rows.length === 1 ? {...s,grant_id:rows[0].id} : null
  }

  async pending(authIdentityId:string, challengeId:string) {
    const token=opaque()
    await this.db.execute(`insert into da_login_challenge(id,auth_identity_id,challenge_id,expires_at) values (?,?,?,clock_timestamp()+interval '5 minutes')`,[digest(token),authIdentityId,challengeId])
    return {token,csrf:csrfToken(token)}
  }
  async renewNative(token:string,identity:{id:string;app_metadata?:Record<string,unknown>},http:Parameters<typeof generateJwtToken>[1]) {
    // current() locks the session and Person epoch for the entire module
    // transaction. Concurrent renewal/logout cannot install an unbound token.
    const s=await this.current(token,false,false)
    if(!s)return null // Preserve any terminal expiry written by current().
    if(identity.id!==s.auth_identity_id || identity.app_metadata?.[s.actor_type+"_id"]!==s.actor_id)throw new IdentityAccessDenied()
    const rows=await this.db.execute(`select token_hash,expires_at from da_native_credential where session_id=? and retired_at is null`,[s.id])
    if(rows.length>1)throw new IdentityAccessDenied()
    if(rows.length===1 && new Date(rows[0].expires_at).getTime()>s.now_ms+60000)return {renewed:false}
    const key=process.env.COOKIE_SECRET
    if(!key || Buffer.byteLength(key)<32)throw new IdentityAccessDenied()
    const issuedAt=Math.floor(s.now_ms/1000),expiresAt=issuedAt+900
    // Never carry a caller-supplied duration, iat or strong-auth claim forward.
    const jwt=generateJwtToken({jti:randomUUID(),iat:issuedAt,actor_id:s.actor_id,actor_type:s.actor_type,
      auth_identity_id:s.auth_identity_id,auth_provider:"emailpass",app_metadata:identity.app_metadata,
      mfa_enabled:!!s.last_strong_auth_at,mfa_challenge_completed_at:s.last_strong_auth_at?new Date(s.last_strong_auth_at).toISOString():null},
      {...http,expiresIn:900,jwtOptions:{...http.jwtOptions,expiresIn:900}})
    const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",createHash("sha256").update("native-credential:"+key).digest(),iv)
    const value=Buffer.concat([cipher.update(jwt,"utf8"),cipher.final()])
    const ciphertext=[iv,cipher.getAuthTag(),value].map(b=>b.toString("base64url")).join(".")
    await this.db.execute(`update da_native_credential set retired_at=clock_timestamp() where session_id=? and retired_at is null`,[s.id])
    await this.db.execute(`insert into da_native_credential(token_hash,session_id,ciphertext,expires_at) values (?,?,?,?)`,[digest(jwt),s.id,ciphertext,new Date(expiresAt*1000)])
    return {renewed:true} // No actor credential crosses the API response boundary.
  }
  async native(tokenHash:string) {
    if(!/^[a-f0-9]{64}$/.test(tokenHash))return null
    const rows=await this.db.execute(`select session_id from da_native_credential where token_hash=? and retired_at is null and expires_at>clock_timestamp()`,[tokenHash])
    if(rows.length===0){
      const delegated=await this.db.execute(`select c.session_id from da_actor_credential c where c.token_hash=? and c.retired_at is null and c.expires_at>clock_timestamp()`,[tokenHash])
      if(delegated.length!==1)return null
      const session=await this.currentHash(delegated[0].session_id)
      if(!session)return null
      const current=await this.db.execute(`select b.actor_type,b.actor_id from da_actor_credential c join da_verified_actor_binding b on b.id=c.binding_id and b.person_id=? and b.revoked_at is null join da_actor_mapping a on a.person_id=b.person_id and a.actor_type=b.actor_type and a.actor_id=b.actor_id and a.deleted_at is null where c.token_hash=? and c.session_id=? and c.retired_at is null and c.expires_at>clock_timestamp()`,[session.person_id,tokenHash,session.id])
      return current.length===1?{...session,actor_type:current[0].actor_type,actor_id:current[0].actor_id}:null
    }
    if(rows.length!==1)return null
    const session=await this.currentHash(rows[0].session_id)
    if(!session)return null
    // currentHash may have waited behind renewal/logout. Re-read after its
    // session/epoch lock; a retired credential cannot regain authority from the
    // earlier unlocked ledger observation. Rotation takes this same lock.
    const current=await this.db.execute(`select token_hash from da_native_credential where token_hash=? and session_id=? and retired_at is null and expires_at>clock_timestamp()`,[tokenHash,session.id])
    return current.length===1?session:null
  }
  async challenge(token:string) {
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null
    const rows=await this.db.execute(`select auth_identity_id,challenge_id from da_login_challenge where id=? and consumed_at is null and expires_at>clock_timestamp()`,[digest(token)])
    return rows.length===1?rows[0]:null
  }
  async complete(token:string,completedAt:Date) {
    const rows=await this.db.execute(`update da_login_challenge set consumed_at=clock_timestamp() where id=? and consumed_at is null and expires_at>clock_timestamp() returning auth_identity_id`,[digest(token)])
    if(rows.length!==1 || !Number.isFinite(completedAt.getTime()) || completedAt.getTime()>Date.now())throw new IdentityAccessDenied()
    return this.create(rows[0].auth_identity_id,completedAt,
      mfaRuntimeEnforced()?"full":"legacy")
  }
}

export { DEFAULT_SESSION_POLICY }
