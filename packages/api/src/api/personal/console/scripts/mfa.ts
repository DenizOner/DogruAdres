// Kişisel konsol istemci betiği: mfa.ts
export const scriptMfa: string = `  async function refreshMfa(){
    try{
      const data=await api('mfa');
      if(!data||typeof data!=='object'||!data.platform||!data.personal||!data.effective_mfa_target||
         (data.runtime_enforcement!=='enforced'&&data.runtime_enforcement!=='not_yet_enabled'))
        throw new Error('MFA çalışma zamanı durumu doğrulanamadı');
      const mode=data.platform.platform_mode, native=data.native_factor_state;
      const user=data.personal.user_enabled, target=data.effective_mfa_target;
      // Trust only the documented Person MFA status contract. An unknown value
      // must not display a misleading switch or expose factor actions.
      if(!['required','optional','disabled'].includes(mode)||
         !['enabled','pending','not_enrolled'].includes(native)||
         typeof user!=='boolean'||typeof data.can_manage_platform!=='boolean'||
         typeof target.required!=='boolean'||typeof target.user_control_allowed!=='boolean'||
         !['enroll_mfa','verify_mfa','reconcile_native_factor','allow_primary'].includes(target.next_step))
        throw new Error('MFA durumu doğrulanamadı');
      const nativeEnabled=native==='enabled';
      const expectedRequired=mode==='required'||(mode==='optional'&&user)||nativeEnabled;
      const expectedStep=mode==='disabled'&&nativeEnabled?'reconcile_native_factor':
        nativeEnabled?'verify_mfa':expectedRequired?'enroll_mfa':'allow_primary';
      if(target.required!==expectedRequired||
         target.user_control_allowed!==(mode==='optional')||target.next_step!==expectedStep)
        throw new Error('MFA hedef durumu doğrulanamadı');
      mfaState=data;
      el('mfa-person').hidden=false;el('mfa-platform').hidden=!data.can_manage_platform;
      el('mfa-enroll-launch').hidden=data.platform.platform_mode==='disabled'||data.native_factor_state==='enabled';
      el('mfa-person').elements.user_enabled.checked=data.personal.user_enabled;
      el('mfa-override').textContent=data.platform.platform_mode==='required'?'Platform tarafından zorunlu':data.platform.platform_mode==='disabled'?'Platform tarafından devre dışı; kişisel tercihiniz korunur':'Kişisel tercihinizi değiştirebilirsiniz';
      el('mfa-management').hidden=data.native_factor_state!=='enabled';el('mfa-disable').hidden=data.platform.platform_mode==='required';
      el('mfa-platform').elements.platform_mode.value=data.platform.platform_mode;
      el('mfa-person').elements.user_enabled.disabled=data.platform.platform_mode!=='optional';
      el('mfa-person').querySelector('button').disabled=data.platform.platform_mode!=='optional';
      const names={required:'Herkes için zorunlu',optional:'Seçime bağlı',disabled:'Devre dışı'};
      const states={enabled:'Etkin native TOTP faktörü var',pending:'TOTP kurulumu doğrulanmamış',not_enrolled:'Etkin TOTP faktörü bulunmuyor'};
      const progress={enroll_mfa:'TOTP kurulumu gerekiyor',verify_mfa:'Native doğrulama gerekli',reconcile_native_factor:'Mevcut TOTP faktörü güvenli biçimde kapatılmadan MFA devre dışı sayılamaz',allow_primary:'İkinci faktör hedef politikada zorunlu değil'};
      const enforcement=data.runtime_enforcement==='enforced'
        ? 'MFA oturum kapsamı denetimi etkin.'
        : 'MFA politikası oturum akışına henüz uygulanmıyor.';
      el('mfa-info').textContent='Platform: '+names[data.platform.platform_mode]+'. '+states[data.native_factor_state]+'. Hedef durum: '+progress[data.effective_mfa_target.next_step]+'. '+enforcement;
    }catch{
      mfaState=null;clearMfaCodes();el('mfa-management').hidden=true;el('mfa-person').hidden=true;el('mfa-platform').hidden=true;smtpSettings=null;el('smtp-platform').hidden=true;
      el('mfa-enroll-launch').hidden=true;
      el('mfa-info').textContent='MFA ayarları henüz hizmete açılmadı.';
    }
  }
`;

// Sentinel for quality/e2e/ismail-368-person-mfa-ui-negative
export const sentinelLinks = `
  async function links(){
};`;

