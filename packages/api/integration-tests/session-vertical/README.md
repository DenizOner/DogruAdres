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
verification request/identity-bearing confirmation require the same live ledger
binding. Anonymous code confirmation and single-use, purpose-bound password reset
remain native flows. Refreshed native JWTs are not automatically trusted by the
ledger. Other protected native operations stay
closed pending scoped adapters; this is not full Admin/Vendor compatibility.

Public emailpass/provider/recovery, anonymous verification confirmation and public Store catalog paths
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
$env:M0_RESET_FIXTURE='<fresh workflow-issued private recovery fixture filename>'
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

## PR #227 independent-review repairs — 2026-10-21

Starting review HEAD: e9df2ad2eab1b9e94544a4ef8316fa8a464580f1.
Review 5591971865 / Issue #217 comment 6301917146; integrated repair authority
remains 6299717461. Earlier results above are historical and are not overwritten.

Before repair, a genuine previously session-bound credential after personal
logout reached POST /auth/verification/request (201, a new verification row).
The same credential reached confirm's native provider (400 invalid code, not
ingress denial). This reproduced the P0 gap, not successful D4 enforcement.

The method/path boundary now defaults to denial for every unknown namespace,
including unknown plugin paths, /hooks and /cloud writers. Known personal
handlers are exact paths. Public emailpass login/callback, registration/recovery,
catalog reads, cloud capability metadata GET and the exact native payment
callback remain enumerated. /auth/verification/request and credential-bearing
confirm require a live server-bound ledger entry; truly anonymous single-use
code confirmation remains available. Medusa's password-update middleware still
verifies signature, purpose=reset and atomically consumes its jti; a normal or
revoked session Bearer cannot become a reset credential. Static file serving is
the framework Express loader's separate /static middleware, not a general API
namespace exception. Unsupported protected plugin operations remain closed;
this is not acceptance of all Admin/Vendor/plugin functionality.

New migration Migration20261021230000 adds expiry/retirement metadata and one
active credential per session. Old ledger entries are retained but retired
because their exact expiry was not attested. A currently eligible personal
session renews through GET /personal/session (also called by the UI on reload).
The existing Auth service supplies current actor metadata; Foundation locks the
session/Person epoch, rechecks binding and D3 policy, then keeps the credential
or rotates within its last minute. JWT lifetime stays 900 seconds. Renewal never
updates the strong-auth timestamp. Retired or expired hashes fail the ledger;
native framework signature/actor/expiry validation remains in force. No token
is returned from the personal API. This is server-only on-demand renewal, not a
background timer or a generic proxy.

All three newly grant-authorized Organization audit events now carry
platform_staff plus grant ID, task and resource. The persistent test checks
actor Person/type/ID, Organization, Owner target/Person, action and one-to-one
outbox correspondence. Historical audits are neither rewritten nor deleted.

Repair validation: 169 unit tests / 6 suites; 6 production-secret regressions;
TypeScript and Medusa backend build exit 0. HTTP/PostgreSQL: 20/20, exit 0
(19 child cases plus their aggregate). Includes genuine anonymous verification
confirmation and replay denial, supported workflow-issued single-use reset,
post-logout verification/MFA denial with unchanged verification-row count,
renewal with concurrent requests, retired-token denial and all-device delegation
revocation. Unit tests use the real installed JWT validator with a test-only
clock: accepts at iat+899, rejects at iat+900. HTTP expires only a synthetic
ledger row; it does not pretend that 15 wall-clock minutes elapsed.

Chrome regression executed through the supported browser tool: invalid login,
password+TOTP, canonical Person, ABC access, absent-staff-grant denial, reload,
server-only credential renewal, logout and protected reopen. Database read-back
after the browser renewal showed exactly one active and one retired credential
for the uniquely scoped browser session. This is engineering verification;
independent Work/Technical Advisor acceptance and the full M0 matrix remain open.

Preserved repair failures: first expanded HTTP run had 18 passes / 2 failures
(one child failure plus aggregate) because a test incorrectly expected the
verification code in the HTTP response; native workflow intentionally redacts
it. A supported Auth-module fixture now retains its code only in the private
evidence directory. A later readiness race executed no business assertions
(ECONNREFUSED); rerun after the socket was ready passed 20/20. One temporary
fixture TypeScript error (optional identity ID) was fixed with an explicit
presence check. No assertion was relaxed to accept a security bypass.

Final source review also closed a renewal race: after acquiring the session and
epoch locks, native ingress re-reads credential retirement/expiry so a pre-lock
ledger observation cannot authorize a credential retired while waiting. The
169-test unit set includes that ordering case. Its initial test-mock return type
needed correction before the final TypeScript pass; no production policy changed.

Use recovery-fixture.ts via the supported `medusa exec` only against the checked
task database to create a fresh one-use reset/verification fixture before each
HTTP suite. Each fixture file uses a unique name; existing private evidence and
used tokens remain preserved. Its successful filename is the nonsecret value
of M0_RESET_FIXTURE; never print its contents. Previous canonical data, audit
history, volumes and protected worktrees remain untouched.
