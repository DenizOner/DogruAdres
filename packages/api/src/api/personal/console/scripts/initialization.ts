// Kişisel konsol istemci betiği: initialization.ts
export const scriptInitialization: string = `  el('platform-store-policy-read').onclick=()=>void readPlatformStorePolicy();
  policyForm.onsubmit=async event=>{
    event.preventDefault();
    const org=String(policyInput.value||'').trim(),current=platformStorePolicy,
      reason=String(el('platform-store-policy-reason').value||'').trim(),
      epoch=viewEpoch,seq=++platformStoreRequest;
    policyApply.disabled=true;platformStorePolicy=null;
    if(!current||current.organization_id!==org||reason.length<10||reason.length>500){
      policyStatus.textContent='Önce şirket durumunu doğrulayın ve gerekçe girin.';
      return;
    }
    policyStatus.textContent='Politika değişikliği gönderiliyor…';
    try{
      const result=await api('/platform/store-application-policy',{
        method:'POST',body:JSON.stringify({
          organization_id:org,expected_enabled:current.enabled,
          expected_version:current.version,enabled:!current.enabled,reason
        })
      });
      if(seq!==platformStoreRequest||epoch!==viewEpoch||
         document.hidden||el('workspace').hidden||policyInput.value.trim()!==org)return;
      if(result.status!=='updated'||result.organization_id!==org||
         result.store_application_enabled!==!current.enabled||
         result.store_application_version!==current.version+1){
        const uncertain=new Error('İşlem yanıtı doğrulanamadı');
        uncertain.uncertain=true;
        throw uncertain;
      }
      policyStatus.textContent='Şirketin yeni mağaza başvuru hakkı '+
        (result.store_application_enabled?'açıldı.':'kapatıldı; bekleyenler korunuyor.')+
        ' Son durum yeniden doğrulansın.';
      el('platform-store-policy-reason').value='';
    }catch(error){
      if(seq!==platformStoreRequest||epoch!==viewEpoch)return;
      policyStatus.textContent=error.uncertain?
        'Sonuç belirsiz. İşlemi tekrar göndermeyin; şirketin durumunu yeniden sorgulayın.':
        error.httpStatus===409?
        'Şirketin durumu başka işlemle değişti. Tekrar göndermeden önce yeniden sorgulayın.':
        'Başvuru hakkı değiştirilemedi. Yetkinizi ve şirket kaydını kontrol edin.';
    }
  };
  el('platform-store-policy-open').onclick=()=>{
    clearPlatformStorePolicy();
    el('platform-store-policy-panel').hidden=false;
    policyStatus.textContent='Şirket kimliğini yazıp mevcut durumu doğrulayın. Yalnız yetkili platform görevlileri işlem yapabilir.';
  };
  el('staff').onclick=async()=>{
    try{
      const allowed=await api('platform');
      if(allowed.allowed!==true)throw Error('Platform görevi doğrulanamadı');
      status('Kuruluş oluşturma için platform görevi doğrulandı');
    }catch{
      status('Kuruluş oluşturma platform yetkisi bulunamadı veya güçlü doğrulama gerekli.');
    }
  };load();`;

