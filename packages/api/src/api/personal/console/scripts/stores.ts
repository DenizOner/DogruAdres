// Kişisel konsol istemci betiği: stores.ts
export const scriptStores: string = `  function clearProductPermissions(){
    productPermissionRequest++;
    el('product-grants-panel').hidden=true;
    el('product-grants-list').replaceChildren();
    el('product-grants-status').textContent='';
    el('product-grants-effective').textContent='';
    const form=el('product-grants-form');
    // Fake DOMs in non-browser unit contracts may not implement querySelectorAll.
    if(typeof form.querySelectorAll==='function'){
      for(const select of form.querySelectorAll('select'))select.replaceChildren();
      for(const button of form.querySelectorAll('button'))button.disabled=true;
    }
  }
  function clearOrganizationStores(){
    clearStoreRename();
    clearStoreBlock();
    clearProductPermissions();
    clearBuyerPermissions();
    clearStoreDraftPermissions();
    clearBuyerContext();
    clearBuyerFollowList();
    clearProductDraft();
    storeRequest++;
    el('org-stores-panel').hidden=true;
    el('org-stores').replaceChildren();
    el('org-stores-status').textContent='';
    el('org-stores-refresh').hidden=true;
    applicationRequest++;
    el('store-application-panel').hidden=true;
    el('store-application-list').replaceChildren();
    el('store-application-status').textContent='';
    el('store-application-form').hidden=true;
    el('store-draft-form').hidden=true;
    const draftForm=el('store-draft-form');
    if(typeof draftForm.reset==='function')draftForm.reset();
    const draftSubmit=typeof draftForm.querySelector==='function'?draftForm.querySelector('button[type=submit]'):null;
    if(draftSubmit)draftSubmit.disabled=false;
    const form=el('store-application-form');
    if(typeof form.reset==='function')form.reset();
    const submit=typeof form.querySelector==='function'?form.querySelector('button'):null;
    if(submit)submit.disabled=false;
    applicationKey='';applicationRole='';storeDraftKey='';storeDraftVersion=0;
  }
  let storeApprovalRequest=0,storeApprovalPage=0;
  function clearStoreApprovals(){
    storeApprovalRequest++;storeApprovalPage=0;
    el('store-approval-older').hidden=true;el('store-approval-newer').hidden=true;
    el('store-approval-panel').hidden=true;
    el('store-approval-list').replaceChildren();
    el('store-reactivation-list').replaceChildren();
    el('store-approval-status').textContent='';
  }
  // Exceptional transfer uses a two-stage live Staff preview. Only the
  // verified server response supplies names; browser form values grant no right.
  function addExceptionalNameTransfer(entry,row,message,list){
    if(entry.name_review_required)return;
    const reveal=document.createElement('button');
    reveal.type='button';reveal.textContent='İstisnai ad hakkı devrini incele';
    const box=document.createElement('div');box.hidden=true;
    const legend=document.createElement('p');
    legend.textContent='İstisnai ad hakkı devri: yalnız geçerli platform kararıyla. Kaynak mağaza askıda kalır; hedef mağaza eski URL’yi hemen kullanamaz.';
    const makeField=(labelText,pattern)=>{
      const label=document.createElement('label'),input=document.createElement('input');
      label.textContent=labelText+' ';input.type='text';input.required=true;
      input.setAttribute('aria-label',labelText);
      if(pattern)input.pattern=pattern;
      label.append(input);box.append(label);
      return input;
    };
    box.dataset.transferSource=entry.seller_id;
    reveal.dataset.storeTransferSource=entry.seller_id;
    const targetApp=makeField('Hedef mağaza başvuru kimliği','daapp_[a-f0-9]{32}');
    targetApp.name='target_application_id';
    const targetSeller=makeField('Hedef Store kimliği','sel_[A-Za-z0-9_-]+');
    targetSeller.name='target_seller_id';
    const reasonLabel=document.createElement('label');
    reasonLabel.textContent='Gerekçeli istisnai devir kararı ';
    const reason=document.createElement('textarea');
    reason.required=true;reason.minLength=10;reason.maxLength=500;
    reason.setAttribute('aria-label','İstisnai ad hakkı devri gerekçesi');
    reason.name='reason';
    reasonLabel.append(reason);box.append(reasonLabel);
    const previewBtn=document.createElement('button');
    previewBtn.type='button';previewBtn.dataset.transferPreview=entry.seller_id;
    previewBtn.textContent='Kaynak ve hedefi doğrula';
    const decideBtn=document.createElement('button');
    decideBtn.type='button';decideBtn.disabled=true;
    decideBtn.textContent='Gerekçeli ad hakkı devrini onayla';
    decideBtn.dataset.transferDecide=entry.seller_id;
    const status=document.createElement('p');status.setAttribute('role','status');
    box.prepend(legend);box.append(previewBtn,decideBtn,status);
    let verified=null,uncertain=false,key='';
    const reset=()=>{
      verified=null;decideBtn.disabled=true;status.textContent='Hedefi yeniden doğrulayın.';
    };
    targetApp.oninput=reset;targetSeller.oninput=reset;
    reveal.onclick=()=>{
      box.hidden=!box.hidden;
      if(!box.hidden)targetApp.focus();
    };
    previewBtn.onclick=async()=>{
      if(!targetApp.checkValidity()||!targetSeller.checkValidity()||
         targetSeller.value===entry.seller_id){
        status.textContent='Geçerli ve farklı bir hedef mağaza ve başvuru kimliği girin.';
        return;
      }
      verified=null;decideBtn.disabled=true;previewBtn.disabled=true;
      const previewAt=viewEpoch;
      try{
        const params=new URLSearchParams({
          source_application_id:entry.application_id,source_seller_id:entry.seller_id,
          target_application_id:targetApp.value,target_seller_id:targetSeller.value
        });
        const result=await api('/platform/store-name-transfers?'+params.toString());
        if(previewAt!==viewEpoch||document.hidden)return;
        if(result?.source?.seller_id!==entry.seller_id||
           result?.source?.application_id!==entry.application_id||
           result?.target?.seller_id!==targetSeller.value||
           result?.target?.application_id!==targetApp.value||
           result?.source?.status!=='suspended'||
           typeof result.source.name!=='string'||
           typeof result.source.handle!=='string'||
           typeof result.target.organization_name!=='string'||
           typeof result.target.name!=='string')
          throw new Error('Hedef doğrulanamadı');
        verified=result;uncertain=false;key='';
        status.textContent='Kaynak: '+result.source.organization_name+' / '+result.source.name+
          ' ('+result.source.handle+'). Hedef: '+
          result.target.organization_name+' / '+result.target.name+
          '. Ad ve URL hakkı dışında hiçbir veri taşınmayacak. Kaynak askıda kalacak.';
        decideBtn.disabled=false;
      }catch(e){
        if([401,403].includes(e.httpStatus)){clearStoreApprovals();return}
        status.textContent='Kaynak/hedef yetkisi veya ad hakkı doğrulanamadı; hiçbir karar oluşturulmadı.';
      }finally{previewBtn.disabled=false}
    };
    decideBtn.onclick=async()=>{
      const explanation=reason.value.trim();
      if(!verified||uncertain||explanation.length<10||explanation.length>500||
         [...explanation.matchAll(/[\\p{L}\\p{N}]/gu)].length<10){
        status.textContent='Önce hedefi doğrulayın; 10–500 karakterlik okunabilir gerekçe girin.';
        return;
      }
      if(!window.confirm('Kaynak '+verified.source.name+' mağazasının ad ve URL hakkını '+
        verified.target.organization_name+' / '+verified.target.name+
        ' mağazasına devredilsin mi? Kaynak mağaza askıda kalır; geçmiş veriler devredilmez.'))return;
      decideBtn.disabled=true;previewBtn.disabled=true;
      if(!key)key='dastr_'+crypto.randomUUID().replaceAll('-','');
      const decisionAt=viewEpoch;
      try{
        const result=await api('/platform/store-name-transfers',{method:'POST',body:JSON.stringify({
          transfer_id:key,source_application_id:verified.source.application_id,
          source_seller_id:verified.source.seller_id,
          target_application_id:verified.target.application_id,
          target_seller_id:verified.target.seller_id,
          expected_name:verified.source.name,expected_handle:verified.source.handle,
          reason:explanation
        })});
        if(decisionAt!==viewEpoch||document.hidden)return;
        if(result.transfer_id!==key||result.status!=='assigned'||
           result.native_status!=='suspended'||result.awaiting_source_rename!==true){
          uncertain=true;throw new Error('Sonuç belirsiz');
        }
        status.textContent='Ad hakkı kararı kaydedildi. Eski Store askıdadır; Owner yeni ad ve URL önerip ayrı onay almalıdır.';
        message.textContent=status.textContent;
        void refreshStoreApprovals(true);
      }catch(e){
        if(decisionAt!==viewEpoch||document.hidden)return;
        uncertain=true;
        status.textContent='Devir sonucu belirsiz. Yeniden göndermeyin; denetim kaydını ve güncel mağaza haklarını kontrol edin.';
      }finally{
        previewBtn.disabled=false;
        if(!uncertain&&verified)decideBtn.disabled=false;
      }
    };
    row.append(reveal);list.append(box);
  }
  async function refreshStoreApprovals(keepOutcome=false){
    if(document.hidden||el('workspace').hidden)return;
    const seq=++storeApprovalRequest,epoch=viewEpoch;
    const panel=el('store-approval-panel'),list=el('store-approval-list'),
      suspendedList=el('store-reactivation-list'),message=el('store-approval-status');
    if(!keepOutcome)message.textContent='Mağazalar kontrol ediliyor…';
    try{
      const data=await api('/platform/stores?page='+storeApprovalPage);
      if(seq!==storeApprovalRequest||epoch!==viewEpoch||document.hidden)return;
      if(data.page!==storeApprovalPage||typeof data.has_more!=='boolean'||
         !Array.isArray(data.pending)||data.pending.length>30||
         !Array.isArray(data.suspended)||data.suspended.length>30||
         !Array.isArray(data.reconciliation)||data.reconciliation.length>30||
         !Array.isArray(data.release_pending)||data.release_pending.length>30||
         data.release_pending.some(row=>!/^daapp_[a-f0-9]{32}$/.test(row?.application_id)||
           !/^sel_[A-Za-z0-9_-]+$/.test(row?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(row?.organization_id)||
           typeof row?.organization_name!=='string'||typeof row?.name!=='string'||
           typeof row?.on_hold!=='boolean')||
         data.suspended.some(row=>typeof row?.name_review_required!=='boolean'||
           !/^daapp_[a-f0-9]{32}$/.test(row?.application_id)||
           !/^sel_[A-Za-z0-9_-]+$/.test(row?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(row?.organization_id)||
           typeof row?.organization_name!=='string'||typeof row?.name!=='string'||
           typeof row?.on_hold!=='boolean')||
         data.reconciliation.some(row=>!/^daapp_[a-f0-9]{32}$/.test(row?.application_id)||
           !/^sel_[A-Za-z0-9_-]+$/.test(row?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(row?.organization_id)||
           typeof row?.organization_name!=='string'||typeof row?.name!=='string'||
           typeof row?.on_hold!=='boolean')||
         data.pending.some(row=>!/^daapp_[a-f0-9]{32}$/.test(row?.application_id)||
           !/^sel_[A-Za-z0-9_-]+$/.test(row?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(row?.organization_id)||
           typeof row?.organization_name!=='string'||typeof row?.name!=='string'||
           typeof row?.on_hold!=='boolean'))
        throw new Error('Onay listesi doğrulanamadı');
      panel.hidden=false;list.replaceChildren();suspendedList.replaceChildren();
      el('store-approval-older').hidden=!data.has_more;
      el('store-approval-newer').hidden=storeApprovalPage===0;
      if(!keepOutcome)message.textContent=(data.pending.length||data.suspended.length||data.reconciliation.length||data.release_pending.length)?
        'Mağaza inceleme listesi (sayfa '+(storeApprovalPage+1)+'):':
        data.has_more?'Bu sayfada bekleyen mağaza yok; önceki başvurulara bakın.':'Bu sayfada onay bekleyen mağaza yok.';
      for(const entry of data.pending){
        const line=document.createElement('p'),button=document.createElement('button');
        line.textContent=entry.organization_name+' — '+entry.name+' — '+entry.seller_id+
          (entry.on_hold?' — Yeni mağaza başvuru hakkı kapalı; inceleme bekletiliyor.':'')+' ';
        button.type='button';button.textContent='Mağazayı onayla';
        button.disabled=entry.on_hold;
        button.onclick=async()=>{
          button.disabled=true;
          message.textContent='Mağaza onayı gönderiliyor…';
          try{
            const result=await api('/platform/stores',{method:'POST',
              body:JSON.stringify({application_id:entry.application_id,seller_id:entry.seller_id})});
            if(result.application_id!==entry.application_id||
               result.seller_id!==entry.seller_id||result.status!=='open'){
              const e=new Error('Onay sonucu doğrulanamadı; listeyi kontrol edin.');
              e.uncertain=true;throw e;
            }
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent='Mağaza onaylandı. Kuruluş yetkileri ayrıca denetlenir.';
            void refreshStoreApprovals(true);
          }catch(e){
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent=e.uncertain?
              'Onay sonucu belirsiz; yeniden göndermeyin, listeyi kontrol edin.':
              'Mağaza onaylanamadı: '+e.message;
            if(!e.uncertain)button.disabled=false;
          }
        };
        // A reasoned rejection remains available during a company
        // application pause. Approval remains disabled until policy reopens.
        const reason=document.createElement('textarea');
        reason.setAttribute('aria-label','Mağaza başvurusu ret gerekçesi');
        reason.maxLength=500;
        reason.placeholder='Ret gerekçesi (en az 10 karakter)';
        const reject=document.createElement('button');
        reject.type='button';reject.textContent='Gerekçeyle reddet';
        reject.dataset.storeReject='true';
        reject.onclick=async()=>{
          const explanation=reason.value.trim();
          if(explanation.length<10||explanation.length>500){
            message.textContent='Ret gerekçesi 10–500 karakter olmalıdır.';
            return;
          }
          reject.disabled=true;button.disabled=true;
          message.textContent='Mağaza başvurusu reddediliyor…';
          try{
            const result=await api('/platform/stores',{method:'POST',
              body:JSON.stringify({action:'reject',
                application_id:entry.application_id,seller_id:entry.seller_id,
                reason:explanation})});
            if(result.application_id!==entry.application_id||
               result.seller_id!==entry.seller_id||result.status!=='rejected'){
              const e=new Error('Ret sonucu doğrulanamadı; listeyi kontrol edin.');
              e.uncertain=true;throw e;
            }
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent='Mağaza başvurusu gerekçesiyle reddedildi; mevcut onaylı mağazalar etkilenmedi.';
            void refreshStoreApprovals(true);
          }catch(e){
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent=e.uncertain?
              'Ret sonucu belirsiz; yeniden göndermeyin, listeyi kontrol edin.':
              'Başvuru reddedilemedi: '+e.message;
            if(!e.uncertain){reject.disabled=false;button.disabled=entry.on_hold;}
          }
        };
        line.append(button,reason,reject);list.append(line);
      }
      for(const entry of data.suspended){
        const row=document.createElement('p'),button=document.createElement('button');
        row.textContent=entry.organization_name+' — '+entry.name+' — '+entry.seller_id+
          (entry.name_review_required?
            ' — Ad/URL hakkı doğrulanamadı. İsim veya yetki incelemesi tamamlanmadan bu mağaza açılamaz. ':' ');
        button.type='button';button.textContent='Askı nedeni giderildi, mağazayı yeniden aç';
        button.disabled=entry.name_review_required;
        button.onclick=async()=>{
          // Display state alone never grants native authority: POST performs
          // the current-name/Staff/Store checks again under the Seller lock.
          if(entry.name_review_required)return;
          if(!window.confirm('Askı nedeni giderildi mi? Bu mağazanın ad ve bağlantı hakkı denetlenip aynı Store kimliğiyle açılacaktır.'))return;
          button.disabled=true;message.textContent='Mağaza yeniden açma kararı gönderiliyor…';
          try{
            const result=await api('/platform/stores',{method:'POST',
              body:JSON.stringify({action:'unsuspend',
                application_id:entry.application_id,seller_id:entry.seller_id})});
            if(result.application_id!==entry.application_id||
               result.seller_id!==entry.seller_id||result.status!=='open'||
               result.action!=='unsuspend'){
              const err=new Error('Açma sonucu doğrulanamadı; listeyi kontrol edin.');
              err.uncertain=true;throw err;
            }
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent='Mağaza aynı kimlikle yeniden açıldı. Şirket ve mağaza yetkileri ayrıca denetlenir.';
            void refreshStoreApprovals(true);
          }catch(error){
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent=error.uncertain?
              'Açma sonucu belirsiz; yeniden göndermeyin, güncel listeyi kontrol edin.':
              'Mağaza açılamadı. Ad hakkı veya mağaza onayı değişmiş olabilir; yeniden inceleyin.';
            if(!error.uncertain)button.disabled=false;
          }
        };
        row.append(button);suspendedList.append(row);
        addExceptionalNameTransfer(entry,row,message,suspendedList);
      }
      // This is NOT a second Store opening. The native Store is still
      // suspended and a former claim is unresolved; only an authorized Staff
      // can close that uncertain intent under the shared Seller lock.
      for(const entry of data.release_pending){
        const row=document.createElement('p'),button=document.createElement('button');
        row.textContent=entry.organization_name+' — '+entry.name+
          ' — Mağaza hâlâ askıda; önceki açılma denemesi belirsiz. ';
        button.type='button';button.textContent='Önceki denemeyi güvenle kapat';
        button.onclick=async()=>{
          if(!window.confirm('Mağaza hâlâ askıda mı? Sistem önceki açılma isteğini denetim iziyle kapatır; mağazayı açmaz. Sonrasında ayrı bir yeniden açma kararı verilebilir.'))return;
          button.disabled=true;
          message.textContent='Mağazanın askıda olduğu ve önceki karar kaydı doğrulanıyor…';
          try{
            const result=await api('/platform/stores',{method:'POST',
              body:JSON.stringify({action:'release',
                application_id:entry.application_id,seller_id:entry.seller_id})});
            if(result.application_id!==entry.application_id||
               result.seller_id!==entry.seller_id||result.status!=='suspended'||
               result.action!=='release'){
              const err=new Error('Karar kaydının kapanması doğrulanamadı.');
              err.uncertain=true;throw err;
            }
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent='Önceki belirsiz deneme kayda geçirilerek kapatıldı. Mağaza hâlâ askıda; yetkili görevli yeni bir açma kararı verebilir.';
            void refreshStoreApprovals(true);
          }catch(error){
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent=error.uncertain?
              'Sonuç belirsiz; yeniden göndermeyin, güncel listeyi kontrol edin.':
              'Önceki işlem kapatılamadı; başka bir açılma işlemi devam ediyor olabilir. Mağazanın durumunu kontrol edin.';
            if(!error.uncertain)button.disabled=false;
          }
        };
        row.append(button);suspendedList.append(row);
      }
      for(const entry of data.reconciliation){
        const row=document.createElement('p'),button=document.createElement('button');
        row.textContent=entry.organization_name+' — '+entry.name+
          ' — Mağaza açık; tamamlanma denetim kaydı eksik. ';
        button.type='button';button.textContent='Açılma kararının kaydını doğrula';
        button.onclick=async()=>{
          if(!window.confirm('Mağazanın daha önce açıldığı ve kaynak kararının bulunduğu yeniden denetlenecek. Native açma tekrarlanmayacaktır.'))return;
          button.disabled=true;
          message.textContent='Önceki açılma kararı ve gerçek mağaza durumu doğrulanıyor…';
          try{
            const result=await api('/platform/stores',{method:'POST',
              body:JSON.stringify({action:'reconcile',
                application_id:entry.application_id,seller_id:entry.seller_id})});
            if(result.application_id!==entry.application_id||
               result.seller_id!==entry.seller_id||result.status!=='open'||
               result.action!=='reconcile'){
              const err=new Error('Kayıt tamamlama sonucu belirsiz.');
              err.uncertain=true;throw err;
            }
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent='Açılmış mağazanın karar kaydı ve Owner bildirimi tamamlandı.';
            void refreshStoreApprovals(true);
          }catch(error){
            if(epoch!==viewEpoch||document.hidden)return;
            message.textContent=error.uncertain?
              'Kayıt sonucu belirsiz; yeniden açma yapmayın, güncel listeyi kontrol edin.':
              'Kayıt tamamlanamadı; mağazanın güncel durumunu yetkili görevli incelemelidir.';
            if(!error.uncertain)button.disabled=false;
          }
        };
        row.append(button);suspendedList.append(row);
      }
    }catch(e){
      if(seq!==storeApprovalRequest||epoch!==viewEpoch)return;
      if([401,403].includes(e.httpStatus)){clearStoreApprovals();return}
      panel.hidden=false;list.replaceChildren();suspendedList.replaceChildren();
      message.textContent=keepOutcome?message.textContent+' Liste yenilenemedi.':'Onay listesi güvenli biçimde okunamadı.';
    }
  }
  el('store-approval-refresh').onclick=()=>{storeApprovalPage=0;void refreshStoreApprovals()};
  el('store-approval-older').onclick=()=>{
    if(storeApprovalPage<1000){storeApprovalPage++;void refreshStoreApprovals()}
  };
  el('store-approval-newer').onclick=()=>{
    storeApprovalPage=0;void refreshStoreApprovals()
  };
  let renameReviewRequest=0,renameReviewPage=0;
  function clearStoreRenameReviews(){
    renameReviewRequest++;renameReviewPage=0;
    el('store-rename-review-panel').hidden=true;
    el('store-rename-review-list').replaceChildren();
    el('store-rename-review-status').textContent='';
    el('store-rename-review-older').hidden=true;
    el('store-rename-review-newer').hidden=true;
  }
  async function refreshStoreRenameReviews(keepOutcome=false){
    if(document.hidden||el('workspace').hidden)return;
    const seq=++renameReviewRequest,epoch=viewEpoch;
    const panel=el('store-rename-review-panel');
    const list=el('store-rename-review-list'),message=el('store-rename-review-status');
    if(!keepOutcome)message.textContent='İsim değişikliği başvuruları doğrulanıyor…';
    try{
      const data=await api('/platform/store-renames?page='+renameReviewPage);
      if(seq!==renameReviewRequest||epoch!==viewEpoch||document.hidden||
         el('workspace').hidden)return;
      if(data.page!==renameReviewPage||typeof data.has_more!=='boolean'||
         !Array.isArray(data.pending)||data.pending.length>20||
         data.pending.some(row=>
           !['pending_review','approving'].includes(row?.status)||
           !/^dasrn_[a-f0-9]{32}$/.test(row?.request_id)||
           !/^sel_[A-Za-z0-9_-]+$/.test(row?.seller_id)||
           !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(row?.organization_id)||
           typeof row?.organization_name!=='string'||
           !['open','suspended'].includes(row?.seller_status)||
           typeof row?.old_name!=='string'||typeof row?.old_handle!=='string'||
           typeof row?.proposed_name!=='string'||typeof row?.proposed_handle!=='string'||
           row.old_name.length>300||row.proposed_name.length>300))
        throw new Error('Başvuru listesi doğrulanamadı');
      panel.hidden=false;list.replaceChildren();
      el('store-rename-review-older').hidden=!data.has_more;
      el('store-rename-review-newer').hidden=renameReviewPage===0;
      if(!keepOutcome)message.textContent=data.pending.length?
        'İnceleme bekleyen ad/bağlantı talepleri (sayfa '+(renameReviewPage+1)+'):':
        'Bu sayfada inceleme bekleyen ad değişikliği yok.';
      for(const entry of data.pending){
        const line=document.createElement('div'),summary=document.createElement('p');
        summary.textContent=entry.organization_name+
          (entry.seller_status==='suspended'?' — Askıda (isim onayı mağazayı açmaz)':'')+' — '+entry.old_name+
          ' / '+entry.old_handle+' → '+entry.proposed_name+
          ' / '+entry.proposed_handle;
        if(entry.status==='approving'){
          // Committed claim may already have reached native Mercur.
          // Staff may inspect, never retry or reject this uncertain write.
          summary.textContent+=' — Onay işlemi belirsiz. Yeniden onay veya ret göndermeyin; yetkili uzlaştırma gerekir.';
          line.append(summary);list.append(line);continue;
        }
        const reason=document.createElement('textarea');
        reason.maxLength=500;reason.placeholder='Ret gerekçesi (10–500 karakter)';
        reason.setAttribute('aria-label',entry.organization_name+' için değişiklik ret gerekçesi');
        const reject=document.createElement('button');
        reject.type='button';reject.textContent='Bu değişiklik talebini gerekçeyle reddet';
        reject.onclick=async()=>{
          const explanation=reason.value.trim();
          // Avoid escape ambiguity between the HTML template and UI test harness.
          const slash=String.fromCharCode(92);
          const readable=new RegExp('['+slash+'p{L}'+slash+'p{N}'+slash+'p{Extended_Pictographic}]','u');
          const invisible=new RegExp(slash+'p{Default_Ignorable_Code_Point}','gu');
          let readableCount=0;
          for(const {segment} of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(explanation)){
            if(readable.test(segment.replace(invisible,'')))readableCount++;
          }
          if(explanation.length<10||explanation.length>500||readableCount<10){
            message.textContent='Ret gerekçesi en az 10 okunabilir karakter içermelidir (en fazla 500).';return;
          }
          reject.disabled=true;approve.disabled=true;message.textContent='Ret kararı saklanıyor…';
          try{
            const answer=await api('/platform/store-renames',{
              method:'POST',body:JSON.stringify({action:'reject',
                request_id:entry.request_id,seller_id:entry.seller_id,
                reason:explanation})
            });
            if(seq!==renameReviewRequest||epoch!==viewEpoch||document.hidden)return;
            if(answer.status!=='rejected'||answer.request_id!==entry.request_id||
               answer.seller_id!==entry.seller_id){
              const err=Error('Ret yanıtı doğrulanamadı');err.uncertain=true;throw err;
            }
            message.textContent='Talep reddedildi; mevcut mağaza adı ve bağlantısı değişmedi.';
            void refreshStoreRenameReviews(true);
          }catch(error){
            if(seq!==renameReviewRequest||epoch!==viewEpoch||document.hidden)return;
            message.textContent=error.uncertain?
              'Ret sonucu belirsiz; işlemi tekrarlamayın, listeyi yenileyin.':
              error.httpStatus===409?
                'Talep başka işlemle sonuçlandı; güncel listeyi okuyun.':
                'Ret işlemi doğrulanamadı: '+error.message;
            // After an uncertain outcome or security failure no retry
            // from stale UI; only a fresh staff-authorized read re-enables.
          }
        };
        const approve=document.createElement('button');
        approve.type='button';approve.textContent='Yeni ad ve bağlantıyı onayla';
        approve.setAttribute('aria-label',entry.organization_name+
          ' mağazasının ad ve bağlantı değişikliğini onayla');
        approve.onclick=async()=>{
          if(!confirm(entry.seller_status==='suspended'?
            'Yalnız ad ve bağlantı değişecek. Mağaza askıda kalacak; ayrı yeniden açma kararı gerekir. Eski bağlantı yönlendirilmez. Onaylıyor musunuz?':
            'Bu onay mağazanın adını ve URL bağlantısını birlikte değiştirir. Eski bağlantı yeni adrese yönlendirilmez. Onaylıyor musunuz?'))return;
          approve.disabled=true;reject.disabled=true;
          message.textContent='Mağaza adı ve bağlantısı onaylanıyor…';
          try{
            const answer=await api('/platform/store-renames',{
              method:'POST',body:JSON.stringify({action:'approve',
                request_id:entry.request_id,seller_id:entry.seller_id})
            });
            if(seq!==renameReviewRequest||epoch!==viewEpoch||document.hidden)return;
            if(answer.status!=='approved'||answer.request_id!==entry.request_id||
               answer.seller_id!==entry.seller_id){
              const err=Error('Onay yanıtı doğrulanamadı');err.uncertain=true;throw err;
            }
            message.textContent=entry.seller_status==='suspended'?
              'Yeni ad ve bağlantı onaylandı. Mağaza hâlâ askıda; ayrıca yeniden açma kararı gerekir.':
              'Mağazanın yeni adı ve bağlantısı etkinleşti. Eski bağlantıya yönlendirme yok.';
            void refreshStoreRenameReviews(true);
          }catch(error){
            if(seq!==renameReviewRequest||epoch!==viewEpoch||document.hidden)return;
            message.textContent=error.httpStatus===409?
              'Talep veya yeni ad artık uygun değil; güncel listeyi kontrol edin.':
              'Onay sonucu belirsiz; aynı işlemi tekrarlamayın. Yetkili listeden doğrulayın.';
            // Never re-enable a stale approval after an uncertain native write.
          }
        };
        line.append(summary,reason,reject,approve);list.append(line);
      }
    }catch(error){
      if(seq!==renameReviewRequest||epoch!==viewEpoch)return;
      clearStoreRenameReviews();
      if(![401,403].includes(error.httpStatus)){
        // Private rows stay erased; a fresh GET rechecks current Staff access.
        el('store-rename-review-panel').hidden=false;
        el('store-rename-review-status').textContent=
          'İsim değişikliği başvuruları şu anda doğrulanamıyor. Yeniden deneyin.';
      }
    }
  }
  el('store-rename-review-refresh').onclick=()=>{
    renameReviewPage=0;void refreshStoreRenameReviews();
  };
  el('store-rename-review-older').onclick=()=>{
    if(renameReviewPage<1000){renameReviewPage++;void refreshStoreRenameReviews()}
  };
  el('store-rename-review-newer').onclick=()=>{
    renameReviewPage=0;void refreshStoreRenameReviews();
  };
  async function storeApplications(org,request,role,keepOutcome=false){
    if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
    // Keep the verified Organization role separate from the transient form
    // visibility, which a platform-wide pause can legitimately hide.
    if(!['owner','member'].includes(role))return;
    // The Organization role came from the current verified membership GET.
    // Keep it for a read-only retry even when this first GET is 503/malformed.
    // Each retry rechecks live server permission; 401/403 still fail closed.
    applicationRole=role;
    const sequence=++applicationRequest;
    const panel=el('store-application-panel'),list=el('store-application-list'),message=el('store-application-status');
    panel.hidden=false;
    el('store-application-form').hidden=true;
    el('store-draft-form').hidden=true;
    list.replaceChildren();if(!keepOutcome)message.textContent='Başvurular kontrol ediliyor…';
    try{
      const result=await api('/organization/store-applications?organization_id='+encodeURIComponent(org));
      if(request!==organizationRequest||sequence!==applicationRequest||currentOrg!==org||document.hidden)return;
      if(typeof result.store_application_enabled!=='boolean'||
         !Array.isArray(result.drafts)||result.drafts.length>30||
         typeof result.has_more_drafts!=='boolean'||
         result.drafts.some(d=>!/^dasdraft_[a-f0-9]{32}$/.test(d?.id)||
           typeof d.name!=='string'||typeof d.email!=='string'||
           typeof d.currency_code!=='string'||!Number.isSafeInteger(d.version)||d.version<1)||
         result.draft_role!==role||
         !Array.isArray(result.applications)||result.applications.length>30||
        result.applications.some(a=>!/^daapp_[a-f0-9]{32}$/.test(a?.id)||!['reserved','creating','created'].includes(a?.status)||
          !(a.seller_id===null||a.seller_id===undefined||typeof a.seller_id==='string')||
          !['pending_approval','open','suspended','terminated','unknown'].includes(a?.seller_status)||
          !(a.rejection_reason===null||typeof a.rejection_reason==='string'&&a.rejection_reason.length<=500)))
        throw new Error('Başvuru yanıtı doğrulanamadı');
      // A Member receives only unfinished drafts, never official applications.
      if(role==='member'&&result.applications.length!==0)throw new Error('Başvuru kapsamı geçersiz');
      for(const a of result.applications){
        const line=document.createElement('p');
        const resultLabel=a.status!=='created'?'Başvuru işlem sonucu kontrol edilmeli':
          a.seller_status==='pending_approval'?'Mağaza başvurusu onay bekliyor':
          a.seller_status==='open'?'Mağaza onaylandı':
          a.seller_status==='suspended'?'Mağaza askıya alındı':
          a.seller_status==='terminated'?'Mağaza başvurusu reddedildi':
          'Başvurunun güncel mağaza sonucu doğrulanamadı';
        line.textContent=resultLabel+' — '+a.id+
          (a.seller_id?' — '+a.seller_id:'')+
          (a.seller_status==='terminated'&&a.rejection_reason?
            ' — Ret gerekçesi: '+a.rejection_reason:'');
        list.append(line);
      }
      if(['owner','member'].includes(role)){
        for(const d of result.drafts){
          const line=document.createElement('p'),edit=document.createElement('button');
          line.textContent='Kaydedilmiş mağaza taslağı (gönderilmedi) — '+d.name+' — v'+d.version+' ';
          edit.type='button';edit.textContent='Taslağı düzenle';
          edit.onclick=()=>{
            if(currentOrg!==org||organizationRequest!==request||document.hidden)return;
            const form=el('store-draft-form');
            form.elements.namedItem('name').value=d.name;
            form.elements.namedItem('email').value=d.email;
            form.elements.namedItem('currency_code').value=d.currency_code;
            storeDraftKey=d.id;storeDraftVersion=d.version;storeDraftEditEpoch++;
            form.querySelector('button[type=submit]').disabled=false;
            message.textContent='Taslak düzenleniyor; değişiklikler henüz kaydedilmedi.';
          };
          line.append(edit);
          if(role==='owner'&&result.store_application_enabled){
            const send=document.createElement('button');
            send.type='button';send.textContent='Bu taslağı resmî başvuruya gönder';
            send.onclick=async()=>{
              if(send.disabled||currentOrg!==org||organizationRequest!==request||
                 sequence!==applicationRequest||document.hidden)return;
              send.disabled=true;
              const appId='daapp_'+crypto.randomUUID().replace(/-/g,'');
              try{
                const outcome=await api('/organization/store-applications',{method:'POST',body:JSON.stringify({
                  action:'submit_draft',organization_id:org,draft_id:d.id,
                  expected_version:d.version,application_id:appId
                })});
                if(currentOrg!==org||organizationRequest!==request||
                   sequence!==applicationRequest)return;
                if(outcome.application_id!==appId||outcome.draft_id!==d.id||
                   outcome.status!=='pending_approval'){
                  const err=new Error('Başvurunun sonucu belirsiz; kayıtları yenileyin.');
                  err.uncertain=true;throw err;
                }
                message.textContent='Taslak başvuruya gönderildi. Mağaza platform onayını bekliyor.';
                void storeApplications(org,request,'owner',true);
              }catch(err){
                if(currentOrg!==org||organizationRequest!==request||
                   sequence!==applicationRequest)return;
                if(err.httpStatus===409){
                  message.textContent='Taslak başka işlemle değişti veya gönderildi. Güncel kayıtları yenileyin.';
                  void storeApplications(org,request,'owner',true);
                  return;
                }
                message.textContent=err.uncertain?
                  'Başvuru sonucu belirsiz. Tekrar göndermeyin; kayıtları yenileyin.':
                  err.httpStatus===403?
                    'Gönderim reddedildi. Korunan Owner ve güncel MFA ile yeniden giriş gerekli.':
                    'Başvuru gönderilemedi: '+err.message;
                if(!err.uncertain)send.disabled=false;
              }
            };
            line.append(send);
          }
          list.append(line);
        }
        if(result.has_more_drafts){
          const warning=document.createElement('p');
          warning.textContent='Daha eski taslaklar da bulunuyor; bu görünüm son 30 kaydı listeler.';
          list.append(warning);
        }
      }
      el('store-draft-form').hidden=false;
      el('store-application-form').hidden=
        role!=='owner'||!result.store_application_enabled;
      if(!result.store_application_enabled){
        const paused='Platform tarafından yeni mağaza başvuruları durduruldu. Önceki başvurular korunuyor; mevcut faal mağazalar etkilenmez.';
        // A draft can still be saved during a platform pause. Preserve its
        // confirmed outcome instead of immediately overwriting it with the
        // separate submission-disabled warning on the list refresh.
        message.textContent=keepOutcome&&message.textContent?
          message.textContent+' '+paused:paused;
      }else if(!keepOutcome){
        message.textContent=result.applications.length?
          'Başvurular güncellendi; mağaza onayı ayrı yürütülür.':
          'Henüz mağaza başvurusu bulunmuyor.';
      }
    }catch(e){
      if(request!==organizationRequest||sequence!==applicationRequest||currentOrg!==org)return;
      list.replaceChildren();
      if(e.httpStatus===401){concealPrivateView();el('login').hidden=false;return}
      if(e.httpStatus===403){
        panel.hidden=true;el('store-draft-form').hidden=true;
        el('store-application-form').hidden=true;
        applicationRole='';storeDraftKey='';storeDraftVersion=0;storeDraftEditEpoch++;
        const form=el('store-draft-form');form.reset();
        status('Bu şirketin mağaza taslaklarına erişim izniniz yok.');
        return;
      }
      message.textContent=keepOutcome?message.textContent+' Başvuru listesi şu anda yenilenemedi.':'Başvurular güvenli biçimde okunamadı.';
    }
  }
  let applicationRequest=0,applicationKey='',applicationRole='';
  let storeDraftKey='',storeDraftVersion=0,storeDraftEditEpoch=0;
  el('store-applications-refresh').onclick=()=>{
    if(currentOrg&&['owner','member'].includes(applicationRole))
      void storeApplications(currentOrg,organizationRequest,applicationRole);
  };
  el('store-draft-new').onclick=()=>{
    const form=el('store-draft-form');
    if(form.hidden||!currentOrg||document.hidden)return;
    storeDraftKey='';storeDraftVersion=0;storeDraftEditEpoch++;form.reset();
    form.querySelector('button[type=submit]').disabled=false;
    el('store-application-status').textContent='Yeni bir mağaza taslağı hazırlanıyor.';
  };
  el('store-draft-form').onsubmit=async event=>{
    event.preventDefault();
    const org=currentOrg,request=organizationRequest,form=event.currentTarget;
    if(!org||document.hidden||form.hidden||!['owner','member'].includes(applicationRole))return;
    const submit=form.querySelector('button[type=submit]');submit.disabled=true;
    if(!storeDraftKey)storeDraftKey='dasdraft_'+crypto.randomUUID().replace(/-/g,'');
    const key=storeDraftKey,version=storeDraftVersion,editEpoch=storeDraftEditEpoch,fields=new FormData(form);
    try{
      const result=await api('/organization/store-applications',{method:'POST',body:JSON.stringify({
        action:'save_draft',organization_id:org,draft_id:key,expected_version:version,
        name:String(fields.get('name')||'').trim(),email:String(fields.get('email')||'').trim(),
        currency_code:String(fields.get('currency_code')||'').toLowerCase()
      })});
      if(request!==organizationRequest||currentOrg!==org||
         storeDraftKey!==key||storeDraftEditEpoch!==editEpoch)return;
      if(result.draft_id!==key||result.status!=='draft'||result.version!==version+1){
        const e=new Error('Taslak kaydı doğrulanamadı; önce kayıtları yenileyin.');
        e.uncertain=true;throw e;
      }
      storeDraftVersion=result.version;submit.disabled=false;
      el('store-application-status').textContent='Taslak kaydedildi. Henüz başvuru gönderilmedi veya mağaza oluşturulmadı.';
      void storeApplications(org,request,applicationRole,true);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org||
         storeDraftKey!==key||storeDraftEditEpoch!==editEpoch)return;
      if(e.httpStatus===403){
        el('store-application-panel').hidden=true;
        el('store-draft-form').hidden=true;
        el('store-application-list').replaceChildren();
        form.reset();storeDraftKey='';storeDraftVersion=0;storeDraftEditEpoch++;
        applicationRole='';status('Taslak izniniz iptal edildi veya erişiminiz sona erdi.');
        return;
      }
      el('store-application-status').textContent=e.uncertain?
        'Taslak sonucu belirsiz; tekrar kaydetmeden önce kayıtları yenileyin.':
        'Taslak kaydedilemedi: '+e.message;
      if(!e.uncertain)submit.disabled=false;
    }
  };
  el('store-application-form').onsubmit=async event=>{
    event.preventDefault();
    const org=currentOrg,request=organizationRequest,form=event.currentTarget;
    if(!org||document.hidden)return;
    const button=form.querySelector('button');button.disabled=true;
    if(!applicationKey)applicationKey='daapp_'+crypto.randomUUID().replace(/-/g,'');
    const v=new FormData(form);
    try{
      const data=await api('/organization/store-applications',{method:'POST',body:JSON.stringify({
        organization_id:org,application_id:applicationKey,
        name:String(v.get('name')||'').trim(),email:String(v.get('email')||''),
        currency_code:String(v.get('currency_code')||'').toLowerCase()
      })});
      if(request!==organizationRequest||currentOrg!==org)return;
      if(data.application_id!==applicationKey||data.status!=='pending_approval')
        throw new Error('Başvuru sonucu doğrulanamadı');
      applicationKey='';form.reset();button.disabled=false;
      el('store-application-status').textContent='Başvuru kaydedildi. Mağazanın açılması platform yöneticisinin onayını bekliyor.';
      // Refresh the list without replacing the confirmed submission outcome.
      void storeApplications(org,request,'owner',true);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      el('store-application-status').textContent=e.uncertain?
        'Sonuç belirsiz; yeni başvuru göndermeyin. Başvuru listesinden durumu kontrol edin.':
        'Başvuru reddedildi: '+e.message;
      if(!e.uncertain){applicationKey='';button.disabled=false}
    }
  };

  let storeDraftPermissionRequest=0,storeDraftCursor='',storeDraftNextCursor=null;
  const storeDraftCursorHistory=[];
  let storeDraftGrantable=new Set(),storeDraftRevocable=new Set();
  let storeDraftPermissionsVerified=false,storeDraftWritePending=false,storeDraftWriteUncertain=false;
  function updateStoreDraftActionButtons(){
    const form=el('store-draft-grants-form');
    const select=form?.elements?.namedItem?.('membership_id');
    const value=select?.selectedOptions?.[0]?.disabled?null:select?.value;
    const permitted=!!value&&storeDraftPermissionsVerified&&
      !storeDraftWritePending&&!storeDraftWriteUncertain&&!document.hidden&&
      !el('workspace').hidden&&!el('store-draft-grants-panel').hidden;
    form.querySelector('button[value=grant]').disabled=
      !permitted||!storeDraftGrantable.has(value);
    form.querySelector('button[value=revoke]').disabled=
      !permitted||!storeDraftRevocable.has(value);
  }
  function clearStoreDraftPermissions(){
    storeDraftPermissionRequest++;
    storeDraftGrantable.clear();storeDraftRevocable.clear();
    storeDraftPermissionsVerified=false;storeDraftWritePending=false;
    storeDraftWriteUncertain=false;
    storeDraftCursor='';storeDraftNextCursor=null;storeDraftCursorHistory.length=0;
    el('store-draft-grants-older').hidden=true;el('store-draft-grants-newer').hidden=true;
    el('store-draft-grants-panel').hidden=true;
    el('store-draft-grants-status').textContent='';
    el('store-draft-grants-list').replaceChildren();
    const form=el('store-draft-grants-form');
    // Preserve private concealment in both actual browsers and the existing
    // reduced DOM regression harness (which need not implement forms API).
    if(form && form.elements && typeof form.elements.namedItem==='function'){
      const select=form.elements.namedItem('membership_id');
      if(select && typeof select.replaceChildren==='function')select.replaceChildren();
    }
    if(form && typeof form.querySelectorAll==='function')
      for(const button of form.querySelectorAll('button'))button.disabled=true;
  }
  async function storeDraftPermissions(org,request,keepOutcome=false){
    if(request!==organizationRequest||currentOrg!==org||document.hidden||
       el('workspace').hidden)return;
    const seq=++storeDraftPermissionRequest;
    storeDraftPermissionsVerified=false;
    const panel=el('store-draft-grants-panel'),form=el('store-draft-grants-form');
    const list=el('store-draft-grants-list'),message=el('store-draft-grants-status');
    panel.hidden=true;
    if(!keepOutcome)message.textContent='Çalışan taslak izinleri kontrol ediliyor…';
    try{
      const data=await api('/organization/store-draft-permissions?organization_id='+encodeURIComponent(org)+
        (storeDraftCursor?'&after='+encodeURIComponent(storeDraftCursor):''));
      if(seq!==storeDraftPermissionRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden)return;
      if(!Array.isArray(data.members)||!Array.isArray(data.grants)||
         data.members.length>30||data.grants.length>30||
         typeof data.has_more!=='boolean'||
         !(data.next_cursor===null||
           (typeof data.next_cursor==='string'&&
             /^[A-Za-z0-9_-]{1,128}$/.test(data.next_cursor)))||
         data.has_more!==(data.next_cursor!==null)||
         (data.has_more&&data.next_cursor!==data.members.at(-1)?.membership_id)||
         data.members.some(m=>typeof m.label_unique_in_organization!=='boolean'||
           typeof m.other_active_grant_same_label!=='boolean'||
           !(m.mobile_phone===null||
             (typeof m.mobile_phone==='string'&&/^[+]?[0-9]{6,20}$/.test(m.mobile_phone)))||
           !(m.member_name===null||
           (typeof m.member_name==='string'&&m.member_name.trim().length>0&&m.member_name.length<=160))||
           !(m.invitation_email===null||
             (typeof m.invitation_email==='string'&&
              m.invitation_email.includes('@')&&m.invitation_email.length<=254))||
           typeof m.person_id!=='string'||
           !/^daprs_[A-Za-z0-9_-]+$/.test(m.person_id)||
           typeof m.membership_id!=='string'||
           !/^[A-Za-z0-9_-]{1,128}$/.test(m.membership_id))||
         data.grants.some(g=>typeof g.id!=='string'||
           !/^dasdpg_[A-Za-z0-9_-]+$/.test(g.id)||
           typeof g.person_id!=='string'||!/^daprs_[A-Za-z0-9_-]+$/.test(g.person_id)||
           typeof g.membership_id!=='string'||
           !/^[A-Za-z0-9_-]{1,128}$/.test(g.membership_id))||
         new Set(data.members.map(m=>m.membership_id)).size!==data.members.length||
         new Set(data.members.map(m=>m.person_id)).size!==data.members.length||
         new Set(data.grants.map(g=>g.person_id)).size!==data.grants.length||
         data.grants.some(g=>!data.members.some(m=>
           m.person_id===g.person_id&&m.membership_id===g.membership_id)))
        throw new Error('İzin bilgileri doğrulanamadı');
      const select=form.elements.namedItem('membership_id'),previous=select.value;
      select.replaceChildren();list.replaceChildren();
      storeDraftGrantable.clear();storeDraftRevocable.clear();
      // Display only authorized, human-readable Organization identities.
      // Ambiguous or absent labels must never cause a misdirected grant.
      const labelFor=m=>[m.member_name,m.invitation_email,
         m.mobile_phone?'Cep: '+m.mobile_phone:null].filter(Boolean).join(' — ');
      const labelCounts=new Map();
      for(const m of data.members){
        const label=labelFor(m);if(label)labelCounts.set(label,(labelCounts.get(label)||0)+1);
      }
      for(const m of data.members){
        const label=labelFor(m);
        const identifiable=!!label&&(!!m.mobile_phone||!!m.invitation_email)&&
          m.label_unique_in_organization===true&&
          labelCounts.get(label)===1;
        const granted=data.grants.some(g=>g.person_id===m.person_id&&
          g.membership_id===m.membership_id);
        if(identifiable)storeDraftGrantable.add(m.membership_id);
        // A single currently granted Person may be safely revoked after
        // a late ungranted namesake joins. Two indistinguishable ACTIVE
        // recipients, even on different pages, must never be individually
        // revocable: the Owner cannot tell whose private access would end.
        const revocable=granted&&m.other_active_grant_same_label===false;
        if(revocable)storeDraftRevocable.add(m.membership_id);
        const option=document.createElement('option');
        option.value=m.membership_id;
        option.disabled=!(identifiable||revocable);
        option.textContent=identifiable?label:granted&&
          m.other_active_grant_same_label?
          (label||'Adı doğrulanamayan çalışan')+
          ' — aynı kimlikle birden fazla etkin izin; tek tek iptal edilemez':
          granted?(label||'Adı doğrulanamayan çalışan')+
          ' — kimlik belirsiz; yalnız mevcut izni kaldırabilirsiniz':
          'Çalışanın kimliği ayırt edilemiyor; yeni izin verilemez';
        select.append(option);
        const line=document.createElement('p');
        line.textContent=option.textContent+' — taslak: '+(granted?'Yetkili':'Yetkisiz')+
          ' (kişisel izin; resmî gönderim yalnız Owner)';
        list.append(line);
      }
      const selected=Array.from(select.options).find(o=>o.value===previous&&!o.disabled);
      if(selected)select.value=previous;
      else select.selectedIndex=Array.from(select.options).findIndex(o=>!o.disabled);
      // A choice may revoke a verified active grant while being ineligible
      // for a new grant. Selection changes recompute each action separately.
      select.onchange=updateStoreDraftActionButtons;
      storeDraftNextCursor=data.next_cursor;
      el('store-draft-grants-older').hidden=!data.has_more;
      el('store-draft-grants-newer').hidden=storeDraftCursorHistory.length===0;
      panel.hidden=false;
      storeDraftPermissionsVerified=true;
      storeDraftWritePending=false;storeDraftWriteUncertain=false;
      updateStoreDraftActionButtons();
      if(!keepOutcome)message.textContent=data.members.length?
        'Üyelerin güncel kişisel taslak izinleri gösteriliyor.':
        'Şirkette yetki verilebilecek etkin üye bulunmuyor.';
    }catch(e){
      if(seq!==storeDraftPermissionRequest||request!==organizationRequest||currentOrg!==org)return;
      clearStoreDraftPermissions();
      message.textContent='Çalışan taslak izinleri güvenle okunamadı.';
    }
  }
  el('store-draft-grants-refresh').onclick=()=>{
    if(currentOrg)void storeDraftPermissions(currentOrg,organizationRequest);
  };
  el('store-draft-grants-older').onclick=()=>{
    if(!currentOrg||!storeDraftNextCursor||document.hidden)return;
    storeDraftCursorHistory.push(storeDraftCursor);
    storeDraftCursor=storeDraftNextCursor;storeDraftNextCursor=null;
    void storeDraftPermissions(currentOrg,organizationRequest);
  };
  el('store-draft-grants-newer').onclick=()=>{
    if(!currentOrg||!storeDraftCursorHistory.length||document.hidden)return;
    storeDraftCursor=storeDraftCursorHistory.pop();
    storeDraftNextCursor=null;
    void storeDraftPermissions(currentOrg,organizationRequest);
  };
  el('store-draft-grants-form').onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden)return;
    const org=currentOrg,request=organizationRequest,form=event.currentTarget;
    const action=event.submitter?.value;
    if(!org||!['grant','revoke'].includes(action)||
       storeDraftWritePending||storeDraftWriteUncertain||!storeDraftPermissionsVerified)return;
    const chosen=form.elements.namedItem('membership_id');
    const membership_id=chosen.value;
    const allowed=chosen.selectedIndex>=0&&!chosen.selectedOptions[0]?.disabled&&
      (action==='grant'?storeDraftGrantable:storeDraftRevocable).has(membership_id);
    if(!allowed){
      el('store-draft-grants-status').textContent=
        'Yeni izin için çalışan ayırt edilebilir olmalı; mevcut izin yalnız kayıtlı üyelikten kaldırılabilir.';
      updateStoreDraftActionButtons();
      return;
    }
    storeDraftWritePending=true;
    updateStoreDraftActionButtons();
    try{
      const result=await api('/organization/store-draft-permissions',{method:'POST',
        body:JSON.stringify({action,organization_id:org,membership_id})});
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(result.status!==(action==='grant'?'active':'revoked')||
         !(result.grant_id===null||
           (typeof result.grant_id==='string'&&/^dasdpg_[A-Za-z0-9_-]+$/.test(result.grant_id)))){
        const e=new Error('İzin sonucu belirsiz');e.uncertain=true;throw e;
      }
      el('store-draft-grants-status').textContent=action==='grant'?
        'Çalışana taslak düzenleme izni verildi. Başvuru gönderme hakkı verilmedi.':
        'Çalışanın taslak düzenleme izni kaldırıldı. Şirket taslakları korundu.';
      storeDraftWritePending=false;
      void storeDraftPermissions(org,request,true);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      storeDraftWritePending=false;
      storeDraftWriteUncertain=!!e.uncertain;
      // An uncertain or denied write needs a fresh authorized read before
      // the next attempt; neither error may enable a stale grant button.
      storeDraftPermissionsVerified=false;
      updateStoreDraftActionButtons();
      el('store-draft-grants-status').textContent=e.uncertain?
        'İzin sonucu belirsiz; işlemi tekrarlamadan önce izinleri yenileyin.':
        'İzin işlemi reddedildi; yeniden denemeden önce izinleri yenileyin.';
    }
  };

  // Store Buyer Organization policy remains separate from member permissions.
  // Only this selected legal Organization's Owner sees the controls; the
  // server independently checks fresh Owner, verified Store origin and native
  // Seller/Member before every write. Visibility is NOT authorization.
  let storeBlockRequest=0,priceGroupListRequest=0,priceGroupActionRequest=0;
  let priceGroupActionPending=false,priceGroupCurrentAction=null;
  const priceGroupUncertain=new Map();
  const priceGroupWarning='Önceki mağazadaki işlem veya önceki grup/alıcı seçimi sonuçlanmış olabilir. İlgili kaydı kontrol edin.';
  function showPriceGroupStatus(value=''){
    const warning=priceGroupUncertain.size?priceGroupWarning:'';
    el('store-price-group-status').textContent=
      value&&warning?value+' '+warning:value||warning;
  }
  function clearStoreBlock(){
    storeBlockRequest++;priceGroupActionRequest++;
    priceGroupActionPending=false;priceGroupCurrentAction=null;
    // Never carry an earlier Person/Organization's private outcome across
    // the permission boundary or after workspace concealment.
    priceGroupUncertain.clear();
    el('store-price-group-panel').hidden=true;
    el('store-price-group-status').textContent='';
    clearStorePriceGroupChoices();
    const gf=el('store-price-group-form');
    const gs=gf?.elements&&typeof gf.elements.namedItem==='function'?
      gf.elements.namedItem('seller_id'):null;
    if(gs&&typeof gs.replaceChildren==='function')gs.replaceChildren();
    if(gf&&typeof gf.querySelectorAll==='function')
      for(const button of gf.querySelectorAll('button'))button.disabled=true;
    if(gf&&typeof gf.reset==='function')gf.reset();
    const panel=el('store-block-panel'),form=el('store-block-form');
    if(panel)panel.hidden=true;
    const msg=el('store-block-status');if(msg)msg.textContent='';
    if(form&&typeof form.querySelectorAll==='function'){
      for(const select of form.querySelectorAll('select'))select.replaceChildren();
      for(const button of form.querySelectorAll('button'))button.disabled=true;
      if(typeof form.reset==='function')form.reset();
    }
  }
  // This picker is convenience only; the existing grant endpoint still
  // verifies the current native Seller->CustomerGroup link on every write.
  function clearStorePriceGroupChoices(){
    priceGroupListRequest++;
    const choice=el('store-price-group-choice');
    if(choice&&typeof choice.replaceChildren==='function'){
      choice.replaceChildren();choice.disabled=true;
    }
    const msg=el('store-price-group-options-status');
    if(msg)msg.textContent='';
    const form=el('store-price-group-form');
    const field=form?.elements&&typeof form.elements.namedItem==='function'?
      form.elements.namedItem('customer_group_id'):null;
    if(field)field.value='';
  }
  async function storePriceGroupChoices(org,seller_id,request){
    clearStorePriceGroupChoices();
    if(request!==organizationRequest||currentOrg!==org||
       document.hidden||el('workspace').hidden||
       !/^sel_[A-Za-z0-9_-]+$/.test(seller_id))return;
    // A Store change invalidates the old UI action, not the server write.
    // Its result may be committed: never call the previous action cancelled.
    if(priceGroupActionPending&&priceGroupCurrentAction){
      const older=priceGroupUncertain.get(priceGroupCurrentAction.key);
      if(!older||(older.kind==='read'&&priceGroupCurrentAction.kind!=='read'))
        priceGroupUncertain.set(priceGroupCurrentAction.key,priceGroupCurrentAction);
    }
    ++priceGroupActionRequest;
    priceGroupActionPending=false;priceGroupCurrentAction=null;
    const actionForm=el('store-price-group-form');
    if(actionForm)for(const button of actionForm.querySelectorAll('button'))
      button.disabled=false;
    // The warning survives A->B->A and other switches until the same
    // scoped record has been rechecked after its original request settled.
    showPriceGroupStatus();
    const seq=priceGroupListRequest;
    const choice=el('store-price-group-choice'),
      message=el('store-price-group-options-status');
    if(!choice||!message)return;
    message.textContent='Bu mağazanın müşteri grupları kontrol ediliyor…';
    try{
      const data=await api('/organization/store-price-groups?'+new URLSearchParams({
        organization_id:org,seller_id,view:'list'
      }).toString());
      if(seq!==priceGroupListRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden||
         el('store-price-group-form')?.elements?.namedItem('seller_id')?.value!==seller_id)return;
      if(data.organization_id!==org||data.seller_id!==seller_id||
         !Array.isArray(data.groups)||data.groups.length>100||
         data.groups.some(g=>typeof g?.id!=='string'||
           !/^cusgroup_[A-Za-z0-9_-]+$/.test(g.id)||
           typeof g.name!=='string'||g.name.length>160)||
         new Set(data.groups.map(g=>g.id)).size!==data.groups.length)
        throw Error('Grup yanıtı doğrulanamadı');
      const options=document.createDocumentFragment();
      const blank=document.createElement('option');
      blank.value='';blank.textContent='Grup seçin';options.append(blank);
      for(const group of data.groups){
        const option=document.createElement('option');
        option.value=group.id;option.textContent=group.name;options.append(option);
      }
      choice.replaceChildren(options);
      choice.disabled=data.groups.length===0;
      message.textContent=data.groups.length?
        'Bu mağazanın gruplarından birini seçin; seçim başka mağazada geçerli değildir.':
        'Bu mağazada seçilebilir müşteri grubu bulunamadı.';
    }catch(e){
      if(seq!==priceGroupListRequest||request!==organizationRequest||currentOrg!==org)return;
      choice.replaceChildren();choice.disabled=true;
      message.textContent='Mağaza grupları yetki nedeniyle yüklenemedi.';
    }
  }
  const priceGroupChoice=el('store-price-group-choice');
  if(priceGroupChoice)priceGroupChoice.onchange=()=>{
    const field=el('store-price-group-form')?.elements?.namedItem('customer_group_id');
    if(field)field.value=/^cusgroup_[A-Za-z0-9_-]+$/.test(priceGroupChoice.value)?
      priceGroupChoice.value:'';
  };
  async function storeBlockStores(org,request){
    if(request!==organizationRequest||currentOrg!==org||
      document.hidden||el('workspace').hidden)return;
    const seq=++storeBlockRequest,panel=el('store-block-panel');
    const form=el('store-block-form'),msg=el('store-block-status');
    if(!panel||!form||!form.elements)return;
    panel.hidden=true;msg.textContent='Mağaza izinleri kontrol ediliyor…';
    try{
      const data=await api('/organization/stores?organization='+encodeURIComponent(org));
      if(seq!==storeBlockRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden)return;
      if(data.organization_id!==org||!Array.isArray(data.stores)||
         data.stores.length>50||
         data.stores.some(s=>typeof s.id!=='string'||
           !/^sel_[A-Za-z0-9_-]+$/.test(s.id)||typeof s.name!=='string')||
         new Set(data.stores.map(s=>s.id)).size!==data.stores.length)
        throw new Error('Mağazalar doğrulanamadı');
      const select=form.elements.namedItem('seller_id');
      select.replaceChildren();
      for(const store of data.stores){
        const option=document.createElement('option');
        option.value=store.id;option.textContent=store.name;select.append(option);
      }
      for(const button of form.querySelectorAll('button'))
        button.disabled=data.stores.length===0;
      panel.hidden=data.stores.length===0;
      const gf=el('store-price-group-form');
      const gs=gf?.elements&&typeof gf.elements.namedItem==='function'?
        gf.elements.namedItem('seller_id'):null;
      if(gs&&typeof gs.replaceChildren==='function'){
        gs.replaceChildren();
        for(const option of select.options)gs.append(option.cloneNode(true));
        for(const button of gf.querySelectorAll('button'))button.disabled=data.stores.length===0;
        el('store-price-group-panel').hidden=data.stores.length===0;
        gs.onchange=()=>storePriceGroupChoices(org,gs.value,request);
        if(data.stores.length)void storePriceGroupChoices(org,gs.value,request);
      }
      msg.textContent=data.stores.length?
        'Yalnız kendi mağazanız için alıcı kuruluş engeli koyabilirsiniz.':
        'Onaylı mağaza bulunamadı.';
    }catch(e){
      if(seq!==storeBlockRequest||request!==organizationRequest||currentOrg!==org)return;
      panel.hidden=true;
      msg.textContent='Mağaza politikası yönetme izniniz doğrulanamadı.';
    }
  }
  const storeBlockForm=el('store-block-form');
  if(storeBlockForm)storeBlockForm.onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden)return;
    const request=organizationRequest,org=currentOrg,form=event.currentTarget;
    const action=event.submitter?.value;
    if(!org||!['block','unblock'].includes(action))return;
    const seller_id=form.elements.namedItem('seller_id')?.value;
    const buyer_organization_id=String(
      form.elements.namedItem('buyer_organization_id')?.value||'').trim();
    if(!/^sel_[A-Za-z0-9_-]+$/.test(seller_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(buyer_organization_id))return;
    const msg=el('store-block-status');
    for(const button of form.querySelectorAll('button'))button.disabled=true;
    msg.textContent='Mağaza politikası sunucuda doğrulanıyor…';
    try{
      const result=await api('/organization/store-buyer-blocks',{method:'POST',body:JSON.stringify({
        action,organization_id:org,seller_id,buyer_organization_id
      })});
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(result.status!==(action==='block'?'blocked':'unblocked'))
        throw new Error('Yanıt doğrulanamadı');
      msg.textContent=action==='block'?
        'Alıcı kuruluş bu mağazada engellendi.':
        'Bu mağazadaki alıcı kuruluş engeli kaldırıldı.';
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      msg.textContent=e.uncertain?
        'Sonuç belirsiz. Yeniden işlem göndermeden önce yetkili kayıt kontrolü gerekli.':
        'İşlem reddedildi; mağaza politikasını değiştiremediniz.';
    }finally{
      if(request===organizationRequest&&currentOrg===org&&!document.hidden)
        for(const button of form.querySelectorAll('button'))button.disabled=false;
    }
  };

  const priceGroupForm=el('store-price-group-form');
  if(priceGroupForm)priceGroupForm.onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden)return;
    const request=organizationRequest,org=currentOrg,form=event.currentTarget;
    const action=event.submitter?.value;
    if(!org||!['grant','revoke','read'].includes(action))return;
    const seller_id=form.elements.namedItem('seller_id')?.value;
    const customer_group_id=String(form.elements.namedItem('customer_group_id')?.value||'').trim();
    const buyer_organization_id=String(form.elements.namedItem('buyer_organization_id')?.value||'').trim();
    if(!/^sel_[A-Za-z0-9_-]+$/.test(seller_id)||
       !/^cusgroup_[A-Za-z0-9_-]+$/.test(customer_group_id)||
       !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(buyer_organization_id))return;
    const key=JSON.stringify([org,seller_id,customer_group_id,buyer_organization_id]);
    // A Store switch only unlocks OTHER scopes. It must not permit a
    // duplicate grant/revoke while this exact record's outcome is unknown.
    const previous=priceGroupUncertain.get(key);
    if(action!=='read'&&((previous&&previous.kind!=='read')||
       (priceGroupActionPending&&priceGroupCurrentAction?.key===key&&
        priceGroupCurrentAction.kind!=='read'))){
      showPriceGroupStatus('Bu kayıt için önceki değişiklik henüz doğrulanmadı. Yeni işlem göndermeden önce sonucu kontrol edin.');
      return;
    }
    // An old GET is not a write and cannot bar a new authorized change.
    if(action!=='read'&&previous?.kind==='read')priceGroupUncertain.delete(key);
    const seq=++priceGroupActionRequest;
    const currentAction={key,settled:false,kind:action};
    const sameSelection=()=>form.elements.namedItem('seller_id')?.value===seller_id&&
      String(form.elements.namedItem('customer_group_id')?.value||'').trim()===customer_group_id&&
      String(form.elements.namedItem('buyer_organization_id')?.value||'').trim()===buyer_organization_id;
    // A read begun before an older write settles cannot clear an unknown
    // outcome: it could have observed the old state before the write commits.
    const recheck=action==='read'&&priceGroupUncertain.get(key)?.settled===true?
      priceGroupUncertain.get(key):null;
    priceGroupCurrentAction=currentAction;
    priceGroupActionPending=true;
    for(const button of form.querySelectorAll('button'))button.disabled=true;
    showPriceGroupStatus('Yetkili mağaza ve alıcı işletme denetleniyor…');
    try{
      const data={organization_id:org,seller_id,customer_group_id,buyer_organization_id};
      const result=action==='read'?
        await api('/organization/store-price-groups?'+new URLSearchParams(data).toString()):
        await api('/organization/store-price-groups',{method:'POST',body:JSON.stringify({...data,action})});
      if(seq!==priceGroupActionRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden||el('workspace').hidden||
         form.elements.namedItem('seller_id')?.value!==seller_id)return;
      if(!['active','revoked'].includes(result?.status)||
         (action==='grant'&&result.status!=='active')||
         (action==='revoke'&&result.status!=='revoked')){
        const e=new Error('Yetki sonucu doğrulanamadı');
        // A syntactically valid but unusable POST response is still unknown.
        e.uncertain=action!=='read';
        throw e;
      }
      if(!sameSelection()){
        // The response belongs to the submitted tuple, not the fields now
        // visible in the form. Keep the original write scoped for recheck.
        if(action!=='read'&&!priceGroupUncertain.has(key))
          priceGroupUncertain.set(key,currentAction);
        showPriceGroupStatus(action==='read'?
          'Seçim değişti. Yeni seçimin kaydını yeniden kontrol edin.':'');
        return;
      }
      if(recheck&&priceGroupUncertain.get(key)===recheck)
        priceGroupUncertain.delete(key);
      showPriceGroupStatus(result.status==='active'?
        'Alıcı işletme bu mağazanın özel fiyat grubuna kabul edilmiş.':
        'Bu işletmenin bu mağaza grubunda geçerli üyeliği yok.');
    }catch(e){
      if(e.uncertain&&action!=='read'){
        // A native route's completed 503 is a terminal response. Its
        // subsequent authorized read can confirm the persisted state. A
        // transport loss, or an unrelated 503, does not prove the write ended.
        currentAction.outcomeUnverified=!(
          e.httpStatus===503&&e.message==='Outcome uncertain; recheck group');
        currentAction.settled=!currentAction.outcomeUnverified;
        if(request===organizationRequest&&currentOrg===org&&!document.hidden&&
           !el('workspace').hidden&&!priceGroupUncertain.has(key))
          priceGroupUncertain.set(key,currentAction);
      }
      if(seq!==priceGroupActionRequest||request!==organizationRequest||currentOrg!==org||
         document.hidden||el('workspace').hidden||
         form.elements.namedItem('seller_id')?.value!==seller_id)return;
      if(!sameSelection()){
        // Never attach an old rejection or uncertain result to another Buyer
        // or Group selected while the original request was in flight.
        showPriceGroupStatus('Seçim değişti. Önceki işlemin sonucunu yalnız ilgili kayıtta kontrol edin.');
        return;
      }
      showPriceGroupStatus(e.uncertain?
        'Sonuç belirsiz. İşlemi tekrarlamadan önce kaydı kontrol edin.':
        'İşlem reddedildi; mağaza veya grup yetkisi doğrulanamadı.');
    }finally{
      if(!(action!=='read'&&priceGroupUncertain.get(key)===currentAction&&
           currentAction.outcomeUnverified))currentAction.settled=true;
      if(seq===priceGroupActionRequest){
        priceGroupActionPending=false;priceGroupCurrentAction=null;
        if(request===organizationRequest&&currentOrg===org&&!document.hidden&&
           form.elements.namedItem('seller_id')?.value===seller_id)
          for(const button of form.querySelectorAll('button'))button.disabled=false;
      }
    }
  };


  let renameRead=0,renamePending=false,renameUncertain=false;
  let renameTargetMustSelect=false;
  function clearStoreRename(preserveSelectedOwner=false){
    // A transient Store-list failure is not an Organization role change.
    // Only Organization switch/logout/concealment may discard that role.
    renameRead++;renameTargetMustSelect=false;
    if(!preserveSelectedOwner)selectedStoreOwner=false;
    renamePending=false;renameUncertain=false;
    el('store-rename-panel').hidden=true;
    el('store-rename-status').textContent='';
    el('store-rename-history').replaceChildren();
    clearOwnerPause();
    const form=el('store-rename-form');
    if(typeof form?.reset==='function')form.reset();
    const field=form?.elements&&typeof form.elements.namedItem==='function'?
      form.elements.namedItem('seller_id'):null;
    if(typeof field?.replaceChildren==='function')field.replaceChildren();
    const button=typeof form?.querySelector==='function'?
      form.querySelector('button[type=submit]'):null;
    if(button)button.disabled=true;
  }
  async function refreshStoreRename(org,request){
    const form=el('store-rename-form'),seller=form.elements.namedItem('seller_id').value;
    const seq=++renameRead,epoch=viewEpoch;
    if(!selectedStoreOwner||!org||!seller||document.hidden)return;
    const message=el('store-rename-status'),list=el('store-rename-history');
    message.textContent='Başvurular doğrulanıyor…';
    try{
      const data=await api('/organization/store-rename-requests?'+new URLSearchParams({
        organization_id:org,seller_id:seller
      }).toString());
      if(seq!==renameRead||epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||seller!==form.elements.namedItem('seller_id').value)return;
      if(data.organization_id!==org||data.seller_id!==seller||
         !Array.isArray(data.requests)||data.requests.length>10||
         data.requests.some(x=>!/^dasrn_[a-f0-9]{32}$/.test(x?.id)||
           !['pending_review','approving','approved','rejected','withdrawn'].includes(x?.status)||
           typeof x?.proposed_name!=='string'||typeof x?.proposed_handle!=='string'))
        throw Error('Talep bilgisi doğrulanamadı');
      renameUncertain=false;
      list.replaceChildren();
      for(const x of data.requests){
        const row=document.createElement('div'),item=document.createElement('p');
        item.textContent=x.proposed_name+' / '+x.proposed_handle+' — '+
          (x.status==='pending_review'?'Platform incelemesinde':
            x.status==='approving'?'Onay işlemi belirsiz; platform uzlaştırması gerekiyor':
            x.status==='withdrawn'?'Geri çekildi':x.status);
        row.append(item);
        if(x.status==='pending_review'){
          const cancel=document.createElement('button');
          cancel.type='button';cancel.textContent='Bekleyen talebi geri çek';
          cancel.setAttribute('aria-label',x.proposed_name+' değişiklik talebini geri çek');
          cancel.disabled=renamePending||renameUncertain;
          cancel.onclick=async()=>{
            if(renamePending||renameUncertain||document.hidden||!selectedStoreOwner||
               org!==currentOrg||seller!==form.elements.namedItem('seller_id').value||
               !confirm('Bu bekleyen mağaza adı değişikliği talebini geri çekmek istiyor musunuz?'))return;
            renamePending=true;
            cancel.disabled=true;form.querySelector('button[type=submit]').disabled=true;
            message.textContent='Talep geri çekiliyor…';
            try{
              const result=await api('/organization/store-rename-requests',{method:'POST',
                body:JSON.stringify({action:'withdraw',request_id:x.id,
                  organization_id:org,seller_id:seller})});
              if(seq!==renameRead||epoch!==viewEpoch||request!==organizationRequest||
                 currentOrg!==org||document.hidden)return;
              if(result.request_id!==x.id||result.seller_id!==seller||
                 result.status!=='withdrawn'){
                const err=Error('Geri çekme sonucu doğrulanamadı');
                err.uncertain=true;throw err;
              }
              renameUncertain=false;
              renamePending=false;
              // A fresh private GET is authoritative; no automatic second POST.
              await refreshStoreRename(org,request);
            }catch(error){
              if(epoch!==viewEpoch||request!==organizationRequest||currentOrg!==org||
                 document.hidden)return;
              renameUncertain=!!error.uncertain||error.httpStatus>=500;
              message.textContent=error.httpStatus===409?
                'Talep artık beklemede değil. Güncel durumu yenileyin.':
                'Sonuç belirsiz; işlemi tekrarlamayın. Talep geçmişini yenileyin.';
              // An uncertain write keeps the controls disabled until readback.
            }finally{renamePending=false;}
          };
          row.append(cancel);
        }
        list.append(row);
      }
      renameUncertain=false;
      const approving=data.requests.some(x=>x.status==='approving');
      const pending=approving||data.requests.some(x=>x.status==='pending_review');
      form.querySelector('button[type=submit]').disabled=renamePending||pending;
      message.textContent=approving?
        'Onay işleminin sonucu belirsiz. Yeni talep göndermeyin; platform uzlaştırması gerekir.':
        pending?'Mevcut talep incelemede; yeni talep oluşturulamaz.':
        'Yeni isim ve bağlantı için ayrı risk kabulüyle başvurabilirsiniz.';
    }catch{
      if(seq!==renameRead||request!==organizationRequest||org!==currentOrg)return;
      renameUncertain=true;list.replaceChildren();
      form.querySelector('button[type=submit]').disabled=true;
      message.textContent='Talep geçmişi doğrulanamadı. Başvuru göndermeden önce oturumu yeniden doğrulayın.';
    }
  }
  const renameForm=el('store-rename-form');
  if(renameForm?.elements&&typeof renameForm.elements.namedItem==='function')
    renameForm.elements.namedItem('seller_id').onchange=()=>{
      const selected=renameForm.elements.namedItem('seller_id').value;
      // Explicit Store switches never inherit the previous Store's name or
      // risk acknowledgement. A lost target requires a new manual choice.
      renameTargetMustSelect=!selected;
      renameRead++;renameUncertain=true;
      renameForm.elements.namedItem('name').value='';
      renameForm.elements.namedItem('handle').value='';
      renameForm.elements.namedItem('risk_acknowledged').checked=false;
      el('store-rename-history').replaceChildren();
      renameForm.querySelector('button[type=submit]').disabled=true;
      if(currentOrg&&selected)void refreshStoreRename(currentOrg,organizationRequest);
    };
  el('store-rename-refresh').onclick=()=>{
    if(currentOrg)void refreshStoreRename(currentOrg,organizationRequest);
  };
  el('store-rename-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,org=currentOrg;
    const request=organizationRequest,epoch=viewEpoch,seller=form.elements.namedItem('seller_id').value;
    if(!org||!selectedStoreOwner||el('store-rename-panel').hidden||document.hidden||
       renamePending||renameUncertain||!form.elements.namedItem('risk_acknowledged').checked)return;
    const id='dasrn_'+crypto.randomUUID().replace(/-/g,'');
    renamePending=true;const button=form.querySelector('button[type=submit]');button.disabled=true;
    try{
      const result=await api('/organization/store-rename-requests',{method:'POST',body:JSON.stringify({
        request_id:id,organization_id:org,seller_id:seller,
        name:form.elements.namedItem('name').value,handle:form.elements.namedItem('handle').value,
        risk_acknowledged:true,risk_version:'store-rename-risks-v2'
      })});
      if(request!==organizationRequest||epoch!==viewEpoch||org!==currentOrg)return;
      if(result.request_id!==id||result.status!=='pending_review'){
        const err=Error('Başvuru sonucu doğrulanamadı');err.uncertain=true;throw err;
      }
      form.elements.namedItem('risk_acknowledged').checked=false;
      el('store-rename-status').textContent='Talep kaydedildi; mağaza adı ve bağlantısı onaylanana kadar değişmedi.';
      void refreshStoreRename(org,request);
    }catch(e){
      if(request!==organizationRequest||epoch!==viewEpoch||org!==currentOrg)return;
      renameUncertain=!!e.uncertain;
      el('store-rename-status').textContent=e.uncertain?
        'Sonuç belirsiz; tekrar göndermeden önce talep geçmişini yenileyin.':
        'Başvuru reddedildi: '+e.message;
      if(!e.uncertain)button.disabled=false;
    }finally{renamePending=false;}
  };

  let ownerPauseRead=0,ownerPausePending=false,ownerPauseUncertain=false;
  let ownerPauseVersion=null,ownerPauseState=null;
  function clearOwnerPause(){
    ownerPauseRead++;ownerPauseVersion=null;ownerPauseState=null;
    ownerPausePending=false;ownerPauseUncertain=false;
    const panel=el('store-owner-pause-panel'),form=el('store-owner-pause-form');
    panel.hidden=true;el('store-owner-pause-status').textContent='';
    const select=form?.elements&&typeof form.elements.namedItem==='function'?
      form.elements.namedItem('seller_id'):null;
    if(select)select.disabled=false; // Clear an in-flight mutation's UI lock.
    if(select?.replaceChildren)select.replaceChildren();
    if(typeof form?.querySelectorAll==='function')
      for(const b of form.querySelectorAll('button[type=submit]'))b.disabled=true;
    clearOwnerClosing();
    if(typeof clearPlatformClosingOwner==='function')clearPlatformClosingOwner();
  }
  function ownerPauseButtons(){
    const form=el('store-owner-pause-form');
    if(!form||typeof form.querySelectorAll!=='function')return;
    // A different Store selected mid-write would defer its GET until the
    // old mutation settles, leaving a misleading stale panel. Keep selection
    // stable for this short, pending-only window.
    const select=form.elements&&typeof form.elements.namedItem==='function'?
      form.elements.namedItem('seller_id'):null;
    if(select)select.disabled=ownerPausePending;
    for(const b of form.querySelectorAll('button[type=submit]')){
      b.disabled=ownerPausePending||ownerPauseUncertain||
        !ownerPauseState||ownerPauseState.platform_closed!==false||
        ownerPauseState.store_status!=='open'||
        ownerClosingState?.state==='closing'||
        (b.value==='pause'?ownerPauseState.paused:!ownerPauseState.paused);
    }
  }
  async function refreshOwnerPause(org,request){
    const form=el('store-owner-pause-form');
    const seller=form?.elements&&typeof form.elements.namedItem==='function'?
      form.elements.namedItem('seller_id')?.value:null;
    // A GET begun during a POST cannot reconcile its eventual outcome.
    if(!org||!seller||!selectedStoreOwner||document.hidden||ownerPausePending||
       el('store-owner-pause-panel').hidden)return;
    const seq=++ownerPauseRead,epoch=viewEpoch,st=el('store-owner-pause-status');
    ownerPauseVersion=null;ownerPauseState=null;ownerPauseButtons();ownerClosingButtons();
    st.textContent='Güncel mağaza durumu doğrulanıyor…';
    try{
      const data=await api('/organization/store-owner-pause?'+new URLSearchParams({
        organization_id:org,seller_id:seller
      }).toString());
      if(seq!==ownerPauseRead||epoch!==viewEpoch||
         request!==organizationRequest||org!==currentOrg||
         seller!==form.elements.namedItem('seller_id').value||document.hidden)return;
      if(data.organization_id!==org||data.seller_id!==seller||
         typeof data.paused!=='boolean'||typeof data.platform_closed!=='boolean'||
         !Number.isSafeInteger(data.version)||data.version<0||
         !['open','suspended','terminated'].includes(data.store_status))
        throw Error('Mağaza durumu doğrulanamadı');
      ownerPauseVersion=data.version;ownerPauseState=data;ownerPauseUncertain=false;
      ownerPauseButtons();ownerClosingButtons();
      st.textContent=ownerClosingState?.state==='closing'?
        'Mağaza kalıcı kapatma sürecinde. Geçici ara verme işlemleri kapalı.':
        data.platform_closed?
        'Mağaza platform kararıyla kapatıldı. Satışlar durduruldu; geçici ara verme ve satışa devam işlemleri kapalı.':
        data.store_status!=='open'?
        'Platform kaynaklı askı veya kapanış var. Owner bu ekrandan satış açamaz.':
        data.paused?'Mağaza geçici arada. Adınız korunuyor; yeni satış kabul edilmiyor.':
          'Mağaza satışa açık. Geçici ara verebilirsiniz.';
    }catch{
      if(seq!==ownerPauseRead||request!==organizationRequest||org!==currentOrg)return;
      ownerPauseUncertain=true;ownerPauseButtons();ownerClosingButtons();
      st.textContent='Durum güvenle doğrulanamadı; değişiklik kapatıldı. Yeniden kontrol edin.';
    }
  }
  const ownerPauseForm=el('store-owner-pause-form');
  if(ownerPauseForm?.elements&&typeof ownerPauseForm.elements.namedItem==='function')
  ownerPauseForm.elements.namedItem('seller_id').onchange=()=>{
    ownerPauseUncertain=false;
    if(currentOrg){
      void refreshOwnerPause(currentOrg,organizationRequest);
      void refreshOwnerClosing(currentOrg,organizationRequest);
      void refreshPlatformClosingOwner(currentOrg,organizationRequest);
    }
  };
  el('store-owner-pause-refresh').onclick=()=>{
    if(currentOrg){
      void refreshOwnerPause(currentOrg,organizationRequest);
      void refreshOwnerClosing(currentOrg,organizationRequest);
      void refreshPlatformClosingOwner(currentOrg,organizationRequest);
    }
  };
  if(ownerPauseForm)ownerPauseForm.onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,action=event.submitter?.value,org=currentOrg;
    const request=organizationRequest,epoch=viewEpoch;
    const seller=form.elements.namedItem('seller_id')?.value;
    if(!org||!selectedStoreOwner||document.hidden||ownerPausePending||
       ownerPauseUncertain||!ownerPauseState||ownerPauseVersion===null||
       ownerPauseState.seller_id!==seller||
       !['pause','resume'].includes(action)||
       ownerPauseState.platform_closed!==false||
       ownerPauseState.store_status!=='open')return;
    if(!confirm(action==='pause'?
      'Bu mağazanın yeni satışlarını hemen durdurmak istiyor musunuz? Mevcut sepetler satın alınamaz.':
      'Bu mağazadaki size ait geçici arayı kaldırmak istiyor musunuz?'))return;
    const expectedVersion=ownerPauseVersion;
    ownerPausePending=true;
    // Cancel prior GET continuations and discard the pre-write version/state.
    ownerPauseRead++;ownerPauseVersion=null;ownerPauseState=null;
    ownerPauseButtons();
    const st=el('store-owner-pause-status');
    st.textContent='İşlem yetki ve mağaza durumuyla birlikte kaydediliyor…';
    const id='dasp_'+crypto.randomUUID().replace(/-/g,'');
    try{
      const result=await api('/organization/store-owner-pause',{method:'POST',body:JSON.stringify({
        action,organization_id:org,seller_id:seller,request_id:id,
        expected_version:expectedVersion
      })});
      if(request!==organizationRequest||epoch!==viewEpoch||
         org!==currentOrg||seller!==form.elements.namedItem('seller_id').value)return;
      if(result.organization_id!==org||result.seller_id!==seller||
         result.status!==(action==='pause'?'paused':'resumed')||
         !Number.isSafeInteger(result.version)||result.version<0||
         typeof result.replayed!=='boolean'){
        const error=Error('Sonuç doğrulanamadı');
        error.uncertain=true;throw error;
      }
      // Release the mutation gate only once settled. Keep controls locked
      // until a NEW authorized GET returns a valid post-write state.
      ownerPauseUncertain=true;ownerPausePending=false;
      await refreshOwnerPause(org,request);
      if(request===organizationRequest&&org===currentOrg)
        void organizationStores(org,request);
    }catch(e){
      if(request!==organizationRequest||epoch!==viewEpoch||org!==currentOrg)return;
      ownerPauseUncertain=!!e.uncertain||e.httpStatus>=500;
      st.textContent=ownerPauseUncertain?
        'Sonuç belirsiz; tekrar işlem göndermeyin. Durumu yenileyin.':
        'İşlem reddedildi. Güncel mağaza durumunu yeniden kontrol edin.';
      ownerPauseButtons();
    }finally{
      ownerPausePending=false;ownerPauseButtons();
    }
  };

  // Owner closing is independent of the temporary-pause ledger and cannot
  // invoke native reversible Seller termination from this page.
  let ownerClosingRead=0,ownerClosingPending=false,ownerClosingUncertain=false;
  let ownerClosingState=null;
  function clearOwnerClosing(){
    ownerClosingRead++;ownerClosingPending=false;ownerClosingUncertain=false;
    ownerClosingState=null;
    el('store-owner-closing-panel').hidden=true;
    el('store-owner-closing-choice').textContent='';
    el('store-owner-closing-status').textContent='';
    const form=el('store-owner-closing-form');
    if(form?.elements&&typeof form.elements.namedItem==='function'){
      const ack=form.elements.namedItem('consequences_acknowledged');
      if(ack)ack.checked=false;
    }
    if(typeof form?.querySelectorAll==='function')
      for(const b of form.querySelectorAll('button[type=submit]'))b.disabled=true;
  }
  function ownerClosingButtons(){
    const form=el('store-owner-closing-form');
    if(!form?.elements||typeof form.elements.namedItem!=='function'||
       typeof form.querySelectorAll!=='function')return;
    const agreed=form.elements.namedItem('consequences_acknowledged')?.checked===true;
    for(const b of form.querySelectorAll('button[type=submit]')){
      b.disabled=ownerClosingPending||ownerClosingUncertain||
        (b.value==='start'&&!agreed)||!ownerClosingState||
        (b.value==='start'?
          ownerPauseState?.platform_closed!==false||
          ownerClosingState.state==='closing'||ownerClosingState.store_status!=='open':
          ownerClosingState.state!=='closing'||ownerClosingState.can_withdraw!==true);
    }
  }
  async function refreshOwnerClosing(org,request){
    const choice=el('store-owner-pause-form')?.elements.namedItem('seller_id');
    const seller=choice?.value;
    if(!org||!seller||!selectedStoreOwner||document.hidden||
       el('store-owner-pause-panel').hidden)return;
    const seq=++ownerClosingRead,epoch=viewEpoch;
    const st=el('store-owner-closing-status'),panel=el('store-owner-closing-panel');
    ownerClosingState=null;panel.hidden=false;
    el('store-owner-closing-choice').textContent='Seçili mağaza: '+
      (choice.selectedOptions?.[0]?.textContent||seller);
    ownerClosingButtons();ownerPauseButtons();
    st.textContent='Kapatma durumu doğrulanıyor…';
    try{
      const data=await api('/organization/store-owner-closing?'+new URLSearchParams({
        organization_id:org,seller_id:seller
      }).toString());
      if(seq!==ownerClosingRead||epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||seller!==choice.value||document.hidden)return;
      if(data.organization_id!==org||data.seller_id!==seller||
         !['none','closing','withdrawn'].includes(data.state)||
         !['open','suspended','terminated'].includes(data.store_status)||
         !Number.isSafeInteger(data.version)||data.version<0||
         typeof data.can_withdraw!=='boolean'||
         !Number.isSafeInteger(data.remaining_seconds)||
         data.remaining_seconds<0||data.remaining_seconds>2592000||
         data.permanent_finalization_enabled!==false||
         !data.email_notice||
         !['not_applicable','queued','pending','inflight','accepted',
           'failed','unverified_identity','uncertain','invalidated']
           .includes(data.email_notice.status)||
         !Number.isSafeInteger(data.email_notice.attempts)||
         data.email_notice.attempts<0||data.email_notice.attempts>4||
         typeof data.email_notice.smtp_accepted!=='boolean'||
         data.email_notice.mailbox_delivery_verified!==false||
         !data.notification_coverage||
         !Number.isSafeInteger(data.notification_coverage.protected_owners)||
         data.notification_coverage.protected_owners<0||
         data.notification_coverage.protected_owners>100||
         !Number.isSafeInteger(data.notification_coverage.personal_receipts)||
         data.notification_coverage.personal_receipts<0||
         data.notification_coverage.personal_receipts>
           data.notification_coverage.protected_owners||
         data.notification_coverage.mailbox_delivery_verified!==false||
         (data.state!=='none'&&
           (!Number.isFinite(new Date(data.due_at).getTime())||
            !Number.isFinite(new Date(data.started_at).getTime()))))
        throw Error('Kapatma durumu doğrulanamadı');
      ownerClosingState=data;ownerClosingUncertain=false;
      ownerClosingButtons();ownerPauseButtons();
      if(data.state==='closing'){
        const deadline=new Date(data.due_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'});
        const left=data.remaining_seconds;
        const days=Math.floor(left/86400),hours=Math.floor((left%86400)/3600);
        const minutes=Math.floor((left%3600)/60),seconds=left%60;
        st.textContent=left===0?
          '30 günlük bekleme süresi doldu. Yeni satışlar hâlâ kapalı. '+
          'Kapatma güvenlik kontrolleri tamamlanmadan geri dönüşsüz işlem yapılmıyor. '+
          'Sürenin dolması mağaza adını veya geçmiş siparişleri kendiliğinden değiştirmez. '+
          'Geri çekme süresi sona erdi.':
          'Yeni satışlar durduruldu. Kalan süre (yenilendiğinde): '+
          days+' gün, '+hours+' saat, '+minutes+' dakika, '+seconds+
          ' saniye. 30 günlük sürenin bitişi: '+deadline+
          (data.can_withdraw?' — Süre dolmadan geri çekebilirsiniz.':
          ' — Güncel geri çekme hakkı doğrulanamadı; yeniden kontrol edin.');
        el('store-owner-pause-status').textContent=
          'Mağaza için kapatma talebi etkin; geçici ara verme kullanılamaz.';
      }else if(data.state==='withdrawn'){
        st.textContent='Kapatma talebi geri çekildi. Diğer satış engelleri geçerliliğini korur.';
      }else st.textContent='Aktif 30 günlük kapatma talebi bulunmuyor.';
      if(data.state!=='none'){
        // The current event's aggregate in-account receipts are visible in
        // BOTH closing and withdrawn states, never proof of mailbox delivery.
        const coverage=data.notification_coverage;
        st.textContent+=' Korunan Owner bildirim kayıtları: '+
          coverage.personal_receipts+'/'+coverage.protected_owners+
          ' kişiye özel kayıt oluşturuldu. E-posta teslimi veya okunma bu sayılardan doğrulanmaz.';
        // This is the current logged-in Person's private security notice.
        // SMTP acceptance is NOT mailbox delivery or proof of reading.
        const notice=data.email_notice;
        const labels={
          not_applicable:'Bu hesabınız için bildirim alıcısı kaydı bulunamadı.',
          queued:'Kişisel bildirim kaydedildi; e-posta denemesi sırada.',
          pending:'E-posta denemesi planlandı.',
          inflight:'E-posta denemesi sürüyor.',
          accepted:'SMTP sunucusu e-postayı kabul etti; posta kutusuna teslim doğrulanmadı.',
          failed:'Son e-posta denemesi başarısız; teslim doğrulanmadı.',
          unverified_identity:'Doğrulanmış e-posta kimliği bulunamadı; teslim doğrulanmadı.',
          uncertain:'E-posta gönderim sonucu belirsiz; teslim doğrulanmadı.',
          invalidated:'Bu olay için gönderim yetki veya kapatma değişimi nedeniyle geçersiz.'
        };
        st.textContent+=' Kişisel güvenlik e-postanız: '+
          labels[notice.status]+
          (notice.attempts>0?' Deneme sayısı: '+notice.attempts+'.':'')+
          (notice.status!=='accepted'&&notice.smtp_accepted?
            ' Önceki bir denemeyi SMTP kabul etmişti; teslim yine doğrulanmadı.':'');
      }
    }catch{
      if(seq!==ownerClosingRead||request!==organizationRequest||org!==currentOrg)return;
      ownerClosingUncertain=true;ownerClosingButtons();ownerPauseButtons();
      st.textContent='Kapatma durumu doğrulanamadı; işlem kapatıldı. Yeniden kontrol edin.';
    }
  }
  const ownerClosingForm=el('store-owner-closing-form');
  if(ownerClosingForm?.elements&&typeof ownerClosingForm.elements.namedItem==='function'){
    const ack=ownerClosingForm.elements.namedItem('consequences_acknowledged');
    if(ack)ack.onchange=ownerClosingButtons;
  }
  el('store-owner-closing-refresh').onclick=()=>{
    if(currentOrg)void refreshOwnerClosing(currentOrg,organizationRequest);
  };
  ownerClosingForm.onsubmit=async event=>{
    event.preventDefault();
    const action=event.submitter?.value,org=currentOrg,request=organizationRequest;
    const epoch=viewEpoch,choice=el('store-owner-pause-form').elements.namedItem('seller_id');
    const seller=choice?.value,state=ownerClosingState;
    if(!org||!selectedStoreOwner||document.hidden||ownerClosingPending||
       ownerClosingUncertain||!state||state.seller_id!==seller||
       (action==='start'&&
         !ownerClosingForm.elements.namedItem('consequences_acknowledged').checked)||
       !['start','withdraw'].includes(action)||
       (action==='start'&&(ownerPauseState?.platform_closed!==false||
         state.state==='closing'||state.store_status!=='open'))||
       (action==='withdraw'&&(state.state!=='closing'||!state.can_withdraw)))return;
    if(!confirm(action==='start'?
      'Bu mağazanın yeni satışlarını hemen durdurmak ve 30 günlük kalıcı kapatma sürecini başlatmak istiyor musunuz?':
      'Henüz kesinleşmemiş bu kapatma talebini geri çekmek istiyor musunuz?'))return;
    ownerClosingPending=true;ownerClosingButtons();ownerPauseButtons();
    const st=el('store-owner-closing-status');
    st.textContent='Güncel yetki, sürüm ve süre doğrulanarak kayıt yapılıyor…';
    const id='dasc_'+crypto.randomUUID().replace(/-/g,'');
    try{
      const result=await api('/organization/store-owner-closing',{method:'POST',body:JSON.stringify({
        action,organization_id:org,seller_id:seller,request_id:id,
        expected_version:state.version,
        ...(action==='start'?{consequences_acknowledged:true}:{})
      })});
      if(epoch!==viewEpoch||request!==organizationRequest||
         org!==currentOrg||choice.value!==seller||document.hidden)return;
      if(result.seller_id!==seller||result.status!==(action==='start'?'closing':'withdrawn')||
         !Number.isSafeInteger(result.version)){
        const err=Error('İşlemin sonucu doğrulanamadı');err.uncertain=true;throw err;
      }
      ownerClosingUncertain=false;
      ownerClosingForm.elements.namedItem('consequences_acknowledged').checked=false;
      await refreshOwnerClosing(org,request);
      if(request===organizationRequest&&org===currentOrg)
        void organizationStores(org,request);
    }catch(error){
      if(epoch!==viewEpoch||request!==organizationRequest||org!==currentOrg)return;
      ownerClosingUncertain=!!error.uncertain||error.httpStatus>=500;
      st.textContent=ownerClosingUncertain?
        'Sonuç belirsiz. Tekrar göndermeyin; özel durumu yeniden kontrol edin.':
        'İşlem reddedildi. Yeniden güçlü doğrulama veya güncel mağaza kaydı gerekebilir.';
      ownerClosingButtons();ownerPauseButtons();
    }finally{
      ownerClosingPending=false;ownerClosingButtons();ownerPauseButtons();
    }
  };

  let organizationStoresBusyKey=null;
  async function organizationStores(org,request){
    if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
    // A second refresh of this same Owner/Organization while the ordinary
    // or private rename-only GET is pending would see a temporarily empty
    // select and wrongly discard its prepared Store. Serialize that cycle.
    const key=org+'|'+request;
    if(organizationStoresBusyKey===key)return;
    organizationStoresBusyKey=key;
    const refreshButton=el('org-stores-refresh');
    refreshButton.disabled=true;
    const seq=++storeRequest;
    // Capture the exact prepared Store before the ordinary list clears the
    // native select. A later rename-only response must never select another.
    const existingRenameForm=el('store-rename-form');
    // Capture at the moment options are replaced (not before the HTTP GET):
    // the Owner may have changed selection while the request was pending.
    let preparedRenameSeller='',hadPreparedRename=false;
    const target=el('org-stores'),message=el('org-stores-status');
    el('org-stores-panel').hidden=false;
    target.replaceChildren();message.textContent='Mağazalar kontrol ediliyor…';
    el('org-stores-refresh').hidden=false;
    try{
      const data=await api('/organization/stores?organization='+encodeURIComponent(org));
      if(request!==organizationRequest||seq!==storeRequest||currentOrg!==org||document.hidden)return;
      if(data.organization_id!==org||!Array.isArray(data.stores)||
          data.stores.some(s=>typeof s?.id!=='string'||!/^sel_[A-Za-z0-9_-]+$/.test(s.id)||typeof s.name!=='string')||
          new Set(data.stores.map(s=>s.id)).size!==data.stores.length)throw new Error('Mağaza yanıtı doğrulanamadı');
      for(const store of data.stores){
        const line=document.createElement('p');
        line.textContent=store.name+' — '+store.id;
        target.append(line);
      }
      message.textContent=data.stores.length?'Yetkili mağazalar güncellendi.':'Bu kuruluşta görüntülenebilir onaylı mağaza bulunmuyor.';
      const renameForm=el('store-rename-form');
      const select=renameForm?.elements&&typeof renameForm.elements.namedItem==='function'?
        renameForm.elements.namedItem('seller_id'):null;
      if(select&&typeof select.replaceChildren==='function'){
        preparedRenameSeller=select.value||'';
        hadPreparedRename=!!(existingRenameForm.elements.namedItem('name').value||
          existingRenameForm.elements.namedItem('handle').value||
          existingRenameForm.elements.namedItem('risk_acknowledged').checked);
        select.replaceChildren();
        el('store-rename-panel').hidden=true;
        if(selectedStoreOwner){
          // A rename-only HTTP read may be slower than the ordinary Store
          // list or may fail. Never block open Store rendering or re-open
          // stale private values after a different Organization is selected.
          await (async()=>{
            try{
              const renameData=await api('/organization/stores?organization='+
                encodeURIComponent(org)+'&purpose=rename');
              if(request!==organizationRequest||seq!==storeRequest||
                 currentOrg!==org||document.hidden||!selectedStoreOwner)return;
              if(renameData.organization_id!==org||
                 !Array.isArray(renameData.stores)||renameData.stores.length>50||
                 renameData.stores.some(s=>typeof s?.id!=='string'||
                   !/^sel_[A-Za-z0-9_-]+$/.test(s.id)||
                   typeof s?.name!=='string'||
                   !['open','suspended'].includes(s?.status))||
                 new Set(renameData.stores.map(s=>s.id)).size!==renameData.stores.length)
                throw Error('Name-management Store response invalid');
              const sameSeller=preparedRenameSeller&&
                renameData.stores.some(store=>store.id===preparedRenameSeller);
              select.replaceChildren();
              for(const store of renameData.stores){
                const opt=document.createElement('option');
                opt.value=store.id;
                opt.textContent=store.name+
                  (store.status==='suspended'?' — askıda':'');
                select.append(opt);
              }
              if(sameSeller)select.value=preparedRenameSeller;
              else if(preparedRenameSeller||hadPreparedRename||renameTargetMustSelect){
                // Never bind a prepared name/handle/explicit risk consent to
                // the first option after the original Store loses authority.
                const placeholder=document.createElement('option');
                placeholder.value='';placeholder.textContent='Mağazayı yeniden seçin';
                select.prepend(placeholder);select.value='';
                existingRenameForm.elements.namedItem('name').value='';
                existingRenameForm.elements.namedItem('handle').value='';
                existingRenameForm.elements.namedItem('risk_acknowledged').checked=false;
                renameTargetMustSelect=true;
                renameRead++;renameUncertain=true;
                el('store-rename-history').replaceChildren();
                existingRenameForm.querySelector('button[type=submit]').disabled=true;
                el('store-rename-status').textContent=
                  'Önceki mağaza artık yetkili listede yok. Yeni mağazayı seçip adı, bağlantıyı ve risk kabulünü yeniden doldurun.';
              }
              el('store-rename-panel').hidden=renameData.stores.length===0;
              if(!el('store-rename-panel').hidden&&select.value)
                void refreshStoreRename(org,request);
              // Owner's pause selector is private and independent from the
              // commercial Store picker. It also lists a currently paused
              // native-OPEN Store so its Owner can safely resume.
              const pauseForm=el('store-owner-pause-form');
              const pauseChoice=pauseForm?.elements&&
                typeof pauseForm.elements.namedItem==='function'?
                pauseForm.elements.namedItem('seller_id'):null;
              if(pauseChoice&&typeof pauseChoice.replaceChildren==='function'&&
                 !ownerPausePending){
                // Native disabled selectors may still be changed by code.
                // Never rebind an in-flight pause to the first listed Store.
                const previousSeller=pauseChoice.value;
                pauseChoice.replaceChildren();
                for(const store of renameData.stores){
                  const opt=document.createElement('option');
                  opt.value=store.id;
                  opt.textContent=store.name+
                    (store.status==='suspended'?' — platform askısında':'');
                  pauseChoice.append(opt);
                }
                if(previousSeller&&renameData.stores.some(s=>s.id===previousSeller))
                  pauseChoice.value=previousSeller;
                else if(previousSeller){
                  const placeholder=document.createElement('option');
                  placeholder.value='';placeholder.textContent='Mağazayı yeniden seçin';
                  pauseChoice.prepend(placeholder);pauseChoice.value='';
                  ownerPauseRead++;ownerPauseVersion=null;ownerPauseState=null;
                  ownerPauseUncertain=true;ownerPauseButtons();ownerClosingButtons();
                  el('store-owner-pause-status').textContent=
                    'Önceki mağaza artık yetkili listede yok. Yeniden seçim ve durum doğrulaması gerekli.';
                }
                el('store-owner-pause-panel').hidden=renameData.stores.length===0;
                if(renameData.stores.length&&pauseChoice.value){
                  void refreshOwnerPause(org,request);
                  void refreshOwnerClosing(org,request);
                  void refreshPlatformClosingOwner(org,request);
                }
              }

            }catch{
              if(request!==organizationRequest||seq!==storeRequest||
                 currentOrg!==org||document.hidden)return;
              clearOwnerPause();
              renameRead++;renameUncertain=true;
              if(typeof existingRenameForm?.reset==='function')existingRenameForm.reset();
              existingRenameForm?.querySelector('button[type=submit]')?.setAttribute('disabled','');
              select.replaceChildren();
              el('store-rename-history').replaceChildren();
              el('store-rename-panel').hidden=true;
              el('store-rename-status').textContent=
                'Mağaza adı yönetimi doğrulanamadı. Yeniden deneyin.';
            }
          })();
        }
      }
    }catch(e){
      if(request!==organizationRequest||seq!==storeRequest||currentOrg!==org)return;
      // Preserve the selected Owner only for a transient list failure.
      // A definite access denial must not retain even client-side Owner UI state.
      target.replaceChildren();clearStoreRename(![401,403,404].includes(e.httpStatus));
      if(e.httpStatus===401){concealPrivateView();el('login').hidden=false;return}
      message.textContent=[403,404].includes(e.httpStatus)?'Bu kuruluşun mağazalarına erişim izniniz yok.':'Mağazalar doğrulanamadı. Yeniden deneyin.';
    }finally{
      if(organizationStoresBusyKey===key){
        organizationStoresBusyKey=null;
        refreshButton.disabled=false;
      }
    }
  }



  // Follow management is independent of the visible catalogue. A Store
  // may disappear from catalog while its Organization-owned follow persists.
  let buyerFollowRequest=0,buyerFollowCursor=null,buyerFollowNext=null;
`;

