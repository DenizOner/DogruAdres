// Sıkıştırılmış konsol CSS stilleri (WCAG 2.2 ve responsive UI kuralları)
export const consoleStyles: string = `  :root{color-scheme:light;--ink:#243247;--muted:#506079;--line:#d6dfea;--accent:#1453a3;--error:#ba1a1a;--error-bg:#ffdad6;--error-text:#93000a;--success:#1a6a1a;--success-bg:#d4edda;--warn:#7a5a00;--warn-bg:#fdf4d7;--focus-ring:#4c91e5;--focus-offset:3px;--inv-border:#c1c6d4;--inv-bg:#f9f9ff;--inv-heading:#004e99;--inv-mismatch-border:#ba1a1a;--inv-card-border:#bfd5ff;--inv-btn-bg:#0e66c2}
  *{box-sizing:border-box}
  [hidden]{display:none!important}
  body{margin:0;padding:0 1rem 3rem;background:#f6f8fb;color:var(--ink);font:16px/1.5 system-ui,-apple-system,sans-serif}
  body>#personal-header,body>p,body>#status,body>form,body>#workspace,main,main>p,main>#status,main>form,main>#workspace{max-width:60rem;margin-left:auto;margin-right:auto}
  main{outline:none}
  #personal-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem;margin-top:2.5rem;margin-bottom:.1rem}
  #personal-header h1{margin:0;font-size:clamp(1.8rem,4vw,2.5rem)}
  body>p,main>p:first-child{margin-top:.15rem;color:var(--muted)}
  #status{min-height:2.5rem;margin-top:1rem;margin-bottom:1rem;padding:.65rem 1rem;border-left:3px solid var(--accent);background:#eaf1fa;border-radius:.35rem}
  #login,#challenge{max-width:30rem;margin-top:1.25rem;padding:1.25rem;border:1px solid var(--line);border-radius:1rem;background:white}
  #login .da-help-text{margin:.5rem 0 0;font-size:.875rem;font-weight:400;color:var(--muted);text-align:center}
  #login .da-help-text a{color:var(--accent)}
  #notification-panel{max-width:60rem;margin:1rem auto;padding:1rem;border:1px solid var(--line);border-radius:.9rem;background:white;scroll-padding-top:4rem}
  #notification-list{padding-left:1.5rem;overflow-wrap:anywhere}
  #notification-list li{margin-bottom:1.5rem}
  #personal-header>div{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:flex-end}
  #workspace{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;align-items:start}
  #workspace>h2{grid-column:1/-1;margin:1.5rem 0 0;font-size:1.4rem}
  #workspace>h2+p{grid-column:1/-1;margin:0;color:var(--muted)}
  #workspace>p:first-child,#workspace>#organizations,#workspace>#memberships,#workspace>#bindings,#workspace>#mfa-info,#workspace>section{grid-column:1/-1}
  #workspace>:not(h2):not(h2+p){min-width:0}
  #workspace>form,#workspace>div,#workspace>pre,#workspace>p,#workspace>button,#workspace>section{margin:0;padding:1rem;border:1px solid var(--line);border-radius:.9rem;background:white}
  form{display:grid;gap:.8rem}
  label{display:grid;gap:.3rem;font-size:.95rem;font-weight:600}
  input,select,button{font:inherit;max-width:100%;border-radius:.5rem}
  input,select{width:100%;min-height:2.75rem;padding:.55rem .7rem;border:1px solid #9aa9bd;background:white;color:var(--ink)}
  button{min-height:2.75rem;padding:.55rem .9rem;border:1px solid #b1c2d8;background:#edf3fb;color:#153f77;cursor:pointer;overflow-wrap:anywhere}
  button:hover:not(:disabled){background:#dfeafa}
  button:disabled{opacity:.58;cursor:not-allowed}
  button:focus-visible,input:focus-visible,select:focus-visible,details>summary:focus-visible,a:focus-visible{outline:3px solid var(--focus-ring);outline-offset:var(--focus-offset)}
  details>summary{cursor:pointer;border-radius:.35rem}
  #organizations button,#memberships button,#bindings button{margin:.35rem .4rem .35rem 0}
  #bindings p,#memberships p{overflow-wrap:anywhere;padding:.4rem 0;margin:.3rem 0;border-bottom:1px solid var(--line)}
  pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace}
  #workspace>pre{background:#f0f4fa}
  #verification-status{grid-column:1/-1;padding:1rem;border:1px solid var(--line);border-radius:.9rem;background:white}
  #verification-status h2{font-size:1.2rem;margin:0 0 .5rem}
  #verification-status p{margin:.4rem 0;overflow-wrap:anywhere}
  #company-launcher-panel{grid-column:1/-1;padding:1rem;border:1px solid var(--line);border-radius:.9rem;background:white}
  #company-launcher-list{list-style:none;padding:0;margin:1rem 0;display:grid;gap:.75rem}
  #company-launcher-list>li{padding:.75rem 1rem;border:1px solid var(--line);border-radius:.6rem;background:#f9fafb;display:grid;gap:.5rem}
  #company-launcher-list>li>div{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;justify-content:space-between}
  #company-launcher-list>li button{min-height:2.25rem;padding:.35rem .7rem;font-size:.875rem}
  #platform-launcher-panel{grid-column:1/-1;padding:1rem;border:1px solid var(--line);border-radius:.9rem;background:white}
  #platform-launcher-list{list-style:none;padding:0;margin:1rem 0;display:grid;gap:.75rem}
  #platform-launcher-list>li{padding:.75rem 1rem;border:1px solid var(--line);border-radius:.6rem;background:#f9fafb;display:grid;gap:.5rem}
  #platform-launcher-list>li>div{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;justify-content:space-between}
  #platform-launcher-list>li button{min-height:2.25rem;padding:.35rem .7rem;font-size:.875rem}
  #organization-document-section{margin-top:1rem;padding:1rem;border:1px solid var(--line);border-radius:.6rem;background:#fff}
  #organization-document-dropzone{padding:1rem;border:2px dashed #9aa9bd;border-radius:.5rem;background:#f8fafc;text-align:center}
  #organization-document-dropzone:focus-within{border-color:var(--focus-ring)}
  fieldset{border:1px solid var(--line);border-radius:.6rem;padding:1rem} fieldset label{display:flex;align-items:center;gap:.65rem;margin:.5rem 0} input[type=radio],input[type=checkbox]{width:auto;min-height:auto}
  .da-invitation-section{margin-bottom:1.5rem;padding:1.25rem;border:1px solid var(--inv-border);border-radius:.75rem;background:var(--inv-bg)}
  .da-invitation-section h2{margin-top:0;color:var(--inv-heading)}
  .da-mismatch-banner{padding:.875rem 1.125rem;background:var(--error-bg);border:1px solid var(--inv-mismatch-border);border-radius:.5rem;margin-bottom:1rem}
  .da-mismatch-banner p{color:var(--error-text);font-weight:600;margin:0;font-size:.875rem}
  .da-invitation-card{padding:1.125rem;border:1px solid var(--inv-card-border);border-radius:.5rem;background:#fff}
  .da-invitation-card .da-card-title{margin:0 0 .5rem;font-size:.9375rem;font-weight:600;color:#191c21}
  .da-invitation-card .da-card-desc{margin:0 0 1rem;font-size:.8125rem;color:#414752}
  .da-invitation-card .da-card-result{margin-top:.75rem;font-size:.8125rem;font-weight:500}
  .da-invitation-btn{min-height:2.75rem;padding:.625rem 1.25rem;background:var(--inv-btn-bg);color:#fff;border:none;border-radius:.375rem;font-weight:600;cursor:pointer;font:inherit}
  .da-invitation-btn:hover:not(:disabled){background:#0a52a3}
  .da-invitation-btn:focus-visible{outline:3px solid var(--focus-ring);outline-offset:var(--focus-offset)}
  .da-skip-link{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}
  .da-skip-link:focus{position:fixed;left:1rem;top:1rem;width:auto;height:auto;padding:.65rem 1rem;background:#0e66c2;color:#fff;font-weight:600;border-radius:.5rem;z-index:100;text-decoration:none}
  @media(max-width:700px){body{padding:0 .75rem 2rem}#personal-header{margin-top:1.5rem}#workspace{grid-template-columns:minmax(0,1fr)}}
  @media(max-width:320px){body{padding:0 .5rem 2rem}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto;transition:none!important;animation:none!important}}`;
