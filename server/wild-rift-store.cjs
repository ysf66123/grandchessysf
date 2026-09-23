const fs=require('node:fs/promises');
const path=require('node:path');
const source=require('./wild-rift-source.cjs');
const DATA_FILE=process.env.WR_DATA_FILE || path.join(__dirname,'../data/wild-rift.json');
let inFlight=null, current=null;
async function readSnapshot() {
  if (!current) current=JSON.parse(await fs.readFile(DATA_FILE,'utf8'));
  return current;
}
function validateSnapshot(data) {
  if (data.schema!==1 || data.champions?.length<80 || !data.latestPatch?.version || !data.stats?.brackets?.diamond) throw new Error('Veri paketi eksik.');
  if (new Set(data.champions.map(c=>c.id)).size!==data.champions.length) throw new Error('Tekrarlanan şampiyon.');
  for (const c of data.champions) for (const b of c.builds||[]) {
    if (!c.roles.includes(b.role) || b.final.length!==6 || new Set(b.final).size!==b.final.length || b.final.some(id=>!data.items[id])) throw new Error(`${c.name}: dizilim doğrulaması başarısız.`);
  }
  return true;
}
async function updateSnapshot({force=false,onProgress=()=>{}}={}) {
  if (inFlight) return inFlight;
  inFlight=(async()=>{
    const old=await readSnapshot().catch(()=>null);
    if (!force && old && Date.now()-Date.parse(old.checkedAt)<15*60*1000) return old;
    const [statsHtml,catalogHtml,patchHtml]=await Promise.all([source.fetchText(source.BASE+'/stats'),source.fetchText(source.BASE+'/tier-list'),source.fetchText(source.PATCH_URL)]);
    const stats=source.parseStats(statsHtml), champions=source.parseCatalog(catalogHtml), latestPatch=source.parsePatch(patchHtml);
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
        await new Promise(resolve=>setTimeout(resolve,160));
      }
    }
    await Promise.all([worker(),worker()]);
    if (failures.length>champions.length*.15) throw new Error('Kaynakta çok fazla eksik rehber var; önceki veri korundu.');
    const changed=champions.filter(c=>c.contentHash!==old?.champions.find(x=>x.id===c.id)?.contentHash).map(c=>c.id);
    const data={schema:1,checkedAt,latestPatch,stats,champions,items,changes:changed,failures,source:source.BASE,methodologyVersion:1};
    validateSnapshot(data);
    await fs.mkdir(path.dirname(DATA_FILE),{recursive:true});
    const temp=DATA_FILE+'.tmp';await fs.writeFile(temp,JSON.stringify(data));
    if(old) await fs.copyFile(DATA_FILE,DATA_FILE+'.previous').catch(()=>{});
    await fs.rename(temp,DATA_FILE);current=data;
    return data;
  })().finally(()=>{inFlight=null;});
  return inFlight;
}
module.exports={readSnapshot,updateSnapshot,validateSnapshot};
