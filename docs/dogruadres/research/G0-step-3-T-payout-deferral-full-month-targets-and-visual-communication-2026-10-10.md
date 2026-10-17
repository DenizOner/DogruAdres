# G0 / Step 3-T — Payout Adjustment, Full First-Month Target and Visual Communication

**ARCHIVED DECISION RECONCILIATION — REQUIREMENTS REMAIN DRAFT**

Hazırlama tarihi2026-10-10; current owner G0-S3-T §§3–5 explicit provenance. Geçmiş approval date/transcript/permalink uydurulmadı. Bu rapor accepted baseline, ADR, implementation plan veya implemented feature değildir.

## 1. Yetki, kaynaklar ve başlangıç

Yalnız [REQUIREMENTS](../REQUIREMENTS.md), [research index](README.md) tek registration ve bu tek yeni report yetkili. Root [AGENTS](../../../AGENTS.md), [router](../README.md), [PRINCIPLES](../PRINCIPLES.md), [ARCHITECTURE](../ARCHITECTURE.md), [SECURITY](../SECURITY.md), [MERCUR-INTEGRATION](../MERCUR-INTEGRATION.md) ile [ADR0001](../adr/ADR-0001-mercur-as-marketplace-engine.md), [ADR0002](../adr/ADR-0002-automotive-domain-isolation.md), [ADR0003](../adr/ADR-0003-mercur-core-modification-policy.md) incelendi; yetkiye engel yok, implementation gate korunur.

Tam current draft ve [S](G0-step-3-S-google-calendar-representative-and-try-settlement-2026-10-10.md) §§2–9, [Q](G0-step-3-Q-business-decisions-and-calendar-feasibility-2026-10-10.md) §§2–10, [R](G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) §§4/7/8/9/10; [A1](A1-domain-ownership-and-mercur-integration-boundaries.md) §§7/8, [A4](A4-multi-currency-pricing-and-tcmb-exchange-rates.md) §§7/13–15, [A5](A5-canonical-identity-organizations-and-authorization.md) §§5/12, [A6](A6-development-roadmap-and-release-sequencing.md) §§6–9 incelendi. Installed Mercur llms index/payout pipeline version-matched pages read; framework default daily pipeline current weekly product policy değildir, core/provider değişikliği yok. Bu task yeni external calendar/financial research istemez; existing S official evidence restrictions aynen korunur.

Starting actual109unique IDs,75APPROVED/29PROPOSED/4OPEN/1DEFERRED, allNOT_ASSESSED, overallDRAFT doğrulandı. DA-UX-004 ve filename collision yok. Existing root governance/task highest explicit product decision precedence uygulanır.

## 2. Exact amendment/classification mapping

| Kayıt | Önce | Current documentation change |
|---|---|---|
| DA-FIN-007 | APPROVED; default next business day, no explicit three-option contract | StillAPPROVED/VERIFIED; explicit A/B/C selectable policies, BDEFAULT, C scheduled-occurrence iteration, A finalized-funds safeguard; cutoff/fallbackOPEN |
| DA-LOY-010 | APPROVED base/12calendar period; partialfirst-month targetOPEN | StillAPPROVED/VERIFIED; partial-month FULL target/no day-proration clause nowAPPROVED; numerical target/event/correctionsOPEN |
| DA-LOY-006 | APPROVED assignment/history/privacy | Narrow acceptance cross-reference full target with actualT attribution unchanged |
| DA-FIN-005 | APPROVED earned protection | Narrow acceptance cross-reference full target gives no retroactive transfer/earned rights |
| DA-UX-002 | PROPOSED accessibility standard candidate | SamePROPOSED/RECOMMENDED; explicit narrowDA-UX-004 approved visual keyboard/assistive/color-independent outcomes preserved, final conformanceOPEN |
| DA-UX-004 | Absent | NewAPPROVED/VERIFIED independent visualcommunication/comprehensibility, NOT_ASSESSED; exact design systemOPEN |

109originalIDs retained; one newID,110requirements/15domains. Current76APPROVED/29PROPOSED/4OPEN/1DEFERRED; all110NOT_ASSESSED. Fiveexisting record amendments,104originalrecord bodies unchanged. No original approved downgrade, no technicalimplementation promotion.

DA-UX-001 localization, UX002 candidateaccessibility, UX003 DESIGNproposal boundary do not independently capture complexinformation comprehensibility; UX004 justified, no artificial duplicate dashboard requirements. Current stats addUXdomain1 (UX4), allotherdomaincounts unchanged.

Updated glossary/provenance, invariants, stats§9.4, historical annotation§9.7/current§9.8, §11 current registers, §12 acceptance/brief principles, §13report and §14history. Baseline remains pendingownerreview.

## 3. C-01 — Three selectable payout adjustment policies

Platform authorized management owns payout schedule; initialFriday. Adjustment concerns an original ineligible scheduled date, not seller slider date choices.

| Option | Approved semantics | Safeguard |
|---|---|---|
| A previous eligible | Nearest preceding eligible banking business day | Calendar/statutory/halfday/provider restrictions and eligiblefinalizedfunds availability; no settled-date shortcut for unsettledfunds |
| B next eligible — DEFAULT | Earliest eligible banking business day after originaldate | Same validated processing constraints; not arrivalguarantee |
| C next scheduled | Next eligible occurrence of configured recurring payout schedule | Ineligible nextscheduledoccurrence→evaluate subsequentoccurrences; not simply nextbusinessday |

Synthetic calendar fixture (not actual Turkish holiday assertion): originalFriday2026-10-16ineligible; ThursdayOct15eligible; MondayOct19eligible; nextscheduledFridayOct23eligible. Funds available/finalized and usable provider windows assumed for positivefixture.

- A→Oct15, only if authorized computation/processing feasible and finalizedfunds available.
- BDEFAULT→Oct19.
- C→Oct23, even thoughOct19isbankingeligible.
- IfOct23alsoineligible, C→Oct30ifvalidscheduledoccurrence; skipsOct19andothernonscheduledweekdays.
- A withpendingfunds or precedingdate/cutoffalreadyelapsed must not initiate premature/retroactivepayment. Reject/hold/alternativepolicy behavior is OPEN; no automaticswitchtoB invented.
- C evaluated conceptually against recurring occurrences, not hardcoded seven-day arithmetic; future nonweeklyfrequency notapproved/implemented.
- No eligible occurrence insidevalidatedhorizon or stale/missingcalendar: safe operational fallbackOPEN; never infer noclosures/infinitepaymentpromise.

Preserved: preferredGoogleAPI, observance≠closure, halfdaydefaultnonprocessing/configurableauthorizedsetting, provider/bankvalidation, seller effectivepolicy date, onlyfinalizedfunds, no slideroverride, audit calendar/schedule/policychanges, no initiated/completedrewrite/replay. Credential/auth/provider/scheduler notselected.

OPEN parameters: authorizedconfigurationroles/effectivetiming, cutoff/rail/provider, reserves/finalization event, A unfinalizedfunds handling and fallback, finitehorizon/missingdataresponse, in-flightcorrection/notificationtiming, licenses/cache/syncmechanisms. Threeoptions+Bdefault businessrules notOPEN.

## 4. C-02 — Full target for first partial calendar month

May20,2026actualauthorizedtransferT:

| Concept | Currentapprovedoutcome |
|---|---|
| Calendarperiodstart | May1,2026 |
| Actualassignment/turnoverstart | May20actualT; qualifyingturnoverZERO |
| BeforeTtransactions | No newrepturnover/credit |
| Firstmonthcompletion | May31,2026 |
| Firstmonthtarget | FULL monthlytarget; no tenure-days factor |
| Twelvecalendar-monthend | Apr30,2027 unless separatelyapprovedearliertermination |

HypotheticaltargetTRY100000 remainsTRY100000 forMay20–31, not100000×12/31 or anyotherdaybasedproration. Amountillustrative only; no actualtargetvalueapproved. Late-monthassignment also usesfulltarget; no preTturnover addedto compensate.

FormerrepNEWaccrualendsT; vestedpastprotected/no retroactive transfer/nooverlap. NewrepturnoverboundaryactualT remainsdistinctfromcalendarstart. LostCustomershistoricalportfolio/repeatedtransfers/reacquisition/privacy preserved; targetvisualdoesnot authorizecurrentprivatecustomeraccess.

DA-LOY-010 acceptanceD nowfulltarget; openparameter/prorationremoved. C-02/O-10 currentrows no partialtargetvotingquestion. HistoricalSreports/§9.7 showthenOPEN withexplicitTsupersession.

StillOPEN: numericalmonthlytarget, exactqualifying/earned/vestingevent, rates/bonusthresholds, discount/Kumbaramathematics, refunds/disputes/accrual/vesting, backdating/correction/timezone. Generalmarketplacegrosscommission, GoldenOrgperformance,90purchase-dayOR30humanOrg-login-day inactivity unaffected/separate.

## 5. Visual communication — DA-UX-004

Currentowner§5 approves product outcome: graphics/visualexplanations/comparisons/contextualtext where they materially improvecomplexunderstanding. No chart-per-screen/decorativevisual mandate; exacttext/amounts/definitions retained.

Acceptance concepts:

- Payouttimeline distinguishes scheduled,pending,initiated,completed,historical; exactamount/date/policydefinitions besidevisual.
- RepresentativeperiodMay1–Apr30 vsactualMay20Tturnover boundary vsfullfirstmonthtarget distinct; no misleadingprogressorunsupportedforecast.
- SourceEUR/displayUSD/finalactualTRY andcommissioncomponents clearlylabelled; no displayFX rewriteofhistoricalsnapshot.
- Essentialmeaning remainsavailablewithoutcolor/images; keyboard/assistiveequivalent andresponsiveTR/EN/soleMSA+RTL.
- Graph/tooltip/export/dataset/count preservesauthorizedOrganization/privatefinancialscope, includingrevokedpermissions; visualsummarynotpermissionbypass.
- Chooseconcisetextwhenvisualnothelpful; scale/state/estimate labels honest andexactfiguresavailable.

Illustrativecandidates: commissions,pricing/FXhistory,payouttimeline,representativeportfolio/targets, Loyalty/Kumbara, optionalAccounting/cashflow/reconciliation. These do notauthorize dashboards, accountingforecastmodels or releasedscreens. Chartlibraries/tokens/graph types/animations/layouts/finalconformancethresholds remainOPEN. DESIGN.md unchanged/notpromoted. ProductnormativeoutcomesAPPROVED, implementationNOT_ASSESSED.

## 6. Historical vs current register repair

Inspectionfoundactual§11.1rows still:
- C-01 Friday/holiday asrecommendation.
- C-02 twelve-month asproposed/startunresolved.
- C-04 capabilitiesasproposed/historicalscopeuncertain.

These contradictedapprovedS/Qrecordtext. Current§11.1 updatedusingsection-bounded matching sohistoricalC-labelledtablerows were notaccidentallysubstituted. History§9.5–9.7 andpriorreports retainedwithas-ofannotations; §9.8currentauthoritydispositionadded.

CurrentC-01Friday/Google/A-B-C/Bdefault/halfdayconfigAPPROVED, operationaldetailsOPEN. C-02ordinary12months/start/end/ZEROatT/fulltargetAPPROVED, earning/corrections/amountsOPEN. C-04Storecommercial/userpreferences/sourcecurrency/initialTurkeymandatoryTRYAPPROVED, FX/providerarithmeticOPEN. O-21initialcurrencyclosed; O-18soleMSAclosed; DA-ID-004identityproviderDEFERRED. No reopenedidentitytechnologyorArabictarget.

## 7. Verification and integrity

Başlangıç/finalGitstatus aynı:

```text
 M docs/dogruadres/README.md
?? .vscode/
?? DESIGN.md
?? docs/dogruadres/REQUIREMENTS.md
?? docs/dogruadres/research/
```

Untrackedfiles için Gitstatus/diff alone içerikkanıtı değildir.469existing tracked/untracked nonignored files başlangıçSHA256 memorymanifest alındı. Delta yalnız REQUIREMENTS ve researchREADME, newfile yalnız bu rapor; deletion0.467protected files including14priorresearchreports/acceptedADRs byte-identical, .vscode/DESIGN/preexistingparentREADME preserved. Index exactlyonenewregistrationrow.

REQUIREMENTS SHA256 before `d80b5bfa8468fd0eee7e6f4d500c8d10d01b34390c254fadefea98ca57fccdd8`; after `2cb75eab3533e3c25832f4a8310d64583da8bd83c837b7327745bf5dc55a5fe9`,241655bytes. Index before `37e2532ea3bc036d19c779195267ff2440793a242c9a60edf7a7ea0dd4f5442b`; after `658ca04e5a89a8ccfee1084f60c99a7fd69a9ea65ef30ccd44bbf6e28675c0f3`.

Actual110records/110uniqueID/110matchingexplicitanchors, original109present, newUX004only.76APPROVED/29PROPOSED/4OPEN/1DEFERRED; allNOT_ASSESSED.104originalrecords unchanged, fiveexistingamended. IdentityDA-ID-004, mandatoryTRYDA-FIN-002, soleMSADA-UX-001 records exactunchanged. No originalwhole-record statuspromotion/downgrade; clauselevel decisions as§2. DRAFT verified.

Markdownrelativepath/fragment/table/fence/whitespace checks: REQUIREMENTS339links/110anchors,index16links,report18links,total373; zeroerrors. git diff --check exit0 pluscustomuntrackedchecks. No applicationtest/build.

Documentationfixture validation: AOct15/BDEFAULT Oct19/COct23, CclosedOct23→eligibleOct30; noCnextMondayshortcut. PositiveAassumesfinalizedfunds/validcutoff; negativependingfunds/elapseddate forbidsinitiation, exactfallbackOPEN. Halfdaydefault/configurability andGooglepreferred unchanged. May20Ttarget100000→100000not×12/31, actualTzero/preTdenied/May31monthcomplete/endApr30 preserved; targetamount synthetic. Visualcommunicationapproved notdesignimplementation. §11.1 actualC-01/C-02/C-04 currentrows checkedsection-bounded; prorationnotcurrentOPEN. Historicalopenstates deliberatelyretained§9historyonly.


Onlydocumentationwork. No code/ADR/implementationplan, Googleconfiguration/credentials/providerselection, builds/applicationtests/migrations/seeds/dependencies, staging/commit/reset/restore/clean/stash. **DRAFT — PENDING PRODUCT-OWNER REVIEW**; stopandawaitownerreview.
