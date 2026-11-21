import { SingleProductImage } from "@/types/product"
import Image from "@/components/molecules/SafeImage/SafeImage"

export const GalleryCarouselItem = ({
  image,
}: {
  image: SingleProductImage
}) => {
  return (
    <Image
      key={image.id}
      src={decodeURIComponent(image.url)}
      alt={image.alt}
      width={700}
      height={700}
    />
  )
}
