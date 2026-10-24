import taskMfaBootstrap from "../task-mfa-bootstrap"
import {assertSessionProvenance} from "../native-fixture-runtime"
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