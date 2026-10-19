# DoğruAdres architecture

## Current architecture

The repository uses Mercur 2.3.7 + Medusa 2.21.2. Mercur provides the marketplace platform, the admin and vendor dashboards, and the multi-vendor runtime architecture. The project-owned `dogruadresAccess` module now provides canonical Person/actor mappings, Organizations, memberships, invitation records, transactional security audit events and protected API routes under `/dogruadres`. Organization authorization resolves the authenticated actor, mapped Person, active membership, policy and Organization scope on every request. Manual Vehicle Management remains unimplemented and is a later checkpoint; approved ownership and uniqueness requirements are in REQUIREMENTS.md.

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

These are architectural ownership declarations, not implementations.

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

## Binding R0 consolidation (2026-10-19)

[ADR-0007](adr/ADR-0007-coherent-authorization-and-runtime-evidence.md) records the current binding decisions and authentic ADR-0005/0006 provenance. Earlier implementation-status statements above are historical: Foundation, independent Audit Index and independent Vehicle source foundations now exist, but source publication is not runtime acceptance. Vehicle CRUD remains closed.

The target is verified request → application/workflow → Vehicle-owned scoped lock/read → fresh Foundation coherent authorization at Policy A's L → resource-dependent evaluation → source-local Vehicle mutation/canonical audit/outbox → commit/rollback → asynchronous derived Index. Foundation and Vehicle managers never cross module boundaries. Current role checks have no platform bypass. R0 runtime evidence and Technical Advisor acceptance are required before further integration.
