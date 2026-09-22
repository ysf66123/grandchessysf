// Pure review rules. Scores are from the root side to move; UI scores are White POV.
export const REVIEW_VERSION = 'sf18-review-20260923-1';
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
    return Math.round(clamp(100 * Math.exp(-4 * Math.max(0, loss)), 0, 100) * 10) / 10;
}
export function classify({ best, played, legalCount, verified, sacrifice, book, previousOpponentLoss = 0 }) {
    const loss = Math.max(0, expectedScore(best) - expectedScore(played));
    if (best.mate > 0 && !(played.mate > 0) && expectedScore(played) < 0.8) return 'miss';
    if (played.mate != null && played.mate <= 0 && !(best.mate != null && best.mate <= 0)) return 'blunder';
    if (book && loss < 0.02) return 'book';
    if (verified && sacrifice && loss < 0.01 && expectedScore(played) >= 0.5 &&
        (expectedScore(best) < 0.98 || best.alternativeExpected < 0.8)) return 'brilliant';
    if (verified && legalCount > 1 && best.unique && loss < 0.01) return 'great';
    if (loss >= 0.1 && previousOpponentLoss >= 0.1 && expectedScore(best) >= 0.7 && expectedScore(played) < 0.6) return 'miss';
    if (loss < 0.0005) return 'best';
    if (loss < 0.02) return 'excellent';
    if (loss < 0.05) return 'good';
    if (loss < 0.1) return 'inaccuracy';
    if (loss < 0.2) return 'mistake';
    return 'blunder';
}
export function gameAccuracy(reviews) {
    const valid = reviews.filter(r => r && Number.isFinite(r.loss));
    if (!valid.length) return null;
    // Each played move contributes equally; labels never change the score.
    return Math.round(valid.reduce((sum,r) => sum + accuracyFromLoss(r.loss), 0) / valid.length * 10) / 10;
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
