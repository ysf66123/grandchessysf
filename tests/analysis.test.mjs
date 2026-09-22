import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseInfo,whiteScore,expectedScore,accuracyFromLoss,classify,gameAccuracy,pvMoves,sacrificeEvidence,terminalResult,validPosition} from '../modules/analysis-core.mjs';
import {tableExpected,normalizedOpeningKey} from '../modules/analysis-data.mjs';
import {AnalysisEngine} from '../modules/analysis-engine.mjs';
const context={exports:{}};
vm.runInNewContext(fs.readFileSync(new URL('../vendor/chess-0.10.3.js',import.meta.url),'utf8'),context);
const {Chess}=context.exports;
const fen=new Chess().fen();
test('invalid kings and impossible pawn ranks are rejected',()=>{
    assert.equal(validPosition(Chess,'8/8/8/8/8/8/8/8 w - - 0 1'),false);
    assert.equal(validPosition(Chess,'4k3/4K3/8/8/8/8/8/8 w - - 0 1'),false);
    assert.equal(validPosition(Chess,fen),true);
});
test('tablebase uncertainty is not reported as a proven outcome',()=>{
    assert.equal(tableExpected('maybe-win'),null);assert.equal(tableExpected('unknown'),null);
    assert.equal(tableExpected('cursed-win'),.5);assert.equal(tableExpected('blessed-loss'),.5);
    assert.equal(expectedScore({cp:700,exactExpected:.5}),.5);
});
test('opening keys ignore irrelevant en-passant squares and retain legal captures',()=>{
    const g=new Chess();g.move('e4');assert(normalizedOpeningKey(g).endsWith(' -'));
    const ep=new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');assert(normalizedOpeningKey(ep).endsWith(' d6'));
});
test('UCI scores, complete PV and WDL; bounds are not exact scores',()=>{
    const line=parseInfo('info depth 18 seldepth 22 multipv 2 score cp -34 wdl 30 800 170 nodes 1000 time 8 pv e2e4 e7e5');
    assert.equal(line.depth,18);assert.equal(line.rank,2);assert.equal(line.pv.length,2);
    assert.equal(whiteScore(line,fen),-34);assert.equal(whiteScore(line,fen.replace(' w ',' b ')),34);
    assert.equal(expectedScore(line),0.43);
    assert.equal(parseInfo('info depth 20 score cp 400 lowerbound pv e2e4'),null);
});
test('mate and terminal scores preserve color and zero mate',()=>{
    assert.equal(expectedScore({mate:0}),0);assert.equal(expectedScore({mate:3}),1);
    assert(whiteScore({mate:0},fen.replace(' w ',' b '))>0);
    const game=new Chess();game.load_pgn('1. f3 e5 2. g4 Qh4#');
    assert.equal(terminalResult(game).mate,0);
});
test('accuracy is monotonic and does not depend on categories',()=>{
    assert.equal(accuracyFromLoss(0),100);
    assert(accuracyFromLoss(.02)>accuracyFromLoss(.1));
    assert.equal(gameAccuracy([{loss:.05,category:'book'}]),gameAccuracy([{loss:.05,category:'blunder'}]));
    assert.equal(gameAccuracy([]),null);
});
test('forced legal move is not a Great move; shallow sacrifice is not Brilliant',()=>{
    const best={cp:0,wdl:[0,1000,0],unique:true};
    assert.equal(classify({best,played:best,legalCount:1,verified:true}), 'best');
    assert.equal(classify({best:{...best,unique:false},played:best,legalCount:20,verified:false,sacrifice:true}),'best');
});
test('sacrifice detection follows the opponent capture, not immediate material',()=>{
    const f='4k3/8/4p3/8/8/2N5/P7/4K3 w - - 0 1';
    assert.equal(sacrificeEvidence(Chess,f,{pv:['c3d5','e6d5','e1d2']}),true);
    assert.equal(sacrificeEvidence(Chess,f,{pv:['c3b5','e8d7','b5c3']}),false);
});
test('PV replay handles castling, en passant, underpromotion and rejects illegal continuations',()=>{
    assert.equal(pvMoves(Chess,'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',['e1g1'])[0].san,'O-O');
    assert.equal(pvMoves(Chess,'4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',['e5d6'])[0].captured,'p');
    assert.equal(pvMoves(Chess,'4k3/P7/8/8/8/8/8/4K3 w - - 0 1',['a7a8n'])[0].san,'a8=N');
    assert.equal(pvMoves(Chess,fen,['e2e4','e7e4']).length,1);
});
test('repetition history and fifty-move draw are preserved',()=>{
    const g=new Chess();g.load_pgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8');
    assert.equal(terminalResult(g).cp,0);
    const fifty=new Chess('4k3/8/8/8/8/8/R7/4K3 w - - 100 51');assert.equal(terminalResult(fifty).cp,0);
});
class MockWorker {
    sent=[];postMessage(s){this.sent.push(s);}terminate(){this.terminated=true;}
    emit(s){this.onmessage({data:s});}
}
async function ready() {
    const worker=new MockWorker(),engine=new AnalysisEngine(()=>worker);
    const init=engine.init();worker.emit('uciok');worker.emit('readyok');await init;
    return {worker,engine};
}
test('MultiPV uses one complete depth; incomplete deeper rank is discarded',async()=>{
    const {worker,engine}=await ready();
    const result=engine.evaluate(fen,{depth:18,multiPv:2,legalCount:20,mode:'review'});
    worker.emit('info depth 14 multipv 1 score cp 30 pv e2e4 e7e5');
    worker.emit('info depth 14 multipv 2 score cp 20 pv d2d4 d7d5');
    worker.emit('info depth 18 multipv 1 score cp 80 pv g1f3 d7d5');
    worker.emit('bestmove g1f3');const r=await result;
    assert.equal(r.depth,14);assert.equal(r.bestMove,'e2e4');assert.equal(r.complete,false);
    assert(r.topLines.every(l=>l.depth===14));
});
test('cancelled search drains bestmove before next position, all promises settle',async()=>{
    const {worker,engine}=await ready();
    const first=engine.evaluate(fen,{mode:'review',depth:10,legalCount:20});
    engine.cancel(t=>t.mode==='review');
    const second=engine.evaluate(fen,{mode:'bot',depth:10,legalCount:20,skillLevel:3});
    assert.equal(worker.sent.filter(s=>s.startsWith('position')).length,1);
    worker.emit('bestmove e2e4');assert.equal((await first).cancelled,true);
    assert.equal(worker.sent.filter(s=>s.startsWith('position')).length,2);
    worker.emit('info depth 10 score cp 12 pv d2d4');worker.emit('bestmove e2e4');
    assert.equal((await second).bestMove,'e2e4'); // bot strength selection retained
});
test('worker failure settles active and queued requests',async()=>{
    const {worker,engine}=await ready();
    const first=engine.evaluate(fen,{mode:'review'}),second=engine.evaluate(fen,{mode:'bot'});
    worker.onerror();assert.equal((await first).fallback,true);assert.equal((await second).fallback,true);
    assert.equal(engine.ready,false);
});
