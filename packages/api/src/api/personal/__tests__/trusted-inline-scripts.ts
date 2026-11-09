/**
 * Read inline scripts only from the trusted, first-party HTML fixture returned by
 * the personal workspace route (or its source template). This is not an HTML
 * sanitizer, an XSS defense, or a parser for untrusted documents.
 */
export function trustedInlineScripts(html: string): string[] {
  const scripts: string[] = []
  let cursor = 0
  while (true) {
    const start = html.indexOf("<script", cursor)
    if (start === -1) return scripts
    const openEnd = html.indexOf(">", start)
    if (openEnd === -1) throw new Error("Unterminated trusted script start tag")
    const tag = html.slice(start, openEnd + 1)
    const prefix = '<script nonce="'
    // The source template has a literal ${nonce} placeholder; rendered pages
    // contain base64. No attributes other than this one nonce are permitted.
    const nonce = tag.startsWith(prefix) && tag.endsWith('">')
      ? tag.slice(prefix.length, -2)
      : ""
    const validNonce = nonce === '${nonce}' ||
      (nonce.length > 0 && [...nonce].every(ch =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='.includes(ch)))
    if (!validNonce) {
      throw new Error("Unexpected script tag in trusted fixture")
    }
    const close = html.indexOf("</script>", openEnd + 1)
    if (close === -1) throw new Error("Unterminated trusted script body")
    scripts.push(html.slice(openEnd + 1, close))
    cursor = close + "</script>".length
  }
}
