'use client'

import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'

const PLACEHOLDER = '/images/placeholder.svg'

// Failed optimizer requests must not leave broken product/merchant images.
export default function SafeImage({ src, ...props }: ImageProps) {
  const [brokenSource, setBrokenSource] = useState<string | null>(null)
  const current = typeof src === 'string' && !src.trim() ? PLACEHOLDER : src
  const shown = typeof current === 'string' && brokenSource === current
    ? PLACEHOLDER : current

  return (
    <Image
      {...props}
      src={shown}
      onError={() => {
        if (shown !== PLACEHOLDER && typeof current === 'string') {
          setBrokenSource(current)
        }
      }}
    />
  )
}
