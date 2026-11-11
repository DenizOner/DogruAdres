import { Card } from "@/components/atoms"
import { retrieveCustomer } from "@/lib/data/customer"
import { getRegion } from "@/lib/data/regions"
import type { HttpTypes } from "@medusajs/types"

export const OrderAddresses = async ({ singleOrder }: { singleOrder: HttpTypes.StoreOrder }) => {
  const shippingAddress = singleOrder.shipping_address
  const billingAddress = singleOrder.billing_address
  if (!shippingAddress || !billingAddress || !shippingAddress.country_code) return null
  const user = await retrieveCustomer()
  const region = await getRegion(shippingAddress.country_code)

  if (!user) return null

  return (
    <Card className="px-4 grid sm:grid-cols-2 gap-4">
      <div className="flex flex-col ">
        <h4 className="label-md text-primary">Shipping address</h4>
        <p className="label-md text-secondary">
          {`${shippingAddress.first_name} ${shippingAddress.last_name}`}
        </p>
        <p className="label-md text-secondary">
          {`${shippingAddress.address_1}, ${
            shippingAddress.postal_code
          } ${shippingAddress.city}${
            shippingAddress.province
              ? `, ${shippingAddress.province}`
              : ""
          }${
            region
              ? `, ${region.name}`
              : `, ${shippingAddress.country_code?.toUpperCase()}`
          }`}
        </p>
        <p className="label-md text-secondary">
          {`${user.email}, ${shippingAddress.phone || user.phone}`}
        </p>
      </div>
      <div>
        <h4 className="label-md text-primary">Billing address</h4>
        {billingAddress.id === shippingAddress.id ? (
          <p className="label-md text-secondary">Same as shipping address</p>
        ) : (
          <>
            <p className="label-md text-secondary">
              {`${billingAddress.first_name} ${billingAddress.last_name}`}
            </p>
            <p className="label-md text-secondary">
              {`${billingAddress.address_1}, ${
                billingAddress.postal_code
              } ${billingAddress.city}${
                billingAddress.province
                  ? `, ${billingAddress.province}`
                  : ""
              }${
                region
                  ? `, ${region.name}`
                  : `, ${billingAddress.country_code?.toUpperCase()}`
              }`}
            </p>
            <p className="label-md text-secondary">
              {`${user.email}, ${
                billingAddress.phone || user.phone
              }`}
            </p>
          </>
        )}
      </div>
    </Card>
  )
}
