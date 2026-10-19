# R0 architecture consolidation: evidence and bounded repair plan

Recorded 2026-10-19. R0 stops for Technical Advisor review; no staging, commit or push authorized. Policy is binding; implementation is not automatically accepted. Vehicle mutations remain CLOSED.

## Baseline and protected evidence

Worktree D:/DogruAdres-af1a; branch feature/af-1-foundation-audit-outbox. Initial local HEAD and live origin branch both d5392c7f92ce61c1bd7c3237d3f8c5d9360b525b. Initial tracked/untracked status and Git index empty. Remote checked with git ls-remote; no fetch/ref change. No other worktree used for implementation.

SHA-256 (paths relative to packages/api; verified before and after work):

| Protected source | SHA-256 |
| --- | --- |
| integration-tests/helpers/isolated-foundation-runtime.mjs | 5b49e1a99144221406569ba57a6ab887328940a44d7ffef2261f4c166d4dcdf5 |
| integration-tests/http/dogruadres-foundation.atomicity.native.test.mjs | 61c33dcc7bb292c36b6646fb60c4c8ce90e227d7d3177654f7d3c791b5231583 |
| integration-tests/helpers/foundation-module-runtime.mjs | 98f52061db1392fb06ad49a5b73b5c4adad976e25c3d7f72b910cf7e1f6d39aa |
| integration-tests/modules/foundation-audit.evidence.cjs | d3fa599376ac09ba47f7589f9d6647e5fc1032ab351da88d0d37a9b7d1def4bf |

## Governance change inventory and provenance

Only AGENTS.md, PRINCIPLES.md, SECURITY.md, ARCHITECTURE.md, adr/README.md, new ADR-0007 and this evidence report change. Existing ADRs and business source are unchanged. The exact reviewable patch is git diff plus the two untracked Markdown files; no historical file was fabricated.

ADR-0005/0006 exist in authentic local commit 9be9d9ffb0ae8cd06341e613497f525dd7877371, outside this branch's ancestry. ADR-0005's earlier acceptance is also in df04f9199e7654f13dba7c98c6ccbfa6c2aa954b. The current branch contains only ADR-0001–0003. The Vehicle documentation branch name is not locally available; git show read the existing objects without checkout/merge. ADR-0007 reconciles this gap using those records and today's explicit Product Owner R0 decision. It does not invent a historical message, approval date or missing accepted file.

Policy A: L is the final Foundation coherent SELECT's MVCC snapshot acquisition point, after the Vehicle scoped lock/read and before the first Vehicle write. On a fresh validated authoritative-primary READ COMMITTED statement, revocation committed before L denies; revocation committed after L may overlap the already-authorized operation. Every new operation needs a new final check. No commit-time fencing, shared EntityManager or reusable/replayed grant is approved.

## Exact targeted unit execution

Cwd packages/api. Six explicit paths (prefix src/):

- modules/dogruadres-access/__tests__/query-registration.unit.spec.ts
- modules/dogruadres-access/__tests__/authorization-projection.unit.spec.ts
- workflows/dogruadres-vehicle/__tests__/authorization.unit.spec.ts
- workflows/dogruadres-vehicle/__tests__/vehicle-uow.unit.spec.ts
- modules/dogruadres-vehicle/__tests__/service.unit.spec.ts
- modules/dogruadres-vehicle/__tests__/audit-envelope.unit.spec.ts

PowerShell command: set TEST_TYPE=unit, NODE_ENV=test, NODE_OPTIONS=--experimental-vm-modules; resolve the installed CLI with node -p "require.resolve('jest/bin/jest')"; run node <resolved-jest> --runInBand --no-cache --silent=false --runTestsByPath <the six paths above>.

| Attempt | Exit | Executed result | Classification |
| --- | --- | --- | --- |
| Existing Jest config, default SWC cache | 1 | 0 tests; native binding cache ownership failure | ENVIRONMENT BLOCKED |
| Same command, documented SWC_NATIVE_BINDING_CACHE=0 under normal host user | 1 | 6 suites: 5 passed, 1 failed; 68 tests: 66 passed, 2 failed | TEST EXECUTED AND FAILED |

Passing suites: Foundation Query registration, Foundation projection, Q2 observer, Vehicle service and Vehicle audit envelope. UOW suite failures are not suppressed:

1. vehicle-uow.unit.spec.ts:83 expects Object.isFrozen(accessor-only sealed context) to be false. JavaScript considers sealed accessor-only properties frozen too; this does not prevent their setters. Replace that inaccurate assertion with behavioral descriptor/setter checks; do not remove security expectations.
2. vehicle-uow.unit.spec.ts:126 supplies __container__.vehicleService, but generated MedusaService dispatch uses lowerCaseFirst(DML model name) + Service, i.e. daVehicleService. Correct the mocked DAL registration and retain the actual generated-method assertion.

No test or production source was edited in R0. These are immediate R1 repairs, not permission to ignore a red suite. A preliminary require.resolve from repository root failed because Jest belongs to the API workspace; resolving from packages/api succeeded. No installation was needed.

## Owned real runtime and commands

Evidence directory outside Git: <TASK_TEMP>/dogruadres-r0-bfac655718814d18. Executable probe scripts, sanitized logs, ownership/provenance, per-area results and cleanup evidence are retained there. connection.private.json contains only disposable-role credentials and MUST NOT be published. No real application env file was loaded.

- Node 24.21.0, Jest 29.7.0, TypeScript 5.9.3, Medusa 2.21.2, installed Mercur docs/core contract 2.3.7.
- PostgreSQL 17 image was not installed. R0 permits the actual installed version; no claim of PostgreSQL 17 acceptance is made.
- Used installed PostgreSQL 16.15 image ID sha256:621a761097839bdb50207afd6b87a72f38e2d718dd46c3d744828d8917c4f1e0, in one NEW task-owned instance, no existing container/volume/database reused.
- Container 79281dcf74886bb3d70e1de95fb6630f3dd9256c11ea0ecdff7b6cf2b4778d0a; name dogruadres-r0-bfac655718814d18-postgres; volume dogruadres-r0-bfac655718814d18-data. Exact task/run labels and sole data-volume mount verified.
- Only 127.0.0.1:54455 → 5432; 384 MiB memory/swap ceiling, 1 CPU, 128 PID limit; nonprivileged. Host free memory measured about 1.70 GiB before provisioning; sequential probes were used. No other service started.
- Database r0_bfac655718814d18, OID 16385, PostgreSQL system identifier 7698147923222143016. Initial public tables 0. Test role r0_test owns only this new database, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION. Provisioning admin was used only for initial setup and never as test credentials.
- Observed READ COMMITTED and pg_is_in_recovery=false in the directly owned instance. Role statement_timeout=15s, lock_timeout=3s, idle_in_transaction_session_timeout=15s. Actual timeout/cancellation handling remains NOT TESTED.

Actual command sequence (PowerShell creates only external scripts, Node runs them):

1. docker version --format '{{json .}}': sandbox attempt exit 1 (access denied), authorized host attempt exit 0. docker image inspect postgres:17: missing image; the combined shell returned 0 because the following memory command succeeded, so image lookup is NOT a success. docker image ls postgres --no-trunc --format '{{json .}}' and docker info resource read: exit 0. No existing DB inspected.
2. node <evidence>/provision.cjs: exit 0. Creates exactly the labeled resource above by verified image ID, binds loopback, verifies mounts/image/role/database identity and records provenance. No image pull or dependency change.
3. node <evidence>/run-runtime.cjs, initial SWC transformer: two bootstrap attempts exit 1, 0 tests. Task-owned cache ACL rejected by SWC. An attempted real-profile fallback was rejected by automatic safety review and NEVER EXECUTED. No unsafe fallback was used.
4. Same external launcher with an installed TypeScript transpileModule Jest transformer and task-owned Windows/XDG profile: exit 1; 2 tests failed during module setup because --experimental-vm-modules was missing. Migrations ran, assertions did not; schema teardown and no pending transaction were independently verified before correcting the flag.
5. Same launcher with NODE_OPTIONS=--experimental-vm-modules and MEDUSA_DISABLE_TELEMETRY=true: exit 1; 1 test passed, 1 failed. Actual module SELECT/state/race subchecks and Vehicle UOW commit/rollback succeeded, but runner-provided Query had no alias. runtime-attempt2.log and runtime-results.json retain the failure. No assertion was changed to mark it passing.
6. Same launcher, isolated explicit queryable custom-module definition matching MedusaAppLoader: exit 0, 1 test passed (virtual denial dispatch). The previous failing evidence remains retained in runtime-attempt2.log. runtime-query-denial.log records this passing narrow probe.
7. Same queryable-definition probe extended for positive attribution, field/pagination rejection and fresh Query after committed revocation: exit 0, 1 test passed. runtime-jest.log and query-results.json record these checks. Do not sum these overlapping probe runs as independent acceptance coverage.
8. Independent final SQL/observer checks and docker stop --time 15 <exact-new-container-ID>: exit 0. Public tables 0, other DB sessions 0, awaited observer shutdown, container stopped with exit 0 and OOMKilled=false. Container and volume RETAINED, not deleted. No destructive recovery or protected resource cleanup.

The external launcher pins target identity, uses an environment allowlist with task-owned profile/XDG paths, does not run repository medusa-config or CLI, and uses explicit migrations, never model-only schema as trigger evidence. The preexisting protected AF-1D1 launcher was not modified or invoked: it requires clean committed source and its own AF-1D1 manifest, whereas R0 documentation intentionally remains uncommitted.

## Runtime acceptance matrix

| Area | Evidence/status | Limits |
| --- | --- | --- |
| A Module registration | TEST EXECUTED AND PASSED: Foundation and Vehicle initialized sequentially | Not full application/HTTP bootstrap |
| B Virtual Query dispatch | TEST EXECUTED AND PASSED with explicit isQueryable custom definition | Default moduleIntegrationTestRunner path failed; see defect below |
| C Translation/shape | TEST EXECUTED AND PASSED: positive and denied exact 9-field DTO, take=2, field/pagination rejection | Arbitrary QueryContext/options/relation attacks not exhaustively runtime-tested |
| D Actual SELECT | TEST EXECUTED AND PASSED: real service method and PostgreSQL connection, parameterized source SQL | Whole pool SQL statement count and ambient contexts not instrumented |
| E Isolation/primary | TEST EXECUTED AND PASSED for owned PG16.15 instance, READ COMMITTED/non-recovery; source guard checked | No production proxy/replica or ambient REPEATABLE READ certification |
| F State denial | TEST EXECUTED AND PASSED: disabled Person, suspended Org, revoked membership, missing mapping, deleted mapping | All other soft-delete permutations/malformed DB states NOT TESTED; duplicate mapping rejected by DB 23505, not injected past unique constraint |
| G Revocation order | TEST EXECUTED AND PASSED: uncommitted writer revocation did not affect completed SELECT; after writer commit next SELECT and cache-disabled Query denied | No instrumented mid-statement L, post-lock concurrent Vehicle authorization or commit-time fencing proof |
| H Vehicle atomicity primitive | TEST EXECUTED AND PASSED: real UOW commit 1/1/1; targeted outbox PZ001 rollback preserved 1/1/1 | Generated internal persistence in bounded callback, not authorized business mutation integration; audit-failure variant NOT TESTED |
| I Independent managers | SOURCE VERIFIED intended separation; sequential real module startup | Simultaneous Foundation/Vehicle backend ownership and lock-held cross-module authorization NOT TESTED |
| J Cleanup | TEST EXECUTED AND PASSED: runner schema teardown, no remaining sessions, observer close and owned-container stop | Request cancellation, timeout/deadlock/unknown-outcome recovery NOT TESTED |

Vehicle commit marker: backend PID 124, xid 786. The callback uses the same context for all three generated calls, and independent persisted counts confirm commit/rollback; separate markers at every INSERT were not captured. Revocation writer PID 120, observer PID 118. These are evidence identifiers, not universal connection identities.

Foundation migrations observed: Migration20261017135550, Migration20261017150237, Migration20261018000000, Migration20261018020000. Vehicle migration observed: Migration20261019000000. Only up paths ran inside this disposable database; no historical down migration executed. This does not establish all audit immutability/relay acceptance requirements.

## Concrete findings and immediate repair boundaries

- Two real UOW unit failures described above: test-contract defects, not evidence of proven runtime adapter failure. Immediate R1 test repair preserves behavioral assertions. Owner: Local Agent in bounded R1, Technical Advisor acceptance required; no new product policy needed.
- Query test runner omission: test-utils module-test-runner.js sets definition from ModulesDefinition[customName] (undefined); modules-sdk getCustomModuleResolution lacks isQueryable. Query.createQuery excludes modules without that flag. Normal framework medusa-app-loader.js mergeDefaultModules sets isQueryable=true. A narrowly configured test MedusaApp definition reproduces that behavior and passed actual virtual Query. Repair the project-owned acceptance harness, not upstream and not production aliases. Alternatives: use full application loader (larger side effects), or remain source-only (rejected). R1 scope approval is needed for tracked harness changes.
- Vehicle service currently returns missing/deleted errors and performs values/no-op validation before authorizeMutation_. This violates the approved future ordering, but the fail-closed seam prevents business mutations today. Reorder through application-owned UOW/lock/final-decision/Vehicle-only mutation in R3 before exposing any route. Never hide a Foundation callback inside Vehicle. No R0 production edit authorized.
- UOW depends on runtime baseRepository_; SOURCE-POSSIBLE / PUBLIC SUPPORT UNPROVEN remains. Real primitive execution passed, not upgrade stability, scheduler or lock lifetime. Preserve the isolated compatibility boundary.
- Foundation legacy authorization helper and Q2 observer are sequential reads; neither can become the canonical final Vehicle grant. S2 source comments still state product policy pending; R0 governance supersedes that policy comment, while integration remains blocked. Consolidate only after verified replacement and reviewed cleanup (R2/R4).
- No request-bound capability, final workflow integration or Vehicle HTTP route exists. Generated CRUD is internal infrastructure, not public authorization. Request replay/cancellation remains a security gate, not a permissible omission.

Foundation writer inventory (SOURCE VERIFIED): ensureActorPerson_ creates first-use mapping/Person in a transaction; provisionOrganization creates active Org/Owners; changeMembership changes role/revokes under Foundation locks; acceptOrganizationInvitation creates/reactivates membership. No dedicated project route for Person disable, mapping reassignment or Organization suspension was found; generated CRUD/direct privileged SQL remain potential writers. Policy A needs their committed primary state visible at fresh L, not a shared reader/writer fencing lock. Future writers must preserve Foundation invariants, audit/ownership and the same primary visibility contract.

## R1–R4 proposal: file scope and dependency order (not implementation permission)

Paths below relative to packages/api/src unless beginning integration-tests/. No Vehicle exposure until all earlier gates pass. Each checkpoint requires bounded authorization and independent review; no new product-policy approval is needed for Policy A.

| Gate | Exact proposed file scope | Acceptance dependency |
| --- | --- | --- |
| R1: repair observed tests and reproduce real evidence | workflows/dogruadres-vehicle/__tests__/vehicle-uow.unit.spec.ts; new integration-tests/helpers/consolidation-runtime.mjs; new integration-tests/helpers/consolidation-typescript-transform.cjs; new integration-tests/modules/consolidation.evidence.cjs | Fix both real assertions/mocks; all six unit suites green; owned-resource guard; explicit queryable definition; preserve real failing history. No upstream patch |
| R2: canonical coherent decision contract | modules/dogruadres-access/authorization-projection.ts; modules/dogruadres-access/service.ts; modules/dogruadres-access/__tests__/authorization-projection.unit.spec.ts; new workflows/dogruadres-vehicle/final-authorization.ts; new workflows/dogruadres-vehicle/__tests__/final-authorization.unit.spec.ts; integration-tests/modules/consolidation.evidence.cjs | R1 accepted; real fixed Query translation, one SELECT instrumentation, fresh primary/ambient isolation rejection, complete malformed/cardinality/soft-delete/action matrix. Keep Q2 untouched as historical evidence |
| R3: application UOW and request-bound mutation authority | modules/dogruadres-vehicle/service.ts; modules/dogruadres-vehicle/__tests__/service.unit.spec.ts; new utils/vehicle-authorization-context.ts; new utils/__tests__/vehicle-authorization-context.unit.spec.ts; new workflows/dogruadres-vehicle/index.ts; new workflows/dogruadres-vehicle/__tests__/mutation.unit.spec.ts; integration-tests/modules/consolidation.evidence.cjs | R2 accepted; scoped lock before final check, resource evaluation afterward; no Foundation callbacks/managers inside Vehicle; same source-local transaction; actual simultaneous backend/lock/race/fault/replay/cancel tests; no HTTP exposure yet |
| R4: guarded HTTP and reviewed redundant-path cleanup | api/middlewares.ts; new api/dogruadres/vehicle-contract.ts; new api/dogruadres/__tests__/vehicle-contract.unit.spec.ts; new api/dogruadres/organizations/[id]/vehicles/route.ts; new api/dogruadres/organizations/[id]/vehicles/[vehicle_id]/route.ts; workflows/dogruadres-vehicle/authorization.ts and its __tests__/authorization.unit.spec.ts only for explicitly reviewed historical-observer retirement; integration-tests/modules/consolidation.evidence.cjs; new integration-tests/http/vehicle-acceptance.evidence.cjs | R3 runtime/security accepted; GET/POST/DELETE authentication/no-store; role/Organization hiding; opaque cursors and strict DTOs; real HTTP/browser where practical. Cleanup only after replacement verification; no changes to unrelated Foundation/audit reader policy |

If any additional file or security decision proves essential, report a bounded scope amendment instead of silently expanding it. These inventories are an implementation proposal, not technical acceptance of request-context propagation or authority design.

## Source evidence and remaining gates

Installed Mercur 2.3.7 resources/best-practices/modules.mdx and workflows.mdx: thin own-data modules, application workflow orchestration, Query cross-module reads. Medusa 2.21.2 installed files: modules-sdk/medusa-service.js generated DAL key construction; decorators/inject-manager.js context copy; dal/mikro-orm/mikro-orm-repository.js fresh manager/transaction; framework/medusa-app-loader.js queryable defaults; test-utils/module-test-runner.js and database.js setup/migrations/teardown; query/query/query.js createQuery and module-data-fetcher dispatch; modules-sdk/loaders/register-modules.js custom definition. These are source contracts; no framework code changed.

PostgreSQL 16 official [READ COMMITTED semantics](https://www.postgresql.org/docs/16/transaction-iso.html#XACT-READ-COMMITTED) and [explicit locks](https://www.postgresql.org/docs/16/explicit-locking.html) explain the approved L boundary and the independent lock-lifetime acceptance requirement. A consistent read is not commit-time fencing.

Remaining: UOW unit failures; reproducible tracked runtime harness; exact statement/backend/transaction instrumentation; simultaneous independent managers and scoped lock lifetime; complete state/cardinality matrix; live post-lock Policy A races; request identity/capability, workflow replay/retry/cancel; timeout/deadlock recovery; authenticated Vehicle HTTP/security/pagination; full canonical audit/relay/Index acceptance. No Vehicle mutation activation, publication, merge or deployment occurred.

Final state: baseline HEAD unchanged, index empty; only the seven governance/evidence Markdown files changed. Protected hashes match. R0 stops for independent Technical Advisor review; R1–R4 are not started.

## R0-R1 amendment: targeted UOW test repair attempt (2026-10-19)

This is subsequent evidence. The original R0 result remains **66 PASSED / 2 FAILED / EXIT 1**. No earlier report text or runtime evidence has been rewritten. Initial HEAD remained d5392c7f92ce61c1bd7c3237d3f8c5d9360b525b, branch unchanged, index empty and the seven existing R0 governance/evidence changes present. Four protected source hashes matched.

Only vehicle-uow.unit.spec.ts and this append-only amendment changed during this repair checkpoint. The other six R0 governance files remain byte-identical to their pre-repair state.

### Source changes and first targeted execution

- Removed the irrelevant expectation that an accessor-only sealed context must report Object.isFrozen=false. Added non-configurable descriptor checks for __type, enableNestedTransactions and transactionManager; rejected descriptor replacement and property injection; verified absence of a transaction-manager setter and revoked getter/setter access after callback completion. All existing permitted/forbidden setter, manager replacement and error checks remain. Production UOW unchanged.
- Changed the DAL mock from vehicleService to the explicitly instructed da_vehicleService. This proposed key did NOT match the actual installed generated contract, as the execution below revealed; it remains a known failing local test change pending review, not a completed repair.

Cwd D:/DogruAdres-af1a/packages/api. Exact PowerShell test command:

~~~powershell
$env:TEST_TYPE='unit'
$env:NODE_ENV='test'
$env:NODE_OPTIONS='--experimental-vm-modules'
$env:SWC_NATIVE_BINDING_CACHE='0'
$jestPath = node -p "require.resolve('jest/bin/jest')"
node $jestPath --runInBand --no-cache --silent=false --runTestsByPath src/workflows/dogruadres-vehicle/__tests__/vehicle-uow.unit.spec.ts --testNamePattern 'permits only expected forwarding writes on the sealed root|passes the same transaction to an actual generated Vehicle list method' 2>&1 | Tee-Object -FilePath <TASK_TEMP>/dogruadres-r0-r1-UynYmh\targeted-uow.log
exit $LASTEXITCODE
~~~

**TEST EXECUTED AND FAILED:** exit 1; 1 suite failed; 2 selected tests executed: 1 passed, 1 failed. Thirteen other tests were excluded by the explicit name filter (no skip added to source). The sealed-context behavioral test passed. The generated list method still failed with TypeError reading list from an undefined DAL registration. No database, application or workflow execution occurred.

### Confirmed naming discrepancy and smallest correction

Installed Medusa 2.21.2 dml/entity.js extractNameAndTableName applies upperCaseFirst(toCamelCase(name)), turning da_vehicle into **DaVehicle**. modules-sdk/medusa-service.js takes config.name for a DML entity and constructs lowerCaseFirst(modelName) + Service. Therefore the actual key is **daVehicleService**, neither vehicleService nor da_vehicleService. The original R0 report's daVehicleService recommendation is consistent with this inspected source.

Pinned upstream counterparts: [DML entity naming](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/utils/src/dml/entity.ts) and [generated service dispatch](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/utils/src/modules-sdk/medusa-service.ts). JavaScript [TestIntegrityLevel](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-testintegritylevel) checks writability for data descriptors; frozen accessor properties may still have functional setters. The passing behavioral test verifies the intended security contract rather than relying on Object.isFrozen.

A non-database DML naming probe was executed from packages/api, exit 0:

~~~javascript
node -e "const {model,lowerCaseFirst}=require('@medusajs/framework/utils');const entity=model.define('da_vehicle',{id:model.id().primaryKey()});console.log(JSON.stringify({entityName:entity.name,generatedDalKey:lowerCaseFirst(entity.name)+'Service'}))"
~~~

Observed: {"entityName":"DaVehicle","generatedDalKey":"daVehicleService"}. This is actual installed model-builder execution, not framework module initialization or database evidence.

The mandatory stop-on-new-finding condition was applied. The six focused suites were **NOT TESTED after this repair attempt**, and the fixture was not silently changed again. Smallest proposed next correction: replace only da_vehicleService with daVehicleService, retain every assertion, rerun the two selected tests, then the six suites. No production change, dependency change or new product/security policy is needed; Technical Advisor should reconcile the supplied naming assertion before continuation.

### Preserved limits and final state

No new PostgreSQL verification is claimed. The stopped disposable R0 container, retained volume and original evidence were not accessed or changed. Foundation/Vehicle concurrent manager independence, lock-held final authorization, integrated revocation races around L, request-bound capability lifecycle, workflow replay/cancellation, timeout/deadlock behavior and HTTP security remain **NOT TESTED**. Prior narrow completed-SELECT/next-SELECT R0 evidence remains valid within its recorded limits.

No staging, commit or push. Eight local changed/untracked files remain: the original seven R0 governance/evidence files plus the UOW test. The index is empty, HEAD unchanged, protected hashes match. Stop for independent Technical Advisor review; the two-defect repair is PARTIALLY COMPLETE, not green.

## R0-R1 final retry: independently confirmed DAL key (2026-10-19)

The Technical Advisor corrected the prior naming instruction and authorized the exact one-line replacement **da_vehicleService → daVehicleService** in vehicle-uow.unit.spec.ts. No other source change was made in this final retry. The earlier repaired context-integrity assertions remain unchanged. The original R0 result **66 PASSED / 2 FAILED / EXIT 1** and intermediate targeted result **1 PASSED / 1 FAILED / EXIT 1** remain historical evidence above; neither is replaced by the later passing runs.

Initial verification: D:/DogruAdres-af1a, feature/af-1-foundation-audit-outbox, HEAD d5392c7f92ce61c1bd7c3237d3f8c5d9360b525b; eight expected local changes, empty index. The six other R0 governance documents were hashed before editing and preserved byte-for-byte. The existing report was copied for append-only comparison.

Both commands ran from D:/DogruAdres-af1a/packages/api with the same installed runner and environment as the preceding R0 unit execution:

~~~powershell
$env:TEST_TYPE='unit'
$env:NODE_ENV='test'
$env:NODE_OPTIONS='--experimental-vm-modules'
$env:SWC_NATIVE_BINDING_CACHE='0'
$jestPath = node -p "require.resolve('jest/bin/jest')"

node $jestPath --runInBand --no-cache --silent=false --runTestsByPath src/workflows/dogruadres-vehicle/__tests__/vehicle-uow.unit.spec.ts --testNamePattern 'permits only expected forwarding writes on the sealed root|passes the same transaction to an actual generated Vehicle list method' 2>&1 | Tee-Object -FilePath <TASK_TEMP>/dogruadres-r0-r1-final-jcSDzV\targeted.log
# Actual exit: 0. One suite passed; two selected tests passed.
# Thirteen tests were excluded by the requested name filter, not skipped in source.

node $jestPath --runInBand --no-cache --silent=false --runTestsByPath src/modules/dogruadres-access/__tests__/query-registration.unit.spec.ts src/modules/dogruadres-access/__tests__/authorization-projection.unit.spec.ts src/workflows/dogruadres-vehicle/__tests__/authorization.unit.spec.ts src/workflows/dogruadres-vehicle/__tests__/vehicle-uow.unit.spec.ts src/modules/dogruadres-vehicle/__tests__/service.unit.spec.ts src/modules/dogruadres-vehicle/__tests__/audit-envelope.unit.spec.ts 2>&1 | Tee-Object -FilePath <TASK_TEMP>/dogruadres-r0-r1-final-jcSDzV\six-suites.log
# Actual exit: 0. Six suites passed; 68 tests passed, zero failed or skipped.
~~~

**TEST EXECUTED AND PASSED:** both originally failing unit contracts are now resolved. The full six-suite run includes actual Medusa decorators/generated methods with mocked DAL where specified by the tests; it is not PostgreSQL rollback, live workflow or concurrency evidence. No new failure or unexpected framework behavior was observed. No assertion was weakened and no production adapter/service/model/framework/dependency was changed.

Whitespace validation passed. Four protected evidence SHA-256 values still match the baseline table above. Six other R0 governance documents remain unchanged; the previous report content is an exact prefix of this amended file. The final local inventory remains the original seven R0 governance/evidence files plus vehicle-uow.unit.spec.ts; HEAD unchanged and index empty. No staging, commit, push, merge or deployment.

No PostgreSQL, Docker, database migration or runtime integration probe was rerun. The existing disposable R0 environment and its evidence were not accessed or altered. Concurrent Foundation/Vehicle manager independence, lock-held final authorization, integrated revocation races around L, request-bound capability lifecycle, workflow replay/cancellation, timeout/deadlock behavior and HTTP security remain **NOT TESTED**. Previously recorded narrow R0 runtime evidence retains only its original scope. Stop for independent Technical Advisor review before publication; final Vehicle authorization, CRUD and workflow integration remain disabled.

## Review-only publication confidentiality and provenance note

Personal Windows profile prefixes in evidence locations and log-output arguments above are replaced with <TASK_TEMP>. These are explicit path redactions, not claims that the placeholder was used literally. Test executable paths, flags, source paths, execution chronology, counts, exit codes and technical target identifiers are unchanged. Private credentials, connection.private.json and raw logs are not part of this publication. No test or PostgreSQL probe was rerun for publication; the final executed unit result remains six suites / 68 tests / zero failures / exit 0.

The other feature branch was checked read-only at publication time: origin/feature/vehicle-management-mvp had live HEAD fa2e284dd527a838a7cec896afca21103b9f2dd3. Its [ADR directory](https://github.com/DenizOner/DogruAdres/tree/fa2e284dd527a838a7cec896afca21103b9f2dd3/docs/dogruadres/adr) contains ADR-0004, ADR-0005 and ADR-0006. The local remote-tracking ref was older; no fetch, checkout or ref update was performed. This confirms the historical records reside on the other feature branch, without importing them or inventing approval provenance. The active publication branch baseline remains d5392c7f92ce61c1bd7c3237d3f8c5d9360b525b.
