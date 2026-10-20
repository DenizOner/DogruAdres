# M0 personal identity vertical slice — review candidate

Authority: Issue #217 comment 6299717461; acceptance contract 6299347217.
Base: d1ac132f41a15d2894d3bebae982f2eb2fc15ca3. No production rollout or M0 completion.

## Runtime contract

The project-owned `/personal` HTML shell is served by a standard Medusa custom
route. It uses same-origin fetch and memory-only CSRF state, never browser actor
JWTs. `DOGRUADRES_IDENTITY_ENABLED=true` enables the personal surface. An exact
`DOGRUADRES_PUBLIC_ORIGIN`, strong COOKIE_SECRET/JWT_SECRET and independent
DOGRUADRES_MFA_ENCRYPTION_KEY are required. HTTPS/Secure cookies are required in
production; development permits only an explicitly configured loopback origin.
Turning off the UI flag does **not** reopen native ingress.

Authentication uses the installed Auth module's `authenticate`,
`validateAuthIdentity` and native TOTP challenge APIs. An explicit preverified
AuthIdentity→Person→actor binding is required; no production registration,
email-based linking, recovery or staff bootstrap endpoint is introduced.
Sensitive platform work requires a real completed MFA challenge and a fresh
explicit task/resource grant. Foundation reads use one final SELECT containing
session, epoch, binding, actor mapping, Person, Organization/membership or grant.
This is Policy A snapshot ordering, not commit-time fencing.

All security tables are Foundation-owned internal SQL tables, intentionally not
public Query entities. Standard module transaction decorators supply only that
module's manager. Medusa signing utilities issue server-only actor credentials
after provider/MFA/actor ownership verification; AES-GCM ciphertext and a
session-binding hash ledger persist them. Native signature/actor middleware is
retained. The initial delegated personal native operation is GET /admin/users/me;
refresh requires the same live ledger binding. Refreshed native JWTs are not
automatically trusted by the ledger. Other protected native operations stay
closed pending scoped adapters; this is not full Admin/Vendor compatibility.

Public emailpass/provider/verification/recovery and public Store catalog paths
retain native validation. Basic access is separate: the initial allowed machine
operation GET /admin/api-keys requires a current persisted machine grant as well
as a genuine framework key. No generic privileged proxy exists.

The additive migrations retain terminal session state, policy, epoch, grant and
credential data. Policy defaults/limits reuse the merged P1/P2 core. No policy
Admin settings UI is included. Security outbox entries are durable unique audit
pointers, not PR #222's unmerged general outbox or an implemented delivery relay.

## Actual isolated evidence (2026-10-20)

Worktree: D:/DogruAdres-m0-session-vertical-20261020. Task resource manifest and
private logs are outside Git in the task-owned evidence directory. New PG16.15
container/volume only; host binding 127.0.0.1:55631, database m0ssi_a7f1, API
127.0.0.1:19100. Existing D9/#218/M1/G1/R0 resources were not reused.

Locked installation, committed migrations + new additive migrations and safe
link synchronization exited 0 on the independently verified initially empty DB.
Synthetic users were created using `medusa user`, MFA through `startAuthMfa` and
`verifyAuthMfa`, machine key through `createApiKeysWorkflow`. Test-only explicit
Foundation bindings/memberships/grants were prepared in this task DB. Secrets
and TOTP seeds are retained privately, never in Git. Fixture IDs in this directory
belong only to that preserved task DB; they are not a production identity allowlist.

Final focused unit evidence: 147 tests in six suites, plus six production-secret
regressions. Real Node HTTP/PostgreSQL suite: 17 passing tests, including real
MFA, cross-Organization concurrent requests, staff allow/deny/revocation,
provisioning rollback, three canonical audit events + three outbox pointers,
native credential 200 before logout and 401 afterward, refresh denial, machine
scope, selective 8h→6h expiry, no resurrection and all-device logout.

Real CUA/Chrome UI interactions executed: invalid login, password + TOTP login,
canonical Person, XYZ/ABC selection, two-tab separation, foreign Organization
denial, staff allow then committed revoke/deny, membership revoke/deny while ABC
continues, reload across API restarts, logout and second-tab reopen denial.
Browser storage inspection through the restricted read-only evaluator failed;
do not represent that inspection as passed. Source and cookie/HTTP evidence are
separate from browser storage observation. Screenshots stay outside Git.

Historical failures remain in the task evidence: an early run raced the dev
watcher's restart; a contaminated synthetic grant caused a later negative test
failure; a real ORM-flush defect produced three audits with zero outbox pointers.
The latter failed Organization was preserved. The code now flushes audit writes
inside the same Foundation transaction before inserting outbox pointers; a new
operation passed 3/3. No old data was silently repaired or deleted.

## Commands and repeatability boundaries

From packages/api after loading the private task environment:

```powershell
bun run tsc --noEmit --pretty false
$env:TEST_TYPE='unit'
bun run jest --runInBand --forceExit --runTestsByPath src/modules/dogruadres-access/__tests__/identity-session.unit.spec.ts src/api/personal/__tests__/ingress.unit.spec.ts src/modules/dogruadres-access/__tests__/session-policy.unit.spec.ts src/api/dogruadres/__tests__/session-policy-contract.unit.spec.ts src/modules/dogruadres-access/__tests__/security.unit.spec.ts src/utils/__tests__/organization-authorization.unit.spec.ts
bun run jest --runInBand --forceExit --testMatch '**/production-secrets.unit.test.ts' --runTestsByPath src/utils/__tests__/production-secrets.unit.test.ts
bun run dev -- --host 127.0.0.1 --port 19100
# In another controlled process, only after actual readiness:
$env:M0_TEST_ORIGIN='http://127.0.0.1:19100'
$env:M0_TEST_EVIDENCE='<task-owned private evidence directory>'
$env:M0_XYZ_ID='<fresh explicitly authorized synthetic Organization>'
node --test integration-tests/session-vertical/http-security.test.mjs
```

The HTTP suite intentionally revokes its test grants/membership and sessions.
Do not blindly rerun it against preserved fixtures. It checks identity/readiness
and fresh-fixture prerequisites before mutations. Never reset a DB or reactivate
a revoked membership merely to make a repeat pass; retain failing evidence.
The password rate limit is persisted (10/subject/minute, 60/address/minute);
wait for the normal next window rather than clearing counters or weakening it.

## Remaining release gates and rollback

NOT TESTED: multi-instance/replica behavior, all native aliases and workload
scopes, full Vendor/Seller writer/cache fencing, provider change/recovery session
invalidation, distributed challenge storage, complete browser matrix #147,
timeouts/deadlocks and outbox relay delivery. No production identity/staff
bootstrap/recovery procedure or policy Admin configuration is approved by this
implementation. No full D7/D9 or M0 acceptance claim.

Rollback safely means stop the task-owned application and retain all security
tables/epochs/grants/fixtures. Disabling the UI does not disable ingress guards.
Do not drop these tables or revert to the known replayable native boundary as an
operational workaround. Migration down methods deliberately reject destructive
rollback; data-retention/production rollback needs separate review. No merge,
deployment or cleanup is performed by this checkpoint.
