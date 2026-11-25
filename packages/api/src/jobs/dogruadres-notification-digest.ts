import { randomUUID } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendSmtpEmail } from "../modules/dogruadres-access/smtp-client"
import { verifiedEmailForActorContext } from "../api/dogruadres/invitations/accept/route"
import {
  PersonalNotificationPreferences,
  type NotificationCategoryId,
} from "../modules/dogruadres-access/notification-preferences"

type Sql = { execute(sql: string, params?: unknown[]): Promise<Record<string, any>[]> }
type Db = { transactional<T>(work: (sql: Sql) => Promise<T>): Promise<T> }

const MAX_PERSONS_PER_TICK = 25

function scope(container: MedusaContainer): Db {
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as {
    transaction<T>(
      work: (trx: { raw(sql: string, params: unknown[]): Promise<{ rows: Record<string, any>[] }> }) => Promise<T>
    ): Promise<T>
  }
  return {
    transactional: <T>(work: (sql: Sql) => Promise<T>) =>
      pg.transaction(async (trx) =>
        work({
          execute: async (statement: string, params: unknown[] = []) => {
            const response = await trx.raw(statement, params)
            if (!Array.isArray(response.rows)) {
              throw new Error("Digest PostgreSQL result is not a row set")
            }
            return response.rows
          },
        })
      ),
  }
}

export async function runNotificationDigestTick(container: MedusaContainer) {
  const db = scope(container)
  const claimId = "digclaim_" + randomUUID()

  // 1. Atomically claim due digest rows for active persons
  const claimedByPerson = await db.transactional(async (sql) => {
    const duePersons = await sql.execute(
      `select distinct q.person_id
       from da_notification_digest_queue q
       join da_person p on p.id = q.person_id and p.disabled_at is null and p.deleted_at is null
       where q.sent_at is null
         and q.failed_at is null
         and (q.claimed_at is null or q.claimed_at < clock_timestamp() - interval '15 minutes')
       order by q.person_id
       limit ?`,
      [MAX_PERSONS_PER_TICK]
    )
    if (duePersons.length === 0) return new Map<string, Array<Record<string, any>>>()

    const personIds = duePersons.map((r) => String(r.person_id))
    const rows = await sql.execute(
      `update da_notification_digest_queue
       set claimed_at = clock_timestamp(),
           claim_id = ?,
           attempts = attempts + 1
       where person_id = any(?::text[])
         and sent_at is null
         and failed_at is null
         and (claimed_at is null or claimed_at < clock_timestamp() - interval '15 minutes')
       returning id, person_id, category, event_action, summary_key, attempts`,
      [claimId, personIds]
    )

    const grouped = new Map<string, Array<Record<string, any>>>()
    for (const row of rows) {
      const pid = String(row.person_id)
      const list = grouped.get(pid) ?? []
      list.push(row)
      grouped.set(pid, list)
    }
    return grouped
  })

  if (claimedByPerson.size === 0) return { processed: 0 }

  let processed = 0
  for (const [personId, items] of claimedByPerson.entries()) {
    try {
      const deliverableIds: string[] = []
      const skippedIds: string[] = []

      await db.transactional(async (sql) => {
        const prefs = new PersonalNotificationPreferences(sql)
        for (const item of items) {
          const cat = String(item.category) as NotificationCategoryId
          const resolved = await prefs.resolveForPerson(personId, cat)
          if (resolved.email === "daily_digest") {
            deliverableIds.push(String(item.id))
          } else {
            skippedIds.push(String(item.id))
          }
        }
        if (skippedIds.length > 0) {
          await sql.execute(
            `update da_notification_digest_queue
             set sent_at = clock_timestamp()
             where id = any(?::text[]) and claim_id = ?`,
            [skippedIds, claimId]
          )
        }
      })

      if (deliverableIds.length === 0) {
        processed += items.length
        continue
      }

      // Look up verified primary email for person via active login binding
      const actor = await db.transactional(async (sql) => {
        const bindings = await sql.execute(
          `select auth_identity_id, actor_type, actor_id
           from da_login_binding
           where person_id = ? and revoked_at is null
           order by verified_at desc nulls last limit 1`,
          [personId]
        )
        if (bindings.length !== 1) return null
        return {
          auth_identity_id: String(bindings[0].auth_identity_id),
          actor_type: String(bindings[0].actor_type),
          actor_id: String(bindings[0].actor_id),
        }
      })

      const email = actor
        ? await verifiedEmailForActorContext({ scope: container } as any, {
            ...actor,
            auth_provider: "emailpass",
            user_metadata: {},
          })
        : null

      if (!email) {
        await db.transactional(async (sql) => {
          await sql.execute(
            `update da_notification_digest_queue
             set failed_at = clock_timestamp()
             where id = any(?::text[]) and claim_id = ?`,
            [deliverableIds, claimId]
          )
        })
        continue
      }

      const access = container.resolve("dogruadresAccess") as {
        getActiveSmtpConfig(): Promise<{
          enabled: boolean
          host: string
          port: number
          security: "ssl" | "tls" | "none"
          username?: string | null
          password?: string | null
          from_email: string
          from_name?: string | null
        } | null>
      }
      const smtp = await access.getActiveSmtpConfig()
      if (!smtp || !smtp.enabled) {
        await db.transactional(async (sql) => {
          await sql.execute(
            `update da_notification_digest_queue
             set claimed_at = null, claim_id = null
             where id = any(?::text[]) and claim_id = ?`,
            [deliverableIds, claimId]
          )
        })
        continue
      }

      const deliverableItems = items.filter((i) => deliverableIds.includes(String(i.id)))
      const lines = deliverableItems.map((i) => `- ${String(i.category)}: ${String(i.event_action)}`).join("\n")
      await sendSmtpEmail(
        {
          to: email,
          subject: "DoğruAdres — Günlük Bildirim Özeti",
          text: `Hesabınıza ait günlük bildirim özeti:\n\n${lines}\n\nAyrıntılar için güvenli oturumunuzla DoğruAdres bildirim panelini ziyaret edin.`,
        },
        {
          enabled: true,
          host: smtp.host,
          port: smtp.port,
          security: smtp.security,
          username: smtp.username ?? undefined,
          password: smtp.password ?? undefined,
          fromEmail: smtp.from_email,
          fromName: smtp.from_name ?? undefined,
        }
      )

      await db.transactional(async (sql) => {
        await sql.execute(
          `update da_notification_digest_queue
           set sent_at = clock_timestamp()
           where id = any(?::text[]) and claim_id = ?`,
          [deliverableIds, claimId]
        )
      })
      processed += items.length
    } catch {
      await db.transactional(async (sql) => {
        await sql.execute(
          `update da_notification_digest_queue
           set claimed_at = null,
               claim_id = null,
               failed_at = case when attempts >= 4 then clock_timestamp() else null end
           where person_id = ? and claim_id = ? and sent_at is null`,
          [personId, claimId]
        )
      })
    }
  }

  return { processed }
}

const MAX_DIGEST_TICKS = 40

export default async function dogruadresNotificationDigestJob(container: MedusaContainer) {
  let totalProcessed = 0
  for (let tick = 0; tick < MAX_DIGEST_TICKS; tick++) {
    const result = await runNotificationDigestTick(container)
    totalProcessed += result.processed
    if (result.processed === 0) break
  }
  return { processed: totalProcessed }
}

export const config = {
  name: "dogruadres-notification-digest",
  schedule: "0 8 * * *",
}
