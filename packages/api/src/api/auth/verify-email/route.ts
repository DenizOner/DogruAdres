import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { createHash } from "node:crypto"
import { z } from "@medusajs/framework/zod"

export const AUTHENTICATE = false

const tokenQuerySchema = z.object({
  token: z.string().min(1).max(512),
})

const tokenBodySchema = z.object({
  token: z.string().min(1).max(512),
}).strict()

const DEFAULT_TTL_MS = 15 * 60 * 1000 // 15 minutes default TTL in Medusa TokenVerificationProvider

/**
 * GET /auth/verify-email?token=<token>
 * 
 * Safe GET landing inspection:
 * - Computes SHA-256 hash of candidate token
 * - Looks up verification record in auth_verification without mutating state
 * - Protects against automated email link scanners (e.g. Outlook SafeLinks, Gmail scanners)
 * - Returns current status: "pending", "consumed", "expired", or "invalid"
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
  res.setHeader("Referrer-Policy", "no-referrer")

  const parsed = tokenQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      status: "invalid",
      message: "A valid token query parameter is required",
    })
  }

  const rawToken = parsed.data.token
  const tokenHash = createHash("sha256").update(rawToken).digest("hex")

  try {
    const pgConnection = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION, {
      allowUnregistered: true,
    })

    if (!pgConnection) {
      return res.status(503).json({
        ok: false,
        status: "unavailable",
        message: "Database service unavailable",
      })
    }

    const rows = await pgConnection("auth_verification")
      .select("id", "verified_at", "requested_at")
      .whereRaw("provider_metadata->>'token_hash' = ?", [tokenHash])
      .whereNull("deleted_at")
      .limit(1)

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        ok: false,
        status: "invalid",
        message: "Verification token is invalid or does not exist",
      })
    }

    const verification = rows[0]
    const requestedAtMs = new Date(verification.requested_at).getTime()
    const expiresAt = new Date(requestedAtMs + DEFAULT_TTL_MS)

    if (verification.verified_at) {
      return res.status(200).json({
        ok: true,
        status: "consumed",

        message: "Verification link has already been used",
      })
    }

    if (Date.now() > expiresAt.getTime()) {
      return res.status(200).json({
        ok: true,
        status: "expired",

        message: "Verification link has expired",
      })
    }

    return res.status(200).json({
      ok: true,
      status: "pending",

    })
  } catch (err) {
    return res.status(500).json({
      ok: false,
      status: "error",
      message: "Internal error inspecting verification status",
    })
  }
}

/**
 * POST /auth/verify-email
 * 
 * Explicit user confirmation action:
 * - Requires explicit user submission (button click)
 * - Invokes native Medusa auth.confirmAuthVerification
 * - Sets verified_at timestamp on auth_verification record
 * - Fails closed on replay, expiry, or invalid token
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
  res.setHeader("Referrer-Policy", "no-referrer")

  const parsed = tokenBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      status: "invalid",
      message: "A valid token string in the request body is required",
    })
  }

  const rawToken = parsed.data.token

  try {
    const authService: IAuthModuleService = req.scope.resolve(Modules.AUTH)

    await authService.confirmAuthVerification({
      code: rawToken,
      code_provider: "token",
    })

    return res.status(200).json({
      ok: true,
      status: "confirmed",

      message: "Email address successfully verified",
    })
  } catch (err: any) {
    const message: string = err.message || ""

    if (message.includes("expired")) {
      return res.status(410).json({
        ok: false,
        status: "expired",
        message: "Verification link has expired",
      })
    }

    if (message.includes("already used") || message.includes("invalid")) {
      return res.status(409).json({
        ok: false,
        status: "consumed",
        message: "Verification link is invalid or already used",
      })
    }

    return res.status(400).json({
      ok: false,
      status: "failed",
      message: "Verification could not be completed",
    })
  }
}
