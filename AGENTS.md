# DoğruAdres — engineering and agent execution policy

This repository implements DoğruAdres on the open-source Mercur marketplace stack (MedusaJS v2). The product and project-owned integrations are the development target; Mercur/Medusa core remains an upstream dependency.

**How to use this file:** apply only the sections relevant to the task, plus mandatory security/authorization/approval gates. For current product scope and decision provenance, consult canonical GitHub Issues; for implementation facts, inspect actual source and executable evidence. Historical snapshots are not current instructions. Routine task notes and changing PR/CI status belong in their linked GitHub records, not this policy.

**Project entry points:** `packages/api/` (API, modules, workflows, links, subscribers); `apps/admin/` (operator UI); `apps/vendor/` (seller UI); `blocks.json` (Mercur block aliases); `packages/api/medusa-config.ts` (backend configuration). Operational setup belongs in [README.md](README.md), not here.

**Installed documentation:** when available, start at `node_modules/@mercurjs/docs/llms.txt`, then read only relevant version-matched `node_modules/@mercurjs/docs/content/**/*.mdx` pages. Consult official Mercur and Medusa documentation for corresponding installed versions when needed. Do not infer behavior from memory alone.

# DoğruAdres project constitution

Mercur is the marketplace engine. DoğruAdres is the product and domain layer built on top of it.

Follow [DoğruAdres engineering principles §11](#11-product-scope-and-dependency-boundaries) for product scope, dependency boundaries and source-only repository rules. DoğruAdres is the development target. Never edit Mercur or Medusa upstream source; the historical escalation list below does not authorize such edits. Continue independent authorized project work when a dependency issue blocks only one operation.

## Required Mercur workflow

Before nontrivial framework-facing changes, verify the actual installed package versions, relevant bundled Mercur docs, project code and generated types. Use matching official Medusa docs for Medusa-specific behavior. If the installed sources are unavailable to the reviewer, identify what could and could not be verified; never invent an API contract or assume a feature is missing.

## Mandatory challenge and reuse-before-build gate

**Applies to the Technical Advisor and every engineering/AI agent before proposing or implementing a new feature or architectural component.** A Product Owner request describes a desired outcome; it does **not** establish that the requested implementation is necessary, that an equivalent capability is missing, or that a new architecture has been approved.

1. **Validate the goal, not the proposed implementation.** Compare the request with approved DoğruAdres requirements and security/domain boundaries. Identify incorrect premises, needless duplication, hidden tradeoffs and simpler or safer alternatives. Respectfully explain a better approach with evidence; ask the Product Owner only for genuine unresolved product decisions or new permissions.
2. **Inspect the installed platform and existing project first.** Check relevant actual package versions, enabled Medusa commerce modules, Mercur modules/plugins/blocks, built-in APIs, workflows and hooks, providers, auth/authorization behavior, dashboard/SDK components, configuration, generated types, and existing DoğruAdres source/tests. A request to "build" something is never proof that Medusa, Mercur or the project lacks it. Search only task-relevant surfaces, without exhaustive repository inventories by default.
3. **Verify the supported way to reuse it.** Start with installed, version-matched Mercur docs under `node_modules/@mercurjs/docs`; consult matching official Medusa docs and relevant upstream source/release notes when necessary. Check real integration and permission boundaries before assuming a built-in feature is suitable. Distinguish AVAILABLE, REQUIRES CONFIGURATION/EXTENSION, GAP CONFIRMED and UNVERIFIED; never claim absence solely from an unsuccessful search.
4. **Prefer the least custom solution.** Reuse/configure an existing supported capability first; otherwise extend it through documented public APIs, workflow hooks, modules, links, subscribers, providers, or small project-owned adapters. Design new project-owned functionality only for a verified unmet approved requirement. Do not recreate existing identity, commerce, marketplace, or platform primitives; do not modify upstream internals or bypass security to avoid integration work.
5. **Record a concise decision before implementation.** State the desired user outcome, discovered existing capability and evidence, actual remaining gap, recommended reuse/extension/build option, important tradeoffs and authorization boundaries, and the smallest decisive acceptance/negative check. When reuse fully meets the goal, do not write new code. Keep this preflight proportional: reuse valid earlier findings and stop researching when more inspection would not change the decision.

This gate supplements existing approval, source, version-matched documentation, end-to-end acceptance and evidence requirements. It does not authorize implementation, dependency changes, database writes, core patches, publication or a merge.

## Canonical project decision lookup

Before DoğruAdres architectural or domain work, read this root `AGENTS.md`, relevant canonical `[DEC DA-*]` and `[DEC ADR-*]` GitHub Issue records, the [controlled decision source and cross-domain invariants](https://github.com/DenizOner/DogruAdres/issues/141), the active work/QA Issue, and current source/tests. Do **not** use removed project `docs/` files as a second operational authority. If GitHub is temporarily inaccessible, do not guess at business/security/financial policy; stop the affected decision or action and report the blocked evidence.

## Core modification rule

Mercur core must not be modified by default.

Required escalation order:

1. official Mercur extension point
2. project-owned module/provider/workflow/subscriber/adapter
3. upstream contribution
4. minimal isolated compatibility patch
5. fork

Steps 3-5 require explicit external/user approval before implementation.

## Permanent cost and GitHub Issue language policy

**Binding, irreversible Product Owner decision dated 2026-10-20:** [GÜV-ÜCRETSİZ-001 — canonical GitHub decision #211](https://github.com/DenizOner/DogruAdres/issues/211). This instruction applies to all DoğruAdres work, including architecture, planning, coding, testing, integrations, collaboration, and deployment preparation.

1. **Never use, purchase, trial with paid conversion, suggest, recommend, or plan a paid service, subscription, license, hosted capability, add-on or software for DoğruAdres.** This explicitly includes GitHub Pro, GitHub Team, GitHub Enterprise, and all other paid products. The Product Owner has declared this choice final, non-negotiable and unchangeable. Do not reopen it as a decision option or propose an account upgrade to solve a blocker.
2. Use only cost-free options that actually meet the project's security, license and authorization boundaries. A free tier does not imply blanket approval to connect external accounts, disclose data, change hosting, run migrations, or deploy. When a required capability is unavailable without payment, report **FREE-PLAN CAPABILITY BLOCKED** and use only truthful, separately authorized cost-free workarounds; never fake enforcement or test evidence.
3. This personally owned private repository currently does **not** enforce protected-branch / required CI rules through GitHub. Until a genuinely free enforcement mechanism is independently verified and explicitly authorized, apply a **process-only gate**: independent source review; exact PR HEAD SHA, base SHA and actual scoped CI rechecks; and a separate explicit Product Owner authorization for that exact PR/HEAD before merging. Do not call this GitHub-enforced protection. Preserve the sole-owner recovery path and the prohibition on unauthorized pushes/force-pushes.
4. **Write new GitHub Issue titles, user-facing summaries, scope statements, acceptance checklists and progress reports in Turkish.** Translate previously authored English or heavily mixed-language Issue-facing content when encountered. Do not alter exact canonical IDs, source code identifiers, technical paths, immutable evidence quotations, original decision statuses, approvals, or full historical source archives. Put clear Turkish reader-facing material before the untouched historical text whenever faithful replacement could compromise provenance. GitHub PR descriptions and other user-facing governance records should also favor Turkish.
5. **Write executable instructions for engineering/AI agents in English**, consistent with the project language convention. This does not excuse English GitHub Issue prose addressed to the Product Owner.
6. [Issue #212](https://github.com/DenizOner/DogruAdres/issues/212) tracks the legacy Issue localization without creating new product approvals. [Issue #208](https://github.com/DenizOner/DogruAdres/issues/208) records the current cost-free repository security procedure. A Project board Status field never overrides a canonical decision Issue or independent test evidence.

## Permanent roles and decision rights

Before performing project work, read and follow [DoğruAdres engineering principles §10](#10-roles-and-decision-rights), including the Product Owner, Technical Advisor and Local Agent responsibilities and mandatory problem-reporting standard. This policy does not expand task authorization or replace the existing authority hierarchy and approval gates.

## Product decision rule

The coding agent does not independently decide product behavior, business rules, architecture boundaries, payment policy, security policy, dependency strategy, or destructive data behavior.

When an action depends on a genuinely unresolved product or high-risk policy decision, stop **only that affected action**, report the decision needed and continue independently authorized work. Do not transform missing optional details into artificial project-wide blockers.

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
- adoption of a free but closed-source third-party service (subject to separate security, privacy and license approval; paid services are prohibited under #211)

## Known-baseline classification

Agents must distinguish:

1. upstream known issue
2. temporary compatibility adjustment
3. DoğruAdres customization

Never silently turn an upstream issue into project-owned maintenance work.

## Resource rule

This project runs primarily on a resource-constrained Windows laptop. Prefer targeted builds/tests and minimum task-owned services/containers, stop only safely identified task-owned processes, and avoid redundant installs. Reuse exact-SHA evidence when still valid; never trade away security, data safety or necessary end-to-end checks to save resources.

## Documentation and evidence router

Project-owned business and architecture decisions live in GitHub decision Issues, with scope/approval recorded there. Research, historical reports and test execution evidence live in their linked Issue discussions; implementation details live in code and PRs. Agent-executable policies belong here. Avoid duplicate project-specific `docs/` directories and never copy Mercur framework manuals into this repository.

## Authority / precedence model

1. Explicit, dated and applicable Product Owner approvals—including newer scoped supersessions recorded in canonical GitHub Issues—govern product and action authorization. A later approved decision can supersede older wording in this file; flag and correct the stale wording rather than obeying it blindly.
2. This root `AGENTS.md` governs **agent execution** within authorized scope. Canonical `[DEC DA-*]`, `[DEC ADR-*]` and invariant Issues govern the approved product/architecture decisions and their exact boundaries. Neither an Issue label nor a prior agent recommendation grants execution or merge permission.
3. Installed version-matched Mercur documentation and relevant official Medusa APIs define supported framework contracts; current code, generated types, actual runtime and focused tests establish implementation evidence. If docs and runtime disagree, investigate the cause; neither source automatically changes approved policy.
4. Older reports, retired `docs/dogruadres/**` trees and external/community content are historical or supplementary evidence, not independent current authority.

Treat approval, implementation, CI, security acceptance and deployment authorization as **separate claims**. Report material conflicts and preserve the last confirmed safe state rather than guessing.

## Approved DoğruAdres delivery workflow

- Work in reviewable, bounded checkpoints on an authorized branch; stage exact intended files and commit cohesive changes after focused validation. Reuse the active initiative branch unless an independently justified separation is needed.
- Use the smallest sufficient automated/HTTP/DB/browser checks for the **changed behavior and risk**; reuse previous evidence only within its exact version, SHA, target and security boundary. Significant user-facing flows require independent real-browser E2E acceptance, not screenshot- or mock-only claims.
- Publish scoped commits to the authorized review branch for independent review. Report commit/PR HEAD and base, changed files, actual test outcomes, security gaps and blockers. Pause at a genuine review or permission boundary; do not require repeated micro-approvals for actions already authorized.
- Never push to `main`, merge, force-push, deploy or alter repository settings without the separately required Product Owner authorization; final merge needs review and permission for the **exact PR HEAD/base**, not a general plan approval.
- Baseline test failures unrelated to the change should be recorded, not hidden or falsely counted as passing; do not weaken tests to make a build green.

## Branch lifecycle

- A branch represents a coherent reviewable initiative, not each task/commit/checkpoint. Reuse the existing task branch when possible; check existing branches and worktrees before creating another.
- Default to serial work, but allow justified parallel work only under the newer [#216 isolation/ownership policy](https://github.com/DenizOner/DogruAdres/issues/216#issuecomment-6325812774). Parallel read-only GitHub/source review ordinarily needs no new branch.
- A new worktree/branch requires an actual independent review or isolation need, a distinct owner, known base and expected retirement criteria; it never implies extra database, fixture, deployment or merge permission.
- Report only task-relevant branch/HEAD/dependency changes and cleanup candidates; perform no automatic branch or worktree deletion. Before removing any ref, reconcile local dirty/untracked/ignored work, unique commits, dependent PRs, runtime/DB owners and preserved recovery evidence.
- Never push directly to `main`, merge, force-push, deploy or change repository settings without separate explicit approval.

## Cross-branch documentation cutover and safe integration

When a feature branch predates the GitHub-only governance cutover, its `docs/dogruadres/**` source files may still exist and may contain newer product approvals or unique engineering evidence. **Do not blindly merge them back into `main`, delete them in-place, rewrite their history, or treat their presence as a second canonical rulebook.**

1. Compare the exact feature-branch blobs with the canonical GitHub Issues and immutable provenance on the branch being integrated; transfer every genuinely newer accepted scope, source-specific supersession, and unique bounded test report before considering removal. An archived `REQUIREMENTS.md` is not proof its old open parameters remain unresolved after later dated Product Owner approvals.
2. Treat accepted ADR-0005/ADR-0006 and later scoped Vehicle/Audit amendments as binding only within their recorded approval scope. The earlier ADR-0004 co-location approval is superseded. Preserve historic wording, but route agents to the latest explicit accepted decision and the current authorized implementation gate.
3. Reconcile `docs/dogruadres/**` paths in a **separately reviewed integration/cleanup change** so that merging an old feature branch does not silently resurrect already retired governance documentation. Source blob IDs and Issue links must survive, including active AF-1, Vehicle and SAFE-0A evidence records.
4. Independently review the complete code diff and scope, not merely the Markdown cleanup. In particular, `feature/af-1-foundation-audit-outbox` also contains `dogruadres-vehicle` source and migrations; no blanket branch merge or accidental Vehicle implementation authorization follows from a documentation migration or accepted ADR.
5. Do not delete or rewrite an active dirty local worktree or feature branch to perform cutover. Do not merge into `main`, promote a draft PR, deploy, create fixtures, run data mutations, or alter repository protection settings without the required separate Product Owner authority.

## GitHub-centered decision, task, evidence and migration workflow

**Ownership:** GitHub is the project's single collaboration platform; different GitHub record types have non-overlapping responsibilities. This is an organizational change, not authorization to build features, modify database state, merge, deploy, or bypass security gates.

- **Discussions:** preliminary research, alternatives, product questions and unresolved decisions. The Product Owner approves the final decision in an explicit dated message. When resolved, close the discussion with a final decision statement and link resulting implementation or decision-record issues. Never interpret "answered" or "closed" alone as Product Owner approval. Check actual authenticated Discussion capabilities at execution time; if no supported write action exists, do not claim publication or create a duplicate decision record as a workaround. Do not silently create policies on its behalf.
- **Decision-record Issues:** authoritative stable records of Product Owner-approved behavior and accepted architectural decisions *after verified migration*. Preserve each DA-* ID, prior status, changed clauses, approval provenance, superseded decisions, boundaries and acceptance invariants. A closed implementation issue does not override a decision record.
- **Implementation and QA Issues:** executable scope, preconditions, negative cases, owner, dependencies, reproducible results and pass/fail/blocked status. Close as Completed only with the appropriate independently reviewed evidence. Store test execution, risks and error investigation in issues; code changes belong to reviewable PRs.
- **Projects:** optional overview and prioritization only; do not duplicate requirements or use board state as proof of authorization, approval or acceptance.
- **AGENTS.md:** permanent agent policy and the authoritative workflow guide. Keep full historical deliberation and long task reports out of AGENTS.md.

**Agent collaboration:** Product Owner decides policy and grants explicit action-level permissions. ChatGPT Technical Advisor / Project Director prepares evidence-based recommendations, decision packages and independent review. The authorized Local Engineering Agent (Codex or another specifically assigned agent) changes source and runs focused tests only within scope. The independent ChatGPT Work Testing Agent owns real-browser/E2E acceptance when accessible; if unavailable, mark it BLOCKED/NOT TESTED rather than silently assigning self-acceptance. Agent instructions are written in English; Product Owner-facing responses are in Turkish. An issue's existence, assignment, label or project status alone does not grant execution permission.

**Status distinctions:** APPROVED product rule ≠ implemented feature ≠ passed test. Preserve APPROVED / PROPOSED / OPEN / DEFERRED / SUPERSEDED, and SOURCE VERIFIED / TEST PASSED / NOT TESTED / BLOCKED separately. Research or a test report marked Completed closes only that bounded deliverable, not every dependent task. Use distinct IDs for decision, feature, research and verification work; detect existing issues before creating new ones. Never reuse a completed research issue as proof that its recommendation became policy.

**Incremental migration safeguards:**
1. Inspect the relevant source and target branches, applicable approved requirements/ADRs and provenance before relocating or deleting a decision document; do not exhaustively re-audit unrelated branches when previous scoped evidence remains valid.
2. Preserve the *complete* historical content and decision qualifiers in its new canonical GitHub record, without exposing real secrets. Re-read and verify source equivalence and links; record exact previous path and immutable Git object provenance.
3. Change referencing links to valid canonical issue/discussion locations; verify that navigation survives cleanup.
4. Delete a redundant tracked document only on the dedicated documentation review branch, after the new canonical record is verified. No silent deletion of an accepted requirement, policy, ADR or unique evidence. Never delete only because an Issue heading exists.
5. Do not merge into main without the Product Owner's separate approval. Continue to honor present docs as authoritative **until** their full approved policy and decision content has been migrated and accepted. A private immutable git history pointer is provenance, not a parallel active document.
6. Keep task records and daily progress out of the remaining docs. Remove the docs directory only at the final gate: all approved decisions and active technical rules canonicalized, links verified, independent review passed, no required file left, and Product Owner explicitly authorizes the merge.

**Decision record template:** ID, question, alternatives, original source/decision authority, exact decision text, scope, explicit approval status, affected DA-* and ADR IDs, security/financial constraints, tests and negative cases, supersession relationships, linked work Issues and evidence. Never invent decision timestamps, approved providers, prices or missing policy parameters.


## Canonical security, Mercur integration and upgrade guardrails

The following is the **current agent-executable policy**, consolidated from previous `docs/dogruadres/{SECURITY,MERCUR-INTEGRATION,UPGRADE-POLICY}.md`. Their exact historical text and original source blobs remain in Issues [#144](https://github.com/DenizOner/DogruAdres/issues/144), [#143](https://github.com/DenizOner/DogruAdres/issues/143), [#145](https://github.com/DenizOner/DogruAdres/issues/145) respectively, but must not be treated as separate active rulebooks. Architecture snapshot [#142](https://github.com/DenizOner/DogruAdres/issues/142) contains past factual assertions; verify implementation against code/runtime and applicable newer ADRs.

### Mandatory security and Organization access rules

- Never commit real credentials, API secrets, environment values or local `.env` files. Prevent secrets, invitation plaintext, payment details and private personal information from entering logs, audits, issues, commits or external outputs. Synthetic test credentials require explicit authorized scope.
- Authentication is **not** authorization. Fail closed when actor, explicit unique actor→Person mapping, active Organization membership, permission/policy, server-derived Organization/resource scope or resolver is missing or ambiguous. Email similarity alone never merges Persons or grants Organization access. Request-time access checks apply to every protected route and future background jobs, searches, files, exports and integrations.
- Keep Person, Organization, Seller, Store, Mercur Member and branch ownership separate. No implicit platform-admin access to private Org resources. Restrict platform Organization provisioning and protected initial Owner assignments to an authenticated Medusa `user` actor through the approved route; a separate finer-grained platform role must not be assumed implemented. Do not demote or revoke the last active protected Owner via ordinary membership changes.
- Invitation controls in the existing Foundation checkpoint: seven-day expiry, single-use and revocable, hash-only token persistence; require an authenticated recipient and already verified matching Medusa email identity. No client-asserted email verification or privileges. Never create or presume email-delivery or global-login verification providers without approval.
- Keep canonical domain mutation, local module-owned audit and outbox **atomic per owner module**; ADR-0006 supersedes earlier assumptions that every domain writes to one physically shared Access audit table. Read-side unified Audit Index is a separately registered derived projection with current authorization recheck; no eventual-consistency delay permits unauthorized disclosure.
- Enforce seller/offer ownership isolation, price integrity, authorized FX/TRY publication, settled payment and payout rules. Accounting and payout operations, external integrations, file uploads, destructive operations, database ownership changes and security architecture changes require their existing explicit approval gates. Audit security-sensitive mutations without leaking tokens or secrets.
- Prior passing tests are scoped evidence only. New routes, revocation edge cases, concurrent mutation, compensation, crash recovery, files, search and payout paths are **NOT** proven by Foundation route checks. Report each untested boundary distinctly and fail closed.

### Mercur extension and upgrade workflow

- Read installed Mercur `node_modules/@mercurjs/docs/llms.txt`, relevant version-matched `content/**/*.mdx`, source/generated types and official release information before technical changes. Never infer a Mercur/Medusa contract solely from training memory.
- Use official extension APIs first, then project-owned modules/providers/workflows/subscribers/adapters/links. Escalation to upstream contribution, compatibility patch or fork requires separately authorized scope. No direct patching of Mercur/Medusa source or reliance on private internals.
- Keep domain↔framework translation in project-owned adapters. Respect independent physical modules under ADR-0005; module-owned atomic audit + transactional outbox and separately projected index under ADR-0006; coherent runtime authorization evidence under ADR-0007.
- Preserve the original 2.3.7 historical upgrade classifications for re-checking, not unquestioned permanent exceptions: storefront production lint/parser issue was upstream/baseline; Redis `REDIS_URL` wiring and root exact `i18next@26.4.2` were temporary compatibility adjustments; `compose.dev.yml` is dev infrastructure rather than a Mercur compatibility patch. Reassess actual necessity on **every** version upgrade.
- For a Mercur upgrade: create an isolated review branch; identify a stable target; inspect official release notes, breaking changes and migrations; update related Mercur dependencies coherently; read new bundled docs; compare scaffold, AGENTS guidance, APIs/types/workflows/SDK; evaluate each temporary deviation; run focused builds/contracts/integration/security checks; verify staging before production; document any new approval in canonical GitHub decision Issues. Do not combine upgrade work with unrelated features or assume staging/deployment permission.
- The prior Mercur 2.3.7 / Medusa 2.21.2 dependency checkpoint and 122 reported assertions are **historical bounded evidence** in [#145](https://github.com/DenizOner/DogruAdres/issues/145). Storefront type/lint production failure, Jest full HTTP limitations and real-money payout idempotency/crash/reconciliation remained open. Passing a local dependency checkpoint does not establish production readiness.

### Architecture decision records

Record a material architecture, dependency, security/privacy, payment, schema/data ownership or Mercur integration decision in a **canonical decision Issue** with an explicit PROPOSED / ACCEPTED / SUPERSEDED / DEPRECATED state and provenance. Cover context, the exact decision, considered alternatives, consequences, trade-offs, Mercur upgrade impact and necessary follow-up. Only Product Owner approval changes policy; the status of an implementation or QA Issue is never interchangeable with architecture approval. Small formatting changes or bounded routine refactors do not require their own ADR. Existing ADR-0004 is SUPERSEDED by ADR-0005; no physical domain co-location exception remains approved.

### Planning, verification and approval artifacts

Require a reviewable GitHub work Issue for a new domain module, cross-cutting workflow, auth/security change, payment/payout design, schema/ownership migration, major multi-app UI, framework upgrade or architectural boundary change. Trivial scoped edits need not receive a full implementation plan. Do not author redundant implementation-plan files under `docs/`.

For significant work, its **Issue** must identify objective, user-visible outcome, explicitly authorized scope and non-goals, existing architecture, proposed design and official extension point, affected files/components, data/migration/security/upgrade impact, risks and open decisions, bounded implementation steps, test/negative acceptance criteria, rollback plan, evidence links and Product Owner approval state. Record completion and independent QA evidence in the Issue; review actual code changes via PR. No work item, GitHub assignment or Issue creation itself grants authorization.


## Canonical approved product decisions and architecture decisions

GitHub Issues now hold the complete canonical requirements/decision records; the former `docs/dogruadres/REQUIREMENTS.md` is retained only in Git history after a verified lossless migration. Use the exact DA-* decision ID to find its corresponding `[DEC DA-...]` issue. [Requirements baseline, approval provenance, cross-domain invariants and open/deferred registers](https://github.com/DenizOner/DogruAdres/issues/141) hold the other authoritative global clauses. A closed APPROVED record registers an existing approved decision, **not** tested/implemented code. PROPOSED, OPEN and DEFERRED entries remain unresolved; GitHub Discussions is the intended deliberation venue when a supported authoring interface is available. The migration governance issue is [#18](https://github.com/DenizOner/DogruAdres/issues/18).

Accepted architectural decision Issues (original source and dates retained): [ADR-0001](https://github.com/DenizOner/DogruAdres/issues/29), [ADR-0002](https://github.com/DenizOner/DogruAdres/issues/30), [ADR-0003](https://github.com/DenizOner/DogruAdres/issues/31), [ADR-0005](https://github.com/DenizOner/DogruAdres/issues/33), [ADR-0006](https://github.com/DenizOner/DogruAdres/issues/34), and [ADR-0007](https://github.com/DenizOner/DogruAdres/issues/35). [ADR-0004](https://github.com/DenizOner/DogruAdres/issues/32) is historically preserved but **SUPERSEDED** by ADR-0005 and must never be treated as current authorization. ADR-0005/0006 original approved source comes from the Vehicle feature branch and ADR-0007 from the Foundation feature branch; do not infer the main branch contains these original docs.

When sources conflict, apply the [authority / precedence model](#authority--precedence-model), check the exact approval and supersession scope, and distinguish historical evidence from current permissions. Never silently treat an archived proposal as binding or close implementation/QA work because its decision record is complete.

## DoğruAdres engineering principles — migrated authoritative text

This repository is a Mercur marketplace baseline with a DoğruAdres product/domain layer layered on top. Mercur is the platform. DoğruAdres is the project-owned domain logic and product behavior.

### 1. Extension-first development

Use Mercur's public extension points before inventing custom workarounds.

First reuse built-in supported functionality; then use official extension points and the smallest project-owned adapter/module/workflow. Any upstream contribution, compatibility patch or fork remains exceptional and needs separate approval; no dependency-core edit is authorized by this list. See the [reuse-before-build gate](#mandatory-challenge-and-reuse-before-build-gate).

### 2. Domain ownership

DoğruAdres owns domain concepts such as vehicle, make, model, generation, engine, fitment, OE/OEM references, automotive taxonomy, catalog enrichment, and automotive-specific search or filter semantics.

These are domain concerns. They are not Mercur's marketplace primitives and must remain logically separated from framework internals.

### 3. Upgradeability is an acceptance criterion

Mercur must remain upgradeable. Do not treat Mercur internals as a project dependency or a place to patch casually.

If an implementation requires a private or internal Mercur detail, stop and re-evaluate the integration boundary.

### 4. No permanent workaround disguised as architecture

Project-local development infrastructure, such as `compose.dev.yml`, is infrastructure rather than a framework compatibility workaround or Mercur defect. It may still be reviewed during upgrades when local development requirements change, but it is not a temporary compatibility patch.

Temporary compatibility adjustments must be labeled, sourced and re-evaluated at each relevant Mercur upgrade. Check the current dependency and configuration state before assuming the historical Redis or root dependency exceptions still apply.

### 5. Product and architecture choices require approval

The coding agent does not independently decide product behavior, business rules, architecture boundaries, dependency strategy, security boundaries, payment policy, or destructive data behavior.

Stop the **affected** action when it needs a missing approval, present a supported recommendation, and continue independent work within existing authorization.

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

Apply risk-appropriate testing at the relevant layer, including as applicable:

- unit/domain tests
- adapter/contract tests
- integration tests
- workflow tests
- E2E tests
- security regression tests

The project should focus on high-value rules such as seller isolation, offer ownership, price integrity, order behavior, commission boundaries, payment/payout boundaries, and automotive fitment correctness.

The active M0/Vehicle acceptance and evidence requirements in §§12–13 remain binding. This paragraph is a layer-selection guide, not a separate test strategy or a reason to postpone existing required checks.

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


## Active R0/M0 delivery and authorization policies — later accepted controls

**Provenance and status:** The following binding sections were approved later than the archived `main` principles and are reconstructed from `feature/af-1-foundation-audit-outbox:docs/dogruadres/PRINCIPLES.md` (source blob `7dfa31e63787859aea2e475dd0364e84070f3d5e`) and its `SECURITY.md` (source blob `47dfef53731a650f0159c150eb5d7a500463ae9b`). [Accepted ADR-0007](https://github.com/DenizOner/DogruAdres/issues/35), [R0 complete evidence #206](https://github.com/DenizOner/DogruAdres/issues/206) and [M0 acceptance #147](https://github.com/DenizOner/DogruAdres/issues/147) preserve the decisions and their bounded evidence. The immutable source text is not modified. This active agent policy does **not** approve implementation or past test execution.

## Binding Vehicle authorization Policy A

Authority: Product Owner Architecture Consolidation R0; see ADR-0007. **L is the MVCC snapshot acquisition point of the final Foundation-owned coherent authorization SELECT, after the required Organization-scoped Vehicle lock/read and before the first Vehicle mutation.** For a successfully validated READ COMMITTED statement on the authoritative primary, revocation committed before L must be observed and deny access. Revocation committed after L may overlap the already-authorized operation and does not retroactively cancel it. This is snapshot-based ordering, not commit-time fencing.

Each operation requires a fresh final decision. Cached decisions, the Q2 non-atomic observer, a prior request, workflow retry/replay or a serialized attribution object cannot substitute. The decision must coherently validate exactly one actor mapping, enabled Person, active Organization, exactly one active membership and the current action/role; no platform-operator bypass. Authoritative actor, Person and role attribution must come from this same decision.

The trusted application/workflow sequence is: verified authentication → Vehicle-owned scoped lock/read → fresh Foundation coherent decision at L → resource-dependent evaluation → Vehicle mutation plus one canonical Vehicle audit and one durable outbox in one Vehicle transaction → commit/rollback → asynchronous derived Index delivery. Do not disclose resource-dependent missing/no-op/validation results before final authorization. No Foundation manager enters Vehicle; no Vehicle manager/context enters Foundation. No cross-module shared transaction or hidden module callback dependency.

The existing Vehicle mutation gate remains closed until real framework, persistence and security tests pass independent review. Query caching, primary routing, ambient context separation, statement isolation, cancellation and request/replay boundaries require explicit evidence. Fail closed on uncertainty. Preserve existing Organization isolation, actor validation, role restrictions and source audit attribution. Never accept an HTTP-supplied authorization decision, manager or role as authority.

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

## 12A. Permanent evidence-first and anti-repetition delivery discipline (D9 retrospective)

**Authority:** Product Owner approval on 2026-10-20, [M0/D9 Issue #217](https://github.com/DenizOner/DogruAdres/issues/217#issuecomment-6299069205); applies to Technical Advisor, local engineering agents, and independent testing work. This sharpens §§11–13; it never lowers a previously accepted security requirement, expands resource/write authorization, or overrides PO approval gates.

1. **Ask the decision-changing question first.** Before research or engineering, identify the exact approved user journey/invariant, the uncertain compatibility or security boundary, the smallest *end-to-end* decisive test, its pass/fail evidence, and the alternative if it fails. Prove the highest-risk framework/UI/auth/ingress integration before writing expansive specifications or building policy layers over it.
2. **Reuse prior evidence and its boundaries.** First consult canonical Issues, ADRs, accepted PoCs, exact framework versions and test state. Carry validated fixture/bootstrap/generated-file expectations forward in one reusable task preflight. Do not rediscover known Medusa link setup, Mercur `.mercur/routes.d.ts` generation or native bearer replay as new blockers. Never mistake PoC feasibility or an old assertion for production acceptance.
3. **Avoid investigation loops.** Continue inspection only while an answer can change an architectural choice, exploit mitigation, or acceptance decision. If one bounded probe reaches an observability limitation, record UNKNOWN/BLOCKED with concrete consequences and switch to a better targeted test or alternative. Do not automatically escalate from source inventory to logging to hooks to monkeypatching to deeper inspection. Investigate a collision's exact source only when it materially affects an auth or mutation boundary; keep broad route coverage obligations in force.
4. **Batch safely; stop at real scope boundaries.** Group non-destructive, task-owned steps with a clear shared data/resource envelope in one justified checkpoint instead of serial artificial approvals. Seek fresh Product Owner authorization when crossing an actual security/architecture, source-write, schema, fixture, deployment, or cleanup boundary. Preserve other worktrees, secrets, generated evidence and DB volumes; never infer permission from research.
5. **Deliver the smallest vertical user value early.** Demonstrate login → canonical Person → authorized Organization/role context → real backend permission check → logout/revocation with negative direct-native bypass evidence at the earliest viable slice. Extend to UI/browser, machine identities, MFA/D3, Seller/Buyer and concurrent authorization in the required acceptance order. A passing compiler, route count or debug event is never an authenticated browser/security PASS.
6. **Act within your own capabilities.** Technical Advisor performs GitHub decisions, source/documentation review, technical synthesis and issue/PR tracking directly; delegate to local agents only actions requiring the user's actual local runtime or an explicitly separated independent test. Prefer a concrete decision/recommendation and completed work over draft commands and repeated handoffs.
7. **Protect approved architecture and security gates.** Keep Mercur as marketplace engine and the accepted Person/Organization/Option A objectives unless the PO changes them. For native old-Bearer replay, PlatformStaffGrant, token transport and ingress, consult the **latest exact-SHA test status** in [M0 #217](https://github.com/DenizOner/DogruAdres/issues/217) and the active PR; do not freeze an earlier FAILED/UNVERIFIED snapshot as a timeless status. Private ingress or CORS alone is not credential revocation. Keep unresolved or unproven boundaries blocked.

8. **Maintain forward momentum without unnecessary handoffs.** Complete every independently authorized research, GitHub, evidence-reconciliation, review, documentation and planning action within the same work cycle. Do not pause after each sub-result, ask for approval already granted, or substitute a new draft command for work you can do directly. Escalate only when essential information is genuinely missing, when another party must perform an unavailable local or independent action, or when an explicit Product Owner decision is required for a real new permission boundary. At such a boundary, consolidate the decision and resource scope once; do not create a series of artificial micro-approvals. Never silently cross security, source-write, database, destructive or merge boundaries.

**Token-efficient handoff:** Agent commands must be self-contained: include the approved behavior, essential decision/security context, exact target checkout/branch/SHA (or an explicit preflight to resolve it), task scope and permissions, relevant source/doc locations, smallest acceptance/negative checks and stop conditions. Issue/PR links are traceability references, not a default instruction to reread entire history. Read only the additional source needed to resolve a material unknown or changed authority; reuse previously validated version- and SHA-scoped evidence without sacrificing fresh checks at changed security/runtime boundaries.

**Evidence language:** distinguish SOURCE VERIFIED, AGENT-REPORTED execution, independently observed HTTP/SQL/browser evidence, SECURITY FAILED, NOT TESTED and BLOCKED. Every completed checkpoint must state what actually changed the product/architecture decision and what remains unknown. Historical records remain intact; this rule does not authorize new BFF/core work, schema changes, destructive cleanup or a merge beyond existing scoped Product Owner permissions.

## 12B. Local resource custody and exact-target preflight (P0 workspace discipline)

**Authority:** Product Owner instruction on 2026-10-21; canonical [P0 Issue #229](https://github.com/DenizOner/DogruAdres/issues/229), as refined by the later [approved risk-based branch/worktree policy #216](https://github.com/DenizOner/DogruAdres/issues/216#issuecomment-6325812774). The latter supersedes only any blanket single-worktree restriction; exact-target checks, resource custody, module order, evidence and approvals remain binding. This is a mandatory local engineering preflight and retention rule, **not blanket permission to delete resources**.

1. **Reuse an authorized workspace by default; permit separately justified parallel work under #216.** Before mutable source operations, verify canonical path, Git root/common-dir, branch, exact HEAD, intended remote/PR and dirty state. Before any runtime, HTTP, browser, migration or DB action, additionally verify the relevant process PID/listener and actual container/database/volume ownership. Read-only documentation work needs no invented Docker preflight; never attribute runtime results to an unverified checkout, listener or database.
2. **A mismatched target is BLOCKED, not a repair instruction.** Do not switch branch, force fetch/pull, reset, restore, wipe untracked/ignored files, stop unrelated processes, or silently create another clone/worktree when preflight fails. Distinguish independent clone, main checkout, linked worktree, junction/reparse point, ordinary evidence directory and Docker mount before taking any action.
3. **Require a real isolation benefit before creating resources.** Reuse existing capacity unless an independent reviewable change, different base/runtime, blocked dependency, or necessary destructive-test isolation justifies a new branch/worktree. Record purpose, owner, resource/expiry manifest, expected size/cost and authorized scope under #216 before creating a new worktree, dependency copy, container, volume or port. Run parallel mutable tasks only with disjoint code ownership and separate task databases/volumes/processes; exactly one writing Agent per worktree and one mutating owner per task DB. A free Agent or a new SHA alone is not justification. Never assume a new database or fixture is authorized by the branch policy.
4. **Evidence before cleanup.** Keep a redacted inventory of all task-owned worktrees, branch/shas, ignored/untracked/unique artifacts, GitHub remote reachability, stashes/unpushed commits, active process/mount owners, DB/volumes and private proof/fixtures. GitHub stores tracked code but not necessarily ignored secrets, test DBs, local evidence or unpublished commits. A green `git status` alone is **insufficient** proof of reproducibility.
5. **Two-phase, candidate-by-candidate retirement.** First read-only inventory/classification KEEP / ARCHIVE-REVIEW / SAFE CANDIDATE / UNKNOWN under Issue #229. Then delete **only** individually revalidated, reproducible, inactive, clean linked worktrees containing no unique ignored/untracked evidence, via normal `git worktree remove <exact-path>` without force, recording bytes recovered. Never delete a main worktree or an independent clone by automatic pattern. Risk, backup/restore uncertainty, inaccessible paths, unknown remote or active tasks mean KEEP. No global `git clean`, `reset --hard`, forced worktree removal, wildcard filesystem deletion or worktree prune as a shortcut.
6. **Docker state has separate custody.** A source-tree removal **never** implies deleting containers, volumes, images or databases. Preserve all named PostgreSQL volumes by default; consider them only through an explicitly authorized, independently verified backup **and restore** pathway. No `docker system/volume prune`, `compose down -v` or broad cleanup.
7. **Return resources promptly after accepted checkpoints.** Record the GitHub branch and private evidence manifest, stop only task-owned services when safe, and evaluate disposable code/dependency cache retirement against resource cost. No short-lived investigation can create a permanent 20+-checkout burden. Maintain a clearly designated primary active worktree, a manifest/owner/expiry for each justified parallel workspace, and a documented KEEP list; do not enforce a blanket one-worktree limit.

8. **Treat failed deletion as an incomplete mutation, not success.** Verify final command exit/stderr and residual exact paths; on lock, long-path or Git metadata inconsistency, stop that cleanup batch, keep evidence and seek an individually authorized recovery. Never force-delete or auto-prune; verify real disk usage instead of apparent hard-link sizes.
9. **Resolve inventory discrepancies before deletion.** Count actual canonical filesystem/worktree entries, not filenames, top-level directory patterns or non-recursive tree output. Distinguish linked worktrees, independent clones, junctions and unknown folders. Incident-specific Windows commands and recovery evidence remain in [#229](https://github.com/DenizOner/DogruAdres/issues/229).

**Safety distinction:** A read-only SQL count, anonymous 401, compiled module or UI screenshot from an unexpected checkout is not evidence for a different PR SHA. A revoked actor-binding may already be denied by a live binding gate even if an older credential row remains; classify observed outcomes separately from inferred security failure. This P0 resource policy takes precedence over new feature-worktree creation until the existing D: inventory is reconciled.

## 13. One complete functional module and agent-owned browser acceptance

Binding Product Owner decision recorded by M0 on 2026-10-19: deliver one functional module at a time, including backend and frontend, rather than all backends followed by all frontends. Identity, User and Organization Management is active first, Vehicle second, then approved product priorities. Existing source-only work is preserved as evidence, not retroactively accepted. No different functional module may start implementation while the active module's mandatory acceptance remains open. Shared technical dependencies belong to its bounded plan and retain independent physical ownership.

A module is complete only after its entire applicable APPROVED business scope, domain data/persistence, authentication/authorization, real HTTP/workflows, UI interactions, canonical audit/outbox/integration and applicable unit/integration/security/concurrency testing are implemented and verified, all required real-browser journeys have independently executed evidence from the designated Work Testing Agent (or another expressly approved independent tester), and the Technical Advisor independently accepts it. Backend-only and frontend-only slices are internal checkpoints. Demonstrate an actual browser-capable vertical path at the earliest meaningful slice; do not accumulate unverified layers or postpone UI until all backend work is finished.

The Work Testing Agent must independently navigate the running application, authenticate synthetic users with relevant roles, execute real interactions, check visible success and rejection/validation/authorization/error/empty states, verify backend/persisted outcomes and refresh/reopen behavior, and retest after fixes. Cover cross-Organization isolation and role boundaries. Static renders, mock components, interaction-free screenshots, HTTP-only checks and simulated browser output are not browser acceptance. Technical invariants additionally need real API/database/security/concurrency evidence at the appropriate boundary.

Maintain a traceable matrix: approved requirement → role → UI entry point → action → expected visible result → backend/persistence assertion → browser test → actual result → evidence. Every required row must have executed evidence before MODULE COMPLETE. Missing browser support is ENVIRONMENT BLOCKED/NOT TESTED. An incomplete row blocks acceptance; no approved function may be removed or silently reclassified as deferred. Open parameters and proposed scope stay explicit and must be resolved through the existing decision rights without inventing product behavior.

Keep small reviewed checkpoints inside the active module, promptly fix confirmed defects within authorized scope and stop the affected feature on critical failure. Reuse valid historical evidence only within its original limits. Preserve module isolation, Policy A, canonical source-local audit/outbox atomicity and fail-closed gates. Major architecture/security transitions and module completion require Technical Advisor acceptance. The M0 governing decision is not blanket authorization for **additional** UI features, public Vehicle CRUD, dependency/core changes, production/shared data operations or publication. UI implementation **expressly approved within an M0 checkpoint** remains authorized within that checkpoint's boundaries; each further step requires its own applicable permission.

**Testing ownership:** The authorized Local Engineering Agent owns scoped implementation, focused tests, browser-capable engineering preflight and defect repair. The independent ChatGPT Work Testing Agent owns real-browser end-to-end acceptance for approved user-facing functions. Assignments may change only with explicit permission and preserved independence; they never relax §13 browser, persistence, negative-case or module-completion requirements. The Technical Advisor independently reviews architecture/security and module acceptance; the Product Owner retains scope, decision and merge authority. If Work/browser capability is unavailable, report NOT TESTED or ENVIRONMENT BLOCKED and keep the module gate open.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
