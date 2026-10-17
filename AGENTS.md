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

Follow [PRINCIPLES.md §11](docs/dogruadres/PRINCIPLES.md#11-product-scope-and-dependency-boundaries) for product scope, dependency boundaries and source-only repository rules. DoğruAdres is the development target. Never edit Mercur or Medusa upstream source; the historical escalation list below does not authorize such edits. Continue independent authorized project work when a dependency issue blocks only one operation.

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

Before performing project work, read and follow [PRINCIPLES.md §10](docs/dogruadres/PRINCIPLES.md#10-roles-and-decision-rights), including the Product Owner, Technical Advisor and Local Agent responsibilities and mandatory problem-reporting standard. This policy does not expand task authorization or replace the existing authority hierarchy and approval gates.

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

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
