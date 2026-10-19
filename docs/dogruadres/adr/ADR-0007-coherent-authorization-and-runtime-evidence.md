# ADR-0007: consolidated module ownership, coherent authorization and runtime evidence

- Status: Accepted (Product Owner policy); implementation/runtime acceptance remains separate.
- Recorded: 2026-10-19. This is the R0 record date, not an invented historical approval date.
- Authority: explicit Product Owner Architecture Consolidation R0 instruction in the current session.
- Scope: independent Foundation, Vehicle and Audit Index modules; final Vehicle authorization Policy A; permanent evidence workflow.

## Provenance and documentation discrepancy

At R0 baseline d5392c7f92ce61c1bd7c3237d3f8c5d9360b525b, this branch contains ADR-0001–0003 only. Authentic local Git objects retain ADR-0005 and ADR-0006 at [9be9d9ffb0ae8cd06341e613497f525dd7877371](https://github.com/DenizOner/DogruAdres/commit/9be9d9ffb0ae8cd06341e613497f525dd7877371); independent-module acceptance is also recorded in [df04f9199e7654f13dba7c98c6ccbfa6c2aa954b](https://github.com/DenizOner/DogruAdres/commit/df04f9199e7654f13dba7c98c6ccbfa6c2aa954b). The former is not an ancestor of this baseline. The local branch name feature/vehicle-management-mvp is unavailable; the objects were read without checkout, merge or cherry-pick.

Those records identify ADR-0004 co-location as superseded, ADR-0005 independent physical modules as accepted and ADR-0006 source-owned audit/outbox plus derived Index as accepted. Their text remains historical evidence at those commits; this checkpoint does not recreate missing files, backdate decisions or claim historical approval beyond the records. ADR-0007 records today's explicit binding consolidation and reconciles the branch documentation gap. ADR-0001–0003 remain unchanged.

## Decision

- Each domain is an independently registered Medusa module with its own model metadata, persistence, service and migrations. Vehicle never resides inside Access.
- Each domain mutation, mandatory canonical local audit and durable source outbox are one source-owned physical transaction. Foundation audit is Foundation evidence; Vehicle evidence belongs to Vehicle. Audit Index is an independent derived projection delivered asynchronously and idempotently, not the canonical source.
- One canonical final Vehicle authorization mechanism: one fresh Foundation-owned coherent SELECT through the application/Query boundary. Q2's sequential observer remains historical/non-authoritative until reviewed replacement cleanup. The S2 projection is a feasibility candidate, not automatic technical acceptance.
- Policy A: L is snapshot acquisition of that final SELECT after the required Vehicle lock/read and before the first Vehicle write. A validated fresh READ COMMITTED statement on the authoritative primary must reflect revocations committed before L. Commits after L may overlap the authorized operation. Every operation repeats the final check; no cached/replayed grant and no commit-time fencing claim.
- Verified request → trusted workflow → Vehicle scoped lock/read → coherent Foundation decision → resource-dependent validation → Vehicle mutation/audit/outbox → Vehicle commit/rollback → asynchronous Index delivery. Preserve current roles, fail-closed identity/cardinality checks and Organization isolation. Final attribution is from the same decision.
- Independent managers and connections: no cross-module EntityManager forwarding, transaction sharing, Foundation service calls or hidden authorization callbacks inside Vehicle. Application orchestration and Query-based cross-module reads follow pinned Mercur contracts.
- Follow PRINCIPLES.md §12: smallest verified end-to-end invariant, early focused execution, immediate bounded defect repair, explicit evidence statuses, independent source/runtime/concurrency/security gates and Technical Advisor acceptance. Do not build more layers on blocked assumptions.

## Alternatives and consequences

Reject co-location, cross-module manager forwarding, non-atomic Q2 grants, workflow compensation as physical rollback and commit-time fencing as an unstated promise. Policy A intentionally permits post-L revocation overlap; stronger fencing would require a new product decision. Real primary routing, snapshot freshness and request/workflow lifecycle must be verified before enabling mutations. Version-pinned baseRepository_ remains SOURCE-POSSIBLE / PUBLIC SUPPORT UNPROVEN, not a stable public API certification.

## Acceptance and upgrade impact

Medusa 2.21.2 and Mercur 2.3.7 contracts must be checked against installed code/docs. PostgreSQL evidence identifies the actual major version. Run real module/virtual Query dispatch, parameter translation, single SELECT, state/cardinality, revocation race and source-local commit/rollback probes in owned disposable resources. Mocks and types are supplemental. Revalidate internal compatibility dependencies on upgrade. No upstream patch, public CRUD activation or deployment is authorized by this ADR.

## Follow-up

R0 records evidence and blockers, then stops for independent review. R1–R4 scope is a proposal in the R0 evidence report, not permission to bypass failed gates or implement more layers. Preserve historical observers and protected evidence until reviewed cleanup. Publication requires separate authorization.
