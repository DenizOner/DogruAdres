# DoğruAdres project docs

This directory is the project-owned governance layer for DoğruAdres.

These documents are intentionally small and opinionated. They define how the project should be built on top of Mercur without copying Mercur's framework manuals into this repo.

## What these docs are

- the product/domain boundary for DoğruAdres
- the project engineering constitution
- the Mercur integration rules for this repo
- the upgrade and security expectations
- the ADR and planning workflow

## What these docs are not

- not Mercur framework documentation
- not a duplicate of Medusa/Mercur manuals
- not a business requirements encyclopedia
- not a place for implementation-by-accident

## Read this first

- `README.md` — router for the project docs
- [REQUIREMENTS.md](./REQUIREMENTS.md) — draft product requirements, decision classifications, provenance and open/deferred questions; pending product-owner review.
- [AGENTS.md](../../AGENTS.md) — engineering constitution, agent roles and GitHub workflow (single canonical policy)
- `ARCHITECTURE.md` — high-level ownership and integration model
- `MERCUR-INTEGRATION.md` — extension and compatibility rules
- `UPGRADE-POLICY.md` — upgrade workflow and compatibility re-review
- `SECURITY.md` — project-specific security obligations

## ADRs and plans

- ADRs: `./adr/README.md`
- Plans: `./plans/README.md`

## Authority and source hierarchy

When a decision is in doubt, use this order:

1. explicitly approved user/product decision
2. repository constitution in root `AGENTS.md`
3. DoğruAdres docs in this directory and accepted ADRs
4. installed version-matched Mercur docs for framework behavior
5. current source, generated types, tests, and runtime behavior
6. official Mercur repository/release notes
7. official Medusa docs where relevant
8. external/community sources only when necessary

The project must not treat random web snippets or model memory as higher authority than version-matched local documentation.
