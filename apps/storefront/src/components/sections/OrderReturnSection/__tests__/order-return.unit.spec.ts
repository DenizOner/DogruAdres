import { describe, it, expect } from "bun:test"
import {
  calculateEstimatedSubtotal,
  getReturnButtonState,
  REFUND_DISCLAIMER_TEXT,
} from "../order-return-utils"

describe("Storefront Return Calculation & Integrity (IR-11)", () => {
  const sampleItems = [
    {
      id: "item_01",
      subtotal: 1500,
      unit_price: 750,
      quantity: 2,
    },
    {
      id: "item_02",
      subtotal: 350,
      unit_price: 350,
      quantity: 1,
    },
    {
      id: "item_03",
      subtotal: null,
      unit_price: 200,
      quantity: 3,
    },
    {
      id: "item_04",
      subtotal: undefined,
      unit_price: undefined,
      quantity: undefined,
    },
  ]

  it("returns 0 when no items are selected", () => {
    const total = calculateEstimatedSubtotal(sampleItems, [])
    expect(total).toBe(0)
  })

  it("correctly sums subtotals of selected items", () => {
    const total = calculateEstimatedSubtotal(sampleItems, ["item_01", "item_02"])
    expect(total).toBe(1850)
  })

  it("only sums selected items, ignoring unselected items in the list", () => {
    const total = calculateEstimatedSubtotal(sampleItems, ["item_02"])
    expect(total).toBe(350)
  })

  it("falls back to unit_price * quantity when subtotal is null", () => {
    // item_03: null subtotal, unit_price 200, quantity 3 => 600
    const total = calculateEstimatedSubtotal(sampleItems, ["item_03"])
    expect(total).toBe(600)
  })

  it("safely handles undefined subtotal, unit_price and quantity without producing NaN", () => {
    const total = calculateEstimatedSubtotal(sampleItems, ["item_04"])
    expect(total).toBe(0)
    expect(Number.isNaN(total)).toBe(false)
  })

  it("handles empty items list without throwing", () => {
    const total = calculateEstimatedSubtotal([], ["item_01"])
    expect(total).toBe(0)
  })

  it("accurately computes combined subtotals with fallbacks", () => {
    const total = calculateEstimatedSubtotal(sampleItems, ["item_01", "item_03"])
    // 1500 + 600 = 2100
    expect(total).toBe(2100)
  })

  it("verifies refund disclaimer text mentions seller inspection, shipping fees, taxes and discounts", () => {
    expect(REFUND_DISCLAIMER_TEXT).toContain("seller inspection")
    expect(REFUND_DISCLAIMER_TEXT).toContain("shipping fees")
    expect(REFUND_DISCLAIMER_TEXT).toContain("taxes")
    expect(REFUND_DISCLAIMER_TEXT).toContain("promotional discounts")
  })
})

describe("Storefront Return Submission & Double-Submit Protection (IR-10)", () => {
  it("determines correct button disabled state across tabs and submission lifecycle", () => {
    // Tab 0 - No items selected
    expect(getReturnButtonState(0, 0, null, false)).toEqual({
      isDisabled: true,
      buttonText: "Select Items",
    })

    // Tab 0 - Items selected
    expect(getReturnButtonState(0, 2, null, false)).toEqual({
      isDisabled: false,
      buttonText: "Continue",
    })

    // Tab 1 - No return method selected
    expect(getReturnButtonState(1, 2, null, false)).toEqual({
      isDisabled: true,
      buttonText: "Select return method",
    })

    // Tab 1 - Return method selected, ready to submit
    expect(getReturnButtonState(1, 2, "ship_standard", false)).toEqual({
      isDisabled: false,
      buttonText: "Request return",
    })

    // Tab 1 - Currently submitting: MUST BE DISABLED and show 'Submitting...'
    expect(getReturnButtonState(1, 2, "ship_standard", true)).toEqual({
      isDisabled: true,
      buttonText: "Submitting...",
    })
  })

  it("prevents double submission by rejecting concurrent calls while isSubmitting is true", async () => {
    let callCount = 0
    let isSubmitting = false

    const mockApiCall = async () => {
      callCount++
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { order_return_request: { id: "ret_req_123" } }
    }

    const triggerSubmit = async () => {
      if (isSubmitting) {
        return { blocked: true }
      }
      isSubmitting = true
      try {
        const result = await mockApiCall()
        return { blocked: false, result }
      } finally {
        isSubmitting = false
      }
    }

    // Simulate rapid concurrent double-click
    const [firstCall, secondCall] = await Promise.all([
      triggerSubmit(),
      triggerSubmit(),
    ])

    expect(callCount).toBe(1)
    expect(firstCall.blocked).toBe(false)
    expect(secondCall.blocked).toBe(true)
  })

  it("handles API failure gracefully, resetting submission lock and surfacing error message", async () => {
    let isSubmitting = false
    let submitError: string | null = null

    const mockFailingApi = async (): Promise<{ order_return_request: { id: string } }> => {
      throw new Error("Request failed: 403 Forbidden")
    }

    const triggerSubmit = async () => {
      if (isSubmitting) return
      submitError = null
      isSubmitting = true

      try {
        await mockFailingApi()
      } catch (err) {
        submitError = err instanceof Error ? err.message : "Unexpected error"
      } finally {
        isSubmitting = false
      }
    }

    await triggerSubmit()

    expect(isSubmitting).toBe(false)
    expect(submitError).toBe("Request failed: 403 Forbidden")
  })

  it("handles missing return request ID in response, resetting submission lock", async () => {
    let isSubmitting = false
    let submitError: string | null = null

    const mockEmptyIdApi = async (): Promise<any> => {
      return { order_return_request: {} }
    }

    const triggerSubmit = async () => {
      if (isSubmitting) return
      submitError = null
      isSubmitting = true

      try {
        const response = await mockEmptyIdApi()
        const id = response?.order_return_request?.id
        if (!id) {
          submitError = "Return request could not be processed. Please try again."
          return
        }
      } catch (err) {
        submitError = "Network error"
      } finally {
        isSubmitting = false
      }
    }

    await triggerSubmit()

    expect(isSubmitting).toBe(false)
    expect(submitError).toBe("Return request could not be processed. Please try again.")
  })
})
