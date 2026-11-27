export function WelcomeHero() {
  return (
    <section
      className="relative overflow-hidden py-16 md:py-24 lg:py-32 bg-primary border-b border-primary"
      data-testid="welcome-hero"
      aria-labelledby="welcome-hero-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Rozet / Üst Vurgu */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs sm:text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" aria-hidden="true" />
            <span>Otomotiv Sektörüne Özel Kapalı B4B Platformu</span>
          </div>

          {/* Ana Slogan */}
          <h1
            id="welcome-hero-heading"
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-primary leading-tight"
            data-testid="welcome-hero-heading"
          >
            Doğru müşteriye, doğru tedarikçiye, doğru fiyatla{" "}
            <span className="text-blue-600">DoğruAdres’te</span> ulaşın.
          </h1>

          {/* Alt Metin / Konumlandırma */}
          <p
            className="text-base sm:text-lg md:text-xl text-secondary max-w-3xl mx-auto font-normal leading-relaxed"
            data-testid="welcome-hero-positioning"
          >
            DoğruAdres, otomotiv sektöründeki profesyonel işletmeler için yalnız bir pazaryeri değil;
            ticareti, tedariki ve iş süreçlerini ortak kurumsal çalışma ortamında birleştiren bütünleşik
            çözüm platformudur. Servis/onarım, perakende yedek parça mağazası, toptancı/distribütör,
            üretici, filo/kurumsal araç işletmecisi ve sigorta/hasar yönetimi kullanıcılarına hitap eder.
          </p>

          {/* Aksiyon Butonları */}
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
            data-testid="welcome-hero-ctas"
          >
            <a
              href="/personal"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 rounded-sm text-base font-semibold bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-all shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              data-testid="welcome-hero-login-cta"
            >
              Giriş Yap
            </a>
            <a
              href="/personal?action=register#register-details"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 rounded-sm text-base font-semibold border-2 border-primary text-primary hover:bg-component transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              data-testid="welcome-hero-register-cta"
            >
              Hesap Oluştur
            </a>
          </div>

          {/* Güven ve Nitelik Vurguları (Katalog/Fiyat Açılmadan Kurumsal Güvence) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12 border-t border-primary text-left">
            <div className="p-4 rounded-sm bg-component/50 border border-primary space-y-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 font-bold text-sm">
                1
              </div>
              <h2 className="text-base font-semibold text-primary">Tamamen Kapalı B4B</h2>
              <p className="text-xs sm:text-sm text-secondary">
                Fiyatlar, stoklar ve ticari teklifler yalnızca doğrulanmış kurumsal işletmelere açıktır;
                yetkisiz kamuya kapalıdır.
              </p>
            </div>

            <div className="p-4 rounded-sm bg-component/50 border border-primary space-y-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 font-bold text-sm">
                2
              </div>
              <h2 className="text-base font-semibold text-primary">Doğrulanmış İşletmeler</h2>
              <p className="text-xs sm:text-sm text-secondary">
                Her ticari kuruluş vergi levhası ve resmi şirket bilgileriyle incelenerek onaylanır;
                güvenli ticaret ortamı korunur.
              </p>
            </div>

            <div className="p-4 rounded-sm bg-component/50 border border-primary space-y-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 font-bold text-sm">
                3
              </div>
              <h2 className="text-base font-semibold text-primary">Bütünleşik Süreçler</h2>
              <p className="text-xs sm:text-sm text-secondary">
                Tedarikten iş ilanına, filo takibinden temel muhasebeye tüm otomotiv iş akışları
                tek ortak çalışma alanında yönetilir.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
