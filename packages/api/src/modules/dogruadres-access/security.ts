import { createHash, createHmac, timingSafeEqual } from "node:crypto"

const invitationSecret = () => {
  const value = process.env.DOGRUADRES_INVITATION_SECRET
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("DOGRUADRES_INVITATION_SECRET must be configured with at least 32 bytes")
  }
  return value
}

export const normalizeEmail = (value: string) => value.trim().toLowerCase()

export type AuthVerificationRecord = Readonly<{
  entity_id?: string
  entity_type?: string
  verified_at?: string | Date | null
  deleted_at?: string | Date | null
}>

export const verifiedEmailForActor = (input: Readonly<{
  actorType?: string
  actorId?: string
  authIdentityId?: string
  authProvider?: string
  authenticatedEmail?: string
  providerIdentityEmail?: string
  verifications: readonly AuthVerificationRecord[]
}>) => {
  if (!input.actorType || !input.actorId || !input.authIdentityId || !input.authProvider || !input.authenticatedEmail || !input.providerIdentityEmail) return null
  const email = normalizeEmail(input.authenticatedEmail)
  if (!email || normalizeEmail(input.providerIdentityEmail) !== email) return null
  return input.verifications.some((verification) =>
    verification.entity_type === "email" &&
    !verification.deleted_at &&
    Boolean(verification.verified_at) &&
    typeof verification.entity_id === "string" &&
    normalizeEmail(verification.entity_id) === email
  ) ? email : null
}

export const deriveInvitationToken = (invitationId: string) =>
  createHmac("sha256", invitationSecret())
    .update(`dogruadres-invitation:v1:${invitationId}`)
    .digest("base64url")

export const hashInvitationToken = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex")

export const invitationTokenMatches = (token: string, expectedHash: string) => {
  const actual = Buffer.from(hashInvitationToken(token), "hex")
  const expected = Buffer.from(expectedHash, "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export const isOwnerDemotionAllowed = (activeProtectedOwnerCount: number) =>
  Number.isInteger(activeProtectedOwnerCount) && activeProtectedOwnerCount > 1

export const canManageMembership = (status: string) => status === "active"
