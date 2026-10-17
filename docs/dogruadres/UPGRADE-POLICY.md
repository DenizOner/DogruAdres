# Mercur upgrade policy

Mercur upgrades are a controlled engineering process, not a blind package bump.

## Required upgrade steps

1. create a dedicated upgrade branch
2. identify the target stable Mercur release
3. read the release notes and compatibility notes
4. inspect migration guidance and breaking changes
5. update the relevant Mercur packages coherently
6. read the new installed version-matched docs from `node_modules/@mercurjs/docs`
7. compare template and scaffold changes
8. compare AGENTS/AI guidance changes from the upstream scaffold if relevant
9. evaluate API, type, workflow, and dashboard SDK changes
10. re-evaluate every temporary compatibility adjustment
11. run targeted builds and tests
12. run contract/integration/security checks as they exist
13. perform staging verification before production
14. update the project docs and ADRs when architecture changes

## Required compatibility re-evaluation

Before a new Mercur version is accepted, the agents must explicitly ask:

- Is Redis wiring still required?
- Is root `i18next` still required?
- Is the storefront lint issue still present?
- Does the local environment still require a temporary workaround?

No compatibility patch may be carried forward automatically.

## Decision rule

If a temporary compatibility change is no longer necessary, it must be removed. If it is still necessary, it must be documented and reviewed with the new version’s framework behavior.

## Scope discipline

Mercur upgrade work should remain isolated from unrelated feature work. When a framework change affects architecture or ownership boundaries, the change should be recorded in ADRs and the project docs.

## Mercur 2.3.7 local security checkpoint — 2026-10-17

The latest explicit Product Owner instruction authorizes closing the local dependency checkpoint with known limitations. Mercur dependency packages are aligned to 2.3.7; Medusa remains 2.21.2. Bun 1.4.2's valid incidental Storybook resolutions are retained rather than forcibly reverted. This is evidence preservation, not deployment authorization or acceptance of every product requirement.

Existing evidence includes API/Admin/Vendor builds, native API bootstrap and runtime patches, isolated fresh/restored-copy migrations and rerun, and 122 successful security/functional assertions. The original reports remain historical evidence outside Git. The historical Order–Payout link assertion is not converted to PASS: upstream #1579/#1580 confirms that linking is a project-specific integration using `payoutCreated`.

Known limitations remain separate work:

- Storefront bundling completed, but its production build failed ESLint parsing; independent TypeScript checking failed with SDK route typing and React/UI type-contract issues. Existing build configuration skips type checking. Neither checks nor source are changed by this checkpoint; Storefront production compatibility is not accepted.
- Jest's full HTTP bootstrap remains limited; native Node HTTP evidence is used instead. Passing loader smoke checks are not full Jest integration acceptance.
- Real-money payout production readiness is not accepted. Project orchestration, order linkage, persistent logical identity, duplicate/concurrent prevention, provider idempotency, ambiguous outcomes, crash recovery and reconciliation require separate authorized engineering work.
- The original local demo database is not represented as migrated by this Git checkpoint. Further database operations, staging/production validation, Organization authorization, merging, pushing and deployment require their own authorization.

These limitations do not require unrelated framework repairs before the approved local checkpoint. Follow PRINCIPLES §11 for bounded continuation of DoğruAdres work.
