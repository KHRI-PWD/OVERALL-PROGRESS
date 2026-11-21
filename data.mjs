import * as bundledSheetsScoring from './sheets-engine.mjs';
export const SOURCE_URLS={qfield:'https://arunmohan-007.github.io/kerala-pwd-road-survey/report.json',sheets:'https://khri-pwd.github.io/ROAD-DIGITIZATION-GOOGLE-SHEET-PROGRESS/snapshot.json'};
export const SHEETS_ENGINE_URL=new URL('engine.js',SOURCE_URLS.sheets).href;
const divisions={kasaragod:'kasargod',trivandrum:'thiruvananthapuram'};
const canon=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const divKey=n=>{ const k=canon(String(n||'').replace(/ (district|division)\s*$/i,''));return divisions[k]||k; };
const aliases={
 alappuzha:{chenganuur:'chengannur',edathuva:'edathua',mavelikara:'mavelikkara',pulincunnu:'pulimkunnu'},
 ernakulam:{mulamthuruthy:'mulanthuruthy',northparavoor:'northparavur',thripunithura:'thrippunithura'},
 idukki:{karimannoor:'karimannur',kumily:'kumali',marayoor:'marayur',nedumkandam:'nedumkandom',peermade:'peerumade',vandenmedu:'vandanmedu'},
 kannur:{koothuparambu:'koothuparamba',thaliparambu:'taliparamba',valappatanam:'valapattanam'},
 kasargod:{badiadkka:'badiyadka',kasargod:'kasaragod',manjeshwar:'manjeswar',nileshwar:'nileswar'},
 kollam:{chathanoor:'chathannoor',karunagapally:'karunagappally',kottarakara:'kottarakkara',ochira:'oachira'},
 kottayam:{changanasserry:'changanassery',erumelly:'erumeli',ettumannoor:'ettumanoor',kanjirapally:'kanjirappally',pambady:'pampady',vazhoor:'vazhur'},
 kozhikode:{koduvally:'koduvalli',koyilandi:'koyilandy',narikunni:'narikkuni'},
 malappuram:{kondotty:'kondotti',kuttipuram:'kuttippuram',melattur:'melattoor',parappanagadi:'parappanangadi'},
 muvattupuzha:{kalloorkkad:'kalloorkad',kuthattukulam:'koothattukulam',kuruppambady:'kuruppampady',piravam:'piravom',pothanicadu:'pothanikkad'},
 palakkad:{kuzhakmandam:'kuzhalmannam',ottapalam:'ottappalam'},
 pathanamthitta:{mallapally:'mallappally',panthalam:'pandalam',vennikulam:'vennikkulam'},
 thiruvananthapuram:{kazhakootam:'kazhakkuttom',neyyattinkara:'neyattinkara'},
 thrissur:{chalakkudy:'chalakudy',irinjalakkuda:'irrinjalakkuda',kodungalloor:'kodungallur',town:'thrissurtown',wadakkancherry:'wadakkanchery'},
 wayanad:{padinjarathara:'padinjarethara',sulthanbethery:'sulthanbathery',thirunelly:'thirunelli'}
};
const sectionKey=(d,value)=>{
 let n=String(value||'').toLowerCase().replaceAll('_',' ').trim();
 if(['kollam','pathanamthitta','thiruvananthapuram'].includes(d)&&new RegExp('^'+d+'\\s*-').test(n)) n=n.split(/\s*-\s*/).at(-1);
 n=n.replace(/^\s*(?:pwd\s+)?(?:roads?|raods)\s+(?:section\b\s*)?/,'')
    .replace(/\b(?:roads?\s+)?section\b(?:\s*no[. ]*)?/g,' ');
 const k=canon(n);return aliases[d]?.[k]||k;
};
const assigned=s=>!/^unassigned (?:pwd )?section$/i.test(s.name.trim());
const metrics=['listed','covered','start','intermediate','end','unknown','new','review','excluded'];
const counts=row=>Object.fromEntries(metrics.map(k=>[k,typeof row[k]==='number'&&Number.isFinite(row[k])?row[k]:0]));
const time=(val)=>typeof val==='string'&&Number.isFinite(Date.parse(val))?val:null;
const qfScore=row=>{
 const out=counts(row), {start,intermediate,end,unknown,listed,covered}=out;
 const notStarted=start+intermediate+end+unknown===0,complete=listed>0&&listed===covered;
 return {...out,progress:listed?covered/listed:null,status:complete?'done':notStarted?'none':'progress',notStarted,complete};
};
const shScore=(section,{progress,sectionProgress})=>{
 const p=sectionProgress(section);
 const needsReview=Boolean(section.error||section.tabs.some(t=>t.kind!==2&&t.missing));
 return {progress:p,status:needsReview?'review':p===1?'done':p===0?'none':'progress',notStarted:p===0,
 filled:p===1,over90:p>0.9,needsReview,
 tabs:section.tabs.map(t=>({kind:t.kind,name:t.name,progress:t.kind===2||t.notApplicable?null:progress(t),
 filled:t.filled,required:t.required,missing:!!t.missing,notApplicable:!!t.notApplicable,excluded:t.kind===2}))};
};
export function buildData(qfield,sheets,sheetsScoring=bundledSheetsScoring){
 if(!['normalize','progress','sectionProgress'].every(k=>typeof sheetsScoring[k]==='function'))throw Error('Invalid Google Sheets scoring module');
 if(!Array.isArray(qfield?.divisions)||!qfield.divisions.length||!qfield.divisions.every(d=>typeof d.name==='string'&&Array.isArray(d.sections))) throw Error('Invalid QField report');
 if(!Array.isArray(sheets?.sections)||!sheets.sections.length||!sheets.sections.every(s=>typeof s.section==='string'&&typeof s.division==='string'&&Array.isArray(s.tabs))) throw Error('Invalid Sheets snapshot');
 // Do not retain the published raw worksheet rows, preceding report, or QField road names.
 const gs=sheetsScoring.normalize({sections:sheets.sections.map(s=>({...s,tabs:[...s.tabs]}))});
 const qfieldAt=time(qfield.updatedAt),qfieldVerifiedThrough=time(qfield.sourceThrough),sheetsAt=time(sheets.publishedAt)||time(sheets.loadedAt);
 if(!qfieldAt||!sheetsAt)throw Error('Missing source timestamps');
 const groups=new Map(),slots=new Map(),rows=[],warnings=[];
 const group=(d,label)=>{if(!groups.has(d))groups.set(d,{division:label,qfield:null,sheetValues:[]});return groups.get(d);};
 const slot=(d,k)=>{const id=d+':'+k;if(!slots.has(id))slots.set(id,{q:[],s:[]});return slots.get(id);};
 let qfieldCount=0,sheetsCount=0;
 for(const div of qfield.divisions){
  const d=divKey(div.name);
  const g=group(d,div.name.replace(/ (district|division)\s*$/i,''));
  const actual=div.sections.filter(assigned);
  g.qfield={...counts(div),sectionCount:actual.length,notStarted:actual.filter(r=>qfScore(r).notStarted).length,completed:actual.filter(r=>qfScore(r).complete).length};
  for(const row of actual){slot(d,sectionKey(d,row.name)).q.push({name:row.name,division:g.division,qfield:qfScore(row)});qfieldCount++;}
 }
 for(const row of gs.sections){
  const d=divKey(row.division),g=group(d,row.division), score=shScore(row,sheetsScoring);
  const sub=typeof row.subdivision==='string'?row.subdivision.trim():'';
  const subdivision=sub&&!/^not supplied$/i.test(sub)?sub:null;
  g.sheetValues.push(score);
  slot(d,sectionKey(d,row.section)).s.push({name:row.section,division:g.division,sheets:score,subdivision});
  sheetsCount++;
 }
 let matchedCount=0;
 const add=(key,q,s,i=0)=>rows.push({id:i?key+':'+i:key,division:(q||s).division,
   section:(q?.name||s?.name||'').replace(/^\s*(?:pwd\s+)?(?:roads?|raods)\s+(?:section\b\s*)?/i,'').replace(/\s+section\s*$/i,'').trim(),
   subdivision:s?.subdivision??null,qfield:q?.qfield??null,sheets:s?.sheets??null});
 for(const [key,{q,s}] of slots){
  if(q.length===1&&s.length===1){add(key,q[0],s[0]);matchedCount++;continue;}
  if(q.length>1||s.length>1)warnings.push('Possible duplicate; not paired: '+[...q,...s].map(r=>r.division+' / '+r.name).join('; '));
  let i=0;
  for(const a of q)add(key,a,null,i++);
  for(const a of s)add(key,null,a,i++);
 }
 if(qfieldCount!==matchedCount||sheetsCount!==matchedCount)warnings.push((qfieldCount-matchedCount)+' QField and '+(sheetsCount-matchedCount)+' Sheets sections not paired; source results shown separately.');
 const aggregate=values=>values.length?{progress:values.reduce((n,x)=>n+x.progress,0)/values.length,sectionCount:values.length,
   notStarted:values.filter(s=>s.notStarted).length,completed:values.filter(s=>s.filled).length,over90:values.filter(s=>s.over90).length}:null;
 const results=[...groups.values()].map(g=>({division:g.division,qfield:g.qfield,sheets:aggregate(g.sheetValues)})).sort((a,b)=>a.division.localeCompare(b.division));
 return {sections:rows.sort((a,b)=>a.division.localeCompare(b.division)||a.section.localeCompare(b.section)),divisions:results,
  totals:{qfield:qfield.total?{...counts(qfield.total),sectionCount:qfieldCount,notStarted:rows.filter(r=>r.qfield?.notStarted).length,completed:rows.filter(r=>r.qfield?.complete).length}:null,
          sheets:aggregate([...groups.values()].flatMap(g=>g.sheetValues))},
  meta:{qfieldAt,qfieldVerifiedThrough,sheetsAt,qfieldCount,sheetsCount,matchedCount,warnings,qfieldMode:qfield.mode||null}};
}
export async function loadData({fetcher=fetch,signal,importScoring=url=>import(url)}={}){
 // The source dashboard owns scoring. Revalidate it with its snapshot rather than
 // silently scoring new snapshots with a stale local copy.
 const refresh=Date.now().toString();
 const current=url=>{const u=new URL(url);u.searchParams.set('t',refresh);return u.href;};
 const feeds=Object.entries(SOURCE_URLS).map(async ([key,url])=>{
  const res=await fetcher(current(url),{cache:'no-store',credentials:'omit',signal});
  if(!res.ok)throw Error((key==='qfield'?'QField':'Sheets')+' source unavailable ('+res.status+')');
  return res.json();
 });
 const [qfield,sheets,scoring]=await Promise.all([...feeds,importScoring(current(SHEETS_ENGINE_URL))]);
 return buildData(qfield,sheets,scoring);
}
