import assert from "node:assert/strict"
import { test } from "node:test"
import type { HttpTypes } from "@medusajs/types"
import { getProductPrice } from "./get-product-price"

const variant = (
  id: string,
  calculated: number | null,
  withTax: number | null = null
): HttpTypes.StoreProductVariant =>
  ({
    id,
    sku: id,
    calculated_price: calculated === null
      ? null
      : {
          calculated_amount: calculated,
          calculated_amount_without_tax: calculated,
          calculated_amount_with_tax: withTax,
          original_amount: calculated,
          original_amount_with_tax: withTax,
          currency_code: "try",
        },
  }) as unknown as HttpTypes.StoreProductVariant

const product = (variants: HttpTypes.StoreProductVariant[]): HttpTypes.StoreProduct =>
  ({ id: "prod_159_fixture", variants }) as unknown as HttpTypes.StoreProduct

test("native Medusa tax-free prices sort by calculated_amount, not removed legacy amount", () => {
  const result = getProductPrice({ product: product([
    variant("expensive", 240),
    variant("cheapest", 90),
  ]) })
  assert.equal(result.cheapestVariant?.id, "cheapest")
  assert.equal(result.cheapestPrice?.calculated_price_number, 90)
})

test("native tax-inclusive and tax-free variants sort by the amount displayed", () => {
  const result = getProductPrice({ product: product([
    variant("taxed", 80, 115),
    variant("untaxed", 100),
    variant("highest", 125, 150),
  ]) })
  assert.equal(result.cheapestVariant?.id, "untaxed")
  assert.equal(result.cheapestPrice?.calculated_price_number, 100)
})

test("unpriced and non-finite variants cannot mask a valid price", () => {
  const result = getProductPrice({ product: product([
    variant("missing", null),
    variant("nan", Number.NaN),
    variant("infinity", Number.POSITIVE_INFINITY),
    variant("valid", 135),
  ]) })
  assert.equal(result.cheapestVariant?.id, "valid")
  assert.equal(result.cheapestPrice?.calculated_price_number, 135)
})

test("no valid Medusa price returns no cheapest variant or invented zero", () => {
  const result = getProductPrice({ product: product([
    variant("missing", null),
    variant("invalid", Number.NaN),
  ]) })
  assert.equal(result.cheapestVariant, null)
  assert.equal(result.cheapestPrice, null)
})
