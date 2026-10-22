import {
  validateSafeBasename,
  validatePathSecurity,
  validateTargetAgainstManifest,
  verifyCleanPreconditions,
  FORBIDDEN_DATABASE_NAMES,
  TaskResourceManifest,
} from "../task-mfa-bootstrap"

describe("task-mfa-bootstrap hardened security guards", () => {
  const validManifest: TaskResourceManifest = {
    manifestVersion: "1.0.0",
    taskEnvironmentId: "task_env_20261022_clean",
    targetDatabase: "mfa_e2e_isolated_authorized",
    targetHost: "127.0.0.1",
    targetPort: "55720",
    targetContainerName: "dogruadres-mfa-e2e-isolated-pg",
    targetVolumeName: "dogruadres-mfa-e2e-isolated-data",
    authorizedOperator: "task_agent",
  }

  describe("validateSafeBasename", () => {
    it("accepts valid alphanumeric basenames", () => {
      expect(validateSafeBasename("valid-file.json")).toBe("valid-file.json")
      expect(validateSafeBasename("output_123.private.json")).toBe("output_123.private.json")
    })

    it("rejects traversal patterns and path separators", () => {
      expect(() => validateSafeBasename("../evil.json")).toThrow(/not a strict safe basename/)
      expect(() => validateSafeBasename("foo/bar.json")).toThrow(/not a strict safe basename/)
      expect(() => validateSafeBasename("foo\\bar.json")).toThrow(/not a strict safe basename/)
      expect(() => validateSafeBasename("..")).toThrow(/not a strict safe basename/)
      expect(() => validateSafeBasename("")).toThrow(/non-empty string/)
    })
  })

  describe("validateTargetAgainstManifest", () => {
    it("accepts a fully authorized matching target", () => {
      const url = new URL("postgres://user:pass@127.0.0.1:55720/mfa_e2e_isolated_authorized")
      expect(() => validateTargetAgainstManifest(url, validManifest)).not.toThrow()
    })

    it.each([...FORBIDDEN_DATABASE_NAMES])(
      "strictly refuses forbidden database name: %s regardless of host and port",
      (forbiddenDb) => {
        const url = new URL(`postgres://user:pass@127.0.0.1:55799/${forbiddenDb}`)
        const manifest: TaskResourceManifest = {
          ...validManifest,
          targetDatabase: forbiddenDb,
          targetPort: "55799",
        }
        expect(() => validateTargetAgainstManifest(url, manifest)).toThrow(
          /is on the prohibited\/protected list/
        )
      }
    )

    it("refuses non-loopback endpoints", () => {
      const url = new URL("postgres://user:pass@192.168.1.50:55720/mfa_e2e_isolated_authorized")
      const manifest: TaskResourceManifest = {
        ...validManifest,
        targetHost: "192.168.1.50",
      }
      expect(() => validateTargetAgainstManifest(url, manifest)).toThrow(
        /not an allowed local loopback endpoint/
      )
    })

    it("refuses when database does not match manifest", () => {
      const url = new URL("postgres://user:pass@127.0.0.1:55720/other_db")
      expect(() => validateTargetAgainstManifest(url, validManifest)).toThrow(/Database mismatch/)
    })

    it("refuses when host does not match manifest", () => {
      const url = new URL("postgres://user:pass@localhost:55720/mfa_e2e_isolated_authorized")
      expect(() => validateTargetAgainstManifest(url, validManifest)).toThrow(/Host mismatch/)
    })

    it("refuses when port does not match manifest", () => {
      const url = new URL("postgres://user:pass@127.0.0.1:55721/mfa_e2e_isolated_authorized")
      expect(() => validateTargetAgainstManifest(url, validManifest)).toThrow(/Port mismatch/)
    })
  })

  describe("validatePathSecurity", () => {
    it("refuses when evidence dir is inside workspace", async () => {
      const cwd = "D:\\DogruAdres-m0-session-vertical-20261020"
      const insideDir = "D:\\DogruAdres-m0-session-vertical-20261020\\packages"
      await expect(validatePathSecurity(insideDir, cwd)).rejects.toThrow(
        /resides inside worktree/
      )
    })

    it("refuses non-existent evidence directory", async () => {
      const cwd = "D:\\DogruAdres-m0-session-vertical-20261020"
      await expect(
        validatePathSecurity("C:\\nonexistent_dir_20261022_9999", cwd)
      ).rejects.toThrow(/does not exist or cannot be accessed/)
    })
  })

  describe("verifyCleanPreconditions", () => {
    it("refuses when any target table already has records", async () => {
      const mockDbUsers: any = {
        query: jest.fn().mockResolvedValueOnce({ rows: [{ cnt: 1 }] }),
      }
      await expect(verifyCleanPreconditions(mockDbUsers)).rejects.toThrow(
        /already contains 1 User records/
      )

      const mockDbAuth: any = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
          .mockResolvedValueOnce({ rows: [{ cnt: 2 }] }),
      }
      await expect(verifyCleanPreconditions(mockDbAuth)).rejects.toThrow(
        /already contains 2 AuthIdentity records/
      )

      const mockDbBindings: any = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
          .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
          .mockResolvedValueOnce({ rows: [{ cnt: 1 }] }),
      }
      await expect(verifyCleanPreconditions(mockDbBindings)).rejects.toThrow(
        /already contains 1 da_login_binding records/
      )

      const mockDbPerson: any = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
          .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
          .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
          .mockResolvedValueOnce({ rows: [{ cnt: 1 }] }),
      }
      await expect(verifyCleanPreconditions(mockDbPerson)).rejects.toThrow(
        /already contains 1 da_person records/
      )
    })

    it("passes when all tables are empty", async () => {
      const mockDbEmpty: any = {
        query: jest.fn().mockResolvedValue({ rows: [{ cnt: 0 }] }),
      }
      await expect(verifyCleanPreconditions(mockDbEmpty)).resolves.toBeUndefined()
    })
  })
})