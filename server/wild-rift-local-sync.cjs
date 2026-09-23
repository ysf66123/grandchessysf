const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),{execFile}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),CONFIG=path.join(ROOT,'.wr-local-sync.json');
const ENDPOINT='https://api.github.com/repos/ysf66123/grandchessysf/contents/data/wild-rift.json';
const hash=text=>createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
async function credential(){
 return new Promise((resolve,reject)=>{
  const child=execFile('git',['credential','fill'],{cwd:ROOT,timeout:20000,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}},(error,stdout)=>{
   const token=stdout?.split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9);
   if(error||!token)reject(Error('GitHub oturumu bulunamadı. Git Credential Manager üzerinden giriş yap.'));else resolve(token);
  });child.stdin.end('protocol=https\nhost=github.com\n\n');
 });
}
async function publishText(text,{request=fetch,getToken=credential}={}){
 const local=JSON.parse(text);require('./wild-rift-store.cjs').validateSnapshot(local);
 const token=await getToken(),headers={Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',Accept:'application/vnd.github.raw+json'};
 for(let attempt=0;attempt<3;attempt++){
  const response=await request(ENDPOINT+'?ref=main',{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`GitHub veri okuma başarısız (${response.status}). Yerel veri korundu.`);
  const remoteText=await response.text(),remote=JSON.parse(remoteText),sha=hash(remoteText);
  if(sha===hash(text))return {state:'unchanged',message:'Veri GitHub ile aynı; tekrar gönderilmedi.'};
  if(require('./wild-rift-source.cjs').comparePatch(remote.latestPatch?.version,local.latestPatch.version)>0||Date.parse(remote.localRevisionAt||remote.checkedAt)>Date.parse(local.localRevisionAt||local.checkedAt))throw Error('GitHub üzerinde daha yeni veri var; üzerine yazılmadı. Önce yeni kaynak kontrolü yap.');
  const result=await request(ENDPOINT,{method:'PUT',redirect:'error',signal:AbortSignal.timeout(45000),headers:{...headers,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({branch:'main',sha,message:`Wild Rift yerel veri kontrolü: ${local.latestPatch.version} · ${local.checkedAt}`,content:Buffer.from(text).toString('base64')})});
  if(result.status===409)continue;
  if(!result.ok)throw Error(`GitHub veri gönderimi başarısız (${result.status}). Yerel veri korundu; yeniden denenecek.`);
  const body=await result.json();return {state:'sent',commit:body.commit?.sha,message:'Veri GitHub’a gönderildi. Pages yayınının tamamlanması ayrıca gerekir.'};
 }
 throw Error('GitHub verisi eşzamanlı değişti; eski veriyle üzerine yazılmadı.');
}
async function config(){try{return JSON.parse(await fs.readFile(CONFIG,'utf8'));}catch{return {};}}
function statusFile(file){return path.join(path.dirname(file),'.wild-rift-sync-status.json');}
async function syncSnapshot(file){
 if((path.resolve(file)!==path.join(ROOT,'data/wild-rift.json')&&process.env.WR_GITHUB_SYNC!=='true')||process.env.WR_GITHUB_SYNC==='false'||!(await config()).enabled)return {state:'disabled'};
 let status;
 try{status={...await publishText(await fs.readFile(file,'utf8')),at:new Date().toISOString()};}
 catch(e){status={state:'pending',at:new Date().toISOString(),message:e.message.startsWith('GitHub')?e.message:'GitHub bağlantısı kurulamadı. Yerel veri korundu; yeniden denenecek.'};}
 await fs.writeFile(statusFile(file),JSON.stringify(status));console.log('[Wild Rift gönderim]',status.message);return status;
}
async function withUpdateLock(file,work){
 const lock=path.join(path.dirname(file),'.wild-rift-update.lock');await fs.mkdir(path.dirname(file),{recursive:true});
 let handle;
 try{handle=await fs.open(lock,'wx');}
 catch(e){
  if(e.code!=='EEXIST')throw e;
  let owner;try{owner=JSON.parse(await fs.readFile(lock,'utf8'));}catch{throw Error('Başka bir veri güncellemesi başlıyor.');}
  try{process.kill(owner.pid,0);throw Error('Başka bir veri güncellemesi zaten çalışıyor.');}catch(err){if(err.code!=='ESRCH')throw err;}
  await fs.unlink(lock);handle=await fs.open(lock,'wx');
 }
 try{await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));return await work();}
 finally{await handle.close();await fs.unlink(lock).catch(()=>{});}
}
module.exports={publishText,syncSnapshot,withUpdateLock,statusFile};
