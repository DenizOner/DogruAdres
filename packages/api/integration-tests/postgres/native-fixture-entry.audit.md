# R0-D native entry audit (Medusa 2.21.2 / Mercur 2.3.7)

Run `node -r ts-node/register src/scripts/task-mfa-native-entry.ts` from packages/api.
Do not use `medusa exec`: its application loader opens pools and runs defaults first.

The direct entry imports definitions only. The existing task controller validates the
source-pinned PO approval, signed exact-SHA manifest, Windows SID/ACL, Docker/PG/Redis
identity and zero other consumers before claiming the durable nonce and checkpoint.
Clean-state SQL runs before `initializeFixtureModules`. No application config/plugin,
subscriber, jobs, migrations, onApplicationStart or defaults loader is called.

The installed `MedusaAppLoader.load()` API is used with every default module explicitly
disabled except local event bus/cache and native Auth/User/Foundation. Auth's only
provider loader registers services; User and Foundation declare no custom loaders.
The shared MikroORM connection loader reuses the injected Knex connection; its ORM
configuration has connect=false and ensureDatabase=false. No migration API is invoked.

Defense in depth: pool afterCreate and the database URL force initialization sessions
read-only. Whole-public-schema row-content digests must match before and after load.
Untracked connections are rejected. Only after these checks are actual tracked pool
connections made writable. Future connections still run the same tracked afterCreate.
The controller's original exclusive check remains unchanged before pool initialization.
Every native write then checks the exact source/PO manifest and rejects any DB backend
not proved to be a live connection object in this pool with matching server PID and
backend_start. application_name or a configured PID never confers ownership.

The existing disposable CLI CI database is reused after its existing migration step.
The native test checks unchanged startup digest, foreign-session rejection, runs the
same extracted fixture body (native register/User workflow/Person/mapping/binding),
and reads two unique relationships from a separate connection. No new CI DB is added.
Protected R0-B must not execute until that CI check passes on the final source SHA.

Unknown native effects remain INDETERMINATE; no automatic retry/cleanup is added.