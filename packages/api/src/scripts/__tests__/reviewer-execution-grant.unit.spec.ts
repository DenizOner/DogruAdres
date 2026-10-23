import { generateKeyPairSync, sign } from "node:crypto"
import { canonicalJsonStringify, computeSha256Digest, computePublicKeyFingerprint } from "../operator-audit-protocol"
import { verifyCleanPreconditions } from "../task-mfa-bootstrap"
import {
  verifyReviewerExecutionGrant, INDEPENDENT_REVIEWER_TRUST_ROOT, commissionReviewedRuntime,
  R0D_ACTION_SCOPE, executionResourcesDigest, assertRedisResourceMatchesGrant,
  type ExecutionManifest, type ReviewerGrantBody,
} from "../reviewer-execution-grant"

describe("Independent reviewer execution grant", () => {
  // Ephemeral test keys are NOT production reviewer roots or operator rotation.
  const reviewer = generateKeyPairSync("ed25519"), operator = generateKeyPairSync("ed25519")
  const pem = (k: any) => k.export({type:"spki",format:"pem"}).toString()
  const pub = pem(operator.publicKey), reviewerPub = pem(reviewer.publicKey)
  const root = { reviewerId:"independent-test-reviewer", publicKeyPem:reviewerPub,
    fingerprint:computePublicKeyFingerprint(reviewerPub) }
  const now = "2026-10-23T12:00:00Z", sid = "S-1-5-21-1-2-3-1001", sha = "a".repeat(40)
  const manifest: ExecutionManifest = {
    manifestVersion:"1.1.0",runId:"run",nonce:"b".repeat(64),taskEnvironmentId:"da-r0b-e7a1-env",
    targetDatabase:"da_r0b_e7a1_db",targetHost:"127.0.0.1",targetPort:"55732",
    targetContainerName:"pg",targetVolumeName:"data",targetCommitSha:sha,
    issuedAt:"2026-10-23T11:00:00Z",expiresAt:"2026-10-23T13:00:00Z",
    authorizedOperator:{executorType:"automation_agent",operatorId:"test-operator",windowsSecurityPrincipal:sid,
      approvalReference:"https://github.com/DenizOner/DogruAdres/issues/239#issuecomment-6361512580"},
    worktree:"D:/test",commonGitDirectory:"D:/git/.git",evidenceDirectory:"D:/test/private",actionScope:R0D_ACTION_SCOPE,
    runtimeResourceBinding:{containerId:"c".repeat(64),imageId:"sha256:"+"d".repeat(64),composeProject:"da-r0b-e7a1-env",
      volumeName:"data",volumeMountSource:"/data",volumeMountDestination:"/var/lib/postgresql/data",
      loopbackHostPort:"55732",postgresSystemIdentifier:"7699743845625188386"},
    redisResourceBinding:{name:"redis",id:"e".repeat(64),imageId:"sha256:"+"f".repeat(64),project:"da-r0b-e7a1-env",
      mounts:[{Type:"volume",Name:"redis-data",Source:"/redis",Destination:"/data"}],
      ports:{"6379/tcp":[{HostIp:"127.0.0.1",HostPort:"55779"}]}},
  }
  const digest = (x: unknown) => computeSha256Digest(canonicalJsonStringify(x))
  const op = (m=manifest) => ({manifest:m,signerKeyFingerprint:computePublicKeyFingerprint(pub),
    signatureBase64:sign(null,Buffer.from(canonicalJsonStringify(m)),operator.privateKey).toString("base64")})
  const body: ReviewerGrantBody = {
    grantVersion:"1.0.0",reviewerId:root.reviewerId,sourceSha:sha,
    operatorFingerprint:computePublicKeyFingerprint(pub),operatorPublicKeyPem:pub,windowsSid:sid,
    runId:manifest.runId,nonce:manifest.nonce,manifestDigest:digest(manifest),
    resourcesDigest:executionResourcesDigest(manifest),actionScope:R0D_ACTION_SCOPE,
    notBefore:manifest.issuedAt,expiresAt:manifest.expiresAt,
    reviewReference:"https://github.com/DenizOner/DogruAdres/issues/239#issuecomment-999999",
  }
  const grant = (g=body, key=reviewer.privateKey) => ({grant:g,
    signatureBase64:sign(null,Buffer.from(canonicalJsonStringify(g)),key).toString("base64")})
  const actual = {sourceSha:sha,windowsSid:sid}
  it("accepts only the independent reviewer signature and exact manifest context", () => {
    const result = verifyReviewerExecutionGrant(root,grant(),op(),actual,now)
    expect(result.pin.targetCommitSha).toBe(sha)
    expect(result.pin.runId).toBe(manifest.runId)
  })
  it("does not commission a runtime root from operator evidence or environment flags", async () => {
    expect(INDEPENDENT_REVIEWER_TRUST_ROOT).toBeNull()
    await expect(commissionReviewedRuntime(op(),grant(),"unused")).rejects.toThrow(/root is not commissioned/)
    expect(() => verifyReviewerExecutionGrant(null,grant(),op(),actual,now)).toThrow(/root/)
    expect(() => verifyReviewerExecutionGrant(root,null,op(),actual,now)).toThrow(/missing/)
  })
  it("rejects an operator-signed approval, a substituted root and tampering", () => {
    expect(() => verifyReviewerExecutionGrant(root,grant(body,operator.privateKey),op(),actual,now)).toThrow(/signature/)
    expect(() => verifyReviewerExecutionGrant({reviewerId:root.reviewerId,publicKeyPem:pub,fingerprint:computePublicKeyFingerprint(pub)},grant(body,operator.privateKey),op(),actual,now)).toThrow(/root invalid/)
    expect(() => verifyReviewerExecutionGrant({...root,publicKeyPem:pub},grant(),op(),actual,now)).toThrow(/root invalid/)
    const changed={...grant(),grant:{...body,runId:"tampered"}}
    expect(() => verifyReviewerExecutionGrant(root,changed,op(),actual,now)).toThrow(/signature/)
  })
  it.each(["sourceSha","operatorFingerprint","windowsSid","runId","nonce","manifestDigest","resourcesDigest","reviewerId","reviewReference"])("rejects reviewer-signed mismatched %s", field => {
    const bad={...body,[field]:"substituted"}
    expect(() => verifyReviewerExecutionGrant(root,grant(bad as any),op(),actual,now)).toThrow()
  })
  it.each(["2026-10-23T10:59:59Z","2026-10-23T13:00:00Z","2026-10-23T13:00:01Z","invalid"])("rejects invalid runtime time %s", time => {
    expect(() => verifyReviewerExecutionGrant(root,grant(),op(),actual,time)).toThrow(/validity/)
  })
  it("rejects a changed checkout SHA or SID despite valid signatures", () => {
    expect(() => verifyReviewerExecutionGrant(root,grant(),op(),{...actual,sourceSha:"f".repeat(40)},now)).toThrow(/SHA/)
    expect(() => verifyReviewerExecutionGrant(root,grant(),op(),{...actual,windowsSid:sid+"2"},now)).toThrow(/SID/)
  })
  it("rejects re-signed operator manifest/resource changes under an older grant", () => {
    for(const m of [{...manifest,nonce:"c".repeat(64)},{...manifest,evidenceDirectory:"D:/substituted-nonce-store"},
      {...manifest,runtimeResourceBinding:{...manifest.runtimeResourceBinding,postgresSystemIdentifier:"1234567890123456789"}},
      {...manifest,redisResourceBinding:{...manifest.redisResourceBinding,id:"0".repeat(64)}}]) {
      expect(() => verifyReviewerExecutionGrant(root,grant(),op(m),actual,now)).toThrow(/binding/)
    }
  })
  it("rejects invalid operator signatures and reviewer-approved scope expansion", () => {
    expect(() => verifyReviewerExecutionGrant(root,grant(),{...op(),signatureBase64:"invalid"},actual,now)).toThrow()
    const m={...manifest,actionScope:{...R0D_ACTION_SCOPE,r1:true}} as any
    const g={...body,actionScope:m.actionScope,manifestDigest:digest(m)}
    expect(() => verifyReviewerExecutionGrant(root,grant(g),op(m),actual,now)).toThrow(/scope/)
  })
  it("rejects an independently signed but internally inconsistent connection port", () => {
    const m={...manifest,targetPort:"55733"}
    const g={...body,manifestDigest:digest(m)}
    expect(() => verifyReviewerExecutionGrant(root,grant(g),op(m),actual,now)).toThrow(/inconsistent/)
  })
  it("rejects relative nonce/evidence paths even with reviewer signature", () => {
    const m={...manifest,evidenceDirectory:"relative-store"}
    const g={...body,manifestDigest:digest(m)}
    expect(() => verifyReviewerExecutionGrant(root,grant(g),op(m),actual,now)).toThrow(/absolute Windows paths/)
  })
  it("binds Redis full identity, mounts and loopback ports", () => {
    const r=manifest.redisResourceBinding
    const a={Id:r.id,Image:r.imageId,State:{Running:true},Config:{Labels:{"com.docker.compose.project":r.project}},
      Mounts:r.mounts,HostConfig:{PortBindings:r.ports}}
    expect(() => assertRedisResourceMatchesGrant(a,r)).not.toThrow()
    for(const bad of [{...a,Id:"0".repeat(64)},{...a,Mounts:[]},
      {...a,HostConfig:{PortBindings:{"6379/tcp":[{HostIp:"0.0.0.0",HostPort:"55779"}]}}}]) {
      expect(() => assertRedisResourceMatchesGrant(bad,r)).toThrow(/Redis/)
    }
  })
  it("refuses an active latch or missing migration/trigger preconditions before identities", async () => {
    const safe={migrations:234,policies:1,activated:false,factors:0,recovery:0,guards:2}
    for(const changed of [{activated:true},{guards:1},{migrations:233},{factors:1},{recovery:1}]) {
      const query=jest.fn().mockResolvedValue({rows:[{...safe,...changed}]})
      await expect(verifyCleanPreconditions({query} as any)).rejects.toThrow(/preconditions/)
      expect(query).toHaveBeenCalledTimes(1)
    }
  })
})