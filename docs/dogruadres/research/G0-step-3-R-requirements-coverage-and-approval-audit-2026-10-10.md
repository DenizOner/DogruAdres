# G0 / Step 3-R — Gereksinim kapsamı ve onay sınıflandırması denetimi

**Archived research — ürün sahibi incelemesine sunulan audit.**

Rapor tarihi: 2026-10-10 (Europe/Istanbul). İncelenen [REQUIREMENTS.md](../REQUIREMENTS.md): **DRAFT — PENDING PRODUCT-OWNER REVIEW**, 99 kayıt / 15 alan; original G0-S2 92 ID + G0-S3 7 ID. Bu rapor requirements acceptance, mimari/ödeme/provider kararı veya implementation plan değildir. Yetkili yazım yalnız bu yeni report ve [research router](README.md) kayıt satırıdır.

## 1. Yönetici bulgusu ve acceptance readiness

**Tam ürün baseline kabulü için hedefli amendment/review gerekir.** Original 92 ID, 99 kayıt içinde benzersiz olarak korunmuştur. Genel kapsam ve approved/implemented ayrımı güçlüdür; fakat yüksek seviyeli record’ın varlığı ayrıntılı ticari kuralların eksiksiz kaydı değildir. Komisyon matrah/limit/görünürlük, payout schedule/eligible slider/PDF, representative accrual/vested rights, application categories ve launcher behavior incomplete veya whole-record PROPOSED altında zayıflamaktadır.

§3.A/B/E’de “earlier approved” olarak aktarılan kuralların kanıtı current product-owner conversation context’tir; arşivde original user message/permalink bulunduğu ileri sürülmez. §3.C/D/F’de exact approval scope veya formula belirsiz olduğunda parametre/ek kapsam teyit bekler. Friday için “proposed/approved” dili belirsizdir. Twelve-month parameter aktarıldı; hangi başlangıca/kişiye/accrual’a uygulandığı kanıtlanmadı. Discount/Kumbara treatment’ın exact yönü uydurulamaz.

REQUIREMENTS.md unchanged ve DRAFT kalır. Bütün99 record implementation NOT_ASSESSED’dır; bu audit software verification değildir. Accepted ADR’ler korunur.

## 2. Kaynaklar, yöntem ve evidence sınırı

Root [AGENTS](../../../AGENTS.md), parent/research routers, REQUIREMENTS’in §1–14 tam metni ve99 record’ın behavior/status/metadata/acceptance/open fields’i karşılaştırıldı. Bu konuşmada okunmuş archived A1–A7/A3-R tam araştırma metinleri ve G0-1/2 doğrudan dosyadan yeniden yüklendi; ilgili final-section paragrafları ve tüm dosyalarda numerical/business-detail taraması ayrıca incelendi. Önceki Agent özeti tek kaynak yapılmadı. A1–A3 tool-export parçaları complete original product discussion değildir.

Governance: [PRINCIPLES](../PRINCIPLES.md), [ARCHITECTURE](../ARCHITECTURE.md), [SECURITY](../SECURITY.md), [MERCUR-INTEGRATION](../MERCUR-INTEGRATION.md), [UPGRADE-POLICY](../UPGRADE-POLICY.md), existing Accepted ADR-0001/0002/0003 (dosyalardaki tarih2026-10-07). SECURITY secrecy/isolation/auditability proposal etiketiyle askıya alınamaz. Root bilinmeyen ürün kurallarını seçmeyi yasaklar; bu audit onları raporlar. Explicit research write izniyle çatışan provision görülmedi.

Installed Mercur docs index ve relevant commission/payout contract pages okundu. Manifestler Mercur docs/core2.3.6, Medusa2.21.2 gösterir. Resmi sürüm etiketli source sayfalarının erişilebilirliği sınırlı kontrol edildi; runtime/API/database proof yok. Current law/vendor/license yeniden araştırılmadı; archived legal/vendor yorumları bugünün hukuki görüşü yapılmadı. Secrets/env okunmadı.

### 2.1. Provenance

S3-R = bu görev §3.A–H owner decision briefing. Historical decisions relayed by owner; original approval date/message ID/permalink verilmedi. Current briefing’in açık approved behavior aktarımı ile repository original approval evidence ayrı tutulur. S3 = önceki draft task §3.A–I, REQUIREMENTS §6/9.1’de kayıtlı. PO-* = G0-2 §2.2 helper labels, P01–P09 = G0-2 §8 proposed architecture topics; accepted ADR değildir.

### 2.2. Altı karar sınıfı

| Sınıf | Audit davranışı |
|---|---|
| Approved business invariant | Accepted outcome korunur; implementation bilinmiyor diye PROPOSED’a düşmez |
| Approved specific parameter | Numerical value yalnız exact scope kanıtıyla;90/30 OR zaten S3 explicit APPROVED |
| Proposed implementation approach | Resolver chain/outbox/schema/RLS/physical boundaries topluca approved olmaz |
| Unresolved implementation detail | Clocks/precision/rounding/transaction/funds states OPEN |
| Explicitly deferred decision | Personal identity technology/provider DEFERRED; synthetic auth PoC prerequisite değil |
| Historical superseded direction | Bigcapital default adayı current native selection’ı override etmez; A3 unchanged |

Finding gate: **S** = explicit owner instruction veya binding governance destekli safe correction; **C** = ambiguous approval scope/parameter için confirmation; **O** = future domain design OPEN; **K** = mevcut coverage doğrulandı. Bunlar requirement decision status yerine geçmez. Bir finding S invariant ve C/O parameter içerebilir.

### 2.3. Bulunamayan original ayrıntılar

Tüm A1–A7/A3-R ve G0-1/2 dosyalarında Friday/Cuma,12-month representative period,payout slider,warranty-confiscation ve30-day recycle-bin exact original decision text bulunmadı. Accounting araştırmasındaki PDF tooling Store payment receipt approval değildir. A1 §8’de net product spend için tax/shipping/discount hariç ifadesi var; Kumbara-funded amount exact representative treatment ve12-month trigger yok. A5 §12 senaryo10 süreli historical-read önerisi earnings accrual period kanıtı değildir. Search-term absence tek başına feature absence yapılmadı;99 record ve registers ayrıca tam metinle kontrol edildi.

## 3. Doğrulanmış mevcut kapsam

Bunlar business requirement coverage; completed software değildir. Open details korunur:

- ID-001–004: canonical person, personal workspace, email/personal separation, provider DEFERRED.
- ORG-001/002/003/005/008: multiple memberships, independent Store approval, invitations, distinct scopes/protected Owner logical condition; recovery/last Owner mechanism ayrı.
- SEC-001/002/004–006/008: fail-closed, all surfaces, backend lock/revoke, private files ve platform/private-data separation.
- MKT-002/003/004/006/007/008: source currency authority, versioned TRY direction,2005-01-01 TCMB scope,seller-vsFX history,cart acceptance,financial snapshots.
- FIN-001/002: Store financial separation, TRY preference fakat final provider contract yok. FIN-003 independent components var; detailed rule gaps §4.
- ACC-001–007: native direction/stack/optional activation/integrity/research-before-design; candidates proposed, Turkish workflow research completed değil.
- LOY-001–005/008/009, ID-005/006: central eligibility,90/30 OR human login,no auto suspension,separate performance,dynamic badges/no auth/true transitions.
- SOC-001–006, JOB-001–003: Meydan/media/moderation/cross-post,email-only masking/profile denial,participation gate,index-only jobs/full-content/apply gate,HR-independent job management;500 proposed default.
- CAT-005/AUTO-001/003/004, AI-001–003/008: manual independence,provider-neutral future OEM,prospective LexCom,OrgBYOK/bounded authority/high-impact approval,ERP representation. Provider/connector implemented claim yok.
- UX-001:TR/EN/MSA/RTL approved target; locale/accessibility/translations açık.
- DATA-002–004 ve §1–6/9:financial evidence/governance/history ayrımı,original92 preservation,accepted ADR’ler unchanged.

## 4. Significant gap ve classification findings

Current exact behavior/status bütün99 record için §5’te. Missing rules, amendments, acceptance, open parameters ve risks aşağıda. Acceptance suffixes yeni requirement ID değildir.

### F01 — DA-FIN-003

- **Current records:** [DA-FIN-003](../REQUIREMENTS.md#da-fin-003). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.A; A1 §§3,8,10.6; A4 §15; G0-2 §6.7.
- **Missing/conflicting rule:** Multiple components var; name/type/value/min/max, same gross base, non-compounding, total sum, seller breakdown ve Store/product exceptions açık değil. Acceptance yalnız “iki bileşen net tutara” diyor.
- **Recommended patch/classification:** Original ID korunsun; FIN-003.A–F acceptance labels ile component definition, independent gross-base calculation, optional bounds, sum, seller disclosure/buyer non-obligation ve exceptions eklensin. APPROVED/VERIFIED current owner-relayed briefing; gross base’in VAT/shipping içeriği OPEN.
- **Correction gate:** S — açık §3.A onay aktarımına dayalı güvenli iş kuralı düzeltmesi.
- **Acceptance scenario:** B=1000 için 10% + 5% =150 (tax/shipping varsayımı içermeyen sentetik base); 10%=100, ikinci bileşen ilk kesintiden sonra 900 üzerinden 45 olmaz. Seller iki kalemi/toplamı görür; buyer breakdown görmek zorunda değildir.
- **Open implementation/confirmation:** Min/max currency/application unit, lower>upper validation, fixed-plus-percentage composition, exception precedence, tax/shipping/discount/rounding/payee OPEN. “Buyer görmesi gerekmiyor” yasak görünürlük diye yazılmamalı.
- **Risk:** Yanlış compounding, tek-winner, gizli ücret veya net/gross matrah karışması.

### F02 — DA-FIN-001, DA-ORG-002

- **Current records:** [DA-FIN-001](../REQUIREMENTS.md#da-fin-001), [DA-ORG-002](../REQUIREMENTS.md#da-org-002). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.B/D; A1 §§4–5,7; A2 §7 senaryo 3.
- **Missing/conflicting rule:** Independent approval/statement/scope/payout var; eligible balances bağımsızlığı acceptance’te var ama normative balance açık değil.
- **Recommended patch/classification:** FIN-001’e Store funds/balance independence ekle; approval için ORG-002 aynen koru; yeni Store bağımsızlık ID’si üretme. APPROVED kalır.
- **Correction gate:** S.
- **Acceptance scenario:** A ve B Store finalized funds ayrı; A talebi B bakiyesini kullanmaz; A approval B’yi açmaz.
- **Open implementation/confirmation:** Consolidated reporting ayrı; beneficiary ve legal transfer OPEN.
- **Risk:** Organization toplamından yanlış payout veya approval devri.

### F03 — DA-FIN-001, DA-FIN-002

- **Current records:** [DA-FIN-001](../REQUIREMENTS.md#da-fin-001), [DA-FIN-002](../REQUIREMENTS.md#da-fin-002). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.B; A6 §§6–9 (payment request önerisi); Mercur payout pipeline (framework farklı default).
- **Missing/conflicting rule:** Platform schedule, displayed date, eligible finalized funds slider ve no arbitrary delay draft’ta yok; Friday/next business day de yok.
- **Recommended patch/classification:** Yeni DA-FIN-007: platform-controlled schedule + applicable-date UI + slider eligible finalized funds + no arbitrary postponement APPROVED/VERIFIED (owner-relayed). Friday ve holiday-next-business-day parameter blokunu teyit bekleyen proposed default olarak ayrı işaretle; “proposed/approved” kesin approval değildir. TRY ve provider OPEN kalır.
- **Correction gate:** S: scheduling/UI/slider; C: Friday ve ona bağlı holiday default kapsamı.
- **Acceptance scenario:** Eligible=800, pending=200 ise slider 800’ü aşamaz; slider seçimi Friday’i sonraki haftaya keyfi taşımamalı; interface applicable date gösterir. Friday confirmed olursa tatil örneği next business day’i gösterir.
- **Open implementation/confirmation:** Friday approval/default/configuration authority; holiday calendar, timezone/cutoff, finalized/eligible/reserve/dispute state, selected amount/unrequested funds treatment, provider initiation vs bank credit date OPEN.
- **Risk:** Kullanıcı slider’la ödeme tarihini değiştirebilir sanılır; pending funds ödenir; provider daily job business schedule sanılır.

### F04 — DA-FIN-001

- **Current records:** [DA-FIN-001](../REQUIREMENTS.md#da-fin-001). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.B; A3 §4 PDF tooling accounting’e ilişkin; Store receipt approval kanıtı değildir.
- **Missing/conflicting rule:** Store payment receipt PDF viewing yok.
- **Recommended patch/classification:** Yeni DA-FIN-008: yetkili kullanıcı ilgili Store payment receipt’ini PDF olarak görüntüleyebilir; APPROVED/VERIFIED owner-relayed B. Basit user-facing deliverable; scheduling ID’sinde kaybolmamalı.
- **Correction gate:** S.
- **Acceptance scenario:** İlgili Store payout receipt PDF açılır; başka Store kullanıcısı direct URL ile açamaz.
- **Open implementation/confirmation:** Receipt issuer/provider source, attachment vs generated render, redaction, legal status, retention/download policy OPEN.
- **Risk:** Receipt beklentisi unutulur veya public PDF financial isolation’ı aşar.

### F05 — DA-FIN-005, DA-LOY-005, DA-LOY-008

- **Current records:** [DA-FIN-005](../REQUIREMENTS.md#da-fin-005), [DA-LOY-005](../REQUIREMENTS.md#da-loy-005), [DA-LOY-008](../REQUIREMENTS.md#da-loy-008). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.C; A1 §8 net product tax/shipping/discount; A5 §5 ve §12 senaryo 10; A3-R §§9,14.
- **Missing/conflicting rule:** Twelve-month earnings entitlement ve qualified net product earnings base yok. A5 süreli historical-read önerisi var; bu 12 aylık earnings period değildir. Discount/Kumbara formülü arşivde yeterince yok. LOY-008 Golden period’ı earnings’e kullanılamaz.
- **Recommended patch/classification:** Yeni DA-LOY-010 ayrı representative earnings kaydı: net product base excluding VAT/shipping ve period-dependent entitlement current relayed context ile kaydedilsin. 12 months bir aktarılan specific parameter olarak korunmalı; start/end/grant scope teyit edilmeden finalized APPROVED contract yazılmamalı. Discount ve Kumbara treatment formülü C teyidi ister.
- **Correction gate:** S: representative/genel matrah ayrımı; C: 12 ayın exact approval scope ve discount/Kumbara original rule.
- **Acceptance scenario:** Sentetik product net 1000, VAT200, shipping100: representative base VAT/shipping’i içermez; discount=100/Kumbara=50 örneğinin expected base’i owner-confirmed formülden gelir. 12-month boundary ancak başlangıç/bitim onayından sonra.
- **Open implementation/confirmation:** 12 ay acquisition/assignment/first purchase/service departure’dan mı; rolling/one-off; beneficiary; inactivity/reset/reassignment overlap; existing-earned vs future accrual; discount/Kumbara subtract/credit direction, funding/payee, rate/cap/refund OPEN.
- **Risk:** Temsilciye brüt marketplace komisyon matrahı uygulanır veya 12-month history retention earnings accrual sanılır.

### F06 — DA-FIN-005

- **Current records:** [DA-FIN-005](../REQUIREMENTS.md#da-fin-005). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.C; A1 §§7–8; A5 §5/§12 senaryo 10; G0-2 PO-LOY.9.
- **Missing/conflicting rule:** Preservation yalnız future inactivity/loyalty policy change diye yazılmış; departure/reassignment açık değil.
- **Recommended patch/classification:** FIN-005 APPROVED invariant’ına departure/reassignment’ın earned/vested hakları silmemesi eklensin; future-accrual/operational access verilmiş sayılmaz. Intended owner representative financial entitlement olarak netleştirilsin; marketplace finance taşıyıcısı domain sahiplik onayı değildir.
- **Correction gate:** S.
- **Acceptance scenario:** Temsilci ayrılınca mevcut earned entry korunur; müşteri canlı verisi erişimi otomatik kalmaz.
- **Open implementation/confirmation:** Vesting/payable/disputed definitions; future accrual ve history read süresi ayrı.
- **Risk:** Ayrılışta eski hak silinir veya korunan hak sınırsız canlı-data erişimi sanılır.

### F07 — DA-FIN-004, DA-FIN-005, DA-LOY-005

- **Current records:** [DA-FIN-004](../REQUIREMENTS.md#da-fin-004), [DA-FIN-005](../REQUIREMENTS.md#da-fin-005), [DA-LOY-005](../REQUIREMENTS.md#da-loy-005). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.C; A3-R §6 refund ayrımı; A4 §15 historical refund; explicit warranty owner context yalnız current C.
- **Missing/conflicting rule:** Normal warranty, refund, abuse ve dispute ayrımı yok; no normal-warranty automatic forfeiture yok.
- **Recommended patch/classification:** Yeni DA-LOY-011 APPROVED invariant: event türleri ayrılır; normal warranty alone vested earnings’i otomatik confiscate etmez. Refund/fraud/dispute reversal politikası ayrıca OPEN; absolute “her refund’da hak hiç etkilenmez” yazılmaz. FIN-004 exact reversal design PROPOSED kalır.
- **Correction gate:** S: warranty/non-conflation; O: reversal/adjudication policy.
- **Acceptance scenario:** Normal warranty case earned commission’i otomatik silmez; aynı case refund’a dönerse yalnız ayrı authorized refund policy işletilir; abuse accusation adjudicated result değildir.
- **Open implementation/confirmation:** Warranty classification, refund economic effects, holds/dispute evidence/appeal/fraud sanctions, correction authority/effective timing OPEN.
- **Risk:** Garanti şikâyeti ceza gibi ele alınır ya da fraud protection tüm earned rights’i siler.

### F08 — DA-LOY-006

- **Current records:** [DA-LOY-006](../REQUIREMENTS.md#da-loy-006). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.C; A1 §4 representative row; A5 §§5,15.
- **Missing/conflicting rule:** Transfer case/proposed Org/platform approval var; separate permission + approval necessity whole proposed altında.
- **Recommended patch/classification:** Reassignment permission/approval business invariant APPROVED/VERIFIED olarak ayır; exact Org/platform approvers, case mechanism ve eligibility implementation PROPOSED/OPEN. Original LOY-006 korunsun.
- **Correction gate:** S: ayrı permission+approval; C/O: specific approver contract.
- **Acceptance scenario:** Read/commission-history izni reassignment yapamaz; permission olsa bile required approval yoksa transfer olmaz.
- **Open implementation/confirmation:** Who requests/accepts/approves; Org consent vs platform approval, SLA/dispute/effective date/parallel representatives OPEN.
- **Risk:** Temsilci veya yönetici normal rol üzerinden müşteri devralır.

### F09 — DA-LOY-007

- **Current records:** [DA-LOY-007](../REQUIREMENTS.md#da-loy-007). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.C; A1 §8; A2 §8 Financial ledgers; A3-R §9 senaryo12.
- **Missing/conflicting rule:** Promotional credit vs cash commission ayrımı mevcut fakat PROPOSED; requirement “nakit sayılmaz” açık sınıra rağmen öneri gibi.
- **Recommended patch/classification:** Separation invariant APPROVED/VERIFIED current C ile; funding/redemption/expiry/tax/ledger design OPEN/PROPOSED. Cash-conversion yasağı veya belirli economic ledger seçilmesin.
- **Correction gate:** S.
- **Acceptance scenario:** Promotional100 ayrı monetary100 ayrı gösterilir; promo100 payable commission toplamına eklenmez.
- **Open implementation/confirmation:** Discount-funded vs Kumbara-funded purchase representative calculation C teyidi; promo monetary convertibility/funding OPEN.
- **Risk:** Promo balance payout parası veya earned commission yerine geçer.

### F10 — DA-MKT-009

- **Current records:** [DA-MKT-009](../REQUIREMENTS.md#da-mkt-009). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.D; A1 §4 customer segment/buyer-store block; A5 §12 senaryo7 ve açıklaması.
- **Missing/conflicting rule:** Blocked Org checkout kabul testi var fakat Store-specific block normative text’te genel “Buyer Organization kısıtları”.
- **Recommended patch/classification:** Store A’nın BuyerOrg X block’unun Store A purchases’a server-side uygulanmasını APPROVED davranışta explicit yaz; B Store otomatik block olmaz. Discovery/communication/existing order visibility kapsamı OPEN.
- **Correction gate:** S.
- **Acceptance scenario:** X’in çalışan2/cart/API ile A block’unu aşması reddedilir; B kendi policy’sine göre değerlendirilir.
- **Open implementation/confirmation:** Personal buying, public browse, current orders/quotes/messages effects, block reason/appeal OPEN.
- **Risk:** Store block platform-wide suspension veya sadece UI filtresi sanılır.

### F11 — DA-MKT-011

- **Current records:** [DA-MKT-011](../REQUIREMENTS.md#da-mkt-011). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.D; G0-1 §4 eligible buyer segments; A4 §11 framework global-min guarantee yok.
- **Missing/conflicting rule:** Lowest eligible target PROPOSED; algorithm bilinmediği için iş hedefi de bekletilmiş.
- **Recommended patch/classification:** Lowest eligible price business target APPROVED/VERIFIED current owner-relayed D; applicable eligibility algorithm/priority/tax/discount/promotion/tie OPEN. Original ID amended; new lowest-price ID yok.
- **Correction gate:** S: hedef; O: equivalent-comparison contract.
- **Acceptance scenario:** Comparable eligible candidate prices100/90 ve ineligible80 örneğinde90 seçilir; 80 gizli kalır. Karşılaştırılabilirlik owner-defined policy fixture’ına bağlı.
- **Open implementation/confirmation:** Quantity/segment eligibility, price dimensions, ties, promotions, VAT/shipping inclusion, FX display vs transaction basis OPEN.
- **Risk:** Most-specific framework price otomatik en düşük uygun fiyat diye teslim edilir.

### F12 — DA-MKT-009, DA-MKT-011

- **Current records:** [DA-MKT-009](../REQUIREMENTS.md#da-mkt-009), [DA-MKT-011](../REQUIREMENTS.md#da-mkt-011). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.D; A1/A4 minimum/segmentation references Store basket/free-shipping settings approval kaydı değil.
- **Missing/conflicting rule:** Store-defined minimum basket amount ve free-shipping threshold yok.
- **Recommended patch/classification:** Yeni DA-MKT-012 aynı Store commercial-threshold policy record’ında iki acceptance altkuralı; capability historical target olarak kaydedilsin. D kapsam/approval netliği teyit edilsin; tutar/currency/base/exception tasarımı OPEN. Minimum ve free-shipping iki ID’ye sırf sayı için ayrılmasın.
- **Correction gate:** C: D “check coverage” historical scope confirmation; O: policy parameters.
- **Acceptance scenario:** A min100/free500 ve B min200/free700 sentetik değerleri ayrı scope’ta; A threshold B’yi değiştirmez; boundary totals policy-approved base’le değerlendirilir.
- **Open implementation/confirmation:** Zero/default/configuration permission, VAT/shipping/discount basket basis, split-cart perStore vs cart, destination/category exceptions, currency conversion OPEN.
- **Risk:** Marketplace ortak cart toplamı Store threshold’u yanlış geçirir.

### F13 — DA-UX-001, DA-FIN-002, DA-MKT-003

- **Current records:** [DA-UX-001](../REQUIREMENTS.md#da-ux-001), [DA-FIN-002](../REQUIREMENTS.md#da-fin-002), [DA-MKT-003](../REQUIREMENTS.md#da-mkt-003). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.D; DESIGN §16 UI proposal; A6 locale scope; güncel D tercih hedefi.
- **Missing/conflicting rule:** Shipping-country/language/displayed-currency user preferences yok; locale support country selector demek değil.
- **Recommended patch/classification:** Yeni DA-MKT-013 storefront preferences capability; displayed currency payment/settlement seçimi değildir. D approval/scope teyidiyle yaz; UX-001 ile dil hedefi crosslink, FIN-002’ye settlement separation.
- **Correction gate:** C: preference scope; S: display≠settlement mevcut approved ayrım; O: mechanism.
- **Acceptance scenario:** Kullanıcı displayUSD seçtiğinde permitted display değişir; checkout/payment TRY policy kendiliğindenUSD olmaz; country change stock/shipping eligibility’yi approved contract’a göre tekrar hesaplar.
- **Open implementation/confirmation:** Supported country/currency matrix, persistence/account/guest defaults, FX display freshness/rounding, country-price eligibility OPEN.
- **Risk:** Display currency mixed-currency payment veya garanti shipping country sanılır.

### F14 — DA-APP-001, DA-APP-002, DA-APP-003, DA-APP-008

- **Current records:** [DA-APP-001](../REQUIREMENTS.md#da-app-001), [DA-APP-002](../REQUIREMENTS.md#da-app-002), [DA-APP-003](../REQUIREMENTS.md#da-app-003), [DA-APP-008](../REQUIREMENTS.md#da-app-008). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.E; A1 §4 app/launcher rows ve §10.7; A5 §7; G0-1 §4.
- **Missing/conflicting rule:** APP-002 default-enabled yerine “sektör önerisi”; sector initial activation/new recommendations eksik. APP-008 show/hide expanded/collapsed değil. Dördünün approved business behavior whole PROPOSED.
- **Recommended patch/classification:** Dört original record’ın business invariant’ı APPROVED/VERIFIED current E ile: entitlement/permission/preference ayrımı; mandatory/default-enabled/optional; initial sector/activity activation; no auto disable after change + relevant app recommendations; personal order + expanded/collapsed; protected history retained on optional disable. Technical schemas/access restore scopes OPEN. APP-003 “tüm uninstall bütün data sonsuza dek kalır” dilini protected history sınırına daralt; destructive policy icat etme.
- **Correction gate:** S: açık §3.E approved; O: app lists/mechanisms.
- **Acceptance scenario:** Sektör değişiminde active app açık kalır, yeni ilgili app recommendation olur; kişisel collapsed section başka kullanıcının izinlerini değiştirmez; optional off protected posted history’yi silmez.
- **Open implementation/confirmation:** Mandatory list, sector taxonomy/default matrix, entitlement registry, preference key/sync, historical-read/export/restore rights, uninstall semantics OPEN.
- **Risk:** Policy değişimi veri/uygulama kaybına veya launcher ayarı auth değişimine dönüşür.

### F15 — DA-SEC-007

- **Current records:** [DA-SEC-007](../REQUIREMENTS.md#da-sec-007). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.F; SECURITY Mandatory rules; A2 §8 Audit records; A5 §8.
- **Missing/conflicting rule:** Actor/context/decision acceptance var; role/timestamp/before-after ve authorized audit search/export yok. Sensitive-log ban whole PROPOSED altında kalmış.
- **Recommended patch/classification:** SEC-007’de binding confidentiality/auditability invariant’larını ayrı APPROVED subclauses göster; audit/log/ledger physical module placement öneri kalır. Audit functional surface için SEC-009 ayrı kaydı F16’da; whole record technical proposal topluca approved yapılmasın.
- **Correction gate:** S: mevcut SECURITY bağlayıcı kural; C: detailed F audit-field scope.
- **Acceptance scenario:** Secret token/key/password audit/log/export’a girmez; role at event time ile current role karışmaz.
- **Open implementation/confirmation:** Tamper resistance, synchronous vs durable outbox, changed-field redaction/read field permission, retention OPEN.
- **Risk:** “Proposed logging” hassas veri loglamaya izin gibi yorumlanır.

### F16 — DA-SEC-002, DA-SEC-006, DA-SEC-007

- **Current records:** [DA-SEC-002](../REQUIREMENTS.md#da-sec-002), [DA-SEC-006](../REQUIREMENTS.md#da-sec-006), [DA-SEC-007](../REQUIREMENTS.md#da-sec-007). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.F; A2 §8 audit fields/redacted changes; A5 §8 decision context; arşiv exact audit CSV/Excel UI requirement sağlamıyor.
- **Missing/conflicting rule:** Authorized audit events’in actor/Organization/role/action/target/timestamp/before-after model + search/filter/CSV/Excel export capability yok. General search/export isolation feature existence değildir.
- **Recommended patch/classification:** Yeni DA-SEC-009 audit record/query/export capability; F historical approval scope teyit beklesin (PROPOSED), approved confidentiality/isolation SEC-002/006’dan inherited invariant. Role and before-after historical snapshot/redaction ayrımı açık.
- **Correction gate:** C: F tarihi onay kapsamı; O: implementation.
- **Acceptance scenario:** OrgA audit reader OrgB kayıtlarını export edemez; permitted before/after redacted fields event time ile görülür; CSV ve Excel aynı authorized dataset’i verir.
- **Open implementation/confirmation:** Which events/fields, role identity vs role snapshot, missing-before/create/delete semantics, XLSX vs compatible Excel export format, filter columns/date/timezone/export limits/injection-safe encoding OPEN.
- **Risk:** Summary audit log feature coverage sanılır veya bulk export PII sızdırır.

### F17 — DA-SEC-002, DA-SEC-006, DA-APP-004

- **Current records:** [DA-SEC-002](../REQUIREMENTS.md#da-sec-002), [DA-SEC-006](../REQUIREMENTS.md#da-sec-006), [DA-APP-004](../REQUIREMENTS.md#da-app-004). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.F; A1 §4 search; A6 §3 advanced search deferable; G0-1 §4.
- **Missing/conflicting rule:** Advanced search/filter functional capability explicit değil; current kayıtlar yalnız authorized search security.
- **Recommended patch/classification:** Yeni DA-APP-009 advanced search/filter product surface adayı; cross-module/all modules kapsamı briefing’de yok, teyit gerekir. Notification bell’i global search sayma; search engine/provider seçilmesin.
- **Correction gate:** C.
- **Acceptance scenario:** İlgili authorized domain listesi search/filter ile daralır; denied items count/facet/nested result’ta yok; paging stable contract ayrı.
- **Open implementation/confirmation:** Which modules/fields/advanced operators, scope/performance/search index/staleness/export coupling OPEN.
- **Risk:** Güvenli ama üründe olmayan “advanced search” delivered sayılır.

### F18 — DA-DATA-001, DA-DATA-002, DA-DATA-005, DA-APP-003

- **Current records:** [DA-DATA-001](../REQUIREMENTS.md#da-data-001), [DA-DATA-002](../REQUIREMENTS.md#da-data-002), [DA-DATA-005](../REQUIREMENTS.md#da-data-005), [DA-APP-003](../REQUIREMENTS.md#da-app-003). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.F; A1 §4 lifecycle/§8 cascade; A2 §8 permanent deletion failure state; G0-1 §4.
- **Missing/conflicting rule:** Module bins, 30 days ve permanent failed-deletion reasons precise behavior yok; DATA-005 failure reason OPEN. Protected finance nondelete yalnız immutability/refs olarak partial.
- **Recommended patch/classification:** DATA-002’ye protected financial records destructive delete yasağını mevcut approved integrity invariant’ının açık yazımı olarak ekle. DATA-005 approved protected-reference clause ile proposed archive/restore mechanism ayrışsın. Yeni DATA-006 module-specific bins/safe restore/permanent failure reason; 30-day class-specific candidate teyit ister; blanket retention uygulanmasın. DATA-001 governance approvalgate APPROVED clause, actual class policies OPEN registry olarak korunabilir.
- **Correction gate:** S: protected finance no destructive delete; C: bins/30day/failure retention exact historical scope; O: legal-class handling.
- **Acceptance scenario:** Posted financial record bin/harddelete’e gitmez; restore çaprazOrg privilege kazanmaz; eligible-class expiry deletion blocked by reference ise reason kalıcı job/deletion evidence’de; log expiry nedeni yok etmez.
- **Open implementation/confirmation:** 30-day start/reset/timezone/manual vs auto purge, eligible classes/legal holds, restore dependencies/permission/unique conflicts, failed reason retention/access/redaction, backups/legal requests OPEN.
- **Risk:** Her data class30 gün sonra silinir veya ledger cascade yok olur.

### F19 — DA-APP-004, DA-APP-005, DA-ID-006, DA-SEC-004

- **Current records:** [DA-APP-004](../REQUIREMENTS.md#da-app-004), [DA-APP-005](../REQUIREMENTS.md#da-app-005), [DA-ID-006](../REQUIREMENTS.md#da-id-006), [DA-SEC-004](../REQUIREMENTS.md#da-sec-004). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.G; G0-2 PO-ID.9–11/PO-BAD.4; A6 §3; G0-1 §4.
- **Missing/conflicting rule:** Bell var; “bildirim teslimi domain state’inden bağımsız navigasyon öğesidir” navigation/delivery karıştırıyor. Lock shared header ama bell beside yerleşimi yok. Badge notifications var, backend generic events whole PROPOSED.
- **Recommended patch/classification:** APP-004 navigation bell ve authorized backend event-based notifications davranışı ayrı acceptance clauses; delivery state domain source event’inin yerine geçmez. SEC-004 lock bell beside explicit; ID-006 earned/meaningful changes korunur. APP-005 dedup/outbox implementation proposal kaldırılmadan sırf notification goal APPROVED sınırlanır. Yeni notification ID üretme.
- **Correction gate:** S: current G preservation; O: exact delivery/dedup/timing.
- **Acceptance scenario:** Badge-earned gerçek transition backend notification üretir; bell yanında lock vardır; lock direct API restriction’ı korur; retry mechanism approval policy’ye göre duplicate önler.
- **Open implementation/confirmation:** Read/unread/channels/subscriptions, lock allowed operations, delivery latency/dedup/outbox, expiry/revoke timing OPEN.
- **Risk:** Cosmetic bell/lock feature done sayılır veya domain state notification delivery’den türetilir.

### F20 — DA-ID-003, DA-ID-004, DA-SOC-002, DA-SOC-003, DA-JOB-001, DA-JOB-002, DA-JOB-003

- **Current records:** [DA-ID-003](../REQUIREMENTS.md#da-id-003), [DA-ID-004](../REQUIREMENTS.md#da-id-004), [DA-SOC-002](../REQUIREMENTS.md#da-soc-002), [DA-SOC-003](../REQUIREMENTS.md#da-soc-003), [DA-JOB-001](../REQUIREMENTS.md#da-job-001), [DA-JOB-002](../REQUIREMENTS.md#da-job-002), [DA-JOB-003](../REQUIREMENTS.md#da-job-003). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.G; G0-2 PO-VER/Meydan/Job; G0-S3 §3.E/F.
- **Missing/conflicting rule:** Logical separation, deferred technology, masks/profile-deny, index-only vs full/apply-deny ve HR-independent management mevcut; yeni gap değil.
- **Recommended patch/classification:** Statüler aynen; provider selection deferred; no new prerequisite veya duplicate requirement.
- **Correction gate:** K — kapsam doğrulandı.
- **Acceptance scenario:** Email-only profile/full job/content/apply/social write denied; permitted reads mask/preview; fake auth PoC gerçek provider seçmez.
- **Open implementation/confirmation:** Permitted fields/masks/revocation/resource permissions açık.
- **Risk:** Uydurulmuş provider dependency veya gereksiz duplicate scope.

### F21 — DA-ACC-001, DA-ACC-002, DA-ACC-004, DA-ACC-005, DA-ACC-006, DA-ACC-007, DA-AUTO-001, DA-AUTO-003, DA-AUTO-004, DA-AI-001, DA-AI-002, DA-AI-003, DA-AI-004, DA-AI-008, DA-CAT-005

- **Current records:** [DA-ACC-001](../REQUIREMENTS.md#da-acc-001), [DA-ACC-002](../REQUIREMENTS.md#da-acc-002), [DA-ACC-004](../REQUIREMENTS.md#da-acc-004), [DA-ACC-005](../REQUIREMENTS.md#da-acc-005), [DA-ACC-006](../REQUIREMENTS.md#da-acc-006), [DA-ACC-007](../REQUIREMENTS.md#da-acc-007), [DA-AUTO-001](../REQUIREMENTS.md#da-auto-001), [DA-AUTO-003](../REQUIREMENTS.md#da-auto-003), [DA-AUTO-004](../REQUIREMENTS.md#da-auto-004), [DA-AI-001](../REQUIREMENTS.md#da-ai-001), [DA-AI-002](../REQUIREMENTS.md#da-ai-002), [DA-AI-003](../REQUIREMENTS.md#da-ai-003), [DA-AI-004](../REQUIREMENTS.md#da-ai-004), [DA-AI-008](../REQUIREMENTS.md#da-ai-008), [DA-CAT-005](../REQUIREMENTS.md#da-cat-005). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §3.H; A3 + A3-R; A5 §§9–11; A7 §§5–10; G0-2/S3 explicit briefing.
- **Missing/conflicting rule:** Future goals temsil ediliyor; external ERP capability AI-008 whole proposed, independence ise ACC-005 approved. No omitted entire future module.
- **Recommended patch/classification:** New future-module IDs yok. AI-008’de future external capability goal/approved optionality ile proposed connector mechanism altclauses ayrışsın; whole connector approved olmaz. Native research-before-design, prospective LexCom, bounded permissions/manual independence aynen.
- **Correction gate:** K: represented; S: optionality clarification; O/C: extra connector ownership/scope.
- **Acceptance scenario:** AI/OEM unavailable manual vehicle/products/inventory/quotations sürer; Accounting disabled marketplace works; LexCom candidate real integration diye sunulmaz.
- **Open implementation/confirmation:** Providers/licensing/SDK/domain deployment/Accounting workflows/concurrency/delegation OPEN/DEFERRED as existing.
- **Risk:** Provider seçilmiş veya framework/native module installed sanılır.

### F22 — DA-FIN-004, DA-MKT-005, DA-SEC-003, DA-CAT-001, DA-AUTO-002, DA-JOB-004, DA-AI-005, DA-AI-007, DA-UX-003

- **Current records:** [DA-FIN-004](../REQUIREMENTS.md#da-fin-004), [DA-MKT-005](../REQUIREMENTS.md#da-mkt-005), [DA-SEC-003](../REQUIREMENTS.md#da-sec-003), [DA-CAT-001](../REQUIREMENTS.md#da-cat-001), [DA-AUTO-002](../REQUIREMENTS.md#da-auto-002), [DA-JOB-004](../REQUIREMENTS.md#da-job-004), [DA-AI-005](../REQUIREMENTS.md#da-ai-005), [DA-AI-007](../REQUIREMENTS.md#da-ai-007), [DA-UX-003](../REQUIREMENTS.md#da-ux-003). Exact behavior/status §5.
- **Briefing / historical source:** S3-R §2; Existing approved parent invariants + related research recommendations.
- **Missing/conflicting rule:** Several PROPOSED records içinde already binding confidentiality/history/no-spoofing/design-not-approval outcome bulunuyor. Hepsi wrong whole status değil: technical mechanism ile outcome karışık.
- **Recommended patch/classification:** Altclause metadata: approved inherited invariant parent ID’ye link; recommendation mechanism PROPOSED; parameters OPEN. UX-003 normative “design is not acceptance” mevcut DESIGN§1/2 ve APP-006 ile VERIFIED governance; visual tokens PROPOSED ayrı. Yeni IDs sırf mixed record için zorunlu değil.
- **Correction gate:** S: inherited approved outcomes; O: mechanism; C: extra behavior beyond parent.
- **Acceptance scenario:** FIN-004 snapshot preserved vs new refund policy; SEC-003 spoofedOrg denied regardless chain implementation; private HR confidentiality regardless HR boundary proposal.
- **Open implementation/confirmation:** No new public/private canonical/ledger/RLS/OEM merge/provider/architecture approval.
- **Risk:** Over-cautious classification approved rule’ı zayıflatır veya opposite technical recommendation topluca onaylanır.

## 5. Bütün 99 requirement record için exact-text audit register

Her satır tam kayıt metadata’sı okunarak incelendi. Aşağıdaki behavior metni current draft’tan verbatim alınmıştır; source bölüm alanı da korunur. Bu reproduction approved status endorsement değildir; bütün kayıtlar NOT_ASSESSED. “K” yalnız bu hedefli briefing’e göre yeni gap yok anlamındadır, future parameters çözüldü değildir.

### Audit DA-ID-001

- **Current exact behavior:** Bir gerçek kişi için tek kanonik DoğruAdres kimliği; framework actor bağlantıları bu kimliği temsil eder.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §4; [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §4.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-ID-002

- **Current exact behavior:** Kişisel alan Organization bağlamından bağımsızdır; Organization değişimi kişisel kaynakları yeniden sahiplenmez.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §§4–5; [A6](A6-development-roadmap-and-release-sequencing.md) §4.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-ID-003

- **Current exact behavior:** E-posta doğrulaması ve kişisel kimlik doğrulaması ayrı mantıksal durumlar olarak değerlendirilir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §6; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** F20

### Audit DA-ID-004

- **Current exact behavior:** Kişisel doğrulama sağlayıcısı, teknoloji, maliyet ve hukuki veri işleme seçimi ertelenmiştir; erişim şartı korunur.
- **Current decision/evidence:** DEFERRED / VERIFIED.
- **Current source/section:** [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §§6,10; [A5](A5-canonical-identity-organizations-and-authorization.md) §15.
- **Finding / disposition:** F20

### Audit DA-ID-005

- **Current exact behavior:** Standard Verified kişisel kimlik doğrulaması gerektirir. Golden Verified buna ek olarak protected Owner üyeliği ve merkezi performance-target politikasını sağlayan eligible Organization gerektirir. Yalnız inactivity’den kaçınmak Golden Verified sağlamaz.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A5](A5-canonical-identity-organizations-and-authorization.md) §15.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-ID-006

- **Current exact behavior:** Rozet durumu yetki sağlamamalıdır. Gerçek badge-state geçişleri bildirim üretmeli; uygunluk kaybı veya değişimi dinamik badge durumuna yansıtılmalıdır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A6](A6-development-roadmap-and-release-sequencing.md) §3.
- **Finding / disposition:** F19

### Audit DA-ORG-001

- **Current exact behavior:** Bir kişi birden çok legal Organization’da bağımsız üyelik ve roller taşıyabilir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§4–5; [A5](A5-canonical-identity-organizations-and-authorization.md) §§4–7.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-ORG-002

- **Current exact behavior:** Organization, marketplace Seller/Store’dan ayrıdır; bir Organization birden çok ayrı onaylanan Store’a sahip olabilir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§4–5; [A5](A5-canonical-identity-organizations-and-authorization.md) §3.
- **Finding / disposition:** F02

### Audit DA-ORG-003

- **Current exact behavior:** Üyelik davet temellidir; alıcı kimliği ve yetki kapsamı sunucuda doğrulanmalıdır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §6.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-ORG-004

- **Current exact behavior:** Protected Owner yetkisi ve son Owner’ın kaybını önleyen devretme/kurtarma yöntemi tasarlanmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §§7,12,15.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-ORG-005

- **Current exact behavior:** Personal, Organization, Store, branch ve platform-workspace izinleri örtük birleşmez.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §§5,7–8.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-ORG-006

- **Current exact behavior:** Şubelerin Organization sahipliği ve stok/işlem erişim kapsamı ayrı tanımlanmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§4–5; [A5](A5-canonical-identity-organizations-and-authorization.md) §5.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-ORG-007

- **Current exact behavior:** Legal Organization doğrulaması ile kişi doğrulaması ve Store approval ayrı state’ler olmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§4–5; [A5](A5-canonical-identity-organizations-and-authorization.md) §4.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-ORG-008

- **Current exact behavior:** Protected Owner üyeliği ayrı korunan sahiplik kavramı olarak tanınmalıdır; sıradan rol veya Seller is_owner otomatik olarak bu statüyü üretmez. Transfer/kurtarma/son Owner mekanizmasının kesinleşmesi DA-ORG-004 kapsamında ayrı review ister.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §§5,7,12,15; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-SEC-001

- **Current exact behavior:** Merkezi yetkilendirme fail closed çalışır; eksik principal, context, policy veya resolver izin vermez.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §§5,8; yerel T02.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-SEC-002

- **Current exact behavior:** API, workflow, job, file, export ve search sunucu tarafında aynı kapsam kurallarıyla korunur.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §8; SECURITY Mandatory rules.
- **Finding / disposition:** F16, F17

### Audit DA-SEC-003

- **Current exact behavior:** Actor→person→membership→app→resource zinciri her istekte güvenilir bağlamdan çözülür; istemci org_id tek başına yeterli değildir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §§4–5,8.
- **Finding / disposition:** F22

### Audit DA-SEC-004

- **Current exact behavior:** Ortak header’da tek tık session lock; password session unlock’ta password reauthentication ve gerçek backend etkisi zorunludur.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A6](A6-development-roadmap-and-release-sequencing.md) §3; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §§4,6.
- **Finding / disposition:** F19

### Audit DA-SEC-005

- **Current exact behavior:** Üyelik/rol/app revoke, aktif session ve bekleyen job/export/search/file erişimlerine etkili olmalıdır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §§8,12; [A7](A7-ai-byok-and-future-oem-architecture.md) §8.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-SEC-006

- **Current exact behavior:** Özel dosyalar açık kalıcı URL ile yetkiyi atlamamalı; arama/export/cache yan kanalları kapsam filtrelemelidir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §8; [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §8.
- **Finding / disposition:** F16, F17

### Audit DA-SEC-007

- **Current exact behavior:** Audit, uygulama log’u ve finansal ledger farklı amaçlarla tutulmalı; hassas alanlar log’a girmemelidir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A2](A2-platform-core-placement-and-integration-topology.md) §8; [A5](A5-canonical-identity-organizations-and-authorization.md) §8; SECURITY.
- **Finding / disposition:** F15, F16

### Audit DA-SEC-008

- **Current exact behavior:** Platform operatörü Organization özel verisine otomatik erişmez; support/break-glass açık politika gerektirir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §§5,8,15.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-APP-001

- **Current exact behavior:** App entitlement, user permission ve launcher tercihi farklı kavramlar olarak tutulmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§4,7; [A5](A5-canonical-identity-organizations-and-authorization.md) §7.
- **Finding / disposition:** F14

### Audit DA-APP-002

- **Current exact behavior:** Zorunlu, opsiyonel ve sektör önerisi uygulamalar ayrılmalı; sektör değişimi aktif uygulamaları sessizce kapatmamalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A6](A6-development-roadmap-and-release-sequencing.md) §3.
- **Finding / disposition:** F14

### Audit DA-APP-003

- **Current exact behavior:** App disable/uninstall tarihsel veriyi silmez; tarihsel okuma/restore ve bağımlı uygulama davranışı onaylanmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A5](A5-canonical-identity-organizations-and-authorization.md) §7; [A3-R](A3-R-native-basic-accounting-reassessment.md) §9.
- **Finding / disposition:** F14, F18

### Audit DA-APP-004

- **Current exact behavior:** Ortak header notification bell içerir; bildirim teslimi domain state’inden bağımsız navigasyon öğesidir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A6](A6-development-roadmap-and-release-sequencing.md) §3.
- **Finding / disposition:** F17, F19

### Audit DA-APP-005

- **Current exact behavior:** Rozet dahil domain geçiş bildirimleri tekrar denemelerde çoğalmamalı; backend event doğruluğu korunmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A2](A2-platform-core-placement-and-integration-topology.md) §§6–8; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** F19

### Audit DA-APP-006

- **Current exact behavior:** Functional app brief final Stitch ekran tasarımından önce gelir; DESIGN.md taslak referanstır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A6](A6-development-roadmap-and-release-sequencing.md) §§10–11; [DESIGN](../../../DESIGN.md) §§19–22.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-APP-007

- **Current exact behavior:** Geliştirme küçük, ayrı incelenen dilimlerle ilerler; kabul standardı tamamlanmadan başka ana modüle geçilmez.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A6](A6-development-roadmap-and-release-sequencing.md) §§7–10; plans/README When a plan is required.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-APP-008

- **Current exact behavior:** Kullanıcı launcher’daki uygulama sırasını ve gösterilen/gizlenen alanları kendi tercihi olarak seçebilmelidir; bu seçim permission veya Organization entitlement değiştirmemelidir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §4 (App launcher kişisel düzeni); [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4 (Launcher sırası).
- **Finding / disposition:** F14

### Audit DA-CAT-001

- **Current exact behavior:** Global Product/Brand/normalize MPN ile Organization’ın private product master/cost/notes ayrı sahiplikte tutulmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §4,7; [A5](A5-canonical-identity-organizations-and-authorization.md) §3.
- **Finding / disposition:** F22

### Audit DA-CAT-002

- **Current exact behavior:** Private ürünün canonical product bağlantısı yeniden eşlenebilir olmalı; satış/tarihsel kaydın anlamı korunmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§4,7.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-CAT-003

- **Current exact behavior:** Contacts Organization-private kalmalı; platform kişisi/customer/seller ile otomatik aynı kimlik sayılmamalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §4; [A3-R](A3-R-native-basic-accounting-reassessment.md) §5.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-CAT-004

- **Current exact behavior:** Mercur Offer inventory ile private Inventory ayrılmalı; Offer reservation/availability ile özel stok projeksiyonu kontrollü bağlanmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§4,6; yerel T04.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-CAT-005

- **Current exact behavior:** Products, Inventory ve Quotations AI/OEM olmadan kullanılabilir kalır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A7](A7-ai-byok-and-future-oem-architecture.md) §§7,10.
- **Finding / disposition:** F21

### Audit DA-MKT-001

- **Current exact behavior:** Mercur marketplace temeli korunur; sadece kanıtlanmış uyumsuzluk yeniden değerlendirme nedeni olabilir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §16; ADR-0001/3.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-MKT-002

- **Current exact behavior:** Aynı Store farklı kaynak para birimli Offers listeleyebilir; kaynak fiyat ve FX provenance DoğruAdres’e aittir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§3,5–7.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-MKT-003

- **Current exact behavior:** Original Offer fiyatları authoritative source currency’leriyle korunmalı; hesaplanan TRY fiyatları kontrollü ve versioned publication ile yayımlanmalıdır. Source-price otoritesi, TRY projection ve settlement ayrı katmanlardır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§6–7,12; yerel T03/04.
- **Finding / disposition:** F13

### Audit DA-MKT-004

- **Current exact behavior:** TCMB tarihsel gözlem başlangıcı 2005-01-01’dir; önceki gözlemler import edilmez.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§8–10.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-MKT-005

- **Current exact behavior:** Kur provenance observation/revision/publication zamanlarını, unit dönüşümünü ve kullanılan kaynağı korumalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§8–10.
- **Finding / disposition:** F22

### Audit DA-MKT-006

- **Current exact behavior:** Seller repricing ve FX kaynaklı fiyat değişimi history’de ayırt edilir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §14.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-MKT-007

- **Current exact behavior:** Cart fiyat değişimi ödeme öncesi kullanıcıya açıklanır ve kabul ettirilir; checkout race kontrol edilir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §13.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-MKT-008

- **Current exact behavior:** Tamamlanan işlem orijinal fiyat, kur ve finansal snapshot’ını korur.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§13–15.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-MKT-009

- **Current exact behavior:** Buyer Organization kısıtları server’da uygulanır; Organization-attributed checkout ayrıntısı ayrıca netleştirilir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §13.
- **Finding / disposition:** F10, F12

### Audit DA-MKT-010

- **Current exact behavior:** Döviz satış kuru, half-up iki hane, source precision, markup ve stale eşiği henüz onaylı değildir.
- **Current decision/evidence:** OPEN / UNVERIFIED.
- **Current source/section:** [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §11.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-MKT-011

- **Current exact behavior:** Buyer fiyat uygunluğu server tarafından doğrulanmalı; en düşük uygun segment fiyatı hedefi için karşılaştırma ve deterministic seçim politikası ürün review’ünde kesinleştirilmelidir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §4 (Customer segment pricing / buyer-store block), §10.5; [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §11; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** F11, F12

### Audit DA-FIN-001

- **Current exact behavior:** Store bazlı statement, finansal scope ve payout bağımsız kalır; aynı legal Organization birleşmeye gerekçe değildir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§4–5; [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §15.
- **Finding / disposition:** F02, F03, F04

### Audit DA-FIN-002

- **Current exact behavior:** İlk marketplace release için preferred settlement currency TRY’dir; bu onaylı ürün yönü/tercihi final payment-provider veya financial-settlement sözleşmesi sayılmamalıdır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§7,15.
- **Finding / disposition:** F03, F13

### Audit DA-FIN-003

- **Current exact behavior:** Bağımsız komisyon bileşenleri ayrı hesaplanır ve snapshot’ta izlenir; core’ın tek rule winner’ı bunları otomatik çözmez.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §15; yerel T05.
- **Finding / disposition:** F01

### Audit DA-FIN-004

- **Current exact behavior:** Refund, partial refund ve payout reversal tarihsel mali bağlamla tasarlanmalıdır; yeni FX ile yeniden değerleme varsayılmaz.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §15; [A3-R](A3-R-native-basic-accounting-reassessment.md) §9.
- **Finding / disposition:** F07, F22

### Audit DA-FIN-005

- **Current exact behavior:** Earned financial entitlement gelecekteki inactivity veya loyalty policy değişimiyle geriye dönük değiştirilmez.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A2](A2-platform-core-placement-and-integration-topology.md) §7.
- **Finding / disposition:** F05, F06, F07

### Audit DA-FIN-006

- **Current exact behavior:** Commerce operational state, commission ledger ve optional accounting farklı truth’lar olarak reconcile edilmelidir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A2](A2-platform-core-placement-and-integration-topology.md) §§6–8; [A3-R](A3-R-native-basic-accounting-reassessment.md) §8.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-ACC-001

- **Current exact behavior:** Native DoğruAdres Basic Accounting geliştirme yönü onaylı; Bigcapital zorunlu platform dependency değildir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A3](A3-bigcapital-basic-accounting-feasibility.md) §§1,6; [A3-R](A3-R-native-basic-accounting-reassessment.md) §§13–14.
- **Finding / disposition:** F21

### Audit DA-ACC-002

- **Current exact behavior:** Başlangıç yönü TypeScript, aynı PostgreSQL deployment ve supported Medusa module architecture; final schema değil.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A3-R](A3-R-native-basic-accounting-reassessment.md) §§3,7.
- **Finding / disposition:** F21

### Audit DA-ACC-003

- **Current exact behavior:** Kapsam Basic Accounting’dir; statutory muhasebe/ERP uyumluluk iddiası veya payroll/stock-costing varsayımı yapılmaz.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A3-R](A3-R-native-basic-accounting-reassessment.md) §§5,12.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-ACC-004

- **Current exact behavior:** Double-entry balance, idempotency, immutable posted records ve güvenli correction zorunlu tasarım hedefleridir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A3-R](A3-R-native-basic-accounting-reassessment.md) §6.
- **Finding / disposition:** F21

### Audit DA-ACC-005

- **Current exact behavior:** Marketplace checkout optional Basic Accounting app’ına bağlı olmaz.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A2](A2-platform-core-placement-and-integration-topology.md) §7; [A3-R](A3-R-native-basic-accounting-reassessment.md) §8.
- **Finding / disposition:** F21

### Audit DA-ACC-006

- **Current exact behavior:** Contacts, AR/AP belgeleri, cash/bank, partial allocations, FX ve export MVP adaylarıdır; kesin liste onaylı değildir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A3-R](A3-R-native-basic-accounting-reassessment.md) §§5,9.
- **Finding / disposition:** F21

### Audit DA-ACC-007

- **Current exact behavior:** Ayrıntılı iş mantığından önce yerli ürün/workflow araştırması, anlaşılır alternatifler ve accountant review gerekir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A3-R](A3-R-native-basic-accounting-reassessment.md) §12.
- **Finding / disposition:** F21

### Audit DA-LOY-001

- **Current exact behavior:** Platform Loyalty Management ortak Organization activity/eligibility state’inin sahibidir ve optional Org loyalty app’ından bağımsızdır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-LOY-002

- **Current exact behavior:** Representative management ve Golden Verified merkezi activity/eligibility belirlemesini tüketmelidir; alternatif inactivity hesabı üretmemelidir. Aynı policy infrastructure farklı business-state sonuçlarını tek boolean’a indirmemelidir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-LOY-003

- **Current exact behavior:** Organization, 90 ardışık gün qualifying purchase olmaması VEYA 30 ardışık gün Organization workspace’ine qualifying human login olmaması halinde inactive olarak değerlendirilmelidir. Login yerine UI etkileşimi, page view veya background API activity kullanılamaz.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** Bu görev brifingi; [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §10 eşikleri çözmez.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-LOY-004

- **Current exact behavior:** Inactive Organization otomatik suspend edilmez, Stores kapanmaz.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-LOY-005

- **Current exact behavior:** Operational activity/inactivity, active-Organization performance-target eligibility, representative reassignment eligibility ve previously vested commissions/rewards ayrı business states veya decisions olarak korunmalıdır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A2](A2-platform-core-placement-and-integration-topology.md) §7.
- **Finding / disposition:** F05, F07

### Audit DA-LOY-006

- **Current exact behavior:** Representative transfer önerisi gerekçe/evidence ve Org/platform onayıyla izlenebilir case olarak ele alınmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A2](A2-platform-core-placement-and-integration-topology.md) §7.
- **Finding / disposition:** F08

### Audit DA-LOY-007

- **Current exact behavior:** Kumbara/promotional balance ile gerçek komisyon/financial entitlement ayrılmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A2](A2-platform-core-placement-and-integration-topology.md) §§7–8.
- **Finding / disposition:** F09

### Audit DA-LOY-008

- **Current exact behavior:** Purchase-performance ölçütü ve Golden threshold/evaluation dönemleri domain onayı bekler.
- **Current decision/evidence:** OPEN / UNVERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§7,10; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** F05

### Audit DA-LOY-009

- **Current exact behavior:** Golden Verified için Organization’ın merkezi active-Organization performance-target criterion’ını sağlaması gerekir; operational inactivity’den kaçınması tek başına yeterli değildir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§7,10; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-SOC-001

- **Current exact behavior:** Meydan established working product name ile platform-wide kişisel uygulama olmalıdır; Organization’a ait değildir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A6](A6-development-roadmap-and-release-sequencing.md) §4; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-SOC-002

- **Current exact behavior:** E-posta doğrulanmış fakat kişisel kimliği doğrulanmamış kullanıcı Meydan posts ve product reviews okuyabilir; author names maskelenmeli ve author-profile navigation reddedilmelidir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A7](A7-ai-byok-and-future-oem-architecture.md) §9.
- **Finding / disposition:** F20

### Audit DA-SOC-003

- **Current exact behavior:** Normal posting, commenting, liking, following ve participation kişisel kimlik doğrulaması gerektirir. Doğrulanmış kişilerde de ilgili resource ve Organization permissions ayrıca uygulanmalıdır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A6](A6-development-roadmap-and-release-sequencing.md) §4.
- **Finding / disposition:** F20

### Audit DA-SOC-004

- **Current exact behavior:** Product Review isteğe bağlı Meydan cross-post olabilir; moderation, visibility, source link ve lifecycle tutarlıdır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §4; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-SOC-005

- **Current exact behavior:** Media uploads ve uygun moderation planlıdır; policy ve file ownership daha sonra onaylanır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A5](A5-canonical-identity-organizations-and-authorization.md) §8.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-SOC-006

- **Current exact behavior:** Meydan için 500 karakter configurable proposed default olarak değerlendirilmelidir; immutable accepted limit değildir. Working name DA-SOC-001’de Meydan olarak korunur.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** Brifing; [A6](A6-development-roadmap-and-release-sequencing.md) §13 açık ürün kararları.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-JOB-001

- **Current exact behavior:** E-posta doğrulanmış kullanıcı job listing index ve permitted preview fields üzerinde browse/search yapabilir; preview tam içerik erişimine dönüşmemelidir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A6](A6-development-roadmap-and-release-sequencing.md) §4; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** F20

### Audit DA-JOB-002

- **Current exact behavior:** Full job details/content ve applications kişisel kimlik doğrulaması gerektirir; email-only kullanıcıya reddedilmelidir. Kişisel doğrulama sonrası resource ve Organization permissions ayrıca uygulanmalıdır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A7](A7-ai-byok-and-future-oem-architecture.md) §9 genel kişisel erişim notu.
- **Finding / disposition:** F20

### Audit DA-JOB-003

- **Current exact behavior:** Yetkili Org kullanıcısı ilan yönetir; optional full HR enabling zorunlu değildir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A6](A6-development-roadmap-and-release-sequencing.md) §§4–5; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** F20

### Audit DA-JOB-004

- **Current exact behavior:** HR personnel, payroll ve çalışan özel verileri Job Board’ın public ilan alanından ayrılır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §4; [A6](A6-development-roadmap-and-release-sequencing.md) §5.
- **Finding / disposition:** F22

### Audit DA-AUTO-001

- **Current exact behavior:** Vehicle Management DoğruAdres domain’idir ve AI/OEM olmadan işler.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [ADR-0002](../adr/ADR-0002-automotive-domain-isolation.md); [A7](A7-ai-byok-and-future-oem-architecture.md) §10.
- **Finding / disposition:** F21

### Audit DA-AUTO-002

- **Current exact behavior:** Quotations private Org iş akışıdır; Product/Inventory/Vehicle bağlantıları permission-aware olmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §4; [A7](A7-ai-byok-and-future-oem-architecture.md) §7.
- **Finding / disposition:** F22

### Audit DA-AUTO-003

- **Current exact behavior:** Gelecekte provider-neutral VIN/OEM lookup gerekir; provider sonucu güven düzeyiyle izlenir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A7](A7-ai-byok-and-future-oem-architecture.md) §§10,12.
- **Finding / disposition:** F21

### Audit DA-AUTO-004

- **Current exact behavior:** LexCom potansiyel partnerdir; sözleşme veya erişim/yeniden kullanım hakkı kanıtı yoktur.
- **Current decision/evidence:** OPEN / UNVERIFIED.
- **Current source/section:** [A7](A7-ai-byok-and-future-oem-architecture.md) §§10,15.
- **Finding / disposition:** F21

### Audit DA-AUTO-005

- **Current exact behavior:** OE/OEM reference, cross-reference/equivalence ve vehicle fitment ayrı anlamlarla izlenmelidir; aynı part number veya AI/provider önerisi tek başına confirmed compatibility veya canonical merge kanıtı sayılmamalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [ADR-0002](../adr/ADR-0002-automotive-domain-isolation.md) Decision; [A5](A5-canonical-identity-organizations-and-authorization.md) §11; [A7](A7-ai-byok-and-future-oem-architecture.md) §10.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-AI-001

- **Current exact behavior:** Organization kendi provider bağlantısını ve API key’ini kullanabilmeli; sağlayıcı tercihi geleceğe bırakılır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A7](A7-ai-byok-and-future-oem-architecture.md) §§2,5,12.
- **Finding / disposition:** F21

### Audit DA-AI-002

- **Current exact behavior:** AI tool yetkisi güncel Organization/user/app/resource izinleriyle sınırlıdır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §10; [A7](A7-ai-byok-and-future-oem-architecture.md) §§6–7.
- **Finding / disposition:** F21

### Audit DA-AI-003

- **Current exact behavior:** High-impact AI action uygun scope’lu onay ister; tool proposal approval ile execution arasında tekrar kontrol edilir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A7](A7-ai-byok-and-future-oem-architecture.md) §8.
- **Finding / disposition:** F21

### Audit DA-AI-004

- **Current exact behavior:** İlk tercih mevcut backend’de küçük provider-neutral application layer’dır; framework/MCP seçimi onaylı değildir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A7](A7-ai-byok-and-future-oem-architecture.md) §§2–4,15.
- **Finding / disposition:** F21

### Audit DA-AI-005

- **Current exact behavior:** BYOK encryption/KEK isolation, redaction, outbound policy ve provider’a veri aktarım onayı gerekir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A7](A7-ai-byok-and-future-oem-architecture.md) §§5,9,13.
- **Finding / disposition:** F22

### Audit DA-AI-006

- **Current exact behavior:** Connector service principal ile insan oturumu ve AI delegation ayrılır; inbound/outbound auth farklı sözleşmelerdir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A5](A5-canonical-identity-organizations-and-authorization.md) §§9–10; [A7](A7-ai-byok-and-future-oem-architecture.md) §6.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-AI-007

- **Current exact behavior:** Prompt injection, arbitrary SQL/shell/HTTP ve çapraz-Org retrieval sınırları bounded tools ile kontrol edilmelidir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A7](A7-ai-byok-and-future-oem-architecture.md) §9.
- **Finding / disposition:** F22

### Audit DA-AI-008

- **Current exact behavior:** Gelecekte harici ERP/accounting/inventory bağlantıları, optional native Accounting activation’ını zorunlu kılmadan desteklenebilmelidir; mapping, source-of-truth, tenant credentials, idempotency ve reconciliation açık kontratla tasarlanmalıdır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §4 (External accounting/inventory identities), §10.9; [A2](A2-platform-core-placement-and-integration-topology.md) §§7,10; [A6](A6-development-roadmap-and-release-sequencing.md) §14.
- **Finding / disposition:** F21

### Audit DA-UX-001

- **Current exact behavior:** Türkçe, İngilizce ve Modern Standard Arabic ile RTL desteği intended product scope olarak sağlanmalıdır; bu hedef tamamlanmış UI iddiası değildir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [DESIGN](../../../DESIGN.md) §16; [A6](A6-development-roadmap-and-release-sequencing.md) §§2,13.
- **Finding / disposition:** F13

### Audit DA-UX-002

- **Current exact behavior:** Keyboard, focus, screen-reader, contrast, touch target ve hata erişilebilirliği acceptance standardına adaydır.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [DESIGN](../../../DESIGN.md) §17; [A6](A6-development-roadmap-and-release-sequencing.md) §9.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-UX-003

- **Current exact behavior:** DESIGN palette/font/layout/light-dark önerileri product requirement veya accepted architecture değildir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [DESIGN](../../../DESIGN.md) §§7–22; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §5.
- **Finding / disposition:** F22

### Audit DA-DATA-001

- **Current exact behavior:** Retention/archive/restore/deletion legal, financial ve private kayıt sınıfına göre ayrı onay ister.
- **Current decision/evidence:** OPEN / UNVERIFIED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A5](A5-canonical-identity-organizations-and-authorization.md) §15; AGENTS Approval gates.
- **Finding / disposition:** F18

### Audit DA-DATA-002

- **Current exact behavior:** Posted accounting ve completed financial snapshots yeniden yazılmaz; correction/audit ayrı kayıtla izlenir.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [A3-R](A3-R-native-basic-accounting-reassessment.md) §6; [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§14–15.
- **Finding / disposition:** F18

### Audit DA-DATA-003

- **Current exact behavior:** Research, approved requirement, accepted ADR ve implemented architecture farklı otorite sınıflarıdır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §§8–9; [Research index](README.md) Authority.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-DATA-004

- **Current exact behavior:** Gelecek research yazımı yalnız açık task yetkisinde; unique filename, full evidence ve izinli index update ile yapılır.
- **Current decision/evidence:** APPROVED / VERIFIED.
- **Current source/section:** [Research index](README.md) Research Lifecycle.
- **Finding / disposition:** K — bu briefing kapsamında yeni önemli gap saptanmadı; mevcut open parameters ve decision class korunur.

### Audit DA-DATA-005

- **Current exact behavior:** Ürün/pasif uygulama için yeni kullanım veya satışa kapatma, historical record erişimi ve archive/restore ayrı yaşam döngüleri olmalıdır; protected financial records referansları destructive cascade ile kaybedilmemelidir.
- **Current decision/evidence:** PROPOSED / RECOMMENDED.
- **Current source/section:** [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §7 (senaryo 8); [A2](A2-platform-core-placement-and-integration-topology.md) §7 (senaryo 9); [A3-R](A3-R-native-basic-accounting-reassessment.md) §7; [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Finding / disposition:** F18

## 6. Marketplace, representative ve Loyalty hesapları ayrı

| Hesap | Kabul edilmiş/aktarılan iş hedefi | Açık parametre; yanlış aktarım riski |
|---|---|---|
| General marketplace commission | Bir transaction’da çok component; name/% veya fixed/value/optional min/max; yüzdeler belirtilen aynı gross base üzerinde bağımsız, sequential compounding yok; total=sum; seller breakdown; buyer zorunlu disclosure yok; Store/product exceptions | Gross base VAT/shipping/discount içeriği, amount bounds uygulama birimi/currency, rounding, exception precedence OPEN. Representative net rule buraya taşınmaz |
| Representative earnings | Ayrı qualified net product amount; VAT/shipping dışarıda; earned hak departure/reassignment’da korunur;12-month detail current briefing’den aktarılır | Period trigger/scope/overlap ve discount/Kumbara exact treatment teyit; rate/vesting/payable/refund/dispute policy OPEN. A1’deki discount-excluded historical ifade exact current formula sayılmaz |
| Platform Loyalty / Golden | Operational90 purchase-day OR30 human Org-login-day; Golden için ayrıca central performance target | Golden amount/qualification period/purchase definition OPEN;12-month rep entitlement otomatik Golden period olmaz |
| Kumbara | Promotional credit ile monetary commission ayrı | Funding/redemption/expiry/cash conversion/tax ve earnings-base etkisi ayrı policy; promo credit cash payable diye toplanmaz |
| Store payout | Store bağımsız eligible finalized funds, platform-controlled schedule, displayed payment date; slider keyfi date-delay aracı değil | Friday/holiday policy kapsam teyidi; finalized/eligible/reserve/holds/provider semantics OPEN. Request interface user-selected payout day değildir |
| Native Basic Accounting | Double-entry/idempotency/immutable posted records/auditable correction, optional activation | Commerce commission/payment execution’ın yerine geçmez; detailed Turkish workflow research + expertise review öncesi accounting postings seçilmez |

Warranty, refund, abuse ve dispute farklı olaylardır. Normal warranty tek başına vested earnings confiscation değildir. Bunun yanında “refund/fraud hiçbir koşulda correction doğurmaz” şeklinde yeni absolute politika çıkarılamaz.

## 7. Specific future document amendment proposal — uygulanmadı

Bu bölüm yalnız requirements documentation patch specification’dır; implementation plan/files/code/dependencies/tests/rollout tasarlamaz.

### 7.1. Original ID’ler ve precise patch targets

- FIN-003 retained: component model, independent gross-base, bounds, sum, seller-facing disclosure/buyer non-obligation ve Store/product exception clauses; acceptance labels FIN-003.A–F. Whole APPROVED kalır; “iki bileşen net tutara” acceptance gross-base hedefiyle netleştirilir.
- FIN-001 retained: independent eligible balances explicit; ORG-002 independent approval unchanged.
- FIN-005 retained: departure/reassignment earned-right protection explicit; representative intended owner; future accrual ve history-access ayrı.
- LOY-006 retained: separate reassignment permission+approval APPROVED invariant; exact case/Org-platform approver mechanisms proposed/open.
- LOY-007 retained: promo-vsmonetary separation APPROVED invariant; funding/redemption/expiry/ledger mechanism open.
- MKT-009 retained: Store-specific BuyerOrg block; platform-wide restriction varsayımı yok.
- MKT-011 retained: lowest eligible price goal APPROVED; equivalent-comparison/eligibility/tie/tax/discount/stacking open.
- APP-001/002/003/008 retained: dört business invariant APPROVED current E; categories mandatory/default-enabled/optional, initial sector activation, no auto disable/recommendations, personal order+expanded/collapsed, protected historical records. Broad uninstall/forever-data preservation claim daraltılır; restore/history rights open.
- SEC-007: confidentiality/auditability inherited binding clauses ayrı; record’ın technical placement proposal’ı blanket approved yapılmaz.
- DATA-002: protected financial destructive deletion prohibition explicit. DATA-005’te finance-reference preservation inherited approved, archive/restore mechanisms proposed. DATA-001’de approval gate binding; class policy values OPEN.
- APP-004/005, SEC-004, ID-006: backend event/notification relation, lock beside bell, badge-earned/genuine transitions; specific outbox/dedup/timing approved olmaz.
- AI-008: future external capability representation ve ACC-005 optionality crosslink; proposed connector implementation separate.
- SEC-003/CAT-001/AUTO-002/JOB-004/AI-005/007/FIN-004/MKT-005/UX-003: inherited approved outcomes technical proposals’dan altclause metadata ile ayrılır; bütün mechanism statuses değiştirilmez.

Yedi current whole-record için dar business-only amendment sonrası PROPOSED/RECOMMENDED → APPROVED/VERIFIED önerisi var: APP-001,APP-002,APP-003,APP-008,MKT-011,LOY-006,LOY-007. Burada VERIFIED “current owner-relayed approval context” demektir; original approval transcript veya implementation değil. LOY-006 scope specific Org/platform case workflow’dan approved permission/approval invariant’a daraltılmalı. Bunların yedisini koşulsuz mevcut metniyle reflag yapmak safe değildir.

Current61APPROVED/33PROPOSED/4OPEN/1DEFERRED; sadece bu yedi dar correction uygulanırsa68APPROVED/26PROPOSED/4OPEN/1DEFERRED ve99IDs. Yeni mixed records’ın whole status’u owner’ın clause decision şemasına bağlıdır; yeni numerical approval/reclassification sayılarını önceden kesinleştirmemek gerekir.

### 7.2. Gerekçeli yeni ID adayları

Original99 renumber/reuse edilmez. Yeni numbering sadece öneridir; patch anında case-insensitive collision check gerekir. Aynı lifecycle içindeki alt-acceptance rule sırf sayıyı büyütmek için yeni ID değildir.

| Önerilen ID | Ayrı capability / gerekçe | Bulgu | Decision ayrımı |
|---|---|---|---|
| DA-FIN-007 | Platform payout schedule, displayed date, eligible funds slider | F03 | APPROVED invariant; Friday/holiday default confirmation |
| DA-FIN-008 | Payment receipt PDF viewing | F04 | APPROVED owner-relayed B; source/provider OPEN |
| DA-LOY-010 | Representative entitlement period ve net product earnings base | F05 | Approved base invariant;12-month scope/discount/Kumbara confirmation |
| DA-LOY-011 | Warranty/refund/abuse/dispute ve vested protection | F07 | APPROVED invariant;reversal OPEN |
| DA-MKT-012 | Minimum basket ve free-shipping thresholds | F12 | PROPOSED historical target pending approval-scope confirmation |
| DA-MKT-013 | Storefront country/language/display-currency preferences | F13 | PROPOSED target;display/settlement invariant preserved |
| DA-SEC-009 | Audit fields/search/filter/CSV/Excel export | F16 | PROPOSED target pending historical scope;approved security inherited |
| DA-APP-009 | Advanced search/filter functional capability | F17 | PROPOSED pending module scope |
| DA-DATA-006 | Module bins/restore/permanent failure reasons | F18 | PROPOSED scope;30-day confirmation;finance protection approved |

İlk dört candidate (FIN-007/008,LOY-010/011) bağımsız payout ve representative requirement owner/acceptance’ları için önerilir:103 toplam. LOY-010 içinde12months henüz exact approved contract diye finalize edilmez. Diğer beş candidate, D/F historical scope teyidi ve functional-surface review sonrası:108 toplam. Owner farklı granularity seçerse new finance record’ları aynı lifecycle altında clause olarak tutabilir;108 kesin hedef/başarı kriteri değildir.

### 7.3. Open/deferred register amendments

- O-04: mandatory/default-enabled/optional ve no-auto-disable/launcher independent permissions artık açık iş hedefleri; yalnız app lists/sector matrix/preference mechanism/history permissions open.
- O-07: lowest eligible target ve Store block invariant yeniden open sayılmaz; comparison basis/ties/stacking/block external effects open. Store basket/free-shipping/preferences C scope references eklensin.
- O-08: general commission independent gross-base/no-compounding/definition/disclosure approved clauses; VAT/shipping/rounding/conflict precedence open. Platform payout schedule business rule ile Friday ambiguity, date/cutoff/eligible finalized state/provider ayrı.
- O-10: representative12-month exact scope + discounts/Kumbara original calculation confirmation ayrı; Golden performance target period bunlarla birleşmez. Vested departure/reassignment/warranty protection açık; refund/fraud/dispute adjustments open.
- O-03/O-16: detailed audit fields/query/export and module bins/30day scope C register; protected finance deletion ban yeniden open değil; access/redaction/legal class rules open.
- D-01/DA-ID-004: identity technology/provider **DEFERRED unchanged**. KPS/e-Devlet/card/biometric/selfie/provider seçimi yok. Synthetic authorization PoC selection prerequisite değil.
- D-02–04 future delivery/design ayrımı korunur; “documentation task prohibited implementation” permanently product-deferred decision diye yazılmaz.
- New confirmation references C-01 Friday/holiday status; C-02 twelve-month exact scope; C-03 discount/Kumbara formula; C-04 Store thresholds/preferences approval scope; C-05 audit/advanced search functional scope; C-06 module bins30day/restoration/failed-reason history approval.

### 7.4. Cross-domain invariant updates

REQUIREMENTS §8.2: business entitlement/permission/launcher separation approved; proposed mechanism ayrı. §8.3: independent Store balance + platform schedule/request constraints crosslink. §8.4: displayed currency≠source/transaction/settlement; general commission multiple same-base not compounded. §8.5: representative earned/accrual/warranty vs activity/Golden separate. §8.7/11: protected finance no destructive delete, optional app off≠protected-history deletion; class-specific bin policy. Yeni approved audit/publication/scheduling invariant ancak above S/C evidence scope ile. No auto suspension,90/30 OR,personal gates,manual independence korunur.

### 7.5. Statistics ve provenance

§6 briefing dictionary’ye S3-R helper reference eklenmeli: exact task title/§3.A–H, current conversation context, no original approval date/permalink. §9 current-correction history original research’i rewrite etmez; bu audit linki/draft amendment reference ayrı. §9.2/9.4 coverage ve domain/status totals approved patch şekline göre yeniden hesaplanır. §14 approval history “audit reviewed” ile “requirements accepted” ayrımını korur; tüm belge DRAFT ancak ayrıca explicit owner acceptance sonrası değişebilir. CONFIRMATION_REQUIRED yardımcı annotation’dır; yeni decision-status enum silently eklenmesin; record parameter PROPOSED/OPEN + evidence limitation ile temsil edilebilir.

## 8. Genuine new/confirmation decisions — önceden approved rule’ı yeniden açmadan

| Ref | Teyit / yeni policy | Approved invariant korunurken sınır |
|---|---|---|
| C-01 | Friday approved mı proposed default mı; holiday-next-business-day kapsamı | Platform scheduling authority/display date/slider restrictions onaylı aktarım |
| C-02 |12months hangi trigger/Organization/representative/transaction ve reset/overlap/effective dates | Earned-right preservation ve representative financial scope korunur;12months historical reported parameter yok sayılmaz |
| C-03 | Discounts ve Kumbara-funded amount exact formula; hangi promotional funding transaction’da nasıl sayılır | VAT/shipping exclusion ve promo/cash separation; A1 recommendation’dan exact formula icat edilmez |
| C-04 | Store min basket/free threshold ve country/language/display currency preference approval/guest-account scope | Amount/base/currency/tax/discount/exception policy seçilmedi;display settlement’ı değiştirmez |
| C-05 | Advanced-search module surface, audit field/search/CSV/Excel-export exact approval scope | Authorization/redaction invariant binding |
| C-06 | Module bins/restore/permanent deletion-failure evidence ve conditional30day approval scope | All-data30day retention yok;posted finance destructively deleted değil |
| O-FIN | Provider, finalized funds states, reserves, refund/fraud/dispute adjudication, precision/rounding, exception precedence | UI approved behavior provider settlement guarantee değildir |
| O-APP/SEC | Sector classification/default matrix,mandatory lists,preference key,sync,outbox/revoke/access timing | Approved user behavior reflagging technical protocol onayı değildir |
| O-DATA/UX | Legal class retention/legal holds,restore dependencies,locale matrix/accessibility/translation process | Existing approved invariants korunur |
| D-IDENTITY | Personalverification method/provider selection DEFERRED | Şimdi karar istenmiyor; initial auth PoC prerequisite yapılmıyor |

Bu sorular bugün otomatik cevaplanmadı. Exact original business formulation’un review’de yeniden açıkça owner tarafından verilmesi yeterlidir; permalink bulunmaması açık current karar vermeyi engellemez, fakat geçmişte repository’de kaydedilmiş gibi gösterilemez.

## 9. Source-link portability audit

REQUIREMENTS’te293 Markdown link occurrence bulundu, local file targets mevcut. Bunların7’si doğrudan ignored node_modules’a gider; mevcut laptopta geçerli olmaları clean clone’da dependency kurmadan açılacağı anlamına gelmez. Git check-ignore installed Mercur docs index’in ignored olduğunu doğruladı. Installed docs/core/framework versions exact local verification evidence olarak korunmalı.

| Current reference | Risk | Durable companion recommendation |
|---|---|---|
| REQUIREMENTS §13 llms.txt +6 installed mdx paths | Ignored dependency ve package regeneration/upgrade; no only-local durable source | @mercurjs/docs2.3.6 version + installed relative path + package manifest repository directory + release/source tag; generated page path’ın upstream varlığı ayrıca doğrulanmalı |
| G0-2 T02 permissions-middleware compiled.js ve public resolver types | Package internal/generated path migration | Version-pinned official permissions middleware source URL; exact local path/symbols korunur |
| T03 Seller/source currency | Store.currency settlement vs authoritative source prices karışması | Version-pinned Seller model; local Store entity docs companion |
| T05 commission winner | Multiple-component contract built-in diye varsayılır | Version-pinned system commission provider; local rule-matching source korunur |
| Payout schedule interpretation | Framework daily scheduler business Friday contract değil | Version-pinned create-payout workflow + local payout-pipeline.mdxdaki schedule-job boundary; project product scheduling ayrı |
| Medusa cart-refresh source | Framework newest docs installed2.21.2 davranışı sanılır | Version-pinned refresh-cart-items workflow companion; local exact path/verifications retained |
| DESIGN/local research untracked state | Link mevcut ama Git commit artifact’ı henüz değil | Current bytes/hash ve archive path preserved; staging/commit bu görevde yapılmadı |
| Historical absolute D:/ paths/Bun content-addressed directories | Machine-specific; regenerated paths portable değil | Future REQUIREMENTS source dictionary exact version/path/symbol + official tagged source; historical reports unchanged |

Erişilebilirliği kontrol edilen official source companions:

- [Mercur2.3.6 permissions middleware](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/api/utils/permissions-middleware.ts).
- [Mercur2.3.6 Seller model](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/modules/seller/models/seller.ts).
- [Mercur2.3.6 commission provider](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/modules/commission/providers/system.ts).
- [Mercur2.3.6 create payout](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/workflows/payout/workflows/create-payout.ts).
- [Medusa2.21.2 cart refresh](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/core-flows/src/cart/workflows/refresh-cart-items.ts).

Bu source URL erişim kontrolleri installed artifact’la byte-equivalence veya runtime feature proof değildir. Mercur tagged packages/docs/llms.txt ve docs tree URL kontrolü erişilebilir içerik vermedi (tool internal error); exact mdx GitHub paths uydurularak “verified” ilan edilmez. Official current docs sitesi durable navigation olabilir ama automatically version-matched değildir. Sonraki authorized amendment sırasında docs package build manifest/tag-generated source mapping ve gerekirse resolved commit SHA doğrulansın. Source companion ekleme internal source’a runtime dependency veya core modification yetkisi vermez. Local exact evidence dış link uğruna silinmez.

## 10. Projected requirement counts

Bu görev actual counts/statistics değiştirmedi:99IDs,61APPROVED/33PROPOSED/4OPEN/1DEFERRED,all NOT_ASSESSED. Proposed new IDs9 independent capability candidates; five await scope confirmation. Duplicate existing notification,badge,Store approval,identity gate,future module IDs önerilmedi.

| Domain | Current | Four finance/representative additions | All nine candidates |
|---|---|---|---|
| ID — Kimlik | 6 | 6 | 6 |
| ORG — Organization/Store/üyelik | 8 | 8 | 8 |
| SEC — Security/audit | 8 | 8 | 9 |
| APP — Applications/launcher/search | 8 | 8 | 9 |
| CAT — Catalog/Inventory/Contacts | 5 | 5 | 5 |
| MKT — Marketplace | 11 | 11 | 13 |
| FIN — Settlement/commissions | 6 | 8 | 8 |
| ACC — Accounting | 7 | 7 | 7 |
| LOY — Loyalty/representative/Kumbara | 9 | 11 | 11 |
| SOC — Meydan/reviews | 6 | 6 | 6 |
| JOB — Job/HR | 4 | 4 | 4 |
| AUTO — Vehicle/Quotations/OEM | 5 | 5 | 5 |
| AI — AI/integrations | 8 | 8 | 8 |
| UX — Localization/accessibility | 3 | 3 | 3 |
| DATA — Lifecycle/governance | 5 | 5 | 6 |
| **Total** | **99** | **103** | **108** |

Projected final status distribution clause granularity ve owner confirmations sonrası hesaplanmalıdır; hypothetical approval sayısı measured result değildir. Original92 ve G0-S3 ek7 intact mapping’i korunmalıdır.

## 11. Related evidence ve Accepted ADR navigation

- [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) — full archived research; final numbered sections findings’te.
- [A2](A2-platform-core-placement-and-integration-topology.md) — full archived research; final numbered sections findings’te.
- [A3](A3-bigcapital-basic-accounting-feasibility.md) — full archived research; final numbered sections findings’te.
- [A3-R](A3-R-native-basic-accounting-reassessment.md) — full archived research; final numbered sections findings’te.
- [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) — full archived research; final numbered sections findings’te.
- [A5](A5-canonical-identity-organizations-and-authorization.md) — full archived research; final numbered sections findings’te.
- [A6](A6-development-roadmap-and-release-sequencing.md) — full archived research; final numbered sections findings’te.
- [A7](A7-ai-byok-and-future-oem-architecture.md) — full archived research; final numbered sections findings’te.
- [G0-1](G0-step-1-architecture-decisions-and-documentation-gap-audit.md) — full archived research; final numbered sections findings’te.
- [G0-2](G0-step-2-requirements-and-decision-traceability-2026-10-10.md) — full archived research; final numbered sections findings’te.
- [ADR-0001](../adr/ADR-0001-mercur-as-marketplace-engine.md), [ADR-0002](../adr/ADR-0002-automotive-domain-isolation.md), [ADR-0003](../adr/ADR-0003-mercur-core-modification-policy.md): Accepted, unchanged.

## 12. Başlangıç/final Git ve permitted-write verification

Başlangıç Git status:

```text
 M docs/dogruadres/README.md
?? .vscode/
?? DESIGN.md
?? docs/dogruadres/REQUIREMENTS.md
?? docs/dogruadres/research/
```

466 tracked + existing untracked/exclude-standard file’ın SHA-256 snapshot’ı yazımdan önce alındı. Ignored dependencies/.git/cache bütünlüğü için repository-wide claim değildir. REQUIREMENTS hash ve existing accepted ADR/report bytes bu scope’ta protected. Final status directory-group görünümü research içinde report/index farkını tek başına göstermez; hash diff ayrıca doğrulanır.

Final Git status (directory grouping):

```text
 M docs/dogruadres/README.md
?? .vscode/
?? DESIGN.md
?? docs/dogruadres/REQUIREMENTS.md
?? docs/dogruadres/research/
```

Beklenen authorized delta: yalnız G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md yeni dosyası ve research/README.md tek index satırı. Archive write sonrası byte-hash diff ve Markdown/link/ID checks conversation completion’da bildirilecektir. REQUIREMENTS beginning SHA-256: 9e24564ba18eaeb479c09059f32df21b2181fb089a113ebb9a3de86240eba278. Existing tracked parent README değişikliği aynen korunur. No application test/build/migration/seed/dependency/secret/database operation; no stage/commit/reset/clean/stash; existing untracked artifacts unchanged.

**Bu audit REQUIREMENTS.md’yi kabul etmez veya modify etmez. Report §4 findings, §7 proposed patches, §8 C-01–06/O-FIN ve §10 conditional counts ürün sahibi review’ünü bekler; burada durulur.**

### 12.1. Archive sonrası documentation verification

- 99 current record exact audit entries,99 unique audit IDs; original92/92 covered. Nine proposed candidate IDs existing99 ile collision yapmıyor.
- Report ve research index için278 Markdown link occurrence/file target ve REQUIREMENTS explicit ID anchors kontrol edildi: broken0. Table column-width mismatch0; code fences balanced; git diff --check passed. Harici source companions’ın limited access checks §9’da; bütün archived external links yeniden doğrulandı iddiası yok.
- SHA-256 inventory diff: yalnız yeni bu report ve research/README.md index satırı. Existing466 file snapshot’tan index dışındaki465 protected files unchanged; deleted0. REQUIREMENTS unchanged hash: 9e24564ba18eaeb479c09059f32df21b2181fb089a113ebb9a3de86240eba278.
- Accepted ADR’ler, previous research reports, root AGENTS, security/architecture/principles/integration, DESIGN,.vscode ve pre-existing untracked files unchanged. Parent README’nin task öncesi diff’i korunmuştur. Staged diff empty.
- Initial/final git status --short aynı directory grouping’i göstermektedir; research dir already untracked olduğundan report/index değişimi nested hash diff ile doğrulandı.

**REQUIREMENTS.md DRAFT ve unchanged. Owner review sonrası bile future amendment ayrı write authorization gerektirir.**
