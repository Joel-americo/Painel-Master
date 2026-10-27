(function(root){
  'use strict';
  const PATH='artifacts/heilog-logistica/public/data/redirects';
  function normalizeDt(value){
    const raw=String(value??'').trim();
    if(!/^\d{1,30}$/.test(raw))throw Error('Digite uma DT válida, somente com números.');
    const dt=raw.replace(/^0+/,'');
    if(!dt)throw Error('A DT zero não pode ser liberada.');
    return dt;
  }
  function allowed(session,unit){return unit==='jacarei'&&!!session?.uid&&(session.isAdmin===true||session.role==='analista');}
  function releaseData(value,session,now=new Date()){
    return {dt:normalizeDt(value),ativo:true,destinoOriginal:'HEILO',liberadoPor:String(session.displayName||session.username||session.uid),liberadoPorUid:session.uid,liberadoEm:now.toISOString(),atualizadoEm:now.toISOString()};
  }
  function mount(api){
    const host=document.getElementById('redirects-toolbar');
    if(!host)return;
    host.innerHTML='<button type="button" data-redirect-open>Liberar DT para a fábrica</button>';
    const dialog=document.createElement('dialog');
    dialog.className='redirects-dialog';
    dialog.setAttribute('aria-labelledby','redirects-title');
    dialog.innerHTML='<header><h2 id="redirects-title">HEILO → Fábrica</h2><button type="button" data-close aria-label="Fechar">✕</button></header><p>Libere a DT real para o motorista buscar novamente no assistente.</p><form><label for="redirect-dt">DT</label><div class="redirects-entry"><input id="redirect-dt" name="dt" inputmode="numeric" autocomplete="off" maxlength="30" placeholder="Número da DT" required><button type="submit">Liberar DT</button></div></form><p data-feedback role="status" aria-live="polite"></p><h3>Liberações ativas</h3><div data-list></div><button type="button" data-reload>Atualizar lista</button>';
    document.body.append(dialog);
    const feedback=dialog.querySelector('[data-feedback]'),list=dialog.querySelector('[data-list]');
    let unsub=null,busy=false,loaded=false,scope='',generation=0;
    const scopeNow=()=>api.session()?.uid+'|'+api.unit();
    const can=()=>allowed(api.session(),api.unit());
    function message(text){feedback.textContent=text;}
    function stop(){generation++;if(unsub)unsub();unsub=null;loaded=false;list.replaceChildren();}
    function sync(){
      host.hidden=!can()||!api.visible();
      if(!can()||scope!==scopeNow()||!api.visible()){
        stop();if(dialog.open)dialog.close();scope=scopeNow();
      }
    }
    function render(rows){
      list.replaceChildren();
      if(!rows.length){list.textContent='Nenhuma DT liberada.';return;}
      for(const row of rows){
        const item=document.createElement('div');item.className='redirects-row';
        const info=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small');
        title.textContent='DT '+row.dt;
        const date=new Date(row.liberadoEm);
        detail.textContent=(row.liberadoPor||'Responsável não informado')+' · '+(Number.isFinite(date.getTime())?date.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Horário não informado');
        info.append(title,detail);
        const button=document.createElement('button');button.type='button';button.textContent='Cancelar liberação';
        button.disabled=busy;
        button.addEventListener('click',async()=>{
          if(busy||!can()||!loaded)return;
          if(!root.confirm('Cancelar a liberação da DT '+row.dt+'?'))return;
          await save(row.dt,false);
        });
        item.append(info,button);list.append(item);
      }
    }
    function watch(){
      stop();if(!can()||!dialog.open)return;
      scope=scopeNow();const expected=scope,epoch=generation;
      message('Carregando liberações…');
      unsub=api.watch(rows=>{
        if(expected!==scopeNow()||epoch!==generation||!can())return;
        loaded=true;render(rows);message('Lista atualizada.');
      },()=>{if(epoch!==generation)return;loaded=false;message('Não foi possível consultar. Confira sua conexão e permissão de acesso.');});
    }
    async function save(value,active){
      if(busy||!can())return;
      let dt;try{dt=normalizeDt(value);}catch(error){message(error.message);return;}
      busy=true;const expected=scopeNow();
      dialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);
      message(active?'Liberando DT…':'Cancelando liberação…');
      try{
        const result=await api.save(dt,active,expected);
        if(expected!==scopeNow()||!can())return;
        message(result==='already-active'?'Essa DT já está liberada.':active?'DT '+dt+' liberada. Oriente o motorista a tocar em Buscar DT novamente.':'Liberação da DT '+dt+' cancelada. Marcações já realizadas permanecem no pátio.');
        if(active)dialog.querySelector('input').value='';
      }catch(error){if(expected===scopeNow())message('Não foi possível salvar a liberação. Confira sua conexão e permissão de acesso.');}
      finally{busy=false;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);sync();}
    }
    host.querySelector('button').addEventListener('click',()=>{if(!can())return;dialog.showModal();watch();dialog.querySelector('input').focus();});
    dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',stop);
    dialog.querySelector('[data-reload]').addEventListener('click',watch);
    dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();save(dialog.querySelector('input').value,true);});
    return {sync};
  }
  root.HeilogRedirects={PATH,normalizeDt,allowed,releaseData,mount};
})(typeof window==='undefined'?globalThis:window);
