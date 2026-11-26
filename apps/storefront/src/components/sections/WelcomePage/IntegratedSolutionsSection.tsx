export function IntegratedSolutionsSection() {
  const solutions = [
    {
      id: "b4b-ticaret",
      title: "B4B Ticaret ve Tedarik",
      description:
        "Yalnızca doğrulanmış kurumsal işletmeler arasında kapalı ticaret. Satıcı mağazalarına özel satış teklifleri, alıcı kuruluş segmentine uygun fiyatlandırma, asgari sepet ve sipariş kuralları, çoklu para birimi ve kur yönetimi ile tam kontrol.",
      features: [
        "Kapalı kurumsal pazar ve yetkili alıcılar",
        "Mağazaya ve alıcı segmentine özel teklifler",
        "TCMB kur gözlemleri ve TL tahsilat güvencesi",
      ],
      icon: "🤝",
    },
    {
      id: "is-ilanlari",
      title: "İş İlanları Panosu",
      description:
        "Otomotiv sektörüne özel kariyer ve nitelikli istihdam köprüsü. Doğrulanmış işletmelerin iş ilanı yayımlaması, e-posta doğrulamış adayların başvuru süreçleri; personel ve özel çalışan verileri iş ilanından bağımsız korunur.",
      features: [
        "Sektörel uzmanlık odaklı ilan yayını",
        "Kişisel gizlilik ve yetkilendirilmiş başvuru",
        "Ayrı İK modülüne gerek olmadan hızlı yönetim",
      ],
      icon: "📋",
    },
    {
      id: "muhasebe-finans",
      title: "Muhasebe ve Finans",
      description:
        "İşletmeler için platform içi temel muhasebe ve finans takibi: Çift taraflı denklik, değişmez muhasebe kayıtları, satıcı bakiye özeti, komisyon ve net hakların ayrı izlenmesi ile şeffaf mali yapı.",
      features: [
        "Çift taraflı denklik ve değişmez kayıt izi",
        "Satıcı hesap özeti ve net komisyon ayrımı",
        "İşletme içi şeffaf finansal kontrol",
      ],
      icon: "📊",
    },
    {
      id: "filo-yonetimi",
      title: "Filo Yönetimi",
      description:
        "Kuruluşa ait ticari ve binek araçların kaydı, plaka ve şasi (VIN) takibi. Araçların periyodik bakım ihtiyaçlarının ve parça taleplerinin doğrudan araç kartıyla ilişkilendirilerek tekliflendirilmesi.",
      features: [
        "Plaka ve şasi (VIN) bazlı araç envanteri",
        "Kuruluşa özel mülkiyet ve veri yalıtımı",
        "Araca bağlı parça ve bakım teklif süreçleri",
      ],
      icon: "🚗",
    },
    {
      id: "musteri-segmentasyonu",
      title: "Müşteri Segmentasyonu",
      description:
        "Kuruluşların ticari etkinliğine, işlem hacmine ve güvenilirliğine dayalı merkezi segmentasyon. Standart ve Altın Doğrulanmış kurumsal rozetler ve segment bazlı ticari avantajlar.",
      features: [
        "Kurumsal aktivite ve hacim metrikleri",
        "Standart ve Altın Doğrulanmış rozetleri",
        "Alıcı segmentine göre geçerli en uygun fiyat",
      ],
      icon: "⭐",
    },
    {
      id: "isletme-uygulamalari",
      title: "İşletme Uygulamaları",
      description:
        "Her işletmeye özel modüler kurumsal çalışma alanı. Rol bazlı üyelik ve yetkilendirme, şirket sahibi (Owner) kontrolleri, şube ve işlem sınırları ile sunucu düzeyinde denetim izleri.",
      features: [
        "Rol bazlı davet ve yetki dağıtımı",
        "Şube ve çalışma alanı yapılandırması",
        "Sunucu düzeyinde fail-closed denetim günlüğü",
      ],
      icon: "🏢",
    },
  ]

  return (
    <section
      id="cozumler"
      className="py-16 md:py-24 bg-primary border-b border-primary scroll-mt-20"
      data-testid="welcome-solutions-section"
      aria-labelledby="solutions-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-12 sm:mb-16">
          <h2
            id="solutions-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-primary"
            data-testid="solutions-heading"
          >
            Tek Platform, Bütünleşik Çözümler
          </h2>
          <p className="text-base sm:text-lg text-secondary">
            Otomotiv ticaretini, iş gücünü, filo operasyonlarını ve temel finansı
            birbirine bağlı tek ekosistemde buluşturan kurumsal modüller.
          </p>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
          data-testid="solutions-grid"
        >
          {solutions.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between p-6 sm:p-8 rounded-sm bg-component/40 border border-primary hover:border-blue-500/50 transition-colors"
              data-testid={`solution-card-${item.id}`}
            >
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-sm bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-2xl">
                  <span role="img" aria-label={item.title}>
                    {item.icon}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-primary">{item.title}</h3>
                <p className="text-sm text-secondary leading-relaxed">{item.description}</p>
              </div>

              <div className="pt-6 mt-6 border-t border-primary/60">
                <ul className="space-y-2 text-xs sm:text-sm text-secondary" aria-label={`${item.title} özellikleri`}>
                  {item.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold" aria-hidden="true">
                        ✓
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
