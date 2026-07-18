import { doc, runTransaction, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const db = window.db;
const STORY_PROMO_ADMIN_EMAIL = 'yusar646@gmail.com';

const STORY_CHAPTERS = [
    { id: 'opening_gate', title: 'Açılış Kapısı', subtitle: 'Merkez, gelişim ve ilk tehditler.' },
    { id: 'mist_board', title: 'Sisli Tahta', subtitle: 'Kısa taktikler ve mat kokusu.' },
    { id: 'gambit_market', title: 'Gambit Pazarı', subtitle: 'Piyon fedaları ve tempo savaşı.' },
    { id: 'broken_rook', title: 'Kırık Kale Kuşatması', subtitle: 'Savunma, karşı oyun ve sabır.' },
    { id: 'last_crown', title: 'Son Taç', subtitle: 'Uzun varyantlar ve final kararlar.' }
];

const STORY_BOT_LEVELS = {
    1: { name: 'Çırak Gölge', label: 'Seviye 1', depth: 5, targetText: 'temel tehditleri kaçırır' },
    2: { name: 'Sis Muhafızı', label: 'Seviye 2', depth: 6, targetText: 'merkez baskısını takip eder' },
    3: { name: 'Gambit Ustası', label: 'Seviye 3', depth: 8, targetText: 'taktik fırsatları arar' },
    4: { name: 'Kale Komutanı', label: 'Seviye 4', depth: 10, targetText: 'savunma kaynaklarını zorlar' },
    5: { name: 'Taç Bekçisi', label: 'Seviye 5', depth: 12, targetText: 'final hatalarını cezalandırır' }
};

const STORY_MISSIONS = [
    { id: 'm01', chapter: 'opening_gate', title: 'Merkezi Yak', difficulty: 'Kolay', reward: 35, setup: [], solution: ['e2e4', 'e7e5', 'g1f3'], text: 'İlk kapı merkezin kontrolünü ister. Şah kanadını geliştir ve e5 baskısını kur.' },
    { id: 'm02', chapter: 'opening_gate', title: 'Vezir Piyonu Yemini', difficulty: 'Kolay', reward: 35, setup: [], solution: ['d2d4', 'd7d5', 'c2c4'], text: 'Tahta yavaş açılırken vezir kanadından alan kazan.' },
    { id: 'm03', chapter: 'opening_gate', title: 'Sessiz At', difficulty: 'Kolay', reward: 40, setup: [], solution: ['g1f3', 'd7d5', 'c2c4'], text: 'Atını önce çıkar, sonra merkez piyonunu hedefe koy.' },
    { id: 'm04', chapter: 'opening_gate', title: 'Sicilya Kapısı', difficulty: 'Kolay', reward: 40, setup: [], solution: ['e2e4', 'c7c5', 'g1f3'], text: 'Kanat piyonu merkeze meydan okurken sakin gelişim en iyi cevaptır.' },
    { id: 'm05', chapter: 'opening_gate', title: 'İngiliz Anahtarı', difficulty: 'Kolay', reward: 45, setup: [], solution: ['c2c4', 'e7e5', 'b1c3'], text: 'Kanattan başla, sonra merkez karelerine baskı kur.' },
    { id: 'm06', chapter: 'opening_gate', title: 'Filin Işığı', difficulty: 'Kolay', reward: 45, setup: [], solution: ['e2e4', 'e7e5', 'f1c4'], text: 'Zayıf f7 karesini erkenden işaretle.' },
    { id: 'm07', chapter: 'opening_gate', title: 'Kapalı Merkez', type: 'bot', botLevel: 1, difficulty: 'Bot Kapışması', reward: 50, setup: ['d2d4', 'g8f6', 'c2c4', 'e7e6'], userColor: 'w', moveLimit: 8, battleGoal: 'survive', text: 'Kapalı merkezde botla oynuyorsun. Taşlarını geliştirmeyi bitir ve 8 hamle boyunca konumunu bozmadan kal.' },
    { id: 'm08', chapter: 'opening_gate', title: 'Fransız Duvarı', type: 'bot', botLevel: 1, difficulty: 'Bot Kapışması', reward: 55, setup: ['e2e4', 'e7e6', 'd2d4', 'd7d5'], userColor: 'w', moveLimit: 8, battleGoal: 'material', text: 'Fransız savunmasına karşı canlı kapışma. Merkezde alan kazan, 8 hamle içinde materyal üstünlüğü kur.' },

    { id: 'm09', chapter: 'mist_board', title: 'Aptal Matının Gölgesi', difficulty: 'Mat 1', reward: 70, setup: ['f2f3', 'e7e5', 'g2g4'], solution: ['d8h4'], text: 'Rakip şah kanadını açık bıraktı. Siyah vezir tek hamlede perdeyi kapatabilir.' },
    { id: 'm10', chapter: 'mist_board', title: 'Akademi Mati', difficulty: 'Mat 1', reward: 70, setup: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6'], solution: ['h5f7'], text: 'Fil ve vezir aynı zayıf noktaya bakıyor. Tahtanın ilk tacını al.' },
    { id: 'm11', chapter: 'mist_board', title: 'Merkez Kırılımı', difficulty: 'Taktik', reward: 65, setup: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3'], solution: ['d2d4', 'e5d4', 'c3d4'], text: 'Merkezi doğru anda aç ve taşlarını aktifleştir.' },
    { id: 'm12', chapter: 'mist_board', title: 'Güvenli Kale', difficulty: 'Savunma', reward: 65, setup: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3'], solution: ['e8g8', 'g1f3', 'h7h6'], text: 'Siyah önce şahını güvene alır, sonra fili sorgular.' },
    { id: 'm13', chapter: 'mist_board', title: 'Najdorf İşareti', difficulty: 'Taktik', reward: 70, setup: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6'], solution: ['c1e3', 'e7e5', 'd4b3'], text: 'At geri çekilirken merkezde yeni cephe açılır.' },
    { id: 'm14', chapter: 'mist_board', title: 'Fil Değişimi', difficulty: 'Savunma', reward: 70, setup: ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'e2e3'], solution: ['c8f5', 'f1d3', 'f5d3'], text: 'Siyah sorunlu filini dışarı çıkarıp doğru anda değişir.' },
    { id: 'm15', chapter: 'mist_board', title: 'İspanyol Nefesi', type: 'bot', botLevel: 2, difficulty: 'Bot Kapışması', reward: 75, setup: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'], userColor: 'w', moveLimit: 10, battleGoal: 'material', text: 'İspanyol baskısında canlı oyun. Şahını güvene al, sonra 10 hamle içinde küçük bir üstünlük kur.' },
    { id: 'm16', chapter: 'mist_board', title: 'Grünfeld Kıvılcımı', type: 'bot', botLevel: 2, difficulty: 'Bot Kapışması', reward: 75, setup: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5'], userColor: 'w', moveLimit: 10, battleGoal: 'survive', text: 'Grünfeld baskısına karşı oynuyorsun. 10 hamle boyunca merkezi dağıtmadan ayakta kal.' },

    { id: 'm17', chapter: 'gambit_market', title: 'Kabul Edilen Pazar', difficulty: 'Orta', reward: 85, setup: ['d2d4', 'd7d5', 'c2c4', 'd5c4'], solution: ['e2e3', 'b7b5', 'a2a4'], text: 'Gambit piyonu tutulursa onu zincirinden kopar.' },
    { id: 'm18', chapter: 'gambit_market', title: 'İtalyan Çekici', difficulty: 'Orta', reward: 85, setup: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6'], solution: ['d2d4', 'e5d4', 'c3d4'], text: 'İki filin arasında merkez kırılır.' },
    { id: 'm19', chapter: 'gambit_market', title: 'Hint Savaşı', difficulty: 'Orta', reward: 90, setup: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6'], solution: ['g1f3', 'e8g8', 'f1e2'], text: 'Büyük merkez kuruldu; şimdi taşlarını arkasına yerleştir.' },
    { id: 'm20', chapter: 'gambit_market', title: 'Sicilya Sancağı', difficulty: 'Zor', reward: 95, setup: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3'], solution: ['a7a6', 'c1e3', 'e7e5'], text: 'Siyah alan kazanır, sonra merkezde tempi sayar.' },
    { id: 'm21', chapter: 'gambit_market', title: 'Fransız İleri Karakol', difficulty: 'Zor', reward: 95, setup: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4e5'], solution: ['c7c5', 'c2c3', 'b8c6'], text: 'Beyazın zincirine yandan baskı kur.' },
    { id: 'm22', chapter: 'gambit_market', title: 'Caro Aynası', difficulty: 'Zor', reward: 100, setup: ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5'], solution: ['c8f5', 'g1f3', 'e7e6'], text: 'Dışarıdaki fil savunmanın nefes borusudur.' },
    { id: 'm23', chapter: 'gambit_market', title: 'Kale Hatları', type: 'bot', botLevel: 3, difficulty: 'Bot Kapışması', reward: 105, setup: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7'], userColor: 'w', moveLimit: 12, battleGoal: 'material', text: 'Açık hatları bot savunmasına karşı kullan. Kaleyi merkeze getir ve 12 hamlede materyal ya da baskı üstünlüğü al.' },
    { id: 'm24', chapter: 'gambit_market', title: 'İngiliz Pençesi', type: 'bot', botLevel: 3, difficulty: 'Bot Kapışması', reward: 105, setup: ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g2g3', 'd7d5'], userColor: 'w', moveLimit: 12, battleGoal: 'material', text: 'İngiliz açılışında tempo savaşı. Fili büyük diyagonale taşı ve 12 hamlede üstünlük yakala.' },

    { id: 'm25', chapter: 'broken_rook', title: 'Kanat Fedası', difficulty: 'Zor', reward: 115, setup: ['e2e4', 'e7e5', 'f2f4', 'e5f4', 'g1f3', 'g7g5'], solution: ['h2h4', 'g5g4', 'f3e5'], text: 'Tehdit altındaki at tempo ile merkeze sıyrılır.' },
    { id: 'm26', chapter: 'broken_rook', title: 'Fili Koru', difficulty: 'Savunma', reward: 115, setup: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'e8g8', 'g1f3', 'h7h6'], solution: ['g5h4', 'b7b6', 'c4d5'], text: 'Fil geri çekilir, merkezde doğru kırılım beklenir.' },
    { id: 'm27', chapter: 'broken_rook', title: 'Ejderha Disiplini', difficulty: 'Savunma', reward: 120, setup: ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'g7g6', 'c2c4'], solution: ['g8f6', 'b1c3', 'd7d6'], text: 'Siyah karanlık kareleri toparlayıp merkezi tutar.' },
    { id: 'm28', chapter: 'broken_rook', title: 'İki At Alevi', difficulty: 'Zor', reward: 125, setup: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5'], solution: ['c6a5', 'c4b5', 'c7c6'], text: 'Siyah at kenara gider ama filin nefesini keser.' },
    { id: 'm29', chapter: 'broken_rook', title: 'Kale Sabrı', difficulty: 'Savunma', reward: 125, setup: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g1f3', 'd7d5', 'b1c3', 'f8e7', 'c1g5', 'e8g8', 'e2e3'], solution: ['h7h6', 'g5h4', 'b7b6'], text: 'Sorgula, geri çekilmeyi bekle, sonra uzun diyagonali hazırla.' },
    { id: 'm30', chapter: 'broken_rook', title: 'Fransız Baskını', difficulty: 'Zor', reward: 130, setup: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'f8b4', 'e4e5'], solution: ['c7c5', 'a2a3', 'b4c3'], text: 'Merkez kapalıyken doğru değişim savunmayı rahatlatır.' },
    { id: 'm31', chapter: 'broken_rook', title: 'Slav Geri Alım', type: 'bot', botLevel: 4, difficulty: 'Bot Kapışması', reward: 130, setup: ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'd5c4'], userColor: 'w', moveLimit: 14, battleGoal: 'material', text: 'Slav yapısında piyonu geri almak için acele etme. Botun savunmasını çöz ve 14 hamlede üstünlüğü göster.' },
    { id: 'm32', chapter: 'broken_rook', title: 'Kirpi Kabuğu', type: 'bot', botLevel: 4, difficulty: 'Bot Kapışması', reward: 135, setup: ['e2e4', 'c7c5', 'g1f3', 'e7e6', 'd2d4', 'c5d4', 'f3d4', 'a7a6'], userColor: 'w', moveLimit: 14, battleGoal: 'survive', text: 'Kirpi yapısına karşı sabır testi. 14 hamle boyunca zayıflık vermeden baskıyı büyüt.' },

    { id: 'm33', chapter: 'last_crown', title: 'İtalyan Fırtınası', difficulty: 'Usta', reward: 150, setup: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5', 'c2c3', 'd7d6'], solution: ['b2b4', 'c5b6', 'a2a4'], text: 'Kanat sürüşüyle fili geri it ve alanını genişlet.' },
    { id: 'm34', chapter: 'last_crown', title: 'Hint Fil Tuzağı', difficulty: 'Usta', reward: 155, setup: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g1f3', 'b7b6', 'g2g3', 'c8a6'], solution: ['b2b3', 'f8b4', 'c1d2'], text: 'Baskı gelmeden diyagonalleri temizle.' },
    { id: 'm35', chapter: 'last_crown', title: 'Najdorf Derinliği', difficulty: 'Usta', reward: 160, setup: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'c1e3'], solution: ['e7e5', 'd4b3', 'c8e6'], text: 'Merkez hamlesi at temposunu alır, fil savaşı tamamlar.' },
    { id: 'm36', chapter: 'last_crown', title: 'Derin Vezir Gambiti', difficulty: 'Usta', reward: 165, setup: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'e8g8', 'g1f3', 'b8d7', 'a1c1'], solution: ['c7c6', 'f1d3', 'd5c4'], text: 'Siyah merkez gerilimini doğru anda çözer.' },
    { id: 'm37', chapter: 'last_crown', title: 'İspanyol Sabrı', difficulty: 'Usta', reward: 170, setup: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6', 'c2c3', 'e8g8'], solution: ['h2h3', 'c7c6', 'd2d4'], text: 'Son taç sabır ister: önce kaçan kareyi al, sonra merkezi aç.' },
    { id: 'm38', chapter: 'last_crown', title: 'Kral Hint Kilidi', difficulty: 'Usta', reward: 175, setup: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6', 'g1f3', 'e8g8', 'f1e2', 'e7e5', 'e1g1'], solution: ['b8c6', 'd4d5', 'c6e7'], text: 'Siyah atını yeniden konumlandırıp uzun savaşa hazırlanır.' },
    { id: 'm39', chapter: 'last_crown', title: 'Caro Sığınağı', type: 'bot', botLevel: 5, difficulty: 'Usta Bot Kapışması', reward: 180, setup: ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5', 'c8f5', 'h2h4', 'h7h6', 'g2g4'], userColor: 'b', moveLimit: 16, battleGoal: 'survive', text: 'Siyah taşlarla sıkışmış fili yaşat. Taç Bekçisi seviyesinde 16 hamle boyunca savunmayı ayakta tut.' },
    { id: 'm40', chapter: 'last_crown', title: 'Son Taç Düellosu', type: 'bot', botLevel: 5, difficulty: 'Final Bot Kapışması', reward: 220, setup: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d4', 'e5d4', 'c3d4', 'c5b4', 'b1c3'], userColor: 'b', moveLimit: 16, battleGoal: 'win', text: 'Finalde siyah taşlarla oynuyorsun. Motor destekli güçlü rakibe karşı avantajı koru veya mat et.' }
];

let selectedChapterId = STORY_CHAPTERS[0].id;
let activeMission = null;
let storyChess = null;
let storySelectedSquare = null;
let storyValidMoves = [];
let storySolutionIndex = 0;
let storyMistakes = 0;
let storyUserColor = 'w';
let storyBattleUserMoves = 0;
let storyBotThinking = false;

function syncStoryProfileLocal(storyPatch) {
    if (window.syncCurrentProfileStoryState) {
        return window.syncCurrentProfileStoryState(storyPatch);
    }
    if (!window.currentProfileData) window.currentProfileData = {};
    window.currentProfileData = Object.assign({}, window.currentProfileData, storyPatch || {});
    return window.currentProfileData;
}

function getCompletedMap() {
    return (window.currentProfileData && window.currentProfileData.storyCompleted && typeof window.currentProfileData.storyCompleted === 'object')
        ? window.currentProfileData.storyCompleted
        : {};
}

function isMissionCompleted(missionId) {
    return !!getCompletedMap()[missionId];
}

function getStoryBotLevel(mission) {
    return STORY_BOT_LEVELS[(mission && mission.botLevel) || 1] || STORY_BOT_LEVELS[1];
}

function getStoryBattleGoalText(mission) {
    if (!mission || mission.type !== 'bot') return '';
    if (mission.battleGoal === 'win') return 'Hedef: avantajı büyüt veya mat et.';
    if (mission.battleGoal === 'material') return 'Hedef: hamle sınırı dolmadan materyal üstünlüğü kur.';
    return 'Hedef: hamle sınırı boyunca konumu sağlam tut.';
}

function getMissionIndex(missionId) {
    return STORY_MISSIONS.findIndex(function(mission) { return mission.id === missionId; });
}

function isMissionUnlocked(missionId) {
    const index = getMissionIndex(missionId);
    if (index <= 0) return true;
    return isMissionCompleted(STORY_MISSIONS[index - 1].id);
}

function getChapterStats(chapterId) {
    const missions = STORY_MISSIONS.filter(function(mission) { return mission.chapter === chapterId; });
    const done = missions.filter(function(mission) { return isMissionCompleted(mission.id); }).length;
    return { done: done, total: missions.length };
}

function updateStoryStats() {
    const completed = Object.keys(getCompletedMap()).length;
    const points = (window.currentProfileData && window.currentProfileData.storyPoints) || 0;
    const stars = (window.currentProfileData && window.currentProfileData.storyStars) || 0;
    const pointsEl = document.getElementById('storyPointsValue');
    const starsEl = document.getElementById('storyStarsValue');
    const completedEl = document.getElementById('storyCompletedValue');
    const shopPointsEl = document.getElementById('storyShopPointsValue');
    const activeSetEl = document.getElementById('storyShopActiveSet');
    const activeSet = window.getActivePieceSet ? window.getActivePieceSet() : (window.STORY_PIECE_SETS && window.STORY_PIECE_SETS[0]);
    if (pointsEl) pointsEl.innerText = points;
    if (starsEl) starsEl.innerText = stars;
    if (completedEl) completedEl.innerText = completed + '/' + STORY_MISSIONS.length;
    if (shopPointsEl) shopPointsEl.innerText = points;
    if (activeSetEl && activeSet) activeSetEl.innerText = activeSet.name;
}

function renderStoryChapters() {
    const container = document.getElementById('storyChapterList');
    if (!container) return;
    container.innerHTML = '';
    STORY_CHAPTERS.forEach(function(chapter) {
        const firstMission = STORY_MISSIONS.find(function(mission) { return mission.chapter === chapter.id; });
        const locked = firstMission && !isMissionUnlocked(firstMission.id);
        const stats = getChapterStats(chapter.id);
        const row = document.createElement('div');
        row.className = 'story-chapter-card' + (selectedChapterId === chapter.id ? ' active' : '') + (locked ? ' locked' : '');
        row.innerHTML = ''
            + '<div class="story-card-title"><span>' + window.escapeHtml(chapter.title) + '</span><span>' + stats.done + '/' + stats.total + '</span></div>'
            + '<div class="story-card-sub">' + window.escapeHtml(chapter.subtitle) + '</div>';
        row.onclick = function() {
            if (locked) return window.showToast('Önce önceki bölümü tamamla.', 'info');
            selectedChapterId = chapter.id;
            renderStoryMode();
        };
        container.appendChild(row);
    });
}

function renderStoryMissions() {
    const container = document.getElementById('storyMissionGrid');
    if (!container) return;
    container.innerHTML = '';
    STORY_MISSIONS.filter(function(mission) { return mission.chapter === selectedChapterId; }).forEach(function(mission) {
        const completed = getCompletedMap()[mission.id];
        const locked = !isMissionUnlocked(mission.id);
        const row = document.createElement('div');
        row.className = 'story-mission-card' + (completed ? ' completed' : '') + (locked ? ' locked' : '');
        const botMeta = mission.type === 'bot' ? getStoryBotLevel(mission) : null;
        row.innerHTML = ''
            + '<div class="story-card-title"><span>' + window.escapeHtml(mission.title) + '</span><span>' + (completed ? '★'.repeat(completed.stars || 1) : '<i class="fas fa-lock' + (locked ? '' : '-open') + '"></i>') + '</span></div>'
            + '<div class="story-card-sub">' + window.escapeHtml(mission.text) + '</div>'
            + '<div class="story-pill-row">'
                + '<span class="story-pill">' + window.escapeHtml(mission.difficulty) + '</span>'
                + (botMeta ? '<span class="story-pill story-bot-pill"><i class="fas fa-robot"></i> ' + window.escapeHtml(botMeta.label) + ': ' + window.escapeHtml(botMeta.name) + '</span>' : '')
                + '<span class="story-pill"><i class="fas fa-crown"></i> ' + mission.reward + '</span>'
                + '<span class="story-pill">' + (mission.type === 'bot' ? '<i class="fas fa-robot"></i> Bot' : '<i class="fas fa-puzzle-piece"></i> Puzzle') + '</span>'
                + '<span class="story-pill">' + (completed ? 'Tamamlandı' : 'Yeni') + '</span>'
            + '</div>';
        row.onclick = function() {
            if (locked) return window.showToast('Bu görev henüz kilitli.', 'info');
            window.startStoryMission(mission.id);
        };
        container.appendChild(row);
    });
}

function renderStoryMode() {
    updateStoryStats();
    renderStoryChapters();
    renderStoryMissions();
}

function applyMoves(game, moves) {
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const applied = game.move({
            from: move.slice(0, 2),
            to: move.slice(2, 4),
            promotion: move.length > 4 ? move.slice(4, 5) : 'q'
        });
        if (!applied) return false;
    }
    return true;
}

function getMissionChapterTitle(mission) {
    const chapter = STORY_CHAPTERS.find(function(item) { return item.id === mission.chapter; });
    return chapter ? chapter.title : 'Bölüm';
}

function getSquarePieceColor(game, moveUci) {
    const piece = game.get(moveUci.slice(0, 2));
    return piece ? piece.color : null;
}

function drawStoryBoard() {
    const boardEl = document.getElementById('storyBoard');
    if (!boardEl || !storyChess) return;
    boardEl.innerHTML = '';
    const board = storyChess.board();
    const rotate = storyUserColor === 'b';
    const isBattle = activeMission && activeMission.type === 'bot';
    const isUserTurn = storyChess.turn() === storyUserColor && (isBattle || storySolutionIndex < activeMission.solution.length);

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const row = rotate ? 7 - r : r;
            const col = rotate ? 7 - c : c;
            const sq = board[row][col];
            const squareName = String.fromCharCode(97 + col) + (8 - row);
            const div = document.createElement('div');
            div.className = 'square ' + (((row + col) % 2 === 0) ? 'white' : 'black');
            const history = storyChess.history({verbose: true});
            const lastMove = history.length ? history[history.length - 1] : null;
            if (lastMove && (squareName === lastMove.from || squareName === lastMove.to)) div.classList.add("last-move");
            if (storySelectedSquare === squareName) div.classList.add('selected');
            if (storyValidMoves.indexOf(squareName) !== -1) div.classList.add('valid-move');
            div.onclick = function() { handleStorySquareClick(squareName, isUserTurn); };

            if (sq) {
                const piece = document.createElement('div');
                piece.className = 'piece ' + (isUserTurn && sq.color === storyUserColor ? 'active' : 'locked');
                if (window.applyPieceSkin) window.applyPieceSkin(piece, sq.color, sq.type);
                div.appendChild(piece);
            }
            boardEl.appendChild(div);
        }
    }
}

function setStoryMissionStatus(message) {
    const status = document.getElementById('storyMissionStatus');
    if (status) status.innerText = message;
    const progress = document.getElementById('storyMissionProgress');
    if (progress && activeMission) {
        if (activeMission.type === 'bot') {
            progress.innerText = 'Hamle ' + storyBattleUserMoves + '/' + (activeMission.moveLimit || 10);
        } else {
            progress.innerText = 'Adım ' + Math.min(storySolutionIndex + 1, activeMission.solution.length) + '/' + activeMission.solution.length;
        }
    }
}

function syncMissionHeader() {
    if (!activeMission) return;
    const chapterEl = document.getElementById('storyMissionChapter');
    const titleEl = document.getElementById('storyMissionTitle');
    const textEl = document.getElementById('storyMissionText');
    const difficultyEl = document.getElementById('storyMissionDifficulty');
    const rewardEl = document.getElementById('storyMissionReward');
    if (chapterEl) chapterEl.innerText = getMissionChapterTitle(activeMission);
    if (titleEl) titleEl.innerText = activeMission.title;
    if (textEl) textEl.innerText = activeMission.type === 'bot'
        ? activeMission.text + ' ' + getStoryBattleGoalText(activeMission)
        : activeMission.text;
    if (difficultyEl) difficultyEl.innerText = activeMission.difficulty;
    if (rewardEl) rewardEl.innerText = activeMission.reward + ' Taç Puanı';
}

function setupStoryMission(mission) {
    activeMission = mission;
    storyChess = new Chess();
    storySelectedSquare = null;
    storyValidMoves = [];
    storySolutionIndex = 0;
    storyMistakes = 0;
    storyBattleUserMoves = 0;
    storyBotThinking = false;
    if (!applyMoves(storyChess, mission.setup || [])) {
        window.showToast('Görev konumu kurulamadı.', 'error');
        activeMission = null;
        return false;
    }
    storyUserColor = mission.userColor || storyChess.turn();
    syncMissionHeader();
    if (mission.type === 'bot') {
        const botMeta = getStoryBotLevel(mission);
        setStoryMissionStatus((storyUserColor === 'w' ? 'Beyaz' : 'Siyah') + ' taşlarla ' + botMeta.name + ' karşısındasın. ' + getStoryBattleGoalText(mission));
        if (storyChess.turn() !== storyUserColor) setTimeout(playStoryBotTurn, 350);
    } else {
        setStoryMissionStatus((storyUserColor === 'w' ? 'Beyaz' : 'Siyah') + ' oynar. En iyi hamleyi bul.');
    }
    drawStoryBoard();
    return true;
}

function autoPlayStoryReplies() {
    if (!activeMission || !storyChess) return;
    while (storySolutionIndex < activeMission.solution.length) {
        const next = activeMission.solution[storySolutionIndex];
        if (getSquarePieceColor(storyChess, next) === storyUserColor) break;
        const reply = storyChess.move({
            from: next.slice(0, 2),
            to: next.slice(2, 4),
            promotion: next.length > 4 ? next.slice(4, 5) : 'q'
        });
        if (!reply) break;
        storySolutionIndex++;
    }
}

async function completeStoryMission() {
    if (!activeMission || !window.currentUser) return;
    const stars = storyMistakes === 0 ? 3 : (storyMistakes <= 2 ? 2 : 1);
    const score = activeMission.reward + (stars * 10);
    const missionId = activeMission.id;
    const profileRef = doc(db, 'profiles', window.currentUser.uid);
    const wasCompletedBefore = isMissionCompleted(missionId);
    let storyStateAfter = null;
    await runTransaction(db, async function(transaction) {
        const snap = await transaction.get(profileRef);
        const data = snap.exists() ? (snap.data() || {}) : {};
        const completed = data.storyCompleted && typeof data.storyCompleted === 'object' ? data.storyCompleted : {};
        const previous = completed[missionId] || null;
        const previousStars = previous ? (previous.stars || 0) : 0;
        const nextStars = Math.max(previousStars, stars);
        const pointDelta = previous ? 0 : score;
        const starDelta = Math.max(0, nextStars - previousStars);
        const nextCompleted = Object.assign({}, completed);
        const updatedAtMs = Date.now();
        nextCompleted[missionId] = Object.assign({}, previous || {}, {
            stars: nextStars,
            score: Math.max(previous ? (previous.score || 0) : 0, score),
            completedAtMs: previous && previous.completedAtMs ? previous.completedAtMs : Date.now(),
            lastCompletedAtMs: updatedAtMs
        });
        storyStateAfter = {
            storyCompleted: nextCompleted,
            storyPoints: (data.storyPoints || 0) + pointDelta,
            storyStars: (data.storyStars || 0) + starDelta,
            storyOwnedPieceSets: Array.isArray(data.storyOwnedPieceSets) && data.storyOwnedPieceSets.length ? data.storyOwnedPieceSets : ['neo'],
            activePieceSet: data.activePieceSet || 'neo',
            storyStateUpdatedAtMs: updatedAtMs
        };
        transaction.set(profileRef, storyStateAfter, { merge: true });
    });
    syncStoryProfileLocal(storyStateAfter);
    window.playGameSound('gameEnd');
    window.showToast(wasCompletedBefore ? 'Görev tekrar tamamlandı.' : ('Görev tamamlandı! +' + score + ' Taç Puanı'), 'success');
    setStoryMissionStatus('Tamamlandı: ' + stars + ' yıldız. Haritadan sıradaki göreve geçebilirsin.');
    renderStoryMode();
    renderStoryShop();
}

function getStoryMaterialBalance(game) {
    const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    let score = 0;
    game.board().forEach(function(row) {
        row.forEach(function(piece) {
            if (!piece) return;
            const value = values[piece.type] || 0;
            score += piece.color === storyUserColor ? value : -value;
        });
    });
    return score;
}

function scoreStoryBotMove(move, level) {
    let score = 0;
    const values = { p: 10, n: 32, b: 33, r: 50, q: 90, k: 0 };
    if (move.captured) score += (values[move.captured] || 0) * 5;
    if (move.flags && move.flags.indexOf('p') !== -1) score += 80;
    if (move.san && move.san.indexOf('+') !== -1) score += 35;
    if (move.san && move.san.indexOf('#') !== -1) score += 1000;
    if (['d4', 'e4', 'd5', 'e5', 'c4', 'f4', 'c5', 'f5'].indexOf(move.to) !== -1) score += 8;
    score += Math.random() * Math.max(4, 45 - (level * 7));
    return score;
}

async function pickStoryBotMove() {
    const moves = storyChess.moves({ verbose: true });
    if (!moves.length) return null;
    const level = activeMission.botLevel || 1;
    const botMeta = getStoryBotLevel(activeMission);
    if (level >= 3 && window.initStockfish && window.queueStockfishEval) {
        try {
            await Promise.race([window.initStockfish(), new Promise(function(resolve) { setTimeout(resolve, 900); })]);
            const result = await window.queueStockfishEval(storyChess.fen(), {
                depth: botMeta.depth,
                mode: 'story_bot',
                requestId: Date.now()
            });
            if (result && result.bestMove) {
                const best = result.bestMove.slice(0, 4);
                const found = moves.find(function(move) { return move.from + move.to === best; });
                if (found) return found;
            }
        } catch (e) {}
    }
    return moves.sort(function(a, b) { return scoreStoryBotMove(b, level) - scoreStoryBotMove(a, level); })[0];
}

function evaluateStoryBattleEnd() {
    if (!activeMission || activeMission.type !== 'bot') return false;
    if (storyChess.in_checkmate()) {
        if (storyChess.turn() !== storyUserColor) {
            completeStoryMission();
        } else {
            storyMistakes++;
            setStoryMissionStatus('Bot mat etti. Konumu sıfırlayıp yeniden dene.');
        }
        return true;
    }
    if (storyChess.game_over()) {
        const survived = activeMission.battleGoal === 'survive';
        if (survived) completeStoryMission();
        else setStoryMissionStatus('Oyun berabere bitti. Bu görev için daha fazlası gerekiyor.');
        return true;
    }
    const limit = activeMission.moveLimit || 10;
    if (storyBattleUserMoves >= limit) {
        const material = getStoryMaterialBalance(storyChess);
        const goal = activeMission.battleGoal || 'survive';
        const passed = goal === 'survive' ? material >= -180 : (goal === 'win' ? material >= 120 : material >= 80);
        if (passed) completeStoryMission();
        else {
            storyMistakes++;
            setStoryMissionStatus('Süre doldu. Hedef için yeterli üstünlük kurulamadı; yeniden dene.');
        }
        return true;
    }
    return false;
}

async function playStoryBotTurn() {
    if (!activeMission || activeMission.type !== 'bot' || !storyChess || storyChess.turn() === storyUserColor || storyBotThinking) return;
    storyBotThinking = true;
    setStoryMissionStatus(getStoryBotLevel(activeMission).name + ' düşünüyor...');
    const botMove = await pickStoryBotMove();
    if (botMove && activeMission && storyChess) {
        const move = storyChess.move({ from: botMove.from, to: botMove.to, promotion: botMove.promotion || 'q' });
        if (move) {
            if (window.playChessMoveSound) window.playChessMoveSound(move, storyChess);
            else window.playGameSound('move');
        }
    }
    storyBotThinking = false;
    storySelectedSquare = null;
    storyValidMoves = [];
    drawStoryBoard();
    if (!evaluateStoryBattleEnd()) {
        const material = Math.round(getStoryMaterialBalance(storyChess) / 100);
        setStoryMissionStatus('Sıra sende. Materyal farkı: ' + (material > 0 ? '+' : '') + material + '. ' + getStoryBattleGoalText(activeMission));
    }
}

async function handleStoryBattleMove(squareName) {
    if (storyBotThinking) return;
    const piece = storyChess.get(squareName);
    if (!storySelectedSquare) {
        if (!piece || piece.color !== storyUserColor || piece.color !== storyChess.turn()) return;
        storySelectedSquare = squareName;
        storyValidMoves = storyChess.moves({ square: squareName, verbose: true }).map(function(move) { return move.to; });
        drawStoryBoard();
        return;
    }
    if (storySelectedSquare === squareName) {
        storySelectedSquare = null;
        storyValidMoves = [];
        drawStoryBoard();
        return;
    }
    let promotion = 'q';
    if (window.isPromotionMoveForGame && window.isPromotionMoveForGame(storyChess, storySelectedSquare, squareName) && window.chooseChessPromotion) {
        promotion = await window.chooseChessPromotion(storyChess.turn());
        if (!promotion) return;
    }
    const move = storyChess.move({ from: storySelectedSquare, to: squareName, promotion: promotion });
    if (!move) {
        storySelectedSquare = null;
        storyValidMoves = [];
        drawStoryBoard();
        return;
    }
    storyBattleUserMoves++;
    if (window.playChessMoveSound) window.playChessMoveSound(move, storyChess);
    else window.playGameSound('move');
    storySelectedSquare = null;
    storyValidMoves = [];
    drawStoryBoard();
    if (!evaluateStoryBattleEnd()) setTimeout(playStoryBotTurn, 280);
}

async function handleStorySquareClick(squareName, isUserTurn) {
    if (!activeMission || !storyChess || !isUserTurn) return;
    if (activeMission.type === 'bot') {
        await handleStoryBattleMove(squareName);
        return;
    }
    const piece = storyChess.get(squareName);
    if (!storySelectedSquare) {
        if (!piece || piece.color !== storyUserColor || piece.color !== storyChess.turn()) return;
        storySelectedSquare = squareName;
        storyValidMoves = storyChess.moves({ square: squareName, verbose: true }).map(function(move) { return move.to; });
        drawStoryBoard();
        return;
    }

    if (storySelectedSquare === squareName) {
        storySelectedSquare = null;
        storyValidMoves = [];
        drawStoryBoard();
        return;
    }

    const expected = activeMission.solution[storySolutionIndex];
    const playedUci = storySelectedSquare + squareName;
    const expectedBase = expected ? expected.slice(0, 4) : '';
    if (playedUci !== expectedBase) {
        storyMistakes++;
        window.playGameSound('check');
        setStoryMissionStatus('Bu varyant taç yolunu açmıyor. İpucu: ' + (storyMistakes === 1 ? 'tehdit edilen kareyi ara.' : 'taşların birlikte baktığı kareyi kontrol et.'));
        storySelectedSquare = null;
        storyValidMoves = [];
        drawStoryBoard();
        return;
    }

    const move = storyChess.move({
        from: storySelectedSquare,
        to: squareName,
        promotion: expected.length > 4 ? expected.slice(4, 5) : 'q'
    });
    if (!move) return;
    if (window.playChessMoveSound) window.playChessMoveSound(move, storyChess);
    else window.playGameSound('move');
    storySolutionIndex++;
    storySelectedSquare = null;
    storyValidMoves = [];
    autoPlayStoryReplies();
    drawStoryBoard();

    if (storySolutionIndex >= activeMission.solution.length) {
        completeStoryMission();
    } else {
        setStoryMissionStatus('Doğru. Devam hamlesini bul.');
    }
}

function renderStoryShop() {
    updateStoryStats();
    const adminPanel = document.getElementById('storyPromoAdminPanel');
    if (adminPanel) {
        const email = window.currentUser && window.currentUser.email ? String(window.currentUser.email).toLowerCase() : '';
        adminPanel.style.display = email === STORY_PROMO_ADMIN_EMAIL ? 'grid' : 'none';
    }
    const grid = document.getElementById('storyShopGrid');
    if (!grid || !window.STORY_PIECE_SETS) return;
    const profile = window.currentProfileData || {};
    const points = profile.storyPoints || 0;
    const owned = Array.isArray(profile.storyOwnedPieceSets) && profile.storyOwnedPieceSets.length ? profile.storyOwnedPieceSets : ['neo'];
    const active = profile.activePieceSet || 'neo';
    grid.innerHTML = '';
    window.STORY_PIECE_SETS.forEach(function(set) {
        const isOwned = owned.indexOf(set.id) !== -1;
        const isActive = active === set.id;
        const isPreviewing = window.storyPreviewPieceSetId === set.id;
        const card = document.createElement('div');
        card.className = 'story-set-card' + (isPreviewing ? ' previewing' : '');
        const previewPieces = ['k', 'q', 'r', 'b', 'n', 'p'].map(function(type) {
            const themed = 'https://images.chesscomfiles.com/chess-themes/pieces/' + set.theme + '/150/w' + type + '.png';
            return '<div class="story-set-piece" style="background-image:url(\'' + themed + '\');"></div>';
        }).join('');
        const previewBoard = isPreviewing ? buildStorySetPreviewBoard(set) : '';
        card.innerHTML = ''
            + '<div class="story-card-title"><span>' + window.escapeHtml(set.name) + '</span><span style="color:' + window.escapeHtml(set.accent) + '">' + window.escapeHtml(set.rarity) + '</span></div>'
            + '<div class="story-set-preview">' + previewPieces + '</div>'
            + previewBoard
            + '<div class="story-card-sub">Bu set tüm 1v1, 2v2, analiz ve tam ekran tahtalarda kullanılır.</div>'
            + '<div class="story-set-actions">'
                + '<div class="' + (isOwned ? 'story-set-owned' : 'story-price') + '">' + (isOwned ? (isActive ? 'Aktif set' : 'Satın alındı') : (set.price + ' Taç Puanı')) + '</div>'
                + '<button class="secondary story-preview-btn" onclick="previewStoryPieceSet(\'' + set.id + '\')"><i class="fas fa-eye"></i> ' + (isPreviewing ? 'Ön izleniyor' : 'Ön izle') + '</button>'
                + (isOwned
                    ? '<button ' + (isActive ? 'disabled' : '') + ' onclick="equipStoryPieceSet(\'' + set.id + '\')"><i class="fas fa-check"></i> ' + (isActive ? 'AKTİF' : 'KULLAN') + '</button>'
                    : '<button ' + (points < set.price ? 'disabled' : '') + ' onclick="buyStoryPieceSet(\'' + set.id + '\')"><i class="fas fa-crown"></i> SATIN AL</button>')
            + '</div>';
        grid.appendChild(card);
    });
}

function buildStorySetPreviewBoard(set) {
    const layout = [
        ['b', 'r'], ['b', 'n'], ['b', 'b'], ['b', 'q'],
        ['w', 'k'], ['w', 'b'], ['w', 'n'], ['w', 'r'],
        ['b', 'p'], ['b', 'p'], ['b', 'p'], ['b', 'p'],
        ['w', 'p'], ['w', 'p'], ['w', 'p'], ['w', 'p']
    ];
    return '<div class="story-set-board-preview" aria-label="' + window.escapeHtml(set.name) + ' taş ön izlemesi">'
        + layout.map(function(item, index) {
            const color = item[0];
            const type = item[1];
            const themed = 'https://images.chesscomfiles.com/chess-themes/pieces/' + set.theme + '/150/' + color + type + '.png';
            const rank = Math.floor(index / 4);
            const file = index % 4;
            return '<div class="story-set-board-square ' + ((rank + file) % 2 === 0 ? 'light' : 'dark') + '">'
                + '<span style="background-image:url(\'' + themed + '\');"></span>'
                + '</div>';
        }).join('')
        + '</div>';
}

window.previewStoryPieceSet = function(setId) {
    const set = window.STORY_PIECE_SETS && window.STORY_PIECE_SETS.find(function(item) { return item.id === setId; });
    if (!set) return;
    window.storyPreviewPieceSetId = window.storyPreviewPieceSetId === setId ? null : setId;
    window.showToast(window.storyPreviewPieceSetId ? (set.name + ' mağaza içinde ön izleniyor.') : 'Ön izleme kapatıldı.', 'info');
    renderStoryShop();
};

function normalizePromoCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
}

function isStoryPromoAdmin() {
    const email = window.currentUser && window.currentUser.email ? String(window.currentUser.email).toLowerCase() : '';
    return email === STORY_PROMO_ADMIN_EMAIL;
}

window.createStoryPromoCode = async function() {
    if (!window.currentUser || !isStoryPromoAdmin()) return window.showToast('Bu işlem için admin hesabı gerekir.', 'error');
    const code = normalizePromoCode(document.getElementById('storyPromoAdminCode') && document.getElementById('storyPromoAdminCode').value);
    const amount = parseInt((document.getElementById('storyPromoAdminAmount') || {}).value, 10);
    const maxUses = parseInt((document.getElementById('storyPromoAdminUses') || {}).value, 10);
    if (!code || code.length < 4) return window.showToast('Kod en az 4 karakter olmalı.', 'error');
    if (!Number.isFinite(amount) || amount <= 0) return window.showToast('Geçerli bir Taç Puanı miktarı gir.', 'error');
    if (!Number.isFinite(maxUses) || maxUses <= 0) return window.showToast('Geçerli kullanım adedi gir.', 'error');
    try {
        const promoRef = doc(db, 'story_promo_codes', code);
        await runTransaction(db, async function(transaction) {
            const snap = await transaction.get(promoRef);
            if (snap.exists()) throw new Error('Bu promosyon kodu zaten var.');
            transaction.set(promoRef, {
                code: code,
                amount: amount,
                maxUses: maxUses,
                usedCount: 0,
                usedBy: {},
                active: true,
                createdBy: window.currentUser.uid,
                createdByEmail: window.currentUser.email || '',
                createdAtMs: Date.now()
            });
        });
        ['storyPromoAdminCode', 'storyPromoAdminAmount', 'storyPromoAdminUses'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        window.showToast(code + ' üretildi: +' + amount + ' Taç Puanı / ' + maxUses + ' kullanım.', 'success');
    } catch (e) {
        window.showToast(e.message || 'Promosyon kodu üretilemedi.', 'error');
    }
};

window.redeemStoryPromoCode = async function() {
    if (!window.currentUser) return window.showToast('Kod kullanmak için giriş yapmalısın.', 'error');
    const input = document.getElementById('storyPromoCodeInput');
    const code = normalizePromoCode(input && input.value);
    if (!code) return window.showToast('Promosyon kodu gir.', 'error');
    try {
        const promoRef = doc(db, 'story_promo_codes', code);
        const profileRef = doc(db, 'profiles', window.currentUser.uid);
        let storyStateAfter = null;
        let awarded = 0;
        await runTransaction(db, async function(transaction) {
            const promoSnap = await transaction.get(promoRef);
            if (!promoSnap.exists()) throw new Error('Promosyon kodu bulunamadı.');
            const promo = promoSnap.data() || {};
            if (promo.active === false) throw new Error('Bu promosyon kodu aktif değil.');
            const usedBy = promo.usedBy && typeof promo.usedBy === 'object' ? promo.usedBy : {};
            if (usedBy[window.currentUser.uid]) throw new Error('Bu kodu daha önce kullandın.');
            const maxUses = promo.maxUses || 0;
            const usedCount = promo.usedCount || 0;
            if (maxUses > 0 && usedCount >= maxUses) throw new Error('Bu promosyon kodunun kullanım hakkı dolmuş.');
            const amount = Math.max(0, parseInt(promo.amount || 0, 10));
            if (!amount) throw new Error('Bu kodda geçerli puan yok.');
            const profileSnap = await transaction.get(profileRef);
            const profile = profileSnap.exists() ? (profileSnap.data() || {}) : {};
            const updatedAtMs = Date.now();
            const nextUsedBy = Object.assign({}, usedBy);
            nextUsedBy[window.currentUser.uid] = {
                usedAtMs: updatedAtMs,
                email: window.currentUser.email || ''
            };
            transaction.set(promoRef, {
                usedCount: usedCount + 1,
                usedBy: nextUsedBy,
                lastUsedAtMs: updatedAtMs
            }, { merge: true });
            storyStateAfter = {
                storyPoints: (profile.storyPoints || 0) + amount,
                storyOwnedPieceSets: Array.isArray(profile.storyOwnedPieceSets) && profile.storyOwnedPieceSets.length ? profile.storyOwnedPieceSets : ['neo'],
                activePieceSet: profile.activePieceSet || 'neo',
                storyStateUpdatedAtMs: updatedAtMs
            };
            awarded = amount;
            transaction.set(profileRef, storyStateAfter, { merge: true });
        });
        if (input) input.value = '';
        syncStoryProfileLocal(storyStateAfter);
        window.showToast('Promosyon kodu kullanıldı: +' + awarded + ' Taç Puanı.', 'success');
        renderStoryShop();
    } catch (e) {
        window.showToast(e.message || 'Promosyon kodu kullanılamadı.', 'error');
    }
};

window.openStoryMode = function() {
    window.playGameSound('nav');
    window.switchView('view-story-mode');
    renderStoryMode();
};

window.openStoryShop = function() {
    window.playGameSound('nav');
    window.switchView('view-story-shop');
    renderStoryShop();
};

window.startStoryMission = function(missionId) {
    const mission = STORY_MISSIONS.find(function(item) { return item.id === missionId; });
    if (!mission) return;
    if (!isMissionUnlocked(missionId)) return window.showToast('Bu görev henüz kilitli.', 'info');
    const panel = document.getElementById('storyMissionPanel');
    if (panel) panel.style.display = 'grid';
    setupStoryMission(mission);
    setTimeout(function() {
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
};

window.resetStoryMission = function() {
    if (activeMission) setupStoryMission(activeMission);
};

window.closeStoryMission = function() {
    const panel = document.getElementById('storyMissionPanel');
    if (panel) panel.style.display = 'none';
    activeMission = null;
    storyChess = null;
    renderStoryMode();
};

window.buyStoryPieceSet = async function(setId) {
    const set = window.STORY_PIECE_SETS.find(function(item) { return item.id === setId; });
    if (!set || !window.currentUser) return;
    const profileRef = doc(db, 'profiles', window.currentUser.uid);
    try {
        let storyStateAfter = null;
        await runTransaction(db, async function(transaction) {
            const snap = await transaction.get(profileRef);
            const data = snap.exists() ? (snap.data() || {}) : {};
            const points = data.storyPoints || 0;
            const owned = Array.isArray(data.storyOwnedPieceSets) && data.storyOwnedPieceSets.length ? data.storyOwnedPieceSets.slice() : ['neo'];
            const updatedAtMs = Date.now();
            if (owned.indexOf(setId) !== -1) {
                storyStateAfter = {
                    storyPoints: points,
                    storyOwnedPieceSets: owned,
                    activePieceSet: setId,
                    storyStateUpdatedAtMs: updatedAtMs
                };
                transaction.set(profileRef, storyStateAfter, { merge: true });
                return;
            }
            if (points < set.price) throw new Error('Yetersiz Taç Puanı.');
            owned.push(setId);
            storyStateAfter = {
                storyPoints: points - set.price,
                storyOwnedPieceSets: owned,
                activePieceSet: setId,
                storyStateUpdatedAtMs: updatedAtMs
            };
            transaction.set(profileRef, storyStateAfter, { merge: true });
        });
        syncStoryProfileLocal(storyStateAfter);
        window.storyPreviewPieceSetId = null;
        window.playGameSound('gameStart');
        window.showToast(set.name + ' açıldı.', 'success');
        renderStoryShop();
    } catch (e) {
        window.showToast(e.message || 'Set satın alınamadı.', 'error');
    }
};

window.equipStoryPieceSet = async function(setId) {
    if (!window.currentUser) return;
    const profile = window.currentProfileData || {};
    const owned = Array.isArray(profile.storyOwnedPieceSets) && profile.storyOwnedPieceSets.length ? profile.storyOwnedPieceSets : ['neo'];
    if (owned.indexOf(setId) === -1) return window.showToast('Önce bu seti satın almalısın.', 'error');
    const storyStateAfter = {
        storyPoints: profile.storyPoints || 0,
        storyStars: profile.storyStars || 0,
        storyCompleted: profile.storyCompleted || {},
        storyOwnedPieceSets: owned,
        activePieceSet: setId,
        storyStateUpdatedAtMs: Date.now()
    };
    await setDoc(doc(db, 'profiles', window.currentUser.uid), storyStateAfter, { merge: true });
    syncStoryProfileLocal(storyStateAfter);
    window.storyPreviewPieceSetId = null;
    window.playGameSound('nav');
    window.showToast('Taş seti aktif edildi.', 'success');
    renderStoryShop();
    if (window.current1v1Data && window.draw1v1Board) window.draw1v1Board();
    if (window.current2v2Data && window.drawBoard) window.drawBoard();
};

window.renderStoryMode = renderStoryMode;
window.renderStoryShop = renderStoryShop;
