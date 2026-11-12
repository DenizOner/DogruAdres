import { Card, Checkbox } from "@/components/atoms"

type ReturnMethodOption = { id: string; name: string }

const isReturnMethodOption = (value: unknown): value is ReturnMethodOption => {
  if (typeof value !== "object" || value === null) return false
  const method = value as Record<string, unknown>
  return typeof method.id === "string" && method.id.length > 0 &&
    typeof method.name === "string"
}

export const ReturnMethodsTab = ({
  shippingMethods,
  handleSetReturnMethod,
  returnMethod,
  seller,
}: {
  shippingMethods: unknown
  handleSetReturnMethod: (method: string) => void
  returnMethod: string | null
  seller: unknown
}) => {
  const methods = Array.isArray(shippingMethods)
    ? shippingMethods.filter(isReturnMethodOption)
    : []
  const noShippingMethods = methods.length === 0
  const sellerField = (key: string): string => {
    if (typeof seller !== "object" || seller === null) return ""
    const value = (seller as Record<string, unknown>)[key]
    return typeof value === "string" ? value : ""
  }

  return (
    <>
      <div className="mb-8">
        <Card className="bg-secondary p-4">
          <p className="label-lg uppercase">Return methods</p>
        </Card>
        <Card className="flex items-center justify-between p-4">
          {noShippingMethods ? (
            <div className="py-4 text-center font-bold heading-md w-full">
              No shipping methods available
            </div>
          ) : (
            <ul>
              {methods.map((method) => (
                <li
                  key={method.id}
                  onClick={() => handleSetReturnMethod(method.id)}
                  className="flex items-center gap-4 my-2 cursor-pointer"
                >
                  <Checkbox checked={returnMethod === method.id} />
                  <span className="label-lg">{method.name}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div>
        <Card className="bg-secondary p-4">
          <p className="label-lg uppercase">Shipping address</p>
        </Card>
        <Card className="p-4">
          <p className="label-lg">{sellerField("name")}</p>
          <p className="label-md">{sellerField("address_line")}</p>
          <p className="label-md">
            {sellerField("city")}, {sellerField("state")}
          </p>
          <p className="label-md">
            {sellerField("postal_code")}, {sellerField("country_code")}
          </p>
          <p className="label-md">
            {sellerField("email")}, {sellerField("phone")}
          </p>
        </Card>
      </div>
    </>
  )
}
