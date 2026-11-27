// Kişisel konsol istemci betiği: organizations-drafts.ts
export const scriptOrganizationsDrafts: string = `  let recoveryCodes=[];
  let notificationRequest=0,notificationOffset=0,notificationNext=null;
  const organizationActivityCodes=[
    'service_repair','retail_store','wholesale_distribution',
    'manufacturing','fleet_operations','insurance_claims'];
  let organizationDraftId='',organizationDraftVersion=0,organizationDraftRequest=0;
  let organizationDraftCursor=null,organizationDraftSaving=false,organizationDraftMutation=0;
  let organizationDocumentSelection=null;
  function lockOrganizationDraftSelection(busy){
    organizationDraftSaving=busy;
    for(const control of el('organization-draft-form').querySelectorAll('input,select,button'))
      control.disabled=busy;
    for(const id of ['organization-draft-new','organization-draft-refresh','organization-draft-more','organization-draft-withdraw','organization-application-submit','organization-document-upload','organization-document-file'])
      if(el(id)) el(id).disabled=busy;
    for(const button of el('organization-draft-list').querySelectorAll('button'))
      button.disabled=busy;
  }
  function clearOrganizationDrafts(){
    organizationDraftMutation++;organizationDraftRequest++;
    organizationDraftId='';organizationDraftVersion=0;organizationDraftCursor=null;
    organizationDocumentSelection=null;
    el('organization-document-file').value='';
    el('organization-draft-list').replaceChildren();
    el('organization-draft-more').hidden=true;
    el('organization-draft-withdraw').hidden=true;
    el('organization-application-submit').hidden=true;
    el('organization-document-section').hidden=true;
    el('organization-document-status').textContent='';
    el('organization-document-info').textContent='';
    el('organization-draft-status').textContent='';
    el('organization-draft-form').reset();
    lockOrganizationDraftSelection(false);
  }
  async function refreshOrganizationDrafts(append=false){
    const cursor=append?organizationDraftCursor:null;
    if(append&&!cursor)return;
    const request=++organizationDraftRequest,epoch=viewEpoch;
    if(!append){
      el('organization-draft-list').replaceChildren();
      el('organization-draft-withdraw').hidden=true;
    }
    el('organization-draft-more').disabled=true;
    el('organization-draft-status').textContent='Taslaklar kontrol ediliyor…';
    try{
      const data=await api('organization-applications'+
        (cursor?'?cursor='+encodeURIComponent(cursor):''));
      if(request!==organizationDraftRequest||epoch!==viewEpoch)return;
      if(!Array.isArray(data.drafts)||
        !(data.next_cursor===null||typeof data.next_cursor==='string'&&
          /^[A-Za-z0-9_-]{1,256}$/.test(data.next_cursor)))
        throw Error('Taslaklar doğrulanamadı');
      for(const item of data.drafts){
        if(!item||typeof item.id!=='string'||!['draft','withdrawn','submitted','in_review','correction_requested','rejected','approved'].includes(item.status)||
          !Number.isSafeInteger(item.version)||item.version<1||
          !['individual_business','legal_company'].includes(item.business_kind)||
          !Array.isArray(item.declared_activities)||item.declared_activities.length>6||
          !item.declared_activities.every(v=>organizationActivityCodes.includes(v))||
          (item.declared_activities.length===0?
            item.primary_activity!==null:!item.declared_activities.includes(item.primary_activity)))
          throw Error('Taslaklar doğrulanamadı');
        const row=document.createElement('p'),button=document.createElement('button');
        row.textContent=item.legal_name+(
          item.status==='draft'?' — Taslak (henüz gönderilmedi)':
          item.status==='submitted'?' — Başvuru gönderildi (inceleme bekliyor)':
          item.status==='in_review'?' — İncelemede (platform görevlisi değerlendiriyor)':
          item.status==='correction_requested'?' — Düzeltme istendi':
          item.status==='rejected'?' — Başvuru reddedildi':
          item.status==='approved'?' — Başvuru onaylandı':
          ' — Geri çekildi (yeniden düzenlenemez)'
        );
        if(item.review_notes && ['correction_requested','rejected'].includes(item.status)){
          const detail=document.createElement('span');
          detail.textContent=' — İnceleme açıklaması: '+item.review_notes;
          row.append(detail);
        }
        if(item.has_document){
          const dlBtn=document.createElement('button');
          dlBtn.type='button';dlBtn.textContent='Belgeyi indir';
          dlBtn.disabled=organizationDraftSaving;
          dlBtn.onclick=()=>{
            window.open('/personal/organization-applications?action=document&application_id='+encodeURIComponent(item.id),'_blank');
          };
          const scanHelp=document.createElement('span');
          scanHelp.textContent=' — Son virüs taraması durumu güncel ClamAV imzalarıyla erişimde yeniden doğrulanır.';
          row.append(scanHelp,dlBtn);
        }
        if(['draft','correction_requested'].includes(item.status)){
          button.type='button';button.textContent=item.status==='correction_requested'?'Düzelt ve yeniden gönder':'Taslağı düzenle';
          button.disabled=organizationDraftSaving;
          button.onclick=()=>{
          if(organizationDraftSaving)return;
          organizationDraftId=item.id;organizationDraftVersion=item.version;
          organizationDocumentSelection=null;
          el('organization-document-file').value='';
          el('organization-document-status').textContent=item.has_document?
            'Belge yüklü; virüs taraması güncel imzalarla yetkili erişimde doğrulanır.':
            'Henüz belge yüklenmedi ve virüs taraması yapılmadı.';
          const form=el('organization-draft-form');
          for(const input of form.querySelectorAll('input[name=declared_activities]'))
            input.checked=item.declared_activities.includes(input.value);
          form.elements.primary_activity.value=item.primary_activity||'';
          form.elements.business_kind.value=item.business_kind;
          form.elements.legal_name.value=item.legal_name;
          form.elements.landline_phone.value=item.landline_phone;
          if(form.elements.tax_identifier)form.elements.tax_identifier.value=item.tax_identifier||'';
          form.querySelector('button').disabled=false;
          el('organization-draft-withdraw').hidden=false;
          el('organization-document-section').hidden=false;
          if(item.has_document){
            el('organization-document-info').textContent='Yüklü vergi levhası: v'+item.document.version+' ('+item.document.mime_type+', '+item.document.original_byte_length+' bayt)';
            // A correction must be saved or replaced before resubmission.
            el('organization-application-submit').hidden=item.status!=='draft';
          } else {
            el('organization-document-info').textContent='Henüz vergi levhası yüklenmedi (zorunlu).';
            el('organization-application-submit').hidden=true;
          }
          el('organization-draft-status').textContent=item.status==='correction_requested'?
            'Düzeltme istendi. Bilgileri kaydedin veya yeni belge yükleyin; ardından başvuruyu yeniden gönderin.':
            'Seçilen özel taslak düzenlenebilir; gönderilmedi.';
          form.elements.legal_name.focus();
        };
          row.append(button);
        }
        if(['submitted','in_review'].includes(item.status)){
          const withdrawSubmitted=document.createElement('button');
          withdrawSubmitted.type='button';withdrawSubmitted.textContent='Başvuruyu geri çek';
          withdrawSubmitted.disabled=organizationDraftSaving;
          withdrawSubmitted.onclick=()=>void withdrawOrganizationApplication(item.id,item.version);
          row.append(withdrawSubmitted);
        }
        el('organization-draft-list').append(row);
      }
      organizationDraftCursor=data.next_cursor;
      el('organization-draft-more').hidden=!organizationDraftCursor;
      el('organization-draft-status').textContent=data.drafts.length?
        'Yalnız size ait taslaklar yüklendi.':'Başka taslak bulunamadı.';
      // The saving form may restore its actual document state from this fresh GET.
      return data.drafts.find(item=>item.id===organizationDraftId)||null;
    }catch(error){
      if(request!==organizationDraftRequest||epoch!==viewEpoch)return;
      if([401,403].includes(error.httpStatus)){
        concealPrivateView();el('login').hidden=false;return;
      }
      el('organization-draft-status').textContent='Taslaklar yüklenemedi. Yenileyin.';
    }finally{
      if(request===organizationDraftRequest&&epoch===viewEpoch)
        el('organization-draft-more').disabled=organizationDraftSaving;
    }
  }
  el('organization-draft-new').onclick=()=>{
    if(organizationDraftSaving)return;
    organizationDraftId='';organizationDraftVersion=0;
    organizationDocumentSelection=null;
    el('organization-document-file').value='';
    el('organization-draft-form').reset();
    el('organization-draft-form').querySelector('button').disabled=false;
    el('organization-draft-withdraw').hidden=true;
    el('organization-draft-status').textContent='Yeni taslak; hiçbir başvuru henüz gönderilmedi.';
  };
  let organizationReviewRequest=0,organizationReviewCursor=null;
  function clearOrganizationReviews(){
    organizationReviewRequest++;
    organizationReviewCursor=null;
    el('organization-review-list').replaceChildren();
    el('organization-review-status').textContent='';
    el('organization-review-more').hidden=true;
    el('organization-review-more').disabled=false;
    el('organization-review-panel').hidden=true;
  }
  async function refreshOrganizationReviews(append=false){
    const panel=el('organization-review-panel');
    if(!panel)return;
    const more=el('organization-review-more');
    const cursor=append?organizationReviewCursor:null;
    if(append&&(!cursor||more.disabled||panel.hidden))return;
    const request=++organizationReviewRequest,epoch=viewEpoch,person=currentPersonId;
    const list=el('organization-review-list');
    if(!append){
      organizationReviewCursor=null;
      list.replaceChildren();
      more.hidden=true;
      panel.hidden=true;
    }
    more.disabled=true;
    if(document.hidden||el('workspace').hidden||!person){more.disabled=false;return;}
    const stillAuthorizedView=()=>request===organizationReviewRequest &&
      epoch===viewEpoch&&currentPersonId===person&&
      !document.hidden&&!el('workspace').hidden;
    try{
      const data=await api('/platform/organization-applications?action=review_queue'+
        (cursor?'&cursor='+encodeURIComponent(cursor):''));
      if(!stillAuthorizedView())return;
      if(!Array.isArray(data.applications)||
         (data.next_cursor!==null&&typeof data.next_cursor!=='string')||
         (append&&data.next_cursor===cursor))throw Error('Invalid review page');
      panel.hidden=false;
      for(const item of data.applications){
        const row=document.createElement('p');
        // A loaded row remains active while the same reviewer loads another page.
        // Only the async list response itself is tied to the request counter.
        const currentReviewView=()=>epoch===viewEpoch&&
          currentPersonId===person&&!document.hidden&&
          !el('workspace').hidden&&row.isConnected;
        const dupText=item.duplicate_review_required?' [Mükerrerlik İncelemesi Gerekli]':'';
        row.textContent=item.legal_name+' ('+item.business_kind+', VKN/TCKN: '+item.tax_identifier+')'+dupText+
          ' — Durum: '+(item.status==='in_review'?'İncelemede':'İnceleme bekliyor');
        if(item.has_document){
          const message=document.createElement('span');
          message.textContent=' — Vergi levhası: bu oturumda virüs taraması henüz doğrulanmadı; yalnız güvenli önizleme ile kontrol edilebilir. Ham belge indirmesi kapalı.';
          row.append(message);
        }
        const notesInput=document.createElement('input');
        notesInput.placeholder='İnceleme / düzeltme notu';
        row.append(notesInput);
        if(item.status==='submitted'){
          const startBtn=document.createElement('button');
          startBtn.type='button';startBtn.textContent='İncelemeye Al';
          // The page-1 button remains valid when the *same* Person opens
          // page 2. Request counters protect stale async list responses, not
          // live buttons. Server still rechecks staff grant and CAS version.
          startBtn.onclick=async()=>{
            if(!currentReviewView()||startBtn.disabled)return;
            startBtn.disabled=true;
            try{
              await api('/platform/organization-applications',{method:'POST',body:JSON.stringify({
                action:'review_decision',application_id:item.id,expected_version:item.version,
                decision:'start_review'
              })});
              if(currentReviewView())await refreshOrganizationReviews();
            }catch{
              if(currentReviewView()){
                startBtn.disabled=false;
                el('organization-review-status').textContent='İncelemeye alma doğrulanamadı; başvuru kuyruğunu yenileyin.';
              }
            }
          };
          row.append(startBtn);
        }
        const reviewOutcome=document.createElement('span');
        reviewOutcome.setAttribute('role','status');
        reviewOutcome.setAttribute('aria-live','polite');
        const correctBtn=document.createElement('button');
        correctBtn.type='button';correctBtn.textContent='Düzeltme İste';
        const rejectBtn=document.createElement('button');
        rejectBtn.type='button';rejectBtn.textContent='Reddet';
        const submitReviewDecision=async(decision,button)=>{
          if(!currentReviewView()||button.disabled)return;
          const notes=notesInput.value.trim();
          if(!notes){
            reviewOutcome.textContent=decision==='reject'?
              ' — Ret gerekçesi zorunludur.':' — Düzeltme notu zorunludur.';
            return;
          }
          correctBtn.disabled=true;rejectBtn.disabled=true;
          reviewOutcome.textContent=' — Karar gönderiliyor…';
          try{
            const result=await api('/platform/organization-applications',{method:'POST',
              body:JSON.stringify({action:'review_decision',application_id:item.id,
                expected_version:item.version,decision,notes})});
            if(!currentReviewView())return;
            if(result.status!==(decision==='reject'?'rejected':'correction_requested'))
              throw Error('Karar sonucu doğrulanamadı');
            await refreshOrganizationReviews();
          }catch(error){
            if(!currentReviewView())return;
            if(error.httpStatus===409){
              // The old row is stale: never replay a decision under a new version.
              await refreshOrganizationReviews();
              if(epoch===viewEpoch&&currentPersonId===person&&
                 !document.hidden&&!el('workspace').hidden)
                el('organization-review-status').textContent=
                  'Başvuru başka işlemle değişti; güncel inceleme kuyruğu yüklendi. Karar kaydedilmedi.';
              return;
            }
            reviewOutcome.textContent=error.uncertain?
              ' — Karar sonucu belirsiz. Tekrar göndermeyin; kuyruğu yenileyip güncel durumu kontrol edin.':
              ' — Karar tamamlanamadı. Yetkinizi ve başvuru durumunu kontrol edin.';
            // Unknown outcome must not be blindly retried from this row.
            if(!error.uncertain){correctBtn.disabled=false;rejectBtn.disabled=false;}
          }
        };
        correctBtn.onclick=()=>void submitReviewDecision('request_correction',correctBtn);
        rejectBtn.onclick=()=>void submitReviewDecision('reject',rejectBtn);
        row.append(correctBtn,rejectBtn,reviewOutcome);
        // Raw PDFs and images never enter the staff browser. The backend
        // allows approval only after a fresh local malware scan and isolated
        // rasterization; this button is NOT a client-side authority grant.
        const previewNote=document.createElement('span');
        previewNote.setAttribute('role','status');
        previewNote.setAttribute('aria-live','polite');
        previewNote.textContent=' — Güncel virüs taraması doğrulanıyor; güvenli önizleme açılmadan onay kapalı.';
        row.append(previewNote);
        if(item.has_document){
          const previewBtn=document.createElement('button');
          previewBtn.type='button';previewBtn.textContent='Belgeyi Güvenli Önizle';
          const safeImage=document.createElement('img');
          safeImage.alt='Güvenli taramadan geçen vergi levhasının tüm sayfaları';
          safeImage.hidden=true;
          safeImage.style.display='block';
          // Keep PDF pages at a legible width even inside a narrow two-column
          // workspace. A scaled-to-fit tall PNG otherwise falsely appears
          // fully viewed without scrolling through the document.
          safeImage.style.width='600px';
          safeImage.style.maxWidth='none';
          safeImage.style.height='auto';
          safeImage.referrerPolicy='no-referrer';
          const previewBox=document.createElement('div');
          previewBox.hidden=true;
          previewBox.tabIndex=0;
          previewBox.setAttribute('role','region');
          previewBox.setAttribute('aria-label','Vergi levhasının tüm sayfaları, aşağı kaydırarak inceleyin');
          previewBox.style.maxWidth='min(100%, 600px)';
          previewBox.style.maxHeight='950px';
          previewBox.style.overflowY='auto';
          previewBox.style.overflowX='auto';
          previewBox.append(safeImage);
          const approveBtn=document.createElement('button');
          approveBtn.type='button';approveBtn.textContent='İşletmeyi Onayla';
          approveBtn.hidden=true;approveBtn.disabled=true;
          let previewReady=false;
          const updateCompletePreview=()=>{
            if(!currentReviewView()||!row.isConnected||safeImage.hidden)return;
            // A combined all-page PNG must not be scaled down into a single
            // unreadable page. Enable the UI approval only at its bottom.
            previewReady=previewBox.scrollHeight-previewBox.scrollTop-previewBox.clientHeight<=4;
            approveBtn.hidden=!previewReady;approveBtn.disabled=!previewReady;
            // A successful preview follows ClamAV verdicts for the
            // original and rasterized document; not a permanent guarantee.
            previewNote.textContent=previewReady?
              ' — Virüs taramasından geçirilmiştir: mevcut imzalarla tehdit algılanmadı. Güvenli görselin tamamı gösterildi; onayda belge bütünlüğü ve ClamAV imza güncelliği doğrulanır, gerekirse yeniden taranır.':
              ' — Virüs taramasından geçirilmiştir: mevcut imzalarla tehdit algılanmadı. Belgenin bütün sayfalarını görmek için görselin sonuna kaydırın; onayda belge bütünlüğü ve ClamAV imza güncelliği doğrulanır, gerekirse yeniden taranır.';
          };
          previewBox.onscroll=updateCompletePreview;
          previewBtn.onclick=()=>{
            if(!currentReviewView()||!row.isConnected)return;
            previewReady=false;approveBtn.hidden=true;approveBtn.disabled=true;
            previewBtn.disabled=true;safeImage.hidden=true;previewBox.hidden=true;
            previewBox.scrollTop=0;
            previewNote.textContent=' — ClamAV güncelliği kontrol ediliyor; gerekirse yeniden taranıyor ve güvenli görsel hazırlanıyor.';
            safeImage.onload=()=>{
              if(!currentReviewView()||!row.isConnected)return;
              safeImage.hidden=false;previewBox.hidden=false;
              previewBtn.disabled=false;
              updateCompletePreview();
            };
            safeImage.onerror=()=>{
              if(!currentReviewView()||!row.isConnected)return;
              previewReady=false;safeImage.hidden=true;previewBox.hidden=true;
              approveBtn.hidden=true;approveBtn.disabled=true;
              previewBtn.disabled=false;
              previewNote.textContent=' — Virüs taraması doğrulanamadı veya güvenli görsel açılamadı. Tarama veya güvenli önizleme kullanılamıyor; onay kapalı. Belgeyi açmayın; yeniden deneyin.';
            };
            safeImage.src='/platform/organization-applications?action=review_preview&application_id='+
              encodeURIComponent(item.id);
          };
          approveBtn.onclick=async()=>{
            if(!previewReady||approveBtn.disabled||!currentReviewView()||!row.isConnected)return;
            previewReady=false;approveBtn.disabled=true;
            try{
              await api('/platform/organization-applications',{method:'POST',body:JSON.stringify({
                action:'review_decision',application_id:item.id,
                expected_version:item.version,decision:'approve',
                notes:notesInput.value.trim()||undefined
              })});
              await refreshOrganizationReviews();
            }catch{
              // Authorization, scan freshness, preview failure and stale
              // document versions never produce optimistic UI success.
              if(currentReviewView()&&row.isConnected){
                safeImage.hidden=true;previewBox.hidden=true;approveBtn.hidden=true;
                previewNote.textContent=' — Onay tamamlanamadı; güvenli incelemeyi yeniden başlatın.';
                previewBtn.disabled=false;
              }
            }
          };
          row.append(previewBtn,previewBox,approveBtn);
        }
        list.append(row);
      }
      organizationReviewCursor=data.next_cursor;
      more.hidden=!organizationReviewCursor;
      el('organization-review-status').textContent=list.children.length?
        list.children.length+' başvuru listelendi.':'İnceleme bekleyen başvuru yok.';
    }catch{
      if(stillAuthorizedView()){
        // Fail closed if authorization, connectivity or cursor validity is uncertain.
        clearOrganizationReviews();
      }
    }finally{
      if(stillAuthorizedView())more.disabled=false;
    }
  }
  el('organization-review-refresh').onclick=()=>void refreshOrganizationReviews();
  el('organization-review-more').onclick=()=>void refreshOrganizationReviews(true);
  el('organization-draft-refresh').onclick=()=>{
    if(!organizationDraftSaving)void refreshOrganizationDrafts();
  };
  el('organization-draft-more').onclick=()=>{
    if(!organizationDraftSaving)void refreshOrganizationDrafts(true);
  };
  async function withdrawOrganizationApplication(id,version){
    if(organizationDraftSaving||!id||!Number.isSafeInteger(version)||version<1||
       document.hidden||el('workspace').hidden)return;
    const epoch=viewEpoch;
    const mutation=++organizationDraftMutation;
    lockOrganizationDraftSelection(true);
    let uncertain=false;
    try{
      const result=await api('organization-applications',{method:'POST',
        body:JSON.stringify({action:'withdraw',application_id:id,expected_version:version})});
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      if(result.application_id!==id||result.status!=='withdrawn'||
         result.version!==version+1)throw Error('Geri çekme sonucu belirsiz');
      organizationDraftId='';organizationDraftVersion=0;
      el('organization-draft-withdraw').hidden=true;
      el('organization-application-submit').hidden=true;
      el('organization-document-section').hidden=true;
      el('organization-draft-form').reset();
      await refreshOrganizationDrafts();
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      el('organization-draft-status').textContent=
        'Başvuru/taslak geri çekildi; belge ve denetim geçmişi korundu.';
    }catch(error){
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      uncertain=!!error.uncertain;
      el('organization-draft-status').textContent=uncertain?
        'Geri çekme sonucu belirsiz; tekrar göndermeyin. Taslakları yenileyip durumu kontrol edin.':
        error.httpStatus===409?
          'Taslak değişmiş. Taslakları yenileyip güncel durumu kontrol edin.':
          'Geri çekme yapılamadı. Oturumu ve taslak durumunu kontrol edin.';
    }finally{
      if(mutation===organizationDraftMutation&&epoch===viewEpoch){
        lockOrganizationDraftSelection(false);
        if(uncertain)el('organization-draft-withdraw').disabled=true;
      }
    }
  }
  el('organization-draft-withdraw').onclick=()=>
    void withdrawOrganizationApplication(organizationDraftId,organizationDraftVersion);
  el('organization-draft-form').onsubmit=async e=>{
    e.preventDefault();
    const form=e.currentTarget,button=form.querySelector('button');
    if(organizationDraftSaving||button.disabled||document.hidden||el('workspace').hidden)return;
    const selectedActivities=Array.from(
      form.querySelectorAll('input[name=declared_activities]:checked'),x=>x.value);
    const primaryActivity=form.elements.primary_activity.value;
    if(!selectedActivities.length||!selectedActivities.includes(primaryActivity)){
      el('organization-draft-status').textContent=
        'En az bir faaliyet ve bu faaliyetlerden birini ana faaliyet olarak seçin.';
      return;
    }
    // Capture the exact payload before disabling fields, then block selection
    // and edits until the HTTP result has been processed.
    const payload={...Object.fromEntries(new FormData(form)),
      declared_activities:selectedActivities,primary_activity:primaryActivity};
    if(!payload.tax_identifier)delete payload.tax_identifier;
    const id=organizationDraftId||'daorgapp_'+crypto.randomUUID().replaceAll('-','');
    organizationDraftId=id;
    const version=organizationDraftVersion,epoch=viewEpoch;
    const mutation=++organizationDraftMutation;
    lockOrganizationDraftSelection(true);
    let uncertain=false;
    try{
      const data=await api('organization-applications',{method:'POST',
        body:JSON.stringify({...payload,application_id:id,expected_version:version})});
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      if(data.application_id!==id||data.status!=='draft'||data.version!==version+1)
        throw Error('Taslak sonucu belirsiz');
      organizationDraftVersion=data.version;
      el('organization-document-section').hidden=false;
      el('organization-application-submit').hidden=true;
      // Saving application fields must not erase a previously scanned document.
      // Reconcile from an authorized fresh GET, not from an optimistic POST.
      const refreshed=await refreshOrganizationDrafts();
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      if(!refreshed||refreshed.id!==id||refreshed.status!=='draft'||
         refreshed.version!==data.version||
         (refreshed.has_document&&!refreshed.document)){
        el('organization-document-info').textContent='Belge durumu doğrulanamadı; taslakları yeniden açın.';
        el('organization-draft-status').textContent=
          'Taslak kaydedildi; belge durumu doğrulanamadı. Taslakları yenileyin.';
        return;
      }
      if(refreshed.has_document){
        const doc=refreshed.document;
        el('organization-document-info').textContent=
          'Yüklü vergi levhası: v'+doc.version+' ('+doc.mime_type+', '+doc.original_byte_length+' bayt)';
        el('organization-document-status').textContent=organizationDocumentSelection?
          'Yeni belge seçildi ancak henüz yüklenmedi; yüklemek için düğmeye basın.':
          'Önceki belge korundu; virüs taraması güncel imzalarla erişimde doğrulanır.';
        el('organization-application-submit').hidden=!!organizationDocumentSelection;
        el('organization-draft-status').textContent=organizationDocumentSelection?
          'Taslak kaydedildi; seçilen yeni belgeyi yükleyin.':
          'Taslak kaydedildi. Yüklü vergi levhası korundu; başvuruyu gönderebilirsiniz.';
      }else{
        el('organization-document-info').textContent='Henüz vergi levhası yüklenmedi (zorunlu).';
        el('organization-document-status').textContent='Henüz belge yüklenmedi ve virüs taraması yapılmadı.';
        el('organization-draft-status').textContent=
          'Taslak kaydedildi. Vergi levhası yükleyip başvuruyu gönderebilirsiniz.';
      }
    }catch(error){
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      uncertain=!!error.uncertain;
      el('organization-draft-status').textContent=uncertain?
        'Kayıt sonucu belirsiz; yeniden göndermeyin. Taslaklarımı yenile ile kontrol edin.':
        error.httpStatus===409?
          'Değişiklik bulunamadı veya taslak güncellendi. Taslaklarımı yenileyip bilgileri kontrol edin.':
          'Taslak kaydedilemedi. Bilgileri ve oturumunuzu kontrol edin.';
    }finally{
      if(mutation===organizationDraftMutation&&epoch===viewEpoch){
        lockOrganizationDraftSelection(false);
        if(uncertain)button.disabled=true;
      }
    }
  };
  el('organization-document-upload').onclick=async()=>{
    const fileInput=el('organization-document-file');
    const file=organizationDocumentSelection||fileInput.files?.[0];
    if(!file){
      el('organization-document-status').textContent='Lütfen bir PDF, JPEG veya PNG dosyası seçin.';
      return;
    }
    if(file.size > 10 * 1024 * 1024){
      el('organization-document-status').textContent='Dosya boyutu 10 MiB sınırını aşıyor.';
      return;
    }
    if(organizationDraftSaving||!organizationDraftId||organizationDraftVersion<1)return;
    const id=organizationDraftId,version=organizationDraftVersion,epoch=viewEpoch;
    const mutation=++organizationDraftMutation;
    lockOrganizationDraftSelection(true);
    el('organization-document-status').textContent='Belge yükleniyor ve virüs taramasından geçiriliyor…';
    try{
      const reader=new FileReader();
      const base64Promise=new Promise((resolve,reject)=>{
        reader.onload=()=>resolve(String(reader.result).split(',')[1]);
        reader.onerror=reject;
      });
      reader.readAsDataURL(file);
      const file_base64=await base64Promise;
      const result=await api('organization-applications',{
        method:'POST',
        body:JSON.stringify({
          action:'upload_document',
          application_id:id,
          expected_version:version,
          filename:file.name,
          file_base64:file_base64
        })
      });
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      organizationDraftVersion=result.version;
      el('organization-document-status').textContent='Vergi levhası başarıyla yüklendi ve virüs taramasından geçirildi: mevcut imzalarla tehdit algılanmadı. Güvenli önizleme özel alanda hazır.';
      el('organization-document-info').textContent='Yüklü vergi levhası: v'+result.document.version+' ('+result.document.mime_type+', '+result.document.original_byte_length+' bayt)';
      el('organization-application-submit').hidden=false;
      organizationDocumentSelection=null;
      fileInput.value='';
      await refreshOrganizationDrafts();
    }catch(err){
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      el('organization-document-status').textContent=err.uncertain?
        'Belge yükleme veya tarama sonucu belirsiz. Önce taslakları yenileyip kontrol edin; otomatik yeniden yükleme yapılmadı.':
        'Belge yüklenemedi veya virüs taraması başarısız oldu. Güvenli erişim açılmadı; belgeyi kontrol edin.';
    }finally{
      if(mutation===organizationDraftMutation&&epoch===viewEpoch){
        lockOrganizationDraftSelection(false);
      }
    }
  };

  // Drop and file-picker share the existing authenticated upload button and
  // server validation. A drop never starts a POST or changes a draft by itself.
  function chooseOrganizationDocument(file){
    const input=el('organization-document-file');
    organizationDocumentSelection=null;
    if(organizationDraftSaving||!organizationDraftId||organizationDraftVersion<1||
       document.hidden||el('workspace').hidden||el('organization-document-section').hidden){
      input.value='';return;
    }
    if(!(file instanceof File)||!/^.{1,160}[.](?:pdf|jpe?g|png)$/i.test(file.name)||
       file.size<1||file.size>10*1024*1024){
      input.value='';
      el('organization-document-status').textContent='Yalnız PDF, JPEG veya PNG biçiminde, en fazla 10 MiB dosya seçin.';
      return;
    }
    organizationDocumentSelection=file;
    el('organization-application-submit').hidden=true;
    el('organization-document-status').textContent='Dosya seçildi: '+file.name+'. Henüz virüs taramasından geçirilmedi. Belgeyi yükle düğmesine basınca tarama başlayacak.';
  }
  el('organization-document-file').onchange=e=>chooseOrganizationDocument(e.currentTarget.files?.[0]);
  const taxDropzone=el('organization-document-dropzone');
  taxDropzone.ondragover=e=>{
    e.preventDefault();
    if(!organizationDraftSaving&&!document.hidden&&!el('organization-document-section').hidden)
      taxDropzone.style.outline='2px dashed currentColor';
  };
  taxDropzone.ondragleave=()=>{taxDropzone.style.outline='';};
  taxDropzone.ondrop=e=>{
    e.preventDefault();taxDropzone.style.outline='';
    if(!e.dataTransfer||e.dataTransfer.files.length!==1){
      organizationDocumentSelection=null;
      el('organization-document-file').value='';
      el('organization-document-status').textContent='Lütfen aynı anda yalnız bir belge bırakın.';
      return;
    }
    el('organization-document-file').value='';
    chooseOrganizationDocument(e.dataTransfer.files[0]);
  };

  el('organization-application-submit').onclick=async()=>{
    if(organizationDraftSaving||!organizationDraftId||organizationDraftVersion<1||
       document.hidden||el('workspace').hidden)return;
    const id=organizationDraftId,version=organizationDraftVersion,epoch=viewEpoch;
    const mutation=++organizationDraftMutation;
    lockOrganizationDraftSelection(true);
    let uncertain=false;
    try{
      const result=await api('organization-applications',{
        method:'POST',
        body:JSON.stringify({
          action:'submit',
          application_id:id,
          expected_version:version
        })
      });
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      if(result.application_id!==id||result.status!=='submitted'||result.version!==version+1)
        throw Error('Başvuru sonucu belirsiz');
      organizationDraftId='';organizationDraftVersion=0;
      el('organization-draft-withdraw').hidden=true;
      el('organization-application-submit').hidden=true;
      el('organization-document-section').hidden=true;
      el('organization-draft-form').reset();
      await refreshOrganizationDrafts();
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      el('organization-draft-status').textContent=
        'Başvuru platform incelemesine başarıyla gönderildi. Yönetici onayı bekleniyor; işletme yetkisi henüz verilmedi.';
    }catch(error){
      if(mutation!==organizationDraftMutation||epoch!==viewEpoch)return;
      uncertain=!!error.uncertain;
      el('organization-draft-status').textContent=uncertain?
        'Başvuru sonucu belirsiz; tekrar göndermeyin. Taslakları yenileyip durumu kontrol edin.':
        error.httpStatus===409?
          'Taslak değişmiş. Taslakları yenileyip güncel durumu kontrol edin.':
          'Başvuru gönderilemedi. Zorunlu alanları ve vergi levhasını kontrol edin.';
    }finally{
      if(mutation===organizationDraftMutation&&epoch===viewEpoch){
        lockOrganizationDraftSelection(false);
        if(uncertain)el('organization-application-submit').disabled=true;
      }
    }
  };

`;

