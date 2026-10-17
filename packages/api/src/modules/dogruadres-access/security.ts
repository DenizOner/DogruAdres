import { createHash, createHmac, timingSafeEqual } from "node:crypto"

const invitationSecret = () => {
  const value = process.env.DOGRUADRES_INVITATION_SECRET
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("DOGRUADRES_INVITATION_SECRET must be configured with at least 32 bytes")
  }
  return value
}

export const normalizeEmail = (value: string) => value.trim().toLowerCase()

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
