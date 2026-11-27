// Kişisel konsol istemci betiği: buyer.ts
export const scriptBuyer: string = `  function clearBuyerFollowList(){
    buyerFollowRequest++;buyerFollowCursor=null;buyerFollowNext=null;
    el('buyer-follow-panel').hidden=true;
    el('buyer-follow-items').replaceChildren();
    el('buyer-follow-status').textContent='';
    el('buyer-follow-next').disabled=true;
  }
  async function buyerFollowList(org,request,after=null){
    if(request!==organizationRequest||currentOrg!==org||
       document.hidden||el('workspace').hidden)return;
    const seq=++buyerFollowRequest,panel=el('buyer-follow-panel');
    const root=el('buyer-follow-items'),message=el('buyer-follow-status');
    const next=el('buyer-follow-next');
    panel.hidden=true;root.replaceChildren();next.disabled=true;
    message.textContent='Bu işletmenin takipleri doğrulanıyor…';
    const current=()=>seq===buyerFollowRequest&&request===organizationRequest&&
      currentOrg===org&&!document.hidden&&!el('workspace').hidden;
    try{
      const q=new URLSearchParams({organization_id:org});
      if(after!==null)q.set('after',after);
      const data=await api('/organization/store-follows?'+q.toString());
      if(!current())return;
      if(data.organization_id!==org||!Array.isArray(data.stores)||
         data.stores.length>20||
         !(data.next_cursor===null||
           (typeof data.next_cursor==='string'&&
            /^sel_[A-Za-z0-9_-]+$/.test(data.next_cursor))))
        throw new Error('Takip listesi doğrulanamadı');
      let previous=after;
      for(const store of data.stores){
        if(typeof store.name!=='string'||store.name.trim()!==store.name||
           !store.name.length||store.name.length>120||
           (store.handle!==null&&(typeof store.handle!=='string'||
             !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(store.handle)))||
           typeof store.seller_id!=='string'||
           !/^sel_[A-Za-z0-9_-]+$/.test(store.seller_id)||
           (previous!==null&&store.seller_id<=previous)||
           !Number.isSafeInteger(store.version)||store.version<1||
           store.version>=2147483647)
          throw new Error('Takip kaydı doğrulanamadı');
        previous=store.seller_id;
      }
      if((data.next_cursor!==null&&
          (!data.stores.length||
           data.next_cursor!==data.stores[data.stores.length-1].seller_id))||
         (data.stores.length<20&&data.next_cursor!==null))
        throw new Error('Takip sayfası doğrulanamadı');
      buyerFollowCursor=after;buyerFollowNext=data.next_cursor;
      for(const store of data.stores){
        const row=document.createElement('li'),button=document.createElement('button');
        const feedback=document.createElement('span');
        if(typeof row.append!=='function'||!button.dataset||
           typeof feedback.setAttribute!=='function')continue;
        const sellerId=store.seller_id,version=store.version;
        button.type='button';
        button.textContent='Takipten çık: '+store.name+
          (store.handle?' ('+store.handle+')':'');
        button.dataset.unfollowSellerId=sellerId;
        feedback.setAttribute('role','status');
        row.append(button,feedback);root.append(row);
        button.onclick=async()=>{
          if(!current()||button.disabled)return;
          button.disabled=true;feedback.textContent='Takipten çıkılıyor…';
          let uncertain=false;
          try{
            const result=await api('/organization/store-follows',{method:'POST',
              body:JSON.stringify({action:'unfollow',organization_id:org,
                seller_id:sellerId,expected_version:version})});
            if(!current())return;
            if(result.organization_id!==org||result.seller_id!==sellerId||
               result.following!==false||result.version!==version+1){
              const e=new Error('Takip sonucu doğrulanamadı');
              e.uncertain=true;throw e;
            }
            // Re-read authorized persistent state; do not infer another Store
            // became visible, or silently repeat an uncertain write.
            await buyerFollowList(org,request,after);
          }catch(error){
            if(!current())return;
            uncertain=!!error.uncertain;
            feedback.textContent=uncertain?
              'Sonuç belirsiz; yeniden göndermeyin. Takipleri yenileyerek kontrol edin.':
              error.httpStatus===409?
                'Takip değişmiş; takipleri yenileyerek kontrol edin.':
                'Takipten çıkılamadı. Güncel yetkiyi kontrol edin.';
          }finally{
            if(current()&&!uncertain)button.disabled=false;
          }
        };
      }
      panel.hidden=false;next.disabled=data.next_cursor===null;
      message.textContent=data.stores.length?
        'Bu işletmenin takip ettiği mağazalar listelendi.':
        'Bu sayfada takip edilen mağaza bulunmuyor.';
    }catch(error){
      if(!current())return;
      root.replaceChildren();panel.hidden=true;next.disabled=true;
      message.textContent='';
    }
  }
  el('buyer-follow-refresh').onclick=()=>{
    if(currentOrg)void buyerFollowList(currentOrg,organizationRequest);
  };
  el('buyer-follow-next').onclick=()=>{
    if(currentOrg&&buyerFollowNext&&!el('buyer-follow-panel').hidden)
      void buyerFollowList(currentOrg,organizationRequest,buyerFollowNext);
  };

  let buyerContextRequest=0,buyerCatalogRequest=0,buyerCatalogPage=0,buyerOrderRequest=0;
  function clearBuyerContext(){
    buyerContextRequest++;buyerCatalogRequest++;buyerOrderRequest++;buyerCatalogPage=0;
    const orderStatus=el('buyer-order-status'),orderItems=el('buyer-order-items');
    if(orderStatus)orderStatus.textContent='';
    if(orderItems)orderItems.replaceChildren();
    const orderForm=el('buyer-order-lookup');
    if(orderForm){
      if(typeof orderForm.reset==='function')orderForm.reset();
      else if(orderForm.elements?.order_group_id)orderForm.elements.order_group_id.value='';
    }
    el('buyer-catalog-prev').disabled=true;
    el('buyer-catalog-next').disabled=true;
    const catalog=el('buyer-catalog-panel');
    if(catalog)catalog.hidden=true;
    const items=el('buyer-catalog-items');
    if(items)items.replaceChildren();
    const catalogStatus=el('buyer-catalog-status');
    if(catalogStatus)catalogStatus.textContent='';
    const panel=el('buyer-context-panel');
    if(panel)panel.hidden=true;
    const statusEl=el('buyer-context-status');
    if(statusEl)statusEl.textContent='';
    const nativeStatus=el('buyer-customer-status');
    if(nativeStatus)nativeStatus.textContent='';
  }
  async function buyerContext(org,request){
    if(request!==organizationRequest||currentOrg!==org||
       document.hidden||el('workspace').hidden)return;
    const panel=el('buyer-context-panel'),statusEl=el('buyer-context-status');
    // Historical unit DOM stubs may not carry this new section.
    if(!panel||!statusEl)return;
    const seq=++buyerContextRequest;
    panel.hidden=true;
    statusEl.textContent='';
    try{
      const data=await api('/organization/buyer-context?organization_id='+encodeURIComponent(org));
      if(seq!==buyerContextRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden||el('workspace').hidden)return;
      if(data.organization_id!==org||
         data.status!=='buyer_permission_verified'||data.checkout_ready!==false)
        throw new Error('Kuruluş satın alma yetkisi doğrulanamadı');
      statusEl.textContent='Bu kuruluş adına satın alma izniniz doğrulandı. Sepet ve ödeme henüz kullanıma açık değil.';
      panel.hidden=false;
      void buyerCatalog(org,request);
    }catch(e){
      if(seq!==buyerContextRequest||request!==organizationRequest||
         currentOrg!==org)return;
      statusEl.textContent='';
      panel.hidden=true;
    }
  }
  // Historical order detail requires a live, server-verified Buyer Organization
  // on EVERY lookup. The browser supplies only a selector, never native tokens.
  const buyerOrderForm=el('buyer-order-lookup');
  if(buyerOrderForm)buyerOrderForm.onsubmit=async event=>{
    event.preventDefault();
    const org=currentOrg,epoch=organizationRequest,seq=++buyerOrderRequest;
    const statusEl=el('buyer-order-status'),root=el('buyer-order-items');
    root.replaceChildren();
    statusEl.textContent='';
    if(!org||document.hidden||el('workspace').hidden||
       el('buyer-context-panel').hidden)return;
    const id=buyerOrderForm.elements.order_group_id.value.trim();
    if(!/^og_[A-Za-z0-9_-]{1,123}$/.test(id)){
      statusEl.textContent='Geçerli bir sipariş grubu kodu girin.';return;
    }
    const valid=()=>seq===buyerOrderRequest&&epoch===organizationRequest&&
      currentOrg===org&&!document.hidden&&!el('workspace').hidden&&
      !el('buyer-context-panel').hidden;
    statusEl.textContent='Sipariş ve kuruluş yetkisi denetleniyor…';
    try{
      const params=new URLSearchParams({organization_id:org,order_group_id:id});
      const data=await api('/organization/order-groups?'+params.toString());
      if(!valid())return;
      const group=data?.order_group;
      if(data.organization_id!==org||!group||group.id!==id||
         !Number.isSafeInteger(group.display_id)||!Array.isArray(group.orders)||
         group.orders.length<1||group.orders.length>50)
        throw Error('Order response invalid');
      const nodes=document.createDocumentFragment();
      for(const order of group.orders){
        if(!Number.isSafeInteger(order.display_id)||
           typeof order.status!=='string'||!Array.isArray(order.items)||
           order.items.length<1||order.items.length>100)
          throw Error('Order scope invalid');
        const li=document.createElement('li');
        li.textContent='Sipariş #'+order.display_id+' — Durum: '+order.status;
        const items=document.createElement('ul');
        for(const item of order.items){
          if(typeof item.title!=='string'||!Number.isSafeInteger(item.quantity))
            throw Error('Order item invalid');
          const line=document.createElement('li');
          line.textContent=item.title+' — '+item.quantity+' adet';
          items.append(line);
        }
        li.append(items);nodes.append(li);
      }
      root.replaceChildren(nodes);
      statusEl.textContent='Bu kuruluşa ait geçmiş sipariş doğrulandı.';
    }catch{
      if(!valid())return;
      root.replaceChildren();
      statusEl.textContent='Sipariş bulunamadı veya bu kuruluştan görüntüleme yetkiniz yok.';
    }
  };
  async function buyerCatalog(org,request,page=buyerCatalogPage){
    if(request!==organizationRequest||currentOrg!==org||document.hidden||
       el('workspace').hidden||el('buyer-context-panel').hidden||
       !Number.isInteger(page)||page<0||page>4)return;
    const panel=el('buyer-catalog-panel'),statusEl=el('buyer-catalog-status');
    const root=el('buyer-catalog-items'),seq=++buyerCatalogRequest;
    const previous=el('buyer-catalog-prev'),next=el('buyer-catalog-next');
    panel.hidden=true;root.replaceChildren();
    previous.disabled=true;next.disabled=true;
    statusEl.textContent='Yetkili mağaza ürünleri denetleniyor…';
    try{
      const query=new URLSearchParams({organization_id:org,page:String(page)});
      const data=await api('/organization/catalog?'+query.toString());
      if(seq!==buyerCatalogRequest||request!==organizationRequest||currentOrg!==org||
         document.hidden||el('workspace').hidden||
         el('buyer-context-panel').hidden)return;
      if(data.organization_id!==org||data.page!==page||
         data.prices_available!==false||data.checkout_ready!==false||
         !Array.isArray(data.stores)||data.stores.length>20)
        throw Error('Ürün kapsamı doğrulanamadı');
      for(const store of data.stores){
        if(typeof store.id!=='string'||typeof store.name!=='string'||
           !Array.isArray(store.products)||store.products.length>5)
          throw Error('Mağaza ürün kapsamı doğrulanamadı');
        for(const product of store.products){
          if(typeof product.title!=='string'||typeof product.product_id!=='string'||
             typeof product.offer_id!=='string')throw Error('Ürün kapsamı doğrulanamadı');
          const li=document.createElement('li');
          let line=store.name+' — '+product.title;
          if(product.list_price_try!==undefined){
            const price=product.list_price_try;
            if(!price||price.currency_code!=='try'||typeof price.amount!=='number'||
               !Number.isFinite(price.amount)||price.amount<=0||
               price.amount>1000000000||!/^\\d+(?:\\.\\d{1,2})?$/.test(String(price.amount)))
              throw Error('Liste fiyatı doğrulanamadı');
            line+=' — TRY referans liste fiyatı: '+
              new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'})
                .format(price.amount)+' (ödenecek tutar değil)';
          }
          if(product.buyer_reference_try!==undefined){
            const price=product.buyer_reference_try;
            if(!price||price.currency_code!=='try'||typeof price.amount!=='number'||
               !Number.isFinite(price.amount)||price.amount<=0||
               price.amount>1000000000||
               !/^[0-9]+(?:[.][0-9]{1,2})?$/.test(String(price.amount))||
               product.list_price_try===undefined)
              throw Error('Bu işletmeye özel fiyat doğrulanamadı');
            line+=' — Bu işletmeye özel TRY referans fiyatı: '+
              new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'})
                .format(price.amount)+' (ödenecek tutar değil)';
          }
          li.textContent=line;
          root.append(li);
        }
        // A follow belongs to the selected Buyer Organization, not to
        // this Person or to a Medusa Customer account. Unauthorized Members
        // never receive a follow button; Server authorizes every mutation.
        const followRow=document.createElement('li');
        const button=document.createElement('button');
        const feedback=document.createElement('span');
        // Keep the older minimal DOM test harness and non-interactive
        // renderers on the existing read-only catalog path.
        if(typeof followRow.append!=='function'||!button.dataset||
           typeof feedback.setAttribute!=='function')continue;
        button.type='button';button.disabled=true;
        button.textContent='Mağaza takip durumu kontrol ediliyor';
        feedback.setAttribute('role','status');
        followRow.append(button,feedback);root.append(followRow);
        const current=()=>seq===buyerCatalogRequest&&
          request===organizationRequest&&currentOrg===org&&
          !document.hidden&&!el('workspace').hidden&&
          !el('buyer-context-panel').hidden;
        const sellerId=store.id;
        button.dataset.followSellerId=sellerId;
        void (async()=>{
          try{
            const q=new URLSearchParams({organization_id:org,seller_id:sellerId});
            const state=await api('/organization/store-follows?'+q.toString());
            if(!current())return;
            if(state.organization_id!==org||state.seller_id!==sellerId||
               typeof state.following!=='boolean'||!Number.isSafeInteger(state.version)||
               state.version<0||state.version>=2147483647)
              throw new Error('Takip durumu doğrulanamadı');
            let following=state.following,version=state.version;
            const label=()=>button.textContent=following?
              store.name+' mağazasını takipten çık':
              store.name+' mağazasını takip et';
            label();button.disabled=false;
            button.onclick=async()=>{
              if(!current()||button.disabled)return;
              const action=following?'unfollow':'follow';
              const oldVersion=version;
              button.disabled=true;feedback.textContent='Takip işlemi kaydediliyor…';
              let uncertain=false;
              try{
                const result=await api('/organization/store-follows',{method:'POST',
                  body:JSON.stringify({action,organization_id:org,
                    seller_id:sellerId,expected_version:oldVersion})});
                if(!current())return;
                if(result.organization_id!==org||result.seller_id!==sellerId||
                   result.following!==(action==='follow')||
                   result.version!==oldVersion+1){
                  // A successful write may return a malformed 200 response.
                  // Keep the button disabled until a fresh authorized GET.
                  const mismatch=new Error('Takip sonucu doğrulanamadı');
                  mismatch.uncertain=true;
                  throw mismatch;
                }
                following=result.following;version=result.version;label();
                feedback.textContent=following?
                  'Bu işletme mağazayı takip ediyor. Özel fiyat veya ödeme hakkı verilmedi.':
                  'Bu işletme mağazayı takipten çıktı.';
              }catch(error){
                if(!current())return;
                uncertain=!!error.uncertain;
                feedback.textContent=uncertain?
                  'Sonuç belirsiz; yeniden göndermeyin. Ürünleri güncelleyerek kontrol edin.':
                  error.httpStatus===409?
                    'Takip durumu değişmiş; Ürünleri güncelleyerek kontrol edin.':
                    'Takip işlemi reddedildi. Güncel yetkiyi ve mağazayı kontrol edin.';
              }finally{
                if(current()&&!uncertain)button.disabled=false;
              }
            };
          }catch(error){
            if(current())followRow.remove();
          }
        })();
      }
      buyerCatalogPage=page;
      previous.disabled=page===0;next.disabled=page===4;
      statusEl.textContent='Mağaza dilimi '+(page+1)+'/5. '+
        (root.children.length
          ? 'İzinli ürünler ve varsa mağazaya özel TRY referansları gösteriliyor.'
          : 'Bu dilimde gösterilebilir ürün yok; diğer dilimler ayrıca kontrol edilebilir.')+
        ' Vergi, kur dönüşümü ve ödeme kapalıdır.';
      panel.hidden=false;
    }catch(e){
      if(seq!==buyerCatalogRequest||request!==organizationRequest||currentOrg!==org)return;
      root.replaceChildren();panel.hidden=true;
      previous.disabled=true;next.disabled=true;
      statusEl.textContent='';
    }
  }
  el('buyer-catalog-prev').onclick=()=>{
    if(currentOrg&&buyerCatalogPage>0&&!el('buyer-catalog-panel').hidden)
      void buyerCatalog(currentOrg,organizationRequest,buyerCatalogPage-1);
  };
  el('buyer-catalog-next').onclick=()=>{
    if(currentOrg&&buyerCatalogPage<4&&!el('buyer-catalog-panel').hidden)
      void buyerCatalog(currentOrg,organizationRequest,buyerCatalogPage+1);
  };
  el('buyer-catalog-refresh').onclick=()=>{
    if(currentOrg)void buyerCatalog(currentOrg,organizationRequest);
  };
  el('buyer-context-refresh').onclick=()=>{
    if(currentOrg)void buyerContext(currentOrg,organizationRequest);
  };
  el('buyer-customer-check').onclick=async()=>{
    const org=currentOrg,request=organizationRequest;
    const statusEl=el('buyer-customer-status');
    if(!org||document.hidden||el('workspace').hidden||
       el('buyer-context-panel').hidden)return;
    statusEl.textContent='Müşteri bağı kontrol ediliyor…';
    try{
      const result=await api('/organization/buyer-context?organization_id='+
        encodeURIComponent(org)+'&customer=verified');
      if(org!==currentOrg||request!==organizationRequest||
         document.hidden||el('workspace').hidden)return;
      if(result.organization_id!==org||result.status!=='buyer_customer_verified'||
         result.checkout_ready!==false)throw new Error('Müşteri bağı doğrulanamadı');
      statusEl.textContent='Kuruluş izni ve mevcut müşteri bağınız doğrulandı. Sepet ve ödeme hâlâ kapalı.';
    }catch(e){
      if(org===currentOrg&&request===organizationRequest)
        statusEl.textContent='Müşteri bağı doğrulanamadı. Bu kuruluş adına alışverişe geçilemiyor.';
    }
  };
  let buyerPermissionRequest=0;
  function clearBuyerPermissions(){
    buyerPermissionRequest++;
    el('buyer-grants-panel').hidden=true;
    el('buyer-grants-list').replaceChildren();
    el('buyer-grants-status').textContent='';
    const f=el('buyer-grants-form');
    if(typeof f.querySelectorAll==='function'){
      for(const select of f.querySelectorAll('select'))
        if(typeof select.replaceChildren==='function')select.replaceChildren();
      for(const button of f.querySelectorAll('button'))button.disabled=true;
    }
  }
  async function buyerPermissions(org,request,keepOutcome=false){
    if(request!==organizationRequest||currentOrg!==org||document.hidden||
       el('workspace').hidden)return;
    const seq=++buyerPermissionRequest,statusEl=el('buyer-grants-status');
    const form=el('buyer-grants-form'),root=el('buyer-grants-list');
    if(!form||!form.elements||typeof form.elements.namedItem!=='function')return;
    el('buyer-grants-panel').hidden=true;
    if(!keepOutcome)statusEl.textContent='Satın alma yetkileri denetleniyor…';
    try{
      const data=await api('/organization/buyer-permissions?organization_id='+encodeURIComponent(org));
      if(seq!==buyerPermissionRequest||request!==organizationRequest||
         currentOrg!==org||document.hidden)return;
      const members=currentMemberships.slice();
      if(!Array.isArray(data.grants)||data.grants.length>100||members.length>100||
         data.grants.some(g=>typeof g.id!=='string'||
           !/^dabpg_[A-Za-z0-9_-]+$/.test(g.id)||
           typeof g.person_id!=='string'||!/^daprs_[A-Za-z0-9_-]+$/.test(g.person_id)))
        throw new Error('İzin listesi doğrulanamadı');
      const active=members.filter(m=>m.status==='active'&&
        typeof m.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(m.id)&&
        typeof m.person_id==='string'&&/^daprs_[A-Za-z0-9_-]+$/.test(m.person_id));
      if(new Set(active.map(m=>m.id)).size!==active.length||
         new Set(data.grants.map(g=>g.person_id)).size!==data.grants.length)
        throw new Error('Üyelik/izin bilgisi tutarsız');
      const select=form.elements.namedItem('membership_id');
      const previous=select.value;
      select.replaceChildren();
      for(const member of active){
        const option=document.createElement('option');option.value=member.id;
        option.textContent=member.person_id+' — '+member.role;
        select.append(option);
      }
      if(active.some(m=>m.id===previous))select.value=previous;
      root.replaceChildren();
      for(const g of data.grants){
        const line=document.createElement('p');
        line.textContent=g.person_id+' — buyer.purchase';
        root.append(line);
      }
      for(const button of form.querySelectorAll('button'))button.disabled=!active.length;
      el('buyer-grants-panel').hidden=false;
      if(!keepOutcome)statusEl.textContent=data.grants.length?
        'Açık satın alma izinleri gösteriliyor.':'Açık satın alma izni bulunmuyor.';
    }catch(e){
      if(seq!==buyerPermissionRequest||request!==organizationRequest||
         currentOrg!==org)return;
      root.replaceChildren();el('buyer-grants-panel').hidden=true;
      statusEl.textContent='Satın alma izinleri doğrulanamadı. Yeniden deneyin.';
    }
  }
  el('buyer-grants-refresh').onclick=()=>{
    if(currentOrg)void buyerPermissions(currentOrg,organizationRequest);
  };
  el('buyer-grants-form').onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden)return;
    const request=organizationRequest,org=currentOrg,form=event.currentTarget;
    const action=event.submitter?.value;
    if(!org||!['grant','revoke'].includes(action))return;
    const buttons=Array.from(form.querySelectorAll('button'));
    for(const b of buttons)b.disabled=true;
    const membership_id=form.elements.namedItem('membership_id').value;
    try{
      const result=await api('/organization/buyer-permissions',{method:'POST',
        body:JSON.stringify({action,organization_id:org,membership_id})});
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(result.status!==(action==='grant'?'active':'revoked'))
        throw new Error('Yetki sonucu doğrulanamadı');
      el('buyer-grants-status').textContent=action==='grant'?
        'Satın alma izni kaydedildi.':'Satın alma izni iptal edildi.';
      void buyerPermissions(org,request,true);
      void buyerContext(org,request);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      el('buyer-grants-status').textContent=e.uncertain?
        'Sonuç belirsiz. İşlemi tekrarlamadan önce izinleri yenileyin.':
        'Satın alma izni işlemi reddedildi: '+e.message;
      if(!e.uncertain)for(const b of buttons)b.disabled=false;
    }
  };

  let productPermissionRequest=0,currentMemberships=[];
  async function productPermissions(org,request,keepOutcome=false){
    if(request!==organizationRequest||currentOrg!==org||document.hidden||el('workspace').hidden)return;
    const seq=++productPermissionRequest,statusEl=el('product-grants-status');
    const form=el('product-grants-form'),grantList=el('product-grants-list');
    el('product-grants-panel').hidden=true;
    if(!keepOutcome)statusEl.textContent='İzinler doğrulanıyor…';
    try{
      // The selected Organization already loaded these member records; do not
      // cause a second membership GET that can race role-change refreshes.
      const members={memberships:currentMemberships.slice()};
      const [stores,grants]=await Promise.all([
        api('/organization/stores?organization='+encodeURIComponent(org)),
        api('/organization/store-product-permissions?organization_id='+encodeURIComponent(org))
      ]);
      if(seq!==productPermissionRequest||request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(stores.organization_id!==org||!Array.isArray(stores.stores)||
         !Array.isArray(members.memberships)||!Array.isArray(grants.grants)||
         grants.grants.length>100||members.memberships.length>100||
         stores.stores.length>50)throw new Error('İzin kapsamı doğrulanamadı');
      const allowedStores=stores.stores.filter(s=>typeof s?.id==='string'&&
        /^sel_[A-Za-z0-9_-]+$/.test(s.id)&&typeof s.name==='string');
      const active=members.memberships.filter(m=>m.status==='active'&&
        m.role==='member'&&m.protected_owner===false&&
        typeof m.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(m.id)&&
        typeof m.person_id==='string'&&/^daprs_[A-Za-z0-9_-]+$/.test(m.person_id));
      if(allowedStores.length!==stores.stores.length||
         new Set(allowedStores.map(s=>s.id)).size!==allowedStores.length||
         new Set(active.map(m=>m.id)).size!==active.length||
         grants.grants.some(g=>typeof g.id!=='string'||
           !/^daspg_[A-Za-z0-9_-]+$/.test(g.id)||
           !allowedStores.some(s=>s.id===g.seller_id)||
           typeof g.person_id!=='string'||
           !/^daprs_[A-Za-z0-9_-]+$/.test(g.person_id)))
        throw new Error('İzin listesi doğrulanamadı');
      const storeSelect=form.elements.namedItem('seller_id');
      const memberSelect=form.elements.namedItem('membership_id');
      const previousStore=storeSelect.value,previousMember=memberSelect.value;
      storeSelect.replaceChildren();memberSelect.replaceChildren();
      for(const store of allowedStores){
        const option=document.createElement('option');option.value=store.id;
        option.textContent=store.name;storeSelect.append(option);
      }
      for(const member of active){
        const option=document.createElement('option');option.value=member.id;
        option.textContent=member.person_id+' — '+member.role;memberSelect.append(option);
      }
      if(allowedStores.some(s=>s.id===previousStore))storeSelect.value=previousStore;
      if(active.some(m=>m.id===previousMember))memberSelect.value=previousMember;
      // Only the persisted personal grant state is shown; no group or
      // native Mercur entitlement is inferred from this single choice.
      const showPersonalChoice=()=>{
        const member=active.find(m=>m.id===memberSelect.value);
        const store=allowedStores.find(s=>s.id===storeSelect.value);
        const label=el('product-grants-effective');
        if(!member||!store){label.textContent='Seçilebilir aktif çalışan veya onaylı mağaza yok.';return;}
        const granted=grants.grants.some(g=>g.person_id===member.person_id&&g.seller_id===store.id);
        label.textContent=granted?
          'Seçilen mağazada açık kişisel seçim: Yetkili. Ayrıca doğrulanmış Mercur üyeliği gerekir.':
          'Seçilen mağazada açık kişisel izin yok: Yetkisiz. Grup Yetkisi henüz kullanılmıyor.';
      };
      storeSelect.onchange=showPersonalChoice;
      memberSelect.onchange=showPersonalChoice;
      showPersonalChoice();
      grantList.replaceChildren();
      for(const grant of grants.grants){
        const line=document.createElement('p');
        line.textContent=grant.person_id+' — '+grant.seller_id+' — products.edit';
        const member=active.find(m=>m.person_id===grant.person_id&&m.role==='member');
        if(member){
          const connect=document.createElement('button');
          connect.type='button';connect.className='store-member-connect';
          connect.textContent='Mağaza çalışanı bağlantısını tamamla';
          connect.onclick=async()=>{
            if(document.hidden||el('workspace').hidden||
               request!==organizationRequest||currentOrg!==org)return;
            connect.disabled=true;
            statusEl.textContent='Mağaza çalışanı bağlantısı kontrol ediliyor…';
            try{
              const result=await api('/organization/store-member-connections',{method:'POST',
                body:JSON.stringify({organization_id:org,seller_id:grant.seller_id,
                  membership_id:member.id})});
              if(seq!==productPermissionRequest||request!==organizationRequest||
                 currentOrg!==org||document.hidden)return;
              if(result.status!=='connected')throw Error('Bağlantı doğrulanamadı');
              statusEl.textContent='Mağaza çalışanı bağlantısı tamamlandı. Ürün izni ayrıca kontrol edilir.';
              connect.textContent='Mağaza bağlantısı doğrulandı';
            }catch(e){
              if(seq!==productPermissionRequest||request!==organizationRequest||
                 currentOrg!==org)return;
              statusEl.textContent=e.uncertain?
                'Bağlantının sonucu belirsiz. Tekrar göndermeyin; yetkili inceleme gerekli.':
                'Bağlantı reddedildi. Çalışanın kendi üye hesabını doğrulaması, aktif olması ve ürün izni bulunması gerekir.';
              if(!e.uncertain)connect.disabled=false;
            }
          };
          line.append(' ',connect);
        }
        // Historical Organization Admin may retain an earlier personal
        // products.edit grant. Do not permit a new grant or native Store link,
        // but do expose the existing server-authorized revoke operation.
        const legacy=members.memberships.find(m=>m.person_id===grant.person_id&&
          m.role==='admin'&&m.status==='active'&&m.protected_owner===false&&
          typeof m.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(m.id));
        if(legacy){
          const revoke=document.createElement('button');
          revoke.type='button';revoke.textContent='Eski Admin ürün iznini iptal et';
          revoke.onclick=async()=>{
            if(revoke.disabled||seq!==productPermissionRequest||
               request!==organizationRequest||currentOrg!==org||
               document.hidden||el('workspace').hidden)return;
            revoke.disabled=true;
            statusEl.textContent='Eski izin iptali kontrol ediliyor…';
            try{
              const result=await api('/organization/store-product-permissions',{method:'POST',
                body:JSON.stringify({action:'revoke',organization_id:org,
                  seller_id:grant.seller_id,membership_id:legacy.id})});
              if(seq!==productPermissionRequest||request!==organizationRequest||
                 currentOrg!==org||document.hidden)return;
              if(result.status!=='revoked')throw Error('İptal sonucu doğrulanamadı');
              await productPermissions(org,request,true);
              if(request===organizationRequest&&currentOrg===org&&!document.hidden)
                statusEl.textContent='Eski Admin ürün izni iptal edildi.';
              void productDraftStores(org,request);
            }catch(error){
              if(seq!==productPermissionRequest||request!==organizationRequest||
                 currentOrg!==org)return;
              statusEl.textContent=error.uncertain?
                'İptal sonucu belirsiz. Tekrar göndermeyin; izin listesini yenileyip doğrulayın.':
                'Eski ürün izni iptal edilemedi. Yetkiyi ve kaydı kontrol edin.';
              if(!error.uncertain)revoke.disabled=false;
            }
          };
          line.append(' ',revoke);
        }
        grantList.append(line);
      }
      for(const button of form.querySelectorAll('button'))button.disabled=!allowedStores.length||!active.length;
      el('product-grants-panel').hidden=false;
      if(!keepOutcome)statusEl.textContent=grants.grants.length?
        'Aktif ürün düzenleme izinleri gösteriliyor.':'Aktif ürün düzenleme izni bulunmuyor.';
    }catch(e){
      if(seq!==productPermissionRequest||request!==organizationRequest||currentOrg!==org)return;
      grantList.replaceChildren();
      el('product-grants-effective').textContent='';
      el('product-grants-panel').hidden=true;
      statusEl.textContent='İzinler doğrulanamadı. Yeniden deneyin.';
    }
  }
  el('product-grants-refresh').onclick=()=>{
    if(currentOrg)void productPermissions(currentOrg,organizationRequest);
  };
  el('product-grants-form').onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden)return;
    const request=organizationRequest,org=currentOrg,form=event.currentTarget;
    const action=event.submitter?.value;
    if(!org||!['grant','revoke'].includes(action))return;
    const buttons=Array.from(form.querySelectorAll('button'));
    for(const button of buttons)button.disabled=true;
    const seller_id=form.elements.namedItem('seller_id').value;
    const membership_id=form.elements.namedItem('membership_id').value;
    try{
      const outcome=await api('/organization/store-product-permissions',{method:'POST',body:JSON.stringify({
        action,organization_id:org,seller_id,membership_id
      })});
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(!['active','revoked'].includes(outcome.status)||
         outcome.status!==(action==='grant'?'active':'revoked'))
        throw new Error('İzin sonucu doğrulanamadı');
      el('product-grants-status').textContent=action==='grant'?
        'Ürün düzenleme izni kaydedildi; kullanım için ayrıca doğrulanmış Mercur mağaza üyeliği gerekir.':'Ürün düzenleme izni iptal edildi.';
      void productPermissions(org,request,true);
      void productDraftStores(org,request);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      el('product-grants-status').textContent=e.uncertain?
        'Sonuç belirsiz. Yeniden göndermeden önce izin listesini yenileyin.':
        'İzin işlemi reddedildi: '+e.message;
      if(!e.uncertain)for(const button of buttons)button.disabled=false;
    }
  };

  let productDraftRequest=0,productDraftKey='',productDraftAttempt=null;
  function clearProductDraft(){
    productDraftRequest++;productDraftKey='';productDraftAttempt=null;
    el('product-draft-check').hidden=true;
    el('product-draft-panel').hidden=true;
    el('product-draft-guidance').hidden=true;
    el('product-draft-status').textContent='';
    const form=el('product-draft-form');
    form.hidden=true;
    if(typeof form.reset==='function')form.reset();
    if(typeof form.querySelector==='function'){
      const select=form.querySelector('select');if(select&&typeof select.replaceChildren==='function')select.replaceChildren();
      const button=form.querySelector('button');if(button)button.disabled=true;
    }
  }
  async function productDraftStores(org,request,keepOutcome=false){
    if(document.hidden||request!==organizationRequest||currentOrg!==org)return;
    const form=el('product-draft-form');
    // The historical membership DOM contract intentionally contains no
    // product form; only real browser documents have form.elements.
    if(!form||!form.elements||typeof form.elements.namedItem!=='function')return;
    const seq=++productDraftRequest,select=form.elements.namedItem('seller_id');
    const previous=select.value,panel=el('product-draft-panel');
    const guidance=el('product-draft-guidance');
    const submit=typeof form.querySelector==='function'?form.querySelector('button'):null;
    panel.hidden=true;guidance.hidden=true;form.hidden=true;
    if(submit)submit.disabled=true;
    if(!keepOutcome)el('product-draft-status').textContent='Mağaza yetkileri kontrol ediliyor…';
    try{
      const data=await api('/organization/product-drafts?organization_id='+encodeURIComponent(org));
      if(seq!==productDraftRequest||request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(data.organization_id!==org||!Array.isArray(data.stores)||data.stores.length>50||
         data.stores.some(s=>typeof s.id!=='string'||!/^sel_[A-Za-z0-9_-]+$/.test(s.id)||
           typeof s.name!=='string')||
         new Set(data.stores.map(s=>s.id)).size!==data.stores.length)
        throw new Error('Mağaza yetkileri doğrulanamadı');
      select.replaceChildren();
      for(const store of data.stores){
        const option=document.createElement('option');option.value=store.id;
        option.textContent=store.name;select.append(option);
      }
      if(data.stores.some(s=>s.id===previous))select.value=previous;
      panel.hidden=false;
      form.hidden=data.stores.length===0;
      guidance.hidden=data.stores.length!==0;
      if(submit)submit.disabled=data.stores.length===0||!!productDraftAttempt;
      if(!keepOutcome)el('product-draft-status').textContent=data.stores.length?
        'Taslak oluşturabileceğiniz mağazalar hazır.':'Ürün düzenleme yetkisi veya doğrulanmış mağaza üyeliği bulunamadı.';
    }catch(e){
      if(seq!==productDraftRequest||request!==organizationRequest||currentOrg!==org||document.hidden)return;
      select.replaceChildren();form.hidden=true;guidance.hidden=false;
      if(submit)submit.disabled=true;
      panel.hidden=false;
      // Preserve an uncertain native product result; never invite a duplicate POST.
      if(!productDraftAttempt)el('product-draft-status').textContent=
        [401,403].includes(e.httpStatus)?
        'Bu kuruluşta ürün taslağı için işlem izni veya canlı Mercur üyeliği doğrulanamadı.':
        'Mağaza yetkileri şu anda doğrulanamıyor. Taslak oluşturma kapalı; yeniden kontrol edin.';
    }
  }
  el('product-draft-refresh').onclick=()=>{
    if(currentOrg)void productDraftStores(currentOrg,organizationRequest);
  };

  el('product-draft-check').onclick=async()=>{
    const a=productDraftAttempt,request=organizationRequest;
    if(!a||document.hidden||el('workspace').hidden||
       !currentOrg||currentOrg!==a.organization_id)return;
    const button=el('product-draft-check');button.disabled=true;
    try{
      const query=new URLSearchParams({organization_id:a.organization_id,
        seller_id:a.seller_id,request_id:a.request_id});
      const result=await api('/organization/product-drafts?'+query.toString());
      if(request!==organizationRequest||currentOrg!==a.organization_id||document.hidden)return;
      if(result.status==='created'&&/^prod_[A-Za-z0-9_-]+$/.test(result.product_id)){
        el('product-draft-status').textContent='Önceden gönderilen taslak doğrulandı: '+result.product_id;
        productDraftKey='';productDraftAttempt=null;
        button.hidden=true;
        el('product-draft-form').reset();
        el('product-draft-form').querySelector('button').disabled=false;
      }else if(result.status==='review_required'){
        // The reconciliation action verifies an EXISTING native product; it
        // never invokes the Mercur create workflow or replays the draft POST.
        const recovered=await api('/organization/product-drafts',{method:'POST',
          body:JSON.stringify({...a,action:'reconcile'})});
        if(request!==organizationRequest||currentOrg!==a.organization_id||document.hidden)return;
        if(recovered.status==='created'&&/^prod_[A-Za-z0-9_-]+$/.test(recovered.product_id)){
          el('product-draft-status').textContent='Mevcut ürün taslağı doğrulandı: '+recovered.product_id;
          productDraftKey='';productDraftAttempt=null;button.hidden=true;
          el('product-draft-form').reset();
          el('product-draft-form').querySelector('button').disabled=false;
        }else if(recovered.status==='review_required'){
          el('product-draft-status').textContent='Ürün kaydı kesinleşmedi; inceleme gerekli. Yeniden ürün göndermeyin.';
        }else throw new Error('Geçersiz uzlaştırma sonucu');
      }else if(result.status==='unverified'){
        el('product-draft-status').textContent='İstek kaydı doğrulanamadı. Otomatik tekrar yapmayın; inceleme gerekli.';
      }else throw new Error('Geçersiz işlem sonucu');
    }catch(e){
      if(request===organizationRequest&&currentOrg===a.organization_id)
        el('product-draft-status').textContent='Kayıt durumu güvenle doğrulanamadı. Yeniden gönderim yapmayın.';
    }finally{button.disabled=false}
  };
  el('product-draft-form').onsubmit=async event=>{
    event.preventDefault();
    if(document.hidden||el('workspace').hidden||!currentOrg)return;
    const request=organizationRequest,org=currentOrg,form=event.currentTarget;
    const button=form.querySelector('button');button.disabled=true;
    const seller_id=form.elements.namedItem('seller_id').value;
    const title=String(form.elements.namedItem('title').value||'').trim();
    // Preserve this exact key for the entire uncertain operation. Neither a
    // timeout nor a 5xx response may silently create a second native product.
    if(!productDraftKey)productDraftKey='dapd_'+crypto.randomUUID().replaceAll('-','');
    productDraftAttempt={organization_id:org,seller_id,title,request_id:productDraftKey};
    try{
      const result=await api('/organization/product-drafts',{method:'POST',body:JSON.stringify({
        request_id:productDraftKey,organization_id:org,seller_id,title
      })});
      if(request!==organizationRequest||currentOrg!==org||document.hidden)return;
      if(result.status!=='created'||!/^prod_[A-Za-z0-9_-]+$/.test(result.product_id))
        throw new Error('Ürün sonucu doğrulanamadı');
      productDraftKey='';productDraftAttempt=null;el('product-draft-check').hidden=true;
      form.reset();button.disabled=false;
      el('product-draft-status').textContent='Ürün taslağı kaydedildi: '+result.product_id;
      void productDraftStores(org,request,true);
    }catch(e){
      if(request!==organizationRequest||currentOrg!==org)return;
      el('product-draft-check').hidden=false;
      el('product-draft-status').textContent=e.uncertain||e.httpStatus===409?
        'Sonuç belirsiz. Aynı ürünü tekrar göndermeyin; kayıt denetimi gerekli.':
        'Taslak oluşturma reddedildi: '+e.message;
      // Even after a 403 the request may have been reserved before access was
      // revoked. Keep the form disabled; a later new intent is a new action.
    }
  };
`;

