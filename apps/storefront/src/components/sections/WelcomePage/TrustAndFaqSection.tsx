export function TrustAndFaqSection() {
  const faqs = [
    {
      q: "DoğruAdres neden bütünüyle kapalı bir B4B platformudur?",
      a: "Otomotiv sektöründeki profesyonel işletmeler arası ticari gizliliği, toptan fiyatları, stok miktarlarını ve ticari teklifleri korumak amacıyla platform tamamen kapalıdır. Giriş yapmamış ziyaretçilere ve yetkisiz kişilere katalog, fiyat veya mağaza bilgisi açılmaz; yalnızca doğrulanmış işletmeler ticaret ortamına erişebilir.",
    },
    {
      q: "Kişisel hesap ile şirket çalışma alanı arasındaki fark nedir?",
      a: "DoğruAdres'te her kullanıcı kendi adına tek bir kişisel hesap (Person) oluşturur. Kişisel alan şirketlerden bağımsızdır. Bir kullanıcı birden fazla işletmede sahip (Owner) veya yetkili çalışan olabilir. Tüm ticari alım-satım ve operasyonel işlemler şahıs adına değil, yetkili olunan işletme (Organization) çalışma alanı adına gerçekleştirilir.",
    },
    {
      q: "İşletme başvurusu nasıl incelenir ve onaylanır?",
      a: "Kişisel hesap üzerinden işletme başvurusu başlatılır. İşletmenin vergi kimlik numarası, ticaret unvanı ve güncel resmi vergi levhası sunulur. DoğruAdres platform yönetimi bu belgeleri inceler ve doğrular. Otomatik onay veya kontrolsüz geçiş yoktur; her işletmenin doğrulanmış tüzel/ticari varlığı teyit edilir.",
    },
    {
      q: "Fiyatlandırma nasıl belirlenir ve çalışır?",
      a: "Platformda satıcılar, alıcı işletmelerin faaliyet alanına ve ticari segmentine uygun teklifler tanımlar. Alıcı işletme; kendisine uygulanabilir müşteri segmentleri içindeki geçerli en uygun fiyatı görür. Kanıtsız 'en ucuz fiyat garantisi' yerine, kurallara ve yetkilere dayalı doğal ve şeffaf fiyat seçimi uygulanır.",
    },
    {
      q: "Kişisel ve kurumsal veriler nasıl korunur?",
      a: "Şirketlerin stokları, mali kayıtları, çalışan bilgileri ve özel teklifleri diğer firmalardan ve yetkisiz kullanıcılardan ayrılır. İşletme verilerine yalnızca ilgili şirketin yetkili kullanıcıları erişebilir; yetkisiz girişimler sunucu tarafından reddedilir.",
    },
    {
      q: "Hangi otomotiv işletmeleri platforma katılabilir?",
      a: "Servis ve onarım işletmeleri, perakende yedek parça mağazaları, toptancılar ve distribütörler, yedek parça üreticileri, filo ve kurumsal araç işletmecileri ile sigorta ve hasar yönetimi kuruluşları geçerli vergi levhası ile başvuruda bulunabilir.",
    },
  ]

  return (
    <section
      id="guven-ve-sss"
      className="py-16 md:py-24 bg-primary border-b border-primary scroll-mt-20"
      data-testid="welcome-faq-section"
      aria-labelledby="faq-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-12 sm:mb-16">
          <h2
            id="faq-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-primary"
            data-testid="faq-heading"
          >
            Kurumsal Güven Yaklaşımı ve SSS
          </h2>
          <p className="text-base sm:text-lg text-secondary">
            Kapalı B4B yapısı, kurumsal doğrulama standartları ve platform işleyişi hakkında
            sıkça sorulan sorular.
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-4" data-testid="faq-list">
          {faqs.map((item, idx) => (
            <details
              key={idx}
              className="group border border-primary rounded-sm bg-component/30 open:bg-component/60 transition-colors p-5 sm:p-6"
              data-testid={`faq-item-${idx + 1}`}
            >
              <summary className="flex items-center justify-between cursor-pointer font-semibold text-base sm:text-lg text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xs select-none">
                <span>{item.q}</span>
                <span
                  className="ml-4 text-blue-600 font-bold transition-transform group-open:rotate-180"
                  aria-hidden="true"
                >
                  ↓
                </span>
              </summary>
              <div className="mt-4 pt-4 border-t border-primary/50 text-sm sm:text-base text-secondary leading-relaxed">
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
