// Kişisel konsol istemci betiği: platform.ts
export const scriptPlatform: string = `  async function refreshSmtp(){
    try{
      const data=await api('/platform/smtp');
      if(data&&data.can_manage&&data.settings){
        smtpSettings=data.settings;
        el('smtp-platform').hidden=false;
        el('smtp-status').textContent='Ayar sürümü: '+smtpSettings.version+' ('+(smtpSettings.enabled?'Aktif':'Devre Dışı')+'). '+(smtpSettings.has_password?'AES-256 Parola Kayıtlı.':'Parola Tanımlanmamış.');
        const form=el('smtp-form');
        form.elements.enabled.checked=!!smtpSettings.enabled;
        form.elements.host.value=smtpSettings.host||'';
        form.elements.port.value=smtpSettings.port||465;
        form.elements.security.value=smtpSettings.security||'ssl';
        form.elements.username.value=smtpSettings.username||'';
        form.elements.password.value='';
        form.elements.from_email.value=smtpSettings.from_email||'';
        form.elements.from_name.value=smtpSettings.from_name||'';
      }else{
        smtpSettings=null;el('smtp-platform').hidden=true;
      }
    }catch{
      smtpSettings=null;el('smtp-platform').hidden=true;
    }
  }
  el('smtp-form').onsubmit=async e=>{
    e.preventDefault();if(!smtpSettings)return;
    const b=e.target.querySelector('button');b.disabled=true;
    try{
      const fd=new FormData(e.target);
      const payload={
        action:'save',
        enabled:fd.get('enabled')==='true',
        host:fd.get('host'),
        port:Number(fd.get('port')),
        security:fd.get('security'),
        username:fd.get('username')||null,
        from_email:fd.get('from_email'),
        from_name:fd.get('from_name')||null,
        expected_version:smtpSettings.version,
      };
      const pw=fd.get('password');
      if(pw)payload.password=pw;
      const res=await api('/platform/smtp',{method:'POST',body:JSON.stringify(payload)});
      if(res.settings){
        smtpSettings=res.settings;
        await refreshSmtp();
        status('SMTP ayarları kaydedildi (Sürüm: '+res.settings.version+')');
      }
    }catch(err){status(err.message)}finally{b.disabled=false}
  };
  el('smtp-test-form').onsubmit=async e=>{
    e.preventDefault();
    const b=e.target.querySelector('button');b.disabled=true;
    el('smtp-test-result').textContent='Test e-postası gönderiliyor...';
    try{
      const fd=new FormData(e.target);
      const recipient=fd.get('target_recipient');
      const sf=el('smtp-form');
      const sfd=new FormData(sf);
      const candidate={
        host:sfd.get('host'),
        port:Number(sfd.get('port')),
        security:sfd.get('security'),
        username:sfd.get('username')||null,
        from_email:sfd.get('from_email'),
        from_name:sfd.get('from_name')||null,
      };
      const pw=sfd.get('password');
      if(pw)candidate.password=pw;
      const res=await api('/platform/smtp',{
        method:'POST',
        body:JSON.stringify({
          action:'test',
          target_recipient:recipient,
          candidate_settings:candidate,
        }),
      });
      if(res.ok){
        el('smtp-test-result').textContent='SMTP sunucusu e-postayı gönderim için kabul etti. Teslimatı alıcının gelen kutusundan kontrol edin.';
        status('Test e-postası başarıyla kabul edildi');
      }else{
        el('smtp-test-result').textContent='Test başarısız: '+(res.message||'Hata');
        status('Test e-postası gönderilemedi');
      }
    }catch(err){
      el('smtp-test-result').textContent='Test hatası: '+err.message;
      status('Test hatası: '+err.message);
    }finally{
      b.disabled=false;
    }
  };

  el('invite-member').onsubmit=async e=>{
    e.preventDefault();
    const orgId = currentOrg || new URLSearchParams(location.search).get('organization');
    if(!orgId)return;
    const b=e.target.querySelector('button');b.disabled=true;
    el('invite-result').textContent='Davet oluşturuluyor ve e-posta iletiliyor...';
    try{
      const inviteData=new FormData(e.target);
      const email=inviteData.get('email');
      const role=inviteData.get('role');
      const res=await api('/organization/invitations',{method:'POST',body:JSON.stringify({action:'create',organization_id:orgId,email,role})});
      if(res.delivery?.status==='sent'){
        el('invite-result').textContent='Davet oluşturuldu. E-posta gönderim için kabul edildi.';
        status('Davet e-postası gönderim için kabul edildi');
      }else if(res.delivery?.status==='failed'){
        el('invite-result').textContent='Davet oluşturuldu ancak e-posta gönderilemedi. Lütfen platform yöneticisine bildirin.';
        status('Davet oluşturuldu (e-posta teslimi başarısız)');
      }else{
        el('invite-result').textContent='Davet oluşturuldu.';
        status('Kuruluş üyelik daveti oluşturuldu');
      }
      e.target.reset();
      await pendingInvitations(orgId,organizationRequest);
    }catch(err){
      el('invite-result').textContent='Davet oluşturulamadı: '+err.message;
      status(err.message);
    }finally{b.disabled=false}
  };
  el('accept-invitation-btn').onclick=async()=>{
    const token=invitationToken;
    if(!token)return;
    const btn=el('accept-invitation-btn');btn.disabled=true;
    el('invitation-result').textContent='Davet kabul ediliyor...';
    try{
      await api('/organization/invitations',{method:'POST',body:JSON.stringify({action:'accept',token})});
      // Discard the consumed token from page memory before refreshing.
      invitationToken=null;
      await load();
      status('Kuruluş üyeliğiniz başarıyla aktifleştirildi.');
    }catch(err){
      el('invitation-card').hidden=true;
      el('invitation-mismatch-banner').hidden=false;
      el('invitation-mismatch-text').textContent='Bu bağlantıyla mevcut oturumda devam edilemiyor. Uygun hesapla giriş yapın veya yeni davet isteyin.';
      status('Bu bağlantıyla mevcut oturumda devam edilemiyor.');
    }finally{btn.disabled=false}
  };
  // Conceal before browser history or hidden-page restoration; pending reads
  // belong to a view epoch and cannot repopulate a concealed private workspace.
  function concealPrivateView(preserveUnopenedClosingLink=false){
    clearNotifications();clearCompanyLauncher();clearPlatformLauncher();
    viewEpoch++;organizationRequest++;timelineRequest++;currentOrg='';linkIntent='';csrf='';loadedScope='';mfaState=null;smtpSettings=null;clearMfaCodes();timelineCursor=null;timelineOrg='';
    clearPlatformStorePolicy();
    clearPrivateClosingEmailLink(preserveUnopenedClosingLink);
    currentPersonId='';
    clearPersonMobile();clearNotificationPreferences();clearOrganizationDrafts();el('workspace').hidden=true;el('session-lock').hidden=true;el('invitation-section').hidden=true;el('mfa-enrollment').hidden=true;el('challenge').hidden=true;el('audit-timeline-section').hidden=true;clearMemberships();clearOrganizationStores();clearStoreApprovals();clearPlatformClosings();clearPlatformClosingReviews();clearStoreRenameReviews();clearPendingInvitations();clearOrganizationReviews();
    for(const id of ['detail','memberships','organizations','actor-result','provision-result','person','verification-email','bindings','invite-result','invitation-result','mfa-info','smtp-status','smtp-test-result','mfa-enroll-secret','audit-timeline-entries','audit-timeline-status'])el(id).replaceChildren();
    for(const form of el('workspace').querySelectorAll('form'))form.reset();
    el('mfa-seed').value='';el('invite-member').hidden=true;status('Erişim yeniden doğrulanıyor');
  }
  async function observeAccess(){
    if(observing||document.hidden||el('workspace').hidden)return;
    observing=true;const epoch=viewEpoch;
    try{const data=await api('organizations',{headers:{'x-da-observe':'1'}});
      if(epoch!==viewEpoch)return;
      if(JSON.stringify(data)!==loadedScope){concealPrivateView();status('Erişim değişti. Güncel çalışma alanı için sayfayı yenileyin.')}
    }catch{if(epoch===viewEpoch){concealPrivateView();el('login').hidden=false;status('Erişim yeniden doğrulanmalı')}}
    finally{observing=false}
  }

  // A platform closing initiator is NOT an independent reviewer. This
  // workspace is populated only after an explicit store.closing.review grant.
  let platformReviewRead=0,platformReviewPage=0,platformReviewBusy=false;
  function clearPlatformClosingReviews(){
    platformReviewRead++;platformReviewPage=0;platformReviewBusy=false;
    el('platform-closing-review-panel').hidden=true;
    el('platform-closing-review-status').textContent='';
    el('platform-closing-review-list').replaceChildren();
    el('platform-closing-review-more').hidden=true;
  }
  async function refreshPlatformClosingReviews(){
    if(document.hidden||el('workspace').hidden)return;
    const seq=++platformReviewRead,epoch=viewEpoch,page=platformReviewPage;
    const panel=el('platform-closing-review-panel');
    const statusEl=el('platform-closing-review-status');
    try{
      const data=await api('/platform/store-closing-reviews?page='+page);
      if(seq!==platformReviewRead||epoch!==viewEpoch||document.hidden)return;
      if(data.page!==page||typeof data.has_more!=='boolean'||
         !Array.isArray(data.candidates)||data.candidates.length>30||
         data.candidates.some(x=>
           !/^sel_[A-Za-z0-9_-]+$/.test(x?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(x?.organization_id)||
           !/^(dapa_|dasfr_)[a-f0-9]{32}$/.test(x?.source_request_id)||
           !['first_appeal','second_review'].includes(x?.stage)||
           typeof x.organization_name!=='string'||
           typeof x.store_name!=='string'||
           typeof x.request_reason!=='string'))
        throw Error('Geçersiz inceleme kuyruğu');
      const root=el('platform-closing-review-list');
      root.replaceChildren();
      for(const item of data.candidates){
        const form=document.createElement('form');
        form.dataset.sellerId=item.seller_id;
        const heading=document.createElement('h3');
        heading.textContent=item.organization_name+' / '+item.store_name;
        const information=document.createElement('p');
        information.textContent=(item.stage==='first_appeal'?
          'İlk itiraz':'Bağımsız üst inceleme')+
          ' — Başvuru gerekçesi: '+item.request_reason;
        const label=document.createElement('label');
        label.textContent='Gerekçeli inceleme kararı ';
        const selector=document.createElement('select');
        selector.name='decision';selector.required=true;
        for(const [value,title] of [
          ['accepted','İtirazı kabul et'],['rejected','İtirazı reddet']
        ]){
          const option=document.createElement('option');
          option.value=value;option.textContent=title;selector.append(option);
        }
        label.append(selector);
        const reasonLabel=document.createElement('label');
        reasonLabel.textContent='Karar gerekçesi ';
        const reason=document.createElement('textarea');
        reason.name='reason';reason.required=true;
        reason.minLength=10;reason.maxLength=500;reason.rows=3;
        reasonLabel.append(reason);
        const submit=document.createElement('button');
        submit.type='submit';submit.textContent='Gerekçeli kararı kaydet';
        const feedback=document.createElement('p');
        feedback.setAttribute('role','status');
        feedback.setAttribute('aria-live','polite');
        form.append(heading,information,label,reasonLabel,submit,feedback);
        form.onsubmit=async event=>{
          event.preventDefault();
          if(platformReviewBusy||document.hidden||submit.disabled)return;
          const text=reason.value.trim();
          if(text.length<10||text.length>500)return;
          submit.disabled=true;platformReviewBusy=true;
          feedback.textContent='Karar güvenli biçimde kaydediliyor…';
          try{
            const chosen=selector.value;
            const result=await api('/platform/store-closing-reviews',{
              method:'POST',body:JSON.stringify({
                organization_id:item.organization_id,seller_id:item.seller_id,
                source_request_id:item.source_request_id,
                request_id:'dasdr_'+crypto.randomUUID().replaceAll('-',''),
                decision:chosen,reason:text
              })
            });
            if(epoch!==viewEpoch||seq!==platformReviewRead||document.hidden)return;
            if(result.status!=='decided'||result.decision!==chosen||
               result.organization_id!==item.organization_id||
               result.seller_id!==item.seller_id||
               result.store_reopened!==false||
               result.permanent_finalization_enabled!==false){
              const err=Error('Karar sonucu doğrulanamadı');
              err.uncertain=true;throw err;
            }
            feedback.textContent='Gerekçeli karar kaydedildi. Satışlar otomatik açılmaz.';
            await refreshPlatformClosingReviews();
          }catch(err){
            if(epoch!==viewEpoch||seq!==platformReviewRead)return;
            feedback.textContent=err.uncertain||err.httpStatus>=500?
              'Karar sonucu belirsiz; tekrar göndermeyin. Önce kayıtları yenileyin.':
              'Karar kaydedilemedi. Yetki ve güncel dosyayı yeniden doğrulayın.';
          }finally{platformReviewBusy=false}
        };
        root.append(form);
      }
      panel.hidden=false;
      statusEl.textContent=data.candidates.length?
        'Bekleyen başvurular. Her karar ayrı, güçlü yetki ve gerekçe gerektirir.':
        'Bu sayfada açık inceleme bulunmuyor.';
      el('platform-closing-review-more').hidden=!data.has_more;
    }catch(error){
      if(seq!==platformReviewRead||epoch!==viewEpoch)return;
      if([401,403].includes(error.httpStatus)){
        clearPlatformClosingReviews();return;
      }
      panel.hidden=false;
      el('platform-closing-review-list').replaceChildren();
      el('platform-closing-review-more').hidden=true;
      statusEl.textContent='İnceleme kaydı doğrulanamadı. Karar verilemez.';
    }
  }
  el('platform-closing-review-refresh').onclick=()=>{
    platformReviewPage=0;void refreshPlatformClosingReviews();
  };
  el('platform-closing-review-more').onclick=()=>{
    if(platformReviewPage<1000){platformReviewPage++;void refreshPlatformClosingReviews()}
  };

  // B22 platform 10+20 first stage: separate platform closing grant and
  // protected Owner appeal. No browser-computed deadline or implicit authority.
  let platformClosingPage=0,platformClosingRead=0,platformClosingMailRead=0;
  let platformClosingRows=[],platformClosingBusy=false,platformClosingUncertain=false;
  let platformClosingFocusSeller='';
  function clearPlatformClosings(){
    platformClosingMailRead++;
    platformClosingRead++;platformClosingPage=0;platformClosingRows=[];
    platformClosingFocusSeller='';
    platformClosingBusy=false;platformClosingUncertain=false;
    el('platform-closing-panel').hidden=true;
    el('platform-closing-status').textContent='';
    el('platform-closing-mail-status').textContent='';
    const form=el('platform-closing-form');
    if(typeof form?.reset==='function')form.reset();
    const choice=typeof form?.elements?.namedItem==='function'?
      form.elements.namedItem('seller_id'):null;
    if(typeof choice?.replaceChildren==='function')choice.replaceChildren();
  }
  const closingMailLabel={
    pending:'Henüz gönderilmedi',inflight:'Gönderim sürüyor',
    accepted:'Gönderildi (SMTP kabulü, teslim belirsiz)',
    failed:'Gönderim başarısız',
    unverified_identity:'Doğrulanmış e-posta kimliği yok',
    uncertain:'Gönderim sonucu belirsiz',
    delivered:'Alıcı teslimi doğrulandı'
  };
  async function refreshPlatformClosingMail(chosen,epoch=viewEpoch){
    // A response from a previous Store/refresh must never replace the
    // latest Staff-visible closing safety and email delivery status.
    const mailRead=++platformClosingMailRead;
    const target=el('platform-closing-mail-status');
    if(!chosen){target.textContent='';return}
    target.textContent='Owner e-posta bildirimleri kontrol ediliyor…';
    try{
      const data=await api('/platform/store-closing-email-readiness?'+
        new URLSearchParams({organization_id:chosen.organization_id,
          seller_id:chosen.seller_id}).toString());
      if(mailRead!==platformClosingMailRead||epoch!==viewEpoch||document.hidden||
         chosen.seller_id!==el('platform-closing-form').elements.namedItem('seller_id').value)return;
      if(!Array.isArray(data.email_statuses)||
         !Number.isSafeInteger(data.protected_owner_count)||
         data.email_statuses.length!==data.protected_owner_count||
         typeof data.deadline_started!=='boolean'||
         data.email_statuses.some(x=>!/^Owner [0-9]+$/.test(x?.label)||
           !Number.isSafeInteger(x?.attempts)||x.attempts<0||x.attempts>4||
           typeof x?.smtp_accepted!=='boolean'||
           !Object.hasOwn(closingMailLabel,x?.status))||
         data.permanent_finalization_enabled!==false||
         typeof data.native_order_history_observed!=='boolean'||
         !data.terminal_preflight||
         !['appeal_window_elapsed','appeal_review_pending',
           'appeal_accepted','notification_exception_review_required',
           'financial_legal_clearance_verified',
           'permanent_finalization_enabled'].every(
             k=>typeof data.terminal_preflight[k]==='boolean')||
         data.terminal_preflight.financial_legal_clearance_verified!==false||
         data.terminal_preflight.permanent_finalization_enabled!==false)
        throw Error('Bildirim kanıtı doğrulanamadı');
      const rows=data.email_statuses.map(row=>row.label+': '+
        closingMailLabel[row.status]+
        ', SMTP: '+(row.smtp_accepted?'gönderildi':'gönderim kabulü doğrulanmadı')+
        ', deneme '+row.attempts+'/4'+
        (row.link_visited_at?', güvenli bağlantı açıldı':'')+
        (row.account_viewed_at?', hesapta görüntülendi':''));
      target.textContent='Korunan Owner '+data.protected_owner_count+
        ', doğrulanmış e-posta kimliği '+data.verified_email_identity_count+
        '. '+rows.join('; ')+'. '+
        (data.deadline_started?
          'İtiraz saati otomatik başladı ('+
          (data.deadline_basis==='admin_alert'?'üç tekrar sonrası yönetici uyarısı':
            'alıcı teslim kanıtı')+').':
          '10+20 günlük itiraz saati henüz başlamadı.')+
        (data.admin_alert_at?' Yöneticiye teslimat sorunu bildirildi.':'')+
        ' Gönderildi, iletildi ve okundu birbirinden ayrı kanıtlardır.';
      const safety=data.terminal_preflight;
      const blockers=[];
      if(!safety.appeal_window_elapsed)
        blockers.push('30 günlük itiraz süresi henüz tamamlanmadı veya başlamadı');
      if(safety.appeal_review_pending)
        blockers.push('sonuçlanmamış itiraz veya üst inceleme mevcut');
      if(safety.appeal_accepted)
        blockers.push('itiraz kabul edildi; ayrıca kapatma uygulanamaz');
      if(safety.notification_exception_review_required)
        blockers.push('bildirim başarısızlığı istisnası ayrıca incelenmeli');
      if(data.native_order_history_observed)
        blockers.push('bu mağazaya bağlı gerçek geçmiş sipariş kaydı saptandı; ödeme, iade ve uyuşmazlıklar ayrıca doğrulanmalı');
      else
        blockers.push('bu sorguda geçmiş sipariş kaydı saptanmadı; bu sonuç borç veya yükümlülük bulunmadığını kanıtlamaz');
      blockers.push('mali ve hukuki yükümlülüklerin temizlendiği doğrulanmadı');
      target.textContent+=' Kesin kapatma engelleri: '+blockers.join('; ')+
        '. Mağaza kimliği, geçmiş işlemler ve ad hakkı korunur; geri dönüşsüz kapatma kapalıdır.';
    }catch(e){
      if(mailRead===platformClosingMailRead&&epoch===viewEpoch&&
         !document.hidden&&
         chosen.seller_id===el('platform-closing-form').elements.namedItem('seller_id').value)
        target.textContent=
          e.httpStatus===403?'Bu mağaza için henüz kapatma kaydı yok.':
          'E-posta durumları doğrulanamadı; sonuç iddia edilmiyor.';
    }
  }

  async function refreshPlatformClosings(){
    if(document.hidden||el('workspace').hidden)return;
    const seq=++platformClosingRead,epoch=viewEpoch;
    const panel=el('platform-closing-panel'),msg=el('platform-closing-status');
    msg.textContent='Yetkili mağazalar doğrulanıyor…';
    try{
      const data=await api('/platform/store-closings?page='+platformClosingPage);
      if(seq!==platformClosingRead||epoch!==viewEpoch||document.hidden)return;
      if(data.page!==platformClosingPage||!Array.isArray(data.candidates)||
         data.candidates.length>30||typeof data.has_more!=='boolean'||
         data.candidates.some(x=>!/^sel_[A-Za-z0-9_-]+$/.test(x?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(x?.organization_id)||
           typeof x.store_name!=='string'||typeof x.organization_name!=='string'))
        throw Error('Geçersiz kaynak listesi');
      platformClosingRows=data.candidates;
      const choice=el('platform-closing-form').elements.namedItem('seller_id');
      choice.replaceChildren();
      for(const row of data.candidates){
        const option=document.createElement('option');
        option.value=row.seller_id;
        option.textContent=row.organization_name+' / '+row.store_name+
          ' ('+row.store_status+')';
        choice.append(option);
      }
      el('platform-closing-more').hidden=!data.has_more;
      panel.hidden=false;
      const selected=data.candidates.find(x=>x.seller_id===platformClosingFocusSeller)
        ??data.candidates[0];
      if(selected)choice.value=selected.seller_id;
      if(selected)void refreshPlatformClosingMail(selected,epoch);
      msg.textContent=data.candidates.length?
        'Gerekçe ile yeni satışları derhal durdurabilirsiniz. Kesin kapanış etkin değildir.':
        'Bu sayfada işleme uygun mağaza bulunamadı.';
    }catch(e){
      if(seq!==platformClosingRead||epoch!==viewEpoch)return;
      if([401,403].includes(e.httpStatus)){clearPlatformClosings();return}
      panel.hidden=false;platformClosingRows=[];
      el('platform-closing-form').elements.namedItem('seller_id').replaceChildren();
      msg.textContent='Mağaza listesi doğrulanamadı. Yeni karar oluşturulamaz.';
    }
  }
  const closingControls=el('platform-closing-form')?.elements;
  const closingSelect=typeof closingControls?.namedItem==='function'?
    closingControls.namedItem('seller_id'):null;
  if(closingSelect)closingSelect.onchange=()=>{
    const row=platformClosingRows.find(x=>x.seller_id===closingSelect.value);
    void refreshPlatformClosingMail(row);
  };
  el('platform-closing-refresh').onclick=()=>{
    platformClosingUncertain=false;platformClosingPage=0;void refreshPlatformClosings()
  };
  el('platform-closing-more').onclick=()=>{
    if(platformClosingPage<999){platformClosingPage++;void refreshPlatformClosings()}
  };
  el('platform-closing-form').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,epoch=viewEpoch;
    if(platformClosingBusy||platformClosingUncertain||document.hidden||
       el('platform-closing-panel').hidden)return;
    const chosen=platformClosingRows.find(x=>
      x.seller_id===form.elements.namedItem('seller_id').value);
    const reason=form.elements.namedItem('reason').value.trim();
    if(!chosen||reason.length<10||reason.length>500||
       form.elements.namedItem('confirmed').checked!==true)return;
    const button=form.querySelector('button[type=submit]');
    button.disabled=true;platformClosingBusy=true;
    const msg=el('platform-closing-status');
    msg.textContent='Gerekçeli karar güvenli biçimde kaydediliyor…';
    try{
      const result=await api('/platform/store-closings',{method:'POST',
        body:JSON.stringify({organization_id:chosen.organization_id,
          seller_id:chosen.seller_id,request_id:'dascp_'+crypto.randomUUID().replaceAll('-',''),
          reason})});
      if(epoch!==viewEpoch||document.hidden)return;
      if(result.organization_id!==chosen.organization_id||
         result.seller_id!==chosen.seller_id||
         result.status!=='notification_unverified'||
         result.mandatory_email_verified!==false||result.deadline_started!==false){
        const e=Error('Kayıt sonucu doğrulanamadı');e.uncertain=true;throw e;
      }
      msg.textContent='Yeni satışlar derhal durdu. Owner bildirimleri kaydedildi. E-posta denemeleri ve otomatik itiraz saati ayrı izlenir.';
      platformClosingFocusSeller=chosen.seller_id;
      await refreshPlatformClosingMail(chosen,epoch);
      form.reset();void refreshPlatformClosings();
    }catch(e){
      if(epoch!==viewEpoch)return;
      platformClosingUncertain=!!e.uncertain||e.httpStatus>=500;
      msg.textContent=platformClosingUncertain?
        'Sonuç belirsiz. Tekrar göndermeyin; yetkili kayıtları kontrol edin.':
        'Yetki veya mağaza kararı değişti; işlem reddedildi.';
    }finally{
      platformClosingBusy=false;
      button.disabled=platformClosingUncertain;
    }
  };

  let platformOwnerRead=0,platformOwnerPending=false,platformOwnerUncertain=false;
  let platformFinalReviewPending=false,platformFinalReviewUncertain=false;
  let platformOwnerState=null;
  function clearPlatformClosingOwner(){
    platformOwnerRead++;platformOwnerState=null;
    platformOwnerPending=false;platformOwnerUncertain=false;
    platformFinalReviewPending=false;platformFinalReviewUncertain=false;
    el('store-platform-appeal-panel').hidden=true;
    el('store-platform-final-review-form').hidden=true;
    el('store-platform-final-review-form').reset();
    el('store-platform-final-review-form').querySelector('button').disabled=true;
    el('store-platform-appeal-reason').textContent='';
    el('store-platform-appeal-status').textContent='';
    el('store-platform-review-decision').textContent='';
    el('store-platform-review-decision').hidden=true;
    const form=el('store-platform-appeal-form');
    if(typeof form?.reset==='function')form.reset();
    const button=typeof form?.querySelector==='function'?form.querySelector('button'):null;
    if(button)button.disabled=true;
  }
  async function refreshPlatformClosingOwner(org,request){
    const choice=el('store-owner-pause-form')?.elements.namedItem('seller_id');
    const seller=choice?.value;
    if(!org||!seller||!selectedStoreOwner||document.hidden||
       el('store-owner-pause-panel').hidden)return;
    const seq=++platformOwnerRead,epoch=viewEpoch;
    platformOwnerState=null;
    const panel=el('store-platform-appeal-panel'),msg=el('store-platform-appeal-status');
    panel.hidden=true;
    try{
      const data=await api('/organization/store-platform-closing?'+new URLSearchParams({
        organization_id:org,seller_id:seller}).toString());
      if(seq!==platformOwnerRead||epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||seller!==choice.value||document.hidden)return;
      if(data.organization_id!==org||data.seller_id!==seller||
         !['none','notification_unverified','appealed'].includes(data.state)||
         !Number.isSafeInteger(data.version)||
         typeof data.deadline_started!=='boolean'||
         typeof data.first_appeal_open!=='boolean'||
         typeof data.final_review_open!=='boolean'||
         typeof data.final_review_requested!=='boolean'||
         ![null,'accepted','rejected'].includes(data.review_decision)||
         (data.review_decision!==null&&
           (typeof data.review_decision_reason!=='string'||
            typeof data.review_decided_at!=='string'))||
         data.permanent_finalization_enabled!==false||
         typeof data.mandatory_email_verified!=='boolean')
         throw Error('Geçersiz karar');
      platformOwnerState=data;
      panel.hidden=data.state==='none';
      if(data.state==='none')return;
      el('store-platform-appeal-reason').textContent=
        'Platform karar gerekçesi: '+data.reason;
      const decisionText=el('store-platform-review-decision');
      decisionText.hidden=data.review_decision===null;
      decisionText.textContent=data.review_decision===null?'':(
        (data.review_decision==='accepted'?'İtiraz kabul edildi. ':
          'İtiraz reddedildi. ')+
        'Kararın gerekçesi: '+data.review_decision_reason+
        '. Satışlar ayrıca yetkili karar verilmeden yeniden açılmaz.');
      msg.textContent=(data.review_decision!==null?
        'İtiraz hakkında gerekçeli karar verildi. Satışlar kapalı.':
        data.final_review_requested?
        'Bağımsız üst inceleme başvurusu kaydedildi; karar bekleniyor. Satışlar kapalı.':
        data.state==='appealed'?
        'İtiraz kaydedildi; sonuç bekleniyor. Satışlar kapalı.':
        data.final_review_open?
        'İlk 10 gün sona erdi. Kalan 20 günlük üst inceleme için başvurabilirsiniz. Satışlar kapalı.':
        'Satışlar yönetici kararıyla derhal durduruldu. İlk itiraz yalnız süresi içinde gönderilebilir.')+
        (data.deadline_started?
          ' 10+20 günlük itiraz saati başladı; ilk aşama sonu: '+
          new Date(data.first_appeal_until).toLocaleString('tr-TR')+
          ', ikinci aşama sonu: '+
          new Date(data.final_review_until).toLocaleString('tr-TR')+'.':
          ' Bildirim ve itiraz saati henüz doğrulanıyor.');
      el('store-platform-appeal-form').querySelector('button').disabled=
        !data.first_appeal_open||platformOwnerUncertain;
      const finalForm=el('store-platform-final-review-form');
      finalForm.hidden=!data.final_review_open;
      finalForm.querySelector('button').disabled=
        !data.final_review_open||platformFinalReviewUncertain;
    }catch(e){
      if(seq!==platformOwnerRead||epoch!==viewEpoch)return;
      clearPlatformClosingOwner();
      if(![401,403].includes(e.httpStatus)){
        panel.hidden=false;
        msg.textContent='Kapatma kararı güvenle doğrulanamadı; itiraz gönderilemez.';
      }
    }
  }
  el('store-platform-appeal-refresh').onclick=()=>{
    platformOwnerUncertain=false;platformFinalReviewUncertain=false;
    if(currentOrg)void refreshPlatformClosingOwner(currentOrg,organizationRequest);
  };
  el('store-platform-appeal-form').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,org=currentOrg,request=organizationRequest,epoch=viewEpoch;
    const seller=el('store-owner-pause-form').elements.namedItem('seller_id')?.value;
    const reason=form.elements.namedItem('reason').value.trim();
    if(!org||!seller||!selectedStoreOwner||document.hidden||platformOwnerPending||
       platformOwnerUncertain||platformOwnerState?.state!=='notification_unverified'||
       platformOwnerState.first_appeal_open!==true||
       platformOwnerState.seller_id!==seller||reason.length<10||reason.length>500)return;
    const button=form.querySelector('button');
    button.disabled=true;platformOwnerPending=true;
    const msg=el('store-platform-appeal-status');
    msg.textContent='İtiraz kaydediliyor…';
    try{
      const result=await api('/organization/store-platform-closing',{method:'POST',body:JSON.stringify({
        organization_id:org,seller_id:seller,
        request_id:'dapa_'+crypto.randomUUID().replaceAll('-',''),
        expected_version:1,reason})});
      if(epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||document.hidden)return;
      if(result.status!=='appealed'||result.version!==2||
         result.organization_id!==org||result.seller_id!==seller||
         typeof result.deadline_started!=='boolean'){
        const e=Error('İtiraz sonucu doğrulanamadı');e.uncertain=true;throw e;
      }
      platformOwnerUncertain=false;
      form.reset();
      await refreshPlatformClosingOwner(org,request);
    }catch(e){
      if(epoch!==viewEpoch||request!==organizationRequest)return;
      platformOwnerUncertain=!!e.uncertain||e.httpStatus>=500;
      msg.textContent=platformOwnerUncertain?
        'Sonuç belirsiz; tekrar göndermeyin. Önce özel karar durumunu yenileyin.':
        'İtiraz reddedildi. Yetki ve güncel kararı yeniden doğrulayın.';
    }finally{
      platformOwnerPending=false;
      button.disabled=platformOwnerUncertain||platformOwnerState?.first_appeal_open!==true;
    }
  };

  el('store-platform-final-review-form').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,org=currentOrg,request=organizationRequest,epoch=viewEpoch;
    const seller=el('store-owner-pause-form').elements.namedItem('seller_id')?.value;
    const reason=form.elements.namedItem('reason').value.trim();
    if(!org||!seller||!selectedStoreOwner||document.hidden||
       platformFinalReviewPending||platformFinalReviewUncertain||
       platformOwnerState?.final_review_open!==true||
       platformOwnerState.seller_id!==seller||
       reason.length<10||reason.length>500)return;
    const button=form.querySelector('button'),msg=el('store-platform-appeal-status');
    button.disabled=true;platformFinalReviewPending=true;
    msg.textContent='Üst inceleme başvurusu kaydediliyor…';
    try{
      const result=await api('/organization/store-platform-closing-final-review',{
        method:'POST',body:JSON.stringify({
          organization_id:org,seller_id:seller,
          request_id:'dasfr_'+crypto.randomUUID().replaceAll('-',''),
          expected_version:1,reason})});
      if(epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||document.hidden)return;
      if(result.status!=='review_requested'||
         result.final_review_requested!==true||
         result.permanent_finalization_enabled!==false||
         result.organization_id!==org||result.seller_id!==seller){
        const e=Error('Üst inceleme sonucu doğrulanamadı');
        e.uncertain=true;throw e;
      }
      platformFinalReviewUncertain=false;form.reset();
      await refreshPlatformClosingOwner(org,request);
    }catch(e){
      if(epoch!==viewEpoch||request!==organizationRequest)return;
      platformFinalReviewUncertain=!!e.uncertain||e.httpStatus>=500;
      msg.textContent=platformFinalReviewUncertain?
        'Üst inceleme sonucu belirsiz; yeniden göndermeyin, önce güncel durumu yenileyin.':
        'Üst inceleme başvurusu reddedildi. Yetki ve süreyi yeniden doğrulayın.';
    }finally{
      platformFinalReviewPending=false;
      button.disabled=platformFinalReviewUncertain||
        platformOwnerState?.final_review_open!==true;
    }
  };

  window.addEventListener('pagehide',concealPrivateView);
  window.addEventListener('pageshow',event=>{if(event.persisted){concealPrivateView();load()}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)concealPrivateView(true);else load()});
  window.addEventListener('focus',()=>{if(el('workspace').hidden&&loadedScope==='')load();else observeAccess()});
  // Keep a genuine same-page anchor, but transfer keyboard focus to
  // its heading synchronously. A background Chrome page may throttle RAF.
  // Neither fragment can grant Person/Organization/Store access.
  el('personal-entry').onclick=event=>{
    if(el('workspace').hidden)return;
    const node=event.target;
    const link=node instanceof Element?node.closest('a[href^="#"]'):null;
    if(!link||!el('personal-entry').contains(link))return;
    const hash=link.getAttribute('href');
    if(hash!=='#organizations-title'&&hash!=='#organization-draft-title')return;
    const heading=el(hash.slice(1));
    // Browser fragment history triggers the existing security popstate guard,
    // which must continue concealing private data on history traversal.
    // Navigate visually and by focus without mutating the URL/history.
    event.preventDefault();
    heading.scrollIntoView({block:'start'});
    heading.focus({preventScroll:true});
  };
  window.addEventListener('popstate',()=>{concealPrivateView();load()});
  setInterval(observeAccess,5000);
  el('audit-timeline-refresh').onclick=async()=>{timelineCursor=null;await loadTimeline(currentOrg);};
  el('audit-timeline-next').onclick=async()=>{if(timelineCursor&&currentOrg)await loadTimeline(currentOrg,timelineCursor,true);};
  el('select-org').onsubmit=async e=>{e.preventDefault();await selectOrg(new FormData(e.target).get('organization'))};
  el('session-lock').onclick=lockCurrentSession;el('logout').onclick=()=>logout(false);el('logout-all').onclick=()=>logout(true);let platformStorePolicy=null,platformStoreRequest=0;
  const policyForm=el('platform-store-policy-form');
  const policyStatus=el('platform-store-policy-status');
  const policyApply=el('platform-store-policy-apply');
  const policyInput=el('platform-store-policy-organization');
  function clearPlatformStorePolicy(){
    platformStoreRequest++;platformStorePolicy=null;
    policyApply.disabled=true;policyApply.textContent='Henüz durum doğrulanmadı';
    if(typeof policyForm.reset==='function')policyForm.reset();
    el('platform-store-policy-reason').value='';policyStatus.textContent='';
    el('platform-store-policy-panel').hidden=true;
  }
  policyInput.oninput=()=>{
    platformStorePolicy=null;platformStoreRequest++;
    policyApply.disabled=true;policyApply.textContent='Önce durumu doğrula';
    policyStatus.textContent='';
  };
  async function readPlatformStorePolicy(){
    const org=String(policyInput.value||'').trim(),epoch=viewEpoch;
    const seq=++platformStoreRequest;
    platformStorePolicy=null;policyApply.disabled=true;
    if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(org)){
      policyStatus.textContent='Geçerli şirket kimliği girin.';return;
    }
    policyStatus.textContent='Başvuru hakkı doğrulanıyor…';
    try{
      const result=await api('/platform/store-application-policy?organization_id='+
        encodeURIComponent(org));
      if(seq!==platformStoreRequest||epoch!==viewEpoch||document.hidden||
         el('workspace').hidden||policyInput.value.trim()!==org)return;
      if(result.organization_id!==org||typeof result.name!=='string'||
         typeof result.store_application_enabled!=='boolean'||
         !Number.isSafeInteger(result.store_application_version)||
         result.store_application_version<0||result.store_application_version>=2147483647)
        throw Error('Durum doğrulanamadı');
      platformStorePolicy={organization_id:org,enabled:result.store_application_enabled,
        version:result.store_application_version};
      policyApply.disabled=false;
      policyApply.textContent=result.store_application_enabled?
        'Yeni mağaza başvuru hakkını kapat':'Yeni mağaza başvuru hakkını aç';
      policyStatus.textContent=result.name+' — yeni mağaza başvuru hakkı '+
        (result.store_application_enabled?'açık.':'kapalı; bekleyen başvurular korunuyor.');
    }catch{
      if(seq!==platformStoreRequest||epoch!==viewEpoch)return;
      policyStatus.textContent='Şirket ve platform yetkisi doğrulanamadı. İşlem yapılamaz.';
    }
  }
`;

