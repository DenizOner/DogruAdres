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
  readonly humanOperatorId: string
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
  readonly operatorId: string
  readonly windowsPrincipal: string
  readonly approvalReference: string
  readonly publicKeyPem: string
  readonly keyFingerprint: string
  readonly validFrom: string
  readonly validUntil: string
}

export interface TrustedRegistryData {
  readonly registrySchemaVersion: "1.0.0"
  readonly trustDomain: string
  readonly operators: TrustedOperatorEntry[]
}

export interface TrustedOperatorRegistry {
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
  expectedTrustDomain: string = "dogruadres-m0-mfa"
): TrustedOperatorRegistry {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("REFUSED: Trusted registry data must be a non-null object")
  }
  const reg = data as Record<string, unknown>
  if (reg.registrySchemaVersion !== "1.0.0") {
    throw new Error(`REFUSED: Unsupported registry schema version: ${reg.registrySchemaVersion}`)
  }
  if (reg.trustDomain !== expectedTrustDomain) {
    throw new Error(`REFUSED: Trust domain mismatch: expected "${expectedTrustDomain}", got "${reg.trustDomain}"`)
  }
  if (!Array.isArray(reg.operators) || reg.operators.length === 0) {
    throw new Error("REFUSED: Trusted registry contains no approved operator entries")
  }

  const operatorMap = new Map<string, TrustedOperatorEntry>()
  const fingerprintMap = new Map<string, TrustedOperatorEntry>()

  for (const op of reg.operators) {
    if (
      !op ||
      typeof op !== "object" ||
      !op.operatorId ||
      !op.windowsPrincipal ||
      !op.approvalReference ||
      !op.publicKeyPem ||
      !op.keyFingerprint
    ) {
      throw new Error("REFUSED: Malformed operator entry in trusted registry")
    }

    const calculatedFp = computePublicKeyFingerprint(op.publicKeyPem)
    if (calculatedFp.toLowerCase() !== op.keyFingerprint.toLowerCase()) {
      throw new Error(`REFUSED: Key fingerprint mismatch for operator "${op.operatorId}"`)
    }

    operatorMap.set(op.operatorId, op)
    fingerprintMap.set(op.keyFingerprint.toLowerCase(), op)
  }

  return {
    isFingerprintTrusted(fingerprint: string): boolean {
      return fingerprintMap.has(fingerprint.toLowerCase())
    },
    isOperatorApproved(operator: OperatorIdentity): boolean {
      const entry = operatorMap.get(operator.humanOperatorId)
      if (!entry) return false
      return (
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

  if (!trustedRegistry.isFingerprintTrusted(signerKeyFingerprint)) {
    throw new Error(`REFUSED: Signer key fingerprint "${signerKeyFingerprint}" is not in the trusted operator registry`)
  }

  if (!trustedRegistry.isOperatorApproved(manifest.authorizedOperator)) {
    throw new Error(
      `REFUSED: Operator identity or approval reference is not approved in trusted registry: ${manifest.authorizedOperator.humanOperatorId} (${manifest.authorizedOperator.approvalReference})`
    )
  }

  const publicKeyPem = trustedRegistry.getPublicKeyPem(signerKeyFingerprint)
  if (!publicKeyPem) {
    throw new Error(`REFUSED: Public key for fingerprint "${signerKeyFingerprint}" could not be retrieved`)
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

export interface SignedPreIntent {
  readonly recordVersion: "1.0.0"
  readonly ceremonyId: string
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
  readonly transactionHash?: string
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
  const manifestDigest = computeSha256Digest(canonicalJsonStringify(manifest))
  const unsigned = {
    recordVersion: "1.0.0" as const,
    ceremonyId,
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
  privateKeyPem: string,
  transactionHash: string,
  verifiedAt: string = new Date().toISOString()
): SignedPostCommitOutcome {
  const preIntentDigest = computeSha256Digest(canonicalJsonStringify(preIntent))
  const unsigned = {
    recordVersion: "1.0.0" as const,
    ceremonyId,
    preIntentDigestSha256: preIntentDigest,
    transactionHash,
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
  publicKeyPem: string
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

  const { signatureBase64: outSig, ...outBody } = outcome
  return verify(null, Buffer.from(canonicalJsonStringify(outBody), "utf8"), publicKeyPem, Buffer.from(outSig, "base64"))
}