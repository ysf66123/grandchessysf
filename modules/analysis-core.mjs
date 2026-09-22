// Pure review rules. Scores are from the root side to move; UI scores are White POV.
export const REVIEW_VERSION = 'sf18-review-20260923-4-cp';
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const uciOf = m => m.from + m.to + (m.promotion || '');
export function parseInfo(text) {
    const depth = text.match(/\bdepth (\d+)/);
    const score = text.match(/\bscore (cp|mate) (-?\d+)/);
    const pv = text.match(/\bpv (.+)$/);
    if (!depth || !score || !pv || /\b(lowerbound|upperbound)\b/.test(text)) return null;
    const wdl = text.match(/\bwdl (\d+) (\d+) (\d+)/);
    const number = key => Number(text.match(new RegExp('\\b' + key + ' (\\d+)'))?.[1] || 0);
    const moves = pv[1].trim().split(/\s+/).filter(m => /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(m));
    if (!moves.length) return null;
    return { depth: Number(depth[1]), rank: number('multipv') || 1,
        cp: score[1] === 'cp' ? Number(score[2]) : null,
        mate: score[1] === 'mate' ? Number(score[2]) : null,
        wdl: wdl ? wdl.slice(1).map(Number) : null,
        nodes: number('nodes'), time: number('time'), pv: moves, uci: moves[0] };
}
export function rootScore(line) {
    if (!line) return null;
    if (line.mate != null) return line.mate > 0 ? 10000 - Math.min(999, line.mate) : -10000 + Math.min(999, Math.abs(line.mate));
    return Number.isFinite(line.cp) ? line.cp : null;
}
export function whiteScore(line, fen) {
    const score = rootScore(line);
    return score == null ? null : score * (fen.split(' ')[1] === 'w' ? 1 : -1);
}
export function expectedScore(line) {
    if (Number.isFinite(line?.exactExpected)) return line.exactExpected;
    if (line?.mate != null) return line.mate > 0 ? 1 : 0;
    if (line?.wdl?.length === 3 && line.wdl.reduce((a,b) => a+b, 0) > 0) {
        return (line.wdl[0] + line.wdl[1] / 2) / line.wdl.reduce((a,b) => a+b, 0);
    }
    // Explicit fallback model, not a human win probability or CAPS2.
    return 1 / (1 + Math.exp(-clamp(line?.cp || 0, -4000, 4000) / 240));
}
export function accuracyFromLoss(loss) {
    if (!Number.isFinite(loss)) return null;
    if (loss <= 0) return 100;
    // Public Lichess accuracy equation, applied to a same-root comparison.
    // https://lichess.org/page/accuracy (not Stockfish WDL or CAPS2)
    return clamp(103.1668 * Math.exp(-0.04354 * loss * 100) - 3.1669, 0, 100);
}
export function qualityScore(line) {
    if (line?.mate != null) return line.mate > 0 ? 1 : 0;
    if (!Number.isFinite(line?.cp)) return null;
    return 1 / (1 + Math.exp(-0.00368208 * clamp(line.cp, -1000, 1000)));
}
export function moveMetrics(best, played) {
    const before=qualityScore(best), after=qualityScore(played);
    if (before == null || after == null) return null;
    const sameMove=!!best.uci && best.uci===played.uci;
    const loss=sameMove ? 0 : Math.max(0,before-after);
    return {loss,expectedBest:before,expectedPlayed:after,moveAccuracy:accuracyFromLoss(loss),
        cpl:Number.isFinite(best.cp)&&Number.isFinite(played.cp)?Math.max(0,best.cp-played.cp):null};
}
export function classify({ best, played, legalCount, verified, sacrifice, book, routineCapture=false, previousOpponentLoss = 0 }) {
    const metrics=moveMetrics(best,played);
    if (!metrics) return 'unrated';
    const {loss,expectedBest:before,expectedPlayed:after,cpl}=metrics;
    const isBest=!!best.uci && best.uci===played.uci;
    // A forced move is not a special achievement, even when it prolongs mate.
    if (legalCount===1) return 'best';
    const nearBest=isBest || (cpl!=null && cpl<=15 && loss<0.01);
    // A database can name a trap's final position; a forcing mate is not Book.
    if (book && best.mate==null && played.mate==null && loss < 0.02 && cpl!=null && cpl<=30) return 'book';
    if (verified && sacrifice && nearBest && after>=0.5 &&
        (before<0.9 || (Number.isFinite(best.alternativeExpected)&&best.alternativeExpected<0.8))) return 'brilliant';
    if (verified && isBest && best.unique && after>=0.4 && !routineCapture && played.mate!==1) return 'great';
    if (isBest) return 'best';
    // A new mate is not automatically a blunder if the position was already lost.
    if (verified && loss>=0.1 && before>=0.7 && after>=0.35 && after<0.6 &&
        (best.mate>0 || previousOpponentLoss>=0.1)) return 'miss';
    if (loss>=0.2) return 'blunder';
    // Equal WDL (or equal saturated scores) must not label a different move Best.
    if (loss < 0.02) return 'excellent';
    if (loss < 0.05) return 'good';
    if (loss < 0.1) return 'inaccuracy';
    return 'mistake';
}
export function gameAccuracy(reviews, gameReviews=reviews) {
    const valid=reviews.filter(r=>r && Number.isFinite(r.loss));
    if (!valid.length) return null;
    const all=gameReviews.filter(r=>r && Number.isFinite(r.loss));
    const whiteChance=(r,after)=>{
        const chance=after?r.expectedPlayed:r.expectedBest;
        if(Number.isFinite(chance))return r.moveColor==='b'?1-chance:chance;
        return qualityScore({cp:after?r.cpAfter:r.cpBefore});
    };
    const points=all.length ? [whiteChance(all[0],false),...all.map(r=>whiteChance(r,true))].map(x=>x==null?50:x*100) : [];
    const size=clamp(Math.floor(gameReviews.length/10),2,8);
    let weighted=0,totalWeight=0,reciprocals=0,hasZero=false;
    for(const r of valid) {
        const pos=all.findIndex(x=>x===r || (Number.isInteger(r.index)&&x.index===r.index));
        const window=pos<0?[]:points.slice(Math.max(0,pos+2-size),pos+2);
        const mean=window.reduce((s,n)=>s+n,0)/(window.length||1);
        const sd=Math.sqrt(window.reduce((s,n)=>s+(n-mean)**2,0)/(window.length||1));
        const weight=clamp(sd,0.5,12),accuracy=accuracyFromLoss(r.loss);
        weighted+=accuracy*weight;totalWeight+=weight;
        if(accuracy===0)hasZero=true;else reciprocals+=1/accuracy;
    }
    const harmonic=hasZero?0:valid.length/reciprocals;
    return Math.round(clamp((weighted/totalWeight+harmonic)/2,0,100)*10)/10;
}
export function pvMoves(Chess, fen, pv) {
    const game = new Chess();
    if (!game.load(fen)) return [];
    const result = [];
    for (const uci of pv || []) {
        const number = Number(game.fen().split(' ')[5]);
        const turn = game.turn();
        const move = game.move({from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4]});
        if (!move) break;
        result.push({ uci, san: move.san, fen: game.fen(), number, turn, captured: move.captured });
    }
    return result;
}
const values = {p:100,n:320,b:330,r:500,q:900,k:0};
export function material(Chess, fen, color) {
    const game = new Chess(fen);
    return game.board().flat().reduce((n,p) => n + (p ? values[p.type] * (p.color === color ? 1 : -1) : 0), 0);
}
export function sacrificeEvidence(Chess, fen, line) {
    // Conservative: the moved non-pawn is actually captured in the engine PV,
    // and the material deficit survives our immediate recapture.
    const game = new Chess(fen), color = game.turn();
    const initial = material(Chess, fen, color);
    let offered = null, captured = false;
    for (let i = 0; i < Math.min(6, line?.pv?.length || 0); i++) {
        const u = line.pv[i];
        const m = game.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]});
        if (!m) return false;
        if (i === 0) offered = m.piece !== 'p' && m.piece !== 'k' ? m.to : null;
        else if (m.color !== color && m.to === offered && m.captured) captured = true;
        if (captured && m.color === color && initial - material(Chess, game.fen(), color) >= 180) return true;
    }
    return false;
}
export function openingKey(fen) {
    // Normalize irrelevant en-passant targets with the caller's legal move test.
    return fen.split(' ').slice(0,4).join(' ');
}
export function terminalResult(game) {
    if (game.in_checkmate()) return {cp:null,mate:0,wdl:[0,0,1000],terminal:true};
    if (game.in_draw()) return {cp:0,mate:null,wdl:[0,1000,0],terminal:true};
    return null;
}
export function validPosition(Chess, fen) {
    const game=new Chess();
    if(!game.load(fen))return false;
    const board=game.board();
    if(board.flat().filter(p=>p?.type==='k'&&p.color==='w').length!==1 || board.flat().filter(p=>p?.type==='k'&&p.color==='b').length!==1)return false;
    if([...board[0],...board[7]].some(p=>p?.type==='p'))return false;
    const kings=[];
    board.forEach((row,r)=>row.forEach((p,c)=>{if(p?.type==='k')kings.push([r,c]);}));
    return Math.max(Math.abs(kings[0][0]-kings[1][0]),Math.abs(kings[0][1]-kings[1][1]))>1;
}
