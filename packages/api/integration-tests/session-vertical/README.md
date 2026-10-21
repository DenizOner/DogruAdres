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

## Public browser boundary and genuine actor contexts (2026-10-21)

Continuation authority: #217/6302924586; #147/6302939622. Initial HEAD:
e9d6db80f18e992671fd062f9e55c164831c0c85, same branch and draft PR #227.

`node scripts/personal-frontdoor.mjs` binds only 127.0.0.1:19101. Both child
processes use DOGRUADRES_PUBLIC_ORIGIN=http://127.0.0.1:19101 and
DOGRUADRES_PRIVATE_API=http://127.0.0.1:19100. The explicit method/path relay
never exposes native actor/actorless login or refresh, never rewrites auth bodies,
and forwards Authorization only for purpose-bound password update or the exact
Basic machine read. Unknown paths fail closed. Public Store catalog GET classes,
anonymous verification and supported reset/update retain native validation.
Checkout, payment hooks, OAuth callbacks, full native dashboards and broader
machine workflows are not exposed here; their supported public contracts remain
open. This task-only topology is not production network isolation: local clients
can still reach the private loopback API. TLS/firewall/private-network acceptance
is NOT TESTED, and this fixed-loopback launcher is not a production deployment.

Migration20261021231000 adds Foundation-owned verified actor bindings and
encrypted/expiring server credential ledgers. Explicit identity ownership,
canonical mapping, live session/epoch and non-revoked binding are mandatory.
Email equality grants nothing. Only server adapters retrieve AuthIdentity and
sign 900-second native credentials; strong-auth age is never manufactured.
Fresh Seller-module membership/member/status reads supplement native Mercur
seller middleware. Medusa still verifies Customer actor/signature. No manager
crosses module ownership. Cross-module commit-time revocation fencing is not
claimed. Production linking/enrollment/recovery proof UX remains unimplemented;
the explicit synthetic fixture helper is not that production authority.

The actual personal UI now supports provisioning, scoped membership revocation,
Seller and Customer contexts. Organization selection is page-URL scoped, not a
shared session selector. Provisioning prevents repeat submission after success
or ambiguous failure. Revocation rechecks and clears obsolete Organization detail.
Existing protected-Owner checks remain. Newly created membership-change audits
receive one transactional security-outbox pointer; old records are not rewritten.

Executed from packages/api with private process-local environment, exits 0:

```powershell
bun run medusa db:migrate --skip-links --skip-search --skip-scripts --all-or-nothing
bun run medusa exec ./integration-tests/session-vertical/contexts-fixture.ts
bun run medusa exec ./integration-tests/session-vertical/unbound-fixture.ts
bun run medusa exec ./integration-tests/session-vertical/recovery-fixture.ts
bun run dev -- --host 127.0.0.1 --port 19100
node scripts/personal-frontdoor.mjs
bun test src/modules/dogruadres-access/__tests__/security.unit.spec.ts src/utils/__tests__/organization-authorization.unit.spec.ts src/utils/__tests__/production-secrets.unit.test.ts src/modules/dogruadres-access/__tests__/session-policy.unit.spec.ts src/api/dogruadres/__tests__/session-policy-contract.unit.spec.ts
# TEST_TYPE=unit for this Jest command:
bun run jest --runInBand --forceExit --runTestsByPath src/modules/dogruadres-access/__tests__/identity-session.unit.spec.ts src/modules/dogruadres-access/__tests__/actor-delegation.unit.spec.ts src/api/personal/__tests__/ingress.unit.spec.ts
node --test integration-tests/session-vertical/frontdoor.unit.test.mjs
bun run tsc --noEmit --pretty false
bun run build
node --test integration-tests/session-vertical/http-security.test.mjs
node --test integration-tests/session-vertical/contexts-http.test.mjs
node --test integration-tests/session-vertical/frontdoor-http.test.mjs
```

Final units: Bun 124/5 files (includes six production-secret regressions), Jest
63/3 suites, Node front-door 2. HTTP/PostgreSQL: existing 20, contexts 10 including
aggregate, public-support 3. Native validator unit accepts iat+899 and rejects
iat+900 for delegated Member credentials. Backend build passed, explicitly
skipping absent prebuilt native Admin/Vendor panels. The tested UI is /personal.
CI covers unit/type/build, not local HTTP/PostgreSQL/Chrome acceptance.

HTTP harnesses require M0_TEST_ORIGIN=http://127.0.0.1:19100, private
M0_TEST_EVIDENCE; existing suite also M0_REQUEST_ORIGIN=http://127.0.0.1:19101.
Each recovery suite needs a fresh M0_RESET_FIXTURE filename from the supported
workflow. Never display its contents. Fixture helpers refuse overwriting private
manifests. The final M0_TEST_BINDING_REVOCATION=1 run permanently revoked only
its synthetic Customer binding. Preserve this terminal state; do not restore it
or rerun positive Customer assertions against it. A new explicit ownership proof
and fresh binding/actor are required for another lifecycle run.

Real Chrome: invalid login, genuine password/TOTP, Person, Member/Seller A allow,
Seller B deny, Customer allow, two Organization tabs with refresh, revoked and
foreign context checks, provisioning absent-grant/duplicate-Owner denial and one
valid submission. PostgreSQL verified that submission as exactly 1 Organization,
2 distinct active protected Owners, 3 correctly attributed audits and 3 linked
outbox records. UI membership revocation persisted with audit/outbox; an already
open self-revoked ABC tab denied on refresh, while XYZ remained authorized.
An ordinary Person subsequently saw revoked XYZ denied and its ABC allowed.
Independently isolated two-Person browser sessions, suspended-context cases and
the complete B01-B21 matrix remain NOT TESTED/acceptance open. Logout/reopen and
public native login rejection were executed. Restricted browser storage evaluation
cannot inspect localStorage: do not claim that inspection passed. One full-page
screenshot timed out; viewport screenshots succeeded and remain outside Git.

Historical failures preserved: wrong-root tsc exposed unrelated workspace errors;
fixture orgs inferred never[] then received an explicit type; Jest each-table
empty row caused 10 pass/1 fail, fixed as named row data. Context HTTP initially
expected 403 whereas native Mercur NOT_ALLOWED returns 400 (6 pass/2 fail incl.
aggregate), then 8/8 and final expanded 10/10. The existing unbound-user test
reused an actor now explicitly bound in this scope (18 pass/2 fail incl.
aggregate); a fresh genuine unbound actor preserved the 401/no-Person assertion,
then 20/20 passed. Public-support first run raced dev-watch restart (0 pass/3
fail, 503), no fixture writes; verified readiness retry passed 3/3. Browser 503
outcomes during watcher restarts were not counted as business acceptance.
No security expectation was relaxed to permit access.

D3/D4/D5 and delegated replay results are bounded isolated evidence. Distributed
revocation, full Seller writer/cache races, legal Buyer checkout, production
network/TLS and full browser coverage remain open. M0 is NOT COMPLETE. Rollback:
stop front door/API, preserve binding/session/credential terminal history; no
destructive down migration and no operational return to known native bypasses.

## 2026-10-21 checkpoint: verified dual ownership and portable private ingress

Authorization: Issue #217 comments 6290880062 / 6309141445; PR #227
comment 6309190932; B02 crosswalk Issue #185 comment 6309180365.
Starting feature HEAD: 2f493aa99fb0d53a526240404b25fbcca226cae7.
Main/base remains d1ac132f41a15d2894d3bebae982f2eb2fc15ca3.

Production implementation: current primary session and recent real TOTP precede
independent native emailpass proof, exact AuthIdentity actor metadata/module
existence and secondary native MFA when required. No email linking, Person
creation/merge or production native Auth metadata write. A five-minute hashed
pending intent is session/Person/proof-version bound. The supported Auth DTO has
no updated_at: a purpose-separated COOKIE_SECRET HMAC fingerprints server-only
provider state; provider metadata is never returned or persisted by linking.
Foundation session/Person and actor locks, mapping, binding, intent consumption,
canonical audit and durable security outbox share its transaction. Native Auth
proof and Foundation are independent modules: no distributed atomic proof is
claimed. Concurrent native identity changes after proof retrieval remain an
independent security-review concern.

Unlink protects sign-in bindings, retains immutable tombstones, and retires
related native credentials. Fresh dual proof may create a NEW same-owner binding;
no revoked binding is reopened and a different Person cannot transfer ownership.
Migrations 20261021233000/233100 were applied only to task m0ssi_a7f1,
PostgreSQL16.15 container dogruadres-m0ssi-20261020-a7f1-pg,
127.0.0.1:55631. The active-actor unique index is installed before removing the
old all-history binding uniqueness; canonical mapping remains the owner lock.
No historical data deleted. Down migrations deliberately refuse deletion.

Portable shared configuration validates private loopback origin, distinct public
origin, listener and direct PEM TLS. Production requires explicit HTTPS/listener
configuration; secrets/certificates are not committed. Node24.21.0 native type
stripping was used for the launchers; Node20 compatibility is NOT TESTED. Real
private19110/public19101 and private19100/publicHTTPS19102 ran successfully.
Local listener/host-network checks are not production network isolation or TLS
termination acceptance. TLS tests pin only a task certificate, with normal host
verification. Chrome rejected its untrusted issuer; no trust/security bypass.

Actual final commands (packages/api; task-only secrets supplied privately):
- TEST_TYPE=unit bun run jest --runInBand --forceExit --runTestsByPath
  src/modules/dogruadres-access/__tests__/identity-session.unit.spec.ts
  src/modules/dogruadres-access/__tests__/actor-delegation.unit.spec.ts
  src/modules/dogruadres-access/__tests__/account-linking.unit.spec.ts
  src/utils/__tests__/ingress-config.unit.spec.ts
  src/api/personal/__tests__/ingress.unit.spec.ts: 78/78, 5 suites, exit0.
- bun test: security.unit, organization-authorization.unit,
  production-secrets.unit.test, session-policy.unit, session-policy-contract.unit:
  124/124 in 5 files (including 6 production-secret tests), exit0.
- node --test integration-tests/session-vertical/frontdoor.unit.test.mjs:
  2/2, exit0.
- bun run tsc --noEmit: exit0. bun run build: exit0; native Admin/Vendor prebuilt
  dashboards absent and explicitly skipped. Actual tested UI is /personal.
- node --test integration-tests/session-vertical/linking-http.test.mjs:
  fresh finalc2 private fixture, HTTPS pinned task CA, 13/13, exit0.
- node --test integration-tests/session-vertical/terminal-expiry-http.test.mjs:
  1/1, exit0, terminal SQL status survives policy relaxation.
- node --test integration-tests/session-vertical/frontdoor-http.test.mjs:
  HTTPS public catalog/recovery/scoped machine, 3/3, exit0.
- node --test integration-tests/session-vertical/frontdoor-security-http.test.mjs:
  malformed target/Host/duplicate headers/body bounds and TLS distrust, 3/3, exit0.
- node --test integration-tests/session-vertical/http-security.test.mjs:
  existing D3/D4/D5 real PostgreSQL/HTTP, 20/20, exit0.
- git diff --check: exit0. No browser, database or production acceptance inferred
  from Jest/TypeScript/build/CI.

Real SQL/HTTP asserts two different Persons racing one unbound native Customer:
exactly one binding/mapping/audit/outbox wins. Supported native password update
invalidates a pending proof; incorrect MFA, other Person intent, replay, expired
intent, foreign Seller/Organization and protected-login unlink deny. Customer
unlink retires old credential; native replay and refresh401. No manufactured
Person; no binding audit lacks its durable outbox.

Chrome sequentially executed two distinct synthetic Persons: primary real TOTP,
wrong secondary password, separate secondary TOTP, Member/Seller and Customer
link/access, foreign Organization/Seller denial, wrong-Person transfer denial,
Customer unlink/denial, reload, logout/reopen. UI confirmation-button state defect
was fixed and retested. SQL confirmed browser binding/audit/outbox persistence.
This is NOT simultaneous independent-context acceptance. Task-owned Chrome A/B
profiles launched without personal profiles or insecure flags, but Computer Use
stopped because it could not verify browser URL confidently enough to enforce
policy. No further UI action was attempted; only those task process trees were
stopped. Two-profile browser evidence is ENVIRONMENT BLOCKED. HTTPS Chrome is
also blocked by certificate trust. Browser localStorage inspection NOT TESTED.
Screenshot and restricted raw/private manifests remain outside Git.

Failures preserved separately: initial route literal-newline syntax failure
caused 0/12 HTTP failures (no linking writes); corrected source then passed.
An initial HTTPS run had 9 pass/3 fail including aggregate: TLS correctly rejected
Host mismatch before HTTP, then test preserved TLS servername while testing Host;
Customer replay first lacked publishable key (400), then genuine key reached the
expected401 gate. Unsupported DTO timestamp assumption failed TypeScript and was
replaced by verified supported-state fingerprint. New GET /personal/links initially
returned403 but rolled terminal expiry back (1 failed SQL assertion); nullable
fail-closed service result now commits terminal expiry, then 1/1 passed. A unit
nullable-fixture type error was corrected, final TypeScript0. No assertion was
weakened to allow unauthorized access. Logs preserve prior failures and retries.

CI covers unit/type/build only. Independent review, two-profile browser journey,
production TLS/network isolation, distributed revocation, native Auth/Foundation
cross-module races and full M0 matrix remain open. M0 is NOT COMPLETE. Rollback:
stop front door/API and gate the feature; preserve all binding/session/credential
terminal history and database volume. Do not run destructive down migrations,
restore revoked fixtures or fall back to a known native Bearer bypass.
