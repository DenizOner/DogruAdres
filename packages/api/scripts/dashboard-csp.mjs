/**
 * Fail closed on the exact Vite head-prepend policy emitted by DoğruAdres.
 * A substring check could accept comments, late policies, and connect-src
 * with external hosts appended after 'self'.
 * A meta policy only applies to content that follows it.
 */
export function hasSafeDashboardCsp(html) {
  if (typeof html !== 'string') return false
  // Require the expected document prelude, not the first substring that
  // happens to look like <head> (including one inside an HTML comment).
  // The Vite-built Admin and Vendor entrypoints have this exact structure.
  const prefix = /^\s*<!doctype\s+html>\s*<html(?:\s[^>]*)?>\s*<head(?:\s[^>]*)?>\s*/i.exec(html)
  if (!prefix) return false
  const insideHead = html.slice(prefix[0].length)
  // Vite's head-prepend policy must be the FIRST element in <head>.
  // Exact contents reject appended origins, wildcards and comment lookalikes.
  return /^\s*<meta\s+http-equiv="Content-Security-Policy"\s+content="connect-src &#39;self&#39;"\s*\/?>/i.test(insideHead)
}
