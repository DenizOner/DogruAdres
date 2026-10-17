# G0 / Step 2 — Gereksinimler ve mimari karar izlenebilirliği

- Rapor tarihi: 2026-10-10.
- Kapsam: D:\DogruAdres; araştırma ve hazırlık. Bu dosya arşivlenmiş araştırmadır.
- Karar kaynağı: bu görevin §3 ürün sahibi karar brifingi. Sohbet üzerinden aktarılan yetkili karar bağlamıdır; önceden repository’de kayıtlıymış gibi gösterilmez.
- Yazma izni: yalnız bu yeni rapor ve research/README.md bağlantı satırı. REQUIREMENTS.md, ADR, plan, uygulama veya diğer governance belgesi oluşturulmaz/değiştirilmez.
- Bütün DA-* ve P01–P09 kimlikleri öneridir; mevcut repository requirement/ADR numarası değildir.
- Uygulama durumu: bu matristeki onay hiçbir özelliğin uygulanmış veya güvenliği runtime’da kanıtlanmış olduğunu göstermez. Testler yalnız gelecekteki kabul testi kavramlarıdır; bu görevde çalıştırılmadı.

## 1. Yönetici değerlendirmesi

[VERIFIED / APPROVED] Mevcut ADR-0001, ADR-0002 ve ADR-0003 Accepted (2026-10-07) durumundadır. Mercur temeli, DoğruAdres otomotiv sahipliği ve extension-first/core değiştirmeme politikası korunur. Hiçbiri yeniden sınıflandırılmaz. Güncel brifing native Basic Accounting yönünü açıkça onaylar; Bigcapital zorunlu bağımlılık değildir. Kanonik kişi, çoklu Organization, Store ayrımı ve merkezi fail-closed güvenlik hedefleri artık sohbet kaynaklı açık karar kanıtına sahiptir.

[VERIFIED / DEFERRED] Kişisel kimlik doğrulama sağlayıcısı seçimi durdurulmuştur. Sağlayıcı, maliyet, implementasyon ve hukuki koşullar belirlenmez. Mantıksal verification state ve erişim gereklilikleri korunur. Gelişmiş sosyal/job erişiminin canlı teslimi bu bağımlılığa bağlıdır; sentetik state’li güvenlik PoC’si sağlayıcı seçimi yerine geçmez.

[RECOMMENDED / PROPOSED] İlk authoritative giriş noktası tek REQUIREMENTS.md; bunun yanında yalnız mimari sınır ve uzun ömürlü teknik seçimler ADR’ye taşınmalıdır. Önce provenance ve ürün kararları onaylanmalı, ardından güvenlik mimarisi ve sınırlı PoC planı ayrı yetkiyle hazırlanmalıdır.

[VERIFIED / OPEN] Araştırma arşivinin tamamı artık okunabilir. Bununla birlikte raporlardaki önerileri topluca onaylayan geçmiş karar dökümü yoktur. A6 sıra/MVP önerisi, DESIGN locale/görsel hükümleri, rounding/FX tipi, 90/30 günlük inactivity ve 500-character limiti otomatik onaylı değildir. TRY settlement nihai payment policy bekler. Bu rapor 15 domain ve teslimat için 92 geçici requirement kaydı içerir.

## 2. Kaynak kapsamı ve kaynak sözlüğü

Aşağıdaki araştırmaların tam içerikleri okundu; sadece adlarına bakılmadı. § referansları dosyanın son araştırma raporundaki numaralı bölümlerdir; conversation/tool export bölümleriyle karıştırılmaz. Her satır kaynağın mevcut olduğuna ilişkin VERIFIED inceleme bulgusudur; içindeki öneriye toplu APPROVED statüsü vermez.

| Kod | Gerçek dosya | İncelenen alan ve sınırlılık |
|---|---|---|
| A1 | [A1](./A1-domain-ownership-and-mercur-integration-boundaries.md) | §§1–13; domain ownership/cardinality, sekiz senaryo, security, approval soruları. Export bazı araç çıktılarını tam içermez; runtime kanıtı değil. |
| A2 | [A2](./A2-platform-core-placement-and-integration-topology.md) | §§1–15; deployment/ownership, sync-async, logs/audit/ledger ve on senaryo. Modüler monolith önerisi kabul edilmiş genel deployment ADR’si değil. |
| A3 | [A3](./A3-bigcapital-basic-accounting-feasibility.md) | §§1–12; Bigcapital alternatifleri, lisans/operasyon/SSO. Kaynak commit tarihi orijinal rapor tarihi değildir; lisans değerlendirmesi hukuki görüş değildir. |
| A3-R | [A3-R](./A3-R-native-basic-accounting-reassessment.md) | §§1–17; native accounting MVP, integrity, concurrency, accountant review. Önceki tam A3’ün o sırada yokluğu tarihsel bulgudur; yazı değiştirilmez. |
| A4 | [A4](./A4-multi-currency-pricing-and-tcmb-exchange-rates.md) | §§1–18; source FX/TRY, history, checkout, refund, TCMB. Tam tarihsel dataset veya canlı EVDS sözleşmesi doğrulanmış değil. |
| A5 | [A5](./A5-canonical-identity-organizations-and-authorization.md) | §§1–18; identity, invitation, scopes, security yüzeyleri ve 16 senaryo. Statik source audit çalışma zamanı exploit veya izolasyon kanıtı değildir. |
| A6 | [A6](./A6-development-roadmap-and-release-sequencing.md) | §§1–17; temeller, kişisel uygulamalar, modül sırası, kabul, docs. Roadmap/release önerisi teslimat taahhüdü değil. |
| A7 | [A7](./A7-ai-byok-and-future-oem-architecture.md) | §§1–17; BYOK/delegation/tools/OEM ve 18 senaryo. Provider contract veya gerçek connector PoC’si yok. |
| G0-1 | [G0 Step 1](./G0-step-1-architecture-decisions-and-documentation-gap-audit.md) | §§1–14; governance gaps, requirement coverage, ADR ve PoC readiness. “Raporlar bulunamadı” o görevin tarihsel evidence sınırıdır. |
| INV | [Inventory](./ARCHIVE-INVENTORY-2026-10-10.md) | Tarihsel kaynak adları, boyutlar, SHA-256, yeniden adlandırma önerisi; değişmez. |
| R-INDEX | [Research index](./README.md) | Purpose, Authority, Lifecycle, Integration. Arşiv approval/implementation kaydı değildir. |

### 2.1 Repository governance

[VERIFIED] Kök AGENTS.md; docs/dogruadres/README.md (Authority and source hierarchy); PRINCIPLES.md §§1–9; ARCHITECTURE.md; SECURITY.md (Mandatory rules, Approval rule); MERCUR-INTEGRATION.md (Preferred integration order, Extension patterns, Adapters, Accepted baseline deviations); UPGRADE-POLICY.md; adr/README.md, üç Accepted ADR ve adr/TEMPLATE.md; plans/README.md ve plans/TEMPLATE.md incelendi. Root DESIGN.md yalnız proposed design reference olarak kullanıldı; accepted policy değildir. REQUIREMENTS.md ve root CODEBASE.md bu incelemede mevcut değildi. Bu eksiklik rapor tarafından giderilmedi.

[VERIFIED / APPROVED] Öncelik açık güncel ürün kararı → root constitution → authoritative docs/Accepted ADR → installed version-matched framework docs → uygulama kanıtıdır. Yeni auth, ödeme, dependency, schema, destructive retention kararı ayrıca onay gerektirir. Şimdiki dar araştırma yazma istisnasını yasaklayan ek zorunlu kural görülmedi; genel implementation onay kapıları yürürlüktedir. Başka task için bu yazma izni varsayılamaz.

### 2.2 Brifing referansları

PO kodları bu raporun izlenebilirlik yardımcılarıdır; mevcut issue/decision ID’si veya kalıcı onay şeması değildir. Numara, görev §3 ilgili alt başlığındaki bullet sırasıdır.

| Kod | Görevin §3 başlığı |
|---|---|
| PO-ID | Identity, Organizations and Security (1–11) |
| PO-VER | Personal Identity Verification — Deferred Provider Decision |
| PO-MEY | Meydan (1–8) |
| PO-JOB | Job Board (1–4) |
| PO-BAD | Verification Badges (1–5) |
| PO-LOY | Platform Loyalty and Representative Eligibility (1–9; 5 önerilen eşikler, 7 kavram ayrımı, 8 açık ayrıntılar, 9 earned geçmişi) |
| PO-MKT | Marketplace and Pricing (1–12) |
| PO-ACC | Basic Accounting (1–8) |
| PO-AI | Future AI and Automotive Integration (1–9; 9 connector implementation yasağı) |
| PO-DOC | Delivery and Documentation (1–8) |

“Preferred”, “proposed”, “subject to confirmation” ifadeleri PROPOSED, bilinmeyen policy OPEN; açık paused seçim DEFERRED olarak ayrıldı. Gelecekte yapılacak bir kabiliyetin ürün hedefi APPROVED olabilir; teslimat zamanı ayrıca ertelenmiş olabilir. APPROVED ile şimdi implementation yetkisi aynı şey değildir.

## 3. Kanıt ve karar durumu modeli

| Boyut | Değer | Kullanım |
|---|---|---|
| Evidence | VERIFIED | Açık kaynak/karar metninde doğrulanan ifade veya belirli sürümde statik kod davranışı. Satırdaki ürün şartı için doğrulanan şey onay metnidir; çalışan ürün değildir. |
| Evidence | INFERRED | Kaynaklardan çıkarılan, doğrudan uçtan uca kanıtlanmayan sonuç. |
| Evidence | RECOMMENDED | Araştırma/tasarım önerisi; implementation veya ürün onayı iddiası yok. |
| Evidence | UNVERIFIED | Gerekli veri, policy veya runtime kanıtı eksik. |
| Decision | APPROVED | Açık current owner brifingi veya Accepted governance dayanağı vardır. |
| Decision | PROPOSED | Onay bekleyen öneri veya tercih. |
| Decision | DEFERRED | Açıkça ertelenen seçim/uygulama. |
| Decision | OPEN | Henüz çözülmeyen soru. |
| Decision | SUPERSEDED | Daha yeni açık karar belirli eski önerinin yerini alır; tarihsel belge silinmez. |

Her requirement’ta iki bağımsız sütun kullanılır. Ayrı implementation metadata önerisi: NOT_ASSESSED, NOT_IMPLEMENTED, PARTIAL, VERIFIED_IMPLEMENTED; yalnız son statü version/commit/test kanıtıyla doldurulmalıdır. Buradaki genel implementation bilgisi NOT_ASSESSED’dir; hedefli statik inceleme tüm repository’de özellik yokluğunu kanıtlamaz.

## 4. Sürüm bağımlı teknik doğrulamalar

Dış service/API çağrısı yapılmadı. A3/A7 dış ürün/SDK/lisans iddiaları tarihsel araştırma olarak korundu; bugünün vendor sözleşmesi diye doğrulanmadı. Framework hakkında yeniden kontrol edilen noktalar kurulu version-matched yerel resmi docs/source/types üzerindendir; internete veya model belleğine dayandırılmaz.

| Kod | Kanıt kaynağı ve kesin hedef | Evidence / karar ilgisi | Sonuç ve sınır |
|---|---|---|---|
| T01 | packages/api/node_modules/@mercurjs/core/package.json; @medusajs/framework/package.json | VERIFIED; mevcut baseline | Mercur 2.3.6 / Medusa 2.21.2. Bu sürüm gelecekte yükseltmede yeniden kontrol edilmeli. |
| T02 | packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/utils/permissions-middleware.js: resolvePermissionsMiddleware, requirePermission; @mercurjs/types/dist/permissions/index.d.ts: IPermissionResolver | VERIFIED statik; P03 PROPOSED entegrasyon | Resolver/actor yokken grantAll ve perms_enforced=false yolu var; enforcement olmayan durumda requirePermission devam ediyor. Resolver error’ının otomatik grant olduğu ileri sürülmez. Actor/surface/seller kontratı tek başına canonical Org/resource authorization değildir. |
| T03 | node_modules/@mercurjs/docs/content/platform/store/concepts/store-entity.mdx; core seller/model kaynağı | VERIFIED statik; farklı source currency + TRY feasibility INFERRED | Seller currency tek alan; Store currency/settlement modeli kaynak Offer currency otoritesi değildir. Aynı Store çok-source-currency hedefi DA source model ve publication adapter ile ayrıştırılabilir önerisi uçtan uca PoC gerektirir. |
| T04 | node_modules/@mercurjs/docs/content/platform/offer/concepts/pricing-and-inventory.mdx; A4 §4 source references | VERIFIED dokümantasyon; P05 PROPOSED | Shared variant PriceSet üzerinde Offer kuralları; inventory Offer’a bağlı. Same-variant multiple Offers cart/refresh ve partial publication uçtan uca kanıtlanmadı. |
| T05 | node_modules/@mercurjs/docs/content/platform/commission/concepts/rule-matching.mdx | VERIFIED docs; P06 OPEN ayrıntılar | Rule matching specificity/winner semantiği bağımsız tüm commission components için otomatik sum kanıtı değildir. Özel provider/adapter policy ve regression gerekir. |
| T06 | node_modules/@mercurjs/docs/content/platform/store/concepts/team.mdx; core seller/member model ve index; A5 §2 | VERIFIED statik; P02 PROPOSED | Member email global unique (aktif kayıt); ilişki Seller M:N. Bazı önceki learn örneklerindeki per-Store uniqueness yorumu ile tutarsızlık gizlenmemeli. Bu actor modeli canonical person/membership yerine otomatik geçirilmez. |
| T07 | packages/api/node_modules/@medusajs/medusa/dist/api/auth/session/route.js: POST, DELETE | VERIFIED statik; P03 OPEN | POST auth_context session’a yazar; DELETE session destroy/cookie clear yapar. Global revoke, backend lock ve password unlock gereksinimlerinin tamamının zaten sağlandığı sonucu çıkmaz. |
| T08 | node_modules/@mercurjs/docs/llms.txt; content/resources/best-practices/modules.mdx, module-links.mdx, workflows.mdx; A2 §6, A3-R §§3,6 | VERIFIED docs; financial atomicity UNVERIFIED | Workflow compensation tek ACID transaction kanıtı değildir; module boundaries/links ve job retry ayrı tasarlanmalı. Accounting atomic posting PoC’si daha sonra gerekir. |
| T09 | node_modules/@mercurjs/docs/content/resources/best-practices/module-links.mdx: Reading vs filtering across a link | VERIFIED docs; P03 scoping OPEN | query.graph linked-module field filtresi scoping kanıtı değildir; filtrelemenin authoritative own-column/adapter tasarımı gerekir. Index Module experimental olarak anlatılır; burada kurulmaz/seçilmez. |

Yerel kaynak incelemesi internal dosyalardan yapılmıştır; bunlara runtime dependency bağlamak veya core patch izni vermek anlamına gelmez. Yerel API modules/links/workflows dizinlerinde README scaffold görüldü; bu gözlem bütün uygulamaların implementasyon envanteri yerine geçmez. Production/credentials veya .env içerikleri incelenmedi.

## 5. Çelişkiler, override’lar ve superseded öneriler

| Konu | Eski kanıt | Güncel karar / durum | Uzlaştırma |
|---|---|---|---|
| Bigcapital yönü | A3 §§1,6 ayrı service için conditional preference | PO-ACC.1,6: native yön APPROVED / VERIFIED | A3’ün mandatory/default platform-accounting seçim adayı olarak yönü SUPERSEDED; teknik/lisans/ops kanıtı tarihsel geçerliliğiyle korunur. A3-R tek başına supersede etmez; override kaynağı current chat kararıdır. |
| Identity provider | A5/G0-1 açık provider güvenlik soruları; başka konuşmadaki olası teknoloji fikirleri yerel onay değil | PO-VER: DEFERRED / VERIFIED | Hiçbir KPS/e-Devlet/kart/selfie/NFC/biyometri seçimi yapılmaz. Logical access requirements devam eder. |
| Research availability | A3-R/A4/A6/A7/G0-1 o sırada full prior report erişimi yok diyordu | Şimdi 9 rapor mevcut: VERIFIED | Tarihsel cümleler değiştirilmez; erişim eksikliği bugün kapanmıştır, approval eksikliği otomatik kapanmaz. |
| Inactivity / Golden | A1/G0-1 farklı activity/performance kavramları ve açık policy | PO-LOY: merkezi service APPROVED; 90/30 OR PROPOSED; detaylar OPEN | Golden/representative ayrı hesap yapmaz; operational inactivity Store kapatmaz, earned finance bozulmaz. |
| Job content | A7 §9 genel “kişisel alan/email read” özeti | PO-JOB.1–2: email index; full content/apply personalverified | Daha dar job detay erişimi brifinge göre geçerlidir; index/snippet üzerinden content leak engellenmeli. Önceki genelleme bu kapsamda SUPERSEDED. |
| Meydan length/name | Suggested 500 karakter ve farklı olası module names | PO-MEY.8: exact approval yok | PROPOSED/OPEN; mevcut immutable requirement diye taşınmaz. |
| TRY/FX | A4 §11 rounding, rate type, stale, markup önerileri | PO-MKT.6–7 tercih; payment confirmation bekliyor | Source/FX ownership APPROVED; publication/settlement seçimleri PROPOSED, parametreler OPEN. |
| DESIGN zorunluluk dili | DESIGN §§16–17 locales/accessibility “must” ifadeleri | Belge genel Proposed; PO-DOC.3 functional brief first | Başlık içindeki must tek başına Accepted policy yapmaz; locale/RTL/WCAG owner onayı gerekir. |
| compose.dev.yml sınıfı | MERCUR-INTEGRATION Accepted baseline deviations altında temporary | PRINCIPLES §4 infrastructure, not temporary patch | VERIFIED governance sınıflandırma çelişkisi OPEN; ayrı yetkiyle düzeltilecek. Yeni framework kusuru veya customization icat edilmez. |
| Modüler monolith | A2 selective hybrid ve A7 iç-backend AI tercihi | Native accounting shared PG yönü onaylı; bütün deployment kararı değil | P01 kapsamlı boundary/deployment kararını gerektirir; tüm modüllerin aynı process/DB olduğu onaylanmış varsayılmaz. |
| Framework permission | T02 fallback grant | PO-ID.7 fail closed APPROVED | Ürün policy ile baseline davranışı farklı; P03 adapter/resolver ve bypass coverage kanıtı gerekir. Uygulanmış güvenlik denmez. |
| Roadmap/ilk release | A6 §§5–6 modül sırası ve complete marketplace önerisi | PO-DOC small reviewed slices APPROVED | Sıra, süre, MVP listesi PROPOSED; owner feature brief/kabul kapısı belirleyicidir. |

## 6. Tam domain kapsamı ve izlenebilirlik matrisi

Aşağıdaki her kayıt geçici ID, domain, precise requirement, kaynak/§, chat referansı, iki statü, ADR, bağımlılık, acceptance kavramı, açık soru ve proposed authoritative destination içerir. “Yok” approval kanıtı olmadığını belirtir; şartı kabul edilmiş gibi göstermez. P* kayıtları §8’de önerilen ADR konularıdır. Requirements destination, bugün yaratılacak dosya değildir. Önceden accepted mimari kararlar kendi ADR’lerinde kalır.

### 6.1. Kimlik ve kişisel alan

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-ID-001 | Bir gerçek kişi için tek kanonik DoğruAdres kimliği; framework actor bağlantıları bu kimliği temsil eder. | A5 §4; A1 §4 | PO-ID.1 | APPROVED | VERIFIED | P02 | Actor eşleme | Aynı kişi iki Organization’da aynı person ID ile görülür. | Birleştirme, kurtarma ve hesap eşleme protokolü? | REQUIREMENTS.md §Kimlik ve kişisel alan |
| DA-ID-002 | Kişisel alan Organization bağlamından bağımsızdır; Organization değişimi kişisel kaynakları yeniden sahiplenmez. | A5 §§4–5; A6 §4 | PO-ID.4; PO-MEY.1 | APPROVED | VERIFIED | P02 | DA-ID-001 | Org değiştirildiğinde kişisel sahiplik sabit kalır. | Kişisel uygulama listesi ve varsayılan alan? | REQUIREMENTS.md §Kimlik ve kişisel alan |
| DA-ID-003 | E-posta doğrulaması ve kişisel kimlik doğrulaması ayrı mantıksal durumlar olarak değerlendirilir. | A5 §6; G0-1 §4 | PO-ID.6; PO-VER | APPROVED | VERIFIED | P02/P03 | Doğrulama state modeli | E-posta doğrulama sosyal yazma izni vermez. | Durum iptali, süresi ve yeniden doğrulama? | REQUIREMENTS.md §Kimlik ve kişisel alan |
| DA-ID-004 | Kişisel doğrulama sağlayıcısı, teknoloji, maliyet ve hukuki veri işleme seçimi ertelenmiştir; erişim şartı korunur. | G0-1 §§6,10; A5 §15 | PO-VER | DEFERRED | VERIFIED | P02/P03; sağlayıcı ADR’si sonra | DA-ID-003 | Sahte PoC state’i gerçek kimlik doğrulama diye sunulmaz. | KPS/e-Devlet/kart/selfie/NFC/biyometri seçilmeyecek. | REQUIREMENTS.md §Kimlik ve kişisel alan |
| DA-ID-005 | Standard Verified yalnız başarılı kişisel doğrulamayla; Golden Verified ayrıca uygun aktif Organization’da protected Owner olmayı gerektirir. | G0-1 §4; A5 §15 | PO-BAD.1–2 | APPROVED | VERIFIED | P02/P04 | DA-ID-003; DA-LOY-001 | Üyelik veya email tek başına rozet oluşturmaz. | Golden uygunluk eşiği ve değerlendirme dönemi? | REQUIREMENTS.md §Kimlik ve kişisel alan |
| DA-ID-006 | Rozetler dinamiktir; iş yetkisi sağlamaz; gerçek durum geçişleri bildirim üretir. | G0-1 §4; A6 §3 | PO-BAD.3–4 | APPROVED | VERIFIED | P03/P04 | DA-ID-005; DA-APP-005 | Tek geçişte tek bildirim; rozetle privilege escalation olmaz. | Dedup anahtarı ve görünürlük? | REQUIREMENTS.md §Kimlik ve kişisel alan |

### 6.2. Organizations, Stores, şubeler ve üyelik

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-ORG-001 | Bir kişi birden çok legal Organization’da bağımsız üyelik ve roller taşıyabilir. | A1 §§4–5; A5 §§4–7 | PO-ID.2 | APPROVED | VERIFIED | P02 | DA-ID-001 | Org A rolü Org B erişimi sağlamaz. | Birden çok Owner ve temsil yetkisi matrisi? | REQUIREMENTS.md §Organizations, Stores, şubeler ve üyelik |
| DA-ORG-002 | Organization, marketplace Seller/Store’dan ayrıdır; bir Organization birden çok ayrı onaylanan Store’a sahip olabilir. | A1 §§4–5; A5 §3 | PO-ID.3; PO-MKT.2 | APPROVED | VERIFIED | P01/P02; ADR-0001 | Organization–Seller link | Bir Store onayı diğer Store’u otomatik onaylamaz. | Onay ve mülkiyet devri yaşam döngüsü? | REQUIREMENTS.md §Organizations, Stores, şubeler ve üyelik |
| DA-ORG-003 | Üyelik davet temellidir; alıcı kimliği ve yetki kapsamı sunucuda doğrulanmalıdır. | A5 §6 | PO-ID.5 | APPROVED | VERIFIED | P02/P03 | DA-ID-003 | Yanlış alıcı, replay, expired token kabul edilmez. | TTL, tek kullanımlılık, iptal ve email değişimi politikası? | REQUIREMENTS.md §Organizations, Stores, şubeler ve üyelik |
| DA-ORG-004 | Protected Owner yetkisi ve son Owner’ın kaybını önleyen devretme/kurtarma yöntemi tasarlanmalıdır. | A5 §§7,12,15 | PO-BAD.2 yalnız protected Owner kavramını onaylar | PROPOSED | RECOMMENDED | P02/P03 | DA-ORG-001 | Son Owner sıradan rol düzenlemesiyle kaldırılamaz. | Owner sayısı, transfer onayı ve acil kurtarma? | REQUIREMENTS.md §Organizations, Stores, şubeler ve üyelik |
| DA-ORG-005 | Personal, Organization, Store, branch ve platform-workspace izinleri örtük birleşmez. | A5 §§5,7–8 | PO-ID.4 | APPROVED | VERIFIED | P03 | DA-ORG-001–002 | Org admin rolü ayrı Store/branch/platform yetkisine dönüşmez. | Branch kapsamı ve inheritance kuralları? | REQUIREMENTS.md §Organizations, Stores, şubeler ve üyelik |
| DA-ORG-006 | Şubelerin Organization sahipliği ve stok/işlem erişim kapsamı ayrı tanımlanmalıdır. | A1 §§4–5; A5 §5 | PO-ID.4 kapsam ayrımını onaylar | PROPOSED | RECOMMENDED | P01/P03 | DA-ORG-005 | Başka şubenin stok/işlemi kapsam dışıysa reddedilir. | Şube finansal bağımsızlığı ve paylaşım? | REQUIREMENTS.md §Organizations, Stores, şubeler ve üyelik |
| DA-ORG-007 | Legal Organization doğrulaması ile kişi doğrulaması ve Store approval ayrı state’ler olmalıdır. | A1 §§4–5; A5 §4 | PO-ID.3,6; PO-VER | PROPOSED | RECOMMENDED | P02 | DA-ID-003; DA-ORG-002 | Bir state değişimi diğerlerini otomatik doğrulamaz. | Legal verification verisi, sahibi ve sağlayıcısı? | REQUIREMENTS.md §Organizations, Stores, şubeler ve üyelik |

### 6.3. Yetkilendirme, dosyalar, oturumlar ve denetim

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-SEC-001 | Merkezi yetkilendirme fail closed çalışır; eksik principal, context, policy veya resolver izin vermez. | A5 §§5,8; yerel T02 | PO-ID.7 | APPROVED | VERIFIED | P03 | P01/P02 | Eksik/bozuk resolver, Org mismatch ve policy hatasında erişim yok. | Provider seçimi ve middleware bypass kapatılması? | REQUIREMENTS.md §Yetkilendirme, dosyalar, oturumlar ve denetim |
| DA-SEC-002 | API, workflow, job, file, export ve search sunucu tarafında aynı kapsam kurallarıyla korunur. | A5 §8; SECURITY Mandatory rules | PO-ID.8 | APPROVED | VERIFIED | P03 | DA-SEC-001 | Her erişim yüzeyinde iki Org arasında negatif izolasyon testi. | Public/protected route envanteri ve background principal? | REQUIREMENTS.md §Yetkilendirme, dosyalar, oturumlar ve denetim |
| DA-SEC-003 | Actor→person→membership→app→resource zinciri her istekte güvenilir bağlamdan çözülür; istemci org_id tek başına yeterli değildir. | A5 §§4–5,8 | PO-ID.4,7–8 | PROPOSED | RECOMMENDED | P03 | DA-ID-001; DA-ORG-001 | Sahte org_id ve çoklu sekme context karışması reddedilir. | Context taşıma, version ve cache invalidation modeli? | REQUIREMENTS.md §Yetkilendirme, dosyalar, oturumlar ve denetim |
| DA-SEC-004 | Ortak header’da tek tık session lock; password session unlock’ta password reauthentication ve gerçek backend etkisi zorunludur. | A6 §3; G0-1 §§4,6 | PO-ID.9–11 | APPROVED | VERIFIED | P03 | Session state | Overlay kapatmak API erişimini geri getirmez; unlock yanlış parola ile olmaz. | Lock tek session mı tüm cihazlar mı; revoke kapsamı? | REQUIREMENTS.md §Yetkilendirme, dosyalar, oturumlar ve denetim |
| DA-SEC-005 | Üyelik/rol/app revoke, aktif session ve bekleyen job/export/search/file erişimlerine etkili olmalıdır. | A5 §§8,12; A7 §8 | PO-ID.8,11 | APPROVED | VERIFIED | P03 | DA-SEC-001–004 | Revoke sonrası eski token, job ve download tekrar yetki kazanmaz. | İzin verilen gecikme ve job iptal/yeniden kontrol noktaları? | REQUIREMENTS.md §Yetkilendirme, dosyalar, oturumlar ve denetim |
| DA-SEC-006 | Özel dosyalar açık kalıcı URL ile yetkiyi atlamamalı; arama/export/cache yan kanalları kapsam filtrelemelidir. | A5 §8; A1 §8 | PO-ID.8 | APPROVED | VERIFIED | P03 | DA-SEC-002,005 | Revoked veya diğer Org kullanıcısı dosya/indeks/cache ile veri alamaz. | Signed URL süresi, indirme proxy’si ve cache partition? | REQUIREMENTS.md §Yetkilendirme, dosyalar, oturumlar ve denetim |
| DA-SEC-007 | Audit, uygulama log’u ve finansal ledger farklı amaçlarla tutulmalı; hassas alanlar log’a girmemelidir. | A2 §8; A5 §8; SECURITY | PO-ID.8; doğrudan ayrıntı onayı yok | PROPOSED | RECOMMENDED | P03/P06 | Audit event modeli | Actor/context/karar izi var; token/key/password log’da yok. | Saklama süresi, audit okuyucu ve tamper resistance? | REQUIREMENTS.md §Yetkilendirme, dosyalar, oturumlar ve denetim |
| DA-SEC-008 | Platform operatörü Organization özel verisine otomatik erişmez; support/break-glass açık politika gerektirir. | A5 §§5,8,15 | PO-ID.4 | APPROVED | VERIFIED | P03 | DA-ORG-005 | Platform workspace rolü özel Org kayıtlarını açmaz. | Emergency access kapsamı, onay ve audit? | REQUIREMENTS.md §Yetkilendirme, dosyalar, oturumlar ve denetim |

### 6.4. Uygulamalar, launcher ve bildirimler

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-APP-001 | App entitlement, user permission ve launcher tercihi farklı kavramlar olarak tutulmalıdır. | A1 §§4,7; A5 §7 | PO-ID.4; PO-LOY.2 | PROPOSED | RECOMMENDED | P04 | DA-SEC-001; P01 | Launcher’dan gizlemek yetkiyi iptal etmiş gibi sayılmaz. | Mandatory app listesi ve lisans/entitlement sahibi? | REQUIREMENTS.md §Uygulamalar, launcher ve bildirimler |
| DA-APP-002 | Zorunlu, opsiyonel ve sektör önerisi uygulamalar ayrılmalı; sektör değişimi aktif uygulamaları sessizce kapatmamalıdır. | A1 §7; A6 §3 | Yok | PROPOSED | RECOMMENDED | P04 | DA-APP-001 | Sektör değişimi mevcut veriyi veya entitlement’ı silmez. | Zorunlu uygulamalar ve sektör onboarding? | REQUIREMENTS.md §Uygulamalar, launcher ve bildirimler |
| DA-APP-003 | App disable/uninstall tarihsel veriyi silmez; tarihsel okuma/restore ve bağımlı uygulama davranışı onaylanmalıdır. | A1 §7; A5 §7; A3-R §9 | PO-ACC.5 checkout bağımsızlığı | PROPOSED | RECOMMENDED | P04 | DA-DATA-001; app lifecycle | Accounting kapalıyken checkout sürer; tarihsel veri kaybolmaz. | Read-only geçmiş ve export izinleri? | REQUIREMENTS.md §Uygulamalar, launcher ve bildirimler |
| DA-APP-004 | Ortak header notification bell içerir; bildirim teslimi domain state’inden bağımsız navigasyon öğesidir. | A6 §3 | PO-ID.9 | APPROVED | VERIFIED | P04; UI için ayrı ADR gerekmez | Notification kaynakları | Yetkili kullanıcının bildirimleri header’dan açılır. | Read/unread, kanallar, retention ve preferences? | REQUIREMENTS.md §Uygulamalar, launcher ve bildirimler |
| DA-APP-005 | Rozet dahil domain geçiş bildirimleri tekrar denemelerde çoğalmamalı; backend event doğruluğu korunmalıdır. | A2 §§6–8; G0-1 §4 | PO-BAD.4 | PROPOSED | RECOMMENDED | P04 | DA-ID-006 | Aynı badge transition tekrar işlendiğinde duplicate bildirim yok. | Outbox gerekli mi; delivery/retry semantiği? | REQUIREMENTS.md §Uygulamalar, launcher ve bildirimler |
| DA-APP-006 | Functional app brief final Stitch ekran tasarımından önce gelir; DESIGN.md taslak referanstır. | A6 §§10–11; DESIGN §§19–22 | PO-DOC.3 | APPROVED | VERIFIED | ADR gerekmez | Domain requirements/acceptance | Ekran onayı eksik iş kuralı onayı yerine geçmez. | App brief ve görsel onay şablonu? | REQUIREMENTS.md §Uygulamalar, launcher ve bildirimler |
| DA-APP-007 | Geliştirme küçük, ayrı incelenen dilimlerle ilerler; kabul standardı tamamlanmadan başka ana modüle geçilmez. | A6 §§7–10; plans/README When a plan is required | PO-DOC.1–2 | APPROVED | VERIFIED | ADR gerekmez; plans/TEMPLATE.md | Her dilimin scope/acceptance onayı | Slice acceptance checklist kapanmadan sonraki ana modül başlamaz. | Agreed acceptance standard’ın kesin checklist’i? | REQUIREMENTS.md §Teslimat ve kabul |

### 6.5. Products, Brands, Contacts ve Inventory

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-CAT-001 | Global Product/Brand/normalize MPN ile Organization’ın private product master/cost/notes ayrı sahiplikte tutulmalıdır. | A1 §4,7; A5 §3 | PO-AI.5 bağımsızlık; ayrıntı onayı yok | PROPOSED | RECOMMENDED | P01; ADR-0002 | DA-ORG-001; DA-SEC-006 | Private maliyet/tedarikçi alanı public catalog’a sızmaz. | Brand tekilleştirme ve normalization kuralları? | REQUIREMENTS.md §Products, Brands, Contacts ve Inventory |
| DA-CAT-002 | Private ürünün canonical product bağlantısı yeniden eşlenebilir olmalı; satış/tarihsel kaydın anlamı korunmalıdır. | A1 §§4,7 | Yok | PROPOSED | RECOMMENDED | P01 | DA-CAT-001; DA-DATA-002 | Re-link eski finansal snapshot’ı değiştirmez. | Merge/unmerge ve duplicate ürün sorumlusu? | REQUIREMENTS.md §Products, Brands, Contacts ve Inventory |
| DA-CAT-003 | Contacts Organization-private kalmalı; platform kişisi/customer/seller ile otomatik aynı kimlik sayılmamalıdır. | A1 §4; A3-R §5 | Yok | PROPOSED | RECOMMENDED | P01/P07 | DA-SEC-002 | Org A contact’ı Org B’ye ya da publicprofile’a açılmaz. | CRM/accounting contact canonical sahibi? | REQUIREMENTS.md §Products, Brands, Contacts ve Inventory |
| DA-CAT-004 | Mercur Offer inventory ile private Inventory ayrılmalı; Offer reservation/availability ile özel stok projeksiyonu kontrollü bağlanmalıdır. | A1 §§4,6; yerel T04 | PO-AI.5 bağımsız uygulamalar | PROPOSED | RECOMMENDED | P01; ADR-0001/2 | Offer inventory; DA-ORG-006 | Stok değişimi yanlış Store/branch’e taşınmaz. | Stok authoritative sahibi, birim ve rezervasyon politikası? | REQUIREMENTS.md §Products, Brands, Contacts ve Inventory |
| DA-CAT-005 | Products, Inventory ve Quotations AI/OEM olmadan kullanılabilir kalır. | A7 §§7,10 | PO-AI.5 | APPROVED | VERIFIED | P08; ADR-0002 | Private ürün/stok modeli | Provider kapalıyken manuel ürün ve quotation akışı sürer. | AI önerisini elle düzenleme ve canonical merge? | REQUIREMENTS.md §Products, Brands, Contacts ve Inventory |

### 6.6. Marketplace ve çoklu para fiyatlama

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-MKT-001 | Mercur marketplace temeli korunur; sadece kanıtlanmış uyumsuzluk yeniden değerlendirme nedeni olabilir. | A4 §16; ADR-0001/3 | PO-MKT.1 | APPROVED | VERIFIED | ADR-0001/3 | Framework extension ilkesi | Uyumsuzluk iddiası sürüm-kaynak ve alternatif kanıtı içerir. | Core patch/fork için ayrıca onay gerekir. | REQUIREMENTS.md §Marketplace ve çoklu para fiyatlama |
| DA-MKT-002 | Aynı Store farklı kaynak para birimli Offers listeleyebilir; kaynak fiyat ve FX provenance DoğruAdres’e aittir. | A4 §§3,5–7 | PO-MKT.4–5 | APPROVED | VERIFIED | P05 | DA-ORG-002; price ownership | USD ve EUR kaynak Offers aynı Store’da provenance kaybetmez. | Kur/fiyat kaynak alanlarının son schema’sı? | REQUIREMENTS.md §Marketplace ve çoklu para fiyatlama |
| DA-MKT-003 | Kontrollü sürümlü TRY price publication tercihidir; source currency ile marketplace settlement ayrı katmanlardır. | A4 §§6–7,12; yerel T03/04 | PO-MKT.6 | PROPOSED | RECOMMENDED | P05 | DA-MKT-002 | Publication version partial refresh/rollback görünürlüğünü tanımlar. | Offer başına mı global batch mi atomik görünürlük? | REQUIREMENTS.md §Marketplace ve çoklu para fiyatlama |
| DA-MKT-004 | TCMB tarihsel gözlem başlangıcı 2005-01-01’dir; önceki gözlemler import edilmez. | A4 §§8–10 | PO-MKT.8 | APPROVED | VERIFIED | P05 | FX provenance | 2004 observation ingestion reddedilir. | Eksik gün/para birimi politikası; veri contract’ı? | REQUIREMENTS.md §Marketplace ve çoklu para fiyatlama |
| DA-MKT-005 | Kur provenance observation/revision/publication zamanlarını, unit dönüşümünü ve kullanılan kaynağı korumalıdır. | A4 §§8–10 | PO-MKT.5 | PROPOSED | RECOMMENDED | P05 | DA-MKT-004 | 100 birimlik kotasyon ve revize gözlem karışmaz. | Weekend fallback, sonradan revision ve holiday semantiği? | REQUIREMENTS.md §Marketplace ve çoklu para fiyatlama |
| DA-MKT-006 | Seller repricing ve FX kaynaklı fiyat değişimi history’de ayırt edilir. | A4 §14 | PO-MKT.9 | APPROVED | VERIFIED | P05 | DA-MKT-002,005 | Aynı final TRY değişimi doğru neden ve sourceversion taşır. | Grafik aralığı ve history retention? | REQUIREMENTS.md §Marketplace ve çoklu para fiyatlama |
| DA-MKT-007 | Cart fiyat değişimi ödeme öncesi kullanıcıya açıklanır ve kabul ettirilir; checkout race kontrol edilir. | A4 §13 | PO-MKT.10 | APPROVED | VERIFIED | P05/P06 | Quote/price version | Eski onay veya değişen amount ile payment tamamlanmaz. | Quote TTL ve requote/acceptance sözleşmesi? | REQUIREMENTS.md §Marketplace ve çoklu para fiyatlama |
| DA-MKT-008 | Tamamlanan işlem orijinal fiyat, kur ve finansal snapshot’ını korur. | A4 §§13–15 | PO-MKT.11 | APPROVED | VERIFIED | P05/P06 | DA-MKT-006–007 | Yeni kur ve repricing tamamlanmış transaction’ı değiştirmez. | Snapshot kapsamı, hash/version ve correction? | REQUIREMENTS.md §Marketplace ve çoklu para fiyatlama |
| DA-MKT-009 | Buyer Organization kısıtları server’da uygulanır; Organization-attributed checkout ayrıntısı ayrıca netleştirilir. | A1 §7; A4 §13 | PO-MKT.12 | APPROVED | VERIFIED | P03/P06 | DA-SEC-002; buyer context | Blocked Org farklı cart/API yolundan ödeme yapamaz. | Personal buyer mümkün mü; Org seçimi hangi noktada zorunlu? | REQUIREMENTS.md §Marketplace ve çoklu para fiyatlama |
| DA-MKT-010 | Döviz satış kuru, half-up iki hane, source precision, markup ve stale eşiği henüz onaylı değildir. | A4 §11 | Yok | OPEN | UNVERIFIED | P05 | DA-MKT-003,005 | Seçilen hesaplama golden örnek ve edge case ile doğrulanır. | Kur türü, rounding, stale1period, markup ve uygun fiyat algoritması? | REQUIREMENTS.md §Marketplace ve çoklu para fiyatlama |

### 6.7. Settlement ve komisyonlar

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-FIN-001 | Store bazlı statement, finansal scope ve payout bağımsız kalır; aynı legal Organization birleşmeye gerekçe değildir. | A1 §§4–5; A4 §15 | PO-MKT.3 | APPROVED | VERIFIED | P06 | DA-ORG-002 | Bir Org’ın iki Store bakiyesi/payout’u birbirine karışmaz. | Bank beneficiary ve konsolidasyon raporu? | REQUIREMENTS.md §Settlement ve komisyonlar |
| DA-FIN-002 | İlk marketplace settlement TRY tercihidir; nihai payment policy onayı beklenir. | A4 §§7,15 | PO-MKT.7 | PROPOSED | RECOMMENDED | P06 | DA-MKT-003; provider policy | Payment/order/payout currency kabul edilen politika ile tutarlı olur. | Currency, refund, payout ve ücret politikası onayı? | REQUIREMENTS.md §Settlement ve komisyonlar |
| DA-FIN-003 | Bağımsız komisyon bileşenleri ayrı hesaplanır ve snapshot’ta izlenir; core’ın tek rule winner’ı bunları otomatik çözmez. | A1 §7; A4 §15; yerel T05 | PO-MKT.12 | APPROVED | VERIFIED | P06 | Rule provider; DA-MKT-008 | İki bileşen net tutara doğru yansır ve ayrı açıklanır. | Base/tax/discount/shipping/rounding/payee bileşen tanımları? | REQUIREMENTS.md §Settlement ve komisyonlar |
| DA-FIN-004 | Refund, partial refund ve payout reversal tarihsel mali bağlamla tasarlanmalıdır; yeni FX ile yeniden değerleme varsayılmaz. | A4 §15; A3-R §9 | PO-MKT.11 | PROPOSED | RECOMMENDED | P06 | DA-FIN-001–003 | Refund yeni kurdan geçmiş işlem tutarı üretmez. | İade oranı, fee geri alma ve rounding artığı? | REQUIREMENTS.md §Settlement ve komisyonlar |
| DA-FIN-005 | Earned financial entitlement gelecekteki inactivity veya loyalty policy değişimiyle geriye dönük değiştirilmez. | A1 §7; A2 §7 | PO-LOY.9 | APPROVED | VERIFIED | P06/P04 | DA-LOY-004; ledger | Yeni policy geçmiş kazanılmış komisyonu azaltmaz. | Earned/vested/payable/disputed tanımları? | REQUIREMENTS.md §Settlement ve komisyonlar |
| DA-FIN-006 | Commerce operational state, commission ledger ve optional accounting farklı truth’lar olarak reconcile edilmelidir. | A2 §§6–8; A3-R §8 | PO-ACC.5; PO-LOY.9 | PROPOSED | RECOMMENDED | P06/P07 | Idempotent event+reconciliation | Retry finansal duplicate yaratmaz; projection farkı görünür olur. | Event contract, retry/outbox ve reconcile sahibi? | REQUIREMENTS.md §Settlement ve komisyonlar |

### 6.8. Basic Accounting

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-ACC-001 | Native DoğruAdres Basic Accounting geliştirme yönü onaylı; Bigcapital zorunlu platform dependency değildir. | A3 §§1,6; A3-R §§13–14 | PO-ACC.1,6 | APPROVED | VERIFIED | P07 | ADR-0001/3; kapsam kararı | Marketplace Bigcapital olmadan işler. | Onaylı yönün MVP kapsamı ve finansal test planı? | REQUIREMENTS.md §Basic Accounting |
| DA-ACC-002 | Başlangıç yönü TypeScript, aynı PostgreSQL deployment ve supported Medusa module architecture; final schema değil. | A3-R §§3,7 | PO-ACC.2 | APPROVED | VERIFIED | P07/P01 | Medusa module boundary | Tenant ve transaction isolation önerisi PoC’de kanıtlanır. | Row/shared schema, RLS, transaction ve migration sınırı? | REQUIREMENTS.md §Basic Accounting |
| DA-ACC-003 | Kapsam Basic Accounting’dir; statutory muhasebe/ERP uyumluluk iddiası veya payroll/stock-costing varsayımı yapılmaz. | A3-R §§5,12 | PO-ACC.3,8 | APPROVED | VERIFIED | P07 | Functional app brief | MVP açıklaması e-defter/e-fatura yasal uyum diye sunulmaz. | Nihai iş akışları, opening balance ve mali müşavir değerlendirmesi? | REQUIREMENTS.md §Basic Accounting |
| DA-ACC-004 | Double-entry balance, idempotency, immutable posted records ve güvenli correction zorunlu tasarım hedefleridir. | A3-R §6 | PO-ACC.4 | APPROVED | VERIFIED | P07 | Atomic posting; decimal amount | Concurrent retry tek balanced posting; posted mutation reddedilir. | Atomicity, lock, reversal ve correction yetki standardı? | REQUIREMENTS.md §Basic Accounting |
| DA-ACC-005 | Marketplace checkout optional Basic Accounting app’ına bağlı olmaz. | A2 §7; A3-R §8 | PO-ACC.5 | APPROVED | VERIFIED | P07/P04 | DA-FIN-006 | Accounting disable veya outage checkout’u kesmez. | Projection failure’da backfill/reconcile? | REQUIREMENTS.md §Basic Accounting |
| DA-ACC-006 | Contacts, AR/AP belgeleri, cash/bank, partial allocations, FX ve export MVP adaylarıdır; kesin liste onaylı değildir. | A3-R §§5,9 | Yok | PROPOSED | RECOMMENDED | P07 | DA-ACC-003–004 | Onaylı coverage matrisi her candidate workflow’ü sınar. | Invoice/receipt/cash ledger scope ve multi-currency? | REQUIREMENTS.md §Basic Accounting |
| DA-ACC-007 | Ayrıntılı iş mantığından önce yerli ürün/workflow araştırması, anlaşılır alternatifler ve accountant review gerekir. | A3-R §12 | PO-ACC.7 | APPROVED | VERIFIED | P07; plan gate | Domain-specific research | İş politikası sahibinin ve accountant’ın inceleme izi bulunur. | Reviewer, ölçüt ve araştırma kapsamı; bugün seçim yapılmaz. | REQUIREMENTS.md §Basic Accounting |

### 6.9. Loyalty, Kumbara ve temsilcilik

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-LOY-001 | Platform Loyalty Management ortak Organization activity/eligibility state’inin sahibidir ve optional Org loyalty app’ından bağımsızdır. | A1 §7; G0-1 §4 | PO-LOY.1–2,4 | APPROVED | VERIFIED | P01/P04 | DA-ORG-001; policy engine | Org loyalty disable merkezi eligibility hesabını durdurmaz. | Merkezi service/module sınırı ve policy version? | REQUIREMENTS.md §Loyalty, Kumbara ve temsilcilik |
| DA-LOY-002 | Representatives ve Golden Verified merkezi eligibility state’ini tüketir; kendi alternatif inactivity hesabını üretmez. | G0-1 §4; A1 §7 | PO-LOY.3 | APPROVED | VERIFIED | P04 | DA-LOY-001; DA-ID-005 | Aynı version için consumers aynı eligible sonucu kullanır. | Evaluation trigger ve propagation latency? | REQUIREMENTS.md §Loyalty, Kumbara ve temsilcilik |
| DA-LOY-003 | 90 gün qualifying purchase yok VEYA 30 gün human Org-workspace activity yok inactivity önerisidir. | Bu görev brifingi; A1 §10 eşikleri çözmez | PO-LOY.5 | PROPOSED | RECOMMENDED | P04; eşikler requirements | DA-LOY-001 | İki ayrı clock ve OR sınır örnekleri owner onayından sonra sınanır. | Qualifying event, timezone, reset, bot exclusion, onboarding grace? | REQUIREMENTS.md §Loyalty, Kumbara ve temsilcilik |
| DA-LOY-004 | Inactive Organization otomatik suspend edilmez, Stores kapanmaz. | G0-1 §4; A1 §7 | PO-LOY.6 | APPROVED | VERIFIED | P04 | DA-LOY-001–003 | Inactivity transition Store approval/operational state’i değiştirmez. | Başka bağımsız suspension nedenleri ve yetkisi? | REQUIREMENTS.md §Loyalty, Kumbara ve temsilcilik |
| DA-LOY-005 | Operational inactivity, purchase performance, rep transfer ve earned entitlement ayrı politika kavramlarıdır. | A1 §7; A2 §7 | PO-LOY.7,9 | APPROVED | VERIFIED | P04/P06 | DA-LOY-001; DA-FIN-005 | Inactivity geçmiş komisyonu veya transfer yetkisini doğrudan değiştirmez. | Her state transition ve policy effective date? | REQUIREMENTS.md §Loyalty, Kumbara ve temsilcilik |
| DA-LOY-006 | Representative transfer önerisi gerekçe/evidence ve Org/platform onayıyla izlenebilir case olarak ele alınmalıdır. | A1 §7; A2 §7 | PO-LOY.7 yalnız ayrımı onaylar | PROPOSED | RECOMMENDED | P04 | DA-LOY-005; authorization | Eski/yeni temsilci ve onay izi; earned geçmiş korunur. | Eligible taraflar, uyuşmazlık ve transfer tarihi? | REQUIREMENTS.md §Loyalty, Kumbara ve temsilcilik |
| DA-LOY-007 | Kumbara/promotional balance ile gerçek komisyon/financial entitlement ayrılmalıdır. | A1 §7; A2 §§7–8 | PO-LOY.7,9 kapsam ayrımı | PROPOSED | RECOMMENDED | P04/P06 | DA-FIN-005 | Promo credit gerçek payable komisyon diye raporlanmaz. | Funding, redemption, expiry, tax ve retention? | REQUIREMENTS.md §Loyalty, Kumbara ve temsilcilik |
| DA-LOY-008 | Purchase-performance ölçütü ve Golden threshold/evaluation dönemleri domain onayı bekler. | A1 §§7,10; G0-1 §4 | PO-BAD.5; PO-LOY.7 | OPEN | UNVERIFIED | P04 | DA-LOY-001; DA-ID-005 | Tax/shipping/refund netleme ve dönem örnekleri onaylanır. | Hedef tutar, rolling period, exceptions ve forfeiture? | REQUIREMENTS.md §Loyalty, Kumbara ve temsilcilik |

### 6.10. Meydan ve Product Reviews

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-SOC-001 | Meydan platform-wide kişisel uygulamadır; Organization’a ait değildir. | A6 §4; G0-1 §4 | PO-MEY.1 | APPROVED | VERIFIED | P01/P04 | DA-ID-002 | Org app disable kişisel Meydan sahipliğini değiştirmez. | Ürün/module adı henüz kesin değil. | REQUIREMENTS.md §Meydan ve Product Reviews |
| DA-SOC-002 | Email-verified kullanıcı okuyabilir; kişisel doğrulama yokken author name masked ve profile açılamaz. | G0-1 §4; A7 §9 | PO-MEY.2–3 | APPROVED | VERIFIED | P03/P04 | DA-ID-003; DA-SEC-006 | API/search/export/preview author kimliğini sızdırmaz. | Mask, anonim ayrım ve indirect identifiers? | REQUIREMENTS.md §Meydan ve Product Reviews |
| DA-SOC-003 | Posting/comment/like/follow ve normal sosyal etkileşim için kişisel doğrulama gerekir. | G0-1 §4; A6 §4 | PO-MEY.4 | APPROVED | VERIFIED | P03 | DA-ID-003 | Sadece emailverified actor tüm write endpoints’te reddedilir. | Verification revoke sonrası içerik ve follower state? | REQUIREMENTS.md §Meydan ve Product Reviews |
| DA-SOC-004 | Product Review isteğe bağlı Meydan cross-post olabilir; moderation, visibility, source link ve lifecycle tutarlıdır. | A1 §4; G0-1 §4 | PO-MEY.5–6 | APPROVED | VERIFIED | P04; content lifecycle ADR gerekirse | Review owner; DA-DATA-001 | Review edit/delete/moderation iki görünümde policy’ye uygun yansır. | Canonical content sahibi, cascade vs tombstone ve source inaccessible? | REQUIREMENTS.md §Meydan ve Product Reviews |
| DA-SOC-005 | Media uploads ve uygun moderation planlıdır; policy ve file ownership daha sonra onaylanır. | G0-1 §4; A5 §8 | PO-MEY.7 | APPROVED | VERIFIED | P03; content ADR koşullu | DA-SEC-006 | Yetkisiz media okuma/yazma ve kaldırılmış içerik sızıntısı yok. | Tür/boyut, moderation appeal, illegal content ve retention? | REQUIREMENTS.md §Meydan ve Product Reviews |
| DA-SOC-006 | İlk 500-character limiti ve son module naming kesinleşmiş kabul edilmez. | Brifing; A6 §13 açık ürün kararları | PO-MEY.8 | PROPOSED | RECOMMENDED | ADR gerekmez | Functional brief | Unicode grapheme/byte ve limit örnekleri seçilen policy’ye göre sınanır. | 500 sınırı, sayım biçimi ve son ad onayı? | REQUIREMENTS.md §Meydan ve Product Reviews |

### 6.11. Job Board ve HR

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-JOB-001 | Email-verified kullanıcı job listing index’e erişebilir. | A6 §4; G0-1 §4 | PO-JOB.1 | APPROVED | VERIFIED | P03/P04 | DA-ID-003 | Emailverified index okur; unverified access onaylı kurala göre reddedilir. | Index’te izinli alanlar ve arama snippet? | REQUIREMENTS.md §Job Board ve HR |
| DA-JOB-002 | Tam job details/content ve başvuru kişisel kimlik doğrulaması gerektirir. | G0-1 §4; A7 §9 genel kişisel erişim notu | PO-JOB.2 | APPROVED | VERIFIED | P03 | DA-JOB-001; DA-SEC-006 | Index API tam açıklama veya application attachment sızdırmaz. | Başvuru visibility/retention ve revoke etkisi? | REQUIREMENTS.md §Job Board ve HR |
| DA-JOB-003 | Yetkili Org kullanıcısı ilan yönetir; optional full HR enabling zorunlu değildir. | A6 §§4–5; G0-1 §4 | PO-JOB.3–4 | APPROVED | VERIFIED | P04 | DA-ORG-001; DA-SEC-001 | HR kapalıyken yetkili ilan CRUD çalışır; rol dışı actor reddedilir. | İlan onay/moderation ve organization eligibility? | REQUIREMENTS.md §Job Board ve HR |
| DA-JOB-004 | HR personnel, payroll ve çalışan özel verileri Job Board’ın public ilan alanından ayrılır. | A1 §4; A6 §5 | PO-JOB.4 bağımsızlık | PROPOSED | RECOMMENDED | P01/P04 | DA-SEC-006; DA-DATA-001 | Applicant veya public job reader employee record göremez. | HR MVP, hukuki veri türleri ve saklama? | REQUIREMENTS.md §Job Board ve HR |

### 6.12. Vehicle Management, Quotations ve OEM

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-AUTO-001 | Vehicle Management DoğruAdres domain’idir ve AI/OEM olmadan işler. | ADR-0002; A7 §10 | PO-AI.5 | APPROVED | VERIFIED | ADR-0002; P01 | Manual vehicle model | OEM outage manuel vehicle kaydını engellemez. | VIN normalize ve vehicle duplicate/link sahipliği? | REQUIREMENTS.md §Vehicle Management, Quotations ve OEM |
| DA-AUTO-002 | Quotations private Org iş akışıdır; Product/Inventory/Vehicle bağlantıları permission-aware olmalıdır. | A1 §4; A7 §7 | PO-AI.5 | PROPOSED | RECOMMENDED | P01; ADR-0002 | DA-CAT-005; DA-SEC-002 | Quotation başka Org stok/maliyet/vehicle’ı bağlayamaz. | Version, onay, expiry ve marketplace conversion? | REQUIREMENTS.md §Vehicle Management, Quotations ve OEM |
| DA-AUTO-003 | Gelecekte provider-neutral VIN/OEM lookup gerekir; provider sonucu güven düzeyiyle izlenir. | A7 §§10,12 | PO-AI.6 | APPROVED | VERIFIED | ADR-0002; P09 koşullu | DA-AUTO-001; adapter boundary | Fake provider değiştirilince manual akış ve canonical model bozulmaz. | Lookup confidence, ambiguous matches ve merge yetkisi? | REQUIREMENTS.md §Vehicle Management, Quotations ve OEM |
| DA-AUTO-004 | LexCom potansiyel partnerdir; sözleşme veya erişim/yeniden kullanım hakkı kanıtı yoktur. | A7 §§10,15 | PO-AI.7–8 | OPEN | UNVERIFIED | P09 yalnız anlaşma öncesi | Official provider contract | PoC fake fixture gerçek licensed data diye etiketlenmez. | Licensing, cache, preservation, attribution ve transfer şartları? | REQUIREMENTS.md §Vehicle Management, Quotations ve OEM |

### 6.13. AI/BYOK ve entegrasyonlar

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-AI-001 | Organization kendi provider bağlantısını ve API key’ini kullanabilmeli; sağlayıcı tercihi geleceğe bırakılır. | A7 §§2,5,12 | PO-AI.1 | APPROVED | VERIFIED | P08 | DA-ORG-001; secret management | Org A key’i Org B isteğinde kullanılmaz; key dışa açılmaz. | Provider terms, budget ve rotation policy? | REQUIREMENTS.md §AI/BYOK ve entegrasyonlar |
| DA-AI-002 | AI tool yetkisi güncel Organization/user/app/resource izinleriyle sınırlıdır. | A5 §10; A7 §§6–7 | PO-AI.2 | APPROVED | VERIFIED | P08/P03 | DA-SEC-001,005 | Membership revoke, tool execute anında erişimi düşürür. | Delegate principal ve consent kapsamı? | REQUIREMENTS.md §AI/BYOK ve entegrasyonlar |
| DA-AI-003 | High-impact AI action uygun scope’lu onay ister; tool proposal approval ile execution arasında tekrar kontrol edilir. | A7 §8 | PO-AI.3 | APPROVED | VERIFIED | P08 | DA-AI-002; optimistic version | Eski/onayı değiştirilmiş/replayed tool arguments çalışmaz. | High impact listesi, threshold, MFA, expiry ve approver? | REQUIREMENTS.md §AI/BYOK ve entegrasyonlar |
| DA-AI-004 | İlk tercih mevcut backend’de küçük provider-neutral application layer’dır; framework/MCP seçimi onaylı değildir. | A7 §§2–4,15 | PO-AI.4 | PROPOSED | RECOMMENDED | P08 | P01; resource limit | Fake adapters core domain’den ayrıdır; ağır ek service zorunlu değil. | SDK/dependency ve application boundary approval? | REQUIREMENTS.md §AI/BYOK ve entegrasyonlar |
| DA-AI-005 | BYOK encryption/KEK isolation, redaction, outbound policy ve provider’a veri aktarım onayı gerekir. | A7 §§5,9,13 | PO-AI.1–2; SECURITY | PROPOSED | RECOMMENDED | P08 | DA-SEC-007; secret custody | Prompt/log/export secret içermez; org key rotation restore güvenli olur. | KEK holder, data residency, model retention/training ve cost limits? | REQUIREMENTS.md §AI/BYOK ve entegrasyonlar |
| DA-AI-006 | Connector service principal ile insan oturumu ve AI delegation ayrılır; inbound/outbound auth farklı sözleşmelerdir. | A5 §§9–10; A7 §6 | PO-AI.2 | PROPOSED | RECOMMENDED | P03/P08 | DA-SEC-003 | Connector token kişisel veya başka Org yetkisi kazanmaz. | Service actor issuance/rotation/scopes? | REQUIREMENTS.md §AI/BYOK ve entegrasyonlar |
| DA-AI-007 | Prompt injection, arbitrary SQL/shell/HTTP ve çapraz-Org retrieval sınırları bounded tools ile kontrol edilmelidir. | A7 §9 | PO-AI.2–3 | PROPOSED | RECOMMENDED | P08 | DA-AI-002–003; DA-SEC-006 | Malicious prompt başka Org verisini veya sınırsız işlem aracını açamaz. | Allowlist, retrieval provenance ve red-team standardı? | REQUIREMENTS.md §AI/BYOK ve entegrasyonlar |

### 6.14. Uluslararasılaştırma, RTL ve erişilebilirlik

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-UX-001 | TR/EN/modern Arabic ve RTL kapsamı DESIGN/A6 kaynaklarında taslaktır; onaylı locale matrisi yoktur. | DESIGN §16; A6 §§2,13 | Yok | PROPOSED | RECOMMENDED | ADR gerekmez; library değişirse dependency ADR | Functional briefs | Locale fallback, mixed-direction string, tarih/sayı/para örnekleri sınanır. | Initial locales, translation ownership ve RTL release gate? | REQUIREMENTS.md §Uluslararasılaştırma, RTL ve erişilebilirlik |
| DA-UX-002 | Keyboard, focus, screen-reader, contrast, touch target ve hata erişilebilirliği acceptance standardına adaydır. | DESIGN §17; A6 §9 | Yok | PROPOSED | RECOMMENDED | ADR gerekmez | UX acceptance policy | Lock/unlock, notification, form ve cart keyboard ile erişilir. | Hedef WCAG seviyesi, assistive test matrisi? | REQUIREMENTS.md §Uluslararasılaştırma, RTL ve erişilebilirlik |
| DA-UX-003 | DESIGN palette/font/layout/light-dark önerileri product requirement veya accepted architecture değildir. | DESIGN §§7–22; G0-1 §5 | PO-DOC.3 | PROPOSED | RECOMMENDED | ADR gerekmez | DA-APP-006 | UI reference onaylı policy’yi değiştirmez. | Görsel edition ve screen approval izi? | REQUIREMENTS.md §Uluslararasılaştırma, RTL ve erişilebilirlik |

### 6.15. Saklama, arşivleme ve silme

| Geçici ID | Gereksinim | Kaynak / bölüm | Brifing | Decision | Evidence | ADR | Bağımlılıklar | Kabul testi kavramı | Açık soru | Önerilen authoritative hedef |
|---|---|---|---|---|---|---|---|---|---|---|
| DA-DATA-001 | Retention/archive/restore/deletion legal, financial ve private kayıt sınıfına göre ayrı onay ister. | A1 §7; A5 §15; AGENTS Approval gates | PO-DOC.5–8; deletion için yeni onay yok | OPEN | UNVERIFIED | P03/P06; retention ADR koşullu | Data classification | Deletion history veya earned ledger’ı sessizce kırmaz. | KVKK, yasal süre, subject request ve backup expiry? | REQUIREMENTS.md §Saklama, arşivleme ve silme |
| DA-DATA-002 | Posted accounting ve completed financial snapshots yeniden yazılmaz; correction/audit ayrı kayıtla izlenir. | A3-R §6; A4 §§14–15 | PO-ACC.4; PO-MKT.11 | APPROVED | VERIFIED | P06/P07 | DA-ACC-004; DA-MKT-008 | Correction orijinal posted/snapshot hash’ını değiştirmez. | Legal deletion talebiyle minimum financial evidence çatışması? | REQUIREMENTS.md §Saklama, arşivleme ve silme |
| DA-DATA-003 | Research, approved requirement, accepted ADR ve implemented architecture farklı otorite sınıflarıdır. | G0-1 §§8–9; research README Authority | PO-DOC.4–8 | APPROVED | VERIFIED | ADR-0003; governance update | Approval provenance | Araştırma kaydı approval/implementation flag’i üretmez. | REQUIREMENTS metadata şeması onayı? | REQUIREMENTS.md §Saklama, arşivleme ve silme |
| DA-DATA-004 | Gelecek research yazımı yalnız açık task yetkisinde; unique filename, full evidence ve izinli index update ile yapılır. | research README Research Lifecycle | PO-DOC.4,8; görev §8 | APPROVED | VERIFIED | ADR gerekmez | Collision/hash preflight | Read-only task report yazmaz; mevcut evidence overwrite edilmez. | Permanent governance update ayrıca onaylanacak. | REQUIREMENTS.md §Saklama, arşivleme ve silme |


## 7. Önerilen REQUIREMENTS.md düzeni

[RECOMMENDED / PROPOSED] Başlangıçta tek açık entry point: docs/dogruadres/REQUIREMENTS.md. Parent router yalnız navigation yapmalı; “business requirements encyclopedia değil” ifadesi küçük governance router’ı korumak için yorumlanır. Yeni gereksinim belgesinin konumu ve router wording entegrasyonu ayrıca ürün sahibi onayı ister; bu görevde sessiz policy değişikliği yapılmaz.

Önerilen bölümler:

1. Purpose, authority, scope ve kaynak hiyerarşisi.
2. Glossary: Person, Organization, Store/Seller, branch, workspace, member, Owner, verification, entitlement, eligibility, ledger.
3. Requirement metadata/status ve approval provenance kuralları.
4. Identity/personal workspace; Organizations/Stores/branches/memberships.
5. Authorization/session/files/export/search/audit.
6. Applications/launcher/notifications ve delivery acceptance.
7. Products/Brands/Contacts/Inventory.
8. Marketplace/source currency/FX/cart; settlement/commissions.
9. Native Basic Accounting.
10. Platform Loyalty/Kumbara/representatives/badges.
11. Meydan/Product Reviews; Job Board/HR.
12. Vehicle/Quotations/OEM; AI/BYOK/integrations.
13. i18n/RTL/accessibility.
14. Retention/archive/deletion.
15. Future/deferred policy register, approval history ve ADR/acceptance cross-links.

### 7.1 Kimlik ve metadata

[RECOMMENDED / PROPOSED] DA-<DOMAIN>-<NNN> ilk şema adayıdır; bu rapordaki ID’ler provisional. Numaralar kalıcı onaydan sonra tekrar kullanılmamalı; superseded kayda yeni replacement link verilmeli. Yeni approved numbering farklı seçilirse bu rapor–kalıcı-ID mapping’i korunmalı.

Her requirement record: stable ID; kısa normative statement; kapsam/non-goals; owner/approver; source exact path/section; sohbet source type, tarih ve karar alıntısının güvenli özeti; decision status; evidence status; approval date/reference; delivery horizon; dependencies; acceptance criteria IDs; ilgili Accepted/Proposed ADR; implementation status ve ayrı commit/test/version evidence; open question ve replacement history. Rapor tarihinde owner brifing kaynağı biliniyor; sohbet message ID/transcript permalink verilmedi. Bunlar uydurulmamalı. Önceki altı rapora tarih icat edilmemeli.

[RECOMMENDED / PROPOSED] Deferred capability ile deferred decision ayrı sütunlarda tutulmalı: OEM lookup ürün hedefi APPROVED/future, provider licensing OPEN; personalverification provider seçimi DEFERRED. “APPROVED” requirement checklist ile “test geçti/implemented” checkbox aynı sütun olmamalı. Her acceptance test kavramı daha sonra plan kapsamında ölçülebilir kriter, fixture ve başarı/başarısızlık eşiğine dönüştürülmeli.

### 7.2 Ne zaman domain dosyalarına ayrılmalı?

[INFERRED / PROPOSED] 92 kayıt ve domain politikalarının büyümesi tek dosyayı ileride zorlaştırabilir; bugün sabit dosya sayısı veya satır eşiği belirlemek gereksizdir. Birbirinden bağımsız owner/review ritmi, uzun financial policies veya çatışan edit yükü oluşunca REQUIREMENTS.md router+cross-domain invariants olarak kalıp requirements/<domain>.md dosyaları ayrı onayla düşünülebilir. Bu yeni hiyerarşi şimdi oluşturulmaz. ID/provenance/ADR crosslinks split’te korunur.

## 8. ADR uzlaştırması ve gerçekten gerekli ek kararlar

[VERIFIED / APPROVED] ADR-0001 Mercur as marketplace engine; ADR-0002 automotive domain isolation; ADR-0003 core modification policy, üçü de Accepted 2026-10-07. Bunları supersede etmek için yeni kanıt yok. G0-1’in önerdiği ADR listesi tek başına Accepted değildir. Aşağıdaki P* numaralar araştırma etiketidir; gelecekteki gerçek ADR-0004… numaraları owner review sonrası atanmalıdır.

| Geçici konu | Karar kapsamı ve gerekçe | Sıra / kapı | Durum |
|---|---|---|---|
| P01 Platform domain ownership ve başlangıç runtime/data boundaries | Organization/private catalogs/central loyalty/application registry sahipliği; supported module/link/adapters; hedefli PoC için data boundary; accounting shared-PG yönünü tüm platforma genelleştirmeme | Güvenlik PoC’sinden önce minimum boundary kararı; diğer domain detayları sonra | RECOMMENDED / PROPOSED |
| P02 Canonical identity, Organization–Store ve membership/Owner modeli | Actor mapping, invitation, independent scopes, protected Owner ve account lifecycle; yeni auth/domain boundary | P01 ile birlikte ilk security prerequisite | RECOMMENDED / PROPOSED; yüksek seviye ürün hedefleri APPROVED |
| P03 Fail-closed authorization ve session/private-resource security contract | Resolver, trusted context, deny semantics, backend lock/unlock/revoke, every access surface, audit/support boundary | İlk PoC için zorunlu mimari karar | RECOMMENDED / PROPOSED; güvenlik sonuç gereklilikleri APPROVED |
| P04 Application lifecycle ve platform eligibility ownership | Entitlement vs permission vs preference; optional app bağımsızlığı; central loyalty state’in consumers ile sözleşmesi | App foundation’dan önce; ilk auth PoC’de yalnız küçük fake entitlement/state sınırı | RECOMMENDED / PROPOSED; central ownership APPROVED |
| P05 Source-currency/FX ve versioned marketplace price publication | Currency provenance, projection truth, partial publish, cart acceptance/snapshot, upgrade-sensitive adapter | Marketplace fiyat diliminden önce | RECOMMENDED / PROPOSED |
| P06 Financial scopes, settlement ve independently calculated commission contract | Store statements/payout, payment/refund scope, components, earned ledger ve immutable evidence; checkout accounting independence | Para hareketi veya payment connector’dan önce | RECOMMENDED / PROPOSED; TRY nihai kararı OPEN |
| P07 Native Basic Accounting integrity ve data ownership | Approved native/shared-PG direction; ledger atomicity/idempotency/immutability, tenant boundaries ve posting/reconcile | Accounting brief, yerli workflow research ve accountant review sonrası detailed ADR; finansal PoC öncesi | RECOMMENDED / PROPOSED; geliştirme yönü APPROVED |
| P08 AI/BYOK delegation, approvals ve secret/privacy boundary | Tool execution/current permissions, scoped approval, provider-neutral layer, key custody/data transfer | AI pilot öncesi; şimdi delivery DEFERRED | RECOMMENDED / PROPOSED |
| P09 OEM provider contract/data-confidence/preservation boundary | ADR-0002’ye ek sadece gerçek provider/licensing/data ownership kararı onu aşıyorsa | OEM contract/pilot öncesi; bugün OPEN/DEFERRED | Koşullu RECOMMENDED; otomatik yeni ADR yaratılmamalı |

[RECOMMENDED / PROPOSED] P03 başlangıçta tutarlı tek security contract olabilir; actor/session ve resource-policy incelemeleri bağımsızlaşırsa owner onayıyla bölünebilir. P04 içinde state sahipliği mimari karardır; 90/30 threshold, Golden period ve Kumbara redemption ürün politikasıdır, sırf sayı için ayrı ADR gerekmez. Meydan limit/naming, locale listesi ve sıradan UI tasarımı ADR gerektirmez. Content canonical ownership/retention veya data-processing hukuki sınır yeni bir mimari karar oluşturursa o modülün P04/P03 kararını genişleten, ayrı onaylı ADR gerekebilir. G0-1’den her öneri otomatik bir yeni ADR’ye dönüşmez.

Mevcut ADR TEMPLATE (Context/Decision/Alternatives/Consequences/Trade-offs/Upgrade/Follow-up) korunmalı; daha sonra provenance, approval reference ve linked requirements eklenmesi öneridir, bugün template değiştirilmez.

## 9. İlk security PoC’sinden önce gereken kararlar

[RECOMMENDED / PROPOSED] Bu rapor PoC yetkisi değildir. Sonraki ayrı task’ta plans/TEMPLATE.md ile kapsam, files/components, migration impact, verification, rollback ve approval status içeren plan gerekir. İlk deney 2 sentetik Organization, bir shared person, ayrı roles, Store/branch scope ve fake entitlement ile küçük read-only resource’a odaklanmalı; gerçek kullanıcı/kimlik verisi, canlı provider, payment veya UI modu olmamalı.

| Gate | Açık karar / kanıt | Gelecek kabul kavramı |
|---|---|---|
| Canonical identity | P02 actor/person mapping, membership authority, trusted Organization/Store/branch/platform context | Aynı person ayrı Org role; sahte org_id ve platform özel veri bypass reddi |
| Permission contract | P03 deny default; resolver yok/hata/policy unavailable davranışı; admin/vendor/custom API yolları | T02 grantAll fallback güvenlik bypass olmaz; her entry point negative case |
| Owner/invitation | Owner protection minimumu, davet alıcı binding/TTL/replay; ürün sahibi kesinleştirmesi | Son Owner koruması, yanlış recipient ve expired/revoked invite |
| Session | Lock scope, backend session state, password unlock, revoke semantics ve bounded latency | Overlay bypass yok; eski token/job/download revoke sonrası reddedilir |
| Resource surfaces | API/workflow/job/file/export/search/cache/çoklu tab kapsamı; signed file URL ve async recheck | 2-org positive/negative cases ve stale permission-cache cases |
| Data/audit | Fixture-only boundary; secret/PII-free audit fields; log erişimi | Deny/allow decision actor/context izi; secret değeri yok |
| Upgrade safety | Supported resolver/module/hooks üzerinden integration; core patch yok | Kurulu source/docs farkları kaydedilir; monkey patch’e sessiz geçilmez |
| PoC approval | Owner acceptance checklist, scope/non-goals, files, rollback ve test planı | Başarı raporu security proof sınırlarını açıkça yazar |

[VERIFIED / DEFERRED] Personalverification sağlayıcı seçimi ilk sentetik auth PoC için yeniden açılmak zorunda değildir. Fake verification state kullanımının sınırı onaylanır; fake state gerçek verification/production enrollment veya sosyal application delivery değildir. Golden threshold, payment/FX, accounting, AI/OEM entegrasyonu bu küçük PoC’nin prerequisite’i değildir. App/central-eligibility owner modeli temel sözleşmeye dahil olur; detaylı loyalty policy PoC’ye taşınmaz.

[INFERRED / OPEN] Baseline session endpoint’in varlığı backend lock/revocation tasarımını ortadan kaldırmaz; izinli gecikme, tek/all session locking ve password actor kapsamı kararlaştırılmadan “güvenlik tamam” sonucu çıkarılamaz. Bugün runtime security proof veya PoC sonucu yok.

## 10. Modül bazında ertelenen/açık kararlar

| Modül | APPROVED hedef korunurken ertelenen/açık ayrıntı | Zaman / ayrı review |
|---|---|---|
| Identity/security | Sağlayıcı DEFERRED; legal/cost, account merge/recovery, Owner transfer, session scope/revoke latency OPEN | Auth contract review; provider daha sonraki owner kararı |
| Organization/apps | Legal verification, sector defaults, mandatory apps, disable/history ve entitlement policy | Platform functional brief ve P01/P04 |
| Catalog/Inventory | Brand/MPN normalization, canonical links, Contacts ownership, stock authority/branch permissions | Catalog/Inventory brief |
| Marketplace/FX | TRY publication PROPOSED, rate type/rounding/stale/fallback/unit/history/quote TTL, buyer context | A4 plan/P05; ücret/payment kararı ayrı |
| Payment/commissions | TRY settlement confirmation, fees/bases/payees/refund/payout/reversal, earned/vested states | P06 öncesi domain approval |
| Basic Accounting | MVP candidates, chart/business flows, money precision/atomicity, correction, row/RLS boundary | Yerli workflow araştırması + accountant review + P07 |
| Loyalty/representative/Kumbara | 90/30 thresholds PROPOSED; events/onboarding/clock/state transitions, targets/periods, transfer, redemption | Loyalty-specific owner approval; earned geçmiş değişmez |
| Meydan/reviews | 500 limit/name, media policy, moderation appeal, cross-post canonical source/lifecycle | Meydan brief; provider gate canlı participation için |
| Job/HR | İzinli index fields, job moderation, application/private attachment retention, HR scope | Job bağımsız functional brief; HR opsiyonel ayrı |
| Vehicles/Quotations/OEM | VIN normalization, confidence/link/merge, quotation versioning; LexCom/licensing/cache/preservation OPEN | Manual workflow önce; provider anlaşması daha sonra |
| AI | Provider-neutral app layer PROPOSED; SDK, key custody, budget, high-impact list, approval expiry/MFA, data-processing terms | AI implementation DEFERRED; P08 review |
| UX | Locale/RTL, WCAG hedefi, fonts/palette/light-dark ve screen specs PROPOSED | Functional brief sonrası tasarım ve acceptance approval |
| Retention | KVKK/yasal-finansal saklama, deletion vs immutable evidence, backup expiry ve restore | Veri sınıflandırması ve ilgili domain/legal review |
| Delivery | A6 sıra ve first-release scope PROPOSED; ölçülen estimates yok | Her küçük dilim öncesi agreed acceptance standard |

Loyalty thresholds’ün öneri statüsü, inactive state’in Store suspend yapmayacağı açık kararını zayıflatmaz. Accounting policy araştırma ihtiyacı bu raporda yerli ürünler seçilerek karşılanmaz. Provider/AI/OEM ve hukuki veri işleme seçimleri research archive izniyle yürürlüğe girmez.

## 11. Önerilen dokümantasyon güncelleme sırası

Bütün aşağıdaki sıra RECOMMENDED / PROPOSED; her authoritative write ayrı task yetkisi gerektirir.

1. Ürün sahibi bu matrisi, provisional ID şemasını, source/provenance kayıt biçimini ve gerçek APPROVED/PROPOSED ayrımlarını inceler.
2. Eksik owner kararları ve sırf terminology olan açık sorular giderilir; sohbet brifinginin kalıcı approval kaynağı güvenle kayda alınır.
3. Ayrı yetkiyle REQUIREMENTS.md ilk entry point oluşturulur; approval ile implementation metadata ayrı tutulur. Superseded öneri linkleri korunur.
4. İlk güvenlik dilimi için P01/P02/P03 minimum kararları Proposed→owner acceptance süreciyle yazılır; mevcut üç Accepted ADR korunur.
5. Yetkiyle ARCHITECTURE/SECURITY/ilgili integration governance yalnız kabul edilmiş kararlarla hizalanır. compose.dev.yml sınıf çelişkisi de bu kapsamda açık review konusu olur; otomatik sessiz düzeltme değil.
6. Parent docs/dogruadres/README.md’ye research ve approved requirements navigation linkleri ayrı yetkiyle eklenir.
7. Accepted prerequisites üzerine plans/TEMPLATE.md ile ilk küçük security PoC planı ve acceptance standard onaylanır; sonra ayrı implementation/test task verilir.
8. Verified implementation ortaya çıktığında CODEBASE.md ayrı yetkiyle yalnız source/version/test kanıtlı gerçek mimariyi anlatır. Gelecek fikirler oraya taşınmaz; AGENTS.md stable Agent governance olarak kalır.
9. Sonraki module briefs, accounting workflow review ve P04–P08 kararları ihtiyaç sırasına göre yapılır; P09 ancak yeni provider boundary gerektirirse.
10. Her yeni araştırma current task explicit write permission ile complete report+unique archive filename olarak saklanır; index yalnız yetkili task’ta güncellenir.

## 12. Gelecek araştırma kaydetme kuralı

[VERIFIED / APPROVED] Owner raporların research altında saklanmasını istiyor; mevcut research README Lifecycle daha restrictive root/task rule’u override etmiyor. Usul: assigned authoritative research → tam conversation report → task izin veriyorsa tam Markdown archive → unique descriptive stage/date filename → eski revision ayrı ve unchanged → evidence/status/source references → izin varsa index update. Credentials/secrets yazılmaz. Report write permission code, dependencies, DB, ADR, requirements veya authoritative docs değişikliği değildir. AGENTS/CODEBASE task report alanı değildir.

## 13. İnceleme ve dosya güvenliği kaydı

Başlangıç cwd: D:\DogruAdres. İlk git status --short:

```text
?? .vscode/
?? DESIGN.md
?? docs/dogruadres/research/
```

[VERIFIED] Dokuz araştırma ve tarihsel inventory incelendi. Bu görevde source code, ADR, DESIGN, AGENTS, authoritative project docs veya geçmiş report bytes değiştirilmez. Arşiv yazma işleminden önce Git tracked + mevcut untracked/exclude-standard 464 dosyanın SHA-256 snapshot’ı alındı. Bu snapshot dependency/cache/.git içeriği için repository-wide bütünlük iddiası değildir; scope kontrolü için tracked ve kullanıcı untracked dosyalarını kapsar.

Bu raporun tek yeni dosya adı: G0-step-2-requirements-and-decision-traceability-2026-10-10.md. research/README.md’ye yalnız bu raporun navigation satırı eklenmesi yetkilidir. Kaynak SHA-256 karşılaştırması ve index link doğrulaması yazımdan sonra conversation completion sonucunda bildirilir. Rapor kendi kendinin hash’ını içermez.

Beklenen son git status aynı directory-level untracked gruplarıdır; grup görünümü iki dosya değişimini ayrı göstermeyebilir. Bu nedenle kapsam doğrulaması hash diff ve dosya envanteriyle yapılır. Builds/tests/migrations/seeds veya gerçek API/DB çağrıları yapılmadı; acceptance sütunları çalıştırılmış test sonucu değildir. Staging/commit veya destructive Git işlemi yapılmaz.

## 14. Ürün sahibi incelemesine sunulan sonuç

[RECOMMENDED / PROPOSED] Bu rapor ve matrix onayı, gelecekteki authoritative documentation yazımı için ayrı yetkiye temel olabilir; mevcut task’ın implementation yasağını kaldırmaz. Native accounting onayı geniş ERP/lisans/statutory uyum onayı değildir. Verification provider DEFERRED kalır. İstenen güvenlik ürün sonuçları APPROVED; bunları sağlayacak exact protocol/contract/provider seçimi hala review gerektirir. APPROVED requirement, accepted ADR, runtime proof ve completed feature ayrı kayıtlar olmalıdır.

Burada durulur: authoritative reconciliation edits, güvenlik PoC’si, connector geliştirme veya herhangi bir modül implementasyonu başlatılmaz.

