import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { randomBytes } from "node:crypto"
import { enabled } from "./security"
// storefrontOrigin from DOGRUADRES_STOREFRONT_URL/STOREFRONT_URL; vendorOrigin from MERCUR_VENDOR_URL
export const AUTHENTICATE = false
export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  if (!enabled()) return res.status(503).send("Kişisel çalışma alanı etkin değil")
  const nonce = randomBytes(18).toString("base64")
  // Resolve Storefront and Vendor URL from trusted process env only.
  // DOGRUADRES_STOREFRONT_URL or STOREFRONT_URL for the real Next.js Buyer Storefront.
  // MERCUR_VENDOR_URL for the Mercur Vendor Panel origin (appended with /seller).
  let storefrontOrigin = ""
  try {
    const rawSf = process.env.DOGRUADRES_STOREFRONT_URL ?? process.env.STOREFRONT_URL
    if (rawSf) { const u = new URL(rawSf); storefrontOrigin = u.origin }
  } catch { /* malformed or unset -- launcher degrades gracefully, no storefront link shown */ }
  let vendorOrigin = ""
  try {
    const rawVn = process.env.MERCUR_VENDOR_URL ?? process.env.DOGRUADRES_VENDOR_URL
    if (rawVn) { const u = new URL(rawVn); vendorOrigin = u.origin }
  } catch { /* malformed or unset -- vendor link omitted gracefully */ }
  res.setHeader("Cache-Control","no-store")
  res.setHeader("Referrer-Policy","no-referrer")
  res.setHeader("X-Content-Type-Options","nosniff")
  res.setHeader("Content-Security-Policy",`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`)
  res.type("html").send(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DoğruAdres kişisel çalışma alanı</title>
  <script nonce="${nonce}">
  // Capture once before any subrequest; retain only in this page's memory.
  let invitationToken=null;
  {const url=new URL(location.href);invitationToken=url.searchParams.get('invitation_token');
   if(url.searchParams.has('invitation_token')){url.searchParams.delete('invitation_token');history.replaceState(null,'',url.pathname+url.search+url.hash);}}
  </script>
  <style nonce="${nonce}">
  :root{color-scheme:light;--ink:#243247;--muted:#506079;--line:#d6dfea;--accent:#1453a3}
  *{box-sizing:border-box}
  [hidden]{display:none!important}
  body{margin:0;padding:0 1rem 3rem;background:#f6f8fb;color:var(--ink);font:16px/1.5 system-ui,-apple-system,sans-serif}
  body>#personal-header,body>p,body>#status,body>form,body>#workspace{max-width:60rem;margin-left:auto;margin-right:auto}
  #personal-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem;margin-top:2.5rem;margin-bottom:.1rem}
  #personal-header h1{margin:0;font-size:clamp(1.8rem,4vw,2.5rem)}
  body>p{margin-top:.15rem;color:var(--muted)}
  #status{min-height:2.5rem;margin-top:1rem;margin-bottom:1rem;padding:.65rem 1rem;border-left:3px solid var(--accent);background:#eaf1fa;border-radius:.35rem}
  #login,#challenge{max-width:30rem;margin-top:1.25rem;padding:1.25rem;border:1px solid var(--line);border-radius:1rem;background:white}
  #notification-panel{max-width:60rem;margin:1rem auto;padding:1rem;border:1px solid var(--line);border-radius:.9rem;background:white}
  #notification-list{padding-left:1.5rem;overflow-wrap:anywhere}
  #notification-list li{margin-bottom:1.5rem}
  #personal-header>div{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:flex-end}
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
   #verification-status{grid-column:1/-1;padding:1rem;border:1px solid var(--line);border-radius:.9rem;background:white}
   #verification-status h2{font-size:1.2rem;margin:0 0 .5rem}
   #verification-status p{margin:.4rem 0;overflow-wrap:anywhere}
  fieldset{border:1px solid var(--line);border-radius:.6rem;padding:1rem} fieldset label{display:flex;align-items:center;gap:.65rem;margin:.5rem 0} input[type=radio],input[type=checkbox]{width:auto;min-height:auto}
  #launcher-list li{display:flex;align-items:center;gap:.5rem;padding:.6rem .8rem;border:1px solid var(--line);border-radius:.6rem;background:white;cursor:default;user-select:none}
  #launcher-list li[aria-grabbed="true"]{opacity:.5;border-style:dashed}
  #launcher-list li.drag-over{border-color:var(--accent);background:#eaf1fa}
  .launcher-handle{touch-action:none;cursor:grab;padding:.2rem .4rem;border:1px solid #c8d4e3;border-radius:.35rem;background:#f0f4fa;font-size:1.1rem;line-height:1;color:var(--muted);flex-shrink:0}
  .launcher-handle:focus{outline:3px solid #4c91e5;outline-offset:2px;cursor:grabbing}
  .launcher-name{flex:1;font-weight:600}
  .launcher-toggle{font-size:.85rem;padding:.3rem .6rem;min-height:auto}
  @media(max-width:700px){body{padding:0 .75rem 2rem}#personal-header{margin-top:1.5rem}#workspace{grid-template-columns:minmax(0,1fr)}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
  </style>
  <header id="personal-header"><h1>DoğruAdres</h1><div><button id="notification-bell" type="button" aria-expanded="false" aria-controls="notification-panel" hidden><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg> Bildirimler <span id="notification-count"></span></button> <button id="session-lock" type="button" hidden>Oturumu kilitle</button></div></header>
  <section id="notification-panel" aria-labelledby="notification-heading" hidden>
    <h2 id="notification-heading">Bildirimler</h2><p>Kişisel hesabınıza ait oturum bildirimleri</p>
    <p id="notification-status" role="status" aria-live="polite"></p>
    <ul id="notification-list"></ul>
    <button id="notification-refresh" type="button">Bildirimleri yenile</button>
    <button id="notification-next" type="button" hidden>Sonraki bildirimler</button>
    <button id="notification-close" type="button">Bildirimleri kapat</button>
  </section><p>Kişisel çalışma alanı</p><p id="status" role="status" aria-live="polite"></p>
  <section id="invitation-section" hidden style="margin-bottom: 24px; padding: 20px; border: 1px solid #c1c6d4; border-radius: 12px; background: #f9f9ff;">
    <h2 style="margin-top: 0; color: #004e99;">Kuruluş Üyelik Daveti</h2>
    <div id="invitation-mismatch-banner" hidden role="alert" style="padding: 14px 18px; background: #ffdad6; border: 1px solid #ba1a1a; border-radius: 8px; margin-bottom: 16px;">
      <p id="invitation-mismatch-text" style="color: #93000a; font-weight: 600; margin: 0; font-size: 14px;">Bu bağlantıyla mevcut oturumda devam edilemiyor. Uygun hesapla giriş yapın veya yeni davet isteyin.</p>
    </div>
    <div id="invitation-card" hidden style="padding: 18px; border: 1px solid #bfd5ff; border-radius: 8px; background: #ffffff;">
      <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #191c21;">DoğruAdres Kuruluş Üyeliği</p>
      <p style="margin: 0 0 16px 0; font-size: 13px; color: #414752;">Size iletilen davet bağlantısı üzerinden kuruluş üyeliğinizi onaylayabilirsiniz. Üyelik işlemi yalnızca davetin tanımlandığı doğrulanmış hesapla tamamlanabilir.</p>
      <button id="accept-invitation-btn" type="button" style="min-height: 44px; padding: 10px 20px; background: #0e66c2; color: #ffffff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Daveti Onayla ve Katıl</button>
      <p id="invitation-result" role="status" aria-live="polite" style="margin-top: 12px; font-size: 13px; font-weight: 500;"></p>
    </div>
  </section>
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
    <p id="mfa-enroll-secret" role="status" aria-live="polite"></p><label id="mfa-seed-region" hidden>Tek seferlik kurulum anahtarı<input id="mfa-seed" type="password" readonly autocomplete="off"><button id="mfa-seed-toggle" type="button">Anahtarı göster veya gizle</button></label>
    <form id="mfa-enroll-verify" hidden><label>Kimlik doğrulama uygulamasındaki 6 haneli kod
      <input name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required></label>
      <button>Kurulumu doğrula ve oturumu aç</button></form>
  </section>
  <section id="workspace" hidden><p id="person"></p>
  <section id="verification-status" aria-labelledby="verification-status-title">
    <h2 id="verification-status-title">Doğrulama durumları</h2>
    <p id="verification-email" role="status" aria-live="polite"></p>
    <p>Gerçek kişi kimliği: Bu çalışma alanında doğrulama durumu sunulmuyor.</p>
    <p>Tüzel kuruluş: Bu çalışma alanında hukuki doğrulama durumu sunulmuyor.</p>
    <p>Mağaza onayı: Doğrulanmış kuruluş–mağaza bağlantısı olmadan onay durumu gösterilmiyor.</p>
    <p>Bu bilgiler kimlik, tüzel kuruluş veya satın alma yetkisi sağlamaz.</p>
  </section>
  <h2>Güvenlik ve MFA ayarları</h2><p id="mfa-info" role="status" aria-live="polite">MFA ayarları henüz etkin değil.</p>
  <button id="mfa-enroll-launch" hidden type="button">TOTP doğrulama uygulamasını kur</button>
  <form id="mfa-person" hidden><label>Kişisel MFA tercihim
    <input name="user_enabled" type="checkbox" role="switch" value="true" aria-describedby="mfa-override">Açık
  </label><p id="mfa-override"></p><p>Yalnız platformun “Seçime bağlı” modunda değiştirilebilir. Tercih, TOTP faktörünü tek başına kurmaz veya devre dışı bırakmaz.</p><button>Tercihimi kaydet</button></form>
  <form id="mfa-platform" hidden><fieldset role="radiogroup"><legend>Platform için MFA</legend><label><input type="radio" name="platform_mode" value="required" required>Herkes için zorunlu</label><label><input type="radio" name="platform_mode" value="optional">Seçime bağlı</label><label><input type="radio" name="platform_mode" value="disabled">Devre dışı</label></fieldset><p>Bu işlem yalnız özel platform güvenlik yetkisi ve güncel güçlü doğrulamayla yapılır. Mevcut faktörleri kapatmak ayrıca güvenli geçiş gerektirir.</p><button>Platform politikasını kaydet</button></form>
  <section id="mfa-management" hidden>
    <h3>Doğrulanmış faktör ve kurtarma</h3>
    <p>Bu işlemler güncel MFA doğrulaması gerektirir. Belirsiz sonuçta yeniden göndermeyin.</p>
    <button id="mfa-recovery" type="button">Yeni kurtarma kodları oluştur</button>
    <section id="mfa-codes" hidden><p>Kodlar yalnız bu yanıtta verilir; yenileri önceki kodları geçersiz kılar. Güvenli bir yerde saklayın.</p><button id="mfa-codes-reveal" type="button">Kodları göster</button><pre id="mfa-codes-value" hidden></pre><button id="mfa-codes-clear" type="button">Bu ekrandan gizle ve sil</button></section>
    <form id="mfa-disable"><p>Platform zorunlu değilse doğrulanmış native kaldırma yapılır ve tüm oturumlar kapanır. Seçime bağlı modda kişisel tercih Kapalı olur; Devre dışı modda saklı tercih korunur.</p>
      <label>Doğrulama yöntemi<select name="method"><option value="totp">TOTP</option><option value="recovery_code">Kurtarma kodu</option></select></label>
      <label>Güncel doğrulama kodu<input name="code" type="password" autocomplete="one-time-code" required maxlength="128"></label><button>Faktörü doğrulayarak kaldır</button>
    </form>
  </section>
  
  <section id="smtp-platform" hidden>
    <h2>Platform SMTP ve Bildirim Ayarları</h2>
    <p id="smtp-status" role="status" aria-live="polite">SMTP yapılandırması yükleniyor...</p>
    <form id="smtp-form">
      <label>SMTP Servis Durumu<input name="enabled" type="checkbox" role="switch" value="true">Etkin</label>
      <label>Sunucu Adresi (Host)<input name="host" required maxlength="255" placeholder="smtp.example.com"></label>
      <label>Port<input name="port" type="number" required min="1" max="65535" value="465"></label>
      <label>Güvenlik Protokolü<select name="security">
        <option value="ssl">SSL / TLS (Port 465)</option>
        <option value="tls">STARTTLS (Port 587)</option>
      </select></label>
      <label>Kullanıcı Adı<input name="username" maxlength="255" autocomplete="off"></label>
      <label>Parola / Uygulama Şifresi<input name="password" type="password" maxlength="512" autocomplete="new-password" placeholder="(Kayıtlı parolayı korumak için boş bırakın)"></label>
      <label>Gönderen E-posta (From Email)<input name="from_email" type="email" required maxlength="255"></label>
      <label>Gönderen Adı (From Name)<input name="from_name" maxlength="255"></label>
      <button>SMTP Ayarlarını Kaydet</button>
    </form>
    <h3>Canlı Bağlantı ve Test E-postası</h3>
    <form id="smtp-test-form">
      <label>Test Alıcısı (Hedef E-posta)<input name="target_recipient" type="email" required maxlength="255" placeholder="alici@dogruadres.net"></label>
      <button>Bağlantıyı ve Gönderimi Test Et</button>
    </form>
    <p id="smtp-test-result" role="status" aria-live="polite"></p>
  </section>
  <h2>Kuruluşlarım</h2><div id="organizations"></div><form id="select-org"><label>Kuruluş kimliği<input name="organization" required></label><button>Kuruluş erişimini kontrol et</button></form><pre id="detail"></pre>
  <p id="memberships-status" role="status" aria-live="polite" aria-atomic="true"></p><button id="memberships-refresh" type="button" hidden disabled>Üye listesini yenile</button>
  <div id="memberships" aria-describedby="memberships-status" aria-busy="false"></div>
  <section id="launcher-section" hidden aria-labelledby="launcher-heading" style="grid-column:1/-1;margin-top:1rem;padding:1rem;border:1px solid var(--line);border-radius:.9rem;background:white">
    <h2 id="launcher-heading">Uygulamalarım</h2>
    <p id="launcher-desc" style="margin:0 0 .5rem;color:var(--muted);font-size:.9rem">Uygulamaları sürükle-bırak veya klavyeyle yeniden sırala. Kapat/Aç düğmesiyle bölümü daralt. Sıralama ve kapat/aç durumu sunucuda kişiye özel saklanır; yeniden girişte de korunur.</p>
    <p id="launcher-status" role="status" aria-live="polite" style="min-height:1.2em;font-size:.9rem;margin:.25rem 0"></p>
    <ul id="launcher-list" role="listbox" aria-label="Uygulama sırası" style="list-style:none;padding:0;margin:.5rem 0;display:flex;flex-direction:column;gap:.5rem"></ul>
    <button id="launcher-reset" type="button" style="margin-top:.5rem">Varsayılan sıraya dön</button>
  </section>
  <section id="audit-timeline-section" hidden style="margin-top: 16px; padding: 14px; border: 1px solid #c1c6d4; border-radius: 8px; background: #f8f9fa;">
    <h3 style="margin-top: 0; font-size: 14px;">Kurulus Denetim Zaman Cizelgesi</h3>
    <p style="font-size: 12px; color: #555; margin-bottom: 8px;">Projeksiyon durumu: Nihai tutarlilik (eventual), tamlik garantilenmemistir (not_guaranteed).</p>
    <div style="margin-bottom: 8px;">
      <button id="audit-timeline-refresh" type="button">Zaman cizelgesini yenile</button>
    </div>
    <p id="audit-timeline-status" role="status" aria-live="polite" style="font-size: 13px; font-weight: 500; margin: 4px 0 8px 0;"></p>
    <div id="audit-timeline-entries"></div>
    <div style="margin-top: 8px;">
      <button id="audit-timeline-next" type="button" hidden>Sonraki sayfa</button>
    </div>
  </section>
  <form id="invite-member" hidden style="margin-top: 16px; padding: 14px; border: 1px solid #c1c6d4; border-radius: 8px; background: #f2f3fb;">
    <h3 style="margin-top: 0; font-size: 14px;">Kuruluşa Yeni Üye Davet Et</h3>
    <label>Davet edilecek e-posta adresi<input name="email" type="email" required maxlength="320" placeholder="yeni.uye@alanadi.invalid"></label>
    <label>Davet edilecek rol<select name="role" required><option value="member">Üye</option><option value="admin">Yönetici</option></select></label>
    <button>Üyelik Daveti Oluştur</button>
  </form>
  <p id="invite-result" role="status" aria-live="polite"></p>
  <section id="pending-invitations-panel" hidden>
    <h3>Bekleyen kuruluş davetleri</h3>
    <p id="pending-invitations-status" role="status" aria-live="polite"></p>
    <div id="pending-invitations"></div>
    <button id="pending-invitations-refresh" type="button">Davetleri yenile</button>
  </section>
  <button id="staff">Platform yetkisini kontrol et</button>
  <h2>Kuruluş oluşturma</h2><p>Bu işlem açık platform görevi ve güncel güçlü doğrulama gerektirir. İlk iki Owner sunucuda doğrulanır.</p>
  <form id="provision"><label>Yeni kuruluş adı<input name="name" maxlength="200" required></label><label>Birinci Owner türü<select name="type1"><option>user</option><option>member</option><option>customer</option></select></label><label>Birinci Owner kimliği<input name="owner1" required></label><label>İkinci Owner türü<select name="type2"><option>user</option><option>member</option><option>customer</option></select></label><label>İkinci Owner kimliği<input name="owner2" required></label><button>Kuruluş oluştur</button></form><pre id="provision-result"></pre>
  <h2>Satıcı ve müşteri çalışma bağlamı</h2><form id="seller"><label>Satıcı kimliği<input name="seller" required></label><button>Satıcı erişimini doğrula</button></form><button id="customer">Müşteri bağlamımı aç</button><pre id="actor-result"></pre>
  <h2>Doğrulanmış hesap bağlantıları</h2><div id="bindings"></div>
  <form id="link-account"><label>Bağlanacak hesap türü<select name="actor_type"><option>member</option><option>customer</option></select></label><label>İkincil hesap e-postası<input name="email" type="email" autocomplete="off" required></label><label>İkincil hesap parolası<input name="password" type="password" autocomplete="off" required></label><button>İkincil hesabı doğrula</button></form>
  <form id="link-confirm" hidden><p>İki hesap sahipliği sunucuda doğrulanır; kuruluş veya platform yetkisi verilmez.</p><label>İkincil hesap TOTP kodu<input name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code"></label><button>Hesap bağlantısını tamamla</button></form>
  <button id="logout">Bu cihazdan çık</button><button id="logout-all">Tüm cihazlardan çık</button></section>
  <script nonce="${nonce}">
  let viewEpoch=0,loadedScope='',observing=false;
  let csrf=''; const el=id=>document.getElementById(id); const status=t=>el('status').textContent=t;
  async function api(path,options={}){const epoch=viewEpoch;let r;try{r=await fetch('/personal/'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json','x-csrf-token':csrf,...options.headers}})}catch{const e=new Error('Sonuç belirsiz. İşlemi yeniden göndermeyin; kayıt kontrolü gerekli.');e.uncertain=true;throw e}const data=await r.json();if(epoch!==viewEpoch)throw new Error('Görünüm yenilendi');if(!r.ok){const e=new Error(data.message||'İşlem reddedildi');e.httpStatus=r.status;e.uncertain=r.status>=500;throw e}return data}
  let recoveryCodes=[];
  let notificationRequest=0,notificationOffset=0,notificationNext=null;
  function clearNotifications(){
    notificationRequest++;notificationOffset=0;notificationNext=null;
    el('notification-bell').hidden=true;el('notification-bell').setAttribute('aria-expanded','false');
    el('notification-panel').hidden=true;el('notification-list').replaceChildren();
    el('notification-count').textContent='';el('notification-status').textContent='';
    el('notification-next').hidden=true;
  }
  async function notifications(offset=0){
    const request=++notificationRequest;
    const organization=new URLSearchParams(location.search).get('organization');
    const notificationPath='notifications'+(organization?'?organization='+encodeURIComponent(organization):'');
    el('notification-list').replaceChildren();el('notification-list').setAttribute('aria-busy','true');
    el('notification-status').textContent='Bildirimler yükleniyor…';el('notification-count').textContent='';
    el('notification-next').hidden=true;
    try{
      const data=await api(notificationPath+(organization?'&':'?')+'offset='+offset);
      if(request!==notificationRequest)return;
      notificationOffset=offset;notificationNext=data.next_offset;
      el('notification-count').textContent='('+data.unread_count+' okunmamış)';
      el('notification-next').hidden=notificationNext===null;
      for(const item of data.notifications){
        const row=document.createElement('li'),heading=document.createElement('h3'),text=document.createElement('p'),time=document.createElement('time'),state=document.createElement('p');
        heading.textContent=item.title;text.textContent=item.context+' — '+item.description;
        time.dateTime=new Date(item.created_at).toISOString();time.textContent=new Date(item.created_at).toLocaleString('tr-TR');
        state.textContent=item.read_at?'Okundu':'Okunmadı';row.append(heading,text,time,state);
        if(!item.read_at){
          const button=document.createElement('button');button.type='button';button.textContent='Okundu işaretle';
          button.setAttribute('aria-label',item.title+' — okundu işaretle');
          button.onclick=async()=>{
            if(request!==notificationRequest)return;button.disabled=true;
            try{
              await api(notificationPath,{method:'POST',body:JSON.stringify({id:item.id})});
              if(request!==notificationRequest)return;
              el('notification-refresh').focus();await notifications(notificationOffset);
            }catch(e){
              if(request!==notificationRequest)return;
              if([401,403].includes(e.httpStatus)){concealPrivateView();el('login').hidden=false;status('Giriş gerekli');return}
              el('notification-status').textContent=e.uncertain?'Okundu sonucu belirsiz. Yenile ile sunucudaki durumu kontrol edin.':'Bildirim güncellenemedi. Yenileyin.';
              // Never automatically resubmit an uncertain mutation.
            }
          };row.append(button);
        }
        el('notification-list').append(row);
      }
      el('notification-status').textContent=data.notifications.length?'Bildirimler güncellendi.':'Henüz bildirim yok.';
    }catch(e){
      if(request!==notificationRequest)return;
      if([401,403].includes(e.httpStatus)){concealPrivateView();el('login').hidden=false;status('Giriş gerekli');return}
      el('notification-status').textContent='Bildirimler yüklenemedi. Yenileyin.';
    }finally{if(request===notificationRequest)el('notification-list').setAttribute('aria-busy','false')}
  }
  function closeNotifications(){el('notification-panel').hidden=true;el('notification-bell').setAttribute('aria-expanded','false');el('notification-bell').focus()}
  el('notification-bell').onclick=()=>{
    if(!el('notification-panel').hidden){closeNotifications();return}
    el('notification-panel').hidden=false;el('notification-bell').setAttribute('aria-expanded','true');void notifications();
  };
  el('notification-refresh').onclick=()=>notifications();
  el('notification-next').onclick=()=>{if(notificationNext!==null)void notifications(notificationNext)};
  el('notification-close').onclick=closeNotifications;
  el('notification-panel').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closeNotifications()}};
  function clearMfaCodes(){recoveryCodes=[];el("mfa-codes-value").textContent="";el("mfa-codes-value").hidden=true;el("mfa-codes").hidden=true}
  let currentOrg='',currentPersonId='',linkIntent='',organizationRequest=0,mfaState=null,timelineCursor=null,timelineOrg='',timelineRequest=0;
  async function loadTimeline(org, cursor = null, append = false) {
    if (!org) return;
    const reqId = ++timelineRequest;
    timelineOrg = org;
    const entriesEl = el('audit-timeline-entries');
    const statusEl = el('audit-timeline-status');
    const nextBtn = el('audit-timeline-next');
    if (!append) {
      entriesEl.replaceChildren();
      statusEl.textContent = 'Denetim kayitlari yukleniyor...';
      nextBtn.hidden = true;
    }
    try {
      const q = new URLSearchParams({ organization: org, limit: '25' });
      if (cursor) q.set('cursor', cursor);
      const data = await api('audit-timeline?' + q.toString());
      if (reqId !== timelineRequest || timelineOrg !== org || currentOrg !== org) return;
      if (!append && (!data.items || data.items.length === 0)) {
        timelineCursor = null;
        entriesEl.replaceChildren();
        statusEl.textContent = 'Henuz indekslenmis denetim kaydi bulunmuyor (nihai tutarlilik/tamlik garantilenmemistir).';
        nextBtn.hidden = true;
        return;
      }
      statusEl.textContent = 'Gosterilen kayit sayisi: ' + (append ? entriesEl.children.length + data.items.length : data.items.length);
      for (const item of data.items) {
        const card = document.createElement('div');
        card.className = 'audit-entry';
        card.style.cssText = 'padding: 6px 10px; margin-bottom: 4px; border: 1px solid #dcdcdc; border-radius: 4px; background: #fff; font-size: 12px; font-family: monospace;';
        card.textContent = item.occurred_at + ' | ' + item.action + ' | Kaynak: ' + item.resource + ' | Hedef: ' + item.target_id + ' | Aktor Person: ' + (item.actor ? item.actor.person_id : '-');
        entriesEl.append(card);
      }
      if (data.page && data.page.has_more && data.page.next_cursor) {
        timelineCursor = data.page.next_cursor;
        nextBtn.hidden = false;
      } else {
        timelineCursor = null;
        nextBtn.hidden = true;
      }
    } catch (err) {
      if (reqId !== timelineRequest || timelineOrg !== org || currentOrg !== org) return;
      nextBtn.hidden = true;
      timelineCursor = null;
      if (err.message === 'Access denied' || err.status === 403) {
        entriesEl.replaceChildren();
        el('audit-timeline-section').hidden = true;
        statusEl.textContent = 'Denetim zaman cizelgesi icin yetki yok (yalnizca Owner ve Admin erisebilir).';
      } else if (err.message === 'Audit timeline unavailable' || err.uncertain || err.status === 503) {
        if (!append) entriesEl.replaceChildren();
        statusEl.textContent = 'Denetim indeksi su anda kullanilamiyor (kesinti/erisilemez). Bu durum kurulusta kayit olmadigi anlamina gelmez.';
      } else {
        if (!append) entriesEl.replaceChildren();
        statusEl.textContent = 'Denetim yukleme hatasi: ' + err.message;
      }
    }
  }
  async function refreshMfa(){
    try{
      const data=await api('mfa');
      if(data.runtime_enforcement!=='enforced'&&data.runtime_enforcement!=='not_yet_enabled')throw new Error('MFA çalışma zamanı durumu doğrulanamadı');
      mfaState=data;
      el('mfa-person').hidden=false;el('mfa-platform').hidden=!data.can_manage_platform;
      el('mfa-enroll-launch').hidden=data.platform.platform_mode==='disabled'||data.native_factor_state==='enabled';
      el('mfa-person').elements.user_enabled.checked=data.personal.user_enabled;
      el('mfa-override').textContent=data.platform.platform_mode==='required'?'Platform tarafından zorunlu':data.platform.platform_mode==='disabled'?'Platform tarafından devre dışı; kişisel tercihiniz korunur':'Kişisel tercihinizi değiştirebilirsiniz';
      el('mfa-management').hidden=data.native_factor_state!=='enabled';el('mfa-disable').hidden=data.platform.platform_mode==='required';
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
      mfaState=null;clearMfaCodes();el('mfa-management').hidden=true;el('mfa-person').hidden=true;el('mfa-platform').hidden=true;smtpSettings=null;el('smtp-platform').hidden=true;
      el('mfa-enroll-launch').hidden=true;
      el('mfa-info').textContent='MFA ayarları henüz hizmete açılmadı.';
    }
  }
  async function links(){el('bindings').replaceChildren();const data=await api('links');for(const item of data.bindings){const p=document.createElement('p');p.textContent=item.actor_type+' '+item.actor_id+' — '+(item.revoked_at?'revoked':'active');el('bindings').append(p);if(!item.revoked_at){const b=document.createElement('button');b.textContent='Bağı kaldır '+item.id;b.onclick=async()=>{b.disabled=true;try{await api('links',{method:'POST',body:JSON.stringify({action:'unlink',binding_id:item.id})});await links();el('actor-result').textContent='';status('Hesap bağı kaldırıldı')}catch(e){status(e.message);if(!e.uncertain)b.disabled=false}};el('bindings').append(b)}}}
  function clearPendingInvitations(){
    el('pending-invitations-panel').hidden=true;
    el('pending-invitations').replaceChildren();
    el('pending-invitations-status').textContent='';
  }
  async function pendingInvitations(org,request){
    if(request!==organizationRequest||currentOrg!==org)return;
    const root=el('pending-invitations');
    root.replaceChildren();
    el('pending-invitations-status').textContent='Davetler yükleniyor…';
    try{
      const data=await api('invitations?organization='+encodeURIComponent(org));
      if(request!==organizationRequest||currentOrg!==org)return;
      if(!Array.isArray(data.invitations))throw new Error('Invalid invitation response');
      for(const invite of data.invitations){
        const p=document.createElement('p');
        p.textContent=invite.recipient_email+' — '+invite.role+' — '+invite.status;
        const button=document.createElement('button');
        button.type='button';
        button.textContent='Daveti iptal et';
        button.onclick=async()=>{
          if(request!==organizationRequest||currentOrg!==org)return;
          button.disabled=true;
          try{
            const outcome=await api('invitations',{method:'POST',body:JSON.stringify({
              action:'revoke',organization_id:org,invitation_id:invite.id
            })});
            if(request!==organizationRequest||currentOrg!==org)return;
            if(outcome.invitation?.id!==invite.id||outcome.invitation?.status!=='revoked')
              throw new Error('Davet durumu doğrulanamadı');
            await pendingInvitations(org,request);
            status('Davet iptal edildi.');
          }catch(e){
            if(request!==organizationRequest||currentOrg!==org)return;
            status(e.uncertain?'Davet sonucu belirsiz. Yenilemeden işlemi tekrar göndermeyin.':e.message);
            if(!e.uncertain)button.disabled=false;
          }
        };
        root.append(p,button);
      }
      el('pending-invitations-status').textContent=data.invitations.length?'Bekleyen davetler güncellendi.':'Bekleyen davet yok.';
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      root.replaceChildren();
      el('pending-invitations-status').textContent='Davetler görüntülenemiyor. Yeniden yükleyin.';
    }
  }
  el('pending-invitations-refresh').onclick=async()=>{
    if(currentOrg)await pendingInvitations(currentOrg,organizationRequest);
  };
  async function selectOrg(id){
    clearNotifications();
    const request=++organizationRequest;currentOrg='';timelineCursor=null;timelineOrg='';++timelineRequest;el('audit-timeline-section').hidden=true;el('audit-timeline-entries').replaceChildren();el('audit-timeline-status').textContent='';el('invite-member').hidden=true;el('invite-result').textContent='';clearPendingInvitations();el('detail').textContent='';clearMemberships();history.replaceState(null,'','/personal');
    el('memberships').ariaBusy='true';el('memberships-status').textContent='Üyelikler yükleniyor…';
    try{const result=await api('organizations?id='+encodeURIComponent(id));if(request!==organizationRequest)return;
      currentOrg=id;el('detail').textContent=JSON.stringify(result.organizations[0],null,2);history.replaceState(null,'','/personal?organization='+encodeURIComponent(id));
      el('notification-bell').hidden=false;void notifications();
      if(['owner','admin'].includes(result.organizations[0]?.role)){
        el('memberships-refresh').hidden=false;
        el('invite-member').hidden=false;
        el('pending-invitations-panel').hidden=false;
        el('audit-timeline-section').hidden=false;
        timelineCursor = null;
        await loadTimeline(id);
      }else{
        el('invite-member').hidden=true;
        clearPendingInvitations();
        el('audit-timeline-section').hidden=true;
        timelineCursor = null;
        timelineOrg = '';
        ++timelineRequest;
        el('audit-timeline-entries').replaceChildren();
        el('audit-timeline-status').textContent = '';
      }
      await memberships(id,request);
      if(request===organizationRequest&&currentOrg===id&&!el('pending-invitations-panel').hidden)
        void pendingInvitations(id,request);
      if(request===organizationRequest)status('Kuruluş erişimi doğrulandı');
    }catch(e){if(request!==organizationRequest)return;currentOrg='';timelineCursor=null;timelineOrg='';++timelineRequest;el('audit-timeline-section').hidden=true;el('audit-timeline-entries').replaceChildren();el('audit-timeline-status').textContent='';el('detail').textContent='';clearMemberships();clearPendingInvitations();el('memberships-status').textContent=membershipError(e);status(e.message)}
  }
  function clearMemberships(){
    el('memberships').replaceChildren();el('memberships').ariaBusy='false';el('memberships-status').textContent='';
    el('memberships-refresh').hidden=true;el('memberships-refresh').disabled=true;
  }
  function membershipError(e){return [401,403,404].includes(e.httpStatus)?'Üyelik listesini görüntüleme izniniz yok.':'Üyelik listesi yüklenemedi. Yeniden deneyin.'}
  async function memberships(org,request){
    if(request!==organizationRequest||currentOrg!==org)return;el('memberships').replaceChildren();
    el('memberships').ariaBusy='true';el('memberships-status').textContent='Üyelikler yükleniyor…';el('memberships-refresh').disabled=true;
    try{const data=await api('memberships?organization='+encodeURIComponent(org));if(request!==organizationRequest||currentOrg!==org)return;
      if(!Array.isArray(data.memberships))throw new Error('Invalid membership response');
      const canManageOwners=data.memberships.some(m=>m.person_id===currentPersonId&&m.role==='owner'&&m.protected_owner===true&&m.status==='active');
      for(const m of data.memberships){const p=document.createElement('p');p.textContent=m.person_id+' — '+m.role+' — '+m.status;el('memberships').append(p);
        if(m.status==='active'){
          if(!m.protected_owner&&m.role!=='owner'){
            const sel=document.createElement('select');
            for(const r of ['member','admin']){const o=document.createElement('option');o.value=r;o.textContent=r;if(r===m.role)o.selected=true;sel.append(o)}
            const rb=document.createElement('button');rb.textContent='Rolü kaydet '+m.id;
            rb.onclick=async()=>{
              if(request!==organizationRequest||currentOrg!==org)return;rb.disabled=true;
              try{await api('memberships',{method:'POST',body:JSON.stringify({organization_id:org,membership_id:m.id,role:sel.value})});if(request!==organizationRequest)return;await selectOrg(org);status('Rol güncellendi')}
              catch(e){if(request!==organizationRequest)return;status(e.message);if(!e.uncertain)rb.disabled=false}
            };
            el('memberships').append(sel,rb);
          }
          if(canManageOwners && ((m.protected_owner&&m.role==='owner')||(!m.protected_owner&&m.role!=='owner'))){
            const ownerRole=m.protected_owner?'admin':'owner';
            const ob=document.createElement('button');ob.textContent=(ownerRole==='owner'?'Korumalı Owner yap ':'Owner rolünü Admin yap ')+m.id;
            ob.onclick=async()=>{
              if(request!==organizationRequest||currentOrg!==org)return;ob.disabled=true;
              try{await api('memberships',{method:'POST',body:JSON.stringify({action:'protected_owner',organization_id:org,membership_id:m.id,role:ownerRole})});if(request!==organizationRequest)return;await selectOrg(org);status('Owner üyeliği güncellendi')}
              catch(e){if(request!==organizationRequest)return;status(e.message);if(!e.uncertain)ob.disabled=false}
            };
            el('memberships').append(ob);
          }
          const b=document.createElement('button');b.textContent='Üyeliği iptal et '+m.id;b.onclick=async()=>{
            if(request!==organizationRequest||currentOrg!==org)return;b.disabled=true;
            try{await api('memberships',{method:'POST',body:JSON.stringify({organization_id:org,membership_id:m.id})});if(request!==organizationRequest)return;await selectOrg(org)}
            catch(e){if(request!==organizationRequest)return;status(e.message);if(!e.uncertain)b.disabled=false}
          };el('memberships').append(b)}
      }
      el('memberships-status').textContent=data.memberships.length?'Üyelik listesi güncellendi.':'Gösterilecek üyelik bulunmuyor.';
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      el('memberships').replaceChildren();
      el('memberships-status').textContent=membershipError(e);
    }finally{
      if(request===organizationRequest&&currentOrg===org){el('memberships').ariaBusy='false';el('memberships-refresh').disabled=false;}
    }
  }
  el('memberships-refresh').onclick=async()=>{if(currentOrg)await selectOrg(currentOrg)};
  async function load(){if(document.hidden){concealPrivateView();return}const epoch=++viewEpoch;try{el('smtp-platform').hidden=true;smtpSettings=null;const me=await api('session');csrf=me.csrf_token;currentPersonId=me.person_id;el('person').textContent='Person: '+me.person_id;el('verification-email').textContent=me.email_verification==='verified'?'E-posta: Native doğrulama kaydı mevcut.':me.email_verification==='not_verified'?'E-posta: Doğrulanmış kayıt bulunamadı.':'E-posta: Doğrulama durumu şu anda okunamıyor.';const data=await api('organizations');loadedScope=JSON.stringify(data);el('organizations').replaceChildren();for(const o of data.organizations){const b=document.createElement('button');b.textContent=o.name+' — '+o.role;b.onclick=()=>selectOrg(o.id);el('organizations').append(b)}el('login').hidden=true;el('session-lock').hidden=false;el('session-lock').disabled=false;el('notification-bell').hidden=false;void notifications();el('workspace').hidden=false;status('Oturum açık');await links();await refreshMfa();await refreshSmtp();void loadLauncher();
    const inviteToken=invitationToken;
    if(inviteToken){el('invitation-section').hidden=false;el('invitation-card').hidden=false;el('invitation-mismatch-banner').hidden=true;el('invitation-result').textContent='';}
    else{el('invitation-section').hidden=true;}
    const selected=new URLSearchParams(location.search).get('organization');if(selected)await selectOrg(selected)}catch{if(epoch!==viewEpoch)return;clearNotifications();organizationRequest++;csrf='';currentOrg='';currentPersonId='';el('login').hidden=false;el('session-lock').hidden=true;el('workspace').hidden=true;el('mfa-enrollment').hidden=true;el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;mfaState=null;clearMfaCodes();el('mfa-management').hidden=true;el('mfa-person').hidden=true;el('mfa-platform').hidden=true;el('smtp-platform').hidden=true;smtpSettings=null;el('invite-member').hidden=true;clearPendingInvitations();el('invite-result').textContent='';
    const inviteToken=invitationToken;
    if(inviteToken){el('invitation-section').hidden=false;el('invitation-card').hidden=true;el('invitation-mismatch-banner').hidden=false;el('invitation-mismatch-text').textContent='Bu bağlantıyla mevcut oturumda devam edilemiyor. Uygun hesapla giriş yapın veya yeni davet isteyin.';}
    else{el('invitation-section').hidden=true;}
    clearMemberships();for(const id of ['detail','memberships','organizations','actor-result','provision-result','person','verification-email','bindings'])el(id).replaceChildren();status('Giriş gerekli')}}
  async function updateMfaForm(form,body){
    const button=form.querySelector('button');button.disabled=true;
    let uncertain=false;
    try{
      await api('mfa',{method:'POST',body:JSON.stringify(body)});
      await refreshMfa();if(!mfaState){await load();status('MFA ayarı kaydedildi. Güncel güvenlik politikası için yeniden giriş yapın.')}else status('MFA ayarı kaydedildi. Native faktör ve oturum geçişi ayrıca doğrulanmalıdır.');
    }catch(e){
      status(e.message);await refreshMfa();
      if(e.uncertain){uncertain=true;status('İşlemin sonucu belirsiz. Yeniden göndermeden önce kayıt kontrolü gerekli.');}
    }finally{
      // Re-enable only when fresh server policy still authorizes this control.
      // Ambiguous writes stay locked until their persisted result is reviewed.
      button.disabled=uncertain||!mfaState||
        (form===el('mfa-platform')
          ? !mfaState.can_manage_platform
          : mfaState.platform.platform_mode!=='optional');
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
    if(!confirm('Platform MFA politikasını değiştirmek istiyor musunuz? Etkin native faktörler doğrulanmış kaldırma tamamlanmadan atlanamaz.'))return;
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
    el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;
    el('mfa-enroll-start').elements.setup_action.value=mfaState.native_factor_state==='pending'?'resume':'start';
    status('Kuruluma başlamak veya devam etmek için parolanızı yeniden girin.');
  };
  el('mfa-seed-toggle').onclick=()=>{el('mfa-seed').type=el('mfa-seed').type==='password'?'text':'password'};
  el('mfa-enroll-start').onsubmit=async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{
      const values=Object.fromEntries(new FormData(e.target));
      const action=values.setup_action;
      delete values.setup_action;
      const data=await api('mfa/enroll',{method:'POST',body:JSON.stringify({action,...values})});
      e.target.reset();
      if(data.reset){
        el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;
        el('mfa-enroll-verify').hidden=true;
        button.disabled=false;
        status('Bekleyen TOTP kurulumu sıfırlandı. Yeni kurulum için parolanızı yeniden doğrulayın.');
        return;
      }
      el('mfa-seed').value=data.resumed?'':(data.secret||data.otpauth_url||'');
      el('mfa-seed').type='password';el('mfa-seed-region').hidden=!!data.resumed;
      el('mfa-enroll-secret').textContent=data.resumed
        ? 'Önceki kimlik doğrulama uygulamanızdaki kodu girin. Önceki anahtar tekrar gösterilemez.'
        : 'Kurulum anahtarı yalnız bu ekranda maskeli gösterilir. Güvenli doğrulama uygulamanıza aktarın.';
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
      el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;
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
        el('login').hidden=true;el('challenge').hidden=false;
        // Form reset does not fire change; sync the TOTP/recovery validator on every new challenge.
        el('challenge').elements.method.onchange();status('İkinci faktör gerekli');
      }else if(data.enrollment_required){
        el('login').hidden=true;el('mfa-enrollment').hidden=false;
        el('mfa-enroll-start').hidden=false;el('mfa-enroll-verify').hidden=true;
        el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;
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
  el('mfa-recovery').onclick=async()=>{
    if(!confirm('Yeni kodlar önceki kurtarma kodlarını geçersiz kılar. Devam edilsin mi?'))return;
    const button=el('mfa-recovery');button.disabled=true;clearMfaCodes();
    try{const data=await api('mfa/manage',{method:'POST',body:JSON.stringify({action:'recovery_codes'})});recoveryCodes=data.recovery_codes;el('mfa-codes').hidden=false;status('Kurtarma kodları oluşturuldu; yalnız bu ekranda gösterilebilir.');}
    catch(error){status(error.message);if(!error.uncertain)button.disabled=false}
  };
  el('mfa-codes-reveal').onclick=()=>{el('mfa-codes-value').textContent=recoveryCodes.join('\\n');el('mfa-codes-value').hidden=false};
  el('mfa-codes-clear').onclick=()=>clearMfaCodes();
  el('mfa-disable').onsubmit=async event=>{
    event.preventDefault();if(!confirm('Native faktör kaldırılacak ve tüm oturumlar kapanacak. Devam edilsin mi?'))return;
    const button=event.target.querySelector('button');button.disabled=true;
    try{await api('mfa/manage',{method:'POST',body:JSON.stringify({action:'disable',...Object.fromEntries(new FormData(event.target))})});event.target.reset();clearMfaCodes();await load();status('Native faktör kaldırıldı; yeniden giriş yapın.');}
    catch(error){event.target.reset();status(error.message);if(!error.uncertain)button.disabled=false}
  };
  async function logout(all){
    let error=null;
    try{await api('session'+(all?'?all=true':''),{method:'DELETE'})}
    catch(e){error=e}
    finally{
      // Conceal the outgoing actor's private data even if logout is uncertain.
      concealPrivateView();
      history.replaceState(null,'','/personal');
    }
    if(error){status('Çıkış doğrulanamadı. Sunucu oturumu hâlâ açık olabilir.');return}
    await load()
  }
  // Existing server-side single-session revocation is the lock authority.
  // api() checks viewEpoch, so this call must remain independent: the private
  // workspace is concealed before any response or old request can repaint it.
  async function lockCurrentSession(){
    const button=el('session-lock');
    if(button.hidden||button.disabled)return;
    const requestCsrf=csrf;
    button.disabled=true;
    concealPrivateView();
    el('login').reset();el('login').hidden=false;
    history.replaceState(null,'','/personal');
    let locked=false;
    try{
      const response=await fetch('/personal/session?action=lock',{
        method:'DELETE',credentials:'same-origin',
        headers:{'Content-Type':'application/json','x-csrf-token':requestCsrf}
      });
      if(response.ok){const result=await response.json();locked=result&&result.success===true}
    }catch{
      // An uncertain revoke must never be reported as a completed lock.
    }
    status(locked
      ?'Oturum kilitlendi. Yeniden açmak için parola ve ikinci faktörle giriş yapın.'
      :'Kilitleme doğrulanamadı. Sunucu oturumu hâlâ açık olabilir; yeniden giriş yapıp oturumu sonlandırın.');
  }
  
  let smtpSettings=null;
  async function refreshSmtp(){
    try{
      const data=await api('platform/smtp');
      if(data&&data.can_manage&&data.settings){
        smtpSettings=data.settings;
        el('smtp-platform').hidden=false;
        el('smtp-status').textContent='Ayar sürümü: '+smtpSettings.version+' ('+(smtpSettings.enabled?'Aktif':'Devre Dışı')+'). '+(smtpSettings.has_password?'AES-256 Parola Kayıtlı.':'Parola Tanımlanmamış.');
        const form=el('smtp-form');
        form.elements.enabled.checked=!!smtpSettings.enabled;
        form.elements.host.value=smtpSettings.host||'';
        form.elements.port.value=smtpSettings.port||465;
        form.elements.security.value=smtpSettings.security||'ssl';
        form.elements.username.value=smtpSettings.username||'';
        form.elements.password.value='';
        form.elements.from_email.value=smtpSettings.from_email||'';
        form.elements.from_name.value=smtpSettings.from_name||'';
      }else{
        smtpSettings=null;el('smtp-platform').hidden=true;
      }
    }catch{
      smtpSettings=null;el('smtp-platform').hidden=true;
    }
  }
  el('smtp-form').onsubmit=async e=>{
    e.preventDefault();if(!smtpSettings)return;
    const b=e.target.querySelector('button');b.disabled=true;
    try{
      const fd=new FormData(e.target);
      const payload={
        action:'save',
        enabled:fd.get('enabled')==='true',
        host:fd.get('host'),
        port:Number(fd.get('port')),
        security:fd.get('security'),
        username:fd.get('username')||null,
        from_email:fd.get('from_email'),
        from_name:fd.get('from_name')||null,
        expected_version:smtpSettings.version,
      };
      const pw=fd.get('password');
      if(pw)payload.password=pw;
      const res=await api('platform/smtp',{method:'POST',body:JSON.stringify(payload)});
      if(res.settings){
        smtpSettings=res.settings;
        await refreshSmtp();
        status('SMTP ayarları kaydedildi (Sürüm: '+res.settings.version+')');
      }
    }catch(err){status(err.message)}finally{b.disabled=false}
  };
  el('smtp-test-form').onsubmit=async e=>{
    e.preventDefault();
    const b=e.target.querySelector('button');b.disabled=true;
    el('smtp-test-result').textContent='Test e-postası gönderiliyor...';
    try{
      const fd=new FormData(e.target);
      const recipient=fd.get('target_recipient');
      const sf=el('smtp-form');
      const sfd=new FormData(sf);
      const candidate={
        host:sfd.get('host'),
        port:Number(sfd.get('port')),
        security:sfd.get('security'),
        username:sfd.get('username')||null,
        from_email:sfd.get('from_email'),
        from_name:sfd.get('from_name')||null,
      };
      const pw=sfd.get('password');
      if(pw)candidate.password=pw;
      const res=await api('platform/smtp',{
        method:'POST',
        body:JSON.stringify({
          action:'test',
          target_recipient:recipient,
          candidate_settings:candidate,
        }),
      });
      if(res.ok){
        el('smtp-test-result').textContent='SMTP sunucusu e-postayı gönderim için kabul etti. Teslimatı alıcının gelen kutusundan kontrol edin.';
        status('Test e-postası başarıyla kabul edildi');
      }else{
        el('smtp-test-result').textContent='Test başarısız: '+(res.message||'Hata');
        status('Test e-postası gönderilemedi');
      }
    }catch(err){
      el('smtp-test-result').textContent='Test hatası: '+err.message;
      status('Test hatası: '+err.message);
    }finally{
      b.disabled=false;
    }
  };

  el('invite-member').onsubmit=async e=>{
    e.preventDefault();
    const orgId = currentOrg || new URLSearchParams(location.search).get('organization');
    if(!orgId)return;
    const b=e.target.querySelector('button');b.disabled=true;
    el('invite-result').textContent='Davet oluşturuluyor ve e-posta iletiliyor...';
    try{
      const inviteData=new FormData(e.target);
      const email=inviteData.get('email');
      const role=inviteData.get('role');
      const res=await api('invitations',{method:'POST',body:JSON.stringify({action:'create',organization_id:orgId,email,role})});
      if(res.delivery?.status==='sent'){
        el('invite-result').textContent='Davet oluşturuldu. E-posta gönderim için kabul edildi.';
        status('Davet e-postası gönderim için kabul edildi');
      }else if(res.delivery?.status==='failed'){
        el('invite-result').textContent='Davet oluşturuldu ancak e-posta gönderilemedi. Lütfen platform yöneticisine bildirin.';
        status('Davet oluşturuldu (e-posta teslimi başarısız)');
      }else{
        el('invite-result').textContent='Davet oluşturuldu.';
        status('Kuruluş üyelik daveti oluşturuldu');
      }
      e.target.reset();
      await pendingInvitations(orgId,organizationRequest);
    }catch(err){
      el('invite-result').textContent='Davet oluşturulamadı: '+err.message;
      status(err.message);
    }finally{b.disabled=false}
  };
  el('accept-invitation-btn').onclick=async()=>{
    const token=invitationToken;
    if(!token)return;
    const btn=el('accept-invitation-btn');btn.disabled=true;
    el('invitation-result').textContent='Davet kabul ediliyor...';
    try{
      await api('invitations',{method:'POST',body:JSON.stringify({action:'accept',token})});
      // Discard the consumed token from page memory before refreshing.
      invitationToken=null;
      await load();
      status('Kuruluş üyeliğiniz başarıyla aktifleştirildi.');
    }catch(err){
      el('invitation-card').hidden=true;
      el('invitation-mismatch-banner').hidden=false;
      el('invitation-mismatch-text').textContent='Bu bağlantıyla mevcut oturumda devam edilemiyor. Uygun hesapla giriş yapın veya yeni davet isteyin.';
      status('Bu bağlantıyla mevcut oturumda devam edilemiyor.');
    }finally{btn.disabled=false}
  };
  // ---------------------------------------------------------------------------
  // B20: Launcher preference -- drag/touch/keyboard reorder + expand/collapse
  // ---------------------------------------------------------------------------
  // Null-prototype map prevents __proto__/constructor property pollution reads.
  const APP_LABELS=Object.assign(Object.create(null),{storefront:'Al\u0131c\u0131 Ma\u011fazas\u0131',vendor:'Sat\u0131c\u0131 Paneli'});
  // App launch URLs: server-embedded from trusted process config at render time.
  const APP_URLS=Object.assign(Object.create(null),{storefront:'${storefrontOrigin}',vendor:'${vendorOrigin}/seller'});
  let launcherState={app_ids:[],collapsed_ids:[],available_ids:[],version:0};
  let launcherSaving=false,launcherDragSrc=null,launcherDragOver=null;
  let launcherKeyHandle=null;
  async function loadLauncher(){
    try{
      const data=await api('launcher');
      launcherState=data;
      renderLauncher();
      el('launcher-section').hidden=false;
    }catch(e){
      if([401,403].includes(e.httpStatus)){concealPrivateView();el('login').hidden=false;return}
      el('launcher-status').textContent='Ba\u015flat\u0131c\u0131 y\u00fcklenemedi.';
    }
  }
  function clearLauncher(){
    el('launcher-section').hidden=true;
    el('launcher-list').replaceChildren();
    el('launcher-status').textContent='';
    launcherState={app_ids:[],collapsed_ids:[],available_ids:[],version:0};
    launcherDragSrc=null;launcherDragOver=null;launcherKeyHandle=null;launcherSaving=false;
  }
  function renderLauncher(){
    const list=el('launcher-list');list.replaceChildren();
    const ids=launcherState.app_ids.length?launcherState.app_ids:[...launcherState.available_ids];
    for(const id of ids){
      const li=document.createElement('li');
      li.setAttribute('role','option');li.setAttribute('aria-selected','false');
      li.setAttribute('data-id',id);li.setAttribute('draggable','true');
      li.setAttribute('aria-grabbed','false');
      const handle=document.createElement('span');
      handle.className='launcher-handle';handle.setAttribute('tabindex','0');
      handle.setAttribute('role','button');handle.setAttribute('aria-pressed','false');
      const appName=(APP_LABELS[id]||id);
      handle.setAttribute('aria-label',appName+' \u2014 Space/Enter ile tut, ok tu\u015flar\u0131yla ta\u015f\u0131, Space/Enter ile b\u0131rak, Esc ile iptal');
      handle.textContent='\u283f';
      const collapsed=launcherState.collapsed_ids.includes(id);
      const toggle=document.createElement('button');
      toggle.className='launcher-toggle';toggle.type='button';
      toggle.textContent=collapsed?'A\u00e7':'Kapat';
      toggle.setAttribute('aria-label',appName+' bolumu '+(collapsed?'a\u00e7':'kapat'));
      toggle.setAttribute('aria-expanded',String(!collapsed));
      const name=document.createElement('span');name.className='launcher-name';
      name.textContent=appName;
      // Launch link — navigates to real app in new tab.
      // URL is server-embedded from process config; null-prototype map prevents prototype reads.
      const launchUrl=Object.prototype.hasOwnProperty.call(APP_URLS,id)?APP_URLS[id]:null;
      const launchLink=document.createElement('a');
      if(launchUrl){launchLink.href=launchUrl;launchLink.target='_blank';launchLink.rel='noopener noreferrer';
        launchLink.textContent=appName+' \u2192';launchLink.style.cssText='display:inline-block;margin-top:.5rem;font-size:.95rem;font-weight:500;color:var(--accent);text-decoration:none;padding:.3rem .7rem;border:1px solid var(--accent);border-radius:.4rem';}
      // Collapsible content section — shows/hides launch link. Does not affect entitlement.
      const content=document.createElement('div');
      content.id='launcher-content-'+id;
      content.setAttribute('role','region');content.setAttribute('aria-label',appName);
      content.hidden=collapsed;
      content.style.cssText='padding:.25rem 0 0 0';
      if(launchUrl)content.append(launchLink);
      li.append(handle,name,toggle,content);
      // HTML5 drag (mouse/trackpad)
      li.addEventListener('dragstart',e=>{
        launcherDragSrc=li;li.setAttribute('aria-grabbed','true');
        e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',id);
      });
      // Pointer/touch drag (mobile) — supplementary to HTML5 drag events
      let ptId=null,ptStartY=0,ptClone=null;
      li.addEventListener('pointerdown',e=>{if(e.target!==handle)return;e.preventDefault();
        ptId=e.pointerId;ptStartY=e.clientY;li.setPointerCapture(e.pointerId);
        li.setAttribute('aria-grabbed','true');
        ptClone=li.cloneNode(true);const r=li.getBoundingClientRect();
        ptClone.style.cssText='position:fixed;opacity:.55;pointer-events:none;width:'+li.offsetWidth+'px;left:'+r.left+'px;top:'+r.top+'px;z-index:9999;background:white;border:1px dashed var(--accent);border-radius:.6rem';
        document.body.appendChild(ptClone);});
      li.addEventListener('pointermove',e=>{if(e.pointerId!==ptId||!ptClone)return;e.preventDefault();
        ptClone.style.top=(parseFloat(ptClone.style.top)+(e.clientY-ptStartY))+'px';ptStartY=e.clientY;
        const items=[...list.children];const target=items.find(r=>r!==li&&r.getBoundingClientRect)&&items.find(r=>{if(r===li)return false;const rb=r.getBoundingClientRect();return e.clientY>=rb.top&&e.clientY<=rb.bottom;});
        items.forEach(r=>r.classList.remove('drag-over'));if(target){target.classList.add('drag-over');launcherDragOver=target;}else launcherDragOver=null;});
      li.addEventListener('pointerup',e=>{if(e.pointerId!==ptId)return;
        li.setAttribute('aria-grabbed','false');
        if(ptClone){document.body.removeChild(ptClone);ptClone=null;}ptId=null;
        if(launcherDragOver&&launcherDragOver!==li){const items=[...list.children];const fi=items.indexOf(li),ti=items.indexOf(launcherDragOver);
          if(fi<ti)launcherDragOver.after(li);else launcherDragOver.before(li);
          list.querySelectorAll('li').forEach(r=>r.classList.remove('drag-over'));launcherDragOver=null;void saveLauncherOrder();}});
      li.addEventListener('pointercancel',e=>{if(e.pointerId!==ptId)return;
        li.setAttribute('aria-grabbed','false');
        if(ptClone){document.body.removeChild(ptClone);ptClone=null;}ptId=null;
        list.querySelectorAll('li').forEach(r=>r.classList.remove('drag-over'));launcherDragOver=null;});
      li.addEventListener('dragend',()=>{
        li.setAttribute('aria-grabbed','false');
        list.querySelectorAll('li').forEach(r=>r.classList.remove('drag-over'));
        launcherDragSrc=null;launcherDragOver=null;
      });
      li.addEventListener('dragover',e=>{
        if(!launcherDragSrc||launcherDragSrc===li)return;
        e.preventDefault();e.dataTransfer.dropEffect='move';
        if(launcherDragOver!==li){
          list.querySelectorAll('li').forEach(r=>r.classList.remove('drag-over'));
          li.classList.add('drag-over');launcherDragOver=li;
        }
      });
      li.addEventListener('dragleave',()=>li.classList.remove('drag-over'));
      li.addEventListener('drop',e=>{
        e.preventDefault();if(!launcherDragSrc||launcherDragSrc===li)return;
        li.classList.remove('drag-over');
        const items=[...list.children];
        const fromIdx=items.indexOf(launcherDragSrc),toIdx=items.indexOf(li);
        if(fromIdx<0||toIdx<0)return;
        if(fromIdx<toIdx)li.after(launcherDragSrc);else li.before(launcherDragSrc);
        void saveLauncherOrder();
      });
      // Keyboard drag
      handle.addEventListener('keydown',async e=>{
        if(e.key==='Escape'&&launcherKeyHandle){
          e.preventDefault();launcherKeyHandle=null;
          handle.setAttribute('aria-pressed','false');
          el('launcher-status').textContent='Ta\u015f\u0131ma iptal edildi.';
          renderLauncher();return;
        }
        if((e.key===' '||e.key==='Enter')&&!launcherKeyHandle){
          e.preventDefault();launcherKeyHandle=handle;
          handle.setAttribute('aria-pressed','true');
          el('launcher-status').textContent=appName+' tutuldu. Ok tu\u015flar\u0131yla ta\u015f\u0131, Space/Enter b\u0131rak, Esc iptal.';return;
        }
        if((e.key===' '||e.key==='Enter')&&launcherKeyHandle===handle){
          e.preventDefault();launcherKeyHandle=null;
          handle.setAttribute('aria-pressed','false');
          el('launcher-status').textContent=appName+' yeni konumuna b\u0131rak\u0131ld\u0131.';
          await saveLauncherOrder();return;
        }
        if((e.key==='ArrowUp'||e.key==='ArrowDown')&&launcherKeyHandle===handle){
          e.preventDefault();
          const items=[...list.children];const idx=items.indexOf(li);
          if(e.key==='ArrowUp'&&idx>0)items[idx-1].before(li);
          else if(e.key==='ArrowDown'&&idx<items.length-1)items[idx+1].after(li);
          const newIdx=[...list.children].indexOf(li);
          el('launcher-status').textContent=appName+' '+(newIdx+1)+'. s\u0131raya ta\u015f\u0131nd\u0131.';
          li.querySelector('.launcher-handle').focus();
        }
      });
      toggle.addEventListener('click',async()=>{
        const cur=launcherState.collapsed_ids;
        const next=cur.includes(id)?cur.filter(x=>x!==id):[...cur,id];
        launcherState.collapsed_ids=next;
        const nowCollapsed=next.includes(id);
        toggle.textContent=nowCollapsed?'A\u00e7':'Kapat';
        toggle.setAttribute('aria-expanded',String(!nowCollapsed));
        toggle.setAttribute('aria-label',appName+' b\u00f6l\u00fcm\u00fc '+(nowCollapsed?'a\u00e7':'kapat'));
        // Show/hide real content section
        const contentEl=document.getElementById('launcher-content-'+id);
        if(contentEl)contentEl.hidden=nowCollapsed;
        await saveLauncherOrder();
      });
      list.append(li);
    }
  }
  async function saveLauncherOrder(){
    if(launcherSaving)return;
    launcherSaving=true;el('launcher-status').textContent='Kaydediliyor...';
    try{
      const items=[...el('launcher-list').children];
      const appIds=items.map(li=>li.getAttribute('data-id')).filter(Boolean);
      const result=await api('launcher',{method:'POST',body:JSON.stringify({
        app_ids:appIds,collapsed_ids:launcherState.collapsed_ids,version:launcherState.version
      })});
      launcherState.app_ids=result.app_ids;
      launcherState.collapsed_ids=result.collapsed_ids;
      launcherState.version=result.version;
      el('launcher-status').textContent='Tercih kaydedildi.';
    }catch(e){
      if(e.httpStatus===409){el('launcher-status').textContent='Catisma: baska oturumda degisiklik. Yenileniyor...';await loadLauncher();}
      else if([401,403].includes(e.httpStatus)){concealPrivateView();el('login').hidden=false;}
      else el('launcher-status').textContent=e.uncertain?'Kayit sonucu belirsiz; yenileyip kontrol edin.':'Tercih kaydedilemedi.';
    }finally{launcherSaving=false;}
  }
  el('launcher-reset').onclick=async()=>{
    launcherState.app_ids=[];launcherState.collapsed_ids=[];
    await saveLauncherOrder();await loadLauncher();
  };
  // Conceal before browser history or hidden-page restoration; pending reads
  // belong to a view epoch and cannot repopulate a concealed private workspace.
  function concealPrivateView(){
    clearNotifications();
    viewEpoch++;organizationRequest++;timelineRequest++;currentOrg='';linkIntent='';csrf='';loadedScope='';mfaState=null;smtpSettings=null;clearMfaCodes();timelineCursor=null;timelineOrg='';
    el('workspace').hidden=true;el('session-lock').hidden=true;el('invitation-section').hidden=true;el('mfa-enrollment').hidden=true;el('challenge').hidden=true;el('audit-timeline-section').hidden=true;clearMemberships();clearPendingInvitations();clearLauncher();
    for(const id of ['detail','memberships','organizations','actor-result','provision-result','person','verification-email','bindings','invite-result','invitation-result','mfa-info','smtp-status','smtp-test-result','mfa-enroll-secret','audit-timeline-entries','audit-timeline-status'])el(id).replaceChildren();
    for(const form of el('workspace').querySelectorAll('form'))form.reset();
    el('mfa-seed').value='';el('invite-member').hidden=true;status('Erişim yeniden doğrulanıyor');
  }
  async function observeAccess(){
    if(observing||document.hidden||el('workspace').hidden)return;
    observing=true;const epoch=viewEpoch;
    try{const data=await api('organizations',{headers:{'x-da-observe':'1'}});
      if(epoch!==viewEpoch)return;
      if(JSON.stringify(data)!==loadedScope){concealPrivateView();status('Erişim değişti. Güncel çalışma alanı için sayfayı yenileyin.')}
    }catch{if(epoch===viewEpoch){concealPrivateView();el('login').hidden=false;status('Erişim yeniden doğrulanmalı')}}
    finally{observing=false}
  }
  window.addEventListener('pagehide',concealPrivateView);
  window.addEventListener('pageshow',event=>{if(event.persisted){concealPrivateView();load()}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)concealPrivateView();else load()});
  window.addEventListener('focus',()=>{if(el('workspace').hidden&&loadedScope==='')load();else observeAccess()});
  window.addEventListener('popstate',()=>{concealPrivateView();load()});
  setInterval(observeAccess,5000);
  el('audit-timeline-refresh').onclick=async()=>{timelineCursor=null;await loadTimeline(currentOrg);};
  el('audit-timeline-next').onclick=async()=>{if(timelineCursor&&currentOrg)await loadTimeline(currentOrg,timelineCursor,true);};
  el('select-org').onsubmit=async e=>{e.preventDefault();await selectOrg(new FormData(e.target).get('organization'))};
  el('session-lock').onclick=lockCurrentSession;el('logout').onclick=()=>logout(false);el('logout-all').onclick=()=>logout(true);el('staff').onclick=async()=>{try{await api('platform');status('Platform görevi için izin var')}catch(e){status(e.message)}};load();
  </script></html>`)
}
