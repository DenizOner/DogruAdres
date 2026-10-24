# Mercur Basic Template

This template comes configured with the bare minimum to get started building your marketplace with Mercur.

## Quick Start

To spin up this template locally, follow these steps:

### Clone

If you've already cloned this repo, skip to [Development](#development).

### Development

1. First [clone the repo](#clone) if you have not done so already

2. Copy the example environment variables:

```bash
cd my-project
cp packages/api/.env.template packages/api/.env
```

3. Update the `.env` file with your database connection string and other required variables:

```
DATABASE_URL=postgres://user:password@localhost:5432/mercur
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key
COOKIE_SECRET=your-super-secret-cookie-key
```

4. Install dependencies and start the dev server:

```bash
bun install
bun dev
```

5. Open `http://localhost:9000` to access the Medusa backend
6. Open `http://localhost:7000` to access the admin dashboard
6. Open `http://localhost:7001` to access the vendor dashboard

That's it! Follow the on-screen instructions to login and create your first admin user.

## What's Inside

This monorepo includes the following packages and apps:

### Apps and Packages

- `packages/api` - The Medusa backend with all marketplace functionality
- `apps/admin` - Admin dashboard customizations
- `apps/vendor` - Vendor portal customizations

### Project Structure

```
├── apps/
│   ├── admin/          # Admin dashboard extensions
│   └── vendor/         # Vendor portal extensions
├── packages/
│   └── api/            # Medusa backend
│       ├── src/
│       │   ├── api/         # Custom API routes
│       │   ├── jobs/        # Background jobs
│       │   ├── links/       # Module links
│       │   ├── modules/     # Custom modules
│       │   ├── scripts/     # CLI scripts
│       │   ├── subscribers/ # Event subscribers
│       │   └── workflows/   # Business workflows
│       └── medusa-config.ts
├── blocks.json         # Mercur blocks configuration
├── package.json
└── turbo.json
```

### Utilities

This project has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [Turborepo](https://turborepo.dev/) for monorepo management
- [Prettier](https://prettier.io) for code formatting

## How It Works

The Mercur basic template is built on top of [Medusa](https://medusajs.com) and is pre-configured for marketplace functionality.

### Modules

Custom modules allow you to extend the core functionality. See the [Modules](https://docs.medusajs.com/learn/fundamentals/modules) docs for details.

### Workflows

Workflows define multi-step business processes. See the [Workflows](https://docs.medusajs.com/learn/fundamentals/workflows) docs for details.

### API Routes

Custom API routes expose HTTP endpoints. See the [API Routes](https://docs.medusajs.com/learn/fundamentals/api-routes) docs for details.

### Links

Links define relationships between modules. See the [Links](https://docs.medusajs.com/learn/fundamentals/links) docs for details.

## Adding Blocks

You can extend your project with pre-built blocks using the Mercur CLI:

```bash
bunx @mercurjs/cli add block-name
```

Configure your block sources in `blocks.json`:

```json
{
  "aliases": {
    "workflows": "packages/api/src/workflows",
    "links": "packages/api/src/links",
    "api": "packages/api/src/api",
    "modules": "packages/api/src/modules"
  },
  "registries": {}
}
```

## Build

To build all apps and packages:

```bash
bun run build
```

## AI agents

This project bundles its documentation as a dependency (`@mercurjs/docs`), so AI agents can read it offline and version-matched to your installed packages. Point your agent at:

- `node_modules/@mercurjs/docs/llms.txt` — an index of every page
- `node_modules/@mercurjs/docs/content/**/*.mdx` — the full pages

`CLAUDE.md` and `AGENTS.md` instruct agents to read these before making changes. The same docs are online at [docs.mercurjs.com](https://docs.mercurjs.com).

## Questions

If you have any issues or questions start a [GitHub discussion](https://github.com/mercurjs/mercur/discussions).

## DoğruAdres GitHub project governance

The DoğruAdres-specific product and engineering collaboration records are managed in this repository's GitHub Issues. The upstream Mercur template material above is a development reference, not the project's approved product specification.

- [Governance migration and review gate — Issue #18](https://github.com/DenizOner/DogruAdres/issues/18)
- [Controlled requirements baseline and provenance — Issue #141](https://github.com/DenizOner/DogruAdres/issues/141)
- [M0 Identity / User / Organization acceptance — Issue #147](https://github.com/DenizOner/DogruAdres/issues/147)
- [Historical IR-0 review and 25 tracked findings — Issue #153](https://github.com/DenizOner/DogruAdres/issues/153)
- [Current approved / unresolved requirement index — Issue #141](https://github.com/DenizOner/DogruAdres/issues/141#issuecomment-6275903823) (26 proposed, 3 open, 2 deferred; no inferred approvals)
- [Active audit-first roadmap — Issue #152](https://github.com/DenizOner/DogruAdres/issues/152)
- [SAFE-0A source evidence and UI strategy — Issue #156](https://github.com/DenizOner/DogruAdres/issues/156#issuecomment-6275864894)
- [Vehicle-MVP approved scope and blocked design gate — Issue #158](https://github.com/DenizOner/DogruAdres/issues/158)
- [Later Vehicle/Audit approved source deltas — DA-AUTO-006 #122](https://github.com/DenizOner/DogruAdres/issues/122) and [DA-SEC-007 #51](https://github.com/DenizOner/DogruAdres/issues/51) / [DA-SEC-009 #53](https://github.com/DenizOner/DogruAdres/issues/53)
- [R0 architecture consolidation: full historical evidence and review gate — Issue #206](https://github.com/DenizOner/DogruAdres/issues/206)
- [Historical research archive router and complete original index — Issue #17](https://github.com/DenizOner/DogruAdres/issues/17#issuecomment-6276057019)
- [Retired historical planning router — Issue #146](https://github.com/DenizOner/DogruAdres/issues/146#issuecomment-6275919883)
- [GitHub independent-review merge authorization — Issue #208](https://github.com/DenizOner/DogruAdres/issues/208) (no separate per-PR Product Owner merge approval after verified independent review and required checks)
- [Root AGENTS.md](AGENTS.md) for permanent agent workflow, approval boundaries and official version-matched Mercur documentation lookup.

Every approved decision, proposed requirement, test outcome and implementation is tracked separately. Historical issue closure does **not** assert feature delivery; an accepted product decision does **not** imply a test passed. A governance or product PR must not be treated as merged unless GitHub confirms it; reviewed and authorized PRs follow the independent-review, CI and exact-SHA merge policy in Issue #208. Unresolved product decisions remain explicitly open; Discussions are enabled but no Discussion publication is assumed without verified access.
