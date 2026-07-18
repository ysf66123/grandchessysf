import { doc, onSnapshot, setDoc, updateDoc, getDoc, getDocs, collection, query, where, arrayUnion, arrayRemove, serverTimestamp, deleteField } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const db = window.db;
const auth = window.auth;

const BOT_UID_PREFIX = 'bot_1v1_';
const RECONNECT_GRACE_MS = 30000;

const BOT_LEVEL_CONFIG = {
    easy: {
        level: 'easy',
        label: 'Kolay AI',
        shortLabel: 'KOLAY',
        avatar: 'fa-robot',
        depth: 6,
        altMoveChance: 0.5,
        altMoveMaxGap: 110,
        thinkDelayRange: [500, 900],
        accent: '#7dd3fc'
    },
    medium: {
        level: 'medium',
        label: 'Orta AI',
        shortLabel: 'ORTA',
        avatar: 'fa-microchip',
        depth: 10,
        altMoveChance: 0.2,
        altMoveMaxGap: 55,
        thinkDelayRange: [700, 1200],
        accent: '#facc15'
    },
    hard: {
        level: 'hard',
        label: 'Zor AI',
        shortLabel: 'ZOR',
        avatar: 'fa-brain',
        depth: 14,
        altMoveChance: 0.03,
        altMoveMaxGap: 18,
        thinkDelayRange: [950, 1500],
        accent: '#fb7185'
    }
};

function getBotConfig(level) {
    return BOT_LEVEL_CONFIG[level] || BOT_LEVEL_CONFIG.medium;
}

function isBotUid(uid) {
    return !!uid && String(uid).indexOf(BOT_UID_PREFIX) === 0;
}

function isBotPlayer(player) {
    return !!(player && (player.isBot || isBotUid(player.uid)));
}

function get1v1SeatLabel(team) {
    return team === 'white' ? 'Beyaz Bos' : 'Siyah Bos';
}

function makeBotPlayer(team, level) {
    var bot = getBotConfig(level);
    return {
        uid: BOT_UID_PREFIX + bot.level + '_' + team,
        name: bot.label,
        avatar: bot.avatar,
        team: team,
        index: 0,
        isReady: true,
        isBot: true,
        botLevel: level
    };
}

// State management
let current1v1Id = null;
let current1v1Data = null;
let unsubscribe1v1 = null;
let chess1v1 = new Chess();
let board1v1SelectedSquare = null;
let board1v1ValidMoves = [];
let game1v1TimerInterval = null;
let lastPlayedMoveCount1v1 = -1;
let pending1v1BotMoveKey = null;
let pending1v1BotMoveTimer = null;

let current2v2Id = null;
let current2v2Data = null;
let unsubscribe2v2 = null;
let chess = new Chess();
let boardSelectedSquare = null;
let boardValidMoves = [];
let gameTimerInterval = null;
let lastPlayedMoveCount = -1;
let activeFullscreenBoardMode = null;

let currentQuizId = null;
let currentQuizData = null;
let unsubscribeQuiz = null;
let quizBuilderQuestions = [];

let currentTournamentId = null;
let currentTournamentData = null;
let unsubscribeTournament = null;
let previousMatchesStr = "";

let currentGameOverPayload = null;
let current1v1Role = 'player';
let current2v2Role = 'player';
let reconnectPromptShownFor = null;

Object.defineProperties(window, {
    current1v1Id: { get: () => current1v1Id, set: (v) => { current1v1Id = v; } },
    current1v1Data: { get: () => current1v1Data, set: (v) => { current1v1Data = v; } },
    current1v1Role: { get: () => current1v1Role, set: (v) => { current1v1Role = v; } },
    current2v2Id: { get: () => current2v2Id, set: (v) => { current2v2Id = v; } },
    current2v2Data: { get: () => current2v2Data, set: (v) => { current2v2Data = v; } },
    current2v2Role: { get: () => current2v2Role, set: (v) => { current2v2Role = v; } },
    currentQuizId: { get: () => currentQuizId, set: (v) => { currentQuizId = v; } },
    currentQuizData: { get: () => currentQuizData, set: (v) => { currentQuizData = v; } },
    currentTournamentId: { get: () => currentTournamentId, set: (v) => { currentTournamentId = v; } },
    currentTournamentData: { get: () => currentTournamentData, set: (v) => { currentTournamentData = v; } },
    activeFullscreenBoardMode: { get: () => activeFullscreenBoardMode, set: (v) => { activeFullscreenBoardMode = v; } },
    currentGameOverPayload: { get: () => currentGameOverPayload, set: (v) => { currentGameOverPayload = v; } }
});

function releaseModeListeners(exceptMode) {
    if (exceptMode !== 'quiz' && unsubscribeQuiz) {
        unsubscribeQuiz();
        unsubscribeQuiz = null;
        currentQuizId = null;
        currentQuizData = null;
    }
    if (exceptMode !== '1v1' && unsubscribe1v1) {
        removeSpectatorMembership('1v1', current1v1Id, current1v1Data, current1v1Role);
        clearPending1v1BotMove();
        unsubscribe1v1();
        unsubscribe1v1 = null;
        current1v1Id = null;
        current1v1Data = null;
        current1v1Role = 'player';
    }
    if (exceptMode !== '2v2' && unsubscribe2v2) {
        removeSpectatorMembership('2v2', current2v2Id, current2v2Data, current2v2Role);
        unsubscribe2v2();
        unsubscribe2v2 = null;
        current2v2Id = null;
        current2v2Data = null;
        current2v2Role = 'player';
    }
    if (exceptMode !== 'tournament' && unsubscribeTournament) {
        unsubscribeTournament();
        unsubscribeTournament = null;
        currentTournamentId = null;
        currentTournamentData = null;
    }
    if (exceptMode !== '1v1' && game1v1TimerInterval) clearInterval(game1v1TimerInterval);
    if (exceptMode !== '2v2' && gameTimerInterval) clearInterval(gameTimerInterval);
}
window.releaseModeListeners = releaseModeListeners;

function makeEmptySeat(team, nameLabel) {
    return {
        uid: null,
        name: nameLabel || 'Boş',
        avatar: 'fa-plus',
        team: team,
        index: 0,
        isReady: false
    };
}

function clearPending1v1BotMove() {
    if (pending1v1BotMoveTimer) clearTimeout(pending1v1BotMoveTimer);
    pending1v1BotMoveTimer = null;
    pending1v1BotMoveKey = null;
}

function getCurrent1v1TurnBot(data) {
    if (!data || data.status !== 'active') return null;
    var turnTeam = chess1v1.turn() === 'w' ? 'white' : 'black';
    var player = Array.isArray(data.players) ? data.players.find(function(item) {
        return item.team === turnTeam;
    }) : null;
    return isBotPlayer(player) ? player : null;
}

function canUseAlternativeBotLine(bestLine, altLine, config) {
    if (!bestLine || !altLine || !config) return false;
    if (bestLine.mate !== null && bestLine.mate !== undefined && bestLine.mate > 0) return false;
    if (altLine.mate !== null && altLine.mate !== undefined && altLine.mate < 0) return false;
    if (bestLine.cp !== null && bestLine.cp !== undefined && altLine.cp !== null && altLine.cp !== undefined) {
        return Math.abs(bestLine.cp - altLine.cp) <= config.altMoveMaxGap;
    }
    if (bestLine.mate !== null && bestLine.mate !== undefined && altLine.mate !== null && altLine.mate !== undefined) {
        return Math.abs(bestLine.mate - altLine.mate) <= 1;
    }
    return true;
}

function pick1v1BotMoveUci(result, level) {
    var config = getBotConfig(level);
    var lines = (result && Array.isArray(result.topLines) ? result.topLines : []).filter(function(line) {
        return !!(line && line.uci);
    });
    var bestLine = lines[0] || (result && result.bestMove ? {
        rank: 1,
        uci: result.bestMove,
        cp: result.cp,
        mate: result.mate
    } : null);
    var altLine = lines[1] || null;
    if (!bestLine) return null;
    if (altLine && canUseAlternativeBotLine(bestLine, altLine, config) && Math.random() < config.altMoveChance) {
        return altLine.uci;
    }
    return bestLine.uci;
}

function score1v1FallbackMove(game, move) {
    var pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    var score = 0;
    if (move.captured) score += (pieceValues[move.captured] || 0) + 22;
    if (move.promotion) score += 850;
    if (move.flags.indexOf('k') !== -1 || move.flags.indexOf('q') !== -1) score += 70;
    if (move.san && move.san.indexOf('+') !== -1) score += 85;
    if (move.san && move.san.indexOf('#') !== -1) score += 50000;
    if ((move.piece === 'n' || move.piece === 'b') && (move.from[1] === '1' || move.from[1] === '8')) score += 28;
    if (move.piece === 'p' && (move.to[1] === '4' || move.to[1] === '5')) score += 16;

    var fileDistance = Math.abs(3.5 - (move.to.charCodeAt(0) - 97));
    var rankDistance = Math.abs(3.5 - (parseInt(move.to[1], 10) - 1));
    score += Math.max(0, 26 - ((fileDistance + rankDistance) * 8));

    var probe = new Chess();
    if (probe.load(game.fen())) {
        probe.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
        var materialScore = window.materialEvalWhiteCpFromFen ? window.materialEvalWhiteCpFromFen(probe.fen()) : 0;
        score += (game.turn() === 'w' ? materialScore : -materialScore) * 0.025;
    }

    return score + (Math.random() * 10);
}

function pick1v1FallbackMove(fen, level) {
    var probe = new Chess();
    if (!probe.load(fen)) return null;
    var moves = probe.moves({ verbose: true }).map(function(move) {
        return {
            move: move,
            score: score1v1FallbackMove(probe, move)
        };
    }).sort(function(a, b) {
        return b.score - a.score;
    });
    if (!moves.length) return null;

    var pickIndex = 0;
    if (level === 'easy') pickIndex = Math.min(moves.length - 1, randomInt(0, Math.min(2, moves.length - 1)));
    else if (level === 'medium') pickIndex = Math.min(moves.length - 1, randomInt(0, Math.min(1, moves.length - 1)));

    var chosen = moves[pickIndex].move;
    return {
        from: chosen.from,
        to: chosen.to,
        promotion: chosen.promotion || 'q'
    };
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function get1v1BotMove(data, botPlayer) {
    if (!data || !botPlayer) return null;
    var fen = data.pgn ? (function() {
        var probe = new Chess();
        try {
            probe.load_pgn(data.pgn);
            return probe.fen();
        } catch (e) {
            return data.fen;
        }
    })() : data.fen;
    if (!fen) return null;

    try {
        if (window.initStockfish) await window.initStockfish();
    } catch (e) {}

    var config = getBotConfig(botPlayer.botLevel);
    var result = window.queueStockfishEval ? await window.queueStockfishEval(fen, {
        depth: config.depth,
        mode: 'bot',
        requestId: data.moveCount + 1
    }) : null;
    var bestUci = pick1v1BotMoveUci(result, botPlayer.botLevel);
    if (bestUci) {
        return {
            from: bestUci.slice(0, 2),
            to: bestUci.slice(2, 4),
            promotion: bestUci.length > 4 ? bestUci.slice(4, 5) : 'q'
        };
    }
    return pick1v1FallbackMove(fen, botPlayer.botLevel);
}

async function commit1v1Move(move, sourceData) {
    if (!move || !sourceData || !current1v1Id) return false;
    var now = Date.now();
    var timeDiff = sourceData.lastMoveTime ? Math.max(0, now - sourceData.lastMoveTime) : 0;
    var isCheck = chess1v1.in_check();
    var isCapture = move.flags.includes('c') || move.flags.includes('e');
    var isCastle = move.flags.includes('k') || move.flags.includes('q');

    if (isCheck) window.playGameSound('check');
    else if (isCapture) window.playGameSound('capture');
    else if (isCastle) window.playGameSound('castle');
    else window.playGameSound('move');

    lastPlayedMoveCount1v1 = sourceData.moveCount + 1;
    var updates = {
        fen: chess1v1.fen(),
        pgn: chess1v1.pgn(),
        lastMoveTime: now,
        moveCount: sourceData.moveCount + 1,
        lastMoveFlags: move.flags,
        isCheck: isCheck
    };
    if (chess1v1.turn() === 'b') updates.whiteTime = Math.max(0, sourceData.whiteTime - timeDiff);
    else updates.blackTime = Math.max(0, sourceData.blackTime - timeDiff);

    if (chess1v1.game_over()) {
        updates.status = 'finished';
        updates.winner = chess1v1.in_checkmate() ? (chess1v1.turn() === 'w' ? 'black' : 'white') : 'draw';
    }

    board1v1SelectedSquare = null;
    board1v1ValidMoves = [];
    draw1v1Board();
    await updateDoc(doc(db, 'games_1v1', current1v1Id), updates);
    return true;
}

function maybeSchedule1v1BotMove(data) {
    if (!data || data.status !== 'active') {
        clearPending1v1BotMove();
        return;
    }
    const currentUser = window.currentUser;
    if (!currentUser || current1v1Role !== 'player' || data.hostId !== currentUser.uid) {
        return;
    }
    var botPlayer = getCurrent1v1TurnBot(data);
    if (!botPlayer) {
        clearPending1v1BotMove();
        return;
    }

    var botConfig = getBotConfig(botPlayer.botLevel);
    var moveKey = [current1v1Id, data.moveCount, chess1v1.turn(), botPlayer.uid].join(':');
    if (pending1v1BotMoveKey === moveKey) return;

    clearPending1v1BotMove();
    pending1v1BotMoveKey = moveKey;
    pending1v1BotMoveTimer = setTimeout(async function() {
        pending1v1BotMoveTimer = null;
        try {
            if (!current1v1Id || !current1v1Data || current1v1Data.status !== 'active') return;
            if (pending1v1BotMoveKey !== moveKey) return;

            var liveSnap = await getDoc(doc(db, 'games_1v1', current1v1Id)).catch(function() { return null; });
            if (!liveSnap || !liveSnap.exists()) return;
            var latest = liveSnap.data() || {};
            if (latest.status !== 'active' || latest.moveCount !== data.moveCount || latest.hostId !== currentUser.uid) return;

            if (latest.pgn) chess1v1.load_pgn(latest.pgn);
            else chess1v1.load(latest.fen);

            var liveBot = getCurrent1v1TurnBot(latest);
            if (!liveBot || liveBot.uid !== botPlayer.uid) return;

            var botMove = await get1v1BotMove(latest, liveBot);
            if (!botMove) return;
            var applied = chess1v1.move(botMove);
            if (!applied) return;
            await commit1v1Move(applied, latest);
        } catch (e) {
            console.error(e);
        } finally {
            if (pending1v1BotMoveKey === moveKey) pending1v1BotMoveKey = null;
        }
    }, randomInt(botConfig.thinkDelayRange[0], botConfig.thinkDelayRange[1]));
}

window.create1v1Game = async () => {
    window.playGameSound('nav');
    const code = window.makeId(5);
    const gameData = {
        code: code,
        hostId: window.currentUser.uid,
        gameMode: '1v1',
        status: 'lobby',
        timeControl: 5,
        whiteTime: 300000,
        blackTime: 300000,
        lastMoveTime: null,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        pgn: "",
        moveCount: 0,
        players: [
            { uid: window.currentUser.uid, name: window.currentUser.displayName, avatar: window.currentUser.photoURL || 'fa-chess-pawn', team: 'white', index: 0, isReady: false },
            makeEmptySeat('black', 'Siyah Boş')
        ],
        participantIds: [window.currentUser.uid],
        spectatorIds: [],
        disconnectState: {},
        winner: null,
        createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'games_1v1', code), gameData);
    window.enter1v1Game(code);
};

window.join1v1Prompt = async () => {
    const result = await Swal.fire({
        title: '1v1 Oda Kodu',
        input: 'text',
        inputPlaceholder: 'Örn: X9Y2Z',
        background: 'rgba(30,30,35,0.95)',
        color: '#fff',
        confirmButtonColor: '#22c55e'
    });
    if (result.value) window.enter1v1Game(result.value.trim().toUpperCase());
};

window.enter1v1Game = (code) => {
    window.releaseModeListeners('1v1');
    if (unsubscribe1v1) unsubscribe1v1();
    if (window.unsubscribeChat) window.unsubscribeChat();
    current1v1Id = code;
    clearPending1v1BotMove();
    board1v1SelectedSquare = null;
    board1v1ValidMoves = [];
    chess1v1.reset();
    lastPlayedMoveCount1v1 = -1;

    unsubscribe1v1 = onSnapshot(doc(db, 'games_1v1', code), function(snap) {
        if (!snap.exists()) {
            window.showToast('1v1 oyunu bulunamadı.', 'error');
            window.leave1v1Lobby();
            return;
        }

        const data = snap.data();
        current1v1Data = data;
        current1v1Role = data.players.some(function(player) { return player.uid === window.currentUser.uid; }) ? 'player' : 'spectator';
        syncSpectatorMembership('1v1', code, data, current1v1Role);
        syncGamePresence('1v1', code, data, current1v1Role);
        if (current1v1Role === 'player' && data.status === 'active' && !document.hidden) window.setCurrentReconnectState(true);

        if (data.status === 'lobby') {
            render1v1Lobby(data);
            window.switchView('view-1v1-lobby');
        } else if (data.status === 'active' || data.status === 'finished') {
            update1v1Game(data);
            if (!document.getElementById('view-1v1-game').classList.contains('active')) {
                window.switchView('view-1v1-game');
                if (lastPlayedMoveCount1v1 === -1) lastPlayedMoveCount1v1 = data.moveCount;
                draw1v1Board();
            }
            if (data.status === 'finished' && current1v1Role === 'player') {
                showGameOverModal(data);
            }
        }
    });
    window.initChat(code);
};

window.copy1v1Code = () => {
    navigator.clipboard.writeText(current1v1Id).then(function() {
        window.showToast('1v1 oda kodu kopyalandı!', 'success');
    });
};

window.leave1v1Lobby = async () => {
    if (unsubscribe1v1) unsubscribe1v1();
    if (window.unsubscribeChat) window.unsubscribeChat();
    if (game1v1TimerInterval) clearInterval(game1v1TimerInterval);
    clearPending1v1BotMove();
    if (current1v1Data && current1v1Data.status === 'active' && current1v1Role === 'player') window.setCurrentReconnectState(false);
    removeSpectatorMembership('1v1', current1v1Id, current1v1Data, current1v1Role);

    if (current1v1Data && current1v1Data.status === 'lobby') {
        const updatedPlayers = current1v1Data.players.map(function(player) {
            if (player.uid === window.currentUser.uid || isBotPlayer(player)) {
                return makeEmptySeat(player.team, get1v1SeatLabel(player.team));
            }
            return player;
        });
        const remainingPlayer = updatedPlayers.find(function(player) { return !!player.uid && !isBotPlayer(player); });
        const updates = {
            players: updatedPlayers,
            participantIds: arrayRemove(window.currentUser.uid),
            hostId: remainingPlayer ? remainingPlayer.uid : null
        };
        await updateDoc(doc(db, 'games_1v1', current1v1Id), updates);
    }

    current1v1Id = null;
    current1v1Data = null;
    current1v1Role = 'player';
    window.switchView('view-dashboard');
};

function render1v1Lobby(data) {
    document.getElementById('lobby1v1Code').innerText = data.code;
    const isHost = data.hostId === window.currentUser.uid;
    document.getElementById('hostControls1v1').style.display = isHost ? 'block' : 'none';
    if (isHost) document.getElementById('timeControlSelect1v1').value = data.timeControl || 5;

    data.players.forEach(function(player) {
        const slotId = player.team === 'white' ? 'slot-1v1-white' : 'slot-1v1-black';
        const el = document.getElementById(slotId);
        el.className = 'team-slot team-' + player.team + (player.uid ? ' taken' : '') + (player.isReady ? ' ready' : '');
        if (isBotPlayer(player)) {
            var botConfig = getBotConfig(player.botLevel);
            el.innerHTML = '<div class="seat-shell">'
                + '<div class="seat-main">'
                    + '<div class="seat-title"><span><i class="fas ' + window.escapeHtml(player.avatar || botConfig.avatar) + '"></i> ' + window.escapeHtml(player.name || botConfig.label) + '</span><span class="bot-pill" style="--bot-accent:' + window.escapeHtml(botConfig.accent) + ';">' + window.escapeHtml(botConfig.shortLabel) + '</span></div>'
                    + '<div class="seat-sub">Motor derinligi: ' + botConfig.depth + ' seviye</div>'
                + '</div>'
                + (isHost ? '<div class="seat-actions"><button class="secondary bot-remove-btn" onclick="event.stopPropagation(); remove1v1Bot(\'' + player.team + '\')"><i class="fas fa-trash"></i> BOTU KALDIR</button></div>' : '')
            + '</div>';
        } else if (player.uid) {
            el.innerHTML = '<div class="seat-shell">'
                + '<div class="seat-main">'
                    + '<div class="seat-title"><span><i class="fas ' + window.escapeHtml(player.avatar || 'fa-user') + '"></i> ' + window.escapeHtml(player.name) + ' ' + (player.uid === data.hostId ? '<i class="fas fa-crown" style="color:var(--primary); margin-left:4px;"></i>' : '') + '</span>' + (player.isReady ? '<i class="fas fa-check" style="color:var(--success)"></i>' : '<i class="fas fa-clock"></i>') + '</div>'
                    + '<div class="seat-sub">' + (player.uid === window.currentUser.uid ? 'Bu koltuk sende.' : 'Oyuncu hazirlik bekliyor.') + '</div>'
                + '</div>'
            + '</div>';
        } else {
            el.innerHTML = '<div class="seat-shell">'
                + '<div class="seat-main">'
                    + '<div class="seat-title"><span><i class="fas fa-plus"></i> ' + window.escapeHtml(get1v1SeatLabel(player.team)) + '</span></div>'
                    + '<div class="seat-sub">Tiklayip bu koltuga otur. Lobi sahibiysen asagidan AI bot da ekleyebilirsin.</div>'
                + '</div>'
                + (isHost ? '<div class="seat-actions seat-bot-picker">'
                    + '<button class="secondary seat-bot-btn easy" onclick="event.stopPropagation(); add1v1Bot(\'' + player.team + '\', \'easy\')">Kolay AI</button>'
                    + '<button class="secondary seat-bot-btn medium" onclick="event.stopPropagation(); add1v1Bot(\'' + player.team + '\', \'medium\')">Orta AI</button>'
                    + '<button class="secondary seat-bot-btn hard" onclick="event.stopPropagation(); add1v1Bot(\'' + player.team + '\', \'hard\')">Zor AI</button>'
                + '</div>' : '')
            + '</div>';
        }
        if (window.appendLobbyFriendButton) window.appendLobbyFriendButton(el, player.uid);
    });

    const mySeat = data.players.find(function(player) { return player.uid === window.currentUser.uid; });
    const btnReady = document.getElementById('btnReady1v1');
    if (mySeat) {
        btnReady.style.display = 'block';
        btnReady.innerText = mySeat.isReady ? 'HAZIRIM (BEKLENİYOR...)' : 'HAZIRIM';
        btnReady.classList.toggle('secondary', mySeat.isReady);
    } else {
        btnReady.style.display = 'none';
    }
}

window.join1v1Seat = async (team) => {
    if (!current1v1Data) return;
    const targetSeat = current1v1Data.players.find(function(player) { return player.team === team; });
    if (targetSeat.uid && targetSeat.uid !== window.currentUser.uid && !isBotPlayer(targetSeat)) return window.showToast('Bu taraf dolu.', 'error');

    let updatedPlayers = current1v1Data.players.map(function(player) {
        if (player.uid === window.currentUser.uid) {
            return makeEmptySeat(player.team, get1v1SeatLabel(player.team));
        }
        return player;
    });

    updatedPlayers = updatedPlayers.map(function(player) {
        if (player.team === team) {
            return { uid: window.currentUser.uid, name: window.currentUser.displayName, avatar: window.currentUser.photoURL || 'fa-chess-pawn', team: team, index: 0, isReady: false };
        }
        return player;
    });

    await updateDoc(doc(db, 'games_1v1', current1v1Id), {
        players: updatedPlayers,
        participantIds: arrayUnion(window.currentUser.uid)
    });
};

window.add1v1Bot = async function(team, level) {
    if (!current1v1Data || current1v1Data.hostId !== window.currentUser.uid) return window.showToast('Botu sadece lobi sahibi ekleyebilir.', 'error');
    var targetSeat = current1v1Data.players.find(function(player) { return player.team === team; });
    if (!targetSeat) return;
    if (targetSeat.uid && !isBotPlayer(targetSeat)) return window.showToast('Bu taraf zaten bir oyuncu tarafindan alindi.', 'error');
    await updateDoc(doc(db, 'games_1v1', current1v1Id), {
        players: current1v1Data.players.map(function(player) {
            return player.team === team ? makeBotPlayer(team, level) : player;
        })
    });
    if (window.initStockfish) window.initStockfish().catch(function() {});
};

window.remove1v1Bot = async function(team) {
    if (!current1v1Data || current1v1Data.hostId !== window.currentUser.uid) return;
    await updateDoc(doc(db, 'games_1v1', current1v1Id), {
        players: current1v1Data.players.map(function(player) {
            return player.team === team && isBotPlayer(player)
                ? makeEmptySeat(player.team, get1v1SeatLabel(player.team))
                : player;
        })
    });
};

window.toggleReady1v1 = async () => {
    if (!current1v1Data) return;
    const updatedPlayers = current1v1Data.players.map(function(player) {
        if (player.uid === window.currentUser.uid) return Object.assign({}, player, { isReady: !player.isReady });
        return player;
    });
    await updateDoc(doc(db, 'games_1v1', current1v1Id), { players: updatedPlayers });
};

document.getElementById('timeControlSelect1v1').onchange = async function() {
    if (!current1v1Id) return;
    await updateDoc(doc(db, 'games_1v1', current1v1Id), {
        timeControl: parseInt(document.getElementById('timeControlSelect1v1').value, 10)
    });
};

window.start1v1Game = async () => {
    if (!current1v1Data) return;
    if (current1v1Data.players.some(function(player) { return !player.uid || !player.isReady; })) {
        return window.showToast('İki oyuncu da hazır olmalı.', 'error');
    }
    if (current1v1Data.players.some(function(player) { return isBotPlayer(player); })) {
        if (window.initStockfish) window.initStockfish().catch(function() {});
    }
    const ms = (current1v1Data.timeControl || 5) * 60 * 1000;
    await updateDoc(doc(db, 'games_1v1', current1v1Id), {
        status: 'active',
        whiteTime: ms,
        blackTime: ms,
        lastMoveTime: Date.now(),
        moveCount: 0,
        winner: null,
        disconnectState: {},
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        pgn: ""
    });
    window.playGameSound('gameStart');
};

function update1v1TimerDisplay(whiteMs, blackMs) {
    const whiteText = getFormattedClock(whiteMs);
    const blackText = getFormattedClock(blackMs);
    document.getElementById('timer1v1White').innerText = whiteText;
    document.getElementById('timer1v1Black').innerText = blackText;
    if (activeFullscreenBoardMode === '1v1' && window.syncFullscreenTimers) window.syncFullscreenTimers(whiteText, blackText);
}

async function handle1v1TimeOut(loserColor) {
    if (current1v1Data.hostId === window.currentUser.uid && current1v1Data.status === 'active') {
        const winner = loserColor === 'white' ? 'black' : 'white';
        await updateDoc(doc(db, 'games_1v1', current1v1Id), {
            status: 'finished',
            winner: winner
        });
    }
}

function getFormattedClock(ms) {
    const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

function update1v1Game(data) {
    if (data.pgn) chess1v1.load_pgn(data.pgn);
    else chess1v1.load(data.fen);
    maybeResolveReconnectForfeit('1v1', current1v1Id, data);
    updateSpectatorCountUI('1v1', data);
    renderReconnectBanner('1v1', data);
    maybeSchedule1v1BotMove(data);

    if (data.moveCount > lastPlayedMoveCount1v1) {
        if (lastPlayedMoveCount1v1 !== -1) {
            const flags = data.lastMoveFlags || "";
            const isCheck = data.isCheck === true;
            const isCapture = flags.includes('c') || flags.includes('e');
            const isCastle = flags.includes('k') || flags.includes('q');
            if (isCheck) window.playGameSound('check');
            else if (isCapture) window.playGameSound('capture');
            else if (isCastle) window.playGameSound('castle');
            else window.playGameSound('move');
        }
        lastPlayedMoveCount1v1 = data.moveCount;
    } else if (data.moveCount === 0 && lastPlayedMoveCount1v1 !== 0) {
        lastPlayedMoveCount1v1 = 0;
    }

    if (game1v1TimerInterval) clearInterval(game1v1TimerInterval);
    if (data.status === 'active') {
        game1v1TimerInterval = setInterval(function() {
            const now = Date.now();
            let whiteTime = data.whiteTime;
            let blackTime = data.blackTime;
            if (data.lastMoveTime) {
                const diff = now - data.lastMoveTime;
                if (chess1v1.turn() === 'w') whiteTime = Math.max(0, whiteTime - diff);
                else blackTime = Math.max(0, blackTime - diff);
            }
            update1v1TimerDisplay(whiteTime, blackTime);
            if (whiteTime === 0 || blackTime === 0) handle1v1TimeOut(whiteTime === 0 ? 'white' : 'black');
        }, 100);
    } else {
        update1v1TimerDisplay(data.whiteTime, data.blackTime);
    }

    const turnTeam = chess1v1.turn() === 'w' ? 'white' : 'black';
    const whitePlayer = data.players.find(function(player) { return player.team === 'white'; });
    const blackPlayer = data.players.find(function(player) { return player.team === 'black'; });
    document.getElementById('p1v1-white').querySelector('span').innerText = whitePlayer ? whitePlayer.name : 'Beyaz';
    document.getElementById('p1v1-black').querySelector('span').innerText = blackPlayer ? blackPlayer.name : 'Siyah';
    document.querySelectorAll('#p1v1-white, #p1v1-black').forEach(function(el) { el.classList.remove('active'); });
    const activeTag = document.getElementById('p1v1-' + turnTeam);
    if (activeTag && data.status === 'active') activeTag.classList.add('active');
    document.getElementById('turnIndicator1v1').innerText = data.status === 'finished'
        ? 'Oyun Bitti'
        : 'Sıra: ' + ((turnTeam === 'white' ? whitePlayer : blackPlayer) || { name: 'Oyuncu' }).name;
    if (current1v1Role === 'spectator' && data.status !== 'finished') {
        document.getElementById('turnIndicator1v1').innerText = 'Izleyici modu • ' + document.getElementById('turnIndicator1v1').innerText;
    }
    draw1v1Board();
    if (window.syncBoardFullscreenUI) window.syncBoardFullscreenUI();
}

function render1v1BoardInto(boardEl) {
    if (!boardEl || !current1v1Data) return;
    boardEl.innerHTML = '';
    const myPlayer = current1v1Data.players.find(function(player) { return player.uid === window.currentUser.uid; });
    const rotate = myPlayer && myPlayer.team === 'black';
    const isMyTurn = current1v1Data.status === 'active' && myPlayer && myPlayer.team === (chess1v1.turn() === 'w' ? 'white' : 'black');
    const boardArray = chess1v1.board();

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const row = rotate ? 7 - r : r;
            const col = rotate ? 7 - c : c;
            const sq = boardArray[row][col];
            const squareName = String.fromCharCode(97 + col) + (8 - row);
            const div = document.createElement('div');
            div.className = 'square ' + ((r + c) % 2 === 0 ? 'white' : 'black');
            if (board1v1SelectedSquare === squareName) div.classList.add('selected');
            if (board1v1ValidMoves.includes(squareName)) div.classList.add('highlight');

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

            div.onclick = function() { handle1v1SquareClick(squareName, isMyTurn); };

            if (sq) {
                const piece = document.createElement('div');
                piece.className = 'piece ' + (isMyTurn ? 'active' : 'locked');
                piece.style.backgroundImage = `url('https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${sq.color}${sq.type}.png')`;
                div.appendChild(piece);
            }
            boardEl.appendChild(div);
        }
    }
}

function draw1v1Board() {
    render1v1BoardInto(document.getElementById('chessBoard1v1'));
    if (activeFullscreenBoardMode === '1v1') {
        render1v1BoardInto(document.getElementById('fullscreenBoard'));
    }
}

async function handle1v1SquareClick(squareName, isMyTurn) {
    if (!isMyTurn || current1v1Data.status !== 'active') return;

    if (board1v1ValidMoves.includes(squareName)) {
        const move = chess1v1.move({ from: board1v1SelectedSquare, to: squareName, promotion: 'q' });
        if (move) {
            await commit1v1Move(move, current1v1Data);
            return;
        }
    }

    const piece = chess1v1.get(squareName);
    if (piece && piece.color === chess1v1.turn()) {
        board1v1SelectedSquare = squareName;
        board1v1ValidMoves = chess1v1.moves({ square: squareName, verbose: true }).map(function(move) { return move.to; });
    } else {
        board1v1SelectedSquare = null;
        board1v1ValidMoves = [];
    }
    draw1v1Board();
}

window.leave1v1GameConfirm = async () => {
    const result = await Swal.fire({
        title: 'Oyundan Çık?',
        text: 'Rakibin hükmen kazanabilir.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        background: 'rgba(30,30,35,0.95)',
        color: '#fff'
    });
    if (result.isConfirmed) window.leave1v1Lobby();
};

window.load1v1History = async () => {
    document.getElementById('history1v1Modal').style.display = 'flex';
    const list = document.getElementById('history1v1List');
    list.innerHTML = '<p style="text-align:center;">Yükleniyor...</p>';
    try {
        const snapshot = await getDocs(query(collection(db, 'games_1v1'), where('participantIds', 'array-contains', window.currentUser.uid)));
        const games = [];
        snapshot.forEach(function(docSnap) {
            if (docSnap.data().status === 'finished') games.push(docSnap.data());
        });
        games.sort(function(a, b) {
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        });

        if (!games.length) {
            list.innerHTML = '<p style="text-align:center; color:#888;">Henüz tamamlanmış 1v1 maçın yok.</p>';
            return;
        }

        list.innerHTML = '';
        games.forEach(function(game) {
            const myPlayer = game.players.find(function(player) { return player.uid === window.currentUser.uid; });
            if (!myPlayer) return;
            const opponent = game.players.find(function(player) { return player.uid && player.uid !== window.currentUser.uid; });
            const isWin = game.winner === myPlayer.team;
            const isDraw = game.winner === 'draw';
            const resultColor = isWin ? 'var(--success)' : (isDraw ? 'var(--text-muted)' : 'var(--danger)');
            const resultText = isWin ? 'KAZANDIN' : (isDraw ? 'BERABERE' : 'KAYBETTİN');
            const safeGame = encodeURIComponent(JSON.stringify(game));
            const date = game.createdAt ? new Date(game.createdAt.seconds * 1000).toLocaleDateString() : '-';
            list.innerHTML += `
                <div class="history-item" style="border-left: 4px solid ${resultColor}">
                    <div>
                        <div style="font-weight:bold; color:${resultColor}">${resultText}</div>
                        <div style="font-size:0.8rem; color:#aaa;">${date} • Rakip: ${window.escapeHtml((opponent && opponent.name) || 'Bilinmiyor')}</div>
                    </div>
                    <div>
                        <button class="secondary icon-btn" onclick="openAnalysisFromEncodedGame('${safeGame}')">
                            <i class="fas fa-search-plus"></i>
                        </button>
                    </div>
                </div>`;
        });
    } catch (e) {
        console.error(e);
        list.innerHTML = '<p style="text-align:center; color:var(--danger);">Bir hata oluştu.</p>';
    }
};

window.closeHistory1v1 = () => document.getElementById('history1v1Modal').style.display = 'none';

window.create2v2Game = async () => {
    window.playGameSound('nav');
    const code = window.makeId(5);
    const gameData = {
        code: code,
        hostId: window.currentUser.uid,
        gameMode: '2v2',
        status: 'lobby',
        timeControl: 10,
        movesPerTurn: 5,
        whiteTime: 600000,
        blackTime: 600000,
        lastMoveTime: null,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        pgn: "",
        moveCount: 0,
        players: [
            {uid: window.currentUser.uid, name: window.currentUser.displayName, avatar: window.currentUser.photoURL || 'fa-chess-pawn', team: 'white', index: 0, isReady: false},
            {uid: null, name: "Boş", avatar: 'fa-plus', team: 'white', index: 1, isReady: false},
            {uid: null, name: "Boş", avatar: 'fa-plus', team: 'black', index: 0, isReady: false},
            {uid: null, name: "Boş", avatar: 'fa-plus', team: 'black', index: 1, isReady: false}
        ],
        participantIds: [window.currentUser.uid],
        spectatorIds: [],
        disconnectState: {},
        winner: null,
        createdAt: serverTimestamp()
    };
    await setDoc(doc(db, "games_2v2", code), gameData);
    window.enter2v2Game(code);
};

window.join2v2Prompt = async () => {
    window.playGameSound('nav');
    const { value: code } = await Swal.fire({
        title: 'Oda Kodu',
        input: 'text',
        inputPlaceholder: 'Örn: X9Y2Z',
        background: 'rgba(30,30,35,0.95)', color: '#fff', confirmButtonColor: '#d4af37'
    });
    if(code) window.enter2v2Game(code.trim().toUpperCase());
};

window.enter2v2Game = (code) => {
    window.releaseModeListeners('2v2');
    current2v2Id = code;
    boardSelectedSquare = null;
    boardValidMoves = [];
    chess.reset();
    lastPlayedMoveCount = -1;
    if(window.unsubscribeChat) window.unsubscribeChat();

    unsubscribe2v2 = onSnapshot(doc(db, "games_2v2", code), snap => {
        if(!snap.exists()) { window.showToast("Oyun bulunamadı.", "error"); window.leave2v2Lobby(); return; }
        const d = snap.data();
        current2v2Data = d;
        current2v2Role = d.players.some(function(player) { return player.uid === window.currentUser.uid; }) ? 'player' : 'spectator';
        syncSpectatorMembership('2v2', code, d, current2v2Role);
        syncGamePresence('2v2', code, d, current2v2Role);
        if (current2v2Role === 'player' && d.status === 'active' && !document.hidden) window.setCurrentReconnectState(true);

        if(d.status === 'lobby') {
            render2v2Lobby(d);
            window.switchView('view-2v2-lobby');
        } else if(d.status === 'active' || d.status === 'finished') {
            update2v2Game(d);
            if(document.getElementById('view-2v2-game').classList.contains('active') === false) {
                window.switchView('view-2v2-game');
                if(lastPlayedMoveCount === -1) lastPlayedMoveCount = d.moveCount;
                drawBoard();
            }
            if(d.status === 'finished' && current2v2Role === 'player') {
                showGameOverModal(d);
            }
        }
    });
    window.initChat(code);
};

window.copy2v2Code = () => {
    navigator.clipboard.writeText(current2v2Id).then(()=>window.showToast("Oda kodu kopyalandı!", "success"));
};

window.leave2v2Lobby = async () => {
    if(unsubscribe2v2) unsubscribe2v2();
    if(window.unsubscribeChat) window.unsubscribeChat();
    if(gameTimerInterval) clearInterval(gameTimerInterval);
    if(current2v2Data && current2v2Data.status === 'active' && current2v2Role === 'player') window.setCurrentReconnectState(false);
    removeSpectatorMembership('2v2', current2v2Id, current2v2Data, current2v2Role);

    if(current2v2Data && current2v2Data.status === 'lobby') {
         const newPlayers = current2v2Data.players.map(p => {
             if(p.uid === window.currentUser.uid) return {uid: null, name: "Boş", avatar: 'fa-plus', team: p.team, index: p.index, isReady: false};
             return p;
         });
         await updateDoc(doc(db, "games_2v2", current2v2Id), {
             players: newPlayers,
             participantIds: arrayRemove(window.currentUser.uid)
         });
    }
    current2v2Id = null;
    current2v2Data = null;
    current2v2Role = 'player';
    window.switchView('view-dashboard');
};

function render2v2Lobby(d) {
    document.getElementById('lobby2v2Code').innerText = d.code;
    const isHost = (d.hostId === window.currentUser.uid);
    document.getElementById('hostControls2v2').style.display = isHost ? 'block' : 'none';

    if(isHost) {
        document.getElementById('movesPerTurnSelect').value = d.movesPerTurn || 5;
        document.getElementById('timeControlSelect').value = d.timeControl || 10;
    }

    d.players.forEach(p => {
        const el = document.getElementById(`slot-${p.team === 'white' ? 'w' : 'b'}-${p.index}`);
        el.className = `team-slot team-${p.team} ${p.uid ? 'taken' : ''} ${p.isReady ? 'ready' : ''}`;
        let html = '';
        if(p.uid) {
            html = `<span><i class="fas ${p.avatar || 'fa-user'}"></i> ${window.escapeHtml(p.name)} ${p.uid===d.hostId ? '👑' : ''}</span> ${p.isReady ? '<i class="fas fa-check" style="color:var(--success)"></i>' : '<i class="fas fa-clock"></i>'}`;
            if(p.uid === window.currentUser.uid) html += ` <span style="font-size:0.7rem; color:var(--accent)">(Sen)</span>`;
        } else {
            html = `<span><i class="fas fa-plus"></i> Boş</span>`;
        }
        el.innerHTML = html;
        if (window.appendLobbyFriendButton) window.appendLobbyFriendButton(el, p.uid);
    });

    const mySlot = d.players.find(p => p.uid === window.currentUser.uid);
    const btnReady = document.getElementById('btnReady2v2');
    if(mySlot) {
        btnReady.style.display = 'block';
        btnReady.innerText = mySlot.isReady ? 'HAZIRIM (BEKLENİYOR...)' : 'HAZIRIM';
        btnReady.classList.toggle('secondary', mySlot.isReady);
    } else {
        btnReady.style.display = 'none';
    }
}

window.joinTeam = async (team, index) => {
    window.playGameSound('nav');
    const d = current2v2Data;
    const target = d.players.find(p => p.team === team && p.index === index);
    if(target.uid && target.uid !== window.currentUser.uid) return window.showToast("Bu koltuk dolu.", "error");

    let newPlayers = d.players.map(p => {
        if(p.uid === window.currentUser.uid) return { uid: null, name: "Boş", avatar: 'fa-plus', team: p.team, index: p.index, isReady: false };
        return p;
    });

    newPlayers = newPlayers.map(p => {
        if(p.team === team && p.index === index) return { ...p, uid: window.currentUser.uid, name: window.currentUser.displayName, avatar: window.currentUser.photoURL || 'fa-chess-pawn', isReady: false };
        return p;
    });

    await updateDoc(doc(db, "games_2v2", current2v2Id), {
        players: newPlayers,
        participantIds: arrayUnion(window.currentUser.uid)
    });
};

window.toggleReady2v2 = async () => {
    window.playGameSound('nav');
    const d = current2v2Data;
    const newPlayers = d.players.map(p => {
        if(p.uid === window.currentUser.uid) return { ...p, isReady: !p.isReady };
        return p;
    });
    await updateDoc(doc(db, "games_2v2", current2v2Id), { players: newPlayers });
};

const updateGameSettings = async () => {
    const tc = parseInt(document.getElementById('timeControlSelect').value);
    const mpt = parseInt(document.getElementById('movesPerTurnSelect').value);
    await updateDoc(doc(db, "games_2v2", current2v2Id), { timeControl: tc, movesPerTurn: mpt });
};
document.getElementById('timeControlSelect').onchange = updateGameSettings;
document.getElementById('movesPerTurnSelect').onchange = updateGameSettings;

window.start2v2Game = async () => {
    const d = current2v2Data;
    if(d.players.some(p => !p.uid || !p.isReady)) return window.showToast("Tüm oyuncular hazır olmalı!", "error");
    window.playGameSound('gameStart');
    const ms = d.timeControl * 60 * 1000;
    await updateDoc(doc(db, "games_2v2", current2v2Id), {
        status: 'active',
        whiteTime: ms,
        blackTime: ms,
        lastMoveTime: Date.now(),
        moveCount: 0,
        winner: null,
        disconnectState: {},
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    });
};

function update2v2Game(d) {
    if (d.pgn) {
        chess.load_pgn(d.pgn);
    } else {
        chess.load(d.fen);
    }
    maybeResolveReconnectForfeit('2v2', current2v2Id, d);
    updateSpectatorCountUI('2v2', d);
    renderReconnectBanner('2v2', d);

    if(d.moveCount > lastPlayedMoveCount) {
        if(lastPlayedMoveCount !== -1) {
            const flags = d.lastMoveFlags || "";
            const isCheck = d.isCheck === true;
            const isCapture = flags.includes('c') || flags.includes('e');
            const isCastle = flags.includes('k') || flags.includes('q');
            if (isCheck) window.playGameSound('check');
            else if (isCapture) window.playGameSound('capture');
            else if (isCastle) window.playGameSound('castle');
            else window.playGameSound('move');
        }
        lastPlayedMoveCount = d.moveCount;
    } else if (d.moveCount === 0 && lastPlayedMoveCount !== 0) {
         lastPlayedMoveCount = 0;
    }

    if(gameTimerInterval) clearInterval(gameTimerInterval);
    if(d.status === 'active') {
        gameTimerInterval = setInterval(() => {
            const now = Date.now();
            let wTime = d.whiteTime;
            let bTime = d.blackTime;

            if(d.lastMoveTime) {
                const diff = now - d.lastMoveTime;
                if(chess.turn() === 'w') wTime = Math.max(0, wTime - diff);
                else bTime = Math.max(0, bTime - diff);
            }
            updateTimerDisplay(wTime, bTime);
            if(wTime === 0 || bTime === 0) handleTimeOut(wTime === 0 ? 'white' : 'black');
        }, 100);
    } else {
        updateTimerDisplay(d.whiteTime, d.blackTime);
    }

    const movesPerTurn = d.movesPerTurn || 5;
    const movesMadeByColor = Math.floor(d.moveCount / 2);
    const activePlayerIndex = Math.floor(movesMadeByColor / movesPerTurn) % 2;
    const turnColor = chess.turn();

    const movesRemaining = movesPerTurn - (movesMadeByColor % movesPerTurn);

    updatePlayerTags(activePlayerIndex, turnColor, d.players, movesRemaining);
    drawBoard(activePlayerIndex, turnColor);
    if (window.syncBoardFullscreenUI) window.syncBoardFullscreenUI();
}

function updateTimerDisplay(w, b) {
    const whiteText = getFormattedClock(w);
    const blackText = getFormattedClock(b);
    document.getElementById('timerWhite').innerText = whiteText;
    document.getElementById('timerBlack').innerText = blackText;
    if (activeFullscreenBoardMode === '2v2' && window.syncFullscreenTimers) window.syncFullscreenTimers(whiteText, blackText);
}

async function handleTimeOut(loserColor) {
    if(current2v2Data.hostId === window.currentUser.uid && current2v2Data.status === 'active') {
         const winner = loserColor === 'white' ? 'black' : 'white';
         await updateDoc(doc(db, "games_2v2", current2v2Id), {
             status: 'finished',
             winner: winner
         });
    }
}

function updatePlayerTags(idx, color, players, movesLeft) {
    document.querySelectorAll('.player-tag').forEach(e => e.classList.remove('active'));
    players.forEach(p => {
        const el = document.getElementById(`p-${p.team === 'white' ? 'w' : 'b'}-${p.index}`);
        if(el) {
            el.querySelector('span').innerText = p.name;
            if(current2v2Data.status === 'active' && p.team === (color==='w'?'white':'black') && p.index === idx) {
                el.classList.add('active');
                document.getElementById('turnIndicator').innerText = `Sıra: ${p.name} (${movesLeft} hamle kaldı)`;
            }
        }
    });
    if(current2v2Data.status === 'finished') document.getElementById('turnIndicator').innerText = "Oyun Bitti";
    if(current2v2Role === 'spectator' && current2v2Data.status !== 'finished') {
        document.getElementById('turnIndicator').innerText = 'Izleyici modu • ' + document.getElementById('turnIndicator').innerText;
    }
}

function render2v2BoardInto(boardEl, activeIdx, turnColor) {
    if (!boardEl || !current2v2Data) return;
    boardEl.innerHTML = '';

    if(activeIdx === undefined || turnColor === undefined) {
         const movesPerTurn = current2v2Data.movesPerTurn || 5;
         const movesMadeByColor = Math.floor(current2v2Data.moveCount / 2);
         activeIdx = Math.floor(movesMadeByColor / movesPerTurn) % 2;
         turnColor = chess.turn();
    }

    const isWhiteTeam = current2v2Data.players.find(p => p.uid === window.currentUser.uid)?.team === 'white';
    const rotate = !isWhiteTeam && current2v2Data.players.find(p => p.uid === window.currentUser.uid)?.team === 'black';

    const boardArray = chess.board();
    const myP = current2v2Data.players.find(p => p.uid === window.currentUser.uid);

    const isMyTurn = myP && (myP.team === (turnColor==='w'?'white':'black')) && (myP.index === activeIdx);

    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const row = rotate ? 7-r : r;
            const col = rotate ? 7-c : c;

            const sq = boardArray[row][col];
            const squareName = String.fromCharCode(97 + col) + (8 - row);

            const div = document.createElement('div');
            div.className = `square ${(r+c)%2===0 ? 'white' : 'black'}`;
            if(boardSelectedSquare === squareName) div.classList.add('selected');
            if(boardValidMoves.includes(squareName)) div.classList.add('highlight');

            if(c === 0) {
                 const rankEl = document.createElement('span');
                 rankEl.className = 'coord coord-rank';
                 rankEl.innerText = (8 - row);
                 div.appendChild(rankEl);
            }
            if(r === 7) {
                 const fileEl = document.createElement('span');
                 fileEl.className = 'coord coord-file';
                 fileEl.innerText = String.fromCharCode(97 + col);
                 div.appendChild(fileEl);
            }

            div.onclick = () => handleSquareClick(squareName, isMyTurn);

            if(sq) {
                const piece = document.createElement('div');
                piece.className = `piece ${isMyTurn ? 'active' : 'locked'}`;
                const url = `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${sq.color}${sq.type}.png`;
                piece.style.backgroundImage = `url('${url}')`;
                div.appendChild(piece);
            }

            boardEl.appendChild(div);
        }
    }
}

function drawBoard(activeIdx, turnColor) {
    render2v2BoardInto(document.getElementById('chessBoard'), activeIdx, turnColor);
    if (activeFullscreenBoardMode === '2v2') {
        render2v2BoardInto(document.getElementById('fullscreenBoard'), activeIdx, turnColor);
    }
}

async function handleSquareClick(sq, isMyTurn) {
    if(!isMyTurn || current2v2Data.status !== 'active') return;

    if(boardValidMoves.includes(sq)) {
        const move = chess.move({ from: boardSelectedSquare, to: sq, promotion: 'q' });
        if(move) {
            const newFen = chess.fen();
            const now = Date.now();
            const timeDiff = now - current2v2Data.lastMoveTime;

            // Optimistic Audio
            const isCheck = chess.in_check();
            const isCapture = move.flags.includes('c') || move.flags.includes('e');
            const isCastle = move.flags.includes('k') || move.flags.includes('q');
            if (isCheck) window.playGameSound('check');
            else if (isCapture) window.playGameSound('capture');
            else if (isCastle) window.playGameSound('castle');
            else window.playGameSound('move');

            // Set local flag to prevent double audio from Firebase listener
            lastPlayedMoveCount = current2v2Data.moveCount + 1;

            let updates = {
                fen: newFen,
                pgn: chess.pgn(), // Update PGN for Analysis
                lastMoveTime: now,
                moveCount: current2v2Data.moveCount + 1,
                lastMoveFlags: move.flags,
                isCheck: isCheck
            };

            if(chess.turn() === 'b') {
                updates.whiteTime = Math.max(0, current2v2Data.whiteTime - timeDiff);
            } else {
                updates.blackTime = Math.max(0, current2v2Data.blackTime - timeDiff);
            }

            if(chess.game_over()) {
                updates.status = 'finished';
                if(chess.in_checkmate()) {
                     updates.winner = chess.turn() === 'w' ? 'black' : 'white';
                } else {
                     updates.winner = 'draw';
                }
            }

            boardSelectedSquare = null;
            boardValidMoves = [];
            drawBoard();

            await updateDoc(doc(db, "games_2v2", current2v2Id), updates);
            return;
        }
    }

    const piece = chess.get(sq);
    if(piece && piece.color === chess.turn()) {
        boardSelectedSquare = sq;
        boardValidMoves = chess.moves({ square: sq, verbose: true }).map(m => m.to);
        drawBoard();
    } else {
        boardSelectedSquare = null;
        boardValidMoves = [];
        drawBoard();
    }
}

window.leave2v2GameConfirm = async () => {
     window.playGameSound('nav');
     const res = await Swal.fire({ title: 'Oyundan Çık?', text: "Takımın hükmen mağlup sayılabilir.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', background: 'rgba(30,30,35,0.95)', color: '#fff'});
     if(res.isConfirmed) window.leave2v2Lobby();
};

window.load2v2History = async () => {
    window.playGameSound('nav');
    document.getElementById('history2v2Modal').style.display = 'flex';
    const list = document.getElementById('history2v2List');
    list.innerHTML = '<p style="text-align:center;">Yükleniyor...</p>';
    try {
        const q = query(collection(db, "games_2v2"), where("participantIds", "array-contains", window.currentUser.uid));
        const snap = await getDocs(q);
        list.innerHTML = '';
        if(snap.empty) { list.innerHTML = '<p style="text-align:center; color:#888;">Henüz maç oynanmadı.</p>'; return; }
        let games = [];
        snap.forEach(d => { if(d.data().status === 'finished') games.push(d.data()); });
        games.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
        if(games.length === 0) { list.innerHTML = '<p style="text-align:center; color:#888;">Henüz tamamlanmış maç yok.</p>'; return; }
        games.forEach(game => {
            const myP = game.players.find(p => p.uid === window.currentUser.uid);
            if(!myP) return;
            const isWin = game.winner === myP.team;
            const isDraw = game.winner === 'draw';
            const resultColor = isWin ? 'var(--success)' : (isDraw ? 'var(--text-muted)' : 'var(--danger)');
            const resultText = isWin ? 'KAZANDIN' : (isDraw ? 'BERABERE' : 'KAYBETTİN');
            const partner = game.players.find(p => p.team === myP.team && p.uid !== window.currentUser.uid)?.name || "Bilinmiyor";
            const date = game.createdAt ? new Date(game.createdAt.seconds * 1000).toLocaleDateString() : "-";

            const safeGame = encodeURIComponent(JSON.stringify(game));

            list.innerHTML += `
                <div class="history-item" style="border-left: 4px solid ${resultColor}">
                    <div>
                        <div style="font-weight:bold; color:${resultColor}">${resultText}</div>
                        <div style="font-size:0.8rem; color:#aaa;">${date} • Partner: ${partner}</div>
                    </div>
                    <div>
                         <button class="secondary icon-btn" onclick="openAnalysisFromEncodedGame('${safeGame}')">
                            <i class="fas fa-search-plus"></i>
                         </button>
                    </div>
                </div>`;
        });
    } catch(e) { console.error(e); list.innerHTML = '<p style="text-align:center; color:var(--danger);">Bir hata oluştu.</p>'; }
};
window.closeHistory2v2 = () => document.getElementById('history2v2Modal').style.display='none';

function showGameOverModal(d) {
    if(document.getElementById('gameOverModal').style.display === 'flex') return;
    if (activeFullscreenBoardMode && window.closeBoardFullscreen) window.closeBoardFullscreen();
    currentGameOverPayload = d;
    confetti({particleCount: 200, spread: 150, origin: { y: 0.6 }});
    window.playGameSound('gameEnd');
    let winnerText = "";
    let winners = [];
    const is1v1 = d.gameMode === '1v1';
    if(d.winner === 'draw') { winnerText = "BERABERE"; winners = ["Dostluk Kazandı"]; }
    else {
        winnerText = d.winner === 'white'
            ? (is1v1 ? "KAZANAN: BEYAZ" : "KAZANAN: BEYAZ TAKIM")
            : (is1v1 ? "KAZANAN: SİYAH" : "KAZANAN: SİYAH TAKIM");
        winners = d.players.filter(p => p.team === d.winner).map(p => p.name);
    }
    document.getElementById('winnerText').innerText = winnerText;
    document.getElementById('winnerText').style.color = d.winner === 'white' ? '#fff' : '#aaa';
    document.getElementById('winnerPlayers').innerText = winners.join(' & ');
    document.getElementById('gameOverModal').style.display = 'flex';
}
window.closeGameOver = () => {
    document.getElementById('gameOverModal').style.display = 'none';
    if(currentGameOverPayload && currentGameOverPayload.pgn) {
        if (window.openAnalysis) window.openAnalysis(currentGameOverPayload.pgn, currentGameOverPayload.players, currentGameOverPayload.fen || null);
    } else if (currentGameOverPayload && currentGameOverPayload.gameMode === '1v1') {
        window.leave1v1Lobby();
    } else {
        window.leave2v2Lobby();
    }
    currentGameOverPayload = null;
};

// --- Reconnection & Presence Helpers ---
function getGameCollectionName(mode) {
    return mode === '1v1' ? 'games_1v1' : 'games_2v2';
}

function getGameDocRef(mode, id) {
    return doc(db, getGameCollectionName(mode), id);
}

function getGameSpectatorCount(data) {
    return Array.isArray(data && data.spectatorIds) ? data.spectatorIds.length : 0;
}

function updateSpectatorCountUI(mode, data) {
    var count = String(getGameSpectatorCount(data));
    var ids = mode === '1v1'
        ? ['spectatorCount1v1Lobby', 'spectatorCount1v1Game']
        : ['spectatorCount2v2Lobby', 'spectatorCount2v2Game'];
    ids.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.innerText = count;
    });
}

function getDisconnectedPlayers(data) {
    var disconnectState = Object.assign({}, (data && data.disconnectState) || {});
    return (Array.isArray(data && data.players) ? data.players : []).filter(function(player) {
        return !!(player && player.uid && disconnectState[player.uid]);
    }).map(function(player) {
        var disconnectedAt = disconnectState[player.uid];
        return {
            player: player,
            disconnectedAt: disconnectedAt,
            remainingMs: Math.max(0, RECONNECT_GRACE_MS - (Date.now() - disconnectedAt))
        };
    });
}

function renderReconnectBanner(mode, data) {
    var ids = mode === '1v1'
        ? ['reconnectBanner1v1Lobby', 'reconnectBanner1v1']
        : ['reconnectBanner2v2Lobby', 'reconnectBanner2v2'];
    var disconnected = getDisconnectedPlayers(data);
    ids.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (!disconnected.length || data.status === 'finished') {
            el.style.display = 'none';
            el.innerText = '';
            return;
        }
        var message = disconnected.map(function(item) {
            var name = item.player.name || 'Oyuncu';
            var left = Math.max(1, Math.ceil(item.remainingMs / 1000));
            return name + ' baglantiyi kaybetti. ' + left + ' sn icinde donmezse mac sonuclanacak.';
        }).join(' ');
        el.innerText = message;
        el.style.display = 'block';
    });
}

function maybeResolveReconnectForfeit(mode, gameId, data) {
    if (!data || data.status !== 'active') return;
    var disconnected = getDisconnectedPlayers(data).filter(function(item) {
        return item.remainingMs <= 0;
    });
    if (!disconnected.length) return;
    if (!window.throttleAction('reconnect_forfeit', mode + ':' + gameId, 1, 1800)) return;
    var winner = getReconnectWinnerFromPlayers(mode, disconnected.map(function(item) {
        return item.player;
    }));
    updateDoc(getGameDocRef(mode, gameId), {
        status: 'finished',
        winner: winner,
        finishReason: 'disconnect',
        finishedAtMs: Date.now()
    }).catch(function() {});
}

function getReconnectWinnerFromPlayers(mode, players) {
    if (!Array.isArray(players) || !players.length) return null;
    const getTeamOpponent = (team) => team === 'white' ? 'black' : 'white';
    if (mode === '1v1') {
        if (players.length >= 2) return 'draw';
        return getTeamOpponent(players[0].team);
    }
    return getTeamOpponent(players[0].team);
}

function syncGamePresence(mode, code, data, role) {
    if (!data) return;
    updateSpectatorCountUI(mode, data);
    renderReconnectBanner(mode, data);
    var saved = window.readLocalActiveGame();
    if (role === 'player' && data.status === 'active') {
        var disconnectedAt = data.disconnectState && window.currentUser ? data.disconnectState[window.currentUser.uid] : null;
        if (disconnectedAt) window.markLocalActiveGameDisconnected(mode, code, disconnectedAt);
        else window.rememberLocalActiveGame(mode, code);
    }
    else if (saved && saved.mode === mode && saved.code === code) window.clearLocalActiveGame(mode);
    if (data.status === 'finished') window.clearLocalActiveGame(mode);
    if (window.pushProfilePresence) window.pushProfilePresence();
}

function syncSpectatorMembership(mode, code, data, role) {
    if (!window.currentUser || !data) return;
    var spectatorIds = Array.isArray(data.spectatorIds) ? data.spectatorIds.slice() : [];
    var isSpectator = role === 'spectator';
    var hasMe = spectatorIds.indexOf(window.currentUser.uid) !== -1;
    if (isSpectator && !hasMe) {
        updateDoc(getGameDocRef(mode, code), { spectatorIds: arrayUnion(window.currentUser.uid) }).catch(function() {});
    } else if (!isSpectator && hasMe) {
        updateDoc(getGameDocRef(mode, code), { spectatorIds: arrayRemove(window.currentUser.uid) }).catch(function() {});
    }
}

function removeSpectatorMembership(mode, code, data, role) {
    if (!window.currentUser || !code || role !== 'spectator') return;
    var spectatorIds = Array.isArray(data && data.spectatorIds) ? data.spectatorIds : [];
    if (spectatorIds.indexOf(window.currentUser.uid) === -1) return;
    updateDoc(getGameDocRef(mode, code), { spectatorIds: arrayRemove(window.currentUser.uid) }).catch(function() {});
}

window.setCurrentReconnectState = (isConnected) => {
    var ctx = window.getCurrentReconnectContext();
    if (!ctx || !window.currentUser) return;
    var path = 'disconnectState.' + window.currentUser.uid;
    var updates = {};
    if (isConnected) {
        if (!(ctx.data.disconnectState && ctx.data.disconnectState[window.currentUser.uid])) return;
        updates[path] = deleteField();
        window.rememberLocalActiveGame(ctx.mode, ctx.id);
    } else {
        if (ctx.data.disconnectState && ctx.data.disconnectState[window.currentUser.uid]) return;
        updates[path] = Date.now();
        window.markLocalActiveGameDisconnected(ctx.mode, ctx.id, updates[path]);
    }
    updateDoc(getGameDocRef(ctx.mode, ctx.id), updates).catch(function() {});
};

window.copySpectatorLink = function(mode) {
    var code = mode === '1v1'
        ? (current1v1Data && (current1v1Data.code || current1v1Id))
        : (current2v2Data && (current2v2Data.code || current2v2Id));
    if (!code) return window.showToast('Aktif oda kodu yok.', 'error');
    var url = window.location.origin + window.location.pathname + '?watchMode=' + encodeURIComponent(mode) + '&watchCode=' + encodeURIComponent(code);
    navigator.clipboard.writeText(url).then(function() {
        window.showToast('Izleyici linki kopyalandi.', 'success');
    });
};

window.watchLiveGamePrompt = async function() {
    var result = await Swal.fire({
        title: 'Canli Izleme',
        html: '<select id="watchModeSelect" class="swal2-input" style="width:100%; background:#111827; color:#fff;">'
            + '<option value="2v2">2v2 Satranc</option>'
            + '<option value="1v1">1v1 Klasik</option>'
            + '</select>'
            + '<input id="watchCodeInput" class="swal2-input" placeholder="Oda kodu" style="text-transform:uppercase; letter-spacing:0.16em;">',
        showCancelButton: true,
        confirmButtonText: 'IZLE',
        background: 'rgba(30,30,35,0.95)',
        color: '#fff',
        confirmButtonColor: '#0ea5e9',
        preConfirm: function() {
            return {
                mode: document.getElementById('watchModeSelect').value,
                code: window.sanitizeUserText(document.getElementById('watchCodeInput').value, 12).toUpperCase()
            };
        }
    });
    if (!result.value || !result.value.code) return;
    if (result.value.mode === '1v1') window.enter1v1Game(result.value.code);
    else window.enter2v2Game(result.value.code);
};

function getSavedReconnectRemainingMs(saved, data) {
    if (!window.currentUser) return 0;
    var disconnectedAt = data && data.disconnectState ? data.disconnectState[window.currentUser.uid] : null;
    if (!disconnectedAt && saved) disconnectedAt = saved.disconnectedAtMs || saved.ts || null;
    if (!disconnectedAt) return 0;
    return Math.max(0, (disconnectedAt + RECONNECT_GRACE_MS) - Date.now());
}

async function forfeitSavedActiveGame(saved, data, finishReason) {
    if (!saved || !saved.mode || !saved.code || !window.currentUser) return false;
    var latestData = data;
    if (!latestData) {
        var latestSnap = await getDoc(getGameDocRef(saved.mode, saved.code)).catch(function() { return null; });
        if (!latestSnap || !latestSnap.exists()) {
            window.clearLocalActiveGame(saved.mode);
            return false;
        }
        latestData = latestSnap.data() || {};
    }
    if (latestData.status !== 'active') {
        window.clearLocalActiveGame(saved.mode);
        return false;
    }
    var myPlayer = Array.isArray(latestData.players) ? latestData.players.find(function(player) {
        return player.uid === window.currentUser.uid;
    }) : null;
    if (!myPlayer) {
        window.clearLocalActiveGame(saved.mode);
        return false;
    }
    var updated = true;
    await updateDoc(getGameDocRef(saved.mode, saved.code), {
        status: 'finished',
        winner: getReconnectWinnerFromPlayers(saved.mode, [myPlayer]),
        finishReason: finishReason || 'disconnect',
        finishedAtMs: Date.now()
    }).catch(function() {
        updated = false;
    });
    if (!updated) return false;
    window.clearLocalActiveGame(saved.mode);
    return true;
}

window.tryReconnectFromDashboard = async function(isAuto) {
    const currentUser = window.currentUser;
    const currentViewId = window.currentViewId;
    if (!currentUser || currentViewId !== 'view-dashboard' || window.getCurrentReconnectContext() || current1v1Id || current2v2Id) return false;
    var saved = window.readLocalActiveGame();
    if (!saved || !saved.mode || !saved.code) return false;
    if (saved.mode !== '1v1' && saved.mode !== '2v2') {
        window.clearLocalActiveGame();
        return false;
    }

    var promptKey = saved.mode + ':' + saved.code;
    if (reconnectPromptShownFor === promptKey) return false;
    reconnectPromptShownFor = promptKey;

    try {
        var gameSnap = await getDoc(getGameDocRef(saved.mode, saved.code)).catch(function() { return null; });
        if (!gameSnap || !gameSnap.exists()) {
            window.clearLocalActiveGame(saved.mode);
            return false;
        }

        var data = gameSnap.data() || {};
        if (data.status !== 'active') {
            window.clearLocalActiveGame(saved.mode);
            return false;
        }

        var myPlayer = Array.isArray(data.players) ? data.players.find(function(player) {
            return player.uid === currentUser.uid;
        }) : null;
        if (!myPlayer) {
            window.clearLocalActiveGame(saved.mode);
            return false;
        }

        var remainingMs = getSavedReconnectRemainingMs(saved, data);
        if (remainingMs <= 0) {
            if (await forfeitSavedActiveGame(saved, data, 'disconnect_timeout')) {
                window.showToast('Reconnect suresi doldu. Mac hukmen sonuclandirildi.', 'warning');
            }
            return false;
        }

        var remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
        var result = await Swal.fire({
            title: 'Aktif mac bulundu',
            html: '<div style="text-align:left; line-height:1.6;">'
                + '<div><strong>' + window.escapeHtml(window.getModeLabel(saved.mode)) + '</strong> macin hala aktif gorunuyor.</div>'
                + '<div style="margin-top:10px; color:#facc15; font-weight:700;">' + remainingSeconds + ' saniyelik reconnect suren kaldi.</div>'
                + '<div style="margin-top:10px; color:#cbd5f5;">Simdi katilirsan oyuna devam edersin. Vazgecersen hukmen maglup sayilacaksin.</div>'
                + '</div>',
            icon: 'warning',
            showDenyButton: true,
            showCancelButton: false,
            confirmButtonText: 'Maca Katil',
            denyButtonText: 'Hukmen Kaybet',
            allowOutsideClick: false,
            allowEscapeKey: false,
            background: 'rgba(30,30,35,0.95)',
            color: '#fff',
            confirmButtonColor: '#d4af37',
            denyButtonColor: '#dc2626'
        });

        if (result.isConfirmed) {
            if (saved.mode === '1v1') window.enter1v1Game(saved.code);
            else window.enter2v2Game(saved.code);
            return true;
        }

        if (result.isDenied) {
            if (await forfeitSavedActiveGame(saved, data, 'reconnect_declined')) {
                window.showToast('Mac hukmen sonuclandirildi.', 'warning');
            } else {
                window.showToast('Mac sonucu guncellenemedi. Tekrar dene.', 'error');
            }
        }

        return false;
    } finally {
        reconnectPromptShownFor = null;
    }
};

window.scheduleDashboardReconnectPrompt = () => {
    if (!window.currentUser || window.currentViewId !== 'view-dashboard') return;
    setTimeout(function() {
        window.tryReconnectFromDashboard(true).catch(function() {});
    }, 120);
};

// --- QUIZ GAME LOGIC ---
window.startQuizBuilder = () => {
    const name = document.getElementById('newQuizName').value.trim();
    if(!name) return window.showToast("Lütfen bir quiz adı girin.", "error");
    quizBuilderQuestions = [];
    window.switchView('view-quiz-builder');
    updateBuilderUI();
};

window.addQuizQuestionUI = () => {
    quizBuilderQuestions.push({
        q: "",
        img: "",
        opts: ["", "", "", ""],
        correct: 0,
        time: 20
    });
    updateBuilderUI();
};

window.removeQuestion = (index) => {
    quizBuilderQuestions.splice(index, 1);
    updateBuilderUI();
};

function updateBuilderUI() {
    const container = document.getElementById('quizBuilderList');
    if (!container) return;
    container.innerHTML = "";

    quizBuilderQuestions.forEach((q, idx) => {
        const div = document.createElement('div');
        div.className = 'quiz-builder-item';
        div.innerHTML = `
            <i class="fas fa-trash remove-q" onclick="removeQuestion(${idx})"></i>
            <div style="font-weight:bold; margin-bottom:5px; color:var(--quiz-color);">Soru ${idx + 1}</div>
            <input type="text" placeholder="Soru Metni Giriniz..." value="${q.q}" oninput="updateQData(${idx}, 'q', this.value)" style="margin-bottom:5px;">

            <div class="file-upload-wrapper" style="font-size:0.8rem;">
                 ${q.img ? '<i class="fas fa-image" style="color:var(--success)"></i> Resim Yüklendi' : '<i class="fas fa-cloud-upload-alt"></i> Resim Yükle (İsteğe Bağlı)'}
                 <input type="file" accept="image/png, image/jpeg" onchange="handleImageUpload(this, ${idx})">
            </div>
            <img src="${q.img}" class="q-img-preview" id="preview-${idx}" onerror="this.style.display='none'">

            <div class="quiz-opt-grid">
                ${[0,1,2,3].map(i => `
                    <div style="position:relative;">
                        <input type="text" class="quiz-opt-input ${q.correct===i?'correct':''}"
                            placeholder="Seçenek ${['A','B','C','D'][i]}"
                            value="${q.opts[i]}"
                            oninput="updateQData(${idx}, 'opt', this.value, ${i})">
                        <input type="radio" name="correct-${idx}" ${q.correct===i?'checked':''}
                            onclick="updateQData(${idx}, 'correct', ${i})"
                            style="position:absolute; right:5px; top:10px; width:20px; height:20px; cursor:pointer;" title="Doğru Cevap Olarak İşaretle">
                    </div>
                `).join('')}
            </div>
            <div style="margin-top:10px; display:flex; align-items:center; gap:10px;">
                <label style="font-size:0.8rem;">Süre (sn):</label>
                <input type="number" value="${q.time}" min="5" max="60" style="width:60px; text-align:center; margin:0;" onchange="updateQData(${idx}, 'time', this.value)">
            </div>
        `;
        container.appendChild(div);
        if(q.img) document.getElementById(`preview-${idx}`).style.display = 'block';
    });

    const sum = document.getElementById('builderSummary');
    if (sum) sum.innerText = `${quizBuilderQuestions.length} Soru Eklendi`;
}

window.handleImageUpload = (input, idx) => {
    if (input.files && input.files[0]) {
        if(input.files[0].size > 800000) {
             window.showToast("Resim boyutu çok büyük! (Max 800KB)", "error");
             input.value = "";
             return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            quizBuilderQuestions[idx].img = e.target.result;
            updateBuilderUI();
        }
        reader.readAsDataURL(input.files[0]);
    }
};

window.updateQData = (idx, field, val, subIdx = null) => {
    if(field === 'q') quizBuilderQuestions[idx].q = val;
    if(field === 'opt') quizBuilderQuestions[idx].opts[subIdx] = val;
    if(field === 'correct') { quizBuilderQuestions[idx].correct = parseInt(val); updateBuilderUI(); }
    if(field === 'time') quizBuilderQuestions[idx].time = parseInt(val);
};

window.saveAndStartQuiz = async () => {
    if(quizBuilderQuestions.length === 0) return window.showToast("En az 1 soru eklemelisin!", "error");
    for(let i=0; i<quizBuilderQuestions.length; i++) {
        const q = quizBuilderQuestions[i];
        if(!q.q) return window.showToast(`${i+1}. sorunun metni eksik!`, "error");
        if(q.opts.some(o => !o)) return window.showToast(`${i+1}. sorunun seçenekleri eksik!`, "error");
    }

    const name = document.getElementById('newQuizName').value.trim();
    const hostPlays = false;
    const code = window.makeId(4);

    const initialPlayers = [];
    if(hostPlays) {
         initialPlayers.push({ uid: window.currentUser.uid, name: window.currentUser.displayName, avatar: window.currentUser.photoURL, score: 0, answers: {} });
    }

    const quizData = {
        code: code,
        name: name,
        hostId: window.currentUser.uid,
        status: 'lobby',
        state: 'waiting',
        currentQuestion: 0,
        questions: quizBuilderQuestions,
        players: initialPlayers,
        settings: { speedBonus: true, hostParticipate: hostPlays },
        createdAt: serverTimestamp(),
        startTime: null
    };

    try {
        await setDoc(doc(db, "games_quiz", code), quizData);
        window.enterQuizGame(code);
    } catch(e) {
        console.error(e);
        window.showToast("Hata oluştu: " + e.message, "error");
    }
};

window.joinQuizPrompt = async () => {
    const code = document.getElementById('quizJoinCode').value.trim().toUpperCase();
    if(!code) return window.showToast("Kod girin.", "error");
    window.enterQuizGame(code);
};

window.enterQuizGame = (code) => {
    window.releaseModeListeners('quiz');
    if(unsubscribeQuiz) unsubscribeQuiz();
    currentQuizId = code;

    unsubscribeQuiz = onSnapshot(doc(db, "games_quiz", code), async (snap) => {
        if(!snap.exists()) { window.showToast("Quiz bulunamadı veya bitti.", "error"); window.leaveQuizLobby(); return; }
        const d = snap.data();
        currentQuizData = d;

        const myPlayer = d.players.find(p => p.uid === window.currentUser.uid);

        if(d.hostId !== window.currentUser.uid && !myPlayer && d.status === 'lobby') {
            const newPlayer = { uid: window.currentUser.uid, name: window.currentUser.displayName, avatar: window.currentUser.photoURL, score: 0, answers: {} };
            const newPlayers = [...d.players, newPlayer];
            await updateDoc(doc(db, "games_quiz", code), { players: newPlayers });
            return;
        }

        if(d.hostId === window.currentUser.uid && d.state === 'question' && d.status === 'active') {
             const qIdx = d.currentQuestion;
             const answerCount = d.players.filter(p => p.answers && p.answers[qIdx]).length;
             const activePlayerCount = d.players.length;

             if(activePlayerCount > 0 && answerCount === activePlayerCount) {
                 setTimeout(() => window.quizForceNext(), 1000);
             }
        }

        if(d.status === 'lobby') {
            renderQuizLobby(d);
            window.switchView('view-quiz-lobby');
        } else if(d.status === 'active') {
            renderQuizGame(d);
            if(!document.getElementById('view-quiz-game').classList.contains('active')) {
                window.switchView('view-quiz-game');
            }
        } else if(d.status === 'finished') {
            renderQuizResults(d);
            window.switchView('view-quiz-end');
        }
    });
};

function renderQuizLobby(d) {
    document.getElementById('quizLobbyTitle').innerText = d.name;
    document.getElementById('quizCodeDisplay').innerText = d.code;
    document.getElementById('quizPlayerCount').innerText = d.players.length;

    const isHost = (d.hostId === window.currentUser.uid);
    document.getElementById('quizHostControls').style.display = isHost ? 'block' : 'none';
    document.getElementById('quizWaitingMsg').style.display = isHost ? 'none' : 'block';

    if(isHost) {
        document.getElementById('hostParticipateToggle').checked = d.settings.hostParticipate;
    }

    const list = document.getElementById('quizPlayerList');
    if (!list) return;
    list.innerHTML = "";
    d.players.forEach(p => {
        const el = document.createElement('div');
        el.className = `slot-item ${p.uid===window.currentUser.uid ? 'me' : ''}`;
        el.innerHTML = `<div style="font-size:2rem; margin-bottom:5px;"><i class="fas ${p.avatar || 'fa-user'}"></i></div>
                        <div style="font-weight:bold;">${p.name}</div>
                        <div style="font-size:0.8rem;">0 Puan</div>`;
        if (window.appendLobbyFriendButton) window.appendLobbyFriendButton(el, p.uid);
        list.appendChild(el);
    });
}

window.toggleHostParticipation = async (shouldParticipate) => {
    if(!currentQuizData) return;
    let newPlayers = [...currentQuizData.players];

    if(shouldParticipate) {
         if(!newPlayers.find(p => p.uid === window.currentUser.uid)) {
             newPlayers.push({ uid: window.currentUser.uid, name: window.currentUser.displayName, avatar: window.currentUser.photoURL, score: 0, answers: {} });
         }
    } else {
         newPlayers = newPlayers.filter(p => p.uid !== window.currentUser.uid);
    }

    await updateDoc(doc(db, "games_quiz", currentQuizId), {
        players: newPlayers,
        "settings.hostParticipate": shouldParticipate
    });
};

window.copyQuizCode = () => { navigator.clipboard.writeText(currentQuizId); window.showToast("Kod kopyalandı!", "success"); };
window.leaveQuizLobby = () => { if(unsubscribeQuiz) unsubscribeQuiz(); currentQuizId=null; window.switchView('view-quiz-menu'); };

window.launchQuizGame = async () => {
    const bonus = document.getElementById('speedBonusToggle').checked;
    await updateDoc(doc(db, "games_quiz", currentQuizId), {
        status: 'active',
        state: 'question',
        currentQuestion: 0,
        "settings.speedBonus": bonus,
        startTime: Date.now()
    });
    window.playGameSound('gameStart');
};

let localTimerAnim = null;
let autoNextTimeout = null;

function renderQuizGame(d) {
    const qIdx = d.currentQuestion;
    const qData = d.questions[qIdx];
    const isHost = d.hostId === window.currentUser.uid;

    document.getElementById('quizQIndex').innerText = `Soru ${qIdx + 1} / ${d.questions.length}`;
    const myP = d.players.find(p => p.uid === window.currentUser.uid);
    document.getElementById('quizScoreDisplay').innerText = (myP ? myP.score : 0) + " Puan";

    document.getElementById('quizQuestionText').innerText = qData.q;
    const imgEl = document.getElementById('quizQuestionImg');
    if(qData.img) { imgEl.src = qData.img; imgEl.style.display='block'; } else { imgEl.style.display='none'; }

    if(isHost) {
        document.getElementById('quizHostGameControls').style.display = 'block';
        document.getElementById('quizAnswerCount').innerText = `${d.players.filter(p => p.answers && p.answers[qIdx]).length} / ${d.players.length} Cevap`;
    } else {
        document.getElementById('quizHostGameControls').style.display = 'none';
    }

    if(d.state === 'question') {
        document.getElementById('quizIntermission').style.display = 'none';
        document.getElementById('quizResultMsg').style.display = 'none';
        document.getElementById('autoNextTimer').style.display = 'none';

        const el = document.getElementById('quizTimerFill');
        if (el) {
            el.style.transition = 'none';
            el.style.width = '100%';

            setTimeout(() => {
                el.style.transition = `width ${qData.time}s linear`;
                el.style.width = '0%';
            }, 50);
        }

        const optsDiv = document.getElementById('quizOptionGrid');
        if (optsDiv) {
            optsDiv.style.pointerEvents = 'auto';
            optsDiv.style.opacity = '1';

            [0,1,2,3].forEach(i => {
                const btn = optsDiv.children[i];
                if (btn) {
                    btn.querySelector('span').innerText = qData.opts[i];
                    btn.className = `quiz-btn opt-${i}`;

                    if(myP && myP.answers && myP.answers[qIdx]) {
                        if(myP.answers[qIdx].selected === i) btn.classList.add('selected');
                        else btn.classList.add('disabled');
                        optsDiv.style.pointerEvents = 'none';
                    }
                }
            });
        }

        if(isHost && !localTimerAnim) {
             if(autoNextTimeout) clearTimeout(autoNextTimeout);

             localTimerAnim = setTimeout(() => {
                 window.quizForceNext();
             }, qData.time * 1000 + 1000);
        }

    } else if(d.state === 'reveal') {
        const tf = document.getElementById('quizTimerFill');
        if (tf) {
            tf.style.transition = 'none';
            tf.style.width = '0%';
        }
        if(localTimerAnim) { clearTimeout(localTimerAnim); localTimerAnim = null; }

        document.getElementById('quizIntermission').style.display = 'none';

        const optsDiv = document.getElementById('quizOptionGrid');
        if (optsDiv) {
            optsDiv.style.pointerEvents = 'none';
            [0,1,2,3].forEach(i => {
                const btn = optsDiv.children[i];
                if (btn) {
                    if(i === qData.correct) {
                        btn.classList.add('is-correct');
                    } else {
                        btn.classList.add('is-wrong');
                    }
                }
            });
        }

        const resDiv = document.getElementById('quizResultMsg');
        if (resDiv) {
            resDiv.style.display = 'block';
            if(myP && myP.answers && myP.answers[qIdx]) {
                const isCor = myP.answers[qIdx].selected === qData.correct;
                resDiv.innerText = isCor ? "DOĞRU! 🎉" : "YANLIŞ... 😔";
                resDiv.style.color = isCor ? "var(--success)" : "var(--danger)";
                if(isCor) window.playGameSound('capture');
            } else {
                resDiv.innerText = myP ? "CEVAP VERMEDİN ⌛" : "İZLEYİCİ MODU";
                resDiv.style.color = "#aaa";
            }
        }

        if(isHost && !autoNextTimeout) {
            autoNextTimeout = setTimeout(() => {
                window.quizGoLeaderboard();
                autoNextTimeout = null;
            }, 3000);
        }

    } else if(d.state === 'leaderboard') {
        document.getElementById('quizResultMsg').style.display = 'none';
        document.getElementById('quizIntermission').style.display = 'block';
        const optsDiv = document.getElementById('quizOptionGrid');
        if (optsDiv) optsDiv.style.opacity = '0.3';
        document.getElementById('autoNextTimer').style.display = 'block';

        const sorted = [...d.players].sort((a,b) => b.score - a.score);
        const topList = document.getElementById('quizTopList');
        if (topList) {
            topList.innerHTML = sorted.map((p,i) =>
                `<div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #444; color:${p.uid===window.currentUser.uid ? 'var(--quiz-color)' : 'white'}; font-weight:${p.uid===window.currentUser.uid ? 'bold' : 'normal'}">
                    <span>${i===0?'👑 ':''}${i+1}. ${p.name}</span> <span style="font-weight:bold;">${p.score} P</span>
                 </div>`
            ).join('');
        }

        if(isHost && !autoNextTimeout) {
            autoNextTimeout = setTimeout(() => {
                window.quizNextQuestionReal();
                autoNextTimeout = null;
            }, 4000);
        }
    }
}

window.submitQuizAnswer = async (optIdx) => {
    window.playGameSound('move');
    const qIdx = currentQuizData.currentQuestion;

    const optsDiv = document.getElementById('quizOptionGrid');
    if (optsDiv && optsDiv.children[optIdx]) {
        optsDiv.children[optIdx].classList.add('selected');
        optsDiv.style.pointerEvents = 'none';
        for(let i=0; i<4; i++) {
            if(i!==optIdx && optsDiv.children[i]) optsDiv.children[i].classList.add('disabled');
        }
    }

    const myIdx = currentQuizData.players.findIndex(p => p.uid === window.currentUser.uid);
    if(myIdx === -1) return;

    const newPlayers = [...currentQuizData.players];
    if(!newPlayers[myIdx].answers) newPlayers[myIdx].answers = {};

    newPlayers[myIdx].answers[qIdx] = {
        selected: optIdx,
        time: Date.now()
    };

    await updateDoc(doc(db, "games_quiz", currentQuizId), { players: newPlayers });
};

window.quizForceNext = async () => {
    if(!currentQuizData || currentQuizData.hostId !== window.currentUser.uid) return;
    if(localTimerAnim) { clearTimeout(localTimerAnim); localTimerAnim = null; }

    if(currentQuizData.state === 'question') {
        const qIdx = currentQuizData.currentQuestion;
        const correctOpt = currentQuizData.questions[qIdx].correct;
        const useBonus = currentQuizData.settings.speedBonus;

        let updatedPlayers = currentQuizData.players.map(p => {
            if(!p.answers || !p.answers[qIdx]) return p;
            const ans = p.answers[qIdx];
            if(ans.selected === correctOpt) {
                p.score += 1;
                p.isCorrect = true;
                p.ansTime = ans.time;
            } else {
                p.isCorrect = false;
            }
            return p;
        });

        if(useBonus) {
            const correctOnes = updatedPlayers.filter(p => p.isCorrect);
            if(correctOnes.length > 0) {
                correctOnes.sort((a,b) => a.ansTime - b.ansTime);
                const fastestUID = correctOnes[0].uid;
                updatedPlayers = updatedPlayers.map(p => {
                    if(p.uid === fastestUID) p.score += 1;
                    delete p.isCorrect; delete p.ansTime;
                    return p;
                });
            }
        } else {
            updatedPlayers.forEach(p => { delete p.isCorrect; delete p.ansTime; });
        }

        await updateDoc(doc(db, "games_quiz", currentQuizId), {
            state: 'reveal',
            players: updatedPlayers
        });
    }
};

window.quizGoLeaderboard = async () => {
    await updateDoc(doc(db, "games_quiz", currentQuizId), { state: 'leaderboard' });
};

window.quizNextQuestionReal = async () => {
    const nextIdx = currentQuizData.currentQuestion + 1;
    if(nextIdx >= currentQuizData.questions.length) {
        await updateDoc(doc(db, "games_quiz", currentQuizId), { status: 'finished' });
    } else {
        await updateDoc(doc(db, "games_quiz", currentQuizId), {
            state: 'question',
            currentQuestion: nextIdx,
            startTime: Date.now()
        });
    }
};

function renderQuizResults(d) {
    confetti({particleCount: 400, spread: 200, origin: { y: 0.6 }});
    window.playGameSound('gameEnd');

    const sorted = [...d.players].sort((a,b) => b.score - a.score);

    const p1 = sorted[0];
    const p2 = sorted[1];
    const p3 = sorted[2];

    if(p1) { document.getElementById('name-1').innerText = p1.name; document.getElementById('score-1').innerText = p1.score; document.getElementById('av-1').innerHTML = `<i class="fas ${p1.avatar || 'fa-user'}"></i>`; }
    if(p2) { document.getElementById('name-2').innerText = p2.name; document.getElementById('score-2').innerText = p2.score; document.getElementById('av-2').innerHTML = `<i class="fas ${p2.avatar || 'fa-user'}"></i>`; } else { const el = document.querySelector('.podium-2'); if (el) el.style.opacity = '0'; }
    if(p3) { document.getElementById('name-3').innerText = p3.name; document.getElementById('score-3').innerText = p3.score; document.getElementById('av-3').innerHTML = `<i class="fas ${p3.avatar || 'fa-user'}"></i>`; } else { const el = document.querySelector('.podium-3'); if (el) el.style.opacity = '0'; }

    const tb = document.getElementById('quizFinalTableBody');
    if (tb) {
        tb.innerHTML = "";
        sorted.forEach((p, i) => {
             const row = `<tr>
                            <td>${i+1}</td>
                            <td>${p.name}</td>
                            <td>${p.score}</td>
                          </tr>`;
             tb.innerHTML += row;
        });
    }
}

// --- TOURNAMENT GAME LOGIC ---
window.enterTournament = (id) => {
    window.releaseModeListeners('tournament');
    window.playGameSound('nav');
    currentTournamentId = id;
    if(window.unsubscribeChat) window.unsubscribeChat();
    unsubscribeTournament = onSnapshot(doc(db,"tournaments",id), snap=>{
        if(!snap.exists()) { window.showToast("Turnuva bulunamadı.", "error"); window.leaveTournament(); return; }
        const d=snap.data();
        currentTournamentData=d;
        d.id=snap.id;
        document.getElementById('rulesBtn').style.display = 'flex';
        if(d.status==='finished' && previousMatchesStr!=='finished') {
            confetti({particleCount:200, spread:100, origin:{y:0.6}, colors:['#d4af37', '#ffffff']});
            Swal.fire({ title: 'Turnuva Bitti!', text: 'Şampiyon belli oldu.', icon: 'success', background: 'rgba(30,30,35,0.95)', color: '#fff', confirmButtonColor: '#d4af37' });
        }
        const mStr=JSON.stringify(d.matches);
        if(previousMatchesStr && previousMatchesStr!==mStr && d.status==='active') window.playGameSound('nav');
        previousMatchesStr = (d.status==='finished') ? 'finished' : mStr;

        if(d.status==='lobby') { renderLobby(d); window.switchView('view-lobby'); }
        else { renderFixtures(d); renderStandings(d); window.switchView('view-tournament'); }
    });
    window.initChat(id);
};

function renderLobby(d) {
    document.getElementById('lobbyTitle').innerText = d.name;
    document.getElementById('shareCode').innerText = d.id;
    const isAdmin = (d.creatorId === window.currentUser.uid);
    document.getElementById('adminControls').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('btnStartTournament').onclick = async () => {
        if (d.slots.some(s => s.status === 'taken')) { await updateDoc(doc(db, "tournaments", d.id), { status: 'active' }); }
        else { window.showToast("En az 1 oyuncu olmalı!", "error"); }
    };

    const grid = document.getElementById('lobbySlots');
    if (!grid) return;
    grid.innerHTML = '';
    d.slots.forEach(slot => {
        const isMe = slot.ownerId === window.currentUser.uid;
        const div = document.createElement('div');
        div.className = `slot-item ${slot.status === 'taken' ? 'taken' : ''} ${isMe ? 'me' : ''}`;
        let html = '';
        if (slot.status === 'open') {
            html = `<div style="font-size:2rem; color:var(--text-muted); margin-bottom:10px;"><i class="fas fa-chair"></i></div><div style="font-weight:bold; margin-bottom:10px;">${slot.name}</div><button onclick="takeSlot(${slot.index})" style="font-size:0.8rem;">OTUR</button>`;
        } else {
            html = `<div style="font-size:2rem; color:${isMe ? 'var(--accent)' : 'var(--primary)'}; margin-bottom:10px;"><i class="fas ${slot.avatar}"></i></div><div style="font-weight:bold; margin-bottom:5px;">${slot.name}</div>${isMe ? '<button class="leave-seat-btn" onclick="leaveSlot(' + slot.index + ')">KALK</button>' : ''}`;
            if (isAdmin && !isMe) { html += `<button class="kick-btn" onclick="kickPlayer(${slot.index})" title="Masadan Kaldır"><i class="fas fa-times"></i></button>`; }
        }
        div.innerHTML = html;
        if (window.appendLobbyFriendButton) window.appendLobbyFriendButton(div, slot.ownerId);
        grid.appendChild(div);
    });
}

window.takeSlot = async (index) => { window.playGameSound('nav'); if (currentTournamentData.slots.some(s => s.ownerId === window.currentUser.uid)) return window.showToast("Zaten bir masadasın!", "error"); let slots = [...currentTournamentData.slots]; slots[index] = { ...slots[index], ownerId: window.currentUser.uid, name: window.currentUser.displayName, avatar: window.currentUser.photoURL || 'fa-chess-pawn', status: 'taken' }; await updateDoc(doc(db, "tournaments", currentTournamentId), { slots: slots, participantIds: arrayUnion(window.currentUser.uid) }); };
window.leaveSlot = async (index) => { window.playGameSound('nav'); let slots = [...currentTournamentData.slots]; slots[index] = { ...slots[index], ownerId: null, name: `Masa ${index + 1}`, avatar: 'fa-chair', status: 'open' }; await updateDoc(doc(db, "tournaments", currentTournamentId), { slots: slots, participantIds: arrayRemove(window.currentUser.uid) }); };
window.kickPlayer = async (index) => { let slots = [...currentTournamentData.slots]; const uidToRemove = slots[index].ownerId; slots[index] = { ...slots[index], ownerId: null, name: `Masa ${index + 1}`, avatar: 'fa-chair', status: 'open' }; await updateDoc(doc(db, "tournaments", currentTournamentId), { slots: slots, participantIds: arrayRemove(uidToRemove) }); };

function renderFixtures(d){
    document.getElementById('activeTournamentTitle').innerText = d.name;
    const isAdmin = (d.creatorId===window.currentUser.uid);
    const isFin = d.status==='finished';
    document.getElementById('btnFinishTournament').style.display = (isAdmin && !isFin) ? 'block' : 'none';
    document.getElementById('btnAddMatchManual').style.display = (isAdmin && !isFin) ? 'inline-block' : 'none';
    document.getElementById('btnAutoFinish').style.display = (isAdmin && !isFin) ? 'inline-block' : 'none';
    const c=document.getElementById('fixturesList');
    if (!c) return;
    c.innerHTML='';
    const emptyMsg = document.getElementById('noMatchesText');
    if(d.matches.length === 0) {
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    } else {
        if (emptyMsg) emptyMsg.style.display = 'none';
    }
    const gr={};
    d.matches.forEach(m=>{
        if(!gr[m.r]) gr[m.r]=[];
        gr[m.r].push(m);
    });
    Object.keys(gr).sort((a,b)=>a-b).forEach(r=>{
        const div=document.createElement('div');
        div.innerHTML=`<div style="background:var(--glass-card); padding:8px; margin-bottom:5px; border-left:4px solid var(--primary); font-weight:bold; color:var(--text-main); font-size:0.9rem;">TUR ${r}</div>`;
        gr[r].forEach(m=>{
            const deleteBtn = (isAdmin && !isFin) ? `<i class="fas fa-trash del-match-btn" onclick="deleteMatch(${m.id})"></i>` : '';
            if(m.isBye) {
                const p1=d.slots[m.p1];
                div.innerHTML += `<div class="match-card" style="opacity:0.6">${deleteBtn}<div class="match-player"><i class="fas ${p1.avatar}"></i> ${p1.name}</div><span style="font-weight:bold; color:var(--success); margin:0 10px;">BAY</span><div class="match-player right" style="color:var(--text-muted)">-</div></div>`;
                return;
            }
            const p1=d.slots[m.p1], p2=d.slots[m.p2];
            const isP1=(p1.ownerId===window.currentUser.uid), isP2=(p2.ownerId===window.currentUser.uid);
            const isDisputed = m.isDisputed === true;
            const disputeLink = m.disputeLink || "#";
            let canEdit = false;
            if(!isFin) {
                if(isAdmin) canEdit = true;
                else if((isP1 || isP2) && !isDisputed) canEdit = true;
            }
            let objectBtn = '';
            if( (isP1 || isP2) && m.res !== null && !isDisputed && !isFin ) {
                objectBtn = `<div class="object-btn" title="Sonuca İtiraz Et" onclick="objectToMatch(${m.id})"><i class="fas fa-flag"></i></div>`;
            }
            let disputeBadge = '';
            let cardClass = 'match-card';
            if(isDisputed) {
                cardClass += ' disputed';
                disputeBadge = `<a href="${disputeLink}" target="_blank" class="proof-link"><i class="fas fa-exclamation-triangle"></i> İTİRAZ (KANIT)</a>`;
            }
            let lnk='';
            const watch = m.link ? `<a href="${m.link}" target="_blank" class="watch-btn"><i class="fas fa-eye"></i> İzle</a>` : '';
            const inp = ((isP1||isP2||isAdmin) && !isFin) ? `<input class="link-input" placeholder="Maç Linki (Lichess/Chess.com)..." value="${m.link||''}" onchange="upLink(${m.id},this.value)">` : '';
            if(watch||inp) lnk=`<div class="link-area">${watch}${inp}</div>`;
            div.innerHTML += `<div class="${cardClass}">${deleteBtn} ${objectBtn}<div class="match-player ${isP1?'me':''}"><i class="fas ${p1.avatar}"></i> ${p1.name}</div><select class="score-select" ${canEdit?'':'disabled'} onchange="upMatch(${m.id},this.value)"><option value="">vs</option><option value="1" ${m.res===1?'selected':''}>1 - 0</option><option value="0" ${m.res===0?'selected':''}>½ - ½</option><option value="2" ${m.res===2?'selected':''}>0 - 1</option></select><div class="match-player right ${isP2?'me':''}">${p2.name} <i class="fas ${p2.avatar}"></i></div>${disputeBadge} ${lnk}</div>`;
        });
        c.appendChild(div);
    });
}

window.upMatch = async(id, v) => {
    const isAdmin = currentTournamentData.creatorId === window.currentUser.uid;
    await updateDoc(doc(db,"tournaments",currentTournamentId), {
        matches: currentTournamentData.matches.map(m => {
            if(m.id === id) {
                const newVal = v === "" ? null : parseInt(v);
                if(isAdmin) return { ...m, res: newVal, isDisputed: false, disputeLink: null };
                else return { ...m, res: newVal };
            }
            return m;
        })
    });
};

window.upLink = async(id,v)=>{ await updateDoc(doc(db,"tournaments",currentTournamentId), { matches:currentTournamentData.matches.map(m=>m.id===id?{...m,link:v.trim()}:m) }); };

function renderStandings(d){
    const stats = d.slots.map((s,i)=>({ ...s, idx:i, p:0, w:0, d:0, l:0, pts:0, sb:0 }));
    d.matches.forEach(m=>{
        if(m.res !== null){
            if(m.isBye) {
                stats[m.p1].p++;
                stats[m.p1].w++;
                stats[m.p1].pts+=1;
            } else {
                stats[m.p1].p++;
                stats[m.p2].p++;
                if(m.res===1) {
                    stats[m.p1].w++;
                    stats[m.p1].pts+=1;
                    stats[m.p2].l++;
                } else if(m.res===2) {
                    stats[m.p2].w++;
                    stats[m.p2].pts+=1;
                    stats[m.p1].l++;
                } else {
                    stats[m.p1].d++;
                    stats[m.p1].pts+=0.5;
                    stats[m.p2].d++;
                    stats[m.p2].pts+=0.5;
                }
            }
        }
    });
    d.matches.forEach(m=>{
        if(m.res !== null && !m.isBye){
            if(m.res===1) stats[m.p1].sb += stats[m.p2].sb + stats[m.p2].pts;
            else if(m.res===2) stats[m.p2].sb += stats[m.p1].pts;
            else {
                stats[m.p1].sb += 0.5 * stats[m.p2].pts;
                stats[m.p2].sb += 0.5 * stats[m.p1].pts;
            }
        }
    });
    stats.sort((a,b)=> b.pts - a.pts || b.sb - a.sb || b.w - a.w);
    const b=document.getElementById('standingsBody');
    if (!b) return;
    b.innerHTML='';
    const isFin = d.status==='finished';
    stats.forEach((s,rank)=>{
        let rowClass = '';
        if(isFin){
            if(rank===0) rowClass='rank-1';
        } else if(s.ownerId===window.currentUser.uid) rowClass='me';
        const tr=document.createElement('tr');
        tr.className=rowClass;
        if(s.ownerId===window.currentUser.uid && !isFin) tr.style.background='rgba(0, 242, 255, 0.1)';
        tr.innerHTML = `<td>${rank+1}</td><td class="player-name-cell" onclick='showStats(${JSON.stringify(s)})' style="text-align:left;"><i class="fas ${s.avatar}"></i> ${s.name} ${rank===0&&isFin?'👑':''}</td><td style="font-weight:bold; color:var(--primary); font-size:1.1rem;">${s.pts}</td><td style="color:var(--text-muted); font-size:0.9rem;">${s.sb.toFixed(2)}</td><td>${s.p}</td><td style="color:var(--success)">${s.w}</td><td>${s.d}</td><td style="color:var(--danger)">${s.l}</td>`;
        b.appendChild(tr);
    });
}

window.downloadStandings = () => {
    const element = document.getElementById("standingsContainer");
    if (!element) return;
    const originalBg = element.style.background;
    element.style.background = "#1b1d24";
    html2canvas(element, { scale: 2, backgroundColor: "#1b1d24" }).then(canvas => {
        const link = document.createElement("a");
        link.download = `Grandmaster_Puan_${currentTournamentId}.png`;
        link.href = canvas.toDataURL();
        link.click();
        element.style.background = originalBg;
        window.showToast("Resim indirildi!", "success");
    });
};

window.openRules = () => {
    window.playGameSound('nav');
    const isAdmin = currentTournamentData.creatorId === window.currentUser.uid;
    document.getElementById('rulesText').value = currentTournamentData.rules || "";
    document.getElementById('rulesReadOnly').innerText = currentTournamentData.rules || "Henüz kural eklenmedi.";
    document.getElementById('rulesText').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('btnSaveRules').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('rulesReadOnly').style.display = isAdmin ? 'none' : 'block';
    document.getElementById('rulesModal').style.display = 'flex';
};

window.closeRules = () => document.getElementById('rulesModal').style.display = 'none';

window.saveRules = async() => {
    const txt = document.getElementById('rulesText').value;
    await updateDoc(doc(db,"tournaments",currentTournamentId), { rules: txt });
    window.closeRules();
    window.showToast("Kurallar güncellendi", "success");
};

window.showStats = (s) => {
    window.playGameSound('nav');
    document.getElementById('modalAvatar').innerHTML = `<i class="fas ${s.avatar}"></i>`;
    document.getElementById('modalName').innerText = s.name;
    document.getElementById('statWins').innerText = s.w;
    document.getElementById('statDraws').innerText = s.d;
    document.getElementById('statLosses').innerText = s.l;
    document.getElementById('statPoints').innerText = s.pts;
    document.getElementById('statSB').innerText = s.sb.toFixed(2);
    const rate = s.p > 0 ? Math.round(((s.pts - (s.d * 0.5)) / s.p) * 100) : 0;
    document.getElementById('statRate').innerText = `%${rate}`;
    document.getElementById('statsModal').style.display = 'flex';
};

window.closeStats = () => document.getElementById('statsModal').style.display='none';

window.copyCode = () => { navigator.clipboard.writeText(document.getElementById('shareCode').innerText).then(()=>window.showToast("Kod kopyalandı!", "success")); };

window.leaveTournamentConfirm = async () => {
    window.playGameSound('nav');
    const res = await Swal.fire({
        title: 'Çıkış?',
        text: 'Turnuva ekranından ayrılacaksın.',
        icon: 'question',
        showCancelButton: true,
        background: 'rgba(30,30,35,0.95)',
        color: '#fff',
        confirmButtonColor: '#555',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Evet, Çık',
        cancelButtonText: 'Kal'
    });
    if(res.isConfirmed) window.leaveTournament();
};

window.leaveTournament = () => {
    if(unsubscribeTournament) unsubscribeTournament();
    if(window.unsubscribeChat) window.unsubscribeChat();
    currentTournamentId=null;
    window.hideChat();
    window.switchView('view-dashboard');
};

window.showTab = (t) => {
    window.playGameSound('nav');
    document.getElementById('tab-fixtures').style.display=t==='fixtures'?'block':'none';
    document.getElementById('tab-standings').style.display=t==='standings'?'block':'none';
};

window.fixParticipants = async () => {
    if(!currentTournamentId || !currentTournamentData) return;
    const res = await Swal.fire({
        title: 'Listeyi Birleştir',
        text: "Masadaki oyuncular ile veritabanındaki mevcut liste birleştirilecek. Silinme olmayacak.",
        icon: 'info',
        showCancelButton: true,
        background: 'rgba(30,30,35,0.95)',
        color: '#fff',
        confirmButtonColor: '#d4af37'
    });
    if(!res.isConfirmed) return;
    let currentDBList = currentTournamentData.participantIds || [];
    let slotIds = currentTournamentData.slots.map(s=>s.ownerId).filter(id=>id);
    if(currentTournamentData.creatorId) slotIds.push(currentTournamentData.creatorId);
    let mergedList = [...new Set([...currentDBList, ...slotIds])];
    try {
        await updateDoc(doc(db, "tournaments", currentTournamentId), { participantIds: mergedList });
        window.showToast("Liste başarıyla birleştirildi!", "success");
    } catch(e) {
        console.error(e);
        window.showToast("Hata: " + e.message, "error");
    }
};

window.adminAddPlayer = async () => {
    if(!currentTournamentId || !currentTournamentData) return;
    const { value: uid } = await Swal.fire({
        title: 'Kullanıcı UID',
        input: 'text',
        inputLabel: 'Firebase Authentication kısmındaki User UID',
        inputPlaceholder: 'Örn: J8d9S...',
        background: 'rgba(30,30,35,0.95)',
        color: '#fff',
        confirmButtonColor: '#d4af37'
    });
    if(!uid) return;
    const { value: seatNum } = await Swal.fire({
        title: 'Masa Numarası',
        input: 'number',
        inputLabel: 'Kaç numaralı masaya oturtulsun?',
        inputValue: 1,
        background: 'rgba(30,30,35,0.95)',
        color: '#fff',
        confirmButtonColor: '#d4af37'
    });
    if(!seatNum) return;
    const index = parseInt(seatNum) - 1;
    const slots = [...currentTournamentData.slots];
    if(!slots[index]) {
        window.showToast("Geçersiz masa numarası!", "error");
        return;
    }
    const { value: name } = await Swal.fire({
        title: 'Görünen İsim',
        input: 'text',
        inputValue: 'Oyuncu',
        background: 'rgba(30,30,35,0.95)',
        color: '#fff',
        confirmButtonColor: '#d4af37'
    });
    slots[index] = { index: index, name: name || "Oyuncu", ownerId: uid.trim(), avatar: 'fa-user-secret', status: 'taken' };
    try {
        await updateDoc(doc(db, "tournaments", currentTournamentId), { slots: slots, participantIds: arrayUnion(uid.trim()) });
        window.showToast("Oyuncu başarıyla masaya oturtuldu!", "success");
    } catch(e) {
        window.showToast("Hata: " + e.message, "error");
    }
};

window.addMatchManual = async () => {
    if(!currentTournamentId || !currentTournamentData) return;
    let options = {};
    currentTournamentData.slots.forEach(s => {
        options[s.index] = s.name;
    });
    const htmlContent = `<div style="text-align:left;"><label>Tur Numarası:</label><input type="number" id="swal-round" class="swal2-input" value="1" min="1" style="width:100%; margin-bottom:10px;"><label>1. Oyuncu (Beyaz):</label><select id="swal-p1" class="swal2-input" style="width:100%; margin-bottom:10px; background:#333; color:#fff;">${Object.keys(options).map(k => `<option value="${k}">${options[k]}</option>`).join('')}</select><label>2. Oyuncu (Siyah):</label><select id="swal-p2" class="swal2-input" style="width:100%; background:#333; color:#fff;">${Object.keys(options).map(k => `<option value="${k}">${options[k]}</option>`).join('')}</select></div>`;
    const { value: formValues } = await Swal.fire({
        title: 'Yeni Maç Ekle',
        html: htmlContent,
        showCancelButton: true,
        confirmButtonText: 'EKLE',
        background: 'rgba(30,30,35,0.95)',
        color: '#fff',
        confirmButtonColor: '#d4af37',
        preConfirm: () => {
            return [
                document.getElementById('swal-round').value,
                document.getElementById('swal-p1').value,
                document.getElementById('swal-p2').value
            ]
        }
    });
    if(formValues) {
        const r = parseInt(formValues[0]);
        const p1 = parseInt(formValues[1]);
        const p2 = parseInt(formValues[2]);
        if(p1 === p2) {
            window.showToast("Aynı oyuncuyu kendisine karşı seçemezsin!", "error");
            return;
        }
        const newMatch = { id: Date.now(), r: r, p1: p1, p2: p2, res: null, link: '', isBye: false };
        await updateDoc(doc(db,"tournaments",currentTournamentId), { matches: arrayUnion(newMatch) });
        window.showToast("Maç eklendi!", "success");
    }
};

window.autoFinishFixture = async () => {
    if(!currentTournamentId || !currentTournamentData) return;
    const res = await Swal.fire({
        title: 'Akıllı Tamamlama',
        text: "Sistem, çift devreli lig usulüne göre EKSİK kalan maçları hesaplayıp, en erken turlardaki boşlukları doldurarak yerleştirecek.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'HESAPLA VE EKLE',
        confirmButtonColor: '#9b59b6',
        background: 'rgba(30,30,35,0.95)',
        color: '#fff'
    });
    if(!res.isConfirmed) return;
    const slots = currentTournamentData.slots;
    const existingMatches = currentTournamentData.matches;
    const numPlayers = slots.length;
    let maxId = existingMatches.reduce((max, match) => Math.max(max, match.id), 0);
    let neededMatches = [];
    for(let i=0; i<numPlayers; i++) {
        for(let j=0; j<numPlayers; j++) {
            if(i !== j) {
                const exists = existingMatches.some(m => m.p1 === i && m.p2 === j);
                if(!exists) {
                    neededMatches.push({p1: i, p2: j});
                }
            }
        }
    }
    if(neededMatches.length === 0) {
        window.showToast("Fikstür zaten eksiksiz.", "info");
        return;
    }
    let roundOccupancy = {};
    existingMatches.forEach(m => {
        if(!roundOccupancy[m.r]) roundOccupancy[m.r] = new Set();
        if(!m.isBye) {
            roundOccupancy[m.r].add(m.p1);
            roundOccupancy[m.r].add(m.p2);
        }
    });
    let newMatches = [];
    neededMatches.sort(() => Math.random() - 0.5);
    neededMatches.forEach(match => {
        let assignedRound = 1;
        while(true) {
            if(!roundOccupancy[assignedRound]) roundOccupancy[assignedRound] = new Set();
            let p1Busy = roundOccupancy[assignedRound].has(match.p1);
            let p2Busy = roundOccupancy[assignedRound].has(match.p2);
            if(!p1Busy && !p2Busy) {
                roundOccupancy[assignedRound].add(match.p1);
                roundOccupancy[assignedRound].add(match.p2);
                newMatches.push({ id: ++maxId, r: assignedRound, p1: match.p1, p2: match.p2, res: null, link: '', isBye: false });
                break;
            } else {
                assignedRound++;
            }
        }
    });
    try {
        const finalMatches = [...existingMatches, ...newMatches];
        finalMatches.sort((a,b) => a.r - b.r || a.id - b.id);
        await updateDoc(doc(db, "tournaments", currentTournamentId), { matches: finalMatches });
        window.showToast(`${newMatches.length} adet maç başarıyla planlandı!`, "success");
    } catch(e) {
        console.error(e);
        window.showToast("Hata: " + e.message, "error");
    }
};

window.deleteMatch = async (matchId) => {
    if(!currentTournamentId || !currentTournamentData) return;
    const res = await Swal.fire({
        title: 'Maçı Sil?',
        text: "Bu maç fikstürden kaldırılacak.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        background: 'rgba(30,30,35,0.95)',
        color: '#fff'
    });
    if(!res.isConfirmed) return;
    const newMatches = currentTournamentData.matches.filter(m => m.id !== matchId);
    await updateDoc(doc(db,"tournaments",currentTournamentId), { matches: newMatches });
    window.showToast("Maç silindi.", "info");
};

window.objectToMatch = async (matchId) => {
    const { value: url } = await Swal.fire({
        title: 'Sonuca İtiraz Et',
        text: "Lütfen kanıt olarak bir link (Lichess/Chess.com/Resim) girin. Bu zorunludur!",
        input: 'url',
        inputPlaceholder: 'https://...',
        showCancelButton: true,
        confirmButtonText: 'GÖNDER',
        confirmButtonColor: '#d33',
        background: 'rgba(30,30,35,0.95)',
        color: '#fff'
    });
    if (url) {
        await updateDoc(doc(db,"tournaments",currentTournamentId), {
            matches: currentTournamentData.matches.map(m => {
                if(m.id === matchId) {
                    return { ...m, isDisputed: true, disputeLink: url };
                }
                return m;
            })
        });
        window.showToast("İtiraz gönderildi! Yönetici inceleyecek.", "warning");
    }
};
