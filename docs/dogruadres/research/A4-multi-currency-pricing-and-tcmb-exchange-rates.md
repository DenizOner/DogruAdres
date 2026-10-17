**Tercih edilen yaklaşım: C — DoğruAdres’in sahip olduğu kaynak fiyatlar ve sürümlenmiş TRY fiyat yayınları; Mercur 2.3.6 korunmalı.**

Bu yaklaşım, onaylanan çoklu kaynak para birimi gereksinimini Mercur’un tek mağaza para birimi modeliyle bağdaştırıyor. Ancak **uçtan uca uygulanabilirlik henüz runtime ile doğrulanmış değil**: özellikle aynı varyantın farklı satıcı Offer’larının aynı sepette bulunması, fiyat yayını sırasında checkout ve seller PriceList izolasyonu küçük bir PoC ile sınanmalı.

İnceleme tarihi: **9 Ekim 2026**. Çalışma salt okunur yapıldı.

Etiketler:

- **VERIFIED:** Kurulu kaynak, sürüm eşleşen doküman veya resmi kaynakla doğrulandı.
- **INFERRED:** Kaynaklardan çıkarılan mimari sonuç; çalışma zamanı garantisi değil.
- **RECOMMENDED:** Ürün sahibinin değerlendirmesine sunulan öneri.
- **UNVERIFIED:** Bu incelemede doğrulanamadı; gelecekteki test veya kaynak doğrulaması gerekiyor.

### 1. Yönetici bulguları

1. **VERIFIED — Mercur mağazası tek para birimiyle çalışıyor.** Mercur’daki marketplace “Store”, `Seller` kaydıdır. `currency_code` tek değerdir; sürüm eşleşen doküman fiyatların ve payout’ların bu para birimini kullanmasını öngörüyor.
2. **VERIFIED — Medusa Pricing çoklu para birimli fiyat kayıtlarını destekliyor; otomatik FX dönüşümü yapmıyor.** `calculatePrices` istenen para birimi ve kurallara uygun kayıtları seçiyor.
3. **VERIFIED — Satıcı fiyatı ortak ürünün ticari mülkiyeti değildir.** Offer fiyatları ortak varyantın `PriceSet`’inde bulunuyor, fakat `offer_id` fiyat kuralı ve Offer–Price link’iyle ayrılıyor.
4. **INFERRED — EUR/USD/CNY kaynak fiyatları DoğruAdres’te saklayıp TRY satış fiyatlarını yayınlamak için Mercur çekirdeğini değiştirmek zorunlu görünmüyor.**
5. **VERIFIED — Sepet fiyatlarını güncellemek ve siparişi tamamlamak farklı işlemler.** Mercur’un tamamlanma akışı sepetin mevcut fiyatlarını siparişlere taşıyor. Kendiliğinden “en son kurla yeniden fiyatlandırma” garantisi yok.
6. **VERIFIED — Yerleşik komisyon algoritması bağımsız bütün komisyon bileşenlerini toplamıyor.** Her ürün kalemi için en uygun tek oranı seçiyor. Özel komisyon sağlayıcısı için genişletme noktası mevcut.
7. **INFERRED — Medusa-only geçişinin bu gereksinim için toplam mühendislik avantajı gösterilemedi.** FX, fiyat geçmişi ve checkout tutarlılığı yine geliştirilecek; marketplace yetenekleri de yeniden sahiplenilecek.

Mercur’un resmi yanıtı tek para birimi modelinin bilinçli olduğunu açıklıyor. Sonraki discussion’da kaynak fiyat ve settlement para biriminin ayrılması değerlendirmeye açık bulunmuş; bu, mevcut sürümde teslim edilmiş özellik anlamına gelmiyor. Issue’ın kapanması da özelliğin uygulanmış olduğuna kanıt değil. [Issue #1361](https://github.com/mercurjs/mercur/issues/1361), [Discussion #1372](https://github.com/mercurjs/mercur/discussions/1372).

### 2. Kurulu mimari ve önceki kararların durumu

**VERIFIED — Kurulu paketler:**

| Paket | Sürüm | Doğrulama |
|---|---:|---|
| `@mercurjs/core` | 2.3.6 | `packages/api/node_modules/@mercurjs/core/package.json` |
| `@mercurjs/docs` | 2.3.6 | Root bağımlılığı ve kurulu doküman paketi |
| `@mercurjs/vendor` | 2.3.6 | Vendor workspace bağımlılığı |
| `@medusajs/medusa` | 2.21.2 | `packages/api/node_modules/@medusajs/medusa/package.json` |
| `@medusajs/core-flows` | 2.21.2 | Kurulu workspace paketi |
| `@medusajs/pricing` | 2.21.2 | Bun bağımlılık deposundaki kurulu paket |

Root [AGENTS.md](D:/DogruAdres/AGENTS.md), [dokümantasyon router’ı](D:/DogruAdres/docs/dogruadres/README.md), ilkeler, mimari, entegrasyon, upgrade ve güvenlik belgeleri ile kabul edilmiş ADR-0001/0002/0003 okundu.

**VERIFIED — Yerel yönetim belgeleri Mercur’un marketplace motoru olmasını ve extension-first yaklaşımını kabul ediyor.** Kullanıcının mevcut talimatı, daha iyi bir yaklaşım kanıtlanırsa platform kararının yeniden değerlendirilmesine izin veriyor.

**UNVERIFIED — Ayrı A1–A3 raporları bulunamadı.** İncelenen proje dokümanlarında bu başlıklarla bağımsız rapor yoktu. Kullanıcının aktardığı A1/A2 sonuçları başlangıç bağlamı olarak kullanıldı; A3 adına varsayımsal karar üretilmedi.

**VERIFIED — Repo başlangıç katmanı; onaylanan FX ve fiyat yayın mekanizmasının mevcut uygulaması gösterilemedi.** Ayrıca seed kodunda EUR/USD örnekleri bulunuyor. Bu yüzden “çalışan mağaza ve region ayarları zaten TRY” sonucu çıkarılamaz; veritabanına erişilmedi.

### 3. Gerçek Mercur mağaza para birimi kısıtları

**VERIFIED — Üç ayrı kavram karıştırılmamalı:**

| Kavram | Rol |
|---|---|
| Mercur `Seller` / marketplace Store | Satıcının mağazası; tek `currency_code` |
| Medusa Store | Platformun mağaza yapılandırması ve desteklenen para birimleri |
| Medusa Region / Cart | Alıcının işlem bağlamı ve sepetin satış para birimi |

Medusa Store’da birden fazla para birimi bulunabilmesi, Mercur Seller’ın çoklu kaynak para birimiyle çalıştığını doğrulamaz.

**VERIFIED — UI kısıtı gerçek:**

- Offer oluşturma ekranı `useCurrentSeller()` ile mağaza para birimini alıyor.
- Fiyat sütunlarını bu para birimine göre oluşturuyor.
- PriceList ekranındaki `usePriceListCurrencyData`, `currencies = [currency_code]` kullanıyor.
- Vendor Seller güncelleme şemasında `currency_code` alanı yok.

**VERIFIED — API şeması ile ürün sözleşmesi aynı şey değil.** İncelenen Offer fiyat şeması `currency_code` için string kabul ediyor; Offer upsert akışında her fiyat için Seller para birimine eşitlik kontrolü görülmedi. Bu, yabancı para birimli fiyatları doğrudan yerleştirmenin desteklenen Mercur iş modeli olduğunu göstermez.

**INFERRED — Kısıt dokümantasyon ve UI seviyesinde güçlü; her backend yazma yolunda eksiksiz enforcement kanıtlanmış değil.** Bu durum onaylanan gereksinimi mevcut API açıklığı üzerinden çözmek için kullanılmamalı.

**RECOMMENDED — İlk sürümde Seller, satış sepeti, sipariş ve payout para birimi TRY olmalı.** EUR/USD/CNY kaynak fiyatları, DoğruAdres’in kaynak fiyat katmanında tutulmalı. Kaynak para birimi nedeniyle yeni mağaza oluşturulmamalı.

### 4. Doğrulanmış Pricing, Offer ve checkout akışı

**VERIFIED — Fiyat ilişkileri:**

```text
Ortak Product → ProductVariant → ortak PriceSet
                                   ↓
                    Price + PriceRule(offer_id)
                                   ↕
                               Seller Offer
```

- `Price`: tutar, para birimi, miktar aralığı ve kurallar.
- `PriceSet`: ilişkili fiyat kayıtlarını toplar.
- `PriceList`: `sale` / `override`, durum, tarih aralığı ve uygunluk kuralları.
- `PriceRule`: fiyatın hangi bağlamda uygulanacağını sınırlar.
- `PricePreference`: vergi dahil fiyat davranışına katkı sağlar.

**VERIFIED — Temel yazma yolları:**

- `POST /vendor/offers/{id}` → `updateOffersWorkflow`
- `updateOffersWorkflow` → `upsertOfferPricesWorkflow`
- `upsertOfferPricesWorkflow` → `addOfferPricesStep`
- `addOfferPricesStep` → Pricing Module `addPrices`
- PriceList toplu fiyat işlemleri → `batchPriceListPricesWorkflow`

**Önemli kaynak/doküman ayrımı:** Offer güncelleme dokümanı “upsert” diyor; kaynak kod, gönderilen fiyat kümesinde yer almayan mevcut Offer fiyatlarını kaldırıyor. Dolayısıyla yalnız değişen bir fiyatı göndermek, aynı Offer’ın diğer fiyatlarını silmeye yol açabilir. Tam mevcut küme ve fiyat ID’leri korunmalı.

**VERIFIED — Store okuma yolu:**

`GET /store/offers` önce Offer listesini sorguluyor; ardından `wrapOffersWithCalculatedPrices` ile fiyatları hesaplıyor. Aynı `PriceSet`’i paylaşan Offer’lar için ayrı `offer_id` bağlamları kullanılıyor.

**INFERRED — Hesaplanan fiyat alanı sonradan eklendiği için bu route tek başına tüm sonuç kümesinde doğru hesaplanan-fiyat sıralama/filtreleme garantisi vermiyor.** Sayfa alındıktan sonra sıralamak küresel sıralama değildir.

**VERIFIED — Sepet akışı:**

- `addToCartWorkflow`
- `updateLineItemInCartWorkflow`
- `refreshCartItemsWorkflow`

Mercur bu akışların `setPricingContext` hook’larına Offer bağlamı ekliyor. Medusa fiyat seçimi sonuçları `unit_price` değerlerine aktarılıyor.

`refreshCartItemsWorkflow` içindeki **tam fiyat yenilemesi `force_refresh` koşuluna bağlı**. Her refresh çağrısı bütün ürün fiyatlarını yeniden hesaplıyor sayılmamalı.

**VERIFIED — Sipariş tamamlanması:**

`POST /store/carts/{id}/complete` → `completeCartWithSplitOrdersWorkflow`.

Bu akış:

- Sepet kilidi alır.
- Sepeti okur.
- Ödeme ve seller ilişkilerini doğrular.
- Offer’ın seller’ına göre siparişleri böler.
- Sepet `unit_price`, vergi, adjustment ve metadata bilgilerini siparişe taşır.
- OrderGroup oluşturur.
- Ödeme authorization ve sonraki ödeme bölme akışlarını yürütür.

Yanıt türü Mercur’da **`order_group`**; plain Medusa örneklerindeki **`order`** varsayımı doğrudan uygulanamaz.

**VERIFIED — Custom price desteği mevcut**, fakat `is_custom_price` fiyatların standart yenilemeyle değiştirilmesini etkiliyor. B yaklaşımında override kullanılması, ileride refresh ile güncelleneceği varsayımını bozar.

**RECOMMENDED — Checkout `validate` hook’u doğrulama/reddetme için kullanılmalı.** Sepet zaten okunmuşken bu hook içinde fiyat değiştirilmemeli. Önce ayrı fiyatlandırma işlemi, ardından ödeme tutarı yenilemesi ve son doğrulama yapılmalı. Resmi Medusa checkout rehberi de bu snapshot riskini açıkça belirtir. [Checkout completion](https://docs.medusajs.com/resources/storefront-development/checkout/complete-cart).

### 5. Kaynak fiyatın sahipliği

| Seçenek | Değerlendirme |
|---|---|
| Ortak Product metadata’sı | **RECOMMENDED: Kullanılmamalı.** Satıcı fiyatları ortak katalog verisi olur; gizlilik ve sahiplik sınırı bozulur. |
| Offer metadata’sı | **INFERRED:** Basit prototipte mümkün; sürüm, geçmiş, doğrulama ve sorgulama için zayıf kalır. |
| Medusa Pricing’de yabancı para birimli Price kayıtları | **VERIFIED:** Veri modeli tutabilir. **UNVERIFIED:** Mercur’un uçtan uca desteklenen kaynak fiyat otoritesi olarak kullanımı. |
| DoğruAdres kaynak fiyat alanı, Offer link’i | **RECOMMENDED: Tercih edilen sahiplik.** FX politikası, revizyon, audit ve geçmiş açık biçimde modellenebilir. |

Medusa `original_amount`, **satıcının EUR/USD/CNY kaynak fiyatı değildir**. Seçilen satış para birimindeki referans fiyatın hesaplama sonucudur. TRY bağlamında buna EUR tutarı koymak semantiği bozar.

**RECOMMENDED — Kaynak fiyat kaydı Offer ve ticari uygunluk kapsamında olmalı:** Seller/Store, Offer, liste/indirimli fiyat, bunların para birimleri, miktar aralığı, müşteri segmenti/organizasyon ve vergi dahil olma niteliği.

Liste ve indirimli fiyat **aynı para birimindeyse** kaynak indirim oranı doğrudan hesaplanabilir. **Bir Offer’ın liste ve indirimli fiyatları birbirinden farklı para birimindeyse**, oran ancak ortak değerleme bağlamına dönüştürülerek hesaplanır; bu artık kurdan bağımsız “satıcı indirim yüzdesi” değildir. Bu gösterimin ürün tanımı ayrıca onaylanmalı.

### 6. A/B/C/D karşılaştırması

| Boyut | A — Zamanlanmış TRY güncelleme | B — İstek anında fiyat | C — Kaynak otoritesi ve sürümlü yayın | D — Medusa-only |
|---|---|---|---|---|
| Mercur ile uyum | Mevcut TRY fiyat yazma yollarını kullanır | Okuma, sepet, checkout ve arama adaptasyonu gerekir | Mevcut Pricing’e kontrollü TRY projeksiyonu | Marketplace katmanı yeniden kurulur |
| Kaynak fiyat | Ayrı tutulmalı | Ayrı tutulmalı | Açık otorite ve revizyon | Yine ayrıca modellenmeli |
| Yazma maliyeti | Etkilenen tüm fiyat satırları | Fiyat yayın yazması az; işlem snapshot’ları devam eder | Değişen fiyat satırları + yayın/geçmiş kayıtları | Seçilen fiyat mimarisine bağlı |
| Arama | Yayınlanmış fiyat kullanılabilir | Dinamik sıralama zor | Sürüme bağlı projeksiyon | Aynı problem devam eder |
| Kısmi hata | Kontrolsüz karışık durum riski | İstek/servis hatası | Yayın durumları ve reconciliation | Tamamı proje sorumluluğu |
| Checkout | Ek doğrulama zorunlu | Ek snapshot ve override yönetimi | Yayın + quote sürümü doğrulaması | Baştan geliştirilir |
| İlk geliştirme | Düşük–orta | Yüksek | Orta | Çok yüksek |
| Uzun vadeli bakım | Geçmiş/version eklenmezse büyür | Fiyat yolunun birçok noktasına yayılır | Açık sınırlarla daha yönetilebilir | Marketplace bakımının tamamı |

**A:** Basit başlangıç sağlar; fakat güvenilir geçmiş, kaynak revizyonu, idempotency ve reconciliation eklendiğinde C’ye yaklaşır. Salt cron ile bütün fiyatları yeniden yazmak yeterli mimari değildir.

**B:** Kur değişimini az yazmayla yansıtır. Buna karşılık global fiyat sıralaması, segment gizliliği, cache anahtarları, custom-price yenilemesi ve ödeme snapshot’ı daha karmaşıktır. TCMB’ye kullanıcı isteği sırasında erişmek uygun değildir.

**C:** A’nın yayın mekanizmasını kullanabilir, fakat kaynak otoritesi, yayın sürümü ve işlem snapshot’ını ayrı tanımlar. Tercih sebebi budur; sadece “cron’a version alanı eklemek” değildir.

**D:** Mercur para birimi sözleşmesini kaldırır; finansal tutarlılık ve fiyat geçmişi problemlerini kaldırmaz. Mevcut kanıtlar toplam maliyet avantajını göstermiyor.

### 7. Önerilen başlangıç mimarisi

**RECOMMENDED — Tek backend içinde modular monolith:**

```text
TCMB / EVDS
    ↓
DoğruAdres FX geçmişi
    ↓
DoğruAdres Offer kaynak fiyatları + fiyatlandırma politikası
    ↓
Doğrulanmış TRY yayınları
    ↓
Mercur / Medusa Pricing
    ↓
Sepet fiyat doğrulaması → müşteri kabulü → ödeme → sipariş snapshot’ı
```

Başlangıçta ayrı FX microservice, Kafka, zaman serisi veritabanı veya yeni arama servisi zorunlu değil.

Önerilen sınırlar:

- Mercur: Offer, seller, marketplace sipariş ve payout altyapısı.
- Medusa: Pricing, cart, tax, promotion, payment ve order altyapısı.
- DoğruAdres: kaynak fiyat otoritesi, FX provenance, yayın geçmişi, ürün fiyatlandırma politikası ve işlem fiyat kanıtı.
- Muhasebe uygulaması: asenkron tüketici; satışın çalışmasını engellemez.

**UNVERIFIED — Bu yeni alan sahipliği ve persistence sınırı henüz kabul edilmiş ADR değildir.** Mimari onay gerektirir.

### 8. TCMB arşivi: 2005-01-01’den itibaren fizibilite

**VERIFIED — Resmi tarihsel kaynak mevcut.** TCMB arşiv sayfası tarihsel serileri EVDS’ye yönlendiriyor. Bu, bütün para birimlerinin aynı tarihten başladığı anlamına gelmez. [TCMB tarihsel kur giriş noktası](https://www.tcmb.gov.tr/wps/wcm/connect/tr/tcmb%2Btr/main%2Bmenu/istatistikler/doviz%2Bkurlari/gosterge%2Bniteligindeki%2Bmerkez%2Bbankasi%2Bkurlarii).

Toplu indirme yapılmadan, yalnız iki resmi XML belgesi bellekte incelendi:

| Örnek | Doğrulanan özellik |
|---|---|
| `03.01.2005` | USD/EUR mevcut; JPY `Unit=100`; CNY bu bültende yok |
| `09.10.2026` güncel bülteni | USD/EUR/CNY mevcut; JPY yine `Unit=100` |

Kaynaklar: [03.01.2005 XML](https://www.tcmb.gov.tr/kurlar/200501/03012005.xml), [güncel XML](https://www.tcmb.gov.tr/kurlar/today.xml).

**VERIFIED — Birim alanı zorunlu.** XML’de JPY tutarı 100 yen karşılığıdır; her kuru “1 yabancı para birimi” kabul etmek yüz kat hataya yol açar.

**INFERRED — USD/EUR için 2005 başlangıçlı arşiv hedefi uygulanabilir. UNVERIFIED — Bütün günlük gözlemlerin sürekliliği ve CNY’nin tam başlangıç tarihi doğrulanmadı.** CNY’ye 2005 için yapay kur üretilemez.

**VERIFIED — Para reformu:** 1 Ocak 2005’te altı sıfır atıldı; 1 Ocak 2009’da “Yeni” adı kaldırıldı. 2005 sonrası verileri yeniden bir milyona bölmek yanlış olur. Kaynağın YTL/TRY gösterimi korunmalı. [TCMB tarihçesi](https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB%2BTR/Main%2BMenu/Banka%2BHakkinda/Tarihce/Tarihcemiz).

**VERIFIED — Takvim ve zaman ayrımı:**

- Hafta sonu, resmi tatil ve yarım çalışma günlerinde gösterge kur belirlenmez.
- TCMB sayfası 15.30 belirleme saatini açıklar.
- Otomatik erişim açıklamasında kontrollerden sonra 16.00–16.30 yayımlanma aralığı da verilir.
- Bülten tarihi, alınma zamanı ve fiyatlarda uygulanmaya başlama zamanı farklıdır.

Bu yüzden tam 15.30’da yeni veri varmış gibi fiyatlandırma yapılmamalı. [TCMB kur açıklamaları](https://tcmb.gov.tr/wps/wcm/connect/TR/TCMB%2BTR/Main%2BMenu/Banka%2BHakkinda/Sikca%2BSorulan%2BSorular/Doviz%2BKuru%2BPolitikasi%2Bve%2BRezerv%2BYonetimi/).

**2005-01-01 sınırı:** Arşiv bu tarihten başlamalı; 1–2 Ocak için olmayan gözlem oluşturulmamalı. Başlangıçta kullanılacak önceki kur için pre-2005 veri ithal etmek de onaylanan sınırı ihlal eder.

### 9. EVDS erişimi ve backfill yöntemi

**VERIFIED — Resmi web servis belgeleri** tarih aralığı, birden fazla seri, JSON/XML/CSV çıktısı ve kullanıcıya ait API anahtarını açıklıyor. Güncellenmiş belgelerde anahtar HTTP `key` header’ında gönderiliyor. [Resmi web servis kılavuzu](https://evds2.tcmb.gov.tr/help/videos/EVDS_Web_Servis_Kullanim_Kilavuzu.pdf).

**VERIFIED — EVDS 3, Ocak 2026’da duyuruldu.** Eski EVDS 2 belge adresleri bu incelemede EVDS 3 ana sayfasına yönlendi. Eski örnek endpoint’lerin bugün çalıştığı varsayılmamalı. [Resmi EVDS 3 duyurusu](https://www.tcmb.gov.tr/wps/wcm/connect/tr/tcmb%2Btr/main%2Bmenu/duyurular/basin/2026/duy2026-03), [güncel doküman giriş noktası](https://evds3.tcmb.gov.tr/dokumanlar).

**UNVERIFIED — Güncel EVDS 3 veri endpoint’i, pagination sözleşmesi, kesin gözlem limiti ve çağrı kotası bu incelemede resmi güncel kılavuzdan tam doğrulanamadı.** Toplulukta görülen “1000 gözlem” gibi limitler doğrulanmış resmi sınır olarak kullanılmadı. Credentials alınmadı ve kimlik doğrulamalı veri isteği yapılmadı.

**RECOMMENDED — Gelecekteki initial backfill:**

1. Önce gerekli para birimleri ve seri metadata’sı envanteri.
2. Günlük, dönüştürülmemiş gözlemler; ortalama/toplulaştırma kullanılmaması.
3. `2005-01-01` alt sınırıyla aylık veya üç aylık sınırlı tarih parçaları.
4. Seri grubu + tarih aralığı bazında kalıcı checkpoint.
5. Ham cevap hash’i, tarih kapsamı ve gözlem sayısı doğrulaması.
6. Eksik/kesilmiş cevap şüphesinde daha küçük parçalara bölme.
7. Düşük eşzamanlılık, timeout, sınırlı retry ve `Retry-After` desteği.
8. Aynı parçanın yeniden çalıştırılmasında duplicate üretmeme.
9. Güncel bültenleri incremental alma; yakın geçmişi tekrar kontrol ederek düzeltmeleri yakalama.
10. Daha eski dönemleri düşük sıklıklı reconciliation ile doğrulama.

HTTP hata veya boş yanıt, “o gün resmi kur yok” olarak sınıflandırılmamalı.

**VERIFIED — Kullanım koşulları** kaynak gösterimine izin veriyor; ticari üründe kullanımın müşteriye ek veri ücreti olarak yansıtılmamasını söylüyor. Doğruluk, eksiksizlik ve erişilebilirlik taahhüdü yok. Genel TCMB site koşulları da değerlendirmeye dahil edilmeli. [EVDS kullanım şartları](https://evds3.tcmb.gov.tr/igmevdsms-dis/documents/showDocument?docId=18).

### 10. Kavramsal FX tarih modeli

**RECOMMENDED — Fiziksel şema oluşturmadan önerilen kayıt kavramları:**

| Kavram | Korunacak bilgiler |
|---|---|
| Kaynak/seri | TCMB/EVDS, seri kodu, metadata, kur türü, kapsama başlangıcı |
| Bülten | Kaynak URL, ham içerik/hash, bülten tarihi, alınma zamanı |
| Gözlem | Para birimi, ham ondalık tutar, `Unit`, kotasyon yönü |
| Zaman bilgisi | Gözlem tarihi, biliniyorsa resmi publication zamanı, ilk görülme zamanı |
| Revizyon | Önceki gözleme bağlantı, yeni hash, fark ve düzeltmenin tespit zamanı |
| Fiyatlandırma uygulaması | Kullanılan gözlem/revizyon, normalize kur, politika sürümü, effective zamanı |
| Eksiklik durumu | Yayın olmayan gün, seri kapsamı dışında, beklenmeyen boşluk, erişim hatası |

Normalize edilmiş dönüşüm:

**TRY tutarı = kaynak tutarı × yayımlanan TRY karşılığı ÷ `Unit`**

Normalize kur, ham gözlemin yerine geçmemeli.

**RECOMMENDED — Gözlem tarihi ve sistemin bildiği tarih ayrı tutulmalı.** Sonradan düzeltilmiş veriyle geçmişteki işlemi yeniden açıklamak yerine, işlem anında gerçekten kullanılan revizyona ulaşılmalı.

TRY→TRY için birim katsayısı kullanılabilir; bu TCMB gözlemi olarak kaydedilmemeli.

Tatilde son geçerli kurla fiyatlandırmak, tatil gününe yeni tarihsel gözlem yazmak değildir.

### 11. Para hesaplama kuralları

Aşağıdakiler **RECOMMENDED**, mevcut ürün kararı değildir:

| Konu | Öneri |
|---|---|
| Varsayılan kur | TCMB **döviz satış**; nakit efektif satış değil |
| Gerekçe | Yabancı para üzerinden ticari fiyatın TRY karşılığını oluşturmak için anlaşılır referans |
| Mağaza kur marjı | İlk sürümde sıfır; gerekirse ayrı, sürümlü politika |
| Kaynak fiyat hassasiyeti | Finansal decimal; önerilen başlangıç en fazla 6 ondalık |
| Kur hassasiyeti | Kaynak ondalıkları kayıpsız korunmalı; birim bölmesinde yüksek hassasiyet |
| TRY yayın tutarı | Son adımda iki ondalık |
| Yuvarlama | Önerilen başlangıç half-up; ödeme ve vergi adapter’larıyla sözleşme testi |
| Minimum fiyat değişimi | Yuvarlanmış TRY tutarı değişmiyorsa Pricing tutarı yeniden yazılmasın |
| Güncelleme aralığı | Yeni doğrulanmış bülten başına yayın; seller edit’leri ayrıca işlenir |
| Büyük fiyat değişimi | Karantinaya alma/inceleme eşiği; sayısal eşik ürün onayı ister |

Döviz satış tercihi **muhasebe veya vergi için zorunlu kur seçimi değildir**. Ticari fiyatlandırma, muhasebe değerleme ve ödeme sağlayıcısının settlement kuralları ayrı onaylanmalı.

**RECOMMENDED — Kur yaşı:**

- Tatil takvimiyle açıklanan eski gözlem: son geçerli kur kullanılabilir.
- Beklenen yeni bülten alınamadığında: uyarı ve sınırlı tolerans.
- Önerilen tolerans: bir beklenen yayın döneminin kaçırılmasına kadar; üst sınır ayrıca onaylanmalı.
- Geçerli kur hiç yoksa veya limit aşılmışsa: ilgili yabancı para Offer için yeni quote/checkout durdurulmalı.
- TRY Offer’lar ve tamamlanmış işlemler bağımsız devam etmeli.
- Daha önce kabul edilmiş quote’un geçerliliği ayrı süre politikasına bağlı olmalı.

**İndirim/vergi/kargo:**

- Kaynak liste ve indirimli fiyat aynı FX sürümüyle çevrilmeli.
- Seller indirimi ile platform promotion’ı ayrı tutulmalı.
- Bir indirim hem kaynak fiyatta hem promotion adjustment’ında iki kez uygulanmamalı.
- Vergi dahil/hariç niteliği korunmalı; vergi kuralları kur dönüşümünden bağımsız yürütülmeli.
- Kargo TRY fiyatlandırılabilir; yabancı para kargo kaynağı varsa ayrıca provenance gerekir.
- Miktar ve organizasyon fiyatları kendi uygunluk bağlamlarıyla yayınlanmalı.

**VERIFIED — “En düşük uygun segment fiyatı” otomatik garanti değil.** Kurulu Pricing repository fiyatları PriceList varlığı, kural sayısı ve sonra tutara göre sıralıyor. Farklı özgüllükteki kurallar arasında global minimum varsayımı yanlış olabilir.

**RECOMMENDED — Bu politika isteniyorsa**, sunucunun doğruladığı uygun segment adayları arasında deterministik seçim yapıp sonucunu desteklenen fiyat altyapısına aktaran adapter gerekir. Client’ın gönderdiği organization/group ID’sine güvenilmemeli.

### 12. Fiyat yayın ve güncelleme mekanizması

**RECOMMENDED — C için yayın yaşam döngüsü:**

`hazırlandı → doğrulandı → uygulanıyor → aktif / başarısız / uzlaştırma gerekiyor`

Yayın kimliği şunlara dayanmalı:

- Kaynak fiyat revizyonu.
- FX gözlem revizyonu.
- Fiyatlandırma politika sürümü.
- Offer ve uygunluk kapsamı.
- Hesaplanan fiyatların içerik özeti.

**Yazma minimizasyonu:**

- Yalnız değişen para birimlerine bağlı Offer’lar taranmalı.
- Seller edit’i yalnız ilgili Offer/kapsamı etkilemeli.
- TRY kaynak fiyatları FX değişiminden dolayı yazılmamalı.
- Aynı yuvarlanmış tutarda fiyat satırı yazması atlanmalı; provenance değişimi yine kaydedilmeli.
- Mevcut Price ID’leri korunmalı.
- Ortak PriceSet bütün olarak değiştirilmemeli.

**VERIFIED — Bulk altyapı var**, fakat kayıt sayısı ile API çağrı sayısı ayrıdır. Bir bulk çağrı içindeki bin fiyat yine bin fiyat mutation’ıdır.

Etkilenen Offer sayısı `N`, Offer başına değişen fiyat satırı ortalaması `k` ise Pricing yazma hacmi yaklaşık **`N × k`** olur. Liste/indirim, segment ve miktar kademeleri `k`’yı artırır.

**RECOMMENDED — İlk sürümde global atomik katalog geçişi yerine Offer/küçük yayın grubu bazında doğrulanan aktivasyon.** Her Offer’ın kaynak revizyonu, TRY tutarı ve provenance’ı tutarlı olmalı. Batch’in tamamlanmış görünmesi için tüm kayıtlar uzlaştırılmalı.

**UNVERIFIED — Medusa/Mercur bütün katalog için hazır bir fiyat publication-version aktivasyon API’si sağlamıyor.** PriceList `draft/active` olması, bütün base/sale/override kayıtlarını atomik yayınlayan mekanizma değildir.

Gelecekteki PoC iki noktayı kanıtlamalı:

- Fiyatları ve provenance’ı uygularken aradaki tutarsız pencerenin satışa açılmaması.
- Alternatif version-rule staging kullanılacaksa bütün okuma/sepet yollarının aynı aktif sürüm bağlamını kullanması.

**Kısmi hata:** Yayın başarısızsa etkilenen Offer’ın yeni fiyatı aktif kabul edilmemeli. Önceki tam yayın korunmalı veya Offer geçici satışa kapatılmalı; kontrolsüz eski/yeni karışımı gösterilmemeli.

**VERIFIED — Compensation eksiksiz varsayılamaz.** `removeOfferPricesStep` için compensation görülmedi; `addOfferPricesStep` compensation’ı yeni fiyatları kaldırıyor, mevcut fiyat tutarlarını eski haline döndürmüyor. Bu yüzden yıkıcı fiyat kümesi değiştirmeye dayalı rollback önerilmiyor.

**Cache/arama:** `updateOffersWorkflow` update event’i çıkarıyor; doğrudan pricing workflow kullanmak aynı event zincirini garanti etmez. Yayın sürümü içeren cache anahtarı, kalıcı invalidation işi ve index reconciliation gerekir. Arama index’i ödeme otoritesi olmamalı.

### 13. Sepet ve checkout senaryoları

Aşağıdaki davranışlar **RECOMMENDED**:

| Senaryo | Yeniden hesaplanacak | Korunacak / gerekli işlem |
|---|---|---|
| 1. EUR aynı, EUR/TRY yükselir | Sonraki TRY yayın fiyatı | Kaynak EUR revizyonu; FX değişim nedeni |
| 2. Seller USD fiyatını değiştirir | İlgili TRY fiyat ve uygunluk kademeleri | Yeni seller revizyonu; önceki geçmiş |
| 3. Seller indirim yüzdesini değiştirir | Kaynak indirimli fiyat ve TRY karşılığı | Seller indirimi ayrı olay |
| 4. Eski sepete dönüş | Güncel uygun fiyat, vergi, promotion, kargo | Eski/yeni tutar farkı gösterimi ve yeniden kabul |
| 5. Checkout sırasında yeni kur | Yeni alışverişlerin yayınları | Geçerli kabul edilmiş quote’u sessizce değiştirmeme |
| 6. Yayın yarıda kalır | Eksik/başarısız Offer’ların reconciliation’ı | Son tam Offer yayını; batch başarısız durumu |
| 7. Tatil nedeniyle yeni kur yok | Takvim uygunluğu/kur yaşı kontrolü | Önceki gerçek gözlem; yapay tatil kuru yok |
| 8. EUR/USD/TRY kaynaklı karma sepet | Her Offer’ın TRY fiyatı ve sepet toplamı | Tek TRY ödeme; kalem bazlı kaynak/FX snapshot |
| 9. Seller organizasyonu engeller | Güncel satış yetkisi | Engelli kalem için ödeme reddi; sessiz çıkarma yok |
| 10. Sonraki kurla kısmi refund | Orijinal TRY işlemine göre iade payı | Orijinal FX ve tutar; yeni kur kullanılmaması |
| 11. Bağımsız komisyonlar | Her bileşenin kendi matrahı/istisnası | Kural ve matrah snapshot’ları |
| 12. Eski işlem provenance talebi | Saklanan kanıtın sunulması | Güncel kurla geçmişi yeniden üretmeme |

**RECOMMENDED — Checkout sırası:**

1. Seller/organization uygunluğunu sunucuda doğrula.
2. Aktif ve eksiksiz yayınları seç.
3. Sepeti yeniden fiyatlandır; vergi/promotion/kargoyu güncelle.
4. Fiyat değişimini müşteriye göster.
5. Kabul edilen fiyat sürümü ve toplam için sınırlı ömürlü quote oluştur.
6. Ödeme session tutarını bu toplamla eşleştir.
7. Complete akışında quote, sepet, izin ve tutar eşitliğini doğrula.
8. Siparişlere immutable finansal snapshot’ı taşı.

**UNVERIFIED — Mevcut cart kilidi fiyat publisher’ını kilitlemiyor.** Tek bir workflow kilidi fiyat, quote ve ödeme arasında kendiliğinden concurrency garantisi sağlamaz.

**Önemli UNVERIFIED risk:** Mercur cart hook’u birden fazla `offer_id`’yi ortak bağlama ekliyor. Medusa’nın kalem bağlamını üreten kaynakta her kalem için ayrı Offer ID’sine daraltma görülmedi. Aynı varyantın iki seller Offer’ı aynı sepetteyse fiyatların karışma ihtimali küçük bir runtime testle sınanmalı. Store Offer liste helper’ının bu durumu ayrı ayrı ele alması bu testi özellikle önemli kılıyor.

### 14. Fiyat geçmişi, tasarruf ve hukuki gösterim

**RECOMMENDED — En az bir yıl korunacak ayrı bilgiler:**

- Seller kaynak liste fiyatı ve para birimi.
- Seller kaynak indirimli fiyatı ve para birimi.
- Seller indirim oranı ve hesaplama niteliği.
- Yayınlanmış TRY fiyatı.
- FX gözlem/revizyonu ve uygulama zamanı.
- Seller repricing / yalnız FX / promotion / politika değişikliği nedeni.
- Fiyatın gerçekten satışa açık olduğu zaman aralığı.
- Segment, organization, miktar ve vergi bağlamı.

**Önemli ayrım:** Bugünkü formülle eski kaynak fiyatı çevirmek, geçmişte müşteriye gerçekten sunulan TRY fiyatını kanıtlamaz. Yayın gecikmesi, markup, yuvarlama ve kampanyalar sonucu değiştirebilir.

**RECOMMENDED — Grafikler:**

- Orijinal para birimi fiyat grafiği: seller değişikliklerini açık gösterir.
- TRY grafiği: FX ve diğer ticari değişimleri birlikte gösterir.
- Olay nedenleri ayrı işaretlenmeli.
- Kaynak para birimi değişmişse grafik kesintisi veya açık dönüşüm açıklaması kullanılmalı.

7/10/14/15/365 günlük minimum hesaplanabilir; bunlar aynı hukuki işlevi taşımaz. Aynı Offer, müşteri kapsamı, miktar ve vergi koşulları karşılaştırılmalı. Satışa hiç açık olmayan kayıt referans fiyat yapılmamalı.

**VERIFIED — Güncel hukuk kontrolü önemli:** Ticaret Bakanlığının 2 Eylül 2026 açıklaması, 1 Ağustos 2026’da yürürlüğe giren düzenleme için indirim öncesi son **10 günlük** en düşük fiyat esasını bildiriyor. Eski 30 günlük kılavuzları güncel varsaymak doğru değil. [Bakanlık açıklaması](https://www.ticaret.gov.tr/haberler/ticaret-bakanligi-tuketicilerin-ekonomik-menfaatlerinin-korunmasi-amaciyla-indirimli-satis-reklamlarina-yonelik-kapsamli-inceleme-ve-denetimlerini-kararlilikla-surduruyor).

**RECOMMENDED — FX düşüşü seller indirimi diye etiketlenmemeli.** Kaynak liste fiyatının bugünkü TRY karşılığı da geçmişte uygulanmış “eski satış fiyatı” diye çizilmemeli.

**UNVERIFIED — Hukuk/ürün incelemesi gerekenler:** B2B/B2C kapsamı, organizasyona özel fiyatlar, kampanya istisnaları, kaynak fiyat referansı, TRY reklam matrahı, seller/kanal ayrımı ve uygulanacak güncel yönetmelik maddeleri.

Fiyat grafiği göstermek reklam edilen indirimi kendiliğinden hukuka uygun yapmaz.

### 15. Refund, komisyon ve settlement

**VERIFIED — Komisyon girdileri siparişten geliyor:** `currency_code`, kalem subtotal/tax/total, seller ve ürün kapsamı.

Yerleşik sağlayıcı:

- Seller/product/type/category/collection kurallarını eşleştiriyor.
- Boyutlar arasında AND, aynı boyut içinde OR uyguluyor.
- En özgül oranı seçiyor; eşitlikte eski oran öne geliyor.
- Kalem başına bir komisyon satırı oluşturuyor.
- Kargoyu global oran üzerinden ayrıca değerlendiriyor.

**RECOMMENDED — Çok bileşenli komisyon:** Desteklenen `ICommissionProvider.getCommissionLines(context)` sözleşmesi üzerinden DoğruAdres sağlayıcısı değerlendirilmeli.

Her bileşen kendi:

- Koduna.
- Matrah tanımına.
- Vergi/kargo kapsamına.
- Seller/product istisnasına.
- Sabit TRY tutarı/yüzdesine.
- Yuvarlama kuralına.
- Refund ters kayıt politikasına sahip olmalı.

**VERIFIED — `CommissionLine.data` ek kanıt taşıyabilir.** Fakat mevcut refresh akışı komisyon satırlarını değiştirir; “komisyon tarihçesi zaten immutable” denemez.

**VERIFIED — Payout hesaplaması** incelenen akışta:

`order.total − toplam commission line tutarı`

ve `order.currency_code` ile sağlayıcıya iletiliyor. Kaynak EUR/USD/CNY üzerinden payout FX dönüşümü bulunmuyor.

**RECOMMENDED — Tamamlanmış işlem snapshot’ı:** TRY birim fiyatı, kaynak fiyatlar, FX birimi/değeri/revizyonu, vergi ve discount dağılımları, komisyon bileşen matrahları, seller ve organization kapsamı, quote/policy sürümleri.

Kısmi refund:

- Orijinal TRY tahsilatından hesaplanmalı.
- Satır indirimi ve vergi paylarını korumalı.
- Güncel kur kullanmamalı.
- Payout yapılmışsa seller bakiyesi/geri alma işlemi ayrıca tasarlanmalı.

**UNVERIFIED — Refund sonrasında payout ve seller balance’ın bütün durumlarda doğru ters çevrildiği kanıtlanmadı.** İncelenen core’da genel amaçlı tam seller ledger/balance modülü doğrulanmadı; payout kaydı ile finansal ledger eşdeğer kabul edilmemeli.

### 16. Mercur ve Medusa-only toplam mühendislik yükü

| Sorumluluk | Mercur korunursa | Medusa-only |
|---|---|---|
| Seller/store yaşam döngüsü | Mevcut altyapı adapte edilir | Modeller, API’ler ve lifecycle geliştirilir |
| Membership ve vendor scope | Mevcut membership/permission yüzeyleri | Ekip, davet, store switching ve izolasyon geliştirilir |
| Vendor UI | Kaynak fiyat ekranları eklenir | Portalın büyük bölümü yeniden oluşturulur |
| Çok satıcılı Offer | Mevcut Offer + fiyat kuralı | Model, link, inventory ve pricing sahipliği geliştirilir |
| OrderGroup/splitting | Mevcut akış ve sözleşme testleri | Split, refund, retry, shipping ve ödeme dağılımı geliştirilir |
| Komisyon | Özel provider gerekir | Komisyon motoru ve entegrasyonu geliştirilir |
| Payout | Mevcut provider/workflow adapte edilir | Onboarding, transfer, webhook, retry geliştirilir |
| Balance/ledger | Kapsamı ayrıca doğrulanıp tamamlanır | Tamamen proje sorumluluğu |
| Vendor/product approval | Mevcut akışlar | Approval ve yönetim ekranları geliştirilir |
| FX/history/quote | DoğruAdres geliştirmesi | Yine DoğruAdres geliştirmesi |

**INFERRED — D’nin gideri yalnız ilk kodlama değildir:** izolasyon, ödeme, compensation, upgrade, yönetim ekranları ve finansal regresyon testlerinin sürekli sahipliği de değişir.

**RECOMMENDED — Şimdilik Mercur korunmalı.** PoC, kritik fiyat/checkout gereksinimini yalnız çekirdek değiştirerek çözebildiğimizi gösterirse platform kararı yeniden açılmalı. Bugünkü kanıtlar bu sonucu göstermiyor.

### 17. Riskler, onay kararları ve en küçük PoC

**RECOMMENDED — Operasyon ve güvenlik:**

- Decimal/raw tutarlar hesaplama otoritesi; float yalnız sunum adapter’ında.
- Source revision üzerinde optimistic concurrency.
- Yayın ve checkout için açık lock sırası.
- Kalıcı başarısızlık durumu, sınırlı retry, manuel reconciliation.
- İdempotency anahtarları.
- Fiyat/policy değişikliklerinde actor, gerekçe ve önce/sonra audit.
- Seller-private fiyatlar shared catalog veya public metadata’dan sızmamalı.
- Organization kapsamı backend’de doğrulanmalı.
- Finansal kayıtlar için kısıtlı yazma yetkisi; düzeltmeler yeni kayıtlarla izlenmeli.
- Loglarda API key, ödeme sırrı ve müşteri özel fiyatları gereksiz yayınlanmamalı.

**Ölçek — INFERRED; benchmark değil:**

| Offer sayısı | Başlıca risk |
|---:|---|
| 10.000 | Sınırlı batch ve tek worker için PoC/ölçümle başlanabilir |
| 100.000 | Yayın süresi, DB/index yükü, yeniden başlatma ve seller-edit çatışmaları |
| 1.000.000 | Fiyat satırı sayısı, FX başına yazma hacmi, geçmiş depolama ve index gecikmesi |

Bir milyon Offer’ın her gün bir kez değişmesi, yılda yaklaşık **365 milyon değişim kaydı** demektir; bu kapasite sonucu değil, aritmetik hacimdir. Değişmeyen kayıtları çoğaltmamak ve fiyatları geçerlilik aralıklarıyla saklamak önemli olur.

**VERIFIED — Upgrade riski:** Mercur paketi Medusa core-flows için kendi shipping/payment/delivery patch manifest’ini taşıyor. Bunlar DoğruAdres’in yaptığı değişiklikler değil, **upstream tarafından paketlenmiş entegrasyon uyarlamalarıdır**. Etkin çalışma durumları runtime ile doğrulanmadı. Yeni DoğruAdres çekirdek patch’i önerilmiyor.

**Ürün sahibi onayı gereken kararlar:**

1. DoğruAdres kaynak fiyat/FX/yayın alanlarının sahipliği.
2. Döviz satış kuru seçimi ve varsa markup.
3. Kaynak hassasiyeti ve TRY yuvarlama.
4. Kur yaşı/tatil/kesinti politikası.
5. Quote süresi ve checkout sırasında fiyat garantisi.
6. Offer bazlı kademeli aktivasyon veya global aynı-FX yayını gereksinimi.
7. Segmentler arası minimum fiyat ve promotion stacking politikası.
8. Farklı para birimli liste/indirim fiyatlarının gösterimi.
9. Komisyon bileşenleri, refund ve payout sonrası geri alma.
10. Geçmiş saklama süresi; bir yıldan sonraki silme/retention politikası.
11. Hukuki eski fiyat ve tasarruf gösterimi.
12. Yayın sırasında geçici satış engellemesinin ürün davranışı.

**UNVERIFIED — Gelecekteki en küçük PoC; bu çalışmada çalıştırılmadı:**

- Yerel izole veritabanı ve test ödeme sağlayıcısı.
- İki seller’ın aynı varyantta farklı TRY Offer fiyatları.
- Aynı sepette iki Offer: add/update/force-refresh/complete sonrası doğru fiyat ve seller link’i.
- Bir seller PriceList indiriminin diğer seller’a geçmediğinin testi.
- EUR/USD/CNY/TRY kaynakları için sabit fixture oranları.
- JPY `Unit=100` ve kur yuvarlama sınırları.
- Seller edit’i ile publication yarışması.
- Yayın ortasında hata; restart, retry, compensation ve reconciliation.
- Kabul edilen quote sonrası yeni FX; tahsilat ve sipariş tutarlarının eşitliği.
- Checkout sırasında organizasyon bloklama.
- Kısmi refund, çok bileşenli komisyon ve payout sonrası düzeltme.
- Geçmiş işlem provenance’ının yalnız snapshot’lardan sunulması.

**Geçiş kriteri:** Bu testler desteklenen module/workflow/hook/provider yollarıyla geçmeden üretim uygulanabilirliği onaylanmamalı.

### 18. Kaynak kanıtları ve değişiklik yapılmadığı teyidi

Kurulu Mercur kaynak kökü:

`D:\DogruAdres\packages\api\node_modules\@mercurjs\core\.medusa\server\src`

Bu kök altında incelenen gerçek yollar:

| Yol | Kanıt |
|---|---|
| `modules/seller/models/seller.js` | Tek Seller currency alanı |
| `api/vendor/sellers/validators.js` | Vendor currency güncelleme yüzeyi |
| `links/offer-price-link.js` | Offer–Price list link’i |
| `workflows/offer/workflows/upsert-offer-prices.js` | Offer fiyat kümesi ve ownership |
| `workflows/offer/utils/assert-offer-price-ownership.js` | Başka Offer fiyat ID’sinin reddi |
| `workflows/offer/steps/add-offer-prices.js` | Bulk `addPrices`, link atama, compensation |
| `workflows/offer/steps/remove-offer-prices.js` | Fiyat kaldırma adımı |
| `api/store/offers/helpers.js` | Offer bazlı calculated price |
| `workflows/cart/hooks/set-pricing-context.js` | Cart Offer bağlamı |
| `workflows/cart/workflows/complete-cart-with-split-orders.js` | Cart snapshot, splitting, payment |
| `api/store/carts/[id]/complete/route.js` | `order_group` yanıtı |
| `api/vendor/price-lists/[id]/prices/batch/route.js` | PriceList bulk API |
| `modules/commission/providers/system.js` | Tek kazanan komisyon algoritması |
| `workflows/commission/workflows/refresh-order-commission-lines.js` | Komisyon girdileri ve hook’lar |
| `workflows/payout/workflows/create-payout.js` | Payout tutarı/para birimi |
| `workflows/payment/workflows/split-order-payments.js` | Capture’ın seller siparişlerine dağıtılması |
| `patches/manifest.js` | Upstream Medusa entegrasyon patch’leri |

Kurulu Medusa kaynakları:

- `packages/api/node_modules/@medusajs/core-flows/dist/cart/workflows/add-to-cart.js`
- `packages/api/node_modules/@medusajs/core-flows/dist/cart/workflows/refresh-cart-items.js`
- `packages/api/node_modules/@medusajs/core-flows/dist/cart/workflows/get-variants-and-items-with-prices.js`
- `packages/api/node_modules/@medusajs/core-flows/dist/cart/steps/get-variant-price-sets.js`
- `node_modules/.bun/@medusajs+pricing@2.21.2+b89be59cb17eb8c6/node_modules/@medusajs/pricing/dist/models/price.js`
- Aynı Pricing kökünde `models/price-list.js`, `services/pricing-module.js`, `repositories/pricing.js`.

Kurulu vendor kanıtları:

- `apps/vendor/node_modules/@mercurjs/vendor/dist/offer-create-page-36PYLWW4.js`
- `apps/vendor/node_modules/@mercurjs/vendor/dist/chunk-IDQIECSP.js`
- `apps/vendor/node_modules/@mercurjs/vendor/dist/edit-N3MHDCAT.js`

Sürüm eşleşen bundled belgeler:

- `node_modules/@mercurjs/docs/llms.txt`
- `content/learn/offers.mdx`
- `content/learn/sellers.mdx`
- `content/learn/commissions.mdx`
- `content/learn/order-groups.mdx`
- `content/learn/payouts.mdx`
- `content/platform/offer/concepts/pricing-and-inventory.mdx`
- `content/platform/store/concepts/store-entity.mdx`
- `content/references/api/vendor/offers/update-offer.mdx`
- `content/resources/best-practices/workflows.mdx`
- `content/resources/customization/extend-a-workflow.mdx`

Resmi release kaynakları ayrıca kontrol edildi: [Mercur v2.3.6 Offer fiyat workflow’u](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/workflows/offer/workflows/upsert-offer-prices.ts), [Mercur v2.3.6 checkout](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/workflows/cart/workflows/complete-cart-with-split-orders.ts), [Medusa v2.21.2 Pricing service](https://github.com/medusajs/medusa/blob/v2.21.2/packages/modules/pricing/src/services/pricing-module.ts).

**Doküman farkı:** Medusa online `original_price` açıklaması, kurulu ve resmi v2.21.2 kaynakta bulunan stacked SALE/OVERRIDE referans seçimini tam açıklamıyor. Bu fark release kaynakla karşılaştırıldı; DoğruAdres customization’ı olarak sınıflandırılmadı. [Online fiyat hesaplama belgesi](https://docs.medusajs.com/resources/commerce-modules/pricing/price-calculation).

**VERIFIED — Başlangıç ve bitiş Git durumu aynı:**

```text
?? .vscode/
?? DESIGN.md
```

`git diff --stat` ve `git diff --name-only` boştu. Dosya, doküman veya konfigürasyon değiştirilmedi; dependency kurulmadı; build, test veya migration çalıştırılmadı. Üretim verisine erişilmedi, toplu TCMB arşivi indirilmedi, credentials alınmadı. `.vscode/` ve `DESIGN.md` korundu.

**A4 değerlendirmesi tamamlandı. Tercih C; uygulama onayı verilmiş sayılmıyor. A5’e geçmeden ürün sahibi incelemesi bekleniyor.**