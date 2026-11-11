import { OrderAddresses } from "@/components/organisms/OrderAddresses/OrderAddresses"
import { OrderParcels } from "@/components/organisms/OrderParcels/OrderParcels"
import { OrderTotals } from "@/components/organisms/OrderTotals/OrderTotals"
import type { HttpTypes } from "@medusajs/types"
import type { SellerDTO } from "@mercurjs/types"

export const OrderDetailsSection = ({ orderGroup }: { orderGroup: {
  orders: Array<HttpTypes.StoreOrder & { seller?: SellerDTO }>
  total?: number | null
  currency_code?: string | null
} }) => {
  return (
    <div>
      <OrderParcels orders={orderGroup.orders} />
      <OrderTotals orderGroup={orderGroup} />
    </div>
  )
}
