export const ADDRESS_COMPARE_FIELDS = [
  "first_name",
  "last_name",
  "address_1",
  "address_2",
  "company",
  "postal_code",
  "city",
  "country_code",
  "province",
  "phone",
] as const

/**
 * Normalizes address field values for resilient comparison (#164).
 * Treats null, undefined, and empty/whitespace strings as identical empty values,
 * and normalizes casing (e.g., country codes 'tr' vs 'TR').
 */
export const normalizeAddressValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ""
  }
  return String(value).trim().toLowerCase()
}

export default function compareAddresses(
  address1: object | null | undefined,
  address2: object | null | undefined
): boolean {
  if (!address1 || !address2) return false

  const rec1 = address1 as Record<string, unknown>
  const rec2 = address2 as Record<string, unknown>

  return ADDRESS_COMPARE_FIELDS.every(
    (field) => normalizeAddressValue(rec1[field]) === normalizeAddressValue(rec2[field])
  )
}
