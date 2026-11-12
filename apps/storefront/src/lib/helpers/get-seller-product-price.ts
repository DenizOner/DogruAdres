import { convertToLocale } from "./money"

type SellerVariantPrice = {
  amount: number
  currency_code: string
}

type SellerVariant = {
  id: string
  sku?: string | null
  prices?: SellerVariantPrice[] | null
}

type SellerProduct = {
  id: string
  variants?: SellerVariant[] | null
}

type PricedSellerVariant = SellerVariant & {
  prices: [SellerVariantPrice, ...SellerVariantPrice[]]
}

export const getPricesForVariant = (variant: SellerVariant | null | undefined) => {
  const price = variant?.prices?.[0]
  if (!price?.amount) {
    return null
  }

  return {
    calculated_price_number: price.amount,
    calculated_price: convertToLocale({
      amount: price.amount,
      currency_code: price.currency_code,
    }),
    original_price_number: price.amount,
    original_price: convertToLocale({
      amount: price.amount,
      currency_code: price.currency_code,
    }),
  }
}

export function getSellerProductPrice({
  product,
  variantId,
}: {
  product: SellerProduct | null | undefined
  variantId?: string
}) {
  if (!product || !product.id) {
    throw new Error("No product provided")
  }

  const cheapestPrice = () => {
    if (!product || !product.variants?.length) {
      return null
    }

    const cheapestVariant = product.variants
      .filter((v): v is PricedSellerVariant => !!v.prices?.[0])
      .sort((a, b) => a.prices[0].amount - b.prices[0].amount)[0]

    return getPricesForVariant(cheapestVariant)
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
  }
}
