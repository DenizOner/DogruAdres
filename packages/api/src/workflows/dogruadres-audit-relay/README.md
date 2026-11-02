# Foundation audit relay — AF-2B source contract

This workflow is server-internal, bounded to one outbox claim per invocation. It
registers no route, subscriber, scheduler or background worker. Delivery liveness
requires a separately operated caller that continues invoking it; source-only
preparation does not prove at-least-once delivery or runtime integration.

## Ownership and commit order

Foundation owns canonical events, original outbox envelopes and all delivery state.
Index owns only its independent derived projection. The integration reads a leased
outbox and its linked canonical event through Foundation methods, compares their
exact version-1 contents and emits only allowlisted canonical attributes. Index
maps canonical `id` / outbox `source_audit_event_id` to `source_event_id`.
Caller-supplied wire data is never the workflow's source of truth.

Each module call opens its own module transaction; no Context/EntityManager crosses
the integration ports. Index method fulfillment is awaited before conditional ACK.
No workflow compensation deletes evidence or pretends these commits are atomic.

## Fixed initial policy

`audit-delivery-policy.ts`: five delivery attempts including the initial claim;
60-second leases; exponential delay 30/60/120/240/480 seconds with a 900-second cap.
The claim SQL atomically locks with SKIP LOCKED, increments the durable count and
assigns a fresh token. Mutations require the same unexpired DB-time lease token.
There is no heartbeat or in-memory claim registry. Expired claims are eligible again.

At attempt five, a subsequent claim is reconciliation-only and does not increment
or perform a sixth Index write. The Index identity AND projected contents are
inspected before exhaustion quarantine. If Index is unavailable, the row stays
pending with RECONCILIATION_DEFERRED and a bounded delay. These read-only
reconciliation attempts may continue while Index is down; the five-write budget
is never reset. No quarantined row is automatically replayed or deleted.

SOURCE_INVALID / ENVELOPE_INVALID are permanent provenance/contract failures.
INDEX_CONFLICT requires review; INDEX_UNAVAILABLE is transient.
ATTEMPTS_EXHAUSTED requires a successful missing-identity inspection.
Only these and RECONCILIATION_DEFERRED are persisted, never raw exception messages.

## Ambiguity and recovery

An Index commit followed by a lost ACK remains recoverable through a later matching
inspection. A stale token cannot ACK another lease. A lost ACK response is returned
as ack_unconfirmed, with no automatic second mutation in that invocation.
A very late stale worker can still commit an idempotent Index projection after its
source lease expires: there is no cross-module fencing transaction. Quarantine
therefore does not assert global absence forever. Preserve evidence; reconciliation
of terminal quarantine is a separately controlled operation, not automatic repair.
No SQL/HTTP timeout is treated as transaction completion or rollback proof.

## Migration / acceptance boundary

Migration20261018020000 is additive: existing pending rows start at attempt zero;
source IDs, canonical FKs and envelopes are unchanged. Status/error enums, attempt
bounds, lease pairing and terminal-state CHECK constraints accompany a due index.
The updated schema snapshot is manually synchronized, not database-generated.
The historical migrations and immutable canonical audit table are unchanged.

All new tests are source only / NOT TESTED. Module-port and SQL doubles are not
real SKIP LOCKED, physical transaction, concurrent delivery, migration or recovery
proof. Future isolated PostgreSQL tests must cover competing claims, expired/stale
leases, Index outages, duplicate/out-of-order delivery, fifth-attempt reconciliation,
late commits, ACK ambiguity, constraints and original Foundation security regressions.
AF-2C current-Organization read authorization remains separate; no read API is exposed.
