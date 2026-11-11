import { randomUUID } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { verifiedEmailForActorContext } from "../api/dogruadres/invitations/accept/route"

/**
 * B22: the native Medusa scheduler, Notification Module and our already
 * configured SMTP provider are reused. No mail is sent in the HTTP closure
 * transaction. A claimed attempt survives process death and cannot be
 * concurrently claimed by another worker.
 *
 * SMTP 250 means "accepted", NEVER "delivered" or "read". The only deadline
 * fallback in this job is a durable, private admin notice after four attempts.
 * This job must not perform native termination or release a store name.
 */
type Sql = { getConnection(): {
  execute(sql: string, params?: unknown[]): Promise<Record<string, any>[]>
}}
type Db = { transactional<T>(work: (sql: Sql) => Promise<T>): Promise<T> }
type Claim = {
  seller_id: string
  person_id: string
  organization_id: string
  claim_id: string
  attempts: number
}
const MAX_PER_TICK = 12
const scope = (container: MedusaContainer) =>
  container.resolve(ContainerRegistrationKeys.MANAGER) as unknown as Db

async function refreshAudience(db: Db) {
  await db.transactional(async em => {
    const sql = em.getConnection()
    // Current protected Owners must not be forgotten when membership changes.
    // The Source Audit + Outbox proof prevents a forged closure row from
    // creating a notification.
    await sql.execute(`insert into da_store_platform_closing_email
      (seller_id,person_id,next_attempt_at)
      select c.seller_id,m.person_id,clock_timestamp()
      from da_store_platform_closing c
      join da_audit_event a on a.id=c.source_audit_event_id
        and a.deleted_at is null and a.action='organization.store_platform_closing_started'
        and a.resource='store-platform-closing'
        and a.organization_id=c.organization_id and a.target_id=c.seller_id
      join da_audit_outbox o on o.source_audit_event_id=a.id
        and o.source_module='dogruadres-access' and o.deleted_at is null
      join da_organization_membership m on m.organization_id=c.organization_id
        and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.revoked_at is null and m.deleted_at is null
      join da_person p on p.id=m.person_id and p.disabled_at is null
        and p.deleted_at is null
      where c.state in ('notification_unverified','appealed')
      on conflict (seller_id,person_id) do nothing`)
    await sql.execute(`insert into da_notification_receipt(id,person_id,audit_event_id)
      select 'danot_'||gen_random_uuid()::text,m.person_id,c.source_audit_event_id
      from da_store_platform_closing c
      join da_organization_membership m on m.organization_id=c.organization_id
        and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.revoked_at is null and m.deleted_at is null
      join da_person p on p.id=m.person_id and p.disabled_at is null
        and p.deleted_at is null
      join da_audit_outbox o on o.source_audit_event_id=c.source_audit_event_id
        and o.source_module='dogruadres-access' and o.deleted_at is null
      on conflict (audit_event_id,person_id) do nothing`)
  })
}

async function claimDue(db: Db): Promise<Claim | null> {
  return db.transactional(async em => {
    const claimId = randomUUID()
    const rows = await em.getConnection().execute(`with due as (
      select d.seller_id,d.person_id from da_store_platform_closing_email d
      join da_store_platform_closing c on c.seller_id=d.seller_id
      join da_organization_membership m on m.person_id=d.person_id
        and m.organization_id=c.organization_id and m.role='owner'
        and m.protected_owner=true and m.status='active'
        and m.revoked_at is null and m.deleted_at is null
      join da_person p on p.id=m.person_id and p.deleted_at is null
        and p.disabled_at is null
      where d.attempts<4 and d.delivered_at is null
        and d.next_attempt_at<=clock_timestamp()
        and (d.lease_until is null or d.lease_until<clock_timestamp())
      order by d.next_attempt_at,d.seller_id,d.person_id
      for update of d skip locked limit 1
    )
    update da_store_platform_closing_email d
    set attempts=d.attempts+1,claim_id=?::uuid,
      last_result='inflight',last_attempt_at=clock_timestamp(),
      next_attempt_at=clock_timestamp()+interval '24 hours',
      lease_until=clock_timestamp()+interval '10 minutes',
      updated_at=clock_timestamp()
    from due, da_store_platform_closing c
    where d.seller_id=due.seller_id and d.person_id=due.person_id
      and c.seller_id=d.seller_id
    returning d.seller_id,d.person_id,c.organization_id,d.attempts,
      d.claim_id::text as claim_id`,[claimId])
    if(rows.length>1)throw new Error("B22 mail claim cardinality uncertain")
    return rows.length?rows[0] as Claim:null
  })
}

async function currentActor(db: Db, claim: Claim) {
  return db.transactional(async em => {
    const rows = await em.getConnection().execute(`select b.actor_type,b.actor_id,
      b.auth_identity_id
      from da_login_binding b
      join da_actor_mapping map on map.person_id=b.person_id
        and map.actor_type=b.actor_type and map.actor_id=b.actor_id
        and map.deleted_at is null
      join da_organization_membership m on m.person_id=b.person_id
        and m.organization_id=? and m.status='active'
        and m.role='owner' and m.protected_owner=true
        and m.revoked_at is null and m.deleted_at is null
      join da_person p on p.id=b.person_id and p.disabled_at is null
        and p.deleted_at is null
      where b.person_id=? and b.revoked_at is null
        and b.verified_at is not null
      limit 2`,[claim.organization_id,claim.person_id])
    if(rows.length!==1||!["user","member","customer"].includes(rows[0].actor_type))
      return null
    return rows[0] as {actor_type:"user"|"member"|"customer";
      actor_id:string;auth_identity_id:string}
  })
}

async function settle(db: Db, claim: Claim, outcome: "accepted"|"failed"|"unverified_identity") {
  await db.transactional(async em => {
    const rows = await em.getConnection().execute(`update da_store_platform_closing_email
      set last_result=?,claim_id=null,lease_until=null,
        updated_at=clock_timestamp()
      where seller_id=? and person_id=? and claim_id=?::uuid
        and last_result='inflight'
      returning seller_id`,[outcome,claim.seller_id,claim.person_id,claim.claim_id])
    if(rows.length!==1)throw new Error("B22 mail result not committed")
  })
}

async function settleExhaustion(db: Db): Promise<number> {
  return db.transactional(async em => {
    const conn=em.getConnection()
    // Delivery must be *proved*; neither accepted SMTP nor an untrusted
    // tracking pixel counts. An admin receipt is durably recorded *before*
    // the clock starts, in the same transaction.
    const candidates=await conn.execute(`select c.seller_id,c.organization_id,
      c.source_audit_event_id
      from da_store_platform_closing c
      where c.deadline_started_at is null
        and c.started_at<=clock_timestamp()-interval '72 hours'
        and not exists (
          select 1 from da_store_platform_closing_email d
          join da_organization_membership m on m.person_id=d.person_id
            and m.organization_id=c.organization_id and m.status='active'
            and m.role='owner' and m.protected_owner=true
            and m.revoked_at is null and m.deleted_at is null
          join da_person p on p.id=m.person_id and p.deleted_at is null
            and p.disabled_at is null
          where d.seller_id=c.seller_id and (
            d.attempts<4 or d.lease_until>clock_timestamp()
            or d.delivered_at is not null)
        )
        and not exists (
          select 1 from da_organization_membership m
          join da_person p on p.id=m.person_id
            and p.disabled_at is null and p.deleted_at is null
          where m.organization_id=c.organization_id and m.status='active'
            and m.role='owner' and m.protected_owner=true
            and m.revoked_at is null and m.deleted_at is null
            and not exists(select 1 from da_store_platform_closing_email d
              where d.seller_id=c.seller_id and d.person_id=m.person_id)
        )
      order by c.started_at,c.seller_id
      for update of c skip locked limit 5`)
    let started=0
    for(const c of candidates){
      const recipients=await conn.execute(`select distinct g.person_id
        from da_platform_staff_grant g
        join da_person p on p.id=g.person_id and p.disabled_at is null
          and p.deleted_at is null
        where g.task='store.closing.manage' and g.resource='platform'
          and g.revoked_at is null
          and (g.expires_at is null or g.expires_at>clock_timestamp())
        limit 100`)
      if(!recipients.length)continue // No silent "admin was notified" claim.
      const notice=await conn.execute(`insert into da_notification_receipt
        (id,person_id,audit_event_id)
        select 'danot_'||gen_random_uuid()::text,g.person_id,?
        from da_platform_staff_grant g
        join da_person p on p.id=g.person_id and p.disabled_at is null
          and p.deleted_at is null
        where g.task='store.closing.manage' and g.resource='platform'
          and g.revoked_at is null
          and (g.expires_at is null or g.expires_at>clock_timestamp())
        on conflict (audit_event_id,person_id) do nothing
        returning person_id`,[c.source_audit_event_id])
      // A previously-created receipt can also be valid. Re-check actual
      // distinct eligible recipients in the same DB transaction.
      const all=await conn.execute(`select count(*)::int as n
        from da_notification_receipt n
        join da_platform_staff_grant g on g.person_id=n.person_id
          and g.task='store.closing.manage' and g.resource='platform'
          and g.revoked_at is null and
          (g.expires_at is null or g.expires_at>clock_timestamp())
        join da_person p on p.id=g.person_id and p.disabled_at is null
          and p.deleted_at is null
        where n.audit_event_id=?`,[c.source_audit_event_id])
      if(!Number(all[0]?.n))continue
      const changed=await conn.execute(`update da_store_platform_closing
        set deadline_started_at=clock_timestamp(),
          admin_alert_at=clock_timestamp(),deadline_basis='admin_alert',
          updated_at=clock_timestamp()
        where seller_id=? and deadline_started_at is null
        returning seller_id`,[c.seller_id])
      if(changed.length===1)started++
      void notice
    }
    return started
  })
}

export async function runPlatformClosingEmailTick(container: MedusaContainer) {
  // Never send private subjects, secrets or raw errors to routine job logs.
  const db=scope(container)
  await refreshAudience(db)
  for(let i=0;i<MAX_PER_TICK;i++){
    const claim=await claimDue(db)
    if(!claim)break
    let result: "accepted"|"failed"|"unverified_identity"="unverified_identity"
    try{
      const actor=await currentActor(db,claim)
      if(actor){
        const email=await verifiedEmailForActorContext(
          {scope:container} as any,{
            ...actor,auth_provider:"emailpass",user_metadata:{}
          })
        if(email){
          const origin=process.env.DOGRUADRES_PUBLIC_ORIGIN
          if(!origin || new URL(origin).protocol!=="https:")
            throw new Error("Missing secure first-party notification origin")
          const notification=container.resolve(Modules.NOTIFICATION) as {
            createNotifications(value:Record<string,unknown>):Promise<unknown>
          }
          // Never put the private reason or Owner/Store identifiers into the
          // Medusa Notification 'data' property, which native Admin can read.
          await notification.createNotifications({
            to:email,channel:"email",template:"platform-store-closing",
            data:{
              subject:"DoğruAdres güvenlik bildirimi",
              text:"Yönettiğiniz bir mağaza için kapatma incelemesi açıldı. "+
                "Güvenli hesabınızda ilgili işletmeyi seçip ayrıntıları inceleyin: "+
                origin+"/personal"
            }
          })
          result="accepted" // still NOT delivered
        }
      }
    }catch{
      result="failed"
    }
    await settle(db,claim,result)
  }
  await settleExhaustion(db)
}

export default async function platformClosingEmailJob(container:MedusaContainer){
  await runPlatformClosingEmailTick(container)
}
export const config={
  name:"dogruadres-platform-closing-email",
  schedule:"* * * * *"
}
