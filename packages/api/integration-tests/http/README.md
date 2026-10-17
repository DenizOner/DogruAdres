# Integration Tests

The `medusa-test-utils` package provides utility functions to create integration tests for your API routes and workflows.

For example:

```ts
import { medusaIntegrationTestRunner } from "medusa-test-utils"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Custom endpoints", () => {
      describe("GET /store/custom", () => {
        it("returns correct message", async () => {
          const response = await api.get(`/store/custom`)

          expect(response.status).toEqual(200)
          expect(response.data).toHaveProperty("message")
          expect(response.data.message).toEqual("Hello, World!")
        })
      })
    })
  }
})
```

Learn more in [this documentation](https://docs.medusajs.com/learn/debugging-and-testing/testing-tools/integration-tests).

## DogruAdres native HTTP foundation regressions

Run the focused suite from `packages/api` with Node's built-in test runner:

```powershell
node --test integration-tests/http/dogruadres-foundation.native.test.mjs
```

Start the existing production build separately from `packages/api/.medusa/server`
with the same isolated `DATABASE_URL`, `REDIS_URL`, `NODE_ENV=test` and
`MEDUSA_WORKER_MODE=server` process environment:

```powershell
node ../../node_modules/@medusajs/cli/cli.js start --host 127.0.0.1 --port 19040
```

Set fresh test-only `JWT_SECRET`, `COOKIE_SECRET`, and
`DOGRUADRES_INVITATION_SECRET` in that process (see `.env.template` for secure
generation). Never reuse production credentials. Stop only that API after
testing; preserve the existing G1 containers and test evidence. No migration,
seed, additional container, or external provider is required by this suite.

The test talks to a running native API at `http://127.0.0.1:19040` and the
existing isolated G1 PostgreSQL/Redis services. It will not start services or
create containers. Set `NODE_ENV=test`, `DATABASE_URL` to the authorized
`postgres://postgres@127.0.0.1:55437/g10k_20261017125120_7d460ec3`, and
`REDIS_URL=redis://127.0.0.1:56379` in the test process. Missing prerequisites
fail the suite; they never produce a skipped success. Container names, exact
loopback bindings, task labels, isolated volume mounts and the protected-volume
exclusion are checked before any database or API request.

The suite generates two synthetic credentials in process memory, provisions
users with the supported Medusa `exec` fixture at
`integration-tests/fixtures/provision-native-users.ts`, then logs each in through
`POST /auth/user/emailpass`. The fixture uses the same workflow/auth-service
sequence as the Medusa 2.21.2 `user` command. Passwords are passed only through
the child-process environment; bearer tokens come from real login responses
and remain in memory. No production credentials, forged tokens, or external
email delivery are used. Synthetic users remain in the disposable database.

The suite provisions synthetic Organizations and invitations through the real
HTTP routes. It inserts one synthetic, correctly typed verified-email record
for the authenticated invitee directly into the isolated test database so
invitation acceptance can be tested without an external email provider. It
removes that verification fixture in `finally`; synthetic Organizations,
memberships, invitations, and audit evidence are retained in the disposable
G1 database for inspection. Invitation token values remain in process memory
only and are not written to output.

Coverage includes cross-Organization denial, membership revocation and
ordinary reactivation/role-change denial, fresh invitation reactivation,
invitation recipient/type/verification/expiry/revocation/replay checks,
concurrent one-time acceptance, concurrent last-protected-Owner changes, and
server-owned audit module attribution. A skip is not a passing HTTP result.

Invitation acceptance checks an existing Medusa verification with
`entity_type: "email"`, non-null `verified_at`, matching auth identity and
provider entity. Soft-deleted records are excluded. This proof is independent
of `projectConfig.http.authVerificationsPerActor`, which controls global login
enforcement; this suite and repair do not change that global policy.
Normal emailpass tokens may omit an email claim: the route resolves the email
from the authenticated actor's server-side record. If a signed email claim is
present it must also match; a client-provided email is never evidence.

The concurrency tests send real simultaneous HTTP requests and verify the
persisted invitation/membership postconditions. Foundation advisory locks must
use `EntityManager.execute`, which forwards the active transaction context;
raw `getConnection().execute` without that context does not protect the mutation.

The different-invitation race uses two pending invitations with different roles
for the same revoked Person/Organization membership. Exactly one acceptance must
succeed; persisted membership role, invitation states and the single acceptance
audit must agree with the observed winner. Ordinary membership changes share the
transaction-scoped membership lock; no schema migration is needed.
