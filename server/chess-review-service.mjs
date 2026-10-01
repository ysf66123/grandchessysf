import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {AnalysisEngine} from '../modules/analysis-engine.mjs?v=20261001-speed3a';
import {ReviewReplay,evalKey,rememberIterations,sameReviewBackend} from '../modules/analysis-runtime.mjs?v=20261001-speed3a';
import {computeMoveReview,verifyDecision} from '../modules/analysis-review.mjs?v=20261001-speed3a';
import {REVIEW_VERSION,classify,validPosition} from '../modules/analysis-core.mjs?v=20261001-speed3a';
import {canRevealReport} from '../modules/analysis-progress.mjs?v=20261001-speed3a';
import {tacticalSequence} from '../modules/analysis-tactics.mjs?v=20261001-speed3a';

const require=createRequire(import.meta.url),{Chess}=require('../vendor/chess-0.10.3.js');
const root=path.resolve(import.meta.dirname,'..'),TTL=30*86400000;
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
export function nativePoolProfile({cores=os.availableParallelism(),memory=os.totalmem()}={},saved){
 const budget=Math.min(8,Math.max(1,cores-2)),maxHash=memory>=8*1024**3?512:128;
 const lanes=Math.min(2,Math.max(1,Math.floor(budget/2))),fallback={lanes,threads:Math.min(2,budget),hash:Math.min(128,maxHash/lanes)};
 if(saved?.complete&&saved.version==='native-pool-v1'&&Date.now()-saved.at<TTL&&[1,2,4].includes(saved.lanes)&&[1,2,4,8].includes(saved.threads)&&[32,64,128,256,512].includes(saved.hash)&&saved.lanes*saved.threads<=budget&&saved.lanes*saved.hash<=maxHash)return {lanes:saved.lanes,threads:saved.threads,hash:saved.hash};
 return fallback;
}
export function readGame(pgn){
 if(typeof pgn!=='string'||!pgn.trim()||Buffer.byteLength(pgn)>256000)throw Error('PGN geçersiz veya 256 KB sınırını aşıyor.');
 const game=new Chess();let loaded=false;try{loaded=game.load_pgn(pgn.trim());}catch{}
 if(!loaded)throw Error('PGN hamleleri geçersiz.');
 const headers=game.header(),base=headers.SetUp==='1'?headers.FEN:undefined;
 if(base&&!validPosition(Chess,base))throw Error('Başlangıç konumu geçersiz.');
 const history=game.history({verbose:true});if(!history.length||history.length>400)throw Error('Yerel toplu analiz 1–400 yarım hamleyi destekler.');
 const plan=new ReviewReplay(Chess,history,base);return {history,base,plan,pgn};
}
export function validReviews(reviews,game,complete=false,minCritical=20){
 if(!Array.isArray(reviews)||reviews.length!==game.history.length||!sameReviewBackend(reviews,'native'))return false;
 const valid=reviews.every((r,i)=>!r&&!complete||r&&r.index===i&&r.beforeFen===game.plan.positions[i]&&r.playedFen===game.plan.positions[i+1]&&r.playedUci===game.history[i].from+game.history[i].to+(game.history[i].promotion||'')&&Number.isFinite(r.loss)&&r.loss>=0&&r.loss<=1&&Number.isFinite(r.moveAccuracy)&&r.moveAccuracy>=0&&r.moveAccuracy<=100&&r.bestLine?.uci&&r.playedLine?.uci===r.playedUci&&r.fullRootDepth>=16&&r.comparisonDepth>=16&&(!complete||r.complete&&r.stable!==false&&(!r.critical||r.verified&&r.depth>=minCritical)));
 return valid&&(!complete||canRevealReport(reviews,game.history.length));
}

class ChildWorker {
 constructor(binary){this.child=spawn(binary,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});let fragment='';this.child.stdout.on('data',b=>{fragment+=b;const lines=fragment.split(/\r?\n/);fragment=lines.pop();for(const line of lines)this.onmessage?.({data:line});});this.child.stderr.on('data',()=>{});this.child.on('error',e=>this.onerror?.(e));this.child.on('exit',()=>{if(!this.stopped)this.onerror?.(Error('Yerel Stockfish kapandı.'));});}
 postMessage(s){if(!this.stopped)this.child.stdin.write(s+'\n');}
 terminate(){this.stopped=true;this.child.kill();}
}

export class NativeReviewService {
 constructor({binary,cacheDir=path.join(root,'.cache/chess-review'),profile,engineFactory,onEvent=()=>{},selective=false}={}){
  if(!binary&&!engineFactory)throw Error('Stockfish dosyası gerekli.');
  this.binary=binary;this.cacheDir=cacheDir;this.jobs=new Map();this.running=null;this.onEvent=onEvent;this.profileOverride=profile;
  this.selective=selective;
  this.engineFactory=engineFactory||((p)=>new AnalysisEngine(()=>new ChildWorker(binary),{...p,backend:'native'}));
  this.openings=JSON.parse(fs.readFileSync(path.join(root,'vendor/openings.json'),'utf8'));
  this.identity=REVIEW_VERSION+'|native-pool-v1|'+(selective?'selective-v2-min22':'full-pv3')+'|'+(binary?digest(fs.readFileSync(binary)):'test-engine')+'|'+digest(JSON.stringify(this.openings));
  this.hardware=[os.availableParallelism(),Math.floor(os.totalmem()/1024**3)].join('-');
  this.evaluations=new Map();try{const file=path.join(cacheDir,'evaluations.json');if(fs.statSync(file).size<=32*1024**2){const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.identity===this.identity&&Date.now()-saved.at<TTL)for(const [key,value]of saved.entries||[])if(this.validEvaluation(value))this.rememberEvaluation(key,value);}}catch{}
 }
 validEvaluation(r){return r?.complete&&!r.cancelled&&!r.fallback&&r.source?.includes('Stockfish 18 Full')&&r.depth>=16&&r.depth>=r.requestedDepth&&r.topLines?.length===r.expectedLines&&r.topLines.every(l=>l.depth===r.depth&&l.uci&&(l.mate!=null||Number.isFinite(l.cp)));}
 rememberEvaluation(key,value){if(!this.validEvaluation(value))return;this.evaluations.delete(key);this.evaluations.set(key,value);while(this.evaluations.size>4096)this.evaluations.delete(this.evaluations.keys().next().value);}
 profile(){let saved;try{saved=JSON.parse(fs.readFileSync(path.join(this.cacheDir,'pool-profile.json'),'utf8'));if(saved.hardware!==this.hardware||saved.identity!==this.identity)saved=null;}catch{}return this.profileOverride||nativePoolProfile(undefined,saved);}
 cacheKey(game){return digest(this.identity+'|'+game.plan.commands.join('\n'));}
 load(key,game){try{const file=path.join(this.cacheDir,key+'.json'),stat=fs.statSync(file);if(stat.size>12*1024**2||Date.now()-stat.mtimeMs>TTL)return null;const row=JSON.parse(fs.readFileSync(file,'utf8'));return row.identity===this.identity&&validReviews(row.reviews,game,row.complete,this.selective?22:20)?row:null;}catch{return null;}}
 async persist(job){
  if(!job.reviews?.some(Boolean))return;
  const row={identity:this.identity,complete:job.state==='ready',reviews:job.reviews,evaluations:[...job.evaluations].slice(-1536),savedAt:Date.now()};
  const payload=JSON.stringify(row);if(Buffer.byteLength(payload)>12*1024**2)return;
  try{await fs.promises.mkdir(this.cacheDir,{recursive:true});const destination=path.join(this.cacheDir,job.key+'.json'),temporary=destination+'.'+job.id+'.tmp';await fs.promises.writeFile(temporary,payload);await fs.promises.rename(temporary,destination);
   const evaluations=JSON.stringify({identity:this.identity,at:Date.now(),entries:[...this.evaluations]});if(Buffer.byteLength(evaluations)<=32*1024**2){const file=path.join(this.cacheDir,'evaluations.json'),tmp=file+'.'+job.id+'.tmp';await fs.promises.writeFile(tmp,evaluations);await fs.promises.rename(tmp,file);}
   await this.prune();}catch{job.cacheWarning='Rapor bu oturumda korundu; bilgisayara kaydedilemedi.';}
 }
 async prune(){const rows=[];for(const n of await fs.promises.readdir(this.cacheDir)){if(!/^[a-f0-9]{64}\.json$/.test(n))continue;const f=path.join(this.cacheDir,n);try{rows.push({f,...await fs.promises.stat(f)});}catch{}}rows.sort((a,b)=>b.mtimeMs-a.mtimeMs);let bytes=0;for(let i=0;i<rows.length;i++){bytes+=rows[i].size;if(i>=64||bytes>128*1024**2||Date.now()-rows[i].mtimeMs>TTL)await fs.promises.unlink(rows[i].f).catch(()=>{});}}
 async start(pgn,origin,clientId){
  const game=readGame(pgn),key=this.cacheKey(game);const prior=[...this.jobs.values()].find(j=>j.key===key&&j.origin===origin);
  if(prior?.state==='running'){prior.at=Date.now();return this.snapshot(prior);}
  if(prior?.state==='ready'){prior.at=Date.now();return {...this.snapshot(prior),cacheHit:true,elapsedMs:0,metrics:{requests:0,cacheHits:1,nodes:0,ms:0,searches:[]}};}
  if(this.running)throw Object.assign(Error('Başka bir maç inceleniyor. Önce o analizi duraklat.'),{status:409});
  if(clientId!=null&&(!/^[a-f0-9]{32}$/.test(clientId)||this.jobs.has(clientId)))throw Error('Analiz kimliği geçersiz.');
  const saved=this.load(key,game),job={id:clientId||crypto.randomBytes(24).toString('hex'),origin,key,game,reviews:saved?.reviews||new Array(game.history.length).fill(null),evaluations:new Map(saved?.evaluations||[]),state:saved?.complete?'ready':'running',stage:saved?.complete?'finish':'prepare',done:saved?.complete?1:0,total:saved?.complete?1:game.history.length,at:Date.now(),started:Date.now(),cacheHit:!!saved?.complete,metrics:{requests:0,cacheHits:0,nodes:0,ms:0,searches:[]},engines:[],cancelled:false,profile:this.profile()};
  if(prior)this.jobs.delete(prior.id);
  for(const [id,j]of this.jobs)if(j.state!=='running'&&this.jobs.size>=12)this.jobs.delete(id);
  this.jobs.set(job.id,job);
  if(job.state==='running'){this.running=job;job.promise=this.run(job).catch(error=>{job.error=error.message;job.state=job.cancelled?'paused':'error';}).finally(async()=>{await this.persist(job);job.engines.forEach(e=>e.worker?.terminate());job.engines=[];if(this.running===job)this.running=null;});}
  return this.snapshot(job);
 }
 snapshot(job){return {id:job.id,state:job.state,stage:job.stage,done:job.done,total:job.total,error:job.error,cacheHit:job.cacheHit,cacheWarning:job.cacheWarning,version:REVIEW_VERSION,engineSignature:this.identity,profile:job.profile,elapsedMs:Date.now()-job.started,metrics:{...job.metrics,searches:job.state==='ready'||job.state==='incomplete'?job.metrics.searches:undefined},reviews:job.state==='ready'||job.state==='incomplete'||job.state==='paused'?job.reviews:undefined};}
 get(id,origin){const job=this.jobs.get(id);if(!job||job.origin!==origin)return null;job.at=Date.now();return this.snapshot(job);}
 async cancel(id,origin){const job=this.jobs.get(id);if(!job||job.origin!==origin)return false;job.cancelled=true;job.engines.forEach(e=>e.cancel(()=>true));await job.promise;return true;}
 async close(){await Promise.all([...this.jobs.values()].map(j=>this.cancel(j.id,j.origin)));}
 sweep(){for(const [id,job]of this.jobs){if(Date.now()-job.at>120000&&job.state==='running')this.cancel(id,job.origin);if(Date.now()-job.at>600000&&job.state!=='running')this.jobs.delete(id);}}
 async run(job){
  const {profile,game}=job,lanes=Math.min(profile.lanes,game.history.length),plans=Array.from({length:lanes},()=>new ReviewReplay(Chess,game.history,game.base));
  job.engines=Array.from({length:lanes},()=>this.engineFactory({threads:profile.threads,hash:profile.hash}));
  await Promise.all(job.engines.map(e=>e.init()));if(job.cancelled){job.state='paused';return;}
  const current=()=>!job.cancelled&&!job.failed;
  const put=(store,key,value)=>{job.evaluations.delete(key);job.evaluations.set(key,value);this.rememberEvaluation(key,value);while(job.evaluations.size>1536)job.evaluations.delete(job.evaluations.keys().next().value);};
  const evaluate=async(lane,index,depth,moves,fresh,rootLines=3)=>{
   if(!current())return null;const position=game.plan.commands[index],key=evalKey(REVIEW_VERSION,{backend:'native'},position,depth,moves,rootLines),deep=evalKey(REVIEW_VERSION,{backend:'native'},position,'deepest',moves,rootLines);
   const cached=fresh?null:[job.evaluations.get(key),this.evaluations.get(key),job.evaluations.get(deep),this.evaluations.get(deep)].find(r=>this.validEvaluation(r)&&r.depth>=depth);if(cached){job.metrics.cacheHits++;return cached;}
   const at=performance.now(),r=await job.engines[lane].evaluate(game.plan.positions[index],{mode:'review',position,depth,multiPv:moves?.length||rootLines,searchmoves:moves,legalCount:new Chess(game.plan.positions[index]).moves().length,reviewSession:job.key,onProgress:line=>{job.depth=line.depth;}});
   rememberIterations({put},{version:REVIEW_VERSION,profile:{backend:'native'},position,moves,result:r,rootLines});
   const ms=Math.round(performance.now()-at);job.metrics.requests++;job.metrics.nodes+=r.nodes||0;job.metrics.ms+=ms;job.metrics.searches.push({index,kind:moves?'candidateSearch':'fullSearch',target:depth,depth:r.depth,nodes:r.nodes||0,ms,complete:r.complete});
   if(!current()||r.cancelled)return null;if(r.fallback)throw Error(r.error||'Stockfish hesaplaması tamamlanamadı.');if(r.complete){put('evals',key,r);put('evals',deep,r);}return r;
  };
  const compute=(lane,index,depth,fresh)=>computeMoveReview({Chess,game:plans[lane].at(index),move:game.history[index],index,depth,fresh,selective:this.selective,openings:this.openings,isCurrent:current,evaluate:(d,m,f,c)=>evaluate(lane,index,d,m,f,c)});
  const verify=(lane,i)=>verifyDecision(job.reviews[i],{compute:(d,f)=>compute(lane,i,d,f),minDepth:this.selective?22:20});
  const parallel=async(items,action)=>{let cursor=0;const settled=await Promise.allSettled(job.engines.map(async(_,lane)=>{try{while(current()&&cursor<items.length){const i=items[cursor++];await action(lane,i);if(!current())return;job.done++;this.onEvent(this.snapshot(job));}}catch(error){job.failed=true;job.engines.forEach(e=>e.cancel(()=>true));throw error;}}));const failure=settled.find(r=>r.status==='rejected');if(failure)throw failure.reason;};
  try{
   job.stage='scan';job.done=0;job.total=game.history.length;
   await parallel(game.history.map((_,i)=>i),async(lane,i)=>{if(!job.reviews[i]?.complete)job.reviews[i]=await compute(lane,i,16);if(!current())return;const r=job.reviews[i];if(!r)throw Error('Hamle verisi eksik.');if((r.critical||!r.complete)&&!(r.verified&&r.stable===true))job.reviews[i]=await verify(lane,i);});
   if(!current())return;const critical=job.reviews.map((r,i)=>(r.critical||!r.complete)&&!(r.verified&&r.stable===true)?i:null).filter(i=>i!==null).reverse();job.stage='verify';job.done=0;job.total=critical.length;
   await parallel(critical,async(lane,i)=>{job.reviews[i]=await verify(lane,i);});if(!current())return;
   job.stage='finish';job.done=0;job.total=1;
   job.reviews.forEach((r,i)=>{const previous=job.reviews[i-1],loss=previous?.verified&&previous.complete&&previous.stable!==false?previous.loss:0;r.category=classify({best:r.bestLine,played:r.playedLine,legalCount:r.legalCount,verified:r.verified&&r.stable!==false,sacrifice:r.sacrifice,routineCapture:r.routineCapture,book:!!r.opening,previousOpponentLoss:loss});r.motifTypes=[...new Set(tacticalSequence(Chess,r).filter(s=>s.color!==r.moveColor).flatMap(s=>s.motifs.map(m=>m.type)))];});
   job.state=validReviews(job.reviews,game,true,this.selective?22:20)?'ready':'incomplete';job.done=1;
  }finally{if(job.cancelled)job.state='paused';}
 }
}
