import LocalizedClientLink from "@/components/molecules/LocalizedLink/LocalizedLink"

interface WelcomeHeaderProps {
  locale: string
}

export function WelcomeHeader({ locale }: WelcomeHeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-primary bg-primary/95 backdrop-blur-md transition-colors"
      data-testid="welcome-header"
    >
      <div className="container mx-auto flex h-20 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo / Marka */}
        <div className="flex items-center gap-3">
          <LocalizedClientLink
            href="/"
            className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-sm"
            aria-label="DoğruAdres Kurumsal Ana Sayfası"
            data-testid="welcome-logo-link"
          >
            <img
              src="/Logo.svg"
              width={140}
              height={44}
              alt="DoğruAdres Logo"
              className="h-10 w-auto"
            />
          </LocalizedClientLink>
          <span className="hidden xl:inline-block border-l border-primary pl-3 text-xs font-medium text-secondary uppercase tracking-wider">
            Kurumsal Otomotiv B4B
          </span>
        </div>

        {/* Kurumsal Gezinme (Erişilebilir Bölüm Bağlantıları) */}
        <nav
          className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-medium text-secondary"
          aria-label="Sayfa bölümleri"
          data-testid="welcome-navigation"
        >
          <a
            href="#kimler-icin"
            className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xs px-1 py-0.5"
            data-testid="welcome-nav-audiences"
          >
            Kimler İçin?
          </a>
          <a
            href="#cozumler"
            className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xs px-1 py-0.5"
            data-testid="welcome-nav-solutions"
          >
            Bütünleşik Çözümler
          </a>
          <a
            href="#nasil-calisir"
            className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xs px-1 py-0.5"
            data-testid="welcome-nav-how-it-works"
          >
            Nasıl Çalışır?
          </a>
          <a
            href="#guven-ve-sss"
            className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xs px-1 py-0.5"
            data-testid="welcome-nav-faq"
          >
            Kurumsal Güven & SSS
          </a>
        </nav>

        {/* Ana Aksiyonlar (Giriş Yap ve Hesap Oluştur) */}
        <div className="flex items-center gap-3" data-testid="welcome-header-actions">
          <LocalizedClientLink
            href="/login"
            className="inline-flex items-center justify-center rounded-sm px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-component transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            data-testid="welcome-login-button"
          >
            Giriş Yap
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/register"
            className="inline-flex items-center justify-center rounded-sm px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            data-testid="welcome-register-button"
          >
            Hesap Oluştur
          </LocalizedClientLink>
        </div>
      </div>
    </header>
  )
}
