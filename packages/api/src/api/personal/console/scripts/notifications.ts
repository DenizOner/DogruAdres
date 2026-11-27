// Kişisel konsol istemci betiği: notifications.ts
export const scriptNotifications: string = `  function clearNotifications(){
    notificationRequest++;notificationOffset=0;notificationNext=null;
    el('notification-bell').hidden=true;el('notification-bell').setAttribute('aria-expanded','false');
    el('notification-panel').hidden=true;el('notification-list').replaceChildren();
    el('notification-count').textContent='';el('notification-status').textContent='';
    el('notification-next').hidden=true;
  }
  async function notifications(offset=0){
    const request=++notificationRequest;
    // currentOrg is set only after the selected Organization has been
    // confirmed by the server. No selected Organization = personal inbox.
    // The server independently validates membership for every GET and POST.
    const org=currentOrg,orgRequest=organizationRequest;
    const epoch=viewEpoch,person=currentPersonId;
    const stillCurrent=()=>request===notificationRequest&&
      org===currentOrg&&orgRequest===organizationRequest&&
      epoch===viewEpoch&&person===currentPersonId&&
      !document.hidden&&!el('workspace').hidden;
    const notificationPath='/organization/notifications'+
      (org?'?organization='+encodeURIComponent(org):'');
    el('notification-list').replaceChildren();el('notification-list').setAttribute('aria-busy','true');
    el('notification-status').textContent='Bildirimler yükleniyor…';el('notification-count').textContent='';
    el('notification-next').hidden=true;
    try{
      const data=await api(notificationPath+(org?'&':'?')+'offset='+offset);
      if(!stillCurrent())return;
      notificationOffset=offset;notificationNext=data.next_offset;
      el('notification-count').textContent='('+data.unread_count+' okunmamış)';
      el('notification-next').hidden=notificationNext===null;
      for(const item of data.notifications){
        const row=document.createElement('li'),heading=document.createElement('h3'),text=document.createElement('p'),time=document.createElement('time'),state=document.createElement('p');
        heading.textContent=item.title;text.textContent=item.context+' — '+item.description;
        time.dateTime=new Date(item.created_at).toISOString();time.textContent=new Date(item.created_at).toLocaleString('tr-TR');
        state.textContent=item.read_at?'Okundu':'Okunmadı';row.append(heading,text,time,state);
        if(!item.read_at){
          const button=document.createElement('button');button.type='button';button.textContent='Okundu işaretle';
          button.setAttribute('aria-label',item.title+' — okundu işaretle');
          button.onclick=async()=>{
            if(!stillCurrent())return;button.disabled=true;
            try{
              await api(notificationPath,{method:'POST',body:JSON.stringify({id:item.id})});
              if(!stillCurrent())return;
              el('notification-refresh').focus();await notifications(notificationOffset);
            }catch(e){
              if(!stillCurrent())return;
              if([401,403].includes(e.httpStatus)){concealPrivateView();el('login').hidden=false;status('Giriş gerekli');return}
              el('notification-status').textContent=e.uncertain?'Okundu sonucu belirsiz. Yenile ile sunucudaki durumu kontrol edin.':'Bildirim güncellenemedi. Yenileyin.';
              // Never automatically resubmit an uncertain mutation.
            }
          };row.append(button);
        }
        el('notification-list').append(row);
      }
      el('notification-status').textContent=data.notifications.length?'Bildirimler güncellendi.':'Henüz bildirim yok.';
    }catch(e){
      if(!stillCurrent())return;
      if([401,403].includes(e.httpStatus)){concealPrivateView();el('login').hidden=false;status('Giriş gerekli');return}
      el('notification-status').textContent='Bildirimler yüklenemedi. Yenileyin.';
    }finally{if(stillCurrent())el('notification-list').setAttribute('aria-busy','false')}
  }
  function closeNotifications(){el('notification-panel').hidden=true;el('notification-bell').setAttribute('aria-expanded','false');el('notification-bell').focus()}
  el('notification-bell').onclick=()=>{
    if(!el('notification-panel').hidden){closeNotifications();return}
    el('notification-panel').hidden=false;el('notification-bell').setAttribute('aria-expanded','true');el('notification-heading').focus();void notifications();
  };
  el('notification-refresh').onclick=()=>notifications();
  el('notification-next').onclick=()=>{if(notificationNext!==null)void notifications(notificationNext)};
  el('notification-close').onclick=closeNotifications;
  el('notification-settings-link').onclick=()=>{
    el('notification-panel').hidden=true;
    el('notification-bell').setAttribute('aria-expanded','false');
    const sec=el('notification-preferences-section');
    if(!sec.hidden){
      el('notif-pref-advanced').open=true;
      sec.scrollIntoView?.({behavior:'smooth',block:'start'});
      sec.focus();
    }
  };
  el('notification-panel').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closeNotifications()}};
  function clearMfaCodes(){recoveryCodes=[];el("mfa-codes-value").textContent="";el("mfa-codes-value").hidden=true;el("mfa-codes").hidden=true}
  let currentOrg='',currentPersonId='',linkIntent='',organizationRequest=0,storeRequest=0,mfaState=null,timelineCursor=null,timelineOrg='',timelineRequest=0;
  let notifPrefVersion=null,notifPrefData=null,notifPrefRequest=0;
  const notifCategoryLabels={
    security_account:'Güvenlik, Hesap ve Oturum (Zorunlu)',
    owner_closing:'Owner Yetkisi ve Mağaza Kapatma (Zorunlu)',
    organization_membership:'Şirket Üyeliği ve Davetler',
    store_operations:'Mağaza Başvuruları ve Durumu',
    buyer_orders:'Alıcı Sipariş ve İade İşlemleri',
    seller_operations:'Satıcı Teklif, Katalog ve Stok',
    platform_announcements:'Platform Duyuruları',
    marketing_promotions:'Tanıtım ve Pazarlama',
  };
  function clearNotificationPreferences(){
    notifPrefRequest++;notifPrefVersion=null;notifPrefData=null;
    el('notification-preferences-section').hidden=true;
    el('notif-pref-rows').replaceChildren();
    el('notif-pref-status').textContent='';
  }
  function renderNotificationPreferences(){
    const tbody=el('notif-pref-rows');
    tbody.replaceChildren();
    if(!notifPrefData)return;
    for(const cat of notifPrefData.categories){
      const pref=notifPrefData.preferences[cat.id];
      const tr=document.createElement('tr');
      const tdName=document.createElement('td');
      const catLabel=notifCategoryLabels[cat.id]||cat.id;
      tdName.textContent=catLabel;
      const tdPlat=document.createElement('td');
      const cbPlat=document.createElement('input');
      cbPlat.type='checkbox';cbPlat.checked=Boolean(pref.platform);cbPlat.disabled=Boolean(cat.critical);
      cbPlat.setAttribute('aria-label',catLabel+' — Platform içi');
      cbPlat.onchange=()=>{pref.platform=cbPlat.checked};
      tdPlat.append(cbPlat);
      const tdEmail=document.createElement('td');
      const sel=document.createElement('select');
      sel.disabled=Boolean(cat.critical);
      sel.setAttribute('aria-label',catLabel+' — E-posta');
      const opts=cat.critical?[['immediate','Anında']]:[['immediate','Anında'],['daily_digest','Günlük özet'],['off','Kapalı']];
      for(const [val,lbl] of opts){
        const o=document.createElement('option');o.value=val;o.textContent=lbl;sel.append(o);
      }
      sel.value=pref.email;
      sel.onchange=()=>{pref.email=sel.value};
      tdEmail.append(sel);
      const tdMob=document.createElement('td');
      const cbMob=document.createElement('input');
      cbMob.type='checkbox';cbMob.checked=false;cbMob.disabled=true;
      cbMob.setAttribute('aria-label',catLabel+' — Mobil');
      cbMob.title='Desteklenmiyor (mobil bildirim izni/sağlayıcısı yok)';
      tdMob.append(cbMob);
      tr.append(tdName,tdPlat,tdEmail,tdMob);
      tbody.append(tr);
    }
  }
  async function refreshNotificationPreferences(){
    const reqId=++notifPrefRequest,epoch=viewEpoch,person=currentPersonId;
    el('notification-preferences-section').hidden=true;
    try{
      const result=await api('notification-preferences');
      if(reqId!==notifPrefRequest||epoch!==viewEpoch||person!==currentPersonId||document.hidden||el('workspace').hidden)return false;
      notifPrefVersion=result.version;
      notifPrefData=result;
      renderNotificationPreferences();
      el('notification-preferences-section').hidden=false;
      return true;
    }catch{
      if(reqId!==notifPrefRequest||epoch!==viewEpoch||person!==currentPersonId)return false;
      clearNotificationPreferences();
      el('notif-pref-status').textContent='Bildirim tercihleri şu anda okunamıyor.';
      return false;
    }
  }
  async function saveNotificationPreferences(action){
    if(notifPrefVersion===null||!notifPrefData||el('workspace').hidden)return;
    const saveBtn=el('notif-pref-save'),resetBtn=el('notif-pref-reset');
    saveBtn.disabled=true;resetBtn.disabled=true;
    const table=el('notif-pref-table');
    const tableControls=table?Array.from(table.querySelectorAll('input, select')):null;
    if(tableControls)tableControls.forEach(c=>{c.disabled=true;});
    try{
      const payload=action==='reset_defaults'
        ?{action:'reset_defaults',expected_version:notifPrefVersion}
        :{action:'update',preferences:notifPrefData.preferences,expected_version:notifPrefVersion};
      const result=await api('notification-preferences',{method:'POST',body:JSON.stringify(payload)});
      notifPrefVersion=result.version;
      notifPrefData=result;
      renderNotificationPreferences();
      el('notif-pref-status').textContent=action==='reset_defaults'
        ?'Bildirim tercihleriniz varsayılanlara döndürüldü.'
        :'Bildirim tercihleriniz kaydedildi.';
    }catch(err){
      if(err?.httpStatus===409){
        await refreshNotificationPreferences();
        el('notif-pref-status').textContent='Tercihler başka bir oturumda değişti. Güncel ayarlar yeniden yüklendi.';
      }else{
        el('notif-pref-status').textContent='Bildirim tercihleri kaydedilemedi.';
      }
    }finally{
      saveBtn.disabled=false;resetBtn.disabled=false;
      renderNotificationPreferences();
    }
  }
  el('notif-pref-save').onclick=()=>void saveNotificationPreferences('update');
  el('notif-pref-reset').onclick=()=>void saveNotificationPreferences('reset_defaults');
  let mobileVersion=null,mobileRequest=0;
`;

