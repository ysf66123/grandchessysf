import {gameAccuracy,qualityScore} from './analysis-core.mjs?v=20261001-speed3a';
import {gamePhase} from './analysis-insights.mjs?v=20261001-speed3a';
export const LEARNING_VERSION=1;
const themes={fork:'Çatal',pin:'Açmaz',skewer:'Şiş',defender:'Savunucunun kaldırılması',mate:'Mat',capture:'Taş kaybı',promotion:'Terfi',check:'Şah güvenliği'};
export function errorChains(reviews){
 const chains=[];
 for(const color of ['w','b']){
  let group=[];
  const flush=()=>{if(group.length>1)chains.push({color,indices:group.map(r=>r.index),loss:group.reduce((n,r)=>n+r.loss,0)});group=[];};
  for(const r of reviews.filter(r=>r?.moveColor===color)){
   if(r.loss<.05){flush();continue;}
   const previous=group.at(-1);
   if(previous&&(r.index-previous.index>2 || r.expectedBest>previous.expectedPlayed+.05))flush();
   group.push(r);
  }flush();
 }return chains.sort((a,b)=>b.loss-a.loss);
}
export function personalLessons(reviews,color='w'){
 const own=reviews.filter(r=>r?.moveColor===color&&r.complete&&r.stable!==false);
 if(!own.length)return [];
 const worst=[...own].sort((a,b)=>b.loss-a.loss)[0];
 const strong=own.filter(r=>r.verified&&!r.opening&&r.legalCount>1&&r.loss<.02)
  .sort((a,b)=>Number(['brilliant','great'].includes(b.category))-Number(['brilliant','great'].includes(a.category))||b.depth-a.depth)[0];
 const best=strong||[...own].sort((a,b)=>a.loss-b.loss)[0];
 const counts={};for(const r of own.filter(r=>r.loss>=.05))for(const motif of new Set(r.motifTypes||[]))counts[motif]=(counts[motif]||0)+1;
 const theme=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
 return [{title:worst.loss>=.05?'Öncelikli tekrar':'En zor kararını tekrar et',index:worst.index,text:`${worst.moveNumber}. ${worst.moveSan} · hamle doğruluğu %${worst.moveAccuracy.toFixed(1)}`},
  {title:strong?'Güçlü kararın':'Görece en iyi kararın',index:best.index,text:`${best.moveNumber}. ${best.moveSan} · ${strong?'derin doğrulanmış güçlü seçim':'bu maçtaki hamlelerin arasında en düşük değerlendirme kaybı'}`},
  {title:'Çalışma konusu',index:theme?own.find(r=>r.loss>=.05&&r.motifTypes?.includes(theme[0])).index:worst.index,
   text:theme?`${themes[theme[0]]||'Kritik kararlar'} · ${theme[1]} konumda motor devamında görüldü`:'Kritik konumlarda aday hamleleri karşılaştır'}].filter(Boolean);
}
function clockSeconds(text){
 const parts=text.trim().split(':').map(Number);if(parts.length<2||parts.length>3||parts.some(n=>!Number.isFinite(n)||n<0))return null;
 return parts.reduce((n,p)=>n*60+p,0);
}
export function clockInsights(pgn,reviews,provided=[]){
 // Main line only. Variations must not shift clock indices. Missing data stays missing.
 const tokens=String(pgn||'').replace(/^\s*\[[^\n]*\]\s*$/gm,'').match(/\{[^}]*\}|;[^\n]*|\(|\)|[^\s(){}]+/g)||[];
 let level=0,index=-1;const clocks=[];
 for(const token of tokens){
  if(token==='('){level++;continue;}if(token===')'){level=Math.max(0,level-1);continue;}if(level||token[0]===';')continue;
  if(token[0]==='{'){
   if(index<0)continue;const clk=token.match(/\[%clk\s+([^\]]+)\]/),emt=token.match(/\[%emt\s+([^\]]+)\]/);
   if(clk)clocks[index]={...clocks[index],remaining:clockSeconds(clk[1])};
   if(emt)clocks[index]={...clocks[index],elapsed:clockSeconds(emt[1])};continue;
  }
  const san=token.replace(/^\d+\.(?:\.\.)?/,'').replace(/[!?]+$/,'');
  if(!san||/^\$\d+$|^(1-0|0-1|1\/2-1\/2|\*)$/.test(san))continue;
  if(/^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/.test(san))index++;
 }
 const tc=String(pgn||'').match(/\[TimeControl\s+"(\d+)(?:\+(\d+))?"\]/),initial=tc?Number(tc[1]):null,increment=tc?Number(tc[2]||0):0;
 const previous={w:initial,b:initial},recordedByIndex=new Map(provided.map((r,i)=>[r?.index??i,r]));
 const entries=reviews.map((r,i)=>{
  const recorded=recordedByIndex.get(i),c=recorded&&recorded.color===r.moveColor&&recorded.uci===r.playedUci?
   {remaining:Number.isFinite(recorded.remainingMs)?recorded.remainingMs/1000:null,elapsed:Number.isFinite(recorded.elapsedMs)?recorded.elapsedMs/1000:null}:clocks[i]||{};
  const elapsed=Number.isFinite(c.elapsed)?c.elapsed:Number.isFinite(previous[r.moveColor])&&Number.isFinite(c.remaining)?previous[r.moveColor]+increment-c.remaining:null;
  previous[r.moveColor]=Number.isFinite(c.remaining)?c.remaining:null;
  return {index:i,color:r.moveColor,remaining:Number.isFinite(c.remaining)&&c.remaining>=0?c.remaining:null,
   elapsed:Number.isFinite(elapsed)&&elapsed>=0?elapsed:null,error:r.loss>=.05};
 });
 const measured=entries.filter(r=>r.remaining!=null||r.elapsed!=null),pressure=measured.filter(r=>r.remaining!=null&&r.remaining<=30);
 return {entries:measured,samples:measured.length,pressureMoves:pressure.length,pressureErrors:pressure.filter(r=>r.error).length,
  averageElapsed:measured.filter(r=>r.elapsed!=null).length?measured.filter(r=>r.elapsed!=null).reduce((n,r)=>n+r.elapsed,0)/measured.filter(r=>r.elapsed!=null).length:null};
}
export function openingInsights(reviews){
 const last=reviews.findLastIndex(r=>!!r?.opening);let known=false;
 const firstOutside=reviews.find(r=>{if(r.opening){known=true;return false;}return known;});
 const error=reviews.find(r=>r.loss>=.05);
 return {name:last>=0?reviews[last].opening.name:null,eco:last>=0?reviews[last].opening.eco:null,
  departure:firstOutside?.index??null,firstError:error?.index??null,knownPlies:reviews.filter(r=>r.opening).length};
}
export function selectTraining(reviews,color='w'){
 return reviews.filter(r=>r?.moveColor===color&&r.complete&&r.stable!==false&&r.loss>=.05&&r.legalCount>1)
  .sort((a,b)=>b.loss-a.loss).slice(0,8).map(r=>({index:r.index,fen:r.beforeFen,bestMove:r.bestMove,
   bestPv:r.bestPv?.slice(0,8)||[],theme:(r.motifTypes||[])[0]||'decision',loss:r.loss}));
}
export function trainingResult(item,success,now=Date.now()){
 const streak=success?(item.streak||0)+1:0;
 const days=success?[1,3,7,14,30][Math.min(streak-1,4)]:0;
 return {...item,streak,attempts:(item.attempts||0)+1,lastAttempt:now,due:now+(success?days*86400000:600000)};
}
export function acceptTrainingMove(best,played,complete){
 if(!complete||qualityScore(best)==null||qualityScore(played)==null)return null;
 return qualityScore(best)-qualityScore(played)<.02;
}
export function historySummary(records){
 const recent=records.slice(-20),prior=records.slice(-40,-20),mean=a=>a.length?Math.round(a.reduce((n,r)=>n+r.accuracy,0)/a.length*10)/10:null;
 const motifs={},openings={};
 for(const r of recent){for(const [key,n] of Object.entries(r.themes||{}))motifs[key]=(motifs[key]||0)+n;if(r.opening){const o=openings[r.opening]||={games:0,errors:0};o.games++;o.errors+=r.openingErrors||0;}}
 return {games:recent.length,accuracy:mean(recent),previousAccuracy:mean(prior),themes:Object.entries(motifs).sort((a,b)=>b[1]-a[1]).map(([key,count])=>({name:themes[key]||'Kritik karar',count})),
  openings:Object.entries(openings).sort((a,b)=>b[1].games-a[1].games).slice(0,4).map(([name,data])=>({name,...data})),
  phases:['opening','middle','end'].map(phase=>{const groups=recent.flatMap(r=>(r.phases||[]).filter(p=>p.phase===phase&&p.accuracy!=null));return {phase,accuracy:groups.length?mean(groups):null,games:groups.length};})};
}
export function learningRecord(id,pgn,players,reviews,side,phases,now=Date.now()){
 const own=reviews.filter(r=>r.moveColor===side),themes={};
 for(const r of own.filter(r=>r.loss>=.05))for(const type of new Set(r.motifTypes||[]))themes[type]=(themes[type]||0)+1;
 return {id,pgn,players,side,at:now,accuracy:gameAccuracy(own,reviews),errors:own.filter(r=>r.loss>=.05).length,
  openingErrors:own.filter(r=>r.loss>=.05&&gamePhase(r.beforeFen,!!r.opening)==='opening').length,
  opening:openingInsights(reviews).name,themes,phases,
  timeControl:String(pgn||'').match(/\[TimeControl\s+"([^"]+)"\]/)?.[1]||'unknown',
  openingMoves:reviews.filter(r=>r.index<24&&r.moveColor===side).map(r=>({index:r.index,fen:r.beforeFen,uci:r.playedUci,san:r.moveSan,loss:r.loss,accuracy:r.moveAccuracy,best:r.bestMove})),
  training:selectTraining(reviews,side).map(r=>({...r,due:now,streak:0,attempts:0}))};
}
