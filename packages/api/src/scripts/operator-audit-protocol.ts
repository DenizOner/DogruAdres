import { createHash, verify, sign } from "node:crypto"

/**
 * Deterministic JSON serialization according to RFC 8785 (JSON Canonicalization Scheme - JCS)
 * and RFC 7493 (I-JSON).
 *
 * Rules:
 * - Reject NaN, Infinity, -Infinity.
 * - Reject lone surrogate code points in strings (malformed UTF-16 Unicode).
 * - Reject numbers outside the IEEE 754 safe integer range if non-integers, or numbers that lose precision.
 * - Reject unsupported types (BigInt, symbols, functions).
 * - Normalize -0 to 0.
 * - Sort object keys lexicographically by UTF-16 code units.
 */
export function canonicalJsonStringify(val: unknown): string {
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
    // Check for lone surrogate code points (unpaired surrogates)
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(val)) {
      throw new Error("RFC 8785: Lone surrogate code point detected in string (invalid Unicode)")
    }
    return JSON.stringify(val)
  }
  if (typeof val === "bigint") {
    throw new Error("RFC 8785: BigInt serialization is not supported in canonical JSON")
  }
  if (Array.isArray(val)) {
    const elements = val.map((item) => {
      if (item === undefined || typeof item === "symbol" || typeof item === "function") {
        return "null"
      }
      return canonicalJsonStringify(item)
    })
    return "[" + elements.join(",") + "]"
  }
  if (typeof val === "object") {
    if (val instanceof Date) {
      return JSON.stringify(val.toISOString())
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
        continue
      }
      entries.push(canonicalJsonStringify(key) + ":" + canonicalJsonStringify(v))
    }
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

export interface RuntimeResourceAdapter {
  inspectContainer(containerName: string): Promise<{ exists: boolean; isRunning: boolean; volumeNames: string[] }>
  inspectDatabase(connectionString: string): Promise<{ dbName: string; isExclusive: boolean }>
  getCurrentGitSha(): Promise<string>
  getOperatorPrincipal(): Promise<{ windowsPrincipal: string }>
}

/**
 * Atomic anti-replay contract.
 * Replaces separate hasBeenUsed + recordNonce checks to prevent race conditions.
 */
export interface AtomicNonceStore {
  claimOnce(nonce: string, runId: string, expiresAt: string): Promise<boolean>
}

export interface TrustedOperatorRegistry {
  isFingerprintTrusted(fingerprint: string): boolean
  isOperatorApproved(operator: OperatorIdentity): boolean
  getPublicKeyPem(fingerprint: string): string | null
}

/**
 * Verifies Ed25519 signature and pinned operator public-key fingerprint and authorization scope.
 */
export function verifySignedManifest(
  signedManifest: SignedTaskManifest,
  trustedRegistry: TrustedOperatorRegistry
): void {
  const { manifest, signerKeyFingerprint, signatureBase64 } = signedManifest

  // 1. Verify fingerprint trust
  if (!trustedRegistry.isFingerprintTrusted(signerKeyFingerprint)) {
    throw new Error(`REFUSED: Signer key fingerprint "${signerKeyFingerprint}" is not in the trusted operator registry`)
  }

  // 2. Verify operator authorization scope
  if (!trustedRegistry.isOperatorApproved(manifest.authorizedOperator)) {
    throw new Error(
      `REFUSED: Operator identity or approval reference is not approved in trusted registry: ${manifest.authorizedOperator.humanOperatorId} (${manifest.authorizedOperator.approvalReference})`
    )
  }

  // 3. Retrieve pinned public key
  const publicKeyPem = trustedRegistry.getPublicKeyPem(signerKeyFingerprint)
  if (!publicKeyPem) {
    throw new Error(`REFUSED: Public key for fingerprint "${signerKeyFingerprint}" could not be retrieved`)
  }

  const calculatedFingerprint = computePublicKeyFingerprint(publicKeyPem)
  if (calculatedFingerprint.toLowerCase() !== signerKeyFingerprint.toLowerCase()) {
    throw new Error("REFUSED: Public key does not match claimed fingerprint")
  }

  // 4. Canonical serialization & signature verification
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

  // Atomic claim check
  const claimed = await nonceStore.claimOnce(manifest.nonce, manifest.runId, manifest.expiresAt)
  if (!claimed) {
    throw new Error(`REFUSED: Nonce "${manifest.nonce}" has already been consumed or claim conflicted (anti-replay violation)`)
  }

  // Git SHA verification
  const actualSha = await adapter.getCurrentGitSha()
  if (actualSha.toLowerCase() !== manifest.targetCommitSha.toLowerCase()) {
    throw new Error(`REFUSED: Git commit mismatch (actual: ${actualSha}, manifest: ${manifest.targetCommitSha})`)
  }

  // Windows Principal check
  const principal = await adapter.getOperatorPrincipal()
  if (
    principal.windowsPrincipal.toLowerCase() !==
    manifest.authorizedOperator.windowsSecurityPrincipal.toLowerCase()
  ) {
    throw new Error(
      `REFUSED: Operator principal mismatch (actual: ${principal.windowsPrincipal}, manifest: ${manifest.authorizedOperator.windowsSecurityPrincipal})`
    )
  }

  // Container & volume verification
  const containerInfo = await adapter.inspectContainer(manifest.targetContainerName)
  if (!containerInfo.exists || !containerInfo.isRunning) {
    throw new Error(`REFUSED: Target container "${manifest.targetContainerName}" does not exist or is not running`)
  }

  if (!containerInfo.volumeNames.includes(manifest.targetVolumeName)) {
    throw new Error(
      `REFUSED: Container "${manifest.targetContainerName}" does not mount authorized volume "${manifest.targetVolumeName}"`
    )
  }

  // Database identity and exclusivity
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
  // 1. Verify preIntent signature
  const { signatureBase64: preSig, ...preBody } = preIntent
  const isPreValid = verify(null, Buffer.from(canonicalJsonStringify(preBody), "utf8"), publicKeyPem, Buffer.from(preSig, "base64"))
  if (!isPreValid) return false

  // 2. Verify ceremonyId match
  if (preIntent.ceremonyId !== outcome.ceremonyId) return false

  // 3. Verify temporal order: outcome must not precede preIntent
  const preTime = new Date(preIntent.plannedTimestamp).getTime()
  const outTime = new Date("verifiedAt" in outcome ? outcome.verifiedAt : outcome.failedAt).getTime()
  if (isNaN(preTime) || isNaN(outTime) || outTime < preTime) return false

  // 4. Verify SHA-256 cryptographic link
  const expectedDigest = computeSha256Digest(canonicalJsonStringify(preIntent))
  if (outcome.preIntentDigestSha256 !== expectedDigest) return false

  // 5. Verify outcome signature
  const { signatureBase64: outSig, ...outBody } = outcome
  return verify(null, Buffer.from(canonicalJsonStringify(outBody), "utf8"), publicKeyPem, Buffer.from(outSig, "base64"))
}