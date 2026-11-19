import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessReviewEvidence, allPages, auditLive } from './review-freshness-audit.mjs'
const h='a'.repeat(40), b='b'.repeat(40), old='c'.repeat(40)
const pr={number:418,state:'open',draft:false,head:{sha:h},base:{sha:b}}
const comment=(type,head=h,base=b,id=type==='REVIEW-REQUEST'?2:3)=>({id,body:`<!-- DA-${type}-v2 -->\n## PR #418\n**Exact HEAD:** \`${head}\`; **exact base:** \`${base}\`\nKARAR: PASS (SCOPED)`})
const rv=(head=h,base=b)=>({commit_id:head,body:`<!-- REVIEW-PROVENANCE-v1 -->\nExact HEAD: \`${head}\`\nbase: \`${base}\``})
const check=(overrides={})=>assessReviewEvidence({pr,mainSha:b,queueComments:[comment('REVIEW-REQUEST'),comment('REVIEW-RESULT')],reviews:[rv()],...overrides})
test('same metadata returns only RECORDED, never independent PASS or merge permission',()=>{const x=check();assert.equal(x.state,'RECORDED');assert.equal(x.disposition,'REPORTED_PASS');assert.equal(x.independentIdentity,'UNVERIFIED');assert.equal(x.mergePermitted,false);assert.equal(x.ci,'NOT_CHECKED')})
test('main drift is STALE even with current-looking request',()=>assert.equal(check({mainSha:old}).state,'STALE'))
test('old HEAD or base request is STALE',()=>assert.equal(check({queueComments:[comment('REVIEW-REQUEST',old),comment('REVIEW-RESULT')]}).state,'STALE'))
test('missing ready record reports MISSING',()=>assert.equal(check({queueComments:[]}).state,'MISSING'))
test('current ready with no result reports PENDING',()=>assert.equal(check({queueComments:[comment('REVIEW-REQUEST')]}).state,'PENDING'))
test('result without GitHub review provenance is UNVERIFIED',()=>assert.equal(check({reviews:[]}).state,'UNVERIFIED'))
test('old review commit does not qualify',()=>assert.equal(check({reviews:[rv(old)]}).state,'UNVERIFIED'))
test('review body with wrong base does not qualify',()=>assert.equal(check({reviews:[rv(h,old)]}).state,'UNVERIFIED'))
test('draft PR is NOT_READY',()=>assert.equal(check({pr:{...pr,draft:true}}).state,'NOT_READY'))
test('invalid evidence fails closed',()=>assert.equal(check({pr:{...pr,head:{sha:'bad'}}}).state,'UNKNOWN'))
test('unrelated PR record does not count',()=>assert.equal(check({queueComments:[{body:'<!-- DA-REVIEW-REQUEST-v2 --> PR #419'},comment('REVIEW-RESULT')]}).state,'MISSING'))
test('pagination includes full pages',async()=>{let pages=0;const fetcher=async()=>({ok:true,json:async()=>++pages===1?Array.from({length:100},()=>({})):Array.from({length:2},()=>({}))});assert.equal((await allPages({fetcher,path:'/p',token:'x'})).length,102)})
test('pagination errors fail closed',async()=>{await assert.rejects(allPages({fetcher:async()=>({ok:false,status:403}),path:'/p',token:'x'}),/HTTP 403/)})
test('pagination never silently truncates',async()=>{await assert.rejects(allPages({fetcher:async()=>({ok:true,json:async()=>Array.from({length:100},()=>({}))}),path:'/p',token:'x',maxPages:2}),/Truncated/)})
test('live snapshot main drift fails closed',async()=>{let ref=0;const fetcher=async u=>({ok:true,json:async()=>u.includes('/git/ref/')?{object:{sha:++ref===1?b:old}}:u.includes('/pulls/418/reviews')?[]:u.includes('/pulls/418')?pr:[]});const out=await auditLive({owner:'DenizOner',repo:'DogruAdres',prNumber:418,token:'dummy',fetcher});assert.equal(out.state,'UNKNOWN');assert.equal(out.reason,'main_changed_during_snapshot')})
test('reported PASS ignores failure-related narrative and is never a verified verdict',()=>{const result=comment('REVIEW-RESULT');result.body='<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #418 — PASS (SCOPED)\nExact HEAD: `'+h+'`\nbase: `'+b+'`\nNotes: previous FAIL and BLOCKED history';const x=check({queueComments:[comment('REVIEW-REQUEST'),result]});assert.equal(x.disposition,'REPORTED_PASS');assert.equal(x.mergePermitted,false)})
test('top-level PR Conversation provenance is accepted as metadata but never verifies identity',()=>{const x=check({reviews:[],prComments:[{body:rv().body}]});assert.equal(x.state,'RECORDED');assert.equal(x.independentIdentity,'UNVERIFIED');assert.equal(x.mergePermitted,false)})
test('a PR changing during pagination is UNKNOWN',async()=>{let count=0;const fetcher=async u=>({ok:true,json:async()=>u.includes('/git/ref/')?{object:{sha:b}}:u.includes('/pulls/418')&&!u.includes('/reviews')?(++count===1?pr:{...pr,head:{sha:old}}):[]});const x=await auditLive({owner:'DenizOner',repo:'DogruAdres',prNumber:418,token:'dummy',fetcher});assert.equal(x.state,'UNKNOWN');assert.equal(x.reason,'pr_changed_during_snapshot')})
test('unsupported reviewer decision remains unclassified',()=>{const result=comment('REVIEW-RESULT');result.body='<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #418\nExact HEAD: `'+h+'`\nbase: `'+b+'`\nKARAR: CHANGES REQUIRED; old tests PASS';const x=check({queueComments:[comment('REVIEW-REQUEST'),result]});assert.equal(x.disposition,'UNCLASSIFIED')})
test('new READY on same SHA invalidates an older review result until a newer result',()=>{const x=check({queueComments:[comment('REVIEW-REQUEST'),comment('REVIEW-RESULT'),comment('REVIEW-REQUEST',h,b,4)]});assert.equal(x.state,'PENDING')})
test('canonical #216 HEAD/base on a shared line matches READY, result and Review',()=>{
  const realHead='e11bf406afeb00224ce610ea575d900708092c50'
  const realBase='fef2de0173b0e2c3347ed887eedae94bf747fa7c'
  const ready={id:100,body:'<!-- DA-REVIEW-REQUEST-v2 -->\n**DA-REVIEW-REQUEST-v2 — READY / PR #418**\n**Exact HEAD / stored base / canlı main:** `'+realHead+'` / `'+realBase+'` / aynı'}
  const result={id:101,body:'<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #418 — PASS (SCOPED)\n- **Exact PR HEAD / base / kontrol edilen canlı main:** `'+realHead+'` / `'+realBase+'` / aynı'}
  const provenance={commit_id:realHead,body:'<!-- REVIEW-PROVENANCE-v1 -->\n**Exact target:** PR #418, OPEN. HEAD `'+realHead+'`; PR base `'+realBase+'`'}
  const x=check({pr:{...pr,head:{sha:realHead},base:{sha:realBase}},mainSha:realBase,queueComments:[ready,result],reviews:[provenance]})
  assert.equal(x.state,'RECORDED')
  assert.equal(x.disposition,'REPORTED_PASS')
  assert.equal(x.independentIdentity,'UNVERIFIED')
  assert.equal(x.mergePermitted,false)
})
test('combined HEAD/base line with only one SHA is never accepted as a valid base',()=>{
  const onlyHead={id:100,body:'<!-- DA-REVIEW-REQUEST-v2 -->\nPR #418\nExact HEAD / stored base / main: `'+h+'`'}
  assert.equal(check({queueComments:[onlyHead,comment('REVIEW-RESULT')]}).state,'STALE')
})

test('canonical Denetçi RESULT heading #422 is recognized without a PR prefix',()=>{
  const head='03165b3208f33331d9ba8b04ef1ad9562b753d4b', base='13cf9b0379caa3fd9fcd66687386613b51e2b17b'
  const ready={id:100,body:`<!-- DA-REVIEW-REQUEST-v2-422 -->\nREADY for PR #422\nExact HEAD / stored base / main: \`${head}\` / \`${base}\``}
  const result={id:101,body:`<!-- DA-REVIEW-RESULT-v2-DENETCI-422 -->\n## DA-REVIEW-RESULT-v2 — #422 / #216 — BLOCKED\nExact HEAD / PR base / main: \`${head}\` / \`${base}\`\nKARAR: BLOCKED`}
  const review={commit_id:head,body:`<!-- REVIEW-PROVENANCE-v1 -->\nExact HEAD: \`${head}\`\nbase: \`${base}\``}
  const x=check({pr:{...pr,number:422,head:{sha:head},base:{sha:base}},mainSha:base,queueComments:[ready,result],reviews:[review]})
  assert.equal(x.state,'RECORDED')
  assert.equal(x.disposition,'REPORTED_BLOCKED')
  assert.equal(x.resultId,101)
  assert.equal(x.mergePermitted,false)
})
test('unrelated heading #216 / #422 is not assigned to PR #422',()=>{
  const head='03165b3208f33331d9ba8b04ef1ad9562b753d4b', base='13cf9b0379caa3fd9fcd66687386613b51e2b17b'
  const ready={id:100,body:`<!-- DA-REVIEW-REQUEST-v2 -->\nREADY for PR #422\nExact HEAD / stored base / main: \`${head}\` / \`${base}\``}
  const unrelated={id:101,body:`<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — #216 / #422 — PASS\nExact HEAD / PR base / main: \`${head}\` / \`${base}\``}
  const x=check({pr:{...pr,number:422,head:{sha:head},base:{sha:base}},mainSha:base,queueComments:[ready,unrelated],reviews:[]})
  assert.equal(x.state,'PENDING')
  assert.equal(x.mergePermitted,false)
})

test('combined READY with missing base never borrows a following main SHA', () => {
  const ready={id:100,body:'<!-- DA-REVIEW-REQUEST-v2 -->\nPR #418\nExact HEAD / stored base / main: '+h+' / NOT VERIFIED / '+b}
  assert.equal(check({queueComments:[ready,comment('REVIEW-RESULT')]}).state,'STALE')
})
test('combined RESULT with missing base cannot match as a verdict', () => {
  const result={id:101,body:'<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #418 — PASS\nExact HEAD / stored base / main: '+h+' / NOT VERIFIED / '+b}
  assert.equal(check({queueComments:[comment('REVIEW-REQUEST'),result]}).state,'PENDING')
})
test('combined READY with missing HEAD cannot use base and main as the HEAD/base pair', () => {
  const ready={id:100,body:'<!-- DA-REVIEW-REQUEST-v2 -->\nPR #418\nExact HEAD / stored base / main: NOT VERIFIED / '+h+' / '+b}
  assert.equal(check({queueComments:[ready,comment('REVIEW-RESULT')]}).state,'STALE')
})
test('a BLOCKED heading ignores historical PASS in explanatory parentheses', () => {
  const result={id:101,body:'<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #418 — BLOCKED (previous PASS invalidated)\nExact HEAD: '+h+'\nbase: '+b+'\nKARAR: BLOCKED'}
  const x=check({queueComments:[comment('REVIEW-REQUEST'),result]})
  assert.equal(x.state,'RECORDED')
  assert.equal(x.disposition,'REPORTED_BLOCKED')
  assert.equal(x.mergePermitted,false)
})
test('contradictory explicit decision fields remain UNCLASSIFIED', () => {
  const result={id:101,body:'<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #418 — PASS\nExact HEAD: '+h+'\nbase: '+b+'\nKARAR: BLOCKED'}
  const x=check({queueComments:[comment('REVIEW-REQUEST'),result]})
  assert.equal(x.state,'RECORDED')
  assert.equal(x.disposition,'UNCLASSIFIED')
  assert.equal(x.mergePermitted,false)
})

test('colonless explicit HEAD and PR base provenance is accepted', () => {
  const provenance={commit_id:h,body:'<!-- REVIEW-PROVENANCE-v1 -->\n**Exact target:** PR #418, OPEN. HEAD '+h+'; PR base '+b}
  const x=check({reviews:[provenance]})
  assert.equal(x.state,'RECORDED')
  assert.equal(x.disposition,'REPORTED_PASS')
  assert.equal(x.mergePermitted,false)
})
test('colonless missing base cannot borrow a following main SHA', () => {
  const provenance={commit_id:h,body:'<!-- REVIEW-PROVENANCE-v1 -->\nExact target: PR #418. HEAD '+h+'; PR base NOT VERIFIED; main '+b}
  const x=check({reviews:[provenance]})
  assert.equal(x.state,'UNVERIFIED')
  assert.equal(x.mergePermitted,false)
})

test('result targeting PR #419 with related PR #418 cannot override #418 BLOCKED', () => {
  const blocked={id:101,body:'<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #418 — BLOCKED\nExact HEAD: '+h+'\nbase: '+b+'\nKARAR: BLOCKED'}
  const unrelated={id:102,body:'<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #419 — PASS\nRelated: PR #418\nExact HEAD: '+h+'\nbase: '+b+'\nKARAR: PASS'}
  const x=check({queueComments:[comment('REVIEW-REQUEST'),blocked,unrelated]})
  assert.equal(x.state,'RECORDED')
  assert.equal(x.disposition,'REPORTED_BLOCKED')
})
test('a READY for PR #419 mentioning PR #418 is not a #418 READY', () => {
  const unrelated={id:100,body:'<!-- DA-REVIEW-REQUEST-v2 -->\n## DA-REVIEW-REQUEST-v2 — PR #419\nRelated: PR #418\nExact HEAD: '+h+'\nbase: '+b}
  assert.equal(check({queueComments:[unrelated]}).state,'MISSING')
})
test('Markdown-bold KARAR: BLOCKED contradicts PASS heading and is UNCLASSIFIED', () => {
  const result={id:101,body:'<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #418 — PASS\nExact HEAD: '+h+'\nbase: '+b+'\n- **KARAR:** BLOCKED'}
  const x=check({queueComments:[comment('REVIEW-REQUEST'),result]})
  assert.equal(x.state,'RECORDED')
  assert.equal(x.disposition,'UNCLASSIFIED')
  assert.equal(x.mergePermitted,false)
})
test('Markdown-bold SONUÇ: BLOCKED with bold value is parsed explicitly', () => {
  const result={id:101,body:'<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #418\nExact HEAD: '+h+'\nbase: '+b+'\n**SONUÇ:** **BLOCKED**'}
  const x=check({queueComments:[comment('REVIEW-REQUEST'),result]})
  assert.equal(x.disposition,'REPORTED_BLOCKED')
  assert.equal(x.mergePermitted,false)
})

test('PASS heading with unsupported explicit CHANGES REQUIRED is UNCLASSIFIED', () => {
  const result={id:101,body:'<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #418 — PASS\nExact HEAD: '+h+'\nbase: '+b+'\nKARAR: CHANGES REQUIRED'}
  const x=check({queueComments:[comment('REVIEW-REQUEST'),result]})
  assert.equal(x.state,'RECORDED')
  assert.equal(x.disposition,'UNCLASSIFIED')
  assert.equal(x.mergePermitted,false)
})
test('PASS heading cannot override unsupported SONUÇ or bold KARAR', () => {
  for (const field of ['SONUÇ: NEEDS REWORK','- **KARAR:** CHANGES REQUIRED']) {
    const result={id:101,body:'<!-- DA-REVIEW-RESULT-v2 -->\n## DA-REVIEW-RESULT-v2 — PR #418 — PASS\nExact HEAD: '+h+'\nbase: '+b+'\n'+field}
    assert.equal(check({queueComments:[comment('REVIEW-REQUEST'),result]}).disposition,'UNCLASSIFIED')
  }
})
