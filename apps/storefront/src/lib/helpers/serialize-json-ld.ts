/**
 * JSON-LD is still raw text inside an HTML <script> element.
 * JSON.stringify does not escape </script> embedded in product/category values.
 * Escape "<" so browser HTML parsing cannot terminate the script early.
 * This stays valid JSON: JSON.parse restores the original characters.
 */
export const serializeJsonLd = (value: Record<string, unknown>): string =>
  JSON.stringify(value).replace(/</g, "\\u003c")
