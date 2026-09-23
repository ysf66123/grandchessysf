const fs=require('node:fs/promises'),path=require('node:path');
const {collectEvidence}=require('../server/wild-rift-providers.cjs');
const {validateSnapshot}=require('../server/wild-rift-store.cjs');
(async()=>{
 const file=process.env.WR_DATA_FILE||path.join(__dirname,'../data/wild-rift.json'),data=JSON.parse(await fs.readFile(file,'utf8'));
 await collectEvidence(data,{previous:data.evidence,onProgress:(n,total)=>{if(n%20===0||n===total)console.log(`${n}/${total} çoklu kaynak kontrolü`);}});
 validateSnapshot(data);await fs.writeFile(file+'.tmp',JSON.stringify(data));await fs.copyFile(file,file+'.previous');await fs.rename(file+'.tmp',file);
 console.log(JSON.stringify(data.evidence.providers.map(p=>({source:p.id,status:p.status,items:p.items,rows:p.rows,relations:p.relationships,failures:p.failures?.length,message:p.message})),null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
