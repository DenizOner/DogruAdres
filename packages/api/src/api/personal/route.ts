import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { randomBytes } from "node:crypto"
import { enabled } from "./security"
export const AUTHENTICATE = false
export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  if (!enabled()) return res.status(503).send("Kişisel çalışma alanı etkin değil")
  const nonce = randomBytes(18).toString("base64")
  res.setHeader("Cache-Control","no-store")
  res.setHeader("Referrer-Policy","no-referrer")
  res.setHeader("X-Content-Type-Options","nosniff")
  res.setHeader("Content-Security-Policy",`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`)
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
  <details id="register-details"><summary>Yeni kişi hesabı oluştur</summary>
    <p>Tek kişisel hesap oluşturun. İşletme ve mağaza yetkileri kayıtla birlikte verilmez; cep telefonu numaranızın sahipliği henüz doğrulanmaz.</p>
    <form id="register">
      <label>Ad<input name="first_name" autocomplete="given-name" maxlength="50" required></label>
      <label>Soyad<input name="last_name" autocomplete="family-name" maxlength="50" required></label>
      <label>E-posta<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
      <label>Cep telefonu (zorunlu)<input name="mobile_phone" type="tel" autocomplete="tel" inputmode="tel" pattern="[+]?[0-9]{6,20}" minlength="6" maxlength="21" required></label>
      <label>Parola (en az 12 karakter)<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>
      <button type="submit">Kişi hesabı oluştur</button>
    </form>
    <p id="register-status" role="status" aria-live="polite"></p>
  </details>
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
  <form id="person-mobile-form" hidden>
    <h2>Kişisel cep telefonu</h2>
    <label>Cep telefonu (başında + olabilir; rakamlardan oluşur)
      <input name="mobile_phone" type="tel" autocomplete="tel" inputmode="tel"
        pattern="[+]?[0-9]{6,20}" minlength="6" maxlength="21" required></label>
    <p>Bu numara kişisel hesabınıza aittir; henüz telefon doğrulaması yapılmıyor ve şirket sabit hattı değildir.</p>
    <button type="submit">Cep telefonumu kaydet</button>
    <p id="person-mobile-status" role="status" aria-live="polite"></p>
  </form>
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
  <section id="organization-draft-panel" style="grid-column:1/-1">
    <h2>Yeni Şirket Oluştur — özel başvuru taslağı</h2>
    <p>Gerçek kişi ticari işletmesi ve tüzel şirket aynı başvuru yolunu kullanır. Bu aşama yalnız taslaktır: vergi levhası henüz yüklenmez, başvuru gönderilmez ve işletme/Owner/alışveriş yetkisi oluşmaz.</p>
    <form id="organization-draft-form">
      <fieldset><legend>Faaliyet alanları (bir veya birkaçını seçin)</legend>
        <label><input type="checkbox" name="declared_activities" value="service_repair"> Servis ve Onarım</label>
        <label><input type="checkbox" name="declared_activities" value="retail_store"> Perakende Mağazası</label>
        <label><input type="checkbox" name="declared_activities" value="wholesale_distribution"> Toptancı / Distribütör</label>
        <label><input type="checkbox" name="declared_activities" value="manufacturing"> Üretici</label>
        <label><input type="checkbox" name="declared_activities" value="fleet_operations"> Filo / Kurumsal Araç İşletmecisi</label>
        <label><input type="checkbox" name="declared_activities" value="insurance_claims"> Sigorta / Hasar Yönetimi</label>
      </fieldset>
      <label>Ana faaliyet (işaretlediğiniz faaliyetlerden biri)
        <select name="primary_activity" required>
          <option value="">Ana faaliyeti seçin</option>
          <option value="service_repair">Servis ve Onarım</option>
          <option value="retail_store">Perakende Mağazası</option>
          <option value="wholesale_distribution">Toptancı / Distribütör</option>
          <option value="manufacturing">Üretici</option>
          <option value="fleet_operations">Filo / Kurumsal Araç İşletmecisi</option>
          <option value="insurance_claims">Sigorta / Hasar Yönetimi</option>
        </select>
      </label>
      <p>Faaliyet seçimleri beyan niteliğindedir; doğrulanmadan indirim veya ticari yetki vermez.</p>
      <label>İşletme türü
        <select name="business_kind" required>
          <option value="individual_business">Gerçek kişi ticari işletmesi</option>
          <option value="legal_company">Tüzel şirket</option>
        </select>
      </label>
      <label>Resmî ticari unvan (taslak)<input name="legal_name" minlength="2" maxlength="200" required></label>
      <label>İşletmenin sabit hattı (zorunlu; doğrulanmış değildir)<input name="landline_phone" type="tel" autocomplete="off" minlength="7" maxlength="40" required></label>
      <label>Vergi Kimlik Numarası (VKN 10 hane / Şahıs işletmesi için TCKN 11 hane)<input name="tax_identifier" pattern="[0-9]{10,11}" maxlength="11" minlength="10" autocomplete="off" placeholder="10 veya 11 haneli vergi kimliği (başvuru gönderimi için zorunlu)"></label>
      <button type="submit">Taslağı kaydet</button>
    </form>
    <div id="organization-document-section" hidden style="margin-top:1em;padding:1em;border:1px solid #ccc">
      <h3>Vergi levhası (başvuru belgesi)</h3>
      <p>PDF, JPEG veya PNG biçiminde, en fazla 10 MiB. İlk yüklemede virüs taraması ve güvenli önizleme hazırlanır; kontrol başarısızsa belge kabul edilmez. Dosya özel alanda saklanır; başvuru gönderilmeden işletme yetkisi verilmez.</p>
      <div id="organization-document-dropzone" role="group" aria-label="Vergi levhası dosyası bırakma alanı" style="padding:1em;border:1px dashed #777">
        <p>PDF, JPEG veya PNG dosyasını buraya sürükleyip bırakın ya da dosya seçicisini kullanın.</p>
        <label>Belge dosyası seçin
          <input type="file" id="organization-document-file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png">
        </label>
        <button type="button" id="organization-document-upload">Belgeyi yükle</button>
      </div>
      <p id="organization-document-status" role="status" aria-live="polite"></p>
      <div id="organization-document-info"></div>
    </div>
    <p id="organization-draft-status" role="status" aria-live="polite"></p>
    <button type="button" id="organization-application-submit" hidden>Başvuruyu platform incelemesine gönder</button>
    <button type="button" id="organization-draft-withdraw" hidden>Seçili taslağı geri çek</button>
    <button type="button" id="organization-draft-new">Yeni taslak</button>
    <button type="button" id="organization-draft-refresh">Taslaklarımı yenile</button>
    <div id="organization-draft-list"></div>
    <button id="organization-draft-more" type="button" hidden>Daha eski taslakları göster</button>
  </section>
  <section id="organization-review-panel" hidden style="grid-column:1/-1">
    <h2>İncelenecek işletme başvuruları</h2>
    <p>Yalnız açık platform organization.review görevi olan yetkili personel için gönderilmiş başvurular listelenir. Bu liste otomatik kuruluş veya mağaza yetkisi açmaz.</p>
    <p id="organization-review-status" role="status" aria-live="polite"></p>
    <div id="organization-review-list"></div>
    <button id="organization-review-more" type="button" hidden>Daha eski başvuruları göster</button>
    <button id="organization-review-refresh" type="button">Başvuru kuyruğunu yenile</button>
  </section>
  <section id="platform-closing-email-link-panel" hidden aria-labelledby="platform-closing-email-link-title">
    <h2 id="platform-closing-email-link-title">E-posta güvenlik bildirimi</h2>
    <p>Bu bağlantı mağaza kapatma bildirimine aittir. Kendi güvenli hesabınızdan inceleyin; başka bir kişinin onayına gerek yoktur.</p>
    <button type="button" id="platform-closing-email-link-open">Kapatma bildirimini güvenle aç</button>
    <p id="platform-closing-email-link-status" role="status" aria-live="polite"></p>
  </section>
  <h2>Kuruluşlarım</h2><div id="organizations"></div><form id="select-org"><label>Kuruluş kimliği<input name="organization" required></label><button>Kuruluş erişimini kontrol et</button></form><pre id="detail"></pre>

  <section id="platform-closing-panel" hidden style="grid-column:1/-1" aria-labelledby="platform-closing-title">
    <h2 id="platform-closing-title">Platform mağaza kapatma süreci</h2>
    <p>Gerekçeli platform kararı yeni satışları derhal durdurur. Korunan Owner'lar gerekçeyi okuyabilir ve itiraz edebilir. E-posta bütün korunan Owner'lara gönderilir. En az bir doğrulanmış teslim veya dört denemeden sonra yöneticilere kalıcı uyarı ile 10+20 günlük itiraz süresi otomatik başlar. Owner onayı beklenmez. Kalıcı kapanış ve isim hakkı devri ayrı, henüz etkin değildir.</p>
    <p id="platform-closing-status" role="status" aria-live="polite"></p>
    <p id="platform-closing-mail-status" role="status" aria-live="polite"></p>
    <form id="platform-closing-form">
      <label>Mağaza<select name="seller_id" required></select></label>
      <label>Gerekçe<textarea name="reason" minlength="10" maxlength="500" required rows="3"></textarea></label>
      <label><input name="confirmed" type="checkbox" required> Satışların hemen duracağını, e-posta denemeleri ve itiraz sayacının ayrı işleyeceğini anladım.</label>
      <button type="submit">Gerekçeli kapatma sürecini başlat</button>
    </form>
    <button type="button" id="platform-closing-refresh">Mağazaları yenile</button>
    <button type="button" id="platform-closing-more" hidden>Diğer mağazalar</button>
  </section>
  <section id="platform-closing-review-panel" hidden style="grid-column:1/-1"
    aria-labelledby="platform-closing-review-title">
    <h2 id="platform-closing-review-title">Bağımsız mağaza kapatma incelemesi</h2>
    <p>Yalnız açık platform inceleme görevi ve güncel güçlü girişle gerekçeli karar verilebilir.
    Kapatmayı başlatan görevli aynı dosyayı karara bağlayamaz. Karar yeni satışları kendiliğinden açmaz.</p>
    <p id="platform-closing-review-status" role="status" aria-live="polite"></p>
    <div id="platform-closing-review-list"></div>
    <button type="button" id="platform-closing-review-refresh">Dosyaları yenile</button>
    <button type="button" id="platform-closing-review-more" hidden>Diğer dosyalar</button>
  </section>
  <section id="store-approval-panel" hidden style="grid-column:1/-1">
    <h2>Platform mağaza onayları</h2>
    <p>Yalnız açık mağaza onay görevi ve güncel güçlü giriş ile bekleyen mağazalar onaylanabilir. Kuruluş ile mağaza bağı başvuruda kurulmuştur; ayrıca ilişki onayı yapılmaz.</p>
    <p id="store-approval-status" role="status" aria-live="polite"></p>
    <div id="store-approval-list"></div>
    <h3>Askıdaki mağazalar</h3>
    <p>Askı nedeni giderilmiş ve adı/bağlantısı hâlâ kendisine ait mağaza, ayrı platform kararıyla aynı kimlikle yeniden açılabilir. Devredilen adla açılamaz.</p>
    <div id="store-reactivation-list"></div>
    <button id="store-approval-refresh" type="button">Bekleyen mağazaları yenile</button>
    <button id="store-approval-older" type="button" hidden>Önceki başvuruları göster</button>
    <button id="store-approval-newer" type="button" hidden>Yeni başvurulara dön</button>
  </section>
  <section id="store-rename-review-panel" hidden style="grid-column:1/-1">
    <h2>Platform mağaza ad/bağlantı değişiklik başvuruları</h2>
    <p>Yalnız mağaza onay görevi olan platform görevlisi inceleyebilir. Ret mağazayı değiştirmez. Onay, aynı mağazanın adını ve bağlantısını birlikte değiştirir; eski bağlantı yeni adrese yönlendirilmez. Belirsiz sonuçta aynı işlemi yeniden göndermeyin.</p>
    <p id="store-rename-review-status" role="status" aria-live="polite"></p>
    <div id="store-rename-review-list"></div>
    <button id="store-rename-review-refresh" type="button">İsim değişikliği başvurularını yenile</button>
    <button id="store-rename-review-older" type="button" hidden>Daha eski başvuruları göster</button>
    <button id="store-rename-review-newer" type="button" hidden>Yeni başvurulara dön</button>
  </section>
  <section id="store-application-panel" hidden style="grid-column:1/-1">
    <h3>Kuruluşun mağaza başvuruları</h3>
    <p>Kuruluş Owner'ı yeni mağaza başvurusu oluşturur. Mağaza doğrudan bu kuruluşa bağlanır; faaliyete geçmesi için platform yöneticisinin ayrıca mağazayı onaylaması gerekir.</p>
    <p>Kaydedilmiş taslağı yalnız korunan şirket Owner yetkilisi, güncel güçlü kimlik doğrulamasıyla gönderebilir. Çalışan taslak izni başvuru gönderme hakkı vermez.</p>
    <p id="store-application-status" role="status" aria-live="polite"></p>
    <div id="store-application-list"></div>
    <form id="store-application-form" hidden>
      <label>Mağaza adı<input name="name" required minlength="2" maxlength="120"></label>
      <label>Mağaza iletişim e-postası<input name="email" type="email" required maxlength="254"></label>
      <label>Para birimi (3 harf)<input name="currency_code" pattern="[a-z]{3}" maxlength="3" value="try" required></label>
      <button type="submit">Mağaza başvurusu oluştur</button>
    </form>
    <form id="store-draft-form" hidden>
      <p>Bu taslak yalnız seçili kuruluşa aittir. Kaydetmek başvuruyu göndermez ve mağaza açmaz.</p>
      <label>Önerilen mağaza adı<input name="name" required minlength="3" maxlength="40"></label>
      <label>Mağaza iletişim e-postası<input name="email" type="email" required maxlength="254"></label>
      <label>Para birimi<input name="currency_code" pattern="[a-z]{3}" maxlength="3" value="try" required></label>
      <button type="submit">Taslağı kaydet</button>
      <button id="store-draft-new" type="button">Yeni taslak</button>
    </form>
    <button id="store-applications-refresh" type="button">Başvuruları ve taslakları yenile</button>
  </section>

  <section id="store-draft-grants-panel" hidden style="grid-column:1/-1">
    <h3>Çalışanın mağaza başvuru taslağı izni</h3>
    <p>Yalnız korunan Owner, kendi şirketindeki etkin üyeye süresiz kişisel taslak izni verir veya geri alır. Bu izin mağaza başvurusu gönderme ya da mağaza açma hakkı vermez.</p>
    <p id="store-draft-grants-status" role="status" aria-live="polite"></p>
    <form id="store-draft-grants-form">
      <label>Şirket üyesi<select name="membership_id" required></select></label>
      <button type="submit" name="action" value="grant">Taslak için Yetkili yap</button>
      <button type="submit" name="action" value="revoke">Taslak için Yetkisiz yap</button>
    </form>
    <div id="store-draft-grants-list"></div>
    <button type="button" id="store-draft-grants-newer" hidden>Önceki çalışanlar</button>
    <button type="button" id="store-draft-grants-older" hidden>Sonraki çalışanlar</button>
    <button type="button" id="store-draft-grants-refresh">İzinleri yenile</button>
  </section>
  <section id="org-stores-panel" hidden aria-labelledby="org-stores-title" style="grid-column:1/-1">
    <h3 id="org-stores-title">Seçili kuruluşun mağazaları</h3>
    <p>Yalnızca bu kuruluşta oluşturulmuş, Mercur tarafından ayrıca onaylanmış ve erişim yetkiniz bulunan faal mağazalar listelenir. Bu görünüm satın alma veya satış işlemi yetkisi vermez.</p>
    <p id="org-stores-status" role="status" aria-live="polite"></p>
    <div id="org-stores"></div>
    <button id="org-stores-refresh" type="button" hidden>Mağazaları yenile</button>
    <section id="store-rename-panel" hidden aria-labelledby="store-rename-heading">
      <h3 id="store-rename-heading">Mağaza adı ve bağlantı değişikliği talebi</h3>
      <p>Talep platform onayına kadar mevcut mağaza adını veya bağlantısını değiştirmez.</p>
      <form id="store-rename-form">
        <label>Onaylı mağaza<select name="seller_id" required></select></label>
        <label>Önerilen yeni mağaza adı<input name="name" minlength="3" maxlength="120" required autocomplete="off"></label>
        <label>Önerilen yeni URL anahtarı<input name="handle" minlength="3" maxlength="60" pattern="[a-z0-9]+(-[a-z0-9]+)*" required autocomplete="off"></label>
        <fieldset><legend>Mağaza adı değişikliği hakkında önemli uyarı</legend>
          <p>Mağaza adınızı değiştirdiğinizde mağaza bağlantınız da değişecektir. Eski bağlantınız yeni bağlantınıza yönlendirilmeyecektir.</p>
          <p>Eski mağaza adınız ve bağlantınız ileride başka bir mağaza tarafından kullanılabilir. Bu durumda daha önce paylaştığınız eski bağlantıyı kullanan kişiler farklı bir mağazaya ulaşabilir.</p>
          <label><input name="risk_acknowledged" type="checkbox" required>Bu sonuçları okudum, anladım ve mağaza adımı değiştirmeyi kabul ediyorum.</label>
        </fieldset>
        <button type="submit" disabled>Değişiklik başvurusu gönder</button>
      </form>
      <p id="store-rename-status" role="status" aria-live="polite"></p>
      <div id="store-rename-history"></div>
      <button id="store-rename-refresh" type="button">Talep geçmişini yenile</button>
    </section>
    <section id="store-owner-pause-panel" hidden aria-labelledby="store-owner-pause-title">
      <h3 id="store-owner-pause-title">Mağazaya geçici ara ver</h3>
      <p>Geçici ara verme yeni satışları durdurur. Mağaza kimliği, adı, geçmiş siparişleri ve isim hakkı korunur. Bu işlem platform askısını veya başka bir kapanış nedenini kaldırmaz.</p>
      <p id="store-owner-pause-status" role="status" aria-live="polite"></p>
      <form id="store-owner-pause-form">
        <label>Mağaza<select name="seller_id" required></select></label>
        <button type="submit" name="action" value="pause" disabled>Geçici ara ver</button>
        <button type="submit" name="action" value="resume" disabled>Satışa devam et</button>
      </form>
      <button type="button" id="store-owner-pause-refresh">Durumu yenile</button>
    </section>
    <section id="store-owner-closing-panel" hidden aria-labelledby="store-owner-closing-title">
      <h3 id="store-owner-closing-title">Mağazayı kalıcı kapatma isteği (30 gün)</h3>
      <p>Başlattığınız anda yeni satışlar durur. İlk 30 takvim günü mağaza kimliği, geçmiş işlemler ve ad/URL hakkı saklanır. Süre dolmadan geri çekebilirsiniz; başka askı/finans engelleri varsa satış otomatik açılmaz. Kesinleşen kalıcı kapatma aynı mağaza kimliğiyle ve yeni adla dahi geri alınamaz.</p>
      <p>Zorunlu bildirim ve son kontroller tamamlanmadan otomatik geri dönülmez kapatma yapılmaz.</p>
      <p id="store-owner-closing-choice"></p>
      <p id="store-owner-closing-status" role="status" aria-live="polite"></p>
      <form id="store-owner-closing-form">
        <label><input name="consequences_acknowledged" type="checkbox"> Kapatma sürecini başlatmadan önce 30 günlük süreyi ve geri dönülmez sonuçlarını okudum, anladım.</label>
        <button type="submit" name="action" value="start" disabled>30 günlük kapatma sürecini başlat</button>
        <button type="submit" name="action" value="withdraw" disabled>Kapatma talebini geri çek</button>
      </form>
      <button type="button" id="store-owner-closing-refresh">Kapatma durumunu yenile</button>
    </section>
    <section id="store-platform-appeal-panel" hidden aria-labelledby="store-platform-appeal-title">
      <h3 id="store-platform-appeal-title">Platform kapatma kararı ve itiraz</h3>
      <p>Kapatma gerekçesini güvenle inceleyebilirsiniz. Satışlar platform kararıyla hemen durur. 10+20 günlük itiraz süresi güvenilir e-posta teslimiyle veya dört gönderim girişimi sonrasında zorunlu yönetici uyarısı güvenle kaydedilince başlayabilir. Kesin kapatma ayrı inceleme ve güvenlik koşullarına bağlıdır.</p>
      <p id="store-platform-appeal-reason"></p>
      <p id="store-platform-appeal-status" role="status" aria-live="polite"></p>
      <p id="store-platform-review-decision" hidden></p>
      <form id="store-platform-appeal-form">
        <label>İtiraz gerekçesi<textarea name="reason" minlength="10" maxlength="500" rows="3" required></textarea></label>
        <button type="submit" disabled>İtirazı gönder</button>
      </form>
      <form id="store-platform-final-review-form" hidden>
        <p>İlk 10 gün içinde itiraz oluşturulmadıysa, 10–30. gün arasında bağımsız platform incelemesi isteyebilirsiniz. Bu başvuru satışları yeniden açmaz.</p>
        <label>Üst inceleme gerekçesi<textarea name="reason" minlength="10" maxlength="500" rows="3" required></textarea></label>
        <button type="submit" disabled>Üst inceleme başvurusunu gönder</button>
      </form>
      <button type="button" id="store-platform-appeal-refresh">Kararı yenile</button>
    </section>
    <section id="store-block-panel" hidden aria-labelledby="store-block-title">
      <h3 id="store-block-title">Mağazanın alıcı kuruluş engelleri</h3>
      <p>Bu mağazanın bağlı olduğu kuruluşun Owner'ı, belirli bir alıcı kuruluşun bu mağazadan yeni satın alma uygunluğunu engelleyebilir veya engeli kaldırabilir. Diğer mağazalar etkilenmez. Bu işlem geçmiş siparişleri değiştirmez.</p>
      <p id="store-block-status" role="status" aria-live="polite"></p>
      <form id="store-block-form">
        <label>Onaylı mağaza<select name="seller_id" required></select></label>
        <label>Alıcı kuruluş kimliği<input name="buyer_organization_id" type="text" pattern="daorg_[A-Za-z0-9_-]{1,80}" required autocomplete="off" placeholder="daorg_..." /></label>
        <button type="submit" name="action" value="block">Kuruluşu bu mağazada engelle</button>
        <button type="submit" name="action" value="unblock">Engeli kaldır</button>
      </form>
    </section>
    <section id="store-price-group-panel" hidden aria-labelledby="store-price-group-title">
      <h3 id="store-price-group-title">Mağazanın özel fiyat grubu alıcıları</h3>
      <p>Kendi mağazanızın mevcut müşteri grubuna bir alıcı işletmeyi kabul edebilir veya gruptan çıkarabilirsiniz. Bu izin tek başına indirim ve ödeme açmaz.</p>
      <p id="store-price-group-status" role="status" aria-live="polite"></p>
      <form id="store-price-group-form">
        <label>Onaylı mağaza<select name="seller_id" required></select></label>
        <label>Mağazanın mevcut müşteri grupları<select id="store-price-group-choice" disabled><option value="">Mağazayı seçerek grupları yükleyin</option></select></label>
        <p id="store-price-group-options-status" role="status" aria-live="polite"></p>
        <label>Seçilen grubun kimliği<input name="customer_group_id" pattern="cusgroup_[A-Za-z0-9_-]+" placeholder="cusgroup_..." required autocomplete="off"></label>
        <label>Alıcı işletme kimliği<input name="buyer_organization_id" pattern="daorg_[A-Za-z0-9_-]{1,80}" placeholder="daorg_..." required autocomplete="off"></label>
        <button type="submit" name="action" value="grant">Gruba kabul et</button>
        <button type="submit" name="action" value="revoke">Gruptan çıkar</button>
        <button type="submit" name="action" value="read">Kaydı kontrol et</button>
      </form>
    </section>
    <section id="product-grants-panel" hidden aria-labelledby="product-grants-title">
      <h3 id="product-grants-title">Mağaza ürün düzenleme yetkileri</h3>
      <p>Korunan Owner grubunun izinleri sabittir; bu ekrandan değiştirilemez. Yalnız aktif sıradan çalışana, seçilen onaylı mağazada açık kişisel ürün izni verilebilir veya geri alınabilir. Grup Yetkisi henüz uygulanmadığından miras seçeneği gösterilmez. Mercur mağaza üyeliği ayrıca gerekir.</p>
      <p id="product-grants-status" role="status" aria-live="polite"></p>
      <p id="product-grants-effective" role="status" aria-live="polite"></p>
      <form id="product-grants-form">
        <label>Onaylı mağaza<select name="seller_id" required></select></label>
        <label>Aktif kuruluş üyesi<select name="membership_id" required></select></label>
        <button type="submit" name="action" value="grant">Yetkili — açık izin ver</button>
        <button type="submit" name="action" value="revoke">Yetkisiz — açık izni geri al</button>
      </form>
      <div id="product-grants-list"></div>
      <button id="product-grants-refresh" type="button">İzinleri yenile</button>
    </section>
  </section>
  <section id="buyer-context-panel" hidden aria-labelledby="buyer-context-title" style="grid-column:1/-1">
    <h3 id="buyer-context-title">Bu kuruluş adına alışveriş</h3>
    <p>Satın alma yetkiniz sunucuda doğrulanır. Bu doğrulama tek başına sepet, sipariş veya ödeme yetkisi vermez.</p>
    <p id="buyer-context-status" role="status" aria-live="polite"></p>
    <button id="buyer-context-refresh" type="button">Satın alma yetkimi yeniden denetle</button>
    <button id="buyer-customer-check" type="button">Doğrulanmış müşteri bağımı kontrol et</button>
    <p id="buyer-customer-status" role="status" aria-live="polite"></p>
    <section aria-labelledby="buyer-order-title">
      <h4 id="buyer-order-title">Önceki siparişi görüntüle</h4>
      <p>Yalnız bu kuruluşla ilişkilendirilmiş ve tamamlanmış bir sipariş gösterilebilir. Sepet ve ödeme hâlâ kapalıdır.</p>
      <form id="buyer-order-lookup">
        <label>Sipariş grubu kodu
          <input name="order_group_id" type="text" pattern="og_[A-Za-z0-9_-]{1,123}"
            maxlength="126" placeholder="og_..." autocomplete="off" required>
        </label>
        <button type="submit">Siparişi görüntüle</button>
      </form>
      <p id="buyer-order-status" role="status" aria-live="polite"></p>
      <ul id="buyer-order-items"></ul>
    </section>
    <section id="buyer-catalog-panel" hidden aria-labelledby="buyer-catalog-title">
      <h4 id="buyer-catalog-title">Bu kuruluşun görebildiği ürünler</h4>
      <p>İlk onaylı mağazaların yayımlanmış ürünleri gösterilir. Doğrudan TRY liste fiyatı ve yalnız bu işletmeye mağazanın açıkça verdiği geçerli gruba ait özel TRY referans fiyatı varsa gösterilir. Bunlar nihai ödeme tutarı değildir; vergi, kur dönüşümü, sepet ve ödeme kapalıdır.</p>
      <p id="buyer-catalog-status" role="status" aria-live="polite"></p>
      <ul id="buyer-catalog-items"></ul>
      <button id="buyer-catalog-refresh" type="button">Ürünleri güncelle</button>
      <button id="buyer-catalog-prev" type="button" disabled>Önceki mağaza dilimi</button>
      <button id="buyer-catalog-next" type="button" disabled>Sonraki mağaza dilimi</button>
    </section>
  </section>
  <section id="buyer-follow-panel" hidden aria-labelledby="buyer-follow-title" style="grid-column:1/-1">
    <h3 id="buyer-follow-title">Bu işletmenin takip ettiği mağazalar</h3>
    <p>Katalogdan kaldırılmış veya askıya alınmış mağazaları da takipten çıkarabilirsiniz. Bu liste yalnız seçili işletmenin kayıtlarını gösterir; mağaza veya alışveriş yetkisi vermez.</p>
    <p id="buyer-follow-status" role="status" aria-live="polite"></p>
    <ul id="buyer-follow-items"></ul>
    <button id="buyer-follow-refresh" type="button">Takipleri baştan yenile</button>
    <button id="buyer-follow-next" type="button" disabled>Sonraki takipler</button>
  </section>
  <section id="buyer-grants-panel" hidden aria-labelledby="buyer-grants-title" style="grid-column:1/-1">
    <h3 id="buyer-grants-title">Kuruluş satın alma izinleri</h3>
    <p>Korunmuş Owner, kendi aktif kuruluşu için ayrıca satın alma izni almaz. Diğer aktif üyeler için satın alma iznini Owner verir veya iptal eder. Kişisel müşteri bağlantısı tek başına kuruluş adına işlem yetkisi vermez. Mağazanın alıcı kuruluş engeli herkese uygulanır. Bu ekrandan sipariş veya ödeme yapılamaz.</p>
    <p id="buyer-grants-status" role="status" aria-live="polite"></p>
    <form id="buyer-grants-form">
      <label>Kuruluş üyesi<select name="membership_id" required></select></label>
      <button type="submit" name="action" value="grant">Satın alma izni ver</button>
      <button type="submit" name="action" value="revoke">Satın alma iznini iptal et</button>
    </form>
    <div id="buyer-grants-list"></div>
    <button id="buyer-grants-refresh" type="button">İzinleri yenile</button>
  </section>
  <section id="product-draft-panel" hidden aria-labelledby="product-draft-title" style="grid-column:1/-1">
    <h3 id="product-draft-title">Mağazama ürün taslağı ekle</h3>
    <p>Kendi kuruluşunun onaylı mağazalarında korunmuş Owner veya ayrı ürün düzenleme izni olan aktif üye taslak oluşturabilir. Sonuç belirsizse aynı işlemi yeniden göndermeyin.</p>
    <p id="product-draft-status" role="status" aria-live="polite"></p>
    <p id="product-draft-guidance" hidden>Bir ürün düzenleme izni, tek başına Mercur mağaza üyeliği oluşturmaz. İşlem için doğrulanmış üye hesabı, aynı mağazadaki canlı Mercur üyeliği ve geçerli kuruluş izni birlikte gerekir. <a href="#link-account">Mevcut üye hesabınızı doğrulayın</a>; mağaza üyeliğinin ayrıca yetkili biçimde kurulması gerekir. Hesap bağlamak tek başına işlem yetkisi vermez.</p>
    <form id="product-draft-form">
      <label>Yetkili mağaza<select name="seller_id" required></select></label>
      <label>Ürün başlığı<input name="title" required minlength="2" maxlength="120"></label>
      <button type="submit">Taslak oluştur</button>
    </form>
    <button id="product-draft-refresh" type="button">Yetkili mağazaları yenile</button>
    <button id="product-draft-check" type="button" hidden>İşlem sonucunu kontrol et</button>
  </section>
  <p id="memberships-status" role="status" aria-live="polite" aria-atomic="true"></p><button id="memberships-refresh" type="button" hidden disabled>Üye listesini yenile</button>
  <div id="memberships" aria-describedby="memberships-status" aria-busy="false"></div>
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
    <label>Davet edilecek kişi rolü<select name="role" required><option value="member">Üye</option></select></label>
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
  <button id="platform-store-policy-open" type="button">Şirket mağaza başvuru hakkı yönetimi</button>
  <section id="platform-store-policy-panel" hidden style="grid-column:1/-1">
    <h3>Şirketin yeni mağaza başvuru hakkı</h3>
    <p>Bu işlem yalnız yetkili platform görevlisine açıktır. Mevcut faal mağazalar bu ayardan etkilenmez. Bekleyen başvurular karar verilmeden korunur.</p>
    <form id="platform-store-policy-form">
      <label>Şirket kimliği<input id="platform-store-policy-organization" name="organization_id" pattern="daorg_[A-Za-z0-9_-]{1,80}" required></label>
      <label>İşlem gerekçesi<input id="platform-store-policy-reason" name="reason" minlength="10" maxlength="500" required></label>
      <button id="platform-store-policy-read" type="button">Mevcut hakkı doğrula</button>
      <button id="platform-store-policy-apply" type="submit" disabled>Henüz durum doğrulanmadı</button>
    </form>
    <p id="platform-store-policy-status" role="status" aria-live="polite"></p>
  </section>
  <h2>Kuruluş oluşturma</h2><p>Bu işlem açık platform görevi ve güncel güçlü doğrulama gerektirir. İlk iki Owner sunucuda doğrulanır.</p>
  <form id="provision"><label>Yeni kuruluş adı<input name="name" maxlength="200" required></label><label>Birinci Owner türü<select name="type1"><option>user</option><option>member</option><option>customer</option></select></label><label>Birinci Owner kimliği<input name="owner1" required></label><label>İkinci Owner türü<select name="type2"><option>user</option><option>member</option><option>customer</option></select></label><label>İkinci Owner kimliği<input name="owner2" required></label><button>Kuruluş oluştur</button></form><pre id="provision-result"></pre>
  <h2>Satıcı ve müşteri çalışma bağlamı</h2><form id="seller"><label>Satıcı kimliği<input name="seller" required></label><button>Satıcı erişimini doğrula</button></form><button id="customer">Müşteri bağlamımı aç</button><pre id="actor-result"></pre>
  <h2>Kişisel giriş ve doğrulanmış hesaplar</h2>
  <p>Giriş hesabına bağlı kayıt korunur; yalnız ayrıca doğrulanmış ek hesap bağlantıları kaldırılabilir.</p>
  <div id="bindings"></div>
  <form id="link-account"><label>Bağlanacak hesap türü<select name="actor_type"><option>member</option><option>customer</option></select></label><label>İkincil hesap e-postası<input name="email" type="email" autocomplete="off" required></label><label>İkincil hesap parolası<input name="password" type="password" autocomplete="off" required></label><button>İkincil hesabı doğrula</button></form>
  <form id="link-confirm" hidden><p>İki hesap sahipliği sunucuda doğrulanır; kuruluş veya platform yetkisi verilmez.</p><label>İkincil hesap TOTP kodu<input name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code"></label><button>Hesap bağlantısını tamamla</button></form>
  <button id="logout">Bu cihazdan çık</button><button id="logout-all">Tüm cihazlardan çık</button></section>
  <script nonce="${nonce}">
  let viewEpoch=0,loadedScope='',observing=false,selectedStoreOwner=false;
  let csrf=''; const el=id=>document.getElementById(id); const status=t=>el('status').textContent=t;
  async function api(path,options={}){
    const epoch=viewEpoch;let r;
    try{r=await fetch('/personal/'+path,{credentials:'same-origin',...options,
      headers:{'Content-Type':'application/json','x-csrf-token':csrf,...options.headers}})}
    catch{const e=new Error('Sonuç belirsiz. İşlemi yeniden göndermeyin; kayıt kontrolü gerekli.');
      e.uncertain=true;throw e}
    // Even HTTP 200 cannot prove a price-group POST's outcome if its body is
    // truncated, unreadable or not a JSON object. Do not claim rejection.
    const groupWrite=path==='store-price-groups'&&options.method==='POST';
    const draftWrite=path==='organization-applications'&&options.method==='POST';
    const followWrite=path==='store-follows'&&options.method==='POST';
    const policyWrite=path==='platform/store-application-policy'&&options.method==='POST';
    const storeApplicationWrite=path==='store-applications'&&options.method==='POST';
    const renameWrite=path==='store-rename-requests'&&options.method==='POST';
    const grantWrite=path==='store-draft-permissions'&&options.method==='POST';
    const platformStoreWrite=path==='platform/stores'&&options.method==='POST';
    const closingWrite=['store-owner-closing','store-platform-closing','store-platform-closing-final-review','platform/store-closings','platform/store-closing-reviews','store-platform-closing-email-visit'].includes(path)&&options.method==='POST';
    const write=groupWrite||draftWrite||followWrite||policyWrite||storeApplicationWrite||grantWrite||platformStoreWrite||renameWrite||closingWrite;
    let data;
    try{
      data=await r.json();
      if(write&&(!data||typeof data!=='object'||Array.isArray(data)))
        throw new Error('Geçersiz yazma yanıtı');
    }catch(error){
      if(!write)throw error;
      const e=new Error('Sonuç belirsiz. İşlemi yeniden göndermeyin; kayıt kontrolü gerekli.');
      e.uncertain=true;throw e;
    }
    if(epoch!==viewEpoch)throw new Error('Görünüm yenilendi');
    if(!r.ok){
      const e=new Error(data?.message||'İşlem reddedildi');
      e.httpStatus=r.status;e.uncertain=r.status>=500;throw e
    }
    return data;
  }
  // Hash fragments never reach a web server or reverse-proxy access log.
  // Reading the link is optional: not visiting never blocks the automatic
  // admin-alert fallback. Do not let email scanners pre-confirm anything.
  let platformMailLinkToken='';
  const hashMatch=typeof location!=='undefined'&&typeof location.hash==='string'?
    location.hash.match(/^#closing_notice=([a-f0-9]{64})$/):null;
  if(hashMatch){
    platformMailLinkToken=hashMatch[1];
    if(typeof history!=='undefined'&&typeof history.replaceState==='function')
      history.replaceState(null,'',location.pathname+location.search);
    el('platform-closing-email-link-panel').hidden=false;
  }
  if(typeof el==='function' && el('platform-closing-email-link-open'))
    el('platform-closing-email-link-open').onclick=async()=>{
    const msg=el('platform-closing-email-link-status');
    if(!platformMailLinkToken)return;
    if(document.hidden||el('workspace').hidden){
      msg.textContent='Önce güvenli kişisel hesabınızda oturum açın.';
      return;
    }
    const button=el('platform-closing-email-link-open');
    button.disabled=true;
    msg.textContent='Mağaza bildirimi güvenli biçimde doğrulanıyor…';
    try{
      const result=await api('store-platform-closing-email-visit',{
        method:'POST',
        body:JSON.stringify({token:platformMailLinkToken})
      });
      if(result.viewed!==true||typeof result.reason!=='string'||
         typeof result.deadline_started!=='boolean')
        throw Error('Bildirimin kimliği doğrulanamadı');
      msg.textContent='Mağaza kapatma kararının gerekçesi: '+
        result.reason+
        (result.deadline_started?
         '. İtiraz süreci işlemektedir. Ayrıntıları kuruluş alanınızdan inceleyin.':
         '. İtiraz saati henüz başlamadı.');
      platformMailLinkToken='';
      button.hidden=true;
    }catch{
      msg.textContent='Bağlantı doğrulanamadı. Güncel ve yetkili kuruluş alanınızdan kapatma bildirimini kontrol edin.';
      button.disabled=false;
    }
  };

  let recoveryCodes=[];
  let notificationRequest=0,notificationOffset=0,notificationNext=null;
  const organizationActivityCodes=[
    'service_repair','retail_store','wholesale_distribution',
    'manufacturing','fleet_operations','insurance_claims'];
  let organizationDraftId='',organizationDraftVersion=0,organizationDraftRequest=0;
  let organizationDraftCursor=null,organizationDraftSaving=false,organizationDraftMutation=0;
  let organizationDocumentSelection=null;
  function lockOrganizationDraftSelection(busy){
    organizationDraftSaving=busy;
    for(const control of el('organization-draft-form').querySelectorAll('input,select,button'))
      control.disabled=busy;
    for(const id of ['organization-draft-new','organization-draft-refresh','organization-draft-more','organization-draft-withdraw','organization-application-submit','organization-document-upload','organization-document-file'])
      if(el(id)) el(id).disabled=busy;
    for(const button of el('organization-draft-list').querySelectorAll('button'))
      button.disabled=busy;
  }
  function clearOrganizationDrafts(){
    organizationDraftMutation++;organizationDraftRequest++;
    organizationDraftId='';organizationDraftVersion=0;organizationDraftCursor=null;
    organizationDocumentSelection=null;
    el('organization-document-file').value='';
    el('organization-draft-list').replaceChildren();
    el('organization-draft-more').hidden=true;
    el('organization-draft-withdraw').hidden=true;
    el('organization-application-submit').hidden=true;
    el('organization-document-section').hidden=true;
    el('organization-document-status').textContent='';
    el('organization-document-info').textContent='';
    el('organization-draft-status').textContent='';
    el('organization-draft-form').reset();
    lockOrganizationDraftSelection(false);
  }
  async function refreshOrganizationDrafts(append=false){
    const cursor=append?organizationDraftCursor:null;
    if(append&&!cursor)return;
    const request=++organizationDraftRequest,epoch=viewEpoch;
    if(!append){
      el('organization-draft-list').replaceChildren();
      el('organization-draft-withdraw').hidden=true;
    }
    el('organization-draft-more').disabled=true;
    el('organization-draft-status').textContent='Taslaklar kontrol ediliyor…';
    try{
      const data=await api('organization-applications'+
        (cursor?'?cursor='+encodeURIComponent(cursor):''));
      if(request!==organizationDraftRequest||epoch!==viewEpoch)return;
      if(!Array.isArray(data.drafts)||
        !(data.next_cursor===null||typeof data.next_cursor==='string'&&
          /^[A-Za-z0-9_-]{1,256}$/.test(data.next_cursor)))
        throw Error('Taslaklar doğrulanamadı');
      for(const item of data.drafts){
        if(!item||typeof item.id!=='string'||!['draft','withdrawn','submitted','in_review','correction_requested','rejected','approved'].includes(item.status)||
          !Number.isSafeInteger(item.version)||item.version<1||
          !['individual_business','legal_company'].includes(item.business_kind)||
          !Array.isArray(item.declared_activities)||item.declared_activities.length>6||
          !item.declared_activities.every(v=>organizationActivityCodes.includes(v))||
          (item.declared_activities.length===0?
            item.primary_activity!==null:!item.declared_activities.includes(item.primary_activity)))
          throw Error('Taslaklar doğrulanamadı');
        const row=document.createElement('p'),button=document.createElement('button');
        row.textContent=item.legal_name+(
          item.status==='draft'?' — Taslak (henüz gönderilmedi)':
          item.status==='submitted'?' — Başvuru gönderildi (inceleme bekliyor)':
          item.status==='in_review'?' — İncelemede (platform görevlisi değerlendiriyor)':
          item.status==='correction_requested'?' — Düzeltme istendi':
          item.status==='rejected'?' — Başvuru reddedildi':
          item.status==='approved'?' — Başvuru onaylandı':
          ' — Geri çekildi (yeniden düzenlenemez)'
        );
        if(item.review_notes && ['correction_requested','rejected'].includes(item.status)){
          const detail=document.createElement('span');
          detail.textContent=' — İnceleme açıklaması: '+item.review_notes;
          row.append(detail);
        }
        if(item.has_document){
          const dlBtn=document.createElement('button');
          dlBtn.type='button';dlBtn.textContent='Belgeyi indir';
          dlBtn.disabled=organizationDraftSaving;
          dlBtn.onclick=()=>{
            window.open('/personal/organization-applications?action=document&application_id='+encodeURIComponent(item.id),'_blank');
          };
          const scanHelp=document.createElement('span');
          scanHelp.textContent=' — Son virüs taraması durumu güncel ClamAV imzalarıyla erişimde yeniden doğrulanır.';
          row.append(scanHelp,dlBtn);
        }
        if(['draft','correction_requested'].includes(item.status)){
          button.type='button';button.textContent=item.status==='correction_requested'?'Düzelt ve yeniden gönder':'Taslağı düzenle';
          button.disabled=organizationDraftSaving;
          button.onclick=()=>{
          if(organizationDraftSaving)return;
          organizationDraftId=item.id;organizationDraftVersion=item.version;
          organizationDocumentSelection=null;
          el('organization-document-file').value='';
          el('organization-document-status').textContent=item.has_document?
            'Belge yüklü; virüs taraması güncel imzalarla yetkili erişimde doğrulanır.':
            'Henüz belge yüklenmedi ve virüs taraması yapılmadı.';
          const form=el('organization-draft-form');
          for(const input of form.querySelectorAll('input[name=declared_activities]'))
            input.checked=item.declared_activities.includes(input.value);
          form.elements.primary_activity.value=item.primary_activity||'';
          form.elements.business_kind.value=item.business_kind;
          form.elements.legal_name.value=item.legal_name;
          form.elements.landline_phone.value=item.landline_phone;
          if(form.elements.tax_identifier)form.elements.tax_identifier.value=item.tax_identifier||'';
          form.querySelector('button').disabled=false;
          el('organization-draft-withdraw').hidden=false;
          el('organization-document-section').hidden=false;
          if(item.has_document){
            el('organization-document-info').textContent='Yüklü vergi levhası: v'+item.document.version+' ('+item.document.mime_type+', '+item.document.original_byte_length+' bayt)';
            // A correction must be saved or replaced before resubmission.
            el('organization-application-submit').hidden=item.status!=='draft';
          } else {
            el('organization-document-info').textContent='Henüz vergi levhası yüklenmedi (zorunlu).';
            el('organization-application-submit').hidden=true;
          }
          el('organization-draft-status').textContent=item.status==='correction_requested'?
            'Düzeltme istendi. Bilgileri kaydedin veya yeni belge yükleyin; ardından başvuruyu yeniden gönderin.':
            'Seçilen özel taslak düzenlenebilir; gönderilmedi.';
          form.elements.legal_name.focus();
        };
          row.append(button);
        }
        if(['submitted','in_review'].includes(item.status)){
          const withdrawSubmitted=document.createElement('button');
          withdrawSubmitted.type='button';withdrawSubmitted.textContent='Başvuruyu geri çek';
          withdrawSubmitted.disabled=organizationDraftSaving;
          withdrawSubmitted.onclick=()=>void withdrawOrganizationApplication(item.id,item.version);
          row.append(withdrawSubmitted);
        }
        el('organization-draft-list').append(row);
      }
      organizationDraftCursor=data.next_cursor;
      el('organization-draft-more').hidden=!organizationDraftCursor;
      el('organization-draft-status').textContent=data.drafts.length?
        'Yalnız size ait taslaklar yüklendi.':'Başka taslak bulunamadı.';
      // The saving form may restore its actual document state from this fresh GET.
      return data.drafts.find(item=>item.id===organizationDraftId)||null;
    }catch(error){
      if(request!==organizationDraftRequest||epoch!==viewEpoch)return;
      if([401,403].includes(error.httpStatus)){
        concealPrivateView();el('login').hidden=false;return;
      }
      el('organization-draft-status').textContent='Taslaklar yüklenemedi. Yenileyin.';
    }finally{
      if(request===organizationDraftRequest&&epoch===viewEpoch)
        el('organization-draft-more').disabled=organizationDraftSaving;
    }
  }
  el('organization-draft-new').onclick=()=>{
    if(organizationDraftSaving)return;
    organizationDraftId='';organizationDraftVersion=0;
    organizationDocumentSelection=null;
    el('organization-document-file').value='';
    el('organization-draft-form').reset();
    el('organization-draft-form').querySelector('button').disabled=false;
    el('organization-draft-withdraw').hidden=true;
    el('organization-draft-status').textContent='Yeni taslak; hiçbir başvuru henüz gönderilmedi.';
  };
  let organizationReviewRequest=0,organizationReviewCursor=null;
  function clearOrganizationReviews(){
    organizationReviewRequest++;
    organizationReviewCursor=null;
    el('organization-review-list').replaceChildren();
    el('organization-review-status').textContent='';
    el('organization-review-more').hidden=true;
    el('organization-review-more').disabled=false;
    el('organization-review-panel').hidden=true;
  }
  async function refreshOrganizationReviews(append=false){
    const panel=el('organization-review-panel');
    if(!panel)return;
    const more=el('organization-review-more');
    const cursor=append?organizationReviewCursor:null;
    if(append&&(!cursor||more.disabled||panel.hidden))return;
    const request=++organizationReviewRequest,epoch=viewEpoch,person=currentPersonId;
    const list=el('organization-review-list');
    if(!append){
      organizationReviewCursor=null;
      list.replaceChildren();
      more.hidden=true;
      panel.hidden=true;
    }
    more.disabled=true;
    if(document.hidden||el('workspace').hidden||!person){more.disabled=false;return;}
    const stillAuthorizedView=()=>request===organizationReviewRequest &&
      epoch===viewEpoch&&currentPersonId===person&&
      !document.hidden&&!el('workspace').hidden;
    try{
      const data=await api('organization-applications?action=review_queue'+
        (cursor?'&cursor='+encodeURIComponent(cursor):''));
      if(!stillAuthorizedView())return;
      if(!Array.isArray(data.applications)||
         (data.next_cursor!==null&&typeof data.next_cursor!=='string')||
         (append&&data.next_cursor===cursor))throw Error('Invalid review page');
      panel.hidden=false;
      for(const item of data.applications){
        const row=document.createElement('p');
        // A loaded row remains active while the same reviewer loads another page.
        // Only the async list response itself is tied to the request counter.
        const currentReviewView=()=>epoch===viewEpoch&&
          currentPersonId===person&&!document.hidden&&
          !el('workspace').hidden&&row.isConnected;
        const dupText=item.duplicate_review_required?' [Mükerrerlik İncelemesi Gerekli]':'';
        row.textContent=item.legal_name+' ('+item.business_kind+', VKN/TCKN: '+item.tax_identifier+')'+dupText+
          ' — Durum: '+(item.status==='in_review'?'İncelemede':'İnceleme bekliyor');
        if(item.has_document){
          const message=document.createElement('span');
          message.textContent=' — Vergi levhası: bu oturumda virüs taraması henüz doğrulanmadı; yalnız güvenli önizleme ile kontrol edilebilir. Ham belge indirmesi kapalı.';
          row.append(message);
        }
        const notesInput=document.createElement('input');
        notesInput.placeholder='İnceleme / düzeltme notu';
        row.append(notesInput);
        if(item.status==='submitted'){
          const startBtn=document.createElement('button');
          startBtn.type='button';startBtn.textContent='İncelemeye Al';
          // The page-1 button remains valid when the *same* Person opens
          // page 2. Request counters protect stale async list responses, not
          // live buttons. Server still rechecks staff grant and CAS version.
          startBtn.onclick=async()=>{
            if(!currentReviewView()||startBtn.disabled)return;
            startBtn.disabled=true;
            try{
              await api('organization-applications',{method:'POST',body:JSON.stringify({
                action:'review_decision',application_id:item.id,expected_version:item.version,
                decision:'start_review'
              })});
              if(currentReviewView())await refreshOrganizationReviews();
            }catch{
              if(currentReviewView()){
                startBtn.disabled=false;
                el('organization-review-status').textContent='İncelemeye alma doğrulanamadı; başvuru kuyruğunu yenileyin.';
              }
            }
          };
          row.append(startBtn);
        }
        const reviewOutcome=document.createElement('span');
        reviewOutcome.setAttribute('role','status');
        reviewOutcome.setAttribute('aria-live','polite');
        const correctBtn=document.createElement('button');
        correctBtn.type='button';correctBtn.textContent='Düzeltme İste';
        const rejectBtn=document.createElement('button');
        rejectBtn.type='button';rejectBtn.textContent='Reddet';
        const submitReviewDecision=async(decision,button)=>{
          if(!currentReviewView()||button.disabled)return;
          const notes=notesInput.value.trim();
          if(!notes){
            reviewOutcome.textContent=decision==='reject'?
              ' — Ret gerekçesi zorunludur.':' — Düzeltme notu zorunludur.';
            return;
          }
          correctBtn.disabled=true;rejectBtn.disabled=true;
          reviewOutcome.textContent=' — Karar gönderiliyor…';
          try{
            const result=await api('organization-applications',{method:'POST',
              body:JSON.stringify({action:'review_decision',application_id:item.id,
                expected_version:item.version,decision,notes})});
            if(!currentReviewView())return;
            if(result.status!==(decision==='reject'?'rejected':'correction_requested'))
              throw Error('Karar sonucu doğrulanamadı');
            await refreshOrganizationReviews();
          }catch(error){
            if(!currentReviewView())return;
            if(error.httpStatus===409){
              // The old row is stale: never replay a decision under a new version.
              await refreshOrganizationReviews();
              if(epoch===viewEpoch&&currentPersonId===person&&
                 !document.hidden&&!el('workspace').hidden)
                el('organization-review-status').textContent=
                  'Başvuru başka işlemle değişti; güncel inceleme kuyruğu yüklendi. Karar kaydedilmedi.';
              return;
            }
            reviewOutcome.textContent=error.uncertain?
              ' — Karar sonucu belirsiz. Tekrar göndermeyin; kuyruğu yenileyip güncel durumu kontrol edin.':
              ' — Karar tamamlanamadı. Yetkinizi ve başvuru durumunu kontrol edin.';
            // Unknown outcome must not be blindly retried from this row.
            if(!error.uncertain){correctBtn.disabled=false;rejectBtn.disabled=false;}
          }
        };
        correctBtn.onclick=()=>void submitReviewDecision('request_correction',correctBtn);
        rejectBtn.onclick=()=>void submitReviewDecision('reject',rejectBtn);
        row.append(correctBtn,rejectBtn,reviewOutcome);
        // Raw PDFs and images never enter the staff browser. The backend
        // allows approval only after a fresh local malware scan and isolated
        // rasterization; this button is NOT a client-side authority grant.
        const previewNote=document.createElement('span');
        previewNote.setAttribute('role','status');
        previewNote.setAttribute('aria-live','polite');
        previewNote.textContent=' — Güncel virüs taraması doğrulanıyor; güvenli önizleme açılmadan onay kapalı.';
        row.append(previewNote);
        if(item.has_document){
          const previewBtn=document.createElement('button');
          previewBtn.type='button';previewBtn.textContent='Belgeyi Güvenli Önizle';
          const safeImage=document.createElement('img');
          safeImage.alt='Güvenli taramadan geçen vergi levhasının tüm sayfaları';
          safeImage.hidden=true;
          safeImage.style.display='block';
          // Keep PDF pages at a legible width even inside a narrow two-column
          // workspace. A scaled-to-fit tall PNG otherwise falsely appears
          // fully viewed without scrolling through the document.
          safeImage.style.width='600px';
          safeImage.style.maxWidth='none';
          safeImage.style.height='auto';
          safeImage.referrerPolicy='no-referrer';
          const previewBox=document.createElement('div');
          previewBox.hidden=true;
          previewBox.tabIndex=0;
          previewBox.setAttribute('role','region');
          previewBox.setAttribute('aria-label','Vergi levhasının tüm sayfaları, aşağı kaydırarak inceleyin');
          previewBox.style.maxWidth='min(100%, 600px)';
          previewBox.style.maxHeight='950px';
          previewBox.style.overflowY='auto';
          previewBox.style.overflowX='auto';
          previewBox.append(safeImage);
          const approveBtn=document.createElement('button');
          approveBtn.type='button';approveBtn.textContent='İşletmeyi Onayla';
          approveBtn.hidden=true;approveBtn.disabled=true;
          let previewReady=false;
          const updateCompletePreview=()=>{
            if(!currentReviewView()||!row.isConnected||safeImage.hidden)return;
            // A combined all-page PNG must not be scaled down into a single
            // unreadable page. Enable the UI approval only at its bottom.
            previewReady=previewBox.scrollHeight-previewBox.scrollTop-previewBox.clientHeight<=4;
            approveBtn.hidden=!previewReady;approveBtn.disabled=!previewReady;
            // A successful preview follows ClamAV verdicts for the
            // original and rasterized document; not a permanent guarantee.
            previewNote.textContent=previewReady?
              ' — Virüs taramasından geçirilmiştir: mevcut imzalarla tehdit algılanmadı. Güvenli görselin tamamı gösterildi; onayda belge bütünlüğü ve ClamAV imza güncelliği doğrulanır, gerekirse yeniden taranır.':
              ' — Virüs taramasından geçirilmiştir: mevcut imzalarla tehdit algılanmadı. Belgenin bütün sayfalarını görmek için görselin sonuna kaydırın; onayda belge bütünlüğü ve ClamAV imza güncelliği doğrulanır, gerekirse yeniden taranır.';
          };
          previewBox.onscroll=updateCompletePreview;
          previewBtn.onclick=()=>{
            if(!currentReviewView()||!row.isConnected)return;
            previewReady=false;approveBtn.hidden=true;approveBtn.disabled=true;
            previewBtn.disabled=true;safeImage.hidden=true;previewBox.hidden=true;
            previewBox.scrollTop=0;
            previewNote.textContent=' — ClamAV güncelliği kontrol ediliyor; gerekirse yeniden taranıyor ve güvenli görsel hazırlanıyor.';
            safeImage.onload=()=>{
              if(!currentReviewView()||!row.isConnected)return;
              safeImage.hidden=false;previewBox.hidden=false;
              previewBtn.disabled=false;
              updateCompletePreview();
            };
            safeImage.onerror=()=>{
              if(!currentReviewView()||!row.isConnected)return;
              previewReady=false;safeImage.hidden=true;previewBox.hidden=true;
              approveBtn.hidden=true;approveBtn.disabled=true;
              previewBtn.disabled=false;
              previewNote.textContent=' — Virüs taraması doğrulanamadı veya güvenli görsel açılamadı. Tarama veya güvenli önizleme kullanılamıyor; onay kapalı. Belgeyi açmayın; yeniden deneyin.';
            };
            safeImage.src='/personal/organization-applications?action=review_preview&application_id='+
              encodeURIComponent(item.id);
          };
          approveBtn.onclick=async()=>{
            if(!previewReady||approveBtn.disabled||!currentReviewView()||!row.isConnected)return;
            previewReady=false;approveBtn.disabled=true;
            try{
              await api('organization-applications',{method:'POST',body:JSON.stringify({
                action:'review_decision',application_id:item.id,
                expected_version:item.version,decision:'approve',
                notes:notesInput.value.trim()||undefined
              })});
              await refreshOrganizationReviews();
            }catch{
              // Authorization, scan freshness, preview failure and stale
              // document versions never produce optimistic UI success.
              if(currentReviewView()&&row.isConnected){
                safeImage.hidden=true;previewBox.hidden=true;approveBtn.hidden=true;
                previewNote.textContent=' — Onay tamamlanamadı; güvenli incelemeyi yeniden başlatın.';
                previewBtn.disabled=false;
              }
            }
          };
          row.append(previewBtn,previewBox,approveBtn);
        }
        list.append(row);
      }
      organizationReviewCursor=data.next_cursor;
      more.hidden=!organizationReviewCursor;
      el('organization-review-status').textContent=list.children.length?
        list.children.length+' başvuru listelendi.':'İnceleme bekleyen başvuru yok.';
    }catch{
      if(stillAuthorizedView()){
        // Fail closed if authorization, connectivity or cursor validity is uncertain.
        clearOrganizationReviews();
      }
    }finally{
      if(stillAuthorizedView())more.disabled=false;
    }
  }
  el('organization-review-refresh').onclick=()=>void refreshOrganizationReviews();
  el('organization-review-more').onclick=()=>void refreshOrganizationReviews(true);
  el('organization-draft-refresh').onclick=()=>{
    if(!organizationDraftSaving)void refreshOrganizationDrafts();
  };
  el('organization-draft-more').onclick=()=>{
    if(!organizationDraftSaving)void refreshOrganizationDrafts(true);
  };
  async function withdrawOrganizationApplication(id,version){
    if(organizationDraftSaving||!id||!Number.isSafeInteger(version)||version<1||
       document.hidden||el('workspace').hidden)return;
    const epoch=viewEpoch;
    const mutation=++organizationDraftMutation;
    lockOrganizationDraftSelection(true);
    let uncertain=false;
    try{
      const result=await api('organization-applications',{method:'POST',
        body:JSON.stringify({action:'withdraw',application_id:id,expected_version:version})});
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      if(result.application_id!==id||result.status!=='withdrawn'||
         result.version!==version+1)throw Error('Geri çekme sonucu belirsiz');
      organizationDraftId='';organizationDraftVersion=0;
      el('organization-draft-withdraw').hidden=true;
      el('organization-application-submit').hidden=true;
      el('organization-document-section').hidden=true;
      el('organization-draft-form').reset();
      await refreshOrganizationDrafts();
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      el('organization-draft-status').textContent=
        'Başvuru/taslak geri çekildi; belge ve denetim geçmişi korundu.';
    }catch(error){
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      uncertain=!!error.uncertain;
      el('organization-draft-status').textContent=uncertain?
        'Geri çekme sonucu belirsiz; tekrar göndermeyin. Taslakları yenileyip durumu kontrol edin.':
        error.httpStatus===409?
          'Taslak değişmiş. Taslakları yenileyip güncel durumu kontrol edin.':
          'Geri çekme yapılamadı. Oturumu ve taslak durumunu kontrol edin.';
    }finally{
      if(mutation===organizationDraftMutation&&epoch===viewEpoch){
        lockOrganizationDraftSelection(false);
        if(uncertain)el('organization-draft-withdraw').disabled=true;
      }
    }
  }
  el('organization-draft-withdraw').onclick=()=>
    void withdrawOrganizationApplication(organizationDraftId,organizationDraftVersion);
  el('organization-draft-form').onsubmit=async e=>{
    e.preventDefault();
    const form=e.currentTarget,button=form.querySelector('button');
    if(organizationDraftSaving||button.disabled||document.hidden||el('workspace').hidden)return;
    const selectedActivities=Array.from(
      form.querySelectorAll('input[name=declared_activities]:checked'),x=>x.value);
    const primaryActivity=form.elements.primary_activity.value;
    if(!selectedActivities.length||!selectedActivities.includes(primaryActivity)){
      el('organization-draft-status').textContent=
        'En az bir faaliyet ve bu faaliyetlerden birini ana faaliyet olarak seçin.';
      return;
    }
    // Capture the exact payload before disabling fields, then block selection
    // and edits until the HTTP result has been processed.
    const payload={...Object.fromEntries(new FormData(form)),
      declared_activities:selectedActivities,primary_activity:primaryActivity};
    if(!payload.tax_identifier)delete payload.tax_identifier;
    const id=organizationDraftId||'daorgapp_'+crypto.randomUUID().replaceAll('-','');
    organizationDraftId=id;
    const version=organizationDraftVersion,epoch=viewEpoch;
    const mutation=++organizationDraftMutation;
    lockOrganizationDraftSelection(true);
    let uncertain=false;
    try{
      const data=await api('organization-applications',{method:'POST',
        body:JSON.stringify({...payload,application_id:id,expected_version:version})});
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      if(data.application_id!==id||data.status!=='draft'||data.version!==version+1)
        throw Error('Taslak sonucu belirsiz');
      organizationDraftVersion=data.version;
      el('organization-document-section').hidden=false;
      el('organization-application-submit').hidden=true;
      // Saving application fields must not erase a previously scanned document.
      // Reconcile from an authorized fresh GET, not from an optimistic POST.
      const refreshed=await refreshOrganizationDrafts();
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      if(!refreshed||refreshed.id!==id||refreshed.status!=='draft'||
         refreshed.version!==data.version||
         (refreshed.has_document&&!refreshed.document)){
        el('organization-document-info').textContent='Belge durumu doğrulanamadı; taslakları yeniden açın.';
        el('organization-draft-status').textContent=
          'Taslak kaydedildi; belge durumu doğrulanamadı. Taslakları yenileyin.';
        return;
      }
      if(refreshed.has_document){
        const doc=refreshed.document;
        el('organization-document-info').textContent=
          'Yüklü vergi levhası: v'+doc.version+' ('+doc.mime_type+', '+doc.original_byte_length+' bayt)';
        el('organization-document-status').textContent=organizationDocumentSelection?
          'Yeni belge seçildi ancak henüz yüklenmedi; yüklemek için düğmeye basın.':
          'Önceki belge korundu; virüs taraması güncel imzalarla erişimde doğrulanır.';
        el('organization-application-submit').hidden=!!organizationDocumentSelection;
        el('organization-draft-status').textContent=organizationDocumentSelection?
          'Taslak kaydedildi; seçilen yeni belgeyi yükleyin.':
          'Taslak kaydedildi. Yüklü vergi levhası korundu; başvuruyu gönderebilirsiniz.';
      }else{
        el('organization-document-info').textContent='Henüz vergi levhası yüklenmedi (zorunlu).';
        el('organization-document-status').textContent='Henüz belge yüklenmedi ve virüs taraması yapılmadı.';
        el('organization-draft-status').textContent=
          'Taslak kaydedildi. Vergi levhası yükleyip başvuruyu gönderebilirsiniz.';
      }
    }catch(error){
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      uncertain=!!error.uncertain;
      el('organization-draft-status').textContent=uncertain?
        'Kayıt sonucu belirsiz; yeniden göndermeyin. Taslaklarımı yenile ile kontrol edin.':
        error.httpStatus===409?
          'Değişiklik bulunamadı veya taslak güncellendi. Taslaklarımı yenileyip bilgileri kontrol edin.':
          'Taslak kaydedilemedi. Bilgileri ve oturumunuzu kontrol edin.';
    }finally{
      if(mutation===organizationDraftMutation&&epoch===viewEpoch){
        lockOrganizationDraftSelection(false);
        if(uncertain)button.disabled=true;
      }
    }
  };
  el('organization-document-upload').onclick=async()=>{
    const fileInput=el('organization-document-file');
    const file=organizationDocumentSelection||fileInput.files?.[0];
    if(!file){
      el('organization-document-status').textContent='Lütfen bir PDF, JPEG veya PNG dosyası seçin.';
      return;
    }
    if(file.size > 10 * 1024 * 1024){
      el('organization-document-status').textContent='Dosya boyutu 10 MiB sınırını aşıyor.';
      return;
    }
    if(organizationDraftSaving||!organizationDraftId||organizationDraftVersion<1)return;
    const id=organizationDraftId,version=organizationDraftVersion,epoch=viewEpoch;
    const mutation=++organizationDraftMutation;
    lockOrganizationDraftSelection(true);
    el('organization-document-status').textContent='Belge yükleniyor ve virüs taramasından geçiriliyor…';
    try{
      const reader=new FileReader();
      const base64Promise=new Promise((resolve,reject)=>{
        reader.onload=()=>resolve(String(reader.result).split(',')[1]);
        reader.onerror=reject;
      });
      reader.readAsDataURL(file);
      const file_base64=await base64Promise;
      const result=await api('organization-applications',{
        method:'POST',
        body:JSON.stringify({
          action:'upload_document',
          application_id:id,
          expected_version:version,
          filename:file.name,
          file_base64:file_base64
        })
      });
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      organizationDraftVersion=result.version;
      el('organization-document-status').textContent='Vergi levhası başarıyla yüklendi ve virüs taramasından geçirildi: mevcut imzalarla tehdit algılanmadı. Güvenli önizleme özel alanda hazır.';
      el('organization-document-info').textContent='Yüklü vergi levhası: v'+result.document.version+' ('+result.document.mime_type+', '+result.document.original_byte_length+' bayt)';
      el('organization-application-submit').hidden=false;
      organizationDocumentSelection=null;
      fileInput.value='';
      await refreshOrganizationDrafts();
    }catch(err){
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      el('organization-document-status').textContent=err.uncertain?
        'Belge yükleme veya tarama sonucu belirsiz. Önce taslakları yenileyip kontrol edin; otomatik yeniden yükleme yapılmadı.':
        'Belge yüklenemedi veya virüs taraması başarısız oldu. Güvenli erişim açılmadı; belgeyi kontrol edin.';
    }finally{
      if(mutation===organizationDraftMutation&&epoch===viewEpoch){
        lockOrganizationDraftSelection(false);
      }
    }
  };

  // Drop and file-picker share the existing authenticated upload button and
  // server validation. A drop never starts a POST or changes a draft by itself.
  function chooseOrganizationDocument(file){
    const input=el('organization-document-file');
    organizationDocumentSelection=null;
    if(organizationDraftSaving||!organizationDraftId||organizationDraftVersion<1||
       document.hidden||el('workspace').hidden||el('organization-document-section').hidden){
      input.value='';return;
    }
    if(!(file instanceof File)||!/^.{1,160}[.](?:pdf|jpe?g|png)$/i.test(file.name)||
       file.size<1||file.size>10*1024*1024){
      input.value='';
      el('organization-document-status').textContent='Yalnız PDF, JPEG veya PNG biçiminde, en fazla 10 MiB dosya seçin.';
      return;
    }
    organizationDocumentSelection=file;
    el('organization-application-submit').hidden=true;
    el('organization-document-status').textContent='Dosya seçildi: '+file.name+'. Henüz virüs taramasından geçirilmedi. Belgeyi yükle düğmesine basınca tarama başlayacak.';
  }
  el('organization-document-file').onchange=e=>chooseOrganizationDocument(e.currentTarget.files?.[0]);
  const taxDropzone=el('organization-document-dropzone');
  taxDropzone.ondragover=e=>{
    e.preventDefault();
    if(!organizationDraftSaving&&!document.hidden&&!el('organization-document-section').hidden)
      taxDropzone.style.outline='2px dashed currentColor';
  };
  taxDropzone.ondragleave=()=>{taxDropzone.style.outline='';};
  taxDropzone.ondrop=e=>{
    e.preventDefault();taxDropzone.style.outline='';
    if(!e.dataTransfer||e.dataTransfer.files.length!==1){
      organizationDocumentSelection=null;
      el('organization-document-file').value='';
      el('organization-document-status').textContent='Lütfen aynı anda yalnız bir belge bırakın.';
      return;
    }
    el('organization-document-file').value='';
    chooseOrganizationDocument(e.dataTransfer.files[0]);
  };

  el('organization-application-submit').onclick=async()=>{
    if(organizationDraftSaving||!organizationDraftId||organizationDraftVersion<1||
       document.hidden||el('workspace').hidden)return;
    const id=organizationDraftId,version=organizationDraftVersion,epoch=viewEpoch;
    const mutation=++organizationDraftMutation;
    lockOrganizationDraftSelection(true);
    let uncertain=false;
    try{
      const result=await api('organization-applications',{
        method:'POST',
        body:JSON.stringify({
          action:'submit',
          application_id:id,
          expected_version:version
        })
      });
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      if(result.application_id!==id||result.status!=='submitted'||result.version!==version+1)
        throw Error('Başvuru sonucu belirsiz');
      organizationDraftId='';organizationDraftVersion=0;
      el('organization-draft-withdraw').hidden=true;
      el('organization-application-submit').hidden=true;
      el('organization-document-section').hidden=true;
      el('organization-draft-form').reset();
      await refreshOrganizationDrafts();
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      el('organization-draft-status').textContent=
        'Başvuru platform incelemesine başarıyla gönderildi. Yönetici onayı bekleniyor; işletme yetkisi henüz verilmedi.';
    }catch(error){
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      uncertain=!!error.uncertain;
      el('organization-draft-status').textContent=uncertain?
        'Başvuru sonucu belirsiz; tekrar göndermeyin. Taslakları yenileyip durumu kontrol edin.':
        error.httpStatus===409?
          'Taslak değişmiş. Taslakları yenileyip güncel durumu kontrol edin.':
          'Başvuru gönderilemedi. Zorunlu alanları ve vergi levhasını kontrol edin.';
    }finally{
      if(mutation===organizationDraftMutation&&epoch===viewEpoch){
        lockOrganizationDraftSelection(false);
        if(uncertain)el('organization-application-submit').disabled=true;
      }
    }
  };

  function clearNotifications(){
    notificationRequest++;notificationOffset=0;notificationNext=null;
    el('notification-bell').hidden=true;el('notification-bell').setAttribute('aria-expanded','false');
    el('notification-panel').hidden=true;el('notification-list').replaceChildren();
    el('notification-count').textContent='';el('notification-status').textContent='';
    el('notification-next').hidden=true;
  }
  async function notifications(offset=0){
    const request=++notificationRequest;
    // The personal bell must not inherit a revoked/stale Organization URL.
    // The backend authorizes each receipt by Person and live entitlement.
    const notificationPath='notifications';
    el('notification-list').replaceChildren();el('notification-list').setAttribute('aria-busy','true');
    el('notification-status').textContent='Bildirimler yükleniyor…';el('notification-count').textContent='';
    el('notification-next').hidden=true;
    try{
      const data=await api(notificationPath+'?offset='+offset);
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
  let currentOrg='',currentPersonId='',linkIntent='',organizationRequest=0,storeRequest=0,mfaState=null,timelineCursor=null,timelineOrg='',timelineRequest=0;
  let mobileVersion=null,mobileRequest=0;
  function clearPersonMobile(){
    mobileRequest++;mobileVersion=null;
    const form=el('person-mobile-form');
    form.hidden=true;form.elements.mobile_phone.value='';
    form.querySelector('button').disabled=false;
    el('person-mobile-status').textContent='';
  }
  async function refreshPersonMobile(){
    const request=++mobileRequest,epoch=viewEpoch,person=currentPersonId;
    const form=el('person-mobile-form');
    mobileVersion=null;form.hidden=true;
    try{
      const result=await api('profile');
      if(request!==mobileRequest||epoch!==viewEpoch||person!==currentPersonId||
         document.hidden||el('workspace').hidden)return false;
      if(!result||!Number.isSafeInteger(result.version)||result.version<0||
         (result.mobile_phone!==null&&typeof result.mobile_phone!=='string')||
         result.phone_verified!==false)throw new Error('Kişisel iletişim bilgisi doğrulanamadı');
      mobileVersion=result.version;
      form.elements.mobile_phone.value=result.mobile_phone||'';
      form.querySelector('button').disabled=false;
      el('person-mobile-status').textContent=result.mobile_phone
        ?'Kişisel cep telefonu kayıtlı; numaranın sahipliği doğrulanmadı.'
        :'Kişisel cep telefonu henüz kaydedilmedi.';
      form.hidden=false;
      return true;
    }catch{
      if(request!==mobileRequest||epoch!==viewEpoch||person!==currentPersonId)return false;
      clearPersonMobile();
      el('person-mobile-status').textContent='Kişisel iletişim bilgisi şu anda okunamıyor.';
      return false;
    }
  }
  el('person-mobile-form').onsubmit=async e=>{
    e.preventDefault();
    const form=e.target,button=form.querySelector('button');
    if(form.hidden||mobileVersion===null||el('workspace').hidden)return;
    const version=mobileVersion,number=form.elements.mobile_phone.value;
    const epoch=viewEpoch,person=currentPersonId,request=++mobileRequest;
    button.disabled=true;
    try{
      const result=await api('profile',{method:'POST',body:JSON.stringify({
        mobile_phone:number,expected_version:version
      })});
      if(epoch!==viewEpoch||person!==currentPersonId||request!==mobileRequest)return;
      if(!result||result.mobile_phone!==number||result.phone_verified!==false||
         !Number.isSafeInteger(result.version))throw new Error('Kaydetme yanıtı doğrulanamadı');
      const readbackOk=await refreshPersonMobile();
      if(!readbackOk&&epoch===viewEpoch&&person===currentPersonId&&
         !document.hidden&&!el('workspace').hidden)
        status('Cep telefonu için kayıt yanıtı alındı ancak güncel kayıt yeniden okunamadı. Tekrar göndermeden önce oturumunuzu yenileyip kaydı kontrol edin.');
    }catch(err){
      if(epoch!==viewEpoch||person!==currentPersonId||request!==mobileRequest)return;
      if(err?.httpStatus===403){
        // A definite denial is not an uncertain write. Do not retry or
        // disguise expired strong authentication as a network failure.
        clearPersonMobile();
        if(!document.hidden&&!el('workspace').hidden)
          status('Cep telefonu kaydı reddedildi. Güvenlik doğrulamanız güncel olmayabilir veya oturum erişiminiz reddedilmiş olabilir. Oturumu kilitleyip yeniden giriş yapın; kayıt otomatik tekrarlanmadı.');
        return;
      }
      // A missing write response never triggers a second POST. Re-read from
      // the authoritative Person row; do not report success from old UI state.
      const readbackOk=await refreshPersonMobile();
      if(epoch!==viewEpoch||person!==currentPersonId||document.hidden||el('workspace').hidden)return;
      if(readbackOk){
        el('person-mobile-status').textContent='Kaydetme yanıtı alınamadı. Güncel telefon kaydını kontrol edin; işlem otomatik tekrarlanmadı.';
      }else{
        status('Cep telefonu kaydının sonucu doğrulanamadı. Bağlantınızı kontrol edip yeniden giriş yaparak güncel kaydı okuyun; kayıt otomatik tekrarlanmadı.');
      }
    }finally{
      if(epoch===viewEpoch&&person===currentPersonId&&!form.hidden)
        button.disabled=false;
    }
  };
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
        statusEl.textContent = 'Denetim zaman cizelgesi icin yetki yok (korunmus Owner yetkisi gereklidir).';
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
  async function links(){
    const root=el('bindings');root.replaceChildren();
    const data=await api('links');
    if(!Array.isArray(data.bindings)||data.bindings.some(item=>
      !item||typeof item.is_primary!=='boolean'||
      !['member','customer'].includes(item.actor_type)||
      typeof item.id!=='string'||typeof item.actor_id!=='string'))
      throw Error('Hesap bağlantıları doğrulanamadı');
    for(const item of data.bindings){
      const primary=item.is_primary===true,active=!item.revoked_at;
      const p=document.createElement('p');
      const label=item.actor_type==='customer'?'müşteri':'satıcı';
      p.textContent=(primary?'Giriş hesabına bağlı '+label+' kaydı':'Doğrulanmış ek '+label+' hesabı')+
        ' — '+(active?'etkin':'bağlantısı kaldırılmış');
      root.append(p);
      // Only server-classified secondary bindings get a removal control.
      // AccountLinking.unlink independently rejects live login bindings.
      if(active&&item.is_primary===false){
        const b=document.createElement('button');
        b.textContent='Bağı kaldır '+item.id;
        b.onclick=async()=>{
          b.disabled=true;
          try{
            await api('links',{method:'POST',body:JSON.stringify({action:'unlink',binding_id:item.id})});
            await links();el('actor-result').textContent='';
            status('Hesap bağı kaldırıldı');
          }catch(e){status(e.message);if(!e.uncertain)b.disabled=false}
        };
        root.append(b);
      }
    }
  }
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
    // Never carry a verified role from the previously selected Organization.
    applicationRole='';
    clearNotifications();
    const request=++organizationRequest;currentOrg='';timelineCursor=null;timelineOrg='';++timelineRequest;el('audit-timeline-section').hidden=true;el('audit-timeline-entries').replaceChildren();el('audit-timeline-status').textContent='';el('invite-member').hidden=true;el('invite-result').textContent='';clearPendingInvitations();el('detail').textContent='';el('actor-result').textContent='';if(typeof el('seller').reset==='function')el('seller').reset();clearMemberships();clearOrganizationStores();history.replaceState(null,'','/personal');
    el('memberships').ariaBusy='true';el('memberships-status').textContent='Üyelikler yükleniyor…';
    try{const result=await api('organizations?id='+encodeURIComponent(id));if(request!==organizationRequest)return;
      currentOrg=id;el('detail').textContent=JSON.stringify(result.organizations[0],null,2);history.replaceState(null,'','/personal?organization='+encodeURIComponent(id));
      el('notification-bell').hidden=false;void notifications();
      const managerRole=result.organizations[0]?.role;
      selectedStoreOwner=managerRole==='owner';
      if(managerRole==='owner'){
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
      if(managerRole==='owner')await memberships(id,request);
      else if(request===organizationRequest&&currentOrg===id){
        clearMemberships();
        el('memberships-status').textContent='Uye listesi ve davet yonetimi icin yetki gerekli.';
      }
      if(request===organizationRequest&&currentOrg===id){
        if(['owner','member'].includes(managerRole))void storeApplications(id,request,managerRole);
        void organizationStores(id,request);
        void productDraftStores(id,request);
        void buyerContext(id,request);
        if(managerRole==='owner')void buyerFollowList(id,request);
        if(managerRole==='owner')void productPermissions(id,request);
        if(managerRole==='owner')void buyerPermissions(id,request);
        if(managerRole==='owner')void storeDraftPermissions(id,request);
        if(managerRole==='owner')void storeBlockStores(id,request);
      }
      if(request===organizationRequest&&currentOrg===id&&!el('pending-invitations-panel').hidden)
        void pendingInvitations(id,request);
      if(request===organizationRequest)status('Kuruluş erişimi doğrulandı');
    }catch(e){if(request!==organizationRequest)return;currentOrg='';timelineCursor=null;timelineOrg='';++timelineRequest;el('audit-timeline-section').hidden=true;el('audit-timeline-entries').replaceChildren();el('audit-timeline-status').textContent='';el('detail').textContent='';clearMemberships();clearOrganizationStores();clearPendingInvitations();el('memberships-status').textContent=membershipError(e);
      // A removed Organization must remain denied, but its former Member
      // still has a Person-scoped inbox for the revocation notice.
      // The server independently checks the live personal session.
      if(currentPersonId&&!document.hidden&&!el('workspace').hidden){
        el('notification-bell').hidden=false;void notifications();
      }
      status(e.message)}
  }
  function clearProductPermissions(){
    productPermissionRequest++;
    el('product-grants-panel').hidden=true;
    el('product-grants-list').replaceChildren();
    el('product-grants-status').textContent='';
    el('product-grants-effective').textContent='';
    const form=el('product-grants-form');
    // Fake DOMs in non-browser unit contracts may not implement querySelectorAll.
    if(typeof form.querySelectorAll==='function'){
      for(const select of form.querySelectorAll('select'))select.replaceChildren();
      for(const button of form.querySelectorAll('button'))button.disabled=true;
    }
  }
  function clearOrganizationStores(){
    clearStoreRename();
    clearStoreBlock();
    clearProductPermissions();
    clearBuyerPermissions();
    clearStoreDraftPermissions();
    clearBuyerContext();
    clearBuyerFollowList();
    clearProductDraft();
    storeRequest++;
    el('org-stores-panel').hidden=true;
    el('org-stores').replaceChildren();
    el('org-stores-status').textContent='';
    el('org-stores-refresh').hidden=true;
    applicationRequest++;
    el('store-application-panel').hidden=true;
    el('store-application-list').replaceChildren();
    el('store-application-status').textContent='';
    el('store-application-form').hidden=true;
    el('store-draft-form').hidden=true;
    const draftForm=el('store-draft-form');
    if(typeof draftForm.reset==='function')draftForm.reset();
    const draftSubmit=typeof draftForm.querySelector==='function'?draftForm.querySelector('button[type=submit]'):null;
    if(draftSubmit)draftSubmit.disabled=false;
    const form=el('store-application-form');
    if(typeof form.reset==='function')form.reset();
    const submit=typeof form.querySelector==='function'?form.querySelector('button'):null;
    if(submit)submit.disabled=false;
    applicationKey='';applicationRole='';storeDraftKey='';storeDraftVersion=0;
  }
  let storeApprovalRequest=0,storeApprovalPage=0;
  function clearStoreApprovals(){
    storeApprovalRequest++;storeApprovalPage=0;
    el('store-approval-older').hidden=true;el('store-approval-newer').hidden=true;
    el('store-approval-panel').hidden=true;
    el('store-approval-list').replaceChildren();
    el('store-reactivation-list').replaceChildren();
    el('store-approval-status').textContent='';
  }
  // Exceptional transfer uses a two-stage live Staff preview. Only the
  // verified server response supplies names; browser form values grant no right.
  function addExceptionalNameTransfer(entry,row,message,list){
    if(entry.name_review_required)return;
    const reveal=document.createElement('button');
    reveal.type='button';reveal.textContent='İstisnai ad hakkı devrini incele';
    const box=document.createElement('div');box.hidden=true;
    const legend=document.createElement('p');
    legend.textContent='İstisnai ad hakkı devri: yalnız geçerli platform kararıyla. Kaynak mağaza askıda kalır; hedef mağaza eski URL’yi hemen kullanamaz.';
    const makeField=(labelText,pattern)=>{
      const label=document.createElement('label'),input=document.createElement('input');
      label.textContent=labelText+' ';input.type='text';input.required=true;
      input.setAttribute('aria-label',labelText);
      if(pattern)input.pattern=pattern;
      label.append(input);box.append(label);
      return input;
    };
    box.dataset.transferSource=entry.seller_id;
    reveal.dataset.storeTransferSource=entry.seller_id;
    const targetApp=makeField('Hedef mağaza başvuru kimliği','daapp_[a-f0-9]{32}');
    targetApp.name='target_application_id';
    const targetSeller=makeField('Hedef Store kimliği','sel_[A-Za-z0-9_-]+');
    targetSeller.name='target_seller_id';
    const reasonLabel=document.createElement('label');
    reasonLabel.textContent='Gerekçeli istisnai devir kararı ';
    const reason=document.createElement('textarea');
    reason.required=true;reason.minLength=10;reason.maxLength=500;
    reason.setAttribute('aria-label','İstisnai ad hakkı devri gerekçesi');
    reason.name='reason';
    reasonLabel.append(reason);box.append(reasonLabel);
    const previewBtn=document.createElement('button');
    previewBtn.type='button';previewBtn.dataset.transferPreview=entry.seller_id;
    previewBtn.textContent='Kaynak ve hedefi doğrula';
    const decideBtn=document.createElement('button');
    decideBtn.type='button';decideBtn.disabled=true;
    decideBtn.textContent='Gerekçeli ad hakkı devrini onayla';
    decideBtn.dataset.transferDecide=entry.seller_id;
    const status=document.createElement('p');status.setAttribute('role','status');
    box.prepend(legend);box.append(previewBtn,decideBtn,status);
    let verified=null,uncertain=false,key='';
    const reset=()=>{
      verified=null;decideBtn.disabled=true;status.textContent='Hedefi yeniden doğrulayın.';
    };
    targetApp.oninput=reset;targetSeller.oninput=reset;
    reveal.onclick=()=>{
      box.hidden=!box.hidden;
      if(!box.hidden)targetApp.focus();
    };
    previewBtn.onclick=async()=>{
      if(!targetApp.checkValidity()||!targetSeller.checkValidity()||
         targetSeller.value===entry.seller_id){
        status.textContent='Geçerli ve farklı bir hedef mağaza ve başvuru kimliği girin.';
        return;
      }
      verified=null;decideBtn.disabled=true;previewBtn.disabled=true;
      const previewAt=viewEpoch;
      try{
        const params=new URLSearchParams({
          source_application_id:entry.application_id,source_seller_id:entry.seller_id,
          target_application_id:targetApp.value,target_seller_id:targetSeller.value
        });
        const result=await api('platform/store-name-transfers?'+params.toString());
        if(previewAt!==viewEpoch||document.hidden)return;
        if(result?.source?.seller_id!==entry.seller_id||
           result?.source?.application_id!==entry.application_id||
           result?.target?.seller_id!==targetSeller.value||
           result?.target?.application_id!==targetApp.value||
           result?.source?.status!=='suspended'||
           typeof result.source.name!=='string'||
           typeof result.source.handle!=='string'||
           typeof result.target.organization_name!=='string'||
           typeof result.target.name!=='string')
          throw new Error('Hedef doğrulanamadı');
        verified=result;uncertain=false;key='';
        status.textContent='Kaynak: '+result.source.organization_name+' / '+result.source.name+
          ' ('+result.source.handle+'). Hedef: '+
          result.target.organization_name+' / '+result.target.name+
          '. Ad ve URL hakkı dışında hiçbir veri taşınmayacak. Kaynak askıda kalacak.';
        decideBtn.disabled=false;
      }catch(e){
        if([401,403].includes(e.httpStatus)){clearStoreApprovals();return}
        status.textContent='Kaynak/hedef yetkisi veya ad hakkı doğrulanamadı; hiçbir karar oluşturulmadı.';
      }finally{previewBtn.disabled=false}
    };
    decideBtn.onclick=async()=>{
      const explanation=reason.value.trim();
      if(!verified||uncertain||explanation.length<10||explanation.length>500||
         [...explanation.matchAll(/[\\p{L}\\p{N}]/gu)].length<10){
        status.textContent='Önce hedefi doğrulayın; 10–500 karakterlik okunabilir gerekçe girin.';
        return;
      }
      if(!window.confirm('Kaynak '+verified.source.name+' mağazasının ad ve URL hakkını '+
        verified.target.organization_name+' / '+verified.target.name+
        ' mağazasına devredilsin mi? Kaynak mağaza askıda kalır; geçmiş veriler devredilmez.'))return;
      decideBtn.disabled=true;previewBtn.disabled=true;
      if(!key)key='dastr_'+crypto.randomUUID().replaceAll('-','');
      const decisionAt=viewEpoch;
      try{
        const result=await api('platform/store-name-transfers',{method:'POST',body:JSON.stringify({
          transfer_id:key,source_application_id:verified.source.application_id,
          source_seller_id:verified.source.seller_id,
          target_application_id:verified.target.application_id,
          target_seller_id:verified.target.seller_id,
          expected_name:verified.source.name,expected_handle:verified.source.handle,
          reason:explanation
        })});
        if(decisionAt!==viewEpoch||document.hidden)return;
        if(result.transfer_id!==key||result.status!=='assigned'||
           result.native_status!=='suspended'||result.awaiting_source_rename!==true){
          uncertain=true;throw new Error('Sonuç belirsiz');
        }
        status.textContent='Ad hakkı kararı kaydedildi. Eski Store askıdadır; Owner yeni ad ve URL önerip ayrı onay almalıdır.';
        message.textContent=status.textContent;
        void refreshStoreApprovals(true);
      }catch(e){
        if(decisionAt!==viewEpoch||document.hidden)return;
        uncertain=true;
        status.textContent='Devir sonucu belirsiz. Yeniden göndermeyin; denetim kaydını ve güncel mağaza haklarını kontrol edin.';
      }finally{
        previewBtn.disabled=false;
        if(!uncertain&&verified)decideBtn.disabled=false;
      }
    };
    row.append(reveal);list.append(box);
  }
  async function refreshStoreApprovals(keepOutcome=false){
    if(document.hidden||el('workspace').hidden)return;
    const seq=++storeApprovalRequest,epoch=viewEpoch;
    const panel=el('store-approval-panel'),list=el('store-approval-list'),
      suspendedList=el('store-reactivation-list'),message=el('store-approval-status');
    if(!keepOutcome)message.textContent='Mağazalar kontrol ediliyor…';
    try{
      const data=await api('platform/stores?page='+storeApprovalPage);
      if(seq!==storeApprovalRequest||epoch!==viewEpoch||document.hidden)return;
      if(data.page!==storeApprovalPage||typeof data.has_more!=='boolean'||
         !Array.isArray(data.pending)||data.pending.length>30||
         !Array.isArray(data.suspended)||data.suspended.length>30||
         !Array.isArray(data.reconciliation)||data.reconciliation.length>30||
         !Array.isArray(data.release_pending)||data.release_pending.length>30||
         data.release_pending.some(row=>!/^daapp_[a-f0-9]{32}$/.test(row?.application_id)||
           !/^sel_[A-Za-z0-9_-]+$/.test(row?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(row?.organization_id)||
           typeof row?.organization_name!=='string'||typeof row?.name!=='string'||
           typeof row?.on_hold!=='boolean')||
         data.suspended.some(row=>typeof row?.name_review_required!=='boolean'||
           !/^daapp_[a-f0-9]{32}$/.test(row?.application_id)||
           !/^sel_[A-Za-z0-9_-]+$/.test(row?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(row?.organization_id)||
           typeof row?.organization_name!=='string'||typeof row?.name!=='string'||
           typeof row?.on_hold!=='boolean')||
         data.reconciliation.some(row=>!/^daapp_[a-f0-9]{32}$/.test(row?.application_id)||
           !/^sel_[A-Za-z0-9_-]+$/.test(row?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(row?.organization_id)||
           typeof row?.organization_name!=='string'||typeof row?.name!=='string'||
           typeof row?.on_hold!=='boolean')||
         data.pending.some(row=>!/^daapp_[a-f0-9]{32}$/.test(row?.application_id)||
           !/^sel_[A-Za-z0-9_-]+$/.test(row?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(row?.organization_id)||
           typeof row?.organization_name!=='string'||typeof row?.name!=='string'||
           typeof row?.on_hold!=='boolean'))
        throw new Error('Onay listesi doğrulanamadı');
      panel.hidden=false;list.replaceChildren();suspendedList.replaceChildren();
      el('store-approval-older').hidden=!data.has_more;
      el('store-approval-newer').hidden=storeApprovalPage===0;
      if(!keepOutcome)message.textContent=(data.pending.length||data.suspended.length||data.reconciliation.length||data.release_pending.length)?
        'Mağaza inceleme listesi (sayfa '+(storeApprovalPage+1)+'):':
        data.has_more?'Bu sayfada bekleyen mağaza yok; önceki başvurulara bakın.':'Bu sayfada onay bekleyen mağaza yok.';
      for(const entry of data.pending){
        const line=document.createElement('p'),button=document.createElement('button');
        line.textContent=entry.organization_name+' — '+entry.name+' — '+entry.seller_id+
          (entry.on_hold?' — Yeni mağaza başvuru hakkı kapalı; inceleme bekletiliyor.':'')+' ';
        button.type='button';button.textContent='Mağazayı onayla';
        button.disabled=entry.on_hold;
        button.onclick=async()=>{
          button.disabled=true;
          message.textContent='Mağaza onayı gönderiliyor…';
          try{
            const result=await api('platform/stores',{method:'POST',
              body:JSON.stringify({application_id:entry.application_id,seller_id:entry.seller_id})});
            if(result.application_id!==entry.application_id||
               result.seller_id!==entry.seller_id||result.status!=='open'){
              const e=new Error('Onay sonucu doğrulanamadı; listeyi kontrol edin.');
              e.uncertain=true;throw e;
            }
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent='Mağaza onaylandı. Kuruluş yetkileri ayrıca denetlenir.';
            void refreshStoreApprovals(true);
          }catch(e){
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent=e.uncertain?
              'Onay sonucu belirsiz; yeniden göndermeyin, listeyi kontrol edin.':
              'Mağaza onaylanamadı: '+e.message;
            if(!e.uncertain)button.disabled=false;
          }
        };
        // A reasoned rejection remains available during a company
        // application pause. Approval remains disabled until policy reopens.
        const reason=document.createElement('textarea');
        reason.setAttribute('aria-label','Mağaza başvurusu ret gerekçesi');
        reason.maxLength=500;
        reason.placeholder='Ret gerekçesi (en az 10 karakter)';
        const reject=document.createElement('button');
        reject.type='button';reject.textContent='Gerekçeyle reddet';
        reject.dataset.storeReject='true';
        reject.onclick=async()=>{
          const explanation=reason.value.trim();
          if(explanation.length<10||explanation.length>500){
            message.textContent='Ret gerekçesi 10–500 karakter olmalıdır.';
            return;
          }
          reject.disabled=true;button.disabled=true;
          message.textContent='Mağaza başvurusu reddediliyor…';
          try{
            const result=await api('platform/stores',{method:'POST',
              body:JSON.stringify({action:'reject',
                application_id:entry.application_id,seller_id:entry.seller_id,
                reason:explanation})});
            if(result.application_id!==entry.application_id||
               result.seller_id!==entry.seller_id||result.status!=='rejected'){
              const e=new Error('Ret sonucu doğrulanamadı; listeyi kontrol edin.');
              e.uncertain=true;throw e;
            }
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent='Mağaza başvurusu gerekçesiyle reddedildi; mevcut onaylı mağazalar etkilenmedi.';
            void refreshStoreApprovals(true);
          }catch(e){
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent=e.uncertain?
              'Ret sonucu belirsiz; yeniden göndermeyin, listeyi kontrol edin.':
              'Başvuru reddedilemedi: '+e.message;
            if(!e.uncertain){reject.disabled=false;button.disabled=entry.on_hold;}
          }
        };
        line.append(button,reason,reject);list.append(line);
      }
      for(const entry of data.suspended){
        const row=document.createElement('p'),button=document.createElement('button');
        row.textContent=entry.organization_name+' — '+entry.name+' — '+entry.seller_id+
          (entry.name_review_required?
            ' — Ad/URL hakkı doğrulanamadı. İsim veya yetki incelemesi tamamlanmadan bu mağaza açılamaz. ':' ');
        button.type='button';button.textContent='Askı nedeni giderildi, mağazayı yeniden aç';
        button.disabled=entry.name_review_required;
        button.onclick=async()=>{
          // Display state alone never grants native authority: POST performs
          // the current-name/Staff/Store checks again under the Seller lock.
          if(entry.name_review_required)return;
          if(!window.confirm('Askı nedeni giderildi mi? Bu mağazanın ad ve bağlantı hakkı denetlenip aynı Store kimliğiyle açılacaktır.'))return;
          button.disabled=true;message.textContent='Mağaza yeniden açma kararı gönderiliyor…';
          try{
            const result=await api('platform/stores',{method:'POST',
              body:JSON.stringify({action:'unsuspend',
                application_id:entry.application_id,seller_id:entry.seller_id})});
            if(result.application_id!==entry.application_id||
               result.seller_id!==entry.seller_id||result.status!=='open'||
               result.action!=='unsuspend'){
              const err=new Error('Açma sonucu doğrulanamadı; listeyi kontrol edin.');
              err.uncertain=true;throw err;
            }
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent='Mağaza aynı kimlikle yeniden açıldı. Şirket ve mağaza yetkileri ayrıca denetlenir.';
            void refreshStoreApprovals(true);
          }catch(error){
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent=error.uncertain?
              'Açma sonucu belirsiz; yeniden göndermeyin, güncel listeyi kontrol edin.':
              'Mağaza açılamadı. Ad hakkı veya mağaza onayı değişmiş olabilir; yeniden inceleyin.';
            if(!error.uncertain)button.disabled=false;
          }
        };
        row.append(button);suspendedList.append(row);
        addExceptionalNameTransfer(entry,row,message,suspendedList);
      }
      // This is NOT a second Store opening. The native Store is still
      // suspended and a former claim is unresolved; only an authorized Staff
      // can close that uncertain intent under the shared Seller lock.
      for(const entry of data.release_pending){
        const row=document.createElement('p'),button=document.createElement('button');
        row.textContent=entry.organization_name+' — '+entry.name+
          ' — Mağaza hâlâ askıda; önceki açılma denemesi belirsiz. ';
        button.type='button';button.textContent='Önceki denemeyi güvenle kapat';
        button.onclick=async()=>{
          if(!window.confirm('Mağaza hâlâ askıda mı? Sistem önceki açılma isteğini denetim iziyle kapatır; mağazayı açmaz. Sonrasında ayrı bir yeniden açma kararı verilebilir.'))return;
          button.disabled=true;
          message.textContent='Mağazanın askıda olduğu ve önceki karar kaydı doğrulanıyor…';
          try{
            const result=await api('platform/stores',{method:'POST',
              body:JSON.stringify({action:'release',
                application_id:entry.application_id,seller_id:entry.seller_id})});
            if(result.application_id!==entry.application_id||
               result.seller_id!==entry.seller_id||result.status!=='suspended'||
               result.action!=='release'){
              const err=new Error('Karar kaydının kapanması doğrulanamadı.');
              err.uncertain=true;throw err;
            }
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent='Önceki belirsiz deneme kayda geçirilerek kapatıldı. Mağaza hâlâ askıda; yetkili görevli yeni bir açma kararı verebilir.';
            void refreshStoreApprovals(true);
          }catch(error){
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent=error.uncertain?
              'Sonuç belirsiz; yeniden göndermeyin, güncel listeyi kontrol edin.':
              'Önceki işlem kapatılamadı; başka bir açılma işlemi devam ediyor olabilir. Mağazanın durumunu kontrol edin.';
            if(!error.uncertain)button.disabled=false;
          }
        };
        row.append(button);suspendedList.append(row);
      }
      for(const entry of data.reconciliation){
        const row=document.createElement('p'),button=document.createElement('button');
        row.textContent=entry.organization_name+' — '+entry.name+
          ' — Mağaza açık; tamamlanma denetim kaydı eksik. ';
        button.type='button';button.textContent='Açılma kararının kaydını doğrula';
        button.onclick=async()=>{
          if(!window.confirm('Mağazanın daha önce açıldığı ve kaynak kararının bulunduğu yeniden denetlenecek. Native açma tekrarlanmayacaktır.'))return;
          button.disabled=true;
          message.textContent='Önceki açılma kararı ve gerçek mağaza durumu doğrulanıyor…';
          try{
            const result=await api('platform/stores',{method:'POST',
              body:JSON.stringify({action:'reconcile',
                application_id:entry.application_id,seller_id:entry.seller_id})});
            if(result.application_id!==entry.application_id||
               result.seller_id!==entry.seller_id||result.status!=='open'||
               result.action!=='reconcile'){
              const err=new Error('Kayıt tamamlama sonucu belirsiz.');
              err.uncertain=true;throw err;
            }
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent='Açılmış mağazanın karar kaydı ve Owner bildirimi tamamlandı.';
            void refreshStoreApprovals(true);
          }catch(error){
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent=error.uncertain?
              'Kayıt sonucu belirsiz; yeniden açma yapmayın, güncel listeyi kontrol edin.':
              'Kayıt tamamlanamadı; mağazanın güncel durumunu yetkili görevli incelemelidir.';
            if(!error.uncertain)button.disabled=false;
          }
        };
        row.append(button);suspendedList.append(row);
      }
    }catch(e){
      if(seq!==storeApprovalRequest||epoch!==viewEpoch)return;
      if([401,403].includes(e.httpStatus)){clearStoreApprovals();return}
      panel.hidden=false;list.replaceChildren();suspendedList.replaceChildren();
      message.textContent=keepOutcome?message.textContent+' Liste yenilenemedi.':'Onay listesi güvenli biçimde okunamadı.';
    }
  }
  el('store-approval-refresh').onclick=()=>{storeApprovalPage=0;void refreshStoreApprovals()};
  el('store-approval-older').onclick=()=>{
    if(storeApprovalPage<1000){storeApprovalPage++;void refreshStoreApprovals()}
  };
  el('store-approval-newer').onclick=()=>{
    storeApprovalPage=0;void refreshStoreApprovals()
  };
  let renameReviewRequest=0,renameReviewPage=0;
  function clearStoreRenameReviews(){
    renameReviewRequest++;renameReviewPage=0;
    el('store-rename-review-panel').hidden=true;
    el('store-rename-review-list').replaceChildren();
    el('store-rename-review-status').textContent='';
    el('store-rename-review-older').hidden=true;
    el('store-rename-review-newer').hidden=true;
  }
  async function refreshStoreRenameReviews(keepOutcome=false){
    if(document.hidden||el('workspace').hidden)return;
    const seq=++renameReviewRequest,epoch=viewEpoch;
    const panel=el('store-rename-review-panel');
    const list=el('store-rename-review-list'),message=el('store-rename-review-status');
    if(!keepOutcome)message.textContent='İsim değişikliği başvuruları doğrulanıyor…';
    try{
      const data=await api('platform/store-renames?page='+renameReviewPage);
      if(seq!==renameReviewRequest||epoch!==viewEpoch||document.hidden||
         el('workspace').hidden)return;
      if(data.page!==renameReviewPage||typeof data.has_more!=='boolean'||
         !Array.isArray(data.pending)||data.pending.length>20||
         data.pending.some(row=>
           !/^dasrn_[a-f0-9]{32}$/.test(row?.request_id)||
           !/^sel_[A-Za-z0-9_-]+$/.test(row?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(row?.organization_id)||
           typeof row?.organization_name!=='string'||
           !['open','suspended'].includes(row?.seller_status)||
           typeof row?.old_name!=='string'||typeof row?.old_handle!=='string'||
           typeof row?.proposed_name!=='string'||typeof row?.proposed_handle!=='string'||
           row.old_name.length>300||row.proposed_name.length>300))
        throw new Error('Başvuru listesi doğrulanamadı');
      panel.hidden=false;list.replaceChildren();
      el('store-rename-review-older').hidden=!data.has_more;
      el('store-rename-review-newer').hidden=renameReviewPage===0;
      if(!keepOutcome)message.textContent=data.pending.length?
        'İnceleme bekleyen ad/bağlantı talepleri (sayfa '+(renameReviewPage+1)+'):':
        'Bu sayfada inceleme bekleyen ad değişikliği yok.';
      for(const entry of data.pending){
        const line=document.createElement('div'),summary=document.createElement('p');
        summary.textContent=entry.organization_name+
          (entry.seller_status==='suspended'?' — Askıda (isim onayı mağazayı açmaz)':'')+' — '+entry.old_name+
          ' / '+entry.old_handle+' → '+entry.proposed_name+
          ' / '+entry.proposed_handle;
        const reason=document.createElement('textarea');
        reason.maxLength=500;reason.placeholder='Ret gerekçesi (10–500 karakter)';
        reason.setAttribute('aria-label',entry.organization_name+' için değişiklik ret gerekçesi');
        const reject=document.createElement('button');
        reject.type='button';reject.textContent='Bu değişiklik talebini gerekçeyle reddet';
        reject.onclick=async()=>{
          const explanation=reason.value.trim();
          // Avoid escape ambiguity between the HTML template and UI test harness.
          const slash=String.fromCharCode(92);
          const readable=new RegExp('['+slash+'p{L}'+slash+'p{N}'+slash+'p{Extended_Pictographic}]','u');
          const invisible=new RegExp(slash+'p{Default_Ignorable_Code_Point}','gu');
          let readableCount=0;
          for(const {segment} of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(explanation)){
            if(readable.test(segment.replace(invisible,'')))readableCount++;
          }
          if(explanation.length<10||explanation.length>500||readableCount<10){
            message.textContent='Ret gerekçesi en az 10 okunabilir karakter içermelidir (en fazla 500).';return;
          }
          reject.disabled=true;approve.disabled=true;message.textContent='Ret kararı saklanıyor…';
          try{
            const answer=await api('platform/store-renames',{
              method:'POST',body:JSON.stringify({action:'reject',
                request_id:entry.request_id,seller_id:entry.seller_id,
                reason:explanation})
            });
            if(seq!==renameReviewRequest||epoch!==viewEpoch||document.hidden)return;
            if(answer.status!=='rejected'||answer.request_id!==entry.request_id||
               answer.seller_id!==entry.seller_id){
              const err=Error('Ret yanıtı doğrulanamadı');err.uncertain=true;throw err;
            }
            message.textContent='Talep reddedildi; mevcut mağaza adı ve bağlantısı değişmedi.';
            void refreshStoreRenameReviews(true);
          }catch(error){
            if(seq!==renameReviewRequest||epoch!==viewEpoch||document.hidden)return;
            message.textContent=error.uncertain?
              'Ret sonucu belirsiz; işlemi tekrarlamayın, listeyi yenileyin.':
              error.httpStatus===409?
                'Talep başka işlemle sonuçlandı; güncel listeyi okuyun.':
                'Ret işlemi doğrulanamadı: '+error.message;
            // After an uncertain outcome or security failure no retry
            // from stale UI; only a fresh staff-authorized read re-enables.
          }
        };
        const approve=document.createElement('button');
        approve.type='button';approve.textContent='Yeni ad ve bağlantıyı onayla';
        approve.setAttribute('aria-label',entry.organization_name+
          ' mağazasının ad ve bağlantı değişikliğini onayla');
        approve.onclick=async()=>{
          if(!confirm(entry.seller_status==='suspended'?
            'Yalnız ad ve bağlantı değişecek. Mağaza askıda kalacak; ayrı yeniden açma kararı gerekir. Eski bağlantı yönlendirilmez. Onaylıyor musunuz?':
            'Bu onay mağazanın adını ve URL bağlantısını birlikte değiştirir. Eski bağlantı yeni adrese yönlendirilmez. Onaylıyor musunuz?'))return;
          approve.disabled=true;reject.disabled=true;
          message.textContent='Mağaza adı ve bağlantısı onaylanıyor…';
          try{
            const answer=await api('platform/store-renames',{
              method:'POST',body:JSON.stringify({action:'approve',
                request_id:entry.request_id,seller_id:entry.seller_id})
            });
            if(seq!==renameReviewRequest||epoch!==viewEpoch||document.hidden)return;
            if(answer.status!=='approved'||answer.request_id!==entry.request_id||
               answer.seller_id!==entry.seller_id){
              const err=Error('Onay yanıtı doğrulanamadı');err.uncertain=true;throw err;
            }
            message.textContent=entry.seller_status==='suspended'?
              'Yeni ad ve bağlantı onaylandı. Mağaza hâlâ askıda; ayrıca yeniden açma kararı gerekir.':
              'Mağazanın yeni adı ve bağlantısı etkinleşti. Eski bağlantıya yönlendirme yok.';
            void refreshStoreRenameReviews(true);
          }catch(error){
            if(seq!==renameReviewRequest||epoch!==viewEpoch||document.hidden)return;
            message.textContent=error.httpStatus===409?
              'Talep veya yeni ad artık uygun değil; güncel listeyi kontrol edin.':
              'Onay sonucu belirsiz; aynı işlemi tekrarlamayın. Yetkili listeden doğrulayın.';
            // Never re-enable a stale approval after an uncertain native write.
          }
        };
        line.append(summary,reason,reject,approve);list.append(line);
      }
    }catch(error){
      if(seq!==renameReviewRequest||epoch!==viewEpoch)return;
      clearStoreRenameReviews();
      if(![401,403].includes(error.httpStatus)){
        // Private rows stay erased; a fresh GET rechecks current Staff access.
        el('store-rename-review-panel').hidden=false;
        el('store-rename-review-status').textContent=
          'İsim değişikliği başvuruları şu anda doğrulanamıyor. Yeniden deneyin.';
      }
    }
  }
  el('store-rename-review-refresh').onclick=()=>{
    renameReviewPage=0;void refreshStoreRenameReviews();
  };
  el('store-rename-review-older').onclick=()=>{
    if(renameReviewPage<1000){renameReviewPage++;void refreshStoreRenameReviews()}
  };
  el('store-rename-review-newer').onclick=()=>{
    renameReviewPage=0;void refreshStoreRenameReviews();
  };
  async function storeApplications(org,request,role,keepOutcome=false){
    if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
    // Keep the verified Organization role separate from the transient form
    // visibility, which a platform-wide pause can legitimately hide.
    if(!['owner','member'].includes(role))return;
    // The Organization role came from the current verified membership GET.
    // Keep it for a read-only retry even when this first GET is 503/malformed.
    // Each retry rechecks live server permission; 401/403 still fail closed.
    applicationRole=role;
    const sequence=++applicationRequest;
    const panel=el('store-application-panel'),list=el('store-application-list'),message=el('store-application-status');
    panel.hidden=false;
    el('store-application-form').hidden=true;
    el('store-draft-form').hidden=true;
    list.replaceChildren();if(!keepOutcome)message.textContent='Başvurular kontrol ediliyor…';
    try{
      const result=await api('store-applications?organization_id='+encodeURIComponent(org));
      if(request!==organizationRequest||sequence!==applicationRequest||currentOrg!==org||document.hidden)return;
      if(typeof result.store_application_enabled!=='boolean'||
         !Array.isArray(result.drafts)||result.drafts.length>30||
         typeof result.has_more_drafts!=='boolean'||
         result.drafts.some(d=>!/^dasdraft_[a-f0-9]{32}$/.test(d?.id)||
           typeof d.name!=='string'||typeof d.email!=='string'||
           typeof d.currency_code!=='string'||!Number.isSafeInteger(d.version)||d.version<1)||
         result.draft_role!==role||
         !Array.isArray(result.applications)||result.applications.length>30||
        result.applications.some(a=>!/^daapp_[a-f0-9]{32}$/.test(a?.id)||!['reserved','creating','created'].includes(a?.status)||
          !(a.seller_id===null||a.seller_id===undefined||typeof a.seller_id==='string')||
          !['pending_approval','open','suspended','terminated','unknown'].includes(a?.seller_status)||
          !(a.rejection_reason===null||typeof a.rejection_reason==='string'&&a.rejection_reason.length<=500)))
        throw new Error('Başvuru yanıtı doğrulanamadı');
      // A Member receives only unfinished drafts, never official applications.
      if(role==='member'&&result.applications.length!==0)throw new Error('Başvuru kapsamı geçersiz');
      for(const a of result.applications){
        const line=document.createElement('p');
        const resultLabel=a.status!=='created'?'Başvuru işlem sonucu kontrol edilmeli':
          a.seller_status==='pending_approval'?'Mağaza başvurusu onay bekliyor':
          a.seller_status==='open'?'Mağaza onaylandı':
          a.seller_status==='suspended'?'Mağaza askıya alındı':
          a.seller_status==='terminated'?'Mağaza başvurusu reddedildi':
          'Başvurunun güncel mağaza sonucu doğrulanamadı';
        line.textContent=resultLabel+' — '+a.id+
          (a.seller_id?' — '+a.seller_id:'')+
          (a.seller_status==='terminated'&&a.rejection_reason?
            ' — Ret gerekçesi: '+a.rejection_reason:'');
        list.append(line);
      }
      if(['owner','member'].includes(role)){
        for(const d of result.drafts){
          const line=document.createElement('p'),edit=document.createElement('button');
          line.textContent='Kaydedilmiş mağaza taslağı (gönderilmedi) — '+d.name+' — v'+d.version+' ';
          edit.type='button';edit.textContent='Taslağı düzenle';
          edit.onclick=()=>{
            if(currentOrg!==org||organizationRequest!==request||document.hidden)return;
            const form=el('store-draft-form');
            form.elements.namedItem('name').value=d.name;
            form.elements.namedItem('email').value=d.email;
            form.elements.namedItem('currency_code').value=d.currency_code;
            storeDraftKey=d.id;storeDraftVersion=d.version;storeDraftEditEpoch++;
            form.querySelector('button[type=submit]').disabled=false;
            message.textContent='Taslak düzenleniyor; değişiklikler henüz kaydedilmedi.';
          };
          line.append(edit);
          if(role==='owner'&&result.store_application_enabled){
            const send=document.createElement('button');
            send.type='button';send.textContent='Bu taslağı resmî başvuruya gönder';
            send.onclick=async()=>{
              if(send.disabled||currentOrg!==org||organizationRequest!==request||
                 sequence!==applicationRequest||document.hidden)return;
              send.disabled=true;
              const appId='daapp_'+crypto.randomUUID().replace(/-/g,'');
              try{
                const outcome=await api('store-applications',{method:'POST',body:JSON.stringify({
                  action:'submit_draft',organization_id:org,draft_id:d.id,
                  expected_version:d.version,application_id:appId
                })});
                if(currentOrg!==org||organizationRequest!==request||
                   sequence!==applicationRequest)return;
                if(outcome.application_id!==appId||outcome.draft_id!==d.id||
                   outcome.status!=='pending_approval'){
                  const err=new Error('Başvurunun sonucu belirsiz; kayıtları yenileyin.');
                  err.uncertain=true;throw err;
                }
                message.textContent='Taslak başvuruya gönderildi. Mağaza platform onayını bekliyor.';
                void storeApplications(org,request,'owner',true);
              }catch(err){
                if(currentOrg!==org||organizationRequest!==request||
                   sequence!==applicationRequest)return;
                if(err.httpStatus===409){
                  message.textContent='Taslak başka işlemle değişti veya gönderildi. Güncel kayıtları yenileyin.';
                  void storeApplications(org,request,'owner',true);
                  return;
                }
                message.textContent=err.uncertain?
                  'Başvuru sonucu belirsiz. Tekrar göndermeyin; kayıtları yenileyin.':
                  err.httpStatus===403?
                    'Gönderim reddedildi. Korunan Owner ve güncel MFA ile yeniden giriş gerekli.':
                    'Başvuru gönderilemedi: '+err.message;
                if(!err.uncertain)send.disabled=false;
              }
            };
            line.append(send);
          }
          list.append(line);
        }
        if(result.has_more_drafts){
          const warning=document.createElement('p');
          warning.textContent='Daha eski taslaklar da bulunuyor; bu görünüm son 30 kaydı listeler.';
          list.append(warning);
        }
      }
      el('store-draft-form').hidden=false;
      el('store-application-form').hidden=
        role!=='owner'||!result.store_application_enabled;
      if(!result.store_application_enabled){
        const paused='Platform tarafından yeni mağaza başvuruları durduruldu. Önceki başvurular korunuyor; mevcut faal mağazalar etkilenmez.';
        // A draft can still be saved during a platform pause. Preserve its
        // confirmed outcome instead of immediately overwriting it with the
        // separate submission-disabled warning on the list refresh.
        message.textContent=keepOutcome&&message.textContent?
          message.textContent+' '+paused:paused;
      }else if(!keepOutcome){
        message.textContent=result.applications.length?
          'Başvurular güncellendi; mağaza onayı ayrı yürütülür.':
          'Henüz mağaza başvurusu bulunmuyor.';
      }
    }catch(e){
      if(request!==organizationRequest||sequence!==applicationRequest||currentOrg!==org)return;
      list.replaceChildren();
      if(e.httpStatus===401){concealPrivateView();el('login').hidden=false;return}
      if(e.httpStatus===403){
        panel.hidden=true;el('store-draft-form').hidden=true;
        el('store-application-form').hidden=true;
        applicationRole='';storeDraftKey='';storeDraftVersion=0;storeDraftEditEpoch++;
        const form=el('store-draft-form');form.reset();
        status('Bu şirketin mağaza taslaklarına erişim izniniz yok.');
        return;
      }
      message.textContent=keepOutcome?message.textContent+' Başvuru listesi şu anda yenilenemedi.':'Başvurular güvenli biçimde okunamadı.';
    }
  }
  let applicationRequest=0,applicationKey='',applicationRole='';
  let storeDraftKey='',storeDraftVersion=0,storeDraftEditEpoch=0;
  el('store-applications-refresh').onclick=()=>{
    if(currentOrg&&['owner','member'].includes(applicationRole))
      void storeApplications(currentOrg,organizationRequest,applicationRole);
  };
  el('store-draft-new').onclick=()=>{
    const form=el('store-draft-form');
    if(form.hidden||!currentOrg||document.hidden)return;
    storeDraftKey='';storeDraftVersion=0;storeDraftEditEpoch++;form.reset();
    form.querySelector('button[type=submit]').disabled=false;
    el('store-application-status').textContent='Yeni bir mağaza taslağı hazırlanıyor.';
  };
  el('store-draft-form').onsubmit=async event=>{
    event.preventDefault();
    const org=currentOrg,request=organizationRequest,form=event.currentTarget;
    if(!org||document.hidden||form.hidden||!['owner','member'].includes(applicationRole))return;
    const submit=form.querySelector('button[type=submit]');submit.disabled=true;
    if(!storeDraftKey)storeDraftKey='dasdraft_'+crypto.randomUUID().replace(/-/g,'');
    const key=storeDraftKey,version=storeDraftVersion,editEpoch=storeDraftEditEpoch,fields=new FormData(form);
    try{
      const result=await api('store-applications',{method:'POST',body:JSON.stringify({
        action:'save_draft',organization_id:org,draft_id:key,expected_version:version,
        name:String(fields.get('name')||'').trim(),email:String(fields.get('email')||'').trim(),
        currency_code:String(fields.get('currency_code')||'').toLowerCase()
      })});
      if(request!==organizationRequest||currentOrg!==org||
         storeDraftKey!==key||storeDraftEditEpoch!==editEpoch)return;
      if(result.draft_id!==key||result.status!=='draft'||result.version!==version+1){
        const e=new Error('Taslak kaydı doğrulanamadı; önce kayıtları yenileyin.');
        e.uncertain=true;throw e;
      }
      storeDraftVersion=result.version;submit.disabled=false;
      el('store-application-status').textContent='Taslak kaydedildi. Henüz başvuru gönderilmedi veya mağaza oluşturulmadı.';
      void storeApplications(org,request,applicationRole,true);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org||
         storeDraftKey!==key||storeDraftEditEpoch!==editEpoch)return;
      if(e.httpStatus===403){
        el('store-application-panel').hidden=true;
        el('store-draft-form').hidden=true;
        el('store-application-list').replaceChildren();
        form.reset();storeDraftKey='';storeDraftVersion=0;storeDraftEditEpoch++;
        applicationRole='';status('Taslak izniniz iptal edildi veya erişiminiz sona erdi.');
        return;
      }
      el('store-application-status').textContent=e.uncertain?
        'Taslak sonucu belirsiz; tekrar kaydetmeden önce kayıtları yenileyin.':
        'Taslak kaydedilemedi: '+e.message;
      if(!e.uncertain)submit.disabled=false;
    }
  };
  el('store-application-form').onsubmit=async event=>{
    event.preventDefault();
    const org=currentOrg,request=organizationRequest,form=event.currentTarget;
    if(!org||document.hidden)return;
    const button=form.querySelector('button');button.disabled=true;
    if(!applicationKey)applicationKey='daapp_'+crypto.randomUUID().replace(/-/g,'');
    const v=new FormData(form);
    try{
      const data=await api('store-applications',{method:'POST',body:JSON.stringify({
        organization_id:org,application_id:applicationKey,
        name:String(v.get('name')||'').trim(),email:String(v.get('email')||''),
        currency_code:String(v.get('currency_code')||'').toLowerCase()
      })});
      if(request!==organizationRequest||currentOrg!==org)return;
      if(data.application_id!==applicationKey||data.status!=='pending_approval')
        throw new Error('Başvuru sonucu doğrulanamadı');
      applicationKey='';form.reset();button.disabled=false;
      el('store-application-status').textContent='Başvuru kaydedildi. Mağazanın açılması platform yöneticisinin onayını bekliyor.';
      // Refresh the list without replacing the confirmed submission outcome.
      void storeApplications(org,request,'owner',true);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      el('store-application-status').textContent=e.uncertain?
        'Sonuç belirsiz; yeni başvuru göndermeyin. Başvuru listesinden durumu kontrol edin.':
        'Başvuru reddedildi: '+e.message;
      if(!e.uncertain){applicationKey='';button.disabled=false}
    }
  };

  let storeDraftPermissionRequest=0,storeDraftCursor='',storeDraftNextCursor=null;
  const storeDraftCursorHistory=[];
  let storeDraftGrantable=new Set(),storeDraftRevocable=new Set();
  let storeDraftPermissionsVerified=false,storeDraftWritePending=false,storeDraftWriteUncertain=false;
  function updateStoreDraftActionButtons(){
    const form=el('store-draft-grants-form');
    const select=form?.elements?.namedItem?.('membership_id');
    const value=select?.selectedOptions?.[0]?.disabled?null:select?.value;
    const permitted=!!value&&storeDraftPermissionsVerified&&
      !storeDraftWritePending&&!storeDraftWriteUncertain&&!document.hidden&&
      !el('workspace').hidden&&!el('store-draft-grants-panel').hidden;
    form.querySelector('button[value=grant]').disabled=
      !permitted||!storeDraftGrantable.has(value);
    form.querySelector('button[value=revoke]').disabled=
      !permitted||!storeDraftRevocable.has(value);
  }
  function clearStoreDraftPermissions(){
    storeDraftPermissionRequest++;
    storeDraftGrantable.clear();storeDraftRevocable.clear();
    storeDraftPermissionsVerified=false;storeDraftWritePending=false;
    storeDraftWriteUncertain=false;
    storeDraftCursor='';storeDraftNextCursor=null;storeDraftCursorHistory.length=0;
    el('store-draft-grants-older').hidden=true;el('store-draft-grants-newer').hidden=true;
    el('store-draft-grants-panel').hidden=true;
    el('store-draft-grants-status').textContent='';
    el('store-draft-grants-list').replaceChildren();
    const form=el('store-draft-grants-form');
    // Preserve private concealment in both actual browsers and the existing
    // reduced DOM regression harness (which need not implement forms API).
    if(form && form.elements && typeof form.elements.namedItem==='function'){
      const select=form.elements.namedItem('membership_id');
      if(select && typeof select.replaceChildren==='function')select.replaceChildren();
    }
    if(form && typeof form.querySelectorAll==='function')
      for(const button of form.querySelectorAll('button'))button.disabled=true;
  }
  async function storeDraftPermissions(org,request,keepOutcome=false){
    if(request!==organizationRequest||currentOrg!==org||document.hidden||
       el('workspace').hidden)return;
    const seq=++storeDraftPermissionRequest;
    storeDraftPermissionsVerified=false;
    const panel=el('store-draft-grants-panel'),form=el('store-draft-grants-form');
    const list=el('store-draft-grants-list'),message=el('store-draft-grants-status');
    panel.hidden=true;
    if(!keepOutcome)message.textContent='Çalışan taslak izinleri kontrol ediliyor…';
    try{
      const data=await api('store-draft-permissions?organization_id='+encodeURIComponent(org)+
        (storeDraftCursor?'&after='+encodeURIComponent(storeDraftCursor):''));
      if(seq!==storeDraftPermissionRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden)return;
      if(!Array.isArray(data.members)||!Array.isArray(data.grants)||
         data.members.length>30||data.grants.length>30||
         typeof data.has_more!=='boolean'||
         !(data.next_cursor===null||
           (typeof data.next_cursor==='string'&&
             /^[A-Za-z0-9_-]{1,128}$/.test(data.next_cursor)))||
         data.has_more!==(data.next_cursor!==null)||
         (data.has_more&&data.next_cursor!==data.members.at(-1)?.membership_id)||
         data.members.some(m=>typeof m.label_unique_in_organization!=='boolean'||
           typeof m.other_active_grant_same_label!=='boolean'||
           !(m.mobile_phone===null||
             (typeof m.mobile_phone==='string'&&/^[+]?[0-9]{6,20}$/.test(m.mobile_phone)))||
           !(m.member_name===null||
           (typeof m.member_name==='string'&&m.member_name.trim().length>0&&m.member_name.length<=160))||
           !(m.invitation_email===null||
             (typeof m.invitation_email==='string'&&
              m.invitation_email.includes('@')&&m.invitation_email.length<=254))||
           typeof m.person_id!=='string'||
           !/^daprs_[A-Za-z0-9_-]+$/.test(m.person_id)||
           typeof m.membership_id!=='string'||
           !/^[A-Za-z0-9_-]{1,128}$/.test(m.membership_id))||
         data.grants.some(g=>typeof g.id!=='string'||
           !/^dasdpg_[A-Za-z0-9_-]+$/.test(g.id)||
           typeof g.person_id!=='string'||!/^daprs_[A-Za-z0-9_-]+$/.test(g.person_id)||
           typeof g.membership_id!=='string'||
           !/^[A-Za-z0-9_-]{1,128}$/.test(g.membership_id))||
         new Set(data.members.map(m=>m.membership_id)).size!==data.members.length||
         new Set(data.members.map(m=>m.person_id)).size!==data.members.length||
         new Set(data.grants.map(g=>g.person_id)).size!==data.grants.length||
         data.grants.some(g=>!data.members.some(m=>
           m.person_id===g.person_id&&m.membership_id===g.membership_id)))
        throw new Error('İzin bilgileri doğrulanamadı');
      const select=form.elements.namedItem('membership_id'),previous=select.value;
      select.replaceChildren();list.replaceChildren();
      storeDraftGrantable.clear();storeDraftRevocable.clear();
      // Display only authorized, human-readable Organization identities.
      // Ambiguous or absent labels must never cause a misdirected grant.
      const labelFor=m=>[m.member_name,m.invitation_email,
         m.mobile_phone?'Cep: '+m.mobile_phone:null].filter(Boolean).join(' — ');
      const labelCounts=new Map();
      for(const m of data.members){
        const label=labelFor(m);if(label)labelCounts.set(label,(labelCounts.get(label)||0)+1);
      }
      for(const m of data.members){
        const label=labelFor(m);
        const identifiable=!!label&&(!!m.mobile_phone||!!m.invitation_email)&&
          m.label_unique_in_organization===true&&
          labelCounts.get(label)===1;
        const granted=data.grants.some(g=>g.person_id===m.person_id&&
          g.membership_id===m.membership_id);
        if(identifiable)storeDraftGrantable.add(m.membership_id);
        // A single currently granted Person may be safely revoked after
        // a late ungranted namesake joins. Two indistinguishable ACTIVE
        // recipients, even on different pages, must never be individually
        // revocable: the Owner cannot tell whose private access would end.
        const revocable=granted&&m.other_active_grant_same_label===false;
        if(revocable)storeDraftRevocable.add(m.membership_id);
        const option=document.createElement('option');
        option.value=m.membership_id;
        option.disabled=!(identifiable||revocable);
        option.textContent=identifiable?label:granted&&
          m.other_active_grant_same_label?
          (label||'Adı doğrulanamayan çalışan')+
          ' — aynı kimlikle birden fazla etkin izin; tek tek iptal edilemez':
          granted?(label||'Adı doğrulanamayan çalışan')+
          ' — kimlik belirsiz; yalnız mevcut izni kaldırabilirsiniz':
          'Çalışanın kimliği ayırt edilemiyor; yeni izin verilemez';
        select.append(option);
        const line=document.createElement('p');
        line.textContent=option.textContent+' — taslak: '+(granted?'Yetkili':'Yetkisiz')+
          ' (kişisel izin; resmî gönderim yalnız Owner)';
        list.append(line);
      }
      const selected=Array.from(select.options).find(o=>o.value===previous&&!o.disabled);
      if(selected)select.value=previous;
      else select.selectedIndex=Array.from(select.options).findIndex(o=>!o.disabled);
      // A choice may revoke a verified active grant while being ineligible
      // for a new grant. Selection changes recompute each action separately.
      select.onchange=updateStoreDraftActionButtons;
      storeDraftNextCursor=data.next_cursor;
      el('store-draft-grants-older').hidden=!data.has_more;
      el('store-draft-grants-newer').hidden=storeDraftCursorHistory.length===0;
      panel.hidden=false;
      storeDraftPermissionsVerified=true;
      storeDraftWritePending=false;storeDraftWriteUncertain=false;
      updateStoreDraftActionButtons();
      if(!keepOutcome)message.textContent=data.members.length?
        'Üyelerin güncel kişisel taslak izinleri gösteriliyor.':
        'Şirkette yetki verilebilecek etkin üye bulunmuyor.';
    }catch(e){
      if(seq!==storeDraftPermissionRequest||request!==organizationRequest||currentOrg!==org)return;
      clearStoreDraftPermissions();
      message.textContent='Çalışan taslak izinleri güvenle okunamadı.';
    }
  }
  el('store-draft-grants-refresh').onclick=()=>{
    if(currentOrg)void storeDraftPermissions(currentOrg,organizationRequest);
  };
  el('store-draft-grants-older').onclick=()=>{
    if(!currentOrg||!storeDraftNextCursor||document.hidden)return;
    storeDraftCursorHistory.push(storeDraftCursor);
    storeDraftCursor=storeDraftNextCursor;storeDraftNextCursor=null;
    void storeDraftPermissions(currentOrg,organizationRequest);
  };
  el('store-draft-grants-newer').onclick=()=>{
    if(!currentOrg||!storeDraftCursorHistory.length||document.hidden)return;
    storeDraftCursor=storeDraftCursorHistory.pop();
    storeDraftNextCursor=null;
    void storeDraftPermissions(currentOrg,organizationRequest);
  };
  el('store-draft-grants-form').onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden)return;
    const org=currentOrg,request=organizationRequest,form=event.currentTarget;
    const action=event.submitter?.value;
    if(!org||!['grant','revoke'].includes(action)||
       storeDraftWritePending||storeDraftWriteUncertain||!storeDraftPermissionsVerified)return;
    const chosen=form.elements.namedItem('membership_id');
    const membership_id=chosen.value;
    const allowed=chosen.selectedIndex>=0&&!chosen.selectedOptions[0]?.disabled&&
      (action==='grant'?storeDraftGrantable:storeDraftRevocable).has(membership_id);
    if(!allowed){
      el('store-draft-grants-status').textContent=
        'Yeni izin için çalışan ayırt edilebilir olmalı; mevcut izin yalnız kayıtlı üyelikten kaldırılabilir.';
      updateStoreDraftActionButtons();
      return;
    }
    storeDraftWritePending=true;
    updateStoreDraftActionButtons();
    try{
      const result=await api('store-draft-permissions',{method:'POST',
        body:JSON.stringify({action,organization_id:org,membership_id})});
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(result.status!==(action==='grant'?'active':'revoked')||
         !(result.grant_id===null||
           (typeof result.grant_id==='string'&&/^dasdpg_[A-Za-z0-9_-]+$/.test(result.grant_id)))){
        const e=new Error('İzin sonucu belirsiz');e.uncertain=true;throw e;
      }
      el('store-draft-grants-status').textContent=action==='grant'?
        'Çalışana taslak düzenleme izni verildi. Başvuru gönderme hakkı verilmedi.':
        'Çalışanın taslak düzenleme izni kaldırıldı. Şirket taslakları korundu.';
      storeDraftWritePending=false;
      void storeDraftPermissions(org,request,true);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      storeDraftWritePending=false;
      storeDraftWriteUncertain=!!e.uncertain;
      // An uncertain or denied write needs a fresh authorized read before
      // the next attempt; neither error may enable a stale grant button.
      storeDraftPermissionsVerified=false;
      updateStoreDraftActionButtons();
      el('store-draft-grants-status').textContent=e.uncertain?
        'İzin sonucu belirsiz; işlemi tekrarlamadan önce izinleri yenileyin.':
        'İzin işlemi reddedildi; yeniden denemeden önce izinleri yenileyin.';
    }
  };

  // Store Buyer Organization policy remains separate from member permissions.
  // Only this selected legal Organization's Owner sees the controls; the
  // server independently checks fresh Owner, verified Store origin and native
  // Seller/Member before every write. Visibility is NOT authorization.
  let storeBlockRequest=0,priceGroupListRequest=0,priceGroupActionRequest=0;
  let priceGroupActionPending=false,priceGroupCurrentAction=null;
  const priceGroupUncertain=new Map();
  const priceGroupWarning='Önceki mağazadaki işlem veya önceki grup/alıcı seçimi sonuçlanmış olabilir. İlgili kaydı kontrol edin.';
  function showPriceGroupStatus(value=''){
    const warning=priceGroupUncertain.size?priceGroupWarning:'';
    el('store-price-group-status').textContent=
      value&&warning?value+' '+warning:value||warning;
  }
  function clearStoreBlock(){
    storeBlockRequest++;priceGroupActionRequest++;
    priceGroupActionPending=false;priceGroupCurrentAction=null;
    // Never carry an earlier Person/Organization's private outcome across
    // the permission boundary or after workspace concealment.
    priceGroupUncertain.clear();
    el('store-price-group-panel').hidden=true;
    el('store-price-group-status').textContent='';
    clearStorePriceGroupChoices();
    const gf=el('store-price-group-form');
    const gs=gf?.elements&&typeof gf.elements.namedItem==='function'?
      gf.elements.namedItem('seller_id'):null;
    if(gs&&typeof gs.replaceChildren==='function')gs.replaceChildren();
    if(gf&&typeof gf.querySelectorAll==='function')
      for(const button of gf.querySelectorAll('button'))button.disabled=true;
    if(gf&&typeof gf.reset==='function')gf.reset();
    const panel=el('store-block-panel'),form=el('store-block-form');
    if(panel)panel.hidden=true;
    const msg=el('store-block-status');if(msg)msg.textContent='';
    if(form&&typeof form.querySelectorAll==='function'){
      for(const select of form.querySelectorAll('select'))select.replaceChildren();
      for(const button of form.querySelectorAll('button'))button.disabled=true;
      if(typeof form.reset==='function')form.reset();
    }
  }
  // This picker is convenience only; the existing grant endpoint still
  // verifies the current native Seller->CustomerGroup link on every write.
  function clearStorePriceGroupChoices(){
    priceGroupListRequest++;
    const choice=el('store-price-group-choice');
    if(choice&&typeof choice.replaceChildren==='function'){
      choice.replaceChildren();choice.disabled=true;
    }
    const msg=el('store-price-group-options-status');
    if(msg)msg.textContent='';
    const form=el('store-price-group-form');
    const field=form?.elements&&typeof form.elements.namedItem==='function'?
      form.elements.namedItem('customer_group_id'):null;
    if(field)field.value='';
  }
  async function storePriceGroupChoices(org,seller_id,request){
    clearStorePriceGroupChoices();
    if(request!==organizationRequest||currentOrg!==org||
       document.hidden||el('workspace').hidden||
       !/^sel_[A-Za-z0-9_-]+$/.test(seller_id))return;
    // A Store change invalidates the old UI action, not the server write.
    // Its result may be committed: never call the previous action cancelled.
    if(priceGroupActionPending&&priceGroupCurrentAction){
      const older=priceGroupUncertain.get(priceGroupCurrentAction.key);
      if(!older||(older.kind==='read'&&priceGroupCurrentAction.kind!=='read'))
        priceGroupUncertain.set(priceGroupCurrentAction.key,priceGroupCurrentAction);
    }
    ++priceGroupActionRequest;
    priceGroupActionPending=false;priceGroupCurrentAction=null;
    const actionForm=el('store-price-group-form');
    if(actionForm)for(const button of actionForm.querySelectorAll('button'))
      button.disabled=false;
    // The warning survives A->B->A and other switches until the same
    // scoped record has been rechecked after its original request settled.
    showPriceGroupStatus();
    const seq=priceGroupListRequest;
    const choice=el('store-price-group-choice'),
      message=el('store-price-group-options-status');
    if(!choice||!message)return;
    message.textContent='Bu mağazanın müşteri grupları kontrol ediliyor…';
    try{
      const data=await api('store-price-groups?'+new URLSearchParams({
        organization_id:org,seller_id,view:'list'
      }).toString());
      if(seq!==priceGroupListRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden||
         el('store-price-group-form')?.elements?.namedItem('seller_id')?.value!==seller_id)return;
      if(data.organization_id!==org||data.seller_id!==seller_id||
         !Array.isArray(data.groups)||data.groups.length>100||
         data.groups.some(g=>typeof g?.id!=='string'||
           !/^cusgroup_[A-Za-z0-9_-]+$/.test(g.id)||
           typeof g.name!=='string'||g.name.length>160)||
         new Set(data.groups.map(g=>g.id)).size!==data.groups.length)
        throw Error('Grup yanıtı doğrulanamadı');
      const options=document.createDocumentFragment();
      const blank=document.createElement('option');
      blank.value='';blank.textContent='Grup seçin';options.append(blank);
      for(const group of data.groups){
        const option=document.createElement('option');
        option.value=group.id;option.textContent=group.name;options.append(option);
      }
      choice.replaceChildren(options);
      choice.disabled=data.groups.length===0;
      message.textContent=data.groups.length?
        'Bu mağazanın gruplarından birini seçin; seçim başka mağazada geçerli değildir.':
        'Bu mağazada seçilebilir müşteri grubu bulunamadı.';
    }catch(e){
      if(seq!==priceGroupListRequest||request!==organizationRequest||currentOrg!==org)return;
      choice.replaceChildren();choice.disabled=true;
      message.textContent='Mağaza grupları yetki nedeniyle yüklenemedi.';
    }
  }
  const priceGroupChoice=el('store-price-group-choice');
  if(priceGroupChoice)priceGroupChoice.onchange=()=>{
    const field=el('store-price-group-form')?.elements?.namedItem('customer_group_id');
    if(field)field.value=/^cusgroup_[A-Za-z0-9_-]+$/.test(priceGroupChoice.value)?
      priceGroupChoice.value:'';
  };
  async function storeBlockStores(org,request){
    if(request!==organizationRequest||currentOrg!==org||
      document.hidden||el('workspace').hidden)return;
    const seq=++storeBlockRequest,panel=el('store-block-panel');
    const form=el('store-block-form'),msg=el('store-block-status');
    if(!panel||!form||!form.elements)return;
    panel.hidden=true;msg.textContent='Mağaza izinleri kontrol ediliyor…';
    try{
      const data=await api('organization-stores?organization='+encodeURIComponent(org));
      if(seq!==storeBlockRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden)return;
      if(data.organization_id!==org||!Array.isArray(data.stores)||
         data.stores.length>50||
         data.stores.some(s=>typeof s.id!=='string'||
           !/^sel_[A-Za-z0-9_-]+$/.test(s.id)||typeof s.name!=='string')||
         new Set(data.stores.map(s=>s.id)).size!==data.stores.length)
        throw new Error('Mağazalar doğrulanamadı');
      const select=form.elements.namedItem('seller_id');
      select.replaceChildren();
      for(const store of data.stores){
        const option=document.createElement('option');
        option.value=store.id;option.textContent=store.name;select.append(option);
      }
      for(const button of form.querySelectorAll('button'))
        button.disabled=data.stores.length===0;
      panel.hidden=data.stores.length===0;
      const gf=el('store-price-group-form');
      const gs=gf?.elements&&typeof gf.elements.namedItem==='function'?
        gf.elements.namedItem('seller_id'):null;
      if(gs&&typeof gs.replaceChildren==='function'){
        gs.replaceChildren();
        for(const option of select.options)gs.append(option.cloneNode(true));
        for(const button of gf.querySelectorAll('button'))button.disabled=data.stores.length===0;
        el('store-price-group-panel').hidden=data.stores.length===0;
        gs.onchange=()=>storePriceGroupChoices(org,gs.value,request);
        if(data.stores.length)void storePriceGroupChoices(org,gs.value,request);
      }
      msg.textContent=data.stores.length?
        'Yalnız kendi mağazanız için alıcı kuruluş engeli koyabilirsiniz.':
        'Onaylı mağaza bulunamadı.';
    }catch(e){
      if(seq!==storeBlockRequest||request!==organizationRequest||currentOrg!==org)return;
      panel.hidden=true;
      msg.textContent='Mağaza politikası yönetme izniniz doğrulanamadı.';
    }
  }
  const storeBlockForm=el('store-block-form');
  if(storeBlockForm)storeBlockForm.onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden)return;
    const request=organizationRequest,org=currentOrg,form=event.currentTarget;
    const action=event.submitter?.value;
    if(!org||!['block','unblock'].includes(action))return;
    const seller_id=form.elements.namedItem('seller_id')?.value;
    const buyer_organization_id=String(
      form.elements.namedItem('buyer_organization_id')?.value||'').trim();
    if(!/^sel_[A-Za-z0-9_-]+$/.test(seller_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(buyer_organization_id))return;
    const msg=el('store-block-status');
    for(const button of form.querySelectorAll('button'))button.disabled=true;
    msg.textContent='Mağaza politikası sunucuda doğrulanıyor…';
    try{
      const result=await api('store-buyer-blocks',{method:'POST',body:JSON.stringify({
        action,organization_id:org,seller_id,buyer_organization_id
      })});
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(result.status!==(action==='block'?'blocked':'unblocked'))
        throw new Error('Yanıt doğrulanamadı');
      msg.textContent=action==='block'?
        'Alıcı kuruluş bu mağazada engellendi.':
        'Bu mağazadaki alıcı kuruluş engeli kaldırıldı.';
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      msg.textContent=e.uncertain?
        'Sonuç belirsiz. Yeniden işlem göndermeden önce yetkili kayıt kontrolü gerekli.':
        'İşlem reddedildi; mağaza politikasını değiştiremediniz.';
    }finally{
      if(request===organizationRequest&&currentOrg===org&&!document.hidden)
        for(const button of form.querySelectorAll('button'))button.disabled=false;
    }
  };

  const priceGroupForm=el('store-price-group-form');
  if(priceGroupForm)priceGroupForm.onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden)return;
    const request=organizationRequest,org=currentOrg,form=event.currentTarget;
    const action=event.submitter?.value;
    if(!org||!['grant','revoke','read'].includes(action))return;
    const seller_id=form.elements.namedItem('seller_id')?.value;
    const customer_group_id=String(form.elements.namedItem('customer_group_id')?.value||'').trim();
    const buyer_organization_id=String(form.elements.namedItem('buyer_organization_id')?.value||'').trim();
    if(!/^sel_[A-Za-z0-9_-]+$/.test(seller_id)||
       !/^cusgroup_[A-Za-z0-9_-]+$/.test(customer_group_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(buyer_organization_id))return;
    const key=JSON.stringify([org,seller_id,customer_group_id,buyer_organization_id]);
    // A Store switch only unlocks OTHER scopes. It must not permit a
    // duplicate grant/revoke while this exact record's outcome is unknown.
    const previous=priceGroupUncertain.get(key);
    if(action!=='read'&&((previous&&previous.kind!=='read')||
       (priceGroupActionPending&&priceGroupCurrentAction?.key===key&&
        priceGroupCurrentAction.kind!=='read'))){
      showPriceGroupStatus('Bu kayıt için önceki değişiklik henüz doğrulanmadı. Yeni işlem göndermeden önce sonucu kontrol edin.');
      return;
    }
    // An old GET is not a write and cannot bar a new authorized change.
    if(action!=='read'&&previous?.kind==='read')priceGroupUncertain.delete(key);
    const seq=++priceGroupActionRequest;
    const currentAction={key,settled:false,kind:action};
    const sameSelection=()=>form.elements.namedItem('seller_id')?.value===seller_id&&
      String(form.elements.namedItem('customer_group_id')?.value||'').trim()===customer_group_id&&
      String(form.elements.namedItem('buyer_organization_id')?.value||'').trim()===buyer_organization_id;
    // A read begun before an older write settles cannot clear an unknown
    // outcome: it could have observed the old state before the write commits.
    const recheck=action==='read'&&priceGroupUncertain.get(key)?.settled===true?
      priceGroupUncertain.get(key):null;
    priceGroupCurrentAction=currentAction;
    priceGroupActionPending=true;
    for(const button of form.querySelectorAll('button'))button.disabled=true;
    showPriceGroupStatus('Yetkili mağaza ve alıcı işletme denetleniyor…');
    try{
      const data={organization_id:org,seller_id,customer_group_id,buyer_organization_id};
      const result=action==='read'?
        await api('store-price-groups?'+new URLSearchParams(data).toString()):
        await api('store-price-groups',{method:'POST',body:JSON.stringify({...data,action})});
      if(seq!==priceGroupActionRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden||el('workspace').hidden||
         form.elements.namedItem('seller_id')?.value!==seller_id)return;
      if(!['active','revoked'].includes(result?.status)||
         (action==='grant'&&result.status!=='active')||
         (action==='revoke'&&result.status!=='revoked')){
        const e=new Error('Yetki sonucu doğrulanamadı');
        // A syntactically valid but unusable POST response is still unknown.
        e.uncertain=action!=='read';
        throw e;
      }
      if(!sameSelection()){
        // The response belongs to the submitted tuple, not the fields now
        // visible in the form. Keep the original write scoped for recheck.
        if(action!=='read'&&!priceGroupUncertain.has(key))
          priceGroupUncertain.set(key,currentAction);
        showPriceGroupStatus(action==='read'?
          'Seçim değişti. Yeni seçimin kaydını yeniden kontrol edin.':'');
        return;
      }
      if(recheck&&priceGroupUncertain.get(key)===recheck)
        priceGroupUncertain.delete(key);
      showPriceGroupStatus(result.status==='active'?
        'Alıcı işletme bu mağazanın özel fiyat grubuna kabul edilmiş.':
        'Bu işletmenin bu mağaza grubunda geçerli üyeliği yok.');
    }catch(e){
      if(e.uncertain&&action!=='read'){
        // A native route's completed 503 is a terminal response. Its
        // subsequent authorized read can confirm the persisted state. A
        // transport loss, or an unrelated 503, does not prove the write ended.
        currentAction.outcomeUnverified=!(
          e.httpStatus===503&&e.message==='Outcome uncertain; recheck group');
        currentAction.settled=!currentAction.outcomeUnverified;
        if(request===organizationRequest&&currentOrg===org&&!document.hidden&&
           !el('workspace').hidden&&!priceGroupUncertain.has(key))
          priceGroupUncertain.set(key,currentAction);
      }
      if(seq!==priceGroupActionRequest||request!==organizationRequest||currentOrg!==org||
         document.hidden||el('workspace').hidden||
         form.elements.namedItem('seller_id')?.value!==seller_id)return;
      if(!sameSelection()){
        // Never attach an old rejection or uncertain result to another Buyer
        // or Group selected while the original request was in flight.
        showPriceGroupStatus('Seçim değişti. Önceki işlemin sonucunu yalnız ilgili kayıtta kontrol edin.');
        return;
      }
      showPriceGroupStatus(e.uncertain?
        'Sonuç belirsiz. İşlemi tekrarlamadan önce kaydı kontrol edin.':
        'İşlem reddedildi; mağaza veya grup yetkisi doğrulanamadı.');
    }finally{
      if(!(action!=='read'&&priceGroupUncertain.get(key)===currentAction&&
           currentAction.outcomeUnverified))currentAction.settled=true;
      if(seq===priceGroupActionRequest){
        priceGroupActionPending=false;priceGroupCurrentAction=null;
        if(request===organizationRequest&&currentOrg===org&&!document.hidden&&
           form.elements.namedItem('seller_id')?.value===seller_id)
          for(const button of form.querySelectorAll('button'))button.disabled=false;
      }
    }
  };


  let renameRead=0,renamePending=false,renameUncertain=false;
  let renameTargetMustSelect=false;
  function clearStoreRename(preserveSelectedOwner=false){
    // A transient Store-list failure is not an Organization role change.
    // Only Organization switch/logout/concealment may discard that role.
    renameRead++;renameTargetMustSelect=false;
    if(!preserveSelectedOwner)selectedStoreOwner=false;
    renamePending=false;renameUncertain=false;
    el('store-rename-panel').hidden=true;
    el('store-rename-status').textContent='';
    el('store-rename-history').replaceChildren();
    clearOwnerPause();
    const form=el('store-rename-form');
    if(typeof form?.reset==='function')form.reset();
    const field=form?.elements&&typeof form.elements.namedItem==='function'?
      form.elements.namedItem('seller_id'):null;
    if(typeof field?.replaceChildren==='function')field.replaceChildren();
    const button=typeof form?.querySelector==='function'?
      form.querySelector('button[type=submit]'):null;
    if(button)button.disabled=true;
  }
  async function refreshStoreRename(org,request){
    const form=el('store-rename-form'),seller=form.elements.namedItem('seller_id').value;
    const seq=++renameRead,epoch=viewEpoch;
    if(!selectedStoreOwner||!org||!seller||document.hidden)return;
    const message=el('store-rename-status'),list=el('store-rename-history');
    message.textContent='Başvurular doğrulanıyor…';
    try{
      const data=await api('store-rename-requests?'+new URLSearchParams({
        organization_id:org,seller_id:seller
      }).toString());
      if(seq!==renameRead||epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||seller!==form.elements.namedItem('seller_id').value)return;
      if(data.organization_id!==org||data.seller_id!==seller||
         !Array.isArray(data.requests)||data.requests.length>10||
         data.requests.some(x=>!/^dasrn_[a-f0-9]{32}$/.test(x?.id)||
           !['pending_review','approved','rejected','withdrawn'].includes(x?.status)||
           typeof x?.proposed_name!=='string'||typeof x?.proposed_handle!=='string'))
        throw Error('Talep bilgisi doğrulanamadı');
      renameUncertain=false;
      list.replaceChildren();
      for(const x of data.requests){
        const row=document.createElement('div'),item=document.createElement('p');
        item.textContent=x.proposed_name+' / '+x.proposed_handle+' — '+
          (x.status==='pending_review'?'Platform incelemesinde':
            x.status==='withdrawn'?'Geri çekildi':x.status);
        row.append(item);
        if(x.status==='pending_review'){
          const cancel=document.createElement('button');
          cancel.type='button';cancel.textContent='Bekleyen talebi geri çek';
          cancel.setAttribute('aria-label',x.proposed_name+' değişiklik talebini geri çek');
          cancel.disabled=renamePending||renameUncertain;
          cancel.onclick=async()=>{
            if(renamePending||renameUncertain||document.hidden||!selectedStoreOwner||
               org!==currentOrg||seller!==form.elements.namedItem('seller_id').value||
               !confirm('Bu bekleyen mağaza adı değişikliği talebini geri çekmek istiyor musunuz?'))return;
            renamePending=true;
            cancel.disabled=true;form.querySelector('button[type=submit]').disabled=true;
            message.textContent='Talep geri çekiliyor…';
            try{
              const result=await api('store-rename-requests',{method:'POST',
                body:JSON.stringify({action:'withdraw',request_id:x.id,
                  organization_id:org,seller_id:seller})});
              if(seq!==renameRead||epoch!==viewEpoch||request!==organizationRequest||
                 currentOrg!==org||document.hidden)return;
              if(result.request_id!==x.id||result.seller_id!==seller||
                 result.status!=='withdrawn'){
                const err=Error('Geri çekme sonucu doğrulanamadı');
                err.uncertain=true;throw err;
              }
              renameUncertain=false;
              renamePending=false;
              // A fresh private GET is authoritative; no automatic second POST.
              await refreshStoreRename(org,request);
            }catch(error){
              if(epoch!==viewEpoch||request!==organizationRequest||currentOrg!==org||
                 document.hidden)return;
              renameUncertain=!!error.uncertain||error.httpStatus>=500;
              message.textContent=error.httpStatus===409?
                'Talep artık beklemede değil. Güncel durumu yenileyin.':
                'Sonuç belirsiz; işlemi tekrarlamayın. Talep geçmişini yenileyin.';
              // An uncertain write keeps the controls disabled until readback.
            }finally{renamePending=false;}
          };
          row.append(cancel);
        }
        list.append(row);
      }
      renameUncertain=false;
      const pending=data.requests.some(x=>x.status==='pending_review');
      form.querySelector('button[type=submit]').disabled=renamePending||pending;
      message.textContent=pending?'Mevcut talep incelemede; yeni talep oluşturulamaz.':
        'Yeni isim ve bağlantı için ayrı risk kabulüyle başvurabilirsiniz.';
    }catch{
      if(seq!==renameRead||request!==organizationRequest||org!==currentOrg)return;
      renameUncertain=true;list.replaceChildren();
      form.querySelector('button[type=submit]').disabled=true;
      message.textContent='Talep geçmişi doğrulanamadı. Başvuru göndermeden önce oturumu yeniden doğrulayın.';
    }
  }
  const renameForm=el('store-rename-form');
  if(renameForm?.elements&&typeof renameForm.elements.namedItem==='function')
    renameForm.elements.namedItem('seller_id').onchange=()=>{
      const selected=renameForm.elements.namedItem('seller_id').value;
      // Explicit Store switches never inherit the previous Store's name or
      // risk acknowledgement. A lost target requires a new manual choice.
      renameTargetMustSelect=!selected;
      renameRead++;renameUncertain=true;
      renameForm.elements.namedItem('name').value='';
      renameForm.elements.namedItem('handle').value='';
      renameForm.elements.namedItem('risk_acknowledged').checked=false;
      el('store-rename-history').replaceChildren();
      renameForm.querySelector('button[type=submit]').disabled=true;
      if(currentOrg&&selected)void refreshStoreRename(currentOrg,organizationRequest);
    };
  el('store-rename-refresh').onclick=()=>{
    if(currentOrg)void refreshStoreRename(currentOrg,organizationRequest);
  };
  el('store-rename-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,org=currentOrg;
    const request=organizationRequest,epoch=viewEpoch,seller=form.elements.namedItem('seller_id').value;
    if(!org||!selectedStoreOwner||el('store-rename-panel').hidden||document.hidden||
       renamePending||renameUncertain||!form.elements.namedItem('risk_acknowledged').checked)return;
    const id='dasrn_'+crypto.randomUUID().replace(/-/g,'');
    renamePending=true;const button=form.querySelector('button[type=submit]');button.disabled=true;
    try{
      const result=await api('store-rename-requests',{method:'POST',body:JSON.stringify({
        request_id:id,organization_id:org,seller_id:seller,
        name:form.elements.namedItem('name').value,handle:form.elements.namedItem('handle').value,
        risk_acknowledged:true,risk_version:'store-rename-risks-v2'
      })});
      if(request!==organizationRequest||epoch!==viewEpoch||org!==currentOrg)return;
      if(result.request_id!==id||result.status!=='pending_review'){
        const err=Error('Başvuru sonucu doğrulanamadı');err.uncertain=true;throw err;
      }
      form.elements.namedItem('risk_acknowledged').checked=false;
      el('store-rename-status').textContent='Talep kaydedildi; mağaza adı ve bağlantısı onaylanana kadar değişmedi.';
      void refreshStoreRename(org,request);
    }catch(e){
      if(request!==organizationRequest||epoch!==viewEpoch||org!==currentOrg)return;
      renameUncertain=!!e.uncertain;
      el('store-rename-status').textContent=e.uncertain?
        'Sonuç belirsiz; tekrar göndermeden önce talep geçmişini yenileyin.':
        'Başvuru reddedildi: '+e.message;
      if(!e.uncertain)button.disabled=false;
    }finally{renamePending=false;}
  };

  let ownerPauseRead=0,ownerPausePending=false,ownerPauseUncertain=false;
  let ownerPauseVersion=null,ownerPauseState=null;
  function clearOwnerPause(){
    ownerPauseRead++;ownerPauseVersion=null;ownerPauseState=null;
    ownerPausePending=false;ownerPauseUncertain=false;
    const panel=el('store-owner-pause-panel'),form=el('store-owner-pause-form');
    panel.hidden=true;el('store-owner-pause-status').textContent='';
    const select=form?.elements&&typeof form.elements.namedItem==='function'?
      form.elements.namedItem('seller_id'):null;
    if(select?.replaceChildren)select.replaceChildren();
    if(typeof form?.querySelectorAll==='function')
      for(const b of form.querySelectorAll('button[type=submit]'))b.disabled=true;
    clearOwnerClosing();
    if(typeof clearPlatformClosingOwner==='function')clearPlatformClosingOwner();
  }
  function ownerPauseButtons(){
    const form=el('store-owner-pause-form');
    if(!form||typeof form.querySelectorAll!=='function')return;
    for(const b of form.querySelectorAll('button[type=submit]')){
      b.disabled=ownerPausePending||ownerPauseUncertain||
        !ownerPauseState||ownerPauseState.store_status!=='open'||
        ownerClosingState?.state==='closing'||
        (b.value==='pause'?ownerPauseState.paused:!ownerPauseState.paused);
    }
  }
  async function refreshOwnerPause(org,request){
    const form=el('store-owner-pause-form');
    const seller=form?.elements&&typeof form.elements.namedItem==='function'?
      form.elements.namedItem('seller_id')?.value:null;
    if(!org||!seller||!selectedStoreOwner||document.hidden||
       el('store-owner-pause-panel').hidden)return;
    const seq=++ownerPauseRead,epoch=viewEpoch,st=el('store-owner-pause-status');
    ownerPauseVersion=null;ownerPauseState=null;ownerPauseButtons();
    st.textContent='Güncel mağaza durumu doğrulanıyor…';
    try{
      const data=await api('store-owner-pause?'+new URLSearchParams({
        organization_id:org,seller_id:seller
      }).toString());
      if(seq!==ownerPauseRead||epoch!==viewEpoch||
         request!==organizationRequest||org!==currentOrg||
         seller!==form.elements.namedItem('seller_id').value||document.hidden)return;
      if(data.organization_id!==org||data.seller_id!==seller||
         typeof data.paused!=='boolean'||
         !Number.isSafeInteger(data.version)||data.version<0||
         !['open','suspended','terminated'].includes(data.store_status))
        throw Error('Mağaza durumu doğrulanamadı');
      ownerPauseVersion=data.version;ownerPauseState=data;ownerPauseUncertain=false;
      ownerPauseButtons();
      st.textContent=ownerClosingState?.state==='closing'?
        'Mağaza kalıcı kapatma sürecinde. Geçici ara verme işlemleri kapalı.':
        data.store_status!=='open'?
        'Platform kaynaklı askı veya kapanış var. Owner bu ekrandan satış açamaz.':
        data.paused?'Mağaza geçici arada. Adınız korunuyor; yeni satış kabul edilmiyor.':
          'Mağaza satışa açık. Geçici ara verebilirsiniz.';
    }catch{
      if(seq!==ownerPauseRead||request!==organizationRequest||org!==currentOrg)return;
      ownerPauseUncertain=true;ownerPauseButtons();
      st.textContent='Durum güvenle doğrulanamadı; değişiklik kapatıldı. Yeniden kontrol edin.';
    }
  }
  const ownerPauseForm=el('store-owner-pause-form');
  if(ownerPauseForm?.elements&&typeof ownerPauseForm.elements.namedItem==='function')
  ownerPauseForm.elements.namedItem('seller_id').onchange=()=>{
    ownerPauseUncertain=false;
    if(currentOrg){
      void refreshOwnerPause(currentOrg,organizationRequest);
      void refreshOwnerClosing(currentOrg,organizationRequest);
      void refreshPlatformClosingOwner(currentOrg,organizationRequest);
    }
  };
  el('store-owner-pause-refresh').onclick=()=>{
    if(currentOrg){
      void refreshOwnerPause(currentOrg,organizationRequest);
      void refreshOwnerClosing(currentOrg,organizationRequest);
      void refreshPlatformClosingOwner(currentOrg,organizationRequest);
    }
  };
  if(ownerPauseForm)ownerPauseForm.onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,action=event.submitter?.value,org=currentOrg;
    const request=organizationRequest,epoch=viewEpoch;
    const seller=form.elements.namedItem('seller_id')?.value;
    if(!org||!selectedStoreOwner||document.hidden||ownerPausePending||
       ownerPauseUncertain||!ownerPauseState||ownerPauseVersion===null||
       ownerPauseState.seller_id!==seller||
       !['pause','resume'].includes(action)||
       ownerPauseState.store_status!=='open')return;
    if(!confirm(action==='pause'?
      'Bu mağazanın yeni satışlarını hemen durdurmak istiyor musunuz? Mevcut sepetler satın alınamaz.':
      'Bu mağazadaki size ait geçici arayı kaldırmak istiyor musunuz?'))return;
    ownerPausePending=true;ownerPauseButtons();
    const st=el('store-owner-pause-status');
    st.textContent='İşlem yetki ve mağaza durumuyla birlikte kaydediliyor…';
    const id='dasp_'+crypto.randomUUID().replace(/-/g,'');
    try{
      const result=await api('store-owner-pause',{method:'POST',body:JSON.stringify({
        action,organization_id:org,seller_id:seller,request_id:id,
        expected_version:ownerPauseVersion
      })});
      if(request!==organizationRequest||epoch!==viewEpoch||
         org!==currentOrg||seller!==form.elements.namedItem('seller_id').value)return;
      if(result.seller_id!==seller||
         result.status!==(action==='pause'?'paused':'resumed')||
         !Number.isSafeInteger(result.version))throw Error('Sonuç doğrulanamadı');
      ownerPauseUncertain=false;
      // A fresh read, not a duplicate mutation, determines the displayed state.
      await refreshOwnerPause(org,request);
      if(request===organizationRequest&&org===currentOrg)
        void organizationStores(org,request);
    }catch(e){
      if(request!==organizationRequest||epoch!==viewEpoch||org!==currentOrg)return;
      ownerPauseUncertain=!!e.uncertain||e.httpStatus>=500;
      st.textContent=ownerPauseUncertain?
        'Sonuç belirsiz; tekrar işlem göndermeyin. Durumu yenileyin.':
        'İşlem reddedildi. Güncel mağaza durumunu yeniden kontrol edin.';
      ownerPauseButtons();
    }finally{
      ownerPausePending=false;ownerPauseButtons();
    }
  };

  // Owner closing is independent of the temporary-pause ledger and cannot
  // invoke native reversible Seller termination from this page.
  let ownerClosingRead=0,ownerClosingPending=false,ownerClosingUncertain=false;
  let ownerClosingState=null;
  function clearOwnerClosing(){
    ownerClosingRead++;ownerClosingPending=false;ownerClosingUncertain=false;
    ownerClosingState=null;
    el('store-owner-closing-panel').hidden=true;
    el('store-owner-closing-choice').textContent='';
    el('store-owner-closing-status').textContent='';
    const form=el('store-owner-closing-form');
    if(form?.elements&&typeof form.elements.namedItem==='function'){
      const ack=form.elements.namedItem('consequences_acknowledged');
      if(ack)ack.checked=false;
    }
    if(typeof form?.querySelectorAll==='function')
      for(const b of form.querySelectorAll('button[type=submit]'))b.disabled=true;
  }
  function ownerClosingButtons(){
    const form=el('store-owner-closing-form');
    if(!form?.elements||typeof form.elements.namedItem!=='function'||
       typeof form.querySelectorAll!=='function')return;
    const agreed=form.elements.namedItem('consequences_acknowledged')?.checked===true;
    for(const b of form.querySelectorAll('button[type=submit]')){
      b.disabled=ownerClosingPending||ownerClosingUncertain||
        (b.value==='start'&&!agreed)||!ownerClosingState||
        (b.value==='start'?
          ownerClosingState.state==='closing'||ownerClosingState.store_status!=='open':
          ownerClosingState.state!=='closing'||ownerClosingState.can_withdraw!==true);
    }
  }
  async function refreshOwnerClosing(org,request){
    const choice=el('store-owner-pause-form')?.elements.namedItem('seller_id');
    const seller=choice?.value;
    if(!org||!seller||!selectedStoreOwner||document.hidden||
       el('store-owner-pause-panel').hidden)return;
    const seq=++ownerClosingRead,epoch=viewEpoch;
    const st=el('store-owner-closing-status'),panel=el('store-owner-closing-panel');
    ownerClosingState=null;panel.hidden=false;
    el('store-owner-closing-choice').textContent='Seçili mağaza: '+
      (choice.selectedOptions?.[0]?.textContent||seller);
    ownerClosingButtons();ownerPauseButtons();
    st.textContent='Kapatma durumu doğrulanıyor…';
    try{
      const data=await api('store-owner-closing?'+new URLSearchParams({
        organization_id:org,seller_id:seller
      }).toString());
      if(seq!==ownerClosingRead||epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||seller!==choice.value||document.hidden)return;
      if(data.organization_id!==org||data.seller_id!==seller||
         !['none','closing','withdrawn'].includes(data.state)||
         !['open','suspended','terminated'].includes(data.store_status)||
         !Number.isSafeInteger(data.version)||data.version<0||
         typeof data.can_withdraw!=='boolean'||
         !Number.isSafeInteger(data.remaining_seconds)||
         data.remaining_seconds<0||data.remaining_seconds>2592000||
         data.permanent_finalization_enabled!==false||
         !data.email_notice||
         !['not_applicable','queued','pending','inflight','accepted',
           'failed','unverified_identity','uncertain','invalidated']
           .includes(data.email_notice.status)||
         !Number.isSafeInteger(data.email_notice.attempts)||
         data.email_notice.attempts<0||data.email_notice.attempts>4||
         typeof data.email_notice.smtp_accepted!=='boolean'||
         data.email_notice.mailbox_delivery_verified!==false||
         !data.notification_coverage||
         !Number.isSafeInteger(data.notification_coverage.protected_owners)||
         data.notification_coverage.protected_owners<0||
         data.notification_coverage.protected_owners>100||
         !Number.isSafeInteger(data.notification_coverage.personal_receipts)||
         data.notification_coverage.personal_receipts<0||
         data.notification_coverage.personal_receipts>
           data.notification_coverage.protected_owners||
         data.notification_coverage.mailbox_delivery_verified!==false||
         (data.state!=='none'&&
           (!Number.isFinite(new Date(data.due_at).getTime())||
            !Number.isFinite(new Date(data.started_at).getTime()))))
        throw Error('Kapatma durumu doğrulanamadı');
      ownerClosingState=data;ownerClosingUncertain=false;
      ownerClosingButtons();ownerPauseButtons();
      if(data.state==='closing'){
        const deadline=new Date(data.due_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'});
        const left=data.remaining_seconds;
        const days=Math.floor(left/86400),hours=Math.floor((left%86400)/3600);
        const minutes=Math.floor((left%3600)/60),seconds=left%60;
        st.textContent=left===0?
          '30 günlük bekleme süresi doldu. Yeni satışlar hâlâ kapalı. '+
          'Kapatma güvenlik kontrolleri tamamlanmadan geri dönüşsüz işlem yapılmıyor. '+
          'Sürenin dolması mağaza adını veya geçmiş siparişleri kendiliğinden değiştirmez. '+
          'Geri çekme süresi sona erdi.':
          'Yeni satışlar durduruldu. Kalan süre (yenilendiğinde): '+
          days+' gün, '+hours+' saat, '+minutes+' dakika, '+seconds+
          ' saniye. 30 günlük sürenin bitişi: '+deadline+
          (data.can_withdraw?' — Süre dolmadan geri çekebilirsiniz.':
          ' — Güncel geri çekme hakkı doğrulanamadı; yeniden kontrol edin.');
        el('store-owner-pause-status').textContent=
          'Mağaza için kapatma talebi etkin; geçici ara verme kullanılamaz.';
      }else if(data.state==='withdrawn'){
        st.textContent='Kapatma talebi geri çekildi. Diğer satış engelleri geçerliliğini korur.';
      }else st.textContent='Aktif 30 günlük kapatma talebi bulunmuyor.';
      if(data.state!=='none'){
        // The current event's aggregate in-account receipts are visible in
        // BOTH closing and withdrawn states, never proof of mailbox delivery.
        const coverage=data.notification_coverage;
        st.textContent+=' Korunan Owner bildirim kayıtları: '+
          coverage.personal_receipts+'/'+coverage.protected_owners+
          ' kişiye özel kayıt oluşturuldu. E-posta teslimi veya okunma bu sayılardan doğrulanmaz.';
        // This is the current logged-in Person's private security notice.
        // SMTP acceptance is NOT mailbox delivery or proof of reading.
        const notice=data.email_notice;
        const labels={
          not_applicable:'Bu hesabınız için bildirim alıcısı kaydı bulunamadı.',
          queued:'Kişisel bildirim kaydedildi; e-posta denemesi sırada.',
          pending:'E-posta denemesi planlandı.',
          inflight:'E-posta denemesi sürüyor.',
          accepted:'SMTP sunucusu e-postayı kabul etti; posta kutusuna teslim doğrulanmadı.',
          failed:'Son e-posta denemesi başarısız; teslim doğrulanmadı.',
          unverified_identity:'Doğrulanmış e-posta kimliği bulunamadı; teslim doğrulanmadı.',
          uncertain:'E-posta gönderim sonucu belirsiz; teslim doğrulanmadı.',
          invalidated:'Bu olay için gönderim yetki veya kapatma değişimi nedeniyle geçersiz.'
        };
        st.textContent+=' Kişisel güvenlik e-postanız: '+
          labels[notice.status]+
          (notice.attempts>0?' Deneme sayısı: '+notice.attempts+'.':'')+
          (notice.status!=='accepted'&&notice.smtp_accepted?
            ' Önceki bir denemeyi SMTP kabul etmişti; teslim yine doğrulanmadı.':'');
      }
    }catch{
      if(seq!==ownerClosingRead||request!==organizationRequest||org!==currentOrg)return;
      ownerClosingUncertain=true;ownerClosingButtons();ownerPauseButtons();
      st.textContent='Kapatma durumu doğrulanamadı; işlem kapatıldı. Yeniden kontrol edin.';
    }
  }
  const ownerClosingForm=el('store-owner-closing-form');
  if(ownerClosingForm?.elements&&typeof ownerClosingForm.elements.namedItem==='function'){
    const ack=ownerClosingForm.elements.namedItem('consequences_acknowledged');
    if(ack)ack.onchange=ownerClosingButtons;
  }
  el('store-owner-closing-refresh').onclick=()=>{
    if(currentOrg)void refreshOwnerClosing(currentOrg,organizationRequest);
  };
  ownerClosingForm.onsubmit=async event=>{
    event.preventDefault();
    const action=event.submitter?.value,org=currentOrg,request=organizationRequest;
    const epoch=viewEpoch,choice=el('store-owner-pause-form').elements.namedItem('seller_id');
    const seller=choice?.value,state=ownerClosingState;
    if(!org||!selectedStoreOwner||document.hidden||ownerClosingPending||
       ownerClosingUncertain||!state||state.seller_id!==seller||
       (action==='start'&&
         !ownerClosingForm.elements.namedItem('consequences_acknowledged').checked)||
       !['start','withdraw'].includes(action)||
       (action==='start'&&(state.state==='closing'||state.store_status!=='open'))||
       (action==='withdraw'&&(state.state!=='closing'||!state.can_withdraw)))return;
    if(!confirm(action==='start'?
      'Bu mağazanın yeni satışlarını hemen durdurmak ve 30 günlük kalıcı kapatma sürecini başlatmak istiyor musunuz?':
      'Henüz kesinleşmemiş bu kapatma talebini geri çekmek istiyor musunuz?'))return;
    ownerClosingPending=true;ownerClosingButtons();ownerPauseButtons();
    const st=el('store-owner-closing-status');
    st.textContent='Güncel yetki, sürüm ve süre doğrulanarak kayıt yapılıyor…';
    const id='dasc_'+crypto.randomUUID().replace(/-/g,'');
    try{
      const result=await api('store-owner-closing',{method:'POST',body:JSON.stringify({
        action,organization_id:org,seller_id:seller,request_id:id,
        expected_version:state.version,
        ...(action==='start'?{consequences_acknowledged:true}:{})
      })});
      if(epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||choice.value!==seller||document.hidden)return;
      if(result.seller_id!==seller||result.status!==(action==='start'?'closing':'withdrawn')||
         !Number.isSafeInteger(result.version)){
        const err=Error('İşlemin sonucu doğrulanamadı');err.uncertain=true;throw err;
      }
      ownerClosingUncertain=false;
      ownerClosingForm.elements.namedItem('consequences_acknowledged').checked=false;
      await refreshOwnerClosing(org,request);
      if(request===organizationRequest&&org===currentOrg)
        void organizationStores(org,request);
    }catch(error){
      if(epoch!==viewEpoch||request!==organizationRequest||org!==currentOrg)return;
      ownerClosingUncertain=!!error.uncertain||error.httpStatus>=500;
      st.textContent=ownerClosingUncertain?
        'Sonuç belirsiz. Tekrar göndermeyin; özel durumu yeniden kontrol edin.':
        'İşlem reddedildi. Yeniden güçlü doğrulama veya güncel mağaza kaydı gerekebilir.';
      ownerClosingButtons();ownerPauseButtons();
    }finally{
      ownerClosingPending=false;ownerClosingButtons();ownerPauseButtons();
    }
  };

  let organizationStoresBusyKey=null;
  async function organizationStores(org,request){
    if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
    // A second refresh of this same Owner/Organization while the ordinary
    // or private rename-only GET is pending would see a temporarily empty
    // select and wrongly discard its prepared Store. Serialize that cycle.
    const key=org+'|'+request;
    if(organizationStoresBusyKey===key)return;
    organizationStoresBusyKey=key;
    const refreshButton=el('org-stores-refresh');
    refreshButton.disabled=true;
    const seq=++storeRequest;
    // Capture the exact prepared Store before the ordinary list clears the
    // native select. A later rename-only response must never select another.
    const existingRenameForm=el('store-rename-form');
    // Capture at the moment options are replaced (not before the HTTP GET):
    // the Owner may have changed selection while the request was pending.
    let preparedRenameSeller='',hadPreparedRename=false;
    const target=el('org-stores'),message=el('org-stores-status');
    el('org-stores-panel').hidden=false;
    target.replaceChildren();message.textContent='Mağazalar kontrol ediliyor…';
    el('org-stores-refresh').hidden=false;
    try{
      const data=await api('organization-stores?organization='+encodeURIComponent(org));
      if(request!==organizationRequest||seq!==storeRequest||currentOrg!==org||document.hidden)return;
      if(data.organization_id!==org||!Array.isArray(data.stores)||
          data.stores.some(s=>typeof s?.id!=='string'||!/^sel_[A-Za-z0-9_-]+$/.test(s.id)||typeof s.name!=='string')||
          new Set(data.stores.map(s=>s.id)).size!==data.stores.length)throw new Error('Mağaza yanıtı doğrulanamadı');
      for(const store of data.stores){
        const line=document.createElement('p');
        line.textContent=store.name+' — '+store.id;
        target.append(line);
      }
      message.textContent=data.stores.length?'Yetkili mağazalar güncellendi.':'Bu kuruluşta görüntülenebilir onaylı mağaza bulunmuyor.';
      const renameForm=el('store-rename-form');
      const select=renameForm?.elements&&typeof renameForm.elements.namedItem==='function'?
        renameForm.elements.namedItem('seller_id'):null;
      if(select&&typeof select.replaceChildren==='function'){
        preparedRenameSeller=select.value||'';
        hadPreparedRename=!!(existingRenameForm.elements.namedItem('name').value||
          existingRenameForm.elements.namedItem('handle').value||
          existingRenameForm.elements.namedItem('risk_acknowledged').checked);
        select.replaceChildren();
        el('store-rename-panel').hidden=true;
        if(selectedStoreOwner){
          // A rename-only HTTP read may be slower than the ordinary Store
          // list or may fail. Never block open Store rendering or re-open
          // stale private values after a different Organization is selected.
          await (async()=>{
            try{
              const renameData=await api('organization-stores?organization='+
                encodeURIComponent(org)+'&purpose=rename');
              if(request!==organizationRequest||seq!==storeRequest||
                 currentOrg!==org||document.hidden||!selectedStoreOwner)return;
              if(renameData.organization_id!==org||
                 !Array.isArray(renameData.stores)||renameData.stores.length>50||
                 renameData.stores.some(s=>typeof s?.id!=='string'||
                   !/^sel_[A-Za-z0-9_-]+$/.test(s.id)||
                   typeof s?.name!=='string'||
                   !['open','suspended'].includes(s?.status))||
                 new Set(renameData.stores.map(s=>s.id)).size!==renameData.stores.length)
                throw Error('Name-management Store response invalid');
              const sameSeller=preparedRenameSeller&&
                renameData.stores.some(store=>store.id===preparedRenameSeller);
              select.replaceChildren();
              for(const store of renameData.stores){
                const opt=document.createElement('option');
                opt.value=store.id;
                opt.textContent=store.name+
                  (store.status==='suspended'?' — askıda':'');
                select.append(opt);
              }
              if(sameSeller)select.value=preparedRenameSeller;
              else if(preparedRenameSeller||hadPreparedRename||renameTargetMustSelect){
                // Never bind a prepared name/handle/explicit risk consent to
                // the first option after the original Store loses authority.
                const placeholder=document.createElement('option');
                placeholder.value='';placeholder.textContent='Mağazayı yeniden seçin';
                select.prepend(placeholder);select.value='';
                existingRenameForm.elements.namedItem('name').value='';
                existingRenameForm.elements.namedItem('handle').value='';
                existingRenameForm.elements.namedItem('risk_acknowledged').checked=false;
                renameTargetMustSelect=true;
                renameRead++;renameUncertain=true;
                el('store-rename-history').replaceChildren();
                existingRenameForm.querySelector('button[type=submit]').disabled=true;
                el('store-rename-status').textContent=
                  'Önceki mağaza artık yetkili listede yok. Yeni mağazayı seçip adı, bağlantıyı ve risk kabulünü yeniden doldurun.';
              }
              el('store-rename-panel').hidden=renameData.stores.length===0;
              if(!el('store-rename-panel').hidden&&select.value)
                void refreshStoreRename(org,request);
              // Owner's pause selector is private and independent from the
              // commercial Store picker. It also lists a currently paused
              // native-OPEN Store so its Owner can safely resume.
              const pauseForm=el('store-owner-pause-form');
              const pauseChoice=pauseForm?.elements&&
                typeof pauseForm.elements.namedItem==='function'?
                pauseForm.elements.namedItem('seller_id'):null;
              if(pauseChoice&&typeof pauseChoice.replaceChildren==='function'){
              pauseChoice.replaceChildren();
              for(const store of renameData.stores){
                const opt=document.createElement('option');
                opt.value=store.id;
                opt.textContent=store.name+(store.status==='suspended'?' — platform askısında':'');
                pauseChoice.append(opt);
              }
              el('store-owner-pause-panel').hidden=renameData.stores.length===0;
              if(renameData.stores.length){
                 void refreshOwnerPause(org,request);
                 void refreshOwnerClosing(org,request);
                 void refreshPlatformClosingOwner(org,request);
               }
              }

            }catch{
              if(request!==organizationRequest||seq!==storeRequest||
                 currentOrg!==org||document.hidden)return;
              clearOwnerPause();
              renameRead++;renameUncertain=true;
              if(typeof existingRenameForm?.reset==='function')existingRenameForm.reset();
              existingRenameForm?.querySelector('button[type=submit]')?.setAttribute('disabled','');
              select.replaceChildren();
              el('store-rename-history').replaceChildren();
              el('store-rename-panel').hidden=true;
              el('store-rename-status').textContent=
                'Mağaza adı yönetimi doğrulanamadı. Yeniden deneyin.';
            }
          })();
        }
      }
    }catch(e){
      if(request!==organizationRequest||seq!==storeRequest||currentOrg!==org)return;
      // Preserve the selected Owner only for a transient list failure.
      // A definite access denial must not retain even client-side Owner UI state.
      target.replaceChildren();clearStoreRename(![401,403,404].includes(e.httpStatus));
      if(e.httpStatus===401){concealPrivateView();el('login').hidden=false;return}
      message.textContent=[403,404].includes(e.httpStatus)?'Bu kuruluşun mağazalarına erişim izniniz yok.':'Mağazalar doğrulanamadı. Yeniden deneyin.';
    }finally{
      if(organizationStoresBusyKey===key){
        organizationStoresBusyKey=null;
        refreshButton.disabled=false;
      }
    }
  }



  // Follow management is independent of the visible catalogue. A Store
  // may disappear from catalog while its Organization-owned follow persists.
  let buyerFollowRequest=0,buyerFollowCursor=null,buyerFollowNext=null;
  function clearBuyerFollowList(){
    buyerFollowRequest++;buyerFollowCursor=null;buyerFollowNext=null;
    el('buyer-follow-panel').hidden=true;
    el('buyer-follow-items').replaceChildren();
    el('buyer-follow-status').textContent='';
    el('buyer-follow-next').disabled=true;
  }
  async function buyerFollowList(org,request,after=null){
    if(request!==organizationRequest||currentOrg!==org||
       document.hidden||el('workspace').hidden)return;
    const seq=++buyerFollowRequest,panel=el('buyer-follow-panel');
    const root=el('buyer-follow-items'),message=el('buyer-follow-status');
    const next=el('buyer-follow-next');
    panel.hidden=true;root.replaceChildren();next.disabled=true;
    message.textContent='Bu işletmenin takipleri doğrulanıyor…';
    const current=()=>seq===buyerFollowRequest&&request===organizationRequest&&
      currentOrg===org&&!document.hidden&&!el('workspace').hidden;
    try{
      const q=new URLSearchParams({organization_id:org});
      if(after!==null)q.set('after',after);
      const data=await api('store-follows?'+q.toString());
      if(!current())return;
      if(data.organization_id!==org||!Array.isArray(data.stores)||
         data.stores.length>20||
         !(data.next_cursor===null||
           (typeof data.next_cursor==='string'&&
            /^sel_[A-Za-z0-9_-]+$/.test(data.next_cursor))))
        throw new Error('Takip listesi doğrulanamadı');
      let previous=after;
      for(const store of data.stores){
        if(typeof store.name!=='string'||store.name.trim()!==store.name||
           !store.name.length||store.name.length>120||
           (store.handle!==null&&(typeof store.handle!=='string'||
             !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(store.handle)))||
           typeof store.seller_id!=='string'||
           !/^sel_[A-Za-z0-9_-]+$/.test(store.seller_id)||
           (previous!==null&&store.seller_id<=previous)||
           !Number.isSafeInteger(store.version)||store.version<1||
           store.version>=2147483647)
          throw new Error('Takip kaydı doğrulanamadı');
        previous=store.seller_id;
      }
      if((data.next_cursor!==null&&
          (!data.stores.length||
           data.next_cursor!==data.stores[data.stores.length-1].seller_id))||
         (data.stores.length<20&&data.next_cursor!==null))
        throw new Error('Takip sayfası doğrulanamadı');
      buyerFollowCursor=after;buyerFollowNext=data.next_cursor;
      for(const store of data.stores){
        const row=document.createElement('li'),button=document.createElement('button');
        const feedback=document.createElement('span');
        if(typeof row.append!=='function'||!button.dataset||
           typeof feedback.setAttribute!=='function')continue;
        const sellerId=store.seller_id,version=store.version;
        button.type='button';
        button.textContent='Takipten çık: '+store.name+
          (store.handle?' ('+store.handle+')':'');
        button.dataset.unfollowSellerId=sellerId;
        feedback.setAttribute('role','status');
        row.append(button,feedback);root.append(row);
        button.onclick=async()=>{
          if(!current()||button.disabled)return;
          button.disabled=true;feedback.textContent='Takipten çıkılıyor…';
          let uncertain=false;
          try{
            const result=await api('store-follows',{method:'POST',
              body:JSON.stringify({action:'unfollow',organization_id:org,
                seller_id:sellerId,expected_version:version})});
            if(!current())return;
            if(result.organization_id!==org||result.seller_id!==sellerId||
               result.following!==false||result.version!==version+1){
              const e=new Error('Takip sonucu doğrulanamadı');
              e.uncertain=true;throw e;
            }
            // Re-read authorized persistent state; do not infer another Store
            // became visible, or silently repeat an uncertain write.
            await buyerFollowList(org,request,after);
          }catch(error){
            if(!current())return;
            uncertain=!!error.uncertain;
            feedback.textContent=uncertain?
              'Sonuç belirsiz; yeniden göndermeyin. Takipleri yenileyerek kontrol edin.':
              error.httpStatus===409?
                'Takip değişmiş; takipleri yenileyerek kontrol edin.':
                'Takipten çıkılamadı. Güncel yetkiyi kontrol edin.';
          }finally{
            if(current()&&!uncertain)button.disabled=false;
          }
        };
      }
      panel.hidden=false;next.disabled=data.next_cursor===null;
      message.textContent=data.stores.length?
        'Bu işletmenin takip ettiği mağazalar listelendi.':
        'Bu sayfada takip edilen mağaza bulunmuyor.';
    }catch(error){
      if(!current())return;
      root.replaceChildren();panel.hidden=true;next.disabled=true;
      message.textContent='';
    }
  }
  el('buyer-follow-refresh').onclick=()=>{
    if(currentOrg)void buyerFollowList(currentOrg,organizationRequest);
  };
  el('buyer-follow-next').onclick=()=>{
    if(currentOrg&&buyerFollowNext&&!el('buyer-follow-panel').hidden)
      void buyerFollowList(currentOrg,organizationRequest,buyerFollowNext);
  };

  let buyerContextRequest=0,buyerCatalogRequest=0,buyerCatalogPage=0,buyerOrderRequest=0;
  function clearBuyerContext(){
    buyerContextRequest++;buyerCatalogRequest++;buyerOrderRequest++;buyerCatalogPage=0;
    const orderStatus=el('buyer-order-status'),orderItems=el('buyer-order-items');
    if(orderStatus)orderStatus.textContent='';
    if(orderItems)orderItems.replaceChildren();
    const orderForm=el('buyer-order-lookup');
    if(orderForm){
      if(typeof orderForm.reset==='function')orderForm.reset();
      else if(orderForm.elements?.order_group_id)orderForm.elements.order_group_id.value='';
    }
    el('buyer-catalog-prev').disabled=true;
    el('buyer-catalog-next').disabled=true;
    const catalog=el('buyer-catalog-panel');
    if(catalog)catalog.hidden=true;
    const items=el('buyer-catalog-items');
    if(items)items.replaceChildren();
    const catalogStatus=el('buyer-catalog-status');
    if(catalogStatus)catalogStatus.textContent='';
    const panel=el('buyer-context-panel');
    if(panel)panel.hidden=true;
    const statusEl=el('buyer-context-status');
    if(statusEl)statusEl.textContent='';
    const nativeStatus=el('buyer-customer-status');
    if(nativeStatus)nativeStatus.textContent='';
  }
  async function buyerContext(org,request){
    if(request!==organizationRequest||currentOrg!==org||
       document.hidden||el('workspace').hidden)return;
    const panel=el('buyer-context-panel'),statusEl=el('buyer-context-status');
    // Historical unit DOM stubs may not carry this new section.
    if(!panel||!statusEl)return;
    const seq=++buyerContextRequest;
    panel.hidden=true;
    statusEl.textContent='';
    try{
      const data=await api('buyer-context?organization_id='+encodeURIComponent(org));
      if(seq!==buyerContextRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden||el('workspace').hidden)return;
      if(data.organization_id!==org||
         data.status!=='buyer_permission_verified'||data.checkout_ready!==false)
        throw new Error('Kuruluş satın alma yetkisi doğrulanamadı');
      statusEl.textContent='Bu kuruluş adına satın alma izniniz doğrulandı. Sepet ve ödeme henüz kullanıma açık değil.';
      panel.hidden=false;
      void buyerCatalog(org,request);
    }catch(e){
      if(seq!==buyerContextRequest||request!==organizationRequest||
         currentOrg!==org)return;
      statusEl.textContent='';
      panel.hidden=true;
    }
  }
  // Historical order detail requires a live, server-verified Buyer Organization
  // on EVERY lookup. The browser supplies only a selector, never native tokens.
  const buyerOrderForm=el('buyer-order-lookup');
  if(buyerOrderForm)buyerOrderForm.onsubmit=async event=>{
    event.preventDefault();
    const org=currentOrg,epoch=organizationRequest,seq=++buyerOrderRequest;
    const statusEl=el('buyer-order-status'),root=el('buyer-order-items');
    root.replaceChildren();
    statusEl.textContent='';
    if(!org||document.hidden||el('workspace').hidden||
       el('buyer-context-panel').hidden)return;
    const id=buyerOrderForm.elements.order_group_id.value.trim();
    if(!/^og_[A-Za-z0-9_-]{1,123}$/.test(id)){
      statusEl.textContent='Geçerli bir sipariş grubu kodu girin.';return;
    }
    const valid=()=>seq===buyerOrderRequest&&epoch===organizationRequest&&
      currentOrg===org&&!document.hidden&&!el('workspace').hidden&&
      !el('buyer-context-panel').hidden;
    statusEl.textContent='Sipariş ve kuruluş yetkisi denetleniyor…';
    try{
      const params=new URLSearchParams({organization_id:org,order_group_id:id});
      const data=await api('order-groups?'+params.toString());
      if(!valid())return;
      const group=data?.order_group;
      if(data.organization_id!==org||!group||group.id!==id||
         !Number.isSafeInteger(group.display_id)||!Array.isArray(group.orders)||
         group.orders.length<1||group.orders.length>50)
        throw Error('Order response invalid');
      const nodes=document.createDocumentFragment();
      for(const order of group.orders){
        if(!Number.isSafeInteger(order.display_id)||
           typeof order.status!=='string'||!Array.isArray(order.items)||
           order.items.length<1||order.items.length>100)
          throw Error('Order scope invalid');
        const li=document.createElement('li');
        li.textContent='Sipariş #'+order.display_id+' — Durum: '+order.status;
        const items=document.createElement('ul');
        for(const item of order.items){
          if(typeof item.title!=='string'||!Number.isSafeInteger(item.quantity))
            throw Error('Order item invalid');
          const line=document.createElement('li');
          line.textContent=item.title+' — '+item.quantity+' adet';
          items.append(line);
        }
        li.append(items);nodes.append(li);
      }
      root.replaceChildren(nodes);
      statusEl.textContent='Bu kuruluşa ait geçmiş sipariş doğrulandı.';
    }catch{
      if(!valid())return;
      root.replaceChildren();
      statusEl.textContent='Sipariş bulunamadı veya bu kuruluştan görüntüleme yetkiniz yok.';
    }
  };
  async function buyerCatalog(org,request,page=buyerCatalogPage){
    if(request!==organizationRequest||currentOrg!==org||document.hidden||
       el('workspace').hidden||el('buyer-context-panel').hidden||
       !Number.isInteger(page)||page<0||page>4)return;
    const panel=el('buyer-catalog-panel'),statusEl=el('buyer-catalog-status');
    const root=el('buyer-catalog-items'),seq=++buyerCatalogRequest;
    const previous=el('buyer-catalog-prev'),next=el('buyer-catalog-next');
    panel.hidden=true;root.replaceChildren();
    previous.disabled=true;next.disabled=true;
    statusEl.textContent='Yetkili mağaza ürünleri denetleniyor…';
    try{
      const query=new URLSearchParams({organization_id:org,page:String(page)});
      const data=await api('catalog?'+query.toString());
      if(seq!==buyerCatalogRequest||request!==organizationRequest||currentOrg!==org||
         document.hidden||el('workspace').hidden||
         el('buyer-context-panel').hidden)return;
      if(data.organization_id!==org||data.page!==page||
         data.prices_available!==false||data.checkout_ready!==false||
         !Array.isArray(data.stores)||data.stores.length>20)
        throw Error('Ürün kapsamı doğrulanamadı');
      for(const store of data.stores){
        if(typeof store.id!=='string'||typeof store.name!=='string'||
           !Array.isArray(store.products)||store.products.length>5)
          throw Error('Mağaza ürün kapsamı doğrulanamadı');
        for(const product of store.products){
          if(typeof product.title!=='string'||typeof product.product_id!=='string'||
             typeof product.offer_id!=='string')throw Error('Ürün kapsamı doğrulanamadı');
          const li=document.createElement('li');
          let line=store.name+' — '+product.title;
          if(product.list_price_try!==undefined){
            const price=product.list_price_try;
            if(!price||price.currency_code!=='try'||typeof price.amount!=='number'||
               !Number.isFinite(price.amount)||price.amount<=0||
               price.amount>1000000000||!/^\\d+(?:\\.\\d{1,2})?$/.test(String(price.amount)))
              throw Error('Liste fiyatı doğrulanamadı');
            line+=' — TRY referans liste fiyatı: '+
              new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'})
                .format(price.amount)+' (ödenecek tutar değil)';
          }
          if(product.buyer_reference_try!==undefined){
            const price=product.buyer_reference_try;
            if(!price||price.currency_code!=='try'||typeof price.amount!=='number'||
               !Number.isFinite(price.amount)||price.amount<=0||
               price.amount>1000000000||
               !/^[0-9]+(?:[.][0-9]{1,2})?$/.test(String(price.amount))||
               product.list_price_try===undefined)
              throw Error('Bu işletmeye özel fiyat doğrulanamadı');
            line+=' — Bu işletmeye özel TRY referans fiyatı: '+
              new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'})
                .format(price.amount)+' (ödenecek tutar değil)';
          }
          li.textContent=line;
          root.append(li);
        }
        // A follow belongs to the selected Buyer Organization, not to
        // this Person or to a Medusa Customer account. Unauthorized Members
        // never receive a follow button; Server authorizes every mutation.
        const followRow=document.createElement('li');
        const button=document.createElement('button');
        const feedback=document.createElement('span');
        // Keep the older minimal DOM test harness and non-interactive
        // renderers on the existing read-only catalog path.
        if(typeof followRow.append!=='function'||!button.dataset||
           typeof feedback.setAttribute!=='function')continue;
        button.type='button';button.disabled=true;
        button.textContent='Mağaza takip durumu kontrol ediliyor';
        feedback.setAttribute('role','status');
        followRow.append(button,feedback);root.append(followRow);
        const current=()=>seq===buyerCatalogRequest&&
          request===organizationRequest&&currentOrg===org&&
          !document.hidden&&!el('workspace').hidden&&
          !el('buyer-context-panel').hidden;
        const sellerId=store.id;
        button.dataset.followSellerId=sellerId;
        void (async()=>{
          try{
            const q=new URLSearchParams({organization_id:org,seller_id:sellerId});
            const state=await api('store-follows?'+q.toString());
            if(!current())return;
            if(state.organization_id!==org||state.seller_id!==sellerId||
               typeof state.following!=='boolean'||!Number.isSafeInteger(state.version)||
               state.version<0||state.version>=2147483647)
              throw new Error('Takip durumu doğrulanamadı');
            let following=state.following,version=state.version;
            const label=()=>button.textContent=following?
              store.name+' mağazasını takipten çık':
              store.name+' mağazasını takip et';
            label();button.disabled=false;
            button.onclick=async()=>{
              if(!current()||button.disabled)return;
              const action=following?'unfollow':'follow';
              const oldVersion=version;
              button.disabled=true;feedback.textContent='Takip işlemi kaydediliyor…';
              let uncertain=false;
              try{
                const result=await api('store-follows',{method:'POST',
                  body:JSON.stringify({action,organization_id:org,
                    seller_id:sellerId,expected_version:oldVersion})});
                if(!current())return;
                if(result.organization_id!==org||result.seller_id!==sellerId||
                   result.following!==(action==='follow')||
                   result.version!==oldVersion+1){
                  // A successful write may return a malformed 200 response.
                  // Keep the button disabled until a fresh authorized GET.
                  const mismatch=new Error('Takip sonucu doğrulanamadı');
                  mismatch.uncertain=true;
                  throw mismatch;
                }
                following=result.following;version=result.version;label();
                feedback.textContent=following?
                  'Bu işletme mağazayı takip ediyor. Özel fiyat veya ödeme hakkı verilmedi.':
                  'Bu işletme mağazayı takipten çıktı.';
              }catch(error){
                if(!current())return;
                uncertain=!!error.uncertain;
                feedback.textContent=uncertain?
                  'Sonuç belirsiz; yeniden göndermeyin. Ürünleri güncelleyerek kontrol edin.':
                  error.httpStatus===409?
                    'Takip durumu değişmiş; Ürünleri güncelleyerek kontrol edin.':
                    'Takip işlemi reddedildi. Güncel yetkiyi ve mağazayı kontrol edin.';
              }finally{
                if(current()&&!uncertain)button.disabled=false;
              }
            };
          }catch(error){
            if(current())followRow.remove();
          }
        })();
      }
      buyerCatalogPage=page;
      previous.disabled=page===0;next.disabled=page===4;
      statusEl.textContent='Mağaza dilimi '+(page+1)+'/5. '+
        (root.children.length
          ? 'İzinli ürünler ve varsa mağazaya özel TRY referansları gösteriliyor.'
          : 'Bu dilimde gösterilebilir ürün yok; diğer dilimler ayrıca kontrol edilebilir.')+
        ' Vergi, kur dönüşümü ve ödeme kapalıdır.';
      panel.hidden=false;
    }catch(e){
      if(seq!==buyerCatalogRequest||request!==organizationRequest||currentOrg!==org)return;
      root.replaceChildren();panel.hidden=true;
      previous.disabled=true;next.disabled=true;
      statusEl.textContent='';
    }
  }
  el('buyer-catalog-prev').onclick=()=>{
    if(currentOrg&&buyerCatalogPage>0&&!el('buyer-catalog-panel').hidden)
      void buyerCatalog(currentOrg,organizationRequest,buyerCatalogPage-1);
  };
  el('buyer-catalog-next').onclick=()=>{
    if(currentOrg&&buyerCatalogPage<4&&!el('buyer-catalog-panel').hidden)
      void buyerCatalog(currentOrg,organizationRequest,buyerCatalogPage+1);
  };
  el('buyer-catalog-refresh').onclick=()=>{
    if(currentOrg)void buyerCatalog(currentOrg,organizationRequest);
  };
  el('buyer-context-refresh').onclick=()=>{
    if(currentOrg)void buyerContext(currentOrg,organizationRequest);
  };
  el('buyer-customer-check').onclick=async()=>{
    const org=currentOrg,request=organizationRequest;
    const statusEl=el('buyer-customer-status');
    if(!org||document.hidden||el('workspace').hidden||
       el('buyer-context-panel').hidden)return;
    statusEl.textContent='Müşteri bağı kontrol ediliyor…';
    try{
      const result=await api('buyer-context?organization_id='+
        encodeURIComponent(org)+'&customer=verified');
      if(org!==currentOrg||request!==organizationRequest||
         document.hidden||el('workspace').hidden)return;
      if(result.organization_id!==org||result.status!=='buyer_customer_verified'||
         result.checkout_ready!==false)throw new Error('Müşteri bağı doğrulanamadı');
      statusEl.textContent='Kuruluş izni ve mevcut müşteri bağınız doğrulandı. Sepet ve ödeme hâlâ kapalı.';
    }catch(e){
      if(org===currentOrg&&request===organizationRequest)
        statusEl.textContent='Müşteri bağı doğrulanamadı. Bu kuruluş adına alışverişe geçilemiyor.';
    }
  };
  let buyerPermissionRequest=0;
  function clearBuyerPermissions(){
    buyerPermissionRequest++;
    el('buyer-grants-panel').hidden=true;
    el('buyer-grants-list').replaceChildren();
    el('buyer-grants-status').textContent='';
    const f=el('buyer-grants-form');
    if(typeof f.querySelectorAll==='function'){
      for(const select of f.querySelectorAll('select'))
        if(typeof select.replaceChildren==='function')select.replaceChildren();
      for(const button of f.querySelectorAll('button'))button.disabled=true;
    }
  }
  async function buyerPermissions(org,request,keepOutcome=false){
    if(request!==organizationRequest||currentOrg!==org||document.hidden||
       el('workspace').hidden)return;
    const seq=++buyerPermissionRequest,statusEl=el('buyer-grants-status');
    const form=el('buyer-grants-form'),root=el('buyer-grants-list');
    if(!form||!form.elements||typeof form.elements.namedItem!=='function')return;
    el('buyer-grants-panel').hidden=true;
    if(!keepOutcome)statusEl.textContent='Satın alma yetkileri denetleniyor…';
    try{
      const data=await api('buyer-permissions?organization_id='+encodeURIComponent(org));
      if(seq!==buyerPermissionRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden)return;
      const members=currentMemberships.slice();
      if(!Array.isArray(data.grants)||data.grants.length>100||members.length>100||
         data.grants.some(g=>typeof g.id!=='string'||
           !/^dabpg_[A-Za-z0-9_-]+$/.test(g.id)||
           typeof g.person_id!=='string'||!/^daprs_[A-Za-z0-9_-]+$/.test(g.person_id)))
        throw new Error('İzin listesi doğrulanamadı');
      const active=members.filter(m=>m.status==='active'&&
        typeof m.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(m.id)&&
        typeof m.person_id==='string'&&/^daprs_[A-Za-z0-9_-]+$/.test(m.person_id));
      if(new Set(active.map(m=>m.id)).size!==active.length||
         new Set(data.grants.map(g=>g.person_id)).size!==data.grants.length)
        throw new Error('Üyelik/izin bilgisi tutarsız');
      const select=form.elements.namedItem('membership_id');
      const previous=select.value;
      select.replaceChildren();
      for(const member of active){
        const option=document.createElement('option');option.value=member.id;
        option.textContent=member.person_id+' — '+member.role;
        select.append(option);
      }
      if(active.some(m=>m.id===previous))select.value=previous;
      root.replaceChildren();
      for(const g of data.grants){
        const line=document.createElement('p');
        line.textContent=g.person_id+' — buyer.purchase';
        root.append(line);
      }
      for(const button of form.querySelectorAll('button'))button.disabled=!active.length;
      el('buyer-grants-panel').hidden=false;
      if(!keepOutcome)statusEl.textContent=data.grants.length?
        'Açık satın alma izinleri gösteriliyor.':'Açık satın alma izni bulunmuyor.';
    }catch(e){
      if(seq!==buyerPermissionRequest||request!==organizationRequest||
         currentOrg!==org)return;
      root.replaceChildren();el('buyer-grants-panel').hidden=true;
      statusEl.textContent='Satın alma izinleri doğrulanamadı. Yeniden deneyin.';
    }
  }
  el('buyer-grants-refresh').onclick=()=>{
    if(currentOrg)void buyerPermissions(currentOrg,organizationRequest);
  };
  el('buyer-grants-form').onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden)return;
    const request=organizationRequest,org=currentOrg,form=event.currentTarget;
    const action=event.submitter?.value;
    if(!org||!['grant','revoke'].includes(action))return;
    const buttons=Array.from(form.querySelectorAll('button'));
    for(const b of buttons)b.disabled=true;
    const membership_id=form.elements.namedItem('membership_id').value;
    try{
      const result=await api('buyer-permissions',{method:'POST',
        body:JSON.stringify({action,organization_id:org,membership_id})});
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(result.status!==(action==='grant'?'active':'revoked'))
        throw new Error('Yetki sonucu doğrulanamadı');
      el('buyer-grants-status').textContent=action==='grant'?
        'Satın alma izni kaydedildi.':'Satın alma izni iptal edildi.';
      void buyerPermissions(org,request,true);
      void buyerContext(org,request);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      el('buyer-grants-status').textContent=e.uncertain?
        'Sonuç belirsiz. İşlemi tekrarlamadan önce izinleri yenileyin.':
        'Satın alma izni işlemi reddedildi: '+e.message;
      if(!e.uncertain)for(const b of buttons)b.disabled=false;
    }
  };

  let productPermissionRequest=0,currentMemberships=[];
  async function productPermissions(org,request,keepOutcome=false){
    if(request!==organizationRequest||currentOrg!==org||document.hidden||el('workspace').hidden)return;
    const seq=++productPermissionRequest,statusEl=el('product-grants-status');
    const form=el('product-grants-form'),grantList=el('product-grants-list');
    el('product-grants-panel').hidden=true;
    if(!keepOutcome)statusEl.textContent='İzinler doğrulanıyor…';
    try{
      // The selected Organization already loaded these member records; do not
      // cause a second membership GET that can race role-change refreshes.
      const members={memberships:currentMemberships.slice()};
      const [stores,grants]=await Promise.all([
        api('organization-stores?organization='+encodeURIComponent(org)),
        api('store-product-permissions?organization_id='+encodeURIComponent(org))
      ]);
      if(seq!==productPermissionRequest||request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(stores.organization_id!==org||!Array.isArray(stores.stores)||
         !Array.isArray(members.memberships)||!Array.isArray(grants.grants)||
         grants.grants.length>100||members.memberships.length>100||
         stores.stores.length>50)throw new Error('İzin kapsamı doğrulanamadı');
      const allowedStores=stores.stores.filter(s=>typeof s?.id==='string'&&
        /^sel_[A-Za-z0-9_-]+$/.test(s.id)&&typeof s.name==='string');
      const active=members.memberships.filter(m=>m.status==='active'&&
        m.role==='member'&&m.protected_owner===false&&
        typeof m.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(m.id)&&
        typeof m.person_id==='string'&&/^daprs_[A-Za-z0-9_-]+$/.test(m.person_id));
      if(allowedStores.length!==stores.stores.length||
         new Set(allowedStores.map(s=>s.id)).size!==allowedStores.length||
         new Set(active.map(m=>m.id)).size!==active.length||
         grants.grants.some(g=>typeof g.id!=='string'||
           !/^daspg_[A-Za-z0-9_-]+$/.test(g.id)||
           !allowedStores.some(s=>s.id===g.seller_id)||
           typeof g.person_id!=='string'||
           !/^daprs_[A-Za-z0-9_-]+$/.test(g.person_id)))
        throw new Error('İzin listesi doğrulanamadı');
      const storeSelect=form.elements.namedItem('seller_id');
      const memberSelect=form.elements.namedItem('membership_id');
      const previousStore=storeSelect.value,previousMember=memberSelect.value;
      storeSelect.replaceChildren();memberSelect.replaceChildren();
      for(const store of allowedStores){
        const option=document.createElement('option');option.value=store.id;
        option.textContent=store.name;storeSelect.append(option);
      }
      for(const member of active){
        const option=document.createElement('option');option.value=member.id;
        option.textContent=member.person_id+' — '+member.role;memberSelect.append(option);
      }
      if(allowedStores.some(s=>s.id===previousStore))storeSelect.value=previousStore;
      if(active.some(m=>m.id===previousMember))memberSelect.value=previousMember;
      // Only the persisted personal grant state is shown; no group or
      // native Mercur entitlement is inferred from this single choice.
      const showPersonalChoice=()=>{
        const member=active.find(m=>m.id===memberSelect.value);
        const store=allowedStores.find(s=>s.id===storeSelect.value);
        const label=el('product-grants-effective');
        if(!member||!store){label.textContent='Seçilebilir aktif çalışan veya onaylı mağaza yok.';return;}
        const granted=grants.grants.some(g=>g.person_id===member.person_id&&g.seller_id===store.id);
        label.textContent=granted?
          'Seçilen mağazada açık kişisel seçim: Yetkili. Ayrıca doğrulanmış Mercur üyeliği gerekir.':
          'Seçilen mağazada açık kişisel izin yok: Yetkisiz. Grup Yetkisi henüz kullanılmıyor.';
      };
      storeSelect.onchange=showPersonalChoice;
      memberSelect.onchange=showPersonalChoice;
      showPersonalChoice();
      grantList.replaceChildren();
      for(const grant of grants.grants){
        const line=document.createElement('p');
        line.textContent=grant.person_id+' — '+grant.seller_id+' — products.edit';
        const member=active.find(m=>m.person_id===grant.person_id&&m.role==='member');
        if(member){
          const connect=document.createElement('button');
          connect.type='button';connect.className='store-member-connect';
          connect.textContent='Mağaza çalışanı bağlantısını tamamla';
          connect.onclick=async()=>{
            if(document.hidden||el('workspace').hidden||
               request!==organizationRequest||currentOrg!==org)return;
            connect.disabled=true;
            statusEl.textContent='Mağaza çalışanı bağlantısı kontrol ediliyor…';
            try{
              const result=await api('store-member-connections',{method:'POST',
                body:JSON.stringify({organization_id:org,seller_id:grant.seller_id,
                  membership_id:member.id})});
              if(seq!==productPermissionRequest||request!==organizationRequest||
                 currentOrg!==org||document.hidden)return;
              if(result.status!=='connected')throw Error('Bağlantı doğrulanamadı');
              statusEl.textContent='Mağaza çalışanı bağlantısı tamamlandı. Ürün izni ayrıca kontrol edilir.';
              connect.textContent='Mağaza bağlantısı doğrulandı';
            }catch(e){
              if(seq!==productPermissionRequest||request!==organizationRequest||
                 currentOrg!==org)return;
              statusEl.textContent=e.uncertain?
                'Bağlantının sonucu belirsiz. Tekrar göndermeyin; yetkili inceleme gerekli.':
                'Bağlantı reddedildi. Çalışanın kendi üye hesabını doğrulaması, aktif olması ve ürün izni bulunması gerekir.';
              if(!e.uncertain)connect.disabled=false;
            }
          };
          line.append(' ',connect);
        }
        // Historical Organization Admin may retain an earlier personal
        // products.edit grant. Do not permit a new grant or native Store link,
        // but do expose the existing server-authorized revoke operation.
        const legacy=members.memberships.find(m=>m.person_id===grant.person_id&&
          m.role==='admin'&&m.status==='active'&&m.protected_owner===false&&
          typeof m.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(m.id));
        if(legacy){
          const revoke=document.createElement('button');
          revoke.type='button';revoke.textContent='Eski Admin ürün iznini iptal et';
          revoke.onclick=async()=>{
            if(revoke.disabled||seq!==productPermissionRequest||
               request!==organizationRequest||currentOrg!==org||
               document.hidden||el('workspace').hidden)return;
            revoke.disabled=true;
            statusEl.textContent='Eski izin iptali kontrol ediliyor…';
            try{
              const result=await api('store-product-permissions',{method:'POST',
                body:JSON.stringify({action:'revoke',organization_id:org,
                  seller_id:grant.seller_id,membership_id:legacy.id})});
              if(seq!==productPermissionRequest||request!==organizationRequest||
                 currentOrg!==org||document.hidden)return;
              if(result.status!=='revoked')throw Error('İptal sonucu doğrulanamadı');
              await productPermissions(org,request,true);
              if(request===organizationRequest&&currentOrg===org&&!document.hidden)
                statusEl.textContent='Eski Admin ürün izni iptal edildi.';
              void productDraftStores(org,request);
            }catch(error){
              if(seq!==productPermissionRequest||request!==organizationRequest||
                 currentOrg!==org)return;
              statusEl.textContent=error.uncertain?
                'İptal sonucu belirsiz. Tekrar göndermeyin; izin listesini yenileyip doğrulayın.':
                'Eski ürün izni iptal edilemedi. Yetkiyi ve kaydı kontrol edin.';
              if(!error.uncertain)revoke.disabled=false;
            }
          };
          line.append(' ',revoke);
        }
        grantList.append(line);
      }
      for(const button of form.querySelectorAll('button'))button.disabled=!allowedStores.length||!active.length;
      el('product-grants-panel').hidden=false;
      if(!keepOutcome)statusEl.textContent=grants.grants.length?
        'Aktif ürün düzenleme izinleri gösteriliyor.':'Aktif ürün düzenleme izni bulunmuyor.';
    }catch(e){
      if(seq!==productPermissionRequest||request!==organizationRequest||currentOrg!==org)return;
      grantList.replaceChildren();
      el('product-grants-effective').textContent='';
      el('product-grants-panel').hidden=true;
      statusEl.textContent='İzinler doğrulanamadı. Yeniden deneyin.';
    }
  }
  el('product-grants-refresh').onclick=()=>{
    if(currentOrg)void productPermissions(currentOrg,organizationRequest);
  };
  el('product-grants-form').onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden)return;
    const request=organizationRequest,org=currentOrg,form=event.currentTarget;
    const action=event.submitter?.value;
    if(!org||!['grant','revoke'].includes(action))return;
    const buttons=Array.from(form.querySelectorAll('button'));
    for(const button of buttons)button.disabled=true;
    const seller_id=form.elements.namedItem('seller_id').value;
    const membership_id=form.elements.namedItem('membership_id').value;
    try{
      const outcome=await api('store-product-permissions',{method:'POST',body:JSON.stringify({
        action,organization_id:org,seller_id,membership_id
      })});
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(!['active','revoked'].includes(outcome.status)||
         outcome.status!==(action==='grant'?'active':'revoked'))
        throw new Error('İzin sonucu doğrulanamadı');
      el('product-grants-status').textContent=action==='grant'?
        'Ürün düzenleme izni kaydedildi; kullanım için ayrıca doğrulanmış Mercur mağaza üyeliği gerekir.':'Ürün düzenleme izni iptal edildi.';
      void productPermissions(org,request,true);
      void productDraftStores(org,request);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      el('product-grants-status').textContent=e.uncertain?
        'Sonuç belirsiz. Yeniden göndermeden önce izin listesini yenileyin.':
        'İzin işlemi reddedildi: '+e.message;
      if(!e.uncertain)for(const button of buttons)button.disabled=false;
    }
  };

  let productDraftRequest=0,productDraftKey='',productDraftAttempt=null;
  function clearProductDraft(){
    productDraftRequest++;productDraftKey='';productDraftAttempt=null;
    el('product-draft-check').hidden=true;
    el('product-draft-panel').hidden=true;
    el('product-draft-guidance').hidden=true;
    el('product-draft-status').textContent='';
    const form=el('product-draft-form');
    form.hidden=true;
    if(typeof form.reset==='function')form.reset();
    if(typeof form.querySelector==='function'){
      const select=form.querySelector('select');if(select&&typeof select.replaceChildren==='function')select.replaceChildren();
      const button=form.querySelector('button');if(button)button.disabled=true;
    }
  }
  async function productDraftStores(org,request,keepOutcome=false){
    if(document.hidden||request!==organizationRequest||currentOrg!==org)return;
    const form=el('product-draft-form');
    // The historical membership DOM contract intentionally contains no
    // product form; only real browser documents have form.elements.
    if(!form||!form.elements||typeof form.elements.namedItem!=='function')return;
    const seq=++productDraftRequest,select=form.elements.namedItem('seller_id');
    const previous=select.value,panel=el('product-draft-panel');
    const guidance=el('product-draft-guidance');
    const submit=typeof form.querySelector==='function'?form.querySelector('button'):null;
    panel.hidden=true;guidance.hidden=true;form.hidden=true;
    if(submit)submit.disabled=true;
    if(!keepOutcome)el('product-draft-status').textContent='Mağaza yetkileri kontrol ediliyor…';
    try{
      const data=await api('product-drafts?organization_id='+encodeURIComponent(org));
      if(seq!==productDraftRequest||request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(data.organization_id!==org||!Array.isArray(data.stores)||data.stores.length>50||
         data.stores.some(s=>typeof s.id!=='string'||!/^sel_[A-Za-z0-9_-]+$/.test(s.id)||
           typeof s.name!=='string')||
         new Set(data.stores.map(s=>s.id)).size!==data.stores.length)
        throw new Error('Mağaza yetkileri doğrulanamadı');
      select.replaceChildren();
      for(const store of data.stores){
        const option=document.createElement('option');option.value=store.id;
        option.textContent=store.name;select.append(option);
      }
      if(data.stores.some(s=>s.id===previous))select.value=previous;
      panel.hidden=false;
      form.hidden=data.stores.length===0;
      guidance.hidden=data.stores.length!==0;
      if(submit)submit.disabled=data.stores.length===0||!!productDraftAttempt;
      if(!keepOutcome)el('product-draft-status').textContent=data.stores.length?
        'Taslak oluşturabileceğiniz mağazalar hazır.':'Ürün düzenleme yetkisi veya doğrulanmış mağaza üyeliği bulunamadı.';
    }catch(e){
      if(seq!==productDraftRequest||request!==organizationRequest||currentOrg!==org||document.hidden)return;
      select.replaceChildren();form.hidden=true;guidance.hidden=false;
      if(submit)submit.disabled=true;
      panel.hidden=false;
      // Preserve an uncertain native product result; never invite a duplicate POST.
      if(!productDraftAttempt)el('product-draft-status').textContent=
        [401,403].includes(e.httpStatus)?
        'Bu kuruluşta ürün taslağı için işlem izni veya canlı Mercur üyeliği doğrulanamadı.':
        'Mağaza yetkileri şu anda doğrulanamıyor. Taslak oluşturma kapalı; yeniden kontrol edin.';
    }
  }
  el('product-draft-refresh').onclick=()=>{
    if(currentOrg)void productDraftStores(currentOrg,organizationRequest);
  };

  el('product-draft-check').onclick=async()=>{
    const a=productDraftAttempt,request=organizationRequest;
    if(!a||document.hidden||el('workspace').hidden||
       !currentOrg||currentOrg!==a.organization_id)return;
    const button=el('product-draft-check');button.disabled=true;
    try{
      const query=new URLSearchParams({organization_id:a.organization_id,
        seller_id:a.seller_id,request_id:a.request_id});
      const result=await api('product-drafts?'+query.toString());
      if(request!==organizationRequest||currentOrg!==a.organization_id||document.hidden)return;
      if(result.status==='created'&&/^prod_[A-Za-z0-9_-]+$/.test(result.product_id)){
        el('product-draft-status').textContent='Önceden gönderilen taslak doğrulandı: '+result.product_id;
        productDraftKey='';productDraftAttempt=null;
        button.hidden=true;
        el('product-draft-form').reset();
        el('product-draft-form').querySelector('button').disabled=false;
      }else if(result.status==='review_required'){
        // The reconciliation action verifies an EXISTING native product; it
        // never invokes the Mercur create workflow or replays the draft POST.
        const recovered=await api('product-drafts',{method:'POST',
          body:JSON.stringify({...a,action:'reconcile'})});
        if(request!==organizationRequest||currentOrg!==a.organization_id||document.hidden)return;
        if(recovered.status==='created'&&/^prod_[A-Za-z0-9_-]+$/.test(recovered.product_id)){
          el('product-draft-status').textContent='Mevcut ürün taslağı doğrulandı: '+recovered.product_id;
          productDraftKey='';productDraftAttempt=null;button.hidden=true;
          el('product-draft-form').reset();
          el('product-draft-form').querySelector('button').disabled=false;
        }else if(recovered.status==='review_required'){
          el('product-draft-status').textContent='Ürün kaydı kesinleşmedi; inceleme gerekli. Yeniden ürün göndermeyin.';
        }else throw new Error('Geçersiz uzlaştırma sonucu');
      }else if(result.status==='unverified'){
        el('product-draft-status').textContent='İstek kaydı doğrulanamadı. Otomatik tekrar yapmayın; inceleme gerekli.';
      }else throw new Error('Geçersiz işlem sonucu');
    }catch(e){
      if(request===organizationRequest&&currentOrg===a.organization_id)
        el('product-draft-status').textContent='Kayıt durumu güvenle doğrulanamadı. Yeniden gönderim yapmayın.';
    }finally{button.disabled=false}
  };
  el('product-draft-form').onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden||!currentOrg)return;
    const request=organizationRequest,org=currentOrg,form=event.currentTarget;
    const button=form.querySelector('button');button.disabled=true;
    const seller_id=form.elements.namedItem('seller_id').value;
    const title=String(form.elements.namedItem('title').value||'').trim();
    // Preserve this exact key for the entire uncertain operation. Neither a
    // timeout nor a 5xx response may silently create a second native product.
    if(!productDraftKey)productDraftKey='dapd_'+crypto.randomUUID().replaceAll('-','');
    productDraftAttempt={organization_id:org,seller_id,title,request_id:productDraftKey};
    try{
      const result=await api('product-drafts',{method:'POST',body:JSON.stringify({
        request_id:productDraftKey,organization_id:org,seller_id,title
      })});
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(result.status!=='created'||!/^prod_[A-Za-z0-9_-]+$/.test(result.product_id))
        throw new Error('Ürün sonucu doğrulanamadı');
      productDraftKey='';productDraftAttempt=null;el('product-draft-check').hidden=true;
      form.reset();button.disabled=false;
      el('product-draft-status').textContent='Ürün taslağı kaydedildi: '+result.product_id;
      void productDraftStores(org,request,true);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      el('product-draft-check').hidden=false;
      el('product-draft-status').textContent=e.uncertain||e.httpStatus===409?
        'Sonuç belirsiz. Aynı ürünü tekrar göndermeyin; kayıt denetimi gerekli.':
        'Taslak oluşturma reddedildi: '+e.message;
      // Even after a 403 the request may have been reserved before access was
      // revoked. Keep the form disabled; a later new intent is a new action.
    }
  };
  function clearMemberships(){
    currentMemberships=[];
    el('memberships').replaceChildren();el('memberships').ariaBusy='false';el('memberships-status').textContent='';
    el('memberships-refresh').hidden=true;el('memberships-refresh').disabled=true;
  }
  function membershipError(e){return [401,403,404].includes(e.httpStatus)?'Üyelik listesini görüntüleme izniniz yok.':'Üyelik listesi yüklenemedi. Yeniden deneyin.'}
  async function memberships(org,request){
    if(request!==organizationRequest||currentOrg!==org)return;el('memberships').replaceChildren();
    el('memberships').ariaBusy='true';el('memberships-status').textContent='Üyelikler yükleniyor…';el('memberships-refresh').disabled=true;
    try{const data=await api('memberships?organization='+encodeURIComponent(org));if(request!==organizationRequest||currentOrg!==org)return;
      if(!Array.isArray(data.memberships))throw new Error('Invalid membership response');
      currentMemberships=data.memberships.map(m=>({id:m.id,person_id:m.person_id,role:m.role,status:m.status,protected_owner:m.protected_owner===true?true:m.protected_owner===false?false:null}));
      const canManageOwners=data.memberships.some(m=>m.person_id===currentPersonId&&m.role==='owner'&&m.protected_owner===true&&m.status==='active');
      for(const m of data.memberships){const p=document.createElement('p');p.textContent=m.person_id+' — '+m.role+' — '+m.status;el('memberships').append(p);
        if(m.status==='active'){
          // Old company Admin records remain intact. Only a current,
          // protected Owner may reduce one to an ordinary Member.
          if(canManageOwners && m.protected_owner===false && m.role==='admin'){
            const rb=document.createElement('button');rb.textContent='Eski şirket Admin kaydını Üye yap '+m.id;
            rb.onclick=async()=>{
              if(request!==organizationRequest||currentOrg!==org)return;rb.disabled=true;
              try{await api('memberships',{method:'POST',body:JSON.stringify({organization_id:org,membership_id:m.id,role:'member'})});if(request!==organizationRequest)return;await selectOrg(org);status('Eski Admin kaydı Üye olarak güncellendi')}
              catch(e){if(request!==organizationRequest)return;status(e.message);if(!e.uncertain)rb.disabled=false}
            };
            el('memberships').append(rb);
          }
          if(canManageOwners && !m.protected_owner && m.role!=='owner'){
            const ob=document.createElement('button');ob.textContent='Korumalı Owner yap '+m.id;
            ob.onclick=async()=>{
              if(request!==organizationRequest||currentOrg!==org)return;ob.disabled=true;
              try{await api('memberships',{method:'POST',body:JSON.stringify({action:'protected_owner',organization_id:org,membership_id:m.id,role:'owner'})});if(request!==organizationRequest)return;await selectOrg(org);status('Owner üyeliği güncellendi')}
              catch(e){if(request!==organizationRequest)return;status(e.message);if(!e.uncertain)ob.disabled=false}
            };
            el('memberships').append(ob);
          }
          // Protected Owner removal/reduction is NOT an ordinary member action.
          // It needs the approved notice/appeal workflow; no unsafe button.
          if(m.protected_owner || m.role==='owner'){
            const note=document.createElement('span');
            note.textContent=' Korunan Owner: kaldırma veya rol düşürme için güvenli inceleme süreci gereklidir.';
            el('memberships').append(note);
          }else{
            const b=document.createElement('button');b.textContent='Üyeliği iptal et '+m.id;b.onclick=async()=>{
              if(request!==organizationRequest||currentOrg!==org)return;b.disabled=true;
              try{await api('memberships',{method:'POST',body:JSON.stringify({organization_id:org,membership_id:m.id})});if(request!==organizationRequest)return;await selectOrg(org)}
              catch(e){if(request!==organizationRequest)return;status(e.message);if(!e.uncertain)b.disabled=false}
            };el('memberships').append(b);
          }}
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
  el('org-stores-refresh').onclick=()=>{if(currentOrg)void organizationStores(currentOrg,organizationRequest)};
  async function load(){if(document.hidden){concealPrivateView();return}const epoch=++viewEpoch;clearOrganizationReviews();try{el('smtp-platform').hidden=true;smtpSettings=null;const me=await api('session');csrf=me.csrf_token;currentPersonId=me.person_id;el('person').textContent='Person: '+me.person_id;el('verification-email').textContent=me.email_verification==='verified'?'E-posta: Native doğrulama kaydı mevcut.':me.email_verification==='not_verified'?'E-posta: Doğrulanmış kayıt bulunamadı.':'E-posta: Doğrulama durumu şu anda okunamıyor.';const data=await api('organizations');loadedScope=JSON.stringify(data);el('organizations').replaceChildren();for(const o of data.organizations){const b=document.createElement('button');b.type='button';b.textContent=o.name+' — '+o.role;b.onclick=()=>selectOrg(o.id);el('organizations').append(b)}el('login').hidden=true;el('register-details').hidden=true;el('session-lock').hidden=false;el('session-lock').disabled=false;el('notification-bell').hidden=false;void notifications();el('workspace').hidden=false;void refreshOrganizationDrafts();status('Oturum açık');void refreshPersonMobile();await links();await refreshMfa();await refreshSmtp();void refreshStoreApprovals();void refreshPlatformClosings();void refreshPlatformClosingReviews();void refreshStoreRenameReviews();void refreshOrganizationReviews();
    const inviteToken=invitationToken;
    if(inviteToken){el('invitation-section').hidden=false;el('invitation-card').hidden=false;el('invitation-mismatch-banner').hidden=true;el('invitation-result').textContent='';}
    else{el('invitation-section').hidden=true;}
    const selected=new URLSearchParams(location.search).get('organization');if(selected)await selectOrg(selected)}catch{if(epoch!==viewEpoch)return;clearNotifications();organizationRequest++;csrf='';currentOrg='';currentPersonId='';el('login').hidden=false;el('register-details').hidden=false;el('session-lock').hidden=true;el('workspace').hidden=true;el('mfa-enrollment').hidden=true;el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;mfaState=null;clearMfaCodes();el('mfa-management').hidden=true;el('mfa-person').hidden=true;el('mfa-platform').hidden=true;el('smtp-platform').hidden=true;smtpSettings=null;el('invite-member').hidden=true;clearPersonMobile();clearOrganizationDrafts();clearPendingInvitations();el('invite-result').textContent='';
    const inviteToken=invitationToken;
    if(inviteToken){el('invitation-section').hidden=false;el('invitation-card').hidden=true;el('invitation-mismatch-banner').hidden=false;el('invitation-mismatch-text').textContent='Bu bağlantıyla mevcut oturumda devam edilemiyor. Uygun hesapla giriş yapın veya yeni davet isteyin.';}
    else{el('invitation-section').hidden=true;}
    clearMemberships();clearOrganizationStores();clearStoreApprovals();clearPlatformClosingReviews();clearStoreRenameReviews();for(const id of ['detail','memberships','organizations','actor-result','provision-result','person','verification-email','bindings'])el(id).replaceChildren();status('Giriş gerekli')}}
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
  el('register').onsubmit=async e=>{
    e.preventDefault();
    const form=e.currentTarget,button=form.querySelector('button');
    if(button.disabled || document.hidden)return;
    button.disabled=true;
    const feedback=el('register-status');
    feedback.textContent='Kayıt kontrol ediliyor.';
    let definite=false;
    try{
      const data=Object.fromEntries(new FormData(form));
      const response=await fetch('/personal/register',{
        method:'POST',credentials:'omit',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(data)
      });
      let result=null;
      try{result=await response.json()}catch{}
      if(response.ok&&result?.registered===true){
        definite=true;form.reset();el('register-details').open=false;
        status('Kişi hesabı kaydedildi. Mevcut giriş formundan oturum açın; gerekli MFA kurulumu girişte tamamlanır.');
        feedback.textContent='';
      }else if(response.status===400||response.status===403||response.status===409||response.status===429){
        definite=true;
        feedback.textContent=response.status===429
          ?'Çok fazla deneme yapıldı. Bir süre sonra yeniden deneyin.'
          :response.status===400?'Kayıt bilgileri geçersiz. Cep telefonu ve alanları kontrol edin.'
          :'Kayıt bu hesapla tamamlanamadı. Mevcut hesabınızla giriş yapın veya yetkili hesap bağlantısı yolunu kullanın.';
      }else{
        feedback.textContent='Kayıt sonucu doğrulanamadı. Aynı işlemi yeniden göndermeden önce giriş yaparak mevcut hesabı kontrol edin.';
      }
    }catch{
      feedback.textContent='Bağlantı koptu. Kayıt sonucu belirsiz; otomatik tekrar yapılmadı. Önce giriş yaparak hesabı kontrol edin.';
    }finally{if(definite)button.disabled=false}
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
  el('seller').onsubmit=async e=>{
    e.preventDefault();
    const org=currentOrg,request=organizationRequest;
    const seller=String(new FormData(e.target).get('seller')||'');
    el('actor-result').textContent='';
    if(!org){status('Önce erişiminiz olan kuruluşu seçin.');return;}
    if(!/^sel_[A-Za-z0-9_-]+$/.test(seller)){status('Geçerli mağaza kimliği gerekli.');return;}
    try{
      // Native Member and Store membership do not establish legal Organization authority.
      const query=new URLSearchParams({type:'member',organization:org,seller});
      const result=await api('contexts?'+query.toString());
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(result.organization_id!==org||result.seller?.id!==seller)
        throw new Error('Güncel kuruluş-mağaza bağlamı doğrulanamadı');
      el('actor-result').textContent=JSON.stringify(result,null,2);
      status('Satıcı erişimi doğrulandı');
    }catch(error){
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      el('actor-result').textContent='';
      status(error.message);
    }
  };
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
  // Conceal before browser history or hidden-page restoration; pending reads
  // belong to a view epoch and cannot repopulate a concealed private workspace.
  function concealPrivateView(){
    clearNotifications();
    viewEpoch++;organizationRequest++;timelineRequest++;currentOrg='';linkIntent='';csrf='';loadedScope='';mfaState=null;smtpSettings=null;clearMfaCodes();timelineCursor=null;timelineOrg='';
    clearPlatformStorePolicy();
    clearPersonMobile();clearOrganizationDrafts();el('workspace').hidden=true;el('session-lock').hidden=true;el('invitation-section').hidden=true;el('mfa-enrollment').hidden=true;el('challenge').hidden=true;el('audit-timeline-section').hidden=true;clearMemberships();clearOrganizationStores();clearStoreApprovals();clearPlatformClosings();clearPlatformClosingReviews();clearStoreRenameReviews();clearPendingInvitations();clearOrganizationReviews();
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

  // A platform closing initiator is NOT an independent reviewer. This
  // workspace is populated only after an explicit store.closing.review grant.
  let platformReviewRead=0,platformReviewPage=0,platformReviewBusy=false;
  function clearPlatformClosingReviews(){
    platformReviewRead++;platformReviewPage=0;platformReviewBusy=false;
    el('platform-closing-review-panel').hidden=true;
    el('platform-closing-review-status').textContent='';
    el('platform-closing-review-list').replaceChildren();
    el('platform-closing-review-more').hidden=true;
  }
  async function refreshPlatformClosingReviews(){
    if(document.hidden||el('workspace').hidden)return;
    const seq=++platformReviewRead,epoch=viewEpoch,page=platformReviewPage;
    const panel=el('platform-closing-review-panel');
    const statusEl=el('platform-closing-review-status');
    try{
      const data=await api('platform/store-closing-reviews?page='+page);
      if(seq!==platformReviewRead||epoch!==viewEpoch||document.hidden)return;
      if(data.page!==page||typeof data.has_more!=='boolean'||
         !Array.isArray(data.candidates)||data.candidates.length>30||
         data.candidates.some(x=>
           !/^sel_[A-Za-z0-9_-]+$/.test(x?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(x?.organization_id)||
           !/^(dapa_|dasfr_)[a-f0-9]{32}$/.test(x?.source_request_id)||
           !['first_appeal','second_review'].includes(x?.stage)||
           typeof x.organization_name!=='string'||
           typeof x.store_name!=='string'||
           typeof x.request_reason!=='string'))
        throw Error('Geçersiz inceleme kuyruğu');
      const root=el('platform-closing-review-list');
      root.replaceChildren();
      for(const item of data.candidates){
        const form=document.createElement('form');
        form.dataset.sellerId=item.seller_id;
        const heading=document.createElement('h3');
        heading.textContent=item.organization_name+' / '+item.store_name;
        const information=document.createElement('p');
        information.textContent=(item.stage==='first_appeal'?
          'İlk itiraz':'Bağımsız üst inceleme')+
          ' — Başvuru gerekçesi: '+item.request_reason;
        const label=document.createElement('label');
        label.textContent='Gerekçeli inceleme kararı ';
        const selector=document.createElement('select');
        selector.name='decision';selector.required=true;
        for(const [value,title] of [
          ['accepted','İtirazı kabul et'],['rejected','İtirazı reddet']
        ]){
          const option=document.createElement('option');
          option.value=value;option.textContent=title;selector.append(option);
        }
        label.append(selector);
        const reasonLabel=document.createElement('label');
        reasonLabel.textContent='Karar gerekçesi ';
        const reason=document.createElement('textarea');
        reason.name='reason';reason.required=true;
        reason.minLength=10;reason.maxLength=500;reason.rows=3;
        reasonLabel.append(reason);
        const submit=document.createElement('button');
        submit.type='submit';submit.textContent='Gerekçeli kararı kaydet';
        const feedback=document.createElement('p');
        feedback.setAttribute('role','status');
        feedback.setAttribute('aria-live','polite');
        form.append(heading,information,label,reasonLabel,submit,feedback);
        form.onsubmit=async event=>{
          event.preventDefault();
          if(platformReviewBusy||document.hidden||submit.disabled)return;
          const text=reason.value.trim();
          if(text.length<10||text.length>500)return;
          submit.disabled=true;platformReviewBusy=true;
          feedback.textContent='Karar güvenli biçimde kaydediliyor…';
          try{
            const chosen=selector.value;
            const result=await api('platform/store-closing-reviews',{
              method:'POST',body:JSON.stringify({
                organization_id:item.organization_id,seller_id:item.seller_id,
                source_request_id:item.source_request_id,
                request_id:'dasdr_'+crypto.randomUUID().replaceAll('-',''),
                decision:chosen,reason:text
              })
            });
            if(epoch!==viewEpoch||seq!==platformReviewRead||document.hidden)return;
            if(result.status!=='decided'||result.decision!==chosen||
               result.organization_id!==item.organization_id||
               result.seller_id!==item.seller_id||
               result.store_reopened!==false||
               result.permanent_finalization_enabled!==false){
              const err=Error('Karar sonucu doğrulanamadı');
              err.uncertain=true;throw err;
            }
            feedback.textContent='Gerekçeli karar kaydedildi. Satışlar otomatik açılmaz.';
            await refreshPlatformClosingReviews();
          }catch(err){
            if(epoch!==viewEpoch||seq!==platformReviewRead)return;
            feedback.textContent=err.uncertain||err.httpStatus>=500?
              'Karar sonucu belirsiz; tekrar göndermeyin. Önce kayıtları yenileyin.':
              'Karar kaydedilemedi. Yetki ve güncel dosyayı yeniden doğrulayın.';
          }finally{platformReviewBusy=false}
        };
        root.append(form);
      }
      panel.hidden=false;
      statusEl.textContent=data.candidates.length?
        'Bekleyen başvurular. Her karar ayrı, güçlü yetki ve gerekçe gerektirir.':
        'Bu sayfada açık inceleme bulunmuyor.';
      el('platform-closing-review-more').hidden=!data.has_more;
    }catch(error){
      if(seq!==platformReviewRead||epoch!==viewEpoch)return;
      if([401,403].includes(error.httpStatus)){
        clearPlatformClosingReviews();return;
      }
      panel.hidden=false;
      el('platform-closing-review-list').replaceChildren();
      el('platform-closing-review-more').hidden=true;
      statusEl.textContent='İnceleme kaydı doğrulanamadı. Karar verilemez.';
    }
  }
  el('platform-closing-review-refresh').onclick=()=>{
    platformReviewPage=0;void refreshPlatformClosingReviews();
  };
  el('platform-closing-review-more').onclick=()=>{
    if(platformReviewPage<1000){platformReviewPage++;void refreshPlatformClosingReviews()}
  };

  // B22 platform 10+20 first stage: separate platform closing grant and
  // protected Owner appeal. No browser-computed deadline or implicit authority.
  let platformClosingPage=0,platformClosingRead=0;
  let platformClosingRows=[],platformClosingBusy=false,platformClosingUncertain=false;
  let platformClosingFocusSeller='';
  function clearPlatformClosings(){
    platformClosingRead++;platformClosingPage=0;platformClosingRows=[];
    platformClosingFocusSeller='';
    platformClosingBusy=false;platformClosingUncertain=false;
    el('platform-closing-panel').hidden=true;
    el('platform-closing-status').textContent='';
    el('platform-closing-mail-status').textContent='';
    const form=el('platform-closing-form');
    if(typeof form?.reset==='function')form.reset();
    const choice=typeof form?.elements?.namedItem==='function'?
      form.elements.namedItem('seller_id'):null;
    if(typeof choice?.replaceChildren==='function')choice.replaceChildren();
  }
  const closingMailLabel={
    pending:'Henüz gönderilmedi',inflight:'Gönderim sürüyor',
    accepted:'Gönderildi (SMTP kabulü, teslim belirsiz)',
    failed:'Gönderim başarısız',
    unverified_identity:'Doğrulanmış e-posta kimliği yok',
    uncertain:'Gönderim sonucu belirsiz',
    delivered:'Alıcı teslimi doğrulandı'
  };
  async function refreshPlatformClosingMail(chosen,epoch=viewEpoch){
    const target=el('platform-closing-mail-status');
    if(!chosen){target.textContent='';return}
    target.textContent='Owner e-posta bildirimleri kontrol ediliyor…';
    try{
      const data=await api('platform/store-closing-email-readiness?'+
        new URLSearchParams({organization_id:chosen.organization_id,
          seller_id:chosen.seller_id}).toString());
      if(epoch!==viewEpoch||document.hidden||
         chosen.seller_id!==el('platform-closing-form').elements.namedItem('seller_id').value)return;
      if(!Array.isArray(data.email_statuses)||
         !Number.isSafeInteger(data.protected_owner_count)||
         data.email_statuses.length!==data.protected_owner_count||
         typeof data.deadline_started!=='boolean'||
         data.email_statuses.some(x=>!/^Owner [0-9]+$/.test(x?.label)||
           !Number.isSafeInteger(x?.attempts)||x.attempts<0||x.attempts>4||
           typeof x?.smtp_accepted!=='boolean'||
           !Object.hasOwn(closingMailLabel,x?.status))||
         data.permanent_finalization_enabled!==false||
         !data.terminal_preflight||
         !['appeal_window_elapsed','appeal_review_pending',
           'appeal_accepted','notification_exception_review_required',
           'financial_legal_clearance_verified',
           'permanent_finalization_enabled'].every(
             k=>typeof data.terminal_preflight[k]==='boolean')||
         data.terminal_preflight.financial_legal_clearance_verified!==false||
         data.terminal_preflight.permanent_finalization_enabled!==false)
        throw Error('Bildirim kanıtı doğrulanamadı');
      const rows=data.email_statuses.map(row=>row.label+': '+
        closingMailLabel[row.status]+
        ', SMTP: '+(row.smtp_accepted?'gönderildi':'gönderim kabulü doğrulanmadı')+
        ', deneme '+row.attempts+'/4'+
        (row.link_visited_at?', güvenli bağlantı açıldı':'')+
        (row.account_viewed_at?', hesapta görüntülendi':''));
      target.textContent='Korunan Owner '+data.protected_owner_count+
        ', doğrulanmış e-posta kimliği '+data.verified_email_identity_count+
        '. '+rows.join('; ')+'. '+
        (data.deadline_started?
          'İtiraz saati otomatik başladı ('+
          (data.deadline_basis==='admin_alert'?'üç tekrar sonrası yönetici uyarısı':
            'alıcı teslim kanıtı')+').':
          '10+20 günlük itiraz saati henüz başlamadı.')+
        (data.admin_alert_at?' Yöneticiye teslimat sorunu bildirildi.':'')+
        ' Gönderildi, iletildi ve okundu birbirinden ayrı kanıtlardır.';
      const safety=data.terminal_preflight;
      const blockers=[];
      if(!safety.appeal_window_elapsed)
        blockers.push('30 günlük itiraz süresi henüz tamamlanmadı veya başlamadı');
      if(safety.appeal_review_pending)
        blockers.push('sonuçlanmamış itiraz veya üst inceleme mevcut');
      if(safety.appeal_accepted)
        blockers.push('itiraz kabul edildi; ayrıca kapatma uygulanamaz');
      if(safety.notification_exception_review_required)
        blockers.push('bildirim başarısızlığı istisnası ayrıca incelenmeli');
      blockers.push('mali ve hukuki yükümlülüklerin temizlendiği doğrulanmadı');
      target.textContent+=' Kesin kapatma engelleri: '+blockers.join('; ')+
        '. Mağaza kimliği, geçmiş işlemler ve ad hakkı korunur; geri dönüşsüz kapatma kapalıdır.';
    }catch(e){
      if(epoch===viewEpoch)target.textContent=
        e.httpStatus===403?'Bu mağaza için henüz kapatma kaydı yok.':
        'E-posta durumları doğrulanamadı; sonuç iddia edilmiyor.';
    }
  }

  async function refreshPlatformClosings(){
    if(document.hidden||el('workspace').hidden)return;
    const seq=++platformClosingRead,epoch=viewEpoch;
    const panel=el('platform-closing-panel'),msg=el('platform-closing-status');
    msg.textContent='Yetkili mağazalar doğrulanıyor…';
    try{
      const data=await api('platform/store-closings?page='+platformClosingPage);
      if(seq!==platformClosingRead||epoch!==viewEpoch||document.hidden)return;
      if(data.page!==platformClosingPage||!Array.isArray(data.candidates)||
         data.candidates.length>30||typeof data.has_more!=='boolean'||
         data.candidates.some(x=>!/^sel_[A-Za-z0-9_-]+$/.test(x?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(x?.organization_id)||
           typeof x.store_name!=='string'||typeof x.organization_name!=='string'))
        throw Error('Geçersiz kaynak listesi');
      platformClosingRows=data.candidates;
      const choice=el('platform-closing-form').elements.namedItem('seller_id');
      choice.replaceChildren();
      for(const row of data.candidates){
        const option=document.createElement('option');
        option.value=row.seller_id;
        option.textContent=row.organization_name+' / '+row.store_name+
          ' ('+row.store_status+')';
        choice.append(option);
      }
      el('platform-closing-more').hidden=!data.has_more;
      panel.hidden=false;
      const selected=data.candidates.find(x=>x.seller_id===platformClosingFocusSeller)
        ??data.candidates[0];
      if(selected)choice.value=selected.seller_id;
      if(selected)void refreshPlatformClosingMail(selected,epoch);
      msg.textContent=data.candidates.length?
        'Gerekçe ile yeni satışları derhal durdurabilirsiniz. Kesin kapanış etkin değildir.':
        'Bu sayfada işleme uygun mağaza bulunamadı.';
    }catch(e){
      if(seq!==platformClosingRead||epoch!==viewEpoch)return;
      if([401,403].includes(e.httpStatus)){clearPlatformClosings();return}
      panel.hidden=false;platformClosingRows=[];
      el('platform-closing-form').elements.namedItem('seller_id').replaceChildren();
      msg.textContent='Mağaza listesi doğrulanamadı. Yeni karar oluşturulamaz.';
    }
  }
  const closingControls=el('platform-closing-form')?.elements;
  const closingSelect=typeof closingControls?.namedItem==='function'?
    closingControls.namedItem('seller_id'):null;
  if(closingSelect)closingSelect.onchange=()=>{
    const row=platformClosingRows.find(x=>x.seller_id===closingSelect.value);
    void refreshPlatformClosingMail(row);
  };
  el('platform-closing-refresh').onclick=()=>{
    platformClosingUncertain=false;platformClosingPage=0;void refreshPlatformClosings()
  };
  el('platform-closing-more').onclick=()=>{
    if(platformClosingPage<999){platformClosingPage++;void refreshPlatformClosings()}
  };
  el('platform-closing-form').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,epoch=viewEpoch;
    if(platformClosingBusy||platformClosingUncertain||document.hidden||
       el('platform-closing-panel').hidden)return;
    const chosen=platformClosingRows.find(x=>
      x.seller_id===form.elements.namedItem('seller_id').value);
    const reason=form.elements.namedItem('reason').value.trim();
    if(!chosen||reason.length<10||reason.length>500||
       form.elements.namedItem('confirmed').checked!==true)return;
    const button=form.querySelector('button[type=submit]');
    button.disabled=true;platformClosingBusy=true;
    const msg=el('platform-closing-status');
    msg.textContent='Gerekçeli karar güvenli biçimde kaydediliyor…';
    try{
      const result=await api('platform/store-closings',{method:'POST',
        body:JSON.stringify({organization_id:chosen.organization_id,
          seller_id:chosen.seller_id,request_id:'dascp_'+crypto.randomUUID().replaceAll('-',''),
          reason})});
      if(epoch!==viewEpoch||document.hidden)return;
      if(result.organization_id!==chosen.organization_id||
         result.seller_id!==chosen.seller_id||
         result.status!=='notification_unverified'||
         result.mandatory_email_verified!==false||result.deadline_started!==false){
        const e=Error('Kayıt sonucu doğrulanamadı');e.uncertain=true;throw e;
      }
      msg.textContent='Yeni satışlar derhal durdu. Owner bildirimleri kaydedildi. E-posta denemeleri ve otomatik itiraz saati ayrı izlenir.';
      platformClosingFocusSeller=chosen.seller_id;
      await refreshPlatformClosingMail(chosen,epoch);
      form.reset();void refreshPlatformClosings();
    }catch(e){
      if(epoch!==viewEpoch)return;
      platformClosingUncertain=!!e.uncertain||e.httpStatus>=500;
      msg.textContent=platformClosingUncertain?
        'Sonuç belirsiz. Tekrar göndermeyin; yetkili kayıtları kontrol edin.':
        'Yetki veya mağaza kararı değişti; işlem reddedildi.';
    }finally{
      platformClosingBusy=false;
      button.disabled=platformClosingUncertain;
    }
  };

  let platformOwnerRead=0,platformOwnerPending=false,platformOwnerUncertain=false;
  let platformFinalReviewPending=false,platformFinalReviewUncertain=false;
  let platformOwnerState=null;
  function clearPlatformClosingOwner(){
    platformOwnerRead++;platformOwnerState=null;
    platformOwnerPending=false;platformOwnerUncertain=false;
    platformFinalReviewPending=false;platformFinalReviewUncertain=false;
    el('store-platform-appeal-panel').hidden=true;
    el('store-platform-final-review-form').hidden=true;
    el('store-platform-final-review-form').reset();
    el('store-platform-final-review-form').querySelector('button').disabled=true;
    el('store-platform-appeal-reason').textContent='';
    el('store-platform-appeal-status').textContent='';
    el('store-platform-review-decision').textContent='';
    el('store-platform-review-decision').hidden=true;
    const form=el('store-platform-appeal-form');
    if(typeof form?.reset==='function')form.reset();
    const button=typeof form?.querySelector==='function'?form.querySelector('button'):null;
    if(button)button.disabled=true;
  }
  async function refreshPlatformClosingOwner(org,request){
    const choice=el('store-owner-pause-form')?.elements.namedItem('seller_id');
    const seller=choice?.value;
    if(!org||!seller||!selectedStoreOwner||document.hidden||
       el('store-owner-pause-panel').hidden)return;
    const seq=++platformOwnerRead,epoch=viewEpoch;
    platformOwnerState=null;
    const panel=el('store-platform-appeal-panel'),msg=el('store-platform-appeal-status');
    panel.hidden=true;
    try{
      const data=await api('store-platform-closing?'+new URLSearchParams({
        organization_id:org,seller_id:seller}).toString());
      if(seq!==platformOwnerRead||epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||seller!==choice.value||document.hidden)return;
      if(data.organization_id!==org||data.seller_id!==seller||
         !['none','notification_unverified','appealed'].includes(data.state)||
         !Number.isSafeInteger(data.version)||
         typeof data.deadline_started!=='boolean'||
         typeof data.first_appeal_open!=='boolean'||
         typeof data.final_review_open!=='boolean'||
         typeof data.final_review_requested!=='boolean'||
         ![null,'accepted','rejected'].includes(data.review_decision)||
         (data.review_decision!==null&&
           (typeof data.review_decision_reason!=='string'||
            typeof data.review_decided_at!=='string'))||
         data.permanent_finalization_enabled!==false||
         typeof data.mandatory_email_verified!=='boolean')
         throw Error('Geçersiz karar');
      platformOwnerState=data;
      panel.hidden=data.state==='none';
      if(data.state==='none')return;
      el('store-platform-appeal-reason').textContent=
        'Platform karar gerekçesi: '+data.reason;
      const decisionText=el('store-platform-review-decision');
      decisionText.hidden=data.review_decision===null;
      decisionText.textContent=data.review_decision===null?'':(
        (data.review_decision==='accepted'?'İtiraz kabul edildi. ':
          'İtiraz reddedildi. ')+
        'Kararın gerekçesi: '+data.review_decision_reason+
        '. Satışlar ayrıca yetkili karar verilmeden yeniden açılmaz.');
      msg.textContent=(data.review_decision!==null?
        'İtiraz hakkında gerekçeli karar verildi. Satışlar kapalı.':
        data.final_review_requested?
        'Bağımsız üst inceleme başvurusu kaydedildi; karar bekleniyor. Satışlar kapalı.':
        data.state==='appealed'?
        'İtiraz kaydedildi; sonuç bekleniyor. Satışlar kapalı.':
        data.final_review_open?
        'İlk 10 gün sona erdi. Kalan 20 günlük üst inceleme için başvurabilirsiniz. Satışlar kapalı.':
        'Satışlar yönetici kararıyla derhal durduruldu. İlk itiraz yalnız süresi içinde gönderilebilir.')+
        (data.deadline_started?
          ' 10+20 günlük itiraz saati başladı; ilk aşama sonu: '+
          new Date(data.first_appeal_until).toLocaleString('tr-TR')+
          ', ikinci aşama sonu: '+
          new Date(data.final_review_until).toLocaleString('tr-TR')+'.':
          ' Bildirim ve itiraz saati henüz doğrulanıyor.');
      el('store-platform-appeal-form').querySelector('button').disabled=
        !data.first_appeal_open||platformOwnerUncertain;
      const finalForm=el('store-platform-final-review-form');
      finalForm.hidden=!data.final_review_open;
      finalForm.querySelector('button').disabled=
        !data.final_review_open||platformFinalReviewUncertain;
    }catch(e){
      if(seq!==platformOwnerRead||epoch!==viewEpoch)return;
      clearPlatformClosingOwner();
      if(![401,403].includes(e.httpStatus)){
        panel.hidden=false;
        msg.textContent='Kapatma kararı güvenle doğrulanamadı; itiraz gönderilemez.';
      }
    }
  }
  el('store-platform-appeal-refresh').onclick=()=>{
    platformOwnerUncertain=false;platformFinalReviewUncertain=false;
    if(currentOrg)void refreshPlatformClosingOwner(currentOrg,organizationRequest);
  };
  el('store-platform-appeal-form').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,org=currentOrg,request=organizationRequest,epoch=viewEpoch;
    const seller=el('store-owner-pause-form').elements.namedItem('seller_id')?.value;
    const reason=form.elements.namedItem('reason').value.trim();
    if(!org||!seller||!selectedStoreOwner||document.hidden||platformOwnerPending||
       platformOwnerUncertain||platformOwnerState?.state!=='notification_unverified'||
       platformOwnerState.first_appeal_open!==true||
       platformOwnerState.seller_id!==seller||reason.length<10||reason.length>500)return;
    const button=form.querySelector('button');
    button.disabled=true;platformOwnerPending=true;
    const msg=el('store-platform-appeal-status');
    msg.textContent='İtiraz kaydediliyor…';
    try{
      const result=await api('store-platform-closing',{method:'POST',body:JSON.stringify({
        organization_id:org,seller_id:seller,
        request_id:'dapa_'+crypto.randomUUID().replaceAll('-',''),
        expected_version:1,reason})});
      if(epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||document.hidden)return;
      if(result.status!=='appealed'||result.version!==2||
         result.organization_id!==org||result.seller_id!==seller||
         typeof result.deadline_started!=='boolean'){
        const e=Error('İtiraz sonucu doğrulanamadı');e.uncertain=true;throw e;
      }
      platformOwnerUncertain=false;
      form.reset();
      await refreshPlatformClosingOwner(org,request);
    }catch(e){
      if(epoch!==viewEpoch||request!==organizationRequest)return;
      platformOwnerUncertain=!!e.uncertain||e.httpStatus>=500;
      msg.textContent=platformOwnerUncertain?
        'Sonuç belirsiz; tekrar göndermeyin. Önce özel karar durumunu yenileyin.':
        'İtiraz reddedildi. Yetki ve güncel kararı yeniden doğrulayın.';
    }finally{
      platformOwnerPending=false;
      button.disabled=platformOwnerUncertain||platformOwnerState?.first_appeal_open!==true;
    }
  };

  el('store-platform-final-review-form').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,org=currentOrg,request=organizationRequest,epoch=viewEpoch;
    const seller=el('store-owner-pause-form').elements.namedItem('seller_id')?.value;
    const reason=form.elements.namedItem('reason').value.trim();
    if(!org||!seller||!selectedStoreOwner||document.hidden||
       platformFinalReviewPending||platformFinalReviewUncertain||
       platformOwnerState?.final_review_open!==true||
       platformOwnerState.seller_id!==seller||
       reason.length<10||reason.length>500)return;
    const button=form.querySelector('button'),msg=el('store-platform-appeal-status');
    button.disabled=true;platformFinalReviewPending=true;
    msg.textContent='Üst inceleme başvurusu kaydediliyor…';
    try{
      const result=await api('store-platform-closing-final-review',{
        method:'POST',body:JSON.stringify({
          organization_id:org,seller_id:seller,
          request_id:'dasfr_'+crypto.randomUUID().replaceAll('-',''),
          expected_version:1,reason})});
      if(epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||document.hidden)return;
      if(result.status!=='review_requested'||
         result.final_review_requested!==true||
         result.permanent_finalization_enabled!==false||
         result.organization_id!==org||result.seller_id!==seller){
        const e=Error('Üst inceleme sonucu doğrulanamadı');
        e.uncertain=true;throw e;
      }
      platformFinalReviewUncertain=false;form.reset();
      await refreshPlatformClosingOwner(org,request);
    }catch(e){
      if(epoch!==viewEpoch||request!==organizationRequest)return;
      platformFinalReviewUncertain=!!e.uncertain||e.httpStatus>=500;
      msg.textContent=platformFinalReviewUncertain?
        'Üst inceleme sonucu belirsiz; yeniden göndermeyin, önce güncel durumu yenileyin.':
        'Üst inceleme başvurusu reddedildi. Yetki ve süreyi yeniden doğrulayın.';
    }finally{
      platformFinalReviewPending=false;
      button.disabled=platformFinalReviewUncertain||
        platformOwnerState?.final_review_open!==true;
    }
  };

  window.addEventListener('pagehide',concealPrivateView);
  window.addEventListener('pageshow',event=>{if(event.persisted){concealPrivateView();load()}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)concealPrivateView();else load()});
  window.addEventListener('focus',()=>{if(el('workspace').hidden&&loadedScope==='')load();else observeAccess()});
  window.addEventListener('popstate',()=>{concealPrivateView();load()});
  setInterval(observeAccess,5000);
  el('audit-timeline-refresh').onclick=async()=>{timelineCursor=null;await loadTimeline(currentOrg);};
  el('audit-timeline-next').onclick=async()=>{if(timelineCursor&&currentOrg)await loadTimeline(currentOrg,timelineCursor,true);};
  el('select-org').onsubmit=async e=>{e.preventDefault();await selectOrg(new FormData(e.target).get('organization'))};
  el('session-lock').onclick=lockCurrentSession;el('logout').onclick=()=>logout(false);el('logout-all').onclick=()=>logout(true);let platformStorePolicy=null,platformStoreRequest=0;
  const policyForm=el('platform-store-policy-form');
  const policyStatus=el('platform-store-policy-status');
  const policyApply=el('platform-store-policy-apply');
  const policyInput=el('platform-store-policy-organization');
  function clearPlatformStorePolicy(){
    platformStoreRequest++;platformStorePolicy=null;
    policyApply.disabled=true;policyApply.textContent='Henüz durum doğrulanmadı';
    if(typeof policyForm.reset==='function')policyForm.reset();
    el('platform-store-policy-reason').value='';policyStatus.textContent='';
    el('platform-store-policy-panel').hidden=true;
  }
  policyInput.oninput=()=>{
    platformStorePolicy=null;platformStoreRequest++;
    policyApply.disabled=true;policyApply.textContent='Önce durumu doğrula';
    policyStatus.textContent='';
  };
  async function readPlatformStorePolicy(){
    const org=String(policyInput.value||'').trim(),epoch=viewEpoch;
    const seq=++platformStoreRequest;
    platformStorePolicy=null;policyApply.disabled=true;
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(org)){
      policyStatus.textContent='Geçerli şirket kimliği girin.';return;
    }
    policyStatus.textContent='Başvuru hakkı doğrulanıyor…';
    try{
      const result=await api('platform/store-application-policy?organization_id='+
        encodeURIComponent(org));
      if(seq!==platformStoreRequest||epoch!==viewEpoch||document.hidden||
         el('workspace').hidden||policyInput.value.trim()!==org)return;
      if(result.organization_id!==org||typeof result.name!=='string'||
         typeof result.store_application_enabled!=='boolean'||
         !Number.isSafeInteger(result.store_application_version)||
         result.store_application_version<0||result.store_application_version>=2147483647)
        throw Error('Durum doğrulanamadı');
      platformStorePolicy={organization_id:org,enabled:result.store_application_enabled,
        version:result.store_application_version};
      policyApply.disabled=false;
      policyApply.textContent=result.store_application_enabled?
        'Yeni mağaza başvuru hakkını kapat':'Yeni mağaza başvuru hakkını aç';
      policyStatus.textContent=result.name+' — yeni mağaza başvuru hakkı '+
        (result.store_application_enabled?'açık.':'kapalı; bekleyen başvurular korunuyor.');
    }catch{
      if(seq!==platformStoreRequest||epoch!==viewEpoch)return;
      policyStatus.textContent='Şirket ve platform yetkisi doğrulanamadı. İşlem yapılamaz.';
    }
  }
  el('platform-store-policy-read').onclick=()=>void readPlatformStorePolicy();
  policyForm.onsubmit=async event=>{
    event.preventDefault();
    const org=String(policyInput.value||'').trim(),current=platformStorePolicy,
      reason=String(el('platform-store-policy-reason').value||'').trim(),
      epoch=viewEpoch,seq=++platformStoreRequest;
    policyApply.disabled=true;platformStorePolicy=null;
    if(!current||current.organization_id!==org||reason.length<10||reason.length>500){
      policyStatus.textContent='Önce şirket durumunu doğrulayın ve gerekçe girin.';
      return;
    }
    policyStatus.textContent='Politika değişikliği gönderiliyor…';
    try{
      const result=await api('platform/store-application-policy',{
        method:'POST',body:JSON.stringify({
          organization_id:org,expected_enabled:current.enabled,
          expected_version:current.version,enabled:!current.enabled,reason
        })
      });
      if(seq!==platformStoreRequest||epoch!==viewEpoch||
         document.hidden||el('workspace').hidden||policyInput.value.trim()!==org)return;
      if(result.status!=='updated'||result.organization_id!==org||
         result.store_application_enabled!==!current.enabled||
         result.store_application_version!==current.version+1){
        const uncertain=new Error('İşlem yanıtı doğrulanamadı');
        uncertain.uncertain=true;
        throw uncertain;
      }
      policyStatus.textContent='Şirketin yeni mağaza başvuru hakkı '+
        (result.store_application_enabled?'açıldı.':'kapatıldı; bekleyenler korunuyor.')+
        ' Son durum yeniden doğrulansın.';
      el('platform-store-policy-reason').value='';
    }catch(error){
      if(seq!==platformStoreRequest||epoch!==viewEpoch)return;
      policyStatus.textContent=error.uncertain?
        'Sonuç belirsiz. İşlemi tekrar göndermeyin; şirketin durumunu yeniden sorgulayın.':
        error.httpStatus===409?
        'Şirketin durumu başka işlemle değişti. Tekrar göndermeden önce yeniden sorgulayın.':
        'Başvuru hakkı değiştirilemedi. Yetkinizi ve şirket kaydını kontrol edin.';
    }
  };
  el('platform-store-policy-open').onclick=()=>{
    clearPlatformStorePolicy();
    el('platform-store-policy-panel').hidden=false;
    policyStatus.textContent='Şirket kimliğini yazıp mevcut durumu doğrulayın. Yalnız yetkili platform görevlileri işlem yapabilir.';
  };
  el('staff').onclick=async()=>{
    try{
      const allowed=await api('platform');
      if(allowed.allowed!==true)throw Error('Platform görevi doğrulanamadı');
      status('Kuruluş oluşturma için platform görevi doğrulandı');
    }catch{
      status('Kuruluş oluşturma platform yetkisi bulunamadı veya güçlü doğrulama gerekli.');
    }
  };load();
  </script></html>`)
}
