import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { classifyLocalEvidence, collectLocalEvidence, main, readOnlyGit, readOnlyGitTimeoutMs } from "./local-worktree-preflight.mjs";

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
  assert.throws(()=>collectLocalEvidence("."),/Absolute canonical/);
  assert.throws(()=>collectLocalEvidence("/nonexistent-branch-cleanup-test-dir"),/ENOENT/);
});

test("slow Windows ignored scan gets a bounded read-only 60s budget, all others remain 15s", () => {
  assert.equal(readOnlyGitTimeoutMs(["ls-files","--others","--ignored","--exclude-standard","-z"]), 60_000);
  for (const args of [["status","--porcelain=v1"],["ls-files","--others","-z"],["worktree","prune","--dry-run"]]) {
    assert.equal(readOnlyGitTimeoutMs(args), 15_000);
  }
  assert.equal(classifyLocalEvidence(clean).deletion, "BLOCKED");
});

test("Git stderr is explicitly captured and not inherited by public inventory logs",()=>{
  let options;
  const result=readOnlyGit("/synthetic-private-checkout",["status","--porcelain=v1"],
    (_bin,_args,opts)=>{options=opts;return "  ";});
  assert.equal(result,"");
  assert.deepEqual(options.stdio,["ignore","pipe","pipe"]);
  assert.equal(options.env.GIT_TERMINAL_PROMPT,"0");
});

test("common Git directory digest distinguishes clones and matches linked worktrees",()=>{
  const parent=mkdtempSync(join(tmpdir(),"da-common-git-"));
  try {
    const a=join(parent,"clone-a"),b=join(parent,"clone-b"),linked=join(parent,"linked");
    for(const root of [a,b,linked])mkdirSync(root);
    for(const root of [a,b])mkdirSync(join(root,".git"));
    const fake=(checkout,common)=>(_,...args)=>{
      if(args[0]==="rev-parse"&&args[1]==="--show-toplevel")return checkout;
      if(args[0]==="rev-parse"&&args[1]==="--git-common-dir")return common;
      if(args[0]==="rev-parse"&&args[1]==="HEAD")return "a".repeat(40);
      if(args[0]==="rev-parse")throw Error("Unexpected rev-parse command");
      if(args[0]==="branch")return "synthetic";
      if(args[0]==="rev-list")return "0";
      if(args[0]==="worktree"&&args[1]==="list")return "worktree "+checkout+"\\nHEAD "+"a".repeat(40)+"\\n\\0";
      return "";
    };
    const first=collectLocalEvidence(a,fake(a,".git"));
    const second=collectLocalEvidence(b,fake(b,".git"));
    const worktree=collectLocalEvidence(linked,fake(linked,join(a,".git")));
    assert.notEqual(first.commonDirDigest,second.commonDirDigest);
    assert.equal(first.commonDirDigest,worktree.commonDirDigest);
    for(const result of [first,second,worktree])assert.equal(result.deletion,"BLOCKED");
  }finally{rmSync(parent,{recursive:true,force:true});}
});
