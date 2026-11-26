// Kişisel konsol istemci betiği: profile.ts
export const scriptProfile: string = `  function clearPersonMobile(){
    mobileRequest++;mobileVersion=null;
    const form=el('person-mobile-form');
    form.hidden=true;form.elements.mobile_phone.value='';
    form.querySelector('button').disabled=false;
    el('person-mobile-status').textContent='';
  }
  async function refreshPersonMobile(){
    const request=++mobileRequest,epoch=viewEpoch,person=currentPersonId;
    const form=el('person-mobile-form');
    mobileVersion=null;form.hidden=true;
    try{
      const result=await api('profile');
      if(request!==mobileRequest||epoch!==viewEpoch||person!==currentPersonId||
         document.hidden||el('workspace').hidden)return false;
      if(!result||!Number.isSafeInteger(result.version)||result.version<0||
         (result.mobile_phone!==null&&typeof result.mobile_phone!=='string')||
         result.phone_verified!==false)throw new Error('Kişisel iletişim bilgisi doğrulanamadı');
      mobileVersion=result.version;
      form.elements.mobile_phone.value=result.mobile_phone||'';
      form.querySelector('button').disabled=false;
      el('person-mobile-status').textContent=result.mobile_phone
        ?'Kişisel cep telefonu kayıtlı; numaranın sahipliği doğrulanmadı.'
        :'Kişisel cep telefonu henüz kaydedilmedi.';
      form.hidden=false;
      return true;
    }catch{
      if(request!==mobileRequest||epoch!==viewEpoch||person!==currentPersonId)return false;
      clearPersonMobile();
      el('person-mobile-status').textContent='Kişisel iletişim bilgisi şu anda okunamıyor.';
      return false;
    }
  }
  el('person-mobile-form').onsubmit=async e=>{
    e.preventDefault();
    const form=e.target,button=form.querySelector('button');
    if(form.hidden||mobileVersion===null||el('workspace').hidden)return;
    const version=mobileVersion,number=form.elements.mobile_phone.value;
    const epoch=viewEpoch,person=currentPersonId,request=++mobileRequest;
    button.disabled=true;
    try{
      const result=await api('profile',{method:'POST',body:JSON.stringify({
        mobile_phone:number,expected_version:version
      })});
      if(epoch!==viewEpoch||person!==currentPersonId||request!==mobileRequest)return;
      if(!result||result.mobile_phone!==number||result.phone_verified!==false||
         !Number.isSafeInteger(result.version))throw new Error('Kaydetme yanıtı doğrulanamadı');
      const readbackOk=await refreshPersonMobile();
      if(!readbackOk&&epoch===viewEpoch&&person===currentPersonId&&
         !document.hidden&&!el('workspace').hidden)
        status('Cep telefonu için kayıt yanıtı alındı ancak güncel kayıt yeniden okunamadı. Tekrar göndermeden önce oturumunuzu yenileyip kaydı kontrol edin.');
    }catch(err){
      if(epoch!==viewEpoch||person!==currentPersonId||request!==mobileRequest)return;
      if(err?.httpStatus===403){
        // A definite denial is not an uncertain write. Do not retry or
        // disguise expired strong authentication as a network failure.
        clearPersonMobile();
        if(!document.hidden&&!el('workspace').hidden)
          status('Cep telefonu kaydı reddedildi. Güvenlik doğrulamanız güncel olmayabilir veya oturum erişiminiz reddedilmiş olabilir. Oturumu kilitleyip yeniden giriş yapın; kayıt otomatik tekrarlanmadı.');
        return;
      }
      // A missing write response never triggers a second POST. Re-read from
      // the authoritative Person row; do not report success from old UI state.
      const readbackOk=await refreshPersonMobile();
      if(epoch!==viewEpoch||person!==currentPersonId||document.hidden||el('workspace').hidden)return;
      if(readbackOk){
        el('person-mobile-status').textContent='Kaydetme yanıtı alınamadı. Güncel telefon kaydını kontrol edin; işlem otomatik tekrarlanmadı.';
      }else{
        status('Cep telefonu kaydının sonucu doğrulanamadı. Bağlantınızı kontrol edip yeniden giriş yaparak güncel kaydı okuyun; kayıt otomatik tekrarlanmadı.');
      }
    }finally{
      if(epoch===viewEpoch&&person===currentPersonId&&!form.hidden)
        button.disabled=false;
    }
  };
`;

