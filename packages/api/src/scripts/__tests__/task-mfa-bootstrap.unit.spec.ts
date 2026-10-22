import { generateKeyPairSync } from "node:crypto"
import {
  canonicalJsonStringify,
  computePublicKeyFingerprint,
  createTrustedOperatorRegistry,
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
  TrustedRegistryData,
  PinnedOperatorApproval,
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

describe("Operator Audit Protocol & Final Source Trust Boundary", () => {
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
    manifestVersion: "1.1.0",
    runId: "run_20261022_001",
    nonce: "nonce_unique_random_bytes_abc123",
    taskEnvironmentId: "task_env_20261022_clean",
    targetDatabase: "task_isolated_authorized_db",
    targetHost: "127.0.0.1",
    targetPort: "55720",
    targetContainerName: "dogruadres-mfa-e2e-isolated-pg",
    targetVolumeName: "dogruadres-mfa-e2e-isolated-data",
    authorizedOperator: {
      executorType: "automation_agent",
      operatorId: "agent_executor_test_42",
      windowsSecurityPrincipal: "S-1-5-21-123456789-123456789-123456789-1001",
      approvalReference: "https://github.com/DenizOner/DogruAdres/issues/230#issuecomment-6347609069",
    },
    targetCommitSha: "dd22989ab67b590a5cbb00a26cfc7c7393f6b5ba",
    issuedAt: "2026-10-22T20:00:00.000Z",
    expiresAt: "2026-10-22T22:00:00.000Z",
  }

  describe("1. Strict RFC 8785 Canonical JSON Serialization & Fail-Closed Contract", () => {
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

    it("rejects BigInt, functions, symbols, and undefined in objects and arrays", () => {
      expect(() => canonicalJsonStringify(BigInt(42))).toThrow(/Unsupported value type/)
      expect(() => canonicalJsonStringify({ fn: () => {} })).toThrow(/Undefined, symbol or function value found/)
      expect(() => canonicalJsonStringify({ undef: undefined })).toThrow(/Undefined, symbol or function value found/)
      expect(() => canonicalJsonStringify([undefined])).toThrow(/Sparse arrays or undefined elements are forbidden/)
    })

    it("rejects sparse arrays", () => {
      const sparse = new Array(3)
      sparse[0] = 1
      sparse[2] = 3
      expect(() => canonicalJsonStringify(sparse)).toThrow(/Sparse arrays or undefined elements are forbidden/)
    })

    it("rejects circular references in objects and arrays", () => {
      const circularObj: any = { a: 1 }
      circularObj.self = circularObj
      expect(() => canonicalJsonStringify(circularObj)).toThrow(/Circular reference detected/)

      const circularArr: any = [1, 2]
      circularArr.push(circularArr)
      expect(() => canonicalJsonStringify(circularArr)).toThrow(/Circular reference detected/)
    })

    it("rejects lone surrogate code points (malformed Unicode)", () => {
      expect(() => canonicalJsonStringify("invalid\uD800unicode")).toThrow(/Lone surrogate code point detected/)
      expect(() => canonicalJsonStringify("invalid\uDC00unicode")).toThrow(/Lone surrogate code point detected/)
    })

    it("accepts valid surrogate pairs (valid Unicode characters)", () => {
      const emoji = "\uD83D\uDE00" // 😀
      expect(canonicalJsonStringify(emoji)).toBe(JSON.stringify(emoji))
    })
  })

  describe("2. Pure TrustedOperatorRegistry Factory & Data Validation", () => {
    const pinnedApproval = (): PinnedOperatorApproval => ({
      trustDomain: "dogruadres-m0-mfa",
      executorType: "automation_agent",
      runId: "run_20261022_001",
      operatorId: "agent_executor_test_42",
      windowsPrincipal: "S-1-5-21-123456789-123456789-123456789-1001",
      approvalReference: "https://github.com/DenizOner/DogruAdres/issues/230#issuecomment-6347609069",
      keyFingerprint,
      taskEnvironmentId: "task_env_20261022_clean",
      targetDatabase: "task_isolated_authorized_db",
      targetCommitSha: "dd22989ab67b590a5cbb00a26cfc7c7393f6b5ba",
      validFrom: "2026-10-22T00:00:00Z",
      validUntil: "2026-10-23T00:00:00Z",
    })
    const testNow = "2026-10-22T20:30:00Z"
    const validRegistryData: TrustedRegistryData = {
      registrySchemaVersion: "1.1.0",
      trustDomain: "dogruadres-m0-mfa",
      operators: [
        {
          executorType: "automation_agent",
          operatorId: "agent_executor_test_42",
          windowsPrincipal: "S-1-5-21-123456789-123456789-123456789-1001",
          approvalReference: "https://github.com/DenizOner/DogruAdres/issues/230#issuecomment-6347609069",
          publicKeyPem: "", // filled in test
          keyFingerprint: "", // filled in test
          validFrom: "2026-10-22T00:00:00Z",
          validUntil: "2026-10-23T00:00:00Z",
        },
      ],
    }

    it("loads actual JSON bytes, constructs registry, and verifies valid signed manifest", () => {
      const concreteRegistryData: TrustedRegistryData = {
        ...validRegistryData,
        operators: [
          {
            ...validRegistryData.operators[0],
            publicKeyPem,
            keyFingerprint,
          },
        ],
      }
      const rawJsonBytes = Buffer.from(JSON.stringify(concreteRegistryData), "utf8")
      const parsed = JSON.parse(rawJsonBytes.toString("utf8"))
      const registry = createTrustedOperatorRegistry(parsed, pinnedApproval(), testNow)

      expect(registry.isFingerprintTrusted(keyFingerprint)).toBe(true)
      expect(registry.isOperatorApproved(baseManifest.authorizedOperator)).toBe(true)

      const payload = Buffer.from(canonicalJsonStringify(baseManifest), "utf8")
      const sig = require("node:crypto").sign(null, payload, privateKeyPem).toString("base64")
      const signed: SignedTaskManifest = {
        manifest: baseManifest,
        signerKeyFingerprint: keyFingerprint,
        signatureBase64: sig,
      }
      expect(() => verifySignedManifest(signed, registry)).not.toThrow()
    })

    it("rejects an agent impersonating a human and a mismatched execution run", () => {
      const candidate = {...validRegistryData, operators: [{...validRegistryData.operators[0], publicKeyPem, keyFingerprint}]}
      const registry = createTrustedOperatorRegistry(candidate, pinnedApproval(), testNow)
      const assertedHuman = { ...baseManifest,
        authorizedOperator: { operatorId: "fictional_human", windowsSecurityPrincipal: baseManifest.authorizedOperator.windowsSecurityPrincipal, approvalReference: baseManifest.authorizedOperator.approvalReference },
      } as unknown as TaskResourceManifest
      expect(() => verifySignedManifest({manifest: assertedHuman, signerKeyFingerprint: keyFingerprint, signatureBase64: "invalid"}, registry))
        .toThrow(/explicit non-human executor/)
      const wrongRun = {...baseManifest, runId: "different_execution"}
      const signed = require("node:crypto").sign(
        null, Buffer.from(canonicalJsonStringify(wrongRun), "utf8"), privateKeyPem
      ).toString("base64")
      expect(() => verifySignedManifest({manifest: wrongRun, signerKeyFingerprint: keyFingerprint, signatureBase64: signed}, registry))
        .toThrow(/Signer key and operator do not match/)
    })

    it("refuses candidate JSON without an independently pinned authorization", () => {
      const candidate = {
        ...validRegistryData,
        operators: [{
          ...validRegistryData.operators[0],
          publicKeyPem,
          keyFingerprint,
        }],
      }
      expect(() => createTrustedOperatorRegistry(candidate, null, testNow)).toThrow(/No independently pinned/)
    })

    it("refuses a self-signed but unauthorized registry and cross-operator claims", () => {
      const candidate = {
        ...validRegistryData,
        operators: [{
          ...validRegistryData.operators[0],
          publicKeyPem,
          keyFingerprint,
        }],
      }
      const swapped = {
        ...candidate,
        operators: [{ ...candidate.operators[0], publicKeyPem: otherPublicKeyPem, keyFingerprint: otherKeyFingerprint }],
      }
      expect(() => createTrustedOperatorRegistry(swapped, pinnedApproval(), testNow)).toThrow(/independent approval/)
      const registry = createTrustedOperatorRegistry(candidate, pinnedApproval(), testNow)
      const wrongOperator = {
        ...baseManifest,
        authorizedOperator: { ...baseManifest.authorizedOperator, operatorId: "other_approved_operator" },
      }
      const signature = require("node:crypto").sign(
        null, Buffer.from(canonicalJsonStringify(wrongOperator), "utf8"), privateKeyPem
      ).toString("base64")
      expect(() => verifySignedManifest({
        manifest: wrongOperator, signerKeyFingerprint: keyFingerprint, signatureBase64: signature,
      }, registry)).toThrow(/Signer key and operator do not match/)
    })

    it("rejects expired and altered approval scope, extra operator entries", () => {
      const candidate = {
        ...validRegistryData,
        operators: [{
          ...validRegistryData.operators[0],
          publicKeyPem,
          keyFingerprint,
        }],
      }
      expect(() => createTrustedOperatorRegistry(candidate, pinnedApproval(), "2026-10-24T20:30:00Z"))
        .toThrow(/invalid or expired/)
      expect(() => createTrustedOperatorRegistry(candidate, {
        ...pinnedApproval(), approvalReference: "https://github.com/unauthorized"
      }, testNow)).toThrow(/independent approval/)
      expect(() => createTrustedOperatorRegistry({
        ...candidate,
        operators: [...candidate.operators, { ...candidate.operators[0], operatorId: "another_operator" }],
      }, pinnedApproval(), testNow)).toThrow(/Exactly one/)
    })

    it("rejects registry with wrong trust domain or schema version", () => {
      expect(() => createTrustedOperatorRegistry({ registrySchemaVersion: "2.0.0" }, pinnedApproval(), testNow)).toThrow(/Unsupported registry schema version/)
      expect(() =>
        createTrustedOperatorRegistry({
          registrySchemaVersion: "1.1.0",
          trustDomain: "wrong-domain",
          operators: [],
        }, pinnedApproval(), testNow)
      ).toThrow(/Trust domain mismatch/)
    })

    it("rejects registry with corrupted key fingerprint (mismatch with PEM)", () => {
      const corruptData = {
        registrySchemaVersion: "1.1.0",
        trustDomain: "dogruadres-m0-mfa",
        operators: [
          {
            executorType: "automation_agent",
            operatorId: "agent_executor_test_42",
            windowsPrincipal: "S-1-5-21-123456789-123456789-123456789-1001",
            approvalReference: "https://github.com/DenizOner/DogruAdres/issues/230#issuecomment-6347609069",
            publicKeyPem,
            keyFingerprint: "0000000000000000000000000000000000000000000000000000000000000000",
            validFrom: "2026-10-22T00:00:00Z",
            validUntil: "2026-10-23T00:00:00Z",
          },
        ],
      }
      expect(() => createTrustedOperatorRegistry(corruptData, pinnedApproval(), testNow)).toThrow(/Key fingerprint mismatch for operator/)
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
        "agent_executor_test_42",
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
        "2026-10-22T20:29:59.000Z"
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