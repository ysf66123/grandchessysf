const fs=require('node:fs/promises'),path=require('node:path');
const {withUpdateLock,syncSnapshot}=require('../server/wild-rift-local-sync.cjs');
const {collectCounterSources,reparseCachedMeta}=require('../server/wild-rift-counter-sources.cjs');
const {validateSnapshot}=require('../server/wild-rift-store.cjs');
(async()=>{
 const file=process.env.WR_DATA_FILE||path.join(__dirname,'../data/wild-rift.json');
 await withUpdateLock(file,async()=>{
  const data=JSON.parse(await fs.readFile(file,'utf8'));
  const reparsed=await reparseCachedMeta(data);console.log(`${reparsed} önbellek rehberi özgün kontrol tarihiyle yeniden işlendi.`);
  await collectCounterSources(data,{onProgress:(n,total)=>{if(n%12===0)console.log(`${n}/${total} karşı seçim kaynağı kontrol edildi.`);}});
  data.localRevisionAt=new Date().toISOString();validateSnapshot(data);
  await fs.writeFile(file+'.tmp',JSON.stringify(data));await fs.copyFile(file,file+'.previous');await fs.rename(file+'.tmp',file);
  if(!process.argv.includes('--no-sync'))await syncSnapshot(file);
  console.log(JSON.stringify({count:data.counterSources.count,fetched:data.counterSources.fetched,retryAfter:data.counterSources.retryAfter}));
 });
})().catch(e=>{console.error(e.message);process.exitCode=1;});
