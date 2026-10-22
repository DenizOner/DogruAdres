import { generateKeyPairSync } from "node:crypto"
import {
  canonicalJsonStringify,
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
  AtomicNonceStore,
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

describe("Operator Audit Protocol & Final Security Closeout (Source-Only)", () => {
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

  describe("1. Strict RFC 8785 & RFC 7493 (I-JSON) Compliance", () => {
    it("sorts keys lexicographically by UTF-16 code units", () => {
      const input = { "\u00e9": 1, "e": 2, "a": 3 }
      expect(canonicalJsonStringify(input)).toBe('{"a":3,"e":2,"\u00e9":1}')
    })

    it("normalizes -0 to 0", () => {
      expect(canonicalJsonStringify(-0)).toBe("0")
      expect(canonicalJsonStringify({ val: -0 })).toBe('{"val":0}')
    })

    it("rejects non-finite numbers (NaN, Infinity, -Infinity)", () => {
      expect(() => canonicalJsonStringify(NaN)).toThrow(/NaN and Infinity are forbidden/)
      expect(() => canonicalJsonStringify(Infinity)).toThrow(/NaN and Infinity are forbidden/)
      expect(() => canonicalJsonStringify(-Infinity)).toThrow(/NaN and Infinity are forbidden/)
    })

    it("rejects BigInt and lone surrogate code points (malformed Unicode)", () => {
      expect(() => canonicalJsonStringify(BigInt(42))).toThrow(/BigInt serialization is not supported/)
      // Unpaired high surrogate \uD800
      expect(() => canonicalJsonStringify("invalid\uD800unicode")).toThrow(/Lone surrogate code point detected/)
      // Unpaired low surrogate \uDC00
      expect(() => canonicalJsonStringify("invalid\uDC00unicode")).toThrow(/Lone surrogate code point detected/)
    })

    it("accepts valid surrogate pairs (valid Unicode characters)", () => {
      const emoji = "\uD83D\uDE00" // 😀
      expect(canonicalJsonStringify(emoji)).toBe(JSON.stringify(emoji))
    })
  })

  describe("2. Independent Pinned Operator Trust & Scope Enforcement", () => {
    const trustedRegistry: TrustedOperatorRegistry = {
      isFingerprintTrusted: (fp) => fp === keyFingerprint,
      isOperatorApproved: (op) =>
        op.humanOperatorId === "human_operator_42" &&
        op.approvalReference === "https://github.com/DenizOner/DogruAdres/issues/230#issuecomment-6347609069" &&
        op.windowsSecurityPrincipal === "S-1-5-21-123456789-123456789-123456789-1001",
      getPublicKeyPem: (fp) => (fp === keyFingerprint ? publicKeyPem : null),
    }

    it("accepts manifest signed by trusted operator with approved scope", () => {
      const payload = Buffer.from(canonicalJsonStringify(baseManifest), "utf8")
      const sig = require("node:crypto").sign(null, payload, privateKeyPem).toString("base64")
      const signed: SignedTaskManifest = {
        manifest: baseManifest,
        signerKeyFingerprint: keyFingerprint,
        signatureBase64: sig,
      }
      expect(() => verifySignedManifest(signed, trustedRegistry)).not.toThrow()
    })

    it("rejects self-signed manifest using untrusted key fingerprint", () => {
      const payload = Buffer.from(canonicalJsonStringify(baseManifest), "utf8")
      const sig = require("node:crypto").sign(null, payload, otherPrivateKeyPem).toString("base64")
      const signed: SignedTaskManifest = {
        manifest: baseManifest,
        signerKeyFingerprint: otherKeyFingerprint,
        signatureBase64: sig,
      }
      expect(() => verifySignedManifest(signed, trustedRegistry)).toThrow(/not in the trusted operator registry/)
    })

    it("rejects trusted key when operator approval scope is modified or unapproved", () => {
      const modifiedManifest = {
        ...baseManifest,
        authorizedOperator: {
          ...baseManifest.authorizedOperator,
          approvalReference: "https://github.com/DenizOner/DogruAdres/issues/230#forged-approval",
        },
      }
      const payload = Buffer.from(canonicalJsonStringify(modifiedManifest), "utf8")
      const sig = require("node:crypto").sign(null, payload, privateKeyPem).toString("base64")
      const signed: SignedTaskManifest = {
        manifest: modifiedManifest,
        signerKeyFingerprint: keyFingerprint,
        signatureBase64: sig,
      }
      expect(() => verifySignedManifest(signed, trustedRegistry)).toThrow(/Operator identity or approval reference is not approved/)
    })
  })

  describe("3. Atomic Anti-Replay Contract (claimOnce)", () => {
    class InMemoryAtomicNonceStore implements AtomicNonceStore {
      private consumed = new Set<string>()
      async claimOnce(nonce: string): Promise<boolean> {
        if (this.consumed.has(nonce)) return false
        this.consumed.add(nonce)
        return true
      }
    }

    const mockAdapter: RuntimeResourceAdapter = {
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

    it("allows first claim and rejects subsequent replay attempt", async () => {
      const nonceStore = new InMemoryAtomicNonceStore()
      await expect(
        verifyRuntimeEnvironmentOwnership(
          baseManifest,
          mockAdapter,
          nonceStore,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T20:30:00.000Z"
        )
      ).resolves.toBeUndefined()

      await expect(
        verifyRuntimeEnvironmentOwnership(
          baseManifest,
          mockAdapter,
          nonceStore,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T20:30:00.000Z"
        )
      ).rejects.toThrow(/anti-replay violation/)
    })

    it("handles simultaneous competing claims atomically: exactly one succeeds", async () => {
      const nonceStore = new InMemoryAtomicNonceStore()
      const competingManifest = { ...baseManifest, nonce: "competing_concurrent_nonce" }

      const results = await Promise.allSettled([
        verifyRuntimeEnvironmentOwnership(
          competingManifest,
          mockAdapter,
          nonceStore,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T20:30:00.000Z"
        ),
        verifyRuntimeEnvironmentOwnership(
          competingManifest,
          mockAdapter,
          nonceStore,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T20:30:00.000Z"
        ),
      ])

      const fulfilled = results.filter((r) => r.status === "fulfilled")
      const rejected = results.filter((r) => r.status === "rejected")

      expect(fulfilled.length).toBe(1)
      expect(rejected.length).toBe(1)
    })
  })

  describe("4. Chained Audit Verification & Temporal Ordering", () => {
    it("validates valid chain and rejects inverted temporal order", () => {
      const ceremonyId = "ceremony_mfa_closeout_01"
      const preIntent = createSignedPreIntent(
        ceremonyId,
        baseManifest,
        "operator_42",
        privateKeyPem,
        "2026-10-22T20:30:00.000Z"
      )

      const validOutcome = createSignedPostCommitOutcome(
        ceremonyId,
        preIntent,
        privateKeyPem,
        "tx_hash_valid_777",
        "2026-10-22T20:30:05.000Z"
      )
      expect(verifyCeremonyAuditChain(preIntent, validOutcome, publicKeyPem)).toBe(true)

      const invertedOutcome = createSignedPostCommitOutcome(
        ceremonyId,
        preIntent,
        privateKeyPem,
        "tx_hash_inverted",
        "2026-10-22T20:29:59.000Z" // Earlier than preIntent!
      )
      expect(verifyCeremonyAuditChain(preIntent, invertedOutcome, publicKeyPem)).toBe(false)
    })
  })

  describe("5. Execution Safety Gate", () => {
    it("enforces BOOTSTRAP_EXECUTION_GATE_OPEN is false", () => {
      expect(BOOTSTRAP_EXECUTION_GATE_OPEN).toBe(false)
    })

    it("throws immediately when called with closed gate", async () => {
      await expect(taskMfaBootstrap({ container: {} as any, args: [] })).rejects.toThrow(
        /BOOTSTRAP_EXECUTION_GATE_OPEN = false/
      )
    })
  })
})