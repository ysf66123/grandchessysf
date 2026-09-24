const {syncSnapshot,withUpdateLock}=require('../server/wild-rift-local-sync.cjs');
const fs=require('node:fs/promises'),path=require('node:path');
const {enrichItems}=require('../server/wild-rift-items.cjs');
const {validateSnapshot}=require('../server/wild-rift-store.cjs');
async function main(){
  const file=process.env.WR_DATA_FILE||path.join(__dirname,'../data/wild-rift.json');
  return withUpdateLock(file,async()=>{const data=JSON.parse(await fs.readFile(file,'utf8'));
  data.itemCatalog=await enrichItems(data.items,{previous:structuredClone(data.items),onProgress:(n,total)=>{if(n%20===0||n===total)console.log(`${n}/${total} eşya fiyatı`);}});
  if(data.evidence){
    const updated=Object.values(data.items).filter(i=>i.costSource?.includes('wildriftfire.com')&&i.costCheckedAt===data.itemCatalog.checkedAt);
    const ids=new Set(updated.map(i=>i.id));
    data.evidence.items=(data.evidence.items||[]).filter(r=>r.source!=='wildriftfire'||!ids.has(r.id));
    data.evidence.items.push(...updated.map(i=>({id:i.id,name:i.name,cost:i.cost,source:'wildriftfire',patch:i.costPatch,checkedAt:i.costCheckedAt,url:i.costSource})));
  }
  for(const item of Object.values(data.items))if(item.official?.patch===data.latestPatch.version&&item.official.cost)Object.assign(item,{cost:item.official.cost,costPatch:item.official.patch,costCheckedAt:item.official.checkedAt,costSource:item.official.url});
  data.itemRegistry=require('../server/wild-rift-registry.cjs').buildRegistry(data);
  data.localRevisionAt=new Date().toISOString();validateSnapshot(data);
  await fs.writeFile(file+'.tmp',JSON.stringify(data));await fs.copyFile(file,file+'.previous');await fs.rename(file+'.tmp',file);await syncSnapshot(file);
  console.log(JSON.stringify(data.itemCatalog));
  });
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
