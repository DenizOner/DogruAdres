import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendSmtpEmail, SmtpAcceptanceUncertainError } from "../modules/dogruadres-access/smtp-client"
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
type Sql = {execute(sql: string, params?: unknown[]): Promise<Record<string, any>[]>}
type Db = { transactional<T>(work: (sql: Sql) => Promise<T>): Promise<T> }
type Claim = {
  seller_id: string
  person_id: string
  organization_id: string
  claim_id: string
  attempts: number
  link_token: string
}
const MAX_PER_TICK = 12
// The live Medusa container exposes its registered PostgreSQL Knex pool,
// not a generic "manager" registration. Use the installed PG_CONNECTION and
// its official transaction/raw methods; keep every claim/lease DB-atomic.
const scope = (container: MedusaContainer):Db => {
  const pg=container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as {
    transaction<T>(work:(trx:{
      raw(sql:string,params:unknown[]):Promise<{rows:Record<string,any>[]}>
    })=>Promise<T>):Promise<T>
  }
  return {transactional:<T>(work:(sql:Sql)=>Promise<T>)=>
    pg.transaction(async trx=>work({
      execute:async (statement:string,params:unknown[]=[])=>{
        const response=await trx.raw(statement,params)
        if(!Array.isArray(response.rows))
          throw new Error("B22 PostgreSQL result is not a row set")
        return response.rows
      }
    }))}
}

async function refreshAudience(db: Db) {
  await db.transactional(async em => {
    const sql = em
    // Current protected Owners must not be forgotten when membership changes.
    // The Source Audit + Outbox proof prevents a forged closure row from
    // creating a notification.
    await sql.execute(`insert into da_store_platform_closing_email
      (seller_id,person_id,next_attempt_at,late_notice_id)
      select c.seller_id,m.person_id,clock_timestamp(),
        case when exists(select 1 from da_notification_receipt n
          where n.audit_event_id=c.source_audit_event_id and n.person_id=m.person_id)
          then null else 'danot_'||gen_random_uuid()::text end
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
  })
}

async function claimDue(db: Db, seen: Array<{seller_id:string;person_id:string}>): Promise<Claim | null> {
  return db.transactional(async em => {
    const claimId = randomUUID()
    const linkToken = randomBytes(32).toString("hex")
    const linkDigest = createHash("sha256").update(linkToken).digest("hex")
    const exclude = seen.map(()=>`and not (d.seller_id=? and d.person_id=?)`).join("\n")
    const rows = await em.execute(`with due as (
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
        ${exclude}
      order by d.next_attempt_at,d.seller_id,d.person_id
      for update of d skip locked limit 1
    )
    update da_store_platform_closing_email d
    set attempts=d.attempts+1,claim_id=?::uuid,
      last_result='inflight',last_attempt_at=clock_timestamp(),
      -- All original slots are tied to the immutable first Staff decision.
      -- Subsequent Owners start their own four-slot schedule when notified.
      next_attempt_at=(case when d.late_notice_id is null then c.started_at
        else d.created_at end)+((d.attempts+1)*interval '24 hours'),
      lease_until=clock_timestamp()+interval '10 minutes',
      updated_at=clock_timestamp()
    from due, da_store_platform_closing c
    where d.seller_id=due.seller_id and d.person_id=due.person_id
      and c.seller_id=d.seller_id
    returning d.seller_id,d.person_id,c.organization_id,d.attempts,
      d.claim_id::text as claim_id`,[
      ...seen.flatMap(x=>[x.seller_id,x.person_id]),claimId
    ])
    if(rows.length>1)throw new Error("B22 mail claim cardinality uncertain")
    if(rows.length===1){
      await em.execute(`insert into da_store_platform_closing_email_link
        (seller_id,person_id,attempt,token_sha256)
        values (?,?,?,?)`,[
          rows[0].seller_id,rows[0].person_id,Number(rows[0].attempts),linkDigest
        ])
      return {...rows[0],link_token:linkToken} as Claim
    }
    return null
  })
}

async function currentActor(db: Db, claim: Claim) {
  return db.transactional(async em => {
    const rows = await em.execute(`select b.actor_type,b.actor_id,
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

async function settle(db: Db, claim: Claim, outcome: "accepted"|"failed"|"unverified_identity"|"uncertain",messageId:string|null) {
  await db.transactional(async em => {
    const rows = await em.execute(`update da_store_platform_closing_email
      set last_result=?,message_id=case when ?='accepted' then ? else message_id end,
        claim_id=null,lease_until=null,updated_at=clock_timestamp()
      where seller_id=? and person_id=? and claim_id=?::uuid
        and last_result='inflight'
      returning seller_id`,[outcome,outcome,messageId,
        claim.seller_id,claim.person_id,claim.claim_id])
    if(rows.length!==1){
      // An authenticated Owner can open a valid email link while the SMTP
      // process is settling its acceptance. That visit already commits
      // durable positive delivery and may clear this claim; never overwrite
      // it with a stale worker result or throw a false transport retry.
      const proof=await em.execute(`select delivered_at from
        da_store_platform_closing_email where seller_id=? and person_id=?
        limit 2`,[claim.seller_id,claim.person_id])
      if(proof.length!==1||!proof[0].delivered_at)
        throw new Error("B22 mail result not committed")
    }
  })
}

/**
 * A worker can die after claiming an email slot but before obtaining an SMTP
 * reply. Its ten-minute lease is NOT proof that a message was sent. Preserve
 * the attempted slot and report it as uncertain; never claim delivery, success
 * or a transport failure from process death. Later slots retain their original
 * 24-hour spacing, and the fourth uncertain slot may use the approved
 * admin-alert fallback instead of locking the closure forever.
 */
async function reconcileExpiredClaims(db: Db) {
  await db.transactional(async em => {
    await em.execute(`update da_store_platform_closing_email
      set last_result='uncertain',claim_id=null,lease_until=null,
        updated_at=clock_timestamp()
      where last_result='inflight' and delivered_at is null
        and lease_until<=clock_timestamp()`)
  })
}

async function settleExhaustion(container: MedusaContainer): Promise<number> {
  // The Foundation service owns the *same* physical DB transaction for
  // admin recipients, deadline and canonical audit/outbox. Never commit a
  // timer here with raw SQL independent of its provenance.
  const access=container.resolve("dogruadresAccess") as {
    settlePlatformClosingAdminFallback():Promise<number>
  }
  return access.settlePlatformClosingAdminFallback()
}

export async function runPlatformClosingEmailTick(container: MedusaContainer) {
  // Never send private subjects, secrets or raw errors to routine job logs.
  const db=scope(container)
  await refreshAudience(db)
  await reconcileExpiredClaims(db)
  const seen:Array<{seller_id:string;person_id:string}>=[]
  for(let i=0;i<MAX_PER_TICK;i++){
    const claim=await claimDue(db,seen)
    if(!claim)break
    // Catch up missed original calendar slots safely, but never send a
    // recipient multiple SMTP messages inside one scheduler invocation.
    seen.push({seller_id:claim.seller_id,person_id:claim.person_id})
    let result: "accepted"|"failed"|"unverified_identity"|"uncertain"="unverified_identity"
    let messageId:string|null=null
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
          // Medusa's native Notification module stores its entire data
          // payload and exposes it to notification:read users. A per-recipient
          // link token must NOT be persisted there. Reuse the existing
          // configured project SMTP transport and persist only its acceptance.
          const access=container.resolve("dogruadresAccess") as {
            getActiveSmtpConfig():Promise<{
              enabled:boolean;host:string;port:number;
              security:"ssl"|"tls"|"none";username?:string|null;
              password?:string|null;from_email:string;from_name?:string|null
            }|null>
          }
          const smtp=await access.getActiveSmtpConfig()
          if(!smtp?.enabled)throw new Error("Mandatory mail transport unavailable")
          const transport=await sendSmtpEmail({
            to:email,
            subject:"DoğruAdres mağaza kapatma güvenlik bildirimi",
            text:"Yönettiğiniz bir mağazada platform kapatma incelemesi "+
              "başlatıldı ve yeni satışlar durduruldu. Gerekçeyi ve itiraz "+
              "seçeneklerini yalnız güvenli DoğruAdres hesabınızdan inceleyin: "+
              origin+"/personal#closing_notice="+claim.link_token
          },{
            enabled:smtp.enabled,host:smtp.host,port:smtp.port,
            security:smtp.security,username:smtp.username??undefined,
            password:smtp.password??undefined,
            fromEmail:smtp.from_email,fromName:smtp.from_name??undefined
          })
          messageId=transport.messageId
          result="accepted" // still NOT delivered
        }
      }
    }catch(error){
      result=error instanceof SmtpAcceptanceUncertainError?"uncertain":"failed"
    }
    await settle(db,claim,result,messageId)
  }
  await settleExhaustion(container)
}

export default async function platformClosingEmailJob(container:MedusaContainer){
  await runPlatformClosingEmailTick(container)
}
export const config={
  name:"dogruadres-platform-closing-email",
  schedule:"* * * * *"
}
