// Kişisel konsol istemci betiği: invitations.ts
export const scriptInvitations: string = `  async function links(){
    const root=el('bindings');root.replaceChildren();
    const data=await api('links');
    if(!Array.isArray(data.bindings)||data.bindings.some(item=>
      !item||typeof item.is_primary!=='boolean'||
      !['member','customer'].includes(item.actor_type)||
      typeof item.id!=='string'||typeof item.actor_id!=='string'))
      throw Error('Hesap bağlantıları doğrulanamadı');
    for(const item of data.bindings){
      const primary=item.is_primary===true,active=!item.revoked_at;
      const p=document.createElement('p');
      const label=item.actor_type==='customer'?'müşteri':'satıcı';
      p.textContent=(primary?'Giriş hesabına bağlı '+label+' kaydı':'Doğrulanmış ek '+label+' hesabı')+
        ' — '+(active?'etkin':'bağlantısı kaldırılmış');
      root.append(p);
      // Only server-classified secondary bindings get a removal control.
      // AccountLinking.unlink independently rejects live login bindings.
      if(active&&item.is_primary===false){
        const b=document.createElement('button');
        b.textContent='Bağı kaldır '+item.id;
        b.onclick=async()=>{
          b.disabled=true;
          try{
            await api('links',{method:'POST',body:JSON.stringify({action:'unlink',binding_id:item.id})});
            await links();el('actor-result').textContent='';
            status('Hesap bağı kaldırıldı');
          }catch(e){status(e.message);if(!e.uncertain)b.disabled=false}
        };
        root.append(b);
      }
    }
  }
  function clearPendingInvitations(){
    el('pending-invitations-panel').hidden=true;
    el('pending-invitations').replaceChildren();
    el('pending-invitations-status').textContent='';
  }
  async function pendingInvitations(org,request){
    if(request!==organizationRequest||currentOrg!==org)return;
    const root=el('pending-invitations');
    root.replaceChildren();
    el('pending-invitations-status').textContent='Davetler yükleniyor…';
    try{
      const data=await api('/organization/invitations?organization='+encodeURIComponent(org));
      if(request!==organizationRequest||currentOrg!==org)return;
      if(!Array.isArray(data.invitations))throw new Error('Invalid invitation response');
      for(const invite of data.invitations){
        const p=document.createElement('p');
        p.textContent=invite.recipient_email+' — '+invite.role+' — '+invite.status;
        const button=document.createElement('button');
        button.type='button';
        button.textContent='Daveti iptal et';
        button.onclick=async()=>{
          if(request!==organizationRequest||currentOrg!==org)return;
          button.disabled=true;
          try{
            const outcome=await api('/organization/invitations',{method:'POST',body:JSON.stringify({
              action:'revoke',organization_id:org,invitation_id:invite.id
            })});
            if(request!==organizationRequest||currentOrg!==org)return;
            if(outcome.invitation?.id!==invite.id||outcome.invitation?.status!=='revoked')
              throw new Error('Davet durumu doğrulanamadı');
            await pendingInvitations(org,request);
            status('Davet iptal edildi.');
          }catch(e){
            if(request!==organizationRequest||currentOrg!==org)return;
            status(e.uncertain?'Davet sonucu belirsiz. Yenilemeden işlemi tekrar göndermeyin.':e.message);
            if(!e.uncertain)button.disabled=false;
          }
        };
        root.append(p,button);
      }
      el('pending-invitations-status').textContent=data.invitations.length?'Bekleyen davetler güncellendi.':'Bekleyen davet yok.';
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      root.replaceChildren();
      el('pending-invitations-status').textContent='Davetler görüntülenemiyor. Yeniden yükleyin.';
    }
  }
  el('pending-invitations-refresh').onclick=async()=>{
    if(currentOrg)await pendingInvitations(currentOrg,organizationRequest);
  };
  // B20 company launcher is navigation only; server remains the sole authority
  // for both the Person x Organization pair and every destination API.
  let companyLauncherData=null,companyLauncherRequest=0,companyLauncherBusy=false;
  const companyLauncherTargets={
    organization:{label:'Kuruluş bilgileri',target:'detail'},
    'store-applications':{label:'Mağaza başvuruları',target:'store-application-panel'},
    memberships:{label:'Üyelik yönetimi',target:'memberships'}
  };
`;

