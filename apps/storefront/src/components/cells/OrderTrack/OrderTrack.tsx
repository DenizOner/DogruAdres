import { Card } from "@/components/atoms"
import type { HttpTypes } from "@medusajs/types"

export const OrderTrack = ({ order }: { order: HttpTypes.StoreOrder }) => {
  const fulfillment = order.fulfillments?.[0]
  // Tracking labels are an optional marketplace extension to native Medusa.
  // A malformed or absent label cannot become a clickable tracking link.
  const labels =
    fulfillment && "labels" in fulfillment && Array.isArray(fulfillment.labels)
      ? fulfillment.labels.filter(
          (label: unknown): label is { id: string; tracking_number: string } =>
            typeof label === "object" &&
            label !== null &&
            "id" in label &&
            typeof label.id === "string" &&
            "tracking_number" in label &&
            typeof label.tracking_number === "string"
        )
      : []
  if (!labels.length) return null

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
