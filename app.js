(async function() {
const [
    { default: autoAnimate },
    { initializeApp },
    { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile },
    { getFirestore, collection, addDoc, setDoc, doc, onSnapshot, updateDoc, query, orderBy, serverTimestamp, deleteDoc, where, arrayUnion, arrayRemove, getDocs, increment, getDoc }
] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/@formkit/auto-animate@0.8.2/index.mjs'),
    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js')
]);

    // === AudioContext Sound System (zero external files) ===
    let _audioCtx = null;
    function getAudioCtx() {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        return _audioCtx;
    }
    document.body.addEventListener('click', function() { getAudioCtx(); }, { once: true });
    document.body.addEventListener('touchstart', function() { getAudioCtx(); }, { once: true });

    function playTone(freq, duration, type, volume) {
        try {
            const ctx = getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(volume || 0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch(e) {}
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
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(filterFreq || 800, ctx.currentTime);
            filter.Q.setValueAtTime(1.5, ctx.currentTime);
            source.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            source.start(ctx.currentTime);
        } catch(e) {}
    }

    const soundGenerators = {
        move: function() {
            playNoise(0.08, 0.3, 900);
            playTone(300, 0.05, 'square', 0.08);
        },
        capture: function() {
            playNoise(0.12, 0.4, 600);
            playTone(200, 0.08, 'square', 0.12);
            setTimeout(function(){ playNoise(0.06, 0.2, 500); }, 30);
        },
        check: function() {
            playNoise(0.08, 0.25, 900);
            playTone(880, 0.1, 'square', 0.15);
            setTimeout(function(){ playTone(660, 0.12, 'square', 0.12); }, 80);
        },
        castle: function() {
            playNoise(0.07, 0.3, 900);
            playTone(350, 0.05, 'square', 0.08);
            setTimeout(function(){
                playNoise(0.07, 0.3, 900);
                playTone(400, 0.05, 'square', 0.08);
            }, 120);
        },
        notify: function() {
            playTone(523, 0.12, 'sine', 0.2);
            setTimeout(function(){ playTone(659, 0.12, 'sine', 0.2); }, 120);
            setTimeout(function(){ playTone(784, 0.15, 'sine', 0.25); }, 240);
        },
        gameEnd: function() {
            playTone(523, 0.2, 'sine', 0.2);
            setTimeout(function(){ playTone(659, 0.2, 'sine', 0.2); }, 200);
            setTimeout(function(){ playTone(784, 0.3, 'sine', 0.25); }, 400);
            setTimeout(function(){ playTone(1047, 0.4, 'sine', 0.3); }, 600);
        },
        nav: function() {
            playTone(700, 0.04, 'sine', 0.12);
            playTone(1400, 0.03, 'sine', 0.06);
        }
    };

    window.playGameSound = function(key) {
        if (localStorage.getItem('gm_mute') === 'true') return;
        var gen = soundGenerators[key];
        if (gen) gen();
    };

    // Global click sound for UI elements
    document.body.addEventListener('click', function(e) {
        if (e.target.closest('button') || e.target.closest('.avatar-option') || e.target.closest('.theme-btn') || e.target.closest('.quiz-btn') || e.target.closest('.cr-card') || e.target.closest('.team-slot') || e.target.closest('.analysis-tab')) {
            if (!e.target.closest('#btnIdrisClick')) {
                window.playGameSound('nav');
            }
        }
    });

    const standingsBody = document.getElementById('standingsBody');
    const lobbySlots = document.getElementById('lobbySlots');
    const crDeckGrid = document.getElementById('crDeckGrid');
    const quizPlayerList = document.getElementById('quizPlayerList');
    const quizBuilderList = document.getElementById('quizBuilderList');
    const quizFinalTableBody = document.getElementById('quizFinalTableBody');
    [standingsBody, lobbySlots, crDeckGrid, quizPlayerList, quizBuilderList, quizFinalTableBody].forEach(function(el) {
        if (el) autoAnimate(el);
    });

    /* ========================================================
       FIREBASE & GAME LOGIC
       ======================================================== */
    const firebaseConfig = {
      apiKey: "AIzaSyDtLQivXHDK0kGkATb9RiDuLCibFPZ8Qyw",
      authDomain: "chess-14580.firebaseapp.com",
      projectId: "chess-14580",
      storageBucket: "chess-14580.firebasestorage.app",
      messagingSenderId: "169513638183",
      appId: "1:169513638183:web:8327b77b1c54b3f26ab102",
      measurementId: "G-6W0TYK3DQR"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    let currentUser = null;
    let currentTournamentId = null;
    let currentTournamentData = null;
    let unsubscribeTournament = null;
    let unsubscribeChat = null;
    let previousMatchesStr = "";
    
    // Toggle Mute Logic
    let soundEnabled = localStorage.getItem('gm_mute') !== 'true'; 
    const muteToggle = document.getElementById('muteSoundToggle');
    if (muteToggle) {
        muteToggle.checked = soundEnabled;
        muteToggle.onchange = (e) => {
            soundEnabled = e.target.checked;
            localStorage.setItem('gm_mute', soundEnabled ? 'false' : 'true');
            if(soundEnabled) window.playGameSound('nav');
        };
    }

    // 2v2 Globals
    let current2v2Id = null;
    let current2v2Data = null;
    let unsubscribe2v2 = null;
    let chess = new Chess();
    let board = null; 
    let boardSelectedSquare = null;
    let boardValidMoves = [];
    let gameTimerInterval = null;
    let lastPlayedMoveCount = -1; 
    
    // Idris Clicker Logic
    let idrisCooldown = false;
    let idrisTimer = null;
    window.initIdrisListener = () => {
        const docRef = doc(db, "global_stats", "idris_clicker");
        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                document.getElementById('idrisGlobalCounter').innerText = docSnap.data().count || 0;
            } else {
                setDoc(docRef, { count: 0 }, { merge: true });
            }
        });
    };
    window.clickIdris = async () => {
        if(idrisCooldown) return;
        window.playGameSound('capture');
        confetti({particleCount: 50, spread: 60, origin: { y: 0.7 }, colors: ['#8E2DE2', '#4A00E0', '#ffffff']});
        idrisCooldown = true;
        const btn = document.getElementById('btnIdrisClick');
        const txt = document.getElementById('idrisCooldownText');
        btn.disabled = true;
        btn.style.filter = "grayscale(1)";
        btn.innerHTML = `<i class="fas fa-hourglass-half"></i> BEKLE`;
        let timeLeft = 5;
        txt.innerText = `Sonraki basış: ${timeLeft}s`;
        idrisTimer = setInterval(() => {
            timeLeft--;
            txt.innerText = `Sonraki basış: ${timeLeft}s`;
            if(timeLeft <= 0) {
                clearInterval(idrisTimer);
                idrisCooldown = false;
                btn.disabled = false;
                btn.style.filter = "none";
                btn.innerHTML = `<i class="fas fa-fingerprint"></i> BAS`;
                txt.innerText = "";
            }
        }, 1000);
        try { await updateDoc(doc(db, "global_stats", "idris_clicker"), { count: increment(1) }); } 
        catch(e) { await setDoc(doc(db, "global_stats", "idris_clicker"), { count: 1 }, { merge: true }); }
    };

    const crData = [
        {id:26000000, n:"Knight", e:3, r:"common", t:"troop", role:"mini_tank"},{id:26000001, n:"Archers", e:3, r:"common", t:"troop", role:"anti_air"},{id:26000002, n:"Goblins", e:2, r:"common", t:"troop", role:"cycle"},{id:26000005, n:"Minions", e:3, r:"common", t:"troop", role:"anti_air"},{id:26000008, n:"Barbarians", e:5, r:"common", t:"troop", role:"tank_killer"},{id:26000010, n:"Skeletons", e:1, r:"common", t:"troop", role:"cycle"},{id:26000013, n:"Bomber", e:2, r:"common", t:"troop", role:"support"},{id:26000019, n:"Spear Goblins", e:2, r:"common", t:"troop", role:"anti_air"},{id:26000022, n:"Minion Horde", e:5, r:"common", t:"troop", role:"swarm"},{id:26000024, n:"Royal Giant", e:6, r:"common", t:"troop", role:"win_condition"},{id:26000030, n:"Ice Spirit", e:1, r:"common", t:"troop", role:"cycle"},{id:26000031, n:"Fire Spirit", e:1, r:"common", t:"troop", role:"cycle"},{id:26000041, n:"Goblin Gang", e:3, r:"common", t:"troop", role:"swarm"},{id:26000043, n:"Elite Barbarians", e:6, r:"common", t:"troop", role:"win_condition"},{id:26000047, n:"Royal Recruits", e:7, r:"common", t:"troop", role:"defense"},{id:26000049, n:"Bats", e:2, r:"common", t:"troop", role:"cycle"},{id:26000053, n:"Rascals", e:5, r:"common", t:"troop", role:"defense"},{id:26000056, n:"Skeleton Barrel", e:3, r:"common", t:"troop", role:"win_condition"},{id:26000064, n:"Firecracker", e:3, r:"common", t:"troop", role:"anti_air"},{id:26000080, n:"Skeleton Dragons", e:4, r:"common", t:"troop", role:"anti_air"},{id:26000084, n:"Electro Spirit", e:1, r:"common", t:"troop", role:"cycle"},
        {id:26000003, n:"Giant", e:5, r:"rare", t:"troop", role:"win_condition"},{id:26000011, n:"Valkyrie", e:4, r:"rare", t:"troop", role:"mini_tank"},{id:26000014, n:"Musketeer", e:4, r:"rare", t:"troop", role:"anti_air"},{id:26000017, n:"Wizard", e:5, r:"rare", t:"troop", role:"anti_air"},{id:26000018, n:"Mini P.E.K.K.A", e:4, r:"rare", t:"troop", role:"tank_killer"},{id:26000021, n:"Hog Rider", e:4, r:"rare", t:"troop", role:"win_condition"},{id:26000028, n:"Three Musketeers", e:9, r:"rare", t:"troop", role:"win_condition"},{id:26000036, n:"Battle Ram", e:4, r:"rare", t:"troop", role:"win_condition"},{id:26000038, n:"Ice Golem", e:2, r:"rare", t:"troop", role:"mini_tank"},{id:26000039, n:"Mega Minion", e:3, r:"rare", t:"troop", role:"anti_air"},{id:26000040, n:"Dart Goblin", e:3, r:"rare", t:"troop", role:"anti_air"},{id:26000052, n:"Zappies", e:4, r:"rare", t:"troop", role:"defense"},{id:26000057, n:"Flying Machine", e:4, r:"rare", t:"troop", role:"anti_air"},{id:26000059, n:"Royal Hogs", e:5, r:"rare", t:"troop", role:"win_condition"},{id:26000065, n:"Elixir Golem", e:3, r:"rare", t:"troop", role:"win_condition"},{id:26000066, n:"Battle Healer", e:4, r:"rare", t:"troop", role:"mini_tank"},{id:26000068, n:"Heal Spirit", e:1, r:"rare", t:"troop", role:"cycle"},
        {id:26000004, n:"P.E.K.K.A", e:7, r:"epic", t:"troop", role:"tank_killer"},{id:26000006, n:"Balloon", e:5, r:"epic", t:"troop", role:"win_condition"},{id:26000007, n:"Witch", e:5, r:"epic", t:"troop", role:"support"},{id:26000009, n:"Golem", e:8, r:"epic", t:"troop", role:"win_condition"},{id:26000012, n:"Skeleton Army", e:3, r:"epic", t:"troop", role:"swarm"},{id:26000015, n:"Baby Dragon", e:4, r:"epic", t:"troop", role:"anti_air"},{id:26000016, n:"Prince", e:5, r:"epic", t:"troop", role:"mini_tank"},{id:26000020, n:"Giant Skeleton", e:6, r:"epic", t:"troop", role:"tank"},{id:26000025, n:"Guards", e:3, r:"epic", t:"troop", role:"defense"},{id:26000027, n:"Dark Prince", e:4, r:"epic", t:"troop", role:"mini_tank"},{id:26000034, n:"Bowler", e:5, r:"epic", t:"troop", role:"defense"},{id:26000044, n:"Hunter", e:4, r:"epic", t:"troop", role:"tank_killer"},{id:26000045, n:"Executioner", e:5, r:"epic", t:"troop", role:"anti_air"},{id:26000054, n:"Cannon Cart", e:5, r:"epic", t:"troop", role:"mini_tank"},{id:26000058, n:"Wall Breakers", e:2, r:"epic", t:"troop", role:"win_condition"},{id:26000060, n:"Goblin Giant", e:6, r:"epic", t:"troop", role:"win_condition"},{id:26000063, n:"Electro Dragon", e:5, r:"epic", t:"troop", role:"anti_air"},
        {id:26000023, n:"Ice Wizard", e:3, r:"legendary", t:"troop", role:"defense"},{id:26000026, n:"Princess", e:3, r:"legendary", t:"troop", role:"anti_air"},{id:26000029, n:"Lava Hound", e:7, r:"legendary", t:"troop", role:"win_condition"},{id:26000032, n:"Miner", e:3, r:"legendary", t:"troop", role:"win_condition"},{id:26000033, n:"Sparky", e:6, r:"legendary", t:"troop", role:"win_condition"},{id:26000035, n:"Lumberjack", e:4, r:"legendary", t:"troop", role:"tank_killer"},{id:26000037, n:"Inferno Dragon", e:4, r:"legendary", t:"troop", role:"tank_killer"},{id:26000042, n:"Electro Wizard", e:4, r:"legendary", t:"troop", role:"anti_air"},{id:26000046, n:"Bandit", e:3, r:"legendary", t:"troop", role:"mini_tank"},{id:26000048, n:"Night Witch", e:4, r:"legendary", t:"troop", role:"support"},{id:26000050, n:"Royal Ghost", e:3, r:"legendary", t:"troop", role:"mini_tank"},{id:26000051, n:"Ram Rider", e:5, r:"legendary", t:"troop", role:"win_condition"},{id:26000055, n:"Mega Knight", e:7, r:"legendary", t:"troop", role:"tank"},{id:26000061, n:"Fisherman", e:3, r:"legendary", t:"troop", role:"defense"},{id:26000062, n:"Magic Archer", e:4, r:"legendary", t:"troop", role:"anti_air"},{id:26000083, n:"Mother Witch", e:4, r:"legendary", t:"troop", role:"support"},{id:26000087, n:"Phoenix", e:4, r:"legendary", t:"troop", role:"anti_air"},
        {id:28000000, n:"Fireball", e:4, r:"rare", t:"spell", role:"big_spell"},{id:28000001, n:"Arrows", e:3, r:"common", t:"spell", role:"small_spell"},{id:28000002, n:"Rage", e:2, r:"epic", t:"spell", role:"small_spell"},{id:28000003, n:"Rocket", e:6, r:"rare", t:"spell", role:"big_spell"},{id:28000004, n:"Goblin Barrel", e:3, r:"epic", t:"spell", role:"win_condition"},{id:28000005, n:"Freeze", e:4, r:"epic", t:"spell", role:"utility"},{id:28000006, n:"Lightning", e:6, r:"epic", t:"spell", role:"big_spell"},{id:28000007, n:"Zap", e:2, r:"common", t:"spell", role:"small_spell"},{id:28000008, n:"Poison", e:4, r:"epic", t:"spell", role:"big_spell"},{id:28000009, n:"Graveyard", e:5, r:"legendary", t:"spell", role:"win_condition"},{id:28000010, n:"The Log", e:2, r:"legendary", t:"spell", role:"small_spell"},{id:28000011, n:"Tornado", e:3, r:"epic", t:"spell", role:"utility"},{id:28000012, n:"Clone", e:3, r:"epic", t:"spell", role:"utility"},{id:28000013, n:"Earthquake", e:3, r:"rare", t:"spell", role:"big_spell"},{id:28000015, n:"Barbarian Barrel", e:2, r:"epic", t:"spell", role:"small_spell"}, {id:28000017, n:"Giant Snowball", e:2, r:"common", t:"spell", role:"small_spell"}, {id:28000018, n:"Royal Delivery", e:3, r:"common", t:"spell", role:"defense"},
        {id:27000000, n:"Cannon", e:3, r:"common", t:"building", role:"defense"},{id:27000001, n:"Goblin Hut", e:5, r:"rare", t:"building", role:"spawner"},{id:27000002, n:"Mortar", e:4, r:"common", t:"building", role:"win_condition"},{id:27000003, n:"Inferno Tower", e:5, r:"rare", t:"building", role:"tank_killer"},{id:27000004, n:"Bomb Tower", e:4, r:"rare", t:"building", role:"defense"},{id:27000005, n:"Barbarian Hut", e:7, r:"rare", t:"building", role:"spawner"},{id:27000006, n:"Tesla", e:4, r:"common", t:"building", role:"defense"},{id:27000007, n:"Elixir Collector", e:6, r:"rare", t:"building", role:"utility"},{id:27000008, n:"X-Bow", e:6, r:"epic", t:"building", role:"win_condition"},{id:27000009, n:"Tombstone", e:3, r:"rare", t:"building", role:"defense"},{id:27000010, n:"Furnace", e:4, r:"rare", t:"building", role:"spawner"},{id:27000011, n:"Goblin Cage", e:4, r:"rare", t:"building", role:"defense"},{id:27000012, n:"Goblin Drill", e:4, r:"epic", t:"building", role:"win_condition"}
    ];

    window.showToast = (msg, type = "info") => { let bg; if(type === "success") bg = "linear-gradient(to right, #00b09b, #96c93d)"; else if(type === "error") bg = "linear-gradient(to right, #ff5f6d, #ffc371)"; else if(type === "gold") bg = "linear-gradient(to right, #b8860b, #d4af37)"; else bg = "#333"; Toastify({ text: msg, duration: 3000, gravity: "top", position: "right", stopOnFocus: true, style: { background: bg, borderRadius: "8px", boxShadow: "0 4px 15px rgba(0,0,0,0.3)", fontWeight: "bold" }, }).showToast(); };
    window.setTheme = (t) => { document.body.setAttribute('data-theme', t); localStorage.setItem('gm_theme', t); };
    window.setTheme(localStorage.getItem('gm_theme') || 'dark');
    
    const avatarList = ['fa-chess-king', 'fa-chess-queen', 'fa-chess-rook', 'fa-chess-bishop', 'fa-chess-knight', 'fa-chess-pawn', 'fa-user-astronaut', 'fa-dragon', 'fa-fire', 'fa-bolt', 'fa-crown', 'fa-brain', 'fa-ghost', 'fa-robot'];
    function renderAvatars(tid, iid) { const c = document.getElementById(tid); c.innerHTML=''; avatarList.forEach(i => { const d=document.createElement('div'); d.className='avatar-option'; d.innerHTML=`<i class="fas ${i}"></i>`; d.onclick=()=>{ window.playGameSound('nav'); c.querySelectorAll('.avatar-option').forEach(e=>e.classList.remove('selected')); d.classList.add('selected'); document.getElementById(iid).value=i; }; c.appendChild(d); }); if(c.firstChild) c.firstChild.classList.add('selected'); document.getElementById(iid).value=avatarList[0]; }
    renderAvatars('authAvatarGrid','selectedAvatar');
    function makeId(length) { let result = ''; const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (let i = 0; i < length; i++) result += characters.charAt(Math.floor(Math.random() * characters.length)); return result; }
    let isReg = false;
    document.getElementById('btnSwitchLogin').onclick=()=>{isReg=false; toggleAuth();};
    document.getElementById('btnSwitchRegister').onclick=()=>{isReg=true; toggleAuth();};
    function toggleAuth(){ window.playGameSound('nav'); document.getElementById('registerFields').style.display=isReg?'block':'none'; document.getElementById('btnAuthAction').innerText=isReg?'HESAP OLUŞTUR & GİR':'GİRİŞ YAP'; document.getElementById('btnSwitchLogin').classList.toggle('secondary', isReg); document.getElementById('btnSwitchRegister').classList.toggle('secondary', !isReg); }
    document.getElementById('btnAuthAction').onclick=async()=>{ window.playGameSound('nav'); const btn = document.getElementById('btnAuthAction'); const e=document.getElementById('emailInput').value.trim(), p=document.getElementById('passwordInput').value.trim(), n=document.getElementById('displayNameInput').value.trim(), a=document.getElementById('selectedAvatar').value; if (!e || !p || (isReg && !n)) { return showToast("Lütfen tüm alanları doldurun.", "error"); } btn.disabled = true; btn.innerText = "İŞLENİYOR..."; try { if(isReg){ const c=await createUserWithEmailAndPassword(auth,e,p); await updateProfile(c.user,{displayName:n, photoURL:a}); showToast("Kayıt başarılı! Hoş geldin.", "success"); } else { await signInWithEmailAndPassword(auth,e,p); showToast("Giriş yapıldı.", "success"); } } catch(err){ showToast(err.message, "error"); } finally { btn.disabled = false; toggleAuth(); } };
    document.getElementById('btnLogout').onclick=()=>{ window.playGameSound('nav'); Swal.fire({ title: 'Çıkış Yap', text: "Oturumu kapatmak istiyor musun?", icon: 'question', showCancelButton: true, confirmButtonColor: '#d4af37', cancelButtonColor: '#555', confirmButtonText: 'Evet, Çık', cancelButtonText: 'İptal', background: 'rgba(30,30,35,0.95)', color: '#fff' }).then((result) => { if (result.isConfirmed) signOut(auth); }); };
    onAuthStateChanged(auth, u=>{ if(u){ currentUser=u; document.getElementById('userInfoSection').style.display='flex'; document.getElementById('btnLogout').style.display='inline-block'; document.getElementById('currentUserDisplay').innerText=u.displayName; document.getElementById('currentUserIcon').innerHTML=`<i class="fas ${u.photoURL||'fa-chess-pawn'}" style="color:var(--primary)"></i>`; window.switchView('view-dashboard'); loadMyTournaments(); initIdrisListener(); } else { currentUser=null; document.getElementById('userInfoSection').style.display='none'; document.getElementById('btnLogout').style.display='none'; window.switchView('view-auth'); } });
    function loadMyTournaments(){ if(!currentUser) return; const q = query(collection(db,"tournaments"), where("participantIds","array-contains",currentUser.uid)); onSnapshot(q, snap=>{ const l = document.getElementById('myTournamentsList'); l.innerHTML=''; if(snap.empty) l.innerHTML='<p style="text-align:center; color:var(--text-muted)">Kayıtlı turnuva yok.</p>'; snap.forEach(d=>{ const t=d.data(); const isFin = t.status==='finished'; let actionBtn = ''; if(isFin) { actionBtn += `<button class="secondary" style="margin-right:5px; font-size:0.7rem;" onclick="enterTournament('${d.id}')">Görüntüle</button>`; actionBtn += `<button class="secondary" style="font-size:0.7rem; color:var(--danger); border-color:var(--danger);" onclick="removeTournament('${d.id}')">Sil</button>`; } else { actionBtn = `<button class="icon-btn secondary" style="border:none" onclick="enterTournament('${d.id}')"><i class="fas fa-chevron-right"></i></button>`; } l.innerHTML += `<div class="history-item"><div><div style="font-weight:bold; ${isFin?'color:var(--text-muted); text-decoration:line-through;':''}">${t.name}</div><div style="font-size:0.8rem; color:var(--text-muted);">${isFin?'Tamamlandı':(t.status==='active'?'Oynanıyor':'Lobi')} #${d.id}</div></div><div>${actionBtn}</div></div>`; }); }); }
    window.removeTournament = async(tid) => { window.playGameSound('nav'); const res = await Swal.fire({title:'Listeden Kaldır?', text:"Geçmişten silinecek.", icon:'warning', showCancelButton:true, confirmButtonColor:'#d33', background:'rgba(30,30,35,0.95)', color:'#fff'}); if(res.isConfirmed) { await updateDoc(doc(db,"tournaments",tid), { participantIds: arrayRemove(currentUser.uid) }); showToast("Listeden kaldırıldı", "info"); } };
    document.getElementById('btnCreateTournament').onclick=async()=>{ window.playGameSound('nav'); const btn = document.getElementById('btnCreateTournament'); const n=document.getElementById('newTournamentName').value.trim(), c=parseInt(document.getElementById('playerCount').value); if(!n) return showToast("Lütfen bir turnuva adı girin.", "error"); btn.disabled = true; btn.innerText = "OLUŞTURULUYOR..."; const shortId = makeId(5); const slots=[]; for(let i=0;i<c;i++) slots.push({index:i, name:`Masa ${i+1}`, ownerId:null, avatar:'fa-chair', status:'open'}); await setDoc(doc(db,"tournaments",shortId),{ name:n, creatorId:currentUser.uid, status:'lobby', slots, matches:[], participantIds:[currentUser.uid], rules:"", createdAt:new Date() }); btn.disabled = false; btn.innerText = "OLUŞTUR"; showToast("Turnuva oluşturuldu!", "success"); enterTournament(shortId); };
    document.getElementById('btnJoinTournament').onclick=()=>{ const id=document.getElementById('joinCodeInput').value.trim().toUpperCase(); if(id) enterTournament(id); };
    let currentCRDeck = [];
    window.openClashGenerator = () => { window.playGameSound('nav'); switchView('view-clash'); if(currentCRDeck.length === 0) generateSmartDeck(); };
    window.generateSmartDeck = () => { window.playGameSound('nav'); const winConditions = crData.filter(c => c.role === 'win_condition'); const smallSpells = crData.filter(c => c.role === 'small_spell'); const bigSpells = crData.filter(c => c.role === 'big_spell'); const antiAir = crData.filter(c => c.role === 'anti_air'); const buildings = crData.filter(c => c.t === 'building'); const tanks = crData.filter(c => c.role === 'tank' || c.role === 'mini_tank'); const cycles = crData.filter(c => c.role === 'cycle' || c.e <= 2); let deck = []; let deckIds = new Set(); let hasChampion = false; const addCard = (pool, fallbackPool = crData) => { let available = pool.filter(c => !deckIds.has(c.id) && !(hasChampion && c.r === 'champion')); if(available.length === 0) { available = fallbackPool.filter(c => !deckIds.has(c.id) && !(hasChampion && c.r === 'champion')); } if(available.length === 0) return null; const card = available[Math.floor(Math.random() * available.length)]; if(card.r === 'champion') hasChampion = true; deck.push(card); deckIds.add(card.id); return card; }; addCard(winConditions); addCard(smallSpells); addCard(bigSpells); addCard(antiAir); if(Math.random() > 0.5) addCard(buildings); else addCard(tanks); while(deck.length < 8) { let avg = deck.reduce((a,b)=>a+b.e,0) / deck.length; if(avg > 3.8) { addCard(cycles); } else { addCard(crData); } } renderDeck(deck); };
    function renderDeck(deck) { currentCRDeck = deck; const grid = document.getElementById('crDeckGrid'); grid.innerHTML = ''; let totalElixir = 0; deck.forEach(c => { totalElixir += c.e; const key = c.n.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-'); const imgUrl = `https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards-75/${key}.png`; const cardEl = document.createElement('div'); cardEl.className = `cr-card rarity-${c.r}`; cardEl.innerHTML = `<div class="cr-elixir">${c.e}</div><img src="${imgUrl}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/1068/1068729.png'; this.style.filter='none';"><div class="cr-card-name">${c.n}</div>`; grid.appendChild(cardEl); }); const avg = (totalElixir / 8).toFixed(1); document.getElementById('crAvgElixir').innerText = avg; let type = "Dengeli"; if(avg < 3.0) type = "Hızlı Döngü (Cycle)"; else if(avg > 4.2) type = "Ağır Saldırı (Beatdown)"; else if(deck.some(c => c.n === "Miner" || c.n === "Goblin Barrel")) type = "Kontrol / Bait"; else if(deck.some(c => c.n === "X-Bow" || c.n === "Mortar")) type = "Kuşatma (Siege)"; document.getElementById('deckArchetype').innerText = type; document.getElementById('btnCopyCR').style.display = 'block'; document.getElementById('copyInstructions').style.display = 'block'; }
    window.copyToCR = () => { if (!currentCRDeck || currentCRDeck.length !== 8) { return showToast("Önce bir deste oluşturulmalı!", "error"); } const idString = currentCRDeck.map(c => c.id).join(';'); const finalLink = `https://link.clashroyale.com/en/?clashroyale://copyDeck?deck=${idString}&l=Royals&tt=159000000`; const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent); showToast("Clash Royale açılıyor...", "success"); if (isMobile) { window.open(finalLink, '_blank'); } else { window.open(finalLink, '_blank'); } };
    window.switchView = (id) => { 
        window.playGameSound('nav'); 
        document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); 
        document.getElementById(id).classList.add('active'); 
        const floatNav = document.querySelector('.floating-container'); 
        if(id === 'view-lobby' || id === 'view-tournament' || id === 'view-2v2-lobby' || id === 'view-2v2-game'){ 
            floatNav.style.display = 'flex'; 
        } else { 
            floatNav.style.display = 'none'; 
            document.getElementById('chatWidget').style.display = 'none'; 
            document.getElementById('chatToggleBtn').style.display = 'flex'; 
        }
    };

    /* ========================================================
       ANALYSIS & GAME REVIEW LOGIC
       ======================================================== */
    let analysisChess = new Chess();
    let analysisHistory = [];
    let currentAnalysisIndex = 0;
    let analysisMoveReviews = [];
    let analysisReviewToken = 0;
    let liveEvalRequestId = 0;
    let liveBestMoveUci = null;
    let liveBestMoveFen = null;
    let bestPreviewToken = 0;

    let sfWorker = null;
    let sfInitPromise = null;
    let isSfReady = false;
    let sfPendingFen = null;
    let sfQueue = [];
    let sfActiveTask = null;

    const SF_DEPTH_LIVE = 17;
    const SF_DEPTH_REVIEW = 14;
    const SF_MULTI_PV = 2;
    const MOVE_CATEGORY_LABELS = {
        brilliant: "Brilliant",
        best: "En iyi",
        good: "Iyi",
        mistake: "Hata",
        blunder: "Blunder"
    };
    const MOVE_CATEGORY_TAGS = {
        brilliant: "BR",
        best: "BEST",
        good: "GOOD",
        mistake: "?",
        blunder: "??"
    };

    function setStockfishStatus(state) {
        var badge = document.getElementById('sfStatusBadge');
        if (!badge) return;
        if (state === 'active') {
            badge.innerHTML = '<i class="fas fa-check-circle"></i> Stockfish Aktif';
            badge.style.background = 'rgba(76,175,80,0.2)';
            badge.style.color = '#4caf50';
            badge.style.borderColor = '#4caf50';
        } else if (state === 'loading') {
            badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Motor Yukleniyor';
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

    function materialEvalWhiteCpFromFen(fen) {
        try {
            var temp = new Chess();
            if (!temp.load(fen)) return 0;
            var board = temp.board();
            var score = 0;
            var values = {p:100, n:320, b:330, r:500, q:900, k:0};
            board.forEach(function(row) {
                row.forEach(function(piece) {
                    if (!piece) return;
                    var val = values[piece.type] || 0;
                    score += piece.color === 'w' ? val : -val;
                });
            });
            return score;
        } catch (e) {
            return 0;
        }
    }

    function queueStockfishEval(fen, opts) {
        opts = opts || {};
        return new Promise(function(resolve) {
            var mode = opts.mode || 'live';
            var depth = opts.depth || SF_DEPTH_LIVE;
            var requestId = opts.requestId || 0;

            if (!sfWorker || !isSfReady) {
                var turnMul = fen.split(' ')[1] === 'w' ? 1 : -1;
                var cpFromTurn = materialEvalWhiteCpFromFen(fen) * turnMul;
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
        sfWorker.postMessage('position fen ' + sfActiveTask.fen);
        sfWorker.postMessage('go depth ' + sfActiveTask.depth);
    }

    function initStockfish() {
        if (sfWorker && isSfReady) return Promise.resolve();
        if (sfInitPromise) return sfInitPromise;

        sfInitPromise = new Promise(function(resolve) {
            try {
                var resolved = false;
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
                    console.error("Stockfish Worker Error:", err);
                    sfWorker = null;
                    isSfReady = false;
                    setStockfishStatus('fallback');

                    if (sfActiveTask) {
                        sfActiveTask.resolve({cp: null, mate: null, bestMove: null, topLines: [], mode: sfActiveTask.mode, requestId: sfActiveTask.requestId, fallback: true});
                        sfActiveTask = null;
                    }
                    while (sfQueue.length > 0) {
                        var waiting = sfQueue.shift();
                        waiting.resolve({cp: null, mate: null, bestMove: null, topLines: [], mode: waiting.mode, requestId: waiting.requestId, fallback: true});
                    }
                    finishInit();
                };

                sfWorker.postMessage('uci');
            } catch (err) {
                console.error("Stockfish init failed:", err);
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
            var trimmed = line.trim();
            if (!trimmed) return;
            handleStockfishLine(trimmed);
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
            var matchPv = line.match(/\bmultipv (\d+)/);
            var pvIndex = matchPv ? parseInt(matchPv[1], 10) : 1;
            var matchCp = line.match(/score cp (-?\d+)/);
            var matchMate = line.match(/score mate (-?\d+)/);
            var matchPvMove = line.match(/\spv\s+([a-h][1-8][a-h][1-8][nbrq]?)/);
            var lineData = sfActiveTask.topLines[pvIndex] || { rank: pvIndex, cp: null, mate: null, uci: null };

            if (matchMate) {
                lineData.mate = parseInt(matchMate[1], 10);
                lineData.cp = null;
            } else if (matchCp) {
                lineData.cp = parseInt(matchCp[1], 10);
                lineData.mate = null;
            }

            if (matchPvMove) {
                lineData.uci = matchPvMove[1];
            }

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
            var parts = line.split(' ');
            sfActiveTask.bestMove = parts[1] || sfActiveTask.bestMove || null;
            var doneTask = sfActiveTask;
            sfActiveTask = null;
            var rankedLines = Object.keys(doneTask.topLines)
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

    function formatEngineMove(uci, fen) {
        if (!uci || uci === '(none)' || uci.length < 4) return '-';
        try {
            var probe = new Chess();
            if (!probe.load(fen)) return uci;
            var moveObj = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
            if (uci.length > 4) moveObj.promotion = uci.slice(4, 5);
            var played = probe.move(moveObj);
            if (played && played.san) return played.san;
        } catch (e) {}
        return uci;
    }

    function setBestMoveButton(text, uci, fen) {
        var bestEl = document.getElementById('report-best');
        if (!bestEl) return;
        bestEl.innerText = text;
        bestEl.dataset.uci = uci || '';
        bestEl.dataset.fen = fen || '';
        bestEl.disabled = !uci;
    }

    function getCurrentReviewContext() {
        if (!analysisMoveReviews.length || !analysisHistory.length) return null;
        var idx = currentAnalysisIndex > 0 ? currentAnalysisIndex - 1 : 0;
        var review = analysisMoveReviews[idx];
        if (!review || !review.bestMove || review.bestMove === '(none)') return null;
        return { moveIndex: idx, review: review };
    }

    function refreshBestMoveButtonState() {
        var ctx = getCurrentReviewContext();
        if (ctx && ctx.review.bestMoveSan && ctx.review.bestMoveSan !== '-') {
            setBestMoveButton(ctx.review.bestMoveSan, ctx.review.bestMove, ctx.review.beforeFen);
            return;
        }

        if (liveBestMoveUci && liveBestMoveFen) {
            setBestMoveButton(formatEngineMove(liveBestMoveUci, liveBestMoveFen), liveBestMoveUci, liveBestMoveFen);
            return;
        }

        setBestMoveButton('-', null, null);
    }

    function waitMs(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    window.previewBestVsPlayedMove = async () => {
        var ctx = getCurrentReviewContext();
        if (!ctx || !ctx.review.beforeFen || !ctx.review.bestMove || !analysisHistory[ctx.moveIndex]) {
            showToast('Bu hamle icin karsilastirma hazir degil.', 'info');
            return;
        }

        var token = ++bestPreviewToken;
        var originalFen = analysisChess.fen();
        var originalIndex = currentAnalysisIndex;
        var move = analysisHistory[ctx.moveIndex];

        try {
            analysisChess.load(ctx.review.beforeFen);
            analysisChess.move({
                from: ctx.review.bestMove.slice(0, 2),
                to: ctx.review.bestMove.slice(2, 4),
                promotion: ctx.review.bestMove.length > 4 ? ctx.review.bestMove.slice(4, 5) : undefined
            });
            renderAnalysisBoard();
            if (token !== bestPreviewToken) return;
            await waitMs(900);

            analysisChess.load(ctx.review.beforeFen);
            analysisChess.move(move.san);
            renderAnalysisBoard();
            if (token !== bestPreviewToken) return;
            await waitMs(900);
        } catch (e) {
            console.error(e);
        } finally {
            if (token !== bestPreviewToken) return;
            analysisChess.load(originalFen);
            currentAnalysisIndex = originalIndex;
            renderAnalysisBoard();
            highlightMoveRow();
            runStockfish();
        }
    };

    function runStockfish() {
        var fen = analysisChess.fen();
        var ctx = getCurrentReviewContext();
        if (ctx && ctx.review.bestMoveSan && ctx.review.bestMoveSan !== '-') {
            setBestMoveButton(ctx.review.bestMoveSan, ctx.review.bestMove, ctx.review.beforeFen);
        } else {
            setBestMoveButton("Hesaplaniyor...", null, fen);
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

        var requestId = ++liveEvalRequestId;
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

    function updateEvalBarFallback(fen) {
        var activeFen = fen || analysisChess.fen();
        var turnMul = activeFen.split(' ')[1] === 'w' ? 1 : -1;
        var cpFromTurn = materialEvalWhiteCpFromFen(activeFen) * turnMul;
        updateEvalBarUI(cpFromTurn, null, activeFen);
    }

    function updateEvalBarUI(cp, mate, fenForTurn) {
        var score = 0;
        var textScore = "0.0";
        var turnChar = ((fenForTurn || analysisChess.fen()).split(' ')[1] || 'w');
        var isWhiteTurn = turnChar === 'w';

        if (mate !== null && mate !== undefined) {
            score = mate > 0 ? 1000 : -1000;
            if (!isWhiteTurn) score = -score;
            textScore = mate === 0 ? 'M0' : (score > 0 ? '+' : '-') + 'M' + Math.abs(mate);
        } else if (cp !== null && cp !== undefined) {
            score = cp;
            if (!isWhiteTurn) score = -score;
            textScore = Math.abs(score) < 10 ? '0.0' : (score > 0 ? '+' : '') + (score / 100).toFixed(1);
        }

        var percent = 50 + (score / 20);
        percent = Math.max(3, Math.min(97, percent));
        if (mate !== null && mate !== undefined) {
            percent = score > 0 ? 97 : 3;
        }

        var fill = document.getElementById('analysisEvalFill');
        var txt = document.getElementById('analysisEvalScore');
        var evalDisplay = document.getElementById('report-eval-display');
        if (fill) fill.style.height = percent + "%";
        if (txt) txt.innerText = textScore;
        if (evalDisplay) evalDisplay.innerText = textScore;

        if (sfWorker && isSfReady) setStockfishStatus('active');
    }

    function evalToWhiteScore(result, fen) {
        if (!result) return null;
        var turnIsWhite = fen.split(' ')[1] === 'w';

        if (result.mate !== null && result.mate !== undefined) {
            var sign = result.mate > 0 ? 1 : -1;
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
        var evalResult = await queueStockfishEval(fen, { depth: depth, mode: 'review', requestId: token });
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
        return evalResult;
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
        return 1 / (1 + Math.exp(-score / 260));
    }

    function moveAccuracyFromEval(beforeWhite, bestAfterWhite, playedAfterWhite, moveColor, cpl) {
        var bestMover = moverScoreFromWhite(bestAfterWhite, moveColor);
        var playedMover = moverScoreFromWhite(playedAfterWhite, moveColor);
        var beforeMover = moverScoreFromWhite(beforeWhite, moveColor);

        var bestChance = winChanceFromScore(bestMover);
        var playedChance = winChanceFromScore(playedMover);
        var beforeChance = winChanceFromScore(beforeMover);

        var chanceLoss = Math.max(0, bestChance - playedChance);
        var cpPenalty = Math.min(0.5, cpl / 900);
        var volatilityBonus = Math.max(0, (Math.abs(beforeChance - 0.5) - 0.25) * 10);

        var accuracy = 100 - (chanceLoss * 122) - (cpPenalty * 34) + volatilityBonus;
        return Math.max(1, Math.min(100, Math.round(accuracy)));
    }

    function getTopLineByRank(lines, rank) {
        if (!Array.isArray(lines)) return null;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i] && lines[i].rank === rank) return lines[i];
        }
        return null;
    }

    function isRoutineBestMove(payload) {
        if (!payload.playedIsBest) return false;
        if (payload.moveNumber > 8) return false;
        if (payload.isCapture || payload.givesCheck || payload.isPromotion || payload.isCastle) return false;
        if ((payload.topGap || 0) >= 45) return false;
        if (payload.afterMoverScore > payload.beforeMoverScore + 60) return false;
        return payload.cpl <= 12 && payload.moveAccuracy >= 96;
    }

    function isBestMoveQuality(payload) {
        if (!payload.playedIsBest || payload.engineFallback) return false;
        if (isRoutineBestMove(payload)) return false;
        if (payload.isOnlyMove) return true;
        if ((payload.topGap || 0) >= 65) return true;
        if (payload.afterMoverScore >= payload.beforeMoverScore + 90) return true;
        if (payload.moveAccuracy === 100 && ((payload.topGap || 0) >= 30) && (payload.isCapture || payload.givesCheck || payload.isPromotion || payload.isCastle)) {
            return true;
        }
        return false;
    }

    function isBrilliantMove(payload) {
        if (!payload.playedIsBest) return false;
        if (payload.engineFallback) return false;
        if (isRoutineBestMove(payload)) return false;
        if (payload.moveAccuracy < 99) return false;
        if (payload.cpl > 8) return false;
        if (payload.materialDeltaForMover > -180) return false;
        if (payload.afterMoverScore < payload.beforeMoverScore - 20) return false;
        if ((payload.topGap || 0) >= 90) return true;
        if (payload.isOnlyMove && payload.afterMoverScore >= payload.beforeMoverScore - 5) return true;
        return payload.afterMoverScore >= payload.beforeMoverScore + 55;
    }

    function classifyMoveQuality(payload) {
        if (payload.engineFallback) {
            if (payload.cpl <= 70 || payload.moveAccuracy >= 88) return 'good';
            if (payload.cpl <= 240 || payload.moveAccuracy >= 48) return 'mistake';
            return 'blunder';
        }
        if (isBrilliantMove(payload)) return 'brilliant';
        if (isBestMoveQuality(payload)) return 'best';
        if (payload.playedIsBest) return 'good';
        if (payload.cpl <= 90 || payload.moveAccuracy >= 80) return 'good';
        if (payload.cpl <= 260 || payload.moveAccuracy >= 42) return 'mistake';
        return 'blunder';
    }

    function calculateAccuracy(reviews) {
        if (!reviews.length) return 100;
        var weighted = 0;
        var total = 0;
        reviews.forEach(function(r, idx) {
            var phaseWeight = idx < 10 ? 0.9 : (idx > 55 ? 1.1 : 1);
            weighted += r.moveAccuracy * phaseWeight;
            total += phaseWeight;
        });
        return Math.max(1, Math.min(100, Math.round(weighted / total)));
    }

    function countMoveCategories(reviews) {
        var counts = { brilliant: 0, best: 0, good: 0, mistake: 0, blunder: 0 };
        reviews.forEach(function(r) {
            if (!r || !counts.hasOwnProperty(r.category)) return;
            counts[r.category] += 1;
        });
        return counts;
    }

    function renderQualitySummary() {
        var container = document.getElementById('analysisQualitySummary');
        if (!container) return;

        var white = countMoveCategories(analysisMoveReviews.filter(function(r) { return r && r.moveColor === 'w'; }));
        var black = countMoveCategories(analysisMoveReviews.filter(function(r) { return r && r.moveColor === 'b'; }));
        var order = ['brilliant', 'best', 'good', 'mistake', 'blunder'];

        container.innerHTML = order.map(function(cat) {
            return '<div class="quality-chip ' + cat + '">' +
                '<span class="count">' + (white[cat] || 0) + ' / ' + (black[cat] || 0) + '</span>' +
                '<span>' + (MOVE_CATEGORY_LABELS[cat] || cat) + '</span>' +
                '</div>';
        }).join('');
    }

    function updateAccuracyRing(id, value) {
        var el = document.getElementById(id);
        if (!el) return;
        var color = '#ef4444';
        if (value >= 90) color = '#4caf50';
        else if (value >= 75) color = '#f59e0b';
        el.innerText = value + "%";
        el.style.color = color;
        el.style.borderColor = color;
    }

    async function runDetailedGameReview(token) {
        if (!analysisHistory.length) {
            updateAccuracyRing('acc-white', 100);
            updateAccuracyRing('acc-black', 100);
            document.getElementById('report-blunder').innerText = "Hamle kaydi yok.";
            renderQualitySummary();
            return;
        }

        var progressEl = document.getElementById('report-blunder');
        if (progressEl) progressEl.innerText = "Derin analiz baslatiliyor...";

        analysisMoveReviews = new Array(analysisHistory.length);
        renderMoveList();
        highlightMoveRow();
        renderQualitySummary();

        var probeChess = new Chess();
        var previousEval = await evaluateFenDetailed(probeChess.fen(), SF_DEPTH_REVIEW, token);
        if (!previousEval || token !== analysisReviewToken) return;

        for (var i = 0; i < analysisHistory.length; i++) {
            if (token !== analysisReviewToken) return;

            var move = analysisHistory[i];
            var beforeFen = probeChess.fen();
            var legalMoveCount = probeChess.moves().length;
            var playedUci = moveToUci(move);

            probeChess.move(move.san);
            var playedFen = probeChess.fen();
            var givesCheck = probeChess.in_check();
            var playedEval = await evaluateFenDetailed(playedFen, SF_DEPTH_REVIEW, token);
            if (!playedEval || token !== analysisReviewToken) return;

            var bestMoveUci = previousEval.bestMove || null;
            var bestAfterEval = playedEval;
            var bestFen = playedFen;

            if (bestMoveUci && bestMoveUci !== '(none)' && bestMoveUci !== playedUci) {
                try {
                    var bestProbe = new Chess();
                    if (bestProbe.load(beforeFen)) {
                        bestProbe.move({
                            from: bestMoveUci.slice(0, 2),
                            to: bestMoveUci.slice(2, 4),
                            promotion: bestMoveUci.length > 4 ? bestMoveUci.slice(4, 5) : undefined
                        });
                        bestFen = bestProbe.fen();
                        var maybeBest = await evaluateFenDetailed(bestFen, SF_DEPTH_REVIEW, token);
                        if (maybeBest && token === analysisReviewToken) bestAfterEval = maybeBest;
                    }
                } catch (e) {
                    bestAfterEval = playedEval;
                    bestFen = playedFen;
                }
            }

            var beforeMoverScore = moverScoreFromWhite(previousEval.whiteScore, move.color);
            var playedMoverScore = moverScoreFromWhite(playedEval.whiteScore, move.color);
            var bestMoverScore = moverScoreFromWhite(bestAfterEval.whiteScore, move.color);
            var secondLine = getTopLineByRank(previousEval.topLines, 2);
            var secondMoverScore = secondLine && secondLine.whiteScore !== null && secondLine.whiteScore !== undefined
                ? moverScoreFromWhite(secondLine.whiteScore, move.color)
                : null;
            var topGap = secondMoverScore === null || secondMoverScore === undefined
                ? null
                : Math.max(0, Math.round(bestMoverScore - secondMoverScore));
            var cpl = Math.max(0, Math.round(bestMoverScore - playedMoverScore));

            var beforeMaterial = materialEvalWhiteCpFromFen(beforeFen);
            var playedMaterial = materialEvalWhiteCpFromFen(playedFen);
            var materialDeltaForMover = move.color === 'w'
                ? (playedMaterial - beforeMaterial)
                : (beforeMaterial - playedMaterial);
            var moveFlags = move.flags || '';
            var isCapture = !!move.captured || moveFlags.indexOf('c') !== -1 || moveFlags.indexOf('e') !== -1;
            var isPromotion = !!move.promotion || moveFlags.indexOf('p') !== -1;
            var isCastle = moveFlags.indexOf('k') !== -1 || moveFlags.indexOf('q') !== -1;
            var playedIsBest = !!bestMoveUci && bestMoveUci === playedUci;
            var engineFallback = !!(previousEval.fallback || playedEval.fallback || bestAfterEval.fallback);
            var moveNumber = Math.ceil((i + 1) / 2);

            var moveAccuracy = moveAccuracyFromEval(
                previousEval.whiteScore,
                bestAfterEval.whiteScore,
                playedEval.whiteScore,
                move.color,
                cpl
            );

            var category = classifyMoveQuality({
                playedIsBest: playedIsBest,
                cpl: cpl,
                moveAccuracy: moveAccuracy,
                materialDeltaForMover: materialDeltaForMover,
                beforeMoverScore: beforeMoverScore,
                afterMoverScore: playedMoverScore,
                topGap: topGap,
                isOnlyMove: topGap !== null && topGap >= 120,
                isCapture: isCapture,
                givesCheck: givesCheck,
                isPromotion: isPromotion,
                isCastle: isCastle,
                moveNumber: moveNumber,
                legalMoveCount: legalMoveCount,
                engineFallback: engineFallback
            });

            var bestMoveSan = formatEngineMove(bestMoveUci, beforeFen);
            analysisMoveReviews[i] = {
                index: i,
                moveSan: move.san,
                moveColor: move.color,
                cpl: cpl,
                category: category,
                moveAccuracy: moveAccuracy,
                bestMove: bestMoveUci,
                bestMoveSan: bestMoveSan,
                beforeFen: beforeFen,
                playedFen: playedFen,
                bestFen: bestFen,
                playedUci: playedUci,
                materialDeltaForMover: materialDeltaForMover,
                topGap: topGap,
                playedIsBest: playedIsBest,
                engineFallback: engineFallback
            };

            previousEval = playedEval;

            if (progressEl && (i % 4 === 0 || i === analysisHistory.length - 1)) {
                progressEl.innerText = "Analiz: " + (i + 1) + "/" + analysisHistory.length + " hamle";
            }
            if (i % 6 === 0 || i === analysisHistory.length - 1) {
                renderMoveList();
                highlightMoveRow();
                renderQualitySummary();
            }
        }

        if (token !== analysisReviewToken) return;

        var whiteReviews = analysisMoveReviews.filter(function(r) { return r && r.moveColor === 'w'; });
        var blackReviews = analysisMoveReviews.filter(function(r) { return r && r.moveColor === 'b'; });
        updateAccuracyRing('acc-white', calculateAccuracy(whiteReviews));
        updateAccuracyRing('acc-black', calculateAccuracy(blackReviews));
        renderQualitySummary();

        var worst = null;
        analysisMoveReviews.forEach(function(r) {
            if (!r) return;
            if (!worst || r.cpl > worst.cpl) worst = r;
        });

        if (progressEl) {
            if (!worst || worst.cpl < 120) {
                progressEl.innerText = "Belirgin kritik hata yok.";
            } else {
                var side = worst.moveColor === 'w' ? 'Beyaz' : 'Siyah';
                var moveNo = Math.ceil((worst.index + 1) / 2);
                var loss = (worst.cpl / 100).toFixed(1);
                var label = MOVE_CATEGORY_LABELS[worst.category] || 'Hata';
                progressEl.innerText = side + " tarafin " + moveNo + ". hamlesi (" + worst.moveSan + ") - " + label + ", ~" + loss + " piyon kaybi";
            }
        }

        renderMoveList();
        highlightMoveRow();
        refreshBestMoveButtonState();
    }

    window.openAnalysis = async (pgn, players, fallbackFen = null) => {
        switchView('view-2v2-analysis');
        bestPreviewToken++;
        analysisReviewToken++;
        var thisReviewToken = analysisReviewToken;
        analysisMoveReviews = [];
        liveEvalRequestId++;
        liveBestMoveUci = null;
        liveBestMoveFen = null;

        setStockfishStatus('loading');
        setBestMoveButton("Motor Yukleniyor...", null, null);

        if (!sfWorker || !isSfReady) {
            await initStockfish();
        }
        if (sfWorker && isSfReady) setStockfishStatus('active');
        else setStockfishStatus('fallback');

        const safePlayers = Array.isArray(players) ? players : [];
        const wTeam = safePlayers.filter(p => p.team === 'white').map(p => p.name).join(' & ');
        const bTeam = safePlayers.filter(p => p.team === 'black').map(p => p.name).join(' & ');
        document.getElementById('an-white-player').innerText = wTeam || "Beyaz Takim";
        document.getElementById('an-black-player').innerText = bTeam || "Siyah Takim";

        analysisChess.reset();
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
            } catch (e) {
                pgnLoaded = false;
            }
        }

        if (!pgnLoaded) analysisChess.reset();
        analysisHistory = (pgnLoaded && typeof pgn === 'string' && pgn.trim())
            ? analysisChess.history({ verbose: true })
            : [];
        currentAnalysisIndex = analysisHistory.length;

        let result = "Devam Ediyor";
        if (analysisChess.in_checkmate()) {
            result = analysisChess.turn() === 'w' ? "Siyah Kazandi" : "Beyaz Kazandi";
        } else if (analysisChess.in_draw()) {
            result = "Berabere";
        } else if (pgn && pgn.includes("1-0")) {
            result = "Beyaz Kazandi";
        } else if (pgn && pgn.includes("0-1")) {
            result = "Siyah Kazandi";
        } else if (pgn && pgn.includes("1/2")) {
            result = "Berabere";
        }

        document.getElementById('report-result').innerText = result;
        document.getElementById('report-blunder').innerText = analysisHistory.length > 0 ? "Derin analiz hazirlaniyor..." : "Hamle kaydi yok.";
        document.getElementById('acc-white').innerText = "--";
        document.getElementById('acc-black').innerText = "--";
        renderQualitySummary();

        renderAnalysisBoard();
        renderMoveList();
        highlightMoveRow();
        refreshBestMoveButtonState();
        runStockfish();
        switchAnalysisTab('review');

        if (analysisHistory.length > 0) {
            runDetailedGameReview(thisReviewToken);
        } else {
            updateAccuracyRing('acc-white', 100);
            updateAccuracyRing('acc-black', 100);
            renderQualitySummary();
            refreshBestMoveButtonState();
        }
    };

    window.openAnalysisFromEncodedGame = (encodedGame) => {
        try {
            const parsed = JSON.parse(decodeURIComponent(encodedGame));
            window.openAnalysis(parsed.pgn || '', parsed.players || [], parsed.fen || null);
        } catch (e) {
            console.error(e);
            showToast('Mac verisi okunamadi.', 'error');
        }
    };

    window.switchAnalysisTab = (tab) => {
        document.querySelectorAll('.analysis-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-btn-${tab}`).classList.add('active');
        document.getElementById('tab-content-review').style.display = tab === 'review' ? 'block' : 'none';
        document.getElementById('tab-content-moves').style.display = tab === 'moves' ? 'block' : 'none';
        if (tab === 'moves') {
            const ml = document.getElementById('analysisMoveList');
            ml.scrollTop = ml.scrollHeight;
        }
    };

    window.navAnalysis = (action) => {
        bestPreviewToken++;
        if (action === 'start') {
            currentAnalysisIndex = 0;
            analysisChess.reset();
        } else if (action === 'prev') {
            if (currentAnalysisIndex > 0) {
                currentAnalysisIndex--;
                analysisChess.undo();
            }
        } else if (action === 'next') {
            if (currentAnalysisIndex < analysisHistory.length) {
                const move = analysisHistory[currentAnalysisIndex];
                analysisChess.move(move.san);
                currentAnalysisIndex++;
            }
        } else if (action === 'end') {
            while (currentAnalysisIndex < analysisHistory.length) {
                const move = analysisHistory[currentAnalysisIndex];
                analysisChess.move(move.san);
                currentAnalysisIndex++;
            }
        }
        renderAnalysisBoard();
        highlightMoveRow();
        refreshBestMoveButtonState();
        runStockfish();
    };

    window.jumpToMove = (index) => {
        bestPreviewToken++;
        analysisChess.reset();
        for (let i = 0; i < index; i++) {
            analysisChess.move(analysisHistory[i].san);
        }
        currentAnalysisIndex = index;
        renderAnalysisBoard();
        highlightMoveRow();
        refreshBestMoveButtonState();
        runStockfish();
    };

    function renderAnalysisBoard() {
        const boardEl = document.getElementById('analysisBoard');
        boardEl.innerHTML = '';
        const boardArray = analysisChess.board();
        const isFlipped = boardEl.classList.contains('flipped');

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const row = isFlipped ? 7 - r : r;
                const col = isFlipped ? 7 - c : c;
                const sq = boardArray[row][col];

                const div = document.createElement('div');
                div.className = `square ${(r + c) % 2 === 0 ? 'white' : 'black'}`;

                const lastMove = analysisHistory[currentAnalysisIndex - 1];
                if (lastMove) {
                    const fromRow = 8 - parseInt(lastMove.from[1], 10);
                    const fromCol = lastMove.from.charCodeAt(0) - 97;
                    const toRow = 8 - parseInt(lastMove.to[1], 10);
                    const toCol = lastMove.to.charCodeAt(0) - 97;

                    if ((row === fromRow && col === fromCol) || (row === toRow && col === toCol)) {
                        div.style.background = "rgba(255, 255, 0, 0.4)";
                    }
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
                    const url = `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${sq.color}${sq.type}.png`;
                    piece.style.backgroundImage = `url('${url}')`;
                    div.appendChild(piece);
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
        cell.onclick = () => jumpToMove(jumpIndex);

        const sanText = document.createElement('span');
        sanText.innerText = moveObj.san;
        cell.appendChild(sanText);

        const review = analysisMoveReviews[reviewIndex];
        if (review) {
            const tag = document.createElement('span');
            tag.className = `move-tag ${review.category}`;
            tag.innerText = MOVE_CATEGORY_TAGS[review.category] || '';
            tag.title = `${MOVE_CATEGORY_LABELS[review.category] || 'Hamle'} | CPL: ${review.cpl} | Dogruluk: ${review.moveAccuracy || 0}%`;
            cell.appendChild(tag);
        }

        return cell;
    }

    function renderMoveList() {
        const list = document.getElementById('analysisMoveList');
        list.innerHTML = '';

        for (let i = 0; i < analysisHistory.length; i += 2) {
            const moveNum = (i / 2) + 1;
            const wMove = analysisHistory[i];
            const bMove = analysisHistory[i + 1];

            const row = document.createElement('div');
            row.className = 'move-list-row';
            row.id = `move-row-${i}`;

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
        document.querySelectorAll('.move-list-row').forEach(r => r.classList.remove('active'));
        if (currentAnalysisIndex > 0) {
            const rowIdx = Math.floor((currentAnalysisIndex - 1) / 2);
            const el = document.getElementById(`move-row-${rowIdx * 2}`);
            if (el) {
                el.classList.add('active');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    window.flipAnalysisBoard = () => {
        document.getElementById('analysisBoard').classList.toggle('flipped');
        renderAnalysisBoard();
    };

    // Removed mock updateEvalBar since updateEvalBarUI replaces it

    /* ======================================================== */

    /* ========================================================================================== */
    /* NEW: QUIZ MASTER MODULE                                                                    */
    /* ========================================================================================== */
    let quizBuilderQuestions = [];
    let currentQuizId = null;
    let currentQuizData = null;
    let unsubscribeQuiz = null;
    let quizTimerInterval = null;

    // --- BUILDER LOGIC ---
    window.startQuizBuilder = () => {
        const name = document.getElementById('newQuizName').value.trim();
        if(!name) return showToast("Lütfen bir quiz adı girin.", "error");
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

        document.getElementById('builderSummary').innerText = `${quizBuilderQuestions.length} Soru Eklendi`;
    }
    
    window.handleImageUpload = (input, idx) => {
        if (input.files && input.files[0]) {
            if(input.files[0].size > 800000) { // Limit roughly 800KB for Base64 safety
                 showToast("Resim boyutu çok büyük! (Max 800KB)", "error");
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
        if(quizBuilderQuestions.length === 0) return showToast("En az 1 soru eklemelisin!", "error");
        for(let i=0; i<quizBuilderQuestions.length; i++) {
            const q = quizBuilderQuestions[i];
            if(!q.q) return showToast(`${i+1}. sorunun metni eksik!`, "error");
            if(q.opts.some(o => !o)) return showToast(`${i+1}. sorunun seçenekleri eksik!`, "error");
        }

        const name = document.getElementById('newQuizName').value.trim();
        const hostPlays = document.getElementById('hostPlaysToggleBuilder').checked;
        const code = makeId(4); 
        
        const initialPlayers = [];
        // If Host wants to play, add them initially.
        if(hostPlays) {
             initialPlayers.push({ uid: currentUser.uid, name: currentUser.displayName, avatar: currentUser.photoURL, score: 0, answers: {} });
        }

        const quizData = {
            code: code,
            name: name,
            hostId: currentUser.uid,
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
            enterQuizGame(code);
        } catch(e) {
            console.error(e);
            showToast("Hata oluştu: " + e.message, "error");
        }
    };

    // --- LOBBY & JOIN ---
    window.joinQuizPrompt = async () => {
        const code = document.getElementById('quizJoinCode').value.trim().toUpperCase();
        if(!code) return showToast("Kod girin.", "error");
        enterQuizGame(code);
    };

    window.enterQuizGame = (code) => {
        if(unsubscribeQuiz) unsubscribeQuiz();
        currentQuizId = code;
        
        unsubscribeQuiz = onSnapshot(doc(db, "games_quiz", code), async (snap) => {
            if(!snap.exists()) { showToast("Quiz bulunamadı veya bitti.", "error"); leaveQuizLobby(); return; }
            const d = snap.data();
            currentQuizData = d;
            
            // JOIN LOGIC
            const myPlayer = d.players.find(p => p.uid === currentUser.uid);
            
            // If I am NOT Host and NOT in players, Join automatically if in Lobby
            if(d.hostId !== currentUser.uid && !myPlayer && d.status === 'lobby') {
                const newPlayer = { uid: currentUser.uid, name: currentUser.displayName, avatar: currentUser.photoURL, score: 0, answers: {} };
                const newPlayers = [...d.players, newPlayer];
                await updateDoc(doc(db, "games_quiz", code), { players: newPlayers });
                return; 
            }

            // AUTO-ADVANCE LOGIC (Only Host Checks This)
            if(d.hostId === currentUser.uid && d.state === 'question' && d.status === 'active') {
                 // Check if everyone answered
                 const qIdx = d.currentQuestion;
                 const answerCount = d.players.filter(p => p.answers && p.answers[qIdx]).length;
                 const activePlayerCount = d.players.length;
                 
                 if(activePlayerCount > 0 && answerCount === activePlayerCount) {
                     // Wait a brief moment to show last selection then reveal
                     setTimeout(() => quizForceNext(), 1000); 
                 }
            }

            if(d.status === 'lobby') {
                renderQuizLobby(d);
                switchView('view-quiz-lobby');
            } else if(d.status === 'active') {
                renderQuizGame(d);
                if(!document.getElementById('view-quiz-game').classList.contains('active')) {
                    switchView('view-quiz-game');
                }
            } else if(d.status === 'finished') {
                renderQuizResults(d);
                switchView('view-quiz-end');
            }
        });
    };

    function renderQuizLobby(d) {
        document.getElementById('quizLobbyTitle').innerText = d.name;
        document.getElementById('quizCodeDisplay').innerText = d.code;
        document.getElementById('quizPlayerCount').innerText = d.players.length;
        
        const isHost = (d.hostId === currentUser.uid);
        document.getElementById('quizHostControls').style.display = isHost ? 'block' : 'none';
        document.getElementById('quizWaitingMsg').style.display = isHost ? 'none' : 'block';
        
        if(isHost) {
            document.getElementById('hostParticipateToggle').checked = d.settings.hostParticipate;
        }

        const list = document.getElementById('quizPlayerList');
        list.innerHTML = "";
        d.players.forEach(p => {
            const el = document.createElement('div');
            el.className = `slot-item ${p.uid===currentUser.uid ? 'me' : ''}`;
            el.innerHTML = `<div style="font-size:2rem; margin-bottom:5px;"><i class="fas ${p.avatar || 'fa-user'}"></i></div>
                            <div style="font-weight:bold;">${p.name}</div>
                            <div style="font-size:0.8rem;">0 Puan</div>`;
            list.appendChild(el);
        });
    }

    window.toggleHostParticipation = async (shouldParticipate) => {
        if(!currentQuizData) return;
        let newPlayers = [...currentQuizData.players];
        
        if(shouldParticipate) {
             // Add host if not present
             if(!newPlayers.find(p => p.uid === currentUser.uid)) {
                 newPlayers.push({ uid: currentUser.uid, name: currentUser.displayName, avatar: currentUser.photoURL, score: 0, answers: {} });
             }
        } else {
             // Remove host
             newPlayers = newPlayers.filter(p => p.uid !== currentUser.uid);
        }
        
        await updateDoc(doc(db, "games_quiz", currentQuizId), { 
            players: newPlayers,
            "settings.hostParticipate": shouldParticipate
        });
    };

    window.copyQuizCode = () => { navigator.clipboard.writeText(currentQuizId); showToast("Kod kopyalandı!", "success"); };
    window.leaveQuizLobby = () => { if(unsubscribeQuiz) unsubscribeQuiz(); currentQuizId=null; switchView('view-quiz-menu'); };

    // --- GAME LOOP ---
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
        const isHost = d.hostId === currentUser.uid;
        
        document.getElementById('quizQIndex').innerText = `Soru ${qIdx + 1} / ${d.questions.length}`;
        const myP = d.players.find(p => p.uid === currentUser.uid);
        document.getElementById('quizScoreDisplay').innerText = (myP ? myP.score : 0) + " Puan";
        
        document.getElementById('quizQuestionText').innerText = qData.q;
        const imgEl = document.getElementById('quizQuestionImg');
        if(qData.img) { imgEl.src = qData.img; imgEl.style.display='block'; } else { imgEl.style.display='none'; }

        // HOST Controls
        const answersCount = d.players.filter(p => p.answers && p.answers[qIdx]).length;
        if(isHost) {
            document.getElementById('quizHostGameControls').style.display = 'block';
            document.getElementById('quizAnswerCount').innerText = `${answersCount} / ${d.players.length} Cevap`;
        } else {
            document.getElementById('quizHostGameControls').style.display = 'none';
        }

        // --- STATE MACHINE ---
        if(d.state === 'question') {
            document.getElementById('quizIntermission').style.display = 'none';
            document.getElementById('quizResultMsg').style.display = 'none';
            document.getElementById('autoNextTimer').style.display = 'none';
            
            // Reset Animation
            const el = document.getElementById('quizTimerFill');
            el.style.transition = 'none';
            el.style.width = '100%';
            
            // Delay slighty to allow CSS repaint for animation
            setTimeout(() => {
                el.style.transition = `width ${qData.time}s linear`;
                el.style.width = '0%';
            }, 50);

            const optsDiv = document.getElementById('quizOptionGrid');
            optsDiv.style.pointerEvents = 'auto'; 
            optsDiv.style.opacity = '1';
            
            [0,1,2,3].forEach(i => {
                const btn = optsDiv.children[i];
                btn.querySelector('span').innerText = qData.opts[i];
                btn.className = `quiz-btn opt-${i}`; 
                
                if(myP && myP.answers && myP.answers[qIdx]) {
                    if(myP.answers[qIdx].selected === i) btn.classList.add('selected');
                    else btn.classList.add('disabled');
                    optsDiv.style.pointerEvents = 'none'; 
                }
            });

            // HOST: Timeout Logic
            if(isHost && !localTimerAnim) { 
                 // Clear previous
                 if(autoNextTimeout) clearTimeout(autoNextTimeout);
                 
                 localTimerAnim = setTimeout(() => {
                     quizForceNext(); 
                 }, qData.time * 1000 + 1000); 
            }

        } else if(d.state === 'reveal') {
            // STOP Timer
            document.getElementById('quizTimerFill').style.transition = 'none';
            document.getElementById('quizTimerFill').style.width = '0%';
            if(localTimerAnim) { clearTimeout(localTimerAnim); localTimerAnim = null; }

            document.getElementById('quizIntermission').style.display = 'none';
            
            const optsDiv = document.getElementById('quizOptionGrid');
            optsDiv.style.pointerEvents = 'none';
            
            [0,1,2,3].forEach(i => {
                const btn = optsDiv.children[i];
                if(i === qData.correct) {
                    btn.classList.add('is-correct');
                } else {
                    btn.classList.add('is-wrong');
                }
            });

            // Show Msg
            const resDiv = document.getElementById('quizResultMsg');
            resDiv.style.display = 'block';
            if(myP && myP.answers[qIdx]) {
                const isCor = myP.answers[qIdx].selected === qData.correct;
                resDiv.innerText = isCor ? "DOĞRU! 🎉" : "YANLIŞ... 😔";
                resDiv.style.color = isCor ? "var(--success)" : "var(--danger)";
                if(isCor) window.playGameSound('capture');
            } else {
                resDiv.innerText = myP ? "CEVAP VERMEDİN ⌛" : "İZLEYİCİ MODU";
                resDiv.style.color = "#aaa";
            }
            
            // HOST: Auto move to Leaderboard after 3s
            if(isHost && !autoNextTimeout) {
                autoNextTimeout = setTimeout(() => {
                    quizGoLeaderboard();
                    autoNextTimeout = null;
                }, 3000); 
            }

        } else if(d.state === 'leaderboard') {
            document.getElementById('quizResultMsg').style.display = 'none';
            document.getElementById('quizIntermission').style.display = 'block';
            document.getElementById('quizOptionGrid').style.opacity = '0.3';
            document.getElementById('autoNextTimer').style.display = 'block';

            // Show Top Scores
            const sorted = [...d.players].sort((a,b) => b.score - a.score);
            const topList = document.getElementById('quizTopList');
            topList.innerHTML = sorted.map((p,i) => 
                `<div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #444; color:${p.uid===currentUser.uid ? 'var(--quiz-color)' : 'white'}; font-weight:${p.uid===currentUser.uid ? 'bold' : 'normal'}">
                    <span>${i===0?'👑 ':''}${i+1}. ${p.name}</span> <span style="font-weight:bold;">${p.score} P</span>
                 </div>`
            ).join('');

            // HOST: Auto Next Question after 4s
            if(isHost && !autoNextTimeout) {
                autoNextTimeout = setTimeout(() => {
                    quizNextQuestionReal();
                    autoNextTimeout = null;
                }, 4000);
            }
        }
    }

    window.submitQuizAnswer = async (optIdx) => {
        window.playGameSound('move');
        const qIdx = currentQuizData.currentQuestion;
        
        // Optimistic UI
        const optsDiv = document.getElementById('quizOptionGrid');
        optsDiv.children[optIdx].classList.add('selected');
        optsDiv.style.pointerEvents = 'none';
        for(let i=0; i<4; i++) if(i!==optIdx) optsDiv.children[i].classList.add('disabled');

        const myIdx = currentQuizData.players.findIndex(p => p.uid === currentUser.uid);
        if(myIdx === -1) return;
        
        const newPlayers = [...currentQuizData.players];
        if(!newPlayers[myIdx].answers) newPlayers[myIdx].answers = {};
        
        newPlayers[myIdx].answers[qIdx] = {
            selected: optIdx,
            time: Date.now() 
        };
        
        await updateDoc(doc(db, "games_quiz", currentQuizId), { players: newPlayers });
    };

    // HOST FUNCTIONS
    window.quizForceNext = async () => {
        if(!currentQuizData || currentQuizData.hostId !== currentUser.uid) return;
        if(localTimerAnim) { clearTimeout(localTimerAnim); localTimerAnim = null; }
        
        // SCORING LOGIC
        if(currentQuizData.state === 'question') {
            const qIdx = currentQuizData.currentQuestion;
            const correctOpt = currentQuizData.questions[qIdx].correct;
            const useBonus = currentQuizData.settings.speedBonus;
            
            let updatedPlayers = currentQuizData.players.map(p => {
                if(!p.answers || !p.answers[qIdx]) return p;
                const ans = p.answers[qIdx];
                if(ans.selected === correctOpt) {
                    p.score += 1; // BASE POINT: +1
                    p.isCorrect = true; 
                    p.ansTime = ans.time;
                } else {
                    p.isCorrect = false;
                }
                return p;
            });
            
            // SPEED BONUS (+1 extra => Total +2)
            if(useBonus) {
                const correctOnes = updatedPlayers.filter(p => p.isCorrect);
                if(correctOnes.length > 0) {
                    correctOnes.sort((a,b) => a.ansTime - b.ansTime);
                    // Fastest gets bonus
                    const fastestUID = correctOnes[0].uid;
                    updatedPlayers = updatedPlayers.map(p => {
                        if(p.uid === fastestUID) p.score += 1; // BONUS +1
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

    // --- RESULTS ---
    function renderQuizResults(d) {
        confetti({particleCount: 400, spread: 200, origin: { y: 0.6 }});
        window.playGameSound('gameEnd');
        
        const sorted = [...d.players].sort((a,b) => b.score - a.score);
        
        // Podium
        const p1 = sorted[0];
        const p2 = sorted[1];
        const p3 = sorted[2];
        
        if(p1) { document.getElementById('name-1').innerText = p1.name; document.getElementById('score-1').innerText = p1.score; document.getElementById('av-1').innerHTML = `<i class="fas ${p1.avatar || 'fa-user'}"></i>`; }
        if(p2) { document.getElementById('name-2').innerText = p2.name; document.getElementById('score-2').innerText = p2.score; document.getElementById('av-2').innerHTML = `<i class="fas ${p2.avatar || 'fa-user'}"></i>`; } else { document.querySelector('.podium-2').style.opacity=0; }
        if(p3) { document.getElementById('name-3').innerText = p3.name; document.getElementById('score-3').innerText = p3.score; document.getElementById('av-3').innerHTML = `<i class="fas ${p3.avatar || 'fa-user'}"></i>`; } else { document.querySelector('.podium-3').style.opacity=0; }
        
        // Full Table
        const tb = document.getElementById('quizFinalTableBody');
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

    /* ========================================================================================== */
    /* EXISTING LOGIC PRESERVATION (2v2 Chess, Tournament, Etc)                                 */
    /* ========================================================================================== */

    window.create2v2Game = async () => {
        window.playGameSound('nav');
        const code = makeId(5);
        const gameData = {
            code: code,
            hostId: currentUser.uid,
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
                {uid: currentUser.uid, name: currentUser.displayName, team: 'white', index: 0, isReady: false},
                {uid: null, name: "Boş", team: 'white', index: 1, isReady: false},
                {uid: null, name: "Boş", team: 'black', index: 0, isReady: false},
                {uid: null, name: "Boş", team: 'black', index: 1, isReady: false}
            ],
            participantIds: [currentUser.uid],
            winner: null,
            createdAt: serverTimestamp()
        };
        await setDoc(doc(db, "games_2v2", code), gameData);
        enter2v2Game(code);
    };

    window.join2v2Prompt = async () => {
        window.playGameSound('nav');
        const { value: code } = await Swal.fire({
            title: 'Oda Kodu',
            input: 'text',
            inputPlaceholder: 'Örn: X9Y2Z',
            background: 'rgba(30,30,35,0.95)', color: '#fff', confirmButtonColor: '#d4af37'
        });
        if(code) enter2v2Game(code.trim().toUpperCase());
    };

    window.enter2v2Game = (code) => {
        current2v2Id = code;
        lastPlayedMoveCount = -1;
        
        unsubscribe2v2 = onSnapshot(doc(db, "games_2v2", code), snap => {
            if(!snap.exists()) { showToast("Oyun bulunamadı.", "error"); leave2v2Lobby(); return; }
            const d = snap.data();
            current2v2Data = d;
            
            if(d.status === 'lobby') {
                render2v2Lobby(d);
                switchView('view-2v2-lobby');
            } else if(d.status === 'active' || d.status === 'finished') {
                update2v2Game(d);
                if(document.getElementById('view-2v2-game').classList.contains('active') === false) {
                    switchView('view-2v2-game');
                    if(lastPlayedMoveCount === -1) lastPlayedMoveCount = d.moveCount;
                    drawBoard(); 
                }
                if(d.status === 'finished') {
                    showGameOverModal(d);
                }
            }
        });
        initChat(code);
    };

    window.copy2v2Code = () => {
        navigator.clipboard.writeText(current2v2Id).then(()=>showToast("Oda kodu kopyalandı!", "success"));
    };

    window.leave2v2Lobby = async () => {
        if(unsubscribe2v2) unsubscribe2v2();
        if(unsubscribeChat) unsubscribeChat();
        
        if(current2v2Data && current2v2Data.status === 'lobby') {
             const newPlayers = current2v2Data.players.map(p => {
                 if(p.uid === currentUser.uid) return {uid: null, name: "Boş", team: p.team, index: p.index, isReady: false};
                 return p;
             });
             await updateDoc(doc(db, "games_2v2", current2v2Id), { 
                 players: newPlayers,
                 participantIds: arrayRemove(currentUser.uid)
             });
        }
        current2v2Id = null;
        switchView('view-dashboard');
    };

    function render2v2Lobby(d) {
        document.getElementById('lobby2v2Code').innerText = d.code;
        const isHost = (d.hostId === currentUser.uid);
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
                html = `<span><i class="fas fa-user"></i> ${p.name} ${p.uid===d.hostId ? '👑' : ''}</span> ${p.isReady ? '<i class="fas fa-check" style="color:var(--success)"></i>' : '<i class="fas fa-clock"></i>'}`;
                if(p.uid === currentUser.uid) html += ` <span style="font-size:0.7rem; color:var(--accent)">(Sen)</span>`;
            } else {
                html = `<span><i class="fas fa-plus"></i> Boş</span>`;
            }
            el.innerHTML = html;
        });

        const mySlot = d.players.find(p => p.uid === currentUser.uid);
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
        if(target.uid && target.uid !== currentUser.uid) return showToast("Bu koltuk dolu.", "error");
        
        let newPlayers = d.players.map(p => {
            if(p.uid === currentUser.uid) return { ...p, uid: null, name: "Boş", isReady: false };
            return p;
        });
        
        newPlayers = newPlayers.map(p => {
            if(p.team === team && p.index === index) return { ...p, uid: currentUser.uid, name: currentUser.displayName, isReady: false };
            return p;
        });

        await updateDoc(doc(db, "games_2v2", current2v2Id), { 
            players: newPlayers,
            participantIds: arrayUnion(currentUser.uid)
        });
    };

    window.toggleReady2v2 = async () => {
        window.playGameSound('nav');
        const d = current2v2Data;
        const newPlayers = d.players.map(p => {
            if(p.uid === currentUser.uid) return { ...p, isReady: !p.isReady };
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
        if(d.players.some(p => !p.uid || !p.isReady)) return showToast("Tüm oyuncular hazır olmalı!", "error");
        window.playGameSound('gameStart');
        const ms = d.timeControl * 60 * 1000;
        await updateDoc(doc(db, "games_2v2", current2v2Id), { 
            status: 'active',
            whiteTime: ms,
            blackTime: ms,
            lastMoveTime: Date.now(),
            moveCount: 0,
            winner: null,
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        });
    };

    // --- CHESS GAME LOGIC ---

    function update2v2Game(d) {
        if (d.pgn) {
            chess.load_pgn(d.pgn);
        } else {
            chess.load(d.fen);
        }
        
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
    }

    function updateTimerDisplay(w, b) {
        const fmt = (ms) => {
            const totSec = Math.floor(ms/1000);
            const m = Math.floor(totSec/60);
            const s = totSec % 60;
            return `${m}:${s<10?'0':''}${s}`;
        };
        document.getElementById('timerWhite').innerText = fmt(w);
        document.getElementById('timerBlack').innerText = fmt(b);
    }

    async function handleTimeOut(loserColor) {
        if(current2v2Data.hostId === currentUser.uid && current2v2Data.status === 'active') {
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
    }

    function drawBoard(activeIdx, turnColor) {
        const boardEl = document.getElementById('chessBoard');
        boardEl.innerHTML = '';
        
        if(activeIdx === undefined || turnColor === undefined) {
             const movesPerTurn = current2v2Data.movesPerTurn || 5;
             const movesMadeByColor = Math.floor(current2v2Data.moveCount / 2);
             activeIdx = Math.floor(movesMadeByColor / movesPerTurn) % 2;
             turnColor = chess.turn();
        }

        const isWhiteTeam = current2v2Data.players.find(p => p.uid === currentUser.uid)?.team === 'white';
        const rotate = !isWhiteTeam && current2v2Data.players.find(p => p.uid === currentUser.uid)?.team === 'black';

        const boardArray = chess.board(); 
        const myP = current2v2Data.players.find(p => p.uid === currentUser.uid);
        
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
         if(res.isConfirmed) leave2v2Lobby();
    }
    
    window.load2v2History = async () => {
        window.playGameSound('nav');
        document.getElementById('history2v2Modal').style.display = 'flex';
        const list = document.getElementById('history2v2List');
        list.innerHTML = '<p style="text-align:center;">Yükleniyor...</p>';
        try {
            const q = query(collection(db, "games_2v2"), where("participantIds", "array-contains", currentUser.uid));
            const snap = await getDocs(q);
            list.innerHTML = '';
            if(snap.empty) { list.innerHTML = '<p style="text-align:center; color:#888;">Henüz maç oynanmadı.</p>'; return; }
            let games = [];
            snap.forEach(d => { if(d.data().status === 'finished') games.push(d.data()); });
            games.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
            if(games.length === 0) { list.innerHTML = '<p style="text-align:center; color:#888;">Henüz tamamlanmış maç yok.</p>'; return; }
            games.forEach(game => {
                const myP = game.players.find(p => p.uid === currentUser.uid);
                if(!myP) return;
                const isWin = game.winner === myP.team;
                const isDraw = game.winner === 'draw';
                const resultColor = isWin ? 'var(--success)' : (isDraw ? 'var(--text-muted)' : 'var(--danger)');
                const resultText = isWin ? 'KAZANDIN' : (isDraw ? 'BERABERE' : 'KAYBETTİN');
                const partner = game.players.find(p => p.team === myP.team && p.uid !== currentUser.uid)?.name || "Bilinmiyor";
                const date = game.createdAt ? new Date(game.createdAt.seconds * 1000).toLocaleDateString() : "-";
                
                // Safe JSON serialization for onclick
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
        confetti({particleCount: 200, spread: 150, origin: { y: 0.6 }});
        window.playGameSound('gameEnd');
        let winnerText = "";
        let winners = [];
        if(d.winner === 'draw') { winnerText = "BERABERE"; winners = ["Dostluk Kazandı"]; } 
        else { winnerText = d.winner === 'white' ? "KAZANAN: BEYAZ TAKIM" : "KAZANAN: SİYAH TAKIM"; winners = d.players.filter(p => p.team === d.winner).map(p => p.name); }
        document.getElementById('winnerText').innerText = winnerText;
        document.getElementById('winnerText').style.color = d.winner === 'white' ? '#fff' : '#aaa';
        document.getElementById('winnerPlayers').innerText = winners.join(' & ');
        document.getElementById('gameOverModal').style.display = 'flex';
    }
    window.closeGameOver = () => { 
        document.getElementById('gameOverModal').style.display = 'none'; 
        // Auto open analysis after game
        if(current2v2Data && current2v2Data.pgn) {
            openAnalysis(current2v2Data.pgn, current2v2Data.players);
        } else {
            leave2v2Lobby(); 
        }
    };

    // --- TOURNAMENT LOGIC ---
    window.enterTournament = (id) => { 
        window.playGameSound('nav'); 
        currentTournamentId = id; 
        unsubscribeTournament = onSnapshot(doc(db,"tournaments",id), snap=>{ 
            if(!snap.exists()) { showToast("Turnuva bulunamadı.", "error"); leaveTournament(); return; } 
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
            
            if(d.status==='lobby') { renderLobby(d); switchView('view-lobby'); } 
            else { renderFixtures(d); renderStandings(d); switchView('view-tournament'); } 
        }); 
        initChat(id); 
    };

    function renderLobby(d) {
        document.getElementById('lobbyTitle').innerText = d.name;
        document.getElementById('shareCode').innerText = d.id;
        const isAdmin = (d.creatorId === currentUser.uid);
        document.getElementById('adminControls').style.display = isAdmin ? 'block' : 'none';
        document.getElementById('btnStartTournament').onclick = async () => {
            if (d.slots.some(s => s.status === 'taken')) { await updateDoc(doc(db, "tournaments", d.id), { status: 'active' }); } 
            else { showToast("En az 1 oyuncu olmalı!", "error"); }
        };

        const grid = document.getElementById('lobbySlots');
        grid.innerHTML = '';
        d.slots.forEach(slot => {
            const isMe = slot.ownerId === currentUser.uid;
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
            grid.appendChild(div);
        });
    }

    window.takeSlot = async (index) => { window.playGameSound('nav'); if (currentTournamentData.slots.some(s => s.ownerId === currentUser.uid)) return showToast("Zaten bir masadasın!", "error"); let slots = [...currentTournamentData.slots]; slots[index] = { ...slots[index], ownerId: currentUser.uid, name: currentUser.displayName, avatar: currentUser.photoURL || 'fa-chess-pawn', status: 'taken' }; await updateDoc(doc(db, "tournaments", currentTournamentId), { slots: slots, participantIds: arrayUnion(currentUser.uid) }); };
    window.leaveSlot = async (index) => { window.playGameSound('nav'); let slots = [...currentTournamentData.slots]; slots[index] = { ...slots[index], ownerId: null, name: `Masa ${index + 1}`, avatar: 'fa-chair', status: 'open' }; await updateDoc(doc(db, "tournaments", currentTournamentId), { slots: slots, participantIds: arrayRemove(currentUser.uid) }); };
    window.kickPlayer = async (index) => { let slots = [...currentTournamentData.slots]; const uidToRemove = slots[index].ownerId; slots[index] = { ...slots[index], ownerId: null, name: `Masa ${index + 1}`, avatar: 'fa-chair', status: 'open' }; await updateDoc(doc(db, "tournaments", currentTournamentId), { slots: slots, participantIds: arrayRemove(uidToRemove) }); };

    function renderFixtures(d){ document.getElementById('activeTournamentTitle').innerText = d.name; const isAdmin = (d.creatorId===currentUser.uid); const isFin = d.status==='finished'; document.getElementById('btnFinishTournament').style.display = (isAdmin && !isFin) ? 'block' : 'none'; document.getElementById('btnAddMatchManual').style.display = (isAdmin && !isFin) ? 'inline-block' : 'none'; document.getElementById('btnAutoFinish').style.display = (isAdmin && !isFin) ? 'inline-block' : 'none'; const c=document.getElementById('fixturesList'); c.innerHTML=''; const emptyMsg = document.getElementById('noMatchesText'); if(d.matches.length === 0) { emptyMsg.style.display = 'block'; return; } else { emptyMsg.style.display = 'none'; } const gr={}; d.matches.forEach(m=>{ if(!gr[m.r]) gr[m.r]=[]; gr[m.r].push(m); }); Object.keys(gr).sort((a,b)=>a-b).forEach(r=>{ const div=document.createElement('div'); div.innerHTML=`<div style="background:var(--glass-card); padding:8px; margin-bottom:5px; border-left:4px solid var(--primary); font-weight:bold; color:var(--text-main); font-size:0.9rem;">TUR ${r}</div>`; gr[r].forEach(m=>{ const deleteBtn = (isAdmin && !isFin) ? `<i class="fas fa-trash del-match-btn" onclick="deleteMatch(${m.id})"></i>` : ''; if(m.isBye) { const p1=d.slots[m.p1]; div.innerHTML += `<div class="match-card" style="opacity:0.6">${deleteBtn}<div class="match-player"><i class="fas ${p1.avatar}"></i> ${p1.name}</div><span style="font-weight:bold; color:var(--success); margin:0 10px;">BAY</span><div class="match-player right" style="color:var(--text-muted)">-</div></div>`; return; } const p1=d.slots[m.p1], p2=d.slots[m.p2]; const isP1=(p1.ownerId===currentUser.uid), isP2=(p2.ownerId===currentUser.uid); const isDisputed = m.isDisputed === true; const disputeLink = m.disputeLink || "#"; let canEdit = false; if(!isFin) { if(isAdmin) canEdit = true; else if((isP1 || isP2) && !isDisputed) canEdit = true; } let objectBtn = ''; if( (isP1 || isP2) && m.res !== null && !isDisputed && !isFin ) { objectBtn = `<div class="object-btn" title="Sonuca İtiraz Et" onclick="objectToMatch(${m.id})"><i class="fas fa-flag"></i></div>`; } let disputeBadge = ''; let cardClass = 'match-card'; if(isDisputed) { cardClass += ' disputed'; disputeBadge = `<a href="${disputeLink}" target="_blank" class="proof-link"><i class="fas fa-exclamation-triangle"></i> İTİRAZ (KANIT)</a>`; } let lnk=''; const watch = m.link ? `<a href="${m.link}" target="_blank" class="watch-btn"><i class="fas fa-eye"></i> İzle</a>` : ''; const inp = ((isP1||isP2||isAdmin) && !isFin) ? `<input class="link-input" placeholder="Maç Linki (Lichess/Chess.com)..." value="${m.link||''}" onchange="upLink(${m.id},this.value)">` : ''; if(watch||inp) lnk=`<div class="link-area">${watch}${inp}</div>`; div.innerHTML += `<div class="${cardClass}">${deleteBtn} ${objectBtn}<div class="match-player ${isP1?'me':''}"><i class="fas ${p1.avatar}"></i> ${p1.name}</div><select class="score-select" ${canEdit?'':'disabled'} onchange="upMatch(${m.id},this.value)"><option value="">vs</option><option value="1" ${m.res===1?'selected':''}>1 - 0</option><option value="0" ${m.res===0?'selected':''}>½ - ½</option><option value="2" ${m.res===2?'selected':''}>0 - 1</option></select><div class="match-player right ${isP2?'me':''}">${p2.name} <i class="fas ${p2.avatar}"></i></div>${disputeBadge} ${lnk}</div>`; }); c.appendChild(div); }); }
    window.upMatch = async(id, v) => { const isAdmin = currentTournamentData.creatorId === currentUser.uid; await updateDoc(doc(db,"tournaments",currentTournamentId), { matches: currentTournamentData.matches.map(m => { if(m.id === id) { const newVal = v === "" ? null : parseInt(v); if(isAdmin) return { ...m, res: newVal, isDisputed: false, disputeLink: null }; else return { ...m, res: newVal }; } return m; }) }); };
    window.upLink = async(id,v)=>{ await updateDoc(doc(db,"tournaments",currentTournamentId), { matches:currentTournamentData.matches.map(m=>m.id===id?{...m,link:v.trim()}:m) }); };
    function renderStandings(d){ const stats = d.slots.map((s,i)=>({ ...s, idx:i, p:0, w:0, d:0, l:0, pts:0, sb:0 })); d.matches.forEach(m=>{ if(m.res !== null){ if(m.isBye) { stats[m.p1].p++; stats[m.p1].w++; stats[m.p1].pts+=1; } else { stats[m.p1].p++; stats[m.p2].p++; if(m.res===1) { stats[m.p1].w++; stats[m.p1].pts+=1; stats[m.p2].l++; } else if(m.res===2) { stats[m.p2].w++; stats[m.p2].pts+=1; stats[m.p1].l++; } else { stats[m.p1].d++; stats[m.p1].pts+=0.5; stats[m.p2].d++; stats[m.p2].pts+=0.5; } } } }); d.matches.forEach(m=>{ if(m.res !== null && !m.isBye){ if(m.res===1) stats[m.p1].sb += stats[m.p2].sb + stats[m.p2].pts; else if(m.res===2) stats[m.p2].sb += stats[m.p1].pts; else { stats[m.p1].sb += 0.5 * stats[m.p2].pts; stats[m.p2].sb += 0.5 * stats[m.p1].pts; } } }); stats.sort((a,b)=> b.pts - a.pts || b.sb - a.sb || b.w - a.w); const b=document.getElementById('standingsBody'); b.innerHTML=''; const isFin = d.status==='finished'; stats.forEach((s,rank)=>{ let rowClass = ''; if(isFin){ if(rank===0) rowClass='rank-1'; } else if(s.ownerId===currentUser.uid) rowClass='me'; const tr=document.createElement('tr'); tr.className=rowClass; if(s.ownerId===currentUser.uid && !isFin) tr.style.background='rgba(0, 242, 255, 0.1)'; tr.innerHTML = `<td>${rank+1}</td><td class="player-name-cell" onclick='showStats(${JSON.stringify(s)})' style="text-align:left;"><i class="fas ${s.avatar}"></i> ${s.name} ${rank===0&&isFin?'👑':''}</td><td style="font-weight:bold; color:var(--primary); font-size:1.1rem;">${s.pts}</td><td style="color:var(--text-muted); font-size:0.9rem;">${s.sb.toFixed(2)}</td><td>${s.p}</td><td style="color:var(--success)">${s.w}</td><td>${s.d}</td><td style="color:var(--danger)">${s.l}</td>`; b.appendChild(tr); }); }
    window.downloadStandings = () => { const element = document.getElementById("standingsContainer"); const originalBg = element.style.background; element.style.background = "#1b1d24"; html2canvas(element, { scale: 2, backgroundColor: "#1b1d24" }).then(canvas => { const link = document.createElement("a"); link.download = `Grandmaster_Puan_${currentTournamentId}.png`; link.href = canvas.toDataURL(); link.click(); element.style.background = originalBg; showToast("Resim indirildi!", "success"); }); };
    
    window.openRules = () => { window.playGameSound('nav'); const isAdmin = currentTournamentData.creatorId === currentUser.uid; document.getElementById('rulesText').value = currentTournamentData.rules || ""; document.getElementById('rulesReadOnly').innerText = currentTournamentData.rules || "Henüz kural eklenmedi."; document.getElementById('rulesText').style.display = isAdmin ? 'block' : 'none'; document.getElementById('btnSaveRules').style.display = isAdmin ? 'block' : 'none'; document.getElementById('rulesReadOnly').style.display = isAdmin ? 'none' : 'block'; document.getElementById('rulesModal').style.display = 'flex'; };
    window.closeRules = () => document.getElementById('rulesModal').style.display = 'none';
    window.saveRules = async() => { const txt = document.getElementById('rulesText').value; await updateDoc(doc(db,"tournaments",currentTournamentId), { rules: txt }); closeRules(); showToast("Kurallar güncellendi", "success"); };
    window.showStats = (s) => { window.playGameSound('nav'); document.getElementById('modalAvatar').innerHTML = `<i class="fas ${s.avatar}"></i>`; document.getElementById('modalName').innerText = s.name; document.getElementById('statWins').innerText = s.w; document.getElementById('statDraws').innerText = s.d; document.getElementById('statLosses').innerText = s.l; document.getElementById('statPoints').innerText = s.pts; document.getElementById('statSB').innerText = s.sb.toFixed(2); const rate = s.p > 0 ? Math.round(((s.pts - (s.d * 0.5)) / s.p) * 100) : 0; document.getElementById('statRate').innerText = `%${rate}`; document.getElementById('statsModal').style.display = 'flex'; };
    window.closeStats = () => document.getElementById('statsModal').style.display='none';
    
    window.onclick = (e) => { if(e.target.classList.contains('modal-overlay')) { closeStats(); closeRules(); closeHistory2v2(); } }
    window.copyCode = () => { navigator.clipboard.writeText(document.getElementById('shareCode').innerText).then(()=>showToast("Kod kopyalandı!", "success")); };
    window.leaveTournamentConfirm = async () => { window.playGameSound('nav'); const res = await Swal.fire({ title: 'Çıkış?', text: 'Turnuva ekranından ayrılacaksın.', icon: 'question', showCancelButton: true, background: 'rgba(30,30,35,0.95)', color: '#fff', confirmButtonColor: '#555', cancelButtonColor: '#d33', confirmButtonText: 'Evet, Çık', cancelButtonText: 'Kal' }); if(res.isConfirmed) leaveTournament(); }
    window.leaveTournament = () => { if(unsubscribeTournament) unsubscribeTournament(); if(unsubscribeChat) unsubscribeChat(); currentTournamentId=null; hideChat(); switchView('view-dashboard'); };
    window.showTab = (t) => { window.playGameSound('nav'); document.getElementById('tab-fixtures').style.display=t==='fixtures'?'block':'none'; document.getElementById('tab-standings').style.display=t==='standings'?'block':'none'; };
    window.openSettings = () => { window.playGameSound('nav'); renderAvatars('settingsAvatarGrid','settingsSelectedAvatar'); document.getElementById('settingsNameInput').value=currentUser.displayName; switchView('view-settings'); };
    window.saveSettings = async() => { try { const newName = document.getElementById('settingsNameInput').value; const newAvatar = document.getElementById('settingsSelectedAvatar').value; await updateProfile(currentUser,{displayName:newName, photoURL:newAvatar}); const q = query(collection(db, "tournaments"), where("participantIds", "array-contains", currentUser.uid)); const querySnapshot = await getDocs(q); querySnapshot.forEach(async (docSnap) => { const tData = docSnap.data(); if(tData.status === 'finished') return; let updatedSlots = tData.slots.map(s => { if(s.ownerId === currentUser.uid) { return { ...s, name: newName, avatar: newAvatar }; } return s; }); if(JSON.stringify(updatedSlots) !== JSON.stringify(tData.slots)) { await updateDoc(doc(db, "tournaments", docSnap.id), { slots: updatedSlots }); } }); showToast("Profil ve aktif turnuvalar güncellendi!", "success"); switchView('view-dashboard'); } catch(e){ showToast(e.message, "error"); } };
    
    const cw=document.getElementById('chatWidget'), cb=document.getElementById('chatToggleBtn');
    cb.onclick=()=>{ cw.style.display='flex'; cb.style.display='none'; document.getElementById('chatBadge').style.display='none'; scrollChat(); };
    window.hideChat=()=>{ cw.style.display='none'; if(currentTournamentId || current2v2Id) cb.style.display='flex'; };
    function initChat(tid){ cb.style.display='flex'; const q=query(collection(db,`tournaments/${tid}/messages`),orderBy('createdAt','asc')); unsubscribeChat=onSnapshot(q,s=>{ const d=document.getElementById('chatMessages'); d.innerHTML=''; let n=false; s.forEach(x=>{ const m=x.data(); const me=m.uid===currentUser.uid; d.innerHTML+=`<div style="text-align:${me?'right':'left'}; margin-bottom:5px;"><strong style="color:${me?'var(--accent)':'var(--primary)'}; font-size:0.8rem;">${m.user}</strong><div style="background:${me?'var(--primary)':'rgba(255,255,255,0.1)'}; color:${me?'#000':'var(--text-main)'}; display:inline-block; padding:5px 10px; border-radius:10px; margin-top:2px; max-width:80%; word-break:break-word;">${m.text}</div></div>`; n=true; }); scrollChat(); if(n && cw.style.display==='none') document.getElementById('chatBadge').style.display='flex'; }); }
    document.getElementById('chatInputArea').onsubmit=async(e)=>{ e.preventDefault(); const i=document.getElementById('chatInput'); if(!i.value.trim()) return; const id = currentTournamentId || current2v2Id; await addDoc(collection(db,`tournaments/${id}/messages`),{text:i.value, user:currentUser.displayName, uid:currentUser.uid, createdAt:serverTimestamp()}); i.value=''; };
    function scrollChat(){ const d=document.getElementById('chatMessages'); d.scrollTop=d.scrollHeight; }

    // Admin Tools
    window.fixParticipants = async () => { if(!currentTournamentId || !currentTournamentData) return; const res = await Swal.fire({ title: 'Listeyi Birleştir', text: "Masadaki oyuncular ile veritabanındaki mevcut liste birleştirilecek. Silinme olmayacak.", icon: 'info', showCancelButton: true, background: 'rgba(30,30,35,0.95)', color: '#fff', confirmButtonColor: '#d4af37' }); if(!res.isConfirmed) return; let currentDBList = currentTournamentData.participantIds || []; let slotIds = currentTournamentData.slots.map(s=>s.ownerId).filter(id=>id); if(currentTournamentData.creatorId) slotIds.push(currentTournamentData.creatorId); let mergedList = [...new Set([...currentDBList, ...slotIds])]; try { await updateDoc(doc(db, "tournaments", currentTournamentId), { participantIds: mergedList }); showToast("Liste başarıyla birleştirildi!", "success"); } catch(e) { console.error(e); showToast("Hata: " + e.message, "error"); } };
    window.adminAddPlayer = async () => { if(!currentTournamentId || !currentTournamentData) return; const { value: uid } = await Swal.fire({ title: 'Kullanıcı UID', input: 'text', inputLabel: 'Firebase Authentication kısmındaki User UID', inputPlaceholder: 'Örn: J8d9S...', background: 'rgba(30,30,35,0.95)', color: '#fff', confirmButtonColor: '#d4af37' }); if(!uid) return; const { value: seatNum } = await Swal.fire({ title: 'Masa Numarası', input: 'number', inputLabel: 'Kaç numaralı masaya oturtulsun?', inputValue: 1, background: 'rgba(30,30,35,0.95)', color: '#fff', confirmButtonColor: '#d4af37' }); if(!seatNum) return; const index = parseInt(seatNum) - 1; const slots = [...currentTournamentData.slots]; if(!slots[index]) { showToast("Geçersiz masa numarası!", "error"); return; } const { value: name } = await Swal.fire({ title: 'Görünen İsim', input: 'text', inputValue: 'Oyuncu', background: 'rgba(30,30,35,0.95)', color: '#fff', confirmButtonColor: '#d4af37' }); slots[index] = { index: index, name: name || "Oyuncu", ownerId: uid.trim(), avatar: 'fa-user-secret', status: 'taken' }; try { await updateDoc(doc(db, "tournaments", currentTournamentId), { slots: slots, participantIds: arrayUnion(uid.trim()) }); showToast("Oyuncu başarıyla masaya oturtuldu!", "success"); } catch(e) { showToast("Hata: " + e.message, "error"); } };
    window.addMatchManual = async () => { if(!currentTournamentId || !currentTournamentData) return; let options = {}; currentTournamentData.slots.forEach(s => { options[s.index] = s.name; }); const htmlContent = `<div style="text-align:left;"><label>Tur Numarası:</label><input type="number" id="swal-round" class="swal2-input" value="1" min="1" style="width:100%; margin-bottom:10px;"><label>1. Oyuncu (Beyaz):</label><select id="swal-p1" class="swal2-input" style="width:100%; margin-bottom:10px; background:#333; color:#fff;">${Object.keys(options).map(k => `<option value="${k}">${options[k]}</option>`).join('')}</select><label>2. Oyuncu (Siyah):</label><select id="swal-p2" class="swal2-input" style="width:100%; background:#333; color:#fff;">${Object.keys(options).map(k => `<option value="${k}">${options[k]}</option>`).join('')}</select></div>`; const { value: formValues } = await Swal.fire({ title: 'Yeni Maç Ekle', html: htmlContent, showCancelButton: true, confirmButtonText: 'EKLE', background: 'rgba(30,30,35,0.95)', color: '#fff', confirmButtonColor: '#d4af37', preConfirm: () => { return [ document.getElementById('swal-round').value, document.getElementById('swal-p1').value, document.getElementById('swal-p2').value ] } }); if(formValues) { const r = parseInt(formValues[0]); const p1 = parseInt(formValues[1]); const p2 = parseInt(formValues[2]); if(p1 === p2) { showToast("Aynı oyuncuyu kendisine karşı seçemezsin!", "error"); return; } const newMatch = { id: Date.now(), r: r, p1: p1, p2: p2, res: null, link: '', isBye: false }; await updateDoc(doc(db,"tournaments",currentTournamentId), { matches: arrayUnion(newMatch) }); showToast("Maç eklendi!", "success"); } };
    window.autoFinishFixture = async () => { if(!currentTournamentId || !currentTournamentData) return; const res = await Swal.fire({ title: 'Akıllı Tamamlama', text: "Sistem, çift devreli lig usulüne göre EKSİK kalan maçları hesaplayıp, en erken turlardaki boşlukları doldurarak yerleştirecek.", icon: 'question', showCancelButton: true, confirmButtonText: 'HESAPLA VE EKLE', confirmButtonColor: '#9b59b6', background: 'rgba(30,30,35,0.95)', color: '#fff' }); if(!res.isConfirmed) return; const slots = currentTournamentData.slots; const existingMatches = currentTournamentData.matches; const numPlayers = slots.length; let maxId = existingMatches.reduce((max, match) => Math.max(max, match.id), 0); let neededMatches = []; for(let i=0; i<numPlayers; i++) { for(let j=0; j<numPlayers; j++) { if(i !== j) { const exists = existingMatches.some(m => m.p1 === i && m.p2 === j); if(!exists) { neededMatches.push({p1: i, p2: j}); } } } } if(neededMatches.length === 0) { showToast("Fikstür zaten eksiksiz.", "info"); return; } let roundOccupancy = {}; existingMatches.forEach(m => { if(!roundOccupancy[m.r]) roundOccupancy[m.r] = new Set(); if(!m.isBye) { roundOccupancy[m.r].add(m.p1); roundOccupancy[m.r].add(m.p2); } }); let newMatches = []; neededMatches.sort(() => Math.random() - 0.5); neededMatches.forEach(match => { let assignedRound = 1; while(true) { if(!roundOccupancy[assignedRound]) roundOccupancy[assignedRound] = new Set(); let p1Busy = roundOccupancy[assignedRound].has(match.p1); let p2Busy = roundOccupancy[assignedRound].has(match.p2); if(!p1Busy && !p2Busy) { roundOccupancy[assignedRound].add(match.p1); roundOccupancy[assignedRound].add(match.p2); newMatches.push({ id: ++maxId, r: assignedRound, p1: match.p1, p2: match.p2, res: null, link: '', isBye: false }); break; } else { assignedRound++; } } }); try { const finalMatches = [...existingMatches, ...newMatches]; finalMatches.sort((a,b) => a.r - b.r || a.id - b.id); await updateDoc(doc(db, "tournaments", currentTournamentId), { matches: finalMatches }); showToast(`${newMatches.length} adet maç başarıyla planlandı!`, "success"); } catch(e) { console.error(e); showToast("Hata: " + e.message, "error"); } };
    window.deleteMatch = async (matchId) => { if(!currentTournamentId || !currentTournamentData) return; const res = await Swal.fire({ title: 'Maçı Sil?', text: "Bu maç fikstürden kaldırılacak.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', background: 'rgba(30,30,35,0.95)', color: '#fff' }); if(!res.isConfirmed) return; const newMatches = currentTournamentData.matches.filter(m => m.id !== matchId); await updateDoc(doc(db,"tournaments",currentTournamentId), { matches: newMatches }); showToast("Maç silindi.", "info"); };
    window.objectToMatch = async (matchId) => { const { value: url } = await Swal.fire({ title: 'Sonuca İtiraz Et', text: "Lütfen kanıt olarak bir link (Lichess/Chess.com/Resim) girin. Bu zorunludur!", input: 'url', inputPlaceholder: 'https://...', showCancelButton: true, confirmButtonText: 'GÖNDER', confirmButtonColor: '#d33', background: 'rgba(30,30,35,0.95)', color: '#fff' }); if (url) { await updateDoc(doc(db,"tournaments",currentTournamentId), { matches: currentTournamentData.matches.map(m => { if(m.id === matchId) { return { ...m, isDisputed: true, disputeLink: url }; } return m; }) }); showToast("İtiraz gönderildi! Yönetici inceleyecek.", "warning"); } };
})().catch(function(err) {
    console.error('App boot failed:', err);
    window.__appBootError = err;
    if (typeof alert === 'function') {
        alert('Uygulama yüklenemedi. Dosyalari eksiksiz yüklediğinden ve siteyi tarayıcıda yenilediğinden emin ol.');
    }
});
