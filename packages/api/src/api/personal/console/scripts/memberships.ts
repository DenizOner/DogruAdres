// Kişisel konsol istemci betiği: memberships.ts
export const scriptMemberships: string = `  function clearMemberships(){
    currentMemberships=[];
    el('memberships').replaceChildren();el('memberships').ariaBusy='false';el('memberships-status').textContent='';
    el('memberships-refresh').hidden=true;el('memberships-refresh').disabled=true;
  }
  function membershipError(e){return [401,403,404].includes(e.httpStatus)?'Üyelik listesini görüntüleme izniniz yok.':'Üyelik listesi yüklenemedi. Yeniden deneyin.'}
  async function memberships(org,request){
    if(request!==organizationRequest||currentOrg!==org)return;el('memberships').replaceChildren();
    el('memberships').ariaBusy='true';el('memberships-status').textContent='Üyelikler yükleniyor…';el('memberships-refresh').disabled=true;
    try{const data=await api('/organization/memberships?organization='+encodeURIComponent(org));if(request!==organizationRequest||currentOrg!==org)return;
      if(!Array.isArray(data.memberships))throw new Error('Invalid membership response');
      currentMemberships=data.memberships.map(m=>({id:m.id,person_id:m.person_id,role:m.role,status:m.status,protected_owner:m.protected_owner===true?true:m.protected_owner===false?false:null}));
      const canManageOwners=data.memberships.some(m=>m.person_id===currentPersonId&&m.role==='owner'&&m.protected_owner===true&&m.status==='active');
      for(const m of data.memberships){const p=document.createElement('p');p.textContent=m.person_id+' — '+m.role+' — '+m.status;el('memberships').append(p);
        if(m.status==='active'){
          // Old company Admin records remain intact. Only a current,
          // protected Owner may reduce one to an ordinary Member.
          if(canManageOwners && m.protected_owner===false && m.role==='admin'){
            const rb=document.createElement('button');rb.textContent='Eski şirket Admin kaydını Üye yap '+m.id;
            rb.onclick=async()=>{
              if(request!==organizationRequest||currentOrg!==org)return;rb.disabled=true;
              try{await api('/organization/memberships',{method:'POST',body:JSON.stringify({organization_id:org,membership_id:m.id,role:'member'})});if(request!==organizationRequest)return;await selectOrg(org);status('Eski Admin kaydı Üye olarak güncellendi')}
              catch(e){if(request!==organizationRequest)return;status(e.message);if(!e.uncertain)rb.disabled=false}
            };
            el('memberships').append(rb);
          }
          if(canManageOwners && !m.protected_owner && m.role!=='owner'){
            const ob=document.createElement('button');ob.textContent='Korumalı Owner yap '+m.id;
            ob.onclick=async()=>{
              if(request!==organizationRequest||currentOrg!==org)return;ob.disabled=true;
              try{await api('/organization/memberships',{method:'POST',body:JSON.stringify({action:'protected_owner',organization_id:org,membership_id:m.id,role:'owner'})});if(request!==organizationRequest)return;await selectOrg(org);status('Owner üyeliği güncellendi')}
              catch(e){if(request!==organizationRequest)return;status(e.message);if(!e.uncertain)ob.disabled=false}
            };
            el('memberships').append(ob);
          }
          // Protected Owner removal/reduction is NOT an ordinary member action.
          // It needs the approved notice/appeal workflow; no unsafe button.
          if(m.protected_owner || m.role==='owner'){
            const note=document.createElement('span');
            note.textContent=' Korunan Owner: kaldırma veya rol düşürme için güvenli inceleme süreci gereklidir.';
            el('memberships').append(note);
          }else{
            const b=document.createElement('button');b.textContent='Üyeliği iptal et '+m.id;b.onclick=async()=>{
              if(request!==organizationRequest||currentOrg!==org)return;b.disabled=true;
              try{await api('/organization/memberships',{method:'POST',body:JSON.stringify({organization_id:org,membership_id:m.id})});if(request!==organizationRequest)return;await selectOrg(org)}
              catch(e){if(request!==organizationRequest)return;status(e.message);if(!e.uncertain)b.disabled=false}
            };el('memberships').append(b);
          }}
      }
      el('memberships-status').textContent=data.memberships.length?'Üyelik listesi güncellendi.':'Gösterilecek üyelik bulunmuyor.';
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      el('memberships').replaceChildren();
      el('memberships-status').textContent=membershipError(e);
    }finally{
      if(request===organizationRequest&&currentOrg===org){el('memberships').ariaBusy='false';el('memberships-refresh').disabled=false;}
    }
  }
  el('memberships-refresh').onclick=async()=>{if(currentOrg)await selectOrg(currentOrg)};
  el('org-stores-refresh').onclick=()=>{if(currentOrg)void organizationStores(currentOrg,organizationRequest)};
`;

