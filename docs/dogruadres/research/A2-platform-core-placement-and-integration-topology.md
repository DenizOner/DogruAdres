A1’den kalan sürüm ve domain sınırlarını başlangıç kabul edip, A2’nin kararını etkileyen noktaları kurulu kod ve sürüm-eşleşmeli belgelerle yeniden doğrulayacağım. Salt-okunur kalacağım; önce başlangıç Git durumunu ve mimari/guidance belgelerini, ardından checkout, workflow ve entegrasyon kanıtlarını toplayacağım.

Ran terminal command: Set-Location 'D:\DogruAdres'; git status --short --branch; Write-Output '--- HEAD ---'; git log -1 --oneline

Read , lines 1 to 130
Completed with input: {
  "path": "D:\\DogruAdres\\AGENTS.md",
  "view_range": [
    1,
    130
  ]
}

Read 
Completed with input: {
  "path": "D:\\DogruAdres\\docs\\dogruadres\\README.md"
}

Read 
Completed with input: {
  "path": "D:\\DogruAdres\\docs\\dogruadres\\ARCHITECTURE.md"
}

Read 
Completed with input: {
  "path": "D:\\DogruAdres\\docs\\dogruadres\\PRINCIPLES.md"
}

Read 
Completed with input: {
  "path": "D:\\DogruAdres\\docs\\dogruadres\\SECURITY.md"
}

Read 
Completed with input: {
  "path": "D:\\DogruAdres\\docs\\dogruadres\\MERCUR-INTEGRATION.md"
}

Read , lines 1 to 80
Completed with input: {
  "path": "D:\\DogruAdres\\packages\\api\\package.json",
  "view_range": [
    1,
    80
  ]
}

Read , lines 1 to 130
Completed with input: {
  "path": "D:\\DogruAdres\\packages\\api\\medusa-config.ts",
  "view_range": [
    1,
    130
  ]
}

Read , lines 55 to 105
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\learn\\architecture.mdx",
  "view_range": [
    55,
    105
  ]
}

Read , lines 180 to 320
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\learn\\architecture.mdx",
  "view_range": [
    180,
    320
  ]
}

Read , lines 1 to 240
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\resources\\best-practices\\workflows.mdx",
  "view_range": [
    1,
    240
  ]
}

Read , lines 1 to 175
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\resources\\best-practices\\subscribers-and-jobs.mdx",
  "view_range": [
    1,
    175
  ]
}

Read , lines 1 to 200
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\resources\\best-practices\\api-routes.mdx",
  "view_range": [
    1,
    200
  ]
}

Read , lines 1 to 110
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\references\\api\\conventions.mdx",
  "view_range": [
    1,
    110
  ]
}

Read , lines 28 to 85
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\learn\\order-groups.mdx",
  "view_range": [
    28,
    85
  ]
}

Read , lines 10 to 90
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\learn\\commissions.mdx",
  "view_range": [
    10,
    90
  ]
}

Read , lines 1 to 120
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\learn\\payouts.mdx",
  "view_range": [
    1,
    120
  ]
}

Read , lines 1 to 125
Completed with input: {
  "path": "D:\\DogruAdres\\package.json",
  "view_range": [
    1,
    125
  ]
}

Read , lines 14 to 90
Completed with input: {
  "path": "D:\\DogruAdres\\packages\\api\\node_modules\\@mercurjs\\core\\.medusa\\server\\src\\modules\\seller\\models\\seller.js",
  "view_range": [
    14,
    90
  ]
}

Read , lines 85 to 140
Completed with input: {
  "path": "D:\\DogruAdres\\packages\\api\\node_modules\\@mercurjs\\core\\.medusa\\server\\src\\workflows\\cart\\workflows\\complete-cart-with-split-orders.js",
  "view_range": [
    85,
    140
  ]
}

Read , lines 220 to 265
Completed with input: {
  "path": "D:\\DogruAdres\\packages\\api\\node_modules\\@mercurjs\\core\\.medusa\\server\\src\\workflows\\cart\\workflows\\complete-cart-with-split-orders.js",
  "view_range": [
    220,
    265
  ]
}

Read , lines 355 to 445
Completed with input: {
  "path": "D:\\DogruAdres\\packages\\api\\node_modules\\@mercurjs\\core\\.medusa\\server\\src\\workflows\\cart\\workflows\\complete-cart-with-split-orders.js",
  "view_range": [
    355,
    445
  ]
}

Read , lines 1 to 50
Completed with input: {
  "path": "D:\\DogruAdres\\packages\\api\\node_modules\\@mercurjs\\core\\.medusa\\server\\src\\modules\\payout\\models\\payout-account.js",
  "view_range": [
    1,
    50
  ]
}

Read 
Completed with input: {
  "path": "D:\\DogruAdres\\packages\\api\\src\\modules\\README.md"
}

Read 
Completed with input: {
  "path": "D:\\DogruAdres\\packages\\api\\src\\links\\README.md"
}

Read 
Completed with input: {
  "path": "D:\\DogruAdres\\packages\\api\\src\\api\\middlewares.ts"
}

Read , lines 1 to 48
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\learn\\introduction.mdx",
  "view_range": [
    1,
    48
  ]
}

Kurulu checkout akışında Seller’a göre order bölme, OrderGroup oluşturma ve payment split’in bir kısmının checkout sonrasında event/subscriber ile yürütülmesi görülüyor. Bu, “tek workflow” ile “tek ACID transaction”ı ayırmayı önemli kılıyor; şimdi A2 senaryolarının transaction/consistency sınıflarını ve gözlemlenebilirlik sorumluluklarını bunun üzerinden netleştiriyorum.

Search for `(createHook\("validate"|createHook\("beforePaymentAuthorization"|createHook\(...`

Search for `(redisUrl|eventBus|workflow|logger|modules:|withMercur)`

Search for `(auth_identity|provider_identity|model\.define\("Customer"|email.*has_account...`

Search for `(modules|links|workflows|jobs|subscribers|README|custom)`

Search for `(requiredFulfillmentStatus|PayoutAccount|currency_code|seller)`

Read , lines 8 to 65
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\learn\\seller-members.mdx",
  "view_range": [
    8,
    65
  ]
}

Read , lines 1 to 160
Completed with input: {
  "path": "D:\\DogruAdres\\node_modules\\@mercurjs\\docs\\content\\resources\\deployment\\self-host.mdx",
  "view_range": [
    1,
    160
  ]
}

Search for `(query\.index|query\.graph|cross-module|filter by a linked|isolation)`

Search for `beforePaymentAuthorization|orderGroupCreated|createHook\("validate"`

Search for `(createWorkflow|createHook|WorkflowResponse|hooks:|validate|beforePaymentAuth...`

Search for `(databaseUrl|redisUrl|modules:|withMercur|admin-ui|vendor-ui|file-local|jwtSe...`

Search for `(workspaces|packages/\*|apps/\*|build|dev|packageManager|turbo run)`

Search for `(single deployable backend|one PostgreSQL|Redis backs|Vendor requests|workflo...`

Search for `(Server mode|worker mode|PostgreSQL|Redis|Admin panel|Vendor panel|deployed s...`

Search for `(mutations go through a workflow|automatic rollback|compensation|emitEventSte...`

Search for `(out of the request|subscribers|idempotency|scheduled jobs|retry|failed|logge...`

Ran terminal command: Set-Location 'D:\DogruAdres'; Write-Output '--- final Git status ---'; git status --short --branch; Write-Output '--- tracked diff ---'; git diff --quiet; Write-Output "git_diff_exit=$LASTEXITCODE"; Write-Output '--- staged diff ---'; git diff --cached --quiet; Write-Output "git_cached_diff_exit=$LASTEXITCODE"; foreach($p in @('.vscode','DESIGN.md')) { Write-Output "$p exists=$(Test-Path -LiteralPath $p)" }; Write-Output '--- DoğruAdres module source files (targeted) ---'; Get-ChildItem '.\packages\api\src\modules' -File -Recurse | Select-Object -ExpandProperty FullName; Get-ChildItem '.\packages\api\src\links' -File -Recurse | Select-Object -ExpandProperty FullName



**Task completed:** # DoğruAdres — A2: Platform Core Placement and Integration Topology

## 1. Executive conclusion

**Tercih edilen yaklaşım: C — Seçici hibrit; ilk sürümde modüler monolit.**

Öneri, Mercur/Medusa marketplace runtime’ını ayrı bir DoğruAdres backend’iyle hemen bölmek değil. Başlangıçta **DoğruAdres platform çekirdeği ve iş domain’leri, mevcut Mercur/Medusa API uygulamasında ayrı sahiplik sınırları olan project-owned Medusa modülleri** olarak konumlansın. Böylece kritik checkout, seller/store, order ve payout akışları mevcut Mercur uygulama sınırında kalırken Organization, üyelik/yetki, uygulama entitlement’ı, özel iş verileri ve ilerideki modüller Seller modeline sıkıştırılmadan ayrı tutulur.

“Hybrid” burada **ilk günden iki bağımsız backend çalıştırmak** anlamına gelmiyor. Hibritlik domain sahipliği ve entegrasyon biçiminde: DoğruAdres domain’i mantıksal olarak ayrıdır; başlangıçta gerekli senkron işlevleri aynı Medusa uygulamasında bulunur; dış sistemler (ör. muhasebe/ERP) API/provider/event adapter’larıyla bağlanır. Domain modüllerini sonradan ayrı servise çıkarma olanağı korunur. **Bigcapital seçimi veya kurulum önerilmiyor.**

Bu öneri en az dağıtık işlem, kimlik senkronizasyonu ve operasyon yüküyle organization yetkisini seller-scoped Mercur API’sinin yanına koyuyor. Ancak Medusa module/link izolasyonu kendiliğinden tenant güvenliği veya tek ACID transaction sağlamaz. Her route/workflow’da organization yetkisi açıkça denetlenmeli; workflow compensation ile event-driven eventual consistency birbirinden ayrılmalıdır.

**Separate runtime:** Başlangıçta ayrı *DoğruAdres backend process/service* gerekli görünmüyor. Mercur self-host dokümanı üretim iş yükleri için API server ve worker instance’larını ayrı çalıştırma modelini tarif ediyor; bu, aynı Medusa/Mercur uygulamasının server/worker dağıtımıdır, ayrı bir DoğruAdres ürün backend’i değildir. Tek paylaşılan process ile başlama veya server/worker ayırma kararı çalışma yükü ve dağıtım gereksinimine göre verilebilir; bu audit runtime testi yapmadı.

---

## 2. Confirmed current technical baseline

- **VERIFIED:** Root workspace `packages/*` ve `apps/*` workspaces içeren Bun monorepo’su. `packages/api/package.json` Mercur **2.3.6** ve Medusa **2.21.2** paketlerini sabitliyor; A1’de görülen kurulu paket manifestleriyle sürümler aynı. Root `packageManager` alanı Bun 1.4.2 olarak beyan edilmiş; bu, bu görevin çalıştırdığı veya doğruladığı sistemdeki Bun sürümü değildir.
- **VERIFIED:** `medusa-config.ts` `withMercur(...)` çağırıyor, `DATABASE_URL` ve `REDIS_URL` konfigürasyon noktalarını veriyor ve Mercur Admin/Vendor UI modülleri ile Medusa local-file provider’ı kaydediyor. DoğruAdres modülü kayıtlı değil.
- **VERIFIED:** Hedeflenmiş kaynak listelemesinde `packages/api/src/modules` ve `src/links` sadece README içeriyor; DoğruAdres modülü/link’i yok. `middlewares.ts` route listesi boş. Bulunan proje subscriber’ı storefront cache revalidation; DoğruAdres domain subscriber’ı değil.
- **VERIFIED:** Mercur, Medusa eklentisi olarak tasarlanmış; Mercur belgeleri kendi modülleriyle özel Medusa modüllerini aynı modül/link/workflow katmanında konumlandırıyor. Bundled docs üretimde PostgreSQL ve Redis, API server ile worker çalıştırma modelini tarif ediyor.
- **VERIFIED:** Mevcut `ARCHITECTURE.md`, DoğruAdres katmanı → project-owned adapter → Mercur destekli extension API sınırını ve nihai şemayı ertelemeyi kabul ediyor. `AGENTS.md` ile `MERCUR-INTEGRATION.md` core değişikliğinden önce extension-first yaklaşımını şart koşuyor.
- **VERIFIED (implementation, not live runtime):** Kurulu `completeCartWithSplitOrdersWorkflow` cart satırlarını offer’ın `seller_id`’sine göre grupluyor ve seller başına order yaratıyor; OrderGroup ve seller/order ilişkileri ekliyor. Kaynakta `validate`, `beforePaymentAuthorization` ve `orderGroupCreated` adlı hook noktaları görülüyor. Hook’ların uygulama tarafından başarılı şekilde kaydedildiği/çalıştığı bu salt-okunur görevde çalıştırılmadı.
- **VERIFIED:** Workflow dokümanları birden fazla mutation step’i ve başarısızlıkta compensation tanımlıyor. Bu, **her adımın tek veritabanı ACID transaction’ına katıldığına kanıt değil**. OrderGroup dokümanı ayrıca captured payment split işleminin payment event subscriber’ında checkout yanıtından sonra gerçekleşebileceğini açıklıyor.
- **UNVERIFIED:** Canlı DB şeması, Redis/event-bus sağlayıcısının deployment’ta fiili seçimi, event’lerin teslim/retention/retry SLA’sı, production logging sink’i ve bu kodun çalışır runtime davranışı incelenmedi.

Sürüm ve domain bulguları için A1’deki dosya/model incelemesi bu devam görevinde esas alındı. Kurulu modelin bazı ayrıntıları — örneğin Seller için tek `currency_code`, seller member’ların seller scope’u ve payout hesabının Seller’a link’i — `Seller modeli`, `SellerMember`, `Offer` ve `PayoutAccount` implementasyonunda doğrulandı.

---

## 3. Alternatives A/B/C

### A — Shared Medusa Application

DoğruAdres çekirdek ve iş domain’lerinin tamamını aynı Mercur-backed Medusa API’de custom module’lar olarak kurar.

**Güçlü yönleri:** Resmî Medusa module/link/workflow/route uzantılarını kullanır; Organization üyeliğiyle seller/workspace bağlamını aynı server-side request’te denetleyebilir; marketplace checkout ve organization kararları için ağ sınırı oluşturmaz; operasyonel olarak tek backend release/runtime çizgisi sunar.

**Zayıf yönleri:** Platform ve çok sayıda iş uygulaması tek server dağıtımına, dependency graph’ına ve release temposuna bağlanır. Module isolation tablo/servis sahipliğini ayırır ama tenant erişim kontrolünü, ayrı veri tabanı güvenlik sınırını veya ayrı deploy’u sağlamaz. Büyük/bağımsız yaşam döngülü uygulamalar zamanla core API’nin yükünü ve blast radius’unu artırabilir.

### B — Independent DoğruAdres Backend

Organization/identity/entitlement ve business domains ayrı backend’de; marketplace yalnız desteklenen Mercur/Medusa API’leri ve events üzerinden kullanılır.

**Güçlü yönleri:** Platform çekirdeği bağımsız release/scale edilebilir; farklı storage/security/deployment politikaları mümkün; external ERP’ler için açık entegrasyon katmanı olur.

**Zayıf yönleri:** Tek kullanıcının auth/organization context’i iki backend’de tutarlı çözülmelidir. Organization yetkisi, checkout çağrısından önce harici API’ye sorulursa ağ arızası ve stale authorization riski oluşur; sonrasında sorulursa sipariş/finans kararı geç kalabilir. İki taraftaki değişiklikler tek ACID transaction içinde olmaz; event teslimi, idempotency, retry, reconciliation, API versioning ve partial failure yönetimi gerekir. Bu baseline’da organization-aware marketplace API’si hazır değildir; desteklenen API’ler üzerinden custom endpoint/contract gerekebilir.

### C — Selective Hybrid (önerilen)

- **İlk etapta aynı Medusa uygulama/runtime:** DA Identity↔Organization mapping, membership/authorization, verification, application entitlements, organization-private catalog/profile/business data ve ilk iç business modules için project-owned Medusa modülleri.
- **Mantıksal ayrım:** Her modül kendi domain verisinin otoritesi; cross-domain erişim public service yerine workflow + Query/module links ve dar adapter’larla. Bu, code-level ownership sağlar; private tenant records için ayrıca her okuma/yazma scope’u zorunludur.
- **Marketplace’in sahibi:** Mercur/Medusa; Seller/Store, Offer, shared commerce Product/Variant, cart/order/payment/fulfillment, marketplace commission ve seller payout. Organization→Seller bağlantısı DoğruAdres’e ait yetkilendirme/ownership bilgisidir; Seller’i Organization’a dönüştürmez.
- **Asenkron sınır:** Order olaylarından Basic Accounting, notifications ve dış ERP’ye aktarım, idempotent subscriber/job ile eventually consistent yapılabilir. Accounting optional kalır ve kullanılamaması marketplace checkout’ı bloke etmez.
- **Gelecekte bağımsız süreç:** Gerçek bağımsız deploy/ölçek, ayrı güvenlik/compliance alanı, üçüncü taraf ürünün kendi deployment’ı veya release temposu gerektiren domain’ler sonra ayrıştırılır. “Aynı monorepo” zorunluluğu yok; “aynı deployable” da kalıcı karar değil.

**A ile C farkı:** Kod bugün aynı uygulamada olabilir; C, bu yerleşimi tüm domain’leri Medusa’ya kalıcı olarak bağlama kararı olarak görmez. Marketplace işlem çekirdeğini Mercur’de tutar, DoğruAdres modüllerinin sahipliğini ve olası extraction sınırlarını en baştan görünür tutar, yalnız gerçek ihtiyaç halinde ayrı process’e çıkarır.

---

## 4. Detailed comparison matrix

| Ölçüt | A — Shared Medusa app | B — Ayrı DA backend’i | C — Selective hybrid |
|---|---|---|---|
| Mimari uygunluk | İyi; marketplace ile business core aynı host | Ayrı ürün sınırı net; ilk faza ağır | **Çok iyi; marketplace işlem sınırı korunur, DA domain’i ayrı sahipli** |
| Multi-tenant security | Tek backend’de authorization daha az hop; her DA modülünde tenant filtresi şart | Ayrı backend veri sınırı olabilir; actor/context/API trust iki yerde korunmalı | **Başlangıçta aynı process’te authorization kolaylaştırır; DA modülü kendi tenant scope’unu uygular** |
| Geliştirme karmaşıklığı | Orta; extension code ve dependency’ler aynı uygulamada | Yüksek; API/event contracts ve distributed state | **Orta/düşük başlangıç; gerektiğinde bağımsız servis** |
| Operasyon karmaşıklığı | Düşük/orta; backend tek dağıtım birimi (worker ayrımı hariç) | Yüksek; iki servis, ağ, secrets, deploy, health/retry | **Düşük/orta; başta ayrı DA process yok** |
| Mercur 2.3.6 uyumu | Custom modules/extensions doğrudan uyumlu | API-first konsept uyumlu; gerekli organization integration API’leri henüz yok | **En iyi denge; documented extension points, core fork yok** |
| Upgrade resilience | Orta; domain modülleri public Medusa API’de kalırsa iyi, gereksiz iç kullanım riski var | İyi framework izolasyonu; API kontratı değişimleri etkiler | **İyi; Mercur’e yalnız adapter üzerinden bağımlılık** |
| Yeni modül ekleme | Hızlı; büyük monolit/API’ya bağlanma riski | Domain’ler ayrı; her biri entegrasyon ve deployment ekler | **Hızlı; modül önce logical boundary, bağımsız süreç ancak gerekirse** |
| Transaction tutarlılığı | Workflow compensation var; tek ACID varsayılmaz; event yine async | Distributed transaction yok; saga/outbox/reconcile gerekir | **Checkout gerekli synchronous check’leri tek workflow’da tut; consumers async/idempotent** |
| External systems | API/provider/subscriber yapılır; aynı runtime’da connector | Connector platform’a doğal olarak ait; external API’ler yine eventual | **DA-owned adapter + event; external system doğal ayrı process olabilir** |
| Test karmaşıklığı | Modül, API ve tenant izolasyon testleri | Contract, failure/retry, integration/e2e ağırlıklı | **Domain unit + API/contract + marketplace workflow boundary testleri** |
| Uzun vadeli bakım | Modülerlik disiplini korunursa iyi; tek release coupling artabilir | Service ownership net; distributed ops yükü kalıcı | **Kademeli büyüme ve açık extraction path’i; sınır disiplini gerekir** |
| Büyüyünce migration flexibility | Orta; aynı app’in module/link contracts’ı extraction’ı kolaylaştırabilir, cross-module assumptions zorlaştırabilir | Yüksek bağımsızlık; distributed complexity zaten mevcut | **İyi; deploy ayrımına kanıta göre ilerler, başta erken microservices yok** |

Nitel değerlendirmelerdir; ölçülmüş performans veya parasal maliyet tahmini değildir.

---

## 5. Recommended platform core placement and module/data map

| Domain | Otoritatif sahibi | İlk fiziksel yerleşim ve entegrasyon | Diğer modüller için erişim |
|---|---|---|---|
| Login/authentication | Kullanılan auth provider / Medusa actor altyapısı; ortak kişi-account eşlemesi DoğruAdres domain kararı | Medusa uygulamasında DA identity mapping modülü/adapter’ı; protokol A5’e bırakılır | Yalnız identity reference/claims; e-posta benzerliğiyle otomatik merge yok |
| Legal Organization ve verification | DoğruAdres | Ayrı project-owned module ve workflow; evidence/access permissions org-scoped | Organization ID ve doğrulanmış status referansı; kopyalanmış legal profile yerine link/sınırlı projection |
| Membership, roles, permissions | DoğruAdres | DA module; request middleware/route guard + workflow assertion | Her read/write’da membership ve permission kontrolü; UI-only check yok |
| Organization→Store ownership/approval | Organization relation/approval kararı DA; marketplace Seller lifecycle Mercur | DA module–Seller module link/adapter; Seller creation/approval workflow’larıyla entegrasyon | Seller ID’ye referans; marketplace status authoritative Mercur’de, Organization authority DA’da |
| Applications/entitlements | DoğruAdres | Policy/entitlement modülü; ilk sürümde business app code’u aynı deployment’ta olabilir | Runtime entitlement check: active/mandatory/default/recommendation. Org app enable etmek kod kurmaz veya yeni servis deploy etmez |
| Shared catalog / marketplace offers | Medusa Product/Variant + Mercur Offer | Aynı Mercur API; private attributes master’a yazılmaz | Product/Variant/Offer IDs ve supported queries/links |
| Private product, private/global brand ve automotive data | DoğruAdres | Ayrı project-owned catalog/automotive modules; private→master mapping ayrı workflow/link | Org-scoped private records; master public reference; merge/audit geçmişi korunur |
| Carts, checkout, orders, returns/refunds | Medusa commerce; Mercur seller split/OrderGroup | Aynı Mercur workflow sınırı; buyer Organization context için özel adapter/association gerekir | Customer/order IDs yanında “hangi organization adına” referansı; doğrudan foreign table erişimi yok |
| Seller commissions ve payout | Mercur | Mercur commission/payout workflows ve Seller başına payout account | DA raporu payout/commission reference ve event’leri okur; seller settlement ledger’ını yeniden oluşturmaz |
| Basic Accounting | DoğruAdres, eğer ürün içi modül olarak onaylanırsa | İlk etapta ayrı domain modülü; transaction events’den async posting. Market alışverişi bu app’e bağımlı değil | Stable commerce event/order/commission references; accounting entry’leri idempotent, reconcile edilebilir |
| Representative commissions / Loyalty / Kumbara | DoğruAdres | Ayrı domain/financial modules; marketplace commission/payout modelinden ayrık | Referansla bağla; mutable UI totals yerine domain ledger authority |
| External accounting/inventory/ERP | Her external system kendi kayıtlarının sahibi; DA integration mapping/credential state’in sahibi | DA-owned connector/adapter; çoğunlukla event+API ve asynchronous retry | Alan bazında source-of-truth ve sync direction açık; secret’lar loglanmaz |
| Notifications | Event source ilgili domain; delivery/prefs platform domain’i | İlk etapta subscriber/provider boundary, merkezi notification preferences DA-owned olabilir | Event ID + destination reference; retry/delivery status yetkili operasyon alanı |
| Audit | DoğruAdres cross-domain audit domain’i | Append-only project-owned audit records; sensitive operation workflow’larında | Actor/org/request/trace/action/target reference ve redacted change summary |
| Operational logs | Runtime/deployment platform | İlk etapta yapılandırılmış stdout/application logger; mevcut hosting’in log aggregation/alert özellikleri kullanılır | Yetkili operator sorgular; loglarda secret/ödeme/kişisel ayrıntı yok |
| Financial ledgers | İlgili finans domain’i (Mercur seller settlement; DA accounting/rep/loyalty ayrı) | Her domain’in kendi authoritative journal/financial records’ı; operational logs’tan ayrı | Read-only references/reconciliation; ledger kayıtları log-retention kuralına göre silinmez |
| Search/filtering | Kaynak domain + application-level search projection | Önce modülün kendi authoritative query’leri; cross-domain search gerekirse projection/index | Projection gecikmesi/owner visibility açık; tenant filter projection query’sinde de uygulanır |

**Data ownership ilkeleri:**

1. Aynı legal Organization, Seller, Customer ve Person arasında tek kimlik varsaymayın; açık, denetlenebilir mapping kullanın.
2. Her bounded module kendi yazma otoritesidir; diğer domain’in tablolarına doğrudan yazmaz. Medusa docs modüller arası ilişkiyi Module Link, orchestration’ı workflow olarak tanımlar.
3. Module Link bir foreign-domain relationship/read path’idir; authorization veya tenant constraint değildir. Medusa 2.21.2 bundled Mercur docs `query.graph`’ın link alanlarıyla filtrelemediğini; böyle bir ihtiyacın Index Module/query.index veya module-local scope’la karşılanması gerektiğini söylüyor. `query.index` gereksinimi ve kararlılığı ayrıca doğrulanmalı; A2’de yeni bağımlılık önerilmiyor.
4. Commerce product/order/payment, DoğruAdres iş modüllerinde tam kopya yapılmamalı; gerekli kimlikleri ve immutable event snapshot’larını referanslayın. Finansal/audit kayıtlarını sonradan değişen catalog state’inden türetmeyin.
5. Tek PostgreSQL kullanmak ilk etapta pratik olur; aynı DB’deki ayrı module tabloları tenant isolation/RLS anlamına gelmez. Data-level authorization ve gerekirse DB-per-boundary kararı ileride ayrıca alınmalı.

---

## 6. Integration mechanisms and transaction boundaries

### Synchronous request/workflow path

- Route: authentication/context parsing → middleware validation/scope → handler → workflow for mutations / Query for reads.
- Organization context, route parameter/header’dan alınsa bile **server-side identity membership ve permission ile doğrulanmalı**.
- Buyer organization selection ve seller block/eligibility kararları cart completion’dan **önce**, güvenilir synchronous server-side guard’da tekrar doğrulanmalı. Eski cart, değiştirilmiş üyelik veya client price’ın yetkiyi geçmesine izin verilmemeli.
- Checkout group/order ile buyer Organization ilişkisinin yaratılması tek workflow step/hook’e bağlanabilir mi, hangi hook sırasıyla ve compensation’la çalışır mı; kurulu workflow’da ilgili named hooks görülmesine rağmen **runtime entegrasyonu kanıtlanmadı**. Bağlantı unsuru eksikse checkout/order view’daki org attribution için bespoke API/workflow ihtiyacı vardır. Buyer block check’ini payment authorization’dan sonraya bırakmak güvenli varsayım değildir.

### Workflow ile “transaction” ayrımı

- **VERIFIED:** Mercur/MEDUSA workflow step’leri otomatik compensation sunuyor; hooks yeni step ekleme seam’i. Bu, “başarısızlıkta daha önceki iş adımlarını telafi et” semantiğidir.
- **NOT VERIFIED:** Bütün module yazımlarının ortak SQL ACID transaction’ına girdiği, external provider call’larının gerçekten geri alınabildiği veya event’in DB commit’iyle atomik yayımlandığı kanıtlanmadı.
- Finansal ledger’ı telafi etmekte satırı silmek yerine reversal/adjustment entry gerekliliği ürün/finance kararına bırakılmalı.

### Async/event path

- Mercur docs event subscribers’ı dış sistem bildirimi, indexing ve side-effect’ler için tanımlar; idempotency ve retry davranışı tasarım sorumluluğu. Kurulu deployment’ın gerçek delivery guarantee’i **UNVERIFIED**.
- Accounting, notifications, ERP sync, search projection ve retention cleanup normalde async olmalı; durable job state, bounded retries, idempotency key, explicit error status ve reconciliation gerekir.
- Checkout’ın başarı/komisyon/order authority’si subscriber tamamlanmasına bağlanmamalı. Kayıt gecikse dahi sonradan tekrar işlenebilmeli; reconciliation unpaid/missing order posting’lerini tespit etmeli.

### Approach başına cross-boundary tutarlılık

- **A:** Aynı runtime/DB ve workflow step’leri; request sırasında policy kontrolü daha yalın. Yine de module workflow’larının “tek ACID commit” olduğu varsayılmaz; subscriber’lar eventual.
- **B:** API çağrıları ve events; tek ACID transaction yok. Outbox/saga/idempotency/reconciliation, zaman aşımı, duplicate ve partial failure politikaları gerekir. Marketplace checkout organization authorization servisine anlık bağımlı olursa availability coupling oluşur.
- **C:** Sadece checkout/authorization/Organization↔Order attribution gibi kritik synchronous path’ler aynı uygulama workflow sınırında; accounting/external systems/notification/search gibi yan işlemler async. Sınır gereksiz dual-write üretmeyecek biçimde seçilir.

---

## 7. Ten scenario walkthroughs

| # | Senaryo ve consistency ihtiyacı | A — Shared app | B — Separate backend | C — Recommended hybrid |
|---|---|---|---|---|
| 1 | Login → Organization seç → yetkili app aç. Her API’de permission sync kontrolü gerekir. | Aynı app içinde membership query’siyle context seçilebilir; her private route guard’ı zorunlu. UI launcher authorization yerine geçmez. | DA API org context’in tek otoritesi olabilir; Mercur API’ye aktarılan identity/org assertion ve seller authorization sınırı tasarlanmalı. | Auth protocol A5’e ertelenir; ilk app/API authorization DA module’da, marketplace’e ihtiyaçta adapter. Launcher item görünürlüğü entitlements + permissions’dan türetilir. |
| 2 | Organization opsiyonel app’i etkinleştirir. Entitlement update sync; background provisioning eventual olabilir. | Entitlement row/workflow same runtime; code deploy olmadan activation. | DA backend entitlement’ı yazar; marketplace/API cache varsa sync/TTL invalidation gerekir. | Aynı runtime’da entitlement workflow; mevcut uygulamalar policy change ile otomatik kapanmaz. App access gate’i gerçek server API’de uygulanır. |
| 3 | Bir Organization iki Store sahibidir; payout’lar bağımsız. Ownership/approval sync; provider payouts ayrı lifecycle. | DA org-store relation + iki Mercur Seller. Mercur Seller bazında payout context sağlar; store statements formatı ayrıca doğrulanmalı. | Ownership DA backend’de; Seller’lar Mercur’da. Create/approve/payment state orchestration network/event ve reconciliation ister. | DA relation ve Mercur Seller workflows aynı backend boundary’de; ayrı seller account/payout context kalır. Seller currency limitation halen A4 riski. |
| 4 | Private product shared marketplace product’a eşlenir. İlişki yazımı sync olabilir; catalog/search projection eventual olabilir. | DA private record + Medusa Product ID Module Link/workflow ile; private fields private kalır. | İki API arasında private record, canonical ID ve match decision senkronize edilir; conflict/duplicate resolution gerekir. | Önce DA-owned private/catalog domain; master ID’ye explicit reversible mapping. Aynı app’te link/Query; ileride API contract korunur. |
| 5 | Seçilmiş org adına multi-store cart checkout. Org membership/block/price sync; event consumers sonradan. | Workflow precheck membership/org; split checkout Mercur. Buyer org attribution step/hook; test edilmeden hook fit’i garanti değil. | DA permission check/lease/token ardından Mercur checkout. Arada membership/block değişikliği ve API fail race; checkout token/transaction protocol gerekebilir. | Critical synchronous org authorization + Mercur checkout same runtime; buyer Organization mapping order context’te linklenir. Payment/subscriber operations yine asynchronous olabilir. |
| 6 | Marketplace transaction Basic Accounting’e event üretir. Commerce order synchronous; posting normalde eventual. | Same app module event subscriber; idempotent posting + retry/reconcile. Accounting inactive ise posting zorunlu değil, satış sürer. | Mercur API/webhook → DA backend; webhook delivery/retry/outbox ve duplicate handling gerekir. | Same-runtime DA Accounting consumer; event boundary açık ve accounting availability checkout’u bloklamaz. Ledger source-of-truth DA modülüdür. |
| 7 | Organization external accounting kullanır. External sync eventual/reconciled; purchase path’inden ayrık. | DoğruAdres connector module/provider ve async job; external idempotency/reconciliation. | Native fit; backend API contracts, secret storage, per-org connector isolation ve ops runbooks gerektirir. | DA integration adapter same runtime’da başlayabilir; external endpoint ayrı sistemdir; yük/independent lifecycle kanıtlanınca connector process ayrılabilir. Bigcapital bu adımda seçilmez. |
| 8 | Store commission veya buyer-block checkout’ı etkiler. Fiyat/block/payment authorization kararları synchronous server-side. | Mercur seller/product rule mevcut commission için çalışır; block yeni DA rule olarak completion öncesi guard. Stacked commission destekleniyor varsayılmaz. | DA policy call veya doğru zamanda kopyalanan rule; stale cache sonucu yanlış satış/fee riski ve API dependency. | Mercur commission owner kalır; yeni buyer block DA policy. Org+store policy guard same checkout path; failure deny/allow davranışı ürün kararıdır. |
| 9 | Product inactive, new sale kapanır, tarihi erişim korunur. New-sale status sync; history retention/lifecycle durable. | Product availability ve order snapshot ayrılır; DA archive/reference policy. Mercur delete/offer effects A1’de görüldü, istenen lifecycle garanti edilmedi. | DA catalog status değişince Mercur Product/Offer availability API’leri güncellenir; sync failure tutarsız olabilir. | DA private history/archive policy ile Mercur marketplace availability adapter üzerinden; historical order/product references korunur. |
| 10 | Cross-module action operational log + audit + financial record üretir. Mutasyon/permission decision sync; logs/alerts/events eventual olabilir. | Workflow actor/org/request context’i module audit record’a aktarır; ledger domain-owned. Operational logs runtime logger. | İki backend correlation IDs gerekir; remote partial failure gözlemlenebilir olmalı, audit/financial authority bölünmemeli. | Ortak correlation envelope; audit ve ledger kendi owner’larında persist edilir; logs’ta references only. Event side effect’ler retry/idempotent. |

**Transaction özeti:** Aynı process olması API latency’yi ve coordination’ı azaltır, fakat otomatik olarak ACID değildir. Tek workflow’daki mutation+link steps için compensation beklenebilir. Harici API, worker subscriber, payment provider, e-posta ve indexing işlemleri tek SQL transaction değildir; eventual consistency/retry/reconciliation varsayılmalıdır.

---

## 8. Logging, audit and observability recommendation

Bunları ayrı sistem/sorumluluklar olarak kurun:

### Operational logs

- İlk sürümde mevcut runtime logger ve yapılandırılmış stdout logları; uygulama/host log toplama özellikleri yeterli. Ayrı ELK/OpenTelemetry/observability platformu veya zorunlu üçüncü taraf telemetry bu aşamada gerekmiyor.
- Alanlar: timestamp, severity, service/module, environment, request/correlation ID, workflow/job/event ID, actor ID, Organization ID (yalnız gerekiyorsa), operation, error class/code. Kullanıcı girdisi, token/cookie/secret, payment instrument ve gereksiz PII redakte edilmeli.
- Configurable retention/severity host policy’den; authorized platform operator dışında log erişimi yok. Kritik checkout/payout/security/job failure için alert; alert payload’ı hassas veri taşımamalı.
- Periyodik job’lar bounded batch, idempotency key, retry limit/backoff ve reconciliation ile çalışmalı. Hatalı scheduled deletion operasyonel log’a ek olarak **persist edilmiş job/deletion status + neden + retry/terminal state** bırakmalı; log retention o nedeni silmemeli.

### Audit records

- Permission değişimi, identity/organization verification, owner/role, Store approval, commission policy, block/price policy, deletion/restore ve platform decision için append-oriented audit domain records.
- Actor, action, target reference, Organization context, reason/approval, timestamp ve correlation ID; değişiklik özeti redacted olmalı. Audit tablosu application log yerine geçmez; UI’dan sessizce update/delete edilemez. Audit read authorization’ı ayrı tanımlanmalı.
- Satın alma ve admin mutation event’leri için audit kaydı gerekiyorsa synchronously persisted olmalı ya da kaybı saptanabilen durable outbox design’ı ayrıca onaylanmalı.

### Financial ledgers

- Mercur commission/order/payout authority’si kendi domain’inde; DA accounting, representative commissions, Kumbara ve adjustments kendi ayrı financial domain’lerinde. Operational logs’dan ayrı, immutable/reversal mantıklı source records.
- Günlük log’lardan finansal tutar türetilmez. Payout/commission audit verisini düz metin operational log’a basmayın. Merchant/store ve currency context finans domain’inde kayıtlı olmalı.

**Başlangıç önerisi:** yeni dış telemetry altyapısı kurmadan structured application logs + seçilen deployment host’un merkezi log görüntüleme/alert’i; DA-owned audit ve financial records için ayrı modüller. Merkezi sorgu “merkezi veritabanında herkese görünür” demek değildir; role/organization sensitivity’e göre yetkili admin access uygulanmalı. Framework logger’ın prod’da hangi output formatını verdiği ve host’un mevcut retention/alert yeteneği **UNVERIFIED**.

---

## 9. Security and upgrade considerations

- **Tenant:** Mercur `/vendor/*` çağrılarını authenticated Member’ın seçili Seller’ına daraltıyor; Organization authorization sağlamıyor. DA routes’da user-selected `organization_id` membership/role doğrulanmadan kullanılmamalı. `query.graph` link’le alan filtrasyonu yapmadığından organization boundary’yi yalnız ilişki traversal’ına bırakmayın.
- **Buyer checkout:** Customer ve Seller Member ayrı actor kavramlarıdır. Buyer Organization adına satın alma ilişkisinin cart/order lifecycle’ında tutulması ve checkout’ta tekrar doğrulanması gerekir; UI state veya eski cart metadata yetki kanıtı değildir.
- **Store privacy:** Platform admin’lerinin Organization-private data’ya unrestricted erişimi olmamalı. Ops personel erişimi break-glass/role-based/audited olmalı; seller payout scopes Mercur’ün Seller sınırında kalmalı.
- **Pricing:** Client fiyatına güvenmeyin. Segment price, buyer block ve commission input’ları backend’in authoritative data/rules’ından hesaplanmalı; offer/promotional adjustment uygulanırken block/price eligibility checkout tamamlamada yeniden doğrulanmalı.
- **Deletion:** Archive/recycle-bin, soft-delete ve cascade farklı semantiklerdir. Order/ledger/audit referanslarını destructive cascade’e bırakmayın; final integrity-check ve retention policy gereklidir.
- **Workflow events:** Async subscriber duplicate, failure veya gecikme gösterebilir. Consumer idempotent ve reconciliation yapılabilir olmalı; bu işler authorization veya checkout decision’ı yerine geçmez.
- **Upgrade:** Public Medusa module/link/workflow/route API’leri ve Mercur 2.3.6 docs’unu izleyin; `@mercurjs/core/.medusa/server` internal compile paths doğrudan customization contract değildir. Mercur/Medusa upgrade’lerinde hook signatures/order, auth/middleware, links, generated routes, event payloads ve payout/payment lifecycle yeniden doğrulanmalı.
- **Extension hook evidence:** Kurulu split workflow’da hook isimleri ve yerleri incelendi; bu, DoğruAdres hook consumer’ının runtime’da doğru sırada çalıştığını kanıtlamaz. Checkout integration öncesi hook contract’ı, compensation ve auth behavior test/approval gerektirir.
- **Core fork/patch:** Bu araştırmada A/B/C arasında core değişikliğini zorunlu kılan bir blocker kanıtlanmadı. Bu yüzden core modification veya fork önerilmiyor.

---

## 10. Consequences for future Bigcapital integration

- Bigcapital satın alma/kurulum/ürün kararı değildir; bu A2’de karar verilmedi.
- İleride dış muhasebe kullanılırsa marketplace kullanımı DoğruAdres Basic Accounting’e bağımlı olmamalı. Basic Accounting entitlement kapalı olsa da Mercur checkout, seller settlement ve payout çalışmaya devam etmeli.
- Hangi muhasebe sistemi seçilirse seçilsin, financial ownership alan bazında belirlenmeli: Mercur order/commission/payout records marketplace settlement’ın; muhasebe entegrasyonu journal/accounting treatment’ın otoritesi olabilir. Aynı ödeme/yükümlülüğü iki sistemde bağımsız biçimde “authoritative” tutmayın.
- Integration layer DoğruAdres-owned olmalı: per-Organization credentials/reference, external IDs, mapping, webhook/API signature validation, idempotency, retry, rate-limit/error handling, reconciliation ve audit. Secret’lar logs’ta görünmemeli.
- Orders/commission/payout event’lerinden accounting post etmek **eventually consistent** modeldir. Gecikme/başarısızlık checkout’u geri alamaz; persistent sync status ve reconciliation gereklidir. Double-entry, tax, Kumbara promosyonu, accounting period ve adjustments gibi detaylar finans tasarımı/Bigcapital feasibility adımlarında kararlaştırılmalı.

## 11. Consequences for first-release multi-currency support

- Kurulu Mercur Seller/Store modelinde tek `currency_code` mevcut; bu, Organization’ın çok para birimi gereksiniminin çözümü değildir. Aynı Organization’ın ayrı currency’li birden fazla Store’a bölünmesi approval/business identity/store count şartlarını bozabilir ve her mağazanın bağımsız kayıtlarını çoğaltır.
- Mercur Commission docs fixed rate için per-currency values tarif ediyor; bu, end-to-end offer price, cart, promotion, tax, payment, refund, seller payout ve financial statement çok para birimlidir anlamına gelmez.
- Tercih edilen C sınırı currency kararı için uygundur: her parasal iş kaydı ait olduğu marketplace/finance domain’inde currency taşımalı; Organization default currency’yi tüm record’lara zorla yaymamalı. Kur dönüşümü için kur kaynağı/tarihi/rounding/sorumlu taraf A4’e bırakılmalı.
- **A4’te ayrıca ispatlanması gerekenler:** Mercur 2.3.6 checkout ve settlement currency behavior; seller payout account currency; mixed-currency cart; refund/cancel; provider capability; buyer segment prices; fixed/percentage commission; tax/shipping; rapor ve ledger conversion. Bu A2’de kod veya uyumluluk testi yapılmadı.

---

## 12. Open decisions requiring product-owner approval

1. **C/modüler monolit yerleşiminin onayı:** DA core modüllerinin başlangıçta Medusa uygulama/runtime’ında ama ayrı domain ownership ile bulunması kabul ediliyor mu? Shared DB, security boundary konusunda özel ek koşul isteniyor mu?
2. Bir Organization’a birden fazla Mercur Seller/Store bağlanabilir; her Store tam olarak tek bir legal Organization’a mı aittir? Co-ownership/istisna var mı?
3. Organization context’in checkout sırasında OrderGroup/Order’a nasıl kalıcı bağlanacağı; buyer-block failure ve price eligibility durumlarında deny/allow davranışı nedir?
4. Platform person/auth ile Medusa Customer ve Mercur Member arasındaki identity eşlemesi ve ownership (A5 auth protokolü hariç, ürün kimlik semantiği) nedir?
5. Cross-module audit’in synchronous requirement’i ve hangi admin/support rolünün Organization-private audit’i görebileceği nedir?
6. Accounting aktifken posting hataları checkout’u hiçbir durumda bloke etmemeli mi? (Buradaki öneri: evet, muhasebe ingestion eventual; market commerce authority’si ayrı.)
7. Üretim başlangıcında tek Medusa shared server/worker instance mi, yoksa Mercur self-host örneğindeki ayrı server+worker deployment mı tercih edilecek? Bu bir deploy/availability kararıdır; ayrı DA backend kararı değildir.
8. DoğruAdres modüllerinden hangileri ileride bağımsız process/database release gerektirecek? A2 için somut bir gereklilik kanıtlanmadı; premature service split önerilmiyor.

---

## 13. Questions reserved for A3–A6

- **A3 — Bigcapital/Accounting:** Ürün seçimi, deployment/lisans, native accounting vs external integration, data ownership ve finansal reconciliation.
- **A4 — Multi-currency:** Mercur/Medusa 2.3.6 end-to-end support, kur/settlement, mixed currency checkout/refund ve currency ledger tasarımı.
- **A5 — Authentication:** Identity provider/protocol, account linking, session/token biçimi, organization context taşıma ve actor’lar arası permission enforcement.
- **A6 — Release scope:** Hangi business apps/flows ilk release’te olacak; activation/default/mandatory UX ve teslim önceliği.
- Her adımda ayrıca ilgili onaylı ürün gereksinimlerinin gerçek workflow/API kontratlarına nasıl oturduğu, ayrı bir tasarım/implementation onayı olarak ele alınmalı.

---

## 14. Evidence index

### Yerel governance ve uygulama

- `AGENTS.md` — docs-first, core modification escalation, architecture/auth/DB approval gates.
- `DoğruAdres README`, `ARCHITECTURE.md`, `PRINCIPLES.md`, `MERCUR-INTEGRATION.md`, `SECURITY.md`.
- `Root package.json` — Bun monorepo/workspaces; `API package.json` — pinned Medusa/Mercur dependencies; `medusa-config.ts` — `withMercur`, database/Redis config points and modules.
- `API modules README`, `links README`, `API middleware`, `storefront subscriber`.
- `Installed Seller model`, `SellerMember`, `Offer model`, `PayoutAccount`.
- `Installed split checkout workflow` — seller grouping around lines 97/109; order creation around 240; `beforePaymentAuthorization` hook around 403 and `orderGroupCreated` around 426; source-map output was avoided in response detail. `OrderGroup order link`, `Order–Seller link`, `Seller–PayoutAccount link`.

### Version-matched Mercur documentation

- `Bundled architecture docs` — single deployable backend, module boundaries, API surfaces and extensions; workflow sections `line 141` and security scope `line 299`.
- `Workflow best practices` — workflow/compensation semantics; compensation detail `line 63`; `subscriber/job best practices` — async, idempotency and retry concerns.
- `Module isolation/link guide`, `Module Links`, `API route guide`, `API conventions`.
- `Order Groups` — per-seller orders, group, captured payment split and subscriber timing; `Commission docs`; `Payout docs`; `Seller Members`; `self-host deployment` — server/worker deployments.

### Official references

- Mercur 2.3.6 release notes: https://www.mercurjs.com/updates/mercur-2-3-6-release
- Mercur `v2.3.6` source — [Seller model](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/modules/seller/models/seller.ts), [Offer model](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/modules/offer/models/offer.ts).
- Medusa module links: https://docs.medusajs.com/learn/fundamentals/module-links
- Medusa module isolation: https://docs.medusajs.com/learn/fundamentals/modules/isolation

---

## 15. Git status and no-modification confirmation

- **Başlangıç Git statusu:** `## master`; untracked `.vscode/` ve `DESIGN.md`.
- **Bitiş Git statusu:** aynı — `## master`, `?? .vscode/`, `?? DESIGN.md`. İki korumalı yol mevcut.
- `git diff --quiet` ve `git diff --cached --quiet` çıkış kodu `0`; tracked veya staged değişiklik yok. Hedeflenmiş kaynak listelemesinde DoğruAdres `modules` ve `links` alanlarında yine yalnız README’ler var.
- **Kesin onay:** Bu A2 incelemesinde proje dosyası, config, Git index/status veya database kaydı değiştirilmedi; paket kurulmadı; migration/build/seed/test çalıştırılmadı; untracked `.vscode/` ve `DESIGN.md` dosyalarına dokunulmadı; rapor yalnızca bu Agent yanıtında sunulmuştur.

**A2 sonucu:** Seçici hibrit/modüler monolit tercih edildi; ilk aşamada ayrı DoğruAdres backend process’i önerilmiyor. Bu, ürün sahibinin mimari onayına sunulan öneridir; uygulanmadı ve A3’e geçilmedi.