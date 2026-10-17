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

The test talks to a running native API at `http://127.0.0.1:19040` and the
existing isolated G1 PostgreSQL/Redis services. It will not start services or
create containers. Before the test can execute, the developer must establish
the documented G1 test-only environment and obtain two independently
authenticated Medusa user bearer tokens through the normal authentication
flow. Pass the bearer values only through the process environment variables
`DOGRUADRES_TEST_OWNER_BEARER` and `DOGRUADRES_TEST_INVITEE_BEARER`; never
write them to a file, shell history, test report, or log. `DATABASE_URL` and
`REDIS_URL` must point to the verified G1 endpoints, and the test validates
the exact authorized database and loopback API endpoint before making requests.

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
server-owned audit module attribution. Missing test-only bearer credentials
cause an explicit skip; a skip is not a passing HTTP result.

Invitation acceptance also requires one unambiguous Medusa
`projectConfig.http.authVerificationsPerActor` entry for the authenticated
actor/provider with `entity_type: "email"`. The current application does not
configure that entry. Acceptance intentionally fails closed until that
configuration and its effect on the normal login flow are reviewed; inserting
a synthetic verification record alone does not bypass this prerequisite.
