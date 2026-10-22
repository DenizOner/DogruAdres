import { generateKeyPairSync } from "node:crypto"
import {
  canonicalJsonStringify,
  signManifest,
  verifyManifestSignature,
  verifyRuntimeEnvironmentOwnership,
  TaskResourceManifest,
  SignedTaskManifest,
  RuntimeResourceAdapter,
} from "../operator-audit-protocol"
import {
  validateSafeBasename,
  validatePathSecurity,
  validateTargetAgainstManifest,
  verifyCleanPreconditions,
  sanitizeAndDecodeDatabaseName,
  BOOTSTRAP_EXECUTION_GATE_OPEN,
} from "../task-mfa-bootstrap"
import taskMfaBootstrap from "../task-mfa-bootstrap"

describe("Operator Audit Protocol & Hardened Bootstrap Security", () => {
  let publicKeyPem: string
  let privateKeyPem: string
  let otherPublicKeyPem: string
  let otherPrivateKeyPem: string

  beforeAll(() => {
    const pair1 = generateKeyPairSync("ed25519")
    publicKeyPem = pair1.publicKey.export({ type: "spki", format: "pem" }).toString()
    privateKeyPem = pair1.privateKey.export({ type: "pkcs8", format: "pem" }).toString()

    const pair2 = generateKeyPairSync("ed25519")
    otherPublicKeyPem = pair2.publicKey.export({ type: "spki", format: "pem" }).toString()
    otherPrivateKeyPem = pair2.privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  })

  const baseManifest: TaskResourceManifest = {
    manifestVersion: "1.0.0",
    taskEnvironmentId: "task_env_20261022_clean",
    targetDatabase: "task_isolated_authorized_db",
    targetHost: "127.0.0.1",
    targetPort: "55720",
    targetContainerName: "dogruadres-mfa-e2e-isolated-pg",
    targetVolumeName: "dogruadres-mfa-e2e-isolated-data",
    authorizedOperator: {
      humanOperatorId: "human_operator_42",
      windowsSecurityPrincipal: "S-1-5-21-123456789-123456789-123456789-1001",
      approvalReference: "https://github.com/DenizOner/DogruAdres/issues/230#issuecomment-6347609069",
    },
    targetCommitSha: "dd22989ab67b590a5cbb00a26cfc7c7393f6b5ba",
    issuedAt: "2026-10-22T20:00:00.000Z",
    expiresAt: "2026-10-22T22:00:00.000Z",
  }

  describe("RFC 8785 Canonical JSON Serialization", () => {
    it("sorts object keys lexicographically", () => {
      const obj1 = { z: 1, a: 2, m: { b: 3, a: 4 } }
      const obj2 = { a: 2, m: { a: 4, b: 3 }, z: 1 }
      expect(canonicalJsonStringify(obj1)).toBe('{"a":2,"m":{"a":4,"b":3},"z":1}')
      expect(canonicalJsonStringify(obj1)).toBe(canonicalJsonStringify(obj2))
    })
  })

  describe("Ed25519 Cryptographic Manifest Signature", () => {
    it("successfully verifies valid signature", () => {
      const sig = signManifest(baseManifest, privateKeyPem)
      const signed: SignedTaskManifest = { manifest: baseManifest, signatureBase64: sig }
      expect(verifyManifestSignature(signed, publicKeyPem)).toBe(true)
    })

    it("rejects signature signed by a different private key", () => {
      const sig = signManifest(baseManifest, otherPrivateKeyPem)
      const signed: SignedTaskManifest = { manifest: baseManifest, signatureBase64: sig }
      expect(verifyManifestSignature(signed, publicKeyPem)).toBe(false)
    })

    it("rejects signature if manifest contents are tampered", () => {
      const sig = signManifest(baseManifest, privateKeyPem)
      const tampered: TaskResourceManifest = {
        ...baseManifest,
        targetDatabase: "malicious_injected_db",
      }
      const signed: SignedTaskManifest = { manifest: tampered, signatureBase64: sig }
      expect(verifyManifestSignature(signed, publicKeyPem)).toBe(false)
    })
  })

  describe("Runtime Environment Ownership & Exclusivity Verification", () => {
    const validAdapter: RuntimeResourceAdapter = {
      inspectContainer: jest.fn().mockResolvedValue({
        exists: true,
        isRunning: true,
        volumeNames: ["dogruadres-mfa-e2e-isolated-data"],
      }),
      inspectDatabase: jest.fn().mockResolvedValue({
        dbName: "task_isolated_authorized_db",
        isExclusive: true,
      }),
      getCurrentGitSha: jest.fn().mockResolvedValue("dd22989ab67b590a5cbb00a26cfc7c7393f6b5ba"),
      getOperatorPrincipal: jest.fn().mockResolvedValue({
        windowsPrincipal: "S-1-5-21-123456789-123456789-123456789-1001",
      }),
    }

    it("passes when all runtime parameters match signed manifest", async () => {
      await expect(
        verifyRuntimeEnvironmentOwnership(
          baseManifest,
          validAdapter,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T20:30:00.000Z"
        )
      ).resolves.toBeUndefined()
    })

    it("refuses expired manifest", async () => {
      await expect(
        verifyRuntimeEnvironmentOwnership(
          baseManifest,
          validAdapter,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T23:00:00.000Z"
        )
      ).rejects.toThrow(/Manifest is expired or not yet valid/)
    })

    it("refuses Git commit SHA mismatch", async () => {
      const mismatchAdapter = {
        ...validAdapter,
        getCurrentGitSha: jest.fn().mockResolvedValue("0000000000000000000000000000000000000000"),
      }
      await expect(
        verifyRuntimeEnvironmentOwnership(
          baseManifest,
          mismatchAdapter,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T20:30:00.000Z"
        )
      ).rejects.toThrow(/Git commit mismatch/)
    })

    it("refuses Operator Windows SID / Principal mismatch", async () => {
      const mismatchAdapter = {
        ...validAdapter,
        getOperatorPrincipal: jest.fn().mockResolvedValue({
          windowsPrincipal: "S-1-5-21-999999999-999999999-999999999-9999",
        }),
      }
      await expect(
        verifyRuntimeEnvironmentOwnership(
          baseManifest,
          mismatchAdapter,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T20:30:00.000Z"
        )
      ).rejects.toThrow(/Operator principal mismatch/)
    })

    it("refuses non-exclusive database connection", async () => {
      const nonExclusiveAdapter = {
        ...validAdapter,
        inspectDatabase: jest.fn().mockResolvedValue({
          dbName: "task_isolated_authorized_db",
          isExclusive: false,
        }),
      }
      await expect(
        verifyRuntimeEnvironmentOwnership(
          baseManifest,
          nonExclusiveAdapter,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T20:30:00.000Z"
        )
      ).rejects.toThrow(/has active concurrent client sessions/)
    })
  })

  describe("task-mfa-bootstrap integration with signed manifest", () => {
    it("enforces BOOTSTRAP_EXECUTION_GATE_OPEN is false", () => {
      expect(BOOTSTRAP_EXECUTION_GATE_OPEN).toBe(false)
    })

    it("refuses execution immediately when gate is closed", async () => {
      await expect(taskMfaBootstrap({ container: {} as any, args: [] })).rejects.toThrow(
        /BOOTSTRAP_EXECUTION_GATE_OPEN = false/
      )
    })

    it("validates signed manifest during validateTargetAgainstManifest", () => {
      const url = new URL("postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db")
      const sig = signManifest(baseManifest, privateKeyPem)
      const signed: SignedTaskManifest = { manifest: baseManifest, signatureBase64: sig }

      expect(() =>
        validateTargetAgainstManifest(url, baseManifest, publicKeyPem, signed)
      ).not.toThrow()

      const badSigned: SignedTaskManifest = { manifest: baseManifest, signatureBase64: "bad_signature" }
      expect(() =>
        validateTargetAgainstManifest(url, baseManifest, publicKeyPem, badSigned)
      ).toThrow(/Ed25519 signature verification failed/)
    })
  })
})