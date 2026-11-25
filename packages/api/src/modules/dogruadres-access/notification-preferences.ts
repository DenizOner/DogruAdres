import { randomUUID } from "node:crypto"
import { IdentityAccessDenied, IdentitySessions, type SecuritySql } from "./identity-session"

export type EmailFrequency = "immediate" | "daily_digest" | "off"

export type NotificationCategoryId =
  | "security_account"
  | "owner_closing"
  | "organization_membership"
  | "store_operations"
  | "buyer_orders"
  | "seller_operations"
  | "platform_announcements"
  | "marketing_promotions"

export interface ChannelPreference {
  platform: boolean
  email: EmailFrequency
  mobile: boolean
}

export type NotificationPreferenceMap = Record<NotificationCategoryId, ChannelPreference>

export interface NotificationCategoryMeta {
  id: NotificationCategoryId
  critical: boolean
  default_preference: ChannelPreference
}

export interface MobileChannelCapability {
  supported: false
  permission_granted: false
  reason: "mobile_push_not_configured"
}

export const MOBILE_CHANNEL_CAPABILITY: MobileChannelCapability = {
  supported: false,
  permission_granted: false,
  reason: "mobile_push_not_configured",
}

/**
 * Server-owned canonical notification event catalog.
 * Critical security and Owner/closing categories cannot be disabled or downgraded to digest.
 * Mobile push is not configured in the platform; mobile=true is rejected fail-closed.
 */
export const NOTIFICATION_CATEGORY_CATALOG: ReadonlyArray<NotificationCategoryMeta> = [
  {
    id: "security_account",
    critical: true,
    default_preference: { platform: true, email: "immediate", mobile: false },
  },
  {
    id: "owner_closing",
    critical: true,
    default_preference: { platform: true, email: "immediate", mobile: false },
  },
  {
    id: "organization_membership",
    critical: false,
    default_preference: { platform: true, email: "immediate", mobile: false },
  },
  {
    id: "store_operations",
    critical: false,
    default_preference: { platform: true, email: "immediate", mobile: false },
  },
  {
    id: "buyer_orders",
    critical: false,
    default_preference: { platform: true, email: "immediate", mobile: false },
  },
  {
    id: "seller_operations",
    critical: false,
    default_preference: { platform: true, email: "immediate", mobile: false },
  },
  {
    id: "platform_announcements",
    critical: false,
    default_preference: { platform: true, email: "immediate", mobile: false },
  },
  {
    id: "marketing_promotions",
    critical: false,
    default_preference: { platform: false, email: "off", mobile: false },
  },
] as const

const CATEGORY_MAP = new Map<NotificationCategoryId, NotificationCategoryMeta>(
  NOTIFICATION_CATEGORY_CATALOG.map((c) => [c.id, c])
)

export function defaultNotificationPreferences(): NotificationPreferenceMap {
  const out = {} as NotificationPreferenceMap
  for (const cat of NOTIFICATION_CATEGORY_CATALOG) {
    out[cat.id] = { ...cat.default_preference }
  }
  return out
}

export class NotificationPreferenceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NotificationPreferenceValidationError"
  }
}

export class NotificationPreferenceConflictError extends Error {
  constructor() {
    super("Notification preferences changed; refresh before retry")
    this.name = "NotificationPreferenceConflictError"
  }
}

/**
 * Validates and normalizes a preference map against the canonical catalog.
 * Fails closed on unknown categories, critical-category downgrade/disable, or mobile=true.
 */
export function validatePreferenceMap(raw: unknown): NotificationPreferenceMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new NotificationPreferenceValidationError("Invalid preferences object")
  }
  const input = raw as Record<string, unknown>
  const keys = Object.keys(input)
  if (keys.length !== NOTIFICATION_CATEGORY_CATALOG.length) {
    throw new NotificationPreferenceValidationError("Missing or extra notification categories")
  }
  const result = {} as NotificationPreferenceMap
  for (const cat of NOTIFICATION_CATEGORY_CATALOG) {
    const entry = input[cat.id]
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new NotificationPreferenceValidationError(`Invalid preference for ${cat.id}`)
    }
    const rec = entry as Record<string, unknown>
    const allowedKeys = new Set(["platform", "email", "mobile"])
    for (const k of Object.keys(rec)) {
      if (!allowedKeys.has(k)) {
        throw new NotificationPreferenceValidationError(`Unexpected field ${k} in ${cat.id}`)
      }
    }
    if (typeof rec.platform !== "boolean" || typeof rec.mobile !== "boolean") {
      throw new NotificationPreferenceValidationError(`Invalid boolean channel in ${cat.id}`)
    }
    if (rec.email !== "immediate" && rec.email !== "daily_digest" && rec.email !== "off") {
      throw new NotificationPreferenceValidationError(`Invalid email frequency in ${cat.id}`)
    }
    if (rec.mobile === true) {
      throw new NotificationPreferenceValidationError("Mobile push is not supported without verified device permission")
    }
    if (cat.critical && (rec.platform !== true || rec.email !== "immediate")) {
      throw new NotificationPreferenceValidationError(`Critical category ${cat.id} cannot be disabled or downgraded`)
    }
    result[cat.id] = {
      platform: rec.platform,
      email: rec.email,
      mobile: false,
    }
  }
  return result
}

function hydrateStoredPreferences(raw: unknown): NotificationPreferenceMap {
  const defaults = defaultNotificationPreferences()
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults
  const obj = raw as Record<string, unknown>
  for (const cat of NOTIFICATION_CATEGORY_CATALOG) {
    const entry = obj[cat.id]
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    const rec = entry as Record<string, unknown>
    if (cat.critical) {
      defaults[cat.id] = { platform: true, email: "immediate", mobile: false }
      continue
    }
    const platform = typeof rec.platform === "boolean" ? rec.platform : defaults[cat.id].platform
    const email =
      rec.email === "immediate" || rec.email === "daily_digest" || rec.email === "off"
        ? rec.email
        : defaults[cat.id].email
    defaults[cat.id] = { platform, email, mobile: false }
  }
  return defaults
}

export class PersonalNotificationPreferences {
  constructor(private readonly db: SecuritySql) {}

  private async authorize(token: string) {
    const session = await new IdentitySessions(this.db).current(token, false, false)
    if (!session) throw new IdentityAccessDenied()
    return session
  }

  async get(token: string) {
    const session = await this.authorize(token)
    const rows = await this.db.execute(
      `select preferences, version, updated_at
       from da_person_notification_preference
       where person_id = ?`,
      [session.person_id]
    )
    if (rows.length === 0) {
      return {
        preferences: defaultNotificationPreferences(),
        defaults: defaultNotificationPreferences(),
        categories: NOTIFICATION_CATEGORY_CATALOG,
        mobile_channel: MOBILE_CHANNEL_CAPABILITY,
        version: 0,
        updated_at: null as string | null,
      }
    }
    return {
      preferences: hydrateStoredPreferences(rows[0].preferences),
      defaults: defaultNotificationPreferences(),
      categories: NOTIFICATION_CATEGORY_CATALOG,
      mobile_channel: MOBILE_CHANNEL_CAPABILITY,
      version: Number(rows[0].version),
      updated_at: rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : null,
    }
  }

  async update(
    token: string,
    input: { action: "update"; preferences: unknown; expected_version: number } | { action: "reset_defaults"; expected_version: number },
    persistAudit: (events: Array<{
      actor_person_id: string
      actor_type: string
      actor_id: string
      action: string
      module: string
      resource: string
      target_id: string
      new_values: Record<string, unknown>
      occurred_at: Date
    }>) => Promise<void>,
    auditModule: string
  ) {
    const session = await this.authorize(token)
    if (
      !Number.isSafeInteger(input.expected_version) ||
      input.expected_version < 0 ||
      input.expected_version > 2147483646
    ) {
      throw new NotificationPreferenceValidationError("Invalid expected_version")
    }

    const nextPreferences =
      input.action === "reset_defaults"
        ? defaultNotificationPreferences()
        : validatePreferenceMap(input.preferences)

    const existing = await this.db.execute(
      `select id, preferences, version
       from da_person_notification_preference
       where person_id = ? for update`,
      [session.person_id]
    )

    const currentVersion = existing.length === 1 ? Number(existing[0].version) : 0
    if (currentVersion !== input.expected_version) {
      throw new NotificationPreferenceConflictError()
    }

    const serialized = JSON.stringify(nextPreferences)
    let savedVersion: number
    let updatedAt: string

    if (existing.length === 0) {
      const id = "danpref_" + randomUUID()
      const inserted = await this.db.execute(
        `insert into da_person_notification_preference
          (id, person_id, preferences, version, updated_at)
         values (?, ?, ?::jsonb, 1, clock_timestamp())
         returning version, updated_at`,
        [id, session.person_id, serialized]
      )
      savedVersion = Number(inserted[0].version)
      updatedAt = new Date(inserted[0].updated_at).toISOString()
    } else {
      const updated = await this.db.execute(
        `update da_person_notification_preference
         set preferences = ?::jsonb,
             version = version + 1,
             updated_at = clock_timestamp()
         where person_id = ? and version = ?
         returning version, updated_at`,
        [serialized, session.person_id, input.expected_version]
      )
      if (updated.length !== 1) {
        throw new NotificationPreferenceConflictError()
      }
      savedVersion = Number(updated[0].version)
      updatedAt = new Date(updated[0].updated_at).toISOString()
    }

    await persistAudit([
      {
        actor_person_id: session.person_id,
        actor_type: session.actor_type,
        actor_id: session.actor_id,
        action:
          input.action === "reset_defaults"
            ? "person.notification_preferences_reset"
            : "person.notification_preferences_updated",
        module: auditModule,
        resource: "person-notification-preference",
        target_id: session.person_id,
        new_values: { version: savedVersion },
        occurred_at: new Date(),
      },
    ])

    return {
      preferences: nextPreferences,
      defaults: defaultNotificationPreferences(),
      categories: NOTIFICATION_CATEGORY_CATALOG,
      mobile_channel: MOBILE_CHANNEL_CAPABILITY,
      version: savedVersion,
      updated_at: updatedAt,
    }
  }

  /**
   * Resolves effective delivery mode for a Person and category.
   * Critical categories always return platform=true, email='immediate', mobile=false.
   */
  async resolveForPerson(personId: string, category: NotificationCategoryId): Promise<ChannelPreference> {
    const meta = CATEGORY_MAP.get(category)
    if (!meta) throw new NotificationPreferenceValidationError(`Unknown category: ${category}`)
    if (meta.critical) return { platform: true, email: "immediate", mobile: false }

    const rows = await this.db.execute(
      `select preferences from da_person_notification_preference where person_id = ?`,
      [personId]
    )
    if (rows.length === 0) return { ...meta.default_preference }
    const hydrated = hydrateStoredPreferences(rows[0].preferences)
    return hydrated[category]
  }

  /**
   * Queues an optional notification into the daily digest queue with deduplication.
   * Critical categories are never queued as digest.
   */
  async enqueueDigest(input: {
    person_id: string
    organization_id?: string | null
    category: NotificationCategoryId
    event_action: string
    audit_event_id?: string | null
    summary_key: string
  }) {
    const meta = CATEGORY_MAP.get(input.category)
    if (!meta || meta.critical) {
      throw new NotificationPreferenceValidationError("Critical notifications cannot be queued for daily digest")
    }
    const id = "dadig_" + randomUUID()
    await this.db.execute(
      `insert into da_notification_digest_queue
        (id, person_id, organization_id, category, event_action, audit_event_id, summary_key)
       values (?, ?, ?, ?, ?, ?, ?)
       on conflict (person_id, audit_event_id) do nothing`,
      [
        id,
        input.person_id,
        input.organization_id ?? null,
        input.category,
        input.event_action,
        input.audit_event_id ?? null,
        input.summary_key,
      ]
    )
    return { queued: true as const }
  }
}
