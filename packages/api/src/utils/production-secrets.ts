/** Resolve HTTP auth secrets without using scaffold defaults in production. */
type HttpSecretEnvironment = {
  NODE_ENV?: string
  JWT_SECRET?: string
  COOKIE_SECRET?: string
}

const DEVELOPMENT_FALLBACK = "supersecret"
const PLACEHOLDER_MARKERS = /(supersecret|change.?me|placeholder|example.?secret|sample.?secret|password|123456)/i

// Reject obvious deterministic/repeated patterns, not a substitute for CSPRNG entropy.
function hasRepeatedShortMotif(value: string): boolean {
  for (let length = 1; length <= 8 && length <= value.length / 2; length++) {
    if (value.length % length === 0 && value.slice(0, length).repeat(value.length / length) === value) {
      return true
    }
  }
  return false
}

function isUnacceptableProductionSecret(value: string | undefined): boolean {
  if (!value || value.trim() !== value) return true
  if (Buffer.byteLength(value, "utf8") < 32) return true
  if (PLACEHOLDER_MARKERS.test(value)) return true
  if (hasRepeatedShortMotif(value)) return true
  return false
}

/**
 * Production config is evaluated at build time AND at runtime by Medusa.
 * The error must never contain submitted secret material.
 */
export function resolveHttpSecrets(env: HttpSecretEnvironment): {
  jwtSecret: string
  cookieSecret: string
} {
  if (env.NODE_ENV !== "production") {
    return {
      jwtSecret: env.JWT_SECRET || DEVELOPMENT_FALLBACK,
      cookieSecret: env.COOKIE_SECRET || DEVELOPMENT_FALLBACK,
    }
  }

  const jwtSecret = env.JWT_SECRET
  const cookieSecret = env.COOKIE_SECRET
  if (
    isUnacceptableProductionSecret(jwtSecret) ||
    isUnacceptableProductionSecret(cookieSecret) ||
    jwtSecret === cookieSecret
  ) {
    throw new Error(
      "Production requires distinct, non-placeholder JWT_SECRET and COOKIE_SECRET values of at least 32 bytes. " +
        "Set both for configuration evaluation at build time and at runtime."
    )
  }

  return { jwtSecret: jwtSecret!, cookieSecret: cookieSecret! }
}
