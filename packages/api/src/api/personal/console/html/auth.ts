// Kişisel konsol HTML parçası: auth.ts
export const htmlAuth: string = `  <form id="login"><label>E-posta<input name="email" type="email" autocomplete="username" required></label><label>Parola<input name="password" type="password" autocomplete="current-password" required></label><button>Giriş yap</button><p class="da-help-text"><a href="mailto:destek@dogruadres.com.tr">Yardım veya erişim sorunu mu var?</a></p></form>
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
  <form id="challenge" hidden aria-labelledby="challenge-heading"><h2 id="challenge-heading">İki faktörlü doğrulama</h2><label>İkinci faktör yöntemi<select name="method">
      <option value="totp">Kimlik doğrulama uygulaması</option>
      <option value="recovery_code">Tek kullanımlık kurtarma kodu</option>
    </select></label><label>Doğrulama veya kurtarma kodu<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="128" required aria-describedby="challenge-code-hint"></label><p id="challenge-code-hint" style="font-size:.85rem;color:var(--muted);margin:0">TOTP uygulamasındaki 6 haneli kodu veya kurtarma kodunuzu girin.</p>
    <button>İkinci faktörü doğrula</button></form>
  <section id="mfa-enrollment" hidden aria-labelledby="mfa-enrollment-heading">
    <h2 id="mfa-enrollment-heading">MFA ilk kurulumu</h2>
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
`;
