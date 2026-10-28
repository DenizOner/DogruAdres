import { randomUUID } from 'node:crypto'
import { IdentityAccessDenied, IdentitySessions, type SecuritySql } from './identity-session'

/** Foundation-owned projection, not the email delivery store. Never serialize audit data. */
export class PersonalNotifications {
  constructor(private readonly db: SecuritySql) {}

  private async authorize(token: string, organization?: string) {
    const sessions = new IdentitySessions(this.db)
    const session = await sessions.current(token)
    if (!session) throw new IdentityAccessDenied()
    if (organization && !(await sessions.organizations(token, organization))?.organizations.length)
      throw new IdentityAccessDenied()
    return session
  }

  async list(token: string, offset = 0, organization?: string) {
    const s = await this.authorize(token, organization)
    const rows = await this.db.execute(`with authorized as (select n.id,n.created_at,n.read_at
      from da_notification_receipt n join da_audit_event a on a.id=n.audit_event_id
      where n.person_id=? and a.actor_person_id=n.person_id and a.action='session.locked'
        and a.module='dogruadres-access' and a.resource='identity-session'
        and a.organization_id is null and a.deleted_at is null
        and exists(select 1 from da_security_outbox o where o.audit_event_id=a.id)
      ) select (select count(*) from authorized where read_at is null) as unread_count,
        (select count(*) from authorized) as total,
        coalesce((select json_agg(page) from (select id,created_at,read_at from authorized
          order by created_at desc,id desc limit 50 offset ?) page),'[]'::json) as items`, [s.person_id,offset])
    // One consistent statement for page/count; no audit fields leave this method.
    return {
      notifications: rows[0].items.map((n: {id:string;created_at:string;read_at:string|null}) => ({
        id: n.id, created_at: n.created_at, read_at: n.read_at,
        title: 'Oturum kilitlendi', context: 'Kişisel hesabınız',
        description: 'Bir tarayıcı oturumunuz kilitlendi. Yeniden açmak için giriş yapabilirsiniz.',
      })),
      unread_count: Number(rows[0]?.unread_count ?? 0),
      next_offset: offset + 50 < Number(rows[0].total) ? offset + 50 : null,
    }
  }

  async read(token: string, id: string, organization?: string) {
    const s = await this.authorize(token, organization)
    const rows = await this.db.execute(`select n.id,n.read_at from da_notification_receipt n
      join da_audit_event a on a.id=n.audit_event_id
      where n.id=? and n.person_id=? and a.actor_person_id=n.person_id
        and a.action='session.locked' and a.module='dogruadres-access'
        and a.resource='identity-session' and a.organization_id is null and a.deleted_at is null
        and exists(select 1 from da_security_outbox o where o.audit_event_id=a.id)
      for update of n`, [id, s.person_id])
    if (rows.length !== 1) throw new IdentityAccessDenied()
    if (rows[0].read_at === null) {
      await this.db.execute(`update da_notification_receipt set read_at=clock_timestamp() where id=?`, [id])
      const audit = `daaud_${randomUUID()}`
      await this.db.execute(`insert into da_audit_event
        (id,actor_person_id,actor_type,actor_id,action,module,resource,target_id,occurred_at,created_at,updated_at)
        values (?,?,?,?,'notification.read','dogruadres-access','personal-notification',?,clock_timestamp(),now(),now())`,
      [audit,s.person_id,s.actor_type,s.actor_id,id])
      await this.db.execute(`insert into da_security_outbox(id,audit_event_id,created_at) values (?,?,now())`,[randomUUID(),audit])
    }
    return { success: true }
  }
}
