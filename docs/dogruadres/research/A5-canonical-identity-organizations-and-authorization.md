**A5 sonucu: Mimari uygulanabilir; ancak mevcut Mercur/Medusa kurulumu, DoğruAdres’in tek kişisel kimlik ve çoklu Organizasyon güvenlik modelini hazır olarak sağlamıyor.**

**Tercih edilen kavramsal mimari:** Medusa Auth üzerinden kimlik doğrulama; DoğruAdres’in sahip olduğu kalıcı kişisel kimlik, Organizasyon üyeliği ve merkezi yetki değerlendirmesi; Mercur Customer/Admin/Member aktörlerine kontrollü adaptörler; API, workflow ve arka plan işlerinde aynı güvenlik sözleşmesi.

Bu bir mimari öneridir, kabul edilmiş karar veya uygulama değildir. Çekirdek değişikliği gerektiğine ilişkin kanıt bulunmadı. Tam uygulanabilirlik, özellikle yerleşik API’lerin alternatif erişim yollarının kapatılması konusunda gelecekteki sınırlı PoC ile doğrulanmalıdır.

**1. Yönetici değerlendirmesi ve kanıt sınıfları**

Rapor boyunca:

| Etiket | Anlamı |
|---|---|
| **VERIFIED** | Yerel belge, kurulu kaynak veya belirtilen resmî kaynak ile doğrulandı |
| **INFERRED** | İncelenen uygulamadan çıkarıldı; çalışma zamanı testi yapılmadı |
| **RECOMMENDED** | Ürün sahibinin değerlendirmesine sunulan kavramsal öneri |
| **UNVERIFIED** | Mevcut incelemede doğrulanamadı |

Başlıca sonuçlar:

- **VERIFIED:** Kurulu Mercur `2.3.6`, Medusa `2.21.2`.
- **VERIFIED:** Mercur Member ↔ Seller ilişkisi çoktan çoğa; mağaza seçimi ve mağazaya özgü üyelik kontrolü mevcut.
- **VERIFIED:** Mercur izin çözücü modülü bulunmadığında `grantAll` uygulanıyor ve `permissions_enforced=false` oluyor.
- **VERIFIED:** Medusa’da özel aktörler, e-posta doğrulama ve MFA mekanizmaları mevcut.
- **VERIFIED:** İncelenen proje yapılandırmasında DoğruAdres Organizasyon/IAM uygulaması, Mercur `permissions` modülü veya zorunlu e-posta doğrulama ayarı bulunmadı.
- **INFERRED:** Mevcut kurulum güvenli çoklu Organizasyon modeli için başlangıç altyapısıdır; üretime hazır Organizasyon yetkilendirmesi değildir.
- **RECOMMENDED:** Organizasyon, mağaza, şube ve platform görevleri ayrı kapsamlar olarak değerlendirilmelidir.

Önceki A1–A4 raporları yerel proje belgelerinde bulunamadı. Kullanıcı mesajındaki önceki bulgular başlangıç bağlamı olarak kullanıldı; sürüme bağlı noktalar yeniden incelendi.

**2. Kurulu kimlik ve yetkilendirme modeli**

| Mekanizma | Kurulu davranış | DoğruAdres açısından sınır |
|---|---|---|
| Medusa AuthIdentity | Kimlik doğrulama sağlayıcısı kimliği; aktör bağlantıları `app_metadata` içinde | Tek başına kişisel hesap veya Organizasyon üyeliği değildir |
| Customer aktörü | `/store` müşteri bağlamı; korumalı kaynaklar müşteri kimliğiyle sınırlandırılıyor | Hukuki alıcı Organizasyonunu temsil etmiyor |
| Admin `user` aktörü | `/admin` için bearer, session ve secret API key desteği | Platform görevi ve özel Organizasyon erişimi ayrımı hazır değil |
| Mercur `member` aktörü | Vendor girişinin kişisel satıcı kullanıcısı | Mağazasız kişisel alan, iş ilanları ve Organizasyon üyeliği kapsamı yok |
| SellerMember | `seller_id`, `member_id`, `role_id`, `is_owner` | Organizasyon Ownership değildir |
| Vendor bağlamı | `x-seller-id` veya oturumdaki Seller; üyelik sorgulanıyor | Organizasyon/şube yetkisi ve uygulama hakkı kontrol edilmiyor |
| Mercur izin sistemi | `view/edit/manage`; `IPermissionResolver` uzantısı | Approve/export/private-file gibi ayrıntıları tek başına ifade etmiyor |
| Medusa RBAC | Feature flag ve policy mekanizmaları; rol kimlikleri token metadata’sından okunabiliyor | Güncel üyelik ve tenant kapsamını otomatik sağlamıyor |
| Publishable API key | Store API ve sales-channel bağlamı | Kullanıcı veya Organizasyon yetkisi değildir |
| Secret API key | Admin yüzeyinde özel doğrulama | Organizasyonla sınırlı connector yetkisi değildir |

**Oturum ve token:** `authenticate` oturum bağlamını veya JWT’yi doğruluyor. İncelenen middleware, her istekte kişisel hesabın ve tüm üyeliklerin güncel durumunu yeniden sorgulamıyor. JWT içindeki aktör/rol verilerinin geçerli olması, üyeliğin hâlâ geçerli olduğu anlamına gelmez.

**Mağaza seçimi:** Header seçimi oturumdaki Seller değerinden öncelikli. `POST /vendor/sellers/select` üyeliği doğruluyor; yalnızca kimlik doğrulanmış session varsa oturuma Seller yazıyor. Bearer istemcisi sonraki isteklerde Seller bağlamını ayrıca taşımalıdır.

**Önemli belge–kaynak farkları:**

- `learn/seller-members.mdx` e-posta benzersizliğini mağaza içinde anlatıyor; `Member` modelinde silinmemiş üyeler arasında **global unique email** indeksi var.
- Belgelerde Seller kayıt/davet kabulü “public” olarak geçiyor; kaynakta bunlar sellerless fakat `allowUnregistered:true` ile **kimlik doğrulaması isteyen** yollar.
- Belgeler “en az bir admin” kuralını anlatıyor; incelenen kaldırma/rol değiştirme adımları `is_owner` üyelerini doğrudan koruyor. Bunlar Organizasyonun “en az bir aktif korunan Owner” invariantıyla aynı değildir.
- Ürün belgesi herhangi bir Seller’ın değişiklik önerebildiğini söylüyor; `ensureSellerOwnsProduct` yardımcı fonksiyonu atanmış veya oluşturmuş Seller kapsamı kullanıyor. Değişiklik yolu bazında sözleşme doğrulanmadan genel izin varsayılmamalıdır.

Medusa’nın AuthIdentity ile uygulama aktörünü ayırması ve özel aktör desteği resmî belgede de açıklanıyor. [Auth Identity and Actor Types](https://docs.medusajs.com/resources/commerce-modules/auth/auth-identity-and-actor-types).

**3. Domain sahipliği ve entegrasyon sınırları**

Aşağıdaki matris nihai modül veya tablo tasarımı değildir.

| Kavram | Önerilen yetkili sahip | Entegrasyon sınırı |
|---|---|---|
| Kişi ve kalıcı platform kimliği | DoğruAdres | Medusa AuthIdentity bağlantısı |
| Parola, sağlayıcı doğrulaması, doğrulama/MFA altyapısı | Medusa Auth | DoğruAdres politika ve hesap yaşam döngüsü |
| Organizasyon, üyelik, şube, korunan Owner | DoğruAdres | Seller’dan bağımsız |
| Organizasyon daveti | DoğruAdres | Email/SMS/WhatsApp teslimat adaptörleri |
| Marketplace mağazası | Mercur Seller | DoğruAdres Organization–Store eşlemesi |
| SellerMember | Mercur | DoğruAdres izinlerinin kontrollü yansıması |
| Customer ve Admin aktörleri | Medusa | Kişi/işlem bağlamına bağlı adaptörler |
| Uygulama etkinliği ve launcher tercihleri | DoğruAdres | Yetki motoru ile ayrı sözleşmeler |
| Product, Offer, marketplace Order | Mercur/Medusa | Organizasyon işlem bağlamı ve mağaza kapsamı |
| Marketplace commission/payout | Mercur | Mağaza kapsamlı yetki; ödeme davranışı değişmez |
| Basic Accounting ve temsilci hakedişleri | DoğruAdres | Marketplace ödeme kayıtlarına kontrollü referans |
| Integration bağlantıları ve servis kimlikleri | DoğruAdres | Dar kapsamlı domain API/workflow |
| AI bağlantısı ve delegasyon | DoğruAdres | Aynı yetki motoru ve onay kapıları |
| Vehicle/VIN/OEM/fitment | DoğruAdres | Sağlayıcıdan bağımsız adapter |
| Güvenlik denetim izi | DoğruAdres | Framework olaylarıyla korelasyon |

Modül izolasyonu, kaynak ve bağımlılık sınırıdır. **Organizasyon güvenlik sınırı değildir.** Module Links ilişki kurar; erişim izni vermez. [Module Isolation](https://docs.medusajs.com/learn/fundamentals/modules/isolation), [Module Links](https://docs.medusajs.com/learn/fundamentals/module-links).

**4. Kanonik kişi ve çoklu Organizasyon stratejisi**

**RECOMMENDED:** DoğruAdres’in sahibi olduğu, e-posta değişse de değişmeyen tek bir kişi kimliği kullanılmalı. `AuthIdentity`, Customer, Member ve Admin kayıtları bu kişinin teknik projeksiyonları olabilir.

“Tek platform kimliği” mutlaka “tek teknik aktör kaydı” demek değildir. Aynı kişi:

- kişisel alanda,
- A Organizasyonunda stok personeli,
- B Organizasyonunda Owner,
- platform çalışma alanında müşteri temsilcisi

olabilir. Bu yetkiler farklı çalışma alanları arasında birleşmemelidir.

Önerilen işleyiş:

1. Kimlik doğrulama ve gerekli doğrulamalar tamamlanır.
2. Kullanıcı kişisel alana gelir.
3. Yalnızca üyelikler, davetler, kişisel iş ilanı erişimi ve hesap işlemleri görünür.
4. Organizasyon seçildiğinde sunucu üyeliği ve durumları doğrular.
5. Organizasyon uygulamaları bu doğrulanmış bağlama göre açılır.
6. Mağaza işlemi varsa seçilen Store’un aynı Organizasyona ait olduğu ayrıca doğrulanır.

Özel Medusa aktörü bu amaç için desteklenen bir seçenek. Ancak aktör adı, hesap bağlama/ayırma ve mevcut dashboard oturumlarıyla entegrasyon **onay bekleyen mimari ayrıntılardır**.

Aynı e-posta adresini görerek hesapları otomatik birleştirmek önerilmez. Kimlik bağlama, mevcut hesabın doğrulanmış kontrolünü gerektirmelidir.

**5. Organizasyon, Store ve Platform yetkilendirmesi**

Her işlem için sunucunun değerlendirdiği kavramsal bağlam:

`özne + çalışma alanı + Organizasyon + Store/şube + eylem + kaynak + güncel durum + delegasyon/onay`

**Organizasyon kapsamı**

- Aktif üyelik gerekir.
- Rol yalnızca ilgili Organizasyon içinde geçerlidir.
- Şube ayrı hukuki Organizasyon değildir; kaynak erişimini daraltan alt kapsamdır.
- Organizasyon çapında izin, başka Organizasyona taşınamaz.

**Store kapsamı**

- Bir Organizasyon birden fazla Store/Seller ile eşleşebilir.
- Her Store bağımsız platform onayı alır.
- Store personeli olmak Organizasyon muhasebesini açmaz.
- Payout ve statement okumaları Store kapsamıyla değerlendirilir.
- Seller `is_owner`, Organizasyon Owner statüsünü oluşturmaz.
- Organizasyon Owner’ının mağaza operasyonlarına otomatik erişip erişmeyeceği ayrıca kararlaştırılmalıdır.

**Platform kapsamı**

- Platform çalışma alanı aynı kişinin ayrı görev bağlamıdır.
- Platform üyeliği özel Organizasyon verilerine genel erişim sağlamaz.
- Temsilci erişimi atanmış müşteri/dosya, amaç ve süreyle sınırlandırılmalıdır.
- Tam marketplace operator yetkisi gereken kişiler ayrı, açık ayrıcalık almalıdır.
- İşten ayrılma platform yetkilerini kaldırır; bağımsız Organizasyon üyeliklerini silmez.
- Eski temsilci hakedişleri, canlı müşteri verilerine erişim vermeyen süreli bir okuma hakkı olmalıdır.

**Doğrudan API riski:** Yeni DoğruAdres arayüzündeki sınırlamalar, eski `/admin`, `/vendor` veya `/store` yollarından aşılabiliyorsa mimari güvenli değildir. Yerleşik endpointler aynı kurallara bağlanmalı veya ilgili aktörün erişemeyeceği şekilde sınırlandırılmalıdır. Bunun kapsamlı endpoint doğrulaması henüz yapılmadı.

**6. Davet ve e-posta doğrulama modeli**

**VERIFIED:** Medusa 2.21.2’de `/auth/verification/request`, `/auth/verification/confirm`, `validateVerification` ve `authVerificationsPerActor` desteği var. Doğrulama gerektiğinde giriş akışı aktörsüz token üretebiliyor. MFA da mevcut. [Auth Module](https://docs.medusajs.com/resources/commerce-modules/auth).

**RECOMMENDED:** Bu mekanizmalar üzerinde DoğruAdres’in zorunlu doğrulama politikası uygulanmalı. Aktörsüz token yalnızca hesap kurulum/doğrulama işlemlerine erişmeli; workspace veya iş kayıtlarına erişmemeli.

**Organizasyon daveti sözleşmesi:**

- Hedef Organizasyon, amaçlanan alıcı, rol/kapsam, davet eden, süre ve durum sunucu tarafından tutulur.
- Teslimat kanalı davetin kendisinden ayrıdır.
- Email ile başlamak ileride SMS/WhatsApp eklemeyi değiştirmemelidir.
- Telefon kanalından alınan davet, zorunlu platform e-posta doğrulamasını kaldırmaz.
- Bekleyen kart erişim hakkı değildir.
- Kabul, doğrulanmış kişinin amaçlanan alıcı olduğunu kanıtlamalıdır.
- Kabul sırasında üyelik, rolün güncel geçerliliği ve devredilebilir izinler yeniden değerlendirilmelidir.
- Kabul tek kullanımlı ve eşzamanlı tekrar kabulüne dayanıklı olmalıdır.
- Reject/expire/revoke durumları üyelik oluşturmamalıdır.
- Token log, referrer, analytics veya audit içine yazılmamalıdır.

**Mercur davet sınırı:** İncelenen kabul workflow’u davet e-postasına göre Member upsert ediyor; yeni aktör durumunda çağıran AuthIdentity’ye `member_id` bağlıyor. İncelenen çağrı zincirinde çağıranın doğrulanmış e-postasıyla davet e-postasını eşleştiren zorunlu kontrol bulunmadı. `validate` hook’u mevcut.

Bu, DoğruAdres için kapatılması gereken bir **kimlik bağlama boşluğudur**. Çalıştırılmış bir exploit veya upstream tarafından kabul edilmiş güvenlik açığı olarak sınıflandırılmadı.

Davet token doğrulaması imza, kayıt, kabul durumu ve süreyi kontrol ediyor. İncelenen metotta gelen tokenın kayıttaki mevcut tokenla eşitliği açıkça denetlenmiyor. Yeniden gönderimin önceki tokenı iptal ettiği varsayılmamalıdır.

**7. Roller, izin değerlendirmesi ve uygulama hakları**

**RECOMMENDED:** Kapsamlı RBAC ile kaynak/durum koşullarını birleştiren merkezi değerlendirme kullanılmalı.

Kavramsal erişim kuralı:

`izin = geçerli özne ∩ doğru kapsam ∩ güncel üyelik/rol ∩ uygulama hakkı ∩ kaynak politikası ∩ gerekli onay`

Özel roller:

- Organizasyonun kullanabileceği izin kataloğundan oluşturulur.
- Kullanıcı kendi etkin izinlerini veya kapsamını aşan hak veremez.
- İzin sahibi olmak, o izni devredebilmekle aynı değildir.
- Korunan Owner ve platform ayrıcalıkları normal rol düzenleme yoluyla üretilemez.
- Rol değişikliği mevcut oturumlara da uygulanmalıdır.

Mercur `view/edit/manage` haritası, aynı motorun marketplace yüzeyine uyumluluk çıktısı olabilir. Ayrıntılı DoğruAdres yetkileri bu üç seviyeye indirgenerek kaybedilmemelidir.

| İşlem | Ayrı güvenlik kontrolü |
|---|---|
| Uygulamayı keşfetmek | Organizasyon politikası ve katalog görünürlüğü |
| Ekranı açmak | Workspace, uygulama erişimi ve ekran yetkisi |
| Kayıt okumak | Kaynak sahipliği, kapsam ve alan izinleri |
| Oluşturmak/değiştirmek | Yazma yetkisi, kaynak kapsamı, iş invariantları |
| Hassas eylemi onaylamak | Ayrı approve yetkisi, gerekirse ikinci kişi/MFA |
| Export | Ayrı export yetkisi, alan/kayıt sınırı |
| Özel dosya | Dosya–kaynak ilişkisi ve indirme yetkisi |
| Background job | Servis öznesi, amaç, güncel yetki |
| Dış sistem | Bağlantı kapsamı ve credential yetkisi |

**Uygulama etkinliği:**

- Mandatory uygulama normal isteğe bağlı kapatma yoluyla kapatılamaz.
- Default politikaları başlangıç etkinleştirme kararını besler.
- Faaliyet değişikliği mevcut etkin uygulamaları otomatik kapatmamalıdır.
- Yeni uygun uygulamalar önerilebilir.
- Optional kapatma ayrı yetki ister.
- Launcher tercihleri yalnızca sunumu değiştirir.

**Tarihsel erişim:** Uygulama kapatma, veri silme anlamına gelmemeli. `aktif kullanım` ile `onaylanmış tarihsel okuma/export` ayrı haklar olmalıdır. Tarihsel erişimin hangi kayıt ve kullanıcılara açık olacağı ürün kararıdır.

**8. API/workflow ve veri izolasyonu riskleri**

| Risk | Bulgular ve önerilen sınır |
|---|---|
| İstemciden gelen Organization ID | Seçim talebidir; yetki kanıtı değildir. Kaynağın gerçek Organizasyonu sunucuda çözülür |
| Organization–Seller uyumsuzluğu | İki kapsam birlikte doğrulanır; farklı Organizasyona ait Seller reddedilir |
| İzin çözücü yokken geniş erişim | Mercur fallback doğrulandı. DoğruAdres üretim sözleşmesi fail-closed olmalı |
| Eksik rollerle helper kullanımı | Medusa `hasPermission`, rol listesi boşken `true` dönebiliyor; bağımsız güvenlik kapısı olarak körlemesine kullanılmamalı |
| JWT’de eski roller | Güncel üyelik/izin değerlendirmesi gerekir |
| Üyelik cache’i | Mercur Seller sorguları cache kullanıyor. Revocation gecikmesi/invalidation çalışma zamanında doğrulanmadı |
| Askıdaki mağaza/üye | İncelenen `ensureSellerMiddleware` aktiflik/durum kontrol etmiyor; durum politikası ayrıca gerekir |
| Workflow’u doğrudan çağırmak | HTTP middleware’ini atlar; workflow girişinde güvenilir özne ve yetki gerekir |
| Liste/detail farkı | Her ikisi de sınırlandırılmalı; yalnızca liste filtrelemek yeterli değil |
| Linked veriler | Query/module link tenant güvenliği sağlamaz; çapraz ilişki ve nested fields kontrolü gerekir |
| Search/export | Filtre, count/facet, çıktı dosyası ve indirme aynı kapsamı korumalı |
| Özel dosyalar | Vendor upload kaynağında `access:"public"` var; özel mali/araç belgeleri bu yola gönderilmemeli |
| Background işler | Browser session’a bağlı olmamalı; açık servis öznesi ve sabit Organizasyon kapsamı taşımalı |
| Çok sekmeli kullanım | Global session seçimi yanlış Organizasyonda işlem riskini artırır; istek bağlamı açık ve doğrulanmış olmalı |

**RECOMMENDED:** API middleware’i kimliği ve bağlamı çözer; workflow girişindeki yetki adımı aynı merkezi değerlendiriciyi kullanır. HTTP nesnesi taşımak yerine dar, sunucu tarafından oluşturulmuş execution context kullanılmalıdır.

Yetki değişikliği devam eden işlemi sihirli biçimde geri alamaz. Hassas yazılarda commit/geri döndürülemez etki öncesi tekrar kontrol; kuyrukta bekleyen işlerde çalıştırma anında kontrol gerekir. İşlem tamamlandıktan sonraki iptal/kompanzasyon politikası ayrıca belirlenmelidir.

Audit kaydı en az özne, çalışma alanı, Organizasyon/Store/şube, işlem, kaynak, izin kararı, policy sürümü, correlation ID ve sonucu içermelidir. Hassas değişikliklerde onay ve uygun değişiklik özeti eklenmeli; sırlar ve gereksiz kişisel veri kaydedilmemelidir.

**9. Dış sistem yetkilendirme gereksinimleri**

**RECOMMENDED:**

- Bağlantı Organizasyonun varlığıdır; kuran çalışan ayrıldığında kendiliğinden kişisel varlığa dönüşmez.
- Bağlantı sahibi Organizasyon, yöneten kişiler ve çalıştıran servis öznesi ayrıdır.
- Her connection için dar yetki, veri türü, Store/şube kapsamı ve işlem amacı tanımlanır.
- İnteraktif kullanıcı olmadan işler servis kimliğiyle çalışır.
- Servis kimliği kişisel Owner veya platform admin rolünü miras almaz.
- Credential oluşturma, kapsam genişletme, rotation ve revoke ayrı yetkilerdir.
- Inbound DoğruAdres credential’ı ile dış sisteme ait outbound credential ayrıdır.
- Outbound credential şifreli saklanır; plaintext okuma genel bağlantı görüntüleme izninden türemez.
- Credential iptalinde kuyruktaki ve tekrar deneyen işler de durdurulmalıdır.
- Webhook kimliği payload’daki Organization ID’den değil doğrulanmış connection’dan çözülmelidir.
- Her dış işlem service principal + connection + Organizasyon + job/run olarak izlenmelidir.
- Retry/idempotency yetki kontrolünü atlamamalıdır.

Mevcut Medusa API key yaşam döngüsü yararlı bir altyapı referansıdır. Ancak incelenen key modeli Organizasyon ve ayrıntılı eylem kapsamı taşımıyor. **Secret admin key, Organizasyon connector credential’ı olarak kullanılmamalıdır.**

Accounting connector arızası veya deaktivasyonu marketplace order/payout workflow’larını durdurmamalıdır.

**10. Gelecekte AI delegasyonu ve BYOK**

**RECOMMENDED:** AI, yetki veren aktör değildir; yetkili özne adına sınırlı araç çağrısı öneren bileşendir.

Kullanıcı başlatmalı eylem için:

`AI yetkisi ⊆ kullanıcının güncel yetkisi ∩ delegasyon ∩ etkin uygulamalar ∩ kaynak kapsamı`

Gerekli güvenlik sözleşmeleri:

- Provider connection ve BYOK credential Organizasyona ait olur.
- Credential şifreli tutulur; model, prompt, frontend ve audit plaintext anahtarı görmez.
- Connection aktifliği her çağrıda değerlendirilir.
- Delegasyon kısa süreli, iptal edilebilir; audience, Organizasyon, araç, eylem ve gerekiyorsa kaynakla sınırlandırılır.
- Organization ID araç girdisinden yetki kapsamı olarak alınmaz.
- Araçlar merkezi yetki motorunu ve domain workflow’larını kullanır.
- Modele SQL, sınırsız repository erişimi veya admin token verilmez.
- İş kaydı değişikliği somut öneri üzerinden açık insan onayı ister.
- Onay; tam işlem, parametreler, kaynak sürümü, onaylayan ve süreyle bağlanır.
- Onaydan sonra değişen teklif veya kayıt yeniden onay gerektirir.
- Finansal/yüksek etkili işlem için daha güçlü kontrol gerekir; çift onay ve MFA eşiği ürün kararıdır.
- “Quote proposal üretmek” ile kalıcı teklif kaydı oluşturmak/göndermek ayrılır.

**Scheduled agent:** Aktif browser kullanıcısını taklit etmez. Açıkça yetkilendirilmiş servis öznesi ve görev delegasyonu kullanır. Görevi kuran kişinin yetkisi kalıcı geniş erişime dönüştürülmez. İş kaydı değişiklikleri için gerekli onay scheduled kullanımda da korunur.

**Prompt injection:** OEM sonucu, dosya, ürün açıklaması ve mesajlar güvenilmeyen veri kabul edilir. Bunlar araç listesini, Organizasyon kapsamını veya onayları değiştiremez. Çıkış hedefleri, araç parametreleri, işlem bütçeleri ve veri miktarı sunucuda sınırlandırılır. Dar araçlar ve insan onayı yaklaşımı OWASP’ın excessive agency önerileriyle uyumludur. [OWASP Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/).

Audit, önerilen ve çalıştırılan çağrıları ayrı göstermeli; reddedilen çağrılar, delegasyon, insan onayı ve sonuç izlenebilmelidir.

**Gizlilik:** BYOK, veri aktarımına hukuki izin sağlamaz. Sağlayıcı bölgesi, alt işleyenler, saklama/eğitim kullanımı ve yurtdışı aktarım mekanizması aktivasyon öncesi değerlendirilmelidir. KVKK’nın uygun güvence çerçevesi bu değerlendirmede dikkate alınmalıdır. [KVKK yurtdışına aktarım](https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim).

**11. Gelecekte VIN/OEM sınırları**

**RECOMMENDED:** Vehicle Management ve sağlayıcı lookup ayrı yetkilerdir.

- Araç kaydının Organizasyonu ve gerektiğinde şubesi sunucuda belirlenir.
- Plaka/VIN ve müşteri bağlantısı kontrollü alanlardır; araç listesini görmek tüm ayrıntıları veya export hakkını vermez.
- Lookup için araç erişimi + provider lookup izni + aktif connection + sözleşmesel hak gerekir.
- Provider adapter yalnızca izinli lookup ve izinli sonuç işleme yeteneklerini sunar.
- Kullanım, cache, export, AI’ye aktarım ve retention hakları sağlayıcı/sözleşme bazında uygulanır.
- Sonuçlarda provider, lookup zamanı, kaynak/sürüm, sorgu referansı ve varsa sağlayıcının verdiği confidence korunur.
- Sağlayıcı confidence vermiyorsa üretilmiş puan sağlayıcı güveni gibi sunulmaz.
- OEM referansı otomatik Product kimliği birleştirme nedeni değildir.
- Ürün eşlemesi candidate/reference ilişkisi olarak ele alınır.
- Belirsiz uyumlulukta insan doğrulaması gerekir.
- AI araçları aynı vehicle ve lookup yetkilerini kullanır.
- Kalıcı quote oluşturma ayrıca yetki ve insan onayı ister.

**VERIFIED:** partslink24 koşulları veri doğruluğu sınırlamaları ve kullanım hakları içeriyor; incelenen koşullar materyalin başka ortamlarda çoğaltılması/saklanması/dağıtılması için genel serbestlik sağlamıyor. **UNVERIFIED:** DoğruAdres’e uygun LexCom API erişimi, yeniden kullanım ve AI işleme hakları. [partslink24 koşulları](https://legal.lexcom.de/legaldocs/partslink24-tos/-/9/en/partslink24-tos.html).

**Sağlayıcı olmadan** Vehicle Management, Product, Inventory ve Quotations çalışmalıdır. Lookup bağlantısı opsiyonel zenginleştirmedir.

**12. On altı pratik senaryo**

Aşağıdaki izin adları kavramsal örneklerdir; mevcut API sözleşmesi değildir.

| # | Kimlik ve kapsam | İzin ve enforcement | Audit, mevcut destek/eksik, güvenlik testi |
|---|---|---|---|
| **1. Kayıt ve doğrulama** | AuthIdentity → kanonik kişi; Organizasyon yok | Doğrulama/setup erişimi; auth akışı ve kişisel alan kapısı | Kayıt/doğrulama olayları. **Kısmi:** Medusa mekanizması var, zorunlu proje politikası eksik. **Test:** doğrulanmamış token workspace açamaz; kod tekrar kullanılamaz |
| **2. Organizasyon kurup onay sonrası Owner olmak** | Doğrulanmış kişi; başvuru Organizasyonu | Başvuru oluşturma; platform onayı; onay workflow’unda ilk korunan Owner | Başvuran, onaylayan ve statü değişikliği. **Eksik:** Organizasyon akışı; Seller approval eşdeğer değil. **Test:** istemci `approved/owner` alanıyla ayrıcalık üretemez |
| **3. İkinci Organizasyon daveti** | Aynı kişi; ikinci Organizasyon | Davet edenin devretme hakkı; kabulde kimlik, rol ve kapsam kontrolü | Davet/kabul/üyelik izi. **Kısmi:** Seller daveti var, Organization daveti yok. **Test:** birinci Organizasyon izinleri ikinciye taşınamaz |
| **4. Davet reject/expire** | Amaçlanan alıcı; henüz üyelik yok | Reject kendi davetine; expire sunucu zamanı ile | Durum değişikliği, üyelik oluşmaması. **Kısmi:** Seller expiry var; kişisel davet kartı/reject eksik. **Test:** eski token kabul edilemez |
| **5. Aktif oturumda Organizasyon değiştirme** | Aynı kişi; seçilen aktif üyelik | Workspace seçimi ve her istekte kapsam kontrolü | Switch ve başarısız erişimler. **Kısmi:** Seller switch var. **Test:** iki sekmede eski request yeni Organizasyonda çalışmaz |
| **6. İkinci Store** | Organizasyon üyesi; aynı Organizasyona bağlı yeni Seller | Store başvurusu ve bağımsız platform onayı | Mapping, başvuru, onay. **Kısmi:** Seller pending approval var. **Test:** ilk Store onayı ikincisini otomatik açmaz |
| **7. Store’un alıcı Organizasyonu engellemesi** | Yetkili Store personeli; engellenen buyer Organization | Block yönetimi; satın alma kararında ve checkout workflow’unda kontrol | Engelleyen, neden, hedef, sonuç. **Eksik:** Buyer Organization/block modeli. **Test:** farklı çalışan/customer aktörüyle block aşılamaz |
| **8. Stok görüp maliyet görememe** | Personel; izinli Organizasyon/Store/şube | Inventory read; cost/accounting alanları ve export ayrı | Hassas erişim/denial. **Kısmi:** marketplace inventory izin noktaları var. **Test:** nested fields, search, export ve dosya yoluyla maliyet sızmaz |
| **9. Temsilci ve bağımsız Organizasyon çalışanı** | Tek kişi; iki ayrı workspace | Platform görev kapsamı veya bağımsız üyelik; birleşim yok | Aktif bağlam ve erişim amacı. **Eksik:** birleşik workspace modeli. **Test:** platform rolü bağımsız Organizasyona taşınmaz |
| **10. Eski temsilcinin ödeme geçmişi** | Aynı kişi; kendisine ait süreli hakediş kapsamı | Yalnızca sınırlı history read; operasyon yetkisi yok | Ayrılış, kalan hakkın süresi, erişimler. **Eksik. Test:** canlı müşteri/order verisi açılamaz; süre dolunca erişim kesilir |
| **11. Accounting connector** | Connection servis öznesi; tek Organizasyon ve izinli alt kapsam | Record read/export; connector API ve job workflow kontrolü | Connection, principal, job, kayıt kapsamı. **Eksik. Test:** admin endpoint, başka Organizasyon ve iptal sonrası retry reddedilir |
| **12. AI araç bilgisi ve quote önerisi** | Çağıran kişi + dar delegasyon; aynı Organizasyon | Vehicle read; gerekirse OEM lookup; quote proposal. Kalıcı yazma ayrı onaylı | Öneri/tool/approval/execution izi. **Eksik. Test:** prompt injection yetkiyi büyütemez; proposal onaysız kayda dönüşmez |
| **13. Organization ID spoofing** | Doğrulanmış saldırganın gerçek kişi kimliği | Membership + kaynak sahipliği; middleware, query ve workflow | Güvenli denial kaydı. **Kısmi:** Seller üyelik/param kontrolü var. **Test:** header/body/path/filter/batch/nested ID değişimleri |
| **14. Son korunan Owner’ı kaldırma** | Mevcut Owner; aynı Organizasyon | Korunan sahiplik ve en az bir aktif Owner invariantı; atomik domain işlem | Girişim ve red; recovery ayrı. **Kısmi:** Seller Owner koruması var. **Test:** iki eşzamanlı kaldırma/deaktivasyon ve rol düşürme |
| **15. Askı/revoke sonrası açık istek** | Kimlik doğrulanmış ama artık yetkisiz özne | Request başlangıcı; hassas commit/iş çalıştırma öncesi güncel kontrol | Revocation zamanı ve işlem kararı. **Eksik:** DoğruAdres revocation sözleşmesi. **Test:** eski JWT, cache, kuyruk ve devam eden yazma |
| **16. Optional app kapanırken geçmiş kayıtlar** | İlgili kişi/servis; Organizasyon | Deactivate yetkisi; yeni kullanım kapalı; tanımlı historical read ayrı | Kapatma ve kalan erişimler. **Eksik. Test:** kayıtlar silinmez; eski ekran/job/AI yeni işlem yapamaz; yalnızca onaylı geçmiş erişim sürer |

**Senaryo 7’de açık karar:** Engellemenin yalnızca yeni satın almayı mı, iletişimi mi, teklifleri mi veya katalog görünürlüğünü mü kapsadığı belirlenmeli. Kamuya açık katalogda Organizasyon block’unu tam gizlilik garantisi olarak sunmak doğru olmaz.

**13. Tercih edilen mimari ve alternatifler**

| Yaklaşım | Değerlendirme |
|---|---|
| **DoğruAdres kanonik kişi + Medusa Auth + merkezi kapsamlı yetki + Mercur adaptörleri** | **Tercih edilen:** mağazasız kişisel yaşamı, çoklu Organizasyonu, platform görevini ve gelecekte servis/agent öznelerini aynı sözleşmede karşılar |
| Mercur Member’ı kanonik kişi yapmak | Daha az başlangıç entegrasyonu; kişi yaşam döngüsünü Seller domain’ine bağlar. Mağazasız hesap ve platform/customer birleşimi ayrıca çözülür |
| Medusa Customer’ı kanonik kişi yapmak | Buyer başlangıcı kolay; çalışan, Owner, temsilci ve servis hesaplarını müşteri domain’ine bağlar |
| Haricî IdP + DoğruAdres yetki motoru | İleride SSO/kurumsal federasyon için viable; bugün zorunlu değil. Yeni bağımlılık/hizmet ve operasyon kararı gerekir |
| Tek geniş Admin hesabı/rolü ile her workspace | Organizasyon izolasyonu ve en az yetki gereksinimlerini karşılamaz |

Tercihin gerekçesi, **kimlik doğrulama altyapısını yeniden yazmadan domain üyeliklerini framework aktörlerinden ayırmasıdır**.

Mercur’ün yayımlanmış `IPermissionResolver` sözleşmesi marketplace izinleri için somut uzantı noktasıdır. Özel route, modül, workflow ve mevcut hook’lar ek güvenlik kurallarını taşıyabilir. Her workflow’da gerekli hook’un bulunduğu varsayılmamalı; olmayan yerde proje workflow’u desteklenen akışı kontrollü biçimde orkestre etmelidir.

**14. Eksik uygulamalar ve upgrade riskleri**

Eksik DoğruAdres işlevleri:

- Kanonik kişi ve güvenli aktör bağlantıları.
- Kişisel landing/workspace seçimi.
- Organization/Membership/Branch/Owner lifecycle.
- Organizasyon daveti ve alıcı kimlik eşleştirmesi.
- Etkinleştirilmiş fail-closed izin değerlendirmesi.
- Özel roller ve izin devretme sınırları.
- Organizasyon–Store mapping ve tüm Store başvurularının kontrolü.
- Buyer Organization işlem kapsamı ve Store block.
- Güncel revocation ve suspension kontrolü.
- Platform görevleri ve eski temsilci hakediş erişimi.
- App entitlement/historical erişim.
- Özel dosya, export/search/job izolasyonu.
- Integration service principal ve credential kapsamları.
- Güvenlik audit’i.
- Gelecekte AI/OEM güvenlik sözleşmeleri.

Upgrade’de yeniden doğrulanması gerekenler:

- Mercur izin resolver sözleşmesi ve fallback davranışı.
- Medusa RBAC flag’leri, JWT rol üretimi ve helper davranışları.
- Auth verification, refresh/session ve MFA yolları.
- Vendor middleware istisnaları ve sırası.
- Seller/cache invalidation ve askı davranışı.
- Order/payment/payout ilişkileri ve detail ownership.
- Fields/nested relations kısıtları.
- Workflow hook’ları ve aktör projeksiyonu.
- Mercur’ün Medusa middleware’lerini değiştiren paket içi uyumluluk davranışı.

**Sınıflandırma:** Bunlar DoğruAdres için eksik ürün/güvenlik işlevleri veya kurulu upstream davranışlardır. İnceleme bunları upstream tarafından tanınmış bug olarak doğrulamadı. Proje-owned geliştirme, geçici compatibility patch ve upstream issue aynı başlık altında eritilmemelidir.

**15. Ürün sahibi onayı gereken kararlar**

Mevcut gereksinimler yeniden açılmadan şu açık kararlar çözülmelidir:

1. Kanonik kişi modeli ve teknik aktör bağlama stratejisi.
2. Organizasyon onayı öncesi başvuru sahibinin erişimi.
3. Owner’ın Store operasyonlarına otomatik erişim kapsamı.
4. Korunan Ownership correction/recovery süreci ve bağımsız onaylayanlar.
5. Owner ayrılışı, hesap askısı/ölümü ve “aktif Owner kalması” çatışması.
6. Özel rol kataloğu ve hangi izinlerin devredilebileceği.
7. Platform temsilcisi erişim amacı, kapsamı ve ayrıcalık yükseltme süreci.
8. Eski temsilci history erişiminin süresi ve gösterilecek alanlar.
9. Store block’un kapsamı ve mevcut işlemlere etkisi.
10. Uygulama kapatma sonrası tarihsel okuma/export ve job politikası.
11. Revocation gecikmesi hedefi ve devam eden işlemlerin davranışı.
12. MFA/ikinci onay gerektiren finansal ve yüksek etkili işlemler.
13. Credential yönetimi, connection devri ve scheduled yetki sınırları.
14. Audit/kişisel veri saklama ve yurtdışı aktarım politikası.
15. OEM sözleşmesel kullanım/retention ve belirsiz fitment doğrulama ölçütleri.

Root yönetimin uygulama kapısını belirleyen hükmü:

> “authentication/authorization architecture” ve “security-boundary change” için external approval gerekir.

Bu rapor onaya sunulan incelemedir; bu kararları uygulamadı.

**16. Gelecekte minimal PoC ve güvenlik test planı**

**Yalnızca onay sonrası; bu denetimde çalıştırılmadı.**

Minimal PoC:

- İki kişi, iki Organizasyon, bir Organizasyonda iki Store ve iki şube.
- Aynı kişinin Organizasyonlarda farklı rolleri ve ayrı platform görevi.
- Medusa doğrulama akışı ve kişisel workspace.
- Merkezi yetki motoruna bağlı Mercur `IPermissionResolver`.
- Bir kayıt okuma, bir alan korumalı liste, bir yazma workflow’u.
- Bir özel dosya ve bir export.
- Bir revoke edilebilir sahte connector işi.
- Sağlayıcı çağırmayan sahte AI delegasyonu/onay akışı.
- Ağ çağrısı yapmayan sahte OEM adapter.

Öncelikli testler:

- Doğrulanmamış/aktörsüz tokenla erişim.
- Yanlış davet alıcısı, expiry, replay ve eşzamanlı kabul.
- Organization/Store/branch ID değiştirme.
- Role escalation ve sahip olunmayan izin devri.
- Son Owner yarış koşulları.
- Eski JWT/cache/job üzerinden revocation.
- Doğrudan yerleşik API ve workflow bypass.
- Nested fields, maliyet, count/facet ve export sızıntısı.
- Özel dosya URL’siyle yetkisiz indirme.
- Connector revoke ve scope genişletme.
- AI prompt injection, çapraz Organizasyon tool çağrısı ve onay replay.
- App kapatma sonrası yeni işlem ile tarihsel okuma ayrımı.
- OEM erişim hakkı/retention ve belirsiz eşleşme.
- Accounting/AI/OEM yokken marketplace bağımsızlığı.

PoC’nin kritik kabul ölçütü: **Aynı kaynak, UI/API/workflow/job/export/file yolu değişse de aynı yetki sonucunu vermelidir.**

**17. Kaynak kanıtları**

Yerel yollar kurulu sürümlere aittir; incelenen fonksiyonlar aşağıda belirtilmiştir.

| Kanıt | Yerel kaynak |
|---|---|
| Yönetişim | [AGENTS.md](/D:/DogruAdres/AGENTS.md), [README](/D:/DogruAdres/docs/dogruadres/README.md), [SECURITY](/D:/DogruAdres/docs/dogruadres/SECURITY.md), [MERCUR-INTEGRATION](/D:/DogruAdres/docs/dogruadres/MERCUR-INTEGRATION.md), kabul edilmiş ADR-0001/2/3 |
| Kurulu sürüm ve yapılandırma | [API package.json](/D:/DogruAdres/packages/api/package.json), [medusa-config.ts](/D:/DogruAdres/packages/api/medusa-config.ts), [proje middleware](/D:/DogruAdres/packages/api/src/api/middlewares.ts) |
| Version-matched belge indeksi | [llms.txt](/D:/DogruAdres/node_modules/@mercurjs/docs/llms.txt) |
| Member ilişkisi | [Member modeli](/D:/DogruAdres/packages/api/node_modules/@mercurjs/core/.medusa/server/src/modules/seller/models/member.js), aynı dizinde `seller-member.js` |
| Seller üyelik ve session | [ensureSellerMiddleware](/D:/DogruAdres/packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/utils/ensure-seller-middleware.js), `api/vendor/sellers/select/route.js` |
| Seller parametre izolasyonu | [ensureSellerIdParamMiddleware / ensureSellerMemberParamMiddleware](/D:/DogruAdres/packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/utils/ensure-seller-scope-middleware.js) |
| Mercur izin fallback | [permissions-middleware.js](/D:/DogruAdres/packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/utils/permissions-middleware.js): `resolvePermissionsMiddleware`, `requirePermission` |
| Yayımlanmış resolver kontratı | [IPermissionResolver](/D:/DogruAdres/packages/api/node_modules/@mercurjs/types/dist/permissions/index.d.ts) |
| Medusa auth/session/token | [authenticate](/D:/DogruAdres/packages/api/node_modules/@medusajs/framework/dist/http/middlewares/authenticate-middleware.js), `medusa/dist/api/auth/session/route.js`, `auth/utils/generate-jwt-token.js` |
| E-posta doğrulama | [validateVerification](/D:/DogruAdres/packages/api/node_modules/@medusajs/medusa/dist/api/auth/utils/validate-verification.js), `auth/verification/request` ve `confirm/route.js` |
| Medusa RBAC | [hasPermission](/D:/DogruAdres/packages/api/node_modules/@medusajs/framework/dist/policies/has-permission.js), `http/middlewares/check-permissions.js`, `http/router.js` |
| Davet kabulü | [acceptMemberInviteWorkflow](/D:/DogruAdres/packages/api/node_modules/@mercurjs/core/.medusa/server/src/workflows/seller/workflows/accept-member-invite.js), Seller service `validateMemberInviteToken` |
| Owner koruması | `workflows/seller/steps/validate-remove-seller-member.js`, `validate-not-owner.js`, `workflows/update-member-role.js` |
| Order/Offer/payout sınırı | `api/vendor/orders/helpers.js`: `validateSellerOrder`; `offers/[id]/route.js`; `payouts/[id]/route.js`: `validateSellerPayout` |
| Müşteri order sahipliği | `api/store/order-groups/route.js` ve `[id]/route.js`: `customer_id` filtresi |
| Public upload | [vendor uploads](/D:/DogruAdres/packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/vendor/uploads/route.js): `access:"public"` |
| Paket uyumluluk davranışı | `with-mercur.js`, `utils/disable-medusa-middlewares.js` |

Okunan Mercur sayfaları arasında `learn/seller-members`, `learn/sellers`, `learn/products`, `learn/offers`, `platform/store/concepts/team`, `platform/store/reference/data-models`, API conventions/vendor ve route/module-link/workflow extension rehberleri bulunuyor.

Resmî çevrimiçi kaynaklar, yerel sürüm kanıtının yerine geçirilmedi. Genel extension yaklaşımı için [Mercur dokümantasyonu](https://docs.mercurjs.com/) ve [resmî repository](https://github.com/mercurjs/mercur); route koruması için [Medusa Protected Routes](https://docs.medusajs.com/learn/fundamentals/api-routes/protected-routes) incelendi.

**18. Git durumu ve değişiklik yapılmadığı teyidi**

Başlangıç ve son `git status --short` aynı:

```text
?? .vscode/
?? DESIGN.md
```

Son `git diff --stat` ve `git diff --cached --stat` boş.

**Hiçbir kaynak, belge, yapılandırma veya untracked dosya değiştirilmedi.** Dosya oluşturulmadı; bağımlılık kurulmadı; build, seed, test veya migration çalıştırılmadı; Git geçmişine müdahale edilmedi. Secret/env dosyaları ve üretim sistemleri incelenmedi. AI/OEM sağlayıcı API’leri çağrılmadı.

**A5 tamamlandı. A6 veya A7’ye geçilmedi; ürün sahibi incelemesi bekleniyor.**