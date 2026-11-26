// Kişisel konsol HTML parçası: stores.ts
export const htmlStores: string = `  <section id="store-approval-panel" hidden>
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
  <section id="store-rename-review-panel" hidden>
    <h2>Platform mağaza ad/bağlantı değişiklik başvuruları</h2>
    <p>Yalnız mağaza onay görevi olan platform görevlisi inceleyebilir. Ret mağazayı değiştirmez. Onay, aynı mağazanın adını ve bağlantısını birlikte değiştirir; eski bağlantı yeni adrese yönlendirilmez. Belirsiz sonuçta aynı işlemi yeniden göndermeyin.</p>
    <p id="store-rename-review-status" role="status" aria-live="polite"></p>
    <div id="store-rename-review-list"></div>
    <button id="store-rename-review-refresh" type="button">İsim değişikliği başvurularını yenile</button>
    <button id="store-rename-review-older" type="button" hidden>Daha eski başvuruları göster</button>
    <button id="store-rename-review-newer" type="button" hidden>Yeni başvurulara dön</button>
  </section>
  <section id="store-application-panel" hidden>
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

  <section id="store-draft-grants-panel" hidden>
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
  <section id="org-stores-panel" hidden aria-labelledby="org-stores-title">
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
`;
