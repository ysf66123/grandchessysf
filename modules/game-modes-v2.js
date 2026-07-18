import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  deleteField,
  runTransaction,
  deleteDoc,
  addDoc,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;
const auth = window.auth;

const BOT_UID_PREFIX = "bot_1v1_";
const RECONNECT_GRACE_MS = 30000;
const TRAINING_ASSIST_ADMIN_EMAIL = "yusar646@gmail.com";
const SOLO_TRAINING_ALLOWED_EMAIL = TRAINING_ASSIST_ADMIN_EMAIL;
const SOLO_TRAINING_ENGINE_DEPTH = 14;

const BOT_LEVEL_CONFIG = {
  easy: {
    level: "easy",
    label: "Kolay AI",
    shortLabel: "KOLAY",
    avatar: "fa-robot",
    depth: 4,
    skillLevel: 1,
    candidatePool: 4,
    maxScoreGap: 220,
    preferBestWeight: 0.44,
    randomMoveChance: 0.24,
    fallbackMixChance: 0.36,
    fallbackSearchDepth: 1,
    fallbackPickCount: 5,
    thinkDelayRange: [500, 900],
    accent: "#7dd3fc",
  },
  medium: {
    level: "medium",
    label: "Orta AI",
    shortLabel: "ORTA",
    avatar: "fa-microchip",
    depth: 8,
    skillLevel: 8,
    candidatePool: 3,
    maxScoreGap: 90,
    preferBestWeight: 0.78,
    randomMoveChance: 0.08,
    fallbackMixChance: 0.12,
    fallbackSearchDepth: 2,
    fallbackPickCount: 3,
    thinkDelayRange: [700, 1200],
    accent: "#facc15",
  },
  hard: {
    level: "hard",
    label: "Zor AI",
    shortLabel: "ZOR",
    avatar: "fa-brain",
    depth: 14,
    skillLevel: 17,
    candidatePool: 2,
    maxScoreGap: 22,
    preferBestWeight: 0.96,
    randomMoveChance: 0.01,
    fallbackMixChance: 0,
    fallbackSearchDepth: 3,
    fallbackPickCount: 1,
    thinkDelayRange: [950, 1500],
    accent: "#fb7185",
  },
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
  return team === "white" ? "Beyaz Boş" : "Siyah Boş";
}

function makeBotPlayer(team, level) {
  var bot = getBotConfig(level);
  return {
    uid: BOT_UID_PREFIX + bot.level + "_" + team,
    name: bot.label,
    avatar: bot.avatar,
    team: team,
    index: 0,
    isReady: true,
    isBot: true,
    botLevel: level,
  };
}

function normalize1v1HostColorPreference(value) {
  return value === "black" || value === "random" ? value : "white";
}

function assign1v1HostColor(players, hostId, preference) {
  preference = normalize1v1HostColorPreference(preference);
  if (preference === "random")
    preference = Math.random() < 0.5 ? "white" : "black";
  var hostPlayer = players.find(function (player) {
    return player.uid === hostId;
  });
  if (!hostPlayer) return players;
  var otherTeam = preference === "white" ? "black" : "white";
  return players
    .map(function (player) {
      if (player.uid === hostId)
        return Object.assign({}, player, { team: preference });
      if (player.team === preference)
        return Object.assign({}, player, { team: otherTeam });
      return player;
    })
    .sort(function (a, b) {
      return (a.team === "white" ? 0 : 1) - (b.team === "white" ? 0 : 1);
    });
}

const warmedAnalysisFenByMode = {};
function warmAnalysisCacheForActiveFen(mode, fen, moveCount) {
  if (!fen || !window.warmAnalysisCacheForFen) return;
  const key = mode + ":" + moveCount + ":" + fen;
  if (warmedAnalysisFenByMode[mode] === key) return;
  warmedAnalysisFenByMode[mode] = key;
  window.warmAnalysisCacheForFen(fen).catch(function () {});
}

function warmAnalysisCacheForActiveGame(mode, pgn, fen, moveCount) {
  if (!fen && !pgn) return;
  const key = mode + ":game:" + moveCount + ":" + (fen || "");
  if (warmedAnalysisFenByMode[mode + "_game"] === key) return;
  warmedAnalysisFenByMode[mode + "_game"] = key;
  if (window.warmAnalysisCacheForGame) {
    window.warmAnalysisCacheForGame(pgn || "", fen || "");
  } else {
    warmAnalysisCacheForActiveFen(mode, fen, moveCount);
  }
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
let quickMatch1v1Unsubscribe = null;
let quickMatch1v1Timer = null;
let quickMatch1v1Active = false;

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
let quizQuestionLibraryCache = [];
let quizTestLibraryCache = [];

let currentTournamentId = null;
let currentTournamentData = null;
let unsubscribeTournament = null;
let previousMatchesStr = "";

let currentGameOverPayload = null;
let current1v1Role = "player";
let current2v2Role = "player";
let reconnectPromptShownFor = null;
let lastRenderedLiveMoveCount1v1 = -1;
let lastRenderedLiveMoveCount2v2 = -1;
let trainingAssist1v1State = {
  autoPlay: false,
  requestToken: 0,
  bestMoveUci: null,
  bestMoveSan: "-",
  evalText: "--",
  statusText: "Hazir degil",
  fen: null,
  applyingFen: null,
};
let soloTrainingChess = new Chess();
let soloTrainingSelectedSquare = null;
let soloTrainingValidMoves = [];
let soloTrainingBoardFlipped = false;
let soloTrainingPreviewTimer = null;
let soloTrainingAutoTimer = null;
let soloVoiceRecognition = null;
let soloVoiceRestartTimer = null;
let soloVoiceWatchdogTimer = null;
let soloVoiceMeterStream = null;
let soloVoiceMeterAnimation = null;
let soloVoiceRecognitionStream = null;
let soloVoiceRecognitionTrack = null;
let soloVoiceCloudStream = null;
let soloVoiceCloudRecorder = null;
let soloVoiceCloudTimer = null;
let soloVoiceCloudBusy = false;
let soloVoiceCloudCycle = 0;
let soloVoiceLastNativeAt = 0;
let soloVoiceLastCommandKey = "";
let soloVoiceLastCommandAt = 0;
let soloVoiceCommandBusy = false;
let soloTrainingRedoStack = [];
let soloTrainingMoveClassifications = [];
let soloTrainingState = {
  initialized: false,
  requestToken: 0,
  brilliantRequestToken: 0,
  fen: null,
  autoSide: "none",
  autoDelaySec: 5,
  moveLanguage: "en",
  showClassifications: true,
  showBestPanel: true,
  voiceEnabled: false,
  voiceListening: false,
  voiceStatusText: "Sesli hamle kapali.",
  voiceEngineText: "Hazir degil",
  lastHeardText: "-",
  voiceSettings: {
    deviceId: "",
    confidence: 0.34,
    restartDelayMs: 450,
    maxAlternatives: 4,
    cloudFallback: true,
    cloudRecordMs: 1800,
    cloudCooldownMs: 350,
    commandCooldownMs: 2200,
  },
  cloudSttStatusText: "Kontrol ediliyor",
  cloudSttAvailable: false,
  cloudSttConfigured: false,
  sync: {
    live: false,
    sourceLabel: "Bagli degil",
    statusText: "Chrome eklentisini bu sekmede hedef yap.",
    stateText: "Bekleniyor",
    importedPly: 0,
    lastGameKey: "",
    lastSignature: "",
    lastRawMoves: [],
    lastEventAt: 0,
    applying: false,
    pendingSnapshot: null,
  },
  engineState: "Bekleniyor",
  statusText: "Hamle oynadiginda oneriler otomatik yenilenir.",
  evalText: "--",
  best: {
    white: {
      fen: null,
      uci: null,
      san: "-",
      evalText: "--",
      statusText: "Motor bekleniyor",
    },
    black: {
      fen: null,
      uci: null,
      san: "-",
      evalText: "--",
      statusText: "Motor bekleniyor",
    },
  },
  brilliant: {
    stateText: "Bekleniyor",
    white: {
      fen: null,
      uci: null,
      san: "-",
      note: "Aday aranıyor",
      found: false,
    },
    black: {
      fen: null,
      uci: null,
      san: "-",
      note: "Aday aranıyor",
      found: false,
    },
  },
  mistakes: {
    stateText: "Bekleniyor",
    white: {},
    black: {},
  },
};

Object.defineProperties(window, {
  current1v1Id: {
    get: () => current1v1Id,
    set: (v) => {
      current1v1Id = v;
    },
  },
  current1v1Data: {
    get: () => current1v1Data,
    set: (v) => {
      current1v1Data = v;
    },
  },
  current1v1Role: {
    get: () => current1v1Role,
    set: (v) => {
      current1v1Role = v;
    },
  },
  chess1v1: {
    get: () => chess1v1,
    set: (v) => {
      chess1v1 = v;
    },
  },
  current2v2Id: {
    get: () => current2v2Id,
    set: (v) => {
      current2v2Id = v;
    },
  },
  current2v2Data: {
    get: () => current2v2Data,
    set: (v) => {
      current2v2Data = v;
    },
  },
  current2v2Role: {
    get: () => current2v2Role,
    set: (v) => {
      current2v2Role = v;
    },
  },
  chess: {
    get: () => chess,
    set: (v) => {
      chess = v;
    },
  },
  currentQuizId: {
    get: () => currentQuizId,
    set: (v) => {
      currentQuizId = v;
    },
  },
  currentQuizData: {
    get: () => currentQuizData,
    set: (v) => {
      currentQuizData = v;
    },
  },
  currentTournamentId: {
    get: () => currentTournamentId,
    set: (v) => {
      currentTournamentId = v;
    },
  },
  currentTournamentData: {
    get: () => currentTournamentData,
    set: (v) => {
      currentTournamentData = v;
    },
  },
  activeFullscreenBoardMode: {
    get: () => activeFullscreenBoardMode,
    set: (v) => {
      activeFullscreenBoardMode = v;
    },
  },
  currentGameOverPayload: {
    get: () => currentGameOverPayload,
    set: (v) => {
      currentGameOverPayload = v;
    },
  },
  soloTrainingChess: {
    get: () => soloTrainingChess,
    set: (v) => {
      soloTrainingChess = v;
    },
  },
});

function releaseModeListeners(exceptMode) {
  if (exceptMode !== "quiz" && unsubscribeQuiz) {
    unsubscribeQuiz();
    unsubscribeQuiz = null;
    currentQuizId = null;
    currentQuizData = null;
  }
  if (exceptMode !== "1v1" && unsubscribe1v1) {
    removeSpectatorMembership(
      "1v1",
      current1v1Id,
      current1v1Data,
      current1v1Role,
    );
    clearPending1v1BotMove();
    unsubscribe1v1();
    unsubscribe1v1 = null;
    current1v1Id = null;
    current1v1Data = null;
    current1v1Role = "player";
  }
  if (exceptMode !== "2v2" && unsubscribe2v2) {
    removeSpectatorMembership(
      "2v2",
      current2v2Id,
      current2v2Data,
      current2v2Role,
    );
    unsubscribe2v2();
    unsubscribe2v2 = null;
    current2v2Id = null;
    current2v2Data = null;
    current2v2Role = "player";
  }
  if (exceptMode !== "tournament" && unsubscribeTournament) {
    unsubscribeTournament();
    unsubscribeTournament = null;
    currentTournamentId = null;
    currentTournamentData = null;
  }
  if (exceptMode !== "1v1" && game1v1TimerInterval)
    clearInterval(game1v1TimerInterval);
  if (exceptMode !== "2v2" && gameTimerInterval)
    clearInterval(gameTimerInterval);
}
window.releaseModeListeners = releaseModeListeners;

function makeEmptySeat(team, nameLabel) {
  return {
    uid: null,
    name: nameLabel || "Boş",
    avatar: "fa-plus",
    team: team,
    index: 0,
    isReady: false,
  };
}

function clearPending1v1BotMove() {
  if (pending1v1BotMoveTimer) clearTimeout(pending1v1BotMoveTimer);
  pending1v1BotMoveTimer = null;
  pending1v1BotMoveKey = null;
}

function buildQuickMatch1v1GameData(
  code,
  whitePlayer,
  blackPlayer,
  timeControl,
) {
  const ms = (timeControl || 5) * 60 * 1000;
  return {
    code: code,
    hostId: whitePlayer.uid,
    gameMode: "1v1",
    matchType: "quick",
    status: "active",
    timeControl: timeControl || 5,
    whiteTime: ms,
    blackTime: ms,
    lastMoveTime: Date.now(),
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    pgn: "",
    moveCount: 0,
    players: [
      {
        uid: whitePlayer.uid,
        name: whitePlayer.name,
        avatar: whitePlayer.avatar || "fa-chess-pawn",
        team: "white",
        index: 0,
        isReady: true,
      },
      {
        uid: blackPlayer.uid,
        name: blackPlayer.name,
        avatar: blackPlayer.avatar || "fa-chess-pawn",
        team: "black",
        index: 0,
        isReady: true,
      },
    ],
    participantIds: [whitePlayer.uid, blackPlayer.uid],
    spectatorIds: [],
    disconnectState: {},
    winner: null,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  };
}

function clearQuickMatch1v1Local() {
  quickMatch1v1Active = false;
  if (quickMatch1v1Timer) clearInterval(quickMatch1v1Timer);
  quickMatch1v1Timer = null;
  if (quickMatch1v1Unsubscribe) quickMatch1v1Unsubscribe();
  quickMatch1v1Unsubscribe = null;
}

async function finishQuickMatch1v1(gameCode) {
  if (!gameCode) return;
  clearQuickMatch1v1Local();
  if (Swal && Swal.isVisible()) Swal.close();
  if (window.currentUser) {
    deleteDoc(doc(db, "quick_match_1v1", window.currentUser.uid)).catch(
      function () {},
    );
  }
  window.showToast("Rakip bulundu. Mac basliyor.", "success");
  window.enter1v1Game(gameCode);
}

async function tryResolveQuickMatch1v1() {
  if (!quickMatch1v1Active || !window.currentUser) return false;
  const myUid = window.currentUser.uid;
  const myRef = doc(db, "quick_match_1v1", myUid);
  const now = Date.now();
  const staleMs = 90000;
  const snapshot = await getDocs(
    query(collection(db, "quick_match_1v1"), where("status", "==", "waiting")),
  ).catch(function () {
    return null;
  });
  if (!snapshot || !quickMatch1v1Active) return false;

  const candidates = [];
  snapshot.forEach(function (docSnap) {
    const item = Object.assign({ id: docSnap.id }, docSnap.data() || {});
    if (!item.uid || item.uid === myUid) return;
    if (now - (item.updatedAtMs || item.createdAtMs || 0) > staleMs) return;
    candidates.push(item);
  });
  candidates.sort(function (a, b) {
    return (a.createdAtMs || 0) - (b.createdAtMs || 0);
  });
  if (!candidates.length) return false;

  const opponent = candidates[0];
  const opponentRef = doc(db, "quick_match_1v1", opponent.uid);
  const code = window.makeId(5);
  const gameRef = doc(db, "games_1v1", code);
  let matchedCode = null;

  try {
    await runTransaction(db, async function (transaction) {
      const mySnap = await transaction.get(myRef);
      const opponentSnap = await transaction.get(opponentRef);
      const gameSnap = await transaction.get(gameRef);
      if (gameSnap.exists()) throw new Error("code_collision");
      if (!mySnap.exists() || !opponentSnap.exists())
        throw new Error("queue_changed");
      const myData = mySnap.data() || {};
      const opponentData = opponentSnap.data() || {};
      if (myData.status !== "waiting" || opponentData.status !== "waiting")
        throw new Error("queue_changed");
      if (myData.uid === opponentData.uid || myData.uid !== myUid)
        throw new Error("queue_changed");
      if (
        Date.now() -
          (opponentData.updatedAtMs || opponentData.createdAtMs || 0) >
        staleMs
      )
        throw new Error("queue_stale");

      const me = {
        uid: myData.uid,
        name: myData.displayName || window.currentUser.displayName || "Oyuncu",
        avatar: myData.avatar || window.currentUser.photoURL || "fa-chess-pawn",
        createdAtMs: myData.createdAtMs || Date.now(),
      };
      const other = {
        uid: opponentData.uid,
        name: opponentData.displayName || "Oyuncu",
        avatar: opponentData.avatar || "fa-chess-pawn",
        createdAtMs: opponentData.createdAtMs || Date.now(),
      };
      const white = other.createdAtMs <= me.createdAtMs ? other : me;
      const black = white.uid === me.uid ? other : me;
      transaction.set(
        gameRef,
        buildQuickMatch1v1GameData(
          code,
          white,
          black,
          myData.timeControl || opponentData.timeControl || 5,
        ),
      );
      transaction.set(
        myRef,
        {
          status: "matched",
          gameCode: code,
          matchedUid: opponentData.uid,
          updatedAtMs: Date.now(),
        },
        { merge: true },
      );
      transaction.set(
        opponentRef,
        {
          status: "matched",
          gameCode: code,
          matchedUid: myUid,
          updatedAtMs: Date.now(),
        },
        { merge: true },
      );
      matchedCode = code;
    });
  } catch (e) {
    if (e && e.message === "code_collision") return tryResolveQuickMatch1v1();
    return false;
  }

  if (matchedCode) {
    finishQuickMatch1v1(matchedCode);
    return true;
  }
  return false;
}

window.cancelQuickMatch1v1 = async function () {
  const wasActive = quickMatch1v1Active;
  clearQuickMatch1v1Local();
  if (window.currentUser) {
    await deleteDoc(doc(db, "quick_match_1v1", window.currentUser.uid)).catch(
      function () {},
    );
  }
  if (wasActive) window.showToast("Hizli eslesme iptal edildi.", "info");
};

window.startQuickMatch1v1 = async function () {
  if (!window.currentUser)
    return window.showToast("Once giris yapmalisin.", "error");
  if (quickMatch1v1Active)
    return window.showToast("Zaten eslesme araniyor.", "info");
  if (current1v1Id && current1v1Data && current1v1Data.status !== "finished") {
    return window.showToast("Once mevcut 1v1 odasindan cik.", "error");
  }

  const myRef = doc(db, "quick_match_1v1", window.currentUser.uid);
  const now = Date.now();
  quickMatch1v1Active = true;

  await setDoc(
    myRef,
    {
      uid: window.currentUser.uid,
      displayName: window.currentUser.displayName || "Oyuncu",
      avatar: window.currentUser.photoURL || "fa-chess-pawn",
      timeControl: 5,
      status: "waiting",
      gameCode: null,
      createdAt: serverTimestamp(),
      createdAtMs: now,
      updatedAtMs: now,
    },
    { merge: true },
  );

  quickMatch1v1Unsubscribe = onSnapshot(myRef, function (snap) {
    if (!snap.exists() || !quickMatch1v1Active) return;
    const data = snap.data() || {};
    if (data.status === "matched" && data.gameCode)
      finishQuickMatch1v1(data.gameCode);
  });

  Swal.fire({
    title: "Hizli eslesme araniyor",
    html: '<div style="color:#cbd5e1; line-height:1.5;">Gercek bir 1v1 rakibi bekleniyor. Bot eslesmesi kullanilmaz.</div>',
    background: "rgba(30,30,35,0.96)",
    color: "#fff",
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: "Iptal",
    allowOutsideClick: false,
    didOpen: function () {
      Swal.showLoading();
    },
  }).then(function (result) {
    if (result.dismiss === Swal.DismissReason.cancel)
      window.cancelQuickMatch1v1();
  });

  tryResolveQuickMatch1v1();
  quickMatch1v1Timer = setInterval(function () {
    tryResolveQuickMatch1v1();
  }, 1700);
};

function getCurrent1v1TurnBot(data) {
  if (!data || data.status !== "active") return null;
  var turnTeam = chess1v1.turn() === "w" ? "white" : "black";
  var player = Array.isArray(data.players)
    ? data.players.find(function (item) {
        return item.team === turnTeam;
      })
    : null;
  return isBotPlayer(player) ? player : null;
}

function buildBotCandidateLines(result, config) {
  var lines = (
    result && Array.isArray(result.topLines) ? result.topLines : []
  ).filter(function (line) {
    return !!(line && line.uci);
  });
  if (!lines.length && result && result.bestMove) {
    lines.push({
      rank: 1,
      uci: result.bestMove,
      cp: result.cp,
      mate: result.mate,
    });
  }
  if (!lines.length) return [];

  var best = lines[0];
  return lines.filter(function (line, index) {
    if (!line || !line.uci || index >= config.candidatePool) return false;
    if (best.mate !== null && best.mate !== undefined) {
      if (best.mate > 0 && line.mate !== null && line.mate !== undefined)
        return line.mate > 0;
      return index === 0;
    }
    if (
      best.cp !== null &&
      best.cp !== undefined &&
      line.cp !== null &&
      line.cp !== undefined
    ) {
      return Math.abs(best.cp - line.cp) <= config.maxScoreGap;
    }
    return index === 0;
  });
}

function weightedPick(candidates, weights) {
  var total = weights.reduce(function (sum, value) {
    return sum + value;
  }, 0);
  if (total <= 0) return candidates[0] || null;
  var roll = Math.random() * total;
  for (var i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1] || null;
}

function pick1v1BotMoveUci(result, level) {
  var config = getBotConfig(level);
  var candidates = buildBotCandidateLines(result, config);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].uci;

  if (Math.random() < config.randomMoveChance) {
    return candidates[randomInt(0, candidates.length - 1)].uci;
  }

  var bestWeight = Math.max(0.1, Math.min(0.98, config.preferBestWeight));
  var remainingWeight = Math.max(0.02, 1 - bestWeight);
  var weights = candidates.map(function (candidate, index) {
    if (index === 0) return bestWeight;
    return (
      (remainingWeight / Math.max(1, candidates.length - 1)) *
      Math.pow(0.72, index - 1)
    );
  });
  var choice = weightedPick(candidates, weights);
  return choice ? choice.uci : candidates[0].uci;
}

function score1v1FallbackMove(game, move) {
  var pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  var score = 0;
  if (move.captured) score += (pieceValues[move.captured] || 0) + 22;
  if (move.promotion) score += 850;
  if (move.flags.indexOf("k") !== -1 || move.flags.indexOf("q") !== -1)
    score += 70;
  if (move.san && move.san.indexOf("+") !== -1) score += 85;
  if (move.san && move.san.indexOf("#") !== -1) score += 50000;
  if (
    (move.piece === "n" || move.piece === "b") &&
    (move.from[1] === "1" || move.from[1] === "8")
  )
    score += 28;
  if (move.piece === "p" && (move.to[1] === "4" || move.to[1] === "5"))
    score += 16;

  var fileDistance = Math.abs(3.5 - (move.to.charCodeAt(0) - 97));
  var rankDistance = Math.abs(3.5 - (parseInt(move.to[1], 10) - 1));
  score += Math.max(0, 26 - (fileDistance + rankDistance) * 8);

  var probe = new Chess();
  if (probe.load(game.fen())) {
    probe.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });
    var materialScore = window.materialEvalWhiteCpFromFen
      ? window.materialEvalWhiteCpFromFen(probe.fen())
      : 0;
    score += (game.turn() === "w" ? materialScore : -materialScore) * 0.025;
  }

  return score + Math.random() * 10;
}

function evaluate1v1Position(game) {
  var board = game.board();
  var pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  var centerSquares = {
    d4: 1,
    e4: 1,
    d5: 1,
    e5: 1,
    c3: 0.5,
    f3: 0.5,
    c6: 0.5,
    f6: 0.5,
    c4: 0.5,
    f4: 0.5,
    c5: 0.5,
    f5: 0.5,
  };
  var score = 0;

  for (var rank = 0; rank < 8; rank++) {
    for (var file = 0; file < 8; file++) {
      var piece = board[rank][file];
      if (!piece) continue;
      var square = String.fromCharCode(97 + file) + String(8 - rank);
      var value = pieceValues[piece.type] || 0;
      var centrality = centerSquares[square] || 0;
      var developmentBonus = 0;

      if (
        (piece.type === "n" || piece.type === "b") &&
        ((piece.color === "w" && rank < 7) || (piece.color === "b" && rank > 0))
      ) {
        developmentBonus = 12;
      }
      if (piece.type === "p" && (square[1] === "4" || square[1] === "5"))
        developmentBonus += 8;

      var signed = value + centrality * 14 + developmentBonus;
      score += piece.color === "w" ? signed : -signed;
    }
  }

  var mobility = game.moves().length * 2;
  score += game.turn() === "w" ? mobility : -mobility;

  if (game.in_checkmate()) return game.turn() === "w" ? -999999 : 999999;
  if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition())
    return 0;

  return score;
}

function search1v1BotScore(game, depth, alpha, beta) {
  if (depth <= 0 || game.game_over()) {
    return evaluate1v1Position(game) * (game.turn() === "w" ? 1 : -1);
  }

  var best = -Infinity;
  var moves = game.moves({ verbose: true });
  for (var i = 0; i < moves.length; i++) {
    var move = moves[i];
    game.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });
    var score = -search1v1BotScore(game, depth - 1, -beta, -alpha);
    game.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function pick1v1FallbackMove(fen, level) {
  var probe = new Chess();
  if (!probe.load(fen)) return null;
  var config = getBotConfig(level);
  var searchDepth = config.fallbackSearchDepth || 1;
  var moves = probe
    .moves({ verbose: true })
    .map(function (move) {
      probe.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || "q",
      });
      var searchScore = -search1v1BotScore(
        probe,
        Math.max(0, searchDepth - 1),
        -Infinity,
        Infinity,
      );
      probe.undo();
      return {
        move: move,
        score: searchScore + score1v1FallbackMove(probe, move),
      };
    })
    .sort(function (a, b) {
      return b.score - a.score;
    });
  if (!moves.length) return null;

  var pickWindow = Math.max(
    1,
    Math.min(moves.length, config.fallbackPickCount || 1),
  );
  var pickIndex = 0;
  if (pickWindow > 1) pickIndex = randomInt(0, pickWindow - 1);

  var chosen = moves[pickIndex].move;
  return {
    from: chosen.from,
    to: chosen.to,
    promotion: chosen.promotion || "q",
  };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function get1v1BotMove(data, botPlayer) {
  if (!data || !botPlayer) return null;
  var fen = data.pgn
    ? (function () {
        var probe = new Chess();
        try {
          probe.load_pgn(data.pgn);
          return probe.fen();
        } catch (e) {
          return data.fen;
        }
      })()
    : data.fen;
  if (!fen) return null;

  try {
    if (window.initStockfish) {
      await Promise.race([
        window.initStockfish(),
        new Promise(function (resolve) {
          setTimeout(resolve, 1200);
        }),
      ]);
    }
  } catch (e) {}

  var config = getBotConfig(botPlayer.botLevel);
  if (config.fallbackMixChance && Math.random() < config.fallbackMixChance) {
    return pick1v1FallbackMove(fen, botPlayer.botLevel);
  }
  var result = window.queueStockfishEval
    ? await window.queueStockfishEval(fen, {
        depth: config.depth,
        mode: "bot",
        requestId: data.moveCount + 1,
        skillLevel: config.skillLevel,
        timeoutMs: Math.max(1800, config.thinkDelayRange[1] + 900),
      })
    : null;
  var bestUci = pick1v1BotMoveUci(result, botPlayer.botLevel);
  if (bestUci) {
    return {
      from: bestUci.slice(0, 2),
      to: bestUci.slice(2, 4),
      promotion: bestUci.length > 4 ? bestUci.slice(4, 5) : "q",
    };
  }
  return pick1v1FallbackMove(fen, botPlayer.botLevel);
}

async function commit1v1Move(move, sourceData) {
  if (!move || !sourceData || !current1v1Id) return false;
  var now = Date.now();
  var timeDiff = sourceData.lastMoveTime
    ? Math.max(0, now - sourceData.lastMoveTime)
    : 0;
  var isCheck = chess1v1.in_check();
  if (window.playChessMoveSound) window.playChessMoveSound(move, chess1v1);
  else window.playGameSound("move");

  lastPlayedMoveCount1v1 = sourceData.moveCount + 1;
  var updates = {
    fen: chess1v1.fen(),
    pgn: chess1v1.pgn(),
    lastMoveTime: now,
    moveCount: sourceData.moveCount + 1,
    lastMoveFlags: move.flags,
    isCheck: isCheck,
  };
  if (chess1v1.turn() === "b")
    updates.whiteTime = Math.max(0, sourceData.whiteTime - timeDiff);
  else updates.blackTime = Math.max(0, sourceData.blackTime - timeDiff);

  if (chess1v1.game_over()) {
    updates.status = "finished";
    updates.winner = chess1v1.in_checkmate()
      ? chess1v1.turn() === "w"
        ? "black"
        : "white"
      : "draw";
  }

  board1v1SelectedSquare = null;
  board1v1ValidMoves = [];
  draw1v1Board();
  warmAnalysisCacheForActiveGame(
    "1v1",
    updates.pgn,
    updates.fen,
    updates.moveCount,
  );
  await updateDoc(doc(db, "games_1v1", current1v1Id), updates);
  return true;
}

function maybeSchedule1v1BotMove(data) {
  if (!data || data.status !== "active") {
    clearPending1v1BotMove();
    return;
  }
  const currentUser = window.currentUser;
  if (
    !currentUser ||
    current1v1Role !== "player" ||
    data.hostId !== currentUser.uid
  ) {
    return;
  }
  var botPlayer = getCurrent1v1TurnBot(data);
  if (!botPlayer) {
    clearPending1v1BotMove();
    return;
  }

  var botConfig = getBotConfig(botPlayer.botLevel);
  var moveKey = [
    current1v1Id,
    data.moveCount,
    chess1v1.turn(),
    botPlayer.uid,
  ].join(":");
  if (pending1v1BotMoveKey === moveKey) return;

  clearPending1v1BotMove();
  pending1v1BotMoveKey = moveKey;
  pending1v1BotMoveTimer = setTimeout(
    async function () {
      pending1v1BotMoveTimer = null;
      try {
        if (
          !current1v1Id ||
          !current1v1Data ||
          current1v1Data.status !== "active"
        )
          return;
        if (pending1v1BotMoveKey !== moveKey) return;

        var liveSnap = await getDoc(doc(db, "games_1v1", current1v1Id)).catch(
          function () {
            return null;
          },
        );
        if (!liveSnap || !liveSnap.exists()) return;
        var latest = liveSnap.data() || {};
        if (
          latest.status !== "active" ||
          latest.moveCount !== data.moveCount ||
          latest.hostId !== currentUser.uid
        )
          return;

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
    },
    randomInt(botConfig.thinkDelayRange[0], botConfig.thinkDelayRange[1]),
  );
}

window.create1v1Game = async () => {
  window.playGameSound("nav");
  const code = window.makeId(5);
  const gameData = {
    code: code,
    hostId: window.currentUser.uid,
    gameMode: "1v1",
    status: "lobby",
    timeControl: 5,
    hostColorPreference: "white",
    whiteTime: 300000,
    blackTime: 300000,
    lastMoveTime: null,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    pgn: "",
    moveCount: 0,
    players: [
      {
        uid: window.currentUser.uid,
        name: window.currentUser.displayName,
        avatar: window.currentUser.photoURL || "fa-chess-pawn",
        team: "white",
        index: 0,
        isReady: false,
      },
      makeEmptySeat("black", "Siyah Boş"),
    ],
    participantIds: [window.currentUser.uid],
    spectatorIds: [],
    disconnectState: {},
    winner: null,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, "games_1v1", code), gameData);
  window.enter1v1Game(code);
};

window.join1v1Prompt = async () => {
  const result = await Swal.fire({
    title: "1v1 Oda Kodu",
    input: "text",
    inputPlaceholder: "Örn: X9Y2Z",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    confirmButtonColor: "#22c55e",
  });
  if (result.value) window.enter1v1Game(result.value.trim().toUpperCase());
};

window.enter1v1Game = (code) => {
  window.releaseModeListeners("1v1");
  if (unsubscribe1v1) unsubscribe1v1();
  if (window.unsubscribeChat) window.unsubscribeChat();
  current1v1Id = code;
  clearPending1v1BotMove();
  board1v1SelectedSquare = null;
  board1v1ValidMoves = [];
  chess1v1.reset();
  lastPlayedMoveCount1v1 = -1;
  lastRenderedLiveMoveCount1v1 = -1;
  trainingAssist1v1State.requestToken += 1;
  trainingAssist1v1State.bestMoveUci = null;
  trainingAssist1v1State.bestMoveSan = "-";
  trainingAssist1v1State.evalText = "--";
  trainingAssist1v1State.statusText = "Mac bekleniyor.";
  trainingAssist1v1State.fen = null;
  trainingAssist1v1State.applyingFen = null;

  unsubscribe1v1 = onSnapshot(doc(db, "games_1v1", code), function (snap) {
    if (!snap.exists()) {
      window.showToast("1v1 oyunu bulunamadı.", "error");
      window.leave1v1Lobby();
      return;
    }

    const data = snap.data();
    current1v1Data = data;
    current1v1Role = data.players.some(function (player) {
      return player.uid === window.currentUser.uid;
    })
      ? "player"
      : "spectator";
    syncSpectatorMembership("1v1", code, data, current1v1Role);
    syncGamePresence("1v1", code, data, current1v1Role);
    if (
      current1v1Role === "player" &&
      data.status === "active" &&
      !document.hidden
    )
      window.setCurrentReconnectState(true);

    if (data.status === "lobby") {
      render1v1Lobby(data);
      window.switchView("view-1v1-lobby");
    } else if (data.status === "active" || data.status === "finished") {
      update1v1Game(data);
      if (
        !document.getElementById("view-1v1-game").classList.contains("active")
      ) {
        window.switchView("view-1v1-game");
        if (lastPlayedMoveCount1v1 === -1)
          lastPlayedMoveCount1v1 = data.moveCount;
        draw1v1Board();
      }
      if (data.status === "finished" && current1v1Role === "player") {
        showGameOverModal(data);
      }
    }
  });
  window.initChat(code);
};

window.copy1v1Code = () => {
  navigator.clipboard.writeText(current1v1Id).then(function () {
    window.showToast("1v1 oda kodu kopyalandı!", "success");
  });
};

window.leave1v1Lobby = async () => {
  if (unsubscribe1v1) unsubscribe1v1();
  if (window.unsubscribeChat) window.unsubscribeChat();
  if (game1v1TimerInterval) clearInterval(game1v1TimerInterval);
  clearPending1v1BotMove();
  lastRenderedLiveMoveCount1v1 = -1;
  trainingAssist1v1State.requestToken += 1;
  trainingAssist1v1State.bestMoveUci = null;
  trainingAssist1v1State.bestMoveSan = "-";
  trainingAssist1v1State.evalText = "--";
  trainingAssist1v1State.statusText = "Mac bekleniyor.";
  trainingAssist1v1State.fen = null;
  trainingAssist1v1State.applyingFen = null;
  sync1v1TrainingAssistUI(null);
  if (
    current1v1Data &&
    current1v1Data.status === "active" &&
    current1v1Role === "player"
  )
    window.setCurrentReconnectState(false);
  removeSpectatorMembership(
    "1v1",
    current1v1Id,
    current1v1Data,
    current1v1Role,
  );

  if (current1v1Data && current1v1Data.status === "lobby") {
    const updatedPlayers = current1v1Data.players.map(function (player) {
      if (player.uid === window.currentUser.uid || isBotPlayer(player)) {
        return makeEmptySeat(player.team, get1v1SeatLabel(player.team));
      }
      return player;
    });
    const remainingPlayer = updatedPlayers.find(function (player) {
      return !!player.uid && !isBotPlayer(player);
    });
    const updates = {
      players: updatedPlayers,
      participantIds: arrayRemove(window.currentUser.uid),
      hostId: remainingPlayer ? remainingPlayer.uid : null,
    };
    await updateDoc(doc(db, "games_1v1", current1v1Id), updates);
  }

  current1v1Id = null;
  current1v1Data = null;
  current1v1Role = "player";
  window.switchView("view-dashboard");
};

function render1v1Lobby(data) {
  document.getElementById("lobby1v1Code").innerText = data.code;
  const isHost = data.hostId === window.currentUser.uid;
  document.getElementById("hostControls1v1").style.display = isHost
    ? "block"
    : "none";
  if (isHost) {
    document.getElementById("timeControlSelect1v1").value =
      data.timeControl || 5;
    var colorSelect = document.getElementById("hostColorSelect1v1");
    if (colorSelect)
      colorSelect.value = normalize1v1HostColorPreference(
        data.hostColorPreference,
      );
  }

  data.players.forEach(function (player) {
    const slotId =
      player.team === "white" ? "slot-1v1-white" : "slot-1v1-black";
    const el = document.getElementById(slotId);
    el.className =
      "team-slot team-" +
      player.team +
      (player.uid ? " taken" : "") +
      (player.isReady ? " ready" : "");
    if (isBotPlayer(player)) {
      var botConfig = getBotConfig(player.botLevel);
      el.innerHTML =
        '<div class="seat-shell">' +
        '<div class="seat-main">' +
        '<div class="seat-title"><span><i class="fas ' +
        window.escapeHtml(player.avatar || botConfig.avatar) +
        '"></i> ' +
        window.escapeHtml(player.name || botConfig.label) +
        '</span><span class="bot-pill" style="--bot-accent:' +
        window.escapeHtml(botConfig.accent) +
        ';">' +
        window.escapeHtml(botConfig.shortLabel) +
        "</span></div>" +
        '<div class="seat-sub">Motor derinliği: ' +
        botConfig.depth +
        ". seviye</div>" +
        "</div>" +
        (isHost
          ? '<div class="seat-actions"><button class="secondary bot-remove-btn" onclick="event.stopPropagation(); remove1v1Bot(\'' +
            player.team +
            '\')"><i class="fas fa-trash"></i> BOTU KALDIR</button></div>'
          : "") +
        "</div>";
    } else if (player.uid) {
      el.innerHTML =
        '<div class="seat-shell">' +
        '<div class="seat-main">' +
        '<div class="seat-title"><span><i class="fas ' +
        window.escapeHtml(player.avatar || "fa-user") +
        '"></i> ' +
        window.escapeHtml(player.name) +
        " " +
        (player.uid === data.hostId
          ? '<i class="fas fa-crown" style="color:var(--primary); margin-left:4px;"></i>'
          : "") +
        "</span>" +
        (player.isReady
          ? '<i class="fas fa-check" style="color:var(--success)"></i>'
          : '<i class="fas fa-clock"></i>') +
        "</div>" +
        '<div class="seat-sub">' +
        (player.uid === window.currentUser.uid
          ? "Bu koltuk sende."
          : "Oyuncu hazırlık bekliyor.") +
        "</div>" +
        "</div>" +
        "</div>";
    } else {
      el.innerHTML =
        '<div class="seat-shell">' +
        '<div class="seat-main">' +
        '<div class="seat-title"><span><i class="fas fa-plus"></i> ' +
        window.escapeHtml(get1v1SeatLabel(player.team)) +
        "</span></div>" +
        '<div class="seat-sub">Tıklayıp bu koltuğa otur. Lobi sahibiysen aşağıdan yapay zeka botu da ekleyebilirsin.</div>' +
        "</div>" +
        (isHost
          ? '<div class="seat-actions seat-bot-picker">' +
            '<button class="secondary seat-bot-btn easy" onclick="event.stopPropagation(); add1v1Bot(\'' +
            player.team +
            "', 'easy')\">Kolay AI</button>" +
            '<button class="secondary seat-bot-btn medium" onclick="event.stopPropagation(); add1v1Bot(\'' +
            player.team +
            "', 'medium')\">Orta AI</button>" +
            '<button class="secondary seat-bot-btn hard" onclick="event.stopPropagation(); add1v1Bot(\'' +
            player.team +
            "', 'hard')\">Zor AI</button>" +
            "</div>"
          : "") +
        "</div>";
    }
    if (window.appendLobbyFriendButton)
      window.appendLobbyFriendButton(el, player.uid);
  });

  const mySeat = data.players.find(function (player) {
    return player.uid === window.currentUser.uid;
  });
  const btnReady = document.getElementById("btnReady1v1");
  if (mySeat) {
    btnReady.style.display = "block";
    btnReady.innerText = mySeat.isReady ? "HAZIRIM (BEKLENİYOR...)" : "HAZIRIM";
    btnReady.classList.toggle("secondary", mySeat.isReady);
  } else {
    btnReady.style.display = "none";
  }
}

window.join1v1Seat = async (team) => {
  if (!current1v1Data) return;
  const targetSeat = current1v1Data.players.find(function (player) {
    return player.team === team;
  });
  if (
    targetSeat.uid &&
    targetSeat.uid !== window.currentUser.uid &&
    !isBotPlayer(targetSeat)
  )
    return window.showToast("Bu taraf dolu.", "error");

  let updatedPlayers = current1v1Data.players.map(function (player) {
    if (player.uid === window.currentUser.uid) {
      return makeEmptySeat(player.team, get1v1SeatLabel(player.team));
    }
    return player;
  });

  updatedPlayers = updatedPlayers.map(function (player) {
    if (player.team === team) {
      return {
        uid: window.currentUser.uid,
        name: window.currentUser.displayName,
        avatar: window.currentUser.photoURL || "fa-chess-pawn",
        team: team,
        index: 0,
        isReady: false,
      };
    }
    return player;
  });

  await updateDoc(doc(db, "games_1v1", current1v1Id), {
    players: updatedPlayers,
    participantIds: arrayUnion(window.currentUser.uid),
  });
};

window.add1v1Bot = async function (team, level) {
  if (!current1v1Data || current1v1Data.hostId !== window.currentUser.uid)
    return window.showToast("Botu sadece lobi sahibi ekleyebilir.", "error");
  var targetSeat = current1v1Data.players.find(function (player) {
    return player.team === team;
  });
  if (!targetSeat) return;
  if (targetSeat.uid && !isBotPlayer(targetSeat))
    return window.showToast(
      "Bu taraf zaten bir oyuncu tarafından alındı.",
      "error",
    );
  await updateDoc(doc(db, "games_1v1", current1v1Id), {
    players: current1v1Data.players.map(function (player) {
      return player.team === team ? makeBotPlayer(team, level) : player;
    }),
  });
  if (window.initStockfish) window.initStockfish().catch(function () {});
};

window.remove1v1Bot = async function (team) {
  if (!current1v1Data || current1v1Data.hostId !== window.currentUser.uid)
    return;
  await updateDoc(doc(db, "games_1v1", current1v1Id), {
    players: current1v1Data.players.map(function (player) {
      return player.team === team && isBotPlayer(player)
        ? makeEmptySeat(player.team, get1v1SeatLabel(player.team))
        : player;
    }),
  });
};

window.toggleReady1v1 = async () => {
  if (!current1v1Data) return;
  const updatedPlayers = current1v1Data.players.map(function (player) {
    if (player.uid === window.currentUser.uid)
      return Object.assign({}, player, { isReady: !player.isReady });
    return player;
  });
  await updateDoc(doc(db, "games_1v1", current1v1Id), {
    players: updatedPlayers,
  });
};

document.getElementById("timeControlSelect1v1").onchange = async function () {
  if (!current1v1Id) return;
  await updateDoc(doc(db, "games_1v1", current1v1Id), {
    timeControl: parseInt(
      document.getElementById("timeControlSelect1v1").value,
      10,
    ),
  });
};

document.getElementById("hostColorSelect1v1").onchange = async function () {
  if (
    !current1v1Id ||
    !current1v1Data ||
    current1v1Data.hostId !== window.currentUser.uid
  )
    return;
  var preference = normalize1v1HostColorPreference(
    document.getElementById("hostColorSelect1v1").value,
  );
  var updates = { hostColorPreference: preference };
  if (preference !== "random") {
    updates.players = assign1v1HostColor(
      current1v1Data.players,
      current1v1Data.hostId,
      preference,
    );
  }
  await updateDoc(doc(db, "games_1v1", current1v1Id), updates);
};

window.start1v1Game = async () => {
  if (!current1v1Data) return;
  if (
    current1v1Data.players.some(function (player) {
      return !player.uid || !player.isReady;
    })
  ) {
    return window.showToast("İki oyuncu da hazır olmalı.", "error");
  }
  if (
    current1v1Data.players.some(function (player) {
      return isBotPlayer(player);
    })
  ) {
    if (window.initStockfish) window.initStockfish().catch(function () {});
  }
  const finalPlayers = assign1v1HostColor(
    current1v1Data.players,
    current1v1Data.hostId,
    normalize1v1HostColorPreference(current1v1Data.hostColorPreference),
  );
  const ms = (current1v1Data.timeControl || 5) * 60 * 1000;
  await updateDoc(doc(db, "games_1v1", current1v1Id), {
    status: "active",
    players: finalPlayers,
    whiteTime: ms,
    blackTime: ms,
    lastMoveTime: Date.now(),
    moveCount: 0,
    winner: null,
    disconnectState: {},
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    pgn: "",
  });
  window.playGameSound("gameStart");
};

function update1v1TimerDisplay(whiteMs, blackMs) {
  const whiteText = getFormattedClock(whiteMs);
  const blackText = getFormattedClock(blackMs);
  document.getElementById("timer1v1White").innerText = whiteText;
  document.getElementById("timer1v1Black").innerText = blackText;
  if (activeFullscreenBoardMode === "1v1" && window.syncFullscreenTimers)
    window.syncFullscreenTimers(whiteText, blackText);
}

async function handle1v1TimeOut(loserColor) {
  if (
    current1v1Data.hostId === window.currentUser.uid &&
    current1v1Data.status === "active"
  ) {
    const winner = loserColor === "white" ? "black" : "white";
    await updateDoc(doc(db, "games_1v1", current1v1Id), {
      status: "finished",
      winner: winner,
    });
  }
}

function getFormattedClock(ms) {
  const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
}

function buildLiveMoveHistoryRows(history) {
  var rows = [];
  for (var i = 0; i < history.length; i += 2) {
    rows.push({
      number: Math.floor(i / 2) + 1,
      white: history[i] ? history[i].san : null,
      black: history[i + 1] ? history[i + 1].san : null,
      isLatest: i + 2 >= history.length,
    });
  }
  return rows;
}

function renderLiveMovePanel(options) {
  var listEl = document.getElementById(options.listId);
  var latestEl = document.getElementById(options.latestId);
  var countEl = document.getElementById(options.countId);
  var statusEl = document.getElementById(options.statusId);
  if (!listEl) return;

  var history = [];
  try {
    history = options.chess.history({ verbose: true });
  } catch (e) {
    history = [];
  }

  if (countEl) countEl.innerText = history.length + " hamle";
  if (latestEl)
    latestEl.innerText = history.length ? history[history.length - 1].san : "-";
  if (statusEl) statusEl.innerText = options.statusText || "Canli oyun";

  if (!history.length) {
    listEl.innerHTML =
      '<div class="live-move-empty">Hamleler burada akacak.<br>Oyun basladiginda liste otomatik dolacak.</div>';
    return 0;
  }

  var rows = buildLiveMoveHistoryRows(history);
  listEl.innerHTML = rows
    .map(function (row) {
      return (
        '<div class="live-move-row' +
        (row.isLatest ? " is-latest" : "") +
        '">' +
        '<span class="live-move-number">' +
        row.number +
        ".</span>" +
        '<span class="live-move-san">' +
        window.escapeHtml(row.white || "...") +
        "</span>" +
        '<span class="live-move-san' +
        (row.black ? "" : " empty") +
        '">' +
        window.escapeHtml(row.black || "...") +
        "</span>" +
        "</div>"
      );
    })
    .join("");

  if (options.lastRenderedCount !== history.length) {
    listEl.scrollTop = listEl.scrollHeight;
  }
  return history.length;
}

function isTrainingAssistAdmin() {
  var email =
    window.currentUser && window.currentUser.email
      ? String(window.currentUser.email).toLowerCase()
      : "";
  return email === TRAINING_ASSIST_ADMIN_EMAIL;
}

function is1v1BotTrainingMode(data) {
  return !!(
    data &&
    Array.isArray(data.players) &&
    data.players.some(function (player) {
      return isBotPlayer(player);
    })
  );
}

function formatTrainingEval(result) {
  if (!result) return "--";
  if (result.mate !== null && result.mate !== undefined) {
    return (result.mate > 0 ? "+" : "") + "M" + result.mate;
  }
  if (result.cp !== null && result.cp !== undefined) {
    var score = result.cp / 100;
    return (score > 0 ? "+" : "") + score.toFixed(1);
  }
  return "--";
}

function formatUciMoveForFen(fen, uci) {
  if (!fen || !uci || uci.length < 4) return "-";
  try {
    var probe = new Chess();
    if (!probe.load(fen)) return uci;
    var move = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
    if (uci.length > 4) move.promotion = uci.slice(4, 5);
    var played = probe.move(move);
    return played && played.san ? played.san : uci;
  } catch (e) {
    return uci;
  }
}

function translateSanToTurkish(san) {
  if (!san || san === "-") return san || "-";
  var castleToken = san.match(/^O-O-O|^0-0-0|^O-O|^0-0/);
  var prefix = "";
  var rest = san;
  if (castleToken) {
    prefix = castleToken[0];
    rest = san.slice(prefix.length);
    return prefix + rest;
  }
  return san.replace(/[KQRBN]/g, function (ch) {
    return (
      {
        K: "S",
        Q: "V",
        R: "K",
        B: "F",
        N: "A",
      }[ch] || ch
    );
  });
}

function get1v1TrainingPlayer(data) {
  if (!data || !window.currentUser) return null;
  return (
    data.players.find(function (player) {
      return player.uid === window.currentUser.uid;
    }) || null
  );
}

function is1v1TrainingUserTurn(data) {
  var player = get1v1TrainingPlayer(data);
  if (!player || !data || data.status !== "active") return false;
  var turnTeam = chess1v1.turn() === "w" ? "white" : "black";
  return player.team === turnTeam;
}

function sync1v1TrainingAssistUI(data) {
  var card = document.getElementById("trainingAssistCard1v1");
  var contextEl = document.getElementById("trainingAssistContext1v1");
  var bestEl = document.getElementById("trainingAssistBest1v1");
  var evalEl = document.getElementById("trainingAssistEval1v1");
  var statusEl = document.getElementById("trainingAssistStatus1v1");
  var playBtn = document.getElementById("trainingAssistPlayBtn1v1");
  var autoBtn = document.getElementById("trainingAssistAutoBtn1v1");
  if (
    !card ||
    !contextEl ||
    !bestEl ||
    !evalEl ||
    !statusEl ||
    !playBtn ||
    !autoBtn
  )
    return;

  var visible =
    isTrainingAssistAdmin() &&
    is1v1BotTrainingMode(data) &&
    current1v1Role === "player";
  if (card) card.style.display = visible ? "grid" : "none";
  if(typeof mCard !== 'undefined' && mCard) mCard.style.display = visible ? "grid" : "none";
  if (!visible) return;

  var isMyTurn = is1v1TrainingUserTurn(data);
  contextEl.innerText =
    data.status !== "active"
      ? "Mac aktif degil"
      : isMyTurn
        ? "Sira sende"
        : "Rakip oynuyor";
  bestEl.innerText = trainingAssist1v1State.bestMoveSan || "-";
  evalEl.innerText = trainingAssist1v1State.evalText || "--";
  statusEl.innerText = trainingAssist1v1State.statusText || "Motor bekleniyor.";
  playBtn.disabled =
    !isMyTurn ||
    !trainingAssist1v1State.bestMoveUci ||
    data.status !== "active";
  autoBtn.innerHTML =
    '<i class="fas fa-wand-magic-sparkles"></i> ' +
    (trainingAssist1v1State.autoPlay ? "Oto Acik" : "Oto Kapali");
  autoBtn.classList.toggle("active", !!trainingAssist1v1State.autoPlay);
}

async function playTrainingAssistMove1v1Internal() {
  if (!current1v1Data || current1v1Data.status !== "active") return false;
  if (!is1v1TrainingUserTurn(current1v1Data)) return false;
  var fen = chess1v1.fen();
  var bestUci = trainingAssist1v1State.bestMoveUci;
  if (
    !bestUci ||
    trainingAssist1v1State.fen !== fen ||
    trainingAssist1v1State.applyingFen === fen
  )
    return false;

  var move = chess1v1.move({
    from: bestUci.slice(0, 2),
    to: bestUci.slice(2, 4),
    promotion: bestUci.length > 4 ? bestUci.slice(4, 5) : "q",
  });
  if (!move) return false;

  trainingAssist1v1State.applyingFen = fen;
  try {
    await commit1v1Move(move, current1v1Data);
    return true;
  } finally {
    trainingAssist1v1State.applyingFen = null;
  }
}

async function refresh1v1TrainingAssist(data, force) {
  sync1v1TrainingAssistUI(data);
  if (
    !isTrainingAssistAdmin() ||
    !is1v1BotTrainingMode(data) ||
    current1v1Role !== "player"
  )
    return;
  if (!data || data.status !== "active") {
    trainingAssist1v1State.statusText =
      "Panel sadece aktif bot macinda kullanilir.";
    sync1v1TrainingAssistUI(data);
    return;
  }
  if (!is1v1TrainingUserTurn(data)) {
    trainingAssist1v1State.statusText = "Rakibin hamlesi bekleniyor.";
    sync1v1TrainingAssistUI(data);
    return;
  }
  if (!window.queueStockfishEval || !window.initStockfish) {
    trainingAssist1v1State.statusText = "Stockfish hazir degil.";
    sync1v1TrainingAssistUI(data);
    return;
  }

  var fen = chess1v1.fen();
  if (
    !force &&
    trainingAssist1v1State.fen === fen &&
    trainingAssist1v1State.bestMoveUci
  ) {
    sync1v1TrainingAssistUI(data);
    if (trainingAssist1v1State.autoPlay)
      await playTrainingAssistMove1v1Internal();
    return;
  }

  var token = ++trainingAssist1v1State.requestToken;
  trainingAssist1v1State.statusText = "Motor en iyi hamleyi hesapliyor...";
  trainingAssist1v1State.bestMoveUci = null;
  trainingAssist1v1State.bestMoveSan = "-";
  trainingAssist1v1State.evalText = "--";
  sync1v1TrainingAssistUI(data);

  try {
    await window.initStockfish();
    var result = await window.queueStockfishEval(fen, {
      depth: 16,
      mode: "training_assist_1v1",
      requestId: Date.now(),
      timeoutMs: 2600,
    });
    if (token !== trainingAssist1v1State.requestToken) return;
    var bestUci =
      result &&
      (result.bestMove ||
        (result.topLines && result.topLines[0] && result.topLines[0].uci));
    trainingAssist1v1State.fen = fen;
    trainingAssist1v1State.bestMoveUci = bestUci || null;
    trainingAssist1v1State.bestMoveSan = formatUciMoveForFen(fen, bestUci);
    trainingAssist1v1State.evalText = formatTrainingEval(result);
    trainingAssist1v1State.statusText = bestUci
      ? "En iyi devam hazir. Istersen tek dokunusla oynatabilirsin."
      : "Bu konum icin hamle bulunamadi.";
    sync1v1TrainingAssistUI(data);
    if (trainingAssist1v1State.autoPlay && bestUci)
      await playTrainingAssistMove1v1Internal();
  } catch (e) {
    if (token !== trainingAssist1v1State.requestToken) return;
    trainingAssist1v1State.statusText =
      "Motor sorgusu basarisiz oldu. Tekrar dene.";
    sync1v1TrainingAssistUI(data);
  }
}

window.refreshTrainingAssist1v1 = function () {
  refresh1v1TrainingAssist(current1v1Data, true);
};

window.playTrainingAssistMove1v1 = async function () {
  var ok = await playTrainingAssistMove1v1Internal();
  if (!ok) window.showToast("Bu anda otomatik oynatma kullanilamiyor.", "info");
};

window.toggleTrainingAssistAuto1v1 = function () {
  trainingAssist1v1State.autoPlay = !trainingAssist1v1State.autoPlay;
  sync1v1TrainingAssistUI(current1v1Data);
  if (trainingAssist1v1State.autoPlay)
    refresh1v1TrainingAssist(current1v1Data, false);
};

function isSoloTrainingAllowed() {
  var email =
    window.currentUser && window.currentUser.email
      ? String(window.currentUser.email).toLowerCase()
      : "";
  return email === SOLO_TRAINING_ALLOWED_EMAIL;
}

function syncSoloTrainingAccess() {
  var card = document.getElementById("soloTrainingEntryCard");
  var mCard = document.getElementById("modern_soloTrainingEntryCard");
  if (card)
    if (card) card.style.display = isSoloTrainingAllowed() ? "flex" : "none";
  if(typeof mCard !== 'undefined' && mCard) mCard.style.display = isSoloTrainingAllowed() ? "flex" : "none";
  if (
    window.currentViewId === "view-solo-training" &&
    !isSoloTrainingAllowed()
  ) {
    window.switchView(window.currentUser ? "view-dashboard" : "view-auth");
  }
}
window.syncSoloTrainingAccess = syncSoloTrainingAccess;

function getSoloColorName(color) {
  return color === "black" || color === "b" ? "Siyah" : "Beyaz";
}

function formatSoloMoveText(san) {
  if (!san || san === "-") return "-";
  return soloTrainingState.moveLanguage === "tr"
    ? translateSanToTurkish(san)
    : san;
}

function getSoloCurrentSide() {
  return soloTrainingChess.turn() === "w" ? "white" : "black";
}

function getSoloGameStatusText() {
  if (
    typeof soloTrainingChess.in_checkmate === "function" &&
    soloTrainingChess.in_checkmate()
  ) {
    return (
      getSoloColorName(soloTrainingChess.turn() === "w" ? "black" : "white") +
      " mat verdi"
    );
  }
  if (
    typeof soloTrainingChess.in_stalemate === "function" &&
    soloTrainingChess.in_stalemate()
  )
    return "Pat";
  if (
    typeof soloTrainingChess.in_draw === "function" &&
    soloTrainingChess.in_draw()
  )
    return "Beraberlik";
  if (
    typeof soloTrainingChess.in_check === "function" &&
    soloTrainingChess.in_check()
  ) {
    return getSoloColorName(soloTrainingChess.turn()) + " sah altinda";
  }
  return "Devam ediyor";
}

function isSoloGameOver() {
  return (
    typeof soloTrainingChess.game_over === "function" &&
    soloTrainingChess.game_over()
  );
}

function getSoloFenForSide(baseFen, color) {
  if (!baseFen) return null;
  var parts = baseFen.split(" ");
  if (parts.length < 6) return null;
  var nextTurn = color === "black" ? "b" : "w";
  if (parts[1] !== nextTurn) parts[3] = "-";
  parts[1] = nextTurn;
  var sideFen = parts.join(" ");
  try {
    var probe = new Chess();
    if (!probe.load(sideFen)) return null;
    return sideFen;
  } catch (e) {
    return null;
  }
}

function emptySoloBest(statusText) {
  return {
    fen: null,
    uci: null,
    san: "-",
    evalText: "--",
    statusText: statusText || "Bu taraf icin hamle yok",
  };
}

function getSoloCandidateLines(result) {
  var lines = (
    result && Array.isArray(result.topLines) ? result.topLines : []
  ).filter(function (line) {
    return !!(line && line.uci);
  });
  if (!lines.length && result && result.bestMove) {
    lines.push({
      rank: 1,
      uci: result.bestMove,
      cp: result.cp,
      mate: result.mate,
    });
  }
  return lines;
}

function isSoloDrawishAfterMove(fen, uci) {
  if (!fen || !uci || uci.length < 4) return false;
  try {
    var probe = new Chess();
    if (!probe.load(fen)) return false;
    var played = probe.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : "q",
    });
    if (!played) return false;
    if (typeof probe.in_checkmate === "function" && probe.in_checkmate())
      return false;
    if (typeof probe.in_stalemate === "function" && probe.in_stalemate())
      return true;
    if (
      typeof probe.in_threefold_repetition === "function" &&
      probe.in_threefold_repetition()
    )
      return true;
    return typeof probe.in_draw === "function" && probe.in_draw();
  } catch (e) {
    return false;
  }
}

function pickSoloBestLineAvoidingDraw(fen, result) {
  var lines = getSoloCandidateLines(result);
  var fallback = lines[0] || null;
  if (!fallback) return { line: null, avoidedDraw: false };
  var sideEval = getSoloSideEvalCp(result);
  if (sideEval === null || sideEval < 180)
    return { line: fallback, avoidedDraw: false };
  if (!isSoloDrawishAfterMove(fen, fallback.uci))
    return { line: fallback, avoidedDraw: false };

  var bestCp =
    fallback.cp !== null && fallback.cp !== undefined ? fallback.cp : result.cp;
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i];
    if (!line || !line.uci || isSoloDrawishAfterMove(fen, line.uci)) continue;
    if (result.mate !== null && result.mate !== undefined)
      return { line: line, avoidedDraw: true };
    if (
      bestCp === null ||
      bestCp === undefined ||
      line.cp === null ||
      line.cp === undefined ||
      bestCp - line.cp <= 140
    ) {
      return { line: line, avoidedDraw: true };
    }
  }
  return { line: fallback, avoidedDraw: false };
}

function normalizeSoloBest(fen, result) {
  var selected = pickSoloBestLineAvoidingDraw(fen, result);
  var bestUci = selected.line && selected.line.uci;
  return {
    fen: fen || null,
    uci: bestUci || null,
    san: bestUci ? formatUciMoveForFen(fen, bestUci) : "-",
    evalText: formatTrainingEval(result),
    statusText: bestUci
      ? selected.avoidedDraw
        ? "Avantajli taraf icin beraberlikten kacan guclu hat secildi."
        : result && result.fallback
          ? "Materyal hesabi; motor hatti isinmadi."
          : "Tikla ve tahtada kisa animasyonla gor."
      : "Bu konumda motor hamle bulamadi.",
  };
}

function emptySoloBrilliant(note) {
  return {
    fen: null,
    uci: null,
    san: "-",
    note: note || "Brilliant seviyesinde aday yok",
    found: false,
  };
}

function getSoloPieceValue(type) {
  return { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[type] || 0;
}

function getSoloMoveCategoryIconClass(category) {
  return (
    {
      brilliant: "fa-gem",
      great: "fa-bolt",
      best: "fa-star",
      book: "fa-book",
      excellent: "fa-thumbs-up",
      good: "fa-check",
      inaccuracy: "fa-triangle-exclamation",
      mistake: "fa-circle-exclamation",
      blunder: "fa-xmark",
    }[category] || "fa-circle"
  );
}

function getSoloMoveCategoryLabel(category) {
  var tr = {
    brilliant: "Brilliant",
    great: "Kritik",
    best: "En iyi",
    book: "Teori",
    excellent: "Harika",
    good: "İyi",
    inaccuracy: "Hassas değil",
    mistake: "Hata",
    blunder: "Büyük hata",
  };
  var en = {
    brilliant: "Brilliant",
    great: "Great",
    best: "Best",
    book: "Book",
    excellent: "Excellent",
    good: "Good",
    inaccuracy: "Inaccuracy",
    mistake: "Mistake",
    blunder: "Blunder",
  };
  return (
    (soloTrainingState.moveLanguage === "tr" ? tr : en)[category] || category
  );
}

function getSoloMoveUci(move) {
  if (!move) return "";
  return (
    String(move.from || "") + String(move.to || "") + (move.promotion || "")
  );
}

function classifySoloPlayedMove(move, side, beforeFen) {
  var uci = getSoloMoveUci(move);
  var best = soloTrainingState.best[side] || {};
  var brilliant = soloTrainingState.brilliant[side] || {};
  if (brilliant.found && brilliant.uci === uci) return "brilliant";
  if (
    best.uci === uci ||
    (best.uci &&
      best.uci.slice(0, 4) === uci.slice(0, 4) &&
      (!best.uci[4] || best.uci[4] === uci[4]))
  )
    return "best";
  if (move.san && move.san.indexOf("#") !== -1) return "brilliant";
  if (
    move.flags &&
    (move.flags.indexOf("k") !== -1 || move.flags.indexOf("q") !== -1)
  )
    return "excellent";
  if (move.promotion) return "great";
  if (move.san && move.san.indexOf("+") !== -1) return "excellent";
  if (move.captured) {
    var movedValue = 1;
    try {
      var before = new Chess();
      if (before.load(beforeFen)) {
        var piece = before.get(move.from);
        movedValue = piece ? getSoloPieceValue(piece.type) : 1;
      }
    } catch (e) {}
    var capturedValue = getSoloPieceValue(move.captured);
    if (capturedValue >= movedValue + 2) return "great";
    if (capturedValue >= movedValue) return "excellent";
    if (movedValue >= capturedValue + 4) return "mistake";
    return "good";
  }
  if (best.uci && best.uci.slice(0, 2) === move.from) return "good";
  if (best.uci && uci && best.uci.slice(0, 4) !== uci.slice(0, 4))
    return "inaccuracy";
  return "good";
}

function recordSoloMoveClassification(move, side, beforeFen, forcedCategory) {
  var category =
    forcedCategory || classifySoloPlayedMove(move, side, beforeFen);
  soloTrainingMoveClassifications.push({
    ply: soloTrainingChess.history().length,
    color: side === "black" ? "b" : "w",
    side: side,
    from: move.from,
    to: move.to,
    san: move.san,
    category: category,
  });
}

function emptySoloMistakeCandidate(note) {
  return {
    fen: null,
    uci: null,
    san: "-",
    note: note || "Bu seviyede riskli hamle bulunmadi",
    found: false,
  };
}

function emptySoloMistakeSet(note) {
  return {
    inaccuracy: emptySoloMistakeCandidate(note),
    mistake: emptySoloMistakeCandidate(note),
    blunder: emptySoloMistakeCandidate(note),
  };
}

function getSoloMaterialScoreForColor(chessInstance, color) {
  var score = 0;
  var board = chessInstance.board();
  for (var r = 0; r < board.length; r++) {
    for (var c = 0; c < board[r].length; c++) {
      var piece = board[r][c];
      if (!piece) continue;
      var value = getSoloPieceValue(piece.type) * 100;
      score += piece.color === color ? value : -value;
    }
  }
  return score;
}

function getSoloMoveBaseUci(moveOrUci) {
  var uci =
    typeof moveOrUci === "string" ? moveOrUci : getSoloMoveUci(moveOrUci);
  return uci ? uci.slice(0, 4) : "";
}

function getSoloTopMoveBases(result) {
  var top = {};
  getSoloCandidateLines(result).forEach(function (line) {
    var base = getSoloMoveBaseUci(line.uci);
    if (base) top[base] = true;
  });
  return top;
}

function getSoloHangingLossAfterMove(
  afterChess,
  move,
  beforePiece,
  capturedValue,
) {
  if (!beforePiece || !move || !move.to) return 0;
  var movedValue = getSoloPieceValue(beforePiece.type) * 100;
  if (movedValue <= 0) return 0;
  var attackers = afterChess.moves({ verbose: true }).filter(function (reply) {
    return reply && reply.to === move.to && reply.captured === beforePiece.type;
  });
  if (!attackers.length) return 0;
  var cheapestAttacker = 900;
  attackers.forEach(function (reply) {
    var attacker = afterChess.get(reply.from);
    if (attacker)
      cheapestAttacker = Math.min(
        cheapestAttacker,
        getSoloPieceValue(attacker.type) * 100,
      );
  });
  if (cheapestAttacker === 900) cheapestAttacker = 100;
  return Math.max(
    0,
    movedValue - capturedValue - Math.max(0, cheapestAttacker - 100),
  );
}

function classifySoloCandidateRisk(move, beforeFen, result, topBases) {
  var uciBase = getSoloMoveBaseUci(move);
  if (!uciBase || topBases[uciBase]) return null;
  if (move.san && move.san.indexOf("#") !== -1) return null;
  if (move.promotion) return null;

  var before = new Chess();
  if (!before.load(beforeFen)) return null;
  var beforePiece = before.get(move.from);
  if (!beforePiece) return null;
  var moverColor = beforePiece.color;
  var beforeMaterial = getSoloMaterialScoreForColor(before, moverColor);
  var capturedValue = move.captured
    ? getSoloPieceValue(move.captured) * 100
    : 0;
  var movedValue = getSoloPieceValue(beforePiece.type) * 100;

  var after = new Chess();
  if (!after.load(beforeFen)) return null;
  var played = after.move({
    from: move.from,
    to: move.to,
    promotion: move.promotion || "q",
  });
  if (!played) return null;
  if (after.in_checkmate && after.in_checkmate()) return null;

  var afterMaterial = getSoloMaterialScoreForColor(after, moverColor);
  var materialLoss = beforeMaterial - afterMaterial;
  var hangingLoss = getSoloHangingLossAfterMove(
    after,
    played,
    beforePiece,
    capturedValue,
  );
  var badCaptureLoss =
    move.captured && movedValue >= capturedValue + 400
      ? movedValue - capturedValue
      : 0;
  var risk = Math.max(materialLoss, hangingLoss, badCaptureLoss);
  var bestSideEval = getSoloSideEvalCp(result);

  if (risk >= 650 || (movedValue >= 900 && hangingLoss >= 500)) {
    return {
      category: "blunder",
      risk: risk,
      reason: "Agir materyal kaybi riski",
    };
  }
  if (
    risk >= 320 ||
    (bestSideEval !== null &&
      bestSideEval >= 180 &&
      !move.captured &&
      movedValue >= 500 &&
      hangingLoss >= 250)
  ) {
    return {
      category: "mistake",
      risk: risk,
      reason: "Avantaji veya materyali ciddi azaltir",
    };
  }
  if (
    risk >= 90 ||
    (bestSideEval !== null && bestSideEval >= 120) ||
    !move.captured
  ) {
    return {
      category: "inaccuracy",
      risk: Math.max(risk, 40),
      reason: "Motorun ana hattindan uzaklasir",
    };
  }
  return null;
}

function buildSoloMistakeCandidates(fen, result) {
  var set = emptySoloMistakeSet("Riskli aday taraniyor");
  if (!fen) return emptySoloMistakeSet("Bu taraf icin konum yok");
  try {
    var probe = new Chess();
    if (!probe.load(fen)) return emptySoloMistakeSet("Konum okunamadi");
    var legalMoves = probe.moves({ verbose: true }) || [];
    if (!legalMoves.length) return emptySoloMistakeSet("Yasal hamle yok");
    var topBases = getSoloTopMoveBases(result);
    var buckets = { inaccuracy: [], mistake: [], blunder: [] };
    legalMoves.forEach(function (move) {
      var riskInfo = classifySoloCandidateRisk(move, fen, result, topBases);
      if (!riskInfo || !buckets[riskInfo.category]) return;
      buckets[riskInfo.category].push({
        fen: fen,
        uci: getSoloMoveUci(move),
        san: move.san,
        note:
          riskInfo.reason +
          " (~" +
          (riskInfo.risk / 100).toFixed(1) +
          " piyon)",
        found: true,
        risk: riskInfo.risk,
      });
    });
    Object.keys(buckets).forEach(function (category) {
      buckets[category].sort(function (a, b) {
        return b.risk - a.risk;
      });
      set[category] =
        buckets[category][0] ||
        emptySoloMistakeCandidate("Bu seviyede riskli hamle yok");
    });
    return set;
  } catch (e) {
    return emptySoloMistakeSet("Hata adaylari hesaplanamadi");
  }
}

function setSoloMistakeCard(side, category, data) {
  var sideTitle = side === "black" ? "Black" : "White";
  var categoryTitle = category.charAt(0).toUpperCase() + category.slice(1);
  var moveEl = document.getElementById(
    "soloMistake" + sideTitle + categoryTitle,
  );
  var noteEl = document.getElementById(
    "soloMistake" + sideTitle + categoryTitle + "Note",
  );
  var card = moveEl ? moveEl.closest(".solo-mistake-card") : null;
  var candidate = data || emptySoloMistakeCandidate();
  if (moveEl) moveEl.innerText = formatSoloMoveText(candidate.san || "-");
  if (noteEl)
    noteEl.innerText = candidate.note || "Bu seviyede riskli hamle yok";
  if (card) {
    card.disabled = !candidate.found || !candidate.uci;
    card.classList.toggle("found", !!(candidate.found && candidate.uci));
  }
}

function syncSoloMistakePanel() {
  var statusEl = document.getElementById("soloMistakePanelStatus");
  if (statusEl)
    statusEl.innerText = soloTrainingState.mistakes.stateText || "Bekleniyor";
  ["white", "black"].forEach(function (side) {
    ["inaccuracy", "mistake", "blunder"].forEach(function (category) {
      var sideSet = soloTrainingState.mistakes[side] || {};
      setSoloMistakeCard(side, category, sideSet[category]);
    });
  });
}

function getSoloSideEvalCp(result) {
  if (!result) return null;
  if (result.mate !== null && result.mate !== undefined) {
    return result.mate > 0 ? 10000 : -10000;
  }
  if (result.cp !== null && result.cp !== undefined) return result.cp;
  return null;
}

function detectSoloBrilliantMove(color, fen, result) {
  var bestUci =
    result &&
    (result.bestMove ||
      (result.topLines && result.topLines[0] && result.topLines[0].uci));
  if (!fen || !bestUci || bestUci.length < 4)
    return emptySoloBrilliant("Motor aday bulamadi");
  try {
    var probe = new Chess();
    if (!probe.load(fen))
      return emptySoloBrilliant("Konum bu taraf icin uygun degil");
    var from = bestUci.slice(0, 2);
    var to = bestUci.slice(2, 4);
    var beforePiece = probe.get(from);
    var move = probe.move({
      from: from,
      to: to,
      promotion: bestUci.length > 4 ? bestUci.slice(4, 5) : "q",
    });
    if (!move || !beforePiece) return emptySoloBrilliant("Hamle dogrulanamadi");

    var sideEval = getSoloSideEvalCp(result);
    var movedValue = getSoloPieceValue(beforePiece.type);
    var capturedValue = move.captured ? getSoloPieceValue(move.captured) : 0;
    var isMateShot =
      result.mate !== null &&
      result.mate !== undefined &&
      result.mate > 0 &&
      Math.abs(result.mate) <= 5;
    var isMajorTactic =
      sideEval !== null &&
      sideEval >= 180 &&
      (move.san.indexOf("+") !== -1 ||
        move.san.indexOf("#") !== -1 ||
        !!move.promotion ||
        (move.captured && movedValue >= capturedValue + 2));
    var isQuietBrilliant =
      sideEval !== null &&
      sideEval >= 260 &&
      !move.captured &&
      movedValue >= 3 &&
      move.san.indexOf("+") !== -1;
    if (!isMateShot && !isMajorTactic && !isQuietBrilliant) {
      return emptySoloBrilliant("Brilliant seviyesinde aday yok");
    }
    var reason = isMateShot
      ? "Kisa mat fikri bulundu"
      : move.captured && movedValue >= capturedValue + 2
        ? "Motor avantajli feda fikri buldu"
        : "Yuksek etkili taktik hamle";
    return {
      fen: fen,
      uci: bestUci,
      san: formatUciMoveForFen(fen, bestUci),
      note: reason + " (" + formatTrainingEval(result) + ")",
      found: true,
    };
  } catch (e) {
    return emptySoloBrilliant("Brilliant taramasi tamamlanamadi");
  }
}

function clearSoloAutoTimer() {
  if (soloTrainingAutoTimer) clearTimeout(soloTrainingAutoTimer);
  soloTrainingAutoTimer = null;
}

function isSoloAutoSideActiveForTurn() {
  var side = soloTrainingState.autoSide || "none";
  if (side === "none" || isSoloGameOver()) return false;
  var turnSide = getSoloCurrentSide();
  return side === "both" || side === turnSide;
}

function syncSoloAutoControls() {
  var side = soloTrainingState.autoSide || "none";
  ["none", "white", "black", "both"].forEach(function (key) {
    var el = document.getElementById(
      "soloAutoSide" + key.charAt(0).toUpperCase() + key.slice(1),
    );
    if (el) el.classList.toggle("active", side === key);
  });
  var delayInput = document.getElementById("soloAutoDelayInput");
  if (
    delayInput &&
    Number(delayInput.value) !== soloTrainingState.autoDelaySec
  ) {
    delayInput.value = soloTrainingState.autoDelaySec;
  }
  var enBtn = document.getElementById("soloMoveLangEn");
  var trBtn = document.getElementById("soloMoveLangTr");
  if (enBtn)
    enBtn.classList.toggle("active", soloTrainingState.moveLanguage === "en");
  if (trBtn)
    trBtn.classList.toggle("active", soloTrainingState.moveLanguage === "tr");
}

function setSoloAutoStatus(text) {
  var el = document.getElementById("soloAutoStatus");
  if (el) el.innerText = text;
}

async function playSoloTrainingBestMoveInternal(color, expectedFen) {
  if (!isSoloTrainingAllowed() || isSoloGameOver()) return false;
  var currentSide = getSoloCurrentSide();
  if (color !== currentSide) return false;
  if (expectedFen && soloTrainingChess.fen() !== expectedFen) return false;
  var best = soloTrainingState.best[color];
  if (!best || !best.uci || !best.fen) return false;
  var beforeFen = soloTrainingChess.fen();
  soloTrainingRedoStack = [];
  var move = soloTrainingChess.move({
    from: best.uci.slice(0, 2),
    to: best.uci.slice(2, 4),
    promotion: best.uci.length > 4 ? best.uci.slice(4, 5) : "q",
  });
  if (!move) return false;
  recordSoloMoveClassification(
    move,
    color,
    beforeFen,
    best.uci === best.uci.slice(0, 4) + (move.promotion || "") ? "best" : null,
  );
  soloTrainingSelectedSquare = null;
  soloTrainingValidMoves = [];
  clearSoloPreviewMarks();
  drawSoloTrainingBoard();
  if (window.playChessMoveSound)
    window.playChessMoveSound(move, soloTrainingChess);
  else if (window.playGameSound) window.playGameSound("move");
  syncSoloTrainingUI();
  await refreshSoloTrainingStockfish(true);
  return true;
}

function scheduleSoloAutoMove() {
  clearSoloAutoTimer();
  syncSoloAutoControls();
  if (window.currentViewId !== "view-solo-training") return;
  if (soloTrainingState.sync.live) {
    setSoloAutoStatus(
      "Canli mac aktarimi aktifken otomatik oynatma beklemede.",
    );
    return;
  }
  if ((soloTrainingState.autoSide || "none") === "none") {
    setSoloAutoStatus("Otomatik oynatma kapali.");
    return;
  }
  if (!isSoloAutoSideActiveForTurn()) {
    setSoloAutoStatus("Secilen tarafin sirasi bekleniyor.");
    return;
  }
  var turnSide = getSoloCurrentSide();
  var best = soloTrainingState.best[turnSide];
  var waitSec = Math.max(
    1,
    Math.min(60, parseInt(soloTrainingState.autoDelaySec, 10) || 5),
  );
  var fenAtSchedule = soloTrainingChess.fen();
  var sideLabel = getSoloColorName(turnSide);
  if (!best || !best.uci) {
    setSoloAutoStatus(sideLabel + " icin motor hamlesi bekleniyor.");
    return;
  }
  setSoloAutoStatus(
    sideLabel +
      " sirasi: " +
      waitSec +
      " sn hamle gelmezse " +
      formatSoloMoveText(best.san) +
      " oynanacak.",
  );
  soloTrainingAutoTimer = setTimeout(async function () {
    soloTrainingAutoTimer = null;
    var ok = await playSoloTrainingBestMoveInternal(turnSide, fenAtSchedule);
    if (!ok && window.currentViewId === "view-solo-training") {
      scheduleSoloAutoMove();
    }
  }, waitSec * 1000);
}

function syncSoloTrainingUI() {
  var turnEl = document.getElementById("soloTrainingTurn");
  var positionEl = document.getElementById("soloTrainingPosition");
  var engineEl = document.getElementById("soloTrainingEngineState");
  var evalEl = document.getElementById("soloTrainingEval");
  var statusEl = document.getElementById("soloTrainingStatus");
  var whiteMoveEl = document.getElementById("soloBestWhiteMove");
  var blackMoveEl = document.getElementById("soloBestBlackMove");
  var whiteEvalEl = document.getElementById("soloBestWhiteEval");
  var blackEvalEl = document.getElementById("soloBestBlackEval");
  var whiteCard = document.getElementById("soloBestWhiteCard");
  var blackCard = document.getElementById("soloBestBlackCard");
  var moveCountEl = document.getElementById("soloTrainingMoveCount");
  var whiteTag = document.getElementById("soloTrainingWhiteTag");
  var blackTag = document.getElementById("soloTrainingBlackTag");
  var brilliantStateEl = document.getElementById("soloBrilliantState");
  var brilliantWhiteMoveEl = document.getElementById("soloBrilliantWhiteMove");
  var brilliantBlackMoveEl = document.getElementById("soloBrilliantBlackMove");
  var brilliantWhiteNoteEl = document.getElementById("soloBrilliantWhiteNote");
  var brilliantBlackNoteEl = document.getElementById("soloBrilliantBlackNote");
  var brilliantWhiteCard = document.getElementById("soloBrilliantWhiteCard");
  var brilliantBlackCard = document.getElementById("soloBrilliantBlackCard");
  var undoBtn = document.getElementById("soloUndoBtn");
  var redoBtn = document.getElementById("soloRedoBtn");
  var classificationToggle = document.getElementById(
    "soloClassificationToggle",
  );
  var bestPanelToggle = document.getElementById("soloBestPanelToggle");
  var bestPanelCard = document.getElementById("soloBestPanelCard");
  var voiceToggle = document.getElementById("soloVoiceToggle");
  var voiceStatusEl = document.getElementById("soloVoiceStatus");
  var voiceDeviceSelect = document.getElementById("soloVoiceDeviceSelect");
  var voiceTurnEl = document.getElementById("soloVoiceTurnBadge");
  var voiceEngineEl = document.getElementById("soloVoiceEngineBadge");
  var voiceLastHeardEl = document.getElementById("soloVoiceLastHeard");
  var cloudSttStatusEl = document.getElementById("soloCloudSttStatus");
  var syncStateEl = document.getElementById("soloSyncStateBadge");
  var syncSourceEl = document.getElementById("soloSyncSource");
  var syncMoveCountEl = document.getElementById("soloSyncMoveCount");
  var syncStatusEl = document.getElementById("soloSyncStatus");

  var turnColor = soloTrainingChess.turn() === "w" ? "white" : "black";
  if (turnEl) turnEl.innerText = getSoloColorName(turnColor);
  if (positionEl) positionEl.innerText = getSoloGameStatusText();
  if (engineEl)
    engineEl.innerText = soloTrainingState.engineState || "Bekleniyor";
  if (evalEl) evalEl.innerText = soloTrainingState.evalText || "--";
  if (statusEl)
    statusEl.innerText =
      soloTrainingState.statusText ||
      "Hamle oynadiginda oneriler otomatik yenilenir.";
  if (whiteMoveEl)
    whiteMoveEl.innerText = formatSoloMoveText(
      soloTrainingState.best.white.san,
    );
  if (blackMoveEl)
    blackMoveEl.innerText = formatSoloMoveText(
      soloTrainingState.best.black.san,
    );
  if (whiteEvalEl)
    whiteEvalEl.innerText =
      soloTrainingState.best.white.evalText +
      " - " +
      soloTrainingState.best.white.statusText;
  if (blackEvalEl)
    blackEvalEl.innerText =
      soloTrainingState.best.black.evalText +
      " - " +
      soloTrainingState.best.black.statusText;
  if (whiteCard) whiteCard.disabled = !soloTrainingState.best.white.uci;
  if (blackCard) blackCard.disabled = !soloTrainingState.best.black.uci;
  if (moveCountEl)
    moveCountEl.innerText = String(soloTrainingChess.history().length);
  if (whiteTag)
    whiteTag.classList.toggle(
      "active",
      turnColor === "white" && !isSoloGameOver(),
    );
  if (blackTag)
    blackTag.classList.toggle(
      "active",
      turnColor === "black" && !isSoloGameOver(),
    );
  if (brilliantStateEl)
    brilliantStateEl.innerText =
      soloTrainingState.brilliant.stateText || "Bekleniyor";
  if (brilliantWhiteMoveEl)
    brilliantWhiteMoveEl.innerText = formatSoloMoveText(
      soloTrainingState.brilliant.white.san,
    );
  if (brilliantBlackMoveEl)
    brilliantBlackMoveEl.innerText = formatSoloMoveText(
      soloTrainingState.brilliant.black.san,
    );
  if (brilliantWhiteNoteEl)
    brilliantWhiteNoteEl.innerText =
      soloTrainingState.brilliant.white.note || "Aday aranıyor";
  if (brilliantBlackNoteEl)
    brilliantBlackNoteEl.innerText =
      soloTrainingState.brilliant.black.note || "Aday aranıyor";
  if (brilliantWhiteCard) {
    brilliantWhiteCard.disabled = !soloTrainingState.brilliant.white.found;
    brilliantWhiteCard.classList.toggle(
      "found",
      !!soloTrainingState.brilliant.white.found,
    );
  }
  if (brilliantBlackCard) {
    brilliantBlackCard.disabled = !soloTrainingState.brilliant.black.found;
    brilliantBlackCard.classList.toggle(
      "found",
      !!soloTrainingState.brilliant.black.found,
    );
  }
  if (undoBtn) undoBtn.disabled = soloTrainingChess.history().length === 0;
  if (redoBtn) redoBtn.disabled = soloTrainingRedoStack.length === 0;
  if (classificationToggle) {
    classificationToggle.classList.toggle(
      "active",
      !!soloTrainingState.showClassifications,
    );
    classificationToggle.innerHTML =
      '<i class="fas fa-icons"></i> ' +
      (soloTrainingState.showClassifications ? "Açık" : "Kapalı");
  }

  if (bestPanelToggle) {
    bestPanelToggle.classList.toggle(
      "active",
      !!soloTrainingState.showBestPanel,
    );
    bestPanelToggle.innerHTML =
      '<i class="fas ' +
      (soloTrainingState.showBestPanel ? "fa-eye" : "fa-eye-slash") +
      '"></i> ' +
      (soloTrainingState.showBestPanel ? "Acik" : "Kapali");
  }
  if (bestPanelCard)
    bestPanelCard.style.display = soloTrainingState.showBestPanel ? "" : "none";
  if (voiceToggle) {
    voiceToggle.classList.toggle("active", !!soloTrainingState.voiceEnabled);
    voiceToggle.innerHTML =
      '<i class="fas ' +
      (soloTrainingState.voiceEnabled
        ? "fa-microphone-lines"
        : "fa-microphone") +
      '"></i> ' +
      (soloTrainingState.voiceEnabled ? "Acik" : "Kapali");
  }
  if (voiceStatusEl)
    voiceStatusEl.innerText =
      soloTrainingState.voiceStatusText || "Sesli hamle kapali.";
  if (
    voiceDeviceSelect &&
    voiceDeviceSelect.value !== (soloTrainingState.voiceSettings.deviceId || "")
  )
    voiceDeviceSelect.value = soloTrainingState.voiceSettings.deviceId || "";
  if (voiceTurnEl) voiceTurnEl.innerText = getSoloColorName(turnColor);
  if (voiceEngineEl) {
    voiceEngineEl.innerText =
      soloTrainingState.voiceEngineText || "Hazir degil";
    voiceEngineEl.classList.toggle("active", !!soloTrainingState.voiceEnabled);
  }
  if (voiceLastHeardEl)
    voiceLastHeardEl.innerText = soloTrainingState.lastHeardText || "-";
  if (cloudSttStatusEl) {
    cloudSttStatusEl.innerText =
      soloTrainingState.cloudSttStatusText || "Kontrol ediliyor";
    cloudSttStatusEl.classList.toggle(
      "ready",
      !!soloTrainingState.cloudSttConfigured,
    );
    cloudSttStatusEl.classList.toggle("active", !!soloVoiceCloudBusy);
  }
  if (syncStateEl) {
    syncStateEl.innerText = soloTrainingState.sync.stateText || "Bekleniyor";
    syncStateEl.classList.toggle("live", !!soloTrainingState.sync.live);
  }
  if (syncSourceEl)
    syncSourceEl.innerText =
      soloTrainingState.sync.sourceLabel || "Bagli degil";
  if (syncMoveCountEl)
    syncMoveCountEl.innerText = String(
      soloTrainingState.sync.live
        ? soloTrainingChess.history().length
        : soloTrainingState.sync.importedPly || 0,
    );
  if (syncStatusEl)
    syncStatusEl.innerText =
      soloTrainingState.sync.statusText ||
      "Chrome eklentisini bu sekmede hedef yap.";

  syncSoloAutoControls();
  syncSoloMistakePanel();
  renderSoloTrainingMoveHistory();
  announceSoloSyncTargetStatus("ui-sync");
}

function renderSoloTrainingMoveHistory() {
  var listEl = document.getElementById("soloTrainingMoves");
  if (!listEl) return;
  var history = soloTrainingChess.history({ verbose: true }) || [];
  if (!history.length) {
    listEl.innerHTML =
      '<div class="live-move-empty">Ilk hamleni oynadiginda solo analiz defteri burada baslar.</div>';
    return;
  }
  var rows = buildLiveMoveHistoryRows(history);
  listEl.innerHTML = rows
    .map(function (row) {
      return (
        '<div class="live-move-row' +
        (row.isLatest ? " is-latest" : "") +
        '">' +
        '<span class="live-move-number">' +
        row.number +
        ".</span>" +
        '<span class="live-move-san">' +
        window.escapeHtml(row.white ? formatSoloMoveText(row.white) : "...") +
        "</span>" +
        '<span class="live-move-san' +
        (row.black ? "" : " empty") +
        '">' +
        window.escapeHtml(row.black ? formatSoloMoveText(row.black) : "...") +
        "</span>" +
        "</div>"
      );
    })
    .join("");
  listEl.scrollTop = listEl.scrollHeight;
}

function renderSoloTrainingBoardInto(boardEl) {
  if (!boardEl) return;
  boardEl.innerHTML = "";
  var boardArray = soloTrainingChess.board();
  var activeColor = soloTrainingChess.turn();
  var badgeBySquare = {};
  if (soloTrainingState.showClassifications) {
    soloTrainingMoveClassifications
      .slice(0, soloTrainingChess.history().length)
      .forEach(function (item) {
        if (item && item.to) badgeBySquare[item.to] = item;
      });
  }

  for (var r = 0; r < 8; r++) {
    for (var c = 0; c < 8; c++) {
      var row = soloTrainingBoardFlipped ? 7 - r : r;
      var col = soloTrainingBoardFlipped ? 7 - c : c;
      var sq = boardArray[row][col];
      var squareName = String.fromCharCode(97 + col) + (8 - row);
      var div = document.createElement("div");
      div.className = "square " + ((r + c) % 2 === 0 ? "white" : "black");
      div.dataset.square = squareName;
      const history = soloTrainingChess.history({ verbose: true });
      const lastMove = history.length ? history[history.length - 1] : null;
      if (
        lastMove &&
        (squareName === lastMove.from || squareName === lastMove.to)
      )
        div.classList.add("last-move");
      if (soloTrainingSelectedSquare === squareName)
        div.classList.add("selected");
      if (soloTrainingValidMoves.indexOf(squareName) !== -1)
        div.classList.add("highlight");

      if (c === 0) {
        var rankEl = document.createElement("span");
        rankEl.className = "coord coord-rank";
        rankEl.innerText = 8 - row;
        div.appendChild(rankEl);
      }
      if (r === 7) {
        var fileEl = document.createElement("span");
        fileEl.className = "coord coord-file";
        fileEl.innerText = String.fromCharCode(97 + col);
        div.appendChild(fileEl);
      }

      div.onclick = (function (square) {
        return function () {
          handleSoloTrainingSquareClick(square);
        };
      })(squareName);

      if (sq) {
        var piece = document.createElement("div");
        piece.className =
          "piece " +
          (sq.color === activeColor && !isSoloGameOver() ? "active" : "locked");
        if (window.applyPieceSkin)
          window.applyPieceSkin(piece, sq.color, sq.type);
        else
          piece.style.backgroundImage =
            "url('https://images.chesscomfiles.com/chess-themes/pieces/neo/150/" +
            sq.color +
            sq.type +
            ".png')";
        div.appendChild(piece);
        var badgeInfo = badgeBySquare[squareName];
        if (badgeInfo) {
          var badge = document.createElement("span");
          badge.className = "solo-classification-badge " + badgeInfo.category;
          badge.innerHTML =
            '<i class="fas ' +
            getSoloMoveCategoryIconClass(badgeInfo.category) +
            '"></i>';
          badge.title =
            getSoloMoveCategoryLabel(badgeInfo.category) +
            " - " +
            (badgeInfo.san || "");
          div.appendChild(badge);
        }
      }
      boardEl.appendChild(div);
    }
  }
}

function drawSoloTrainingBoard() {
  renderSoloTrainingBoardInto(document.getElementById("soloTrainingBoard"));
}
window.drawSoloTrainingBoard = drawSoloTrainingBoard;

function resetSoloEngineState(message) {
  soloTrainingState.fen = null;
  soloTrainingState.requestToken += 1;
  soloTrainingState.brilliantRequestToken += 1;
  soloTrainingState.engineState = message || "Bekleniyor";
  soloTrainingState.statusText =
    "Hamle oynadiginda oneriler otomatik yenilenir.";
  soloTrainingState.evalText = "--";
  soloTrainingState.best.white = emptySoloBest("Motor bekleniyor");
  soloTrainingState.best.black = emptySoloBest("Motor bekleniyor");
  soloTrainingState.mistakes.stateText = message || "Bekleniyor";
  soloTrainingState.mistakes.white = emptySoloMistakeSet("Motor bekleniyor");
  soloTrainingState.mistakes.black = emptySoloMistakeSet("Motor bekleniyor");
  soloTrainingState.brilliant.stateText = "Bekleniyor";
  soloTrainingState.brilliant.white = emptySoloBrilliant("Aday aranıyor");
  soloTrainingState.brilliant.black = emptySoloBrilliant("Aday aranıyor");
}

async function refreshSoloBrilliantEngine(baseFen, whiteFen, blackFen) {
  if (
    !isSoloTrainingAllowed() ||
    !window.queueStockfishEval ||
    !window.initStockfish ||
    isSoloGameOver()
  )
    return;
  var token = ++soloTrainingState.brilliantRequestToken;
  soloTrainingState.brilliant.stateText = "Taranıyor";
  soloTrainingState.brilliant.white = emptySoloBrilliant(
    "Beyaz icin taktik taraniyor",
  );
  soloTrainingState.brilliant.black = emptySoloBrilliant(
    "Siyah icin taktik taraniyor",
  );
  syncSoloTrainingUI();
  try {
    await window.initStockfish();
    var whiteTask = whiteFen
      ? window.queueStockfishEval(whiteFen, {
          depth: Math.max(14, SOLO_TRAINING_ENGINE_DEPTH + 1),
          mode: "solo_brilliant_white",
          requestId: Date.now() + 11,
        })
      : Promise.resolve(null);
    var blackTask = blackFen
      ? window.queueStockfishEval(blackFen, {
          depth: Math.max(14, SOLO_TRAINING_ENGINE_DEPTH + 1),
          mode: "solo_brilliant_black",
          requestId: Date.now() + 12,
        })
      : Promise.resolve(null);
    var results = await Promise.all([whiteTask, blackTask]);
    if (
      token !== soloTrainingState.brilliantRequestToken ||
      baseFen !== soloTrainingChess.fen()
    )
      return;
    soloTrainingState.brilliant.white = whiteFen
      ? detectSoloBrilliantMove("white", whiteFen, results[0])
      : emptySoloBrilliant("Beyaz icin uygun degil");
    soloTrainingState.brilliant.black = blackFen
      ? detectSoloBrilliantMove("black", blackFen, results[1])
      : emptySoloBrilliant("Siyah icin uygun degil");
    soloTrainingState.brilliant.stateText =
      soloTrainingState.brilliant.white.found ||
      soloTrainingState.brilliant.black.found
        ? "Bulundu"
        : "Yok";
    syncSoloTrainingUI();
  } catch (e) {
    if (token !== soloTrainingState.brilliantRequestToken) return;
    soloTrainingState.brilliant.stateText = "Hata";
    soloTrainingState.brilliant.white = emptySoloBrilliant("Tarama hatasi");
    soloTrainingState.brilliant.black = emptySoloBrilliant("Tarama hatasi");
    syncSoloTrainingUI();
  }
}

async function refreshSoloTrainingStockfish(force) {
  if (!isSoloTrainingAllowed()) {
    syncSoloTrainingAccess();
    return;
  }
  if (!window.queueStockfishEval || !window.initStockfish) {
    soloTrainingState.engineState = "Hazir degil";
    soloTrainingState.statusText = "Stockfish hatti yuklenmedi.";
    syncSoloTrainingUI();
    return;
  }

  var baseFen = soloTrainingChess.fen();
  if (
    !force &&
    soloTrainingState.fen === baseFen &&
    (soloTrainingState.best.white.uci || soloTrainingState.best.black.uci)
  ) {
    syncSoloTrainingUI();
    scheduleSoloAutoMove();
    return;
  }

  if (isSoloGameOver()) {
    clearSoloAutoTimer();
    resetSoloEngineState("Oyun bitti");
    soloTrainingState.statusText =
      "Konum tamamlandi; sifirlayarak yeni antrenmana baslayabilirsin.";
    syncSoloTrainingUI();
    setSoloAutoStatus("Oyun bitti.");
    return;
  }

  var whiteFen = getSoloFenForSide(baseFen, "white");
  var blackFen = getSoloFenForSide(baseFen, "black");
  var token = ++soloTrainingState.requestToken;
  soloTrainingState.engineState = "Hesaplaniyor";
  soloTrainingState.statusText =
    "Stockfish beyaz ve siyah icin en iyi devamlari ariyor...";
  soloTrainingState.evalText = "--";
  soloTrainingState.best.white = emptySoloBest("Hesaplaniyor");
  soloTrainingState.best.black = emptySoloBest("Hesaplaniyor");
  soloTrainingState.mistakes.stateText = "Taranıyor";
  soloTrainingState.mistakes.white = emptySoloMistakeSet(
    "Riskli hamleler taraniyor",
  );
  soloTrainingState.mistakes.black = emptySoloMistakeSet(
    "Riskli hamleler taraniyor",
  );
  syncSoloTrainingUI();

  try {
    await window.initStockfish();
    var whiteTask = whiteFen
      ? window.queueStockfishEval(whiteFen, {
          depth: SOLO_TRAINING_ENGINE_DEPTH,
          mode: "solo_training_white",
          requestId: Date.now() + 1,
        })
      : Promise.resolve(null);
    var blackTask = blackFen
      ? window.queueStockfishEval(blackFen, {
          depth: SOLO_TRAINING_ENGINE_DEPTH,
          mode: "solo_training_black",
          requestId: Date.now() + 2,
        })
      : Promise.resolve(null);
    var results = await Promise.all([whiteTask, blackTask]);
    if (token !== soloTrainingState.requestToken) return;

    soloTrainingState.fen = baseFen;
    soloTrainingState.best.white = whiteFen
      ? normalizeSoloBest(whiteFen, results[0])
      : emptySoloBest("Bu konum beyaz icin uygun degil");
    soloTrainingState.best.black = blackFen
      ? normalizeSoloBest(blackFen, results[1])
      : emptySoloBest("Bu konum siyah icin uygun degil");
    soloTrainingState.mistakes.white = whiteFen
      ? buildSoloMistakeCandidates(whiteFen, results[0])
      : emptySoloMistakeSet("Beyaz icin uygun degil");
    soloTrainingState.mistakes.black = blackFen
      ? buildSoloMistakeCandidates(blackFen, results[1])
      : emptySoloMistakeSet("Siyah icin uygun degil");
    soloTrainingState.mistakes.stateText = "Canli";
    var activeBest =
      soloTrainingChess.turn() === "w"
        ? soloTrainingState.best.white
        : soloTrainingState.best.black;
    soloTrainingState.evalText = activeBest.evalText || "--";
    soloTrainingState.engineState = "Hazir";
    soloTrainingState.statusText =
      "Oneriye tiklayinca hamle tahtada kisa animasyonla isaretlenir.";
    syncSoloTrainingUI();
    scheduleSoloAutoMove();
    refreshSoloBrilliantEngine(baseFen, whiteFen, blackFen);
  } catch (e) {
    if (token !== soloTrainingState.requestToken) return;
    clearSoloAutoTimer();
    soloTrainingState.engineState = "Hata";
    soloTrainingState.statusText =
      "Motor sorgusu tamamlanamadi. Yenile butonunu deneyebilirsin.";
    soloTrainingState.mistakes.stateText = "Hata";
    soloTrainingState.mistakes.white = emptySoloMistakeSet("Motor hatasi");
    soloTrainingState.mistakes.black = emptySoloMistakeSet("Motor hatasi");
    syncSoloTrainingUI();
    setSoloAutoStatus("Motor hatasi nedeniyle otomatik hamle bekletildi.");
  }
}
window.refreshSoloTrainingStockfish = function (force) {
  return refreshSoloTrainingStockfish(force === true);
};

function clearSoloPreviewMarks() {
  var board = document.getElementById("soloTrainingBoard");
  if (!board) return;
  board
    .querySelectorAll(".solo-preview-from, .solo-preview-to")
    .forEach(function (el) {
      el.classList.remove("solo-preview-from", "solo-preview-to");
    });
}

function showSoloTrainingMovePreview(uci) {
  if (!uci || uci.length < 4) return false;
  if (soloTrainingPreviewTimer) clearTimeout(soloTrainingPreviewTimer);
  clearSoloPreviewMarks();
  var board = document.getElementById("soloTrainingBoard");
  if (!board) return false;
  var fromEl = board.querySelector('[data-square="' + uci.slice(0, 2) + '"]');
  var toEl = board.querySelector('[data-square="' + uci.slice(2, 4) + '"]');
  if (!fromEl || !toEl) return false;
  fromEl.classList.add("solo-preview-from");
  toEl.classList.add("solo-preview-to");
  if (window.playGameSound) window.playGameSound("notify");
  soloTrainingPreviewTimer = setTimeout(clearSoloPreviewMarks, 1100);
  return true;
}

window.previewSoloTrainingMove = function (color) {
  var key = color === "black" ? "black" : "white";
  var best = soloTrainingState.best[key];
  if (!best || !best.uci) {
    if (window.showToast)
      window.showToast("Bu taraf icin gosterilecek hamle yok.", "info");
    return;
  }
  if (!showSoloTrainingMovePreview(best.uci) && window.showToast) {
    window.showToast("Hamle tahtada gosterilemedi.", "error");
  }
};

window.previewSoloMistakeMove = function (color, category) {
  var side = color === "black" ? "black" : "white";
  var key =
    ["inaccuracy", "mistake", "blunder"].indexOf(category) !== -1
      ? category
      : "inaccuracy";
  var candidate =
    soloTrainingState.mistakes[side] && soloTrainingState.mistakes[side][key];
  if (!candidate || !candidate.found || !candidate.uci) {
    if (window.showToast)
      window.showToast("Bu seviyede gosterilecek riskli hamle yok.", "info");
    return;
  }
  if (!showSoloTrainingMovePreview(candidate.uci) && window.showToast) {
    window.showToast("Riskli hamle tahtada gosterilemedi.", "error");
  }
};

window.previewSoloBrilliantMove = function (color) {
  var key = color === "black" ? "black" : "white";
  var brilliant = soloTrainingState.brilliant[key];
  if (!brilliant || !brilliant.found || !brilliant.uci) {
    if (window.showToast)
      window.showToast("Bu taraf icin brilliant aday yok.", "info");
    return;
  }
  if (!showSoloTrainingMovePreview(brilliant.uci) && window.showToast) {
    window.showToast("Brilliant hamle tahtada gosterilemedi.", "error");
  }
};

window.setSoloTrainingAutoSide = function (side) {
  var normalized =
    ["none", "white", "black", "both"].indexOf(side) !== -1 ? side : "none";
  soloTrainingState.autoSide = normalized;
  syncSoloTrainingUI();
  scheduleSoloAutoMove();
};

window.setSoloTrainingAutoDelay = function (value) {
  var delay = parseInt(value, 10);
  if (!Number.isFinite(delay)) delay = 5;
  soloTrainingState.autoDelaySec = Math.max(1, Math.min(60, delay));
  syncSoloTrainingUI();
  scheduleSoloAutoMove();
};

window.setSoloTrainingMoveLanguage = function (lang) {
  soloTrainingState.moveLanguage = lang === "tr" ? "tr" : "en";
  syncSoloTrainingUI();
  scheduleSoloAutoMove();
};

window.toggleSoloMoveClassifications = function () {
  soloTrainingState.showClassifications =
    !soloTrainingState.showClassifications;
  drawSoloTrainingBoard();
  syncSoloTrainingUI();
};

window.toggleSoloBestPanel = function () {
  soloTrainingState.showBestPanel = !soloTrainingState.showBestPanel;
  syncSoloTrainingUI();
};

function setSoloVoiceStatus(text) {
  soloTrainingState.voiceStatusText = text || "Sesli hamle kapali.";
  var el = document.getElementById("soloVoiceStatus");
  if (el) el.innerText = soloTrainingState.voiceStatusText;
}

function setSoloVoiceHint(text) {
  var el = document.getElementById("soloVoiceDeviceHint");
  if (el) el.innerText = text || "";
}

function setSoloVoiceEngineText(text) {
  soloTrainingState.voiceEngineText = text || "Hazir degil";
  var el = document.getElementById("soloVoiceEngineBadge");
  if (el) {
    el.innerText = soloTrainingState.voiceEngineText;
    el.classList.toggle("active", !!soloTrainingState.voiceEnabled);
  }
}

function setSoloVoiceLastHeard(text) {
  soloTrainingState.lastHeardText = text || "-";
  var el = document.getElementById("soloVoiceLastHeard");
  if (el) el.innerText = soloTrainingState.lastHeardText;
}

function getSoloVoiceReadyPrompt() {
  return (
    getSoloColorName(getSoloCurrentSide()) +
    " sirasi. Ornek: e iki e dort, fil c dort, piyon e dort, geri al."
  );
}

function setSoloSyncState(nextState) {
  soloTrainingState.sync = Object.assign(
    {},
    soloTrainingState.sync,
    nextState || {},
  );
}

function resetSoloSyncState() {
  setSoloSyncState({
    live: false,
    sourceLabel: "Bagli degil",
    statusText: "Chrome eklentisini bu sekmede hedef yap.",
    stateText: "Bekleniyor",
    importedPly: 0,
    lastGameKey: "",
    lastSignature: "",
    lastRawMoves: [],
    lastEventAt: 0,
    applying: false,
    pendingSnapshot: null,
  });
}

let _soloSyncAnnounceTimer = null;
function announceSoloSyncTargetStatus(reason) {
  var doSend = function () {
    try {
      window.postMessage(
        {
          source: "solo-sync-page",
          type: "SOLO_SYNC_TARGET_STATUS",
          payload: {
            reason: reason || "update",
            currentView: window.currentViewId,
            live: !!soloTrainingState.sync.live,
            stateText: soloTrainingState.sync.stateText,
            statusText: soloTrainingState.sync.statusText,
            sourceLabel: soloTrainingState.sync.sourceLabel,
            importedPly: soloTrainingChess.history().length,
            importedSignature: soloTrainingState.sync.lastSignature || "",
            applying: !!soloTrainingState.sync.applying,
            authorized: isSoloTrainingAllowed(),
          },
        },
        "*",
      );
    } catch (e) {}
  };
  if (reason === "ping" || reason === "ui-sync") {
    doSend();
  } else {
    if (_soloSyncAnnounceTimer) clearTimeout(_soloSyncAnnounceTimer);
    _soloSyncAnnounceTimer = setTimeout(doSend, 100);
  }
}

function getSoloSyncPageUrl() {
  try {
    return window.location.href || "";
  } catch (e) {
    return "";
  }
}

function getSoloSyncInternalSourceSnapshot() {
  if (
    window.currentViewId === "view-1v1-game" &&
    current1v1Id &&
    current1v1Data &&
    current1v1Data.status === "active"
  ) {
    var history1v1 = chess1v1.history();
    return {
      site: "satrancsite",
      mode: "1v1",
      sourceLabel:
        "Satrancsite 1v1 - " +
        (current1v1Data.code || current1v1Id || "Canli Mac"),
      title: document.title || "Satrancsite 1v1",
      pageUrl: getSoloSyncPageUrl(),
      gameKey: [
        "satrancsite",
        "1v1",
        current1v1Data.code || current1v1Id || "active",
      ].join("|"),
      moves: history1v1,
      moveCount: history1v1.length,
      detectedAt: Date.now(),
    };
  }
  if (
    window.currentViewId === "view-2v2-game" &&
    current2v2Id &&
    current2v2Data &&
    current2v2Data.status === "active"
  ) {
    var history2v2 = chess.history();
    return {
      site: "satrancsite",
      mode: "2v2",
      sourceLabel:
        "Satrancsite 2v2 - " +
        (current2v2Data.code || current2v2Id || "Canli Mac"),
      title: document.title || "Satrancsite 2v2",
      pageUrl: getSoloSyncPageUrl(),
      gameKey: [
        "satrancsite",
        "2v2",
        current2v2Data.code || current2v2Id || "active",
      ].join("|"),
      moves: history2v2,
      moveCount: history2v2.length,
      detectedAt: Date.now(),
    };
  }
  return null;
}

function announceSoloSyncInternalSourceSnapshot(reason, requestId) {
  var snapshot = getSoloSyncInternalSourceSnapshot();
  if (!snapshot) return false;
  try {
    window.postMessage(
      {
        source: "solo-sync-page",
        type: "SOLO_SYNC_PAGE_SOURCE_SNAPSHOT",
        payload: Object.assign({}, snapshot, {
          reason: reason || "update",
          requestId: requestId || null,
        }),
      },
      "*",
    );
    return true;
  } catch (e) {
    return false;
  }
}

function setSoloCloudSttStatus(text, configured) {
  soloTrainingState.cloudSttStatusText = text || "Kontrol ediliyor";
  if (typeof configured === "boolean")
    soloTrainingState.cloudSttConfigured = configured;
  var el = document.getElementById("soloCloudSttStatus");
  if (el) {
    el.innerText = soloTrainingState.cloudSttStatusText;
    el.classList.toggle("ready", !!soloTrainingState.cloudSttConfigured);
    el.classList.toggle("active", !!soloVoiceCloudBusy);
  }
}

function getSoloVoiceAudioConstraints() {
  var audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (soloTrainingState.voiceSettings.deviceId) {
    audio.deviceId = { exact: soloTrainingState.voiceSettings.deviceId };
  }
  return { audio: audio };
}

function stopSoloVoiceMeter() {
  if (soloVoiceMeterAnimation) cancelAnimationFrame(soloVoiceMeterAnimation);
  soloVoiceMeterAnimation = null;
  if (soloVoiceMeterStream) {
    soloVoiceMeterStream.getTracks().forEach(function (track) {
      track.stop();
    });
  }
  soloVoiceMeterStream = null;
  var fill = document.getElementById("soloVoiceMeterFill");
  if (fill) fill.style.width = "0%";
}

function stopSoloVoiceRecognitionStream() {
  if (soloVoiceRecognitionStream) {
    soloVoiceRecognitionStream.getTracks().forEach(function (track) {
      track.stop();
    });
  }
  soloVoiceRecognitionStream = null;
  soloVoiceRecognitionTrack = null;
}

async function prepareSoloVoiceRecognitionTrack() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    return null;
  stopSoloVoiceRecognitionStream();
  try {
    soloVoiceRecognitionStream = await navigator.mediaDevices.getUserMedia(
      getSoloVoiceAudioConstraints(),
    );
    soloVoiceRecognitionTrack =
      soloVoiceRecognitionStream.getAudioTracks()[0] || null;
    return soloVoiceRecognitionTrack;
  } catch (e) {
    stopSoloVoiceRecognitionStream();
    return null;
  }
}

async function refreshSoloCloudSttHealth() {
  try {
    var response = await fetch("/api/solo-stt/health", { cache: "no-store" });
    if (!response.ok) throw new Error("health " + response.status);
    var data = await response.json();
    soloTrainingState.cloudSttAvailable = data && data.ok === true;
    soloTrainingState.cloudSttConfigured = !!(data && data.configured);
    setSoloCloudSttStatus(
      soloTrainingState.cloudSttConfigured ? "Hazir" : "API anahtari yok",
      soloTrainingState.cloudSttConfigured,
    );
    return soloTrainingState.cloudSttConfigured;
  } catch (e) {
    soloTrainingState.cloudSttAvailable = false;
    soloTrainingState.cloudSttConfigured = false;
    setSoloCloudSttStatus("Proxy yok", false);
    return false;
  }
}
window.refreshSoloCloudSttHealth = refreshSoloCloudSttHealth;

async function refreshSoloVoiceDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    setSoloVoiceHint("Tarayici mikrofon cihaz listesini desteklemiyor.");
    return;
  }
  try {
    var devices = await navigator.mediaDevices.enumerateDevices();
    var microphones = devices.filter(function (device) {
      return device.kind === "audioinput";
    });
    var select = document.getElementById("soloVoiceDeviceSelect");
    if (!select) return;
    var current = soloTrainingState.voiceSettings.deviceId || "";
    select.innerHTML =
      '<option value="">Varsayilan mikrofon</option>' +
      microphones
        .map(function (device, index) {
          var label = device.label || "Mikrofon " + (index + 1);
          return (
            '<option value="' +
            window.escapeHtml(device.deviceId) +
            '">' +
            window.escapeHtml(label) +
            "</option>"
          );
        })
        .join("");
    select.value = microphones.some(function (device) {
      return device.deviceId === current;
    })
      ? current
      : "";
    soloTrainingState.voiceSettings.deviceId = select.value;
    setSoloVoiceHint(
      microphones.length
        ? "Mikrofon listesi guncellendi. Sesli hamleyi ac ve kisaca soyle: e iki e dort."
        : "Mikrofon bulunamadi veya izin verilmedi.",
    );
  } catch (e) {
    setSoloVoiceHint(
      "Mikrofon listesi okunamadi. Tarayici izinlerini kontrol et.",
    );
  }
}

window.refreshSoloVoiceDevices = refreshSoloVoiceDevices;

window.setSoloVoiceDevice = function (deviceId) {
  soloTrainingState.voiceSettings.deviceId = deviceId || "";
  stopSoloVoiceMeter();
  if (soloTrainingState.voiceEnabled) {
    stopSoloVoiceControl();
    startSoloVoiceControl();
  }
  setSoloVoiceHint(
    deviceId
      ? "Secilen mikrofon testte ve bulut yedek STT tarafinda kullanilir."
      : "Varsayilan mikrofon secildi.",
  );
  syncSoloTrainingUI();
};

window.testSoloVoiceMic = async function () {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setSoloVoiceHint("Tarayici mikrofon testini desteklemiyor.");
    return;
  }
  stopSoloVoiceMeter();
  try {
    var constraints = getSoloVoiceAudioConstraints();
    soloVoiceMeterStream =
      await navigator.mediaDevices.getUserMedia(constraints);
    await refreshSoloVoiceDevices();
    var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    var ctx = new AudioContextCtor();
    var source = ctx.createMediaStreamSource(soloVoiceMeterStream);
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    var data = new Uint8Array(analyser.frequencyBinCount);
    var fill = document.getElementById("soloVoiceMeterFill");
    var startedAt = Date.now();
    setSoloVoiceHint(
      "Mikrofon testi acik. Normal sesle e iki e dort de ve cubugu kontrol et.",
    );
    function tick() {
      analyser.getByteTimeDomainData(data);
      var sum = 0;
      for (var i = 0; i < data.length; i++) {
        var v = (data[i] - 128) / 128;
        sum += v * v;
      }
      var rms = Math.sqrt(sum / data.length);
      var level = Math.min(100, Math.round(rms * 360));
      if (fill) fill.style.width = level + "%";
      if (Date.now() - startedAt < 12000 && soloVoiceMeterStream) {
        soloVoiceMeterAnimation = requestAnimationFrame(tick);
      } else {
        try {
          ctx.close();
        } catch (e) {}
        stopSoloVoiceMeter();
        setSoloVoiceHint("Mikrofon testi tamamlandi.");
      }
    }
    tick();
  } catch (e) {
    setSoloVoiceHint(
      "Mikrofon testi baslatilamadi. Windows/Chrome mikrofon iznini kontrol et.",
    );
  }
};

function getSoloSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

var SOLO_VOICE_FILE_ALIASES = {
  a: "a",
  ah: "a",
  ha: "a",
  b: "b",
  be: "b",
  bi: "b",
  c: "c",
  ce: "c",
  ci: "c",
  se: "c",
  d: "d",
  de: "d",
  di: "d",
  e: "e",
  ee: "e",
  ey: "e",
  f: "f",
  ef: "f",
  fe: "f",
  g: "g",
  ge: "g",
  gi: "g",
  h: "h",
  he: "h",
  has: "h",
  as: "h",
};

var SOLO_VOICE_RANK_ALIASES = {
  1: "1",
  bir: "1",
  biri: "1",
  bire: "1",
  one: "1",
  2: "2",
  iki: "2",
  ikisi: "2",
  ikiye: "2",
  two: "2",
  3: "3",
  uc: "3",
  ucu: "3",
  uce: "3",
  three: "3",
  4: "4",
  dort: "4",
  dordu: "4",
  dorde: "4",
  dord: "4",
  four: "4",
  5: "5",
  bes: "5",
  bese: "5",
  besi: "5",
  five: "5",
  6: "6",
  alti: "6",
  altiya: "6",
  altiyi: "6",
  six: "6",
  7: "7",
  yedi: "7",
  yediye: "7",
  yediyi: "7",
  seven: "7",
  8: "8",
  sekiz: "8",
  sekize: "8",
  sekizi: "8",
  eight: "8",
};

var SOLO_VOICE_PIECE_ALIASES = {
  at: "n",
  knight: "n",
  fil: "b",
  bishop: "b",
  kale: "r",
  rook: "r",
  vezir: "q",
  queen: "q",
  sah: "k",
  king: "k",
  piyon: "p",
  pawn: "p",
};

var SOLO_VOICE_FILE_SPOKEN_VARIANTS = {
  a: ["a", "ah", "ha"],
  b: ["b", "be", "bi"],
  c: ["c", "ce", "ci", "se"],
  d: ["d", "de", "di"],
  e: ["e", "ee", "ey"],
  f: ["f", "ef", "fe"],
  g: ["g", "ge", "gi"],
  h: ["h", "he", "has", "as"],
};

var SOLO_VOICE_RANK_SPOKEN_VARIANTS = {
  1: ["1", "bir", "bire"],
  2: ["2", "iki", "ikiye"],
  3: ["3", "uc", "uce"],
  4: ["4", "dort", "dorde", "dord"],
  5: ["5", "bes", "bese"],
  6: ["6", "alti", "altiya"],
  7: ["7", "yedi", "yediye"],
  8: ["8", "sekiz", "sekize"],
};

var SOLO_VOICE_PIECE_WORD_FORMS = {
  n: ["at", "ati", "ata", "atin", "atin"],
  b: ["fil", "fili", "file", "filin"],
  r: ["kale", "kaleyi", "kaleye", "kalenin"],
  q: ["vezir", "veziri", "vezire", "vezirin"],
  k: ["sah", "sahi", "saha", "sahin"],
  p: ["piyon", "piyonu", "piyona", "piyonun"],
};

function normalizeSoloVoiceText(text) {
  var value = String(text || "").toLowerCase();
  try {
    value = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (e) {}
  return value
    .replace(/\u0131/g, "i")
    .replace(/\b(o-o-o|0-0-0|ooo)\b/g, " uzun rok ")
    .replace(/\b(o-o|0-0|oo)\b/g, " kisa rok ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(lutfen|please|hamle|oyna|oynar|oynasin|sur|sursun|move|play|from|to|square|kare|tas|piece)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function stripSoloVoiceTokenSuffix(token) {
  var value = String(token || "");
  if (value.length <= 2) return value;
  return value.replace(
    /(lerden|lardan|den|dan|ten|tan|yla|yle|ye|ya|yi|yu|e|a)$/g,
    "",
  );
}

function tokenizeSoloVoiceText(text) {
  var tokens = [];
  normalizeSoloVoiceText(text)
    .split(/\s+/)
    .filter(Boolean)
    .forEach(function (rawToken) {
      var clean = String(rawToken || "").replace(/[^a-z0-9]/g, "");
      if (!clean) return;
      var compactPair = clean.match(/^([a-h][1-8])([a-h][1-8])$/);
      if (compactPair) {
        tokens.push(compactPair[1], compactPair[2]);
        return;
      }
      var squareToken = clean.match(
        /^([a-h][1-8])(den|dan|ten|tan|ye|ya|e|a)?$/,
      );
      if (squareToken) {
        tokens.push(squareToken[1]);
        return;
      }
      if (SOLO_VOICE_FILE_ALIASES[clean]) {
        tokens.push(SOLO_VOICE_FILE_ALIASES[clean]);
        return;
      }
      if (SOLO_VOICE_RANK_ALIASES[clean]) {
        tokens.push(SOLO_VOICE_RANK_ALIASES[clean]);
        return;
      }
      var stripped = stripSoloVoiceTokenSuffix(clean);
      if (SOLO_VOICE_FILE_ALIASES[stripped]) {
        tokens.push(SOLO_VOICE_FILE_ALIASES[stripped]);
        return;
      }
      if (SOLO_VOICE_RANK_ALIASES[stripped]) {
        tokens.push(SOLO_VOICE_RANK_ALIASES[stripped]);
        return;
      }
      tokens.push(stripped);
    });
  return tokens;
}

function extractSoloVoiceSquaresFromTokens(tokens) {
  var squares = [];
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];
    if (/^[a-h][1-8]$/.test(token)) {
      squares.push(token);
      continue;
    }
    if (/^[a-h]$/.test(token) && /^[1-8]$/.test(tokens[i + 1] || "")) {
      squares.push(token + tokens[i + 1]);
      i += 1;
    }
  }
  return squares.filter(function (square, index) {
    return squares.indexOf(square) === index;
  });
}

function getSoloVoicePromotion(tokens) {
  var list = Array.isArray(tokens) ? tokens : tokenizeSoloVoiceText(tokens);
  for (var i = 0; i < list.length; i++) {
    var token = String(list[i] || "");
    if (
      SOLO_VOICE_PIECE_WORD_FORMS.q.indexOf(token) !== -1 ||
      token === "queen"
    )
      return "q";
    if (SOLO_VOICE_PIECE_WORD_FORMS.r.indexOf(token) !== -1 || token === "rook")
      return "r";
    if (
      SOLO_VOICE_PIECE_WORD_FORMS.b.indexOf(token) !== -1 ||
      token === "bishop"
    )
      return "b";
    if (
      SOLO_VOICE_PIECE_WORD_FORMS.n.indexOf(token) !== -1 ||
      token === "knight"
    )
      return "n";
  }
  return null;
}

function getSoloVoicePieceType(tokens) {
  var list = Array.isArray(tokens) ? tokens : tokenizeSoloVoiceText(tokens);
  for (var i = 0; i < list.length; i++) {
    var token = String(list[i] || "");
    if (SOLO_VOICE_PIECE_ALIASES[token]) return SOLO_VOICE_PIECE_ALIASES[token];
    var types = ["n", "b", "r", "q", "k", "p"];
    for (var t = 0; t < types.length; t++) {
      if (SOLO_VOICE_PIECE_WORD_FORMS[types[t]].indexOf(token) !== -1)
        return types[t];
    }
  }
  return null;
}

function spellSoloVoiceSquare(square) {
  return square && square.length === 2 ? square[0] + " " + square[1] : "";
}

function getSoloVoiceSquarePhrases(square) {
  if (!square || square.length !== 2) return [];
  var file = square[0];
  var rank = square[1];
  var fileVariants = SOLO_VOICE_FILE_SPOKEN_VARIANTS[file] || [file];
  var rankVariants = SOLO_VOICE_RANK_SPOKEN_VARIANTS[rank] || [rank];
  var phrases = [square, file + " " + rank];
  fileVariants.forEach(function (fileWord) {
    rankVariants.forEach(function (rankWord) {
      phrases.push(fileWord + " " + rankWord);
    });
  });
  return phrases
    .map(normalizeSoloVoiceText)
    .filter(Boolean)
    .filter(function (item, index, arr) {
      return arr.indexOf(item) === index;
    });
}

function getSoloVoiceFilePhrases(file) {
  var variants = SOLO_VOICE_FILE_SPOKEN_VARIANTS[file] || [file];
  return variants
    .map(normalizeSoloVoiceText)
    .filter(Boolean)
    .filter(function (item, index, arr) {
      return arr.indexOf(item) === index;
    });
}

function getSoloVoicePieceNames(type) {
  return (
    {
      n: ["at", "knight"],
      b: ["fil", "bishop"],
      r: ["kale", "rook"],
      q: ["vezir", "queen"],
      k: ["sah", "king"],
      p: ["piyon", "pawn"],
    }[type] || []
  );
}

function getSoloVoicePromotionNames(type) {
  return (
    {
      q: ["vezir", "queen"],
      r: ["kale", "rook"],
      b: ["fil", "bishop"],
      n: ["at", "knight"],
    }[type] || []
  );
}

function getSoloVoicePieceWordForms(type) {
  var forms = SOLO_VOICE_PIECE_WORD_FORMS[type] || [];
  return forms
    .concat(getSoloVoicePieceNames(type))
    .map(normalizeSoloVoiceText)
    .filter(Boolean)
    .filter(function (item, index, arr) {
      return arr.indexOf(item) === index;
    });
}

function normalizeSoloSanForVoice(san) {
  if (!san) return "";
  var value = String(san || "")
    .replace(/[+#?!]/g, "")
    .replace(/0/g, "o");
  if (/^o-o-o$/i.test(value)) return "uzun rok";
  if (/^o-o$/i.test(value)) return "kisa rok";
  return normalizeSoloVoiceText(
    value.replace(/=/g, " ").replace(/x/g, " ").replace(/-/g, " "),
  );
}

function getSoloVoiceMovePhrases(move) {
  var phrases = [];
  if (!move) return phrases;
  var flags = move.flags || "";
  var fromSquarePhrases = getSoloVoiceSquarePhrases(move.from);
  var toSquarePhrases = getSoloVoiceSquarePhrases(move.to);
  var fromFilePhrases = getSoloVoiceFilePhrases(move.from[0]);
  if (flags.indexOf("k") !== -1 || flags.indexOf("q") !== -1) {
    phrases.push("rok");
    if (flags.indexOf("k") !== -1) phrases.push("kisa rok");
    if (flags.indexOf("q") !== -1) phrases.push("uzun rok");
  }
  phrases.push(move.from + " " + move.to);
  phrases.push(move.from + move.to);
  fromSquarePhrases.forEach(function (fromPhrase) {
    toSquarePhrases.forEach(function (toPhrase) {
      phrases.push(fromPhrase + " " + toPhrase);
    });
  });
  toSquarePhrases.forEach(function (toPhrase) {
    phrases.push(toPhrase);
    if (move.piece === "p") {
      fromFilePhrases.forEach(function (filePhrase) {
        phrases.push(filePhrase + " " + toPhrase);
      });
    }
  });
  if (move.piece !== "p") {
    getSoloVoicePieceWordForms(move.piece).forEach(function (name) {
      toSquarePhrases.forEach(function (toPhrase) {
        phrases.push(name + " " + toPhrase);
        phrases.push(name + " " + toPhrase + " git");
        phrases.push(name + " " + toPhrase + " oyna");
      });
      fromSquarePhrases.forEach(function (fromPhrase) {
        toSquarePhrases.forEach(function (toPhrase) {
          phrases.push(name + " " + fromPhrase + " " + toPhrase);
          phrases.push(name + " " + fromPhrase + " den " + toPhrase);
        });
      });
      if (move.captured) {
        toSquarePhrases.forEach(function (toPhrase) {
          phrases.push(name + " " + toPhrase + " al");
        });
      }
    });
  } else {
    getSoloVoicePieceWordForms("p").forEach(function (name) {
      toSquarePhrases.forEach(function (toPhrase) {
        phrases.push(name + " " + toPhrase);
        fromFilePhrases.forEach(function (filePhrase) {
          phrases.push(filePhrase + " " + name + " " + toPhrase);
          phrases.push(name + " " + filePhrase + " " + toPhrase);
        });
      });
    });
    if (move.captured) {
      fromFilePhrases.forEach(function (filePhrase) {
        toSquarePhrases.forEach(function (toPhrase) {
          phrases.push(filePhrase + " " + toPhrase);
          phrases.push(filePhrase + " " + toPhrase + " al");
          phrases.push(filePhrase + " piyon " + toPhrase);
          phrases.push(filePhrase + " piyonu " + toPhrase);
        });
      });
    }
  }
  if (move.promotion) {
    getSoloVoicePieceWordForms(move.promotion).forEach(function (name) {
      fromSquarePhrases.forEach(function (fromPhrase) {
        toSquarePhrases.forEach(function (toPhrase) {
          phrases.push(fromPhrase + " " + toPhrase + " " + name);
          phrases.push(fromPhrase + " " + toPhrase + " terfi " + name);
        });
      });
      toSquarePhrases.forEach(function (toPhrase) {
        phrases.push(toPhrase + " " + name);
        phrases.push(toPhrase + " terfi " + name);
      });
    });
  }
  if (move.san) phrases.push(normalizeSoloSanForVoice(move.san));
  if (move.san)
    phrases.push(normalizeSoloSanForVoice(translateSanToTurkish(move.san)));
  return phrases
    .map(normalizeSoloVoiceText)
    .filter(Boolean)
    .filter(function (item, index, arr) {
      return arr.indexOf(item) === index;
    });
}

function scoreSoloVoiceMoveCandidate(
  move,
  normalizedText,
  tokens,
  squares,
  pieceType,
  promotion,
) {
  var score = 0;
  if (!move) return score;
  if (squares.length >= 2 && move.from === squares[0] && move.to === squares[1])
    score = 190;
  else if (squares.length === 1 && move.to === squares[0])
    score = Math.max(score, 90);
  if (pieceType && move.piece === pieceType) score += 28;
  if (promotion && move.promotion === promotion) score += 18;
  if (promotion && move.promotion && move.promotion !== promotion) score -= 14;
  var phrases = getSoloVoiceMovePhrases(move);
  for (var i = 0; i < phrases.length; i++) {
    var phrase = phrases[i];
    if (!phrase) continue;
    if (normalizedText === phrase) {
      score = Math.max(
        score,
        phrase.indexOf(move.from) !== -1 ||
          phrase.indexOf(spellSoloVoiceSquare(move.from)) !== -1
          ? 180
          : 150,
      );
    } else if (normalizedText.indexOf(phrase) !== -1) {
      score = Math.max(score, 120);
    }
  }
  if (
    !pieceType &&
    move.piece === "p" &&
    squares.length === 1 &&
    move.to === squares[0]
  )
    score += 10;
  return score;
}

function pickSoloVoiceMoveFromTranscript(normalizedText) {
  var tokens = tokenizeSoloVoiceText(normalizedText);
  var squares = extractSoloVoiceSquaresFromTokens(tokens);
  var pieceType = getSoloVoicePieceType(tokens);
  var promotion = getSoloVoicePromotion(tokens);
  var legal = soloTrainingChess.moves({ verbose: true }) || [];
  var scored = legal
    .map(function (move) {
      return {
        move: move,
        score: scoreSoloVoiceMoveCandidate(
          move,
          normalizedText,
          tokens,
          squares,
          pieceType,
          promotion,
        ),
      };
    })
    .filter(function (item) {
      return item.score > 0;
    })
    .sort(function (a, b) {
      return b.score - a.score;
    });
  if (!scored.length || scored[0].score < 90) return null;
  if (
    scored[1] &&
    getSoloMoveUci(scored[0].move) !== getSoloMoveUci(scored[1].move)
  ) {
    if (scored[0].score === scored[1].score) return { ambiguous: true };
    if (scored[0].score < 180 && scored[0].score - scored[1].score < 18)
      return { ambiguous: true };
  }
  return scored[0].move;
}

function findSoloCastleMove(text) {
  if (!/\brok\b/.test(text)) return null;
  var wantLong = /\buzun rok\b/.test(text) || /\blong\b/.test(text);
  var wantShort =
    /\bkisa rok\b/.test(text) || /\bshort\b/.test(text) || !wantLong;
  var legal = soloTrainingChess.moves({ verbose: true }) || [];
  var castles = legal.filter(function (move) {
    var flags = move.flags || "";
    return (
      (wantShort && flags.indexOf("k") !== -1) ||
      (wantLong && flags.indexOf("q") !== -1)
    );
  });
  if (!castles.length) return null;
  if (
    castles.length > 1 &&
    !wantLong &&
    !/\bkisa rok\b/.test(text) &&
    !/\bshort\b/.test(text)
  )
    return { ambiguous: true };
  return castles[0];
}

function parseSoloVoiceMove(rawText) {
  var text = normalizeSoloVoiceText(rawText);
  if (!text) return null;
  if (
    /\b(geri al|geri git|geri don|bir onceki hamle|son hamleyi geri al|hamleyi geri al|undo|geri)\b/.test(
      text,
    )
  ) {
    return { action: "undo", text: text };
  }
  if (
    /\b(ileri al|ileri git|yeniden oyna|tekrar oyna|hamleyi tekrar oyna|redo|ileri)\b/.test(
      text,
    )
  ) {
    return { action: "redo", text: text };
  }
  if (/\b(en iyi kapat|motor kapat|panel kapat)\b/.test(text))
    return { action: "hideBest", text: text };
  if (/\b(en iyi ac|motor ac|panel ac)\b/.test(text))
    return { action: "showBest", text: text };

  var castle = findSoloCastleMove(text);
  if (castle && castle.ambiguous) return { ambiguous: true, text: text };
  if (castle)
    return {
      from: castle.from,
      to: castle.to,
      promotion: castle.promotion || null,
      san: castle.san,
      text: text,
    };

  var matchedMove = pickSoloVoiceMoveFromTranscript(text);
  if (!matchedMove) return null;
  if (matchedMove.ambiguous) return { ambiguous: true, text: text };
  return {
    from: matchedMove.from,
    to: matchedMove.to,
    promotion: matchedMove.promotion || null,
    san: matchedMove.san,
    text: text,
  };
}

function pickSoloVoiceParsedResult(result) {
  var threshold = Number(soloTrainingState.voiceSettings.confidence);
  if (!Number.isFinite(threshold)) threshold = 0.34;
  var fallback = null;
  for (var i = 0; result && i < result.length; i++) {
    var transcript =
      result[i] && result[i].transcript ? result[i].transcript : "";
    var confidence =
      result[i] && typeof result[i].confidence === "number"
        ? result[i].confidence
        : 0.75;
    var parsed = parseSoloVoiceMove(transcript);
    if (!parsed) continue;
    var picked = {
      parsed: parsed,
      transcript: transcript,
      confidence: confidence,
    };
    if (!fallback) fallback = picked;
    if (parsed.action || parsed.ambiguous || confidence >= threshold)
      return picked;
  }
  return fallback;
}

function getSoloCloudRecorderMimeType() {
  if (!window.MediaRecorder || !window.MediaRecorder.isTypeSupported) return "";
  var types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (var i = 0; i < types.length; i++) {
    if (window.MediaRecorder.isTypeSupported(types[i])) return types[i];
  }
  return "";
}

function stopSoloCloudFallback() {
  soloVoiceCloudCycle += 1;
  if (soloVoiceCloudTimer) clearTimeout(soloVoiceCloudTimer);
  soloVoiceCloudTimer = null;
  soloVoiceCloudBusy = false;
  if (soloVoiceCloudRecorder && soloVoiceCloudRecorder.state !== "inactive") {
    try {
      soloVoiceCloudRecorder.stop();
    } catch (e) {}
  }
  soloVoiceCloudRecorder = null;
  if (soloVoiceCloudStream) {
    soloVoiceCloudStream.getTracks().forEach(function (track) {
      track.stop();
    });
  }
  soloVoiceCloudStream = null;
  setSoloCloudSttStatus(
    soloTrainingState.cloudSttConfigured
      ? "Hazir"
      : soloTrainingState.cloudSttStatusText,
    soloTrainingState.cloudSttConfigured,
  );
}

function scheduleSoloCloudCapture(delayMs) {
  if (soloVoiceCloudTimer) clearTimeout(soloVoiceCloudTimer);
  soloVoiceCloudTimer = setTimeout(
    runSoloCloudCapture,
    Math.max(120, delayMs || 250),
  );
}

function isSoloVoiceDuplicateCommand(transcript) {
  var key = normalizeSoloVoiceText(transcript);
  var now = Date.now();
  var cooldownMs = Math.max(
    900,
    Number(soloTrainingState.voiceSettings.commandCooldownMs) || 2200,
  );
  if (
    key &&
    key === soloVoiceLastCommandKey &&
    now - soloVoiceLastCommandAt < cooldownMs
  )
    return true;
  soloVoiceLastCommandKey = key;
  soloVoiceLastCommandAt = now;
  return false;
}

async function transcribeSoloCloudBlob(blob) {
  if (!blob || !blob.size || !soloTrainingState.voiceEnabled) return;
  soloVoiceCloudBusy = true;
  setSoloCloudSttStatus("Dinleniyor...", true);
  try {
    var response = await fetch("/api/solo-stt", {
      method: "POST",
      headers: {
        "content-type": blob.type || "audio/webm",
        "x-solo-stt-language": "tr",
      },
      body: blob,
    });
    var data = await response.json().catch(function () {
      return {};
    });
    if (!response.ok || !data.ok) {
      setSoloCloudSttStatus(
        response.status === 503 ? "API anahtari yok" : "STT hata",
        response.status !== 503,
      );
      if (response.status === 503)
        setSoloVoiceHint(
          "Bulut STT icin proxy OPENAI_API_KEY ile baslatilmali.",
        );
      return;
    }
    var transcript = String(data.text || "").trim();
    if (!transcript) {
      setSoloCloudSttStatus("Ses yok", true);
      return;
    }
    if (isSoloVoiceDuplicateCommand(transcript)) {
      setSoloCloudSttStatus("Tekrar atlandi", true);
      return;
    }
    setSoloCloudSttStatus("Duydu", true);
    setSoloVoiceLastHeard(transcript);
    setSoloVoiceStatus("Bulut duydu: " + transcript);
    await handleSoloVoiceTranscript(transcript, "cloud");
  } catch (e) {
    setSoloCloudSttStatus("Proxy hata", false);
    setSoloVoiceHint(
      "Bulut STT proxy baglantisi yok. Linki 8091 proxy uzerinden ac.",
    );
  } finally {
    soloVoiceCloudBusy = false;
    syncSoloTrainingUI();
  }
}

async function runSoloCloudCapture() {
  var cycle = soloVoiceCloudCycle;
  if (
    !soloTrainingState.voiceEnabled ||
    window.currentViewId !== "view-solo-training"
  )
    return;
  if (!soloTrainingState.voiceSettings.cloudFallback) return;
  if (!soloTrainingState.cloudSttConfigured) {
    var configured = await refreshSoloCloudSttHealth();
    if (!configured) return;
  }
  if (Date.now() - soloVoiceLastNativeAt < 2400) {
    scheduleSoloCloudCapture(900);
    return;
  }
  if (!soloVoiceCloudStream) {
    try {
      soloVoiceCloudStream = await navigator.mediaDevices.getUserMedia(
        getSoloVoiceAudioConstraints(),
      );
    } catch (e) {
      setSoloCloudSttStatus("Mikrofon izni yok", false);
      return;
    }
  }
  if (!window.MediaRecorder) {
    setSoloCloudSttStatus("Tarayici desteklemiyor", false);
    return;
  }
  if (soloVoiceCloudBusy) {
    scheduleSoloCloudCapture(700);
    return;
  }

  var mimeType = getSoloCloudRecorderMimeType();
  var chunks = [];
  try {
    soloVoiceCloudRecorder = mimeType
      ? new MediaRecorder(soloVoiceCloudStream, { mimeType: mimeType })
      : new MediaRecorder(soloVoiceCloudStream);
  } catch (e) {
    setSoloCloudSttStatus("Kayit acilamadi", false);
    return;
  }

  soloVoiceCloudRecorder.ondataavailable = function (event) {
    if (event.data && event.data.size) chunks.push(event.data);
  };
  soloVoiceCloudRecorder.onstop = async function () {
    if (cycle !== soloVoiceCloudCycle) return;
    soloVoiceCloudRecorder = null;
    var blob = new Blob(chunks, { type: mimeType || "audio/webm" });
    if (blob.size > 900) await transcribeSoloCloudBlob(blob);
    if (
      soloTrainingState.voiceEnabled &&
      window.currentViewId === "view-solo-training"
    ) {
      scheduleSoloCloudCapture(
        soloTrainingState.voiceSettings.cloudCooldownMs || 250,
      );
    }
  };
  soloVoiceCloudRecorder.start();
  setSoloCloudSttStatus("Kayit aliyor", true);
  soloVoiceCloudTimer = setTimeout(
    function () {
      if (
        soloVoiceCloudRecorder &&
        soloVoiceCloudRecorder.state !== "inactive"
      ) {
        try {
          soloVoiceCloudRecorder.stop();
        } catch (e) {}
      }
    },
    Math.max(
      1200,
      Math.min(4500, soloTrainingState.voiceSettings.cloudRecordMs || 2300),
    ),
  );
}

async function startSoloCloudFallback() {
  if (!soloTrainingState.voiceSettings.cloudFallback) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setSoloCloudSttStatus("Mikrofon yok", false);
    return;
  }
  var configured = await refreshSoloCloudSttHealth();
  if (!configured || !soloTrainingState.voiceEnabled) return;
  setSoloVoiceHint(
    "Tarayici duymazsa secili mikrofonla bulut yedek STT devreye girer.",
  );
  scheduleSoloCloudCapture(650);
}

async function playSoloTrainingMoveFromInput(from, to, promotion, options) {
  if (!isSoloTrainingAllowed() || isSoloGameOver()) return false;
  if (!from || !to) return false;
  clearSoloAutoTimer();
  soloTrainingRedoStack = [];
  var movingSide = getSoloCurrentSide();
  var beforeFen = soloTrainingChess.fen();
  var finalPromotion = promotion || "q";
  if (
    isPromotionMoveForGame(soloTrainingChess, from, to) &&
    !promotion &&
    (!options || options.promptPromotion !== false)
  ) {
    finalPromotion = await chooseSoloPromotion(soloTrainingChess.turn());
    if (!finalPromotion) return false;
  }
  var move = soloTrainingChess.move({
    from: from,
    to: to,
    promotion: finalPromotion,
  });
  if (!move) return false;
  recordSoloMoveClassification(move, movingSide, beforeFen);
  soloTrainingSelectedSquare = null;
  soloTrainingValidMoves = [];
  clearSoloPreviewMarks();
  drawSoloTrainingBoard();
  if (window.playChessMoveSound)
    window.playChessMoveSound(move, soloTrainingChess);
  else if (window.playGameSound) window.playGameSound("move");
  syncSoloTrainingUI();
  await refreshSoloTrainingStockfish(true);
  return true;
}

function normalizeSoloImportedMoveToken(token) {
  var value = String(token || "").trim();
  if (!value) return "";
  var pieces = {
    "♔": "K",
    "♕": "Q",
    "♖": "R",
    "♗": "B",
    "♘": "N",
    "♙": "",
    "♚": "K",
    "♛": "Q",
    "♜": "R",
    "♝": "B",
    "♞": "N",
    "♟": "",
  };
  value = value.replace(/[\u2654-\u265F]/g, function (ch) {
    return pieces[ch] || "";
  });
  value = value
    .replace(/^[0-9]+\.(\.\.\.)?/, "")
    .replace(/[−–—]/g, "-")
    .replace(/0-0-0/g, "O-O-O")
    .replace(/0-0/g, "O-O")
    .replace(/[!?]+/g, "")
    .replace(/\s+/g, "");
  return value;
}

function isSoloImportedResultToken(token) {
  return /^(1-0|0-1|1\/2-1\/2|\*)$/i.test(String(token || "").trim());
}

function getSoloExternalSnapshotSignature(snapshot) {
  if (!snapshot) return "";
  if (snapshot.signature) return String(snapshot.signature);
  return (
    String(snapshot.gameKey || "game") +
    "|" +
    (Array.isArray(snapshot.moves) ? snapshot.moves.join(" ") : "")
  );
}

function getSoloImportedMoveCategory(move) {
  if (!move) return "good";
  if (move.san && move.san.indexOf("#") !== -1) return "brilliant";
  if (
    move.flags &&
    (move.flags.indexOf("k") !== -1 || move.flags.indexOf("q") !== -1)
  )
    return "excellent";
  if (move.promotion) return "great";
  if (move.san && move.san.indexOf("+") !== -1) return "excellent";
  if (move.captured) return "good";
  return "good";
}

function normalizeSoloImportedSanToken(token) {
  return String(token || "")
    .replace(/0/g, "O")
    .replace(/[+#?!]/g, "")
    .replace(/=/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function findSoloImportedLegalMove(game, token) {
  if (!game || !token) return null;
  var normalized = normalizeSoloImportedSanToken(token);
  if (!normalized) return null;
  var legal = game.moves({ verbose: true }) || [];
  for (var i = 0; i < legal.length; i++) {
    var move = legal[i];
    var san = normalizeSoloImportedSanToken(move.san || "");
    var uci = String(
      (move.from || "") + (move.to || "") + (move.promotion || ""),
    ).toLowerCase();
    if (normalized === san || normalized === uci) return move;
  }
  return null;
}

function buildSoloImportedGame(snapshot) {
  var importedGame = new Chess();
  var importedClassifications = [];
  for (var i = 0; i < snapshot.moves.length; i++) {
    var notation = snapshot.moves[i];
    if (isSoloImportedResultToken(notation)) continue;
    var beforeFen = importedGame.fen();
    var move = applySoloImportedMoveToGame(importedGame, notation);

    if (!move) {
      // 🔄 DEĞİŞTİRİLEN KISIM BAŞLANGICI
      console.warn("Geçersiz kelime geldi, hamle atlanıyor: " + notation);
      continue; // Eskiden burada throw new Error(...) vardı, sistemi çökertiyordu.
      // 🔄 DEĞİŞTİRİLEN KISIM BİTİŞİ
    }

    var side = move.color === "b" ? "black" : "white";
    importedClassifications.push({
      ply: importedGame.history().length,
      color: side === "black" ? "b" : "w",
      side: side,
      from: move.from,
      to: move.to,
      san: move.san,
      category: classifySoloPlayedMove(move, side, beforeFen),
    });
  }
  return {
    game: importedGame,
    classifications: importedClassifications,
  };
}

function canIncrementallyApplySoloSnapshot(snapshot) {
  var currentMoves = Array.isArray(soloTrainingState.sync.lastRawMoves)
    ? soloTrainingState.sync.lastRawMoves
    : [];
  var nextMoves = Array.isArray(snapshot && snapshot.moves)
    ? snapshot.moves
    : [];
  if (!soloTrainingState.sync.live) return false;
  if (!currentMoves.length && nextMoves.length) return false;
  if (
    String(soloTrainingState.sync.lastGameKey || "") !==
    String((snapshot && snapshot.gameKey) || "")
  )
    return false;
  if (nextMoves.length < currentMoves.length) return false;
  for (var i = 0; i < currentMoves.length; i++) {
    if (String(currentMoves[i] || "") !== String(nextMoves[i] || ""))
      return false;
  }
  return nextMoves.length > currentMoves.length;
}

function waitForSoloTrainingView(timeoutMs) {
  return new Promise(function (resolve) {
    var deadline = Date.now() + Math.max(200, timeoutMs || 1400);
    function check() {
      if (window.currentViewId === "view-solo-training") {
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      setTimeout(check, 40);
    }
    check();
  });
}

async function flushPendingSoloExternalSnapshot() {
  var pending = soloTrainingState.sync.pendingSnapshot;
  if (!pending) return;
  setSoloSyncState({ pendingSnapshot: null });
  await applySoloExternalSnapshot(pending);
}

function applySoloImportedMoveToGame(game, rawToken) {
  if (!game) return null;
  var token = normalizeSoloImportedMoveToken(rawToken);
  if (!token || token === "..." || isSoloImportedResultToken(token))
    return null;
  if (/^[a-h][1-8][a-h][1-8][nbrq]?$/i.test(token)) {
    return game.move({
      from: token.slice(0, 2).toLowerCase(),
      to: token.slice(2, 4).toLowerCase(),
      promotion: token.length > 4 ? token.slice(4, 5).toLowerCase() : undefined,
    });
  }
  if (
    /^[kqrbn]?[a-h]?[1-8]?[-x]?[a-h][1-8](=?[nbrq])?[+#]?$/i.test(token) ||
    /^[a-h][1-8][-x][a-h][1-8][nbrq]?$/i.test(token)
  ) {
    var compact = token.replace(/[-x]/g, "");
    if (/^[a-h][1-8][a-h][1-8][nbrq]?$/i.test(compact)) {
      return game.move({
        from: compact.slice(0, 2).toLowerCase(),
        to: compact.slice(2, 4).toLowerCase(),
        promotion:
          compact.length > 4 ? compact.slice(4, 5).toLowerCase() : undefined,
      });
    }
  }
  var legalMatch = findSoloImportedLegalMove(game, token);
  if (legalMatch) {
    return game.move({
      from: legalMatch.from,
      to: legalMatch.to,
      promotion: legalMatch.promotion || undefined,
    });
  }
  try {
    return game.move(token, { sloppy: true }) || game.move(token);
  } catch (e) {
    try {
      return game.move(token);
    } catch (err) {
      return null;
    }
  }
}

let _soloSyncApplyLockTimer = null;

async function applySoloExternalSnapshot(snapshot) {
  if (!isSoloTrainingAllowed()) {
    setSoloSyncState({
      live: false,
      stateText: "Yetkisiz",
      statusText: "Canli aktarim yalnizca yetkili hesapta acilir.",
    });
    syncSoloTrainingUI();
    return false;
  }
  if (!snapshot || !Array.isArray(snapshot.moves)) return false;
  var signature = getSoloExternalSnapshotSignature(snapshot);
  var wasLiveSync = !!soloTrainingState.sync.live;
  if (signature === soloTrainingState.sync.lastSignature && !snapshot.force)
    return true;
  if (soloTrainingState.sync.applying) {
    setSoloSyncState({
      pendingSnapshot: Object.assign({}, snapshot),
      statusText: "Yeni canli veri siraya alindi...",
    });
    syncSoloTrainingUI();
    return true;
  }

  setSoloSyncState({
    applying: true,
    sourceLabel: snapshot.sourceLabel || snapshot.site || "Harici tahta",
    statusText: "Canli mac tahta verisi isleniyor...",
    stateText: "Baglaniyor",
    live: wasLiveSync,
    lastGameKey: String(snapshot.gameKey || ""),
    lastEventAt: Date.now(),
  });
  syncSoloTrainingUI();

  if (_soloSyncApplyLockTimer) clearTimeout(_soloSyncApplyLockTimer);
  _soloSyncApplyLockTimer = setTimeout(function () {
    if (soloTrainingState.sync.applying) {
      console.warn("Solo sync lock timeout");
      setSoloSyncState({ applying: false });
    }
  }, 3000);

  try {
    if (
      window.currentViewId !== "view-solo-training" &&
      typeof window.openSoloTrainingMode === "function"
    ) {
      window.openSoloTrainingMode();
    }
    var ready = await waitForSoloTrainingView(1500);
    if (!ready) throw new Error("Solo hedefi hazir degil");
    clearSoloAutoTimer();
    clearSoloPreviewMarks();

    var incremental = false;
    if (!snapshot.force && canIncrementallyApplySoloSnapshot(snapshot)) {
      incremental = true;
      var currentLen = Array.isArray(soloTrainingState.sync.lastRawMoves)
        ? soloTrainingState.sync.lastRawMoves.length
        : 0;
      var newMoves = snapshot.moves.slice(currentLen);
      for (var i = 0; i < newMoves.length; i++) {
        var token = newMoves[i];
        if (isSoloImportedResultToken(token)) continue;
        var beforeFen = soloTrainingChess.fen();
        var movingSide = soloTrainingChess.turn() === "w" ? "white" : "black";
        var move = applySoloImportedMoveToGame(soloTrainingChess, token);
        if (move) {
          recordSoloMoveClassification(move, movingSide, beforeFen);
        } else {
          incremental = false;
          break;
        }
      }
    }

    if (!incremental) {
      var importedSnapshot = buildSoloImportedGame(snapshot);
      soloTrainingChess = importedSnapshot.game;
      soloTrainingMoveClassifications = importedSnapshot.classifications;
    }

    soloTrainingRedoStack = [];
    soloTrainingSelectedSquare = null;
    soloTrainingValidMoves = [];
    resetSoloEngineState("Canli aktarim guncellendi");
    soloTrainingState.initialized = true;
    setSoloSyncState({
      live: true,
      stateText: "Canli",
      statusText: snapshot.moves.length
        ? "Harici mactaki son konum Solo Usta Antrenmani tahtasina islendi."
        : "Yeni mac algilandi. Tahta baslangic konumuna cekildi.",
      importedPly: soloTrainingChess.history().length,
      lastSignature: signature,
      lastRawMoves: snapshot.moves.slice(),
      sourceLabel: snapshot.sourceLabel || snapshot.site || "Harici tahta",
      lastGameKey: String(snapshot.gameKey || ""),
      lastEventAt: Date.now(),
    });
    drawSoloTrainingBoard();
    syncSoloTrainingUI();
    var hasPendingSnapshot = !!soloTrainingState.sync.pendingSnapshot;
    setSoloSyncState({ applying: false });
    if (_soloSyncApplyLockTimer) {
      clearTimeout(_soloSyncApplyLockTimer);
      _soloSyncApplyLockTimer = null;
    }
    syncSoloTrainingUI();
    if (hasPendingSnapshot) {
      await flushPendingSoloExternalSnapshot();
    } else {
      refreshSoloTrainingStockfish(true).catch(function () {});
    }
    return true;
  } catch (error) {
    setSoloSyncState({
      applying: false,
      live: wasLiveSync,
      stateText: "Hata",
      statusText:
        "Canli aktarim hatasi: " +
        (error && error.message ? error.message : "Bilinmeyen hata"),
      sourceLabel: snapshot.sourceLabel || snapshot.site || "Harici tahta",
    });
    if (_soloSyncApplyLockTimer) {
      clearTimeout(_soloSyncApplyLockTimer);
      _soloSyncApplyLockTimer = null;
    }
    syncSoloTrainingUI();
    return false;
  }
}

window.applySoloExternalSnapshot = applySoloExternalSnapshot;

window.addEventListener("message", function (event) {
  if (event.source !== window) return;
  var data = event.data;
  if (!data || data.source !== "solo-sync-extension") return;
  if (data.type === "SOLO_SYNC_EXTENSION_DISABLE") {
    resetSoloSyncState();
    syncSoloTrainingUI();
    return;
  }
  if (data.type === "SOLO_SYNC_EXTENSION_REQUEST_SOURCE_SNAPSHOT") {
    announceSoloSyncInternalSourceSnapshot(
      "extension-request",
      data.requestId || null,
    );
    return;
  }
  if (data.type === "SOLO_SYNC_EXTENSION_PING") {
    announceSoloSyncTargetStatus("ping");
    return;
  }
  if (data.type === "SOLO_SYNC_EXTENSION_SNAPSHOT") {
    applySoloExternalSnapshot(data.payload || {}).catch(function () {});
  }
});

async function handleSoloVoiceTranscript(transcript) {
  if (!soloTrainingState.voiceEnabled) return;
  var cleanTranscript = String(transcript || "").trim();
  if (!cleanTranscript) return;
  setSoloVoiceLastHeard(cleanTranscript);
  var parsed = parseSoloVoiceMove(transcript);
  if (!parsed) {
    setSoloVoiceStatus("Komut eslesmedi. " + getSoloVoiceReadyPrompt());
    return;
  }
  if (parsed.action === "undo") {
    window.undoSoloTrainingMove();
    setSoloVoiceStatus("Geri alindi.");
    return;
  }
  if (parsed.action === "redo") {
    window.redoSoloTrainingMove();
    setSoloVoiceStatus("Ileri alindi.");
    return;
  }
  if (parsed.action === "hideBest") {
    soloTrainingState.showBestPanel = false;
    syncSoloTrainingUI();
    setSoloVoiceStatus("En iyi hamle paneli kapali.");
    return;
  }
  if (parsed.action === "showBest") {
    soloTrainingState.showBestPanel = true;
    syncSoloTrainingUI();
    setSoloVoiceStatus("En iyi hamle paneli acik.");
    return;
  }
  if (parsed.ambiguous) {
    setSoloVoiceStatus(
      "Belirsiz hamle. Kaynak kareyi de soyle: g bir f uc gibi.",
    );
    return;
  }
  if (soloVoiceCommandBusy) return;
  soloVoiceCommandBusy = true;
  var movingSide = getSoloColorName(getSoloCurrentSide());
  try {
    var ok = await playSoloTrainingMoveFromInput(
      parsed.from,
      parsed.to,
      parsed.promotion,
      { promptPromotion: false },
    );
    setSoloVoiceStatus(
      ok
        ? movingSide +
            " oynadi: " +
            formatSoloMoveText(parsed.san || parsed.from + "-" + parsed.to)
        : "Bu komut mevcut siradaki taraf icin yasal degil.",
    );
  } finally {
    soloVoiceCommandBusy = false;
  }
}

function stopSoloVoiceControl() {
  if (soloVoiceRestartTimer) clearTimeout(soloVoiceRestartTimer);
  soloVoiceRestartTimer = null;
  if (soloVoiceWatchdogTimer) clearTimeout(soloVoiceWatchdogTimer);
  soloVoiceWatchdogTimer = null;
  stopSoloCloudFallback();
  soloTrainingState.voiceListening = false;
  if (soloVoiceRecognition) {
    try {
      soloVoiceRecognition.onend = null;
      soloVoiceRecognition.stop();
    } catch (e) {}
  }
  soloVoiceRecognition = null;
  stopSoloVoiceRecognitionStream();
  soloVoiceCommandBusy = false;
  if (!soloTrainingState.voiceEnabled) setSoloVoiceEngineText("Hazir degil");
}

function armSoloVoiceWatchdog() {
  if (soloVoiceWatchdogTimer) clearTimeout(soloVoiceWatchdogTimer);
  soloVoiceWatchdogTimer = setTimeout(function () {
    if (
      !soloTrainingState.voiceEnabled ||
      window.currentViewId !== "view-solo-training"
    )
      return;
    setSoloVoiceStatus("Dinleme yenileniyor... " + getSoloVoiceReadyPrompt());
    if (soloVoiceRecognition) {
      try {
        soloVoiceRecognition.abort();
        return;
      } catch (e) {}
    }
    startSoloVoiceControl();
  }, 11000);
}

async function startSoloVoiceControl() {
  var SpeechCtor = getSoloSpeechRecognitionCtor();
  stopSoloVoiceControl();
  if (!soloTrainingState.voiceEnabled) return;
  setSoloVoiceStatus("Sesli hamle hazirlaniyor...");
  setSoloVoiceEngineText("Hazirlaniyor");
  setSoloVoiceLastHeard("-");
  var recognitionTrack = await prepareSoloVoiceRecognitionTrack();
  if (!recognitionTrack) {
    setSoloVoiceHint(
      "Sesli hamle icin mikrofon izni gerekli. Tarayici isterse izin ver.",
    );
  }
  await refreshSoloVoiceDevices();
  var cloudConfigured = await refreshSoloCloudSttHealth();
  if (!soloTrainingState.voiceEnabled) return;
  if (!SpeechCtor && !cloudConfigured) {
    soloTrainingState.voiceEnabled = false;
    setSoloVoiceEngineText("Destek yok");
    setSoloVoiceStatus(
      "Tarayici ses algilamayi baslatamadi. Chrome veya Edge ile dene.",
    );
    syncSoloTrainingUI();
    return;
  }
  if (!SpeechCtor) {
    stopSoloVoiceRecognitionStream();
    setSoloVoiceEngineText("Bulut");
    setSoloVoiceStatus("Bulut STT aktif. " + getSoloVoiceReadyPrompt());
    syncSoloTrainingUI();
    startSoloCloudFallback();
    return;
  }
  soloVoiceRecognition = new SpeechCtor();
  soloVoiceRecognition.lang = "tr-TR";
  soloVoiceRecognition.continuous = true;
  soloVoiceRecognition.interimResults = true;
  soloVoiceRecognition.maxAlternatives = Math.max(
    1,
    Math.min(5, soloTrainingState.voiceSettings.maxAlternatives || 4),
  );
  soloVoiceRecognition.onstart = function () {
    soloTrainingState.voiceListening = true;
    setSoloVoiceEngineText(cloudConfigured ? "Tarayici + Bulut" : "Tarayici");
    setSoloVoiceStatus("Dinleniyor. " + getSoloVoiceReadyPrompt());
    armSoloVoiceWatchdog();
    syncSoloTrainingUI();
  };
  soloVoiceRecognition.onspeechstart = function () {
    soloVoiceLastNativeAt = Date.now();
    setSoloVoiceStatus(
      "Ses algilandi. " +
        getSoloColorName(getSoloCurrentSide()) +
        " hamlesi bekleniyor...",
    );
    armSoloVoiceWatchdog();
  };
  soloVoiceRecognition.onspeechend = function () {
    armSoloVoiceWatchdog();
  };
  soloVoiceRecognition.onerror = function (event) {
    var error = event && event.error ? event.error : "bilinmiyor";
    if (soloVoiceWatchdogTimer) clearTimeout(soloVoiceWatchdogTimer);
    soloVoiceWatchdogTimer = null;
    if (error === "aborted" || error === "no-speech") {
      setSoloVoiceStatus(
        error === "aborted"
          ? "Dinleme yenileniyor..."
          : "Ses algilanmadi. " + getSoloVoiceReadyPrompt(),
      );
      return;
    }
    if (error === "not-allowed" || error === "service-not-allowed") {
      setSoloVoiceStatus(
        cloudConfigured
          ? "Tarayici izni yok, bulut yedek STT calisiyor..."
          : "Tarayici mikrofona izin vermedi.",
      );
      if (cloudConfigured) startSoloCloudFallback();
      syncSoloTrainingUI();
      return;
    }
    setSoloVoiceStatus("Ses hatasi: " + error);
  };
  soloVoiceRecognition.onend = function () {
    if (soloVoiceWatchdogTimer) clearTimeout(soloVoiceWatchdogTimer);
    soloVoiceWatchdogTimer = null;
    soloTrainingState.voiceListening = false;
    if (
      soloTrainingState.voiceEnabled &&
      window.currentViewId === "view-solo-training"
    ) {
      var delay = Math.max(
        100,
        Math.min(2000, soloTrainingState.voiceSettings.restartDelayMs || 450),
      );
      soloVoiceRestartTimer = setTimeout(startSoloVoiceControl, delay);
    } else if (!soloTrainingState.voiceEnabled) {
      setSoloVoiceStatus("Sesli hamle kapali.");
    }
    syncSoloTrainingUI();
  };
  soloVoiceRecognition.onresult = function (event) {
    soloVoiceLastNativeAt = Date.now();
    armSoloVoiceWatchdog();
    var alternatives = [];
    var liveText = "";
    for (
      var i = event.resultIndex || 0;
      event.results && i < event.results.length;
      i++
    ) {
      var result = event.results[i];
      if (!result || !result[0]) continue;
      if (!result.isFinal) {
        if (!liveText) liveText = String(result[0].transcript || "").trim();
        continue;
      }
      for (var j = 0; j < result.length; j++) {
        alternatives.push({
          transcript:
            result[j] && result[j].transcript ? result[j].transcript : "",
          confidence:
            result[j] && typeof result[j].confidence === "number"
              ? result[j].confidence
              : 0.75,
        });
      }
    }
    if (!alternatives.length && liveText) {
      setSoloVoiceStatus("Duyuluyor: " + liveText.slice(0, 48));
      return;
    }
    if (!alternatives.length) return;
    var picked = pickSoloVoiceParsedResult(alternatives);
    if (!picked) {
      var heard =
        alternatives[0] && alternatives[0].transcript
          ? alternatives[0].transcript
          : "";
      setSoloVoiceLastHeard(heard);
      setSoloVoiceStatus("Komut eslesmedi. " + getSoloVoiceReadyPrompt());
      return;
    }
    var confidenceText =
      typeof picked.confidence === "number"
        ? " (" + picked.confidence.toFixed(2) + ")"
        : "";
    setSoloVoiceStatus("Duyuldu: " + picked.transcript + confidenceText);
    setSoloVoiceLastHeard(picked.transcript);
    if (!isSoloVoiceDuplicateCommand(picked.transcript))
      handleSoloVoiceTranscript(picked.transcript, "native");
  };
  try {
    if (recognitionTrack) {
      soloVoiceRecognition.start(recognitionTrack);
      setSoloVoiceHint(
        soloTrainingState.voiceSettings.deviceId
          ? "Secili mikrofon dogrudan ses tanimaya baglandi."
          : "Varsayilan mikrofon dogrudan ses tanimaya baglandi.",
      );
    } else {
      soloVoiceRecognition.start();
      setSoloVoiceHint(
        "Tarayici kendi varsayilan mikrofonu ile dinliyor. Gerekirse Windows varsayilan mikrofonunu degistir.",
      );
    }
  } catch (e) {
    if (recognitionTrack) {
      try {
        soloVoiceRecognition.start();
        stopSoloVoiceRecognitionStream();
        setSoloVoiceHint(
          "Bu tarayici secili mikrofonu dogrudan desteklemedi; sistem varsayilan mikrofonuyla dinleniyor.",
        );
      } catch (fallbackError) {
        if (cloudConfigured) {
          stopSoloVoiceRecognitionStream();
          setSoloVoiceEngineText("Bulut");
          setSoloVoiceStatus("Tarayici baslatilamadi, bulut yedek STT aktif.");
          startSoloCloudFallback();
        } else {
          stopSoloVoiceRecognitionStream();
          setSoloVoiceStatus("Ses tanima baslatilamadi.");
          soloTrainingState.voiceEnabled = false;
          syncSoloTrainingUI();
        }
        return;
      }
    } else if (cloudConfigured) {
      stopSoloVoiceRecognitionStream();
      setSoloVoiceEngineText("Bulut");
      setSoloVoiceStatus("Tarayici baslatilamadi, bulut yedek STT aktif.");
      startSoloCloudFallback();
      return;
    } else {
      stopSoloVoiceRecognitionStream();
      setSoloVoiceStatus("Ses tanima baslatilamadi.");
      soloTrainingState.voiceEnabled = false;
      syncSoloTrainingUI();
      return;
    }
  }
  if (cloudConfigured) startSoloCloudFallback();
  syncSoloTrainingUI();
}

window.toggleSoloVoiceControl = function () {
  if (!isSoloTrainingAllowed()) return;
  soloTrainingState.voiceEnabled = !soloTrainingState.voiceEnabled;
  if (soloTrainingState.voiceEnabled) startSoloVoiceControl();
  else stopSoloVoiceControl();
  if (!soloTrainingState.voiceEnabled) {
    setSoloVoiceStatus("Sesli hamle kapali.");
    setSoloVoiceLastHeard("-");
  }
  syncSoloTrainingUI();
};

window.closeSoloTrainingMode = function () {
  soloTrainingState.voiceEnabled = false;
  stopSoloVoiceControl();
  stopSoloVoiceMeter();
  clearSoloAutoTimer();
  setSoloVoiceStatus("Sesli hamle kapali.");
  if (window.switchView) window.switchView("view-dashboard");
};

function isPromotionMoveForGame(game, from, to) {
  if (!game || !from || !to) return false;
  var piece = game.get(from);
  if (!piece || piece.type !== "p") return false;
  return (
    (piece.color === "w" && to[1] === "8") ||
    (piece.color === "b" && to[1] === "1")
  );
}

function chooseSoloPromotion(color) {
  return new Promise(function (resolve) {
    var overlay = document.createElement("div");
    overlay.className = "solo-promotion-overlay";
    var panel = document.createElement("div");
    panel.className = "solo-promotion-panel";
    var title = document.createElement("div");
    title.className = "solo-promotion-title";
    title.innerText = "Terfi taşını seç";
    panel.appendChild(title);
    ["q", "r", "b", "n"].forEach(function (type) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "solo-promotion-choice";
      btn.title = { q: "Vezir", r: "Kale", b: "Fil", n: "At" }[type];
      var piece = document.createElement("span");
      piece.className = "piece";
      if (window.applyPieceSkin) window.applyPieceSkin(piece, color, type);
      else
        piece.style.backgroundImage =
          "url('https://images.chesscomfiles.com/chess-themes/pieces/neo/150/" +
          color +
          type +
          ".png')";
      btn.appendChild(piece);
      btn.onclick = function () {
        overlay.remove();
        resolve(type);
      };
      panel.appendChild(btn);
    });
    overlay.onclick = function (event) {
      if (event.target === overlay) {
        overlay.remove();
        resolve(null);
      }
    };
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  });
}
window.chooseChessPromotion = chooseSoloPromotion;
window.isPromotionMoveForGame = isPromotionMoveForGame;

async function handleSoloTrainingSquareClick(squareName) {
  if (!isSoloTrainingAllowed()) return;
  if (isSoloGameOver()) return;

  if (
    soloTrainingValidMoves.indexOf(squareName) !== -1 &&
    soloTrainingSelectedSquare
  ) {
    var played = await playSoloTrainingMoveFromInput(
      soloTrainingSelectedSquare,
      squareName,
      null,
      { promptPromotion: true },
    );
    if (played) {
      return;
    }
  }

  var piece = soloTrainingChess.get(squareName);
  if (piece && piece.color === soloTrainingChess.turn()) {
    soloTrainingSelectedSquare = squareName;
    soloTrainingValidMoves = soloTrainingChess
      .moves({ square: squareName, verbose: true })
      .map(function (move) {
        return move.to;
      });
  } else {
    soloTrainingSelectedSquare = null;
    soloTrainingValidMoves = [];
  }
  drawSoloTrainingBoard();
}

window.undoSoloTrainingMove = function () {
  if (!isSoloTrainingAllowed()) return;
  clearSoloAutoTimer();
  clearSoloPreviewMarks();
  var undone = soloTrainingChess.undo();
  if (!undone) {
    syncSoloTrainingUI();
    return;
  }
  var undoneClassification = soloTrainingMoveClassifications.pop() || null;
  soloTrainingRedoStack.push({
    from: undone.from,
    to: undone.to,
    promotion: undone.promotion || undefined,
    classification: undoneClassification,
  });
  soloTrainingSelectedSquare = null;
  soloTrainingValidMoves = [];
  resetSoloEngineState("Bekleniyor");
  drawSoloTrainingBoard();
  syncSoloTrainingUI();
  refreshSoloTrainingStockfish(true);
};

window.redoSoloTrainingMove = function () {
  if (!isSoloTrainingAllowed() || !soloTrainingRedoStack.length) return;
  clearSoloAutoTimer();
  clearSoloPreviewMarks();
  var nextMove = soloTrainingRedoStack.pop();
  var played = soloTrainingChess.move({
    from: nextMove.from,
    to: nextMove.to,
    promotion: nextMove.promotion || "q",
  });
  if (!played) {
    syncSoloTrainingUI();
    return;
  }
  if (nextMove.classification) {
    soloTrainingMoveClassifications.push(nextMove.classification);
  } else {
    recordSoloMoveClassification(
      played,
      played.color === "w" ? "white" : "black",
      soloTrainingChess.fen(),
    );
  }
  soloTrainingSelectedSquare = null;
  soloTrainingValidMoves = [];
  resetSoloEngineState("Bekleniyor");
  drawSoloTrainingBoard();
  if (window.playChessMoveSound)
    window.playChessMoveSound(played, soloTrainingChess);
  else if (window.playGameSound) window.playGameSound("move");
  syncSoloTrainingUI();
  refreshSoloTrainingStockfish(true);
};

window.openSoloTrainingMode = function () {
  syncSoloTrainingAccess();
  if (!isSoloTrainingAllowed()) {
    if (window.showToast)
      window.showToast("Bu ozel mod yalnizca yetkili hesapta acilir.", "error");
    return;
  }
  if (window.releaseModeListeners) window.releaseModeListeners("solo");
  window.switchView("view-solo-training");
  if (!soloTrainingState.initialized) {
    soloTrainingState.initialized = true;
    resetSoloEngineState("Bekleniyor");
  }
  drawSoloTrainingBoard();
  syncSoloTrainingUI();
  refreshSoloVoiceDevices();
  refreshSoloCloudSttHealth();
  refreshSoloTrainingStockfish(false);
};

window.resetSoloTrainingGame = function () {
  if (!isSoloTrainingAllowed()) return;
  clearSoloAutoTimer();
  soloTrainingChess = new Chess();
  soloTrainingRedoStack = [];
  soloTrainingMoveClassifications = [];
  soloTrainingSelectedSquare = null;
  soloTrainingValidMoves = [];
  clearSoloPreviewMarks();
  resetSoloEngineState("Bekleniyor");
  soloTrainingState.initialized = true;
  drawSoloTrainingBoard();
  syncSoloTrainingUI();
  if (window.playGameSound) window.playGameSound("gameStart");
  refreshSoloTrainingStockfish(true);
};

window.flipSoloTrainingBoard = function () {
  soloTrainingBoardFlipped = !soloTrainingBoardFlipped;
  drawSoloTrainingBoard();
};

window.stopSoloTrainingLiveEngine = function () {
  soloTrainingState.requestToken += 1;
  clearSoloAutoTimer();
  clearSoloPreviewMarks();
};

setTimeout(syncSoloTrainingAccess, 0);

function update1v1Game(data) {
  if (data.pgn) chess1v1.load_pgn(data.pgn);
  else chess1v1.load(data.fen);
  if (data.status === "active")
    warmAnalysisCacheForActiveGame(
      "1v1",
      data.pgn || "",
      chess1v1.fen(),
      data.moveCount || 0,
    );
  maybeResolveReconnectForfeit("1v1", current1v1Id, data);
  updateSpectatorCountUI("1v1", data);
  renderReconnectBanner("1v1", data);
  maybeSchedule1v1BotMove(data);

  if (data.moveCount > lastPlayedMoveCount1v1) {
    if (lastPlayedMoveCount1v1 !== -1) {
      const flags = data.lastMoveFlags || "";
      if (window.playChessMoveSoundFromFlags)
        window.playChessMoveSoundFromFlags(
          flags,
          chess1v1,
          data.isCheck === true,
        );
      else window.playGameSound("move");
    }
    lastPlayedMoveCount1v1 = data.moveCount;
  } else if (data.moveCount === 0 && lastPlayedMoveCount1v1 !== 0) {
    lastPlayedMoveCount1v1 = 0;
  }

  if (game1v1TimerInterval) clearInterval(game1v1TimerInterval);
  if (data.status === "active") {
    game1v1TimerInterval = setInterval(function () {
      const now = Date.now();
      let whiteTime = data.whiteTime;
      let blackTime = data.blackTime;
      if (data.lastMoveTime) {
        const diff = now - data.lastMoveTime;
        if (chess1v1.turn() === "w") whiteTime = Math.max(0, whiteTime - diff);
        else blackTime = Math.max(0, blackTime - diff);
      }
      update1v1TimerDisplay(whiteTime, blackTime);
      if (whiteTime === 0 || blackTime === 0)
        handle1v1TimeOut(whiteTime === 0 ? "white" : "black");
    }, 100);
  } else {
    update1v1TimerDisplay(data.whiteTime, data.blackTime);
  }

  const turnTeam = chess1v1.turn() === "w" ? "white" : "black";
  const whitePlayer = data.players.find(function (player) {
    return player.team === "white";
  });
  const blackPlayer = data.players.find(function (player) {
    return player.team === "black";
  });
  document.getElementById("p1v1-white").querySelector("span").innerText =
    whitePlayer ? whitePlayer.name : "Beyaz";
  document.getElementById("p1v1-black").querySelector("span").innerText =
    blackPlayer ? blackPlayer.name : "Siyah";
  document.querySelectorAll("#p1v1-white, #p1v1-black").forEach(function (el) {
    el.classList.remove("active");
  });
  const activeTag = document.getElementById("p1v1-" + turnTeam);
  if (activeTag && data.status === "active") activeTag.classList.add("active");
  document.getElementById("turnIndicator1v1").innerText =
    data.status === "finished"
      ? "Oyun Bitti"
      : "Sıra: " +
        (
          (turnTeam === "white" ? whitePlayer : blackPlayer) || {
            name: "Oyuncu",
          }
        ).name;
  if (current1v1Role === "spectator" && data.status !== "finished") {
    document.getElementById("turnIndicator1v1").innerText =
      "Izleyici modu • " +
      document.getElementById("turnIndicator1v1").innerText;
  }

  lastRenderedLiveMoveCount1v1 = renderLiveMovePanel({
    chess: chess1v1,
    listId: "liveMoveList1v1",
    latestId: "liveLatestMove1v1",
    countId: "liveMoveCount1v1",
    statusId: "liveStatus1v1",
    statusText:
      data.status === "finished"
        ? "Mac tamamlandi"
        : current1v1Role === "spectator"
          ? "Izleyici modu"
          : "Canli oyun",
    lastRenderedCount: lastRenderedLiveMoveCount1v1,
  });
  announceSoloSyncInternalSourceSnapshot("render-1v1");

  draw1v1Board();
  refresh1v1TrainingAssist(data, false);
  if (window.syncBoardFullscreenUI) window.syncBoardFullscreenUI();
}

function render1v1BoardInto(boardEl) {
  if (!boardEl || !current1v1Data) return;
  boardEl.innerHTML = "";
  const myPlayer = current1v1Data.players.find(function (player) {
    return player.uid === window.currentUser.uid;
  });
  const rotate = myPlayer && myPlayer.team === "black";
  const isMyTurn =
    current1v1Data.status === "active" &&
    myPlayer &&
    myPlayer.team === (chess1v1.turn() === "w" ? "white" : "black");
  const boardArray = chess1v1.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const row = rotate ? 7 - r : r;
      const col = rotate ? 7 - c : c;
      const sq = boardArray[row][col];
      const squareName = String.fromCharCode(97 + col) + (8 - row);
      const div = document.createElement("div");
      div.className = "square " + ((r + c) % 2 === 0 ? "white" : "black");
      const history = chess1v1.history({ verbose: true });
      const lastMove = history.length ? history[history.length - 1] : null;
      if (
        lastMove &&
        (squareName === lastMove.from || squareName === lastMove.to)
      )
        div.classList.add("last-move");
      if (board1v1SelectedSquare === squareName) div.classList.add("selected");
      if (board1v1ValidMoves.includes(squareName))
        div.classList.add("highlight");

      if (c === 0) {
        const rankEl = document.createElement("span");
        rankEl.className = "coord coord-rank";
        rankEl.innerText = 8 - row;
        div.appendChild(rankEl);
      }
      if (r === 7) {
        const fileEl = document.createElement("span");
        fileEl.className = "coord coord-file";
        fileEl.innerText = String.fromCharCode(97 + col);
        div.appendChild(fileEl);
      }

      div.onclick = function () {
        handle1v1SquareClick(squareName, isMyTurn);
      };

      if (sq) {
        const piece = document.createElement("div");
        piece.className = "piece " + (isMyTurn ? "active" : "locked");
        if (window.applyPieceSkin)
          window.applyPieceSkin(piece, sq.color, sq.type);
        else
          piece.style.backgroundImage = `url('https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${sq.color}${sq.type}.png')`;
        div.appendChild(piece);
      }
      boardEl.appendChild(div);
    }
  }
}

function draw1v1Board() {
  render1v1BoardInto(document.getElementById("chessBoard1v1"));
  if (activeFullscreenBoardMode === "1v1") {
    render1v1BoardInto(document.getElementById("fullscreenBoard"));
  }
}
window.draw1v1Board = draw1v1Board;

function prepareFullscreenBoard() {
  const fsBoard = document.getElementById("fullscreenBoard");
  if (!fsBoard) return null;
  fsBoard.className = "board-container fullscreen-board";
  return fsBoard;
}

window.refreshFullscreenBoard = function () {
  if (!activeFullscreenBoardMode) return;
  const fsBoard = prepareFullscreenBoard();
  if (!fsBoard) return;

  if (activeFullscreenBoardMode === "1v1") {
    if (!current1v1Data) return;
    render1v1BoardInto(fsBoard);
    return;
  }

  if (activeFullscreenBoardMode === "2v2" && current2v2Data) {
    const movesPerTurn = current2v2Data.movesPerTurn || 5;
    const movesMadeByColor = Math.floor((current2v2Data.moveCount || 0) / 2);
    const activeIndex = Math.floor(movesMadeByColor / movesPerTurn) % 2;
    render2v2BoardInto(fsBoard, activeIndex, chess.turn());
  }
};

async function handle1v1SquareClick(squareName, isMyTurn) {
  if (!isMyTurn || current1v1Data.status !== "active") return;

  if (board1v1ValidMoves.includes(squareName)) {
    let promotion = "q";
    if (isPromotionMoveForGame(chess1v1, board1v1SelectedSquare, squareName)) {
      promotion = await chooseSoloPromotion(chess1v1.turn());
      if (!promotion) return;
    }
    const move = chess1v1.move({
      from: board1v1SelectedSquare,
      to: squareName,
      promotion: promotion,
    });
    if (move) {
      await commit1v1Move(move, current1v1Data);
      return;
    }
  }

  const piece = chess1v1.get(squareName);
  if (piece && piece.color === chess1v1.turn()) {
    board1v1SelectedSquare = squareName;
    board1v1ValidMoves = chess1v1
      .moves({ square: squareName, verbose: true })
      .map(function (move) {
        return move.to;
      });
  } else {
    board1v1SelectedSquare = null;
    board1v1ValidMoves = [];
  }
  draw1v1Board();
}

window.leave1v1GameConfirm = async () => {
  const result = await Swal.fire({
    title: "Oyundan Çık?",
    text: "Rakibin hükmen kazanabilir.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
  });
  if (result.isConfirmed) window.leave1v1Lobby();
};

window.load1v1History = async () => {
  document.getElementById("history1v1Modal").style.display = "flex";
  const list = document.getElementById("history1v1List");
  list.innerHTML = '<p style="text-align:center;">Yükleniyor...</p>';
  try {
    const snapshot = await getDocs(
      query(
        collection(db, "games_1v1"),
        where("participantIds", "array-contains", window.currentUser.uid),
      ),
    );
    const games = [];
    snapshot.forEach(function (docSnap) {
      if (docSnap.data().status === "finished") games.push(docSnap.data());
    });
    games.sort(function (a, b) {
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    if (!games.length) {
      list.innerHTML =
        '<p style="text-align:center; color:#888;">Henüz tamamlanmış 1v1 maçın yok.</p>';
      return;
    }

    list.innerHTML = "";
    games.forEach(function (game) {
      const myPlayer = game.players.find(function (player) {
        return player.uid === window.currentUser.uid;
      });
      if (!myPlayer) return;
      const opponent = game.players.find(function (player) {
        return player.uid && player.uid !== window.currentUser.uid;
      });
      const isWin = game.winner === myPlayer.team;
      const isDraw = game.winner === "draw";
      const resultColor = isWin
        ? "var(--success)"
        : isDraw
          ? "var(--text-muted)"
          : "var(--danger)";
      const resultText = isWin ? "KAZANDIN" : isDraw ? "BERABERE" : "KAYBETTİN";
      const safeGame = encodeURIComponent(JSON.stringify(game));
      const date = game.createdAt
        ? new Date(game.createdAt.seconds * 1000).toLocaleDateString()
        : "-";
      list.innerHTML += `
                <div class="history-item" style="border-left: 4px solid ${resultColor}">
                    <div>
                        <div style="font-weight:bold; color:${resultColor}">${resultText}</div>
                        <div style="font-size:0.8rem; color:#aaa;">${date} • Rakip: ${window.escapeHtml((opponent && opponent.name) || "Bilinmiyor")}</div>
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
    list.innerHTML =
      '<p style="text-align:center; color:var(--danger);">Bir hata oluştu.</p>';
  }
};

window.closeHistory1v1 = () =>
  (document.getElementById("history1v1Modal").style.display = "none");

window.create2v2Game = async () => {
  window.playGameSound("nav");
  const code = window.makeId(5);
  const gameData = {
    code: code,
    hostId: window.currentUser.uid,
    gameMode: "2v2",
    status: "lobby",
    timeControl: 10,
    movesPerTurn: 5,
    whiteTime: 600000,
    blackTime: 600000,
    lastMoveTime: null,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    pgn: "",
    moveCount: 0,
    players: [
      {
        uid: window.currentUser.uid,
        name: window.currentUser.displayName,
        avatar: window.currentUser.photoURL || "fa-chess-pawn",
        team: "white",
        index: 0,
        isReady: false,
      },
      {
        uid: null,
        name: "Boş",
        avatar: "fa-plus",
        team: "white",
        index: 1,
        isReady: false,
      },
      {
        uid: null,
        name: "Boş",
        avatar: "fa-plus",
        team: "black",
        index: 0,
        isReady: false,
      },
      {
        uid: null,
        name: "Boş",
        avatar: "fa-plus",
        team: "black",
        index: 1,
        isReady: false,
      },
    ],
    participantIds: [window.currentUser.uid],
    spectatorIds: [],
    disconnectState: {},
    winner: null,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, "games_2v2", code), gameData);
  window.enter2v2Game(code);
};

window.join2v2Prompt = async () => {
  window.playGameSound("nav");
  const { value: code } = await Swal.fire({
    title: "Oda Kodu",
    input: "text",
    inputPlaceholder: "Örn: X9Y2Z",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    confirmButtonColor: "#d4af37",
  });
  if (code) window.enter2v2Game(code.trim().toUpperCase());
};

window.enter2v2Game = (code) => {
  window.releaseModeListeners("2v2");
  current2v2Id = code;
  boardSelectedSquare = null;
  boardValidMoves = [];
  chess.reset();
  lastPlayedMoveCount = -1;
  lastRenderedLiveMoveCount2v2 = -1;
  if (window.unsubscribeChat) window.unsubscribeChat();

  unsubscribe2v2 = onSnapshot(doc(db, "games_2v2", code), (snap) => {
    if (!snap.exists()) {
      window.showToast("Oyun bulunamadı.", "error");
      window.leave2v2Lobby();
      return;
    }
    const d = snap.data();
    current2v2Data = d;
    current2v2Role = d.players.some(function (player) {
      return player.uid === window.currentUser.uid;
    })
      ? "player"
      : "spectator";
    syncSpectatorMembership("2v2", code, d, current2v2Role);
    syncGamePresence("2v2", code, d, current2v2Role);
    if (
      current2v2Role === "player" &&
      d.status === "active" &&
      !document.hidden
    )
      window.setCurrentReconnectState(true);

    if (d.status === "lobby") {
      render2v2Lobby(d);
      window.switchView("view-2v2-lobby");
    } else if (d.status === "active" || d.status === "finished") {
      update2v2Game(d);
      if (
        document
          .getElementById("view-2v2-game")
          .classList.contains("active") === false
      ) {
        window.switchView("view-2v2-game");
        if (lastPlayedMoveCount === -1) lastPlayedMoveCount = d.moveCount;
        drawBoard();
      }
      if (d.status === "finished" && current2v2Role === "player") {
        showGameOverModal(d);
      }
    }
  });
  window.initChat(code);
};

window.copy2v2Code = () => {
  navigator.clipboard
    .writeText(current2v2Id)
    .then(() => window.showToast("Oda kodu kopyalandı!", "success"));
};

window.leave2v2Lobby = async () => {
  if (unsubscribe2v2) unsubscribe2v2();
  if (window.unsubscribeChat) window.unsubscribeChat();
  if (gameTimerInterval) clearInterval(gameTimerInterval);
  lastRenderedLiveMoveCount2v2 = -1;
  if (
    current2v2Data &&
    current2v2Data.status === "active" &&
    current2v2Role === "player"
  )
    window.setCurrentReconnectState(false);
  removeSpectatorMembership(
    "2v2",
    current2v2Id,
    current2v2Data,
    current2v2Role,
  );

  if (current2v2Data && current2v2Data.status === "lobby") {
    const newPlayers = current2v2Data.players.map((p) => {
      if (p.uid === window.currentUser.uid)
        return {
          uid: null,
          name: "Boş",
          avatar: "fa-plus",
          team: p.team,
          index: p.index,
          isReady: false,
        };
      return p;
    });
    await updateDoc(doc(db, "games_2v2", current2v2Id), {
      players: newPlayers,
      participantIds: arrayRemove(window.currentUser.uid),
    });
  }
  current2v2Id = null;
  current2v2Data = null;
  current2v2Role = "player";
  window.switchView("view-dashboard");
};

function render2v2Lobby(d) {
  document.getElementById("lobby2v2Code").innerText = d.code;
  const isHost = d.hostId === window.currentUser.uid;
  document.getElementById("hostControls2v2").style.display = isHost
    ? "block"
    : "none";

  if (isHost) {
    document.getElementById("movesPerTurnSelect").value = d.movesPerTurn || 5;
    document.getElementById("timeControlSelect").value = d.timeControl || 10;
  }

  d.players.forEach((p) => {
    const el = document.getElementById(
      `slot-${p.team === "white" ? "w" : "b"}-${p.index}`,
    );
    el.className = `team-slot team-${p.team} ${p.uid ? "taken" : ""} ${p.isReady ? "ready" : ""}`;
    let html = "";
    if (p.uid) {
      html = `<span><i class="fas ${p.avatar || "fa-user"}"></i> ${window.escapeHtml(p.name)} ${p.uid === d.hostId ? "👑" : ""}</span> ${p.isReady ? '<i class="fas fa-check" style="color:var(--success)"></i>' : '<i class="fas fa-clock"></i>'}`;
      if (p.uid === window.currentUser.uid)
        html += ` <span style="font-size:0.7rem; color:var(--accent)">(Sen)</span>`;
    } else {
      html = `<span><i class="fas fa-plus"></i> Boş</span>`;
    }
    el.innerHTML = html;
    if (window.appendLobbyFriendButton)
      window.appendLobbyFriendButton(el, p.uid);
  });

  const mySlot = d.players.find((p) => p.uid === window.currentUser.uid);
  const btnReady = document.getElementById("btnReady2v2");
  if (mySlot) {
    btnReady.style.display = "block";
    btnReady.innerText = mySlot.isReady ? "HAZIRIM (BEKLENİYOR...)" : "HAZIRIM";
    btnReady.classList.toggle("secondary", mySlot.isReady);
  } else {
    btnReady.style.display = "none";
  }
}

window.joinTeam = async (team, index) => {
  window.playGameSound("nav");
  const d = current2v2Data;
  const target = d.players.find((p) => p.team === team && p.index === index);
  if (target.uid && target.uid !== window.currentUser.uid)
    return window.showToast("Bu koltuk dolu.", "error");

  let newPlayers = d.players.map((p) => {
    if (p.uid === window.currentUser.uid)
      return {
        uid: null,
        name: "Boş",
        avatar: "fa-plus",
        team: p.team,
        index: p.index,
        isReady: false,
      };
    return p;
  });

  newPlayers = newPlayers.map((p) => {
    if (p.team === team && p.index === index)
      return {
        ...p,
        uid: window.currentUser.uid,
        name: window.currentUser.displayName,
        avatar: window.currentUser.photoURL || "fa-chess-pawn",
        isReady: false,
      };
    return p;
  });

  await updateDoc(doc(db, "games_2v2", current2v2Id), {
    players: newPlayers,
    participantIds: arrayUnion(window.currentUser.uid),
  });
};

window.toggleReady2v2 = async () => {
  window.playGameSound("nav");
  const d = current2v2Data;
  const newPlayers = d.players.map((p) => {
    if (p.uid === window.currentUser.uid) return { ...p, isReady: !p.isReady };
    return p;
  });
  await updateDoc(doc(db, "games_2v2", current2v2Id), { players: newPlayers });
};

const updateGameSettings = async () => {
  const tc = parseInt(document.getElementById("timeControlSelect").value);
  const mpt = parseInt(document.getElementById("movesPerTurnSelect").value);
  await updateDoc(doc(db, "games_2v2", current2v2Id), {
    timeControl: tc,
    movesPerTurn: mpt,
  });
};
document.getElementById("timeControlSelect").onchange = updateGameSettings;
document.getElementById("movesPerTurnSelect").onchange = updateGameSettings;

window.start2v2Game = async () => {
  const d = current2v2Data;
  if (d.players.some((p) => !p.uid || !p.isReady))
    return window.showToast("Tüm oyuncular hazır olmalı!", "error");
  window.playGameSound("gameStart");
  const ms = d.timeControl * 60 * 1000;
  await updateDoc(doc(db, "games_2v2", current2v2Id), {
    status: "active",
    whiteTime: ms,
    blackTime: ms,
    lastMoveTime: Date.now(),
    moveCount: 0,
    winner: null,
    disconnectState: {},
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  });
};

function update2v2Game(d) {
  if (d.pgn) {
    chess.load_pgn(d.pgn);
  } else {
    chess.load(d.fen);
  }
  if (d.status === "active")
    warmAnalysisCacheForActiveGame(
      "2v2",
      d.pgn || "",
      chess.fen(),
      d.moveCount || 0,
    );
  maybeResolveReconnectForfeit("2v2", current2v2Id, d);
  updateSpectatorCountUI("2v2", d);
  renderReconnectBanner("2v2", d);

  if (d.moveCount > lastPlayedMoveCount) {
    if (lastPlayedMoveCount !== -1) {
      const flags = d.lastMoveFlags || "";
      if (window.playChessMoveSoundFromFlags)
        window.playChessMoveSoundFromFlags(flags, chess, d.isCheck === true);
      else window.playGameSound("move");
    }
    lastPlayedMoveCount = d.moveCount;
  } else if (d.moveCount === 0 && lastPlayedMoveCount !== 0) {
    lastPlayedMoveCount = 0;
  }

  if (gameTimerInterval) clearInterval(gameTimerInterval);
  if (d.status === "active") {
    gameTimerInterval = setInterval(() => {
      const now = Date.now();
      let wTime = d.whiteTime;
      let bTime = d.blackTime;

      if (d.lastMoveTime) {
        const diff = now - d.lastMoveTime;
        if (chess.turn() === "w") wTime = Math.max(0, wTime - diff);
        else bTime = Math.max(0, bTime - diff);
      }
      updateTimerDisplay(wTime, bTime);
      if (wTime === 0 || bTime === 0)
        handleTimeOut(wTime === 0 ? "white" : "black");
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
  document.getElementById("timerWhite").innerText = whiteText;
  document.getElementById("timerBlack").innerText = blackText;
  if (activeFullscreenBoardMode === "2v2" && window.syncFullscreenTimers)
    window.syncFullscreenTimers(whiteText, blackText);
}

async function handleTimeOut(loserColor) {
  if (
    current2v2Data.hostId === window.currentUser.uid &&
    current2v2Data.status === "active"
  ) {
    const winner = loserColor === "white" ? "black" : "white";
    await updateDoc(doc(db, "games_2v2", current2v2Id), {
      status: "finished",
      winner: winner,
    });
  }
}

function updatePlayerTags(idx, color, players, movesLeft) {
  document
    .querySelectorAll(".player-tag")
    .forEach((e) => e.classList.remove("active"));
  players.forEach((p) => {
    const el = document.getElementById(
      `p-${p.team === "white" ? "w" : "b"}-${p.index}`,
    );
    if (el) {
      el.querySelector("span").innerText = p.name;
      if (
        current2v2Data.status === "active" &&
        p.team === (color === "w" ? "white" : "black") &&
        p.index === idx
      ) {
        el.classList.add("active");
        document.getElementById("turnIndicator").innerText =
          `Sıra: ${p.name} (${movesLeft} hamle kaldı)`;
      }
    }
  });
  if (current2v2Data.status === "finished")
    document.getElementById("turnIndicator").innerText = "Oyun Bitti";
  if (current2v2Role === "spectator" && current2v2Data.status !== "finished") {
    document.getElementById("turnIndicator").innerText =
      "Izleyici modu • " + document.getElementById("turnIndicator").innerText;
  }

  lastRenderedLiveMoveCount2v2 = renderLiveMovePanel({
    chess: chess,
    listId: "liveMoveList2v2",
    latestId: "liveLatestMove2v2",
    countId: "liveMoveCount2v2",
    statusId: "liveStatus2v2",
    statusText:
      d.status === "finished"
        ? "Mac tamamlandi"
        : current2v2Role === "spectator"
          ? "Izleyici modu"
          : "Takim maçi canli",
    lastRenderedCount: lastRenderedLiveMoveCount2v2,
  });
  announceSoloSyncInternalSourceSnapshot("render-2v2");
}

function render2v2BoardInto(boardEl, activeIdx, turnColor) {
  if (!boardEl || !current2v2Data) return;
  boardEl.innerHTML = "";

  if (activeIdx === undefined || turnColor === undefined) {
    const movesPerTurn = current2v2Data.movesPerTurn || 5;
    const movesMadeByColor = Math.floor(current2v2Data.moveCount / 2);
    activeIdx = Math.floor(movesMadeByColor / movesPerTurn) % 2;
    turnColor = chess.turn();
  }

  const isWhiteTeam =
    current2v2Data.players.find((p) => p.uid === window.currentUser.uid)
      ?.team === "white";
  const rotate =
    !isWhiteTeam &&
    current2v2Data.players.find((p) => p.uid === window.currentUser.uid)
      ?.team === "black";

  const boardArray = chess.board();
  const myP = current2v2Data.players.find(
    (p) => p.uid === window.currentUser.uid,
  );

  const isMyTurn =
    myP &&
    myP.team === (turnColor === "w" ? "white" : "black") &&
    myP.index === activeIdx;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const row = rotate ? 7 - r : r;
      const col = rotate ? 7 - c : c;

      const sq = boardArray[row][col];
      const squareName = String.fromCharCode(97 + col) + (8 - row);

      const div = document.createElement("div");
      div.className = `square ${(r + c) % 2 === 0 ? "white" : "black"}`;
      const history = chess.history({ verbose: true });
      const lastMove = history.length ? history[history.length - 1] : null;
      if (
        lastMove &&
        (squareName === lastMove.from || squareName === lastMove.to)
      )
        div.classList.add("last-move");
      if (boardSelectedSquare === squareName) div.classList.add("selected");
      if (boardValidMoves.includes(squareName)) div.classList.add("highlight");

      if (c === 0) {
        const rankEl = document.createElement("span");
        rankEl.className = "coord coord-rank";
        rankEl.innerText = 8 - row;
        div.appendChild(rankEl);
      }
      if (r === 7) {
        const fileEl = document.createElement("span");
        fileEl.className = "coord coord-file";
        fileEl.innerText = String.fromCharCode(97 + col);
        div.appendChild(fileEl);
      }

      div.onclick = () => handleSquareClick(squareName, isMyTurn);

      if (sq) {
        const piece = document.createElement("div");
        piece.className = `piece ${isMyTurn ? "active" : "locked"}`;
        if (window.applyPieceSkin)
          window.applyPieceSkin(piece, sq.color, sq.type);
        else {
          const url = `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${sq.color}${sq.type}.png`;
          piece.style.backgroundImage = `url('${url}')`;
        }
        div.appendChild(piece);
      }

      boardEl.appendChild(div);
    }
  }
}

function drawBoard(activeIdx, turnColor) {
  render2v2BoardInto(
    document.getElementById("chessBoard"),
    activeIdx,
    turnColor,
  );
  if (activeFullscreenBoardMode === "2v2") {
    render2v2BoardInto(
      document.getElementById("fullscreenBoard"),
      activeIdx,
      turnColor,
    );
  }
}
window.drawBoard = drawBoard;

async function handleSquareClick(sq, isMyTurn) {
  if (!isMyTurn || current2v2Data.status !== "active") return;

  if (boardValidMoves.includes(sq)) {
    let promotion = "q";
    if (isPromotionMoveForGame(chess, boardSelectedSquare, sq)) {
      promotion = await chooseSoloPromotion(chess.turn());
      if (!promotion) return;
    }
    const move = chess.move({
      from: boardSelectedSquare,
      to: sq,
      promotion: promotion,
    });
    if (move) {
      const newFen = chess.fen();
      const now = Date.now();
      const timeDiff = now - current2v2Data.lastMoveTime;
      const isCheck = chess.in_check();

      if (window.playChessMoveSound) window.playChessMoveSound(move, chess);
      else window.playGameSound("move");

      // Set local flag to prevent double audio from Firebase listener
      lastPlayedMoveCount = current2v2Data.moveCount + 1;

      let updates = {
        fen: newFen,
        pgn: chess.pgn(), // Update PGN for Analysis
        lastMoveTime: now,
        moveCount: current2v2Data.moveCount + 1,
        lastMoveFlags: move.flags,
        isCheck: isCheck,
      };

      if (chess.turn() === "b") {
        updates.whiteTime = Math.max(0, current2v2Data.whiteTime - timeDiff);
      } else {
        updates.blackTime = Math.max(0, current2v2Data.blackTime - timeDiff);
      }

      if (chess.game_over()) {
        updates.status = "finished";
        if (chess.in_checkmate()) {
          updates.winner = chess.turn() === "w" ? "black" : "white";
        } else {
          updates.winner = "draw";
        }
      }

      boardSelectedSquare = null;
      boardValidMoves = [];
      drawBoard();
      warmAnalysisCacheForActiveGame(
        "2v2",
        updates.pgn,
        updates.fen,
        updates.moveCount,
      );

      await updateDoc(doc(db, "games_2v2", current2v2Id), updates);
      return;
    }
  }

  const piece = chess.get(sq);
  if (piece && piece.color === chess.turn()) {
    boardSelectedSquare = sq;
    boardValidMoves = chess
      .moves({ square: sq, verbose: true })
      .map((m) => m.to);
    drawBoard();
  } else {
    boardSelectedSquare = null;
    boardValidMoves = [];
    drawBoard();
  }
}

window.leave2v2GameConfirm = async () => {
  window.playGameSound("nav");
  const res = await Swal.fire({
    title: "Oyundan Çık?",
    text: "Takımın hükmen mağlup sayılabilir.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
  });
  if (res.isConfirmed) window.leave2v2Lobby();
};

window.load2v2History = async () => {
  window.playGameSound("nav");
  document.getElementById("history2v2Modal").style.display = "flex";
  const list = document.getElementById("history2v2List");
  list.innerHTML = '<p style="text-align:center;">Yükleniyor...</p>';
  try {
    const q = query(
      collection(db, "games_2v2"),
      where("participantIds", "array-contains", window.currentUser.uid),
    );
    const snap = await getDocs(q);
    list.innerHTML = "";
    if (snap.empty) {
      list.innerHTML =
        '<p style="text-align:center; color:#888;">Henüz maç oynanmadı.</p>';
      return;
    }
    let games = [];
    snap.forEach((d) => {
      if (d.data().status === "finished") games.push(d.data());
    });
    games.sort(
      (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
    );
    if (games.length === 0) {
      list.innerHTML =
        '<p style="text-align:center; color:#888;">Henüz tamamlanmış maç yok.</p>';
      return;
    }
    games.forEach((game) => {
      const myP = game.players.find((p) => p.uid === window.currentUser.uid);
      if (!myP) return;
      const isWin = game.winner === myP.team;
      const isDraw = game.winner === "draw";
      const resultColor = isWin
        ? "var(--success)"
        : isDraw
          ? "var(--text-muted)"
          : "var(--danger)";
      const resultText = isWin ? "KAZANDIN" : isDraw ? "BERABERE" : "KAYBETTİN";
      const partner =
        game.players.find(
          (p) => p.team === myP.team && p.uid !== window.currentUser.uid,
        )?.name || "Bilinmiyor";
      const date = game.createdAt
        ? new Date(game.createdAt.seconds * 1000).toLocaleDateString()
        : "-";

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
  } catch (e) {
    console.error(e);
    list.innerHTML =
      '<p style="text-align:center; color:var(--danger);">Bir hata oluştu.</p>';
  }
};
window.closeHistory2v2 = () =>
  (document.getElementById("history2v2Modal").style.display = "none");

function showGameOverModal(d) {
  if (document.getElementById("gameOverModal").style.display === "flex") return;
  if (activeFullscreenBoardMode && window.closeBoardFullscreen)
    window.closeBoardFullscreen();
  currentGameOverPayload = d;
  confetti({ particleCount: 200, spread: 150, origin: { y: 0.6 } });
  window.playGameSound("gameEnd");
  let winnerText = "";
  let winners = [];
  const is1v1 = d.gameMode === "1v1";
  if (d.winner === "draw") {
    winnerText = "BERABERE";
    winners = ["Dostluk Kazandı"];
  } else {
    winnerText =
      d.winner === "white"
        ? is1v1
          ? "KAZANAN: BEYAZ"
          : "KAZANAN: BEYAZ TAKIM"
        : is1v1
          ? "KAZANAN: SİYAH"
          : "KAZANAN: SİYAH TAKIM";
    winners = d.players.filter((p) => p.team === d.winner).map((p) => p.name);
  }
  document.getElementById("winnerText").innerText = winnerText;
  document.getElementById("winnerText").style.color =
    d.winner === "white" ? "#fff" : "#aaa";
  document.getElementById("winnerPlayers").innerText = winners.join(" & ");
  document.getElementById("gameOverModal").style.display = "flex";
}
window.closeGameOver = () => {
  document.getElementById("gameOverModal").style.display = "none";
  if (currentGameOverPayload && currentGameOverPayload.pgn) {
    if (window.openAnalysis)
      window.openAnalysis(
        currentGameOverPayload.pgn,
        currentGameOverPayload.players,
        currentGameOverPayload.fen || null,
      );
  } else if (
    currentGameOverPayload &&
    currentGameOverPayload.gameMode === "1v1"
  ) {
    window.leave1v1Lobby();
  } else {
    window.leave2v2Lobby();
  }
  currentGameOverPayload = null;
};

// --- Reconnection & Presence Helpers ---
function getGameCollectionName(mode) {
  return mode === "1v1" ? "games_1v1" : "games_2v2";
}

function getGameDocRef(mode, id) {
  return doc(db, getGameCollectionName(mode), id);
}

function getGameSpectatorCount(data) {
  return Array.isArray(data && data.spectatorIds)
    ? data.spectatorIds.length
    : 0;
}

function updateSpectatorCountUI(mode, data) {
  var count = String(getGameSpectatorCount(data));
  var ids =
    mode === "1v1"
      ? ["spectatorCount1v1Lobby", "spectatorCount1v1Game"]
      : ["spectatorCount2v2Lobby", "spectatorCount2v2Game"];
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.innerText = count;
  });
}

function getDisconnectedPlayers(data) {
  var disconnectState = Object.assign({}, (data && data.disconnectState) || {});
  return (Array.isArray(data && data.players) ? data.players : [])
    .filter(function (player) {
      return !!(player && player.uid && disconnectState[player.uid]);
    })
    .map(function (player) {
      var disconnectedAt = disconnectState[player.uid];
      return {
        player: player,
        disconnectedAt: disconnectedAt,
        remainingMs: Math.max(
          0,
          RECONNECT_GRACE_MS - (Date.now() - disconnectedAt),
        ),
      };
    });
}

function renderReconnectBanner(mode, data) {
  var ids =
    mode === "1v1"
      ? ["reconnectBanner1v1Lobby", "reconnectBanner1v1"]
      : ["reconnectBanner2v2Lobby", "reconnectBanner2v2"];
  var disconnected = getDisconnectedPlayers(data);
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!disconnected.length || data.status === "finished") {
      el.style.display = "none";
      el.innerText = "";
      return;
    }
    var message = disconnected
      .map(function (item) {
        var name = item.player.name || "Oyuncu";
        var left = Math.max(1, Math.ceil(item.remainingMs / 1000));
        return (
          name +
          " bağlantıyı kaybetti. " +
          left +
          " sn içinde dönmezse maç sonuçlanacak."
        );
      })
      .join(" ");
    el.innerText = message;
    el.style.display = "block";
  });
}

function maybeResolveReconnectForfeit(mode, gameId, data) {
  if (!data || data.status !== "active") return;
  var disconnected = getDisconnectedPlayers(data).filter(function (item) {
    return item.remainingMs <= 0;
  });
  if (!disconnected.length) return;
  if (!window.throttleAction("reconnect_forfeit", mode + ":" + gameId, 1, 1800))
    return;
  var winner = getReconnectWinnerFromPlayers(
    mode,
    disconnected.map(function (item) {
      return item.player;
    }),
  );
  updateDoc(getGameDocRef(mode, gameId), {
    status: "finished",
    winner: winner,
    finishReason: "disconnect",
    finishedAtMs: Date.now(),
  }).catch(function () {});
}

function getReconnectWinnerFromPlayers(mode, players) {
  if (!Array.isArray(players) || !players.length) return null;
  const getTeamOpponent = (team) => (team === "white" ? "black" : "white");
  if (mode === "1v1") {
    if (players.length >= 2) return "draw";
    return getTeamOpponent(players[0].team);
  }
  return getTeamOpponent(players[0].team);
}

function syncGamePresence(mode, code, data, role) {
  if (!data) return;
  updateSpectatorCountUI(mode, data);
  renderReconnectBanner(mode, data);
  var saved = window.readLocalActiveGame();
  if (role === "player" && data.status === "active") {
    var disconnectedAt =
      data.disconnectState && window.currentUser
        ? data.disconnectState[window.currentUser.uid]
        : null;
    if (disconnectedAt)
      window.markLocalActiveGameDisconnected(mode, code, disconnectedAt);
    else window.rememberLocalActiveGame(mode, code);
  } else if (saved && saved.mode === mode && saved.code === code)
    window.clearLocalActiveGame(mode);
  if (data.status === "finished") window.clearLocalActiveGame(mode);
  if (window.pushProfilePresence) window.pushProfilePresence();
}

function syncSpectatorMembership(mode, code, data, role) {
  if (!window.currentUser || !data) return;
  var spectatorIds = Array.isArray(data.spectatorIds)
    ? data.spectatorIds.slice()
    : [];
  var isSpectator = role === "spectator";
  var hasMe = spectatorIds.indexOf(window.currentUser.uid) !== -1;
  if (isSpectator && !hasMe) {
    updateDoc(getGameDocRef(mode, code), {
      spectatorIds: arrayUnion(window.currentUser.uid),
    }).catch(function () {});
  } else if (!isSpectator && hasMe) {
    updateDoc(getGameDocRef(mode, code), {
      spectatorIds: arrayRemove(window.currentUser.uid),
    }).catch(function () {});
  }
}

function removeSpectatorMembership(mode, code, data, role) {
  if (!window.currentUser || !code || role !== "spectator") return;
  var spectatorIds = Array.isArray(data && data.spectatorIds)
    ? data.spectatorIds
    : [];
  if (spectatorIds.indexOf(window.currentUser.uid) === -1) return;
  updateDoc(getGameDocRef(mode, code), {
    spectatorIds: arrayRemove(window.currentUser.uid),
  }).catch(function () {});
}

window.setCurrentReconnectState = (isConnected) => {
  var ctx = window.getCurrentReconnectContext();
  if (!ctx || !window.currentUser) return;
  var path = "disconnectState." + window.currentUser.uid;
  var updates = {};
  if (isConnected) {
    if (!(
      ctx.data.disconnectState &&
      ctx.data.disconnectState[window.currentUser.uid]
    ))
      return;
    updates[path] = deleteField();
    window.rememberLocalActiveGame(ctx.mode, ctx.id);
  } else {
    if (
      ctx.data.disconnectState &&
      ctx.data.disconnectState[window.currentUser.uid]
    )
      return;
    updates[path] = Date.now();
    window.markLocalActiveGameDisconnected(ctx.mode, ctx.id, updates[path]);
  }
  updateDoc(getGameDocRef(ctx.mode, ctx.id), updates).catch(function () {});
};

window.copySpectatorLink = function (mode) {
  var code =
    mode === "1v1"
      ? current1v1Data && (current1v1Data.code || current1v1Id)
      : current2v2Data && (current2v2Data.code || current2v2Id);
  if (!code) return window.showToast("Aktif oda kodu yok.", "error");
  var base = window.getAppBaseUrl
    ? window.getAppBaseUrl()
    : window.location.origin + window.location.pathname;
  var url =
    base +
    (base.indexOf("?") >= 0 ? "&" : "?") +
    "watchMode=" +
    encodeURIComponent(mode) +
    "&watchCode=" +
    encodeURIComponent(code);
  navigator.clipboard.writeText(url).then(function () {
    window.showToast("Izleyici linki kopyalandi.", "success");
  });
};

function parseChessComGameId(value) {
  var raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;
  var match = raw.match(/chess\.com\/(?:analysis\/game|game)\/live\/(\d+)/i);
  return match ? match[1] : null;
}

function parseChessComDateParts(value) {
  var match = String(value || "").match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (!match) return null;
  return { year: match[1], month: match[2] };
}

function buildChessArchiveCandidates(headers) {
  var seen = {};
  var candidates = [];
  [headers && headers.UTCDate, headers && headers.Date].forEach(
    function (item) {
      var parsed = parseChessComDateParts(item);
      if (!parsed) return;
      var key = parsed.year + "-" + parsed.month;
      if (seen[key]) return;
      seen[key] = true;
      candidates.push(parsed);
    },
  );
  return candidates;
}

function parseJsonFromLooseText(text) {
  if (!text) return null;
  var raw = String(text).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {}
  var start = raw.indexOf("{");
  var end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

async function fetchChessComCallbackGame(gameId) {
  var targetUrl =
    "https://www.chess.com/callback/live/game/" + encodeURIComponent(gameId);
  var proxyUrls = [
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(targetUrl),
    "https://r.jina.ai/http://" + targetUrl,
  ];

  for (var i = 0; i < proxyUrls.length; i++) {
    try {
      var response = await fetch(proxyUrls[i], { cache: "no-store" });
      if (!response.ok) continue;
      var payload = parseJsonFromLooseText(await response.text());
      if (payload && payload.game) return payload;
    } catch (e) {}
  }
  throw new Error("callback_unavailable");
}

async function fetchChessComArchive(username, year, month) {
  var url =
    "https://api.chess.com/pub/player/" +
    encodeURIComponent(String(username || "").toLowerCase()) +
    "/games/" +
    year +
    "/" +
    month;
  var response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("archive_unavailable");
  return response.json();
}

function findChessComArchiveGame(archivePayload, gameId) {
  var games = Array.isArray(archivePayload && archivePayload.games)
    ? archivePayload.games
    : [];
  var wanted = String(gameId);
  for (var i = 0; i < games.length; i++) {
    var game = games[i] || {};
    var url = String(game.url || "");
    var urlMatch = url.match(/\/game\/live\/(\d+)/i);
    if (urlMatch && urlMatch[1] === wanted) return game;
    if (String(game.pgn || "").indexOf("/game/live/" + wanted) !== -1)
      return game;
  }
  return null;
}

async function resolveChessComArchiveGame(metaPayload, gameId) {
  var headers =
    metaPayload && metaPayload.game ? metaPayload.game.pgnHeaders || {} : {};
  var players = [];
  if (headers.White) players.push(headers.White);
  if (headers.Black && headers.Black !== headers.White)
    players.push(headers.Black);

  var archiveDates = buildChessArchiveCandidates(headers);
  if (!players.length || !archiveDates.length)
    throw new Error("archive_lookup_unavailable");

  for (var i = 0; i < players.length; i++) {
    for (var j = 0; j < archiveDates.length; j++) {
      try {
        var archive = await fetchChessComArchive(
          players[i],
          archiveDates[j].year,
          archiveDates[j].month,
        );
        var matched = findChessComArchiveGame(archive, gameId);
        if (matched && matched.pgn) return matched;
      } catch (e) {}
    }
  }
  throw new Error("archive_game_not_found");
}

function buildImportedPlayers(game, metaPayload) {
  var headers =
    metaPayload && metaPayload.game ? metaPayload.game.pgnHeaders || {} : {};
  return [
    {
      team: "white",
      name:
        (game && game.white && game.white.username) || headers.White || "White",
      avatar: "fa-chess-king",
    },
    {
      team: "black",
      name:
        (game && game.black && game.black.username) || headers.Black || "Black",
      avatar: "fa-chess-queen",
    },
  ];
}

async function importChessComGameByUrl(inputValue) {
  var gameId = parseChessComGameId(inputValue);
  if (!gameId) throw new Error("invalid_link");

  var metaPayload = await fetchChessComCallbackGame(gameId);
  var archiveGame = await resolveChessComArchiveGame(metaPayload, gameId);
  if (!archiveGame || !archiveGame.pgn) throw new Error("pgn_missing");

  var importedPlayers = buildImportedPlayers(archiveGame, metaPayload);
  window.openAnalysis(
    archiveGame.pgn,
    importedPlayers,
    archiveGame.initial_setup || archiveGame.fen || null,
  );
  return importedPlayers;
}

window.openChessComImportPrompt = async function () {
  var result = await Swal.fire({
    title: "Chess.com Maçını İçe Aktar",
    input: "text",
    inputLabel: "Analiz linki veya oyun linki",
    inputPlaceholder:
      "https://www.chess.com/analysis/game/live/169528019640/analysis?flip=true",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    confirmButtonColor: "#0ea5e9",
    confirmButtonText: "ICE AKTAR",
    showCancelButton: true,
    cancelButtonText: "Iptal",
    inputValidator: function (value) {
      return parseChessComGameId(value)
        ? undefined
        : "Gecerli bir Chess.com canli mac linki gir.";
    },
  });
  if (!result.value) return;

  Swal.fire({
    title: "Mac aliniyor...",
    html: "Oyuncular, PGN ve analiz verisi hazirlaniyor.",
    allowOutsideClick: false,
    showConfirmButton: false,
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    didOpen: function () {
      Swal.showLoading();
    },
  });

  try {
    var importedPlayers = await importChessComGameByUrl(result.value);
    Swal.close();
    window.showToast(
      importedPlayers[0].name +
        " vs " +
        importedPlayers[1].name +
        " maci ice aktarildi.",
      "success",
    );
  } catch (error) {
    console.error(error);
    Swal.close();
    if (error && error.message === "invalid_link") {
      window.showToast("Chess.com linki anlasilamadi.", "error");
      return;
    }
    if (error && error.message === "archive_game_not_found") {
      window.showToast(
        "Mac bulundu ama Chess.com arsivinde PGN alinmadi.",
        "error",
      );
      return;
    }
    window.showToast(
      "Chess.com maci ice aktarilamadi. Linki kontrol edip tekrar dene.",
      "error",
    );
  }
};

window.watchLiveGamePrompt = async function () {
  var result = await Swal.fire({
    title: "Canli Izleme",
    html:
      '<select id="watchModeSelect" class="swal2-input" style="width:100%; background:#111827; color:#fff;">' +
      '<option value="2v2">2v2 Satranc</option>' +
      '<option value="1v1">1v1 Klasik</option>' +
      "</select>" +
      '<input id="watchCodeInput" class="swal2-input" placeholder="Oda kodu" style="text-transform:uppercase; letter-spacing:0.16em;">',
    showCancelButton: true,
    confirmButtonText: "IZLE",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    confirmButtonColor: "#0ea5e9",
    preConfirm: function () {
      return {
        mode: document.getElementById("watchModeSelect").value,
        code: window
          .sanitizeUserText(document.getElementById("watchCodeInput").value, 12)
          .toUpperCase(),
      };
    },
  });
  if (!result.value || !result.value.code) return;
  if (result.value.mode === "1v1") window.enter1v1Game(result.value.code);
  else window.enter2v2Game(result.value.code);
};

function getSavedReconnectRemainingMs(saved, data) {
  if (!window.currentUser) return 0;
  var disconnectedAt =
    data && data.disconnectState
      ? data.disconnectState[window.currentUser.uid]
      : null;
  if (!disconnectedAt && saved)
    disconnectedAt = saved.disconnectedAtMs || saved.ts || null;
  if (!disconnectedAt) return 0;
  return Math.max(0, disconnectedAt + RECONNECT_GRACE_MS - Date.now());
}

async function forfeitSavedActiveGame(saved, data, finishReason) {
  if (!saved || !saved.mode || !saved.code || !window.currentUser) return false;
  var latestData = data;
  if (!latestData) {
    var latestSnap = await getDoc(getGameDocRef(saved.mode, saved.code)).catch(
      function () {
        return null;
      },
    );
    if (!latestSnap || !latestSnap.exists()) {
      window.clearLocalActiveGame(saved.mode);
      return false;
    }
    latestData = latestSnap.data() || {};
  }
  if (latestData.status !== "active") {
    window.clearLocalActiveGame(saved.mode);
    return false;
  }
  var myPlayer = Array.isArray(latestData.players)
    ? latestData.players.find(function (player) {
        return player.uid === window.currentUser.uid;
      })
    : null;
  if (!myPlayer) {
    window.clearLocalActiveGame(saved.mode);
    return false;
  }
  var updated = true;
  await updateDoc(getGameDocRef(saved.mode, saved.code), {
    status: "finished",
    winner: getReconnectWinnerFromPlayers(saved.mode, [myPlayer]),
    finishReason: finishReason || "disconnect",
    finishedAtMs: Date.now(),
  }).catch(function () {
    updated = false;
  });
  if (!updated) return false;
  window.clearLocalActiveGame(saved.mode);
  return true;
}

window.tryReconnectFromDashboard = async function (isAuto) {
  const currentUser = window.currentUser;
  const currentViewId = window.currentViewId;
  if (
    !currentUser ||
    currentViewId !== "view-dashboard" ||
    window.getCurrentReconnectContext() ||
    current1v1Id ||
    current2v2Id
  )
    return false;
  var saved = window.readLocalActiveGame();
  if (!saved || !saved.mode || !saved.code) return false;
  if (saved.mode !== "1v1" && saved.mode !== "2v2") {
    window.clearLocalActiveGame();
    return false;
  }

  var promptKey = saved.mode + ":" + saved.code;
  if (reconnectPromptShownFor === promptKey) return false;
  reconnectPromptShownFor = promptKey;

  try {
    var gameSnap = await getDoc(getGameDocRef(saved.mode, saved.code)).catch(
      function () {
        return null;
      },
    );
    if (!gameSnap || !gameSnap.exists()) {
      window.clearLocalActiveGame(saved.mode);
      return false;
    }

    var data = gameSnap.data() || {};
    if (data.status !== "active") {
      window.clearLocalActiveGame(saved.mode);
      return false;
    }

    var myPlayer = Array.isArray(data.players)
      ? data.players.find(function (player) {
          return player.uid === currentUser.uid;
        })
      : null;
    if (!myPlayer) {
      window.clearLocalActiveGame(saved.mode);
      return false;
    }

    var remainingMs = getSavedReconnectRemainingMs(saved, data);
    if (remainingMs <= 0) {
      if (await forfeitSavedActiveGame(saved, data, "disconnect_timeout")) {
        window.showToast(
          "Yeniden bağlanma süresi doldu. Maç hükmen sonuçlandırıldı.",
          "warning",
        );
      }
      return false;
    }

    var remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    var result = await Swal.fire({
      title: "Aktif maç bulundu",
      html:
        '<div style="text-align:left; line-height:1.6;">' +
        "<div><strong>" +
        window.escapeHtml(window.getModeLabel(saved.mode)) +
        "</strong> maçın hâlâ aktif görünüyor.</div>" +
        '<div style="margin-top:10px; color:#facc15; font-weight:700;">' +
        remainingSeconds +
        " saniyelik reconnect suren kaldi.</div>" +
        '<div style="margin-top:10px; color:#cbd5f5;">Şimdi katılırsan oyuna devam edersin. Vazgeçersen hükmen mağlup sayılacaksın.</div>' +
        "</div>",
      icon: "warning",
      showDenyButton: true,
      showCancelButton: false,
      confirmButtonText: "Maca Katil",
      denyButtonText: "Hukmen Kaybet",
      allowOutsideClick: false,
      allowEscapeKey: false,
      background: "rgba(30,30,35,0.95)",
      color: "#fff",
      confirmButtonColor: "#d4af37",
      denyButtonColor: "#dc2626",
    });

    if (result.isConfirmed) {
      if (saved.mode === "1v1") window.enter1v1Game(saved.code);
      else window.enter2v2Game(saved.code);
      return true;
    }

    if (result.isDenied) {
      if (await forfeitSavedActiveGame(saved, data, "reconnect_declined")) {
        window.showToast("Maç hükmen sonuçlandırıldı.", "warning");
      } else {
        window.showToast("Mac sonucu guncellenemedi. Tekrar dene.", "error");
      }
    }

    return false;
  } finally {
    reconnectPromptShownFor = null;
  }
};

window.scheduleDashboardReconnectPrompt = () => {
  if (!window.currentUser || window.currentViewId !== "view-dashboard") return;
  setTimeout(function () {
    window.tryReconnectFromDashboard(true).catch(function () {});
  }, 120);
};

// --- QUIZ GAME LOGIC ---
function createEmptyQuizQuestion() {
  return {
    q: "",
    img: "",
    opts: ["", "", "", ""],
    correct: 0,
    time: 20,
    value: 0,
    type: "multiple",
  };
}

function normalizeQuizQuestion(raw) {
  const q = raw || {};
  const opts = Array.isArray(q.opts) ? q.opts.slice(0, 4) : ["", "", "", ""];
  while (opts.length < 4) opts.push("");
  return {
    q: String(q.q || ""),
    img: String(q.img || ""),
    opts: opts.map((o) => String(o || "")),
    correct: Math.max(0, Math.min(3, parseInt(q.correct, 10) || 0)),
    time: Math.max(5, Math.min(60, parseInt(q.time, 10) || 20)),
    value: normalizeQuizMoneyValue(q.value),
    type: String(q.type || "multiple"),
  };
}

function normalizeQuizMoneyValue(value) {
  const num =
    typeof value === "string"
      ? parseFloat(value.replace(",", ".").replace(/[^\d.]/g, ""))
      : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1000000, Math.round(num * 100) / 100));
}

function formatQuizMoney(value) {
  const amount = normalizeQuizMoneyValue(value);
  return amount.toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: amount % 1 ? 2 : 0,
  });
}

function escapeQuizAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getQuizLibraryFingerprint(q) {
  const normalized = normalizeQuizQuestion(q);
  return JSON.stringify({
    q: normalized.q,
    img: normalized.img,
    opts: normalized.opts,
    correct: normalized.correct,
    time: normalized.time,
    value: normalized.value,
    type: normalized.type,
  });
}

function normalizeQuizLibraryItem(raw, fallbackId) {
  const source = raw && raw.question ? raw.question : raw;
  const question = normalizeQuizQuestion(source);
  if (!question.q) return null;
  return {
    id: (raw && raw.id) || fallbackId || getQuizLibraryFingerprint(question),
    question: question,
  };
}

function normalizeQuizTest(raw) {
  const data = raw || {};
  const questions = Array.isArray(data.questions)
    ? data.questions
        .map(normalizeQuizQuestion)
        .filter(
          (q) =>
            q.q &&
            (q.type === "short"
              ? q.opts.some((o) => !!o)
              : !q.opts.some((o) => !o)),
        )
    : [];
  const totalValue = questions.reduce(
    (sum, q) => sum + normalizeQuizMoneyValue(q.value),
    0,
  );
  return {
    id: data.id || "",
    name:
      String(data.name || data.title || "Kayitli Test").trim() ||
      "Kayitli Test",
    questions: questions,
    questionCount: questions.length,
    totalValue: normalizeQuizMoneyValue(
      data.totalValue != null ? data.totalValue : totalValue,
    ),
    savedAtMs: Math.max(
      0,
      parseInt(data.savedAtMs || data.updatedAtMs || 0, 10) || 0,
    ),
  };
}

function getQuizTestFingerprint(test) {
  const normalized = normalizeQuizTest(test);
  return JSON.stringify({
    name: normalized.name.toLowerCase(),
    questions: normalized.questions.map(getQuizLibraryFingerprint),
  });
}

function normalizeQuizTestLibraryItem(raw, fallbackId) {
  const source = raw && raw.test ? raw.test : raw;
  const test = normalizeQuizTest(source);
  if (!test.questionCount) return null;
  test.id =
    (raw && raw.id) || test.id || fallbackId || getQuizTestFingerprint(test);
  return {
    id: test.id,
    test: test,
  };
}

function getLocalQuizTestLibraryKey(uid) {
  return "gm_quiz_test_library_" + String(uid || "guest");
}

function readLocalQuizTestLibrary(uid) {
  try {
    const raw = localStorage.getItem(getLocalQuizTestLibraryKey(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveLocalQuizTestLibraryItem(uid, test) {
  try {
    const item = normalizeQuizTestLibraryItem(
      { id: test.id, test: test },
      test.id,
    );
    if (!item) return false;
    const existing = readLocalQuizTestLibrary(uid)
      .map((entry, index) =>
        normalizeQuizTestLibraryItem(entry, "local-" + index),
      )
      .filter(Boolean);
    const next = [item]
      .concat(existing)
      .filter((entry, index, list) => {
        const key = getQuizTestFingerprint(entry.test);
        return (
          list.findIndex(
            (other) => getQuizTestFingerprint(other.test) === key,
          ) === index
        );
      })
      .slice(0, 60);
    localStorage.setItem(getLocalQuizTestLibraryKey(uid), JSON.stringify(next));
    return true;
  } catch (e) {
    console.warn("Local quiz test library save failed.", e);
    return false;
  }
}

window.startQuizBuilder = () => {
  const name = document.getElementById("newQuizName").value.trim();
  if (!name) return window.showToast("Lütfen bir quiz adı girin.", "error");
  quizBuilderQuestions = [];
  document.getElementById("builderQuizName").value = name;
  window.switchView("view-quiz-builder");
  updateBuilderUI();
};

window.addQuizQuestionUI = () => {
  quizBuilderQuestions.push(createEmptyQuizQuestion());
  updateBuilderUI();
  const targetDiv = document.getElementById(
    `quiz-builder-item-${quizBuilderQuestions.length - 1}`,
  );
  if (targetDiv)
    targetDiv.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.removeQuestion = (index) => {
  quizBuilderQuestions.splice(index, 1);
  updateBuilderUI();
};

function updateBuilderUI() {
  const container = document.getElementById("quizBuilderList");
  if (!container) return;
  container.innerHTML = "";

  const sidebar = document.getElementById("quizBuilderSidebar");
  const orderList = document.getElementById("quizBuilderOrderList");

  if (quizBuilderQuestions.length > 0) {
    if (sidebar) sidebar.style.display = "flex";
    if (orderList) {
      orderList.innerHTML = "";
      quizBuilderQuestions.forEach((q, idx) => {
        const item = document.createElement("div");
        item.className = "studio-slide-thumb";
        item.draggable = true;
        const qTitle = q.q
          ? q.q.length > 20
            ? q.q.substring(0, 20) + "..."
            : q.q
          : `Soru ${idx + 1}`;

        item.innerHTML = `
                    <div class="slide-num">${idx + 1}</div>
                    <div class="slide-content">
                        ${q.img ? `<img src="${q.img}" class="slide-mini-img">` : `<div class="slide-placeholder-img"><i class="fas fa-image"></i></div>`}
                        <div class="slide-text">${window.escapeHtml(qTitle)}</div>
                        <div class="slide-type-badge">${q.type === "short" ? "KISA CEVAP" : "TEST"}</div>
                    </div>
                `;
        item.title = q.q || `Soru ${idx + 1}`;

        item.addEventListener("click", () => {
          const targetDiv = document.getElementById(`quiz-builder-item-${idx}`);
          if (targetDiv) {
            targetDiv.scrollIntoView({ behavior: "smooth", block: "start" });
            // Highlight temporary
            targetDiv.style.boxShadow = "0 0 20px var(--quiz-color)";
            setTimeout(
              () => (targetDiv.style.boxShadow = "0 10px 30px rgba(0,0,0,0.2)"),
              1000,
            );
          }
        });

        item.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/plain", idx);
          item.classList.add("dragging");
        });
        item.addEventListener("dragend", () => {
          item.classList.remove("dragging");
        });
        item.addEventListener("dragover", (e) => {
          e.preventDefault();
        });
        item.addEventListener("drop", (e) => {
          e.preventDefault();
          const fromIdx = parseInt(e.dataTransfer.getData("text/plain"));
          if (fromIdx === idx || isNaN(fromIdx)) return;

          const movedItem = quizBuilderQuestions.splice(fromIdx, 1)[0];
          quizBuilderQuestions.splice(idx, 0, movedItem);
          updateBuilderUI();
        });

        orderList.appendChild(item);
      });
    }
  } else {
    if (sidebar) sidebar.style.display = "none";
    container.innerHTML = `<div style="text-align:center; padding:50px; color:rgba(255,255,255,0.5);">Henüz soru eklenmedi. Sol panelden yeni soru ekleyin.</div>`;
  }

  quizBuilderQuestions.forEach((q, idx) => {
    q = normalizeQuizQuestion(q);
    quizBuilderQuestions[idx] = q;

    const div = document.createElement("div");
    div.className = "studio-active-question-card";
    div.style.marginBottom = "30px";
    div.style.transition = "box-shadow 0.3s ease";
    div.id = `quiz-builder-item-${idx}`;
    div.innerHTML = `
            <div class="studio-question-header">
                <div class="studio-question-title">Soru ${idx + 1}</div>
                <div class="studio-question-actions">
                    <button class="icon-btn danger-text" onclick="removeQuestion(${idx})" title="Soruyu Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="icon-btn info-text" onclick="saveQuizQuestionToLibrary(${idx})" title="Kütüphaneye ekle">
                        <i class="fas fa-bookmark"></i>
                    </button>
                </div>
            </div>
            
            <div class="studio-question-body">
                <input type="text" class="studio-q-input" placeholder="Soru Metni Giriniz..." value="${escapeQuizAttr(q.q)}" oninput="updateQData(${idx}, 'q', this.value)">
                
                <div class="studio-media-upload">
                     ${q.img ? `<div class="media-success"><i class="fas fa-check-circle"></i> Resim Eklendi</div>` : `<div class="media-prompt"><i class="fas fa-cloud-upload-alt"></i> Medya Ekle (Opsiyonel)</div>`}
                     <input type="file" accept="image/png, image/jpeg" onchange="handleImageUpload(this, ${idx})">
                </div>
                <img src="${q.img}" class="q-img-preview studio-img-preview" id="preview-${idx}" onerror="this.style.display='none'">
                
                <div class="studio-options-grid">
                    ${
                      q.type === "short"
                        ? [0, 1, 2, 3]
                            .map(
                              (i) => `
                        <div class="studio-opt-box">
                            <input type="text" class="studio-opt-input correct"
                                placeholder="Kabul Edilen Cevap ${i + 1}"
                                value="${escapeQuizAttr(q.opts[i])}"
                                oninput="updateQData(${idx}, 'opt', this.value, ${i})">
                        </div>
                    `,
                            )
                            .join("")
                        : [0, 1, 2, 3]
                            .map(
                              (i) => `
                        <div class="studio-opt-box ${q.correct === i ? "is-correct" : ""}">
                            <input type="text" class="studio-opt-input"
                                placeholder="Seçenek ${["A", "B", "C", "D"][i]}"
                                value="${escapeQuizAttr(q.opts[i])}"
                                oninput="updateQData(${idx}, 'opt', this.value, ${i})">
                            <label class="studio-correct-radio">
                                <input type="radio" name="correct-${idx}" ${q.correct === i ? "checked" : ""}
                                    onclick="updateQData(${idx}, 'correct', ${i})" title="Doğru Cevap">
                                <span class="radio-mark"><i class="fas fa-check"></i></span>
                            </label>
                        </div>
                    `,
                            )
                            .join("")
                    }
                </div>
            </div>

            <div class="studio-question-footer">
                <div class="studio-setting-group">
                    <label>Soru Tipi</label>
                    <select onchange="updateQData(${idx}, 'type', this.value)">
                        <option value="multiple" ${q.type !== "short" ? "selected" : ""}>Çoktan Seçmeli</option>
                        <option value="short" ${q.type === "short" ? "selected" : ""}>Kısa Cevaplı</option>
                    </select>
                </div>
                <div class="studio-setting-group">
                    <label>Süre Sınırı (sn)</label>
                    <input type="number" min="5" max="60" value="${q.time}" onchange="updateQData(${idx}, 'time', this.value)">
                </div>
                <div class="studio-setting-group">
                    <label>Puan Değeri (TL)</label>
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <input type="number" min="0" step="0.01" value="${q.value}" onchange="updateQData(${idx}, 'value', this.value)">
                        <span class="quiz-value-preview" style="font-weight:bold; color:var(--success);">${formatQuizMoney(q.value)}</span>
                    </div>
                </div>
            </div>
        `;
    container.appendChild(div);
    if (q.img)
      document.getElementById(`preview-${idx}`).style.display = "block";
  });

  const sum = document.getElementById("builderSummary");
  if (sum) sum.innerText = `${quizBuilderQuestions.length}`;
}

window.handleImageUpload = (input, idx) => {
  if (input.files && input.files[0]) {
    if (input.files[0].size > 800000) {
      window.showToast("Resim boyutu çok büyük! (Max 800KB)", "error");
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      quizBuilderQuestions[idx].img = e.target.result;
      updateBuilderUI();
    };
    reader.readAsDataURL(input.files[0]);
  }
};

window.updateQData = (idx, field, val, subIdx = null) => {
  if (field === "q") quizBuilderQuestions[idx].q = val;
  if (field === "opt") quizBuilderQuestions[idx].opts[subIdx] = val;
  if (field === "correct") {
    quizBuilderQuestions[idx].correct = parseInt(val);
    updateBuilderUI();
  }
  if (field === "time") quizBuilderQuestions[idx].time = parseInt(val);
  if (field === "value")
    quizBuilderQuestions[idx].value = normalizeQuizMoneyValue(val);
  if (field === "type") {
    quizBuilderQuestions[idx].type = val;
    updateBuilderUI();
  }
};

window.saveQuizQuestionToLibrary = async (idx) => {
  if (!window.currentUser || !quizBuilderQuestions[idx]) return;
  const q = normalizeQuizQuestion(quizBuilderQuestions[idx]);
  if (!q.q) {
    window.showToast("Soru metnini doldur.", "error");
    return;
  }
  if (q.type === "short" && !q.opts.some((o) => !!o)) {
    window.showToast(
      "Kısa cevaplı soru için en az 1 kabul edilen cevap girmelisin.",
      "error",
    );
    return;
  } else if (q.type !== "short" && q.opts.some((o) => !o)) {
    window.showToast(
      "Kütüphaneye eklemek için soru ve seçenekleri doldur.",
      "error",
    );
    return;
  }
  const uid = window.currentUser.uid;
  try {
    await addDoc(collection(db, "users", uid, "quiz_question_library"), {
      question: q,
      createdAt: serverTimestamp(),
    });
    window.showToast("Soru kütüphaneye eklendi.", "success");
    quizQuestionLibraryCache = [];
  } catch (e) {
    console.warn(
      "Quiz library subcollection write failed, trying profile fallback.",
      e,
    );
    try {
      await setDoc(
        doc(db, "profiles", uid),
        {
          quizQuestionLibrary: arrayUnion({
            id: window.makeId ? window.makeId(10) : String(Date.now()),
            question: q,
            savedAtMs: Date.now(),
          }),
        },
        { merge: true },
      );
      window.showToast("Soru kütüphaneye eklendi.", "success");
      quizQuestionLibraryCache = [];
    } catch (fallbackError) {
      console.error(fallbackError);
      window.showToast("Soru kütüphaneye eklenemedi.", "error");
    }
  }
};

async function loadQuizQuestionLibrary() {
  if (!window.currentUser) return [];
  if (quizQuestionLibraryCache.length) return quizQuestionLibraryCache;
  const uid = window.currentUser.uid;
  const items = [];

  try {
    const snap = await getDocs(
      collection(db, "users", uid, "quiz_question_library"),
    );
    snap.docs.forEach((docSnap) => {
      const item = normalizeQuizLibraryItem(docSnap.data() || {}, docSnap.id);
      if (item) items.push(item);
    });
  } catch (e) {
    console.warn(
      "Quiz library subcollection read failed, using profile fallback.",
      e,
    );
  }

  try {
    const profileSnap = await getDoc(doc(db, "profiles", uid));
    const profileData = profileSnap.exists() ? profileSnap.data() || {} : {};
    const profileLibrary = Array.isArray(profileData.quizQuestionLibrary)
      ? profileData.quizQuestionLibrary
      : [];
    profileLibrary.forEach((entry, index) => {
      const item = normalizeQuizLibraryItem(
        entry,
        entry && entry.id ? entry.id : "profile-" + index,
      );
      if (item) items.push(item);
    });
  } catch (e) {
    console.warn("Quiz library profile fallback read failed.", e);
  }

  const seen = new Set();
  quizQuestionLibraryCache = items.filter((item) => {
    const key = getQuizLibraryFingerprint(item.question);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return quizQuestionLibraryCache;
}

window.switchQuizLibraryTab = (tab) => {
  document
    .getElementById("tabMyLibrary")
    .classList.toggle("active", tab === "my");
  document.getElementById("tabMyLibrary").style.borderBottomColor =
    tab === "my" ? "var(--quiz-color)" : "transparent";
  document.getElementById("tabMyLibrary").style.color =
    tab === "my" ? "#fff" : "#888";

  document
    .getElementById("tabCommunityLibrary")
    .classList.toggle("active", tab === "community");
  document.getElementById("tabCommunityLibrary").style.borderBottomColor =
    tab === "community" ? "var(--quiz-color)" : "transparent";
  document.getElementById("tabCommunityLibrary").style.color =
    tab === "community" ? "#fff" : "#888";

  document.getElementById("quizLibraryList").style.display =
    tab === "my" ? "block" : "none";
  document.getElementById("quizCommunityLibraryList").style.display =
    tab === "community" ? "block" : "none";

  if (tab === "community") {
    loadCommunityQuizQuestions();
  }
};

window.deleteQuizLibraryQuestion = async (index, docId) => {
  if (!window.currentUser) return;
  const result = await Swal.fire({
    title: "Emin misiniz?",
    text: "Bu soruyu kişisel kütüphanenizden silmek istediğinize emin misiniz?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "var(--danger)",
    cancelButtonColor: "var(--bg-light)",
    confirmButtonText: "Sil",
    cancelButtonText: "İptal",
    background: "#1b1d24",
    color: "#fff",
  });
  if (!result.isConfirmed) return;

  const uid = window.currentUser.uid;
  const item = quizQuestionLibraryCache[index];

  try {
    // 1. Delete from Firestore Subcollection if it's a valid ID
    if (docId && !docId.startsWith("profile-")) {
      await deleteDoc(doc(db, "users", uid, "quiz_question_library", docId));
    }

    // 2. Delete from Profiles document fallback
    try {
      const profileRef = doc(db, "profiles", uid);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        const profileData = profileSnap.data() || {};
        const profileLibrary = Array.isArray(profileData.quizQuestionLibrary)
          ? profileData.quizQuestionLibrary
          : [];

        const filteredLibrary = profileLibrary.filter((entry) => {
          const entryId = entry.id || (entry.question && entry.question.id);
          if (entryId && (entryId === docId || entryId === item?.id))
            return false;

          if (entry.question && item?.question) {
            return (
              getQuizLibraryFingerprint(entry.question) !==
              getQuizLibraryFingerprint(item.question)
            );
          }
          return true;
        });

        if (filteredLibrary.length !== profileLibrary.length) {
          await setDoc(
            profileRef,
            { quizQuestionLibrary: filteredLibrary },
            { merge: true },
          );
        }
      }
    } catch (pe) {
      console.warn("Could not delete from profile fallback:", pe);
    }

    window.showToast("Soru silindi.", "success");
    quizQuestionLibraryCache = []; // clear cache
    window.openQuizQuestionLibrary(); // reload
  } catch (e) {
    console.error(e);
    window.showToast("Silinirken hata oluştu.", "error");
  }
};

window.shareQuizLibraryQuestion = async (index) => {
  const item = quizQuestionLibraryCache[index];
  if (!item || !window.currentUser) return;
  try {
    const payload = {
      question: item.question,
      authorUid: window.currentUser.uid,
      authorName: window.currentUser.displayName || "Oyuncu",
      sharedAtMs: Date.now(),
    };
    await addDoc(collection(db, "community_quiz_library"), payload);
    window.showToast("Soru topluluğa paylaşıldı!", "success");
  } catch (e) {
    console.error(e);
    window.showToast("Paylaşılırken hata oluştu.", "error");
  }
};

window.removeCommunityQuestion = async (docId) => {
  const result = await Swal.fire({
    title: "Emin misiniz?",
    text: "Bu soruyu topluluktan kaldırmak istediğinize emin misiniz?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "var(--danger)",
    cancelButtonColor: "var(--bg-light)",
    confirmButtonText: "Kaldır",
    cancelButtonText: "İptal",
    background: "#1b1d24",
    color: "#fff",
  });
  if (!result.isConfirmed) return;
  try {
    await deleteDoc(doc(db, "community_quiz_library", docId));
    window.showToast("Soru topluluktan kaldırıldı.", "success");
    loadCommunityQuizQuestions();
  } catch (e) {
    console.error(e);
    window.showToast("Silinirken hata oluştu.", "error");
  }
};

let communityQuizLibraryCache = [];

async function loadCommunityQuizQuestions() {
  const list = document.getElementById("quizCommunityLibraryList");
  if (!list) return;
  list.innerHTML =
    '<div class="quiz-library-empty">Topluluk kütüphanesi yükleniyor...</div>';
  try {
    const q = query(
      collection(db, "community_quiz_library"),
      orderBy("sharedAtMs", "desc"),
    );
    const snap = await getDocs(q);
    communityQuizLibraryCache = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (!communityQuizLibraryCache.length) {
      list.innerHTML =
        '<div class="quiz-library-empty">Toplulukta henüz soru yok.</div>';
      return;
    }

    const myUid = window.currentUser ? window.currentUser.uid : null;

    list.innerHTML = communityQuizLibraryCache
      .map((item, i) => {
        const q = item.question;
        const isMine = myUid === item.authorUid;
        return (
          '<div class="quiz-library-item">' +
          (q.img
            ? '<img src="' + q.img + '" alt="">'
            : '<div class="quiz-library-icon"><i class="fas fa-users"></i></div>') +
          '<div class="quiz-library-copy">' +
          "<strong>" +
          window.escapeHtml(q.q) +
          "</strong>" +
          '<span style="color:#aaa; font-size:0.75rem;">Paylaşan: ' +
          window.escapeHtml(item.authorName) +
          "</span>" +
          "</div>" +
          '<div style="display:flex; flex-direction:column; gap:5px;">' +
          '<button class="secondary quiz-library-use-btn" onclick="useCommunityLibraryQuestion(' +
          i +
          ')" title="Quize Ekle"><i class="fas fa-plus"></i></button>' +
          '<button class="secondary quiz-library-use-btn" onclick="previewCommunityQuestion(' +
          i +
          ')" title="Önizle"><i class="fas fa-eye"></i></button>' +
          (isMine
            ? '<button class="secondary quiz-library-use-btn" onclick="removeCommunityQuestion(\'' +
              item.id +
              '\')" title="Topluluktan Kaldır" style="color:var(--danger);"><i class="fas fa-trash"></i></button>'
            : "") +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  } catch (e) {
    console.error(e);
    list.innerHTML =
      '<div class="quiz-library-empty">Kütüphane okunamadı.</div>';
  }
}

window.useCommunityLibraryQuestion = (index) => {
  const item = communityQuizLibraryCache[index];
  if (!item) return;
  quizBuilderQuestions.push(normalizeQuizQuestion(item.question));
  updateBuilderUI();
  window.showToast("Topluluk sorusu quize eklendi.", "success");
};

window.previewCommunityQuestion = (index) => {
  const item = communityQuizLibraryCache[index];
  if (!item) return;
  const q = item.question;
  let optsHtml = q.opts
    .map(
      (o, idx) =>
        `<div>${idx === q.correct ? "✅" : "❌"} ${window.escapeHtml(o)}</div>`,
    )
    .join("");
  Swal.fire({
    title: "Soru Önizleme",
    html: `
            <div style="text-align:left; font-size:0.9rem;">
                ${q.img ? `<img src="${q.img}" style="max-width:100%; border-radius:8px; margin-bottom:10px;">` : ""}
                <p><strong>${window.escapeHtml(q.q)}</strong></p>
                <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                    ${optsHtml}
                </div>
                <p style="margin-top:10px; font-size:0.8rem; color:#aaa;">Süre: ${q.time}sn | Puan: ${q.value}</p>
            </div>
        `,
    background: "#1b1d24",
    color: "#fff",
    confirmButtonColor: "var(--quiz-color)",
    confirmButtonText: "Kapat",
  });
};

window.openQuizQuestionLibrary = async () => {
  const panel = document.getElementById("quizLibraryPanel");
  const list = document.getElementById("quizLibraryList");
  if (!panel || !list) return;
  panel.style.display = "block";

  // Switch to My Library initially
  window.switchQuizLibraryTab("my");

  list.innerHTML =
    '<div class="quiz-library-empty">Kütüphane yükleniyor...</div>';
  try {
    const items = await loadQuizQuestionLibrary();
    if (!items.length) {
      list.innerHTML =
        '<div class="quiz-library-empty">Henüz kayıtlı soru yok. Sorunun yanındaki yer imi butonuyla ekleyebilirsin.</div>';
      return;
    }
    list.innerHTML = items
      .map((item, i) => {
        const q = item.question;
        return (
          '<div class="quiz-library-item">' +
          (q.img
            ? '<img src="' + q.img + '" alt="">'
            : '<div class="quiz-library-icon"><i class="fas fa-question"></i></div>') +
          '<div class="quiz-library-copy">' +
          "<strong>" +
          window.escapeHtml(q.q) +
          "</strong>" +
          "<span>" +
          q.opts
            .map((o, idx) =>
              window.escapeHtml((idx === q.correct ? "✓ " : "") + o),
            )
            .join(" • ") +
          "</span>" +
          "<small>" +
          q.time +
          " sn • " +
          formatQuizMoney(q.value) +
          "</small>" +
          "</div>" +
          '<div style="display:flex; flex-direction:column; gap:5px;">' +
          '<button class="secondary quiz-library-use-btn" onclick="useQuizLibraryQuestion(' +
          i +
          ')" title="Quize Ekle"><i class="fas fa-plus"></i></button>' +
          '<button class="secondary quiz-library-use-btn" onclick="shareQuizLibraryQuestion(' +
          i +
          ')" title="Topluluğa Paylaş"><i class="fas fa-share-alt"></i></button>' +
          '<button class="secondary quiz-library-use-btn" onclick="deleteQuizLibraryQuestion(' +
          i +
          ", '" +
          item.id +
          '\')" title="Sil" style="color:var(--danger);"><i class="fas fa-trash"></i></button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  } catch (e) {
    console.error(e);
    list.innerHTML =
      '<div class="quiz-library-empty">Kütüphane okunamadı.</div>';
  }
};

window.closeQuizQuestionLibrary = () => {
  const panel = document.getElementById("quizLibraryPanel");
  if (panel) panel.style.display = "none";
};

window.useQuizLibraryQuestion = (index) => {
  const item = quizQuestionLibraryCache[index];
  if (!item) return;
  quizBuilderQuestions.push(normalizeQuizQuestion(item.question));
  updateBuilderUI();
  window.showToast("Soru quize eklendi.", "success");
};

async function saveQuizTestToLibrary(name, questions, options = {}) {
  if (!window.currentUser) return false;

  // Check if test with same name already exists
  const existingLib = await loadQuizTestLibrary();
  const existingTest = existingLib.find(
    (t) =>
      t.test && t.test.name && t.test.name.toLowerCase() === name.toLowerCase(),
  );

  const testId =
    existingTest && existingTest.id
      ? existingTest.id
      : window.makeId
        ? window.makeId(10)
        : String(Date.now());

  const test = normalizeQuizTest({
    id: testId,
    name: name,
    questions: questions,
    savedAtMs: Date.now(),
  });
  if (!test.questionCount) return false;

  const uid = window.currentUser.uid;
  const payload = {
    id: test.id,
    name: test.name,
    questions: test.questions,
    questionCount: test.questionCount,
    totalValue: test.totalValue,
    savedAtMs: test.savedAtMs,
  };

  try {
    await setDoc(
      doc(db, "users", uid, "quiz_test_library", test.id),
      {
        test: payload,
        updatedAtMs: Date.now(),
        createdAt: existingTest
          ? existingTest.createdAt || serverTimestamp()
          : serverTimestamp(),
      },
      { merge: true },
    );
    quizTestLibraryCache = [];
    if (!options.silent)
      window.showToast(
        existingTest ? "Test güncellendi." : "Test kütüphaneye kaydedildi.",
        "success",
      );
    return true;
  } catch (e) {
    console.warn(
      "Quiz test library subcollection write failed, trying profile fallback.",
      e,
    );
    try {
      await setDoc(
        doc(db, "profiles", uid),
        {
          quizTestLibrary: arrayUnion({
            id: payload.id,
            test: payload,
            savedAtMs: payload.savedAtMs,
          }),
        },
        { merge: true },
      );
      quizTestLibraryCache = [];
      if (!options.silent)
        window.showToast("Test kütüphaneye kaydedildi.", "success");
      return true;
    } catch (fallbackError) {
      console.error(fallbackError);
      const localSaved = saveLocalQuizTestLibraryItem(uid, payload);
      if (localSaved) quizTestLibraryCache = [];
      if (!options.silent) {
        window.showToast(
          localSaved
            ? "Test bu cihaza kaydedildi."
            : "Test kütüphaneye kaydedilemedi.",
          localSaved ? "success" : "error",
        );
      }
      return localSaved;
    }
  }
}

window.manualSaveQuizTest = async () => {
  const name = document.getElementById("builderQuizName").value.trim();
  if (!name) return window.showToast("Lütfen bir quiz başlığı girin.", "error");
  if (quizBuilderQuestions.length === 0)
    return window.showToast("En az 1 soru eklemelisin!", "error");

  // Check validation of questions
  for (let i = 0; i < quizBuilderQuestions.length; i++) {
    const q = normalizeQuizQuestion(quizBuilderQuestions[i]);
    if (!q.q)
      return window.showToast(`${i + 1}. sorunun metni eksik!`, "error");
    if (q.type === "short") {
      if (!q.opts.some((o) => !!o))
        return window.showToast(
          `${i + 1}. sorunun en az 1 kabul edilen cevabı olmalı!`,
          "error",
        );
    } else {
      if (q.opts.some((o) => !o))
        return window.showToast(
          `${i + 1}. sorunun seçenekleri eksik!`,
          "error",
        );
    }
  }

  const saved = await saveQuizTestToLibrary(
    name,
    quizBuilderQuestions.map(normalizeQuizQuestion),
  );
  if (saved) {
    openQuizQuestionLibrary();
    switchQuizLibraryTab("my");
  }
};

async function loadQuizTestLibrary() {
  if (!window.currentUser) return [];
  if (quizTestLibraryCache.length) return quizTestLibraryCache;
  const uid = window.currentUser.uid;
  const items = [];

  try {
    const snap = await getDocs(
      collection(db, "users", uid, "quiz_test_library"),
    );
    snap.docs.forEach((docSnap) => {
      const item = normalizeQuizTestLibraryItem(
        docSnap.data() || {},
        docSnap.id,
      );
      if (item) items.push(item);
    });
  } catch (e) {
    console.warn(
      "Quiz test library subcollection read failed, using profile fallback.",
      e,
    );
  }

  try {
    const profileSnap = await getDoc(doc(db, "profiles", uid));
    const profileData = profileSnap.exists() ? profileSnap.data() || {} : {};
    const profileLibrary = Array.isArray(profileData.quizTestLibrary)
      ? profileData.quizTestLibrary
      : [];
    profileLibrary.forEach((entry, index) => {
      const item = normalizeQuizTestLibraryItem(
        entry,
        entry && entry.id ? entry.id : "profile-test-" + index,
      );
      if (item) items.push(item);
    });
  } catch (e) {
    console.warn("Quiz test library profile fallback read failed.", e);
  }

  readLocalQuizTestLibrary(uid).forEach((entry, index) => {
    const item = normalizeQuizTestLibraryItem(
      entry,
      entry && entry.id ? entry.id : "local-test-" + index,
    );
    if (item) items.push(item);
  });

  const seen = new Set();
  quizTestLibraryCache = items
    .filter((item) => {
      const key = getQuizTestFingerprint(item.test);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.test.savedAtMs || 0) - (a.test.savedAtMs || 0));
  return quizTestLibraryCache;
}

window.deleteQuizTestLibraryTest = async (index, docId) => {
  if (!window.currentUser) return;
  const result = await Swal.fire({
    title: "Emin misiniz?",
    text: "Bu testi silmek istediğinize emin misiniz?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "var(--danger)",
    cancelButtonColor: "var(--bg-light)",
    confirmButtonText: "Sil",
    cancelButtonText: "İptal",
    background: "#1b1d24",
    color: "#fff",
  });
  if (!result.isConfirmed) return;

  const uid = window.currentUser.uid;
  const item = quizTestLibraryCache[index];

  try {
    // 1. Delete from Firestore Subcollection if it's a valid ID
    if (docId && !docId.startsWith("profile-") && !docId.startsWith("local-")) {
      const qSnapshot = await getDocs(
        query(
          collection(db, "users", uid, "quiz_test_library"),
          where("test.id", "==", docId),
        ),
      );
      if (!qSnapshot.empty) {
        for (const d of qSnapshot.docs) {
          await deleteDoc(d.ref);
        }
      } else {
        await deleteDoc(doc(db, "users", uid, "quiz_test_library", docId));
      }
    }

    // 2. Delete from Profiles document fallback
    try {
      const profileRef = doc(db, "profiles", uid);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        const profileData = profileSnap.data() || {};
        const profileLibrary = Array.isArray(profileData.quizTestLibrary)
          ? profileData.quizTestLibrary
          : [];

        const filteredLibrary = profileLibrary.filter((entry) => {
          const entryId = entry.id || (entry.test && entry.test.id);
          if (entryId && (entryId === docId || entryId === item?.id))
            return false;

          if (entry.test && item?.test) {
            return (
              getQuizTestFingerprint(entry.test) !==
              getQuizTestFingerprint(item.test)
            );
          }
          return true;
        });

        if (filteredLibrary.length !== profileLibrary.length) {
          await setDoc(
            profileRef,
            { quizTestLibrary: filteredLibrary },
            { merge: true },
          );
        }
      }
    } catch (pe) {
      console.warn("Could not delete test from profile fallback:", pe);
    }

    // 3. Delete from Local Storage fallback
    try {
      const localExisting = readLocalQuizTestLibrary(uid);
      const filteredLocal = localExisting.filter((entry) => {
        const entryId = entry.id || (entry.test && entry.test.id);
        if (entryId && (entryId === docId || entryId === item?.id))
          return false;

        if (entry.test && item?.test) {
          return (
            getQuizTestFingerprint(entry.test) !==
            getQuizTestFingerprint(item.test)
          );
        }
        return true;
      });
      if (filteredLocal.length !== localExisting.length) {
        localStorage.setItem(
          getLocalQuizTestLibraryKey(uid),
          JSON.stringify(filteredLocal),
        );
      }
    } catch (le) {
      console.warn("Could not delete test from local storage:", le);
    }

    window.showToast("Test silindi.", "success");
    quizTestLibraryCache = []; // clear cache
    window.openQuizTestLibrary(); // reload
  } catch (e) {
    console.error(e);
    window.showToast("Silinirken hata oluştu.", "error");
  }
};

window.previewQuizTestLibraryTest = (index) => {
  const item = quizTestLibraryCache[index];
  if (!item) return;
  const questions = item.test.questions;
  let html =
    '<div style="text-align:left; max-height: 60vh; overflow-y:auto; padding-right:10px; font-size:0.9rem;">';
  questions.forEach((q, idx) => {
    const normalizedQ = normalizeQuizQuestion(q);
    let optsHtml = "";
    if (normalizedQ.type === "short") {
      const accepted = normalizedQ.opts.filter((o) => o);
      optsHtml =
        `<div style="color:#aaa; font-weight:bold; margin-bottom:5px;">Kabul Edilen Cevaplar:</div>` +
        accepted.map((o) => `<div>• ${window.escapeHtml(o)}</div>`).join("");
    } else {
      optsHtml = normalizedQ.opts
        .map(
          (o, i) =>
            `<div>${i === normalizedQ.correct ? "✅" : "❌"} ${window.escapeHtml(o)}</div>`,
        )
        .join("");
    }
    html += `
            <div style="margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;">
                <p><strong>${idx + 1}. ${window.escapeHtml(normalizedQ.q)} [${normalizedQ.type === "short" ? "Kısa Cevaplı" : "Çoktan Seçmeli"}]</strong></p>
                ${normalizedQ.img ? `<img src="${normalizedQ.img}" style="max-width:100%; max-height:150px; border-radius:8px; margin-bottom:10px;">` : ""}
                <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                    ${optsHtml}
                </div>
            </div>
        `;
  });
  html += "</div>";

  Swal.fire({
    title: window.escapeHtml(item.test.name),
    html: html,
    width: "600px",
    background: "#1b1d24",
    color: "#fff",
    confirmButtonColor: "var(--quiz-color)",
    confirmButtonText: "Kapat",
  });
};

window.openQuizTestLibrary = async () => {
  const panel = document.getElementById("quizTestLibraryPanel");
  const list = document.getElementById("quizTestLibraryList");
  if (!panel || !list) return;
  panel.style.display = "block";
  list.innerHTML =
    '<div class="quiz-library-empty">Test kütüphanesi yükleniyor...</div>';
  try {
    const items = await loadQuizTestLibrary();
    if (!items.length) {
      list.innerHTML =
        '<div class="quiz-library-empty">Henüz kayıtlı test yok. Bir quiz hazırlayıp lobi açtığında otomatik buraya kaydedilecek.</div>';
      return;
    }
    list.innerHTML = items
      .map((item, i) => {
        const test = item.test;
        const preview = test.questions
          .slice(0, 2)
          .map((q) => q.q)
          .join(" • ");
        return (
          '<div class="quiz-library-item quiz-test-library-item">' +
          '<div class="quiz-library-icon"><i class="fas fa-layer-group"></i></div>' +
          '<div class="quiz-library-copy">' +
          "<strong>" +
          window.escapeHtml(test.name) +
          "</strong>" +
          "<span>" +
          window.escapeHtml(preview || "Sorular hazır") +
          "</span>" +
          "<small>" +
          test.questionCount +
          " soru • Toplam " +
          formatQuizMoney(test.totalValue) +
          "</small>" +
          "</div>" +
          '<div style="display:flex; flex-direction:column; gap:5px;">' +
          '<button class="secondary quiz-library-use-btn" onclick="startQuizFromTestLibrary(' +
          i +
          ')" title="Lobi aç"><i class="fas fa-play"></i></button>' +
          '<button class="secondary quiz-library-use-btn" onclick="editQuizTestLibraryTest(' +
          i +
          ')" title="Düzenle"><i class="fas fa-edit"></i></button>' +
          '<button class="secondary quiz-library-use-btn" onclick="previewQuizTestLibraryTest(' +
          i +
          ')" title="Önizle"><i class="fas fa-eye"></i></button>' +
          '<button class="secondary quiz-library-use-btn" onclick="deleteQuizTestLibraryTest(' +
          i +
          ", '" +
          item.id +
          '\')" title="Sil" style="color:var(--danger);"><i class="fas fa-trash"></i></button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  } catch (e) {
    console.error(e);
    list.innerHTML =
      '<div class="quiz-library-empty">Test kütüphanesi okunamadı.</div>';
  }
};

window.closeQuizTestLibrary = () => {
  const panel = document.getElementById("quizTestLibraryPanel");
  if (panel) panel.style.display = "none";
};

window.editQuizTestLibraryTest = (index) => {
  const items = quizTestLibraryCache;
  if (!items || !items[index]) return;
  const item = items[index];

  quizBuilderQuestions = Array.from(item.test.questions).map(
    normalizeQuizQuestion,
  );
  document.getElementById("builderQuizName").value = item.test.name;
  document.getElementById("newQuizName").value = item.test.name;

  window.closeQuizTestLibrary();
  window.switchView("view-quiz-builder");
  updateBuilderUI();
};

function buildQuizLobbyData(name, questions, hostPlays) {
  const code = window.makeId(4);
  const initialPlayers = [];
  if (hostPlays) {
    initialPlayers.push({
      uid: window.currentUser.uid,
      name: window.currentUser.displayName,
      avatar: window.currentUser.photoURL,
      score: 0,
      moneyWon: 0,
      answers: {},
    });
  }
  return {
    code: code,
    name: name,
    hostId: window.currentUser.uid,
    status: "lobby",
    state: "waiting",
    currentQuestion: 0,
    questions: questions.map(normalizeQuizQuestion),
    players: initialPlayers,
    settings: {
      speedBonus: true,
      hostParticipate: hostPlays,
      autoNextQuestion: true,
    },
    createdAt: serverTimestamp(),
    startTime: null,
  };
}

window.startQuizFromTestLibrary = async (index) => {
  const item = quizTestLibraryCache[index];
  if (!item || !item.test || !item.test.questionCount) return;
  const test = normalizeQuizTest(item.test);
  const quizData = buildQuizLobbyData(test.name, test.questions, true);
  try {
    await setDoc(doc(db, "games_quiz", quizData.code), quizData);
    window.showToast("Test için yeni lobi açıldı.", "success");
    window.enterQuizGame(quizData.code);
  } catch (e) {
    console.error(e);
    window.showToast("Test lobisi açılamadı: " + e.message, "error");
  }
};

window.saveAndStartQuiz = async () => {
  if (quizBuilderQuestions.length === 0)
    return window.showToast("En az 1 soru eklemelisin!", "error");
  quizBuilderQuestions = quizBuilderQuestions.map(normalizeQuizQuestion);
  for (let i = 0; i < quizBuilderQuestions.length; i++) {
    const q = quizBuilderQuestions[i];
    if (!q.q)
      return window.showToast(`${i + 1}. sorunun metni eksik!`, "error");
    if (q.type === "short") {
      if (!q.opts.some((o) => !!o))
        return window.showToast(
          `${i + 1}. sorunun en az 1 kabul edilen cevabı olmalı!`,
          "error",
        );
    } else {
      if (q.opts.some((o) => !o))
        return window.showToast(
          `${i + 1}. sorunun seçenekleri eksik!`,
          "error",
        );
    }
  }

  const name =
    document.getElementById("builderQuizName").value.trim() ||
    document.getElementById("newQuizName").value.trim();
  const hostPlays = false;
  const quizData = buildQuizLobbyData(name, quizBuilderQuestions, hostPlays);

  try {
    await setDoc(doc(db, "games_quiz", quizData.code), quizData);
    saveQuizTestToLibrary(name, quizBuilderQuestions, { silent: true }).then(
      (saved) => {
        if (saved)
          window.showToast("Test kütüphaneye otomatik kaydedildi.", "success");
      },
    );
    window.enterQuizGame(quizData.code);
  } catch (e) {
    console.error(e);
    window.showToast("Hata oluştu: " + e.message, "error");
  }
};

window.joinQuizPrompt = async () => {
  const code = document
    .getElementById("quizJoinCode")
    .value.trim()
    .toUpperCase();
  if (!code) return window.showToast("Kod girin.", "error");
  window.enterQuizGame(code);
};

window.enterQuizGame = (code) => {
  window.releaseModeListeners("quiz");
  if (unsubscribeQuiz) unsubscribeQuiz();
  currentQuizId = code;
  lastQuizTimerRenderKey = null;
  quizForceNextProcessingKey = null;

  unsubscribeQuiz = onSnapshot(doc(db, "games_quiz", code), async (snap) => {
    if (!snap.exists()) {
      window.showToast("Quiz bulunamadı veya bitti.", "error");
      window.leaveQuizLobby();
      return;
    }
    const d = snap.data();
    currentQuizData = d;

    const myPlayer = d.players.find((p) => p.uid === window.currentUser.uid);

    if (
      d.hostId !== window.currentUser.uid &&
      !myPlayer &&
      d.status === "lobby"
    ) {
      const newPlayer = {
        uid: window.currentUser.uid,
        name: window.currentUser.displayName,
        avatar: window.currentUser.photoURL,
        score: 0,
        moneyWon: 0,
        answers: {},
      };
      const newPlayers = [...d.players, newPlayer];
      await updateDoc(doc(db, "games_quiz", code), { players: newPlayers });
      return;
    }

    if (
      d.hostId === window.currentUser.uid &&
      d.state === "question" &&
      d.status === "active"
    ) {
      const qIdx = d.currentQuestion;
      const answerCount = d.players.filter(
        (p) => p.answers && p.answers[qIdx],
      ).length;
      const activePlayerCount = d.players.length;

      if (activePlayerCount > 0 && answerCount === activePlayerCount) {
        setTimeout(() => window.quizForceNext(), 1000);
      }
    }

    if (d.status === "lobby") {
      renderQuizLobby(d);
      window.switchView("view-quiz-lobby");
    } else if (d.status === "active") {
      renderQuizGame(d);
      if (
        !document.getElementById("view-quiz-game").classList.contains("active")
      ) {
        window.switchView("view-quiz-game");
      }
    } else if (d.status === "finished") {
      renderQuizResults(d);
      window.switchView("view-quiz-end");
    }
  });
};

function renderQuizLobby(d) {
  document.getElementById("quizLobbyTitle").innerText = d.name;
  document.getElementById("quizCodeDisplay").innerText = d.code;
  document.getElementById("quizPlayerCount").innerText = d.players.length;

  const isHost = d.hostId === window.currentUser.uid;
  document.getElementById("quizHostControls").style.display = isHost
    ? "block"
    : "none";
  document.getElementById("quizWaitingMsg").style.display = isHost
    ? "none"
    : "block";

  if (isHost) {
    const settings = d.settings || {};
    document.getElementById("hostParticipateToggle").checked =
      settings.hostParticipate !== false;
    const autoNextToggle = document.getElementById("quizAutoNextToggle");
    if (autoNextToggle)
      autoNextToggle.checked = settings.autoNextQuestion !== false;
    const speedBonusToggle = document.getElementById("speedBonusToggle");
    if (speedBonusToggle)
      speedBonusToggle.checked = settings.speedBonus !== false;
  }

  const list = document.getElementById("quizPlayerList");
  if (!list) return;
  list.innerHTML = "";
  d.players.forEach((p) => {
    const el = document.createElement("div");
    el.className = `slot-item ${p.uid === window.currentUser.uid ? "me" : ""}`;
    el.innerHTML = `<div style="font-size:2rem; margin-bottom:5px;"><i class="fas ${p.avatar || "fa-user"}"></i></div>
                        <div style="font-weight:bold;">${p.name}</div>
                        <div style="font-size:0.8rem;">${p.score || 0} Puan • ${formatQuizMoney(p.moneyWon || 0)}</div>`;
    if (window.appendLobbyFriendButton)
      window.appendLobbyFriendButton(el, p.uid);
    list.appendChild(el);
  });
}

window.toggleQuizAutoNext = async (val) => {
  if (!currentQuizId) return;
  try {
    await updateDoc(doc(db, "games_quiz", currentQuizId), {
      "settings.autoNextQuestion": val,
    });
  } catch (e) {
    console.error(e);
  }
};

window.toggleQuizSpeedBonus = async (val) => {
  if (!currentQuizId) return;
  try {
    await updateDoc(doc(db, "games_quiz", currentQuizId), {
      "settings.speedBonus": val,
    });
  } catch (e) {
    console.error(e);
  }
};

window.toggleHostParticipation = async (shouldParticipate) => {
  if (!currentQuizData) return;
  let newPlayers = [...currentQuizData.players];

  if (shouldParticipate) {
    if (!newPlayers.find((p) => p.uid === window.currentUser.uid)) {
      newPlayers.push({
        uid: window.currentUser.uid,
        name: window.currentUser.displayName,
        avatar: window.currentUser.photoURL,
        score: 0,
        moneyWon: 0,
        answers: {},
      });
    }
  } else {
    newPlayers = newPlayers.filter((p) => p.uid !== window.currentUser.uid);
  }

  await updateDoc(doc(db, "games_quiz", currentQuizId), {
    players: newPlayers,
    "settings.hostParticipate": shouldParticipate,
  });
};

window.copyQuizCode = () => {
  navigator.clipboard.writeText(currentQuizId);
  window.showToast("Kod kopyalandı!", "success");
};
window.leaveQuizLobby = () => {
  if (unsubscribeQuiz) unsubscribeQuiz();
  if (localTimerAnim) {
    clearTimeout(localTimerAnim);
    localTimerAnim = null;
  }
  if (autoNextTimeout) {
    clearTimeout(autoNextTimeout);
    autoNextTimeout = null;
  }
  lastQuizTimerRenderKey = null;
  quizForceNextProcessingKey = null;
  currentQuizId = null;
  window.switchView("view-quiz-menu");
};

window.launchQuizGame = async () => {
  const bonus = document.getElementById("speedBonusToggle").checked;
  const autoNextToggle = document.getElementById("quizAutoNextToggle");
  const autoNextQuestion = autoNextToggle ? autoNextToggle.checked : true;
  await updateDoc(doc(db, "games_quiz", currentQuizId), {
    status: "active",
    state: "question",
    currentQuestion: 0,
    "settings.speedBonus": bonus,
    "settings.autoNextQuestion": autoNextQuestion,
    startTime: Date.now(),
  });
  window.playGameSound("gameStart");
};

let localTimerAnim = null;
let autoNextTimeout = null;
let lastQuizTimerRenderKey = null;
let quizForceNextProcessingKey = null;

function renderQuizGame(d) {
  const qIdx = d.currentQuestion;
  const qData = normalizeQuizQuestion(d.questions[qIdx]);
  const isHost = d.hostId === window.currentUser.uid;

  document.getElementById("quizQIndex").innerText =
    `Soru ${qIdx + 1} / ${d.questions.length}`;
  const myP = d.players.find((p) => p.uid === window.currentUser.uid);
  document.getElementById("quizScoreDisplay").innerText =
    (myP ? myP.score : 0) +
    " Puan • " +
    formatQuizMoney(myP ? myP.moneyWon || 0 : 0);

  document.getElementById("quizQuestionText").innerText = qData.q;
  const valueBadge = document.getElementById("quizQuestionValueBadge");
  if (valueBadge)
    valueBadge.innerText = "Soru Değeri: " + formatQuizMoney(qData.value || 0);
  const imgEl = document.getElementById("quizQuestionImg");
  if (qData.img) {
    imgEl.src = qData.img;
    imgEl.style.display = "block";
    imgEl.title = "Büyütmek için tıkla";
  } else {
    imgEl.style.display = "none";
  }

  if (isHost) {
    document.getElementById("quizHostGameControls").style.display = "block";
    document.getElementById("quizAnswerCount").innerText =
      `${d.players.filter((p) => p.answers && p.answers[qIdx]).length} / ${d.players.length} Cevap`;
  } else {
    document.getElementById("quizHostGameControls").style.display = "none";
  }

  if (d.state === "question") {
    document.getElementById("quizIntermission").style.display = "none";
    document.getElementById("quizResultMsg").style.display = "none";
    document.getElementById("autoNextTimer").style.display = "none";
    const manualNextBtn = document.getElementById("quizManualNextQuestionBtn");
    if (manualNextBtn) manualNextBtn.style.display = "none";

    const timerKey = `${currentQuizId || ""}:${qIdx}:${d.startTime || ""}`;
    if (quizForceNextProcessingKey && quizForceNextProcessingKey !== timerKey)
      quizForceNextProcessingKey = null;
    const el = document.getElementById("quizTimerFill");
    const questionMs = Math.max(5, parseInt(qData.time, 10) || 20) * 1000;
    const startMs = Number(d.startTime) || Date.now();
    const elapsedMs = Math.max(0, Date.now() - startMs);
    const remainingMs = Math.max(0, questionMs - elapsedMs);
    if (el && lastQuizTimerRenderKey !== timerKey) {
      lastQuizTimerRenderKey = timerKey;
      el.dataset.timerKey = timerKey;
      el.style.transition = "none";
      el.style.width =
        Math.max(0, Math.min(100, (remainingMs / questionMs) * 100)) + "%";

      setTimeout(() => {
        if (el.dataset.timerKey !== timerKey) return;
        el.style.transition = `width ${remainingMs / 1000}s linear`;
        el.style.width = "0%";
      }, 50);
    }

    const optsDiv = document.getElementById("quizOptionGrid");
    const shortAnsDiv = document.getElementById("quizShortAnswerContainer");
    const shortAnsInput = document.getElementById("quizShortAnswerInput");
    const shortAnsSubmit = document.getElementById("quizShortAnswerSubmit");

    if (qData.type === "short") {
      if (optsDiv) optsDiv.style.display = "none";
      if (shortAnsDiv) {
        shortAnsDiv.style.display = "block";
        shortAnsDiv.style.pointerEvents = "auto";
        shortAnsDiv.style.opacity = "1";
        if (shortAnsInput) {
          shortAnsInput.value = "";
          shortAnsInput.disabled = false;
        }
        if (shortAnsSubmit) {
          shortAnsSubmit.disabled = false;
          shortAnsSubmit.innerText = "CEVAPLA";
        }

        if (myP && myP.answers && myP.answers[qIdx]) {
          if (shortAnsInput) {
            shortAnsInput.value = myP.answers[qIdx].shortAnswer || "";
            shortAnsInput.disabled = true;
          }
          if (shortAnsSubmit) {
            shortAnsSubmit.disabled = true;
            shortAnsSubmit.innerText = "CEVAPLANDI";
          }
          shortAnsDiv.style.pointerEvents = "none";
        }
      }
    } else {
      if (shortAnsDiv) shortAnsDiv.style.display = "none";
      if (optsDiv) {
        optsDiv.style.display = "grid";
        optsDiv.style.pointerEvents = "auto";
        optsDiv.style.opacity = "1";

        [0, 1, 2, 3].forEach((i) => {
          const btn = optsDiv.children[i];
          if (btn) {
            btn.querySelector("span").innerText = qData.opts[i];
            btn.className = `quiz-btn opt-${i}`;

            if (myP && myP.answers && myP.answers[qIdx]) {
              if (myP.answers[qIdx].selected === i)
                btn.classList.add("selected");
              else btn.classList.add("disabled");
              optsDiv.style.pointerEvents = "none";
            }
          }
        });
      }
    }

    if (isHost && !localTimerAnim) {
      if (autoNextTimeout) clearTimeout(autoNextTimeout);

      localTimerAnim = setTimeout(() => {
        window.quizForceNext();
      }, remainingMs + 1000);
    }
  } else if (d.state === "reveal") {
    const tf = document.getElementById("quizTimerFill");
    if (tf) {
      tf.style.transition = "none";
      tf.style.width = "0%";
    }
    if (localTimerAnim) {
      clearTimeout(localTimerAnim);
      localTimerAnim = null;
    }

    document.getElementById("quizIntermission").style.display = "none";
    const manualNextBtn = document.getElementById("quizManualNextQuestionBtn");
    if (manualNextBtn) manualNextBtn.style.display = "none";

    const optsDiv = document.getElementById("quizOptionGrid");
    const shortAnsDiv = document.getElementById("quizShortAnswerContainer");

    if (qData.type === "short") {
      if (optsDiv) optsDiv.style.display = "none";
      if (shortAnsDiv) {
        shortAnsDiv.style.display = "block";
        shortAnsDiv.style.pointerEvents = "none";
        shortAnsDiv.style.opacity = "0.5";
      }
    } else {
      if (shortAnsDiv) shortAnsDiv.style.display = "none";
      if (optsDiv) {
        optsDiv.style.display = "grid";
        optsDiv.style.pointerEvents = "none";
        optsDiv.style.opacity = "1";
        [0, 1, 2, 3].forEach((i) => {
          const btn = optsDiv.children[i];
          if (btn) {
            btn.className = `quiz-btn opt-${i}`;
            if (i === qData.correct) {
              btn.classList.add("is-correct");
            } else {
              btn.classList.add("is-wrong");
            }
          }
        });
      }
    }

    const resDiv = document.getElementById("quizResultMsg");
    if (resDiv) {
      resDiv.style.display = "block";
      if (myP && myP.answers && myP.answers[qIdx]) {
        const ans = myP.answers[qIdx];
        let isCor = false;
        if (qData.type === "short") {
          const ua = String(ans.shortAnswer || "")
            .trim()
            .toLocaleLowerCase("tr-TR");
          isCor = qData.opts.some(
            (o) => o && String(o).trim().toLocaleLowerCase("tr-TR") === ua,
          );
          resDiv.innerHTML = isCor
            ? "DOĞRU! 🎉<br><span style='font-size:1rem;color:#ccc;'>Senin cevabın: " +
              window.escapeHtml(ans.shortAnswer) +
              "</span>"
            : "YANLIŞ... 😔<br><span style='font-size:1rem;color:#ccc;'>Senin cevabın: " +
              window.escapeHtml(ans.shortAnswer) +
              "<br>Kabul edilen cevaplar: " +
              qData.opts
                .filter((o) => o)
                .map((o) => window.escapeHtml(o))
                .join(", ") +
              "</span>";
        } else {
          isCor = ans.selected === qData.correct;
          resDiv.innerText = isCor ? "DOĞRU! 🎉" : "YANLIŞ... 😔";
        }
        resDiv.style.color = isCor ? "var(--success)" : "var(--danger)";
        if (isCor) {
          window.playGameSound("quizCorrect");
        } else {
          window.playGameSound("quizWrong");
        }
      } else {
        resDiv.innerText = myP ? "CEVAP VERMEDİN ⌛" : "İZLEYİCİ MODU";
        if (qData.type === "short") {
          resDiv.innerHTML +=
            "<br><span style='font-size:1rem;color:#ccc;'>Kabul edilen cevaplar: " +
            qData.opts
              .filter((o) => o)
              .map((o) => window.escapeHtml(o))
              .join(", ") +
            "</span>";
        }
        resDiv.style.color = "#aaa";
      }
    }

    if (isHost && !autoNextTimeout) {
      autoNextTimeout = setTimeout(() => {
        window.quizGoLeaderboard();
        autoNextTimeout = null;
      }, 3000);
    }
  } else if (d.state === "leaderboard") {
    document.getElementById("quizResultMsg").style.display = "none";
    document.getElementById("quizIntermission").style.display = "block";
    const optsDiv = document.getElementById("quizOptionGrid");
    const shortAnsDiv = document.getElementById("quizShortAnswerContainer");

    if (qData.type === "short") {
      if (optsDiv) optsDiv.style.display = "none";
      if (shortAnsDiv) {
        shortAnsDiv.style.display = "block";
        shortAnsDiv.style.opacity = "0.3";
        shortAnsDiv.style.pointerEvents = "none";
      }
    } else {
      if (shortAnsDiv) shortAnsDiv.style.display = "none";
      if (optsDiv) {
        optsDiv.style.display = "grid";
        optsDiv.style.opacity = "0.3";
        optsDiv.style.pointerEvents = "none";
      }
    }

    const autoNextQuestion =
      !d.settings || d.settings.autoNextQuestion !== false;
    const autoNextTimer = document.getElementById("autoNextTimer");
    if (autoNextTimer) {
      autoNextTimer.style.display = "block";
      autoNextTimer.innerText = autoNextQuestion
        ? "Sonraki soruya geçiliyor..."
        : "Yönetici sıradaki soruya geçecek...";
    }
    const manualNextBtn = document.getElementById("quizManualNextQuestionBtn");
    if (manualNextBtn)
      manualNextBtn.style.display =
        isHost && !autoNextQuestion ? "inline-flex" : "none";

    const sorted = [...d.players].sort((a, b) => b.score - a.score);
    const topList = document.getElementById("quizTopList");
    if (topList) {
      topList.innerHTML = sorted
        .map(
          (p, i) =>
            `<div class="quiz-live-rank" style="color:${p.uid === window.currentUser.uid ? "var(--quiz-color)" : "white"}; font-weight:${p.uid === window.currentUser.uid ? "bold" : "normal"}">
                    <span>${i === 0 ? "👑 " : ""}${i + 1}. ${window.escapeHtml(p.name || "Oyuncu")}</span>
                    <span><b>${p.score || 0} P</b><small>${formatQuizMoney(p.moneyWon || 0)}</small></span>
                 </div>`,
        )
        .join("");
    }

    if (isHost && autoNextQuestion && !autoNextTimeout) {
      autoNextTimeout = setTimeout(() => {
        window.quizNextQuestionReal();
        autoNextTimeout = null;
      }, 4000);
    } else if (!autoNextQuestion && autoNextTimeout) {
      clearTimeout(autoNextTimeout);
      autoNextTimeout = null;
    }
  }
}

window.submitQuizAnswer = async (optIdx) => {
  window.playGameSound("move");
  const qIdx = currentQuizData.currentQuestion;

  const optsDiv = document.getElementById("quizOptionGrid");
  if (optsDiv && optsDiv.children[optIdx]) {
    optsDiv.children[optIdx].classList.add("selected");
    optsDiv.style.pointerEvents = "none";
    for (let i = 0; i < 4; i++) {
      if (i !== optIdx && optsDiv.children[i])
        optsDiv.children[i].classList.add("disabled");
    }
  }

  const myIdx = currentQuizData.players.findIndex(
    (p) => p.uid === window.currentUser.uid,
  );
  if (myIdx === -1) return;

  const newPlayers = [...currentQuizData.players];
  if (!newPlayers[myIdx].answers) newPlayers[myIdx].answers = {};

  newPlayers[myIdx].answers[qIdx] = {
    selected: optIdx,
    time: Date.now(),
  };

  await updateDoc(doc(db, "games_quiz", currentQuizId), {
    players: newPlayers,
  });
};

window.submitQuizShortAnswer = async () => {
  const val = document.getElementById("quizShortAnswerInput").value.trim();
  if (!val) return;

  window.playGameSound("move");
  const qIdx = currentQuizData.currentQuestion;

  const shortAnsInput = document.getElementById("quizShortAnswerInput");
  const shortAnsSubmit = document.getElementById("quizShortAnswerSubmit");
  if (shortAnsInput) shortAnsInput.disabled = true;
  if (shortAnsSubmit) {
    shortAnsSubmit.disabled = true;
    shortAnsSubmit.innerText = "CEVAPLANDI";
  }
  const shortAnsDiv = document.getElementById("quizShortAnswerContainer");
  if (shortAnsDiv) shortAnsDiv.style.pointerEvents = "none";

  const myIdx = currentQuizData.players.findIndex(
    (p) => p.uid === window.currentUser.uid,
  );
  if (myIdx === -1) return;

  const newPlayers = [...currentQuizData.players];
  if (!newPlayers[myIdx].answers) newPlayers[myIdx].answers = {};

  newPlayers[myIdx].answers[qIdx] = {
    shortAnswer: val,
    time: Date.now(),
  };

  await updateDoc(doc(db, "games_quiz", currentQuizId), {
    players: newPlayers,
  });
};

window.quizForceNext = async () => {
  if (!currentQuizData || currentQuizData.hostId !== window.currentUser.uid)
    return;
  if (localTimerAnim) {
    clearTimeout(localTimerAnim);
    localTimerAnim = null;
  }

  if (currentQuizData.state === "question") {
    const qIdx = currentQuizData.currentQuestion;
    const processingKey = `${currentQuizId || ""}:${qIdx}:${currentQuizData.startTime || ""}`;
    if (quizForceNextProcessingKey === processingKey) return;
    quizForceNextProcessingKey = processingKey;
    const qData = normalizeQuizQuestion(currentQuizData.questions[qIdx]);
    const correctOpt = qData.correct;
    const questionValue = normalizeQuizMoneyValue(qData.value);
    const useBonus =
      !currentQuizData.settings ||
      currentQuizData.settings.speedBonus !== false;

    let updatedPlayers = currentQuizData.players.map((p) => {
      p.score = parseInt(p.score || 0, 10) || 0;
      p.moneyWon = normalizeQuizMoneyValue(p.moneyWon || 0);
      if (!p.answers || !p.answers[qIdx]) return p;
      const ans = p.answers[qIdx];

      let isCor = false;
      if (qData.type === "short") {
        const ua = String(ans.shortAnswer || "")
          .trim()
          .toLocaleLowerCase("tr-TR");
        isCor = qData.opts.some(
          (o) => o && String(o).trim().toLocaleLowerCase("tr-TR") === ua,
        );
      } else {
        isCor = ans.selected === correctOpt;
      }

      if (isCor) {
        p.score += 1;
        p.moneyWon = normalizeQuizMoneyValue((p.moneyWon || 0) + questionValue);
        p.isCorrect = true;
        p.ansTime = ans.time;
      } else {
        p.isCorrect = false;
      }
      return p;
    });

    if (useBonus) {
      const correctOnes = updatedPlayers.filter((p) => p.isCorrect);
      if (correctOnes.length > 0) {
        correctOnes.sort((a, b) => a.ansTime - b.ansTime);
        const fastestUID = correctOnes[0].uid;
        updatedPlayers = updatedPlayers.map((p) => {
          if (p.uid === fastestUID) p.score += 1;
          delete p.isCorrect;
          delete p.ansTime;
          return p;
        });
      }
    } else {
      updatedPlayers.forEach((p) => {
        delete p.isCorrect;
        delete p.ansTime;
      });
    }

    try {
      await updateDoc(doc(db, "games_quiz", currentQuizId), {
        state: "reveal",
        players: updatedPlayers,
      });
    } catch (e) {
      quizForceNextProcessingKey = null;
      throw e;
    }
  }
};

window.quizGoLeaderboard = async () => {
  await updateDoc(doc(db, "games_quiz", currentQuizId), {
    state: "leaderboard",
  });
};

window.quizNextQuestionReal = async () => {
  if (!currentQuizData || currentQuizData.hostId !== window.currentUser.uid)
    return;
  if (autoNextTimeout) {
    clearTimeout(autoNextTimeout);
    autoNextTimeout = null;
  }
  if (localTimerAnim) {
    clearTimeout(localTimerAnim);
    localTimerAnim = null;
  }
  lastQuizTimerRenderKey = null;
  quizForceNextProcessingKey = null;
  const nextIdx = currentQuizData.currentQuestion + 1;
  if (nextIdx >= currentQuizData.questions.length) {
    await updateDoc(doc(db, "games_quiz", currentQuizId), {
      status: "finished",
    });
  } else {
    await updateDoc(doc(db, "games_quiz", currentQuizId), {
      state: "question",
      currentQuestion: nextIdx,
      startTime: Date.now(),
    });
  }
};

function renderQuizResults(d) {
  confetti({ particleCount: 400, spread: 200, origin: { y: 0.6 } });
  window.playGameSound("gameEnd");

  const sorted = [...d.players].sort((a, b) => b.score - a.score);

  const p1 = sorted[0];
  const p2 = sorted[1];
  const p3 = sorted[2];
  [".podium-1", ".podium-2", ".podium-3"].forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) el.style.opacity = "1";
  });

  if (p1) {
    document.getElementById("name-1").innerText = p1.name;
    document.getElementById("score-1").innerText =
      (p1.score || 0) + " P • " + formatQuizMoney(p1.moneyWon || 0);
    document.getElementById("av-1").innerHTML =
      `<i class="fas ${p1.avatar || "fa-user"}"></i>`;
  }
  if (p2) {
    document.getElementById("name-2").innerText = p2.name;
    document.getElementById("score-2").innerText =
      (p2.score || 0) + " P • " + formatQuizMoney(p2.moneyWon || 0);
    document.getElementById("av-2").innerHTML =
      `<i class="fas ${p2.avatar || "fa-user"}"></i>`;
  } else {
    const el = document.querySelector(".podium-2");
    if (el) el.style.opacity = "0";
  }
  if (p3) {
    document.getElementById("name-3").innerText = p3.name;
    document.getElementById("score-3").innerText =
      (p3.score || 0) + " P • " + formatQuizMoney(p3.moneyWon || 0);
    document.getElementById("av-3").innerHTML =
      `<i class="fas ${p3.avatar || "fa-user"}"></i>`;
  } else {
    const el = document.querySelector(".podium-3");
    if (el) el.style.opacity = "0";
  }

  const tb = document.getElementById("quizFinalTableBody");
  if (tb) {
    tb.innerHTML = "";
    sorted.forEach((p, i) => {
      const row = `<tr>
                            <td>${i + 1}</td>
                            <td>${window.escapeHtml(p.name || "Oyuncu")}</td>
                            <td>${p.score || 0}</td>
                            <td>${formatQuizMoney(p.moneyWon || 0)}</td>
                          </tr>`;
      tb.innerHTML += row;
    });
  }
}

window.openQuizImageModal = (src) => {
  if (!src) return;
  const modal = document.getElementById("quizImageModal");
  const img = document.getElementById("quizImageModalImg");
  if (!modal || !img) return;
  img.src = src;
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
};

window.closeQuizImageModal = () => {
  const modal = document.getElementById("quizImageModal");
  const img = document.getElementById("quizImageModalImg");
  if (!modal || !img) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  img.src = "";
};

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.closeQuizImageModal();
});

// --- TOURNAMENT GAME LOGIC ---
window.enterTournament = (id) => {
  window.releaseModeListeners("tournament");
  window.playGameSound("nav");
  currentTournamentId = id;
  if (window.unsubscribeChat) window.unsubscribeChat();
  unsubscribeTournament = onSnapshot(doc(db, "tournaments", id), (snap) => {
    if (!snap.exists()) {
      window.showToast("Turnuva bulunamadı.", "error");
      window.leaveTournament();
      return;
    }
    const d = snap.data();
    currentTournamentData = d;
    d.id = snap.id;
    document.getElementById("rulesBtn").style.display = "flex";
    if (d.status === "finished" && previousMatchesStr !== "finished") {
      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.6 },
        colors: ["#d4af37", "#ffffff"],
      });
      Swal.fire({
        title: "Turnuva Bitti!",
        text: "Şampiyon belli oldu.",
        icon: "success",
        background: "rgba(30,30,35,0.95)",
        color: "#fff",
        confirmButtonColor: "#d4af37",
      });
    }
    const mStr = JSON.stringify(d.matches);
    if (
      previousMatchesStr &&
      previousMatchesStr !== mStr &&
      d.status === "active"
    )
      window.playGameSound("nav");
    previousMatchesStr = d.status === "finished" ? "finished" : mStr;

    if (d.status === "lobby") {
      renderLobby(d);
      window.switchView("view-lobby");
    } else {
      renderFixtures(d);
      renderStandings(d);
      window.switchView("view-tournament");
    }
  });
  window.initChat(id);
};

function renderLobby(d) {
  document.getElementById("lobbyTitle").innerText = d.name;
  document.getElementById("shareCode").innerText = d.id;
  const isAdmin = d.creatorId === window.currentUser.uid;
  document.getElementById("adminControls").style.display = isAdmin
    ? "block"
    : "none";
  document.getElementById("btnStartTournament").onclick = async () => {
    if (d.slots.some((s) => s.status === "taken")) {
      await updateDoc(doc(db, "tournaments", d.id), { status: "active" });
    } else {
      window.showToast("En az 1 oyuncu olmalı!", "error");
    }
  };

  const grid = document.getElementById("lobbySlots");
  if (!grid) return;
  grid.innerHTML = "";
  d.slots.forEach((slot) => {
    const isMe = slot.ownerId === window.currentUser.uid;
    const div = document.createElement("div");
    div.className = `slot-item ${slot.status === "taken" ? "taken" : ""} ${isMe ? "me" : ""}`;
    let html = "";
    if (slot.status === "open") {
      html = `<div style="font-size:2rem; color:var(--text-muted); margin-bottom:10px;"><i class="fas fa-chair"></i></div><div style="font-weight:bold; margin-bottom:10px;">${slot.name}</div><button onclick="takeSlot(${slot.index})" style="font-size:0.8rem;">OTUR</button>`;
    } else {
      html = `<div style="font-size:2rem; color:${isMe ? "var(--accent)" : "var(--primary)"}; margin-bottom:10px;"><i class="fas ${slot.avatar}"></i></div><div style="font-weight:bold; margin-bottom:5px;">${slot.name}</div>${isMe ? '<button class="leave-seat-btn" onclick="leaveSlot(' + slot.index + ')">KALK</button>' : ""}`;
      if (isAdmin && !isMe) {
        html += `<button class="kick-btn" onclick="kickPlayer(${slot.index})" title="Masadan Kaldır"><i class="fas fa-times"></i></button>`;
      }
    }
    div.innerHTML = html;
    if (window.appendLobbyFriendButton)
      window.appendLobbyFriendButton(div, slot.ownerId);
    grid.appendChild(div);
  });
}

window.takeSlot = async (index) => {
  window.playGameSound("nav");
  if (
    currentTournamentData.slots.some(
      (s) => s.ownerId === window.currentUser.uid,
    )
  )
    return window.showToast("Zaten bir masadasın!", "error");
  let slots = [...currentTournamentData.slots];
  slots[index] = {
    ...slots[index],
    ownerId: window.currentUser.uid,
    name: window.currentUser.displayName,
    avatar: window.currentUser.photoURL || "fa-chess-pawn",
    status: "taken",
  };
  await updateDoc(doc(db, "tournaments", currentTournamentId), {
    slots: slots,
    participantIds: arrayUnion(window.currentUser.uid),
  });
};
window.leaveSlot = async (index) => {
  window.playGameSound("nav");
  let slots = [...currentTournamentData.slots];
  slots[index] = {
    ...slots[index],
    ownerId: null,
    name: `Masa ${index + 1}`,
    avatar: "fa-chair",
    status: "open",
  };
  await updateDoc(doc(db, "tournaments", currentTournamentId), {
    slots: slots,
    participantIds: arrayRemove(window.currentUser.uid),
  });
};
window.kickPlayer = async (index) => {
  let slots = [...currentTournamentData.slots];
  const uidToRemove = slots[index].ownerId;
  slots[index] = {
    ...slots[index],
    ownerId: null,
    name: `Masa ${index + 1}`,
    avatar: "fa-chair",
    status: "open",
  };
  await updateDoc(doc(db, "tournaments", currentTournamentId), {
    slots: slots,
    participantIds: arrayRemove(uidToRemove),
  });
};

function renderFixtures(d) {
  document.getElementById("activeTournamentTitle").innerText = d.name;
  const isAdmin = d.creatorId === window.currentUser.uid;
  const isFin = d.status === "finished";
  document.getElementById("btnFinishTournament").style.display =
    isAdmin && !isFin ? "block" : "none";
  document.getElementById("btnAddMatchManual").style.display =
    isAdmin && !isFin ? "inline-block" : "none";
  document.getElementById("btnAutoFinish").style.display =
    isAdmin && !isFin ? "inline-block" : "none";
  const c = document.getElementById("fixturesList");
  if (!c) return;
  c.innerHTML = "";
  const emptyMsg = document.getElementById("noMatchesText");
  if (d.matches.length === 0) {
    if (emptyMsg) emptyMsg.style.display = "block";
    return;
  } else {
    if (emptyMsg) emptyMsg.style.display = "none";
  }
  const gr = {};
  d.matches.forEach((m) => {
    if (!gr[m.r]) gr[m.r] = [];
    gr[m.r].push(m);
  });
  Object.keys(gr)
    .sort((a, b) => a - b)
    .forEach((r) => {
      const div = document.createElement("div");
      div.innerHTML = `<div style="background:var(--glass-card); padding:8px; margin-bottom:5px; border-left:4px solid var(--primary); font-weight:bold; color:var(--text-main); font-size:0.9rem;">TUR ${r}</div>`;
      gr[r].forEach((m) => {
        const deleteBtn =
          isAdmin && !isFin
            ? `<i class="fas fa-trash del-match-btn" onclick="deleteMatch(${m.id})"></i>`
            : "";
        if (m.isBye) {
          const p1 = d.slots[m.p1];
          div.innerHTML += `<div class="match-card" style="opacity:0.6">${deleteBtn}<div class="match-player"><i class="fas ${p1.avatar}"></i> ${p1.name}</div><span style="font-weight:bold; color:var(--success); margin:0 10px;">BAY</span><div class="match-player right" style="color:var(--text-muted)">-</div></div>`;
          return;
        }
        const p1 = d.slots[m.p1],
          p2 = d.slots[m.p2];
        const isP1 = p1.ownerId === window.currentUser.uid,
          isP2 = p2.ownerId === window.currentUser.uid;
        const isDisputed = m.isDisputed === true;
        const disputeLink = m.disputeLink || "#";
        let canEdit = false;
        if (!isFin) {
          if (isAdmin) canEdit = true;
          else if ((isP1 || isP2) && !isDisputed) canEdit = true;
        }
        let objectBtn = "";
        if ((isP1 || isP2) && m.res !== null && !isDisputed && !isFin) {
          objectBtn = `<div class="object-btn" title="Sonuca İtiraz Et" onclick="objectToMatch(${m.id})"><i class="fas fa-flag"></i></div>`;
        }
        let disputeBadge = "";
        let cardClass = "match-card";
        if (isDisputed) {
          cardClass += " disputed";
          disputeBadge = `<a href="${disputeLink}" target="_blank" class="proof-link"><i class="fas fa-exclamation-triangle"></i> İTİRAZ (KANIT)</a>`;
        }
        let lnk = "";
        const watch = m.link
          ? `<a href="${m.link}" target="_blank" class="watch-btn"><i class="fas fa-eye"></i> İzle</a>`
          : "";
        const inp =
          (isP1 || isP2 || isAdmin) && !isFin
            ? `<input class="link-input" placeholder="Maç Linki (Lichess/Chess.com)..." value="${m.link || ""}" onchange="upLink(${m.id},this.value)">`
            : "";
        if (watch || inp) lnk = `<div class="link-area">${watch}${inp}</div>`;
        div.innerHTML += `<div class="${cardClass}">${deleteBtn} ${objectBtn}<div class="match-player ${isP1 ? "me" : ""}"><i class="fas ${p1.avatar}"></i> ${p1.name}</div><select class="score-select" ${canEdit ? "" : "disabled"} onchange="upMatch(${m.id},this.value)"><option value="">vs</option><option value="1" ${m.res === 1 ? "selected" : ""}>1 - 0</option><option value="0" ${m.res === 0 ? "selected" : ""}>½ - ½</option><option value="2" ${m.res === 2 ? "selected" : ""}>0 - 1</option></select><div class="match-player right ${isP2 ? "me" : ""}">${p2.name} <i class="fas ${p2.avatar}"></i></div>${disputeBadge} ${lnk}</div>`;
      });
      c.appendChild(div);
    });
}

window.upMatch = async (id, v) => {
  const isAdmin = currentTournamentData.creatorId === window.currentUser.uid;
  await updateDoc(doc(db, "tournaments", currentTournamentId), {
    matches: currentTournamentData.matches.map((m) => {
      if (m.id === id) {
        const newVal = v === "" ? null : parseInt(v);
        if (isAdmin)
          return { ...m, res: newVal, isDisputed: false, disputeLink: null };
        else return { ...m, res: newVal };
      }
      return m;
    }),
  });
};

window.upLink = async (id, v) => {
  await updateDoc(doc(db, "tournaments", currentTournamentId), {
    matches: currentTournamentData.matches.map((m) =>
      m.id === id ? { ...m, link: v.trim() } : m,
    ),
  });
};

function renderStandings(d) {
  const stats = d.slots.map((s, i) => ({
    ...s,
    idx: i,
    p: 0,
    w: 0,
    d: 0,
    l: 0,
    pts: 0,
    sb: 0,
  }));
  d.matches.forEach((m) => {
    if (m.res !== null) {
      if (m.isBye) {
        stats[m.p1].p++;
        stats[m.p1].w++;
        stats[m.p1].pts += 1;
      } else {
        stats[m.p1].p++;
        stats[m.p2].p++;
        if (m.res === 1) {
          stats[m.p1].w++;
          stats[m.p1].pts += 1;
          stats[m.p2].l++;
        } else if (m.res === 2) {
          stats[m.p2].w++;
          stats[m.p2].pts += 1;
          stats[m.p1].l++;
        } else {
          stats[m.p1].d++;
          stats[m.p1].pts += 0.5;
          stats[m.p2].d++;
          stats[m.p2].pts += 0.5;
        }
      }
    }
  });
  d.matches.forEach((m) => {
    if (m.res !== null && !m.isBye) {
      if (m.res === 1) stats[m.p1].sb += stats[m.p2].sb + stats[m.p2].pts;
      else if (m.res === 2) stats[m.p2].sb += stats[m.p1].pts;
      else {
        stats[m.p1].sb += 0.5 * stats[m.p2].pts;
        stats[m.p2].sb += 0.5 * stats[m.p1].pts;
      }
    }
  });
  stats.sort((a, b) => b.pts - a.pts || b.sb - a.sb || b.w - a.w);
  const b = document.getElementById("standingsBody");
  if (!b) return;
  b.innerHTML = "";
  const isFin = d.status === "finished";
  stats.forEach((s, rank) => {
    let rowClass = "";
    if (isFin) {
      if (rank === 0) rowClass = "rank-1";
    } else if (s.ownerId === window.currentUser.uid) rowClass = "me";
    const tr = document.createElement("tr");
    tr.className = rowClass;
    if (s.ownerId === window.currentUser.uid && !isFin)
      tr.style.background = "rgba(0, 242, 255, 0.1)";
    tr.innerHTML = `<td>${rank + 1}</td><td class="player-name-cell" onclick='showStats(${JSON.stringify(s)})' style="text-align:left;"><i class="fas ${s.avatar}"></i> ${s.name} ${rank === 0 && isFin ? "👑" : ""}</td><td style="font-weight:bold; color:var(--primary); font-size:1.1rem;">${s.pts}</td><td style="color:var(--text-muted); font-size:0.9rem;">${s.sb.toFixed(2)}</td><td>${s.p}</td><td style="color:var(--success)">${s.w}</td><td>${s.d}</td><td style="color:var(--danger)">${s.l}</td>`;
    b.appendChild(tr);
  });
}

window.downloadStandings = () => {
  const element = document.getElementById("standingsContainer");
  if (!element) return;
  const originalBg = element.style.background;
  element.style.background = "#1b1d24";
  html2canvas(element, { scale: 2, backgroundColor: "#1b1d24" }).then(
    (canvas) => {
      const link = document.createElement("a");
      link.download = `Grandmaster_Puan_${currentTournamentId}.png`;
      link.href = canvas.toDataURL();
      link.click();
      element.style.background = originalBg;
      window.showToast("Resim indirildi!", "success");
    },
  );
};

window.openRules = () => {
  window.playGameSound("nav");
  const isAdmin = currentTournamentData.creatorId === window.currentUser.uid;
  document.getElementById("rulesText").value =
    currentTournamentData.rules || "";
  document.getElementById("rulesReadOnly").innerText =
    currentTournamentData.rules || "Henüz kural eklenmedi.";
  document.getElementById("rulesText").style.display = isAdmin
    ? "block"
    : "none";
  document.getElementById("btnSaveRules").style.display = isAdmin
    ? "block"
    : "none";
  document.getElementById("rulesReadOnly").style.display = isAdmin
    ? "none"
    : "block";
  document.getElementById("rulesModal").style.display = "flex";
};

window.closeRules = () =>
  (document.getElementById("rulesModal").style.display = "none");

window.saveRules = async () => {
  const txt = document.getElementById("rulesText").value;
  await updateDoc(doc(db, "tournaments", currentTournamentId), { rules: txt });
  window.closeRules();
  window.showToast("Kurallar güncellendi", "success");
};

window.showStats = (s) => {
  window.playGameSound("nav");
  document.getElementById("modalAvatar").innerHTML =
    `<i class="fas ${s.avatar}"></i>`;
  document.getElementById("modalName").innerText = s.name;
  document.getElementById("statWins").innerText = s.w;
  document.getElementById("statDraws").innerText = s.d;
  document.getElementById("statLosses").innerText = s.l;
  document.getElementById("statPoints").innerText = s.pts;
  document.getElementById("statSB").innerText = s.sb.toFixed(2);
  const rate = s.p > 0 ? Math.round(((s.pts - s.d * 0.5) / s.p) * 100) : 0;
  document.getElementById("statRate").innerText = `%${rate}`;
  document.getElementById("statsModal").style.display = "flex";
};

window.closeStats = () =>
  (document.getElementById("statsModal").style.display = "none");

window.copyCode = () => {
  navigator.clipboard
    .writeText(document.getElementById("shareCode").innerText)
    .then(() => window.showToast("Kod kopyalandı!", "success"));
};

window.leaveTournamentConfirm = async () => {
  window.playGameSound("nav");
  const res = await Swal.fire({
    title: "Çıkış?",
    text: "Turnuva ekranından ayrılacaksın.",
    icon: "question",
    showCancelButton: true,
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    confirmButtonColor: "#555",
    cancelButtonColor: "#d33",
    confirmButtonText: "Evet, Çık",
    cancelButtonText: "Kal",
  });
  if (res.isConfirmed) window.leaveTournament();
};

window.leaveTournament = () => {
  if (unsubscribeTournament) unsubscribeTournament();
  if (window.unsubscribeChat) window.unsubscribeChat();
  currentTournamentId = null;
  window.hideChat();
  window.switchView("view-dashboard");
};

window.showTab = (t) => {
  window.playGameSound("nav");
  document.getElementById("tab-fixtures").style.display =
    t === "fixtures" ? "block" : "none";
  document.getElementById("tab-standings").style.display =
    t === "standings" ? "block" : "none";
};

window.fixParticipants = async () => {
  if (!currentTournamentId || !currentTournamentData) return;
  const res = await Swal.fire({
    title: "Listeyi Birleştir",
    text: "Masadaki oyuncular ile veritabanındaki mevcut liste birleştirilecek. Silinme olmayacak.",
    icon: "info",
    showCancelButton: true,
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    confirmButtonColor: "#d4af37",
  });
  if (!res.isConfirmed) return;
  let currentDBList = currentTournamentData.participantIds || [];
  let slotIds = currentTournamentData.slots
    .map((s) => s.ownerId)
    .filter((id) => id);
  if (currentTournamentData.creatorId)
    slotIds.push(currentTournamentData.creatorId);
  let mergedList = [...new Set([...currentDBList, ...slotIds])];
  try {
    await updateDoc(doc(db, "tournaments", currentTournamentId), {
      participantIds: mergedList,
    });
    window.showToast("Liste başarıyla birleştirildi!", "success");
  } catch (e) {
    console.error(e);
    window.showToast("Hata: " + e.message, "error");
  }
};

window.adminAddPlayer = async () => {
  if (!currentTournamentId || !currentTournamentData) return;
  const { value: uid } = await Swal.fire({
    title: "Kullanıcı UID",
    input: "text",
    inputLabel: "Firebase Authentication kısmındaki User UID",
    inputPlaceholder: "Örn: J8d9S...",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    confirmButtonColor: "#d4af37",
  });
  if (!uid) return;
  const { value: seatNum } = await Swal.fire({
    title: "Masa Numarası",
    input: "number",
    inputLabel: "Kaç numaralı masaya oturtulsun?",
    inputValue: 1,
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    confirmButtonColor: "#d4af37",
  });
  if (!seatNum) return;
  const index = parseInt(seatNum) - 1;
  const slots = [...currentTournamentData.slots];
  if (!slots[index]) {
    window.showToast("Geçersiz masa numarası!", "error");
    return;
  }
  const { value: name } = await Swal.fire({
    title: "Görünen İsim",
    input: "text",
    inputValue: "Oyuncu",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    confirmButtonColor: "#d4af37",
  });
  slots[index] = {
    index: index,
    name: name || "Oyuncu",
    ownerId: uid.trim(),
    avatar: "fa-user-secret",
    status: "taken",
  };
  try {
    await updateDoc(doc(db, "tournaments", currentTournamentId), {
      slots: slots,
      participantIds: arrayUnion(uid.trim()),
    });
    window.showToast("Oyuncu başarıyla masaya oturtuldu!", "success");
  } catch (e) {
    window.showToast("Hata: " + e.message, "error");
  }
};

window.addMatchManual = async () => {
  if (!currentTournamentId || !currentTournamentData) return;
  let options = {};
  currentTournamentData.slots.forEach((s) => {
    options[s.index] = s.name;
  });
  const htmlContent = `<div style="text-align:left;"><label>Tur Numarası:</label><input type="number" id="swal-round" class="swal2-input" value="1" min="1" style="width:100%; margin-bottom:10px;"><label>1. Oyuncu (Beyaz):</label><select id="swal-p1" class="swal2-input" style="width:100%; margin-bottom:10px; background:#333; color:#fff;">${Object.keys(
    options,
  )
    .map((k) => `<option value="${k}">${options[k]}</option>`)
    .join(
      "",
    )}</select><label>2. Oyuncu (Siyah):</label><select id="swal-p2" class="swal2-input" style="width:100%; background:#333; color:#fff;">${Object.keys(
    options,
  )
    .map((k) => `<option value="${k}">${options[k]}</option>`)
    .join("")}</select></div>`;
  const { value: formValues } = await Swal.fire({
    title: "Yeni Maç Ekle",
    html: htmlContent,
    showCancelButton: true,
    confirmButtonText: "EKLE",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    confirmButtonColor: "#d4af37",
    preConfirm: () => {
      return [
        document.getElementById("swal-round").value,
        document.getElementById("swal-p1").value,
        document.getElementById("swal-p2").value,
      ];
    },
  });
  if (formValues) {
    const r = parseInt(formValues[0]);
    const p1 = parseInt(formValues[1]);
    const p2 = parseInt(formValues[2]);
    if (p1 === p2) {
      window.showToast("Aynı oyuncuyu kendisine karşı seçemezsin!", "error");
      return;
    }
    const newMatch = {
      id: Date.now(),
      r: r,
      p1: p1,
      p2: p2,
      res: null,
      link: "",
      isBye: false,
    };
    await updateDoc(doc(db, "tournaments", currentTournamentId), {
      matches: arrayUnion(newMatch),
    });
    window.showToast("Maç eklendi!", "success");
  }
};

window.autoFinishFixture = async () => {
  if (!currentTournamentId || !currentTournamentData) return;
  const res = await Swal.fire({
    title: "Akıllı Tamamlama",
    text: "Sistem, çift devreli lig usulüne göre EKSİK kalan maçları hesaplayıp, en erken turlardaki boşlukları doldurarak yerleştirecek.",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "HESAPLA VE EKLE",
    confirmButtonColor: "#9b59b6",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
  });
  if (!res.isConfirmed) return;
  const slots = currentTournamentData.slots;
  const existingMatches = currentTournamentData.matches;
  const numPlayers = slots.length;
  let maxId = existingMatches.reduce(
    (max, match) => Math.max(max, match.id),
    0,
  );
  let neededMatches = [];
  for (let i = 0; i < numPlayers; i++) {
    for (let j = 0; j < numPlayers; j++) {
      if (i !== j) {
        const exists = existingMatches.some((m) => m.p1 === i && m.p2 === j);
        if (!exists) {
          neededMatches.push({ p1: i, p2: j });
        }
      }
    }
  }
  if (neededMatches.length === 0) {
    window.showToast("Fikstür zaten eksiksiz.", "info");
    return;
  }
  let roundOccupancy = {};
  existingMatches.forEach((m) => {
    if (!roundOccupancy[m.r]) roundOccupancy[m.r] = new Set();
    if (!m.isBye) {
      roundOccupancy[m.r].add(m.p1);
      roundOccupancy[m.r].add(m.p2);
    }
  });
  let newMatches = [];
  neededMatches.sort(() => Math.random() - 0.5);
  neededMatches.forEach((match) => {
    let assignedRound = 1;
    while (true) {
      if (!roundOccupancy[assignedRound])
        roundOccupancy[assignedRound] = new Set();
      let p1Busy = roundOccupancy[assignedRound].has(match.p1);
      let p2Busy = roundOccupancy[assignedRound].has(match.p2);
      if (!p1Busy && !p2Busy) {
        roundOccupancy[assignedRound].add(match.p1);
        roundOccupancy[assignedRound].add(match.p2);
        newMatches.push({
          id: ++maxId,
          r: assignedRound,
          p1: match.p1,
          p2: match.p2,
          res: null,
          link: "",
          isBye: false,
        });
        break;
      } else {
        assignedRound++;
      }
    }
  });
  try {
    const finalMatches = [...existingMatches, ...newMatches];
    finalMatches.sort((a, b) => a.r - b.r || a.id - b.id);
    await updateDoc(doc(db, "tournaments", currentTournamentId), {
      matches: finalMatches,
    });
    window.showToast(
      `${newMatches.length} adet maç başarıyla planlandı!`,
      "success",
    );
  } catch (e) {
    console.error(e);
    window.showToast("Hata: " + e.message, "error");
  }
};

window.deleteMatch = async (matchId) => {
  if (!currentTournamentId || !currentTournamentData) return;
  const res = await Swal.fire({
    title: "Maçı Sil?",
    text: "Bu maç fikstürden kaldırılacak.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
  });
  if (!res.isConfirmed) return;
  const newMatches = currentTournamentData.matches.filter(
    (m) => m.id !== matchId,
  );
  await updateDoc(doc(db, "tournaments", currentTournamentId), {
    matches: newMatches,
  });
  window.showToast("Maç silindi.", "info");
};

window.objectToMatch = async (matchId) => {
  const { value: url } = await Swal.fire({
    title: "Sonuca İtiraz Et",
    text: "Lütfen kanıt olarak bir link (Lichess/Chess.com/Resim) girin. Bu zorunludur!",
    input: "url",
    inputPlaceholder: "https://...",
    showCancelButton: true,
    confirmButtonText: "GÖNDER",
    confirmButtonColor: "#d33",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
  });
  if (url) {
    await updateDoc(doc(db, "tournaments", currentTournamentId), {
      matches: currentTournamentData.matches.map((m) => {
        if (m.id === matchId) {
          return { ...m, isDisputed: true, disputeLink: url };
        }
        return m;
      }),
    });
    window.showToast("İtiraz gönderildi! Yönetici inceleyecek.", "warning");
  }
};
