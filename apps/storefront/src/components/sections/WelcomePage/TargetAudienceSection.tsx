export function TargetAudienceSection() {
  const audiences = [
    {
      id: "servis-onarım",
      title: "Servis ve Onarım İşletmeleri",
      description:
        "Otomotiv bakım ve onarım servisleri; ihtiyaç duydukları orijinal ve eşdeğer yedek parçaları yetkili distribütör ve toptancılardan güvenle temin eder, teklif süreçlerini yönetir, araç ve servis geçmişini kurumsal çalışma alanında takip eder.",
      tag: "Doğru Parça & Hızlı Tedarik",
      icon: "🔧",
    },
    {
      id: "perakende-magaza",
      title: "Perakende Yedek Parça Mağazaları",
      description:
        "Otomotiv yedek parça perakendecileri; toptan tedarik kanallarına doğrudan erişir, geniş parça referanslarına ulaşır, kendi kurumsal satış tekliflerini ve stoklarını kapalı B4B ortamında yetkili alıcılara sunar.",
      tag: "Geniş Tedarik & Satış Ağı",
      icon: "🏪",
    },
    {
      id: "toptanci-distributor",
      title: "Toptancı ve Distribütörler",
      description:
        "Geniş ürün gamına ve bölgesel/ulusal dağıtım gücüne sahip toptancılar; kurumsal alıcı segmentlerine özel fiyatlandırma ve ticari koşullar tanımlar, güvenli sipariş ve sevkiyat süreçlerini şeffafça yönetir.",
      tag: "Segment Fiyatı & Dağıtım",
      icon: "📦",
    },
    {
      id: "uretici",
      title: "Üreticiler",
      description:
        "Yedek parça ve otomotiv aksamı üreticileri; ürün kataloglarını ve referanslarını platforma aktarır, dağıtım ağını ve doğrudan kurumsal tedarik kanallarını kurumsal kontrol altında yönetir.",
      tag: "Katalog & Doğrudan Kanal",
      icon: "🏭",
    },
    {
      id: "filo-isletmecisi",
      title: "Filo ve Kurumsal Araç İşletmecileri",
      description:
        "Şirket araç filolarını yöneten işletmeler; filolarındaki araçların bakım, onarım ve yedek parça gereksinimlerini, kurumsal teklif alma ve tedarik süreçlerini tek merkezden yönetir.",
      tag: "Filo Bakım & Şeffaf Teklif",
      icon: "🚚",
    },
    {
      id: "sigorta-hasar",
      title: "Sigorta ve Hasar Yönetimi",
      description:
        "Kaza, hasar ve onarım süreçlerinde doğru yedek parçanın, şeffaf kurumsal tekliflerin ve tedarikçilerin doğrulukla eşleştirilmesi; kurumsal denetim ve süreç takibi tek platformda buluşur.",
      tag: "Hasar Yönetimi & Denetim",
      icon: "🛡️",
    },
  ]

  return (
    <section
      id="kimler-icin"
      className="py-16 md:py-24 bg-secondary/30 border-b border-primary scroll-mt-20"
      data-testid="welcome-audiences-section"
      aria-labelledby="audiences-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-12 sm:mb-16">
          <h2
            id="audiences-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-primary"
            data-testid="audiences-heading"
          >
            DoğruAdres Kimler İçin?
          </h2>
          <p className="text-base sm:text-lg text-secondary">
            Otomotiv sektörünün 6 ana faaliyet grubu için ortak kurumsal çalışma ortamı,
            özelleştirilmiş yetkiler ve güvenli kapalı B4B ticareti.
          </p>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
          data-testid="audiences-grid"
        >
          {audiences.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between p-6 sm:p-8 rounded-sm bg-primary border border-primary shadow-xs hover:shadow-md transition-shadow"
              data-testid={`audience-card-${item.id}`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-3xl" role="img" aria-label={item.title}>
                    {item.icon}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                    {item.tag}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-primary">{item.title}</h3>
                <p className="text-sm text-secondary leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
