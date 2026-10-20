import {
  contractRecord,
  parseCounter,
  parseSessionPolicy,
  SessionPolicyContractError,
  type SessionPolicy,
} from "../../modules/dogruadres-access/session-policy"

/** Unregistered DTO contract. Not an authorization decision or an HTTP API.
 * P2 inherits approved bounds/minute granularity from the single domain parser.
 * Policy version is configuration concurrency metadata, never a logout epoch.
 */
export type SessionPolicyRequest = Readonly<{
  expected_version: number
  policy: SessionPolicy
}>

export type SessionPolicyResponse = Readonly<{
  version: number
  policy: SessionPolicy
}>

export function parseSessionPolicyRequest(input: unknown): SessionPolicyRequest {
  const value = contractRecord(input, ["expected_version", "policy"])
  return Object.freeze({
    expected_version: parseCounter(value.expected_version),
    policy: parseSessionPolicy(value.policy),
  })
}

export function parseSessionPolicyResponse(input: unknown): SessionPolicyResponse {
  const value = contractRecord(input, ["version", "policy"])
  return Object.freeze({ version: parseCounter(value.version), policy: parseSessionPolicy(value.policy) })
}

/** Allowlist internal output before serialization; do not spread source objects. */
export function toSessionPolicyResponse(input: unknown): SessionPolicyResponse {
  if (input === null || typeof input !== "object") throw new SessionPolicyContractError()
  const version = Object.getOwnPropertyDescriptor(input, "version")
  const policy = Object.getOwnPropertyDescriptor(input, "policy")
  if (!version || !("value" in version) || !policy || !("value" in policy)) {
    throw new SessionPolicyContractError()
  }
  return parseSessionPolicyResponse({ version: version.value, policy: policy.value })
}
