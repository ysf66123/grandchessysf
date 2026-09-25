import {ageInDays} from './wild-rift-quality.mjs?v=20260925-counters2';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={wildriftfire:'WildRiftFire',wrmeta:'WR-META',wildriftcore:'WildRiftCore'};
const date=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleDateString('tr-TR'):'Belirtilmemiş';
function link(v){try{const u=new URL(v);return u.protocol==='https:'&&['www.wildriftfire.com','wr-meta.com','wildriftcore.com'].includes(u.hostname)?esc(u.href):'#';}catch{return '#';}}
const signed=n=>n>0?'+'+n:String(n);
export function counterSummary(r){return `<div class="wr-counter-parts" aria-label="Öneri katkıları"><span>Koridor <b>${signed(r.parts.lane)}</b></span><span>Rakip takım / ihtiyaç <b>${signed(r.parts.composition)}</b></span><span>Takım uyumu <b>${signed(r.parts.synergy)}</b></span>${r.duo.active?`<span>İkiye iki <b>${r.duo.complete?signed(r.parts.duo):'Eksik seçim'}</b></span>`:''}</div>`;}
export function counterProof(r){
 const status={advantage:'Kaynakta avantajlı',disadvantage:'Kaynakta zor eşleşme',skill:'Beceriye bağlı',conflict:'Çelişen değerlendirmeler',missing:'Doğrudan veri yok'};
 return `<div class="wr-counter-proof">${r.matchups.filter(m=>m.enemy).map(m=>`<p><b>${esc(m.enemy.name)}:</b> ${status[m.status]}. ${m.families} kaynak grubu.</p><ul>${m.sources.map(s=>`<li><a href="${link(s.url)}" target="_blank" rel="noopener noreferrer">${names[s.source]||esc(s.source)} ↗</a> · ${s.direction>0?'Avantaj':s.direction<0?'Dezavantaj':'Beceriye bağlı'}${s.strength==='hard'?' · Güçlü kaynak değerlendirmesi':''}<br>Yama ${esc(s.patch)} · Kontrol ${date(s.checkedAt)} · İçerik güncellemesi ${date(s.updatedAt)}</li>`).join('')}</ul>`).join('')}
 <p>Kaynak grupları istatistiksel bağımsızlık garantisi değildir. Rehber görüşleri maç örneklemi yerine geçmez.</p>
 ${r.duo.active?`<p>İkiye iki: ${r.duo.complete?'Partner ve iki rakip değerlendirildi; dört şampiyona özel maç istatistiği yok.':'Eksik veya belirsiz seçim nedeniyle katkı uygulanmadı.'}</p>`:''}
 <p>Mekanik çıkarım: ${signed(r.parts.mechanics)}. Bu katkı mevcut şampiyon özelliklerine dayanan sınırlı bir kuraldır.</p>
 <ul>${r.mechanical.phases.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
}

export function counterCoverage(data){
 const state=data.counterSources;if(!state)return '';
 const count=data.champions.filter(c=>{const p=state.pages?.[c.id];return p?.status==='available'&&p.patch===data.latestPatch.version&&p.count>0&&ageInDays(p.checkedAt)<=7;}).length;
 return `<p class="wr-muted wr-counter-coverage">WildRiftCore: ${count}/${data.champions.length} şampiyonun kaynak rehberi doğrulandı. Bu kapsam, her şampiyon çifti için veri bulunduğu anlamına gelmez.</p>`;
}
