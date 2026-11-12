import { HttpTypes } from "@medusajs/types"

export interface Cart extends HttpTypes.StoreCart {
  // Keep the native StoreCartPromotion[] contract; do not make it optional.
  discount_subtotal?: number
}

// Minimal seller fields actually rendered by the existing cart header.
export type CartSellerHeader = {
  id: string
  name: string
  handle?: string
  photo?: string
  logo?: string | null
  created_at?: string | Date | null
}

// Mercur's offer/seller is an optional extension on native Medusa cart lines.
export type CartLineWithOffer = HttpTypes.StoreCartLineItem & {
  offer?: { seller?: CartSellerHeader | null } | null
}

export type CartItemsBySeller = Record<string, {
  seller: CartSellerHeader
  items: HttpTypes.StoreCartLineItem[]
}>

export interface StoreCartLineItemOptimisticUpdate
  extends Partial<HttpTypes.StoreCartLineItem> {
  tax_total: number
}
