# GitHub project-pulse automation (one canonical operational issue)

This is process automation, not DoğruAdres business code and not a second product requirements source.

- Runs on standard free GitHub Actions each Monday (UTC 07:17), and via manual `workflow_dispatch`, **only after the workflow is independently reviewed and merged into default branch**.
- Reads official GitHub branch/Issue/open PR/check-run metadata; appends sanitized output to the Actions **job summary**.
- Compares a deterministic state fingerprint to the last managed comment on [Issue #245](https://github.com/DenizOner/DogruAdres/issues/245); **adds a new comment only on state change**, so subscribed people can follow material transitions. The job does not create, close, classify or merge product Issues and does not write code.
- Scope: #147 M0 acceptance, #208 branch safety, #229 local data risk, #235 GitHub Free governance and #245 automation; up to 12 open PRs. HEAD check-run results are **not** validated PR-merge-ref CI.
- Bot comment data is public metadata only (status, number, short SHA, last update); no Issue bodies, secrets, user fixture data or screenshots. Permissions are write-to-issues only on scheduled/manual trusted main runs; PR test job is read-only.
- Because this is scoped to existing GitHub records, it cannot reconstruct actual code acceptance. The source Issue remains authoritative. GitHub notifications require the reader to subscribe to #245.
- If GitHub's repository-settings API does not allow enabling main protection, #208 remains **UNVERIFIED/OPEN**; this script cannot change rulesets. Do not confuse a GitHub read or process rule with enforced branch protection.
- Do not attach logs, raw environment dumps or sensitive artifacts. To stop the automation, disable this specific workflow (do not delete or rewrite Issue history).

**Exit/retirement rule:** independently review the exact PR and tests; the Product Owner separately approves merge of that exact SHA. No automatic approval, merger, deployment or branch deletion.
