'use client'

import Image, { type ImageLoaderProps, type ImageProps } from 'next/image'
import { useState } from 'react'

const PLACEHOLDER = '/images/placeholder.svg'

// A client loader only constructs a same-origin optimizer URL. The actual Next
// HTTP optimizer STILL enforces remotePatterns; untrusted hosts receive 400.
// Unlike Next's default dev loader, this cannot throw during React render
// before the browser can report the 400 and display the safe local fallback.
function imageProxyLoader({ src, width, quality }: ImageLoaderProps): string {
  const params = new URLSearchParams({
    url: src,
    w: String(width),
    q: String(quality ?? 75),
  })
  return '/_next/image?' + params.toString()
}

export default function SafeImage({ src, alt, onError, unoptimized, ...props }: ImageProps) {
  const [brokenSource, setBrokenSource] = useState<string | null>(null)
  const current = typeof src === 'string' && !src.trim() ? PLACEHOLDER : src
  const shown = typeof current === 'string' && brokenSource === current
    ? PLACEHOLDER : current
  const localSvg = typeof shown === 'string' && shown.startsWith('/')
    && !shown.startsWith('//') && /\.svg(?:[?#]|$)/i.test(shown)

  return (
    <Image
      {...props}
      src={shown}
      alt={alt}
      loader={imageProxyLoader}
      unoptimized={unoptimized || localSvg}
      onError={(event) => {
        if (shown !== PLACEHOLDER && typeof current === 'string') {
          setBrokenSource(current)
        }
        onError?.(event)
      }}
    />
  )
}
