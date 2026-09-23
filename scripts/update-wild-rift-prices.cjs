const fs=require('node:fs/promises'),path=require('node:path');
const {enrichItems}=require('../server/wild-rift-items.cjs');
const {validateSnapshot}=require('../server/wild-rift-store.cjs');
async function main(){
  const file=process.env.WR_DATA_FILE||path.join(__dirname,'../data/wild-rift.json');
  const data=JSON.parse(await fs.readFile(file,'utf8'));
  data.itemCatalog=await enrichItems(data.items,{previous:structuredClone(data.items),onProgress:(n,total)=>{if(n%20===0||n===total)console.log(`${n}/${total} eşya fiyatı`);}});
  for(const item of Object.values(data.items))if(item.official?.patch===data.latestPatch.version&&item.official.cost)Object.assign(item,{cost:item.official.cost,costPatch:item.official.patch,costCheckedAt:item.official.checkedAt,costSource:item.official.url});
  validateSnapshot(data);
  await fs.writeFile(file+'.tmp',JSON.stringify(data));await fs.copyFile(file,file+'.previous');await fs.rename(file+'.tmp',file);
  console.log(JSON.stringify(data.itemCatalog));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
