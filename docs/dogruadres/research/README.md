# DoğruAdres Research Archive

## Purpose and Scope

This directory preserves original research evidence, architectural feasibility studies, comparisons, limitations, and historical Agent findings for DoğruAdres. Reports remain independent documents, including initial assessments and later reassessments. This index provides navigation; it does not replace or shorten the full reports.

## Authority and Approval Boundaries

- Archived research is not automatically approved product policy.
- Agent recommendations are not automatically accepted architecture decisions.
- Research evidence does not prove that functionality was implemented.
- Approved requirements belong in the designated requirements documentation; this archive does not designate or create a new requirements document.
- Accepted architectural decisions belong in ADRs.
- Verified implemented architecture belongs in `CODEBASE.md`, when that document exists.
- Conflicts between research, approved requirements, accepted decisions, framework constraints, or implementation evidence must be escalated to the product owner rather than silently resolved.

Archive organization approval does not approve the reports' technical recommendations. Keep research findings, recommendations, approved requirements, accepted decisions, verified implementation facts, and unverified assumptions distinct. Follow root `AGENTS.md` and the applicable documentation authority hierarchy.

## Research Report Index

All entries below have **Archived research** status. The order groups related research stages; it is not a claim of exact chronology. “Not specified” means the original report does not state its date. File save times and referenced source commit dates are not report dates.

| Research ID | Document title | Relative Markdown link | Subject | Report date | Relationship to earlier reports | Important evidence limitations |
|---|---|---|---|---|---|---|
| A1 | Domain Ownership and Mercur Integration Boundaries | [Full report](./A1-domain-ownership-and-mercur-integration-boundaries.md) | Domain ownership, Organization–Seller distinctions, relationships and extension boundaries | Not specified | Establishes boundaries subsequently explored in A2 | Local version/source inspection; no live database or runtime verification. Conversation export includes tool calls without their complete outputs. |
| A2 | Platform Core Placement and Integration Topology | [Full report](./A2-platform-core-placement-and-integration-topology.md) | Selective hybrid, modular monolith, ownership and consistency boundaries | Not specified | Develops A1; identifies questions for accounting, currency, identity and release research | Placement recommendation was not implemented or accepted merely by publication. Workflow compensation is not proof of a single ACID transaction; runtime integration was not tested. |
| A3 | Bigcapital / Basic Accounting Feasibility | [Full report](./A3-bigcapital-basic-accounting-feasibility.md) | External accounting service, licensing, tenant lifecycle, identity and reconciliation | Not specified | Explores accounting after A2; read alongside A3-R | Conditional preference for separate Bigcapital service. Source commit inspection is not deployment proof; licensing, provisioning, SSO and idempotency questions remain. Referenced commit date is not the report date. |
| A3-R | Native Basic Accounting Reassessment | [Full report](./A3-R-native-basic-accounting-reassessment.md) | Narrow native TypeScript/PostgreSQL accounting, double-entry, atomicity and tenancy | 2026-10-10 | Reassesses A3 and recommends a different direction; both reports are preserved | Full A3 text was unavailable during that reassessment. Native accounting preference does not establish approval or automatically supersede A3 as policy. Financial, concurrency and persistence PoCs were not run. |
| A4 | Multi-Currency Pricing and TCMB Exchange Rates | [Full report](./A4-multi-currency-pricing-and-tcmb-exchange-rates.md) | Source-currency ownership, TRY publication, FX history, checkout and refunds | 2026-10-09 | Extends A1/A2 context into pricing; informs later security and release work | Earlier full reports were unavailable during the original audit. Limited TCMB samples do not prove complete historical coverage; current EVDS contract and end-to-end pricing/checkout behavior were not fully verified. |
| A5 | Canonical Identity, Organizations and Authorization | [Full report](./A5-canonical-identity-organizations-and-authorization.md) | Canonical person, memberships, Owner protection, authorization, invitations and revocation | Not specified | Develops earlier ownership and integration directions; foundation for A6/A7 | Earlier reports were used through user-provided context. Source inspection is not runtime security proof; endpoint bypass coverage, revocation and proposed identity architecture require separate approval and validation. |
| A6 | Development Roadmap and Release Sequencing | [Full report](./A6-development-roadmap-and-release-sequencing.md) | Safe foundations, marketplace release, vertical slices and acceptance gates | Not specified | Synthesizes A1–A5 and A3-R context into a proposed sequence | Prior full reports were unavailable during that audit. This is a planning recommendation, not an approved implementation plan, measured estimate or delivery commitment. |
| A7 | AI/BYOK and Future OEM Architecture | [Full report](./A7-ai-byok-and-future-oem-architecture.md) | Organization-scoped AI, provider adapters, delegation, approval and future OEM/VIN | 2026-10-10 | Builds on A5 security and A6 sequencing directions | Earlier full reports were unavailable during that audit. No real AI/OEM integration or PoC was executed; provider terms and OEM access/licensing require later verification. |
| G0 / Step 1 | Architecture Decisions and Documentation Gap Audit | [Full report](./G0-step-1-architecture-decisions-and-documentation-gap-audit.md) | Governance gaps, requirements/ADR approval traces and security PoC readiness | Not specified | Reviews documentation and approval evidence for A1–A7 directions | Full earlier reports and approval traces were unavailable at the time. Their present archival availability does not establish approval. This document covers G0 Step 1, not every possible G0 stage. |
| G0 / Step 2 | Requirements and Architecture Decision Traceability | [Full report](./G0-step-2-requirements-and-decision-traceability-2026-10-10.md) | Governance reconciliation, 92 provisional requirements, owner decisions, ADR prerequisites and deferred policies | 2026-10-10 | Reads all nine archived reports and reconciles G0 Step 1 with the current product-owner briefing | Archived research proposal; chat-provided approvals are not implementation evidence. No authoritative documents or software were changed; provider and policy decisions remain deferred/open. |
| G0 / Step 3-R | Requirements Coverage and Approval Classification Audit | [Full report](./G0-step-3-R-requirements-coverage-and-approval-audit-2026-10-10.md) | Targeted audit of all 99 draft requirements, relayed approved business rules, gaps, classifications and proposed documentation amendments | 2026-10-10 | Reviews G0 Step 3 draft against A1–A7, A3-R, G0 Step 1/2 and current owner briefing | Requirements remain DRAFT and unchanged; original conversation approval scope, Friday default, representative calculation and conditional recycle-bin details require confirmation. No implementation or acceptance. |
| G0 / Step 3-Q | Business Decisions and Calendar Feasibility | [Full report](./G0-step-3-Q-business-decisions-and-calendar-feasibility-2026-10-10.md) | Current owner C-01 calendar preferences, C-02 transfer cutoff/Lost Customers, C-04 user preference/source-price ownership, MSA-only scope | 2026-10-10 | Reconciles the109-record S3-P draft and supersedes specified S3-R/S3-P confirmation questions; historical reports unchanged | REQUIREMENTS remain DRAFT; no API/payment provider chosen. Banking half-days/cutoffs, earning-event/new period and charging/settlement contracts OPEN. Former Arabic-variant ambiguity is historical; sole current target MSA +RTL. |
| G0 / Step 3-S | Google Calendar, Representative Period and TRY Transactions | [Full report](./G0-step-3-S-google-calendar-representative-and-try-settlement-2026-10-10.md) | Preferred Google holiday source/default payout calendar, approved twelve-calendar-month period vs turnover at transfer, mandatory initial Turkey-scoped TRY charge/settlement/payout | 2026-10-10 | Supersedes specified S3-Q open/preference clauses; historical reports unchanged | Public candidate ICS HTTP200 verified; identityless events.list403, authenticated API access unverified. Observances/half-days require official validation; FX/provider/proration/earning-event/licensing details OPEN. REQUIREMENTS remain DRAFT. |
| G0 / Step 3-T | Payout Deferral, Full First-Month Targets and Visual Communication | [Full report](./G0-step-3-T-payout-deferral-full-month-targets-and-visual-communication-2026-10-10.md) | Approved A/B/C adjustment options with B default; full first partial-month target without proration; new cross-application visual communication requirement | 2026-10-10 | Reconciles S/Q/R historical questions with current explicit owner decisions and repairs stale current C-01/C-02/C-04 rows; prior reports unchanged | Draft110 requirements, new DA-UX-004 only; provider/cutoff/fallback, target amounts/earning events, financial corrections and visual design details OPEN; no implementation or baseline acceptance. |

Historical statements that earlier reports were unavailable describe the evidence available during those original tasks. They remain unchanged. A3 and A3-R are related assessments with different preferences; neither is deleted, merged, or silently promoted to accepted policy.

## Inventory and Integrity

The [archive inventory dated 2026-10-10](./ARCHIVE-INVENTORY-2026-10-10.md) records the original numeric filenames, proposed descriptive names, source sizes, and pre-renaming SHA-256 hashes.

That inventory is a historical record and remains unchanged. During archive finalization, all nine approved filenames were applied and their hashes verified against the original inventory. Renaming preserves report bytes and encoding; report dates and historical statements are not rewritten.

The inventory is an archive administration document, not an additional A1–A7, A3-R, or G0 research stage. Future inventory or integrity records must be created or updated only when authorized.

## Research Lifecycle

The product owner wants future Agents to preserve complete research reports directly in this directory. Apply this workflow within the permissions of the current task:

1. Research the assigned subject using authoritative evidence, applicable governance, and installed version-matched framework documentation where relevant.
2. Produce the complete final report in the Agent conversation.
3. Save the complete report as Markdown in this directory **when the task authorizes research-report writing**. Preserve source references, evidence, limitations and the full findings.
4. Use a descriptive, unique filename containing a stage or research identifier and a date when appropriate, for example `A8-descriptive-subject-YYYY-MM-DD.md`. Do not invent unknown dates; distinguish report dates from save dates. Check case-insensitive filename collisions and use a unique edition or timestamp suffix when needed.
5. Preserve prior revisions, corrected editions and reassessments as separate documents, with explicit relationships to preceding research.
6. Never overwrite existing evidence silently. Replacement, deletion or content changes require explicit authorization.
7. Update this index consistently when authorized, linking actual existing filenames and recording known dates and evidence limitations.
8. Distinguish findings, recommendations, accepted decisions and unverified assumptions. Mark reports as archived research and retain relevant source versions and references; approval needs its own traceable evidence.
9. Never store credentials or secrets in research reports. If existing evidence is found to contain a secret, report the issue without exposing its value; do not modify or redact that evidence without authorization.
10. Never treat research-report write permission as authorization to modify source code, dependencies, databases, ADRs, requirements, application configuration or authoritative governance documents.

Task reports must not be written into `AGENTS.md` or `CODEBASE.md`. This index does not override a more restrictive root governance rule or task instruction. A strictly read-only task without an explicit report-writing exception remains read-only.

## Future Documentation Integration

The existing parent documentation router is `docs/dogruadres/README.md` ([parent router](../README.md)).

Adding a research archive link from that router is a later, separately authorized governance change. The parent router was not edited during archive finalization. Requirements reconciliation, ADR writing, security PoCs and software implementation also require separate product-owner authorization.