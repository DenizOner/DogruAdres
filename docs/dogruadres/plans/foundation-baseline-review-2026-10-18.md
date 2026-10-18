# Foundation and earlier DogruAdres code — initial defect and evidence register

- Date: 2026-10-18; baseline merged main d87ba52f99f74d7fec52af70a815fe91a989fc3f.
- Status: targeted READ-ONLY SOURCE REVIEW, no actual runtime or protected database testing, and NOT an exhaustive audit of all app code.
- Review inputs: Foundation module service, AuditEvent model, both migrations, Organization authorization/role policy, workflow definitions, API middleware, native HTTP test definition, CI and medusa-config, module tree. Do not claim all historical bugs found or fixed.

| ID | Directly observed evidence | Classification / remediation |
| --- | --- | --- |
| FND-01 | Foundation service has @InjectTransactionManager and createAuditEvents within source mutations | Existing good pattern; preserve and exercise failure-injection regression |
| FND-02 | AuditEvent Medusa model/migration carries ordinary deleted_at/updated_at; reviewed source demonstrates no enforced append-only DB protection | Confirmed hardening/immutability gap, NOT proven unauthorized deletion; design supported append-only and tamper tests |
| FND-03 | Initial Foundation migration down() drops Organization, Person, Membership, Invitation, AuditEvent, ActorMapping with CASCADE | Confirmed destructive rollback hazard; prohibit automatic production rollback; plan safe forward fix/backup/restore |
| FND-04 | medusa-config uses JWT_SECRET or "supersecret" and COOKIE_SECRET or "supersecret" | Confirmed insecure fallback risk; production must fail closed when absent; no claim production used defaults |
| FND-05 | Foundation GitHub Actions tests units, TypeScript, native HTTP SYNTAX only and backend test build | Confirmed CI integration coverage gap; add guarded disposable-DB native authenticated HTTP runs |
| FND-06 | Existing source tree has dogruadresAccess only; no module AuditIndex, local outbox or Vehicle implementation | Newly approved capability MISSING, not old code bug; build AF-1/2/3 |
| FND-07 | Foundation audit module field introduced via separate migration; current table already canonical for Foundation | Existing correct provenance; preserve history and backfill without destructive changes |
| FND-08 | Native HTTP test has static G1 DB/port guards and real audit assertions but CI runs only node --check | Test-harness portability/assurance risk; isolate test resources safely and run targeted CI |
| FND-09 | Dashboard/finance/integration sources were initially NOT ASSESSED | **SOURCE FOLLOW-UP COMPLETE (IR-0):** see [25 finding review](dashboard-finance-integrations-code-review-2026-10-18.md). Runtime, installed third-party internals, live payment config and all presentational UI leaves are NOT VERIFIED; do not infer execution or total defect closure. |
| FND-10 | Earlier Vehicle requirement treated Access da_audit_event as shared physical target | Superseded architecture assumption per ADR-0006; not an existing Vehicle runtime defect |

Priorities: P0 production secret fallback and protected destructive migration handling; P1 source audit hardening, outbox, authorized reconciliation/index, CI native DB evidence; P2 remaining application-by-application inventory. Every actual repair needs exact file/line evidence, smallest supported change, rollback/safety plan, regression proof, independent review and authorized isolated runtime. Never rewrite already accepted Foundation behavior or claim all bugs resolved without evidence.
