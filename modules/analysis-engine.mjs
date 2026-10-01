import {parseInfo, whiteScore, REVIEW_VERSION} from './analysis-core.mjs?v=20261001-speed3a';
import {calibratedProfile,requestIdentity} from './engine-profile.mjs?v=20261001-speed3a';
import {NativeEngineWorker,selectedBackend,backendPreference} from './native-engine-worker.mjs?v=20261001-speed3a';

// One owner of the UCI stream. A task is not released until bestmove or restart.
export class AnalysisEngine {
    constructor(workerFactory,profile) {
        const nav=globalThis.navigator||{};
        this.environment={cores:nav.hardwareConcurrency,memory:nav.deviceMemory,mobile:globalThis.matchMedia?.('(max-width:760px)').matches,isolated:globalThis.crossOriginIsolated};
        this.profile=profile||calibratedProfile(this.environment,selectedBackend());
        this.profile.backend ||= selectedBackend();
        this.factory = workerFactory || (() => this.profile.backend==='native'?new NativeEngineWorker():new Worker(this.profile.threads>1?'vendor/stockfish-18-lite.js':'vendor/stockfish-18-lite-single.js'));
        this.customFactory=!!workerFactory;this.shared=new Map();this.stats={requests:0,shared:0,ms:0,nodes:0,interrupted:0,commands:0};
        this.options=new Map();this.nativeRetryAt=0;
        this.queue = [];
        this.active = null;
        this.ready = false;
        this.worker = null;
        this.generation = 0;
        this.searchContext=null;
    }
    async init() {
        if(this.autoReconnect!==false&&!this.customFactory&&(backendPreference()==='native'||backendPreference()==='auto'&&!this.environment.mobile)&&this.profile.backend==='browser'&&!this.active&&!this.queue.length&&Date.now()>=this.nativeRetryAt){
            this.nativeRetryAt=Date.now()+45000;
            try{const r=await fetch('http://127.0.0.1:8766/health',{headers:{'X-GM-Engine':'1'},signal:AbortSignal.timeout(900)});if(r.ok){this.worker?.terminate();this.worker=null;this.ready=false;this.options.clear();this.searchContext=null;this.profile={...calibratedProfile(this.environment,'native'),backend:'native'};}}catch{}
        }
        if (this.ready) return;
        if (this.initializing) return this.initializing;
        this.initializing = new Promise((resolve, reject) => {
            this.resolveInit = resolve; this.rejectInit = reject;
            try {
                const worker = this.worker = this.factory();
                worker.onmessage = e => {
                    if (this.worker !== worker) return;
                    String(e.data).split(/\r?\n/).forEach(s => this.line(s.trim()));
                };
                worker.onerror = () => this.fail('Satranç motoru çalıştırılamadı.');
                this.initTimer = setTimeout(() => this.fail('Motor yükleme süresi aşıldı.'), 20000);
                worker.postMessage('uci');
            } catch (e) { this.fail(e.message); }
        });
        try { await this.initializing; }
        catch(error){
            if(!this.customFactory&&this.profile.backend==='native'){
                this.profile.backend='browser';this.profile.threads=globalThis.crossOriginIsolated?this.profile.threads:1;
                this.nativeRetryAt=Date.now()+45000;
                globalThis.window?.showToast?.('Yerel motor bağlantısı kurulamadı. Tarayıcı motoruyla devam ediliyor.','info');
                this.initializing=null;return this.init();
            }
            if(!this.customFactory&&this.profile.threads>1){this.profile.threads=1;this.initializing=null;return this.init();}
            throw error;
        } finally { this.initializing = null; }
    }
    fail(message) {
        clearTimeout(this.initTimer);
        this.worker?.terminate(); this.worker = null; this.ready = false;
        this.searchContext=null;
        this.options.clear();
        const tasks = [this.active, ...this.queue].filter(Boolean);
        this.active = null; this.queue = [];
        for (const task of tasks) {
            clearTimeout(task.timer); clearTimeout(task.watchdog);
            task.resolve({fallback:true,error:message,topLines:[],mode:task.mode,requestId:task.requestId});
        }
        this.rejectInit?.(new Error(message));
        this.resolveInit = this.rejectInit = null;
    }
    line(text) {
        if (!text) return;
        if (text === 'uciok') {
            this.worker.postMessage('setoption name Threads value '+this.profile.threads);
            this.worker.postMessage('setoption name Hash value '+this.profile.hash);
            this.worker.postMessage('setoption name UCI_ShowWDL value true');
            this.worker.postMessage('isready');
            return;
        }
        if (text === 'readyok') {
            clearTimeout(this.initTimer); this.ready = true;
            this.resolveInit?.(); this.resolveInit = this.rejectInit = null;
            this.next(); return;
        }
        const task = this.active;
        if (!task) return;
        if(/^info\b/.test(text)){const nodes=Number(text.match(/\bnodes (\d+)/)?.[1]||0);if(nodes>task.lastNodes){task.lastNodes=nodes;task.lastProgress=Date.now();}}
        const info = parseInfo(text);
        if (info) {
            if(info.depth>task.lastDepth){task.lastDepth=info.depth;task.lastProgress=Date.now();}
            task.frames[info.depth] ||= new Map();
            task.frames[info.depth].set(info.rank, info);
            // Keep complete iterations, never mix ranks from different depths.
            const frame = task.frames[info.depth];
            if (Array.from({length:task.expected},(_,i)=>i+1).every(rank=>frame.has(rank)) && info.depth >= task.reached) {
                task.reached = info.depth;
                task.lines = [...frame.values()].sort((a,b)=>a.rank-b.rank).slice(0,task.expected);
                if([16,20,22,24,26,28].includes(info.depth))task.iterations.set(info.depth,task.lines.map(l=>({...l})));
                if (!task.cancelled) task.onProgress?.(task.lines[0]);
                for (const d of Object.keys(task.frames)) if (Number(d) < info.depth) delete task.frames[d];
            }
        }
        if (!text.startsWith('bestmove ')) return;
        clearTimeout(task.timer); clearTimeout(task.watchdog);
        this.active = null;
        const topLines = task.lines.map(line => ({...line, whiteScore:whiteScore(line,task.fen)}));
        this.stats.ms+=Date.now()-task.started;this.stats.nodes+=Math.max(0,...topLines.map(l=>l.nodes||0));
        const first = topLines[0];
        const reported = text.split(/\s+/)[1];
        task.resolve({ ...first, cp:first?.cp ?? null, mate:first?.mate ?? null,
            bestMove: task.mode === 'bot' ? reported : first?.uci || reported,
            topLines, depth:task.reached, requestedDepth:task.depth,
            nodes:Math.max(0,...topLines.map(line=>line.nodes || 0)),
            time:Math.max(0,...topLines.map(line=>line.time || 0)),
            complete:!task.cancelled && task.reached >= task.depth,
            expectedLines:task.expected,
            cancelled:!!task.cancelled, fallback:!first || !!task.cancelled,
            source:this.profile.backend==='native'?'Stockfish 18 Full · yerel':'Stockfish 18 Lite',threads:this.profile.threads,hash:this.profile.hash,version:REVIEW_VERSION,
            iterations:[...task.iterations].map(([depth,lines])=>({depth,topLines:lines.map(l=>({...l,whiteScore:whiteScore(l,task.fen)}))})),
            fen:task.fen, mode:task.mode, requestId:task.requestId });
        this.next();
    }
    evaluate(fen, options = {}) {
        if (!this.ready) return Promise.resolve({fallback:true,topLines:[],error:'Motor hazır değil.'});
        const identity=requestIdentity(fen,options);
        if(this.shared.has(identity)){this.stats.shared++;return this.shared.get(identity);}
        this.stats.requests++;
        const promise=new Promise(resolve => {
            const task = {fen, depth:18, mode:'live', ...options, resolve,
                frames:{}, iterations:new Map(), lines:[], reached:0};
            task.priority = options.priority === 'high' ? 1 : Number(options.priority) ||
                (task.mode === 'bot' || task.mode === 'live' || task.mode === 'variation' ? 1 : 2);
            if (['live','variation'].includes(task.mode)) this.cancel(t=>t.mode === task.mode);
            if (task.mode === 'bot' && this.active?.priority > 1) this.stop();
            this.queue.push(task);
            this.queue.sort((a,b)=>a.priority-b.priority);
            this.next();
        });
        this.shared.set(identity,promise);promise.finally(()=>{if(this.shared.get(identity)===promise)this.shared.delete(identity);});
        return promise;
    }
    stop() {
        const task = this.active;
        if (!task || task.watchdog) return;
        clearTimeout(task.timer);if(task.reached<task.depth&&!task.cancelled)this.stats.interrupted++;
        this.worker.postMessage('stop');
        task.watchdog = setTimeout(()=>this.fail('Motor yanıt vermedi; yeniden deneyin.'), 3000);
    }
    cancel(predicate) {
        this.queue = this.queue.filter(task => {
            if (!predicate(task)) return true;
            task.resolve({fallback:true,cancelled:true,topLines:[]}); return false;
        });
        if (this.active && predicate(this.active)) { this.active.cancelled = true; this.stop(); }
    }
    next() {
        if (!this.ready || this.active || !this.queue.length) return;
        const t = this.active = this.queue.shift();
        t.started=Date.now();t.lastProgress=t.started;t.lastNodes=0;t.lastDepth=0;
        const send = message => {this.stats.commands++;this.worker.postMessage(message);};
        const option=(name,value)=>{if(this.options.get(name)!==value){send('setoption name '+name+' value '+value);this.options.set(name,value);}};
        const mpv = t.mode === 'bot' ? t.multiPv || 1 : t.multiPv || 3;
        t.expected = Math.min(mpv, t.searchmoves?.length || t.legalCount || 1);
        option('MultiPV',mpv);
        option('UCI_LimitStrength',t.elo != null ? 'true' : 'false');
        if (t.elo != null) option('UCI_Elo',t.elo);
        option('Skill Level',t.skillLevel ?? 20);
        // Keep transpositions across the same game's increasingly deep searches.
        // Clear once on game/strength changes, rather than on every candidate.
        const context=(t.elo ?? 'full')+'|'+(t.skillLevel ?? 20)+'|'+(t.mode==='review'?(t.reviewSession ?? 'unscoped'):'interactive');
        if(context!==this.searchContext){send('setoption name Clear Hash');this.searchContext=context;}
        send(t.position || 'position fen ' + t.fen);
        send('go depth ' + t.depth + (t.searchmoves?.length ? ' searchmoves ' + t.searchmoves.join(' ') : ''));
        if(t.mode==='review'&&t.adaptive!==false){const check=()=>{if(this.active!==t||t.watchdog)return;const now=Date.now();if(now-t.lastProgress>Math.max(30000,t.stallMs||0)||now-t.started>(t.maxSearchMs||300000))return this.stop();t.timer=setTimeout(check,1000);};t.timer=setTimeout(check,1000);}
        else t.timer = setTimeout(()=>this.stop(), t.timeoutMs || 3500);
    }
}
