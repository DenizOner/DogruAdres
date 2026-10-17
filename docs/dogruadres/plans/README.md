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

- [Vehicle Management MVP — Vehicle-0 Decision and Design Plan](vehicle-management-mvp-design-2026-10-18.md) — V-01–V-07 plus N-01/P1 and N-02/C1 approved; shared-audit physical SQL atomicity proof pending. Vehicle-1 coding not authorized.

## Template

Use `TEMPLATE.md` for the minimum required structure.
