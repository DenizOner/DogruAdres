import middlewareConfig from "../../middlewares"

describe("middlewares errorHandler privacy and Cache-Control", () => {
  const makeRes = () => {
    const headers: Record<string, string> = {}
    const res: any = {
      statusCode: 0,
      body: undefined,
      setHeader: jest.fn((k: string, v: string) => {
        headers[k.toLowerCase()] = v
      }),
      status: jest.fn((code: number) => {
        res.statusCode = code
        return res
      }),
      json: jest.fn((payload: unknown) => {
        res.body = payload
        return res
      }),
      headers,
    }
    return res
  }

  it.each([
    "/personal/session",
    "/organization/invitations",
    "/organization/catalog",
    "/platform/smtp",
    "/platform/stores",
  ])("sets Cache-Control: no-store and redacts internal error messages on %s", (path) => {
    const res = makeRes()
    const next = jest.fn()
    const error = new Error("SELECT * FROM da_secret_table WHERE token='leak'")

    middlewareConfig.errorHandler!(error, { path } as any, res, next)

    expect(res.headers["cache-control"]).toBe("no-store")
    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ message: "Service unavailable" })
    expect(JSON.stringify(res.body)).not.toContain("da_secret_table")
    expect(next).not.toHaveBeenCalled()
  })

  it("maps IdentityAccessDenied, forbidden, invalid_data, not_found, and 413 without leaking details on /organization/*", () => {
    const cases: Array<{ err: any; status: number; message: string }> = [
      { err: { status: 413, type: "entity.too.large" }, status: 413, message: "Payload too large" },
      { err: { type: "invalid_data", message: "bad secret field" }, status: 400, message: "Invalid input" },
      { err: { type: "forbidden", message: "owner email x@y.z" }, status: 403, message: "Access denied" },
      { err: { type: "not_found", message: "daorg_123" }, status: 404, message: "Not found" },
      { err: { name: "IdentityAccessDenied", message: "daprs_123" }, status: 401, message: "Access denied" },
    ]
    for (const c of cases) {
      const res = makeRes()
      middlewareConfig.errorHandler!(c.err, { path: "/organization/product-drafts" } as any, res, jest.fn())
      expect(res.headers["cache-control"]).toBe("no-store")
      expect(res.statusCode).toBe(c.status)
      expect(res.body).toEqual({ message: c.message })
    }
  })

  it("does not match unrelated prefixes like /personalized", () => {
    const res = makeRes()
    const next = jest.fn()
    middlewareConfig.errorHandler!({ type: "unknown_x" }, { path: "/personalized" } as any, res, next)
    expect(res.headers["cache-control"]).toBeUndefined()
  })
})
