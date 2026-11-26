import type { HttpTypes } from "@medusajs/types"
import { Button, Card } from "@/components/atoms"
import { convertToLocale } from "@/lib/helpers/money"
import Image from "@/components/molecules/SafeImage/SafeImage"
import {
  calculateEstimatedSubtotal,
  getReturnButtonState,
  REFUND_DISCLAIMER_TEXT,
} from "./order-return-utils"

export { calculateEstimatedSubtotal, getReturnButtonState, REFUND_DISCLAIMER_TEXT }

export const ReturnSummaryTab = ({
  selectedItems,
  items,
  currency_code,
  handleTabChange,
  tab,
  returnMethod,
  handleSubmit,
  isSubmitting = false,
  submitError = null,
}: {
  selectedItems: Array<{ line_item_id: string }>
  items: HttpTypes.StoreOrderLineItem[]
  currency_code: string
  handleTabChange: (tab: number) => void
  tab: number
  returnMethod: string | null
  handleSubmit: () => void
  isSubmitting?: boolean
  submitError?: string | null
}) => {
  const selected = items.filter((item) =>
    selectedItems.some((i) => i.line_item_id === item.id)
  )

  // IR-11: Robust calculation of estimated item subtotal
  const subtotal = calculateEstimatedSubtotal(
    items,
    selectedItems.map((i) => i.line_item_id)
  )

  // IR-10: Button state management & double submit protection
  const { isDisabled, buttonText } = getReturnButtonState(
    tab,
    selected.length,
    returnMethod,
    isSubmitting
  )

  return (
    <div className="sm:mt-20">
      {selected.length ? (
        <Card className="p-4">
          <ul>
            {selected.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 mb-4 justify-between w-full"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <div className="w-16 rounded-sm border">
                    {item.thumbnail ? (
                      <Image
                        src={item.thumbnail}
                        alt={item.subtitle ?? "Returned item"}
                        width={64}
                        height={64}
                        className="rounded-sm"
                      />
                    ) : (
                      <Image
                        src={"/images/placeholder.svg"}
                        alt={item.subtitle ?? "Returned item"}
                        width={64}
                        height={64}
                        className="opacity-25 scale-75"
                      />
                    )}
                  </div>
                  {item.subtitle}
                </div>
                <div>
                  {convertToLocale({
                    amount:
                      typeof item.subtotal === "number"
                        ? item.subtotal
                        : (item.unit_price ?? 0) * (item.quantity ?? 1),
                    currency_code,
                  })}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-4">
        {/* IR-10: Accessible, prominent feedback banner for submission errors */}
        {submitError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-4 p-3 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium"
          >
            {submitError}
          </div>
        )}

        {/* IR-11: Clear estimated item subtotal labeling with explanatory disclosure */}
        <div className="mb-4">
          <div className="flex justify-between items-baseline mb-1">
            <span className="label-md text-secondary">
              Estimated item subtotal:
            </span>
            <span className="label-md !font-bold text-primary">
              {convertToLocale({
                amount: subtotal,
                currency_code,
              })}
            </span>
          </div>
          <p className="text-[11px] text-secondary leading-tight">
            {REFUND_DISCLAIMER_TEXT}
          </p>
        </div>

        {/* IR-10: Disable button during active submission to prevent duplicate requests */}
        <Button
          className="label-md w-full uppercase"
          disabled={isDisabled}
          onClick={
            tab === 0 ? () => handleTabChange(1) : () => handleSubmit()
          }
        >
          {buttonText}
        </Button>
      </Card>
    </div>
  )
}
