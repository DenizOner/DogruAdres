"use client"

import { Button } from "@/components/atoms"
import { UserNavigation } from "@/components/molecules"
import LocalizedClientLink from "@/components/molecules/LocalizedLink/LocalizedLink"
import { ArrowLeftIcon } from "@/icons"
import { ReturnItemsTab } from "./ReturnItemsTab"
import { useState } from "react"
import { ReturnSummaryTab } from "./ReturnSummaryTab"
import { ReturnMethodsTab } from "./ReturnMethodsTab"
import { StepProgressBar } from "@/components/cells/StepProgressBar/StepProgressBar"
import { createReturnRequest, type ReturnableStoreOrder } from "@/lib/data/orders"
import type { HttpTypes } from "@medusajs/types"
import { useRouter } from "next/navigation"

export const OrderReturnSection = ({
  order,
  returnReasons,
  shippingMethods,
}: {
  order: ReturnableStoreOrder
  returnReasons: HttpTypes.StoreReturnReason[]
  shippingMethods: unknown
}) => {
  const [tab, setTab] = useState(0)
  const [selectedItems, setSelectedItems] = useState<Array<{
    line_item_id: string
    quantity: number
    reason_id: string
  }>>([])
  const [error, setError] = useState<boolean>(false)
  const [returnMethod, setReturnMethod] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const router = useRouter()

  const handleTabChange = (tab: number) => {
    const noReason = selectedItems.filter((item) => !item.reason_id)
    if (!noReason.length) {
      setTab(tab)
    } else {
      setError(true)
    }
  }

  const handleSetReturnMethod = (method: string) => {
    setReturnMethod(method)
  }

  const handleSelectItem = (item: HttpTypes.StoreOrderLineItem, reason_id: string = "") => {
    setError(false)
    setSubmitError(null)
    if (!reason_id && selectedItems.some((i) => i.line_item_id === item.id)) {
      setSelectedItems(selectedItems.filter((i) => i.line_item_id !== item.id))
    } else {
      const itemToChange = selectedItems.find((i) => i.line_item_id === item.id)
      if (itemToChange) {
        setSelectedItems(
          selectedItems.map((i) =>
            i.line_item_id === item.id ? { ...i, reason_id } : i
          )
        )
      } else {
        setSelectedItems([
          ...selectedItems,
          { line_item_id: item.id, quantity: item.quantity, reason_id },
        ])
      }
    }
  }

  const handleSubmit = async () => {
    // IR-10: Prevent double submit / duplicate concurrent requests
    if (isSubmitting) return

    setSubmitError(null)
    setIsSubmitting(true)

    try {
      const data = {
        order_id: order.id,
        customer_note: "",
        shipping_option_id: returnMethod,
        line_items: selectedItems,
      }

      const response = await createReturnRequest(data)
      const returnRequestId = response?.order_return_request?.id

      if (!returnRequestId) {
        setSubmitError("Return request could not be processed. Please try again.")
        setIsSubmitting(false)
        return
      }

      router.push(`/user/orders/${returnRequestId}/request-success`)
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "An unexpected error occurred while creating your return request. Please try again."
      setSubmitError(message)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 mt-6 gap-5 md:gap-8">
      <UserNavigation />
      <div className="md:col-span-3 mb-8 md:mb-0">
        {tab === 0 ? (
          <LocalizedClientLink href={`/user/orders/${order.order_group.id}`}>
            <Button
              variant="tonal"
              className="label-md text-action-on-secondary uppercase flex items-center gap-2"
            >
              <ArrowLeftIcon className="size-4" />
              Order details
            </Button>
          </LocalizedClientLink>
        ) : (
          <Button
            variant="tonal"
            className="label-md text-action-on-secondary uppercase flex items-center gap-2"
            onClick={() => setTab(0)}
          >
            <ArrowLeftIcon className="size-4" />
            Select items
          </Button>
        )}
        <div className="grid grid-cols-1 md:grid-cols-8 gap-4 mt-8">
          <div className="col-span-4">
            <div className="mb-4">
              <StepProgressBar
                steps={["SELECT ITEMS TO RETURN", "SELECT RETURN METHOD"]}
                currentStep={tab}
              />
            </div>
            {tab === 0 && (
              <ReturnItemsTab
                order={{ ...order, items: order.items ?? [] }}
                selectedItems={selectedItems}
                handleSelectItem={handleSelectItem}
                returnReasons={returnReasons}
                error={error}
              />
            )}
            {tab === 1 && (
              <ReturnMethodsTab
                shippingMethods={shippingMethods}
                handleSetReturnMethod={handleSetReturnMethod}
                returnMethod={returnMethod}
                seller={order.seller}
              />
            )}
          </div>
          <div />
          <div className="col-span-4 md:col-span-3">
            <ReturnSummaryTab
              currency_code={order.currency_code}
              selectedItems={selectedItems}
              items={order.items ?? []}
              handleTabChange={handleTabChange}
              tab={tab}
              returnMethod={returnMethod}
              handleSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submitError={submitError}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
