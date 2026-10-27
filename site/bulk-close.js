/* Manual closure is distinct from a recorded loading or gate-exit event. */
(function(root){
 'use strict';
 const limit=50,esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fingerprint=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 async function run(items,close,onProgress=()=>{}){
  if(!items.length||items.length>limit)throw Error('Selecione de 1 a 50 DTs.');
  const results=new Array(items.length);let cursor=0,done=0;
  async function worker(){while(cursor<items.length){const i=cursor++,item=items[i];try{results[i]={id:item.id,ok:true,record:await close(item)};}catch(error){results[i]={id:item.id,ok:false,message:error.message||'Não foi possível finalizar.'};}onProgress(++done,items.length);}}
  await Promise.all([worker(),worker()]);return results;
 }
 function createUI({element,canManage,isVisible,getScope,getRows,describe,close,refresh,toast}){
  const selected=new Set();let filtered=[],page=[],scope='',overdue=false,busy=false;
  const eligible=op=>op&&op.status!=='Cancelado'&&op.status!=='Finalizado'&&!op.encerradoPorNovaMarcacao&&!op.encerramentoManual;
  function update(rows=filtered,visible=page){
   const nextScope=getScope();if(scope!==nextScope){selected.clear();scope=nextScope;}
   filtered=rows.filter(eligible);page=visible.filter(eligible);
   const ids=new Set(filtered.map(op=>op.id));for(const id of selected)if(!ids.has(id))selected.delete(id);
   element.hidden=!isVisible()||!canManage();if(element.hidden){selected.clear();return;}
   element.classList.toggle('has-selection',selected.size>0||busy);
   element.innerHTML=`<label><input type="checkbox" data-bulk-overdue ${overdue?'checked':''}> Mais de 2 horas no pátio</label><button type="button" data-bulk-page ${busy?'disabled':''}>Selecionar esta página</button><button type="button" data-bulk-clear ${!selected.size||busy?'disabled':''}>Limpar seleção</button><strong role="status">${selected.size} selecionada(s)</strong><button type="button" data-bulk-open ${!selected.size||busy?'disabled':''}>Finalizar em lote</button><small>Até 50 DTs por lote · Admin e Analista</small>`;
  }
  function checkbox(op){return canManage()&&isVisible()&&eligible(op)?`<label class="bulk-row-select"><input type="checkbox" data-bulk-id="${esc(op.id)}" ${selected.has(op.id)?'checked':''} ${busy?'disabled':''}> Selecionar DT ${esc(op.dt||'—')}</label>`:'';}
  function syncChecks(){document.querySelectorAll('[data-bulk-id]').forEach(input=>{input.checked=selected.has(input.dataset.bulkId);input.disabled=busy;});}
  function open(){
   if(busy||!canManage())return;
   const expectedScope=getScope(),original=getRows().filter(op=>selected.has(op.id)&&eligible(op));
   if(!original.length||original.length>limit)return toast('Selecione de 1 a 50 DTs.','error');
   // Detach the review from subsequent live snapshots.
   const items=original.map(op=>({id:op.id,version:fingerprint(op),...describe(op)}));
   const modal=document.createElement('div');modal.className='ewm-modal';modal.id='bulk-close-modal';
   const previousFocus=document.activeElement;
   modal.innerHTML=`<form class="ewm-dialog bulk-close-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-close-title"><h3 id="bulk-close-title">Finalizar ${items.length} DT(s) em lote</h3><p>Os registros irão para o Histórico como <strong>Encerrado manualmente</strong>. O tempo total termina na confirmação. As etapas sem registro permanecem sem horário.</p><div class="bulk-review"><table><thead><tr><th>DT</th><th>Placas</th><th>Etapa atual</th></tr></thead><tbody>${items.map(op=>`<tr><td>${esc(op.dt||'—')}</td><td>${esc(op.plates)}</td><td>${esc(op.stage)}</td></tr>`).join('')}</tbody></table></div><label>Motivo do encerramento<textarea name="reason" required maxlength="500" rows="3" placeholder="Informe por que estas DTs serão encerradas..."></textarea></label><p role="status" data-bulk-progress></p><div class="ewm-buttons"><button type="button" data-bulk-cancel>Cancelar</button><button type="submit">Confirmar finalização</button></div></form>`;
   document.body.appendChild(modal);const form=modal.querySelector('form'),reason=form.elements.reason,progress=modal.querySelector('[data-bulk-progress]');
   const dismiss=()=>{if(!busy){modal.remove();previousFocus?.focus();}};
   modal.querySelector('[data-bulk-cancel]').onclick=dismiss;
   modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();dismiss();}if(event.key==='Tab'){const nodes=[...modal.querySelectorAll('button,textarea')].filter(el=>!el.disabled),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
   form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;const motive=reason.value.trim();
    if(!motive){reason.setCustomValidity('Informe o motivo.');reason.reportValidity();reason.oninput=()=>reason.setCustomValidity('');return;}
    if(!canManage()||getScope()!==expectedScope){progress.textContent='A unidade ou o acesso mudou. Feche e confira a seleção novamente.';return;}
    busy=true;update();syncChecks();form.querySelectorAll('button,textarea').forEach(el=>el.disabled=true);
    const batchId='manual-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
    const results=await run(items,item=>close(item,motive,expectedScope,batchId),(done,total)=>{progress.textContent=`Finalizando ${done} de ${total}…`;});
    const successes=results.filter(r=>r.ok),failures=results.filter(r=>!r.ok);
    successes.forEach(r=>selected.delete(r.id));busy=false;refresh(successes.map(r=>r.record));update();syncChecks();
    form.querySelectorAll('button,textarea').forEach(el=>el.disabled=false);
    reason.disabled=true;form.querySelector('[type="submit"]').hidden=true;
    modal.querySelector('[data-bulk-cancel]').textContent='Fechar';
    progress.innerHTML=`<strong>${successes.length} finalizada(s) · ${failures.length} não finalizada(s).</strong>${failures.length?'<ul>'+failures.map(r=>`<li>DT ${esc(items.find(op=>op.id===r.id)?.dt||'—')}: ${esc(r.message)}</li>`).join('')+'</ul><p>As DTs não finalizadas continuam selecionadas para nova conferência.</p>':''}`;
    modal.querySelector('[data-bulk-cancel]').focus();
   };
   reason.focus();
  }
  element.addEventListener('click',event=>{
   if(event.target.closest('[data-bulk-open]'))open();
   if(busy)return;
   if(event.target.closest('[data-bulk-page]')){for(const op of page){if(selected.size>=limit)break;selected.add(op.id);}update();syncChecks();}
   if(event.target.closest('[data-bulk-clear]')){selected.clear();update();syncChecks();}
  });
  element.addEventListener('change',event=>{if(event.target.matches('[data-bulk-overdue]')){overdue=event.target.checked;selected.clear();refresh();}});
  document.getElementById('table-body').addEventListener('change',event=>{const input=event.target.closest('[data-bulk-id]');if(!input||busy||!canManage())return;if(input.checked){if(selected.size>=limit){input.checked=false;toast('Limite de 50 DTs por lote.','error');return;}selected.add(input.dataset.bulkId);}else selected.delete(input.dataset.bulkId);update();});
  return {update,checkbox,overdueOnly:()=>overdue&&canManage()};
 }
 root.HeilogBulk={fingerprint,run,createUI,limit};
})(typeof window==='undefined'?globalThis:window);
