# UI-0 reference frontend strategy and SAFE-0A guarded engineering checkpoint

- Date: 2026-10-18.
- Authority: The Product Owner explicitly clarified that the installed Mercur Admin, Vendor and Storefront were REFERENCE/SCAFFOLD apps used to study paths, workflows and integrations, with an original intent to create DoğruAdres-owned Admin Dashboard and storefront experiences. Existing SOURCE reviews and SAFE-0A next action were approved.
- Documentation state: APPROVED INTENT / ENGINEERING PLAN; NO final custom-UI feature scope, vendor frontend architecture or live production acceptance has been chosen.
- Baseline: main d87ba52f99f74d7fec52af70a815fe91a989fc3f; separate documentation review branch feature/vehicle-management-mvp. Mercur 2.3.7, Medusa 2.21.2, Next 15.5.24.
- Existing reference apps: apps/admin (@mercurjs/admin), apps/vendor (@mercurjs/vendor), apps/storefront (real Mercur/Medusa commerce reference code). These are project-owned workspace sources but NOT final DoğruAdres approved UX. Never edit installed @mercurjs or @medusajs package internals.

## UI-0 functional product design — capability by capability

1. Product-specific Admin Dashboard is PLANNED and must be designed from approved functional business brief, permission hierarchy, Organization/domain ownership and usable operational workflows; default Mercur Admin is reference only. Similarly vendor portal/storefront are candidates for separately designed DoğruAdres UX. No unapproved navigation, finance authority, dashboard roles or new business capability is implied merely by this clarification.
2. Assess, against official installed v2.3.7 docs, per feature: (a) Mercur-supported panel page/widget/custom field extension through dashboard SDK and typed @mercurjs/client; (b) project-owned frontend application/shell calling supported public Admin/Vendor/Store APIs and DoğruAdres-owned authorized APIs. If full layout/brand/navigation control exceeds official extensions, recommend (b) without forking framework packages. Independent frontend apps are NOT "physical Medusa modules"; domain code still obeys ADR-0005.
3. Inventory existing Admin/Vendor reference routes, backend API dependencies, screen expectations, bootstrap/auth flow, session, CORS, tenancy, Organization vs Seller, i18n targets TR/EN/MSA RTL, accessibility and secure audit-index views. Create screen/role/API matrix and transition/cutover plan before implementation.
4. For major custom frontend work, distinguish discardable demo-only code (may remain quarantined) from reusable safe adapters/contracts, and avoid large repairs solely for eventually replaced UI. NEVER enable vulnerable demo checkout/chat or manual test payment while it remains reachable in live production.
5. Approved DA-APP-006 requires a functional brief BEFORE detailed Stitch visuals; DESIGN.md is a proposal reference, not approved final layout. Preserve DA-UX-001 TR/EN/MSA RTL, DA-APP-001 entitlement vs launcher distinction and current Organization authorization; no new product decisions inferred.

Official versioned Mercur reference:
https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/frontend.mdx
Medusa 2.21.2 Admin customization scope:
https://docs.medusajs.com/learn/fundamentals/admin
Medusa independent Storefront guidance:
https://docs.medusajs.com/learn/storefront-development

## SAFE-0A — next bounded coding task, WITHOUT false acceptance

A. **Preflight on separate SAFE-0A branch/worktree from unchanged main**: establish worktree cleanliness, record immutable Git refs and dependency versions. DO NOT touch publication checkout, Vehicle docs branch, dirty worktrees, original/G1 DB, local secrets, staging/production or live providers. Use project-specified runtime as available; consult node_modules/@mercurjs/docs/llms.txt and relevant version-matched content plus checked-in API and Next config.

B. **IR-02 production secret fail-closed**: inspect packages/api/medusa-config.ts and packages/api/.env.template. Medusa's docs show a development default of "supersecret" but require unique JWT_SECRET/COOKIE_SECRET for production. Do not assume the sample fallback is secure because it appears in official documentation. Enforce a production-only fail-closed guard rejecting missing/empty/sample/obviously weak values, without logging them; retain backward-compatible development and CI/test behavior. Verify interaction with BUILD-TIME Medusa Cloud environment injection (project config evaluated during build). Never rotate/change live secrets or include generated secret material in Git. Accept only after negative tests: missing secrets, explicit literal "supersecret" / template sample, too-short values, whitespace-only, only-one-present; positive production with two distinct strong test fixture values, development/test without prod requirements, and correct build/evaluation process. Avoid unintended production build failure caused by secret availability timing; escalate true platform deployment contract mismatch instead of weakening safeguard.

C. **IR-01 TypeScript build gate**: inspect apps/storefront/next.config.ts (currently typescript.ignoreBuildErrors=true), package.json scripts and tsconfig. First capture a real unmodified baseline of the correct Next 15 version, TypeScript and lint commands in isolated checkout; preserve exact errors. Previously documented Storefront SDK route-type and React/UI compatibility failures cannot be declared fixed without rerunning. Determine correct Next 15-compatible lint path (do not assume "next lint" works just because it appears in package.json), run explicit tsc --noEmit and actual production build. Correct only verified errors in an approved discrete change set; do not use blanket any/as never/ts-ignore/suppressions, remove compiler strictness or claim inherited framework defect without version-matched proof. Set ignoreBuildErrors=false or remove override ONLY with passing real typecheck and build. If nontrivial legacy errors exceed SAFE-0A scope, return BLOCKED with exact error taxonomy and a separately prioritized COM/UI task plan; do not silently widen to wholesale commerce rewrite.

D. **Tests and evidence**: run focused config unit/negative tests and clean storefront typecheck/lint/build with exact exit codes, installed version evidence, security and regression diffs; check production dashboard builds only if touching dashboard-related config. Report PASS / FAIL / BLOCKED / NOT TESTED accurately. Do not start databases for this checkpoint. No provider calls, payment charges, app-specific migrations, deployment, main merge or dependency/core patch. Update documentation only with observed results and user-approved scope.

E. **Branch/approval**: independent SAFE-0A code branch from main, no commits to Vehicle review branch for SAFE code, no main mutation. Agent may implement scoped changes only with the above approved task bounds; user has NOT approved runtime deployment, protected database access or cross-product redesign. Commit/push after valid verification, then return for independent review before merge.

## SAFE-0A acceptance matrix

| Test | Expected |
| --- | --- |
| SEC-01 missing JWT secret in production | Fail before serving traffic, no secret in logs |
| SEC-02 missing cookie secret in production | Same |
| SEC-03 explicit "supersecret", empty/whitespace, weak fixture | Reject in production |
| SEC-04 distinct strong fixture secrets | Startup config evaluation accepted in isolated environment |
| SEC-05 dev/test default behavior | Remains usable without production secrets; no accidental production bypass |
| SEC-06 build-time production secret availability | Verified for actual Medusa 2.21.2 build/runtime; no unsafe fallback |
| TS-01 unmodified baseline | Real Next 15 typecheck and lint results captured |
| TS-02 final source TypeScript | Actual tsc --noEmit PASS |
| TS-03 final production build | Next build PASS with errors NOT ignored |
| TS-04 no scope dilution | No src-wide ts-ignore, any/as-never blanket workaround or skipped test disguised as pass |
| BND-01 Git/repository | main, Vehicle review, dirty user trees and databases unchanged |
| BND-02 non-goals | No UX redesign, Medusa/Mercur core patch, payout logic, provider operation or deployment |

## Current execution limitation

This plan and its decision boundaries are documentation; they are NOT proof that a clean local checkout with installed dependencies was tested. The Technical Advisor currently has no connected runnable private-repository workspace with node_modules / production build available. The local engineering agent must supply actual baseline/test evidence before a SAFE-0A code repair can be called complete. A GitHub text-only review does not substitute for running Next or Medusa.
