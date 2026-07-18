const express = require('express');
const path = require('path');
const app = express();
const port = 3000;
const host = '0.0.0.0';

const MAX_AUDIO_BYTES = Number(process.env.SOLO_STT_MAX_BYTES || 6 * 1024 * 1024);
const OPENAI_TRANSCRIBE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') + '/audio/transcriptions';
const STT_MODEL = process.env.SOLO_STT_MODEL || 'gpt-4o-mini-transcribe';

function getAudioFilename(contentType) {
    if (contentType.includes('mp4')) return 'solo-command.mp4';
    if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'solo-command.mp3';
    if (contentType.includes('wav')) return 'solo-command.wav';
    if (contentType.includes('ogg')) return 'solo-command.ogg';
    return 'solo-command.webm';
}

app.get('/api/solo-stt/health', (req, res) => {
    res.json({
        ok: true,
        configured: !!process.env.OPENAI_API_KEY,
        model: STT_MODEL
    });
});

app.post('/api/solo-stt', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
            ok: false,
            error: 'OPENAI_API_KEY missing. Set it before starting.'
        });
    }

    try {
        const contentType = String(req.headers['content-type'] || 'audio/webm');
        const audio = req.body;
        
        if (!audio || !Buffer.isBuffer(audio) || !audio.length) {
            return res.status(400).json({ ok: false, error: 'Empty audio payload.' });
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
            return res.status(upstream.status).json({
                ok: false,
                error: payload.error && payload.error.message ? payload.error.message : 'Transcription request failed.',
                details: payload
            });
        }

        res.json({
            ok: true,
            text: String(payload.text || '').trim(),
            model: STT_MODEL
        });
    } catch (error) {
        res.status(error.status || 500).json({
            ok: false,
            error: error && error.message ? error.message : 'Transcription failed.'
        });
    }
});

app.get('/api/config', (req, res) => {
    res.json({
        firebaseApiKey: process.env.FIREBASE_API_KEY || ''
    });
});

app.use(express.static(path.join(__dirname, '.')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}`);
});