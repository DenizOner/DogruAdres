// Kişisel konsol HTML parçası: invitations.ts
export const htmlInvitations: string = `  <section id="invitation-section" class="da-invitation-section" hidden>
    <h2>Kuruluş Üyelik Daveti</h2>
    <div id="invitation-mismatch-banner" class="da-mismatch-banner" hidden role="alert">
      <p id="invitation-mismatch-text">Bu bağlantıyla mevcut oturumda devam edilemiyor. Uygun hesapla giriş yapın veya yeni davet isteyin.</p>
    </div>
    <div id="invitation-card" class="da-invitation-card" hidden>
      <p class="da-card-title">DoğruAdres Kuruluş Üyeliği</p>
      <p class="da-card-desc">Size iletilen davet bağlantısı üzerinden kuruluş üyeliğinizi onaylayabilirsiniz. Üyelik işlemi yalnızca davetin tanımlandığı doğrulanmış hesapla tamamlanabilir.</p>
      <button id="accept-invitation-btn" class="da-invitation-btn" type="button">Daveti Onayla ve Katıl</button>
      <p id="invitation-result" class="da-card-result" role="status" aria-live="polite"></p>
    </div>
  </section>
`;
