/* Road and stretch-aware scoring, revision 4. */
export const labels=['Listed roads','Segmented roads','New roads','Maintenance history','General road data'];
export const filled=v=>v!==null&&v!==undefined&&!['','-','--','n/a','na','nil','none','not applicable'].includes(String(v).trim().toLowerCase());
export function scoreSheet(name,rows,base,kind){
 const rr=rows.filter(r=>r.number>(kind<3?2:1)&&Object.entries(r.cells).some(([c,v])=>!(kind===1?['A','K','W','X','Y']:kind<3?['A','T','U']:kind===3?['A','B','G','N']:['A','J']).includes(c)&&filled(v)));
 let required=0,count=0;
 for(const {cells:r} of rr){let cols;
  const yes=c=>String(r[c]??'').trim().toLowerCase()==='yes';
  if(kind===0||kind===2){cols=(kind===0?'DEFHIJKLMNOPR':'EFHIJKLMNOPR').split('');if(String(r.F??'').trim().toUpperCase()==='SH')cols.push('G');if(yes('P'))cols.push('Q');if(yes('R'))cols.push('S');}
  else if(kind===1){cols='BDEFHIJLMNOPQRSU'.split('');if(String(r.F??'').trim().toUpperCase()==='SH')cols.push('G');if(yes('S'))cols.push('T');if(yes('U'))cols.push('V');}
  else cols=(kind===3?'CDEFHIJKLM':'BCDEFGHI').split('');
  required+=cols.length;count+=cols.filter(c=>filled(r[c])||(kind===3&&'HIJKLM'.includes(c)&&/^(na|n\/a|nil|none|not applicable)$/i.test(String(r[c]??'').trim()))).length;
 }
 const target=kind>=3?Math.max(base,rr.length):rr.length;
 if(kind>=3)required+=(target-rr.length)*(kind===3?10:8);
 return {name,kind,rows:rr.length,target,filled:count,required,nil:false};
}
export function progress(t){if(!t||t.missing)return 0;if(t.notApplicable)return 1;if(t.nil&&t.rows===0&&[1,2].includes(t.kind))return 1;return t.required>0?Math.min(1,Math.max(0,t.filled/t.required)):0;}
export const sectionProgress=s=>{const tabs=s.tabs.filter(t=>t.kind!==2&&!t.notApplicable);return tabs.length?tabs.reduce((a,t)=>a+progress(t),0)/tabs.length:0;};
const key=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
const active=(rows,header)=>rows.filter(r=>r.number>header&&Object.entries(r.cells).some(([c,v])=>c!=='A'&&filled(v)));
// Carry only shared road metadata inside an explicitly bounded stretch group.
export function segmentedRows(rows){
 let shared=null,previous=0;
 return rows.map(row=>{
  const r={...row.cells},n=Number(r.I);
  const starts=filled(r.A)||filled(r.B)||n===1;
  if(starts){shared={};previous=0;}
  const continuation=shared&&row.number===previous+1&&!starts;
  if(continuation)for(const c of 'BCDEFGH')if(!filled(r[c])&&filled(shared[c]))r[c]=shared[c];
  if(starts||continuation){for(const c of 'BCDEFGH')if(filled(r[c]))shared[c]=r[c];previous=row.number;}
  else shared=null;
  return {...row,cells:r};
 });
}
export function scoreWorkbook(raw){
 const kindOf=name=>/^1\s/.test(name)?0:/^2\s/.test(name)?1:/^3\s/.test(name)?2:/maintenance/i.test(name)?3:/general|genaral|basic road/i.test(name)?4:-1;
 const by=new Map(raw.map(t=>[kindOf(t.name),t]));
 const listed=active(by.get(0)?.rows||[],2).filter(r=>filled(r.cells.B)||filled(r.cells.E));
 const singles=listed.filter(r=>key(r.cells.H)!=='no'),split=listed.filter(r=>key(r.cells.H)==='no');
 const base=listed.length,tabs=[];
 for(const [kind,t] of by){if(kind<0)continue;
  if(kind===0){const scored=scoreSheet(t.name,singles,0,0);scored.notApplicable=listed.length>0&&singles.length===0;tabs.push(scored);}
  if(kind===2)tabs.push({...scoreSheet(t.name,t.rows,base,kind),excluded:kind===2});
 }
 const seg=by.get(1),segRows=segmentedRows(active(seg?.rows||[],2)),used=new Set();let required=0,done=0,stretchTarget=0,stretchRows=0,unknown=0;
 for(const road of split){
  const aliases=[road.cells.B,road.cells.E].filter(filled).map(key);
  const asset=key(road.cells.D),uniqueAsset=filled(road.cells.D)&&listed.filter(r=>key(r.cells.D)===asset).length===1;
  const matches=segRows.filter(r=>{
   // A unique PRICE asset identifies the parent even when stretch names differ.
   if(uniqueAsset&&filled(r.cells.D))return key(r.cells.D)===asset;
   return aliases.includes(key(r.cells.B))||aliases.includes(key(r.cells.E));
  });
  matches.forEach(r=>used.add(r));
  const declared=Math.max(0,...matches.map(r=>Number(r.cells.H)||0));
  const distinct=new Map();for(const r of matches){const n=Number(r.cells.I);if(Number.isInteger(n)&&n>0&&!distinct.has(n))distinct.set(n,r);}
  // An entered stretch without its number earns partial credit, not zero for the whole row.
  const unnumbered=matches.filter(r=>!filled(r.cells.I)&&'LMNOPQR'.split('').some(c=>filled(r.cells[c])));
  for(const r of unnumbered){let n=1;while(distinct.has(n))n++;distinct.set(n,r);}
  const expected=Math.max(1,declared,...distinct.keys());if(!declared)unknown++;
  let roadDone=0;for(const [n,r] of distinct){const one=scoreSheet('',[r],0,1);roadDone+=progress(one);}
  // One unit per parent road, split evenly across its declared stretches.
  required+=1;done+=roadDone/expected;stretchTarget+=expected;stretchRows+=distinct.size;
 }
 if(seg)tabs.push({name:seg.name,kind:1,rows:stretchRows,target:stretchTarget,filled:done,required,notApplicable:split.length===0,roadCount:split.length,unknown,unmatched:segRows.filter(r=>!used.has(r)).length,nil:false,locked:true});
 for(const kind of [3,4]){
 const general=by.get(kind);if(!general)continue;
 const nameColumn=kind===3?'C':'B',fieldsPerRoad=kind===3?10:8;
  const roads=new Map();for(const r of listed){const id=key(r.cells.B)||key(r.cells.E);if(!roads.has(id))roads.set(id,[r.cells.B,r.cells.E].filter(filled).map(key));}
  const rows=active(general.rows,1);let count=0,matched=0;const consumed=new Set();
  for(const aliases of roads.values()){const candidates=rows.filter(r=>!consumed.has(r)&&aliases.includes(key(r.cells[nameColumn])));if(candidates.length){const best=candidates.sort((a,b)=>scoreSheet('',[b],0,kind).filled-scoreSheet('',[a],0,kind).filled)[0];consumed.add(best);count+=scoreSheet('',[best],0,kind).filled;matched++;}}
  tabs.push({name:general.name,kind,rows:matched,target:roads.size,filled:count,required:roads.size*fieldsPerRoad,nil:false,maintenanceVersion:kind===3?6:undefined,unmatched:rows.length-consumed.size});
 }
 return {base,tabs,roadCounts:{single:singles.length,segmented:split.length}};
}
// Recalculate maintenance from published rows using the same rules as a new ZIP.
function migrateMaintenance(s){
 if(!s.entries?.some(t=>/^1\s/.test(t.name))||!s.entries.some(t=>/maintenance/i.test(t.name)))return;
 const updated=scoreWorkbook(s.entries).tabs.find(t=>t.kind===3);
 if(updated){s.tabs=s.tabs.filter(t=>t.kind!==3);s.tabs.push(updated);}
}
export function normalize(data){for(const s of data.sections){migrateMaintenance(s);if(s.entries?.some(t=>/^1\s/.test(t.name))&&s.entries.some(t=>/^2\s/.test(t.name))){const updated=scoreWorkbook(s.entries).tabs.find(t=>t.kind===1);if(updated){s.tabs=s.tabs.filter(t=>t.kind!==1);s.tabs.push(updated);if(data.warnings){data.warnings=data.warnings.filter(w=>!(w.startsWith(s.section+': ')&&(w.includes('unmatched Segmented roads rows')||w.includes('segmented roads have no total stretch count'))));if(updated.unmatched)data.warnings.push(s.section+': '+updated.unmatched+' unmatched Segmented roads rows excluded; check road names.');if(updated.unknown)data.warnings.push(s.section+': '+updated.unknown+' segmented roads have no total stretch count; minimum one pending stretch used.');}}}for(let k=0;k<5;k++)if(!s.tabs.some(t=>t.kind===k))s.tabs.push({name:labels[k],kind:k,rows:0,target:0,filled:0,required:0,missing:true});}return data;}
