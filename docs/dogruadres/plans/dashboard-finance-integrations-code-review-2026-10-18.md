# IR-0 — Dashboard, Finance, Payment and Integrations Source Review

- Date: 2026-10-18.
- Scope: read-only review of DoğruAdres repository at **main d87ba52f99f74d7fec52af70a815fe91a989fc3f**; no code/runtime/DB/provider/deployment changes or tests.
- Status: **REPOSITORY-CONTROLLED FINANCIAL AND INTEGRATION ENTRYPOINT SOURCE REVIEW COMPLETED; INSTALLED THIRD-PARTY MODULE INTERNALS, LIVE CONFIG, NON-RELATED PRESENTATIONAL LEAF FILES AND RUNTIME BEHAVIOR NOT VERIFIED.**
- Complete Git tree: 801 entries, 503 blobs, truncated=false. Admin/Vendor source trees each contain 17 files including assets/docs; API 60 files; storefront 363 files including many UI atoms, images, icons and other presentational content.
- Source-reference base: https://github.com/DenizOner/DogruAdres/blob/d87ba52f99f74d7fec52af70a815fe91a989fc3f/
- Framework baseline: Mercur 2.3.7, Medusa 2.21.2, Storefront Next 15.5.24.

## What the repository actually implements

Admin and Vendor: apps/admin and apps/vendor bootstrap the packaged @mercurjs/admin and @mercurjs/vendor apps with Vite SDK/client config. They do not contain independently implemented DoğruAdres payout, finance, accounting, Vehicle or Audit Index dashboards. Production panel artifact assembly is in packages/api/scripts/bundle-dashboards.mjs; paths /dashboard and /seller have explicit checks, but no real production bundle/browser evidence from current CI.

Backend: packages/api/src/modules contains only dogruadres-access, plus Foundation workflows, guards, seed, cache subscriber and supporting API. There is NO repository-owned settlement/payout, bank integration, accounting, payment provider, Vehicle or audit-index module. Mercur/Medusa dependencies provide some platform commerce primitives; their actual installed internals and service behavior were not verified in this review.

Storefront: existing repository code includes cart/payment/order/return/fulfillment/offer/stock, seller pages, cache/Next middleware, TalkJS chat and their Next routes. These source entrypoints were inspected for security/correctness. Not every generic presentational atom, static image, Storybook story, or bundled Mercur dependency source was individually audited.

## Classification conventions

- **CONFIRMED** means a behavior, missing guard, no-op or code/test/config condition is visible in source, NOT that a real user exploit was reproduced.
- **RISK** requires actual environment, backend contract or sandbox reproduction before asserting a customer-facing incident.
- **ABSENT** means no DogruAdres-owned implementation in this repository, NOT a defect in uninspected Mercur packages.
- Priority P0 = blocker before production or activating real payments/private chat. P1 = fix/test in bounded integration checkpoint. P2 = validate before dependent feature/release.

## Findings and specific remediation gates

| ID | Pri | Classification | Evidence / observed code and impact | Required test / correction |
| --- | --- | --- | --- | --- |
| IR-01 | P0 | CONFIRMED | apps/storefront/next.config.ts sets typescript.ignoreBuildErrors=true, allowing production build despite TypeScript errors. | Restore strict type-checking, fix build errors and verify actual Next 15 build/CI. Official: https://nextjs.org/docs/app/api-reference/config/next-config-js/typescript |
| IR-02 | P0 | CONFIRMED | packages/api/medusa-config.ts falls back to JWT_SECRET/COOKIE_SECRET literal "supersecret"; API and storefront .env.template use demo secrets. Not evidence prod actually used them. | Production startup fails closed if missing/insecure keys; document test-only defaults and negative configuration tests. |
| IR-03 | P0 | RISK | apps/storefront/src/components/cells/ChatBox/ChatBox.tsx creates Talk.Session from public appId and browser-side IDs, with predictable conversation IDs and no signed identity token visible in repository; actual TalkJS dashboard auth settings unknown. | Server-generated user-scoped signed TalkJS token and restricted conversation access before live chat; verify provider configuration and malicious join tests. Official: https://talkjs.com/docs/Features/Security/Authentication/ |
| IR-04 | P0 | RISK | packages/api/src/scripts/seed.ts configures pp_system_default; PaymentButton.tsx allows ManualTestPaymentButton for this provider. PaymentTest badge appears only during development. Not proof real-money use occurred. | Ensure test/manual payment cannot simulate settled funds or complete real-money production orders; provider whitelist, backend payment-status validation, isolated payment sandbox tests. |
| IR-05 | P1 | CONFIRMED | CartAddressSection.tsx navigates to delivery after invoking formAction regardless of returned error; lib/data/cart.ts:setAddresses catches error as message and lacks explicit structured success. | Structured result + navigate only on confirmed save; invalid-address/backend-error tests. |
| IR-06 | P1 | CONFIRMED | The checkout offers separate billing preference but lib/data/cart.ts:setAddresses unconditionally copies shipping_address into billing_address; BillingAddress component cannot override this action. | Respect toggle and separate billing fields; test tax, payment and address combinations. |
| IR-07 | P1 | RISK | CartPaymentSection.tsx uses stale prop/session after provider init; PaymentButton.tsx chooses payment_sessions[0], whereas PaymentWrapper.tsx finds pending session. | Consistent selected active provider/session, state reconciliation and test switching Stripe/manual/multiple sessions, init failures. |
| IR-08 | P1 | CONFIRMED | StripePaymentButton.handlePayment lacks catch/finally around stripe.confirmCardPayment; conditional reads paymentIntent.status without checking it in both branches. Rejected promise can leave loading state. | Finally/error handling and simulated Stripe success, declined, canceled, missing-intent and retry tests. |
| IR-09 | P1 | CONFIRMED | apps/storefront/src/components/cells/OrderCancel/OrderCancel.tsx user-facing "Request cancelation" only console.log("cancel"). | Disable misleading UI or implement permitted real cancellation with server authorization and idempotency tests. |
| IR-10 | P1 | CONFIRMED | OrderReturnSection.tsx assumes createReturnRequest succeeds, has no catch or duplicate submit protection, logs failure only, redirects to request-success with return request ID. orders.ts uses LooseRoute/as never for legacy returns. | Verify installed public route contract; type result, safe error feedback, ownership/eligibility, accurate redirect and status tests. |
| IR-11 | P1 | RISK | ReturnSummaryTab.tsx labels summed selected item subtotals "Subtotal refund", not an authoritative refund; OrderTotals.tsx computes displayed "Subtotal" as total minus delivery, which can include tax/discount effects. | Use server-authoritative monetary breakdown/refundable amounts; tests for tax, shipping, discount, multi-seller and currency rounding. |
| IR-12 | P1 | CONFIRMED | packages/api/src/subscribers/storefront-cache-revalidate.ts sends fetch but NEVER checks response.ok; 401/500 treated as success and catch logs without durable retry. | Status/error observability, supported retry/reconciliation and 401/500/outage tests. |
| IR-13 | P1 | RISK | apps/storefront/src/lib/data/cache-tags.ts uses revalidate:false for product/offer caches; missed invalidation can leave indefinitely stale prices/stock. | Bounded fallback TTL and tested invalidation; server-side checkout prices/availability always authoritative. |
| IR-14 | P1 | RISK | apps/storefront/src/app/api/revalidate/route.ts accepts arbitrary list/length of tags after shared-secret check; no tag allowlist/count/body limits. | Input limit, tag allowlist, strong secret and 401/500/abuse/timeout tests. |
| IR-15 | P1 | CONFIRMED | apps/storefront/src/lib/helpers/medusa-error.ts logs entire response data/headers; secrets/PII exposure depends on actual error payload. | Structured redacted errors, no uncontrolled customer/payment/token headers in logs; negative logging tests. |
| IR-16 | P1 | COVERAGE | admin/vendor Vite config and API bundle script guard sub-paths but .github/workflows/identity-organization-foundation.yml builds API in test mode, not full production dashboard artifact/browser. | Production-mode dual dashboard build, auth/API URL, /dashboard + /seller asset and browser E2E. |
| IR-17 | P1 | RISK | apps/storefront/next.config.ts permits arbitrary HTTPS image hostname via '**'; broad image proxy exposure. | Narrow permitted hosts, verify SVG/remote image security, resource use and fallback. |
| IR-18 | P1 | RISK | packages/api/src/scripts/seed.ts includes fixed demo seller password, EU sample seller data, default manual provider. Seed runs explicitly, so this is not evidence prod was seeded. | Non-production-only seed guard, repeat/idempotency tests, no protected/prod DB. |
| IR-19 | P1 | COVERAGE | Existing CI does not run native Foundation authenticated DB HTTP or storefront checkout/payment/returns/browser integration. CI only checks HTTP syntax and test-config API bundle. | Isolated PostgreSQL and test-provider HTTP/checkout/E2E in CI with proof tests actually ran. |
| IR-20 | P2 | RISK | orders.ts and payment/fulfillment wrappers use legacy LooseRoute, unsafe 'as never'/any casts for Mercur endpoints. | Verify v2.3.7 installed generated routes, provider contracts and negative API tests. |
| IR-21 | P2 | RISK | storefront middleware decodes token expiry without cryptographic signature checks; useful only for UX redirects, not real authorization. | Assert protected backend enforces verified authentication and cache/logout scope; do not use middleware as permission grant. |
| IR-22 | P2 | RISK | storefront region defaults and demo seed EUR/USD/sellers do not implement approved Turkey banking/FX/payout/tax policies. | Region/currency/legal/price integrity compatibility; separate domain implementation and acceptance. |
| IR-23 | P2 | RISK | seed.ts early-return based on existing demo seller; partially seeded resources may not reconcile idempotently. | Disposable repeated/partial seed and recovery tests. |
| IR-24 | P2 | COVERAGE | packages/api/instrumentation.ts is commented template; separate production observability may exist but unverified. | Source/production logs, trace/alert/index-lag evidence and sensitive log controls. |
| IR-25 | P1 release gate | ABSENT | No DogruAdres-owned finance/payout/banking/settlement/payment-provider/accounting code or dashboard found. Only packaged framework primitives and frontend test/Stripe code exist. | FIN-0 separate version-matched provider, payout, ledger, calendar, workflow, financial audit and real-money go-live design/approval; do not conflate unimplemented with defective. |

## Positive existing safeguards to preserve

- Admin/vendor apps use packaged Mercur v2.3.7 with distinct routes. bundle-dashboards.mjs checks missing production dist, backend URL and HTML base, although runtime proof is absent.
- Foundation access service uses @InjectTransactionManager with its own da_audit_event; Organization authorization is server-side/fail-closed; preserve confirmed good behavior.
- Storefront checkout ultimately calls Medusa cart/payment APIs; do not turn browser subtotal or static eligibility into backend payment authorization.
- No project-owned domain models for finance/payout exist to refactor; do not invent proprietary internal implementation.

## Reproduction / evidence discipline

No actual production deployment, real-money transaction, provider dashboard/API, original or G1 DB, browser automation, installed node_modules source, or full dependency/internal payout code was inspected or mutated. Thus "source review complete" refers to repository-controlled relevant entrypoints; runtime, third-party internals and separate unrelated UI components remain their own acceptance work. No bugs were fixed by this assessment.

Official references:
- Mercur v2.3.7 module guidance: https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/modules.mdx
- Medusa payment providers: https://docs.medusajs.com/resources/commerce-modules/payment/payment-provider
- Next 15 caching: https://nextjs.org/docs/15/app/guides/caching
- TalkJS authentication: https://talkjs.com/docs/Features/Security/Authentication/

## Development order impact

IR-0 source investigation DONE. SAFE-0 applies to P0 production/live-chat/payment blockers. AF-1 Foundation and COM-1 checkout/cache remediation are separate bounded coding tracks. AF-2 central Audit Index remains REQUIRED before Vehicle release, followed by AF-3 independent Vehicle. FIN-0 is an independent product and provider contract gate BEFORE any real-money/payout enablement. AF-4 covers full runtime/browser/security and production acceptance. Explicit approval required for each code/migration/deployment checkpoint; repository-owned dirty worktrees and protected DB never altered by this report.
