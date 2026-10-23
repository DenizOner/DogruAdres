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