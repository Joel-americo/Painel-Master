/* Travel cycles and configured forecasts. No live traffic or GPS provider. */
(function(root){
 'use strict';
 const minute=60000;
 const ms=v=>{if(!v)return 0;if(typeof v.toMillis==='function')return v.toMillis();if(typeof v==='object'&&'seconds'in v)return v.seconds*1000;if(typeof v==='number')return Number.isFinite(v)?v:0;const n=Date.parse(v);return Number.isFinite(n)?n:0;};
 const plate=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
 const day=n=>dayFormatter.format(new Date(n));
 const defaults={outbound:40,inbound:45,unload:60,load:60};
 function settings(v={}){return Object.fromEntries(Object.keys(defaults).map(k=>[k,Number.isFinite(Number(v[k]))&&Number(v[k])>=1&&Number(v[k])<=480?Number(v[k]):defaults[k]]));}
 function departure(op){if(op.status==='Cancelado'||op.encerradoPorNovaMarcacao)return 0;const v=op.baldeioViagem||{};if(ms(v.exitMs))return ms(v.exitMs);const f=op.ewmFluxo;if(f?.stage===5&&ms(f.marcacaoMs)===ms(op._mark))return ms(f.times?.[5]);return 0;}
 function build(records,config={},now=Date.now()){
  const cfg=settings(config),unique=new Map();
  for(const r of records){if(/^(?:cancelad[oa]|estornad[oa])$/i.test(String(r.status||'').trim()))continue;const mark=ms(r._mark||r.registrationTime);if(!mark)continue;const truck=plate(r._truck),trailer=plate(r._trailer),key=truck?'C:'+truck:trailer?'S:'+trailer:'R:'+r.id;
   const id=String(r.id||key+':'+mark);const old=unique.get(id);if(!old||r._src==='patio')unique.set(id,{...r,_mark:mark,_truck:truck,_trailer:trailer,_key:key});}
  const groups=new Map();for(const r of unique.values()){if(!groups.has(r._key))groups.set(r._key,[]);groups.get(r._key).push(r);}
  return [...groups.entries()].map(([key,ops])=>{
   ops.sort((a,b)=>a._mark-b._mark||String(a.id).localeCompare(String(b.id)));
   let countedSequence=0;
   const cycles=ops.map((op,i)=>{const v=op.baldeioViagem||{},exit=departure(op),arrival=ms(v.arrivalMs),leave=ms(v.leaveMs),manualReturn=ms(v.returnMs);let lo=i+1,hi=ops.length;if(exit)while(lo<hi){const mid=(lo+hi)>>>1;if(ops[mid]._mark<=exit)lo=mid+1;else hi=mid;}const next=exit?ops[lo]:null;const naturalCompletion=exit&&!op.encerramentoManual?next?._mark||0:0,cutoff=ms(config.countingFromMs),baselineClosed=!!cutoff&&op._mark<cutoff,manualClosed=!!op.encerramentoManual,completedMs=manualClosed?ms(op.encerramentoManual.atMs||op.finishedTime):baselineClosed?Math.min(naturalCompletion||cutoff,cutoff):naturalCompletion,closed=!!completedMs,returned=exit?manualReturn||naturalCompletion||0:0;const missingLusitana=!!naturalCompletion&&(!arrival||!leave),externalMs=exit?Math.max(0,(naturalCompletion||manualReturn||completedMs||now)-exit):0;
    const predictedArrival=exit?(arrival||exit+cfg.outbound*minute):0;
    const predictedLeave=predictedArrival?(leave||predictedArrival+(cfg.unload+cfg.load)*minute):0;
    const predictedReturn=predictedLeave?predictedLeave+cfg.inbound*minute:0;
    const maintenance=maintenanceMetrics(v,op._mark,completedMs,now);
    const status=manualClosed?'Encerrada manualmente':baselineClosed?'Encerrada · início da nova contagem':closed?'Concluída':maintenance.active?'Em manutenção':returned?'Na fábrica · aguardando nova marcação':!exit?'Na fábrica':leave?'Voltando à fábrica':arrival?'Na Lusitana':'Indo à Lusitana';
    return {op,sequence:baselineClosed?i+1:++countedSequence,baselineClosed,manualClosed,missingLusitana,externalMs,mark:op._mark,exit,arrival,leave,returned,closed,completedMs,...maintenance,outboundMs:exit&&arrival?Math.max(0,(arrival||returned||completedMs||now)-exit):0,lusitanaMs:arrival&&leave?Math.max(0,(leave||returned||completedMs||now)-arrival):0,inboundMs:leave?Math.max(0,(returned||completedMs||now)-leave):0,awaitingMarkMs:returned?Math.max(0,(completedMs||now)-returned):0,returnSource:baselineClosed?'Encerramento da contagem anterior':manualReturn?'Registro manual':returned?'Nova marcação':'',predictedArrival,predictedLeave,predictedReturn,status,factoryMs:Math.max(0,(exit||completedMs||now)-op._mark),totalMs:Math.max(0,(completedMs||now)-op._mark),operationalMs:Math.max(0,(completedMs||now)-op._mark-maintenance.maintenanceMs),late:!closed&&!returned&&!maintenance.active&&predictedReturn&&now>predictedReturn};});
   return {key,truck:ops.at(-1)._truck,trailer:ops.at(-1)._trailer,cycles};
  });
 }
 function maintenanceMetrics(v={},mark,completedMs=0,now=Date.now()){
  const end=completedMs||now,periods=ms(v.markMs)&&ms(v.markMs)!==mark?[]:(Array.isArray(v.maintenance)?v.maintenance:[]).filter(p=>ms(p.startMs)>=mark&&ms(p.startMs)<=end).map(p=>({...p,effectiveEndMs:Math.min(ms(p.endMs)||end,end),autoClosed:!ms(p.endMs)&&!!completedMs}));
  const maintenanceMs=periods.reduce((sum,p)=>sum+Math.max(0,p.effectiveEndMs-ms(p.startMs)),0);
  return {periods,maintenanceMs,active:!completedMs?periods.find(p=>!ms(p.endMs))||null:null};
 }
 function changeMaintenance(cycle,action,input={},now=Date.now()){
  if(cycle.closed)throw Error('O ciclo já foi fechado pela nova marcação.');
  const current=cycle.op.baldeioViagem||{},periods=[...(Array.isArray(current.maintenance)?current.maintenance:[])],active=periods.find(p=>!ms(p.endMs));
  const time=Number(input.timeMs);if(!Number.isFinite(time)||time<cycle.mark||time>now+60000)throw Error('Informe um horário válido dentro da viagem e sem data futura.');
  if(action==='start'){
   if(active)throw Error('O caminhão já está em manutenção.');
   if(!String(input.reason||'').trim()||!String(input.location||'').trim())throw Error('Informe o motivo e o local da manutenção.');
   if(periods.some(p=>time<ms(p.endMs)||time<=ms(p.startMs)))throw Error('O horário não pode sobrepor outra manutenção.');
   periods.push({id:input.id||'maintenance-'+now,startMs:time,endMs:0,reason:String(input.reason).trim(),location:String(input.location).trim(),cargo:String(input.cargo||'Não informado'),loadLocation:String(input.loadLocation||'').trim(),startBy:String(input.actor||''),resolution:''});
  }else if(action==='end'){
   if(!active)throw Error('Não há manutenção em andamento.');
   if(time<ms(active.startMs))throw Error('O retorno deve ser posterior ao início da manutenção.');
   if(!String(input.resolution||'').trim())throw Error('Informe a resolução da manutenção.');
   const index=periods.indexOf(active);periods[index]={...active,endMs:time,endBy:String(input.actor||''),resolution:String(input.resolution).trim()};
  }else throw Error('Ação de manutenção inválida.');
  return {...current,markMs:cycle.mark,maintenance:periods,updatedAtMs:now,updatedBy:String(input.actor||'')};
 }
 function version(value){
  const plain=typeof value==='string'?JSON.parse(value):JSON.parse(JSON.stringify(value||{}));
  return JSON.stringify(plain,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
 }
 function sameVersion(current,expected){try{return version(current)===version(expected);}catch(_){return false;}}
 function validate(mark,v,now=Date.now()){
  const times=['exitMs','arrivalMs','leaveMs','returnMs'];let previous=ms(mark);
  for(let i=0;i<times.length;i++){const t=ms(v[times[i]]);if(!t){if(times.slice(i+1).some(k=>ms(v[k])))throw Error('Preencha as etapas anteriores antes de registrar a próxima.');continue;}if(t<previous)throw Error('Os horários devem seguir a ordem do ciclo.');if(t>now+60000)throw Error('Horários reais não podem estar no futuro.');previous=t;}
  return v;
 }
 root.BaldeioCycle={version,sameVersion,build,settings,defaults,departure,validate,maintenanceMetrics,changeMaintenance,ms,day,plate};
})(globalThis);
