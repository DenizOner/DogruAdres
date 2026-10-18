/** Resolve HTTP auth secrets without using scaffold defaults in production. */
type HttpSecretEnvironment = {
  NODE_ENV?: string
  JWT_SECRET?: string
  COOKIE_SECRET?: string
}

const DEVELOPMENT_FALLBACK = "supersecret"
const PLACEHOLDER_MARKERS = /(supersecret|change.?me|placeholder|example.?secret|sample.?secret|password|123456)/i

function isUnacceptableProductionSecret(value: string | undefined): boolean {
  if (!value || value.trim() !== value) return true
  if (Buffer.byteLength(value, "utf8") < 32) return true
  if (PLACEHOLDER_MARKERS.test(value)) return true
  // A long repeated character is not a random secret.
  if ([...value].every((character) => character === value[0])) return true
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
