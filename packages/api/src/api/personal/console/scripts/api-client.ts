// Kişisel konsol istemci betiği: api-client.ts
export const scriptApiClient: string = `  let viewEpoch=0,loadedScope='',observing=false,selectedStoreOwner=false;
  let csrf=''; const el=id=>document.getElementById(id); const status=t=>el('status').textContent=t;
  async function api(path,options={}){
    const epoch=viewEpoch;let r;
    try{r=await fetch(path.startsWith('/')?path:'/personal/'+path,{credentials:'same-origin',...options,
      headers:{'Content-Type':'application/json','x-csrf-token':csrf,...options.headers}})}
    catch{const e=new Error('Sonuç belirsiz. İşlemi yeniden göndermeyin; kayıt kontrolü gerekli.');
      e.uncertain=true;throw e}
    // Even HTTP 200 cannot prove a price-group POST's outcome if its body is
    // truncated, unreadable or not a JSON object. Do not claim rejection.
    const groupWrite=path==='/organization/store-price-groups'&&options.method==='POST';
    const draftWrite=path==='organization-applications'&&options.method==='POST';
    const platformOrgAppWrite=path==='/platform/organization-applications'&&options.method==='POST';
    const followWrite=path==='/organization/store-follows'&&options.method==='POST';
    const policyWrite=(path==='/platform/store-application-policy'||path==='platform/store-application-policy')&&options.method==='POST';
    const storeApplicationWrite=path==='/organization/store-applications'&&options.method==='POST';
    const renameWrite=path==='/organization/store-rename-requests'&&options.method==='POST';
    const ownerPauseWrite=path==='/organization/store-owner-pause'&&options.method==='POST';
    const grantWrite=path==='/organization/store-draft-permissions'&&options.method==='POST';
    const platformStoreWrite=(path==='/platform/stores'||path==='platform/stores')&&options.method==='POST';
    const closingWrite=['/organization/store-owner-closing','/organization/store-platform-closing','/organization/store-platform-closing-final-review','/platform/store-closings','platform/store-closings','/platform/store-closing-reviews','platform/store-closing-reviews','/organization/store-platform-closing-email-visit'].includes(path)&&options.method==='POST';
    const write=groupWrite||draftWrite||platformOrgAppWrite||followWrite||policyWrite||storeApplicationWrite||grantWrite||platformStoreWrite||renameWrite||closingWrite||ownerPauseWrite||((path==='/organization/launcher'||path==='/platform/launcher'||path==='platform/launcher')&&options.method==='POST');
    let data;
    try{
      data=await r.json();
      if(write&&(!data||typeof data!=='object'||Array.isArray(data)))
        throw new Error('Geçersiz yazma yanıtı');
    }catch(error){
      if(!write)throw error;
      const e=new Error('Sonuç belirsiz. İşlemi yeniden göndermeyin; kayıt kontrolü gerekli.');
      e.uncertain=true;throw e;
    }
    if(epoch!==viewEpoch)throw new Error('Görünüm yenilendi');
    if(!r.ok){
      const e=new Error(data?.message||'İşlem reddedildi');
      e.httpStatus=r.status;e.uncertain=r.status>=500;throw e
    }
    return data;
  }
  // Hash fragments never reach a web server or reverse-proxy access log.
  // Reading the link is optional: not visiting never blocks the automatic
  // admin-alert fallback. Do not let email scanners pre-confirm anything.
  let platformMailLinkToken='',platformMailLinkRequest=0,platformMailLinkOpened=false,platformMailLinkPreservedPerson='';
  // Unread email-link capabilities survive an ordinary tab hide, but no
  // private reason, in-flight verification or cross-Person authority survives.
  function clearPrivateClosingEmailLink(preserveUnopened=false){
    const msg=el('platform-closing-email-link-status');
    const keep=preserveUnopened===true&&!!platformMailLinkToken&&
      !platformMailLinkOpened&&!msg.textContent;
    platformMailLinkRequest++; // invalidate every pending async response
    if(keep){
      if(!platformMailLinkPreservedPerson)
        platformMailLinkPreservedPerson=currentPersonId;
    }else{
      platformMailLinkToken='';
      platformMailLinkPreservedPerson='';
    }
    platformMailLinkOpened=false;
    msg.textContent='';
    el('platform-closing-email-link-panel').hidden=true;
    const button=el('platform-closing-email-link-open');
    button.hidden=false;button.disabled=false;
  }
  const hashMatch=typeof location!=='undefined'&&typeof location.hash==='string'?
    location.hash.match(/^#closing_notice=([a-f0-9]{64})$/):null;
  if(hashMatch){
    platformMailLinkToken=hashMatch[1];
    if(typeof history!=='undefined'&&typeof history.replaceState==='function')
      history.replaceState(null,'',location.pathname+location.search);
    el('platform-closing-email-link-panel').hidden=false;
  }
  if(typeof el==='function' && el('platform-closing-email-link-open'))
    el('platform-closing-email-link-open').onclick=async()=>{
    const msg=el('platform-closing-email-link-status');
    const epoch=viewEpoch,person=currentPersonId,request=++platformMailLinkRequest;
    if(!platformMailLinkToken||!person)return;
    if(document.hidden||el('workspace').hidden){
      msg.textContent='Önce güvenli kişisel hesabınızda oturum açın.';
      return;
    }
    const button=el('platform-closing-email-link-open');
    platformMailLinkOpened=true;
    button.disabled=true;
    msg.textContent='Mağaza bildirimi güvenli biçimde doğrulanıyor…';
    try{
      const result=await api('/organization/store-platform-closing-email-visit',{
        method:'POST',
        body:JSON.stringify({token:platformMailLinkToken})
      });
      if(request!==platformMailLinkRequest||epoch!==viewEpoch||
         person!==currentPersonId||document.hidden||el('workspace').hidden)return;
      if(result.viewed!==true||typeof result.reason!=='string'||
         typeof result.deadline_started!=='boolean')
        throw Error('Bildirimin kimliği doğrulanamadı');
      msg.textContent='Mağaza kapatma kararının gerekçesi: '+
        result.reason+
        (result.deadline_started?
         '. İtiraz süreci işlemektedir. Ayrıntıları kuruluş alanınızdan inceleyin.':
         '. İtiraz saati henüz başlamadı.');
      platformMailLinkToken='';
      platformMailLinkPreservedPerson='';
      button.hidden=true;
    }catch{
      if(request!==platformMailLinkRequest||epoch!==viewEpoch||
         person!==currentPersonId||document.hidden||el('workspace').hidden)return;
      msg.textContent='Bağlantı doğrulanamadı. Güncel ve yetkili kuruluş alanınızdan kapatma bildirimini kontrol edin.';
      button.disabled=false;
    }
  };

`;

