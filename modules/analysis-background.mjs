import {ReviewReplay,evalKey,rememberIterations,sameReviewBackend} from './analysis-runtime.mjs?v=20261001-speed3a';
import {REVIEW_VERSION,classify} from './analysis-core.mjs?v=20261001-speed3a';
import {computeMoveReview,verifyDecision} from './analysis-review.mjs?v=20261001-speed3a';
import {loadOpenings} from './analysis-data.mjs?v=20261001-speed3a';
import {canRevealReport} from './analysis-progress.mjs?v=20261001-speed3a';
import {tacticalSequence} from './analysis-tactics.mjs?v=20261001-speed3a';
import {NativeReviewClient} from './native-review-client.mjs?v=20261001-speed3a';
export class BackgroundReview {
 constructor({Chess,engine,cache,isSafe,reportKey,onStatus=()=>{}}){Object.assign(this,{Chess,engine,cache,isSafe,reportKey,onStatus});this.token=0;this.job=null;this.running=null;this.nativeClient=new NativeReviewClient();}
 schedule(pgn){if(!pgn)return;if(this.job?.pgn===pgn){this.wake();return;}this.suspend();this.job={pgn};this.onStatus('Maç analizi uygun zamanda hazırlanacak.');this.wake();}
 wake(){if(this.running||!this.job||!this.isSafe())return;clearTimeout(this.timer);this.timer=setTimeout(()=>{if(this.isSafe()&&!this.running){const job=this.job;this.running=this.prepare(++this.token,job).catch(()=>{if(this.job===job){this.onStatus('Ön hazırlık durdu; analiz açıldığında devam edebilirsin.');this.job=null;}}).finally(()=>{this.running=null;if(this.job&&this.job!==job)this.wake();});}},1800);}
 async suspend(){clearTimeout(this.timer);this.token++;this.engine.cancel(t=>t.background);const cancelled=this.nativeClient.cancel(),running=this.running;if(running)await running;await cancelled;await this.cache.flush();}
 async prepare(token,job){const current=()=>token===this.token&&this.isSafe();if(!current())return;const g=new this.Chess();if(!g.load_pgn(job.pgn))return;const h=g.history({verbose:true}),base=g.header()?.SetUp==='1'?g.header().FEN:undefined;if(!h.length)return;const plan=new ReviewReplay(this.Chess,h,base);
  await this.engine.init();if(!current())return;const key=this.reportKey(job.pgn,base),saved=await this.cache.read('reports',key);
  if(saved?.complete&&canRevealReport(saved.reviews||[],h.length)&&sameReviewBackend(saved.reviews,this.engine.profile.backend)){this.job=null;this.onStatus('Son maçın analizi hazır.');return;}
  if(this.engine.profile.backend==='native'&&await this.nativeClient.available()){
   if(!current())return;
   try{const result=await this.nativeClient.run(job.pgn,{onProgress:s=>{if(!current()){this.nativeClient.cancel();return;}this.onStatus('Maç ön hazırlığı · '+s.done+' / '+s.total);}});if(!current())return;
    const valid=result.version===REVIEW_VERSION&&sameReviewBackend(result.reviews||[],'native')&&result.reviews?.length===h.length&&result.reviews.every((r,i)=>!r||(r.index===i&&r.beforeFen===plan.positions[i]&&r.playedUci===h[i].from+h[i].to+(h[i].promotion||'')));
    if(!valid)throw Error('Yerel ön hazırlık doğrulanamadı.');const complete=result.state==='ready'&&canRevealReport(result.reviews,h.length);
    this.cache.put('reports',key,{complete,reviews:result.reviews});await this.cache.flush();this.job=null;this.onStatus(complete?'Son maçın analizi hazır.':'Ön hazırlık kaydedildi; bazı kararlar ek doğrulama istiyor.');return;
   }catch{if(!current())return;}
  }
  const valid=Array.isArray(saved?.reviews)&&saved.reviews.length===h.length&&sameReviewBackend(saved.reviews,this.engine.profile.backend)&&saved.reviews.every((r,i)=>!r||(r.index===i&&r.beforeFen===plan.positions[i]&&r.playedUci===h[i].from+h[i].to+(h[i].promotion||'')));
  const reviews=valid?saved.reviews:new Array(h.length),openings=await loadOpenings();const checkpoint=async()=>{this.cache.put('reports',key,{complete:false,reviews:Array.from(reviews,r=>r||null)});await this.cache.flush();};
  const evaluate=async(index,depth,moves,fresh)=>{if(!current())return null;const k=evalKey(REVIEW_VERSION,this.engine.profile,plan.commands[index],depth,moves),deep=evalKey(REVIEW_VERSION,this.engine.profile,plan.commands[index],'deepest',moves);const rows=fresh?new Map():await this.cache.readMany('evals',[deep,k]);const cached=[...rows.values()].filter(r=>r?.complete&&r.depth>=depth).sort((a,b)=>a.depth-b.depth)[0];if(cached)return cached;
   const profile={...this.engine.profile},result=await this.engine.evaluate(plan.positions[index],{mode:'review',background:true,priority:4,depth,position:plan.commands[index],searchmoves:moves,multiPv:moves?.length||3,legalCount:new this.Chess(plan.positions[index]).moves().length,reviewSession:key,requestId:'background-'+token});rememberIterations(this.cache,{version:REVIEW_VERSION,profile,position:plan.commands[index],moves,result});if(!current()||result.cancelled||result.fallback)return null;if(result.complete){this.cache.put('evals',k,result);this.cache.put('evals',deep,result);}return result;};
  const previousLoss=i=>reviews[i-1]?.verified&&reviews[i-1].complete&&reviews[i-1].stable!==false?reviews[i-1].loss:0;
  const compute=(i,depth,fresh)=>computeMoveReview({Chess:this.Chess,game:plan.at(i),move:h[i],index:i,depth,fresh,openings,previousOpponentLoss:previousLoss(i),isCurrent:current,evaluate:(d,m,f)=>evaluate(i,d,m,f)});
  try{for(let i=0;i<h.length;i++){if(!current())return;if(!reviews[i]?.complete)reviews[i]=await compute(i,16);if(!reviews[i])return;const r=reviews[i];if((r.critical||!r.complete)&&!(r.verified&&r.stable===true)){const next=await verifyDecision(r,{compute:(d,f)=>compute(i,d,f),resume:valid});if(!next)return;reviews[i]=next;}this.onStatus('Maç ön hazırlığı · '+(i+1)+' / '+h.length);if((i+1)%4===0)await checkpoint();}
   if(!current())return;for(let i=0;i<reviews.length;i++){const r=reviews[i];r.category=classify({best:r.bestLine,played:r.playedLine,legalCount:r.legalCount,verified:r.verified&&r.stable!==false,sacrifice:r.sacrifice,routineCapture:r.routineCapture,book:!!r.opening,previousOpponentLoss:previousLoss(i)});r.motifTypes=[...new Set(tacticalSequence(this.Chess,r).filter(s=>s.color!==r.moveColor).flatMap(s=>s.motifs.map(m=>m.type)))];}
   if(canRevealReport(reviews,h.length)){this.cache.put('reports',key,{complete:true,reviews});await this.cache.flush();this.job=null;this.onStatus('Son maçın analizi hazır.');}else{this.job=null;this.onStatus('Ön hazırlık kaydedildi; bazı kararlar ek doğrulama istiyor.');}
  }finally{if(this.job===job)await checkpoint();}
 }
}
