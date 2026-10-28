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
 it('locks only the current cookie-backed session with immediate concealment and uncertain-failure warning',async()=>{
   const res:any={setHeader:jest.fn(),type:jest.fn().mockReturnThis(),send:jest.fn()};
   (enabled as jest.Mock).mockReturnValue(true);
   await GET({} as any,res);
   const html=res.send.mock.calls[0][0] as string;
   expect(html).toContain('<header id="personal-header">');
   expect(html).toContain('id="session-lock" type="button" hidden');
   const script=[...html.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/g)].map(match=>match[1]).join('\n');
   const start=script.indexOf('async function lockCurrentSession(){');
   const end=start>=0?script.indexOf('\n  }',start):-1;
   const source=start>=0&&end>start?script.slice(start,end+4):'';
   expect(source).not.toBe('');
   const button:any={hidden:false,disabled:false};
   const login:any={hidden:true,reset:jest.fn()};
   const el=jest.fn((id:string)=>id==='session-lock'?button:login);
   const conceal=jest.fn(()=>{button.hidden=true});
   const history={replaceState:jest.fn()};
   const status=jest.fn();
   let resolveResponse:(x:any)=>void=()=>{};
   const fetch=jest.fn(()=>new Promise(r=>{resolveResponse=r}));
   const lock=new Function('csrf','fetch','concealPrivateView','history','el','status',
     source+';return lockCurrentSession')('synthetic-csrf',fetch,conceal,history,el,status) as ()=>Promise<void>;
   const pending=lock();
   expect(conceal).toHaveBeenCalledTimes(1);
   expect(button.hidden).toBe(true);
   expect(login.hidden).toBe(false);
   expect(login.reset).toHaveBeenCalledTimes(1);
   expect(history.replaceState).toHaveBeenCalledWith(null,'','/personal');
   expect(fetch).toHaveBeenCalledWith('/personal/session',{
     method:'DELETE',credentials:'same-origin',
     headers:{'Content-Type':'application/json','x-csrf-token':'synthetic-csrf'}
   });
   resolveResponse({ok:true,json:async()=>({success:true})});
   await pending;
   expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Oturum kilitlendi.'));
   button.hidden=false;button.disabled=false;status.mockClear();
   fetch.mockImplementationOnce(async()=>{throw new Error('network')});
   await lock();
   expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Kilitleme doğrulanamadı'));
   expect(status).not.toHaveBeenCalledWith(expect.stringContaining('Oturum kilitlendi.'));
   expect(fetch).toHaveBeenCalledTimes(2);
 })


})