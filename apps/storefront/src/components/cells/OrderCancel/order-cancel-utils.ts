/**
 * Storefront Order Cancellation Utilities & Helpers (IR-09)
 */

export const CANCELLATION_DISABLED_DISCLAIMER =
  "Self-service order cancellation is currently unavailable. Please contact the seller directly before shipment preparation begins."

export interface OrderCancelButtonState {
  isDisabled: boolean
  buttonText: string
}

/**
 * Determines button enabled/disabled state and action label for order cancellation (IR-09).
 * Prevents misleading users when cancellation is not permitted, when no handler is provided,
 * or when no items are selected.
 */
export const getOrderCancelButtonState = (
  selectedCount: number,
  isCancellationAvailable: boolean,
  hasCancelHandler: boolean,
  isSubmitting: boolean
): OrderCancelButtonState => {
  if (!isCancellationAvailable || !hasCancelHandler) {
    return {
      isDisabled: true,
      buttonText: "Cancellation Unavailable",
    }
  }

  if (isSubmitting) {
    return {
      isDisabled: true,
      buttonText: "Submitting...",
    }
  }

  if (selectedCount === 0) {
    return {
      isDisabled: true,
      buttonText: "Select Items to Cancel",
    }
  }

  return {
    isDisabled: false,
    buttonText: "Request Cancellation",
  }
}
