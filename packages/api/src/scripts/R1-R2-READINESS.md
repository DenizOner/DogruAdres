# R1/R2 readiness delta — 23 October 2026

R0-D is completed and must not run again. Its manifest/nonce and source pin
ONLY authorize its two-fixture scope. No R1 approval is inherited.

Current #238/6365392214 requires independently assessed R1 signer scope,
a new signed intent/nonce, actual four runtime flags, exact owner resources,
row-lock/CAS single-writer transition, external signed receipt, separate
commit-bound readback and INDETERMINATE/no-retry retention. The latest task forbids
another key/reviewer/environment. The original per-task-key clause and reuse of
the existing operator for this NEW scope need canonical scope evaluation, not
agent-generated registry authority or a new approval mechanism.

`r1-readiness.ts` is READ ONLY facts and proposal validation. It never authorizes
SQL. `NativePostgresReadbackAdapter` remains closed by default. Its optional binding
requires the EXISTING externally scoped TrustedOperatorRegistry, signed manifest,
pre-intent and signed transaction receipt; it never creates a registry/pin itself.
The commissioned path reads actual PG cluster + xid8 committed status + singleton
xmin/version + genuine relationships from a NEW READ ONLY connection. State digest
excludes observation timestamp so a fresh independent read can verify the same
stable snapshot. Timestamp remains observation metadata; signed outcome has its
own verifiedAt. This source path needs R1 scope/source review before commissioning.
No production R1 activation executor or self-approved registry was added.

A proposed additional CI transition using an ephemeral test signer was rejected by
automatic security review. That command DID NOT RUN; no such transition test was
added or executed through another path. The positive live R1 commit/readback path
is NOT VERIFIED. Existing baseline CI tests retain their own established scope.

Safe HTTP startup reuses the proven read-only native module initialization then
`createPersonalHttpApp`, which calls only framework expressLoader + ApiLoader.
No application/default workflow/plugin/job/subscriber startup. It returns an
UNBOUND app; binding the real endpoint requires verified R1 and four consistent
actual process flags. Existing disposable CI checks HTTP startup/denials without
changing its inactive latch and proves unchanged full DB content digest.

Personal MFA management uses exact current Person/native identity, CSRF, a recent
full MFA session, existing authentication rate limits, session/epoch then platform
lock order. Native Auth and Foundation are NOT a shared transaction. Any uncertain
native effect or later audit/outbox failure is INDETERMINATE, no retry/compensation.
Verified disable denies required mode; optional self-disable turns preference off;
disabled mode preserves preference. Every successful disable revokes all sessions.
Recovery codes/seeds are shown only in masked/memory-only UI, never logs/storage.

Browser acceptance belongs to the designated independent ChatGPT Work tester.
No active session/channel exists. #147/#230/PR227 are the canonical handoff.
Ready URL remains https://127.0.0.1:19102/personal, with existing task-only A/B
Chrome profiles and trusted non-CA certificate. No personal Chrome/profile/trust
change. Until actual R1/runtime prerequisites pass, G1-G4 and all relevant
browser journeys are NOT TESTED / ENVIRONMENT BLOCKED, regardless of HTTP/CI.
## R1 transaction integration after independent scope review #238/6366377036

The existing operator key may be reused for a FRESH R1 manifest/intent. The old
1.0.0 cryptographic candidate is not executable: the established runtime protocol
requires manifestVersion 1.1.0, exact four process flag values and flat readiness
facts. Do not extend or execute the old candidate.

`r1-activation.ts` now coordinates signed-intent validation, actual flags, exclusive
singleton FOR UPDATE/platform advisory lock, clean facts and genuine relationships,
atomic nonce, exclusive fsynced checkpoint, one false/version1 -> true/version2 CAS,
real xid8, signed receipt and TWO separate committed-state reads before signed ARMED.
No application initialization, migration, fake Person/audit, retry or compensating
rollback is introduced. Any possible UPDATE/COMMIT/readback ambiguity is INDETERMINATE;
the durable checkpoint/nonce remains, and another execution is refused.

`r1-native-entry.ts` checks the independent source scope BEFORE private key/DB access,
then verifies checkout, actual SID, protected paths, immutable PG/Redis resources and
signature/flags. It does not invoke Medusa loaders. The source-review record currently
names 96bba32e4a1b347012a7c73032603977cd9c5860, whose executor was absent. This NEW
implementation cannot silently inherit that old source approval. The final-SHA
commissioning decision must use the existing canonical #238 process; no new signer,
reviewer, registry-file authority or environment Boolean can supply it. The historical
record also explicitly says actual SQL is not authorized by that review alone.

The previously rejected test was not rerun in disguise. Its concrete authority issue
was addressed under the NEW explicit test authorization: `r1-activation.pg16.ts` is
TEST_FIXTURE / NOT_AUTHORITY, requires GitHub Actions + existing sentinel + exact random
mfa_cli_ci_<16hex> DB, loopback:5432 and mfa_test. Key generation follows those checks,
stays in memory, and never touches operator custody or runtime approval. The real
source scope rejects this synthetic signer/source. It reuses the already migrated
CI DB and existing cleanup, creates no additional service/database, and exercises
foreign-consumer/nonce/flags/tamper/expiry/checkpoint rejection and a genuine positive
commit/readback. CI evidence is not protected-runtime activation evidence.