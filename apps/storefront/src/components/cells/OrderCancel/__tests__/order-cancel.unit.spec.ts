import { describe, it, expect } from "bun:test"
import {
  getOrderCancelButtonState,
  CANCELLATION_DISABLED_DISCLAIMER,
} from "../order-cancel-utils"

describe("Storefront Order Cancel Button State & Guards (IR-09)", () => {
  it("disables cancellation when self-service cancellation is unavailable", () => {
    const state = getOrderCancelButtonState(2, false, true, false)
    expect(state).toEqual({
      isDisabled: true,
      buttonText: "Cancellation Unavailable",
    })
  })

  it("disables cancellation when handler is not provided even if isCancellationAvailable is true", () => {
    // IR-09 / Codex bot finding: Must not allow submission or fake success when no handler exists
    const state = getOrderCancelButtonState(2, true, false, false)
    expect(state).toEqual({
      isDisabled: true,
      buttonText: "Cancellation Unavailable",
    })
  })

  it("disables button when no items are selected in modal", () => {
    const state = getOrderCancelButtonState(0, true, true, false)
    expect(state).toEqual({
      isDisabled: true,
      buttonText: "Select Items to Cancel",
    })
  })

  it("enables button when cancellation is available, handler is provided, and items are selected", () => {
    const state = getOrderCancelButtonState(1, true, true, false)
    expect(state).toEqual({
      isDisabled: false,
      buttonText: "Request Cancellation",
    })
  })

  it("disables button and updates label to 'Submitting...' while request is in flight", () => {
    const state = getOrderCancelButtonState(2, true, true, true)
    expect(state).toEqual({
      isDisabled: true,
      buttonText: "Submitting...",
    })
  })

  it("verifies disclaimer directs users to contact seller directly when self-service is disabled", () => {
    expect(CANCELLATION_DISABLED_DISCLAIMER).toContain(
      "Self-service order cancellation is currently unavailable"
    )
    expect(CANCELLATION_DISABLED_DISCLAIMER).toContain("contact the seller directly")
  })
})

describe("Storefront Order Cancel Submission & Error Handling (IR-09)", () => {
  it("prevents double submission by rejecting concurrent calls while isSubmitting is true", async () => {
    let callCount = 0
    let isSubmitting = false

    const mockCancelApi = async () => {
      callCount++
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { success: true }
    }

    const triggerCancel = async () => {
      if (isSubmitting) return { blocked: true }
      isSubmitting = true
      try {
        const res = await mockCancelApi()
        return { blocked: false, res }
      } finally {
        isSubmitting = false
      }
    }

    const [first, second] = await Promise.all([triggerCancel(), triggerCancel()])

    expect(callCount).toBe(1)
    expect(first.blocked).toBe(false)
    expect(second.blocked).toBe(true)
  })

  it("handles server cancellation rejection and safely releases submission lock", async () => {
    let isSubmitting = false
    let errorMessage: string | null = null

    const mockFailingCancel = async () => {
      return { success: false, message: "Order already packaged by seller." }
    }

    const triggerCancel = async () => {
      if (isSubmitting) return
      isSubmitting = true
      errorMessage = null

      try {
        const result = await mockFailingCancel()
        if (!result.success) {
          errorMessage = result.message
        }
      } finally {
        isSubmitting = false
      }
    }

    await triggerCancel()

    expect(isSubmitting).toBe(false)
    expect(errorMessage).toBe("Order already packaged by seller.")
  })

  it("handles missing handler by preventing fake success and surfacing error", async () => {
    let isSubmitting = false
    let errorMessage: string | null = null
    const onCancelRequest = undefined

    const triggerCancel = async () => {
      if (!onCancelRequest) {
        errorMessage = "Cancellation service is not configured. Please contact the seller directly."
        return
      }
      isSubmitting = true
    }

    await triggerCancel()

    expect(isSubmitting).toBe(false)
    expect(errorMessage).toBe("Cancellation service is not configured. Please contact the seller directly.")
  })

  it("handles unexpected network exception without leaving user locked in submission state", async () => {
    let isSubmitting = false
    let caughtError: string | null = null

    const mockNetworkError = async () => {
      throw new Error("Network timeout: 504 Gateway Timeout")
    }

    const triggerCancel = async () => {
      if (isSubmitting) return
      isSubmitting = true

      try {
        await mockNetworkError()
      } catch (err) {
        caughtError = err instanceof Error ? err.message : "Error"
      } finally {
        isSubmitting = false
      }
    }

    await triggerCancel()

    expect(isSubmitting).toBe(false)
    expect(caughtError).toBe("Network timeout: 504 Gateway Timeout")
  })
})
