/**
 * Fail closed on the exact Vite head-prepend policy emitted by DoğruAdres.
 * A substring check could accept comments, late policies, and connect-src
 * with external hosts appended after 'self'.
 * A meta policy only applies to content that follows it.
 */
export function hasSafeDashboardCsp(html) {
  if (typeof html !== 'string') return false
  const head = /<head(?:\s[^>]*)?>/i.exec(html)
  if (!head) return false
  const beforeHead = html.slice(0, head.index)
  // An early active resource must not execute before the policy is parsed.
  if (/<\s*(?:script|link|meta|style|iframe|img)\b/i.test(beforeHead)) return false
  const insideHead = html.slice(head.index + head[0].length)
  // Vite's head-prepend policy must be the FIRST element in <head>.
  // Exact contents reject appended origins, wildcards and comment lookalikes.
  return /^\s*<meta\s+http-equiv="Content-Security-Policy"\s+content="connect-src &#39;self&#39;"\s*\/?>/i.test(insideHead)
}
