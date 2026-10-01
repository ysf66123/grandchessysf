// Verified against Chess.com's public tr_TR translation bundle, 1 October 2026.
// Category rules remain our transparent Stockfish rules, not proprietary CAPS2.
export const MOVE_CATEGORY_META={
 brilliant:{tag:'!!',tr:'Harika',en:'Brilliant',color:'#1baca6'},
 great:{tag:'!',tr:'Çok iyi',en:'Great Move',color:'#5c8bb0'},
 best:{tag:'★',tr:'En İyi Hamle',en:'Best Move',color:'#96bc4b'},
 excellent:{tag:'👍',tr:'Mükemmel',en:'Excellent',color:'#96bc4b'},
 good:{tag:'✓',tr:'İyi',en:'Good',color:'#96af8b'},
 book:{tag:'▤',tr:'Kitap',en:'Book',color:'#b39a78'},
 inaccuracy:{tag:'?!',tr:'Yanlışlık',en:'Inaccuracy',color:'#f7c631'},
 mistake:{tag:'?',tr:'Hata',en:'Mistake',color:'#ffa500'},
 miss:{tag:'✕',tr:'Kaçırılan hamle',en:'Miss',color:'#ff7763'},
 blunder:{tag:'??',tr:'Büyük Hata',en:'Blunder',color:'#fa412d'},
 unrated:{tag:'…',tr:'Yetersiz veri',en:'Unrated',color:'#7d858d'}
};
const paths={
 best:'<path d="m12 3 2.7 5.6 6.2.9-4.5 4.4 1.1 6.2-5.5-2.9-5.5 2.9 1.1-6.2L3.6 9.5l6.2-.9Z"/>',
 excellent:'<path d="M4 11h3v10H4zM9 11l4-7c.7-1.2 2.5-.5 2.2 1L14.5 10H19a2 2 0 0 1 2 2.4l-1.4 6.7A2.4 2.4 0 0 1 17.3 21H9Z"/>',
 good:'<path d="m4.5 12 5 5L20 6.5" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
 book:'<path d="M3 5c3-1 5-.5 8 1v15c-3-1.5-5-2-8-1zm10 1c3-1.5 5-2 8-1v15c-3-1-5-.5-8 1z"/>',
 miss:'<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="white" stroke-width="4" stroke-linecap="square"/>'
};
export function categorySvg(category){
 const m=MOVE_CATEGORY_META[category]||MOVE_CATEGORY_META.unrated;
 const symbol=paths[category]||`<text x="12" y="17.8" text-anchor="middle" font-family="Arial,sans-serif" font-size="${m.tag.length>1?16:19}" font-weight="900">${m.tag}</text>`;
 return `<svg class="review-category-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="12" fill="${m.color}"/><g fill="white">${symbol}</g></svg>`;
}
