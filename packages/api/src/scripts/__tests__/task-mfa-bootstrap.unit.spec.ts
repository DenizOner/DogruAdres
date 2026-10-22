import {
  validateSafeBasename,
  validatePathSecurity,
  validateTargetAgainstManifest,
  verifyCleanPreconditions,
  sanitizeAndDecodeDatabaseName,
  BOOTSTRAP_EXECUTION_GATE_OPEN,
  TaskResourceManifest,
} from "../task-mfa-bootstrap"
import taskMfaBootstrap from "../task-mfa-bootstrap"

describe("task-mfa-bootstrap fail-closed runtime & security guards", () => {
  const validManifest: TaskResourceManifest = {
    manifestVersion: "1.0.0",
    taskEnvironmentId: "task_env_20261022_clean",
    targetDatabase: "task_isolated_authorized_db",
    targetHost: "127.0.0.1",
    targetPort: "55720",
    targetContainerName: "dogruadres-mfa-e2e-isolated-pg",
    targetVolumeName: "dogruadres-mfa-e2e-isolated-data",
    authorizedOperator: "task_agent",
    signatureProof: "0123456789abcdef0123456789abcdef",
  }

  describe("Fail-closed execution gate", () => {
    it("is strictly closed (false) in source code", () => {
      expect(BOOTSTRAP_EXECUTION_GATE_OPEN).toBe(false)
    })

    it("taskMfaBootstrap throws immediately and aborts before reading environment when gate is closed", async () => {
      const mockContainer: any = {}
      await expect(taskMfaBootstrap({ container: mockContainer } as any)).rejects.toThrow(
        /taskMfaBootstrap is locked by BOOTSTRAP_EXECUTION_GATE_OPEN = false/
      )
    })
  })

  describe("sanitizeAndDecodeDatabaseName", () => {
    it("decodes single and double percent-encoded database names", () => {
      expect(sanitizeAndDecodeDatabaseName("/mfa_test")).toBe("mfa_test")
      expect(sanitizeAndDecodeDatabaseName("/%6d%66%61%5f%74%65%73%74")).toBe("mfa_test")
      expect(sanitizeAndDecodeDatabaseName("/%256d%2566%2561")).toBe("mfa")
    })

    it("rejects malformed percent encodings", () => {
      expect(() => sanitizeAndDecodeDatabaseName("/%E0%A4%A")).toThrow(/Malformed percent-encoded/)
    })
  })

  describe("validateTargetAgainstManifest", () => {
    it("accepts a fully authorized matching target with signature proof", () => {
      const url = new URL("postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db")
      expect(() => validateTargetAgainstManifest(url, validManifest)).not.toThrow()
    })

    it("refuses if signatureProof is missing or too short", () => {
      const url = new URL("postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db")
      const unsignedManifest: TaskResourceManifest = {
        ...validManifest,
        signatureProof: undefined,
      }
      expect(() => validateTargetAgainstManifest(url, unsignedManifest)).toThrow(
        /lacks verified signature\/authorization proof/
      )
    })

    it.each([
      "m0ssi_a7f1",
      "%6d%30%73%73%69%5f%61%37%66%31", // encoded m0ssi_a7f1
      "mfa_e2e",
      "mfa_e2e_fresh",
      "medusa",
      "medusa-docker",
      "postgres",
      "template1",
    ])("strictly refuses prohibited database %s even if encoded or in manifest", (dbName) => {
      const url = new URL(`postgres://user:pass@127.0.0.1:55720/${dbName}`)
      const manifest: TaskResourceManifest = {
        ...validManifest,
        targetDatabase: dbName,
      }
      expect(() => validateTargetAgainstManifest(url, manifest)).toThrow(
        /matches protected\/prohibited pattern/
      )
    })

    it("refuses non-loopback endpoints", () => {
      const url = new URL("postgres://user:pass@192.168.1.50:55720/task_isolated_authorized_db")
      const manifest: TaskResourceManifest = {
        ...validManifest,
        targetHost: "192.168.1.50",
      }
      expect(() => validateTargetAgainstManifest(url, manifest)).toThrow(
        /not an allowed local loopback endpoint/
      )
    })
  })

  describe("validateSafeBasename", () => {
    it("accepts clean basenames", () => {
      expect(validateSafeBasename("valid.json")).toBe("valid.json")
    })

    it("rejects traversal and illegal characters", () => {
      expect(() => validateSafeBasename("../evil.json")).toThrow(/not a strict safe basename/)
      expect(() => validateSafeBasename("foo/bar.json")).toThrow(/not a strict safe basename/)
      expect(() => validateSafeBasename("foo\\bar.json")).toThrow(/not a strict safe basename/)
    })
  })

  describe("verifyCleanPreconditions", () => {
    it("refuses when any target table already has records", async () => {
      const mockDb: any = {
        query: jest.fn().mockResolvedValueOnce({ rows: [{ cnt: 1 }] }),
      }
      await expect(verifyCleanPreconditions(mockDb)).rejects.toThrow(/already contains 1 User records/)
    })

    it("passes when all tables are empty", async () => {
      const mockDb: any = {
        query: jest.fn().mockResolvedValue({ rows: [{ cnt: 0 }] }),
      }
      await expect(verifyCleanPreconditions(mockDb)).resolves.toBeUndefined()
    })
  })
})