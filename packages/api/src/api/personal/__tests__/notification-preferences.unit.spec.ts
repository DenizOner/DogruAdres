import { GET, POST } from "../notification-preferences/route"
import { GET as personalPageGET } from "../route"
import { access, csrf, enabled, sessionToken } from "../security"
import { IdentityAccessDenied, IdentitySessions } from "../../../modules/dogruadres-access/identity-session"
import {
  defaultNotificationPreferences,
  NotificationPreferenceConflictError,
  NotificationPreferenceValidationError,
  PersonalNotificationPreferences,
  queueDigestIfEligible,
  validatePreferenceMap,
} from "../../../modules/dogruadres-access/notification-preferences"

jest.mock("../security", () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe("personal notification preferences HTTP contract (#275)", () => {
  let service: any
  let req: any
  let res: any
  const validToken = "a".repeat(43)

  beforeEach(() => {
    service = {
      personalSession: jest.fn(async () => ({ person_id: "daprs_person_a" })),
      personalNotificationPreferences: jest.fn(async () => ({
        preferences: defaultNotificationPreferences(),
        defaults: defaultNotificationPreferences(),
        categories: [],
        mobile_channel: {
          supported: false,
          permission_granted: false,
          reason: "mobile_push_not_configured",
        },
        version: 0,
        updated_at: null,
      })),
      savePersonalNotificationPreferences: jest.fn(async () => ({
        preferences: defaultNotificationPreferences(),
        defaults: defaultNotificationPreferences(),
        categories: [],
        mobile_channel: {
          supported: false,
          permission_granted: false,
          reason: "mobile_push_not_configured",
        },
        version: 1,
        updated_at: "2026-11-25T10:00:00.000Z",
      })),
    }
    req = {
      query: {},
      body: {
        action: "update",
        preferences: defaultNotificationPreferences(),
        expected_version: 0,
      },
    }
    res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(validToken)
    ;(access as jest.Mock).mockReturnValue(service)
    ;(csrf as jest.Mock).mockResolvedValue(true)
  })

  it("sets Cache-Control: no-store and returns 200 on valid GET", async () => {
    await GET(req, res)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
    expect(service.personalNotificationPreferences).toHaveBeenCalledWith(validToken)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ version: 0 }))
  })

  it("returns 401 when session token is missing/malformed or session is expired", async () => {
    ;(sessionToken as jest.Mock).mockReturnValue("short")
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(service.personalNotificationPreferences).not.toHaveBeenCalled()

    ;(sessionToken as jest.Mock).mockReturnValue(validToken)
    service.personalSession.mockResolvedValue(null)
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(service.savePersonalNotificationPreferences).not.toHaveBeenCalled()
  })

  it("returns 403 when CSRF validation fails on POST", async () => {
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.savePersonalNotificationPreferences).not.toHaveBeenCalled()
  })

  it("returns 400 when caller supplies person_id, organization_id, or query params", async () => {
    req.query = { person_id: "daprs_other" }
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(400)

    req.query = {}
    req.body = { ...req.body, person_id: "daprs_other" }
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.savePersonalNotificationPreferences).not.toHaveBeenCalled()
  })

  it("returns 409 on concurrent version mismatch", async () => {
    service.savePersonalNotificationPreferences.mockRejectedValue(
      new NotificationPreferenceConflictError()
    )
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(409)
  })

  it("returns 400 when domain validation rejects critical-category disable or mobile=true", async () => {
    service.savePersonalNotificationPreferences.mockRejectedValue(
      new NotificationPreferenceValidationError("Critical category cannot be disabled")
    )
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 503 when identity is disabled or persistence fails", async () => {
    ;(enabled as jest.Mock).mockReturnValue(false)
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(503)

    ;(enabled as jest.Mock).mockReturnValue(true)
    service.savePersonalNotificationPreferences.mockRejectedValue(new Error("PG timeout"))
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(503)
  })
})

describe("PersonalNotificationPreferences domain invariants & isolation", () => {
  afterEach(() => jest.restoreAllMocks())

  it("rejects disabling or downgrading critical categories and mobile=true", () => {
    const prefs = defaultNotificationPreferences()
    expect(prefs.marketing_promotions.platform).toBe(false)
    expect(prefs.marketing_promotions.email).toBe("off")
    expect(prefs.buyer_orders.platform).toBe(true)
    expect(prefs.buyer_orders.email).toBe("immediate")

    expect(() =>
      validatePreferenceMap({
        ...prefs,
        security_account: { platform: false, email: "immediate", mobile: false },
      })
    ).toThrow(NotificationPreferenceValidationError)

    expect(() =>
      validatePreferenceMap({
        ...prefs,
        owner_closing: { platform: true, email: "daily_digest", mobile: false },
      })
    ).toThrow(NotificationPreferenceValidationError)

    expect(() =>
      validatePreferenceMap({
        ...prefs,
        buyer_orders: { platform: true, email: "immediate", mobile: true },
      })
    ).toThrow(NotificationPreferenceValidationError)
  })

  it("isolates preferences per canonical Person (two separate Persons)", async () => {
    jest
      .spyOn(IdentitySessions.prototype, "current")
      .mockImplementation(async (token: string) => ({
        person_id: token === "tok_a" ? "daprs_a" : "daprs_b",
        actor_type: "customer",
        actor_id: token === "tok_a" ? "cus_a" : "cus_b",
      }) as any)

    const execute = jest.fn(async (_sql: string, params: unknown[]) => {
      if (params[0] === "daprs_a") {
        return [
          {
            preferences: {
              ...defaultNotificationPreferences(),
              buyer_orders: { platform: false, email: "daily_digest", mobile: false },
            },
            version: 2,
            updated_at: "2026-11-25T10:00:00.000Z",
          },
        ]
      }
      return []
    })

    const store = new PersonalNotificationPreferences({ execute } as any)
    const a = await store.get("tok_a")
    const b = await store.get("tok_b")

    expect(a.version).toBe(2)
    expect(a.preferences.buyer_orders.email).toBe("daily_digest")
    expect(b.version).toBe(0)
    expect(b.preferences.buyer_orders.email).toBe("immediate")
  })

  it("rejects queuing critical categories into daily digest", async () => {
    const execute = jest.fn()
    const store = new PersonalNotificationPreferences({ execute } as any)
    await expect(
      store.enqueueDigest({
        person_id: "daprs_a",
        category: "owner_closing",
        event_action: "organization.store_platform_closing_started",
        summary_key: "closing",
      })
    ).rejects.toThrow(NotificationPreferenceValidationError)
    expect(execute).not.toHaveBeenCalled()
  })

  it("exposes notification bell gear button and preferences section in /personal HTML", async () => {
    const htmlRes = {
      setHeader: jest.fn(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
    ;(enabled as jest.Mock).mockReturnValue(true)
    await personalPageGET({} as any, htmlRes as any)
    const html = htmlRes.send.mock.calls[0]?.[0] as string
    expect(html).toContain('id="notification-settings-link"')
    expect(html).toContain('id="notification-preferences-section"')
    expect(html).toContain('id="notif-pref-advanced"')
  })

  it("queues digest via queueDigestIfEligible only when user preferred daily_digest", async () => {
    const execute = jest.fn(async (sql: string) => {
      if (sql.includes("select preferences from da_person_notification_preference")) {
        return [
          {
            preferences: {
              ...defaultNotificationPreferences(),
              store_operations: { platform: true, email: "daily_digest", mobile: false },
            },
          },
        ]
      }
      return []
    })
    await queueDigestIfEligible({ execute } as any, {
      person_id: "daprs_a",
      category: "store_operations",
      event_action: "organization.store_draft_permission_granted",
      audit_event_id: "daud_1",
      summary_key: "draft_perm",
    })
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute.mock.calls[1][0]).toContain("insert into da_notification_digest_queue")
  })

  it("renderPersonalConsole generates accessible names for all preference controls", async () => {
    const htmlRes = {
      setHeader: jest.fn(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
    ;(enabled as jest.Mock).mockReturnValue(true)
    await personalPageGET({} as any, htmlRes as any)
    const html = htmlRes.send.mock.calls[0]?.[0] as string
    expect(html).toContain("catLabel+' — Platform içi'")
    expect(html).toContain("catLabel+' — E-posta'")
    expect(html).toContain("catLabel+' — Mobil'")
  })
})
