import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));

loadLocalEnv();

const PORT = Number(process.env.SOLO_PROXY_PORT || process.env.PORT || 8091);
const MAX_AUDIO_BYTES = Number(process.env.SOLO_STT_MAX_BYTES || 6 * 1024 * 1024);
const OPENAI_TRANSCRIBE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') + '/audio/transcriptions';
const STT_MODEL = process.env.SOLO_STT_MODEL || 'gpt-4o-mini-transcribe';

function loadLocalEnv() {
    ['.env.local', '.env'].forEach((name) => {
        const file = join(ROOT, name);
        if (!existsSync(file)) return;
        const lines = readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const eq = trimmed.indexOf('=');
            if (eq === -1) return;
            const key = trimmed.slice(0, eq).trim();
            let value = trimmed.slice(eq + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (key && process.env[key] === undefined) process.env[key] = value;
        });
    });
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm'
};

function sendJson(res, status, body) {
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type,x-solo-stt-language'
    });
    res.end(JSON.stringify(body));
}

function readRequestBody(req, limit) {
    return new Promise((resolveBody, rejectBody) => {
        const chunks = [];
        let total = 0;
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > limit) {
                rejectBody(Object.assign(new Error('Audio payload too large.'), { status: 413 }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolveBody(Buffer.concat(chunks)));
        req.on('error', rejectBody);
    });
}

function getAudioFilename(contentType) {
    if (contentType.includes('mp4')) return 'solo-command.mp4';
    if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'solo-command.mp3';
    if (contentType.includes('wav')) return 'solo-command.wav';
    if (contentType.includes('ogg')) return 'solo-command.ogg';
    return 'solo-command.webm';
}

async function handleTranscription(req, res) {
    if (!process.env.OPENAI_API_KEY) {
        sendJson(res, 503, {
            ok: false,
            error: 'OPENAI_API_KEY missing. Set it before starting solo-stt-proxy.mjs.'
        });
        return;
    }

    try {
        const contentType = String(req.headers['content-type'] || 'audio/webm');
        const audio = await readRequestBody(req, MAX_AUDIO_BYTES);
        if (!audio.length) {
            sendJson(res, 400, { ok: false, error: 'Empty audio payload.' });
            return;
        }

        const form = new FormData();
        form.append('model', STT_MODEL);
        form.append('language', String(req.headers['x-solo-stt-language'] || 'tr'));
        form.append('response_format', 'json');
        form.append(
            'prompt',
            'Turkish chess move command for chessboard input. Return only the spoken transcript. Examples: e iki e dort, at f uc, fil c dort, vezir h bes, kisa rok, uzun rok, e2 e4.'
        );
        form.append('file', new Blob([audio], { type: contentType }), getAudioFilename(contentType));

        const upstream = await fetch(OPENAI_TRANSCRIBE_URL, {
            method: 'POST',
            headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            body: form
        });
        const text = await upstream.text();
        let payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }

        if (!upstream.ok) {
            sendJson(res, upstream.status, {
                ok: false,
                error: payload.error && payload.error.message ? payload.error.message : 'Transcription request failed.',
                details: payload
            });
            return;
        }

        sendJson(res, 200, {
            ok: true,
            text: String(payload.text || '').trim(),
            model: STT_MODEL
        });
    } catch (error) {
        sendJson(res, error.status || 500, {
            ok: false,
            error: error && error.message ? error.message : 'Transcription failed.'
        });
    }
}

async function serveStatic(req, res) {
    const rawUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(rawUrl.pathname === '/' ? '/index.html' : rawUrl.pathname);
    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const absolute = resolve(join(ROOT, safePath));
    if (!absolute.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    try {
        const body = await readFile(absolute);
        const type = MIME_TYPES[extname(absolute).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, {
            'content-type': type,
            'cache-control': type.startsWith('text/html') ? 'no-store' : 'no-cache'
        });
        res.end(body);
    } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
    }
}

const server = createServer(async (req, res) => {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
    }

    if (url.pathname === '/api/solo-stt/health') {
        sendJson(res, 200, {
            ok: true,
            configured: !!process.env.OPENAI_API_KEY,
            model: STT_MODEL
        });
        return;
    }

    if (url.pathname === '/api/solo-stt') {
        if (method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
            return;
        }
        await handleTranscription(req, res);
        return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
        return;
    }

    await serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Solo STT proxy listening on http://127.0.0.1:${PORT}/index.html`);
    console.log(`OpenAI transcription configured: ${process.env.OPENAI_API_KEY ? 'yes' : 'no'}`);
});
