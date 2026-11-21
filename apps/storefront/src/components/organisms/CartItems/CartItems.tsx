import {
  CartItemsFooter,
  CartItemsHeader,
  CartItemsProducts,
} from "@/components/cells"
import { HttpTypes } from "@medusajs/types"
import type { CartItemsBySeller, CartLineWithOffer } from "@/types/cart"
import { EmptyCart } from "./EmptyCart"

export const CartItems = ({ cart }: { cart: HttpTypes.StoreCart | null }) => {
  if (!cart) return null

  const groupedItems = groupItemsBySeller(cart)

  if (!Object.keys(groupedItems).length) return <EmptyCart />

  return Object.keys(groupedItems).map((key) => (
    <div key={key} className="mb-4" data-testid={`cart-items-seller-${key}`}>
      <CartItemsHeader seller={groupedItems[key]?.seller} />
      <CartItemsProducts
        products={groupedItems[key].items || []}
        currency_code={cart.currency_code}
      />
      <CartItemsFooter
        currency_code={cart.currency_code}
        price={cart.shipping_subtotal}
      />
    </div>
  ))
}

function groupItemsBySeller(cart: HttpTypes.StoreCart) {
  const groupedBySeller: CartItemsBySeller = {}

  cart.items?.forEach((item: CartLineWithOffer) => {
    const seller = item.offer?.seller
    if (seller) {
      if (!groupedBySeller[seller.id]) {
        groupedBySeller[seller.id] = {
          seller: { ...seller, photo: seller.photo ?? seller.logo ?? undefined },
          items: [],
        }
      }
      groupedBySeller[seller.id].items.push(item)
    } else {
      if (!groupedBySeller["fleek"]) {
        groupedBySeller["fleek"] = {
          seller: {
            name: "Fleek",
            id: "fleek",
            photo: "/Logo.svg",
            created_at: new Date(),
          },
          items: [],
        }
      }
      groupedBySeller["fleek"].items.push(item)
    }
  })

  return groupedBySeller
}
