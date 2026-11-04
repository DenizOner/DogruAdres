import {B06Chrome,classifyRequestSessionHeaders} from "../../../integration-tests/postgres/b06-ui-browser"
import {createHash} from "node:crypto"
import taskMfaBootstrap from "../task-mfa-bootstrap"
import {assertSessionProvenance} from "../native-fixture-runtime"
import {assertDockerResourceMatchesBinding, type ApprovedRuntimeResourceBinding} from "../native-runtime-adapters"
describe("native fixture pool provenance",()=>{
  const connection={}
  it("accepts only the actual pool connection and backend birth identity",()=>{
    expect(()=>assertSessionProvenance([{pid:12,started:"birth"}],[{pid:12,started:"birth",connection}])).not.toThrow()
  })
  it.each([[13,"birth"],[12,"reused-pid"]])("rejects foreign or recycled backends",(pid,started)=>{
    expect(()=>assertSessionProvenance([{pid:Number(pid),started:String(started)}],[{pid:12,started:"birth",connection}])).toThrow(/Foreign/)
  })
  it("rejects untracked backends even if a caller knows their PID",()=>{
    expect(()=>assertSessionProvenance([{pid:12,started:"birth"}],[])).toThrow(/Foreign/)
  })
})
describe("direct entry initialization order",()=>{
  it("cannot initialize native modules before required controller inputs",async()=>{
    const previous=process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    let initialized=false
    try{
      await expect(taskMfaBootstrap({container:undefined as any,args:[]},async()=>{
        initialized=true
        throw Error("unsafe initialization")
      })).rejects.toThrow(/DATABASE_URL is missing/)
      expect(initialized).toBe(false)
    }finally{if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous}
  })
})

describe("independently approved Docker mount boundary", () => {
  const expected: ApprovedRuntimeResourceBinding = {
    containerId: "a".repeat(64), imageId: "sha256:" + "b".repeat(64),
    composeProject: "isolated", volumeName: "approved-data",
    volumeMountSource: "/var/lib/docker/volumes/approved-data/_data",
    volumeMountDestination: "/var/lib/postgresql/data",
    loopbackHostPort: "15432", postgresSystemIdentifier: "12345678901234567890",
  }
  const actual = {
    Id: expected.containerId, Image: expected.imageId,
    State: { Running: true },
    Config: { Labels: { "com.docker.compose.project": expected.composeProject } },
    HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: expected.loopbackHostPort }] } },
    Mounts: [{ Type: "volume", Name: expected.volumeName,
      Source: expected.volumeMountSource, Destination: expected.volumeMountDestination }],
  }
  it("accepts the exact approved single-volume binding", () => {
    expect(() => assertDockerResourceMatchesBinding(actual, expected)).not.toThrow()
  })
  it("rejects an extra unapproved mounted volume", () => {
    const extra = { ...actual, Mounts: [...actual.Mounts,
      { Type: "volume", Name: "unapproved", Source: "/tmp/unapproved", Destination: "/other" }] }
    expect(() => assertDockerResourceMatchesBinding(extra, expected)).toThrow(/REFUSED/)
  })
  it("rejects a replacement volume and non-loopback binding", () => {
    const replaced = { ...actual, Mounts: [{ ...actual.Mounts[0], Name: "wrong" }] }
    const exposed = { ...actual, HostConfig: { PortBindings: {
      "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: expected.loopbackHostPort }],
    } } }
    expect(() => assertDockerResourceMatchesBinding(replaced, expected)).toThrow(/REFUSED/)
    expect(() => assertDockerResourceMatchesBinding(exposed, expected)).toThrow(/REFUSED/)
  })
})

describe("B22 MFA request diagnostic header parsing",()=>{
  // Purely synthetic CDP header data: no live session, cookie or Personal data.
  const token=Buffer.alloc(32,23).toString("base64url")
  const expectedDigest=createHash("sha256").update(token).digest("hex")
  it.each(["CoOkIe","COOKIE","Cookie","cookie"])(
    "recognizes %s and mixed-case observer headers without retaining cookie values",key=>{
      const result=classifyRequestSessionHeaders({[key]:`other=x; da_session=${token}; flag=1`,
        "X-Da-Observe":"1"})
      expect(result).toEqual({digest:expectedDigest,observer:true})
      expect(JSON.stringify(result)).not.toContain(token)
    })
  it("marks normal GET without observer and missing cookie as unknown session",()=>{
    expect(classifyRequestSessionHeaders({Cookie:`da_session=${token}`,Accept:"*/*"}))
      .toEqual({digest:expectedDigest,observer:false})
    expect(classifyRequestSessionHeaders({"X-Da-Observe":"1"}))
      .toEqual({digest:null,observer:true})
    expect(classifyRequestSessionHeaders(undefined)).toEqual({digest:null,observer:null})
  })
  it("never turns ambiguous duplicate headers, malformed tokens or unknown observer into a known session",()=>{
    expect(classifyRequestSessionHeaders({Cookie:`da_session=${token}`,cOOkie:"da_session=bogus",
      "x-da-observe":"1","X-Da-Observe":"0"}))
      .toEqual({digest:null,observer:null})
    expect(classifyRequestSessionHeaders({COOKIE:"da_session=invalid","X-Da-Observe":"0"}))
      .toEqual({digest:null,observer:null})
    expect(classifyRequestSessionHeaders({Cookie:`da_session=${token}; da_session=${token}`}))
      .toEqual({digest:null,observer:false})
  })
  it("correlates only the matching request ID, respects opt-in and bounds eviction without logging secrets",async()=>{
    const browser=new B06Chrome("https://127.0.0.1:19444","A")
    try{
      browser.recordRequestSessionProof("not-opted-in",{Cookie:`da_session=${token}`})
      expect(browser.requestSessionProof("not-opted-in")).toEqual({digest:null,observer:null})
      browser.captureSessionProof=true
      browser.recordRequestSessionProof("target",{CoOkIe:`da_session=${token}`,
        "X-Da-Observe":"1"})
      expect(browser.requestSessionProof("target")).toEqual({digest:expectedDigest,observer:true})
      expect(browser.requestSessionProof("unrelated")).toEqual({digest:null,observer:null})
      for(let i=0;i<161;i++)browser.recordRequestSessionProof("later-"+i,{Accept:"*/*"})
      expect(browser.requestSessionProof("target")).toEqual({digest:null,observer:null})
      expect(browser.requestSessionProof("later-160")).toEqual({digest:null,observer:false})
      expect(JSON.stringify({http:browser.http,errors:browser.runtimeErrors})).not.toContain(token)
    }finally{await browser.close()}
  })
})

describe("B06 Chrome exception-only privacy evidence",()=>{
  const canary="b22-smtp-"+"a".repeat(48)
  it("detects a secret in Runtime.exceptionThrown even without console/log events",async()=>{
    const browser=new B06Chrome("https://127.0.0.1:19444","A")
    try{
      browser.secretCanary=canary
      browser.recordRuntimeException({exception:{description:"synthetic failure "+canary}})
      expect(browser.secretLeaks).toBe(true)
      expect(browser.runtimeErrors).toEqual(["Runtime.exceptionThrown"])
      expect(JSON.stringify({errors:browser.runtimeErrors})).not.toContain(canary)
    }finally{await browser.close()}
  })
  it("never retains unrelated private exception details in uploadable evidence",async()=>{
    const browser=new B06Chrome("https://127.0.0.1:19444","B")
    const privateToken="synthetic-private-token-do-not-publish"
    const privatePerson="synthetic.person@example.invalid"
    try{
      for(let i=0;i<40;i++)browser.recordRuntimeException({
        text:privatePerson,exception:{description:privateToken,stackTrace:{callFrames:[{url:privatePerson}]}}
      })
      const evidence=JSON.stringify({runtimeErrors:browser.runtimeErrors})
      expect(browser.runtimeErrors).toHaveLength(8)
      expect(browser.runtimeErrors.every(x=>x==="Runtime.exceptionThrown")).toBe(true)
      expect(evidence).not.toContain(privateToken)
      expect(evidence).not.toContain(privatePerson)
    }finally{await browser.close()}
  })
  it("continues canary detection after the diagnostic event limit",async()=>{
    const browser=new B06Chrome("https://127.0.0.1:19444","A")
    try{
      browser.secretCanary=canary
      for(let i=0;i<12;i++)browser.recordRuntimeException({text:"synthetic safe"})
      browser.recordRuntimeException({exception:{stackTrace:{callFrames:[{url:"synthetic "+canary}]}}})
      expect(browser.secretLeaks).toBe(true)
      expect(browser.runtimeErrors).toHaveLength(8)
      expect(JSON.stringify(browser.runtimeErrors)).not.toContain(canary)
    }finally{await browser.close()}
  })
})
