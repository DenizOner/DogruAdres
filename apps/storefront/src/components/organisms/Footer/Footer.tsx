import LocalizedClientLink from "@/components/molecules/LocalizedLink/LocalizedLink"
import { CORPORATE_NAV_LINKS } from "@/components/sections/WelcomePage"

export function Footer() {
  return (
    <footer
      className="bg-primary border-t border-primary text-secondary text-sm"
      data-testid="footer"
      aria-labelledby="footer-heading"
    >
      <h2 id="footer-heading" className="sr-only">
        DoğruAdres Kurumsal Altbilgi
      </h2>

      <div className="container mx-auto px-4 md:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Sütun 1: Kurumsal Tanıtım */}
          <div className="space-y-4" data-testid="footer-about-col">
            <span className="text-xl font-bold text-primary tracking-tight">DoğruAdres</span>
            <p className="text-xs sm:text-sm text-secondary leading-relaxed">
              Otomotiv sektöründeki profesyonel işletmeler için kapalı B4B ticaret, tedarik ve
              bütünleşik kurumsal çalışma alanı platformu.
            </p>
            <div className="text-xs text-secondary">
              <span className="font-semibold text-primary">Erişim Sınırı: </span>
              Tamamen kapalı kurumsal B4B
            </div>
          </div>

          {/* Sütun 2: Platform Bölümleri */}
          <div className="space-y-3" data-testid="footer-platform-col">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
              Platform Bölümleri
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm">
              {CORPORATE_NAV_LINKS.map((item) => (
                <li key={item.href}>
                  <LocalizedClientLink
                    href={item.href}
                    className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xs"
                  >
                    {item.label}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Sütun 3: Kurumsal Erişim */}
          <div className="space-y-3" data-testid="footer-access-col">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
              Giriş ve Başvuru
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <a
                  href="/personal"
                  className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xs"
                >
                  Kullanıcı Girişi
                </a>
              </li>
              <li>
                <a
                  href="/personal"
                  className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xs"
                >
                  Yeni Hesap Oluştur
                </a>
              </li>
              <li>
                <LocalizedClientLink
                  href="/forgot-password"
                  className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xs"
                >
                  Parola Sıfırlama
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink
                  href="/auth/verify-email"
                  className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xs"
                >
                  E-posta Doğrulama
                </LocalizedClientLink>
              </li>
            </ul>
          </div>

          {/* Sütun 4: Yasal & Politika */}
          <div className="space-y-3" data-testid="footer-policy-col">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
              Yasal ve Gizlilik
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <span className="text-secondary hover:text-primary transition-colors cursor-default">
                  Kullanım Koşulları
                </span>
              </li>
              <li>
                <span className="text-secondary hover:text-primary transition-colors cursor-default">
                  Gizlilik ve KVKK Politikası
                </span>
              </li>
              <li>
                <span className="text-secondary hover:text-primary transition-colors cursor-default">
                  Çerez Politikası
                </span>
              </li>
              <li>
                <span className="text-secondary hover:text-primary transition-colors cursor-default">
                  Kurumsal Güvenlik İlkeleri
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Alt Çizgi ve Telif Hakkı */}
        <div className="mt-12 pt-8 border-t border-primary flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-secondary" data-testid="footer-copyright">
          <p>© 2026 DoğruAdres. Tüm hakları saklıdır.</p>
          <p>Kapalı B4B Otomotiv Çözüm Platformu</p>
        </div>
      </div>
    </footer>
  )
}
