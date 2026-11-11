import { convertToLocale } from "@/lib/helpers/money"
import { HttpTypes } from "@medusajs/types"
import Image from "next/image"
export const Item = ({
  item,
  currencyCode,
}: {
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
  currencyCode: string
}) => {
  // Cart and order totals can be absent. Never display an invented zero.
  const originalAmount = item.original_total
  const totalAmount = item.total
  const original_total =
    typeof originalAmount === "number" && Number.isFinite(originalAmount)
      ? convertToLocale({ amount: originalAmount, currency_code: currencyCode })
      : null
  const total =
    typeof totalAmount === "number" && Number.isFinite(totalAmount)
      ? convertToLocale({ amount: totalAmount, currency_code: currencyCode })
      : null

  return (
    <div className="border rounded-sm p-1 flex gap-2">
      <div className="w-[100px] h-[132px] flex items-center justify-center">
        {item.thumbnail ? (
          <Image
            src={decodeURIComponent(item.thumbnail)}
            alt="Product thumbnail"
            width={100}
            height={132}
            className="rounded-xs w-[100px] h-[132px] object-contain"
          />
        ) : (
          <Image
            src={"/images/placeholder.svg"}
            alt="Product thumbnail"
            width={50}
            height={66}
            className="rounded-xs w-[50px] h-[66px] object-contain opacity-30"
          />
        )}
      </div>

      <div className="w-full p-2">
        <div className="flex justify-between lg:mb-4">
          <div className="w-[150px] md:w-[200px] lg:w-[300px] xl:w-[calc(100%-120px)] mb-6">
            <h3 className="heading-xs uppercase truncate">
              {item.subtitle} {item.title}
            </h3>
          </div>
        </div>
        <div className="lg:flex justify-between -mt-4 lg:mt-0">
          <div className="label-md text-secondary">
            <p>
              Quantity: <span className="text-primary">{item.quantity}</span>
            </p>
          </div>
          <div className="lg:text-right flex lg:block items-center gap-2 mt-4 lg:mt-0">
            {total !== null && original_total !== null && total !== original_total && (
              <p className="line-through text-secondary label-md">
                {original_total}
              </p>
            )}
            <p className="label-lg">{total ?? <span aria-label="Price unavailable">—</span>}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
