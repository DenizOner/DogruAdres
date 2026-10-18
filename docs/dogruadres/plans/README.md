# Project plans

This directory stores non-trivial implementation plans and cross-cutting engineering work.

Plans are required before implementation when a task is large, cross-cutting, risky, or architecture-sensitive. They are not required for tiny changes or minor mechanical refactors.

## When a plan is required

- new domain module or service
- complex workflow or orchestration change
- auth/security work
- payment or payout changes
- database migration or ownership change
- major UI work spanning multiple apps
- Mercur upgrades
- architecture-boundary changes

## When a plan is not required

- small UI text fixes
- trivially scoped bug fixes within an approved boundary
- formatting-only changes
- obvious mechanical cleanup inside an already approved area

## Plan archive and review

Keep the plan in the repository while the work is in scope. If a plan is superseded, keep the historical artifact or move it to a clearly marked archive only if the team wants a lighter operational view.

## Active Vehicle planning

- [Vehicle Management MVP — Vehicle-0 Decision and Design Plan](vehicle-management-mvp-design-2026-10-18.md) — V-01–V-07 plus N-01/P1 and N-02/C1 approved; current ADR-0006 requires Vehicle-local atomic audit/outbox and independent Audit Index, not physical cross-module Access audit proof. Vehicle-1 coding not authorized.

- [Vehicle-0C B2/C Architecture Assessment](vehicle-0c-atomicity-architecture-review-2026-10-18.md) — historical B1 evidence, C co-location proposal now revoked; ADR-0005 independent modules control.

- [ADR-0004 — Co-located Vehicle and Access transactional audit](../adr/ADR-0004-co-located-vehicle-access-transactional-audit.md) — Superseded, historical only.
- [ADR-0005 — Mandatory independent physical domain modules](../adr/ADR-0005-mandatory-independent-physical-domain-modules.md) — Accepted and binding for all project domain modules; ADR-0006 supersedes the Vehicle-to-Access physical audit-write requirement, while local audit/outbox + index proofs remain pending.

- [Audit-first coding and central index plan](audit-first-architecture-and-delivery-2026-10-18.md) — required in initial implementation; acceptance matrix and phased remediation.
- [Foundation and earlier code findings](foundation-baseline-review-2026-10-18.md) — source-confirmed gaps and IR-0 cross reference.
- [IR-0 — Dashboard, Finance and Integrations Code Review](dashboard-finance-integrations-code-review-2026-10-18.md) — 25 source-grounded findings, SAFE-0/COM-1/FIN-0 gates, explicit provider/runtime limitations.

- [UI-0 Reference Apps and SAFE-0A implementation preflight](reference-ui-strategy-and-safe-0a-2026-10-18.md) — User-confirmed custom DoğruAdres Admin/Vendor/Storefront intent; supported extension-vs-owned-UI choices; isolated production secrets / Next TypeScript engineering checkpoint.
- [UI-0A capability/role/API matrix](ui-0a-capability-roles-api-matrix-2026-10-18.md) — scoped current reference-vs-owned UI choices, official Mercur v2.3.7 capabilities and explicit open Product Owner decisions.
- [AF-1A Foundation audit/outbox readiness](af-1a-foundation-audit-outbox-implementation-readiness-2026-10-18.md) — write-path inventory, future isolated proof matrix, safe migrations and index/backfill gates.
- [AF-1A0 source trace and risk matrix](af-1a0-foundation-mutation-audit-source-trace-2026-10-18.md) — five concrete security writes, audit map, concurrency risk and native fault-proof gaps.
- [Mandatory local Git freshness preflight](local-repository-freshness-preflight-2026-10-18.md) — first Agent task, do not overwrite dirty Windows worktrees or assume remote equals local.

## Template

Use `TEMPLATE.md` for the minimum required structure.
