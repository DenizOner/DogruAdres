import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { randomBytes } from "node:crypto"
import { enabled } from "./security"
export const AUTHENTICATE = false
export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  if (!enabled()) return res.status(503).send("Kişisel çalışma alanı etkin değil")
  const nonce = randomBytes(18).toString("base64")
  res.setHeader("Cache-Control","no-store")
  res.setHeader("X-Content-Type-Options","nosniff")
  res.setHeader("Content-Security-Policy",`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`)
  res.type("html").send(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DoğruAdres kişisel çalışma alanı</title>
  <style nonce="${nonce}">body{font:18px system-ui;max-width:48rem;margin:4rem auto;padding:1rem}label,input,button{display:block;margin:.7rem 0}button{padding:.6rem}#status{min-height:2rem}</style>
  <h1>DoğruAdres</h1><p>Kişisel çalışma alanı</p><p id="status" role="status" aria-live="polite"></p>
  <form id="login"><label>E-posta<input name="email" type="email" autocomplete="username" required></label><label>Parola<input name="password" type="password" autocomplete="current-password" required></label><button>Giriş yap</button></form>
  <form id="challenge" hidden><label>Doğrulama kodu<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></label><button>İkinci faktörü doğrula</button></form>
  <section id="workspace" hidden><p id="person"></p><h2>Kuruluşlarım</h2><div id="organizations"></div><form id="select-org"><label>Kuruluş kimliği<input name="organization" required></label><button>Kuruluş erişimini kontrol et</button></form><pre id="detail"></pre><button id="staff">Platform yetkisini kontrol et</button><button id="logout">Bu cihazdan çık</button><button id="logout-all">Tüm cihazlardan çık</button></section>
  <script nonce="${nonce}">
  let csrf=''; const el=id=>document.getElementById(id); const status=t=>el('status').textContent=t;
  async function api(path,options={}){const r=await fetch('/personal/'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json','x-csrf-token':csrf,...options.headers}});const data=await r.json();if(!r.ok)throw new Error(data.message||'İşlem reddedildi');return data}
  async function load(){try{const me=await api('session');csrf=me.csrf_token;el('person').textContent='Person: '+me.person_id;const data=await api('organizations');el('organizations').replaceChildren();for(const o of data.organizations){const b=document.createElement('button');b.textContent=o.name+' — '+o.role;b.onclick=async()=>{try{const result=await api('organizations?id='+encodeURIComponent(o.id));el('detail').textContent=JSON.stringify(result.organizations[0],null,2);status('Kuruluş erişimi doğrulandı')}catch(e){el('detail').textContent='';status(e.message)}};el('organizations').append(b)}el('login').hidden=true;el('workspace').hidden=false;status('Oturum açık')}catch{csrf='';el('login').hidden=false;el('workspace').hidden=true;el('detail').textContent='';status('Giriş gerekli')}}
  el('login').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const data=await api('session',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});csrf=data.csrf_token;e.target.reset();if(data.challenge_required){el('login').hidden=true;el('challenge').hidden=false;status('İkinci faktör gerekli')}else await load()}catch(e){status(e.message)}finally{button.disabled=false}};
  el('challenge').onsubmit=async e=>{e.preventDefault();try{const data=await api('challenge',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});csrf=data.csrf_token;e.target.reset();el('challenge').hidden=true;await load()}catch(e){status(e.message)}};
  async function logout(all){try{await api('session'+(all?'?all=true':''),{method:'DELETE'});await load()}catch(e){status(e.message)}};
  el('select-org').onsubmit=async e=>{e.preventDefault();try{const data=await api('organizations?id='+encodeURIComponent(new FormData(e.target).get('organization')));el('detail').textContent=JSON.stringify(data.organizations[0],null,2);status('Kuruluş erişimi doğrulandı')}catch(e){el('detail').textContent='';status(e.message)}};
  el('logout').onclick=()=>logout(false);el('logout-all').onclick=()=>logout(true);el('staff').onclick=async()=>{try{await api('platform');status('Platform görevi için izin var')}catch(e){status(e.message)}};load();
  </script></html>`)
}
