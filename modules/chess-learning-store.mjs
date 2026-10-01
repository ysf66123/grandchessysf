const key=()=> 'gm_review_learning_v1_'+(globalThis.window?.currentUser?.uid||'guest');
let timer,pulling=null,pulledUid=null,status='Bu cihazda saklanıyor',lastCloud='',lastSyncAt=0;
const byteLength=value=>new TextEncoder().encode(JSON.stringify(value)).length;
export const learningStatus=()=>status;
export function sanitizeRecords(value){return (Array.isArray(value)?value:[])
 .filter(r=>r&&typeof r.id==='string'&&typeof r.pgn==='string'&&r.pgn.length<150000&&['w','b'].includes(r.side)&&Number.isFinite(r.accuracy)&&Array.isArray(r.training))
 .map(r=>({...r,players:Array.isArray(r.players)?r.players:[],training:r.training.filter(t=>t&&Number.isInteger(t.index)&&t.index>=0&&t.index<600&&/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(t.bestMove)&&Number.isFinite(t.due)&&Number.isFinite(t.loss)).slice(0,8)})).slice(-50);}
export function mergeRecords(a,b){const map=new Map();for(const r of [...sanitizeRecords(a),...sanitizeRecords(b)]){
 const previous=map.get(r.id);if(!previous){map.set(r.id,r);continue;}
 const training=new Map();for(const t of [...previous.training,...r.training]){const old=training.get(t.index);if(!old||(t.lastAttempt||0)>=(old.lastAttempt||0))training.set(t.index,t);}
 map.set(r.id,{...previous,...r,at:Math.min(previous.at||r.at,r.at||previous.at),training:[...training.values()]});
 }return [...map.values()].sort((a,b)=>a.at-b.at).slice(-50);}
export function readLearning(){try{return sanitizeRecords(JSON.parse(localStorage.getItem(key())||'[]'));}catch{return [];}}
export function writeLearning(records,{sync=true}={}){try{
 const value=JSON.stringify(sanitizeRecords(records));if(localStorage.getItem(key())!==value){localStorage.setItem(key(),value);if(sync)scheduleSync();}return true;
 }catch{return false;}}
function notify(){window.dispatchEvent(new CustomEvent('gm-learning-updated',{detail:status}));}
async function api(){return import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');}
export async function syncLearning(){
 const uid=window.currentUser?.uid;if(!uid||!window.db)return false;
 const storageKey=key();status='Hesabınla eşitleniyor';notify();
 try{
 const {doc,getDoc,runTransaction}=await api(),ref=doc(window.db,'profiles',uid);
 {const snap=await getDoc(ref);if(window.currentUser?.uid!==uid)return false;
  const data=snap.data()?.chessLearning;
  if(data?.deletedAt && data.deletedAt>Number(localStorage.getItem(storageKey+'_deleted')||0)){localStorage.removeItem(storageKey);localStorage.setItem(storageKey+'_deleted',String(data.deletedAt));}
  const cutoff=Number(localStorage.getItem(storageKey+'_deleted')||0);
  writeLearning(mergeRecords(readLearning(),sanitizeRecords(data?.records||[]).filter(r=>r.at>cutoff)),{sync:false});pulledUid=uid;
 }
 const records=readLearning();let cloud=records.slice(-35);while(byteLength(cloud)>480000)cloud.shift();
 const signature=uid+JSON.stringify(cloud);if(signature!==lastCloud){
  await runTransaction(window.db,async tx=>{const snap=await tx.get(ref),remote=snap.data()?.chessLearning;
   if(window.currentUser?.uid!==uid)throw Error('Oturum değişti');
   const deletedAt=Math.max(Number(localStorage.getItem(storageKey+'_deleted')||0),remote?.deletedAt||0);
   let merged=mergeRecords(sanitizeRecords(remote?.records||[]),cloud).filter(r=>r.at>deletedAt).slice(-35);
   while(byteLength(merged)>480000)merged.shift();
   tx.set(ref,{chessLearning:{version:2,records:merged,deletedAt,updatedAt:Date.now()}},{merge:true});
  });lastCloud=signature;
 }
 lastSyncAt=Date.now();status='Hesabınla eşitlendi · son 35 maç';notify();return true;
 }catch{status='Bulut eşitlemesi kullanılamıyor · kayıtlar bu cihazda güvende';notify();return false;}
}
export function scheduleSync(){if(!window.currentUser?.uid)return;clearTimeout(timer);timer=setTimeout(()=>{if(!pulling)pulling=syncLearning().finally(()=>pulling=null);},8000);}
export async function ensureLearningSync(){if(window.currentUser?.uid&&pulledUid!==window.currentUser.uid&&!pulling)pulling=syncLearning().finally(()=>pulling=null);return pulling;}
export function clearLearning(){localStorage.removeItem(key());localStorage.setItem(key()+'_deleted',String(Date.now()));lastCloud='';scheduleSync();}
globalThis.window?.addEventListener('focus',()=>{if(window.currentUser?.uid&&Date.now()-lastSyncAt>10000){pulledUid=null;ensureLearningSync();}});
