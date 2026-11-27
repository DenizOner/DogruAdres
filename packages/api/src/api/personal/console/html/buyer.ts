// Kişisel konsol HTML parçası: buyer.ts
export const htmlBuyer: string = `  <section id="buyer-context-panel" hidden aria-labelledby="buyer-context-title" style="grid-column:1/-1">
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
`;
