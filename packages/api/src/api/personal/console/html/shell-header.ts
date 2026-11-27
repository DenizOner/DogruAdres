// Kişisel konsol HTML parçası: shell-header.ts
export const htmlShellHeader: string = `  <a class="da-skip-link" href="#main-content">Ana içeriğe geç</a>
  <header id="personal-header"><h1>DoğruAdres</h1><div><button id="notification-bell" type="button" aria-expanded="false" aria-controls="notification-panel" hidden><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg> Bildirimler <span id="notification-count"></span></button> <button id="session-lock" type="button" hidden>Oturumu kilitle</button></div></header>
  <section id="notification-panel" aria-labelledby="notification-heading" hidden>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem"><h2 id="notification-heading" tabindex="-1">Bildirimler</h2><button id="notification-settings-link" type="button" aria-label="Bildirim ayarları" title="Bildirim ayarları">⚙ Bildirim ayarları</button></div><p>Kişisel hesabınıza ait oturum bildirimleri</p>
    <p id="notification-status" role="status" aria-live="polite"></p>
    <ul id="notification-list"></ul>
    <button id="notification-refresh" type="button">Bildirimleri yenile</button>
    <button id="notification-next" type="button" hidden>Sonraki bildirimler</button>
    <button id="notification-close" type="button">Bildirimleri kapat</button>
  </section><main id="main-content" tabindex="-1"><p>Kişisel çalışma alanı</p><p id="status" role="status" aria-live="polite"></p>
`;
