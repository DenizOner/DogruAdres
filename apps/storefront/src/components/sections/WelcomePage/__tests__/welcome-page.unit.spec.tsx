import { describe, it, expect, mock, beforeAll } from "bun:test"
import React from "react"

mock.module("next/image", () => ({
  default: ({ src, alt, ...props }: Record<string, unknown>) =>
    React.createElement("img", { src: String(src), alt: String(alt), ...props }),
}))

mock.module("next/link", () => ({
  default: ({ href, children, ...props }: Record<string, unknown>) =>
    React.createElement("a", { href: String(href), ...props }, children as React.ReactNode),
}))

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/tr",
  useParams: () => ({ locale: "tr" }),
  redirect: () => {},
}))

import { renderToString } from "react-dom/server"

describe("DoğruAdres Kurumsal Karşılama Sayfası (Issue #255)", () => {
  let CORPORATE_NAV_LINKS: ReadonlyArray<{ href: string; label: string; testId: string }>
  let WelcomeHero: React.ComponentType
  let TargetAudienceSection: React.ComponentType
  let IntegratedSolutionsSection: React.ComponentType
  let HowItWorksSection: React.ComponentType
  let TrustAndFaqSection: React.ComponentType
  let Footer: React.ComponentType

  beforeAll(async () => {
    const mod = await import("../index")
    CORPORATE_NAV_LINKS = mod.CORPORATE_NAV_LINKS
    WelcomeHero = mod.WelcomeHero
    TargetAudienceSection = mod.TargetAudienceSection
    IntegratedSolutionsSection = mod.IntegratedSolutionsSection
    HowItWorksSection = mod.HowItWorksSection
    TrustAndFaqSection = mod.TrustAndFaqSection
    const footerMod = await import("../../../organisms/Footer/Footer")
    Footer = footerMod.Footer
  })

  describe("Bölüm 1: Kurumsal Gezinme Bağlantıları (CORPORATE_NAV_LINKS)", () => {
    it("exposes all four corporate section anchors", () => {
      expect(CORPORATE_NAV_LINKS.map((l) => l.href)).toEqual([
        "/#kimler-icin",
        "/#cozumler",
        "/#nasil-calisir",
        "/#guven-ve-sss",
      ])
    })
  })

  describe("Bölüm 2: Ana Tanıtım (WelcomeHero)", () => {
    it("renders the approved slogan verbatim and positioning text", () => {
      const html = renderToString(<WelcomeHero />)
      expect(html).toContain('data-testid="welcome-hero"')
      expect(html).toContain("Doğru müşteriye, doğru tedarikçiye, doğru fiyatla")
      expect(html).toContain("DoğruAdres’te")
      expect(html).toContain("ulaşın.")

      expect(html).toContain(
        "DoğruAdres, otomotiv sektöründeki profesyonel işletmeler için yalnız bir pazaryeri değil"
      )
      expect(html).toContain("Servis/onarım, perakende yedek parça mağazası")
      expect(html).toContain("toptancı/distribütör, üretici, filo/kurumsal araç işletmecisi")
      expect(html).toContain("sigorta/hasar yönetimi")

      expect(html).toContain('data-testid="welcome-hero-login-cta"')
      expect(html).toContain('data-testid="welcome-hero-register-cta"')

      expect(html).toContain("Tamamen Kapalı B4B")
      expect(html).toContain("Doğrulanmış İşletmeler")
      expect(html).toContain("Bütünleşik Süreçler")
    })
  })

  describe("Bölüm 3: DoğruAdres Kimler İçin? (TargetAudienceSection)", () => {
    it("renders all 6 approved activity groups with semantic IDs and descriptions", () => {
      const html = renderToString(<TargetAudienceSection />)
      expect(html).toContain('id="kimler-icin"')
      expect(html).toContain("DoğruAdres Kimler İçin?")

      const expectedAudiences = [
        "Servis ve Onarım İşletmeleri",
        "Perakende Yedek Parça Mağazaları",
        "Toptancı ve Distribütörler",
        "Üreticiler",
        "Filo ve Kurumsal Araç İşletmecileri",
        "Sigorta ve Hasar Yönetimi",
      ]

      for (const audience of expectedAudiences) {
        expect(html).toContain(audience)
      }

      expect(html).not.toContain("Snag your style")
      expect(html).not.toContain("trending listings")
    })
  })

  describe("Bölüm 4: Tek Platform, Bütünleşik Çözümler (IntegratedSolutionsSection)", () => {
    it("renders all 6 integrated modules without in-development badges", () => {
      const html = renderToString(<IntegratedSolutionsSection />)
      expect(html).toContain('id="cozumler"')
      expect(html).toContain("Tek Platform, Bütünleşik Çözümler")

      const expectedSolutions = [
        "B4B Ticaret ve Tedarik",
        "İş İlanları Panosu",
        "Muhasebe ve Finans",
        "Filo Yönetimi",
        "Müşteri Segmentasyonu",
        "İşletme Uygulamaları",
      ]

      for (const solution of expectedSolutions) {
        expect(html).toContain(solution)
      }

      expect(html).not.toContain("yakında")
      expect(html).not.toContain("Geliştirme Aşamasında")
      expect(html).not.toContain("Coming Soon")
    })
  })

  describe("Bölüm 5: DoğruAdres Nasıl Çalışır? (HowItWorksSection)", () => {
    it("renders the 4-step workflow from personal account to integrated modules", () => {
      const html = renderToString(<HowItWorksSection />)
      expect(html).toContain('id="nasil-calisir"')
      expect(html).toContain("DoğruAdres Nasıl Çalışır?")

      expect(html).toContain("01")
      expect(html).toContain("Kişisel Hesap Oluşturma")
      expect(html).toContain("02")
      expect(html).toContain("İşletme Başvurusu ve Doğrulama")
      expect(html).toContain("03")
      expect(html).toContain("Yetkili Şirket Çalışma Alanı")
      expect(html).toContain("04")
      expect(html).toContain("Mağaza, Tedarik ve Modüller")

      expect(html).toContain("otomatik onay, koşulsuz mağaza açma veya garantili indirim vaat edilmez")
    })
  })

  describe("Bölüm 6: Kurumsal Güven Yaklaşımı ve SSS (TrustAndFaqSection)", () => {
    it("renders closed B4B privacy, pricing, and verification FAQs", () => {
      const html = renderToString(<TrustAndFaqSection />)
      expect(html).toContain('id="guven-ve-sss"')
      expect(html).toContain("Kurumsal Güven Yaklaşımı ve SSS")

      expect(html).toContain("DoğruAdres neden bütünüyle kapalı bir B4B platformudur?")
      expect(html).toContain("Kişisel hesap ile şirket çalışma alanı arasındaki fark nedir?")
      expect(html).toContain("İşletme başvurusu nasıl incelenir ve onaylanır?")
      expect(html).toContain("Fiyatlandırma nasıl belirlenir ve çalışır?")
      expect(html).toContain("Kişisel ve kurumsal veriler nasıl korunur?")
      expect(html).toContain("Hangi otomotiv işletmeleri platforma katılabilir?")

      expect(html).toContain("geçerli en uygun fiyatı görür")
      expect(html).not.toContain("%100 güvenli")
      expect(html).not.toContain("garantili en ucuz")
    })
  })

  describe("Bölüm 7: Altbilgi (Footer)", () => {
    it("renders corporate identity, policy links, and copyright", () => {
      const html = renderToString(<Footer />)
      expect(html).toContain('data-testid="footer"')
      expect(html).toContain("DoğruAdres")
      expect(html).toContain("Kullanım Koşulları")
      expect(html).toContain("Gizlilik ve KVKK Politikası")
      expect(html).toContain("Çerez Politikası")
      expect(html).toContain("© 2026 DoğruAdres. Tüm hakları saklıdır.")
      expect(html).not.toContain("Fleek")
    })
  })
})
