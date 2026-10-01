import {AnalysisEngine} from './analysis-engine.mjs?v=20261001-mobile1';
import {REVIEW_VERSION, whiteScore, rootScore, classify, gameAccuracy, pvMoves, sacrificeEvidence, terminalResult, validPosition, uciOf, qualityScore, moveMetrics, comparisonEvidence, specialMoveEvidence, reviewIsStable} from './analysis-core.mjs?v=20261001-mobile1';
import {loadOpenings, normalizedOpeningKey, tablebase, tableExpected, explanation} from './analysis-data.mjs?v=20261001-mobile1';
import {reviewInsights, PHASE_LABELS} from './analysis-insights.mjs?v=20261001-mobile1';
import {REVIEW_STAGES, stageProgress, canRevealReport} from './analysis-progress.mjs?v=20261001-mobile1';
import {MOVE_CATEGORY_META,categorySvg} from './analysis-labels.mjs?v=20261001-mobile1';
import {tacticalSequence} from './analysis-tactics.mjs?v=20261001-mobile1';
import {acceptTrainingMove} from './analysis-learning.mjs?v=20261001-mobile1';
import {renderLearningUI,finishLearningAttempt,clearLearningAttempt} from './analysis-learning-ui.mjs?v=20261001-mobile1';
// modules/analysis-v2.js - Chess Game Analysis Engine (Chess.com-style review)

const SF_DEPTH_LIVE = 18;
const SF_DEPTH_REVIEW = 16;
const SF_MULTI_PV = 3;
const ANALYSIS_CACHE_VERSION = REVIEW_VERSION;
const ANALYSIS_CACHE_DB = 'grandmaster_analysis_cache_v1';
const ANALYSIS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 45;


let currentSharedAnalysisPayload = null;
let pendingSharedAnalysisId = null;
let firestoreApiPromise = null;
let currentAnalysisReportCacheKey = null;
let analysisMoveFilter='all';
const completedEvalMemory=new Map();
let loadingStage='prepare',loadingDone=0,loadingTotal=1,loadingPercent=0;
let tacticPlayback=null,tacticTimer=null,practiceHintLevel=0,analysisClockHistory=[];

function setReviewGate(state) {
    const view=getAnalysisViewElement();if(!view)return;
    view.dataset.reviewState=state;view.setAttribute('aria-busy',String(state==='processing'));
    const overlay=document.getElementById('analysisLoadingOverlay');overlay.style.display=state==='ready'?'none':'flex';
    const button=document.getElementById('reviewLoadingPause');
    button.textContent=state==='processing'?'Duraklat':state==='paused'?'Devam et':'Tekrar dene';
    document.getElementById('btnShareAnalysis').disabled=state!=='ready';
    if(state==='paused')document.getElementById('analysisLoadingTitle').textContent='Analiz duraklatıldı';
    if(state==='incomplete'){
        document.getElementById('analysisLoadingTitle').textContent='Doğrulama henüz tamamlanmadı';
        document.getElementById('analysisLoadingMessage').textContent='Bazı konumlarda derinlik veya karar tutarlılığı henüz yeterli değil. Sonuçların korunuyor; devam ederek bu konumları yeniden doğrulayabilirsin.';
    }
    if(state==='error')document.getElementById('analysisLoadingTitle').textContent='Analiz tamamlanamadı';
}
function setReviewStage(stage,done=0,total=1,detail) {
    loadingStage=stage;loadingDone=done;loadingTotal=total;
    loadingPercent=stageProgress(stage,done,total);
    const meta=REVIEW_STAGES.find(s=>s.id===stage);
    document.getElementById('analysisLoadingTitle').textContent='Maçını inceliyoruz';
    document.getElementById('analysisLoadingMessage').textContent=detail||meta.detail;
    document.getElementById('analysisLoadingSubtext').textContent='%'+loadingPercent+' tamamlandı';
    document.getElementById('analysisLoadingProgressFill').style.width=loadingPercent+'%';
    document.getElementById('analysisLoadingProgress').value=loadingPercent;
    document.getElementById('analysisCountdownNumber').textContent=meta.title+(stage==='scan'||stage==='verify'?' · '+done+' / '+total:'');
    document.querySelectorAll('[data-loading-stage]').forEach((el,index)=>{
        const active=REVIEW_STAGES.findIndex(s=>s.id===stage);
        el.dataset.state=index<active?'done':index===active?'active':'waiting';
    });
}

function renderAnalysisInsights() {
    const report=reviewInsights(analysisMoveReviews,analysisHistory.length);
    const coverage=document.getElementById('reviewCoverage');
    if(!coverage)return;
    coverage.textContent=report.total?`${report.reviewed} / ${report.total} hamle incelendi · ${report.confirmed} tamamlanan · ${report.deep} derin doğrulama`:'Tek konum inceleniyor; maç doğruluğu hesaplanmaz.';
    const trust=document.getElementById('reviewTrust');
    trust.textContent=!report.total?'Maç geçmişi yok':report.pending?`${report.pending} hamle bekliyor`:report.provisional?`${report.provisional} karar geçici`:'Motor incelemesi tamamlandı';
    trust.dataset.level=report.pending||report.provisional?'pending':'complete';
    const depths=document.getElementById('reviewDepthRange');
    depths.textContent=report.reviewed?`Gerçek derinlik ${report.minDepth}–${report.maxDepth}`:'Motor hazırlanıyor';
    document.getElementById('reviewPause').textContent=reviewBusy?'Duraklat':report.pending||report.provisional?'Devam et':'Tamamlandı';
    document.getElementById('reviewPause').disabled=!reviewBusy && !report.pending && !report.provisional;
    const stats=document.getElementById('reviewPlayerStats');stats.replaceChildren();
    for(const [side,data] of [['Beyaz',report.white],['Siyah',report.black]]) {
        const card=document.createElement('div');card.className='studio-stat-card';
        const title=document.createElement('strong');title.textContent=side;card.append(title);
        for(const [label,value] of [['Sağlam hamle',`${data.sound} / ${data.moves}`],['Ort. piyon kaybı',data.averageCpLoss==null?'—':(data.averageCpLoss/100).toFixed(2)],['Karar doğruluğu',data.decisionAccuracy==null?'—':`%${data.decisionAccuracy}`]]) {
            const row=document.createElement('div'),name=document.createElement('span'),number=document.createElement('b');
            name.textContent=label;number.textContent=value;row.append(name,number);card.append(row);
        }
        card.title=`Piyon kaybı ${data.cpSamples} sayısal değerlendirmeye dayanır; mat puanları hariçtir. Karar doğruluğu ${data.decisions} zorunlu veya kitap dışı hamleyi içerir.`;
        stats.append(card);
    }
    const phases=document.getElementById('reviewPhases');phases.replaceChildren();
    for(const phase of Object.keys(PHASE_LABELS)) {
        const row=document.createElement('div');row.className='studio-phase-row';
        const label=document.createElement('span');label.textContent=PHASE_LABELS[phase];row.append(label);
        for(const side of [report.white,report.black]) {
            const group=side.phases.find(p=>p.phase===phase),cell=document.createElement('strong');
            cell.textContent=group.accuracy==null?'—':`%${group.accuracy}`;cell.title=`${group.moves} hamle${reviewBusy?' · inceleme sürüyor':''}`;row.append(cell);
        }
        phases.append(row);
    }
    const moments=document.getElementById('reviewMoments');moments.replaceChildren();
    if(!report.moments.length){const empty=document.createElement('p');empty.className='studio-empty';empty.textContent=report.pending?'Kritik anlar inceleme sırasında burada belirecek.':'İncelenen hamlelerde belirgin kayıp veya özel hamle bulunmadı.';moments.append(empty);}
    for(const r of report.moments) {
        const button=document.createElement('button');button.className='studio-moment';button.dataset.category=r.category;
        const symbol=document.createElement('span');symbol.className='studio-moment-symbol';symbol.innerHTML=categorySvg(r.category);
        const text=document.createElement('span'),title=document.createElement('strong'),description=document.createElement('small');
        title.textContent=`${r.moveNumber}${r.moveColor==='b'?'…':'.'} ${r.moveSan} · ${getMoveCategoryLabel(r.category)}`;
        description.textContent=`${r.moveColor==='w'?'Beyaz':'Siyah'} · değerlendirme kaybı ${(r.loss*100).toFixed(1)} puan${!r.complete||r.stable===false?' · geçici':''}`;
        text.append(title,description);button.append(symbol,text);
        button.onclick=()=>{window.jumpToMove(r.index+1);window.setAnalysisMobileTab('focus');};moments.append(button);
    }
}

window.filterAnalysisMoves=function(category='all') {
    analysisMoveFilter=category;renderMoveList();highlightMoveRow();
    const filter=document.getElementById('reviewMoveFilter');if(filter)filter.value=category;
    if(category!=='all')window.setAnalysisMobileTab('moves');
};
window.toggleReviewPause=async function() {
    if(reviewBusy || getAnalysisViewElement().dataset.reviewState==='processing'){
        window.cancelAnalysisReview();reportStatus='Analiz duraklatıldı · mevcut sonuçlar korundu';setReviewGate('paused');
        document.getElementById('analysisLoadingMessage').textContent='Tamamlanan motor hesapları korundu. Devam ettiğinde yalnızca eksik incelemeler sürdürülür.';return;
    }
    if(!analysisHistory.length)return;
    const token=analysisReviewToken;
    setReviewGate('processing');
    try {await initStockfish();if(token!==analysisReviewToken)return;await runDetailedGameReview(token,true);}
    catch(e){if(token===analysisReviewToken){reportStatus='Analiz tamamlanamadı';setReviewGate('error');document.getElementById('analysisLoadingMessage').textContent=e.message;}}
};
window.importReviewPgn=async function() {
    const input=document.getElementById('reviewPgnInput');
    if(input.value.length>1000000){window.showToast('PGN dosyası 1 MB sınırını aşıyor.','error');return;}
    const game=new Chess();let valid=false;
    try{valid=game.load_pgn(input.value.trim()) && game.history().length>0;}catch{}
    if(!valid){document.getElementById('reviewImportError').textContent='PGN geçersiz veya hamle içermiyor. Mevcut analiz korunuyor.';return;}
    document.getElementById('reviewImportError').textContent='';document.getElementById('reviewImport').open=false;
    const headers=game.header();
    await window.openAnalysis(input.value,[{team:'white',name:headers.White||'Beyaz'},{team:'black',name:headers.Black||'Siyah'}]);
};
document.getElementById('reviewPgnFile')?.addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    if(file.size>1000000){document.getElementById('reviewImportError').textContent='Dosya en fazla 1 MB olmalı.';return;}
    document.getElementById('reviewPgnInput').value=await file.text();
});
window.downloadReviewPgn=function() {
    if(!currentSharedAnalysisPayload?.pgn)return;
    const game=new Chess();if(!game.load_pgn(currentSharedAnalysisPayload.pgn))return;
    const headers=game.header(),start=headers.SetUp==='1'?headers.FEN:null;
    const headerText=Object.entries(headers).map(([k,v])=>'['+k+' "'+String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"]');
    const replay=start?new Chess(start):new Chess();
    const moves=analysisHistory.map((move,index)=>{
        const number=Number(replay.fen().split(' ')[5]),color=replay.turn();replay.move(getAnalysisReplayMove(move));
        const r=analysisMoveReviews[index];
        const score=r?.mateAfter!=null?'#'+(r.mateAfter*(move.color==='w'?1:-1)):Number.isFinite(r?.cpAfter)?(r.cpAfter/100).toFixed(2):null;
        return (color==='w'?number+'. ':index===0?number+'... ':'')+move.san+(r?' {'+(score!=null?'[%eval '+score+'] ':'')+getMoveCategoryLabel(r.category)+'; derinlik '+r.depth+(!r.complete||r.stable===false?'; geçici':'')+'}':'');
    });
    const url=URL.createObjectURL(new Blob([headerText.join('\n')+'\n\n'+moves.join(' ')+' '+(headers.Result||'*')],{type:'application/x-chess-pgn'}));
    const link=document.createElement('a');link.href=url;link.download='mac-incelemesi.pgn';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

function getAnalysisLang() {
    return localStorage.getItem('gm_analysis_lang') === 'en' ? 'en' : 'tr';
}

function getMoveCategoryLabel(category) {
    const meta = MOVE_CATEGORY_META[category];
    if (!meta) return category;
    return getAnalysisLang() === 'en' ? meta.en : meta.tr;
}

function updateAnalysisContextLabels() {
    const currentMove = currentAnalysisIndex > 0 ? analysisHistory[currentAnalysisIndex - 1] : null;
    const currentMoveEl = document.getElementById('analysisCurrentMoveLabel');
    const currentTurnEl = document.getElementById('analysisCurrentTurnLabel');
    const positionEl = document.getElementById('analysisPositionLabel');

    const positionText = currentMove
        ? (Math.ceil(currentAnalysisIndex / 2) + '. hamle • ' + currentMove.san)
        : 'Başlangıç';

    let turnText = 'Beyaz oynar';
    if (analysisChess.game_over()) turnText = 'Maç sonu';
    else if (analysisChess.turn() === 'b') turnText = 'Siyah oynar';

    if (currentMoveEl) currentMoveEl.innerText = currentMove ? currentMove.san : 'Başlangıç konumu';
    if (currentTurnEl) currentTurnEl.innerText = turnText;
    if (positionEl) positionEl.innerText = positionText;
    
    if (typeof updateCoachFeedback === 'function') updateCoachFeedback();
}

function updateCoachFeedback() {
    const quality = document.getElementById('coachMoveQuality');
    const text = document.getElementById('coachFeedbackText');
    if (!quality || !text) return;
    const review = analysisMoveReviews[currentAnalysisIndex-1];
    quality.innerHTML = review ? categorySvg(review.category)+' '+getMoveCategoryLabel(review.category) : 'Konumu incele';
    quality.dataset.category=review?.category || 'unrated';
    text.textContent = review ? explanation(Chess,review) : 'Bir hamle seçerek değerlendirmeyi ve önerilen devamları inceleyebilirsin.';
    renderReviewDetails();
}

function getAnalysisViewElement() {
    return document.getElementById('view-2v2-analysis');
}

function syncAnalysisMovesToggleUI() {
    const viewEl = getAnalysisViewElement();
    const toggleBtn = document.getElementById('analysisMovesToggle');
    const toggleLabel = document.getElementById('analysisMovesToggleLabel');
    const toggleIcon = document.getElementById('analysisMovesToggleIcon');
    if (!viewEl || !toggleBtn || !toggleLabel || !toggleIcon) return;

    const collapsed = viewEl.dataset.movesCollapsed === '1';
    toggleLabel.innerText = collapsed ? 'Aç' : 'Daralt';
    toggleIcon.className = 'fas ' + (collapsed ? 'fa-chevron-down' : 'fa-chevron-up');
    toggleBtn.title = collapsed ? 'Hamle panelini aç' : 'Hamle panelini daralt';
}

window.toggleAnalysisMovesPanel = function(forceState) {
    const viewEl = getAnalysisViewElement();
    if (!viewEl) return;
    const collapsed = typeof forceState === 'boolean'
        ? forceState
        : viewEl.dataset.movesCollapsed !== '1';
    viewEl.dataset.movesCollapsed = collapsed ? '1' : '0';
    syncAnalysisMovesToggleUI();
};

window.setAnalysisMobileTab = function(tab) {
    const viewEl = getAnalysisViewElement();
    if (!viewEl) return;

    const validTabs = ['review', 'focus', 'moments', 'moves'];
    const nextTab = validTabs.indexOf(tab) >= 0 ? tab : 'review';
    viewEl.dataset.mobileTab = nextTab;

    // Update mobile tab buttons
    const tabBtns = viewEl.querySelectorAll('.mob-tab-btn');
    tabBtns.forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.tab === nextTab);
        btn.setAttribute('aria-selected',String(btn.dataset.tab === nextTab));
    });

    // Show/hide sidebar blocks
    viewEl.querySelectorAll('[data-review-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.reviewPanel===nextTab));
};
function syncReviewMovePlacement() {
    const view=document.getElementById('view-2v2-analysis'),moves=view?.querySelector('.studio-desktop-moves');
    if(!moves)return;
    const target=matchMedia('(max-width:800px)').matches?document.getElementById('reviewMovesMobile'):view.querySelector('.analysis-main-col');
    if(target && moves.parentElement!==target)target.append(moves);
    drawEvaluationChart();
}
addEventListener('resize',syncReviewMovePlacement);
queueMicrotask(syncReviewMovePlacement);

window.getAnalysisLang = getAnalysisLang;
window.refreshAnalysisLabels = function() {
    renderMoveList();
    renderQualitySummary();
    renderAnalysisBoard();
};

let sfWorker = null;
let isSfReady = false;
let sfPendingFen = null;

let analysisChess = new Chess();
let analysisHistory = [];
let currentAnalysisIndex = 0;
let analysisMoveReviews = [];
let analysisBaseFen = null;
let analysisPlayers = null;
let analysisReviewToken = 0;
let liveEvalRequestId = 0;
let liveBestMoveUci = null;
let liveBestMoveFen = null;
let bestPreviewToken = 0;
let isPreviewingMove = false;

let chartCanvas = null;
let chartCtx = null;

window.analysisReviewToken = 0;
window.analysisLoadingState = null;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

let analysisCacheDbPromise = null;

function getAnalysisCacheDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (analysisCacheDbPromise) return analysisCacheDbPromise;
    analysisCacheDbPromise = new Promise(function(resolve) {
        const request = indexedDB.open(ANALYSIS_CACHE_DB, 1);
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('evals')) db.createObjectStore('evals', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('reports')) db.createObjectStore('reports', { keyPath: 'key' });
        };
        request.onsuccess = function(event) { resolve(event.target.result); };
        request.onerror = function() { resolve(null); };
        request.onblocked = function() { resolve(null); };
    });
    return analysisCacheDbPromise.catch(()=>null);
}

async function readCacheStore(storeName,key) {
    try {
        const db=await getAnalysisCacheDb();if(!db)return null;
        return await new Promise(resolve=>{
            const tx=db.transaction(storeName,'readonly'),req=tx.objectStore(storeName).get(key);
            req.onsuccess=()=>{const value=req.result;resolve(value && Date.now()-value.createdAtMs<=ANALYSIS_CACHE_TTL_MS?value.payload:null);};
            req.onerror=tx.onabort=()=>resolve(null);
        });
    }catch{return null;}
}
async function writeCacheStore(storeName,key,payload) {
    try {
        const db=await getAnalysisCacheDb();if(!db || !payload)return;
        await new Promise(resolve=>{
            const tx=db.transaction(storeName,'readwrite');
            tx.objectStore(storeName).put({key,payload,createdAtMs:Date.now()});
            tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();
        });
    }catch{/* Private browsing and quota errors do not change review results. */}
}

function hashText(value) {
    const text = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

function buildEvalCacheKey(position, depth) { return [REVIEW_VERSION, depth, position].join('|'); }

function buildReportCacheKey(pgn, fallbackFen) {
    return [ANALYSIS_CACHE_VERSION, 'report', 'd' + SF_DEPTH_REVIEW, hashText((pgn || '') + '|' + (fallbackFen || ''))].join('|');
}

function materialEvalWhiteCpFromFen(fen) {
    try {
        const temp = new Chess();
        if (!temp.load(fen)) return 0;
        const board = temp.board();
        let score = 0;
        const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
        board.forEach(function(row) {
            row.forEach(function(piece) {
                if (!piece) return;
                const val = values[piece.type] || 0;
                score += piece.color === 'w' ? val : -val;
            });
        });
        return score;
    } catch (e) {
        return 0;
    }
}

window.materialEvalWhiteCpFromFen = materialEvalWhiteCpFromFen;

function setStockfishStatus(state) {
    const badge = document.getElementById('sfStatusBadge');
    if (!badge) return;
    if (state === 'active') {
        badge.innerHTML = '<i class="fas fa-check-circle"></i> Stockfish Aktif';
        badge.style.background = 'rgba(76,175,80,0.2)';
        badge.style.color = '#4caf50';
        badge.style.borderColor = '#4caf50';
    } else if (state === 'loading') {
        badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Motor Yükleniyor';
        badge.style.background = 'rgba(255,165,0,0.2)';
        badge.style.color = 'orange';
        badge.style.borderColor = 'orange';
    } else {
        badge.innerHTML = '<i class="fas fa-calculator"></i> Motor kullanılamıyor';
        badge.style.background = 'rgba(255,165,0,0.2)';
        badge.style.color = 'orange';
        badge.style.borderColor = 'orange';
    }
}

const reviewEngine = new AnalysisEngine();
let reviewBusy = false;
let openings = null;
let variation = null;
let livePositionResult = null;
let variationRequest = 0;
let retryReview = null;
let reportStatus = 'Hazır';

async function initStockfish() {
    setStockfishStatus('loading');
    try { await reviewEngine.init(); sfWorker = reviewEngine.worker; isSfReady = true; setStockfishStatus('active'); }
    catch (error) { sfWorker = null; isSfReady = false; setStockfishStatus('fallback'); throw error; }
}
function queueStockfishEval(fen, opts = {}) {
    let legalCount = 1;
    try { legalCount = new Chess(fen).moves().length || 1; } catch {}
    return reviewEngine.evaluate(fen, {...opts,legalCount}).then(result=>{
        sfWorker=reviewEngine.worker;isSfReady=reviewEngine.ready;
        if(!isSfReady)setStockfishStatus('fallback');return result;
    });
}
function evalToWhiteScore(result, fen) { return whiteScore(result,fen); }
function engineLineToWhiteScore(line, fen) { return whiteScore(line,fen); }
function warmAnalysisCacheForFen() { return Promise.resolve(); }
function warmAnalysisCacheForGame() { /* Review cache is filled on demand, without competing with games. */ }
function moveToUci(move) { return move ? uciOf(move) : ''; }
function calculateAccuracy(reviews) { return gameAccuracy(reviews,analysisMoveReviews); }
function gameAt(index) {
    const game = new Chess();
    if (analysisBaseFen && !game.load(analysisBaseFen)) throw Error('Başlangıç konumu geçersiz.');
    for (let i=0;i<index;i++) if (!game.move(getAnalysisReplayMove(analysisHistory[i]))) throw Error('Hamle geçmişi geçersiz.');
    return game;
}
function positionCommand(index, extra = []) {
    return 'position fen ' + (analysisBaseFen || new Chess().fen()) +
        ((index || extra.length) ? ' moves ' + analysisHistory.slice(0,index).map(uciOf).concat(extra).join(' ') : '');
}
async function rootEvaluation(index, depth, token, searchmoves, fresh=false) {
    if (token !== analysisReviewToken) return null;
    const game = gameAt(index), fen=game.fen(), position=positionCommand(index);
    const identity=position+'|moves:'+(searchmoves||[]).slice().sort().join(',');
    const key=buildEvalCacheKey(identity,depth),deepKey=buildEvalCacheKey(identity,'deepest');
    const remembered=completedEvalMemory.get(deepKey);
    if(!fresh && remembered?.complete && remembered.depth>=depth)return remembered;
    const candidates=fresh?[]:await Promise.all([readCacheStore('evals',deepKey),readCacheStore('evals',key)]);
    const cached=candidates.filter(r=>r?.complete).sort((a,b)=>b.depth-a.depth)[0];
    if (token !== analysisReviewToken) return null;
    if (cached?.complete && cached.depth >= depth){completedEvalMemory.set(deepKey,cached);return cached;}
    const result = await queueStockfishEval(fen,{mode:'review', depth, position, searchmoves,
        multiPv:searchmoves ? searchmoves.length : SF_MULTI_PV, requestId:token,
        reviewSession:currentAnalysisReportCacheKey,
        onProgress:line=>{if(token===analysisReviewToken && getAnalysisViewElement().dataset.reviewState==='processing')document.getElementById('analysisLoadingEngine').textContent='Stockfish 18 · '+(searchmoves?'Aday karşılaştırması':'Tam konum araması')+' · derinlik '+line.depth+' / '+depth;},
        timeoutMs:depth >= 24 ? 18000 : depth >= 22 ? 12000 : depth >= 20 ? 8000 : 3000});
    if (token !== analysisReviewToken || result.cancelled) return null;
    if (result.fallback || result.depth < 8) throw Error('Yeterli motor verisi alınamadı. Yeniden deneyin.');
    if (result.complete){
        const existing=completedEvalMemory.get(deepKey);
        if(!existing || existing.depth<=result.depth){
            completedEvalMemory.set(deepKey,result);
            if(completedEvalMemory.size>512)completedEvalMemory.delete(completedEvalMemory.keys().next().value);
            await writeCacheStore('evals',deepKey,result);
        }
        await writeCacheStore('evals',key,result);
    }
    return result;
}
window.cancelAnalysisReview = function() {
    window.stopReviewTactic?.();tacticPlayback=null;
    if(reviewBusy)saveReviewCheckpoint();
    analysisReviewToken++; liveEvalRequestId++; bestPreviewToken++; variationRequest++;
    reviewBusy=false; variation=null; retryReview=null;
    reviewEngine.cancel(t=>['review','live','variation'].includes(t.mode));
    if(getAnalysisViewElement()?.dataset.reviewState!=='ready')setReviewGate('paused');
};

function countMoveCategories(reviews) {
    const counts = {};
    Object.keys(MOVE_CATEGORY_META).forEach(function(k) { counts[k] = 0; });
    reviews.forEach(function(r) {
        if (!r || !counts.hasOwnProperty(r.category)) return;
        counts[r.category] += 1;
    });
    return counts;
}

function renderQualitySummary() {
    const container = document.getElementById('analysisQualitySummary');
    if (!container) return;

    const white = countMoveCategories(analysisMoveReviews.filter(function(r) { return r && r.moveColor === 'w'; }));
    const black = countMoveCategories(analysisMoveReviews.filter(function(r) { return r && r.moveColor === 'b'; }));
    const order = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

    const catColors=Object.fromEntries(Object.entries(MOVE_CATEGORY_META).map(([key,m])=>[key,m.color]));

    container.innerHTML = order.map(function(cat) {
        return '<button type="button" class="quality-row ' + cat + '" onclick="filterAnalysisMoves(\''+cat+'\')" title="Bu sınıftaki hamleleri göster">' +
            '<span class="quality-icon-label" style="color:' + (catColors[cat] || '#fff') + '">' +
            categorySvg(cat) + ' ' +
            getMoveCategoryLabel(cat) + '</span>' +
            '<span class="q-val" style="color:' + (catColors[cat] || '#fff') + '">' + (white[cat] || 0) + ' / ' + (black[cat] || 0) + '</span>' +
            '</button>';
    }).join('');
}

function updateAccuracyRing(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    let color = '#ef4444';
    if (value >= 90) color = '#10b981';
    else if (value >= 75) color = '#f59e0b';
    else if (value >= 55) color = '#0ea5e9';
    const side=id==='acc-white'?'w':'b';
    const scored=analysisMoveReviews.filter(r=>r?.moveColor===side);
    const provisional=scored.some(r=>!r.complete || r.stable===false) || reviewBusy || scored.length<analysisHistory.filter(m=>m.color===side).length;
    el.innerText = value == null ? '—' : (provisional?'≈':'')+value + '%';
    el.title=scored.length+' hamle üzerinden hesaplandı.'+(provisional?' İnceleme sürüyor veya geçici kararlar var.':'');
    const name=el.closest('.acc-player')?.querySelector('.acc-name');
    if(name)name.textContent=(side==='w'?'Beyaz':'Siyah')+' Doğruluk · '+scored.length+' hamle';
    el.style.color = color;
    
    const ringWrap = document.getElementById(id + '-ring') || document.getElementById(id==='acc-white'?'acc-white-ring':'acc-black-ring');
    if (ringWrap) {
        ringWrap.style.setProperty('--val', ((value||0) * 3.6) + 'deg');
        ringWrap.style.setProperty('--ring-color',color);
    }
}

function formatEngineMove(uci, fen) {
    if (!uci || uci === '(none)' || uci.length < 4) return '-';
    try {
        const probe = new Chess();
        if (!probe.load(fen)) return uci;
        const moveObj = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
        if (uci.length > 4) moveObj.promotion = uci.slice(4, 5);
        const played = probe.move(moveObj);
        if (played && played.san) return played.san;
    } catch (e) {}
    return uci;
}

function setBestMoveButton(text, uci, fen) {
    const bestEl = document.getElementById('report-best');
    if (!bestEl) return;
    bestEl.innerText = text;
    bestEl.dataset.uci = uci || '';
    bestEl.dataset.fen = fen || '';
    bestEl.disabled = false;
    bestEl.classList.toggle('is-empty', !uci || uci === '(none)');
}

function tryApplyUciMove(chessInstance, uci, fen) {
    if (!chessInstance || !uci || uci === '(none)' || uci.length < 4) return false;
    if (fen) {
        try { chessInstance.load(fen); } catch (e) { return false; }
    }
    const moveObj = {
        from: uci.slice(0, 2),
        to: uci.slice(2, 4)
    };
    if (uci.length > 4) moveObj.promotion = uci.slice(4, 5);
    let played = chessInstance.move(moveObj);
    if (!played) played = chessInstance.move(uci, { sloppy: true });
    return !!played;
}

function decorateAnalysisPiece(piece,color,type) {
    piece.style.backgroundImage='none';
    const fallback=document.createElement('span');fallback.className='piece-fallback'+(color==='b'?' black-piece':'');
    fallback.textContent={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}[type];
    const img=document.createElement('img');img.alt='';img.draggable=false;
    img.onload=()=>{fallback.hidden=true;};img.onerror=()=>img.remove();
    img.src=window.getPieceAsset?window.getPieceAsset(color,type):'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/'+color+type+'.png';
    piece.append(fallback,img);
}

function drawAnalysisBoardFromFen(fen, highlightUci) {
    const boardEl = document.getElementById('analysisBoard');
    if (!boardEl) return;
    boardEl.innerHTML = '';

    const tempChess = new Chess();
    if (!tempChess.load(fen)) return;

    const boardArray = tempChess.board();
    const isFlipped = boardEl.classList.contains('flipped');
    let highlightFrom = null;
    let highlightTo = null;
    if (highlightUci && highlightUci.length >= 4) {
        highlightFrom = highlightUci.slice(0, 2);
        highlightTo = highlightUci.slice(2, 4);
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const row = isFlipped ? 7 - r : r;
            const col = isFlipped ? 7 - c : c;
            const sq = boardArray[row][col];
            const squareName = String.fromCharCode(97 + col) + (8 - row);

            const div = document.createElement('div');
            div.className = 'square ' + ((r + c) % 2 === 0 ? 'white' : 'black');
            div.dataset.square=squareName;
            div.setAttribute('aria-label',squareName+(sq?' · '+(sq.color==='w'?'Beyaz ':'Siyah ')+({p:'piyon',n:'at',b:'fil',r:'kale',q:'vezir',k:'şah'}[sq.type]):' · boş kare'));
            div.setAttribute('role','button');div.tabIndex=r===0&&c===0?0:-1;

            if (highlightFrom && highlightTo && (squareName === highlightFrom || squareName === highlightTo)) {
                div.classList.add('analysis-preview-highlight');
                div.style.background = 'rgba(255, 255, 0, 0.42)';
            }

            if (c === 0) {
                const rankEl = document.createElement('span');
                rankEl.className = 'coord coord-rank';
                rankEl.innerText = (8 - row);
                div.appendChild(rankEl);
            }
            if (r === 7) {
                const fileEl = document.createElement('span');
                fileEl.className = 'coord coord-file';
                fileEl.innerText = String.fromCharCode(97 + col);
                div.appendChild(fileEl);
            }

            if (sq) {
                const piece = document.createElement('div');
                piece.className = 'piece locked';
                if (window.applyPieceSkin) window.applyPieceSkin(piece, sq.color, sq.type);
                else piece.style.backgroundImage = `url('https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${sq.color}${sq.type}.png')`;
                decorateAnalysisPiece(piece,sq.color,sq.type);
                div.appendChild(piece);
            }
            boardEl.appendChild(div);
        }
    }
}

function updateBestMovePreviewBadge(isShowingBest, isShowingPlayed) {
    const btn = document.getElementById('report-best');
    if (!btn) return;
    if (isShowingBest) {
        btn.innerText = getAnalysisLang() === 'en' ? '★ BEST MOVE' : '★ EN İYİ HAMLE';
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
    } else if (isShowingPlayed) {
        btn.innerText = getAnalysisLang() === 'en' ? 'PLAYED MOVE' : 'OYNANAN HAMLE';
        btn.style.background = 'rgba(255,165,0,0.85)';
        btn.style.color = '#111';
    } else {
        btn.style.background = '';
        btn.style.color = '';
        refreshBestMoveButtonState();
    }
}

function getPreviewMoveContext() {
    let moveIndex = currentAnalysisIndex > 0 ? currentAnalysisIndex - 1 : -1;
    let review = moveIndex >= 0 ? analysisMoveReviews[moveIndex] : null;

    const btn = document.getElementById('report-best');
    const btnUci = btn && btn.dataset.uci ? btn.dataset.uci : '';
    const btnFen = btn && btn.dataset.fen ? btn.dataset.fen : '';

    if ((!analysisHistory.length || moveIndex < 0) && btnUci && btnFen) {
        return {
            moveIndex: -1,
            review: { beforeFen: btnFen, bestMove: btnUci, bestMoveSan: btn.innerText || formatEngineMove(btnUci, btnFen) },
            beforeFen: btnFen,
            bestUci: btnUci,
            playedSan: null,
            playedUci: null,
            playedFen: null
        };
    }

    if (!analysisHistory.length) return null;

    if ((!review || !review.bestMove) && btnUci && btnFen && moveIndex < 0 && analysisMoveReviews.length) {
        moveIndex = 0;
        review = analysisMoveReviews[0];
    }

    if (!review || !review.beforeFen) return null;

    const bestUci = (review.bestMove && review.bestMove !== '(none)') ? review.bestMove : btnUci;
    if (!bestUci || bestUci.length < 4) return null;

    const historyMove = analysisHistory[moveIndex];
    if (!historyMove) return null;

    return {
        moveIndex: moveIndex,
        review: review,
        beforeFen: review.beforeFen,
        bestUci: bestUci,
        playedSan: historyMove.san,
        playedUci: review.playedUci || moveToUci(historyMove) || null,
        playedFen: review.playedFen || null
    };
}

function getCurrentReviewContext() {
    const ctx = getPreviewMoveContext();
    if (!ctx) return null;
    return { moveIndex: ctx.moveIndex, review: ctx.review };
}

function refreshBestMoveButtonState() {
    const ctx = getPreviewMoveContext();
    if (ctx && ctx.review.bestMoveSan && ctx.review.bestMoveSan !== '-') {
        setBestMoveButton(ctx.review.bestMoveSan, ctx.bestUci, ctx.beforeFen);
        return;
    }
    if (liveBestMoveUci && liveBestMoveFen) {
        setBestMoveButton(formatEngineMove(liveBestMoveUci, liveBestMoveFen), liveBestMoveUci, liveBestMoveFen);
        return;
    }
    setBestMoveButton('-', null, null);
}

function getAnalysisReplayMove(move) {
    if (!move) return null;
    if (move.from && move.to) {
        return { from: move.from, to: move.to, promotion: move.promotion || undefined };
    }
    return move.san || null;
}

function setAnalysisPosition(index) {
    window.stopReviewTactic?.();tacticPlayback=null;
    liveEvalRequestId++;
    reviewEngine.cancel(t=>t.mode==='live' || t.mode==='variation');
    variation = null; retryReview = null; livePositionResult=null; variationRequest++;
    const targetIndex = Math.max(0, Math.min(index, analysisHistory.length));

    if (analysisBaseFen) {
        try { analysisChess.load(analysisBaseFen); } catch (e) { analysisChess.reset(); }
    } else {
        analysisChess.reset();
    }

    for (let i = 0; i < targetIndex; i++) {
        const replayMove = getAnalysisReplayMove(analysisHistory[i]);
        let played = replayMove ? analysisChess.move(replayMove) : null;
        if (!played && analysisHistory[i] && analysisHistory[i].san) {
            played = analysisChess.move(analysisHistory[i].san);
        }
        if (!played) {
            currentAnalysisIndex = i;
            updateAnalysisContextLabels();
            return false;
        }
    }

    currentAnalysisIndex = targetIndex;
    updateAnalysisContextLabels();
    return true;
}

function showLoadingOverlay(show, totalMoves) {
    const overlay = document.getElementById('analysisLoadingOverlay');
    if (!overlay) return;
    if(show){setReviewGate('processing');setReviewStage('prepare',0,1);}
    else if(getAnalysisViewElement().dataset.reviewState==='ready')overlay.style.display='none';
}

function updateLoadingProgress(index, total) {
    const countdown = document.getElementById('analysisCountdownNumber');
    const fill = document.getElementById('analysisLoadingProgressFill');
    const message = document.getElementById('analysisLoadingMessage');
    const subtext = document.getElementById('analysisLoadingSubtext');
    const percent = total > 0 ? Math.min(100, Math.round((index / total) * 100)) : 0;

    if (fill) fill.style.width = percent + '%';
    if (countdown) countdown.innerText = total > 0 ? (index + '/' + total) : '—';
    if (message) message.innerText = 'Motor ' + (index + 1) + '/' + total + ' hamleyi analiz ediyor...';
    if (subtext) subtext.innerText = '%' + percent + ' tamamlandı';
}

window.setAnalysisOverlayVisible = showLoadingOverlay;
window.clearAnalysisOverlayTimers = function() {};

function updateEvalBarFallback(fen) {
    const activeFen = fen || analysisChess.fen();
    const turnMul = activeFen.split(' ')[1] === 'w' ? 1 : -1;
    document.getElementById('analysisEvalScore').textContent = '—';
    document.getElementById('report-eval-display').textContent = '—';
    const fill=document.getElementById('analysisEvalFill');fill.style.height='50%';fill.style.width='100%';
}

function updateEvalBarUI(cp, mate, fenForTurn) {
    let score = 0;
    let textScore = '0.0';
    const turnChar = ((fenForTurn || analysisChess.fen()).split(' ')[1] || 'w');
    const isWhiteTurn = turnChar === 'w';

    if (mate !== null && mate !== undefined) {
        score = mate > 0 ? 1000 : -1000;
        if (!isWhiteTurn) score = -score;
        textScore = mate === 0 ? 'M0' : (score > 0 ? '+' : '-') + 'M' + Math.abs(mate);
    } else if (cp !== null && cp !== undefined) {
        score = cp;
        if (!isWhiteTurn) score = -score;
        textScore = Math.abs(score) < 10 ? '0.0' : (score > 0 ? '+' : '') + (score / 100).toFixed(1);
    }

    let percent = 50 + (score / 20);
    percent = Math.max(3, Math.min(97, percent));
    if (mate !== null && mate !== undefined) {
        percent = score > 0 ? 97 : 3;
    }

    const fill = document.getElementById('analysisEvalFill');
    const txt = document.getElementById('analysisEvalScore');
    const evalDisplay = document.getElementById('report-eval-display');
    if (fill && fill.parentElement) {
        const parent = fill.parentElement;
        const horizontal = parent.clientWidth > (parent.clientHeight * 2.4);
        if (horizontal) {
            fill.style.width = percent + '%';
            fill.style.height = '100%';
        } else {
            fill.style.width = '100%';
            fill.style.height = percent + '%';
        }
    }
    if (txt) txt.innerText = textScore;
    if (evalDisplay && !analysisMoveReviews[currentAnalysisIndex-1]) {
        evalDisplay.innerText = textScore;
        evalDisplay.style.color = score >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    if (reviewEngine.ready) setStockfishStatus('active');
}

function runStockfish() {
    const fen = analysisChess.fen();
    if (variation) return;
    const terminal=terminalResult(analysisChess);
    if(terminal){updateEvalBarUI(terminal.cp,terminal.mate,fen);return;}
    const selectedReview=analysisMoveReviews[currentAnalysisIndex-1];
    if(selectedReview) {
        const mate=selectedReview.mateAfter==null?null:selectedReview.mateAfter*(analysisChess.turn()===selectedReview.moveColor?1:-1);
        updateEvalBarUI(selectedReview.cpAfter*(analysisChess.turn()==='w'?1:-1),mate,fen);
        refreshBestMoveButtonState();return;
    }
    if(reviewBusy){updateEvalBarFallback(fen);return;}
    const ctx = getCurrentReviewContext();
    if (ctx && ctx.review.bestMoveSan && ctx.review.bestMoveSan !== '-') {
        setBestMoveButton(ctx.review.bestMoveSan, ctx.review.bestMove, ctx.review.beforeFen);
    } else {
        setBestMoveButton('Hesaplanıyor...', null, fen);
    }

    if (!sfWorker) {
        updateEvalBarFallback(fen);
        liveBestMoveUci = null;
        liveBestMoveFen = null;
        refreshBestMoveButtonState();
        setStockfishStatus('fallback');
        return;
    }

    if (!isSfReady) {
        sfPendingFen = fen;
        updateEvalBarFallback(fen);
        setStockfishStatus('loading');
        refreshBestMoveButtonState();
        return;
    }

    const requestId = ++liveEvalRequestId;

    queueStockfishEval(fen, { depth: SF_DEPTH_LIVE, mode: 'live', position:positionCommand(currentAnalysisIndex), requestId: requestId }).then(function(result) {
        if (requestId !== liveEvalRequestId || variation || result.cancelled) return;

        if (result.mate !== null && result.mate !== undefined) {
            updateEvalBarUI(null, result.mate, fen);
        } else if (result.cp !== null && result.cp !== undefined) {
            updateEvalBarUI(result.cp, null, fen);
        } else {
            updateEvalBarFallback(fen);
        }

        if (result.bestMove && result.bestMove !== '(none)') {
            liveBestMoveUci = result.bestMove;
            liveBestMoveFen = fen;
        } else {
            liveBestMoveUci = null;
            liveBestMoveFen = null;
        }

        if(!analysisMoveReviews[currentAnalysisIndex-1]) {
            livePositionResult={index:currentAnalysisIndex,beforeFen:fen,lines:result.topLines,depth:result.depth,complete:result.complete};renderReviewDetails();
        }
        refreshBestMoveButtonState();
    });
}

function renderAnalysisBoard() {
    if (variation) {drawAnalysisBoardFromFen(variation.game.fen(),variation.moves.at(-1));return;}
    const boardEl = document.getElementById('analysisBoard');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    const boardArray = analysisChess.board();
    const isFlipped = boardEl.classList.contains('flipped');
    const currentReview = currentAnalysisIndex > 0 ? analysisMoveReviews[currentAnalysisIndex - 1] : null;
    const currentMove = currentAnalysisIndex > 0 ? analysisHistory[currentAnalysisIndex - 1] : null;
    const badgeSquare = currentMove ? currentMove.to : null;
    const lastMove = analysisHistory[currentAnalysisIndex - 1];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const row = isFlipped ? 7 - r : r;
            const col = isFlipped ? 7 - c : c;
            const sq = boardArray[row][col];
            const squareName = String.fromCharCode(97 + col) + (8 - row);

            const div = document.createElement('div');
            div.className = 'square ' + ((r + c) % 2 === 0 ? 'white' : 'black');
            div.dataset.square=squareName;
            div.setAttribute('aria-label',squareName+(sq?' · '+(sq.color==='w'?'Beyaz ':'Siyah ')+({p:'piyon',n:'at',b:'fil',r:'kale',q:'vezir',k:'şah'}[sq.type]):' · boş kare'));
            div.setAttribute('role','button');div.tabIndex=r===0&&c===0?0:-1;

            if (lastMove && (squareName === lastMove.from || squareName === lastMove.to)) {
                div.style.background = 'rgba(255, 255, 0, 0.35)';
            }

            if (c === 0) {
                const rankEl = document.createElement('span');
                rankEl.className = 'coord coord-rank';
                rankEl.innerText = (8 - row);
                div.appendChild(rankEl);
            }
            if (r === 7) {
                const fileEl = document.createElement('span');
                fileEl.className = 'coord coord-file';
                fileEl.innerText = String.fromCharCode(97 + col);
                div.appendChild(fileEl);
            }

            if (sq) {
                const piece = document.createElement('div');
                piece.className = 'piece locked';
                if (window.applyPieceSkin) window.applyPieceSkin(piece, sq.color, sq.type);
                else piece.style.backgroundImage = `url('https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${sq.color}${sq.type}.png')`;
                decorateAnalysisPiece(piece,sq.color,sq.type);
                div.appendChild(piece);

                if (badgeSquare && currentReview && squareName === badgeSquare) {
                    const badge = document.createElement('div');
                    badge.className = 'analysis-piece-badge ' + currentReview.category;
                    badge.innerHTML = categorySvg(currentReview.category);
                    badge.title = getMoveCategoryLabel(currentReview.category);
                    div.appendChild(badge);
                }
            }
            boardEl.appendChild(div);
        }
    }
}

function buildMoveCell(moveObj, reviewIndex, jumpIndex) {
    const cell = document.createElement('div');
    if (!moveObj) {
        cell.className = 'move-san empty';
        cell.innerText = '...';
        return cell;
    }

    cell.className = 'move-san';
    cell.onclick = function() { window.jumpToMove(jumpIndex); };

    const sanText = document.createElement('span');
    sanText.innerText = moveObj.san;
    cell.appendChild(sanText);

    const review = analysisMoveReviews[reviewIndex];
    if (review) {
        const tag = document.createElement('span');
            tag.className = 'move-tag ' + review.category;
            tag.innerHTML = categorySvg(review.category);
            const accLabel = getAnalysisLang() === 'en' ? 'Accuracy' : 'Doğruluk';
            tag.title = getMoveCategoryLabel(review.category) + ' | ' + (review.cpl==null?'Mat değerlendirmesi':'CP kaybı: '+review.cpl) + ' | ' + accLabel + ': ' + review.moveAccuracy.toFixed(1) + '%' + ' | Derinlik: '+review.depth+(review.complete && review.stable!==false?'':' · Geçici');
        cell.appendChild(tag);
    }

    return cell;
}

function renderMoveList() {
    const list=document.getElementById('analysisMoveList');if(!list)return;list.replaceChildren();
    const game=gameAt(0);let row;
    analysisHistory.forEach((move,i)=>{
        const number=Number(game.fen().split(' ')[5]);
        if(move.color==='w'||!row){
            row=document.createElement('div');row.className='move-list-row';
            const num=document.createElement('div');num.className='move-num';num.textContent=number+'.';row.append(num);
            if(move.color==='b')row.append(buildMoveCell(null,-1,0));list.append(row);
        }
        const cell=buildMoveCell(move,i,i+1);cell.dataset.moveIndex=i+1;
        cell.tabIndex=0;cell.setAttribute('role','button');cell.setAttribute('aria-label',number+'. '+move.san);
        cell.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();window.jumpToMove(i+1);}};
        row.append(cell);game.move(getAnalysisReplayMove(move));
        const r=analysisMoveReviews[i];
        cell.classList.toggle('filtered-out',analysisMoveFilter!=='all' && (analysisMoveFilter==='errors'?!(r?.loss>=.05):r?.category!==analysisMoveFilter));
        cell.tabIndex=cell.classList.contains('filtered-out')?-1:0;
    });
    list.querySelectorAll('.move-list-row').forEach(row=>row.hidden=![...row.querySelectorAll('[role=button]')].some(cell=>!cell.classList.contains('filtered-out')));
}
function highlightMoveRow() {
    document.querySelectorAll('#analysisMoveList .move-san').forEach(el=>{
        const selected=Number(el.dataset.moveIndex)===currentAnalysisIndex;
        el.classList.toggle('active',selected);el.setAttribute('aria-current',selected?'step':'false');
        el.parentElement.classList.toggle('active',!!el.parentElement.querySelector('.move-san.active'));
    });
}

function getChartEvals() {
    const evals=new Array(analysisHistory.length+1).fill(null);
    if(analysisMoveReviews[0])evals[0]=clamp(analysisMoveReviews[0].cpBefore/100,-10,10);
    analysisMoveReviews.forEach((review,i)=>{if(review && Number.isFinite(review.cpAfter))evals[i+1]=clamp(review.cpAfter/100,-10,10);});
    return evals;
}

function drawEvaluationChart() {
    chartCanvas = document.getElementById('analysisChart');
    if (!chartCanvas) return;

    const rect = chartCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    chartCanvas.width = rect.width * dpr;
    chartCanvas.height = 120 * dpr;

    chartCtx = chartCanvas.getContext('2d');
    chartCtx.scale(dpr, dpr);

    const width = rect.width;
    const height = 120;
    chartCtx.clearRect(0, 0, width, height);

    chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    chartCtx.lineWidth = 1;
    chartCtx.beginPath();
    chartCtx.moveTo(0, height * 0.25);
    chartCtx.lineTo(width, height * 0.25);
    chartCtx.moveTo(0, height * 0.75);
    chartCtx.lineTo(width, height * 0.75);
    chartCtx.stroke();

    chartCtx.beginPath();
    chartCtx.setLineDash([5, 5]);
    chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    chartCtx.moveTo(0, height / 2);
    chartCtx.lineTo(width, height / 2);
    chartCtx.stroke();
    chartCtx.setLineDash([]);

    const evals = getChartEvals();
    if (evals.length < 2) return;

    const points = [];
    const stepX = width / (evals.length - 1);

    for (let i = 0; i < evals.length; i++) {
        if(evals[i]==null){points.push(null);continue;}
        const x = i * stepX;
        const normalizedVal = (evals[i] + 10) / 20;
        const y = height - (normalizedVal * (height - 24) + 12);
        points.push({ x: x, y: y, index: i - 1 });
    }

    const gradient = chartCtx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#839b79');
    gradient.addColorStop(0.5, '#b8da84');
    gradient.addColorStop(1, '#89baa3');

    chartCtx.beginPath();
    let connected=false;
    for (let i = 0; i < points.length; i++) {
        if(!points[i]){connected=false;continue;}
        if(connected)chartCtx.lineTo(points[i].x,points[i].y);else chartCtx.moveTo(points[i].x,points[i].y);
        connected=true;
    }
    chartCtx.strokeStyle = gradient;
    chartCtx.lineWidth = 3;
    chartCtx.shadowColor = 'rgba(212, 175, 55, 0.2)';
    chartCtx.shadowBlur = 6;
    chartCtx.stroke();
    chartCtx.shadowBlur = 0;
    points.forEach((point,i)=>{
        const r=analysisMoveReviews[i-1];if(!point || !r || r.loss<.05)return;
        chartCtx.beginPath();chartCtx.arc(point.x,point.y,r.loss>=.2?4:3,0,Math.PI*2);
        chartCtx.fillStyle=r.loss>=.2?'#ed8980':r.loss>=.1?'#e9a074':'#ddc56d';chartCtx.fill();
    });

    const activePointIdx = currentAnalysisIndex;
    if (points[activePointIdx]) {
        const pt = points[activePointIdx];
        chartCtx.beginPath();
        chartCtx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        chartCtx.fillStyle = '#b8da84';
        chartCtx.fill();
        chartCtx.strokeStyle = '#fff';
        chartCtx.lineWidth = 2;
        chartCtx.stroke();

        chartCtx.beginPath();
        chartCtx.setLineDash([3, 3]);
        chartCtx.moveTo(pt.x, 0);
        chartCtx.lineTo(pt.x, height);
        chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        chartCtx.stroke();
        chartCtx.setLineDash([]);
    }
}

function initChartEvents() {
    const canvas = document.getElementById('analysisChart');
    if (!canvas) return;

    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);

    function findClosestIndex(x, width) {
        const evals = getChartEvals();
        if (evals.length < 2) return -1;
        const stepX = width / (evals.length - 1);
        let closestIndex = -1;
        let minDiff = Infinity;
        for (let i = 0; i < evals.length; i++) {
            const diff = Math.abs(x - i * stepX);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i - 1;
            }
        }
        return closestIndex;
    }

    newCanvas.addEventListener('click', function(e) {
        const rect = newCanvas.getBoundingClientRect();
        const closestIndex = findClosestIndex(e.clientX - rect.left, rect.width);
        if (closestIndex >= -1 && closestIndex <= analysisHistory.length) {
            window.jumpToMove(closestIndex + 1);
        }
    });

    newCanvas.addEventListener('mousemove', function(e) {
        const rect = newCanvas.getBoundingClientRect();
        const closestIndex = findClosestIndex(e.clientX - rect.left, rect.width);
        drawEvaluationChart();
        drawHoverPoint(closestIndex);
    });

    newCanvas.addEventListener('mouseleave', function() {
        drawEvaluationChart();
    });
}

function drawHoverPoint(idx) {
    const canvas = document.getElementById('analysisChart');
    if (!canvas || !chartCtx) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = 120;
    const evals = getChartEvals();
    if (evals.length < 2 || idx < -1) return;

    const stepX = width / (evals.length - 1);
    const i = idx + 1;
    const x = i * stepX;
    let val = evals[i];
    if(val==null)return;
    const normalizedVal = (val + 10) / 20;
    const y = height - (normalizedVal * (height - 24) + 12);

    chartCtx.beginPath();
    chartCtx.arc(x, y, 4, 0, Math.PI * 2);
    chartCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    chartCtx.fill();
}

function getWorstMoveSummaryText() {
    const reviews = analysisMoveReviews.filter(Boolean);
    if (!reviews.length) return 'Henüz tamamlanan hamle yok.';
    const worst = reviews.reduce((a,b)=>a.loss>b.loss?a:b);
    if (worst.loss < 0.05) return 'İncelenen hamlelerde belirgin değerlendirme kaybı yok.';
    return (worst.moveColor === 'w' ? 'Beyaz' : 'Siyah') + ' · ' + worst.moveNumber + '. ' + worst.moveSan +
        ' · ' + getMoveCategoryLabel(worst.category) + ' · değerlendirme kaybı ' + (worst.loss*100).toFixed(1)+' yüzde puan';
}

function updateReportSummaryText(text) {
    const el = document.getElementById('report-blunder');
    if (el) el.innerText = text || 'Kritik hata raporu analiz sonunda guncellenir.';
}

function applyCachedGameReview(payload) {
    if (!payload?.complete || !canRevealReport(payload.reviews||[],analysisHistory.length) || !validCachedReviewHistory(payload)) return false;
    analysisMoveReviews = payload.reviews; reportStatus='Analiz tamamlandı';
    updateReportSummaryText(payload.summaryText || getWorstMoveSummaryText());
    return true;
}
function validCachedReviewHistory(payload){
    if(!Array.isArray(payload?.reviews)||payload.reviews.length!==analysisHistory.length)return false;
    const replay=gameAt(0);
    for(let i=0;i<analysisHistory.length;i++){
        const r=payload.reviews[i];
        if(r&&(r.index!==i||r.playedUci!==uciOf(analysisHistory[i])||r.beforeFen!==replay.fen()))return false;
        replay.move(getAnalysisReplayMove(analysisHistory[i]));
    }
    return true;
}
function saveReviewCheckpoint(){
    if(currentAnalysisReportCacheKey&&analysisMoveReviews.some(Boolean))return writeCacheStore('reports',currentAnalysisReportCacheKey,{complete:false,reviews:Array.from(analysisMoveReviews,r=>r||null)});
}

function verifiedOpponentLoss(index){const r=analysisMoveReviews[index-1];return r?.verified&&r.complete&&r.stable!==false?r.loss:0;}
async function reviewMove(index, depth, token, fresh=false) {
    const game=gameAt(index), beforeFen=game.fen(), legalCount=game.moves().length;
    const move=analysisHistory[index], playedUci=uciOf(move);
    const tbPromise=tablebase(game);
    let result=await rootEvaluation(index,depth,token,undefined,fresh);
    if (!result) return null;
    const tb=await tbPromise;
    const globalResult=result;
    if(!result.topLines?.length)throw Error('Bu konumda yeterli motor verisi alınamadı. Analizi yeniden başlatabilirsin.');
    if (!result.topLines.some(l=>l.uci === playedUci) || (tb?.moves?.[0] && !result.topLines.some(l=>l.uci===tb.moves[0].uci))) {
        const candidates=[...new Set(result.topLines.map(l=>l.uci).concat(playedUci,tb?.moves?.[0]?.uci || []).filter(Boolean))];
        result=await rootEvaluation(index,depth,token,candidates,fresh);
        if (!result) return null;
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
    if (!game.move(getAnalysisReplayMove(move))) throw Error('Geçersiz maç hamlesi.');
    const terminal=terminalResult(game);
    if (terminal) played={...played,cp:terminal.mate === 0 ? null : 0,mate:terminal.mate === 0 ? 1 : null,wdl:terminal.mate === 0 ? [1000,0,0] : [0,1000,0]};
    if (best.uci === played.uci) best={...played};
    if (token !== analysisReviewToken) return null;
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
        previousOpponentLoss:verifiedOpponentLoss(index)});
    const bestGame=new Chess(beforeFen);tryApplyUciMove(bestGame,best.uci);
    return {index,moveNumber:Number(beforeFen.split(' ')[5]),moveSan:move.san,moveColor:move.color,
        loss,cpl,category,
        moveAccuracy,bestMove:best.uci,bestMoveSan:formatEngineMove(best.uci,beforeFen),
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
function refreshReviewReport() {
    if(getAnalysisViewElement().dataset.reviewState!=='ready')return;
    updateAccuracyRing('acc-white',calculateAccuracy(analysisMoveReviews.filter(r=>r?.moveColor==='w')));
    updateAccuracyRing('acc-black',calculateAccuracy(analysisMoveReviews.filter(r=>r?.moveColor==='b')));
    renderMoveList(); highlightMoveRow(); renderQualitySummary(); drawEvaluationChart();
    updateCoachFeedback(); refreshBestMoveButtonState(); renderAnalysisBoard();
    renderAnalysisInsights();renderLearning();
    const r=analysisMoveReviews[currentAnalysisIndex-1];
    if (r && !variation) {
        const mate=r.mateAfter==null?null:r.mateAfter*(analysisChess.turn()===r.moveColor?1:-1);
        const terminal=terminalResult(analysisChess);
        updateEvalBarUI(terminal?terminal.cp:r.cpAfter*(analysisChess.turn()==='w'?1:-1),terminal?terminal.mate:mate,analysisChess.fen());
    }
}
async function runDetailedGameReview(token,resume=false) {
    reviewBusy=true;setReviewGate('processing');
    try {
        openings=await loadOpenings();
        if(token!==analysisReviewToken)return;
        if(!resume)analysisMoveReviews=new Array(analysisHistory.length);
        reportStatus='Bütün hamleler inceleniyor';setReviewStage('scan',0,analysisHistory.length);
        for(let i=0;i<analysisHistory.length;i++) {
            if(!resume || !analysisMoveReviews[i]?.complete){
                const review=await reviewMove(i,SF_DEPTH_REVIEW,token);
                if(!review || token!==analysisReviewToken)return;
                analysisMoveReviews[i]=review;
            }
            reportStatus='Bütün hamleler inceleniyor · '+(i+1)+' / '+analysisHistory.length;
            setReviewStage('scan',i+1,analysisHistory.length);
            if((i+1)%4===0)await saveReviewCheckpoint();
        }
        const critical=analysisMoveReviews.filter(r=>(r.critical||!r.complete) && !(resume&&r.verified&&r.stable===true)).map(r=>r.index);
        setReviewStage('verify',0,critical.length);
        for(let n=0;n<critical.length;n++) {
            if(token!==analysisReviewToken)return;
            const index=critical[n],previous=analysisMoveReviews[index];
            const target=Math.min(28,previous.depth>=20?previous.depth+2:20);
            reportStatus='Kritik kararlar doğrulanıyor · '+(n+1)+' / '+critical.length;
            setReviewStage('verify',n,critical.length,previous.moveNumber+'. '+previous.moveSan+' daha derin karşılaştırılıyor.');
            let review=await reviewMove(index,target,token,resume && target<=previous.depth);
            if(!review || token!==analysisReviewToken)return;
            const shifted=!reviewIsStable(previous,review);
            const borderline=[0.02,0.05,0.1,0.2].some(t=>Math.abs(review.loss-t)<0.005);
            if(shifted||borderline){
                reportStatus='Karar tutarlılığı kontrol ediliyor';
                setReviewStage('verify',n,critical.length,review.moveNumber+'. '+review.moveSan+' için karar tutarlılığı kontrol ediliyor.');
                const confirmationDepth=Math.min(28,Math.max(target,review.depth)+2);
                if(confirmationDepth>review.depth){
                    const confirmed=await reviewMove(index,confirmationDepth,token);
                    if(!confirmed || token!==analysisReviewToken)return;
                    confirmed.stable=reviewIsStable(review,confirmed);review=confirmed;
                }else review.stable=false;
            }else review.stable=true;
            while(review.complete&&review.stable===false&&review.depth<28){
                const nextDepth=Math.min(28,Math.max(target,review.depth)+2);
                setReviewStage('verify',n,critical.length,review.moveNumber+'. '+review.moveSan+' için daha derin tutarlılık kontrolü · hedef '+nextDepth);
                const deeper=await reviewMove(index,nextDepth,token);
                if(!deeper||token!==analysisReviewToken)return;
                deeper.stable=reviewIsStable(review,deeper);review=deeper;
            }
            analysisMoveReviews[index]=review;setReviewStage('verify',n+1,critical.length);
            await saveReviewCheckpoint();
        }
        if(token!==analysisReviewToken)return;
        setReviewStage('finish',0,1);
        analysisMoveReviews.forEach((r,i)=>{
            r.category=classify({best:r.bestLine,played:r.playedLine,legalCount:r.legalCount,
                verified:r.verified&&r.stable!==false,sacrifice:r.sacrifice,routineCapture:r.routineCapture,book:!!r.opening,
                previousOpponentLoss:verifiedOpponentLoss(i)});
            r.motifTypes=[...new Set(tacticalSequence(Chess,r).filter(s=>s.color!==r.moveColor).flatMap(s=>s.motifs.map(m=>m.type)))];
        });
        const complete=canRevealReport(analysisMoveReviews,analysisHistory.length);
        reviewBusy=false;
        if(!complete){await saveReviewCheckpoint();reportStatus='Doğrulama henüz tamamlanmadı';setReviewGate('incomplete');return;}
        reportStatus='Analiz tamamlandı';setReviewStage('finish',1,1);setReviewGate('ready');
        updateReportSummaryText(getWorstMoveSummaryText());refreshReviewReport();
        bindBestMovePreviewButton();initChartEvents();drawEvaluationChart();
        if(currentAnalysisReportCacheKey)await writeCacheStore('reports',currentAnalysisReportCacheKey,{
            complete:true,reviews:analysisMoveReviews,
            whiteAccuracy:calculateAccuracy(analysisMoveReviews.filter(r=>r.moveColor==='w')),
            blackAccuracy:calculateAccuracy(analysisMoveReviews.filter(r=>r.moveColor==='b')),
            summaryText:getWorstMoveSummaryText()});
    }finally{if(token===analysisReviewToken){reviewBusy=false;if(getAnalysisViewElement().dataset.reviewState==='ready')renderAnalysisInsights();}}
}

function renderReviewDetails() {
    if(getAnalysisViewElement().dataset.reviewState!=='ready')return;
    const r=analysisMoveReviews[currentAnalysisIndex-1] || livePositionResult;
    const status=document.getElementById('reviewProgressText');
    if (!status) return;
    status.textContent=reportStatus;
    document.getElementById('reviewProgress').value=analysisHistory.length?100*analysisMoveReviews.filter(Boolean).length/analysisHistory.length:0;
    document.getElementById('reviewDepth').textContent=r ? 'Stockfish 18 · d'+r.depth+(r.verified && r.stable!==false?' · derin':r.complete && r.stable!==false?' · ilk inceleme':' · geçici') : 'Hamle seç';
    document.getElementById('reviewRetry').disabled=!analysisMoveReviews[currentAnalysisIndex-1] || reviewBusy;
    document.getElementById('reviewDeepen').disabled=!analysisMoveReviews[currentAnalysisIndex-1] || reviewBusy;
    document.getElementById('report-best').disabled=!!retryReview;
    if(retryReview)document.getElementById('report-best').textContent='Hamleni bul';
    document.getElementById('reviewOpening').textContent=r?.opening ? r.opening.eco+' · '+r.opening.name : '';
    const motifs=document.getElementById('reviewMotifs');
    if(motifs){motifs.replaceChildren();if(!retryReview){
        const sequence=tacticalSequence(Chess,r);
        for(const step of sequence.filter(s=>s.motifs.length).slice(0,4)){
            const chip=document.createElement('button');chip.className='secondary';chip.textContent=step.san+' · '+step.motifs.map(m=>m.text).join(', ');chip.onclick=()=>window.showReviewTactic('played',step.ply);motifs.append(chip);
        }
    }}
    document.getElementById('reviewPracticeHint').hidden=!retryReview;
    document.getElementById('reviewTacticControls').hidden=!!retryReview||!r?.complete||r.stable===false;
    const focusNumber=document.getElementById('reviewFocusNumber');
    if(focusNumber)focusNumber.textContent=r?.moveSan?`${r.moveNumber}${r.moveColor==='b'?'…':'.'} ${r.moveSan}`:'Konum incelemesi';
    const evidence=document.getElementById('reviewEvidence');
    if(evidence) {
        const score=line=>line?.mate!=null?((whiteScore(line,r.beforeFen)>=0?'+':'−')+'M'+Math.abs(line.mate)):
            Number.isFinite(line?.cp)?((whiteScore(line,r.beforeFen)>0?'+':'')+(whiteScore(line,r.beforeFen)/100).toFixed(2)):'—';
        evidence.textContent=r?.bestLine&&!retryReview ? 'Beyaz açısından · En iyi '+score(r.bestLine)+' · Oynanan '+score(r.playedLine)+
            ' · Hamle doğruluğu %'+r.moveAccuracy.toFixed(1)+' · '+Number(r.nodes||0).toLocaleString('tr-TR')+' düğüm'+
            ' · Tam arama d'+(r.fullRootDepth||r.depth)+' / karşılaştırma d'+(r.comparisonDepth||r.depth) : '';
        if(r?.bestLine){
            const chip=document.getElementById('report-eval-display');chip.textContent=retryReview?'—':score(r.bestLine);
            chip.style.color=whiteScore(r.bestLine,r.beforeFen)>=0?'#b8da84':'#ed8980';
        }
    }
    const el=document.getElementById('reviewLines');el.replaceChildren();
    if (retryReview) { el.textContent='En güçlü hamleyi tahtada bul. Yanıtı görmek için Maça dön.'; return; }
    if (!r) {el.textContent='Motor sonuçları hesaplandıkça burada görünecek.';return;}
    for (const line of r.lines || []) {
        const row=document.createElement('div');row.className='review-pv';
        const score=document.createElement('strong');
        const white=whiteScore(line,r.beforeFen);
        score.textContent=line.mate!=null ? (white>=0?'+':'−')+'M'+Math.abs(line.mate) : (white>0?'+':'')+(white/100).toFixed(2);
        score.title='Beyaz açısından değerlendirme';row.append(score);
        const moves=document.createElement('div');
        pvMoves(Chess,r.beforeFen,line.pv).slice(0,12).forEach((move,n)=>{
            const button=document.createElement('button');button.className='review-pv-move';
            button.textContent=(move.turn==='w'?move.number+'. ':n===0?move.number+'… ':'')+move.san;
            button.title='Bu konumu tahtada göster';
            button.onclick=()=>startVariation(r.index,line.pv.slice(0,n+1));
            moves.append(button);
        });row.append(moves);el.append(row);
    }
}
function renderLearning(){
    renderLearningUI({id:currentAnalysisReportCacheKey,pgn:currentSharedAnalysisPayload?.pgn||'',players:analysisPlayers||[],reviews:analysisMoveReviews.filter(Boolean),insights:reviewInsights(analysisMoveReviews,analysisHistory.length),providedClocks:analysisClockHistory,openTraining:async(record,item)=>{
        await window.openAnalysis(record.pgn,record.players);if(getAnalysisViewElement().dataset.reviewState!=='ready'||item.index>=analysisMoveReviews.length)return false;window.jumpToMove(item.index+1);window.setAnalysisMobileTab('focus');window.retryAnalysisMove();return true;
    }});
}
function showVariationStatus(text) { const el=document.getElementById('variationStatus');if(el)el.textContent=text; }
window.stopReviewTactic=function(){clearInterval(tacticTimer);tacticTimer=null;};
function drawTacticStep(){
    if(!tacticPlayback)return;
    const {review,steps,step,kind}=tacticPlayback;
    const moves=steps.slice(0,step+1).map(s=>s.uci),game=gameAt(review.index);
    for(const u of moves)tryApplyUciMove(game,u);
    variationRequest++;variation={game,index:review.index,moves,selected:null};
    drawAnalysisBoardFromFen(game.fen(),moves.at(-1));
    const chip=document.getElementById('report-eval-display'),chipText=chip.textContent,end=terminalResult(game);
    if(end)updateEvalBarUI(end.cp,end.mate,game.fen());else updateEvalBarFallback(game.fen());
    chip.textContent=chipText;
    const item=steps[step],board=document.getElementById('analysisBoard');
    if(item){
        const flip=board.classList.contains('flipped'),point=s=>{
            let x=s.charCodeAt(0)-97,y=8-Number(s[1]);if(flip){x=7-x;y=7-y;}return [(x+.5)*12.5,(y+.5)*12.5];
        };
        const arrows=item.motifs.flatMap(m=>m.arrows||[]);if(!arrows.length)arrows.push([item.from,item.to]);
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('review-tactic-overlay');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('aria-hidden','true');
        svg.innerHTML='<defs><marker id="reviewTacticArrow" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0 0L4 2L0 4Z" fill="#ffca68"/></marker></defs>'+arrows.map(([a,b])=>{const [x,y]=point(a),[tx,ty]=point(b);return `<line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="#ffca68" stroke-width="1.6" opacity=".85" marker-end="url(#reviewTacticArrow)"/>`;}).join('');board.append(svg);
    }
    const label=document.getElementById('reviewTacticStatus');if(label)label.textContent=(kind==='best'?'En iyi devam':'Oynanan hamlenin devamı')+' · '+(step+1)+' / '+steps.length+(item?' · '+item.san+(item.motifs.length?' · '+item.motifs.map(m=>m.text).join(', '):''):' · başlangıç');
    showVariationStatus('Stockfish devamı gösteriliyor. Bu, gerçek maçta oynanan sonraki hamleler olmayabilir.');
}
window.showReviewTactic=function(kind='played',ply=0){
    if(retryReview||reviewBusy)return;window.stopReviewTactic();
    const review=analysisMoveReviews[currentAnalysisIndex-1],steps=tacticalSequence(Chess,review,kind);if(!steps.length)return;
    liveEvalRequestId++;variationRequest++;reviewEngine.cancel(t=>['live','variation'].includes(t.mode));
    tacticPlayback={review,steps,step:Math.min(ply,steps.length-1),kind};drawTacticStep();
};
window.playReviewTactic=function(kind='played'){
    window.showReviewTactic(kind);if(!tacticPlayback)return;
    tacticTimer=setInterval(()=>{if(!tacticPlayback||tacticPlayback.step>=tacticPlayback.steps.length-1){window.stopReviewTactic();return;}tacticPlayback.step++;drawTacticStep();},1300);
};
window.stepReviewTactic=function(delta){window.stopReviewTactic();if(!tacticPlayback)return;tacticPlayback.step=clamp(tacticPlayback.step+delta,-1,tacticPlayback.steps.length-1);drawTacticStep();};
window.reviewPracticeHint=function(){
    const r=retryReview;if(!r)return;practiceHintLevel++;
    const names={p:'piyon',n:'at',b:'fil',r:'kale',q:'vezir',k:'şah'},piece=new Chess(r.beforeFen).get(r.bestMove.slice(0,2));
    const text=practiceHintLevel===1?'İpucu: '+names[piece?.type]+' hamlelerini düşün.':practiceHintLevel===2?'İpucu: '+r.bestMove.slice(0,2)+' karesindeki taşı incele.':'Hedef karesi: '+r.bestMove.slice(2,4)+'. Hamleyi tahtada uygula.';
    document.getElementById('coachFeedbackText').textContent=text;
};
function startVariation(index,moves=[]) {
    window.stopReviewTactic?.();tacticPlayback=null;
    bestPreviewToken++;liveEvalRequestId++;variationRequest++;
    const game=gameAt(index);
    const applied=[];
    for(const u of moves) { if (!tryApplyUciMove(game,u)) break;applied.push(u); }
    variation={game,index,moves:applied,selected:null};
    drawAnalysisBoardFromFen(game.fen(),applied.at(-1));
    showVariationStatus('Alternatif devam · '+(applied.length?applied.length+' yarım hamle':'hamleni tahtada oyna'));
    if (applied.length) evaluateVariation();
}
async function evaluateVariation() {
    if (!variation) return;
    const branch=variation, request=++variationRequest, game=branch.game;
    const end=terminalResult(game);
    if (end) { updateEvalBarUI(end.cp,end.mate,game.fen());showVariationStatus(game.in_checkmate()?'Şah mat.':'Berabere konum.');return; }
    const result=await queueStockfishEval(game.fen(),{mode:'variation',depth:18,multiPv:1,
        position:positionCommand(branch.index,branch.moves),timeoutMs:3500});
    if (request!==variationRequest || branch!==variation || result.cancelled) return;
    if (result.fallback) {showVariationStatus('Bu alternatif için motor verisi alınamadı.');return;}
    updateEvalBarUI(result.cp,result.mate,game.fen());
    const continuation=pvMoves(Chess,game.fen(),result.topLines[0]?.pv).slice(0,6).map(m=>m.san).join(' ');
    showVariationStatus('Alternatif · derinlik '+result.depth+' · önerilen devam: '+continuation);
}
window.returnToAnalysisGame=function() {
    window.stopReviewTactic();clearLearningAttempt();
    variationRequest++;variation=null;retryReview=null;tacticPlayback=null;document.querySelector('#analysisBoard .review-tactic-overlay')?.remove();
    reviewEngine.cancel(t=>t.mode==='variation');
    setAnalysisPosition(currentAnalysisIndex);renderAnalysisBoard();updateCoachFeedback();
    showVariationStatus('Tahtada bir taşa, ardından hedef kareye tıklayarak alternatif deneyebilirsin.');
    runStockfish();
};
window.undoAnalysisVariation=function() {
    if (!variation || !variation.moves.length) return;
    variation.game.undo();variation.moves.pop();variation.selected=null;variationRequest++;
    drawAnalysisBoardFromFen(variation.game.fen(),variation.moves.at(-1));evaluateVariation();
};
window.jumpToCriticalMove=function(direction) {
    const indices=analysisMoveReviews.filter(r=>r && r.loss>=0.05).map(r=>r.index+1);
    if (!indices.length) {showVariationStatus('İncelenen hamlelerde kritik kayıp yok.');return;}
    const target=direction>0 ? indices.find(i=>i>currentAnalysisIndex)??indices[0] : [...indices].reverse().find(i=>i<currentAnalysisIndex)??indices.at(-1);
    window.jumpToMove(target);
};
window.getAnalysisReportSnapshot=function() {
    return JSON.parse(JSON.stringify({version:REVIEW_VERSION,status:reportStatus,selectedIndex:currentAnalysisIndex,
        progress:{stage:loadingStage,done:loadingDone,total:loadingTotal,percent:loadingPercent,state:getAnalysisViewElement().dataset.reviewState},
        whiteAccuracy:calculateAccuracy(analysisMoveReviews.filter(r=>r?.moveColor==='w')),
        blackAccuracy:calculateAccuracy(analysisMoveReviews.filter(r=>r?.moveColor==='b')),
        reviews:analysisMoveReviews}));
};
window.downloadAnalysisData=function() {
    const blob=new Blob([JSON.stringify(window.getAnalysisReportSnapshot(),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='stockfish-mac-analizi.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.restartAnalysisReview=function() {
    if(currentSharedAnalysisPayload) window.openAnalysis(currentSharedAnalysisPayload.pgn,analysisPlayers,currentSharedAnalysisPayload.fen);
};
window.retryAnalysisMove=function() {
    const r=analysisMoveReviews[currentAnalysisIndex-1];if (!r || reviewBusy) return;
    retryReview=r;practiceHintLevel=0;tacticPlayback=null;startVariation(r.index);renderReviewDetails();
    document.getElementById('coachMoveQuality').textContent='Sıra sende';
    document.getElementById('coachFeedbackText').textContent='Bu konumda daha güçlü bir hamle bul. Taşı ve hedef kareyi seç.';
};
window.deepenAnalysisMove=async function() {
    const index=currentAnalysisIndex-1;if (index<0 || reviewBusy) return;
    const token=analysisReviewToken;reviewBusy=true;reportStatus='Seçili hamle derinleştiriliyor';renderReviewDetails();
    try {
        const previous=analysisMoveReviews[index];
        const target=Math.min(28,Math.max(22,(previous?.depth||18)+2));
        await initStockfish();const r=await reviewMove(index,target,token);
        if(r){r.stable=previous?reviewIsStable(previous,r):true;r.category=classify({best:r.bestLine,played:r.playedLine,legalCount:r.legalCount,verified:r.verified&&r.stable,sacrifice:r.sacrifice,routineCapture:r.routineCapture,book:!!r.opening,previousOpponentLoss:verifiedOpponentLoss(index)});}
        if (r && token===analysisReviewToken) {analysisMoveReviews[index]=r;reportStatus='Seçili hamle güncellendi';refreshReviewReport();}
    } catch(e) {if(token===analysisReviewToken)showVariationStatus(e.message);}
    finally {if(token===analysisReviewToken){reviewBusy=false;renderReviewDetails();renderAnalysisInsights();}}
};
document.getElementById('analysisBoard')?.addEventListener('click',async function(event) {
    window.stopReviewTactic();tacticPlayback=null;
    const square=event.target.closest('[data-square]')?.dataset.square;if(!square)return;
    if (!variation) startVariation(currentAnalysisIndex);
    const branch=variation, game=branch.game, piece=game.get(square);
    if (!branch.selected || piece?.color===game.turn()) {
        if (piece?.color!==game.turn()) return;
        branch.selected=square;drawAnalysisBoardFromFen(game.fen());
        const legal=game.moves({square,verbose:true}).map(m=>m.to);
        document.querySelectorAll('#analysisBoard [data-square]').forEach(el=>{
            el.classList.toggle('review-selected',el.dataset.square===square);
            el.classList.toggle('review-legal',legal.includes(el.dataset.square));
        });return;
    }
    const move=game.move({from:branch.selected,to:square,promotion:document.getElementById('reviewPromotion').value});
    if(!move){showVariationStatus('Bu hamle yasal değil. İşaretli hedeflerden birini seç.');return;}
    const u=uciOf(move);branch.moves.push(u);branch.selected=null;
    drawAnalysisBoardFromFen(game.fen(),u);
    if(retryReview) {
        const r=retryReview;retryReview=null;
        showVariationStatus('Hamlen kontrol ediliyor…');
        const request=++variationRequest;
        const compared=await queueStockfishEval(r.beforeFen,{mode:'variation',depth:Math.max(20,r.depth),multiPv:2,
            position:positionCommand(r.index),searchmoves:[...new Set([r.bestMove,u])],timeoutMs:12000});
        if(request!==variationRequest || variation!==branch)return;
        const played=compared.topLines?.find(l=>l.uci===u),best=compared.topLines?.[0];
        const accepted=acceptTrainingMove(best,played,compared.complete);finishLearningAttempt(accepted);
        showVariationStatus(accepted==null?'Yeterli derinlik tamamlanmadı; antrenman sonucu kaydedilmedi.':accepted?
            'Motorun önceki tercihine yakın güçlü bir devam buldun. Derinlik '+compared.depth+(compared.complete?'.':' · geçici sonuç.'):
            'Karşılaştırmada daha güçlü seçenek: '+formatEngineMove(best.uci,r.beforeFen)+'. Derinlik '+compared.depth+(compared.complete?'.':' · geçici sonuç.'));
        refreshBestMoveButtonState();
        renderReviewDetails();renderLearning();
    } else evaluateVariation();
});
document.addEventListener('keydown',event=>{
    if (window.currentViewId!=='view-2v2-analysis' || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
    if(getAnalysisViewElement()?.dataset.reviewState!=='ready')return;
    const square=event.target.closest('#analysisBoard [data-square]');
    if(square){
        const squares=[...document.querySelectorAll('#analysisBoard [data-square]')],index=squares.indexOf(square);
        const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-8,ArrowDown:8};
        if(event.key in offsets){event.preventDefault();event.stopPropagation();const next=squares[clamp(index+offsets[event.key],0,63)];square.tabIndex=-1;next.tabIndex=0;next.focus();return;}
        if(event.key==='Enter'||event.key===' '){event.preventDefault();square.click();return;}
    }
    const actions={ArrowLeft:'prev',ArrowRight:'next',Home:'start',End:'end'};
    if(actions[event.key]){event.preventDefault();window.navAnalysis(actions[event.key]);}
    if(event.key==='Escape')window.returnToAnalysisGame();
});

window.openAnalysis = async function(pgn, players=[], fallbackFen, metadata={}) {
    const incoming=new Chess();let accepted=false;
    try{accepted=typeof pgn==='string' && pgn.trim()?incoming.load_pgn(pgn.trim()):!!fallbackFen && validPosition(Chess,fallbackFen);}catch{}
    if(accepted && incoming.header()?.SetUp==='1')accepted=validPosition(Chess,incoming.header().FEN);
    if(accepted && typeof pgn==='string' && pgn.trim() && !incoming.history().length && incoming.header()?.SetUp!=='1')accepted=false;
    if(!accepted){window.showToast('PGN veya başlangıç konumu geçersiz. Mevcut analiz korunuyor.','error');return;}
    const headers=incoming.header();
    if(!Array.isArray(players) || !players.length)players=[{team:'white',name:headers.White||'Beyaz'},{team:'black',name:headers.Black||'Siyah'}];
    clearLearningAttempt();window.cancelAnalysisReview();
    document.getElementById('reviewLearning').replaceChildren();
    showLoadingOverlay(true);
    window.switchView('view-2v2-analysis');
    window.setAnalysisMobileTab('review');
    window.toggleAnalysisMovesPanel(false);
    bestPreviewToken++;
    analysisReviewToken++;
    reportStatus = 'İlk inceleme'; variation=null; variationRequest++; retryReview=null;
    const thisReviewToken = analysisReviewToken;

    analysisMoveReviews = [];livePositionResult=null;
    analysisMoveFilter='all';document.getElementById('reviewMoveFilter').value='all';
    updateAccuracyRing('acc-white',null);updateAccuracyRing('acc-black',null);
    analysisPlayers = Array.isArray(players)?players:[];
    analysisClockHistory=Array.isArray(metadata.clockHistory)?metadata.clockHistory:[];tacticPlayback=null;practiceHintLevel=0;
    currentSharedAnalysisPayload = {
        shareId: null,
        pgn: typeof pgn === 'string' ? pgn : '',
        players: Array.isArray(players) ? players : [],
        fen: fallbackFen || null
    };
    currentAnalysisReportCacheKey = buildReportCacheKey(pgn || '', fallbackFen || '');
    liveEvalRequestId++;
    liveBestMoveUci = null;
    liveBestMoveFen = null;

    const whiteName = players && players.find(function(p) { return p.team === 'white'; })?.name || 'Beyaz';
    const blackName = players && players.find(function(p) { return p.team === 'black'; })?.name || 'Siyah';
    const whiteNameEl = document.getElementById('an-white-player');
    const blackNameEl = document.getElementById('an-black-player');
    const playersLabelEl = document.getElementById('analysisPlayersLabel');
    const whiteSummaryNameEl = document.getElementById('analysisWhiteSummaryName');
    const blackSummaryNameEl = document.getElementById('analysisBlackSummaryName');
    if (whiteNameEl) whiteNameEl.innerText = whiteName;
    if (blackNameEl) blackNameEl.innerText = blackName;
    if (playersLabelEl) playersLabelEl.innerText = whiteName + ' vs ' + blackName;
    if (whiteSummaryNameEl) whiteSummaryNameEl.innerText = whiteName;
    if (blackSummaryNameEl) blackSummaryNameEl.innerText = blackName;

    setStockfishStatus('loading');
    setBestMoveButton('Motor Yükleniyor...', null, null);

    analysisChess = new Chess();
    analysisBaseFen = null;
    analysisHistory = [];

    let pgnLoaded = false;
    try {
        if (typeof pgn === 'string' && pgn.trim()) {
            pgnLoaded = analysisChess.load_pgn(pgn.trim());
        }
    } catch (e) {
        pgnLoaded = false;
    }

    if (!pgnLoaded && fallbackFen) {
        try {
            pgnLoaded = validPosition(Chess,fallbackFen) && analysisChess.load(fallbackFen);
            analysisBaseFen = fallbackFen;
        } catch (e) {
            pgnLoaded = false;
        }
    }

    if (!pgnLoaded) { window.showToast('PGN veya başlangıç konumu geçersiz.', 'error'); return; }

    if (pgnLoaded && !analysisBaseFen) {
        try {
            const analysisHeaders = analysisChess.header ? analysisChess.header() : null;
            if (analysisHeaders && analysisHeaders.SetUp === '1' && analysisHeaders.FEN) {
                analysisBaseFen = analysisHeaders.FEN;
            }
        } catch (e) {}
    }

    if (analysisBaseFen && !validPosition(Chess,analysisBaseFen)) {window.showToast('Başlangıç konumu geçersiz.', 'error');return;}
    analysisHistory = (pgnLoaded && typeof pgn === 'string' && pgn.trim())
        ? analysisChess.history({ verbose: true })
        : [];

    if (analysisHistory.length === 0 && analysisBaseFen) {
        try { await initStockfish();if(thisReviewToken!==analysisReviewToken)return;
            setReviewGate('ready');
            setAnalysisPosition(0);renderAnalysisBoard();renderMoveList();reportStatus='Tek konum incelemesi';updateReportSummaryText('Maç geçmişi yok; yalnızca konum inceleniyor.');document.getElementById('report-result').textContent='Konum incelemesi';document.getElementById('analysisResultPill').textContent='Konum';
            document.getElementById('analysisResultBadge').textContent='Konum incelemesi';updateCoachFeedback();renderAnalysisInsights();runStockfish();
        } catch(e){window.showToast(e.message,'error');}return;
    }
    if (analysisHistory.length === 0) {
        window.showToast('Analiz edilecek hamle bulunamadı.', 'error');
        return;
    }

    const moveCountEl = document.getElementById('analysisMoveCount');
    const moveCountBadgeEl = document.getElementById('analysisMoveCountBadge');
    if (moveCountEl) moveCountEl.innerText = String(analysisHistory.length);
    if (moveCountBadgeEl) moveCountBadgeEl.innerText = analysisHistory.length + ' hamle';

    showLoadingOverlay(true, analysisHistory.length);

    try {
        await Promise.all([initStockfish(),loadOpenings()]);
    } catch (e) {
        window.showToast('Stockfish yüklenemedi, analiz başlatılamıyor.', 'error');
        if(thisReviewToken===analysisReviewToken){setReviewGate('error');document.getElementById('analysisLoadingMessage').textContent=e.message;}
        return;
    }

    if(thisReviewToken!==analysisReviewToken)return;
    if (reviewEngine.ready) setStockfishStatus('active');
    else setStockfishStatus('fallback');

    if(thisReviewToken!==analysisReviewToken)return;
    let resultText = 'Devam Ediyor';
    const pgnResult=analysisChess.header()?.Result || pgn?.trim().match(/(1-0|0-1|1\/2-1\/2|\*)$/)?.[1];
    if (analysisChess.in_checkmate()) {
        resultText = analysisChess.turn() === 'w' ? 'Siyah Kazandı' : 'Beyaz Kazandı';
    } else if (analysisChess.in_draw()) {
        resultText = 'Berabere';
    } else if (pgnResult === '1-0') {
        resultText = whiteName + ' kazandı (1-0)';
    } else if (pgnResult === '0-1') {
        resultText = blackName + ' kazandı (0-1)';
    } else if (pgnResult === '1/2-1/2') {
        resultText = 'Berabere (1/2-1/2)';
    }

    const reportResultEl = document.getElementById('report-result');
    const resultPillEl = document.getElementById('analysisResultPill');
    const resultBadgeEl = document.getElementById('analysisResultBadge');
    if (reportResultEl) reportResultEl.innerText = resultText;
    if (resultPillEl) resultPillEl.innerText = resultText;
    if (resultBadgeEl) resultBadgeEl.innerText = resultText;
    updateReportSummaryText('Kritik hata raporu analiz sonunda guncellenir.');

    document.getElementById('acc-white').innerText = '--';
    document.getElementById('acc-black').innerText = '--';
    // Update coach with initial status
    const coachTextInit = document.getElementById('coachFeedbackText');
    if (coachTextInit) coachTextInit.innerText = 'Analiz hazırlanıyor...';

    renderQualitySummary();
    renderAnalysisInsights();
    setAnalysisPosition(analysisHistory.length);
    renderAnalysisBoard();
    renderMoveList();
    highlightMoveRow();
    refreshBestMoveButtonState();
    window.switchAnalysisTab('review');

    const cachedReport = await readCacheStore('reports', currentAnalysisReportCacheKey);
    if (thisReviewToken !== analysisReviewToken) return;
    if (applyCachedGameReview(cachedReport)) {
        setReviewStage('finish',1,1);setReviewGate('ready');refreshReviewReport();
        // Restore coach feedback from cached report
        if (typeof updateCoachFeedback === 'function') updateCoachFeedback();
        bindBestMovePreviewButton();
        initChartEvents();
        drawEvaluationChart();
        return;
    }

    try {
        const resume= !cachedReport?.complete && validCachedReviewHistory(cachedReport) && cachedReport.reviews.some(Boolean);
        if(resume)analysisMoveReviews=cachedReport.reviews;
        await runDetailedGameReview(thisReviewToken,!!resume);
    } catch (error) {
        if (thisReviewToken === analysisReviewToken) { reportStatus='Analiz tamamlanamadı';setReviewGate('error');document.getElementById('analysisLoadingMessage').textContent=error.message; }
    } finally {
        if (thisReviewToken === analysisReviewToken) {
            showLoadingOverlay(false);
        }
    }

};

window.openAnalysisFromEncodedGame = function(encodedGame) {
    try {
        const game = JSON.parse(decodeURIComponent(encodedGame));
        window.openAnalysis(game.pgn, game.players, game.fen || null,game);
    } catch (e) {
        console.error(e);
        window.showToast('Analiz yüklenirken hata oluştu.', 'error');
    }
};

window.navAnalysis = function(action) {
    bestPreviewToken++;
    let targetIndex = currentAnalysisIndex;
    if (action === 'start') targetIndex = 0;
    else if (action === 'prev') targetIndex = Math.max(0, currentAnalysisIndex - 1);
    else if (action === 'next') targetIndex = Math.min(analysisHistory.length, currentAnalysisIndex + 1);
    else if (action === 'end') targetIndex = analysisHistory.length;

    setAnalysisPosition(targetIndex);
    renderAnalysisBoard();
    highlightMoveRow();
    refreshBestMoveButtonState();
    runStockfish();
    drawEvaluationChart();
};

window.jumpToMove = function(index) {
    bestPreviewToken++;
    setAnalysisPosition(index);
    renderAnalysisBoard();
    highlightMoveRow();
    refreshBestMoveButtonState();
    runStockfish();
    drawEvaluationChart();
};

window.flipAnalysisBoard = function() {
    const boardEl = document.getElementById('analysisBoard');
    if (boardEl) boardEl.classList.toggle('flipped');
    renderAnalysisBoard();
};

function bindBestMovePreviewButton() {
    const btn = document.getElementById('report-best');
    if (!btn || btn.dataset.previewBound === '1') return;
    btn.dataset.previewBound = '1';
    btn.addEventListener('pointerup', function(e) {
        if (e.pointerType === 'touch') {
            e.preventDefault();
            window.previewBestVsPlayedMove();
        }
    });
}

window.previewBestVsPlayedMove = async function() {
    const ctx = getPreviewMoveContext();
    if (!ctx || !ctx.beforeFen || !ctx.bestUci) {
        window.showToast(
            getAnalysisLang() === 'en' ? 'Best-move preview is not ready for this position yet.' : 'Bu konum için en iyi hamle ön izlemesi henüz hazır değil.',
            'info'
        );
        return;
    }

    if (isPreviewingMove) return;
    isPreviewingMove = true;
    const token = ++bestPreviewToken;
    const originalFen = analysisChess.fen();
    const originalIndex = currentAnalysisIndex;

    const previewChess = new Chess();
    try {
        drawAnalysisBoardFromFen(ctx.beforeFen, null);
        await new Promise(function(r) { setTimeout(r, 240); });
        if (token !== bestPreviewToken) return;

        if (!tryApplyUciMove(previewChess, ctx.bestUci, ctx.beforeFen)) {
            window.showToast('En iyi hamle gösterilemedi.', 'error');
            return;
        }
        drawAnalysisBoardFromFen(previewChess.fen(), ctx.bestUci);
        updateBestMovePreviewBadge(true, false);
        await new Promise(function(r) { setTimeout(r, ctx.playedFen || ctx.playedUci || ctx.playedSan ? 1050 : 1450); });

        if (token !== bestPreviewToken) return;

        let playedShown = false;
        if (ctx.playedFen) {
            drawAnalysisBoardFromFen(ctx.playedFen, null);
            playedShown = true;
        } else {
            previewChess.load(ctx.beforeFen);
            if (ctx.playedUci && tryApplyUciMove(previewChess, ctx.playedUci)) {
                drawAnalysisBoardFromFen(previewChess.fen(), null);
                playedShown = true;
            } else {
                const played = previewChess.move(ctx.playedSan) || previewChess.move(ctx.playedSan, { sloppy: true });
                if (played) {
                    drawAnalysisBoardFromFen(previewChess.fen(), null);
                    playedShown = true;
                }
            }
        }

        if (playedShown) {
            updateBestMovePreviewBadge(false, true);
            await new Promise(function(r) { setTimeout(r, 1100); });
        }
    } catch (e) {
        console.error(e);
        window.showToast('Hamle önizlemesi başarısız.', 'error');
    } finally {
        isPreviewingMove = false;
        if (token !== bestPreviewToken) return;
        updateBestMovePreviewBadge(false, false);
        try {
            setAnalysisPosition(originalIndex);
        } catch (e) {
            setAnalysisPosition(originalIndex);
        }
        renderAnalysisBoard();
        highlightMoveRow();
        refreshBestMoveButtonState();
        runStockfish();
    }
};

window.switchAnalysisTab = function(tab) {
    window.setAnalysisMobileTab(tab === 'moves' ? 'moves' : 'review');
};

function getFirestoreApi() {
    if (!firestoreApiPromise) {
        firestoreApiPromise = import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    }
    return firestoreApiPromise;
}

function replaceUrlParams(paramsToDelete) {
    try {
        const url = new URL(window.location.href);
        paramsToDelete.forEach(function(key) { url.searchParams.delete(key); });
        const qs = url.searchParams.toString();
        window.history.replaceState({}, document.title, url.pathname + (qs ? ('?' + qs) : ''));
    } catch (e) {}
}

async function openSharedAnalysisById(shareId) {
    if (!shareId || !window.db) {
        window.showToast('Paylaşılan analiz bulunamadı.', 'error');
        return;
    }
    try {
        const { doc, getDoc } = await getFirestoreApi();
        const shareSnap = await getDoc(doc(window.db, 'analysis_shares', shareId));
        if (!shareSnap.exists()) {
            window.showToast('Paylaşılan analiz bulunamadı.', 'error');
            return;
        }
        const payload = shareSnap.data() || {};
        if (!payload.pgn) {
            window.showToast('Paylaşım verisi eksik.', 'error');
            return;
        }
        currentSharedAnalysisPayload = {
            shareId: shareId,
            pgn: payload.pgn || '',
            players: payload.players || [],
            fen: payload.fen || null
        };
        replaceUrlParams(['share']);
        window.openAnalysis(payload.pgn || '', payload.players || [], payload.fen || null);
    } catch (e) {
        console.error(e);
        window.showToast('Paylaşılan analiz açılamadı.', 'error');
    }
}

window.maybeOpenSharedAnalysisFromUrl = function() {
    const url = new URL(window.location.href);
    pendingSharedAnalysisId = pendingSharedAnalysisId || url.searchParams.get('share');
    if (pendingSharedAnalysisId) {
        const shareId = pendingSharedAnalysisId;
        pendingSharedAnalysisId = null;
        replaceUrlParams(['share']);
        openSharedAnalysisById(shareId);
        return true;
    }
    return false;
};

window.openSharedAnalysisById = openSharedAnalysisById;

window.shareCurrentAnalysisReport = async function() {
    if (!currentSharedAnalysisPayload || !currentSharedAnalysisPayload.pgn) {
        return window.showToast('Paylaşılacak analiz yok.', 'error');
    }
    if (!window.db) {
        return window.showToast('Veritabanı bağlantısı yok.', 'error');
    }
    if (window.throttleAction && !window.throttleAction('analysis_share', window.currentUser ? window.currentUser.uid : 'guest', 2, 30000)) {
        return window.showToast('Çok hızlı paylaşım yapıyorsun. Biraz bekle.', 'error');
    }

    const shareId = currentSharedAnalysisPayload.shareId || window.makeId(8);
    try {
        const { doc, setDoc, serverTimestamp } = await getFirestoreApi();
        await setDoc(doc(window.db, 'analysis_shares', shareId), {
            createdBy: window.currentUser ? window.currentUser.uid : null,
            createdAt: serverTimestamp(),
            createdAtMs: Date.now(),
            pgn: currentSharedAnalysisPayload.pgn || '',
            players: currentSharedAnalysisPayload.players || [],
            fen: currentSharedAnalysisPayload.fen || null
        }, { merge: true });
        currentSharedAnalysisPayload.shareId = shareId;

        const base = window.getAppBaseUrl ? window.getAppBaseUrl() : (window.location.origin + '/');
        const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'share=' + encodeURIComponent(shareId);

        if (navigator.share) {
            navigator.share({
                title: 'Satranç Maç Analizi',
                text: 'Maç analiz raporu',
                url: url
            }).catch(function() {});
        }
        await navigator.clipboard.writeText(url);
        window.showToast('Analiz linki kopyalandı: ' + url, 'success');
    } catch (e) {
        console.error(e);
        window.showToast('Analiz raporu paylaşılamadı.', 'error');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBestMovePreviewButton);
} else {
    bindBestMovePreviewButton();
}

window.initStockfish = initStockfish;
window.queueStockfishEval = queueStockfishEval;
window.warmAnalysisCacheForFen = warmAnalysisCacheForFen;
window.warmAnalysisCacheForGame = warmAnalysisCacheForGame;
window.drawEvaluationChart = drawEvaluationChart;
