# UI-0A — DoğruAdres-owned frontend capability map and review gates

- Date: 2026-10-18; status: **DESIGN ASSESSMENT / NOT AN APPROVED FINAL UI OR FEATURE IMPLEMENTATION**.
- Product intent: Product Owner confirmed that Mercur Admin, Vendor and Storefront were intentionally installed as reference/scaffold applications. Ultimate Admin Dashboard, Organization-facing Vendor experience and Storefront are intended to be DoğruAdres-owned user experiences, without modifying Medusa/Mercur core.
- Baselines: main `d87ba52f99f74d7fec52af70a815fe91a989fc3f`; current documentation review branch; Mercur **2.3.7**, Medusa **2.21.2**.
- Reconciles [UI-0 / SAFE-0A plan](reference-ui-strategy-and-safe-0a-2026-10-18.md), ADR-0005/0006, DA-APP-001/006/007, DA-UX-001/004 and security/Organization requirements. No requirement ID/status is changed.

## Official framework evidence

- [Mercur 2.3.7 frontend guide](https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/frontend.mdx) says Admin/Vendor extension surfaces support new `src/routes/**/page.tsx`, route configuration, dashboard SDK, custom-fields, supported Medusa UI components and the typed `sdk.admin` or `sdk.vendor` client with query hooks. It is guidance for **extensions inside the packaged panel**, NOT proof that arbitrary navigation/layout/core panel internals are public extension APIs.
- [Mercur 2.3.7 module rules](https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/modules.mdx) require one domain per isolated Medusa module, with cross-domain orchestration above modules. A separately built frontend is NOT a domain module; use protected public API boundaries.
- [Medusa admin customization](https://docs.medusajs.com/learn/fundamentals/admin) and [Storefront development](https://docs.medusajs.com/learn/storefront-development) are supporting references; reverify against installed Medusa **2.21.2** on implementation. Neither official guide grants access to private Mercur panel internals.

## Existing application entrypoints and target decisions

| UI capability / proposed surface | Current source and route | Product/domain authority | Prefer extension or independent UI? | Current decision |
| --- | --- | --- | --- | --- |
| Core marketplace operator admin | `apps/admin` boots `@mercurjs/admin`, served at `/dashboard` | Platform `user`, only authorized Admin API | Use packaged Mercur Admin where its built-in commerce panels meet requirement; add documented route/widget extensions if necessary | REFERENCE; not final DoğruAdres UI |
| Seller/vendor management | `apps/vendor` boots `@mercurjs/vendor`, served at `/seller` | Mercur Seller/Member/Store authorization, distinct from DoğruAdres Organization | Use documented vendor routes/SDK for marketplace primitives; do NOT infer Organization membership from Seller membership | REFERENCE; full own vendor navigation may be separately designed |
| Foundation identity/Organization | Protected `/dogruadres` and `/admin/dogruadres` API surfaces exist; no product-specific shipped dashboard | `dogruadresAccess` canonical Person/Organization/membership roles | A DoğruAdres-owned Organization UI consuming approved API; consider panel extension only if placement meets permissions and shell requirements | Functional brief + screen rights OPEN |
| App launcher and shell | NOT implemented as final UI; DA-APP-001/002/008 | Application entitlement, current action permission and personal launcher preference distinct | Likely own DoğruAdres shell for extensive launcher/navigation ownership; prove when functional brief approved | Architecture recommendation only, no screen decision |
| Unified audit timeline | `dogruadresAuditIndex` required by ADR-0006 but unimplemented | Index is derived; current source-domain Organization/resource permission applied on query | A restricted DoğruAdres audit UI over supported protected index API, never direct frontend DB search | First-release feature accepted; exact reader roles/fields/export OPEN |
| Vehicle workspace | `dogruadresVehicle` unimplemented | Each Vehicle belongs to Organization; create/update member, delete Owner/Admin, revoke immediately | Own DoğruAdres Organization workspace using new module's protected APIs | After independent domain API/proof acceptance |
| Buyer storefront / checkout | `apps/storefront` currently Next **15.5.24** reference with existing working/partially faulty commerce source | Server-authoritative Medusa/Mercur cart/order/payment rights | Custom DoğruAdres frontend should reuse only publicly supported backend contracts; compare safe migration vs extension of scaffold | No final reuse/rewrite decision yet |
| Finance/payout dashboards | No DoğruAdres-owned finance module/UI in inspected main | Future FIN-0, no existing authorized payout rights | Do not create money-moving UI until business policy, provider contracts, ledger/audit acceptance | NOT IMPLEMENTED; no payout authorization |

## Required screen/role/API mapping before UI coding

1. For EACH initial screen identify user actor type (platform Admin vs Mercur Seller Member vs authenticated Organization Person), active selected Organization, allowed operations and denial tests. No Owner/Admin shortcuts and no cross-Organization totals/cursors.
2. Document route shape, typed public API source, domain module/service owner, loading/empty/error states, browser token/cookie boundaries, SSR cache strategy, CSRF/CORS handling and audit exposure. Do not import another module's ORM model into a UI.
3. For Admin and Vendor separately, compare two prototypes: officially supported panel extension and separately owned frontend shell. Required evaluation criteria: full brand/navigation ownership, consistent user/Organization switching, localization, backwards compatibility, permissions, accessibility, maintainability, isolated deployment and safe cutover. Do not change package source or dependency for the prototype.
4. UI languages must support **TR/EN/Modern Standard Arabic with Arabic RTL** under DA-UX-001, even if references have different language files. DA-UX-004 governs truthful visual explanation of amounts/states, accessible context and permission-filtered charts.
5. Respect DA-APP-006: approved **functional app brief precedes final Stitch visual design**. No arbitrary menu/visual tokens/taxonomy chosen here; DRAWING a dashboard is not product scope approval.
6. Preserve reference apps for route/SDK research, pin proven reuse bits and create secure no-go gate for demo Stripe/manual payment, cancellation no-op, TalkJS identity and broken cache/typing before any live exposure. UI-0 does not authorize legacy full-scale storefront repair merely to preserve sample source.

## Proposed initial UI-0 checkpoint acceptance

- Screen list with each action's actor/Organization/permission/resource constraint and route/API contract, including negative cross-org and revoked-member cases.
- Navigation/shell decision per app, explicitly noting where Mercur route/widget extensions suffice and where they cannot meet approved requirements without private patches.
- Foundation and audit index pilot screens: minimal functional brief first, explicit reader/filter policy decision before implementation.
- Prototype proof with installed Mercur 2.3.7 typed SDK, no framework patching, and real auth scoping, then independent review.
- TR/EN/MSA RTL, keyboard, mobile/tablet, error and accessibility acceptance specified but do not infer final WCAG level not yet approved.
- Reference storefront reuse/cutover proposal includes dependency mismatch baseline `tsc=2`, lint `1`, Next build `1` from [SAFE-0A evidence](https://github.com/DenizOner/DogruAdres/blob/a181e113697518c32dc5b2af562deb1a5d7c587e/docs/dogruadres/plans/safe-0a-verified-evidence-2026-10-18.md). Passing future build required; may quarantine reference sample until then.

## Open Product Owner decisions (not presumed approved)

- Which user journeys must be present in the first custom Admin Dashboard, Vendor Portal and buyer Storefront releases?
- Whether to adopt entirely own shells now or incrementally use supported Mercur extension pages for each distinct app, based on an actual screen/role/API matrix.
- Organization selection/switch rules, reader rights of combined audit timeline, brand/visual system, exact accessibility conformance, app launcher initial mandatory list, deployment/cutover order.

**No custom UI code, production endpoint or deployment is authorized by this document.**
