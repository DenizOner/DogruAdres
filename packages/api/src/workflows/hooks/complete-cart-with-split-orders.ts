import { MedusaError } from "@medusajs/framework/utils"
import { completeCartWithSplitOrdersWorkflow } from "@mercurjs/core/workflows"
import { DOGRUADRES_ACCESS_MODULE } from "../../modules/dogruadres-access"

type CheckoutCartSnapshot = {
  id?: unknown
  completed_at?: unknown
  customer?: { id?: unknown } | null
  items?: Array<{
    id?: unknown
    offer?: { id?: unknown; seller_id?: unknown } | null
  }> | null
}

type CheckoutFoundation = {
  authorizeBuyerCheckout(
    cartId: string,
    customerId: string,
    sellerIds: string[]
  ): Promise<boolean>
}

type NativeSellerService = {
  listSellers(filter: { id: string }): Promise<Array<{
    id: string
    status: string
    approved_at?: Date | string | null
  }>>
}

const denialMessage = "B22_CHECKOUT_AUTHORIZATION_DENIED"

function denyCheckout(): never {
  throw new MedusaError(MedusaError.Types.FORBIDDEN, denialMessage)
}

/**
 * B22 final pre-write authorization. Mercur calls this validate hook after
 * its native Cart lock and Cart/payment reads, before OrderGroup/order writes.
 * Native Seller lifecycle is read first; Foundation then performs the single
 * coherent final snapshot (L) for Person/Buyer grant, immutable Cart
 * attribution, verified Customer binding, Store origin and per-Buyer blocks.
 */
completeCartWithSplitOrdersWorkflow.hooks.validate(
  async ({ cart }: { cart: CheckoutCartSnapshot }, { container }) => {
    try {
      if (
        typeof cart?.id !== "string" ||
        !/^cart_[A-Za-z0-9_-]{1,123}$/.test(cart.id) ||
        cart.completed_at != null ||
        typeof cart.customer?.id !== "string" ||
        !/^cus_[A-Za-z0-9_-]+$/.test(cart.customer.id) ||
        !Array.isArray(cart.items) ||
        cart.items.length < 1 ||
        cart.items.length > 50
      ) {
        denyCheckout()
      }

      const itemIds = new Set<string>()
      const sellerIds = new Set<string>()
      for (const item of cart.items) {
        if (
          !item ||
          typeof item.id !== "string" ||
          itemIds.has(item.id) ||
          !item.offer ||
          typeof item.offer.id !== "string" ||
          !/^offer_[A-Za-z0-9_-]+$/.test(item.offer.id) ||
          typeof item.offer.seller_id !== "string" ||
          !/^sel_[A-Za-z0-9_-]+$/.test(item.offer.seller_id)
        ) {
          denyCheckout()
        }
        itemIds.add(item.id)
        sellerIds.add(item.offer.seller_id)
      }

      const orderedSellerIds = [...sellerIds].sort()
      if (!orderedSellerIds.length || orderedSellerIds.length > 50) {
        denyCheckout()
      }

      // Mercur Seller lifecycle is a separate native module source. A Seller
      // must be uniquely present, open and approved before Foundation's L.
      const nativeSellers = container.resolve<NativeSellerService>("seller")
      for (const sellerId of orderedSellerIds) {
        const rows = await nativeSellers.listSellers({ id: sellerId })
        if (
          rows.length !== 1 ||
          rows[0].id !== sellerId ||
          rows[0].status !== "open" ||
          !rows[0].approved_at
        ) {
          denyCheckout()
        }
      }

      const foundation = container.resolve<CheckoutFoundation>(
        DOGRUADRES_ACCESS_MODULE
      )
      const authorized = await foundation.authorizeBuyerCheckout(
        cart.id,
        cart.customer.id,
        orderedSellerIds
      )
      if (!authorized) {
        denyCheckout()
      }
    } catch (error) {
      if (error instanceof MedusaError && error.message === denialMessage) {
        throw error
      }
      // Any unavailable, malformed or inconsistent source is a denial. Never
      // allow a checkout because a module/query/provider failed unexpectedly.
      denyCheckout()
    }
  }
)
