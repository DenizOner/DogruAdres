# G0 / Step 3-S — Google Calendar, Representative Period and TRY Transactions

**ARCHIVED DECISION RECONCILIATION — REQUIREMENTS REMAIN DRAFT**

Hazırlama/inceleme tarihi: 2026-10-10. Current product-owner G0-S3-S §§3–5 explicit approval provenance’dır; geçmiş transcript/permalink veya approval date uydurulmadı. Bu rapor baseline acceptance, ADR, implementation plan veya service integration değildir.

## 1. Yetki ve kaynak incelemesi

Yalnız [REQUIREMENTS](../REQUIREMENTS.md), [research index](README.md) tek registration ve bu tek yeni report yazıldı. Root [AGENTS](../../../AGENTS.md), [router](../README.md), [PRINCIPLES](../PRINCIPLES.md), [ARCHITECTURE](../ARCHITECTURE.md), [SECURITY](../SECURITY.md), [MERCUR-INTEGRATION](../MERCUR-INTEGRATION.md) ve accepted ADR-0001/0002/0003 korunur.

109-record draft tam okundu; [G0-S3-Q](G0-step-3-Q-business-decisions-and-calendar-feasibility-2026-10-10.md) §§2–10; [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§3/6/7/13–15; [A5](A5-canonical-identity-organizations-and-authorization.md) §§5/12; [A6](A6-development-roadmap-and-release-sequencing.md) §§6–9; [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§7/8 ve [A2](A2-platform-core-placement-and-integration-topology.md) §7 financial/representative context incelendi. Research recommendations current explicit owner kararları değildir; eski raporlar immutable evidence olarak kaldı.

Installed Mercur index, Store entity, Offer pricing/inventory ve payout pipeline/data models version-matched pages incelendi. Resmî pinned source references: [Mercur seller v2.3.6](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/modules/seller/models/seller.ts), [create payout v2.3.6](https://github.com/mercurjs/mercur/blob/v2.3.6/packages/core/src/workflows/payout/workflows/create-payout.ts), [Medusa refresh cart v2.21.2](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/core-flows/src/cart/workflows/refresh-cart-items.ts). Seller currency field/single settlement currency source-price currencies ile aynı kavram değildir. Existing payout workflow/provider capability bizim Friday calendar veya TRY financial policy’mizin implemented kanıtı değildir. Bundled daily scheduling illustration current approved weekly business rule yerine geçirilmedi; scheduled jobs project integration scope gerektirir. Mercur core değiştirilmedi; provider seçilmedi.

## 2. Karar ve kayıt haritası

| Karar | Amended requirement IDs | Clause-level status change |
|---|---|---|
| C-01 | DA-FIN-007 | Google selected preferred holiday source; automated sync; Friday/next eligible day defaults; half-day default non-processing/configurable; validated internal calendar needs APPROVED |
| C-02 | DA-LOY-010/006, DA-FIN-005 | Historical/proposed twelve months and OPEN ordinary start/end now APPROVED12-calendar-month first-of-effective-month rule, ZERO-atactualT turnover; past rights retained |
| C-04 | DA-FIN-002, DA-MKT-002/003/006/007/008/012/013, DA-UX-001 | TRY preference/OPEN initial charge interpretation now APPROVED mandatory scoped TRY checkout/card charge, settlement/payout; seven layers/consistency/visible accepted finalTRY |

13existing records updated, new ID0; all109 IDs retained/unique. Whole-record statuses unchanged:75 APPROVED,29 PROPOSED,4 OPEN,1 DEFERRED; all NOT_ASSESSED. APPROVED records’ unresolved technical choices not promoted. §§3/6 glossary/provenance, §8 invariants, §9.4 statistics/§9.6 historical annotation/new§9.7, §11 C-01/02/04/O-08/10/21/22, §12 acceptance, §13 sources and §14 history reconciled.

## 3. Google ID verification and public evidence

Candidate: `tr.turkish#holiday@group.v.calendar.google.com`.

Authorized read-only public HTTP checks used no credentials, personal calendars, account session, OAuth, API key or Cloud configuration:

| Probe | Observed result | What it proves |
|---|---|---|
| [Public ICS](https://calendar.google.com/calendar/ical/tr.turkish%23holiday%40group.v.calendar.google.com/public/basic.ics) | HTTP200, text/calendar; Türkiye holiday/observance metadata | Candidate ID currently has a reachable public calendar publication |
| [Identityless events.list](https://www.googleapis.com/calendar/v3/calendars/tr.turkish%23holiday%40group.v.calendar.google.com/events?timeMin=2026-01-01T00%3A00%3A00%2B03%3A00&timeMax=2027-01-01T00%3A00%3A00%2B03%3A00&maxResults=10) | HTTP403 PERMISSION_DENIED, unregistered caller | Consumer identity required; not authenticated events.list success, not proof ID unavailable |

ICS snapshot decoded text SHA256: `f4f1e2ea7a11602578215175a642b2cc49abef38d5c9ba166c1f11a2b708f45e`. In-memory only, no downloaded artifact written.230 VEVENT records, observed dates2021-01-01–2031-12-31;21events2026. This is observed snapshot coverage, not permanent supported horizon/SLA. Every observed DTSTART/DTEND was date-only, no timed start; half-day events also span one all-day interval. Metadata timezoneUTC does not mean statutory Turkish half-day begins midnightUTC.

Observed2026 examples: March19 half-day eve; March20–22 Ramadan holiday; May26 half-day eve/May27–30 Kurban; Oct28 half-day eve. Nov10 and Dec31 observances also present. Description text distinguishes public/observance/half-day in this language snapshot, but localized text is not a stable typed legal/banking classification contract. TRANSP:TRANSPARENT appears on holidays too; free/busy is not banking eligibility.

**Additional discrepancy:** Google snapshot contains May25,2026 “Sacrifice Feast Holiday” labelled public holiday, whereas official Diyanet annual table starts Kurban eveMay26 and holidayMay27. It cannot be accepted as statutory closure without separate official/provider exceptional-closure evidence. This task did not resolve its origin or claim a governmental bank closure. Preferred Google selection remains approved, validation/corrections requirement addresses the discrepancy.

Operational status: public calendar publication VERIFIED; authenticated events.list access **UNVERIFIED**. No credential was requested/created. Public ICS check is evidence only, not approval to replace selected Calendar API with an ICS adapter.

## 4. Google Calendar API feasibility

[Overview](https://developers.google.com/workspace/calendar/api/guides/overview) defines REST events/calendars; private user calendars are not a product need for this public-holiday use case.

[events.list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list): authorization optional for readable public resources, caller identity still required. Supports calendarId, RFC3339 timeMin/end-bound and timeMax/start-bound, timezone, recurring expansion, pagination (default250/max2500), page/sync tokens and cancellations. Tokens require stable query parameters; timeMin/timeMax cannot accompany syncToken. Authenticated target behavior was not exercised.

[Credentials guidance](https://support.google.com/googleapi/answer/6158857?hl=en) explicitly permits API key for server access to public calendar data without user consent; OAuth access token is alternative caller identity and needed for authorized private user-data scenarios. End-user personal OAuth consent/private calendar subscription is not inherently required. Deployed auth/key restrictions are future implementation/security decisions; no secrets touched.

[Event resource](https://developers.google.com/workspace/calendar/api/v3/reference/events) includes id,etag,updated,status,summary,description,start/end date or dateTime/timeZone,recurrence and eventType. End exclusive; all-day date interval is not statutory processing interval. eventType values do not encode “Turkish statutory half-day” or “bank closed.” Custom/extended properties cannot be assumed populated by Google holiday feed.

[Google Holiday Help](https://support.google.com/calendar/answer/13748345?hl=en) confirms default public holidays plus observances, optional religious selections and regularly updated third-party data. UI display settings are not a verified API public-feed filter. Events must be legally classified and validated, not blanket converted to closures.

[Incremental sync](https://developers.google.com/workspace/calendar/api/guides/sync) supports full then incremental retrieval, pagination and expired-token410/full-resync handling. Sync state reset must not delete protected internal historical payout decisions. Date-range horizon/refresh/versioning and corrected events require separate design.

[Usage limits](https://developers.google.com/workspace/calendar/api/guides/quota), reviewed2026-10-10: new projects subject to May1,2026 quota model;10,000requests/min/project,600/min/user/project; daily billing threshold1,000,000requests/project. Below threshold no extra charge; full billing details announced later2026 with≥90days notice. Older active projects may retain quotas. “Always free/unlimited” assumption rejected; no project-specific quota/billing verified, infrastructure costs separate. No purchase/Cloud configuration.

[Errors](https://developers.google.com/workspace/calendar/api/guides/errors): auth/access/not-found/quota/transient/token errors need explicit handling.403 may mean caller identity/permission/quota depending reason;404 cannot safely mean no holidays;410 is sync invalidation, not instruction to erase internal decision history. Exact retry/cache technology and outage hold/fallback policy OPEN.

[Google APIs terms §§5/6](https://developers.google.com/terms) distinguish third-party content rights from access; restrict permanent copies/databases/caching beyond headers and derivative/distribution unless permitted by content owner/law; require applicable attribution. General business access is not blanket permanent reuse permission. Commercial holiday reuse/cache and historical-derived evidence rights need license review; no fixed safe TTL invented. Developers documentation CC license is not holiday dataset license. Internal preserved financial decisions must remain auditable while raw external-event retention follows lawful licensed terms. Preferred source selection is not proof unlimited storage rights.

## 5. Turkish legal/banking vs platform policy

[Official2429 hosted text](https://vakithesaplama.diyanet.gov.tr/2429_kanun.php) defines Ramadan/Kurban eve and Oct28 holiday commencement13:00. [Diyanet2026 table](https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=158) explicitly distinguishes half-days; page title stale2023 while body2026, so year must be validated. [Diyanet religious dates2026](https://vakithesaplama.diyanet.gov.tr/dinigunler.php?yil=2026) is corroboration, not every observance bank closure.

[TCMB systems](https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB%20TR/Main%20Menu/Temel%20Faaliyetler/Odeme%20Sistemleri/Turkiyedeki%20Odeme%20Sistemleri/Elektronik%20Fon%20Transfer%20%28EFT%29%20Sistemi): ordinary weekday08:30–17:30 except holidays, half-days to13:00; hours can vary. FAST separate7/24 does not define selected merchant payout contract or override platform default. Initiation does not guarantee seller funds arrival.

Approved six-way calendar separation: Google event; official public holiday; statutory half-day; banking windows; provider cutoff; platform configurable policy. Half-day **default fully non-processing for payout policy** even if bank open morning; configuration can permit otherwise only with validated processing constraints. No platform setting manufactures provider availability.

Internal policy must support automatic sync, authorized corrections/exceptions, deterministic next-eligible-date computation, half-day configuration, source+policy provenance, safe stale/missing handling and historical decisions. Future uninitiated payouts consistently/auditably recalculated; seller displayed date reflects effective validated policy. Specific adapter/database/cache/retry/outbox or approvals implementation remains OPEN. Google unavailable/missing horizon/error must not be treated as an empty holiday calendar; exact safe hold/last-approved fallback selection remains OPEN.

Acceptance examples: default Oct28 half-day is ineligible; change of setting does not waive actual bank/provider cutoff. Friday2026-03-20 full holiday rolls conditionally to MondayMarch23 if validated provider calendar has no other closure; no arrival SLA promised. Google observanceNov10 alone not closure. UnverifiedMay25 extra event requires correction/review. Calendar updates affect future uninitiated dates with version/history; initiated transfer is not automatically replayed.

## 6. Representative calendar period vs qualifying turnover

T actual authorized assignment timestamp; S first calendar date of T month; E unresolved business/financial qualifying/earned event. APPROVED period includes12calendar months from S through last day12thmonth. Actual transfer startsT, notS.

| May20,2026 transfer | Expected result |
|---|---|
| Calendar start | May1,2026 |
| First month completion | May31,2026, despite partial tenure |
| Final month/end | April2027 / April30,2027 |
| New qualifying turnover | ZERO at actual May20T |
| Business beforeT | Does not count to new turnover/earning target |
| Qualifying E=T or afterT | New assignment scope only, subject to earning eligibility |
| Old earned/vested entries | Remain old rights, no transfer/retroactive award |

`calendar_period_start != qualifying_turnover_start` for mid-month assignments. New rep does not inherit old remaining term; own assignment/reassignment calendar rule applies. Further transfer cuts old NEW accrual immediately. Lost Customers history/transfer timestamps/no duplicates/reacquisition and historical-only authorization remain DA-LOY-006. No current private customer contacts/operations/financial/future purchases granted from historical relationship.

Additional documentation fixtures: first-of-month assignment coincidentS/T; last-day assignment still firstmonth completes same day; December assignment crosses year; February/leap-year uses calendar months, not365days. Date arithmetic reviewed as documentation checks; no application tests.

OPEN: first partial target full vs prorated; actual earned/qualified event order/payment/delivery; rates/bonuses/discounts/Kumbara/refund/dispute/accrual/vesting; governing timezone; exceptional backdated assignments/corrections. Approved ordinary period start/end/ZEROatT cannot be labelled proposed. Golden qualification and DA-LOY-00390purchase-days OR30humanOrganization-login-days are separate and unchanged.

## 7. Mandatory initial TRY contract and consistency

Initial marketplace Turkish-established seller Organization scope only: actual checkout/card chargeTRY, marketplace settlementTRY, independent Store payoutTRY. This is current product policy, not universal Turkish law prohibiting foreign transactions. Cross-border models need separate owner approval; payment provider still not selected.

| Layer | Required meaning |
|---|---|
| Source/list price | Original amount+currency authoritative, supported foreign currencies allowed, sameStore mixed currencies |
| Internal calculation | Authoritative price/FX calculations, parameters OPEN |
| VersionedTRY publication | Controlled calculatedTRY projection, source preserved |
| Optional display | Personal user equivalent currency, no source mutation/seller repricing |
| Checkout/payment | Final accepted and actual chargedTRY |
| Settlement/Store payout | TRY; independent Store financial state remains |
| Historical snapshot | Original price/rates/versions/taxes/accepted and actual chargedTRY, protected evidence |

EUR100 source/userdisplayUSD120 illustrative: USD120 is not live approved FX. Buyer clearly sees nonTRY display equivalent versus final acceptedTRY; card charged acceptedTRY, seller payoutTRY. Display/language/browsing-country user-owned; actual shipping destination/eligibility independent.

Approved coherence source→conversion→publishedTRY→display equivalent→acceptedTRY→actual chargedTRY→snapshot. Unrelated rate-version chaining must not create inconsistent amounts. This does not necessarily mandate every display and payment rate field identical: exact coherent conversion policy remains OPEN, but provenance and accepted/charged consistency binding. Changed payableTRY requires price notification/reacceptance; stale acceptance cannot authorize a new amount. Later displayFX/repricing cannot rewrite historical snapshot.

O-21 initial currency interpretation CLOSED; provider/rate/quote basis/bid-ask/markup/rounding/expiry/locking/fees/refund operational choices O-06/O-08 OPEN. Tax amounts/formula not invented; snapshot preserves applied transaction evidence, accounting workflows not designed.

## 8. Current authority vs historical report

Q’s no preferredAPI, half-day policyOPEN, twelve-month starting confirmation and TRY preference/charge ambiguity are historical as-ofQ; S explicit decisions supersede only those parts. Q and earlier report bytes unchanged. REQUIREMENTS historical§9.6 annotated, current§9.7/§7/§11 consistent. Existing MSA-only+RTL, identity-providerDEFERRED, native optionalAccounting, fail-closed authorization, Golden/centralLoyalty, commission composition, Meydan/Job gates, AI/OEM optionality and Mercur accepted ADRs unchanged.

Review remaining: DA-FIN-007/O-22 API authenticated operational coverage/licensing/cutoff/fallback/override policy; DA-LOY-010/C-02/C-03 exactearningevent/proration/adjustments; DA-FIN-002/O-06/O-08 FX/provider operational details. These are not renewed votes on approved business defaults.

## 9. Integrity and validation

Başlangıç ve son grouped Git status birebir aynı:

```text
 M docs/dogruadres/README.md
?? .vscode/
?? DESIGN.md
?? docs/dogruadres/REQUIREMENTS.md
?? docs/dogruadres/research/
```

Untracked REQUIREMENTS/research nedeniyle status alone içerik delta kanıtı değildir. Başlangıç468 tracked/untracked nonignored file SHA256 memory manifest ile karşılaştırıldı: existing changes yalnız REQUIREMENTS ve research/README; new file yalnız bu rapor, deletion0.466 protected existing files,13 prior archived reports ve accepted ADRs byte-identical; preexisting parentREADME/.vscode/DESIGN preserved. Index delta exactly one row.

REQUIREMENTS SHA256 before `4b808e249597c3d85363ae5b31d182f491d3e61d285eb63c3bef43fdbfbb6e2c`, after `d80b5bfa8468fd0eee7e6f4d500c8d10d01b34390c254fadefea98ca57fccdd8`;228,820bytes. Index before `b8368f86a09ecae030c9d5b3f02545f4f080cab36a3a041d9f9ddcabc9fc829e`, after `37e2532ea3bc036d19c779195267ff2440793a242c9a60edf7a7ea0dd4f5442b`.

Actual109 records/109unique explicit anchors; all previous109 present/new0;13 amended/96 untouched bodies. Status distribution75APPROVED/29PROPOSED/4OPEN/1DEFERRED, allNOT_ASSESSED; no whole-record status change/downgrade. IdentityDA-ID-004 DEFERRED and soleMSA/RTL preserved. C-01/C-02/C-04 approved clauses and old historical-as-ofQ questions distinctly recorded; current C-01/02/04 and O-21 register rows corrected, O-22 operational limitations retained.

Three-document Markdown link/anchor/table/fence/trailing-space checks passed: REQUIREMENTS333links/109anchors; index15links; report32links, total380links. Relative targets/fragments resolved; external official sources accessed except operational targetevents.list403 deliberately documented. No claim all APIlinks succeed or credentials tested. git diff --check exit0; custom untracked Markdown checks additionally cover files git diff cannot see.

Documentation date arithmetic fixtures: May20,2026→May1,2026–Apr30,2027/firstmonthMay31; Dec31,2026→Dec1,2026–Nov30,2027; Feb29,2028→Feb1,2028–Jan31,2029; May1assignment same period. Calendar calculation uses12months, no365day shortcut. No application test run. BeforeT turnover denial/atTzero/no old-new overlap/historical-only permissions/TRYaccepted-vsactual/source-preserved snapshots/defaulthalfday business scenarios text-reviewed; implementation not assessed.


Overall **DRAFT — PENDING PRODUCT-OWNER REVIEW**. No application code, builds/tests/migrations/dependencies, personal Google data, credentials, Cloud setup, payment-provider selection, ADR, staging or commit. Stop for explicit product-owner review.
