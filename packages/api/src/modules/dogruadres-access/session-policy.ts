/** Inactive P1 contracts only: no persistence, authentication or session effects.
 * Duration bounds and policy-change logout effects remain undecided (#217).
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
  if (policyFields.some((field) => policy[field] === 0) ||
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
