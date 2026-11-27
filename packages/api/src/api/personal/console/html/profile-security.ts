// Kişisel konsol HTML parçası: profile-security.ts
export const htmlProfileSecurity: string = `  <section id="workspace" hidden><p id="person"></p>
  <nav id="personal-entry" aria-label="Kişisel çalışma alanı başlangıç">
    <h2>Kişisel çalışma alanım</h2>
    <p>Şirket üyeliğiniz olmasa da şirket başvurusuna başlayabilirsiniz. Mevcut şirketlere erişim her işlemde sunucuda yeniden doğrulanır.</p>
    <p><a href="#organizations-title">Şirket çalışma alanlarına erişim</a></p>
    <p><a href="#organization-draft-title">Yeni Şirket Oluştur</a></p>
    <p>İş İlanları Panosu — henüz kullanıma açık değil.</p>
  </nav>
  <form id="person-mobile-form" hidden>
    <h2>Kişisel cep telefonu</h2>
    <label>Cep telefonu (başında + olabilir; rakamlardan oluşur)
      <input name="mobile_phone" type="tel" autocomplete="tel" inputmode="tel"
        pattern="[+]?[0-9]{6,20}" minlength="6" maxlength="21" required></label>
    <p>Bu numara kişisel hesabınıza aittir; henüz telefon doğrulaması yapılmıyor ve şirket sabit hattı değildir.</p>
    <button type="submit">Cep telefonumu kaydet</button>
    <p id="person-mobile-status" role="status" aria-live="polite"></p>
  </form>
  <section id="notification-preferences-section" aria-labelledby="notif-pref-heading" hidden tabindex="-1">
    <h2 id="notif-pref-heading">Bildirim Ayarları</h2>
    <p id="notif-pref-summary">Kritik güvenlik ve Owner/kapatma bildirimleri kilitlidir ve kapatılamaz. Mobil bildirim kanalı desteklenmediği için kapalıdır.</p>
    <details id="notif-pref-advanced">
      <summary>Gelişmiş Ayarlar (Olay ve Kanal Tablosu)</summary>
      <div style="overflow-x:auto;margin-top:.5rem">
        <table id="notif-pref-table">
          <thead><tr><th>Olay Kategorisi</th><th>Platform içi</th><th>E-posta</th><th>Mobil</th></tr></thead>
          <tbody id="notif-pref-rows"></tbody>
        </table>
      </div>
    </details>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">
      <button id="notif-pref-save" type="button">Tercihleri kaydet</button>
      <button id="notif-pref-reset" type="button">Varsayılanlara döndür</button>
    </div>
    <p id="notif-pref-status" role="status" aria-live="polite"></p>
  </section>
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
`;
