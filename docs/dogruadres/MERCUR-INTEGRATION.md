# Mercur integration policy

DoğruAdres interacts with Mercur through supported extension points and project-owned adapters, not through private internals or source-level patches.

## Preferred integration order

1. official Mercur extension point
2. project-owned module, provider, workflow hook, subscriber, adapter, or link
3. upstream contribution
4. minimal isolated compatibility patch
5. fork

Step 2 is normal project-owned implementation and may proceed autonomously when it stays within already approved architecture, product behavior, security rules, and domain boundaries. Steps 3-5 require explicit external/user approval before implementation.

## Extension patterns

Use the Mercur extension model for:

- custom modules
- workflow hooks and workflow extensions
- subscribers and scheduled jobs
- links between modules
- API routes that are thin adapters
- custom fields on supported entities
- dashboard-level pages, widgets, navigation, and form/table extensions

Avoid:

- direct edits inside Mercur core
- direct use of private/internal Mercur implementation details
- hidden framework assumptions based on memory or community snippets
- doing "just this one patch" that becomes a permanent fork of the framework

## Adapters and anti-corruption layers

When Mercur concepts do not map cleanly to DoğruAdres concepts, isolate the translation layer.

Use project-owned adapters to map:

- domain concepts to Mercur primitives
- DoğruAdres business logic to supported workflow/module boundaries
- project-specific data and search semantics to the platform APIs

This keeps the business layer understandable and makes future Mercur upgrades more controlled.

## Accepted baseline deviations

The current Mercur 2.3.7 baseline includes accepted local deviations that must be documented and re-evaluated on every upgrade.

### Upstream known issue

- storefront production lint/parser failure in the generated baseline

### Temporary compatibility adjustment

- `compose.dev.yml` local development infrastructure
- `packages/api/medusa-config.ts` Redis wiring via `REDIS_URL`
- root exact `i18next@26.4.2`

### Project customization

Current status: DoğruAdres-owned `dogruadresAccess` module and `/dogruadres` routes implement Person-to-framework-actor mappings, Organization membership checks, fail-closed Organization scoping, protected invitation/role workflows and a shared transactional audit-event model. Platform Organization provisioning is restricted to authenticated Medusa `user` actors and assigns initial protected Owners. No Mercur/Medusa source is modified. The current invite acceptance depends on an existing verified email record from Medusa Auth; no new provider or invitation-mail provider was introduced. Vehicle routes and Store/Organization associations are outside this checkpoint.

These temporary adjustments are not permanent architecture. Every Mercur upgrade must explicitly re-check whether the compatibility adjustment is still necessary.
