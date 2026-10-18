import { resolveHttpSecrets } from "../production-secrets"

const strongJwt = "a8f0e72b9d31c45a0e2b89f6d35c4f11e7c9d2159abb0c136cab5729beea1d8f"
const strongCookie = "c61dd099eab7849f21e49cb32091ab15e913474bac19ea9840ffed72683909c2"
const prod = { NODE_ENV: "production", JWT_SECRET: strongJwt, COOKIE_SECRET: strongCookie }

describe("production Medusa HTTP secrets", () => {
  it("accepts distinct long secrets when both are set", () => {
    expect(resolveHttpSecrets(prod)).toEqual({ jwtSecret: strongJwt, cookieSecret: strongCookie })
  })

  it("rejects missing or empty production secrets", () => {
    expect(() => resolveHttpSecrets({ ...prod, JWT_SECRET: undefined })).toThrow("Production requires")
    expect(() => resolveHttpSecrets({ ...prod, COOKIE_SECRET: undefined })).toThrow("Production requires")
    expect(() => resolveHttpSecrets({ ...prod, COOKIE_SECRET: "" })).toThrow("Production requires")
  })

  it("rejects scaffold placeholders, weak values and whitespace", () => {
    for (const value of ["supersecret", "secret", "short", " ".repeat(36), "x".repeat(64), "supersecret".repeat(4), strongJwt + " "]) {
      expect(() => resolveHttpSecrets({ ...prod, JWT_SECRET: value })).toThrow("Production requires")
    }
  })

  it("rejects identical production secrets", () => {
    expect(() => resolveHttpSecrets({ ...prod, COOKIE_SECRET: strongJwt })).toThrow("Production requires")
  })

  it("does not disclose secret contents in errors", () => {
    try {
      resolveHttpSecrets({ ...prod, COOKIE_SECRET: "supersecret" })
      throw new Error("Expected validation error")
    } catch (error) {
      expect(String(error)).not.toContain(strongJwt)
      expect(String(error)).not.toContain(strongCookie)
    }
  })

  it("preserves current development and test defaults", () => {
    expect(resolveHttpSecrets({ NODE_ENV: "development" })).toEqual({ jwtSecret: "supersecret", cookieSecret: "supersecret" })
    expect(resolveHttpSecrets({ NODE_ENV: "test" })).toEqual({ jwtSecret: "supersecret", cookieSecret: "supersecret" })
    expect(resolveHttpSecrets({ NODE_ENV: "development", JWT_SECRET: strongJwt, COOKIE_SECRET: strongCookie })).toEqual({ jwtSecret: strongJwt, cookieSecret: strongCookie })
  })
})
