(function(root){
  'use strict';
  const routes=new Set(['lusitana','driver-code-check']);
  function apiBase(){
    const value=String(root.HEILOG_PAGES_CONFIG?.apiBaseUrl||'').trim();
    if(!value)return null;
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Configure a API com uma origem HTTPS válida, sem caminho.');
    return url.origin;
  }
  root.HeilogPages={
    apiEnabled(){try{return !!apiBase();}catch{return false;}},
    async apiFetch(route,options={}){
      if(!routes.has(route))throw Error('Rota de integração inválida.');
      const base=apiBase();
      if(!base)throw Error('API externa não configurada. As informações existentes foram preservadas.');
      return root.fetch(base+'/api/'+route,{...options,credentials:'omit',redirect:'error',mode:'cors'});
    }
  };
  // A página não guarda HTML ou respostas do Firebase em um cache offline próprio.
  let prompt=null;
  root.addEventListener?.('beforeinstallprompt',event=>{event.preventDefault();prompt=event;showInstall();});
  let authenticated=false;
  root.addEventListener?.('message',event=>{
    if(event.origin!==root.location.origin||event.source!==root||event.data?.type!=='heilog-auth-state')return;
    authenticated=event.data.authenticated===true;showInstall();
  });
  function showInstall(){
    if(!root.document?.body)return;
    let button=root.document.getElementById('pages-install');
    if(!button){button=root.document.createElement('button');button.id='pages-install';button.type='button';button.textContent='Instalar aplicativo';button.style.cssText='position:fixed;right:18px;bottom:18px;z-index:1000;padding:12px 18px;background:#047857;color:white;border-radius:12px;border:0;font-weight:700';root.document.body.append(button);button.onclick=async()=>{if(!prompt)return;await prompt.prompt();await prompt.userChoice;prompt=null;showInstall();};}
    button.hidden=!prompt||!authenticated;
  }
})(window);
