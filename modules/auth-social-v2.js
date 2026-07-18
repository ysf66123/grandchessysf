import {
  getApp,
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
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
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE CONFIG & INITIALIZATION ---
let configData = {};
try {
  const configRes = await fetch("/api/config");
  if (configRes.ok) configData = await configRes.json();
} catch (e) {
  console.warn("Could not load config from /api/config", e);
}

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

const app =
  window.app || (getApps().length ? getApp() : initializeApp(firebaseConfig));
const auth = window.auth || getAuth(app);
const db = window.db || getFirestore(app);

window.app = app;
window.auth = auth;
window.db = db;

// --- CONFIG & CONSTANTS ---
const PROFILE_HEARTBEAT_MS = 25000;
const ONLINE_GRACE_MS = 70000;
const RECONNECT_GRACE_MS = 30000;
const LAST_ACTIVE_GAME_KEY = "gm_last_active_match";
const STORY_PROFILE_CACHE_PREFIX = "gm_story_profile_";
const MAX_DM_LENGTH = 220;
const MAX_CHAT_LENGTH = 220;
const MAX_NOTIFICATION_COUNT = 50;
const BOT_UID_PREFIX = "bot_1v1_";

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

// --- MUTABLE SOCIAL STATE ---
let currentUser = null;
let currentProfileData = null;
let profileUnsubscribe = null;
let profileHeartbeatInterval = null;
let friendRequestsUnsubscribe = null;
let friendInvitesUnsubscribe = null;
let friendOutgoingRequestsUnsubscribe = null;
let notificationUnsubscribe = null;
let dmThreadUnsubscribe = null;
let selectedFriendUid = null;
let friendProfileUnsubscribers = {};
let friendProfilesCache = {};
let friendRequestsCache = [];
let friendInvitesCache = [];
let notificationsCache = [];
let notificationsLoaded = false;
let currentDmMessages = [];
let activeChatThreadId = null;
let unsubscribeChat = null;
let reconnectPromptShownFor = null;
let actionRateState = {};

// Expose states to window for interoperability
Object.defineProperties(window, {
  currentUser: {
    get: () => currentUser,
    set: (val) => {
      currentUser = val;
    },
  },
  currentProfileData: {
    get: () => currentProfileData,
    set: (val) => {
      currentProfileData = val;
    },
  },
  friendProfilesCache: {
    get: () => friendProfilesCache,
    set: (val) => {
      friendProfilesCache = val;
    },
  },
  friendRequestsCache: {
    get: () => friendRequestsCache,
    set: (val) => {
      friendRequestsCache = val;
    },
  },
  friendInvitesCache: {
    get: () => friendInvitesCache,
    set: (val) => {
      friendInvitesCache = val;
    },
  },
  notificationsCache: {
    get: () => notificationsCache,
    set: (val) => {
      notificationsCache = val;
    },
  },
  activeChatThreadId: {
    get: () => activeChatThreadId,
    set: (val) => {
      activeChatThreadId = val;
    },
  },
  unsubscribeChat: {
    get: () => unsubscribeChat,
    set: (val) => {
      unsubscribeChat = val;
    },
  },
});

// --- HELPER UTILITIES ---
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char];
  });
}
window.escapeHtml = escapeHtml;

function makeId(length) {
  let result = "";
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < length; i++)
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  return result;
}
window.makeId = makeId;

function sanitizeUserText(value, maxLength) {
  var text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (maxLength && text.length > maxLength) text = text.slice(0, maxLength);
  return text;
}
window.sanitizeUserText = sanitizeUserText;

function isUserOnline(profile) {
  if (!profile || !profile.lastActiveAt) return false;
  return Date.now() - profile.lastActiveAt < ONLINE_GRACE_MS;
}
window.isUserOnline = isUserOnline;

function formatPresence(profile) {
  if (!profile || !profile.lastActiveAt) return "Durum bilinmiyor";
  if (isUserOnline(profile)) return "Çevrim içi";
  var diff = Math.max(0, Date.now() - profile.lastActiveAt);
  var minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Az önce";
  if (minutes < 60) return minutes + " dk önce";
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " sa önce";
  return Math.floor(hours / 24) + " gün önce";
}

function getFriendThreadId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

function getLobbyInviteDocId(type, roomId, fromUid, toUid) {
  return [type, roomId, fromUid, toUid].join("_");
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return "Simdi";
  var diff = Math.max(0, Date.now() - timestamp);
  if (diff < 45000) return "Az once";
  var minutes = Math.floor(diff / 60000);
  if (minutes < 60) return minutes + " dk once";
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " sa once";
  var days = Math.floor(hours / 24);
  return days + " gun once";
}

function getModeLabel(mode) {
  if (mode === "1v1") return "1v1";
  if (mode === "2v2") return "2v2";
  if (mode === "quiz") return "Quiz";
  if (mode === "tournament") return "Turnuva";
  return "Oyun";
}
window.getModeLabel = getModeLabel;

function readLocalActiveGame() {
  try {
    var raw = localStorage.getItem(LAST_ACTIVE_GAME_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
window.readLocalActiveGame = readLocalActiveGame;

function rememberLocalActiveGame(mode, code, extra) {
  if (!mode || !code) return;
  try {
    var payload = Object.assign(
      {
        mode: mode,
        code: code,
        ts: Date.now(),
        disconnectedAtMs: null,
      },
      extra || {},
    );
    localStorage.setItem(LAST_ACTIVE_GAME_KEY, JSON.stringify(payload));
  } catch (e) {}
}
window.rememberLocalActiveGame = rememberLocalActiveGame;

function markLocalActiveGameDisconnected(mode, code, disconnectedAtMs) {
  if (!mode || !code) return;
  rememberLocalActiveGame(mode, code, {
    disconnectedAtMs: disconnectedAtMs || Date.now(),
  });
}
window.markLocalActiveGameDisconnected = markLocalActiveGameDisconnected;

function clearLocalActiveGame(mode) {
  try {
    if (!mode) {
      localStorage.removeItem(LAST_ACTIVE_GAME_KEY);
      return;
    }
    var saved = readLocalActiveGame();
    if (!saved || saved.mode === mode) {
      localStorage.removeItem(LAST_ACTIVE_GAME_KEY);
    }
  } catch (e) {}
}
window.clearLocalActiveGame = clearLocalActiveGame;

function getStoryProfileCacheKey(uid) {
  return STORY_PROFILE_CACHE_PREFIX + String(uid || "guest");
}

function normalizeStoryCompletedMap(value) {
  var normalized = {};
  if (!value || typeof value !== "object") return normalized;
  Object.keys(value).forEach(function (missionId) {
    var entry = value[missionId];
    if (!entry || typeof entry !== "object") return;
    normalized[missionId] = {
      stars: Math.max(0, parseInt(entry.stars || 0, 10) || 0),
      score: Math.max(0, parseInt(entry.score || 0, 10) || 0),
      completedAtMs: Math.max(0, parseInt(entry.completedAtMs || 0, 10) || 0),
      lastCompletedAtMs: Math.max(
        0,
        parseInt(entry.lastCompletedAtMs || 0, 10) || 0,
      ),
    };
  });
  return normalized;
}

function mergeStoryCompletedMap(primary, fallback) {
  var primaryMap = normalizeStoryCompletedMap(primary);
  var fallbackMap = normalizeStoryCompletedMap(fallback);
  var merged = Object.assign({}, fallbackMap);
  Object.keys(primaryMap).forEach(function (missionId) {
    var current = primaryMap[missionId];
    var previous = fallbackMap[missionId] || {};
    merged[missionId] = {
      stars: Math.max(current.stars || 0, previous.stars || 0),
      score: Math.max(current.score || 0, previous.score || 0),
      completedAtMs: Math.min(
        current.completedAtMs || Number.MAX_SAFE_INTEGER,
        previous.completedAtMs || Number.MAX_SAFE_INTEGER,
      ),
      lastCompletedAtMs: Math.max(
        current.lastCompletedAtMs || 0,
        previous.lastCompletedAtMs || 0,
      ),
    };
    if (
      !Number.isFinite(merged[missionId].completedAtMs) ||
      merged[missionId].completedAtMs === Number.MAX_SAFE_INTEGER
    ) {
      merged[missionId].completedAtMs = Math.max(
        current.completedAtMs || 0,
        previous.completedAtMs || 0,
      );
    }
  });
  return merged;
}

function normalizeStoryOwnedPieceSets(value) {
  var owned = Array.isArray(value)
    ? value
        .filter(Boolean)
        .map(function (item) {
          return String(item).trim();
        })
        .filter(Boolean)
    : [];
  if (owned.indexOf("neo") === -1) owned.unshift("neo");
  return Array.from(new Set(owned));
}

function buildStoryProfileState(source) {
  var state = source && typeof source === "object" ? source : {};
  var owned = normalizeStoryOwnedPieceSets(state.storyOwnedPieceSets);
  var active =
    typeof state.activePieceSet === "string" &&
    owned.indexOf(state.activePieceSet) !== -1
      ? state.activePieceSet
      : "neo";
  return {
    storyPoints: Math.max(0, parseInt(state.storyPoints || 0, 10) || 0),
    storyStars: Math.max(0, parseInt(state.storyStars || 0, 10) || 0),
    storyCompleted: normalizeStoryCompletedMap(state.storyCompleted),
    storyOwnedPieceSets: owned,
    activePieceSet: active,
    storyStateUpdatedAtMs: Math.max(
      0,
      parseInt(state.storyStateUpdatedAtMs || 0, 10) || 0,
    ),
  };
}

function mergeStoryProfileState(primary, fallback) {
  var primaryState = buildStoryProfileState(primary);
  var fallbackState = buildStoryProfileState(fallback);
  var primaryFreshness = primaryState.storyStateUpdatedAtMs || 0;
  var fallbackFreshness = fallbackState.storyStateUpdatedAtMs || 0;
  var preferred =
    fallbackFreshness > primaryFreshness ? fallbackState : primaryState;
  var secondary = preferred === primaryState ? fallbackState : primaryState;
  var owned = Array.from(
    new Set(
      [].concat(preferred.storyOwnedPieceSets, secondary.storyOwnedPieceSets, [
        "neo",
      ]),
    ),
  );
  var active = preferred.activePieceSet;
  if (owned.indexOf(active) === -1) {
    active =
      owned.indexOf(secondary.activePieceSet) !== -1
        ? secondary.activePieceSet
        : "neo";
  }
  return {
    storyPoints: preferred.storyPoints,
    storyStars: preferred.storyStars,
    storyCompleted: mergeStoryCompletedMap(
      preferred.storyCompleted,
      secondary.storyCompleted,
    ),
    storyOwnedPieceSets: owned,
    activePieceSet: active,
    storyStateUpdatedAtMs: Math.max(primaryFreshness, fallbackFreshness),
  };
}

function readStoryProfileCache(uid) {
  if (!uid) return null;
  try {
    var raw = localStorage.getItem(getStoryProfileCacheKey(uid));
    if (!raw) return null;
    return mergeStoryProfileState(JSON.parse(raw), null);
  } catch (e) {
    return null;
  }
}

function writeStoryProfileCache(uid, profileData) {
  if (!uid) return;
  try {
    localStorage.setItem(
      getStoryProfileCacheKey(uid),
      JSON.stringify(buildStoryProfileState(profileData)),
    );
  } catch (e) {}
}

function normalizeProfileWithStoryState(profileData, fallbackStoryState) {
  var baseProfile =
    profileData && typeof profileData === "object"
      ? Object.assign({}, profileData)
      : {};
  var nextStoryState = mergeStoryProfileState(
    baseProfile,
    fallbackStoryState ||
      readStoryProfileCache(
        baseProfile.uid || (currentUser && currentUser.uid),
      ),
  );
  return Object.assign(baseProfile, nextStoryState);
}

function syncCurrentProfileStoryState(storyPatch) {
  if (!currentUser) return null;
  currentProfileData = normalizeProfileWithStoryState(
    Object.assign({}, currentProfileData || {}, storyPatch || {}, {
      uid: currentUser.uid,
    }),
  );
  writeStoryProfileCache(currentUser.uid, currentProfileData);
  return currentProfileData;
}

function throttleAction(bucket, key, maxCount, windowMs) {
  var stateKey = bucket + ":" + (key || "global");
  var now = Date.now();
  var recent = (actionRateState[stateKey] || []).filter(function (ts) {
    return now - ts < windowMs;
  });
  if (recent.length >= maxCount) return false;
  recent.push(now);
  actionRateState[stateKey] = recent;
  return true;
}
window.throttleAction = throttleAction;

function getBaseShareUrl() {
  if (window.getAppBaseUrl) return window.getAppBaseUrl();
  return window.location.origin + window.location.pathname;
}

function replaceUrlParams(paramsToDelete) {
  try {
    var url = new URL(window.location.href);
    paramsToDelete.forEach(function (key) {
      url.searchParams.delete(key);
    });
    window.history.replaceState(
      {},
      document.title,
      url.pathname +
        (url.searchParams.toString() ? "?" + url.searchParams.toString() : ""),
    );
  } catch (e) {}
}

function isBotUid(uid) {
  return !!uid && String(uid).indexOf(BOT_UID_PREFIX) === 0;
}
window.isBotUid = isBotUid;

function getReconnectWinnerFromPlayers(mode, players) {
  if (!Array.isArray(players) || !players.length) return null;
  const getTeamOpponent = (team) => (team === "white" ? "black" : "white");
  if (mode === "1v1") {
    if (players.length >= 2) return "draw";
    return getTeamOpponent(players[0].team);
  }
  return getTeamOpponent(players[0].team);
}

function getCurrentReconnectContext() {
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
}
window.getCurrentReconnectContext = getCurrentReconnectContext;

function getCurrentPresenceActivity() {
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
}

function getNotificationTypeMeta(type) {
  if (type === "friend_request")
    return { icon: "fa-user-plus", accent: "#38bdf8" };
  if (type === "friend_accept")
    return { icon: "fa-user-check", accent: "#4ade80" };
  if (type === "lobby_invite")
    return { icon: "fa-paper-plane", accent: "#facc15" };
  if (type === "dm") return { icon: "fa-comment-dots", accent: "#a78bfa" };
  if (type === "match_update")
    return { icon: "fa-chess-board", accent: "#fb7185" };
  return { icon: "fa-bell", accent: "#38bdf8" };
}

function buildNotificationSkeletonHtml() {
  return [
    '<div class="skeleton-card"><div class="skeleton-line medium"></div><div class="skeleton-line long"></div><div class="skeleton-line short"></div></div>',
    '<div class="skeleton-card"><div class="skeleton-line medium"></div><div class="skeleton-line long"></div><div class="skeleton-line short"></div></div>',
    '<div class="skeleton-card"><div class="skeleton-line medium"></div><div class="skeleton-line long"></div><div class="skeleton-line short"></div></div>',
  ].join("");
}

function buildFriendProfileSkeletonHtml() {
  return [
    '<div class="friend-profile-shell">',
    '<div class="friend-profile-hero">',
    '<div class="friend-profile-avatar skeleton-block"></div>',
    '<div class="profile-stack">',
    '<div class="skeleton-line medium"></div>',
    '<div class="skeleton-line long"></div>',
    "</div>",
    '<div class="profile-stack">',
    '<div class="skeleton-line short"></div>',
    '<div class="skeleton-line medium"></div>',
    "</div>",
    "</div>",
    '<div class="friend-profile-grid">',
    '<div class="skeleton-card"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div>',
    '<div class="skeleton-card"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div>',
    '<div class="skeleton-card"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div>',
    '<div class="skeleton-card"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div>',
    "</div>",
    "</div>",
  ].join("");
}

async function pushNotificationToUser(toUid, payload) {
  if (!toUid || !payload || !payload.title) return;
  var notificationId = [toUid, Date.now(), makeId(4)].join("_");
  try {
    await setDoc(
      doc(db, "notifications", notificationId),
      {
        toUid: toUid,
        type: payload.type || "generic",
        title: sanitizeUserText(payload.title, 80),
        body: sanitizeUserText(payload.body || "", 220),
        action: payload.action || null,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        read: false,
      },
      { merge: true },
    );
  } catch (e) {}
}
window.pushNotificationToUser = pushNotificationToUser;

async function generateUniqueFriendCode() {
  for (var attempt = 0; attempt < 8; attempt++) {
    var code = makeId(6);
    var snap = await getDocs(
      query(collection(db, "profiles"), where("friendCode", "==", code)),
    );
    var isAvailable = true;
    snap.forEach(function (docSnap) {
      if (docSnap.id !== currentUser.uid) isAvailable = false;
    });
    if (isAvailable) return code;
  }
  return makeId(6);
}

function stopFriendProfileSubscriptions() {
  Object.keys(friendProfileUnsubscribers).forEach(function (uid) {
    try {
      friendProfileUnsubscribers[uid]();
    } catch (e) {}
  });
  friendProfileUnsubscribers = {};
  friendProfilesCache = {};
}

function stopSocialListeners() {
  if (profileUnsubscribe) profileUnsubscribe();
  if (friendRequestsUnsubscribe) friendRequestsUnsubscribe();
  if (friendInvitesUnsubscribe) friendInvitesUnsubscribe();
  if (friendOutgoingRequestsUnsubscribe) friendOutgoingRequestsUnsubscribe();
  if (notificationUnsubscribe) notificationUnsubscribe();
  if (dmThreadUnsubscribe) dmThreadUnsubscribe();
  if (profileHeartbeatInterval) clearInterval(profileHeartbeatInterval);
  profileUnsubscribe = null;
  friendRequestsUnsubscribe = null;
  friendInvitesUnsubscribe = null;
  friendOutgoingRequestsUnsubscribe = null;
  notificationUnsubscribe = null;
  dmThreadUnsubscribe = null;
  profileHeartbeatInterval = null;
  selectedFriendUid = null;
  currentDmMessages = [];
  currentProfileData = null;
  friendRequestsCache = [];
  friendInvitesCache = [];
  notificationsCache = [];
  notificationsLoaded = false;
  stopFriendProfileSubscriptions();
  updateFriendsSummary();
  updateNotificationSummary();
}

async function ensureUserProfile() {
  if (!currentUser) return;
  var profileRef = doc(db, "profiles", currentUser.uid);
  var snap = await getDoc(profileRef);
  var existing = snap.exists() ? snap.data() || {} : {};
  var cachedStoryState = readStoryProfileCache(currentUser.uid);
  var mergedStoryState = mergeStoryProfileState(existing, cachedStoryState);
  if (!mergedStoryState.storyStateUpdatedAtMs)
    mergedStoryState.storyStateUpdatedAtMs = Date.now();
  var friendCode = existing.friendCode || (await generateUniqueFriendCode());
  var activity = getCurrentPresenceActivity();
  await setDoc(
    profileRef,
    {
      uid: currentUser.uid,
      displayName: currentUser.displayName || existing.displayName || "Oyuncu",
      avatar: currentUser.photoURL || existing.avatar || "fa-chess-pawn",
      email: currentUser.email || existing.email || "",
      friendCode: friendCode,
      friends: Array.isArray(existing.friends) ? existing.friends : [],
      storyPoints: mergedStoryState.storyPoints,
      storyStars: mergedStoryState.storyStars,
      storyCompleted: mergedStoryState.storyCompleted,
      storyOwnedPieceSets: mergedStoryState.storyOwnedPieceSets,
      activePieceSet: mergedStoryState.activePieceSet,
      storyStateUpdatedAtMs: mergedStoryState.storyStateUpdatedAtMs,
      lastActiveAt: Date.now(),
      lastView: window.currentViewId,
      activeMode: activity.activeMode,
      activeRoomId: activity.activeRoomId,
      activeRoomCode: activity.activeRoomCode,
      activeGameStatus: activity.activeGameStatus,
      activeRole: activity.activeRole,
    },
    { merge: true },
  );

  currentProfileData = normalizeProfileWithStoryState(
    Object.assign(
      {},
      existing,
      {
        uid: currentUser.uid,
        displayName:
          currentUser.displayName || existing.displayName || "Oyuncu",
        avatar: currentUser.photoURL || existing.avatar || "fa-chess-pawn",
        email: currentUser.email || existing.email || "",
        friendCode: friendCode,
        friends: Array.isArray(existing.friends) ? existing.friends : [],
      },
      mergedStoryState,
    ),
    cachedStoryState,
  );
  writeStoryProfileCache(currentUser.uid, currentProfileData);

  if (profileUnsubscribe) profileUnsubscribe();
  profileUnsubscribe = onSnapshot(profileRef, function (profileSnap) {
    currentProfileData = profileSnap.exists()
      ? normalizeProfileWithStoryState(
          profileSnap.data(),
          readStoryProfileCache(currentUser && currentUser.uid),
        )
      : null;
    if (currentProfileData && currentUser)
      writeStoryProfileCache(currentUser.uid, currentProfileData);
    syncFriendProfileSubscriptions();
    updateFriendsSummary();
    renderFriendsView();
    if (window.renderStoryMode && window.currentViewId === "view-story-mode")
      window.renderStoryMode();
    if (window.renderStoryShop && window.currentViewId === "view-story-shop")
      window.renderStoryShop();
  });
}

async function pushProfilePresence() {
  if (!currentUser) return;
  try {
    var activity = getCurrentPresenceActivity();
    await setDoc(
      doc(db, "profiles", currentUser.uid),
      {
        displayName: currentUser.displayName || "Oyuncu",
        avatar: currentUser.photoURL || "fa-chess-pawn",
        lastActiveAt: Date.now(),
        lastView: window.currentViewId,
        activeMode: activity.activeMode,
        activeRoomId: activity.activeRoomId,
        activeRoomCode: activity.activeRoomCode,
        activeGameStatus: activity.activeGameStatus,
        activeRole: activity.activeRole,
      },
      { merge: true },
    );
  } catch (e) {}
}
window.pushProfilePresence = pushProfilePresence;

function startProfileHeartbeat() {
  if (profileHeartbeatInterval) clearInterval(profileHeartbeatInterval);
  pushProfilePresence();
  profileHeartbeatInterval = setInterval(
    pushProfilePresence,
    PROFILE_HEARTBEAT_MS,
  );
}

function syncFriendProfileSubscriptions() {
  var friendIds =
    currentProfileData && Array.isArray(currentProfileData.friends)
      ? currentProfileData.friends
      : [];
  var activeMap = {};
  friendIds.forEach(function (uid) {
    activeMap[uid] = true;
  });

  Object.keys(friendProfileUnsubscribers).forEach(function (uid) {
    if (!activeMap[uid]) {
      try {
        friendProfileUnsubscribers[uid]();
      } catch (e) {}
      delete friendProfileUnsubscribers[uid];
      delete friendProfilesCache[uid];
    }
  });

  friendIds.forEach(function (uid) {
    if (friendProfileUnsubscribers[uid]) return;
    friendProfileUnsubscribers[uid] = onSnapshot(
      doc(db, "profiles", uid),
      function (snap) {
        if (snap.exists()) {
          friendProfilesCache[uid] = Object.assign({ uid: uid }, snap.data());
        } else {
          delete friendProfilesCache[uid];
        }
        updateFriendsSummary();
        renderFriendsView();
      },
    );
  });
}

function updateFriendsSummary() {
  var friendIds =
    currentProfileData && Array.isArray(currentProfileData.friends)
      ? currentProfileData.friends
      : [];
  var onlineCount = friendIds.filter(function (uid) {
    return isUserOnline(friendProfilesCache[uid]);
  }).length;
  [
    "friendsOnlineCount",
    "modern_friendsOnlineCount",
    "friendsOnlineCountView",
  ].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.innerText = onlineCount;
  });
  var requestCount = getIncomingPendingFriendRequests().length;
  var inviteCount = friendInvitesCache.filter(function (inv) {
    return inv.status === "pending";
  }).length;
  var reqEl = document.getElementById("friendsRequestCount");
  var mReqEl = document.getElementById("modern_friendsRequestCount");
  var inviteEl = document.getElementById("friendsInviteCount");
  if (reqEl) if (reqEl) reqEl.innerText = requestCount;
  if(typeof mReqEl !== 'undefined' && mReqEl) mReqEl.innerText = requestCount;
  if (inviteEl) inviteEl.innerText = inviteCount;
  var friendCodeEl = document.getElementById("friendCodeDisplay");
  if (friendCodeEl)
    friendCodeEl.innerText =
      currentProfileData && currentProfileData.friendCode
        ? currentProfileData.friendCode
        : "......";
  updateNotificationSummary();
}

function updateNotificationSummary() {
  var btn = document.getElementById("btnNotifications");
  var badge = document.getElementById("notificationBadge");
  if (btn) btn.style.display = currentUser ? "inline-flex" : "none";
  if (!badge) return;
  var unread = getNotificationFeedItems().filter(function (item) {
    return !item.read;
  }).length;
  if (unread > 0) {
    badge.style.display = "flex";
    badge.innerText = unread > 99 ? "99+" : String(unread);
  } else {
    badge.style.display = "none";
  }
}

function getNotificationFeedItems() {
  var derivedFriendRequests = getIncomingPendingFriendRequests().map(
    function (req) {
      return {
        id: "friend_request_" + req.id,
        type: "friend_request",
        title: (req.fromName || "Oyuncu") + " senden arkadaslik istiyor",
        body: "Kodu: " + (req.fromCode || "------"),
        createdAtMs: req.createdAtMs || 0,
        read: false,
        action: { type: "open_friends" },
        isDerived: true,
      };
    },
  );
  var derivedInvites = friendInvitesCache
    .filter(function (inv) {
      return inv.status === "pending";
    })
    .map(function (inv) {
      return {
        id: "social_invite_" + inv.id,
        type: "lobby_invite",
        title: (inv.fromName || "Oyuncu") + " seni davet etti",
        body:
          (inv.roomLabel || inv.type || "Lobi") +
          " • " +
          (inv.roomCode || inv.roomId || ""),
        createdAtMs: inv.createdAtMs || 0,
        read: false,
        action: { type: "open_friends" },
        isDerived: true,
      };
    });
  return notificationsCache
    .concat(derivedFriendRequests, derivedInvites)
    .sort(function (a, b) {
      return (b.createdAtMs || 0) - (a.createdAtMs || 0);
    });
}

function renderNotificationsCenter() {
  var list = document.getElementById("notificationsList");
  if (!list) return;
  if (!notificationsLoaded) {
    list.innerHTML = buildNotificationSkeletonHtml();
    return;
  }
  var items = getNotificationFeedItems();
  if (!items.length) {
    list.innerHTML =
      '<div class="friend-empty">Bildirim yok. Yeni istekler, davetler ve DM uyarıları burada görünür.</div>';
    return;
  }
  list.innerHTML = "";
  items.slice(0, MAX_NOTIFICATION_COUNT).forEach(function (item) {
    var meta = getNotificationTypeMeta(item.type);
    var card = document.createElement("div");
    card.className = "notification-card" + (!item.read ? " unread" : "");
    card.innerHTML =
      "" +
      '<div class="notification-icon" style="color:' +
      meta.accent +
      ';"><i class="fas ' +
      meta.icon +
      '"></i></div>' +
      "<div>" +
      '<div class="notification-title">' +
      escapeHtml(item.title || "Bildirim") +
      "</div>" +
      '<div class="notification-body">' +
      escapeHtml(item.body || "") +
      "</div>" +
      '<div class="notification-actions">' +
      '<button class="secondary" style="padding:8px 12px; font-size:0.72rem;" onclick="openNotificationAction(\'' +
      item.id +
      "')\">AC</button>" +
      '<button class="secondary" style="padding:8px 12px; font-size:0.72rem;" onclick="markNotificationRead(\'' +
      item.id +
      "')\">OKUNDU</button>" +
      "</div>" +
      "</div>" +
      '<div class="notification-meta">' +
      escapeHtml(formatTimeAgo(item.createdAtMs)) +
      "</div>";
    list.appendChild(card);
  });
}

function subscribeNotificationCollection() {
  if (!currentUser) return;
  if (notificationUnsubscribe) notificationUnsubscribe();
  notificationsLoaded = false;
  renderNotificationsCenter();
  notificationUnsubscribe = onSnapshot(
    query(
      collection(db, "notifications"),
      where("toUid", "==", currentUser.uid),
    ),
    function (snapshot) {
      notificationsCache = snapshot.docs
        .map(function (docSnap) {
          return Object.assign({ id: docSnap.id }, docSnap.data());
        })
        .sort(function (a, b) {
          return (b.createdAtMs || 0) - (a.createdAtMs || 0);
        });
      notificationsLoaded = true;
      updateNotificationSummary();
      renderNotificationsCenter();
    },
  );
}

window.openNotificationsCenter = function () {
  var modal = document.getElementById("notificationsModal");
  if (!modal) return;
  modal.style.display = "flex";
  renderNotificationsCenter();
  window.markAllNotificationsRead();
};

window.closeNotificationsCenter = function () {
  var modal = document.getElementById("notificationsModal");
  if (modal) modal.style.display = "none";
};

window.markNotificationRead = async function (notificationId) {
  if (
    String(notificationId || "").indexOf("friend_request_") === 0 ||
    String(notificationId || "").indexOf("social_invite_") === 0
  )
    return;
  var item = notificationsCache.find(function (entry) {
    return entry.id === notificationId;
  });
  if (!item || item.read) return;
  try {
    await updateDoc(doc(db, "notifications", notificationId), {
      read: true,
      readAtMs: Date.now(),
    });
  } catch (e) {}
};

window.markAllNotificationsRead = async function () {
  var unread = notificationsCache.filter(function (item) {
    return !item.read;
  });
  if (!unread.length) return;
  await Promise.all(
    unread.slice(0, 12).map(function (item) {
      return updateDoc(doc(db, "notifications", item.id), {
        read: true,
        readAtMs: Date.now(),
      }).catch(function () {});
    }),
  );
};

window.openNotificationAction = async function (notificationId) {
  var item = getNotificationFeedItems().find(function (entry) {
    return entry.id === notificationId;
  });
  if (!item) return;
  await window.markNotificationRead(notificationId);
  var action = item.action || {};
  if (action.type === "friend_dm" && action.uid) {
    window.openFriendsView();
    window.selectFriend(action.uid);
    window.closeNotificationsCenter();
    return;
  }
  if (action.type === "analysis_share" && action.shareId) {
    window.closeNotificationsCenter();
    if (window.openSharedAnalysisById)
      window.openSharedAnalysisById(action.shareId);
    return;
  }
  if (action.type === "watch_game" && action.mode && action.code) {
    window.closeNotificationsCenter();
    if (action.mode === "1v1") window.enter1v1Game(action.code);
    else if (action.mode === "2v2") window.enter2v2Game(action.code);
    return;
  }
  if (action.type === "reconnect" && action.mode && action.code) {
    window.closeNotificationsCenter();
    if (action.mode === "1v1") window.enter1v1Game(action.code);
    else if (action.mode === "2v2") window.enter2v2Game(action.code);
    return;
  }
  window.openFriendsView();
  window.closeNotificationsCenter();
};

function renderFriendsView() {
  renderFriendRequests();
  renderFriendInvites();
  renderFriendsList();
  renderDmThread();
}
window.renderFriendsView = renderFriendsView;

function isUserFriend(targetUid) {
  var friendIds =
    currentProfileData && Array.isArray(currentProfileData.friends)
      ? currentProfileData.friends
      : [];
  return !!targetUid && friendIds.indexOf(targetUid) !== -1;
}

async function ensureCurrentUserHasFriend(targetUid) {
  if (
    !currentUser ||
    !targetUid ||
    targetUid === currentUser.uid ||
    isBotUid(targetUid)
  )
    return false;
  if (isUserFriend(targetUid)) return true;
  try {
    await setDoc(
      doc(db, "profiles", currentUser.uid),
      {
        friends: arrayUnion(targetUid),
      },
      { merge: true },
    );
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function syncAcceptedFriendshipRequestsForCurrentUser(requests) {
  if (!currentUser || !Array.isArray(requests) || !requests.length) return;
  requests.forEach(function (req) {
    if (!req || req.status !== "accepted") return;
    var counterpartUid = null;
    if (req.fromUid === currentUser.uid) counterpartUid = req.toUid;
    else if (req.toUid === currentUser.uid) counterpartUid = req.fromUid;
    if (!counterpartUid || isUserFriend(counterpartUid)) return;
    ensureCurrentUserHasFriend(counterpartUid);
  });
}

function getProfileActivityText(profile) {
  if (!profile || !profile.activeMode || !profile.activeGameStatus)
    return "Aktif maç yok";
  var modeLabel = getModeLabel(profile.activeMode);
  if (profile.activeGameStatus === "active") return modeLabel + " maçında";
  if (profile.activeGameStatus === "lobby") return modeLabel + " lobisinde";
  return modeLabel + " ekraninda";
}

function getFriendLiveWatchData(profile) {
  if (!profile || profile.activeGameStatus !== "active") return null;
  if (profile.activeMode !== "1v1" && profile.activeMode !== "2v2") return null;
  var code =
    profile.activeRoomCode ||
    profile.activeRoomId ||
    profile.activeGameCode ||
    null;
  if (!code) return null;
  return {
    mode: profile.activeMode,
    code: String(code).trim().toUpperCase(),
    label: getModeLabel(profile.activeMode),
  };
}

function getPendingIncomingFriendRequest(targetUid) {
  return (
    friendRequestsCache.find(function (req) {
      return (
        req.status === "pending" &&
        req.toUid === currentUser.uid &&
        req.fromUid === targetUid
      );
    }) || null
  );
}

function getIncomingPendingFriendRequests() {
  if (!currentUser) return [];
  return friendRequestsCache.filter(function (req) {
    return (
      req &&
      req.status === "pending" &&
      req.toUid === currentUser.uid &&
      req.fromUid !== currentUser.uid
    );
  });
}

async function sendFriendRequestToUid(targetUid, targetProfileOverride) {
  if (!currentUser || !currentProfileData) return false;
  if (!targetUid) {
    window.showToast("Oyuncu bulunamadı.", "error");
    return false;
  }
  if (targetUid === currentUser.uid) {
    window.showToast("Kendine istek gönderemezsin.", "error");
    return false;
  }
  if (isUserFriend(targetUid)) {
    window.showToast("Bu kullanıcı zaten arkadaş listende.", "info");
    return false;
  }

  try {
    var targetProfile = targetProfileOverride;
    if (!targetProfile) {
      var targetSnap = await getDoc(doc(db, "profiles", targetUid));
      if (!targetSnap.exists()) {
        window.showToast("Oyuncu profili bulunamadı.", "error");
        return false;
      }
      targetProfile = targetSnap.data() || {};
    }

    var reverseRequestRef = doc(
      db,
      "friend_requests",
      targetUid + "_" + currentUser.uid,
    );
    var reverseRequestSnap = await getDoc(reverseRequestRef);
    if (
      reverseRequestSnap.exists() &&
      reverseRequestSnap.data().status === "pending"
    ) {
      await window.acceptFriendRequest(reverseRequestSnap.id);
      return true;
    }

    var requestRef = doc(
      db,
      "friend_requests",
      currentUser.uid + "_" + targetUid,
    );
    var requestSnap = await getDoc(requestRef);
    if (requestSnap.exists() && requestSnap.data().status === "pending") {
      window.showToast("Arkadaşlık isteği zaten gönderildi.", "info");
      return false;
    }

    await setDoc(
      requestRef,
      {
        fromUid: currentUser.uid,
        fromName: currentUser.displayName || "Oyuncu",
        fromAvatar: currentUser.photoURL || "fa-chess-pawn",
        fromCode: currentProfileData.friendCode || "",
        toUid: targetUid,
        toName: targetProfile.displayName || "Oyuncu",
        toAvatar: targetProfile.avatar || "fa-user",
        status: "pending",
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      },
      { merge: true },
    );

    window.showToast("Arkadaşlık isteği gönderildi.", "success");
    return true;
  } catch (e) {
    console.error(e);
    window.showToast("Arkadaşlık isteği gönderilemedi.", "error");
    return false;
  }
}

function appendLobbyFriendButton(container, targetUid) {
  if (
    !container ||
    !targetUid ||
    !currentUser ||
    targetUid === currentUser.uid ||
    isBotUid(targetUid) ||
    isUserFriend(targetUid)
  )
    return;
  var incomingRequest = getPendingIncomingFriendRequest(targetUid);
  var button = document.createElement("button");
  button.type = "button";
  button.className = "mini-social-btn" + (incomingRequest ? " accept" : "");
  button.innerHTML = incomingRequest
    ? '<i class="fas fa-user-check"></i>'
    : '<i class="fas fa-user-plus"></i>';
  button.title = incomingRequest
    ? "Arkadaşlık isteğini kabul et"
    : "Arkadaş ekle";
  button.onclick = function (event) {
    event.stopPropagation();
    if (incomingRequest) {
      window.acceptFriendRequest(incomingRequest.id);
    } else {
      window.sendFriendRequestToPlayer(targetUid);
    }
  };
  container.appendChild(button);
}
window.appendLobbyFriendButton = appendLobbyFriendButton;

window.sendFriendRequestToPlayer = function (targetUid) {
  return sendFriendRequestToUid(targetUid);
};

function renderEmptyState(containerId, message) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="friend-empty">' + message + "</div>";
}

function renderFriendRequests() {
  var container = document.getElementById("friendRequestsList");
  if (!container) return;
  var items = getIncomingPendingFriendRequests().sort(function (a, b) {
    return (b.createdAtMs || 0) - (a.createdAtMs || 0);
  });
  if (!items.length)
    return renderEmptyState(
      "friendRequestsList",
      "Bekleyen arkadaşlık isteği yok.",
    );
  container.innerHTML = "";
  items.forEach(function (req) {
    var row = document.createElement("div");
    row.className = "friend-request-row";
    row.innerHTML = `
            <div class="friend-avatar"><i class="fas ${escapeHtml(req.fromAvatar || "fa-user")}" ></i></div>
            <div class="friend-meta">
                <div class="friend-name">${escapeHtml(req.fromName || "Oyuncu")}</div>
                <div class="friend-sub">Kod: ${escapeHtml(req.fromCode || "------")}</div>
            </div>
            <div class="friend-actions">
                <button style="padding:8px 12px; font-size:0.7rem;" onclick="acceptFriendRequest('${req.id}')">KABUL</button>
                <button class="secondary" style="padding:8px 12px; font-size:0.7rem;" onclick="declineFriendRequest('${req.id}')">RED</button>
            </div>`;
    container.appendChild(row);
  });
}

function renderFriendInvites() {
  var container = document.getElementById("friendInvitesList");
  if (!container) return;
  var items = friendInvitesCache
    .filter(function (inv) {
      return inv.status === "pending";
    })
    .sort(function (a, b) {
      return (b.createdAtMs || 0) - (a.createdAtMs || 0);
    });
  if (!items.length)
    return renderEmptyState("friendInvitesList", "Bekleyen oyun daveti yok.");
  container.innerHTML = "";
  items.forEach(function (inv) {
    var row = document.createElement("div");
    row.className = "invite-row";
    row.innerHTML = `
            <div class="friend-avatar"><i class="fas ${escapeHtml(inv.fromAvatar || "fa-user")}"></i></div>
            <div class="friend-meta">
                <div class="friend-name">${escapeHtml(inv.fromName || "Oyuncu")}</div>
                <div class="friend-sub">
                    <span class="invite-type-pill">${escapeHtml(inv.type || "oyun")}</span>
                    <span>${escapeHtml(inv.roomLabel || inv.roomCode || "Lobi")}</span>
                </div>
            </div>
            <div class="friend-actions">
                <button style="padding:8px 12px; font-size:0.7rem;" onclick="acceptFriendInvite('${inv.id}')">KATIL</button>
                <button class="secondary" style="padding:8px 12px; font-size:0.7rem;" onclick="dismissFriendInvite('${inv.id}')">KAPAT</button>
            </div>`;
    container.appendChild(row);
  });
}

function renderFriendsList() {
  var container = document.getElementById("friendsList");
  if (!container) return;
  var friendIds =
    currentProfileData && Array.isArray(currentProfileData.friends)
      ? currentProfileData.friends.slice()
      : [];
  if (!friendIds.length)
    return renderEmptyState("friendsList", "Henüz arkadaşın yok.");
  friendIds.sort(function (a, b) {
    var aProfile = friendProfilesCache[a];
    var bProfile = friendProfilesCache[b];
    var onlineDiff =
      Number(isUserOnline(bProfile)) - Number(isUserOnline(aProfile));
    if (onlineDiff !== 0) return onlineDiff;
    return String((aProfile && aProfile.displayName) || a).localeCompare(
      String((bProfile && bProfile.displayName) || b),
      "tr",
    );
  });
  container.innerHTML = "";
  friendIds.forEach(function (uid) {
    var profile = friendProfilesCache[uid] || {
      uid: uid,
      displayName: "Yükleniyor...",
      avatar: "fa-user",
    };
    var isSelected = selectedFriendUid === uid;
    var watchData = getFriendLiveWatchData(profile);
    var canWatch = !!watchData;
    var row = document.createElement("div");
    row.className = "friend-card-row" + (canWatch ? " live" : "");
    if (canWatch) {
      row.setAttribute("title", watchData.label + " maçını izlemek için tıkla");
      row.setAttribute(
        "aria-label",
        (profile.displayName || "Arkadaş") + " canlı maçta, izlemek için tıkla",
      );
    }
    row.style.borderColor = isSelected
      ? "rgba(0, 242, 255, 0.35)"
      : "rgba(255,255,255,0.06)";
    row.onclick = function () {
      if (canWatch) window.watchFriendGame(uid);
      else window.openFriendProfile(uid);
    };
    var watchBtn = "";
    if (canWatch) {
      watchBtn = `<button class="secondary friend-watch-btn" onclick="event.stopPropagation(); watchFriendGame('${uid}')"><i class="fas fa-eye"></i> Maçı İzle</button>`;
    }
    row.innerHTML = `
            <div class="friend-avatar"><i class="fas ${escapeHtml(profile.avatar || "fa-user")}"></i></div>
            <div class="friend-meta">
                <div class="friend-name">${escapeHtml(profile.displayName || uid)} ${canWatch ? '<span class="friend-live-chip"><i class="fas fa-circle"></i> Canlı ' + escapeHtml(watchData.label) + "</span>" : ""}</div>
                <div class="friend-sub">
                    <span class="status-dot ${isUserOnline(profile) ? "online" : "offline"}"></span>
                    <span>${escapeHtml(formatPresence(profile))}</span>
                    <span>•</span>
                    <span>${escapeHtml(getProfileActivityText(profile))}</span>
                    ${canWatch ? "<span>•</span><span>Oda: " + escapeHtml(watchData.code) + "</span>" : ""}
                </div>
            </div>
            <div class="friend-actions">
                ${watchBtn}
                <button class="secondary" style="padding:8px 12px; font-size:0.7rem;" onclick="event.stopPropagation(); openFriendProfile('${uid}')">Profil</button>
                <button class="secondary" style="padding:8px 12px; font-size:0.7rem;" onclick="event.stopPropagation(); selectFriend('${uid}')">DM</button>
                <button style="padding:8px 12px; font-size:0.7rem;" onclick="event.stopPropagation(); quickInviteFriend('${uid}')">DAVET</button>
            </div>`;
    container.appendChild(row);
  });
}

function renderDmThread() {
  var emptyState = document.getElementById("dmEmptyState");
  var panel = document.getElementById("dmPanelContent");
  var thread = document.getElementById("dmThread");
  if (!emptyState || !panel || !thread) return;

  if (!selectedFriendUid) {
    emptyState.style.display = "flex";
    panel.style.display = "none";
    return;
  }

  var friendProfile = friendProfilesCache[selectedFriendUid] || {};
  emptyState.style.display = "none";
  panel.style.display = "block";
  document.getElementById("dmCurrentName").innerText =
    friendProfile.displayName || "Arkadaş";
  document.getElementById("dmCurrentStatus").innerText =
    formatPresence(friendProfile);
  thread.innerHTML = "";

  if (!currentDmMessages.length) {
    thread.innerHTML =
      '<div class="friend-empty">Henüz mesaj yok. İlk mesajı sen gönder.</div>';
    return;
  }

  currentDmMessages.forEach(function (message) {
    var row = document.createElement("div");
    row.className =
      "dm-bubble-row" + (message.uid === currentUser.uid ? " me" : "");
    var bubble = document.createElement("div");
    bubble.className = "dm-bubble";
    bubble.innerText = message.text || "";
    row.appendChild(bubble);
    thread.appendChild(row);
  });
  thread.scrollTop = thread.scrollHeight;
}

async function loadFriendProfileStats(uid) {
  var profile = friendProfilesCache[uid] || {};
  var results = {
    totalFriends: Array.isArray(profile.friends) ? profile.friends.length : 0,
    totalMatches: 0,
    wins1v1: 0,
    draws1v1: 0,
    losses1v1: 0,
    wins2v2: 0,
    draws2v2: 0,
    losses2v2: 0,
    lastMatches: [],
  };

  var queries = await Promise.all([
    getDocs(
      query(
        collection(db, "games_1v1"),
        where("participantIds", "array-contains", uid),
      ),
    ).catch(function () {
      return null;
    }),
    getDocs(
      query(
        collection(db, "games_2v2"),
        where("participantIds", "array-contains", uid),
      ),
    ).catch(function () {
      return null;
    }),
  ]);

  queries.forEach(function (snapshot, index) {
    if (!snapshot) return;
    snapshot.forEach(function (docSnap) {
      var game = docSnap.data() || {};
      if (game.status !== "finished") return;
      var player = Array.isArray(game.players)
        ? game.players.find(function (item) {
            return item.uid === uid;
          })
        : null;
      if (!player) return;
      results.totalMatches += 1;
      var isDraw = game.winner === "draw";
      var isWin = !isDraw && game.winner === player.team;
      var bucket = index === 0 ? "1v1" : "2v2";
      if (isDraw) results["draws" + bucket] += 1;
      else if (isWin) results["wins" + bucket] += 1;
      else results["losses" + bucket] += 1;
      results.lastMatches.push({
        bucket: bucket,
        result: isDraw ? "Berabere" : isWin ? "Galibiyet" : "Maglubiyet",
        createdAtMs:
          game.createdAt && game.createdAt.seconds
            ? game.createdAt.seconds * 1000
            : 0,
      });
    });
  });

  results.lastMatches.sort(function (a, b) {
    return (b.createdAtMs || 0) - (a.createdAtMs || 0);
  });
  results.lastMatches = results.lastMatches.slice(0, 5);
  return results;
}

function renderFriendProfile(uid, profile, stats) {
  var body = document.getElementById("friendProfileBody");
  if (!body) return;
  var activityText = getProfileActivityText(profile);
  var canWatch =
    profile &&
    profile.activeMode &&
    profile.activeGameStatus === "active" &&
    (profile.activeMode === "1v1" || profile.activeMode === "2v2");
  var lastMatchesHtml = stats.lastMatches.length
    ? stats.lastMatches
        .map(function (item) {
          return (
            '<div class="profile-line"><span>' +
            escapeHtml(item.bucket + " maçı") +
            "</span><strong>" +
            escapeHtml(item.result) +
            "</strong></div>"
          );
        })
        .join("")
    : '<div class="friend-empty">Kayıtlı son maç bulunamadı.</div>';
  body.innerHTML =
    "" +
    '<div class="friend-profile-shell">' +
    '<div class="friend-profile-hero">' +
    '<div class="friend-profile-avatar"><i class="fas ' +
    escapeHtml(profile.avatar || "fa-user") +
    '"></i></div>' +
    "<div>" +
    '<div class="friend-profile-name">' +
    escapeHtml(profile.displayName || "Arkadas") +
    "</div>" +
    '<div class="friend-profile-sub">' +
    '<span class="status-dot ' +
    (isUserOnline(profile) ? "online" : "offline") +
    '"></span>' +
    "<span>" +
    escapeHtml(formatPresence(profile)) +
    "</span>" +
    "<span>•</span>" +
    "<span>" +
    escapeHtml(activityText) +
    "</span>" +
    "</div>" +
    "</div>" +
    '<div class="friend-profile-actions">' +
    (canWatch
      ? '<button class="secondary" onclick="watchFriendGame(\'' +
        uid +
        '\')"><i class="fas fa-eye"></i> Izle</button>'
      : "") +
    '<button class="secondary" onclick="selectFriend(\'' +
    uid +
    '\'); closeFriendProfile();"><i class="fas fa-comment-dots"></i> DM</button>' +
    "<button onclick=\"quickInviteFriend('" +
    uid +
    '\')"><i class="fas fa-paper-plane"></i> Davet</button>' +
    "</div>" +
    "</div>" +
    '<div class="friend-profile-grid">' +
    '<div class="profile-stat-card"><strong>' +
    stats.totalMatches +
    "</strong><span>Toplam Mac</span></div>" +
    '<div class="profile-stat-card"><strong>' +
    (stats.wins1v1 + stats.wins2v2) +
    "</strong><span>Galibiyet</span></div>" +
    '<div class="profile-stat-card"><strong>' +
    (stats.draws1v1 + stats.draws2v2) +
    "</strong><span>Berabere</span></div>" +
    '<div class="profile-stat-card"><strong>' +
    stats.totalFriends +
    "</strong><span>Arkadas</span></div>" +
    "</div>" +
    '<div class="profile-section">' +
    "<h4>Oyuncu Karti</h4>" +
    '<div class="profile-stack">' +
    '<div class="profile-line"><span>Arkadaslik Kodu</span><strong>' +
    escapeHtml(profile.friendCode || "------") +
    "</strong></div>" +
    '<div class="profile-line"><span>Aktif Mod</span><strong>' +
    escapeHtml(profile.activeMode ? getModeLabel(profile.activeMode) : "Bos") +
    "</strong></div>" +
    '<div class="profile-line"><span>1v1 Skoru</span><strong>' +
    stats.wins1v1 +
    "G / " +
    stats.draws1v1 +
    "B / " +
    stats.losses1v1 +
    "M</strong></div>" +
    '<div class="profile-line"><span>2v2 Skoru</span><strong>' +
    stats.wins2v2 +
    "G / " +
    stats.draws2v2 +
    "B / " +
    stats.losses2v2 +
    "M</strong></div>" +
    "</div>" +
    "</div>" +
    '<div class="profile-section">' +
    "<h4>Son Maclar</h4>" +
    '<div class="profile-stack">' +
    lastMatchesHtml +
    "</div>" +
    "</div>" +
    "</div>";
}

window.openFriendProfile = async function (uid) {
  if (!uid) return;
  var modal = document.getElementById("friendProfileModal");
  var body = document.getElementById("friendProfileBody");
  if (!modal || !body) return;
  modal.style.display = "flex";
  body.innerHTML = buildFriendProfileSkeletonHtml();
  var profile = friendProfilesCache[uid];
  if (!profile) {
    try {
      var snap = await getDoc(doc(db, "profiles", uid));
      if (snap.exists()) profile = Object.assign({ uid: uid }, snap.data());
    } catch (e) {}
  }
  profile = profile || { uid: uid, displayName: "Oyuncu", avatar: "fa-user" };
  var stats = await loadFriendProfileStats(uid);
  renderFriendProfile(uid, profile, stats);
};

window.closeFriendProfile = function () {
  var modal = document.getElementById("friendProfileModal");
  if (modal) modal.style.display = "none";
};

window.openSelectedFriendProfile = function () {
  if (!selectedFriendUid)
    return window.showToast("Once bir arkadas sec.", "error");
  window.openFriendProfile(selectedFriendUid);
};

window.watchFriendGame = function (uid) {
  var profile = friendProfilesCache[uid];
  var watchData = getFriendLiveWatchData(profile);
  if (!watchData) {
    return window.showToast(
      "Bu arkadaş şu anda izlenebilir bir maçta değil.",
      "info",
    );
  }
  window.closeFriendProfile();
  window.showToast(watchData.label + " maçı izleme modu açılıyor...", "info");
  if (watchData.mode === "1v1") window.enter1v1Game(watchData.code);
  else if (watchData.mode === "2v2") window.enter2v2Game(watchData.code);
};

function subscribeSocialCollections() {
  if (!currentUser) return;

  if (friendRequestsUnsubscribe) friendRequestsUnsubscribe();
  if (friendOutgoingRequestsUnsubscribe) friendOutgoingRequestsUnsubscribe();
  if (friendInvitesUnsubscribe) friendInvitesUnsubscribe();

  var incomingRequests = [];
  var outgoingRequests = [];

  var updateRequestsCache = function () {
    friendRequestsCache = incomingRequests.concat(outgoingRequests);
    syncAcceptedFriendshipRequestsForCurrentUser(friendRequestsCache);
    updateFriendsSummary();
    renderFriendsView();
  };

  friendRequestsUnsubscribe = onSnapshot(
    query(
      collection(db, "friend_requests"),
      where("toUid", "==", currentUser.uid),
    ),
    function (snapshot) {
      incomingRequests = snapshot.docs.map(function (docSnap) {
        return Object.assign({ id: docSnap.id }, docSnap.data());
      });
      updateRequestsCache();
    },
    function (err) {
      console.error(err);
    },
  );

  friendOutgoingRequestsUnsubscribe = onSnapshot(
    query(
      collection(db, "friend_requests"),
      where("fromUid", "==", currentUser.uid),
    ),
    function (snapshot) {
      outgoingRequests = snapshot.docs.map(function (docSnap) {
        return Object.assign({ id: docSnap.id }, docSnap.data());
      });
      updateRequestsCache();
    },
    function (err) {
      console.error(err);
    },
  );

  friendInvitesUnsubscribe = onSnapshot(
    query(
      collection(db, "social_invites"),
      where("toUid", "==", currentUser.uid),
    ),
    function (snapshot) {
      friendInvitesCache = snapshot.docs.map(function (docSnap) {
        return Object.assign({ id: docSnap.id }, docSnap.data());
      });
      updateFriendsSummary();
      renderFriendsView();
    },
    function (err) {
      console.error(err);
    },
  );
}
window.subscribeSocialCollections = subscribeSocialCollections;

subscribeSocialCollections();

window.openFriendsView = () => {
  window.switchView("view-friends");
  renderFriendsView();
};

window.copyFriendCode = () => {
  if (!currentProfileData || !currentProfileData.friendCode)
    return window.showToast("Kod henüz hazır değil.", "error");
  navigator.clipboard
    .writeText(currentProfileData.friendCode)
    .then(function () {
      window.showToast("Arkadaşlık kodu kopyalandı!", "success");
    });
};

window.sendFriendRequestByCode = async () => {
  if (!currentUser || !currentProfileData) return;
  var input = document.getElementById("friendCodeInput");
  var friendCode = (input && input.value ? input.value : "")
    .trim()
    .toUpperCase();
  if (!friendCode) return window.showToast("Bir arkadaşlık kodu gir.", "error");
  if (friendCode === currentProfileData.friendCode)
    return window.showToast("Kendi kodunu giremezsin.", "error");

  try {
    var matches = await getDocs(
      query(collection(db, "profiles"), where("friendCode", "==", friendCode)),
    );
    if (matches.empty)
      return window.showToast("Bu koda sahip kullanıcı bulunamadı.", "error");

    var targetDoc = matches.docs[0];
    var sent = await sendFriendRequestToUid(
      targetDoc.id,
      targetDoc.data() || {},
    );
    if (sent && input) input.value = "";
  } catch (e) {
    console.error(e);
    window.showToast("Arkadaşlık isteği gönderilemedi.", "error");
  }
};

window.acceptFriendRequest = async (requestId) => {
  var request = friendRequestsCache.find(function (req) {
    return req.id === requestId;
  });
  if (!request) {
    try {
      var requestSnap = await getDoc(doc(db, "friend_requests", requestId));
      if (requestSnap.exists())
        request = Object.assign({ id: requestId }, requestSnap.data());
    } catch (e) {}
  }
  if (!request) return;
  if (
    !currentUser ||
    request.toUid !== currentUser.uid ||
    request.fromUid === currentUser.uid
  ) {
    window.showToast("Bu istek sana ait deÄŸil.", "error");
    return;
  }
  try {
    await updateDoc(doc(db, "friend_requests", requestId), {
      status: "accepted",
      respondedAt: serverTimestamp(),
      respondedAtMs: Date.now(),
    });
    await ensureCurrentUserHasFriend(request.fromUid);
    await setDoc(
      doc(db, "profiles", request.fromUid),
      {
        friends: arrayUnion(currentUser.uid),
      },
      { merge: true },
    ).catch(function () {});
    pushNotificationToUser(request.fromUid, {
      type: "friend_accept",
      title:
        (currentUser.displayName || "Oyuncu") +
        " arkadaslik istegini kabul etti",
      body: "Artik arkadas listenizde birbirinizi gorebilirsiniz.",
      action: { type: "open_friends" },
    });
    window.showToast("Arkadaş eklendi.", "success");
  } catch (e) {
    console.error(e);
    window.showToast("İstek kabul edilemedi.", "error");
  }
};

window.declineFriendRequest = async (requestId) => {
  var request = friendRequestsCache.find(function (req) {
    return req.id === requestId;
  });
  if (
    request &&
    (!currentUser ||
      request.toUid !== currentUser.uid ||
      request.fromUid === currentUser.uid)
  ) {
    window.showToast("Bu istek sana ait deÄŸil.", "error");
    return;
  }
  try {
    await updateDoc(doc(db, "friend_requests", requestId), {
      status: "declined",
      respondedAt: serverTimestamp(),
      respondedAtMs: Date.now(),
    });
    window.showToast("İstek kapatıldı.", "info");
  } catch (e) {
    console.error(e);
    window.showToast("İstek reddedilemedi.", "error");
  }
};

window.selectFriend = function (uid) {
  selectedFriendUid = uid;
  currentDmMessages = [];
  if (dmThreadUnsubscribe) dmThreadUnsubscribe();
  var threadId = getFriendThreadId(currentUser.uid, uid);
  dmThreadUnsubscribe = onSnapshot(
    query(
      collection(db, "friend_threads", threadId, "messages"),
      orderBy("createdAtMs", "asc"),
    ),
    function (snapshot) {
      currentDmMessages = snapshot.docs.map(function (docSnap) {
        return docSnap.data();
      });
      renderFriendsView();
    },
  );
  renderFriendsView();
};
window.selectFriend = selectFriend;

var dmInputArea = document.getElementById("dmInputArea");
if (dmInputArea) {
  dmInputArea.onsubmit = async function (e) {
    e.preventDefault();
    if (!selectedFriendUid || !currentUser) return;
    var input = document.getElementById("dmInput");
    var text = sanitizeUserText(
      input && input.value ? input.value : "",
      MAX_DM_LENGTH,
    );
    if (!text) return;
    if (!throttleAction("dm_send", selectedFriendUid, 4, 12000)) {
      return window.showToast(
        "DM gonderme limiti doldu. Biraz bekle.",
        "error",
      );
    }
    try {
      var threadId = getFriendThreadId(currentUser.uid, selectedFriendUid);
      await addDoc(collection(db, "friend_threads", threadId, "messages"), {
        uid: currentUser.uid,
        user: currentUser.displayName || "Oyuncu",
        avatar: currentUser.photoURL || "fa-chess-pawn",
        text: text,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });
      pushNotificationToUser(selectedFriendUid, {
        type: "dm",
        title: (currentUser.displayName || "Oyuncu") + " sana mesaj gonderdi",
        body: text,
        action: { type: "friend_dm", uid: currentUser.uid },
      });
      input.value = "";
    } catch (err) {
      console.error(err);
      window.showToast("Mesaj gönderilemedi.", "error");
    }
  };
}

function buildLobbyInviteContext(mode) {
  if (
    mode === "2v2" &&
    window.current2v2Id &&
    window.current2v2Data &&
    window.current2v2Data.status === "lobby"
  ) {
    return {
      type: "2v2",
      roomId: window.current2v2Id,
      roomCode: window.current2v2Data.code || window.current2v2Id,
      roomLabel: "2v2 Lobi",
    };
  }
  if (
    mode === "1v1" &&
    window.current1v1Id &&
    window.current1v1Data &&
    window.current1v1Data.status === "lobby"
  ) {
    return {
      type: "1v1",
      roomId: window.current1v1Id,
      roomCode: window.current1v1Data.code || window.current1v1Id,
      roomLabel: "1v1 Lobi",
    };
  }
  if (
    mode === "quiz" &&
    window.currentQuizId &&
    window.currentQuizData &&
    window.currentQuizData.status === "lobby"
  ) {
    return {
      type: "quiz",
      roomId: window.currentQuizId,
      roomCode: window.currentQuizData.code || window.currentQuizId,
      roomLabel: window.currentQuizData.name || "Quiz Lobisi",
    };
  }
  if (
    mode === "tournament" &&
    window.currentTournamentId &&
    window.currentTournamentData &&
    window.currentTournamentData.status === "lobby"
  ) {
    return {
      type: "tournament",
      roomId: window.currentTournamentId,
      roomCode: window.currentTournamentId,
      roomLabel: window.currentTournamentData.name || "Turnuva Lobisi",
    };
  }
  return null;
}

function getAnyOpenLobbyInviteContext() {
  return (
    buildLobbyInviteContext("2v2") ||
    buildLobbyInviteContext("1v1") ||
    buildLobbyInviteContext("quiz") ||
    buildLobbyInviteContext("tournament")
  );
}

async function sendFriendInviteToUid(uid, mode) {
  var context = buildLobbyInviteContext(mode) || getAnyOpenLobbyInviteContext();
  if (!context) return window.showToast("Önce bir lobi açmalısın.", "error");
  try {
    await setDoc(
      doc(
        db,
        "social_invites",
        getLobbyInviteDocId(context.type, context.roomId, currentUser.uid, uid),
      ),
      {
        fromUid: currentUser.uid,
        fromName: currentUser.displayName || "Oyuncu",
        fromAvatar: currentUser.photoURL || "fa-chess-pawn",
        toUid: uid,
        roomId: context.roomId,
        roomCode: context.roomCode,
        roomLabel: context.roomLabel,
        type: context.type,
        status: "pending",
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      },
      { merge: true },
    );
    window.showToast("Davet gönderildi.", "success");
  } catch (e) {
    console.error(e);
    window.showToast("Davet gönderilemedi.", "error");
  }
}

window.quickInviteFriend = function (uid) {
  sendFriendInviteToUid(uid);
};

window.inviteSelectedFriendToCurrentLobby = function () {
  if (!selectedFriendUid)
    return window.showToast("Önce bir arkadaş seç.", "error");
  sendFriendInviteToUid(selectedFriendUid);
};

window.openLobbyInvites = async function (mode) {
  var onlineFriends = Object.keys(friendProfilesCache)
    .map(function (uid) {
      return friendProfilesCache[uid];
    })
    .filter(function (profile) {
      return profile && isUserOnline(profile);
    });
  if (!buildLobbyInviteContext(mode))
    return window.showToast("Bu ekranda aktif bir lobi bulunmuyor.", "error");
  if (!onlineFriends.length)
    return window.showToast("Şu an çevrim içi arkadaş yok.", "info");

  var html =
    '<div style="display:grid; gap:10px; max-height:320px; overflow:auto; text-align:left;">' +
    onlineFriends
      .map(function (profile) {
        return (
          '<button class="secondary friend-modal-btn" data-uid="' +
          escapeHtml(profile.uid) +
          '" style="width:100%; text-transform:none; display:flex; align-items:center; justify-content:space-between; gap:10px;">' +
          '<span><i class="fas ' +
          escapeHtml(profile.avatar || "fa-user") +
          '" style="margin-right:8px;"></i>' +
          escapeHtml(profile.displayName || "Oyuncu") +
          "</span>" +
          '<span style="color:#22c55e; font-size:0.75rem;">Çevrim içi</span>' +
          "</button>"
        );
      })
      .join("") +
    "</div>";

  await Swal.fire({
    title: "Arkadaş Davet Et",
    html: html,
    showConfirmButton: false,
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
    didOpen: function () {
      Array.prototype.forEach.call(
        document.querySelectorAll(".friend-modal-btn"),
        function (btn) {
          btn.addEventListener("click", async function () {
            await sendFriendInviteToUid(btn.getAttribute("data-uid"), mode);
            Swal.close();
          });
        },
      );
    },
  });
};

window.acceptFriendInvite = async function (inviteId) {
  var invite = friendInvitesCache.find(function (item) {
    return item.id === inviteId;
  });
  if (!invite) return;
  try {
    await updateDoc(doc(db, "social_invites", inviteId), {
      status: "accepted",
      respondedAt: serverTimestamp(),
      respondedAtMs: Date.now(),
    });
    if (invite.type === "2v2") window.enter2v2Game(invite.roomCode);
    else if (invite.type === "1v1") window.enter1v1Game(invite.roomCode);
    else if (invite.type === "quiz") window.enterQuizGame(invite.roomCode);
    else if (invite.type === "tournament")
      window.enterTournament(invite.roomId);
  } catch (e) {
    console.error(e);
    window.showToast("Davete katılınamadı.", "error");
  }
};

window.dismissFriendInvite = async function (inviteId) {
  try {
    await updateDoc(doc(db, "social_invites", inviteId), {
      status: "dismissed",
      respondedAt: serverTimestamp(),
      respondedAtMs: Date.now(),
    });
    window.showToast("Davet kapatıldı.", "info");
  } catch (e) {
    console.error(e);
    window.showToast("Davet kapatılamadı.", "error");
  }
};

if (!window.__gmCoreAuthManaged) {
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
    const e = document.getElementById("emailInput").value.trim(),
      p = document.getElementById("passwordInput").value.trim(),
      n = document.getElementById("displayNameInput").value.trim(),
      a = document.getElementById("selectedAvatar").value;
    if (!e || !p || (isReg && !n)) {
      return window.showToast("Lütfen tüm alanları doldurun.", "error");
    }
    if (btn) btn.disabled = true;
    if(typeof mBtn !== 'undefined' && mBtn) mBtn.disabled = true;
    if (btn) btn.innerText = "İŞLENİYOR...";
    if(typeof mBtn !== 'undefined' && mBtn) mBtn.innerText = "İŞLENİYOR...";
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
      if(typeof mBtn !== 'undefined' && mBtn) mBtn.disabled = false;
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
    if (!currentUser) return;
    if (document.hidden) setCurrentReconnectState(false);
    else setCurrentReconnectState(true);
    pushProfilePresence();
  });
  window.addEventListener("focus", function () {
    if (!currentUser) return;
    setCurrentReconnectState(true);
    pushProfilePresence();
  });
  window.addEventListener("beforeunload", function () {
    if (!currentUser) return;
    setCurrentReconnectState(false);
  });

  onAuthStateChanged(auth, async (u) => {
    if (u) {
      currentUser = u;
      document.getElementById("userInfoSection").style.display = "flex";
      document.getElementById("btnLogout").style.display = "inline-block";
      document.getElementById("btnNotifications").style.display = "inline-flex";
      document.getElementById("currentUserDisplay").innerText = u.displayName;
      document.getElementById("currentUserIcon").innerHTML =
        `<i class="fas ${u.photoURL || "fa-chess-pawn"}" style="color:var(--primary)"></i>`;
      window.switchView("view-dashboard");
      await ensureUserProfile();
      startProfileHeartbeat();
      subscribeSocialCollections();
      subscribeNotificationCollection();
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
      stopSocialListeners();
      currentUser = null;
      document.getElementById("userInfoSection").style.display = "none";
      document.getElementById("btnLogout").style.display = "none";
      document.getElementById("btnNotifications").style.display = "none";
      window.switchView("view-auth");
    }
  });
}

// renderAvatars and avatarList are provided by app.js

window.initChat = function (tid) {
  activeChatThreadId = tid;
  const cb = document.getElementById("chatToggleBtn");
  if (cb) cb.style.display = "flex";
  const q = query(
    collection(db, `tournaments/${tid}/messages`),
    orderBy("createdAt", "asc"),
  );
  unsubscribeChat = onSnapshot(q, (s) => {
    const d = document.getElementById("chatMessages");
    if (!d) return;
    d.innerHTML = "";
    let n = false;
    s.forEach((x) => {
      const m = x.data();
      const me = m.uid === currentUser.uid;
      d.innerHTML += `<div style="text-align:${me ? "right" : "left"}; margin-bottom:5px;"><strong style="color:${me ? "var(--accent)" : "var(--primary)"}; font-size:0.8rem;">${m.user}</strong><div style="background:${me ? "var(--primary)" : "rgba(255,255,255,0.1)"}; color:${me ? "#000" : "var(--text-main)"}; display:inline-block; padding:5px 10px; border-radius:10px; margin-top:2px; max-width:80%; word-break:break-word;">${m.text}</div></div>`;
      n = true;
    });
    if (window.scrollChat) window.scrollChat();
    const cw = document.getElementById("chatWidget");
    if (n && cw && cw.style.display === "none") {
      const badge = document.getElementById("chatBadge");
      if (badge) badge.style.display = "flex";
    }
  });
};

window.hideChat = () => {
  const cw = document.getElementById("chatWidget");
  const cb = document.getElementById("chatToggleBtn");
  if (cw) cw.style.display = "none";
  if (
    cb &&
    (window.currentTournamentId || window.current2v2Id || window.current1v1Id)
  ) {
    cb.style.display = "flex";
  }
};

window.removeFriend = async function (friendUid) {
  if (!currentUser) return;
  const res = await Swal.fire({
    title: "Arkadaşı Çıkar?",
    text: "Bu kullanıcıyı arkadaş listenizden kaldırmak istediğinize emin misiniz?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    background: "rgba(30,30,35,0.95)",
    color: "#fff",
  });
  if (!res.isConfirmed) return;
  try {
    await updateDoc(doc(db, "profiles", currentUser.uid), {
      friends: arrayRemove(friendUid),
    });
    await updateDoc(doc(db, "profiles", friendUid), {
      friends: arrayRemove(currentUser.uid),
    });
    window.showToast("Arkadaş silindi.", "info");
    window.closeFriendProfile();
  } catch (e) {
    console.error(e);
    window.showToast("Arkadaş silinemedi.", "error");
  }
};

window.ensureUserProfile = ensureUserProfile;
window.startProfileHeartbeat = startProfileHeartbeat;
window.subscribeNotificationCollection = subscribeNotificationCollection;
window.stopSocialListeners = stopSocialListeners;
window.readStoryProfileCache = readStoryProfileCache;
window.mergeStoryProfileState = mergeStoryProfileState;
window.normalizeProfileWithStoryState = normalizeProfileWithStoryState;
window.syncCurrentProfileStoryState = syncCurrentProfileStoryState;
