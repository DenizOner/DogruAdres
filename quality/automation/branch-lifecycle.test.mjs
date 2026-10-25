import assert from "node:assert/strict";
import test from "node:test";
import { classify,report } from "./branch-lifecycle.mjs";
const sha="a".repeat(40),main="b".repeat(40);
const b=(name)=>({name,protected:false,commit:{sha}});
const pr=(name,state="closed",merged_at="2026-10-24T20:00:00Z")=>({head:{ref:name,repo:{full_name:"DenizOner/DogruAdres"}},state,merged_at});
test("main, active namespaces, protected and open PRs are never candidates",()=>{
  assert.equal(classify(b("main"),[],main).kind,"KEEP");
  assert.equal(classify(b("feature/m0-x"),[],main).kind,"KEEP");
  assert.equal(classify({...b("old"),protected:true},[],main).kind,"KEEP");
  assert.equal(classify(b("old"),[pr("old","open",null)],main).kind,"KEEP");
});
test("merged refs are REVIEW not automatic deletion; closed unmerged is REVIEW",()=>{
  assert.equal(classify(b("docs/merged"),[pr("docs/merged")],main).kind,"REVIEW");
  assert.match(classify(b("docs/closed"),[pr("docs/closed","closed",null)],main).reason,/closed unmerged/);
  assert.equal(classify(b("orphan"),[],main).kind,"REVIEW");
});
test("unknown SHA fails closed; report includes explicit no-delete warning",()=>{
  assert.equal(classify({...b("foo"),commit:{sha:"bad"}},[],main).kind,"UNKNOWN");
  const r=report([b("docs/merged")],[pr("docs/merged")],main);
  assert.match(r,/NOT authorization to delete/);
  assert.match(r,/#229 unresolved restoration/);
  assert.doesNotMatch(r,/SAFE TO DELETE|AUTO-DELETE/);
});
