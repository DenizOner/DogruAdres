"use client"

import { Button, Checkbox, Divider } from "@/components/atoms"
import { Modal } from "@/components/molecules"
import { useState } from "react"
import Image from "@/components/molecules/SafeImage/SafeImage"
import { convertToLocale } from "@/lib/helpers/money"
import { cn } from "@/lib/utils"
import type { HttpTypes } from "@medusajs/types"
import {
  CANCELLATION_DISABLED_DISCLAIMER,
  getOrderCancelButtonState,
} from "./order-cancel-utils"

export { CANCELLATION_DISABLED_DISCLAIMER, getOrderCancelButtonState }

type OrderItem = NonNullable<HttpTypes.StoreOrder["items"]>[number]

export interface OrderCancelProps {
  order: HttpTypes.StoreOrder
  isCancellationAvailable?: boolean
  onCancelRequest?: (
    selectedItems: OrderItem[]
  ) => Promise<{ success: boolean; message?: string }>
}

export const OrderCancel = ({
  order,
  isCancellationAvailable = false,
  onCancelRequest,
}: OrderCancelProps) => {
  const [open, setOpen] = useState(false)
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleCancel = async () => {
    // IR-09: Prevent fake / no-op submissions and double clicks
    if (!isCancellationAvailable || isSubmitting || selectedItems.length === 0) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (onCancelRequest) {
        const result = await onCancelRequest(selectedItems)
        if (!result.success) {
          setError(result.message || "Cancellation request failed.")
          return
        }
      }

      setOpen(false)
      setSelectedItems([])
      setSuccessMessage(
        "Cancellation request submitted. The seller will review your request before dispatch."
      )
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while requesting cancellation."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectItem = (item: OrderItem) => {
    if (selectedItems.some((i) => i.id === item.id)) {
      setSelectedItems(selectedItems.filter((i) => i.id !== item.id))
    } else {
      setSelectedItems([...selectedItems, item])
    }
  }

  const handleChangeQuantity = (item: OrderItem, quantity: number) => {
    const itemline = selectedItems.find((i) => i.id === item.id)
    if (itemline) {
      itemline.quantity += quantity
      setSelectedItems([...selectedItems])
    }
  }

  const { isDisabled, buttonText } = getOrderCancelButtonState(
    selectedItems.length,
    isCancellationAvailable,
    isSubmitting
  )

  return (
    <>
      <div className="md:flex justify-between items-center">
        <div className="mb-4 md:mb-0">
          <h2 className="text-primary label-lg uppercase">Cancel Order</h2>
          <p className="text-secondary label-md max-w-sm">
            {isCancellationAvailable
              ? "Once you place your order, you can cancel it until the seller begins preparation for shipment."
              : CANCELLATION_DISABLED_DISCLAIMER}
          </p>
        </div>
        <Button
          variant="tonal"
          className="uppercase"
          disabled={!isCancellationAvailable}
          onClick={() => {
            if (isCancellationAvailable) setOpen(true)
          }}
          title={
            !isCancellationAvailable
              ? "Self-service cancellation is disabled"
              : undefined
          }
        >
          {isCancellationAvailable ? "Cancel" : "Unavailable"}
        </Button>
      </div>

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 p-3 rounded bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 text-xs font-medium"
        >
          {successMessage}
        </div>
      )}

      {open && (
        <Modal
          heading="Select items you want to cancel"
          onClose={() => {
            if (!isSubmitting) setOpen(false)
          }}
        >
          <div>
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mx-4 mb-3 p-3 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium"
              >
                {error}
              </div>
            )}

            <ul className="px-4">
              {(order.items ?? []).map((item: OrderItem) => {
                const isSelected = selectedItems.some((i) => i.id === item.id)
                const itemline = selectedItems.find((i) => i.id === item.id)
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-center gap-4 p-4 mb-2 rounded-sm",
                      isSelected && "bg-secondary/70"
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleSelectItem(item)}
                    />
                    <div className="flex gap-4 w-full">
                      <div className="w-16 rounded-sm border">
                        {item.thumbnail ? (
                          <Image
                            src={item.thumbnail}
                            alt={item.subtitle ?? "Product"}
                            width={60}
                            height={60}
                            className="rounded-sm"
                          />
                        ) : (
                          <Image
                            src={"/images/placeholder.svg"}
                            alt={item.subtitle ?? "Product"}
                            width={60}
                            height={60}
                            className="opacity-25 scale-75"
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-2 w-full">
                        <div className="col-span-2">
                          <p className="text-primary label-md truncate w-full">
                            {item.subtitle}
                          </p>
                          <p className="text-secondary label-sm truncate w-full">
                            {item.title}
                          </p>
                        </div>
                        <div className="flex items-center justify-center">
                          {isSelected && (
                            <div className="flex items-center mt-2">
                              <Button
                                variant="text"
                                className="w-8 h-8 flex items-center justify-center !bg-transparent !hover:bg-secondary"
                                disabled={item.quantity === 1 || isSubmitting}
                                onClick={() => handleChangeQuantity(item, -1)}
                              >
                                -
                              </Button>
                              <div className="text-primary font-medium border rounded-sm w-8 h-8 text-center flex items-center justify-center bg-primary">
                                {item.quantity}
                              </div>
                              <Button
                                variant="text"
                                className="w-8 h-8 flex items-center justify-center !bg-transparent !hover:bg-secondary"
                                disabled={
                                  item.quantity === itemline?.quantity ||
                                  isSubmitting
                                }
                                onClick={() => handleChangeQuantity(item, 1)}
                              >
                                +
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-end">
                          <p className="text-primary label-lg">
                            {typeof item.total === "number"
                              ? convertToLocale({
                                  amount: item.total,
                                  currency_code: order.currency_code,
                                })
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            <Divider className="my-4" />
            <div className="px-4">
              <Button
                className="uppercase w-full"
                disabled={isDisabled}
                onClick={handleCancel}
              >
                {buttonText}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
