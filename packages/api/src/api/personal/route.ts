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
  <h2>Kuruluşlarım</h2><div id="organizations"></div><form id="select-org"><label>Kuruluş kimliği<input name="organization" required></label><button>Kuruluş erişimini kontrol et</button></form><pre id="detail"></pre>

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
    const write=groupWrite||draftWrite||followWrite||policyWrite||storeApplicationWrite||grantWrite||platformStoreWrite||renameWrite;
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
         data.suspended.some(row=>!/^daapp_[a-f0-9]{32}$/.test(row?.application_id)||
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
      if(!keepOutcome)message.textContent=(data.pending.length||data.suspended.length)?
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
        row.textContent=entry.organization_name+' — '+entry.name+' — '+entry.seller_id+' ';
        button.type='button';button.textContent='Askı nedeni giderildi, mağazayı yeniden aç';
        button.onclick=async()=>{
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
        summary.textContent=entry.organization_name+' — '+entry.old_name+
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
          if(!confirm('Bu onay mağazanın adını ve URL bağlantısını birlikte değiştirir. Eski bağlantı yeni adrese yönlendirilmez. Onaylıyor musunuz?'))return;
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
            message.textContent='Mağazanın yeni adı ve bağlantısı etkinleşti. Eski bağlantıya yönlendirme yok.';
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
      applicationRole=role;
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
  function clearStoreRename(preserveSelectedOwner=false){
    // A transient Store-list failure is not an Organization role change.
    // Only Organization switch/logout/concealment may discard that role.
    renameRead++;if(!preserveSelectedOwner)selectedStoreOwner=false;
    renamePending=false;renameUncertain=false;
    el('store-rename-panel').hidden=true;
    el('store-rename-status').textContent='';
    el('store-rename-history').replaceChildren();
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
      renameForm.querySelector('button[type=submit]').disabled=true;
      if(currentOrg)void refreshStoreRename(currentOrg,organizationRequest);
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
  async function organizationStores(org,request){
    if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
    const seq=++storeRequest;
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
        select.replaceChildren();
        for(const store of data.stores){
          const opt=document.createElement('option');opt.value=store.id;
          opt.textContent=store.name;select.append(opt);
        }
        el('store-rename-panel').hidden=!selectedStoreOwner||data.stores.length===0;
        if(!el('store-rename-panel').hidden)void refreshStoreRename(org,request);
      }
    }catch(e){
      if(request!==organizationRequest||seq!==storeRequest||currentOrg!==org)return;
      // Preserve the selected Owner only for a transient list failure.
      // A definite access denial must not retain even client-side Owner UI state.
      target.replaceChildren();clearStoreRename(![401,403,404].includes(e.httpStatus));
      if(e.httpStatus===401){concealPrivateView();el('login').hidden=false;return}
      message.textContent=[403,404].includes(e.httpStatus)?'Bu kuruluşun mağazalarına erişim izniniz yok.':'Mağazalar doğrulanamadı. Yeniden deneyin.';
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

  let buyerContextRequest=0,buyerCatalogRequest=0,buyerCatalogPage=0;
  function clearBuyerContext(){
    buyerContextRequest++;buyerCatalogRequest++;buyerCatalogPage=0;
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
  async function load(){if(document.hidden){concealPrivateView();return}const epoch=++viewEpoch;clearOrganizationReviews();try{el('smtp-platform').hidden=true;smtpSettings=null;const me=await api('session');csrf=me.csrf_token;currentPersonId=me.person_id;el('person').textContent='Person: '+me.person_id;el('verification-email').textContent=me.email_verification==='verified'?'E-posta: Native doğrulama kaydı mevcut.':me.email_verification==='not_verified'?'E-posta: Doğrulanmış kayıt bulunamadı.':'E-posta: Doğrulama durumu şu anda okunamıyor.';const data=await api('organizations');loadedScope=JSON.stringify(data);el('organizations').replaceChildren();for(const o of data.organizations){const b=document.createElement('button');b.type='button';b.textContent=o.name+' — '+o.role;b.onclick=()=>selectOrg(o.id);el('organizations').append(b)}el('login').hidden=true;el('register-details').hidden=true;el('session-lock').hidden=false;el('session-lock').disabled=false;el('notification-bell').hidden=false;void notifications();el('workspace').hidden=false;void refreshOrganizationDrafts();status('Oturum açık');void refreshPersonMobile();await links();await refreshMfa();await refreshSmtp();void refreshStoreApprovals();void refreshStoreRenameReviews();void refreshOrganizationReviews();
    const inviteToken=invitationToken;
    if(inviteToken){el('invitation-section').hidden=false;el('invitation-card').hidden=false;el('invitation-mismatch-banner').hidden=true;el('invitation-result').textContent='';}
    else{el('invitation-section').hidden=true;}
    const selected=new URLSearchParams(location.search).get('organization');if(selected)await selectOrg(selected)}catch{if(epoch!==viewEpoch)return;clearNotifications();organizationRequest++;csrf='';currentOrg='';currentPersonId='';el('login').hidden=false;el('register-details').hidden=false;el('session-lock').hidden=true;el('workspace').hidden=true;el('mfa-enrollment').hidden=true;el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;mfaState=null;clearMfaCodes();el('mfa-management').hidden=true;el('mfa-person').hidden=true;el('mfa-platform').hidden=true;el('smtp-platform').hidden=true;smtpSettings=null;el('invite-member').hidden=true;clearPersonMobile();clearOrganizationDrafts();clearPendingInvitations();el('invite-result').textContent='';
    const inviteToken=invitationToken;
    if(inviteToken){el('invitation-section').hidden=false;el('invitation-card').hidden=true;el('invitation-mismatch-banner').hidden=false;el('invitation-mismatch-text').textContent='Bu bağlantıyla mevcut oturumda devam edilemiyor. Uygun hesapla giriş yapın veya yeni davet isteyin.';}
    else{el('invitation-section').hidden=true;}
    clearMemberships();clearOrganizationStores();clearStoreApprovals();clearStoreRenameReviews();for(const id of ['detail','memberships','organizations','actor-result','provision-result','person','verification-email','bindings'])el(id).replaceChildren();status('Giriş gerekli')}}
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
    clearPersonMobile();clearOrganizationDrafts();el('workspace').hidden=true;el('session-lock').hidden=true;el('invitation-section').hidden=true;el('mfa-enrollment').hidden=true;el('challenge').hidden=true;el('audit-timeline-section').hidden=true;clearMemberships();clearOrganizationStores();clearStoreApprovals();clearStoreRenameReviews();clearPendingInvitations();clearOrganizationReviews();
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
