# M0: Identity, User and Organization Management acceptance plan

- Recorded: 2026-10-19. PROPOSED IMPLEMENTATION PLAN / browser ENVIRONMENT BLOCKED / MODULE NOT COMPLETE.
- Authority: current Product Owner mandatory vertical delivery and agent-owned browser decision. Methodology is binding, not pending reapproval. Inventory/extension review stops for independent Technical Advisor review before implementation.
- Worktree D:/DogruAdres-af1a; feature/af-1-foundation-audit-outbox. Initial local/live remote HEAD bab083d22d6791854f15984b0a0c0be276e6d0a9; working tree/index empty. No branch/ref change.
- M0 changes only AGENTS.md, PRINCIPLES.md and this plan. No production/UI, dependency, model or migration change; no stage/commit/push.

## 1. Scope authority

Read REQUIREMENTS.md §§7.1–7.4 with decision qualifiers, SECURITY.md, ADR-0007, current Foundation routes/service/middleware and installed Mercur 2.3.7 docs. APPROVED describes behavior, not implementation evidence. Broader approved outcomes with OPEN parameters remain explicit blockers below, not silently dropped. The first slice is a subset, never completion of the module.

Active module: Identity, User and Organization Management with required audit/security/shell dependencies. Vehicle implementation pauses; prior sources remain intact and blocked. Shared Audit Index/auth/notification/shell infrastructure may be dependencies inside this delivery plan, preserving independent physical ownership. R0's R1–R4 proposal is historical technical planning, not permission to bypass the new order.

Core approved behavior: explicit actor→Person mapping with no email merge, one Person across Organizations, independent current Org roles, protected platform provisioning, multiple protected Owners and last-active-Owner protection, invitation recipient/verified-email/seven-day/single-use rules, fresh-invitation-only reactivation, fail-closed scope/revocation, no platform private-data bypass, local canonical audit/outbox and the later approved restricted Owner/Admin audit timeline.

Do not invent self-service Org signup, account recovery, identity linking/merging, profile editing, Person-disable/Org-suspension UI privileges, ownership transfer/recovery, branch rights, Store linkage/verification workflows, badge thresholds or lock/notification policies. Those are absent, OPEN or DEFERRED. Existing framework login/logout is a prerequisite, not approval for new recovery behavior.

## 2. Actual backend/frontend gap inventory (SOURCE VERIFIED)

| Function | Existing source contract | Missing vertical path |
| --- | --- | --- |
| Authentication | Installed admin/vendor shells; session/bearer auth_context | Owned runtime/users; executed login/logout and role journeys |
| Canonical Person | ensureActorPerson_ during provisioning/valid invitation; resolvePersonForActor, uniqueness/disable checks | Safe identity/context presentation; no general Person-management or merge API |
| POST /admin/dogruadres/organizations | Platform user, verifies initial actors, workflow; name 1–200, 1–20 initial Owners; 201 redacted Org/count | Operator creation page; server stays authoritative |
| GET /dogruadres/organizations/:id | Active Owner/Admin/Member, active Org | Org detail/context UI; authorized my-Organizations discovery API absent |
| GET .../:id/memberships | Owner/Admin, active-membership DTOs | Membership UI, Member denial and empty/loading/error states |
| POST .../:id/memberships/:membership_id | Owner/Admin ordinary changes; protected Owner needed for Owner changes; last Owner protected; revoked target cannot reactivate here | Scoped role/revoke controls and refreshed state |
| POST .../:id/invitations | Owner/Admin; admin/member roles; token returned once, hash stored | Create/copy UI without token persistence/logging |
| DELETE .../:id/invitations/:invitation_id | Owner/Admin, scoped workflow | Revocation UI; no invitation-list GET exists for reopened management |
| POST /dogruadres/invitations/accept | Authenticated user/member/customer; actual email/provider verification, expiry/revocation/replay checks | Recipient entry/login/accept UI; no new verification provider or provisioning bypass |
| GET .../:id/audit-timeline | Current Owner/Admin; bound cursor, strict DTO, no-store, eventual/incomplete projection; Member/platform-only denied | Timeline UI and outage/late-delivery states; cursor key and relay liveness |
| Canonical audit/outbox + relay | Existing source/migrations and narrow R0 runtime evidence | Real HTTP→workflow→persist→derived timeline proof; scheduler/liveness unproven |
| Project frontend | apps/admin and apps/vendor wrap installed shells, clients/i18n/extension targets; no project management routes found | All project-specific screens and browser acceptance |

Sources: packages/api/src/api/admin/dogruadres/organizations/route.ts; api/dogruadres/organizations/[id], invitations/accept, authorization.ts, validators.ts; api/middlewares.ts; modules/dogruadres-access/service.ts; apps/{admin,vendor}/src/{main.tsx,lib/client.ts,extension-targets.d.ts}. Existing Foundation permissions are not replaced with Vehicle policy. Sequential legacy Foundation authorization needs its own focused runtime/race verification; do not certify it from source alone.

## 3. Approved broader outcomes: explicit dependency blockers

| Requirements | Approved outcome retained | Missing contract/dependency |
| --- | --- | --- |
| ID-002, ORG-001/005 | Personal context independent of multiple Org memberships | Current-person and authorized Org discovery; member-facing surface selection. Vendor Seller scope is not a universal Person shell |
| ID-003/004, ORG-007 | Email/real identity/legal Org/Store approval are distinct; email grants no legal privileges | Real-identity provider DEFERRED; legal criteria/provider/Store lifecycle OPEN. No fake verification workflow |
| ID-005/006, ORG-008 | Standard/Golden eligibility, protected ownership, genuine badge transitions/notifications; badges never authorize | Identity proof/performance thresholds and qualification timing OPEN/DEFERRED. No awards from email/ordinary membership; explicit scope review required, not silent omission |
| SEC-004 | Header lock next to bell, backend enforcement, password reauthentication | One/all-session scope, permitted locked operations, unlock/storage protocol OPEN; no project lock API/UI found. ARCHITECTURE BLOCKED |
| APP-004 and approved APP-005 outcome | Authorized bell data from genuine transitions; read state is not business state | Read/unread/channel/retention/locked access and delivery parameters OPEN |
| APP-008/001 | Personal order and expanded/collapsed preferences do not grant rights | Ownership key/defaults/sync/show-hide details OPEN; persistence absent |
| APP-001/002/003 | Entitlement vs permission vs preference, mandatory/default/optional rules and protected history | App catalog/sector matrix/lifecycle/history rights OPEN; shared shell dependency, not permission to build Accounting or another module |
| ORG-002/007, SEC-002/005/006/008 | Store/branch/platform scopes do not imply Org rights; revocation/confidentiality | Later Store/branch/job/file/export contracts remain separately bounded; no new surface invented; isolation negatives still required here |

ORG-006 branch model, ORG-009 tax uniqueness, broad SEC-009 search/export and APP-009 global search remain PROPOSED; recovery/merge/transfer remain OPEN. AF-2C's specifically approved restricted timeline is retained despite the older broad audit proposal. No approved row is reclassified as deferred. Technical Advisor must resolve the applicable first-module boundary and escalate precise OPEN parameters, including qualification dependencies, to the Product Owner. Methodology itself does not need reapproval. Until required blockers close, MODULE COMPLETE cannot be claimed or Vehicle implementation resumed.

## 4. Version-matched panel extension evidence

Installed @mercurjs/docs, admin, vendor and dashboard-sdk: 2.3.7. Read docs content/resources/customization/extending-panels.mdx, resources/tutorials/custom-panel-page.mdx and references/panel-extensions/create-page.mdx.

- Both Vite configs use mercurDashboardPlugin with ../../packages/api/medusa-config.ts and optional backendUrl. createRequire is a preexisting compatibility adjustment, not a new patch.
- SDK dist/vite.cjs getRoute/crawlRoutes scans src/routes/**/page.{tsx,ts,jsx,js}; [id] maps to :id; config label adds navigation; hasConfigPublic recognizes literal public=true. Private management pages must not opt into public mode. The authenticated shell is not Org authorization.
- Plugin uses each app's src, reads Medusa config for base/extensions, emits __BACKEND_URL__/__BASE__. Config mounts /dashboard and /seller; Vite scripts use 7000/7001, backend defaults to localhost:9000 unless supplied. These are source defaults, NOT verified running targets; do not probe unknown listeners as task-owned.
- Unique paths append; matching built-in paths replace. Use namespaced pages. Widget/custom-field availability differs; installed docs say mounted widget/product custom-field zones are vendor-focused. Do not assume an admin header lock/bell zone exists; verify that exact mechanism first.
- Existing clients use @mercurjs/client, generated @acme/api/_generated, panel getAuthHeaders and credentials:'omit'. Preserve actual bearer/session behavior. Codegen is a later bounded step, not run in M0.
- Existing extension-targets.d.ts files already reference each panel. No new dependency selected. CommonJS require.resolve('@mercurjs/admin') failed because its main export is import-only; package.json confirms installed ESM exports, not a missing package.

Recommended first surface: existing admin panel for already-approved platform provisioning only, never private-Org operator bypass. General Org/invitation screens must also support approved customer/member identities; vendor Seller membership cannot become a new prerequisite. Universal shell choice needs review.

## 5. Actual browser smoke evidence

- Tool: mcp__cua_repl browser automation; computer-use skill read for feasibility.
- Actual command: await cua.getState(). Result: **failed to write kernel assets: Sistem belirtilen yolu bulamıyor. (os error 3)** before inventory/tab creation.
- Target: none opened. User journey: none. No authentication, click/form, screenshot or visible/persistence assertion executed. Browser smoke **ENVIRONMENT BLOCKED**; all function journeys below **NOT TESTED**. Terminal HTTP is not browser evidence.
- Apps inspected on disk only. No service started, unknown localhost target accessed, fixture credential used or DB connected. R0 stopped container/evidence unchanged; its module runner is not a full authenticated application fixture.
- Prerequisites: repair browser kernel assets/session; verify task-owned API build/listener, isolated DB/Redis as required, synthetic role identities, panel origin/base/backend binding and cleanup ownership. Then use actual UI login/navigation/actions and record/retest real failures.
- Security finding: medusa-config.ts retains fallback JWT/cookie secret literals. No M0 config change; disposable runtime must supply strong fresh secrets, never the fallback. Review fail-closed configuration hardening as a bounded prerequisite. Invitation secret and cursor key also require secure provisioning. No secret values or personal paths are recorded here.

## 6. Per-function browser acceptance matrix

Requirement IDs below have the DA- prefix from REQUIREMENTS.md. UI entries are proposed, not existing screens or new privileges. B0 = **NOT TESTED**; tool-level blocker is ENVIRONMENT BLOCKED. No row has execution evidence yet. Each journey includes refresh/reopen and safe sanitized evidence. Incomplete required rows block completion.

| Requirement → function | Role | UI entry / real action | Expected visible result, negative/empty/error paths | Backend/persistence assertion | Browser test → actual result → evidence |
| --- | --- | --- | --- | --- | --- |
| SEC-001/003 → auth prerequisite | Synthetic operator/Org roles; signed-out | Existing login; sign in/out; reopen private URL | Valid permitted shell; invalid login/sign-out denied; no stale private view | Verified server auth_context; missing/invalid auth denied | B01 → B0 → none |
| ID-001 → canonical identity | Same actor in A/B; ambiguous/disabled fixtures | Identity/context UI; switch A/B | Same Person, only allowed scopes; no email merge | Exactly one enabled Person/mapping; no duplicate/link from email | B02 → B0 → none |
| ORG-001/004/008 → provision Org | Platform user; nonplatform negative | Admin create page; name and two verified initial actors | 201 Org/count; invalid/duplicate/unknown actors rejected; no false success | One Org, distinct protected Owners, 1+N audit/matching outbox; faults leave no partial state | B03 → B0 → none |
| ORG-001/005, ID-002 → select/read Org | Active Owner/Admin/Member; foreign/revoked/platform-only | Context/detail; choose A/B, refresh | Active permitted detail; safe foreign/nonexistent/suspended denial; no chooser count leak | Server scope/current identity/membership; selector grants no authority | B04 → B0 → none |
| ORG-001, SEC-003 → list memberships | Owner/Admin; Member negative | Membership page; load/refresh | Redacted active list; denied/empty/loading/error states | Only authorized Org; approved DTO, no unrelated personal fields | B05 → B0 → none |
| ORG-004 → ordinary role change | Owner/Admin; Member negative | Change admin/member control | Meaningful success persists; revoked/foreign/unauthorized rejected | Current policy; scoped target; correct one audit/outbox attribution | B06 → B0 → none |
| ORG-004/008 → protected Owner | Protected Owner; Admin/nonprotected negative | Add/change Owner controls | Multiple Owners; last active protected Owner removal rejected | Protected count invariant under concurrency; rejected transition no audit | B07 → B0 → none |
| ORG-001, SEC-005 → revoke membership | Owner/Admin; old user's second session | Revoke then old browser refresh | Later private access denied; no stale privilege | Committed revocation/current policy; scoped audit/outbox | B08 → B0 → none |
| ORG-003 → create invitation | Owner/Admin; Member negative | Create admin/member invitation; copy once | Valid result; email/role validation; no owner invitation or token recovery after reopen | Token hash only, seven-day expiry, intended recipient/Org; no token in audit/log/storage | B09 → B0 → none |
| ORG-003 → revoke invitation | Owner/Admin; Member/foreign negative | Scoped invitation controls; revoke/refresh | Persistent revoked state; safe rejection; no token redisplay | Correct row and audit/outbox; later acceptance denied | B10 → B0 → none |
| ORG-003, ID-003 → accept invitation | Matching verified user/member/customer | Recipient entry; login; accept | Intended membership after refresh; no identity/Store merge | Actual email/provider proof, token hash; one transition/audit/outbox | B11 → B0 → none |
| ORG-003 → rejection/replay | Wrong/unverified/expired/revoked/reused token | Same form; invalid cases/double-submit | Safe denial, no recipient/Org leak or false success | No unauthorized writes; independent concurrent single-use test | B12 → B0 → none |
| ORG-003/004 → reactivation | Revoked actor and authorized inviter | Ordinary role change negative; fresh invite/accept | Ordinary reactivation denied; fresh valid invite restores intended role | Same canonical Person/current membership; old token cannot restore | B13 → B0 → none |
| AF-2C approved timeline; SEC-007/008 | Current Owner/Admin; Member/platform-only negative | Audit page; paginate/refresh; demoted session | Redacted rows, eventual/incomplete notice; genuine empty state; outage not false empty | Bound cursor and scoped data/counts; Index identity/content matches source | B14 → B0 → none |
| SEC-001/002/003/006/008 → isolation/spoofing | Two Orgs/roles; forged selectors/cursors | Alter route/context; multiple tabs; stale navigation | Uniform safe denial; no data/count/token/cursor leak | Current server policy each request; no cross-scope cache/session grant | B15 → B0 → none |
| ID-003, ORG-002/007 → distinct verification | Email-only/unverified Org fixtures | Identity/Org status and allowed linked actions | Email does not imply identity/legal/Store approval or privilege | Independent states unchanged; prohibited eligibility action denied | B16 → B0; OPEN lifecycle dependency → none |
| ID-005/006, ORG-008 → badges/transitions | Eligible/ineligible subjects after contract resolution | Badge and genuine transition notification | No email-only award; real eligibility shown; badge grants no access | Approved evaluator/transition; no fabricated qualification | B17 → B0; OPEN/DEFERRED dependencies → none |
| SEC-004 → session lock/unlock | Authenticated roles; wrong password/other tab | Header beside bell; lock/direct access/unlock | Backend lock; wrong password/overlay removal cannot unlock | Real session enforcement and fresh reauthentication | B18 → B0; architecture parameters OPEN → none |
| APP-004, approved APP-005 outcome → bell | Authorized recipient; other user/Org negative | Open genuine notifications/read state | Authorized list/empty/error; reading changes no domain eligibility | Genuine transition/recipient scope; reviewed delivery contract | B19 → B0; parameters OPEN → none |
| APP-008/001 → personal launcher | Two Persons/Org contexts | Reorder/expand/collapse/reopen | Independent persistent preference; no permission change | Approved preference key; server authorization unaffected | B20 → B0; key/defaults OPEN → none |
| APP-001/002/003 → entitlement/history | Applicable approved user/Org roles | Reviewed lifecycle controls when contract resolved | Mandatory cannot optional-off; no history deletion or hidden grant | Reviewed catalog/sector/history rights; no unrelated module implementation | B21 → B0; scope parameters OPEN → none |

Record each executed journey's timestamp, source/build/browser version, disposable manifest ID, identity alias/role (never password), actual steps, visible result, sanitized trace/screenshot and independent persisted checks. Supporting real API/DB tests additionally cover audit/outbox failure rollback, protected Owner concurrency, invitation races, current-role checks, append-only audit and relay idempotency/liveness. Browser clicks alone do not prove these invariants. No M0 row is PASSED; approved dependency rows cannot be dropped to declare completion.

## 7. First proposed end-to-end checkpoint (not started)

M1 candidate: authenticated platform operator provisions one Organization with two independently verified synthetic initial Owners in the existing admin shell. This demonstrates an early real vertical path through an already approved backend operation, not module completion. It grants no platform access to private Org data.

First gates: restore browser automation; independently review this inventory, panel extension and bounded disposable application fixture. Never substitute mocked success or a static screen for browser acceptance.

Exact proposed file scope:

1. Add apps/admin/src/routes/dogruadres/organizations/create/page.tsx: private namespaced page, approved form, loading/error/result states and existing design system.
2. Add apps/admin/src/lib/organization-provisioning.ts: narrow typed existing POST adapter with explicit payload/result; no raw models/credentials.
3. Add packages/api/src/api/dogruadres/__tests__/organization-provisioning.unit.spec.ts: existing Jest route contract for platform guard, actor verification and DTO. Mock evidence only.
4. Amend this plan with B01/B03 real browser steps/results, sanitized external evidence links and independent persisted-state assertions.

Use the existing browser tool; no new test dependency selected. A controlled Playwright runner is a later bounded option only if already installed/supported or separately approved. M0 installs nothing. No new business endpoint, model/schema, production provisioning bypass or Vehicle change. If typed generated routes require extra files/codegen, report a scope amendment before implementing.

Before runtime/browser acceptance, separately bound and verify supported synthetic framework auth provisioning, strong secrets, build/listener/source identity, owned disposable DB/Redis where required, migrations, loopback-only origins and cleanup. R0's module-only environment does not satisfy this authenticated application prerequisite. No original/G1/shared/production access. Browser repair and fixture review are prerequisites, not reapproval of the binding methodology.

Continue later slices only inside this module: authorized Org discovery/context, membership/Owner management, recipient verification/invitations, restricted audit timeline and approved identity/shell dependencies after OPEN parameters resolve. Do not invent roles or silently omit functions. Vehicle implementation cannot resume until required first-module rows and independent acceptance close.

## 8. Reused evidence, protected hashes and M0 stop gate

Reuse R0 evidence at baseline bab083d22d6791854f15984b0a0c0be276e6d0a9 only within its limits: six focused suites/68 passing tests; narrow PG16.15 module/Query/state and Vehicle UOW primitive evidence. None rerun here; none proves browser/full authenticated application, concurrent managers, lock-held final authorization or workflow/request lifecycle.

Protected SHA-256 (relative to packages/api; initial and final verification required):

| Source | SHA-256 |
| --- | --- |
| integration-tests/helpers/isolated-foundation-runtime.mjs | 5b49e1a99144221406569ba57a6ab887328940a44d7ffef2261f4c166d4dcdf5 |
| integration-tests/http/dogruadres-foundation.atomicity.native.test.mjs | 61c33dcc7bb292c36b6646fb60c4c8ce90e227d7d3177654f7d3c791b5231583 |
| integration-tests/helpers/foundation-module-runtime.mjs | 98f52061db1392fb06ad49a5b73b5c4adad976e25c3d7f72b910cf7e1f6d39aa |
| integration-tests/modules/foundation-audit.evidence.cjs | d3fa599376ac09ba47f7589f9d6647e5fc1032ab351da88d0d37a9b7d1def4bf |

SOURCE VERIFIED: authoritative decisions, route/service roles, UI gaps and installed extension contracts. Browser smoke ENVIRONMENT BLOCKED; all function journeys NOT TESTED. No unit/build/HTTP/DB runtime run in M0. Governance whitespace/diff and exact three-file inventory are final checks; no staging, commit or push. Stop for independent Technical Advisor review. MODULE NOT COMPLETE; Vehicle authorization/CRUD remain BLOCKED.

Final M0 verification: tracked git diff --check and independent whitespace/newline checks for all three files passed. Matrix has 21 unique unexecuted journeys. Final four protected hashes match the table; exact local inventory is the two modified governance files and this new plan. HEAD remains bab083d22d6791854f15984b0a0c0be276e6d0a9, index empty. No publication or runtime execution.
