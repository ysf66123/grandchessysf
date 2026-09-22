import {parseInfo, whiteScore, REVIEW_VERSION} from './analysis-core.mjs?v=20260923d';

// One owner of the UCI stream. A task is not released until bestmove or restart.
export class AnalysisEngine {
    constructor(workerFactory = () => new Worker('vendor/stockfish-18-lite-single.js')) {
        this.factory = workerFactory;
        this.queue = [];
        this.active = null;
        this.ready = false;
        this.worker = null;
        this.generation = 0;
    }
    async init() {
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
        try { await this.initializing; } finally { this.initializing = null; }
    }
    fail(message) {
        clearTimeout(this.initTimer);
        this.worker?.terminate(); this.worker = null; this.ready = false;
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
            this.worker.postMessage('setoption name Hash value 64');
            this.worker.postMessage('setoption name Threads value 1');
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
        const info = parseInfo(text);
        if (info) {
            task.frames[info.depth] ||= new Map();
            task.frames[info.depth].set(info.rank, info);
            // Keep complete iterations, never mix ranks from different depths.
            const frame = task.frames[info.depth];
            if (Array.from({length:task.expected},(_,i)=>i+1).every(rank=>frame.has(rank)) && info.depth >= task.reached) {
                task.reached = info.depth;
                task.lines = [...frame.values()].sort((a,b)=>a.rank-b.rank).slice(0,task.expected);
                if (!task.cancelled) task.onProgress?.(task.lines[0]);
                for (const d of Object.keys(task.frames)) if (Number(d) < info.depth) delete task.frames[d];
            }
        }
        if (!text.startsWith('bestmove ')) return;
        clearTimeout(task.timer); clearTimeout(task.watchdog);
        this.active = null;
        const topLines = task.lines.map(line => ({...line, whiteScore:whiteScore(line,task.fen)}));
        const first = topLines[0];
        const reported = text.split(/\s+/)[1];
        task.resolve({ ...first, cp:first?.cp ?? null, mate:first?.mate ?? null,
            bestMove: task.mode === 'bot' ? reported : first?.uci || reported,
            topLines, depth:task.reached, requestedDepth:task.depth,
            nodes:Math.max(0,...topLines.map(line=>line.nodes || 0)),
            time:Math.max(0,...topLines.map(line=>line.time || 0)),
            complete:!task.cancelled && task.reached >= task.depth,
            cancelled:!!task.cancelled, fallback:!first || !!task.cancelled,
            source:'Stockfish 18 Lite', version:REVIEW_VERSION,
            fen:task.fen, mode:task.mode, requestId:task.requestId });
        this.next();
    }
    evaluate(fen, options = {}) {
        if (!this.ready) return Promise.resolve({fallback:true,topLines:[],error:'Motor hazır değil.'});
        return new Promise(resolve => {
            const task = {fen, depth:18, mode:'live', ...options, resolve,
                frames:{}, lines:[], reached:0};
            task.priority = options.priority === 'high' ? 1 : Number(options.priority) ||
                (task.mode === 'bot' || task.mode === 'live' || task.mode === 'variation' ? 1 : 2);
            if (['live','variation'].includes(task.mode)) this.cancel(t=>t.mode === task.mode);
            if (task.mode === 'bot' && this.active?.priority > 1) this.stop();
            this.queue.push(task);
            this.queue.sort((a,b)=>a.priority-b.priority);
            this.next();
        });
    }
    stop() {
        const task = this.active;
        if (!task || task.watchdog) return;
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
        const send = message => this.worker.postMessage(message);
        const mpv = t.mode === 'bot' ? 1 : t.multiPv || 3;
        t.expected = Math.min(mpv, t.searchmoves?.length || t.legalCount || 1);
        send('setoption name MultiPV value ' + mpv);
        send('setoption name UCI_LimitStrength value ' + (t.elo != null ? 'true' : 'false'));
        if (t.elo != null) send('setoption name UCI_Elo value ' + t.elo);
        send('setoption name Skill Level value ' + (t.skillLevel ?? 20));
        if (t.mode === 'review') send('setoption name Clear Hash');
        send(t.position || 'position fen ' + t.fen);
        send('go depth ' + t.depth + (t.searchmoves?.length ? ' searchmoves ' + t.searchmoves.join(' ') : ''));
        t.timer = setTimeout(()=>this.stop(), t.timeoutMs || (t.mode === 'review' ? 2200 : 3500));
    }
}
