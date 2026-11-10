import {GET} from "../route"
import {enabled} from "../security"
import {trustedInlineScripts} from "./trusted-inline-scripts"

jest.mock("../security",()=>({enabled:jest.fn(()=>true)}))

describe("B22 shipped Staff name-transfer Unicode decision guard",()=>{
  it("counts real Unicode letters and numbers after HTML template rendering",async()=>{
    (enabled as jest.Mock).mockReturnValue(true)
    const res:any={setHeader:jest.fn(),type:jest.fn().mockReturnThis(),
      send:jest.fn()}
    await GET({} as any,res)
    const html=res.send.mock.calls[0][0] as string
    const script=trustedInlineScripts(html).join("\n")
    const match=script.match(/explanation\.matchAll\((\/\[[^\]]+\]\/gu)\)/)
    expect(match).not.toBeNull()
    const count=new Function("explanation",
      "return [...explanation.matchAll("+match![1]+")].length"
    ) as (text:string)=>number
    expect(count("Verified exceptional platform decision for the Store name right"))
      .toBeGreaterThanOrEqual(10)
    expect(count("Türkçe Çalışma Üzerinde İstisnai Karar 123"))
      .toBeGreaterThanOrEqual(10)
    expect(count("!@#$%^&*()_+")).toBe(0)
  })
})
