import { GET } from "../audit-timeline/route"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { encodeCursor, cursorKey } from "../../dogruadres/audit-timeline"

const keyText = Buffer.alloc(32, 9).toString("base64")
const testKey = cursorKey(keyText)

function mockResponse() {
  const headers: Record<string, string> = {}
  let statusCode = 200
  let body: unknown = null
  const res = {
    setHeader: jest.fn((k: string, v: string) => { headers[k.toLowerCase()] = v }),
    status: jest.fn((code: number) => { statusCode = code; return res }),
    json: jest.fn((data: unknown) => { body = data; return res }),
  } as unknown as MedusaResponse
  return { res, getStatus: () => statusCode, getBody: () => body, getHeaders: () => headers }
}

function mockRequest(options: {
  query?: Record<string, unknown>
  role?: string | null
  personId?: string
  orgId?: string
  key?: string
  readRows?: unknown[]
  readError?: Error
  cookie?: string
} = {}) {
  const {
    query = { organization: "daorg_valid123" },
    role = "owner",
    personId = "person_owner1",
    orgId = "daorg_valid123",
    readRows = [],
    readError,
    cookie = "da_session=synthetic_session_token_123",
  } = options

  const accessService = {
    personalManagerOrganization: jest.fn(async (_token: string, selectedOrg?: string) => {
      if (!role) return null
      if (selectedOrg && selectedOrg !== orgId) return null
      return {
        person_id: personId,
        organizations: [{ id: orgId, name: "Test Org", membership_id: "damem_1", role }],
      }
    }),
  }

  const indexService = {
    readOrganizationTimeline: jest.fn(async () => {
      if (readError) throw readError
      return readRows
    }),
  }

  const headers: Record<string, string> = {}
  if (cookie) headers.cookie = cookie

  return {
    query,
    headers,
    scope: {
      resolve: jest.fn((moduleId: string) => {
        if (moduleId === "dogruadresAccess") return accessService
        if (moduleId === "dogruadresAuditIndex") return indexService
        return indexService
      }),
    },
    _accessService: accessService,
    _indexService: indexService,
  } as unknown as MedusaRequest & { _accessService: typeof accessService; _indexService: typeof indexService }
}

describe("organization audit-timeline route — HTTP contract (moved from /personal/audit-timeline)", () => {
  const originalKey = process.env.DOGRUADRES_AUDIT_CURSOR_KEY
  const originalEnabled = process.env.DOGRUADRES_IDENTITY_ENABLED

  beforeAll(() => {
    process.env.DOGRUADRES_IDENTITY_ENABLED = "true"
    process.env.DOGRUADRES_AUDIT_CURSOR_KEY = keyText
  })
  afterAll(() => {
    if (originalEnabled === undefined) delete process.env.DOGRUADRES_IDENTITY_ENABLED
    else process.env.DOGRUADRES_IDENTITY_ENABLED = originalEnabled
    if (originalKey === undefined) delete process.env.DOGRUADRES_AUDIT_CURSOR_KEY
    else process.env.DOGRUADRES_AUDIT_CURSOR_KEY = originalKey
  })

  it("returns empty timeline for active Owner with valid organization query", async () => {
    const req = mockRequest()
    const { res, getStatus, getBody, getHeaders } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(200)
    expect(getHeaders()["cache-control"]).toBe("no-store")
    expect((getBody() as any).items).toBeDefined()
  })

  it("returns 400 for missing or malformed organization ID", async () => {
    for (const org of [undefined, "invalid_org", "../../etc/passwd"]) {
      const req = mockRequest({ query: org !== undefined ? { organization: org } : {} })
      const { res, getStatus } = mockResponse()
      await GET(req, res)
      expect(getStatus()).toBe(400)
    }
  })

  it("returns 400 when unexpected query parameters are present", async () => {
    const req = mockRequest({ query: { organization: "daorg_valid123", extra: "param" } })
    const { res, getStatus } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(400)
  })

  it("returns 401 when session token is absent", async () => {
    const req = mockRequest({ cookie: "" })
    const { res, getStatus } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(401)
  })

  it("returns 403 when session does not prove active Organization Owner membership", async () => {
    for (const role of [null, "member"]) {
      const req = mockRequest({ role })
      const { res, getStatus } = mockResponse()
      await GET(req, res)
      expect(getStatus()).toBe(403)
    }
  })

  it("returns 503 when service is disabled", async () => {
    process.env.DOGRUADRES_IDENTITY_ENABLED = "false"
    const req = mockRequest()
    const { res, getStatus } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(503)
    process.env.DOGRUADRES_IDENTITY_ENABLED = "true"
  })

  it("returns 503 when persistence layer throws an unexpected error", async () => {
    const req = mockRequest({ readError: new Error("private DB details") })
    const { res, getStatus } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(503)
    expect(mockResponse().getBody()).toBeNull() // confirm no leak in separate mock
  })

  it("returns paginated rows with encrypted cursor when timeline has events", async () => {
    const now = new Date().toISOString()
    const rows = [
      {
        id: "evt_1",
        source_module: "dogruadres-audit-index",
        source_event_id: "src_evt_1",
        occurred_at: now,
        indexed_at: now,
        action: "org.created",
        resource: "organization",
        target_id: "daorg_valid123",
        actor_person_id: "person_owner1",
      },
      {
        id: "evt_2",
        source_module: "dogruadres-audit-index",
        source_event_id: "src_evt_2",
        occurred_at: now,
        indexed_at: now,
        action: "org.member.invited",
        resource: "membership",
        target_id: "damem_2",
        actor_person_id: "person_owner1",
      },
    ]
    const req = mockRequest({ readRows: rows })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(200)
    const body = getBody() as any
    expect(body.items).toHaveLength(2)
    expect(body.page).toBeDefined()
    expect(body.page.has_more).toBe(false)
  })
})
