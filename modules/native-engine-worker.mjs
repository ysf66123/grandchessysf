// Worker-compatible transport. The optional helper only listens on loopback.
export class NativeEngineWorker {
 constructor(base='http://127.0.0.1:8766'){
  this.base=base;this.stopped=false;this.pending=[];this.chain=Promise.resolve();this.controller=new AbortController();
  this.start();
 }
 async start(){try{
  const r=await fetch(this.base+'/session',{method:'POST',headers:{'X-GM-Engine':'1','Content-Type':'application/json'},body:'{}',signal:this.controller.signal});if(!r.ok)throw Error('Yerel motor yanıt vermedi');
  const {id}=await r.json();this.id=id;if(this.stopped)return this.terminate();
  this.events=new EventSource(this.base+'/events?id='+encodeURIComponent(id));
  this.events.onmessage=e=>{if(!this.stopped)this.onmessage?.({data:JSON.parse(e.data)});};
  this.events.onopen=()=>{this.connected=true;for(const command of this.pending)this.postMessage(command);this.pending=[];};
  this.events.onerror=()=>{if(!this.stopped)this.onerror?.(new Error('Yerel motor bağlantısı kesildi'));};
 }catch(error){if(!this.stopped)this.onerror?.(error);}}
 postMessage(command){if(this.stopped)return;if(!this.connected){this.pending.push(command);return;}
  this.chain=this.chain.then(async()=>{if(this.stopped)return;const r=await fetch(this.base+'/command',{method:'POST',headers:{'X-GM-Engine':'1','Content-Type':'application/json'},body:JSON.stringify({id:this.id,command}),signal:this.controller.signal});if(!r.ok)throw Error('Yerel motor komutu reddedildi');}).catch(e=>{if(!this.stopped)this.onerror?.(e);});
 }
 terminate(){this.stopped=true;this.events?.close();this.controller.abort();if(this.id)fetch(this.base+'/session?id='+encodeURIComponent(this.id),{method:'DELETE',headers:{'X-GM-Engine':'1'},keepalive:true}).catch(()=>{});}
}
export function selectedBackend(){try{return localStorage.getItem('gm_chess_backend')==='native'?'native':'browser';}catch{return 'browser';}}
