// Kişisel konsol istemci betiği: lifecycle.ts
export const scriptLifecycle: string = `  async function load(){if(document.hidden){concealPrivateView(true);return}const epoch=++viewEpoch;clearOrganizationReviews();try{el('smtp-platform').hidden=true;smtpSettings=null;const me=await api('session');if(platformMailLinkPreservedPerson&&
       platformMailLinkPreservedPerson!==me.person_id)clearPrivateClosingEmailLink();
    if(currentPersonId&&currentPersonId!==me.person_id){concealPrivateView();el('login').hidden=false;status('Oturum kimliği değişti. Erişimi yeniden doğrulayın.');return}csrf=me.csrf_token;currentPersonId=me.person_id;el('person').textContent='Person: '+me.person_id;el('verification-email').textContent=me.email_verification==='verified'?'E-posta: Native doğrulama kaydı mevcut.':me.email_verification==='not_verified'?'E-posta: Doğrulanmış kayıt bulunamadı.':'E-posta: Doğrulama durumu şu anda okunamıyor.';const data=await api('organizations');loadedScope=JSON.stringify(data);
    if(platformMailLinkToken&&!document.hidden&&
       (!platformMailLinkPreservedPerson||platformMailLinkPreservedPerson===me.person_id))
      el('platform-closing-email-link-panel').hidden=false;
    el('organizations').replaceChildren();for(const o of data.organizations){const b=document.createElement('button');b.type='button';b.textContent=o.name+' — '+o.role;b.onclick=()=>selectOrg(o.id);el('organizations').append(b)}el('login').hidden=true;el('register-details').hidden=true;el('session-lock').hidden=false;el('session-lock').disabled=false;el('notification-bell').hidden=false;void notifications();el('workspace').hidden=false;void refreshOrganizationDrafts();status('Oturum açık');void refreshPersonMobile();void refreshNotificationPreferences();await links();await refreshMfa();await refreshSmtp();void refreshStoreApprovals();void refreshPlatformClosings();void refreshPlatformClosingReviews();void refreshStoreRenameReviews();void refreshOrganizationReviews();void loadPlatformLauncher();
    const inviteToken=invitationToken;
    if(inviteToken){el('invitation-section').hidden=false;el('invitation-card').hidden=false;el('invitation-mismatch-banner').hidden=true;el('invitation-result').textContent='';}
    else{el('invitation-section').hidden=true;}
    const selected=new URLSearchParams(location.search).get('organization');if(selected)await selectOrg(selected)}catch{if(epoch!==viewEpoch)return;if(currentPersonId)clearPrivateClosingEmailLink();clearNotifications();clearCompanyLauncher();clearPlatformLauncher();organizationRequest++;csrf='';currentOrg='';currentPersonId='';el('login').hidden=false;el('register-details').hidden=false;el('session-lock').hidden=true;el('workspace').hidden=true;el('mfa-enrollment').hidden=true;el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;mfaState=null;clearMfaCodes();el('mfa-management').hidden=true;el('mfa-person').hidden=true;el('mfa-platform').hidden=true;el('smtp-platform').hidden=true;smtpSettings=null;el('invite-member').hidden=true;clearPersonMobile();clearNotificationPreferences();clearOrganizationDrafts();clearPendingInvitations();el('invite-result').textContent='';
    const inviteToken=invitationToken;
    if(inviteToken){el('invitation-section').hidden=false;el('invitation-card').hidden=true;el('invitation-mismatch-banner').hidden=false;el('invitation-mismatch-text').textContent='Bu bağlantıyla mevcut oturumda devam edilemiyor. Uygun hesapla giriş yapın veya yeni davet isteyin.';}
    else{el('invitation-section').hidden=true;}
    clearMemberships();clearOrganizationStores();clearStoreApprovals();clearPlatformClosingReviews();clearStoreRenameReviews();for(const id of ['detail','memberships','organizations','actor-result','provision-result','person','verification-email','bindings'])el(id).replaceChildren();status('Giriş gerekli')}}
  async function updateMfaForm(form,body){
    const button=form.querySelector('button');button.disabled=true;
    let uncertain=false;
    try{
      await api('mfa',{method:'POST',body:JSON.stringify(body)});
      await refreshMfa();if(!mfaState){await load();status('MFA ayarı kaydedildi. Güncel güvenlik politikası için yeniden giriş yapın.')}else status('MFA ayarı kaydedildi. Native faktör ve oturum geçişi ayrıca doğrulanmalıdır.');
    }catch(e){
      status(e.message);await refreshMfa();
      if(e.uncertain){uncertain=true;status('İşlemin sonucu belirsiz. Yeniden göndermeden önce kayıt kontrolü gerekli.');}
    }finally{
      // Re-enable only when fresh server policy still authorizes this control.
      // Ambiguous writes stay locked until their persisted result is reviewed.
      button.disabled=uncertain||!mfaState||
        (form===el('mfa-platform')
          ? !mfaState.can_manage_platform
          : mfaState.platform.platform_mode!=='optional');
    }
  }
  el('mfa-person').onsubmit=async e=>{
    e.preventDefault();if(!mfaState||mfaState.platform.platform_mode!=='optional')return;
    await updateMfaForm(e.target,{
      action:'personal',user_enabled:new FormData(e.target).get('user_enabled')==='true',
      expected_version:mfaState.personal.version,
    });
  };
  el('mfa-platform').onsubmit=async e=>{
    e.preventDefault();if(!mfaState||!mfaState.can_manage_platform)return;
    if(!confirm('Platform MFA politikasını değiştirmek istiyor musunuz? Etkin native faktörler doğrulanmış kaldırma tamamlanmadan atlanamaz.'))return;
    await updateMfaForm(e.target,{
      action:'platform',platform_mode:new FormData(e.target).get('platform_mode'),
      expected_version:mfaState.platform.version,
    });
  };
  el('mfa-enroll-launch').onclick=()=>{
    if(!mfaState||mfaState.platform.platform_mode==='disabled'||mfaState.native_factor_state==='enabled')return;
    el('workspace').hidden=true;el('mfa-enrollment').hidden=false;
    el('mfa-enroll-start').hidden=false;el('mfa-enroll-verify').hidden=true;
    el('mfa-enroll-start').reset();el('mfa-enroll-start').querySelector('button').disabled=false;
    el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;
    el('mfa-enroll-start').elements.setup_action.value=mfaState.native_factor_state==='pending'?'resume':'start';
    status('Kuruluma başlamak veya devam etmek için parolanızı yeniden girin.');
  };
  el('mfa-seed-toggle').onclick=()=>{el('mfa-seed').type=el('mfa-seed').type==='password'?'text':'password'};
  el('mfa-enroll-start').onsubmit=async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{
      const values=Object.fromEntries(new FormData(e.target));
      const action=values.setup_action;
      delete values.setup_action;
      const data=await api('mfa/enroll',{method:'POST',body:JSON.stringify({action,...values})});
      e.target.reset();
      if(data.reset){
        el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;
        el('mfa-enroll-verify').hidden=true;
        button.disabled=false;
        status('Bekleyen TOTP kurulumu sıfırlandı. Yeni kurulum için parolanızı yeniden doğrulayın.');
        return;
      }
      el('mfa-seed').value=data.resumed?'':(data.secret||data.otpauth_url||'');
      el('mfa-seed').type='password';el('mfa-seed-region').hidden=!!data.resumed;
      el('mfa-enroll-secret').textContent=data.resumed
        ? 'Önceki kimlik doğrulama uygulamanızdaki kodu girin. Önceki anahtar tekrar gösterilemez.'
        : 'Kurulum anahtarı yalnız bu ekranda maskeli gösterilir. Güvenli doğrulama uygulamanıza aktarın.';
      el('mfa-enroll-verify').hidden=false;
      status('TOTP doğrulaması gerekiyor. İşlemi tamamlamadan yeni yetki verilmez.');
    }catch(err){status(err.message);if(!err.uncertain)button.disabled=false}
  };
  el('mfa-enroll-verify').onsubmit=async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{
      const data=await api('mfa/enroll',{method:'POST',body:JSON.stringify({
        action:'verify',...Object.fromEntries(new FormData(e.target)),
      })});
      csrf=data.csrf_token;
      el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;
      el('mfa-enroll-verify').hidden=true;el('mfa-enrollment').hidden=true;
      e.target.reset();await load();
    }catch(err){status(err.message);if(!err.uncertain)button.disabled=false}
  };
  el('register').onsubmit=async e=>{
    e.preventDefault();
    const form=e.currentTarget,button=form.querySelector('button');
    if(button.disabled || document.hidden)return;
    button.disabled=true;
    const feedback=el('register-status');
    feedback.textContent='Kayıt kontrol ediliyor.';
    let definite=false;
    try{
      const data=Object.fromEntries(new FormData(form));
      const response=await fetch('/personal/register',{
        method:'POST',credentials:'omit',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(data)
      });
      let result=null;
      try{result=await response.json()}catch{}
      if(response.ok&&result?.registered===true){
        definite=true;form.reset();el('register-details').open=false;
        status('Kişi hesabı kaydedildi. Mevcut giriş formundan oturum açın; gerekli MFA kurulumu girişte tamamlanır.');
        feedback.textContent='';
      }else if(response.status===400||response.status===403||response.status===409||response.status===429){
        definite=true;
        feedback.textContent=response.status===429
          ?'Çok fazla deneme yapıldı. Bir süre sonra yeniden deneyin.'
          :response.status===400?'Kayıt bilgileri geçersiz. Cep telefonu ve alanları kontrol edin.'
          :'Kayıt bu hesapla tamamlanamadı. Mevcut hesabınızla giriş yapın veya yetkili hesap bağlantısı yolunu kullanın.';
      }else{
        feedback.textContent='Kayıt sonucu doğrulanamadı. Aynı işlemi yeniden göndermeden önce giriş yaparak mevcut hesabı kontrol edin.';
      }
    }catch{
      feedback.textContent='Bağlantı koptu. Kayıt sonucu belirsiz; otomatik tekrar yapılmadı. Önce giriş yaparak hesabı kontrol edin.';
    }finally{if(definite)button.disabled=false}
  };
  el('login').onsubmit=async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{
      const data=await api('session',{method:'POST',
        body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});
      csrf=data.csrf_token;e.target.reset();
      if(data.challenge_required){
        el('login').hidden=true;el('challenge').hidden=false;
        // Form reset does not fire change; sync the TOTP/recovery validator on every new challenge.
        el('challenge').elements.method.onchange();status('İkinci faktör gerekli');
      }else if(data.enrollment_required){
        el('login').hidden=true;el('mfa-enrollment').hidden=false;
        el('mfa-enroll-start').hidden=false;el('mfa-enroll-verify').hidden=true;
        el('mfa-enroll-secret').textContent='';el('mfa-seed').value='';el('mfa-seed-region').hidden=true;
        el('mfa-enroll-start').reset();el('mfa-enroll-start').querySelector('button').disabled=false;
        status('MFA kurulumuna başlamak veya yarım kalan kuruluma devam etmek için parolanızı yeniden doğrulayın.');
      }else await load();
    }catch(e){status(e.message)}finally{button.disabled=false}
  };
  el('challenge').elements.method.onchange=()=>{
    const recovery=el('challenge').elements.method.value==='recovery_code';
    const field=el('challenge').elements.code;
    field.value='';field.inputMode=recovery?'text':'numeric';
    field.pattern=recovery?'[A-Za-z0-9-]{8,128}':'[0-9]{6}';
    field.autocomplete=recovery?'off':'one-time-code';
  };
  el('challenge').onsubmit=async e=>{e.preventDefault();try{const data=await api('challenge',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});csrf=data.csrf_token;e.target.reset();el('challenge').hidden=true;await load()}catch(e){status(e.message)}};
  el('link-account').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const values=Object.fromEntries(new FormData(e.target));const result=await api('links',{method:'POST',body:JSON.stringify({action:'begin',...values})});linkIntent=result.intent;e.target.reset();el('link-confirm').reset();el('link-confirm').querySelector('button').disabled=false;el('link-confirm').hidden=false;el('link-confirm').elements.code.required=result.challenge_required;status(result.challenge_required?'İkincil hesap için MFA gerekli':'İkincil sahiplik doğrulandı; bağlantıyı tamamlayın')}catch(err){status(err.message)}finally{b.disabled=false}};
  el('link-confirm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const code=new FormData(e.target).get('code');await api('links',{method:'POST',body:JSON.stringify({action:'complete',intent:linkIntent,...(code?{code}:{})})});linkIntent='';e.target.reset();e.target.hidden=true;await links();status('Hesap bağlantısı tamamlandı')}catch(err){status(err.message);if(!err.uncertain)b.disabled=false}};
  el('provision').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button'),v=new FormData(e.target);b.disabled=true;try{const result=await api('platform',{method:'POST',body:JSON.stringify({name:v.get('name'),initial_owners:[{actor_type:v.get('type1'),actor_id:v.get('owner1')},{actor_type:v.get('type2'),actor_id:v.get('owner2')}]})});el('provision-result').textContent=JSON.stringify(result,null,2);status('Kuruluş oluşturuldu');e.target.reset()}catch(err){status(err.message);if(!err.uncertain)b.disabled=false}};
  el('seller').onsubmit=async e=>{
    e.preventDefault();
    const org=currentOrg,request=organizationRequest;
    const seller=String(new FormData(e.target).get('seller')||'');
    el('actor-result').textContent='';
    if(!org){status('Önce erişiminiz olan kuruluşu seçin.');return;}
    if(!/^sel_[A-Za-z0-9_-]+$/.test(seller)){status('Geçerli mağaza kimliği gerekli.');return;}
    try{
      // Native Member and Store membership do not establish legal Organization authority.
      const query=new URLSearchParams({type:'member',organization:org,seller});
      const result=await api('contexts?'+query.toString());
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(result.organization_id!==org||result.seller?.id!==seller)
        throw new Error('Güncel kuruluş-mağaza bağlamı doğrulanamadı');
      el('actor-result').textContent=JSON.stringify(result,null,2);
      status('Satıcı erişimi doğrulandı');
    }catch(error){
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      el('actor-result').textContent='';
      status(error.message);
    }
  };
  el('customer').onclick=async()=>{try{const result=await api('contexts?type=customer');el('actor-result').textContent=JSON.stringify(result,null,2);status('Müşteri bağlamı doğrulandı')}catch(e){el('actor-result').textContent='';status(e.message)}};
  el('mfa-recovery').onclick=async()=>{
    if(!confirm('Yeni kodlar önceki kurtarma kodlarını geçersiz kılar. Devam edilsin mi?'))return;
    const button=el('mfa-recovery');button.disabled=true;clearMfaCodes();
    try{const data=await api('mfa/manage',{method:'POST',body:JSON.stringify({action:'recovery_codes'})});recoveryCodes=data.recovery_codes;el('mfa-codes').hidden=false;status('Kurtarma kodları oluşturuldu; yalnız bu ekranda gösterilebilir.');}
    catch(error){status(error.message);if(!error.uncertain)button.disabled=false}
  };
  el('mfa-codes-reveal').onclick=()=>{el('mfa-codes-value').textContent=recoveryCodes.join('\\n');el('mfa-codes-value').hidden=false};
  el('mfa-codes-clear').onclick=()=>clearMfaCodes();
  el('mfa-disable').onsubmit=async event=>{
    event.preventDefault();if(!confirm('Native faktör kaldırılacak ve tüm oturumlar kapanacak. Devam edilsin mi?'))return;
    const button=event.target.querySelector('button');button.disabled=true;
    try{await api('mfa/manage',{method:'POST',body:JSON.stringify({action:'disable',...Object.fromEntries(new FormData(event.target))})});event.target.reset();clearMfaCodes();await load();status('Native faktör kaldırıldı; yeniden giriş yapın.');}
    catch(error){event.target.reset();status(error.message);if(!error.uncertain)button.disabled=false}
  };
  async function logout(all){
    let error=null;
    try{await api('session'+(all?'?all=true':''),{method:'DELETE'})}
    catch(e){error=e}
    finally{
      // Conceal the outgoing actor's private data even if logout is uncertain.
      concealPrivateView();
      history.replaceState(null,'','/personal');
    }
    if(error){status('Çıkış doğrulanamadı. Sunucu oturumu hâlâ açık olabilir.');return}
    await load()
  }
  // Existing server-side single-session revocation is the lock authority.
  // api() checks viewEpoch, so this call must remain independent: the private
  // workspace is concealed before any response or old request can repaint it.
  async function lockCurrentSession(){
    const button=el('session-lock');
    if(button.hidden||button.disabled)return;
    const requestCsrf=csrf;
    button.disabled=true;
    concealPrivateView();
    el('login').reset();el('login').hidden=false;
    history.replaceState(null,'','/personal');
    let locked=false;
    try{
      const response=await fetch('/personal/session?action=lock',{
        method:'DELETE',credentials:'same-origin',
        headers:{'Content-Type':'application/json','x-csrf-token':requestCsrf}
      });
      if(response.ok){const result=await response.json();locked=result&&result.success===true}
    }catch{
      // An uncertain revoke must never be reported as a completed lock.
    }
    status(locked
      ?'Oturum kilitlendi. Yeniden açmak için parola ve ikinci faktörle giriş yapın.'
      :'Kilitleme doğrulanamadı. Sunucu oturumu hâlâ açık olabilir; yeniden giriş yapıp oturumu sonlandırın.');
  }
  
  let smtpSettings=null;
`;

