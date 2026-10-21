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

type InternalNativeFactorState = Readonly<{
  summary: NativeMfaSummary
  pendingTotpIds: readonly string[]
}>

/** Internal-only projection; factor identifiers must never be returned via HTTP. */
async function readVerifiedNativeFactors(
  native: NativeFactorReader,
  authIdentityId: string
): Promise<InternalNativeFactorState> {
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
  const pendingTotpIds: string[] = []
  for (const factor of factors) {
    if (!factor || typeof factor.id !== "string" || !factor.id ||
        ids.has(factor.id) || factor.auth_identity_id !== authIdentityId ||
        typeof factor.provider !== "string" || !factor.provider ||
        !["enabled","pending","disabled"].includes(factor.status)) {
      throw new NativeMfaStateUnavailable()
    }
    ids.add(factor.id)
    if (factor.status === "enabled") enabled = true
    if (factor.status === "pending") {
      pending = true
      if(factor.provider==="totp")pendingTotpIds.push(factor.id)
    }
  }
  return Object.freeze({
    summary: Object.freeze({
      enabled,
      state: enabled ? "enabled" as const : pending ? "pending" as const : "not_enrolled" as const,
    }),
    pendingTotpIds: Object.freeze(pendingTotpIds),
  })
}

export async function readNativeMfaSummary(
  native: NativeFactorReader,
  authIdentityId: string
): Promise<NativeMfaSummary> {
  return (await readVerifiedNativeFactors(native,authIdentityId)).summary
}

/**
 * Recover a prior *pending* TOTP without silently creating another factor.
 * Fail-closed on enabled factor, multiple pending, unsupported pending provider,
 * malformed identity or truncation. Never return factor metadata or secrets.
 */
export async function findResumablePendingTotpId(
  native: NativeFactorReader,
  authIdentityId: string
): Promise<string | null> {
  const snapshot=await readVerifiedNativeFactors(native,authIdentityId)
  if(snapshot.summary.enabled)throw new NativeMfaStateUnavailable()
  if(snapshot.summary.state==="not_enrolled")return null
  if(snapshot.pendingTotpIds.length!==1)
    throw new NativeMfaStateUnavailable()
  return snapshot.pendingTotpIds[0]
}
