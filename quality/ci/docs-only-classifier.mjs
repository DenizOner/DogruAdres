// #416: conservative docs-only classification; never trusts PR-authored executable code.
// Run this from the trusted main/base checkout, not the untrusted PR merge tree.
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REPOSITORY = "DenizOner/DogruAdres";
export const MAX_CHANGED_FILES = 2999;

const full = reason => ({ mode: "full", docsOnly: false, reason });
const docs = count => ({ mode: "docs-only", docsOnly: true, reason: "allowed_document_paths", count });

export function isAllowedDocumentPath(filename) {
  if (filename === "AGENTS.md" || filename === "README.md") return true;
  if (typeof filename !== "string" || !filename.startsWith("docs/")) return false;
  const segments = filename.slice("docs/".length).split("/");
  return segments.length > 0 && segments.every((segment, i) =>
    /^[A-Za-z0-9][A-Za-z0-9 _.\-]*$/.test(segment) &&
    segment !== "." && segment !== ".." &&
    (i !== segments.length - 1 || segment.endsWith(".md")));
}

export function classifyChangedFiles(files, declaredCount) {
  if (!Number.isSafeInteger(declaredCount) || declaredCount < 1 ||
      declaredCount > MAX_CHANGED_FILES) return full("invalid_file_count");
  if (!Array.isArray(files) || files.length !== declaredCount) return full("incomplete_file_list");
  const names = new Set();
  for (const file of files) {
    if (!file || typeof file !== "object" || typeof file.filename !== "string" ||
        !Number.isSafeInteger(file.changes) || file.changes < 1 ||
        !Number.isSafeInteger(file.additions) || file.additions < 0 ||
        !Number.isSafeInteger(file.deletions) || file.deletions < 0 ||
        file.changes !== file.additions + file.deletions ||
        typeof file.patch !== "string" || file.patch.length === 0 ||
        !["added", "modified"].includes(file.status) ||
        Object.hasOwn(file, "previous_filename") ||
        !isAllowedDocumentPath(file.filename) || names.has(file.filename))
      return full("untrusted_or_non_document_change");
    names.add(file.filename);
  }
  return docs(files.length);
}

const validSha = s => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);

export async function classifyGithubPullRequest(event, {
  eventName, repository, token, request = fetch
} = {}) {
  if (eventName !== "pull_request" || repository !== REPOSITORY ||
      !event || event.repository?.full_name !== REPOSITORY ||
      event.pull_request?.base?.ref !== "main" ||
      !Number.isSafeInteger(event.pull_request?.number) ||
      event.pull_request.number < 1 ||
      !validSha(event.pull_request?.head?.sha) ||
      !validSha(event.pull_request?.base?.sha) ||
      typeof token !== "string" || token.length === 0)
    return full("untrusted_event_or_missing_token");

  const pr = event.pull_request;
  const count = pr.changed_files;
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_CHANGED_FILES)
    return full("invalid_file_count");

  // The token is used only for read-only official GitHub endpoints, never printed.
  async function get(path) {
    const res = await request("https://api.github.com/repos/" + REPOSITORY + path, {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!res?.ok) throw Error("api_failed");
    return await res.json();
  }
  async function matchesSnapshot() {
    const live = await get("/pulls/" + pr.number);
    return live?.number === pr.number &&
      live?.head?.sha === pr.head.sha &&
      live?.base?.sha === pr.base.sha &&
      live?.base?.ref === "main" &&
      live?.changed_files === count;
  }
  try {
    if (!(await matchesSnapshot())) return full("pr_version_changed");
    const main = await get("/git/ref/heads/main");
    if (main?.object?.sha !== pr.base.sha) return full("main_version_changed");
    const files = [];
    for (let page = 1; files.length < count && page <= 30; page++) {
      const batch = await get("/pulls/" + pr.number + "/files?per_page=100&page=" + page);
      if (!Array.isArray(batch) || batch.length < 1 || batch.length > 100)
        return full("incomplete_file_list");
      files.push(...batch);
      if (files.length > count) return full("file_count_changed");
    }
    const classification = classifyChangedFiles(files, count);
    if (classification.docsOnly) {
      // A textual patch is not enough: an allowed .md path could be a symlink
      // or executable file. The Git tree exposes the actual blob mode.
      const tree = await get("/git/trees/" + pr.head.sha + "?recursive=1");
      if (!tree || tree.truncated !== false || !Array.isArray(tree.tree))
        return full("incomplete_git_tree");
      const eligible = new Map(files.map(file => [file.filename, file.sha]));
      const seen = new Set();
      for (const entry of tree.tree) {
        if (!eligible.has(entry.path)) continue;
        if (seen.has(entry.path) || entry.type !== "blob" ||
            entry.mode !== "100644" || !validSha(entry.sha) ||
            entry.sha !== eligible.get(entry.path))
          return full("unsafe_document_blob");
        seen.add(entry.path);
      }
      if (seen.size !== files.length) return full("missing_document_blob");
    }
    if (!(await matchesSnapshot())) return full("pr_version_changed");
    // Fail closed if main changed during pagination or tree inspection.
    const mainAfter = await get("/git/ref/heads/main");
    if (mainAfter?.object?.sha !== pr.base.sha) return full("main_version_changed");
    return classification;
  } catch {
    // API errors, rate limits, missing permissions, bad JSON and network failures
    // can never turn off a required security or integration test.
    return full("api_unavailable");
  }
}

async function main() {
  let result = full("invalid_event");
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    result = await classifyGithubPullRequest(event, {
      eventName: process.env.GITHUB_EVENT_NAME,
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN
    });
  } catch {
    result = full("invalid_event");
  }
  const message = "CI file-classification: " + result.mode + " (" + result.reason + ")";
  process.stdout.write(message + "\n");
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT,
      "docs_only=" + String(result.docsOnly) + "\n" +
      "classification=" + result.mode + "\n");
  } else if (process.env.GITHUB_ACTIONS === "true") {
    // No silent green run if the classifier cannot set its job output.
    process.stderr.write("GITHUB_OUTPUT missing: cannot publish classification\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
