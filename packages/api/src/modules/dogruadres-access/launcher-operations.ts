/// <reference lib="es2022.intl" />
import { randomUUID } from "node:crypto"
import type { Context } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import {
  IdentitySessions,
  securitySql,
  isCurrentProtectedOwner,
  IdentityAccessDenied,
  type SecuritySql,
} from "./identity-session"
import { CompanyLauncherConflict, companyLauncherAvailable, companyLauncherProject, companyLauncherValidate } from "./company-launcher"
import { PlatformLauncherConflict, platformLauncherAvailable, platformLauncherProject, platformLauncherValidate } from "./platform-launcher"

export class LauncherOperations {
  constructor(
    _db: SecuritySql,
    private readablePersonalOrganizations: (token: string, organizationId: string | undefined, touch: boolean, context: Context) => Promise<any>,
    _sharedContext: Context
  ) {}

  private readablePersonalOrganizations_(token: string, organizationId: string | undefined, touch: boolean, context: Context) {
    return this.readablePersonalOrganizations(token, organizationId, touch, context)
  }

  async personalCompanyLauncher(
    token:string,org:string,context:Context={}
  ){
    const actor=await this.companyLauncherActor_(token,org,context)
    if(!actor)return null
    const db=securitySql(context.transactionManager)
    const rows=await db.execute(`select app_ids,collapsed_ids,version from da_company_launcher_preference
      where person_id=? and organization_id=?`,
      [actor.person_id,org]) as Array<{app_ids:unknown;collapsed_ids:unknown;version:unknown}>
    if (rows.length>1)throw new IdentityAccessDenied()
    return {organization_id:org,...companyLauncherProject(
      rows[0]??null,companyLauncherAvailable(actor.role))}
  }

  async personalSaveCompanyLauncher(
    token:string,input:{organization:string;app_ids:string[];
      collapsed_ids:string[];expected_version:number},
    context:Context={}
  ){
    const actor=await this.companyLauncherActor_(token,input.organization,context)
    if(!actor)return null
    const db=securitySql(context.transactionManager)
    const allowed=companyLauncherAvailable(actor.role)
    const preference=companyLauncherValidate(
      input.app_ids,input.collapsed_ids,input.expected_version,allowed)
    let saved: Array<{app_ids:unknown;collapsed_ids:unknown;version:unknown}>
    if (preference.expected_version===0) {
      saved=await db.execute(`insert into da_company_launcher_preference
        (id,person_id,organization_id,app_ids,collapsed_ids,version,updated_at)
        values(?,?,?,?,?,1,clock_timestamp())
        on conflict(person_id,organization_id) do nothing
        returning app_ids,collapsed_ids,version`,
        [randomUUID(),actor.person_id,input.organization,
          JSON.stringify(preference.app_ids),JSON.stringify(preference.collapsed_ids)])
    } else {
      saved=await db.execute(`update da_company_launcher_preference
        set app_ids=?,collapsed_ids=?,version=version+1,updated_at=clock_timestamp()
        where person_id=? and organization_id=? and version=?
        returning app_ids,collapsed_ids,version`,
        [JSON.stringify(preference.app_ids),JSON.stringify(preference.collapsed_ids),
          actor.person_id,input.organization,preference.expected_version])
    }
    if(saved.length!==1)throw new CompanyLauncherConflict()
    return {organization_id:input.organization,
      ...companyLauncherProject(saved[0],allowed)}
  }

  private async platformLauncherActor_(
    token: string, context: Context
  ): Promise<{ person_id: string; tasks: string[] } | null> {
    const db = securitySql(context.transactionManager)
    const session = await new IdentitySessions(db).current(token, true)
    if (!session) return null
    const rows = await db.execute(`select distinct g.task from da_platform_staff_grant g
      join da_person p on p.id=g.person_id
      join da_browser_session s on s.person_id=p.id and s.id=? and s.status='active'
      join da_person_security e on e.person_id=p.id and e.epoch=s.epoch
      join da_login_binding b on b.auth_identity_id=s.auth_identity_id and b.person_id=p.id and b.actor_type=s.actor_type and b.actor_id=s.actor_id and b.revoked_at is null and b.verified_at is not null
      join da_actor_mapping a on a.person_id=p.id and a.actor_type=s.actor_type and a.actor_id=s.actor_id and a.deleted_at is null
      join da_session_policy q on q.id='current'
      where g.person_id=? and g.resource='platform' and g.revoked_at is null
      and statement_timestamp()<s.created_at+q.absolute_lifetime_seconds*interval '1 second'
      and statement_timestamp()<s.last_activity_at+q.idle_timeout_seconds*interval '1 second'
      and s.last_strong_auth_at is not null and statement_timestamp()<s.last_strong_auth_at+q.recent_auth_seconds*interval '1 second'
      and p.disabled_at is null and p.deleted_at is null and (g.expires_at is null or g.expires_at>clock_timestamp())`,
      [session.id, session.person_id]) as Array<{ task: string }>
    return { person_id: session.person_id, tasks: rows.map(r => r.task) }
  }

  async personalPlatformLauncher(
    token: string, context: Context = {}
  ) {
    const actor = await this.platformLauncherActor_(token, context)
    if (!actor) return null
    const allowed = platformLauncherAvailable(actor.tasks)
    if (!allowed.length) return null
    const db = securitySql(context.transactionManager)
    const rows = await db.execute(`select app_ids,collapsed_ids,version from da_platform_launcher_preference
      where person_id=?`,
      [actor.person_id]) as Array<{ app_ids: unknown; collapsed_ids: unknown; version: unknown }>
    if (rows.length > 1) throw new IdentityAccessDenied()
    return platformLauncherProject(rows[0] ?? null, allowed)
  }

  async personalSavePlatformLauncher(
    token: string, input: { app_ids: string[]; collapsed_ids: string[]; expected_version: number },
    context: Context = {}
  ) {
    const actor = await this.platformLauncherActor_(token, context)
    if (!actor) return null
    const allowed = platformLauncherAvailable(actor.tasks)
    if (!allowed.length) return null
    const db = securitySql(context.transactionManager)
    const preference = platformLauncherValidate(
      input.app_ids, input.collapsed_ids, input.expected_version, allowed)
    let saved: Array<{ app_ids: unknown; collapsed_ids: unknown; version: unknown }>
    if (preference.expected_version === 0) {
      saved = await db.execute(`insert into da_platform_launcher_preference
        (id,person_id,app_ids,collapsed_ids,version,updated_at)
        values(?,?,?,?,1,clock_timestamp())
        on conflict(person_id) do nothing
        returning app_ids,collapsed_ids,version`,
        [randomUUID(), actor.person_id,
          JSON.stringify(preference.app_ids), JSON.stringify(preference.collapsed_ids)])
    } else {
      saved = await db.execute(`update da_platform_launcher_preference
        set app_ids=?,collapsed_ids=?,version=version+1,updated_at=clock_timestamp()
        where person_id=? and version=?
        returning app_ids,collapsed_ids,version`,
        [JSON.stringify(preference.app_ids), JSON.stringify(preference.collapsed_ids),
          actor.person_id, preference.expected_version])
    }
    if (saved.length !== 1) throw new PlatformLauncherConflict()
    return platformLauncherProject(saved[0], allowed)
  }

  // ---------------------------------------------------------------------------
  // B20: per-Person persistent launcher preference
  // ---------------------------------------------------------------------------
  // Retain historic B20 app IDs non-destructively. B22 deprecates
  // the vendor app as a separate end-user commercial panel. Only public
  // catalog discovery is shown by launcher GET at present.
  // A stored preference is not a commercial permission or Store entitlement.
  static readonly KNOWN_APP_IDS: ReadonlySet<string> = new Set(['storefront', 'vendor'])

  async getLauncherPreference(token: string, context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    const session = await new IdentitySessions(sql).current(token)
    if (!session) return null
    const rows = await sql.execute(
      `select app_ids,collapsed_ids,version from da_launcher_preference where person_id=?`,
      [session.person_id]
    ) as Array<{app_ids: unknown; collapsed_ids: unknown; version: number}>
    const row = rows[0]
    const parseJsonb = (v: unknown): string[] => {
      if (Array.isArray(v)) return v as string[]
      if (typeof v === 'string') { try { return JSON.parse(v) } catch { return [] } }
      return []
    }
    return {
      person_id: session.person_id,
      app_ids: row ? parseJsonb(row.app_ids) : [],
      collapsed_ids: row ? parseJsonb(row.collapsed_ids) : [],
      version: row ? row.version : 0,
    }
  }

  async saveLauncherPreference(
    token: string,
    rawAppIds: string[],
    rawCollapsedIds: string[],
    expectedVersion: number,
    context: Context = {}
  ) {
    const sql = securitySql(context.transactionManager)
    const session = await new IdentitySessions(sql).current(token, true)
    if (!session) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, 'Session required')
    const known = LauncherOperations.KNOWN_APP_IDS
    const seen = new Set<string>()
    const appIds = rawAppIds.filter(id => {
      if (typeof id !== 'string' || !known.has(id) || seen.has(id)) return false
      seen.add(id); return true
    })
    const collSeen = new Set<string>()
    const collapsedIds = rawCollapsedIds.filter(id => {
      if (typeof id !== 'string' || !known.has(id) || collSeen.has(id)) return false
      collSeen.add(id); return true
    })
    if (expectedVersion < 0 || !Number.isInteger(expectedVersion)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Invalid version')
    }
    const personId = session.person_id
    if (expectedVersion === 0) {
      await sql.execute(
        `insert into da_launcher_preference(id,person_id,app_ids,collapsed_ids,version,updated_at)
         values(?,?,?,?,1,now())
         on conflict(person_id) do nothing`,
        [randomUUID(), personId, JSON.stringify(appIds), JSON.stringify(collapsedIds)]
      )
      const stored = await sql.execute(
        `select app_ids,collapsed_ids,version from da_launcher_preference where person_id=?`,
        [personId]
      ) as Array<{app_ids: unknown; collapsed_ids: unknown; version: number}>
      const pa = (v: unknown): string[] => Array.isArray(v) ? v as string[] : typeof v==='string' ? (() => { try { return JSON.parse(v) } catch { return [] } })() : []
      return { app_ids: pa(stored[0].app_ids), collapsed_ids: pa(stored[0].collapsed_ids), version: stored[0].version }
    }
    const updated = await sql.execute(
      `update da_launcher_preference
         set app_ids=?,collapsed_ids=?,version=version+1,updated_at=now()
         where person_id=? and version=?
         returning app_ids,collapsed_ids,version`,
      [JSON.stringify(appIds), JSON.stringify(collapsedIds), personId, expectedVersion]
    ) as Array<{app_ids: unknown; collapsed_ids: unknown; version: number}>
    if (!updated.length) {
      throw new MedusaError(MedusaError.Types.CONFLICT, 'Launcher preference version conflict — reload and retry')
    }
    const pu2 = (v: unknown): string[] => Array.isArray(v) ? v as string[] : typeof v==='string' ? (() => { try { return JSON.parse(v) } catch { return [] } })() : []
    return { app_ids: pu2(updated[0].app_ids), collapsed_ids: pu2(updated[0].collapsed_ids), version: updated[0].version }
  }

  private async companyLauncherActor_(
    token: string, org: string, context: Context
  ): Promise<{person_id:string;role:string}|null> {
    if (!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(org)) throw new IdentityAccessDenied()
    const decision = await this.readablePersonalOrganizations_(token,org,true,context)
    if (!decision || decision.organizations.length !== 1) return null
    const candidate=decision.organizations[0]
    const db=securitySql(context.transactionManager)
    const rows=await db.execute(`select m.id,m.role from da_organization_membership m
      join da_organization o on o.id=m.organization_id
      join da_person p on p.id=m.person_id
      where m.id=? and m.person_id=? and m.organization_id=? and
        m.status='active' and m.revoked_at is null and m.deleted_at is null and
        o.status='active' and o.deleted_at is null and
        p.disabled_at is null and p.deleted_at is null
      for share of m,o`,
      [candidate.membership_id,decision.person_id,org])
    if (rows.length !== 1 || rows[0].role !== candidate.role) return null
    if (candidate.role==="owner" &&
       !await isCurrentProtectedOwner(db,decision.person_id,org))return null
    return {person_id:decision.person_id,role:candidate.role}
  }
}
