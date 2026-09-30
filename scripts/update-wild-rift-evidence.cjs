// Reinterpret the last checked public Meta pages, and recheck changed Fire
// parsers. A cached page always retains the original successful check date.
const fs=require('node:fs/promises'),path=require('node:path');
const source=require('../server/wild-rift-source.cjs');
const {withUpdateLock,syncSnapshot}=require('../server/wild-rift-local-sync.cjs');
const file=process.env.WR_DATA_FILE||path.join(__dirname,'../data/wild-rift.json');
withUpdateLock(file,async()=>{
 const data=JSON.parse(await fs.readFile(file,'utf8')),cache=new Map(),root=path.join(__dirname,'../.wr-source-cache');
 for(const name of await fs.readdir(root))if(name.endsWith('.json'))try{const row=JSON.parse(await fs.readFile(path.join(root,name),'utf8'));if(row.url?.startsWith('https://wr-meta.com/')||row.url?.startsWith('https://www.wildriftfire.com/guide/'))cache.set(row.url,row.text);}catch{}
 const provider=data.evidence.providers.find(p=>p.id==='wrmeta'),meta=require('../server/wild-rift-meta-source.cjs');
 for(const c of data.champions){
  const page=provider.pages[c.id],html=cache.get(page?.url);if(page?.status!=='available'||!html)continue;
  c.metaStatistics=meta.parseMetaStatistics(html,c,page.checkedAt,page.url)||c.metaStatistics;
  try{const result=meta.parseMetaBuilds(html,c,data,page.checkedAt,page.url);c.sourceBuilds=[...(c.sourceBuilds||[]).filter(b=>b.sourceId!=='wrmeta'),...result.builds];page.builds=result.builds.length;page.rejectedBuilds=result.rejected;delete page.buildFailure;}catch{page.buildFailure=true;}
 }
 let cursor=0,done=0;const failures=[];
 async function worker(){while(cursor<data.champions.length){const c=data.champions[cursor++];try{const cachedNative=process.argv.includes('--cached-native-only'),html=cachedNative?cache.get(c.guide):await source.fetchText(c.guide);if(!html)throw Error('Önbellekte doğrulanmış rehber yok.');const facts=source.parseChampionFacts(html,c);if(cachedNative){if(facts.patch!==c.combatFacts?.patch)throw Error('Önbellek yaması uyuşmuyor.');facts.checkedAt=c.combatFacts.checkedAt;}c.combatFacts=facts;}catch{failures.push(c.id);}if(++done%30===0)console.log('Yetenek paneli',done+'/'+data.champions.length);await new Promise(r=>setTimeout(r,160));}}
 if(!process.argv.includes('--cached-meta-only'))await Promise.all([worker(),worker()]);
 console.log('Eşya pasifleri kontrol ediliyor');
 if(!process.argv.includes('--native-only')&&!process.argv.includes('--cached-meta-only')&&!process.argv.includes('--cached-native-only'))data.itemCatalog=await require('../server/wild-rift-items.cjs').enrichItems(data.items,{previous:structuredClone(data.items)});
 await require('../server/wild-rift-model-update.cjs').refreshModelEvidence(data,source.fetchText);
 data.itemRegistry=require('../server/wild-rift-registry.cjs').buildRegistry(data);
 data.methodologyVersion=6;data.localRevisionAt=new Date().toISOString();
 provider.buildFailures=Object.entries(provider.pages).filter(([,p])=>p.buildFailure||p.status==='failed').map(([id])=>id);
 require('../server/wild-rift-audit.cjs').auditSnapshot(data);
 require('../server/wild-rift-store.cjs').validateSnapshot(data);
 await fs.writeFile(file+'.tmp',JSON.stringify(data));await fs.rename(file+'.tmp',file);
 console.log(JSON.stringify({audit:data.qualityAudit,nativeFailures:failures},null,2));
 await syncSnapshot(file);
}).catch(e=>{console.error(e.message);process.exitCode=1;});
