import {uciOf,terminalResult,rootScore,whiteScore,qualityScore,moveMetrics,comparisonEvidence,specialMoveEvidence,sacrificeEvidence,classify,reviewIsStable} from './analysis-core.mjs?v=20261001-speed3';
import {tablebase,tableExpected,normalizedOpeningKey} from './analysis-data.mjs?v=20261001-speed3';
export async function verifyDecision(previous,{compute,resume=false,onProgress=()=>{},minDepth=20}){
 const target=Math.min(28,Math.max(minDepth,previous.depth>=20?previous.depth+2:20));onProgress(target);
 let review=await compute(target,target<=previous.depth);if(!review)return null;
 const shifted=!reviewIsStable(previous,review),borderline=[.02,.05,.1,.2].some(t=>Math.abs(review.loss-t)<.005);
 if(shifted||borderline){const confirmation=Math.min(28,Math.max(target,review.depth)+2);if(confirmation>review.depth){onProgress(confirmation);const next=await compute(confirmation);if(!next)return null;next.stable=reviewIsStable(review,next);review=next;}else review.stable=review.complete&&previous.depth>=28&&reviewIsStable(previous,review);}else review.stable=true;
 while(review.complete&&review.stable===false&&review.depth<28){const depth=Math.min(28,Math.max(target,review.depth)+2);onProgress(depth);const next=await compute(depth);if(!next)return null;next.stable=reviewIsStable(review,next);review=next;}return review;
}
function tryApplyUciMove(game,u){try{return !!game.move({from:u.slice(0,2),to:u.slice(2,4),...(u.length>4?{promotion:u[4]}:{})});}catch{return false;}}
function formatEngineMove(Chess,u,fen){const g=new Chess(fen);return tryApplyUciMove(g,u)?g.history().at(-1):u;}
export async function computeMoveReview({Chess,game,move,index,depth,evaluate,openings,previousOpponentLoss=0,isCurrent=()=>true,fresh=false,selective=false}) {
    const beforeFen=game.fen(),legalCount=game.moves().length,playedUci=uciOf(move);
    const tbPromise=tablebase(game);
    let seed=null,useSingle=false;
    if(selective&&depth>=20){seed=await evaluate(16,undefined,false,3);if(!seed)return null;const best=seed.topLines?.[0],played=seed.topLines?.find(l=>l.uci===playedUci),m=moveMetrics(best,played);useSingle=seed.complete&&(!played||m&&m.loss>=.025&&Number.isFinite(best.cp)&&Number.isFinite(played.cp)&&best.cp-played.cp>60);}
    let result=await evaluate(depth,undefined,fresh,useSingle?1:3);
    if (!result) return null;
    const tb=await tbPromise;
    let globalResult=result;
    if(!result.topLines?.length)throw Error('Bu konumda yeterli motor verisi alınamadı. Analizi yeniden başlatabilirsin.');
    if (useSingle||!result.topLines.some(l=>l.uci === playedUci) || (tb?.moves?.[0] && !result.topLines.some(l=>l.uci===tb.moves[0].uci))) {
        const candidates=[...new Set(result.topLines.map(l=>l.uci).concat(useSingle?seed.topLines.map(l=>l.uci):[],playedUci,tb?.moves?.[0]?.uci || []).filter(Boolean))];
        result=await evaluate(depth,candidates,fresh);
        if (!result) return null;
    }
    if(useSingle){const ranked=[...result.topLines].sort((a,b)=>rootScore(b)-rootScore(a)),played=ranked.find(l=>l.uci===playedUci),metrics=moveMetrics(ranked[0],played),near=played?.uci===ranked[0]?.uci||metrics&&metrics.cpl!=null&&metrics.cpl<=15&&metrics.loss<.01;
        // Unrestricted three-line evidence is mandatory whenever a special
        // label could apply. Never infer uniqueness from restricted candidates.
        if(near){globalResult=await evaluate(depth,undefined,fresh,3);if(!globalResult)return null;result=globalResult;if(!result.topLines.some(l=>l.uci===playedUci)||(tb?.moves?.[0]&&!result.topLines.some(l=>l.uci===tb.moves[0].uci))){result=await evaluate(depth,[...new Set(globalResult.topLines.map(l=>l.uci).concat(playedUci,tb?.moves?.[0]?.uci||[]).filter(Boolean))],fresh);if(!result)return null;}}
    }
    const evidence=comparisonEvidence(globalResult,result);
    const lines=result.topLines.map(line=>{
        if(!tryApplyUciMove(game,line.uci))return line;
        const terminal=terminalResult(game);game.undo();
        return terminal?{...line,cp:terminal.mate===0?null:0,mate:terminal.mate===0?1:null,
            wdl:terminal.mate===0?[1000,0,0]:[0,1000,0],terminal:true}:line;
    }).sort((a,b)=>rootScore(b)-rootScore(a));
    let best={...lines[0]}, played={...lines.find(l=>l.uci === playedUci)};
    if (!played.uci) throw Error('Oynanan hamle için karşılaştırılabilir veri eksik.');
    if (!game.move({from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{})})) throw Error('Geçersiz maç hamlesi.');
    const terminal=terminalResult(game);
    if (terminal) played={...played,cp:terminal.mate === 0 ? null : 0,mate:terminal.mate === 0 ? 1 : null,wdl:terminal.mate === 0 ? [1000,0,0] : [0,1000,0]};
    if (best.uci === played.uci) best={...played};
    if (!isCurrent()) return null;
    // Tablebase is supplemental evidence, never mixed into Stockfish move metrics.
    const tbMove=tb?.moves?.find(m=>m.uci===playedUci);
    const tbUsed=!!tbMove && tableExpected(tbMove.category)!=null;
    const metrics=moveMetrics(best,played);
    if(!metrics)throw Error('Stockfish puanı eksik; hamle sınıflandırılmadı.');
    const {loss,cpl,moveAccuracy}=metrics;
    Object.assign(best,specialMoveEvidence(globalResult,best,legalCount));
    const globalAlternative=globalResult.topLines.find(l=>l.uci!==globalResult.topLines[0].uci);
    const potentialUnique=!!globalAlternative && qualityScore(globalResult.topLines[0])-qualityScore(globalAlternative)>=.12;
    const verified=evidence.verified;
    const sacrifice=verified && sacrificeEvidence(Chess,beforeFen,played);
    const opening=openings?.[normalizedOpeningKey(game)] || null;
    const pieceValue={p:100,n:320,b:330,r:500,q:900,k:20000};
    const routineCapture=!!move.captured && pieceValue[move.captured]>=pieceValue[move.piece];
    const category=classify({best,played,legalCount,verified,sacrifice,routineCapture,book:!!opening,
        previousOpponentLoss});
    const bestGame=new Chess(beforeFen);tryApplyUciMove(bestGame,best.uci);
    return {index,moveNumber:Number(beforeFen.split(' ')[5]),moveSan:move.san,moveColor:move.color,
        loss,cpl,category,
        moveAccuracy,bestMove:best.uci,bestMoveSan:formatEngineMove(Chess,best.uci,beforeFen),
        beforeFen,playedFen:game.fen(),bestFen:bestGame.fen(),playedUci,
        cpBefore:whiteScore(best,beforeFen),cpAfter:whiteScore(played,beforeFen),
        mateBefore:best.mate,mateAfter:played.mate,bestPv:best.pv,playedPv:played.pv,
        lines,depth:evidence.depth,comparisonDepth:evidence.comparedDepth,fullRootDepth:evidence.fullDepth,
        nodes:(result.nodes||0)+(result===globalResult?0:globalResult.nodes||0),source:result.source,verified,
        complete:evidence.complete,tablebase:tbUsed,opening,
        expectedBest:metrics.expectedBest,expectedPlayed:metrics.expectedPlayed,
        bestLine:best,playedLine:played,legalCount,sacrifice,routineCapture,requestedDepth:depth,
        engineWdlBest:best.wdl,engineWdlPlayed:played.wdl,tablebaseCategory:tbMove?.category || null,
        critical:potentialUnique || loss>=0.035 || best.mate!=null || played.mate!=null || best.unique ||
            sacrificeEvidence(Chess,beforeFen,played) || [0.02,0.05,0.1,0.2].some(t=>Math.abs(loss-t)<0.008)};
}
