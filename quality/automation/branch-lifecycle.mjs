import { appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const owner = "DenizOner";
const repo = "DogruAdres";
const repository = owner + "/" + repo;
const protectedPrefixes = ["main", "feature/", "agent/"];
const safeText = (v) => String(v ?? "").replace(/[\r\n|<>]/g, " ").slice(0, 160);
const shaPattern = /^[a-f0-9]{40}$/;

export function classify(branch, prs, mainSha) {
  const linked = prs.filter((p) => p.head?.ref === branch.name && p.head?.repo?.full_name === repository);
  const open = linked.filter((p) => p.state === "open");
  if (branch.name === "main" || protectedPrefixes.some((p) => branch.name.startsWith(p))) {
    return { kind: "KEEP", reason: "main or reserved active/source namespace" };
  }
  if (branch.protected) return { kind: "KEEP", reason: "GitHub branch protected" };
  if (open.length) return { kind: "KEEP", reason: "open PR" };
  if (!shaPattern.test(branch.commit?.sha ?? "") || !shaPattern.test(mainSha)) {
    return { kind: "UNKNOWN", reason: "missing exact SHAs" };
  }
  if (!linked.length) return { kind: "REVIEW", reason: "no matching PR: investigate unique source and local dependencies" };
  if (linked.some((p) => !p.merged_at)) {
    return { kind: "REVIEW", reason: "closed unmerged PR: preserve historical source" };
  }
  return { kind: "REVIEW", reason: "merged PR: require local worktree / unique-data guard before cleanup" };
}

export function report(branches, prs, mainSha) {
  const out = [
    "## DoğruAdres — branch lifecycle inventory (READ ONLY)",
    "",
    "No branch, worktree, Docker, backup, git ref or issue was deleted or modified. This inventory is NOT authorization to delete.",
    "",
    "| Remote branch | HEAD | Status | Guard |",
    "|---|---|---|---|",
  ];
  for (const branch of [...branches].sort((a,b)=>a.name.localeCompare(b.name))) {
    const c=classify(branch,prs,mainSha);
    out.push(`| ${safeText(branch.name)} | ${safeText(branch.commit?.sha?.slice(0,12))} | ${c.kind} | ${safeText(c.reason)} |`);
  }
  out.push("", "### Mandatory per-candidate deletion gates");
  out.push("1. Local Agent must independently inspect EVERY Git common-dir and linked worktree, dirty/index/untracked/ignored, stash, reflog, local-only commits, active processes, bind mounts, backups and realpath/junctions. Remote GitHub data cannot prove local safety.");
  out.push("2. Verify a separate recoverable immutable snapshot/tag/bundle for all unique Git data; evidence files and any secrets stay private. Do not remove sole copies of project data.");
  out.push("3. Recheck exact remote HEAD immediately before every proposed branch delete and all local usage; any mismatch => BLOCKED.");
  out.push("4. #229 unresolved restoration/database volume uncertainty => ALL local or Docker destructive cleanup BLOCKED.");
  out.push("5. This job has contents:read only and NO delete call. Executing a delete requires distinct manual gated operator and separate applicable authorization.");
  out.push("", `Generated using current live main HEAD ${mainSha}. This report is status-only, not product acceptance or a security approval.`);
  return out.join("\n");
}

async function main() {
  const token=process.env.GITHUB_TOKEN;
  if (!token || process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("Trusted main-only read boundary unavailable");
  }
  const api=async (path)=>{
    const response=await fetch("https://api.github.com/repos/"+repository+path,{
      headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28"}
    });
    if(!response.ok)throw new Error("GitHub status "+response.status);
    return response.json();
  };
  async function pages(path) {
    const result=[];
    for(let page=1;page<=20;page++){
      const batch=await api(path+(path.includes("?")?"&":"?")+"per_page=100&page="+page);
      if(!Array.isArray(batch)||batch.length>100)throw new Error("Unexpected API page");
      result.push(...batch);
      if(batch.length<100)return result;
    }
    throw new Error("Page limit, no potentially incomplete inventory emitted");
  }
  const [mainBranch,branches,prs]=await Promise.all([
    api("/branches/main"), pages("/branches"), pages("/pulls?state=all")
  ]);
  const body=report(branches,prs,mainBranch.commit.sha);
  if(!process.env.GITHUB_STEP_SUMMARY)throw new Error("Missing GitHub summary path");
  await appendFile(process.env.GITHUB_STEP_SUMMARY,body+"\n");
  console.log("Read-only lifecycle inventory complete: "+branches.length+" branches; digest "+
    createHash("sha256").update(body).digest("hex").slice(0,16));
}
if(process.argv[1]?.endsWith("/branch-lifecycle.mjs")) main().catch(e=>{console.error(e.message);process.exitCode=1});
