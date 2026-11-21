/**
 * #370 / DA-MFA-F-ISOLATED-ADAPTER-SOURCE
 *
 * This SOURCE-ONLY, import-safe plan classifier does not commission an actor,
 * verify a signature, grant Staff, touch a database, read the environment,
 * generate credentials or run native MFA. Even a STRUCTURE_VALID proposal has
 * ACTIVATION_BLOCKED. All supplied "external pins" are untrusted descriptions:
 * independent verification and an express Owner runtime approval remain absent.
 *
 * Historical #238 R1 has a fixed protected DB/cluster and separate signing
 * provenance. Never adapt or bypass r1-readiness.ts/r1-activation.ts for it.
 */
export type IsolatedMfaFPlanReason =
  | "MALFORMED_INPUT"
  | "HISTORICAL_R1_REUSE"
  | "SOURCE_DRIFT"
  | "MISSING_ISOLATION"
  | "EXPIRED"
  | "NONCE_REPLAY"
  | "IRREVERSIBLE_STOP"
  | "UNTRUSTED_SIGNER"
  | "SELF_APPROVAL"
  | "STAFF_BOUNDARY"
  | "TENANT_BOUNDARY"
  | "ONLY_UNVERIFIED_SOURCE_PLAN"

export type IsolatedMfaFPlanDecision = Readonly<{
  structure: "BLOCKED" | "STRUCTURE_VALID"
  activation: "ACTIVATION_BLOCKED"
  reason: IsolatedMfaFPlanReason
  realSignaturesVerified: 0
  realStaffGrantsVerified: 0
  nativeMfaCasesRun: 0
}>

const deny = (reason: IsolatedMfaFPlanReason): IsolatedMfaFPlanDecision =>
  Object.freeze({
    structure: "BLOCKED" as const,
    activation: "ACTIVATION_BLOCKED" as const,
    reason,
    realSignaturesVerified: 0 as const,
    realStaffGrantsVerified: 0 as const,
    nativeMfaCasesRun: 0 as const,
  })

const structuredOnly = (): IsolatedMfaFPlanDecision =>
  Object.freeze({
    structure: "STRUCTURE_VALID" as const,
    activation: "ACTIVATION_BLOCKED" as const,
    reason: "ONLY_UNVERIFIED_SOURCE_PLAN" as const,
    realSignaturesVerified: 0 as const,
    realStaffGrantsVerified: 0 as const,
    nativeMfaCasesRun: 0 as const,
  })

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length &&
  keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
const safeText = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 3 && value.length <= 128 && /^[A-Za-z0-9:_-]+$/.test(value)
const sha40 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{40}$/.test(value)
const hex64 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
const pgIdentifier = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9][0-9]{12,19}$/.test(value)
const time = (value: unknown): number =>
  typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ?
    Date.parse(value) : NaN

const SOURCE_KEYS = ["headSha","baseSha","mainSha","expectedHeadSha","expectedBaseSha","expectedMainSha"]
const HISTORY_KEYS = ["database","pgSystemIdentifier","operatorPrincipal","signerFingerprint"]
const TARGET_KEYS = ["purpose","database","pgSystemIdentifier","operatorPrincipal","leaseId","leaseOwner","leaseExpiresAt","isolation"]
const TRUST_KEYS = [
  "origin","anchorFingerprint","expectedAnchorFingerprint",
  "signerFingerprint","expectedSignerFingerprint","signerOrigin",
  "operatorPrincipal","approverPrincipal","witnessPrincipal","staffApproverPrincipal",
]
const ACTOR_KEYS = [
  "personId","authIdentityId","organizationId","storeId",
  "storeOrganizationId","session","grant",
]
const STAFF_KEYS = ["subjectPersonId","task","resource","approverPrincipal","runtimeGrant"]
const CEREMONY_KEYS = ["nonce","usedNonces","issuedAt","expiresAt","activation","readback"]

/**
 * Inspect *untrusted plan descriptions* only. No true authority check happens
 * in this pure function. Caller-asserted pins/counters can never grant a run.
 * The optional explicit "now" is supplied by the offline test; no wall clock,
 * network, process environment, filesystem, SQL or key material is accessed.
 */
export function inspectIsolatedMfaFPlan(
  candidate: unknown,
  nowIso: string,
): IsolatedMfaFPlanDecision {
  if (!record(candidate) ||
      !exact(candidate, ["version","task","source","protectedR1","target","trust","actors","staff","ceremony"]) ||
      candidate.version !== "DA-MFA-F-ADAPTER-SOURCE-v1" ||
      candidate.task !== "370-MFA-F-ISOLATED-ADAPTER-SOURCE" ||
      !record(candidate.source) || !exact(candidate.source, SOURCE_KEYS) ||
      !record(candidate.protectedR1) || !exact(candidate.protectedR1, HISTORY_KEYS) ||
      !record(candidate.target) || !exact(candidate.target, TARGET_KEYS) ||
      !record(candidate.trust) || !exact(candidate.trust, TRUST_KEYS) ||
      !Array.isArray(candidate.actors) || candidate.actors.length !== 2 ||
      !candidate.actors.every(actor => record(actor) && exact(actor, ACTOR_KEYS)) ||
      !record(candidate.staff) || !exact(candidate.staff, STAFF_KEYS) ||
      !record(candidate.ceremony) || !exact(candidate.ceremony, CEREMONY_KEYS)) {
    return deny("MALFORMED_INPUT")
  }

  const source = candidate.source
  const protectedR1 = candidate.protectedR1
  const target = candidate.target
  const trust = candidate.trust
  const actors = candidate.actors as Record<string, unknown>[]
  const staff = candidate.staff
  const ceremony = candidate.ceremony

  // These values are historical immutable protection references, NOT an
  // available F fixture, signer or permission to connect to that environment.
  if (protectedR1.database !== "da_r0b_e7a1_db" ||
      protectedR1.pgSystemIdentifier !== "7699743845625188386" ||
      !safeText(protectedR1.operatorPrincipal) ||
      !hex64(protectedR1.signerFingerprint) ||
      target.database === protectedR1.database ||
      target.pgSystemIdentifier === protectedR1.pgSystemIdentifier ||
      target.operatorPrincipal === protectedR1.operatorPrincipal ||
      trust.signerFingerprint === protectedR1.signerFingerprint) {
    return deny("HISTORICAL_R1_REUSE")
  }

  // A proposed source reference cannot silently slide between HEAD and base.
  // Equal strings are only consistency checks, NOT GitHub commit attestations.
  if (!SOURCE_KEYS.every(key => sha40(source[key])) ||
      source.headSha !== source.expectedHeadSha ||
      source.baseSha !== source.expectedBaseSha ||
      source.mainSha !== source.expectedMainSha ||
      source.baseSha !== source.mainSha ||
      source.headSha === source.baseSha) {
    return deny("SOURCE_DRIFT")
  }

  if (target.purpose !== "DISPOSABLE_F_TEST_ONLY" ||
      typeof target.database !== "string" ||
      !/^mfa_f_[a-f0-9]{16}$/.test(target.database) ||
      !pgIdentifier(target.pgSystemIdentifier) ||
      !safeText(target.operatorPrincipal) ||
      !safeText(target.leaseId) ||
      !safeText(target.leaseOwner) ||
      target.isolation !== "EXCLUSIVE_DISPOSABLE_CLAIM") {
    return deny("MISSING_ISOLATION")
  }

  const issued = time(ceremony.issuedAt)
  const expires = time(ceremony.expiresAt)
  const leaseExpires = time(target.leaseExpiresAt)
  const now = time(nowIso)
  if (![issued, expires, leaseExpires, now].every(Number.isFinite) ||
      now < issued || now >= expires || expires <= issued ||
      expires - issued > 30 * 60_000 || leaseExpires < expires ||
      leaseExpires <= now) {
    return deny("EXPIRED")
  }

  // The priorNonce list is only a hypothetical offline input; NOT a real
  // atomic replay ledger or proof of non-use in PostgreSQL.
  if (!hex64(ceremony.nonce) ||
      !Array.isArray(ceremony.usedNonces) ||
      !ceremony.usedNonces.every(hex64) ||
      new Set(ceremony.usedNonces).size !== ceremony.usedNonces.length ||
      ceremony.usedNonces.includes(ceremony.nonce)) {
    return deny("NONCE_REPLAY")
  }

  // Even a committed-looking candidate cannot use this adapter to retry,
  // invent a post-commit outcome, or roll back an irreversible R1 transition.
  if (ceremony.activation !== "NOT_STARTED" ||
      ceremony.readback !== "NOT_ATTEMPTED") {
    return deny("IRREVERSIBLE_STOP")
  }

  if (trust.origin !== "EXTERNAL_INDEPENDENT_PREPIN" ||
      trust.signerOrigin !== "EXTERNAL_REGISTRY_NOT_JOB" ||
      !hex64(trust.anchorFingerprint) ||
      !hex64(trust.expectedAnchorFingerprint) ||
      !hex64(trust.signerFingerprint) ||
      !hex64(trust.expectedSignerFingerprint) ||
      trust.anchorFingerprint !== trust.expectedAnchorFingerprint ||
      trust.signerFingerprint !== trust.expectedSignerFingerprint ||
      !safeText(trust.operatorPrincipal) ||
      trust.operatorPrincipal !== target.operatorPrincipal) {
    return deny("UNTRUSTED_SIGNER")
  }

  if (![trust.approverPrincipal, trust.witnessPrincipal, trust.staffApproverPrincipal]
      .every(safeText) ||
      new Set([
        trust.operatorPrincipal,
        trust.approverPrincipal,
        trust.witnessPrincipal,
        trust.staffApproverPrincipal,
      ]).size !== 4) {
    return deny("SELF_APPROVAL")
  }

  if (staff.task !== "security.mfa.manage" ||
      staff.resource !== "platform" ||
      staff.runtimeGrant !== "NOT_CREATED" ||
      staff.approverPrincipal !== trust.staffApproverPrincipal ||
      !actors.some(actor => actor.personId === staff.subjectPersonId)) {
    return deny("STAFF_BOUNDARY")
  }

  const uniqueFields = ["personId","authIdentityId","organizationId","storeId"]
  if (actors.some(actor =>
        !ACTOR_KEYS.slice(0, 5).every(key => safeText(actor[key])) ||
        actor.organizationId !== actor.storeOrganizationId ||
        actor.session !== "CURRENT" ||
        actor.grant !== "NONE") ||
      uniqueFields.some(key => new Set(actors.map(actor => actor[key])).size !== 2)) {
    return deny("TENANT_BOUNDARY")
  }

  // STRUCTURE_VALID is NOT trust verified; never expose any runnable operation.
  return structuredOnly()
}
