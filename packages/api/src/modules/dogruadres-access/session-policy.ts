/** Inactive P2 contracts only: no persistence, authentication or session effects.
 * #217/6292478831 replaces P1's range-agnostic validation with approved limits.
 * Policy revisions never imply global logout; eligibility is per session.
 */
export type SessionPolicy = Readonly<{
  idle_timeout_seconds: number
  absolute_lifetime_seconds: number
  recent_auth_seconds: number
}>

export const DEFAULT_SESSION_POLICY: SessionPolicy = Object.freeze({
  idle_timeout_seconds: 1800,
  absolute_lifetime_seconds: 28800,
  recent_auth_seconds: 300,
})

const policyFields = ["idle_timeout_seconds", "absolute_lifetime_seconds", "recent_auth_seconds"] as const

/** Inclusive seconds, configurable in whole minutes; defaults remain unchanged. */
export const SESSION_POLICY_LIMITS = Object.freeze({
  idle_timeout_seconds: Object.freeze({ minimum: 300, maximum: 3600 }),
  absolute_lifetime_seconds: Object.freeze({ minimum: 3600, maximum: 43200 }),
  recent_auth_seconds: Object.freeze({ minimum: 60, maximum: 600 }),
})

export class SessionPolicyContractError extends Error {
  constructor() {
    super("Invalid session policy contract")
    this.name = "SessionPolicyContractError"
  }
}

/** Read data properties only; never execute accessors or accept hidden keys. */
export function contractRecord(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new SessionPolicyContractError()
  }
  const keys = Reflect.ownKeys(input)
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
    throw new SessionPolicyContractError()
  }
  const result: Record<string, unknown> = Object.create(null)
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field)
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new SessionPolicyContractError()
    }
    result[field] = descriptor.value
  }
  return result
}

export function parseCounter(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new SessionPolicyContractError()
  }
  return value
}

export function parseSessionPolicy(input: unknown): SessionPolicy {
  const value = contractRecord(input, policyFields)
  const policy: SessionPolicy = {
    idle_timeout_seconds: parseCounter(value.idle_timeout_seconds),
    absolute_lifetime_seconds: parseCounter(value.absolute_lifetime_seconds),
    recent_auth_seconds: parseCounter(value.recent_auth_seconds),
  }
  if (policyFields.some((field) => policy[field] % 60 !== 0 ||
        policy[field] < SESSION_POLICY_LIMITS[field].minimum ||
        policy[field] > SESSION_POLICY_LIMITS[field].maximum) ||
      policy.recent_auth_seconds > policy.idle_timeout_seconds ||
      policy.idle_timeout_seconds > policy.absolute_lifetime_seconds) {
    throw new SessionPolicyContractError()
  }
  return Object.freeze({
    idle_timeout_seconds: policy.idle_timeout_seconds,
    absolute_lifetime_seconds: policy.absolute_lifetime_seconds,
    recent_auth_seconds: policy.recent_auth_seconds,
  })
}

/** Pure revision proposal, not a database CAS or a global logout policy. */
export function proposePolicyRevision(current: unknown, next: unknown, version: unknown) {
  const before = parseSessionPolicy(current)
  const policy = parseSessionPolicy(next)
  const previousVersion = parseCounter(version)
  const changed = policyFields.some((field) => before[field] !== policy[field])
  if (changed && previousVersion === Number.MAX_SAFE_INTEGER) throw new SessionPolicyContractError()
  return Object.freeze({ policy, version: previousVersion + (changed ? 1 : 0), changed })
}

export type SessionConsistencyState = Readonly<{
  version: number
  generation: number
  status: "active" | "revoked" | "expired"
}>

function parseConsistencyState(input: unknown): SessionConsistencyState {
  const value = contractRecord(input, ["version", "generation", "status"])
  const version = parseCounter(value.version)
  const generation = parseCounter(value.generation)
  if (value.status !== "active" && value.status !== "revoked" && value.status !== "expired") {
    throw new SessionPolicyContractError()
  }
  return Object.freeze({ version, generation, status: value.status })
}

/** Same logical session only. Does not revoke sessions or prove physical CAS. */
export function assertSessionStateTransition(previous: unknown, next: unknown): void {
  const before = parseConsistencyState(previous)
  const after = parseConsistencyState(next)
  const changed = before.generation !== after.generation || before.status !== after.status
  if (after.version < before.version || after.generation < before.generation ||
      (changed && after.version === before.version) ||
      (before.status !== "active" && after.status !== before.status)) {
    throw new SessionPolicyContractError()
  }
}

/** Trusted server facts, not client claims. Epoch milliseconds, never Date.now(). */
export type SessionEligibilityFacts = Readonly<{
  created_at_ms: number
  last_activity_at_ms: number
  /** Null means no completed, verified step-up exists for this session. */
  last_strong_auth_at_ms: number | null
  status: "active" | "revoked" | "expired"
}>

export type SessionEligibilityOutcome =
  | "permitted"
  | "expired_absolute"
  | "expired_idle"
  | "reauthentication_required"
  | "already_revoked"
  | "already_expired"
  | "invalid_input"

export type SessionEligibility = Readonly<{
  outcome: SessionEligibilityOutcome
  permitted: boolean
  session_status: "active" | "revoked" | "expired" | "invalid"
}>

/**
 * Duration eligibility only, NOT an authorization grant. Absolute expiry wins if
 * multiple limits are reached. Recent-auth expiry denies only sensitive work.
 *
 * Eventual runtime MUST persist terminal expiry before allowing later work and
 * atomically recheck session state/current policy version (CAS/retry) against
 * concurrent policy, activity and revocation writes. A policy relaxation must
 * not erase an expiry observed under a prior committed policy. An unobserved
 * tightening followed by relaxation needs policy-history/ordering enforcement;
 * this stateless helper cannot detect it. No cross-instance/CAS guarantee here.
 */
export function evaluateSessionEligibility(
  facts: unknown, policyInput: unknown, evaluationTimeMs: unknown, sensitive: unknown
): SessionEligibility {
  const result = (outcome: SessionEligibilityOutcome, session_status: SessionEligibility["session_status"]): SessionEligibility =>
    Object.freeze({ outcome, permitted: outcome === "permitted", session_status })
  try {
    const policy = parseSessionPolicy(policyInput)
    const session = contractRecord(facts, ["created_at_ms", "last_activity_at_ms", "last_strong_auth_at_ms", "status"])
    const now = parseCounter(evaluationTimeMs)
    const created = parseCounter(session.created_at_ms)
    const activity = parseCounter(session.last_activity_at_ms)
    const strongAuth = session.last_strong_auth_at_ms === null
      ? null
      : parseCounter(session.last_strong_auth_at_ms)
    if (typeof sensitive !== "boolean" || created > now || activity < created ||
        (strongAuth !== null && (strongAuth < created || strongAuth > now)) || activity > now ||
        (session.status !== "active" && session.status !== "revoked" && session.status !== "expired")) {
      return result("invalid_input", "invalid")
    }
    if (session.status === "revoked") return result("already_revoked", "revoked")
    if (session.status === "expired") return result("already_expired", "expired")
    if (now - created >= policy.absolute_lifetime_seconds * 1000) return result("expired_absolute", "expired")
    if (now - activity >= policy.idle_timeout_seconds * 1000) return result("expired_idle", "expired")
    if (sensitive && (strongAuth === null || now - strongAuth >= policy.recent_auth_seconds * 1000)) {
      return result("reauthentication_required", "active")
    }
    return result("permitted", "active")
  } catch {
    return result("invalid_input", "invalid")
  }
}
