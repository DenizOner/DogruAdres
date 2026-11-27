// Kişisel konsol istemci betiği: audit.ts
export const scriptAudit: string = `  async function loadTimeline(org, cursor = null, append = false) {
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
      const data = await api('/organization/audit-timeline?' + q.toString());
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
`;

