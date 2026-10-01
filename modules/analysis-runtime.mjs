// Complete engine evidence only; history is deliberately part of every key.
export const ENGINE_SIGNATURES={browser:'sf18-lite-nnue-18.0.5-a8fbc05e',native:'sf18-full-official-18-avx2'};
export function engineSignature(profile){return ENGINE_SIGNATURES[profile.backend||'browser'];}
export function sameReviewBackend(reviews,backend){return reviews.every(r=>!r||typeof r.source==='string'&&r.source.includes(backend==='native'?'Stockfish 18 Full':'Stockfish 18 Lite'));}
export function evalKey(version,profile,position,depth,moves){return [version,engineSignature(profile),'full-strength','pv'+(moves?.length||3),depth,position,'moves:'+(moves||[]).slice().sort().join(',')].join('|');}
export function rememberIterations(cache,{version,profile,position,moves,result}){const {iterations,...evidence}=result;for(const frame of iterations||[]){if(frame.depth>result.depth||frame.topLines.length!==result.expectedLines||frame.topLines.some(l=>l.depth!==frame.depth||l.mate==null&&!Number.isFinite(l.cp)))continue;const first=frame.topLines[0];cache.put('evals',evalKey(version,profile,position,frame.depth,moves),{...evidence,...first,topLines:frame.topLines,depth:frame.depth,requestedDepth:frame.depth,bestMove:first.uci,complete:true,cancelled:false,fallback:false});}}
export class ReviewMetrics {
 constructor(){this.reset();}
 reset(stats={}){this.started=performance.now();this.base={...stats};this.stages={};this.searches=[];this.cache={hits:0,misses:0};this.finished=null;}
 add(stage,ms){this.stages[stage]=(this.stages[stage]||0)+ms;}
 search(index,kind,result,ms){this.searches.push({index,kind,ms:Math.round(ms),target:result.requestedDepth,depth:result.depth,nodes:result.nodes||0,complete:result.complete});if(this.searches.length>1200)this.searches.shift();this.add(kind,ms);}
 finish(){this.finished=performance.now();}
 snapshot(stats={}){return {elapsedMs:Math.round((this.finished||performance.now())-this.started),stages:Object.fromEntries(Object.entries(this.stages).map(([k,v])=>[k,Math.round(v)])),cache:{...this.cache},engine:Object.fromEntries(Object.keys(stats).map(k=>[k,Math.max(0,(stats[k]||0)-(this.base[k]||0))])),searches:this.searches};}
}
export class ReviewCache {
 constructor({indexedDB=globalThis.indexedDB,ttl=45*86400000,limit=2048}={}){this.idb=indexedDB;this.ttl=ttl;this.limit=limit;this.memory=new Map();this.pending=new Map();this.dbPromise=null;this.writer=Promise.resolve();}
 async db(){if(!this.idb)return null;if(!this.dbPromise)this.dbPromise=new Promise(resolve=>{const req=this.idb.open('grandmaster_analysis_cache_v1',1);req.onupgradeneeded=()=>{for(const name of ['evals','reports'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=req.onblocked=()=>resolve(null);});return this.dbPromise;}
 remember(store,key,payload){const id=store+'|'+key;this.memory.delete(id);this.memory.set(id,{payload,at:Date.now()});while(this.memory.size>this.limit)this.memory.delete(this.memory.keys().next().value);}
 async readMany(store,keys){const values=new Map(),missing=[];for(const key of new Set(keys)){const value=this.memory.get(store+'|'+key);if(value&&Date.now()-value.at<=this.ttl)values.set(key,value.payload);else missing.push(key);}if(!missing.length)return values;
  try{const db=await this.db();if(!db)return values;await new Promise(resolve=>{const tx=db.transaction(store,'readonly');for(const key of missing){const req=tx.objectStore(store).get(key);req.onsuccess=()=>{const row=req.result;if(row&&Date.now()-row.createdAtMs<=this.ttl){values.set(key,row.payload);this.remember(store,key,row.payload);}};}tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();});}catch{}return values;}
 async read(store,key){return (await this.readMany(store,[key])).get(key)||null;}
 put(store,key,payload){if(!payload)return;this.remember(store,key,payload);this.pending.set(store+'|'+key,{store,key,payload,createdAtMs:Date.now()});clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;this.flush();},40);}
 async flush(){clearTimeout(this.timer);this.timer=null;const rows=[...this.pending.values()];this.pending.clear();if(!rows.length)return this.writer;this.writer=this.writer.then(async()=>{try{const db=await this.db();if(!db)return;await new Promise(resolve=>{const tx=db.transaction([...new Set(rows.map(r=>r.store))],'readwrite');for(const {store,...row}of rows)tx.objectStore(store).put(row);tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();});}catch{/* Quota failure cannot change engine evidence. */}});return this.writer;}
}
// Only the calculation pipeline borrows this cursor; board/variation callers get
// independent Chess instances. undo() preserves repetition and draw history.
export class ReviewReplay {
 constructor(Chess,history,baseFen){this.Chess=Chess;this.history=history;this.base=baseFen||new Chess().fen();this.game=new Chess(this.base);this.positions=[this.base];this.commands=['position fen '+this.base];this.moves=history.map(m=>({from:m.from,to:m.to,...(m.promotion?{promotion:m.promotion}:{})}));let prefix='';const g=new Chess(this.base);for(const m of this.moves){if(!g.move(m))throw Error('Hamle geçmişi geçersiz.');prefix+=(prefix?' ':'')+m.from+m.to+(m.promotion||'');this.positions.push(g.fen());this.commands.push('position fen '+this.base+' moves '+prefix);}}
 at(index){let n=this.index||0;const fen=this.game.fen();if(fen!==this.positions[n]){if(fen===this.positions[n+1])n++;else throw Error('Hesaplama konumu maç geçmişiyle uyuşmuyor.');}while(n>index){this.game.undo();n--;}while(n<index){if(!this.game.move(this.moves[n]))throw Error('Hamle geçmişi geçersiz.');n++;}this.index=n;return this.game;}
}
