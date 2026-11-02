/** Publication is integrity evidence, NOT authority. Authority remains the existing
 * canonical PO/TA records and source-pinned signer/resources. No local file/env/root.
 * The TA explicitly allows the minimal executor adaptation + NEW exact-SHA manifest.
 */
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {computeSha256Digest as hash} from './operator-audit-protocol'
import {R1_SIGNER_SCOPE_REVIEW} from './r1-signer-scope'
const exec=promisify(execFile),api='https://api.github.com/repos/DenizOner/DogruAdres'
const records=Object.freeze([
 {id:6366377036,digest:'b1ac51d0c476ffeb5fa4ee7266999cca0f2c53f1b5e70ce4130e5f9d14940c2e',issue:238},
 {id:6365364648,digest:'26d400ce33d11be28ded163cc9e6472676461966f2f23fd25dd2733781d9421e',issue:230},
])
async function get(url:string){
 const response=await fetch(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'DogruAdres-R1-native-preflight'},redirect:'error',signal:AbortSignal.timeout(15000)})
 if(!response.ok)throw Error('REFUSED: canonical GitHub verification unavailable')
 return response.json() as Promise<any>
}
export async function assertR1CanonicalPublication(sourceSha:string){
 if(!/^[a-f0-9]{40}$/.test(sourceSha))throw Error('REFUSED: source SHA invalid')
 for(const record of records){const j=await get(api+'/issues/comments/'+record.id)
  if(j.id!==record.id||j.user?.login!=='DenizOner'||j.author_association!=='OWNER'||j.issue_url!==api+'/issues/'+record.issue||hash(j.body)!==record.digest)throw Error('REFUSED: independent R1 canonical decision changed/substituted')
 }
 const pr=await get(api+'/pulls/227')
 if(pr.state!=='open'||pr.draft!==true||pr.head?.sha!==sourceSha||pr.head?.ref!=='feature/m0-identity-session-ingress-vertical'||pr.base?.sha!=='d1ac132f41a15d2894d3bebae982f2eb2fc15ca3')throw Error('REFUSED: R1 published PR source/base mismatch')
 const runs=await get(api+'/actions/runs?head_sha='+sourceSha+'&event=pull_request&per_page=30')
 if(!runs.workflow_runs?.some((r:any)=>r.head_sha===sourceSha&&r.path==='.github/workflows/identity-organization-foundation.yml'&&r.status==='completed'&&r.conclusion==='success'&&r.pull_requests?.some((p:any)=>p.number===227)))throw Error('REFUSED: exact-source R1 CI is not successful')
 await exec('git',['merge-base','--is-ancestor',R1_SIGNER_SCOPE_REVIEW.reviewedSourceSha,sourceSha])
 const remote=(await exec('git',['ls-remote','origin','refs/heads/feature/m0-identity-session-ingress-vertical'])).stdout.trim().split(/\s+/)[0]
 if(remote!==sourceSha)throw Error('REFUSED: remote SHA differs from R1 signed source')
}