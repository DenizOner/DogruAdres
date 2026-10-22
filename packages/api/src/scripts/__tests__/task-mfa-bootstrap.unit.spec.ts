import { generateKeyPairSync } from "node:crypto"
import {
  canonicalJsonStringify,
  computeSha256Digest,
  computePublicKeyFingerprint,
  verifySignedManifest,
  verifyRuntimeEnvironmentOwnership,
  createSignedPreIntent,
  createSignedPostCommitOutcome,
  createIndeterminateFailureRecord,
  verifyCeremonyAuditChain,
  TaskResourceManifest,
  SignedTaskManifest,
  RuntimeResourceAdapter,
  NonceStore,
  TrustedOperatorRegistry,
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

describe("Finish M0 MFA Signed Audit Protocol (Source-Only)", () => {
  let publicKeyPem: string
  let privateKeyPem: string
  let keyFingerprint: string
  let otherPublicKeyPem: string
  let otherPrivateKeyPem: string
  let otherKeyFingerprint: string

  beforeAll(() => {
    const pair1 = generateKeyPairSync("ed25519")
    publicKeyPem = pair1.publicKey.export({ type: "spki", format: "pem" }).toString()
    privateKeyPem = pair1.privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    keyFingerprint = computePublicKeyFingerprint(publicKeyPem)

    const pair2 = generateKeyPairSync("ed25519")
    otherPublicKeyPem = pair2.publicKey.export({ type: "spki", format: "pem" }).toString()
    otherPrivateKeyPem = pair2.privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    otherKeyFingerprint = computePublicKeyFingerprint(otherPublicKeyPem)
  })

  const baseManifest: TaskResourceManifest = {
    manifestVersion: "1.0.0",
    runId: "run_20261022_001",
    nonce: "nonce_unique_random_bytes_abc123",
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

  describe("1. RFC 8785 Canonical JSON & RFC 7493 (I-JSON) Compliance", () => {
    it("sorts object keys lexicographically by UTF-16 code units", () => {
      const input = { b: 1, a: 2, c: { y: 10, x: 20 } }
      expect(canonicalJsonStringify(input)).toBe('{"a":2,"b":1,"c":{"x":20,"y":10}}')
    })

    it("normalizes -0 to 0", () => {
      expect(canonicalJsonStringify(-0)).toBe("0")
      expect(canonicalJsonStringify({ val: -0 })).toBe('{"val":0}')
    })

    it("rejects non-finite numbers (NaN, Infinity, -Infinity)", () => {
      expect(() => canonicalJsonStringify(NaN)).toThrow(/NaN and Infinity are forbidden/)
      expect(() => canonicalJsonStringify(Infinity)).toThrow(/NaN and Infinity are forbidden/)
      expect(() => canonicalJsonStringify(-Infinity)).toThrow(/NaN and Infinity are forbidden/)
      expect(() => canonicalJsonStringify({ val: NaN })).toThrow(/NaN and Infinity are forbidden/)
    })

    it("handles primitives, arrays, null and nested structures consistently", () => {
      expect(canonicalJsonStringify(null)).toBe("null")
      expect(canonicalJsonStringify(true)).toBe("true")
      expect(canonicalJsonStringify(false)).toBe("false")
      expect(canonicalJsonStringify("hello")).toBe('"hello"')
      expect(canonicalJsonStringify([1, "a", null, true])).toBe('[1,"a",null,true]')
    })
  })

  describe("2. Trusted Operator Key Fingerprint & Verification Contract", () => {
    const trustedRegistry: TrustedOperatorRegistry = {
      isFingerprintTrusted: (fp) => fp === keyFingerprint,
      getPublicKeyPem: (fp) => fp === keyFingerprint ? publicKeyPem : null,
    }

    it("accepts valid signed manifest matching trusted fingerprint", () => {
      const payload = Buffer.from(canonicalJsonStringify(baseManifest), "utf8")
      const sig = require("node:crypto").sign(null, payload, privateKeyPem).toString("base64")
      const signed: SignedTaskManifest = {
        manifest: baseManifest,
        signerKeyFingerprint: keyFingerprint,
        signatureBase64: sig,
      }
      expect(() => verifySignedManifest(signed, trustedRegistry)).not.toThrow()
    })

    it("rejects untrusted public key fingerprint", () => {
      const payload = Buffer.from(canonicalJsonStringify(baseManifest), "utf8")
      const sig = require("node:crypto").sign(null, payload, otherPrivateKeyPem).toString("base64")
      const signed: SignedTaskManifest = {
        manifest: baseManifest,
        signerKeyFingerprint: otherKeyFingerprint,
        signatureBase64: sig,
      }
      expect(() => verifySignedManifest(signed, trustedRegistry)).toThrow(/not in the trusted operator registry/)
    })

    it("rejects tampered manifest even if fingerprint is valid", () => {
      const payload = Buffer.from(canonicalJsonStringify(baseManifest), "utf8")
      const sig = require("node:crypto").sign(null, payload, privateKeyPem).toString("base64")
      const tamperedManifest = { ...baseManifest, targetDatabase: "injected_evil_db" }
      const signed: SignedTaskManifest = {
        manifest: tamperedManifest,
        signerKeyFingerprint: keyFingerprint,
        signatureBase64: sig,
      }
      expect(() => verifySignedManifest(signed, trustedRegistry)).toThrow(/Ed25519 signature verification failed/)
    })
  })

  describe("3. Anti-Replay & Runtime Ownership Verification", () => {
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

    it("records nonce and passes on first execution", async () => {
      const consumedNonces = new Set<string>()
      const mockNonceStore: NonceStore = {
        hasBeenUsed: jest.fn().mockImplementation(async (n) => consumedNonces.has(n)),
        recordNonce: jest.fn().mockImplementation(async (n) => { consumedNonces.add(n) }),
      }

      await expect(
        verifyRuntimeEnvironmentOwnership(
          baseManifest,
          validAdapter,
          mockNonceStore,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T20:30:00.000Z"
        )
      ).resolves.toBeUndefined()

      expect(consumedNonces.has(baseManifest.nonce)).toBe(true)

      // Second execution with same nonce must be REFUSED (Anti-Replay)
      await expect(
        verifyRuntimeEnvironmentOwnership(
          baseManifest,
          validAdapter,
          mockNonceStore,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T20:30:00.000Z"
        )
      ).rejects.toThrow(/replay attempt detected/)
    })
  })

  describe("4. Chained Audit Protocol (Pre-Intent -> Outcome / Indeterminate)", () => {
    it("creates and verifies valid pre-intent and post-commit outcome chain", () => {
      const ceremonyId = "ceremony_mfa_latch_001"
      const preIntent = createSignedPreIntent(
        ceremonyId,
        baseManifest,
        "operator_42",
        privateKeyPem,
        "2026-10-22T20:15:00.000Z"
      )

      const postCommit = createSignedPostCommitOutcome(
        ceremonyId,
        preIntent,
        privateKeyPem,
        "tx_hash_abc999",
        "2026-10-22T20:15:05.000Z"
      )

      expect(verifyCeremonyAuditChain(preIntent, postCommit, publicKeyPem)).toBe(true)
    })

    it("creates and verifies valid indeterminate failure record linked to pre-intent", () => {
      const ceremonyId = "ceremony_mfa_latch_002"
      const preIntent = createSignedPreIntent(
        ceremonyId,
        baseManifest,
        "operator_42",
        privateKeyPem,
        "2026-10-22T20:20:00.000Z"
      )

      const indeterminateFailure = createIndeterminateFailureRecord(
        ceremonyId,
        preIntent,
        privateKeyPem,
        "Connection reset during commit readback assertion",
        "2026-10-22T20:20:10.000Z"
      )

      expect(verifyCeremonyAuditChain(preIntent, indeterminateFailure, publicKeyPem)).toBe(true)
    })

    it("rejects outcome chain if pre-intent digest does not match (broken hash link)", () => {
      const ceremonyId = "ceremony_mfa_latch_003"
      const preIntent = createSignedPreIntent(
        ceremonyId,
        baseManifest,
        "operator_42",
        privateKeyPem,
        "2026-10-22T20:25:00.000Z"
      )

      const tamperedOutcome = {
        ...createSignedPostCommitOutcome(
          ceremonyId,
          preIntent,
          privateKeyPem,
          "tx_hash_111",
          "2026-10-22T20:25:05.000Z"
        ),
        preIntentDigestSha256: "broken_digest_value_0000000000000000000000000000000000000000",
      }

      expect(verifyCeremonyAuditChain(preIntent, tamperedOutcome, publicKeyPem)).toBe(false)
    })
  })

  describe("5. Fail-Closed Bootstrap Execution Gate", () => {
    it("strictly preserves BOOTSTRAP_EXECUTION_GATE_OPEN = false", () => {
      expect(BOOTSTRAP_EXECUTION_GATE_OPEN).toBe(false)
    })

    it("aborts execution immediately when gate is closed", async () => {
      await expect(taskMfaBootstrap({ container: {} as any, args: [] })).rejects.toThrow(
        /taskMfaBootstrap is locked by BOOTSTRAP_EXECUTION_GATE_OPEN = false/
      )
    })
  })
})