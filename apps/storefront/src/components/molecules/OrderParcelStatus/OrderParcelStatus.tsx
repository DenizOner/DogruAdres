import { StepProgressBar } from "@/components/cells/StepProgressBar/StepProgressBar"
import { parcelStatuses, steps } from "@/lib/helpers/parcel-statuses"
import type { HttpTypes } from "@medusajs/types"

export const OrderParcelStatus = ({ order }: { order: Pick<HttpTypes.StoreOrder, "fulfillment_status"> }) => {
  const status = order.fulfillment_status
  const currentStep =
    status === "not_fulfilled" ||
    status === "fulfilled" ||
    status === "delivered" ||
    status === "shipped"
      ? parcelStatuses(status)
      : 0

  return (
    <div>
      <StepProgressBar steps={steps} currentStep={currentStep} />
    </div>
  )
}
