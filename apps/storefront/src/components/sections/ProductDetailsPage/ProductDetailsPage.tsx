import { ProductDetails, ProductGallery } from "@/components/organisms"
import { listProducts } from "@/lib/data/products"
import { listOffers } from "@/lib/data/offers"
import { StoreOffer } from "@/lib/helpers/buybox"
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

  const { offers } = await listOffers({
    productId: prod.id,
    countryCode: locale,
  })

  // Mercur v2.4.1 Store offers are server-filtered to open sellers.
  // No visible offers also covers a suspended/closed seller or failed lookup.
  if (offers.length === 0) return NotFound()

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
    </>
  )
}
