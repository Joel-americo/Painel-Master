/* Read-only Google Sheets parsing and conservative HEILOG journey matching. */
export const SHEET_ID='1zu4jvUhxK9_zQfgVlkr39d_l819H-se6jKbepdK01oA';
export const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
export const plate=v=>norm(v).replace(/[^A-Z0-9]/g,'');
const validPlate=v=>/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(v);
export const fingerprint=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export function csv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('CSV incompleto.');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
export function timestamp(date,time){
 const d=String(date||'').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/),t=String(time||'').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
 if(!d||!t||+t[1]>23||+t[2]>59||+(t[3]||0)>59)return 0;
 const calendar=new Date(Date.UTC(+d[3],+d[2]-1,+d[1]));if(calendar.getUTCFullYear()!==+d[3]||calendar.getUTCMonth()!==+d[2]-1||calendar.getUTCDate()!==+d[1])return 0;
 return Date.parse(`${d[3]}-${d[2]}-${d[1]}T${t[1].padStart(2,'0')}:${t[2]}:${t[3]||'00'}-03:00`);
}
export function parseSheet(text,carrier){
 const matrix=csv(text),ritmo=carrier==='ritmo',required=ritmo?['CAVALO ENTRADA','CARRETA ENTRADA','DATA ENTRADA','HORA ENTRADA','DATA SAIDA','HORA SAIDA']:['CAVALO','CARRETA','DATA','H. ENTRADA','H. SAIDA','DATA SAIDA'];
 const h=matrix.findIndex(r=>required.every(x=>r.map(norm).includes(x)));if(h<0)throw Error(`Cabeçalhos da aba ${carrier.toUpperCase()} não reconhecidos.`);
 const headers=matrix[h].map(norm),index=x=>headers.indexOf(x),get=(r,x)=>String(r[index(x)]||'').trim();
 return matrix.slice(h+1).flatMap((r,i)=>{
  if(!r.some(v=>String(v).trim()))return [];
  const truck=plate(get(r,ritmo?'CAVALO ENTRADA':'CAVALO')),trailer=plate(get(r,ritmo?'CARRETA ENTRADA':'CARRETA'));
  const arrivalMs=timestamp(get(r,ritmo?'DATA ENTRADA':'DATA'),get(r,ritmo?'HORA ENTRADA':'H. ENTRADA'));
  const outDate=get(r,ritmo?'DATA SAIDA':'DATA SAIDA'),outTime=get(r,ritmo?'HORA SAIDA':'H. SAIDA'),leaveMs=timestamp(outDate,outTime);
  // RITMO N/O/P/Q are vehicle exit. S/T/U are release and must never supply leaveMs.
  const exitTruck=ritmo?plate(r[13]):truck,exitTrailer=ritmo?plate(r[14]):trailer;
  const control=String(r[ritmo?23:14]||'').trim(),registration=get(r,'REGISTRO');
  const id=carrier+':'+(control||[truck,trailer,arrivalMs,registration].join(':'));
  let issue='';if(!validPlate(truck))issue='Cavalo de entrada ausente ou inválido';else if(!arrivalMs)issue='Data/hora de entrada inválida';else if((outDate||outTime)&&!leaveMs)issue='Saída sem data/hora válida';else if(leaveMs&&leaveMs<arrivalMs)issue='Saída anterior à entrada';else if(leaveMs&&exitTruck&&exitTruck!==truck)issue='Troca de cavalo: conferir saída';else if(leaveMs&&exitTrailer&&trailer&&exitTrailer!==trailer)issue='Troca de carreta: conferir saída';
  return [{id,carrier,sheet:carrier.toUpperCase(),row:h+i+2,truck,trailer,exitTruck,exitTrailer,arrivalMs,leaveMs,dt:get(r,'DT CARREGAMENTO').replace(/[.\s]/g,''),issue}];
 });
}
export function proposals(rows,cycles,now=Date.now()){
 const byTruck=new Map(),owners=new Map();
 for(const c of cycles){const op=c.op;if(op.lusitanaSync?.rowId)owners.set(op.lusitanaSync.rowId,(op.operacaoIdOriginal||op.id)+':'+c.mark);if(c.remarkSuperseded||c.baselineClosed||/^(CANCELADO|ESTORNADO)$/.test(norm(op.status)))continue;const key=op._origin+':'+plate(op._truck);if(!byTruck.has(key))byTruck.set(key,[]);byTruck.get(key).push(c);}
 for(const list of byTruck.values())list.sort((a,b)=>a.mark-b.mark);
 const duplicates=new Map();for(const r of rows)duplicates.set(r.id,(duplicates.get(r.id)||0)+1);
 const result=rows.map(row=>{
  const item={row,ok:false,reason:row.issue||'',cycle:null,patch:null};
  if(row.issue)return item;if(duplicates.get(row.id)>1)return {...item,reason:'Linha duplicada na planilha'};
  if(row.arrivalMs>now||row.leaveMs>now)return {...item,reason:'Horário futuro na planilha'};
  const list=byTruck.get(row.carrier+':'+row.truck)||[];
  const matches=list.filter((c,i)=>{
   const upper=list[i+1]?.mark||Math.min(c.mark+86400000,now+1);
   return row.arrivalMs>=c.mark&&row.arrivalMs<upper&&(!row.leaveMs||row.leaveMs<=upper)&&(!c.exit||row.arrivalMs>=c.exit)&&(!c.returned||!row.leaveMs||row.leaveMs<=c.returned)&&(!c.closed||!c.completedMs||(row.arrivalMs<=c.completedMs&&(!row.leaveMs||row.leaveMs<=c.completedMs)))&&(!row.trailer||!plate(c.op._trailer)||row.trailer===plate(c.op._trailer));
  });
  if(matches.length!==1)return {...item,reason:matches.length?'Mais de uma viagem compatível':'Sem viagem compatível por placa e sequência de horários'};
  const cycle=matches[0],op=cycle.op,passage=(op.operacaoIdOriginal||op.id)+':'+cycle.mark;
  if(owners.has(row.id)&&owners.get(row.id)!==passage)return {...item,reason:'Linha já vinculada a outra marcação'};
  if(op.lusitanaSync?.rowId&&op.lusitanaSync.rowId!==row.id)return {...item,reason:'Viagem já vinculada a outra linha'};
  if(op.lusitanaSync?.paused)return {...item,cycle,reason:'Sincronização estornada para esta viagem'};
  const realDt=v=>/^\d+$/.test(String(v||''))&&!/^0+$/.test(String(v))&&!/^20\d{12}$/.test(String(v));
  if(realDt(row.dt)&&realDt(op.dt)&&row.dt!==String(op.dt))return {...item,reason:'DT da planilha diverge da viagem; conferir'};
  const v=op.baldeioViagem||{},old=op.lusitanaSync||{},patch={};
  for(const key of ['arrivalMs','leaveMs']){const value=row[key];if(!value)continue;if(v[key]&&v[key]!==value&&v[key]!==old[key])return {...item,reason:'Horário informado manualmente diverge da planilha'};if(v[key]!==value)patch[key]=value;}
  if((patch.arrivalMs||v.arrivalMs)&&(patch.leaveMs||v.leaveMs)&&(patch.leaveMs||v.leaveMs)<(patch.arrivalMs||v.arrivalMs))return {...item,reason:'Correção deixaria a saída anterior à entrada'};
  return {...item,ok:true,cycle,patch,passage,reason:Object.keys(patch).length?'Pronto para sincronizar':'Horários já conferidos'};
 });
 const use=new Map();for(const item of result)if(item.ok){if(!use.has(item.passage))use.set(item.passage,[]);use.get(item.passage).push(item);}
 for(const list of use.values())if(list.length>1)for(const item of list){item.ok=false;item.reason='Duas linhas da planilha para a mesma viagem';}
 return result;
}
