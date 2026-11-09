/**
 * Public reset links use /reset-password directly so real Next.js Server
 * Actions return to their defining route without a middleware rewrite.
 * Reuse the approved form and metadata used by the localized route.
 */
export { default, metadata } from "../[locale]/(reset-password)/reset-password/page"
