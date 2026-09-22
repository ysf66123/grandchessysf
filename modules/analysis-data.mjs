import {openingKey, pvMoves} from './analysis-core.mjs?v=20260923d';
let openingPromise;
export async function loadOpenings() {
    if (!openingPromise) openingPromise = fetch('./vendor/openings.json').then(r=> {
        if (!r.ok) throw Error('Açılış verisi yüklenemedi');
        return r.json();
    }).catch(()=>null);
    return openingPromise;
}
export function normalizedOpeningKey(game) {
    const fields = game.fen().split(' ');
    if (fields[3] !== '-' && !game.moves({verbose:true}).some(m=>m.flags.includes('e'))) fields[3] = '-';
    return openingKey(fields.join(' '));
}
const tableCache = new Map();
let disabledUntil = 0;
export async function tablebase(game) {
    const fen = game.fen();
    if (fen.split(' ')[2] !== '-' || (fen.split(' ')[0].match(/[a-z]/gi)||[]).length > 7 || game.game_over()) return null;
    // The service has no repetition history. Do not claim an exact result for a
    // position reached without an irreversible move since earlier game history.
    if (Number(fen.split(' ')[4]) > 0 && game.history().length > 0) return null;
    if (tableCache.has(fen)) return tableCache.get(fen);
    if (Date.now() < disabledUntil) return null;
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),1800);
    try {
        const response = await fetch('https://tablebase.lichess.ovh/standard?fen='+encodeURIComponent(fen),{signal:controller.signal});
        if (response.status === 429) disabledUntil = Date.now()+60000;
        if (!response.ok) return null;
        const data = await response.json();
        if (!['win','draw','loss','cursed-win','blessed-loss'].includes(data.category)) return null;
        if (!data.moves?.length) return null;
        tableCache.set(fen,data);
        if (tableCache.size > 256) tableCache.delete(tableCache.keys().next().value);
        return data;
    } catch { return null; } finally { clearTimeout(timer); }
}
export function tableExpected(category) {
    return category === 'win' ? 1 : category === 'loss' ? 0 :
        ['draw','cursed-win','blessed-loss'].includes(category) ? 0.5 : null;
}
export function explanation(Chess, review) {
    if (!review) return 'Bu hamle henüz incelenmedi.';
    const best = pvMoves(Chess,review.beforeFen,review.bestPv).slice(0,6);
    const reply = pvMoves(Chess,review.playedFen,review.playedPv?.slice(1)).slice(0,4);
    const fmt = line => line.map(m=>m.san).join(' ');
    let text;
    if (review.mateAfter != null && review.mateAfter <= 0) text = 'Bu devamda rakibin zorunlu matı var.';
    else if (review.mateBefore > 0 && !(review.mateAfter > 0)) text = 'Motorun bulduğu zorunlu mat devamı kaçtı.';
    else if (review.category === 'brilliant') text = 'Motor devamında verilen taşın ardından materyal eksikliği sürüyor, ancak konumun değerlendirmesi korunuyor.';
    else if (review.category === 'great') text = 'İncelenen alternatifler arasında sonucu koruyan tek güçlü seçenek.';
    else if (review.category === 'book') text = 'Açılış veritabanında kayıtlı bir konuma ulaşıldı.';
    else if (review.loss < 0.02) text = 'Hamle, motorun en iyi devamına yakın bir değerlendirmeyi koruyor.';
    else text = 'Stockfish karşılaştırmasında bu hamle daha zayıf. Dönüştürülmüş değerlendirme kaybı ' + (review.loss*100).toFixed(1) + ' yüzde puan.';
    if (review.bestMove !== review.playedUci && best.length) text += ' Daha güçlü devam: ' + fmt(best) + '.';
    const capture = reply.find(m=>m.captured);
    if (capture && review.loss >= 0.02) text += ' Rakibin devamında ' + capture.san + ' ile taş alımı var.';
    else if (reply.length && review.loss >= 0.02) text += ' Rakibin yanıtı: ' + fmt(reply) + '.';
    if (review.tablebase) text += ' Ek oyun sonu verisi Syzygy’den alındı; bu hamlenin notu Stockfish hesabına dayanıyor.';
    if (!review.complete || review.stable===false) text += ' Geçici karar: daha derin hesaplama etiketi değiştirebilir.';
    return text;
}
