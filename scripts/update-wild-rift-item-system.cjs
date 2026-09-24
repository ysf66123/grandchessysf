const fs=require('node:fs/promises'),path=require('node:path');
const {withUpdateLock,syncSnapshot}=require('../server/wild-rift-local-sync.cjs');
const {enrichItems}=require('../server/wild-rift-items.cjs');
const {collectBuildSources}=require('../server/wild-rift-build-sources.cjs');
const {buildRegistry}=require('../server/wild-rift-registry.cjs');
const {validateSnapshot}=require('../server/wild-rift-store.cjs');
const {fetchText}=require('../server/wild-rift-source.cjs');
const {parseOfficialItems,applyOfficial}=require('../server/wild-rift-official.cjs');
async function main(){const file=process.env.WR_DATA_FILE||path.join(__dirname,'../data/wild-rift.json');
 await withUpdateLock(file,async()=>{const data=JSON.parse(await fs.readFile(file,'utf8')),previous=structuredClone(data);
  if(!process.argv.includes('--builds-only')){
  data.itemCatalog=await enrichItems(data.items,{previous:previous.items,onProgress:(n,total)=>{if(n%20===0)console.log('Eşyalar '+n+'/'+total);}});
  const officialUrl='https://wildrift.leagueoflegends.com/en-us/news/game-updates/wild-rift-patch-notes-'+data.latestPatch.version.replace('.','-')+'/';
  applyOfficial(data,parseOfficialItems(await fetchText(officialUrl),data.items,data.latestPatch.version,officialUrl));
  }
  await collectBuildSources(data,{previous,onProgress:(n,total)=>{if(n%20===0)console.log('Dizilimler '+n+'/'+total);}});
  data.itemRegistry=buildRegistry(data);data.methodologyVersion=4;data.localRevisionAt=new Date().toISOString();validateSnapshot(data);
  await fs.writeFile(file+'.tmp',JSON.stringify(data));await fs.copyFile(file,file+'.previous');await fs.rename(file+'.tmp',file);await syncSnapshot(file);
  console.log(JSON.stringify({registry:Object.keys(data.itemRegistry.items).length,builds:data.buildSources}));
 });}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
