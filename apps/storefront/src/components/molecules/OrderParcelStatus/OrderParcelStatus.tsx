import { StepProgressBar } from "@/components/cells/StepProgressBar/StepProgressBar"
import { parcelStatuses, steps } from "@/lib/helpers/parcel-statuses"

export const OrderParcelStatus = ({ order }: { order: { fulfillment_status: Parameters<typeof parcelStatuses>[0] } }) => {
  const currentStep = parcelStatuses(order.fulfillment_status)

  return (
    <div>
      <StepProgressBar steps={steps} currentStep={currentStep} />
    </div>
  )
}
