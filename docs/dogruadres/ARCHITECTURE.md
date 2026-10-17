# DoğruAdres architecture

## Current architecture

The repository is an accepted Mercur 2.3.6 + Medusa 2.21.2 baseline. Mercur provides the marketplace platform, the admin and vendor dashboards, and the multi-vendor runtime architecture. The project is currently a clean baseline with no DoğruAdres business-domain implementation.

## Ownership boundaries

### Mercur-owned

Mercur-owned concerns include the marketplace primitives and framework capabilities that Mercur already models and ships. The exact boundary should be verified against the installed Mercur 2.3.6 documentation and source, but the relevant concerns include:

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
