// İlk script: URL'den davet token'ını yakalayıp tarayıcı geçmişinden temizleyen betik
export const consoleEarlyTokenScript: string = `  // Capture once before any subrequest; retain only in this page's memory.
  let invitationToken=null;
  {const url=new URL(location.href);invitationToken=url.searchParams.get('invitation_token');
   if(url.searchParams.has('invitation_token')){url.searchParams.delete('invitation_token');history.replaceState(null,'',url.pathname+url.search+url.hash);}}`;
