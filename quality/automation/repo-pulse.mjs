import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const monitoredIssues = [147, 208, 229, 235];
const commentPrefix = "<!-- DA-GOVERNANCE-PULSE-245:v1:";
const maxPrs = 12;
const expectedWorkflowRef = 'DenizOner/DogruAdres/.github/workflows/governance-automation.yml@refs/heads/main';
const markerRe = /^<!-- DA-GOVERNANCE-PULSE-245:v1:([a-f0-9]{64}) -->\n/;

export function md(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;")
    .replace(/[\r\n]+/g, " ");
}

export function fingerprint(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

export function validateTrustedExecution(env) {
  if (env.repository !== "DenizOner/DogruAdres" || env.issueNumber !== 245 ||
      env.ref !== "refs/heads/main" || env.workflowRef !== expectedWorkflowRef ||
      !["schedule", "workflow_dispatch"].includes(env.eventName)) {
    throw new Error("Untrusted repo, workflow source, branch, event or target: no writes allowed");
  }
}

export function latestTrustedPulseComment(comments) {
  return comments.filter((item) =>
    item.user?.login === "github-actions[bot]" &&
    item.user?.type === "Bot" &&
    typeof item.body === "string" &&
    markerRe.test(item.body)
  ).at(-1);
}

// Read every page before deciding whether to publish. Never write after partial API
// retrieval or an excessive page count; it could cause duplicate notification storms.
export async function publishPulse(api, issueNumber, content) {
  if (issueNumber !== 245) throw new Error("Unexpected target Issue: no writes allowed");
  const comments = [];
  let complete = false;
  for (let page = 1; page <= 100; page++) {
    const batch = await api(`/issues/245/comments?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length > 100) throw new Error("Invalid GitHub comment page");
    comments.push(...batch);
    if (batch.length < 100) { complete = true; break; }
  }
  if (!complete) throw new Error("Comment pagination safety limit: no writes allowed");

  // Only user-visible content determines whether a new notification is meaningful.
  const marker = `${commentPrefix}${fingerprint(content)} -->`;
  const last = latestTrustedPulseComment(comments);
  if (last?.body?.startsWith(marker + "\n")) return "unchanged";
  await api("/issues/245/comments", {
    method: "POST",
    body: JSON.stringify({ body: marker + "\n" + content }),
  });
  return "posted";
}

export function renderPulse(snapshot) {
  const output = [
    "## DoğruAdres — otomatik GitHub yönetim görünümü",
    "",
    "**Kapsam:** Yalnız GitHub API meta verisi. Ürün/QA kabulü, bağımsız kaynak incelemesi veya merge izni değildir.",
    "",
    `- main GitHub koruma işareti: **${snapshot.mainProtected ? "ETKİN görünüyor (Settings doğrulaması ayrıca gerekli)" : "ETKİN DEĞİL / doğrulanmalı"}**`,
    `- Açık PR sayısı: **${snapshot.openPullCount}** (ilk ${snapshot.pullRequests.length} listeleniyor)`,
    "",
    "### Mevcut ana takip kayıtları",
    "",
  ];

  for (const issue of snapshot.issues) {
    output.push(`- [#${issue.number}](https://github.com/DenizOner/DogruAdres/issues/${issue.number}) — ${issue.state === "open" ? "AÇIK" : "KAPALI"}, son GitHub hareketi: ${md(issue.updated.slice(0, 10))}`);
  }

  output.push("", "### Açık pull request'ler", "");
  if (!snapshot.pullRequests.length) output.push("- Açık PR bulunamadı.");
  for (const pr of snapshot.pullRequests) {
    output.push(`- [PR #${pr.number}](https://github.com/DenizOner/DogruAdres/pull/${pr.number}) — ${pr.draft ? "TASLAK" : "İNCELEMEYE AÇIK"}; HEAD \`${md(pr.sha.slice(0, 12))}\`; yalnız HEAD check-run özeti: **${md(pr.headChecks)}**`);
  }
  output.push(
    "",
    "> CHECK-RUN uyarısı: HEAD üzerindeki kontroller, PR merge-ref CI veya gerçek tarayıcı/HTTP/PG kabulüyle eşdeğer değildir. 'Kontrol bulunamadı' ifadesi PASS değildir.",
    "> M0 B01–B21 kabul kaydı #147; yerel veri kurtarma #229; ücretsiz GitHub koruma ayarı #208/#235. Bu bot hiçbirini kapatmaz veya otomatik onaylamaz.",
    "",
    "**Sır/gizli veri, sentetik kullanıcı kimliği, DB çıktısı, token veya test ekran görüntüsü paylaşılmaz.**",
  );
  return output.join("\n");
}

async function pulse() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const issueNumber = Number(process.env.PULSE_ISSUE_NUMBER || 245);
  validateTrustedExecution({
    repository,
    issueNumber,
    ref: process.env.GITHUB_REF,
    workflowRef: process.env.GITHUB_WORKFLOW_REF,
    eventName: process.env.GITHUB_EVENT_NAME,
  });
  if (!token) throw new Error("Missing scoped GITHUB_TOKEN: no writes allowed");

  const base = `https://api.github.com/repos/${repository}`;
  async function api(path, init = {}) {
    const response = await fetch(base + path, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status} at ${path.split("?")[0]}`);
    return response.json();
  }

  const [main, openPulls, ...issueRecords] = await Promise.all([
    api("/branches/main"),
    api("/pulls?state=open&per_page=100"),
    ...monitoredIssues.map((id) => api(`/issues/${id}`)),
  ]);
  const pullRequests = await Promise.all(
    openPulls.slice(0, maxPrs).map(async (pr) => {
      const head = await api(`/commits/${encodeURIComponent(pr.head.sha)}/check-runs?per_page=100`);
      const checks = (head.check_runs ?? []).map((check) => ({
        name: String(check.name),
        status: check.status === "completed" ? String(check.conclusion ?? "unknown") : "pending",
      }));
      checks.sort((a, b) => a.name.localeCompare(b.name));
      const failed = checks.filter((check) => ["failure", "timed_out", "cancelled", "action_required"].includes(check.status));
      const pending = checks.filter((check) => check.status === "pending");
      return {
        number: pr.number,
        draft: Boolean(pr.draft),
        sha: pr.head.sha,
        headChecks: !checks.length ? "KONTROL BULUNAMADI" :
          failed.length ? `${failed.length} başarısız/iptal kontrol` :
          pending.length ? `${pending.length} tamamlanmamış HEAD kontrolü` :
          `${checks.length} HEAD kontrolü, merge-ref doğrulanmadı`,
      };
    }),
  );
  pullRequests.sort((a, b) => a.number - b.number);
  const snapshot = {
    mainProtected: Boolean(main.protected),
    openPullCount: openPulls.length,
    issues: issueRecords.map((issue) => ({
      number: issue.number,
      state: issue.state,
      updated: issue.updated_at,
    })),
    pullRequests,
  };
  const content = renderPulse(snapshot);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, content + "\n");
  }

  const outcome = await publishPulse(api, issueNumber, content);
  process.stdout.write(outcome === "unchanged"
    ? "No visible-report change; no issue comment added.\n"
    : "Posted changed visible report to automation tracking Issue #245.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  pulse().catch((error) => {
    // Never print token, response bodies or sensitive runtime environment variables.
    process.stderr.write(`Governance pulse failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
