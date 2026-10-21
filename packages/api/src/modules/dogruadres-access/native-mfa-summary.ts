/**
 * Read-only projection of the Medusa v2.21.2 Auth Module's native MFA factors.
 *
 * This is NOT an MFA verification, permission grant, enrollment, factor
 * disable, or proof that a previous browser session remains strongly
 * authenticated. The owning AuthIdentity is obtained only from the current
 * server-side Person session and filtered again in the Medusa module query.
 *
 * Do not expose factor metadata, IDs, secrets or recovery codes to the client.
 * Data corruption or a truncated factor list is NOT interpreted as MFA off.
 */
import type { IAuthModuleService } from "@medusajs/framework/types"

export class NativeMfaStateUnavailable extends Error {
  constructor() {
    super("Native MFA factor state unavailable")
    this.name = "NativeMfaStateUnavailable"
  }
}

export type NativeMfaSummary = Readonly<{
  enabled: boolean
  state: "enabled" | "pending" | "not_enrolled"
}>

type NativeFactorReader = Pick<IAuthModuleService,"listAuthMfa">
const LIMIT = 101 // reject overflow instead of potentially hiding an enabled factor

export async function readNativeMfaSummary(
  native: NativeFactorReader,
  authIdentityId: string
): Promise<NativeMfaSummary> {
  if (typeof authIdentityId !== "string" || !authIdentityId) {
    throw new NativeMfaStateUnavailable()
  }
  const factors = await native.listAuthMfa(
    { auth_identity_id: authIdentityId },
    { take: LIMIT, skip: 0 }
  )
  if (!Array.isArray(factors) || factors.length >= LIMIT) {
    throw new NativeMfaStateUnavailable()
  }
  const ids = new Set<string>()
  let enabled = false, pending = false
  for (const factor of factors) {
    if (!factor || typeof factor.id !== "string" || !factor.id ||
        ids.has(factor.id) || factor.auth_identity_id !== authIdentityId ||
        typeof factor.provider !== "string" || !factor.provider ||
        !["enabled","pending","disabled"].includes(factor.status)) {
      throw new NativeMfaStateUnavailable()
    }
    ids.add(factor.id)
    if (factor.status === "enabled") enabled = true
    if (factor.status === "pending") pending = true
  }
  return Object.freeze({
    enabled,
    state: enabled ? "enabled" : pending ? "pending" : "not_enrolled",
  })
}
