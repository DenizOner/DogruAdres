// Kişisel konsol istemci betiği: organizations-select.ts
export const scriptOrganizationsSelect: string = `  async function selectOrg(id){
    // Preserve an unread first-login email link, but never a displayed old
    // explanation when selecting the first/different Organization.
    if(currentOrg!==id&&(currentOrg||
       el('platform-closing-email-link-status').textContent))clearPrivateClosingEmailLink();
    // Never carry a verified role from the previously selected Organization.
    applicationRole='';
    clearNotifications();
    clearCompanyLauncher();
    const request=++organizationRequest;currentOrg='';timelineCursor=null;timelineOrg='';++timelineRequest;el('audit-timeline-section').hidden=true;el('audit-timeline-entries').replaceChildren();el('audit-timeline-status').textContent='';el('invite-member').hidden=true;el('invite-result').textContent='';clearPendingInvitations();el('detail').textContent='';el('actor-result').textContent='';if(typeof el('seller').reset==='function')el('seller').reset();clearMemberships();clearOrganizationStores();history.replaceState(null,'','/personal');
    el('memberships').ariaBusy='true';el('memberships-status').textContent='Üyelikler yükleniyor…';
    try{const result=await api('organizations?id='+encodeURIComponent(id));if(request!==organizationRequest)return;
      currentOrg=id;el('detail').textContent=JSON.stringify(result.organizations[0],null,2);history.replaceState(null,'','/personal?organization='+encodeURIComponent(id));
      void loadCompanyLauncher(id,request);
      el('notification-bell').hidden=false;void notifications();
      const managerRole=result.organizations[0]?.role;
      selectedStoreOwner=managerRole==='owner';
      if(managerRole==='owner'){
        el('memberships-refresh').hidden=false;
        el('invite-member').hidden=false;
        el('pending-invitations-panel').hidden=false;
        el('audit-timeline-section').hidden=false;
        timelineCursor = null;
        await loadTimeline(id);
      }else{
        el('invite-member').hidden=true;
        clearPendingInvitations();
        el('audit-timeline-section').hidden=true;
        timelineCursor = null;
        timelineOrg = '';
        ++timelineRequest;
        el('audit-timeline-entries').replaceChildren();
        el('audit-timeline-status').textContent = '';
      }
      if(managerRole==='owner')await memberships(id,request);
      else if(request===organizationRequest&&currentOrg===id){
        clearMemberships();
        el('memberships-status').textContent='Uye listesi ve davet yonetimi icin yetki gerekli.';
      }
      if(request===organizationRequest&&currentOrg===id){
        if(['owner','member'].includes(managerRole))void storeApplications(id,request,managerRole);
        void organizationStores(id,request);
        void productDraftStores(id,request);
        void buyerContext(id,request);
        if(managerRole==='owner')void buyerFollowList(id,request);
        if(managerRole==='owner')void productPermissions(id,request);
        if(managerRole==='owner')void buyerPermissions(id,request);
        if(managerRole==='owner')void storeDraftPermissions(id,request);
        if(managerRole==='owner')void storeBlockStores(id,request);
      }
      if(request===organizationRequest&&currentOrg===id&&!el('pending-invitations-panel').hidden)
        void pendingInvitations(id,request);
      if(request===organizationRequest)status('Kuruluş erişimi doğrulandı');
    }catch(e){if(request!==organizationRequest)return;currentOrg='';timelineCursor=null;timelineOrg='';++timelineRequest;el('audit-timeline-section').hidden=true;el('audit-timeline-entries').replaceChildren();el('audit-timeline-status').textContent='';el('detail').textContent='';clearMemberships();clearOrganizationStores();clearPendingInvitations();el('memberships-status').textContent=membershipError(e);
      // A removed Organization must remain denied, but its former Member
      // still has a Person-scoped inbox for the revocation notice.
      // The server independently checks the live personal session.
      if(currentPersonId&&!document.hidden&&!el('workspace').hidden){
        el('notification-bell').hidden=false;void notifications();
      }
      status(e.message)}
  }
`;

