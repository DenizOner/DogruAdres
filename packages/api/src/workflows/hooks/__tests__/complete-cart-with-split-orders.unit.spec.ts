import {
  validateSplitCartCheckout,
  denialMessage,
  CheckoutCartSnapshot,
} from "../complete-cart-with-split-orders"
import { DOGRUADRES_ACCESS_MODULE } from "../../../modules/dogruadres-access/constants"
import { nativeIngress } from "../../../api/personal/security"

describe("B22 Split Cart Validation Hook & Checkout Security Contract (#254)", () => {
  const validCartId = "cart_01JBCDEF0123456789ABCDEF01"
  const validCustomerId = "cus_01JBCDEF0123456789ABCDEF01"
  const validSellerId1 = "sel_01JBCDEF0123456789ABCDEF01"
  const validSellerId2 = "sel_01JBCDEF0123456789ABCDEF02"
  const validOfferId1 = "offer_01JBCDEF0123456789ABCDEF01"
  const validOfferId2 = "offer_01JBCDEF0123456789ABCDEF02"
  const validItemId1 = "item_01JBCDEF0123456789ABCDEF01"
  const validItemId2 = "item_01JBCDEF0123456789ABCDEF02"

  function createMockContainer(overrides: {
    sellerRows?: Record<string, any[]>
    authorized?: boolean
    throwFoundation?: boolean
  } = {}) {
    const listSellers = jest.fn(async ({ id }: { id: string }) => {
      if (overrides.sellerRows && id in overrides.sellerRows) {
        return overrides.sellerRows[id]
      }
      return [
        {
          id,
          status: "open",
          approved_at: new Date(Date.now() - 86400000).toISOString(),
          closed_from: null,
          closed_to: null,
        },
      ]
    })

    const authorizeBuyerCheckout = jest.fn(async () => {
      if (overrides.throwFoundation) {
        throw new Error("Unexpected database disconnection")
      }
      return overrides.authorized ?? true
    })

    const container = {
      resolve: jest.fn((key: string): any => {
        if (key === "seller") {
          return { listSellers }
        }
        if (key === DOGRUADRES_ACCESS_MODULE) {
          return { authorizeBuyerCheckout }
        }
        throw new Error(`Unknown service: ${key}`)
      }),
    }

    return { container, listSellers, authorizeBuyerCheckout }
  }

  function createValidCart(): CheckoutCartSnapshot {
    return {
      id: validCartId,
      completed_at: null,
      customer: { id: validCustomerId },
      items: [
        {
          id: validItemId1,
          offer: { id: validOfferId1, seller_id: validSellerId1 },
        },
      ],
    }
  }

  describe("Cart Structure & Attribute Validation (Fail-Closed)", () => {
    it.each([
      ["null cart", null],
      ["undefined cart", undefined],
      ["missing id", { customer: { id: validCustomerId }, items: [] }],
      ["numeric id", { id: 12345, customer: { id: validCustomerId }, items: [] }],
      ["invalid id regex", { id: "invalid_cart", customer: { id: validCustomerId }, items: [] }],
      ["empty string id", { id: "", customer: { id: validCustomerId }, items: [] }],
      [
        "already completed cart",
        {
          id: validCartId,
          completed_at: new Date().toISOString(),
          customer: { id: validCustomerId },
          items: [{ id: validItemId1, offer: { id: validOfferId1, seller_id: validSellerId1 } }],
        },
      ],
      ["missing customer", { id: validCartId, completed_at: null, customer: null, items: [] }],
      [
        "invalid customer id format",
        {
          id: validCartId,
          completed_at: null,
          customer: { id: "user_not_cus_prefix" },
          items: [{ id: validItemId1, offer: { id: validOfferId1, seller_id: validSellerId1 } }],
        },
      ],
      ["items not array", { id: validCartId, completed_at: null, customer: { id: validCustomerId }, items: "not_array" }],
      ["empty items array", { id: validCartId, completed_at: null, customer: { id: validCustomerId }, items: [] }],
      [
        "items length > 50 (DoS limit)",
        {
          id: validCartId,
          completed_at: null,
          customer: { id: validCustomerId },
          items: Array.from({ length: 51 }, (_, i) => ({
            id: `item_${i.toString().padStart(26, "0")}`,
            offer: { id: validOfferId1, seller_id: validSellerId1 },
          })),
        },
      ],
    ])("denies checkout when %s", async (_, malformedCart) => {
      const { container } = createMockContainer()
      await expect(
        validateSplitCartCheckout({ cart: malformedCart as any }, { container })
      ).rejects.toThrow(denialMessage)
    })
  })

  describe("Cart Items, Offers and Seller Validation (Fail-Closed)", () => {
    it.each([
      [
        "null item in items array",
        [{ id: validItemId1, offer: { id: validOfferId1, seller_id: validSellerId1 } }, null],
      ],
      [
        "item missing id",
        [{ offer: { id: validOfferId1, seller_id: validSellerId1 } }],
      ],
      [
        "duplicate item id in same cart",
        [
          { id: validItemId1, offer: { id: validOfferId1, seller_id: validSellerId1 } },
          { id: validItemId1, offer: { id: validOfferId2, seller_id: validSellerId2 } },
        ],
      ],
      [
        "item missing offer",
        [{ id: validItemId1, offer: null }],
      ],
      [
        "malformed offer id (missing prefix)",
        [{ id: validItemId1, offer: { id: "not_offer_prefix", seller_id: validSellerId1 } }],
      ],
      [
        "malformed seller id (missing sel_ prefix)",
        [{ id: validItemId1, offer: { id: validOfferId1, seller_id: "store_bad_prefix" } }],
      ],
    ])("denies checkout when %s", async (_, items) => {
      const { container } = createMockContainer()
      const cart: CheckoutCartSnapshot = {
        id: validCartId,
        completed_at: null,
        customer: { id: validCustomerId },
        items: items as any,
      }
      await expect(
        validateSplitCartCheckout({ cart }, { container })
      ).rejects.toThrow(denialMessage)
    })
  })

  describe("Seller Lifecycle & Status Verification (Fail-Closed)", () => {
    it("denies checkout when native seller is not found (0 rows returned)", async () => {
      const { container } = createMockContainer({
        sellerRows: { [validSellerId1]: [] },
      })
      const cart = createValidCart()
      await expect(
        validateSplitCartCheckout({ cart }, { container })
      ).rejects.toThrow(denialMessage)
    })

    it("denies checkout when native seller returns multiple rows (ambiguity anomaly)", async () => {
      const { container } = createMockContainer({
        sellerRows: {
          [validSellerId1]: [
            { id: validSellerId1, status: "open", approved_at: new Date().toISOString() },
            { id: validSellerId1, status: "open", approved_at: new Date().toISOString() },
          ],
        },
      })
      const cart = createValidCart()
      await expect(
        validateSplitCartCheckout({ cart }, { container })
      ).rejects.toThrow(denialMessage)
    })

    it("denies checkout when returned seller id does not match requested id", async () => {
      const { container } = createMockContainer({
        sellerRows: {
          [validSellerId1]: [
            { id: "sel_different_id_000000000000000", status: "open", approved_at: new Date().toISOString() },
          ],
        },
      })
      const cart = createValidCart()
      await expect(
        validateSplitCartCheckout({ cart }, { container })
      ).rejects.toThrow(denialMessage)
    })

    it("denies checkout when native seller is not open or not approved (nativeSellerTradingAt fails)", async () => {
      const { container } = createMockContainer({
        sellerRows: {
          [validSellerId1]: [
            {
              id: validSellerId1,
              status: "suspended",
              approved_at: null,
            },
          ],
        },
      })
      const cart = createValidCart()
      await expect(
        validateSplitCartCheckout({ cart }, { container })
      ).rejects.toThrow(denialMessage)
    })
  })

  describe("Foundation Buyer Authorization Contract (Person→Organization→Buyer.purchase)", () => {
    it("denies checkout when foundation.authorizeBuyerCheckout returns false", async () => {
      const { container, authorizeBuyerCheckout } = createMockContainer({
        authorized: false,
      })
      const cart = createValidCart()
      await expect(
        validateSplitCartCheckout({ cart }, { container })
      ).rejects.toThrow(denialMessage)
      expect(authorizeBuyerCheckout).toHaveBeenCalledWith(
        validCartId,
        validCustomerId,
        [validSellerId1]
      )
    })

    it("fails closed when foundation.authorizeBuyerCheckout throws an unexpected error", async () => {
      const { container } = createMockContainer({
        throwFoundation: true,
      })
      const cart = createValidCart()
      await expect(
        validateSplitCartCheckout({ cart }, { container })
      ).rejects.toThrow(denialMessage)
    })
  })

  describe("Multi-Seller Split-Cart All-or-Nothing Guarantee", () => {
    it("sorts and deduplicates seller IDs before passing to Foundation", async () => {
      const { container, authorizeBuyerCheckout } = createMockContainer({
        authorized: true,
      })
      const cart: CheckoutCartSnapshot = {
        id: validCartId,
        completed_at: null,
        customer: { id: validCustomerId },
        items: [
          { id: validItemId2, offer: { id: validOfferId2, seller_id: validSellerId2 } },
          { id: validItemId1, offer: { id: validOfferId1, seller_id: validSellerId1 } },
        ],
      }

      await validateSplitCartCheckout({ cart }, { container })

      // Sellers should be sorted alphabetically: sellerId1 then sellerId2
      const expectedSorted = [validSellerId1, validSellerId2].sort()
      expect(authorizeBuyerCheckout).toHaveBeenCalledWith(
        validCartId,
        validCustomerId,
        expectedSorted
      )
    })

    it("denies the WHOLE multi-seller cart if ANY single seller fails trading verification", async () => {
      const { container } = createMockContainer({
        sellerRows: {
          [validSellerId1]: [
            {
              id: validSellerId1,
              status: "open",
              approved_at: new Date(Date.now() - 86400000).toISOString(),
            },
          ],
          [validSellerId2]: [
            {
              id: validSellerId2,
              status: "closed", // Closed seller
              approved_at: new Date(Date.now() - 86400000).toISOString(),
            },
          ],
        },
      })

      const cart: CheckoutCartSnapshot = {
        id: validCartId,
        completed_at: null,
        customer: { id: validCustomerId },
        items: [
          { id: validItemId1, offer: { id: validOfferId1, seller_id: validSellerId1 } },
          { id: validItemId2, offer: { id: validOfferId2, seller_id: validSellerId2 } },
        ],
      }

      await expect(
        validateSplitCartCheckout({ cart }, { container })
      ).rejects.toThrow(denialMessage)
    })
  })

  describe("Happy Path Validation", () => {
    it("passes cleanly when cart, customer, items, sellers and foundation are fully valid", async () => {
      const { container, authorizeBuyerCheckout, listSellers } = createMockContainer({
        authorized: true,
      })
      const cart = createValidCart()

      await expect(
        validateSplitCartCheckout({ cart }, { container })
      ).resolves.toBeUndefined()

      expect(listSellers).toHaveBeenCalledWith({ id: validSellerId1 })
      expect(authorizeBuyerCheckout).toHaveBeenCalledWith(
        validCartId,
        validCustomerId,
        [validSellerId1]
      )
    })
  })

  describe("Payment Security & Callback Ingress Protection (security.ts nativeIngress)", () => {
    it("ensures unconfigured payment callback invocations fail closed via nativeIngress and downstream handler is never called", async () => {
      // In accordance with security.ts:
      // Mercur 2.4.0 can capture payment in processPaymentWorkflow BEFORE split-cart validate hook.
      // Callbacks must fail closed in nativeIngress middleware until provider-specific authorization -> order -> capture is proven.
      const createMockReqRes = (method: string, path: string) => {
        const req = {
          method,
          originalUrl: path,
          headers: {},
        } as any

        let statusCode = 0
        let jsonPayload: any = null
        const res = {
          status: jest.fn((code: number) => {
            statusCode = code
            return {
              json: jest.fn((payload: any) => {
                jsonPayload = payload
              }),
            }
          }),
        } as any

        const next = jest.fn()

        return { req, res, next, getStatus: () => statusCode, getPayload: () => jsonPayload }
      }

      // First callback attempt: must return 403 and never proceed to payment capture
      const attempt1 = createMockReqRes("POST", "/hooks/payment/stripe")
      await nativeIngress(attempt1.req, attempt1.res, attempt1.next)
      expect(attempt1.getStatus()).toBe(403)
      expect(attempt1.getPayload()?.message).toBe("Payment callback is not enabled")
      expect(attempt1.next).not.toHaveBeenCalled()

      // Repeated callback attempt (idempotency check: must still fail closed without calling downstream payment handler)
      const attempt2 = createMockReqRes("POST", "/hooks/payment/stripe")
      await nativeIngress(attempt2.req, attempt2.res, attempt2.next)
      expect(attempt2.getStatus()).toBe(403)
      expect(attempt2.getPayload()?.message).toBe("Payment callback is not enabled")
      expect(attempt2.next).not.toHaveBeenCalled()
    })
  })
})
