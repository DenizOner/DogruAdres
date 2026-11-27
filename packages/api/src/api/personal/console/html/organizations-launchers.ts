// Kişisel konsol HTML parçası: organizations-launchers.ts
export const htmlOrganizationsLaunchers: string = `  <section id="organization-draft-panel">
    <h2 id="organization-draft-title" tabindex="-1">Yeni Şirket Oluştur — özel başvuru taslağı</h2>
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
    <div id="organization-document-section" hidden>
      <h3>Vergi levhası (başvuru belgesi)</h3>
      <p>PDF, JPEG veya PNG biçiminde, en fazla 10 MiB. İlk yüklemede virüs taraması ve güvenli önizleme hazırlanır; kontrol başarısızsa belge kabul edilmez. Dosya özel alanda saklanır; başvuru gönderilmeden işletme yetkisi verilmez.</p>
      <div id="organization-document-dropzone" role="group" aria-label="Vergi levhası dosyası bırakma alanı">
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
  <section id="platform-launcher-panel" hidden aria-labelledby="platform-launcher-title">
    <h2 id="platform-launcher-title">Platform çalışma alanı başlatıcısı</h2>
    <p>Yalnız yetkili olduğunuz platform işlevlerini sıralayın ve katlayın. Bu tercih yeni yetki vermez.</p>
    <p id="platform-launcher-status" role="status" aria-live="polite"></p>
    <ol id="platform-launcher-list"></ol>
    <button id="platform-launcher-reset" type="button">Standart düzeni geri yükle</button>
  </section>
  <section id="organization-review-panel" hidden>
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
  <h2 id="organizations-title" tabindex="-1">Kuruluşlarım</h2><div id="organizations"></div><form id="select-org"><label>Kuruluş kimliği<input name="organization" required></label><button>Kuruluş erişimini kontrol et</button></form><pre id="detail"></pre>
  <section id="company-launcher-panel" hidden aria-labelledby="company-launcher-title">
    <h2 id="company-launcher-title">Şirket çalışma alanı başlatıcısı</h2>
    <p>Yalnız mevcut, seçili kuruluşta yetkili olduğunuz işlevleri sıralayın ve katlayın. Bu tercih yeni yetki vermez.</p>
    <p id="company-launcher-status" role="status" aria-live="polite"></p>
    <ol id="company-launcher-list"></ol>
    <button id="company-launcher-reset" type="button">Standart düzeni geri yükle</button>
  </section>

  <section id="platform-closing-panel" hidden aria-labelledby="platform-closing-title">
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
  <section id="platform-closing-review-panel" hidden
    aria-labelledby="platform-closing-review-title">
    <h2 id="platform-closing-review-title">Bağımsız mağaza kapatma incelemesi</h2>
    <p>Yalnız açık platform inceleme görevi ve güncel güçlü girişle gerekçeli karar verilebilir.
    Kapatmayı başlatan görevli aynı dosyayı karara bağlayamaz. Karar yeni satışları kendiliğinden açmaz.</p>
    <p id="platform-closing-review-status" role="status" aria-live="polite"></p>
    <div id="platform-closing-review-list"></div>
    <button type="button" id="platform-closing-review-refresh">Dosyaları yenile</button>
    <button type="button" id="platform-closing-review-more" hidden>Diğer dosyalar</button>
  </section>
`;
