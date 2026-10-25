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
  enabled?: string
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
    personalOrganizations: jest.fn(async (_token: string, selectedOrg?: string) => {
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

  const req = {
    query,
    headers,
    scope: {
      resolve: jest.fn((name: string) => {
        if (name === "dogruadresAccess") return accessService
        if (name === "dogruadresAuditIndex") return indexService
        throw new Error(`Unknown service: ${name}`)
      }),
    },
  } as unknown as MedusaRequest

  return { req, accessService, indexService }
}

describe("Personal audit timeline route (GET /personal/audit-timeline)", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, DOGRUADRES_IDENTITY_ENABLED: "true", DOGRUADRES_AUDIT_CURSOR_KEY: keyText }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it("returns 503 when identity is disabled", async () => {
    process.env.DOGRUADRES_IDENTITY_ENABLED = "false"
    const { req } = mockRequest()
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(503)
    expect(getBody()).toEqual({ message: "Unavailable" })
  })

  it("returns 401 when personal session cookie is absent", async () => {
    const { req } = mockRequest({ cookie: "" })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(401)
    expect(getBody()).toEqual({ message: "Personal session required" })
  })

  it.each([{}, { organization: "" }, { organization: "invalid!" }, { organization: "daorg_toolong".repeat(10) }])(
    "returns 400 for invalid organization parameter %#",
    async (query) => {
      const { req } = mockRequest({ query })
      const { res, getStatus, getBody } = mockResponse()
      await GET(req, res)
      expect(getStatus()).toBe(400)
      expect(getBody()).toEqual({ message: "Invalid input" })
    }
  )

  it("returns 400 for unexpected extra query parameters (strict allowlist)", async () => {
    const { req } = mockRequest({ query: { organization: "daorg_valid123", unauthorized_param: "malicious" } })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(400)
    expect(getBody()).toEqual({ message: "Invalid input" })
  })

  it("returns 403 when session is invalid or user has no membership in organization", async () => {
    const { req } = mockRequest({ role: null })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(403)
    expect(getBody()).toEqual({ message: "Access denied" })
  })

  it("returns 403 for platform-only user who lacks organization owner/admin membership", async () => {
    const { req } = mockRequest({ role: null })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(403)
    expect(getBody()).toEqual({ message: "Access denied" })
  })

  it("returns 403 when user is only a member (not owner or admin)", async () => {
    const { req } = mockRequest({ role: "member" })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(403)
    expect(getBody()).toEqual({ message: "Access denied" })
  })

  it("returns 403 when active session owner is demoted to revoked status", async () => {
    const { req } = mockRequest({ role: "revoked" })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(403)
    expect(getBody()).toEqual({ message: "Access denied" })
  })

  it("returns 400 when cursor belongs to a different person (cross-person protection)", async () => {
    const crossPersonCursor = encodeCursor(
      { organizationId: "daorg_valid123", personId: "foreign_person_xyz", limit: 25 },
      { id: "daidx_prev", occurred_at: "2026-10-25T10:00:00.000Z" },
      testKey
    )
    const { req } = mockRequest({
      query: { organization: "daorg_valid123", cursor: crossPersonCursor },
      personId: "person_owner1"
    })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(400)
    expect(getBody()).toEqual({ message: "Invalid timeline pagination" })
  })

  it("returns 400 when cursor belongs to a different organization (cross-org protection)", async () => {
    const crossOrgCursor = encodeCursor(
      { organizationId: "daorg_other_456", personId: "person_owner1", limit: 25 },
      { id: "daidx_prev", occurred_at: "2026-10-25T10:00:00.000Z" },
      testKey
    )
    const { req } = mockRequest({
      query: { organization: "daorg_valid123", cursor: crossOrgCursor },
      orgId: "daorg_valid123",
      personId: "person_owner1"
    })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(400)
    expect(getBody()).toEqual({ message: "Invalid timeline pagination" })
  })

  it("enforces strict data redaction: returns only canonical projection fields, zero secrets", async () => {
    const rowWithSecrets = {
      id: "daidx_1",
      source_module: "dogruadres-access",
      source_event_id: "daaud_1",
      occurred_at: "2026-10-25T12:00:00.000Z",
      indexed_at: "2026-10-25T12:00:01.000Z",
      action: "organization.provisioned",
      resource: "organization",
      target_id: "daorg_valid123",
      actor_person_id: "person_1",
      password_hash: "SECRET_PASSWORD_HASH",
      raw_token: "LEAKED_TOKEN",
      mfa_seed: "SECRET_MFA_SEED"
    }
    const { req } = mockRequest({ role: "owner", readRows: [rowWithSecrets] })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(200)
    const data = getBody() as any
    const item = data.items[0]
    expect(item).toEqual({
      id: "daidx_1",
      source_module: "dogruadres-access",
      source_event_id: "daaud_1",
      occurred_at: "2026-10-25T12:00:00.000Z",
      indexed_at: "2026-10-25T12:00:01.000Z",
      action: "organization.provisioned",
      resource: "organization",
      target_id: "daorg_valid123",
      actor: { person_id: "person_1" },
    })
    expect(item.password_hash).toBeUndefined()
    expect(item.raw_token).toBeUndefined()
    expect(item.mfa_seed).toBeUndefined()
  })

  it("returns genuine honest empty state for organization with zero audit entries", async () => {
    const { req } = mockRequest({ role: "owner", readRows: [] })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(200)
    const data = getBody() as any
    expect(data.items).toEqual([])
    expect(data.page.has_more).toBe(false)
    expect(data.page.next_cursor).toBeNull()
    expect(data.projection).toEqual({ consistency: "eventual", completeness: "not_guaranteed" })
  })

  it.each(["owner", "admin"])(
    "returns 200 with timeline items and eventual consistency notice for active %s",
    async (role) => {
      const row = {
        id: "daidx_1",
        source_module: "dogruadres-access",
        source_event_id: "daaud_1",
        occurred_at: "2026-10-25T12:00:00.000Z",
        indexed_at: "2026-10-25T12:00:01.000Z",
        action: "organization.provisioned",
        resource: "organization",
        target_id: "daorg_valid123",
        actor_person_id: "person_1",
      }
      const { req, indexService } = mockRequest({ role, readRows: [row] })
      const { res, getStatus, getBody, getHeaders } = mockResponse()
      await GET(req, res)
      expect(getStatus()).toBe(200)
      expect(getHeaders()["cache-control"]).toBe("no-store")
      expect(indexService.readOrganizationTimeline).toHaveBeenCalledWith("daorg_valid123", 25, undefined)
      const data = getBody() as any
      expect(data.items).toHaveLength(1)
      expect(data.items[0]).toEqual({
        id: "daidx_1",
        source_module: "dogruadres-access",
        source_event_id: "daaud_1",
        occurred_at: "2026-10-25T12:00:00.000Z",
        indexed_at: "2026-10-25T12:00:01.000Z",
        action: "organization.provisioned",
        resource: "organization",
        target_id: "daorg_valid123",
        actor: { person_id: "person_1" },
      })
      expect(data.projection).toEqual({ consistency: "eventual", completeness: "not_guaranteed" })
      expect(data.page.has_more).toBe(false)
      expect(data.page.next_cursor).toBeNull()
    }
  )

  it("returns 503 when index read fails (service outage)", async () => {
    const { req } = mockRequest({ role: "owner", readError: new Error("Index database down") })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(503)
    expect(getBody()).toEqual({ message: "Audit timeline unavailable" })
  })

  it("returns 503 when DOGRUADRES_AUDIT_CURSOR_KEY is missing", async () => {
    delete process.env.DOGRUADRES_AUDIT_CURSOR_KEY
    const { req } = mockRequest({ role: "owner" })
    const { res, getStatus, getBody } = mockResponse()
    await GET(req, res)
    expect(getStatus()).toBe(503)
    expect(getBody()).toEqual({ message: "Audit timeline unavailable" })
  })
})
