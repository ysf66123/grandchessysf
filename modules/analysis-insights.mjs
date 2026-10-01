import {gameAccuracy} from './analysis-core.mjs?v=20261001-speed3a';

const values={p:100,n:320,b:330,r:500,q:900,k:0};
export const PHASE_LABELS={opening:'Açılış',middle:'Oyun ortası',end:'Oyun sonu'};
export function gamePhase(fen, opening=false) {
    const board=String(fen||'').split(' ')[0], pieces=board.match(/[nbrq]/gi)||[];
    const total=pieces.reduce((n,p)=>n+values[p.toLowerCase()],0);
    // Material determines endgames; book membership alone does not keep a
    // low-material position in the opening. This is a transparent heuristic.
    if(total<=2600)return 'end';
    const fullmove=Number(String(fen).split(' ')[5])||1;
    return fullmove<=10 && (opening || fullmove<=6)?'opening':'middle';
}
export function reviewInsights(reviews,totalMoves=reviews.length) {
    const valid=reviews.filter(r=>r && Number.isFinite(r.loss));
    const confirmed=valid.filter(r=>r.complete && r.stable!==false);
    const summary=color=>{
        const own=valid.filter(r=>r.moveColor===color);
        const measured=own.filter(r=>Number.isFinite(r.cpl));
        const decisions=own.filter(r=>r.legalCount>1 && r.category!=='book');
        return {moves:own.length,accuracy:gameAccuracy(own,valid),
            averageCpLoss:measured.length?Math.round(measured.reduce((n,r)=>n+r.cpl,0)/measured.length):null,
            cpSamples:measured.length,decisionAccuracy:gameAccuracy(decisions,valid),decisions:decisions.length,
            sound:own.filter(r=>r.loss<.05).length,errors:own.filter(r=>r.loss>=.05).length,
            phases:Object.keys(PHASE_LABELS).map(phase=>{
                const group=own.filter(r=>gamePhase(r.beforeFen,!!r.opening)===phase);
                return {phase,moves:group.length,accuracy:gameAccuracy(group,valid)};
            })};
    };
    const moments=valid.filter(r=>r.loss>=.05 || ['brilliant','great','miss'].includes(r.category))
        .sort((a,b)=>b.loss-a.loss||a.index-b.index).slice(0,8);
    return {total:totalMoves,reviewed:valid.length,confirmed:confirmed.length,
        deep:valid.filter(r=>r.verified && r.stable!==false).length,
        pending:Math.max(0,totalMoves-valid.length),provisional:valid.length-confirmed.length,
        minDepth:valid.length?Math.min(...valid.map(r=>r.depth||0)):0,
        maxDepth:valid.length?Math.max(...valid.map(r=>r.depth||0)):0,
        white:summary('w'),black:summary('b'),moments};
}
export function tacticalEvidence(Chess,review) {
    if(!review?.beforeFen || !review?.playedPv?.length)return [];
    const game=new Chess(review.beforeFen),color=game.turn();
    const result=[];
    for(let i=0;i<Math.min(8,review.playedPv.length);i++) {
        const u=review.playedPv[i];
        const move=game.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]});
        if(!move)break;
        if(i===0 && move.flags.includes('k') || i===0 && move.flags.includes('q')) result.push({type:'castle',text:'Rok ile şah güvenliği',ply:i});
        if(move.promotion)result.push({type:'promotion',text:move.san+' · terfi',ply:i});
        if(move.san.includes('#'))result.push({type:'mate',text:move.san+' · mat',ply:i});
        else if(i>0 && move.color!==color && move.san.includes('+'))result.push({type:'check',text:move.san+' · rakibin şah tehdidi',ply:i});
        if(i>0 && move.color!==color && move.captured && review.loss>=.02)result.push({type:'capture',text:move.san+' · motor devamında taş alımı',ply:i});
    }
    if(review.legalCount===1)result.unshift({type:'forced',text:'Bu konumda yalnızca bir yasal hamle var',ply:0});
    return result.slice(0,3);
}
