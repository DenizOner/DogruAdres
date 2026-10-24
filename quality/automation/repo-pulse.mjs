import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const monitoredIssues = [147, 208, 229, 235];
const commentPrefix = "<!-- DA-GOVERNANCE-PULSE-245:v1:";
const maxPrs = 12;

export function md(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;")
    .replace(/[\r\n]+/g, " ");
}

export function fingerprint(snapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
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
  if (!token || repository !== "DenizOner/DogruAdres" || issueNumber !== 245) {
    throw new Error("Unexpected repository/issue or missing scoped GITHUB_TOKEN; no write attempted");
  }

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
      return {
        number: pr.number,
        draft: Boolean(pr.draft),
        sha: pr.head.sha,
        headChecks: checks.length ? (failed.length ? `${failed.length} başarısız/iptal kontrol` : `${checks.length} HEAD kontrolü, merge-ref doğrulanmadı`) : "KONTROL BULUNAMADI",
        checks,
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

  const marker = `${commentPrefix}${fingerprint(snapshot)} -->`;
  const comments = await api(`/issues/${issueNumber}/comments?per_page=100`);
  const previous = comments.filter((entry) => typeof entry.body === "string" && entry.body.startsWith(commentPrefix)).at(-1);
  if (previous?.body?.startsWith(marker)) {
    process.stdout.write("No meaningful project-metadata change; no issue comment added.\n");
    return;
  }
  await api(`/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: marker + "\n" + content }),
  });
  process.stdout.write("Posted changed metadata snapshot to automation tracking Issue #245.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  pulse().catch((error) => {
    // Never print token, response bodies or sensitive runtime environment variables.
    process.stderr.write(`Governance pulse failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
