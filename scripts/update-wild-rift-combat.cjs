const fs=require('node:fs/promises'),path=require('node:path'),source=require('../server/wild-rift-source.cjs');
const {withUpdateLock,syncSnapshot}=require('../server/wild-rift-local-sync.cjs');
async function main(){const file=process.env.WR_DATA_FILE||path.join(__dirname,'../data/wild-rift.json');await withUpdateLock(file,async()=>{
 const data=JSON.parse(await fs.readFile(file,'utf8'));let cursor=0,done=0;const failed=[];
 async function worker(){while(cursor<data.champions.length){const c=data.champions[cursor++];try{c.combatFacts=source.parseChampionFacts(await source.fetchText(c.guide),c);}catch{failed.push(c.id);}if(++done%25===0)console.log('Şampiyon nitelikleri '+done+'/'+data.champions.length);await new Promise(r=>setTimeout(r,120));}}
 await Promise.all([worker(),worker()]);data.localRevisionAt=new Date().toISOString();require('../server/wild-rift-store.cjs').validateSnapshot(data);
 await fs.writeFile(file+'.tmp',JSON.stringify(data));await fs.copyFile(file,file+'.previous');await fs.rename(file+'.tmp',file);await syncSnapshot(file);console.log(JSON.stringify({failed}));
});}main().catch(e=>{console.error(e.message);process.exitCode=1;});
