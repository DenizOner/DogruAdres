import { OrderProductListItem } from "@/components/cells"
import type { HttpTypes } from "@medusajs/types"

export const OrderParcelItems = ({
  items,
  currency_code,
}: {
  items: HttpTypes.StoreOrderLineItem[]
  currency_code: string
}) => {
  return (
    <>
      {items.map((item) => (
        <OrderProductListItem
          key={item.id + item.variant_id}
          item={item}
          currency_code={currency_code}
        />
      ))}
    </>
  )
}
