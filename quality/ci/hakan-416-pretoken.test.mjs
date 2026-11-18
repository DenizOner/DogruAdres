import test from 'node:test';
import assert from 'node:assert/strict';
import { guard, TARGET } from './hakan-416-pretoken.mjs';
const pr = 435;
const ok = {
  event:'pull_request', action:'ready_for_review', attempt:'1', draft:'false',
  pr:String(pr), baseRepo:TARGET.repository, headRepo:TARGET.repository,
  baseRef:'main', headRef:'test/hakan-416-pretoken-harness-20261118',
  headSha:'a'.repeat(40), baseSha:TARGET.main
};
test('allowed event only', () => assert.equal(guard(ok,pr),true));
for(const [name,delta] of [
  ['opened event',{action:'opened'}], ['synchronize event',{action:'synchronize'}],
  ['fork',{headRepo:'foreign/fork'}], ['retry',{attempt:'2'}],
  ['draft',{draft:'true'}], ['wrong PR',{pr:'433'}],
  ['wrong base',{baseSha:'b'.repeat(40)}], ['wrong branch',{headRef:'main'}],
  ['malformed head SHA',{headSha:'not-a-sha'}], ['wrong permission boundary',{baseRepo:'someone/else'}]
]) test('reject '+name,()=>assert.equal(guard({...ok,...delta},pr),false));
test('reject missing expected PR',()=>assert.equal(guard(ok,undefined),false));
