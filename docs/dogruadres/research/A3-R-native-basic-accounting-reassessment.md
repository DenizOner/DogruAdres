**A3-R değerlendirmesi — 10 Ekim 2026**

**Önerim: DoğruAdres, mevcut PostgreSQL üzerinde, resmi Medusa modül sınırlarına uyan, dar kapsamlı bir Basic Accounting uygulamasını tercih etmelidir.** İçeride çift taraflı kayıt kullanılmalı; kullanıcıya tam ERP veya yasal muhasebe sistemi sunulmamalıdır. Bigcapital alternatif muhasebe sağlayıcısı olarak değerlendirilebilir, fakat varsayılan platform bağımlılığı yapılmamalıdır.

Bu sonuç uygulama onayı değildir. Veri sahipliği, yetkilendirme, muhasebeleştirme ve saklama kararları ürün sahibi tarafından onaylanmadan uygulamaya geçilmemelidir.

Rapordaki işaretler:

- **VERIFIED:** Yerel dosya, kurulu paket veya resmi kaynakla doğrulandı.
- **INFERRED:** Doğrulanmış bulgulardan çıkarılan değerlendirme.
- **RECOMMENDED:** Önerilen, henüz onaylanmamış tasarım veya ürün davranışı.
- **UNVERIFIED:** Mevcut kanıtla doğrulanamadı.

---

**1. Yönetici değerlendirmesi**

**INFERRED — Teknik olarak yapılabilir; kolay bir CRUD uygulaması değildir.** İstenen kapsamın zorluğu müşteri kartı veya belge ekranından çok, kısmi kapama, düzeltme, kur farkı, eşzamanlı işlem ve geçmiş kayıt bütünlüğündedir.

DoğruAdres’in tercihleri yerel seçeneği destekliyor:

- TypeScript ve PostgreSQL mevcut teknoloji yığınıdır.
- Muhasebe kuruluşun özel alanıdır; mağazalar muhasebe kayıtlarında analitik boyut olarak korunabilir.
- Aynı kimlik, uygulama etkinleştirme ve çok dilli arayüz kullanılabilir.
- Kuruluş başına yeni veritabanı oluşturmak gerekmez.
- Orders, refunds, commissions ve Payout kayıtları yeniden uygulanmaz.
- Harici muhasebe sağlayıcılarına geçiş için ortak olay/aktarımı sınırı kurulabilir.

**RECOMMENDED — “Hafiflik” finansal kontrolü azaltarak değil, desteklenen iş akışlarını sınırlayarak sağlanmalıdır.** Serbest yevmiye, stok maliyetleme, bordro, vergi beyannamesi ve kapsamlı dönem sonu işlemleri ilk sürüme alınmamalıdır.

**UNVERIFIED — Önceki A3 raporu depoda bulunamadı.** Önceki öneriyi yalnızca bu görevde verilen özet üzerinden yeniden değerlendiriyorum; raporun bütün varsayımlarını satır satır denetlediğimi iddia etmiyorum.

---

**2. Yeniden değerlendirilen Bigcapital bulguları**

**VERIFIED — Bigcapital bir muhasebe uygulamasıdır; gömülebilir basit ledger kütüphanesi değildir.** Resmi depo headless API ve çift taraflı muhasebe kullanımını tanımlar. [Resmi depo](https://github.com/bigcapitalhq/bigcapital)

İncelenen güncel `develop` kaynak anı:

`0ca638f9c3c3b0847e6d27bb2735e836d5a79bb0`

Bu kaynak anı, kurulmuş veya üretimde doğrulanmış bir Bigcapital sürümü değildir.

**VERIFIED — Kuruluş başına muhasebe veritabanı yaklaşımı devam ediyor.**

- Tenant veritabanı istemcisi `mysql`.
- Tenant veritabanı adı için ayrı prefix kullanılıyor.
- Tenant manager kuruluş veritabanını oluşturuyor, migrate ediyor ve seed ediyor.
- Gerçek veritabanı oluşturma işlemi kaynakta mevcut.

Kaynaklar: [tenant yapılandırması](https://github.com/bigcapitalhq/bigcapital/blob/0ca638f9c3c3b0847e6d27bb2735e836d5a79bb0/packages/server/src/common/config/tenant-database.ts), [tenant yaşam döngüsü](https://github.com/bigcapitalhq/bigcapital/blob/0ca638f9c3c3b0847e6d27bb2735e836d5a79bb0/packages/server/src/modules/TenantDBManager/TenantsManager.ts), [veritabanı yöneticisi](https://github.com/bigcapitalhq/bigcapital/blob/0ca638f9c3c3b0847e6d27bb2735e836d5a79bb0/packages/server/src/modules/TenantDBManager/TenantDBManager.ts).

**INFERRED — Bu, müşteri başına ayrı sunucu zorunluluğu değildir; fakat müşteri başına veritabanı yaşam döngüsü yüküdür.** Provisioning durumları, toplu migration, başarısız tenant yükseltmeleri, yedek katalogları ve geri yükleme eşlemesi yönetilmelidir. DoğruAdres’in tek PostgreSQL tercihiyle doğrudan uyuşmaz.

**VERIFIED — Kimlik bulguları önceki değerlendirmeye göre güncellenmelidir.** Güncel kaynakta kullanıcı–tenant üyeliği denetleniyor. API başlıkları JWT veya `bc_` önekli API anahtarıyla Bearer kimlik doğrulamayı tanımlıyor; JWT kullanımında `organization-id` bekleniyor. Dolayısıyla eski “tek kullanıcı yalnız tek kuruluş” varsayımı güncel kaynak için geçerli kabul edilemez. [Tenant guard](https://github.com/bigcapitalhq/bigcapital/blob/0ca638f9c3c3b0847e6d27bb2735e836d5a79bb0/packages/server/src/modules/Tenancy/TenancyGlobal.guard.ts), [API başlıkları](https://github.com/bigcapitalhq/bigcapital/blob/0ca638f9c3c3b0847e6d27bb2735e836d5a79bb0/packages/server/src/common/decorators/ApiCommonHeaders.ts)

**UNVERIFIED — Bu, DoğruAdres SSO ve yetki modelinin hazır olduğu anlamına gelmez.** API anahtarının tenant kapsamı, rotasyonu, iptali, servis hesabı yetkileri ve kuruluş provisioning sözleşmesi ayrıca doğrulanmalıdır.

**VERIFIED — İncelenen kaynakta satış belgesi, tahsilat, tedarikçi ödemesi ve rapor controller’ları bulunuyor.** Örneğin `sale-invoices`, `payment-received`, `bill-payments` ve `/reports/balance-sheet` yüzeyleri mevcut. Bunların varlığı üretim entegrasyonunun idempotent veya bütün iş akışlarının doğru olduğunu tek başına kanıtlamaz. [Satış belgeleri](https://github.com/bigcapitalhq/bigcapital/blob/0ca638f9c3c3b0847e6d27bb2735e836d5a79bb0/packages/server/src/modules/SaleInvoices/SaleInvoices.controller.ts), [tahsilatlar](https://github.com/bigcapitalhq/bigcapital/blob/0ca638f9c3c3b0847e6d27bb2735e836d5a79bb0/packages/server/src/modules/PaymentReceived/PaymentsReceived.controller.ts), [tedarikçi ödemeleri](https://github.com/bigcapitalhq/bigcapital/blob/0ca638f9c3c3b0847e6d27bb2735e836d5a79bb0/packages/server/src/modules/BillPayments/BillPayments.controller.ts)

**INFERRED — Harici motorun başlıca avantajı hazır muhasebe işlevleridir; başlıca maliyeti ikinci uygulama platformudur.** Resmi production Compose; uygulama, MySQL/MariaDB, Redis, proxy, belge üretimi ve başka destek bileşenlerini içeriyor. Bunların tümü her headless kurulum için zorunlu sayılmamalıdır; yine de ayrı işletim yüzeyi açıktır. [Production Compose](https://github.com/bigcapitalhq/bigcapital/blob/0ca638f9c3c3b0847e6d27bb2735e836d5a79bb0/docker-compose.prod.yml)

Bigcapital seçilirse ayrıca:

- Kuruluş açılışı tekrar çalıştırılabilir bir durum makinesi olmalı.
- DoğruAdres kuruluşu ↔ Bigcapital tenant eşlemesi kalıcı ve denetlenebilir olmalı.
- Ağ zaman aşımından sonra işlem sonucunu sorgulama/mutabakat yapılmalı.
- Bağımsız yedek, restore tatbikatı, migration ve sürüm sabitleme gerekir.
- DoğruAdres arayüzü için ayrı adapter ve ekranlar yine geliştirilir.
- Pazaryeri checkout’u Bigcapital erişilebilirliğine bağlanmamalıdır.

---

**3. Yerel DoğruAdres modülünün uygulanabilirliği ve sürüm uyumu**

**VERIFIED — Kurulu paketler görevdeki sürümlerle uyumlu:**

- `@mercurjs/core`: **2.3.6**
- `@medusajs/framework`: **2.21.2**
- API manifestindeki Medusa bağımlılıkları: **2.21.2**

Kanıt: [API package.json](D:/DogruAdres/packages/api/package.json), [kurulu Mercur manifesti](D:/DogruAdres/packages/api/node_modules/@mercurjs/core/package.json), [kurulu Medusa framework manifesti](D:/DogruAdres/packages/api/node_modules/@medusajs/framework/package.json).

**VERIFIED — Kurulu Mercur belgeleri tek PostgreSQL, modül başına veri sahipliği, dışarıda tanımlanan module link’ler ve workflow üzerinden mutation yaklaşımını açıklıyor.** Özel modüller standart Medusa modülleridir. [Kurulu mimari belgesi](D:/DogruAdres/node_modules/@mercurjs/docs/content/learn/architecture.mdx), [modüller](D:/DogruAdres/node_modules/@mercurjs/docs/content/resources/best-practices/modules.mdx), [workflow’lar](D:/DogruAdres/node_modules/@mercurjs/docs/content/resources/best-practices/workflows.mdx)

**RECOMMENDED — Yerleşim:**

| Katman | Sorumluluk |
|---|---|
| Muhasebe modülü | Kendi belgeleri, hesapları, fişleri, hareketleri ve kapama ilişkileri |
| Saf TypeScript domain hesapları | Dengeli fiş üretimi, tutar ve kur hesapları |
| Workflow/step | Yetki, aktivasyon, iş kuralı ve işlem koordinasyonu |
| Muhasebe persistence işlemi | Tek atomik finansal kayıt mutasyonu |
| Pazaryeri adapter’ı | Yetkili commerce verisini muhasebe olayına dönüştürme |
| Subscriber/job | Asenkron aktarım, tekrar deneme ve mutabakat |
| API/UI | Yetkili komutlar, sorgular ve ortak DoğruAdres deneyimi |

**Önemli sınır:** Fiş başlığı, satırları, belge kesinleşmesi ve idempotency kaydı bağımsız workflow adımlarına dağıtılmamalıdır. Bunlar bir finansal mutasyonun atomik parçalarıdır.

**VERIFIED — Kurulu Medusa 2.21.2 transaction decorator’ı mevcut transaction context’ini kullanabiliyor; repository transaction sözleşmesi isolation seçeneğini içeriyor.** Bununla birlikte seçilecek kilitleme, constraint ve posting tasarımı henüz çalışma zamanı testleriyle doğrulanmadı.

**INFERRED — Mercur’un “thin module / bir mutation per step” kuralıyla finansal atomiklik bağdaşabilir:** iş kuralları workflow/domain katmanında kalır; modül yalnız kendi finansal aggregate’ını atomik persist eder. Bu sınır ileride PoC’de açıkça kanıtlanmalıdır.

Resmi Medusa belgeleri de modül izolasyonu ve transaction context yaklaşımını açıklıyor; bunları kurulu sürüm kanıtının yerine kullanmadım. [Modül izolasyonu](https://docs.medusajs.com/learn/fundamentals/modules/isolation), [veritabanı işlemleri](https://docs.medusajs.com/learn/fundamentals/modules/db-operations)

---

**4. Kütüphane adayları ve kesin lisans bulguları**

| Ürün/bileşen | Doğrulanan işlev | Lisans | DoğruAdres değerlendirmesi |
|---|---|---|---|
| Bigcapital | Tam muhasebe uygulaması, API, çift taraflı kayıt ve raporlar | AGPL-3.0 | Harici sağlayıcı olabilir; yerel modül kütüphanesi olarak ele alınmamalı |
| Akaunting 3.2.4 | PHP/Laravel muhasebe uygulaması; belge, ödeme ve rapor akışları | BUSL-1.1; değişim lisansı GPLv3 | Mevcut kullanım izni DoğruAdres muhasebe hizmetine uygun görünmüyor |
| Dinero.js 2.0.2 | Para değeri, currency/scale, dağıtım, dönüşüm, `bigint` desteği | MIT | Para değer nesnesi için güçlü aday; ledger değildir |
| decimal.js 10.6.0 | Keyfi hassasiyetli ondalık hesap, TypeScript tanımları | MIT | Kur, oran ve kontrollü yuvarlama için aday; ledger değildir |
| big.js 7.0.1 | Daha küçük ondalık aritmetik bileşeni | MIT | decimal.js alternatifi; TS tipleri ayrı paketten gelir |

Kaynaklar: [Dinero lisansı](https://raw.githubusercontent.com/dinerojs/dinero.js/v2.0.2/LICENSE), [Dinero özellikleri](https://github.com/dinerojs/dinero.js), [decimal.js lisansı](https://raw.githubusercontent.com/MikeMcl/decimal.js/v10.6.0/LICENCE.md), [decimal.js özellikleri](https://github.com/MikeMcl/decimal.js), [big.js lisansı](https://raw.githubusercontent.com/MikeMcl/big.js/v7.0.1/LICENCE.md), [big.js TypeScript yaklaşımı](https://github.com/MikeMcl/big.js).

**VERIFIED — Bakım göstergeleri:** Dinero’nun resmi release listesinde 13 Mart 2026 tarihli 2.0.2 bulunuyor. Resmi GitHub API sorguları Bigcapital ve Akaunting’de Ekim 2026, decimal.js’de Ağustos 2026, big.js’de Nisan 2025 push etkinliği gösterdi; depolar arşivlenmiş değil. Push tarihi destek garantisi veya finansal doğruluk sertifikası değildir. [Dinero releases](https://github.com/dinerojs/dinero.js/releases), [Bigcapital depo metadatası](https://api.github.com/repos/bigcapitalhq/bigcapital), [Akaunting depo metadatası](https://api.github.com/repos/akaunting/akaunting), [decimal.js metadatası](https://api.github.com/repos/MikeMcl/decimal.js), [big.js metadatası](https://api.github.com/repos/MikeMcl/big.js)

**VERIFIED — Akaunting lisansının mevcut ek kullanım izni:**

- İki kullanıcı, bir şirket veya bin fatura sınırlarının aşılmasını kısıtlıyor.
- Ticari veya kâr amacı gütmeyen dağıtımda yeniden markalama/white-label kullanımını kısıtlıyor.
- Üçüncü tarafların muhasebe veya faturalama özelliklerinden yararlandığı ticari “Accounting Service” kullanımını kısıtlıyor.
- Belirli yayımlanmış sürüm için dört yıl sonra GPLv3’e geçiş tanımlıyor.

**INFERRED — DoğruAdres’in müşterilerine sunduğu entegre muhasebe, üçüncü kısıta girme riski taşır.** Eski bir sürümün lisans dönüşümü, güncel kodu otomatik serbest bırakmaz. Ticari izin olmadan önerilmez. [3.2.4 lisans metni](https://raw.githubusercontent.com/akaunting/akaunting/3.2.4/LICENSE.txt), [PHP/Laravel manifesti](https://raw.githubusercontent.com/akaunting/akaunting/master/composer.json)

**VERIFIED — Bigcapital AGPL lisanslıdır.** Değiştirilmiş yazılımla ağ üzerinden etkileşen kullanıcılara ilgili kaynak sunma yükümlülüğü özellikle önemlidir. **INFERRED:** Ayrı HTTP hizmeti kurmak, DoğruAdres’in bütün kodunu otomatik olarak AGPL yapmaz; fakat türev/birleşik eser sınırı yalnız dağıtım topolojisinden kesinleştirilemez. Kod gömme, değişiklik, dağıtım ve özel UI entegrasyonu lisans uzmanına inceletilmelidir. [İncelenen Bigcapital lisansı](https://github.com/bigcapitalhq/bigcapital/blob/0ca638f9c3c3b0847e6d27bb2735e836d5a79bb0/LICENSE)

**RECOMMENDED — Dinero + gerekirse tek ondalık hesap bileşeni değerlendirilmelidir.** decimal.js ve big.js birlikte eklenmemeli. MIT bildirimleri korunmalıdır.

**UNVERIFIED — Bu incelemede bütün ihtiyacı karşılayan, bakımı ve uygun lisansı doğrulanmış, PostgreSQL/Medusa içine doğrudan gömülebilen bir TypeScript muhasebe ledger’ı saptanmadı.** Aritmetik kütüphanesi finansal domain’in yerini tutmaz. Üçüncü bir aday eklemek için ilgisiz servis veya ERP önermiyorum.

---

**5. Minimum güvenli Basic Accounting MVP**

Aşağıdaki kapsamın tamamı **RECOMMENDED**, ürün kararı değildir.

| A — İlk sürümde gerekli | Sınır |
|---|---|
| Kuruluş muhasebe profili | Tek temel para birimi, aktivasyon, yetkiler, başlangıç tarihi |
| Müşteri/tedarikçi cari hesapları | Kuruluşa özel; müşteri ve tedarikçi rolleri birlikte olabilir |
| Satış/alış belgeleri | Taslak, kesinleşmiş, düzeltme bağlantıları; belge ve vade tarihleri |
| Alacak/borç takibi | Belge bazında açık tutar, cari ekstre, vade analizi |
| Tahsilat ve ödeme kayıtları | Gerçekleşmiş işlemi kaydetme; bankaya ödeme emri gönderme yok |
| Kısmi kapama | Bir ödeme–birçok belge, bir belge–birçok ödeme |
| Kasa/banka hesapları | Hesap bazında para birimi; manuel mutabakat |
| Giderler | Nakit gider veya tedarikçi borcu üzerinden tek kayıt |
| Credit/düzeltme belgeleri | Asıl belgeye bağlı kısmi/tam düzeltme ve ters kayıt |
| Çoklu para birimi | İşlem tutarı, temel tutar, kur snapshot’ı, gerçekleşmiş kur farkı |
| Finansal bütünlük | Çift taraflı kayıt, idempotency, immutable kesinleşmiş hareketler |
| Temel raporlar | Cari ekstre, açık alacak/borç, kasa/banka, operasyonel gelir/gider, kontrol mizanı |
| Pazaryeri bağlantısı | Sipariş, refund, commission ve payout kaynak referansları |
| Denetim/taşınabilirlik | Aktör, zaman, kaynak, politika sürümü; CSV/JSON dışa aktarım |
| Güvenli açılış | İncelenmiş başlangıç bakiyeleri veya yalnız yeni dönemden başlama |

**B — Yararlı ama ertelenebilir:**

- Banka feed’leri ve otomatik eşleştirme.
- Tekrarlayan belgeler, hatırlatmalar ve gelişmiş onay akışları.
- OCR ve belge otomasyonu.
- Gelişmiş bütçe, nakit tahmini ve özel rapor tasarımcısı.
- Serbest manuel yevmiye.
- Otomatik dönem sonu FX değerleme.
- Gelişmiş tahsilat takip araçları.
- Harici e-Fatura/e-Arşiv sağlayıcısı entegrasyonu.

**C — Basic Accounting dışında:**

- Yasal defter, e-Defter ve vergi beyannameleri.
- Tam Tekdüzen Hesap Planı uyumluluğu iddiası.
- Bordro, amortisman, üretim ve kapsamlı stok maliyetleme.
- Şirketler arası konsolidasyon.
- Pazaryeri ödeme/payout motorunu yeniden yazma.
- Bankacılık, kredi veya ödeme kuruluşu işlevleri.
- Tam ERP satın alma ve depo yönetimi.

**Ön muhasebe–yasal muhasebe ayrımı:** Belge ve cari bakiye yönetmek yasal belge düzenlemekle aynı şey değildir. Kontrol mizanı veya operasyonel gelir/gider raporu da yasal bilanço ya da doğru net kâr iddiası taşımaz.

Özellikle ticari mal alışları otomatik olarak gider sayılmamalıdır. Stok/maliyetleme kapsam dışıysa uygun sınıflama veya muhasebeciye aktarım gerekir; gerçek brüt kâr raporu vaat edilmemelidir.

Akaunting’in resmi kısmi ödeme akışları da belge, ödeme hesabı ve gerçekleşmiş ödeme tutarının ayrı tutulduğunu gösteriyor. Bu iş akışı bilgisi kullanılabilir; kod veya ekran kopyalama hakkı vermez. [Kısmi tahsilat](https://akaunting.com/hc/docs/invoices-and-estimates/splitting-invoice-payment/), [kısmi tedarikçi ödemesi](https://akaunting.com/hc/docs/bills/splitting-bill-payment/)

---

**6. Çift taraflı kayıt ve finansal bütünlük stratejisi**

**RECOMMENDED — Bu MVP için içeride çift taraflı kayıt kullanılmalıdır.** Kullanıcı yevmiye ekranı görmek zorunda değildir. Kasa/banka, alacak/borç, marketplace clearing, iadeler ve FX birlikte olduğunda yalnız “cari bakiye artır/azalt” yaklaşımı hata tespitini zayıflatır.

Çift taraflı kayıt tek başına doğru hesap seçimini garanti etmez; dengeli ama yanlış bir fiş mümkündür.

| Zorunlu soru | Öneri ve önlenen somut hata |
|---|---|
| 1. Çift taraflı kayıt | Otomatik posting şablonları; karşılığı olmayan kasa veya cari hareketi önlenir |
| 2. Asgari hesap modeli | Kasa/banka, alacak, borç, marketplace clearing, satış, iadeler, gider/alış sınıfları, komisyon gideri, vergi kontrolü, FX, yuvarlama ve açılış kontrolü |
| 3. Dengesiz fiş | Kesinleşmede temel para biriminde borç=alacak; satırlar ve durum tek transaction; yalnız frontend kontrolü yeterli değil |
| 4. Floating-point | Tutarlar integer+scale veya exact decimal; giriş/çıkış string; JS `number` ile finansal hesap yapılmaz |
| 5. Çift posting | Kuruluş+source+source ID+olay türü+mantıksal sürüm için unique anahtar; aynı anahtar/farklı içerik hata |
| 6. Düzeltme/iade | Kesinleşmiş fişi düzenlemek yerine bağlı credit veya reversal; para iadesi ayrı hareket |
| 7. Kısmi kapama | Ayrı allocation ilişkisi; ödeme ve açık belge tutarı kilit altında denetlenir |
| 8. Bakiye mutabakatı | Bakiye ledger’dan türetilir; varsa cache yeniden üretilebilir ve karşılaştırılır |
| 9. FX | İşlem ve temel tutar birlikte saklanır; kapanan alacağın tarihî taşıma değeriyle ödeme değeri arasındaki fark ayrı kaydedilir |
| 10. Geçmiş koruması | Kesinleşmiş satır UPDATE/DELETE engeli, belge snapshot’ı, dönem kilidi ve izlenebilir düzeltme |
| 11. Eşzamanlılık | Aynı belge/ödeme üzerinde transaction içi satır kilidi; tutarlı kilit sırası; gereken akışlarda serializable ve retry |
| 12. Crash recovery | Commit öncesi rollback; commit sonrası cevapsızlıkta aynı idempotency anahtarıyla sonucu bulma |
| 13. Test güveni | Unit, property-based, gerçek PostgreSQL concurrency/crash ve uçtan uca muhasebe senaryoları |
| 14. Uzman incelemesi | Posting şablonları, vergi, açılış, refund, komisyon, FX ve kapanış davranışı muhasebeci onayı |

**Minimal model:** Hesaplar az sayıda kontrol hesabıdır; müşteri/tedarikçi, belge, mağaza ve para birimi alt hesap/analitik boyutlarla taşınır. Her müşteri için ayrı genel muhasebe hesabı zorunlu değildir.

**Transaction bütünlüğü:** Fiş, satırlar, allocation, belge durumu ve işlenmiş kaynak kaydı aynı muhasebe transaction’ında sonuçlanmalıdır. Workflow compensation, veritabanı atomikliği değildir.

**Veritabanı kontrolü:** Sıfır/negatif olmayan yönlü tutarlar, geçerli currency/scale, aynı kuruluş içi ilişkiler ve unique anahtarlar constraint ile korunmalıdır. Satırlar toplamını denetleyen bir fiş dengesi normal satır `CHECK` constraint’iyle çözülemez; posting transaction’ı ve gerekirse ertelenmiş constraint trigger değerlendirilmelidir. Bu, gelecekte onay gerektiren şema tasarımıdır.

**Para temsili:** PostgreSQL `numeric` exact hesap için uygundur; float türleri exact değildir. Dinero kullanılırsa `bigint` yolu, scale ve JSON string dönüşümü açıkça tasarlanmalıdır. Medusa tutarlarının “her zaman kuruş” olduğu varsayılmamalı; commerce tutar adapter’ı kurulu sözleşmeyle test edilmelidir. [PostgreSQL sayısal türleri](https://www.postgresql.org/docs/current/datatype-numeric.html)

**Örnek — FX, vergi hariç:** 100 USD alacak 30 TRY/USD ile 3.000 TRY kaydedilmişse, 40 USD’nin 32 kuruyla tahsilatı 1.280 TRY banka, 1.200 TRY alacak kapaması ve 80 TRY gerçekleşmiş kur kazancı üretir. Kalan alacak 60 USD / 1.800 TRY’dir. Tarihî satış yeni kurla yeniden hesaplanmaz.

**Yuvarlama:** Satır/belge düzeyi, vergi sırası, allocation kalıntısı ve FX hassasiyeti sürümlenen politika olmalıdır. Açıklanamayan fark “yuvarlama” hesabına otomatik atılmamalı; sınırı aşan fark reddedilmelidir.

**Refund:** Satışın azaltılması, müşteriye para çıkışı ve platformun satıcı alacağını geri mahsup etmesi farklı olaylardır. Tek refund olayından bunların tamamının gerçekleştiği varsayılmamalıdır.

**Kısmi ödeme:** İki eşzamanlı 70 birim ödeme, 100 birim borcu 140 birim kapatamamalıdır. Fazla ödeme desteklenecekse açık avans olarak ayrı muhasebeleştirilmelidir; ilk sürümde reddetme veya avans desteği ürün kararıdır.

**Recovery:** İşlem commit olduktan sonra bağlantı kopması “başarısız işlem” sayılıp yeni anahtarla tekrar gönderilmemelidir. Dış sağlayıcı için sonuç belirsizliği ayrıca uzlaştırılmalıdır.

**Test örnekleri:**

- Her kesinleşmiş fişte borç=alacak.
- Original+tam reversal etkisi sıfır.
- Tekrar gönderme bakiyeyi değiştirmez.
- Allocation toplamı ödeme ve açık tutarı aşmaz.
- Ledger’dan yeniden hesaplanan bakiye raporla aynı.
- Büyük tutarlar ve farklı currency exponent’leri hassasiyet kaybetmez.
- Commit öncesi/sonrası crash aynı nihai sonucu verir.
- Yetkisiz kuruluş sorguları, toplu işlemler ve export hiçbir veri sızdırmaz.

PostgreSQL isolation seviyeleri farklı garantiler verir; serializable hatalarının uygulama tarafından tekrar denenmesi gerekir. [Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

---

**7. Veri sahipliği ve PostgreSQL tenancy**

**RECOMMENDED — Paylaşılan veritabanı, ayrı muhasebe tabloları, kuruluş bazında satır sahipliği.** Kuruluş veya mağaza başına veritabanı/schema önerilmiyor.

- Muhasebe profili, belgeler, fişler ve hareketler `organization_id` taşımalı.
- Mağaza ilişkili kayıtlar ayrıca tarihî `store_id` taşımalı.
- Kuruluşun merkezi gideri için mağaza boyutu boş olabilir.
- Mağaza boyutu fiş toplamlarını ikinci kez saydırmamalıdır.
- Modül içi bağlantılar kuruluş uyuşmazlığını engellemelidir.
- Modüller arası ilişki doğrudan Mercur tablosuna FK ekleyerek kurulmaz; desteklenen module link ve adapter kullanılır.
- Tarihî belge kimliği/adresi/vergi bilgisi snapshot olarak korunur; güncel cari kart değişikliği geçmişi değiştirmez.

**VERIFIED — Medusa modül izolasyonu otomatik tenant güvenliği değildir.** Veri sahipliği ile kullanıcı erişim kontrolü farklı sorumluluklardır.

**RECOMMENDED — Backend izolasyonu:**

- Kuruluş context’i üyelik ve yetkiden türetilmeli.
- İstemcinin gönderdiği kuruluş ID’si tek başına güvenilmemeli.
- Listeleme, tekil kayıt, dosya, rapor, export, search ve job yolları aynı kapsamı uygulamalı.
- Mağaza personelinin kuruluş muhasebesini görme hakkı ayrıca tanımlanmalı.
- Platform yöneticisine bütün özel muhasebe kayıtları otomatik açılmamalı.
- Hassas finansal veri ve kimlik bilgileri loglardan çıkarılmalı.

RLS ek savunma olarak değerlendirilebilir; fakat tablo sahibi/superuser bypass davranışı ve connection pool context temizliği önemlidir. RLS’nin mevcut kurulumda etkin olduğu doğrulanmadı. [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

**INFERRED — Tek PostgreSQL güvenli veri sahipliğine engel değildir; fiziksel arıza izolasyonu sağlamaz.** Ağır rapor, kilit, bağlantı tüketimi veya kötü migration marketplace’i etkileyebilir. Sınırlı batch’ler, timeout’lar, indeksler, bağlantı bütçesi ve güvenli migration gerekir.

**RECOMMENDED — Saklama/arama:** Deaktivasyon silme değildir. Kesinleşmiş kayıtlar korunmalı; arşiv, export, legal hold ve kişisel veri politikası ayrı onaylanmalıdır. Bu rapor saklama süresi belirlemiyor.

Tek tenant restore, paylaşılan veritabanında tam restore kadar basit değildir: izole yedeğe restore edip kuruluş verisini kontrollü çıkarmak/uzlaştırmak gerekir.

---

**8. Entegrasyon ve mağaza ekstresi sınırları**

| Veri | Yetkili kayıt kaynağı | Muhasebenin rolü |
|---|---|---|
| Marketplace Order/OrderGroup | Medusa/Mercur | Kaynak referansı ve posting snapshot’ı |
| Capture/refund | Commerce/payment sağlayıcısı | Gerçekleşmiş olayın muhasebe etkisi |
| Seller Payout | Mercur/payout sağlayıcısı | Clearing ve banka bağlantılı hareket |
| Platform mağaza ekstresi | Pazaryeri finansal alanı | Kuruluş muhasebesiyle mutabakat |
| Manuel alış/satış/gider | Basic Accounting | Belge ve finansal kayıt sahipliği |
| Harici sağlayıcı kayıtları | Seçilen muhasebe sağlayıcısı | Mapping, aktarım durumu ve uzlaştırma |

**VERIFIED — Kurulu Mercur payout belgesi, payout’ın sipariş ve commission lines üzerinden hesaplandığını; provider işlemi ve order ID idempotency anahtarını açıklıyor.** Aynı belge bazı capture/payout job’larının proje içinde bağlanmasını gerektiğini söylüyor. Mevcut kaynak ağacında bu job’ların tam pipeline’ı uygulanmış olduğunu doğrulamadım. [Kurulu payout pipeline](D:/DogruAdres/node_modules/@mercurjs/docs/content/platform/payout/concepts/payout-pipeline.mdx)

**RECOMMENDED — Orders ve Payout’lar ikinci bir authoritative kayıt olarak oluşturulmamalıdır.** Muhasebe belgesi ve fiş, commerce kaynağının finansal yorumudur; sipariş/payout yürütme motoru değildir.

**İki mağaza:** Aynı kuruluşta tek muhasebe defteri bulunabilir; mağaza A ve B clearing/statement boyutları ayrı kalır. Payout geliri ikinci kez artırmaz; platformdan alacağı kapatır.

**Çoklu para birimi:** Kurulu Mercur offer pricing belgesi currency-scoped fiyatları doğruluyor. Ancak ilk sürümün kur kaynağı, fiyat dönüşümü ve settlement politikası yerel belgelerde bulunamadı. Muhasebe, gerçekleşmiş siparişin currency/tutar snapshot’ını almalı; güncel katalog fiyatı veya güncel kurdan geçmiş satış üretmemelidir. [Kurulu pricing belgesi](D:/DogruAdres/node_modules/@mercurjs/docs/content/platform/offer/concepts/pricing-and-inventory.mdx)

**Optionality:** Muhasebe posting’i checkout/capture/payout’ın zorunlu senkron adımı olmamalı. Durable aktarım niyeti, retry ve mutabakat önerilir. Mevcut event bus’ın bütün crash aralıklarında kayıpsız teslim yaptığı doğrulanmadı. Bu nedenle yalnız subscriber’a güvenmek yeterli değildir; kaynak kayıt taraması veya doğrulanmış outbox benzeri mekanizma gerekir.

**Sınırlama:** Aynı uygulama ve veritabanında muhasebe işlevinin kapalı olması marketplace’i engellememelidir; bütün PostgreSQL’in çökmesine rağmen marketplace’in sürmesi bu mimariyle sağlanamaz.

---

**9. On iki zorunlu senaryo**

Aşağıdaki davranışlar **RECOMMENDED**; kaynak sahipliği mevcut framework veya görev bağlamına dayanır.

| Senaryo | Kaynak ve sınır | Beklenen muhasebe etkisi | Gerekli test |
|---|---|---|---|
| 1. Doğrulanmış kuruluş aktivasyonu | Kuruluş/üyelik alanı kimliği; muhasebe kendi profili | Profil ve kontrollü başlangıç; aktivasyon tek başına fiş üretmez | Tekrarlı aktivasyon, yetkisiz kullanıcı, eksik base currency, yarım kurulum |
| 2. Tedarikçi ve alış belgesi | Basic Accounting belge sahibi | Kesinleşmede uygun alış/varlık/gider sınıfı borç, tedarikçi borcu alacak | Taslak etkisizliği, vergi/yuvarlama, aynı belgenin iki kez kesinleşmesi |
| 3. Marketplace satışı aktarımı | Order commerce’da; adapter yorumlar | Onaylanan tanıma anında satış ve müşteri/platform alacağı | Capture=satış varsayımının engellenmesi, kaynak toplamı, currency ve retry |
| 4. İki mağazalı şirket | Kuruluş muhasebesi tek; marketplace statements ayrı | Mağaza bazlı clearing ve rapor boyutları; kuruluş toplamı doğru | A payout’ının B clearing’ini kapatmaması, filtre/toplam eşitliği |
| 5. Kısmi tahsilat | Muhasebe tahsilat+allocation sahibi; banka kanıtı referans | Kasa/banka artar, yalnız tahsil edilen alacak kapanır | Çoklu belge, fazla kapama, concurrent allocation, kalan bakiye |
| 6. İlk posting sonrası refund | Refund commerce’da; credit/reversal muhasebede | Satış düzeltmesi ve gerçekleşen para/clearing hareketi ayrı | Kısmi/tam refund, payout öncesi/sonrası, duplicate ve ters olay sırası |
| 7. Harici sağlayıcı kullanımı | Commerce aynı; muhasebe sağlayıcısı seçilmiş kaynak | Yerel otomatik defter zorunlu değil; olay dışarı aktarılır | Yerel uygulama kapalıyken satış, mapping, timeout, export ve mutabakat |
| 8. Başarısız kaynağın retry’ı | Aynı source ve idempotency anahtarı | Bir ekonomik olay için tek muhasebe etkisi | Commit sonrası timeout, duplicate consumer, aynı anahtar/farklı payload |
| 9. Deaktivasyon/reaktivasyon | Aktivasyon alanı durum sahibi; geçmiş muhasebe korunur | Yeni posting davranışı durur; geri açılışta onaylı catch-up | Marketplace devamlılığı, geçmiş değişmezliği, gap/duplicate tespiti |
| 10. Başka kuruluş verisine erişim | Backend üyelik/yetki denetimi | Finansal etki ve veri ifşası yok | ID değiştirme, rapor/export/dosya/search/bulk/job kapsamları |
| 11. Farklı kurla geç settlement | Muhasebe tarihî rate ve allocation sahibi | Alacak/borç taşıma değeri kapanır; gerçekleşmiş FX ayrı | Kısmi kapamalar, kur yönü, yuvarlama, son kapamada sıfır kalan |
| 12. Temsilci komisyonu/Kumbara | İlgili platform alanı hak/ödül sahibi | Yalnız onaylanan parasal yükümlülük muhasebeye aktarılır | Puanın nakit sanılmaması, duplicate, beneficiary ve ledger ayrımı |

**UNVERIFIED — Temsilci ve Kumbara’nın hukuki/finansal semantiği belgelenmiş değil.** Kimin borcu olduğu, nakde dönüşebilirlik, hak kazanma ve sona erme kuralları belirlenmeden hesap yönü önerilemez. Platformun ödül ledger’ı kuruluş muhasebesiyle birleştirilmemelidir.

---

**10. Option A ve Option B karşılaştırması**

Bu tablo **INFERRED** değerlendirmedir; sayısal maliyet veya süre tahmini değildir.

| Ölçüt | A — Harici Bigcapital | B — Yerel Basic Accounting |
|---|---|---|
| İlk sürüm emeği | Hazır işlevler avantaj; adapter, kimlik ve provisioning önemli iş | Domain ve bütünlük daha fazla geliştirme; entegrasyon daha doğrudan |
| Uzun dönem bakım | İkinci platform, API ve tenant upgrade yönetimi | Dar kapsamlı domain; finansal doğruluk tamamen proje sorumluluğu |
| Finansal risk | Hazır motor avantajı; yanlış mapping ve konfigürasyon riski sürer | Posting, FX ve concurrency riski yüksek; kontrol bütünüyle elde |
| İşletim maliyeti | Ayrı servis ve veri katmanı | Mevcut deployment; artan DB/rapor/backup yükü |
| Veritabanı karmaşıklığı | Sistem DB + tenant DB yaşam döngüleri | Tek DB, tenant-scoped tablolar ve constraint’ler |
| Tenant izolasyonu | DB ayrımı yararlı; kimlik mapping’i hâlâ kritik | Uygulama kapsamı ve gerekirse RLS kritik |
| API/kimlik | İki sistem arasında eşleme ve credential yönetimi | Ortak kimlik; yeni muhasebe izinleri yine gerekir |
| Lisans | AGPL ve ticari entegrasyon incelemesi | Özgün domain + MIT bileşenlerle daha düşük risk |
| Upgrade | Bağımsız Bigcapital ve Mercur upgrade takvimleri | Medusa persistence/workflow adapter uyumu |
| Genişleme | Hazır kapsam daha geniş | Kontrollü genişleme; ERP’ye kayma riski |
| Çok dilli UX | Özel DoğruAdres UI ve API uyarlaması | Ortak UI, Türkçe/İngilizce/Arapça ve RTL daha doğal |
| Türkiye/e-belge | Hazır Türkiye uyumu doğrulanmadı | Yerel adapter tasarımı kolay; mevzuat işi yine ayrı |
| Geliştirici/agent riski | API varsayımı ve iki veri modeli | Finansal kuralı yanlış üretme ve unsafe CRUD riski |
| Test yükü | Contract, mapping, provisioning, reconciliation | Domain, constraint, property, concurrency ve recovery |
| Gelecek export/geçiş | Motor modelinden canonical export gerekir | Baştan taşınabilir veri modeli kurulabilir |

**INFERRED — “Harici motor daha güvenli” veya “yerel modül daha ucuz” mutlak sonuçları çıkarılamaz.** Gerçek kapsam, ekip yetkinliği ve işletim modeli belirleyicidir. DoğruAdres’in dar kapsam ve tek DB tercihi B’yi daha iyi eşleştiriyor.

---

**11. Geliştirme ve operasyon riskleri**

**B’nin en önemli riskleri:**

- Dengeli ama yanlış hesaplara yazılan fişler.
- Tamamlanmış fişlerin generated CRUD üzerinden değiştirilebilmesi.
- İki payment’in aynı açık tutarı kapatması.
- Satış+payout ile gelirin iki kez sayılması.
- Gider belgesi+ödeme ile giderin iki kez sayılması.
- Tarihî FX yerine güncel FX kullanılması.
- Mağaza filtresinin kuruluş güvenliği sanılması.
- Kesinleşmiş posting’in workflow compensation ile silinmesi.
- Rapor sorgularının marketplace kaynaklarını tüketmesi.
- Özellik talepleriyle kontrolsüz ERP’ye dönüşme.

**A’nın en önemli riskleri:**

- Tenant provisioning’in yarım kalması.
- Tenant’lar arasında farklı migration seviyeleri.
- Yanlış organization mapping veya fazla yetkili API anahtarı.
- Ağ timeout’ı sonrası duplicate dış belge.
- DoğruAdres ve Bigcapital kayıtlarının birbirinden sapması.
- Lisans yükümlülüklerinin özel UI/özelleştirmede yanlış değerlendirilmesi.
- Uyumlu olmayan otomatik upgrade.
- Yedeğin mevcut olup doğru tenant’a restore edilememesi.

**RECOMMENDED — Agent uygulaması için sınır:** Agent posting politikası, vergi yönü, tanıma anı, retention veya Kumbara semantiği icat etmemelidir. Finansal değişiklikler insan incelemesinden geçmeli; testler yalnız üretilen implementasyonu tekrar eden assertions olmamalıdır.

Bu çalışma yeni bir upstream issue veya compatibility patch saptamadı. Yerel muhasebe önerisi **DoğruAdres customization önerisidir**, uygulanmış özelleştirme değildir.

---

**12. Uzman muhasebe incelemesi gereken akışlar**

Üretim öncesinde nitelikli muhasebeci/SMMM ile aşağıdakiler doğrulanmalıdır:

- Satış ve alışın hangi anda muhasebeleştirileceği.
- Marketplace’te satıcı, platform ve müşteri arasındaki alacak/borç ilişkisi.
- Komisyonun brüt/net sunumu ve ilgili vergi belgeleri.
- Ürün, kargo, indirim, vergi ve refund ayrıştırması.
- Ticari mal alışının gider/varlık sınıflaması.
- Açılış bakiyeleri ve geçiş tarihi.
- Kısmi ödeme, avans, fazla ödeme ve iade.
- FX kaynağı, tarih, taşıma değeri ve gerçekleşmiş fark.
- Kapanmış dönem düzeltmeleri.
- Temsilci komisyonu ve Kumbara’nın ekonomik niteliği.
- Rapor isimlerinin yanıltıcı finansal iddia taşımaması.
- E-belge durumları ile iç muhasebe durumlarının ilişkisi.

**VERIFIED — Türkiye e-belge süreçleri ayrı teknik ve hukuki kurallara tabidir.** İçeride kesinleşmiş satış belgesi oluşturmak GİB e-Fatura/e-Arşiv düzenlenmiş olduğu anlamına gelmez. [GİB özel entegrasyon kılavuzu](https://ebelge.gib.gov.tr/dosyalar/kilavuzlar/e-Fatura_Uygulamasi_Ozel_Entegrasyon_Kilavuzu_v1.12.pdf), [GİB e-Arşiv teknik kılavuzu](https://ebelge.gib.gov.tr/dosyalar/kilavuzlar/e-Arsiv_Teknik_Kilavuzu_V.1.17.pdf)

**RECOMMENDED — Gelecek e-belge adapter’ı:** İç belge ID’si, sağlayıcı ID’si/UUID, gönderim ve kabul durumları ayrı tutulmalı. Timeout sonrası yeniden gönderim duplicate yasal belge üretmemeli. Uygulama tarihinde güncel kılavuz ve sağlayıcı sözleşmesi yeniden doğrulanmalıdır.

---

**13. Tek açık öneri**

**RECOMMENDED — Option B seçilsin:** Aynı Medusa uygulaması ve PostgreSQL içinde, kuruluşun özel verisini sahiplenen, mağaza boyutlarını koruyan, otomatik çift taraflı posting kullanan dar Basic Accounting modülü.

Bu tercihin gerekçesi “muhasebeyi sıfırdan yapmak kolay” değildir. Gerekçe; DoğruAdres’in optional uygulama, ortak kimlik/UX, tek DB, düşük işletim yükü ve açık modül sahipliği hedeflerine daha iyi uymasıdır.

Bigcapital:

- Gelecekte desteklenebilecek harici muhasebe sağlayıcısı olsun.
- Varsayılan zorunlu motor olmasın.
- Kodu veya ledger’ı yerel modüle kopyalanmasın.
- Ancak kapsam tam muhasebe/ERP’ye genişlerse ve lisans/operasyon modeli kabul edilirse yeniden değerlendirilsin.

Üretim için ön koşullar: onaylı muhasebe politikaları, accountant-reviewed posting şablonları, PostgreSQL bütünlük/izolasyon kanıtı ve güvenilir yeniden işleme/mutabakat.

---

**14. Açık ürün kararları**

Uygulamadan önce aşağıdakiler açıkça onaylanmalıdır:

1. “Basic Accounting” ön muhasebe kapsamı ve rapor iddiaları.
2. Kuruluş–mağaza sahipliği, tarihî mağaza transferi ve personel erişimi.
3. Kuruluş temel para birimi ve ilk posting sonrası değişiklik politikası.
4. İlk sürüm desteklenen işlem/settlement currency kombinasyonları.
5. Kur kaynağı, tarihi, manuel override ve yuvarlama politikası.
6. Marketplace satışının tanıma anı ve clearing tarafı.
7. Fazla ödeme, avans, borç silme ve çapraz currency kapama.
8. Açılış tarihi ve mevcut verilerin içeri alınması.
9. Deaktivasyonda aktarım, backlog, reaktivasyon ve catch-up davranışı.
10. Yerel/harici sağlayıcı seçiminde tek yetkili defter ve geçiş cutover’ı.
11. Dönem kilidi, düzeltme yetkisi, destek erişimi ve audit.
12. Retention, arşiv, export ve silme politikası.
13. Temsilci/Kumbara ekonomik ve hukuki kuralları.
14. İlk e-belge sağlayıcısı ve sözleşme modeli.
15. Yeni modül veri sahipliği, şema ve bağımlılık onayı.

**UNVERIFIED — Ayrıntılı kuruluş modeli, önceki A3 ve ilk sürüm çoklu currency kararı `docs/dogruadres/` içinde bulunamadı.** Görevdeki bağlamı esas aldım; bunların yerel kabul edilmiş ADR olduğunu ileri sürmüyorum.

---

**15. İlerideki minimum PoC planı**

Bu plan **RECOMMENDED**; bugün hiçbir adımı uygulanmadı.

1. Ürün sahibi ve muhasebeciyle küçük posting matrisi onaylanır.
2. Medusa 2.21.2 üzerinde yalnız muhasebe aggregate’ının atomik persistence’ı kanıtlanır.
3. Tek kuruluş, iki mağaza, iki currency, satış/alış, kısmi ödeme ve credit örnekleri kullanılır.
4. Unique idempotency, dengeli fiş, finalized immutability ve allocation sınırları gösterilir.
5. Paralel kapama, duplicate event, commit sonrası timeout ve crash recovery denenir.
6. Yetkisiz kuruluş erişimi bütün read/write/export yollarında denenir.
7. Marketplace satış/refund/payout snapshot adapter’ı contract testleriyle doğrulanır.
8. Muhasebe kapalı/başarısızken marketplace akışının devam ettiği ve gap’lerin uzlaştırıldığı gösterilir.
9. Ledger’dan yeniden oluşturulan bakiye, mağaza clearing ve canonical export karşılaştırılır.
10. Muhasebeci incelemesi ve ürün sahibi değerlendirmesiyle devam/durdurma kararı verilir.

PoC; GİB entegrasyonu, banka feed’i, tam hesap planı veya kapsamlı ekran geliştirmesi içermez. Başarı ölçütü çalışan form değil, hata durumlarında doğru finansal sonuçtur.

---

**16. Kaynak kanıtı ve araştırma sınırları**

Yerel temel kaynaklar:

- [Mercur belge indeksi](D:/DogruAdres/node_modules/@mercurjs/docs/llms.txt)
- [DoğruAdres dokümantasyon router’ı](D:/DogruAdres/docs/dogruadres/README.md)
- [Mimari](D:/DogruAdres/docs/dogruadres/ARCHITECTURE.md)
- [İlkeler](D:/DogruAdres/docs/dogruadres/PRINCIPLES.md)
- [Güvenlik](D:/DogruAdres/docs/dogruadres/SECURITY.md)
- [Mercur entegrasyon politikası](D:/DogruAdres/docs/dogruadres/MERCUR-INTEGRATION.md)
- [Upgrade politikası](D:/DogruAdres/docs/dogruadres/UPGRADE-POLICY.md)
- [Kabul edilmiş Mercur ADR’si](D:/DogruAdres/docs/dogruadres/adr/ADR-0001-mercur-as-marketplace-engine.md)
- [Module link kuralları](D:/DogruAdres/node_modules/@mercurjs/docs/content/resources/best-practices/module-links.mdx)
- [Medusa/Mercur yapılandırması](D:/DogruAdres/packages/api/medusa-config.ts)

Kurulu transaction kaynakları:

- `D:\DogruAdres\node_modules\.bun\@medusajs+utils@2.21.2+56032f2bd82afcd8\node_modules\@medusajs\utils\dist\modules-sdk\decorators\inject-transaction-manager.js`
- Aynı pakette `dist\dal\utils.js`
- Aynı pakette `dist\dal\mikro-orm\mikro-orm-repository.d.ts`

**Araştırma sınırları:** Canlı API, database transaction, RLS veya production restore doğrulaması yapılmadı. Güncel Bigcapital kaynak incelemesi kurulmuş sürüm testi değildir. Bigcapital dokümantasyon/API sayfalarının bir kısmı erişilebilir ayrıntı vermedi; somut API bulguları resmi controller kaynaklarından çıkarıldı. Kullanılan PostgreSQL çevrimiçi belgeleri mevcut sürümün belgeleridir; yerel PostgreSQL server sürümü doğrulanmadı.

---

**17. Git durumu ve salt okunur çalışma teyidi**

Başlangıç ve bitişte aynı durum görüldü:

```text
?? .vscode/
?? DESIGN.md
```

`git diff --stat` ve `git diff --name-only` çıktı vermedi.

**Hiçbir repository dosyasını değiştirmedim.** Mevcut untracked öğeler korundu. Kurulum, veritabanı oluşturma, migration, seed, build veya implementation testi çalıştırılmadı; kod üretilmedi. Mercur/Medusa internalleri, Git geçmişi, AGENTS.md ve CODEBASE.md değiştirilmedi.

**A3-R burada tamamlandı. A5’e geçilmedi; açık ürün sahibi talimatı bekleniyor.**