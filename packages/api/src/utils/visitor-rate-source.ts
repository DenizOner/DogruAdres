import { createHmac, timingSafeEqual } from "node:crypto"
import { isIP } from "node:net"

// Only the first-party TLS front door issues this header. It is never copied
// from a public request. Address bytes are not exposed to the private API.
export const VISITOR_RATE_HEADER = "x-da-visitor-rate-v1"

function key(secret: string): string {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32)
    throw new Error("Visitor rate source requires the existing strong cookie secret")
  return secret
}
function mac(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", key(secret))
    .update("dogruadres:visitor-rate:v1\0"+purpose+"\0"+value).digest("base64url")
}

/** The external socket is authoritative; never use X-Forwarded-For here. */
export function signVisitorRateSource(
  remoteAddress: string | undefined, secret: string, method: string, path: string,
  now = Date.now()
): string {
  const address = remoteAddress?.startsWith("::ffff:") ? remoteAddress.slice(7) : remoteAddress
  if (!address || !isIP(address) || method !== "POST" ||
      !["/personal/register","/personal/session"].includes(path) ||
      !Number.isFinite(now)) throw new Error("Invalid visitor rate source")
  const minute = Math.floor(now/60000)
  const source = mac(secret,"source",address)
  const proof = mac(secret,"proof",minute+"\0"+method+"\0"+path+"\0"+source)
  return "v1."+minute+"."+source+"."+proof
}

/** A signed source can only be consumed via the private loopback connector. */
export function verifyVisitorRateSource(
  header: unknown, secret: string, method: string, path: string, now = Date.now()
): string | null {
  if (typeof header !== "string" || header.length > 120 || !Number.isFinite(now))
    return null
  const match = /^v1\.(\d{1,11})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(header)
  if (!match || method !== "POST" ||
      !["/personal/register","/personal/session"].includes(path)) return null
  const minute=Number(match[1])
  if (!Number.isSafeInteger(minute) || Math.abs(Math.floor(now/60000)-minute)>1)
    return null
  try {
    const expected=mac(secret,"proof",minute+"\0"+method+"\0"+path+"\0"+match[2])
    return timingSafeEqual(Buffer.from(expected),Buffer.from(match[3])) ? match[2] : null
  } catch { return null }
}
