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
   expect(html).toContain('<option value="member">Üye</option>')
   expect(html).toContain('<option value="admin">Yönetici</option>')
   expect(html).toContain('const role=inviteData.get(\'role\')')
   expect(html).not.toMatch(/localStorage|sessionStorage|console\.log/)
   const code=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).join('\n')
   expect(()=>new Function(code)).not.toThrow()
   expect(code).not.toContain("'+(data.secret||data.otpauth_url)")
 })
 it('conceals the prior actor on both successful and uncertain logout',async()=>{
   const res:any={setHeader:jest.fn(),type:jest.fn().mockReturnThis(),send:jest.fn()};
   (enabled as jest.Mock).mockReturnValue(true);
   await GET({} as any,res);
   const html=res.send.mock.calls[0][0] as string;
   const code=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).join('\n')
   const logoutStart=code.indexOf('async function logout(all){');
   const logoutEnd=logoutStart>=0?code.indexOf('\n  }',logoutStart):-1;
   const logoutSource=logoutStart>=0&&logoutEnd>logoutStart?code.slice(logoutStart,logoutEnd+4):'';
   expect(logoutSource).not.toBe('');
   expect(code).toContain("for(const form of el('workspace').querySelectorAll('form'))form.reset()");
   const makeLogout=(api:any,conceal:any,history:any,load:any,status:any)=>
     new Function('api','concealPrivateView','history','load','status',logoutSource+';return logout')(api,conceal,history,load,status) as (all:boolean)=>Promise<void>;
   const sequence:string[]=[];
   const api=jest.fn(async()=>{sequence.push('request')});
   const conceal=jest.fn(()=>sequence.push('conceal'));
   const history={replaceState:jest.fn(()=>sequence.push('history'))};
   const load=jest.fn(async()=>{sequence.push('load')});
   const status=jest.fn(()=>sequence.push('status'));
   await makeLogout(api,conceal,history,load,status)(true);
   expect(api).toHaveBeenCalledWith('session?all=true',{method:'DELETE'});
   expect(history.replaceState).toHaveBeenCalledWith(null,'','/personal');
   expect(sequence).toEqual(['request','conceal','history','load']);
   sequence.length=0;api.mockClear();conceal.mockClear();load.mockClear();status.mockClear();
   api.mockImplementationOnce(async()=>{sequence.push('request');throw new Error('network')});
   await makeLogout(api,conceal,history,load,status)(false);
   expect(api).toHaveBeenCalledWith('session',{method:'DELETE'});
   expect(sequence).toEqual(['request','conceal','history','status']);
   expect(load).not.toHaveBeenCalled();
   expect(status).toHaveBeenCalledWith(expect.stringContaining('Çıkış doğrulanamadı'));
 })
 it('renders a current-session lock without treating uncertain responses as successful',async()=>{
   const res:any={setHeader:jest.fn(),type:jest.fn().mockReturnThis(),send:jest.fn()};
   (enabled as jest.Mock).mockReturnValue(true);
   await GET({} as any,res);
   const html=res.send.mock.calls[0][0] as string;
   expect(html).toContain('<header id="personal-header">');
   expect(html).toContain('id="session-lock" type="button" hidden');
   expect(html).toContain("el('session-lock').onclick=lockCurrentSession");
   expect(html).toContain("method:'DELETE',credentials:'same-origin'");
   expect(html).toContain("'x-csrf-token':requestCsrf");
   expect(html).toContain('locked=result&&result.success===true');
   expect(html).toContain('Kilitleme doğrulanamadı.');
   expect(html).toContain('id="notification-bell"');
   expect(html).toContain('aria-controls="notification-panel"');
   expect(html).toContain("fetch('/personal/session?action=lock'");
 })

})