import { Card } from "@/components/atoms"
import type { HttpTypes } from "@medusajs/types"

export const OrderTrack = ({ order }: { order: HttpTypes.StoreOrder }) => {
  const labels = order.fulfillments?.[0]?.labels
  if (!labels?.length) return null

  return (
    <div>
      <h2 className="text-primary label-lg uppercase">Order Tracking</h2>
      <ul className="mt-4">
        {labels.map((item) => (
          <li key={item.id}>
            <a href={item.tracking_number} target="_blank">
              <Card className="px-4 hover:bg-secondary/30">
                {item.tracking_number}
              </Card>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
