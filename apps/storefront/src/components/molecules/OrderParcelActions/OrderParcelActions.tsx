import { OrderReturn } from "@/components/cells/OrderReturn/OrderReturn"
import { OrderTrack } from "@/components/cells/OrderTrack/OrderTrack"
import type { HttpTypes } from "@medusajs/types"

export const OrderParcelActions = ({ order }: { order: HttpTypes.StoreOrder }) => {
  if (order.fulfillment_status === "delivered")
    return <OrderReturn order={order} />

  if (order.fulfillment_status === "shipped")
    return <OrderTrack order={order} />

  return null
}
