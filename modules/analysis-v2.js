import {AnalysisEngine} from './analysis-engine.mjs?v=20260923d';
import {REVIEW_VERSION, whiteScore, classify, gameAccuracy, pvMoves, sacrificeEvidence, terminalResult, validPosition, uciOf, qualityScore, moveMetrics} from './analysis-core.mjs?v=20260923d';
import {loadOpenings, normalizedOpeningKey, tablebase, tableExpected, explanation} from './analysis-data.mjs?v=20260923d';
// modules/analysis-v2.js - Chess Game Analysis Engine (Chess.com-style review)

const SF_DEPTH_LIVE = 18;
const SF_DEPTH_REVIEW = 16;
const SF_MULTI_PV = 3;
const ANALYSIS_CACHE_VERSION = REVIEW_VERSION;
const ANALYSIS_CACHE_DB = 'grandmaster_analysis_cache_v1';
const ANALYSIS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 45;

const MOVE_CATEGORY_META = {
    brilliant: { tag: '!!', tr: 'Mükemmel Fedakar', en: 'Brilliant' },
    great: { tag: '!', tr: 'Kritik Hamle', en: 'Great' },
    best: { tag: '★', tr: 'En İyi', en: 'Best' },
    book: { tag: '📖', tr: 'Teori', en: 'Book' },
    excellent: { tag: '✓', tr: 'Harika', en: 'Excellent' },
    good: { tag: '✓', tr: 'İyi', en: 'Good' },
    inaccuracy: { tag: '?!', tr: 'Hassas Değil', en: 'Inaccuracy' },
    mistake: { tag: '?', tr: 'Hata', en: 'Mistake' },
    miss: { tag: '✕', tr: 'Kaçan Fırsat', en: 'Miss' },
    blunder: { tag: '??', tr: 'Büyük Hata', en: 'Blunder' },
    unrated: { tag: '…', tr: 'Yetersiz veri', en: 'Unrated' }
};


let currentSharedAnalysisPayload = null;
let pendingSharedAnalysisId = null;
let firestoreApiPromise = null;
let currentAnalysisReportCacheKey = null;

function getAnalysisLang() {
    return localStorage.getItem('gm_analysis_lang') === 'en' ? 'en' : 'tr';
}

function getMoveCategoryLabel(category) {
    const meta = MOVE_CATEGORY_META[category];
    if (!meta) return category;
    return getAnalysisLang() === 'en' ? meta.en : meta.tr;
}

function getMoveCategoryTag(category) {
    const meta = MOVE_CATEGORY_META[category];
    return meta ? meta.tag : '';
}

function getMoveCategoryIconClass(category) {
    const icons = {
        brilliant: 'fa-crown',
        great: 'fa-bolt',
        best: 'fa-star',
        book: 'fa-book',
        excellent: 'fa-thumbs-up',
        good: 'fa-check',
        inaccuracy: 'fa-triangle-exclamation',
        mistake: 'fa-circle-exclamation',
        miss: 'fa-bullseye',
        blunder: 'fa-xmark'
    };
    return icons[category] || 'fa-circle';
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
    quality.textContent = review ? getMoveCategoryLabel(review.category) : 'Konumu incele';
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

    const validTabs = ['review', 'moves'];
    const nextTab = validTabs.indexOf(tab) >= 0 ? tab : 'review';
    viewEl.dataset.mobileTab = nextTab;

    // Update mobile tab buttons
    const tabBtns = viewEl.querySelectorAll('.mob-tab-btn');
    tabBtns.forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.tab === nextTab);
    });

    // Show/hide sidebar blocks
    const reviewBlock = viewEl.querySelector('.block-review');
    const movesBlock = viewEl.querySelector('.block-moves');
    if (reviewBlock) reviewBlock.classList.toggle('active', nextTab === 'review');
    if (movesBlock) movesBlock.classList.toggle('active', nextTab === 'moves');
};

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
async function rootEvaluation(index, depth, token, searchmoves) {
    if (token !== analysisReviewToken) return null;
    const game = gameAt(index), fen=game.fen(), position=positionCommand(index);
    const key = buildEvalCacheKey(position + '|moves:' + (searchmoves || []).join(','),depth);
    const cached = await readCacheStore('evals',key);
    if (token !== analysisReviewToken) return null;
    if (cached?.complete && cached.depth >= depth) return cached;
    const result = await queueStockfishEval(fen,{mode:'review', depth, position, searchmoves,
        multiPv:searchmoves ? searchmoves.length : SF_MULTI_PV, requestId:token,
        timeoutMs:depth >= 24 ? 18000 : depth >= 22 ? 12000 : depth >= 20 ? 8000 : 3000});
    if (token !== analysisReviewToken || result.cancelled) return null;
    if (result.fallback || result.depth < 8) throw Error('Yeterli motor verisi alınamadı. Yeniden deneyin.');
    if (result.complete) await writeCacheStore('evals',key,result);
    return result;
}
window.cancelAnalysisReview = function() {
    analysisReviewToken++; liveEvalRequestId++; bestPreviewToken++; variationRequest++;
    reviewBusy=false; variation=null; retryReview=null;
    reviewEngine.cancel(t=>['review','live','variation'].includes(t.mode));
    showLoadingOverlay(false);
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
    const order = ['brilliant', 'great', 'best', 'book', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];

    const catColors = {
        brilliant: '#2dd4bf', great: '#38bdf8', best: '#10b981', book: '#d4af37',
        excellent: '#4ade80', good: '#a3e635', inaccuracy: '#facc15',
        mistake: '#f97316', miss: '#ef4444', blunder: '#dc2626'
    };

    container.innerHTML = order.map(function(cat) {
        const total = (white[cat] || 0) + (black[cat] || 0);
        if (total === 0) return '';
        return '<div class="quality-row ' + cat + '">' +
            '<span class="quality-icon-label" style="color:' + (catColors[cat] || '#fff') + '">' +
            '<i class="fas ' + getMoveCategoryIconClass(cat) + '"></i> ' +
            getMoveCategoryLabel(cat) + '</span>' +
            '<span class="q-val" style="color:' + (catColors[cat] || '#fff') + '">' + (white[cat] || 0) + ' / ' + (black[cat] || 0) + '</span>' +
            '</div>';
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
    const provisional=scored.some(r=>!r.complete || r.stable===false) || reviewBusy;
    el.innerText = value == null ? '—' : (provisional?'≈':'')+value + '%';
    el.title=scored.length+' hamle üzerinden hesaplandı.'+(provisional?' İnceleme sürüyor veya geçici kararlar var.':'');
    const name=el.closest('.acc-player')?.querySelector('.acc-name');
    if(name)name.textContent=(side==='w'?'Beyaz':'Siyah')+' Doğruluk · '+scored.length+' hamle';
    el.style.color = color;
    
    const ringWrap = document.getElementById(id + '-ring');
    if (ringWrap) {
        ringWrap.style.setProperty('--val', (value * 3.6) + 'deg');
        ringWrap.style.background = `conic-gradient(${color} var(--val), rgba(255,255,255,0.1) 0deg)`;
        ringWrap.style.boxShadow = `0 0 20px ${color}33`;
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
            div.setAttribute('aria-label',squareName);

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
    overlay.style.display = show ? 'flex' : 'none';
    if (show) updateLoadingProgress(0, totalMoves || 1);
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
    if (evalDisplay) {
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
            div.setAttribute('aria-label',squareName);

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
                    badge.innerText = getMoveCategoryTag(currentReview.category);
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
            tag.textContent = getMoveCategoryTag(review.category);
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
    });
}
function highlightMoveRow() {
    document.querySelectorAll('#analysisMoveList .move-san').forEach(el=>{
        const selected=Number(el.dataset.moveIndex)===currentAnalysisIndex;
        el.classList.toggle('active',selected);el.setAttribute('aria-current',selected?'step':'false');
        el.parentElement.classList.toggle('active',!!el.parentElement.querySelector('.move-san.active'));
    });
}

function getChartEvals() {
    const evals = [];
    if (!analysisMoveReviews.length) return evals;

    const first = analysisMoveReviews[0];
    let initial = first ? (first.cpBefore || 0) / 100 : 0;
    if (first && Math.abs(first.cpBefore || 0) >= 9000) {
        initial = first.cpBefore > 0 ? 10 : -10;
    }
    evals.push(clamp(initial, -10, 10));

    analysisMoveReviews.filter(Boolean).forEach(function(review) {
        let val = (review.cpAfter || 0) / 100;
        if (Math.abs(review.cpAfter || 0) >= 9000) {
            val = review.cpAfter > 0 ? 10 : -10;
        }
        evals.push(clamp(val, -10, 10));
    });

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
        const x = i * stepX;
        const normalizedVal = (evals[i] + 10) / 20;
        const y = height - (normalizedVal * (height - 24) + 12);
        points.push({ x: x, y: y, index: i - 1 });
    }

    const gradient = chartCtx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#0ea5e9');
    gradient.addColorStop(0.5, '#d4af37');
    gradient.addColorStop(1, '#a855f7');

    chartCtx.beginPath();
    chartCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        chartCtx.lineTo(points[i].x, points[i].y);
    }
    chartCtx.strokeStyle = gradient;
    chartCtx.lineWidth = 3;
    chartCtx.shadowColor = 'rgba(212, 175, 55, 0.2)';
    chartCtx.shadowBlur = 6;
    chartCtx.stroke();
    chartCtx.shadowBlur = 0;

    const activePointIdx = currentAnalysisIndex;
    if (points[activePointIdx]) {
        const pt = points[activePointIdx];
        chartCtx.beginPath();
        chartCtx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        chartCtx.fillStyle = 'var(--primary)';
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
    if (!payload || !payload.complete || !Array.isArray(payload.reviews) || payload.reviews.length !== analysisHistory.length) return false;
    analysisMoveReviews = payload.reviews; reportStatus='Analiz tamamlandı';
    updateAccuracyRing('acc-white', payload.whiteAccuracy);
    updateAccuracyRing('acc-black', payload.blackAccuracy);
    renderMoveList();
    highlightMoveRow();
    renderQualitySummary();
    updateReportSummaryText(payload.summaryText || getWorstMoveSummaryText());
    refreshBestMoveButtonState();
    drawEvaluationChart();
    if (typeof updateCoachFeedback === 'function') updateCoachFeedback();
    return true;
}

async function reviewMove(index, depth, token) {
    const game=gameAt(index), beforeFen=game.fen(), legalCount=game.moves().length;
    const move=analysisHistory[index], playedUci=uciOf(move);
    const tb=await tablebase(gameAt(index));
    let result=await rootEvaluation(index,depth,token);
    if (!result) return null;
    if (!result.topLines.some(l=>l.uci === playedUci) || (tb?.moves?.[0] && !result.topLines.some(l=>l.uci===tb.moves[0].uci))) {
        const candidates=[...new Set(result.topLines.map(l=>l.uci).concat(playedUci,tb?.moves?.[0]?.uci || []).filter(Boolean))];
        result=await rootEvaluation(index,depth,token,candidates);
        if (!result) return null;
    }
    const lines=result.topLines;
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
    const second=lines.find(l=>l.uci !== best.uci);
    best.alternativeExpected=second?qualityScore(second):null;
    best.unique=legalCount>1 && !!second && qualityScore(best)-qualityScore(second)>=0.15;
    const verified=result.complete && depth>=20;
    const sacrifice=verified && sacrificeEvidence(Chess,beforeFen,played);
    const opening=openings?.[normalizedOpeningKey(game)] || null;
    const pieceValue={p:100,n:320,b:330,r:500,q:900,k:20000};
    const routineCapture=!!move.captured && pieceValue[move.captured]>=pieceValue[move.piece];
    const category=classify({best,played,legalCount,verified,sacrifice,routineCapture,book:!!opening,
        previousOpponentLoss:analysisMoveReviews[index-1]?.loss || 0});
    const bestGame=new Chess(beforeFen);tryApplyUciMove(bestGame,best.uci);
    return {index,moveNumber:Number(beforeFen.split(' ')[5]),moveSan:move.san,moveColor:move.color,
        loss,cpl,category,
        moveAccuracy,bestMove:best.uci,bestMoveSan:formatEngineMove(best.uci,beforeFen),
        beforeFen,playedFen:game.fen(),bestFen:bestGame.fen(),playedUci,
        cpBefore:whiteScore(best,beforeFen),cpAfter:whiteScore(played,beforeFen),
        mateBefore:best.mate,mateAfter:played.mate,bestPv:best.pv,playedPv:played.pv,
        lines,depth:result.depth,nodes:result.nodes || 0,source:result.source,verified,
        complete:result.complete,tablebase:tbUsed,opening,
        expectedBest:metrics.expectedBest,expectedPlayed:metrics.expectedPlayed,
        bestLine:best,playedLine:played,legalCount,sacrifice,routineCapture,requestedDepth:depth,
        engineWdlBest:best.wdl,engineWdlPlayed:played.wdl,tablebaseCategory:tbMove?.category || null,
        critical:loss>=0.035 || best.mate!=null || played.mate!=null || best.unique ||
            sacrificeEvidence(Chess,beforeFen,played) || [0.02,0.05,0.1,0.2].some(t=>Math.abs(loss-t)<0.008)};
}
function refreshReviewReport() {
    updateAccuracyRing('acc-white',calculateAccuracy(analysisMoveReviews.filter(r=>r?.moveColor==='w')));
    updateAccuracyRing('acc-black',calculateAccuracy(analysisMoveReviews.filter(r=>r?.moveColor==='b')));
    renderMoveList(); highlightMoveRow(); renderQualitySummary(); drawEvaluationChart();
    updateCoachFeedback(); refreshBestMoveButtonState(); renderAnalysisBoard();
    const r=analysisMoveReviews[currentAnalysisIndex-1];
    if (r && !variation) {
        const mate=r.mateAfter==null?null:r.mateAfter*(analysisChess.turn()===r.moveColor?1:-1);
        const terminal=terminalResult(analysisChess);
        updateEvalBarUI(terminal?terminal.cp:r.cpAfter*(analysisChess.turn()==='w'?1:-1),terminal?terminal.mate:mate,analysisChess.fen());
    }
}
async function runDetailedGameReview(token) {
    reviewBusy=true;
    try {
        openings=await loadOpenings();
        if (token!==analysisReviewToken) return;
        analysisMoveReviews=new Array(analysisHistory.length);
        showLoadingOverlay(false);
        reportStatus='İlk inceleme';
        for(let i=0;i<analysisHistory.length;i++) {
            const review=await reviewMove(i,SF_DEPTH_REVIEW,token);
            if (!review || token!==analysisReviewToken) return;
            analysisMoveReviews[i]=review;
            reportStatus='İlk inceleme · '+(i+1)+' / '+analysisHistory.length;
            refreshReviewReport();
        }
        const critical=analysisMoveReviews.filter(r=>r.critical || !r.complete).map(r=>r.index);
        for(let n=0;n<critical.length;n++) {
            if (token!==analysisReviewToken) return;
            reportStatus='Kritik konumlar derinleştiriliyor · '+(n+1)+' / '+critical.length;
            renderReviewDetails();
            let review=await reviewMove(critical[n],20,token);
            if (review && token===analysisReviewToken) {
                const previous=analysisMoveReviews[critical[n]];
                const shifted=Math.abs(previous.loss-review.loss)>0.025;
                const borderline=[0.02,0.05,0.1,0.2].some(t=>Math.abs(review.loss-t)<0.005);
                if(shifted || borderline) {
                    reportStatus='Karar doğrulanıyor · '+review.moveNumber+'. '+review.moveSan;
                    renderReviewDetails();
                    const confirmed=await reviewMove(critical[n],22,token);
                    if(confirmed){confirmed.stable=Math.abs(confirmed.loss-review.loss)<=0.025;review=confirmed;}
                } else review.stable=true;
            }
            if (!review || token!==analysisReviewToken) return;
            analysisMoveReviews[critical[n]]=review;
            refreshReviewReport();
        }
        if (token!==analysisReviewToken) return;
        // Later refinements can alter whether the previous opponent move was a miss.
        analysisMoveReviews.forEach((r,i)=>{
            r.category=classify({best:r.bestLine,played:r.playedLine,legalCount:r.legalCount,
                verified:r.verified && r.stable!==false,sacrifice:r.sacrifice,routineCapture:r.routineCapture,book:!!r.opening,
                previousOpponentLoss:analysisMoveReviews[i-1]?.loss || 0});
        });
        const complete=analysisMoveReviews.every(r=>r?.complete && r.stable!==false);
        reportStatus=complete?'Analiz tamamlandı':'İnceleme tamamlandı · bazı kararlar geçici';
        updateReportSummaryText(getWorstMoveSummaryText());
        refreshReviewReport();
        if (complete && currentAnalysisReportCacheKey) await writeCacheStore('reports',currentAnalysisReportCacheKey,{
            complete:true,reviews:analysisMoveReviews,
            whiteAccuracy:calculateAccuracy(analysisMoveReviews.filter(r=>r.moveColor==='w')),
            blackAccuracy:calculateAccuracy(analysisMoveReviews.filter(r=>r.moveColor==='b')),
            summaryText:getWorstMoveSummaryText()});
    } finally { if (token===analysisReviewToken) {reviewBusy=false;updateAccuracyRing('acc-white',calculateAccuracy(analysisMoveReviews.filter(r=>r?.moveColor==='w')));updateAccuracyRing('acc-black',calculateAccuracy(analysisMoveReviews.filter(r=>r?.moveColor==='b')));renderReviewDetails();} }
}

function renderReviewDetails() {
    const r=analysisMoveReviews[currentAnalysisIndex-1] || livePositionResult;
    const status=document.getElementById('reviewProgressText');
    if (!status) return;
    status.textContent=reportStatus;
    document.getElementById('reviewProgress').value=analysisHistory.length?100*analysisMoveReviews.filter(Boolean).length/analysisHistory.length:0;
    document.getElementById('reviewDepth').textContent=r ? 'Stockfish 18 · d'+r.depth+(r.verified && r.stable!==false?' · derin':r.complete && r.stable!==false?' · ilk inceleme':' · geçici') : 'Hamle seç';
    document.getElementById('reviewRetry').disabled=!analysisMoveReviews[currentAnalysisIndex-1] || reviewBusy;
    document.getElementById('reviewDeepen').disabled=!analysisMoveReviews[currentAnalysisIndex-1] || reviewBusy;
    document.getElementById('reviewOpening').textContent=r?.opening ? r.opening.eco+' · '+r.opening.name : '';
    const evidence=document.getElementById('reviewEvidence');
    if(evidence) {
        const score=line=>line?.mate!=null?((whiteScore(line,r.beforeFen)>=0?'+':'−')+'M'+Math.abs(line.mate)):
            Number.isFinite(line?.cp)?((whiteScore(line,r.beforeFen)>0?'+':'')+(whiteScore(line,r.beforeFen)/100).toFixed(2)):'—';
        evidence.textContent=r?.bestLine&&!retryReview ? 'Beyaz açısından · En iyi '+score(r.bestLine)+' · Oynanan '+score(r.playedLine)+
            ' · Hamle doğruluğu %'+r.moveAccuracy.toFixed(1)+' · '+Number(r.nodes||0).toLocaleString('tr-TR')+' düğüm' : '';
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
function showVariationStatus(text) { const el=document.getElementById('variationStatus');if(el)el.textContent=text; }
function startVariation(index,moves=[]) {
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
    variationRequest++;variation=null;retryReview=null;
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
    return JSON.parse(JSON.stringify({version:REVIEW_VERSION,status:reportStatus,
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
    retryReview=r;startVariation(r.index);renderReviewDetails();
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
        if(r){r.stable=previous?Math.abs(r.loss-previous.loss)<=0.025:true;r.category=classify({best:r.bestLine,played:r.playedLine,legalCount:r.legalCount,verified:r.verified&&r.stable,sacrifice:r.sacrifice,routineCapture:r.routineCapture,book:!!r.opening,previousOpponentLoss:analysisMoveReviews[index-1]?.loss||0});}
        if (r && token===analysisReviewToken) {analysisMoveReviews[index]=r;reportStatus='Seçili hamle güncellendi';refreshReviewReport();}
    } catch(e) {if(token===analysisReviewToken)showVariationStatus(e.message);}
    finally {if(token===analysisReviewToken){reviewBusy=false;renderReviewDetails();}}
};
document.getElementById('analysisBoard')?.addEventListener('click',async function(event) {
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
        const compared=await queueStockfishEval(r.beforeFen,{mode:'variation',depth:18,multiPv:2,
            position:positionCommand(r.index),searchmoves:[...new Set([r.bestMove,u])],timeoutMs:5500});
        if(request!==variationRequest || variation!==branch)return;
        const played=compared.topLines?.find(l=>l.uci===u),best=compared.topLines?.[0];
        showVariationStatus(!played || !best?'Yeterli motor verisi alınamadı.':qualityScore(best)-qualityScore(played)<0.02?
            'Güçlü bir devam buldun! Derinlik '+compared.depth+'.':'Daha güçlü seçenek: '+formatEngineMove(best.uci,r.beforeFen)+'. Derinlik '+compared.depth+'.');
        renderReviewDetails();
    } else evaluateVariation();
});
document.addEventListener('keydown',event=>{
    if (window.currentViewId!=='view-2v2-analysis' || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
    const actions={ArrowLeft:'prev',ArrowRight:'next',Home:'start',End:'end'};
    if(actions[event.key]){event.preventDefault();window.navAnalysis(actions[event.key]);}
    if(event.key==='Escape')window.returnToAnalysisGame();
});

window.openAnalysis = async function(pgn, players, fallbackFen) {
    window.cancelAnalysisReview();
    window.switchView('view-2v2-analysis');
    window.setAnalysisMobileTab('review');
    window.toggleAnalysisMovesPanel(false);
    bestPreviewToken++;
    analysisReviewToken++;
    reportStatus = 'İlk inceleme'; variation=null; variationRequest++; retryReview=null;
    const thisReviewToken = analysisReviewToken;

    analysisMoveReviews = [];livePositionResult=null;
    updateAccuracyRing('acc-white',null);updateAccuracyRing('acc-black',null);
    analysisPlayers = players;
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
            setAnalysisPosition(0);renderAnalysisBoard();renderMoveList();reportStatus='Tek konum incelemesi';updateReportSummaryText('Maç geçmişi yok; yalnızca konum inceleniyor.');document.getElementById('report-result').textContent='Konum incelemesi';document.getElementById('analysisResultPill').textContent='Konum';
            updateCoachFeedback();runStockfish();
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
        await initStockfish();
    } catch (e) {
        window.showToast('Stockfish yüklenemedi, analiz başlatılamıyor.', 'error');
        showLoadingOverlay(false);
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
    setAnalysisPosition(analysisHistory.length);
    renderAnalysisBoard();
    renderMoveList();
    highlightMoveRow();
    refreshBestMoveButtonState();
    window.switchAnalysisTab('review');

    const cachedReport = await readCacheStore('reports', currentAnalysisReportCacheKey);
    if (thisReviewToken !== analysisReviewToken) return;
    if (applyCachedGameReview(cachedReport)) {
        showLoadingOverlay(false);
        // Restore coach feedback from cached report
        if (typeof updateCoachFeedback === 'function') updateCoachFeedback();
        bindBestMovePreviewButton();
        initChartEvents();
        drawEvaluationChart();
        return;
    }

    try {
        await runDetailedGameReview(thisReviewToken);
    } catch (error) {
        if (thisReviewToken === analysisReviewToken) { reportStatus='Analiz tamamlanamadı'; updateReportSummaryText(error.message); renderReviewDetails(); }
    } finally {
        if (thisReviewToken === analysisReviewToken) {
            showLoadingOverlay(false);
        }
    }

    bindBestMovePreviewButton();
    initChartEvents();
    drawEvaluationChart();
};

window.openAnalysisFromEncodedGame = function(encodedGame) {
    try {
        const game = JSON.parse(decodeURIComponent(encodedGame));
        window.openAnalysis(game.pgn, game.players, game.fen || null);
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
