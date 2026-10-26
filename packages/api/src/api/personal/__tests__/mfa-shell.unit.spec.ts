import {GET} from "../route"
import {enabled} from "../security"
jest.mock("../security",()=>({enabled:jest.fn(()=>true)}))
describe('MFA settings shell contract (not browser acceptance)',()=>{
 it('renders accessible controls, masks TOTP and keeps secrets out of storage',async()=>{
   const res:any={setHeader:jest.fn(),type:jest.fn().mockReturnThis(),send:jest.fn()};(enabled as jest.Mock).mockReturnValue(true)
   await GET({} as any,res);const html=res.send.mock.calls[0][0] as string
   expect(html).toContain('role="radiogroup"');expect(html).toContain('role="switch"')
   expect(html).toContain('id="mfa-seed" type="password"');expect(html).toContain('id="mfa-codes-value" hidden')
   for(const name of ['required','optional','disabled'])expect(html).toContain('type="radio" name="platform_mode" value="'+name+'"')
   expect(html).not.toMatch(/localStorage|sessionStorage|console\.log/)
   const code=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).join('\n')
   expect(()=>new Function(code)).not.toThrow()
   expect(code).not.toContain("'+(data.secret||data.otpauth_url)")
 })
})