const fs=require('node:fs/promises');
const path=require('node:path');
const source=require('./wild-rift-source.cjs');
const {enrichItems}=require('./wild-rift-items.cjs');
const {collectEvidence}=require('./wild-rift-providers.cjs');
const DATA_FILE=process.env.WR_DATA_FILE || path.join(__dirname,'../data/wild-rift.json');
let inFlight=null, current=null;
const STATUS_FILE=path.join(path.dirname(DATA_FILE),'.wild-rift-status.json');
let status=null;
async function getUpdateStatus(){
  if(!status){
    try{status=JSON.parse(await fs.readFile(STATUS_FILE,'utf8'));if(status.running){status.running=false;status.error='Önceki kontrol sunucu kapanırken yarım kaldı. Son sağlam paket korunuyor.';}}
    catch{status={running:false,finishedAt:0,error:null,events:[]};}
  }
  return {...status,events:[...(status.events||[])]};
}
async function saveStatus(){
  await fs.mkdir(path.dirname(STATUS_FILE),{recursive:true});
  await fs.writeFile(STATUS_FILE+'.tmp',JSON.stringify(status));await fs.rename(STATUS_FILE+'.tmp',STATUS_FILE);
}
async function readSnapshot() {
  if (!current){const candidate=JSON.parse(await fs.readFile(DATA_FILE,'utf8'));validateSnapshot(candidate);current=candidate;}
  return current;
}
function validateSnapshot(data) {
  if (data.schema!==1 || data.champions?.length<80 || !data.latestPatch?.version || !data.stats?.brackets?.diamond) throw new Error('Veri paketi eksik.');
  if (new Set(data.champions.map(c=>c.id)).size!==data.champions.length) throw new Error('Tekrarlanan şampiyon.');
  const validDate=value=>Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now()+300000;
  if(!validDate(data.checkedAt)||!validDate(data.stats.asOf))throw new Error('Veri tarihleri doğrulanamadı.');
  const roles=new Set(['baron','jungle','mid','duo','support']);
  for(const rows of Object.values(data.stats.brackets)){
    if(!Array.isArray(rows)||rows.length<50)throw new Error('İstatistik kapsamı eksik.');
    const unique=new Set();for(const row of rows){
      const key=row.id+':'+row.role;
      if(unique.has(key)||!roles.has(row.role)||![row.win,row.pick,row.ban].every(n=>Number.isFinite(n)&&n>=0&&n<=100))throw new Error('İstatistik satırları doğrulanamadı.');
      unique.add(key);
    }
  }
  for (const c of data.champions){
    if(!/^[a-z0-9-]+$/.test(c.id)||!Array.isArray(c.roles)||!c.roles.length||c.roles.some(r=>!roles.has(r)))throw new Error('Şampiyon rolleri doğrulanamadı.');
    if(!c.refreshFailed&&c.roles.some(role=>!c.builds?.some(b=>b.role===role)))throw new Error(`${c.name}: rol rehberi eksik.`);
    if(new Set(c.builds?.map(b=>b.role+':'+b.guideId)).size!==c.builds?.length)throw new Error(`${c.name}: aynı rehber tekrarlanıyor.`);
    for (const b of c.builds||[]) {
    if (!c.roles.includes(b.role) || b.final.length!==6 || new Set(b.final).size!==b.final.length || b.final.some(id=>!data.items[id])) throw new Error(`${c.name}: dizilim doğrulaması başarısız.`);
    for(const key of ['starting','core','boots','counters','synergies','situational','runes','spells','skillOrder'])if(!Array.isArray(b[key]))throw new Error(`${c.name}: rehber alanları eksik.`);
    if([...b.starting,...b.core,...b.boots,...b.situational.flatMap(s=>s.items||[])].some(id=>!data.items[id]))throw new Error(`${c.name}: bilinmeyen eşya.`);
    }
  }
  return true;
}
async function updateSnapshot({force=false,onProgress=()=>{}}={}) {
  if (inFlight) return inFlight;
  inFlight=(async()=>{
    await getUpdateStatus();
    const old=await readSnapshot().catch(()=>null);
    if (!force && old && Date.now()-Date.parse(old.checkedAt)<15*60*1000) return old;
    status={...status,running:true,startedAt:Date.now(),error:null,phase:'Kaynaklar kontrol ediliyor',completed:0,total:0};
    try{
    await saveStatus();
    const [statsHtml,catalogHtml,patchHtml]=await Promise.all([source.fetchText(source.BASE+'/stats'),source.fetchText(source.BASE+'/tier-list'),source.fetchText(source.PATCH_URL)]);
    const stats=source.parseStats(statsHtml), champions=source.parseCatalog(catalogHtml), latestPatch=source.parsePatch(patchHtml);
    if(old&&champions.length<old.champions.length*.9)throw new Error('Şampiyon kapsamı beklenmedik biçimde azaldı; önceki veri korundu.');
    if(old&&source.comparePatch(latestPatch.version,old.latestPatch.version)<0)throw new Error('Resmî kaynak daha eski yama döndürdü; önceki veri korundu.');
    const patchPage=await source.fetchText(latestPatch.url);
    // Hash only article content. Advertising, nonces and navigation are not patch changes.
    const $=require('cheerio').load(patchPage); $('script,style,nav,footer').remove();
    latestPatch.contentHash=source.hash(($('article').text()||$('main').text()).replace(/\s+/g,' ').trim());
    const checkedAt=new Date().toISOString(), items={}, failures=[];
    let cursor=0,complete=0;
    async function worker(){
      while(cursor<champions.length){
        const c=champions[cursor++];
        try {
          const result=source.parseGuide(await source.fetchText(c.guide),c);
          c.builds=result.builds.filter(b=>b.role && c.roles.includes(b.role)); c.tags=result.tags;c.fetchedAt=result.fetchedAt;c.contentHash=result.contentHash;
          Object.assign(items,result.items);
        } catch(e) {
          failures.push({id:c.id,message:e.message});
          const previous=old?.champions.find(x=>x.id===c.id);
          if(previous){Object.assign(c,{builds:previous.builds,tags:previous.tags,fetchedAt:previous.fetchedAt,contentHash:previous.contentHash});Object.assign(items,old.items);}
          else c.builds=[];
          c.refreshFailed=true;
        }
        onProgress(++complete,champions.length,c.id);
        Object.assign(status,{phase:'Şampiyon rehberleri',completed:complete,total:champions.length});
        await new Promise(resolve=>setTimeout(resolve,160));
      }
    }
    await Promise.all([worker(),worker()]);
    if (failures.length>champions.length*.15) throw new Error('Kaynakta çok fazla eksik rehber var; önceki veri korundu.');
    const changed=champions.filter(c=>c.contentHash!==old?.champions.find(x=>x.id===c.id)?.contentHash).map(c=>c.id);
    let itemCatalog;
    try{itemCatalog=await enrichItems(items,{previous:old?.items,onProgress:(n,total)=>Object.assign(status,{phase:'Eşya fiyatları',completed:n,total})});}
    catch{itemCatalog={...(old?.itemCatalog||{}),refreshFailed:true};for(const [id,item] of Object.entries(items))if(old?.items[id]?.cost)for(const key of ['cost','costSource','costPatch','costCheckedAt','stats'])item[key]=old.items[id][key];}
    const data={schema:1,checkedAt,latestPatch,stats,champions,items,itemCatalog,changes:changed,failures,source:source.BASE,methodologyVersion:2};
    for(const [id,item] of Object.entries(items))if(old?.items[id]?.official)item.official=old.items[id].official;
    await collectEvidence(data,{previous:old?.evidence,onProgress:(n,total)=>Object.assign(status,{phase:'Ek kaynak kontrolü',completed:n,total})});
    data.methodologyVersion=3;
    validateSnapshot(data);
    await fs.mkdir(path.dirname(DATA_FILE),{recursive:true});
    const temp=DATA_FILE+'.tmp';await fs.writeFile(temp,JSON.stringify(data));
    if(old) await fs.copyFile(DATA_FILE,DATA_FILE+'.previous').catch(()=>{});
    await fs.rename(temp,DATA_FILE);current=data;
    const done=Date.now();status={...status,running:false,finishedAt:done,lastSuccessAt:done,phase:'Tamamlandı',error:null,events:[{at:done,ok:true,patch:latestPatch.version,failedGuides:failures.length},...(status.events||[])].slice(0,10)};
    await saveStatus().catch(e=>console.error('[Wild Rift durum kaydı]',e.message));
    return data;
    }catch(error){
      const done=Date.now();status={...status,running:false,finishedAt:done,phase:'Kontrol başarısız',error:'Kaynak güncellenemedi; son doğrulanmış veri korundu.',events:[{at:done,ok:false},...(status.events||[])].slice(0,10)};
      await saveStatus().catch(e=>console.error('[Wild Rift durum kaydı]',e.message));throw error;
    }
  })().finally(()=>{inFlight=null;});
  return inFlight;
}
module.exports={readSnapshot,updateSnapshot,validateSnapshot,getUpdateStatus};
