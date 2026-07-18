// modules/analysis.js - Chess Game Analysis Engine

const db = window.db;
const auth = window.auth;

let stockfishWorker = null;
let stockfishStatus = 'idle'; // 'idle', 'loading', 'ready', 'error'
let currentSearchResolve = null;
let topLines = {};

// Curated Opening Book with Turkish Descriptions (Prefix SAN moves sequence up to 8 moves)
const openingBook = {
    // White first moves
    "e4": "Şah Piyonu Açılışı",
    "d4": "Vezir Piyonu Açılışı",
    "Nf3": "Réti Açılışı",
    "c4": "İngiliz Açılışı",
    "g3": "Benko Açılışı",
    "f4": "Bird Açılışı",
    "b3": "Larsen Açılışı",
    
    // Common responses
    "e4 e5": "Açık Oyun",
    "e4 e5 Nf3": "Kral Piyonu Oyunu",
    "e4 e5 Nf3 Nc6": "Kral Piyonu Oyunu: Normal Gelişim",
    "e4 e5 Nf3 Nc6 Bb5": "Ruy Lopez (İspanyol Açılışı)",
    "e4 e5 Nf3 Nc6 Bc4": "İtalyan Oyunu",
    "e4 e5 Nf3 Nc6 Bc4 Bc5": "Giuoco Piano (İtalyan Oyunu)",
    "e4 e5 Nf3 Nc6 Bc4 Nf6": "İki At Savunması",
    "e4 e5 Nf3 Nc6 d4": "İskoç Oyunu",
    "e4 e5 Nf3 Nc6 d4 exd4 Nxd4": "İskoç Oyunu: Ana Varyant",
    "e4 e5 Nf3 Nf6": "Petrov Savunması",
    "e4 e5 Nf3 d6": "Philidor Savunması",
    "e4 e5 f4": "Şah Gambiti",
    "e4 e5 f4 exf4": "Kabul Edilen Şah Gambiti",
    
    "e4 c5": "Sicilya Savunması",
    "e4 c5 Nf3": "Sicilya Savunması: Açık Varyant Hazırlığı",
    "e4 c5 Nf3 d6": "Sicilya Savunması: Klasik Hat",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3": "Sicilya Savunması: Ana Varyant",
    "e4 c5 Nf3 e6": "Sicilya Savunması: Fransız Varyantı",
    "e4 c5 Nf3 Nc6": "Sicilya Savunması: Normal Varyant",
    "e4 c5 c3": "Sicilya Savunması: Alapin Varyantı",
    
    "e4 e6": "Fransız Savunması",
    "e4 e6 d4 d5": "Fransız Savunması: Merkez Varyantı",
    "e4 e6 d4 d5 e5": "Fransız Savunması: İlerleme Varyantı",
    "e4 e6 d4 d5 Nc3": "Fransız Savunması: Paulsen Varyantı",
    
    "e4 c6": "Caro-Kann Savunması",
    "e4 c6 d4 d5": "Caro-Kann Savunması: Merkez Varyantı",
    "e4 c6 d4 d5 e5": "Caro-Kann Savunması: İlerleme Varyantı",
    
    "e4 d5": "İskandinav Savunması",
    "e4 d5 exd5 Qxd5": "İskandinav Savunması: Ana Hat",
    
    "e4 d6 d4 Nf6 Nc3 g6": "Pirc Savunması",
    
    "d4 d5": "Kapalı Oyun",
    "d4 d5 c4": "Vezir Gambiti",
    "d4 d5 c4 e6": "Vezir Gambiti Kabul Edilmeyen (QGD)",
    "d4 d5 c4 e6 Nc3 Nf6": "QGD: Klasik Hat",
    "d4 d5 c4 c6": "Slav Savunması",
    "d4 d5 c4 c6 Nf3 Nf6 Nc3": "Slav Savunması: Üç At Varyantı",
    "d4 d5 c4 dxc4": "Kabul Edilen Vezir Gambiti (QGA)",
    
    "d4 Nf6": "Hint Savunması",
    "d4 Nf6 c4 e6": "Hint Savunması: Vezir Hattı",
    "d4 Nf6 c4 e6 Nf3 b6": "Vezir-Hint Savunması",
    "d4 Nf6 c4 e6 Nc3 Bb4": "Nimzo-Hint Savunması",
    "d4 Nf6 c4 g6": "Şah-Hint Savunması Hazırlığı",
    "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6": "Şah-Hint Savunması: Ana Varyant",
    "d4 Nf6 c4 g6 Nc3 d5": "Grünfeld Savunması",
    "d4 Nf6 c4 e5": "Budapeşte Gambiti"
};

// State Variables
let analysisMoves = [];
let analysisCurrentMoveIndex = -1;
let analysisPlayers = null;
let analysisBoardFlipped = false;
let chartCanvas = null;
let chartCtx = null;
let isPreviewingMove = false;

// 1. Stockfish Web Worker Integration
function initStockfish() {
    return new Promise((resolve, reject) => {
        if (stockfishWorker) {
            resolve();
            return;
        }
        
        try {
            updateSfStatusBadge('loading');
            
            // Start the worker pointing to stockfish-18-lite-single.js
            // appending the hash for wasm location and worker mode
            const workerUrl = 'vendor/stockfish-18-lite-single.js#vendor/stockfish-18-lite-single.wasm,worker';
            stockfishWorker = new Worker(workerUrl);
            
            stockfishWorker.onmessage = function(e) {
                const line = e.data;
                handleStockfishMessage(line);
            };
            
            // Send initial commands
            stockfishWorker.postMessage('uci');
            stockfishWorker.postMessage('setoption name MultiPV value 3');
            stockfishWorker.postMessage('isready');
            
            // We consider it ready when "readyok" is received
            window.stockfishInitResolve = resolve;
            
            // Timeout safety fallback
            setTimeout(() => {
                if (stockfishStatus !== 'ready') {
                    console.warn("Stockfish readyok timeout, assuming ready");
                    stockfishStatus = 'ready';
                    updateSfStatusBadge('ready');
                    resolve();
                }
            }, 8000);
            
        } catch(e) {
            console.error("Stockfish init failed:", e);
            updateSfStatusBadge('error');
            reject(e);
        }
    });
}

function handleStockfishMessage(line) {
    if (line === 'readyok') {
        stockfishStatus = 'ready';
        updateSfStatusBadge('ready');
        if (window.stockfishInitResolve) {
            window.stockfishInitResolve();
            window.stockfishInitResolve = null;
        }
    }
    
    if (line.startsWith('info ')) {
        parseInfoLine(line);
    }
    
    if (line.startsWith('bestmove ')) {
        const parts = line.split(' ');
        const bestMove = parts[1] !== '(none)' ? parts[1] : null;
        
        if (currentSearchResolve) {
            const sortedLines = Object.values(topLines).sort((a, b) => a.rank - b.rank);
            const bestLine = sortedLines[0] || { cp: 0, mate: null, uci: bestMove };
            
            const result = {
                bestMove: bestMove,
                cp: bestLine.cp,
                mate: bestLine.mate,
                topLines: sortedLines
            };
            
            const resolveFn = currentSearchResolve;
            currentSearchResolve = null;
            topLines = {};
            resolveFn(result);
        }
    }
}

function parseInfoLine(line) {
    if (!line.includes('score')) return;
    
    let multipv = 1;
    const mpMatch = line.match(/multipv (\d+)/);
    if (mpMatch) multipv = parseInt(mpMatch[1], 10);
    
    let cp = null;
    let mate = null;
    if (line.includes('score cp ')) {
        const cpMatch = line.match(/score cp (-?\d+)/);
        if (cpMatch) cp = parseInt(cpMatch[1], 10);
    } else if (line.includes('score mate ')) {
        const mateMatch = line.match(/score mate (-?\d+)/);
        if (mateMatch) mate = parseInt(mateMatch[1], 10);
    }
    
    let pv = "";
    const pvMatch = line.match(/ pv (.+)/);
    if (pvMatch) pv = pvMatch[1];
    const uciMove = pv ? pv.split(' ')[0] : null;
    
    if (cp !== null || mate !== null) {
        topLines[multipv] = {
            rank: multipv,
            uci: uciMove,
            cp: cp,
            mate: mate,
            pv: pv
        };
    }
}

function queueStockfishEval(fen, options = {}) {
    return new Promise((resolve) => {
        if (!stockfishWorker) {
            resolve(null);
            return;
        }
        
        currentSearchResolve = resolve;
        topLines = {};
        
        stockfishWorker.postMessage('stop');
        
        const depth = options.depth || 10;
        stockfishWorker.postMessage('ucinewgame');
        stockfishWorker.postMessage(`position fen ${fen}`);
        stockfishWorker.postMessage(`go depth ${depth}`);
    });
}

// 2. Math Helpers for Win Chance & Material
function winChance(s) {
    return 1 / (1 + Math.exp(-s / 150));
}

function getWinChanceFromScore(cp, mate) {
    if (mate !== null && mate !== undefined) {
        return mate > 0 ? 1.0 : 0.0;
    }
    return winChance(cp);
}

function getNormalizedScore(result, turn) {
    if (!result) return { cp: 0, mate: null, bestMove: null };
    let cp = result.cp;
    let mate = result.mate;
    if (turn === 'b') {
        if (cp !== null && cp !== undefined) cp = -cp;
        if (mate !== null && mate !== undefined) mate = -mate;
    }
    return { cp: cp, mate: mate, bestMove: result.bestMove, topLines: result.topLines };
}

function getMaterialScore(board) {
    const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    let score = { w: 0, b: 0 };
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let sq = board[r][c];
            if (sq) {
                score[sq.color] += values[sq.type];
            }
        }
    }
    return score;
}

// 3. Classification Algorithm
function classifyMove(move, i, evalBefore, evalAfter, fenBefore, fenAfter, pgnPrefix) {
    const playerColor = fenBefore.split(' ')[1]; // 'w' or 'b'
    const oppColor = playerColor === 'w' ? 'b' : 'w';
    
    const whiteEvalBefore = getNormalizedScore(evalBefore, playerColor);
    const whiteEvalAfter = getNormalizedScore(evalAfter, playerColor === 'w' ? 'b' : 'w');
    
    const scoreBefore = playerColor === 'w' ? whiteEvalBefore.cp : -whiteEvalBefore.cp;
    const mateBefore = playerColor === 'w' ? whiteEvalBefore.mate : -whiteEvalBefore.mate;
    const winChanceBefore = getWinChanceFromScore(scoreBefore, mateBefore);
    
    const scoreAfter = playerColor === 'w' ? whiteEvalAfter.cp : -whiteEvalAfter.cp;
    const mateAfter = playerColor === 'w' ? whiteEvalAfter.mate : -whiteEvalAfter.mate;
    const winChanceAfter = getWinChanceFromScore(scoreAfter, mateAfter);
    
    const winChanceDrop = winChanceAfter - winChanceBefore;
    
    const playedUci = (move.from + move.to + (move.promotion || '')).toLowerCase();
    const recommendedUci = evalBefore.bestMove ? evalBefore.bestMove.toLowerCase() : '';
    const isBestMove = (playedUci === recommendedUci);
    
    // Sacrifice detection
    let isSacrifice = false;
    const matBefore = getMaterialScore(new Chess(fenBefore).board());
    if (evalAfter && evalAfter.bestMove) {
        const tempOpp = new Chess(fenAfter);
        const oppMove = tempOpp.move(evalAfter.bestMove, { sloppy: true });
        if (oppMove) {
            const matAfterOpp = getMaterialScore(tempOpp.board());
            const myFinalLoss = matBefore[playerColor] - matAfterOpp[playerColor];
            const oppFinalLoss = matBefore[oppColor] - matAfterOpp[oppColor];
            if (myFinalLoss > oppFinalLoss) {
                isSacrifice = true;
            }
        }
    }
    
    // Book lookup
    let isBook = false;
    if (i < 8 && openingBook[pgnPrefix]) {
        isBook = true;
    }
    
    // Great move check (played move is best move and second PV is significantly worse)
    let isGreatMove = false;
    if (isBestMove && evalBefore.topLines && evalBefore.topLines.length > 1) {
        const bestLine = evalBefore.topLines[0];
        const secondLine = evalBefore.topLines[1];
        if (bestLine && secondLine) {
            const bestWinChance = getWinChanceFromScore(bestLine.cp, bestLine.mate);
            const secondWinChance = getWinChanceFromScore(secondLine.cp, secondLine.mate);
            if ((bestWinChance - secondWinChance) >= 0.15) {
                isGreatMove = true;
            }
        }
    }
    
    // Miss check (missed winning chance)
    let isMiss = false;
    if (!isBestMove) {
        const bestWinChance = getWinChanceFromScore(evalBefore.cp, evalBefore.mate);
        const playedWinChance = winChanceAfter;
        if (bestWinChance >= 0.70 && playedWinChance < 0.50) {
            isMiss = true;
        }
    }
    
    let category = 'excellent';
    if (isBook) {
        category = 'book';
    } else if (isSacrifice && winChanceDrop >= -0.02) {
        category = 'brilliant';
    } else if (isGreatMove) {
        category = 'great';
    } else if (isBestMove) {
        category = 'best';
    } else if (isMiss) {
        category = 'miss';
    } else if (winChanceDrop < -0.25) {
        category = 'blunder';
    } else if (winChanceDrop < -0.12) {
        category = 'mistake';
    } else if (winChanceDrop < -0.05) {
        category = 'inaccuracy';
    } else if (winChanceDrop >= -0.02) {
        category = 'excellent';
    } else {
        category = 'good';
    }
    
    // Get SAN of best move for display
    let bestMoveSan = null;
    if (evalBefore.bestMove) {
        const temp = new Chess(fenBefore);
        const m = temp.move(evalBefore.bestMove, { sloppy: true });
        if (m) {
            bestMoveSan = m.san;
        }
    }
    
    return {
        category: category,
        winChanceBefore: winChanceBefore,
        winChanceAfter: winChanceAfter,
        winChanceDrop: winChanceDrop,
        cpBefore: scoreBefore,
        mateBefore: mateBefore,
        cpAfter: scoreAfter,
        mateAfter: mateAfter,
        bestMoveSan: bestMoveSan,
        bestMoveUci: evalBefore.bestMove
    };
}

function getMoveAccuracyScore(category) {
    switch (category) {
        case 'brilliant': return 100;
        case 'great': return 100;
        case 'best': return 100;
        case 'book': return 100;
        case 'excellent': return 95;
        case 'good': return 80;
        case 'inaccuracy': return 50;
        case 'mistake': return 25;
        case 'miss': return 10;
        case 'blunder': return 0;
        default: return 80;
    }
}

// 4. HTML Canvas Evaluation Chart
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
    
    // Grid Lines
    chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    chartCtx.lineWidth = 1;
    
    // Horizontals
    chartCtx.beginPath();
    chartCtx.moveTo(0, height * 0.25); chartCtx.lineTo(width, height * 0.25);
    chartCtx.moveTo(0, height * 0.75); chartCtx.lineTo(width, height * 0.75);
    chartCtx.stroke();
    
    // Center Line
    chartCtx.beginPath();
    chartCtx.setLineDash([5, 5]);
    chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    chartCtx.moveTo(0, height / 2);
    chartCtx.lineTo(width, height / 2);
    chartCtx.stroke();
    chartCtx.setLineDash([]);
    
    if (analysisMoves.length === 0) return;
    
    // Map evaluations White's perspective
    const evals = [];
    let initialEval = 0.3;
    if (analysisMoves.length > 0) {
        initialEval = analysisMoves[0].cpBefore / 100;
        if (analysisMoves[0].mateBefore !== null) {
            initialEval = analysisMoves[0].mateBefore > 0 ? 10 : -10;
        }
    }
    evals.push(initialEval);
    
    for (let i = 0; i < analysisMoves.length; i++) {
        let val = analysisMoves[i].cpAfter / 100;
        if (analysisMoves[i].mateAfter !== null) {
            val = analysisMoves[i].mateAfter > 0 ? 10 : -10;
        }
        val = Math.max(-10, Math.min(10, val));
        evals.push(val);
    }
    
    const points = [];
    const stepX = width / (evals.length - 1);
    
    for (let i = 0; i < evals.length; i++) {
        const x = i * stepX;
        const normalizedVal = (evals[i] + 10) / 20; // 0 to 1
        const y = height - (normalizedVal * (height - 24) + 12);
        points.push({ x: x, y: y, index: i - 1 });
    }
    
    // Glow Line Drawing
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
    chartCtx.shadowBlur = 0; // reset
    
    // Active point indicator
    const activePointIdx = analysisCurrentMoveIndex + 1;
    if (points[activePointIdx]) {
        const pt = points[activePointIdx];
        chartCtx.beginPath();
        chartCtx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        chartCtx.fillStyle = 'var(--primary)';
        chartCtx.fill();
        chartCtx.strokeStyle = '#fff';
        chartCtx.lineWidth = 2;
        chartCtx.stroke();
        
        // Vertical dashed line
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
    
    // Remove existing to avoid duplicates
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    
    newCanvas.addEventListener('click', function(e) {
        if (analysisMoves.length === 0) return;
        const rect = newCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        
        const numPoints = analysisMoves.length + 1;
        const stepX = width / (numPoints - 1);
        
        let closestIndex = -1;
        let minDiff = Infinity;
        for (let i = 0; i < numPoints; i++) {
            const ptX = i * stepX;
            const diff = Math.abs(x - ptX);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i - 1;
            }
        }
        
        if (closestIndex >= -1 && closestIndex < analysisMoves.length) {
            window.jumpToMove(closestIndex);
        }
    });
    
    newCanvas.addEventListener('mousemove', function(e) {
        if (analysisMoves.length === 0) return;
        const rect = newCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        
        const numPoints = analysisMoves.length + 1;
        const stepX = width / (numPoints - 1);
        
        let closestIndex = -1;
        let minDiff = Infinity;
        for (let i = 0; i < numPoints; i++) {
            const ptX = i * stepX;
            const diff = Math.abs(x - ptX);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i - 1;
            }
        }
        
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
    
    const numPoints = analysisMoves.length + 1;
    const stepX = width / (numPoints - 1);
    
    const i = idx + 1;
    const x = i * stepX;
    
    let val = 0.3;
    if (idx >= 0) {
        val = analysisMoves[idx].cpAfter / 100;
        if (analysisMoves[idx].mateAfter !== null) {
            val = analysisMoves[idx].mateAfter > 0 ? 10 : -10;
        }
    } else if (analysisMoves.length > 0) {
        val = analysisMoves[0].cpBefore / 100;
        if (analysisMoves[0].mateBefore !== null) {
            val = analysisMoves[0].mateBefore > 0 ? 10 : -10;
        }
    }
    val = Math.max(-10, Math.min(10, val));
    const normalizedVal = (val + 10) / 20;
    const y = height - (normalizedVal * (height - 24) + 12);
    
    chartCtx.beginPath();
    chartCtx.arc(x, y, 4, 0, Math.PI * 2);
    chartCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    chartCtx.fill();
}

// 5. Board Rendering & UI Sync
function drawAnalysisBoard() {
    const boardEl = document.getElementById('analysisBoard');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    
    let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    if (analysisCurrentMoveIndex >= 0 && analysisCurrentMoveIndex < analysisMoves.length) {
        fen = analysisMoves[analysisCurrentMoveIndex].fenAfter;
    } else if (analysisMoves.length > 0 && analysisCurrentMoveIndex === -1) {
        fen = analysisMoves[0].fenBefore;
    }
    
    const tempChess = new Chess();
    if (!tempChess.load(fen)) return;
    
    const boardArray = tempChess.board();
    const rotate = analysisBoardFlipped;
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const row = rotate ? 7 - r : r;
            const col = rotate ? 7 - c : c;
            const sq = boardArray[row][col];
            const squareName = String.fromCharCode(97 + col) + (8 - row);
            
            const div = document.createElement('div');
            div.className = 'square ' + ((r + c) % 2 === 0 ? 'white' : 'black');
            
            if (c === 0) {
                const rankEl = document.createElement('span');
                rankEl.className = 'coord coord-rank';
                rankEl.innerText = 8 - row;
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
                piece.style.backgroundImage = `url('https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${sq.color}${sq.type}.png')`;
                div.appendChild(piece);
            }
            boardEl.appendChild(div);
        }
    }
    
    updateAnalysisEvalUI();
}

function updateAnalysisEvalUI() {
    const evalFill = document.getElementById('analysisEvalFill');
    const evalScore = document.getElementById('analysisEvalScore');
    const evalDisplay = document.getElementById('report-eval-display');
    const bestMoveBtn = document.getElementById('report-best');
    
    if (!evalFill || !evalScore) return;
    
    let cp = 30; // standard initial
    let mate = null;
    let bestMove = "...";
    
    if (analysisCurrentMoveIndex >= 0 && analysisCurrentMoveIndex < analysisMoves.length) {
        const move = analysisMoves[analysisCurrentMoveIndex];
        cp = move.cpAfter;
        mate = move.mateAfter;
        bestMove = move.bestMoveSan || move.bestMoveUci || "...";
    }
    
    let winChanceVal = getWinChanceFromScore(cp, mate);
    let barHeight = winChanceVal * 100;
    
    evalFill.style.height = `${barHeight}%`;
    
    let scoreText = "0.0";
    if (mate !== null && mate !== undefined) {
        scoreText = mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`;
    } else {
        const val = (cp / 100).toFixed(1);
        scoreText = cp > 0 ? `+${val}` : val;
    }
    
    evalScore.innerText = scoreText;
    if (evalDisplay) {
        evalDisplay.innerText = scoreText;
        evalDisplay.style.color = cp >= 0 ? 'var(--success)' : 'var(--danger)';
    }
    
    if (bestMoveBtn) {
        bestMoveBtn.innerText = bestMove;
        bestMoveBtn.disabled = (bestMove === "...");
    }
}

function highlightActiveMoveInUI() {
    document.querySelectorAll('.move-list-row').forEach(row => {
        row.classList.remove('active');
    });
    
    if (analysisCurrentMoveIndex >= 0) {
        const rowId = `move-row-${Math.floor(analysisCurrentMoveIndex / 2) * 2}`;
        const row = document.getElementById(rowId);
        if (row) {
            row.classList.add('active');
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
}

// 6. Navigation Controls
window.navAnalysis = function(direction) {
    if (!analysisMoves.length) return;
    if (direction === 'start') {
        analysisCurrentMoveIndex = -1;
    } else if (direction === 'prev') {
        analysisCurrentMoveIndex = Math.max(-1, analysisCurrentMoveIndex - 1);
    } else if (direction === 'next') {
        analysisCurrentMoveIndex = Math.min(analysisMoves.length - 1, analysisCurrentMoveIndex + 1);
    } else if (direction === 'end') {
        analysisCurrentMoveIndex = analysisMoves.length - 1;
    }
    
    highlightActiveMoveInUI();
    drawAnalysisBoard();
};

window.flipAnalysisBoard = function() {
    analysisBoardFlipped = !analysisBoardFlipped;
    drawAnalysisBoard();
};

window.jumpToMove = function(index) {
    if (index < -1 || index >= analysisMoves.length) return;
    
    analysisCurrentMoveIndex = index;
    drawAnalysisBoard();
    highlightActiveMoveInUI();
    drawEvaluationChart();
};

// 7. Preview Best Vs Played Move
window.previewBestVsPlayedMove = function() {
    if (isPreviewingMove || analysisCurrentMoveIndex < 0 || analysisCurrentMoveIndex >= analysisMoves.length) return;
    
    isPreviewingMove = true;
    const move = analysisMoves[analysisCurrentMoveIndex];
    const fenBefore = move.fenBefore;
    
    const temp = new Chess(fenBefore);
    const m = temp.move(move.bestMoveUci, { sloppy: true });
    
    if (m) {
        drawBoardWithFen(temp.fen());
        updateBestMovePreviewBadge(true);
        
        setTimeout(() => {
            drawAnalysisBoard();
            updateBestMovePreviewBadge(false);
            isPreviewingMove = false;
        }, 1200);
    } else {
        isPreviewingMove = false;
    }
};

function drawBoardWithFen(fen) {
    const boardEl = document.getElementById('analysisBoard');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    
    const tempChess = new Chess(fen);
    const boardArray = tempChess.board();
    const rotate = analysisBoardFlipped;
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const row = rotate ? 7 - r : r;
            const col = rotate ? 7 - c : c;
            const sq = boardArray[row][col];
            
            const div = document.createElement('div');
            div.className = 'square ' + ((r + c) % 2 === 0 ? 'white' : 'black');
            
            if (sq) {
                const piece = document.createElement('div');
                piece.className = 'piece locked';
                piece.style.backgroundImage = `url('https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${sq.color}${sq.type}.png')`;
                div.appendChild(piece);
            }
            boardEl.appendChild(div);
        }
    }
}

function updateBestMovePreviewBadge(isShowingBest) {
    const btn = document.getElementById('report-best');
    if (!btn) return;
    if (isShowingBest) {
        btn.innerText = "★ EN İYİ HAMLE";
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
    } else {
        if (analysisCurrentMoveIndex >= 0 && analysisCurrentMoveIndex < analysisMoves.length) {
            btn.innerText = analysisMoves[analysisCurrentMoveIndex].bestMoveSan || "...";
        }
        btn.style.background = '';
        btn.style.color = '';
    }
}

// 8. Quality Badge HTML Helper
function getBadgeHtml(category) {
    if (!category) return '';
    let label = '';
    let cssClass = '';
    switch (category) {
        case 'brilliant': label = '!!'; cssClass = 'brilliant'; break;
        case 'great': label = '!'; cssClass = 'brilliant'; break;
        case 'best': label = '★'; cssClass = 'best'; break;
        case 'book': label = '📖'; cssClass = 'good'; break;
        case 'excellent': label = '✓'; cssClass = 'good'; break;
        case 'good': label = '✓'; cssClass = 'good'; break;
        case 'inaccuracy': label = '?!'; cssClass = 'mistake'; break;
        case 'mistake': label = '?'; cssClass = 'mistake'; break;
        case 'miss': label = '❌'; cssClass = 'blunder'; break;
        case 'blunder': label = '??'; cssClass = 'blunder'; break;
        default: return '';
    }
    return `<span class="move-tag ${cssClass}" title="${category}">${label}</span>`;
}

function getAccuracyColor(acc) {
    if (acc >= 90) return '#22c55e'; // Green
    if (acc >= 75) return '#0ea5e9'; // Blue
    if (acc >= 50) return '#eab308'; // Yellow
    return '#ef4444'; // Red
}

// 9. Loading Overlay Controls
function showLoadingOverlay(show, totalMoves = 0) {
    const overlay = document.getElementById('analysisLoadingOverlay');
    if (!overlay) return;
    
    if (show) {
        overlay.style.display = 'flex';
        updateLoadingProgress(0, totalMoves);
    } else {
        overlay.style.display = 'none';
    }
}

function updateLoadingProgress(index, total) {
    const countdown = document.getElementById('analysisCountdownNumber');
    const fill = document.getElementById('analysisLoadingProgressFill');
    const message = document.getElementById('analysisLoadingMessage');
    const subtext = document.getElementById('analysisLoadingSubtext');
    
    const percent = Math.min(100, Math.round((index / total) * 100));
    
    if (fill) fill.style.width = `${percent}%`;
    if (countdown) countdown.innerText = Math.max(0, total - index);
    if (message) message.innerText = `Motor ${index + 1}/${total} hamleyi analiz ediyor...`;
    if (subtext) subtext.innerText = `%${percent} tamamlandı`;
}

// 10. Switch Analysis View Tabs
window.switchAnalysisTab = function(tabName) {
    const tabBtnReview = document.getElementById('tab-btn-review');
    const tabBtnMoves = document.getElementById('tab-btn-moves');
    const contentReview = document.getElementById('tab-content-review');
    const contentMoves = document.getElementById('tab-content-moves');
    
    if (!tabBtnReview || !tabBtnMoves || !contentReview || !contentMoves) return;
    
    if (tabName === 'review') {
        tabBtnReview.classList.add('active');
        tabBtnMoves.classList.remove('active');
        contentReview.style.display = 'block';
        contentMoves.style.display = 'none';
    } else {
        tabBtnReview.classList.remove('active');
        tabBtnMoves.classList.add('active');
        contentReview.style.display = 'none';
        contentMoves.style.display = 'block';
    }
};

function updateSfStatusBadge(status) {
    const badge = document.getElementById('sfStatusBadge');
    if (!badge) return;
    
    if (status === 'loading') {
        badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Motor Yükleniyor';
        badge.style.background = 'rgba(255,165,0,0.2)';
        badge.style.color = 'orange';
        badge.style.borderColor = 'orange';
    } else if (status === 'ready') {
        badge.innerHTML = '<i class="fas fa-check"></i> Motor Hazır';
        badge.style.background = 'rgba(34,197,94,0.2)';
        badge.style.color = '#4ade80';
        badge.style.borderColor = '#4ade80';
    } else {
        badge.innerHTML = '<i class="fas fa-times"></i> Motor Çevrimdışı';
        badge.style.background = 'rgba(239,68,68,0.2)';
        badge.style.color = '#f87171';
        badge.style.borderColor = '#f87171';
    }
}

// 11. Share Analysis Report
window.shareCurrentAnalysisReport = function() {
    if (analysisMoves.length === 0) return;
    
    const whiteName = document.getElementById('an-white-player').innerText;
    const blackName = document.getElementById('an-black-player').innerText;
    const resultText = document.getElementById('report-result').innerText;
    const whiteAcc = document.getElementById('acc-white').innerText;
    const blackAcc = document.getElementById('acc-black').innerText;
    
    const shareText = `♟️ Satranç Maç Raporu ♟️\n\n` +
                      `⚪ Beyaz: ${whiteName} (Doğruluk: ${whiteAcc})\n` +
                      `⚫ Siyah: ${blackName} (Doğruluk: ${blackAcc})\n` +
                      `🏆 Sonuç: ${resultText}\n\n` +
                      `Detaylı analiz için sitemizi ziyaret edin!`;
                      
    navigator.clipboard.writeText(shareText).then(() => {
        window.showToast("Rapor kopyalandı! Arkadaşlarınızla paylaşabilirsiniz.", "success");
    }).catch(e => {
        console.error(e);
        window.showToast("Paylaşım başarısız oldu.", "error");
    });
};

// 12. Main Analysis Trigger Function
window.openAnalysis = async function(pgn, players, startFen) {
    window.switchView('view-2v2-analysis');
    
    analysisMoves = [];
    analysisCurrentMoveIndex = -1;
    analysisPlayers = players;
    analysisBoardFlipped = false;
    
    const whiteName = players && players.find(p => p.team === 'white')?.name || 'Beyaz';
    const blackName = players && players.find(p => p.team === 'black')?.name || 'Siyah';
    
    const whiteNameEl = document.getElementById('an-white-player');
    const blackNameEl = document.getElementById('an-black-player');
    if (whiteNameEl) whiteNameEl.innerText = whiteName;
    if (blackNameEl) blackNameEl.innerText = blackName;
    
    const resultTextEl = document.getElementById('report-result');
    if (resultTextEl) resultTextEl.innerText = "Hesaplanıyor...";
    
    const tempChess = new Chess();
    if (startFen) tempChess.load(startFen);
    
    let movesList = [];
    if (pgn) {
        try {
            tempChess.load_pgn(pgn);
            movesList = tempChess.history({ verbose: true });
        } catch(e) {
            console.error("PGN load failed:", e);
        }
    }
    
    if (movesList.length === 0) {
        window.showToast("Analiz edilecek hamle bulunamadı.", "error");
        return;
    }
    
    showLoadingOverlay(true, movesList.length);
    
    try {
        await initStockfish();
    } catch(e) {
        window.showToast("Stockfish yüklenemedi, analiz başlatılamıyor.", "error");
        showLoadingOverlay(false);
        return;
    }
    
    const runChess = new Chess();
    if (startFen) runChess.load(startFen);
    
    const analyzedMoves = [];
    let pgnPrefix = "";
    
    for (let i = 0; i < movesList.length; i++) {
        updateLoadingProgress(i, movesList.length);
        
        const move = movesList[i];
        const fenBefore = runChess.fen();
        
        runChess.move(move);
        const fenAfter = runChess.fen();
        
        pgnPrefix = pgnPrefix ? (pgnPrefix + " " + move.san) : move.san;
        
        const evalBefore = await queueStockfishEval(fenBefore, { depth: 10 });
        const evalAfter = await queueStockfishEval(fenAfter, { depth: 10 });
        
        const classification = classifyMove(move, i, evalBefore, evalAfter, fenBefore, fenAfter, pgnPrefix);
        
        analyzedMoves.push({
            san: move.san,
            from: move.from,
            to: move.to,
            promotion: move.promotion || null,
            fenBefore: fenBefore,
            fenAfter: fenAfter,
            category: classification.category,
            winChanceBefore: classification.winChanceBefore,
            winChanceAfter: classification.winChanceAfter,
            winChanceDrop: classification.winChanceDrop,
            cpAfter: classification.cpAfter,
            mateAfter: classification.mateAfter,
            cpBefore: classification.cpBefore,
            mateBefore: classification.mateBefore,
            bestMoveSan: classification.bestMoveSan,
            bestMoveUci: classification.bestMoveUci
        });
    }
    
    analysisMoves = analyzedMoves;
    showLoadingOverlay(false);
    
    // Post-Analysis UI Calculations
    const whiteScores = [];
    const blackScores = [];
    analysisMoves.forEach((move, idx) => {
        const score = getMoveAccuracyScore(move.category);
        if (idx % 2 === 0) whiteScores.push(score);
        else blackScores.push(score);
    });
    
    const whiteAcc = whiteScores.length > 0 ? (whiteScores.reduce((a,b)=>a+b, 0) / whiteScores.length) : 100;
    const blackAcc = blackScores.length > 0 ? (blackScores.reduce((a,b)=>a+b, 0) / blackScores.length) : 100;
    
    const accWhiteEl = document.getElementById('acc-white');
    const accBlackEl = document.getElementById('acc-black');
    if (accWhiteEl) {
        accWhiteEl.innerText = `${Math.round(whiteAcc)}%`;
        accWhiteEl.style.borderColor = getAccuracyColor(whiteAcc);
        accWhiteEl.style.color = getAccuracyColor(whiteAcc);
    }
    if (accBlackEl) {
        accBlackEl.innerText = `${Math.round(blackAcc)}%`;
        accBlackEl.style.borderColor = getAccuracyColor(blackAcc);
        accBlackEl.style.color = getAccuracyColor(blackAcc);
    }
    
    const counts = {
        w: { brilliant: 0, best: 0, good: 0, mistake: 0, blunder: 0 },
        b: { brilliant: 0, best: 0, good: 0, mistake: 0, blunder: 0 }
    };
    analysisMoves.forEach((move, idx) => {
        const color = (idx % 2 === 0) ? 'w' : 'b';
        const cat = move.category;
        
        if (cat === 'brilliant' || cat === 'great') counts[color].brilliant++;
        else if (cat === 'best' || cat === 'book') counts[color].best++;
        else if (cat === 'excellent' || cat === 'good') counts[color].good++;
        else if (cat === 'inaccuracy' || cat === 'mistake') counts[color].mistake++;
        else if (cat === 'miss' || cat === 'blunder') counts[color].blunder++;
    });
    
    const summaryEl = document.getElementById('analysisQualitySummary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="quality-chip brilliant" title="Harika & Mükemmel Hamleler">
                <span class="count"><span style="color:#fff;">${counts.w.brilliant}</span> <span style="color:#888;">|</span> <span style="color:#aaa;">${counts.b.brilliant}</span></span>
                <span style="color:#22d3ee;">!! Harika</span>
            </div>
            <div class="quality-chip best" title="En İyi & Kitap Hamleleri">
                <span class="count"><span style="color:#fff;">${counts.w.best}</span> <span style="color:#888;">|</span> <span style="color:#aaa;">${counts.b.best}</span></span>
                <span style="color:#4ade80;">En İyi / Kitap</span>
            </div>
            <div class="quality-chip good" title="Mükemmel & İyi Hamleler">
                <span class="count"><span style="color:#fff;">${counts.w.good}</span> <span style="color:#888;">|</span> <span style="color:#aaa;">${counts.b.good}</span></span>
                <span style="color:#7dd3fc;">İyi</span>
            </div>
            <div class="quality-chip mistake" title="Hassasiyet Kayıpları & Hatalar">
                <span class="count"><span style="color:#fff;">${counts.w.mistake}</span> <span style="color:#888;">|</span> <span style="color:#aaa;">${counts.b.mistake}</span></span>
                <span style="color:#fb923c;">Hata</span>
            </div>
            <div class="quality-chip blunder" title="Kaçan Fırsatlar & Ağır Hatalar">
                <span class="count"><span style="color:#fff;">${counts.w.blunder}</span> <span style="color:#888;">|</span> <span style="color:#aaa;">${counts.b.blunder}</span></span>
                <span style="color:#ef4444;">Ağır Hata</span>
            </div>
        `;
    }
    
    const totalBlunders = counts.w.blunder + counts.b.blunder;
    const blunderEl = document.getElementById('report-blunder');
    if (blunderEl) blunderEl.innerText = `${totalBlunders} Ağır Hata yapıldı.`;
    
    const resultHeader = tempChess.header().Result || "*";
    let resText = "Berabere";
    if (resultHeader === "1-0") {
        resText = `${whiteName} kazandı (1-0)`;
    } else if (resultHeader === "0-1") {
        resText = `${blackName} kazandı (0-1)`;
    } else if (resultHeader === "1/2-1/2") {
        resText = "Berabere (1/2-1/2)";
    }
    const reportResultEl = document.getElementById('report-result');
    if (reportResultEl) reportResultEl.innerText = resText;
    
    // Populate Move List HTML
    let moveListHtml = '';
    for (let i = 0; i < analysisMoves.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const whiteMove = analysisMoves[i];
        const blackMove = analysisMoves[i + 1] || null;
        
        const wBadge = getBadgeHtml(whiteMove.category);
        const bBadge = blackMove ? getBadgeHtml(blackMove.category) : '';
        const bSan = blackMove ? blackMove.san : '';
        
        moveListHtml += `
            <div class="move-list-row" id="move-row-${i}">
                <div class="move-num">${moveNum}.</div>
                <div class="move-san" onclick="jumpToMove(${i})">
                    ${whiteMove.san} ${wBadge}
                </div>
                <div class="move-san ${blackMove ? '' : 'empty'}" onclick="${blackMove ? `jumpToMove(${i + 1})` : ''}">
                    ${bSan} ${bBadge}
                </div>
            </div>
        `;
    }
    const moveListEl = document.getElementById('analysisMoveList');
    if (moveListEl) moveListEl.innerHTML = moveListHtml;
    
    initChartEvents();
    drawEvaluationChart();
    
    window.switchAnalysisTab('review');
    window.jumpToMove(-1);
};

window.openAnalysisFromEncodedGame = function(encodedGame) {
    try {
        const game = JSON.parse(decodeURIComponent(encodedGame));
        window.openAnalysis(game.pgn, game.players, game.fen || null);
    } catch(e) {
        console.error(e);
        window.showToast("Analiz yüklenirken hata oluştu.", "error");
    }
};

// Bind functions to window context
window.initStockfish = initStockfish;
window.queueStockfishEval = queueStockfishEval;
window.classifyMove = classifyMove;
window.drawEvaluationChart = drawEvaluationChart;
window.updateSfStatusBadge = updateSfStatusBadge;
