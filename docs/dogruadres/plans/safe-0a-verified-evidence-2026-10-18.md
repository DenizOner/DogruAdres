# SAFE-0A — production auth-secret fix and reference Storefront baseline evidence

- Status: **PARTIAL PASS / SPLIT CHECKPOINT**. API production secret hardening tests PASS; inherited reference Storefront lint/type/build controls FAIL; whole SAFE-0A is NOT accepted or merge-ready.
- Evidence record: 2026-10-18, immutable `main` baseline `d87ba52f99f74d7fec52af70a815fe91a989fc3f`.
- Engineering branch: `feature/safe-0a-production-checks`, started directly from that `main`, NOT from the Vehicle documentation branch.
- Tested source head: `6e9f4745c8e718722a650886de6361d632dd9454`.
- [Actual GitHub Actions run](https://github.com/DenizOner/DogruAdres/actions/runs/39114484845), jobs `Candidate production secret tests and API typecheck` and `Storefront baseline diagnostics (non-acceptance)`. The overall workflow is green because the immutable-Storefront baseline collection deliberately exits zero; **its underlying checks are ALL FAIL and must not be represented as PASS**.

## Code actually changed (SAFE-0A candidate)

- `packages/api/medusa-config.ts`: resolve JWT/cookie secrets via `resolveHttpSecrets` after `loadEnv`; no production scaffold fallback accepted.
- `packages/api/src/utils/production-secrets.ts`: production-only guard requires both secrets, distinct, no whitespace-only/sample/obviously weak values, UTF-8 length >= 32 bytes, error messages do not include submitted secrets. Dev/test behavior retained. Minimum-length/placeholder checks cannot cryptographically prove entropy: production administrators MUST supply CSPRNG-generated unique secret material in their secret manager.
- `packages/api/src/utils/__tests__/production-secrets.unit.test.ts`: 6 positive/negative suites using synthetic fixture values only.
- `packages/api/.env.template`: local-only defaults are explicitly marked unsafe in production; document 48-byte CSPRNG generator and build-time/runtime secret delivery.
- `.github/workflows/safe-0a.yml`: immutable-main TypeScript/lint/build diagnostic and isolated candidate auth-secret / backend build checks. No databases, staging, API process, migration, provider payment or deployment.
- `apps/storefront/next.config.ts` deliberately UNCHANGED: `ignoreBuildErrors: true` is still present because real legacy TS errors exist and removing it without repair cannot pass the build.

## Independent CI evidence

| Gate | Source / method | Observed result |
| --- | --- | --- |
| SEC-01/02 | Missing JWT or cookie secret, NODE_ENV production, unit tests | PASS (expected throw) |
| SEC-03 | Short, scaffold secret, repeated character, whitespace, same pair | PASS (expected throw) |
| SEC-04 | Distinct synthetic 64-character test fixture secrets | PASS |
| SEC-05 | Dev/test missing config preserves scaffold local fallback | PASS |
| SEC-06a | Production Medusa CLI build with `JWT_SECRET=supersecret`, `COOKIE_SECRET=supersecret` and sentinel DB | PASS (build rejected by expected validation; no actual DB) |
| SEC-06b | Production `medusa build` with ephemeral random 48-byte secrets per var and sentinel DB | PASS; log: "Backend build completed successfully (6.45s)" |
| API-TS | Actual `tsc --noEmit --incremental false -p tsconfig.json` in packages/api | PASS |
| Test suite | Actual Bun 1.4.2 on GitHub Actions | 6 PASS, 0 FAIL |
| TS-01 | Unmodified `main`, storefront `tsc --noEmit --incremental false` | FAIL exit 2 |
| TS-LINT | Unmodified `main`, `bun run lint` | FAIL exit 1 |
| TS-BUILD | Unmodified `main`, `bun run build` | FAIL exit 1; JS compilation completed, type validation was SKIPPED, lint parser failed |
| TS-02/03 | Fixed Storefront typecheck + no-ignore production build | **NOT DONE / BLOCKED**: not allowed to broaden reference-scaffold repair to dozens of frontend files without typed baseline and UI-0 choice |
| Runtime | Actual deployed Medusa production startup/service, secret-manager access | NOT TESTED. Build test is not runtime or deployment approval. |
| Dashboard | Production Admin/Vendor panel asset bundling/browser | NOT TESTED; no dashboard app code changed. |

## Actual immutable-main Storefront failure groups

1. **React/JSX declaration mismatch:** TS2786 JSX components `Suspense`, `Fragment`, Medusa UI components, and ReactNode conflict across `@types/react` 18/19; this needs dependency-version and bundler/type-resolution analysis, NOT widespread casts or suppression.
2. **Mercur typed client/data mismatches:** e.g. Cart vs StoreCart API contracts. Must verify v2.3.7 SDK and Medusa 2.21.2 contracts before changing source.
3. **Missing module resolution:** `embla-carousel` import has TS2307. Verify installed dependency and supported import/export path; no arbitrary dependency add.
4. **ESLint/TSX parser configuration:** many files show "The keyword 'import' is reserved"; the Next 15 `next lint` command is deprecated and Next plugin is not detected. Rework rule/parser via supported Next 15 ESLint guidance in a distinct UI-source checkpoint.
5. **Reference vs target:** Product Owner confirmed these Mercur Admin/Vendor/Storefront apps were installed as reference/scaffold sources, not committed final UI. Do not repair all inherited UI solely to keep a future-replaced reference app alive; isolate live deployment risk and design UI-0 first.

## Safety boundary and code-review disposition

- **SAFE-0A security subset:** implementation plus CI evidence submitted for independent source/security review; no runtime production acceptance yet.
- **SAFE-0A Storefront gate:** BLOCKED due actual inherited type/lint failures. Do not set `ignoreBuildErrors=false` or claim production build security until errors have bounded reviewed fixes, OR approve a new DoğruAdres-owned Storefront replacement/cutover with real safe integration tests and quarantine the reference.
- **No permission was granted or used** for a Vehicle/Access data migration, Docker container/database operation, payment charge, TalkJS provider operation, production secrets read/rotation, main merge, force push or deployment.
- Continuing order after independent review: final SAFE-0A security checkpoint/possible isolated PR; UI-0 decision then scoped Storefront safety task; AF-1 Foundation and AF-2 mandatory Audit Index remain on separate planned tracks. All independent domain-module rules (ADR-0005/0006) remain in force.
