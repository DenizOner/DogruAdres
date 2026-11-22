---
name: mercur-medusa-reuse-check
description: Verifies installed Mercur and Medusa capabilities, version-matched documentation and extension points before proposing DoğruAdres framework-facing functionality or dependency changes.
---

# Verify Before Building (Yeniden Kullanım Ön Kontrolü)

Use the root `AGENTS.md` mandatory reuse-before-build gate and relevant approved `[DEC DA-*]`, ADRs, and task Issues. DoğruAdres is the product layer; Mercur and Medusa are upstream dependencies, never source files to modify directly.

In the **Lead Agent + Subagents** architecture, this verification can be performed directly by the Lead Agent or delegated to a read-only **Araştırmacı Alt Ajanı (Research Subagent)** to keep the main conversation context clean.

## Investigation Protocol

1. **Specify User Outcome:** Clearly define one user outcome, the actor/organization authorization boundary, and the smallest observable positive/negative acceptance test. A requested implementation method is only a hypothesis, not proof of a feature gap.
2. **Inspect Installed Versions & Project Sources:** Inspect relevant package manifests (`package.json`, `bun.lock`), `packages/api/medusa-config.ts`, `packages/api/`, `apps/admin/`, `apps/vendor/`, and `blocks.json` only as needed. Avoid indiscriminate, repository-wide exploratory dumps.
3. **Consult Version-Matched Mercur Documentation:**
   - Start with `node_modules/@mercurjs/docs/llms.txt`.
   - Read relevant `node_modules/@mercurjs/docs/content/**/*.mdx` pages.
   - Cross-check matching official Medusa documentation for core Medusa v2 contracts.
   - If local docs or installed sources cannot be read, record `UNVERIFIED`; never invent an API or assume a feature is missing.
4. **Evidence-Based Classification:**
   - `AVAILABLE`: Feature exists and can be reused directly.
   - `REQUIRES CONFIGURATION/EXTENSION`: Feature is supported via documented configuration, links, workflow hooks, or custom modules.
   - `GAP CONFIRMED`: Capability is genuinely missing from upstream and requires a project-owned module/adapter.
   - `UNVERIFIED`: Insufficient local evidence.
   - Escalating to upstream core modification, patch, or fork is strictly prohibited.
5. **Concise Decision Record:** Return the exact file/route/API evidence, package versions, permission/tenant implications, alternative approaches, and the smallest decisive acceptance test.

If the existing platform capability satisfies the approved requirement, stop: do not write custom code or introduce duplicate architecture.
