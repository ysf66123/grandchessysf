// modules/analysis-v2.js - Chess Game Analysis Engine (Chess.com-style review)

const SF_DEPTH_LIVE = 18;
const SF_DEPTH_REVIEW = 14;
const SF_MULTI_PV = 4;
const SF_MULTI_PV_LIVE = 4;
const ANALYSIS_CACHE_VERSION = 'sf18-lite-v3-depth18-mpv4';
const ANALYSIS_CACHE_DB = 'grandmaster_analysis_cache_v1';
const ANALYSIS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 45;
const CLOUD_EVAL_MIN_DEPTH = 18;
const CLOUD_EVAL_TIMEOUT_MS = 1600;

const MOVE_CATEGORY_META = {
    brilliant: { tag: '!!', tr: 'Muazzam', en: 'Brilliant' },
    great: { tag: '!', tr: 'Harika', en: 'Great' },
    best: { tag: '★', tr: 'En İyi', en: 'Best' },
    book: { tag: '📖', tr: 'Kitap', en: 'Book' },
    excellent: { tag: '✓', tr: 'Mükemmel', en: 'Excellent' },
    good: { tag: '✓', tr: 'İyi', en: 'Good' },
    inaccuracy: { tag: '?!', tr: 'Hatalı', en: 'Inaccuracy' },
    mistake: { tag: '?', tr: 'Hata', en: 'Mistake' },
    miss: { tag: '✕', tr: 'Kaçan Fırsat', en: 'Miss' },
    blunder: { tag: '??', tr: 'Çift Soru', en: 'Blunder' }
};

const OPENING_BOOK = {
    'e4': true, 'd4': true, 'Nf3': true, 'c4': true, 'g3': true,
    'e4 e5': true, 'e4 e5 Nf3': true, 'e4 e5 Nf3 Nc6': true,
    'e4 e5 Nf3 Nc6 Bb5': true, 'e4 e5 Nf3 Nc6 Bc4': true,
    'e4 c5': true, 'e4 c5 Nf3': true, 'e4 c5 Nf3 d6': true,
    'e4 e6': true, 'e4 e6 d4': true, 'e4 c6': true, 'e4 c6 d4': true,
    'd4 d5': true, 'd4 d5 c4': true, 'd4 Nf6': true, 'd4 Nf6 c4': true,
    'd4 Nf6 c4 e6': true, 'd4 Nf6 c4 g6': true
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
    if (currentAnalysisIndex >= analysisHistory.length) turnText = 'Maç sonu';
    else if (analysisChess.turn() === 'b') turnText = 'Siyah oynar';

    if (currentMoveEl) currentMoveEl.innerText = currentMove ? currentMove.san : 'Başlangıç konumu';
    if (currentTurnEl) currentTurnEl.innerText = turnText;
    if (positionEl) positionEl.innerText = positionText;
    
    if (typeof updateCoachFeedback === 'function') updateCoachFeedback();
}

function updateCoachFeedback() {
    const qualityEl = document.getElementById('coachMoveQuality');
    const textEl = document.getElementById('coachFeedbackText');
    if (!qualityEl || !textEl) return;
    
    if (currentAnalysisIndex === 0) {
        qualityEl.innerText = 'Başlangıç Konumu';
        textEl.innerText = 'Maçın başlangıç dizilimi. Beyazın hafif bir merkez avantajı var.';
        qualityEl.style.color = '#fff';
        return;
    }
    
    const review = analysisMoveReviews[currentAnalysisIndex - 1];
    if (!review) {
        qualityEl.innerText = 'Analiz Bekleniyor';
        textEl.innerText = 'Motor henüz bu hamleyi incelemedi.';
        qualityEl.style.color = '#aaa';
        return;
    }
    
    qualityEl.innerText = getMoveCategoryLabel(review.category);
    let color = '#fff';
    let msg = '';
    
    if (review.category === 'brilliant') { color = '#2dd4bf'; msg = 'Harika bir feda veya taktik buldun! Satranç tahtasında parlıyorsun.'; }
    else if (review.category === 'great') { color = '#38bdf8'; msg = 'Zor bir konumda bulunabilecek tek doğru hamleyi yaptın. Tebrikler!'; }
    else if (review.category === 'best') { color = '#10b981'; msg = 'Motorun önerdiği en güçlü hamle. Kusursuz oynuyorsun.'; }
    else if (review.category === 'book') { color = '#d4af37'; msg = 'Teorik açılış hamlesi. Bilinen yollardan sağlam ilerliyorsun.'; }
    else if (review.category === 'excellent') { color = '#4ade80'; msg = 'Çok güçlü bir hamle. Konum avantajını koruyorsun.'; }
    else if (review.category === 'good') { color = '#a3e635'; msg = 'Kabul edilebilir sağlam bir hamle.'; }
    else if (review.category === 'inaccuracy') { color = '#facc15'; msg = 'Bu hamle ile hafif bir avantaj kaybettin. Daha iyisi olabilirdi.'; }
    else if (review.category === 'mistake') { color = '#f97316'; msg = 'Konumda belirgin bir zayıflık yarattın.'; }
    else if (review.category === 'miss') { color = '#ef4444'; msg = 'Rakibi cezalandırmak veya materyal kazanmak için eline geçen fırsatı kaçırdın.'; }
    else if (review.category === 'blunder') { color = '#dc2626'; msg = 'Ciddi bir hata! Taşı boşta bırakmış veya mat ağına girmiş olabilirsin.'; }
    
    qualityEl.style.color = color;
    textEl.innerText = msg;
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
let sfInitPromise = null;
let isSfReady = false;
let sfPendingFen = null;
let sfQueue = [];
let sfActiveTask = null;

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
const analysisWarmCacheInFlight = new Map();
const analysisWarmQueue = [];
const analysisWarmQueuedKeys = new Set();
let analysisWarmQueueRunning = false;
const cloudEvalInFlight = new Map();
let cloudEvalDisabledUntil = 0;

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
    return analysisCacheDbPromise;
}

async function readCacheStore(storeName, key) {
    const db = await getAnalysisCacheDb();
    if (!db) return null;
    return new Promise(function(resolve) {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = function() {
            const value = req.result || null;
            if (!value || (Date.now() - (value.createdAtMs || 0)) > ANALYSIS_CACHE_TTL_MS) return resolve(null);
            resolve(value.payload || null);
        };
        req.onerror = function() { resolve(null); };
    });
}

async function writeCacheStore(storeName, key, payload) {
    const db = await getAnalysisCacheDb();
    if (!db || !payload) return;
    return new Promise(function(resolve) {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put({ key: key, payload: payload, createdAtMs: Date.now() });
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { resolve(); };
    });
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

function buildEvalCacheKey(fen, depth) {
    return [ANALYSIS_CACHE_VERSION, 'eval', 'd' + depth, 'mpv' + SF_MULTI_PV, fen].join('|');
}

function normalizeFenForCloudEval(fen) {
    return String(fen || '').split(' ').slice(0, 4).join(' ');
}

function cloudEvalToLocalResult(data, fen, requestId) {
    if (!data || !Array.isArray(data.pvs) || !data.pvs.length) return null;
    if ((data.depth || 0) < CLOUD_EVAL_MIN_DEPTH) return null;
    const topLines = data.pvs.map(function(pv, index) {
        const uci = pv && pv.moves ? String(pv.moves).split(' ')[0] : null;
        return {
            rank: index + 1,
            uci: uci,
            cp: pv && pv.cp !== undefined ? pv.cp : null,
            mate: pv && pv.mate !== undefined ? pv.mate : null,
            whiteScore: null
        };
    }).filter(function(line) { return line.uci; });
    if (!topLines.length) return null;
    const result = {
        cp: topLines[0].cp,
        mate: topLines[0].mate,
        bestMove: topLines[0].uci,
        topLines: topLines,
        mode: 'cloud_review',
        requestId: requestId || 0,
        fallback: false,
        cloud: true,
        cloudDepth: data.depth || null,
        fen: fen
    };
    result.whiteScore = evalToWhiteScore(result, fen);
    result.topLines = result.topLines.map(function(line) {
        return Object.assign({}, line, { whiteScore: engineLineToWhiteScore(line, fen) });
    });
    return result;
}

async function readCloudEval(fen, requestId) {
    if (!window.fetch || Date.now() < cloudEvalDisabledUntil) return null;
    const cloudFen = normalizeFenForCloudEval(fen);
    if (!cloudFen) return null;
    const key = cloudFen + '|mpv' + SF_MULTI_PV;
    if (cloudEvalInFlight.has(key)) return cloudEvalInFlight.get(key);
    const task = (async function() {
        try {
            const controller = window.AbortController ? new AbortController() : null;
            const timer = controller ? setTimeout(function() { controller.abort(); }, CLOUD_EVAL_TIMEOUT_MS) : null;
            const url = 'https://lichess.org/api/cloud-eval?fen=' + encodeURIComponent(cloudFen) + '&multiPv=' + SF_MULTI_PV;
            const response = await window.fetch(url, {
                method: 'GET',
                cache: 'force-cache',
                signal: controller ? controller.signal : undefined
            });
            if (timer) clearTimeout(timer);
            if (response.status === 404) return null;
            if (response.status === 429) {
                cloudEvalDisabledUntil = Date.now() + 120000;
                return null;
            }
            if (!response.ok) return null;
            return cloudEvalToLocalResult(await response.json(), fen, requestId);
        } catch (e) {
            return null;
        } finally {
            cloudEvalInFlight.delete(key);
        }
    })();
    cloudEvalInFlight.set(key, task);
    return task;
}

async function writeEvalResultToCache(cacheKey, evalResult, fen) {
    if (!evalResult || evalResult.fallback) return;
    await writeCacheStore('evals', cacheKey, {
        cp: evalResult.cp,
        mate: evalResult.mate,
        bestMove: evalResult.bestMove,
        topLines: evalResult.topLines,
        mode: evalResult.cloud ? 'cloud_review' : 'review',
        fallback: false,
        cloud: !!evalResult.cloud,
        cloudDepth: evalResult.cloudDepth || null,
        whiteScore: evalResult.whiteScore,
        fen: fen
    });
}

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
        badge.innerHTML = '<i class="fas fa-calculator"></i> Materyal Analiz';
        badge.style.background = 'rgba(255,165,0,0.2)';
        badge.style.color = 'orange';
        badge.style.borderColor = 'orange';
    }
}

function initStockfish() {
    if (sfWorker && isSfReady) return Promise.resolve();
    if (sfInitPromise) return sfInitPromise;

    sfInitPromise = new Promise(function(resolve) {
        try {
            let resolved = false;
            function finishInit() {
                if (resolved) return;
                resolved = true;
                sfInitPromise = null;
                resolve();
            }

            sfWorker = new Worker('vendor/stockfish-18-lite-single.js');

            sfWorker.onmessage = function(event) {
                handleStockfishMessage(event.data);
                if (event.data === 'readyok') finishInit();
            };

            sfWorker.onerror = function(err) {
                console.error('Stockfish Worker Error:', err);
                sfWorker = null;
                isSfReady = false;
                setStockfishStatus('fallback');
                if (sfActiveTask) {
                    sfActiveTask.resolve({
                        cp: null, mate: null, bestMove: null, topLines: [],
                        mode: sfActiveTask.mode, requestId: sfActiveTask.requestId, fallback: true
                    });
                    sfActiveTask = null;
                }
                while (sfQueue.length > 0) {
                    const waiting = sfQueue.shift();
                    waiting.resolve({
                        cp: null, mate: null, bestMove: null, topLines: [],
                        mode: waiting.mode, requestId: waiting.requestId, fallback: true
                    });
                }
                finishInit();
            };

            sfWorker.postMessage('uci');
            setStockfishStatus('loading');
        } catch (err) {
            console.error('Stockfish init failed:', err);
            sfWorker = null;
            isSfReady = false;
            setStockfishStatus('fallback');
            sfInitPromise = null;
            resolve();
        }
    });

    return sfInitPromise;
}

function handleStockfishMessage(msg) {
    if (typeof msg !== 'string') return;
    msg.split(/\r?\n/).forEach(function(line) {
        const trimmed = line.trim();
        if (trimmed) handleStockfishLine(trimmed);
    });
}

function handleStockfishLine(line) {
    if (line === 'uciok') {
        sfWorker.postMessage('setoption name MultiPV value ' + SF_MULTI_PV);
        sfWorker.postMessage('setoption name Hash value 96');
        sfWorker.postMessage('setoption name Threads value 1');
        sfWorker.postMessage('isready');
        return;
    }

    if (line === 'readyok') {
        isSfReady = true;
        setStockfishStatus('active');
        processStockfishQueue();
        if (sfPendingFen) {
            sfPendingFen = null;
            runStockfish();
        }
        return;
    }

    if (!sfActiveTask) return;

    if (line.indexOf('info depth') === 0) {
        const matchPv = line.match(/\bmultipv (\d+)/);
        const pvIndex = matchPv ? parseInt(matchPv[1], 10) : 1;
        const matchCp = line.match(/score cp (-?\d+)/);
        const matchMate = line.match(/score mate (-?\d+)/);
        const matchPvMove = line.match(/\spv\s+([a-h][1-8][a-h][1-8][nbrq]?)/);
        const lineData = sfActiveTask.topLines[pvIndex] || { rank: pvIndex, cp: null, mate: null, uci: null };

        if (matchMate) {
            lineData.mate = parseInt(matchMate[1], 10);
            lineData.cp = null;
        } else if (matchCp) {
            lineData.cp = parseInt(matchCp[1], 10);
            lineData.mate = null;
        }

        if (matchPvMove) lineData.uci = matchPvMove[1];
        sfActiveTask.topLines[pvIndex] = lineData;

        if (pvIndex === 1) {
            sfActiveTask.cp = lineData.cp;
            sfActiveTask.mate = lineData.mate;
            if (lineData.uci) sfActiveTask.bestMove = lineData.uci;

            if (sfActiveTask.mode === 'live' && sfActiveTask.requestId === liveEvalRequestId) {
                updateEvalBarUI(sfActiveTask.cp, sfActiveTask.mate, sfActiveTask.fen);
            }
        }
        return;
    }

    if (line.indexOf('bestmove') === 0) {
        const parts = line.split(' ');
        sfActiveTask.bestMove = parts[1] || sfActiveTask.bestMove || null;
        const doneTask = sfActiveTask;
        sfActiveTask = null;
        const rankedLines = Object.keys(doneTask.topLines)
            .map(function(key) { return doneTask.topLines[key]; })
            .sort(function(a, b) { return a.rank - b.rank; });
        doneTask.resolve({
            cp: doneTask.cp,
            mate: doneTask.mate,
            bestMove: doneTask.bestMove,
            topLines: rankedLines,
            mode: doneTask.mode,
            requestId: doneTask.requestId,
            fallback: false
        });
        processStockfishQueue();
    }
}

function queueStockfishEval(fen, opts) {
    opts = opts || {};
    return new Promise(function(resolve) {
        const mode = opts.mode || 'live';
        const depth = opts.depth || SF_DEPTH_LIVE;
        const requestId = opts.requestId || 0;

        if (!sfWorker || !isSfReady) {
            const turnMul = fen.split(' ')[1] === 'w' ? 1 : -1;
            const cpFromTurn = materialEvalWhiteCpFromFen(fen) * turnMul;
            resolve({
                cp: cpFromTurn,
                mate: null,
                bestMove: null,
                topLines: [],
                mode: mode,
                requestId: requestId,
                fallback: true
            });
            return;
        }

        sfQueue.push({
            fen: fen,
            depth: depth,
            mode: mode,
            requestId: requestId,
            skillLevel: opts.skillLevel,
            cp: null,
            mate: null,
            bestMove: null,
            topLines: {},
            resolve: resolve
        });
        processStockfishQueue();
    });
}

function processStockfishQueue() {
    if (!sfWorker || !isSfReady || sfActiveTask || sfQueue.length === 0) return;
    sfActiveTask = sfQueue.shift();
    sfWorker.postMessage('stop');
    if (sfActiveTask.skillLevel !== undefined) {
        sfWorker.postMessage('setoption name UCI_LimitStrength value true');
        sfWorker.postMessage('setoption name Skill Level value ' + sfActiveTask.skillLevel);
    } else {
        sfWorker.postMessage('setoption name UCI_LimitStrength value false');
        sfWorker.postMessage('setoption name Skill Level value 20');
    }
    sfWorker.postMessage('position fen ' + sfActiveTask.fen);
    sfWorker.postMessage('go depth ' + sfActiveTask.depth);
}

function evalToWhiteScore(result, fen) {
    if (!result) return null;
    const turnIsWhite = fen.split(' ')[1] === 'w';

    if (result.mate !== null && result.mate !== undefined) {
        let sign = result.mate > 0 ? 1 : -1;
        if (!turnIsWhite) sign = -sign;
        return sign * 10000;
    }

    if (result.cp !== null && result.cp !== undefined) {
        return turnIsWhite ? result.cp : -result.cp;
    }

    return materialEvalWhiteCpFromFen(fen);
}

function engineLineToWhiteScore(line, fen) {
    if (!line) return null;
    return evalToWhiteScore({ cp: line.cp, mate: line.mate }, fen);
}

async function evaluateFenDetailed(fen, depth, token) {
    if (token !== analysisReviewToken) return null;
    const cacheKey = buildEvalCacheKey(fen, depth);
    const cached = await readCacheStore('evals', cacheKey);
    if (cached && token === analysisReviewToken) {
        return Object.assign({}, cached, { cached: true, requestId: token });
    }
    const cloudEval = await readCloudEval(fen, token);
    if (cloudEval && token === analysisReviewToken) {
        await writeEvalResultToCache(cacheKey, cloudEval, fen);
        return Object.assign({}, cloudEval, { cached: true, requestId: token });
    }
    const evalResult = await queueStockfishEval(fen, { depth: depth, mode: 'review', requestId: token });
    if (token !== analysisReviewToken) return null;
    evalResult.whiteScore = evalToWhiteScore(evalResult, fen);
    evalResult.topLines = (evalResult.topLines || []).filter(function(line) {
        return line && line.uci && ((line.cp !== null && line.cp !== undefined) || (line.mate !== null && line.mate !== undefined));
    }).map(function(line) {
        return {
            rank: line.rank,
            uci: line.uci || null,
            cp: line.cp,
            mate: line.mate,
            whiteScore: engineLineToWhiteScore(line, fen)
        };
    });
    evalResult.fen = fen;
    writeEvalResultToCache(cacheKey, evalResult, fen);
    return evalResult;
}

async function warmAnalysisCacheForFen(fen, depth) {
    depth = depth || SF_DEPTH_REVIEW;
    if (!fen || typeof fen !== 'string') return null;
    const cacheKey = buildEvalCacheKey(fen, depth);
    const cached = await readCacheStore('evals', cacheKey);
    if (cached) return cached;
    if (analysisWarmCacheInFlight.has(cacheKey)) return analysisWarmCacheInFlight.get(cacheKey);

    const task = (async function() {
        try {
            const cloudEval = await readCloudEval(fen, Date.now());
            if (cloudEval) {
                await writeEvalResultToCache(cacheKey, cloudEval, fen);
                return cloudEval;
            }
            await initStockfish();
            const evalResult = await queueStockfishEval(fen, { depth: depth, mode: 'warm_review', requestId: Date.now() });
            evalResult.whiteScore = evalToWhiteScore(evalResult, fen);
            evalResult.topLines = (evalResult.topLines || []).filter(function(line) {
                return line && line.uci && ((line.cp !== null && line.cp !== undefined) || (line.mate !== null && line.mate !== undefined));
            }).map(function(line) {
                return {
                    rank: line.rank,
                    uci: line.uci || null,
                    cp: line.cp,
                    mate: line.mate,
                    whiteScore: engineLineToWhiteScore(line, fen)
                };
            });
            evalResult.fen = fen;
            await writeEvalResultToCache(cacheKey, evalResult, fen);
            return evalResult;
        } catch (e) {
            return null;
        } finally {
            analysisWarmCacheInFlight.delete(cacheKey);
        }
    })();

    analysisWarmCacheInFlight.set(cacheKey, task);
    return task;
}

function enqueueAnalysisWarmFen(fen, depth) {
    depth = depth || SF_DEPTH_REVIEW;
    if (!fen || typeof fen !== 'string') return;
    const cacheKey = buildEvalCacheKey(fen, depth);
    if (analysisWarmQueuedKeys.has(cacheKey) || analysisWarmCacheInFlight.has(cacheKey)) return;
    analysisWarmQueuedKeys.add(cacheKey);
    analysisWarmQueue.push({ fen: fen, depth: depth, key: cacheKey });
    if (analysisWarmQueue.length > 160) {
        const dropped = analysisWarmQueue.splice(0, analysisWarmQueue.length - 160);
        dropped.forEach(function(item) { analysisWarmQueuedKeys.delete(item.key); });
    }
    processAnalysisWarmQueue();
}

function processAnalysisWarmQueue() {
    if (analysisWarmQueueRunning) return;
    analysisWarmQueueRunning = true;
    (async function() {
        try {
            while (analysisWarmQueue.length > 0) {
                if (window.currentViewId === 'view-2v2-analysis' || sfActiveTask || sfQueue.length > 0) {
                    await new Promise(function(resolve) { setTimeout(resolve, 900); });
                    continue;
                }
                const item = analysisWarmQueue.shift();
                analysisWarmQueuedKeys.delete(item.key);
                const cached = await readCacheStore('evals', item.key);
                if (cached) continue;
                await warmAnalysisCacheForFen(item.fen, item.depth);
                await new Promise(function(resolve) { setTimeout(resolve, 180); });
            }
        } finally {
            analysisWarmQueueRunning = false;
            if (analysisWarmQueue.length > 0) setTimeout(processAnalysisWarmQueue, 500);
        }
    })();
}

function warmAnalysisCacheForGame(pgn, fallbackFen) {
    const game = new Chess();
    const fens = [game.fen()];
    try {
        if (pgn && String(pgn).trim()) {
            const replay = new Chess();
            if (replay.load_pgn(pgn)) {
                const moves = replay.history({ verbose: true });
                const probe = new Chess();
                fens.length = 0;
                fens.push(probe.fen());
                moves.forEach(function(move) {
                    probe.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
                    fens.push(probe.fen());
                });
            }
        } else if (fallbackFen) {
            fens.push(fallbackFen);
        }
    } catch (e) {
        if (fallbackFen) fens.push(fallbackFen);
    }
    const recent = fens.slice(Math.max(0, fens.length - 80));
    recent.forEach(function(fen) { enqueueAnalysisWarmFen(fen, SF_DEPTH_REVIEW); });
}

function moveToUci(moveObj) {
    if (!moveObj || !moveObj.from || !moveObj.to) return '';
    return moveObj.from + moveObj.to + (moveObj.promotion || '');
}

function moverScoreFromWhite(whiteScore, moveColor) {
    return moveColor === 'w' ? whiteScore : -whiteScore;
}

function winChanceFromScore(score) {
    if (score >= 9000) return 0.999;
    if (score <= -9000) return 0.001;
    return 1 / (1 + Math.exp(-score / 240));
}

function winChanceDeltaForMover(beforeMover, afterMover) {
    return winChanceFromScore(afterMover) - winChanceFromScore(beforeMover);
}

function buildPgnPrefix(moveIndex) {
    let prefix = '';
    for (let i = 0; i <= moveIndex; i++) {
        if (!analysisHistory[i]) continue;
        prefix = prefix ? (prefix + ' ' + analysisHistory[i].san) : analysisHistory[i].san;
    }
    return prefix;
}

function isBookMove(moveNumber, pgnPrefix) {
    if (moveNumber > 14) return false;
    return !!OPENING_BOOK[pgnPrefix];
}

function isBrilliantMove(payload) {
    if (!payload.playedIsBest || payload.engineFallback) return false;
    if (payload.materialDeltaForMover > -140) return false;
    if (payload.winChanceDelta < -0.03) return false;
    if (payload.cpl > 8) return false;
    return payload.moveAccuracy >= 98;
}

function isGreatMove(payload) {
    if (!payload.playedIsBest || payload.engineFallback) return false;
    if (payload.cpl > 12) return false;
    const onlyMove = payload.legalMoveCount <= 1;
    const hugeGap = payload.topGap !== null && payload.topGap >= 95;
    const secondBad = payload.secondWinChance !== null && (payload.bestWinChance - payload.secondWinChance) >= 0.22;
    return onlyMove || hugeGap || (secondBad && payload.moveAccuracy >= 96);
}

function isMissMove(payload) {
    if (payload.playedIsBest || payload.engineFallback) return false;
    const bestLoss = Math.max(0, payload.bestWinChance - payload.playedWinChance);
    const missedWin = payload.bestWinChance >= 0.72 && payload.playedWinChance <= 0.52;
    const bigSwing = payload.winChanceDelta <= -0.14 && payload.beforeWinChance >= 0.56;
    const highCpl = payload.cpl >= 115;
    const onlyTacticalResource = payload.topGap !== null && payload.topGap >= 170;
    return (missedWin && highCpl) || (bigSwing && payload.cpl >= 85) || (onlyTacticalResource && bestLoss >= 0.12);
}

function moveAccuracyFromCpl(cpl) {
    const loss = Math.max(0, cpl || 0);
    if (loss <= 0) return 100;
    if (loss >= 500) return 1;
    return Math.max(1, Math.min(100, Math.round(100 * Math.exp(-0.0068 * loss - 0.00075 * loss * loss))));
}

function moveAccuracyFromEval(beforeWhite, bestAfterWhite, playedAfterWhite, moveColor, cpl) {
    const bestMover = moverScoreFromWhite(bestAfterWhite, moveColor);
    const playedMover = moverScoreFromWhite(playedAfterWhite, moveColor);
    const beforeMover = moverScoreFromWhite(beforeWhite, moveColor);

    const bestChance = winChanceFromScore(bestMover);
    const playedChance = winChanceFromScore(playedMover);
    const beforeChance = winChanceFromScore(beforeMover);

    const chanceLoss = Math.max(0, bestChance - playedChance);
    const cplAcc = moveAccuracyFromCpl(cpl);
    const chanceAcc = Math.max(1, Math.min(100, Math.round(100 - chanceLoss * 112)));
    const volatilityBonus = Math.max(0, (Math.abs(beforeChance - 0.5) - 0.2) * 6);

    const accuracy = Math.round(cplAcc * 0.78 + chanceAcc * 0.22 + volatilityBonus);
    return Math.max(1, Math.min(100, accuracy));
}

function refineMoveAccuracyForCategory(moveAccuracy, category, cpl) {
    const caps = {
        brilliant: { min: 98, max: 100 },
        great: { min: 94, max: 100 },
        best: { min: 92, max: 100 },
        book: { min: 90, max: 100 },
        excellent: { min: 85, max: 99 },
        good: { min: 72, max: 96 },
        inaccuracy: { min: 55, max: 82 },
        mistake: { min: 32, max: 65 },
        miss: { min: 18, max: 55 },
        blunder: { min: 1, max: 35 }
    };
    const cap = caps[category] || { min: 1, max: 100 };
    let value = Math.max(cap.min, Math.min(cap.max, moveAccuracy));
    if (category === 'blunder' && cpl >= 280) value = Math.min(value, 22);
    if (category === 'miss' && cpl >= 180) value = Math.min(value, 48);
    return value;
}

function getTopLineByRank(lines, rank) {
    if (!Array.isArray(lines)) return null;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] && lines[i].rank === rank) return lines[i];
    }
    return null;
}

function classifyMoveQuality(payload) {
    const bestLoss = Math.max(0, (payload.bestWinChance || 0) - (payload.playedWinChance || 0));
    const playedDrop = Math.max(0, (payload.beforeWinChance || 0) - (payload.playedWinChance || 0));

    if (payload.engineFallback) {
        if (payload.cpl <= 35 || payload.moveAccuracy >= 90) return 'good';
        if (payload.cpl <= 135 || payload.moveAccuracy >= 64) return 'inaccuracy';
        if (payload.cpl <= 285 || payload.moveAccuracy >= 42) return 'mistake';
        return 'blunder';
    }

    if (isBookMove(payload.moveNumber, payload.pgnPrefix)) return 'book';
    if (isBrilliantMove(payload)) return 'brilliant';
    if (isGreatMove(payload)) return 'great';
    if (payload.playedIsBest || (payload.cpl <= 6 && bestLoss <= 0.004)) return 'best';

    const dW = payload.winChanceDelta;
    if (isMissMove(payload)) return 'miss';

    if (bestLoss <= 0.018 && payload.cpl <= 28 && dW >= -0.035) return 'excellent';
    if (bestLoss <= 0.045 && payload.cpl <= 70 && dW >= -0.075) return 'good';
    if (bestLoss <= 0.105 && payload.cpl <= 155 && playedDrop < 0.13) return 'inaccuracy';
    if (bestLoss <= 0.215 && payload.cpl <= 330 && playedDrop < 0.25) return 'mistake';
    return 'blunder';
}

function calculateAccuracy(reviews) {
    if (!reviews.length) return 100;
    let weighted = 0;
    let total = 0;
    reviews.forEach(function(r, idx) {
        if (!r || typeof r.moveAccuracy !== 'number') return;
        let phaseWeight = 1;
        if (idx < 8) phaseWeight = 0.88;
        else if (idx > 50) phaseWeight = 1.06;
        if (r.category === 'blunder') phaseWeight *= 1.12;
        else if (r.category === 'miss') phaseWeight *= 1.06;
        else if (r.category === 'book') phaseWeight *= 0.82;
        weighted += r.moveAccuracy * phaseWeight;
        total += phaseWeight;
    });
    if (!total) return 100;
    return Math.max(1, Math.min(100, Math.round(weighted / total)));
}

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
    el.innerText = value + '%';
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
    const cpFromTurn = materialEvalWhiteCpFromFen(activeFen) * turnMul;
    updateEvalBarUI(cpFromTurn, null, activeFen);
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

    if (sfWorker && isSfReady) setStockfishStatus('active');
}

function runStockfish() {
    const fen = analysisChess.fen();
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
    sfQueue = sfQueue.filter(function(task) { return task.mode !== 'live'; });
    queueStockfishEval(fen, { depth: SF_DEPTH_LIVE, mode: 'live', requestId: requestId }).then(function(result) {
        if (requestId !== liveEvalRequestId) return;

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

        refreshBestMoveButtonState();
    });
}

function renderAnalysisBoard() {
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
            tag.innerHTML = '<i class="fas ' + getMoveCategoryIconClass(review.category) + '"></i>';
            const accLabel = getAnalysisLang() === 'en' ? 'Accuracy (Stockfish AI)' : 'Doğruluk (Stockfish AI)';
            tag.title = getMoveCategoryLabel(review.category) + ' | CPL: ' + review.cpl + ' | ' + accLabel + ': ' + (review.moveAccuracy || 0) + '%';
        cell.appendChild(tag);
    }

    return cell;
}

function renderMoveList() {
    const list = document.getElementById('analysisMoveList');
    if (!list) return;
    list.innerHTML = '';

    for (let i = 0; i < analysisHistory.length; i += 2) {
        const moveNum = (i / 2) + 1;
        const wMove = analysisHistory[i];
        const bMove = analysisHistory[i + 1];

        const row = document.createElement('div');
        row.className = 'move-list-row';
        row.id = 'move-row-' + i;

        const num = document.createElement('div');
        num.className = 'move-num';
        num.innerText = moveNum + '.';
        row.appendChild(num);

        row.appendChild(buildMoveCell(wMove, i, i + 1));
        row.appendChild(buildMoveCell(bMove, i + 1, i + 2));
        list.appendChild(row);
    }
}

function highlightMoveRow() {
    document.querySelectorAll('.move-list-row').forEach(function(r) { r.classList.remove('active'); });
    if (currentAnalysisIndex > 0) {
        const rowIdx = Math.floor((currentAnalysisIndex - 1) / 2);
        const el = document.getElementById('move-row-' + (rowIdx * 2));
        if (el) {
            el.classList.add('active');
            const list = document.getElementById('analysisMoveList');
            if (list) {
                const targetTop = el.offsetTop;
                const targetBottom = targetTop + el.offsetHeight;
                const visibleTop = list.scrollTop;
                const visibleBottom = visibleTop + list.clientHeight;
                const padding = 18;

                if (targetTop < visibleTop + padding || targetBottom > visibleBottom - padding) {
                    const nextScrollTop = Math.max(0, targetTop - ((list.clientHeight - el.offsetHeight) / 2));
                    list.scrollTo({ top: nextScrollTop, behavior: 'smooth' });
                }
            }
        }
    }
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

    analysisMoveReviews.forEach(function(review) {
        if (!review) {
            evals.push(evals[evals.length - 1] || 0);
            return;
        }
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
            window.jumpToMove(closestIndex);
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
    let worst = null;
    analysisMoveReviews.forEach(function(r) {
        if (!r) return;
        if (!worst || r.cpl > worst.cpl) worst = r;
    });
    if (!worst || worst.cpl < 110) return 'Belirgin kritik hata yok.';
    const side = worst.moveColor === 'w' ? 'Beyaz' : 'Siyah';
    const moveNo = Math.ceil((worst.index + 1) / 2);
    const loss = (worst.cpl / 100).toFixed(1);
    const label = getMoveCategoryLabel(worst.category);
    return side + ' tarafin ' + moveNo + '. hamlesi (' + worst.moveSan + ') - ' + label + ', ~' + loss + ' piyon kaybi';
}

function updateReportSummaryText(text) {
    const el = document.getElementById('report-blunder');
    if (el) el.innerText = text || 'Kritik hata raporu analiz sonunda guncellenir.';
}

function applyCachedGameReview(payload) {
    if (!payload || !Array.isArray(payload.reviews) || payload.reviews.length !== analysisHistory.length) return false;
    analysisMoveReviews = payload.reviews;
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

async function runDetailedGameReview(token) {
    if (!analysisHistory.length) {
        updateAccuracyRing('acc-white', 100);
        updateAccuracyRing('acc-black', 100);
        renderQualitySummary();
        return;
    }

    analysisMoveReviews = new Array(analysisHistory.length);
    renderMoveList();
    highlightMoveRow();
    renderQualitySummary();

    const probeChess = new Chess();
    if (analysisBaseFen) {
        try { probeChess.load(analysisBaseFen); } catch (e) { probeChess.reset(); }
    }

    let previousEval = await evaluateFenDetailed(probeChess.fen(), SF_DEPTH_REVIEW, token);
    if (!previousEval || token !== analysisReviewToken) return;

    for (let i = 0; i < analysisHistory.length; i++) {
        if (token !== analysisReviewToken) return;

        updateLoadingProgress(i, analysisHistory.length);

        const move = analysisHistory[i];
        const beforeFen = probeChess.fen();
        const legalMoveCount = probeChess.moves().length;
        const playedUci = moveToUci(move);

        probeChess.move(move.san);
        const playedFen = probeChess.fen();
        const givesCheck = probeChess.in_check();
        const playedEval = await evaluateFenDetailed(playedFen, SF_DEPTH_REVIEW, token);
        if (!playedEval || token !== analysisReviewToken) return;

        let bestMoveUci = previousEval.bestMove || null;
        let bestAfterEval = playedEval;
        let bestFen = playedFen;

        const needsBestLineEval = !!(bestMoveUci && bestMoveUci !== '(none)' && bestMoveUci !== playedUci);
        if (needsBestLineEval) {
            try {
                const bestProbe = new Chess();
                if (bestProbe.load(beforeFen)) {
                    bestProbe.move({
                        from: bestMoveUci.slice(0, 2),
                        to: bestMoveUci.slice(2, 4),
                        promotion: bestMoveUci.length > 4 ? bestMoveUci.slice(4, 5) : undefined
                    });
                    bestFen = bestProbe.fen();
                    const maybeBest = await evaluateFenDetailed(bestFen, SF_DEPTH_REVIEW, token);
                    if (maybeBest && token === analysisReviewToken) bestAfterEval = maybeBest;
                }
            } catch (e) {
                bestAfterEval = playedEval;
                bestFen = playedFen;
            }
        } else {
            bestAfterEval = playedEval;
            bestFen = playedFen;
        }

        const beforeMoverScore = moverScoreFromWhite(previousEval.whiteScore, move.color);
        const playedMoverScore = moverScoreFromWhite(playedEval.whiteScore, move.color);
        const bestMoverScore = moverScoreFromWhite(bestAfterEval.whiteScore, move.color);
        const secondLine = getTopLineByRank(previousEval.topLines, 2);
        const secondMoverScore = secondLine && secondLine.whiteScore !== null && secondLine.whiteScore !== undefined
            ? moverScoreFromWhite(secondLine.whiteScore, move.color)
            : null;
        const topGap = secondMoverScore === null || secondMoverScore === undefined
            ? null
            : Math.max(0, Math.round(bestMoverScore - secondMoverScore));
        const cpl = Math.max(0, Math.round(bestMoverScore - playedMoverScore));

        const beforeMaterial = materialEvalWhiteCpFromFen(beforeFen);
        const playedMaterial = materialEvalWhiteCpFromFen(playedFen);
        const materialDeltaForMover = move.color === 'w'
            ? (playedMaterial - beforeMaterial)
            : (beforeMaterial - playedMaterial);
        const moveFlags = move.flags || '';
        const isCapture = !!move.captured || moveFlags.indexOf('c') !== -1 || moveFlags.indexOf('e') !== -1;
        const isPromotion = !!move.promotion || moveFlags.indexOf('p') !== -1;
        const isCastle = moveFlags.indexOf('k') !== -1 || moveFlags.indexOf('q') !== -1;
        const playedIsBest = !!bestMoveUci && bestMoveUci === playedUci;
        const engineFallback = !!(previousEval.fallback || playedEval.fallback || bestAfterEval.fallback);
        const moveNumber = Math.ceil((i + 1) / 2);

        let moveAccuracy = moveAccuracyFromEval(
            previousEval.whiteScore,
            bestAfterEval.whiteScore,
            playedEval.whiteScore,
            move.color,
            cpl
        );

        const beforeWinChance = winChanceFromScore(beforeMoverScore);
        const playedWinChance = winChanceFromScore(playedMoverScore);
        const bestWinChance = winChanceFromScore(bestMoverScore);
        const secondWinChance = secondMoverScore === null || secondMoverScore === undefined
            ? null
            : winChanceFromScore(secondMoverScore);

        const category = classifyMoveQuality({
            playedIsBest: playedIsBest,
            cpl: cpl,
            moveAccuracy: moveAccuracy,
            materialDeltaForMover: materialDeltaForMover,
            beforeMoverScore: beforeMoverScore,
            afterMoverScore: playedMoverScore,
            winChanceDelta: winChanceDeltaForMover(beforeMoverScore, playedMoverScore),
            beforeWinChance: beforeWinChance,
            playedWinChance: playedWinChance,
            bestWinChance: bestWinChance,
            secondWinChance: secondWinChance,
            topGap: topGap,
            legalMoveCount: legalMoveCount,
            isCapture: isCapture,
            givesCheck: givesCheck,
            isPromotion: isPromotion,
            isCastle: isCastle,
            moveNumber: moveNumber,
            pgnPrefix: buildPgnPrefix(i),
            engineFallback: engineFallback
        });

        moveAccuracy = refineMoveAccuracyForCategory(moveAccuracy, category, cpl);

        const cpBefore = previousEval.whiteScore;
        const cpAfter = playedEval.whiteScore;

        analysisMoveReviews[i] = {
            index: i,
            moveSan: move.san,
            moveColor: move.color,
            cpl: cpl,
            category: category,
            moveAccuracy: moveAccuracy,
            bestMove: bestMoveUci,
            bestMoveSan: formatEngineMove(bestMoveUci, beforeFen),
            beforeFen: beforeFen,
            playedFen: playedFen,
            bestFen: bestFen,
            playedUci: playedUci,
            cpBefore: cpBefore,
            cpAfter: cpAfter
        };

        previousEval = playedEval;

        if (i % 4 === 0 || i === analysisHistory.length - 1) {
            if (typeof updateCoachFeedback === 'function') {
                const coachText = document.getElementById('coachFeedbackText');
                if (coachText) coachText.innerText = 'Analiz: ' + (i + 1) + '/' + analysisHistory.length + ' hamle değerlendiriliyor...';
            }
        }
        if (i % 8 === 0 || i === analysisHistory.length - 1) {
            renderMoveList();
            highlightMoveRow();
            renderQualitySummary();
            drawEvaluationChart();
        }
    }

    if (token !== analysisReviewToken) return;

    updateLoadingProgress(analysisHistory.length, analysisHistory.length);

    const whiteReviews = analysisMoveReviews.filter(function(r) { return r && r.moveColor === 'w'; });
    const blackReviews = analysisMoveReviews.filter(function(r) { return r && r.moveColor === 'b'; });
    const whiteAccuracy = calculateAccuracy(whiteReviews);
    const blackAccuracy = calculateAccuracy(blackReviews);
    updateAccuracyRing('acc-white', whiteAccuracy);
    updateAccuracyRing('acc-black', blackAccuracy);
    renderQualitySummary();

    let worst = null;
    analysisMoveReviews.forEach(function(r) {
        if (!r) return;
        if (!worst || r.cpl > worst.cpl) worst = r;
    });

    // Update coach feedback with worst move info
    const coachQuality = document.getElementById('coachMoveQuality');
    const coachText = document.getElementById('coachFeedbackText');
    if (coachQuality && coachText) {
        if (!worst || worst.cpl < 110) {
            coachQuality.innerText = 'Analiz Tamamlandı';
            coachQuality.style.color = '#10b981';
            coachText.innerText = 'Belirgin kritik hata yok. İyi oynamışsın!';
        } else {
            const side = worst.moveColor === 'w' ? 'Beyaz' : 'Siyah';
            const moveNo = Math.ceil((worst.index + 1) / 2);
            const loss = (worst.cpl / 100).toFixed(1);
            const label = getMoveCategoryLabel(worst.category);
            coachQuality.innerText = 'Analiz Tamamlandı';
            coachQuality.style.color = '#f59e0b';
            coachText.innerText = side + ' tarafın ' + moveNo + '. hamlesi (' + worst.moveSan + ') — ' + label + ', ~' + loss + ' piyon kaybı';
        }
    }

    updateReportSummaryText(getWorstMoveSummaryText());
    renderMoveList();
    highlightMoveRow();
    refreshBestMoveButtonState();
    drawEvaluationChart();
    if (currentAnalysisReportCacheKey) {
        writeCacheStore('reports', currentAnalysisReportCacheKey, {
            reviews: analysisMoveReviews,
            whiteAccuracy: whiteAccuracy,
            blackAccuracy: blackAccuracy,
            summaryText: getWorstMoveSummaryText(),
            moveCount: analysisHistory.length
        });
    }
}

window.openAnalysis = async function(pgn, players, fallbackFen) {
    window.switchView('view-2v2-analysis');
    window.setAnalysisMobileTab('review');
    window.toggleAnalysisMovesPanel(false);
    bestPreviewToken++;
    analysisReviewToken++;
    window.analysisReviewToken = analysisReviewToken;
    const thisReviewToken = analysisReviewToken;

    analysisMoveReviews = [];
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
            pgnLoaded = analysisChess.load(fallbackFen);
            analysisBaseFen = fallbackFen;
        } catch (e) {
            pgnLoaded = false;
        }
    }

    if (!pgnLoaded) analysisChess.reset();

    if (pgnLoaded && !analysisBaseFen) {
        try {
            const analysisHeaders = analysisChess.header ? analysisChess.header() : null;
            if (analysisHeaders && analysisHeaders.SetUp === '1' && analysisHeaders.FEN) {
                analysisBaseFen = analysisHeaders.FEN;
            }
        } catch (e) {}
    }

    analysisHistory = (pgnLoaded && typeof pgn === 'string' && pgn.trim())
        ? analysisChess.history({ verbose: true })
        : [];

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

    if (sfWorker && isSfReady) setStockfishStatus('active');
    else setStockfishStatus('fallback');

    let resultText = 'Devam Ediyor';
    if (analysisChess.in_checkmate()) {
        resultText = analysisChess.turn() === 'w' ? 'Siyah Kazandı' : 'Beyaz Kazandı';
    } else if (analysisChess.in_draw()) {
        resultText = 'Berabere';
    } else if (pgn && pgn.includes('1-0')) {
        resultText = whiteName + ' kazandı (1-0)';
    } else if (pgn && pgn.includes('0-1')) {
        resultText = blackName + ' kazandı (0-1)';
    } else if (pgn && pgn.includes('1/2')) {
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
    runStockfish();
    window.switchAnalysisTab('review');

    const cachedReport = await readCacheStore('reports', currentAnalysisReportCacheKey);
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
            analysisChess.load(originalFen);
            currentAnalysisIndex = originalIndex;
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
