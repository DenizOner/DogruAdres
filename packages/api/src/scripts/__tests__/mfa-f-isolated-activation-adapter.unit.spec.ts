/**
 * #370 — SOURCE-ONLY, OFFLINE test-first safety contract.
 * No DB, secret, crypto signing, MFA runtime, Admin, Staff bootstrap or network.
 * A structurally acceptable plan must still be ACTIVATION_BLOCKED.
 */
import { inspectIsolatedMfaFPlan } from "../mfa-f-isolated-activation-adapter"

const sha = (c: string) => c.repeat(40)
const fp = (c: string) => c.repeat(64)
const nonce = fp("a")
const now = "2026-11-21T12:01:00.000Z"

const validPlan = () => ({
  version: "DA-MFA-F-ADAPTER-SOURCE-v1",
  task: "370-MFA-F-ISOLATED-ADAPTER-SOURCE",
  source: {
    headSha: sha("a"), baseSha: sha("b"), mainSha: sha("b"),
    expectedHeadSha: sha("a"), expectedBaseSha: sha("b"),
    expectedMainSha: sha("b"),
  },
  protectedR1: {
    database: "da_r0b_e7a1_db",
    pgSystemIdentifier: "7699743845625188386",
    operatorPrincipal: "historical-r1-protected-operator",
    signerFingerprint: fp("1"),
  },
  target: {
    purpose: "DISPOSABLE_F_TEST_ONLY",
    database: "mfa_f_1234567890abcdef",
    pgSystemIdentifier: "8123456789012345678",
    operatorPrincipal: "new-isolated-operator",
    leaseId: "future-unique-lease-370",
    leaseOwner: "future-independent-actor",
    leaseExpiresAt: "2026-11-21T12:15:00.000Z",
    isolation: "EXCLUSIVE_DISPOSABLE_CLAIM",
  },
  trust: {
    origin: "EXTERNAL_INDEPENDENT_PREPIN",
    anchorFingerprint: fp("2"), expectedAnchorFingerprint: fp("2"),
    signerFingerprint: fp("3"), expectedSignerFingerprint: fp("3"),
    signerOrigin: "EXTERNAL_REGISTRY_NOT_JOB",
    operatorPrincipal: "new-isolated-operator",
    approverPrincipal: "different-approval-principal",
    witnessPrincipal: "independent-trust-witness",
    staffApproverPrincipal: "separate-staff-authorizer",
  },
  actors: [
    { personId: "synthetic-person-a", authIdentityId: "synthetic-auth-a",
      organizationId: "synthetic-org-a", storeId: "synthetic-store-a",
      storeOrganizationId: "synthetic-org-a", session: "CURRENT", grant: "NONE" },
    { personId: "synthetic-person-b", authIdentityId: "synthetic-auth-b",
      organizationId: "synthetic-org-b", storeId: "synthetic-store-b",
      storeOrganizationId: "synthetic-org-b", session: "CURRENT", grant: "NONE" },
  ],
  staff: {
    subjectPersonId: "synthetic-person-a",
    task: "security.mfa.manage", resource: "platform",
    approverPrincipal: "separate-staff-authorizer",
    runtimeGrant: "NOT_CREATED",
  },
  ceremony: {
    nonce, usedNonces: [],
    issuedAt: "2026-11-21T12:00:00.000Z",
    expiresAt: "2026-11-21T12:10:00.000Z",
    activation: "NOT_STARTED", readback: "NOT_ATTEMPTED",
  },
})

type Plan = ReturnType<typeof validPlan>
const copy = (): Plan => JSON.parse(JSON.stringify(validPlan())) as Plan

const blocked = (candidate: unknown, reason: string) => {
  expect(inspectIsolatedMfaFPlan(candidate, now)).toEqual({
    structure: "BLOCKED",
    activation: "ACTIVATION_BLOCKED",
    reason,
    realSignaturesVerified: 0,
    realStaffGrantsVerified: 0,
    nativeMfaCasesRun: 0,
  })
}

describe("#370 isolated MFA F source-only plan — fail closed", () => {
  it("fails closed on absent, malformed, or unknown source", () => {
    blocked(null, "MALFORMED_INPUT")
    blocked({}, "MALFORMED_INPUT")
    blocked({ ...validPlan(), privateKeyPem: "do-not-accept" }, "MALFORMED_INPUT")
    blocked({ ...validPlan(), activationSql: "UPDATE da_session_policy" }, "MALFORMED_INPUT")
    const x = copy()
    x.version = "ACTIVATE_R1"
    blocked(x, "MALFORMED_INPUT")
  })

  it("accepts a consistent proposed *structure* while always refusing activation", () => {
    const proposal = validPlan()
    const result = inspectIsolatedMfaFPlan(proposal, now)
    expect(result).toEqual({
      structure: "STRUCTURE_VALID",
      activation: "ACTIVATION_BLOCKED",
      reason: "ONLY_UNVERIFIED_SOURCE_PLAN",
      realSignaturesVerified: 0,
      realStaffGrantsVerified: 0,
      nativeMfaCasesRun: 0,
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(proposal.ceremony.activation).toBe("NOT_STARTED")
  })

  it.each([
    ["historical database", (x: Plan) => { x.target.database = x.protectedR1.database }, "HISTORICAL_R1_REUSE"],
    ["historical cluster", (x: Plan) => { x.target.pgSystemIdentifier = x.protectedR1.pgSystemIdentifier }, "HISTORICAL_R1_REUSE"],
    ["historical operator", (x: Plan) => { x.target.operatorPrincipal = x.protectedR1.operatorPrincipal }, "HISTORICAL_R1_REUSE"],
    ["historical signer", (x: Plan) => { x.trust.signerFingerprint = x.protectedR1.signerFingerprint }, "HISTORICAL_R1_REUSE"],
    ["false historical reference", (x: Plan) => { x.protectedR1.database = "fake" }, "HISTORICAL_R1_REUSE"],
    ["old stored SHA", (x: Plan) => { x.source.headSha = sha("c") }, "SOURCE_DRIFT"],
    ["wrong base", (x: Plan) => { x.source.baseSha = sha("d") }, "SOURCE_DRIFT"],
    ["current main drift", (x: Plan) => { x.source.mainSha = sha("e") }, "SOURCE_DRIFT"],
    ["unmatched approved main", (x: Plan) => { x.source.expectedMainSha = sha("d") }, "SOURCE_DRIFT"],
    ["invalid head syntax", (x: Plan) => { x.source.headSha = "abc" }, "SOURCE_DRIFT"],
    ["missing lease", (x: Plan) => { x.target.leaseId = "" }, "MISSING_ISOLATION"],
    ["shared/unsupported lease", (x: Plan) => { x.target.isolation = "SHARED" }, "MISSING_ISOLATION"],
    ["no lease owner", (x: Plan) => { x.target.leaseOwner = "" }, "MISSING_ISOLATION"],
    ["expired lease", (x: Plan) => { x.target.leaseExpiresAt = "2026-11-21T11:59:00.000Z" }, "EXPIRED"],
    ["expired intent", (x: Plan) => { x.ceremony.expiresAt = "2026-11-21T12:00:00.000Z" }, "EXPIRED"],
    ["future intent", (x: Plan) => { x.ceremony.issuedAt = "2026-11-21T12:03:00.000Z" }, "EXPIRED"],
    ["nonce replay", (x: Plan) => { x.ceremony.usedNonces = [nonce] }, "NONCE_REPLAY"],
    ["bad nonce", (x: Plan) => { x.ceremony.nonce = "reused" }, "NONCE_REPLAY"],
    ["indeterminate readback", (x: Plan) => { x.ceremony.readback = "INDETERMINATE" }, "IRREVERSIBLE_STOP"],
    ["pretend activated", (x: Plan) => { x.ceremony.activation = "ACTIVATED" }, "IRREVERSIBLE_STOP"],
    ["job-created signer", (x: Plan) => { x.trust.signerOrigin = "SELF_SIGNED_JOB" }, "UNTRUSTED_SIGNER"],
    ["un-pinned anchor", (x: Plan) => { x.trust.expectedAnchorFingerprint = fp("4") }, "UNTRUSTED_SIGNER"],
    ["un-pinned signer", (x: Plan) => { x.trust.expectedSignerFingerprint = fp("4") }, "UNTRUSTED_SIGNER"],
    ["actor self-approved", (x: Plan) => { x.trust.approverPrincipal = x.trust.operatorPrincipal }, "SELF_APPROVAL"],
    ["actor self-witnessed", (x: Plan) => { x.trust.witnessPrincipal = x.trust.operatorPrincipal }, "SELF_APPROVAL"],
    ["staff self-grant", (x: Plan) => { x.trust.staffApproverPrincipal = x.trust.operatorPrincipal; x.staff.approverPrincipal = x.trust.operatorPrincipal }, "SELF_APPROVAL"],
    ["wrong task grant", (x: Plan) => { x.staff.task = "platform.smtp.manage" }, "STAFF_BOUNDARY"],
    ["wrong staff resource", (x: Plan) => { x.staff.resource = "organization" }, "STAFF_BOUNDARY"],
    ["pre-created staff grant", (x: Plan) => { x.staff.runtimeGrant = "GRANTED" }, "STAFF_BOUNDARY"],
    ["foreign staff Person", (x: Plan) => { x.staff.subjectPersonId = "foreign-person" }, "STAFF_BOUNDARY"],
    ["wrong store organization", (x: Plan) => { x.actors[1].storeOrganizationId = "synthetic-org-a" }, "TENANT_BOUNDARY"],
    ["cross-Person Org", (x: Plan) => { x.actors[1].organizationId = "synthetic-org-a"; x.actors[1].storeOrganizationId = "synthetic-org-a" }, "TENANT_BOUNDARY"],
    ["duplicate native AuthIdentity", (x: Plan) => { x.actors[1].authIdentityId = x.actors[0].authIdentityId }, "TENANT_BOUNDARY"],
    ["revoked actor", (x: Plan) => { x.actors[0].session = "REVOKED" }, "TENANT_BOUNDARY"],
    ["stale actor", (x: Plan) => { x.actors[1].session = "STALE" }, "TENANT_BOUNDARY"],
    ["fabricated grant", (x: Plan) => { x.actors[0].grant = "PLATFORM_OWNER" }, "TENANT_BOUNDARY"],
  ])("%s => blocked, never runs a native case", (_title, change, reason) => {
    const candidate = copy()
    change(candidate)
    blocked(candidate, reason)
  })

  it("has no SQL, network, key management, or environment dependency in its offline plan API", () => {
    const d = inspectIsolatedMfaFPlan(validPlan(), now)
    expect(Object.keys(d).sort()).toEqual([
      "activation", "nativeMfaCasesRun", "realSignaturesVerified",
      "realStaffGrantsVerified", "reason", "structure",
    ])
    expect(JSON.stringify(d)).not.toMatch(/privateKey|signatureBase64|ACTIVATED|BEGIN|COMMIT/)
  })
})
