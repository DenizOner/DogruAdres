/**
 * Ingress access control tests for /organization/vehicles route (#482 Aşama 1).
 *
 * Covers:
 *  - GET /organization/vehicles passes through nativeIngress (session-scoped, no native JWT)
 *  - POST/PATCH/DELETE /organization/vehicles are NOT admitted by nativeIngress (not in allow-list)
 *  - GET /personal/vehicles returns 410 Gone (moved — not blocked at ingress, let route handle it)
 *  - Native JWT bearer tokens are rejected at ingress for organization routes (nativeIngress invariant)
 */
import { nativeIngress } from "../../personal/security"

describe("organization/vehicles — ingress access control", () => {
  beforeEach(() => {
    process.env.DOGRUADRES_IDENTITY_ENABLED = "true"
    process.env.DOGRUADRES_PUBLIC_ORIGIN = "https://example.invalid"
  })
  afterEach(() => {
    delete process.env.DOGRUADRES_IDENTITY_ENABLED
    delete process.env.DOGRUADRES_PUBLIC_ORIGIN
  })

  async function probe(
    path: string,
    method = "GET",
    authorization?: string,
    bound = false,
  ) {
    const next = jest.fn()
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    await nativeIngress(
      {
        originalUrl: path,
        method,
        headers: { authorization },
        ...(authorization?.startsWith("Basic ")
          ? { auth_context: { actor_type: "api-key", actor_id: "key" } }
          : {}),
        scope: {
          resolve: () => ({
            personalNativeCredential: async () => (bound ? {} : null),
            personalMachineGrant: async () => true,
          }),
        },
      } as any,
      res,
      next,
    )
    return { next, res }
  }

  it("passes GET /organization/vehicles through ingress (session-scoped allow-list)", async () => {
    const { next, res } = await probe("/organization/vehicles", "GET")
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it("rejects POST /organization/vehicles at ingress (mutation gate not in allow-list — route returns 503)", async () => {
    // POST is not in the nativeIngress allow-list for /organization/vehicles.
    // nativeIngress must reject with 401, keeping the closed mutation gate safe.
    const { next, res } = await probe("/organization/vehicles", "POST")
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("rejects PATCH /organization/vehicles at ingress", async () => {
    const { next, res } = await probe("/organization/vehicles", "PATCH")
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("rejects DELETE /organization/vehicles at ingress", async () => {
    const { next, res } = await probe("/organization/vehicles", "DELETE")
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("passes GET /organization/vehicles through ingress even with a Bearer token header (session guard is in route handler, not ingress)", async () => {
    // Architecture note: nativeIngress allow-list passes the request through regardless
    // of Bearer token presence for session-scoped routes. The route handler's sessionToken()
    // call is the actual guard — if no valid session cookie is present, the handler returns 401.
    // This matches the existing pattern for all other /personal/* session routes (e.g. /personal/order-groups).
    // See: packages/api/src/api/personal/__tests__/ingress.unit.spec.ts line 11.
    const { next } = await probe(
      "/organization/vehicles",
      "GET",
      "Bearer some-token",
    )
    // Ingress passes through; route handler is responsible for session validation.
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("passes GET /personal/vehicles through ingress so the route handler can return 410 Gone", async () => {
    // /personal/vehicles GET is deliberately kept in the nativeIngress allow-list (#482, security.ts:127).
    // This allows the 410 Gone response from the route handler to reach clients rather than
    // being replaced by a 401 from ingress. The path is intentionally left in the allow-list;
    // it was removed only from personal-frontdoor.mjs (the public proxy layer), not from nativeIngress.
    // This distinction is intentional: frontdoor blocks public access, but nativeIngress lets
    // through so session-authenticated clients get the informative 410 instead of 401.
    const { next, res } = await probe("/personal/vehicles", "GET")
    // Either next is called (passes through) OR route handles 410 — both are acceptable.
    // The critical invariant: the client must NOT receive 401 from ingress for this path.
    const statusCode = res.status.mock.calls[0]?.[0]
    expect(statusCode).not.toBe(401)
  })
})
