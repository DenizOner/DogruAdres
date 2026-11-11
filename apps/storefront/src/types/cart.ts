import { HttpTypes } from "@medusajs/types"

export interface Cart extends HttpTypes.StoreCart {
  // Keep the native StoreCartPromotion[] contract; do not make it optional.
  discount_subtotal?: number
}

export interface StoreCartLineItemOptimisticUpdate
  extends Partial<HttpTypes.StoreCartLineItem> {
  tax_total: number
}
