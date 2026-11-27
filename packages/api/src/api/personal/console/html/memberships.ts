// Kişisel konsol HTML parçası: memberships.ts
export const htmlMemberships: string = `  <form id="invite-member" hidden style="margin-top: 16px; padding: 14px; border: 1px solid #c1c6d4; border-radius: 8px; background: #f2f3fb;">
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
`;
