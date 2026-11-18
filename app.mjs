import {loadData} from './data.mjs';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=n=>Number(n).toLocaleString('en-IN');
const pct=x=>!Number.isFinite(x)?'—':x>0&&x<.001?'<0.1%':x<1&&x>=.9995?'>99.9%':(x*100).toFixed(1)+'%';
const ratio=(n,d)=>d>0?n/d:null;
const followUp=(q,s)=>Number.isFinite(q)&&Number.isFinite(s)?(q+s)/2:null;
const stamp=s=>{const d=new Date(s);return !s||Number.isNaN(+d)?'Not available':new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(d)+' IST'};
function sectionCompare(order){
 const byDivision=(a,b)=>a.division.localeCompare(b.division)||a.section.localeCompare(b.section);
 if(order==='section')return (a,b)=>a.section.localeCompare(b.section)||byDivision(a,b);
 if(order==='status')return (a,b)=>a.status.localeCompare(b.status)||byDivision(a,b);
 if(!/^[qsf]-(low|high)$/.test(order))return byDivision;
 const value=order.startsWith('q')?s=>ratio(s.qfield?.covered,s.qfield?.listed):order.startsWith('s')?s=>s.sheets?.progress:s=>s.followUp;
 const direction=order.endsWith('high')?-1:1;
 return (a,b)=>{
  const x=value(a),y=value(b),hasX=Number.isFinite(x),hasY=Number.isFinite(y);
  if(hasX!==hasY)return hasX?-1:1;
  return (hasX?(x-y)*direction:0)||byDivision(a,b);
 };
}
const flags={none:'No activity on either',q:'Only QField active',s:'Only Sheets active',both:'Both started',qc:'QField complete · Sheets pending',sc:'Sheets complete · QField pending',done:'Both complete',review:'Needs verification'};
const status=({qfield:q,sheets:s})=>{
 if(!q||!s||!Number.isFinite(s.progress)||s.status==='review'||s.status==='Needs verification'||q.reviewRequired||q.review===true)return flags.review;
 const f=q.listed>0&&q.covered===q.listed, z=s.progress===1, a=(q.start??0)+(q.end??0)+(q.intermediate??0)+(q.unknown??0)>0, b=s.progress>0;
 return f&&z?flags.done:f?flags.qc:z?flags.sc:a&&b?flags.both:a?flags.q:b?flags.s:flags.none;
};
const card=(type,label,value,sub)=>'<article class="card '+type+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></article>';
const metric=(p,sub='',type='field')=>'<td class="metric"><strong>'+esc(pct(p))+'</strong>'+(Number.isFinite(p)?'<span class="bar '+type+'" aria-hidden="true"><i style="width:'+Math.min(100,Math.max(0,p*100))+'%"></i></span>':'')+(sub?'<small>'+esc(sub)+'</small>':'')+'</td>';
const detail=q=>q?count(q.covered)+' / '+count(q.listed)+' roads': 'Not matched';
let data, selected=[];
function render(){
 const rows=data.sections.map(s=>{
  const state=status(s);
  return {...s,status:state,followUp:state===flags.review?null:followUp(ratio(s.qfield?.covered,s.qfield?.listed),s.sheets?.progress)};
 });
 const grouped=new Map();
 for(const s of rows) {if(!grouped.has(s.division))grouped.set(s.division,[]);grouped.get(s.division).push(s)}
 const groupScores=data.divisions.map(d=>{
  const rows=grouped.get(d.division)??[], q=d.qfield, s=d.sheets?.progress, f=ratio(q?.covered,q?.listed);
  return {...d,f,s,i:followUp(f,s),none:rows.filter(t=>t.status===flags.none).length,done:rows.filter(t=>t.status===flags.done).length};
 });
 const p=$('division').value;
 $('division').innerHTML='<option value="">All divisions</option>'+[...grouped.keys()].sort().map(d=>'<option value="'+esc(d)+'">'+esc(d)+'</option>').join('');
 if(grouped.has(p))$('division').value=p;
 const reduce=(k)=>groupScores.reduce((n,d)=>n+(d.qfield?.[k]??0),0);
 const qt=data.totals?.qfield??{covered:reduce('covered'),listed:reduce('listed')}, gs=rows.filter(s=>Number.isFinite(s.sheets?.progress));
 const gm=ratio(gs.reduce((n,s)=>n+s.sheets.progress,0),gs.length);
 $('fresh').textContent='QField: '+stamp(data.meta.qfieldAt)+'  •  Sheets: '+stamp(data.meta.sheetsAt);
 $('cards').innerHTML=card('field','QField road coverage',pct(ratio(qt.covered,qt.listed)),detail(qt)+' with matched endpoints')+
 card('sheets','Google Sheets progress',pct(gm),'Average across '+count(gs.length)+' section workbooks')+
 '<button type="button" id="no-activity-card" class="card attn card-action" aria-controls="section-panel"><span>No activity on either</span><strong>'+count(rows.filter(s=>s.status===flags.none).length)+'</strong><small>View sections and divisions ↓</small></button>'+
 card('','Complete on both',count(rows.filter(s=>s.status===flags.done).length),count(data.meta.matchedCount??rows.filter(s=>s.qfield&&s.sheets).length)+' sections matched across sources');
 const o=$('order').value, key=o==='field'?'f':o==='sheets'?'s':'i';
 const score=d=>Number.isFinite(d[key])?d[key]*(o==='desc'?-1:1):Infinity;
 groupScores.sort((a,b)=>(o==='name'?0:score(a)-score(b))||a.division.localeCompare(b.division));
 $('divisions').innerHTML=groupScores.map(d=>'<tr><td><button type="button" class="jump" data-division="'+esc(d.division)+'">'+esc(d.division)+'</button></td>'+metric(d.f,detail(d.qfield))+metric(d.s,'','sheets')+'<td><strong>'+esc(pct(d.i))+'</strong></td><td class="tabular">'+'<button type="button" class="jump" data-division="'+esc(d.division)+'" data-no-activity aria-controls="section-panel" aria-label="'+esc(d.division+': '+d.none+' sections with no activity on either')+'">'+count(d.none)+'</button></td><td class="tabular">'+d.done+'</td></tr>').join('');
 const div=$('division').value, st=$('status').value, search=$('search').value.trim().toLowerCase();
 selected=rows.filter(s=>(!div||s.division===div)&&(!st||s.status===st)&&(!search||[s.section,s.division,s.subdivision].filter(Boolean).some(v=>v.toLowerCase().includes(search)))).sort(sectionCompare($('section-order').value));
 $('count').textContent=count(selected.length)+' of '+count(rows.length)+' sections shown';
 $('sections').innerHTML=selected.map(s=>'<tr><td><strong>'+esc(s.section)+'</strong></td><td>'+esc(s.division)+'</td>'+metric(ratio(s.qfield?.covered,s.qfield?.listed),detail(s.qfield))+metric(s.sheets?.progress,s.sheets?'':'Not matched','sheets')+'<td class="metric"><strong>'+esc(pct(s.followUp))+'</strong></td><td><span class="chip '+(s.status===flags.none?'alert':s.status===flags.done?'good':s.status===flags.review?'review':'')+'">'+esc(s.status)+'</span></td></tr>').join('')||'<tr><td colspan="6">No sections match these filters.</td></tr>';
 $('export').disabled=!selected.length;
}
const warning=(v)=>{$('error').hidden=!v;$('error').textContent=v??'';};
function set(d){if(!Array.isArray(d.sections)||!d.sections.length||!Array.isArray(d.divisions)||!d.meta)throw Error('Invalid dashboard data');data=d;render();if(d.meta.warnings?.length) warning(d.meta.warnings.join(' '));else warning(null);}
async function refresh(){
 $('refresh').disabled=true;const src=$('fresh').textContent;$('fresh').textContent='Checking both published sources…';
 try {set(await loadData({signal:AbortSignal.timeout(14000)}));} catch (e){if(data)render();else $('fresh').textContent=src;warning(data?'Refresh unavailable. Showing the last verified snapshot with the source times above.':'Dashboard data could not be loaded. Try refreshing or open the source dashboards below.');} finally {$('refresh').disabled=false;}
}
$('refresh').onclick=refresh;
function openSections(division='',filter=''){
 if(!data)return;
 $('division').value=division;$('status').value=filter;$('search').value='';
 render();$('section-panel').scrollIntoView({block:'start'});$('sectitle').focus({preventScroll:true});
}
$('cards').onclick=e=>{if(e.target.closest('#no-activity-card'))openSections('',flags.none);};
$('divisions').onclick=e=>{const b=e.target.closest('button[data-division]');if(b)openSections(b.dataset.division,b.hasAttribute('data-no-activity')?flags.none:'');};
for(const id of ['status','search','order','division','section-order'])$(id).addEventListener(id==='search'?'input':'change',()=>{if(data)render()});
$('reset').onclick=()=>{for(const id of ['status','search','division','section-order'])$(id).value='';if(data)render()};
$('export').onclick=()=>{
 const quote=v=>{let t=String(v??'');if(/^[\s]*[=+\-@]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"'};
 const lines=[['Division','Section','QField roads covered','QField roads listed','QField coverage','Sheets progress','Follow-up score','Status','QField snapshot','Sheets snapshot'],...selected.map(s=>[s.division,s.section,s.qfield?.covered,s.qfield?.listed,pct(ratio(s.qfield?.covered,s.qfield?.listed)),pct(s.sheets?.progress),pct(s.followUp),s.status,data.meta.qfieldAt,data.meta.sheetsAt])];
 const href=URL.createObjectURL(new Blob(['\ufeff'+lines.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=href;a.download='kerala-pwd-section-progress.csv';a.click();setTimeout(()=>URL.revokeObjectURL(href),5000);
};
try{const r=await fetch('./baseline.json');if(!r.ok)throw Error();set(await r.json());}catch{}
await refresh();
