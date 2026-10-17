export type InvitationAcceptanceInput = Readonly<{
  status: "pending" | "accepted" | "revoked"
  expiresAt: Date
  recipientEmail: string
  verifiedEmail: string | null
  tokenMatches: boolean
  now: Date
}>

export function mayAcceptInvitation(input: InvitationAcceptanceInput) {
  return input.status === "pending" &&
    input.expiresAt.getTime() > input.now.getTime() &&
    input.verifiedEmail !== null &&
    input.recipientEmail.trim().toLowerCase() === input.verifiedEmail.trim().toLowerCase() &&
    input.tokenMatches
}
