import { SellerFooter, SellerHeading } from "@/components/organisms"
import { HttpTypes } from "@medusajs/types"
import type { SellerDTO } from "@mercurjs/types"

export const SellerPageHeader = ({
  seller,
  user,
}: {
  header?: boolean
  seller: SellerDTO
  user: HttpTypes.StoreCustomer | null
}) => {
  return (
    <div className="border rounded-sm">
      <SellerHeading header seller={seller} user={user} />
      <SellerFooter seller={seller} />
    </div>
  )
}
