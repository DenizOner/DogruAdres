import { createSign, createVerify, sign, verify } from "node:crypto"

/**
 * Deterministic JSON serialization according to RFC 8785 (JSON Canonicalization Scheme - JCS).
 * Keys are sorted lexicographically by UTF-16 code units.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJsonStringify).join(",") + "]"
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  const entries = keys.map(
    (k) => JSON.stringify(k) + ":" + canonicalJsonStringify((obj as Record<string, unknown>)[k])
  )
  return "{" + entries.join(",") + "}"
}

export interface OperatorIdentity {
  readonly humanOperatorId: string
  readonly windowsSecurityPrincipal: string // SID or Domain\Username
  readonly approvalReference: string // e.g., GitHub Issue/PR review comment ID
}

export interface TaskResourceManifest {
  readonly manifestVersion: string
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
  readonly signatureBase64: string
}

export interface RuntimeResourceEnvironment {
  readonly containerName: string
  readonly volumeName: string
  readonly databaseName: string
  readonly host: string
  readonly port: string
  readonly currentGitHeadSha: string
}

export interface RuntimeResourceAdapter {
  inspectContainer(containerName: string): Promise<{ exists: boolean; isRunning: boolean; volumeNames: string[] }>
  inspectDatabase(connectionString: string): Promise<{ dbName: string; isExclusive: boolean }>
  getCurrentGitSha(): Promise<string>
  getOperatorPrincipal(): Promise<{ windowsPrincipal: string }>
}

/**
 * Verifies an Ed25519 signature over the canonical JSON representation of the manifest.
 */
export function verifyManifestSignature(
  signedManifest: SignedTaskManifest,
  trustedPublicKeyPem: string
): boolean {
  try {
    const canonicalPayload = Buffer.from(canonicalJsonStringify(signedManifest.manifest), "utf8")
    const signatureBuffer = Buffer.from(signedManifest.signatureBase64, "base64")
    return verify(null, canonicalPayload, trustedPublicKeyPem, signatureBuffer)
  } catch {
    return false
  }
}

/**
 * Helper to generate signature for testing or authorized operator signing.
 */
export function signManifest(
  manifest: TaskResourceManifest,
  operatorPrivateKeyPem: string
): string {
  const canonicalPayload = Buffer.from(canonicalJsonStringify(manifest), "utf8")
  return sign(null, canonicalPayload, operatorPrivateKeyPem).toString("base64")
}

export async function verifyRuntimeEnvironmentOwnership(
  manifest: TaskResourceManifest,
  adapter: RuntimeResourceAdapter,
  connectionString: string,
  nowIso: string = new Date().toISOString()
): Promise<void> {
  // Check validity dates
  const now = new Date(nowIso).getTime()
  const issued = new Date(manifest.issuedAt).getTime()
  const expires = new Date(manifest.expiresAt).getTime()

  if (isNaN(issued) || isNaN(expires) || now < issued || now > expires) {
    throw new Error(`REFUSED: Manifest is expired or not yet valid (now: ${nowIso}, valid: ${manifest.issuedAt} to ${manifest.expiresAt})`)
  }

  // Verify Git SHA alignment
  const actualSha = await adapter.getCurrentGitSha()
  if (actualSha.toLowerCase() !== manifest.targetCommitSha.toLowerCase()) {
    throw new Error(`REFUSED: Git commit mismatch (actual: ${actualSha}, manifest: ${manifest.targetCommitSha})`)
  }

  // Verify Operator Windows Principal
  const principal = await adapter.getOperatorPrincipal()
  if (
    principal.windowsPrincipal.toLowerCase() !==
    manifest.authorizedOperator.windowsSecurityPrincipal.toLowerCase()
  ) {
    throw new Error(
      `REFUSED: Operator principal mismatch (actual: ${principal.windowsPrincipal}, manifest: ${manifest.authorizedOperator.windowsSecurityPrincipal})`
    )
  }

  // Verify Container & Volume Ownership
  const containerInfo = await adapter.inspectContainer(manifest.targetContainerName)
  if (!containerInfo.exists || !containerInfo.isRunning) {
    throw new Error(`REFUSED: Target container "${manifest.targetContainerName}" does not exist or is not running`)
  }

  if (!containerInfo.volumeNames.includes(manifest.targetVolumeName)) {
    throw new Error(
      `REFUSED: Container "${manifest.targetContainerName}" does not mount authorized volume "${manifest.targetVolumeName}"`
    )
  }

  // Verify DB Identity & Exclusivity
  const dbInfo = await adapter.inspectDatabase(connectionString)
  if (dbInfo.dbName.toLowerCase() !== manifest.targetDatabase.toLowerCase()) {
    throw new Error(`REFUSED: Database identity mismatch (actual: ${dbInfo.dbName}, manifest: ${manifest.targetDatabase})`)
  }
  if (!dbInfo.isExclusive) {
    throw new Error(`REFUSED: Target database "${dbInfo.dbName}" has active concurrent client sessions`)
  }
}

export type ActivationCeremonyStatus =
  | "INTENT_RECORDED"
  | "POST_COMMIT_VERIFIED"
  | "INDETERMINATE_FAILURE"

export interface ActivationCeremonyAuditRecord {
  readonly recordVersion: string
  readonly ceremonyId: string
  readonly manifest: TaskResourceManifest
  readonly operatorIdentity: OperatorIdentity
  status: ActivationCeremonyStatus
  readonly recordedAt: string
  postCommitDetails?: {
    verifiedAt: string
    readbackStatus: "ARMED"
    transactionHash?: string
  }
  failureDetails?: {
    failedAt: string
    stage: "PRE_TRANSACTION" | "IN_TRANSACTION" | "POST_COMMIT_READBACK"
    reason: string
    isIndeterminate: boolean
  }
}