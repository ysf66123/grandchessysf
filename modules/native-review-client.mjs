// Only completed, validated reports are revealed by the caller.
const BASE='http://127.0.0.1:8766',HEADERS={'X-GM-Engine':'1'};
export class NativeReviewClient {
 constructor(){this.probeAt=0;this.capable=false;this.job=null;}
 async available(){if(Date.now()-this.probeAt<45000)return this.capable;this.probeAt=Date.now();try{const r=await fetch(BASE+'/health',{headers:HEADERS,signal:AbortSignal.timeout(1200)});this.capable=r.ok&&(await r.json()).review==='native-pool-v1';}catch{this.capable=false;}return this.capable;}
 async run(pgn,{signal,onProgress=()=>{}}={}){
  if(this.job)throw Error('Yerel analiz zaten çalışıyor.');
  const job=this.job={id:crypto.randomUUID().replaceAll('-',''),controller:new AbortController()};
  const abort=()=>this.cancel();
  if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});
  const request=async(url,options={})=>{const r=await fetch(BASE+url,{...options,headers:{...HEADERS,...options.headers},signal:AbortSignal.any([job.controller.signal,AbortSignal.timeout(8000)])});const body=await r.json();if(!r.ok)throw Error(body.error||'Yerel analiz hizmetine ulaşılamadı.');return body;};
  try{let state=await request('/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pgn,id:job.id})});job.id=state.id;if(job.controller.signal.aborted){abort();throw Error('Analiz duraklatıldı.');}
   while(state.state==='running'){
    onProgress(state);await new Promise((resolve,reject)=>{const timer=setTimeout(done,300);function done(){job.controller.signal.removeEventListener('abort',cancel);resolve();}function cancel(){clearTimeout(timer);reject(Error('Analiz duraklatıldı.'));}job.controller.signal.addEventListener('abort',cancel,{once:true});});
    state=await request('/review?id='+encodeURIComponent(job.id));
   }
   if(!['ready','incomplete'].includes(state.state))throw Error(state.error||'Analiz duraklatıldı.');onProgress(state);return state;
  }catch(error){abort();throw error;}finally{signal?.removeEventListener('abort',abort);if(this.job===job)this.job=null;}
 }
 cancel(){const job=this.job;if(!job)return this.cancelling||Promise.resolve();job.controller.abort();if(job.id&&!job.deletion){job.deletion=fetch(BASE+'/review?id='+encodeURIComponent(job.id),{method:'DELETE',headers:HEADERS,keepalive:true,signal:AbortSignal.timeout(8000)}).catch(()=>{});this.cancelling=job.deletion;}return job.deletion||Promise.resolve();}
}
