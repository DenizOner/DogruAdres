export function HowItWorksSection() {
  const steps = [
    {
      step: "01",
      title: "Kişisel Hesap Oluşturma",
      description:
        "Her gerçek kişi için tek bir güvenli DoğruAdres hesabı oluşturulur. E-posta doğrulaması tamamlanır; kişisel alan şirket bağlamından bağımsızdır.",
      note: "Tek hesap, çoklu şirket yönetimi",
    },
    {
      step: "02",
      title: "İşletme Başvurusu ve Doğrulama",
      description:
        "Kişisel hesaptan ticari işletme (tüzel kişi veya şahıs işletmesi) başvurusu yapılır. Resmi şirket kayıt bilgileri girilir ve güncel vergi levhası yüklenir.",
      note: "Belge ve resmi sicil incelemesi",
    },
    {
      step: "03",
      title: "Yetkili Şirket Çalışma Alanı",
      description:
        "Platform yönetimi incelemesi sonrası onaylanan işletme çalışma alanı aktifleşir. Şirket sahibi (Owner), çalışma arkadaşlarına rol bazlı davet gönderir.",
      note: "Rol bazlı üyelik ve şube yetkileri",
    },
    {
      step: "04",
      title: "Mağaza, Tedarik ve Modüller",
      description:
        "Doğrulanmış işletme; kapalı B4B pazarında yetkili alım yapar, onaylı mağaza açarak satış teklifi sunar; filo, iş ilanı ve muhasebe modüllerini kullanır.",
      note: "Kapalı B4B ticareti ve entegre araçlar",
    },
  ]

  return (
    <section
      id="nasil-calisir"
      className="py-16 md:py-24 bg-secondary/20 border-b border-primary scroll-mt-20"
      data-testid="welcome-how-it-works-section"
      aria-labelledby="how-it-works-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-12 sm:mb-16">
          <h2
            id="how-it-works-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-primary"
            data-testid="how-it-works-heading"
          >
            DoğruAdres Nasıl Çalışır?
          </h2>
          <p className="text-base sm:text-lg text-secondary">
            Bireysel kayıt, kurumsal doğrulama ve yetkili çalışma alanına uzanan 4 adımlı güvenli süreç.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {steps.map((item, idx) => (
            <div
              key={item.step}
              className="relative p-6 rounded-sm bg-primary border border-primary flex flex-col justify-between"
              data-testid={`how-it-works-step-${idx + 1}`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-extrabold text-blue-600/40 tracking-wider">
                    {item.step}
                  </span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-component text-secondary border border-primary">
                    {item.note}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-primary">{item.title}</h3>
                <p className="text-sm text-secondary leading-relaxed">{item.description}</p>
              </div>

              {idx < steps.length - 1 && (
                <div
                  className="hidden lg:block absolute -right-4 top-1/2 -translate-y-1/2 z-10 text-secondary font-bold text-lg pointer-events-none"
                  aria-hidden="true"
                >
                  →
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Önemli Güvence ve Şeffaflık Bildirimi */}
        <div className="mt-12 p-6 rounded-sm bg-component/60 border border-primary max-w-3xl mx-auto text-center space-y-3">
          <p className="text-xs sm:text-sm text-secondary leading-relaxed">
            <strong className="text-primary font-semibold">Şeffaf Kurumsal Politika: </strong>
            DoğruAdres platformunda otomatik onay, koşulsuz mağaza açma veya garantili indirim vaat edilmez.
            Tüm başvurular ve mağaza açılışları, güvenli ve adil bir ticaret ortamı için platform yönetimi
            tarafından incelenir ve doğrulanır.
          </p>
          <div className="pt-2">
            <a
              href="/personal"
              className="inline-flex items-center justify-center px-6 py-2.5 rounded-sm text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              data-testid="welcome-how-it-works-cta"
            >
              Hemen Başvurun
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
