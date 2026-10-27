(function(root){
 'use strict';
 const kinds=['Baldeios','Vendas','Descargas','Carregamento','Carga e descarga'];
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
 const plate=v=>norm(v).replace(/[^A-Z0-9]/g,'');
 const dt=v=>{const n=norm(v).replace(/\s/g,'');return /^0*$/.test(n)?'':/^\d+$/.test(n)?n.replace(/^0+/, ''):n;};
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
 const dayCache=new Map();
 const day=ms=>{if(!ms)return '';if(dayCache.has(ms))return dayCache.get(ms);const value=formatter.format(new Date(ms));if(dayCache.size>=10000)dayCache.delete(dayCache.keys().next().value);dayCache.set(ms,value);return value;};
 function time(v){
  if(v?.toMillis)return v.toMillis();if(v&&typeof v==='object'&&'seconds'in v)return v.seconds*1000;
  if(v instanceof Date)return v.getTime();if(typeof v==='number')return v>1e11?v:v>20000&&v<100000?Math.round((v-25569)*86400000)+10800000:0;
  const raw=String(v||'').trim();if(!raw)return 0;
  const m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const iso=m?`${m[3].length===2?"20"+m[3]:m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${(m[4]||'00').padStart(2,'0')}:${m[5]||'00'}:${m[6]||'00'}-03:00`:/^\d{4}-\d\d-\d\d(?:[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?)?$/.test(raw)?raw.replace(' ','T')+(raw.length===10?'T00:00:00':'')+'-03:00':raw;
  const n=Date.parse(iso);return Number.isFinite(n)?n:0;
 }
 function kind(value){const n=norm(value);if(/BALDEI/.test(n))return 'Baldeios';if(/\bVENDAS?\b/.test(n))return 'Vendas';const unload=/\b(DESCARGAS?|DESCARREGAR|DESCARREGAMENTO)\b|LATAS? VAZIAS?/.test(n),load=/\b(CARGA|CARREGAR|CARREGAMENTO)\b/.test(n);return unload&&load?'Carga e descarga':unload?'Descargas':load?'Carregamento':'Não classificado';}
 function baldeioCarrier(value){return /\b(?:RITI?MO|JSL)\b/.test(norm(value).replace(/0/g,'O').replace(/1/g,'I'));}
 const baldeioOperationKeys=['tipoMarcacao','tipo_marcacao','marcacaoTipo','tipoSemDt','tipo_sem_dt','operacaoSemDt','operacao_sem_dt','operacaoFirebase','operationFirebase','operacao','operation','operationType','tipoDaOperacao','tipo_da_operacao','nomeOperacao','nome_operacao','servico','service','tipoServico','tipo_servico','botao','botão','botaoMarcado','botao_marcado','buttonLabel','button_label','actionLabel','action_label','acao','ação','flowLabel','flowKey','fluxo','categoria','classificacaoFluxo','classificacao_fluxo','classificacaoOperacao','classificacao_operacao','classificacaoPainel','classificacao_painel','flowClassificacao','flow_classificacao','perfClassificacao','perf_classificacao','classificacao','classificação','categoriaFluxo','categoria_fluxo','tipoFluxo','tipo_fluxo','tipoOperacao','tipo_operacao','tipoSnapshot','tipo_heilog','tipoHeilog','tipo','segmentacao','segmentação'];
 function markedBaldeioJsl(op={}){
  const explicit=v=>typeof v==='string'&&/\b(?:BALDEIOS? JSL|JSL BALDEIOS?)\b/.test(norm(v).replace(/[^A-Z0-9]+/g,' ').trim());
  return baldeioOperationKeys.some(key=>explicit(op[key]))||[op.marcacao,op.marcação].some(mark=>mark&&typeof mark==='object'&&['tipo','operacao','tipoOperacao','botao'].some(key=>explicit(mark[key])));
 }
 function markedBaldeio(op={}){
  if(op.baldeio===true||String(op.baldeio).toLowerCase()==='true')return true;

  return baldeioOperationKeys.some(key=>typeof op[key]==='string'&&/\bBALDEIOS?\b/.test(norm(op[key])))||[op.marcacao,op.marcação].some(mark=>mark&&typeof mark==='object'&&['tipo','operacao','tipoOperacao','botao'].some(key=>/\bBALDEIOS?\b/.test(norm(mark[key]))));
 }
 function allowedBaldeio(row){return baldeioCarrier(row.carrier)&&(!/\bJSL\b/.test(norm(row.carrier))||row.markedBaldeioJsl===true);}
 function loaded(status){const n=norm(status);return (/^\d+$/.test(n)&&Number(n)>=5)||/^(CARREGADO|CARREGAMENTO FINALIZADO|FINALIZADO|CONCLUIDO)$/.test(n);}
 function situation(row){
  const status=norm(row.sapStatus??row.status);
  if(loaded(status)||row.loadedAt)return {presentationStatus:'Carregado',presentationTone:'yes'};
  if(status==='4'||/FATUR/.test(status))return {presentationStatus:'Faturamento de nota',presentationTone:'check'};
  if(/^[23]$/.test(status)||/^(CARREGANDO|EM CARREGAMENTO)$/.test(status))return {presentationStatus:'Em carregamento',presentationTone:'check'};
  if(row.heilogMarkAt)return {presentationStatus:'Se apresentou na fábrica',presentationTone:'yes'};
  if(row.registration==='no'&&dt(row.dt))return {presentationStatus:'Não se apresentou',presentationTone:'no'};
  return {presentationStatus:'',presentationTone:row.registration};
 }
 const rowPlate=r=>plate(r.trailer)||plate(r.truck);
 function unique(rows,key){const map=new Map();for(const r of rows){const k=key(r);if(!map.has(k))map.set(k,r);}return [...map.values()];}
 const priorityLabels={P1:'TOP18 aderente',P2:'FOB aderente',P3:'Dedicada Vendas aderente',P4:'Vendas/HUB aderentes',P5:'TOP18 não aderente',P6:'Dedicada aderente Transf',P7:'Transf aderente',P8:'Dedicada não aderente',P9:'FOB não aderente',P10:'Vendas/HUB não aderentes',P11:'Transf não aderente'};
 function priority(row){
  // This view always compares the matched HEILOG marking with the SAP agenda.
  // Saved Pátio priority and SAP actual-registration times cannot replace that marking.
  const channel=norm(row.transportType||row.heilogTransportType),text=norm([row.segment,row.heilogSegment,row.notes].join(' ')),savedLabel=norm(row.priorityLabel),top=/TOP\s*18/.test(text+' '+savedLabel)&&['Y001','Y002','Y055'].includes(channel),dedicated=/\bJSL\b|DEDICAD/.test(norm(row.carrier)+' '+text+' '+savedLabel),sale=/\bVENDA/.test(text+' '+savedLabel);
  const family=top?'TOP18':channel==='Y004'?'FOB':channel==='Y006'?(dedicated?'Dedicada':'Transferência'):['Y001','Y002','Y055'].includes(channel)?'Vendas/HUB':'';
  const arrival=row.heilogMarkAt,plan=row.scheduledAt,source='Marcação HEILOG × Agenda SAP';
  if(!arrival||!plan||row.scheduledPrecision==='date'||!family)return {priorityCode:'',priorityLabel:family||'Não calculada',prioritySource:source,agendaStatus:!arrival?'Sem marcação vinculada no HEILOG':!plan?'Agenda SAP não informada':row.scheduledPrecision==='date'?'Hora da agenda SAP não informada':'Tipo de transporte não informado'};
  const condition=day(arrival)>day(plan)?'Grade queimada':day(arrival)<day(plan)||new Date(plan-10800000).getUTCHours()>=20?'Antecipação':arrival-plan>=3600000?'Perda de agenda':'Aderente';
  if(condition==='Antecipação')return {priorityCode:'',priorityLabel:family,prioritySource:source,agendaStatus:condition};
  const adherent=condition==='Aderente';
  const code=top?(adherent?'P1':'P5'):channel==='Y004'?(adherent?'P2':'P9'):channel==='Y006'?(dedicated?(adherent?(sale?'P3':'P6'):'P8'):(adherent?'P7':'P11')):(adherent?'P4':'P10');
  return {priorityCode:code,priorityLabel:priorityLabels[code],prioritySource:source,agendaStatus:condition};
 }
 function occurrenceSummary(row,state={}){
  if(state.error)return {label:'Não verificado',tone:'check',details:'Não foi possível consultar as ocorrências.'};
  if(!state.ready)return {label:'Conferindo…',tone:'loading',details:'Consultando ocorrências desta DT.'};
  if(!dt(row.dt)&&!row.operationId)return {label:'Não verificado',tone:'check',details:'É necessário ter DT ou vínculo com a operação.'};
  const matches=(state.rows||[]).filter(occ=>{
   const status=norm(occ.statusOcorrencia||occ.status);if(/CANCELAD/.test(status)||occ.bloqueioChecklistCancelado)return false;
   const occurrenceDt=dt(occ.dt),rowDt=dt(row.dt),opId=String(occ.operacaoId||occ.operationId||'');
   if(occurrenceDt&&rowDt&&occurrenceDt!==rowDt)return false;
   if(opId&&row.operationId&&opId!==String(row.operationId)&&opId!==String(row.id))return false;
   const session=occ.linhaDoTempoId||occ.timelineSessionId||occ.marcacaoId||occ.activityId;
   if(session&&row.activityId&&String(session)!==String(row.activityId))return false;
   if(!(opId&&row.operationId&&[String(row.operationId),String(row.id)].includes(opId))&&!(occurrenceDt&&rowDt&&occurrenceDt===rowDt))return false;
   const stamp=time(occ.createdAtMs||occ.ocorrenciaAbertaAtMs||occ.timestampMs||occ.timestamp?.toMillis?.()||(occ.timestamp?.seconds?occ.timestamp.seconds*1000:0)||occ.createdAt);
   const marking=row.heilogMarkAt||row.arrivalAt;
   if(stamp&&marking&&stamp<marking)return false;
   if(stamp&&row.nextMark&&stamp>=row.nextMark)return false;
   return true;
  });
  const open=matches.filter(occ=>!/CONCLU|RESOLVID|FINALIZAD|FECHAD|ENCERRAD/.test(norm(occ.statusOcorrencia||occ.status))).length;
  return {label:open?`${open} aberta(s)`:matches.length?`${matches.length} resolvida(s)`:'Sem ocorrência',tone:open?'check':matches.length?'yes':'neutral',details:matches.map(occ=>`${occ.type||'Ocorrência'} · ${occ.statusOcorrencia||occ.status||'Em andamento'}`).join(' | ')||'Nenhuma ocorrência localizada para esta passagem.'};
 }
 function build({records=[],imported=[],date,ready=true,selectedKinds=kinds,search='',onlyRepeated=false,registration='all',statusFilter='all',reportOnly=false,includeHeilogBaldeios=false,restrictBaldeioCarriers=false}){
  const lookup=unique(records.filter(r=>r.status!=='Cancelado'&&(!reportOnly||day(r.heilogMarkAt||r.arrivalAt)===date)),r=>r.identity||r.id+':'+r.arrivalAt);
  const rows=lookup.filter(r=>day(r.arrivalAt)===date||day(r.loadedAt)===date);
  const dtIndex=new Map(),plateIndex=new Map();
  for(const r of lookup){const t=dt(r.dt);if(t){if(!dtIndex.has(t))dtIndex.set(t,[]);dtIndex.get(t).push(r);}for(const p of new Set([plate(r.trailer),plate(r.truck)].filter(Boolean))){if(!plateIndex.has(p))plateIndex.set(p,[]);plateIndex.get(p).push(r);}}
  const reportRows=unique(imported.filter(r=>(!r.date||r.date===date)&&(!reportOnly||dt(r.dt))&&(reportOnly||!r.arrivalAt&&!r.loadedAt||day(r.arrivalAt)===date||day(r.loadedAt)===date)),r=>[dt(r.dt),plate(r.trailer),plate(r.truck),r.arrivalAt||'',r.kind].join(':'));
  const plateReports=new Map();for(const r of reportRows)for(const p of new Set([plate(r.trailer),plate(r.truck)].filter(Boolean))){if(!plateReports.has(p))plateReports.set(p,new Set());plateReports.get(p).add(dt(r.dt));}
  const baldeioMatches=new Map();
  if(reportOnly&&root.BaldeioSap){
   const reports=reportRows.filter(r=>r.kindInferred||!r.kind||['Não classificado','Baldeios'].includes(r.kind)).map(r=>({...r,registrationAt:r.arrivalPrecision==='date'?0:r.arrivalAt,reportRow:r}));
   const operations=lookup.filter(h=>h.kind==='Baldeios'&&(!restrictBaldeioCarriers||allowedBaldeio(h))).map(h=>({...h,_mark:h.heilogMarkAt||h.arrivalAt,_trailer:h.trailer,_dailyRow:h}));
   for(const p of root.BaldeioSap.propose(reports,operations,{maxMinutes:90}))if(p.ok)baldeioMatches.set(p.row.reportRow,p.op._dailyRow);
  }
  const used=new Set(),result=[];
  for(const r of reportRows){
   const candidates=dt(r.dt)?(dtIndex.get(dt(r.dt))||[]):[];
   candidates.sort((a,b)=>(b.arrivalAt||0)-(a.arrivalAt||0));
   let match=candidates.find(h=>!(r.trailer||r.truck)||[plate(r.trailer),plate(r.truck)].filter(Boolean).some(p=>p===plate(h.trailer)||p===plate(h.truck)));
   let matchedByPlate=false;
   if(!match&&reportOnly&&!candidates.length&&baldeioMatches.has(r)){match=baldeioMatches.get(r);matchedByPlate=true;}
   if(!match&&reportOnly&&!candidates.length){
    const primary=plate(r.trailer)||plate(r.truck),field=r.trailer?'trailer':'truck';
    const alternatives=(plateIndex.get(primary)||[]).filter(h=>!dt(h.dt)&&(!root.BaldeioSap||h.kind!=='Baldeios')&&plate(h[field])===primary&&(!r.trailer||!r.truck||!h.truck||plate(r.truck)===plate(h.truck)));
    if(primary&&plateReports.get(primary)?.size===1&&alternatives.length===1&&!used.has(alternatives[0].identity||alternatives[0].id+':'+alternatives[0].arrivalAt)){
     match=alternatives[0];matchedByPlate=true;
    }
   }
   const possible=candidates.length>0||[plate(r.trailer),plate(r.truck)].filter(Boolean).some(p=>plateIndex.has(p));
   if(match){used.add(match.identity||match.id+':'+match.arrivalAt);result.push({...r,...match,dt:r.dt,carrier:match.carrier||r.carrier,sapStatus:r.status,heilogMarkAt:match.heilogMarkAt||match.arrivalAt,arrivalAt:r.arrivalAt||match.arrivalAt,loadedAt:r.loadedAt||match.loadedAt,arrivalPrecision:r.arrivalAt?r.arrivalPrecision:'datetime',loadedPrecision:r.loadedAt?r.loadedPrecision:'datetime',kind:r.kindInferred&&match.kind&&match.kind!=='Não classificado'?match.kind:r.kind&&r.kind!=='Não classificado'?r.kind:match.kind,source:'SAP + HEILOG',registration:'yes',matchedByPlate,matchLabel:matchedByPlate?'Sim · placa e marcação do dia (HEILOG sem DT real)':day(match.arrivalAt)===date?'Sim · DT e dados do dia':'Sim · registro de '+day(match.arrivalAt).split('-').reverse().join('/')});}
   else result.push({...r,source:'SAP',registration:!ready?'loading':possible?'check':'no',presentationStatus:ready&&!possible&&dt(r.dt)?'Não se apresentou':'',matchLabel:!ready?'Conferindo HEILOG…':possible?(candidates.length?'Conferir · DT com placa divergente':'Conferir · placa com outra DT'):dt(r.dt)?'Não se apresentou':'Não localizado'});
  }
  for(const r of rows)if((!reportOnly||includeHeilogBaldeios&&r.kind==='Baldeios'&&(!restrictBaldeioCarriers||allowedBaldeio(r)))&&!used.has(r.identity||r.id+':'+r.arrivalAt))result.push({...r,heilogMarkAt:r.heilogMarkAt||r.arrivalAt,source:'HEILOG',registration:'yes',matchLabel:'Sim · registro no painel'});
  const selected=new Set(selectedKinds),all=kinds.every(k=>selected.has(k)),term=norm(search);
  const combined=unique(result.map(row=>{if(restrictBaldeioCarriers&&row.kind==='Baldeios'&&!allowedBaldeio(row)){const channel=norm(row.transportType||row.heilogTransportType);row={...row,kind:['Y001','Y002','Y055','Y004'].includes(channel)?'Vendas':channel==='Y006'?'Carregamento':'Não classificado'};}return {...row,...priority(row),...situation(row)};}),r=>r.identity?'heilog:'+r.identity:[r.source,dt(r.dt),rowPlate(r),r.arrivalAt,r.kind].join(':'));
  const base=combined.filter(r=>(all||selected.has(r.kind))&&(!term||[r.dt,r.trailer,r.truck,r.carrier].some(v=>norm(v).includes(term)||plate(v).includes(plate(term)))));
  const sales=new Map();for(const r of base)if(r.kind==='Vendas'&&day(r.loadedAt)===date&&dt(r.dt)&&rowPlate(r)){const p=rowPlate(r);if(!sales.has(p))sales.set(p,new Set());sales.get(p).add(dt(r.dt));}
  const ranking=[...sales].filter(([,dts])=>dts.size>1).map(([p,dts])=>({plate:p,count:dts.size,dts:[...dts]})).sort((a,b)=>b.count-a.count||a.plate.localeCompare(b.plate));
  const repeated=new Set(ranking.map(r=>r.plate));
  const filtered=base.filter(r=>(!onlyRepeated||repeated.has(rowPlate(r)))&&(registration==='all'||r.registration===registration)&&(statusFilter==='all'||r.presentationStatus===statusFilter));
  // A recorded completion date takes precedence. When absent, count loaded/finalized
  // status against the arrival day or the explicitly imported report reference day.
  const statusLoadedToday=r=>!r.loadedAt&&loaded(r.sapStatus??r.status)&&(r.arrivalAt?day(r.arrivalAt)===date:r.date===date);
  const loadedTrips=unique(base.filter(r=>r.kind==='Baldeios'&&(day(r.loadedAt)===date||statusLoadedToday(r))),r=>r.identity||[dt(r.dt),rowPlate(r),r.loadedAt||r.arrivalAt||r.date||''].join(':'));
  return {rows:filtered,ranking,stats:{baldeios:loadedTrips.length,baldeiosByStatus:loadedTrips.filter(statusLoadedToday).length,repeated:ranking.length,loads:base.filter(r=>['Baldeios','Vendas','Carregamento','Carga e descarga'].includes(r.kind)&&day(r.arrivalAt)===date).length,unloads:base.filter(r=>['Descargas','Carga e descarga'].includes(r.kind)&&day(r.arrivalAt)===date).length,missing:base.filter(r=>r.registration==='no').length},unknown:combined.filter(r=>r.kind==='Não classificado').length};
 }
 const fields={dt:'DT / Transporte',trailer:'Placa carreta',truck:'Placa cavalo',kind:'Operação',arrivalAt:'Data de chegada',arrivalTime:'Hora de chegada',loadedAt:'Data do fim de carregamento',loadedTime:'Hora do fim de carregamento',status:'Situação / status',carrier:'Transportadora',transportType:'Tipo de transporte (Y001…Y006)',scheduledAt:'Data da agenda',scheduledTime:'Hora da agenda',segment:'Segmento / TOP18 (Texto adicional 4)',notes1:'Texto adicional 1',notes2:'Texto adicional 2',notes3:'Texto adicional 3'};
 const aliases={dt:['DT','TRANSPORTE','N TRANSPORTE','NUMERO TRANSPORTE'],trailer:['PL CARRETA','PLACA CARRETA','PLACA DA CARRETA','CARRETA'],truck:['PL CAVALO','PLACA CAVALO','CAVALO','PLACA TRATOR'],kind:['OPERACAO','TIPO OPERACAO','CLASSIFICACAO','TIPO'],arrivalAt:['CHEGADA','DATA CHEGADA','DATA HORA CHEGADA','HORARIO CHEGADA','MARCACAO','DTAATUAL REGISTRO'],arrivalTime:['HORA ATUAL REGISTRO','HORA CHEGADA'],loadedAt:['FIM CARREGAMENTO','DATA HORA CARREGAMENTO','CARREGAMENTO CONCLUIDO','FIM DO CARREGATUAL'],loadedTime:['HORA ATUAL FIM CARGA','HORA FIM CARREGAMENTO'],status:['STATUS','SITUACAO','STATUS TRANSPORTE','STATUS GLOBAL TRNSP'],carrier:['TRANSPORTADORA','NOME DO FORNECEDOR DE SERVICOS','NOME AGENTE DE FRETE'],transportType:['TIPO DE TRANSPORTE','TIPO TRANSPORTE'],scheduledAt:['DTAPLANREG','DATA PLANREGISTRO','DATA AGENDA','DATA AGENDAMENTO'],scheduledTime:['HORPLANREG','HRPLANEJREGISTRO','HORA AGENDA'],segment:['SEGMENTO','TEXTO ADICIONAL 4','TOP18'],notes1:['TEXTO ADICIONAL 1'],notes2:['TEXTO ADICIONAL 2'],notes3:['TEXTO ADICIONAL 3']};
 function guess(headers){const clean=v=>norm(v).replace(/[^A-Z0-9 ]/g,'').replace(/\s+/g,' ');return Object.fromEntries(Object.keys(fields).map(k=>[k,headers.findIndex(h=>aliases[k].includes(clean(h)))]));}
 function clock(v){
  if(typeof v==='number'&&v>=0&&v<1)return Math.round(v*86400000);
  const raw=String(v??'').trim();if(raw==='0')return 0;
  const match=raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(match&&Number(match[1])<24&&Number(match[2])<60&&Number(match[3]||0)<60)return (Number(match[1])*3600+Number(match[2])*60+Number(match[3]||0))*1000;
  return null;
 }
 function convert(matrix,mapping,{date,defaultKind='Não classificado',date1904=false}={}){
  return matrix.map((cells,i)=>{
   const get=k=>mapping[k]>=0?cells[mapping[k]]:'';
   const dateValue=(key,timeKey)=>{const v=get(key),base=time(date1904&&typeof v==='number'?v+1462:v),part=clock(get(timeKey));return base&&part!==null?Date.parse(day(base)+'T00:00:00-03:00')+part:base;};
   const precision=(key,timeKey)=>{if(clock(get(timeKey))!==null)return 'datetime';const v=get(key);return typeof v==='number'&&Number.isInteger(v)||/^\d{1,2}\/\d{1,2}\/\d{2,4}$|^\d{4}-\d\d-\d\d$/.test(String(v).trim())?'date':'datetime';};
   const transportType=String(get('transportType')||'').trim().slice(0,20),segment=String(get('segment')||'').trim().slice(0,300),notes=[get('notes1'),get('notes2'),get('notes3')].filter(Boolean).join(' · ').slice(0,1000);
   let operation=kind(get('kind')||defaultKind),kindInferred=false;
   if(operation==='Não classificado'){
    operation=kind([notes,segment].join(' '));
    if(operation==='Não classificado')operation=['Y001','Y002','Y055','Y004'].includes(norm(transportType))?'Vendas':norm(transportType)==='Y006'?'Carregamento':'Não classificado';
    kindInferred=operation!=='Não classificado';
   }
   return {id:'sap-'+i,date,dt:String(get('dt')||'').trim().slice(0,80),trailer:plate(get('trailer')),truck:plate(get('truck')),kind:operation,kindInferred,arrivalAt:dateValue('arrivalAt','arrivalTime'),loadedAt:dateValue('loadedAt','loadedTime'),arrivalPrecision:precision('arrivalAt','arrivalTime'),loadedPrecision:precision('loadedAt','loadedTime'),status:String(get('status')||'').trim().slice(0,100),carrier:String(get('carrier')||'').trim().slice(0,200),transportType,scheduledAt:dateValue('scheduledAt','scheduledTime'),scheduledPrecision:precision('scheduledAt','scheduledTime'),segment,notes};
  }).filter(r=>r.dt||r.trailer||r.truck);
 }
 function createUI({element,getState,loadImport,saveImport,stopImport,watchOccurrences,stopOccurrences,canImport,toast,isVisible=()=>true}){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stamp=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),dateOnly=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'});
  const short=(ms,precision)=>ms?(precision==='date'?dateOnly:stamp).format(new Date(ms)):'—';
  let active=false,date=day(Date.now()),selected=[...kinds],imports=[],importInfo=null,loadKey='',loading=false,error='',page=1,report=null,search='',onlyRepeated=false,registration='all',statusFilter='all',workbook=null,fileName='',headerRow=0;
  element.innerHTML=`<header class="dm-heading"><div><h3>Movimento do dia</h3><p>DTs, placas e conferência SAP × HEILOG</p></div><div class="dm-controls"><label>Dia<input type="date" data-dm-date value="${date}"></label><button type="button" data-dm-today>Hoje</button><button type="button" data-dm-import>Importar SAP</button><input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" data-dm-file hidden></div></header><fieldset class="dm-filters"><legend>Operação</legend>${kinds.map(k=>`<label><input type="checkbox" data-dm-kind value="${k}" checked>${k}</label>`).join('')}<button type="button" data-dm-all>Todos</button></fieldset><div class="dm-controls"><input data-dm-search placeholder="Buscar DT, placa ou transportadora" aria-label="Buscar DT, placa ou transportadora"><label>Situação da DT<select data-dm-status><option value="all">Todas as situações</option><option value="Carregado">Carregados</option><option value="Em carregamento">Em carregamento</option><option value="Não se apresentou">Não se apresentou ainda</option><option value="Se apresentou na fábrica">Se apresentou na fábrica</option><option value="Faturamento de nota">Faturamento de nota</option></select></label><label>Registro no HEILOG<select data-dm-registration><option value="all">Todos</option><option value="yes">Com registro</option><option value="no">Sem registro</option><option value="check">Conferir placa</option></select></label><label><input type="checkbox" data-dm-repeat>Somente placas com mais de uma venda</label></div><p data-dm-info role="status"></p><div class="dm-kpis" data-dm-kpis></div><details class="dm-ranking"><summary>Placas com mais de uma venda carregada</summary><div data-dm-ranking></div></details><div data-dm-mapping hidden></div><div class="dm-table-wrap"><table><thead><tr><th>DT / Transporte</th><th>Situação da DT</th><th>Carreta</th><th>Cavalo</th><th>Operação</th><th>Prioridade</th><th>Ocorrências</th><th>Chegada</th><th>Carregamento</th><th>Registro no HEILOG</th><th>Transportadora</th><th>Origem da informação</th></tr></thead><tbody data-dm-rows></tbody></table></div><div class="dm-pagination"><span data-dm-count></span><button type="button" data-dm-prev>Anterior</button><button type="button" data-dm-next>Próxima</button></div><p class="dm-note">Baldeios incluem Ritmo e as viagens da JSL marcadas como baldeio no HEILOG e são trazidos do HEILOG no dia selecionado, mesmo sem relatório SAP. As demais operações usam as DTs do relatório. Quando há vínculo, a DT SAP complementa a viagem sem duplicar a contagem. Chegadas são contadas pela marcação no HEILOG ou pelo horário de chegada importado. Baldeios carregados incluem a data de conclusão ou o status Carregado/Finalizado (SAP a partir de 5). Sem conclusão informada, a contagem usa o dia da chegada ou a data de referência do relatório, mantendo “Carregado · data não informada”. Vendas repetidas consideram DTs distintas carregadas no dia, pela carreta; sem carreta, pelo cavalo.</p>`;
  const q=s=>element.querySelector(s);
  function render(){if(!active||!isVisible())return;const state=getState(date,imports);q('[data-dm-import]').hidden=!canImport();
   const key=state.path+':'+date;if(loadKey!==key){loadKey=key;imports=[];importInfo=null;error='';loading=true;loadImport(date,data=>{if(loadKey!==key)return;imports=data?.rows||[];importInfo=data?.meta||null;loading=false;render();}).then(data=>{if(loadKey!==key)return;imports=data?.rows||[];importInfo=data?.meta||null;loading=false;render();}).catch(e=>{if(loadKey!==key)return;loading=false;error='Não foi possível carregar a comparação SAP desta data.';toast(error,'error');render();});}
   report=build({...state,imported:imports,date,selectedKinds:selected,search,onlyRepeated,registration,statusFilter,reportOnly:true,includeHeilogBaldeios:true,restrictBaldeioCarriers:true});
   q('[data-dm-info]').textContent=error||[loading?'Carregando relatório SAP…':importInfo?`SAP: ${importInfo.fileName} · importado em ${short(importInfo.importedAtMs)}`:'Baldeios do HEILOG no dia selecionado. Importe o SAP para complementar as DTs e mostrar as demais operações.',!state.ready?'Conferindo Histórico do HEILOG…':'',report.unknown?`${report.unknown} linha(s) sem operação identificada.`:'',report.stats.baldeiosByStatus?`${report.stats.baldeiosByStatus} baldeio(s) contado(s) pelo status, sem horário de conclusão.`:''].filter(Boolean).join(' · ');
   q('[data-dm-kpis]').innerHTML=[['Baldeios carregados hoje',report.stats.baldeios],['Placas com >1 venda',report.stats.repeated],['Chegadas de carga',report.stats.loads],['Chegadas de descarga',report.stats.unloads],['SAP sem registro localizado',report.stats.missing]].map(([label,n])=>`<div><span>${label}</span><strong>${n}</strong></div>`).join('');
   q('[data-dm-ranking]').innerHTML=report.ranking.length?report.ranking.map(r=>`<p><strong>${esc(r.plate)} · ${r.count} vendas</strong><span> DTs ${r.dts.map(esc).join(', ')}</span></p>`).join(''):'<p>Nenhuma placa com mais de uma DT de venda carregada nesta seleção.</p>';
   const pages=Math.max(1,Math.ceil(report.rows.length/25));page=Math.max(1,Math.min(page,pages));
   const visibleRows=report.rows.slice((page-1)*25,page*25),occState=watchOccurrences?.(visibleRows,render)||{ready:false};
   q('[data-dm-rows]').innerHTML=visibleRows.map(r=>{const occurrence=occurrenceSummary(r,occState);return `<tr><td><strong>${esc(r.source==='HEILOG'&&(!dt(r.dt)||root.BaldeioSap?.temporaryDt(r.dt))?'Sem DT SAP':r.dt||'Sem DT')}</strong></td><td><span class="dm-badge dm-${esc(r.presentationTone)}">${esc(r.presentationStatus||(r.registration==='loading'?'Conferindo HEILOG…':r.registration==='check'?'Conferir vínculo':'Não informado'))}</span>${r.sapStatus||r.source==='SAP'&&r.status?'<br><small>Status SAP: '+esc(r.sapStatus??r.status)+'</small>':''}</td><td>${esc(r.trailer||'—')}</td><td>${esc(r.truck||'—')}</td><td>${esc(r.kind)}</td><td title="${esc(r.prioritySource+' · Marcação: '+(r.heilogMarkAt?short(r.heilogMarkAt):'não localizada')+' · Agenda SAP: '+(r.scheduledAt?short(r.scheduledAt,r.scheduledPrecision):'não informada'))}"><strong>${esc([r.priorityCode,r.priorityLabel].filter(Boolean).join(' · '))}</strong>${r.agendaStatus?'<br><small>'+esc(r.agendaStatus)+'</small>':''}</td><td title="${esc(occurrence.details)}"><span class="dm-badge dm-${occurrence.tone}">${esc(occurrence.label)}</span></td><td>${r.arrivalAt?short(r.arrivalAt,r.arrivalPrecision):'Não informada'}</td><td>${r.loadedAt?short(r.loadedAt,r.loadedPrecision):loaded(r.sapStatus??r.status)?'Carregado · data não informada':'Não concluído / sem registro'}</td><td><span class="dm-badge dm-${r.registration}">${esc(r.registration==='no'&&r.presentationStatus!=='Não se apresentou'?'Não localizado no HEILOG':r.matchLabel)}</span></td><td>${esc(r.carrier||'—')}</td><td>${esc(r.source)}</td></tr>`;}).join('')||'<tr><td colspan="12">'+(report.unknown?'Nenhum movimento classificado nesta seleção. Há '+report.unknown+' linha(s) sem operação identificada no relatório; clique em Todos para visualizá-las.':'Nenhum movimento nesta seleção.')+'</td></tr>';
   q('[data-dm-count]').textContent=`${report.rows.length} movimentos · página ${page} de ${pages}`;q('[data-dm-prev]').disabled=page<=1;q('[data-dm-next]').disabled=page>=pages;
  }
  function previewMapping(){
   const sheet=q('[data-dm-sheet]').value;const raw=root.XLSX.utils.sheet_to_json(workbook.Sheets[sheet],{header:1,defval:'',raw:false});headerRow=Number(q('[data-dm-header]').value)||0;const headers=(raw[headerRow]||[]).map(String);const mapping=guess(headers);
   const container=q('[data-dm-mapfields]');container.innerHTML=Object.entries(fields).map(([key,label])=>`<label>${label}<select data-map="${key}"><option value="-1">Não informado</option>${headers.map((h,i)=>`<option value="${i}" ${i===mapping[key]?'selected':''}>${esc(h||'Coluna '+(i+1))}</option>`).join('')}</select></label>`).join('');
   q('[data-dm-preview]').textContent=raw.slice(headerRow+1,headerRow+4).map(r=>r.join(' | ')).join('\n');
   return raw;
  }
  q('[data-dm-file]').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;if(!canImport())return toast('Seu perfil não permite importar relatórios.','error');try{if(!root.XLSX)throw Error('A leitura de planilhas ainda está carregando. Tente novamente.');if(file.size>20*1024*1024)throw Error('Selecione um relatório de até 20 MB.');const bytes=await file.arrayBuffer();if(/\.(csv|tsv|txt)$/i.test(file.name)){const view=new Uint8Array(bytes);let text;if(view[0]===255&&view[1]===254)text=new TextDecoder('utf-16le').decode(bytes);else if(view[0]===254&&view[1]===255)text=new TextDecoder('utf-16be').decode(bytes);else{try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(_){text=new TextDecoder('windows-1252').decode(bytes);}}workbook=root.XLSX.read(text,{type:'string',raw:true});}else workbook=root.XLSX.read(bytes,{type:'array'});fileName=file.name;
    const panel=q('[data-dm-mapping]');panel.hidden=false;panel.innerHTML=`<h4>Conferir colunas · ${esc(fileName)}</h4><p>Referência: ${date.split('-').reverse().join('/')}. Selecione as colunas do relatório; a chegada não será inferida da data de referência.</p><div class="dm-controls"><label>Aba<select data-dm-sheet>${workbook.SheetNames.map(n=>`<option>${esc(n)}</option>`).join('')}</select></label><label>Linha do cabeçalho<select data-dm-header>${Array.from({length:20},(_,i)=>`<option value="${i}">${i+1}</option>`).join('')}</select></label><label>Operação se não houver coluna<select data-dm-default><option>Não classificado</option>${kinds.map(k=>`<option>${k}</option>`).join('')}</select></label></div><div class="dm-map-grid" data-dm-mapfields></div><details><summary>Primeiras linhas</summary><pre data-dm-preview></pre></details><div class="dm-controls"><button type="button" data-dm-save>Confirmar importação para a data</button><button type="button" data-dm-cancel>Cancelar</button></div><p>A nova importação substitui a lista SAP desta data; os registros HEILOG são preservados.</p>`;
    q('[data-dm-sheet]').addEventListener('change',previewMapping);q('[data-dm-header]').addEventListener('change',previewMapping);q('[data-dm-cancel]').onclick=()=>{panel.hidden=true;};previewMapping();
    q('[data-dm-save]').onclick=async()=>{const btn=q('[data-dm-save]');btn.disabled=true;try{if(!canImport())throw Error('Seu perfil não permite importar relatórios.');const m=Object.fromEntries([...element.querySelectorAll('[data-map]')].map(s=>[s.dataset.map,Number(s.value)]));if([m.dt,m.trailer,m.truck].every(n=>n<0))throw Error('Selecione a coluna de DT ou uma coluna de placa.');const raw=root.XLSX.utils.sheet_to_json(workbook.Sheets[q('[data-dm-sheet]').value],{header:1,defval:'',raw:true});const rows=convert(raw.slice(Number(q('[data-dm-header]').value)+1),m,{date,defaultKind:q('[data-dm-default]').value,date1904:!!workbook.Workbook?.WBProps?.date1904});if(!rows.length)throw Error('Nenhuma DT ou placa foi encontrada nas colunas selecionadas.');if(rows.length>20000)throw Error('O relatório deve ter até 20 mil linhas.');await saveImport(date,rows,fileName);panel.hidden=true;loadKey='';page=1;render();toast('Relatório SAP importado. Comparação atualizada.','success');}catch(e){toast(e.message||'Não foi possível importar o relatório.','error');}finally{btn.disabled=false;}};
   }catch(e){toast(e.message||'Não foi possível ler o arquivo.','error');}finally{e.target.value='';}});
  q('[data-dm-import]').onclick=()=>q('[data-dm-file]').click();q('[data-dm-date]').onchange=e=>{if(!e.target.value)return;date=e.target.value;page=1;q('[data-dm-mapping]').hidden=true;render();};q('[data-dm-today]').onclick=()=>{date=day(Date.now());q('[data-dm-date]').value=date;page=1;render();};
  element.querySelectorAll('[data-dm-kind]').forEach(c=>c.onchange=()=>{selected=[...element.querySelectorAll('[data-dm-kind]:checked')].map(c=>c.value);page=1;render();});q('[data-dm-all]').onclick=()=>{selected=[...kinds];element.querySelectorAll('[data-dm-kind]').forEach(c=>c.checked=true);page=1;render();};let searchTimer;q('[data-dm-search]').oninput=e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{search=e.target.value;page=1;render();},180);};q('[data-dm-status]').onchange=e=>{statusFilter=e.target.value;page=1;render();};q('[data-dm-registration]').onchange=e=>{registration=e.target.value;page=1;render();};q('[data-dm-repeat]').onchange=e=>{onlyRepeated=e.target.checked;page=1;render();};q('[data-dm-prev]').onclick=()=>{page--;render();};q('[data-dm-next]').onclick=()=>{page++;render();};
  return {isActive:()=>active,getDate:()=>date,setActive(value){active=!!value;element.hidden=!active;if(active)render();else{loadKey='';stopImport?.();stopOccurrences?.();}},render};
 }
 root.HeilogDaily={kinds,norm,plate,dt,day,time,kind,loaded,baldeioCarrier,markedBaldeio,markedBaldeioJsl,allowedBaldeio,priority,priorityLabels,occurrenceSummary,build,guess,convert,createUI};
})(window);
