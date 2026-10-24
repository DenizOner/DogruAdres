---
name: mercur-medusa-reuse-check
description: Verifies installed Mercur and Medusa capabilities, version-matched documentation and extension points before proposing DoğruAdres framework-facing functionality or dependency changes.
---

# Verify before building

Use the root `AGENTS.md` reuse-first rule and relevant approved `[DEC DA-*]`, ADR and task Issue. DoğruAdres is the product layer; Mercur/Medusa are upstream, not files to rewrite.

1. **Specify one user outcome**, actual actor/organization authorization boundary and the smallest observable acceptance/negative case. A requested implementation method is a hypothesis, not proof of a feature gap.
2. **Read the actual repo and installed versions.** Check relevant `package.json` and `bun.lock`, `packages/api`, `apps/admin`, `apps/vendor`, `apps/storefront` and `blocks.json` only as needed. Avoid repository-wide exploratory dumps.
3. **Use the installed Mercur docs first:** `node_modules/@mercurjs/docs/llms.txt`, then task-relevant `node_modules/@mercurjs/docs/content/**/*.mdx`. Check matching official Medusa documentation for Medusa-specific behavior. If local dependencies/docs cannot be read, record `UNVERIFIED`, not an imagined API or unsupported feature.
4. **Classify with evidence:** `AVAILABLE`, `REQUIRES CONFIGURATION/EXTENSION`, `GAP CONFIRMED` or `UNVERIFIED`. Prefer existing capability, documented extension, small project-owned adapter, then a justified project module. Escalating to upstream patch/fork needs separate authorization.
5. **Return a concise implementation choice:** file/route/API evidence, exact package versions, real permission/tenant implications, alternatives and smallest decisive executable test. Do not implement, upgrade dependencies or access production merely because this skill was invoked.

If the existing supported capability satisfies the approved requirement, stop: no custom code or duplicate architecture is needed.
