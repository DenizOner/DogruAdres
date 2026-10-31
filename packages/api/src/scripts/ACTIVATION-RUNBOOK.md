# M0 MFA Platform & Session Latch Activation Runbook (Source-Only Design)

**Document Type:** Operator Runbook & Security Ceremony Specification  
**Status:** BLOCKED / ARCHITECTURAL REVIEW REQUIRED  
**Scope:** Disposable, authorized clean E2E test database only. NEVER run on shared or protected targets.

---

## 1. Context & Architecture Separation

The DoğruAdres M0 MFA model defines two distinct platform security boundaries:

1. **`da_mfa_policy` (3-mode policy):**
   - Mode values: `'required'`, `'optional'`, `'disabled'`.
   - **Default behavior:** When no row exists, `MfaPersistence.readPlatformPolicy()` defaults safely to `mode='required'` with `version=0`.
   - **Rule:** Do NOT insert an artificial row if the default `required` mode is desired. If an explicit policy change is necessary, execute it through `MfaPersistence.setPlatformPolicy(...)` inside a transaction so that `da_audit_event` and `da_security_outbox` events are generated with true operator provenance.

2. **`da_session_policy.mfa_activated` (Irreversible Deployment Latch):**
   - Boolean field on singleton row `id='current'` in `da_session_policy`.
   - Controlled by PostgreSQL triggers defined in `Migration20261022012000.ts`:
     - `da_mfa_activation_guard_rows`: Prevents clearing `mfa_activated` back to `false` and prevents `DELETE` when active.
     - `da_mfa_activation_guard_truncate`: Prevents any `TRUNCATE` statement on `da_session_policy`.
   - Once set to `true`, these triggers permanently protect the activation state at the PostgreSQL engine level.

---

## 2. Security Decision: Stopping Condition on Execution

> [!CAUTION]
> **EXECUTABLE ACTIVATION SQL IS DISABLED IN THIS RUNBOOK.**
> 
> A bare SQL transaction cannot establish the required durable, independently auditable provenance:
> 1. `da_audit_event` has a foreign key constraint (`actor_person_id`) referencing `da_person(id)`.
> 2. A DBA/system operator executing deployment SQL is NOT an application Person.
> 3. Fabricating a synthetic Person (e.g. "System Administrator" or "DBA") violates domain provenance rules (AGENTS.md & PRINCIPLES.md §10/§11).
> 4. Executing an un-audited SQL update violates the core requirement for tamper-evident ceremony evidence.
>
> Therefore, no automated SQL or script execution may take place until an approved, supported administrative platform actor model or audited migration workflow is formally reviewed.

---

## 3. Mandatory Preconditions Checklist (Specification Only)

If and when a formal audited ceremony is authorized:

- [ ] Target database connection string verified against signed task manifest (MUST NOT be `m0ssi_a7f1`, `mfa_e2e`, `mfa_e2e_fresh`, or production port 9000).
- [ ] Exclusive connection verified: no active client sessions or test runners attached.
- [ ] Exactly two canonical Persons and valid `da_login_binding` records exist.
- [ ] Zero native MFA factor records exist (`auth_identity` has 0 factors returned by `listAuthMfa`).
- [ ] `da_session_policy` row `id='current'` has `mfa_activated = false`.
- [ ] Migration `20261022012000` is applied (triggers `da_mfa_activation_guard_rows` and `da_mfa_activation_guard_truncate` are active).
- [ ] An external immutable audit record (e.g. GitHub Issue approval / signed operator ledger) is committed prior to execution.