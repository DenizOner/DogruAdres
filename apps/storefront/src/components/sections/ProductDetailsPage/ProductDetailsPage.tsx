import { ProductDetails, ProductGallery } from "@/components/organisms"
import { listProducts } from "@/lib/data/products"
import { listOffers } from "@/lib/data/offers"
import { StoreOffer } from "@/lib/helpers/buybox"
import { HomeProductSection } from "../HomeProductSection/HomeProductSection"
import type { Product } from "@/types/product"
import NotFound from "@/app/not-found"

export const ProductDetailsPage = async ({
  handle,
  locale,
}: {
  handle: string
  locale: string
}) => {
  const prod = await listProducts({
    countryCode: locale,
    queryParams: { handle: [handle], limit: 1 },
  }).then(({ response }) => response.products[0])

  if (!prod) return null

  // Preserve the pre-#159 optional seller presentation when an older
  // Storefront API provides it. Master product DTOs do not promise this field.
  const legacySeller = (prod as typeof prod & {
    seller?: { store_status?: string; products?: Product[] }
  }).seller

  if (legacySeller?.store_status === "SUSPENDED") return NotFound()

  const { offers } = await listOffers({
    productId: prod.id,
    countryCode: locale,
  })

  return (
    <>
      <div className="flex flex-col md:flex-row lg:gap-12" data-testid="product-details-page">
        <div className="md:w-1/2 md:px-2" data-testid="product-gallery-container">
          <ProductGallery images={prod?.images || []} />
        </div>
        <div className="md:w-1/2 md:px-2" data-testid="product-details-container">
          <ProductDetails
            product={prod}
            locale={locale}
            offers={offers as StoreOffer[]}
          />
        </div>
      </div>
      <div className="my-8">
        <HomeProductSection
          heading="Similar items"
          products={legacySeller?.products}
          locale={locale}
        />
      </div>
    </>
  )
}
