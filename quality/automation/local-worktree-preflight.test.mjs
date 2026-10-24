import assert from "node:assert/strict";
import test from "node:test";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { classifyLocalEvidence, collectLocalEvidence, main } from "./local-worktree-preflight.mjs";

const clean = { trackedChanges: 0, untracked: 0, ignored: 0,
  stashes: 0, localOnlyCommits: 0, reflogEntries: 0,
  linkedWorktrees: 0, junctionOrSymlink: false };

test("even apparently clean Git evidence NEVER enables deletion", () => {
  const x=classifyLocalEvidence(clean);
  assert.equal(x.deletion,"BLOCKED");
  assert.match(x.reason,/#229 P0/);
  assert.match(x.reason,/processes, Docker binds/);
});
test("every dirty or local unique evidence is blocked",()=>{
  for(const property of ["trackedChanges","untracked","ignored","stashes","localOnlyCommits","reflogEntries","linkedWorktrees"]){
    const x=classifyLocalEvidence({...clean,[property]:1});
    assert.equal(x.deletion,"BLOCKED");
  }
  assert.equal(classifyLocalEvidence({...clean,junctionOrSymlink:true}).deletion,"BLOCKED");
});
test("read-only commands collect redacted metadata; do not inspect secrets or delete",()=>{
  const root=resolve(realpathSync(process.cwd()));
  const calls=[];
  const fake=(target,...args)=>{
    calls.push(args.join(" "));
    if(args[0]==="rev-parse" && args[1]==="--show-toplevel")return root;
    if(args[0]==="rev-parse" && args[1]==="--git-common-dir")return ".git";
    if(args[0]==="rev-parse")return "a".repeat(40);
    if(args[0]==="branch")return "docs/test";
    if(args[0]==="status")return "?? src/private.env\0";
    if(args[0]==="ls-files" && args.includes("--ignored"))return "secret.txt\0";
    if(args[0]==="ls-files")return "src/private.env\0";
    if(args[0]==="stash")return "b".repeat(40);
    if(args[0]==="reflog")return "c".repeat(40);
    if(args[0]==="rev-list")return "2";
    if(args[0]==="worktree" && args[1]==="list")return "worktree "+root+"\nHEAD "+("a".repeat(40))+"\n\0";
    if(args[0]==="worktree" && args[1]==="prune")return "";
    throw Error("Unexpected command");
  };
  const report=collectLocalEvidence(root,fake);
  assert.equal(report.deletion,"BLOCKED");
  assert.equal(report.untracked,1);
  assert.equal(report.ignored,1);
  assert.equal(report.localOnlyCommits,2);
  assert.equal(report.rootMatchesGit,true);
  assert.equal(report.linkedWorktrees,0);
  assert.ok(calls.every(x=>!/^reset|^clean|^push|^fetch|^rebase|^checkout|^worktree remove|^worktree prune --expire/.test(x)));
  const serialized=JSON.stringify(report);
  assert.doesNotMatch(serialized,/private.env|secret.txt/);
  assert.doesNotMatch(serialized,new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
});
test("no implicit root or CLI default; invalid checkout fails closed",()=>{
  assert.throws(()=>main([]),/Usage/);
  assert.throws(()=>collectLocalEvidence(""),/explicit existing/);
  assert.throws(()=>collectLocalEvidence("/nonexistent-branch-cleanup-test-dir"),/ENOENT/);
});
