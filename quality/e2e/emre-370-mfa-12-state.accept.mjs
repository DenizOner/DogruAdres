/**
 * #370 / Emre — 3 platform modes x 2 Person preferences x 2 *server-native*
 * factor states: a fail-closed acceptance contract for a future isolated
 * Chrome + HTTPS + PG16 runner. This is NOT the existing pure mfa-policy Jest
 * matrix and is not executable end-to-end without a separately authorized
 * task-owned runtime adapter.
 *
 * Ownership: this new file only. Do not wire into a shared B06 runner/workflow
 * or use protected DB, browser profiles, live credentials or task resources
 * without the current combined-test-owner/actor agreement and #229 preflight.
 *
 * Running this source directly returns exit 2 / NOT TESTED; it cannot
 * accidentally make a docs/static-only CI job appear to prove real MFA.
 */
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

const row = (id, platformMode, userEnabled, nativeEnabled,
  required, userControlAllowed, nextStep, enforcedBy) => Object.freeze({
  id, platformMode, userEnabled, nativeEnabled, required,
  userControlAllowed, nextStep, enforcedBy: Object.freeze(enforcedBy),
})

// Explicit expectations from the owner-approved #230 three-mode contract.
// Native = exact current AuthIdentity factor status; never a client claim.
// In disabled + native-enabled cases reconciliation PRECEDES any bypass.
export const MFA370_CASES = Object.freeze([
  row("01","required",false,false,true,false,"enroll_mfa",["platform"]),
  row("02","required",true,false,true,false,"enroll_mfa",["platform"]),
  row("03","required",false,true,true,false,"verify_mfa",["platform","native_factor"]),
  row("04","required",true,true,true,false,"verify_mfa",["platform","native_factor"]),
  row("05","optional",false,false,false,true,"allow_primary",[]),
  row("06","optional",true,false,true,true,"enroll_mfa",["user"]),
  row("07","optional",false,true,true,true,"verify_mfa",["native_factor"]),
  row("08","optional",true,true,true,true,"verify_mfa",["user","native_factor"]),
  row("09","disabled",false,false,false,false,"allow_primary",[]),
  row("10","disabled",true,false,false,false,"allow_primary",[]),
  row("11","disabled",false,true,true,false,"reconcile_native_factor",["native_factor"]),
  row("12","disabled",true,true,true,false,"reconcile_native_factor",["native_factor"]),
])

const key = c => [c.platformMode, Number(c.userEnabled),
  Number(c.nativeEnabled)].join(":")
assert.equal(MFA370_CASES.length,12,"MFA370: exactly twelve rows")
assert.equal(new Set(MFA370_CASES.map(key)).size,12,
  "MFA370: duplicate matrix state")
assert.equal(new Set(MFA370_CASES.map(c=>c.id)).size,12,
  "MFA370: duplicate case IDs")

const deny = (ok, message) => {
  if (!ok) throw new Error("MFA370 acceptance refused: " + message)
}
const isObject = v => v !== null && typeof v === "object" &&
  !Array.isArray(v)
const isDenied = status => Number.isInteger(status) &&
  status >= 400 && status < 500
const isHexCommit = s => typeof s === "string" && /^[a-f0-9]{40}$/.test(s)
const sensitiveKeys = new Set([
  "token","session_token","refresh_token","password","secret","seed",
  "otp","totp","recovery_code","recovery_codes",
  "auth_identity_id","factor_id","factor_ids","authorization",
])
function assertNoSensitiveBody(value, location) {
  const walk = (node, depth = 0) => {
    deny(depth <= 12, location + ": body nesting exceeds privacy boundary")
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) {
      deny(node.length <= 200, location + ": unbounded response array")
      for (const entry of node) walk(entry,depth+1)
      return
    }
    for (const [k,v] of Object.entries(node)) {
      deny(!sensitiveKeys.has(k.toLowerCase()),location + ": sensitive field")
      walk(v,depth+1)
    }
  }
  walk(value)
}

// The runtime adapter must construct these results from native HTTPS/Chrome
// requests and actual task-isolated PostgreSQL snapshots. A handwritten JSON
// record or a unit-test mock is NOT evidence that this file ran end-to-end.
// Do not emit secrets/OTP/cookies/PII or raw HTTP/SQL bodies in GitHub comments.
export function assertMfa370Observation(expected, observed) {
  deny(MFA370_CASES.includes(expected),"unrecognized test case")
  deny(isObject(observed),"missing actual case observation")
  const p = observed.provenance
  deny(isObject(p) && p.source === "REAL_CHROME_HTTPS_PG16" &&
    p.taskIsolated === true && p.chromeNetworkObserved === true &&
    p.tlsVerified === true && p.pg16Observed === true &&
    p.redisIsolated === true && p.twoDistinctPersons === true &&
    p.twoDistinctOrganizations === true &&
    typeof p.runId === "string" && p.runId.length > 0 &&
    isHexCommit(p.headSha),
    "missing exact current-HEAD isolated Chrome/HTTPS/PG16 proof")
  const state = observed.serverState
  deny(isObject(state) && state.mode === expected.platformMode &&
    state.userEnabled === expected.userEnabled &&
    state.nativeFactorEnabled === expected.nativeEnabled &&
    state.nativeIdentityMatchesSession === true &&
    state.personAndActorBound === true,
    "server policy/native actor state does not match requested case")
  const target = observed.effective
  deny(isObject(target) && target.required === expected.required &&
    target.userControlAllowed === expected.userControlAllowed &&
    target.nextStep === expected.nextStep &&
    Array.isArray(target.enforcedBy) &&
    target.enforcedBy.join(",") === expected.enforcedBy.join(","),
    "effective MFA decision differs from approved 12-state contract")

  const login = observed.login
  deny(isObject(login) && Number.isInteger(login.httpStatus) &&
    login.noStore === true && typeof login.fullSessionCreated === "boolean",
    "missing native login HTTP/cache/full-session observation")
  switch (expected.nextStep) {
    case "enroll_mfa":
      deny(login.httpStatus === 202 &&
        login.result === "enrollment_required" &&
        login.fullSessionCreated === false,
        "enrollment-required state granted an unsafe full session")
      break
    case "verify_mfa":
      deny(login.httpStatus === 202 &&
        login.result === "challenge_required" &&
        login.fullSessionCreated === false,
        "native enabled factor bypassed its challenge")
      break
    case "allow_primary":
      deny(login.httpStatus >= 200 && login.httpStatus < 300 &&
        login.result === "primary_allowed" &&
        login.fullSessionCreated === true,
        "primary-only eligible state did not obtain a scoped full session")
      break
    case "reconcile_native_factor":
      // A pending verified disable/recovery is NOT a platform bypass.
      // Exact HTTP handling is left to the approved B-E integration;
      // any unchallenged full session is categorically refused.
      deny(login.fullSessionCreated === false &&
        (login.result === "native_reconciliation_guard" ||
         login.result === "challenge_required") &&
        (login.httpStatus === 202 || isDenied(login.httpStatus)),
        "platform disabled silently bypassed an active native factor")
      break
    default:
      deny(false,"unknown approved step")
  }
  if (isObject(login.body)) assertNoSensitiveBody(login.body,"native login")

  const read = observed.personalSettingsRead
  deny(isObject(read) && Number.isInteger(read.httpStatus) &&
    read.noStore === true, "missing Person MFA GET HTTP/cache evidence")
  // An enrollment-only session may legitimately lack permission to GET
  // personal settings, so do not invent a 200 response for all 12 rows.
  deny(read.httpStatus === 200 || isDenied(read.httpStatus),
    "unexpected Person MFA GET result")
  if (read.httpStatus === 200) {
    deny(isObject(read.body) && isObject(read.body.effective_mfa_target) &&
      read.body.effective_mfa_target.required === expected.required &&
      read.body.effective_mfa_target.next_step === expected.nextStep &&
      read.body.effective_mfa_target.user_control_allowed ===
        expected.userControlAllowed &&
      read.body.runtime_enforcement === "enforced",
      "actual GET target/runtime does not match server policy")
    assertNoSensitiveBody(read.body,"Person MFA GET")
  } else if (isObject(read.body)) {
    assertNoSensitiveBody(read.body,"denied Person MFA GET")
  }

  const negatives = observed.negatives
  deny(isObject(negatives),"missing negative actor/session matrix")
  for (const name of [
    "foreignPerson","foreignOrganization","ownerPlatformWrite",
    "invalidCsrf","stalePolicySession","replayedOtp",
    "unprovedSecondBrowser",
  ]) {
    const result = negatives[name]
    deny(isObject(result) && isDenied(result.httpStatus) &&
      result.noStore === true &&
      result.domainWriteDelta === 0 && result.auditDelta === 0 &&
      result.outboxDelta === 0,
      "missing denied/no-mutation HTTP+SQL negative: " + name)
    if (isObject(result.body)) assertNoSensitiveBody(result.body,name)
  }

  const db = observed.database
  deny(isObject(db) && db.actualPg16 === true &&
    db.nativeFactorStillBoundToOriginalIdentity === true &&
    db.policyAndPreferencePersisted === true &&
    db.crossPersonRowsUnchanged === true &&
    db.strongSessionScopeVerified === true &&
    db.auditOutboxAtomicityVerified === true,
    "missing real PG16 actor/revision/persistence/audit proof")

  // Positive MFA completion and safe factor retirement require an additional
  // real native challenge/recovery step, never a claim inferred from a GET.
  const finish = observed.completion
  if (expected.nextStep === "verify_mfa") {
    deny(isObject(finish) && finish.realNativeChallengeVerified === true &&
      finish.afterValidChallengeFullScope === true &&
      finish.replayRejected === true,
      "native enabled factor lacks actual one-time challenge proof")
  } else if (expected.nextStep === "reconcile_native_factor") {
    deny(isObject(finish) &&
      finish.disabledModeDidNotDeleteNativeFactorSilently === true &&
      finish.protectedUntilVerifiedRetirement === true,
      "native factor reconciliation remains unproved")
  } else if (expected.nextStep === "enroll_mfa") {
    deny(isObject(finish) &&
      finish.enrollmentSessionHasNoOrganizationPrivilege === true &&
      finish.unverifiedFactorCannotGrantFullScope === true,
      "pending enrollment was treated as verified strong authentication")
  }
  return Object.freeze({caseId:expected.id,status:"OBSERVATIONS_ASSERTED"})
}

/**
 * Integration point for the independently authorized combined test owner.
 * The driver must run EACH row with an actually isolated fixture + two
 * independent actors and return real captured request/DB evidence.
 * No driver is bundled, no shared runner is invoked, and no PASS can be
 * declared solely from successfully importing this module.
 */
export async function runMfa370Acceptance(driver) {
  deny(isObject(driver) && typeof driver.executeIsolatedCase === "function",
    "NOT TESTED — no authorized real Chrome/PG16 execution adapter")
  const seen = []
  for (const entry of MFA370_CASES) {
    const evidence = await driver.executeIsolatedCase(entry)
    seen.push(assertMfa370Observation(entry,evidence))
  }
  deny(seen.length === 12, "incomplete integrated MFA case count")
  return Object.freeze({status:"OBSERVATIONS_ASSERTED_NOT_INDEPENDENTLY_REVIEWED",
    caseIds:Object.freeze(seen.map(item=>item.caseId))})
}

// A direct invocation without a separately authorized native integration
// intentionally fails instead of printing a misleading "12 tests passed".
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.stderr.write(
    "MFA370 NOT TESTED: no task-isolated Chrome/HTTPS/PG16 driver or B-E combined review.\n"
  )
  process.exitCode = 2
}
