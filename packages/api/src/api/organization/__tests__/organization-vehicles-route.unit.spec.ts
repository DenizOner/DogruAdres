/**
 * Route handler unit tests for GET /organization/vehicles (#482 Aşama 1).
 *
 * Covers:
 *  - 400 when organization query param is missing or malformed
 *  - 403 when personalOrganizations returns empty (no active membership)
 *  - 503 when DOGRUADRES_IDENTITY_ENABLED is false (feature flag off)
 *  - 200 with vehicle list when all checks pass
 *  - POST/PATCH/DELETE return 503 (mutation gate closed pending Policy A)
 *  - GET /personal/vehicles returns 410 Gone (moved)
 */
import { GET, POST, PATCH, DELETE } from "../vehicles/route"
import { GET as PersonalVehiclesGET } from "../../personal/vehicles/route"

function makeRes() {
  const res: any = {
    _status: 200,
    _body: undefined,
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }
  // Chain: res.status(x).json(y) → capture both
  res.status.mockImplementation((code: number) => {
    res._status = code
    return res
  })
  res.json.mockImplementation((body: unknown) => {
    res._body = body
    return res
  })
  return res
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    query: {},
    headers: {},
    scope: {
      resolve: jest.fn(),
    },
    ...overrides,
  } as any
}

describe("GET /organization/vehicles — route handler access control", () => {
  let origEnabled: string | undefined

  beforeEach(() => {
    origEnabled = process.env.DOGRUADRES_IDENTITY_ENABLED
    process.env.DOGRUADRES_IDENTITY_ENABLED = "true"
  })
  afterEach(() => {
    if (origEnabled === undefined) delete process.env.DOGRUADRES_IDENTITY_ENABLED
    else process.env.DOGRUADRES_IDENTITY_ENABLED = origEnabled
    jest.restoreAllMocks()
  })

  it("returns 503 when feature flag DOGRUADRES_IDENTITY_ENABLED is off", async () => {
    process.env.DOGRUADRES_IDENTITY_ENABLED = "false"
    const req = makeReq({ query: { organization: "daorg_01JBMX1234567890ABCDEFGH0" } })
    const res = makeRes()
    await GET(req, res)
    expect(res._status).toBe(503)
  })

  it("returns 400 when organization query param is missing", async () => {
    const req = makeReq({ query: {} })
    const res = makeRes()
    await GET(req, res)
    expect(res._status).toBe(400)
    expect(res._body).toMatchObject({ message: expect.stringContaining("Invalid") })
  })

  it("returns 400 when organization query param is an empty string", async () => {
    const req = makeReq({ query: { organization: "" } })
    const res = makeRes()
    await GET(req, res)
    expect(res._status).toBe(400)
  })

  it("returns 400 when organization query param has invalid format (no daorg_ prefix)", async () => {
    const req = makeReq({ query: { organization: "org_invalid" } })
    const res = makeRes()
    await GET(req, res)
    expect(res._status).toBe(400)
  })

  it("returns 400 when organization query param is an array (query injection attempt)", async () => {
    const req = makeReq({ query: { organization: ["daorg_01JBMX1234567890ABCDEFGH0", "daorg_01JBMX1234567890ABCDEFGH1"] } })
    const res = makeRes()
    await GET(req, res)
    expect(res._status).toBe(400)
  })

  it("returns 403 when personalOrganizations returns no memberships (access denied)", async () => {    const mockAccess = {
      personalOrganizations: jest.fn().mockResolvedValue({ organizations: [] }),
    }
    // The route calls access(req) which calls req.scope.resolve — mock at module level
    const securityMod = require("../../personal/security")
    jest.spyOn(securityMod, "sessionToken").mockReturnValue("tok_mock")
    jest.spyOn(securityMod, "access").mockReturnValue(mockAccess)

    const req = makeReq({ query: { organization: "daorg_01JBMX1234567890ABCDEFGH0" } })
    const res = makeRes()
    await GET(req, res)
    expect(res._status).toBe(403)
    expect(res._body).toMatchObject({ message: expect.stringContaining("Access denied") })
  })

  it("returns 403 when organization membership status is not active (Policy A active-status gate)", async () => {
    // ADR-0007 Policy A: every request-time auth chain link must enforce active-status.
    // A suspended/inactive organization member must NOT be able to read vehicle data.
    const securityMod = require("../../personal/security")
    jest.spyOn(securityMod, "sessionToken").mockReturnValue("tok_mock")
    jest.spyOn(securityMod, "access").mockReturnValue({
      personalOrganizations: jest.fn().mockResolvedValue({
        organizations: [{ id: "daorg_01JBMX1234567890ABCDEFGH0", role: "owner", status: "suspended" }],
      }),
    })

    const req = makeReq({ query: { organization: "daorg_01JBMX1234567890ABCDEFGH0" } })
    const res = makeRes()
    await GET(req, res)
    expect(res._status).toBe(403)
    expect(res._body).toMatchObject({ message: expect.stringContaining("not active") })
  })

  it("returns 403 when personalOrganizations returns null", async () => {
    const securityMod = require("../../personal/security")
    jest.spyOn(securityMod, "sessionToken").mockReturnValue("tok_mock")
    jest.spyOn(securityMod, "access").mockReturnValue({
      personalOrganizations: jest.fn().mockResolvedValue(null),
    })

    const req = makeReq({ query: { organization: "daorg_01JBMX1234567890ABCDEFGH0" } })
    const res = makeRes()
    await GET(req, res)
    expect(res._status).toBe(403)
  })

  it("returns 200 with vehicle list when organization membership is confirmed", async () => {
    const securityMod = require("../../personal/security")
    jest.spyOn(securityMod, "sessionToken").mockReturnValue("tok_mock")
    jest.spyOn(securityMod, "access").mockReturnValue({
      personalOrganizations: jest.fn().mockResolvedValue({
        organizations: [{ id: "daorg_01JBMX1234567890ABCDEFGH0", role: "owner", status: "active" }],
      }),
    })

    const mockVehicles = [
      {
        id: "daveh_01JBMX1234567890ABCDEFGH1",
        organization_id: "daorg_01JBMX1234567890ABCDEFGH0",
        plate: "34 ABC 123",
        plate_key: "34abc123",
        vin: null,
        vin_key: null,
        label: "Test Araç",
        make: "Ford",
        model: "Focus",
        model_year: 2020,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ]
    const mockVehicleService = { listLiveVehicles: jest.fn().mockResolvedValue(mockVehicles) }
    const req = makeReq({
      query: { organization: "daorg_01JBMX1234567890ABCDEFGH0" },
      scope: { resolve: jest.fn().mockReturnValue(mockVehicleService) },
    })
    const res = makeRes()
    await GET(req, res)
    expect(res._status).not.toBe(400)
    expect(res._status).not.toBe(403)
    expect(res._body).toHaveProperty("vehicles")
    expect(res._body.vehicles).toHaveLength(1)
    expect(res._body.vehicles[0].plate).toBe("34 ABC 123")
  })
})

describe("POST|PATCH|DELETE /organization/vehicles — mutation gate closed (Policy A pending)", () => {
  it("POST returns 503 Service Unavailable", async () => {
    const res = makeRes()
    await POST(makeReq(), res)
    expect(res._status).toBe(503)
  })

  it("PATCH returns 503 Service Unavailable", async () => {
    const res = makeRes()
    await PATCH(makeReq(), res)
    expect(res._status).toBe(503)
  })

  it("DELETE returns 503 Service Unavailable", async () => {
    const res = makeRes()
    await DELETE(makeReq(), res)
    expect(res._status).toBe(503)
  })
})

describe("GET /personal/vehicles — 410 Gone (moved to /organization/vehicles)", () => {
  it("returns 410 with redirect hint for all methods", async () => {
    const res = makeRes()
    await PersonalVehiclesGET(makeReq(), res)
    expect(res._status).toBe(410)
    expect(res._body).toMatchObject({ message: expect.stringContaining("/organization/vehicles") })
  })
})
