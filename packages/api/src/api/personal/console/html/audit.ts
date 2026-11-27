// Kişisel konsol HTML parçası: audit.ts
export const htmlAudit: string = `  <section id="audit-timeline-section" hidden style="margin-top: 16px; padding: 14px; border: 1px solid #c1c6d4; border-radius: 8px; background: #f8f9fa;">
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
`;
