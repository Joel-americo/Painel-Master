/* SAP reconciliation: a proposal never writes operational data. */
(function(root){
 'use strict';
 const daily=()=>root.HeilogDaily,minute=60000;
 const labels=['Início do carregamento','Fim do carregamento','Faturamento','Saída de portaria'];
 const fingerprint=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 const clean=v=>daily().norm(v).replace(/[^A-Z0-9]/g,'');
 // Same date/time identifier used by HEILOG when a real DT was not supplied.
 function temporaryDt(value){
  const raw=String(value??'').trim();if(!/^20\d{12}$/.test(raw))return false;
  const y=Number(raw.slice(0,4)),m=Number(raw.slice(4,6)),d=Number(raw.slice(6,8)),h=Number(raw.slice(8,10)),min=Number(raw.slice(10,12)),sec=Number(raw.slice(12,14));
  const date=new Date(Date.UTC(y,m-1,d,h,min,sec));
  return y>=2020&&date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d&&h<24&&min<60&&sec<60;
 }
 function parse(matrix,date,date1904=false){
  const headers=matrix[0]||[],mapping=daily().guess(headers),find=(...names)=>headers.findIndex(h=>names.map(clean).includes(clean(h)));
  const indices=[find('Iníc.carregam.atual'),find('Hr.atual iníc.carga'),find('Fim do carreg.atual'),find('Hora atual fim carga'),find('Dta.procmto.transp.'),find('Hr.at.proc.p/transp.'),find('Fim atual trsp.'),find('Hr.at.fim transp.')];
  const documentDate=find('DT ENTREGA DOCUMENTO'),documentTime=find('HR ENTREGA DOCUMENTO');
  if(mapping.dt<0||mapping.trailer<0||((mapping.arrivalAt<0||mapping.arrivalTime<0)&&(documentDate<0||documentTime<0)))throw Error('Selecione o relatório com Nº transporte, Placa da Carreta e data/hora de registro ou entrega de documento.');
  const stamp=(cells,d,t)=>{
   const value=d>=0?cells[d]:'',clock=t>=0?cells[t]:'';
   if(!value||String(clock??'').trim()==='')return 0;
   const map={dt:mapping.dt,arrivalAt:d,arrivalTime:t};
   return daily().convert([cells],map,{date,date1904})[0]?.arrivalAt||0;
  };
  return matrix.slice(1).map((cells,i)=>{
   const base=daily().convert([cells],mapping,{date,date1904})[0];if(!base)return null;
   return {...base,rowNumber:i+2,registrationAt:stamp(cells,mapping.arrivalAt,mapping.arrivalTime),documentDeliveredAt:stamp(cells,documentDate,documentTime),times:[0,2,4,6].map(k=>stamp(cells,indices[k],indices[k+1]))};
  }).filter(Boolean);
 }
 function propose(rows,records,{maxMinutes=1440}={}){
  if(!Number.isFinite(maxMinutes)||maxMinutes<1||maxMinutes>1440)throw Error('Use uma tolerância entre 1 e 1440 minutos.');
  const entries=rows.map(row=>({row,candidates:[],message:'Sem marcação compatível no HEILOG.'}));
  const passage=op=>(op.operacaoIdOriginal||op.id)+':'+op._mark;
  const unchanged=(op,row)=>{const sap=(op._raw||op).sapBaldeio;return sap&&daily().dt(sap.dt)===daily().dt(row.dt)&&(!row.registrationAt||sap.registrationAt===row.registrationAt)&&(!row.documentDeliveredAt||sap.documentDeliveredAt===row.documentDeliveredAt)&&(row.times||[]).every((ms,i)=>!ms||sap.times?.[i]===ms);};
  const usedPassages=new Set(),usedDts=new Set();
  const ops=[...new Map(records.filter(op=>op._mark&&op.status!=='Cancelado').map(op=>[(op.operacaoIdOriginal||op.id)+':'+op._mark,op])).values()],byPlateDay=new Map(),byPlate=new Map();
  for(const op of ops){const plate=daily().plate(op._trailer),key=plate+':'+daily().day(op._mark);if(!byPlateDay.has(key))byPlateDay.set(key,[]);byPlateDay.get(key).push(op);if(!byPlate.has(plate))byPlate.set(plate,[]);byPlate.get(plate).push(op);}
  for(const e of entries){
   const r=e.row;
   const references=[{at:r.registrationAt,source:'Registro SAP'},{at:r.documentDeliveredAt,source:'Entrega de documento SAP'}].filter(ref=>Number.isFinite(ref.at)&&ref.at>0);
   if(!daily().dt(r.dt)||!r.trailer||!references.length){e.message='DT, placa ou data/hora de registro/entrega de documento SAP ausente.';continue;}
   const samePlate=byPlate.get(daily().plate(r.trailer))||[],sameDay=[...new Set(references.flatMap(ref=>byPlateDay.get(daily().plate(r.trailer)+':'+daily().day(ref.at))||[]))];
   if(!samePlate.length){e.message='Placa não localizada entre os baldeios do Pátio e Histórico desta unidade.';continue;}
   if(!sameDay.length){e.message='Placa localizada, mas sem marcação no mesmo dia do registro ou entrega de documento SAP.';continue;}
   const compatible=sameDay.filter(op=>!daily().dt(op.dt)||temporaryDt(op.dt)||daily().dt(op.dt)===daily().dt(r.dt));
   if(!compatible.length){e.message='Placa localizada no dia, mas já vinculada a outra DT no HEILOG: '+[...new Set(sameDay.map(op=>String(op.dt)))].join(', ')+'.';continue;}
   const nearest=compatible.map(op=>{const ref=references.filter(ref=>daily().day(ref.at)===daily().day(op._mark)).sort((a,b)=>Math.abs(op._mark-a.at)-Math.abs(op._mark-b.at))[0];return {op,delta:Math.abs(op._mark-ref.at),referenceAt:ref.at,referenceSource:ref.source};}).sort((a,b)=>a.delta-b.delta);
   e.candidates=nearest.filter(c=>c.delta<=maxMinutes*minute);
   if(!e.candidates.length)e.message=`Marcação mais próxima a ${Math.round(nearest[0].delta/minute)} min do registro/entrega de documento SAP; tolerância atual: ${maxMinutes} min.`;
  }
  // Reserve existing identical imports before allocating any new spreadsheet rows.
  for(const e of entries){const existing=e.candidates.find(c=>unchanged(c.op,e.row));if(existing){e.already=true;e.existing=existing;usedPassages.add(passage(existing.op));usedDts.add(daily().dt(e.row.dt));e.message='Já atualizado com estes dados; nenhuma nova alteração necessária.';}}
  const edges=entries.filter(e=>!e.already).flatMap((entry,index)=>entry.candidates.map(candidate=>({entry,index,...candidate}))).sort((a,b)=>a.delta-b.delta||b.op._mark-a.op._mark||String(a.entry.row.dt).localeCompare(String(b.entry.row.dt))||a.index-b.index||passage(a.op).localeCompare(passage(b.op)));
  for(const edge of edges){const key=passage(edge.op),dt=daily().dt(edge.entry.row.dt);if(edge.entry.selected||usedPassages.has(key)||usedDts.has(dt))continue;edge.entry.selected=edge;usedPassages.add(key);usedDts.add(dt);}
  return entries.map(e=>{
   const first=e.selected;if(!first)return {row:e.row,ok:false,message:e.already?e.message:e.candidates.length?'Marcação ou DT já utilizada nesta conferência; nenhuma alteração repetida.':e.message};
   return {row:e.row,op:first.op,delta:first.delta,referenceAt:first.referenceAt,referenceSource:first.referenceSource,version:fingerprint(first.op._raw||first.op),ok:true,message:temporaryDt(first.op.dt)?'Código automático sem DT real. Vínculo pelo horário disponível mais próximo da placa; será substituído pela DT SAP.':'Vínculo pelo horário disponível mais próximo da placa. Cada marcação será usada uma única vez.'};
  });
 }
 function patch(record,row,flow,mark,now=Date.now()){
  const times=[...(flow.times||[])];while(times.length<6)times.push(0);times[0]=mark;
  row.times.forEach((ms,i)=>{if(ms)times[i+2]=ms;});
  let previous=mark;for(const ms of times){if(ms&&(!Number.isFinite(ms)||ms<previous||ms>now+minute))throw Error('Horários fora de sequência, anteriores à marcação ou no futuro. Confira a viagem.');if(ms)previous=ms;}
  let stage=0;times.forEach((ms,i)=>{if(ms)stage=i;});
  const next={...record,dt:String(row.dt).trim(),ewmFluxo:{...flow,version:2,marcacaoMs:mark,times,stage,updatedAtMs:now},sapBaldeio:{...(record.sapBaldeio||{}),dt:String(row.dt).trim(),registrationAt:row.registrationAt,documentDeliveredAt:row.documentDeliveredAt||record.sapBaldeio?.documentDeliveredAt||0,times:row.times,updatedAtMs:now}};
  if(record.status!=='Finalizado'&&!record.encerradoPorNovaMarcacao&&!record.encerramentoManual)next.status=['Em Pátio','Liberado','Em Doca','Doca concluída','Faturamento','Finalizado'][stage];
  if(row.times[0])next.dockTime=row.times[0];if(row.times[1])next.dockExitTime=row.times[1];if(row.times[2])next.billingTime=row.times[2];
  if(row.times[3]){next.finishedTime=row.times[3];next.baldeioViagem={...(record.baldeioViagem||{}),markMs:mark,exitMs:row.times[3]};}
  return next;
 }
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function createUI({button,canManage,getScope,getRecords,isReady,getFlow,save,undo,listAudits,refresh,toast}){
  let modal=null,busy=false,scope='',rows=[],proposals=[],fileName='',applied=[];
  const stamp=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
  const close=()=>{if(!busy){modal?.remove();modal=null;button.focus();}};
  button.onclick=()=>{
   if(!canManage())return;scope=getScope();rows=[];applied=[];proposals=[];
   modal=document.createElement('div');modal.className='ewm-modal';modal.id='baldeio-sap-modal';
   modal.innerHTML=`<section class="ewm-dialog bs-dialog" role="dialog" aria-modal="true" aria-label="Importar baldeios SAP"><h3>Importar baldeios SAP</h3><p>A marcação do HEILOG será preservada. A planilha fornece a DT, entrega de documento, início e fim do carregamento, faturamento e saída. Campos vazios não apagam horários existentes. Cada linha usa a marcação disponível mais próxima da mesma placa, no mesmo dia. Cada marcação e DT serão usadas uma única vez; dados já atualizados serão ignorados.</p><label>Planilha<input type="file" data-bs-file accept=".xlsx,.xls"></label><label>Aba<select data-bs-sheet></select></label><label>Distância máxima do registro/entrega de documento SAP à marcação (minutos)<input data-bs-tolerance type="number" min="1" max="1440" value="1440"></label><button type="button" data-bs-review>Conferir vínculos</button><p role="status" data-bs-status></p><div class="bs-review" data-bs-review-table></div><div class="ewm-buttons"><button type="button" data-bs-close>Fechar</button><button type="button" data-bs-save disabled>Aplicar selecionados</button></div></section>`;
   document.body.appendChild(modal);const q=s=>modal.querySelector(s);let workbook,reviewPage=0;
   const auditsButton=document.createElement('button');auditsButton.type='button';auditsButton.textContent='Histórico de importações / Estornar';q('.ewm-buttons').prepend(auditsButton);
   auditsButton.onclick=async()=>{if(busy)return;busy=true;auditsButton.disabled=true;try{const dialog=modal,items=await listAudits(scope);if(modal!==dialog)return;q('[data-bs-review-table]').innerHTML='';for(const a of items){const line=document.createElement('p');line.textContent=`DT ${a.dt} · ${stamp(a.atMs)} · ${a.fileName} · ${a.state==='applied'?'Aplicada':'Estornada'}`;q('[data-bs-review-table]').appendChild(line);if(a.state==='applied'){const b=document.createElement('button');b.type='button';b.textContent='Estornar DT '+a.dt;line.appendChild(b);b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await undo(a.id,scope);b.textContent='Estornada';refresh();}catch(e){toast(e.message,'error');b.disabled=false;}finally{busy=false;}};}}if(!items.length)q('[data-bs-review-table]').textContent='Nenhuma importação registrada.';q('[data-bs-save]').disabled=true;}catch(e){toast(e.message,'error');}finally{busy=false;auditsButton.disabled=false;}};
   q('[data-bs-close]').onclick=close;modal.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&!el.hidden),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
   const review=async()=>{
    if(busy)return;if(!workbook){q('[data-bs-status]').dataset.state='waiting';q('[data-bs-status]').textContent='Selecione uma planilha para iniciar a conferência.';return;}if(scope!==getScope()||!canManage())return toast('A unidade ou o acesso mudou. Reabra a importação.','error');
    if(!isReady()){q('[data-bs-status]').dataset.state='waiting';q('[data-bs-status]').textContent='Aguarde a consulta do Histórico terminar e clique em Conferir vínculos.';return;}
    busy=true;q('[data-bs-review]').disabled=true;q('[data-bs-review]').textContent='Conferindo…';q('[data-bs-status]').dataset.state='loading';q('[data-bs-status]').textContent='Conferindo a planilha com as marcações do Pátio e Histórico…';q('[data-bs-save]').disabled=true;
    await new Promise(resolve=>setTimeout(resolve,0));
    try{
     if(scope!==getScope()||!canManage())throw Error('A unidade ou o acesso mudou. Reabra a importação.');
     const matrix=root.XLSX.utils.sheet_to_json(workbook.Sheets[q('[data-bs-sheet]').value],{header:1,defval:'',raw:true});
     if(matrix.length>5001)throw Error('Use até 5.000 linhas por arquivo.');
     rows=parse(matrix,daily().day(Date.now()),!!workbook.Workbook?.WBProps?.date1904);
     const records=getRecords();proposals=propose(rows,records,{maxMinutes:Number(q('[data-bs-tolerance]').value)});
     for(const p of proposals)if(p.ok)try{patch(p.op._raw,p.row,getFlow(p.op._raw),p.op._mark);}catch(e){p.ok=false;p.message=e.message;}
     const matched=proposals.filter(p=>p.ok).length;q('[data-bs-status]').dataset.state=matched?'success':'empty';q('[data-bs-status]').textContent=`Conferência concluída: ${rows.length} linha(s) analisada(s), ${matched} vínculo(s) disponível(is) e ${rows.length-matched} sem vínculo liberado. Consultados ${records.length} registro(s) de baldeio do Pátio e Histórico. ${matched?'Confira os horários e clique em Aplicar selecionados. Até 50 por lote.':'Nenhuma alteração foi feita. Veja o motivo de cada linha na coluna Conferência.'}`;
     reviewPage=0;const draw=()=>{let selected=0;
     q('[data-bs-review-table]').innerHTML=`<table><thead><tr><th>Aplicar</th><th>DT / placa</th><th>Referências SAP / Marcação HEILOG</th><th>Atual → Planilha</th><th>Conferência</th></tr></thead><tbody>${proposals.map((p,i)=>i>=reviewPage*50&&i<(reviewPage+1)*50?`<tr><td>${p.ok?`<input type="checkbox" data-bs-item="${i}" ${selected++<50?'checked':''}>`:'—'}</td><td>${esc(p.row.dt)}<br>${esc(p.row.trailer)}</td><td>Registro SAP: ${esc(stamp(p.row.registrationAt))}<br>Entrega de documento: ${esc(stamp(p.row.documentDeliveredAt))}<br>HEILOG: ${p.op?esc(stamp(p.op._mark))+'<br>Vínculo por '+esc(p.referenceSource)+': '+Math.round(p.delta/minute)+' min':'—'}</td><td>${p.op?'<strong>DT '+esc(p.op.dt||'00')+' → '+esc(p.row.dt)+'</strong><br>':''}Entrega de documento: ${p.op?esc(stamp(p.op._raw?.sapBaldeio?.documentDeliveredAt)):'—'} → ${esc(stamp(p.row.documentDeliveredAt))}<br>${labels.map((label,k)=>esc(label)+': '+(p.op?esc(stamp(getFlow(p.op._raw).times[k+2])):'—')+' → '+esc(stamp(p.row.times[k]))).join('<br>')}</td><td>${esc(p.message)}</td></tr>`:'').join('')}</tbody></table><p>Página ${reviewPage+1} de ${Math.max(1,Math.ceil(proposals.length/50))}</p><button type="button" data-bs-prev ${reviewPage===0?'disabled':''}>Anterior</button><button type="button" data-bs-next ${(reviewPage+1)*50>=proposals.length?'disabled':''}>Próxima</button>`;
     q('[data-bs-prev]').onclick=()=>{reviewPage--;draw();};q('[data-bs-next]').onclick=()=>{reviewPage++;draw();};};draw();
     q('[data-bs-save]').disabled=!proposals.some(p=>p.ok);
    }catch(e){proposals=[];q('[data-bs-review-table]').innerHTML='';q('[data-bs-save]').disabled=true;q('[data-bs-status]').dataset.state='error';q('[data-bs-status]').textContent='Conferência não concluída: '+e.message;}finally{busy=false;q('[data-bs-review]').disabled=false;q('[data-bs-review]').textContent='Conferir novamente';}
   };
   q('[data-bs-file]').onchange=async e=>{const f=e.target.files?.[0];if(!f||busy)return;const dialog=modal;proposals=[];workbook=null;q('[data-bs-save]').disabled=true;q('[data-bs-review-table]').innerHTML='';try{if(f.size>20*1024*1024)throw Error('Use um arquivo de até 20 MB.');if(!root.XLSX)throw Error('A leitura de planilhas ainda está carregando. Tente novamente.');const bytes=await f.arrayBuffer();if(modal!==dialog||scope!==getScope())return;workbook=root.XLSX.read(bytes,{type:'array'});fileName=f.name;q('[data-bs-sheet]').innerHTML=workbook.SheetNames.map(n=>`<option>${esc(n)}</option>`).join('');review();}catch(err){if(modal===dialog){q('[data-bs-status]').dataset.state='error';q('[data-bs-status]').textContent=err.message;}}};
   q('[data-bs-sheet]').onchange=review;q('[data-bs-review]').onclick=review;
   q('[data-bs-tolerance]').onchange=()=>{proposals=[];q('[data-bs-review-table]').innerHTML='';q('[data-bs-save]').disabled=true;q('[data-bs-status]').textContent='Clique em Conferir vínculos para usar a nova tolerância.';};
   q('[data-bs-save]').onclick=async()=>{
    const chosen=[...modal.querySelectorAll('[data-bs-item]:checked')].map(el=>proposals[Number(el.dataset.bsItem)]).filter(p=>p?.ok);
    if(!chosen.length||chosen.length>50)return toast('Selecione de 1 a 50 viagens.','error');
    if(scope!==getScope()||!canManage())return toast('A unidade ou o acesso mudou. Reabra a importação.','error');
    busy=true;modal.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);const failures=[];applied=[];const batchId=crypto.randomUUID();
    for(const p of chosen){try{applied.push(await save(p,scope,batchId,fileName));}catch(e){failures.push(`DT ${p.row.dt}: ${e.message}`);}q('[data-bs-status]').textContent=`Aplicadas ${applied.length} de ${chosen.length} · ${failures.length} falha(s).`;}
    busy=false;refresh();q('[data-bs-status]').textContent=`${applied.length} viagem(ns) atualizada(s). ${failures.join(' | ')}`;
    q('[data-bs-save]').hidden=true;q('[data-bs-close]').disabled=false;
    q('[data-bs-review-table]').innerHTML='<p>As alterações ficaram registradas na linha do tempo e no histórico de importações. Para importar novamente, feche e reabra esta tela.</p>';
    for(const result of applied){const b=document.createElement('button');b.type='button';b.textContent=`Estornar importação da DT ${result.dt}`;q('[data-bs-review-table]').appendChild(b);b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await undo(result.auditId,scope);b.textContent=`DT ${result.dt}: importação estornada`;refresh();}catch(e){b.disabled=false;toast(e.message,'error');}finally{busy=false;}};}
   };
   q('[data-bs-file]').focus();
  };
 }
 root.BaldeioSap={parse,propose,patch,fingerprint,temporaryDt,createUI,labels};
})(window);
