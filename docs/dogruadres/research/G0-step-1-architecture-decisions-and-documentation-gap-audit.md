## 1. Yönetici değerlendirmesi

**INFERRED — G0/Step 1 sonucu: mevcut dokümantasyon, güvenli uygulamaya geçiş için henüz yeterli değil.** Mercur temelini koruma, otomotiv alanını ayırma ve onay kapıları güçlü biçimde belgelenmiş. Ancak bu görevde belirtilen genişletilmiş ürün gereksinimleri ve A1–A7 mimari yönlerinin çoğu kalıcı belgelere yansımamış.

**VERIFIED —** Yerel ADR’lerde `Accepted` olarak işaretlenmiş üç karar bulunuyor:

- Mercur’un marketplace motoru olması.
- Otomotiv alanının DoğruAdres sahipliğinde ayrılması.
- Mercur core değişikliğinin varsayılan olarak yasaklanması.

**UNVERIFIED —** A1–A7 raporlarının tamamı, alternatif değerlendirmeleri ve onay kayıtları yerelde bulunamadı. Bu nedenle araştırma yönlerinin tamamını “kabul edilmiş mimari karar” olarak sınıflandırmak mümkün değil.

Bu raporda:

- **VERIFIED:** Yerel dosya veya mevcut kullanıcı talimatıyla doğrudan doğrulanan bilgi.
- **INFERRED:** Doğrulanan bilgilerden çıkarılan değerlendirme.
- **RECOMMENDED:** Henüz onaylanmış karar olmayan öneri.
- **UNVERIFIED:** Bağımsız kanıtı veya onay izi bulunmayan bilgi.

Görevin 4. bölümündeki davranışlar mevcut ürün-sahibi gereksinim referansı olarak kullanıldı. Araştırma bağlamındaki “preferred directions” ise kendiliğinden onaylanmış mimariye yükseltilmedi.

## 2. Doğrulanmış belge envanteri

| Belge | Doğrulanan amaç ve durum |
|---|---|
| [AGENTS.md](D:/DogruAdres/AGENTS.md:49) | Kalıcı yönetişim, kaynak önceliği, onay kapıları ve Mercur çalışma kuralları. |
| [Dokümantasyon router’ı](D:/DogruAdres/docs/dogruadres/README.md:22) | Altı temel belgeye, ADR ve plan dizinlerine yönlendiriyor. |
| [PRINCIPLES.md](D:/DogruAdres/docs/dogruadres/PRINCIPLES.md:1) | Extension-first, otomotiv sahipliği, bağımlılık, kaynak ve test ilkeleri. |
| [ARCHITECTURE.md](D:/DogruAdres/docs/dogruadres/ARCHITECTURE.md:3) | Baseline ve otomotiv odaklı hedef sınırlar; final şema tanımlamıyor. |
| [SECURITY.md](D:/DogruAdres/docs/dogruadres/SECURITY.md:5) | Genel proje güvenlik yükümlülükleri; ayrıntılı Organization yetkilendirme sözleşmesi yok. |
| [MERCUR-INTEGRATION.md](D:/DogruAdres/docs/dogruadres/MERCUR-INTEGRATION.md:5) | Extension sırası, adapter yaklaşımı ve baseline sapmaları. |
| [UPGRADE-POLICY.md](D:/DogruAdres/docs/dogruadres/UPGRADE-POLICY.md:5) | Kontrollü yükseltme ve compatibility tekrar değerlendirmesi. |
| [ADR index’i](D:/DogruAdres/docs/dogruadres/adr/README.md:41) | Yalnızca ADR-0001, ADR-0002, ADR-0003 listeleniyor. |
| [ADR şablonu](D:/DogruAdres/docs/dogruadres/adr/TEMPLATE.md:1) | `Proposed` başlangıç durumu; onaylayan, onay kanıtı ve gereksinim bağlantıları yok. |
| [Plan router’ı](D:/DogruAdres/docs/dogruadres/plans/README.md:1) ve [şablonu](D:/DogruAdres/docs/dogruadres/plans/TEMPLATE.md:1) | Riskli işlerde plan gerekiyor; Approval status alanı var. Somut uygulama planı bulunamadı. |
| [DESIGN.md](D:/DogruAdres/DESIGN.md:3) | `PROPOSED — AWAITING PRODUCT-OWNER APPROVAL`; Git tarafından izlenmiyor. |
| `CODEBASE.md` | Yerel taramada bulunamadı. |
| Teknik README’ler | Backend, panel ve storefront scaffold/kullanım belgeleri mevcut; DoğruAdres uygulama mimarisi kanıtı değiller. |

**VERIFIED —** Kurulu paket manifestleri Mercur core **2.3.6**, Medusa **2.21.2**, bundled docs **2.3.6** gösteriyor. Backend paketleri workspace altındaki `node_modules` içinde; kökte bulunmamaları paketlerin yokluğu anlamına gelmiyor.

**UNVERIFIED —** `DESIGN.md` içindeki Stitch gözlemleri bu denetimde harici hizmete bağlanılarak yeniden doğrulanmadı. Doğrulanan şey belgenin içeriği ve öneri statüsüdür.

## 3. Eksik mimari araştırma kanıtları

**VERIFIED —** Repository’deki belge envanteri, gizli/ignore edilmiş belge dosyalarını da kapsayan ek tarama ve ilgili içerik aramalarında A1–A7 raporları bulunamadı.

**UNVERIFIED —** Bu raporların başka bir konumda veya önceki görüşmelerde bulunması dışlanamaz. Yerel yokluk, araştırmaların yapılmadığını göstermez.

Eksik kanıt nedeniyle şu noktalar bağımsız uzlaştırılamıyor:

- Hangi önerinin hangi alternatiflere karşı tercih edildiği.
- Hangi yönün ürün sahibi tarafından açıkça kabul edildiği.
- Mercur extension noktalarının hangi kaynak incelemesiyle yeterli bulunduğu.
- Güvenlik ve finansal uygulanabilirlik sınırlamaları.
- Ertelenen kararlar, koşullar ve karşı örnekler.
- Araştırma bulgularının baseline sorunlarıyla ilişkisi.

**RECOMMENDED —** Raporlar sonradan sağlandığında her bulgu; gereksinim, öneri, kabul edilmiş karar veya ertelenmiş karar olarak ayrılmalı. Raporun varlığı tek başına onay sayılmamalı.

## 4. Ürün gereksinimi kapsam matrisi

Aşağıdaki mevcut kapsam bulguları **VERIFIED**, hedef belge ve ADR önerileri **RECOMMENDED** statüsündedir.

**Öncelik:** P0 = ilk güvenlik dilimini engeller; P1 = ilgili domain uygulamasından önce çözülmeli; P2 = ilgili gelecek özelliğinden önce çözülmeli.

“Hedef gereksinim belgesi”, mevcut `docs/dogruadres/` yapısına eklenecek tek ürün gereksinimi belgesini ifade eder; henüz oluşturulmamıştır.

| Gereksinim / beklenen davranış | Mevcut belge ve kanıt | Boşluk / sonuç | Yetkili hedef; ADR; açıklama ihtiyacı |
|---|---|---|---|
| E-posta doğrulaması ile kişisel kimlik doğrulaması ayrı; tek kanonik kişi, çoklu Organization üyeliği | ARCHITECTURE, Ownership boundaries yalnızca seller/member ve otomotiv alanını tanımlıyor | **P0:** Kimliklerin eşleştirilmesi ve yetki kaynağı belirsiz | Gereksinim belgesi + SECURITY + kimlik ADR’si. ADR gerekli; actor eşlemesi/onay gerekli. |
| Organization seçmeden kişisel alan; bekleyen davet kartları; invitation-only üyelik; ilk kanal e-posta, SMS/WhatsApp gelecek adapter | DESIGN §13 yalnızca öneri shell/switcher içeriyor | **P0:** Davet ve onboarding erişimi yanlış yorumlanabilir | Gereksinim belgesi + kimlik/davet ADR’si. Alıcı bağlama, süre, iptal ve e-posta değişimi açıklanmalı. |
| Job Board kişisel uygulama; e-posta doğruluyla liste/arama, kimlik doğruluyla detay/başvuru | Kalıcı ürün kapsamı yok; DESIGN §18 modül gereksinimi belirlemediğini söylüyor | **P1:** Detay ve başvuru yetkileri eksik | Gereksinim belgesi + SECURITY. Davranış için ayrı ADR gerekmez. |
| Organization iş ilanlarını yetkili kişiler yönetir; iş yönetimi zorunlu, tam HR aktivasyonundan bağımsız | Belgelenmemiş | **P1:** Opsiyonel HR yanlışlıkla iş yönetimini kapatabilir | Gereksinim belgesi; uygulama sınırı ADR’sinde bağımsızlık. Rol ayrıntıları açıklanmalı. |
| Meydan ve yorumlar e-posta doğruluyla okunur; kimlik doğrulaması öncesi ad maskeli, profil navigasyonu yasak; katılım kimlik doğrulaması ister | SECURITY yalnızca genel kişisel veri/log yükümlülüğü içeriyor | **P1:** UI maskesi API/arama üzerinden aşılabilir | Gereksinim belgesi + SECURITY. Maskeleme ve katılım eylemleri tanımlanmalı; ayrı ADR şart değil. |
| Yorumların isteğe bağlı Meydan çapraz yayını; görünürlük, moderasyon ve yaşam döngüsü tutarlı | Belgelenmemiş | **P1:** Silinen veya gizlenen içerik diğer yüzeyde kalabilir | Gereksinim belgesi; içerik sahipliği mimari kararı gerekebilir. Kaynak kayıt ve propagation politikası onaylanmalı. |
| Standard Verified = kişisel doğrulama; Golden = ayrıca uygun aktif Organization’da korumalı Owner; dinamik, yetki vermez; gerçek geçişte bildirim | Belgelenmemiş | **P1:** Rozet yetki kaynağına dönüşebilir; yinelenen bildirim riski | Gereksinim belgesi + SECURITY; eligibility ADR’si. Owner koruması ve geçiş semantiği açıklanmalı. |
| Doğrulama sağlayıcısı seçilmemiş; e-Devlet uygunluğu varsayılmaz; belge/biyometri varsayılan toplanmaz | SECURITY’de bu özel sınırlar yok | **P0** gerçek doğrulama entegrasyonundan önce: gereksiz hassas veri toplama | SECURITY + gereksinim belgesi. Sağlayıcı/veri işleme sınırı ADR ve gerekli hukuki inceleme ister. |
| Aktif Organization kriterleri Platform Loyalty Management’ta; paylaşılan versioned eligibility servisi, opsiyonel loyalty’den bağımsız | Belgelenmemiş | **P1:** Rozet/temsilci sonuçları ayrışabilir veya uygulama kapanınca servis kaybolabilir | ARCHITECTURE + gereksinim belgesi + eligibility ADR’si. Kriterler ve kesinti davranışı onaylanmalı. |
| Platform eligibility, Organization kampanyaları ve representative reacquisition ayrı; geçmiş kazanılmış haklara gelecek politika uygulanmaz | Belgelenmemiş | **P1:** Geçmiş finansal hakların yeniden hesaplanması | Gereksinim belgesi + eligibility/finans ADR’leri. Hak kazanma zamanı ve policy sürümü onaylanmalı. |
| Sektör profili ilk aktivasyonu belirler; zorunlu app kapanamaz; politika mevcut app’i otomatik kapatmaz; yeni app önerilebilir | DESIGN §18 yalnızca görsel öneriler | **P1:** Politika değişimi beklenmedik işlev kaybı yaratabilir | Gereksinim belgesi + uygulama yaşam döngüsü ADR’si. Zorunlu app listesi ve ilk aktivasyon matrisi gerekli. |
| Launcher sırası ve açık/kapalı alanlar kullanıcıya ait; app deactivation korunan geçmişi silmez | DESIGN §13 launcher öneriyor; veri yaşam döngüsü yok | **P1:** Tercih/Organization ayarı karışması, tarihçe kaybı | Gereksinim belgesi + SECURITY retention bölümü. UI için ADR gerekmez; yaşam döngüsü ADR’sine bağlanmalı. |
| Notification bell ve session-lock; kilitli oturum korunan API’ye sınırsız erişemez | DESIGN §12–13 bildirim önerisi; lock yok | **P0:** Kozmetik kilit gerçek erişimi açık bırakabilir | SECURITY + session ADR’si; ardından DESIGN. Lock/unlock, revocation ve cihaz kapsamı onaylanmalı. |
| Operasyon logu, audit trail ve authoritative ledger ayrı; recycle-bin hata nedeni kalıcı; yalnız güvenli kayıt silinir, korunan kayıt arşivlenir | SECURITY Mandatory rules genel audit/destructive-operation yükümlülüğü içeriyor | **P1:** Finansal kanıt ile log karışması, yasak silme | SECURITY + gereksinim belgesi; retention/finans ADR’si. Saklama süreleri ve silinebilirlik matrisi gerekli. |
| Platform-admin statüsü Organization-private veriye tek başına erişim sağlamaz | SECURITY seller isolation diyor; private-data sınırı yok | **P0:** Platform geneli admin modeli özel veri alanına taşınabilir | SECURITY + yetkilendirme ADR’si + MERCUR-INTEGRATION. Operasyon destek erişimi politikası açıklanmalı. |
| Bir legal Organization çoklu ayrı onaylı Store’a sahip; her Store ayrı statement/payout | ARCHITECTURE seller primitive’ini tanımlıyor; Organization–Store ayrımı yok | **P0** sahiplik için, **P1** finans için: yanlış tenant/hesap kapsamı | ARCHITECTURE + gereksinim belgesi + Organization–Store ADR’si. Onay ve finans eşlemesi gerekli. |
| Uygun buyer segmentlerinde en düşük fiyat; Store bazlı buyer block; Store/product komisyon istisnası | SECURITY fiyat bütünlüğü genel; ürün politikası yok | **P1:** Yanlış fiyat veya komisyon, block bypass | Gereksinim belgesi + MERCUR-INTEGRATION. Fiyat uygunluğu/tie ve komisyon çakışma kuralları onaylanmalı; gerekiyorsa fiyat ADR’si. |
| Marketplace Basic Accounting aktivasyonundan bağımsız; dış ERP/accounting/inventory mümkün | ARCHITECTURE adapter ilkesi genel; DESIGN muhasebeyi öneri olarak anıyor | **P1:** Muhasebe zorunlu bağımlılığa dönüşebilir | ARCHITECTURE + gereksinim belgesi + accounting ADR’si. Entegrasyon veri sahipliği onaylanmalı. |
| Aynı Store’da farklı kaynak para birimleri; original Offer fiyatı authoritative; kontrollü TRY publication; TRY settlement tercih; tarihçe/provenance/snapshot | Offer davranışı proje belgelerinde yok | **P1:** Yeniden fiyatlama ve transaction geçmişi bozulabilir | Gereksinim belgesi + finans/fiyat-kur ADR’si. TRY settlement hâlâ tercih; kesin onay gibi yazılmamalı. |
| Native TypeScript/PostgreSQL Basic Accounting, double-entry; 2005-01-01’den TCMB arşivi | Belgelenmemiş araştırma yönleri | **P1:** Araştırma önerisi uygulama kararı sanılabilir | ARCHITECTURE’de Proposed yön; accounting ve kur ADR’leri. Finans kabulü ve arşiv semantiği onaylanmalı. |
| Organization BYOK, server-side secret; AI mevcut insan yetkisini aşamaz; risk bazlı write approval; provider-neutral, logical isolation | SECURITY secret kuralı genel; AI alanı yok | **P2:** Gelecek AI tool yolu ayrıcalık bypass’ı yaratabilir | Gereksinim belgesi + SECURITY + gelecek AI ADR’si. Credential lifecycle ve risk sınıfları onaylanmalı. |
| VIN/OEM yetkili gelecek provider; LexCom yalnız aday; OEM referansı canonical product merge kanıtı değil | ADR-0002 OEM/equivalence sahipliğini tanımlıyor | **P2:** Provider seçimi veya katalog birleştirmesi örtük kabul edilebilir | Gereksinim belgesi + provider ADR’si. Lisans, veri kullanımı ve merge kriterleri daha sonra onaylanmalı. |

**INFERRED —** Matrisin ağırlıklı sonucu “mevcut doküman yanlış davranış emrediyor” değil, “onaylı hedef davranış için kalıcı ve izlenebilir kapsam eksik”tir.

## 5. Çelişkili veya güncelliği tartışmalı ifadeler

| Bulgu | Kaynak ve mevcut ifade | Önerilen çözüm / önem |
|---|---|---|
| **VERIFIED — `compose.dev.yml` sınıflandırma çelişkisi** | PRINCIPLES §4 bunu development infrastructure ve compatibility patch olmayan unsur olarak tanımlar. MERCUR-INTEGRATION aynı dosyayı Temporary compatibility adjustment altında listeler. | **P1:** Integration sınıflandırması mevcut ilkeyle uzlaştırılmalı. Yeni ADR gerekmez; mevcut kabul izinin kontrolü yeterli. |
| **INFERRED — Mimari kapsam artık dar** | ARCHITECTURE DoğruAdres sahipliğini otomotiv kavramlarıyla örnekliyor. Organization, authorization, application, private-data ve accounting yok. | **P0:** Bu alanlar mevcut kabul edilmiş karar gibi eklenmemeli; önce ilgili mimari onaylar. |
| **VERIFIED — Geliştirme URL’leri farklı sunuluyor** | Root README: `7000/7001`; AGENTS ve medusa-config: `9000/dashboard`, `9000/seller`. | **P2:** Ayrı Vite geliştirme adresleri ile backend üzerinden panel adresleri açıkça ayrılmalı. Tek başına runtime arızası kanıtı değil. |
| **VERIFIED — Test README örneği paket adıyla uyuşmuyor** | HTTP test README `medusa-test-utils`; gerçek health testi ve manifest `@medusajs/test-utils` kullanıyor. | **P0** test hazırlığında: teknik rehber düzeltilmeli; yeni ADR gerekmez. |
| **VERIFIED — DESIGN’de kesin dil ile öneri statüsü arasında gerilim** | §16 “platform must support” Türkçe/İngilizce/Arapça/RTL der; §1 belgeyi tamamen öneri olarak sınırlar. | **P1:** Dil gereksiniminin onay kaynağı gösterilmeli veya Proposed olarak etiketlenmeli. Bu görev bu tercihi onaylamıyor. |
| **VERIFIED — Storefront rehberi provider varsayımları içeriyor** | Storefront README Stripe, Algolia, TalkJS ve örnek platform değerleri içeriyor. | **P1:** Scaffold örnekleri ürünün provider seçimi sayılmamalı; ücretli/kapalı servis benimsemesi ayrı onay ister. |
| **UNVERIFIED — Upstream lint sorununun niteliği** | MERCUR-INTEGRATION storefront lint/parser sorununu upstream known issue olarak kaydediyor. | Belgesel sınıflandırma doğrulandı; upstream rapor bağlantısı ve güncel teknik kanıtı doğrulanmadı. Bu görevde test çalıştırılmadı. |

ADR-0001 ve ADR-0003 arasında doğrudan çelişki bulunmadı. ADR-0002’nin otomotiv ayrımı yeni platform alanlarını yasaklamıyor; onları onaylamış da sayılmıyor.

## 6. Mimari ve güvenlik yönetişimi boşlukları

**VERIFIED —** SECURITY mevcut haliyle seller isolation, fiyat bütünlüğü, secrets ve auditability yükümlülüklerini içeriyor; şu sözleşmeler eksik:

- Kanonik kişinin Medusa `user/customer` ve Mercur `member` actor’larıyla ilişkisi.
- Organization ile Store yetkilerinin ayrımı.
- Fail-closed resolver’ın girdileri, varsayılan ret davranışı ve hata durumları.
- Davet token’ının gerçek alıcı kimliğiyle bağlanması.
- Oturum lock/revocation sonrası cookie ve bearer erişimi.
- API dışı workflow, job, export, search ve file erişimleri.
- Platform-admin’in private-data alanına erişim sınırı.
- Retention ve finansal kayıt değişmezliği.
- Bağımsız negatif testler ve test altyapısının kabul kanıtları.

**VERIFIED —** [medusa-config.ts](D:/DogruAdres/packages/api/medusa-config.ts:23) JWT ve cookie secret için `"supersecret"` fallback’i içeriyor. Bu, gerçek production ortamında fallback kullanıldığını kanıtlamaz; ancak üretimde eksik secret ile başlamayı reddeden proje kabul şartı belgelenmemiş.

Aynı dosyada seller registration açık ve local file provider yapılandırılmış. Invitation-only Organization üyeliği ile Store registration aynı süreç değildir; aralarındaki adapter ve politika sınırı açıkça tanımlanmalı. Local file yapılandırması tenant-private dosya güvenliği kanıtı değildir.

**VERIFIED —** [Proje middleware dosyası](D:/DogruAdres/packages/api/src/api/middlewares.ts:3) boş route listesi içeriyor. Bu, Mercur’un kendi middleware’lerinin yokluğu anlamına gelmez; DoğruAdres resolver entegrasyonunun kanıtı da değildir.

**VERIFIED —** [Health testi](D:/DogruAdres/packages/api/integration-tests/http/health.spec.ts:8) yalnız `/health → 200` kontrolü yapıyor. Jest yapılandırması var; auth/tenant negatif testlerinin çalıştığına ilişkin kanıt yok.

**INFERRED —** “Tam test stratejisi daha sonra” ifadesi korunabilir; fakat ilk security PoC’nin test altyapısı ve negatif kabul senaryoları ertelenemez.

## 7. Önerilen ADR eklemeleri ve değişiklikleri

**RECOMMENDED —** Mevcut üç ADR korunmalı; genişletilmiş platform kararları bunların içine geriye dönük kabul edilmiş gibi eklenmemeli.

| ADR konusu | Zamanlama |
|---|---|
| Modüler platformun başlangıçta mevcut Medusa backend’i paylaşması; domain ve persistence sahipliği | İlk PoC’den önce kapsam onayı |
| Kanonik kişi, Organization üyeliği, korumalı Owner ve Organization–Store eşlemesi | İlk PoC’den önce |
| Fail-closed authorization, private-data/admin sınırı, davet bağlama ve session lifecycle | İlk PoC’den önce; gerekirse iki kayıt |
| Organization uygulama aktivasyonu/deactivation ve bağımsız platform eligibility | İlgili uygulama diliminden önce |
| Native Basic Accounting, double-entry, marketplace bağımsızlığı ve finans kabulü | Finans uygulamasından önce |
| Authoritative source-currency fiyat, TRY publication/settlement, TCMB archive ve snapshot sözleşmesi | Fiyat/kur uygulamasından önce |
| Organization AI/BYOK ve risk bazlı tool approval | AI kapsamı açıldığında |
| Provider-neutral VIN/OEM ve canonical product merge sınırı | Provider entegrasyonu açıldığında |

Eligibility policy versioning ve vested entitlement konusu, uygulama yaşam döngüsü ADR’sinde yeterince açık tutulamıyorsa ayrı ADR olmalı.

ADR şablonuna minimum olarak **onaylayan, onay tarihi/kanıtı, bağlı gereksinim ID’leri, ertelenen kararlar ve supersedes bağlantısı** eklenmesi önerilir. `Accepted` etiketi bu alanların yerine geçmez.

## 8. Gereksinim belgelerinin en küçük güvenli düzeni

**RECOMMENDED —** Yeni kapsamlı bir hiyerarşi kurmak yerine mevcut `docs/dogruadres/` yapısı genişletilmeli:

- Tek yeni ürün gereksinimi belgesi: örneğin `REQUIREMENTS.md`.
- Mevcut router’dan bu belgeye ve root `DESIGN.md` dosyasına açık yönlendirme.
- `plans/` uygulama planları için kalmalı.
- `adr/` mimari seçimlerin gerekçe ve onay kayıtlarını taşımalı.

Gereksinim belgesi; kişisel alan, Organization/app lifecycle, marketplace/finance ve gelecekteki AI/OEM bölümlerine ayrılabilir. Her gereksinimde ID, durum, kaynak/onay, kabul senaryosu, açık karar ve bağlı ADR bulunmalı.

Onay durumları ile kanıt etiketleri ayrı tutulmalı:

- `Approved`: açık ürün-sahibi onayı bulunan davranış.
- `Proposed`: araştırma önerisi veya henüz kabul edilmemiş tasarım.
- `Deferred`: uygulaması ertelenmiş; kararın da ertelenip ertelenmediği belirtilmiş.
- `Open decision`: karar bekleyen konu.

`VERIFIED` yalnızca bilginin doğrulandığını ifade eder; bir öneriyi `Approved` yapmaz.

## 9. Kalıcı belge ile görev raporu ayrımı

**RECOMMENDED —**

| Tür | Taşıması gereken bilgi |
|---|---|
| AGENTS | Kalıcı agent kuralları, otorite sırası, onay kapıları ve belge yönlendirmesi |
| CODEBASE | Yalnız mevcut, kaynakla doğrulanmış uygulama mimarisi |
| ARCHITECTURE | Kabul edilmiş hedef sınırlar; Proposed yönler açık etiketli |
| ADR | Karar, alternatifler, gerekçe, sonuç ve onay izi |
| Gereksinim belgesi | Onaylı hedef davranış, açık ürün kararları ve kabul senaryoları |
| Plan | Yetkilendirilecek uygulama kapsamı, test, risk ve rollback |
| Görev raporu | Denetim/araştırma sonucu ve o göreve özgü kanıtlar |

Bu G0 raporu ve A1–A7 metinleri AGENTS veya CODEBASE içine taşınmamalı. Kalıcı belgelere yalnız onaylanmış sonuçlar ve kanıt bağlantıları aktarılmalı.

`CODEBASE.md` ileride oluşturulacaksa uygulanmamış Organization, accounting, BYOK veya TCMB özelliklerini içermemeli. Her mimari iddia gerçek dosyaya dayanmalı; testin mevcut olması ile başarılı çalışması ayrı belirtilmeli.

## 10. Ürün sahibi onayı gerektiren kararlar

**RECOMMENDED —** İlk PoC’den önce karar altına alınması gerekenler:

1. Başlangıçta ortak backend kullanımı ve DoğruAdres domain sahipliği.
2. Kanonik kişi ile mevcut auth actor’larının eşleştirilmesi.
3. Organization–Store ilişkisi ve platform-admin/private-data sınırı.
4. Fail-closed resolver sözleşmesi; eksik bağlam, hata ve stale permission davranışı.
5. Davet alıcısı bağlama, token lifecycle ve e-posta değişikliği.
6. Session lock/unlock, revocation, cihaz kapsamı ve izin verilen kilitli-session işlemleri.
7. PoC kapsamı, mevcut Mercur erişim yolları ve negatif kabul senaryoları.

İlgili domain dilimlerinden önce ayrıca onay gerektirir:

- Owner devri/koruması ve eligibility kriterleri.
- Zorunlu uygulamalar ve sektör aktivasyon matrisi.
- Retention, arşivleme ve silinebilirlik.
- Double-entry finans kontrolleri, reconciliation ve external integration sahipliği.
- TRY settlement’in kesin kapsamı; kur türü, tarih, yuvarlama, yayın zamanı ve snapshot.
- Verification provider ve hassas veri işleme.
- AI write-risk sınıfları ve BYOK credential lifecycle.
- VIN/OEM provider lisansları ve ürün birleştirme kriterleri.

Mevcut mesajda açıkça verilen ürün davranışlarının yeniden keşfedilmesi gerekmiyor; eksik olan mimari seçimler ve uygulama ayrıntıları için onay alınmalı.

## 11. Sıralı dokümantasyon güncelleme planı

**RECOMMENDED —** Daha sonra yetkilendirilecek en küçük güvenli sıra:

1. **Kanıtları uzlaştır:** A1–A7 sağlanırsa bulgu/onay haritasını çıkar; eksikler `UNVERIFIED` kalsın.
2. **Gereksinim kaydını hazırla:** Mevcut ürün davranışlarını kaynaklarıyla kaydet; araştırma yönlerini Proposed olarak ayır.
3. **P0 kararları onaylat:** Kimlik, sahiplik, authorization, davet ve session sözleşmeleri.
4. **P0 ADR’leri kaydet:** Onay kanıtları ve ertelenmiş kararlarla.
5. **ARCHITECTURE ve SECURITY’yi hizala:** Onaylanan sınırlar ve PoC kabul koşulları.
6. **MERCUR-INTEGRATION’ı düzelt:** Organization–Store/auth adapter sınırları ve `compose.dev.yml` sınıflandırması.
7. **Router ve şablonları güncelle:** Gereksinim, tasarım, ADR ve plan okuma sırası; onay izleri.
8. **Teknik README tutarsızlıklarını gider:** Test paket adı, panel adreslerinin çalışma modu, provider örneklerinin scaffold niteliği.
9. **DESIGN’i yalnız onaylı işlevsel brief’e bağla:** Görsel öneriler iş kuralları veya API yetkileri üretmesin.
10. **İlk security PoC planını onaya sun:** Kapsam, negatif testler, extension noktaları ve rollback.
11. **Sonraki domain kararlarını kendi dilimlerine bırak:** Accounting, FX, loyalty, AI ve OEM ilk PoC’yi gereksiz genişletmesin.

UPGRADE-POLICY’ye ileride Organization authorization adapter’ları ve negatif testlerin upgrade kabulünde yeniden doğrulanması eklenmeli.

Gelecek coding agent’ları: AGENTS → router → ilgili approved gereksinimler → accepted ADR’ler → SECURITY/ARCHITECTURE/MERCUR-INTEGRATION → kurulu Mercur index ve ilgili sayfalar → kaynak/types → onaylı plan sırasını izlemeli.

## 12. İlk güvenlik PoC’si için hazırlık ölçütleri

**RECOMMENDED —** Kod başlamadan önce şu kanıtlar hazır olmalı:

| Kapı | Minimum karar / kanıt |
|---|---|
| Kanonik kimlik | Stable kişi kimliği; auth actor eşleme ve e-posta/kimlik doğrulama ayrımı |
| Organization sahipliği | Resource → Organization → Store ilişkisinin yetkili kaynağı |
| Resolver | Principal, session, Organization, resource, action; eksik/hatalı bağlamda ret |
| Davet | Token sahibi ile doğrulanmış alıcı eşleşmesi; replay, expiry, revoke ve farklı kullanıcı senaryoları |
| Session | Lock/revocation’ın cookie ve bearer erişimine etkisi; stale token davranışı |
| Mercur yolları | Admin/vendor/store, workflow ve job yollarının kapsam listesi; extension yeterliliği |
| Tenant veri yüzeyleri | Detail/list/search/count, file URL, report ve export sızıntı testleri |
| Credential configuration | Production’da eksik/örnek secret ile başlamama; testte gerçek credential kullanmama |
| Test altyapısı | İzole geçici DB/test fixtures, Windows’ta çalıştırılabilir hedefli komut, teardown |
| Negatif kabul | Beklenen sonuçları resolver’ın kendisinden türetmeyen bağımsız senaryolar |

Negatif senaryolar en az yanlış Organization, başka tenant resource ID’si, sahte context/header, iptal üyelik, kilitli oturum, platform-admin tek başına, izin-servisi hatası ve API dışı workflow çağrısını kapsamalı. İzinli kontrol senaryoları da bulunmalı; her isteği reddeden sistem başarılı sayılmamalı.

**RECOMMENDED — Tek en güvenli ilk PoC:** İki sentetik Organization ve bir proje-owned korunan kaynak üzerinde, aynı fail-closed resolver’ı kullanan **read-only API ve workflow erişim dikey dilimi**.

Amaç; doğru kişi/doğru Organization erişimini ve tenant değişimi, lock/revocation, admin ayrıcalığı ve doğrudan workflow çağrısı üzerinden bypass’ın reddini kanıtlamak olmalı. Gerçek verification, ödeme, muhasebe, AI veya OEM entegrasyonu içermemeli. Bu PoC tam platform güvenliği kanıtı değildir; sonraki dosya/arama/export ve write dilimleri için temel oluşturur.

## 13. Kesin kaynak referansları

Rapordaki temel kanıt noktaları:

- [AGENTS — ürün kararı ve onay kapıları](D:/DogruAdres/AGENTS.md:81), [otorite sırası](D:/DogruAdres/AGENTS.md:124)
- [Router — belge amaçları](D:/DogruAdres/docs/dogruadres/README.md:7), [otorite sırası](D:/DogruAdres/docs/dogruadres/README.md:36)
- [PRINCIPLES — compatibility sınıflandırması](D:/DogruAdres/docs/dogruadres/PRINCIPLES.md:31), [test ilkeleri](D:/DogruAdres/docs/dogruadres/PRINCIPLES.md:72)
- [ARCHITECTURE — sahiplik](D:/DogruAdres/docs/dogruadres/ARCHITECTURE.md:7), [veri sahipliği](D:/DogruAdres/docs/dogruadres/ARCHITECTURE.md:58)
- [SECURITY — zorunlu kurallar](D:/DogruAdres/docs/dogruadres/SECURITY.md:5)
- [MERCUR-INTEGRATION — baseline sapmaları](D:/DogruAdres/docs/dogruadres/MERCUR-INTEGRATION.md:46)
- [ADR-0001](D:/DogruAdres/docs/dogruadres/adr/ADR-0001-mercur-as-marketplace-engine.md:3), [ADR-0002](D:/DogruAdres/docs/dogruadres/adr/ADR-0002-automotive-domain-isolation.md:3), [ADR-0003](D:/DogruAdres/docs/dogruadres/adr/ADR-0003-mercur-core-modification-policy.md:3)
- [DESIGN — statü](D:/DogruAdres/DESIGN.md:3), [shell](D:/DogruAdres/DESIGN.md:160), [localization](D:/DogruAdres/DESIGN.md:192), [onaysız öneriler](D:/DogruAdres/DESIGN.md:250)
- [Root README — adresler](D:/DogruAdres/README.md:40)
- [Storefront README — provider örnekleri](D:/DogruAdres/apps/storefront/README.md:76)
- [Test README — örnek import](D:/DogruAdres/packages/api/integration-tests/http/README.md:3)
- [Jest yapılandırması](D:/DogruAdres/packages/api/jest.config.js:21), [health testi](D:/DogruAdres/packages/api/integration-tests/http/health.spec.ts:8)
- [Kurulu Mercur core sürümü](D:/DogruAdres/packages/api/node_modules/@mercurjs/core/package.json:2), [Medusa sürümü](D:/DogruAdres/packages/api/node_modules/@medusajs/medusa/package.json:2), [docs sürümü](D:/DogruAdres/node_modules/@mercurjs/docs/package.json:2)
- [Bundled docs index](D:/DogruAdres/node_modules/@mercurjs/docs/llms.txt:1)
- [Mercur mimarisi](D:/DogruAdres/node_modules/@mercurjs/docs/content/learn/architecture.mdx:1), [API auth/scoping sözleşmesi](D:/DogruAdres/node_modules/@mercurjs/docs/content/references/api/conventions.mdx:1)
- [Seller-member modeli](D:/DogruAdres/node_modules/@mercurjs/docs/content/learn/seller-members.mdx:14)
- [Offer fiyat kapsamı](D:/DogruAdres/node_modules/@mercurjs/docs/content/platform/offer/concepts/pricing-and-inventory.mdx:10)
- [Komisyon matching ve tie-break](D:/DogruAdres/node_modules/@mercurjs/docs/content/platform/commission/concepts/rule-matching.mdx:52)

Mercur seller scoping’i Organization-private yetkilendirmesinin kanıtı sayılmadı. Ayrıca seller-member sayfasındaki e-posta açıklamaları, kanonik kişisel kimlik mimarisini kendiliğinden doğrulamaz; uygulamadan önce source/types ile uzlaştırılmalıdır.

## 14. Başlangıç/son Git durumu ve değişiklik teyidi

**VERIFIED —** Başlangıç ve son `git status --porcelain=v1` çıktısı aynı:

```text
?? .vscode/
?? DESIGN.md
```

`git diff --stat` her iki inceleme sonunda değişiklik göstermedi. Bu iki untracked öğe denetim başlamadan önce mevcuttu.

**VERIFIED —** Dosya yazılmadı; belge, kod, bağımlılık, yapılandırma veya şema değiştirilmedi. Build, test, seed, migration, database işlemi, branch/commit veya harici provider/credential erişimi yapılmadı.

**Doküman veya kod yazımına geçilmedi. Sonraki değişiklikler açık ürün-sahibi onayını beklemelidir.**