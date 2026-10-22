import { createHash, verify, sign } from "node:crypto"

/**
 * Strict canonical JSON serialization according to RFC 8785 (JSON Canonicalization Scheme - JCS)
 * and RFC 7493 (I-JSON).
 *
 * Rejection contract (Fail-Closed):
 * - Reject NaN, Infinity, -Infinity.
 * - Reject sparse arrays, circular references, lone surrogate code points (malformed UTF-16).
 * - Reject unsupported types (undefined, symbols, functions, BigInt) anywhere in the input structure.
 * - Normalize -0 to 0.
 * - Sort object keys lexicographically by UTF-16 code units.
 */
export function canonicalJsonStringify(val: unknown, seen: Set<object> = new Set()): string {
  if (val === null) return "null"
  if (typeof val === "boolean") return val ? "true" : "false"
  if (typeof val === "number") {
    if (!Number.isFinite(val)) {
      throw new Error("RFC 8785: NaN and Infinity are forbidden in canonical JSON")
    }
    if (Object.is(val, -0)) return "0"
    return String(val)
  }
  if (typeof val === "string") {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(val)) {
      throw new Error("RFC 8785: Lone surrogate code point detected in string (invalid Unicode)")
    }
    return JSON.stringify(val)
  }
  if (typeof val === "bigint" || typeof val === "symbol" || typeof val === "function" || val === undefined) {
    throw new Error(`RFC 8785: Unsupported value type for canonical serialization: ${typeof val}`)
  }
  if (Array.isArray(val)) {
    if (seen.has(val)) {
      throw new Error("RFC 8785: Circular reference detected in array")
    }
    seen.add(val)
    // Sparse array check
    for (let i = 0; i < val.length; i++) {
      if (!(i in val) || val[i] === undefined) {
        throw new Error("RFC 8785: Sparse arrays or undefined elements are forbidden in canonical JSON")
      }
    }
    const elements = val.map((item) => canonicalJsonStringify(item, seen))
    seen.delete(val)
    return "[" + elements.join(",") + "]"
  }
  if (typeof val === "object") {
    if (seen.has(val)) {
      throw new Error("RFC 8785: Circular reference detected in object")
    }
    seen.add(val)
    if (val instanceof Date) {
      seen.delete(val)
      return JSON.stringify(val.toISOString())
    }
    // Reject non-plain objects (e.g. RegExp, Map, Set, custom classes without plain dictionary structure)
    const proto = Object.getPrototypeOf(val)
    if (proto !== null && proto !== Object.prototype) {
      throw new Error("RFC 8785: Unsupported complex object type for canonical serialization")
    }

    const record = val as Record<string, unknown>
    const keys = Object.keys(record).sort((a, b) => {
      const len = Math.min(a.length, b.length)
      for (let i = 0; i < len; i++) {
        const codeA = a.charCodeAt(i)
        const codeB = b.charCodeAt(i)
        if (codeA !== codeB) return codeA - codeB
      }
      return a.length - b.length
    })

    const entries: string[] = []
    for (const key of keys) {
      const v = record[key]
      if (v === undefined || typeof v === "symbol" || typeof v === "function") {
        throw new Error(`RFC 8785: Undefined, symbol or function value found at key "${key}"`)
      }
      entries.push(canonicalJsonStringify(key, seen) + ":" + canonicalJsonStringify(v, seen))
    }
    seen.delete(val)
    return "{" + entries.join(",") + "}"
  }
  throw new Error(`RFC 8785: Unsupported type for canonical serialization: ${typeof val}`)
}

export function computeSha256Digest(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex")
}

export function computePublicKeyFingerprint(publicKeyPem: string): string {
  const cleanPem = publicKeyPem.trim().replace(/\r\n/g, "\n")
  return computeSha256Digest(cleanPem)
}

export interface OperatorIdentity {
  readonly executorType: "automation_agent"
  readonly operatorId: string
  readonly windowsSecurityPrincipal: string // SID or Domain\Username
  readonly approvalReference: string // e.g. GitHub Issue approval URL
}

export interface TaskResourceManifest {
  readonly manifestVersion: string
  readonly runId: string
  readonly nonce: string
  readonly taskEnvironmentId: string
  readonly targetDatabase: string
  readonly targetHost: string
  readonly targetPort: string
  readonly targetContainerName: string
  readonly targetVolumeName: string
  readonly authorizedOperator: OperatorIdentity
  readonly targetCommitSha: string
  readonly issuedAt: string
  readonly expiresAt: string
}

export interface SignedTaskManifest {
  readonly manifest: TaskResourceManifest
  readonly signerKeyFingerprint: string
  readonly signatureBase64: string
}

// ---------------------------------------------------------------------------
// Versioned Plain-Data Registry Schema & Factory
// ---------------------------------------------------------------------------

export interface TrustedOperatorEntry {
  readonly executorType: "automation_agent"
  readonly operatorId: string
  readonly windowsPrincipal: string
  readonly approvalReference: string
  readonly publicKeyPem: string
  readonly keyFingerprint: string
  readonly validFrom: string
  readonly validUntil: string
}

export interface TrustedRegistryData {
  readonly registrySchemaVersion: "1.1.0"
  readonly trustDomain: string
  readonly operators: TrustedOperatorEntry[]
}

/**
 * Scope-specific approval supplied by an independently authorized controller.
 * This object must never be derived from the candidate registry, manifest,
 * operator-controlled environment variables or an unverified local file.
 */
export interface PinnedOperatorApproval {
  readonly trustDomain: "dogruadres-m0-mfa"
  readonly executorType: "automation_agent"
  readonly operatorId: string
  readonly runId: string
  readonly windowsPrincipal: string
  readonly approvalReference: string
  readonly keyFingerprint: string
  readonly taskEnvironmentId: string
  readonly targetDatabase: string
  readonly targetCommitSha: string
  readonly validFrom: string
  readonly validUntil: string
}

export interface TrustedOperatorRegistry {
  getApprovedSignerPublicKey(
    signerKeyFingerprint: string,
    manifest: TaskResourceManifest
  ): string | null
  isFingerprintTrusted(fingerprint: string): boolean
  isOperatorApproved(operator: OperatorIdentity): boolean
  getPublicKeyPem(fingerprint: string): string | null
}

/**
 * Validates raw parsed JSON and constructs a callable TrustedOperatorRegistry.
 * Rejects corrupt, missing, substituted, or unapproved registry data.
 */
export function createTrustedOperatorRegistry(
  data: unknown,
  independentlyPinned: PinnedOperatorApproval | null,
  nowIso: string = new Date().toISOString()
): TrustedOperatorRegistry {
  if (!independentlyPinned) {
    throw new Error("REFUSED: No independently pinned operator authorization is available")
  }
  if (independentlyPinned.trustDomain !== "dogruadres-m0-mfa" ||
      independentlyPinned.executorType !== "automation_agent" || !independentlyPinned.runId) {
    throw new Error("REFUSED: Pinned approval trust domain is invalid")
  }
  const now = Date.parse(nowIso)
  const validFrom = Date.parse(independentlyPinned.validFrom)
  const validUntil = Date.parse(independentlyPinned.validUntil)
  if (!Number.isFinite(now) || !Number.isFinite(validFrom) || !Number.isFinite(validUntil) ||
      validFrom >= validUntil || now < validFrom || now > validUntil) {
    throw new Error("REFUSED: Independently pinned operator authorization is invalid or expired")
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("REFUSED: Trusted registry data must be a non-null object")
  }
  const reg = data as Record<string, unknown>
  if (reg.registrySchemaVersion !== "1.1.0") {
    throw new Error(`REFUSED: Unsupported registry schema version: ${reg.registrySchemaVersion}`)
  }
  if (reg.trustDomain !== independentlyPinned.trustDomain) {
    throw new Error("REFUSED: Trust domain mismatch with independent approval")
  }
  if (!Array.isArray(reg.operators) || reg.operators.length !== 1) {
    throw new Error("REFUSED: Exactly one independently approved operator entry is required")
  }

  const operatorMap = new Map<string, TrustedOperatorEntry>()
  const fingerprintMap = new Map<string, TrustedOperatorEntry>()

  for (const op of reg.operators) {
    if (
      !op ||
      typeof op !== "object" ||
      op.executorType !== "automation_agent" ||
      !op.operatorId ||
      !op.windowsPrincipal ||
      !op.approvalReference ||
      !op.publicKeyPem ||
      !op.keyFingerprint ||
      typeof op.operatorId !== "string" ||
      typeof op.windowsPrincipal !== "string" ||
      typeof op.approvalReference !== "string" ||
      typeof op.publicKeyPem !== "string" ||
      typeof op.keyFingerprint !== "string" ||
      typeof op.validFrom !== "string" ||
      typeof op.validUntil !== "string"
    ) {
      throw new Error("REFUSED: Malformed operator entry in trusted registry")
    }

    const calculatedFp = computePublicKeyFingerprint(op.publicKeyPem)
    if (calculatedFp.toLowerCase() !== op.keyFingerprint.toLowerCase()) {
      throw new Error(`REFUSED: Key fingerprint mismatch for operator "${op.operatorId}"`)
    }

    const entryFrom = Date.parse(op.validFrom)
    const entryUntil = Date.parse(op.validUntil)
    if (!Number.isFinite(entryFrom) || !Number.isFinite(entryUntil) || entryFrom >= entryUntil ||
        now < entryFrom || now > entryUntil) {
      throw new Error("REFUSED: Operator entry has invalid or expired validity interval")
    }
    if (
      op.executorType !== independentlyPinned.executorType ||
      op.operatorId !== independentlyPinned.operatorId ||
      op.windowsPrincipal.toLowerCase() !== independentlyPinned.windowsPrincipal.toLowerCase() ||
      op.approvalReference !== independentlyPinned.approvalReference ||
      op.keyFingerprint.toLowerCase() !== independentlyPinned.keyFingerprint.toLowerCase() ||
      op.validFrom !== independentlyPinned.validFrom ||
      op.validUntil !== independentlyPinned.validUntil
    ) {
      throw new Error("REFUSED: Operator registry is not bound to the independent approval")
    }
    operatorMap.set(op.operatorId, op)
    fingerprintMap.set(op.keyFingerprint.toLowerCase(), op)
  }

  return {
    getApprovedSignerPublicKey(signerKeyFingerprint: string, manifest: TaskResourceManifest): string | null {
      const approvedOperator = manifest.authorizedOperator
      if (
        signerKeyFingerprint.toLowerCase() !== independentlyPinned.keyFingerprint.toLowerCase() ||
        approvedOperator.executorType !== independentlyPinned.executorType ||
        approvedOperator.operatorId !== independentlyPinned.operatorId ||
        manifest.runId !== independentlyPinned.runId ||
        approvedOperator.windowsSecurityPrincipal.toLowerCase() !== independentlyPinned.windowsPrincipal.toLowerCase() ||
        approvedOperator.approvalReference !== independentlyPinned.approvalReference ||
        manifest.taskEnvironmentId !== independentlyPinned.taskEnvironmentId ||
        manifest.targetDatabase !== independentlyPinned.targetDatabase ||
        manifest.targetCommitSha.toLowerCase() !== independentlyPinned.targetCommitSha.toLowerCase()
      ) {
        return null
      }
      return fingerprintMap.get(signerKeyFingerprint.toLowerCase())?.publicKeyPem ?? null
    },
    isFingerprintTrusted(fingerprint: string): boolean {
      return fingerprintMap.has(fingerprint.toLowerCase())
    },
    isOperatorApproved(operator: OperatorIdentity): boolean {
      if (operator.executorType !== "automation_agent") return false
      const entry = operatorMap.get(operator.operatorId)
      if (!entry) return false
      return (
        entry.executorType === operator.executorType &&
        entry.windowsPrincipal.toLowerCase() === operator.windowsSecurityPrincipal.toLowerCase() &&
        entry.approvalReference === operator.approvalReference
      )
    },
    getPublicKeyPem(fingerprint: string): string | null {
      const entry = fingerprintMap.get(fingerprint.toLowerCase())
      return entry ? entry.publicKeyPem : null
    },
  }
}

export interface RuntimeResourceAdapter {
  inspectContainer(containerName: string): Promise<{ exists: boolean; isRunning: boolean; volumeNames: string[] }>
  inspectDatabase(connectionString: string): Promise<{ dbName: string; isExclusive: boolean }>
  getCurrentGitSha(): Promise<string>
  getOperatorPrincipal(): Promise<{ windowsPrincipal: string }>
}

/**
 * Atomic anti-replay contract.
 */
export interface AtomicNonceStore {
  claimOnce(nonce: string, runId: string, expiresAt: string): Promise<boolean>
}

/**
 * Verifies Ed25519 signature and pinned operator public-key fingerprint and authorization scope.
 */
export function verifySignedManifest(
  signedManifest: SignedTaskManifest,
  trustedRegistry: TrustedOperatorRegistry
): void {
  const { manifest, signerKeyFingerprint, signatureBase64 } = signedManifest
  if (manifest?.authorizedOperator?.executorType !== "automation_agent" ||
      manifest?.manifestVersion !== "1.1.0") {
    throw new Error("REFUSED: Expected explicit non-human executor and current manifest version")
  }

  // Signature key and asserted operator must belong to ONE independently
  // approved entry, including the exact authorized task and commit scope.
  const publicKeyPem = trustedRegistry.getApprovedSignerPublicKey(signerKeyFingerprint, manifest)
  if (!publicKeyPem) {
    throw new Error("REFUSED: Signer key and operator do not match independently pinned authorization scope")
  }

  const calculatedFingerprint = computePublicKeyFingerprint(publicKeyPem)
  if (calculatedFingerprint.toLowerCase() !== signerKeyFingerprint.toLowerCase()) {
    throw new Error("REFUSED: Public key does not match claimed fingerprint")
  }

  let canonicalPayload: Buffer
  try {
    canonicalPayload = Buffer.from(canonicalJsonStringify(manifest), "utf8")
  } catch (err: unknown) {
    throw new Error(`REFUSED: Manifest failed canonical serialization: ${String(err)}`)
  }

  const signatureBuffer = Buffer.from(signatureBase64, "base64")
  const isValid = verify(null, canonicalPayload, publicKeyPem, signatureBuffer)
  if (!isValid) {
    throw new Error("REFUSED: Ed25519 signature verification failed for task manifest")
  }
}

/**
 * Verifies runtime target alignment and enforces atomic anti-replay.
 */
export async function verifyRuntimeEnvironmentOwnership(
  manifest: TaskResourceManifest,
  adapter: RuntimeResourceAdapter,
  nonceStore: AtomicNonceStore,
  connectionString: string,
  nowIso: string = new Date().toISOString()
): Promise<void> {
  const now = new Date(nowIso).getTime()
  const issued = new Date(manifest.issuedAt).getTime()
  const expires = new Date(manifest.expiresAt).getTime()

  if (isNaN(issued) || isNaN(expires) || now < issued || now > expires) {
    throw new Error(`REFUSED: Manifest is expired or not yet valid (now: ${nowIso}, valid: ${manifest.issuedAt} to ${manifest.expiresAt})`)
  }

  const claimed = await nonceStore.claimOnce(manifest.nonce, manifest.runId, manifest.expiresAt)
  if (!claimed) {
    throw new Error(`REFUSED: Nonce "${manifest.nonce}" has already been consumed or claim conflicted (anti-replay violation)`)
  }

  const actualSha = await adapter.getCurrentGitSha()
  if (actualSha.toLowerCase() !== manifest.targetCommitSha.toLowerCase()) {
    throw new Error(`REFUSED: Git commit mismatch (actual: ${actualSha}, manifest: ${manifest.targetCommitSha})`)
  }

  const principal = await adapter.getOperatorPrincipal()
  if (
    principal.windowsPrincipal.toLowerCase() !==
    manifest.authorizedOperator.windowsSecurityPrincipal.toLowerCase()
  ) {
    throw new Error(
      `REFUSED: Operator principal mismatch (actual: ${principal.windowsPrincipal}, manifest: ${manifest.authorizedOperator.windowsSecurityPrincipal})`
    )
  }

  const containerInfo = await adapter.inspectContainer(manifest.targetContainerName)
  if (!containerInfo.exists || !containerInfo.isRunning) {
    throw new Error(`REFUSED: Target container "${manifest.targetContainerName}" does not exist or is not running`)
  }

  if (!containerInfo.volumeNames.includes(manifest.targetVolumeName)) {
    throw new Error(
      `REFUSED: Container "${manifest.targetContainerName}" does not mount authorized volume "${manifest.targetVolumeName}"`
    )
  }

  const dbInfo = await adapter.inspectDatabase(connectionString)
  if (dbInfo.dbName.toLowerCase() !== manifest.targetDatabase.toLowerCase()) {
    throw new Error(`REFUSED: Database identity mismatch (actual: ${dbInfo.dbName}, manifest: ${manifest.targetDatabase})`)
  }
  if (!dbInfo.isExclusive) {
    throw new Error(`REFUSED: Target database "${dbInfo.dbName}" has active concurrent client sessions`)
  }
}

// ---------------------------------------------------------------------------
// Audit Trail Protocol (Pre-transaction Intent -> Post-commit / Indeterminate)
// ---------------------------------------------------------------------------

export interface CommittedEntityDigest {
  readonly entityType: "user" | "person" | "actor_mapping" | "login_binding"
  readonly entityId: string
  readonly digestSha256: string
}

export interface ReadbackProvenance {
  readonly verifierIdentity: "independent_database_readback_adapter"
  readonly readbackTimestamp: string
  readonly querySnapshotSha256: string
}

export interface CommittedStateEvidence {
  readonly ceremonyId: string
  readonly targetDatabase: string
  readonly transactionHash: string
  readonly mfaLatchValue: "ARMED"
  readonly provenance: ReadbackProvenance
  readonly committedEntities: CommittedEntityDigest[]
  readonly committedAt: string
  readonly stateDigestSha256: string
}

export interface DatabaseReadbackAdapter {
  queryCommittedState(
    targetDatabase: string,
    transactionHash: string,
    ceremonyId: string
  ): Promise<CommittedStateEvidence>
}

export function computeCommittedStateDigest(
  entities: CommittedEntityDigest[],
  targetDatabase: string,
  mfaLatchValue: "ARMED",
  provenance: ReadbackProvenance
): string {
  const sorted = [...entities].sort((a, b) => {
    const typeCmp = a.entityType.localeCompare(b.entityType)
    return typeCmp !== 0 ? typeCmp : a.entityId.localeCompare(b.entityId)
  })
  const statePayload = {
    targetDatabase,
    mfaLatchValue,
    provenance,
    entities: sorted,
  }
  return computeSha256Digest(canonicalJsonStringify(statePayload))
}

export function createVerifiedCommittedStateEvidence(
  ceremonyId: string,
  targetDatabase: string,
  transactionHash: string,
  mfaLatchValue: "ARMED",
  provenance: ReadbackProvenance,
  committedEntities: CommittedEntityDigest[],
  committedAt: string = new Date().toISOString()
): CommittedStateEvidence {
  if (!transactionHash || typeof transactionHash !== "string" || transactionHash.trim() === "") {
    throw new Error("REFUSED: Invalid or missing transaction hash for committed state evidence")
  }
  if (mfaLatchValue !== "ARMED") {
    throw new Error(`REFUSED: Invalid MFA latch value for committed state evidence: expected "ARMED", got "${mfaLatchValue}"`)
  }
  if (!provenance || provenance.verifierIdentity !== "independent_database_readback_adapter" || !provenance.querySnapshotSha256) {
    throw new Error("REFUSED: Invalid or unverified readback provenance")
  }
  if (!Array.isArray(committedEntities) || committedEntities.length === 0) {
    throw new Error("REFUSED: Committed entities list cannot be empty")
  }
  const stateDigestSha256 = computeCommittedStateDigest(committedEntities, targetDatabase, mfaLatchValue, provenance)
  return {
    ceremonyId,
    targetDatabase,
    transactionHash,
    mfaLatchValue,
    provenance,
    committedEntities,
    committedAt,
    stateDigestSha256,
  }
}

export async function verifyCommittedStateViaAdapter(
  readbackAdapter: DatabaseReadbackAdapter | null,
  targetDatabase: string,
  transactionHash: string,
  ceremonyId: string
): Promise<CommittedStateEvidence> {
  if (!readbackAdapter) {
    throw new Error("BLOCKED: No trusted independent database readback adapter is commissioned")
  }
  const evidence = await readbackAdapter.queryCommittedState(targetDatabase, transactionHash, ceremonyId)
  if (
    !evidence ||
    evidence.ceremonyId !== ceremonyId ||
    evidence.targetDatabase !== targetDatabase ||
    evidence.transactionHash !== transactionHash ||
    evidence.mfaLatchValue !== "ARMED" ||
    evidence.provenance?.verifierIdentity !== "independent_database_readback_adapter"
  ) {
    throw new Error("REFUSED: Database readback evidence failed integrity or provenance verification")
  }
  const expectedDigest = computeCommittedStateDigest(
    evidence.committedEntities,
    evidence.targetDatabase,
    evidence.mfaLatchValue,
    evidence.provenance
  )
  if (evidence.stateDigestSha256 !== expectedDigest) {
    throw new Error("REFUSED: Database readback state digest mismatch")
  }
  return evidence
}

export interface SignedPreIntent {
  readonly recordVersion: "1.0.0"
  readonly ceremonyId: string
  readonly executorType: "automation_agent"
  readonly runId: string
  readonly manifestDigestSha256: string
  readonly operatorId: string
  readonly proposedAction: "ACTIVATE_MFA_DEPLOYMENT_LATCH"
  readonly plannedTimestamp: string
  readonly signatureBase64: string
}

export interface SignedPostCommitOutcome {
  readonly recordVersion: "1.0.0"
  readonly ceremonyId: string
  readonly preIntentDigestSha256: string
  readonly transactionHash: string
  readonly stateDigestSha256: string
  readonly committedEntitiesCount: number
  readonly status: "ARMED"
  readonly verifiedAt: string
  readonly signatureBase64: string
}

export interface IndeterminateFailureRecord {
  readonly recordVersion: "1.0.0"
  readonly ceremonyId: string
  readonly preIntentDigestSha256: string
  readonly status: "INDETERMINATE"
  readonly reason: string
  readonly failedAt: string
  readonly signatureBase64: string
}

export function createSignedPreIntent(
  ceremonyId: string,
  manifest: TaskResourceManifest,
  operatorId: string,
  privateKeyPem: string,
  timestamp: string = new Date().toISOString()
): SignedPreIntent {
  if (manifest.authorizedOperator.executorType !== "automation_agent" ||
      operatorId !== manifest.authorizedOperator.operatorId) {
    throw new Error("REFUSED: Intent signer is not the delegated Local Agent executor")
  }
  const manifestDigest = computeSha256Digest(canonicalJsonStringify(manifest))
  const unsigned = {
    recordVersion: "1.0.0" as const,
    ceremonyId,
    executorType: "automation_agent" as const,
    runId: manifest.runId,
    manifestDigestSha256: manifestDigest,
    operatorId,
    proposedAction: "ACTIVATE_MFA_DEPLOYMENT_LATCH" as const,
    plannedTimestamp: timestamp,
  }
  const payload = Buffer.from(canonicalJsonStringify(unsigned), "utf8")
  const signatureBase64 = sign(null, payload, privateKeyPem).toString("base64")
  return { ...unsigned, signatureBase64 }
}

export function createSignedPostCommitOutcome(
  ceremonyId: string,
  preIntent: SignedPreIntent,
  evidence: CommittedStateEvidence,
  privateKeyPem: string,
  verifiedAt: string = new Date().toISOString()
): SignedPostCommitOutcome {
  if (!evidence || typeof evidence !== "object" || !evidence.transactionHash) {
    throw new Error("REFUSED: createSignedPostCommitOutcome requires verified CommittedStateEvidence")
  }
  if (evidence.ceremonyId !== ceremonyId || evidence.ceremonyId !== preIntent.ceremonyId) {
    throw new Error("REFUSED: Committed state evidence ceremonyId mismatch with preIntent")
  }
  if (evidence.mfaLatchValue !== "ARMED") {
    throw new Error(`REFUSED: Committed state evidence MFA latch is not ARMED: "${evidence.mfaLatchValue}"`)
  }
  if (evidence.provenance?.verifierIdentity !== "independent_database_readback_adapter") {
    throw new Error("REFUSED: Committed state evidence lacks independent readback provenance")
  }
  const expectedDigest = computeCommittedStateDigest(
    evidence.committedEntities,
    evidence.targetDatabase,
    evidence.mfaLatchValue,
    evidence.provenance
  )
  if (evidence.stateDigestSha256 !== expectedDigest) {
    throw new Error("REFUSED: Committed state evidence digest verification failed")
  }

  const preIntentDigest = computeSha256Digest(canonicalJsonStringify(preIntent))
  const unsigned = {
    recordVersion: "1.0.0" as const,
    ceremonyId,
    preIntentDigestSha256: preIntentDigest,
    transactionHash: evidence.transactionHash,
    stateDigestSha256: evidence.stateDigestSha256,
    committedEntitiesCount: evidence.committedEntities.length,
    status: "ARMED" as const,
    verifiedAt,
  }
  const payload = Buffer.from(canonicalJsonStringify(unsigned), "utf8")
  const signatureBase64 = sign(null, payload, privateKeyPem).toString("base64")
  return { ...unsigned, signatureBase64 }
}

export function createIndeterminateFailureRecord(
  ceremonyId: string,
  preIntent: SignedPreIntent,
  privateKeyPem: string,
  reason: string,
  failedAt: string = new Date().toISOString()
): IndeterminateFailureRecord {
  const preIntentDigest = computeSha256Digest(canonicalJsonStringify(preIntent))
  const unsigned = {
    recordVersion: "1.0.0" as const,
    ceremonyId,
    preIntentDigestSha256: preIntentDigest,
    status: "INDETERMINATE" as const,
    reason,
    failedAt,
  }
  const payload = Buffer.from(canonicalJsonStringify(unsigned), "utf8")
  const signatureBase64 = sign(null, payload, privateKeyPem).toString("base64")
  return { ...unsigned, signatureBase64 }
}

export function verifyCeremonyAuditChain(
  preIntent: SignedPreIntent,
  outcome: SignedPostCommitOutcome | IndeterminateFailureRecord,
  publicKeyPem: string,
  committedStateEvidence?: CommittedStateEvidence
): boolean {
  const { signatureBase64: preSig, ...preBody } = preIntent
  const isPreValid = verify(null, Buffer.from(canonicalJsonStringify(preBody), "utf8"), publicKeyPem, Buffer.from(preSig, "base64"))
  if (!isPreValid) return false

  if (preIntent.ceremonyId !== outcome.ceremonyId) return false

  const preTime = new Date(preIntent.plannedTimestamp).getTime()
  const outTime = new Date("verifiedAt" in outcome ? outcome.verifiedAt : outcome.failedAt).getTime()
  if (isNaN(preTime) || isNaN(outTime) || outTime < preTime) return false

  const expectedDigest = computeSha256Digest(canonicalJsonStringify(preIntent))
  if (outcome.preIntentDigestSha256 !== expectedDigest) return false

  if (outcome.status === "ARMED") {
    if (
      !outcome.stateDigestSha256 ||
      !outcome.transactionHash ||
      typeof outcome.committedEntitiesCount !== "number" ||
      outcome.committedEntitiesCount <= 0
    ) {
      return false
    }
    if (!committedStateEvidence) {
      return false
    }
    if (
      committedStateEvidence.ceremonyId !== outcome.ceremonyId ||
      committedStateEvidence.transactionHash !== outcome.transactionHash ||
      committedStateEvidence.stateDigestSha256 !== outcome.stateDigestSha256 ||
      committedStateEvidence.committedEntities.length !== outcome.committedEntitiesCount ||
      committedStateEvidence.mfaLatchValue !== "ARMED" ||
      committedStateEvidence.provenance?.verifierIdentity !== "independent_database_readback_adapter"
    ) {
      return false
    }
    const expectedDigest = computeCommittedStateDigest(
      committedStateEvidence.committedEntities,
      committedStateEvidence.targetDatabase,
      committedStateEvidence.mfaLatchValue,
      committedStateEvidence.provenance
    )
    if (committedStateEvidence.stateDigestSha256 !== expectedDigest) {
      return false
    }
  }

  const { signatureBase64: outSig, ...outBody } = outcome
  return verify(null, Buffer.from(canonicalJsonStringify(outBody), "utf8"), publicKeyPem, Buffer.from(outSig, "base64"))
}

// ---------------------------------------------------------------------------
// Windows Effective Access Security
// ---------------------------------------------------------------------------

export interface AccessControlEntry {
  readonly principal: string
  readonly rights: string[]
  readonly accessType: "Allow" | "Deny"
  readonly isInherited: boolean
}

export interface PathSecurityInspection {
  readonly path: string
  readonly owner: string
  readonly isReparsePoint: boolean
  readonly entries: AccessControlEntry[]
}

export interface SecurityEnvironmentAdapter {
  inspectPathSecurity(targetPath: string): Promise<PathSecurityInspection>
}

export function verifyPathEffectiveSecurity(
  inspection: PathSecurityInspection,
  authorizedPrincipal: string,
  allowedSystemPrincipals: string[] = ["nt authority\\system", "builtin\\administrators"]
): void {
  if (inspection.isReparsePoint) {
    throw new Error(`REFUSED: Path "${inspection.path}" is a reparse point (symlink/junction)`)
  }

  if (inspection.owner.toLowerCase() !== authorizedPrincipal.toLowerCase()) {
    throw new Error(
      `REFUSED: Path "${inspection.path}" owner mismatch: expected "${authorizedPrincipal}", got "${inspection.owner}"`
    )
  }

  const allowedSet = new Set([
    authorizedPrincipal.toLowerCase(),
    ...allowedSystemPrincipals.map((p) => p.toLowerCase()),
  ])

  for (const entry of inspection.entries) {
    if (entry.accessType === "Allow") {
      const p = entry.principal.toLowerCase()
      if (!allowedSet.has(p)) {
        throw new Error(
          `REFUSED: Unexpected readable/authorized principal "${entry.principal}" detected on protected path "${inspection.path}"`
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Task-Private Durable Checkpoints & Sensitive Error Redaction
// ---------------------------------------------------------------------------

export function redactSensitiveData(text: string): string {
  return text
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, "$1[REDACTED_PASSWORD]$2")
    .replace(/(password["':\s]+)[^\s,"'}]+/gi, '$1"[REDACTED]"')
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/gi, "$1[REDACTED_TOKEN]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
}

export interface CheckpointPrincipal {
  readonly label: "A" | "B"
  readonly userId?: string
  readonly authIdentityId?: string
  readonly personId?: string
  readonly bindingCreated: boolean
}

export interface PartialRecoveryCheckpoint {
  readonly checkpointVersion: string
  readonly startedAt: string
  readonly targetDatabase: string
  status: "in_progress" | "failed" | "completed"
  completedSteps: string[]
  error?: string
  principals: CheckpointPrincipal[]
}

export interface CheckpointStorageAdapter {
  exists(filepath: string): Promise<boolean>
  read(filepath: string): Promise<string>
  atomicWrite(filepath: string, content: string): Promise<void>
}

/**
 * Real durable filesystem checkpoint adapter:
 * - Uses exclusive flag 'wx' with restricted mode 0o600 on temp file.
 * - Flushes file to disk with fsync (fileHandle.sync()) before rename.
 * - Atomically renames over destination.
 */
export class FilesystemDurableCheckpointAdapter implements CheckpointStorageAdapter {
  async exists(filepath: string): Promise<boolean> {
    try {
      const { access } = await import("node:fs/promises")
      await access(filepath)
      return true
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false
      throw err
    }
  }

  async read(filepath: string): Promise<string> {
    const { readFile } = await import("node:fs/promises")
    return readFile(filepath, "utf8")
  }

  async atomicWrite(filepath: string, content: string): Promise<void> {
    const path = await import("node:path")
    const { open, rename, unlink } = await import("node:fs/promises")
    const dir = path.dirname(filepath)
    const tmpFile = path.join(dir, `${path.basename(filepath)}.tmp.${process.pid}.${Date.now()}`)
    const handle = await open(tmpFile, "wx", 0o600)
    try {
      await handle.writeFile(content, "utf8")
      await handle.sync()
    } catch (err) {
      try {
        await unlink(tmpFile)
      } catch {
        // ignore cleanup error
      }
      throw err
    } finally {
      await handle.close()
    }
    await rename(tmpFile, filepath)
  }
}

export class DurableCheckpointManager {
  constructor(private adapter: CheckpointStorageAdapter) {}

  async initializeCheckpoint(
    checkpointFile: string,
    targetDatabase: string
  ): Promise<PartialRecoveryCheckpoint> {
    const exists = await this.adapter.exists(checkpointFile)
    if (exists) {
      const raw = await this.adapter.read(checkpointFile)
      let prev: PartialRecoveryCheckpoint
      try {
        prev = JSON.parse(raw) as PartialRecoveryCheckpoint
      } catch {
        throw new Error(`REFUSED: Corrupted checkpoint exists at ${checkpointFile}. Manual forensic review required`)
      }
      throw new Error(`REFUSED: Checkpoint already exists with status "${prev.status}". Unsafe retry prevented`)
    }

    const state: PartialRecoveryCheckpoint = {
      checkpointVersion: "1.0.0",
      startedAt: new Date().toISOString(),
      targetDatabase,
      status: "in_progress",
      completedSteps: [],
      principals: [],
    }
    await this.adapter.atomicWrite(checkpointFile, JSON.stringify(state, null, 2))
    return state
  }

  async recordStep(
    checkpointFile: string,
    state: PartialRecoveryCheckpoint,
    step: string,
    principal?: CheckpointPrincipal
  ): Promise<void> {
    state.completedSteps.push(step)
    if (principal) {
      state.principals.push(principal)
    }
    await this.adapter.atomicWrite(checkpointFile, JSON.stringify(state, null, 2))
  }

  async recordFailure(
    checkpointFile: string,
    state: PartialRecoveryCheckpoint,
    error: unknown
  ): Promise<void> {
    state.status = "failed"
    const rawError = error instanceof Error ? error.message : String(error)
    state.error = redactSensitiveData(rawError)
    try {
      await this.adapter.atomicWrite(checkpointFile, JSON.stringify(state, null, 2))
    } catch {
      // Best-effort
    }
  }

  async markCompleted(
    checkpointFile: string,
    state: PartialRecoveryCheckpoint
  ): Promise<void> {
    state.status = "completed"
    await this.adapter.atomicWrite(checkpointFile, JSON.stringify(state, null, 2))
  }
}

// ---------------------------------------------------------------------------
// Atomic Nonce Store with Claim-If-Absent Semantics (Race-Free)
// ---------------------------------------------------------------------------

export interface AtomicNonceStorageAdapter {
  claimIfAbsent(entry: { nonce: string; runId: string; expiresAt: string }): Promise<boolean>
}

export class DurableAtomicNonceStore implements AtomicNonceStore {
  constructor(private adapter: AtomicNonceStorageAdapter) {}

  async claimOnce(nonce: string, runId: string, expiresAt: string): Promise<boolean> {
    if (!nonce || typeof nonce !== "string" || nonce.trim() === "") {
      throw new Error("REFUSED: Invalid nonce for atomic claim")
    }
    return this.adapter.claimIfAbsent({ nonce, runId, expiresAt })
  }
}

// ---------------------------------------------------------------------------
// Fail-Closed Bootstrap Execution Controller Boundary
// ---------------------------------------------------------------------------

export interface ExecutionControllerContext {
  readonly executionGateOpen: boolean
  readonly pinnedApproval: PinnedOperatorApproval | null
  readonly registryData: unknown
  readonly signedManifest: SignedTaskManifest
  readonly resourceAdapter: RuntimeResourceAdapter
  readonly nonceStore: AtomicNonceStore
  readonly pathSecurityInspection: PathSecurityInspection
  readonly connectionString: string
  readonly nowIso?: string
}

export function verifyBootstrapExecutionPrerequisites(
  ctx: ExecutionControllerContext
): { trustedRegistry: TrustedOperatorRegistry } {
  if (!ctx.executionGateOpen) {
    throw new Error("REFUSED: BOOTSTRAP_EXECUTION_GATE_OPEN is false. Execution is prohibited")
  }

  if (!ctx.pinnedApproval) {
    throw new Error("REFUSED: INDEPENDENT_PINNED_OPERATOR_APPROVAL is null. Execution is prohibited")
  }

  const trustedRegistry = createTrustedOperatorRegistry(
    ctx.registryData,
    ctx.pinnedApproval,
    ctx.nowIso
  )

  verifySignedManifest(ctx.signedManifest, trustedRegistry)

  verifyPathEffectiveSecurity(
    ctx.pathSecurityInspection,
    ctx.pinnedApproval.windowsPrincipal
  )

  return { trustedRegistry }
}

export async function executeBootstrapController(
  ctx: ExecutionControllerContext,
  executeBootstrapEffect: () => Promise<void>
): Promise<void> {
  const { trustedRegistry } = verifyBootstrapExecutionPrerequisites(ctx)

  await verifyRuntimeEnvironmentOwnership(
    ctx.signedManifest.manifest,
    ctx.resourceAdapter,
    ctx.nonceStore,
    ctx.connectionString,
    ctx.nowIso
  )

  await executeBootstrapEffect()
}
