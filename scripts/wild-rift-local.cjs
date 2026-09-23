const fs=require('node:fs/promises'),path=require('node:path');
const {updateSnapshot}=require('../server/wild-rift-store.cjs');
const {syncSnapshot,statusFile,withUpdateLock}=require('../server/wild-rift-local-sync.cjs');
const file=process.env.WR_DATA_FILE||path.join(__dirname,'../data/wild-rift.json');
const watch=process.argv.includes('--watch');
let running=false;
async function tick(force=false){
 if(running)return;running=true;
 try{
  const data=JSON.parse(await fs.readFile(file,'utf8'));
  if(force||Date.now()-Date.parse(data.checkedAt)>=6*3600000){
   console.log(new Date().toLocaleString('tr-TR'),'Kaynak kontrolü başlıyor.');
   await updateSnapshot({force:true,onProgress:(n,total)=>{if(n%20===0||n===total)console.log(`${n}/${total} rehber kontrol edildi.`);}});
  }else{
   const status=await fs.readFile(statusFile(file),'utf8').then(JSON.parse).catch(()=>null);
   if(!status||status.state==='pending')await withUpdateLock(file,()=>syncSnapshot(file));
  }
 }catch(e){console.error('[Wild Rift]',e.message);if(!watch)process.exitCode=1;}
 finally{running=false;}
}
if(watch){console.log('Bilgisayar açıkken altı saatte bir kaynak kontrolü; bekleyen gönderim için beş dakikada bir yeniden deneme.');tick();setInterval(()=>tick(),5*60000);}else tick(true);
