# G0 / Step 3-Q — Business Decisions and Calendar Feasibility

**ARCHIVED DECISION-RECONCILIATION RESEARCH — REQUIREMENTS REMAIN DRAFT**

Hazırlama ve kaynak inceleme tarihi: 2026-10-10. Bu tarih geçmiş konuşmaların onay tarihi değildir. Bu rapor current owner kararlarını ve feasibility evidence’ını ayırır; accepted baseline, ADR, implementation plan veya payment-provider selection değildir.

## 1. Kapsam, yetki ve kaynaklar

Yetki yalnız [REQUIREMENTS.md](../REQUIREMENTS.md) amendment’ı, bu tek yeni rapor ve [research index](README.md) içinde tek registration’dır. Root [AGENTS.md](../../../AGENTS.md), [project router](../README.md), [PRINCIPLES](../PRINCIPLES.md), [ARCHITECTURE](../ARCHITECTURE.md), [SECURITY](../SECURITY.md), [MERCUR-INTEGRATION](../MERCUR-INTEGRATION.md) ve accepted [ADR-0001](../adr/ADR-0001-mercur-as-marketplace-engine.md), [ADR-0002](../adr/ADR-0002-automotive-domain-isolation.md), [ADR-0003](../adr/ADR-0003-mercur-core-modification-policy.md) precedence/boundaries korunur. Yeni mimari boundary veya authorization/payment implementation seçilmedi.

Tam current109-record draft ve [G0-S3-R](G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) özellikle §§4/7/8/9/10; [G0-S2](G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §§2/4/6/10; [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§3/7/11/15; [A5](A5-canonical-identity-organizations-and-authorization.md) §§5/12; [A6](A6-development-roadmap-and-release-sequencing.md) §§6–9/13; representative/business context için [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§7/8 ve [A2](A2-platform-core-placement-and-integration-topology.md) §7 kullanıldı. A1–A7/A3-R arşivinin tarihsel recommendation’ları açık current owner decision’ın yerini almaz.

Installed Mercur documentation index `node_modules/@mercurjs/docs/llms.txt`, payout/store/Offer ve commission ilgili sayfaları version-matched evidence olarak incelendi. Mercur2.3.6/Medusa2.21.2 mevcut source companion navigation REQUIREMENTS §13.1’de korunur: [Mercur seller model v2.3.6](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/modules/seller/models/seller.ts), [create payout workflow v2.3.6](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/workflows/payout/workflows/create-payout.ts), [Medusa refresh-cart-items v2.21.2](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/core-flows/src/cart/workflows/refresh-cart-items.ts). Framework capability DoğruAdres calendar/representative policy implementation kanıtı değildir. Herhangi bir built-in provider mevcut olması product-owner provider seçimi değildir.

Current **G0-S3-Q user instruction §§3–6** explicit conversation provenance’dır. Original historical transcript/permalink sağlanmadı; önceki raporlara olmayan approval kanıtı yazılmadı. Web incelemesi read-only public official documentation’dır; API key/account/purchase veya live integration kullanılmadı.

## 2. Current kararlar ve requirement mapping

| Owner decision | Mevcut kayıtlar | Uygulanan documentation sonucu |
|---|---|---|
| C-01 / §3 | DA-FIN-007 | Calendar capability investigation/planning, auditable internal abstraction direction, platform schedule authority; Friday ve next eligible banking-day approved initial preferences. Operational contract OPEN |
| C-02 / §4 | DA-LOY-006/010, DA-FIN-005 | Auditable transfer T old NEW accrual’ı hemen keser; earned/history korunur; no overlap/retroactive award; Lost Customers bounded visibility |
| C-04 / §5 | DA-MKT-012/013 | Store commercial settings ve user personal preferences ownership ayrıldı; iki record PROPOSED/RECOMMENDED→APPROVED/VERIFIED current explicit instruction |
| C-04 / §5 | DA-MKT-002/003/006/007/008, DA-FIN-002 | Offer source semantics/no display-driven seller repricing/six currency layers; controlled TRY publication ve preferred TRY first-release settlement korunur; actual charge contract OPEN |
| Final Arabic / §6 | DA-UX-001 | Sole MSA, TR/EN/MSA +RTL; no dialect; O-18 CLOSED/SUPERSEDED |

Toplam **13 mevcut requirement record** doğrudan değiştirildi. Tüm109 original Q-entry IDs korundu, yeni ID0. Lost Customers yeni finansal domain/duplicate transfer policy yaratmadığı için DA-LOY-006 acceptance A–G içine işlendi. DA-LOY-010 period ve DA-FIN-005 earned-right boundaries cross-reference edilir.

REQUIREMENTS §§1/3/6 provenance-glossary; §8 invariants3/4/7/14; §9.4 statistics, §9.5 historical scope annotation, yeni §9.6 decision history; §11 O-07/08/10, C-01/02/04, O-18, yeni O-21/O-22; §12 acceptance; §13 report navigation; §14 change history güncellendi. O-21/O-22 register refs requirement IDs değildir.

APPROVED davranış unresolved mechanics nedeniyle downgrade edilmedi. Technical cache/adapter/storage/ordering/schema/provider recommendations APPROVED implementation yapılmadı. Whole-record distribution **75 APPROVED /29 PROPOSED /4 OPEN /1 DEFERRED**, önce73/31/4/1. All109 implementation **NOT_ASSESSED**; overall **DRAFT — PENDING PRODUCT-OWNER REVIEW**.

## 3. Resmî takvim kanıtları ve sınırlamalar

### 3.1. TCMB processing systems

[TCMB EFT/payment systems](https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB%20TR/Main%20Menu/Temel%20Faaliyetler/Odeme%20Sistemleri/Turkiyedeki%20Odeme%20Sistemleri/Elektronik%20Fon%20Transfer%20%28EFT%29%20Sistemi) sayfası resmî tatiller dışında hafta içi08:30–17:30 ve yarım günlerde13:00’a kadar çalışma belirtir; TCMB farklı saat belirleyebilir. [FAST FAQ](https://fast.tcmb.gov.tr/wps/wcm/connect/fast/sikca%20sorulan%20sorular) ayrı7/24 sistem olduğunu açıklar. Bu saatler provider’ın merchant payout cutoff’u veya arrival garantisi değildir. Provider EFT/FAST erişimi/seçimi bilinmiyor; FAST’tan “her payout her an işlenir” çıkarılamaz. Payout initiation, provider acceptance ve account funds availability farklı events’tir.

### 3.2. Türk resmî tatil/yarım gün kaynakları

[Diyanet’te yayımlanan2429 sayılı Kanun](https://vakithesaplama.diyanet.gov.tr/2429_kanun.php) Republic holiday’ın28 Ekim13:00’da başladığını; Ramazan/Kurban arifesinin13:00’dan başlayan yarım gün olduğunu, bayramların sırasıyla3.5/4.5gün olduğunu gösterir. Bu kamu tatili kuralıdır, provider banking SLA değildir. [Mevzuat consolidated PDF](https://www.mevzuat.gov.tr/mevzuatmetin/1.5.2429.pdf) bu incelemede timeout verdi; current consolidated text için ek hukuk doğrulaması gerekli olabilir. Resmî hosted metin kullanıldı; hukuki danışman görüşü uydurulmadı.

[Diyanet2026 tatil tablosu](https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=158) March19 Ramazan arifesi, March20–22 bayram; May26 Kurban arifesi, May27–30 bayram; Oct28/29 Republic1.5gün gösterir. Tablo gövdesi2026 iken page title2023 kalmış: ingestion yalnız title’a güvenmemeli, year/body/source validation gerekir. [2026 dini günler](https://vakithesaplama.diyanet.gov.tr/dinigunler.php?yil=2026) bayram tarihlerini çapraz doğrular; kandil/Ramazan başlangıcı gibi her observance bank closure sayılmaz.

[Diyanet yıl index’i](https://vakithesaplama.diyanet.gov.tr/dinigunler.php)2022–2035 navigasyonu ve historical calendar bağlantısı sunar; her year/dataset’in machine-readable doğruluğu veya aynı kapsamda half-day bank hours sunduğu doğrulanmadı. Diyanet burada date authority input, TCMB processing windows ve selected provider contract ayrı input’tur. Tüm bankalar için olağanüstü kapanma API’si veya garantili otomatik güncelleme hizmeti olduğu iddia edilmez.

### 3.3. Nager.Date: belgelenmiş exclusion ve güncel source çelişkisi

[Nager.Date README](https://github.com/nager/Nager.Date/blob/main/README.md) Islamic holidays excluded der; aynı belge Communityv4’ü desteklenen, v3’ü2027-01-31 EOL olarak gösterir, offline NuGet/Docker için sponsorship license key gerektirir. Bu exclusion tek başına Türkiye current binary/API coverage sonucuna dönüştürülmedi.

[Official Türkiye provider source](https://github.com/nager/Nager.Date/blob/main/src/Nager.Date/HolidayProviders/TuerkiyeHolidayProvider.cs) Eid methods ve2010–2026 verified-labelled adjustment entries ile2027–2030 tentative entries içerir. [Merged PR1058](https://github.com/nager/Nager.Date/pull/1058) July3,2026 Diyanet alignment correction’ını anlatır. **README exclusion ile current Türkiye source arasında documentation/source inconsistency vardır.** Source inspection deployed API release’inin aynı output’u ürettiği kanıtı değildir; “Nager hiç Türkiye bayramı vermez” veya “eksiksiz bank calendar sağlar” sonucu kurulamaz. Version pin + actual yearly output comparison gerekir; bu görevde integration/test yapılmadı.

[Official API docs](https://nagerholidays.com/tr/api) Communityv4 holiday date/name/types alanlarını gösterir; documented response model intraday/half-day cutoff taşımaz. Public endpoint örneği key içermez; Pro ve offline yetkiler ayrı. [Service terms](https://nagerholidays.com/tr/legal/termsofservice) commercial kullanımda active sponsorship ister, accuracy/availability guarantee vermez. Açık kaynak veya public access sınırsız commercial/free/offline calendar reuse garantisi değildir. Desteklenen ülke web table’ı client placeholders verdi; Türkiye source evidence korunur, canlı country/output doğrulaması eksikliği açıktır.

### 3.4. Holiday API ve Turkey-supporting alternatif

[Holiday API pricing](https://holidayapi.com/pricing) official search-index evidence Countries$249/year, States/Provinces$399/year, commercial use ve years1–2050+ iddiaları gösterdi. [Docs](https://holidayapi.com/docs) search evidence API key gösterdi. Direct pricing/docs erişimi restricted/robots sınırına takıldı; Turkey-specific actual output, half-day schema, religious dates, cache/license/SLA sözleşmesi doğrulanmadı. Bunlar cached marketing evidence’dır, güncel teklif veya satın alma önerisi değildir. Daha okunabilir Turkey candidate olarak Calendarific ayrıca incelendi.

[Calendarific Türkiye2026 page](https://calendarific.com/holidays/2026/TR) Turkey desteğini, Ramadan/Kurban/Republic Eve kayıtlarını doğrudan gösterir; Islamic entries provisional-labelled, observances/astronomical dates de listede yer alır. Eve date presence, half-day hours schema veya Turkish banking correctness kanıtı değildir. Resmî Diyanet/TCMB inputs ile type/date validation gerekir; tüm24 listed item non-processing day sayılamaz.

[Calendarific API documentation](https://calendarific.com/api-documentation) v2 HTTPS GET, api_key/country/year, national/local/religious/observance filters, past/future support, monthly limits ve401/403/429/500/503 davranışını belgeler. Gösterilen holiday response model date/category/location içerir; certified half-day processing interval sözleşmesi doğrulanmadı. Marketing gelecek2049 kapsamı söylese de doğrulanan Turkey örneği2026; entire historical/future output equality audit yapılmadı.

[Calendarific pricing](https://calendarific.com/pricing)2026-10-10 incelemesinde Free500calls/month attribution+limited history/future; Starter$100/year10,000calls/month; Business$500/year50,000calls/month; Enterprise$4,000/year50Mcall/month gösterir. Update cadence sırasıyla free/starter quarterly, business weekly, enterprise daily olarak listelenir. HTML text extraction feature ticks’i kaybettiği için her planda SLA/export/ecommerce feature bulunduğu varsayılmadı. Fiyatlar değişebilir; commercial site suitability marketing contractual caching permission değildir.

[Calendarific terms §§4.2/4.3/7.2](https://calendarific.com/terms) API data cache’ini30calendar-day ile sınırlar, third-party merge/derivative database ve redistribution için restrictions içerir; termination’da data copies removal ister. Pricing attribution claim’i ile terms attribution yükümlülüğü de plan/order bazında teyit gerektirir. **Uzun ömürlü auditable local calendar ve preserved financial evidence hedefi için standart terms uyumu otomatik kabul edilemez.** Cache refresh, cross-source validation, retained derived decision evidence hakları için written license clarification gerekir. Paid provider veya data license seçilmedi.

## 4. Calendar options — feasibility karşılaştırması

| Seçenek | Doğrulanan kapsam | Eksik/engel | Kullanım sonucu |
|---|---|---|---|
| TCMB + resmî annual holiday/law inputs | Banking-system windows, Turkish dates/half-days | Provider cutoff, exceptional closure update feed/structured API, reuse/refresh process | Otorite inputs; internal curated calendar feasibility yüksek, production completeness henüz doğrulanmadı |
| Nager.Date | Türkiye source, public holiday model, Communityv4; current source/README contradiction açık | Half-day intervals yok; deployed release/yearly result; Islamic coverage/version validation; commercial sponsorship | Tek başına authoritative bank calendar uygunluğu kanıtlanmadı |
| Holiday API | Official cached pricing/auth/coverage claims | Direct docs/Turkey/half-day/license verification erişim sınırlı | Elenmiş veya seçilmiş değil; bu görev yeterli provider-specific kanıt sağlayamadı |
| Calendarific | Public Turkey2026 incl religious/eve dates; API/auth/plan docs | Provisional vs official dates, no verified banking hours;30-day cache/merge/license restrictions | Candidate data input; durable audited calendar için commercial contract clarification gerekir |

Bu tablo ürün seçimi veya benchmark değildir; halka açık dokümanların scope/limitations değerlendirmesidir. API response reliability/uptime measured değil. Ücretsiz plan gelecekte provider outage riskini veya historical coverage ihtiyacını karşılıyor varsayılmadı. Farklı kaynaklar source-license audit yapılmadan birleştirilmez.

## 5. Calendar capability — business contract ve açık operational sorular

| İnceleme konusu | Sonuç / requirement sınırı |
|---|---|
| 1 Turkey holiday data | Resmî annual table + law var; Calendarific Turkey2026 görünür, Nager Türkiye source var; hiçbir third-party final authority seçilmedi |
| 2 Full/half day | Closure boolean yetmez: intraday window gerekir. Half-day before/at/after provider cutoff outcome OPEN; tüm gün açık veya tüm gün kapalı otomatik varsayılmaz |
| 3 Religious dates/changes | Diyanet date validation; tentative/provisional ayrı state. Source correction/version izi; her religious observance closure değil |
| 4 Weekend/exception | EFT weekdays; actual chosen rail/provider weekend policy ayrı. General public-sector administrative leave bank closure değildir; exceptional TCMB/provider announcement validation OPEN |
| 5 Public vs banking | Public holiday list, processing window, provider merchant cutoff üç ayrı evidence. FAST7/24 weekly merchant schedule’ı iptal etmez |
| 6 License/pricing | Official/supplier data reuse/caching/derived audit retention permission teyidi; sponsorship/paid contract owner approval ister |
| 7 Auth/reliability | Calendarific key/quota/errors; public Nager availability guarantee yok. Cached local approved calendar mümkün; key/provider seçimi veya API runtime zorunluluğu yok |
| 8 History/future | Year coverage/validated-through date açık gösterilmeli; rolling refresh ve future unconfirmed years policy OPEN, rate archive2005 scope bank calendar’a aktarılmaz |
| 9 Local cache/version | Internal versioned validated calendar recommended: source/version/hash/year/validation timestamp/approver ile reproducible date decisions. Exact storage/schema/cache TTL technical recommendation |
| 10 Manual override | Authorized audited actor/reason/source/interval/approval/history ile exceptional closure/cutoff correction capability değerlendirilir; override roles/dual approval/final authority OPEN |
| 11 Recalculation/notification | Calendar revision affected scheduled payouts’i identify/re-evaluate edebilmeli; previous/new date/reason/history korunur, meaningful change notification capability. Initiated/accepted/in-flight transfer replay veya reversal varsayılmaz; timing/recipient OPEN |
| 12 Provider cutoff | No selected provider: merchant business day, banking rail, acceptance deadlines, reserve/finalized funds, retry/idempotency/cancellation/arrival SLA ayrı future contract |

C-01 **approved investigation/planning direction** şu davranışı hazırlamayı hedefler: internal auditable business-calendar abstraction, validated interchangeable external/official inputs, platform-controlled schedule. Physical adapter, scheduler, database table, outbox/retry teknolojisi seçilmedi. External API instantaneous availability payout-date correctness’in tek dayanağı yapılamaz; exact stale/missing-calendar operational response owner/provider confirmation ister. Financial safety için sessiz incomplete calendar decision yapılmaması acceptance concept olarak kaydedildi; outage’da stop/hold/last-approved fallback’ın kesin seçimi OPEN.

Acceptance concepts (çalıştırılmış application tests değildir):

- Full holiday Friday2026-03-20 örneğinde, yalnız provider weekday calendar/diğer closure yok varsayımsal fixture’ında next day Monday2026-03-23 olur; actual payment initiation/arrival garantisi değildir.
- Half-day2026-10-28’de cutoff öncesi/aynı anı/sonrası farklı fixtures;13:00 TCMB window, provider daha erken cutoff koyabilir. Exact eligible decision policy resolved olmadan beklenen payout date uydurulmaz.
- Calendar revision exceptional closure eklerse uninitiated scheduled-date reevaluation/meaningful notification ve previous version evidence korunur; initiated transfer automatic resubmission yapılmaz.
- Religious provisional date official ile çatışırsa review/validation path; API outage veya missing next-year data silently full-weekday kabul edilmez.
- Payout slider eligible finalized amount limit’i aşmaz ve schedule postpone etmez; bank receipt/viewing DA-FIN-008 authorization’ı korunur.

## 6. C-02 — Representative reassignment ve Lost Customers

DA-LOY-006 mevcut transfer requirement’ı genişletildi. T auditable effective transfer timestamp; E seçilecek financial/business earning-event timestamp’tır. **E order-created/payment-captured/delivery/refund-window gibi bir olay olarak bu görevde seçilmedi.**

| Senaryo | Approved expected business boundary | Açık ayrıntı |
|---|---|---|
| E<T | Eski assignment altında earned haklar/history korunur; yeni rep’e retroactive award yok | Earned/vesting/event qualification |
| E=T | Old NEW entitlement sona ermiş; qualifying event yalnız new assignment scope | Exact earning event / timestamp ordering policy |
| E>T | Old new accrual yok; new qualifying business yeni assignment scope | New rep eligibility/period/rate |
| Pre-transfer refund/dispute afterT | İlgili old transaction correction separate approved financial policy; old rights transfer diye confiscated olmaz | Refund/fraud/dispute adjustment formula |
| Normal warranty | Tek başına automatic vested confiscation yok | Qualified adverse-event handling DA-LOY-011 |

Discussed twelve-month period DA-LOY-010’da owner-relayed historical parameter olarak korunur; new starting/reset/eligibility contractual approval uydurulmadı. TransferT former future accrual’ı planned twelve-month end’den bağımsız keser. New rep’e kalan süre otomatik aktarılmaz. Golden performance-target period temsilci earning period değildir. Platform inactivity90purchase-days OR30human Organization-login-days rule bu transfer deadline yerine kullanılamaz.

Lost Customers acceptance:

- A→B transferinde customer A active portfolio’dan çıkar, historical relationship/reassignment date ile A Lost Customers’a girer.
- A historical earned commission authority varsa yalnız izin verilen geçmiş financial evidence’a erişebilir; current private operations/contacts/future purchases/current customer finance permission geri gelmez. UI ve API/search/export/file checks aynı scope’u korur.
- B→C transferi A history’yi silmez; duplicate transfer processing duplicate customer classification üretmez.
- Customer sonra A’ya reacquired olursa current active classification güncellenir, geçmiş A→B→C→A chronological assignments korunur. Lost view current-vs-historical rendering ve exact filters OPEN; customer aynı current state’te yanlış active+lost sınıflandırılmaz.
- Separate reassignment permission +required approval olmadan transfer denied. Approver model ve backdating/case mechanism future policy.

Kaybedilen Müşteriler yeni requirement ID gerektirmedi: assignment classification, timestamp ve bounded earned-history access aynı invariant’a bağlıdır. Financial ledger corrections ve permissions implementation onaylanmadı.

## 7. C-04 — Ownership ve altı currency layer

| Katman / ayar | Intended authority | Korunan sınır |
|---|---|---|
| Store minimum order/basket, free-shipping, commercial exceptions | Authorized Store commercial policy | User presentation tercihi değildir; amounts/basis/precedence OPEN |
| 1 Authoritative source/list price currency | Relevant Offer/pricing record | Aynı Store farklı currencies tutabilir; buyer display conversion original fiyatı yazmaz |
| 2 Internal price-calculation currency | Price/FX domain contract OPEN | Controlled TRY publication APPROVED; internal calculation algorithm/source units/precision OPEN |
| 3 Display currency +language +browsing country | Personal user preferences / shared UX | Store/Product property değil; account/guest/session persistence OPEN |
| 4 Checkout/payment currency | Marketplace finance/provider contract OPEN | Display/source currency automatic foreign card charge onayı değil |
| 5 Store payout/settlement currency | Independent Store finance/provider contract | Preferred initial TRY direction korunur; foreign source currencies automatic multi-currency payouts değildir |
| 6 Historical snapshot currencies/rates | Protected transaction evidence | Subsequent display/FX changes historical transaction’ı yeniden yazmaz |

**EUR100 source / user displayUSD**: approved behavior sourceEUR100 unchanged, display conversion only and no seller repricing event. Exact USD value için rate series/quote basis/rounding/stale policy resolved değil; örnekde sayı veya selected conversion provider icat edilmedi. Approved controlled/versioned TRY publication source currency semantics’e zıt değildir: source authority ile published projection ayrı. New conversation “underlying operations retain source semantics” actual foreign payment/payout contract’a genişletilmedi.

User country/delivery-country browsing preference checkout’ta actual verified shipping destination ve eligibility yerine geçmez. Preference değişimi seller commercial setting’i, başka user preferences’ını, source price veya business permission’ı değiştiremez.

DA-MKT-012/013 current explicit instruction ile APPROVED oldu; geçmiş approval uncertainty’nin tarihsel raporları rewrite edilmedi. O-07 thresholds/comparison basis, O-06 FX, yeni O-21 actual charge/internal currency/refund/payout interpretation ayrı review items.

## 8. MSA-only ve tarihsel authority ayrımı

Current owner G0-S3-Q §6 binding product scope: **Türkçe, İngilizce, yalnız Modern Standard Arabic; Arabic RTL; ayrı dialect yok**. DA-UX-001 ve glossary/invariant14/current acceptance’tan variant ambiguity çıkarıldı. O-18 CLOSED/SUPERSEDED olarak tutuldu; locale tags, fallback, translation framework/content/process ve accessibility target O-15’te OPEN.

S3-P draft’ında owner-relayed Syrian preference ile MSA ayrımı historical context olarak kalır; REQUIREMENTS §9.5 açık “historical/as-ofP” notu, §9.6 current superseding decision taşır. Bu eski soruya current normative authority verilmez. Archived A1–A7/A3-R/G0 raporları immutable evidence’dır; önceki approval limitation ifadeleri bugünkü açık kararı reddetmez. İncelemede original archived reports’ta ayrı Syrian target için precise approval evidence bulunmadı; böyle bir kaynak uydurulmadı.

Authorized files dışında `docs/dogruadres` Markdown ve DESIGN.md locale/variant taramasında conflicting current Arabic target bulunmadı. DESIGN §16’daki MSA target uyumludur ve completed/accepted UI kanıtı değildir. Başka dosyayı değiştirme gereği bu scan’den çıkmadı.

Diğer approved invariants korunur: central Platform Loyalty Management;90/30 OR/no automatic suspension; Golden ayrı performance criterion ve meaningful badge notifications; independent Store finance/multiple commission components; native optional Accounting; Meydan/Job personal gates; fail-closed authorization; AI/OEM optional/provider-neutral direction; Mercur accepted foundation. Personal identity method/provider **DA-ID-004 DEFERRED**; hiçbir provider seçilmedi veya PoC prerequisite yapılmadı.

## 9. Documentation validation ve bütünlük

Başlangıç Git status (final status aynı grouped paths; REQUIREMENTS/research untracked olduğundan Git diff alone içerik delta kanıtı değildir):

```text
 M docs/dogruadres/README.md
?? .vscode/
?? DESIGN.md
?? docs/dogruadres/REQUIREMENTS.md
?? docs/dogruadres/research/
```

Başlangıç SHA-256:

- REQUIREMENTS.md: `faf16987108a12c9bcc9636eec30a1908a64af8aa3be8bd5ece9e8ad25867295`
- research/README.md: `e5d47a9491d0e54b183cb74d97d0e4628d44cb8eb92bc3c8ae50c2abc0b09c6d`

467 existing tracked/untracked nonignored files başlangıç byte-hash manifest’i memory’de alındı; authorized writes haricinde465 existing files koruma karşılaştırması yapılır. Installed dependencies’e yazma yapılmadı. Filename case-insensitive collision preflight geçti; report exclusive-create ile yazılır, eski report overwrite yok.

Final verification sonuçları aşağıdaki §9.1’e yalnız documentation checks tamamlandığında kaydedilir. Application builds/tests/migrations/seeds/dependency installation yapılmadı; Markdown structure/link/anchor/ID/hash ve Git diff-whitespace kontrolü application test değildir.

### 9.1. Final doğrulama kaydı

- Original109 Q-entry requirement IDs mevcut ve unique; yeni requirement ID0. İlk G0-S2’nin92 ve ilk draft’ın99 ID coverage’ı da korunur. Her requirement’a tek matching explicit anchor var (109).
- Whole-record statuses actual records’tan75 APPROVED/29 PROPOSED/4 OPEN/1 DEFERRED; all109 NOT_ASSESSED; draft marker korunur. İki status promotion yalnız DA-MKT-012/013; approved downgrade0; DA-ID-004 DEFERRED değişmedi.
- Değişen13 records: DA-MKT-002/003/006/007/008/012/013, DA-FIN-002/005/007, DA-LOY-006/010, DA-UX-001. Remaining96 record bodies byte-text unchanged. Zero IDs dropped/renumbered/reused.
- Requirement domain counts: ID6,ORG9,SEC9,APP9,CAT5,MKT13,FIN8,ACC7,LOY11,SOC6,JOB4,AUTO5,AI8,UX3,DATA6 —15domains/109.
- Üç dosyanın Markdown fences/table widths/trailing whitespace ve link/explicit anchor structural checks geçti: REQUIREMENTS330links/109anchors, index14links, report39links; toplam383links (357relative/26external). Relative targets ve fragments resolved. Official external sources read-only reviewed; HolidayAPI direct docs/pricing ve consolidated Mevzuat PDF erişim sınırlaması §3’te açık, tüm web targets HTTP-success iddiası yok.
- git diff --check exit0. Git untracked REQUIREMENTS/report içeriği bu komutun coverage’ı dışında olduğundan custom Markdown/whitespace checks ayrıca yapıldı.
- Initial/final Git short status yukarıdakiyle birebir aynı. Hash snapshot karşılaştırmasında değişen existing files yalnız REQUIREMENTS.md ve research/README.md; new file yalnız bu rapor, deleted file0.465 protected existing tracked/untracked nonignored file byte-identical; parent README pre-existing modification, .vscode/,DESIGN.md ve archived reports korunur.
- Accepted ADR-0001 SHA256 a5f6ffe517fb3d07a87953e39dd8c4c64bb7e403bfd94550738cdab37b21d5e9; ADR-0002 24f67bf8abfec4bb877ae250667bc46d75d5ec7ec82a51b61008a4e801296c2a; ADR-0003 d37586777c19158b67a536f7eebd8e7e519ad2dd7d56430d3b2f77b66e952535; before/after identical.
- REQUIREMENTS final SHA256 `4b808e249597c3d85363ae5b31d182f491d3e61d285eb63c3bef43fdbfbb6e2c`; final217,374bytes/2,324newline-split lines (initial201,183bytes/2,272). Research index final SHA256 `b8368f86a09ecae030c9d5b3f02545f4f080cab36a3a041d9f9ddcabc9fc829e`; delta exactly one registration row.
- C-01 preferences vs provider operational details, E<T/E=T/E>T attribution, Lost Customers history-only access/repeated-transfer/reacquisition, EUR100 sourceUSD display/no seller repricing/TRY continuity ve sole MSA acceptance subclauses text-reviewed. Application verification yapılmadı; implemented iddiası yok.
- Aktif Arabic target contradiction taraması authorized files dışında conflict bulmadı; historical alternative yalnız draft history/this report açıklamasıdır. Framework source references installed evidence’ı replace etmedi; dependency/version change yok.


## 10. Ürün sahibi review için açık kalan kararlar

- REQUIREMENTS §7 DA-FIN-007, §11 C-01/O-08/O-22: provider/banking rail/cutoff/half-day processing, exceptional closure source/authority/override roles, licensed source cache/retained audit evidence, validated horizon, stale/outage behavior, in-flight recalculation/notification and initiation/arrival commitments.
- §7 DA-LOY-006/010/FIN-005, §11 C-02/C-03/O-10: exact E earning event/accrual/vesting, new twelve-month start/reset/eligibility, authorized pre-transfer adjustments, approvers/backdating and historical read boundaries. EffectiveT old NEW cutoff/earned preservation yeniden OPEN değil.
- §7 DA-MKT-002/003/006–008/012/013/FIN-002, §11 O-06/O-07/O-21: actual charge/settlement vs source semantics, calculation/display FX/rounding, threshold bases/currencies/exceptions, guest persistence, browsing vs checkout policy. Preferred TRY direction korunur.
- §7 DA-UX-001, §11 O-15: final locale tags/accessibility/translation process; Arabic variant yeniden seçim beklemiyor, sole MSA.
- Diğer open/deferred questions draft register’da korunur; audit/search/bin proposed scopes, identity-provider DEFERRED ve Accounting detailed design yeni approval almamıştır.

REQUIREMENTS bütün belge olarak **DRAFT — PENDING PRODUCT-OWNER REVIEW** kalır. Bu rapor veya current narrow corrections blanket baseline acceptance, provider purchase, security PoC, ADR, code veya migration authorization değildir. İş burada durur; açık product-owner review beklenir.
