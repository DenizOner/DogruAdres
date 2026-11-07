import { randomUUID } from 'node:crypto'
import { IdentityAccessDenied, IdentitySessions, type SecuritySql } from './identity-session'

/** Foundation-owned per-Person projection. Never serialize staff audit payloads. */
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
    // Session-lock receipts are personal. Company-policy receipts require a
    // CURRENT protected Owner of the exact legal Organization, not the staff
    // actor who wrote the source audit or any native SellerMember role.
    const rows = await this.db.execute(`with authorized as (
      select n.id,n.created_at,n.read_at,a.action,o.name as organization_name
      from da_notification_receipt n
      join da_audit_event a on a.id=n.audit_event_id
      left join da_organization o on o.id=a.organization_id
      where n.person_id=? and a.deleted_at is null and a.module='dogruadres-access'
      and (
        (a.action='session.locked' and a.actor_person_id=n.person_id
          and a.resource='identity-session' and a.organization_id is null
          and exists(select 1 from da_security_outbox x where x.audit_event_id=a.id))
        or
        (a.action in ('organization.store_application_right_enabled',
                      'organization.store_application_right_disabled')
          and a.resource='organization'
          and (?='' or a.organization_id=?)
          and o.status='active' and o.deleted_at is null
          and exists(select 1 from da_organization_membership m
            where m.person_id=n.person_id and m.organization_id=a.organization_id
              and m.status='active' and m.deleted_at is null
              and m.role='owner' and m.protected_owner=true)
          and exists(select 1 from da_audit_outbox x
            where x.source_audit_event_id=a.id))
        or
        (a.action in ('organization.store_draft_permission_granted',
                      'organization.store_draft_permission_revoked')
          and a.resource='store-draft-permission'
          and a.target_id=n.person_id
          and (?='' or a.organization_id=?)
          and o.status='active' and o.deleted_at is null
          and exists(select 1 from da_organization_membership m
            where m.person_id=n.person_id and m.organization_id=a.organization_id
              and m.role='member' and m.status='active'
              and m.revoked_at is null and m.deleted_at is null)
          and exists(select 1 from da_audit_outbox x
            where x.source_audit_event_id=a.id))
      )
    ) select (select count(*) from authorized where read_at is null) as unread_count,
      (select count(*) from authorized) as total,
      coalesce((select json_agg(page) from (
        select id,created_at,read_at,action,organization_name from authorized
        order by created_at desc,id desc limit 50 offset ?
      ) page),'[]'::json) as items`,
      [s.person_id, organization ?? '', organization ?? '',
       organization ?? '', organization ?? '', offset])
    // Exactly one SQL statement determines the list, unread count and page.
    // A stored reason, actor identifier or staff grant never crosses the API.
    return {
      notifications: rows[0].items.map((n: {
        id:string;created_at:string;read_at:string|null;
        action:string;organization_name:string|null
      }) => {
        const locked = n.action === 'session.locked'
        const opened = n.action === 'organization.store_application_right_enabled'
        const draftGranted=n.action === 'organization.store_draft_permission_granted'
        const draftRevoked=n.action === 'organization.store_draft_permission_revoked'
        return {
          id:n.id,created_at:n.created_at,read_at:n.read_at,
          title:locked?'Oturum kilitlendi':draftGranted?
            'Mağaza taslağı hazırlama izni verildi':draftRevoked?
            'Mağaza taslağı hazırlama izni kaldırıldı':opened?
            'Yeni mağaza başvuru hakkı açıldı':'Yeni mağaza başvuru hakkı durduruldu',
          context:locked?'Kişisel hesabınız':n.organization_name,
          description:locked?
            'Bir tarayıcı oturumunuz kilitlendi. Yeniden açmak için giriş yapabilirsiniz.':
            draftGranted?'Bu şirkette mağaza başvuru taslağı hazırlayıp düzenleyebilirsiniz; başvuru gönderemezsiniz.':
            draftRevoked?'Bu şirketin mağaza başvuru taslaklarına erişim izniniz kaldırıldı.':
            opened?
            'Şirketiniz yeniden yeni mağaza başvurusu gönderebilir. Bekleyen başvurular otomatik onaylanmaz.':
            'Şirketinizin yeni mağaza başvuruları durduruldu. Mevcut faal mağazalar etkilenmez.'
        }
      }),
      unread_count: Number(rows[0]?.unread_count ?? 0),
      next_offset: offset + 50 < Number(rows[0].total) ? offset + 50 : null,
    }
  }

  async read(token: string, id: string, organization?: string) {
    const s = await this.authorize(token, organization)
    const rows = await this.db.execute(`select n.id,n.read_at
      from da_notification_receipt n
      join da_audit_event a on a.id=n.audit_event_id
      left join da_organization o on o.id=a.organization_id
      where n.id=? and n.person_id=? and a.deleted_at is null
        and a.module='dogruadres-access'
        and (
          (a.action='session.locked' and a.actor_person_id=n.person_id
            and a.resource='identity-session' and a.organization_id is null
            and exists(select 1 from da_security_outbox x where x.audit_event_id=a.id))
          or
          (a.action in ('organization.store_application_right_enabled',
                        'organization.store_application_right_disabled')
            and a.resource='organization'
            and (?='' or a.organization_id=?)
            and o.status='active' and o.deleted_at is null
            and exists(select 1 from da_organization_membership m
              where m.person_id=n.person_id and m.organization_id=a.organization_id
                and m.status='active' and m.deleted_at is null
                and m.role='owner' and m.protected_owner=true)
            and exists(select 1 from da_audit_outbox x
              where x.source_audit_event_id=a.id))
          or
          (a.action in ('organization.store_draft_permission_granted',
                        'organization.store_draft_permission_revoked')
            and a.resource='store-draft-permission'
            and a.target_id=n.person_id
            and (?='' or a.organization_id=?)
            and o.status='active' and o.deleted_at is null
            and exists(select 1 from da_organization_membership m
              where m.person_id=n.person_id and m.organization_id=a.organization_id
                and m.role='member' and m.status='active'
                and m.revoked_at is null and m.deleted_at is null)
            and exists(select 1 from da_audit_outbox x
              where x.source_audit_event_id=a.id))
        ) for update of n`,
      [id,s.person_id,organization ?? '',organization ?? '',
        organization ?? '',organization ?? ''])
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
