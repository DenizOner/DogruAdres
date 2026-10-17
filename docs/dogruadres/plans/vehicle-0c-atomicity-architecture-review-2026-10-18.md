# Vehicle-0C — B2 Transaction Contract Review and C Architecture Exception Assessment

- **Status:** Historical research COMPLETED; C was PROPOSED during this assessment, but was SUBSEQUENTLY ACCEPTED on 2026-10-18 in [ADR-0004](../adr/ADR-0004-co-located-vehicle-access-transactional-audit.md). Research evidence preserved; atomicity remains UNPROVEN.
- **Recorded:** 2026-10-18. Do not infer or invent the original historical Product Owner approval timestamp.
- **Base:** merged Foundation main d87ba52f99f74d7fec52af70a815fe91a989fc3f; Vehicle review branch feature/vehicle-management-mvp.
- **Owner and authority:** DogruAdres Technical Consultant, Product Owner. REQUIREMENTS.md DA-AUTO-001/006, V-01–V-07, N-01/P1, N-02/C1, SECURITY.md, accepted ADR-0002 and Mercur v2.3.7 / Medusa v2.21.2 contracts.
- **Checkpoint timeline:** This research was originally authorized as assessment only; the Product Owner LATER adopted C in ADR-0004. No new C proof has been authorized or run; Vehicle-1, protected migration, branch merge and deployment remain prohibited.

## Objective

Choose an architecture for atomic Vehicle mutation and mandatory shared dogruadresAccess AuditEvent that honors the currently approved all-or-nothing PostgreSQL transaction requirement. Preserve Organization-owned Vehicle behavior, secure authorization, existing shared audit model, and Mercur/Medusa supported extension boundaries. No feature code or runtime tests are part of this documentation checkpoint.

## User-visible outcome

This review delivers an evidence-based choice, explains exactly what was proved/blocked in Vehicle-0B, and identifies the least-risk next Product Owner architecture gate. It does not deliver a Vehicle API/UI.

## Actual Vehicle-0B proof evidence (INCONCLUSIVE)

User-supplied original artifacts from isolated, disposable PostgreSQL 16.15 proof were checked independently:

| Original artifact | SHA-256 |
| --- | --- |
| stdout.log | 45f841ca8e5903869ce4ca14e283458288bcda0c7e6c23705453d9c48598f9e9 |
| results.json | b9df2b135a72b8a719899f7a1ef47781e447179ac7a058a8abe21766391c928f |
| interpretation.json | 0002e6714b91724e543051625bc12e97ebdf406eddfb14fdc0ead8a9b4578a39 |
| sha256-manifest.json | c88d384c0f75947445e134203a76864eb3e6b6aeffc70ba27737e7f2cf08a5c8 |
| run.cjs | bf4492d957c996383ec23742b4ae0f78495f1f728b0b833aaff24a5de4d8ff04 |

The harness bootstrapped separate Medusa modules (Vehicle Proof and original Access), used MedusaService/InjectTransactionManager, then passed the Vehicle module's transaction context to access.createAuditEvents. Every attempted combined write stopped with "Metadata for entity DaAuditEvent not found". The Access service wrote its own audit control when using its own manager. Vehicle-side PID 79 and txids 797, 800, 803, 807, 813 were observed, but no Audit-side transaction identity or successful shared transaction was obtained.

- TEST-01 successful combined commit: NOT PROVEN.
- TEST-02 injected audit INSERT failure: NOT TESTED as intended; ORM metadata error happened first.
- TEST-03 injected Vehicle write failure: NOT TESTED as intended; error masked.
- TEST-04 same physical transaction/connection: PARTIAL Vehicle observation only.
- TEST-05 independent database observation: bounded PASS (uncommitted writes not visible / no recorded partial commit).
- TEST-06 update/soft-delete fault rollback: NOT PROVEN against required audit-insert fault.
- Harness exit code 0 meant test cases were recorded, NOT an atomicity PASS.
- Cleanup of the isolated proof container and no original/G1 database changes were reported by the Agent; their local Docker inventory was not independently reexamined in this review.

GitHub blob SHA comparisons showed the key Foundation Access service/model/migration source files at original feature SHA 39e014a... and merged main d87ba52... were identical. Local transpiled snapshot byte identity was not independently demonstrated.

**Classification: INCONCLUSIVE — CROSS-MODULE SQL ATOMICITY NOT PROVEN.** This invalidates the tested B1 approach of forwarding the Vehicle manager into Access; it does NOT prove every theoretical B2 mechanism impossible.

## Official version-matched source findings

- Mercur v2.3.7 [modules.mdx](https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/modules.mdx): one-domain thin modules, no cross-module service calls/foreign keys, orchestration outside modules; module-specific decorated transactions.
- Mercur v2.3.7 [module-links.mdx](https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/module-links.mdx): links and Query represent cross-module relationships/reads, NOT physically common SQL transactions.
- Mercur v2.3.7 [workflows.mdx](https://github.com/mercurjs/mercur/blob/v2.3.7/apps/docs/resources/best-practices/workflows.mdx): per-step compensation. Compensating after a committed step is not an all-or-nothing physical PostgreSQL rollback.
- Medusa v2.21.2 [InjectTransactionManager source](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/utils/src/modules-sdk/decorators/inject-transaction-manager.ts): reuses caller transactionManager when present, otherwise opens a transaction through THIS service's baseRepository.
- Medusa v2.21.2 [InjectManager source](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/utils/src/modules-sdk/decorators/inject-manager.ts): forwards context, does not merge distinct entity metadata.
- Medusa official [Module Isolation](https://docs.medusajs.com/learn/fundamentals/modules/isolation): isolated module containers, entity/model boundaries and workflow-level inter-module integration.
- Medusa official [Database Operations in Services](https://docs.medusajs.com/learn/fundamentals/modules/db-operations): transactional entity managers and baseRepository.transaction documented for module-owned entities; not an explicit guarantee of atomic cross-module writes across separate metadata containers.
- Medusa official [Multiple Services in a Module](https://docs.medusajs.com/learn/fundamentals/modules/multiple-services): one main service and supported internal services inside ONE physical module, permitting logical organization of different functionality without a second module container.

Sources above show useful supported primitives but NOT a documented stable public B2 API for two separate module services/metadata graphs to share a single physical PostgreSQL commit. This is a bounded evidence-based result, not a categorical impossibility claim. Locally bundled generated @mercurjs/docs content was inspected by the Agent only to the reported scope, not byte-audited here.

## Evaluation and recommendation

| Option | Physical owner and mechanism | Conformity | Proven? | Consultant recommendation |
| --- | --- | --- | --- | --- |
| B1 | Vehicle and Access remain separate modules; Vehicle's transactionManager passed to access.createAuditEvents | Separate domains, but AuditEvent metadata missing | BLOCKED in actual proof | REJECT tested forwarding pattern |
| B2 | Separate physical modules with a stable supported common SQL transaction coordinator | Ideal separation if feasible; no matching supported public contract identified in reviewed sources | NOT PROVEN | Do NOT rerun without a concrete, official version-matched mechanism |
| **C** | **One project-owned physical Medusa module holding Vehicle model and existing AuditEvent, with logically separated internal Vehicle service/helpers** | Compatible with project-owned automotive vs Mercur-owned domain boundary in ADR-0002; exception to Mercur's strict single-domain module guidance | Not tested for Vehicle, though existing Foundation same-module audit precedent exists | **RECOMMENDED AS CONDITIONAL NEXT ARCHITECTURE CHOICE, pending explicit Product Owner approval** |
| D | DB trigger / raw SQL audit side write under one transaction | Physical SQL atomicity plausible, but couples domain tables and bypasses module contracts/actor context | NOT PROVEN | Not recommended first |
| A | Distinct workflow steps with compensation | Mercur supports compensation; this does NOT meet strict mandatory SQL atomicity by itself | Insufficient by construction | REJECT as sole audit guarantee |

### C proposed layout and boundaries — NOT IMPLEMENTED

- Preserve one registered project-owned physical Medusa module, initially the current dogruadresAccess module, for Person/Organization/Membership/Invitation and shared AuditEvent plus Vehicle data. A rename or broad refactor is not required as part of a proposed MVP.
- Add the Vehicle model ONLY within this module's persistence/metadata registration so Vehicle and AuditEvent are both recognized by the SAME transactional entity manager. This is a hypothesis to validate in disposable PostgreSQL before any acceptance.
- Keep Vehicle business methods and input policies logically isolated in separate files/internal service(s) inside the module; Medusa's official Multiple Services guidance documents internal services while retaining one module main service. Do not turn the Foundation service into a long unrelated procedural endpoint.
- Keep a single atomic mutation method/call boundary (invoked from a Mercur-compliant workflow) where Vehicle create/update/soft-delete and createAuditEvents run in the same actual decorated service transaction with a shared manager. Cross-module workflow compensation must not be used as the guarantee for this pair.
- Keep Authorization and resource Organization ownership server-resolved and fail-closed; active memberships and Owner/Admin delete restrictions, soft-delete/live unique plate/VIN indexes, immutable Organization ID, P1/C1 keys and actor-only-in-audit obligations still apply.
- Avoid changes to Mercur core, arbitrary Seller/Product metadata, platform privileges, or separate audit table copies. Shared audit remains one canonical logical/physical trail.

### C concrete trade-offs / approval implications

1. **Mercur architecture deviation:** a physical module now owns identity/organization security AND Vehicle data, instead of one narrowly bounded domain. This exception must be explicitly accepted and documented before coding; it is not implied by N-01/N-02 or V-01–V-07.
2. **Coupling/blast radius:** Access migrations, model registration, dependency initialization and tests become sensitive to Vehicle changes. Keep isolated domains at the internal service/file/workflow level and run comprehensive Foundation regressions.
3. **Upgradeability/extraction:** later splitting Vehicle into a separate physical module may require migrating Vehicle tables, reorganizing transaction/audit boundary and revisiting cross-module atomicity. Do not promise extraction can happen without redesign.
4. **Data lifecycle:** new Vehicle migrations must be additive and independently reviewed. Existing Foundation down() migration uses DROP CASCADE and must not be used as production automatic rollback. No production migration authorization.
5. **Version proof:** even same-module metadata makes SQL atomicity technically plausible, it is still NOT a verified implementation. A targeted audit failure rollback and same physical transaction test must PASS before source integration acceptance.
6. **Safety/operations:** all acceptance proofs use separate disposable PostgreSQL targets and genuine immutable source evidence; no original/G1 data access, no unapproved paid services.
7. **ADR compatibility:** ADR-0002 specifically isolates automotive semantics from Mercur-owned marketplace primitives. C keeps that external boundary intact, but needs a new bounded architecture-exception record for Mercur's preferred internal one-domain module separation. Do not rewrite accepted ADR-0002 silently.

## Decision gates

**Gate 0 (complete):** Independent review of failed B1 proof and version-matched API/documentation. Classification INCONCLUSIVE.

**Gate 1 (CLOSED — Product Owner):** C scoped physical-module/internal Vehicle-service exception was explicitly ACCEPTED in ADR-0004. This is architecture approval only, NOT atomicity PASS or Vehicle-1 permission. B2 remains unproven.

**Gate 2 (OPEN — SEPARATE RUNTIME AUTHORIZATION NOT YET GRANTED):** After ADR-0004 adoption, a new explicit Product Owner approval is required before performing or delegating an isolated, disposable, minimum same-module C feasibility proof using unmodified Access+Audit code and temporary Vehicle-like model inside an isolated snapshot (never existing repository working trees or databases). DO NOT execute now. Prove:
- Both successful writes persist together through actual Medusa same-module service API.
- Injected audit insert failure rolls back Vehicle create, update and soft-delete; injected Vehicle failure leaves no audit.
- Independent connection sees no intermediate committed partial state; collect same PID/transaction ID, actual SQL and postcondition queries.
- Authenticated runtime authorization and real Vehicle API remain OUT OF SCOPE until the separate Vehicle-1 checkpoint.
- If any proof fails, stop and reassess; never weaken the shared audit guarantee.

**Gate 3 (OPEN — implementation authorization):** After successful proof and independent review, approve exact schema/API, review branch checkpoint, test plan and Vehicle-1 scope separately. UI, merge, migration target and deployment retain separate gates.

## Documentation and change-control

- N-01/P1, N-02/C1 and V-01–V-07 remain approved product rules.
- This historical assessment PROPOSED C at the time; C was later ACCEPTED as a narrowly scoped architecture exception in ADR-0004. The runtime C atomicity proof is still UNPROVEN and ADR-0002 remains Accepted and unchanged.
- No new requirement IDs, no whole-record decision-status changes, no claims of Vehicle implementation and no back-dated product-owner approvals.
- The subsequent Product Owner adoption is now documented in Accepted ADR-0004 and scoped project requirements/plans. Neither new proof execution nor feature implementation is authorized by this documentation checkpoint.

## Verification, files and rollback

Documentation-only change; no app files, framework dependencies, tests, migrations, databases, workflow runs or UI are executed or changed. Review branch diff must be constrained to plan/requirements documentation. If this doc is corrected, use a normal follow-up docs-only commit; never force-push or rewrite history. Production rollback/deployment concepts do not apply to a proposal.

