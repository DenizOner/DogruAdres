import { HttpTypes } from "@medusajs/types"
import { getPercentageDiff } from "./get-precentage-diff"
import { convertToLocale } from "./money"

// Preserve the legacy fallback sort if a variant includes the old
// calculated_amount field. Native prices live in calculated_price.
type LegacyPricedVariant = HttpTypes.StoreProductVariant & {
  calculated_amount?: number
}

export const getPricesForVariant = (
  variant: HttpTypes.StoreProductVariant | null | undefined
) => {
  const price = variant?.calculated_price
  if (!price?.calculated_amount_with_tax && !price?.calculated_amount) {
    return null
  }

  // Native Medusa price numbers can be null. Never display an invented
  // zero or NaN when the selected price set is incomplete.
  if (
    typeof price.calculated_amount !== "number" ||
    typeof price.calculated_amount_without_tax !== "number" ||
    typeof price.original_amount !== "number" ||
    typeof price.currency_code !== "string"
  ) {
    return null
  }

  if (!price.calculated_amount_with_tax) {
    return {
      calculated_price_number: price.calculated_amount,
      calculated_price: convertToLocale({
        amount: price.calculated_amount,
        currency_code: price.currency_code,
      }),
      calculated_price_without_tax: convertToLocale({
        amount: price.calculated_amount_without_tax,
        currency_code: price.currency_code,
      }),
      calculated_price_without_tax_number:
        price.calculated_amount_without_tax,
      original_price_number: price.original_amount,
      original_price: convertToLocale({
        amount: price.original_amount,
        currency_code: price.currency_code,
      }),
      currency_code: price.currency_code,
      price_type: price.calculated_price?.price_list_type ?? null,
      percentage_diff: getPercentageDiff(
        price.original_amount,
        price.calculated_amount
      ),
    }
  }

  if (typeof price.original_amount_with_tax !== "number") {
    return null
  }

  return {
    calculated_price_number:
      price.calculated_amount_with_tax,
    calculated_price: convertToLocale({
      amount: price.calculated_amount_with_tax,
      currency_code: price.currency_code,
    }),
    calculated_price_without_tax: convertToLocale({
      amount: price.calculated_amount_without_tax,
      currency_code: price.currency_code,
    }),
    calculated_price_without_tax_number:
      price.calculated_amount_without_tax,
    original_price_number: price.original_amount_with_tax,
    original_price: convertToLocale({
      amount: price.original_amount_with_tax,
      currency_code: price.currency_code,
    }),
    currency_code: price.currency_code,
    price_type: price.calculated_price?.price_list_type ?? null,
    percentage_diff: getPercentageDiff(
      price.original_amount,
      price.calculated_amount
    ),
  }
}

export function getProductPrice({
  product,
  variantId,
}: {
  product: HttpTypes.StoreProduct
  variantId?: string
}) {
  if (!product || !product.id) {
    throw new Error("No product provided")
  }

  const cheapestVariant = () => {
    if (!product || !product.variants?.length) {
      return null
    }

    return product.variants
      .filter((v) => !!v.calculated_price)
      .sort((a: LegacyPricedVariant, b: LegacyPricedVariant) => {
        const aWithTax = a.calculated_price?.calculated_amount_with_tax
        const bWithTax = b.calculated_price?.calculated_amount_with_tax
        return aWithTax && bWithTax
          ? aWithTax - bWithTax
          : (a.calculated_amount ?? Number.NaN) -
              (b.calculated_amount ?? Number.NaN)
      })[0]
  }

  const cheapestPrice = () => {
    if (!product || !product.variants?.length) {
      return null
    }

    const variant = cheapestVariant()

    return getPricesForVariant(variant)
  }

  const variantPrice = () => {
    if (!product || !variantId) {
      return null
    }

    const variant = product.variants?.find(
      (v) => v.id === variantId || v.sku === variantId
    )

    if (!variant) {
      return null
    }

    return getPricesForVariant(variant)
  }

  return {
    product,
    cheapestPrice: cheapestPrice(),
    variantPrice: variantPrice(),
    cheapestVariant: cheapestVariant(),
  }
}
