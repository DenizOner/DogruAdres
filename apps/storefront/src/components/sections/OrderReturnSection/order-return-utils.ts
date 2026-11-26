/**
 * Storefront Order Return Utilities & Calculation Helpers (IR-10 & IR-11)
 */

export const REFUND_DISCLAIMER_TEXT =
  "* Final refund amount may vary based on seller inspection, applicable return shipping fees, taxes, and promotional discounts."

export interface ReturnItemSummaryInput {
  id: string
  subtotal?: number | null
  unit_price?: number | null
  quantity?: number | null
}

/**
 * Computes estimated item subtotal for selected items to avoid misleading authoritative claims (IR-11).
 * Falls back safely to unit_price * quantity if subtotal is omitted, and guards against NaN.
 */
export const calculateEstimatedSubtotal = (
  items: ReturnItemSummaryInput[],
  selectedItemIds: string[]
): number => {
  const selected = items.filter((item) => selectedItemIds.includes(item.id))
  return selected.reduce((acc, item) => {
    const itemSubtotal =
      typeof item.subtotal === "number"
        ? item.subtotal
        : (item.unit_price ?? 0) * (item.quantity ?? 1)
    return acc + (isNaN(itemSubtotal) ? 0 : itemSubtotal)
  }, 0)
}

export interface ReturnButtonState {
  isDisabled: boolean
  buttonText: string
}

/**
 * Determines button enabled/disabled state and action label to prevent double submit and guide flow (IR-10).
 */
export const getReturnButtonState = (
  tab: number,
  selectedCount: number,
  returnMethod: string | null,
  isSubmitting: boolean
): ReturnButtonState => {
  const isDisabled =
    (tab === 0 && selectedCount === 0) ||
    (tab === 1 && !returnMethod) ||
    isSubmitting

  const buttonText =
    tab === 0
      ? selectedCount > 0
        ? "Continue"
        : "Select Items"
      : isSubmitting
      ? "Submitting..."
      : !returnMethod
      ? "Select return method"
      : "Request return"

  return { isDisabled, buttonText }
}
