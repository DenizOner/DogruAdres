# DoğruAdres architecture

## Current architecture

The repository uses Mercur 2.3.7 + Medusa 2.21.2. Mercur provides the marketplace platform, the admin and vendor dashboards, and the multi-vendor runtime architecture. The project-owned `dogruadresAccess` module now provides canonical Person/actor mappings, Organizations, memberships, invitation records, transactional security audit events and protected API routes under `/dogruadres`. Organization authorization resolves the authenticated actor, mapped Person, active membership, policy and Organization scope on every request. Manual Vehicle Management remains unimplemented and is a later checkpoint; approved ownership and uniqueness requirements are in REQUIREMENTS.md.

## User-confirmed reference apps vs target UI (2026-10-18)

The Product Owner clarified the ORIGINAL PURPOSE of `apps/admin`, `apps/vendor`, and `apps/storefront`: these Mercur-based applications were brought into DoğruAdres as REFERENCE/SCAFFOLD examples for routes, integration contracts, interaction flows and implementation patterns; they are NOT the final approved DoğruAdres Admin Dashboard, Vendor Portal or Storefront design.

The long-term product WILL have project-designed Admin Dashboard, Vendor and Storefront experiences. Do not equate the absence of custom DoğruAdres financial dashboard pages in the current reference app with an unexpected unfinished promised deliverable or with a defect in Mercur. The current reference apps have executable code and MUST remain secure if run/exposed; reference status is not permission to ship insecure demo workflows to production.

Two OFFICIALLY SUPPORTED interface approaches must be evaluated for each approved functional UI brief before implementation:
1. Use Mercur 2.3.7 supported Admin/Vendor panel extensions (routes, widgets, custom fields, navigation, typed SDK) where they satisfy DoğruAdres UX/business needs.
2. If product requirements require owning layout/navigation or substantial UI beyond supported panel extensions, build a separately owned DoğruAdres frontend talking to public Admin/Vendor/Store APIs and project-owned protected API routes, WITHOUT changing Mercur/Medusa core or copying private dashboard internals.

This chooses no final UI framework or replacement strategy by assumption. The functional brief, permissions, localization (TR/EN/MSA-RTL), accessibility, route/API mapping, coexistence/cutover, testing and product design approval are required in **UI-0**, independently of ADR-0005's physical DOMAIN-module rule. UI apps are not Medusa data modules merely because they are separate frontends. See [UI strategy / SAFE-0A plan](plans/reference-ui-strategy-and-safe-0a-2026-10-18.md).

## Ownership boundaries

### Mercur-owned

Mercur-owned concerns include the marketplace primitives and framework capabilities that Mercur already models and ships. The exact boundary should be verified against the installed Mercur 2.3.7 documentation and source, but the relevant concerns include:

- seller and seller-member concepts
- offer and product catalog relationships
- marketplace-centric primitives
- cart and order primitives
- commissions and payout primitives
- workflow and event orchestration patterns
- dashboard/admin/vendor framework capability
- built-in module and extension contracts

Mercur should retain ownership of the platform logic it provides.

### DoğruAdres-owned

DoğruAdres owns the automotive domain and the product-specific logic layered on top of Mercur. Expected concepts include:

- vehicle
- make
- model
- generation
- engine
- fitment
- OE/OEM references
- cross-reference / equivalence logic
- automotive taxonomy
- catalog enrichment
- automotive-specific search/filter semantics

The identity/Organization foundation is implemented in its own Medusa module and does not reuse Mercur Member, Seller or Store as the canonical Person or Organization. No automatic Seller/Store association is created.

**Binding physical module architecture (Accepted ADR-0005):** Vehicle Management MUST be a separate, independently registered DoğruAdres-owned physical Medusa module (provisional ID dogruadresVehicle) with its OWN models, metadata, services and migrations. Identity/Organization remains in dogruadresAccess with its own canonical Foundation AuditEvent. No Vehicle model may be registered inside Access. This non-negotiable boundary applies to all project domain modules, and ADR-0004 C co-location was REVOKED/SUPERSEDED. ADR-0002 continues isolating automotive domain from Mercur marketplace primitives.

**Historical B1 proof (INCONCLUSIVE, not current architecture):** Forwarding the Vehicle EntityManager to Access failed at AuditEvent metadata resolution. The later Accepted ADR-0006 supersedes the Vehicle-to-Access physical audit INSERT dependency: independent Vehicle owns its own transactional VehicleAuditEvent/VehicleAuditOutbox; Audit Index separately projects it. Local atomicity, durable relay and index authorization remain UNPROVEN implementation gates. Do not repeat B1 or resurrect co-location.

## Approved module-owned audit and unified index (ADR-0006)

- dogruadresAccess retains its existing canonical Foundation da_audit_event and gains a future local durable outbox without replacing old rows.
- Standalone dogruadresVehicle owns its domain data, VehicleAuditEvent and VehicleAuditOutbox. Vehicle writes do not target Access's audit table.
- Standalone dogruadresAuditIndex owns ONLY derived unified index/checkpoint/replay state, included in the initial coding program, not postponed. Post-commit durable outbox relay and idempotent projection decouple source commits from index availability.
- Each source domain mutation + audit + outbox MUST commit/rollback atomically in its own module. Index searches require current Organization/resource rights, safe field allowlists, replay and lag reporting. This is a scoped correction to older Vehicle-to-Access physical audit assumptions; ADR-0005 independence remains controlling.

## Integration boundary

The intended integration model is:

```text
DoğruAdres domain/application layer
        ↓
project-owned integration/adapters
        ↓
Mercur-supported extension APIs
        ↓
Mercur / Medusa
```

The project should extend via supported APIs and own its domain logic, not by forking or modifying Mercur internals.

## Data ownership

DoğruAdres should not dump automotive-domain state into arbitrary Mercur metadata merely for convenience.

If custom business data is required, it should be placed behind project-owned persistence or model boundaries, with clear ownership and accessible links to Mercur primitives through supported mechanisms.

This document does not define final database schema design. That remains future work once the business model is approved.

## Architectural principle

The long-term behavior should be: project-owned business logic, Mercur-owned framework logic, explicit integration boundaries, and no silent drift into Mercur internals.
