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
  createVerifiedCommittedStateEvidence,
  computeCommittedStateDigest,
  verifyCommittedStateViaAdapter,
  CommittedStateEvidence,
  ReadbackProvenance,
  DatabaseReadbackAdapter,
  verifyPathEffectiveSecurity,
  PathSecurityInspection,
  redactSensitiveData,
  DurableCheckpointManager,
  CheckpointStorageAdapter,
  FilesystemDurableCheckpointAdapter,
  DurableAtomicNonceStore,
  AtomicNonceStorageAdapter,
  verifyBootstrapExecutionPrerequisites,
  executeBootstrapController,
  ExecutionControllerContext,
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

  describe("4. Chained Audit Verification & Verifiable Committed State", () => {
    const validProvenance: ReadbackProvenance = {
      verifierIdentity: "independent_database_readback_adapter",
      readbackTimestamp: "2026-10-22T20:30:04.000Z",
      querySnapshotSha256: "snapshot_hash_abc_123",
    }

    it("validates valid chain and rejects inverted temporal order or unverified transaction hash", () => {
      const ceremonyId = "ceremony_mfa_closeout_01"
      const preIntent = createSignedPreIntent(
        ceremonyId,
        baseManifest,
        "agent_executor_test_42",
        privateKeyPem,
        "2026-10-22T20:30:00.000Z"
      )

      const validEvidence = createVerifiedCommittedStateEvidence(
        ceremonyId,
        baseManifest.targetDatabase,
        "tx_hash_valid_777",
        "ARMED",
        validProvenance,
        [
          { entityType: "user", entityId: "usr_01", digestSha256: "digest_u1" },
          { entityType: "person", entityId: "per_01", digestSha256: "digest_p1" },
        ],
        "2026-10-22T20:30:04.000Z"
      )

      const validOutcome = createSignedPostCommitOutcome(
        ceremonyId,
        preIntent,
        validEvidence,
        privateKeyPem,
        "2026-10-22T20:30:05.000Z"
      )
      expect(verifyCeremonyAuditChain(preIntent, validOutcome, publicKeyPem, validEvidence)).toBe(true)

      // Inverted temporal order
      const invertedOutcome = createSignedPostCommitOutcome(
        ceremonyId,
        preIntent,
        validEvidence,
        privateKeyPem,
        "2026-10-22T20:29:59.000Z"
      )
      expect(verifyCeremonyAuditChain(preIntent, invertedOutcome, publicKeyPem, validEvidence)).toBe(false)

      // Rejects arbitrary caller-provided outcome without verified evidence
      expect(() =>
        createSignedPostCommitOutcome(
          ceremonyId,
          preIntent,
          null as unknown as CommittedStateEvidence,
          privateKeyPem
        )
      ).toThrow(/createSignedPostCommitOutcome requires verified CommittedStateEvidence/)

      // Rejects unverified / missing evidence in verifyCeremonyAuditChain
      expect(verifyCeremonyAuditChain(preIntent, validOutcome, publicKeyPem)).toBe(false)

      // Rejects forged / mismatched evidence in verifyCeremonyAuditChain
      const forgedEvidence: CommittedStateEvidence = {
        ...validEvidence,
        transactionHash: "tx_hash_forged_999",
      }
      expect(verifyCeremonyAuditChain(preIntent, validOutcome, publicKeyPem, forgedEvidence)).toBe(false)
    })

    it("rejects invalid MFA latch value or missing independent provenance", () => {
      const ceremonyId = "ceremony_mfa_closeout_02"
      expect(() =>
        createVerifiedCommittedStateEvidence(
          ceremonyId,
          baseManifest.targetDatabase,
          "tx_hash_test",
          "UNARMED" as any,
          validProvenance,
          [{ entityType: "user", entityId: "usr_01", digestSha256: "digest_u1" }]
        )
      ).toThrow(/Invalid MFA latch value for committed state evidence/)

      const badProvenance = {
        verifierIdentity: "untrusted_caller" as any,
        readbackTimestamp: "2026-10-22T20:30:00.000Z",
        querySnapshotSha256: "fake",
      }
      expect(() =>
        createVerifiedCommittedStateEvidence(
          ceremonyId,
          baseManifest.targetDatabase,
          "tx_hash_test",
          "ARMED",
          badProvenance,
          [{ entityType: "user", entityId: "usr_01", digestSha256: "digest_u1" }]
        )
      ).toThrow(/Invalid or unverified readback provenance/)
    })

    it("explicitly remains BLOCKED when no trusted database readback adapter is commissioned", async () => {
      await expect(
        verifyCommittedStateViaAdapter(null, "target_db", "tx_hash", "ceremony_01")
      ).rejects.toThrow(/BLOCKED: No trusted independent database readback adapter is commissioned/)
    })
  })

  describe("5. Windows Effective-Access Security Verification", () => {
    const authorizedPrincipal = "ASUS-X512JF-BQ1\\Deniz"

    it("accepts valid security inspection restricted to authorized principal and system", () => {
      const validInspection: PathSecurityInspection = {
        path: "C:\\Users\\Deniz\\.dogruadres_mfa_task_private\\key.pem",
        owner: authorizedPrincipal,
        isReparsePoint: false,
        entries: [
          { principal: authorizedPrincipal, rights: ["FullControl"], accessType: "Allow", isInherited: false },
          { principal: "NT AUTHORITY\\SYSTEM", rights: ["FullControl"], accessType: "Allow", isInherited: false },
          { principal: "BUILTIN\\Administrators", rights: ["FullControl"], accessType: "Allow", isInherited: false },
        ],
      }
      expect(() => verifyPathEffectiveSecurity(validInspection, authorizedPrincipal)).not.toThrow()
    })

    it("rejects path that is a reparse point (symlink or junction)", () => {
      const reparseInspection: PathSecurityInspection = {
        path: "C:\\Users\\Deniz\\symlink_dir\\key.pem",
        owner: authorizedPrincipal,
        isReparsePoint: true,
        entries: [
          { principal: authorizedPrincipal, rights: ["FullControl"], accessType: "Allow", isInherited: false },
        ],
      }
      expect(() => verifyPathEffectiveSecurity(reparseInspection, authorizedPrincipal)).toThrow(
        /is a reparse point/
      )
    })

    it("rejects path with mismatched owner", () => {
      const wrongOwnerInspection: PathSecurityInspection = {
        path: "C:\\Users\\Deniz\\key.pem",
        owner: "ASUS-X512JF-BQ1\\OtherUser",
        isReparsePoint: false,
        entries: [
          { principal: authorizedPrincipal, rights: ["FullControl"], accessType: "Allow", isInherited: false },
        ],
      }
      expect(() => verifyPathEffectiveSecurity(wrongOwnerInspection, authorizedPrincipal)).toThrow(
        /owner mismatch/
      )
    })

    it("rejects unexpected readable principal (e.g. CodexSandboxUsers or Everyone)", () => {
      const sandboxInspection: PathSecurityInspection = {
        path: "C:\\Users\\Deniz\\key.pem",
        owner: authorizedPrincipal,
        isReparsePoint: false,
        entries: [
          { principal: authorizedPrincipal, rights: ["FullControl"], accessType: "Allow", isInherited: false },
          { principal: "NT AUTHORITY\\SYSTEM", rights: ["FullControl"], accessType: "Allow", isInherited: false },
          { principal: "ASUS-X512JF-BQ1\\CodexSandboxUsers", rights: ["ReadAndExecute"], accessType: "Allow", isInherited: true },
        ],
      }
      expect(() => verifyPathEffectiveSecurity(sandboxInspection, authorizedPrincipal)).toThrow(
        /Unexpected readable\/authorized principal "ASUS-X512JF-BQ1\\CodexSandboxUsers"/
      )

      const everyoneInspection: PathSecurityInspection = {
        path: "C:\\Users\\Deniz\\key.pem",
        owner: authorizedPrincipal,
        isReparsePoint: false,
        entries: [
          { principal: authorizedPrincipal, rights: ["FullControl"], accessType: "Allow", isInherited: false },
          { principal: "Everyone", rights: ["Read"], accessType: "Allow", isInherited: false },
        ],
      }
      expect(() => verifyPathEffectiveSecurity(everyoneInspection, authorizedPrincipal)).toThrow(
        /Unexpected readable\/authorized principal "Everyone"/
      )
    })
  })

  describe("6. Task-Private Durable Checkpoints & Sensitive Error Redaction", () => {
    it("redacts database connection passwords, bearer tokens, and private keys from errors", () => {
      const sensitiveMsg = "Error connecting to postgresql://postgres:superSecretPass123@127.0.0.1:5432/mfa_db with Bearer eyJhbGciOiJIUzI1NiJ9.secret and key -----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg\n-----END PRIVATE KEY-----"
      const redacted = redactSensitiveData(sensitiveMsg)
      expect(redacted).not.toContain("superSecretPass123")
      expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9.secret")
      expect(redacted).not.toContain("MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg")
      expect(redacted).toContain("[REDACTED_PASSWORD]")
      expect(redacted).toContain("[REDACTED_TOKEN]")
      expect(redacted).toContain("[REDACTED_PRIVATE_KEY]")
    })

    it("initializes checkpoint and prevents unsafe retries on existing incomplete/completed checkpoint", async () => {
      const storage = new Map<string, string>()
      const mockStorageAdapter: CheckpointStorageAdapter = {
        exists: async (fp) => storage.has(fp),
        read: async (fp) => {
          const val = storage.get(fp)
          if (!val) throw new Error("File not found")
          return val
        },
        atomicWrite: async (fp, content) => {
          storage.set(fp, content)
        },
      }

      const manager = new DurableCheckpointManager(mockStorageAdapter)
      const cpPath = "C:\\evidence\\task.checkpoint.json"

      // Initialize brand new checkpoint
      const state = await manager.initializeCheckpoint(cpPath, "task_isolated_db")
      expect(state.status).toBe("in_progress")
      expect(state.completedSteps.length).toBe(0)

      // Second initialization while in_progress MUST fail closed
      await expect(manager.initializeCheckpoint(cpPath, "task_isolated_db")).rejects.toThrow(
        /Checkpoint already exists with status "in_progress". Unsafe retry prevented/
      )

      // Record steps
      await manager.recordStep(cpPath, state, "step_auth_registered_A", {
        label: "A",
        userId: "usr_1",
        authIdentityId: "aid_1",
        personId: "per_1",
        bindingCreated: true,
      })
      expect(state.completedSteps).toContain("step_auth_registered_A")
      expect(state.principals.length).toBe(1)

      // Record failure with sensitive error
      await manager.recordFailure(cpPath, state, new Error("Failed at postgresql://user:myPass@127.0.0.1/db"))
      expect(state.status).toBe("failed")
      expect(state.error).toContain("[REDACTED_PASSWORD]")
      expect(state.error).not.toContain("myPass")

      // Subsequent initialization on failed checkpoint still fails closed
      await expect(manager.initializeCheckpoint(cpPath, "task_isolated_db")).rejects.toThrow(
        /Checkpoint already exists with status "failed". Unsafe retry prevented/
      )
    })

    it("rejects corrupted or interrupted checkpoint files with manual forensic review error", async () => {
      const storage = new Map<string, string>()
      storage.set("C:\\evidence\\corrupt.checkpoint.json", "{ malformed_json: true, unterminated")

      const mockStorageAdapter: CheckpointStorageAdapter = {
        exists: async (fp) => storage.has(fp),
        read: async (fp) => storage.get(fp)!,
        atomicWrite: async (fp, content) => {
          storage.set(fp, content)
        },
      }

      const manager = new DurableCheckpointManager(mockStorageAdapter)
      await expect(
        manager.initializeCheckpoint("C:\\evidence\\corrupt.checkpoint.json", "target_db")
      ).rejects.toThrow(/Corrupted checkpoint exists.*Manual forensic review required/)
    })
  })

  describe("7. Durable Atomic Nonce Store & Cross-Instance Race Safety", () => {
    it("guarantees atomic claim-if-absent across competing store instances and rejects replays", async () => {
      const persistedClaims = new Map<string, { runId: string; expiresAt: string }>()
      const sharedAdapter: AtomicNonceStorageAdapter = {
        claimIfAbsent: async (entry) => {
          if (persistedClaims.has(entry.nonce)) {
            return false
          }
          persistedClaims.set(entry.nonce, { runId: entry.runId, expiresAt: entry.expiresAt })
          return true
        },
      }

      const instanceA = new DurableAtomicNonceStore(sharedAdapter)
      const instanceB = new DurableAtomicNonceStore(sharedAdapter)

      // Concurrent race between two distinct instances for the exact same nonce
      const [claimA, claimB] = await Promise.all([
        instanceA.claimOnce("nonce_race_999", "run_A", "2026-10-22T22:00:00Z"),
        instanceB.claimOnce("nonce_race_999", "run_B", "2026-10-22T22:00:00Z"),
      ])

      // Exactly one must succeed, the other must fail closed
      expect((claimA && !claimB) || (!claimA && claimB)).toBe(true)

      // Both instances now see the nonce as consumed
      expect(await instanceA.claimOnce("nonce_race_999", "run_A2", "2026-10-22T22:00:00Z")).toBe(false)
      expect(await instanceB.claimOnce("nonce_race_999", "run_B2", "2026-10-22T22:00:00Z")).toBe(false)
    })
  })

  describe("8. Fail-Closed Bootstrap Execution Controller Boundary", () => {
    const operatorPrincipal = baseManifest.authorizedOperator.windowsSecurityPrincipal
    const validInspection: PathSecurityInspection = {
      path: "C:\\evidence\\key.pem",
      owner: operatorPrincipal,
      isReparsePoint: false,
      entries: [
        { principal: operatorPrincipal, rights: ["FullControl"], accessType: "Allow", isInherited: false },
        { principal: "NT AUTHORITY\\SYSTEM", rights: ["FullControl"], accessType: "Allow", isInherited: false },
        { principal: "BUILTIN\\Administrators", rights: ["FullControl"], accessType: "Allow", isInherited: false },
      ],
    }

    const mockResourceAdapter: RuntimeResourceAdapter = {
      inspectContainer: async () => ({
        exists: true,
        isRunning: true,
        volumeNames: [baseManifest.targetVolumeName],
      }),
      inspectDatabase: async () => ({
        dbName: baseManifest.targetDatabase,
        isExclusive: true,
      }),
      getCurrentGitSha: async () => baseManifest.targetCommitSha,
      getOperatorPrincipal: async () => ({
        windowsPrincipal: baseManifest.authorizedOperator.windowsSecurityPrincipal,
      }),
    }

    const makePinnedApproval = (): PinnedOperatorApproval => ({
      trustDomain: "dogruadres-m0-mfa",
      executorType: "automation_agent",
      runId: baseManifest.runId,
      operatorId: baseManifest.authorizedOperator.operatorId,
      windowsPrincipal: baseManifest.authorizedOperator.windowsSecurityPrincipal,
      approvalReference: baseManifest.authorizedOperator.approvalReference,
      keyFingerprint,
      taskEnvironmentId: baseManifest.taskEnvironmentId,
      targetDatabase: baseManifest.targetDatabase,
      targetCommitSha: baseManifest.targetCommitSha,
      validFrom: "2026-10-22T00:00:00Z",
      validUntil: "2026-10-23T00:00:00Z",
    })

    const makeRegistryData = (): TrustedRegistryData => ({
      registrySchemaVersion: "1.1.0",
      trustDomain: "dogruadres-m0-mfa",
      operators: [
        {
          executorType: "automation_agent",
          operatorId: baseManifest.authorizedOperator.operatorId,
          windowsPrincipal: baseManifest.authorizedOperator.windowsSecurityPrincipal,
          approvalReference: baseManifest.authorizedOperator.approvalReference,
          publicKeyPem,
          keyFingerprint,
          validFrom: "2026-10-22T00:00:00Z",
          validUntil: "2026-10-23T00:00:00Z",
        },
      ],
    })

    const makeSignedManifest = (): SignedTaskManifest => {
      const payload = Buffer.from(canonicalJsonStringify(baseManifest), "utf8")
      const sig = require("node:crypto").sign(null, payload, privateKeyPem).toString("base64")
      return {
        manifest: baseManifest,
        signerKeyFingerprint: keyFingerprint,
        signatureBase64: sig,
      }
    }

    it("fails closed when execution gate is false", () => {
      const ctx: ExecutionControllerContext = {
        executionGateOpen: false,
        pinnedApproval: makePinnedApproval(),
        registryData: makeRegistryData(),
        signedManifest: makeSignedManifest(),
        resourceAdapter: mockResourceAdapter,
        nonceStore: { claimOnce: async () => true },
        pathSecurityInspection: validInspection,
        connectionString: "postgres://127.0.0.1:55720/task_isolated_authorized_db",
        nowIso: "2026-10-22T20:30:00Z",
      }
      expect(() => verifyBootstrapExecutionPrerequisites(ctx)).toThrow(
        /BOOTSTRAP_EXECUTION_GATE_OPEN is false/
      )
    })

    it("fails closed when INDEPENDENT_PINNED_OPERATOR_APPROVAL is null", () => {
      const ctx: ExecutionControllerContext = {
        executionGateOpen: true,
        pinnedApproval: null,
        registryData: makeRegistryData(),
        signedManifest: makeSignedManifest(),
        resourceAdapter: mockResourceAdapter,
        nonceStore: { claimOnce: async () => true },
        pathSecurityInspection: validInspection,
        connectionString: "postgres://127.0.0.1:55720/task_isolated_authorized_db",
        nowIso: "2026-10-22T20:30:00Z",
      }
      expect(() => verifyBootstrapExecutionPrerequisites(ctx)).toThrow(
        /INDEPENDENT_PINNED_OPERATOR_APPROVAL is null/
      )
    })

    it("fails closed when path security has unexpected readable principal", () => {
      const badInspection: PathSecurityInspection = {
        ...validInspection,
        entries: [
          ...validInspection.entries,
          { principal: "ASUS-X512JF-BQ1\\CodexSandboxUsers", rights: ["Read"], accessType: "Allow", isInherited: true },
        ],
      }
      const ctx: ExecutionControllerContext = {
        executionGateOpen: true,
        pinnedApproval: makePinnedApproval(),
        registryData: makeRegistryData(),
        signedManifest: makeSignedManifest(),
        resourceAdapter: mockResourceAdapter,
        nonceStore: { claimOnce: async () => true },
        pathSecurityInspection: badInspection,
        connectionString: "postgres://127.0.0.1:55720/task_isolated_authorized_db",
        nowIso: "2026-10-22T20:30:00Z",
      }
      expect(() => verifyBootstrapExecutionPrerequisites(ctx)).toThrow(
        /Unexpected readable\/authorized principal/
      )
    })

    it("executes controlled effect when all prerequisites and ownership checks pass", async () => {
      let effectExecuted = false
      const ctx: ExecutionControllerContext = {
        executionGateOpen: true,
        pinnedApproval: makePinnedApproval(),
        registryData: makeRegistryData(),
        signedManifest: makeSignedManifest(),
        resourceAdapter: mockResourceAdapter,
        nonceStore: { claimOnce: async () => true },
        pathSecurityInspection: validInspection,
        connectionString: "postgres://127.0.0.1:55720/task_isolated_authorized_db",
        nowIso: "2026-10-22T20:30:00Z",
      }

      await executeBootstrapController(ctx, async () => {
        effectExecuted = true
      })
      expect(effectExecuted).toBe(true)
    })
  })

  describe("9. Real Bootstrap Entry Point Fail-Closed & Controller Enforcement", () => {
    it("enforces BOOTSTRAP_EXECUTION_GATE_OPEN is false", () => {
      expect(BOOTSTRAP_EXECUTION_GATE_OPEN).toBe(false)
    })

    it("throws immediately when called with closed gate and redacts sensitive info", async () => {
      await expect(taskMfaBootstrap({ container: {} as any, args: [] })).rejects.toThrow(
        /BOOTSTRAP_EXECUTION_GATE_OPEN = false/
      )
    })
  })
})
