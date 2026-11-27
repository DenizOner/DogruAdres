"use client"

import { Heading, Text, useToggleState } from "@medusajs/ui"
import { setAddresses } from "@/lib/data/cart"
import { shouldNavigateToDelivery, type SetAddressesResult } from "@/lib/data/cart-address-utils"
import compareAddresses from "@/lib/helpers/compare-addresses"
import { HttpTypes } from "@medusajs/types"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useActionState, useEffect } from "react"
import { Button } from "@/components/atoms"
import ErrorMessage from "@/components/molecules/ErrorMessage/ErrorMessage"
import Spinner from "@/icons/spinner"
import ShippingAddress from "@/components/organisms/ShippingAddress/ShippingAddress"
import BillingAddress from "@/components/organisms/BillingAddress/BillingAddress"
import { CheckCircleSolid } from "@medusajs/icons"
import LocalizedClientLink from "@/components/molecules/LocalizedLink/LocalizedLink"

export const CartAddressSection = ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isAddress = Boolean(
    cart?.shipping_address &&
      cart?.shipping_address.first_name &&
      cart?.shipping_address.last_name &&
      cart?.shipping_address.address_1 &&
      cart?.shipping_address.city &&
      cart?.shipping_address.postal_code &&
      cart?.shipping_address.country_code
  )
  const isOpen = searchParams.get("step") === "address" || !isAddress

  const { state: sameAsBilling, toggle: toggleSameAsBilling } = useToggleState(
    cart?.shipping_address && cart?.billing_address
      ? compareAddresses(cart?.shipping_address, cart?.billing_address)
      : true
  )

  const [state, formAction, isPending] = useActionState<SetAddressesResult | null, FormData>(
    setAddresses,
    null
  )

  useEffect(() => {
    if (shouldNavigateToDelivery(state)) {
      router.replace(`${pathname}?step=delivery`)
      router.refresh()
    }
  }, [state, pathname, router])

  useEffect(() => {
    if (!isAddress) {
      router.replace(pathname + "?step=address")
    }
  }, [isAddress, pathname, router])

  const handleEdit = () => {
    router.replace(pathname + "?step=address")
  }

  return (
    <div className="border p-4 rounded-sm bg-ui-bg-interactive" data-testid="checkout-step-address">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className="flex flex-row text-3xl-regular gap-x-2 items-baseline items-center"
        >
          {!isOpen && <CheckCircleSolid />} Shipping Address
        </Heading>
        {!isOpen && isAddress && (
          <Text>
            <Button onClick={handleEdit} variant="tonal" data-testid="checkout-address-edit-button">
              Edit
            </Button>
          </Text>
        )}
      </div>
      <form action={formAction}>
        <input
          type="hidden"
          name="same_as_billing"
          value={sameAsBilling ? "true" : "false"}
        />
        {isOpen ? (
          <div className="pb-8">
            <ShippingAddress
              customer={customer}
              checked={sameAsBilling}
              onChange={toggleSameAsBilling}
              cart={cart}
            />
            {!sameAsBilling && (
              <div className="pt-6 border-t mt-6" data-testid="billing-address-section">
                <Heading level="h3" className="text-xl-semi pb-4">
                  Billing Address
                </Heading>
                <BillingAddress cart={cart} />
              </div>
            )}
            <Button
              className="mt-6"
              data-testid="submit-address-button"
              variant="tonal"
              loading={isPending}
              disabled={isPending}
            >
              Save
            </Button>
            <ErrorMessage
              error={state && !state.success ? state.error : null}
              data-testid="address-error-message"
            />
          </div>
        ) : (
          <div>
            <div className="text-small-regular">
              {cart && cart.shipping_address ? (
                <div className="flex items-start gap-x-8">
                  <div className="flex items-start gap-x-1 w-full">
                    <div>
                      <Text className="txt-medium-plus font-bold">
                        {cart.shipping_address.first_name}{" "}
                        {cart.shipping_address.last_name}
                      </Text>
                      <Text>
                        {cart.shipping_address.address_1}{" "}
                        {cart.shipping_address.address_2},{" "}
                        {cart.shipping_address.postal_code}{" "}
                        {cart.shipping_address.city},{" "}
                        {cart.shipping_address.country_code?.toUpperCase()}
                      </Text>
                      <Text>
                        {cart.email}, {cart.shipping_address.phone}
                      </Text>
                      {cart.billing_address && !compareAddresses(cart.shipping_address, cart.billing_address) && (
                        <div className="mt-4 pt-4 border-t" data-testid="billing-address-summary">
                          <Text className="txt-medium-plus font-bold">
                            Billing Address: {cart.billing_address.first_name}{" "}
                            {cart.billing_address.last_name}
                          </Text>
                          <Text>
                            {cart.billing_address.address_1}{" "}
                            {cart.billing_address.address_2 ? `${cart.billing_address.address_2}, ` : ""}
                            {cart.billing_address.postal_code}{" "}
                            {cart.billing_address.city},{" "}
                            {cart.billing_address.country_code?.toUpperCase()}
                          </Text>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <Spinner />
                </div>
              )}
            </div>
          </div>
        )}
        {isAddress && !searchParams.get("step") && (
          <LocalizedClientLink href="/checkout?step=delivery">
            <Button className="mt-6" variant="tonal">
              Continue to Delivery
            </Button>
          </LocalizedClientLink>
        )}
      </form>
    </div>
  )
}
