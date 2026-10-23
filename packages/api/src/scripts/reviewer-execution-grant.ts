import { createPublicKey, verify } from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import {
  canonicalJsonStringify, computeSha256Digest, computePublicKeyFingerprint,
  createTrustedOperatorRegistry, verifySignedManifest, verifyPathEffectiveSecurity,
  type SignedTaskManifest, type TaskResourceManifest, type PinnedOperatorApproval,
} from "./operator-audit-protocol"
import {
  NativeDockerResourceAdapter, NativeFileAtomicNonceAdapter, NativeWindowsSecurityAdapter,
  type ApprovedRuntimeResourceBinding,
} from "./native-runtime-adapters"

export interface ReviewerTrustRoot {
  readonly reviewerId: string
  readonly publicKeyPem: string
  readonly fingerprint: string
}
// Only the independent reviewer may commission this SOURCE trust root.
// Never load a replacement root from env, grant, candidate JSON or operator files.
// Commissioning changes the source SHA: every grant must target that NEW SHA.
export const INDEPENDENT_REVIEWER_TRUST_ROOT: ReviewerTrustRoot | null = null

export const R0D_ACTION_SCOPE = Object.freeze({
  action: "create-two-native-user-authidentity-person-bindings",
  fixtureCount: 2, mfaActivated: false, r1: false, r2: false,
  schemaChanges: false, newResources: false, automaticRetryOrRollback: false,
})
export interface RedisResourceBinding {
  readonly name: string
  readonly id: string
  readonly imageId: string
  readonly project: string
  readonly mounts: unknown[]
  readonly ports: Record<string, unknown>
}
export interface ExecutionManifest extends TaskResourceManifest {
  readonly worktree: string
  readonly commonGitDirectory: string
  readonly evidenceDirectory: string
  readonly runtimeResourceBinding: ApprovedRuntimeResourceBinding
  readonly redisResourceBinding: RedisResourceBinding
  readonly actionScope: typeof R0D_ACTION_SCOPE
}
export interface ReviewerGrantBody {
  readonly grantVersion: "1.0.0"
  readonly reviewerId: string
  readonly sourceSha: string
  readonly operatorFingerprint: string
  readonly operatorPublicKeyPem: string
  readonly windowsSid: string
  readonly runId: string
  readonly nonce: string
  readonly manifestDigest: string
  readonly resourcesDigest: string
  readonly actionScope: typeof R0D_ACTION_SCOPE
  readonly notBefore: string
  readonly expiresAt: string
  readonly reviewReference: string
}
export interface SignedReviewerGrant {
  readonly grant: ReviewerGrantBody
  readonly signatureBase64: string
}
const digest = (x: unknown) => computeSha256Digest(canonicalJsonStringify(x))
export const executionResourcesDigest = (m: ExecutionManifest) => digest({
  postgres: m.runtimeResourceBinding, redis: m.redisResourceBinding,
})
function refuse(why: string): never { throw new Error(`REFUSED: Reviewer grant ${why}`) }
function publicSpki(pem: string) {
  const key = createPublicKey(pem)
  if (key.asymmetricKeyType !== "ed25519" ||
      key.export({type:"spki",format:"pem"}).toString().trim() !== pem.trim().replace(/\r\n/g,"\n")) {
    refuse("key must be public Ed25519 SPKI")
  }
  return key
}
function checkSignature(body: unknown, signature: string, pem: string): void {
  const key = publicSpki(pem)
  if (key.asymmetricKeyType !== "ed25519" || typeof signature !== "string") refuse("signature invalid")
  const bytes = Buffer.from(signature, "base64")
  if (bytes.length !== 64 || bytes.toString("base64") !== signature ||
      !verify(null, Buffer.from(canonicalJsonStringify(body)), key, bytes)) refuse("signature invalid")
}

/** Pure verifier; production always supplies the source constant, never a caller-selected root. */
export function verifyReviewerExecutionGrant(
  root: ReviewerTrustRoot | null, signed: SignedReviewerGrant | null,
  operatorManifest: SignedTaskManifest, actual: { sourceSha: string; windowsSid: string },
  nowIso = new Date().toISOString()
) {
  if (!root) refuse("trust root is not commissioned")
  if (!signed?.grant) refuse("is missing")
  if (!root.reviewerId || computePublicKeyFingerprint(root.publicKeyPem) !== root.fingerprint ||
      root.fingerprint === operatorManifest.signerKeyFingerprint ||
      root.fingerprint === "f0e625dc8886b15dbd5a270c9f5d18f57b8ae74f3d75d3f02833123ebb916d52") refuse("trust root invalid")
  checkSignature(signed.grant, signed.signatureBase64, root.publicKeyPem)
  const g = signed.grant, m = operatorManifest.manifest as ExecutionManifest
  if (m.targetDatabase !== "da_r0b_e7a1_db" || m.taskEnvironmentId !== "da-r0b-e7a1-env") refuse("task target mismatch")
  if (![m.worktree,m.commonGitDirectory,m.evidenceDirectory].every(p =>
      typeof p === "string" && /^[a-z]:[\\/]/i.test(p))) refuse("absolute Windows paths required")
  const pg = m.runtimeResourceBinding, redis = m.redisResourceBinding
  if (!pg || !redis || m.targetHost !== "127.0.0.1" || m.targetPort !== pg.loopbackHostPort ||
      m.targetVolumeName !== pg.volumeName || pg.composeProject !== m.taskEnvironmentId ||
      redis.project !== m.taskEnvironmentId) refuse("resource/connection binding inconsistent")
  const now = Date.parse(nowIso), start = Date.parse(g.notBefore), end = Date.parse(g.expiresAt)
  const issued = Date.parse(m.issuedAt), expiry = Date.parse(m.expiresAt)
  if (![now,start,end,issued,expiry].every(Number.isFinite) || start >= end || issued > start ||
      end > expiry || now < start || now >= end) refuse("validity invalid or expired")
  if (g.grantVersion !== "1.0.0" || g.reviewerId !== root.reviewerId ||
      !/^https:\/\/github\.com\/DenizOner\/DogruAdres\/issues\/239#issuecomment-\d+$/.test(g.reviewReference)) refuse("review provenance invalid")
  if (!/^[a-f0-9]{40}$/.test(g.sourceSha) || g.sourceSha !== actual.sourceSha ||
      g.sourceSha !== m.targetCommitSha) refuse("source SHA mismatch")
  if (!/^S-1-\d+(?:-\d+)+$/i.test(g.windowsSid) ||
      g.windowsSid.toLowerCase() !== actual.windowsSid.toLowerCase() ||
      g.windowsSid.toLowerCase() !== m.authorizedOperator.windowsSecurityPrincipal.toLowerCase()) refuse("SID mismatch")
  if (g.operatorFingerprint !== operatorManifest.signerKeyFingerprint ||
      computePublicKeyFingerprint(g.operatorPublicKeyPem) !== g.operatorFingerprint ||
      m.authorizedOperator.executorType !== "automation_agent") refuse("operator mismatch")
  if (!g.runId || g.runId !== m.runId || !/^[a-f0-9]{64}$/.test(g.nonce) || g.nonce !== m.nonce ||
      g.manifestDigest !== digest(m) || g.resourcesDigest !== executionResourcesDigest(m)) refuse("manifest/run/nonce/resource binding mismatch")
  if (canonicalJsonStringify(g.actionScope) !== canonicalJsonStringify(R0D_ACTION_SCOPE) ||
      canonicalJsonStringify(m.actionScope) !== canonicalJsonStringify(R0D_ACTION_SCOPE)) refuse("action scope mismatch")
  publicSpki(g.operatorPublicKeyPem)
  const pin: PinnedOperatorApproval = {
    trustDomain: "dogruadres-m0-mfa", executorType: "automation_agent",
    operatorId: m.authorizedOperator.operatorId, runId: g.runId,
    windowsPrincipal: g.windowsSid, approvalReference: m.authorizedOperator.approvalReference,
    keyFingerprint: g.operatorFingerprint, taskEnvironmentId: m.taskEnvironmentId,
    targetDatabase: m.targetDatabase, targetCommitSha: g.sourceSha,
    validFrom: g.notBefore, validUntil: g.expiresAt,
  }
  const registryData = { registrySchemaVersion: "1.1.0", trustDomain: pin.trustDomain, operators: [{
    executorType: pin.executorType, operatorId: pin.operatorId, windowsPrincipal: pin.windowsPrincipal,
    approvalReference: pin.approvalReference, publicKeyPem: g.operatorPublicKeyPem,
    keyFingerprint: pin.keyFingerprint, validFrom: pin.validFrom, validUntil: pin.validUntil,
  }] }
  const registry = createTrustedOperatorRegistry(registryData, pin, nowIso)
  verifySignedManifest(operatorManifest, registry)
  return { pin, registryData, registry, manifest: m }
}

export function assertRedisResourceMatchesGrant(actual: any, expected: RedisResourceBinding) {
  if (!/^[a-f0-9]{64}$/.test(expected.id) || !/^sha256:[a-f0-9]{64}$/.test(expected.imageId) ||
      !expected.project || !expected.name || !Array.isArray(expected.mounts) || !expected.mounts.length ||
      actual.Id !== expected.id || actual.Image !== expected.imageId || actual.State?.Running !== true ||
      actual.Config?.Labels?.["com.docker.compose.project"] !== expected.project ||
      canonicalJsonStringify(actual.Mounts) !== canonicalJsonStringify(expected.mounts) ||
      canonicalJsonStringify(actual.HostConfig?.PortBindings) !== canonicalJsonStringify(expected.ports)) refuse("Redis identity/mount/bind mismatch")
  const ports = expected.ports["6379/tcp"] as Array<{ HostIp: string; HostPort: string }>
  if (!Array.isArray(ports) || ports.length !== 1 || ports[0].HostIp !== "127.0.0.1" ||
      !/^\d+$/.test(ports[0].HostPort)) refuse("Redis loopback binding invalid")
}
const exec = promisify(execFile)
class ReviewedResourceAdapter extends NativeDockerResourceAdapter {
  constructor(worktree: string, pg: ApprovedRuntimeResourceBinding, private redis: RedisResourceBinding) {
    super(worktree, pg)
  }
  async inspectContainer(name: string) {
    const pg = await super.inspectContainer(name)
    let actual: unknown
    try { actual = JSON.parse((await exec("docker", ["inspect", "--format", "{{json .}}", this.redis.id])).stdout) }
    catch { return refuse("Redis inspection failed") }
    assertRedisResourceMatchesGrant(actual, this.redis)
    return pg
  }
}

/** No root argument: runtime authority cannot come from caller/env/candidate configuration. */
export async function commissionReviewedRuntime(
  signedManifest: SignedTaskManifest, signedGrant: SignedReviewerGrant,
  evidenceDir: string
) {
  if (!INDEPENDENT_REVIEWER_TRUST_ROOT) refuse("trust root is not commissioned")
  const git = async (...args: string[]) => (await exec("git", args)).stdout.trim()
  const sourceSha = await git("rev-parse", "HEAD")
  if (await git("status", "--porcelain=v2", "--untracked-files=no")) refuse("tracked worktree/index is dirty")
  const probe = new NativeDockerResourceAdapter()
  const { windowsPrincipal } = await probe.getOperatorPrincipal()
  const assertCurrentGrant = async () => {
    const currentSha = await git("rev-parse", "HEAD")
    if (await git("status", "--porcelain=v2", "--untracked-files=no")) refuse("tracked worktree/index is dirty")
    verifyReviewerExecutionGrant(INDEPENDENT_REVIEWER_TRUST_ROOT, signedGrant, signedManifest,
      { sourceSha: currentSha, windowsSid: (await probe.getOperatorPrincipal()).windowsPrincipal })
  }
  const verified = verifyReviewerExecutionGrant(INDEPENDENT_REVIEWER_TRUST_ROOT, signedGrant, signedManifest,
    { sourceSha, windowsSid: windowsPrincipal })
  const normalize = (p: string) => path.resolve(p).toLowerCase()
  if (normalize(await git("rev-parse", "--show-toplevel")) !== normalize(verified.manifest.worktree) ||
      normalize(await git("rev-parse", "--path-format=absolute", "--git-common-dir")) !== normalize(verified.manifest.commonGitDirectory)) refuse("worktree/common directory mismatch")
  if (normalize(evidenceDir) !== normalize(verified.manifest.evidenceDirectory)) refuse("evidence/nonce directory mismatch")
  const security = new NativeWindowsSecurityAdapter()
  const inspection = await security.inspectPathSecurity(evidenceDir)
  verifyPathEffectiveSecurity(inspection, windowsPrincipal)
  // Must already exist with verified NTFS protection; never mkdir or provision SQL here.
  const nonceDir = path.join(evidenceDir, "nonce-claims")
  verifyPathEffectiveSecurity(await security.inspectPathSecurity(nonceDir), windowsPrincipal)
  return { ...verified, inspection, security, assertCurrentGrant,
    resources: new ReviewedResourceAdapter(verified.manifest.worktree, verified.manifest.runtimeResourceBinding,
      verified.manifest.redisResourceBinding), nonce: new NativeFileAtomicNonceAdapter(nonceDir) }
}