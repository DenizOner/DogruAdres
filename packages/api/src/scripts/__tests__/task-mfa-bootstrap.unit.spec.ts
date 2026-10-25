import { INDEPENDENT_REVIEWER_TRUST_ROOT } from "../reviewer-execution-grant"
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
  CommittedEntityDigest,
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

  mustClassifyBootstrapFailureAsIndeterminate,
} from "../task-mfa-bootstrap"
import taskMfaBootstrap from "../task-mfa-bootstrap"
import {
  NativeWindowsSecurityAdapter,
  NativeDockerResourceAdapter,
  NativeFileAtomicNonceAdapter,
  NativePostgresReadbackAdapter,
  assertDockerResourceMatchesBinding,
  type ApprovedRuntimeResourceBinding,
} from "../native-runtime-adapters"

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

    it("rejects the superseded R0-A key even when a candidate registry claims independent approval", () => {
      const oldPublicKeyPem = [
        "-----BEGIN PUBLIC KEY-----",
        "MCowBQYDK2VwAyEAxzadu7g+Hsai94XKtfno831EXwn77ZLxIC2tWG78JCE=",
        "-----END PUBLIC KEY-----",
        "",
      ].join("\n")
      const supersededFingerprint = "f0e625dc8886b15dbd5a270c9f5d18f57b8ae74f3d75d3f02833123ebb916d52"
      expect(computePublicKeyFingerprint(oldPublicKeyPem)).toBe(supersededFingerprint)
      const revokedCandidate: TrustedRegistryData = {
        ...validRegistryData,
        operators: [{
          ...validRegistryData.operators[0],
          publicKeyPem: oldPublicKeyPem,
          keyFingerprint: supersededFingerprint,
        }],
      }
      expect(() => createTrustedOperatorRegistry(
        revokedCandidate,
        { ...pinnedApproval(), keyFingerprint: supersededFingerprint },
        testNow
      )).toThrow(/superseded/)
      const safeRegistry = createTrustedOperatorRegistry(
        { ...validRegistryData, operators: [{ ...validRegistryData.operators[0], publicKeyPem, keyFingerprint }] },
        pinnedApproval(),
        testNow
      )
      expect(() => verifySignedManifest({
        manifest: baseManifest,
        signerKeyFingerprint: supersededFingerprint,
        signatureBase64: "unused",
      }, safeRegistry)).toThrow(/superseded/)
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

    it("does not consume a nonce when resource identity fails before authorization", async () => {
      const nonceStore = { claimOnce: jest.fn().mockResolvedValue(true) }
      const wrongShaAdapter: RuntimeResourceAdapter = {
        ...mockAdapter,
        getCurrentGitSha: jest.fn().mockResolvedValue("unapproved_commit_sha"),
      }
      await expect(
        verifyRuntimeEnvironmentOwnership(
          baseManifest,
          wrongShaAdapter,
          nonceStore,
          "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
          "2026-10-22T20:30:00.000Z"
        )
      ).rejects.toThrow(/Git commit mismatch/)
      expect(nonceStore.claimOnce).not.toHaveBeenCalled()
    })

    it("consumes the nonce once only after resource checks pass", async () => {
      const nonceStore = { claimOnce: jest.fn().mockResolvedValue(true) }
      await verifyRuntimeEnvironmentOwnership(
        baseManifest,
        mockAdapter,
        nonceStore,
        "postgres://user:pass@127.0.0.1:55720/task_isolated_authorized_db",
        "2026-10-22T20:30:00.000Z"
      )
      expect(nonceStore.claimOnce).toHaveBeenCalledTimes(1)
    })

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

    const mockCommittedEntities: CommittedEntityDigest[] = [
      { entityType: "user", entityId: "usr_01", digestSha256: "digest_u1" },
      { entityType: "person", entityId: "per_01", digestSha256: "digest_p1" },
    ]

    const mockReadbackAdapter: DatabaseReadbackAdapter = {
      async queryCommittedState(targetDatabase, transactionHash, ceremonyId) {
        if (transactionHash === "tx_hash_forged_999") {
          throw new Error("Transaction not found in independent database readback")
        }
        if (transactionHash === "tx_hash_unarmed_latch") {
          return createVerifiedCommittedStateEvidence(
            ceremonyId,
            targetDatabase,
            transactionHash,
            "UNARMED" as any,
            validProvenance,
            mockCommittedEntities,
            "2026-10-22T20:30:04.000Z"
          )
        }
        return createVerifiedCommittedStateEvidence(
          ceremonyId,
          targetDatabase,
          transactionHash,
          "ARMED",
          validProvenance,
          mockCommittedEntities,
          "2026-10-22T20:30:04.000Z"
        )
      },
    }

    it("validates valid chain and rejects inverted temporal order or unverified transaction hash", async () => {
      const ceremonyId = "ceremony_mfa_closeout_01"
      const preIntent = createSignedPreIntent(
        ceremonyId,
        baseManifest,
        "agent_executor_test_42",
        privateKeyPem,
        "2026-10-22T20:30:00.000Z"
      )

      const { outcome: validOutcome } = await createSignedPostCommitOutcome(
        ceremonyId,
        preIntent,
        mockReadbackAdapter,
        baseManifest.targetDatabase,
        "tx_hash_valid_777",
        privateKeyPem,
        "2026-10-22T20:30:05.000Z"
      )

      expect(
        await verifyCeremonyAuditChain(
          preIntent,
          validOutcome,
          publicKeyPem,
          mockReadbackAdapter,
          baseManifest.targetDatabase
        )
      ).toBe(true)

      // Inverted temporal order
      const { outcome: invertedOutcome } = await createSignedPostCommitOutcome(
        ceremonyId,
        preIntent,
        mockReadbackAdapter,
        baseManifest.targetDatabase,
        "tx_hash_valid_777",
        privateKeyPem,
        "2026-10-22T20:29:59.000Z"
      )
      expect(
        await verifyCeremonyAuditChain(
          preIntent,
          invertedOutcome,
          publicKeyPem,
          mockReadbackAdapter,
          baseManifest.targetDatabase
        )
      ).toBe(false)

      // Rejects issuance without commissioned readback adapter
      await expect(
        createSignedPostCommitOutcome(
          ceremonyId,
          preIntent,
          null,
          baseManifest.targetDatabase,
          "tx_hash_valid_777",
          privateKeyPem
        )
      ).rejects.toThrow(/BLOCKED: Cannot issue ARMED post-commit outcome without an independently commissioned DatabaseReadbackAdapter/)

      // Rejects verification when readback adapter is null
      expect(
        await verifyCeremonyAuditChain(
          preIntent,
          validOutcome,
          publicKeyPem,
          null,
          baseManifest.targetDatabase
        )
      ).toBe(false)
    })

    it("rejects forged but internally consistent evidence as independent activation proof", async () => {
      const ceremonyId = "ceremony_mfa_closeout_forgery"
      const preIntent = createSignedPreIntent(
        ceremonyId,
        baseManifest,
        "agent_executor_test_42",
        privateKeyPem,
        "2026-10-22T20:30:00.000Z"
      )

      // Create a valid signed outcome for a valid transaction
      const { outcome: validOutcome } = await createSignedPostCommitOutcome(
        ceremonyId,
        preIntent,
        mockReadbackAdapter,
        baseManifest.targetDatabase,
        "tx_hash_valid_777",
        privateKeyPem,
        "2026-10-22T20:30:05.000Z"
      )

      // Caller attempts to verify against a database where transaction does not exist
      expect(
        await verifyCeremonyAuditChain(
          preIntent,
          { ...validOutcome, transactionHash: "tx_hash_forged_999" },
          publicKeyPem,
          mockReadbackAdapter,
          baseManifest.targetDatabase
        )
      ).toBe(false)

      // Caller attempts to supply an outcome with forged latch state when database readback adapter reveals UNARMED
      await expect(
        createSignedPostCommitOutcome(
          ceremonyId,
          preIntent,
          mockReadbackAdapter,
          baseManifest.targetDatabase,
          "tx_hash_unarmed_latch",
          privateKeyPem
        )
      ).rejects.toThrow(/Invalid MFA latch value for committed state evidence/)
    })

    it("rejects invalid MFA latch value or missing independent provenance in evidence factory", () => {
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
      const prefix = "Operation prefix log: connecting to "
      const suffix = " for user authentication; please verify credentials."
      const sensitiveMsg = `${prefix}postgresql://postgres:superSecretPass123@127.0.0.1:5432/mfa_db with Bearer eyJhbGciOiJIUzI1NiJ9.secret and key -----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg\n-----END PRIVATE KEY-----${suffix}`
      const redacted = redactSensitiveData(sensitiveMsg)

      // Verify passwords and tokens are redacted
      expect(redacted).not.toContain("superSecretPass123")
      expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9.secret")
      expect(redacted).toContain("[REDACTED_PASSWORD]")
      expect(redacted).toContain("[REDACTED_TOKEN]")
      expect(redacted).toContain("127.0.0.1:5432/mfa_db")

      // Verify private key material AND delimiters completely disappear
      expect(redacted).not.toContain("MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg")
      expect(redacted).not.toContain("-----BEGIN PRIVATE KEY-----")
      expect(redacted).not.toContain("-----END PRIVATE KEY-----")
      expect(redacted).toContain("[REDACTED_PRIVATE_KEY]")

      // Verify unrelated prefix and suffix text remains exactly intact
      expect(redacted).toContain(prefix)
      expect(redacted).toContain(suffix)
    })

    it("redacts all supported PEM private-key formats and leaves public keys intact", () => {
      const pemKeyTypes = [
        { header: "PRIVATE KEY", body: "abcxyz123=" },
        { header: "RSA PRIVATE KEY", body: "MIIEowIBAAKCAQEA0syntheticRsaKeyMaterial==" },
        { header: "EC PRIVATE KEY", body: "MHcCAQEEIsyntheticEcKeyMaterial==" },
        { header: "ENCRYPTED PRIVATE KEY", body: "MIICxxxxSyntheticEncryptedKeyMaterial==" },
        { header: "OPENSSH PRIVATE KEY", body: "b3BlbnNzaGFjZTJ0ZXN0U3ludGhldGljT3BlblNzaEtleQ==" },
        { header: "ED25519 PRIVATE KEY", body: "MC4CAQAwBQYDK2VwBCIEIPsyntheticEd25519KeyMaterial==" },
      ]

      for (const { header, body } of pemKeyTypes) {
        const input = `Pre-text before ${header}: -----BEGIN ${header}-----\n${body}\n-----END ${header}----- Post-text after ${header}.`
        const redacted = redactSensitiveData(input)

        // Key body and delimiters must be completely absent
        expect(redacted).not.toContain(body)
        expect(redacted).not.toContain(`-----BEGIN ${header}-----`)
        expect(redacted).not.toContain(`-----END ${header}-----`)
        expect(redacted).toContain("[REDACTED_PRIVATE_KEY]")

        // Surrounding unrelated text must be preserved
        expect(redacted).toContain(`Pre-text before ${header}: `)
        expect(redacted).toContain(` Post-text after ${header}.`)
      }

      // Public key must remain untouched
      const publicKeyPem = "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----"
      const publicOutput = redactSensitiveData(`Public key output: ${publicKeyPem}`)
      expect(publicOutput).not.toContain("[REDACTED_PRIVATE_KEY]")
      expect(publicOutput).toContain(publicKeyPem)
    })

    it("redacts multiple PEM private-key blocks sharing a line or separated by ordinary text without exposing subsequent blocks", () => {
      // 1. Two blocks separated by ordinary text on the exact same line (regression for PR comment 6403061324)
      const sameLineTwoBlocks =
        "-----BEGIN PRIVATE KEY-----\nKeyONEabc==\n-----END PRIVATE KEY----- and -----BEGIN PRIVATE KEY-----\nKeyTWOxyz==\n-----END PRIVATE KEY-----"
      const sameLineRedacted = redactSensitiveData(sameLineTwoBlocks)
      expect(sameLineRedacted).toBe("[REDACTED_PRIVATE_KEY] and [REDACTED_PRIVATE_KEY]")
      expect(sameLineRedacted).not.toContain("KeyONEabc==")
      expect(sameLineRedacted).not.toContain("KeyTWOxyz==")
      expect(sameLineRedacted).not.toContain("-----BEGIN PRIVATE KEY-----")
      expect(sameLineRedacted).not.toContain("-----END PRIVATE KEY-----")

      // 2. Two blocks separated by newlines
      const newlineTwoBlocks =
        "-----BEGIN OPENSSH PRIVATE KEY-----\nsshBodySynthetic123\n-----END OPENSSH PRIVATE KEY-----\n\n-----BEGIN ENCRYPTED PRIVATE KEY-----\nencBodySynthetic456\n-----END ENCRYPTED PRIVATE KEY-----"
      const newlineRedacted = redactSensitiveData(newlineTwoBlocks)
      expect(newlineRedacted).toBe("[REDACTED_PRIVATE_KEY]\n\n[REDACTED_PRIVATE_KEY]")
      expect(newlineRedacted).not.toContain("sshBodySynthetic123")
      expect(newlineRedacted).not.toContain("encBodySynthetic456")
      expect(newlineRedacted).not.toContain("-----BEGIN OPENSSH PRIVATE KEY-----")
      expect(newlineRedacted).not.toContain("-----BEGIN ENCRYPTED PRIVATE KEY-----")

      // 3. Mixed supported private-key types on same line with text before, middle, after
      const mixedTypes =
        "log prefix before keys -----BEGIN RSA PRIVATE KEY-----\nrsaSynthetic789\n-----END RSA PRIVATE KEY----- log separator middle -----BEGIN EC PRIVATE KEY-----\necSynthetic012\n-----END EC PRIVATE KEY----- log suffix after keys"
      const mixedRedacted = redactSensitiveData(mixedTypes)
      expect(mixedRedacted).toBe(
        "log prefix before keys [REDACTED_PRIVATE_KEY] log separator middle [REDACTED_PRIVATE_KEY] log suffix after keys"
      )
      expect(mixedRedacted).not.toContain("rsaSynthetic789")
      expect(mixedRedacted).not.toContain("ecSynthetic012")
      expect(mixedRedacted).toContain("log prefix before keys ")
      expect(mixedRedacted).toContain(" log separator middle ")
      expect(mixedRedacted).toContain(" log suffix after keys")

      // 4. Multiple blocks with passwords, DSNs, bearer tokens and public keys combined
      const combined =
        "auth error at postgresql://user:myDbPass@127.0.0.1:5432/db with token bearer tok123456 and password: mySecPass " +
        "public: -----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...\n-----END PUBLIC KEY----- " +
        "key1: -----BEGIN PGP PRIVATE KEY BLOCK-----\npgpSyntheticKeyMaterial\n-----END PGP PRIVATE KEY BLOCK----- " +
        "key2: -----BEGIN ED25519 PRIVATE KEY-----\ned25519SyntheticKeyMaterial\n-----END ED25519 PRIVATE KEY-----"
      const combinedRedacted = redactSensitiveData(combined)
      expect(combinedRedacted).not.toContain("myDbPass")
      expect(combinedRedacted).not.toContain("tok123456")
      expect(combinedRedacted).not.toContain("mySecPass")
      expect(combinedRedacted).not.toContain("pgpSyntheticKeyMaterial")
      expect(combinedRedacted).not.toContain("ed25519SyntheticKeyMaterial")
      expect(combinedRedacted).toContain("[REDACTED_PASSWORD]")
      expect(combinedRedacted).toContain("[REDACTED_TOKEN]")
      expect(combinedRedacted).toContain('password: "[REDACTED]"')
      expect(combinedRedacted).toContain(
        "public: -----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...\n-----END PUBLIC KEY-----"
      )
      expect(combinedRedacted).toContain("key1: [REDACTED_PRIVATE_KEY]")
      expect(combinedRedacted).toContain("key2: [REDACTED_PRIVATE_KEY]")

      // 5. Incomplete / unclosed PEM block behavior (fail-closed check)
      const incompletePrecedingClosed =
        "log before -----BEGIN PRIVATE KEY-----\nunclosedSyntheticBody\nlog between -----BEGIN PRIVATE KEY-----\nsecondSyntheticBody\n-----END PRIVATE KEY----- log after"
      const incompleteRedacted = redactSensitiveData(incompletePrecedingClosed)
      expect(incompleteRedacted).not.toContain("unclosedSyntheticBody")
      expect(incompleteRedacted).not.toContain("secondSyntheticBody")
      expect(incompleteRedacted).toContain("log before [REDACTED_PRIVATE_KEY] log after")
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
        createExclusive: async (fp, content) => {
          if (storage.has(fp)) {
            throw new Error(`REFUSED: Checkpoint collision at "${fp}". Exclusive creation failed (EEXIST). Unsafe concurrent reservation prevented`)
          }
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

      // Record steps with per-step native IDs
      await manager.recordStep(cpPath, state, "step_auth_registered_A", {
        label: "A",
        authIdentityId: "aid_1",
      })
      expect(state.completedSteps).toContain("step_auth_registered_A")
      expect(state.principals.length).toBe(1)
      expect(state.principals[0].authIdentityId).toBe("aid_1")

      await manager.recordStep(cpPath, state, "step_user_account_workflow_completed_A", {
        label: "A",
        userId: "usr_1",
      })
      expect(state.principals[0].userId).toBe("usr_1")

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
        createExclusive: async (fp, content) => {
          if (storage.has(fp)) {
            throw new Error(`REFUSED: Checkpoint collision at "${fp}". Exclusive creation failed (EEXIST). Unsafe concurrent reservation prevented`)
          }
          storage.set(fp, content)
        },
      }

      const manager = new DurableCheckpointManager(mockStorageAdapter)
      await expect(
        manager.initializeCheckpoint("C:\\evidence\\corrupt.checkpoint.json", "target_db")
      ).rejects.toThrow(/Corrupted checkpoint exists.*Manual forensic review required/)
    })

    it("handles concurrent checkpoint initialization atomically: exactly one succeeds and second is rejected", async () => {
      const storage = new Map<string, string>()
      const mockStorageAdapter: CheckpointStorageAdapter = {
        exists: async (fp) => storage.has(fp),
        read: async (fp) => storage.get(fp) || "",
        atomicWrite: async (fp, content) => { storage.set(fp, content) },
        createExclusive: async (fp, content) => {
          if (storage.has(fp)) {
            throw new Error(`REFUSED: Checkpoint collision at "${fp}". Exclusive creation failed (EEXIST). Unsafe concurrent reservation prevented`)
          }
          storage.set(fp, content)
        },
      }

      const manager1 = new DurableCheckpointManager(mockStorageAdapter)
      const manager2 = new DurableCheckpointManager(mockStorageAdapter)
      const cpPath = "C:\\evidence\\racing.checkpoint.json"

      const results = await Promise.allSettled([
        manager1.initializeCheckpoint(cpPath, "racing_db"),
        manager2.initializeCheckpoint(cpPath, "racing_db"),
      ])

      const fulfilled = results.filter((r) => r.status === "fulfilled")
      const rejected = results.filter((r) => r.status === "rejected")

      expect(fulfilled.length).toBe(1)
      expect(rejected.length).toBe(1)
      expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
        /Checkpoint already exists with status "in_progress". Unsafe retry prevented|Checkpoint collision/
      )
    })

    it("handles interrupted identity creation and marks crash state as indeterminate", async () => {
      const storage = new Map<string, string>()
      const mockStorageAdapter: CheckpointStorageAdapter = {
        exists: async (fp) => storage.has(fp),
        read: async (fp) => storage.get(fp) || "",
        atomicWrite: async (fp, content) => { storage.set(fp, content) },
        createExclusive: async (fp, content) => {
          if (storage.has(fp)) throw new Error("EEXIST")
          storage.set(fp, content)
        },
      }

      const manager = new DurableCheckpointManager(mockStorageAdapter)
      const cpPath = "C:\\evidence\\interrupted.checkpoint.json"
      const state = await manager.initializeCheckpoint(cpPath, "interrupted_db")

      // Step 1: authIdentity created
      await manager.recordStep(cpPath, state, "auth_registered_A", {
        label: "A",
        authIdentityId: "aid_interrupted_123",
      })

      // Step 2: userId created
      await manager.recordStep(cpPath, state, "user_account_workflow_completed_A", {
        label: "A",
        userId: "usr_interrupted_456",
      })

      // Crash / failure during subsequent person creation (mutations have begun)
      await manager.recordFailure(
        cpPath,
        state,
        new Error("Connection reset by peer mid-transaction"),
        true // indeterminate
      )

      expect(state.status).toBe("indeterminate")
      expect(state.completedSteps).toEqual(["auth_registered_A", "user_account_workflow_completed_A"])
      expect(state.principals[0].authIdentityId).toBe("aid_interrupted_123")
      expect(state.principals[0].userId).toBe("usr_interrupted_456")

      // Checkpoint persisted to disk confirms indeterminate status and recorded IDs
      const rawPersisted = await mockStorageAdapter.read(cpPath)
      const persistedState = JSON.parse(rawPersisted)
      expect(persistedState.status).toBe("indeterminate")
      expect(persistedState.principals[0].userId).toBe("usr_interrupted_456")
      expect(persistedState.error).toContain("Connection reset by peer")
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

    it("prevents any filesystem or database mutations when preflight checks fail", async () => {
      let mutationOccurred = false
      const ctx: ExecutionControllerContext = {
        executionGateOpen: false, // Closed gate
        pinnedApproval: makePinnedApproval(),
        registryData: makeRegistryData(),
        signedManifest: makeSignedManifest(),
        resourceAdapter: mockResourceAdapter,
        nonceStore: { claimOnce: async () => true },
        pathSecurityInspection: validInspection,
        connectionString: "postgres://127.0.0.1:55720/task_isolated_authorized_db",
      }

      await expect(
        executeBootstrapController(ctx, async () => {
          mutationOccurred = true
        })
      ).rejects.toThrow(/BOOTSTRAP_EXECUTION_GATE_OPEN is false/)

      expect(mutationOccurred).toBe(false)
    })
  })

  describe("9. Real Bootstrap Entry Point Fail-Closed & Controller Enforcement", () => {
    it("marks failed native creation as indeterminate even before any ID is checkpointed", () => {
      expect(mustClassifyBootstrapFailureAsIndeterminate(true, [])).toBe(true)
      expect(mustClassifyBootstrapFailureAsIndeterminate(false, ["auth_registered_A"])).toBe(true)
      expect(mustClassifyBootstrapFailureAsIndeterminate(false, ["preconditions_verified"])).toBe(false)
    })

    it("uses the independently source-pinned reviewer root rather than an agent-provided root", () => {
      expect(INDEPENDENT_REVIEWER_TRUST_ROOT).not.toBeNull()
      expect(INDEPENDENT_REVIEWER_TRUST_ROOT?.reviewerId)
        .toBe("dogruadres-r0d-independent-reviewer-20261023")
      expect(INDEPENDENT_REVIEWER_TRUST_ROOT?.fingerprint)
        .toBe("0cff1827bc6cf03e8ffae849278616a5a6da77895d870fbc618fb154a9e850d3")
    })

    it("rejects bootstrap without required connection and reviewer grant inputs", async () => {
      // This negative case owns its missing-input condition, independent of .env.test.
      const saved = process.env.DATABASE_URL
      delete process.env.DATABASE_URL
      try {
        await expect(taskMfaBootstrap({ container: {} as any, args: [] })).rejects.toThrow(
          /DATABASE_URL is missing/
        )
      } finally {
        if (saved === undefined) delete process.env.DATABASE_URL
        else process.env.DATABASE_URL = saved
      }
    })
  })
  describe("10. Real Native Runtime Security Adapters", () => {
    it("rejects swapped Docker IDs, images, mounts, labels and host ports before trusted execution", () => {
      const expected: ApprovedRuntimeResourceBinding = {
        containerId: "a".repeat(64),
        imageId: "sha256:" + "b".repeat(64),
        composeProject: "isolated-r0d",
        volumeName: "isolated-data",
        volumeMountSource: "/var/lib/docker/volumes/isolated-data/_data",
        volumeMountDestination: "/var/lib/postgresql/data",
        loopbackHostPort: "55732",
        postgresSystemIdentifier: "1234567890123456789",
      }
      const actual = {
        Id: expected.containerId,
        Image: expected.imageId,
        State: { Running: true },
        Config: { Labels: { "com.docker.compose.project": expected.composeProject } },
        HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: expected.loopbackHostPort }] } },
        Mounts: [{ Type: "volume", Name: expected.volumeName, Source: expected.volumeMountSource, Destination: expected.volumeMountDestination }],
      }
      expect(() => assertDockerResourceMatchesBinding(actual, expected)).not.toThrow()
      for (const changed of [
        { ...actual, Id: "c".repeat(64) },
        { ...actual, Image: "sha256:" + "c".repeat(64) },
        { ...actual, Config: { Labels: { "com.docker.compose.project": "other" } } },
        { ...actual, Mounts: [{ ...actual.Mounts[0], Name: "other" }] },
        { ...actual, HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "55732" }] } } },
      ]) expect(() => assertDockerResourceMatchesBinding(changed, expected)).toThrow(/immutable Docker identity/)
    })

    it("keeps R1 independent readback disabled without commit-bound attestation", async () => {
      const r1 = new NativePostgresReadbackAdapter("postgres://unused@127.0.0.1:1/unused")
      await expect(r1.queryCommittedState("unused", "fake-commit", "ceremony")).rejects.toThrow(/BLOCKED: R1/)
    })

    it("distinguishes otherwise-colliding nonce names on disk", async () => {
      const fs = await import("node:fs/promises")
      const os = await import("node:os")
      const path = await import("node:path")
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "da-nonce-collision-"))
      try {
        const adapter = new NativeFileAtomicNonceAdapter(root)
        const e = { runId: "run", expiresAt: new Date(Date.now() + 60000).toISOString() }
        expect(await adapter.claimIfAbsent({ ...e, nonce: "a/b" })).toBe(true)
        expect(await adapter.claimIfAbsent({ ...e, nonce: "a?b" })).toBe(true)
        expect(await adapter.claimIfAbsent({ ...e, nonce: "a/b" })).toBe(false)
      } finally {
        await fs.rm(root, { recursive: true, force: true })
      }
    })

    it("validates SID-based native ownership and rejects a different SID", () => {
      const sid = "S-1-5-21-123-456-789-1001"
      const inspection = {
        path: "C:\\private",
        owner: sid,
        isReparsePoint: false,
        entries: [sid, "S-1-5-18", "S-1-5-32-544"].map(principal => ({
          principal, rights: ["FullControl"], accessType: "Allow" as const, isInherited: false,
        })),
      }
      expect(() => verifyPathEffectiveSecurity(inspection, sid)).not.toThrow()
      expect(() => verifyPathEffectiveSecurity(inspection, "S-1-5-21-123-456-789-1002")).toThrow(/owner mismatch/)
      expect(() => verifyPathEffectiveSecurity({ ...inspection, entries: [...inspection.entries,
        { principal: "S-1-1-0", rights: ["Read"], accessType: "Allow", isInherited: true },
      ] }, sid)).toThrow(/Unexpected readable/)
    })
    it("NativeWindowsSecurityAdapter inspects real filesystem path and returns valid ownership & ACEs", async () => {
      const adapter = new NativeWindowsSecurityAdapter()
      if (process.platform !== "win32") {
        await expect(adapter.inspectPathSecurity(process.cwd())).rejects.toThrow(/requires win32/)
        return
      }
      const inspection = await adapter.inspectPathSecurity(process.cwd())
      expect(inspection.path).toBeDefined()
      expect(typeof inspection.owner).toBe("string")
      expect(inspection.owner.length).toBeGreaterThan(0)
      expect(typeof inspection.isReparsePoint).toBe("boolean")
      expect(Array.isArray(inspection.entries)).toBe(true)
      expect(inspection.entries.length).toBeGreaterThan(0)
      expect(inspection.entries[0].principal).toBeDefined()
      expect(["Allow", "Deny"]).toContain(inspection.entries[0].accessType)
    })

    it("NativeDockerResourceAdapter resolves real Git SHA and operator principal", async () => {
      const adapter = new NativeDockerResourceAdapter(process.cwd())
      const sha = await adapter.getCurrentGitSha()
      expect(sha).toMatch(/^[0-9a-f]{40}$/i)

      const principal = await adapter.getOperatorPrincipal()
      expect(principal.windowsPrincipal).toBeDefined()
      expect(principal.windowsPrincipal.length).toBeGreaterThan(0)
    })

    it("NativeDockerResourceAdapter returns non-existent for non-existent container", async () => {
      const adapter = new NativeDockerResourceAdapter(process.cwd())
      const info = await adapter.inspectContainer("non_existent_container_123456")
      expect(info.exists).toBe(false)
      expect(info.isRunning).toBe(false)
      expect(info.volumeNames).toEqual([])
    })

    it("NativeFileAtomicNonceAdapter guarantees exclusive claim-if-absent and rejects replay", async () => {
      const os = await import("node:os")
      const path = await import("node:path")
      const fs = await import("node:fs/promises")
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "da-nonce-test-"))

      try {
        const adapter = new NativeFileAtomicNonceAdapter(tmpDir)
        const entry = {
          nonce: "test_nonce_exclusive_abc_1",
          runId: "run_test_01",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        }

        // First claim succeeds
        const first = await adapter.claimIfAbsent(entry)
        expect(first).toBe(true)

        // Second duplicate claim fails
        const second = await adapter.claimIfAbsent(entry)
        expect(second).toBe(false)
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      }
    })
  })
})
