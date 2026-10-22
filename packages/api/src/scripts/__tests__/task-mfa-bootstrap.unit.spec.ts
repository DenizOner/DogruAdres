import {
  validateEnvironmentSafety,
  verifyPreconditions,
  PROTECTED_ENVIRONMENTS,
  TaskBootstrapManifest,
} from "../task-mfa-bootstrap"

describe("task-mfa-bootstrap safety guards", () => {
  const validManifest: TaskBootstrapManifest = {
    allowedHost: "127.0.0.1",
    allowedPort: "55720",
    allowedDatabase: "mfa_e2e_isolated_authorized",
    evidenceDir: "C:\\Users\\Deniz\\.mfa-e2e-evidence-authorized",
    outputSecretFilename: "bootstrap.private.json",
  }

  const cwd = "D:\\DogruAdres-m0-session-vertical-20261020"

  it("accepts a fully authorized, matching target URL", () => {
    const url = new URL("postgres://user:pass@127.0.0.1:55720/mfa_e2e_isolated_authorized")
    expect(() => validateEnvironmentSafety(url, validManifest, cwd)).not.toThrow()
  })

  it.each(PROTECTED_ENVIRONMENTS)(
    "strictly refuses protected environment %s:%s/%s",
    (env) => {
      const url = new URL(`postgres://user:pass@${env.hostname}:${env.port}/${env.database}`)
      const manifest: TaskBootstrapManifest = {
        ...validManifest,
        allowedHost: env.hostname,
        allowedPort: env.port,
        allowedDatabase: env.database,
      }
      expect(() => validateEnvironmentSafety(url, manifest, cwd)).toThrow(
        /REFUSED: Target matches protected environment/
      )
    }
  )

  it("refuses when database name does not match manifest", () => {
    const url = new URL("postgres://user:pass@127.0.0.1:55720/wrong_database")
    expect(() => validateEnvironmentSafety(url, validManifest, cwd)).toThrow(
      /does not match authorized manifest/
    )
  })

  it("refuses when port does not match manifest", () => {
    const url = new URL("postgres://user:pass@127.0.0.1:55799/mfa_e2e_isolated_authorized")
    expect(() => validateEnvironmentSafety(url, validManifest, cwd)).toThrow(
      /does not match authorized manifest/
    )
  })

  it("refuses when evidence dir is inside workspace", () => {
    const url = new URL("postgres://user:pass@127.0.0.1:55720/mfa_e2e_isolated_authorized")
    const manifestInside: TaskBootstrapManifest = {
      ...validManifest,
      evidenceDir: "D:\\DogruAdres-m0-session-vertical-20261020\\.evidence",
    }
    expect(() => validateEnvironmentSafety(url, manifestInside, cwd)).toThrow(
      /Evidence directory must reside outside repository worktree/
    )
  })

  describe("preconditions verification", () => {
    it("refuses if database already has users", async () => {
      const mockDb: any = {
        query: jest.fn().mockResolvedValueOnce({ rows: [{ cnt: 1 }] }),
      }
      await expect(verifyPreconditions(mockDb)).rejects.toThrow(
        /already contains 1 User records/
      )
    })

    it("refuses if database already has auth identities", async () => {
      const mockDb: any = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
          .mockResolvedValueOnce({ rows: [{ cnt: 2 }] }),
      }
      await expect(verifyPreconditions(mockDb)).rejects.toThrow(
        /already contains 2 AuthIdentity records/
      )
    })

    it("refuses if database already has login bindings", async () => {
      const mockDb: any = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
          .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
          .mockResolvedValueOnce({ rows: [{ cnt: 1 }] }),
      }
      await expect(verifyPreconditions(mockDb)).rejects.toThrow(
        /already contains 1 da_login_binding records/
      )
    })

    it("passes when all tables are empty", async () => {
      const mockDb: any = {
        query: jest.fn().mockResolvedValue({ rows: [{ cnt: 0 }] }),
      }
      await expect(verifyPreconditions(mockDb)).resolves.toBeUndefined()
    })
  })
})
