export type InvitationAcceptanceInput = Readonly<{
  status: "pending" | "accepted" | "revoked"
  expiresAt: Date
  recipientEmail: string
  verifiedEmail: string | null
  tokenMatches: boolean
  now: Date
}>

export function mayAcceptInvitation(input: InvitationAcceptanceInput) {
  const recipient = input.recipientEmail.trim().toLowerCase()
  const verified = input.verifiedEmail?.trim().toLowerCase()
  return input.status === "pending" &&
    input.expiresAt.getTime() > input.now.getTime() &&
    Boolean(recipient) &&
    Boolean(verified) &&
    recipient === verified &&
    input.tokenMatches
}
