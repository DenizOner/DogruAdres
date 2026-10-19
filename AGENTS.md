# Mercur Marketplace Project

**This is a Mercur marketplace project — an open-source AI-native multi-vendor marketplace built on MedusaJS v2.**

## Read the docs first

Before any non-trivial change, read the **bundled documentation** — it ships as a dependency, so it is offline and version-matched to this project's packages:

1. Index: `node_modules/@mercurjs/docs/llms.txt`
2. Full pages: `node_modules/@mercurjs/docs/content/**/*.mdx`

It covers the domain model (sellers, products, offers, attributes, commissions, payouts, order groups), the CLI, the typed API client, the dashboard SDK, and module references. Don't guess at an API or data model the docs already describe.

### Project Structure

```
├── packages/api/         # Backend API — modules, workflows, links, subscribers
├── apps/admin/           # Admin dashboard — operator panel
├── apps/vendor/          # Vendor portal — seller dashboard
└── blocks.json           # Block configuration and registry aliases
```

## Documentation

- **Bundled docs (read first)**: `node_modules/@mercurjs/docs/llms.txt` → `content/**/*.mdx`
- **Online docs**: https://docs.mercurjs.com
- **MCP Server**: https://docs.mercurjs.com/mcp — connect your AI agent for documentation search
- **llms.txt (online)**: https://docs.mercurjs.com/llms.txt

## Configuration Files

- `blocks.json` — block configuration and registry path aliases
- `packages/api/medusa-config.ts` — MedusaJS configuration
- `apps/admin/vite.config.ts` — admin dashboard build config
- `apps/vendor/vite.config.ts` — vendor portal build config

## Getting Started

```bash
bun run dev
```

This starts:

- Backend API at `http://localhost:9000`
- Admin Panel at `http://localhost:9000/dashboard`
- Vendor Panel at `http://localhost:9000/seller`

# DoğruAdres project constitution

Mercur is the marketplace engine. DoğruAdres is the product and domain layer built on top of it.

Follow [DoğruAdres engineering principles §11](#11-product-scope-and-dependency-boundaries) for product scope, dependency boundaries and source-only repository rules. DoğruAdres is the development target. Never edit Mercur or Medusa upstream source; the historical escalation list below does not authorize such edits. Continue independent authorized project work when a dependency issue blocks only one operation.

## Required Mercur workflow

Before any non-trivial Mercur-related work:

1. read `node_modules/@mercurjs/docs/llms.txt`
2. read the relevant installed version-matched Mercur docs pages
3. inspect current source and generated types where needed

Never guess Mercur API behavior.

## Project documentation rule

Before DoğruAdres architectural or domain work, read the relevant project documents under `docs/dogruadres/` and use `docs/dogruadres/README.md` as the router.

## Core modification rule

Mercur core must not be modified by default.

Required escalation order:

1. official Mercur extension point
2. project-owned module/provider/workflow/subscriber/adapter
3. upstream contribution
4. minimal isolated compatibility patch
5. fork

Steps 3-5 require explicit external/user approval before implementation.

## Permanent roles and decision rights

Before performing project work, read and follow [DoğruAdres engineering principles §10](#10-roles-and-decision-rights), including the Product Owner, Technical Advisor and Local Agent responsibilities and mandatory problem-reporting standard. This policy does not expand task authorization or replace the existing authority hierarchy and approval gates.

## Product decision rule

The coding agent does not independently decide product behavior, business rules, architecture boundaries, payment policy, security policy, dependency strategy, or destructive data behavior.

When a decision is not already documented or approved, stop and report the decision needed.

## Approval gates

External approval is required for:

- Mercur core modification
- fork
- upstream patch strategy
- new major dependency
- domain ownership/boundary change
- database ownership/schema architecture change
- destructive migration
- public API breaking change
- authentication/authorization architecture
- security-boundary change
- payment/payout behavior
- breaking product behavior
- data deletion or retention change
- paid or closed-source service adoption

## Known-baseline classification

Agents must distinguish:

1. upstream known issue
2. temporary compatibility adjustment
3. DoğruAdres customization

Never silently turn an upstream issue into project-owned maintenance work.

## Resource rule

This project is developed on a modest Windows laptop. Prefer targeted builds, targeted tests, minimal background services, Docker only when required, stopping project containers/processes after work, and one intentional installation per required development tool. Do not sacrifice correctness merely to save resources.

## Documentation router

Read the project docs before making architectural or domain decisions, but do not copy Mercur framework documentation into the project docs.

## Authority / precedence model

When a decision is in doubt, use this order:

1. explicit currently approved user or product decision
2. repository constitution in root `AGENTS.md`
3. applicable DoğruAdres authoritative docs and accepted ADRs
4. installed version-matched Mercur docs for Mercur framework/API behavior
5. current source, generated types, tests, and runtime behavior as implementation evidence
6. official Mercur repository/release notes
7. official Medusa documentation when Medusa-specific
8. external/community sources only when necessary

If project policy conflicts with a real Mercur framework/API constraint, do not hide either side; surface the conflict. If current code/tests conflict with version-matched framework documentation, investigate whether the difference is an upstream bug, stale documentation, a local compatibility adjustment, or project drift before treating the code as the authority.

## Approved DoğruAdres delivery workflow

- Work in bounded implementation checkpoints. After focused validation, make a descriptive scoped commit after each meaningful task and each completed module or significant integration milestone. Stage explicit paths; never stage everything blindly.
- Publish checkpoint commits only to a dedicated review branch so the Technical Advisor can inspect the actual GitHub changes. Do not push to `main`, merge, force-push, deploy, or change repository settings without separate authorization.
- Stop at the end of each agreed checkpoint. Report the commit SHA, branch, changed files, validation results and actual browser-test evidence, then wait for the Technical Advisor's review before starting the next major checkpoint.
- Use the available browser tool to verify actual application behavior after relevant integration milestones and every user-facing UI milestone. For backend-only milestones, use browser-based checks of the running API where practical alongside direct HTTP/API and automated tests. If the browser cannot reach the app or is unavailable, state that limitation; never claim an unrun browser test passed.
- Unrelated baseline Storefront lint/type-check, Storybook or Jest bootstrap failures do not derail a focused feature unless they prevent meaningful validation of the changed code. Never conceal failures, weaken security checks or claim unexecuted tests passed.

## Branch lifecycle

- A branch represents a coherent initiative and reviewable deliverable, not an individual task, commit, or checkpoint.
- Reuse the active initiative branch for sequential checkpoints in the same scope. Create a branch only for genuinely independent work needing separate review/rollback or for parallel work with a clear reason.
- Before creating a branch, inspect existing local and remote branches and identify whether an appropriate active branch already exists.
- If a continuing initiative expands and its name becomes misleading, prefer a controlled rename of the existing branch over a parallel duplicate. Do not rename a branch while its checkpoint is under review.
- After a user-authorized merge is confirmed, delete the merged feature branch only if no further work depends on it. Never delete an unmerged, unreviewed, or potentially unique-work branch because it looks stale.
- At each checkpoint, report active branches, their purpose, base, current SHA, and cleanup candidates. Do not clean up branches automatically.
- Never push to `main`, merge, force-push, deploy, or change repository settings without separate explicit authorization.

## GitHub-centered decision, task, evidence and migration workflow

**Ownership:** GitHub is the project's single collaboration platform; different GitHub record types have non-overlapping responsibilities. This is an organizational change, not authorization to build features, modify database state, merge, deploy, or bypass security gates.

- **Discussions:** preliminary research, alternatives, product questions and unresolved decisions. The Product Owner approves the final decision in an explicit dated message. When resolved, close the discussion with a final decision statement and link resulting implementation or decision-record issues. Never interpret "answered" or "closed" alone as Product Owner approval. GitHub Discussions is currently disabled; do not pretend it was used or silently create new policies on its behalf.
- **Decision-record Issues:** authoritative stable records of Product Owner-approved behavior and accepted architectural decisions *after verified migration*. Preserve each DA-* ID, prior status, changed clauses, approval provenance, superseded decisions, boundaries and acceptance invariants. A closed implementation issue does not override a decision record.
- **Implementation and QA Issues:** executable scope, preconditions, negative cases, owner, dependencies, reproducible results and pass/fail/blocked status. Close as Completed only with the appropriate independently reviewed evidence. Store test execution, risks and error investigation in issues; code changes belong to reviewable PRs.
- **Projects:** optional overview and prioritization only; do not duplicate requirements or use board state as proof of authorization, approval or acceptance.
- **AGENTS.md:** permanent agent policy and the authoritative workflow guide. Keep full historical deliberation and long task reports out of AGENTS.md.

**Agent collaboration:** Product Owner decides policy and grants explicit action-level permissions. ChatGPT Technical Advisor / Project Director prepares evidence-based recommendations, decision packages and independent review. Codex Local Engineering Agent changes source and runs focused tests only within authorized scope. ChatGPT Work Agent owns independent browser/E2E verification. Agent instructions are written in English; Product Owner-facing responses are in Turkish. An issue's existence, assignment, label or project status alone does not grant execution permission.

**Status distinctions:** APPROVED product rule ≠ implemented feature ≠ passed test. Preserve APPROVED / PROPOSED / OPEN / DEFERRED / SUPERSEDED, and SOURCE VERIFIED / TEST PASSED / NOT TESTED / BLOCKED separately. Research or a test report marked Completed closes only that bounded deliverable, not every dependent task. Use distinct IDs for decision, feature, research and verification work; detect existing issues before creating new ones. Never reuse a completed research issue as proof that its recommendation became policy.

**Incremental migration safeguards:**
1. Read all repository branches, the currently applicable requirements, accepted ADRs and historic record before moving a document; feature branches may carry approved scope not yet in main.
2. Preserve the *complete* historical content and decision qualifiers in its new canonical GitHub record, without exposing real secrets. Re-read and verify source equivalence and links; record exact previous path and immutable Git object provenance.
3. Change referencing links to valid canonical issue/discussion locations; verify that navigation survives cleanup.
4. Delete a redundant tracked document only on the dedicated documentation review branch, after the new canonical record is verified. No silent deletion of an accepted requirement, policy, ADR or unique evidence. Never delete only because an Issue heading exists.
5. Do not merge into main without the Product Owner's separate approval. Continue to honor present docs as authoritative **until** their full approved policy and decision content has been migrated and accepted. A private immutable git history pointer is provenance, not a parallel active document.
6. Keep task records and daily progress out of the remaining docs. Remove the docs directory only at the final gate: all approved decisions and active technical rules canonicalized, links verified, independent review passed, no required file left, and Product Owner explicitly authorizes the merge.

**Decision record template:** ID, question, alternatives, original source/decision authority, exact decision text, scope, explicit approval status, affected DA-* and ADR IDs, security/financial constraints, tests and negative cases, supersession relationships, linked work Issues and evidence. Never invent decision timestamps, approved providers, prices or missing policy parameters.


## Canonical approved product decisions and architecture decisions

GitHub Issues now hold the complete canonical requirements/decision records; the former `docs/dogruadres/REQUIREMENTS.md` is retained only in Git history after a verified lossless migration. Use the exact DA-* decision ID to find its corresponding `[DEC DA-...]` issue. [Requirements baseline, approval provenance, cross-domain invariants and open/deferred registers](https://github.com/DenizOner/DogruAdres/issues/141) hold the other authoritative global clauses. A closed APPROVED record registers an existing approved decision, **not** tested/implemented code. PROPOSED, OPEN and DEFERRED entries remain unresolved; GitHub Discussions is the intended deliberation venue when a supported authoring interface is available. The migration governance issue is [#18](https://github.com/DenizOner/DogruAdres/issues/18).

Accepted architectural decision Issues (original source and dates retained): [ADR-0001](https://github.com/DenizOner/DogruAdres/issues/29), [ADR-0002](https://github.com/DenizOner/DogruAdres/issues/30), [ADR-0003](https://github.com/DenizOner/DogruAdres/issues/31), [ADR-0005](https://github.com/DenizOner/DogruAdres/issues/33), [ADR-0006](https://github.com/DenizOner/DogruAdres/issues/34), and [ADR-0007](https://github.com/DenizOner/DogruAdres/issues/35). [ADR-0004](https://github.com/DenizOner/DogruAdres/issues/32) is historically preserved but **SUPERSEDED** by ADR-0005 and must never be treated as current authorization. ADR-0005/0006 original approved source comes from the Vehicle feature branch and ADR-0007 from the Foundation feature branch; do not infer the main branch contains these original docs.

When sources conflict: latest explicitly approved Product Owner decision → root AGENTS.md → current canonical decision Issues and accepted ADRs (scope-specific) → remaining project-specific evergreen guidance → installed Mercur/Medusa documentation matching the dependency version → executed implementation evidence; outdated archived research and source commit history are provenance, never automatic current decisions. Do not silently interpret a superseded proposal as binding or close an implementation/QA task merely because its source decision record is completed.

## DoğruAdres engineering principles — migrated authoritative text

This repository is a Mercur marketplace baseline with a DoğruAdres product/domain layer layered on top. Mercur is the platform. DoğruAdres is the project-owned domain logic and product behavior.

### 1. Extension-first development

Use Mercur's public extension points before inventing custom workarounds.

Preferred order:

1. official Mercur extension point
2. project-owned module, provider, workflow hook, subscriber, adapter, or link
3. upstream contribution
4. minimal isolated compatibility patch
5. fork

The first principle is not to bend Mercur to fit a local shortcut. The first principle is to fit the project into the intended extension model.

### 2. Domain ownership

DoğruAdres owns domain concepts such as vehicle, make, model, generation, engine, fitment, OE/OEM references, automotive taxonomy, catalog enrichment, and automotive-specific search or filter semantics.

These are domain concerns. They are not Mercur's marketplace primitives and must remain logically separated from framework internals.

### 3. Upgradeability is an acceptance criterion

Mercur must remain upgradeable. Do not treat Mercur internals as a project dependency or a place to patch casually.

If an implementation requires a private or internal Mercur detail, stop and re-evaluate the integration boundary.

### 4. No permanent workaround disguised as architecture

Project-local development infrastructure, such as `compose.dev.yml`, is infrastructure rather than a framework compatibility workaround or Mercur defect. It may still be reviewed during upgrades when local development requirements change, but it is not a temporary compatibility patch.

Temporary compatibility adjustments are allowed only when they are explicitly classified as temporary. The current Redis configuration wiring and exact root dependency compatibility constraint must be re-evaluated on every Mercur upgrade and must not silently become permanent architecture.

### 5. Product and architecture choices require approval

The coding agent does not independently decide product behavior, business rules, architecture boundaries, dependency strategy, security boundaries, payment policy, or destructive data behavior.

When a decision is not already documented and accepted, the agent must stop and report the missing decision.

### 6. Minimal dependency policy

Prefer the minimum dependency surface needed to solve the problem.

- no unnecessary new frameworks
- no broad dependency churn for minor work
- no major dependency without explicit approval
- no hidden workaround packages that normalize a design problem into a dependency

### 7. Resource hygiene

This project is developed on a modest Windows laptop.

- use Docker only when required
- stop project containers and processes when work is complete
- prefer targeted builds and targeted tests over broad monorepo tasks
- avoid duplicate runtimes or unnecessary background services
- keep local development lightweight without sacrificing correctness

### 8. Git and safety principles

- preserve the Mercur baseline tag and important baseline references
- do not commit secrets or local env files
- do not overwrite user-owned uncommitted changes
- no destructive reset/clean/revert without explicit approval when data may be lost
- no force-push without explicit approval
- keep Mercur upgrade work isolated from unrelated feature work
- keep commits logically scoped

### 9. Testing principles

Testing is required at the right layer, not by blanket rule.

The future project should use layered testing that includes:

- unit/domain tests
- adapter/contract tests
- integration tests
- workflow tests
- E2E tests
- security regression tests

The project should focus on high-value rules such as seller isolation, offer ownership, price integrity, order behavior, commission boundaries, payment/payout boundaries, and automotive fitment correctness.

This document intentionally does not define a full testing strategy yet. That is a later, project-level artifact when the first real DoğruAdres implementation test stack exists.

### 10. Roles and decision rights

These responsibilities are mandatory and do not expand an operation's authorized scope. Existing approval gates, authority precedence and accepted ADRs remain in force.

- **Product Owner:** defines business goals, behavior, priorities and budget; approves or rejects requirements, business policies, architectural proposals and significant tradeoffs; authorizes bounded implementation and repository changes. The owner makes informed decisions from understandable recommendations and is not expected to understand source code, Git internals or Mercur extension mechanisms. Never require the owner to design a technical solution that the advisor or agent should prepare.
- **Technical Advisor and Architecture Coordinator:** translates business goals into technical requirements; investigates alternatives, risks, contradictions, gaps and technical debt; recommends a resolution for every actionable problem, explaining rationale, material tradeoffs and alternatives. Separates technical recommendations from genuine business decisions, prepares precise bounded agent instructions, reviews evidence and completed work, and guides the owner toward the recommended next action. Advice is not Product Owner approval.
- **Local Engineering Agent:** examines actual repository files and applicable governance; uses installed version-matched official Mercur/Medusa documentation and source evidence when relevant; performs only explicitly authorized operations; provides task-appropriate tests, verification evidence and concise reports. Identifies risks and recommends justified solutions, separates VERIFIED facts from assumptions and recommendations, and escalates material business, security and architecture decisions. Research is not approved policy; vague instructions do not grant broader authority; successful builds do not establish functional, security or business acceptance. The agent cannot approve its own architecture or implementation scope.

#### Required problem report

Every actionable problem report must include: (1) problem and evidence; (2) impact or risk; (3) recommended solution; (4) rationale and significant tradeoffs; (5) meaningful alternatives; (6) proposed next action and responsible role; and (7) whether explicit Product Owner authorization is required. Recommend safe technical resolutions rather than asking a nontechnical owner to solve them. At a genuine approval boundary, stop the affected change and present this decision package; continue independently authorized work where possible.

Proposed requirements and archived research do not become binding automatically. Documentation authorization does not authorize application implementation. Accepted ADRs remain authoritative only within their approved scope.

#### Proposed design reference

[DESIGN.md](DESIGN.md) is **PROPOSED VISUAL DESIGN REFERENCE — NOT APPROVED DESIGN BASELINE**. Tracking it preserves evidence and does not approve fonts, palette, screen layouts, design tokens, visual frameworks or other pending visual choices. Its original content remains a proposed reference.

### 11. Product scope and dependency boundaries

DoğruAdres is the product and development target. Mercur, Medusa, Redis and PostgreSQL are dependencies. Explicitly approved DoğruAdres requirements take priority; proposals remain proposals. Surface a framework constraint instead of silently changing product behavior.

- Never modify Mercur or Medusa upstream source, including installed dependency source. Use official APIs, modules and supported extension points. Historical escalation options are not standing permission to patch or fork dependencies.
- Investigate dependency defects only in proportion to their material impact on DoğruAdres. Search existing upstream GitHub issues before proposing new dependency work. If unreported, open a sanitized issue only within the task's authorization and available permissions; never publish secrets or project-private evidence.
- Continue independent authorized product work. Stop only the affected unsafe operation when necessary, report evidence and a recommended resolution, and never expand implementation scope without Product Owner approval.
- Use risk-based, proportionate verification. Reuse valid evidence and distinguish a dependency checkpoint from functional, security, financial and deployment acceptance.
- Keep downloaded third-party source trees, installed dependencies, binaries, build output, database contents and secrets out of Git. Preserve project-authored source and permitted source assets, documentation and governance.
- Reproduce the project through versioned manifests, lockfiles, project-owned migrations, safe configuration templates and documentation. Store private backups outside the repository; never commit real environment credentials.

This policy follows the latest explicit Product Owner scope instruction. It preserves accepted product decisions and ADR history, grants no implementation or database permission, and does not authorize remote publication.


<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
