(async function () {
  const [
    { default: autoAnimate },
    { initializeApp },
    {
      getAuth,
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      signOut,
      onAuthStateChanged,
      updateProfile,
    },
    {
      getFirestore,
      collection,
      addDoc,
      setDoc,
      doc,
      onSnapshot,
      updateDoc,
      query,
      orderBy,
      serverTimestamp,
      deleteDoc,
      where,
      arrayUnion,
      arrayRemove,
      getDocs,
      increment,
      getDoc,
      deleteField,
    },
  ] = await Promise.all([
    import("https://cdn.jsdelivr.net/npm/@formkit/auto-animate@0.8.2/index.mjs"),
    import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"),
  ]);

  let configData = {};
  try {
    const configRes = await fetch("/api/config");
    if (configRes.ok) configData = await configRes.json();
  } catch (e) {
    console.warn("Could not load config from /api/config", e);
  }

  // === Firebase Configuration ===
  const firebaseConfig = {
    apiKey:
      configData.firebaseApiKey || "AIzaSyDtLQivXHDK0kGkATb9RiDuLCibFPZ8Qyw",
    authDomain: "chess-14580.firebaseapp.com",
    projectId: "chess-14580",
    storageBucket: "chess-14580.firebasestorage.app",
    messagingSenderId: "169513638183",
    appId: "1:169513638183:web:8327b77b1c54b3f26ab102",
    measurementId: "G-6W0TYK3DQR",
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  // Set globally shared Firestore/Auth handles first
  window.db = db;
  window.auth = auth;
  window.currentUser = null;
  window.currentViewId = "view-auth";
  window.actionRateState = {};

  // Load modules dynamically
  const cacheBuster = Date.now();
  await Promise.all([
    import(`./modules/auth-social-v2.js?v=${cacheBuster}`),
    import(`./modules/analysis-v2.js?v=${cacheBuster}`),
    import(`./modules/game-modes-v2.js?v=${cacheBuster}`),
  ]);

  // === AudioContext Sound System ===
  let _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx)
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    return _audioCtx;
  }
  document.body.addEventListener(
    "click",
    function () {
      getAudioCtx();
    },
    { once: true },
  );
  document.body.addEventListener(
    "touchstart",
    function () {
      getAudioCtx();
    },
    { once: true },
  );

  function playTone(freq, duration, type, volume) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(volume || 0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function playNoise(duration, volume, filterFreq) {
    try {
      const ctx = getAudioCtx();
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(filterFreq || 800, ctx.currentTime);
      filter.Q.setValueAtTime(1.5, ctx.currentTime);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(ctx.currentTime);
    } catch (e) {}
  }

  const soundGenerators = {
    move: function () {
      playNoise(0.08, 0.3, 900);
      playTone(300, 0.05, "square", 0.08);
    },
    capture: function () {
      playNoise(0.12, 0.4, 600);
      playTone(200, 0.08, "square", 0.12);
      setTimeout(function () {
        playNoise(0.06, 0.2, 500);
      }, 30);
    },
    check: function () {
      playNoise(0.08, 0.25, 900);
      playTone(880, 0.1, "square", 0.15);
      setTimeout(function () {
        playTone(660, 0.12, "square", 0.12);
      }, 80);
    },
    castle: function () {
      playNoise(0.07, 0.3, 900);
      playTone(350, 0.05, "square", 0.08);
      setTimeout(function () {
        playNoise(0.07, 0.3, 900);
        playTone(400, 0.05, "square", 0.08);
      }, 120);
    },
    notify: function () {
      playTone(523, 0.12, "sine", 0.2);
      setTimeout(function () {
        playTone(659, 0.12, "sine", 0.2);
      }, 120);
      setTimeout(function () {
        playTone(784, 0.15, "sine", 0.25);
      }, 240);
    },
    gameStart: function () {
      playTone(392, 0.12, "sine", 0.18);
      setTimeout(function () {
        playTone(523, 0.14, "sine", 0.22);
      }, 120);
      setTimeout(function () {
        playTone(659, 0.18, "sine", 0.26);
      }, 240);
    },
    gameEnd: function () {
      playTone(523, 0.2, "sine", 0.2);
      setTimeout(function () {
        playTone(659, 0.2, "sine", 0.2);
      }, 200);
      setTimeout(function () {
        playTone(784, 0.3, "sine", 0.25);
      }, 400);
      setTimeout(function () {
        playTone(1047, 0.4, "sine", 0.3);
      }, 600);
    },
    nav: function () {
      playTone(700, 0.04, "sine", 0.12);
      playTone(1400, 0.03, "sine", 0.06);
    },
  };

  window.playGameSound = function (key) {
    if (localStorage.getItem("gm_mute") === "true") return;
    var gen = soundGenerators[key];
    if (gen) gen();
  };

  // Global click sound mapping
  document.body.addEventListener("click", function (e) {
    if (
      e.target.closest("button") ||
      e.target.closest(".avatar-option") ||
      e.target.closest(".theme-btn") ||
      e.target.closest(".quiz-btn") ||
      e.target.closest(".cr-card") ||
      e.target.closest(".team-slot") ||
      e.target.closest(".analysis-tab")
    ) {
      if (
        !e.target.closest("#btnIdrisClick") &&
        !e.target.closest("#modern_btnIdrisClick")
      ) {
        window.playGameSound("nav");
      }
    }
  });

  const standingsBody = document.getElementById("standingsBody");
  const lobbySlots = document.getElementById("lobbySlots");
  const crDeckGrid = document.getElementById("crDeckGrid");
  const quizPlayerList = document.getElementById("quizPlayerList");
  const quizBuilderList = document.getElementById("quizBuilderList");
  const quizFinalTableBody = document.getElementById("quizFinalTableBody");
  [
    standingsBody,
    lobbySlots,
    crDeckGrid,
    quizPlayerList,
    quizBuilderList,
    quizFinalTableBody,
  ].forEach(function (el) {
    if (el) autoAnimate(el);
  });

  // === Global Mute & Fullscreen Layout Settings ===
  let soundEnabled = localStorage.getItem("gm_mute") !== "true";
  const muteToggle = document.getElementById("muteSoundToggle");
  if (muteToggle) {
    muteToggle.checked = soundEnabled;
    muteToggle.onchange = (e) => {
      soundEnabled = e.target.checked;
      localStorage.setItem("gm_mute", soundEnabled ? "false" : "true");
      if (soundEnabled) window.playGameSound("nav");
    };
  }

  function setBoardFullscreenVisible(visible) {
    const overlay = document.getElementById("chessFullscreenOverlay");
    if (!overlay) return;
    overlay.classList.toggle("active", visible);
    overlay.setAttribute("aria-hidden", visible ? "false" : "true");
    document.body.classList.toggle("board-fullscreen-open", visible);
    if (!visible) {
      overlay.dataset.mode = "";
      const boardEl = document.getElementById("fullscreenBoard");
      if (boardEl) boardEl.innerHTML = "";
    }
  }

  function setFullscreenPlayerGroup(containerId, players, activeUid) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    const safePlayers =
      Array.isArray(players) && players.length
        ? players
        : [{ name: "Bekleniyor...", avatar: "fa-user" }];
    safePlayers.forEach(function (player) {
      const chip = document.createElement("div");
      chip.className = "fullscreen-player-chip";
      if (activeUid && player && player.uid === activeUid)
        chip.classList.add("active");

      const icon = document.createElement("i");
      icon.className = "fas " + ((player && player.avatar) || "fa-user");
      const name = document.createElement("span");
      name.innerText = (player && player.name) || "Bekleniyor...";

      chip.appendChild(icon);
      chip.appendChild(name);
      container.appendChild(chip);
    });
  }

  window.syncFullscreenTimers = function (whiteText, blackText) {
    const whiteEl = document.getElementById("fullscreenTimerWhite");
    const blackEl = document.getElementById("fullscreenTimerBlack");
    if (whiteEl) whiteEl.innerText = whiteText || "--:--";
    if (blackEl) blackEl.innerText = blackText || "--:--";
  };

  function setFullscreenRowActive(color) {
    const whiteRow = document.getElementById("fullscreenWhiteRow");
    const blackRow = document.getElementById("fullscreenBlackRow");
    if (whiteRow) whiteRow.classList.toggle("active", color === "white");
    if (blackRow) blackRow.classList.toggle("active", color === "black");
  }

  window.syncBoardFullscreenUI = function () {
    const activeFullscreenBoardMode = window.activeFullscreenBoardMode;
    if (!activeFullscreenBoardMode) return;
    const overlay = document.getElementById("chessFullscreenOverlay");
    if (!overlay) return;
    overlay.dataset.mode = activeFullscreenBoardMode;

    if (activeFullscreenBoardMode === "1v1") {
      const current1v1Data = window.current1v1Data;
      if (!current1v1Data) {
        window.closeBoardFullscreen();
        return;
      }
      const whitePlayer = current1v1Data.players.find(function (player) {
        return player.team === "white";
      });
      const blackPlayer = current1v1Data.players.find(function (player) {
        return player.team === "black";
      });
      const activeColor =
        current1v1Data.status === "active"
          ? window.chess1v1.turn() === "w"
            ? "white"
            : "black"
          : null;

      setFullscreenPlayerGroup(
        "fullscreenWhitePlayers",
        whitePlayer ? [whitePlayer] : [],
        activeColor === "white" && whitePlayer ? whitePlayer.uid : null,
      );
      setFullscreenPlayerGroup(
        "fullscreenBlackPlayers",
        blackPlayer ? [blackPlayer] : [],
        activeColor === "black" && blackPlayer ? blackPlayer.uid : null,
      );
      setFullscreenRowActive(activeColor);
      window.syncFullscreenTimers(
        (document.getElementById("timer1v1White") || {}).innerText,
        (document.getElementById("timer1v1Black") || {}).innerText,
      );
      return;
    }

    if (activeFullscreenBoardMode === "2v2") {
      const current2v2Data = window.current2v2Data;
      if (!current2v2Data) {
        window.closeBoardFullscreen();
        return;
      }
      const whitePlayers = current2v2Data.players.filter(function (player) {
        return player.team === "white" && player.uid;
      });
      const blackPlayers = current2v2Data.players.filter(function (player) {
        return player.team === "black" && player.uid;
      });
      const movesPerTurn = current2v2Data.movesPerTurn || 5;
      const movesMadeByColor = Math.floor((current2v2Data.moveCount || 0) / 2);
      const activeIndex = Math.floor(movesMadeByColor / movesPerTurn) % 2;
      const activeColor =
        current2v2Data.status === "active"
          ? window.chess.turn() === "w"
            ? "white"
            : "black"
          : null;
      const activePlayer = current2v2Data.players.find(function (player) {
        return (
          activeColor &&
          player.team === activeColor &&
          player.index === activeIndex
        );
      });
      const activeUid = activePlayer ? activePlayer.uid : null;

      setFullscreenPlayerGroup(
        "fullscreenWhitePlayers",
        whitePlayers,
        activeColor === "white" ? activeUid : null,
      );
      setFullscreenPlayerGroup(
        "fullscreenBlackPlayers",
        blackPlayers,
        activeColor === "black" ? activeUid : null,
      );
      setFullscreenRowActive(activeColor);
      window.syncFullscreenTimers(
        (document.getElementById("timerWhite") || {}).innerText,
        (document.getElementById("timerBlack") || {}).innerText,
      );
    }
  };

  window.openBoardFullscreen = async function (mode) {
    if (mode !== "1v1" && mode !== "2v2") return;
    window.activeFullscreenBoardMode = mode;
    setBoardFullscreenVisible(true);
    window.syncBoardFullscreenUI();

    const overlay = document.getElementById("chessFullscreenOverlay");
    if (
      overlay &&
      overlay.requestFullscreen &&
      document.fullscreenElement !== overlay
    ) {
      try {
        await overlay.requestFullscreen();
      } catch (e) {}
    }
  };

  window.closeBoardFullscreen = async function () {
    const overlay = document.getElementById("chessFullscreenOverlay");
    window.activeFullscreenBoardMode = null;
    setBoardFullscreenVisible(false);
    if (document.fullscreenElement === overlay) {
      try {
        await document.exitFullscreen();
      } catch (e) {}
    }
  };

  document.addEventListener("fullscreenchange", function () {
    const overlay = document.getElementById("chessFullscreenOverlay");
    if (!overlay) return;
    if (
      document.fullscreenElement !== overlay &&
      window.activeFullscreenBoardMode &&
      overlay.classList.contains("active")
    ) {
      window.activeFullscreenBoardMode = null;
      setBoardFullscreenVisible(false);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (
      e.key === "Escape" &&
      window.activeFullscreenBoardMode &&
      !document.fullscreenElement
    ) {
      window.closeBoardFullscreen();
    }
  });

  // === Global Utility Functions ===
  window.showToast = (msg, type = "info") => {
    let bg;
    if (type === "success") bg = "linear-gradient(to right, #00b09b, #96c93d)";
    else if (type === "error")
      bg = "linear-gradient(to right, #ff5f6d, #ffc371)";
    else if (type === "gold")
      bg = "linear-gradient(to right, #b8860b, #d4af37)";
    else bg = "#333";
    Toastify({
      text: msg,
      duration: 3000,
      gravity: "top",
      position: "right",
      stopOnFocus: true,
      style: {
        background: bg,
        borderRadius: "8px",
        boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
        fontWeight: "bold",
      },
    }).showToast();
  };
  window.setTheme = (t) => {
    document.body.setAttribute("data-theme", t);
    localStorage.setItem("gm_theme", t);
  };
  window.setTheme(localStorage.getItem("gm_theme") || "dark");

  window.escapeHtml = function (value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char];
    });
  };

  window.clamp = function (num, min, max) {
    return Math.max(min, Math.min(max, num));
  };

  window.isUserOnline = function (profile) {
    if (!profile || !profile.lastActiveAt) return false;
    return Date.now() - profile.lastActiveAt < 70000;
  };

  window.formatPresence = function (profile) {
    if (!profile || !profile.lastActiveAt) return "Durum bilinmiyor";
    if (window.isUserOnline(profile)) return "Çevrim içi";
    var diff = Math.max(0, Date.now() - profile.lastActiveAt);
    var minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Az önce";
    if (minutes < 60) return minutes + " dk önce";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + " sa önce";
    return Math.floor(hours / 24) + " gün önce";
  };

  window.getFriendThreadId = function (uidA, uidB) {
    return [uidA, uidB].sort().join("_");
  };

  window.getLobbyInviteDocId = function (type, roomId, fromUid, toUid) {
    return [type, roomId, fromUid, toUid].join("_");
  };

  window.makeId = function (length) {
    let result = "";
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < length; i++)
      result += characters.charAt(
        Math.floor(Math.random() * characters.length),
      );
    return result;
  };

  window.sanitizeUserText = function (value, maxLength) {
    var text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (maxLength && text.length > maxLength) text = text.slice(0, maxLength);
    return text;
  };

  window.formatTimeAgo = function (timestamp) {
    if (!timestamp) return "Simdi";
    var diff = Math.max(0, Date.now() - timestamp);
    if (diff < 45000) return "Az once";
    var minutes = Math.floor(diff / 60000);
    if (minutes < 60) return minutes + " dk once";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + " sa once";
    var days = Math.floor(hours / 24);
    return days + " gun once";
  };

  window.getModeLabel = function (mode) {
    if (mode === "1v1") return "1v1";
    if (mode === "2v2") return "2v2";
    if (mode === "quiz") return "Quiz";
    if (mode === "tournament") return "Turnuva";
    return "Oyun";
  };

  const LAST_ACTIVE_GAME_KEY = "gm_last_active_match";
  window.buildLocalActiveGamePayload = function (mode, code, extra) {
    var payload = Object.assign(
      {
        mode: mode,
        code: code,
        ts: Date.now(),
        disconnectedAtMs: null,
      },
      extra || {},
    );
    return JSON.stringify(payload);
  };

  window.readLocalActiveGame = function () {
    try {
      var raw = localStorage.getItem(LAST_ACTIVE_GAME_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  window.rememberLocalActiveGame = function (mode, code, extra) {
    if (!mode || !code) return;
    try {
      localStorage.setItem(
        LAST_ACTIVE_GAME_KEY,
        window.buildLocalActiveGamePayload(mode, code, extra),
      );
    } catch (e) {}
  };

  window.markLocalActiveGameDisconnected = function (
    mode,
    code,
    disconnectedAtMs,
  ) {
    if (!mode || !code) return;
    window.rememberLocalActiveGame(mode, code, {
      disconnectedAtMs: disconnectedAtMs || Date.now(),
    });
  };

  window.clearLocalActiveGame = function (mode) {
    try {
      if (!mode) {
        localStorage.removeItem(LAST_ACTIVE_GAME_KEY);
        return;
      }
      var saved = window.readLocalActiveGame();
      if (!saved || saved.mode === mode) {
        localStorage.removeItem(LAST_ACTIVE_GAME_KEY);
      }
    } catch (e) {}
  };

  window.throttleAction = function (bucket, key, maxCount, windowMs) {
    var stateKey = bucket + ":" + (key || "global");
    var now = Date.now();
    var recent = (window.actionRateState[stateKey] || []).filter(function (ts) {
      return now - ts < windowMs;
    });
    if (recent.length >= maxCount) return false;
    recent.push(now);
    window.actionRateState[stateKey] = recent;
    return true;
  };

  window.getCurrentPresenceActivity = function () {
    if (window.current1v1Id && window.current1v1Data) {
      return {
        activeMode: "1v1",
        activeRoomId: window.current1v1Id,
        activeRoomCode: window.current1v1Data.code || window.current1v1Id,
        activeGameStatus: window.current1v1Data.status || "lobby",
        activeRole: window.current1v1Role,
      };
    }
    if (window.current2v2Id && window.current2v2Data) {
      return {
        activeMode: "2v2",
        activeRoomId: window.current2v2Id,
        activeRoomCode: window.current2v2Data.code || window.current2v2Id,
        activeGameStatus: window.current2v2Data.status || "lobby",
        activeRole: window.current2v2Role,
      };
    }
    return {
      activeMode: null,
      activeRoomId: null,
      activeRoomCode: null,
      activeGameStatus: null,
      activeRole: null,
    };
  };

  window.getCurrentReconnectContext = function () {
    if (
      window.current1v1Id &&
      window.current1v1Data &&
      window.current1v1Data.status === "active" &&
      window.current1v1Role === "player"
    ) {
      return {
        mode: "1v1",
        id: window.current1v1Id,
        data: window.current1v1Data,
      };
    }
    if (
      window.current2v2Id &&
      window.current2v2Data &&
      window.current2v2Data.status === "active" &&
      window.current2v2Role === "player"
    ) {
      return {
        mode: "2v2",
        id: window.current2v2Id,
        data: window.current2v2Data,
      };
    }
    return null;
  };

  // === Idris Clicker Logic ===
  let idrisCooldown = false;
  let idrisTimer = null;
  window.initIdrisListener = () => {
    const docRef = doc(db, "global_stats", "idris_clicker");
    onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        [
          document.getElementById("idrisGlobalCounter"),
          document.getElementById("modern_idrisGlobalCounter"),
        ].forEach((e) => {
          if (e) e.innerText = docSnap.data().count || 0;
        });
      } else {
        setDoc(docRef, { count: 0 }, { merge: true });
      }
    });
  };
  window.clickIdris = async () => {
    if (idrisCooldown) return;
    window.playGameSound("capture");
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
      colors: ["#8E2DE2", "#4A00E0", "#ffffff"],
    });
    idrisCooldown = true;
    const btn = document.getElementById("btnIdrisClick");
    const mBtn = document.getElementById("modern_btnIdrisClick");
    const txt = document.getElementById("idrisCooldownText");
    const mTxt = document.getElementById("modern_idrisCooldownText");
    if (btn) btn.disabled = true;
    if (typeof mBtn !== "undefined" && mBtn) mBtn.disabled = true;
    if (btn) btn.style.filter = "grayscale(1)";
    if (typeof mBtn !== "undefined" && mBtn) mBtn.style.filter = "grayscale(1)";
    if (btn) btn.innerHTML = `<i class="fas fa-hourglass-half"></i> BEKLE`;
    if (typeof mBtn !== "undefined" && mBtn)
      mBtn.innerHTML = `<i class="fas fa-hourglass-half"></i> BEKLE`;
    let timeLeft = 5;
    if (txt) txt.innerText = `Sonraki basış: ${timeLeft}s`;
    if (typeof mTxt !== "undefined" && mTxt)
      mTxt.innerText = `Sonraki basış: ${timeLeft}s`;
    idrisTimer = setInterval(() => {
      timeLeft--;
      if (txt) txt.innerText = `Sonraki basış: ${timeLeft}s`;
      if (typeof mTxt !== "undefined" && mTxt)
        mTxt.innerText = `Sonraki basış: ${timeLeft}s`;
      if (timeLeft <= 0) {
        clearInterval(idrisTimer);
        idrisCooldown = false;
        if (btn) btn.disabled = false;
        if (typeof mBtn !== "undefined" && mBtn) mBtn.disabled = false;
        if (btn) btn.style.filter = "none";
        if (typeof mBtn !== "undefined" && mBtn) mBtn.style.filter = "none";
        if (btn) btn.innerHTML = `<i class="fas fa-fingerprint"></i> BAS`;
        if (typeof mBtn !== "undefined" && mBtn)
          mBtn.innerHTML = `<i class="fas fa-fingerprint"></i> BAS`;
        if (txt) txt.innerText = "";
        if (typeof mTxt !== "undefined" && mTxt) mTxt.innerText = "";
      }
    }, 1000);
    try {
      await updateDoc(doc(db, "global_stats", "idris_clicker"), {
        count: increment(1),
      });
    } catch (e) {
      await setDoc(
        doc(db, "global_stats", "idris_clicker"),
        { count: 1 },
        { merge: true },
      );
    }
  };

  // === Clash Royale Card Randomizer System ===
  const crData = [
    {
      id: 26000000,
      n: "Knight",
      e: 3,
      r: "common",
      t: "troop",
      role: "mini_tank",
    },
    {
      id: 26000001,
      n: "Archers",
      e: 3,
      r: "common",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000002,
      n: "Goblins",
      e: 2,
      r: "common",
      t: "troop",
      role: "cycle",
    },
    {
      id: 26000005,
      n: "Minions",
      e: 3,
      r: "common",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000008,
      n: "Barbarians",
      e: 5,
      r: "common",
      t: "troop",
      role: "tank_killer",
    },
    {
      id: 26000010,
      n: "Skeletons",
      e: 1,
      r: "common",
      t: "troop",
      role: "cycle",
    },
    {
      id: 26000013,
      n: "Bomber",
      e: 2,
      r: "common",
      t: "troop",
      role: "support",
    },
    {
      id: 26000019,
      n: "Spear Goblins",
      e: 2,
      r: "common",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000022,
      n: "Minion Horde",
      e: 5,
      r: "common",
      t: "troop",
      role: "swarm",
    },
    {
      id: 26000024,
      n: "Royal Giant",
      e: 6,
      r: "common",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000030,
      n: "Ice Spirit",
      e: 1,
      r: "common",
      t: "troop",
      role: "cycle",
    },
    {
      id: 26000031,
      n: "Fire Spirit",
      e: 1,
      r: "common",
      t: "troop",
      role: "cycle",
    },
    {
      id: 26000041,
      n: "Goblin Gang",
      e: 3,
      r: "common",
      t: "troop",
      role: "swarm",
    },
    {
      id: 26000043,
      n: "Elite Barbarians",
      e: 6,
      r: "common",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000047,
      n: "Royal Recruits",
      e: 7,
      r: "common",
      t: "troop",
      role: "defense",
    },
    { id: 26000049, n: "Bats", e: 2, r: "common", t: "troop", role: "cycle" },
    {
      id: 26000053,
      n: "Rascals",
      e: 5,
      r: "common",
      t: "troop",
      role: "defense",
    },
    {
      id: 26000056,
      n: "Skeleton Barrel",
      e: 3,
      r: "common",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000064,
      n: "Firecracker",
      e: 3,
      r: "common",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000080,
      n: "Skeleton Dragons",
      e: 4,
      r: "common",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000084,
      n: "Electro Spirit",
      e: 1,
      r: "common",
      t: "troop",
      role: "cycle",
    },
    {
      id: 26000003,
      n: "Giant",
      e: 5,
      r: "rare",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000011,
      n: "Valkyrie",
      e: 4,
      r: "rare",
      t: "troop",
      role: "mini_tank",
    },
    {
      id: 26000014,
      n: "Musketeer",
      e: 4,
      r: "rare",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000017,
      n: "Wizard",
      e: 5,
      r: "rare",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000018,
      n: "Mini P.E.K.K.A",
      e: 4,
      r: "rare",
      t: "troop",
      role: "tank_killer",
    },
    {
      id: 26000021,
      n: "Hog Rider",
      e: 4,
      r: "rare",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000028,
      n: "Three Musketeers",
      e: 9,
      r: "rare",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000036,
      n: "Battle Ram",
      e: 4,
      r: "rare",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000038,
      n: "Ice Golem",
      e: 2,
      r: "rare",
      t: "troop",
      role: "mini_tank",
    },
    {
      id: 26000039,
      n: "Mega Minion",
      e: 3,
      r: "rare",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000040,
      n: "Dart Goblin",
      e: 3,
      r: "rare",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000052,
      n: "Zappies",
      e: 4,
      r: "rare",
      t: "troop",
      role: "defense",
    },
    {
      id: 26000057,
      n: "Flying Machine",
      e: 4,
      r: "rare",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000059,
      n: "Royal Hogs",
      e: 5,
      r: "rare",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000065,
      n: "Elixir Golem",
      e: 3,
      r: "rare",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000066,
      n: "Battle Healer",
      e: 4,
      r: "rare",
      t: "troop",
      role: "mini_tank",
    },
    {
      id: 26000068,
      n: "Heal Spirit",
      e: 1,
      r: "rare",
      t: "troop",
      role: "cycle",
    },
    {
      id: 26000004,
      n: "P.E.K.K.A",
      e: 7,
      r: "epic",
      t: "troop",
      role: "tank_killer",
    },
    {
      id: 26000006,
      n: "Balloon",
      e: 5,
      r: "epic",
      t: "troop",
      role: "win_condition",
    },
    { id: 26000007, n: "Witch", e: 5, r: "epic", t: "troop", role: "support" },
    {
      id: 26000009,
      n: "Golem",
      e: 8,
      r: "epic",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000012,
      n: "Skeleton Army",
      e: 3,
      r: "epic",
      t: "troop",
      role: "swarm",
    },
    {
      id: 26000015,
      n: "Baby Dragon",
      e: 4,
      r: "epic",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000016,
      n: "Prince",
      e: 5,
      r: "epic",
      t: "troop",
      role: "mini_tank",
    },
    {
      id: 26000020,
      n: "Giant Skeleton",
      e: 6,
      r: "epic",
      t: "troop",
      role: "tank",
    },
    { id: 26000025, n: "Guards", e: 3, r: "epic", t: "troop", role: "defense" },
    {
      id: 26000027,
      n: "Dark Prince",
      e: 4,
      r: "epic",
      t: "troop",
      role: "mini_tank",
    },
    { id: 26000034, n: "Bowler", e: 5, r: "epic", t: "troop", role: "defense" },
    {
      id: 26000044,
      n: "Hunter",
      e: 4,
      r: "epic",
      t: "troop",
      role: "tank_killer",
    },
    {
      id: 26000045,
      n: "Executioner",
      e: 5,
      r: "epic",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000054,
      n: "Cannon Cart",
      e: 5,
      r: "epic",
      t: "troop",
      role: "mini_tank",
    },
    {
      id: 26000058,
      n: "Wall Breakers",
      e: 2,
      r: "epic",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000060,
      n: "Goblin Giant",
      e: 6,
      r: "epic",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000063,
      n: "Electro Dragon",
      e: 5,
      r: "epic",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000023,
      n: "Ice Wizard",
      e: 3,
      r: "legendary",
      t: "troop",
      role: "defense",
    },
    {
      id: 26000026,
      n: "Princess",
      e: 3,
      r: "legendary",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000029,
      n: "Lava Hound",
      e: 7,
      r: "legendary",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000032,
      n: "Miner",
      e: 3,
      r: "legendary",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000033,
      n: "Sparky",
      e: 6,
      r: "legendary",
      t: "troop",
      role: "win_condition",
    },
    {
      id: 26000035,
      n: "Lumberjack",
      e: 4,
      r: "legendary",
      t: "troop",
      role: "tank_killer",
    },
    {
      id: 26000037,
      n: "Inferno Dragon",
      e: 4,
      r: "legendary",
      t: "troop",
      role: "tank_killer",
    },
    {
      id: 26000042,
      n: "Electro Wizard",
      e: 4,
      r: "legendary",
      t: "troop",
      role: "anti_air",
    },
    {
      id: 26000046,
      n: "Bandit",
      e: 3,
      r: "legendary",
      t: "troop",
      role: "mini_tank",
    },
    { id: 26000048, n: "Night Witch", e: 4, r: "legendary", t: "support" },
    { id: 26000050, n: "Royal Ghost", e: 3, r: "legendary", t: "mini_tank" },
    { id: 26000051, n: "Ram Rider", e: 5, r: "legendary", t: "win_condition" },
    { id: 26000055, n: "Mega Knight", e: 7, r: "legendary", t: "tank" },
    { id: 26000061, n: "Fisherman", e: 3, r: "legendary", t: "defense" },
    { id: 26000062, n: "Magic Archer", e: 4, r: "legendary", t: "anti_air" },
    { id: 26000083, n: "Mother Witch", e: 4, r: "legendary", t: "support" },
    { id: 26000087, n: "Phoenix", e: 4, r: "legendary", t: "anti_air" },
    {
      id: 28000000,
      n: "Fireball",
      e: 4,
      r: "rare",
      t: "spell",
      role: "big_spell",
    },
    {
      id: 28000001,
      n: "Arrows",
      e: 3,
      r: "common",
      t: "spell",
      role: "small_spell",
    },
    {
      id: 28000002,
      n: "Rage",
      e: 2,
      r: "epic",
      t: "spell",
      role: "small_spell",
    },
    {
      id: 28000003,
      n: "Rocket",
      e: 6,
      r: "rare",
      t: "spell",
      role: "big_spell",
    },
    {
      id: 28000004,
      n: "Goblin Barrel",
      e: 3,
      r: "epic",
      t: "spell",
      role: "win_condition",
    },
    { id: 28000005, n: "Freeze", e: 4, r: "epic", t: "spell", role: "utility" },
    {
      id: 28000006,
      n: "Lightning",
      e: 6,
      r: "epic",
      t: "spell",
      role: "big_spell",
    },
    {
      id: 28000007,
      n: "Zap",
      e: 2,
      r: "common",
      t: "spell",
      role: "small_spell",
    },
    {
      id: 28000008,
      n: "Poison",
      e: 4,
      r: "epic",
      t: "spell",
      role: "big_spell",
    },
    {
      id: 28000009,
      n: "Graveyard",
      e: 5,
      r: "legendary",
      t: "spell",
      role: "win_condition",
    },
    {
      id: 28000010,
      n: "The Log",
      e: 2,
      r: "legendary",
      t: "spell",
      role: "small_spell",
    },
    {
      id: 28000011,
      n: "Tornado",
      e: 3,
      r: "epic",
      t: "spell",
      role: "utility",
    },
    { id: 28000012, n: "Clone", e: 3, r: "epic", t: "spell", role: "utility" },
    {
      id: 28000013,
      n: "Earthquake",
      e: 3,
      r: "rare",
      t: "spell",
      role: "big_spell",
    },
    {
      id: 28000015,
      n: "Barbarian Barrel",
      e: 2,
      r: "epic",
      t: "spell",
      role: "small_spell",
    },
    {
      id: 28000017,
      n: "Giant Snowball",
      e: 2,
      r: "common",
      t: "spell",
      role: "small_spell",
    },
    {
      id: 28000018,
      n: "Royal Delivery",
      e: 3,
      r: "common",
      t: "spell",
      role: "defense",
    },
    {
      id: 27000000,
      n: "Cannon",
      e: 3,
      r: "common",
      t: "building",
      role: "defense",
    },
    {
      id: 27000001,
      n: "Goblin Hut",
      e: 5,
      r: "rare",
      t: "building",
      role: "spawner",
    },
    {
      id: 27000002,
      n: "Mortar",
      e: 4,
      r: "common",
      t: "building",
      role: "win_condition",
    },
    {
      id: 27000003,
      n: "Inferno Tower",
      e: 5,
      r: "rare",
      t: "building",
      role: "tank_killer",
    },
    {
      id: 27000004,
      n: "Bomb Tower",
      e: 4,
      r: "rare",
      t: "building",
      role: "defense",
    },
    {
      id: 27000005,
      n: "Barbarian Hut",
      e: 7,
      r: "rare",
      t: "building",
      role: "spawner",
    },
    {
      id: 27000006,
      n: "Tesla",
      e: 4,
      r: "common",
      t: "building",
      role: "defense",
    },
    {
      id: 27000007,
      n: "Elixir Collector",
      e: 6,
      r: "rare",
      t: "building",
      role: "utility",
    },
    {
      id: 27000008,
      n: "X-Bow",
      e: 6,
      r: "epic",
      t: "building",
      role: "win_condition",
    },
    {
      id: 27000009,
      n: "Tombstone",
      e: 3,
      r: "rare",
      t: "building",
      role: "defense",
    },
    {
      id: 27000010,
      n: "Furnace",
      e: 4,
      r: "rare",
      t: "building",
      role: "spawner",
    },
    {
      id: 27000011,
      n: "Goblin Cage",
      e: 4,
      r: "rare",
      t: "building",
      role: "defense",
    },
    {
      id: 27000012,
      n: "Goblin Drill",
      e: 4,
      r: "epic",
      t: "building",
      role: "win_condition",
    },
  ];

  let currentCRDeck = [];
  window.openClashGenerator = () => {
    window.playGameSound("nav");
    window.switchView("view-clash");
    if (currentCRDeck.length === 0) window.generateSmartDeck();
  };
  window.generateSmartDeck = () => {
    window.playGameSound("nav");
    const winConditions = crData.filter((c) => c.role === "win_condition");
    const smallSpells = crData.filter((c) => c.role === "small_spell");
    const bigSpells = crData.filter((c) => c.role === "big_spell");
    const antiAir = crData.filter((c) => c.role === "anti_air");
    const buildings = crData.filter((c) => c.t === "building");
    const tanks = crData.filter(
      (c) => c.role === "tank" || c.role === "mini_tank",
    );
    const cycles = crData.filter((c) => c.role === "cycle" || c.e <= 2);
    let deck = [];
    let deckIds = new Set();
    let hasChampion = false;
    const addCard = (pool, fallbackPool = crData) => {
      let available = pool.filter(
        (c) => !deckIds.has(c.id) && !(hasChampion && c.r === "champion"),
      );
      if (available.length === 0) {
        available = fallbackPool.filter(
          (c) => !deckIds.has(c.id) && !(hasChampion && c.r === "champion"),
        );
      }
      if (available.length === 0) return null;
      const card = available[Math.floor(Math.random() * available.length)];
      if (card.r === "champion") hasChampion = true;
      deck.push(card);
      deckIds.add(card.id);
      return card;
    };
    addCard(winConditions);
    addCard(smallSpells);
    addCard(bigSpells);
    addCard(antiAir);
    if (Math.random() > 0.5) addCard(buildings);
    else addCard(tanks);
    while (deck.length < 8) {
      let avg = deck.reduce((a, b) => a + b.e, 0) / deck.length;
      if (avg > 3.8) {
        addCard(cycles);
      } else {
        addCard(crData);
      }
    }
    renderDeck(deck);
  };

  function renderDeck(deck) {
    currentCRDeck = deck;
    const grid = document.getElementById("crDeckGrid");
    grid.innerHTML = "";
    let totalElixir = 0;
    deck.forEach((c) => {
      totalElixir += c.e;
      const key = c.n.toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
      const imgUrl = `https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards-75/${key}.png`;
      const cardEl = document.createElement("div");
      cardEl.className = `cr-card rarity-${c.r}`;
      cardEl.innerHTML = `<div class="cr-elixir">${c.e}</div><img src="${imgUrl}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/1068/1068729.png'; this.style.filter='none';"><div class="cr-card-name">${c.n}</div>`;
      grid.appendChild(cardEl);
    });
    const avg = (totalElixir / 8).toFixed(1);
    document.getElementById("crAvgElixir").innerText = avg;
    let type = "Dengeli";
    if (avg < 3.0) type = "Hızlı Döngü (Cycle)";
    else if (avg > 4.2) type = "Ağır Saldırı (Beatdown)";
    else if (deck.some((c) => c.n === "Miner" || c.n === "Goblin Barrel"))
      type = "Kontrol / Bait";
    else if (deck.some((c) => c.n === "X-Bow" || c.n === "Mortar"))
      type = "Kuşatma (Siege)";
    document.getElementById("deckArchetype").innerText = type;
    document.getElementById("btnCopyCR").style.display = "block";
    document.getElementById("copyInstructions").style.display = "block";
  }

  window.copyToCR = () => {
    if (!currentCRDeck || currentCRDeck.length !== 8) {
      return window.showToast("Önce bir deste oluşturulmalı!", "error");
    }
    const idString = currentCRDeck.map((c) => c.id).join(";");
    const finalLink = `https://link.clashroyale.com/en/?clashroyale://copyDeck?deck=${idString}&l=Royals&tt=159000000`;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    window.showToast("Clash Royale açılıyor...", "success");
    if (isMobile) {
      window.open(finalLink, "_blank");
    } else {
      window.open(finalLink, "_blank");
    }
  };

  // === User Avatar & Theme Setup ===
  const avatarList = [
    "fa-chess-king",
    "fa-chess-queen",
    "fa-chess-rook",
    "fa-chess-bishop",
    "fa-chess-knight",
    "fa-chess-pawn",
    "fa-user-astronaut",
    "fa-dragon",
    "fa-fire",
    "fa-bolt",
    "fa-crown",
    "fa-brain",
    "fa-ghost",
    "fa-robot",
  ];
  window.renderAvatars = function (tid, iid) {
    const c = document.getElementById(tid);
    c.innerHTML = "";
    avatarList.forEach((i) => {
      const d = document.createElement("div");
      d.className = "avatar-option";
      d.innerHTML = `<i class="fas ${i}"></i>`;
      d.onclick = () => {
        window.playGameSound("nav");
        c.querySelectorAll(".avatar-option").forEach((e) =>
          e.classList.remove("selected"),
        );
        d.classList.add("selected");
        document.getElementById(iid).value = i;
      };
      c.appendChild(d);
    });
    if (c.firstChild) c.firstChild.classList.add("selected");
    document.getElementById(iid).value = avatarList[0];
  };
  window.renderAvatars("authAvatarGrid", "selectedAvatar");

  // === Global Switch View Layout controller ===
  window.switchView = (id) => {
    window.playGameSound("nav");
    const previousView = window.currentViewId;
    window.currentViewId = id;
    if (
      (window.activeFullscreenBoardMode === "1v1" && id !== "view-1v1-game") ||
      (window.activeFullscreenBoardMode === "2v2" && id !== "view-2v2-game")
    ) {
      window.closeBoardFullscreen();
    }
    if (previousView === "view-2v2-analysis" && id !== "view-2v2-analysis") {
      window.analysisReviewToken++;
      window.liveEvalRequestId++;
      if (window.clearAnalysisOverlayTimers)
        window.clearAnalysisOverlayTimers();
      if (window.setAnalysisOverlayVisible)
        window.setAnalysisOverlayVisible(false);
      window.analysisLoadingState = null;
    }
    document
      .querySelectorAll(".view")
      .forEach((v) => v.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    const floatNav = document.querySelector(".floating-container");
    if (
      id === "view-lobby" ||
      id === "view-tournament" ||
      id === "view-2v2-lobby" ||
      id === "view-2v2-game" ||
      id === "view-1v1-lobby" ||
      id === "view-1v1-game"
    ) {
      floatNav.style.display = "flex";
    } else {
      floatNav.style.display = "none";
      document.getElementById("chatWidget").style.display = "none";
      document.getElementById("chatToggleBtn").style.display = "flex";
    }
    if (window.currentUser && window.pushProfilePresence)
      window.pushProfilePresence();
    if (id === "view-dashboard" && window.scheduleDashboardReconnectPrompt)
      window.scheduleDashboardReconnectPrompt();
  };

  // === Authentication handlers ===
  let isReg = false;
  document.getElementById("btnSwitchLogin").onclick = () => {
    isReg = false;
    toggleAuth();
  };
  document.getElementById("btnSwitchRegister").onclick = () => {
    isReg = true;
    toggleAuth();
  };
  function toggleAuth() {
    window.playGameSound("nav");
    document.getElementById("registerFields").style.display = isReg
      ? "block"
      : "none";
    document.getElementById("btnAuthAction").innerText = isReg
      ? "HESAP OLUŞTUR & GİR"
      : "GİRİŞ YAP";
    document
      .getElementById("btnSwitchLogin")
      .classList.toggle("secondary", isReg);
    document
      .getElementById("btnSwitchRegister")
      .classList.toggle("secondary", !isReg);
  }
  document.getElementById("btnAuthAction").onclick = async () => {
    window.playGameSound("nav");
    const btn = document.getElementById("btnAuthAction");
    const mBtn = null;
    const e = document.getElementById("emailInput").value.trim(),
      p = document.getElementById("passwordInput").value.trim(),
      n = document.getElementById("displayNameInput").value.trim(),
      a = document.getElementById("selectedAvatar").value;
    if (!e || !p || (isReg && !n)) {
      return window.showToast("Lütfen tüm alanları doldurun.", "error");
    }
    if (btn) btn.disabled = true;
    if (typeof mBtn !== "undefined" && mBtn) mBtn.disabled = true;
    if (btn) btn.innerText = "İŞLENİYOR...";
    if (typeof mBtn !== "undefined" && mBtn) mBtn.innerText = "İŞLENİYOR...";
    try {
      if (isReg) {
        const c = await createUserWithEmailAndPassword(auth, e, p);
        await updateProfile(c.user, { displayName: n, photoURL: a });
        window.showToast("Kayıt başarılı! Hoş geldin.", "success");
      } else {
        await signInWithEmailAndPassword(auth, e, p);
        window.showToast("Giriş yapıldı.", "success");
      }
    } catch (err) {
      window.showToast(err.message, "error");
    } finally {
      if (btn) btn.disabled = false;
      if (typeof mBtn !== "undefined" && mBtn) mBtn.disabled = false;
      toggleAuth();
    }
  };
  document.getElementById("btnLogout").onclick = () => {
    window.playGameSound("nav");
    Swal.fire({
      title: "Çıkış Yap",
      text: "Oturumu kapatmak istiyor musun?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#d4af37",
      cancelButtonColor: "#555",
      confirmButtonText: "Evet, Çık",
      cancelButtonText: "İptal",
      background: "rgba(30,30,35,0.95)",
      color: "#fff",
    }).then((result) => {
      if (result.isConfirmed) signOut(auth);
    });
  };

  document.addEventListener("visibilitychange", function () {
    if (!window.currentUser) return;
    if (document.hidden) {
      if (window.setCurrentReconnectState)
        window.setCurrentReconnectState(false);
    } else {
      if (window.setCurrentReconnectState)
        window.setCurrentReconnectState(true);
    }
    if (window.pushProfilePresence) window.pushProfilePresence();
  });
  window.addEventListener("focus", function () {
    if (!window.currentUser) return;
    if (window.setCurrentReconnectState) window.setCurrentReconnectState(true);
    if (window.pushProfilePresence) window.pushProfilePresence();
  });
  window.addEventListener("beforeunload", function () {
    if (!window.currentUser) return;
    if (window.setCurrentReconnectState) window.setCurrentReconnectState(false);
  });

  onAuthStateChanged(auth, async (u) => {
    if (u) {
      window.currentUser = u;
      document.getElementById("userInfoSection").style.display = "flex";
      document.getElementById("btnLogout").style.display = "inline-block";
      document.getElementById("btnNotifications").style.display = "inline-flex";
      document.getElementById("currentUserDisplay").innerText = u.displayName;
      document.getElementById("currentUserIcon").innerHTML =
        `<i class="fas ${u.photoURL || "fa-chess-pawn"}" style="color:var(--primary)"></i>`;
      window.switchView("view-dashboard");
      if (window.ensureUserProfile) await window.ensureUserProfile();
      if (window.startProfileHeartbeat) window.startProfileHeartbeat();
      if (window.subscribeSocialCollections)
        window.subscribeSocialCollections();
      if (window.subscribeNotificationCollection)
        window.subscribeNotificationCollection();
      if (window.loadMyTournaments) window.loadMyTournaments();
      if (window.initIdrisListener) window.initIdrisListener();
      setTimeout(function () {
        if (
          window.maybeOpenSharedAnalysisFromUrl &&
          !window.maybeOpenSharedAnalysisFromUrl()
        ) {
          if (window.scheduleDashboardReconnectPrompt)
            window.scheduleDashboardReconnectPrompt();
        }
      }, 120);
    } else {
      if (window.stopSocialListeners) window.stopSocialListeners();
      window.currentUser = null;
      document.getElementById("userInfoSection").style.display = "none";
      document.getElementById("btnLogout").style.display = "none";
      document.getElementById("btnNotifications").style.display = "none";
      window.switchView("view-auth");
    }
  });

  window.loadMyTournaments = () => {
    if (!window.currentUser) return;
    const q = query(
      collection(db, "tournaments"),
      where("participantIds", "array-contains", window.currentUser.uid),
    );
    onSnapshot(q, (snap) => {
      const l = document.getElementById("myTournamentsList");
      const mL = document.getElementById("modern_myTournamentsList");
      if (!l) return;
      l.innerHTML = "";
      if (snap.empty)
        l.innerHTML =
          '<p style="text-align:center; color:var(--text-muted)">Kayıtlı turnuva yok.</p>';
      snap.forEach((d) => {
        const t = d.data();
        const isFin = t.status === "finished";
        let actionBtn = "";
        if (isFin) {
          actionBtn += `<button class="secondary" style="margin-right:5px; font-size:0.7rem;" onclick="enterTournament('${d.id}')">Görüntüle</button>`;
          actionBtn += `<button class="secondary" style="font-size:0.7rem; color:var(--danger); border-color:var(--danger);" onclick="removeTournament('${d.id}')">Sil</button>`;
        } else {
          actionBtn = `<button class="icon-btn secondary" style="border:none" onclick="enterTournament('${d.id}')"><i class="fas fa-chevron-right"></i></button>`;
        }
        l.innerHTML += `<div class="history-item"><div><div style="font-weight:bold; ${isFin ? "color:var(--text-muted); text-decoration:line-through;" : ""}">${t.name}</div><div style="font-size:0.8rem; color:var(--text-muted);">${isFin ? "Tamamlandı" : t.status === "active" ? "Oynanıyor" : "Lobi"} #${d.id}</div></div><div>${actionBtn}</div></div>`;
      });
    });
  };

  window.removeTournament = async (tid) => {
    window.playGameSound("nav");
    const res = await Swal.fire({
      title: "Listeden Kaldır?",
      text: "Geçmişten silinecek.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      background: "rgba(30,30,35,0.95)",
      color: "#fff",
    });
    if (res.isConfirmed) {
      await updateDoc(doc(db, "tournaments", tid), {
        participantIds: arrayRemove(window.currentUser.uid),
      });
      window.showToast("Listeden kaldırıldı", "info");
    }
  };

  document.getElementById("btnCreateTournament").onclick = async () => {
    window.playGameSound("nav");
    const btn = document.getElementById("btnCreateTournament");
    const mBtn = document.getElementById("modern_btnCreateTournament");
    const n = document.getElementById("newTournamentName").value.trim(),
      c = parseInt(document.getElementById("playerCount").value);
    if (!n) return window.showToast("Lütfen bir turnuva adı girin.", "error");
    if (btn) btn.disabled = true;
    if (typeof mBtn !== "undefined" && mBtn) mBtn.disabled = true;
    if (btn) btn.innerText = "OLUŞTURULUYOR...";
    if (typeof mBtn !== "undefined" && mBtn)
      mBtn.innerText = "OLUŞTURULUYOR...";
    const shortId = window.makeId(5);
    const slots = [];
    for (let i = 0; i < c; i++)
      slots.push({
        index: i,
        name: `Masa ${i + 1}`,
        ownerId: null,
        avatar: "fa-chair",
        status: "open",
      });
    await setDoc(doc(db, "tournaments", shortId), {
      name: n,
      creatorId: window.currentUser.uid,
      status: "lobby",
      slots,
      matches: [],
      participantIds: [window.currentUser.uid],
      rules: "",
      createdAt: new Date(),
    });
    if (btn) btn.disabled = false;
    if (typeof mBtn !== "undefined" && mBtn) mBtn.disabled = false;
    if (btn) btn.innerText = "OLUŞTUR";
    if (typeof mBtn !== "undefined" && mBtn) mBtn.innerText = "OLUŞTUR";
    window.showToast("Turnuva oluşturuldu!", "success");
    if (window.enterTournament) window.enterTournament(shortId);
  };

  document.getElementById("btnJoinTournament").onclick = () => {
    const id = document
      .getElementById("joinCodeInput")
      .value.trim()
      .toUpperCase();
    if (id && window.enterTournament) window.enterTournament(id);
  };

  // Chat Widget toggle controllers
  const cw = document.getElementById("chatWidget"),
    cb = document.getElementById("chatToggleBtn");
  cb.onclick = () => {
    cw.style.display = "flex";
    cb.style.display = "none";
    document.getElementById("chatBadge").style.display = "none";
    if (window.scrollChat) window.scrollChat();
  };
  window.hideChat = () => {
    cw.style.display = "none";
    if (
      window.currentTournamentId ||
      window.current2v2Id ||
      window.current1v1Id
    )
      cb.style.display = "flex";
  };

  document.getElementById("chatInputArea").onsubmit = async (e) => {
    e.preventDefault();
    const i = document.getElementById("chatInput");
    const text = window.sanitizeUserText(i.value, 220);
    if (!text) return;
    if (
      !window.throttleAction(
        "room_chat",
        window.activeChatThreadId || "default",
        5,
        12000,
      )
    )
      return window.showToast("Sohbet limiti doldu. Biraz bekle.", "error");
    const id =
      window.activeChatThreadId ||
      window.currentTournamentId ||
      window.current2v2Id ||
      window.current1v1Id;
    await addDoc(collection(db, `tournaments/${id}/messages`), {
      text: text,
      user: window.currentUser.displayName,
      uid: window.currentUser.uid,
      createdAt: serverTimestamp(),
    });
    i.value = "";
  };
})().catch(function (err) {
  console.error("App boot failed:", err);
  window.__appBootError = err;
  if (typeof alert === "function") {
    alert(
      "HATA: " +
        (err.message || err) +
        "\n\nDosya: " +
        (err.stack
          ? err.stack.split("\n").slice(0, 3).join("\n")
          : "bilinmiyor"),
    );
  }
});
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const btn1 = document.getElementById("btnCreateTournament");
    const btn2 = document.getElementById("modern_btnCreateTournament");
    if (btn1 && btn2) btn2.onclick = btn1.onclick;
  }, 1000);
});
