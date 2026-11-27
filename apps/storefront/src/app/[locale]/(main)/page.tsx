import type { Metadata } from "next"
import { headers } from "next/headers"
import Script from "next/script"

import {
  WelcomeHero,
  TargetAudienceSection,
  IntegratedSolutionsSection,
  HowItWorksSection,
  TrustAndFaqSection,
} from "@/components/sections/WelcomePage"
import { serializeJsonLd } from "@/lib/helpers/serialize-json-ld"
import { listRegions } from "@/lib/data/regions"
import {
  buildHreflangAlternates,
  getStorefrontLocales,
  toHreflang,
} from "@/lib/helpers/hreflang"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params

  const headersList = await headers()
  const host = headersList.get("host")
  const protocol = headersList.get("x-forwarded-proto") || "https"
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`

  let locales: string[] = []
  try {
    locales = getStorefrontLocales(await listRegions())
  } catch {
    locales = [locale]
  }

  const { canonical, languages } = buildHreflangAlternates({
    baseUrl,
    path: "",
    locale,
    locales,
  })

  const title = "DoğruAdres | Kurumsal Otomotiv B4B Platformu"
  const description =
    "Doğru müşteriye, doğru tedarikçiye, doğru fiyatla DoğruAdres’te ulaşın. Otomotiv sektöründeki profesyonel işletmeler için kapalı B4B ticaret, tedarik ve entegre çözüm platformu."
  const ogImage = "/Logo.svg"
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "DoğruAdres"

  return {
    title,
    description,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-video-preview": -1,
        "max-snippet": -1,
      },
    },
    alternates: {
      canonical,
      languages,
    },
    openGraph: {
      title: `${title} | ${siteName}`,
      description,
      url: canonical,
      siteName,
      type: "website",
      images: [
        {
          url: ogImage.startsWith("http") ? ogImage : `${baseUrl}${ogImage}`,
          width: 1200,
          height: 630,
          alt: `${siteName} Kurumsal Tanıtım`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.startsWith("http") ? ogImage : `${baseUrl}${ogImage}`],
    },
  }
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  const headersList = await headers()
  const host = headersList.get("host")
  const protocol = headersList.get("x-forwarded-proto") || "https"
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`

  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "DoğruAdres"

  return (
    <main
      className="flex flex-col w-full text-primary"
      data-testid="welcome-page-main"
    >
      <Script
        id="ld-org"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: siteName,
            url: `${baseUrl}/${locale}`,
            logo: `${baseUrl}/Logo.svg`,
            description:
              "Otomotiv sektöründeki profesyonel işletmeler için kapalı B4B ticaret, tedarik ve entegre çözüm platformu.",
          }),
        }}
      />
      <Script
        id="ld-website"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: siteName,
            url: `${baseUrl}/${locale}`,
            inLanguage: toHreflang(locale),
          }),
        }}
      />

      {/* Bölüm 2: Ana Tanıtım (Hero) */}
      <WelcomeHero />

      {/* Bölüm 3: DoğruAdres Kimler İçin? (6 Onaylı Faaliyet Grubu) */}
      <TargetAudienceSection />

      {/* Bölüm 4: Tek Platform, Bütünleşik Çözümler (6 Modül) */}
      <IntegratedSolutionsSection />

      {/* Bölüm 5: DoğruAdres Nasıl Çalışır? (4 Adımlı Süreç) */}
      <HowItWorksSection />

      {/* Bölüm 6: Kurumsal Güven Yaklaşımı ve SSS (6 Soru-Cevap) */}
      <TrustAndFaqSection />
    </main>
  )
}
