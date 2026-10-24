# Issue 218: isolated authentication compatibility evidence

This is a **task-specific PoC snapshot**, not production authentication, a general
fixture seed, a CI suite, or M0/browser acceptance. Source baseline:
`458ef171340949e81ef81b769c74753ee300859a`. Authorization: issue #218 comment
6289386793. No application route, upstream patch, new migration or dependency.

## Actual execution, 2026-10-20

Execution copies are preserved outside Git at
`D:\DogruAdres-auth-poc-218-evidence-20261020`. Passwords, provider credentials,
tokens, session cookies, database contents and raw logs are **not committed**.
Private directory ACL is restricted to the current user, SYSTEM and Administrators.

| Boundary | Actual command | Result |
| --- | --- | --- |
| Locked install | `bun install --frozen-lockfile` | exit 0, 1973 packages |
| CLI | `bun run medusa --help` | exit 0 |
| Empty database initialization | `bun run medusa db:migrate --execute-safe-links --execute-safe-search` | exit 0 |
| Synthetic fixtures | `bun run medusa exec <external>/fixtures.poc.cjs` | exit 0 |
| API | `bun run dev --host 127.0.0.1 --port 9018` from `packages/api` | HTTP `/health` 200 |
| Framework/application HTTP | `node <external>/http.poc.mjs` | 33 assertions passed, exit 0 |
| Test-only front door | `node <external>/frontdoor.poc.mjs` | 11 assertions passed, exit 0 |
| Read-only real PostgreSQL | `pwsh -File <external>/verify-postgres.poc.ps1` | 8 assertions passed, exit 0 |

The external PowerShell launcher supplied task-private environment variables;
never reconstruct a credential-bearing URL in a report. Fresh PostgreSQL 16.15
container `dogruadres-auth218-20261020-postgres`, volume
`dogruadres-auth218-20261020-postgres-data`, database `auth218_20261020`, published
only at `127.0.0.1:55618`. Image:
`sha256:621a761097839bdb50207afd6b87a72f38e2d718dd46c3d744828d8917c4f1e0`.
Runtime used local/fake Redis, local event bus and in-memory locking: no Redis
durability or distributed-session acceptance. API and test front door bind
loopback only (9018/9019). Services are stopped; database/volume/evidence retained.

Initial public schema had zero tables. Before HTTP: 4 People, 8 actor mappings,
2 Organizations, 3 memberships, 0 canonical audits. After HTTP: 5 People,
9 mappings, 4 Organizations, 5 memberships, 6 audits, 1 pending invitation.
Two concurrent first-use provisioning requests created two Organizations sharing
one newly mapped Person; duplicate actor keys: zero. Primary Person still has
three actor-type bindings. XYZ membership revoked; ABC membership active.
These trusted synthetic setup records do not prove normal Organization provisioning
acceptance. No Foundation outbox from PR #222 was added or tested.

## Limits and safe use

- Front-door test uses an immutable **synthetic binding allowlist**. One credential
  submission causes separate supported actor-specific provider login requests;
  it is not token exchange, token interchangeability or a production linking policy.
- Only explicitly granted staff fixtures have `user` actors. Ordinary Persons
  receive no automatic platform grant. Email equality does not link Persons.
- Each front-door resource access rechecks Foundation; Seller authorization then
  separately checks the actual Mercur membership. The existing Foundation reads
  are not a coherent Policy A authorization snapshot.
- Cookie logout invalidates that session. Previously issued bearer JWT remains
  valid: an observed limitation, **not** global logout/replay acceptance.
- Browser, real cross-tab UX, external-provider same-email linking, recovery,
  concurrent verified-account linking, Seller cache revocation, expiry, distributed
  sessions, checkout Organization attribution/payment and final coherent mutation
  authorization remain NOT TESTED or unimplemented. No M0 MODULE COMPLETE.
- Observed warnings: codegen timeout during CLI setup; unnamed upstream workflow
  `when`; local event bus. Migration/fixture exit codes were nevertheless 0.
- Do not blindly rerun the fixture or HTTP script: the preserved DB is no longer
  empty and the HTTP test deliberately revokes membership. No reset/drop/cleanup
  is authorized. A fresh run needs an approved resource manifest and empty DB.

The four retained sources contain the executed bodies. JS publication guards
were added afterward to reject execution inside Git; fixture additionally checks
the exact disposable DB target. Guards are source/syntax verified only, not a new
fixture/runtime test run. Execute only through reviewed external task copies;
do not place private JSON or logs in the repository. The SQL verifier is read-only.

SHA-256 of the **actually executed external copies**:

```text
fixtures.poc.cjs        7e79cd517d282e87bef7d57fe57dbc098710439ddfa87aa35b7e1edbb13f033f
http.poc.mjs            55f1708152d8cf043ba76725c512ac838c727e3aeeffc721783ba4d665c76a0b
frontdoor.poc.mjs       8068bcc0f1611d130281dbd004c5968fa55cccb214a9230e85fd6cd90143b7d1
verify-postgres.poc.ps1 261d7dec9408ded0a95378f4679875bbd2f4a1144ac9f015a98bf350d191cb2e
```

The API generated an 18-line `.mercur/routes.d.ts` delta. Its diff was preserved
externally, then only this task-generated change was restored after stopping
the API; no preexisting user change was discarded. See issue #218 for the complete
Turkish findings and independent-review gate. This draft is not architecture acceptance.
