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
  <style nonce="${nonce}">
  :root{color-scheme:light;--ink:#243247;--muted:#506079;--line:#d6dfea;--accent:#1453a3}
  *{box-sizing:border-box}
  [hidden]{display:none!important}
  body{margin:0;padding:0 1rem 3rem;background:#f6f8fb;color:var(--ink);font:16px/1.5 system-ui,-apple-system,sans-serif}
  body>h1,body>p,body>#status,body>form,body>#workspace{max-width:60rem;margin-left:auto;margin-right:auto}
  body>h1{margin-top:2.5rem;margin-bottom:.1rem;font-size:clamp(1.8rem,4vw,2.5rem)}
  body>p{margin-top:.15rem;color:var(--muted)}
  #status{min-height:2.5rem;margin-top:1rem;margin-bottom:1rem;padding:.65rem 1rem;border-left:3px solid var(--accent);background:#eaf1fa;border-radius:.35rem}
  #login,#challenge{max-width:30rem;margin-top:1.25rem;padding:1.25rem;border:1px solid var(--line);border-radius:1rem;background:white}
  #workspace{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;align-items:start}
  #workspace>h2{grid-column:1/-1;margin:1.5rem 0 0;font-size:1.4rem}
  #workspace>h2+p{grid-column:1/-1;margin:0;color:var(--muted)}
  #workspace>p:first-child,#workspace>#organizations,#workspace>#memberships,#workspace>#bindings,#workspace>#mfa-info{grid-column:1/-1}
  #workspace>:not(h2):not(h2+p){min-width:0}
  #workspace>form,#workspace>div,#workspace>pre,#workspace>p,#workspace>button{margin:0;padding:1rem;border:1px solid var(--line);border-radius:.9rem;background:white}
  form{display:grid;gap:.8rem}
  label{display:grid;gap:.3rem;font-size:.95rem;font-weight:600}
  input,select,button{font:inherit;max-width:100%;border-radius:.5rem}
  input,select{width:100%;min-height:2.75rem;padding:.55rem .7rem;border:1px solid #9aa9bd;background:white;color:var(--ink)}
  button{min-height:2.75rem;padding:.55rem .9rem;border:1px solid #b1c2d8;background:#edf3fb;color:#153f77;cursor:pointer;overflow-wrap:anywhere}
  button:hover:not(:disabled){background:#dfeafa}
  button:disabled{opacity:.58;cursor:not-allowed}
  button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #4c91e5;outline-offset:2px}
  #organizations button,#memberships button,#bindings button{margin:.35rem .4rem .35rem 0}
  #bindings p,#memberships p{overflow-wrap:anywhere;padding:.4rem 0;margin:.3rem 0;border-bottom:1px solid var(--line)}
  pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace}
  #workspace>pre{background:#f0f4fa}
  @media(max-width:700px){body{padding:0 .75rem 2rem}body>h1{margin-top:1.5rem}#workspace{grid-template-columns:minmax(0,1fr)}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
  </style>
  <h1>DoğruAdres</h1><p>Kişisel çalışma alanı</p><p id="status" role="status" aria-live="polite"></p>
  <form id="login"><label>E-posta<input name="email" type="email" autocomplete="username" required></label><label>Parola<input name="password" type="password" autocomplete="current-password" required></label><button>Giriş yap</button></form>
  <form id="challenge" hidden><label>İkinci faktör yöntemi<select name="method">
      <option value="totp">Kimlik doğrulama uygulaması</option>
      <option value="recovery_code">Tek kullanımlık kurtarma kodu</option>
    </select></label><label>Doğrulama veya kurtarma kodu<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="128" required></label>
    <button>İkinci faktörü doğrula</button></form>
  <section id="mfa-enrollment" hidden>
    <h2>MFA ilk kurulumu</h2>
    <p>Kurulum için mevcut hesabınızın parolasını yeniden doğrulayın. Daha önce başlanmış kurulum, aynı kimlik doğrulama uygulamasındaki kodla sürdürülebilir.</p>
    <form id="mfa-enroll-start"><label>Kurulum işlemi<select name="setup_action">
      <option value="start">Yeni TOTP kurulumu</option>
      <option value="resume">Yarım kalan TOTP kurulumuna devam</option>
      <option value="reset_pending">Eski kurulum anahtarımı kaybettim; yalnız bekleyen kurulumu sıfırla</option>
    </select></label><label>E-posta<input name="email" type="email" autocomplete="username" required></label>
      <label>Parolanızı yeniden girin<input name="password" type="password" autocomplete="current-password" required></label>
      <button>Kurulum kodu oluştur</button></form>
    <p id="mfa-enroll-secret" role="status" aria-live="polite"></p>
    <form id="mfa-enroll-verify" hidden><label>Kimlik doğrulama uygulamasındaki 6 haneli kod
      <input name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required></label>
      <button>Kurulumu doğrula ve oturumu aç</button></form>
  </section>
  <section id="workspace" hidden><p id="person"></p>
  <h2>Güvenlik ve MFA ayarları</h2><p id="mfa-info" role="status" aria-live="polite">MFA ayarları henüz etkin değil.</p>
  <button id="mfa-enroll-launch" hidden type="button">TOTP doğrulama uygulamasını kur</button>
  <form id="mfa-person" hidden><label>Kişisel MFA tercihim
    <select name="user_enabled"><option value="false">Kapalı</option><option value="true">Açık</option></select>
  </label><p>Yalnız platformun “Seçime bağlı” modunda değiştirilebilir. Tercih, TOTP faktörünü tek başına kurmaz veya devre dışı bırakmaz.</p><button>Tercihimi kaydet</button></form>
  <form id="mfa-platform" hidden><label>Platform için MFA
    <select name="platform_mode"><option value="required">Herkes için zorunlu</option><option value="optional">Seçime bağlı</option><option value="disabled">Devre dışı</option></select>
  </label><p>Bu işlem yalnız özel platform güvenlik yetkisi ve güncel güçlü doğrulamayla yapılır. Mevcut faktörleri kapatmak ayrıca güvenli geçiş gerektirir.</p><button>Platform politikasını kaydet</button></form>
  <h2>Kuruluşlarım</h2><div id="organizations"></div><form id="select-org"><label>Kuruluş kimliği<input name="organization" required></label><button>Kuruluş erişimini kontrol et</button></form><pre id="detail"></pre><div id="memberships"></div><button id="staff">Platform yetkisini kontrol et</button>
  <h2>Kuruluş oluşturma</h2><p>Bu işlem açık platform görevi ve güncel güçlü doğrulama gerektirir. İlk iki Owner sunucuda doğrulanır.</p>
  <form id="provision"><label>Yeni kuruluş adı<input name="name" maxlength="200" required></label><label>Birinci Owner türü<select name="type1"><option>user</option><option>member</option><option>customer</option></select></label><label>Birinci Owner kimliği<input name="owner1" required></label><label>İkinci Owner türü<select name="type2"><option>user</option><option>member</option><option>customer</option></select></label><label>İkinci Owner kimliği<input name="owner2" required></label><button>Kuruluş oluştur</button></form><pre id="provision-result"></pre>
  <h2>Satıcı ve müşteri çalışma bağlamı</h2><form id="seller"><label>Satıcı kimliği<input name="seller" required></label><button>Satıcı erişimini doğrula</button></form><button id="customer">Müşteri bağlamımı aç</button><pre id="actor-result"></pre>
  <h2>Doğrulanmış hesap bağlantıları</h2><div id="bindings"></div>
  <form id="link-account"><label>Bağlanacak hesap türü<select name="actor_type"><option>member</option><option>customer</option></select></label><label>İkincil hesap e-postası<input name="email" type="email" autocomplete="off" required></label><label>İkincil hesap parolası<input name="password" type="password" autocomplete="off" required></label><button>İkincil hesabı doğrula</button></form>
  <form id="link-confirm" hidden><p>İki hesap sahipliği sunucuda doğrulanır; kuruluş veya platform yetkisi verilmez.</p><label>İkincil hesap TOTP kodu<input name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code"></label><button>Hesap bağlantısını tamamla</button></form>
  <button id="logout">Bu cihazdan çık</button><button id="logout-all">Tüm cihazlardan çık</button></section>
  <script nonce="${nonce}">
  let csrf=''; const el=id=>document.getElementById(id); const status=t=>el('status').textContent=t;
  async function api(path,options={}){let r;try{r=await fetch('/personal/'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json','x-csrf-token':csrf,...options.headers}})}catch{const e=new Error('Sonuç belirsiz. İşlemi yeniden göndermeyin; kayıt kontrolü gerekli.');e.uncertain=true;throw e}const data=await r.json();if(!r.ok){const e=new Error(data.message||'İşlem reddedildi');e.uncertain=r.status>=500;throw e}return data}
  let currentOrg='',linkIntent='',organizationRequest=0,mfaState=null;
  async function refreshMfa(){
    try{
      const data=await api('mfa');
      if(data.runtime_enforcement!=='enforced'&&data.runtime_enforcement!=='not_yet_enabled')throw new Error('MFA çalışma zamanı durumu doğrulanamadı');
      mfaState=data;
      el('mfa-person').hidden=false;el('mfa-platform').hidden=!data.can_manage_platform;
      el('mfa-enroll-launch').hidden=data.platform.platform_mode==='disabled'||data.native_factor_state==='enabled';
      el('mfa-person').elements.user_enabled.value=String(data.personal.user_enabled);
      el('mfa-platform').elements.platform_mode.value=data.platform.platform_mode;
      el('mfa-person').elements.user_enabled.disabled=data.platform.platform_mode!=='optional';
      el('mfa-person').querySelector('button').disabled=data.platform.platform_mode!=='optional';
      const names={required:'Herkes için zorunlu',optional:'Seçime bağlı',disabled:'Devre dışı'};
      const states={enabled:'Etkin native TOTP faktörü var',pending:'TOTP kurulumu doğrulanmamış',not_enrolled:'Etkin TOTP faktörü bulunmuyor'};
      const progress={enroll_mfa:'TOTP kurulumu gerekiyor',verify_mfa:'Native doğrulama gerekli',reconcile_native_factor:'Mevcut TOTP faktörü güvenli biçimde kapatılmadan MFA devre dışı sayılamaz',allow_primary:'İkinci faktör hedef politikada zorunlu değil'};
      const enforcement=data.runtime_enforcement==='enforced'
        ? 'MFA oturum kapsamı denetimi etkin.'
        : 'MFA politikası oturum akışına henüz uygulanmıyor.';
      el('mfa-info').textContent='Platform: '+names[data.platform.platform_mode]+'. '+states[data.native_factor_state]+'. Hedef durum: '+progress[data.effective_mfa_target.next_step]+'. '+enforcement;
    }catch{
      mfaState=null;el('mfa-person').hidden=true;el('mfa-platform').hidden=true;
      el('mfa-enroll-launch').hidden=true;
      el('mfa-info').textContent='MFA ayarları henüz hizmete açılmadı.';
    }
  }
  async function links(){el('bindings').replaceChildren();const data=await api('links');for(const item of data.bindings){const p=document.createElement('p');p.textContent=item.actor_type+' '+item.actor_id+' — '+(item.revoked_at?'revoked':'active');el('bindings').append(p);if(!item.revoked_at){const b=document.createElement('button');b.textContent='Bağı kaldır '+item.id;b.onclick=async()=>{b.disabled=true;try{await api('links',{method:'POST',body:JSON.stringify({action:'unlink',binding_id:item.id})});await links();el('actor-result').textContent='';status('Hesap bağı kaldırıldı')}catch(e){status(e.message);if(!e.uncertain)b.disabled=false}};el('bindings').append(b)}}}
  async function selectOrg(id){
    const request=++organizationRequest;currentOrg='';el('detail').textContent='';el('memberships').replaceChildren();history.replaceState(null,'','/personal');
    try{const result=await api('organizations?id='+encodeURIComponent(id));if(request!==organizationRequest)return;
      currentOrg=id;el('detail').textContent=JSON.stringify(result.organizations[0],null,2);history.replaceState(null,'','/personal?organization='+encodeURIComponent(id));
      await memberships(id,request);if(request===organizationRequest)status('Kuruluş erişimi doğrulandı');
    }catch(e){if(request!==organizationRequest)return;currentOrg='';el('detail').textContent='';el('memberships').replaceChildren();status(e.message)}
  }
  async function memberships(org,request){
    if(request!==organizationRequest)return;el('memberships').replaceChildren();
    try{const data=await api('memberships?organization='+encodeURIComponent(org));if(request!==organizationRequest||currentOrg!==org)return;
      for(const m of data.memberships){const p=document.createElement('p');p.textContent=m.person_id+' — '+m.role+' — '+m.status;el('memberships').append(p);
        if(m.status==='active'){const b=document.createElement('button');b.textContent='Üyeliği iptal et '+m.id;b.onclick=async()=>{
          if(request!==organizationRequest||currentOrg!==org)return;b.disabled=true;
          try{await api('memberships',{method:'POST',body:JSON.stringify({organization_id:org,membership_id:m.id})});if(request!==organizationRequest)return;await selectOrg(org)}
          catch(e){if(request!==organizationRequest)return;status(e.message);if(!e.uncertain)b.disabled=false}
        };el('memberships').append(b)}
      }
    }catch{}
  }
  async function load(){try{const me=await api('session');csrf=me.csrf_token;el('person').textContent='Person: '+me.person_id;const data=await api('organizations');el('organizations').replaceChildren();for(const o of data.organizations){const b=document.createElement('button');b.textContent=o.name+' — '+o.role;b.onclick=()=>selectOrg(o.id);el('organizations').append(b)}el('login').hidden=true;el('workspace').hidden=false;status('Oturum açık');await links();await refreshMfa();const selected=new URLSearchParams(location.search).get('organization');if(selected)await selectOrg(selected)}catch{organizationRequest++;csrf='';currentOrg='';el('login').hidden=false;el('workspace').hidden=true;el('mfa-enrollment').hidden=true;el('mfa-enroll-secret').textContent='';mfaState=null;el('mfa-person').hidden=true;el('mfa-platform').hidden=true;for(const id of ['detail','memberships','organizations','actor-result','provision-result','person','bindings'])el(id).replaceChildren();status('Giriş gerekli')}}
  async function updateMfaForm(form,body){
    const button=form.querySelector('button');button.disabled=true;
    try{
      await api('mfa',{method:'POST',body:JSON.stringify(body)});
      await refreshMfa();status('MFA ayarı kaydedildi. Native faktör ve oturum geçişi ayrıca doğrulanmalıdır.');
    }catch(e){
      status(e.message);await refreshMfa();
      if(e.uncertain){button.disabled=true;status('İşlemin sonucu belirsiz. Yeniden göndermeden önce kayıt kontrolü gerekli.');}
    }
  }
  el('mfa-person').onsubmit=async e=>{
    e.preventDefault();if(!mfaState||mfaState.platform.platform_mode!=='optional')return;
    await updateMfaForm(e.target,{
      action:'personal',user_enabled:new FormData(e.target).get('user_enabled')==='true',
      expected_version:mfaState.personal.version,
    });
  };
  el('mfa-platform').onsubmit=async e=>{
    e.preventDefault();if(!mfaState||!mfaState.can_manage_platform)return;
    await updateMfaForm(e.target,{
      action:'platform',platform_mode:new FormData(e.target).get('platform_mode'),
      expected_version:mfaState.platform.version,
    });
  };
  el('mfa-enroll-launch').onclick=()=>{
    if(!mfaState||mfaState.platform.platform_mode==='disabled'||mfaState.native_factor_state==='enabled')return;
    el('workspace').hidden=true;el('mfa-enrollment').hidden=false;
    el('mfa-enroll-start').hidden=false;el('mfa-enroll-verify').hidden=true;
    el('mfa-enroll-start').reset();el('mfa-enroll-start').querySelector('button').disabled=false;
    el('mfa-enroll-secret').textContent='';
    el('mfa-enroll-start').elements.setup_action.value=mfaState.native_factor_state==='pending'?'resume':'start';
    status('Kuruluma başlamak veya devam etmek için parolanızı yeniden girin.');
  };
  el('mfa-enroll-start').onsubmit=async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{
      const values=Object.fromEntries(new FormData(e.target));
      const action=values.setup_action;
      delete values.setup_action;
      const data=await api('mfa/enroll',{method:'POST',body:JSON.stringify({action,...values})});
      e.target.reset();
      if(data.reset){
        el('mfa-enroll-secret').textContent='';
        el('mfa-enroll-verify').hidden=true;
        button.disabled=false;
        status('Bekleyen TOTP kurulumu sıfırlandı. Yeni kurulum için parolanızı yeniden doğrulayın.');
        return;
      }
      el('mfa-enroll-secret').textContent=data.resumed
        ? 'Önceki kimlik doğrulama uygulamanızdaki kodu girin. Önceki kurulum anahtarı tekrar gösterilemez.'
        : 'Tek seferlik kurulum anahtarı veya bağlantısı: '+(data.secret||data.otpauth_url);
      el('mfa-enroll-verify').hidden=false;
      status('TOTP doğrulaması gerekiyor. İşlemi tamamlamadan yeni yetki verilmez.');
    }catch(err){status(err.message);if(!err.uncertain)button.disabled=false}
  };
  el('mfa-enroll-verify').onsubmit=async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{
      const data=await api('mfa/enroll',{method:'POST',body:JSON.stringify({
        action:'verify',...Object.fromEntries(new FormData(e.target)),
      })});
      csrf=data.csrf_token;
      el('mfa-enroll-secret').textContent='';
      el('mfa-enroll-verify').hidden=true;el('mfa-enrollment').hidden=true;
      e.target.reset();await load();
    }catch(err){status(err.message);if(!err.uncertain)button.disabled=false}
  };
  el('login').onsubmit=async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{
      const data=await api('session',{method:'POST',
        body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});
      csrf=data.csrf_token;e.target.reset();
      if(data.challenge_required){
        el('login').hidden=true;el('challenge').hidden=false;status('İkinci faktör gerekli');
      }else if(data.enrollment_required){
        el('login').hidden=true;el('mfa-enrollment').hidden=false;
        el('mfa-enroll-start').hidden=false;el('mfa-enroll-verify').hidden=true;
        el('mfa-enroll-secret').textContent='';
        el('mfa-enroll-start').reset();el('mfa-enroll-start').querySelector('button').disabled=false;
        status('MFA kurulumuna başlamak veya yarım kalan kuruluma devam etmek için parolanızı yeniden doğrulayın.');
      }else await load();
    }catch(e){status(e.message)}finally{button.disabled=false}
  };
  el('challenge').elements.method.onchange=()=>{
    const recovery=el('challenge').elements.method.value==='recovery_code';
    const field=el('challenge').elements.code;
    field.value='';field.inputMode=recovery?'text':'numeric';
    field.pattern=recovery?'[A-Za-z0-9-]{8,128}':'[0-9]{6}';
    field.autocomplete=recovery?'off':'one-time-code';
  };
  el('challenge').onsubmit=async e=>{e.preventDefault();try{const data=await api('challenge',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});csrf=data.csrf_token;e.target.reset();el('challenge').hidden=true;await load()}catch(e){status(e.message)}};
  el('link-account').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const values=Object.fromEntries(new FormData(e.target));const result=await api('links',{method:'POST',body:JSON.stringify({action:'begin',...values})});linkIntent=result.intent;e.target.reset();el('link-confirm').reset();el('link-confirm').querySelector('button').disabled=false;el('link-confirm').hidden=false;el('link-confirm').elements.code.required=result.challenge_required;status(result.challenge_required?'İkincil hesap için MFA gerekli':'İkincil sahiplik doğrulandı; bağlantıyı tamamlayın')}catch(err){status(err.message)}finally{b.disabled=false}};
  el('link-confirm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const code=new FormData(e.target).get('code');await api('links',{method:'POST',body:JSON.stringify({action:'complete',intent:linkIntent,...(code?{code}:{})})});linkIntent='';e.target.reset();e.target.hidden=true;await links();status('Hesap bağlantısı tamamlandı')}catch(err){status(err.message);if(!err.uncertain)b.disabled=false}};
  el('provision').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button'),v=new FormData(e.target);b.disabled=true;try{const result=await api('platform',{method:'POST',body:JSON.stringify({name:v.get('name'),initial_owners:[{actor_type:v.get('type1'),actor_id:v.get('owner1')},{actor_type:v.get('type2'),actor_id:v.get('owner2')}]})});el('provision-result').textContent=JSON.stringify(result,null,2);status('Kuruluş oluşturuldu');e.target.reset()}catch(err){status(err.message);if(!err.uncertain)b.disabled=false}};
  el('seller').onsubmit=async e=>{e.preventDefault();try{const result=await api('contexts?type=member&seller='+encodeURIComponent(new FormData(e.target).get('seller')));el('actor-result').textContent=JSON.stringify(result,null,2);status('Satıcı erişimi doğrulandı')}catch(e){el('actor-result').textContent='';status(e.message)}};
  el('customer').onclick=async()=>{try{const result=await api('contexts?type=customer');el('actor-result').textContent=JSON.stringify(result,null,2);status('Müşteri bağlamı doğrulandı')}catch(e){el('actor-result').textContent='';status(e.message)}};
  async function logout(all){try{await api('session'+(all?'?all=true':''),{method:'DELETE'});await load()}catch(e){status(e.message)}};
  el('select-org').onsubmit=async e=>{e.preventDefault();await selectOrg(new FormData(e.target).get('organization'))};
  el('logout').onclick=()=>logout(false);el('logout-all').onclick=()=>logout(true);el('staff').onclick=async()=>{try{await api('platform');status('Platform görevi için izin var')}catch(e){status(e.message)}};load();
  </script></html>`)
}
