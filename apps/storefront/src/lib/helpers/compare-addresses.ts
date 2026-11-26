import { isEqual, pick } from "lodash"

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

export default function compareAddresses(
  address1: object | null | undefined,
  address2: object | null | undefined
) {
  if (!address1 || !address2) return false
  return isEqual(
    pick(address1, ADDRESS_COMPARE_FIELDS),
    pick(address2, ADDRESS_COMPARE_FIELDS)
  )
}
