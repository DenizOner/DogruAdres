# DoğruAdres — Product Requirements

**CONTROLLED BASELINE v1.0 — MIXED DECISION STATUS; G1 APPROVED AMENDMENT RECORDED**

Baseline sürümü: v1.0, G0 / Step 4-C controlled mixed-status acceptance. Approval provenance: latest explicit Product Owner instruction §§3–8. Kayıt tarihi: 2026-10-10; geçmiş approval date, signature veya conversation permalink üretilmez.

## 1. Amaç, kapsam ve otorite

Bu belge DoğruAdres ürün davranışını, karar statüsünü ve izlenebilirliğini controlled mixed-decision-status baseline v1.0 olarak toplar. Önceki G0-S3/P/Q/S/T draft amendment tarihçesidir; G0-S4-B checkpoint evidence preservation’dır. Latest G0-S4-C yalnız bu dosyanın targeted reconciliation/baseline acceptance ve local commit’ini yetkilendirir. Baseline yeni ADR, veri şeması veya implementation plan değildir; architecture/software/provider selection/remote changes ayrı açık yetki ister.

Kaynak önceliği: güncel açık ürün sahibi kararı → [AGENTS.md](../../AGENTS.md) → [proje router’ı](README.md), authoritative project docs ve accepted ADR’ler → installed version-matched Mercur docs → source/types/runtime evidence → resmi upstream/Medusa kaynakları → gerektiğinde dış kaynaklar. Bu belge araştırma önerisini accepted mimariye yükseltmez; intended owner alanı final module/process/database boundary kararı değildir.

DoğruAdres, ortak yetkilendirilmiş domain data kullanan çok-uygulamalı bir business platform’dur; marketplace önemli uygulamalarından biridir. Products/Inventory/Vehicle/Quotations/Accounting ve gelecekteki integrations yalnız marketplace’in amacı için var sayılmaz. Shared data, private Organization records’ın global/public paylaşımı veya yetki mirası değildir. Mercur accepted marketplace engine olarak korunur; bu kapsam ifadesi ADR-0001/0002/0003 veya physical domain/database ownership boundaries değiştirmez (G0-S3-P §5 Platform Scope).

Birincil hazırlık kaynağı [G0 Step 2 §6 tam matrisi](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) içindeki 92 kayıttır. [G0 Step 1 §4](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) ve A1–A7/A3-R tam rapor içerikleri, mevcut governance ve accepted ADR’ler ayrıca incelenmiştir. DESIGN yalnız proposed görsel referanstır. Araştırmaların tarihsel önerileri ve kanıt sınırlamaları değişmeden korunur.

Belge sınırları:

| Belge türü | Sorumluluk |
|---|---|
| Research reports | Tarihsel evidence, değerlendirme ve öneriler |
| REQUIREMENTS.md | Product behavior, decision/evidence status, provenance ve kabul kavramları |
| ADR | Mimari alternatifler, gerekçe, sonuç ve acceptance izi |
| ARCHITECTURE.md | Target architecture ve domain boundaries |
| SECURITY.md | Approved güvenlik invariant’ları ve kontroller |
| CODEBASE.md | Yalnız verified implemented architecture; bu görevde oluşturulmaz |
| AGENTS.md | Kalıcı Agent governance |
| Implementation plans | Ayrı yetkilendirilmiş bounded development |

## 2. Belge durumu ve controlled acceptance kapsamı

**CONTROLLED BASELINE v1.0 — MIXED DECISION STATUS**. Product Owner G0-S4-C §7 ile controlled baseline’ı kabul etmiştir. APPROVED behaviors yalnız expressly approved scope içinde binding; PROPOSED proposals automatically approved değildir; OPEN unresolved decisions implementation-ready policy değildir; DEFERRED postponed kalır. All implementation states NOT_ASSESSED. Accepted ADR-0001/0002/0003 authoritative scope’larını korur; research historical evidence, DESIGN proposed visual reference’tır. Baseline software implementation/release readiness kanıtı veya architectural/coding authorization değildir.

Gelecekteki controlled review özellikle §3 terimler; §4–6 metadata/provenance; §7.1–7.15 bütün requirement records ve intended owners; §8 invariant’lar; §9 corrections/history; §10 deferred register; §11 open register; §12 acceptance principles; §14 approval/change control bölümlerini incelemelidir. §13 evidence navigation’dır, toplu araştırma onayı değildir.

## 3. Tanımlar ve glossary

| Terim | Bu belgedeki anlam |
|---|---|
| Controlled baseline v1.0 | Product Owner mixed-status acceptance; only scoped APPROVED behaviors binding, PROPOSED/OPEN/DEFERRED and NOT_ASSESSED distinctions retained |
| Person / canonical identity | Gerçek kişinin kalıcı DoğruAdres kimliği; Customer/Member/Admin teknik actor’larıyla eşleme ayrı |
| Organization | Legal/business kuruluş bağlamı; marketplace Seller değildir |
| Store / Seller | Mercur marketplace ticari mağazası; Organization mülkiyet eşlemesi ayrı |
| Branch | Organization alt iş/erişim kapsamı; Medusa StockLocation ile otomatik eşdeğer değildir |
| Workspace | Personal, Organization, Store/branch veya platform görev bağlamı |
| Legal Organization verification | Kişisel email/real-identity ve Store approval’dan ayrı eligibility state; provider/criteria/docs OPEN |
| Representative period / turnover | APPROVED12calendar months: effective assignmentT’nin ayının first day’inden12th month last day’e; qualifying turnover ZERO atactualT, pre-T retroactive earnings yok. Net base VAT/shipping excluded; Golden/inactivity ayrı |
| User preferences / display currency | Language/display currency/browsing delivery-country kullanıcıya ait presentation choices; Store commercial config veya actual checkout destination değildir |
| Currency layers | 1 source/list; 2 internal calculation; 3 versionedTRY publication; 4 optional personal display; 5 actual checkout/paymentTRY; 6 Store settlement/payoutTRY; 7 historical source/rates/taxes/charged snapshots. Initial Turkish-established seller scope, universal legal ban değil |
| Payout adjustment options | A previous eligible banking day (finalized-funds safeguard); B next eligible banking day initial DEFAULT; C next eligible configured scheduled occurrence, business day ile aynı değil. Platform controlled |
| Visual communication | Complex figures/states/periods contextual visual+exact accessible text where useful; no decorative/every-screen chart mandate or implemented design system |
| Banking business calendar | Preferred Google holiday events≠official holidays≠statutory halfdays≠bank windows≠provider cutoff≠platform policy. Friday/default next eligible day; halfday default nonprocessing/configurable; initiated funds arrival guarantee değil |
| Effective reassignment / Lost Customers | Auditable T old NEW accrual’ı keser; historical relationship + authorized earned history görünümü current private access sağlamaz |
| Arabic localization | Sole Arabic target Modern Standard Arabic (MSA), RTL; separate dialect yok. G0-S3-P variant ambiguity G0-S3-Q §6 ile CLOSED/SUPERSEDED |
| Membership / protected Owner | Organization-specific üyelik; protected ownership sıradan role/badge’dan ayrı |
| Email verification / personal identity verification | Ayrı logical states; kişisel yöntem/provider seçimi DEFERRED |
| Entitlement / permission / launcher preference | Uygulama kullanma hakkı, eylem/kaynak yetkisi ve kişisel sunum tercihi; birbirinin yerine geçmez |
| Operational activity / inactivity | DA-LOY-003’ün iki clock ve OR sonucuyla hesaplanan state; suspension değildir |
| Performance-target eligibility | Merkezi policy’nin ayrı purchase-performance kriteri; inactivity’den kaçınmak yeterli değildir |
| Representative reassignment eligibility | Temsilci atama/değişim kararı; activity ve performance ile ilişkilense de ayrı state/decision |
| Vested entitlement / Kumbara | Önceden kazanılmış commission/reward ile promotional balance ayrı anlamlar; nakde dönüşüm varsayılmaz |
| Source price / TRY publication / snapshot | Authoritative original-currency fiyatı; kontrollü calculated TRY projeksiyonu; işlem anındaki korunmuş finansal kanıt |
| Posted accounting record | Kesinleşmiş financial record; düzenleme/silme yerine auditable correction |
| Meydan | Established working product name; platform-wide kişisel sosyal uygulama |
| OEM reference / equivalence / fitment | Dış part reference, ürün eşdeğerliği ve belirli araç konfigürasyonuna uyumluluk; aynı iddia değildir |
| BYOK / delegation | Organization provider key’i; mevcut yetkilerle sınırlanan, yetkiyi artırmayan görev yetkilendirmesi |

Terimler final schema/field adlarını veya payment/legal sözleşmelerini belirlemez.

## 4. Evidence ile decision status ayrımı

| Boyut | Durum | Anlam |
|---|---|---|
| Decision | APPROVED | Açık ürün davranışı veya architectural direction kabul kanıtı var; implementation değildir |
| Decision | PROPOSED | Research/design önerisi; binding davranış olmadan önce review gerekir |
| Decision | OPEN | Çözümlenmemiş politika/parametre; varsayılan seçim yapılmaz |
| Decision | DEFERRED | Seçim açıkça ertelendi; prerequisite diye sessizce yeniden açılmaz |
| Decision | SUPERSEDED | Eski belirli önerinin yerine açık yeni karar gelir; tarihsel kaynak silinmez |
| Evidence | VERIFIED | Açık karar metni veya belirtilmiş kaynak ifadesi doğrulanabilir; yazılımın çalıştığı anlamına gelmez |
| Evidence | RECOMMENDED | Araştırma önerisi; product acceptance veya runtime proof yok |
| Evidence | INFERRED | Kanıttan çıkarım; doğrudan uçtan uca doğrulama yok |
| Evidence | UNVERIFIED | Gerekli policy, data veya runtime kanıtı eksik |

Whole-record Decision/evidence başlıca davranışı sayar; **Alt-kural decision scope** satırı inherited APPROVED outcomes, PROPOSED mechanism/parameter ve OPEN ayrıntıları ayrıca gösterir. Whole PROPOSED record inherited approved confidentiality/history’yi geçersiz kılmaz; whole APPROVED record specific proposed parameter’ı onaylamaz. Acceptance suffixes (ör. FIN-003.A) bağımsız requirement IDs değildir.

APPROVED + OPEN parameters birlikte mümkündür. Normatif metin APPROVED kayıt için kabul edilmiş hedefi, PROPOSED kayıt için review’e sunulan hedefi, OPEN kayıt için henüz seçilmemiş sözleşmeyi ifade eder. Öneri içindeki 'zorunlu' dili onay üretmez. Existing SECURITY secret/isolation/audit kuralları, bunları içeren daha geniş tasarım kaydı PROPOSED olsa da bağlayıcı kalır.

## 5. Delivery horizon ile implementation status ayrımı

Horizon kodları bu belgenin navigation sınıflarıdır; release taahhüdü veya yeni öncelik kararı değildir:

| Kod | Horizon |
|---|---|
| H-GOV | Sürekli governance / review; product software teslimi değil |
| H-FOUNDATION | Authorization/workspace/app foundation adayı; kapsam ayrıca onaylanacak |
| H-MARKET | İlk ticari marketplace adayı; final launch scope açık |
| H-DOMAIN | İlgili modülün gelecekte onaylanacak functional brief/dilimi |
| H-FUTURE | Gelecek AI/OEM/external integration; bu görevde delivery yok |
| H-DEFERRED | Seçim açıkça ertelenmiş |

G0-S4-C baseline v1.0’daki tüm implementation status’ları tarihsel snapshot olarak **NOT_ASSESSED**’dır. Sonraki G1 amendment’ları bu değerleri geriye dönük değiştirmez; kod/uygulama kapsamı ve doğrulama sonuçları ilgili amendment/checkpoint raporunda ayrı kaydedilir. Framework extension point’in varlığı PARTIAL veya VERIFIED_IMPLEMENTED işareti üretmez. A6 release sırası ve süre önerileri bağlayıcı plan değildir.

## 6. ID ve provenance kuralları

Özgün G0-S2 92, G0-S3 ek7, G0-S3-P ek10 ve G0-S3-T DA-UX-004 olmak üzere v1.0’daki 110 ID korunur; G1 amendment DA-AUTO-006 ile current111 stable IDs’dir. ID tekrar kullanılmaz ve sessiz renumber yapılmaz. Her §7 kaydı kaynak/provenance taşımalıdır; ekler ve amendments §9’da kaydedilir. Hiçbir original kayıt düşürülmemiştir.

Her kayıt: normatif davranış, intended owner, bağımsız decision/evidence, exact source section, briefing provenance, horizon/implementation, dependencies/ADR ilişki etiketi, acceptance concept ve open parameters içerir. §11 tablosu domain kayıtlarının open sorularını gruplayan register’dır; onların yerine geçmez.

Provenance sözlüğü:

- **G0-S2 / PO-***: [G0 Step 2 §2.2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) içindeki chat-provided owner briefing kodları. Original transcript/message permalink verilmemiştir; bağımsız original conversation quote/date uydurulmaz. APPROVED kayıtlar bu belgede kaydedilmiş briefing kanıtını taşır; review bu izi teyit eder.
- **G0-S3**: bu görevin 'Create the Authoritative Product Requirements Draft' talimatı; §3.A–I açık correction/decision briefing’i; §6 coverage ve §1 dar write authorization. 2026-10-10 bu draft hazırlanma tarihidir; önceki onay tarihi değildir. Message ID/permalink sağlanmadı.
- **G0-S3-R**: [coverage/approval audit](research/G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md), özellikle §§4/7/8/9/10. Findings F01–F22 recommendation specification’dır; bu rapor requirements acceptance değildir.
- **G0-S3-P**: current “Controlled Requirements Amendment” görevi §4 safe corrections, §5 cross-conversation briefing ve §1/6/7 dar amendment yetkisi. Explicit product-owner instruction current source’tur; historical approval dates/original messages verilmedi. Tarih2026-10-10 bu amendment’ın hazırlama tarihidir. Uncertain historical scope PROPOSED/OPEN annotation’da görünür kalır.
- **G0-S3-Q**: current “Final Business-Decision Corrections and Calendar Feasibility” §3 C-01, §4 C-02, §5 C-04 ve §6 MSA-only açık owner decisions; [archived reconciliation](research/G0-step-3-Q-business-decisions-and-calendar-feasibility-2026-10-10.md) §§2–8. 2026-10-10 hazırlama/inceleme tarihi, invented historical approval date/permalink değil. Calendar sources feasibility evidence’dır, provider acceptance değildir.
- **G0-S3-S**: current explicit owner §§3/4/5 approves Google preferred source/automatic sync/default payout calendar,12-calendar-month first-of-effective-month period+ZERO-atT turnover, initial Turkey-scoped mandatoryTRY charge/settlement/payout; [report](research/G0-step-3-S-google-calendar-representative-and-try-settlement-2026-10-10.md) §§3–8 separates live publicICS evidence from unverified authenticatedAPI and operational/provider choices. No historical approval date/permalink invented.
- **G0-S3-T**: current explicit owner §§3/4/5: selectableA/B/C withB default, fullfirstpartial-month monthlytarget/no day-proration, visualcommunication APPROVED; [report](research/G0-step-3-T-payout-deferral-full-month-targets-and-visual-communication-2026-10-10.md) §§3–6. HistoricalS/Q/R unresolved statements remain historical, currentregister corrected; no approvaldate/permalink invented.
- **P01–P09**: G0-S2 §8’in proposed architecture topics’idir; accepted veya oluşturulmuş ADR değildir. Requirements owner veya module boundary onayı yerine geçmez.
- **G0-S4-C**: latest explicit Product Owner instruction §§3–8 targeted reconciliation/controlled mixed-status acceptance; §10 only REQUIREMENTS local commit. Eski approval dates/permalinks/signatures uydurulmaz.
- **T02/T03/T04/T05** vb.: G0-S2 §4’teki version-specific static audit evidence; bu belge bunları runtime kanıtı diye tekrarlamaz.
- **'Bu görev brifingi' / 'Brifing'** kaynak hücresi original G0-S2 görevini ifade eder; G0-S3 dayanağı ayrı provenance alanında gösterilir.

Araştırma bölüm numaraları raporların final metnindeki numbered section’larıdır; tool/conversation export satırları değildir. Link dosyaya gider, exact § ve gerektiğinde tablo/senaryo label’ı yanında yazılır; bold-numbered A3-R/A5 bölümlerine varsayımsal heading anchor üretilmez.

## 7. Alanlara göre gereksinimler

Aşağıdaki owner’lar logical/intended accountability’dir; personel ataması veya yeni domain architecture acceptance değildir. Her domain record’unda open parametre korunmuştur.

## 7.1. Kimlik ve kişisel alan

<a id="da-id-001"></a>

### DA-ID-001

**Davranış:** Bir gerçek kişi için tek kanonik DoğruAdres kimliği; framework actor bağlantıları bu kimliği temsil eder.

- **Owner / intended owner:** DoğruAdres Identity / kişisel alan.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §4; [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4.
- **Conversation provenance:** PO-ID.1.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.1, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Actor eşleme.
- **ADR / architecture relation:** P02. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Aynı kişi iki Organization’da aynı person ID ile görülür.
- **Current approved clause:** Each supported authenticated framework actor is explicitly mapped server-side to a canonical Person. Matching email alone never merges or links identities.
- **Open parameters / decisions:** Account recovery and explicit identity-linking/merge workflows remain unapproved; actor mappings are provisioned by the protected platform flow or a valid invitation acceptance.

<a id="da-id-002"></a>

### DA-ID-002

**Davranış:** Kişisel alan Organization bağlamından bağımsızdır; Organization değişimi kişisel kaynakları yeniden sahiplenmez.

- **Owner / intended owner:** DoğruAdres Identity / kişisel alan.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §§4–5; [A6](research/A6-development-roadmap-and-release-sequencing.md) §4.
- **Conversation provenance:** PO-ID.4; PO-MEY.1.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.1, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-001.
- **ADR / architecture relation:** P02. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Org değiştirildiğinde kişisel sahiplik sabit kalır.
- **Open parameters / decisions:** Kişisel uygulama listesi ve varsayılan alan?

<a id="da-id-003"></a>

### DA-ID-003

**Davranış:** E-posta doğrulaması ve kişisel kimlik doğrulaması ayrı mantıksal durumlar olarak değerlendirilir.

- **Owner / intended owner:** DoğruAdres Identity / kişisel alan.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §6; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** PO-ID.6; PO-VER.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.1, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Doğrulama state modeli.
- **ADR / architecture relation:** P02/P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** E-posta doğrulama sosyal yazma izni vermez.
- **Current approved clause:** Organization invitation acceptance requires an authenticated actor whose existing authentication verification record proves a verified email matching the intended recipient. This does not select a new verification provider or equate email verification with real-world identity verification.
- **Open parameters / decisions:** Verification revocation, expiry and re-verification lifecycle outside invitation acceptance remain open.

<a id="da-id-004"></a>

### DA-ID-004

**Davranış:** Kişisel doğrulama sağlayıcısı, teknoloji, maliyet ve hukuki veri işleme seçimi ertelenmiştir; erişim şartı korunur.

- **Owner / intended owner:** DoğruAdres Identity / kişisel alan.
- **Decision / evidence:** DEFERRED / VERIFIED.
- **Research ve exact section:** [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §§6,10; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §15.
- **Conversation provenance:** PO-VER; G0-S3 §3.E.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.1, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DEFERRED / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-003.
- **ADR / architecture relation:** P02/P03; sağlayıcı ADR’si sonra. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** KPS/e-Devlet/kart/selfie/NFC/biyometri veya commercial provider seçilmez; sentetik initial authorization PoC provider seçimini prerequisite yapmaz.
- **Open parameters / decisions:** Provider/method/technology, maliyet ve hukuki işleme seçimi DEFERRED; logical verification gate korunur.

<a id="da-id-005"></a>

### DA-ID-005

**Davranış:** Standard Verified kişisel kimlik doğrulaması gerektirir. Golden Verified buna ek olarak protected Owner üyeliği ve merkezi performance-target politikasını sağlayan eligible Organization gerektirir. Yalnız inactivity’den kaçınmak Golden Verified sağlamaz.

- **Owner / intended owner:** DoğruAdres Identity / kişisel alan.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §15.
- **Conversation provenance:** PO-BAD.1–2; G0-S3 §3.B/G.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.1, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-003; DA-LOY-001.
- **ADR / architecture relation:** P02/P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Email/üyelik tek başına rozet üretmez; inactive olmayan fakat performans hedefini sağlamayan Organization’ın Owner’ı Golden alamaz.
- **Open parameters / decisions:** Performance hedef tutarı, dönem, purchase tanımı ve qualification zamanı OPEN; DA-LOY-009.

<a id="da-id-006"></a>

### DA-ID-006

**Davranış:** Badge authorization sağlamaz. Badge-earned ve meaningful genuine badge-state transitions backend notification üretmeli; eligibility loss/change dynamic badge state’e yansıtılmalıdır. Notification/read/delivery state qualification’ın otoritesi değildir.

- **Owner / intended owner:** DoğruAdres Identity / kişisel alan.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A6](research/A6-development-roadmap-and-release-sequencing.md) §3.
- **Conversation provenance:** PO-BAD.3–4; G0-S3 §3.G.; G0-S3-P §4 Notifications and Session Lock; G0-S3-R F19.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.1, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-005; DA-APP-005.
- **ADR / architecture relation:** P03/P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Eligibility kaybı görünür badge durumunu değiştirir; gerçek geçiş bildirim üretir; rozet privilege escalation yaratmaz.
- **Open parameters / decisions:** Notification ve qualification zamanı ilgili application policy’sinde OPEN; dedup yöntemi DA-APP-005’te PROPOSED.

## 7.2. Organizations, Stores, şubeler ve üyelik

<a id="da-org-001"></a>

### DA-ORG-001

**Davranış:** Bir kişi birden çok legal Organization’da bağımsız üyelik ve roller taşıyabilir.

- **Owner / intended owner:** DoğruAdres Organization / Membership; Store lifecycle Mercur adapter.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §§4–5; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §§4–7.
- **Conversation provenance:** PO-ID.2.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.2, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-001.
- **ADR / architecture relation:** P02. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Org A rolü Org B erişimi sağlamaz.
- **Current approved clause:** Multiple protected Owners are allowed. Ordinary role management cannot demote or revoke the last active protected Owner.
- **Open parameters / decisions:** Transfer, recovery and exceptional representation mechanisms remain open; ordinary role operations do not provide a recovery bypass.

<a id="da-org-002"></a>

### DA-ORG-002

**Davranış:** Organization, marketplace Seller/Store’dan ayrıdır; bir Organization birden çok ayrı onaylanan Store’a sahip olabilir.

- **Owner / intended owner:** DoğruAdres Organization / Membership; Store lifecycle Mercur adapter.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §§4–5; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §3.
- **Conversation provenance:** PO-ID.3; PO-MKT.2.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.2, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Organization–Seller link.
- **ADR / architecture relation:** P01/P02; ADR-0001. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Bir Store onayı diğer Store’u otomatik onaylamaz.
- **Open parameters / decisions:** Onay ve mülkiyet devri yaşam döngüsü?

<a id="da-org-003"></a>

### DA-ORG-003

**Davranış:** Üyelik davet temellidir; alıcı kimliği ve yetki kapsamı sunucuda doğrulanmalıdır.

- **Owner / intended owner:** DoğruAdres Organization / Membership; Store lifecycle Mercur adapter.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §6.
- **Conversation provenance:** PO-ID.5.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.2, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-003.
- **ADR / architecture relation:** P02/P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Yanlış alıcı, replay, expired token kabul edilmez.
- **Current approved clause:** Invitations expire after seven days, are single-use, and may be revoked before acceptance. Acceptance requires an authenticated actor with a verified email matching the intended recipient. The token is stored only as a cryptographic hash; an email match never merges identities.
- **Open parameters / decisions:** Re-inviting a previously revoked member is handled only through a fresh invitation; email-change and account-recovery policy remains open.

<a id="da-org-004"></a>

### DA-ORG-004

**Davranış:** Protected Owner üyeliği ayrı korunur; birden çok Owner desteklenir ve normal role-management işlemleri son aktif protected Owner’ı demote/revoke edemez. Protected Owner transferi veya kurtarması bu görevde tanımlanmaz.

- **Owner / intended owner:** DoğruAdres Organization / Membership; Store lifecycle Mercur adapter.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §§7,12,15.
- **Conversation provenance:** PO-BAD.2 protected Owner kavramı; current explicit Product Owner instruction in G1 / Step 0B task resolves multiple-Owner and last-active-Owner role-management rules. No separate message permalink or approval timestamp was provided.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.2, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-001.
- **ADR / architecture relation:** P02/P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Son Owner sıradan rol düzenlemesiyle kaldırılamaz.
- **Open parameters / decisions:** Transfer, recovery and emergency ownership mechanisms remain open. Multiple protected Owners are allowed; only ordinary demotion/revocation is constrained by the last-active-Owner invariant.

<a id="da-org-005"></a>

### DA-ORG-005

**Davranış:** Personal, Organization, Store, branch ve platform-workspace izinleri örtük birleşmez.

- **Owner / intended owner:** DoğruAdres Organization / Membership; Store lifecycle Mercur adapter.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §§5,7–8.
- **Conversation provenance:** PO-ID.4.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.2, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-001–002.
- **ADR / architecture relation:** P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Org admin rolü ayrı Store/branch/platform yetkisine dönüşmez.
- **Open parameters / decisions:** Branch kapsamı ve inheritance kuralları?

<a id="da-org-006"></a>

### DA-ORG-006

**Davranış:** Şubelerin Organization sahipliği ve stok/işlem erişim kapsamı ayrı tanımlanmalıdır.

- **Owner / intended owner:** DoğruAdres Organization / Membership; Store lifecycle Mercur adapter.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §§4–5; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §5.
- **Conversation provenance:** PO-ID.4 kapsam ayrımını onaylar.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.2, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-005.
- **ADR / architecture relation:** P01/P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Başka şubenin stok/işlemi kapsam dışıysa reddedilir.
- **Open parameters / decisions:** Şube finansal bağımsızlığı ve paylaşım?

<a id="da-org-007"></a>

### DA-ORG-007

**Davranış:** Personal email verification, personal real-identity verification, legal Organization verification ve independent Store approval ayrı business states olarak değerlendirilmelidir. Kişisel email doğrulaması tek başına unverified Organization’a marketplace purchasing privileges sağlamaz; satın alma bağlamındaki Organization eligibility/verification gate server’da ayrıca değerlendirilir.

- **Owner / intended owner:** DoğruAdres Organization / Membership; Store lifecycle Mercur adapter.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §§4–5; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §4.
- **Conversation provenance:** PO-ID.3,6; PO-VER.; G0-S3-P §5 Organization Verification; G0-S3-R additional reconciliation.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.2, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-003/004; DA-ORG-002; DA-MKT-009.
- **ADR / architecture relation:** P02. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** ORG-007.A emailVerified/person identityVerified/legalOrgVerified/StoreApproved fixture states bağımsızdır; B person emailVerified iken Org unverified satın alma privilege’ı yalnız email state’inden edinemez; C Store approval legal Org verification yerine geçmez.
- **Open parameters / decisions:** Legal-entity verification criteria/documents/provider, pending applicant access ve exact purchasing eligibility lifecycle OPEN; provider seçilmedi. Personal identity provider DA-ID-004’te DEFERRED. Legal verification schema/protocol önerileri approved business states’ten ayrı.

<a id="da-org-008"></a>

### DA-ORG-008

**Davranış:** Protected Owner üyeliği ayrı korunan sahiplik kavramı olarak tanınmalıdır; sıradan rol veya Seller is_owner otomatik olarak bu statüyü üretmez. Transfer/kurtarma/son Owner mekanizmasının kesinleşmesi DA-ORG-004 kapsamında ayrı review ister.

- **Owner / intended owner:** DoğruAdres Organization / Membership; Store lifecycle Mercur adapter.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §§5,7,12,15; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** PO-BAD.2; G0-S3 §3.G.
- **Primary trace:** G0-S3 ek kayıt; §9.2 coverage/split gerekçesi.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-001; DA-ID-005.
- **ADR / architecture relation:** P02/P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Normal rol ya da Seller Owner statüsü Golden için protected Owner koşulunu tek başına karşılamaz.
- **Current approved clause:** The protected designation is distinct from the role label and Mercur Seller ownership. A protected Owner may add another protected Owner through the protected membership-management workflow; normal changes may not remove/demote the last active protected Owner.
- **Open parameters / decisions:** Transfer/recovery and emergency access remain open; no recovery mechanism is implemented here.

<a id="da-org-009"></a>

### DA-ORG-009

**Davranış:** Aynı tax identifier ile duplicate Organization registration’ın önlenmesi önerilen business invariant olarak incelenmelidir; duplicate tespiti kişisel identity merge veya Store merge yetkisi değildir.

- **Owner / intended owner:** DoğruAdres Organization verification/registration.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §§4–5 legalOrganization/cardinality; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §§3–4/15 canonicalOrganization (exact tax-uniqueness approval yok).
- **Conversation provenance:** G0-S3-P §5 Organization Verification cross-conversation owner briefing; historical scope unverified; G0-S3-P current briefing; original historical approval dates/message permalinks sağlanmadı.
- **Primary trace:** G0-S3-P ek kayıt; §9.5 amendment coverage ve audit ilişkisi.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-007; DA-ID-001; DA-ORG-002.
- **ADR / architecture relation:** İlgili G0-S2 P topics review bekler; new accepted ADR/module/schema/provider kararı değildir.
- **Acceptance concept:** ORG-009.A normalized matching taxId ikinci legalOrg başvurusu approved scope’a göre rejected/controlled review; B legitimate existingOrg correction/recovery prevents blind duplicate; C sameOrg multiple Stores permitted ORG-002.
- **Open parameters / decisions:** Historical approval scope OPEN; jurisdiction/legal-entity types/branch/sole-proprietor exceptions, normalization/uniqueness scope, concurrent application handling/correction/recovery/transfer/re-registration OPEN; provider/documents/schema seçilmedi.

## 7.3. Yetkilendirme, dosyalar, oturumlar ve denetim

<a id="da-sec-001"></a>

### DA-SEC-001

**Davranış:** Merkezi yetkilendirme fail closed çalışır; eksik principal, context, policy veya resolver izin vermez.

- **Owner / intended owner:** DoğruAdres authorization / session / security.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §§5,8; yerel T02.
- **Conversation provenance:** PO-ID.7.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.3, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** P01/P02.
- **ADR / architecture relation:** P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Eksik/bozuk resolver, Org mismatch ve policy hatasında erişim yok.
- **Open parameters / decisions:** Provider seçimi ve middleware bypass kapatılması?

<a id="da-sec-002"></a>

### DA-SEC-002

**Davranış:** API, workflow, job, file, export ve search sunucu tarafında aynı kapsam kurallarıyla korunur.

- **Owner / intended owner:** DoğruAdres authorization / session / security.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §8; SECURITY Mandatory rules.
- **Conversation provenance:** PO-ID.8.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.3, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-001.
- **ADR / architecture relation:** P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Her erişim yüzeyinde iki Org arasında negatif izolasyon testi.
- **Open parameters / decisions:** Public/protected route envanteri ve background principal?

<a id="da-sec-003"></a>

### DA-SEC-003

**Davranış:** Authenticated actor→canonical Person→active membership→policy→server-resolved resource scope zinciri her istekte fail-closed çözülür; istemci organization ID tek başına yetki vermez.

- **Owner / intended owner:** DoğruAdres authorization / session / security.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §§4–5,8.
- **Conversation provenance:** PO-ID.4,7–8.; G0-S3-P §4 Other Mixed-Status Records; G0-S3-R F21/F22.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.3, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-001; DA-ORG-001.
- **ADR / architecture relation:** P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Sahte org_id ve çoklu sekme context karışması reddedilir.
- **Open parameters / decisions:** Trusted background principals and future job/file/export/search surfaces remain separately scoped; this request path performs no authorization caching.
- **Alt-kural decision scope:** The request-time actor→Person→active membership→policy→resource chain, server-resolved Organization scope, immediate revocation effect and fail-closed behavior are APPROVED by the current Product Owner instruction. This does not implement background, file, export or search policies.

<a id="da-sec-004"></a>

### DA-SEC-004

**Davranış:** Shared header notification bell yanında tek-tık session-lock button bulunmalıdır. Locked-session protected erişimi backend’de kısıtlanmalıdır; password session unlock parola ile yeniden kimlik doğrulama ve gerçek backend enforcement gerektirir. UI overlay kaldırılması unlock değildir.

- **Owner / intended owner:** DoğruAdres authorization / session / security.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A6](research/A6-development-roadmap-and-release-sequencing.md) §3; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §§4,6.
- **Conversation provenance:** PO-ID.9–11.; G0-S3-P §4 Notifications and Session Lock; G0-S3-R F19.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.3, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Session state.
- **ADR / architecture relation:** P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Bell yanında lock vardır; kilit direct protected API/workflow erişimini sınırlar; yanlış parola unlock yapmaz, overlay bypass izin vermez.
- **Open parameters / decisions:** One/all session/device scope, locked-session permitted operations ve notification read, revoke latency, unlock/session storage/protocol OPEN; provider/teknoloji seçilmedi.

<a id="da-sec-005"></a>

### DA-SEC-005

**Davranış:** Üyelik/rol/app revoke, aktif session ve bekleyen job/export/search/file erişimlerine etkili olmalıdır.

- **Owner / intended owner:** DoğruAdres authorization / session / security.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §§8,12; [A7](research/A7-ai-byok-and-future-oem-architecture.md) §8.
- **Conversation provenance:** PO-ID.8,11.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.3, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-001–004.
- **ADR / architecture relation:** P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Revoke sonrası eski token, job ve download tekrar yetki kazanmaz.
- **Open parameters / decisions:** İzin verilen gecikme ve job iptal/yeniden kontrol noktaları?

<a id="da-sec-006"></a>

### DA-SEC-006

**Davranış:** Özel dosyalar açık kalıcı URL ile yetkiyi atlamamalı; arama/export/cache yan kanalları kapsam filtrelemelidir.

- **Owner / intended owner:** DoğruAdres authorization / session / security.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §8; [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §8.
- **Conversation provenance:** PO-ID.8.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.3, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-002,005.
- **ADR / architecture relation:** P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Revoked veya diğer Org kullanıcısı dosya/indeks/cache ile veri alamaz.
- **Open parameters / decisions:** Signed URL süresi, indirme proxy’si ve cache partition?

<a id="da-sec-007"></a>

### DA-SEC-007

**Davranış:** Confidentiality ve yeterli güvenlik auditability’si zorunlu approved invariant’lardır; token/key/password, ödeme sırları ve gereksiz kişisel veri log/audit/export’a kontrolsüz giremez. Operational logs, audit trail ve financial ledger farklı amaçları olan kayıtlardır; ayrı physical audit/log/module placement yaklaşımı araştırma önerisidir.

- **Owner / intended owner:** DoğruAdres authorization / session / security.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A2](research/A2-platform-core-placement-and-integration-topology.md) §8; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §8; SECURITY.
- **Conversation provenance:** PO-ID.8; doğrudan ayrıntı onayı yok.; G0-S3-P §4 Audit, Search and Data Lifecycle; G0-S3-R F15.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.3, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Audit event modeli.
- **ADR / architecture relation:** P03/P06. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** SEC-007.A secret/unauthorized fields log/audit/export’ta yok; B actor/context/action güvenlik izi bulunur; C detailed audit functional surface DA-SEC-009’un permitted-field şartlarıyla değerlendirilir.
- **Open parameters / decisions:** Physical audit/log/ledger architecture PROPOSED; tamper resistance, synchronous vs durable capture, retention/read access/redaction ve storage OPEN.
- **Alt-kural decision scope:** APPROVED/VERIFIED: SECURITY Mandatory rules ve DA-SEC-002/006/008 confidentiality/auditability. PROPOSED/RECOMMENDED: physical separation/persistence architecture.
- **Current approved clause:** Identity/Organization security mutations use the shared project audit trail; audit events are persisted with the mutation transaction and contain no credentials, plaintext invitation tokens or unrelated personal data. This bounded implementation does not choose retention, tamper-resistance or financial-ledger architecture.

<a id="da-sec-008"></a>

### DA-SEC-008

**Davranış:** Platform operatörü Organization özel verisine otomatik erişmez; support/break-glass açık politika gerektirir.

- **Owner / intended owner:** DoğruAdres authorization / session / security.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §§5,8,15.
- **Conversation provenance:** PO-ID.4.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.3, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-005.
- **ADR / architecture relation:** P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Platform workspace rolü özel Org kayıtlarını açmaz.
- **Open parameters / decisions:** Emergency access kapsamı, onay ve audit?

<a id="da-sec-009"></a>

### DA-SEC-009

**Davranış:** Önerilen audit capability event actor, Organization, role, action, target, timestamp ve yetkili/permitted before-after values izlemeli; authorized search/filter ve CSV/Excel export sağlamalıdır. Confidentiality/resource permissions her query/export/download’da binding kalır.

- **Owner / intended owner:** Authorized audit surface; security governance.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A2](research/A2-platform-core-placement-and-integration-topology.md) §8 Audit records; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §8; [G0 Step 3-R](research/G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) §4 F16.
- **Conversation provenance:** G0-S3-P §4 Audit, Search and Data Lifecycle; S3-R §3.F detailed historical approval uncertainty; G0-S3-P current briefing; original historical approval dates/message permalinks sağlanmadı.
- **Primary trace:** G0-S3-P ek kayıt; §9.5 amendment coverage ve audit ilişkisi.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-002/006/007/008; DA-DATA-001.
- **ADR / architecture relation:** İlgili G0-S2 P topics review bekler; new accepted ADR/module/schema/provider kararı değildir.
- **Acceptance concept:** SEC-009.A event identity/Org/role/action/target/time/permitted changes; B OrgA reader OrgB audit/search/count/export alamaz; C CSV/Excel same authorized redacted dataset; D before/after secret fields yok.
- **Open parameters / decisions:** C-05 exact event/field/module scope OPEN. Role at event-time vs current role, create/delete/missing-before semantics, redaction/field permissions, XLSX vs Excel-compatible format, filters/timezone/export limits/encoding/retention/physical audit architecture OPEN.
- **Alt-kural decision scope:** APPROVED confidentiality/auditability inherited SECURITY/SEC-007; detailed functional scope PROPOSED, original historical blanket approval iddiası yok.
- **Current approved clause:** For Organization provisioning, protected Owner assignment, invitations, and membership/role changes, the persisted event includes actor identity/type, role context, action, module/resource, timestamp, target, Organization context, and permitted before/after values. Search, exports and the broader audit product surface remain PROPOSED/OPEN.

## 7.4. Uygulamalar, launcher, bildirimler ve teslimat

<a id="da-app-001"></a>

### DA-APP-001

**Davranış:** Application entitlement, eylem/kaynak permission ve kişisel launcher tercihi ayrı iş kavramlarıdır. Launcher düzeni/visibility/expanded state yetki veya Organization uygulama hakkı oluşturmaz ya da iptal etmez.

- **Owner / intended owner:** DoğruAdres application lifecycle / shell / notification; teslimat için ürün sahibi.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §§4,7; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §7.
- **Conversation provenance:** PO-ID.4; PO-LOY.2.; G0-S3-P §4 Applications; G0-S3-R F14.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.4, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-001; P01.
- **ADR / architecture relation:** P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Launcher’dan gizlemek yetkiyi iptal etmiş gibi sayılmaz.
- **Open parameters / decisions:** Mandatory app listesi, lisans/entitlement registry ve teknik persistence/evaluation mekanizması OPEN; physical application/module boundary seçimi PROPOSED.

<a id="da-app-002"></a>

### DA-APP-002

**Davranış:** Mandatory, default-enabled ve optional application kategorileri ayrılmalıdır. İlk aktivasyon ilgili Organization sector/activity sınıflandırma kurallarından belirlenir. Sector-policy değişikliği zaten aktif uygulamaları otomatik kapatmaz; yeni ilgili uygulamalar önerilebilir. Mandatory uygulama sıradan optional-deactivation yoluyla kapatılamaz.

- **Owner / intended owner:** DoğruAdres application lifecycle / shell / notification; teslimat için ürün sahibi.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A6](research/A6-development-roadmap-and-release-sequencing.md) §3.
- **Conversation provenance:** ; G0-S3-P §4 Applications; G0-S3-R F14.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.4, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-APP-001.
- **ADR / architecture relation:** P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** APP-002.A category distinction; B onaylı sector matrix ilk activation’ı belirler; C policy değişiminde active app korunur; D yeni ilgili app recommendation olur; E mandatory app optional off ile kapanmaz.
- **Open parameters / decisions:** Exact app lists, sector/activity taxonomy ve matrix, defaults/mandatory policy change işlemi, recommendation consent/UX, entitlement implementation OPEN.

<a id="da-app-003"></a>

### DA-APP-003

**Davranış:** Optional application deactivation korunan historical records’ı silmemelidir. Yeni aktif kullanım ile yetkilendirilecek historical read/export/restore ayrı değerlendirilir; uninstall tüm kayıtlar için sonsuz retention veya silme yetkisi oluşturmaz. Marketplace optional Accounting activation’dan bağımsız kalır.

- **Owner / intended owner:** DoğruAdres application lifecycle / shell / notification; teslimat için ürün sahibi.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §7; [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §9.
- **Conversation provenance:** PO-ACC.5 checkout bağımsızlığı.; G0-S3-P §4 Applications; G0-S3-R F14/F18.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.4, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-DATA-001; app lifecycle.
- **ADR / architecture relation:** P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Optional Accounting off checkout’u kesmez ve posted financial history’yi silmez; historical read/export yalnız ayrı onaylı rights ile yapılır.
- **Open parameters / decisions:** Uninstall semantics, protected-data classes, legal retention, historical access/export/restore rights, reactivation/backfill/dependent-app behavior OPEN; mekanizma seçilmedi.

<a id="da-app-004"></a>

### DA-APP-004

**Davranış:** Shared header notification bell içermeli; yetkili kullanıcının genuine backend notification events’inden türetilen bildirimlerine erişim sağlamalıdır. Bell navigasyon öğesidir; notification delivery/read state kaynak domain’in gerçek business-state transition’ının yerine geçmez.

- **Owner / intended owner:** DoğruAdres application lifecycle / shell / notification; teslimat için ürün sahibi.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A6](research/A6-development-roadmap-and-release-sequencing.md) §3.
- **Conversation provenance:** PO-ID.9.; G0-S3-P §4 Notifications and Session Lock; G0-S3-R F19.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.4, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Notification kaynakları.
- **ADR / architecture relation:** P04; UI için ayrı ADR gerekmez. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** APP-004.A header bell authorized notifications açar; B genuine backend event notification üretir; C delivery/read işlemi domain eligibility/badge sonucunu değiştirmez. DA-SEC-004 lock bell yanında yer alır.
- **Open parameters / decisions:** Read/unread/channel/retention/preferences, permitted locked-session operations, delivery/retry/outbox/ordering/timing OPEN; teknoloji seçilmedi.

<a id="da-app-005"></a>

### DA-APP-005

**Davranış:** Önerilen notification reliability yaklaşımı domain-transition retry’larının duplicate bildirim üretmesini önlemeyi hedefler; backend event doğruluğu korunmalıdır. Gerçek badge-earned/state-transition notification outcome DA-ID-006/APP-004’te APPROVED’dır; bu kayıt exact delivery reliability mekanizmasını onaylamaz.

- **Owner / intended owner:** DoğruAdres application lifecycle / shell / notification; teslimat için ürün sahibi.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A2](research/A2-platform-core-placement-and-integration-topology.md) §§6–8; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** PO-BAD.4.; G0-S3-P §4 Notifications and Session Lock; G0-S3-R F19.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.4, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-006.
- **ADR / architecture relation:** P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Aynı badge transition tekrar işlendiğinde duplicate bildirim yok.
- **Open parameters / decisions:** Outbox/retry/event dedup keys/delivery guarantees/order/timing OPEN; reliability mekanizması PROPOSED, belirli teknoloji seçilmedi.
- **Alt-kural decision scope:** APPROVED/VERIFIED: DA-ID-006 ve DA-APP-004 kaynaklı genuine event/transition sonucu. PROPOSED/RECOMMENDED: dedup/durable delivery yaklaşımı; whole-record reclassification yapılmadı.

<a id="da-app-006"></a>

### DA-APP-006

**Davranış:** Functional app brief final Stitch ekran tasarımından önce gelir; DESIGN.md taslak referanstır.

- **Owner / intended owner:** DoğruAdres application lifecycle / shell / notification; teslimat için ürün sahibi.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A6](research/A6-development-roadmap-and-release-sequencing.md) §§10–11; [DESIGN](../../DESIGN.md) §§19–22.
- **Conversation provenance:** PO-DOC.3.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.4, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-GOV / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Domain requirements/acceptance.
- **ADR / architecture relation:** ADR gerekmez. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Ekran onayı eksik iş kuralı onayı yerine geçmez.
- **Open parameters / decisions:** App brief ve görsel onay şablonu?

<a id="da-app-007"></a>

### DA-APP-007

**Davranış:** Geliştirme küçük, ayrı incelenen dilimlerle ilerler; kabul standardı tamamlanmadan başka ana modüle geçilmez.

- **Owner / intended owner:** DoğruAdres application lifecycle / shell / notification; teslimat için ürün sahibi.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A6](research/A6-development-roadmap-and-release-sequencing.md) §§7–10; plans/README When a plan is required.
- **Conversation provenance:** PO-DOC.1–2.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.4, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-GOV / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Her dilimin scope/acceptance onayı.
- **ADR / architecture relation:** ADR gerekmez; plans/TEMPLATE.md. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Slice acceptance checklist kapanmadan sonraki ana modül başlamaz.
- **Open parameters / decisions:** Agreed acceptance standard’ın kesin checklist’i?

<a id="da-app-008"></a>

### DA-APP-008

**Davranış:** Kullanıcı kendi application launcher sırasını ve expanded/collapsed sections tercihlerini düzenleyebilmelidir; kişisel görünüm business permission veya Organization entitlement oluşturmaz/iptal etmez. Show/hide sunum seçeneklerinin exact kapsamı ayrıca UX review ister.

- **Owner / intended owner:** DoğruAdres application lifecycle / shell / notification; teslimat için ürün sahibi.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4 (App launcher kişisel düzeni); [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4 (Launcher sırası).
- **Conversation provenance:** G0-S3 §6 kapsam kontrolü; bağımsız ayrıntılı approval izi yok.; G0-S3-P §4 Applications; G0-S3-R F14.
- **Primary trace:** G0-S3 ek kayıt; §9.2 coverage/split gerekçesi.
- **Delivery horizon / implementation:** H-FOUNDATION / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-APP-001; DA-ORG-005.
- **ADR / architecture relation:** P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Kullanıcı A’nın order/collapsed section tercihi B’yi etkilemez; expanded/collapsed veya gizlenen item server authorization sonucunu değiştirmez.
- **Open parameters / decisions:** Person/selected Organization preference key, defaults/sync/devices, permitted show/hide choices ve accessible UI OPEN.

<a id="da-app-009"></a>

### DA-APP-009

**Davranış:** Advanced search/filter capability ilgili authorized domain records üzerinde önerilen product kapsamı olarak temsil edilmelidir; all-modules/global search kapsamı henüz seçilmemiştir.

- **Owner / intended owner:** DoğruAdres search application capability; each domain retains data authority.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4 Notifications/audit/search row; [A6](research/A6-development-roadmap-and-release-sequencing.md) §3 advanced search ertelenebilir; [G0 Step 3-R](research/G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) §4 F17.
- **Conversation provenance:** G0-S3-P §4 Audit, Search and Data Lifecycle; S3-R §3.F coverage uncertainty; G0-S3-P current briefing; original historical approval dates/message permalinks sağlanmadı.
- **Primary trace:** G0-S3-P ek kayıt; §9.5 amendment coverage ve audit ilişkisi.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-002/006; DA-SEC-009 when audit search.
- **ADR / architecture relation:** İlgili G0-S2 P topics review bekler; new accepted ADR/module/schema/provider kararı değildir.
- **Acceptance concept:** APP-009.A authorized list searchable/filterable; B denied records counts/facets/nested/export’ta yok; C no fake global search claim from notification bell.
- **Open parameters / decisions:** C-05 module/field/operator functional scope OPEN; performance/pagination/index/staleness/export coupling ve search engine/provider OPEN, dependency seçilmedi.

## 7.5. Products, Brands, Contacts ve Inventory

<a id="da-cat-001"></a>

### DA-CAT-001

**Davranış:** Global Product/Brand/normalize MPN ile Organization’ın private product master/cost/notes ayrı sahiplikte tutulmalıdır.

- **Owner / intended owner:** DoğruAdres private catalog / Contacts / Inventory; commerce catalog Mercur/Medusa.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4,7; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §3.
- **Conversation provenance:** PO-AI.5 bağımsızlık; ayrıntı onayı yok.; G0-S3-P §4 Other Mixed-Status Records; G0-S3-R F21/F22.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.5, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-001; DA-SEC-006.
- **ADR / architecture relation:** P01; ADR-0002. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Private maliyet/tedarikçi alanı public catalog’a sızmaz.
- **Open parameters / decisions:** Brand tekilleştirme ve normalization kuralları?
- **Alt-kural decision scope:** Private-resource confidentiality APPROVED/VERIFIED DA-SEC-002/006/008; universal Product/Brand/MPN ownership ve normalized canonical model PROPOSED. Shared authorized domain data tenancy/field permissions olmadan globally visible değildir.

<a id="da-cat-002"></a>

### DA-CAT-002

**Davranış:** Private ürünün canonical product bağlantısı yeniden eşlenebilir olmalı; satış/tarihsel kaydın anlamı korunmalıdır.

- **Owner / intended owner:** DoğruAdres private catalog / Contacts / Inventory; commerce catalog Mercur/Medusa.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §§4,7.
- **Conversation provenance:** Yok.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.5, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-CAT-001; DA-DATA-002.
- **ADR / architecture relation:** P01. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Re-link eski finansal snapshot’ı değiştirmez.
- **Open parameters / decisions:** Merge/unmerge ve duplicate ürün sorumlusu?

<a id="da-cat-003"></a>

### DA-CAT-003

**Davranış:** Contacts Organization-private kalmalı; platform kişisi/customer/seller ile otomatik aynı kimlik sayılmamalıdır.

- **Owner / intended owner:** DoğruAdres private catalog / Contacts / Inventory; commerce catalog Mercur/Medusa.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4; [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §5.
- **Conversation provenance:** Yok.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.5, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-002.
- **ADR / architecture relation:** P01/P07. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Org A contact’ı Org B’ye ya da publicprofile’a açılmaz.
- **Open parameters / decisions:** CRM/accounting contact canonical sahibi?

<a id="da-cat-004"></a>

### DA-CAT-004

**Davranış:** Mercur Offer inventory ile private Inventory ayrılmalı; Offer reservation/availability ile özel stok projeksiyonu kontrollü bağlanmalıdır.

- **Owner / intended owner:** DoğruAdres private catalog / Contacts / Inventory; commerce catalog Mercur/Medusa.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §§4,6; yerel T04.
- **Conversation provenance:** PO-AI.5 bağımsız uygulamalar.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.5, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Offer inventory; DA-ORG-006.
- **ADR / architecture relation:** P01; ADR-0001/2. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Stok değişimi yanlış Store/branch’e taşınmaz.
- **Open parameters / decisions:** Stok authoritative sahibi, birim ve rezervasyon politikası?

<a id="da-cat-005"></a>

### DA-CAT-005

**Davranış:** Products, Inventory ve Quotations AI/OEM olmadan kullanılabilir kalır.

- **Owner / intended owner:** DoğruAdres private catalog / Contacts / Inventory; commerce catalog Mercur/Medusa.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A7](research/A7-ai-byok-and-future-oem-architecture.md) §§7,10.
- **Conversation provenance:** PO-AI.5.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.5, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Private ürün/stok modeli.
- **ADR / architecture relation:** P08; ADR-0002. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Provider kapalıyken manuel ürün ve quotation akışı sürer.
- **Open parameters / decisions:** AI önerisini elle düzenleme ve canonical merge?

## 7.6. Marketplace ve çoklu para fiyatlama

<a id="da-mkt-001"></a>

### DA-MKT-001

**Davranış:** Mercur marketplace temeli korunur; sadece kanıtlanmış uyumsuzluk yeniden değerlendirme nedeni olabilir.

- **Owner / intended owner:** DoğruAdres pricing / FX / publication; commerce Mercur/Medusa.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §16; ADR-0001/3.
- **Conversation provenance:** PO-MKT.1.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.6, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-GOV / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Framework extension ilkesi.
- **ADR / architecture relation:** ADR-0001/3. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Uyumsuzluk iddiası sürüm-kaynak ve alternatif kanıtı içerir.
- **Open parameters / decisions:** Core patch/fork için ayrıca onay gerekir.

<a id="da-mkt-002"></a>

### DA-MKT-002

**Davranış:** Aynı Store desteklenen farklı authoritative source/list currency’li Offers (ör. EUR,USD,CNY; final supported matrix OPEN) tutabilir; source price ilgili Offer/pricing record otoritesinde original currency’de korunur. User display conversion source amount/currency’yi yeniden yazmaz. Initial Turkish-established seller scope’ta source currency foreign olsa da charge/settlement/payout TRY (DA-FIN-002); Mercur Store single settlement currency ile source currencies karıştırılmaz.

- **Owner / intended owner:** DoğruAdres pricing / FX / publication; commerce Mercur/Medusa.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§3,5–7.
- **Conversation provenance:** PO-MKT.4–5.; G0-S3-Q §5 C-04 Offer/Product Pricing Authority; G0-S3-S §5 explicit source currencies vs mandatoryTRY scope
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.6, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-002; price ownership.
- **ADR / architecture relation:** P05. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** USD ve EUR kaynak Offers aynı Store’da provenance kaybetmez.; EUR100 ve USD Offer aynı Store’da; buyer displayUSD EUR100 source’u değiştirmez (DA-MKT-013); SourceEUR100/USD/CNY Offer sameStore source authority preserved, user displayUSD source mutation yok; scoped charge/payoutTRY
- **Open parameters / decisions:** Kur/fiyat kaynak alanlarının son schema’sı?

<a id="da-mkt-003"></a>

### DA-MKT-003

**Davranış:** Original Offer authoritative source/list amount+currency korunmalı, calculatedTRY prices controlled/versioned publication ile yayımlanmalıdır. Yedi distinct layers: source/list; internal authoritative calculation; versionedTRY publication; optional display conversion; actual checkout/paymentTRY; Store settlement/payoutTRY; historical transaction source/rates/taxes/actual charged amounts. Initial Turkey-scoped source→conversion→publishedTRY→displayEquivalent→acceptedTRY→actual chargedTRY→snapshot business consistency gerekir; incoherent unrelated rate-version mixing önlenmelidir. Exact rate/rounding/markup/expiry mechanism OPEN.

- **Owner / intended owner:** DoğruAdres pricing / FX / publication; commerce Mercur/Medusa.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§6–7,12; yerel T03/04.
- **Conversation provenance:** PO-MKT.6; G0-S3 §3.C.; G0-S3-Q §5 C-04 currency layers; approval sınırları korundu; G0-S3-S §5 seven-layer contract/consistency and existing TRY publication compatibility
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.6, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-MKT-002.; DA-MKT-013; DA-FIN-002. O-21 CLOSED: initial TRY payment/settlement currency için çözümlenmiş tarihsel karar referansıdır; açık karar bağımlılığı değildir.
- **ADR / architecture relation:** P05. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** MKT-003.A sourceEUR100 unchanged, publishedTRY has controlled version and traceable conversion; B displayUSD equivalent and acceptedTRY share coherent validated pricing/rate provenance rather than unrelated chained rate versions; C actualTRY charge equals acceptedTRY and protected snapshot; D changed publication affecting payable amount requires reacceptanceDA-MKT-007; E publication atomicity/locking/stale expected details remainOPEN, no schema/rate chosen.
- **Open parameters / decisions:** Publishing transaction boundaries, Offer/global batch görünürlüğü, stale/outage davranışı ve checkout locking/revalidation OPEN.

<a id="da-mkt-004"></a>

### DA-MKT-004

**Davranış:** TCMB tarihsel gözlem başlangıcı 2005-01-01’dir; önceki gözlemler import edilmez.

- **Owner / intended owner:** DoğruAdres pricing / FX / publication; commerce Mercur/Medusa.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§8–10.
- **Conversation provenance:** PO-MKT.8.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.6, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** FX provenance.
- **ADR / architecture relation:** P05. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** 2004 observation ingestion reddedilir.
- **Open parameters / decisions:** Eksik gün/para birimi politikası; veri contract’ı?

<a id="da-mkt-005"></a>

### DA-MKT-005

**Davranış:** Kur provenance observation/revision/publication zamanlarını, unit dönüşümünü ve kullanılan kaynağı korumalıdır.

- **Owner / intended owner:** DoğruAdres pricing / FX / publication; commerce Mercur/Medusa.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§8–10.
- **Conversation provenance:** PO-MKT.5.; G0-S3-P §4 Other Mixed-Status Records; G0-S3-R F21/F22.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.6, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-MKT-004.
- **ADR / architecture relation:** P05. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** 100 birimlik kotasyon ve revize gözlem karışmaz.
- **Open parameters / decisions:** Weekend fallback, sonradan revision ve holiday semantiği?
- **Alt-kural decision scope:** Source-price/FX provenance ve completed evidence korunması APPROVED/VERIFIED DA-MKT-002/003/008; exact observation/revision/publication field schema ve fallback PROPOSED/OPEN. Unit/quote basis implementation ve metadata schema onaylanmadı.

<a id="da-mkt-006"></a>

### DA-MKT-006

**Davranış:** Seller repricing ve FX kaynaklı fiyat değişimi history’de ayırt edilir. User-selected display conversion authoritative source/list price’ı mutasyona uğratamaz ve seller repricing event üretmez; display-rate provenance ile seller/FX publication history ayrı okunur.

- **Owner / intended owner:** DoğruAdres pricing / FX / publication; commerce Mercur/Medusa.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §14.
- **Conversation provenance:** PO-MKT.9.; G0-S3-Q §5 C-04 Presentation Example; G0-S3-S §5 display/publishedTRY history and consistency
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.6, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-MKT-002,005.
- **ADR / architecture relation:** P05. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Aynı final TRY değişimi doğru neden ve sourceversion taşır.; EUR100/displayUSD preference toggle seller price-change event yaratmaz; actual FX publication revision seller repricing’den ayrı; DisplayUSD120 illustrative not approved live rate; toggling display cannot create seller repricing or rewrite source/pastTRY financial amounts; FX publication version separately traced
- **Open parameters / decisions:** Grafik aralığı ve history retention?

<a id="da-mkt-007"></a>

### DA-MKT-007

**Davranış:** Cart payable-price change payment öncesi kullanıcıya açıklanır ve yeniden kabul ettirilir; checkout race kontrol edilir. Initial Turkish-established seller marketplace’te finalTRY charge açık olmalı ve kabul edilmelidir; nonTRY displayed equivalent actualTRY charge’den user-visible ayrılmalıdır. Source/display currency actual card currency’yi değiştiremez; acceptedTRY != current payableTRY ise eski acceptance ile payment tamamlanmaz.

- **Owner / intended owner:** DoğruAdres pricing / FX / publication; commerce Mercur/Medusa.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §13.
- **Conversation provenance:** PO-MKT.10.; G0-S3-Q §5 C-04 limited currency-boundary clarification; G0-S3-S §5 mandatoryTRY final charge visibility/acceptance and currency consistency
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.6, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Quote/price version.
- **ADR / architecture relation:** P05/P06. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** MKT-007.A EUR100 source/displayUSD120 illustrative fixture shows display equivalent and clearly distinguished finalTRY; buyer acceptedTRY only chargedTRY, noUSD/EUR charge; B updated payableTRY requires notify/reacceptance beforepayment; C concurrentprice/version change cannot charge changed amount under oldacceptance; D display-only toggle no seller repricing/source mutation, payment currency alwaysTRY in scope; exact live rate/quoteTTL/lock algorithm not invented.
- **Open parameters / decisions:** QuoteTTL/revalidation/locking/race mechanism, acceptance revision storage and FX rounding/source/expiry OPEN; initial TRY charge/payout currency closedO-21, amount-change reacceptance approved.

<a id="da-mkt-008"></a>

### DA-MKT-008

**Davranış:** Completed transaction source/list amount+currency, conversion evidence/rate versions, publication and accepted checkoutTRY/actual chargedTRY, taxes and actual financial transaction snapshot korunmalıdır; scoped Store settlement/payoutTRY evidence ayrıca izlenir. Sonraki display preference/currentFX/seller repricing historical source/rate/tax/TRY charged snapshot’ı yeniden yazamaz. Auditable financial correction historical original evidence’ı korur; exact schema/correction mechanics OPEN.

- **Owner / intended owner:** DoğruAdres pricing / FX / publication; commerce Mercur/Medusa.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§13–15.
- **Conversation provenance:** PO-MKT.11.; G0-S3-Q §5 C-04 Historical transaction currency layers; G0-S3-S §5 historical seven-layer price/rates/taxes/actualTRY contract
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.6, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-MKT-006–007.
- **ADR / architecture relation:** P05/P06. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** MKT-008.A EUR100/source→displayUSD illustrative→acceptedTRY→chargedTRY transaction stores traceable original/conversion/publication/tax/actualTRY evidence; B tomorrow displayEUR/currentFX/repricing snapshot unchanged; C accepted/actualTRY mismatch fails financial consistency; D historical payout decision/rate evidence retained subject to protected record/license contract, corrections preserveoriginal and areauditable.
- **Open parameters / decisions:** Snapshot kapsamı, hash/version ve correction?

<a id="da-mkt-009"></a>

### DA-MKT-009

**Davranış:** Store kapsamlı Buyer Organization blocking sunucuda uygulanmalıdır. Store A’nın Organization X’i engellemesi A’dan yeni satın alma kısıtıdır; başka çalışan/actor/cart/API ile aşılamaz. Store B kendi politikasına göre değerlendirilir; A block’u kendiliğinden platform-wide suspension değildir. Organization-attributed checkout bağlamı ayrıca doğrulanır.

- **Owner / intended owner:** DoğruAdres pricing / FX / publication; commerce Mercur/Medusa.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §13.
- **Conversation provenance:** PO-MKT.12.; G0-S3-P §4 Store Commercial Rules; §5 Organization Verification; G0-S3-R F10.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.6, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-002; DA-ORG-007; buyer context.
- **ADR / architecture relation:** P03/P06. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** X’in farklı çalışanı/customer actor’ı A block’unu aşamaz; multi-Store cart’ta B kendi uygunluk policy’siyle değerlendirilir.
- **Open parameters / decisions:** Personal buying, Org seçiminin zorunlu anı; public discovery, iletişim/quotation ve mevcut siparişlere etki, neden/itiraz/effective timing OPEN.

<a id="da-mkt-010"></a>

### DA-MKT-010

**Davranış:** Bu OPEN kayıt yalnız gelecekteki FX/pricing design gate’inde seçilecek conversion parametrelerini izler. TCMB historical source, 2005-01-01 import başlangıcı ve mevcut alış/satış observations’ın unit/date/source/provenance ile arşivi; authoritative source-currency Offer, controlled/versioned TRY publication, initial Turkey-scoped mandatory TRY charge/settlement/payout ve independent user display currency mevcut APPROVED kayıtlarda korunur. Belirli conversion operation için buying/selling series, quote basis/bid-ask, precision/rounding, markup/spread, stale threshold/quote expiry ve exceptional missing-rate fallback seçilmemiştir.

- **Owner / intended owner:** DoğruAdres pricing / FX / publication; commerce Mercur/Medusa.
- **Decision / evidence:** OPEN / UNVERIFIED.
- **Research ve exact section:** [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §11.
- **Conversation provenance:** G0-S4-C §3 latest explicit Product Owner instruction; approved direction korunur, unresolved parameters OPEN/UNVERIFIED kalır; geçmiş approval date/permalink uydurulmaz.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.6, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-MKT-002/003/004/005/006/008/013; DA-FIN-002; O-06.
- **ADR / architecture relation:** P05. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Approved source/archive/TRY/display invariants parameter uncertainty nedeniyle yeniden açılmaz; future approved operation-specific rate policy unit/quote basis, precision/rounding, stale/expiry/missing-rate edge cases ile doğrulanır. Policy onayından önce sayısal expected conversion sonucu icat edilmez.
- **Open parameters / decisions:** Operation-specific buying/selling series, quotation basis/bid-ask spread, decimal precision/rounding mode, conversion markup/spread, stale-rate threshold/quote expiry ve exceptional missing-rate fallback OPEN; future FX/pricing design gate. Hiçbir sayı, kur veya rounding politikası seçilmedi.

<a id="da-mkt-011"></a>

### DA-MKT-011

**Davranış:** Alıcıya uygulanabilir customer segment’leri içindeki en düşük uygun fiyat sunulmalıdır; fiyat uygunluğu server-side doğrulanır. Onaylı lowest-applicable-eligible-price iş hedefi, karşılaştırılabilirlik/eligibility algoritmasının veya teknik adapter’ın seçildiği anlamına gelmez.

- **Owner / intended owner:** DoğruAdres pricing / FX / publication; commerce Mercur/Medusa.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4 (Customer segment pricing / buyer-store block), §10.5; [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §11; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** G0-S3 §6 buyer eligibility kapsam kontrolü; minimum seçimin explicit approval izi eksik.; G0-S3-P §4 Store Commercial Rules; G0-S3-R F11.
- **Primary trace:** G0-S3 ek kayıt; §9.2 coverage/split gerekçesi.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-MKT-009,010; DA-SEC-001.
- **ADR / architecture relation:** P05/P06. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Onaylı comparable-basis fixture’ında eligible 100/90 ve ineligible 80 adaylarından 90 seçilir; ineligible fiyat API/cart üzerinden edinilemez. Tie/quantity/promotions expected sonucu açık policy onayından sonra belirlenir.
- **Open parameters / decisions:** Eligibility/comparison basis, priority/tie, quantity, tax/discount/shipping, FX context, promotion stacking ve teknik seçim OPEN; framework most-specific-price davranışı business minimum garantisi değildir.

<a id="da-mkt-012"></a>

### DA-MKT-012

**Davranış:** Minimum order/basket amount ve free-shipping threshold ayrı Store-owned commercial capabilities’dir; Store-specific commercial exceptions Store policy yetkisindedir. Bunlar buyer’ın personal language/display-currency/browsing-country preferences’ı veya Offer authoritative source/list currency’si değildir.

- **Owner / intended owner:** Store commercial policy / authorized configuration.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0 Step 3-R](research/G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) §4 F12; [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4 customer segment pricing bağlamı (threshold approval kanıtı değil).
- **Conversation provenance:** G0-S3-P §4 Store Commercial Rules; S3-R §3.D historical approval-scope uncertainty retained; G0-S3-P current briefing; original historical approval dates/message permalinks sağlanmadı.; G0-S3-Q §5 C-04 current explicit Store-Owned Commercial Settings decision; eski historical scope uncertainty bu açık kapsam için resolved, eski onay tarihi icat edilmedi; G0-S3-S §5 limited commercial/mandatoryTRY cross-reference; numerical thresholds unchanged
- **Primary trace:** G0-S3-P ek kayıt; §9.5 amendment coverage ve audit ilişkisi.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-MKT-009/011; DA-ORG-002.
- **ADR / architecture relation:** İlgili G0-S2 P topics review bekler; new accepted ADR/module/schema/provider kararı değildir.
- **Acceptance concept:** MKT-012.A authorized Store commercial configuration minimum-basket capability; B independent free-shipping threshold; C StoreA synthetic min100/free500 StoreB policy’yi değiştirmez; D buyer personal display/language/country preference Store commercial setting’i mutasyona uğratmaz; E actual threshold comparison approved basis/checkout destination policy’den, browsing country shipping eligibility kanıtı değil; F exceptions DA-FIN-003/MKT-011 unresolved precedence’i varsaymaz.; G Store commercial thresholds are not personal currency/language preferences; threshold comparison currency/base OPEN, actual charge/payout underDA-FIN-002 mandatoryTRY cannot be changed by Store config
- **Open parameters / decisions:** Actual amounts/currency/configuration rights, VAT/shipping/discount/quantity basis, defaults/ties/stacking/destination/category exceptions ve multiStore cart split OPEN. Current Store-owned capabilities APPROVED; shared physical policy record önerisi acceptance değil.
- **Alt-kural decision scope:** APPROVED current C-04: Store commercial ownership/capabilities. OPEN: numerical/calculation/exception precedence/configuration mechanisms; seller-owned personal preferences yok.

<a id="da-mkt-013"></a>

### DA-MKT-013

**Davranış:** Interface language, display currency, country/delivery-country browsing ve diğer personal storefront presentation preferences kullanıcıya aittir; Store/Product properties değildir. Browsing-country preference actual verified checkout shipping destination veya eligibility yerine geçmez. Source/list price currency ilgili Offer/pricing record otoritesinde kalır; display conversion source price’ı yeniden yazamaz ve seller repricing event üretmez. Display currency checkout/payment veya Store payout/settlement currency’yi sessizce değiştiremez.

- **Owner / intended owner:** Personal user preferences / shared UX; Offer pricing authority ve marketplace finance currency contracts ayrı. Intended ownership physical module/database boundary kararı değildir.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0 Step 3-R](research/G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) §4 F13; [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §3/§7 source vs settlement; [A6](research/A6-development-roadmap-and-release-sequencing.md) §3 localization hedefi.
- **Conversation provenance:** G0-S3-P §4 Store Commercial Rules; S3-R §3.D historical preference scope uncertainty; G0-S3-P current briefing; original historical approval dates/message permalinks sağlanmadı.; G0-S3-Q §5 C-04 current explicit User-Owned Preferences and currency boundaries; historical C-04 uncertainty bu kapsam için superseded; G0-S3-S §5 user ownership/TRY contract and display vs charge distinction
- **Primary trace:** G0-S3-P ek kayıt; §9.5 amendment coverage ve audit ilişkisi.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-UX-001; DA-FIN-002; DA-MKT-003/009.
- **ADR / architecture relation:** İlgili G0-S2 P topics review bekler; new accepted ADR/module/schema/provider kararı değildir.
- **Acceptance concept:** MKT-013.A per-user language/display/browsingcountry preferences do not mutate otheruser/Store config; B sourceEUR100 userdisplayUSD conversion source unchanged, displayUSD120 illustrative only; C no seller repricing event from display toggle; D sameStore mixed source Offers allowed; E browsingcountry not verified shipping destination/eligibility; F seven layers DA-MKT-003 distinct; G scoped finalTRY charge clearly differentiated from nonTRY equivalent, accepted beforepayment; H actual charge/settlement/payoutTRY regardless source/display, historical snapshots unchanged.
- **Open parameters / decisions:** Guest/session/account persistence/sync/defaults, supported country/locale/source/display-currency matrix, displayFX basis/precision/staleness/rounding, country-price/availability and verified shipping destination rules OPEN. Initial Turkey-scoped actual charge/settlement/payoutTRY resolved byG0-S3-S§5; provider/internal calculation/FX mechanisms OPEN, not charging-currency ambiguity.
- **Alt-kural decision scope:** APPROVED: user preferences ownership/source preserved/no display repricing/browsing vs checkout separation; seven layers and scoped mandatoryTRY charge/settlement/payout with visible nonTRY display distinction. OPEN: rate/persistence/provider mechanics; no selected payment provider.

## 7.7. Settlement ve komisyonlar

<a id="da-fin-001"></a>

### DA-FIN-001

**Davranış:** Store bazlı finansal scope, statement, bakiye, uygun kesinleşmiş fonlar ve payout bağımsız kalmalıdır; aynı legal Organization’a ait olmak bunların birleşmesine gerekçe değildir. Bir Store talebi başka Store’un bakiyesini kullanamaz.

- **Owner / intended owner:** Marketplace finance / Mercur adapter; DoğruAdres component policy.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §§4–5; [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §15.
- **Conversation provenance:** PO-MKT.3.; G0-S3-P §4 Payouts; G0-S3-R F02.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.7, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-002.
- **ADR / architecture relation:** P06. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** A/B Store balances ve finalized eligible funds ayrı değerlendirilir; A payout request B fonlarını tüketmez. Consolidated reporting varsa underlying bağımsız statement/payout kapsamını değiştirmez.
- **Open parameters / decisions:** Bank beneficiary ve konsolidasyon raporu?

<a id="da-fin-002"></a>

### DA-FIN-002

**Davranış:** Initial Turkey-scoped marketplace’te Turkish-established seller Organizations için actual checkout/card charge currency TRY, marketplace financial settlement ve independent Store payouts TRY olmak zorundadır. Bu artık yalnız preference değildir; current approved product payment-currency contract’tır, selected provider implementation değildir. Supported foreign Offer source/list currencies ve personal display preference foreign card charge/payout’a dönüşemez. Final TRY charge açık gösterilmeli ve payment öncesi kabul edilmelidir; source price/conversion/versioned TRY publication/display equivalent/accepted TRY/actual charged TRY/snapshot tutarlı olmalıdır. Bu kapsam every Turkish company için universal foreign-currency legal prohibition iddiası değildir; future cross-border seller/payment model separate owner approval ister.

- **Owner / intended owner:** Marketplace finance / Mercur adapter; DoğruAdres component policy.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§7,15.
- **Conversation provenance:** PO-MKT.7; G0-S3 §3.C.; G0-S3-Q §5 C-04 Critical Currency Boundary; new charging interpretation OPEN; G0-S3-S §5 C-04 explicit Turkey-scoped mandatory TRY charge/settlement/payout contract; former O-21 initial interpretation resolved
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.7, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-MKT-003; provider policy.
- **ADR / architecture relation:** P06. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** FIN-002.A Turkish-established seller sourceEUR100/user displayUSD illustrative120: exact amount chosen policy’den, charge accepted TRY notUSD/EUR, seller payoutTRY; B any foreign source/display combination cannot silently change payment/payout currency; C accepted finalTRY amount and actual provider chargeTRY match protected snapshot, changed amount requires DA-MKT-007 reacceptance; D coherent source/conversion/publication/display/checkout/version evidence cannot chain unrelated rate versions; E independent Store balances/payouts remainTRY; F out-of-scope cross-border contract unsupported pending separate approval, no universal legal ban inferred.
- **Open parameters / decisions:** Payment provider/rail/financial settlement operational contract, fees/reserves/refund adjustment/reconciliation, internal calculation model, FX series/bid-ask/markup/quote basis/precision/rounding/expiry/locking OPEN. Initial scoped checkout/card charge/settlement/Store payout currencies resolved TRY; provider deployment and refund workflow details unresolved, not permission to foreign charge.
- **Alt-kural decision scope:** APPROVED/VERIFIED G0-S3-S §5: initial Turkish-established seller scope mandatory TRY charge/settlement/payout and clear finalTRY acceptance; source/display semantics and controlled TRY publication retained. OPEN: FX/provider/operational/refund design; future cross-border requires new approval.

<a id="da-fin-003"></a>

### DA-FIN-003

**Davranış:** Bir işlemde birden çok bağımsız genel marketplace komisyon bileşeni uygulanabilir. Her bileşen ad, yüzde/sabit type, value ve isteğe bağlı minimum/maximum bound taşır. Yüzdeler tanımlanmış ortak brüt matrahta bağımsız hesaplanır; birbirlerinin kesintisi üzerinden sequential compounding yapılmaz. Bileşen tutarları toplanarak toplam oluşturulur ve snapshot’ta ayrı izlenir. Satıcıya bileşen dökümü gösterilir; alıcıya satıcı komisyon dökümünün gösterilmesi zorunlu değildir. Store/product-specific exceptions desteklenmelidir; Mercur tek rule-winner davranışı bu iş sözleşmesini otomatik sağlamaz.

- **Owner / intended owner:** Marketplace finance / Mercur adapter; DoğruAdres component policy.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §15; yerel T05.
- **Conversation provenance:** PO-MKT.12.; G0-S3-P §4 Marketplace Commissions; G0-S3-R F01.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.7, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Rule provider; DA-MKT-008.
- **ADR / architecture relation:** P06. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** FIN-003.A component name/type/value/bounds; B sentetik ortak gross base 1000 ve %10 + %5 için 100 + 50 = 150 (ikinci bileşen 900 üzerinden 45 değildir); C bounds boundary fixtures yalnız onaylı application unit/currency ile; D total=sum ve ayrı snapshots; E seller breakdown, buyer için zorunlu olmayan disclosure; F Store/product exception uygulanır, priority/conflict expected sonucu ayrı onaylı policy’den gelir.
- **Open parameters / decisions:** Gross base tax/VAT/shipping/discount kapsamı; fixed/bounds currency ve uygulama birimi, minimum/maximum kuralları; payee, rounding, exception precedence/ties ve promotion stacking OPEN. Buyer disclosure non-obligation bir görünürlük yasağı değildir.

<a id="da-fin-004"></a>

### DA-FIN-004

**Davranış:** Refund, partial refund ve payout reversal tarihsel mali bağlamla tasarlanmalıdır; yeni FX ile yeniden değerleme varsayılmaz.

- **Owner / intended owner:** Marketplace finance / Mercur adapter; DoğruAdres component policy.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §15; [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §9.
- **Conversation provenance:** PO-MKT.11.; G0-S3-P §4 Other Mixed-Status Records; G0-S3-R F21/F22.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.7, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-FIN-001–003.
- **ADR / architecture relation:** P06. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Refund yeni kurdan geçmiş işlem tutarı üretmez.
- **Open parameters / decisions:** İade oranı, fee geri alma ve rounding artığı?
- **Alt-kural decision scope:** Historical original snapshots preservation APPROVED/VERIFIED inherited DA-MKT-008/DATA-002; refund/reversal posting/provider policy PROPOSED/OPEN. Snapshot protection yeni refund/fraud correction policy seçmez.

<a id="da-fin-005"></a>

### DA-FIN-005

**Davranış:** Önceden earned/vested finansal haklar inactivity/loyalty policy değişimi, departure veya reassignment nedeniyle geriye dönük silinmez. Reassignment effective timestamp T’den itibaren former representative’ın aynı customer için NEW earnings accrual’ı durur; future qualifying events yeni assignment scope’unu izler, eski transactions retroactively transfer edilmez. Earned history korunması future accrual veya current private customer access sağlamaz; pre-transfer refund/dispute adjustments ayrı approved financial rules ister. New representative first-of-month calendar period pre-T earnings transfer/retroactive accrual yaratmaz; qualifying turnover T’de zero’dan başlar (DA-LOY-010).

- **Owner / intended owner:** İlgili representative financial-entitlement domain’i; marketplace finance referansları ayrı. Bu mantıksal sorumluluk final module/database boundary kararı değildir.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A2](research/A2-platform-core-placement-and-integration-topology.md) §7.
- **Conversation provenance:** PO-LOY.9.; G0-S3-P §4 Representative Compensation; G0-S3-R F06.; G0-S3-Q §4 C-02 explicit historical/future attribution boundary; G0-S3-S §4 calendar-period start does not transfer earned rights/turnover; G0-S3-T §4 full target does not alter historical/future attribution boundaries
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.7, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-LOY-004; ledger.
- **ADR / architecture relation:** P06/P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** FIN-005.A T öncesi earned entry departure/reassignment/new activity policy ile silinmez; B E=T veya E>T new qualifying event old rep’e accrual üretmez; C E<T entry new rep’e retroactive award edilmez; D history-only grant live customer access vermez; E pre-transfer refund/dispute adjustment ayrı policy, normal warranty DA-LOY-011.; F May1calendarStart/May20T new attribution cannot includeMay1–preT turnover or old vested entry; old future accrualT cutoff remains; Full first-month target DA-LOY-010 does not transfer former earned rights or grant new representative preT credit; old NEW rights still endT
- **Open parameters / decisions:** Earned/vested/accrued/payable/disputed state ve E event definition, historical limited-read scope/duration, refund/fraud/dispute authorized corrections OPEN; DA-LOY-006/010/011. Reassignment T cutoff business rule artık OPEN değildir.

<a id="da-fin-006"></a>

### DA-FIN-006

**Davranış:** Commerce operational state, commission ledger ve optional accounting farklı truth’lar olarak reconcile edilmelidir.

- **Owner / intended owner:** Marketplace finance / Mercur adapter; DoğruAdres component policy.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A2](research/A2-platform-core-placement-and-integration-topology.md) §§6–8; [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §8.
- **Conversation provenance:** PO-ACC.5; PO-LOY.9.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.7, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Idempotent event+reconciliation.
- **ADR / architecture relation:** P06/P07. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Retry finansal duplicate yaratmaz; projection farkı görünür olur.
- **Open parameters / decisions:** Event contract, retry/outbox ve reconcile sahibi?

<a id="da-fin-007"></a>

### DA-FIN-007

**Davranış:** Platform management payout scheduling’i kontrol eder. Initial default payment day Friday; Ineligible scheduled date için authorized platform management üç adjustment policy seçebilmelidir: A nearest preceding eligible banking business day, B earliest following eligible banking business day (initial DEFAULT), C next eligible occurrence of configured recurring payout schedule. C next business day ile eşdeğer değildir; subsequent scheduled occurrence da ineligible ise eligible scheduled occurrence bulunana kadar sonraki occurrences değerlendirilir. Future non-weekly schedule kavramıyla compatible olmalı; yeni schedule frequency onaylanmaz. A bank/calendar/provider eligibility ve eligible finalized funds availability ister; geçmişte/erken veya unsettled funds payment yetkisi vermez. Operational impossible/past cutoff veya unfinalized funds halinde exact handling OPEN, sessiz erken payout yapılamaz. Statutory half-working days default non-processing’dir; half-day davranışı platform payout settings’te configurable’dır. Google Calendar API Turkish holiday data için selected preferred external source’tur; automatic retrieval/synchronization desteklenmelidir. Google events final banking/provider processing authority değildir. Validated auditable internal calendar policy Google events, official Turkish public holidays, statutory half-days, banking windows, provider cutoff ve platform settings’i ayrı değerlendirmeli; seller’a effective validated payout date gösterilmelidir. Future uninitiated payouts’e etki eden updates tutarlı ve auditable ele alınır. Authorized corrections/exceptions, deterministic eligible-date computation, source/policy versions, safe stale/missing data handling ve historical payout decision preservation gerekir. Eligible finalized funds slider limit’i ve no arbitrary slider postponement korunur; API availability mandatory per-payout runtime dependency sayılmaz.

- **Owner / intended owner:** Marketplace finance / Store payout policy.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A6](research/A6-development-roadmap-and-release-sequencing.md) §§6–9 payout request önerisi; [G0 Step 3-R](research/G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) §4 F03/§7.2.; [G0 Step 3-Q](research/G0-step-3-Q-business-decisions-and-calendar-feasibility-2026-10-10.md) §§3–5 resmî calendar evidence/limitations; [G0 Step 3-S](research/G0-step-3-S-google-calendar-representative-and-try-settlement-2026-10-10.md) §§3–5 Google identifier/API/public-feed/official-calendar evidence and limitations; [G0 Step 3-T](research/G0-step-3-T-payout-deferral-full-month-targets-and-visual-communication-2026-10-10.md) §§3/6 decision semantics and historical reconciliation
- **Conversation provenance:** G0-S3-P §4 Payouts; S3-R §3.B; G0-S3-P current briefing; original historical approval dates/message permalinks sağlanmadı.; G0-S3-Q §3 C-01 current explicit owner decision; önceki Friday/holiday confirmation scope bu karar kapsamında superseded; G0-S3-S §3 C-01 explicit preferred Google source/default Friday/next eligible day/default non-processing half-days/configurability decisions; G0-S3-T §3 current explicit owner approval: A/B/C adjustment choices, B initial default; existing Google/half-day/funds/slider safeguards retained
- **Primary trace:** G0-S3-P ek kayıt; §9.5 amendment coverage ve audit ilişkisi.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-FIN-001/002; DA-SEC-002.
- **ADR / architecture relation:** İlgili G0-S2 P topics review bekler; new accepted ADR/module/schema/provider kararı değildir.
- **Acceptance concept:** FIN-007.A only authorized platform settings control schedule, eligible800/pending200 slider max800 ve no arbitrary postponement; B Friday closed fixture next validated eligible banking day; C statutory half-day default ineligible even if TCMB morning window exists; authorized half-day setting change requires validated bank/provider window/cutoff, cannot authorize processing when bank/provider unavailable; D Google observance alone closure olmaz, Google all-day event alone statutory full-day proof değil; E automatic sync validates source/date/classification/version and future uninitiated date changes retain previous/new date/reason/actor-policy trace with meaningful notification timing governed by policy; F authorized correction/exception+policy version makes identical validated inputs deterministic; G API403/404/429/5xx/incomplete pages/missing horizon/stale data cannot silently become “no holidays”; safe hold/fallback/refresh details OPEN, history never discarded by sync-state reset; H source/policy revision cannot rewrite historical initiated/completed payout decision or silently replay transfers; I initiation/provider acceptance/funds arrival distinct; J seller shown date equals effective validated policy.; K synthetic scheduledFriday2026-10-16 closure, eligibleThursdayOct15/MondayOct19/scheduledFridayOct23: A=Oct15 only if finalized funds and processing/cutoff eligible; B(default)=Oct19; C=Oct23, neverOct19 merely because business day. L C Oct23 also ineligible→Oct30 if eligible scheduled occurrence; M A pending funds or elapsed usable cutoff cannot initiate premature/retroactive payout; exact rejection/hold/fallback OPEN. N configuration change restricted to authorized management, effective policy/date/source/version audit, seller view updated for affected future uninitiated payouts; no initiated/completed record rewrite/replay. O C traverses recurring schedule occurrences abstractly, not hardcoded seven-day advance; future frequency not approved.
- **Open parameters / decisions:** Selected bank/payment provider/rail, eligible/finalized/reserve states, processing/cutoff/timezone/jurisdiction/exception windows, authorized override roles/approval, half-day setting alternatives and precedence, validation authority, refresh/horizon/stale thresholds and safe hold/fallback behavior, licensing/cache/data reuse/fees, credential deployment, page/sync/retry/persistence mechanisms, in-flight corrections and notification timing OPEN. Preferred Google API selection APPROVED; candidate tr.turkish#holiday@group.v.calendar.google.com public ICS HTTP200 verified2026-10-10, events.list without caller identity403; authenticated API availability NOT_VERIFIED, no credentials created/requested.; A unfinalized-funds/past-time/cutoff handling and any fallback between A/B/C require separate policy; no automatic fallback invented. Exact authorized configuration roles/effective policy change semantics and unavailable finite calendar horizon handling OPEN. Three choices/defaultB APPROVED, not proposed.
- **Alt-kural decision scope:** APPROVED/VERIFIED current S: preferred Google Calendar API, automatic holiday sync, Friday initial default/next eligible banking-day default, half-day default non-processing/configurability, validated audited deterministic internal calendar/history/corrections/safe missing data business needs. UNVERIFIED operational API access/coverage; OPEN provider/license/auth deployment/cutoff/override/fallback; adapter/storage/cache/retry technologies not selected.; APPROVED G0-S3-T §3: A previous eligible, B next eligible DEFAULT, C next eligible scheduled occurrence and repeated schedule evaluation, eligibility/finalized funds safeguard. No credential/provider/scheduler selected.

<a id="da-fin-008"></a>

### DA-FIN-008

**Davranış:** Yetkili Store kullanıcısı ilgili payout/payment receipt’i PDF olarak görüntüleyebilmelidir; file access Store/resource authorization’ını korur.

- **Owner / intended owner:** Marketplace finance / authorized receipt access.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0 Step 3-R](research/G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) §4 F04; [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §8 financial privacy.
- **Conversation provenance:** G0-S3-P §4 Payouts; S3-R §3.B; G0-S3-P current briefing; original historical approval dates/message permalinks sağlanmadı.
- **Primary trace:** G0-S3-P ek kayıt; §9.5 amendment coverage ve audit ilişkisi.
- **Delivery horizon / implementation:** H-MARKET / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-FIN-001; DA-SEC-002/006.
- **ADR / architecture relation:** İlgili G0-S2 P topics review bekler; new accepted ADR/module/schema/provider kararı değildir.
- **Acceptance concept:** FIN-008.A own authorized receipt PDF açılır; B otherStore direct PDF URL/export denied; C receipt viewing payout status’u değiştirmez.
- **Open parameters / decisions:** Issuer/provider document source, attachment vs generated PDF, legal receipt semantics, retention/redaction/download rights OPEN; accounting PDF tooling bunun implemented kanıtı değil.

## 7.8. Native Basic Accounting

<a id="da-acc-001"></a>

### DA-ACC-001

**Davranış:** Native DoğruAdres Basic Accounting geliştirme yönü onaylı; Bigcapital zorunlu platform dependency değildir.

- **Owner / intended owner:** DoğruAdres Basic Accounting.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A3](research/A3-bigcapital-basic-accounting-feasibility.md) §§1,6; [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §§13–14.
- **Conversation provenance:** PO-ACC.1,6; G0-S3 §3.H.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.8, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** ADR-0001/3; kapsam kararı.
- **ADR / architecture relation:** P07. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Marketplace Bigcapital olmadan işler.
- **Open parameters / decisions:** Onaylı yönün MVP kapsamı ve finansal test planı?

<a id="da-acc-002"></a>

### DA-ACC-002

**Davranış:** Başlangıç yönü TypeScript, aynı PostgreSQL deployment ve supported Medusa module architecture; final schema değil.

- **Owner / intended owner:** DoğruAdres Basic Accounting.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §§3,7.
- **Conversation provenance:** PO-ACC.2; G0-S3 §3.H.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.8, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Medusa module boundary.
- **ADR / architecture relation:** P07/P01. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Tenant ve transaction isolation önerisi PoC’de kanıtlanır.
- **Open parameters / decisions:** Row/shared schema, RLS, transaction ve migration sınırı?

<a id="da-acc-003"></a>

### DA-ACC-003

**Davranış:** Kapsam Basic Accounting’dir; statutory muhasebe/ERP uyumluluk iddiası veya payroll/stock-costing varsayımı yapılmaz.

- **Owner / intended owner:** DoğruAdres Basic Accounting.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §§5,12.
- **Conversation provenance:** PO-ACC.3,8.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.8, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Functional app brief.
- **ADR / architecture relation:** P07. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** MVP açıklaması e-defter/e-fatura yasal uyum diye sunulmaz.
- **Open parameters / decisions:** Nihai iş akışları, opening balance ve mali müşavir değerlendirmesi?

<a id="da-acc-004"></a>

### DA-ACC-004

**Davranış:** Double-entry balance, idempotency, immutable posted records ve güvenli correction zorunlu tasarım hedefleridir.

- **Owner / intended owner:** DoğruAdres Basic Accounting.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §6.
- **Conversation provenance:** PO-ACC.4; G0-S3 §3.H.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.8, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Atomic posting; decimal amount.
- **ADR / architecture relation:** P07. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Concurrent retry tek balanced posting; posted mutation reddedilir.
- **Open parameters / decisions:** Atomicity, lock, reversal ve correction yetki standardı?

<a id="da-acc-005"></a>

### DA-ACC-005

**Davranış:** Marketplace checkout optional Basic Accounting app’ına bağlı olmaz.

- **Owner / intended owner:** DoğruAdres Basic Accounting.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A2](research/A2-platform-core-placement-and-integration-topology.md) §7; [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §8.
- **Conversation provenance:** PO-ACC.5.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.8, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-FIN-006.
- **ADR / architecture relation:** P07/P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Accounting app disable veya muhasebe consumer arızası checkout’u kesmez; shared PostgreSQL/infrastructure arızasına rağmen availability garantisi ileri sürülmez.
- **Open parameters / decisions:** Projection failure’da backfill/reconcile?

<a id="da-acc-006"></a>

### DA-ACC-006

**Davranış:** Contacts, AR/AP belgeleri, cash/bank, partial allocations, FX ve export MVP adaylarıdır; kesin liste onaylı değildir.

- **Owner / intended owner:** DoğruAdres Basic Accounting.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §§5,9.
- **Conversation provenance:** Yok.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.8, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ACC-003–004.
- **ADR / architecture relation:** P07. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Onaylı coverage matrisi her candidate workflow’ü sınar.
- **Open parameters / decisions:** Invoice/receipt/cash ledger scope ve multi-currency?

<a id="da-acc-007"></a>

### DA-ACC-007

**Davranış:** Ayrıntılı iş mantığından önce yerli ürün/workflow araştırması, anlaşılır alternatifler ve accountant review gerekir.

- **Owner / intended owner:** DoğruAdres Basic Accounting.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §12.
- **Conversation provenance:** PO-ACC.7; G0-S3 §3.H.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.8, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Domain-specific research.
- **ADR / architecture relation:** P07; plan gate. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** İş politikası sahibinin ve accountant’ın inceleme izi bulunur.
- **Open parameters / decisions:** Reviewer, ölçüt ve araştırma kapsamı; bugün seçim yapılmaz.

## 7.9. Loyalty, Kumbara ve temsilcilik

<a id="da-loy-001"></a>

### DA-LOY-001

**Davranış:** Platform Loyalty Management ortak Organization activity/eligibility state’inin sahibidir ve optional Org loyalty app’ından bağımsızdır.

- **Owner / intended owner:** Platform Loyalty Management; ayrı representative/Kumbara domain consumers.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** PO-LOY.1–2,4.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.9, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-001; policy engine.
- **ADR / architecture relation:** P01/P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Org loyalty disable merkezi eligibility hesabını durdurmaz.
- **Open parameters / decisions:** Merkezi service/module sınırı ve policy version?

<a id="da-loy-002"></a>

### DA-LOY-002

**Davranış:** Representative management ve Golden Verified merkezi activity/eligibility belirlemesini tüketmelidir; alternatif inactivity hesabı üretmemelidir. Aynı policy infrastructure farklı business-state sonuçlarını tek boolean’a indirmemelidir.

- **Owner / intended owner:** Platform Loyalty Management; ayrı representative/Kumbara domain consumers.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7.
- **Conversation provenance:** PO-LOY.3; G0-S3 §3.A/B.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.9, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-LOY-001; DA-ID-005.
- **ADR / architecture relation:** P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Aynı version için consumers aynı eligible sonucu kullanır.
- **Open parameters / decisions:** Evaluation trigger ve propagation latency?

<a id="da-loy-003"></a>

### DA-LOY-003

**Davranış:** Organization, 90 ardışık gün qualifying purchase olmaması VEYA 30 ardışık gün Organization workspace’ine qualifying human login olmaması halinde inactive olarak değerlendirilmelidir. Login yerine UI etkileşimi, page view veya background API activity kullanılamaz.

- **Owner / intended owner:** Platform Loyalty Management; ayrı representative/Kumbara domain consumers.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** Bu görev brifingi; [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §10 eşikleri çözmez.
- **Conversation provenance:** PO-LOY.5; G0-S3 §3.A.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.9, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-LOY-001.
- **ADR / architecture relation:** P04; eşikler requirements. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** 90 günlük satın alma ve 30 günlük insan login clock’u ayrı sınır örnekleriyle; tek koşul doğruyken OR sonucu inactive olur.
- **Open parameters / decisions:** Qualifying purchase ve Organization login event’i; clock başlangıcı/reset; onboarding istisnası; restoration/reactivation; evaluation zamanı, timezone ve stale event handling OPEN.

<a id="da-loy-004"></a>

### DA-LOY-004

**Davranış:** Inactive Organization otomatik suspend edilmez, Stores kapanmaz.

- **Owner / intended owner:** Platform Loyalty Management; ayrı representative/Kumbara domain consumers.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7.
- **Conversation provenance:** PO-LOY.6.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.9, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-LOY-001–003.
- **ADR / architecture relation:** P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Inactivity transition Store approval/operational state’i değiştirmez.
- **Open parameters / decisions:** Başka bağımsız suspension nedenleri ve yetkisi?

<a id="da-loy-005"></a>

### DA-LOY-005

**Davranış:** Operational activity/inactivity, active-Organization performance-target eligibility, representative reassignment eligibility ve previously vested commissions/rewards ayrı business states veya decisions olarak korunmalıdır.

- **Owner / intended owner:** Platform Loyalty Management; ayrı representative/Kumbara domain consumers.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A2](research/A2-platform-core-placement-and-integration-topology.md) §7.
- **Conversation provenance:** PO-LOY.7,9; G0-S3 §3.B.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.9, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-LOY-001; DA-FIN-005.
- **ADR / architecture relation:** P04/P06. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Inactivity geçmiş komisyonu veya transfer yetkisini doğrudan değiştirmez.
- **Open parameters / decisions:** Her state transition ve policy effective date?

<a id="da-loy-006"></a>

### DA-LOY-006

**Davranış:** Representative reassignment ayrı permission ve required approval ister. Her transfer açık auditable effective timestamp T taşımalıdır. T anında former representative’ın bu customer’dan NEW earnings entitlement’ı sona erer; qualifying new business yeni assignment earning scope’una geçer, aynı earning event old/new arasında overlap yapamaz ve eski transaction yeni temsilciye retroactively award edilmez. Önceden earned rights/history korunur. Customer eski active portfolio’dan çıkarılıp Kaybedilen Müşteriler — Lost Customers görünümüne historical relationship/reassignment date ile alınmalıdır. Bu görünüm yalnız appropriately authorized historical earned commissions’a erişim verir; current private operations/contacts/financial records/future purchases yetkisini devam ettirmez. Repeated transfers duplicate/incorrect classification üretmemeli; reacquisition current portfolio classification’ını güncellerken assignment history’yi korumalıdır. New representative qualifying turnover T’de ZERO’dur. DA-LOY-010 twelve-calendar-month start ayın first day’i olsa da assignment actualT’de effective olur; pre-T purchases new turnover/earnings’e sayılmaz.

- **Owner / intended owner:** Platform Loyalty Management; ayrı representative/Kumbara domain consumers.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A2](research/A2-platform-core-placement-and-integration-topology.md) §7.
- **Conversation provenance:** PO-LOY.7 yalnız ayrımı onaylar.; G0-S3-P §4 Representative Compensation; G0-S3-R F08.; G0-S3-Q §4 C-02 explicit transfer cutoff ve Lost Customers kararı; original message permalink yok; G0-S3-S §4 effectiveT vs calendar period/zero turnover distinction; G0-S3-T §4 narrow target/actualT cross-reference; historical permissions unchanged
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.9, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-LOY-005; authorization.; DA-FIN-005; DA-LOY-010/011; DA-SEC-001/002/007
- **ADR / architecture relation:** P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** LOY-006.A history-read permission transfer yetkisi vermez, permission olsa bile required approval yoksa transfer denied; B onaylı earning-event timestamp E<T ise old assignment history, E=T ve E>T qualifying new events yalnız new assignment scope; financial event E tanımı OPEN, order-created varsayılmaz; C old earned transaction new rep’e retroactively taşınmaz; D transfer sonrası old active list’te customer yok, Lost Customers’da relationship/date var, authorized earned commission history korunur; E history grant current contacts/private finance/future purchases API/search/export/file access açmaz; F A→B→C repeated/idempotent transfers old lost lists’te duplicate active identity yaratmaz; A’ya reacquisition current active classification’ı geri getirir, chronological transfer history silinmez; G pre-transfer refund/dispute correction resolved ayrı rules’a tabi, normal warranty alone confiscation yok.; H May20T fixture calendar startsMay1 but customer assignment/turnover startsMay20T; May1–beforeT purchases new target’a sayılmaz, first calendar monthMay31 completes. FULL first partial-month target with NO day proration (G0-S3-T); First partial month full-target/no day-proration DA-LOY-010; actualT still attribution boundary, calendarstart cannot create preT turnover
- **Open parameters / decisions:** Talep eden/kabul eden/onaylayan taraflar, Organization/platform approval dağılımı, eligibility evidence, SLA/dispute, E earning-event’in financial/business tanımı, timezone/ordering/backdated transfer policy, historical read permissions/fields/duration ve view pagination/filtering OPEN. T’nin açık auditable olması ve old future accrual cutoff’u APPROVED; effective timestamp zorunluluğu OPEN değildir. İzlenebilir case workflow’nun physical mekanizması PROPOSED/OPEN.
- **Alt-kural decision scope:** APPROVED: independent permission+approval, auditable T, old NEW accrual cutoff/no overlap/no retroactive award, preserved earned history, Lost Customers classification and bounded history visibility. OPEN: event earning definition, approvers and technical case/ordering/access mechanisms.; APPROVED currentS: actualT zero new turnover/no retroactive target; calendar period distinct DA-LOY-010

<a id="da-loy-007"></a>

### DA-LOY-007

**Davranış:** Kumbara/promotional credit ile parasal komisyon ve financial entitlement ayrı ekonomik anlamlar olarak değerlendirilmelidir; promotional credit otomatik payable commission toplamına eklenmez.

- **Owner / intended owner:** Platform Loyalty Management; ayrı representative/Kumbara domain consumers.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A2](research/A2-platform-core-placement-and-integration-topology.md) §§7–8.
- **Conversation provenance:** PO-LOY.7,9 kapsam ayrımı.; G0-S3-P §4 Representative Compensation; G0-S3-R F09.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.9, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-FIN-005.
- **ADR / architecture relation:** P04/P06. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Promo credit gerçek payable komisyon diye raporlanmaz.
- **Open parameters / decisions:** Funding/redemption/expiry/tax/retention, nakde dönüşebilirlik ve ledger uygulaması OPEN/PROPOSED. Discount/Kumbara-funded purchase’ın representative-base formülü DA-LOY-010 kapsamında OPEN; genel marketplace gross base’e veya Golden period’a aktarılmaz.

<a id="da-loy-008"></a>

### DA-LOY-008

**Davranış:** Golden Verified’ın ayrı qualifying Organization performance target gerekliliği, personal identity verification/protected Owner koşulları ve central Platform Loyalty Management evaluator APPROVED’dır (DA-ID-005, DA-ORG-008, DA-LOY-001/005/009). Bu kayıt yalnız hedef tutarını, evaluation period’u, qualifying purchasing turnover tanımını, VAT/shipping/discount/refund/other adjustment treatment ve qualification/requalification timing/exceptions’ı OPEN tutar. Representative target/12-month period veya 90-day purchase OR 30-day qualifying human Organization-login inactivity clock Golden calculation’a taşınamaz. Inactivity automatic suspension değildir; earned rights korunur.

- **Owner / intended owner:** Platform Loyalty Management; ayrı representative/Kumbara domain consumers.
- **Decision / evidence:** OPEN / UNVERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §§7,10; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** PO-BAD.5; PO-LOY.7; G0-S4-C §4 explicit owner reconciliation: approved eligibility invariants, separate unresolved Golden financial parameters.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.9, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-LOY-001/003/005/009; DA-ID-005; DA-ORG-008; O-10.
- **ADR / architecture relation:** P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Operational-active/performance-ineligible Organization Golden kazanamaz; evaluator separate owner-approved target/period/turnover policy kullanır. Representative periods/targets ve inactivity clocks substitute edilemez; financial adjustment expected values ancak Loyalty policy onayından sonra belirlenir.
- **Open parameters / decisions:** Golden target amount/evaluation period/qualifying purchasing turnover, VAT/shipping/discounts/refunds/other adjustments, qualification/requalification timing ve exceptions OPEN; future Loyalty functional-policy design. Vested geçmişin geriye dönük forfeiture’ı bu kayıttan yetkilendirilmez.

<a id="da-loy-009"></a>

### DA-LOY-009

**Davranış:** Golden Verified için Organization’ın merkezi active-Organization performance-target criterion’ını sağlaması gerekir; operational inactivity’den kaçınması tek başına yeterli değildir.

- **Owner / intended owner:** Platform Loyalty Management; ayrı representative/Kumbara domain consumers.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §§7,10; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** G0-S3 §3.B/G.
- **Primary trace:** G0-S3 ek kayıt; §9.2 coverage/split gerekçesi.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-LOY-001,005,008; DA-ID-005.
- **ADR / architecture relation:** P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Operational active fakat performance-ineligible Organization Golden koşulunu sağlamaz; reassignment ve vested haklar ayrı değerlendirilir.
- **Open parameters / decisions:** Hedef tutar, qualification period, purchase definitions ve zamanlama OPEN; DA-LOY-008 parametre kaydıdır.

<a id="da-loy-010"></a>

### DA-LOY-010

**Davranış:** Representative net qualifying product-amount basis general marketplace gross commission’dan ayrıdır; VAT/shipping excluded. APPROVED twelve-calendar-month entitlement period, actual authorized assignment/reassignment T’nin içinde bulunduğu ayın first calendar day’inde başlar ve twelfth calendar month’un last day’inde biter. Qualifying sales/turnover yeni representative için T’de ZERO’dan başlar; calendar_period_start != qualifying_turnover_start mid-month assignment’ta zorunludur. Calendar start retroactive earnings/turnover yetkisi vermez: T öncesi purchases/new rep target’a sayılmaz, only qualifying attributed business E>=T scope’a girebilir; E earning event definition OPEN. First partial month’un son günü first month completion’dır. T old future accrual’ı immediate keser, earned commissions transfer edilmez; new rep old remaining duration’ı inherit etmez, kendi approved calendar period’u vardır. Golden performance period ve90/30 Organization inactivity clocks ayrı. First partial calendar month uses FULL approved monthly turnover target; day-based proration açıkça YASAKTIR: hedef tenure days/month days gibi factor ile azaltılmaz. May20T→May31 first month için entire monthly target applies, only postT qualifying turnover counts. Twelve-month end remainsApr30nextyear unless separately approved earlier termination event (ör. subsequent transfer) applies. Actual target amount OPEN; Golden/inactivity/general commission targets ile karıştırılmaz.

- **Owner / intended owner:** Representative financial-entitlement domain; Platform Loyalty shared eligibility consumer.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §8 net-product spend historical ifade; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §5/§12 senaryo10 historical read (earnings period kanıtı değil); [G0 Step 3-R](research/G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) §4 F05.; [G0 Step 3-T](research/G0-step-3-T-payout-deferral-full-month-targets-and-visual-communication-2026-10-10.md) §4 current decision vs former open parameter
- **Conversation provenance:** G0-S3-P §4 Representative Compensation; S3-R §3.C; G0-S3-P current briefing; original historical approval dates/message permalinks sağlanmadı.; G0-S3-Q §4 Twelve-Month Period: discussed12months retained; explicit transfer cutoff approved, new period details require confirmation; G0-S3-S §4 C-02 explicit twelve-calendar-month first-day start/last-day end, ZERO-at-transfer turnover and no retroactive earnings; prior proposal/start uncertainty superseded; G0-S3-T §4 explicit full first partial-month target/no day proration; illustrativeTRY100000 not actual target approval
- **Primary trace:** G0-S3-P ek kayıt; §9.5 amendment coverage ve audit ilişkisi.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-FIN-003/005; DA-LOY-005/007/008/009.
- **ADR / architecture relation:** İlgili G0-S2 P topics review bekler; new accepted ADR/module/schema/provider kararı değildir.
- **Acceptance concept:** LOY-010.A netProduct1000/VAT200/shipping100 base excludes VAT/shipping, discount/Kumbara expected base resolved formula’dan; B T=2026-05-20 authorized timestamp: calendar start2026-05-01, first month ends2026-05-31, final monthApr2027/end2027-04-30 (next month2027-05-01 exclusive upper date), turnover ZERO atT; C purchasesMay1 throughE<T new turnover/earnings’e dahil değil; qualifying E=T/E>T yalnız new assignment scope under approved earnings eligibility, pre-T earned old rights new rep’e taşınmaz; D May31 first month completion despite partial tenure; hypothetical monthly targetTRY100000 remainsTRY100000 forMay20–31, not100000×12/31 or another day factor; illustrative amount not approved actual target; E subsequent reassignment cuts old future accrual immediately, new assignment own first-of-month12-month period and ZERO at actualT; F first-day/end-month/leap-year/December-year-rollover cases count12 calendar months, no rolling365day rule; G expired-period eligibility and financial event E exact mechanism policy’den, Golden period/90-30 clocks copied değil; H source corrections/history do not retroactively award pre-transfer transactions. I first-day/last-day assignment uses same FULL monthly target rule, turnover stillZERO atactualT; no preT credit and no overlap/vested transfer. J period endApr30 remains except separately approved earlier termination, no invented termination event.
- **Open parameters / decisions:** Actual monthly target amount, exact E order/payment/delivery/earned-finalization event, qualification/rates/bonus thresholds, discounts/Kumbara treatment, accrual/vesting/payable/refund/fraud/dispute adjustments, governing timezone/timestamp ordering, exceptional backdated assignments/correction/other exceptional reset procedures OPEN. Ordinary assignment/reassignment first-of-effective-month12-calendar-month period and ZERO-atT turnover APPROVED, no longer historical proposal/start confirmation. Full first-month target/no day proration resolved byG0-S3-T§4; not OPEN.
- **Alt-kural decision scope:** APPROVED/VERIFIED: net product base VAT/shipping excluded; twelve-calendar-month first-of-effective-month start/last-day-of12th-month end; actualT ZERO new qualifying turnover/no pre-T accrual; old future accrual cutoff/earned preservation/no remainder inheritance. APPROVED G0-S3-T: full first partial-month target/no day-based proration. OPEN: actual target amount, exact earning event/rates/formula/adjustments/exceptions; Golden and inactivity policies separate.

<a id="da-loy-011"></a>

### DA-LOY-011

**Davranış:** Normal warranty, refund, abuse ve dispute ayrı events olarak değerlendirilmelidir. Normal warranty event tek başına vested earnings’in otomatik confiscation nedeni olamaz; diğer olayların adjustment/hold policy’si ayrıca yetkili review ister.

- **Owner / intended owner:** Representative financial-entitlement policy; authorized corrections.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0 Step 3-R](research/G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) §4 F07; [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §15 historical refund; [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §6 correction ayrımı.
- **Conversation provenance:** G0-S3-P §4 Representative Compensation; S3-R §3.C; G0-S3-P current briefing; original historical approval dates/message permalinks sağlanmadı.
- **Primary trace:** G0-S3-P ek kayıt; §9.5 amendment coverage ve audit ilişkisi.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-FIN-004/005; DA-LOY-005/010; DA-DATA-002.
- **ADR / architecture relation:** İlgili G0-S2 P topics review bekler; new accepted ADR/module/schema/provider kararı değildir.
- **Acceptance concept:** LOY-011.A normal warranty mevcut vested record’ı otomatik silmez; B warranty refund’a dönüşürse ayrı authorized refund policy gerekir; C allegation/abuse/dispute adjudicated result diye karıştırılmaz; D history-preserving correction only.
- **Open parameters / decisions:** Warranty classification, fraud/refund adjustments, dispute holds/evidence/appeal, accrual/vesting/correction authority/timing OPEN; every-refund-no-effect absolute policy seçilmedi.

## 7.10. Meydan ve Product Reviews

<a id="da-soc-001"></a>

### DA-SOC-001

**Davranış:** Meydan established working product name ile platform-wide kişisel uygulama olmalıdır; Organization’a ait değildir.

- **Owner / intended owner:** DoğruAdres kişisel Meydan / content moderation; review integration.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A6](research/A6-development-roadmap-and-release-sequencing.md) §4; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** PO-MEY.1; G0-S3 §3.I.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.10, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-002.
- **ADR / architecture relation:** P01/P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Org app disable kişisel Meydan sahipliğini değiştirmez.
- **Open parameters / decisions:** Working name Meydan; canonical content ownership ve publication lifecycle ayrıntıları OPEN.

<a id="da-soc-002"></a>

### DA-SOC-002

**Davranış:** E-posta doğrulanmış fakat kişisel kimliği doğrulanmamış kullanıcı Meydan posts ve product reviews okuyabilir; author names maskelenmeli ve author-profile navigation reddedilmelidir.

- **Owner / intended owner:** DoğruAdres kişisel Meydan / content moderation; review integration.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A7](research/A7-ai-byok-and-future-oem-architecture.md) §9.
- **Conversation provenance:** PO-MEY.2–3; G0-S3 §3.F.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.10, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-003; DA-SEC-006.
- **ADR / architecture relation:** P03/P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** API/search/export/preview author kimliğini sızdırmaz.
- **Open parameters / decisions:** Masking biçimi ve dolaylı tanımlayıcılar OPEN; read erişimi posting/participation yetkisi vermez.

<a id="da-soc-003"></a>

### DA-SOC-003

**Davranış:** Normal posting, commenting, liking, following ve participation kişisel kimlik doğrulaması gerektirir. Doğrulanmış kişilerde de ilgili resource ve Organization permissions ayrıca uygulanmalıdır.

- **Owner / intended owner:** DoğruAdres kişisel Meydan / content moderation; review integration.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A6](research/A6-development-roadmap-and-release-sequencing.md) §4.
- **Conversation provenance:** PO-MEY.4; G0-S3 §3.F.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.10, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-003.
- **ADR / architecture relation:** P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Sadece emailverified actor tüm write endpoints’te reddedilir.
- **Open parameters / decisions:** Verification revoke sonrası içerik ve follower state?

<a id="da-soc-004"></a>

### DA-SOC-004

**Davranış:** Product Review isteğe bağlı Meydan cross-post olabilir; moderation, visibility, source link ve lifecycle tutarlıdır.

- **Owner / intended owner:** DoğruAdres kişisel Meydan / content moderation; review integration.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** PO-MEY.5–6.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.10, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Review owner; DA-DATA-001.
- **ADR / architecture relation:** P04; content lifecycle ADR gerekirse. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Review edit/delete/moderation iki görünümde policy’ye uygun yansır.
- **Open parameters / decisions:** Canonical content sahibi, cascade vs tombstone ve source inaccessible?

<a id="da-soc-005"></a>

### DA-SOC-005

**Davranış:** Media uploads ve uygun moderation planlıdır; policy ve file ownership daha sonra onaylanır.

- **Owner / intended owner:** DoğruAdres kişisel Meydan / content moderation; review integration.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §8.
- **Conversation provenance:** PO-MEY.7.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.10, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-006.
- **ADR / architecture relation:** P03; content ADR koşullu. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Yetkisiz media okuma/yazma ve kaldırılmış içerik sızıntısı yok.
- **Open parameters / decisions:** Tür/boyut, moderation appeal, illegal content ve retention?

<a id="da-soc-006"></a>

### DA-SOC-006

**Davranış:** Meydan için 500 karakter configurable proposed default olarak değerlendirilmelidir; immutable accepted limit değildir. Working name DA-SOC-001’de Meydan olarak korunur.

- **Owner / intended owner:** DoğruAdres kişisel Meydan / content moderation; review integration.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** Brifing; [A6](research/A6-development-roadmap-and-release-sequencing.md) §13 açık ürün kararları.
- **Conversation provenance:** PO-MEY.8; G0-S3 §3.I.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.10, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Functional brief.
- **ADR / architecture relation:** ADR gerekmez. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Unicode grapheme/byte ve limit örnekleri seçilen policy’ye göre sınanır.
- **Open parameters / decisions:** 500 default’un kabulü, Unicode grapheme/byte sayımı ve konfigurasyon yetkisi OPEN.

## 7.11. Job Board ve HR

<a id="da-job-001"></a>

### DA-JOB-001

**Davranış:** E-posta doğrulanmış kullanıcı job listing index ve permitted preview fields üzerinde browse/search yapabilir; preview tam içerik erişimine dönüşmemelidir.

- **Owner / intended owner:** DoğruAdres Job Board; optional HR ayrı intended owner.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A6](research/A6-development-roadmap-and-release-sequencing.md) §4; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** PO-JOB.1; G0-S3 §3.F.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.11, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ID-003.
- **ADR / architecture relation:** P03/P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Emailverified index okur; unverified access onaylı kurala göre reddedilir.
- **Open parameters / decisions:** Index’te izinli alanlar ve arama snippet?

<a id="da-job-002"></a>

### DA-JOB-002

**Davranış:** Full job details/content ve applications kişisel kimlik doğrulaması gerektirir; email-only kullanıcıya reddedilmelidir. Kişisel doğrulama sonrası resource ve Organization permissions ayrıca uygulanmalıdır.

- **Owner / intended owner:** DoğruAdres Job Board; optional HR ayrı intended owner.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4; [A7](research/A7-ai-byok-and-future-oem-architecture.md) §9 genel kişisel erişim notu.
- **Conversation provenance:** PO-JOB.2; G0-S3 §3.F.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.11, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-JOB-001; DA-SEC-006.
- **ADR / architecture relation:** P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Index API tam açıklama veya application attachment sızdırmaz.
- **Open parameters / decisions:** Başvuru visibility/retention ve revoke etkisi?

<a id="da-job-003"></a>

### DA-JOB-003

**Davranış:** Yetkili Org kullanıcısı ilan yönetir; optional full HR enabling zorunlu değildir.

- **Owner / intended owner:** DoğruAdres Job Board; optional HR ayrı intended owner.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A6](research/A6-development-roadmap-and-release-sequencing.md) §§4–5; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** PO-JOB.3–4; G0-S3 §3.F.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.11, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-001; DA-SEC-001.
- **ADR / architecture relation:** P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** HR kapalıyken yetkili ilan CRUD çalışır; rol dışı actor reddedilir.
- **Open parameters / decisions:** İlan onay/moderation ve organization eligibility?

<a id="da-job-004"></a>

### DA-JOB-004

**Davranış:** HR personnel, payroll ve çalışan özel verileri Job Board’ın public ilan alanından ayrılır.

- **Owner / intended owner:** DoğruAdres Job Board; optional HR ayrı intended owner.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4; [A6](research/A6-development-roadmap-and-release-sequencing.md) §5.
- **Conversation provenance:** PO-JOB.4 bağımsızlık.; G0-S3-P §4 Other Mixed-Status Records; G0-S3-R F21/F22.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.11, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-006; DA-DATA-001.
- **ADR / architecture relation:** P01/P04. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Applicant veya public job reader employee record göremez.
- **Open parameters / decisions:** HR MVP, hukuki veri türleri ve saklama?
- **Alt-kural decision scope:** Private personnel information isolation APPROVED/VERIFIED DA-SEC-002/006/008; optional HR/payroll product/data-boundary design PROPOSED/OPEN. Job management DA-JOB-003 gereği HR activation’dan bağımsız.

## 7.12. Vehicle Management, Quotations ve OEM

<a id="da-auto-001"></a>

### DA-AUTO-001

**Davranış:** Vehicle Management DoğruAdres domain’idir ve AI/OEM olmadan işler. Every Vehicle belongs to exactly one Organization; the vehicle scope and uniqueness rules are recorded in DA-AUTO-006.

- **Owner / intended owner:** DoğruAdres automotive / Vehicle / Quotations; provider adapter.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [ADR-0002](adr/ADR-0002-automotive-domain-isolation.md); [A7](research/A7-ai-byok-and-future-oem-architecture.md) §10.
- **Conversation provenance:** PO-AI.5.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.12, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Manual vehicle model.
- **ADR / architecture relation:** ADR-0002; P01. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** OEM outage manuel vehicle kaydını engellemez.
- **Current approved clause:** Vehicle ownership is Organization-level, not person-level; new active members access Organization vehicles according to current permissions, and revocation removes subsequent access. See DA-AUTO-006.
- **Open parameters / decisions:** Vehicle-specific field requirements beyond the approved plate/VIN uniqueness rules, and quotation/link lifecycle details remain subject to their own requirements.

<a id="da-auto-002"></a>

### DA-AUTO-002

**Davranış:** Quotations private Org iş akışıdır; Product/Inventory/Vehicle bağlantıları permission-aware olmalıdır.

- **Owner / intended owner:** DoğruAdres automotive / Vehicle / Quotations; provider adapter.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4; [A7](research/A7-ai-byok-and-future-oem-architecture.md) §7.
- **Conversation provenance:** PO-AI.5.; G0-S3-P §4 Other Mixed-Status Records; G0-S3-R F21/F22.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.12, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-CAT-005; DA-SEC-002.
- **ADR / architecture relation:** P01; ADR-0002. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Quotation başka Org stok/maliyet/vehicle’ı bağlayamaz.
- **Open parameters / decisions:** Version, onay, expiry ve marketplace conversion?
- **Alt-kural decision scope:** Authorized resource/Organization scope APPROVED/VERIFIED DA-SEC-002 ve manual Quotations independence DA-CAT-005; precise quotation ownership/version/approval/conversion mechanism PROPOSED/OPEN. Platform multi-application scope automotive quotation’un marketplace prerequisite’i olduğunu göstermez.

<a id="da-auto-003"></a>

### DA-AUTO-003

**Davranış:** Future provider-neutral VIN/OEM lookup product direction korunmalıdır; provider results provenance/uncertainty ile izlenir. OEM reference lookup otomatik vehicle fitment verification değildir; mevcut marketplace için immediate automatic fitment matching veya guaranteed compatibility zorunluluğu doğurmaz.

- **Owner / intended owner:** DoğruAdres automotive / Vehicle / Quotations; provider adapter.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A7](research/A7-ai-byok-and-future-oem-architecture.md) §§10,12.
- **Conversation provenance:** PO-AI.6.; G0-S3-P §5 OEM and Fitment; G0-S3-R F21/F22; additional reconciliation.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.12, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FUTURE / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-AUTO-001; adapter boundary.
- **ADR / architecture relation:** ADR-0002; P09 koşullu. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Fake provider değişince manual workflow/canonical model bozulmaz; ambiguous reference lookup confirmed/guaranteed fitment olarak gösterilmez; no provider outage manual vehicle/product/quotation’u engellemez.
- **Open parameters / decisions:** Provider contract/license, lookup confidence/ambiguous results, supplier matching/fitment criteria, legal responsibility ve canonical merge authority OPEN; LexCom yalnız prospective DA-AUTO-004.

<a id="da-auto-004"></a>

### DA-AUTO-004

**Davranış:** Actual OEM/VIN provider selection ve licensing, gelecekte ayrı onaylanacak OEM integration initiative’e açıkça DEFERRED’dır. LexCom yalnız prospective partner’dir; available project evidence içinde hiçbir agreement doğrulanmamıştır. Bu dış dünyada agreement olmadığına ilişkin categorical claim değildir. Provider-neutral future lookup direction ve manual vehicle/product/inventory/quotation independence DA-AUTO-003/DA-CAT-005 kapsamında korunur; LexCom bağımlılığı veya connector yetkisi doğmaz.

- **Owner / intended owner:** DoğruAdres automotive / Vehicle / Quotations; provider adapter.
- **Decision / evidence:** DEFERRED / VERIFIED.
- **Research ve exact section:** [A7](research/A7-ai-byok-and-future-oem-architecture.md) §§10,15.
- **Conversation provenance:** PO-AI.7–8; G0-S4-C §5 latest explicit Product Owner deferral. VERIFIED yalnız provider selection’ı erteleme kararının kanıtıdır; external agreement/access-right status verified değildir.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.12, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FUTURE / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Future separately authorized OEM integration decision gate; DA-AUTO-003/005; DA-CAT-005.
- **ADR / architecture relation:** P09 yalnız anlaşma öncesi. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Manual functions LexCom olmadan çalışabilmelidir; supplier seçilmiş/licensed diye etiketlenmez. Future connector gate explicit owner approval ve verified access/reuse terms ister; fake fixture gerçek licensed data diye gösterilmez.
- **Open parameters / decisions:** Deferred OEM gate: provider/commercial contracts, access/redistribution licenses, caching/retention/attribution, result confidence/permitted reuse, data-processing/IP restrictions ve fitment validation responsibility. Ayrı future initiative yetkisi olmadan provider seçilmez; D-03.

<a id="da-auto-005"></a>

### DA-AUTO-005

**Davranış:** Önerilen OE/OEM reference, cross-reference/equivalence ve vehicle fitment modelinde anlamlar ayrı izlenmelidir. Approved lookup direction (DA-AUTO-003) guaranteed compatibility veya automatic fitment matching yükümlülüğü değildir; aynı part number/AI/provider önerisi tek başına confirmed compatibility/canonical merge kanıtı sayılmaz.

- **Owner / intended owner:** DoğruAdres automotive / Vehicle / Quotations; provider adapter.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [ADR-0002](adr/ADR-0002-automotive-domain-isolation.md) Decision; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §11; [A7](research/A7-ai-byok-and-future-oem-architecture.md) §10.
- **Conversation provenance:** G0-S3 §6 OEM fitment kapsam kontrolü; ayrıntılı matching approval yok.; G0-S3-P §5 OEM and Fitment; G0-S3-R F22; additional reconciliation.
- **Primary trace:** G0-S3 ek kayıt; §9.2 coverage/split gerekçesi.
- **Delivery horizon / implementation:** H-FUTURE / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-AUTO-001,003,004; DA-CAT-002.
- **ADR / architecture relation:** ADR-0002; P09 koşullu. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Ambiguous provider result confirmed fitment veya automatic product merge üretmez; manual workflow bağımsız sürer.
- **Open parameters / decisions:** Exact matching/confidence standardı, supplier responsibility/legal contract, namespace/revision/vehicle configuration ve merge authority OPEN ve yeni owner approval ister; immediate automatic fitment seçilmedi.
- **Alt-kural decision scope:** APPROVED/VERIFIED: G0-S3-P §5 lookup direction’ın otomatik guaranteed fitment olmadığı sınırı. PROPOSED/RECOMMENDED: detailed equivalence/fitment/matching model.

<a id="da-auto-006"></a>

### DA-AUTO-006

**Davranış:** Each Vehicle belongs to exactly one Organization and never to its creating Person. Plate and VIN/chassis-number uniqueness are independently scoped to an Organization. Supplied non-empty values use normalized uniqueness keys and database-enforced constraints as well as application validation; the display values may be retained. The same normalized plate or VIN may exist in different Organizations, but duplicates within one Organization are rejected under concurrent writes too. Members may view/create/update Organization vehicles; delete is Owner/Admin only. Actor attribution for create/change is recorded only in the shared audit trail, never as creator ownership fields on Vehicle or metadata. Membership revocation removes subsequent vehicle access and does not delete or hide historical Organization vehicles.

- **Owner / intended owner:** DoğruAdres automotive / Vehicle; Organization authorization and shared audit trail.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** Current Product Owner instruction §§3 and 6–7 in this task.
- **Conversation provenance:** Current explicit Product Owner decision in this task; no separate approval timestamp or message permalink was provided.
- **Primary trace:** New stable ID DA-AUTO-006; no existing ID renumbered or reused.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; Vehicle implementation is a later separately reviewed checkpoint.
- **Dependencies:** DA-ORG-001; DA-SEC-001–003; DA-SEC-007.
- **ADR / architecture relation:** ADR-0002; no ADR changes or new architecture decision.
- **Acceptance concept:** Two Organizations may reuse the same plate/VIN; duplicate normalized supplied values inside one Organization fail at both validation and database constraint. Cross-Organization reads/writes fail after membership revocation; creator departure preserves the Organization vehicle. No `created_by*` ownership field exists.
- **Open parameters / decisions:** Exact locale-specific normalization details and requiredness of plate/VIN remain open. Uniqueness applies to each supplied non-empty value; no new VIN syntax, length or ownership validation is implied. Vehicle module implementation remains deferred to the next checkpoint.

## 7.13. AI/BYOK ve gelecek entegrasyonlar

<a id="da-ai-001"></a>

### DA-AI-001

**Davranış:** Organization kendi provider bağlantısını ve API key’ini kullanabilmeli; sağlayıcı tercihi geleceğe bırakılır.

- **Owner / intended owner:** DoğruAdres AI application / integration; ilgili domain kendi verisinin sahibi.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A7](research/A7-ai-byok-and-future-oem-architecture.md) §§2,5,12.
- **Conversation provenance:** PO-AI.1.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.13, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FUTURE / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ORG-001; secret management.
- **ADR / architecture relation:** P08. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Org A key’i Org B isteğinde kullanılmaz; key dışa açılmaz.
- **Open parameters / decisions:** Provider terms, budget ve rotation policy?

<a id="da-ai-002"></a>

### DA-AI-002

**Davranış:** AI tool yetkisi güncel Organization/user/app/resource izinleriyle sınırlıdır.

- **Owner / intended owner:** DoğruAdres AI application / integration; ilgili domain kendi verisinin sahibi.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §10; [A7](research/A7-ai-byok-and-future-oem-architecture.md) §§6–7.
- **Conversation provenance:** PO-AI.2.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.13, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FUTURE / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-001,005.
- **ADR / architecture relation:** P08/P03. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Membership revoke, tool execute anında erişimi düşürür.
- **Open parameters / decisions:** Delegate principal ve consent kapsamı?

<a id="da-ai-003"></a>

### DA-AI-003

**Davranış:** High-impact AI action uygun scope’lu onay ister; tool proposal approval ile execution arasında tekrar kontrol edilir.

- **Owner / intended owner:** DoğruAdres AI application / integration; ilgili domain kendi verisinin sahibi.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A7](research/A7-ai-byok-and-future-oem-architecture.md) §8.
- **Conversation provenance:** PO-AI.3.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.13, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FUTURE / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-AI-002; optimistic version.
- **ADR / architecture relation:** P08. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Eski/onayı değiştirilmiş/replayed tool arguments çalışmaz.
- **Open parameters / decisions:** High impact listesi, threshold, MFA, expiry ve approver?

<a id="da-ai-004"></a>

### DA-AI-004

**Davranış:** İlk tercih mevcut backend’de küçük provider-neutral application layer’dır; framework/MCP seçimi onaylı değildir.

- **Owner / intended owner:** DoğruAdres AI application / integration; ilgili domain kendi verisinin sahibi.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A7](research/A7-ai-byok-and-future-oem-architecture.md) §§2–4,15.
- **Conversation provenance:** PO-AI.4.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.13, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FUTURE / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** P01; resource limit.
- **ADR / architecture relation:** P08. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Fake adapters core domain’den ayrıdır; ağır ek service zorunlu değil.
- **Open parameters / decisions:** SDK/dependency ve application boundary approval?

<a id="da-ai-005"></a>

### DA-AI-005

**Davranış:** BYOK encryption/KEK isolation, redaction, outbound policy ve provider’a veri aktarım onayı gerekir.

- **Owner / intended owner:** DoğruAdres AI application / integration; ilgili domain kendi verisinin sahibi.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A7](research/A7-ai-byok-and-future-oem-architecture.md) §§5,9,13.
- **Conversation provenance:** PO-AI.1–2; SECURITY.; G0-S3-P §4 Other Mixed-Status Records; G0-S3-R F21/F22.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.13, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FUTURE / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-007; secret custody.
- **ADR / architecture relation:** P08. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Prompt/log/export secret içermez; org key rotation restore güvenli olur.
- **Open parameters / decisions:** KEK holder, data residency, model retention/training ve cost limits?
- **Alt-kural decision scope:** No unauthorized secret/Org data exposure APPROVED/VERIFIED SECURITY ve DA-AI-001/002; KEK/encryption custody/outbound implementation ve legal/provider terms PROPOSED/OPEN. BYOK tek başına personal-data transfer authorization değildir.

<a id="da-ai-006"></a>

### DA-AI-006

**Davranış:** Connector service principal ile insan oturumu ve AI delegation ayrılır; inbound/outbound auth farklı sözleşmelerdir.

- **Owner / intended owner:** DoğruAdres AI application / integration; ilgili domain kendi verisinin sahibi.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A5](research/A5-canonical-identity-organizations-and-authorization.md) §§9–10; [A7](research/A7-ai-byok-and-future-oem-architecture.md) §6.
- **Conversation provenance:** PO-AI.2.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.13, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FUTURE / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-SEC-003.
- **ADR / architecture relation:** P03/P08. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Connector token kişisel veya başka Org yetkisi kazanmaz.
- **Open parameters / decisions:** Service actor issuance/rotation/scopes?

<a id="da-ai-007"></a>

### DA-AI-007

**Davranış:** Prompt injection, arbitrary SQL/shell/HTTP ve çapraz-Org retrieval sınırları bounded tools ile kontrol edilmelidir.

- **Owner / intended owner:** DoğruAdres AI application / integration; ilgili domain kendi verisinin sahibi.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A7](research/A7-ai-byok-and-future-oem-architecture.md) §9.
- **Conversation provenance:** PO-AI.2–3.; G0-S3-P §4 Other Mixed-Status Records; G0-S3-R F21/F22.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.13, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-FUTURE / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-AI-002–003; DA-SEC-006.
- **ADR / architecture relation:** P08. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Malicious prompt başka Org verisini veya sınırsız işlem aracını açamaz.
- **Open parameters / decisions:** Allowlist, retrieval provenance ve red-team standardı?
- **Alt-kural decision scope:** AI authority existing permissions’ı aşamaz ve crossOrg retrieval yok APPROVED/VERIFIED DA-AI-002/003 ve DA-SEC-002/006; exact bounded dispatcher/allowlist/injection controls PROPOSED/OPEN. Model/tool result yeni authorization üretemez; specific runtime seçilmedi.

<a id="da-ai-008"></a>

### DA-AI-008

**Davranış:** Gelecekte harici ERP/accounting/inventory bağlantıları, optional native Accounting activation’ını zorunlu kılmadan desteklenebilmelidir; mapping, source-of-truth, tenant credentials, idempotency ve reconciliation açık kontratla tasarlanmalıdır.

- **Owner / intended owner:** DoğruAdres AI application / integration; ilgili domain kendi verisinin sahibi.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4 (External accounting/inventory identities), §10.9; [A2](research/A2-platform-core-placement-and-integration-topology.md) §§7,10; [A6](research/A6-development-roadmap-and-release-sequencing.md) §14.
- **Conversation provenance:** G0-S3 §6 kapsam kontrolü; ayrıntılı connector approval yok.; G0-S3-P §4 Other Mixed-Status Records; G0-S3-R F21/F22.
- **Primary trace:** G0-S3 ek kayıt; §9.2 coverage/split gerekçesi.
- **Delivery horizon / implementation:** H-FUTURE / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ACC-005; DA-AI-006; DA-SEC-002.
- **ADR / architecture relation:** P01/P07/P08 koşullu. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Native Accounting kapalıyken onaylı fake external adapter akışı; retry duplicate üretmez ve Org credentials karışmaz.
- **Open parameters / decisions:** Desteklenecek sistemler, field ownership/sync direction, cutover ve reconciliation owner OPEN; provider seçilmedi.
- **Alt-kural decision scope:** Native accounting optionality/market independence APPROVED/VERIFIED DA-ACC-005; future external ERP/accounting/inventory capability kapsamı ve exact connector mappings/mechanisms PROPOSED/OPEN. DoğruAdres business platform’da future connector sadece AI application’ı için var sayılmaz; physical ownership boundary seçilmedi.

## 7.14. Uluslararasılaştırma, RTL ve erişilebilirlik

<a id="da-ux-001"></a>

### DA-UX-001

**Davranış:** Approved initial language targets yalnız Türkçe, İngilizce ve Modern Standard Arabic (MSA)’dir. Arabic RTL support gerektirir; ayrı Arabic dialect kapsamı yoktur. Bu product target completed UI veya final locale tags/translation framework seçimi değildir.

- **Owner / intended owner:** DoğruAdres UX / localization.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [DESIGN](../../DESIGN.md) §16; [A6](research/A6-development-roadmap-and-release-sequencing.md) §§2,13.
- **Conversation provenance:** G0-S3 §3.D approved target; G0-S3-P §5 historical variant question; G0-S3-Q §6 final explicit owner decision MSA-only, O-18 CLOSED/SUPERSEDED.; G0-S3-S §§5/6 currency communication cross-reference; soleMSA/RTL scope unchanged
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.14, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Functional briefs.
- **ADR / architecture relation:** ADR gerekmez; library değişirse dependency ADR. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** TR/EN/MSA ve Arabic RTL/bidi/date/number/currency examples supported target olarak değerlendirilir; separate Arabic dialect locale/translation requirement yaratılmaz. Final locale tags/content/accessibility expected criteria ilgili OPEN policy’den gelir.; NonTRY display amounts must be distinguishable from actual finalTRY charge beforepayment acrossTR/EN/MSA+RTL; language choice cannot change currency contract or shipping eligibility (DA-MKT-007/013,DA-FIN-002)
- **Open parameters / decisions:** Final locale tags/matrix/fallback, translation content/process/tooling ve accessibility conformance OPEN. Arabic variant artık OPEN değildir: sole target MSA, ayrı dialect yok; O-18 closed.
- **Alt-kural decision scope:** APPROVED/VERIFIED G0-S3-Q §6: Turkish/English/MSA-only, RTL. OPEN: locale tags/accessibility/translation implementation; no framework selected.

<a id="da-ux-002"></a>

### DA-UX-002

**Davranış:** Keyboard, focus, screen-reader, contrast, touch target ve hata erişilebilirliği acceptance standardına adaydır.

- **Owner / intended owner:** DoğruAdres UX / localization.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [DESIGN](../../DESIGN.md) §17; [A6](research/A6-development-roadmap-and-release-sequencing.md) §9.
- **Conversation provenance:** Yok.; G0-S3-T §5 visual access outcomes only; whole proposed accessibility standard unchanged
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.14, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** UX acceptance policy.; DA-UX-004; narrower approved visual access outcomes
- **ADR / architecture relation:** ADR gerekmez. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Lock/unlock, notification, form ve cart keyboard ile erişilir.
- **Open parameters / decisions:** Hedef WCAG seviyesi, assistive test matrisi?
- **Alt-kural decision scope:** Existing broad accessibility standard candidate remains PROPOSED; DA-UX-004 latest APPROVED visual-comprehensibility keyboard/assistive access and color-independent meaning subrules binding. Final WCAG level/test matrix OPEN, no blanket promotion of DESIGN recommendations.

<a id="da-ux-003"></a>

### DA-UX-003

**Davranış:** DESIGN palette/font/layout/light-dark önerileri product requirement veya accepted architecture değildir.

- **Owner / intended owner:** DoğruAdres UX / localization.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [DESIGN](../../DESIGN.md) §§7–22; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §5.
- **Conversation provenance:** PO-DOC.3.; G0-S3-P §4 Other Mixed-Status Records; G0-S3-R F21/F22.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.14, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-GOV / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-APP-006.
- **ADR / architecture relation:** ADR gerekmez. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** UI reference onaylı policy’yi değiştirmez.
- **Open parameters / decisions:** Görsel edition ve screen approval izi?
- **Alt-kural decision scope:** DESIGN acceptance/implementation kanıtı değildir: APPROVED/VERIFIED inherited DA-APP-006 ve DESIGN §1/2. Palette/font/layout/light-dark suggestions PROPOSED/RECOMMENDED. Visual token/screen choice henüz approved değildir.

<a id="da-ux-004"></a>
### DA-UX-004

**Davranış:** Karmaşık bilgi, anlamayı maddi olarak iyileştirdiğinde uygun graphics, visual explanations/comparisons ve contextual text ile açık/sezgisel sunulmalıdır; dense technical/financial tables tek anlatım yolu yapılmamalıdır. Figures/states/time periods/business rules ilişkileri açıklanır; actual,estimated,pending,historical values clearly distinguished. Exact amounts/relevant definitions visual summaries yanında bulunur; misleading scales/ambiguous progress/unsupported forecasts kullanılmaz. Essential meaning exclusively color/images’a bağlı olamaz; responsive/mobile, TR/EN/soleMSA+RTL ve keyboard/assistive-technology access needs gözetilir. Charts/tooltips/exports/underlying datasets aynı confidentiality/permission boundaries’i korur. Her screen’e chart veya decorative visualization zorunlu değildir. Marketplace pricing/commissions/FX history/payout timeline, representative targets/portfolio, Loyalty/Kumbara ve optionalAccounting candidate examples’dır; dashboard implementation yetkisi değildir.

- **Owner / intended owner:** Cross-application UX / product domain owners; localization/security consumers. Logical accountability, final physical ownership decision değil.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0 Step 3-T](research/G0-step-3-T-payout-deferral-full-month-targets-and-visual-communication-2026-10-10.md) §5 latest decision and existingUX overlap review; [A6](research/A6-development-roadmap-and-release-sequencing.md) §9 acceptance context, visual principle historical approval proof değil.
- **Conversation provenance:** G0-S3-T §5 explicit product-owner Visual Communication decision; no historical date/message permalink supplied.
- **Primary trace:** G0-S3-T new requirement; existingUX001 localization/002 accessibility candidate/003 proposeddesign do not capture independent approved comprehensibility outcome; §9.8.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; cross-cutting future functional briefs, no dashboard delivered.
- **Dependencies:** DA-UX-001/002/003; DA-SEC-001/002/005/007; related FIN/MKT/LOY/ACC domain definitions.
- **ADR / architecture relation:** Product outcome only; no chart library/design system/ADR/dependency selection. DESIGN remains proposed reference.
- **Acceptance concept:** UX-004.A complex payout timeline distinguishes scheduled/pending/initiated/completed/history with exact date/amount/context; B representative May20T periodMay1–Apr30/fulltarget/postTturnover visually and textually distinct, target values synthetic not inventedforecast; C source/display/actualTRY and commission components labelled with exact figures/definitions, rates/provenance perfinancial policy; D chart without color/image still conveys essential meaning by authorized contextual text/accessible equivalent; E keyboard/assistive access and responsiveTR/EN/MSA+RTL examples; F no tooltip/count/export/underlying dataset leaks unauthorizedOrg/privatefinancial data, revokedpermissions rechecked; G inappropriate chart omitted when concise text clearer, no misleading scale or unsupported progress estimate. These are future acceptance concepts, not tests executed.
- **Open parameters / decisions:** Exact library/tokens/graph types/animation/layout/dashboard scope, module-specific representation criteria, detailed accessibility conformance thresholds/test matrix, responsive/RTL interaction design and data export formats OPEN. Domain financial values/states/forecast authority remain respective policy, visual principle does not select them.

## 7.15. Saklama, arşivleme, silme ve belge yönetişimi

<a id="da-data-001"></a>

### DA-DATA-001

**Davranış:** Data-class retention/archive/restore/deletion policy değerleri OPEN’dır. Legal/financial/private sınıfa göre ayrı approval gerekliliği root governance’da bağlayıcıdır; bu kayıt unknown class policy’lerini açık karar olarak izler.

- **Owner / intended owner:** İlgili kayıt domain’i; cross-domain lifecycle ve documentation governance.
- **Decision / evidence:** OPEN / UNVERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7; [A5](research/A5-canonical-identity-organizations-and-authorization.md) §15; AGENTS Approval gates.
- **Conversation provenance:** PO-DOC.5–8; precise class-specific deletion policies unresolved.; G0-S3-P §4 Audit, Search and Data Lifecycle; G0-S3-R F18; G0-S4-C §6 explicit approved capabilities vs unresolved class policies.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.15, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-GOV / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Data classification.
- **ADR / architecture relation:** P03/P06; retention ADR koşullu. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Deletion history veya earned ledger’ı sessizce kırmaz.
- **Open parameters / decisions:** Data-class eligibility/legal retention matrix; recycle-bin clock start; restore/purge authorization; automatic versus manual purge; backups/expiration; legal holds/active disputes; conflicting references/restoration dependencies; timezone/interrupted-job handling; deletion-failure reason confidentiality/retention OPEN. DA-DATA-006 approved conditional thirty-day default bu class-specific policy kararlarını veya legal preservation obligations’ı çözmez.
- **Alt-kural decision scope:** APPROVED/VERIFIED inherited governance: AGENTS Approval gates ve protected finance DA-DATA-002. OPEN/UNVERIFIED: precise class-specific lifecycle policies.

<a id="da-data-002"></a>

### DA-DATA-002

**Davranış:** Posted accounting records ve tamamlanmış financial snapshots yeniden yazılmamalı veya destructively deleted olmamalıdır. Correction/reversal/audit ayrı linked records ile izlenir; app deactivation, recycle-bin purge veya cascade bu protected evidence’ı silemez.

- **Owner / intended owner:** İlgili kayıt domain’i; cross-domain lifecycle ve documentation governance.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §6; [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§14–15.
- **Conversation provenance:** PO-ACC.4; PO-MKT.11.; G0-S3-P §4 Audit, Search and Data Lifecycle; G0-S3-R F18.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.15, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-GOV / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-ACC-004; DA-MKT-008.
- **ADR / architecture relation:** P06/P07. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Posted/snapshot mutation ve destructive bin/purge/cascade reddedilir; authorized correction original record’ı korur. Legal deletion çatışması policy review’e escalated olur; sessiz destruction yapılmaz.
- **Open parameters / decisions:** Legal deletion talebiyle minimum financial evidence çatışması?

<a id="da-data-003"></a>

### DA-DATA-003

**Davranış:** Research, approved requirement, accepted ADR ve implemented architecture farklı otorite sınıflarıdır.

- **Owner / intended owner:** İlgili kayıt domain’i; cross-domain lifecycle ve documentation governance.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §§8–9; [Research index](research/README.md) Authority.
- **Conversation provenance:** PO-DOC.4–8.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.15, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-GOV / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Approval provenance.
- **ADR / architecture relation:** ADR-0003; governance update. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Araştırma kaydı approval/implementation flag’i üretmez.
- **Open parameters / decisions:** REQUIREMENTS metadata şeması onayı?

<a id="da-data-004"></a>

### DA-DATA-004

**Davranış:** Gelecek research yazımı yalnız açık task yetkisinde; unique filename, full evidence ve izinli index update ile yapılır.

- **Owner / intended owner:** İlgili kayıt domain’i; cross-domain lifecycle ve documentation governance.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [Research index](research/README.md) Research Lifecycle.
- **Conversation provenance:** PO-DOC.4,8; görev §8.
- **Primary trace:** [G0-S2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) §6.15, aynı ID satırı; original ID korundu.
- **Delivery horizon / implementation:** H-GOV / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** Collision/hash preflight.
- **ADR / architecture relation:** ADR gerekmez. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Read-only task report yazmaz; mevcut evidence overwrite edilmez.
- **Open parameters / decisions:** Permanent governance update ayrıca onaylanacak.

<a id="da-data-005"></a>

### DA-DATA-005

**Davranış:** Önerilen lifecycle modeli new use/sale closure ile authorized historical read ve archive/restore’u ayırır. Protected financial references destructive cascade ile kaybedilemez; bu koruma DA-DATA-002’den binding APPROVED invariant’tır. Exact catalog archive/restore mekanizması ve product-scope lifecycle policy bu kayıtla accepted yapılmaz.

- **Owner / intended owner:** İlgili kayıt domain’i; cross-domain lifecycle ve documentation governance.
- **Decision / evidence:** PROPOSED / RECOMMENDED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §7 (senaryo 8); [A2](research/A2-platform-core-placement-and-integration-topology.md) §7 (senaryo 9); [A3-R](research/A3-R-native-basic-accounting-reassessment.md) §7; [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) §4.
- **Conversation provenance:** G0-S3 §6 archiving/deletion kapsam kontrolü; ayrıntılı retention approval yok.; G0-S3-P §4 Audit, Search and Data Lifecycle; G0-S3-R F18.
- **Primary trace:** G0-S3 ek kayıt; §9.2 coverage/split gerekçesi.
- **Delivery horizon / implementation:** H-GOV / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-DATA-001,002; DA-APP-003.
- **ADR / architecture relation:** P03/P06; retention ADR koşullu. P etiketleri proposed research topics; implementation yetkisi değildir.
- **Acceptance concept:** Inactive catalog item yeni satışa kapalıyken yetkili history eski snapshot’ı gösterir; archive financial reference’ı kırmaz.
- **Open parameters / decisions:** Archive/restore eligibility/rights, legal holds/retention/final integrity check OPEN. Module bins/conditional30day/persisted failure reason proposed scope DA-DATA-006’da; protected finance no-delete tartışmaya açık parametre değildir.
- **Alt-kural decision scope:** APPROVED/VERIFIED: DA-DATA-002 ve DA-APP-003 protected finance/history. PROPOSED/RECOMMENDED: lifecycle mechanism; new-sale behavior ayrıntıları review bekler.

<a id="da-data-006"></a>

### DA-DATA-006

**Davranış:** Eligible records için module-specific recycle bins, current authorization’a tabi safe restoration ve durable appropriately protected deletion-failure/reason record APPROVED business capabilities’dir. Thirty-day default yalnız legally/technically appropriate olduğu confirmed eligible data classes için approved configurable policy direction’dır. Universal retention limit, automatic all-record deletion veya statutory preservation override değildir. Posted accounting entries, transaction snapshots ve diğer legally protected records destructive purge/bin/cascade ile silinemez. Physical bin table/scheduler/soft-delete/storage strategy seçilmez; destructive operation yetkisi verilmez.

- **Owner / intended owner:** Each record domain; authorized lifecycle policy.
- **Decision / evidence:** APPROVED / VERIFIED.
- **Research ve exact section:** [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) §4 lifecycle ve §8 cascade; [A2](research/A2-platform-core-placement-and-integration-topology.md) §8 permanent deletion status/reason; [G0 Step 3-R](research/G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) §4 F18.
- **Conversation provenance:** G0-S3-P §4 Audit, Search and Data Lifecycle; S3-R §3.F exact historical approval uncertainty; G0-S3-P current briefing; original historical approval dates/message permalinks sağlanmadı; G0-S4-C §6 latest explicit owner approval, historical uncertainty bu business scope için çözüldü.
- **Primary trace:** G0-S3-P ek kayıt; §9.5 amendment coverage ve audit ilişkisi.
- **Delivery horizon / implementation:** H-DOMAIN / NOT_ASSESSED; §5’in sınırları geçerlidir.
- **Dependencies:** DA-DATA-001/002/005; DA-APP-003; DA-SEC-002/006.
- **ADR / architecture relation:** İlgili G0-S2 P topics review bekler; new accepted ADR/module/schema/provider kararı değildir.
- **Acceptance concept:** DATA-006.A eligible module records independent bin capability; B restore current tenant/resource authorization ve reference/dependency rules’ı aşmaz; C posted accounting/snapshots/legal-hold protected records destructive purge refused; D deletion failure durable protected reason üretir, ordinary operational log expiry sole evidence’ı yok etmez; E confirmed eligible class için thirty-day default fixture ancak approved start/retention policy ile değerlendirilir; ineligible/held class thirty-day automatic purge’a tabi olmaz.
- **Open parameters / decisions:** C-06 capability approval resolved; data-class eligibility/legal retention matrix, exact clock start, restore/purge authorization, automatic/manual purge, backup retention/expiration, legal holds/active disputes, conflicting references/restoration dependencies, timezone/interrupted jobs ve failure-reason confidentiality/retention OPEN with DA-DATA-001. No physical storage/job strategy or destructive migration selected.
- **Alt-kural decision scope:** APPROVED/VERIFIED G0-S4-C §6: eligible module bins, authorized safe restore, confirmed legally eligible classes için configurable thirty-day default, durable protected failure reasons and protected finance/history. OPEN: class/legal/operational matrix and implementation; no universal retention/purge authorization.

## 8. Cross-domain invariant’lar

Bu bölüm approved business sonuçlarını ortak okur; technical mechanism veya historical uncertain parameters topluca accepted yapılmaz.

1. Canonical person, personal workspace, multiple Organization memberships ve personal/Organization/Store/branch/platform scopes ayrı kalır (DA-ID-001–003, DA-ORG-001/002/005). Email, personal real identity, legal Organization verification ve Store approval ayrı states’tir; email tek başına unverified Organization purchasing privilege sağlamaz (DA-ORG-007).
2. Badge, launcher order/expanded-collapsed/show-hide, client context veya framework actor authorization üretmez. Application entitlement/user permission/personal preference business separation approved; registry/schema/protocol OPEN (DA-APP-001/002/008, DA-SEC-001/002/003).
3. Independent Store approval/balances/statements/eligible finalized funds remain separate. Platform schedule Friday default, selectable A previous eligible/B next eligible DEFAULT/C next eligible scheduled occurrence, default nonprocessing configurable half-day and preferredGoogle automatic sync approved; validated auditable internal calendar separates events/official holidays/halfday/bank/provider/platform policy. API access/license/exception/cutoff/fallback technical details OPEN; no slider postponement. Native optional Accounting not prerequisite (DA-FIN-001/007/008,DA-ACC-005).
4. Source currency authority/controlled versionedTRY publication/seller-vsFX history/cart reacceptance/protected snapshots retained. Initial Turkish-established seller marketplace actual card charge/settlement/Store payout mandatoryTRY. Seven layers separately trace source/calculation/publication/display/accepted-actualTRY/settlement/snapshot; unrelated rate-version mixing prevented. NonTRY equivalent visibly distinct from acceptedfinalTRY; user preferences do not mutate source or shipping eligibility. O-21 initial currency interpretation CLOSED; FX/provider mechanics OPEN (DA-MKT-002–008/012/013,DA-FIN-002).
5. Genel komisyonlar ortak defined gross base’te bağımsız hesaplanır, sequential percentage compounding olmaz; total=sum, seller breakdown ve Store/product exceptions vardır (DA-FIN-003). Gross base tax/shipping/discount/currency/rounding/precedence OPEN; representative net-product earnings rule bu matraha aktarılmaz.
6. Platform Loyalty Management central activity/eligibility owner’dır; 90 ardışık qualifying purchase-day yokluğu OR 30 qualifying human Organization-login-day yokluğu approved’dır. Inactivity automatic suspension/Store closure değildir. Operational state, Golden performance-target eligibility, reassignment ve vested rights ayrı (DA-LOY-001–009, DA-ID-005/006).
7. Representative net base excludes VAT/shipping. Approved12calendar-month period starts first day ofactualT month, ends last day12th month; turnover ZERO atactualT, pre-T business does not count. Partial first month completes calendar month-end and uses FULL monthly target with NO day proration APPROVED; actual target amount/earning-event/adjustments OPEN. Former NEW accrual endsT, earned history retained/no retroactive transfer/no overlap; Lost Customers history-only bounds and repeated-transfer/reacquisition preserved. Golden performance and90/30inactivity clocks separate (DA-LOY-006/010/011,DA-FIN-005).
8. Email-only Meydan/product review reading author masked/profile navigation denied; normal participation identity verification ister. Job permitted index/preview açık, full content/apply denied; verified person additional resource/Organization permissions’a tabidir. Job management full HR activation’dan bağımsız (DA-SOC-002/003, DA-JOB-001–003). Personal verification technology/provider DEFERRED, synthetic auth PoC için prerequisite değil (DA-ID-004).
9. Native Accounting, double-entry/idempotency/immutable posted evidence/auditable correction ve protected historical records optional app off/bin/purge/cascade ile destructively deleted olmaz (DA-ACC-001–007, DA-APP-003, DA-DATA-002). Domestic Turkish workflow research + qualified expertise detailed design’dan önce; tax/e-document policy seçilmez.
10. Genuine backend/badge-earned/meaningful-transition notifications shared bell’den authorized erişilir; password session lock/unlock backend enforced ve lock bell yanındadır. Notification delivery state qualification veya business state’in yerine geçmez; outbox/retry/session-storage seçilmedi (DA-APP-004/005, DA-ID-006, DA-SEC-004).
11. Approved confidentiality/auditability physical log architecture’dan ayrı binding kalır. Detailed audit/search/export and advanced search scopes PROPOSED. Eligible module bins/current-authorized restore/durable protected failure reasons ve confirmed legally eligible classes için configurable thirty-day default APPROVED; exact legal/class/clock/purge/backup/hold policies OPEN. No all-data30day rule or destructive finance purge (DA-SEC-007/009, DA-APP-009, DA-DATA-001/002/005/006).
12. DoğruAdres multi-application platform common authorized domain data kullanır; marketplace tek business purpose değildir. Shared domain data private finance/cost/HR/Org records için global visibility yaratmaz. Exact canonical catalog/connector/physical-domain boundaries PROPOSED/OPEN (DA-CAT-001–004, DA-AI-008).
13. AI/BYOK authority current user/Org/app/resource permissions’ı aşamaz, high-impact approval+recheck gerekir. Products/Inventory/Vehicle/Quotations AI/OEM olmadan işler. Provider-neutral VIN/OEM lookup approved future direction; LexCom prospective; provider/licensing selection future OEM gate’e DEFERRED, no agreement verified in available project evidence; reference lookup≠automatic/guaranteed fitment. Matching/confidence/legal contract yeni owner approval ister (DA-CAT-005, DA-AUTO-001/003–005, DA-AI-001–008).
14. Approved initial targets TR/EN/sole Modern Standard Arabic (MSA), Arabic RTL’dir; separate dialect yok. O-18 current variant question CLOSED/SUPERSEDED (G0-S3-Q §6). Final locales/accessibility/translations tooling seçilmedi; DESIGN accepted UI/implementation kanıtı değil (DA-UX-001–003).
15. Complex cross-application figures/states/periods/rules use materially helpful visuals and contextual exact accessible text; actual/estimated/pending/history distinct, no misleading scales/unsupported forecasts, no color/image-only meaning. Responsive TR/EN/MSA+RTL keyboard/assistive access and charts/tooltips/exports/dataset authorization required; no implemented design system or every-screen chart mandate (DA-UX-004).
16. ADR-0001/0002/0003 Mercur engine/automotive isolation/extension-first accepted kapsamları korunur. Upstream known issue, compatibility adjustment ve customization ayrı; extension capability runtime security/SQL atomicity/implemented feature kanıtı değildir.

## 9. Corrections, superseded öneriler ve tarihsel ilişkiler

### 9.1. G0 Step 2’ye uygulanan sınıflandırma düzeltmeleri

G0-S2 immutable historical evidence olarak kalır. Aşağıdaki güncel yorum yalnız bu taslaktadır; source report rewrite yapılmamıştır.

| G0-S3 hükmü | Kayıt / önceki sınıf | Taslaktaki uzlaştırma ve kanıt |
|---|---|---|
| §3.A | DA-LOY-003 PROPOSED/RECOMMENDED | APPROVED/VERIFIED: 90 ardışık purchase günü OR 30 ardışık human Organization-workspace login günü. Generic activity login yerine kullanılamaz; clock/events/reactivation OPEN |
| §3.B | DA-ID-005, DA-LOY-005/008 | Onaylı criterion ayrı DA-LOY-009’da; DA-LOY-008 yalnız unresolved target/period/purchase parametreleriyle OPEN kalır. Inactivity, performance, reassignment ve vested haklar ayrı |
| §3.C | DA-MKT-003 PROPOSED/RECOMMENDED | Versioned controlled TRY publication architectural direction APPROVED/VERIFIED; publish transaction/stale/checkout/provider detayları OPEN |
| §3.C | DA-FIN-002 PROPOSED/RECOMMENDED | TRY first-release settlement preference APPROVED/VERIFIED ürün yönü; final provider/settlement contract OPEN. DA-MKT-002/004/006/008 source currency, 2005-01-01 archive, seller/FX ayrımı ve history onayları korunur |
| §3.D | DA-UX-001 PROPOSED/RECOMMENDED | Turkish/English/MSA Arabic/RTL APPROVED/VERIFIED product target; DESIGN tek başına approval değil; final locales/accessibility/translation OPEN |
| §3.E | DA-ID-004 DEFERRED/VERIFIED | Aynı statü; hiçbir provider/method seçilmedi, initial synthetic authorization PoC için technology prerequisite yaratılmaz |
| §3.F | DA-SOC-002/003; DA-JOB-001–003 | Email-only Meydan + product review read/masked author/denied profile/denied participation; permitted job preview, denied full content/apply; verified kullanıcının ek izinleri ve HR-independent job management açıklaştırıldı |
| §3.G | DA-ID-005/006; DA-ORG-004 | Protected Owner koşulu APPROVED ayrı DA-ORG-008’de; transfer/recovery/last-Owner mekanizması DA-ORG-004’te PROPOSED kalır. Dynamic eligibility, no authorization ve genuine transition notification korunur; exact timing OPEN |
| §3.H | DA-ACC-001/002/004/005/007 | Native PostgreSQL/TypeScript/Medusa direction, optional activation ve financial integrity APPROVED; Bigcapital mandatory değil. Domestic software research + qualified accounting review sonrası detailed requirements; tax/e-document policy seçilmedi |
| §3.I | DA-SOC-001/006 | Meydan established working name olarak korunur; 500 configurable proposed default, immutable approved cap değildir; media/moderation/cross-post/personal gate kaybolmaz |

Dört original record’ın decision/evidence sınıfı PROPOSED/RECOMMENDED → APPROVED/VERIFIED oldu: DA-LOY-003, DA-MKT-003, DA-FIN-002, DA-UX-001. Diğerleri behavior clarification veya approved-invariant/open-parameter ayrımıdır; tüm araştırma önerileri APPROVED yapılmadı.

### 9.2. İlk G0-S3 ek kayıtları ve historical92-record coverage

| Yeni ID | İlişki / ekleme gerekçesi | Sınıf |
|---|---|---|
| DA-ORG-008 | DA-ORG-004’teki proposed mechanism’den approved protected Owner kavramını ayırır; DA-ID-005’i destekler | APPROVED |
| DA-LOY-009 | DA-LOY-008’in open numerical parameters’ından approved performance-target necessity’yi ayırır; DA-ID-005/LOY-005’e bağlanır | APPROVED |
| DA-APP-008 | Launcher user ordering/show-hide behavior DA-APP-001’deki kavram ayrımından daha açık kaydedilir; A1 §4 ve G0-1 §4 | PROPOSED |
| DA-AI-008 | Future ERP/accounting/inventory capability ve optional-accounting independence; AI-specific delegation’dan ayrı integration coverage; A1 §10.9, A2 §10, A6 §14 | PROPOSED |
| DA-MKT-011 | Buyer eligibility ve lowest-applicable segment-price recommendation DA-MKT-009 buyer-block record’ında kaybolmaz; A4 §11 | PROPOSED |
| DA-DATA-005 | Inactive product/history/archive/restore/protected-reference behavior; DA-DATA-001’in open retention policy kaydını somutlaştırır; A1 §7 senaryo 8, A2 §7 senaryo 9 | PROPOSED |
| DA-AUTO-005 | Fitment/equivalence/OEM namespace ve uncertainty ayrı requirement olarak izlenir; ADR-0002 kapsamı + A5 §11/A7 §10 önerileri | PROPOSED |

Bu tablodaki sınıflar ilk G0-S3 tarihi nüshasına aittir; G0-S3-P current decision/statistics §9.4/9.5’te. Özellikle APP-008 ve MKT-011’in current business status’u APPROVED’dır.

Bütün original92 ID §7’de bir defa requirement heading olarak yer alır; renumber, replacement veya omission yoktur. Ekler aynı domain prefix’in bir sonraki boş numarasını kullanır. G0-S3 ilk nüshası tarihsel olarak99 kayıt /15 domain; current G0-S3-P sayımı109 kayıt /15 domain (§9.4); original §6.4 teslimat kaydı DA-APP-007 aynı domain’de kaldı. Domain başlıkları yeni hierarchy oluşturmaz.

### 9.3. Superseded directions ve korunmuş evidence

- A3 §§1/6’daki separate Bigcapital default/mandatory direction adayı, PO-ACC ve G0-S3 §3.H native selection nedeniyle güncel ürün yönü değildir. A3 teknik/lisans/operasyon araştırması korunur; A3-R raporunun kendisi approval kaynağı değildir.
- G0-S2 §§1/5/10’daki '90/30 PROPOSED', 'TRY publication PROPOSED', locale/RTL hedefinin sadece DESIGN proposal olduğu sınıflandırmalar yukarıdaki explicit owner corrections ile güncel baseline için geçersizdir. G0-S3-S initial Turkey-scoped mandatoryTRY contract superseding decision’dır; payment-provider operational contract OPEN kalır.
- A7 §9’daki genel email-read özeti Job full-content erişimine genişletilemez; güncel §3.F ve G0-S2 PO-JOB sınırı geçerlidir.
- A3-R/A4/A5/A6/A7/G0-1’in prior full-report unavailable ifadeleri o araştırmaların evidence horizon’ıdır; bugün arşiv okunabilir olması geçmiş cümleleri veya onay boşluklarını değiştirmez.
- A2 selective hybrid/modular monolith recommendation bütün platform için accepted process/DB architecture değildir. Native Accounting shared-PG direction tüm domain’lere yayılmaz.
- Mevcut PRINCIPLES §4 ile MERCUR-INTEGRATION 'Accepted baseline deviations' içindeki compose.dev.yml sınıf farkı unresolved governance conflict olarak kalır. Bu görev onu düzeltmez veya yeni upstream issue icat etmez.
- ADR-0001/0002/0003 accepted statülerini korur; P01–P09 bunların yerini almaz.

### 9.4. Current coverage sayımları — G0-S4-C baseline v1.0

| Domain | Original G0-S2 | G0-S3 ek | G0-S3-P ek | G0-S3-T ek | Current toplam |
|---|---|---|---|---|---|
| ID — Kimlik ve kişisel alan | 6 | 0 | 0 | 0 | 6 |
| ORG — Organizations, Stores, şubeler ve üyelik | 7 | 1 | 1 | 0 | 9 |
| SEC — Yetkilendirme, dosyalar, oturumlar ve denetim | 8 | 0 | 1 | 0 | 9 |
| APP — Uygulamalar, launcher, bildirimler ve teslimat | 7 | 1 | 1 | 0 | 9 |
| CAT — Products, Brands, Contacts ve Inventory | 5 | 0 | 0 | 0 | 5 |
| MKT — Marketplace ve çoklu para fiyatlama | 10 | 1 | 2 | 0 | 13 |
| FIN — Settlement ve komisyonlar | 6 | 0 | 2 | 0 | 8 |
| ACC — Native Basic Accounting | 7 | 0 | 0 | 0 | 7 |
| LOY — Loyalty, Kumbara ve temsilcilik | 8 | 1 | 2 | 0 | 11 |
| SOC — Meydan ve Product Reviews | 6 | 0 | 0 | 0 | 6 |
| JOB — Job Board ve HR | 4 | 0 | 0 | 0 | 4 |
| AUTO — Vehicle Management, Quotations ve OEM | 4 | 1 | 0 | 0 | 5 |
| AI — AI/BYOK ve gelecek entegrasyonlar | 7 | 1 | 0 | 0 | 8 |
| UX — Uluslararasılaştırma, RTL ve erişilebilirlik | 3 | 0 | 0 | 1 | 4 |
| DATA — Saklama, arşivleme, silme ve belge yönetişimi | 4 | 1 | 1 | 0 | 6 |
| **Total at v1.0** | **92** | **7** | **10** | **1** | **110** |

Historical v1.0 whole-record distribution: **77 APPROVED,28 PROPOSED,3 OPEN,2 DEFERRED**. Clause-level inherited approval/proposed parameters ayrı scope satırlarında; these counts are not implementation approval. All 110 v1.0 implementation statuses were **NOT_ASSESSED**. Baseline history and IDs remain unchanged.

### 9.5. G0-S3-P controlled amendment ve audit disposition

Bu altbölüm historical S3-P amendment durumunu kaydeder; Friday/C-04/Arabic variant ifadeleri o tarihteki scope’tur. Current G0-S3-Q §9.6 ve §7/11 bunların belirtilen kısımlarını supersede eder; archived reports değiştirilmez.

Current owner task “Controlled Requirements Amendment” §4/5 kaynak alınarak [G0-S3-R](research/G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) findings uygulandı. Yazım yalnız bu dosyada; archived audit/specification değişmedi. Bu amendment belge acceptance’i veya new ADR/implementation authorization değildir.

| Finding | Current documentation outcome | Record / remaining gate |
|---|---|---|
| F01 | Component fields/bounds/common gross base/non-compounding/sum/seller disclosure/exceptions added | DA-FIN-003.A–F; financial parameters OPEN |
| F02 | Independent Store balances/funds explicit; approval retained | DA-FIN-001/ORG-002 |
| F03 | Platform schedule/date/eligible slider/no arbitrary delay added | DA-FIN-007 APPROVED outcome; Friday/holiday PROPOSED,C-01 |
| F04 | Authorized payout-receipt PDF added | DA-FIN-008; issuer/provider/retention OPEN |
| F05 | Representative separate net base;12-month history retained as proposal | DA-LOY-010; C-02/C-03, no Golden period reuse |
| F06 | Departure/reassignment earned-right preservation added | DA-FIN-005; future accrual/access OPEN |
| F07 | Warranty/refund/abuse/dispute separated; no normal-warranty-only confiscation | DA-LOY-011; adjustment/vesting OPEN |
| F08 | Separate reassignment permission/required approval APPROVED | DA-LOY-006; case/Org-platform approvers PROPOSED/OPEN |
| F09 | Promo credit vs monetary commission business separation APPROVED | DA-LOY-007; economic/funding/ledger details OPEN |
| F10 | Store-specific BuyerOrg block explicit | DA-MKT-009; external/current-order effects OPEN |
| F11 | Lowest eligible price target APPROVED; algorithm separate | DA-MKT-011; bases/ties/stacking OPEN |
| F12 | Minimum basket and free-shipping separate acceptance capabilities represented | DA-MKT-012 PROPOSED; historical approval scope C-04 |
| F13 | Country/language/display-currency preferences separate;no silent settlement change | DA-MKT-013 PROPOSED; C-04 |
| F14 | App categories/sector activation/no auto disable/recommendations/launcher/history APPROVED | DA-APP-001/002/003/008; mechanisms/lists/rights OPEN |
| F15 | Binding confidentiality/auditability separated from physical log architecture | DA-SEC-007 scope clauses; architecture PROPOSED |
| F16 | Audit actor/Org/role/action/target/time/permitted before-after + authorized search/CSV/Excel represented | DA-SEC-009 PROPOSED; C-05; inherited security APPROVED |
| F17 | Advanced search/filter functional target represented | DA-APP-009 PROPOSED; module coverage C-05 |
| F18 | Posted finance no destructive delete; class bins/restore/failure reasons represented | DA-DATA-001/002/005/006;30-day proposal C-06 |
| F19 | Genuine backend/badge notifications; shared bell+adjacent password backend lock | DA-APP-004/005,DA-ID-006,DA-SEC-004; no outbox/session technology selection |
| F20 | Existing verification/Meydan/Job/HR-independent gates verified and retained | DA-ID-003/004,SOC-002/003,JOB-001–003; provider DEFERRED |
| F21 | Native research-before-design/manual independence/future integrations retained;optional connector outcome separate | DA-ACC-001–007,CAT-005,AUTO-001/003/004,AI-001–008; provider/implementation OPEN |
| F22 | Inherited approved outcomes separated via clause scope;no blanket mechanism promotion | DA-FIN-004,MKT-005,SEC-003,CAT-001,AUTO-002,JOB-004,AI-005/007,UX-003; technical design PROPOSED/OPEN |

Business-only records DA-APP-001/002/003/008, DA-MKT-011, DA-LOY-006/007 were narrowly clarified and PROPOSED→APPROVED using current G0-S3-P §4 explicit behavior. DA-ORG-007 state separation/email-not-Org-buying privilege uses current §5 and PROPOSED→APPROVED. No original APPROVED record was downgraded. Mixed record’s mechanism status stays PROPOSED/OPEN while inherited approved subclauses remain binding.

New IDs: DA-FIN-007/008 (schedule/request,PDF); DA-LOY-010/011 (representative basis/period,distinct adverse events); DA-MKT-012/013 (Store thresholds,preferences); DA-SEC-009 (audit fields/query/export); DA-APP-009 (advanced search); DA-DATA-006 (bins/restoration/failure evidence); DA-ORG-009 (duplicate taxId registration proposal). Existing99 IDs preserved;10new IDs avoid collisions. New capabilities with uncertain history PROPOSED, not fabricated approved evidence.

Additional §5 reconciliation: Organization verification/purchasing gate DA-ORG-007; taxId duplicate policy DA-ORG-009 PROPOSED/OPEN; multi-application platform purpose §1/invariant12 (no physical boundary decision); OEM lookup vs automatic fitment DA-AUTO-003/005; MSA/Syrian distinction DA-UX-001/O-18. These are current briefing provenance, not invented old approval dates.

### 9.6. G0-S3-Q business decisions ve calendar reconciliation

Historical Q-as-of scope (aşağıdaki counts/draft descriptions Q tarihindeki durumdur): unresolved12month start/initialTRY currency/no preferredAPI statements are superseded where specified by current §9.7 S decisions. Archived Q report stays unchanged.

Current owner §§3–6 kapsamında aşağıdaki corrections uygulandı; draft accepted baseline değildir. G0-S3-Q zero new IDs: Lost Customers DA-LOY-006 içinde bağımsız acceptance subclauses ile temsil edildi, aynı assignment policy duplicate edilmedi.

| Decision | Amended IDs | Current approved scope / remaining OPEN |
|---|---|---|
| C-01 | APPROVED G0-S3-S§3: preferredGoogleCalendarAPI/automatic sync, Fridaydefault/nexteligibleday, halfdaydefaultnonprocessing/configurable and internal auditable policy. OperationalAPI verification/license/cutoff/settings/fallback O-22 OPEN | PublicICS ID verified; APIidentityless403 does not prove unavailablecalendar or authorizedaccess |
| C-02 | APPROVED G0-S3-S§4:12calendar-month first-of-effectiveT-month start/12thmonth-lastday end, turnoverZEROatT/no pre-T accrual. Former start/value question CLOSED/SUPERSEDED. Proration/exactearningevent/exceptionalbackdating and formula C-03 OPEN | May20T→May1calendarstart/May31firstmonth/Apr30nextyearend; actualtransferT unchanged |
| C-04 | APPROVED G0-S3-S§5 initialTurkeyscope mandatoryTRY checkout/cardcharge/settlement/payout; Offer source and user preferences preserved. Store threshold/conversion/persistence operational details O-06/07 OPEN | No foreign charge fromdisplay/source; finalTRY clearaccepted; historicaluncertainty superseded current scope |
| MSA-only | DA-UX-001, O-18 | TR/EN/MSA +RTL, no separate Arabic dialect; historical S3-P variant ambiguity CLOSED/SUPERSEDED, locales/accessibility/translation tooling OPEN |

Current distributions 75/29/4/1 total109; prior S3-P73/31/4/1. No original APPROVED downgrade, implementation statuses all NOT_ASSESSED. Calendar technical evidence, recommendations and current owner decisions are separated in [G0-S3-Q report](research/G0-step-3-Q-business-decisions-and-calendar-feasibility-2026-10-10.md) §§3–9. No acceptance dates/transcript permalinks invented.

### 9.7. G0-S3-S explicit calendar/period/TRY policy decisions

Historical as-ofS (aşağıdaki counts/DRAFT descriptions S tarihindeki durumdur): partial target proration OPEN and onlydefaultB statements are superseded by §9.8 currentT. S approved period/TRY/Google decisions stay binding; archivedS unchanged.

| Decision | Records | Approved business rule / remaining boundary |
|---|---|---|
| C-01 | DA-FIN-007 | Google Calendar API preferredholiday source, automatic sync; Friday default/next eligible bankingday; halfday default nonprocessing configurable; validated deterministic auditable internal calendar/history/corrections/stale-safe handling. CandidateICS200, identitylessevents.list403; authenticatedAPI not verified; provider/license/mechanisms OPEN |
| C-02 | DA-LOY-010/006,DA-FIN-005 |12calendar months first-ofactualT month through12th month-end; turnover ZERO atactualT/no retroactive earnings. May20,2026→calendarMay1,2026–Apr30,2027, firstmonthMay31; old NEW rights endT/vestedhistory/Lost Customers retained. Partialtargets/event/adjustments/backdate OPEN |
| C-04 | DA-MKT-002/003/006/007/008/012/013,DA-FIN-002,DA-UX-001 | Initial Turkish-establishedseller scope actualcharge/settlement/payoutTRY mandatory; source/display independent/sevenlayers/coherentversions/clearacceptedTRY/snapshots. InitialO-21 closed; FX/provider/internal mechanisms OPEN |

13existing record amendments,109IDs retained/new0,75APPROVED/29PROPOSED/4OPEN/1DEFERRED unchanged. Clause-level status changes:12month value/start from historicalPROPOSED/OPEN toAPPROVED; Google from unselected topreferredAPPROVED; halfday default fromOPEN toAPPROVED/configurable; TRY frompreferred/chargeOPEN to mandatoryscopedAPPROVED. No whole-record or implementation promotion: allNOT_ASSESSED, DRAFT. Currentowner §§3–5 provenance; reportdate2026-10-10 not inventedhistoricalapproval.

### 9.8. G0-S3-T approved options/full target/visual communication

Historical T-as-of: aşağıdaki 76/29/4/1 ve DRAFT T tarihindeki durumdur; current baseline §9.4/9.9.

| Decision | Records | Old → current decision scope |
|---|---|---|
| C-01 | DA-FIN-007 | B next eligible remainsDEFAULT; addedAPPROVED A previous eligible with finalizedfunds safeguard and C next eligible recurring scheduledoccurrence, not nextbusinessday. Friday/Google/halfday/integrity unchanged; providercutoff/fallback rolesOPEN |
| C-02 | DA-LOY-010/006/FIN-005 | First partial-month target OPEN→FULL monthlytarget/no dayproration APPROVED;12monthstart/ZEROatactualT/no preT credit/earnedrights unchanged, actualtargetamount/earningevent/correctionsOPEN |
| Visual communication | DA-UX-004; DA-UX-002 narrow scope annotation | New independent APPROVED/VERIFIED cross-application comprehensibility behavior; broad UX002 standard stillPROPOSED, exact conformance/designlibrary/layoutOPEN |
| Stale register repair | §11.1 C-01/C-02/C-04 | Prior rows incorrectly said Friday recommendation/12months proposed/capabilities proposed despiteS approvedtext. Currentrows reflectcurrentdecisions; historical§9.5–7 and reports remainhistorical |

Original109 IDs retained; newDA-UX-004 only,110total/15domains;76APPROVED/29PROPOSED/4OPEN/1DEFERRED,allNOT_ASSESSED,DRAFT. Currentowner§§3–5 authoritative, historicaldates/permalinks not invented. No provider/designsystem/ADR/code selected.

### 9.9. G0-S4-C controlled baseline v1.0 reconciliation

Latest explicit Product Owner instruction §§3–8 approval provenance’dır. MKT-010/LOY-008/DATA-001 OPEN/UNVERIFIED retained; approved direction/invariants unresolved parameters’dan ayrıldı. AUTO-004 OPEN/UNVERIFIED → DEFERRED/VERIFIED (verified only explicit deferral, external agreement unverified). DATA-006 PROPOSED/RECOMMENDED → APPROVED/VERIFIED (eligible module bins/authorized restore/conditional thirty-day default/durable protected failures/finance preservation). Original110 IDs retained/new0;77/28/3/2,allNOT_ASSESSED. Mixed-status acceptance proposed mechanisms/software/ADRs için approval değildir.

### 9.10. G1 canonical identity and Organization foundation amendment

The current explicit Product Owner instruction in this task §§2–8 records the approved architecture and bounded implementation authorization. Record date is 2026-10-17, not an asserted approval timestamp; no permalink or prior approval date was provided. The v1.0 history above remains intact. DA-ORG-004 and DA-SEC-003 change from PROPOSED to APPROVED; DA-AUTO-006 is a new APPROVED stable ID. Current register count is 111 IDs: 80 APPROVED, 26 PROPOSED, 3 OPEN and 2 DEFERRED. The amendment resolves canonical actor-to-Person mapping without email-based linking; Organization/membership separation; protected platform provisioning and initial Owner assignment; multiple protected Owners and ordinary last-active-Owner protection; seven-day, single-use, revocable hashed-token invitations with verified-recipient acceptance; request-time fail-closed Organization authorization; and the minimum shared transactional audit requirements. Vehicle ownership, Organization-scoped plate/VIN uniqueness, access/revocation and audit attribution are approved in DA-AUTO-006, but Vehicle implementation remains explicitly out of this checkpoint. No ADR or unrelated research report is changed.

## 10. Deferred decisions register

| Ref | Açıkça deferred olan seçim / delivery | Korunan gereksinim ve review sınırı |
|---|---|---|
| D-01 | Personal identity verification method/provider/technology seçimi DEFERRED | DA-ID-004; logical verification states/access restrictions sürer. KPS/e-Devlet/card/selfie/NFC/biometric/commercial provider seçilmedi; initial synthetic authorization PoC prerequisite’i değil |
| D-02 | AI/BYOK ve gerçek connector implementation bu documentation görevinin dışında / future horizon | DA-AI-001–008 hedef/statüleri kendi kayıtlarında; approved future goal şimdi implementation onayı değildir. Provider/SDK/key/delegation kararları §11’de OPEN/PROPOSED |
| D-03 | Actual OEM/VIN provider selection/licensing DEFERRED; connector future horizon | DA-AUTO-004 DEFERRED/VERIFIED explicit postponement; DA-AUTO-003/005 unchanged. LexCom prospective, no agreement verified in available evidence. Future separately approved OEM gate: contracts/access/reuse/licenses/cache/retention/attribution/confidence/IP/fitment responsibility |
| D-04 | Detailed Accounting functional requirements sonraki domain tasarımı | DA-ACC-007; native seçimi/integrity şimdi approved, domestic Turkish software investigation ve qualified accounting expertise review sonrası detailed behavior. MVP candidates PROPOSED |

D-01 ve D-03 içindeki DA-AUTO-004 explicit DEFERRED decisions’dır; D-02/D-04 ve connector delivery horizon notları diğer kayıtların decision enum’unu değiştirmez. Bu task bütün uygulama, ADR ve plan yazımını yetki dışı bırakır; bunlar yapılmış teslimat olarak gösterilmez.

## 11. Open decisions register

Her satır ilgili §7 record’larının open parameters alanına ek navigation’dır. Decision owner ürün sahibidir; ilgili domain/security/finance/legal expertise reviewer olabilir, kişi veya kurum seçilmemiştir. Approved invariant unresolved detail nedeniyle yeniden proposed yapılmaz.

| Ref / related records | Çözülmesi gereken karar | Review zamanı |
|---|---|---|
| O-01 / DA-ID-001–004,DA-ORG-001/003/007 | Account recovery/explicit linking, verification lifecycle outside invitation acceptance; legal Organization verification criteria/provider/documents/purchasing lifecycle. Email alone Org privilege sağlamaz | Identity/Organization contract; personal provider D-01 DEFERRED |
| O-02 / DA-ORG-002/004–008 | Store ownership/transfer/exceptions; protected Owner transfer/recovery; branch inheritance; Owner Store permissions. Multiple Owner and ordinary last-active protected Owner safeguards are resolved | İlgili ownership/security design öncesi |
| O-03 / DA-SEC-001–008 | Request-time Organization authorization contract is approved and implemented for current DogruAdres routes. Remaining: legacy endpoints, trusted background principal, lock one/all sessions, password unlock, revoke latency for sessions, job/file/export/search recheck; support/break-glass/audit surface | Bounded authorization PoC architecture/scope review öncesi; real identity technology gerekmez |
| O-04 / DA-APP-001–009 | App lists/sector taxonomy/default matrix/entitlement implementation/uninstall/historical-access rights; preference key/sync/defaults; notification read/unread/dedup/timing. Categories/initial activation/no automatic disabling/launcher independence/protected history APPROVED business rules olarak yeniden açılmaz | Foundation/app brief; advanced search scope C-05 |
| O-05 / DA-CAT-001–005 | Global/private product/Brand/normalized MPN authority, canonical link/merge; Contacts ownership; stock authority, branch permissions, reservations | Catalog/Inventory functional brief |
| O-06 / DA-MKT-002–008/010 | FX series/bid-ask, unit/quote basis, precision/rounding/markup, revision calendar, publication transaction boundaries/partial failure, stale/outage, locking/revalidation/quote TTL; history display/retention | Price/FX design ve contract review |
| O-07 / DA-MKT-009/011–013 | Buyer context/personal buyer; Store block external effects; eligible comparison basis/ties/tax/discount/promotions; Store threshold numerical basis and user preference country/currency/persistence matrices. Store commercial ownership/user preference ownership and lowest eligible price APPROVED | Buyer/commercial review; browsing country checkout destination değildir |
| O-08 / DA-FIN-001–008 | Provider/rail/refund/reconciliation/fees; commission gross base/bounds/rounding/precedence; finalized/reserve states; cutoff/exception/license/cache/fallback and A unavailable-funds handling OPEN O-22 | Scoped mandatoryTRY, Friday, A/B/C with B DEFAULT, configurable half-day default non-processing APPROVED; slider override yok |
| O-09 / DA-ACC-002–007 | Native schema/row/RLS/transaction/migration boundary, posting/correction/period/precision, accounting MVP/chart/workflows/opening/allocations/FX, activation backfill, accountant-reviewed business policies | Domestic research + accounting expertise; accounting financial PoC öncesi |
| O-10 / DA-LOY-001–011,DA-ID-005/006,DA-FIN-005 | Purchase/login clock definition/start/reset/onboarding/restoration/stale events; Golden amount/period; representative actual monthly target amounts/exact earning event/rates/discount-Kumbara/vesting/refund-dispute corrections and backdated exceptions/approvers/history access OPEN | Twelve calendar months/start/end/ZEROatT/FULL first-month target/no proration APPROVED;90/30OR and Golden separate |
| O-11 / DA-SOC-001–006 | Media types/size/file owner; moderation/review/appeal; cross-post canonical source/visibility/lifecycle, masking and indirect identifiers; configurable 500/default/counting; verification revoke impact | Meydan/reviews functional brief; exact notification/qualification timings ilgili policy |
| O-12 / DA-JOB-001–004 | Permitted index/preview fields, full-content leakage prevention, applications/attachments visibility/retention, moderation, Org eligibility; optional HR scope | Job Board bağımsız functional brief; full HR activation prerequisite değil |
| O-13 / DA-AUTO-001–006 | DA-AUTO-006 resolves Organization ownership, scoped plate/VIN uniqueness, member access/revocation, and audit attribution. Remaining: exact normalization/requiredness details, private VIN policy, quotation version/approval/expiry, fitment confidence/matching/merge; deferred provider selection/licensing D-03, future API/cache/preservation/display/redistribution/AI transfer | Vehicle implementation checkpoint and separate quotation/provider design |
| O-14 / DA-AI-001–008 | Provider/model/SDK, secret custody/KEK/rotation/restore, budget/retention/outbound terms, bounded tools, consent/delegation/expiry/MFA/high-impact list, service principal; ERP field authority/sync/cutover/reconcile | Future AI/integration pilot öncesi; BYOK kendi başına veri işleme izni değil |
| O-15 / DA-UX-001–004 | Final locale tags/fallback/translations; accessibility conformance thresholds/test matrix; chart libraries/tokens/graph types/animation/layout/module visual design OPEN | Sole MSA+RTL and helpful accessible responsive permission-preserving visual communication APPROVED; DESIGN not binding |
| O-16 / DA-DATA-001/002/005/006,DA-APP-003 | Class retention/legal holds/archive/restore/bin/purge/start/reset/backup expiry,legal deletion conflict; permanent failure-reason retention/redaction/access. Confirmed legally eligible classes için thirty-day default APPROVED C-06; exact class/legal/clock policy OPEN, no universal deadline,protected financial records destructive delete edilemez | Data lifecycle/classification review; no destructive policy implemented |
| O-17 / DA-DATA-003/004, DA-APP-007 | Baseline/ID acceptance G0-S4-C ile tamamlandı; future metadata/change control/source-evidence follow-up; future write scopes; A6 launch/order/estimates; compose.dev.yml classification conflict | G0 product-owner review ve ayrıca yetkili governance işi |

### 11.1. Confirmation-required parameters ve additional cross-conversation decisions

“Confirmation required” helper annotation’dır; decision enum’a yeni statü eklemez. PROPOSED öneri/OPEN soru, APPROVED invariant’ı zayıflatmaz.

| Ref | Açık karar / source | Korunan outcome |
|---|---|---|
| C-01 | APPROVED S/T: Friday initial schedule; preferred Google Calendar API/validated sync; selectable A previous eligible/B next eligible banking day DEFAULT/C next eligible recurring scheduled occurrence; statutory half-day default non-processing configurable | Provider/cutoff/authorized roles/fallback/A unfinalized funds handling OPEN O-22; Google event not bank closure |
| C-02 | APPROVED S/T: twelve calendar months from first day of actualT month through12thmonth end; ZERO turnover at actualT; FULL first partial-month target, NO day proration. Prior value/start/proration questions CLOSED/SUPERSEDED | Actual target amounts/earning-vesting events/discount-Kumbara/refund-dispute corrections OPEN C-03/O-10; Golden/inactivity separate |
| C-03 | Discounts/Kumbara exact representative formula,accrual/vesting/fraud/refund adjustments | VAT/shipping exclusion ve promo/cash separation approved |
| C-04 | APPROVED P/Q/S: Store commercial capabilities, user-owned preferences, authoritative source-currency distinction, initial Turkish-established seller scope mandatory TRY checkout/card charge/settlement/Store payout | O-21 initial currency CLOSED; numerical thresholds/FX arithmetic/provider/persistence operational policies OPEN O-06/07/08 |
| C-05 | DA-SEC-009/APP-009 audit fields/export/advanced search exact scope/modules/rights | Detailed targets proposed;confidentiality/isolation binding |
| C-06 | APPROVED G0-S4-C §6 eligible module bins/current-authorized restore/durable protected failures/configurable thirty-day default for confirmed legally eligible classes; former capability confirmation CLOSED/SUPERSEDED | Exact class/legal matrix/clock/restore-purge rights/auto-manual purge/backups/holds/disputes/conflicts/timezone/interrupted jobs/failure confidentiality-retention OPEN O-16; protected finance no destructive deletion |
| O-18 | CLOSED/SUPERSEDED — G0-S3-Q §6 final owner decision: sole Arabic localization Modern Standard Arabic, no dialect. Former S3-P ambiguity historical only | TR/EN/MSA +RTL APPROVED; tags/accessibility/translation tooling still O-15 OPEN |
| O-19 | DA-ORG-009 taxId duplicates scope/jurisdiction/normalization/exceptions/concurrency/correction,re-registration | Proposed unique registration;many Stores oneOrg allowed,no provider chosen |
| O-20 | Multi-application common authorized data sharing exact ownership/API/persistence/privacy contracts | Platform scope retained; Mercur accepted engine/ADRs unchanged |
| O-21 | CLOSED initial charging/settlement currency interpretation — G0-S3-S§5 mandatesTRY checkout/cardcharge/Store settlement/payout forTurkish-established seller initialscope. Internalcalculation/FX/fees/rounding/refundoperational mechanisms remainO-06/08 OPEN; futurecrossborder requiresseparateapproval | Source/list/display foreign currency not actualcharge; controlledTRY publication andsnapshotconsistency APPROVED; no universallegalban |
| O-22 | Google authenticated API coverage/horizon/classification/license/cache/billing; provider cutoff/windows/exceptions/roles; half-day setting options; stale/missing hold/fallback; A elapsed cutoff/unfinalized funds handling; schedule/policy effective changes, future uninitiated recalculation and notification timing OPEN | Friday/A/B/C+B DEFAULT/Google/half-day default non-processing configurable APPROVED; C traverses schedule occurrences, no premature funds/history rewrite/replay |

## 12. Acceptance ve verification ilkeleri

G0-S3-P ek acceptance ilkeleri: genel commission ortak gross base/no-compounding/bounds/seller breakdown; payout date authority/eligible funds/no slider postponement/PDF scope; representative net VAT-shipping exclusion/earned departure/warranty protection; taxId duplicate policy pending scope ve email-only Org purchasing denial; per-user expanded/collapsed launcher; allowed audit CSV/Excel fields; conditional class30day/restore/failure reasons. Historical S acceptance, retained approved scope:12calendar-month first-ofTmonth/end12thmonth andZEROatT turnover; Friday/nexteligible/defaultnonprocessing configurablehalfday; initial scopedmandatoryTRY charge/settlement/payout APPROVED. Full first partial-month target/no day proration APPROVED; actual target amount/earning event, discount-Kumbara, provider cutoff/FX/quoteTTL/fallback ve future fitment remain OPEN; expected unresolved numeric result invented değil. Arabic ambiguity closed: sole MSA. Q transfer tests E<T/E=T/E>T ve history-only access; EUR100/displayUSD no source mutation; calendar revision/half-day/closure cases §7’de tanımlıdır.

Historical T acceptance, retained approved scope: A/B/C distinguish preceding business day/next business day/next eligible recurring scheduled occurrence, B DEFAULT and A no unsettled funds. DA-UX-004 functional briefs assess helpful visual+exact contextual accessible representations, actual/estimated/pending/history labels and chart/tooltips/export/dataset confidentiality; no design system chosen.

Her §7 acceptance concept gelecekte onaylanacak bounded plan içinde measurable criterion, fixture ve expected result’a dönüştürülmelidir. Approval testi, implementation testi ve security proof aynı şey değildir. Bu documentation-only görevde application test/build/migration yapılmamıştır.

- Positive ve negative cases birlikte gerekir: tüm istekleri reddeden resolver başarılı security proof değildir. İki Organization, aynı kişinin farklı membership’leri, Store/branch scope ve platform role örnekleri bağımsız expected behavior ile kontrol edilir.
- Yetki UI/API/workflow/job/search/export/file üzerinden aynı scope’u korumalı; spoofed context, nested fields/count/cache ve revoked/locked/stale token yolları kapsanmalı.
- Verification state fixtures gerçek enrollment/provider yerine geçmez. İlk authorization PoC için logical synthetic state kullanılabilir; provider seçimi veya gerçek personal data entegrasyonu buradan çıkmaz. PoC kapsamı/mimari/plan ayrıca owner approval ister.
- Pricing için source currency ve seller/FX nedenleri, publication version, cart-change acceptance, historical snapshot; financial integrity için idempotency, concurrency ve correction concepts gerekir. Open rounding/rate/provider policy onaylanmadan golden expected financial result icat edilmez.
- Golden eligibility’de operational-active/performance-ineligible örneği; 90/30 OR boundaries ve ayrı clock’lar; no automatic Store closure; vested past rights korunması birlikte sınanır.
- Meydan/review masking/profile denial ve Job preview/full-content separation doğrudan API ve file/search dahil sınanır. Identity-verified kişiye unconditional permission verilmez.
- Accounting native/optional bağımsızlığı ve double-entry/immutability/correction gelecekte gerçek persistence/concurrency evidence ister. Workflow compensation otomatik single ACID veya payment reversal kanıtı değildir.
- UX acceptance TR/EN/MSA/RTL ve mixed-direction automotive identifiers/date/number/currency örneklerini içerir; accessibility conformance target ayrıca seçilir. DESIGN screenshot test sonucu sayılmaz.
- Executed verification kaydı exact source/version, fixture, result, limitation ve review reference taşımalıdır. Framework capability, mevcut health testi veya docs başlığı feature implemented işareti oluşturmaz.

## 13. Related reports, governance ve accepted ADR’ler

Araştırma linkleri historical evidence’dır; bu liste onların recommendation’larını accepted yapmaz. Exact section requirement metadata’sında yazılıdır.

- [A1](research/A1-domain-ownership-and-mercur-integration-boundaries.md) — historical research; ilgili numbered section’lar §7’de.
- [A2](research/A2-platform-core-placement-and-integration-topology.md) — historical research; ilgili numbered section’lar §7’de.
- [A3](research/A3-bigcapital-basic-accounting-feasibility.md) — historical research; ilgili numbered section’lar §7’de.
- [A3-R](research/A3-R-native-basic-accounting-reassessment.md) — historical research; ilgili numbered section’lar §7’de.
- [A4](research/A4-multi-currency-pricing-and-tcmb-exchange-rates.md) — historical research; ilgili numbered section’lar §7’de.
- [A5](research/A5-canonical-identity-organizations-and-authorization.md) — historical research; ilgili numbered section’lar §7’de.
- [A6](research/A6-development-roadmap-and-release-sequencing.md) — historical research; ilgili numbered section’lar §7’de.
- [A7](research/A7-ai-byok-and-future-oem-architecture.md) — historical research; ilgili numbered section’lar §7’de.
- [G0-1](research/G0-step-1-architecture-decisions-and-documentation-gap-audit.md) — historical research; ilgili numbered section’lar §7’de.
- [G0 Step 2](research/G0-step-2-requirements-and-decision-traceability-2026-10-10.md) — §2.2 briefing, §4 static evidence, §6 original 92 rows, §8 proposed P01–P09, §9 PoC boundaries, §10 open/deferred policies.
- [G0 Step 3-Q](research/G0-step-3-Q-business-decisions-and-calendar-feasibility-2026-10-10.md) — current decisions/calendar feasibility, archived analysis; baseline acceptance değildir.
- [G0 Step 3-S](research/G0-step-3-S-google-calendar-representative-and-try-settlement-2026-10-10.md) — currentcalendar/representative/TRY decisionevidence, archivedanalysis; baselineacceptance değil.
- [G0 Step 3-T](research/G0-step-3-T-payout-deferral-full-month-targets-and-visual-communication-2026-10-10.md) — current decisions/stale-register reconciliation, archived analysis; no baseline acceptance.
- [Research router](research/README.md) — Authority and Approval Boundaries; Research Lifecycle.

Accepted ADR’ler (dosyalarda kayıtlı tarih: 2026-10-07):

- [ADR-0001 — Mercur engine](adr/ADR-0001-mercur-as-marketplace-engine.md), Decision.
- [ADR-0002 — automotive isolation](adr/ADR-0002-automotive-domain-isolation.md), Decision.
- [ADR-0003 — core modification policy](adr/ADR-0003-mercur-core-modification-policy.md), Decision.

İlgili governance: [PRINCIPLES](PRINCIPLES.md), [ARCHITECTURE](ARCHITECTURE.md), [SECURITY](SECURITY.md), [MERCUR-INTEGRATION](MERCUR-INTEGRATION.md), [UPGRADE-POLICY](UPGRADE-POLICY.md), [ADR router](adr/README.md), [plan router](plans/README.md). [DESIGN](../../DESIGN.md) §1/2 proposed-only policy; §16/17 localization/accessibility reference; §19–22 future screen approval. Mevcut tasarım accepted UI kanıtı değildir.

Installed version-matched Mercur index: [llms.txt](../../node_modules/@mercurjs/docs/llms.txt). Framework constraint için [Store entity](../../node_modules/@mercurjs/docs/content/platform/store/concepts/store-entity.mdx) 'Store', [Offer pricing/inventory](../../node_modules/@mercurjs/docs/content/platform/offer/concepts/pricing-and-inventory.mdx) 'Offer-scoped pricing', [commission matching](../../node_modules/@mercurjs/docs/content/platform/commission/concepts/rule-matching.mdx) 'Most-specific-wins', [modules](../../node_modules/@mercurjs/docs/content/resources/best-practices/modules.mdx) 'Thin CRUD only', [module links](../../node_modules/@mercurjs/docs/content/resources/best-practices/module-links.mdx) 'Reading vs filtering across a link' ve [workflows](../../node_modules/@mercurjs/docs/content/resources/best-practices/workflows.mdx) 'One mutation per step and compensation' incelendi. Bunlar hazır DoğruAdres Organization/security/FX/Accounting uygulaması iddiası değildir. G0-S2 static source bulguları tarihsel kaynak incelemesi olarak kalır; bu görev source/runtime PoC yapmadı.

### 13.1. Installed evidence ve durable source companions — G0-S3-P

Existing seven direct node_modules links korunmuştur. Installed manifests Mercur docs/core2.3.6 ve Medusa2.21.2’dir; ignored/generated artifacts clean clone’da installation olmadan available olmayabilir. Aşağıdaki official tag-pinned source targets bu amendment sırasında okunabilir GitHub file sayfaları olarak doğrulandı. Bu erişilebilirlik compiled local artifact’la byte-equivalence, entire docs-version correspondence veya runtime implementation iddiası değildir. Source navigation runtime dependency/core modification yetkisi sağlamaz.

| Direct installed reference (all seven reviewed) | Exact local role | Durable companion / remaining portability limit |
|---|---|---|
| llms.txt | @mercurjs/docs2.3.6 index; installed package manifest repository packages/docs | Aşağıdaki official pinned code sources companion navigation; exact generated index upstream path verified değil, uydurulmadı |
| content/platform/store/concepts/store-entity.mdx | Store single settlement currency, Seller≠Organization | [Seller v2.3.6](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/modules/seller/models/seller.ts); exact local doc link korunur |
| content/platform/offer/concepts/pricing-and-inventory.mdx | Offer price/inventory local documentation; G0-S2 T04 | [Medusa cart refresh v2.21.2](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/core-flows/src/cart/workflows/refresh-cart-items.ts) related checkout companion; Offer document’ın aynı source’u olduğu iddiası değil |
| content/platform/commission/concepts/rule-matching.mdx | Commission single-winner framework constraint; G0-S2 T05 | [Commission provider v2.3.6](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/modules/commission/providers/system.ts); business independent components separate |
| content/resources/best-practices/modules.mdx | Local thin-module/transaction ownership guidance | Exact published mdx tag path verified değil;installed version/path retained, no invented official mapping |
| content/resources/best-practices/module-links.mdx | Local Query read/filter/link constraints | Exact published mdx tag path verified değil;installed version/path retained, no inferred auth/atomicity guarantee |
| content/resources/best-practices/workflows.mdx | Local compensation/orchestration guidance | [create payout v2.3.6](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/workflows/payout/workflows/create-payout.ts) concrete related workflow companion; documentation byte equivalence değil |

Security companion: [permissions middleware v2.3.6](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/api/utils/permissions-middleware.ts), G0-S2 T02’nin exact installed compiled path’i packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/utils/permissions-middleware.js, resolvePermissionsMiddleware/requirePermission; public types path aynı raporda kayıtlı. Single-currency/commission/payout/cart behavior için historical A4/A5 ve local exact sections retained. Source companions annotation’dır; official docs sitesinin current/latest sayfası version2.3.6 guarantee yerine geçirilmedi. Generated index/module/link/workflow mdx’lerinin upstream mapping’i future authorized verification’da OPEN kalır;dependency changes yapılmadı.

## 14. Change control ve approval history

| Kayıt | Kaynak / durum | Sonuç |
|---|---|---|
| Mevcut ADR-0001/0002/0003 | Dosyalarda Accepted, 2026-10-07 | Değiştirilmedi; acceptance kapsamları korunur |
| G0-S2 briefing classification | Rapor tarihi 2026-10-10; PO-* source codes | Approval history özeti; original user-message dates/permalinks yok |
| G0-S3 draft authorization / corrections | Bu görev §1/3/9; draft hazırlanma tarihi 2026-10-10 | Yalnız REQUIREMENTS.md oluşturma ve README tek link; overall acceptance yok |
| İlk REQUIREMENTS draft | DRAFT — PENDING PRODUCT-OWNER REVIEW | Ürün sahibi bütün belgeyi henüz kabul etmedi |
| G0-S3-R audit | Archived report2026-10-10;99 exact record review/F01–F22 | Audit recommendation +scope uncertainties;overall acceptance değil |
| G0-S3-P controlled amendment | Previous task §1/4/5/6/7; hazırlama tarihi2026-10-10 | Existing99 retained+10new,109 records; historical §9.5; DRAFT |
| G0-S3-Q decision/calendar reconciliation | Previous explicit owner §§3–6; hazırlama/inceleme tarihi2026-10-10 | Existing109 IDs retained, new0; §9.6 C-01/C-02/C-04/MSA; 75 APPROVED/29 PROPOSED/4 OPEN/1 DEFERRED, all NOT_ASSESSED; REQUIREMENTS +single report/index only; DRAFT |
| G0-S3-S controlled decisions | Previous owner§§3–5;2026-10-10 preparation |109IDs/new0, unchangedwhole-record75/29/4/1; clausesapproved§9.7;DRAFT/allNOT_ASSESSED; onlyrequirements+singlereport/index |
| G0-S3-T controlled amendment | Historical owner §§3–5;2026-10-10 preparation | Original109 retained+DA-UX-004,110records;76/29/4/1;allNOT_ASSESSED,DRAFT;§9.8;onlyauthorizedrequirements/report/index |
| G0-S4-C controlled baseline v1.0 | Latest explicit Product Owner instruction §§3–8; kayıt tarihi 2026-10-10 | Historical snapshot: CONTROLLED BASELINE v1.0,110 IDs/77APPROVED/28PROPOSED/3OPEN/2DEFERRED/allNOT_ASSESSED. AUTO-004 deferred, DATA-006 approved; MKT-010/LOY-008/DATA-001 remainOPEN. |
| G1 identity/Organization foundation amendment | Current explicit Product Owner instruction §§2–8 in this task; record date 2026-10-17 (not an asserted approval date) | Adds DA-AUTO-006; updates DA-ORG-004 and DA-SEC-003 to APPROVED while preserving historical baseline snapshot; current 111 IDs,80 APPROVED/26 PROPOSED/3 OPEN/2 DEFERRED. Records canonical actor mapping, invite policy, multiple/last protected Owner rules, fail-closed request scope, shared transactional audit minimum and Vehicle ownership/uniqueness/access requirements. Vehicle coding remains deferred. No permalink or prior approval date invented. |

Sonraki değişiklikte affected IDs, önce/sonra behavior/status, exact evidence, approver/reference, approved invariant vs open parameter, horizon ve implementation etkisi kaydedilmelidir. Olmayan approval date veya permalink üretilmez. Superseded kayıt korunur, replacement ilişkisi açık olur, ID reuse yapılmaz. Research evidence ve accepted ADR bytes sessizce yeniden yazılmaz.

Product-owner G0-S4-C §7 controlled acceptance §3–6 conventions, §7 records, §8 invariants ve §9–14 registers/change control için mixed-status semantics’i kabul eder. Proposed/open/deferred scopes kendi statülerinde kalır. Future changes affected scope/approval provenance ile kaydedilir; baseline provider/payment/schema/security/dependency veya bütün feature implementation için toplu yetki sayılmaz.

G0-S4-C remains the historical controlled baseline v1.0 snapshot. The G1 amendment above records only the current explicit Product Owner decisions and this bounded implementation checkpoint. It does not amend accepted ADRs, approve vehicle implementation in this checkpoint, or authorize merging/deployment.
