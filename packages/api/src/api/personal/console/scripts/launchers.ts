// Kişisel konsol istemci betiği: launchers.ts
export const scriptLaunchers: string = `  function clearCompanyLauncher(){
    ++companyLauncherRequest;companyLauncherData=null;companyLauncherBusy=false;
    el('company-launcher-panel').hidden=true;
    el('company-launcher-list').replaceChildren();
    el('company-launcher-status').textContent='';
    el('company-launcher-reset').disabled=true;
  }
  function validCompanyLauncherResponse(data,org){
    return data && data.organization_id===org &&
      Number.isSafeInteger(data.version) && data.version>=0 &&
      Array.isArray(data.available_ids) && data.available_ids.length>=1 &&
      data.available_ids.length<=3 &&
      Array.isArray(data.app_ids) &&
      data.app_ids.length===data.available_ids.length &&
      Array.isArray(data.collapsed_ids) &&
      data.collapsed_ids.length<=data.app_ids.length &&
      new Set(data.available_ids).size===data.available_ids.length &&
      data.available_ids.every(id=>Object.hasOwn(companyLauncherTargets,id)) &&
      new Set(data.app_ids).size===data.app_ids.length &&
      data.app_ids.every(id=>data.available_ids.includes(id)) &&
      new Set(data.collapsed_ids).size===data.collapsed_ids.length &&
      data.collapsed_ids.every(id=>data.app_ids.includes(id));
  }
  async function loadCompanyLauncher(org,orgRequest){
    // Older isolated UI harnesses exercise Organization selection without the
    // full personal page's viewEpoch; only the real full page has B20 context.
    if(typeof viewEpoch!=='number'||typeof currentPersonId!=='string')return;
    const seq=++companyLauncherRequest,epoch=viewEpoch,person=currentPersonId;
    companyLauncherData=null;companyLauncherBusy=false;
    el('company-launcher-panel').hidden=true;
    el('company-launcher-list').replaceChildren();
    if(!person||!org||document.hidden)return;
    try{
      const data=await api('/organization/launcher?organization='+encodeURIComponent(org));
      if(seq!==companyLauncherRequest||orgRequest!==organizationRequest||
         epoch!==viewEpoch||person!==currentPersonId||currentOrg!==org||
         document.hidden||el('workspace').hidden)return;
      if(!validCompanyLauncherResponse(data,org))throw Error('Geçersiz şirket başlatıcısı');
      companyLauncherData=data;el('company-launcher-panel').hidden=false;
      el('company-launcher-status').textContent='Yalnız bu şirket için kayıtlı düzen.';
      renderCompanyLauncher();
    }catch{
      if(seq!==companyLauncherRequest||orgRequest!==organizationRequest||
         epoch!==viewEpoch||person!==currentPersonId||currentOrg!==org)return;
      companyLauncherData=null;el('company-launcher-panel').hidden=true;
      el('company-launcher-list').replaceChildren();
    }
  }
  async function saveCompanyLauncher(apps,collapsed,notice){
    const current=companyLauncherData,org=currentOrg,orgRequest=organizationRequest;
    const epoch=viewEpoch,person=currentPersonId,seq=companyLauncherRequest;
    if(!current||companyLauncherBusy||!org||document.hidden||
       el('workspace').hidden)return;
    companyLauncherBusy=true;
    el('company-launcher-reset').disabled=true;
    try{
      const saved=await api('/organization/launcher',{method:'POST',body:JSON.stringify({
        organization:org,app_ids:apps,collapsed_ids:collapsed,
        expected_version:current.version
      })});
      if(seq!==companyLauncherRequest||epoch!==viewEpoch||
         orgRequest!==organizationRequest||currentOrg!==org||
         person!==currentPersonId||document.hidden||el('workspace').hidden)return;
      if(!validCompanyLauncherResponse(saved,org))throw Error('Geçersiz kayıt yanıtı');
      companyLauncherData=saved;
      el('company-launcher-status').textContent=notice;
    }catch(error){
      if(seq!==companyLauncherRequest||epoch!==viewEpoch||
         orgRequest!==organizationRequest||currentOrg!==org||
         person!==currentPersonId)return;
      el('company-launcher-status').textContent=error.uncertain
        ?'Kayıt sonucu belirsiz. Yeniden göndermeden önce güncel düzeni okuyun.'
        :'Düzen kaydedilemedi: '+error.message;
    }finally{
      if(seq===companyLauncherRequest&&epoch===viewEpoch&&
         orgRequest===organizationRequest&&currentOrg===org){
        companyLauncherBusy=false;renderCompanyLauncher();
      }
    }
  }
  function renderCompanyLauncher(){
    const list=el('company-launcher-list');
    // Re-rendering after a keyboard action must not drop focus into <body>.
    const active=document.activeElement;
    const oldCard=active&&typeof active.closest==='function'?
      active.closest('#company-launcher-list > li'):null;
    const focusApp=oldCard&&oldCard.dataset.companyApp;
    const focusAction=active&&active.dataset&&active.dataset.companyAction;
    list.replaceChildren();
    const data=companyLauncherData;
    if(!data)return;
    el('company-launcher-reset').disabled=companyLauncherBusy;
    for(let idx=0;idx<data.app_ids.length;idx++){
      const id=data.app_ids[idx],meta=companyLauncherTargets[id];
      if(!meta)continue;
      const card=document.createElement('li'),row=document.createElement('div');
      card.draggable=!companyLauncherBusy;
      card.dataset.companyApp=id;
      card.setAttribute('aria-label',meta.label);
      const heading=document.createElement('strong');
      heading.textContent=meta.label;
      row.append(heading);
      for(const direction of [-1,1]){
        const control=document.createElement('button');
        control.type='button';
        control.dataset.companyAction=direction<0?'up':'down';
        control.textContent=direction<0?'Yukarı':'Aşağı';
        control.setAttribute('aria-label',meta.label+' — '+control.textContent);
        control.disabled=companyLauncherBusy||idx+direction<0||
          idx+direction>=data.app_ids.length;
        control.onclick=()=>{
          const next=data.app_ids.slice(),other=idx+direction;
          [next[idx],next[other]]=[next[other],next[idx]];
          void saveCompanyLauncher(next,data.collapsed_ids,'Sıra bu şirkette kaydedildi.');
        };
        row.append(control);
      }
      const toggle=document.createElement('button');
      toggle.type='button';
      toggle.dataset.companyAction='toggle';
      const hidden=data.collapsed_ids.includes(id);
      toggle.textContent=hidden?'Bölümü aç':'Bölümü katla';
      toggle.setAttribute('aria-expanded',String(!hidden));
      toggle.setAttribute('aria-label',meta.label+' — '+toggle.textContent);
      toggle.disabled=companyLauncherBusy;
      toggle.onclick=()=>{
        const next=hidden?data.collapsed_ids.filter(item=>item!==id):
          [...data.collapsed_ids,id];
        void saveCompanyLauncher(data.app_ids,next,'Görünüm bu şirkette kaydedildi.');
      };
      row.append(toggle);card.append(row);
      const link=document.createElement('button');
      link.type='button';link.dataset.companyAction='open';
      link.textContent=meta.label+' bölümüne git';
      link.hidden=hidden;link.disabled=companyLauncherBusy;
      link.onclick=()=>{
        const target=document.getElementById(meta.target);
        if(!target||target.hidden){
          el('company-launcher-status').textContent=
            'Bu işlem şu anda kullanılamıyor. Güncel yetkinizi ve sayfayı yenileyin.';
          return;
        }
        target.setAttribute('tabindex','-1');
        if(typeof target.scrollIntoView==='function')target.scrollIntoView({block:'start'});
        if(typeof target.focus==='function')target.focus();
      };
      card.append(link);
      card.ondragstart=event=>{
        if(companyLauncherBusy||!event.dataTransfer){event.preventDefault();return}
        event.dataTransfer.setData('text/plain',id);
        event.dataTransfer.effectAllowed='move';
      };
      card.ondragover=event=>{if(!companyLauncherBusy)event.preventDefault()};
      card.ondrop=event=>{
        event.preventDefault();
        if(companyLauncherBusy||!event.dataTransfer)return;
        const moving=event.dataTransfer.getData('text/plain');
        if(!data.app_ids.includes(moving)||moving===id)return;
        const next=data.app_ids.filter(item=>item!==moving);
        next.splice(next.indexOf(id),0,moving);
        void saveCompanyLauncher(next,data.collapsed_ids,
          'Sürükle-bırak sırası bu şirkette kaydedildi.');
      };
      list.append(card);
    }
    if(focusApp&&focusAction){
      const matching=Array.from(list.children).find(item=>
        item.dataset.companyApp===focusApp);
      const buttons=matching&&Array.from(matching.querySelectorAll('button'));
      const intended=buttons&&buttons.find(button=>
        button.dataset.companyAction===focusAction && !button.disabled && !button.hidden);
      const fallback=buttons&&buttons.find(button=>
        button.dataset.companyAction==='toggle' && !button.disabled);
      const target=intended||fallback;
      if(target&&typeof target.focus==='function')target.focus();
    }
  }
  el('company-launcher-reset').onclick=()=>{
    const data=companyLauncherData;
    if(!data||companyLauncherBusy)return;
    void saveCompanyLauncher(data.available_ids.slice(),[],
      'Standart düzen yalnız bu şirkette kaydedildi.');
  };
  // Platform admin launcher: navigation only among server-verified platform functions
  let platformLauncherData=null,platformLauncherRequest=0,platformLauncherBusy=false;
  const platformLauncherTargets={
    'organization-review':{label:'İşletme başvuruları incelemesi',target:'organization-review-panel'},
    'store-approvals':{label:'Platform mağaza onayları',target:'store-approval-panel'},
    'store-renames':{label:'Mağaza ad/bağlantı değişiklikleri',target:'store-rename-review-panel'},
    'store-closings':{label:'Platform mağaza kapatma süreci',target:'platform-closing-panel'},
    'store-closing-reviews':{label:'Bağımsız mağaza kapatma incelemesi',target:'platform-closing-review-panel'},
    'platform-mfa':{label:'Platform için MFA politikası',target:'mfa-platform'},
    'platform-smtp':{label:'Platform SMTP ve bildirim ayarları',target:'smtp-platform'},
    'store-policy':{label:'Şirket mağaza başvuru hakkı yönetimi',target:'platform-store-policy-panel'}
  };
  function clearPlatformLauncher(){
    ++platformLauncherRequest;platformLauncherData=null;platformLauncherBusy=false;
    el('platform-launcher-panel').hidden=true;
    el('platform-launcher-list').replaceChildren();
    el('platform-launcher-status').textContent='';
    el('platform-launcher-reset').disabled=true;
    const existingPlatBtn=document.getElementById('org-platform-launcher-btn');
    if(existingPlatBtn && typeof existingPlatBtn.remove === 'function')existingPlatBtn.remove();
  }
  function validPlatformLauncherResponse(data){
    return data &&
      Number.isSafeInteger(data.version) && data.version>=0 &&
      Array.isArray(data.available_ids) && data.available_ids.length>=1 &&
      data.available_ids.length<=8 &&
      Array.isArray(data.app_ids) &&
      data.app_ids.length===data.available_ids.length &&
      Array.isArray(data.collapsed_ids) &&
      data.collapsed_ids.length<=data.app_ids.length &&
      new Set(data.available_ids).size===data.available_ids.length &&
      data.available_ids.every(id=>Object.hasOwn(platformLauncherTargets,id)) &&
      new Set(data.app_ids).size===data.app_ids.length &&
      data.app_ids.every(id=>data.available_ids.includes(id)) &&
      new Set(data.collapsed_ids).size===data.collapsed_ids.length &&
      data.collapsed_ids.every(id=>data.app_ids.includes(id));
  }
  async function loadPlatformLauncher(){
    if(typeof viewEpoch!=='number'||typeof currentPersonId!=='string')return;
    const seq=++platformLauncherRequest,epoch=viewEpoch,person=currentPersonId;
    platformLauncherData=null;platformLauncherBusy=false;
    el('platform-launcher-panel').hidden=true;
    el('platform-launcher-list').replaceChildren();
    if(!person||document.hidden)return;
    try{
      const data=await api('/platform/launcher');
      if(seq!==platformLauncherRequest||epoch!==viewEpoch||person!==currentPersonId||
         document.hidden||el('workspace').hidden)return;
      if(!validPlatformLauncherResponse(data))throw Error('Geçersiz platform başlatıcısı');
      platformLauncherData=data;el('platform-launcher-panel').hidden=false;
      el('platform-launcher-status').textContent='Yalnız bu platform yöneticisi için kayıtlı düzen.';
      renderPlatformLauncher();
      const existingPlatBtn=document.getElementById('org-platform-launcher-btn');
      if(existingPlatBtn && typeof existingPlatBtn.remove === 'function')existingPlatBtn.remove();
      const platBtn=document.createElement('button');
      platBtn.type='button';platBtn.id='org-platform-launcher-btn';
      platBtn.textContent='★ DogruAdres — Platform Yönetimi';
      platBtn.style.fontWeight='bold';platBtn.style.borderColor='#1d4ed8';platBtn.style.color='#1d4ed8';
      platBtn.onclick=()=>{
        el('platform-launcher-panel').hidden=false;
        el('platform-launcher-panel').scrollIntoView({behavior:'smooth'});
        const title=el('platform-launcher-title');if(title)title.focus();
      };
      el('organizations').prepend(platBtn);
    }catch{
      if(seq!==platformLauncherRequest||epoch!==viewEpoch||person!==currentPersonId)return;
      platformLauncherData=null;el('platform-launcher-panel').hidden=true;
      el('platform-launcher-list').replaceChildren();
      const existingPlatBtn=document.getElementById('org-platform-launcher-btn');
      if(existingPlatBtn && typeof existingPlatBtn.remove === 'function')existingPlatBtn.remove();
    }
  }
  async function savePlatformLauncher(apps,collapsed,notice){
    const current=platformLauncherData;
    const epoch=viewEpoch,person=currentPersonId,seq=platformLauncherRequest;
    if(!current||platformLauncherBusy||document.hidden||el('workspace').hidden)return;
    platformLauncherBusy=true;
    el('platform-launcher-reset').disabled=true;
    try{
      const saved=await api('/platform/launcher',{method:'POST',body:JSON.stringify({
        app_ids:apps,collapsed_ids:collapsed,expected_version:current.version
      })});
      if(seq!==platformLauncherRequest||epoch!==viewEpoch||person!==currentPersonId||
         document.hidden||el('workspace').hidden)return;
      if(!validPlatformLauncherResponse(saved))throw Error('Geçersiz kayıt yanıtı');
      platformLauncherData=saved;
      el('platform-launcher-status').textContent=notice;
    }catch(error){
      if(seq!==platformLauncherRequest||epoch!==viewEpoch||person!==currentPersonId)return;
      el('platform-launcher-status').textContent=error.uncertain
        ?'Kayıt sonucu belirsiz. Yeniden göndermeden önce güncel düzeni okuyun.'
        :'Düzen kaydedilemedi: '+error.message;
    }finally{
      if(seq===platformLauncherRequest&&epoch===viewEpoch){
        platformLauncherBusy=false;renderPlatformLauncher();
      }
    }
  }
  function renderPlatformLauncher(){
    const list=el('platform-launcher-list');
    const active=document.activeElement;
    const oldCard=active&&typeof active.closest==='function'?
      active.closest('#platform-launcher-list > li'):null;
    const focusApp=oldCard&&oldCard.dataset.platformApp;
    const focusAction=active&&active.dataset&&active.dataset.platformAction;
    list.replaceChildren();
    const data=platformLauncherData;
    if(!data)return;
    el('platform-launcher-reset').disabled=platformLauncherBusy;
    for(let idx=0;idx<data.app_ids.length;idx++){
      const id=data.app_ids[idx],meta=platformLauncherTargets[id];
      if(!meta)continue;
      const card=document.createElement('li'),row=document.createElement('div');
      card.draggable=!platformLauncherBusy;
      card.dataset.platformApp=id;
      card.setAttribute('aria-label',meta.label);
      const heading=document.createElement('strong');
      heading.textContent=meta.label;
      row.append(heading);
      for(const direction of [-1,1]){
        const control=document.createElement('button');
        control.type='button';
        control.dataset.platformAction=direction<0?'up':'down';
        control.textContent=direction<0?'Yukarı':'Aşağı';
        control.setAttribute('aria-label',meta.label+' — '+control.textContent);
        control.disabled=platformLauncherBusy||idx+direction<0||
          idx+direction>=data.app_ids.length;
        control.onclick=()=>{
          const next=data.app_ids.slice(),other=idx+direction;
          [next[idx],next[other]]=[next[other],next[idx]];
          void savePlatformLauncher(next,data.collapsed_ids,'Sıra platform yöneticisinde kaydedildi.');
        };
        row.append(control);
      }
      const toggle=document.createElement('button');
      toggle.type='button';
      toggle.dataset.platformAction='toggle';
      const hidden=data.collapsed_ids.includes(id);
      toggle.textContent=hidden?'Bölümü aç':'Bölümü katla';
      toggle.setAttribute('aria-expanded',String(!hidden));
      toggle.setAttribute('aria-label',meta.label+' — '+toggle.textContent);
      toggle.disabled=platformLauncherBusy;
      toggle.onclick=()=>{
        const next=hidden?data.collapsed_ids.filter(item=>item!==id):
          [...data.collapsed_ids,id];
        void savePlatformLauncher(data.app_ids,next,'Görünüm platform yöneticisinde kaydedildi.');
      };
      row.append(toggle);card.append(row);
      const link=document.createElement('button');
      link.type='button';link.dataset.platformAction='open';
      link.textContent=meta.label+' bölümüne git';
      link.hidden=hidden;link.disabled=platformLauncherBusy;
      link.onclick=()=>{
        if(id==='store-policy'&&el('platform-store-policy-panel')?.hidden){
          el('platform-store-policy-open')?.click();
        }
        const target=document.getElementById(meta.target);
        if(!target||target.hidden){
          el('platform-launcher-status').textContent=
            'Bu işlem şu anda kullanılamıyor. Güncel yetkinizi ve sayfayı yenileyin.';
          return;
        }
        target.setAttribute('tabindex','-1');
        if(typeof target.scrollIntoView==='function')target.scrollIntoView({block:'start'});
        if(typeof target.focus==='function')target.focus();
      };
      card.append(link);
      card.ondragstart=event=>{
        if(platformLauncherBusy||!event.dataTransfer){event.preventDefault();return}
        event.dataTransfer.setData('text/plain',id);
        event.dataTransfer.effectAllowed='move';
      };
      card.ondragover=event=>{if(!platformLauncherBusy)event.preventDefault()};
      card.ondrop=event=>{
        event.preventDefault();
        if(platformLauncherBusy||!event.dataTransfer)return;
        const moving=event.dataTransfer.getData('text/plain');
        if(!data.app_ids.includes(moving)||moving===id)return;
        const next=data.app_ids.filter(item=>item!==moving);
        next.splice(next.indexOf(id),0,moving);
        void savePlatformLauncher(next,data.collapsed_ids,
          'Sürükle-bırak sırası platform yöneticisinde kaydedildi.');
      };
      list.append(card);
    }
    if(focusApp&&focusAction){
      const matching=Array.from(list.children).find(item=>
        item.dataset.platformApp===focusApp);
      const buttons=matching&&Array.from(matching.querySelectorAll('button'));
      const intended=buttons&&buttons.find(button=>
        button.dataset.platformAction===focusAction && !button.disabled && !button.hidden);
      const fallback=buttons&&buttons.find(button=>
        button.dataset.platformAction==='toggle' && !button.disabled);
      const target=intended||fallback;
      if(target&&typeof target.focus==='function')target.focus();
    }
  }
  el('platform-launcher-reset').onclick=()=>{
    const data=platformLauncherData;
    if(!data||platformLauncherBusy)return;
    void savePlatformLauncher(data.available_ids.slice(),[],
      'Standart düzen platform yöneticisinde kaydedildi.');
  };
`;

