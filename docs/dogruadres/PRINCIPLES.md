# DoğruAdres engineering principles

This repository is a Mercur marketplace baseline with a DoğruAdres product/domain layer layered on top. Mercur is the platform. DoğruAdres is the project-owned domain logic and product behavior.

## 1. Extension-first development

Use Mercur's public extension points before inventing custom workarounds.

Preferred order:

1. official Mercur extension point
2. project-owned module, provider, workflow hook, subscriber, adapter, or link
3. upstream contribution
4. minimal isolated compatibility patch
5. fork

The first principle is not to bend Mercur to fit a local shortcut. The first principle is to fit the project into the intended extension model.

## 2. Domain ownership

DoğruAdres owns domain concepts such as vehicle, make, model, generation, engine, fitment, OE/OEM references, automotive taxonomy, catalog enrichment, and automotive-specific search or filter semantics.

These are domain concerns. They are not Mercur's marketplace primitives and must remain logically separated from framework internals.

## 3. Upgradeability is an acceptance criterion

Mercur must remain upgradeable. Do not treat Mercur internals as a project dependency or a place to patch casually.

If an implementation requires a private or internal Mercur detail, stop and re-evaluate the integration boundary.

## 4. No permanent workaround disguised as architecture

Project-local development infrastructure, such as `compose.dev.yml`, is infrastructure rather than a framework compatibility workaround or Mercur defect. It may still be reviewed during upgrades when local development requirements change, but it is not a temporary compatibility patch.

Temporary compatibility adjustments are allowed only when they are explicitly classified as temporary. The current Redis configuration wiring and exact root dependency compatibility constraint must be re-evaluated on every Mercur upgrade and must not silently become permanent architecture.

## 5. Product and architecture choices require approval

The coding agent does not independently decide product behavior, business rules, architecture boundaries, dependency strategy, security boundaries, payment policy, or destructive data behavior.

When a decision is not already documented and accepted, the agent must stop and report the missing decision.

## 6. Minimal dependency policy

Prefer the minimum dependency surface needed to solve the problem.

- no unnecessary new frameworks
- no broad dependency churn for minor work
- no major dependency without explicit approval
- no hidden workaround packages that normalize a design problem into a dependency

## 7. Resource hygiene

This project is developed on a modest Windows laptop.

- use Docker only when required
- stop project containers and processes when work is complete
- prefer targeted builds and targeted tests over broad monorepo tasks
- avoid duplicate runtimes or unnecessary background services
- keep local development lightweight without sacrificing correctness

## 8. Git and safety principles

- preserve the Mercur baseline tag and important baseline references
- do not commit secrets or local env files
- do not overwrite user-owned uncommitted changes
- no destructive reset/clean/revert without explicit approval when data may be lost
- no force-push without explicit approval
- keep Mercur upgrade work isolated from unrelated feature work
- keep commits logically scoped

## 9. Testing principles

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

## 10. Roles and decision rights

These responsibilities are mandatory and do not expand an operation's authorized scope. Existing approval gates, authority precedence and accepted ADRs remain in force.

- **Product Owner:** defines business goals, behavior, priorities and budget; approves or rejects requirements, business policies, architectural proposals and significant tradeoffs; authorizes bounded implementation and repository changes. The owner makes informed decisions from understandable recommendations and is not expected to understand source code, Git internals or Mercur extension mechanisms. Never require the owner to design a technical solution that the advisor or agent should prepare.
- **Technical Advisor and Architecture Coordinator:** translates business goals into technical requirements; investigates alternatives, risks, contradictions, gaps and technical debt; recommends a resolution for every actionable problem, explaining rationale, material tradeoffs and alternatives. Separates technical recommendations from genuine business decisions, prepares precise bounded agent instructions, reviews evidence and completed work, and guides the owner toward the recommended next action. Advice is not Product Owner approval.
- **Local Engineering Agent:** examines actual repository files and applicable governance; uses installed version-matched official Mercur/Medusa documentation and source evidence when relevant; performs only explicitly authorized operations; provides task-appropriate tests, verification evidence and concise reports. Identifies risks and recommends justified solutions, separates VERIFIED facts from assumptions and recommendations, and escalates material business, security and architecture decisions. Research is not approved policy; vague instructions do not grant broader authority; successful builds do not establish functional, security or business acceptance. The agent cannot approve its own architecture or implementation scope.

### Required problem report

Every actionable problem report must include: (1) problem and evidence; (2) impact or risk; (3) recommended solution; (4) rationale and significant tradeoffs; (5) meaningful alternatives; (6) proposed next action and responsible role; and (7) whether explicit Product Owner authorization is required. Recommend safe technical resolutions rather than asking a nontechnical owner to solve them. At a genuine approval boundary, stop the affected change and present this decision package; continue independently authorized work where possible.

Proposed requirements and archived research do not become binding automatically. Documentation authorization does not authorize application implementation. Accepted ADRs remain authoritative only within their approved scope.

### Proposed design reference

[DESIGN.md](../../DESIGN.md) is **PROPOSED VISUAL DESIGN REFERENCE — NOT APPROVED DESIGN BASELINE**. Tracking it preserves evidence and does not approve fonts, palette, screen layouts, design tokens, visual frameworks or other pending visual choices. Its original content remains a proposed reference.

## 11. Product scope and dependency boundaries

DoğruAdres is the product and development target. Mercur, Medusa, Redis and PostgreSQL are dependencies. Explicitly approved DoğruAdres requirements take priority; proposals remain proposals. Surface a framework constraint instead of silently changing product behavior.

- Never modify Mercur or Medusa upstream source, including installed dependency source. Use official APIs, modules and supported extension points. Historical escalation options are not standing permission to patch or fork dependencies.
- Investigate dependency defects only in proportion to their material impact on DoğruAdres. Search existing upstream GitHub issues before proposing new dependency work. If unreported, open a sanitized issue only within the task's authorization and available permissions; never publish secrets or project-private evidence.
- Continue independent authorized product work. Stop only the affected unsafe operation when necessary, report evidence and a recommended resolution, and never expand implementation scope without Product Owner approval.
- Use risk-based, proportionate verification. Reuse valid evidence and distinguish a dependency checkpoint from functional, security, financial and deployment acceptance.
- Keep downloaded third-party source trees, installed dependencies, binaries, build output, database contents and secrets out of Git. Preserve project-authored source and permitted source assets, documentation and governance.
- Reproduce the project through versioned manifests, lockfiles, project-owned migrations, safe configuration templates and documentation. Store private backups outside the repository; never commit real environment credentials.

This policy follows the latest explicit Product Owner scope instruction. It preserves accepted product decisions and ADR history, grants no implementation or database permission, and does not authorize remote publication.

## 12. Binding invariant-first delivery and evidence standards

These permanent rules apply to Foundation, Vehicle, Audit Index and future modules under the Product Owner's Architecture Consolidation R0 decision (recorded in ADR-0007):

1. Identify the approved business invariant and authoritative sources, including actual approval provenance.
2. Verify the exact installed framework extension mechanism before relying on it.
3. Implement the smallest end-to-end working contract within the authorized checkpoint.
4. Execute focused tests at the earliest meaningful boundary; source-only completion is not runtime acceptance.
5. Stop the affected behavior if it cannot be verified; do not add layers over an unproven assumption.
6. Immediately investigate confirmed defects and repair them through an explicitly bounded change; report additional scope rather than hiding or indefinitely deferring a defect.
7. Reuse verified evidence with its version, target and limitations; never generalize it beyond what was tested.
8. Eliminate redundant temporary paths after the replacement works and cleanup is independently reviewed; preserve historical evidence until then.
9. Verify source, framework runtime, persistence, concurrency and security boundaries independently.
10. Require Technical Advisor acceptance before crossing major architecture or security gates; implementation/publication is not self-acceptance.

Every acceptance claim uses one of: **SOURCE VERIFIED**, **TEST EXECUTED AND PASSED**, **TEST EXECUTED AND FAILED**, **NOT TESTED**, **ENVIRONMENT BLOCKED**, **ARCHITECTURE BLOCKED**. Record commands, exit codes, executed test counts and meaningful failures. A type-check or mock assertion cannot be called successful PostgreSQL, module initialization, rollback or concurrency verification. Bootstrap failures execute zero assertions unless evidence shows otherwise. No test assertion may be weakened to manufacture success.

Preserve independent physical modules, module-owned canonical audit/outbox atomicity and the derived Audit Index. Authorization Policy A is binding; its implementation remains gated by real verification. Governance approval does not expand a checkpoint's resource, source or publication permissions.
