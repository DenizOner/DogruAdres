# M0 MFA Platform & Session Latch Activation Runbook (Source-Only Design)

**Document Type:** Operator Runbook & Security Ceremony Specification  
**Status:** DRAFT / PROPOSED FOR TECHNICAL ADVISOR REVIEW  
**Scope:** Disposable, authorized clean E2E test database only. NEVER run on shared/protected targets.

---

## 1. Context & Architecture Separation

The DoğruAdres M0 MFA model defines two distinct platform security boundaries:

1. **`da_mfa_policy` (3-mode policy):**
   - Mode values: `'required'`, `'optional'`, `'disabled'`.
   - **Default behavior:** When no row exists, `MfaPersistence.readPlatformPolicy()` defaults safely to `mode='required'` with `version=0`.
   - **Rule:** Do NOT insert an artificial row if the default `required` mode is desired. If an explicit policy change is necessary, execute it through `MfaPersistence.setPlatformPolicy(...)` inside a transaction so that `da_audit_event` and `da_security_outbox` events are generated with true operator provenance.

2. **`da_session_policy.mfa_activated` (Irreversible Deployment Latch):**
   - Boolean field on singleton row `id='current'` in `da_session_policy`.
   - Controlled by PostgreSQL trigger `trg_da_session_policy_mfa_latch` (`Migration20261022012000`).
   - Once set to `true`, the trigger permanently forbids setting it back to `false`, `DELETE`-ing, or `TRUNCATE`-ing the table.
   - **Provenance:** This is a DBA/deployment ceremony. It does NOT belong to an ordinary application Person.

---

## 2. Mandatory Preconditions Checklist

Before executing the activation ceremony on an authorized clean target:

- [ ] Target database connection string verified: must NOT be `m0ssi_a7f1`, `mfa_e2e_fresh`, or production port 9000.
- [ ] Exclusive connection verified: no active client sessions or test runners attached.
- [ ] Exactly two canonical Persons and valid `da_login_binding` records exist.
- [ ] Zero native TOTP factor rows exist (`auth_mfa` is completely empty).
- [ ] `da_session_policy` row `id='current'` has `mfa_activated = false`.
- [ ] Migration `20261022012000` is applied (latch trigger is active).

---

## 3. Activation Execution Procedure (DBA Script)

```sql
-- Transaction-bound activation ceremony with strict precondition guards
BEGIN;

-- 1. Assert exactly singleton row exists and latch is currently inactive
DO $$
DECLARE
    v_activated boolean;
    v_users int;
    v_bindings int;
    v_factors int;
BEGIN
    SELECT mfa_activated INTO v_activated FROM da_session_policy WHERE id = 'current' FOR UPDATE;
    IF v_activated IS NOT FALSE THEN
        RAISE EXCEPTION 'ABORT: da_session_policy.mfa_activated is already true or row is missing';
    END IF;

    SELECT count(*) INTO v_users FROM "user";
    IF v_users <> 2 THEN
        RAISE EXCEPTION 'ABORT: Expected exactly 2 native users, found %', v_users;
    END IF;

    SELECT count(*) INTO v_bindings FROM da_login_binding WHERE revoked_at IS NULL AND verified_at IS NOT NULL;
    IF v_bindings <> 2 THEN
        RAISE EXCEPTION 'ABORT: Expected exactly 2 verified login bindings, found %', v_bindings;
    END IF;

    SELECT count(*) INTO v_factors FROM auth_mfa;
    IF v_factors <> 0 THEN
        RAISE EXCEPTION 'ABORT: Pre-existing MFA factors found in auth_mfa: %', v_factors;
    END IF;
END $$;

-- 2. Irreversible latch transition
UPDATE da_session_policy
SET mfa_activated = true,
    version = version + 1
WHERE id = 'current';

-- 3. Readback assertion
DO $$
DECLARE
    v_activated boolean;
BEGIN
    SELECT mfa_activated INTO v_activated FROM da_session_policy WHERE id = 'current';
    IF v_activated IS NOT TRUE THEN
        RAISE EXCEPTION 'ABORT: Latch update readback failed';
    END IF;
END $$;

COMMIT;
```

---

## 4. Architectural Limitations & Documented Gap

- **Gap:** Application audit trail (`da_audit_event`) requires an `actor_person_id` foreign key referencing `da_person`. A deployment-level DBA database update has no canonical `Person`.
- **Policy Decision:** Under AGENTS.md and PRINCIPLES.md, agents MUST NOT invent a synthetic application `Person` (such as "System Administrator") to satisfy a foreign key constraint. Doing so corrupts domain provenance.
- **Resolution:** The irreversible session-policy latch is documented as a deployment/schema lifecycle event recorded in deployment migration logs, NOT as an in-app user action.