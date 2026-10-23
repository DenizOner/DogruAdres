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