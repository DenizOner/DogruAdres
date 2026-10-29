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

## Binding Person–legal Organization–Store product model and architecture-conformance gate

**Product Owner clarification (29 October 2026; [M0 B22 #252](https://github.com/DenizOner/DogruAdres/issues/252)):** DoğruAdres does **not** legally adjudicate or certify a natural person's right to represent a company or a company's legal title to a store. Registration documents are collected for platform administration, verification, safety and audit, NOT a legal proof service. Here, "legal Organization" means **tüzel kişi**, and "proven legal ownership" in earlier engineering notes means a **platform-approved, auditable Organization↔marketplace-Store association**. Never require a court, notarial certification, legal attestation provider or new legal review gate solely because of that wording. The approved distinction remains: current Person + active Organization membership + explicit operation permission + platform-recorded Organization↔Store association + independent Store lifecycle/native role; missing/stale/unapproved association denies. Document requirements, safe retention, reviewers, exceptions and ownership-change processes must be taken only from approved decisions; do not fabricate documents, approve existing sellers automatically, or reveal any document/PII in public logs. Older interpretations in this section yield to this scoped clarification without weakening permissions, data isolation or independent acceptance.

**Authority:** approved [#23 DA-ID-001](https://github.com/DenizOner/DogruAdres/issues/23), [#24 DA-ID-002](https://github.com/DenizOner/DogruAdres/issues/24), [#36 DA-ORG-001](https://github.com/DenizOner/DogruAdres/issues/36), [#37 DA-ORG-002](https://github.com/DenizOner/DogruAdres/issues/37), [#40 DA-ORG-005](https://github.com/DenizOner/DogruAdres/issues/40), [#42 DA-ORG-007](https://github.com/DenizOner/DogruAdres/issues/42), [#43 DA-ORG-008](https://github.com/DenizOner/DogruAdres/issues/43), [#47 DA-SEC-003](https://github.com/DenizOner/DogruAdres/issues/47), [#54 DA-APP-001](https://github.com/DenizOner/DogruAdres/issues/54), [#61 DA-APP-008](https://github.com/DenizOner/DogruAdres/issues/61), [#76 DA-MKT-009](https://github.com/DenizOner/DogruAdres/issues/76), [#81 DA-FIN-001](https://github.com/DenizOner/DogruAdres/issues/81), and Product Owner's Option A / D6 [#217](https://github.com/DenizOner/DogruAdres/issues/217). The 29 October 2026 Product Owner clarification is recorded in [#203](https://github.com/DenizOner/DogruAdres/issues/203#issuecomment-6495092589). This is a binding product-model interpretation, **not** authorization to fabricate currently missing legal-ownership links, migrations, roles, screens or test evidence.

1. **One human, one sign-in.** A natural person uses one canonical `Person` and first-party opaque personal session to access authorized personal, legal-organization and platform-staff contexts. Technical Medusa/Mercur `user`, `member`, `customer`, `seller` and `vendor` concepts are adapter/auth, module or store records **not distinct DoğruAdres human business identities or separate buyer/seller/vendor sign-in panels**. Do not mirror upstream UI nomenclature, authentication or navigation as approved product requirements merely because an upstream app exists. Server-only verified actor binding is required; no browser-visible native actor JWT or implicit email identity merge.
2. **Legal entity is the commercial principal.** Only an eligible, active legal `Organization` buys and sells; it may own multiple independently authorized/approved `Store` records. Each Store has one currently authoritative legal Organization owner, subject to the approved lifecycle; Store approval, pricing, balance, suspension and permissions are scoped per Store. A person or technical `Seller`/`Customer` record is not the legal buyer/seller, and Mercur `Seller.is_owner` is not a DoğruAdres protected Organization Owner. Personal buying and second login are not acceptable workarounds.
3. **Separate access scopes; unified user experience.** The visitor selects an authorized Organization within a consistent personal/workspace experience; buying and selling are permitted capabilities of that Organization, not mutually exclusive account types or mandatory standalone panels. Keep personal resources independent from Organization selection. Platform staff requires a separate explicit grant and cannot see Organization-private data by default. A display tab, launcher app ID, preference, sector flag, actor binding, Member–SellerMember join, selected seller ID or accessible upstream dashboard URL **never** creates legal ownership, Store entitlement, procurement rights or authority.
4. **Request-time complete authority chain.** For every protected commercial read/write (including API, workflow, job, search, cache, export and file), prove from authoritative current records: authenticated canonical Person → active Organization/membership → explicit action permission and legal Organization eligibility → **proven Organization↔Store/Seller ownership relationship** (when Store-scoped) → live Store/Member/Seller/SellerMember status and native downstream role as applicable → server-resolved resource context. For buying, select/validate the Buyer Organization before commercial cart/checkout; independently enforce Store-specific Buyer Organization blocks and no silent partial checkout. Recheck revocation/epoch and coherent authorization Policy A as applicable. Missing/inconsistent links or ambiguous data **fail closed**; do not infer them from native Seller membership, matching email, a URL/header or a prior test fixture. Do not claim that a successful `/vendor/members/me` read proves Organization-owned commerce authority.
5. **Cross-layer conformance preflight before implementation.** For identity, Organization, Store, marketplace, access or launcher work, inspect relevant canonical decisions (including later scoped amendments), installed Medusa/Mercur versions and **both** existing DoğruAdres backend/frontend contracts. Map the intended user journey through Person, Organization, Store, native actors, storage, UI, API, middleware, workflow, audit and relevant negative paths. Classify each link **READY AND SUFFICIENT / CONFIGURATION OR OFFICIAL EXTENSION REQUIRED / GAP PROVEN / UNVERIFIED**. Do not select a technical `vendor` dashboard or `buyer` storefront as product UX by default; do not implement a convenient narrow adapter as if it satisfies the full legal-resource contract.
6. **Architecture correction must be complete, not cosmetically minimal.** When a wrong foundational premise is proven, examine its entire affected behavioral and data-flow surface before designing the replacement. Reconcile UI language/navigation, API/DTO, ownership models, persistence/migration compatibility, roles/policy, existing records, integrations, tests and independently reviewed evidence as needed for one coherent approved product outcome. Reuse supported platform primitives; neither broad rewrites nor quick labels/proxies are authorized substitutes for proved, end-to-end correctness. Identify missing cardinality, migration and compatibility decisions explicitly; preserve existing data and rollback. Separate already-approved invariants from still-open recovery/ownership-transfer/branch/checkout policy; never silently fill those gaps.
7. **Mandatory negative acceptance and review.** Demonstrate one Person operating across two independently authorized Organizations and multiple Stores, both buying/selling where authorized; reject wrong Person, foreign Organization/Store, forged context, mismatched legal owner, suspended/unapproved Store, revoked membership/ownership, stale actor, staff bypass, expired/locked session, cached cross-tenant data and replay. Verify per-Store financial separation and buyer-blocking only in their approved functional scope; do not run unapproved payment or production writes. Test real browser/HTTP/database and persistence for changed risks, obtain independent exact-source review, and distinguish scoped checks from full acceptance. Retain unaffected existing PASS; do not claim multi-Store or combined-commerce PASS from a single native actor GET.
8. **Guardrail against recurrence.** Before any design, code, Agent assignment or acceptance statement affecting these domains, write down in the *existing* Issue/PR: (a) the real visitor and legal principal, (b) source-owned authority chain and explicit missing links, (c) which Mercur/Medusa actor types are merely internal, (d) relevant negative path, (e) exact evidence and its limits. Challenge contradictions with older suggestions or UI labels against binding decisions; treat proposals, historical interpretations and old technical implementation as nonauthoritative where they conflict. If a fundamental design correction needs a new substantive product/security decision, stop only that unsafe operation and surface the single remaining choice; continue independently authorized work.

This gate supplements, and does not replace, the mandatory reuse-first rule, independent source review, explicit write/migration/resource permissions, protected `main` branch, and evidence requirements.

## Canonical project decision lookup

Before DoğruAdres architectural or domain work, read this root `AGENTS.md`, the relevant current source/tests, and the **specific approved decisions necessary for the task**. Prefer a self-contained Agent handoff that embeds their full applicable scope, exact SHA, known limitations and accepted invariant text; a GitHub Issue link is a provenance/synchronization pointer, not by itself a requirement to reread entire historical threads. Consult the latest canonical `[DEC DA-*]`/`[DEC ADR-*]` Issues, the [decision index #141](https://github.com/DenizOner/DogruAdres/issues/141), or active work/QA Issue **only when** the instruction lacks a decision, evidence is stale or contradictory, the scope changes, or a final authorization is required. Do **not** use removed project `docs/` files as a second operational authority. If necessary authoritative material is unavailable, stop that affected decision rather than guessing at business/security/financial policy.

## OWASP-first security implementation (Product Owner approval, 2026-10-24)

Canonical decision: [Issue #244](https://github.com/DenizOner/DogruAdres/issues/244).
For **every** DoğruAdres frontend and backend development change, before writing code identify the applicable and proportionate security requirements from [OWASP ASVS 5.0.0](https://asvs.owasp.org/) and the relevant OWASP Cheat Sheets; use [OWASP Top 10:2025](https://top10.owasp.org/2025/) to prioritize risk. Inspect actual request/response, Medusa/Mercur middleware, actor/tenant/target, secrets and side effects first. Test the meaningful security boundaries of the **changed** real flow, including authorization, identity disclosure, token/session/replay, injection, CSRF, SSRF, TLS, unsafe redirects, error handling and data integrity as applicable. Do not claim broad OWASP compliance from a passing unit suite or a design prototype. Do not add unnecessary infrastructure, repetitive tests or independent approval ceremonies that are not otherwise required. Existing DoğruAdres frontend/backend code must also undergo the risk-prioritized retrospective audit managed by #244; respect protected data, project scope and no-paid-services policy.

**Contextual product security communication:** User-visible explanations must be truthful, relevant and proportionate. Payment/security-sensitive screens may explain concrete safeguards and risks when that helps a user's decision. Do not add fabricated guarantees, unverifiable compliance claims, infrastructure/tool advertising, raw internal IDs or technical audit slogans to ordinary UI. Never suppress genuine legally required notices or the SMTP/network fields an authorized administrator needs. Protect unauthorized users from discovering others' identities, organizations, memberships or existence; apply server-side scope checks and data minimization, not just visual masking. Use #243 and #242 for detailed functional acceptance.

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

**Binding Product Owner decision: [#211 — GÜV-ÜCRETSİZ-001](https://github.com/DenizOner/DogruAdres/issues/211) (2026-10-20), final and non-negotiable.** No paid plan, trial that can convert to paid, subscription, SaaS capability, license, add-on or software may be proposed, used or planned for DoğruAdres. This explicitly includes GitHub Pro/Team/Enterprise. Do not offer an upgrade to solve a technical blocker.

- If an essential capability is unavailable for free, report **FREE-PLAN CAPABILITY BLOCKED** and propose only genuinely free alternatives; never misrepresent a process check as enforced platform security. Free access alone does not authorize private data transfers, provider connections, new closed-source dependencies, production access or architecture changes.
- **22 October 2026 Product Owner update:** this personal GitHub repository is intentionally **public** to use GitHub Free standard hosted-runner capacity. Public GitHub Free repositories may support enforceable branch protection/rulesets, but no enforcement is assumed until the exact settings are independently verified on this repository. Regardless of technical enforcement, require independent source review, exact PR HEAD/base and relevant scoped CI evidence. The 24 October 2026 Product Owner decision in #208 removes the separate per-PR Product Owner merge authorization once all review and test gates pass. Never enable paid security features or relax secret/privacy controls because the repository is public. See [#208](https://github.com/DenizOner/DogruAdres/issues/208) and [#235](https://github.com/DenizOner/DogruAdres/issues/235).
- Write new GitHub Issue titles, user-facing descriptions, acceptance criteria and progress reports in **Turkish**. Prefer Turkish in PR summaries. Engineering/AI Agent executable instructions are in **English**. When translating old Issues ([#212](https://github.com/DenizOner/DogruAdres/issues/212)), keep immutable historic evidence, original statuses, source code symbols and IDs intact.
- GitHub Project status, a completed research issue or a successful CI run is never Product Owner approval or completed feature acceptance.

### Independent-review merge authorization (Product Owner update, 24 October 2026)

**Binding canonical decision: [#208](https://github.com/DenizOner/DogruAdres/issues/208), superseding the former per-PR Product Owner merge signature requirement in #208/#211.** Within an already authorized delivery scope, the authorized Technical Advisor / maintainer may merge a PR **without requesting a further Product Owner approval for that PR or commit**, but only after all of these observable gates:

1. A **genuinely independent execution** (not the source-writing/fixing execution) reads the current complete relevant diff/source, approved scope and security/architecture boundaries and returns an evidence-backed **PASS**. The review executor may be a distinct ChatGPT conversation, separately tasked Antigravity Agent session or independent human; it must actually inspect the primary GitHub source, not repeat the author's explanation. The same GitHub login neither proves nor disproves independence; `commit.author`, PR author, GitHub `APPROVED`, model label and separate window are **not proof** by themselves.
2. All applicable **real CI, security, test and functional acceptance** gates for this change pass on the correct source; significant user-facing/security changes retain the required real-browser, HTTP, persistence and negative-path evidence. No unresolved blocking finding, failed required check, unapproved scope change or false test PASS is permitted. A green build, lint, mock or self-review alone is insufficient.
3. **Immediately before merging**, verify PR branch, current HEAD and base, changed-file scope, up-to-date independent PASS evidence, actual applicable CI outcomes, mergeability, and any *actually enabled* GitHub branch protection/ruleset. If either revision or the relevant risk/scope changes, obtain proportionate fresh independent review and CI; if proof is missing or a blocker remains, do not merge.
4. Use GitHub's normal PR merge, **never direct main push/force push**; record actual merged/main SHAs, exact reviewer and CI references in the existing PR/Issue. Successful code merge is **not** automatic product/module/browser acceptance or authorization to deploy.
5. Existing **separate Product Owner decisions** are still required before new product/security/architecture policies, major dependencies, forbidden-cost services, destructive data/migration operations, production deployment, repository security settings, and other explicit approval-bound actions. This general merge policy does not authorize those actions or override an explicit PR-specific hold.

### Shared-credential reviewer provenance and read-only assignment (binding #208)

GitHub `DenizOner` credentials identify the shared **transport/account**, **not** which ChatGPT conversation, Antigravity execution or person wrote or reviewed code. Do not invent alternate commit identities, `APPROVED` reviews, cryptographic signatures or verified session IDs. Independence here is **documented operational separation**, not authentication-level proof.

1. **Identify actual writers:** In the PR record, distinguish the GitHub account from the real source-authoring/fixing executor(s) and their task/session context, as far as known. If contributors or work provenance are unknown, mark `UNVERIFIED`; a shared commit author field cannot fill the gap.
2. **Assign a separate read-only reviewer:** Use a genuinely distinct Agent task/execution or independent person. A new isolated ChatGPT conversation can qualify if it does its **own** primary-source investigation and is not merely this authoring conversation renamed or its answers replayed. A different Antigravity run can qualify without a different GitHub account. The reviewer must receive the PR/HEAD/base, approved boundaries and review questions; the author's self-assessment is not the review oracle. No new account, paid tool or user relay is required when tools can directly record the report.
3. **Independently inspect complete source:** Reviewer reads the GitHub exact current HEAD/base, complete changed-file inventory and full diff/relevant whole files, applicable decisions and security invariants; confirms whether any files/truncated portions are inaccessible. Compare behavior and negative/security paths, actual CI/executed tests and known baseline failures. CodeQL and GitHub Actions are complementary checks, **not an independent reasoning/review executor**.
4. **One structured report in the PR conversation:** Use `REVIEW-PROVENANCE-v1` fields: `target(repo, PR, HEAD SHA, base SHA)`; `writers(actual executor/context or UNVERIFIED)`; `reviewer(actual executor type, separate execution context, source of assignment, any real run/task reference, why separate)`; `transport(the shared GitHub account; who submitted/relayed the original report)`; `inspected(complete files/diff and decision boundaries)`; `evidence(actual test commands or linked run IDs and commit targets)`; `findings/open risk`; and `verdict(PASS|CHANGES REQUIRED|BLOCKED)`. An absent native run/session ID must be reported honestly, not manufactured; preserve the actual separate assignment/report origin when available. Never publish private conversation transcripts, tokens or secret data in a public repository. A pasted report must be labeled `AGENT-REPORTED / RELAYED`, not portrayed as signed/authenticated by GitHub.
5. **Fail closed without credible separation:** The original author, a model merely repeating its own earlier assessment, an unlabeled relayed review, a reviewer without primary-source coverage, or only green CI **cannot** grant independent `PASS`. State `INDEPENDENCE UNVERIFIED / BLOCKED` if there is no credible actual separate execution and source evidence; report missing proof rather than ask the Product Owner to self-review.
6. **Changes invalidate only affected proof:** If an independent reviewer edits any code they become a writer of that change; obtain review by another distinct execution of the revised material. A new HEAD or base requires fresh applicability checks, with risk-proportionate re-review and CI. Immediately before a normal PR merge, the authorized merger independently checks provenance/report, exact current SHA pair, blockers, applicable actual CI/security/acceptance, mergeability and real GitHub rules; record the merged main SHA. No separate per-PR Product Owner merge approval is needed once all gates pass.

**Read-only review task directive (English, for a genuinely separate executor):**
> Review `DenizOner/DogruAdres` PR `<number>` at exact `<head SHA>` against `main` `<base SHA>`. You did not author this change. Do not treat author summaries or another review as evidence. Without changing repository files, refs, branches, worktrees or application data, independently inspect the complete GitHub diff/changed files and relevant canonical #208 / AGENTS / ADR rules; verify actual CI and security/test coverage, report missing/unexecuted checks. Return `REVIEW-PROVENANCE-v1` with your **real** task/executor provenance (and honestly unavailable IDs), full SHAs, source coverage, findings, evidence links, and `PASS`, `CHANGES REQUIRED` or `BLOCKED`. Do not claim GitHub identity, signature, or separate `APPROVED` status. Do not merge or perform data writes as part of read-only review.

**Do not create an unsupervised auto-merge bot or interpret auto-merge enabled as proof of independent review.** An authorized executor may perform merge without escalating it to the Product Owner once the above evidence has been verified. The free-only #211 policy remains unchanged.

## GitHub/local synchronization and safe Agent execution (mandatory)

**Canonical source of shared committed work:** GitHub remote refs and reviewed PRs. Local checkouts are mutable workspaces, not automatically current or authoritative. Fetching metadata is not permission to overwrite local files. Never presume that `origin/main`, the current checkout, another worktree or a previous Agent report reflects the live target.

### Handoff contract: exact target and writer ownership

- Every local Agent instruction MUST specify: repository `DenizOner/DogruAdres`, canonical absolute Windows working directory, expected Git top-level and (if relevant) common Git directory, **exact authorized branch**, remote `origin`, verified remote HEAD full SHA at handoff, intended PR/base ref and base SHA where applicable, named writing Agent/ownership, authorized file/data scope, forbidden branches/resources, tests, stop conditions, and completion report. If a value is unknown, mark it **UNVERIFIED** and require read-only discovery before work; do not invent a directory or HEAD.
- The Technical Advisor checks live GitHub branch/PR state immediately before drafting a handoff and again before accepting its commits. Never hand out an old SHA as though current. Each write assignment has exactly one owner for a given branch/worktree scope; coordination is required before other GitHub-side writes to that same branch. Concurrent GitHub-side and local writes to the same branch must be serialized; otherwise use approved disjoint branches/worktrees and reviewed integration.
- An Agent must begin with a **read-only target preflight** from the specified absolute directory: `git rev-parse --show-toplevel`, `git rev-parse --git-common-dir`, `git branch --show-current`, `git remote -v`, `git status --porcelain=v1 -uall`, `git rev-parse HEAD`, `git ls-remote origin refs/heads/<target-branch>`; also inspect the intended upstream and worktree mapping. Verify that repository identity, branch, path, task owner, remote and full commit IDs match the handoff. Inspect tracked, staged, untracked, ignored, stash and unique-local-commit risks as appropriate before any syncing or cleanup. An Agent working in a linked worktree must not confuse its common Git dir with its physical worktree root.
- If the remote moved since the handoff, or local HEAD diverges/has unique commits, stop **only mutating steps** and report both SHAs, divergence and preserved local changes for Technical Advisor reconciliation. Do not silently switch branches, change roots, cherry-pick, rebase, merge, stash, reset, clean, force-update or overwrite data. A dirty checkout is NOT an invitation to run `git pull`. A clean checkout behind its intended remote may be fast-forwarded only after correct target/ownership is proven and existing work is preserved. Recheck live remote tip just before the first write, and periodically at significant handoffs.
- A task is **not synchronized** merely because tests passed or a local commit exists. The Agent must aim to end each authorized cohesive coding task with a normal non-force push of every task-owned commit to the **specified authorized review branch**, then independently verify with `git ls-remote` and report exact local HEAD, remote HEAD, branch, PR and status. Do not push to `main`, another branch, or an unapproved remote. Use explicit target refspec (e.g. `git push origin HEAD:refs/heads/<target-branch>`), not blanket push. The push is conditional on preflight, passing necessary checks, scope/secret review and approved publishing authority; it must never bypass a real block.
- When push is rejected, remote advances, the branch is wrong, secrets may be present, tests reveal a security failure or scope is uncertain: **do not force-push, change protections or conceal local commits.** Preserve work, mark `LOCAL COMMITTED / REMOTE NOT SYNCED`, report commit SHA, exact push error, remote SHA and safe reconciliation proposal. The task stays incomplete for publication purposes. Do not claim all work is lost; remote publication and functional acceptance remain distinct.
- At completion, report verified absolute path/common-dir, branch and upstream, starting/ending full SHAs (local and live remote), dirty/untracked state, pushed ref and verification, changed paths, relevant tests/results, PR link/base, ownership release, preserved local-only materials and blockers. Technical Advisor checks remote evidence independently before further GitHub writes or next local command; GitHub-side commits invalidate older local baseline instructions.
- Keep this procedure proportional: read-only reviews do not require a push, tasks with no commit have nothing to push, and genuinely blocked publication must stop safely with preserved recovery evidence. This synchronization procedure does not bypass the independently reviewed merge authorization in #208; it never authorizes deployment, credential exposure, history rewriting, cleanup or a new branch.

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

- **Treat the approved end-to-end outcome and its acceptance criteria (including negative/security criteria) as the unit of progress.** Identify what remains to pass, then complete authorized investigation, implementation, targeted tests, fixes, evidence review and safe cleanup toward that outcome. Do not manufacture micro-tasks, speculative research, extra infrastructure or ceremonial checkpoints unless they are needed for acceptance, safety or a real blocker. Commits, CI and independent reviews remain evidence gates, not automatic requests for repeated user approval. Work on the existing authorized initiative branch unless a separate branch is genuinely justified; preserve all mandatory authorization and independent exact-PR merge/deploy gates.
- Use the smallest sufficient automated/HTTP/DB/browser checks for the **changed behavior and risk**; reuse previous evidence only within its exact version, SHA, target and security boundary. Significant user-facing flows require independent real-browser E2E acceptance, not screenshot- or mock-only claims.
- Publish scoped commits to the authorized review branch for independent review. Report commit/PR HEAD and base, changed files, actual test outcomes, security gaps and blockers. Pause at a genuine review or permission boundary; do not require repeated micro-approvals for actions already authorized.
- Never push directly to `main`, force-push, deploy or alter repository settings without the applicable authorization. PR merge may proceed **without new Product Owner permission** only under the exact HEAD/base independent-review, applicable CI/security and no-blocker gates in [#208](https://github.com/DenizOner/DogruAdres/issues/208).
- Baseline test failures unrelated to the change should be recorded, not hidden or falsely counted as passing; do not weaken tests to make a build green.

## Branch lifecycle

- A branch represents a coherent reviewable initiative, not each task/commit/checkpoint. Reuse the existing task branch when possible; check existing branches and worktrees before creating another.
- Default to serial work, but allow justified parallel work only under the newer [#216 isolation/ownership policy](https://github.com/DenizOner/DogruAdres/issues/216#issuecomment-6325812774). Parallel read-only GitHub/source review ordinarily needs no new branch.
- A new worktree/branch requires an actual independent review or isolation need, a distinct owner, known base and expected retirement criteria; it never implies extra database, fixture, deployment or merge permission.
- Report only task-relevant branch/HEAD/dependency changes and cleanup candidates; perform no automatic branch or worktree deletion. Before removing any ref, reconcile local dirty/untracked/ignored work, unique commits, dependent PRs, runtime/DB owners and preserved recovery evidence.
- Never push directly to `main`, force-push, deploy or change repository settings without separate explicit approval. PR merge follows the documented independent-review gate in #208 rather than a separate per-PR Product Owner approval.

### Risk-based worktree, resource and agent handoff rules (2026-10-21)

The binding, evidence-based lifecycle decision is [Issue #216](https://github.com/DenizOner/DogruAdres/issues/216#issuecomment-6325812774), based on actual [Issue #229](https://github.com/DenizOner/DogruAdres/issues/229) incidents. **One mutable integration worktree is the default, NOT an unconditional maximum of one branch/worktree.** Open another only for a demonstrably independent PR, hotfix, separately isolated test/migration or blocked dependency that cannot safely run in the current tree. Do not create worktrees for each agent, command, SHA or checkpoint. Read-only GitHub review and CI can run in parallel.

**One writer per worktree and one mutating owner per task database.** Concurrent writers must not share `service.ts`, migrations/snapshots, `bun.lock`, tracked generated declarations, Docker volumes, ports, or mutable credentials. If code or resources overlap, serialize writes or make one agent read-only. A new branch/worktree/resource never grants its own approval for fixtures, migrations, destructive changes or main merge.

Before first mutation or new task-owned worktree, verify the *actual* filesystem root, Git common-dir, branch, upstream and exact SHA; `git worktree list --porcelain -z`; dirty/index/untracked/ignored state; task-specific PID/port, Docker labels and **real Mounts/volume**, DB identity, private evidence and owner. Record a small task-private manifest with those identities, reason for isolation, stop/cleanup condition and protected inputs. Never infer target from folder names. Preserve original bytes and SHA of local dirty/generated files; no force/reset/clean/stash-pop to "fix" mismatches. GitHub/source tests against a different SHA/DB are NOT acceptance.

At completion, close clean, reproducible worktrees individually with `git worktree remove <exact path>` *without force* only after checking every unpushed commit, tracked/untracked/ignored file, local-only evidence, active consumer and Docker/DB owner. Dirty worktrees, unknown backups, database volumes and shared Git roots remain KEEP. Remote branch deletion follows separate Issue #216 and final-HEAD merge/supersession verification.

**Token-efficient agent handoffs:** Every executable task message embeds the approved behavior, latest exact root/branch/SHA, relevant changed paths, concise failure history, permissions/nonpermissions, targeted tests and explicit stop/deliverable gates. Link to a GitHub Issue for provenance/updates, **not as a routine fetch-and-reread instruction**; fetch the Issue only if these embedded facts conflict or newer authority is needed. Read only the relevant installed, version-matched Mercur/Medusa reference section. Reuse exact-SHA valid evidence where unaffected, but never skip fresh root/DB safety checks for new mutations.

## Cross-branch documentation cutover and safe integration

When a feature branch predates the GitHub-only governance cutover, its `docs/dogruadres/**` source files may still exist and may contain newer product approvals or unique engineering evidence. **Do not blindly merge them back into `main`, delete them in-place, rewrite their history, or treat their presence as a second canonical rulebook.**

1. Compare the exact feature-branch blobs with the canonical GitHub Issues and immutable provenance on the branch being integrated; transfer every genuinely newer accepted scope, source-specific supersession, and unique bounded test report before considering removal. An archived `REQUIREMENTS.md` is not proof its old open parameters remain unresolved after later dated Product Owner approvals.
2. Treat accepted ADR-0005/ADR-0006 and later scoped Vehicle/Audit amendments as binding only within their recorded approval scope. The earlier ADR-0004 co-location approval is superseded. Preserve historic wording, but route agents to the latest explicit accepted decision and the current authorized implementation gate.
3. Reconcile `docs/dogruadres/**` paths in a **separately reviewed integration/cleanup change** so that merging an old feature branch does not silently resurrect already retired governance documentation. Source blob IDs and Issue links must survive, including active AF-1, Vehicle and SAFE-0A evidence records.
4. Independently review the complete code diff and scope, not merely the Markdown cleanup. In particular, `feature/af-1-foundation-audit-outbox` also contains `dogruadres-vehicle` source and migrations; no blanket branch merge or accidental Vehicle implementation authorization follows from a documentation migration or accepted ADR.
5. Do not delete or rewrite an active dirty local worktree or feature branch to perform cutover. Do not merge into `main` before independent-review and CI gates in #208 are met; a draft PR must be ready and reviewed. Deployment, fixture creation, data mutations, repository protection changes and other separately gated actions retain their required Product Owner authority.

## GitHub-centered decision, task, evidence and migration workflow

GitHub is the single canonical collaboration platform, with **separate responsibilities**:

- **Discussions:** exploration, competing proposals and unresolved questions where authenticated support exists. Neither closing nor an answered badge grants approval; verify publication before reporting it.
- **Decision Issues (`[DEC DA-*]` / `[DEC ADR-*]`):** approved business/architecture decisions, exact scope, Product Owner/date provenance, status and supersession. Proposed/open/deferred parameters are **not** approved.
- **Work/QA Issues:** authorized work boundaries, dependencies, affected user journeys, negative/security criteria, actual tests, blocked items and results; **PRs** carry and review code changes. Completion of one research/test checkpoint does not close dependent work or prove runtime acceptance.
- **Projects:** optional triage/status overview, never authorization. **AGENTS.md:** concise enduring agent-execution rules, not a historical log or a second product requirements database.

**Ownership:** The Product Owner decides business/security/architecture policies and action-specific permissions; the Technical Advisor independently investigates, recommends, reviews and handles its own accessible GitHub/evidence work. The authorized Local Engineering Agent implements and runs focused checks within scope; the independent Work Testing Agent executes real-browser acceptance when available. Agent instructions are English; Product Owner-facing explanations and Issues are Turkish. A work Issue, label, assignment or broad approval never grants new implementation, source-write, database or deployment authority; PR merge is available only with the verified independent-review gate of #208.

**Status and evidence:** Distinguish APPROVED / PROPOSED / OPEN / DEFERRED / SUPERSEDED decisions; SOURCE VERIFIED / TEST EXECUTED PASSED or FAILED / AGENT-REPORTED / NOT TESTED / BLOCKED execution; and individually accepted functionality. Never infer the next state from the previous one. Search existing Issue/PR records before opening duplicates; store new conclusions once in their canonical record.

**Historical documentation migration and branch integration:** For legacy branches containing `docs/dogruadres/**`, read the **relevant** immutable source, approved later changes and current Issues before deletion/merge. Preserve all unique approved clauses, original statuses and full provenance; verify blob equivalence and updated links. Remove duplicates only in a scoped reviewed cleanup change after migration verification, retaining the original immutable history. Do not resurrect retired governance docs through a feature merge, blindly merge mixed AF-1/Vehicle code, overwrite dirty checkout evidence, or infer that a documentation decision authorizes production functionality. Source or documentation approval does **not** authorize implementation, and by itself is insufficient for merge; the exact-PR independent-review and CI gates in #208 still apply. See [#18](https://github.com/DenizOner/DogruAdres/issues/18), [#141](https://github.com/DenizOner/DogruAdres/issues/141), [#210](https://github.com/DenizOner/DogruAdres/issues/210).

**Significant decision Issue minimum:** stable ID, question, approved/proposed wording, decision maker/date and scope, alternatives, impact/trade-offs, source/provenance, superseded clauses, safety/financial limits, acceptance/negative tests, dependencies and links. Do not invent approval, timestamps, vendor choices or unresolved parameters.

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

**Evidence boundaries and execution choice:** Unit tests verify isolated rules (sometimes using mocks); smoke tests establish only application startup and basic reachability. Neither alone proves a real authorized transaction or persisted result. Where a Mercur/Medusa integration assumption is unverified, prioritize the smallest **authorized test of the actual platform runtime**—module initialization, API/middleware, workflow/provider, database writes and side effects as relevant—before relying on isolated assertions. Here, *native* describes the real execution path of an integration/contract test, not an additional mandatory test layer. Select and sequence tests by changed behavior, risk and valid prior evidence; do not mechanically demand every layer or introduce test infrastructure without demonstrated need. See the [approved testing clarification for M0](https://github.com/DenizOner/DogruAdres/issues/147#issuecomment-6464818515).

The project should focus on high-value rules such as seller isolation, offer ownership, price integrity, order behavior, commission boundaries, payment/payout boundaries, and automotive fitment correctness.

The active M0/Vehicle acceptance and evidence requirements in §§12–13 remain binding. This paragraph is a layer-selection guide, not a separate test strategy or a reason to postpone existing required checks.

### 10. Roles and decision rights

These responsibilities are mandatory and do not expand an operation's authorized scope. Existing approval gates, authority precedence and accepted ADRs remain in force.

- **Product Owner:** defines business goals, behavior, priorities and budget; approves or rejects requirements, business policies, architectural proposals and significant tradeoffs; authorizes bounded implementation and repository changes. The owner makes informed decisions from understandable recommendations and is not expected to understand source code, Git internals or Mercur extension mechanisms. Never require the owner to design a technical solution that the advisor or agent should prepare.
- **Technical Advisor and Architecture Coordinator:** performs independently all work supported by available tools; uses the Product Owner as the relay for instructions to and output from local Agents when local access is necessary; translates business goals into technical requirements; investigates alternatives, risks, contradictions, gaps and technical debt; recommends a resolution for every actionable problem, explaining rationale, material tradeoffs and alternatives. Separates technical recommendations from genuine business decisions, prepares precise bounded agent instructions, reviews evidence and completed work, and guides the owner toward the recommended next action. Advice is not Product Owner approval.
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

**Authority:** accepted [#217 retrospective](https://github.com/DenizOner/DogruAdres/issues/217#issuecomment-6299069205). Applies to Technical Advisor, engineering and independent testing; it does not relax security/approval constraints.

1. **Start with the decisive unknown:** state the approved user outcome/invariant, current framework/auth/security uncertainty, smallest decisive real end-to-end or contract check, expected pass/fail evidence, and fallback. Prove dangerous integration assumptions before implementing broad new layers.
2. **Reuse known proof:** consult only relevant current Issues, ADRs, exact framework version/checkout, accepted PoCs and test baselines. A previously proven bootstrap/generated-route rule is not a fresh discovery; PoC feasibility is not production acceptance.
3. **Bound investigations:** continue only while new evidence could alter architecture, safety or acceptance. When probing cannot prove a behavior, record UNKNOWN/BLOCKED and choose a more decisive approach; no recursive logging/hook/monkeypatch exploration without a demonstrated need.
4. **Batch authorized steps intelligently:** group non-destructive, task-owned work within one scope; stop at a *real* security, code-write, schema, shared-data, cleanup, deploy or merge boundary. Do not seek multiple approvals for what was already approved, and do not infer new permission from adjacent work.
5. **Demonstrate vertical value early:** for M0, prove login, canonical Person, authorized Organization context, true server-side enforcement, logout/revocation, native-bypass negatives and ultimately real UI/browser flows in the approved sequence. Compilation, route enumeration or mocks do not prove those outcomes.
6. **Do the work within your own tools:** Technical Advisor directly handles available GitHub/source/evidence/research tasks. Delegate only inaccessible local runtime actions or independent testing. No redundant tasks or agents for already actionable work.
7. **Protect actual security gates:** Mercur remains the engine and accepted Person/Organization/Option A boundaries remain. For changing native bearer replay, PlatformStaffGrant, ingress and token-transport findings consult the **current exact-SHA** status in [#217](https://github.com/DenizOner/DogruAdres/issues/217) and active PR. No CORS/private-ingress claim substitutes for real revocation; maintain blocked status where runtime proof is missing.
8. **Hand off efficiently:** self-contained English Agent command with accepted behavior, relevant invariants, exact target root/branch/HEAD (or safe preflight), authorized file/data scope, relevant installed-doc paths, smallest acceptance/negative checks, stopping conditions and expected concise evidence. GitHub links are traceability, not default full-history reading assignments.

**Report evidence precisely:** distinguish SOURCE VERIFIED, AGENT-REPORTED, independently reproduced HTTP/SQL/browser results, SECURITY FAILED, NOT TESTED and BLOCKED. Only actual commands, exit codes, test counts and exact target prove execution. Historical test and incident details belong to linked Issues, not permanent policy. No BFF/core implementation, database mutation, risky cleanup or merge authority is implied.

**Independent source-review guardrails (in addition to [#208](https://github.com/DenizOner/DogruAdres/issues/208)):**

1. **READ-ONLY means no mutations.** Use existing authorized read-only GitHub/browser/source views. Do not run `git fetch` (which can update `FETCH_HEAD` or refs), checkout, pull, repository setup, generators, installs, builds or tests; do not create report files, logs, caches, branches or worktrees. Return the report in the agent conversation unless a file or GitHub write is separately authorized. If the source cannot be obtained without writes or new permissions, mark the affected review **BLOCKED** rather than silently changing the environment. Disclose any accidental write or attempted forbidden operation; never claim no files were created when one was.
2. **Verify complete relevant source coverage.** Bind the review to exact base/HEAD SHAs, the changed-file list and the **entire diff**, including paginated/truncated tails. For an alleged policy removal or changed requirement, inspect the full affected sections in both versions and search the complete proposed document for surviving equivalent safeguards; a red diff line, missing search hit or partial browser extract alone is not proof of removal. If material portions are inaccessible, state precisely what was inspected and mark their acceptance **BLOCKED**. Do not exhaustively inspect unrelated code.
3. **Prove each material finding.** Cite the exact current file/section/lines and the conflicting approved decision or baseline text; state what remains in force, the concrete risk, severity and smallest correction. Separate direct observations, inference, missing evidence and actual execution outcomes. Do not fabricate deletions, test results or reviewer identity; do not issue `PASS` on unexamined relevant material. Keep independent reviewer provenance and merge authority separate as required by #208.

## 12B. Local resource custody and exact-target preflight (P0 workspace discipline)

**Authority:** [P0 custody/recovery #229](https://github.com/DenizOner/DogruAdres/issues/229) as refined by the **later** [risk-based parallel workspace decision #216](https://github.com/DenizOner/DogruAdres/issues/216#issuecomment-6325812774). Default to an existing authorized workspace; a blanket single-worktree ban is **superseded**, but isolation, accurate evidence, data preservation and separate permissions remain mandatory.

1. **Verify the real target before mutation.** For code operations check canonical absolute path, Git root/common-dir, branch, upstream/remote, full HEAD and dirty/index/untracked state. Before HTTP/browser/DB/migration work also verify the service PID/port, running checkout, database/container and real mounted volume. Only inspect resources relevant to the operation; documentation-only work does not require an artificial Docker survey. If anything conflicts, **STOP / WRONG TARGET**—never repair by guessing or silently switching branches.
2. **Justify new resources.** Reuse existing branches/worktrees and capacity. New branch, linked worktree, dependency copy, container, database/volume or port needs a concrete review/isolation benefit, explicit authorized scope, named writer/owner and expiry/retirement plan. Extra agents or a new SHA alone are insufficient.
3. **Enforce true parallel isolation.** One writing Agent per mutable worktree; one mutating owner per task database. Parallel mutating tasks need disjoint code ownership, no concurrent writes to shared generated/types, migrations, lockfiles or Git metadata, and separate task DB/volume/PID/ports. In conflict, serialize or make one reviewer read-only; never treat a common `.git` directory as physically independent.
4. **Maintain a private redacted manifest** per active mutable task with realpath, Git common-dir/HEAD/upstream, owner, purpose, expected end, dirty/untracked/ignored scope, ports/PIDs, Docker Mounts/volume/database, secrets/fixtures classification and evidence/backup locations. Put no real secrets in GitHub. Recheck changed or high-risk boundaries, not every unchanged observation.
5. **Preserve unknown and unique data.** Dirty files, ignored files, stashes, unique commits, archives, active process bindings, unknown Docker volumes, unreliable backup/restore evidence and user-owned data remain **KEEP** until individually verified. A clean `git status` or SQL dump existence does not prove recoverability. Database volume deletion requires separately authorized, verified backup **and restoration**.
6. **Retire resources individually, never broadly.** Classify KEEP / REVIEW / SAFE CANDIDATE first. For fully verified clean inactive linked worktrees, use normal exact-path `git worktree remove` without force and record actual outcome; then separately review branch deletion. Never automate removal of main checkout, independent clone, shared Git metadata, unique evidence or Docker volumes. No broad `git clean`, hard reset, wildcard recursive deletion, `docker volume/system prune`, or `compose down -v`.
7. **A failed removal is NOT success.** Check actual exit status/stderr and residual filesystem/Git entries; pause the cleanup batch on locked files, path, ownership or metadata mismatches. Reconcile actual root/worktree counts and disk bytes; don't retry with force/prune or infer removal from a smaller listing. Use [#229](https://github.com/DenizOner/DogruAdres/issues/229) for incident-specific Windows repair rules and unresolved recovery.
8. **Return only task-owned resources** safely after accepted checkpoints; track remaining KEEP items and disposal eligibility. An unexpected checkout, API port, anon 401, SQL count or screenshot cannot prove acceptance against another exact PR SHA. Keep the #229 unresolved data-loss/recovery risk visible, rather than declaring the disk cleanup fully safe.

These are operational precautions, **not** new permission to create fixtures, migrate data, delete storage, approve a PR or merge.

## 13. One complete functional module and independent browser acceptance

**Binding delivery order:** Identity / User / Organization (M0) first; Vehicle only after the required M0 acceptance, then approved next priorities. Deliver one **fully functional backend + frontend module** at a time, not disconnected backend and frontend batches. Source-only checkpoints are not finished product; separate foundational dependencies may progress only within their approved module scope.

**Completion gate:** all applicable APPROVED functionality must work with real persistence, auth/authorization, HTTP/workflows, UI interactions, local atomic audit/outbox and related integrations, with necessary focused unit/integration/security/concurrency checks. A meaningful vertical browser-capable flow must be proved early, not postponed behind unverified backend layers. The full applicable requirement/role/UI/negative-case/browser/persistence matrix must have executed evidence and independent Technical Advisor acceptance before **MODULE COMPLETE**. An unimplemented or untested approved journey remains open; never silently drop or relabel it as deferred.

**Independent E2E ownership:** Local Engineering Agent implements, verifies engineering preflight and repairs defects within authorized scope. ChatGPT Work Testing Agent (or another explicitly authorized independent tester) performs real-browser acceptance: authenticates synthetic users of each role, performs interactions, validates success and denial/empty/error states, refresh/reopen and backend persisted outcomes; verifies Organization isolation and revocation. Screenshots, mocks, static rendering, HTTP-only checks and invented browser outcomes are **not** browser acceptance. Real API/DB/security/concurrency evidence is still required at its own boundary. Without a supported independent browser environment mark **NOT TESTED / ENVIRONMENT BLOCKED**, never PASS.

Keep small reviewable checkpoints and fix confirmed in-scope defects promptly. Respect separate physical modules, Policy A, atomic source-local audit/outbox and fail-closed authorization. M0 approval is **not blanket permission** for unrelated UI features, public Vehicle CRUD, framework/core changes, shared/production data changes or deployment; UI work expressly approved for a bounded M0 checkpoint remains permissible within that approval. Major security/architecture transition and final completion require independent review and actual Product Owner authorization where specified.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
