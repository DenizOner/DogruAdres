import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendSmtpEmail, SmtpAcceptanceUncertainError } from "../modules/dogruadres-access/smtp-client"
import { verifiedEmailForActorContext } from "../api/dogruadres/invitations/accept/route"
import { normalizeEmail, verifiedEmailForActor } from "../modules/dogruadres-access/security"

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

async function readCurrentActorCandidates(em:Sql, claim: Pick<Claim, "organization_id"|"person_id">) {
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
      limit 9`,[claim.organization_id,claim.person_id])
    // More than eight valid native bindings is not safe to disambiguate.
    if(rows.length>8||rows.some(r=>
      !["user","member","customer"].includes(r.actor_type)||
      typeof r.actor_id!=="string"||typeof r.auth_identity_id!=="string"))
      return []
    return rows as Array<{actor_type:"user"|"member"|"customer";
      actor_id:string;auth_identity_id:string}>
  })
}


async function currentActorCandidates(db:Db,claim:Pick<Claim,"organization_id"|"person_id">){
  return db.transactional(sql=>readCurrentActorCandidates(sql,claim))
}

async function currentActor(db:Db,claim:Pick<Claim,"organization_id"|"person_id">){
  const candidates=await currentActorCandidates(db,claim)
  // Platform-closing's existing strict identity rule is unchanged.
  return candidates.length===1?candidates[0]:null
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
      // The authenticated link visit intentionally clears the in-flight
      // claim. A real SMTP 250 can arrive *after* that commit. Preserve its
      // private acceptance proof without changing the Owner's delivered
      // status, the deadline, or the remaining retry schedule.
      // The same attempt number and cleared claim are required; a stale
      // worker may never overwrite a newer pending claim or invent delivery.
      // A new SMTP 250 belongs to this attempt, not to an earlier accepted
      // attempt whose Message-ID may still be present on the recipient row.
      if(outcome==="accepted"&&messageId){
        const accepted=await em.execute(`update da_store_platform_closing_email
          set message_id=?,
            updated_at=clock_timestamp()
          where seller_id=? and person_id=? and delivered_at is not null
            and claim_id is null and last_result='delivered' and attempts=?
          returning seller_id`,[
          messageId,claim.seller_id,claim.person_id,claim.attempts
        ])
        if(accepted.length!==1)
          throw new Error("B22 delivered mail acceptance not committed")
      }
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

/**
 * Owner-initiated 30-day closing reuses the same Medusa scheduler, verified
 * identity and configured SMTP transport. Unlike platform-closing mail,
 * no token or delivery-based clock is issued: this is a security notice,
 * and irreversible finalization remains separately DISABLED.
 */
type OwnerMailClaim = {
  audit_event_id:string;person_id:string;organization_id:string;
  action:"organization.store_owner_closing_started"|
    "organization.store_owner_closing_withdrawn";
  claim_id:string;attempts:number
}

async function refreshOwnerClosingAudience(db:Db){
  await db.transactional(async sql=>{
    await sql.execute(`insert into da_store_owner_closing_email
      (audit_event_id,person_id,next_attempt_at)
      select e.id,n.person_id,e.occurred_at
      from da_store_owner_closing c
      join da_audit_event e on e.id=c.source_audit_event_id
        and e.deleted_at is null and e.module='dogruadres-access'
        and e.resource='store-owner-closing' and e.role_context='owner'
        and e.organization_id=c.organization_id and e.target_id=c.seller_id
        and e.action=(case when c.state='closing'
          then 'organization.store_owner_closing_started'
          else 'organization.store_owner_closing_withdrawn' end)
        and e.new_values->>'request_id'=c.request_id
        and e.new_values->>'state'=c.state
        and e.new_values->>'version'=c.version::text
        and (e.new_values->>'started_at')::timestamptz=c.started_at
        and (e.new_values->>'due_at')::timestamptz=c.due_at
      join da_audit_outbox x on x.source_audit_event_id=e.id
        and x.source_module='dogruadres-access' and x.deleted_at is null
      join da_notification_receipt n on n.audit_event_id=e.id
      join da_organization_membership m on m.person_id=n.person_id
        and m.organization_id=c.organization_id and m.role='owner'
        and m.protected_owner=true and m.status='active'
        and m.revoked_at is null and m.deleted_at is null
      join da_person p on p.id=n.person_id and p.disabled_at is null
        and p.deleted_at is null
      on conflict (audit_event_id,person_id) do nothing`)
  })
}

async function claimOwnerClosingMail(db:Db,seen:OwnerMailClaim[]){
  return db.transactional(async sql=>{
    const exclusions=seen.map(()=>
      "and not (d.audit_event_id=? and d.person_id=?)").join(" ")
    const claimId=randomUUID()
    const rows=await sql.execute(`with due as (
      select d.audit_event_id,d.person_id
      from da_store_owner_closing_email d
      join da_audit_event e on e.id=d.audit_event_id
        and e.deleted_at is null and e.module='dogruadres-access'
        and e.resource='store-owner-closing' and e.role_context='owner'
      join da_store_owner_closing c on c.source_audit_event_id=e.id
        and c.organization_id=e.organization_id and c.seller_id=e.target_id
        and e.action=(case when c.state='closing'
          then 'organization.store_owner_closing_started'
          else 'organization.store_owner_closing_withdrawn' end)
        and e.new_values->>'request_id'=c.request_id
        and e.new_values->>'state'=c.state
        and e.new_values->>'version'=c.version::text
        and (e.new_values->>'started_at')::timestamptz=c.started_at
        and (e.new_values->>'due_at')::timestamptz=c.due_at
      join da_audit_outbox x on x.source_audit_event_id=e.id
        and x.source_module='dogruadres-access' and x.deleted_at is null
      join da_notification_receipt n on n.audit_event_id=d.audit_event_id
        and n.person_id=d.person_id
      join da_organization_membership m on m.person_id=d.person_id
        and m.organization_id=c.organization_id and m.role='owner'
        and m.protected_owner=true and m.status='active'
        and m.revoked_at is null and m.deleted_at is null
      join da_person p on p.id=d.person_id and p.disabled_at is null
        and p.deleted_at is null
      where d.attempts<4 and d.next_attempt_at<=clock_timestamp()
        and (d.lease_until is null or d.lease_until<clock_timestamp())
        ${exclusions}
      order by d.next_attempt_at,d.audit_event_id,d.person_id
      for update of d skip locked limit 1
    )
    update da_store_owner_closing_email d
    set attempts=d.attempts+1,claim_id=?::uuid,
      last_result='inflight',last_attempt_at=clock_timestamp(),
      next_attempt_at=e.occurred_at+((d.attempts+1)*interval '24 hours'),
      lease_until=clock_timestamp()+interval '10 minutes',
      updated_at=clock_timestamp()
    from due,da_audit_event e
    where d.audit_event_id=due.audit_event_id
      and d.person_id=due.person_id and e.id=due.audit_event_id
    returning d.audit_event_id,d.person_id,e.organization_id,e.action,
      d.claim_id::text as claim_id,d.attempts`,[
      ...seen.flatMap(x=>[x.audit_event_id,x.person_id]),claimId
    ])
    if(rows.length>1)throw new Error("Owner closing mail claim cardinality uncertain")
    return rows.length?rows[0] as OwnerMailClaim:null
  })
}

type OwnerMailOutcome="accepted"|"failed"|"unverified_identity"|"uncertain"|"invalidated"
type OwnerMailActor={actor_type:"user"|"member"|"customer";
  actor_id:string;auth_identity_id:string}

/** One Person may legitimately link User and Member native actors. Send a
 * mandatory Owner notice only when their LIVE native email proofs resolve to
 * one unambiguous address; never select an email from actor order or UI data.
 * A second different verified address is a fail-closed identity ambiguity.
 */
async function verifiedOwnerMailRecipient(sql:Sql,
  claim:OwnerMailClaim):Promise<{actor:OwnerMailActor;email:string}|null>{
  const candidates=await readCurrentActorCandidates(sql,claim)
  let selected:{actor:OwnerMailActor;email:string}|null=null
  const bindings=new Set<string>()
  for(const actor of candidates){
    const key=JSON.stringify([actor.actor_type,actor.actor_id,actor.auth_identity_id])
    if(bindings.has(key))return null // ambiguous duplicated source rows
    bindings.add(key)
    // The worker must not call Medusa Query/Auth while a PG_CONNECTION trx
    // holds the Person/identity locks: those services borrow another pooled
    // connection. Read the SAME native facts using this exact trx instead.
    const table=actor.actor_type==="user"?'public."user"':
      actor.actor_type==="member"?"public.member":"public.customer"
    const native=await sql.execute(`select email from ${table}
      where id=? and deleted_at is null limit 2`,[actor.actor_id])
    if(native.length!==1||typeof native[0].email!=="string")continue
    const provider=await sql.execute(`select entity_id from provider_identity
      where auth_identity_id=? and provider='emailpass'
        and deleted_at is null limit 2`,[actor.auth_identity_id])
    if(provider.length!==1||typeof provider[0].entity_id!=="string")continue
    const verification=await sql.execute(`select entity_type,entity_id,
      verified_at,deleted_at from auth_verification
      where auth_identity_id=? and entity_type='email'
        and deleted_at is null`,[actor.auth_identity_id])
    const email=verifiedEmailForActor({
      actorType:actor.actor_type,actorId:actor.actor_id,
      authIdentityId:actor.auth_identity_id,authProvider:"emailpass",
      authenticatedEmail:native[0].email,
      providerIdentityEmail:provider[0].entity_id,
      verifications:verification
    })
    if(!email)continue
    if(selected&&normalizeEmail(selected.email)!==normalizeEmail(email))
      return null
    if(!selected)selected={actor,email}
  }
  return selected
}

async function persistOwnerMailResult(sql:Sql,claim:OwnerMailClaim,
  outcome:OwnerMailOutcome,messageId:string|null){
  const rows=await sql.execute(`update da_store_owner_closing_email
    set last_result=?,message_id=(case when ?='accepted'
      then ? else message_id end),
      accepted_at=(case when ?='accepted' then clock_timestamp()
        else accepted_at end),
      claim_id=null,lease_until=null,updated_at=clock_timestamp()
    where audit_event_id=? and person_id=? and claim_id=?::uuid
      and last_result='inflight' returning audit_event_id`,[
    outcome,outcome,messageId,outcome,
    claim.audit_event_id,claim.person_id,claim.claim_id
  ])
  if(rows.length!==1)throw new Error("Owner closing mail result not committed")
}
async function settleOwnerClosingMail(db:Db,claim:OwnerMailClaim,
  outcome:OwnerMailOutcome,messageId:string|null){
  await db.transactional(sql=>persistOwnerMailResult(sql,claim,outcome,messageId))
}

/**
 * Lock only the canonical Person and THEIR current native identity/proof rows.
 * da_login_binding/da_actor_mapping have mandatory person FKs; Medusa's
 * provider_identity/auth_verification belong to auth_identity. FOR UPDATE
 * on the respective parent prevents NEW child rows (FK KEY SHARE conflict),
 * while FOR SHARE on every existing child prevents proof revival/revocation.
 * This avoids the global identity-table write outage of a SHARE TABLE lock.
 */
async function lockOwnerMailProofRows(sql:Sql,claim:OwnerMailClaim){
  // Fail closed if a migration ever removes an FK required to prevent
  // phantom identity or proof insertion. No trust in advisory-lock writers.
  const fk=await sql.execute(`select
    (select count(*)::int from pg_constraint where contype='f'
      and conrelid='da_login_binding'::regclass
      and confrelid='da_person'::regclass and not condeferrable) as login_fk,
    (select count(*)::int from pg_constraint where contype='f'
      and conrelid='da_actor_mapping'::regclass
      and confrelid='da_person'::regclass and not condeferrable) as map_fk,
    (select count(*)::int from pg_constraint where contype='f'
      and conrelid='provider_identity'::regclass
      and confrelid='auth_identity'::regclass and not condeferrable) as provider_fk,
    (select count(*)::int from pg_constraint where contype='f'
      and conrelid='auth_verification'::regclass
      and confrelid='auth_identity'::regclass and not condeferrable) as proof_fk`)
  if(fk.length!==1||["login_fk","map_fk","provider_fk","proof_fk"].some(
    k=>Number(fk[0][k])<1))throw new Error("Native mail identity FK fence unavailable")
  const person=await sql.execute(`select id from da_person
    where id=? and deleted_at is null and disabled_at is null
    for update`,[claim.person_id])
  if(person.length!==1)return false
  // Lock ALL current and revoked rows: an old binding must not reactivate
  // or switch Person during the SMTP attempt. New rows require the locked
  // Person parent FK and cannot commit until our transaction finishes.
  await sql.execute(`select auth_identity_id from da_login_binding
    where person_id=? for share`,[claim.person_id])
  await sql.execute(`select id from da_actor_mapping
    where person_id=? for share`,[claim.person_id])
  const candidates=await readCurrentActorCandidates(sql,claim)
  for(const actor of candidates){
    // Table names come ONLY from this fixed server-side enum, never input.
    const table=actor.actor_type==="user"?'public."user"':
      actor.actor_type==="member"?"public.member":"public.customer"
    const native=await sql.execute(`select id from ${table}
      where id=? for share`,[actor.actor_id])
    const identity=await sql.execute(`select id from auth_identity
      where id=? and deleted_at is null for update`,[actor.auth_identity_id])
    if(native.length!==1||identity.length!==1)return false
    await sql.execute(`select id from provider_identity
      where auth_identity_id=? for share`,[actor.auth_identity_id])
    await sql.execute(`select id from auth_verification
      where auth_identity_id=? for share`,[actor.auth_identity_id])
  }
  return true
}

/**
 * The claim is NOT send authorization. Serialize SMTP DATA and the outcome
 * with LIVE Owner membership, actor binding and the current closing source.
 * FOR SHARE blocks a simultaneous UPDATE/DELETE of those actual rows:
 * a completed revoke/withdraw denies sending; otherwise its COMMIT waits
 * until the bounded SMTP submission has completed. No new queue or core
 * change. This network call deliberately runs under a short PostgreSQL
 * transaction; the existing SMTP transport enforces its own timeout.
 */
async function sendOwnerMailFenced(db:Db,claim:OwnerMailClaim,
  send:(email:string)=>Promise<{messageId:string}>){
  await db.transactional(async sql=>{
    const proofLocked=await lockOwnerMailProofRows(sql,claim)
    const recipient=proofLocked?
      await verifiedOwnerMailRecipient(sql,claim):null
    if(!recipient){
      // An Owner revoked between the claim and the send fence is not merely
      // missing email proof. Preserve the existing invalidated terminal state.
      const live=await sql.execute(`select m.id from da_organization_membership m
        join da_person p on p.id=m.person_id and p.disabled_at is null
          and p.deleted_at is null
        where m.person_id=? and m.organization_id=?
          and m.role='owner' and m.protected_owner=true
          and m.status='active' and m.revoked_at is null
          and m.deleted_at is null
        limit 2 for share of m,p`,[claim.person_id,claim.organization_id])
      await persistOwnerMailResult(sql,claim,
        live.length===1?"unverified_identity":"invalidated",null)
      return
    }
    const {actor,email}=recipient
    // Existing Owner, actor, Store and claim row fences are unchanged.
    const eligible=await sql.execute(`select m.id
      from da_organization_membership m
      join da_person p on p.id=m.person_id and p.disabled_at is null
        and p.deleted_at is null
      join da_login_binding b on b.person_id=m.person_id
        and b.actor_type=? and b.actor_id=? and b.auth_identity_id=?
        and b.revoked_at is null and b.verified_at is not null
      join da_actor_mapping map on map.person_id=b.person_id
        and map.actor_type=b.actor_type and map.actor_id=b.actor_id
        and map.deleted_at is null
      where m.person_id=? and m.organization_id=?
        and m.role='owner' and m.protected_owner=true
        and m.status='active' and m.revoked_at is null
        and m.deleted_at is null
      limit 2 for share of m,p,b,map`,[
      actor.actor_type,actor.actor_id,actor.auth_identity_id,
      claim.person_id,claim.organization_id
    ])
    if(eligible.length!==1){
      await persistOwnerMailResult(sql,claim,"invalidated",null)
      return
    }

    const current=await sql.execute(`select c.seller_id
      from da_store_owner_closing c
      join da_audit_event e on e.id=c.source_audit_event_id
        and e.id=? and e.deleted_at is null
        and e.module='dogruadres-access' and e.role_context='owner'
        and e.resource='store-owner-closing'
        and e.organization_id=c.organization_id
        and e.target_id=c.seller_id and e.action=?
        and e.new_values->>'request_id'=c.request_id
        and e.new_values->>'state'=c.state
        and e.new_values->>'version'=c.version::text
        and (e.new_values->>'started_at')::timestamptz=c.started_at
        and (e.new_values->>'due_at')::timestamptz=c.due_at
      join da_audit_outbox x on x.source_audit_event_id=e.id
        and x.source_module='dogruadres-access' and x.deleted_at is null
      join da_notification_receipt n on n.audit_event_id=e.id
        and n.person_id=?
      join da_store_owner_closing_email d on d.audit_event_id=e.id
        and d.person_id=n.person_id and d.claim_id=?::uuid
        and d.last_result='inflight'
      where c.organization_id=?
        and c.state=(case when ?='organization.store_owner_closing_started'
          then 'closing' else 'withdrawn' end)
      limit 2 for share of c,e,x,n,d`,[
      claim.audit_event_id,claim.action,claim.person_id,
      claim.claim_id,claim.organization_id,claim.action
    ])
    if(current.length!==1){
      await persistOwnerMailResult(sql,claim,"invalidated",null)
      return
    }
    let outcome:OwnerMailOutcome="uncertain",messageId:string|null=null
    try{
      const transport=await send(email)
      messageId=transport.messageId
      outcome="accepted" // not mailbox delivery
    }catch(error){
      outcome=error instanceof SmtpAcceptanceUncertainError?"uncertain":"failed"
    }
    // The DB-side send decision and SMTP outcome commit under the same
    // membership/closing locks. The opposite operation cannot interleave.
    await persistOwnerMailResult(sql,claim,outcome,messageId)
  })
}

export async function runOwnerClosingEmailTick(container:MedusaContainer){
  const db=scope(container)
  await refreshOwnerClosingAudience(db)
  // A crashed SMTP connection is UNKNOWN, not evidence of delivery or
  // definite rejection. Retain its slot; the next scheduled slot may retry.
  await db.transactional(sql=>sql.execute(`update da_store_owner_closing_email
    set last_result='uncertain',claim_id=null,lease_until=null,
      updated_at=clock_timestamp()
    where last_result='inflight' and lease_until<=clock_timestamp()`).then(()=>{}))
  const seen:OwnerMailClaim[]=[]
  for(let i=0;i<MAX_PER_TICK;i++){
    const claim=await claimOwnerClosingMail(db,seen)
    if(!claim)break
    seen.push(claim)
    let result:OwnerMailOutcome="unverified_identity"
    let fenced=false,sendFenceStarted=false
    try{
      {
          const origin=process.env.DOGRUADRES_PUBLIC_ORIGIN
          if(!origin||new URL(origin).protocol!=="https:")
            throw new Error("Missing secure first-party notification origin")
          const access=container.resolve("dogruadresAccess") as {
            getActiveSmtpConfig():Promise<{
              enabled:boolean;host:string;port:number;
              security:"ssl"|"tls"|"none";username?:string|null;
              password?:string|null;from_email:string;from_name?:string|null
            }|null>
          }
          const smtp=await access.getActiveSmtpConfig()
          if(!smtp?.enabled)throw new Error("Mandatory mail transport unavailable")
          const started=claim.action==="organization.store_owner_closing_started"
          sendFenceStarted=true
          await sendOwnerMailFenced(db,claim,email=>sendSmtpEmail({
            to:email,
            subject:started?
              "DoğruAdres mağaza kapatma süreci güvenlik bildirimi":
              "DoğruAdres mağaza kapatma talebi geri çekildi",
            text:started?
              "Yetkili bir Owner, sorumluluğunuzdaki bir mağaza için 30 günlük "+
              "kapatma sürecini başlattı. Yeni satışlar durduruldu. "+
              "Güvenli hesabınızdan güncel durum ve süreyi kontrol edin: "+
              origin+"/personal":
              "Sorumluluğunuzdaki bir mağazanın kapatma talebi geri çekildi. "+
              "Diğer satış engelleri devam edebilir. Güncel durumu "+
              "güvenli hesabınızdan kontrol edin: "+origin+"/personal"
          },{
            enabled:smtp.enabled,host:smtp.host,port:smtp.port,
            security:smtp.security,username:smtp.username??undefined,
            password:smtp.password??undefined,
            fromEmail:smtp.from_email,fromName:smtp.from_name??undefined
          }))
          fenced=true
      }
    }catch(error){
      // A configuration/identity failure is a definite unsuccessful attempt.
      // After opening the send fence, even a DB commit error may FOLLOW DATA:
      // never invent a remote SMTP rejection in that case.
      result=sendFenceStarted?"uncertain":"failed"
    }
    if(!fenced)await settleOwnerClosingMail(db,claim,result,null)
  }
}

export default async function platformClosingEmailJob(container:MedusaContainer){
  await runPlatformClosingEmailTick(container)
  await runOwnerClosingEmailTick(container)
}
export const config={
  name:"dogruadres-platform-closing-email",
  schedule:"* * * * *"
}
