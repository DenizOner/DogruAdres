# DoğruAdres A7 — Salt Okunur Mimari Fizibilite Raporu

**Tarih:** 10 Ekim 2026  
**Sonuç:** Organization kapsamlı, isteğe bağlı BYOK AI uygulaması uygulanabilir. **Tercih edilen başlangıç mimarisi A: mevcut Medusa backend’i içinde, DoğruAdres’e ait küçük bir sağlayıcı adaptörü, merkezi yetkilendirme ve sınırlı araç yürütücüsü.**

Bu rapordaki tasarımlar uygulama önerisidir; ürün, güvenlik, bağımlılık veya veritabanı kararı olarak kabul edilmiş değildir. Uygulama başlatılmamıştır.

Kanıt etiketleri:

- **VERIFIED:** İncelenen yerel kaynak veya resmi belgeyle doğrulandı.
- **INFERRED:** Kanıtlardan çıkarılan mimari değerlendirme.
- **RECOMMENDED:** Gelecek uygulama için öneri; ürün sahibi onayı gerekir.
- **UNVERIFIED:** Mevcut incelemeyle doğrulanamadı.

## 1. Yönetici sonucu

**RECOMMENDED — AI, yetkili domain uygulama katmanının sınırlı bir istemcisi olmalıdır.** Model araç çağrısı önerebilir; hangi aracın çalışacağına, hangi verinin döneceğine ve hangi işlemin onay gerektirdiğine sunucu karar verir.

Başlangıç için:

- Her çalışma tek Organization ve doğrulanmış Store bağlamına bağlanmalı.
- Organization bağlantısı, sağlayıcı anahtarı ve kullanım politikası sunucuda tutulmalı.
- Model SQL, yönetici token’ı, genel HTTP istemcisi, shell veya sınırsız dosya erişimi almamalı.
- İlk araçlar yalnızca yetkili okuma ve hesaplama yapmalı.
- Kalıcı teklif oluşturma, somut teklif içeriğine bağlı insan onayından sonra domain workflow’u üzerinden yapılmalı.
- AI bağlantısı olmayan veya AI uygulamasını kapatan Organization diğer uygulamaları normal kullanabilmeli.
- Ayrı AI servisi başlangıçta gerekli değildir. Uzun veya ağır işler için ileride seçici worker ayrıştırması değerlendirilebilir.

**VERIFIED — Mevcut kaynaklar güvenli AI uygulamasının önkoşullarını hazır göstermiyor.** Yerel mimari belgesi projeyi DoğruAdres iş domain’leri henüz uygulanmamış temiz başlangıç olarak tanımlıyor. A1–A6 raporları incelenen yerel belgelerde bulunamadı. Bu raporda kullanıcı mesajındaki A1–A6 yönü kabul edilmiş bağlamdır; uygulanmış güvenlik kabiliyeti değildir.

**Kritik doğrulanmış fark:** Mercur 2.3.6 permission middleware’i, permission resolver veya actor bulunmadığında `grantAll` ve `permissions_enforced=false` yolunu kullanıyor; `requirePermission` da enforcement yoksa devam ediyor. Dolayısıyla bu middleware tek başına A5’in fail-closed yönünü sağlamaz. AI uygulaması eksik yetkilendirme durumunda reddetmelidir. Bu davranış, burada upstream hata olarak sınıflandırılmamıştır. [Yerel middleware](D:/DogruAdres/packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/utils/permissions-middleware.js:35)

## 2. Resmi sağlayıcı ve framework araştırması

| Yaklaşım | VERIFIED kabiliyet | DoğruAdres için değerlendirme |
|---|---|---|
| OpenAI API | Function calling, şema kısıtlı araç girdileri; uygulama araçları kendisi yürütür | Küçük adaptörle kullanılabilir. Sağlayıcı çağrısı yetkilendirme veya iş workflow’u değildir |
| Anthropic API | Uygulamada yürütülen client tools ve sağlayıcıda yürütülen server tools; structured outputs ve strict tool use | İlk kapsam yalnızca DoğruAdres client tools olmalı |
| Gemini API | Function declarations/calls; structured output için JSON Schema alt kümesi | Sağlayıcı farkları adaptörde açıkça temsil edilmeli |
| Vercel AI SDK | TypeScript sağlayıcı soyutlaması, araç çağrıları, streaming, çok adımlı yürütme ve araç onay mekanizmaları | İsteğe bağlı kütüphane adayı; güvenlik otoritesi değildir |
| LangGraph | Kalıcı durum üzerinden interrupt/resume yaklaşımı | Karmaşık dayanıklı akış ihtiyacı kanıtlanmadan başlangıç bağımlılığı olmamalı |
| MCP | Araçları standart protokolle sunma ve güvenlik/authorization kuralları | Harici, onaylı entegrasyonlarda anlamlı; backend içi çağrılar için zorunlu değil |

Resmi belgeler: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling), [Anthropic tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview), [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [AI SDK](https://ai-sdk.dev/docs/introduction), [AI SDK tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling), [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts).

**RECOMMENDED — Ortak sözleşme küçük tutulmalı:** model isteği, metin/durum olayları, araç çağrısı, araç sonucu, kullanım ölçümü, hata ve iptal. Sağlayıcıya özgü konuşma blokları, continuation verileri ve capability farklılıkları adaptör içinde korunmalı; bütün sağlayıcıların birebir aynı davrandığı varsayılmamalı.

Şema uyumu; doğru OEM, uygun fiyat, yetkili erişim veya güvenilir içerik garantisi değildir. Sunucu, şemaya uygun girdilerin domain anlamını ayrıca doğrulamalıdır.

**Streaming:** Kullanıcıya ilerleme gösterilebilir; eksik JSON veya tamamlanmamış araç girdisi yürütülmemeli. Anthropic’in fine-grained streaming belgesi de parçalı/geçersiz JSON olasılığını açıkça belirtir. [Resmi belge](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)

**Uzun işler:** Sağlayıcının background generation özelliği, DoğruAdres’in job yetkilendirmesi, onayı veya güvenli recovery mekanizmasının yerine geçmez. OpenAI background mode geçici sunucu tarafı saklama içerir; veri politikası ayrıca değerlendirilmelidir. [Background mode](https://developers.openai.com/api/docs/guides/background)

**Çok adımlı orkestrasyon:** Küçük, adım/zaman/token sınırı olan uygulama döngüsü yeterli başlangıçtır. Araç sayısı ve paralellik sınırlanmalı; yazma araçları sıralı yürütülmeli.

**İnsan onayı:** SDK’nın approval/interrupt kabiliyeti kullanıcı deneyimine yardımcı olabilir. Yetkili onay kaydı, güncel izin denetimi ve atomik tüketim DoğruAdres’e ait kalmalıdır. İncelenen güncel AI SDK belgesinde eski `needsApproval` yerine `toolApproval` öneriliyor; uygulanacak sürümün sözleşmesi yeniden doğrulanmalıdır. [Araç onayı](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)

**Ticari ayrım:** Sağlayıcı API kullanımı, özel veri saklama anlaşmaları ve yönetilen gateway/hosting hizmetleri ayrı ticari konulardır. SDK kullanımı bunlara otomatik erişim sağlamaz. Hesaba/model seçimine özgü destek, kota, fiyat ve ticari haklar **UNVERIFIED** durumundadır.

**Tercih:** Küçük proje-owned adaptör ve bounded dispatcher. AI SDK ancak somut TypeScript/streaming bakım avantajı kanıtlanırsa değerlendirilmelidir; büyük otonom-agent framework’ü başlangıç gereksinimi değildir.

## 3. Önerilen AI mimarisi

**RECOMMENDED — A mimarisi:**

```text
Kullanıcı / AI arayüzü
        ↓
Kimlik + Organization/Store bağlamı + uygulama entitlement
        ↓
DoğruAdres AI application service
  ├─ merkezi authorization
  ├─ bağlantı ve bütçe kontrolü
  ├─ bounded orchestration
  ├─ approval / audit / cancellation
  └─ sağlayıcı adaptörü → seçilmiş AI sağlayıcısı
        ↓
Sınırlı tool dispatcher
        ↓
Yetkili domain application API’leri / workflow’ları
        ↓
DoğruAdres domain’leri ve Mercur-supported extension noktaları
```

AI persistence modülü yalnızca kendi bağlantı/çalışma verisinin sahibi olmalı. Cross-module orkestrasyon application/workflow katmanında bulunmalı. Bu ayrım kurulu Mercur modül/workflow belgeleriyle uyumludur. [Yerel modül rehberi](D:/DogruAdres/node_modules/@mercurjs/docs/content/resources/best-practices/modules.mdx), [Yerel workflow rehberi](D:/DogruAdres/node_modules/@mercurjs/docs/content/resources/best-practices/workflows.mdx)

Başlangıç akışı:

1. Sunucu kullanıcıyı, üyeliği, Organization’ı ve gerekiyorsa Store eşleşmesini doğrular.
2. AI entitlement, bağlantı durumu ve bütçe kontrol edilir.
3. İzinli araçların alt kümesi modele sunulur.
4. Her çağrı tekrar authorize edilir; girdi doğrulanır.
5. Domain API/workflow çalışır.
6. Sonuç alan bazında süzülür ve provenance eklenir.
7. Bir sonraki adımdan önce iptal, izin ve bütçe yeniden kontrol edilir.
8. Yazma önerisi insan onayı durumuna geçer.
9. Onay sonrası yeniden doğrulanan domain workflow’u işlemi gerçekleştirir.

İş kuralları AI adaptörüne kopyalanmamalı. Örneğin fiyat, vergi ve teklif toplamı modeli tarafından üretilen sayılardan değil, yetkili domain hesaplamasından gelmelidir.

## 4. Backend içi, ayrı servis ve seçici hibrit karşılaştırması

| Boyut | A — Mevcut backend | B — Ayrı AI servisi | C — Seçici hibrit |
|---|---|---|---|
| Operasyon | En az yeni altyapı | Yeni deploy, ağ, service auth ve monitoring | Başlangıç kolay; ayrıştırma sonrası ek yük |
| Veri izolasyonu | Ortak merkezi policy; uygulama hatası riski | API sınırı yararlı; tenant auth yine zorunlu | Aynı policy korunursa güçlü |
| Credential güvenliği | Daha az dağıtım noktası; backend compromise etkisi geniş | Secret isolation mümkün; taşıma/delegation karmaşık | Worker’ın secret erişimi daraltılabilir |
| Availability | AI kaynak tüketimi core’u etkileyebilir | Process arızaları ayrışır; API bağımlılığı sürer | Ağır işlerin etkisi ayrışır |
| Geliştirici emeği | En düşük | En yüksek başlangıç maliyeti | İhtiyaç ortaya çıktıkça artar |
| Upgrade dayanıklılığı | Supported adapter/workflow sınırlarıyla iyi | Domain API sürümlemesi gerekir | Her iki sözleşme korunmalı |
| Cross-module erişim | Yetkili application katmanıyla doğrudan | API üzerinden; ekstra gecikme | Hafif işler içeride |
| İnsan onayı | Domain işlemiyle daha kolay bağlanır | İki servis arasında yarış/replay yönetimi | Onay otoritesi backend’de kalır |
| Ölçekleme | Ortak process sınırları | Bağımsız ölçekleme | Ağır işleri seçerek ölçekler |
| Observability | Tek korelasyon zinciri daha basit | Dağıtık trace gerekir | Worker korelasyonu gerekir |
| Bakım | Küçük kapsamda en düşük | Daha fazla operasyon ve güvenlik yüzeyi | Ölçülmüş ihtiyaçla sürdürülebilir |

**INFERRED — Başlangıç için A daha uygundur.** Modest Windows geliştirme ortamı, provisional modular monolith ve minimum bağımlılık politikasıyla örtüşür.

CPU ağır belge işleme, uzun OEM batch işleri veya ayrı ölçekleme gereksinimi ölçülürse C’ye geçiş değerlendirilebilir. Her Organization için ayrı sunucu/veritabanı oluşturmak mantıksal tenant izolasyonunun önkoşulu değildir.

## 5. BYOK güvenlik modeli

**RECOMMENDED — Connection management ile AI usage ayrı yetkiler olmalı.** Aşağıdaki adlar öneridir, mevcut permission key’leri değildir:

- `ai.connection.manage`: sağlayıcı ekleme, değiştirme, rotation ve revocation.
- `ai.use`: izinli AI işlerini başlatma.
- `ai.usage.read`: kullanım/maliyet görünürlüğü.
- `ai.automation.manage`: gelecekte zamanlanmış görev yönetimi.

| Aşama | Önerilen kontrol |
|---|---|
| Sağlayıcı seçimi | Sunucu-owned allowlist; model ve capability politikası |
| Anahtar girişi | TLS ile backend’e tek seferlik iletim; tarayıcı kalıcı depolamasına yazmama |
| Saklama | Authenticated encryption; Organization/connection/version bilgisine bağlama; ana şifreleme anahtarını DB’den ayrı tutma |
| Secret erişimi | Yalnızca backend credential broker/provider adapter; modele ve normal connection API’lerine plaintext vermeme |
| Validation | İleride onaylı, minimum veri kullanan çağrı; domain kayıtlarını göndermeme; maliyet/kota tüketimini belirtme |
| Rotation | Yeni credential version; geçiş sonrası eskisini devre dışı bırakma; eski run’ları otomatik yeniden canlandırmama |
| Revocation | Yerel kullanımı hemen durdurma; sağlayıcı tarafındaki iptal için ayrı yönetim adımı |
| Provider switching | Yeni bağlantı ve veri politikası değerlendirmesi; geçmiş konuşmayı otomatik aktarmama |
| Backup | Ciphertext ve key version yedeği; KEK erişimi ayrı; restore sonrası bağlantıları doğrulanana kadar devre dışı tutma |
| Personel ayrılığı | Connection Organization’a ait; görevli kişinin üyeliği kaldırılır; kişisel provider hesabı kullanılmışsa rotation/ownership incelemesi |
| İzleme | Maskeli connection bilgisi, kullanım ve hata kategorileri; key/prompt/body logging kapalı |

Şifreleme DB dump’ına karşı koruma sağlar; uygulama ile secret erişimi birlikte ele geçirilirse tek başına yeterli değildir. Least privilege, rotation ve secret erişim denetimi birlikte gerekir. [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

**Credential continuity:** Organization-owned kayıt, sağlayıcı hesabının da Organization mülkiyetinde olduğunu kanıtlamaz. İşletmeye ait provider project/account ve devir prosedürü ayrıca gerekir.

**Bütçe:** Organization, kullanıcı ve run düzeyinde çağrı/token/süre/eşzamanlılık sınırları; isteğe başlamadan tahmini bütçe rezervasyonu; tamamlanınca gerçek kullanım uzlaştırması önerilir. Yerel maliyet hesabı yaklaşık olabilir; provider invoice otoritesinin yerine geçmez. Aynı anahtarın platform dışında kullanımı yerel bütçeyi aşabilir.

**UNVERIFIED:** Belirli sağlayıcının hard spending cap, credential validation endpoint’i veya uzaktan revocation yeteneği bütün sağlayıcılarda ortak değildir.

## 6. Yetkilendirme ve delegation tasarımı

**RECOMMENDED — Temel invariant:**

```text
Effective AI authority =
  güncel insan yetkileri
  ∩ Organization/Store ve kaynak kapsamı
  ∩ uygulama entitlement
  ∩ onaylı delegation kapsamı
  ∩ sunucu tool politikası
  ∩ alan düzeyi izinler
```

Belirsiz veya eksik öğe erişim vermez. Modelin sunduğu `organization_id`, `seller_id` veya rol iddiası otorite oluşturmaz.

### İnsan ve bağlam

Canonical person ID, provider identity ve Mercur actor/member kimliğine açık eşlemeyle bağlanmalı. E-posta veya badge tek başına identity/permission sınırı olmamalı.

Run oluşturulduğunda Organization bağlamı sabitlenmeli. Kullanıcı başka Organization’a geçince eski konuşma yeni bağlantı/araç kapsamına taşınmamalı. İki Organization üyeliğinin yetkileri birleştirilmemeli.

**VERIFIED:** Mercur seller middleware’i header/session’dan Store seçimini alır, actor–seller üyeliğini sorgular ve `seller_context` üretir. Ancak bu sorguda cache açık; anlık üyelik iptali garantisi burada doğrulanmadı. [Yerel kaynak](D:/DogruAdres/packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/utils/ensure-seller-middleware.js:6)

### Delegation

Başlangıçta iç process context yeterli olabilir; JWT oluşturmak zorunlu değildir. Worker/servis ayrışırsa kısa ömürlü, audience-bound, dar kapsamlı delegation kullanılmalı:

- Person/principal, Organization, Store, run ve delegation kimliği.
- İzinli araçlar, kaynak sınırları, amaç, expiry.
- Policy/membership/connection version.
- İptal edilebilir sunucu kaydı.

Her araçtan önce; uzun çağrı dönüşünde sonuç sunulmadan önce; onayda ve yazma commit sınırında güncel izin kontrolü yapılmalı. İptal, daha önce sağlayıcıya gönderilmiş veriyi geri alamaz.

### Browser’sız görevler

İki model ayrı değerlendirilmelidir:

- **İnsan delegation’ı:** browser session gerektirmez; güncel insan yetkisi ve süreli görev izni gerekir.
- **Service principal:** ayrı ve açık Organization grant’i gerekir; insanın eski token’ını veya Organization owner yetkisini miras almaz.

İlk sürümde browser’sız AI automation kapalı tutulması önerilir. Gelecekte service-principal politikası ayrıca onaylanmalıdır.

### Bütün erişim yolları

| Yol | Enforcement |
|---|---|
| UI route | Görünürlük ve kullanıcı deneyimi; güvenlik sınırı backend |
| API/tool | Kimlik, bağlam, entitlement, resource ve field authorization |
| Workflow | Başlangıç ve mutation sınırında tekrar denetim |
| Job/queue | Onaylı principal/delegation; yalnızca payload’daki Organization’a güvenmeme |
| Search/index | Tenant/ACL filtresi retrieval öncesi; sonuç ve aggregate denetimi |
| File/export | Kaynak izni, tenant scope, dar download erişimi, expiry |
| Conversation/run history | Organization ve katılımcı erişimi; yalnızca `ai.use` yeterli olmamalı |
| Cache | Organization, principal/permission scope ve veri version ayrımı |

OWASP her istekte izin kontrolü ve deny-by-default yaklaşımını destekler. [Authorization rehberi](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

## 7. Önerilen sınırlı araç kataloğu

**RECOMMENDED — Aşağıdaki araçlar ve permission adları kavramsaldır; mevcut API olarak sunulmuyor.**

Tüm araçlarda server-owned context, şema doğrulama, boyut/pagination sınırı ve run/tool/policy audit kaydı ortak gereksinimdir.

| Araç / veri sahibi | İzin ve scope | Girdi/çıktı sınırı | İnsan onayı / risk |
|---|---|---|---|
| Yetkili araç ara / Vehicle | `vehicle.read`; aktif Organization | Normalize plaka/arama; sınırlı sonuç, minimum alan | Yok; çoklu eşleşmede seçim gerekir |
| Araç detayı oku / Vehicle | `vehicle.read`; VIN için ayrı alan izni | Yetkili vehicle ID; VIN maskeli veya hiç dönmez | Yok; eski/yanlış araç kaydı |
| OEM lookup iste / Automotive adapter | VIN kullanım + OEM entitlement | Sunucu vehicle ref’ten VIN alır; provider/kota kontrolü | Normal okuma; dış aktarım politikası gerekli |
| OEM/reference ile ürün bul / Products | `product.read`; izinli katalog | Marka namespace’i ve reference doğrulama; aday ilişki ve kaynak | Yok; eşdeğerlik fitment değildir |
| Stok müsaitliği oku / Inventory | `inventory.availability.read`; izinli Store/depo | Kaynak sahibi doğrulanır; müsaitlik ve timestamp | Yok; reservation/stok değişebilir |
| Maliyet oku / ilgili maliyet domain’i | `cost.read`; alan/kaynak kapsamı | Maliyet yetkisi yoksa alan, türev marj ve özet de verilmez | Yok; dolaylı maliyet sızıntısı |
| Marketplace Offer ara / Mercur adapter | Buyer-context marketplace erişimi | Ürün/OEM, miktar, currency/region/channel sunucuda doğrulanır; buyer-visible sonuç | Yok; fiyat/uygunluk değişebilir |
| Teklif tahmini hesapla / Quotations | İzinli kaynaklar ve quotation estimate | Domain fiyat/vergi hesabı; kaynak timestamp ve uncertainty | Yok; tahmin rezervasyon değildir |
| Teklif önerisi hazırla / Quotations | `quotation.propose`; mevcut Organization | Seçilmiş ürünler, miktar, yetkili fiyatlar; açık satır/tutar/provenance | İş teklifi oluşturmaz; onaya sunulur |
| Onaylı teklif oluştur / Quotations workflow | `quotation.create` + geçerli approval | Approval/proposal referansı; sunucu digest ve version doğrular | Zorunlu; stale veri ve duplicate riski |

Öneri/onay kaydı için teknik persistence gerekebilir; bu, onaysız kalıcı **iş teklifi** yaratma yetkisi anlamına gelmemelidir. Saklama kapsamı ayrıca onaylanmalı.

**VERIFIED — Mercur ayrıntıları:**

- Offer fiyatları shared PriceSet içinde `offer_id` kuralıyla kapsamlanıyor.
- Offer inventory, varyant yerine Offer’a bağlı.
- Store Offer route’u hesaplanmış fiyat ve sales-channel stock helper’larını kullanıyor.
- Varsayılan Offer alanları metadata ve ayrıntılı inventory alanları içeriyor; ham response doğrudan modele aktarılmamalı.

[Pricing/inventory belgesi](D:/DogruAdres/node_modules/@mercurjs/docs/content/platform/offer/concepts/pricing-and-inventory.mdx), [Store route](D:/DogruAdres/packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/store/offers/route.js:6), [Varsayılan alanlar](D:/DogruAdres/packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/store/offers/query-config.js:4)

**UNVERIFIED:** Gelecek B2B buyer Organization fiyatları ve eligible Offer kuralları mevcut storefront davranışıyla otomatik eşdeğer değildir. Ayrı domain adapter sözleşmesi gerekir.

## 8. İnsan onayı ve eylem risk politikası

| Kategori | Örnek | RECOMMENDED kontrol |
|---|---|---|
| Read-only | Yetkili arama, özet, hesaplama | Merkezi izin, veri minimizasyonu, bütçe, audit |
| Controlled write | Kalıcı draft quotation oluşturma | Tam içeriğe bağlı açık insan onayı, expiry, güncel izin ve veri kontrolü |
| High-impact | Fiyat değiştirme, sipariş, bağlayıcı gönderim, muhasebe, para transferi, bulk değişiklik, permission grant | İlk kapsam dışında; ayrı politika ve approval workflow’u; gerektiğinde MFA/çift yetkili |

Onay kaydı en az Organization, proposal/run, işlem türü, payload digest’i, kaynak version’ları, onaylayan kişi, timestamp, expiry ve tek kullanımlık kimliği kapsamalı.

Onay sonrası:

1. Onaylayan kişinin güncel yetkisi doğrulanır.
2. Proposal ve approval aynı Organization’da bulunur.
3. Fiyat, stok, vergi, müşteri ve ilgili kaynaklar yeniden okunur.
4. Onaylanan içerikten değişiklik varsa yeni fark gösterilip yeniden onay alınır.
5. Approval tüketimi ve iş kaydı oluşturma atomik/idempotent sınırda yapılır.

“Ne gerekiyorsa yap” gibi geniş onay kabul edilmemeli. Konuşmada modelin “kullanıcı onayladı” iddiası kayıt yerine geçmemeli.

**Önemli yarış koşulu:** Yeniden okuma ile commit arasında değişiklik olabilir. İlgili domain workflow’u optimistic concurrency veya uygun transaction/locking mekanizması sağlamalı. Evrensel cross-module atomiklik varsayılmamalı.

MFA ve çift onayın hangi tutar/işlemde uygulanacağı ürün ve güvenlik sahibinin kararıdır. Para transferi ve permission grant başlangıç tool kataloğuna eklenmemelidir.

## 9. Gizlilik, prompt injection ve tenant izolasyonu

**RECOMMENDED — Ürün açıklamaları, OEM yanıtları, web içerikleri, yüklenen belgeler ve kullanıcı içeriği untrusted data kabul edilmeli.**

| Tehdit | Kontrol |
|---|---|
| Ürün açıklamasında “başka tenant’ı sorgula” | İçeriği instruction kanalına yükseltmeme; dispatcher izin sınırı |
| Sahte OEM sonucu | Provider kaynağı/request ref olmadan doğrulanmış sonuç üretmeme |
| Malicious tool output | Şema/alan doğrulama, uzunluk sınırı; yeni araç/URL talimatlarını yürütmeme |
| Arbitrary URL / SSRF | Genel fetch aracı vermeme; sabit/provider allowlist egress |
| Upload üzerinden sızıntı | Yetkili dosya seçimi, kontrollü extraction, boyut/type sınırı |
| Bulk search/export | Ayrı izin, pagination ve aggregate sınırı; rate/cost limit |
| Cross-Organization cache/history | Tenant ve permission scope anahtarı; içerik erişimi tekrar kontrolü |
| Output ile veri sızıntısı | Deterministik alan filtreleme, güvenli renderer, yetkili kaynak referansları |

Prompt ayraçları veya injection detector tek başına güvenlik sınırı değildir. Model yanılabilir; server-owned policy yine işlemi durdurmalıdır. [OWASP prompt injection rehberi](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)

**Minimum veri:** VIN gerekiyorsa OEM adaptörüne iletilebilir; modelin tam VIN’i görmesi her zaman gerekli değildir. Araç sahibinin iletişim bilgisi, HR verisi, faturalar ve tüm stok tablosu sırf görev kolaylaşsın diye gönderilmemeli.

**Sağlayıcı saklama:**

- **OpenAI:** Eğitim kullanımı ile abuse/application-state saklama ayrı konulardır. `store:false` ZDR ile eşdeğer değildir; endpoint/feature istisnaları vardır. [Data controls](https://developers.openai.com/api/docs/guides/your-data)
- **Anthropic:** Ticari API standart saklama ve anlaşma/policy/yasal istisnaları belgelenmiştir; özel retention hakkı hesaba göre doğrulanmalı. [Retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
- **Gemini:** Paid/unpaid kullanım şartları farklıdır; unpaid şartları hassas/gizli/kişisel bilgi gönderilmemesini belirtir. Türkiye için başka bölgelerin istisnaları varsayılmamalı. [API terms](https://ai.google.dev/gemini-api/terms)

**RECOMMENDED:** BYOK kabulü yalnızca “anahtar çalışıyor” kontrolü olmamalı; provider project’in veri işleme koşulları da uygun bulunmalı.

Yurt dışına kişisel veri aktarımı, veri sorumlusu/işleyen rolleri, alt işleyenler, bölge ve aktarım mekanizması hukuk incelemesi gerektirir. BYOK bunu ortadan kaldırmaz. KVKK’nın resmi güncel rehber kaydı bu değerlendirme için başlangıçtır; bu incelemede sayfanın tam içeriği timeout nedeniyle alınamadı. [KVKK rehberi](https://www.kvkk.gov.tr/Icerik/8143/Kisisel-Verilerin-Yurt-Disina-Aktarilmasi-Rehberi)

Zorunlu üçüncü taraf analytics telemetry olmamalı. Audit; karar, araç, principal, kaynak referansı, süre, kullanım ve hata kategorisini kaydetmeli. Prompt/tool body saklama ayrı ve sınırlı politika gerektirir.

Organization/global kill switch, bağlantı kapatma ve run cancellation gerekli. Gönderilmiş verinin sağlayıcıdan geri alınabileceği vaat edilmemeli.

### Kişisel alan sınırı

Organization AI bağlantısı Job Board, Meydan veya job application verilerine otomatik erişmemeli.

- E-posta doğrulaması: onaylı görüntüleme/arama sınırı.
- Kişisel identity verification: posting, comment, like, follow, apply ve diğer participation.
- Organization iş ilanı yönetimi: ek Organization izinleri.
- Badge ve achievement: authorization yerine geçmez.

Kişisel AI kullanımını Organization BYOK ile finanse etmek veya kişisel veriyi bu connection’a açmak yeni ürün/güvenlik kararıdır; mevcut kapsam dışında kalmalıdır.

## 10. Gelecek OEM/VIN entegrasyon mimarisi

**RECOMMENDED — Provider-neutral automotive application sözleşmesi:**

| Alan | Kavramsal ihtiyaç |
|---|---|
| VIN lookup | Yetkili vehicle referansı; VIN doğrulama; provider capability |
| Vehicle identification | Marka/model/engine/production adayları; eksik ayırt edici bilgiler |
| OEM part identification | Part category, konum/taraf, provider part ID ve OEM namespace |
| Compatibility | Confirmed/candidate/ambiguous/unknown ayrımı; kapsam ve dayanak |
| Provenance | Provider, request/query ref, timestamp, data version |
| Confidence | Provider confidence ile model yorumunu ayırma; zorunlu yapay yüzde üretmeme |
| Licensing | Display, cache, retention, redistribution ve AI aktarım hakları |
| Quotas | Lookup maliyeti, rate limit, retry/circuit-breaker |
| Historical query | Lisansın izin verdiği referans/özet; ham yanıtı zorunlu saklamama |
| Product matching | DoğruAdres Product/equivalence adayları; açık ilişki türü |

Önerilen yanıt durumları: `resolved`, `ambiguous`, `not_found`, `unavailable`, `not_licensed`. Bunlar tasarım önerisidir.

**Eşleştirme:** Aynı numara tek başına aynı ürün veya fitment kanıtı değildir. Marka namespace’i, revizyon, taraf, araç konfigürasyonu ve provider kanıtı korunmalı. Cross-reference/equivalence ve vehicle compatibility ayrı ilişkiler olmalı. Otomatik master-product merge yapılmamalı.

**Şimdi netleştirilecek:** Automotive ownership, provenance, uncertainty durumları, izin kontrolü ve lisans metadata’sı ihtiyacı.

**Anlaşmaya bırakılacak:** Endpoint, auth, VIN kapsamı, OEM coverage, SLA, ücret, cache/retention, görsel kullanım, redistribution ve AI’ye aktarım hakkı.

**UNVERIFIED — LexCom:** Sözleşme, API erişimi ve veri kullanım hakkı doğrulanmış değildir. LexCom-specific connector/schema önerilmiyor. Scraping veya reuse yetkisi varsayılmıyor.

## 11. On sekiz zorunlu senaryo

Aşağıdaki kontroller **RECOMMENDED**; testler gelecek kabul kriterleridir, çalıştırılmadı.

| # | Senaryo | Enforcement ve olası hata | Kullanıcı deneyimi | Minimum kabul testi |
|---|---|---|---|---|
| 1 | İlk provider bağlantısı | Connection-manage, entitlement, server secret storage; plaintext sızıntısı | Maskeli bağlantı/durum, doğrulama hatası | Yetkisiz ekleme reddi; key response/log’da yok |
| 2 | İkinci Organization farklı provider | Connection routing tenant-bound; yanlış anahtar/cache | Her Organization kendi model/provider’ını görür | A ve B çağrıları doğru fake provider/credential’a gider |
| 3 | Aynı çalışan iki Organization’da | Run/history/cache scope; permission union riski | Org değişimi ayrı konuşma bağlamı | A run’ı B’ye taşınamaz; yetkiler birleşmez |
| 4 | Yetkili stok sorgusu | Resource/depo izni, output filter; yanlış inventory bağı | Zaman damgalı müsaitlik | İzinli depo sonuçları; diğer depo yok |
| 5 | Maliyet izni yok | Field ve derived-data kontrolü; marjdan sızıntı | Maliyet verilemez; izinli satış bilgisi sunulur | Cost, margin ve gizli maliyet tool payload’da yok |
| 6 | Plakadan teklif | Normalize plaka, vehicle scope, VIN izni; yanlış araç | Çoklu eşleşmede seçim; kaynaklar gösterilir | Başka Org plakası bulunmaz; belirsizlikte otomatik seçim yok |
| 7 | OEM unavailable/ambiguous | Adapter status; fabricated fitment | Eksik/belirsiz veri açıkça belirtilir | Fake timeout/iki aday “confirmed” olmaz |
| 8 | Teklif onayı | Approval digest, identity, workflow; onaysız kayıt | Somut satır/tutar inceleme ve onay | Onaysız persistent quotation sıfır; onayla bir |
| 9 | Fiyat değişti | Version/reprice ve commit kontrolü | Fark gösterilir, yeniden onay | Eski approval yeni tutarla yürütülmez |
| 10 | Prompt ile cross-Org talep | Server context, resource auth; IDOR | Yetkisiz kapsam reddedilir; kayıt varlığı açıklanmaz | Başka Org ID hiçbir tool’dan veri döndürmez |
| 11 | Malicious ürün açıklaması | Data/instruction ayrımı, server tool policy | İçerik iş verisi olarak ele alınır | Injection yeni araç, export veya scope açamaz |
| 12 | Key execution sırasında revoked | Connection version, cancellation, provider hata | Run durur; yönetici bağlantı durumunu görür | Sonraki provider call ve write engellenir |
| 13 | Kullanıcı izin kaybetti | Her adım ve result-release yeniden auth | Çalışma durur; erişim kaybı belirtilir | Sonraki tool yok; eski hassas sonuç yeni erişimde gizli |
| 14 | AI uygulaması kapandı | Entitlement epoch, queue/run kontrolü | AI kapanır; diğer uygulamalar çalışır | AI start/resume reddi; normal inventory API çalışır |
| 15 | Browser’sız scheduled task | Onaylı delegation/principal; eski token riski | Yetkili görev geçmişi veya “yetki yok” durumu | Grant yoksa yürütme yok; dar grant yalnız izinli araç |
| 16 | AI provider unavailable | Timeout, bounded retry, circuit breaker | Yeniden deneme/manual kullanım | Retry limiti; başka provider’a sessiz geçiş yok; core akışları sürer |
| 17 | Çok adımlı işlem yarıda kaldı | Checkpoint, idempotency, stale-data recheck | Tamamlanan/eksik adımlar; kontrollü devam | Resume duplicate quotation yaratmaz; belirsiz write sonucu uzlaştırılır |
| 18 | Yüksek değerli satın alma/finans | Başlangıç tool deny; gelecek yüksek risk workflow’u | Yetkili normal iş akışına yönlendirme | Prompt/onay metni transaction tool açamaz |

12 ve 13’te iptal, dış sağlayıcıya önceden gönderilmiş veriyi geri çekmez. Garanti gelecekteki işlemlerin ve sonuç erişiminin durdurulmasıdır.

## 12. Gelecek geliştirme yol haritası

**RECOMMENDED — Yetkilendirme, araç geliştirmeden önce gelmeli.** Her aşama ayrı onay, küçük uygulama kapsamı ve hedefli test gerektirir.

| Aşama | Kapsam | Çıkış koşulu |
|---|---|---|
| 0 | A1–A6 kararlarını/izin modelini teyit; Organization/Store/identity temeli | Fail-closed policy ve ownership onayı |
| 1 | Küçük provider-neutral/tool/result sözleşmeleri; fake adapter | Şema, capability ve hata contract testleri |
| 2 | Connection-management domain ve privilege ayrımı | İki tenant yönetim izolasyonu |
| 3 | Credential encryption, rotation, revoke, restore davranışı | Secret sızıntısı ve lifecycle testleri |
| 4 | Metadata audit, run scope, budget/cancellation | Provider çağrısından önce güvenlik kontrolü |
| 5 | Tek bir bounded read-only araç | API/workflow/job bypass ve field izin testleri |
| 6 | Tek provider ile açıkça onaylı küçük canlı pilot | Veri koşulları, hata ve maliyet doğrulaması |
| 7 | Proposal + insan onaylı quotation creation | Stale/replay/concurrent approval testleri |
| 8 | Bounded çok adımlı akış, checkpoint/recovery | 18 senaryonun ilgili kapsamı |
| 9 | Gerçek OEM anlaşmasından sonra adapter | Lisans, ambiguity, provenance contract testleri |
| 10 | Scheduled automation ve gerekirse worker | Ayrı principal/delegation ve operasyon onayı |

Vehicle, Inventory, Products ve Quotations uygulama API’leri hazır olmadan örnek tam workflow tamamlanamaz. AI projesi bu domain’lerin yerine geçmemelidir.

## 13. Operasyon ve bakım riskleri

- **Backend kaynak paylaşımı:** AI concurrency, timeout ve response-size sınırları core latency’yi korumalı.
- **Provider drift:** SDK/API/model değişiklikleri küçük contract testleriyle takip edilmeli; model değişimi otomatik ürün davranışı değişimine dönüşmemeli.
- **Revocation cache:** Üyelik/permission cache invalidation ve version stratejisi açıkça test edilmeli.
- **Maliyet tahmini:** Retry ve yarım kalan istek de ücret doğurabilir; kesin maliyet vaadi verilmemeli.
- **Workflow persistence:** Prompt, VIN ve tool output workflow payload/log’larına kontrolsüz yazılmamalı.
- **Recovery:** Timeout sonrası yazmanın gerçekleşip gerçekleşmediği araştırılmadan retry yapılmamalı.
- **Şifreleme key kaybı:** Backup tek başına restore sağlamaz; kontrollü key recovery prosedürü gerekir.
- **Bağımlılık:** Büyük framework ve gateway, yeni upgrade/veri alıcısı yükü getirir.
- **Mevcut config:** JWT/cookie secret için fallback değerleri kaynakta bulunuyor. Üretimde gerçek değerlerin zorunlu olduğunu bu inceleme doğrulamadı; canlı AI pilotu öncesi fail-fast üretim kontrolü gerekir. Environment dosyaları okunmadı. [Config](D:/DogruAdres/packages/api/medusa-config.ts:28)

**Baseline sınıflandırması:** Yerel belgelerde storefront lint/parser konusu upstream known issue, Redis/i18next konuları compatibility adjustment olarak kayıtlı. Bu audit bunları yeniden test etmedi. AI tasarımı gelecekte DoğruAdres customization olacaktır; Mercur permission fallback davranışı sessizce project-owned core patch’e dönüştürülmemelidir.

## 14. Minimum gelecek güvenlik ve fonksiyonel PoC

**RECOMMENDED — Önce gerçek servis/anahtar kullanmadan fake adapter ile:**

- İki Organization; ikisinde de bulunan kullanıcı; farklı field/Store izinleri.
- Fake encrypted credentials ve iki fake provider.
- Tek inventory read tool.
- Synthetic vehicle/OEM resolved–ambiguous–unavailable cevapları.
- Proposal, expiry/digest approval ve tek quotation creation workflow’u.
- Anahtar/üyelik/entitlement iptali ve duplicate delivery.
- Ürün açıklaması/tool output içinde injection fixture’ları.

Başarı koşulları:

1. Tenant dışı veri/credential/history sızıntısı sıfır.
2. Cost izni olmadan maliyet ve türevleri yok.
3. Eksik policy/resolver/delegation erişimi reddediyor.
4. Onaysız persistent quotation yok.
5. Stale approval ve replay duplicate yaratmıyor.
6. OEM belirsizliği doğrulanmış uyumluluk olarak sunulmuyor.
7. Provider failure normal uygulamaları engellemiyor.
8. Audit/log/browser payload’larında secret bulunmuyor.

Gerçek provider pilotu ancak sonraki ayrı onayla, işletme verisi içermeyen küçük içerik ve sınırlı bütçeyle yapılmalı. Bu audit sırasında PoC veya test çalıştırılmadı.

## 15. Ürün sahibi onayına açık kararlar

1. **A başlangıç mimarisi** ve gelecekte worker ayrıştırma kriterleri.
2. Desteklenecek provider/model allowlist’i ve varsa AI SDK bağımlılığı.
3. Connection-manage, AI-use, usage-view ve automation izinleri.
4. VIN, maliyet, kişisel bilgi ve exports için araç/alan politikaları.
5. Conversation/proposal/audit içeriğinin saklama ve erişim süreleri.
6. KEK/secret yönetimi, recovery ve yönetici secret erişimi.
7. Bütçe, eşzamanlılık, retry ve iptal sınırları.
8. Draft quotation içeriği, expiry, fiyat değişiminde yeniden onay politikası.
9. Yüksek risk kapsamı, MFA ve dual approval eşikleri.
10. Browser’sız delegation/service-principal yaklaşımı.
11. Provider veri şartları ve KVKK aktarım değerlendirmesi.
12. OEM lisans şartları, uncertainty gösterimi ve matching politikası.

Bu kararlar öneri düzeyindedir. [AGENTS.md](D:/DogruAdres/AGENTS.md) ve [SECURITY.md](D:/DogruAdres/docs/dogruadres/SECURITY.md), auth/security sınırı ve ilgili mimari değişikliklerin uygulama öncesi dış onayını gerektiriyor.

## 16. Kanıt dizini

### Yerel kaynaklar

| Kaynak | Desteklediği bulgu |
|---|---|
| [AGENTS.md](D:/DogruAdres/AGENTS.md) | Salt extension yaklaşımı, approval gates, kaynak önceliği |
| [Dokümantasyon router](D:/DogruAdres/docs/dogruadres/README.md) | Yetkili proje belgeleri |
| [ARCHITECTURE.md](D:/DogruAdres/docs/dogruadres/ARCHITECTURE.md) | Temiz baseline, domain ownership |
| [SECURITY.md](D:/DogruAdres/docs/dogruadres/SECURITY.md) | Isolation, secret, price/payment ve audit kuralları |
| [PRINCIPLES.md](D:/DogruAdres/docs/dogruadres/PRINCIPLES.md) | Minimum bağımlılık ve resource politikası |
| [MERCUR-INTEGRATION.md](D:/DogruAdres/docs/dogruadres/MERCUR-INTEGRATION.md) | Supported extension ve baseline sınıflandırması |
| [UPGRADE-POLICY.md](D:/DogruAdres/docs/dogruadres/UPGRADE-POLICY.md) | Compatibility yeniden değerlendirme |
| [ADR-0001](D:/DogruAdres/docs/dogruadres/adr/ADR-0001-mercur-as-marketplace-engine.md), [ADR-0002](D:/DogruAdres/docs/dogruadres/adr/ADR-0002-automotive-domain-isolation.md), [ADR-0003](D:/DogruAdres/docs/dogruadres/adr/ADR-0003-mercur-core-modification-policy.md) | Mercur engine, automotive isolation, core modification politikası |
| [Mercur llms.txt](D:/DogruAdres/node_modules/@mercurjs/docs/llms.txt) | Kurulu doküman indeksi |
| [Architecture](D:/DogruAdres/node_modules/@mercurjs/docs/content/learn/architecture.mdx), [API routes](D:/DogruAdres/node_modules/@mercurjs/docs/content/resources/best-practices/api-routes.mdx), [Jobs/subscribers](D:/DogruAdres/node_modules/@mercurjs/docs/content/resources/best-practices/subscribers-and-jobs.mdx) | Katman ve extension yaklaşımı |
| [Seller members](D:/DogruAdres/node_modules/@mercurjs/docs/content/learn/seller-members.mdx), [Seller context types](D:/DogruAdres/packages/api/node_modules/@mercurjs/core/.medusa/server/src/types/seller-context.d.ts) | Çoklu Store üyeliği ve framework context |
| [Mercur package](D:/DogruAdres/packages/api/node_modules/@mercurjs/core/package.json), [Medusa framework package](D:/DogruAdres/packages/api/node_modules/@medusajs/framework/package.json) | Kurulu 2.3.6 / 2.21.2 sürümleri |
| [Proje middleware](D:/DogruAdres/packages/api/src/api/middlewares.ts) | Yerel özel route listesi boş |
| [Mercur MCP belgesi](D:/DogruAdres/node_modules/@mercurjs/docs/content/resources/ai/mcp.mdx) | MCP endpoint’i dokümantasyon aramasıdır; tenant business-data API değildir |

A1–A6 raporlarının tam metni **UNVERIFIED**; incelenen yerel belge/kaynak listesinde bulunamadı.

### Resmi dış kaynaklar

- Framework: [Mercur architecture](https://docs.mercurjs.com/learn/architecture), [Mercur repository](https://github.com/mercurjs/mercur), [Medusa long-running workflows](https://docs.medusajs.com/learn/fundamentals/workflows/long-running-workflow).
- Provider: [OpenAI tools](https://developers.openai.com/api/docs/guides/function-calling), [data controls](https://developers.openai.com/api/docs/guides/your-data), [background](https://developers.openai.com/api/docs/guides/background); [Anthropic tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview), [structured output](https://platform.claude.com/docs/en/build-with-claude/structured-outputs); [Gemini tools](https://ai.google.dev/gemini-api/docs/function-calling), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [terms](https://ai.google.dev/gemini-api/terms).
- Kütüphaneler: [AI SDK tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling), [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts).
- Güvenlik: [MCP security](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices), [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [secrets](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html), [prompt injection](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).

**Kanıt sınırı:** Online belgeler mevcut yayınlarıdır; kurulu Mercur/Medusa davranışında yerel sürüm kanıtına öncelik verildi. Medusa’nın uzun workflow kabiliyeti resmi belgede doğrulandı; projede dayanıklı AI execution veya güvenli approval resume yapılandırıldığı doğrulanmadı.

## 17. Git durumu ve değişiklik yapılmadığı teyidi

Başlangıç ve son Git durumu aynı:

```text
?? .vscode/
?? DESIGN.md
```

`git diff --stat` boş çıktı verdi; tracked dosya farkı görülmedi.

**Hiçbir proje dosyası değiştirilmedi.** Mevcut untracked dosyalar korundu. Paket kurulmadı; build, test, seed veya migration çalıştırılmadı. Veritabanına yazılmadı, gerçek AI/OEM servisine bağlanılmadı, credential alınmadı/test edilmedi, Git durumu değiştirilmedi. `AGENTS.md`, `CODEBASE.md` veya Stitch üzerinde işlem yapılmadı.

**Rapor tamamlandı; uygulamaya geçmeden ürün sahibi incelemesi bekleniyor.**